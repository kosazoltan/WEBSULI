/**
 * JM7a — a játékos-fiók és a belépőkódok adatbázis-műveletei (migrations/0040). Minden „egyszer használható” lépés egyetlen
 * atomikus UPDATE … RETURNING, így párhuzamos kérésekből sem lesz kettős beváltás vagy két fiók.
 * A `users` táblába SOHA nem ír (a játékos-fiók szerkezetileg külön; D12).
 */
import type { Pool } from "pg";
import { CODE_RETENTION_MS, CODE_TTL_MS, LINK_TTL_MS, MAX_CODE_ATTEMPTS, START_PER_EMAIL_MAX, START_WINDOW_MS } from "./codes";

type CodeInput = { emailNormalized: string; emailHash: string; codeHash: string; linkHash: string };
const INSERT_CODE_SQL = `INSERT INTO player_auth_codes (email_normalized, email_hash, code_hash, link_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + ($5::int * interval '1 millisecond'))`;

export type PlayerRow = { id: string; nickname: string | null; banned: boolean };

export type PlayerStore = ReturnType<typeof createPlayerStore>;

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
     * A címenkénti korlát (3 / 15 perc) ATOMIKUS ellenőrzése és lefoglalása (review #445, Codex P2): egy tranzakcióban, a cím
     * hash-ére vett tranzakciós advisory-zár alatt számol és szúr be — párhuzamos kódkérésekből is legfeljebb a keretnyi kód
     * (és levél) lesz. `true`: a kód elkészült, küldhető; `false`: a keret betelt (a hívó csendben 202-t ad).
     */
    async reserveCode(input: CodeInput, max = START_PER_EMAIL_MAX): Promise<boolean> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 7040))`, [input.emailHash]);
        const { rows } = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM player_auth_codes WHERE email_hash = $1 AND created_at > now() - ($2::int * interval '1 millisecond')`,
          [input.emailHash, START_WINDOW_MS],
        );
        if (Number(rows[0]?.n ?? 0) >= max) {
          await client.query("COMMIT");
          return false;
        }
        await client.query(INSERT_CODE_SQL, [input.emailNormalized, input.emailHash, input.codeHash, input.linkHash, LINK_TTL_MS]);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        // A ROLLBACK hibája nem takarhatja el az eredeti hibát (azt dobjuk tovább); a kapcsolatot a release eldobja.
        await client.query("ROLLBACK").catch((rollbackError: unknown) => { void rollbackError; });
        throw error;
      } finally {
        client.release();
      }
    },

    /** Kódrekord közvetlen beszúrása korlát nélkül (a tesztek ezzel ültetnek el ismert kódot). */
    async insertCode(input: CodeInput): Promise<void> {
      await pool.query(INSERT_CODE_SQL, [input.emailNormalized, input.emailHash, input.codeHash, input.linkHash, LINK_TTL_MS]);
    },

    /** Adattakarékosság: a megerősítendő címet is tartalmazó, 1 napnál régebbi kódrekordok törlése. */
    async purgeOldCodes(): Promise<void> {
      await pool.query(`DELETE FROM player_auth_codes WHERE created_at < now() - ($1::int * interval '1 millisecond')`, [CODE_RETENTION_MS]);
    },

    /**
     * Kódos beváltás: a cím legfrissebb, nem használt, 10 percen belüli, még próbálható rekordja. Minden próbálkozás
     * (jó vagy rossz) egy sorzár alatt — csak a LEGFRISSEBB rekordon — növeli az `attempts`-et, a helyes egyúttal elhasználja — így rekordonként legfeljebb
     * 5 kód értékelődik ki akkor is, ha a kérések párhuzamosan érkeznek. Siker → a megerősítendő (normalizált) cím.
     */
    async consumeCode(emailHashHex: string, codeHashHex: string): Promise<string | null> {
      const { rows } = await pool.query<{ ok: boolean; email_normalized: string }>(
        `UPDATE player_auth_codes
            SET attempts = attempts + 1,
                used_at = CASE WHEN code_hash = $2 THEN now() ELSE used_at END
          WHERE id = (
                  SELECT id FROM player_auth_codes
                   WHERE email_hash = $1 AND used_at IS NULL
                     AND expires_at > now() AND created_at > now() - ($4::int * interval '1 millisecond')
                   ORDER BY created_at DESC
                   LIMIT 1)
            AND used_at IS NULL AND attempts < $3 AND expires_at > now()
        RETURNING (code_hash = $2) AS ok, email_normalized`,
        [emailHashHex, codeHashHex, MAX_CODE_ATTEMPTS, CODE_TTL_MS],
      );
      const row = rows[0];
      return row?.ok ? row.email_normalized : null;
    },

    /** Linkes beváltás: a link-token hash-e alapján, egyszer, lejárat előtt. */
    async consumeLink(linkHashHex: string): Promise<string | null> {
      const { rows } = await pool.query<{ email_normalized: string }>(
        `UPDATE player_auth_codes SET used_at = now()
          WHERE link_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING email_normalized`,
        [linkHashHex],
      );
      return rows[0]?.email_normalized ?? null;
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
