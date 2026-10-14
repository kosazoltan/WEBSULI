// Spec 2026-10-14-tananyag-tomorseg-lefedettseg: egy mentett próbalecke kapu- és ív-indoklása újraszámolva (modellhívás nélkül),
// a harness szabályai szerint töltött térképpel (csak olvasás).
// Futtatás (source/ mappából): npx tsx scripts/measure/gate-reasons.mts <mappa> <címke> <mapId>
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";
import { checkCoverageGate, type MapConcept } from "../../server/studio/coverage";
import { applyTopicFocus, type TopicFocus } from "../../server/studio/topic-focus";
import { checkLessonArc } from "../../shared/lesson-arc";
import { lessonSchema } from "../../shared/lesson-schema";

const [dir, label, mapId] = process.argv.slice(2);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
const meta = (await db.query("SELECT title, subject, classroom FROM knowledge_maps WHERE id=$1", [mapId])).rows[0];
const taught = (await db.query("SELECT local_id, term, definition, quote, exam_weight FROM km_concepts WHERE map_id=$1 AND review_state IN ('kept','edited')", [mapId])).rows;
const focus = (await db.query("SELECT output->'topicFocus' AS f FROM studio_jobs WHERE map_id=$1 AND output ? 'topicFocus' ORDER BY created_at DESC LIMIT 1", [mapId])).rows[0]?.f as TopicFocus | undefined;
await db.end();
const concepts = applyTopicFocus({ concepts: taught.map((c) => ({ localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }) as MapConcept) }, focus).concepts;
const raw = JSON.parse(readFileSync(`${dir}/${label}-${mapId}.json`, "utf8")).lesson as Record<string, unknown>;
const parsed = lessonSchema.safeParse({ ...raw, mapId, title: raw.title || meta.title, subject: meta.subject, classroom: meta.classroom, sourceOnly: true });
if (!parsed.success) { console.log("séma:", parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")); process.exit(0); }
const gate = checkCoverageGate(parsed.data, concepts);
const arc = checkLessonArc(parsed.data);
console.log(`${meta.title} [${label}] kapu: ${gate.ok ? "OK" : "BUKOTT"}`);
for (const r of gate.reasons) console.log("  kapu:", r.slice(0, 400));
console.log(`ív: ${arc.ok ? "OK" : "BUKOTT"}`);
for (const r of arc.reasons) console.log("  ív:", r.slice(0, 300));
console.log("Próba fejezetenként (be/check):", parsed.data.sections.map((s) => `${s.probaEnabled ? "be" : "ki"}/${s.blocks.filter((b) => b.kind === "check").length}`).join(" "));
