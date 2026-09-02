/**
 * CI E2E seed (2026-09-02): a Playwright-futás üres Postgres-konténere kap egy publikus
 * tananyagot, hogy a főoldali lista-tesztek (h3 kártya, list-files) valós tartalmat lássanak.
 * Idempotens: fix azonosítóval, ON CONFLICT DO NOTHING. Használat:
 *   DATABASE_URL=postgres://... node --import tsx tests/e2e-seed.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/websuli";
const SEED_ID = "e2e-seed-material-0001";

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO html_files (id, user_id, title, content, description, classroom, content_type, display_order)
       VALUES ($1, NULL, $2, $3, $4, 3, 'html', 0)
       ON CONFLICT (id) DO NOTHING`,
      [
        SEED_ID,
        "3. osztály - E2E próba tananyag",
        "<!DOCTYPE html><html lang=\"hu\"><head><meta charset=\"utf-8\"><title>E2E próba</title></head><body><h1>E2E próba tananyag</h1><p>Ez a tananyag a CI Playwright-futáshoz készült.</p></body></html>",
        "Automatikus seed a CI E2E tesztekhez.",
      ],
    );
    const { rows } = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM html_files");
    // eslint-disable-next-line no-console
    console.log(`[E2E-SEED] html_files sorok: ${rows[0]?.count ?? "?"}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[E2E-SEED] hiba:", err);
  process.exit(1);
});
