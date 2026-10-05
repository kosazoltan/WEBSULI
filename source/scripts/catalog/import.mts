// Spec 2026-10-05-s3-katalogus-bank: a kinyert tételek (S1) + a teljes besorolás (S2) → tantárgyi katalógus-bankok.
// Alapértelmezés: DRY-RUN (csak összesít és mérést ír). `--write`: egy tranzakcióban upsert (subject, fingerprint); az admin által
// beállított státuszt és lecke-döntést nem írja felül; a már nem létező (nem admin-érintett) sorokat törli. Írás CSAK teljes
// besorolással (minden lecke szerepel), különben a törlés tudást vinne el.
//   npx tsx scripts/catalog/import.mts [YYYY-MM-DD] [--write]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toBankRows, summarize, type BankRow, type LessonClassification } from "../../server/catalog/bank-rows";
import { withReadOnlyDb, withWriteTransaction } from "../lib/read-only-db";
import type { CatalogItemDraft } from "../../server/catalog/catalog-item";
import type { Classification } from "../../server/catalog/classify";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const day = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);
const write = process.argv.includes("--write");

type Item = CatalogItemDraft & { lessonTitle: string; classroom: number | null };
type ResultRow = { provenance: string; title: string; status: "agreed" | "review" | "unclassified"; models?: string[]; reason?: string; candidates?: Array<{ model: string; classification: Classification }> } & Partial<Classification>;

const items = JSON.parse(readFileSync(resolve(here, "../../.catalog", `${day}-items.json`), "utf8")) as Item[];
const classified = JSON.parse(readFileSync(resolve(repoRoot, "docs/measurements", `${day}-classify-all.json`), "utf8")) as { results: ResultRow[] };

const lessons = new Map<string, { title: string; classroom: number | null }>();
for (const i of items) if (!lessons.has(i.provenance)) lessons.set(i.provenance, { title: i.lessonTitle, classroom: i.classroom });

const classifications: LessonClassification[] = classified.results.map((r) => {
  if (r.status === "agreed") {
    const { subject, secondarySubjects, grade, topicArea, topic, lessonType, confidence, evidence } = r as Classification & ResultRow;
    return { provenance: r.provenance, status: "agreed", classification: { subject, secondarySubjects: secondarySubjects ?? [], grade, topicArea, topic, lessonType, confidence, evidence } };
  }
  if (r.status === "review") return { provenance: r.provenance, status: "review", candidates: r.candidates ?? [], reason: r.reason ?? "" };
  return { provenance: r.provenance, status: "unclassified", reason: r.reason ?? "" };
});
const missing = [...lessons.keys()].filter((p) => !classifications.some((c) => c.provenance === p));

// Az admin lecke-döntései (ha a tábla már létezik) — az import ezeket követi.
const adminSubjects = await withReadOnlyDb(async (q) => {
  const exists = await q<{ ok: boolean }>("SELECT to_regclass('public.catalog_lessons') IS NOT NULL AS ok");
  if (!exists[0]?.ok) return new Map<string, string>();
  const rows = await q<{ provenance: string; admin_subject: string }>("SELECT provenance, admin_subject FROM catalog_lessons WHERE admin_subject IS NOT NULL");
  return new Map(rows.map((r) => [r.provenance, r.admin_subject]));
});

const rows = toBankRows(items, classifications, adminSubjects);
const summary = summarize(rows);
const totals = rows.reduce((t, r) => ({ ...t, [r.status]: (t[r.status] ?? 0) + 1 }), {} as Record<string, number>);
const report = {
  measuredAt: new Date().toISOString(), day, mode: write ? "write" : "dry-run",
  lessons: lessons.size, classifiedLessons: classifications.length, missingClassification: missing.length,
  lessonStatus: { agreed: classifications.filter((c) => c.status === "agreed").length, review: classifications.filter((c) => c.status === "review").length, unclassified: classifications.filter((c) => c.status === "unclassified").length },
  adminDecisions: adminSubjects.size, items: items.length, bankRows: rows.length, totals, banks: summary,
};
mkdirSync(resolve(repoRoot, "docs/measurements"), { recursive: true });
writeFileSync(resolve(repoRoot, "docs/measurements", `${day}-catalog-import.json`), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ ...report, banks: undefined }, null, 1));
for (const [subject, s] of Object.entries(summary).sort((a, b) => b[1].total - a[1].total)) console.log(`${subject.padEnd(20)} ${String(s.total).padStart(6)}  aktív ${s.active}  jelölt ${s.flagged}  átnézendő ${s.review}`);

if (!write) process.exit(0);
if (missing.length) { console.error(`✗ --write megtagadva: ${missing.length} lecke besorolása hiányzik (a törlés tudást vinne el).`); process.exit(1); }

const BATCH = 500;
const lessonRows = classifications.map((c) => {
  const meta = lessons.get(c.provenance);
  const cl = c.status === "agreed" ? c.classification : null;
  return {
    provenance: c.provenance, title: meta?.title ?? c.provenance, classroom: meta?.classroom ?? null, subject: cl?.subject ?? null,
    secondary_subjects: cl?.secondarySubjects ?? [], topic_area: cl?.topicArea ?? null, topic: cl?.topic ?? null, lesson_type: cl?.lessonType ?? null,
    classification_status: c.status, candidates: c.status === "review" ? c.candidates : [], models: classified.results.find((r) => r.provenance === c.provenance)?.models ?? [],
    reason: c.status === "agreed" ? null : c.reason,
  };
});
const dbCounts = await withWriteTransaction(async (q) => {
  for (let i = 0; i < lessonRows.length; i += BATCH) {
    await q(`INSERT INTO catalog_lessons (provenance, title, classroom, subject, secondary_subjects, topic_area, topic, lesson_type, classification_status, candidates, models, reason, classified_at)
      SELECT x.provenance, x.title, x.classroom, x.subject, x.secondary_subjects, x.topic_area, x.topic, x.lesson_type, x.classification_status, x.candidates, x.models, x.reason, now()
      FROM jsonb_to_recordset($1::jsonb) AS x(provenance varchar, title text, classroom integer, subject varchar, secondary_subjects jsonb, topic_area text, topic text, lesson_type varchar, classification_status varchar, candidates jsonb, models jsonb, reason text)
      ON CONFLICT (provenance) DO UPDATE SET title = EXCLUDED.title, classroom = EXCLUDED.classroom, subject = EXCLUDED.subject, secondary_subjects = EXCLUDED.secondary_subjects,
        topic_area = EXCLUDED.topic_area, topic = EXCLUDED.topic, lesson_type = EXCLUDED.lesson_type, classification_status = EXCLUDED.classification_status,
        candidates = EXCLUDED.candidates, models = EXCLUDED.models, reason = EXCLUDED.reason, classified_at = now()`, [JSON.stringify(lessonRows.slice(i, i + BATCH))]);
  }
  const asRecord = (r: BankRow) => ({ subject: r.subject, grade: r.grade, topic_area: r.topicArea, topic: r.topic, lesson_type: r.lessonType, kind: r.kind, prompt: r.prompt, body: r.body,
    options: r.options, correct_index: r.correctIndex, accepted: r.accepted, keyword_groups: r.keywordGroups, steps: r.steps, pair: r.pair, concept_ids: r.conceptIds,
    provenances: r.provenances, trust: r.trust, status: r.status, checks: r.checks, fingerprint: r.fingerprint });
  for (let i = 0; i < rows.length; i += BATCH) {
    await q(`INSERT INTO catalog_items (subject, grade, topic_area, topic, lesson_type, kind, prompt, body, options, correct_index, accepted, keyword_groups, steps, pair, concept_ids, provenances, trust, status, checks, fingerprint)
      SELECT x.subject, x.grade, x.topic_area, x.topic, x.lesson_type, x.kind, x.prompt, x.body, x.options, x.correct_index, x.accepted, x.keyword_groups, x.steps, x.pair, x.concept_ids, x.provenances, x.trust, x.status, x.checks, x.fingerprint
      FROM jsonb_to_recordset($1::jsonb) AS x(subject varchar, grade integer, topic_area text, topic text, lesson_type varchar, kind varchar, prompt text, body text, options jsonb, correct_index integer,
        accepted jsonb, keyword_groups jsonb, steps jsonb, pair jsonb, concept_ids jsonb, provenances jsonb, trust varchar, status varchar, checks jsonb, fingerprint varchar)
      ON CONFLICT (subject, fingerprint) DO UPDATE SET grade = EXCLUDED.grade, topic_area = EXCLUDED.topic_area, topic = EXCLUDED.topic, lesson_type = EXCLUDED.lesson_type,
        provenances = EXCLUDED.provenances, trust = EXCLUDED.trust, checks = EXCLUDED.checks, updated_at = now(),
        status = CASE WHEN catalog_items.status_by_admin THEN catalog_items.status ELSE EXCLUDED.status END`, [JSON.stringify(rows.slice(i, i + BATCH).map(asRecord))]);
  }
  // A korpuszból eltűnt (vagy más bankba került) tétel sora törlődik — az admin által érintett sor soha.
  await q(`DELETE FROM catalog_items c WHERE NOT c.status_by_admin
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS k(subject varchar, fingerprint varchar) WHERE k.subject = c.subject AND k.fingerprint = c.fingerprint)`,
  [JSON.stringify(rows.map((r) => ({ subject: r.subject, fingerprint: r.fingerprint })))]);
  return q<{ subject: string; status: string; n: number }>("SELECT subject, status, count(*)::int AS n FROM catalog_items GROUP BY subject, status");
});

// EARS: írás után a DB-számok egyeznek a dry-runnal (az admin-döntésű sorok kivételével).
const mismatches: string[] = [];
for (const [subject, s] of Object.entries(summary)) for (const status of ["active", "flagged", "review"] as const) {
  const n = dbCounts.find((r) => r.subject === subject && r.status === status)?.n ?? 0;
  if (n !== s[status]) mismatches.push(`${subject}/${status}: DB ${n} ≠ dry-run ${s[status]}`);
}
console.log(mismatches.length ? `⚠️ eltérés (admin-döntés vagy hiba):\n${mismatches.join("\n")}` : "✅ a DB-számok egyeznek a dry-runnal");
