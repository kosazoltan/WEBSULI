/**
 * JM7b — a játékos-fiók további adatbázis-műveletei (migrations/0040; K1: 0041 tiltás-ujjlenyomat): Google-azonosító,
 * becenév + avatar, tanulói profil összekapcsolása, adatletöltés, fióktörlés, admin-lista és tiltás.
 * A `users` táblába SOHA nem ír (a játékos-fiók szerkezetileg külön; D12) — onnan csak a meglévő admin-tiltást olvassa.
 * Minden versenyhelyzetes lépés atomikus: egyedi index (becenév-kulcs, google_sub, e-mail) vagy tranzakciós advisory-zár.
 */
import type { Pool, PoolClient } from "pg";
import { banFingerprint, playerAuthKey } from "./codes";

type Db = Pick<Pool, "query" | "connect">;

/**
 * K1 (#471 review): a TÖRLÉS és MINDEN fiók-létrehozási út (kód, link, Google) közös, címenkénti zárja — a kanonizált cím
 * ujjlenyomatára vett tranzakciós advisory-zár. Így egy párhuzamos létrehozás megvárja a törlés commitját, és az ujjlenyomatot a
 * zár UTÁN, friss pillanatképből olvassa (READ COMMITTED: minden utasítás új pillanatképet lát). A sorrend mindenütt:
 * előbb ez a zár, csak utána sorzár / INSERT — különben holtpont lehetne.
 */
export async function lockBanAddress(client: Pick<PoolClient, "query">, fingerprint: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 7041))`, [fingerprint]);
}

/** K1: a törölt-tiltott bejegyzés rövid hivatkozása (az ujjlenyomat első hexa jegyei; a teljes ujjlenyomat nem megy ki). */
export const DELETED_BAN_REF_LENGTH = 16;
export type DeletedBanRow = { ref: string; bannedAt: Date; deletedAt: Date };

async function inTransaction<T>(pool: Pick<Pool, "connect">, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // A ROLLBACK hibája nem takarhatja el az eredeti hibát; a kapcsolatot a release eldobja.
    await client.query("ROLLBACK").catch((rollbackError: unknown) => { void rollbackError; });
    throw error;
  } finally {
    client.release();
  }
}

const isUniqueViolation = (error: unknown, constraint?: string) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23505"
  && (!constraint || (error as { constraint?: string }).constraint === constraint);

/** A tiltás egységes kifejezése (saját `banned_at` vagy a meglévő admin-tiltás ugyanarra a címre). */
const BANNED_SQL = `(p.banned_at IS NOT NULL OR EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = p.email AND u.is_banned))`;

export type AccountView = {
  id: string; email: string; nickname: string | null; avatarKey: string | null; googleLinked: boolean;
  learnerLinked: boolean; createdAt: Date; banned: boolean;
};

export type GoogleUpsert = { kind: "OK"; id: string; banned: boolean } | { kind: "CONFLICT" };
export type LinkResult = "OK" | "TAKEN";
export type ProfileResult = "OK" | "NICKNAME_TAKEN" | "NOT_FOUND";
export type DeleteResult = { account: number; codes: number; sessions: number } | null;

export type AdminPlayerRow = {
  id: string; email: string; nickname: string | null; avatarKey: string | null; createdAt: Date; lastSeenAt: Date | null;
  banned: boolean; bannedAt: Date | null; googleLinked: boolean; learnerLinked: boolean;
};

export type PlayerAccountStore = ReturnType<typeof createPlayerAccountStore>;

export function createPlayerAccountStore(pool: Db) {
  async function bannedById(id: string, client: Pick<Pool, "query"> = pool): Promise<boolean> {
    const { rows } = await client.query<{ banned: boolean }>(`SELECT ${BANNED_SQL} AS banned FROM player_accounts p WHERE p.id = $1`, [id]);
    return rows[0]?.banned === true;
  }

  return {
    /**
     * A játékos Google-útja (google.ts): a Google által MEGERŐSÍTETT, normalizált címből és a Google-azonosítóból (`sub`)
     * játékos-fiók. 1) Ismert `sub` → az a fiók (a címét nem írjuk át). 2) Különben a címre upsert: új fiók, vagy a meglévő
     * (e-mailes kóddal létrehozott) fiókhoz a `sub` hozzárendelése — de csak ha még nincs más `sub`-ja (különben CONFLICT).
     * A Google-profil neve, képe NEM tárolódik. A `users` táblát nem érinti.
     */
    async upsertGooglePlayer(sub: string, emailNormalized: string): Promise<GoogleUpsert> {
      for (let attempt = 0; attempt < 2; attempt++) {
        const known = await pool.query<{ id: string }>(`SELECT id FROM player_accounts WHERE google_sub = $1`, [sub]);
        if (known.rows[0]) return { kind: "OK", id: known.rows[0].id, banned: await bannedById(known.rows[0].id) };
        try {
          const fingerprint = banFingerprint(playerAuthKey(), emailNormalized);
          const row = await inTransaction(pool, async (client) => {
            // K1 (#471 review): a címenkénti zár UTÁN, friss pillanatképből; az ÚJ fiók az ujjlenyomatról örökli a tiltást
            // (meglévő sort nem érint).
            await lockBanAddress(client, fingerprint);
            const { rows } = await client.query<{ id: string; google_sub: string | null }>(
              `INSERT INTO player_accounts (email, email_verified_at, google_sub, banned_at)
                 VALUES ($1, now(), $2, (SELECT banned_at FROM player_ban_fingerprints WHERE fingerprint = $3))
               ON CONFLICT (email) DO UPDATE
                 SET google_sub = COALESCE(player_accounts.google_sub, EXCLUDED.google_sub),
                     email_verified_at = COALESCE(player_accounts.email_verified_at, now())
               RETURNING id, google_sub`,
              [emailNormalized, sub, fingerprint],
            );
            return rows[0]!;
          });
          if (row.google_sub !== sub) return { kind: "CONFLICT" };
          return { kind: "OK", id: row.id, banned: await bannedById(row.id) };
        } catch (error) {
          // Párhuzamos első belépés ugyanazzal a `sub`-bal (más címmel): a másik nyert — újraolvasás.
          if (isUniqueViolation(error, "player_accounts_google_sub_unique") && attempt === 0) continue;
          throw error;
        }
      }
      return { kind: "CONFLICT" };
    },

    async getAccount(id: string): Promise<AccountView | null> {
      const { rows } = await pool.query<{
        id: string; email: string; nickname: string | null; avatar_key: string | null; google: boolean; learner: boolean; created_at: Date; banned: boolean;
      }>(
        `SELECT p.id, p.email, p.nickname, p.avatar_key, (p.google_sub IS NOT NULL) AS google, (p.linked_learner_id IS NOT NULL) AS learner,
                p.created_at, ${BANNED_SQL} AS banned
           FROM player_accounts p WHERE p.id = $1`,
        [id],
      );
      const r = rows[0];
      return r ? { id: r.id, email: r.email, nickname: r.nickname, avatarKey: r.avatar_key, googleLinked: r.google, learnerLinked: r.learner, createdAt: r.created_at, banned: r.banned } : null;
    },

    async isNicknameKeyFree(key: string, exceptId?: string): Promise<boolean> {
      const { rows } = await pool.query(`SELECT 1 FROM player_accounts WHERE nickname_key = $1 AND id IS DISTINCT FROM $2`, [key, exceptId ?? null]);
      return rows.length === 0;
    },

    /**
     * Becenév és / vagy avatar. A foglaltságot az EGYEDI `nickname_key` index dönti el (két párhuzamos kérésből az egyik
     * `NICKNAME_TAKEN`); a saját, változatlan kulcs nem ütközik.
     */
    async setProfile(id: string, input: { nickname?: { value: string; key: string }; avatarKey?: string }): Promise<ProfileResult> {
      const sets: string[] = [];
      const params: unknown[] = [id];
      if (input.nickname) {
        params.push(input.nickname.value, input.nickname.key);
        sets.push(`nickname = $${params.length - 1}`, `nickname_key = $${params.length}`);
      }
      if (input.avatarKey !== undefined) {
        params.push(input.avatarKey);
        sets.push(`avatar_key = $${params.length}`);
      }
      if (sets.length === 0) return "OK";
      try {
        const r = await pool.query(`UPDATE player_accounts SET ${sets.join(", ")} WHERE id = $1`, params);
        return (r.rowCount ?? 0) === 1 ? "OK" : "NOT_FOUND";
      } catch (error) {
        if (isUniqueViolation(error, "player_accounts_nickname_key_unique")) return "NICKNAME_TAKEN";
        throw error;
      }
    },

    /**
     * Tanulói profil összekapcsolása (a hívó előbb a tanulói tokent ellenőrizte). Egy tanulói profil legfeljebb EGY
     * játékos-fiókhoz tartozhat: a tanuló azonosítójára vett tranzakciós zár alatt — így két párhuzamos kérésből sem lesz
     * kettős kapcsolat (egyedi index nélkül, új migráció nélkül).
     */
    async linkLearner(playerId: string, learnerId: string): Promise<LinkResult> {
      return inTransaction(pool, async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 7041))`, [learnerId]);
        const other = await client.query(`SELECT 1 FROM player_accounts WHERE linked_learner_id = $1 AND id <> $2`, [learnerId, playerId]);
        if (other.rows.length > 0) return "TAKEN";
        await client.query(`UPDATE player_accounts SET linked_learner_id = $2 WHERE id = $1`, [playerId, learnerId]);
        return "OK";
      });
    },

    async unlinkLearner(playerId: string): Promise<void> {
      await pool.query(`UPDATE player_accounts SET linked_learner_id = NULL WHERE id = $1`, [playerId]);
    },

    /**
     * A saját adatok (adatletöltéshez) — review #449 (A2): ENGEDÉLYLISTÁS mezők, belső azonosító NÉLKÜL (nincs fiók-, Google-,
     * tanulói azonosító, nincs foglaltsági kulcs); a tanulói kapcsolatról csak annyi, hogy van-e.
     */
    async exportAccount(id: string, emailHashesOf: (email: string) => string[]): Promise<Record<string, unknown> | null> {
      const { rows } = await pool.query<{
        email: string; email_verified_at: Date | null; nickname: string | null; avatar_key: string | null; google: boolean; learner: boolean;
        banned_at: Date | null; created_at: Date; last_seen_at: Date | null;
      }>(
        `SELECT email, email_verified_at, nickname, avatar_key, (google_sub IS NOT NULL) AS google, (linked_learner_id IS NOT NULL) AS learner,
                banned_at, created_at, last_seen_at
           FROM player_accounts WHERE id = $1`,
        [id],
      );
      const r = rows[0];
      if (!r) return null;
      const codes = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM player_auth_codes WHERE email_hash = ANY($1::text[])`, [emailHashesOf(r.email)]);
      return {
        account: {
          email: r.email, emailVerifiedAt: r.email_verified_at, nickname: r.nickname, avatar: r.avatar_key,
          googleLinked: r.google, learnerProfileLinked: r.learner, bannedAt: r.banned_at, createdAt: r.created_at, lastSeenAt: r.last_seen_at,
        },
        loginCodes: { count: Number(codes.rows[0]!.n), note: "Egyszer használható belépőkódok — csak titkosított ujjlenyomatként tároljuk, 24 óra után törlődnek." },
      };
    },

    /**
     * Fióktörlés egy tranzakcióban: (1) a fiók e-mail-címéhez tartozó belépőkód-rekordok, (2) a fiók MINDEN munkamenete
     * (más eszközön is), (3) maga a fiók. A hivatkozó táblák (JM8+: pontkönyv) `ON DELETE CASCADE`-del követik; a tanulói
     * profil (`learners`) NEM törlődik — csak a kapcsolat szűnik meg. Nincs ilyen fiók → null.
     */
    async deleteAccount(id: string, emailHashesOf: (email: string) => string[]): Promise<DeleteResult> {
      return inTransaction(pool, async (client) => {
        // K1 (#471 review): előbb a címenkénti zár (a cím a fiók élete alatt nem változik), csak utána a sorzár.
        const pre = await client.query<{ email: string }>(`SELECT email FROM player_accounts WHERE id = $1`, [id]);
        if (pre.rows[0] === undefined) return null;
        await lockBanAddress(client, banFingerprint(playerAuthKey(), pre.rows[0].email));
        const found = await client.query<{ email: string; banned_at: Date | null }>(`SELECT email, banned_at FROM player_accounts WHERE id = $1 FOR UPDATE`, [id]);
        const email = found.rows[0]?.email;
        if (email === undefined) return null;
        // K1: TILTOTT fióknál (saját `banned_at`) a cím visszafejthetetlen ujjlenyomata + a tiltás ideje megmarad
        // (`player_ban_fingerprints`), így ugyanerre a címre új fiók csak tiltottként jöhet létre. Nem tiltott: nincs nyom.
        const bannedAt = found.rows[0]!.banned_at;
        if (bannedAt !== null) {
          await client.query(
            `INSERT INTO player_ban_fingerprints (fingerprint, banned_at) VALUES ($1, $2) ON CONFLICT (fingerprint) DO NOTHING`,
            [banFingerprint(playerAuthKey(), email), bannedAt],
          );
        }
        const codes = await client.query(`DELETE FROM player_auth_codes WHERE email_hash = ANY($1::text[])`, [emailHashesOf(email)]);
        const sessions = await client.query(`DELETE FROM session WHERE sess -> 'player' ->> 'id' = $1`, [id]);
        const account = await client.query(`DELETE FROM player_accounts WHERE id = $1`, [id]);
        return { account: account.rowCount ?? 0, codes: codes.rowCount ?? 0, sessions: sessions.rowCount ?? 0 };
      });
    },

    /** Admin „Játékosok” lista (a hívó maszkolja a címet a válaszban). Keresés becenévre (részlet, kis-/nagybetű nélkül). */
    async listPlayers(opts: { q?: string; limit?: number } = {}): Promise<AdminPlayerRow[]> {
      const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
      const q = opts.q?.trim() ? `%${opts.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      const { rows } = await pool.query<{
        id: string; email: string; nickname: string | null; avatar_key: string | null; created_at: Date; last_seen_at: Date | null;
        banned: boolean; banned_at: Date | null; google: boolean; learner: boolean;
      }>(
        `SELECT p.id, p.email, p.nickname, p.avatar_key, p.created_at, p.last_seen_at, ${BANNED_SQL} AS banned, p.banned_at,
                (p.google_sub IS NOT NULL) AS google, (p.linked_learner_id IS NOT NULL) AS learner
           FROM player_accounts p
          WHERE $1::text IS NULL OR p.nickname ILIKE $1
          ORDER BY p.created_at DESC
          LIMIT $2`,
        [q, limit],
      );
      return rows.map((r) => ({
        id: r.id, email: r.email, nickname: r.nickname, avatarKey: r.avatar_key, createdAt: r.created_at, lastSeenAt: r.last_seen_at,
        banned: r.banned, bannedAt: r.banned_at, googleLinked: r.google, learnerLinked: r.learner,
      }));
    },

    async playerEmailById(id: string): Promise<string | null> {
      const { rows } = await pool.query<{ email: string }>(`SELECT email FROM player_accounts WHERE id = $1`, [id]);
      return rows[0]?.email ?? null;
    },

    /** Tiltás / feloldás. A már belépett játékosra is AZONNAL hat: a `requirePlayer` minden kérésnél újraolvassa. */
    async setBanned(id: string, banned: boolean): Promise<boolean> {
      const r = await pool.query<{ email: string }>(
        `UPDATE player_accounts SET banned_at = CASE WHEN $2 THEN COALESCE(banned_at, now()) ELSE NULL END WHERE id = $1 RETURNING email`,
        [id, banned],
      );
      // K1: a feloldás a cím (esetleg korábbi törlésből maradt) tiltás-ujjlenyomatát is törli.
      if (!banned && r.rows[0]) {
        await pool.query(`DELETE FROM player_ban_fingerprints WHERE fingerprint = $1`, [banFingerprint(playerAuthKey(), r.rows[0].email)]);
      }
      return (r.rowCount ?? 0) === 1;
    },

    /**
     * K1: a „törölt, de tiltva maradt” bejegyzések az adminnak — CÍM ÉS MASZK NÉLKÜL (a maszk is részleges azonosító): rövid
     * hivatkozás az ujjlenyomat elejéből, a tiltás és a törlés ideje.
     */
    async listDeletedBans(): Promise<DeletedBanRow[]> {
      const { rows } = await pool.query<{ fingerprint: string; banned_at: Date; created_at: Date }>(
        `SELECT fingerprint, banned_at, created_at FROM player_ban_fingerprints ORDER BY created_at DESC LIMIT 500`,
      );
      return rows.map((r) => ({ ref: r.fingerprint.slice(0, DELETED_BAN_REF_LENGTH), bannedAt: r.banned_at, deletedAt: r.created_at }));
    },

    /**
     * K1: egy törölt-tiltott bejegyzés feloldása a rövid hivatkozás alapján. #471 review (2.): ugyanabban a tranzakcióban
     * (a címenkénti zár alatt) az AZONOS ujjlenyomatú élő fiókok — a törlés után tiltottként újra létrejött fiók, bármely
     * cím-változattal — tiltása is feloldódik, így nem maradhat olyan állapot, ahol a felület sikert mutat, de a játékos tiltva
     * marad. (Az ujjlenyomat az újralétrehozáskor szándékosan NEM törlődik: különben egy MÁSIK cím-változattal — pl.
     * `a.b@gmail.com` a `ab+x@gmail.com` után — ismét tiltatlan fiók nyílhatna.) Visszaadja: [ujjlenyomat, élő fiók] darabszám.
     */
    async unbanDeleted(ref: string): Promise<{ entries: number; accounts: number }> {
      return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ fingerprint: string }>(
          `SELECT fingerprint FROM player_ban_fingerprints WHERE left(fingerprint, $2) = $1`, [ref, DELETED_BAN_REF_LENGTH],
        );
        let accounts = 0;
        const key = playerAuthKey();
        for (const { fingerprint } of rows) {
          await lockBanAddress(client, fingerprint);
          await client.query(`DELETE FROM player_ban_fingerprints WHERE fingerprint = $1`, [fingerprint]);
          // A tiltott élő fiókok kevesen vannak: az ujjlenyomatot itt számoljuk (a cím nem kerül ki a szerverről).
          const banned = await client.query<{ id: string; email: string }>(`SELECT id, email FROM player_accounts WHERE banned_at IS NOT NULL`);
          const ids = banned.rows.filter((r) => banFingerprint(key, r.email) === fingerprint).map((r) => r.id);
          if (ids.length > 0) {
            const u = await client.query(`UPDATE player_accounts SET banned_at = NULL WHERE id = ANY($1::varchar[])`, [ids]);
            accounts += u.rowCount ?? 0;
          }
        }
        return { entries: rows.length, accounts };
      });
    },
  };
}
