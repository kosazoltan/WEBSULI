// Spec 2026-10-14-tananyag-tomorseg-lefedettseg: a mentett próbaleckék újrapontozása (modellhívás nélkül) a lesson-metrics
// aktuális mérőszámaival. A térképet a harness szabályai szerint tölti; csak-olvasó tranzakció, ellenőrzött TLS (review #210).
// Futtatás (source/ mappából): npx tsx scripts/measure/rescore-trials.mts <mappa> <címke,címke,...>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { measureLesson } from "../../server/studio/lesson-metrics";
import { applyTopicFocus, type TopicFocus } from "../../server/studio/topic-focus";
import type { MapConcept } from "../../server/studio/coverage";
import type { Lesson } from "../../shared/lesson-schema";

const [dir, labels] = process.argv.slice(2);
const rows = await withReadOnlyDb(async (query) => {
  const out = [];
  for (const label of labels.split(",")) {
    for (const file of readdirSync(dir).filter((f) => f.startsWith(`${label}-`) && !f.endsWith("summary.json") && f.endsWith(".json"))) {
      const mapId = file.slice(label.length + 1, -5);
      const { lesson } = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as { lesson: Lesson };
      if (!lesson?.sections) continue;
      const [meta] = await query<{ title: string; source_text: string | null }>("SELECT title, source_text FROM knowledge_maps WHERE id=$1", [mapId]);
      const taught = await query<{ local_id: string; term: string; definition: string; quote: string; exam_weight: string }>(
        "SELECT local_id, term, definition, quote, exam_weight FROM km_concepts WHERE map_id=$1 AND review_state IN ('kept','edited')", [mapId]);
      const [job] = await query<{ f: TopicFocus | null }>("SELECT output->'topicFocus' AS f FROM studio_jobs WHERE map_id=$1 AND output ? 'topicFocus' ORDER BY created_at DESC LIMIT 1", [mapId]);
      const concepts = applyTopicFocus({ concepts: taught.map((c) => ({ localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }) as MapConcept) }, job?.f ?? null).concepts;
      const m = measureLesson(lesson, { sourceText: meta.source_text ?? "", concepts });
      out.push({ címke: label, térkép: String(meta.title).slice(0, 26), szó: m.visibleWords, fejezet: m.sections, "kötelező-fogalom%": m.requiredConceptTermsPct, "kötelező-tény%": m.requiredFactsPct, "forrás→lecke%": m.sourceInLessonPct, "nem-forrás%": m.nonSourcePct });
    }
  }
  return out;
});
rows.sort((a, b) => a.térkép.localeCompare(b.térkép) || a.címke.localeCompare(b.címke));
console.table(rows);
// review #213: az újrapontozott értékek (mindkét ágra) fájlba is — a mérési adathalmaz minden állítást alátámaszt
const jsonOut = process.argv[4];
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
