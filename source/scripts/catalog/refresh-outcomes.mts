// Spec 2026-10-06-s8-tanuloi-eredmenyesseg: a tételenkénti tanulói eredmény TELJES újraszámolása a lezárt gyakorlókörökből
// (lesson_attempts, status = completed) a katalógus-tétel lenyomatára — ugyanazzal a tiszta függvénnyel, mint a lejátszó `finish` útja.
// Alapértelmezés: DRY-RUN (csak olvas, összesít, mérést ír). `--write`: egy tranzakcióban zár → olvasás → csere → számellenőrzés.
//   npx tsx scripts/catalog/refresh-outcomes.mts [--write]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addOutcomes, outcomeRecords, roundOutcomes, type Outcome, type OutcomeRound } from "../../server/catalog/outcomes";
import { withReadOnlyDb, withWriteTransaction } from "../lib/read-only-db";

type Query = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const day = new Date().toISOString().slice(0, 10);
const write = process.argv.includes("--write");
const PAGE = 1000;
const BATCH = 1000;

/** Kulcs-lapozással minden lezárt kör; a megválaszolatlan kérdés nem számít (roundOutcomes). */
async function collect(q: Query) {
  const totals = new Map<string, Outcome>();
  let rounds = 0, after = "";
  for (;;) {
    const page = await q<OutcomeRound & { id: string }>("SELECT id, questions, answers, hints FROM lesson_attempts WHERE status = 'completed' AND id > $1 ORDER BY id LIMIT $2", [after, PAGE]);
    for (const row of page) addOutcomes(totals, roundOutcomes(row));
    rounds += page.length;
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  const records = outcomeRecords(totals);
  const catalogTable = (await q<{ ok: boolean }>("SELECT to_regclass('public.catalog_items') IS NOT NULL AS ok"))[0]?.ok;
  const inCatalog = catalogTable && records.length
    ? Number((await q<{ n: number }>("SELECT count(DISTINCT fingerprint)::int AS n FROM catalog_items WHERE fingerprint = ANY($1::text[])", [records.map((r) => r.fingerprint)]))[0]?.n ?? 0)
    : 0;
  const sum = (k: "attempts" | "correct" | "independent_correct") => records.reduce((s, r) => s + r[k], 0);
  return { records, report: { rounds, fingerprints: records.length, inCatalog, attempts: sum("attempts"), correct: sum("correct"), independentCorrect: sum("independent_correct") } };
}

function persist(report: Record<string, unknown>) {
  mkdirSync(resolve(repoRoot, "docs/measurements"), { recursive: true });
  writeFileSync(resolve(repoRoot, "docs/measurements", `${day}-catalog-outcomes.json`), JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify(report, null, 1));
}

if (!write) {
  const { report } = await withReadOnlyDb(collect);
  persist({ measuredAt: new Date().toISOString(), mode: "dry-run", ...report });
  process.exit(0);
}

const report = await withWriteTransaction(async (q) => {
  // A zár UTÁN olvasunk: a párhuzamos `finish` számlálója vagy benne van ebben az olvasásban, vagy a COMMIT után adódik hozzá.
  await q("LOCK TABLE catalog_item_outcomes IN EXCLUSIVE MODE");
  const { records, report } = await collect(q);
  await q("DELETE FROM catalog_item_outcomes");
  for (let i = 0; i < records.length; i += BATCH) {
    await q(`INSERT INTO catalog_item_outcomes (fingerprint, attempts, correct, independent_correct, updated_at)
      SELECT x.fingerprint, x.attempts, x.correct, x.independent_correct, now()
      FROM jsonb_to_recordset($1::jsonb) AS x(fingerprint varchar, attempts integer, correct integer, independent_correct integer)`, [JSON.stringify(records.slice(i, i + BATCH))]);
  }
  // EARS: a COMMIT ELŐTT a tábla összege = a számolt összeg; eltérés → throw → ROLLBACK.
  const [db] = await q<{ n: number; attempts: number; correct: number; independent: number }>(
    "SELECT count(*)::int AS n, coalesce(sum(attempts),0)::int AS attempts, coalesce(sum(correct),0)::int AS correct, coalesce(sum(independent_correct),0)::int AS independent FROM catalog_item_outcomes");
  if (db.n !== report.fingerprints || db.attempts !== report.attempts || db.correct !== report.correct || db.independent !== report.independentCorrect) {
    throw new Error(`a DB-számok eltérnek a számolttól (ROLLBACK): ${JSON.stringify({ db, report })}`);
  }
  return report;
});
persist({ measuredAt: new Date().toISOString(), mode: "write", ...report });
console.log("✅ a tábla összege egyezik a számolttal; COMMIT megtörtént");
