/**
 * JM7a — a játékos-fiók és a belépőkódok adatbázis-műveletei (migrations/0040). Minden „egyszer használható” vagy
 * „keretből foglaló” lépés atomikus (sorzár / tranzakciós advisory-zár), így párhuzamos kérésekből sem lesz kettős
 * beváltás, keret-túllépés vagy két fiók. A `users` táblába SOHA nem ír (a játékos-fiók szerkezetileg külön; D12).
 * A nyílt cím (`email_normalized`) beváltáskor és lejáratkor üresre törlődik; a hash-sor a 24 órás korlátokhoz marad,
 * majd az ütemezett takarító törli (sweeper.ts).
 */
import type { Pool, PoolClient } from "pg";
import {
  CODE_RETENTION_MS, CODE_TTL_MS, DAY_MS, LINK_TTL_MS, MAX_CODE_ATTEMPTS, MAX_FAILED_ATTEMPTS_PER_DAY,
  START_PER_EMAIL_DAILY_MAX, START_PER_EMAIL_MAX, START_WINDOW_MS, loginEmailDailyMax,
} from "./codes";

export type CodeInput = { emailNormalized: string; emailHash: string; limitHash: string; codeHash: string; linkHash: string };
const INSERT_CODE_SQL = `INSERT INTO player_auth_codes (email_normalized, email_hash, limit_hash, code_hash, link_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + ($6::int * interval '1 millisecond'))`;
const insertParams = (i: CodeInput) => [i.emailNormalized, i.emailHash, i.limitHash, i.codeHash, i.linkHash, LINK_TTL_MS];
/** A kódkérések globális advisory-zárja (kis forgalom: a sorosítás olcsó, a globális plafon így pontos). */
const START_LOCK_KEY = 704_001;

export type PlayerRow = { id: string; nickname: string | null; banned: boolean };
export type ReserveResult = "OK" | "KEY_LIMIT" | "GLOBAL_LIMIT";
export type ReserveLimits = { perWindow: number; perDay: number; globalPerDay: number };

export type PlayerStore = ReturnType<typeof createPlayerStore>;

async function inTransaction<T>(pool: Pick<Pool, "connect">, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // A ROLLBACK hibája nem takarhatja el az eredeti hibát (azt dobjuk tovább); a kapcsolatot a release eldobja.
    await client.query("ROLLBACK").catch((rollbackError: unknown) => { void rollbackError; });
    throw error;
  } finally {
    client.release();
  }
}

const since = (param: string) => `created_at > now() - (${param}::int * interval '1 millisecond')`;

export function createPlayerStore(pool: Pick<Pool, "query" | "connect">) {
  async function userBannedByEmail(emailNormalized: string): Promise<boolean> {
    const { rows } = await pool.query<{ banned: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = $1 AND is_banned) AS banned`,
      [emailNormalized],
    );
    return rows[0]?.banned === true;
  }

  return {
    userBannedByEmail,

    /**
     * Keret ATOMIKUS ellenőrzése és lefoglalása (review #445): egy tranzakcióban, globális advisory-zár alatt számol
     * (korlát-kulcsonként 15 perc és 24 óra, szerverszinten 24 óra) és szúr be — párhuzamos kérésekből sem lesz több kód
     * vagy levél a keretnél. Csak `"OK"` után szabad levelet küldeni.
     */
    async reserveCode(input: CodeInput, limits: Partial<ReserveLimits> = {}, countLimitHashes: readonly string[] = [input.limitHash]): Promise<ReserveResult> {
      const perWindow = limits.perWindow ?? START_PER_EMAIL_MAX;
      const perDay = limits.perDay ?? START_PER_EMAIL_DAILY_MAX;
      const globalPerDay = limits.globalPerDay ?? loginEmailDailyMax();
      // N3: a címenkénti keret a megadott korlát-kulcsok MINDEGYIKÉT számolja (a belépés a törlési kéréseket is), a saját
      // korlát-kulcs mindig benne van.
      const counted = [...new Set([input.limitHash, ...countLimitHashes])];
      return inTransaction(pool, async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock($1)`, [START_LOCK_KEY]);
        const { rows } = await client.query<{ win: string; day: string; global: string }>(
          `SELECT count(*) FILTER (WHERE limit_hash = ANY($1::text[]) AND ${since("$2")})::text AS win,
                  count(*) FILTER (WHERE limit_hash = ANY($1::text[]) AND ${since("$3")})::text AS day,
                  count(*) FILTER (WHERE ${since("$3")})::text AS global
             FROM player_auth_codes`,
          [counted, START_WINDOW_MS, DAY_MS],
        );
        const r = rows[0]!;
        if (Number(r.global) >= globalPerDay) return "GLOBAL_LIMIT";
        if (Number(r.win) >= perWindow || Number(r.day) >= perDay) return "KEY_LIMIT";
        await client.query(INSERT_CODE_SQL, insertParams(input));
        return "OK";
      });
    },

    /** Kódrekord közvetlen beszúrása korlát nélkül (a tesztek ezzel ültetnek el ismert kódot). */
    async insertCode(input: CodeInput): Promise<void> {
      await pool.query(INSERT_CODE_SQL, insertParams(input));
    },

    /**
     * Adattakarékosság (ütemezve is fut, a flagtől függetlenül — sweeper.ts): a lejárt, be nem váltott rekordokból a nyílt
     * cím törlődik, a 24 óránál régebbi rekordok teljesen. Visszaadja: [címtelenített, törölt].
     */
    async purgeOldCodes(): Promise<[number, number]> {
      const blanked = await pool.query(`UPDATE player_auth_codes SET email_normalized = '' WHERE email_normalized <> '' AND expires_at <= now()`);
      const deleted = await pool.query(`DELETE FROM player_auth_codes WHERE created_at < now() - ($1::int * interval '1 millisecond')`, [CODE_RETENTION_MS]);
      return [blanked.rowCount ?? 0, deleted.rowCount ?? 0];
    },

    /**
     * Kódos beváltás (review #445, K1): a fiók (pontos cím hash-e) tranzakciós advisory-zárja alatt
     *  - ha az utolsó 24 órában már 10 hibás próba volt → nincs kiértékelés (a kódos út zárva, a linkes nem);
     *  - különben a LEGFRISSEBB, nem használt, 10 percen belüli rekordon egy próba: rossz kód → `attempts + 1`
     *    (rekordonként legfeljebb 5), jó kód → elhasználva és a nyílt cím törölve.
     * Siker → a megerősítendő (normalizált) cím, minden más → null (kívülről egységes válasz).
     */
    async consumeCode(
      emailHashHex: string, codeHashHex: string, failScope: readonly string[] = [emailHashHex], lockScope: readonly string[] = failScope,
    ): Promise<string | null> {
      // JM7b (review #449): a belépés hibás-próba plafonja a cím MINDEN céltartományára (belépés + törlés) összesítve számol.
      // JM7b-utójavítás (N3): a törlés csak a SAJÁT tartományát számolja (`failScope = [törlési hash]`) — egy idegen belépési
      // hibái így nem zárják le a tulajdonos törlését —, a zár viszont közös marad (`lockScope` = mindkét tartomány, a
      // legkisebb hash), így a két cél párhuzamos próbái sem kerülhetik meg a belépés plafonját.
      const scope = [...new Set([emailHashHex, ...failScope])];
      const lockOn = [...new Set([emailHashHex, ...lockScope])].sort()[0]!;
      return inTransaction(pool, async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 7040))`, [lockOn]);
        const failed = await client.query<{ n: string }>(
          `SELECT coalesce(sum(attempts), 0)::text AS n FROM player_auth_codes WHERE email_hash = ANY($1::text[]) AND ${since("$2")}`,
          [scope, DAY_MS],
        );
        if (Number(failed.rows[0]!.n) >= MAX_FAILED_ATTEMPTS_PER_DAY) return null;
        const { rows } = await client.query<{ id: string; email_normalized: string; attempts: number; ok: boolean }>(
          `SELECT id, email_normalized, attempts, (code_hash = $2) AS ok FROM player_auth_codes
            WHERE email_hash = $1 AND used_at IS NULL AND expires_at > now() AND ${since("$3")}
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [emailHashHex, codeHashHex, CODE_TTL_MS],
        );
        const row = rows[0];
        if (!row || row.attempts >= MAX_CODE_ATTEMPTS) return null;
        if (!row.ok) {
          await client.query(`UPDATE player_auth_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
          return null;
        }
        await client.query(`UPDATE player_auth_codes SET used_at = now(), email_normalized = '' WHERE id = $1`, [row.id]);
        return row.email_normalized || null;
      });
    },

    /** Linkes beváltás: a link-token hash-e alapján, egyszer, lejárat előtt; a nyílt cím a beváltással törlődik. */
    async consumeLink(linkHashHex: string): Promise<string | null> {
      const { rows } = await pool.query<{ email_normalized: string }>(
        `UPDATE player_auth_codes p SET used_at = now(), email_normalized = ''
           FROM (SELECT id, email_normalized FROM player_auth_codes
                  WHERE link_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE) s
          WHERE p.id = s.id AND p.used_at IS NULL
        RETURNING s.email_normalized`,
        [linkHashHex],
      );
      return rows[0]?.email_normalized || null;
    },

    /** A link megerősítő képernyőjéhez: beváltás NÉLKÜL a link címe (a hívó csak maszkolva adja ki). */
    async peekLink(linkHashHex: string): Promise<string | null> {
      const { rows } = await pool.query<{ email_normalized: string }>(
        `SELECT email_normalized FROM player_auth_codes WHERE link_hash = $1 AND used_at IS NULL AND expires_at > now()`,
        [linkHashHex],
      );
      return rows[0]?.email_normalized || null;
    },

    /** A munkamenet játékosának címe (csak szerveroldali összevetéshez — kliensnek nem adjuk ki). */
    async playerEmail(id: string): Promise<string | null> {
      const { rows } = await pool.query<{ email: string }>(`SELECT email FROM player_accounts WHERE id = $1`, [id]);
      return rows[0]?.email ?? null;
    },

    /**
     * A közös megerősítő lépés (a kódos és a linkes út is ide fut): a megerősített címből fiók — párhuzamos megerősítésből is
     * egyetlen sor (`UNIQUE(email)` + upsert). A meglévő admin-tiltás (`users.is_banned` ugyanerre a címre) is tiltott fiókot ad.
     */
    async confirmVerifiedEmail(emailNormalized: string): Promise<PlayerRow> {
      const { rows } = await pool.query<{ id: string; nickname: string | null; banned_at: Date | null }>(
        `INSERT INTO player_accounts (email, email_verified_at) VALUES ($1, now())
         ON CONFLICT (email) DO UPDATE SET email_verified_at = COALESCE(player_accounts.email_verified_at, now())
         RETURNING id, nickname, banned_at`,
        [emailNormalized],
      );
      const row = rows[0]!;
      const banned = row.banned_at !== null || (await userBannedByEmail(emailNormalized));
      return { id: row.id, nickname: row.nickname, banned };
    },

    /** A munkamenet játékosa (tiltás: saját `banned_at` vagy a meglévő admin-tiltás ugyanarra a címre). Nincs ilyen → null. */
    async getPlayer(id: string): Promise<PlayerRow | null> {
      const { rows } = await pool.query<{ id: string; nickname: string | null; banned: boolean }>(
        `SELECT p.id, p.nickname,
                (p.banned_at IS NOT NULL OR EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = p.email AND u.is_banned)) AS banned
           FROM player_accounts p WHERE p.id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },

    async touchLastSeen(id: string): Promise<void> {
      await pool.query(`UPDATE player_accounts SET last_seen_at = now() WHERE id = $1`, [id]);
    },
  };
}
