import pg from "pg";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A `source/.env` a script helyéhez képest töltődik — a munkakönyvtártól függetlenül (review #187).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

/**
 * Spec 2026-11-02-ellenorzes-effort-ab: az URL `?sslmode=...` paramétere a node-postgresben felülüti az explicit ssl-objektumot,
 * így a DATABASE_CA_CERT nem érvényesült (mért: UNABLE_TO_GET_ISSUER_CERT a Neon új, Root YR láncán). Csak a TLS-paraméterek
 * kerülnek le (PR #373 review: a többi — pl. `options`, `application_name` — megmarad); mindig az ssl-objektum dönt,
 * a tanúsítvány-ellenőrzés bekapcsolva marad.
 */
function verifiedTlsClient(url: string): pg.Client {
  const bare = new URL(url);
  for (const param of ["sslmode", "sslcert", "sslkey", "sslrootcert", "sslpassword", "channel_binding"]) bare.searchParams.delete(param);
  return new pg.Client({
    connectionString: bare.toString(),
    ssl: { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {}) },
  });
}

/**
 * PRACTICE-AUDIT-SNAPSHOT (review #640): a csak olvasó tranzakció minden lekérdezése EGY pillanatképet lát (REPEATABLE READ) —
 * a több SELECT-es mérés nem keverhet a közben közzétett adattal. Csak olvasó REPEATABLE READ nem kap sorosítási hibát.
 */
export const READ_ONLY_BEGIN = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY";

/**
 * Review #187: a mérő/kinyerő scriptek közös, CSAK OLVASÓ kapcsolata — ellenőrzött TLS-sel (a tanúsítvány-ellenőrzés nem
 * kapcsolható ki csendben; a `DATABASE_CA_CERT` saját CA-t ad). Mérve 2026-10-05: az éles (Neon) DB ellenőrzött TLS-sel működik.
 * Minden lekérdezés egy csak olvasó, REPEATABLE READ tranzakcióban fut (`READ_ONLY_BEGIN`), a végén ROLLBACK.
 */
export async function withReadOnlyDb<T>(work: (query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nincs beállítva");
  const client = verifiedTlsClient(url);
  await client.connect();
  try {
    await client.query(READ_ONLY_BEGIN);
    return await work(async (sql, params) => (await client.query(sql, params as unknown[] | undefined)).rows);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

/**
 * Spec 2026-10-05-s3-katalogus-bank: ÍRÓ kapcsolat egyetlen tranzakcióban (ugyanaz az ellenőrzött TLS). Hiba → ROLLBACK, semmi
 * sem marad félig írva; siker → COMMIT. Csak kifejezett `--write` kapcsolóval hívott scriptekből.
 */
export async function withWriteTransaction<T>(work: (query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nincs beállítva");
  const client = verifiedTlsClient(url);
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await work(async (sql, params) => (await client.query(sql, params as unknown[] | undefined)).rows);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
