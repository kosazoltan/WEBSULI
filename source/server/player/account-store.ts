/**
 * JM7b — a játékos-fiók további adatbázis-műveletei (migrations/0040; K1: 0041 tiltás-ujjlenyomat): Google-azonosító,
 * becenév + avatar, tanulói profil összekapcsolása, adatletöltés, fióktörlés, admin-lista és tiltás.
 * A `users` táblába SOHA nem ír (a játékos-fiók szerkezetileg külön; D12) — onnan csak a meglévő admin-tiltást olvassa.
 * Minden versenyhelyzetes lépés atomikus: egyedi index (becenév-kulcs, google_sub, e-mail) vagy tranzakciós advisory-zár.
 */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { banFingerprint, banKeyId, banRetentionMonths, limitKey, playerBanKey } from "./codes";

type Db = Pick<Pool, "query" | "connect">;

/**
 * K1b (#475 review, „A + B” terv) — a tiltás két külön esete:
 *  (A) ÉLŐ tiltott fiók: az EGYETLEN igazságforrás a fiók `banned_at` mezője. Az alias-kijátszás ellen fiók-létrehozáskor /
 *      belépéskor a kanonikus cím (`limitKey`: kisbetű, gmail-pont, `+alias`, googlemail) KÖZVETLEN összevetése a tiltott élő
 *      fiókokkal; tiltáskor / feloldáskor az azonos postafiókú élő fiókok együtt. Nincs ujjlenyomat, nincs kulcs, nincs
 *      helyreállítás.
 *  (B) TÖRÖLT tiltott fiók: a cím már nincs meg → CSAK itt kulcsolt ujjlenyomat (`player_ban_fingerprints`, `key_id`-vel), a
 *      törlés pillanatában; a 12 hónapos takarító törli; feloldás = a sor törlése. Kulcsváltáskor a régi sorok dokumentáltan
 *      nem illenek — SEMMI nem töröl kulcs alapján, csak a darabszámuk naplózódik. A kulcs: `PLAYER_BAN_KEY` (visszaesés a
 *      `SESSION_SECRET`-ből levezetettre).
 * Zár: minden címet ismerő művelet a KULCSFÜGGETLEN kanonikus címzárat veszi (a kanonikus cím sima SHA-256-ja — titok nélkül,
 * így eltérő titkú példányok is ugyanazt a zárat kapják; a zár-kulcs nem tárolódik), MINDEN más zár / sorzár / INSERT ELŐTT.
 */
export function banLockKey(normalizedEmail: string): string {
  return createHash("sha256").update(`ban-lock:${limitKey(normalizedEmail)}`).digest("hex");
}

export async function lockBanCanonical(client: Pick<PoolClient, "query">, normalizedEmail: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 7042))`, [banLockKey(normalizedEmail)]);
}

/** (A) Az azonos kanonikus című élő fiókok (a címet csak itt, az alkalmazásban kanonizáljuk; `onlyBanned`: csak a tiltottak). */
async function canonicalVariantIds(client: Pick<PoolClient, "query">, normalizedEmail: string, onlyBanned: boolean): Promise<string[]> {
  const want = limitKey(normalizedEmail);
  const { rows } = await client.query<{ id: string; email: string }>(
    `SELECT id, email FROM player_accounts${onlyBanned ? " WHERE banned_at IS NOT NULL" : ""}`,
  );
  return rows.filter((r) => limitKey(r.email) === want).map((r) => r.id);
}

/**
 * (A) Fiók-létrehozáskor / belépéskor (a kanonikus címzár alatt): egy azonos postafiókú TILTOTT élő fiók azonosítója (a tiltott
 * fiókok kis halmazán — nincs teljes bejárás), vagy null. A tiltás idejét a hívó SQL-ben veszi át a sorából.
 */
export async function bannedVariantId(client: Pick<PoolClient, "query">, normalizedEmail: string): Promise<string | null> {
  const ids = await canonicalVariantIds(client, normalizedEmail, true);
  return ids[0] ?? null;
}

/**
 * (B) Fiók-létrehozáskor (a kanonikus címzár alatt, az INSERT ELŐTT): a törölt-tiltott sor `FOR SHARE` olvasása — egy
 * párhuzamos törölt-tiltott feloldással (sorzáras DELETE) így sorosodik (#475 ellenőrző kör, Ú-a). A tiltás idejét a hívó
 * INSERT-je a saját, új pillanatképéből veszi át (mikroszekundumra pontosan).
 */
export async function lockDeletedBanRow(client: Pick<PoolClient, "query">, fingerprint: string): Promise<void> {
  await client.query(`SELECT 1 FROM player_ban_fingerprints WHERE fingerprint = $1 FOR SHARE`, [fingerprint]);
}

/** (B) A törölt, tiltott fiók címének ujjlenyomata (a tiltás-kulccsal). */
export function deletedBanFingerprint(normalizedEmail: string): string {
  return banFingerprint(playerBanKey(), normalizedEmail);
}

/**
 * (B) A más kulccsal készült ujjlenyomatok száma — a takarító csak naplózza (SEMMIT nem töröl kulcs alapján): egy eltérő titkú
 * példány vagy egy kulcsváltás így nem semmisíthet meg megőrzött tiltást.
 */
export async function countForeignBanKeys(pool: Pick<Pool, "query">): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM player_ban_fingerprints WHERE key_id <> $1`, [banKeyId(playerBanKey())]);
  return Number(rows[0]!.n);
}

/**
 * K1b (Ú1): a tiltás-karbantartás (eltérő kulcsú sorok számlálása + megőrzés-takarítás) CSAK élesben (`NODE_ENV=production`)
 * vagy kifejezett kapcsolóval (`PLAYER_BAN_MAINTENANCE=on`) fut — egy helyi indítás (akár az éles adatbázissal) nem nyúl hozzá.
 */
export function banMaintenanceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.PLAYER_BAN_MAINTENANCE ?? "").trim().toLowerCase();
  if (flag === "off") return false;
  return env.NODE_ENV === "production" || flag === "on";
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
        const known = await pool.query<{ id: string; email: string; banned_at: Date | null }>(`SELECT id, email, banned_at FROM player_accounts WHERE google_sub = $1`, [sub]);
        // K1b (A): az ismert azonosítós belépés a fiók `banned_at`-jét olvassa — nincs ujjlenyomat, nincs helyreállítás; a kanonikus
        // címzár UTÁN, hogy egy közben commitolt tiltás / feloldás állapotát lássa.
        if (known.rows[0]) {
          const k = known.rows[0];
          const banned = await inTransaction(pool, async (client) => {
            await lockBanCanonical(client, k.email);
            return bannedById(k.id, client);
          });
          return { kind: "OK", id: k.id, banned };
        }
        try {
          const row = await inTransaction(pool, async (client) => {
            // K1b: a kanonikus címzár UTÁN, friss pillanatképből. Új fiók: (A) egy azonos postafiókú TILTOTT élő fiók, vagy
            // (B) egy törölt tiltott fiók ujjlenyomata → tiltottként jön létre. Meglévő fiók: csak (A) (az ujjlenyomat nem írja
            // vissza egy feloldott fiók tiltását).
            await lockBanCanonical(client, emailNormalized);
            const variant = await bannedVariantId(client, emailNormalized);
            await lockDeletedBanRow(client, deletedBanFingerprint(emailNormalized));
            const { rows } = await client.query<{ id: string; google_sub: string | null }>(
              `INSERT INTO player_accounts (email, email_verified_at, google_sub, banned_at)
                 VALUES ($1, now(), $2, COALESCE((SELECT banned_at FROM player_accounts WHERE id = $3::varchar),
                                                 (SELECT banned_at FROM player_ban_fingerprints WHERE fingerprint = $4)))
               ON CONFLICT (email) DO UPDATE
                 SET google_sub = COALESCE(player_accounts.google_sub, EXCLUDED.google_sub),
                     email_verified_at = COALESCE(player_accounts.email_verified_at, now()),
                     banned_at = COALESCE(player_accounts.banned_at, (SELECT banned_at FROM player_accounts WHERE id = $3::varchar))
               RETURNING id, google_sub`,
              [emailNormalized, sub, variant, deletedBanFingerprint(emailNormalized)],
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
      // Adventi naptár (migrations/0042): a fiók saját előrehaladása — belső azonosító nélkül; a megoldott ablakok a legutóbbi körből.
      const advent = await pool.query<{ season: number; grade: number | null; round: number; finished_at: Date | null; passed_at: Date | null; doors: Record<string, Record<string, { attempts?: Array<{ correct?: boolean }> }>> | null }>(
        // A tanulóhoz kötött fiók a tanuló naptárát játssza (a sor a tanulóhoz tartozik) — az adatletöltés azt is tartalmazza (E19).
        `SELECT season, grade, round, finished_at, passed_at, doors FROM advent_progress
          WHERE player_id = $1 OR learner_id = (SELECT linked_learner_id FROM player_accounts WHERE id = $1)
          ORDER BY season`,
        [id],
      );
      return {
        adventCalendar: advent.rows.map((a) => {
          const current = Object.values(a.doors?.[String(a.round)] ?? {});
          return {
            season: a.season, grade: a.grade, round: a.round, finishedAt: a.finished_at, passedAt: a.passed_at,
            answeredDoors: current.filter((d) => (d.attempts?.length ?? 0) > 0).length,
            solvedDoors: current.filter((d) => d.attempts?.some((t) => t.correct === true)).length,
          };
        }),
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
        await lockBanCanonical(client, pre.rows[0].email);
        const found = await client.query<{ email: string; banned_at: Date | null }>(`SELECT email, banned_at FROM player_accounts WHERE id = $1 FOR UPDATE`, [id]);
        const email = found.rows[0]?.email;
        if (email === undefined) return null;
        // K1: TILTOTT fióknál (saját `banned_at`) a cím visszafejthetetlen ujjlenyomata + a tiltás ideje megmarad
        // (`player_ban_fingerprints`), így ugyanerre a címre új fiók csak tiltottként jöhet létre. Nem tiltott: nincs nyom.
        const bannedAt = found.rows[0]!.banned_at;
        if (bannedAt !== null) {
          // (B) a tiltás ideje a fiók sorából, SQL-ben (mikroszekundumra pontosan).
          await client.query(
            `INSERT INTO player_ban_fingerprints (fingerprint, key_id, banned_at)
               SELECT $1, $2, banned_at FROM player_accounts WHERE id = $3
             ON CONFLICT (fingerprint) DO NOTHING`,
            [deletedBanFingerprint(email), banKeyId(playerBanKey()), id],
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
    /**
     * Tiltás / feloldás. A már belépett játékosra is AZONNAL hat: a `requirePlayer` minden kérésnél újraolvassa.
     * K1b (A): a tiltás a KANONIKUS címre szól — a kanonikus címzár alatt az azonos postafiókú (gmail-pont, `+alias`, googlemail)
     * élő fiókok együtt tiltódnak / oldódnak fel; az igazságforrás a `banned_at`. Feloldáskor a cím törölt-tiltott ujjlenyomata
     * (B) is törlődik (és az azonos tiltáshoz tartozó, más kulccsal készült sor — a tiltás idejének pontos egyezésével).
     */
    async setBanned(id: string, banned: boolean): Promise<boolean> {
      return inTransaction(pool, async (client) => {
        const found = await client.query<{ email: string }>(`SELECT email FROM player_accounts WHERE id = $1`, [id]);
        const email = found.rows[0]?.email;
        if (email === undefined) return false;
        await lockBanCanonical(client, email);
        if (banned) {
          const ids = await canonicalVariantIds(client, email, false);
          await client.query(`UPDATE player_accounts SET banned_at = COALESCE(banned_at, now()) WHERE id = ANY($1::varchar[])`, [ids]);
        } else {
          await unbanCanonical(client, email, deletedBanFingerprint(email));
        }
        return true;
      });
    },

    /**
     * K1: a „törölt, de tiltva maradt” bejegyzések az adminnak — csak azok az ujjlenyomatok, amelyekhez NINCS élő fiók (az élő
     * tiltott fiók a rendes listán látszik) —, CÍM ÉS MASZK NÉLKÜL (a maszk is részleges azonosító): rövid hivatkozás az
     * ujjlenyomat elejéből, a tiltás és a bejegyzés ideje.
     */
    async listDeletedBans(): Promise<DeletedBanRow[]> {
      const { rows } = await pool.query<{ fingerprint: string; banned_at: Date; created_at: Date }>(
        // Csak a jelenlegi kulccsal készült sorok: a más kulcsúak nem illenek (dokumentált), a 12 hónapos megőrzés-takarító
        // távolítja el őket.
        `SELECT fingerprint, banned_at, created_at FROM player_ban_fingerprints WHERE key_id = $1 ORDER BY created_at DESC LIMIT 500`,
        [banKeyId(playerBanKey())],
      );
      const live = await liveBannedFingerprints(pool);
      return rows.filter((r) => !live.has(r.fingerprint))
        .map((r) => ({ ref: r.fingerprint.slice(0, DELETED_BAN_REF_LENGTH), bannedAt: r.banned_at, deletedAt: r.created_at }));
    },

    /**
     * K1: egy törölt-tiltott bejegyzés feloldása a rövid hivatkozás alapján — ugyanaz a kanonikus feloldás, mint az élő fióknál:
     * az ujjlenyomat ÉS az azonos postafiókú élő fiókok tiltása egyszerre (a törlés után tiltottként újra létrejött fiók is).
     * Visszaadja: [ujjlenyomat, élő fiók] darabszám.
     */
    async unbanDeleted(ref: string): Promise<{ entries: number; accounts: number }> {
      return inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ fingerprint: string }>(
          `SELECT fingerprint FROM player_ban_fingerprints WHERE left(fingerprint, $2) = $1`, [ref, DELETED_BAN_REF_LENGTH],
        );
        let accounts = 0;
        for (const { fingerprint } of rows) {
          // Ha a törlés után a címmel (bármely változatával) újra létrejött fiók él, az is feloldódik — a kanonikus címzár alatt.
          const live = await liveAccountByFingerprint(client, fingerprint);
          if (live) {
            await lockBanCanonical(client, live);
            accounts += await unbanCanonical(client, live, fingerprint);
            continue;
          }
          // Élő fiók nélkül a kanonikus cím nem ismert (nincs zár-kulcs). #475 ellenőrző kör (Ú-a): a sor törlése SORZÁRAT vesz,
          // a fiók-létrehozás pedig az ujjlenyomatot `FOR SHARE`-rel olvassa (`lockDeletedBanRow`) — így a kettő sorosodik:
          //  - ha a létrehozás olvasott előbb, ez a törlés megvárja a commitját (a fiók tiltottként jött létre), és az utána
          //    következő keresés (új pillanatkép) megtalálja és feloldja;
          //  - ha ez a törlés előbb jár, a létrehozás a commitunkig vár, és már nem látja a sort → tiltatlanul jön létre.
          // A közben megtalált fiók feloldása a kanonikus zár NÉLKÜL történik (egy létrehozó tranzakció a zárát tartva a mi
          // sorzárunkra várhat — holtpont elkerülése); a megtalált fiók már commitolt.
          await client.query(`DELETE FROM player_ban_fingerprints WHERE fingerprint = $1`, [fingerprint]);
          const created = await liveAccountByFingerprint(client, fingerprint);
          if (created) {
            const ids = await canonicalVariantIds(client, created, true);
            if (ids.length > 0) {
              const u = await client.query(`UPDATE player_accounts SET banned_at = NULL WHERE id = ANY($1::varchar[])`, [ids]);
              accounts += u.rowCount ?? 0;
            }
          }
        }
        return { entries: rows.length, accounts };
      });
    },

    /**
     * K1-c: megőrzési idő — a tiltástól számított `banRetentionMonths()` (alap 12) hónapnál régebbi (törölt fiókhoz tartozó)
     * ujjlenyomatok törlése. Az élő fiók tiltása ettől nem jár le (az a `banned_at`-ben él). A takarító hívja.
     */
    async purgeExpiredBanFingerprints(months = banRetentionMonths()): Promise<number> {
      // K1b: az élő tiltás nem ujjlenyomaton múlik (A), így a lejárt sor zár és élő-változat vizsgálat nélkül törölhető —
      // bármely kulcsú (a más kulcsú sorok is innen tűnnek el).
      const r = await pool.query(`DELETE FROM player_ban_fingerprints WHERE banned_at < now() - make_interval(months => $1::int)`, [months]);
      return r.rowCount ?? 0;
    },
  };
}

/** (B) Egy törölt-tiltott ujjlenyomathoz tartozó élő fiók címe (a törlés után újra létrejött), ha van — a tiltás-kulccsal. */
async function liveAccountByFingerprint(client: Pick<PoolClient, "query">, fingerprint: string): Promise<string | null> {
  const { rows } = await client.query<{ email: string }>(`SELECT email FROM player_accounts`);
  const key = playerBanKey();
  return rows.find((r) => banFingerprint(key, r.email) === fingerprint)?.email ?? null;
}

/** Az élő TILTOTT fiókok (B-kulcsú) ujjlenyomatai — a törölt-tiltott listából kiszűrendők (kevés sor). */
async function liveBannedFingerprints(client: Pick<Pool, "query">): Promise<Set<string>> {
  const { rows } = await client.query<{ email: string }>(`SELECT email FROM player_accounts WHERE banned_at IS NOT NULL`);
  const key = playerBanKey();
  return new Set(rows.map((r) => banFingerprint(key, r.email)));
}

/**
 * (A) + (B) kanonikus feloldás a kanonikus címzár alatt: az azonos postafiókú tiltott élő fiókok feloldása, a cím (B) ujjlenyomatának
 * törlése, és az AZONOS tiltáshoz tartozó, más kulccsal készült sor törlése (a tiltás idejének pontos — SQL-ben vett — egyezésével;
 * #475 review: különben egy régi kulcsú példány / visszaállás az új fiókot tiltottként hozná létre). Visszaadja a feloldott fiókokat.
 */
async function unbanCanonical(client: Pick<PoolClient, "query">, normalizedEmail: string, fingerprint: string): Promise<number> {
  const ids = await canonicalVariantIds(client, normalizedEmail, true);
  await client.query(
    `WITH removed AS (DELETE FROM player_ban_fingerprints WHERE fingerprint = $1 RETURNING banned_at),
          times AS (SELECT banned_at FROM removed
                    UNION SELECT banned_at FROM player_accounts WHERE id = ANY($3::varchar[]) AND banned_at IS NOT NULL)
     DELETE FROM player_ban_fingerprints WHERE key_id <> $2 AND banned_at IN (SELECT banned_at FROM times)`,
    [fingerprint, banKeyId(playerBanKey()), ids],
  );
  if (ids.length === 0) return 0;
  const u = await client.query(`UPDATE player_accounts SET banned_at = NULL WHERE id = ANY($1::varchar[])`, [ids]);
  return u.rowCount ?? 0;
}
