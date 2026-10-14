// Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S1): offline próbaharness — a VALÓDI tervező- és szerzőpromptot futtatja a
// valódi modellen, DB-ÍRÁS NÉLKÜL, majd a kapukat és a mérést lefuttatja.
// Review #210: (1) a prompt az ÉLES feloldáson megy át — `skilledPromptLookup` + `studioPromptStore`, ugyanazzal az összetétellel,
// mint step-runner.ts:264-285 (szerep-skill, DB-felülírás + „Aktuális kötelező szerződés”), (2) a TÉRKÉP tulajdonosának aktív
// tanult szabályai (learning-store.ts `load`), (3) ellenőrzött TLS, csak-olvasó tranzakció (scripts/lib/read-only-db),
// (4) bármely hibánál nem-nulla kilépési kód.
// Eltérés az éles úttól (jelölve): a kapcsolós katalógus-blokk (S6) és tantárgyi memória (S5) nem kerül be; javító kör nincs;
// a szerző tétlenségi időtúllépésénél egy újrapróba (jelölve: idleRetry).
// Futtatás (source/ mappából): npx tsx scripts/measure/lesson-trial.mts <címke> <kimeneti mappa> <mapId,mapId,...>
import { mkdirSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import { resolveStudioModel } from "../../server/ai/models";
import { createStudioStepProvider } from "../../server/ai/studio-provider";
import { checkCoverageGate, type MapConcept } from "../../server/studio/coverage";
import { measureLesson } from "../../server/studio/lesson-metrics";
import { STUDIO_PROMPT_NAMES, studioPromptStore } from "../../server/studio/prompt";
import { skilledPromptLookup } from "../../server/studio/role-skills";
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

type TrialMap = {
  mapId: string; title: string; subject: string; classroom: number; sourceText: string;
  concepts: MapConcept[]; pending: number; focus: TopicFocus | null; mode: Parameters<typeof skillSnapshot>[0]; codes: string[];
};

// Minden adat előre, egy csak-olvasó tranzakcióban — a modellhívások alatt nincs nyitott DB-tranzakció.
const maps: TrialMap[] = await withReadOnlyDb(async (query) => {
  const out: TrialMap[] = [];
  for (const mapId of mapArg.split(",")) {
    const [meta] = await query<{ title: string; subject: string; classroom: number; source_text: string | null; created_by: string | null }>(
      "SELECT title, subject, classroom, source_text, created_by FROM knowledge_maps WHERE id=$1", [mapId]);
    if (!meta) throw new Error(`Nincs ilyen térkép: ${mapId}`);
    const all = await query<{ id: string; local_id: string; term: string; definition: string; quote: string; exam_weight: string; review_state: string }>(
      "SELECT id, local_id, term, definition, quote, exam_weight, review_state FROM km_concepts WHERE map_id=$1", [mapId]);
    const taught = all.filter((c) => (TAUGHT_REVIEW_STATES as readonly string[]).includes(c.review_state));
    const concepts = taught.map((c) => ({ id: c.id, localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight }) as MapConcept);
    const [job] = await query<{ f: TopicFocus | null }>("SELECT output->'topicFocus' AS f FROM studio_jobs WHERE map_id=$1 AND output ? 'topicFocus' ORDER BY created_at DESC LIMIT 1", [mapId]);
    // a TÉRKÉP tulajdonosának tanult szabályai, a legutóbbi gyártása módjával (alapértelmezés: upload)
    const owner = meta.created_by;
    const [run] = owner ? await query<{ mode: string | null }>("SELECT snapshot->'definition'->>'mode' AS mode FROM lesson_workflow_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1", [owner]) : [];
    const mode = (run?.mode ?? "upload") as TrialMap["mode"];
    const codes = owner ? (await query<{ code: string }>("SELECT DISTINCT code FROM lesson_skill_lessons WHERE owner_id=$1 AND skill=$2 AND method_version=$3 AND state='active'",
      [owner, skillForMode(mode), SKILL_METHOD_VERSION])).map((r) => r.code) : [];
    out.push({ mapId, title: meta.title, subject: meta.subject, classroom: meta.classroom, sourceText: meta.source_text ?? "",
      concepts: applyTopicFocus({ concepts }, job?.f ?? null).concepts, pending: all.length - taught.length, focus: job?.f ?? null, mode, codes });
  }
  return out;
});

// Az éles prompt-feloldás (step-runner.ts:264-285 resolveDeps), a workflow-pillanatkép nélkül.
const promptLookup = skilledPromptLookup(async (name: string, fallback: string) => {
  const resolved = await studioPromptStore.get(name, "");
  return resolved ? `${resolved}\n\nAktuális kötelező szerződés és forrásadatok (eltérésnél ez az irányadó):\n${fallback}` : fallback;
});

const isIdle = (e: unknown) => { for (let x = e as { name?: string; cause?: unknown } | undefined, d = 0; x && d < 4; x = x.cause as typeof x, d++) if (x.name === "AIProviderIdleTimeoutError") return true; return false; };
const results: Array<Record<string, unknown>> = [];
for (const map of maps) {
  const started = Date.now();
  const row: Record<string, unknown> = { label, mapId: map.mapId, title: map.title, grade: map.classroom, taughtConcepts: map.concepts.length,
    pendingConcepts: map.pending, topicFocus: map.focus ? map.focus.localIds.length : null, mode: map.mode, rules: map.codes };
  try {
    await withPreparationSkill(skillSnapshot(map.mode, map.codes), async () => {
      const promptMap = { title: map.title, subject: map.subject, classroom: map.classroom, concepts: map.concepts };
      const pedModel = resolveStudioModel("pedagogue");
      const ped = await callStepModel(createStudioStepProvider(pedModel, "pedagogue"), {
        step: "pedagogue", role: "pedagogue", model: pedModel, user: "Válaszolj kizárólag a kért JSON-nal.",
        system: await promptLookup(STUDIO_PROMPT_NAMES.pedagogue, buildPedagoguePrompt(promptMap, pickVisualWorld())),
      });
      const outline = outlineSchema.safeParse(autofixOutline(ped.json, map.concepts).outline);
      if (!outline.success) throw new Error(`a vázlat alakilag hibás: ${outline.error.issues.slice(0, 3).map((i) => i.message).join("; ")}`);
      const outlineCov = outlineCoversMap(outline.data.sections, map.concepts);

      const authModel = resolveStudioModel("author");
      const authorSystem = await promptLookup(STUDIO_PROMPT_NAMES.author, buildAuthorPrompt(outline.data.sections, promptMap, []));
      // bizonyíték (review #210): a feloldott prompt a szerep-skillel indul, mint élesben
      row.authorRoleSkill = authorSystem.includes("# Skill: szerző");
      const authorCall = () => callStepModel(createStudioStepProvider(authModel, "author"), {
        step: "author", role: "author", model: authModel, user: "Válaszolj kizárólag a kért JSON-nal.", system: authorSystem,
      });
      let auth: Awaited<ReturnType<typeof authorCall>>;
      try { auth = await authorCall(); } catch (error) {
        if (!isIdle(error)) throw error;
        row.idleRetry = true;
        auth = await authorCall();
      }
      // A programmezők (title/subject/classroom/mapId) élesben a program értékei; ha a szerző üresen hagyja, az éles út javító kört
      // indít (step-runner.ts:1033–1047) — a harness javító kör nélkül fut, ezért a program értékét írja be, a tanítás változatlan.
      const raw = auth.json && typeof auth.json === "object" ? auth.json as Record<string, unknown> : {};
      const parsed = lessonSchema.safeParse({ ...raw, mapId: map.mapId, title: raw.title || map.title, subject: map.subject, classroom: map.classroom, sourceOnly: true });
      writeFileSync(`${outDir}/${label}-${map.mapId}.json`, JSON.stringify({ outline: outline.data, lesson: auth.json }, null, 2));
      if (!parsed.success) throw new Error(`a lecke sémahibás: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      const gate = checkCoverageGate(parsed.data, map.concepts);
      const arc = checkLessonArc(parsed.data);
      Object.assign(row, {
        outlineSections: outline.data.sections.length, outlineCoversMap: outlineCov.ok,
        coverageGateOk: gate.ok, coverageReasons: gate.reasons.slice(0, 5), arcOk: arc.ok, arcReasons: arc.reasons.slice(0, 5),
        ...measureLesson(parsed.data, { sourceText: map.sourceText, concepts: map.concepts }),
        tokens: { pedagogue: ped.usage, author: auth.usage },
      });
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
  console.log(`[${label}] ${map.title}: ${row.error ? "HIBA " + row.error : `${row.visibleWords} szó, ${row.sections} fejezet, forrás→lecke ${row.sourceInLessonPct}%, nem-forrás ${row.nonSourcePct}%, kapu ${row.coverageGateOk ? "OK" : "BUKOTT"}, ív ${row.arcOk ? "OK" : "BUKOTT"}${row.idleRetry ? " (újrapróba)" : ""}`} (${row.seconds} s)`);
}
writeFileSync(`${outDir}/${label}-summary.json`, JSON.stringify(results, null, 2));
// a step-runner importja a szerver DB-poolját is betölti — nyitva tartaná a folyamatot; hibás térképnél nem-nulla kód (review #210)
process.exit(results.some((r) => r.error) ? 1 : 0);
