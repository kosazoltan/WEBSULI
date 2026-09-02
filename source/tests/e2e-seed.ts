/**
 * CI E2E seed (2026-09-02): a Playwright-futás üres Postgres-konténere kap egy publikus
 * tananyagot, hogy a főoldali lista-tesztek (h3 kártya, list-files) valós tartalmat lássanak.
 * Idempotens: fix azonosítóval, ON CONFLICT DO NOTHING. Használat:
 *   DATABASE_URL=postgres://... node --import tsx tests/e2e-seed.ts
 */
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/websuli";
// 12 tananyag, 1-8. osztály között elosztva: a főoldali lista így túllóg a 720px-es
// viewporton (a CTA-görgetés tesztnek valós görgetés kell), és több osztály-szűrő is aktív.
const SEED_COUNT = 12;
const SUBJECTS = ["Matematika", "Angol", "Környezetismeret", "Magyar nyelvtan"];

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    for (let i = 1; i <= SEED_COUNT; i++) {
      const id = `e2e-seed-material-${String(i).padStart(4, "0")}`;
      const classroom = ((i - 1) % 8) + 1;
      const subject = SUBJECTS[(i - 1) % SUBJECTS.length]!;
      const title = `${classroom}. osztály - ${subject} - E2E próba tananyag ${i}`;
      await client.query(
        `INSERT INTO html_files (id, user_id, title, content, description, classroom, content_type, display_order)
         VALUES ($1, NULL, $2, $3, $4, $5, 'html', $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          title,
          `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>Ez a tananyag a CI Playwright-futáshoz készült.</p></body></html>`,
          "Automatikus seed a CI E2E tesztekhez.",
          classroom,
          i,
        ],
      );
    }
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
