// TANANYAG-GYAKORLATI P1 (docs/specs/2026-11-26-tananyag-gyakorlati.md): csak olvasó gyakorlatiassági audit — DB-ÍRÁS és
// MODELLHÍVÁS NÉLKÜL. Tételenként alkalmazás / fogalmi / meta / bizonytalan (shared/practice-policy.ts), bankonként külön arány.
// Futtatás (source/ mappából):
//   npx tsx scripts/measure/practice-audit.mts --lesson <lecke.json>      — Lesson JSON (experience bankkal)
//   npx tsx scripts/measure/practice-audit.mts --html <lecke.html>        — fúziós HTML (websuli-lesson-data JSON-bank)
//   npx tsx scripts/measure/practice-audit.mts --db [--out <fájl.json>]   — az éles leckék + az aktív játékkvíz-sorok (BEGIN READ ONLY)
import { readFileSync, writeFileSync } from "node:fs";
import { auditExperience, classifyQuizItem, PRACTICE_POLICY_VERSION, type PracticeKind } from "../../shared/practice-policy";
import { readHtmlLessonData } from "../../shared/lesson-html-data";

type Exp = Parameters<typeof auditExperience>[0];
const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = opt("--out");

function summary(e: Exp) {
  const a = auditExperience(e);
  const brief = (b: typeof a.quiz) => ({ total: b.total, counts: b.counts, ratio: b.ratio, target: b.target, status: b.status,
    meta: b.items.filter((i) => i.kind === "meta").map((i) => i.id) });
  return { quiz: brief(a.quiz), tasks: brief(a.tasks), items: { quiz: a.quiz.items, tasks: a.tasks.items } };
}

async function fromDb() {
  const { withReadOnlyDb } = await import("../lib/read-only-db");
  return withReadOnlyDb(async (query) => {
    const lessons = await query<{ id: string; title: string | null; json: { title?: string; experience?: Exp } }>(
      "SELECT l.id, h.title, l.json FROM lessons l LEFT JOIN html_files h ON h.id = l.html_file_id ORDER BY l.id");
    const games = await query<{ id: string; prompt: string; options: string[]; source_material_id: string | null; lesson_id: string | null; title: string | null }>(
      "SELECT g.id, g.prompt, g.options, g.source_material_id, g.lesson_id, h.title FROM game_quiz_items g " +
      "LEFT JOIN html_files h ON h.id = g.source_material_id WHERE g.is_active ORDER BY g.source_material_id, g.id");
    const lessonRows = lessons.filter((l) => l.json?.experience?.quiz).map((l) => ({
      id: l.id, title: l.title ?? l.json.title ?? null, ...summary(l.json.experience!) }));
    const byMaterial = new Map<string, { title: string | null; counts: Record<PracticeKind, number>; meta: Array<{ id: string; prompt: string }> }>();
    for (const g of games) {
      const key = g.source_material_id ?? g.lesson_id ?? "—";
      const row = byMaterial.get(key) ?? { title: g.title, counts: { alkalmazas: 0, fogalmi: 0, meta: 0, bizonytalan: 0 }, meta: [] };
      const v = classifyQuizItem({ question: g.prompt, options: g.options });
      row.counts[v.kind]++;
      if (v.kind === "meta") row.meta.push({ id: g.id, prompt: g.prompt });
      byMaterial.set(key, row);
    }
    const sum = (rows: Array<{ counts: Record<PracticeKind, number> }>) =>
      rows.reduce((s, r) => { for (const k of Object.keys(s) as PracticeKind[]) s[k] += r.counts[k]; return s; }, { alkalmazas: 0, fogalmi: 0, meta: 0, bizonytalan: 0 });
    return {
      lessons: { n: lessonRows.length, quiz: sum(lessonRows.map((l) => l.quiz)), tasks: sum(lessonRows.map((l) => l.tasks)),
        status: lessonRows.reduce((s, l) => ({ ...s, [l.quiz.status]: (s[l.quiz.status] ?? 0) + 1 }), {} as Record<string, number>),
        rows: lessonRows.map(({ items: _items, ...rest }) => rest) },
      games: { n: games.length, counts: sum([...byMaterial.values()]), materials: [...byMaterial].map(([id, r]) => ({ id, ...r })) },
    };
  });
}

let report: unknown;
if (opt("--lesson")) report = summary((JSON.parse(readFileSync(opt("--lesson")!, "utf8")) as { experience: Exp }).experience);
else if (opt("--html")) report = summary(readHtmlLessonData(readFileSync(opt("--html")!, "utf8")).experience as unknown as Exp);
else if (args.includes("--db")) report = await fromDb();
else throw new Error("Használat: practice-audit.mts --lesson <lecke.json> | --html <lecke.html> | --db [--out <fájl.json>]");

const text = JSON.stringify({ version: PRACTICE_POLICY_VERSION, at: new Date().toISOString(), report }, null, 2);
if (out) writeFileSync(out, text);
else process.stdout.write(`${text}\n`);
