import pg from "pg";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A `source/.env` a script helyéhez képest töltődik — a munkakönyvtártól függetlenül (review #187).
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

/**
 * Review #187: a mérő/kinyerő scriptek közös, CSAK OLVASÓ kapcsolata — ellenőrzött TLS-sel (a tanúsítvány-ellenőrzés nem
 * kapcsolható ki csendben; a `DATABASE_CA_CERT` saját CA-t ad). Mérve 2026-10-05: az éles (Neon) DB ellenőrzött TLS-sel működik.
 * Minden lekérdezés `BEGIN READ ONLY` tranzakcióban fut, a végén ROLLBACK.
 */
export async function withReadOnlyDb<T>(work: (query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nincs beállítva");
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {}) },
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    return await work(async (sql, params) => (await client.query(sql, params as unknown[] | undefined)).rows);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}
