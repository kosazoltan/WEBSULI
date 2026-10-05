// Spec 2026-10-05-s4-tantargyi-skillek: tantárgyi skill-fájlok a visszafejtett katalógusból, modell NÉLKÜL, determinisztikusan.
// Bemenet: alapból a helyi kinyerés + teljes besorolás (`.catalog/<nap>-items.json` + `docs/measurements/<nap>-classify-all.json`,
// ugyanaz a `toBankRows`, mint az importé); `--db`: az importált `catalog_items`. A lektor-csapdák csak olvasó lekérdezésből.
// Kimenet: `shared/subject-skills/<tantárgy>.md` + generált `shared/subject-skills/index.ts`.
//   npx tsx scripts/catalog/build-subject-skills.mts [YYYY-MM-DD] [--db]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_SUBJECTS, type CatalogSubject } from "../../shared/catalog-taxonomy";
import { subjectKeyOf } from "../../shared/subject-key";
import { toBankRows, type BankRow, type LessonClassification } from "../../server/catalog/bank-rows";
import { buildSubjectSkill, trapExample, verifierTraps, type Trap } from "../../server/catalog/subject-skill-builder";
import { withReadOnlyDb } from "../lib/read-only-db";
import type { CatalogItemDraft } from "../../server/catalog/catalog-item";
import type { Classification } from "../../server/catalog/classify";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const day = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);
const fromDb = process.argv.includes("--db");

async function rowsFromFiles(): Promise<{ rows: BankRow[]; agreed: Set<string> }> {
  const items = JSON.parse(readFileSync(resolve(here, "../../.catalog", `${day}-items.json`), "utf8")) as Array<CatalogItemDraft & { classroom: number | null }>;
  const classified = JSON.parse(readFileSync(resolve(repoRoot, "docs/measurements", `${day}-classify-all.json`), "utf8")) as { results: Array<Record<string, unknown> & { provenance: string; status: string }> };
  const cls: LessonClassification[] = classified.results.map((r) => r.status === "agreed"
    ? { provenance: r.provenance, status: "agreed", classification: r as unknown as Classification }
    : r.status === "review" ? { provenance: r.provenance, status: "review", candidates: (r.candidates ?? []) as Array<{ model: string; classification: Classification }>, reason: String(r.reason ?? "") }
      : { provenance: r.provenance, status: "unclassified", reason: String(r.reason ?? "") });
  return { rows: toBankRows(items, cls), agreed: new Set(cls.filter((c) => c.status === "agreed").map((c) => c.provenance)) };
}

async function rowsFromDb(): Promise<{ rows: BankRow[]; agreed: Set<string> }> {
  return withReadOnlyDb(async (q) => ({ agreed: new Set((await q<{ provenance: string }>("SELECT provenance FROM catalog_lessons WHERE classification_status = 'agreed' OR admin_subject IS NOT NULL")).map((r) => r.provenance)), rows: (await q<Record<string, unknown>>(`SELECT subject, grade, topic_area, topic, lesson_type, kind, prompt, body, options, correct_index, accepted,
    keyword_groups, steps, pair, concept_ids, provenances, trust, status, checks, fingerprint FROM catalog_items WHERE status IN ('active','flagged')`)).map((r) => ({
    subject: String(r.subject), grade: r.grade as number | null, topicArea: r.topic_area as string | null, topic: r.topic as string | null, lessonType: r.lesson_type as string | null,
    kind: r.kind as BankRow["kind"], prompt: String(r.prompt), body: r.body as string | null, options: r.options as string[] | null, correctIndex: r.correct_index as number | null,
    accepted: r.accepted as string[] | null, keywordGroups: r.keyword_groups as string[][] | null, steps: r.steps as string[] | null, pair: r.pair as BankRow["pair"], conceptIds: r.concept_ids as string[] | null,
    provenances: r.provenances as string[], trust: r.trust as BankRow["trust"], status: r.status as BankRow["status"], checks: r.checks as string[], fingerprint: String(r.fingerprint),
  })) }));
}

const { rows, agreed: agreedProvenances } = fromDb ? await rowsFromDb() : await rowsFromFiles();

// Lektor-csapdák tantárgyanként: jegyzet → feladat → tudástérkép szabad szöveges tantárgya → bank-kulcs (ismeretlen → kimarad).
const notes = await withReadOnlyDb((q) => q<{ subject: string | null; kind: string; subkind: string | null; message: string }>(
  `SELECT km.subject, ln.kind, ln.subkind, ln.message FROM lektor_notes ln JOIN studio_jobs sj ON sj.id = ln.job_id JOIN knowledge_maps km ON km.id = sj.map_id
   WHERE ln.severity IN ('blocker','warn') ORDER BY ln.kind, ln.subkind, ln.message`));
const lektorTraps = new Map<CatalogSubject, Map<string, Trap>>();
let unmapped = 0;
for (const n of notes) {
  const key = subjectKeyOf(n.subject);
  if (!key) { unmapped++; continue; }
  const code = `${n.kind}${n.subkind ? `/${n.subkind}` : ""}`;
  const bySubject = lektorTraps.get(key) ?? new Map<string, Trap>();
  const t = bySubject.get(code) ?? { source: "lektor" as const, code, count: 0, example: trapExample(n.message) };
  t.count++;
  bySubject.set(code, t);
  lektorTraps.set(key, bySubject);
}

const outDir = resolve(here, "../../shared/subject-skills");
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".md")) rmSync(resolve(outDir, f));
const built = CATALOG_SUBJECTS.map((s) => buildSubjectSkill(s, rows, [...(lektorTraps.get(s)?.values() ?? []), ...verifierTraps(s, rows)], day, agreedProvenances)).filter((s) => s.activeItems > 0);
for (const s of built) writeFileSync(resolve(outDir, `${s.subject}.md`), s.text);
const index = [
  "// GENERÁLT FÁJL — scripts/catalog/build-subject-skills.mts. Kézzel ne szerkeszd; újragenerálás után a verzió-hash változik.",
  "// Spec 2026-10-05-s4-tantargyi-skillek.",
  'import type { CatalogSubject } from "../catalog-taxonomy";',
  "",
  "export const SUBJECT_SKILL_TEXTS: Partial<Record<CatalogSubject, string>> = {",
  ...built.map((s) => `  ${JSON.stringify(s.subject)}: ${JSON.stringify(s.text)},`),
  "};",
  "",
].join("\n");
writeFileSync(resolve(outDir, "index.ts"), index);
console.log(JSON.stringify({ day, source: fromDb ? "db" : "files", lektorNotes: notes.length, unmappedNotes: unmapped,
  skills: built.map((s) => ({ subject: s.subject, active: s.activeItems, lessons: s.lessons, sparse: s.sparse, version: s.version, chars: s.text.length })) }, null, 1));

// Lecketípusonkénti tételtípus-arány (a kézzel írt lecketípus-skillek mért alátámasztása).
const shape: Record<string, { lessons: number; items: number; kinds: Record<string, number> }> = {};
const lessonsByType = new Map<string, Set<string>>();
for (const r of rows) {
  if (r.status !== "active" || !r.lessonType) continue;
  const s = (shape[r.lessonType] ??= { lessons: 0, items: 0, kinds: {} });
  s.items++;
  s.kinds[r.kind] = (s.kinds[r.kind] ?? 0) + 1;
  const set = lessonsByType.get(r.lessonType) ?? new Set<string>();
  for (const p of r.provenances) if (agreedProvenances.has(p)) set.add(p);
  lessonsByType.set(r.lessonType, set);
}
for (const [t, set] of lessonsByType) shape[t].lessons = set.size;
const ordered = Object.fromEntries(Object.entries(shape).sort((a, b) => a[0].localeCompare(b[0])).map(([t, s]) => [t, { ...s, share: Object.fromEntries(Object.entries(s.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, Math.round((1000 * n) / s.items) / 10])) }]));
writeFileSync(resolve(repoRoot, "docs/measurements", `${day}-lesson-type-shape.json`), JSON.stringify({ day, source: fromDb ? "db" : "files", types: ordered }, null, 1) + "\n");
