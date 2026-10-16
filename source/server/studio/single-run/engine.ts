/**
 * Egyfutásos tananyaggyártás — a motor (docs/specs/2026-10-16-egy-futas.md, B; végrehajtás: S3).
 *
 * Tulajdonosi döntés 2026-10-16: EGY modell, EGY beszélgetésben, a pipeline sorrendjében viszi végig a gyártást: forrás beolvasása és
 * megértése → tudásbank → tananyagterv → tananyag → ábrák → gyakorlóbank → lektorálás → belső javítás → végellenőrzés → közzététel.
 * A program fordulónként egy feladatot ad; a modell JSON-t ad vissza; a meglévő DETERMINISZTIKUS ellenőrzők eredménye UGYANABBAN a
 * beszélgetésben megy vissza, és a modell ott javít (állomásonként legfeljebb 3 javító forduló). Más modell nem hívódik.
 */
import { lessonSchema, type Lesson } from "../../../shared/lesson-schema";
import { experienceProblems } from "../../../shared/lesson-experience-validation";
import { verifyLessonSkillBank } from "../../../shared/lesson-skill-checks";
import { checkLessonArc } from "../../../shared/lesson-arc";
import { OPEN_ANSWER_RULES_HU } from "../../../shared/lesson-experience-score";
import { checkVerbatim } from "../verbatim";
import { checkCoverageGate, type MapConcept } from "../coverage";
import { buildAuthorPrompt, buildAnimatorPrompt, buildLektorPrompt, buildPedagoguePrompt, checkAnimatorResult, lessonIdsSubsetOfMap, outlineCoversMap, outlineSchema, parseLektorResponse, type OwnerContext } from "../step-io";
import { autofixOutline } from "../tools/outline-autofix";
import { applyVisualPatch } from "../visual-patch";
import { stripUngroundedAnimateLabels } from "../grounding";
import { ensureSectionVisuals } from "../section-visuals";
import { buildLessonExperience, resolveBankReview, type ExperienceCheckpoint } from "../experience-builder";
import { classifyNotes } from "../lektor";
import { splitLimitBlockers } from "../limit-policy";
import { resolveChoiceGate, type JobPatch, type PipelineStore } from "../step-runner";
import { conceptIdResolver, exportQuizItemsForPublish } from "../quiz-export";
import { parseModelJson } from "../run-step";
import { roleSkillBlock } from "../role-skills";
import { workflowPhase, workflowResource } from "../../workflows/engine";
import type { ExtractorFile } from "../extractor";
import type { LessonConversation, TurnBlock } from "./conversation";

export const SINGLE_RUN_VERSION = "single-run-1";
/** Állomásonként ennyi javító forduló jár a determinisztikus visszajelzés után. */
export const SINGLE_RUN_FIX_ROUNDS = 3;
/** A lektorálás legfeljebb ennyi kör (lektor → javítás → újra lektor). */
export const SINGLE_RUN_REVIEW_ROUNDS = 2;

export type SingleRunPhase = "extract" | "pedagogue" | "author" | "animator" | "lektor" | "gate" | "done";
export class SingleRunError extends Error {
  constructor(readonly station: string, readonly problems: string[]) { super(`${station}: ${problems.slice(0, 8).join(" | ").slice(0, 1200)}`); this.name = "SingleRunError"; }
}

export type SourceConcept = { id: string; term: string; definition: string; quote: string; type: string; examWeight: "core" | "supporting" | "extra"; relatedIds: string[]; verbatimOk: boolean };
export type SingleRunMap = { title: string; subject: string; classroom: number; transcript: string; concepts: SourceConcept[] };

export type SingleRunDeps = {
  conversation: LessonConversation;
  store: PipelineStore;
  /** A térkép (és a jóváhagyott fogalmak) mentése; az azonosítót adja vissza. */
  saveMap(map: SingleRunMap, files: ExtractorFile[]): Promise<string>;
  /** Haladás a felületnek (`one_step_runs` fázis + részlet) és a job tükrözése. */
  onPhase?(phase: SingleRunPhase, detail: string | null): void;
  /** A job és a térkép azonosítója, amint létrejöttek (a felület követéséhez és a piszkozathoz). */
  onJob?(jobId: string, mapId: string): void;
  log?(message: string): void;
};

/** A gyártás teljes módszertana EGY rendszerpromptban (a szerep-skillek egyszer, gyorsítótárazva). */
export function singleRunSystemPrompt(): string {
  return [
    "Te vagy a WEBSULI tananyaggyártója. EGYEDÜL, egy beszélgetésben készíted el a tananyagot a forrásból a közzétételig, a pipeline",
    "sorrendjében. Minden fordulóban PONTOSAN azt a JSON-t add vissza, amit a forduló kér — magyarázat, kódblokk-keret nélkül.",
    "Ha a program ellenőrzése hibát jelez, ugyanabban a beszélgetésben javítsd, és a TELJES kért JSON-t add vissza újra.",
    "Csak a forrás tényei taníthatók; amit a forrás nem igazol, azt ne állítsd.",
    "",
    "A SZÖVEGES FELADATOK PONTOZÁSI SZABÁLYAI (a program ezt futtatja):",
    ...OPEN_ANSWER_RULES_HU,
    "",
    ...(["pedagogue", "author", "animator", "bank", "lektor"] as const).map((role) => roleSkillBlock(role)).filter(Boolean),
  ].join("\n");
}

const text = (t: string): TurnBlock => ({ type: "text", text: t });

/**
 * Egy állomás: kérés → JSON → determinisztikus ellenőrzés → (hiba esetén) visszajelzés ugyanabban a beszélgetésben, legfeljebb
 * SINGLE_RUN_FIX_ROUNDS javító fordulóval. A végén vagy az elfogadott érték, vagy SingleRunError a pontos okokkal.
 */
async function station<T>(deps: SingleRunDeps, name: string, request: TurnBlock[], validate: (json: unknown) => { ok: true; value: T } | { ok: false; problems: string[] }): Promise<T> {
  let blocks = request;
  let problems: string[] = [];
  for (let round = 0; round <= SINGLE_RUN_FIX_ROUNDS; round++) {
    const reply = await deps.conversation.send(blocks);
    if (reply.truncated) {
      problems = ["A válasz elérte a kimeneti keretet és levágódott."];
    } else {
      let json: unknown;
      try { json = parseModelJson(reply.text).json; }
      catch (error) { problems = [`A válasz nem értelmezhető JSON: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`]; json = undefined; }
      if (json !== undefined) {
        const result = validate(json);
        if (result.ok) return result.value;
        problems = result.problems;
      }
    }
    deps.log?.(`[EGYFUTÁS] ${name}: ${round + 1}. ellenőrzés hibás (${problems.length}): ${problems.slice(0, 3).join(" | ").slice(0, 400)}`);
    blocks = [text(`A PROGRAM ELLENŐRZÉSE (${name}) ezeket a hibákat találta:\n- ${problems.slice(0, 40).join("\n- ")}\nJavítsd mindet, és add vissza a TELJES kért JSON-t újra.`)];
  }
  throw new SingleRunError(name, problems);
}

function ownerContextOf(instruction?: string): OwnerContext | undefined {
  return instruction ? { instruction } : undefined;
}

/** 1. állomás — a forrás beolvasása, megértése, tudásbank (fogalmak szó szerinti idézettel; az idézetet a program az átiraton méri). */
async function readSource(deps: SingleRunDeps, files: ExtractorFile[], instruction?: string): Promise<SingleRunMap> {
  const request: TurnBlock[] = [
    ...files.map((file): TurnBlock => ({ type: "source", file })),
    text([
      "1. ÁLLOMÁS — A FORRÁS BEOLVASÁSA ÉS A TUDÁSBANK.",
      instruction ? `A TANÁR KÉRÉSE (elsőbbséget élvez a terjedelemben, a fókuszban és az évfolyamban): ${instruction}` : "",
      "Olvasd be a fenti forrást (képet / PDF-et betűhíven), értsd meg, és add vissza:",
      '{"title": string, "subject": string (magyar tantárgynév), "classroom": 0-12 egész, "transcript": string (a forrás teljes, betűhű átirata),',
      ' "concepts": [{"id": string (rövid, egyedi), "term": string, "definition": string (a forrás alapján), "quote": string (SZÓ SZERINT az átiratból),',
      '  "type": string, "examWeight": "core" | "supporting" | "extra", "relatedIds": string[]}]}',
      "A forrás minden tanítandó fogalma szerepeljen; a quote betűre egyezzen az átirat egy részével.",
    ].filter(Boolean).join("\n")),
  ];
  return station(deps, "forrás és tudásbank", request, (json) => {
    const raw = json as Partial<SingleRunMap> & { concepts?: Array<Partial<SourceConcept>> };
    const problems: string[] = [];
    if (!raw || typeof raw !== "object") return { ok: false, problems: ["A válasz nem objektum."] };
    if (typeof raw.transcript !== "string" || raw.transcript.trim().length < 20) problems.push("Hiányzik a forrás átirata (transcript).");
    if (typeof raw.subject !== "string" || !raw.subject.trim()) problems.push("Hiányzik a tantárgy (subject).");
    if (!Number.isInteger(raw.classroom) || (raw.classroom as number) < 0 || (raw.classroom as number) > 12) problems.push("A classroom 0 és 12 közötti egész legyen.");
    const concepts = Array.isArray(raw.concepts) ? raw.concepts : [];
    if (!concepts.length) problems.push("Nincs egyetlen fogalom sem (concepts).");
    const ids = new Set<string>();
    const checked: SourceConcept[] = [];
    for (const c of concepts) {
      if (typeof c.id !== "string" || !c.id.trim() || ids.has(c.id)) { problems.push(`Hiányzó vagy ismétlődő fogalomazonosító: ${String(c.id)}`); continue; }
      ids.add(c.id);
      if (typeof c.term !== "string" || typeof c.definition !== "string" || typeof c.quote !== "string") { problems.push(`${c.id}: hiányzó term/definition/quote.`); continue; }
      const weight = c.examWeight === "core" || c.examWeight === "supporting" || c.examWeight === "extra" ? c.examWeight : null;
      if (!weight) { problems.push(`${c.id}: az examWeight core / supporting / extra legyen.`); continue; }
      const verbatim = typeof raw.transcript === "string" ? checkVerbatim(c.quote, raw.transcript) : { ok: false };
      if (!verbatim.ok) problems.push(`${c.id}: a quote nem szó szerint szerepel az átiratban: „${c.quote.slice(0, 120)}”.`);
      checked.push({ id: c.id, term: c.term, definition: c.definition, quote: c.quote, type: typeof c.type === "string" ? c.type : "concept", examWeight: weight,
        relatedIds: Array.isArray(c.relatedIds) ? c.relatedIds.filter((r): r is string => typeof r === "string") : [], verbatimOk: verbatim.ok });
    }
    if (problems.length) return { ok: false, problems };
    return { ok: true, value: { title: (raw.title ?? "").trim() || "Névtelen tananyag", subject: raw.subject!.trim(), classroom: raw.classroom as number, transcript: raw.transcript!, concepts: checked } };
  });
}

export type SingleRunInput = { files: ExtractorFile[]; instruction?: string; title?: string; ownerId: string };
export type SingleRunResult = { mapId: string; jobId: string; lessonId: string; htmlFileId: string; model: string; warnings: string[] };

/**
 * A teljes gyártás egy beszélgetésben. A job állomásonként menti az elkészült részeket és a beszélgetést (`output.singleRun`); a
 * `step` mező a felület számára tükrözi az állomást. Hiba esetén SingleRunError (a mentett piszkozat megmarad).
 */
export async function runSingleLesson(input: SingleRunInput, deps: SingleRunDeps): Promise<SingleRunResult> {
  const { conversation, store } = deps;
  const log = (m: string) => deps.log?.(m);
  const phase = (p: SingleRunPhase, detail: string | null) => deps.onPhase?.(p, detail);
  const owner = ownerContextOf(input.instruction);

  // 1. Forrás + tudásbank.
  await workflowPhase("source"); await workflowPhase("scope");
  phase("extract", "A forrás beolvasása és megértése…");
  const read = await readSource(deps, input.files, input.instruction);
  await workflowPhase("knowledge");
  const mapId = await deps.saveMap({ ...read, title: input.title?.trim() || read.title }, input.files);
  await workflowPhase("sourceCheck");
  const map = await store.loadMap(mapId);
  if (!map || !map.concepts.length) throw new SingleRunError("tudásbank", ["A mentett tudásbankban nincs fogalom."]);
  const concepts: MapConcept[] = map.concepts;
  const promptMap = { title: map.meta.title, subject: map.meta.subject, classroom: map.meta.classroom, concepts };
  const jobId = await store.createJob({ mapId, step: "pedagogue", status: "running", model: conversation.model, promptVersion: SINGLE_RUN_VERSION, inputHash: `${SINGLE_RUN_VERSION}:${mapId}` });
  await workflowResource(jobId); // review #260: a job a futás gazdájához kötött (piszkozatkezelés, lízing)
  const save = async (step: Exclude<SingleRunPhase, "extract"> | "error", output: Record<string, unknown>, extra: JobPatch = {}) =>
    store.saveStep(jobId, { step, ...extra, output: { ...output, singleRun: { version: SINGLE_RUN_VERSION, conversation: conversation.state() } } });
  deps.onJob?.(jobId, mapId);
  let output: Record<string, unknown> = { ...(input.instruction ? { ownerInstruction: input.instruction } : {}) };
  await save("pedagogue", output);
  try {
    return await produce();
  } catch (error) {
    // A megállás oka a jobon (a piszkozat és a beszélgetés megmarad, a felület és a draftlista mutatja).
    const reason = error instanceof Error ? error.message.slice(0, 1500) : "Az egyfutásos gyártás megállt.";
    await save("error", output, { status: "error", error: reason, finishedAt: new Date() }).catch(() => undefined);
    throw error;
  }

  async function produce(): Promise<SingleRunResult> {
  // 2. Tananyagterv.
  await workflowPhase("pedagogue");
  phase("pedagogue", "A tananyagterv készül…");
  const outline = await station(deps, "tananyagterv", [text(`2. ÁLLOMÁS — TANANYAGTERV.\n${buildPedagoguePrompt(promptMap, undefined, owner)}\nVálaszolj kizárólag a vázlat JSON-jával.`)], (json) => {
    const fixed = autofixOutline(json, concepts).outline;
    const parsed = outlineSchema.safeParse(fixed);
    if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    const covers = outlineCoversMap(parsed.data.sections, concepts);
    return covers.ok ? { ok: true, value: parsed.data } : { ok: false, problems: [`A vázlat nem fedi le a kötelező fogalmakat: ${JSON.stringify(covers).slice(0, 600)}`] };
  });
  output = { ...output, outline, approvedOutline: outline };
  await save("author", output);

  // 3. Tananyag (tanítás).
  await workflowPhase("author");
  phase("author", "A tananyag készül…");
  const authorRequest = (notes: Parameters<typeof buildAuthorPrompt>[2]) =>
    [text(`3. ÁLLOMÁS — TANANYAG.\n${buildAuthorPrompt(outline.sections, promptMap, notes, undefined, owner)}\nVálaszolj kizárólag a teljes lecke JSON-jával (gyakorlóbank nélkül).`)];
  const validateLesson = (json: unknown): { ok: true; value: Lesson } | { ok: false; problems: string[] } => {
    const parsed = lessonSchema.safeParse({ ...(json as object), mapId, sourceOnly: true });
    if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".")}: ${i.message}`) };
    const unknown = lessonIdsSubsetOfMap(parsed.data, concepts);
    return unknown.length ? { ok: false, problems: [`A tudásbankban nem szereplő fogalomazonosítók: ${unknown.join(", ")}`] } : { ok: true, value: parsed.data };
  };
  let lesson = await station(deps, "tananyag", authorRequest([]), validateLesson);
  output = { ...output, lesson };
  await save("animator", output);

  // 4. Ábrák (a tanítás szerkezete érintetlen; hibás ábrafolt esetén az eredeti tanítás megy tovább).
  await workflowPhase("animator");
  phase("animator", "Ábrák és gyakorlóbank készül…");
  try {
    const reply = await conversation.send([text(`4. ÁLLOMÁS — ÁBRÁK.\n${buildAnimatorPrompt(lesson, promptMap)}\nVálaszolj kizárólag az ábrafolt JSON-jával.`)]);
    const patched = applyVisualPatch(lesson, parseModelJson(reply.text).json, concepts);
    const checked = patched ? lessonSchema.safeParse(patched.lesson) : null;
    if (patched && checked?.success && checkAnimatorResult(lesson, checked.data).ok) lesson = checked.data;
    else log("[EGYFUTÁS] Az ábrafolt nem illeszthető — az eredeti tanítás megy tovább.");
  } catch (error) { log(`[EGYFUTÁS] Az ábra-forduló elmaradt: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`); }
  lesson = ensureSectionVisuals(stripUngroundedAnimateLabels(lesson, concepts).lesson, concepts).lesson;

  // 5. Gyakorlóbank — a meglévő banképítő, a modellhívás UGYANEBBE a beszélgetésbe kötve (kvóta, autofix, séma, javító kísérletek).
  let checkpoint: ExperienceCheckpoint | undefined;
  const buildBank = async (base: Lesson, extra: { reviewFeedback?: ReturnType<typeof resolveBankReview>; previous?: Lesson["experience"] } = {}) =>
    buildLessonExperience(base, concepts, {
      call: async (system, user) => parseModelJson((await conversation.send([text(`5. ÁLLOMÁS — GYAKORLÓBANK (egy fejezet csomagja).\n${system}\n\n${user}`)])).text).json,
      concurrency: 1,
      ...(checkpoint ? { checkpoint } : {}),
      ...(extra.previous ? { previous: extra.previous } : {}),
      ...(extra.reviewFeedback?.length ? { reviewFeedback: extra.reviewFeedback } : {}),
      save: async (cp) => { checkpoint = cp; await save("animator", { ...output, lesson: base, experienceCheckpoint: cp }); },
      onToolFix: (tool, fixes) => log(`[EGYFUTÁS] ${tool}: ${fixes.join("; ").slice(0, 300)}`),
      onAttemptFailure: (section, attempt, reason) => log(`[EGYFUTÁS] bankcsomag ${section + 1}. fejezet, ${attempt + 1}. kísérlet: ${reason.slice(0, 300)}`),
    });
  lesson = { ...lesson, experience: await buildBank(lesson) };
  output = { ...output, lesson, experienceCheckpoint: checkpoint };
  await save("lektor", output);

  // 6. Lektorálás és belső javítás (legfeljebb SINGLE_RUN_REVIEW_ROUNDS javító kör). Tanítási hiba → javított lecke; banktétel-hiba →
  // kivétel, ha a padló megmarad, különben a banképítő javító köre a lektori visszajelzéssel. Az utolsó javító kör változását egy
  // csak ellenőrző kör lektorálja újra (review #260): lektorálatlan javítás nem kerül közzétételre.
  await workflowPhase("lektor");
  const warnings: string[] = [];
  for (let round = 0; round <= SINGLE_RUN_REVIEW_ROUNDS; round++) {
    phase("lektor", `Lektorálás (${round + 1}. kör)…`);
    const report = await station(deps, "lektorálás", [text(`6. ÁLLOMÁS — LEKTORÁLÁS (${round + 1}. kör). A forráshoz mérve, szigorúan.\n${buildLektorPrompt(lesson, promptMap, [], owner)}\nVálaszolj kizárólag a lektori jelentés JSON-jával.`)],
      (json) => {
        const r = parseLektorResponse(json);
        if (!r.ok) return { ok: false, problems: [r.reason] };
        // Review #260: megoldáseltérés blokkoló jegyzet nélkül önellentmondó jelentés — a lektor jelezze jegyzettel, vagy helyesbítsen.
        const mismatches = (r.report.solutions ?? []).filter((sol) => !sol.match);
        if (mismatches.length && !classifyNotes(r.report.notes).some((n) => n.blocking))
          return { ok: false, problems: mismatches.map((m) => `${m.task}: a saját megoldásod (${m.own}) eltér a leckétől (${m.lesson}), de nincs hozzá blokkoló jegyzet — adj blokkoló jegyzetet a hibás blokk útvonalával, vagy helyesbítsd a match értékét, ha mégis egyezik.`) };
        return { ok: true, value: r.report };
      });
    const blocking = classifyNotes(report.notes).filter((n) => n.blocking);
    if (!blocking.length) break;
    if (round === SINGLE_RUN_REVIEW_ROUNDS) throw new SingleRunError("lektorálás", blocking.map((n) => `${n.blockPath ?? "—"}: ${n.message}`));
    const bankNotes = blocking.filter((n) => /^experience(?:\.|\[|$)/.test(n.blockPath ?? ""));
    const teachingNotes = blocking.filter((n) => !/^experience(?:\.|\[|$)/.test(n.blockPath ?? ""));
    if (teachingNotes.length) {
      if (round === SINGLE_RUN_REVIEW_ROUNDS - 1) throw new SingleRunError("lektorálás", teachingNotes.map((n) => `${n.blockPath ?? "—"}: ${n.message}`));
      phase("author", "A lektor jelzései alapján javítás…");
      const fixed = await station(deps, "javított tananyag", authorRequest(teachingNotes), validateLesson);
      lesson = { ...fixed, experience: await buildBank(fixed, { previous: lesson.experience }) };
    }
    if (bankNotes.length) {
      const split = splitLimitBlockers(lesson, bankNotes);
      const removal = split.removable.length && !split.factual.length && !split.incomplete.length ? resolveChoiceGate(lesson, split.removable) : { error: "nem kivehető" };
      if (!("error" in removal)) { lesson = removal.lesson; warnings.push(`Lektor szerint hibás banktétel kivéve: ${removal.removed.join(", ")}`); }
      else lesson = { ...lesson, experience: await buildBank(lesson, { previous: lesson.experience, reviewFeedback: resolveBankReview(lesson, bankNotes) }) };
    }
    output = { ...output, lesson, experienceCheckpoint: checkpoint };
    await save("lektor", output);
  }

  // 7. Végellenőrzés (ugyanazok a determinisztikus kapuk, mint a régi végkapun) és közzététel.
  await workflowPhase("gate");
  phase("gate", "Végellenőrzés és közzététel…");
  const final = lessonSchema.safeParse(lesson);
  if (!final.success) throw new SingleRunError("végellenőrzés", final.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`));
  const coverage = checkCoverageGate(final.data, concepts);
  const skill = verifyLessonSkillBank(final.data.experience, final.data.subject, final.data.sections);
  const problems = [...experienceProblems(final.data), ...(skill.ok ? [] : skill.problems), ...(coverage.ok ? [] : coverage.reasons), ...(checkLessonArc(final.data).ok ? [] : checkLessonArc(final.data).reasons)];
  if (problems.length) throw new SingleRunError("végellenőrzés", problems);
  const lessonId = await store.upsertLesson(null, mapId, final.data);
  const published = await store.publishLesson({
    lessonId, mapId, title: final.data.title, classroom: final.data.classroom, coverage: coverage.coverage,
    quizItems: exportQuizItemsForPublish(final.data, lessonId, conceptIdResolver(concepts)),
  });
  await store.saveStep(jobId, { step: "done", status: "ok", lessonId, finishedAt: new Date(),
    output: { ...output, lesson: final.data, htmlFileId: published.htmlFileId, exportedQuizItems: published.exportedQuizItems, quality: { removed: [], warnings },
      singleRun: { version: SINGLE_RUN_VERSION, conversation: conversation.state() } } });
  phase("done", "A tananyag elkészült és közzétéve.");
  log(`[EGYFUTÁS] Kész: lecke ${lessonId} → html_files ${published.htmlFileId}, modell: ${conversation.model}`);
  return { mapId, jobId, lessonId, htmlFileId: published.htmlFileId, model: conversation.model, warnings };
  }
}
