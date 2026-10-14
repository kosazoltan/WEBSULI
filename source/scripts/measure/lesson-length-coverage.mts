// Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S1): az összes tárolt pipeline-lecke mérése (térképenként a legutolsó
// verzió) a forrásszövegéhez és a fogalomtérképéhez — CSAK OLVASÁS, modellhívás nélkül. A mérés a server/studio/lesson-metrics
// modulé (egy implementáció a mérőnek, a próbaharnessnek és a kapunak).
// Futtatás (source/ mappából): npx tsx scripts/measure/lesson-length-coverage.mts <kimenet.json>
import "dotenv/config";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { measureLesson } from "../../server/studio/lesson-metrics";
import type { Lesson } from "../../shared/lesson-schema";

const out = process.argv[2];
if (!out) throw new Error("Add meg a kimeneti JSON útvonalát.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
const rows = (await client.query(`
  SELECT DISTINCT ON (l.map_id) l.map_id, l.json, km.title, km.subject, km.classroom, km.source_text
  FROM lessons l JOIN knowledge_maps km ON km.id = l.map_id
  WHERE l.map_id IS NOT NULL ORDER BY l.map_id, l.version DESC, l.created_at DESC`)).rows;
const results = [];
for (const r of rows) {
  const concepts = (await client.query("SELECT term, definition, quote FROM km_concepts WHERE map_id=$1", [r.map_id])).rows;
  const lesson = r.json as Lesson;
  const exp = lesson.experience as { quiz?: unknown[]; tasks?: unknown[]; methods?: unknown[] } | undefined;
  results.push({
    mapId: r.map_id, title: r.title, subject: r.subject, grade: r.classroom,
    ...measureLesson(lesson, { sourceText: r.source_text ?? "", concepts }),
    concepts: concepts.length, quiz: exp?.quiz?.length ?? 0, tasks: exp?.tasks?.length ?? 0, methods: exp?.methods?.length ?? 0,
  });
}
await client.end();
writeFileSync(out, JSON.stringify(results, null, 2));
const median = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const real = results.filter((o) => !/probe|próba|proba|QA |TESZT|mérés\)/i.test(o.title));
const pick = (k: keyof (typeof results)[number]) => median(real.map((o) => o[k] as number));
console.log(`leckék: ${results.length}, valós: ${real.length}`);
console.log("valós medián:", {
  forrásSzó: pick("sourceWords"), láthatóSzó: pick("visibleWords"), olvasásPerc: pick("readingMinutes"), szakasz: pick("sections"),
  "forrás→térkép%": pick("sourceInMapPct"), "forrás→lecke%": pick("sourceInLessonPct"), "nem-forrás%": pick("nonSourcePct"), "ismétlés%": pick("repetitionPct"),
});
