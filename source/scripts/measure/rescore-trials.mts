// Spec 2026-10-14-tananyag-tomorseg-lefedettseg: a mentett próbaleckék újrapontozása (modellhívás nélkül) a lesson-metrics
// aktuális mérőszámaival — pl. a kötelező-fogalom lefedettséggel. A térképet a harness szabályai szerint tölti (csak olvasás).
// Futtatás (source/ mappából): npx tsx scripts/measure/rescore-trials.mts <mappa> <címke,címke,...>
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { measureLesson } from "../../server/studio/lesson-metrics";
import { applyTopicFocus, type TopicFocus } from "../../server/studio/topic-focus";
import type { MapConcept } from "../../server/studio/coverage";
import type { Lesson } from "../../shared/lesson-schema";

const [dir, labels] = process.argv.slice(2);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
const rows = [];
for (const label of labels.split(",")) {
  for (const file of readdirSync(dir).filter((f) => f.startsWith(`${label}-`) && !f.endsWith("summary.json") && f.endsWith(".json"))) {
    const mapId = file.slice(label.length + 1, -5);
    const { lesson } = JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as { lesson: Lesson };
    if (!lesson?.sections) continue;
    const meta = (await db.query("SELECT title, source_text FROM knowledge_maps WHERE id=$1", [mapId])).rows[0];
    const taught = (await db.query("SELECT local_id, term, definition, quote, exam_weight FROM km_concepts WHERE map_id=$1 AND review_state IN ('kept','edited')", [mapId])).rows;
    const focus = (await db.query("SELECT output->'topicFocus' AS f FROM studio_jobs WHERE map_id=$1 AND output ? 'topicFocus' ORDER BY created_at DESC LIMIT 1", [mapId])).rows[0]?.f as TopicFocus | undefined;
    const concepts = applyTopicFocus({ concepts: taught.map((c) => ({ localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }) as MapConcept) }, focus).concepts;
    const m = measureLesson(lesson, { sourceText: meta.source_text ?? "", concepts });
    rows.push({ címke: label, térkép: String(meta.title).slice(0, 26), szó: m.visibleWords, fejezet: m.sections, "kötelező-fogalom%": m.requiredConceptTermsPct, "forrás→lecke%": m.sourceInLessonPct, "nem-forrás%": m.nonSourcePct });
  }
}
await db.end();
rows.sort((a, b) => a.térkép.localeCompare(b.térkép) || a.címke.localeCompare(b.címke));
console.table(rows);
