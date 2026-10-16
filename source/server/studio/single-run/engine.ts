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
import { buildLessonExperience, resolveBankReview, RetryableBankCallError, teachingTextOf, type ExperienceCheckpoint } from "../experience-builder";
import { answerKeysFor, answerKeyTestsEnabled } from "../answer-key-writer";
import { quizBlindProblems } from "../quiz-blind-check";
import { lessonLengthBudget } from "../../../shared/lesson-length";
import { lessonVisibleText, words } from "../lesson-metrics";
import { arithmeticSourceCorrections, correctionAuditText, correctionReasonCode, type SourceCorrection } from "../source-corrections";
import { classifyNotes } from "../lektor";
import { splitLimitBlockers } from "../limit-policy";
import { openBankFindingFlags, resolveChoiceGate } from "../choice-gate";
import type { JobPatch, PipelineStore } from "../pipeline-store";
import { conceptIdResolver, exportQuizItemsForPublish } from "../quiz-export";
import { parseModelJson } from "../run-step";
import { roleSkillBlock } from "../role-skills";
import { workflowPhase, workflowResource, workflowSkillPrompt } from "../../workflows/engine";
import type { PromptRole } from "../../../shared/instruction-bundles/roles";
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

export type SourceConcept = { id: string; term: string; definition: string; quote: string; type: string; examWeight: "core" | "supporting" | "extra"; relatedIds: string[]; verbatimOk: boolean; sourceFile: string;
  /** A determinisztikus forrás-helyesbítés kódja (a térkép `verbatim_reason` oszlopa), ha a definíció helyesbítve. */
  correction?: string };
/** `fileTranscripts`: fájlnév → a fájl betűhű átirata (review #260: a fogalom eredete és idézete a saját fájlján mérve). */
/** `corrections`: a forrás hamis egyenlőségeinek determinisztikus helyesbítései (spec 2026-10-03-forras-aritmetika-helyesbites). */
export type SingleRunMap = { title: string; subject: string; classroom: number; transcript: string; fileTranscripts: Record<string, string>; concepts: SourceConcept[]; corrections: SourceCorrection[] };

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
    OPEN_ANSWER_RULES_HU,
    "",
    ...(["pedagogue", "author", "animator", "bank", "lektor"] as const).map((role) => roleSkillBlock(role)).filter(Boolean),
  ].join("\n");
}

const text = (t: string): TurnBlock => ({ type: "text", text: t });

/**
 * Review #261: a futás szerepre szűrt runbookja és tanult szabályai (`workflowSkillPrompt`) a KÉRÉS végén — a rendszerprompt (és így a
 * gyorsítótár) változatlan. Workflow-kontextuson kívül üres (nincs blokk).
 */
export function withRoleRunbook(blocks: TurnBlock[], role: PromptRole): TurnBlock[] {
  const runbook = workflowSkillPrompt(role).trim();
  return runbook ? [...blocks, text(`A FUTÁS RUNBOOKJA ÉS TANULT SZABÁLYAI ehhez a szerephez (${role}):\n${runbook}`)] : blocks;
}

/** Review #261: a feltöltött fájl valódi szövege (szöveges fájl, kinyert PDF/DOCX) — ennél a modell átirata nem lehet a mérce. */
function realSourceText(file: ExtractorFile): string | undefined {
  if (file.extractedText?.trim()) return file.extractedText;
  return file.kind === "text" && !file.content.startsWith("data:") && file.content.trim() ? file.content : undefined;
}

/**
 * Egy állomás: kérés → JSON → determinisztikus ellenőrzés → (hiba esetén) visszajelzés ugyanabban a beszélgetésben, legfeljebb
 * SINGLE_RUN_FIX_ROUNDS javító fordulóval. A végén vagy az elfogadott érték, vagy SingleRunError a pontos okokkal.
 */
export async function runStation<T>(deps: Pick<SingleRunDeps, "conversation" | "log">, name: string, request: TurnBlock[], validate: (json: unknown) => { ok: true; value: T } | { ok: false; problems: string[] }): Promise<T> {
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

/**
 * A banképítő modellhívása UGYANABBA a beszélgetésbe kötve. Review #260: a modell kimenetének hibája (csonkolt, üres, nem JSON) a
 * banképítő javító körébe megy (`RetryableBankCallError`); a szolgáltatói hiba változatlanul kilép.
 */
export function conversationBankCall(conversation: LessonConversation) {
  return async (system: string, user: string): Promise<unknown> => {
    const reply = await conversation.send(withRoleRunbook([text(`5. ÁLLOMÁS — GYAKORLÓBANK (egy fejezet csomagja).\n${system}\n\n${user}`)], "bank"));
    if (reply.truncated) throw new RetryableBankCallError("A bankcsomag válasza elérte a kimeneti keretet és levágódott.");
    try { return parseModelJson(reply.text).json; }
    catch (error) { throw new RetryableBankCallError(`A bankcsomag válasza nem értelmezhető JSON: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`); }
  };
}

/**
 * Egy JSON-kérés a beszélgetésben (a banképítő minőségkapuinak: válaszkulcs-teszt, kvíz vak előszűrő). A hívó a hibát kezeli: ezeknél a
 * kapuknál a hívás- vagy alakhiba csak az adott tétel ítéletét hagyja ki (nincs megállás).
 */
function conversationJsonCall(conversation: LessonConversation, label: string) {
  return async (system: string, user: string): Promise<unknown> => {
    const reply = await conversation.send([text(`${label}\n${system}\n\n${user}`)]);
    if (reply.truncated) throw new Error("A válasz elérte a kimeneti keretet és levágódott.");
    return parseModelJson(reply.text).json;
  };
}

function ownerContextOf(instruction?: string, corrections: SourceCorrection[] = []): OwnerContext | undefined {
  return instruction || corrections.length ? { ...(instruction ? { instruction } : {}), ...(corrections.length ? { corrections } : {}) } : undefined;
}

/** 1. állomás — a forrás beolvasása, megértése, tudásbank (fogalmak szó szerinti idézettel; az idézetet a program az átiraton méri). */
export async function readSourceStation(deps: Pick<SingleRunDeps, "conversation" | "log">, files: ExtractorFile[], instruction?: string): Promise<SingleRunMap> {
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
      files.some((f) => realSourceText(f)) ? "A szöveges (vagy már kinyert szövegű) forrásfájlnál a program a VALÓDI szöveget használja mércének: az idézet abból legyen, betűre." : "",
      files.length > 1 ? [
        `TÖBB FORRÁSFÁJL (${files.map((f) => f.name).join(", ")}): adj meg fájlonkénti átiratot is: "fileTranscripts": [{"name": fájlnév, "text": a fájl betűhű átirata}]`,
        '(minden fájlhoz egyet), és minden fogalomnál "sourceFile": a fájl neve, amelyből az idézet származik — a quote ennek a fájlnak az átiratából, szó szerint.',
      ].join("\n") : "",
    ].filter(Boolean).join("\n")),
  ];
  const names = files.map((f) => f.name);
  const real = new Map(files.flatMap((f) => { const t = realSourceText(f); return t ? [[f.name, t] as const] : []; }));
  return runStation(deps, "forrás és tudásbank", withRoleRunbook(request, "extract"), (json) => {
    const raw = json as Partial<Omit<SingleRunMap, "fileTranscripts">> & { concepts?: Array<Partial<SourceConcept>>; fileTranscripts?: unknown };
    const problems: string[] = [];
    if (!raw || typeof raw !== "object") return { ok: false, problems: ["A válasz nem objektum."] };
    if (real.size < names.length && (typeof raw.transcript !== "string" || raw.transcript.trim().length < 20)) problems.push("Hiányzik a forrás átirata (transcript).");
    if (typeof raw.subject !== "string" || !raw.subject.trim()) problems.push("Hiányzik a tantárgy (subject).");
    if (!Number.isInteger(raw.classroom) || (raw.classroom as number) < 0 || (raw.classroom as number) > 12) problems.push("A classroom 0 és 12 közötti egész legyen.");
    // Fájlonkénti átirat: egy fájlnál maga az átirat; több fájlnál a modell fájlonkénti átirata (minden fájlhoz pontosan egy).
    // Review #261: ahol a valódi szöveg elérhető, az a mérce és a mentett átirat — a modell átirata csak képnél / szkennelt PDF-nél számít.
    const perFile: Record<string, string> = {};
    if (names.length === 1) { if (typeof raw.transcript === "string") perFile[names[0]] = raw.transcript; }
    else {
      for (const t of Array.isArray(raw.fileTranscripts) ? raw.fileTranscripts as Array<{ name?: unknown; text?: unknown }> : []) {
        if (typeof t?.name === "string" && names.includes(t.name) && typeof t.text === "string" && t.text.trim()) perFile[t.name] = t.text;
      }
    }
    for (const [name, t] of real) perFile[name] = t;
    const missing = names.filter((n) => !perFile[n]);
    if (names.length > 1 && missing.length) problems.push(`Hiányzik a fájlonkénti átirat (fileTranscripts): ${missing.join(", ")}.`);
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
      const sourceFile = names.length === 1 ? names[0] : typeof c.sourceFile === "string" && names.includes(c.sourceFile) ? c.sourceFile : null;
      if (!sourceFile) { problems.push(`${c.id}: a sourceFile a forrásfájlok egyike legyen (${names.join(", ")}).`); continue; }
      const verbatim = perFile[sourceFile] !== undefined ? checkVerbatim(c.quote, perFile[sourceFile]) : { ok: false };
      if (!verbatim.ok) problems.push(`${c.id}: a quote nem szó szerint szerepel a(z) ${sourceFile} átiratában: „${c.quote.slice(0, 120)}”.`);
      checked.push({ sourceFile, id: c.id, term: c.term, definition: c.definition, quote: c.quote, type: typeof c.type === "string" ? c.type : "concept", examWeight: weight,
        relatedIds: Array.isArray(c.relatedIds) ? c.relatedIds.filter((r): r is string => typeof r === "string") : [], verbatimOk: verbatim.ok });
    }
    if (problems.length) return { ok: false, problems };
    // Spec 2026-10-03-forras-aritmetika-helyesbites (S4b: a régi útról áthozva): a forrás hamis egyenlősége (pl. a tanuló hibás
    // megoldása) nem tanítható tényként — a definíció determinisztikusan, modell nélkül helyesbítve, a helyesbítés a promptokba is megy.
    const corrections = arithmeticSourceCorrections(checked.map((c) => ({ localId: c.id, term: c.term, definition: c.definition, quote: c.quote })));
    const corrected = checked.map((c) => {
      const fix = corrections.find((f) => f.localId === c.id);
      return fix ? { ...c, ...(fix.term !== undefined ? { term: fix.term } : {}), ...(fix.definition !== undefined ? { definition: fix.definition } : {}), correction: correctionReasonCode(fix) } : c;
    });
    for (const fix of corrections) deps.log?.(`[EGYFUTÁS] Forrás-helyesbítés ${fix.localId}: ${correctionAuditText(fix)}`);
    return { ok: true, value: { title: (raw.title ?? "").trim() || "Névtelen tananyag", subject: raw.subject!.trim(), classroom: raw.classroom as number, transcript: names.length === 1 ? perFile[names[0]] : names.map((n) => perFile[n]).join("\n\n"), fileTranscripts: perFile, concepts: corrected, corrections } };
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

  // 1. Forrás + tudásbank.
  await workflowPhase("source"); await workflowPhase("scope");
  phase("extract", "A forrás beolvasása és megértése…");
  const read = await readSourceStation(deps, input.files, input.instruction);
  const owner = ownerContextOf(input.instruction, read.corrections);
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
  let output: Record<string, unknown> = { ...(input.instruction ? { ownerInstruction: input.instruction } : {}), ...(read.corrections.length ? { sourceCorrections: read.corrections } : {}) };
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
  const outline = await runStation(deps, "tananyagterv", withRoleRunbook([text(`2. ÁLLOMÁS — TANANYAGTERV.\n${buildPedagoguePrompt(promptMap, undefined, owner)}\nVálaszolj kizárólag a vázlat JSON-jával.`)], "pedagogue"), (json) => {
    const fixed = autofixOutline(json, concepts, lessonLengthBudget(promptMap).maxSections).outline;
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
    withRoleRunbook([text(`3. ÁLLOMÁS — TANANYAG.\n${buildAuthorPrompt(outline.sections, promptMap, notes, undefined, owner)}\nVálaszolj kizárólag a teljes lecke JSON-jával (gyakorlóbank nélkül).`)], "author");
  const validateLesson = (json: unknown): { ok: true; value: Lesson } | { ok: false; problems: string[] } => {
    const parsed = lessonSchema.safeParse({ ...(json as object), mapId, sourceOnly: true });
    if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".")}: ${i.message}`) };
    const unknown = lessonIdsSubsetOfMap(parsed.data, concepts);
    if (unknown.length) return { ok: false, problems: [`A tudásbankban nem szereplő fogalomazonosítók: ${unknown.join(", ")}`] };
    // Review #260: a tanításon mérhető végkapuk már itt (javító forduló jár rájuk, nem a bank és a lektor után derülnek ki).
    const coverage = checkCoverageGate(parsed.data, concepts);
    const arc = checkLessonArc(parsed.data);
    const problems = [...(coverage.ok ? [] : coverage.reasons), ...(arc.ok ? [] : arc.reasons)];
    return problems.length ? { ok: false, problems } : { ok: true, value: parsed.data };
  };
  let lesson = await runStation(deps, "tananyag", authorRequest([]), validateLesson);
  // Review #213 (a régi útról áthozva): a terjedelmi keret az éles úton is érvényes — a szókeret túllépése minőségi jelzés (a JobMonitor
  // mutatja), nem csendes elfogadás és nem megállás.
  const lengthBudget = lessonLengthBudget(promptMap);
  const visibleWords = words(lessonVisibleText(lesson)).length;
  const qualityNotes = visibleWords > lengthBudget.maxWords
    ? [{ reason: "length_over_budget", note: `A Tananyag lap ${visibleWords} látható szó — a terjedelmi keret legfeljebb ${lengthBudget.maxWords} (cél ${lengthBudget.targetWords}, ${lengthBudget.requiredConcepts} tanítandó fogalom).`, round: 0 }]
    : [];
  if (qualityNotes.length) log(`[EGYFUTÁS] Terjedelmi keret túllépve: ${visibleWords} > ${lengthBudget.maxWords} látható szó`);
  output = { ...output, lesson, ...(qualityNotes.length ? { qualityNotes } : {}) };
  await save("animator", output);

  // 4. Ábrák (a tanítás szerkezete érintetlen; hibás ábrafolt esetén az eredeti tanítás megy tovább).
  await workflowPhase("animator");
  phase("animator", "Ábrák és gyakorlóbank készül…");
  try {
    const reply = await conversation.send(withRoleRunbook([text(`4. ÁLLOMÁS — ÁBRÁK.\n${buildAnimatorPrompt(lesson, promptMap)}\nVálaszolj kizárólag az ábrafolt JSON-jával.`)], "animator"));
    const patched = applyVisualPatch(lesson, parseModelJson(reply.text).json, concepts);
    const checked = patched ? lessonSchema.safeParse(patched.lesson) : null;
    if (patched && checked?.success && checkAnimatorResult(lesson, checked.data).ok) lesson = checked.data;
    else log("[EGYFUTÁS] Az ábrafolt nem illeszthető — az eredeti tanítás megy tovább.");
  } catch (error) { log(`[EGYFUTÁS] Az ábra-forduló elmaradt: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`); }
  lesson = ensureSectionVisuals(stripUngroundedAnimateLabels(lesson, concepts).lesson, concepts).lesson;

  // 5. Gyakorlóbank — a meglévő banképítő, a modellhívás UGYANEBBE a beszélgetésbe kötve (kvóta, autofix, séma, javító kísérletek).
  let checkpoint: ExperienceCheckpoint | undefined;
  // A kvíz-előszűrő ítéletei tétel-tartalom szerint újrahasznosulnak (a javítókörben a változatlan tétel nem kerül újra kérdésre).
  const quizBlindCache = new Map<string, string | null>();
  // Review #260: a banképítő utolsó kísérletének nyitott aritmetikai leletei — a végkapu előtt a választásos kapu kezeli őket.
  const openFindings: Array<{ sectionIndex: number; itemId: string; message: string }> = [];
  const buildBank = async (base: Lesson, extra: { reviewFeedback?: ReturnType<typeof resolveBankReview>; previous?: Lesson["experience"] } = {}) =>
    buildLessonExperience(base, concepts, {
      call: conversationBankCall(conversation),
      concurrency: 1,
      // A régi útról áthozott, alapból bekapcsolt minőségkapuk — UGYANEBBEN a beszélgetésben, a döntés a kódé:
      // válaszkulcs-tesztek (helyes és hibás próbaválaszok a valódi pontozón; vészfék: STUDIO_ANSWER_KEY_TESTS=0) és a kvíz vak
      // előszűrője (kulcs nélküli, opciónkénti ítélet; vészfék: STUDIO_QUIZ_BLIND=0).
      ...(answerKeyTestsEnabled() ? {
        answerKeys: answerKeysFor(
          { classroom: promptMap.classroom, concepts: concepts.map((c) => ({ id: c.localId, term: c.term, definition: (c as { definition?: string }).definition })) },
          conversationJsonCall(conversation, "5. ÁLLOMÁS — VÁLASZKULCS-TESZTEK (a pontozó próbája; a rubrikát ne idézd)."),
          (w) => log(`[EGYFUTÁS] Válaszkulcs-teszt: ${w}`),
        ),
      } : {}),
      ...(process.env.STUDIO_QUIZ_BLIND !== "0" ? {
        quizBlind: (quiz: Array<{ id: string; question: string; options: string[]; correctIndex: number }>, sectionIndex: number) =>
          quizBlindProblems(quiz, teachingTextOf(base.sections[sectionIndex]),
            conversationJsonCall(conversation, "5. ÁLLOMÁS — KVÍZ VAK ELLENŐRZÉSE (a kulcsot szándékosan nem kapod; opciónként ítélj)."),
            quizBlindCache, (w) => log(`[EGYFUTÁS] Kvíz-előszűrő ${sectionIndex + 1}. fejezet: ${w}`)),
      } : {}),
      ...(checkpoint ? { checkpoint } : {}),
      ...(extra.previous ? { previous: extra.previous } : {}),
      ...(extra.reviewFeedback?.length ? { reviewFeedback: extra.reviewFeedback } : {}),
      save: async (cp) => { checkpoint = cp; output = { ...output, lesson: base, experienceCheckpoint: cp }; await save("animator", output); },
      onOpenFinding: (finding) => { openFindings.push(finding); output = { ...output, bankOpenFindings: [...openFindings] }; },
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
    const report = await runStation(deps, "lektorálás", withRoleRunbook([text(`6. ÁLLOMÁS — LEKTORÁLÁS (${round + 1}. kör). A forráshoz mérve, szigorúan.\n${buildLektorPrompt(lesson, promptMap, [], owner)}\nVálaszolj kizárólag a lektori jelentés JSON-jával.`)], "lektor"),
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
      // Review #260: a bankleletek a LEKTORÁLT leckén oldódnak fel, és a tanításjavítás utáni banképítés kapja meg őket
      // (a régi indexek nem alkalmazhatók az újraépített bankra).
      const bankFeedback = bankNotes.length ? resolveBankReview(lesson, bankNotes) : [];
      const fixed = await runStation(deps, "javított tananyag", authorRequest(teachingNotes), validateLesson);
      lesson = { ...fixed, experience: await buildBank(fixed, { previous: lesson.experience, ...(bankFeedback.length ? { reviewFeedback: bankFeedback } : {}) }) };
    } else if (bankNotes.length) {
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
  // Review #260: a választásos kapu MINDIG a teljes leckén (tanítási check-blokkok is), a nyitott aritmetikai leletekkel együtt.
  const choice = resolveChoiceGate(lesson, openBankFindingFlags(lesson, openFindings));
  if ("error" in choice) throw new SingleRunError("végellenőrzés", [choice.error]);
  if (choice.removed.length) { lesson = choice.lesson; warnings.push(`A végkapu kivette: ${choice.removed.join(", ")}`); }
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
