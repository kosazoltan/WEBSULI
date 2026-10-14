// Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S1): az összes tárolt pipeline-lecke mérése (térképenként a legutolsó
// verzió) a forrásszövegéhez és a fogalomtérképéhez — CSAK OLVASÁS, modellhívás nélkül. A mérés a server/studio/lesson-metrics
// modulé (egy implementáció a mérőnek, a próbaharnessnek és a kapunak).
// Review #210: ellenőrzött TLS (scripts/lib/read-only-db), anonim kimenet (belső azonosító és leckecím nélkül — a cím
// gyereknevet is tartalmazhat), páros elemszámnál átlagolt medián.
// Futtatás (source/ mappából): npx tsx scripts/measure/lesson-length-coverage.mts <kimenet.json>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { measureLesson } from "../../server/studio/lesson-metrics";
import type { Lesson } from "../../shared/lesson-schema";

const out = process.argv[2];
if (!out) throw new Error("Add meg a kimeneti JSON útvonalát.");
/** Próba-/teszt-/QA-futás, nem valós lecke (a cím alapján — a cím maga nem kerül a kimenetbe). */
const isTestRun = (title: string) => /probe|próba|proba|QA |TESZT|mérés\)/i.test(title);

const results = await withReadOnlyDb(async (query) => {
  const rows = await query<{ map_id: string; json: Lesson; title: string; subject: string; classroom: number; source_text: string | null }>(`
    SELECT DISTINCT ON (l.map_id) l.map_id, l.json, km.title, km.subject, km.classroom, km.source_text
    FROM lessons l JOIN knowledge_maps km ON km.id = l.map_id
    WHERE l.map_id IS NOT NULL ORDER BY l.map_id, l.version DESC, l.created_at DESC`);
  const out = [];
  for (const r of rows) {
    const concepts = await query<{ term: string; definition: string | null; quote: string | null; exam_weight: string | null }>(
      "SELECT term, definition, quote, exam_weight FROM km_concepts WHERE map_id=$1", [r.map_id]);
    const exp = r.json.experience as { quiz?: unknown[]; tasks?: unknown[]; methods?: unknown[] } | undefined;
    out.push({
      lesson: `m-${createHash("sha256").update(r.map_id).digest("hex").slice(0, 8)}`, testRun: isTestRun(r.title),
      subject: r.subject, grade: r.classroom,
      ...measureLesson(r.json, { sourceText: r.source_text ?? "", concepts: concepts.map((c) => ({ ...c, examWeight: c.exam_weight })) }),
      concepts: concepts.length, quiz: exp?.quiz?.length ?? 0, tasks: exp?.tasks?.length ?? 0, methods: exp?.methods?.length ?? 0,
    });
  }
  return out;
});
writeFileSync(out, JSON.stringify(results, null, 2));

/** Medián; páros elemszámnál a két középső átlaga (review #210). */
export function median(xs: number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}
const real = results.filter((o) => !o.testRun);
const pick = (k: keyof (typeof results)[number]) => median(real.map((o) => o[k] as number));
console.log(`leckék: ${results.length}, valós: ${real.length}`);
console.log("valós medián:", {
  forrásSzó: pick("sourceWords"), láthatóSzó: pick("visibleWords"), olvasásPerc: pick("readingMinutes"), szakasz: pick("sections"),
  "forrás→térkép%": pick("sourceInMapPct"), "forrás→lecke%": pick("sourceInLessonPct"), "nem-forrás%": pick("nonSourcePct"), "ismétlés%": pick("repetitionPct"),
});
