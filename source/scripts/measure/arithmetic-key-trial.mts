// Tételgyár T5.2 (docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol-vegrehajtas.md): az új számolós kulcs-ellenőrzés a mentett és a
// publikált leckék kvízein, DB-ÍRÁS NÉLKÜL. Csak a T5 új leleteit gyűjti (beágyazott / fordított forma) — kézi átnézéshez (téves riasztás?).
// Futtatás (source/ mappából): npx tsx scripts/measure/arithmetic-key-trial.mts <kimeneti fájl>
import { writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { singleChoiceProblems } from "../../shared/single-choice-check";

const [outFile] = process.argv.slice(2);
if (!outFile) throw new Error("Használat: arithmetic-key-trial.mts <kimeneti fájl>");
type Quiz = { id: string; question: string; options: string[]; correctIndex: number };
const T5 = /kiszámolt eredménnyel|értéke -?\d/;

const rows = await withReadOnlyDb((q) => q<{ id: string; title: string; published: boolean; json: { experience?: { quiz?: Quiz[] } } }>(
  "SELECT id, json->>'title' title, published_at IS NOT NULL published, json FROM lessons WHERE created_at > now() - interval '60 days'"));
const findings: Array<Record<string, unknown>> = [];
let quizzes = 0;
for (const r of rows) {
  for (const q of r.json?.experience?.quiz ?? []) {
    quizzes++;
    const problems = singleChoiceProblems({ prompt: q.question, options: q.options, correctIndex: q.correctIndex }).filter((p) => T5.test(p));
    if (problems.length) findings.push({ lesson: r.title, published: r.published, question: q.question, options: q.options, key: q.correctIndex, problems });
  }
}
const summary = { lessons: rows.length, published: rows.filter((r) => r.published).length, quizzes, findings: findings.length, inPublished: findings.filter((f) => f.published).length };
writeFileSync(outFile, JSON.stringify({ summary, findings }, null, 1));
console.log(JSON.stringify(summary));
