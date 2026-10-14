// Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S1): offline próbaharness — a VALÓDI tervező- és szerzőpromptot
// (`buildPedagoguePrompt`, `buildAuthorPrompt`) futtatja a valódi modellen, a tulajdonos aktív tanult szabályaival
// (ugyanaz a runbook, mint élesben), DB-ÍRÁS NÉLKÜL (az adatbázist csak olvassa), majd a kapukat és a mérést lefuttatja.
// Eltérés az éles úttól (jelölve): a kapcsolós katalógus-blokk (S6) és tantárgyi memória (S5) nem kerül be; javító kör nincs.
// Futtatás (source/ mappából): npx tsx scripts/measure/lesson-trial.mts <címke> <kimeneti mappa> <mapId,mapId,...>
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { resolveStudioModel } from "../../server/ai/models";
import { createStudioStepProvider } from "../../server/ai/studio-provider";
import { checkCoverageGate, type MapConcept } from "../../server/studio/coverage";
import { measureLesson } from "../../server/studio/lesson-metrics";
import { callStepModel } from "../../server/studio/run-step";
import { buildAuthorPrompt, buildPedagoguePrompt, outlineCoversMap, outlineSchema } from "../../server/studio/step-io";
import { TAUGHT_REVIEW_STATES } from "../../server/studio/step-runner";
import { applyTopicFocus, type TopicFocus } from "../../server/studio/topic-focus";
import { autofixOutline } from "../../server/studio/tools/outline-autofix";
import { skillSnapshot } from "../../server/workflows/learning";
import { withPreparationSkill } from "../../server/workflows/engine";
import { checkLessonArc } from "../../shared/lesson-arc";
import { lessonSchema } from "../../shared/lesson-schema";
import { SKILL_METHOD_VERSION, skillForMode } from "../../shared/lesson-skill";
import { pickVisualWorld } from "../../shared/lesson-visuals";

const [label, outDir, mapArg] = process.argv.slice(2);
if (!label || !outDir || !mapArg) throw new Error("Használat: lesson-trial.mts <címke> <kimeneti mappa> <mapId,mapId,...>");
mkdirSync(outDir, { recursive: true });

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");

// Az éles runbook: a legutóbbi gyártás tulajdonosának aktív tanult szabályai (learning-store.ts `load` lekérdezése).
const run = (await db.query("SELECT owner_id, snapshot->'definition'->>'mode' AS mode FROM lesson_workflow_runs ORDER BY created_at DESC LIMIT 1")).rows[0];
const mode = (run?.mode ?? "upload") as Parameters<typeof skillSnapshot>[0];
const codes = run ? (await db.query("SELECT DISTINCT code FROM lesson_skill_lessons WHERE owner_id=$1 AND skill=$2 AND method_version=$3 AND state='active'",
  [run.owner_id, skillForMode(mode), SKILL_METHOD_VERSION])).rows.map((r) => r.code as string) : [];
const snapshot = skillSnapshot(mode, codes);
console.log(`[${label}] runbook: mód=${mode}, aktív tanult szabályok: ${codes.join(", ") || "–"}`);

async function loadMap(mapId: string) {
  const meta = (await db.query("SELECT id, title, subject, classroom, source_text FROM knowledge_maps WHERE id=$1", [mapId])).rows[0];
  if (!meta) throw new Error(`Nincs ilyen térkép: ${mapId}`);
  const all = (await db.query("SELECT id, local_id, term, definition, quote, exam_weight, review_state FROM km_concepts WHERE map_id=$1", [mapId])).rows;
  const taught = all.filter((c) => (TAUGHT_REVIEW_STATES as readonly string[]).includes(c.review_state));
  const concepts: MapConcept[] = taught.map((c) => ({ id: c.id, localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }));
  // a térkép legutóbbi jobjának témafókusza (élesben a job a fókuszált másolaton dolgozik)
  const focus = (await db.query("SELECT output->'topicFocus' AS f FROM studio_jobs WHERE map_id=$1 AND output ? 'topicFocus' ORDER BY created_at DESC LIMIT 1", [mapId])).rows[0]?.f as TopicFocus | undefined;
  return { meta, concepts: applyTopicFocus({ concepts }, focus).concepts, pending: all.length - taught.length, focus: focus ?? null };
}

const results: Array<Record<string, unknown>> = [];
await withPreparationSkill(snapshot, async () => {
  for (const mapId of mapArg.split(",")) {
    const started = Date.now();
    const row: Record<string, unknown> = { label, mapId };
    try {
      const map = await loadMap(mapId);
      const promptMap = { title: map.meta.title, subject: map.meta.subject, classroom: map.meta.classroom, concepts: map.concepts };
      Object.assign(row, { title: map.meta.title, grade: map.meta.classroom, taughtConcepts: map.concepts.length, pendingConcepts: map.pending, topicFocus: map.focus ? map.focus.localIds.length : null });

      const pedModel = resolveStudioModel("pedagogue");
      const ped = await callStepModel(createStudioStepProvider(pedModel, "pedagogue"), {
        step: "pedagogue", role: "pedagogue", model: pedModel, user: "Válaszolj kizárólag a kért JSON-nal.",
        system: buildPedagoguePrompt(promptMap, pickVisualWorld()),
      });
      const fixed = autofixOutline(ped.json, map.concepts);
      const outline = outlineSchema.safeParse(fixed.outline);
      if (!outline.success) throw new Error(`a vázlat alakilag hibás: ${outline.error.issues.slice(0, 3).map((i) => i.message).join("; ")}`);
      const outlineCov = outlineCoversMap(outline.data.sections, map.concepts);

      const authModel = resolveStudioModel("author");
      const auth = await callStepModel(createStudioStepProvider(authModel, "author"), {
        step: "author", role: "author", model: authModel, user: "Válaszolj kizárólag a kért JSON-nal.",
        system: buildAuthorPrompt(outline.data.sections, promptMap, []),
      });
      // A programmezők (title/subject/classroom/mapId) élesben a program értékei; ha a szerző üresen hagyja, az éles út javító kört
      // indít (step-runner.ts:1033–1047) — a harness javító kör nélkül fut, ezért a program értékét írja be, a tanítás változatlan.
      const raw = auth.json && typeof auth.json === "object" ? auth.json as Record<string, unknown> : {};
      const parsed = lessonSchema.safeParse({ ...raw, mapId, title: raw.title || map.meta.title, subject: map.meta.subject, classroom: map.meta.classroom, sourceOnly: true });
      writeFileSync(`${outDir}/${label}-${mapId}.json`, JSON.stringify({ outline: outline.data, lesson: auth.json }, null, 2));
      if (!parsed.success) throw new Error(`a lecke sémahibás: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      const gate = checkCoverageGate(parsed.data, map.concepts);
      const arc = checkLessonArc(parsed.data);
      Object.assign(row, {
        outlineSections: outline.data.sections.length, outlineCoversMap: outlineCov.ok,
        coverageGateOk: gate.ok, coverageReasons: gate.reasons.slice(0, 5), arcOk: arc.ok, arcReasons: arc.reasons.slice(0, 5),
        ...measureLesson(parsed.data, { sourceText: map.meta.source_text ?? "", concepts: map.concepts }),
        tokens: { pedagogue: ped.usage, author: auth.usage },
      });
    } catch (error) {
      // az ok-lánc (állapotkód, típus, üzenet) — az általános „a szolgáltató hibát jelzett” önmagában nem diagnosztizálható
      const chain: string[] = [];
      for (let e: unknown = error, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
        const x = e as { name?: string; status?: number; message?: string };
        chain.push([x.name, x.status, x.message?.slice(0, 300)].filter(Boolean).join(" "));
      }
      row.error = chain.join(" ← ").replace(/sk-[A-Za-z0-9_-]{10,}/g, "<redaktálva>");
    }
    row.seconds = Math.round((Date.now() - started) / 1000);
    results.push(row);
    console.log(`[${label}] ${row.title ?? mapId}: ${row.error ? "HIBA " + row.error : `${row.visibleWords} szó, ${row.sections} fejezet, forrás→lecke ${row.sourceInLessonPct}%, nem-forrás ${row.nonSourcePct}%, kapu ${row.coverageGateOk ? "OK" : "BUKOTT"}, ív ${row.arcOk ? "OK" : "BUKOTT"}`} (${row.seconds} s)`);
  }
});
await db.end();
writeFileSync(`${outDir}/${label}-summary.json`, JSON.stringify(results, null, 2));
// a step-runner importja a szerver DB-poolját is betölti — nyitva tartaná a folyamatot
process.exit(0);
