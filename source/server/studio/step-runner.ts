import { and, eq, ne } from "drizzle-orm";

import { gameQuizItems, htmlFiles, kmConcepts, knowledgeMaps, lektorNotes, lessons, studioJobs } from "../../shared/schema";
import type { IAIProvider } from "../ai/AIProvider";
import { FALLBACK_MODELS, resolveStudioModel } from "../ai/models";
import { isOpenRouterConfigured, OpenRouterProvider } from "../ai/OpenRouterProvider";
import { getHtmlFilesCache } from "../cache/HtmlFilesCache";
import { logger } from "../lib/logger";
import type { MapConcept } from "./coverage";
import { SUPPORTING_THRESHOLD } from "./coverage";
import { classifyNotes, type RawNote } from "./lektor";
import { appendQualityNote, autonomousDecision } from "./autonomous";
import { MAX_AUTHOR_ROUNDS } from "./pipeline";
import { STUDIO_PROMPT_NAMES, studioPromptStore } from "./prompt";
import {
  computeStepHash,
  isTerminal,
  nextStep,
  STUDIO_STEPS,
  type StudioStep,
  type Transition,
} from "./pipeline";
import { callStepModel, StepModelError } from "./run-step";
import {
  buildAnimatorPrompt,
  buildAuthorPrompt,
  buildConceptFixPrompt,
  buildLektorPrompt,
  buildPedagoguePrompt,
  buildSchemaRetryUser,
  animatorOutcome,
  checkAnimatorResult,
  checkConceptFixResult,
  lessonIdsSubsetOfMap,
  lektorReportSchema,
  outlineCoversMap,
  outlineSchema,
  type LessonOutline,
  type OutlineCoverage,
} from "./step-io";
import { lessonSchema, type Lesson } from "../../shared/lesson-schema";
import type { ExamWeight } from "../../shared/knowledge-map-schema";
import type { InsertGameQuizItem } from "../../shared/schema";
import { checkCoverageGate, type Coverage } from "./coverage";
import { checkLessonArc } from "../../shared/lesson-arc";
import { conceptIdResolver, exportQuizItemsForPublish } from "./quiz-export";
import type { ZodError } from "zod";
import { LESSON_METHOD_VERSION } from "../../shared/lesson-experience";
import { experienceProblems } from "../../shared/lesson-experience-validation";
import { buildLessonExperience, type ExperienceCheckpoint } from "./experience-builder";

/**
 * LS-2c — the runner that finally pays model calls for pedagogue/author/lektor.
 *
 * Contract, straight from the owner's brief (2026-09-04):
 *  - `runPipelineStep(jobId, deps)` runs ONE step: loads the job row, builds the step
 *    input, calls `callStepModel` through an `OpenRouterProvider` created from
 *    `resolveStudioModel(step)`, persists output+tokens on the `studio_jobs` row and
 *    returns `{ok, next}` computed via `nextStep()`. Advancing the job is the CALLER's
 *    job (routes), so a crash between call and settle is recoverable and re-runnable.
 *  - Fail-closed: a `StepModelError`, a schema violation or a coverage violation marks
 *    the job `error` with the reasons — a half-built output never lands on the row.
 *  - Missing `OPENROUTER_API_KEY` marks the job `error` with a clear Hungarian message
 *    instead of crashing.
 *  - Idempotency: an `ok` job whose stored `inputHash` equals the current step's input
 *    hash is served from the stored output — a resume never pays twice.
 *
 * The DB-touching half lives behind the thin `PipelineStore` interface so the runner is
 * unit-testable with an in-memory store and a stub provider; the real Drizzle adapter is
 * `createDrizzlePipelineStore()` in this file (db is imported lazily so importing this
 * module never opens a database connection).
 */

export const PIPELINE_PROMPT_VERSION = "ls-2c-fusion-7.4-1";

export const NO_OPENROUTER_KEY_MESSAGE =
  "Az OPENROUTER_API_KEY nincs beállítva — a modell-lépés nem indítható el. " +
  "Állítsd be a kulcsot a környezeti változók között, vagy nézd meg a /api/studio/ai-status végpontot.";

/**
 * The html_files row of a published lesson carries no real HTML: the Preview page detects
 * `contentType:'lesson'` and mounts the lesson runtime instead of the iframe. This stub is
 * what an old client or a crawler would see.
 */
export const LESSON_PLACEHOLDER_HTML =
  '<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>Websuli lecke</title></head>' +
  "<body><p>Ezt a leckét a Websuli lecke-futtató jeleníti meg. Nyisd meg a websuli.vip oldalon.</p></body></html>";

export type MapMeta = { id: string; title: string; subject: string; classroom: number };

/** What the deterministic gate hands to the store when a lesson passes. */
export type PublishInput = {
  lessonId: string;
  mapId: string;
  title: string;
  classroom: number;
  coverage: Coverage;
  quizItems: InsertGameQuizItem[];
};

export type JobView = {
  id: string;
  lessonId: string | null;
  mapId: string;
  step: StudioStep;
  status: string;
  round: number;
  inputHash: string;
  output: Record<string, unknown> | null;
  error: string | null;
};

export type JobPatch = Partial<{
  step: StudioStep;
  status: string;
  round: number;
  output: Record<string, unknown> | null;
  model: string | null;
  promptVersion: string | null;
  inputHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
  error: string | null;
  finishedAt: Date | null;
  lessonId: string | null;
}>;

/**
 * Thin DB adapter. Every method maps 1:1 to the queries the runner needs; the test
 * provides an in-memory implementation, production uses the Drizzle one below.
 */
export type PipelineStore = {
  loadJob(jobId: string): Promise<JobView | null>;
  loadMap(mapId: string): Promise<{ meta: MapMeta; concepts: MapConcept[] } | null>;
  /** Blocking lektor notes of ONE lektor round — what the next Author round must fix. */
  loadBlockerNotes(jobId: string, round: number): Promise<RawNote[]>;
  saveStep(jobId: string, patch: JobPatch): Promise<void>;
  /** Persist a lektor round's notes, tagged with the round they were written in. */
  saveNotes(
    jobId: string,
    notes: Array<RawNote & { severity: "blocker" | "warn" | "info" }>,
    round: number,
  ): Promise<void>;
  /** Insert a new lessons row, or overwrite the existing one on a later Author round. */
  upsertLesson(lessonId: string | null, mapId: string, json: unknown): Promise<string>;
  /**
   * Audit 2026-09-05 (gate): make the lesson reachable for a child — html_files row
   * (`contentType:'lesson'`), publishedAt + coverage snapshot on the lessons row, and the
   * concept-bound checks exported to the coupon games (idempotent per lesson).
   */
  publishLesson(input: PublishInput): Promise<{ htmlFileId: string; exportedQuizItems: number }>;
  createJob(input: {
    mapId: string;
    step: "pedagogue";
    status: string;
    model: string;
    promptVersion: string;
    inputHash: string;
  }): Promise<string>;
};

export type PipelineDeps = {
  store?: PipelineStore;
  providerFactory?: (model: string) => IAIProvider;
  keyConfigured?: () => boolean;
  /** Prompt lookup by name with an inline fallback; defaults to studioPromptStore. */
  promptLookup?: (name: string, fallback: string) => Promise<string>;
};

export type StepOutcome =
  | { ok: true; next: Transition; cached?: boolean }
  | { ok: false; next: Transition; reason: string; parked?: boolean };

type ResolvedDeps = Required<PipelineDeps>;

async function resolveDeps(deps: PipelineDeps): Promise<ResolvedDeps> {
  const lookup = deps.promptLookup ?? ((name: string, fallback: string) => studioPromptStore.get(name, fallback));
  return {
    store: deps.store ?? (await createDrizzlePipelineStore()),
    providerFactory: deps.providerFactory ?? defaultProviderFactory,
    keyConfigured: deps.keyConfigured ?? (() => isOpenRouterConfigured()),
    promptLookup: async (name, fallback) => {
      const configured = await lookup(name, fallback);
      if (configured === fallback) return fallback;
      return configured + "\n\nAktuális kötelező szerződés és forrásadatok (eltérésnél ez az irányadó):\n" + fallback;
    },
  };
}

const defaultProviderFactory = (model: string): IAIProvider =>
  new OpenRouterProvider({ model, apiKey: process.env.OPENROUTER_API_KEY ?? "", timeout: 180000, maxTokens: 24000 });

function normalizeStep(raw: string): StudioStep {
  return (STUDIO_STEPS as readonly string[]).includes(raw) ? (raw as StudioStep) : "error";
}

/* ------------------------------------------------------------------ *
 * Step inputs — the same shape the routes layer hashes at job creation,
 * so creation-time and run-time hashes agree.
 * ------------------------------------------------------------------ */

type StepMap = { meta: MapMeta; concepts: MapConcept[] };

function mapInputOf(map: StepMap) {
  const { meta } = map;
  return { id: meta.id, title: meta.title, subject: meta.subject, classroom: meta.classroom };
}

function pedagogueInputOf(map: StepMap) {
  return { map: mapInputOf(map), concepts: map.concepts };
}

function promptMapOf(map: StepMap) {
  return {
    title: map.meta.title,
    subject: map.meta.subject,
    classroom: map.meta.classroom,
    concepts: map.concepts,
  };
}

/* ------------------------------------------------------------------ *
 * Error helpers
 * ------------------------------------------------------------------ */

function zodIssues(error: ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "(gyökér)"}: ${issue.message}`)
    .join("; ");
}

function coverageReason(c: OutlineCoverage): string {
  const parts: string[] = [];
  if (c.missingCore.length > 0) parts.push(`hiányzó kulcsfogalom: ${c.missingCore.join(", ")}`);
  if (c.unknownIds.length > 0) parts.push(`ismeretlen fogalom-azonosító: ${c.unknownIds.join(", ")}`);
  if (c.supporting.ratio < SUPPORTING_THRESHOLD) {
    parts.push(
      `a kiegészítő fogalmak fedettsége ${Math.round(c.supporting.ratio * 100)}%, a minimum ${Math.round(SUPPORTING_THRESHOLD * 100)}%`,
    );
  }
  return `A vázlat nem felel meg a térképnek — ${parts.join("; ")}.`;
}

/** A lépéshiba üzenete a szolgáltatói okkal (pl. „Rate limit exceeded”) — a nyers modellválasz nélkül. */
function describeStepError(error: unknown): string {
  if (error instanceof StepModelError) {
    const cause = (error as { cause?: unknown }).cause;
    const causeMessage = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
    return causeMessage ? `${error.message} (${causeMessage})` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Persist the error state and return the failed outcome. */
async function fail(store: PipelineStore, job: JobView, reason: string): Promise<StepOutcome> {
  logger.error(`[STUDIO] ${job.step} lépés hiba (job ${job.id}): ${reason}`);
  await store.saveStep(job.id, { status: "error", step: "error", error: reason, finishedAt: new Date() });
  return { ok: false, next: { step: "error", round: job.round, reason }, reason };
}

/** The transition a cached job implies — derived from what was already persisted. */
function cachedNext(job: JobView): Transition {
  switch (job.step) {
    case "pedagogue":
      return { step: "author", round: job.round };
    case "author":
      return { step: "animator", round: job.round };
    case "animator":
      return { step: "lektor", round: job.round };
    case "lektor":
      return nextStep({
        step: "lektor",
        ok: true,
        round: job.round,
        blockers: typeof job.output?.blockers === "number" ? job.output.blockers : 0,
      });
    case "gate":
    case "done":
    case "error":
      return { step: job.step, round: job.round };
  }
}

/* ------------------------------------------------------------------ *
 * The runner
 * ------------------------------------------------------------------ */

export async function runPipelineStep(jobId: string, deps: PipelineDeps = {}): Promise<StepOutcome> {
  const { store, providerFactory, keyConfigured, promptLookup } = await resolveDeps(deps);

  const job = await store.loadJob(jobId);
  if (!job) {
    return { ok: false, next: { step: "error", round: 0 }, reason: "A job nem található." };
  }

  if (isTerminal(job.step)) {
    return { ok: true, next: { step: job.step, round: job.round }, cached: true };
  }
  if (job.step === "gate") {
    return runGate(store, job);
  }

  const map = await store.loadMap(job.mapId);
  if (!map) return fail(store, job, "A térkép nem található — a lépés nem futhat le.");
  if (map.concepts.length === 0) {
    return fail(store, job, "A térkép nem tartalmaz fogalmat — a lépés nem futhat le.");
  }

  if (!keyConfigured()) return fail(store, job, NO_OPENROUTER_KEY_MESSAGE);

  let input: unknown;
  let system: string;
  switch (job.step) {
    case "pedagogue": {
      input = pedagogueInputOf(map);
      system = await promptLookup(
        STUDIO_PROMPT_NAMES.pedagogue,
        buildPedagoguePrompt(promptMapOf(map)),
      );
      break;
    }
    case "author": {
      const outline = (job.output?.approvedOutline ?? job.output?.outline) as LessonOutline | undefined;
      if (!outline) {
        // Not a failure: the pipeline is parked, waiting for the admin's approval.
        return {
          ok: false,
          next: { step: "author", round: job.round },
          reason: "A szerző lépés a vázlat admin-jóváhagyása előtt nem futhat.",
          parked: true,
        };
      }
      // Round N Author fixes what the round N-1 Lektor blocked — never older rounds' stale union.
      const blockers = job.round > 0 ? await store.loadBlockerNotes(job.id, job.round - 1) : [];
      input = { outline, blockers, map: mapInputOf(map), concepts: map.concepts,
        ...(job.output?.gate ? { gateFeedback: job.output.gate, previousLesson: job.output.lesson } : {}),
      };
      system = await promptLookup(
        STUDIO_PROMPT_NAMES.author,
        buildAuthorPrompt(outline.sections, promptMapOf(map), blockers),
      );
      if (job.output?.gate) {
        system += "\nA kapu javítandó megállapításai és az előző lecke:\n" + JSON.stringify({
          gateFeedback: job.output.gate, previousLesson: job.output.lesson,
        });
      }
      break;
    }
    case "animator": {
      const lesson = job.output?.lesson as Lesson | undefined;
      if (!lesson) return fail(store, job, "Az animátor lépéshez nincs lecke a jobban.");
      input = { lesson, map: mapInputOf(map), concepts: map.concepts };
      system = await promptLookup(
        STUDIO_PROMPT_NAMES.animator,
        buildAnimatorPrompt(lesson, promptMapOf(map)),
      );
      break;
    }
    case "lektor": {
      const lesson = job.output?.lesson as Lesson | undefined;
      if (!lesson) return fail(store, job, "A lektor lépéshez nincs lecke a jobban.");
      input = { lesson, map: mapInputOf(map), concepts: map.concepts };
      system = await promptLookup(
        STUDIO_PROMPT_NAMES.lektor,
        buildLektorPrompt(lesson, promptMapOf(map)),
      );
      break;
    }
    case "done":
    case "error":
      return { ok: true, next: { step: job.step, round: job.round }, cached: true };
  }

  const hash = computeStepHash(job.step, PIPELINE_PROMPT_VERSION, { input, system }, job.round);

  // Idempotency: this exact input was already paid for and its output is stored.
  if (job.status === "ok" && job.inputHash === hash && job.output !== null) {
    return { ok: true, next: cachedNext(job), cached: true };
  }

  await store.saveStep(job.id, { status: "running", finishedAt: null, error: null });

  const primaryModel = resolveStudioModel(job.step);
  let model = primaryModel;

  let json: unknown;
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  // Az animátor lépés kozmetika (#169): ha a MODELLHÍVÁS hal meg (pl. OpenRouter 429),
  // az eredeti lecke megy tovább a lektorra — a gyártás nem áll meg.
  let animatorModelFailure: string | null = null;
  const attempt = (m: string) =>
    callStepModel(providerFactory(m), {
      step: job.step,
      model: m,
      system,
      user: "Válaszolj kizárólag a kért JSON-nal.",
    });
  try {
    let result: Awaited<ReturnType<typeof attempt>>;
    try {
      result = await attempt(primaryModel);
    } catch (primaryError) {
      // Éles hiba 2026-09-09: a `FALLBACK_MODELS` eddig csak dokumentálva volt, a runner
      // sosem használta — az animátor 429-en (rate limit) végleg elhalt. Egy próba a
      // lépés fallback-modelljével, csak modellhívás-hibára (nem séma-sértésre).
      const fallbackModel = FALLBACK_MODELS[job.step];
      if (!(primaryError instanceof StepModelError) || !fallbackModel || fallbackModel === primaryModel) {
        throw primaryError;
      }
      logger.warn(
        `[STUDIO] ${job.step} (${job.id}): az elsődleges modell (${primaryModel}) hibázott — ${describeStepError(primaryError)} → fallback: ${fallbackModel}`,
      );
      try {
        result = await attempt(fallbackModel);
        model = fallbackModel;
      } catch (fallbackError) {
        throw new StepModelError(
          job.step,
          `${describeStepError(primaryError)} [${primaryModel}]; fallback: ${describeStepError(fallbackError)} [${fallbackModel}]`,
        );
      }
    }
    json = result.json;
    usage = result.usage ?? null;
  } catch (error) {
    const reason =
      error instanceof StepModelError
        ? error.message
        : `A(z) "${job.step}" lépés modellhívása hibára futott: ${
            error instanceof Error ? error.message : String(error)
          }`;
    if (job.step === "animator" && job.output?.lesson) {
      animatorModelFailure = reason;
      json = null;
    } else {
      return fail(store, job, reason);
    }
  }

  const successPatch = (
    output: Record<string, unknown>,
    extra: { lessonId?: string } = {},
  ): JobPatch => ({
    status: "ok",
    output,
    inputHash: hash,
    model,
    promptVersion: PIPELINE_PROMPT_VERSION,
    tokensIn: usage?.promptTokens ?? null,
    tokensOut: usage?.completionTokens ?? null,
    error: null,
    finishedAt: new Date(),
    lessonId: extra.lessonId,
  });

  switch (job.step) {
    case "pedagogue": {
      const parsed = outlineSchema.safeParse(json);
      if (!parsed.success) return fail(store, job, `A vázlat alakilag hibás: ${zodIssues(parsed.error)}`);
      const coverage = outlineCoversMap(parsed.data.sections, map.concepts);
      if (!coverage.ok) return fail(store, job, coverageReason(coverage));

      await store.saveStep(job.id, successPatch({ ...job.output, outline: parsed.data, coverage }));
      return { ok: true, next: nextStep({ step: job.step, ok: true, round: job.round }) };
    }

    case "author": {
      let parsed = lessonSchema.safeParse(json);
      if (!parsed.success) {
        // #167 — élesben az author érvénytelen blokk-kindeket adott, és a futás
        // azonnal hibára állt. Egyszeri javító kör: a konkrét zod-hibák + a
        // blokk-katalógus visszamegy a modellnek, csak utána adjuk fel.
        logger.warn(
          `[STUDIO] Az author válasza séma-hibás, javító kör indul (${job.id}): ${zodIssues(parsed.error).slice(0, 300)}`,
        );
        try {
          // ugyanazon a modellen, amelyik az első választ adta (elsődleges vagy fallback)
          const retry = await callStepModel(providerFactory(model), {
            step: job.step,
            model,
            system,
            user: buildSchemaRetryUser(zodIssues(parsed.error)),
          });
          json = retry.json;
          if (retry.usage && usage) {
            usage = {
              promptTokens: usage.promptTokens + retry.usage.promptTokens,
              completionTokens: usage.completionTokens + retry.usage.completionTokens,
              totalTokens: usage.totalTokens + retry.usage.totalTokens,
            };
          }
        } catch (error) {
          return fail(
            store,
            job,
            `A lecke alakilag hibás volt, és a javító kör is elbukott: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        parsed = lessonSchema.safeParse(json);
        if (!parsed.success) {
          return fail(store, job, `A lecke a javító kör után is alakilag hibás: ${zodIssues(parsed.error)}`);
        }
      }
      const unknownIds = lessonIdsSubsetOfMap(parsed.data, map.concepts);
      if (unknownIds.length > 0) {
        return fail(
          store,
          job,
          `A lecke olyan fogalomra hivatkozik, ami nem szerepel a térképen: ${unknownIds.join(", ")}.`,
        );
      }

      // Scope was inferred from the source before authoring; generated metadata cannot override it.
      const lesson: Lesson = { ...parsed.data, mapId: job.mapId, subject: map.meta.subject, classroom: map.meta.classroom };
      const lessonId = await store.upsertLesson(job.lessonId, job.mapId, lesson);
      await store.saveStep(
        job.id,
        successPatch({ ...job.output, lesson }, { lessonId }),
      );
      return { ok: true, next: nextStep({ step: job.step, ok: true, round: job.round }) };
    }

    case "animator": {
      const original = job.output?.lesson as Lesson | undefined;
      if (!original) return fail(store, job, "Az animátor lépéshez nincs lecke a jobban.");

      // #169 — az animáció kozmetika: sértésnél/hibás alaknál az EREDETI lecke
      // megy tovább a lektorra, a gyártás nem hal meg.
      const parsed = animatorModelFailure ? null : lessonSchema.safeParse(json);
      const check = parsed?.success ? checkAnimatorResult(original, parsed.data) : null;
      const outcome = animatorOutcome(
        original,
        parsed?.success && check && check.ok
          ? { ok: true, lesson: parsed.data }
          : {
              ok: false,
              reason: animatorModelFailure
                ? `modellhiba: ${animatorModelFailure}`
                : parsed?.success
                  ? `szerződéssértés: ${(check as { reasons: string[] }).reasons.join("; ")}`
                  : `alakilag hibás animált lecke: ${zodIssues((parsed as { error: ZodError }).error)}`,
            },
      );
      if (outcome.fellBack) {
        logger.warn(
          `[STUDIO] Az animátor kimenete eldobva (${job.id}), az eredeti lecke megy tovább: ${outcome.reason?.slice(0, 300)}`,
        );
      }

      let completedLesson = outcome.lesson;
      let checkpoint = job.output?.experienceCheckpoint as ExperienceCheckpoint | undefined;
      if (job.output?.methodVersion === LESSON_METHOD_VERSION) {
        try {
          const experience = await buildLessonExperience(completedLesson, map.concepts, {
            checkpoint,
            call: async (bankSystem, user) => {
              const bankModel = resolveStudioModel("author");
              const result = await callStepModel(providerFactory(bankModel), { step: "author", model: bankModel, system: bankSystem, user });
              if (result.usage) usage = { promptTokens: (usage?.promptTokens ?? 0) + result.usage.promptTokens, completionTokens: (usage?.completionTokens ?? 0) + result.usage.completionTokens, totalTokens: (usage?.totalTokens ?? 0) + result.usage.totalTokens };
              return result.json;
            },
            save: async (next) => {
              checkpoint = next;
              await store.saveStep(job.id, { output: { ...job.output, experienceCheckpoint: next } });
            },
          });
          completedLesson = { ...completedLesson, experience };
        } catch (error) {
          return fail(store, job, error instanceof Error ? error.message : "A feladatbank gyártása sikertelen.");
        }
      }
      const lessonId = await store.upsertLesson(job.lessonId, job.mapId, completedLesson);
      await store.saveStep(
        job.id,
        successPatch({ ...job.output, lesson: completedLesson, ...(checkpoint ? { experienceCheckpoint: checkpoint } : {}) }, { lessonId }),
      );
      return { ok: true, next: nextStep({ step: job.step, ok: true, round: job.round }) };
    }

    case "lektor": {
      const parsed = lektorReportSchema.safeParse(json);
      if (!parsed.success) return fail(store, job, `A lektori jelentés alakilag hibás: ${zodIssues(parsed.error)}`);

      const notes = classifyNotes(parsed.data.notes);
      await store.saveNotes(job.id, notes, job.round);
      const blockers = notes.filter((n) => n.blocking).length;

      const transition = nextStep({ step: job.step, ok: true, round: job.round, blockers });
      if (transition.step === "error") {
        // The run itself was clean, but the pipeline dead-ends: the Author↔Lektor
        // loop hit the round limit and a human has to decide.
        return fail(
          store,
          job,
          transition.reason ?? "A lektor a kör-limit után is blokkolót talált.",
        );
      }

      // LS-7 (#189): a limit után a blokkoló NEM állítja meg a futást — a kapu
      // dönt. A hiányt jelzésként visszük tovább, hogy utólagos javító
      // prompttal kezelhető legyen, és ne tűnjön el némán.
      const carriedNotes =
        blockers > 0 && job.round >= MAX_AUTHOR_ROUNDS
          ? appendQualityNote(job.output?.qualityNotes, {
              reason: "lektor_blocker",
              note:
                autonomousDecision({
                  reason: "lektor_blocker",
                  round: job.round,
                  detail: `${blockers} blokkoló jegyzet`,
                }).note ?? "A lektor blokkolót jelzett.",
              round: job.round,
            })
          : job.output?.qualityNotes;

      await store.saveStep(
        job.id,
        successPatch({
          ...job.output,
          report: parsed.data,
          blockers,
          ...(carriedNotes !== undefined ? { qualityNotes: carriedNotes } : {}),
        }),
      );
      return { ok: true, next: transition };
    }
  }
}

/* ------------------------------------------------------------------ *
 * The deterministic gate (audit 2026-09-05, szelet A)
 * ------------------------------------------------------------------ */

/**
 * No model call. The stored lesson must (1) parse against lessonSchema and (2) pass
 * checkCoverageGate against the curated map. Pass → publish (html_files row, publishedAt,
 * coverage snapshot, quiz export) and `done`. Fail → `nextStep({gatePassed:false})`, which
 * sends the Author another round or dead-ends at the round limit; a failing lesson is
 * NEVER published. Measured before this existed: every prod lesson had publishedAt=NULL.
 */
async function runGate(store: PipelineStore, job: JobView): Promise<StepOutcome> {
  const rawLesson = job.output?.lesson;
  if (!rawLesson || !job.lessonId) {
    return fail(store, job, "A kapuhoz nincs lecke a jobban — a szerző lépés nem futott le.");
  }
  const parsed = lessonSchema.safeParse(rawLesson);
  if (!parsed.success) {
    return fail(store, job, `A lecke alakilag hibás a kapunál: ${zodIssues(parsed.error)}`);
  }

  const map = await store.loadMap(job.mapId);
  if (!map) return fail(store, job, "A térkép nem található — a kapu nem futhat le.");

  const coverageGate = checkCoverageGate(parsed.data, map.concepts);
  // Missing experience is a hard failure, including after the autonomous round limit.
  if (job.output?.methodVersion === LESSON_METHOD_VERSION || parsed.data.experience) {
    const problems = experienceProblems(parsed.data);
    if (problems.length) return fail(store, job, `A fúziós módszer kapuja elutasította a leckét: ${problems.join("; ")}`);
  }

  // M-2 (2026-09-07) — a DIDAKTIKAI ÍV kapuja a fedettségi kapu mellé.
  //
  // A fedettség azt méri, hogy a lecke a térkép MINDEN fogalmát tanítja-e; a
  // felépítéséről semmit nem mond. Élesben mérve: egy csupa `check` blokkból álló
  // szakasz `ok: true`-val ment át, mert minden fogalom-címke a helyén volt. A
  // gyerek viszont felvezetés és levezetett példa nélkül kapott kvízt. A két kapu
  // külön mér, de egy `reasons` listába ír: a szerző javító köre így egyszerre
  // látja a fogalmi és a felépítésbeli hiányt.
  const arc = checkLessonArc(parsed.data);
  const reasons = [...coverageGate.reasons, ...arc.reasons];
  const gate = { ...coverageGate, ok: coverageGate.ok && arc.ok, reasons };
  const gateOutput = {
    ok: gate.ok,
    reasons: gate.reasons,
    missingCore: gate.missingCore,
    unknownIds: gate.unknownIds,
    ungrounded: gate.ungrounded,
    arc: arc.findings,
  };

  let qualityNotes = job.output?.qualityNotes;

  if (!gate.ok) {
    const transition = nextStep({ step: "gate", ok: true, round: job.round, gatePassed: false });
    if (transition.step === "error") {
      return fail(store, job, `${transition.reason ?? "A kapu elutasította a leckét."} (${gate.reasons.join(" ")})`);
    }
    // LS-7 (#189): a limit előtt javító kör; a limit UTÁN nem parkolunk emberre —
    // a lecke elkészül, a kapu-hiány pedig jelzésként megy vele. Publikálás
    // nélküli "done" némán üres tananyagot jelentene, ami rosszabb a hibánál.
    if (transition.step !== "done") {
      await store.saveStep(job.id, {
        status: "ok",
        output: { ...job.output, gate: gateOutput },
        error: null,
        finishedAt: null,
      });
      return { ok: true, next: transition };
    }
    const decision = autonomousDecision({
      reason: "gate_rejected",
      round: job.round,
      detail: gate.reasons.join(" "),
    });
    qualityNotes = appendQualityNote(qualityNotes, {
      reason: "gate_rejected",
      note: decision.note ?? "A publikálási kapu hiányt mért.",
      round: job.round,
    });
    logger.warn(
      `[STUDIO/GATE] A kapu hiányt mért, de az autonóm futás publikál (job ${job.id}): ${gate.reasons.join(" ")}`,
    );
  }

  const published = await store.publishLesson({
    lessonId: job.lessonId,
    mapId: job.mapId,
    title: parsed.data.title,
    classroom: parsed.data.classroom,
    coverage: gate.coverage,
    quizItems: exportQuizItemsForPublish(parsed.data, job.lessonId, conceptIdResolver(map.concepts)),
  });
  logger.info(
    `[STUDIO/GATE] Lecke publikálva: ${job.lessonId} → html_files ${published.htmlFileId}, ${published.exportedQuizItems} kvíz-tétel exportálva`,
  );
  await store.saveStep(job.id, {
    status: "ok",
    output: {
      ...job.output,
      gate: gateOutput,
      htmlFileId: published.htmlFileId,
      exportedQuizItems: published.exportedQuizItems,
      ...(qualityNotes !== undefined ? { qualityNotes } : {}),
    },
    error: null,
    finishedAt: new Date(),
  });
  return { ok: true, next: nextStep({ step: "gate", ok: true, round: job.round, gatePassed: true }) };
}

/* ------------------------------------------------------------------ *
 * Caller-side operations (used by the routes, tested through the store)
 * ------------------------------------------------------------------ */

/**
 * Apply a runner-produced transition to the job row: move step/round, and mark the job
 * `running` when the next model step may start immediately, `ok` when it waits for the
 * admin (pedagogue approval, the gate).
 */
export async function advanceJob(
  jobId: string,
  next: Transition,
  opts: { status: "ok" | "running" },
  deps: PipelineDeps = {},
): Promise<void> {
  const { store } = await resolveDeps(deps);
  const terminal = next.step === "done" || next.step === "error";
  await store.saveStep(jobId, {
    step: next.step,
    round: next.round,
    status: next.step === "error" ? "error" : opts.status,
    error: next.step === "error" ? (next.reason ?? "Ismeretlen hiba.") : null,
    // Audit 2026-09-05 (C): finished_at means finished — intermediate transitions leave it null.
    finishedAt: terminal ? new Date() : null,
  });
}

/**
 * Admin approves the pedagogue's outline (re-validated with outlineSchema AND
 * outlineCoversMap — the client's opinion is never trusted). On success the job is set
 * `running` at the author step; the caller then drives `runPipelineStep`.
 */
export async function approveOutline(
  jobId: string,
  outline: unknown,
  deps: PipelineDeps = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { store } = await resolveDeps(deps);
  const job = await store.loadJob(jobId);
  if (!job) return { ok: false, reason: "A job nem található." };
  if (job.step !== "author") {
    return { ok: false, reason: "Csak a szerző lépésre váró job vázlata hagyható jóvá." };
  }

  const parsed = outlineSchema.safeParse(outline);
  if (!parsed.success) {
    return { ok: false, reason: `A vázlat alakilag hibás: ${zodIssues(parsed.error)}` };
  }

  const map = await store.loadMap(job.mapId);
  if (!map) return { ok: false, reason: "A térkép nem található." };

  const coverage = outlineCoversMap(parsed.data.sections, map.concepts);
  if (!coverage.ok) return { ok: false, reason: coverageReason(coverage) };

  await store.saveStep(job.id, {
    output: { ...job.output, approvedOutline: parsed.data },
    status: "running",
    error: null,
    finishedAt: null,
  });
  return { ok: true };
}

/**
 * LS-7 (#189) — autonóm vázlat-elfogadás a MÉRT hiánnyal.
 *
 * Ez NEM a kapu megkerülése: a séma-ellenőrzés (`outlineSchema`) továbbra is
 * fail-closed, és a fedettség mérése megtörtént — az eredményt `qualityNotes`
 * jelzésként visszük tovább, hogy utólagos javító prompttal kezelhető legyen.
 * Csak akkor hívható, ha a gépi javító körök már elfogytak (autonomousDecision).
 */
export async function forceApproveOutline(
  jobId: string,
  outline: unknown,
  note: { reason: "coverage"; note: string; round: number },
  deps: PipelineDeps = {},
): Promise<boolean> {
  const { store } = await resolveDeps(deps);
  const job = await store.loadJob(jobId);
  if (!job) return false;

  // A séma-kapu MEGMARAD: alaktalan vázlatból nem lesz lecke.
  const parsed = outlineSchema.safeParse(outline);
  if (!parsed.success) {
    logger.error(`[STUDIO] Az autonóm vázlat-elfogadás alaki hibán bukott: ${zodIssues(parsed.error)}`);
    return false;
  }

  await store.saveStep(job.id, {
    output: {
      ...job.output,
      approvedOutline: parsed.data,
      qualityNotes: appendQualityNote(job.output?.qualityNotes, note),
    },
    status: "running",
    error: null,
    finishedAt: null,
  });
  return true;
}

/**
 * LS-7 (#189) — gépi javító kör a pedagógus lépésre: visszaállítjuk a jobot
 * `pedagogue`-ra a következő körszámmal, és töröljük a bukott vázlatot, hogy a
 * cache ne adja vissza ugyanazt. A hívó ezután újra `drive()`-ol.
 */
export async function retryOutlineRound(
  jobId: string,
  nextRound: number,
  deps: PipelineDeps = {},
): Promise<boolean> {
  const { store } = await resolveDeps(deps);
  const job = await store.loadJob(jobId);
  if (!job) return false;

  const output = { ...(job.output ?? {}) };
  delete (output as Record<string, unknown>).outline;
  delete (output as Record<string, unknown>).coverage;

  await store.saveStep(job.id, {
    step: "pedagogue",
    round: nextRound,
    // Az input-hash törlése kell, különben a cache visszaadja a bukott vázlatot.
    inputHash: "",
    output,
    status: "running",
    error: null,
    finishedAt: null,
  });
  return true;
}

/**
 * Create the job row for a new lesson and hand back its id. The caller then drives
 * `runPipelineStep`; the input hash recorded here is the pedagogue input, computed from
 * the map's own subject/classroom — the request must agree with the map (one source of
 * truth, and the reason for the 409 otherwise).
 */
export async function startJobFromMap(
  mapId: string,
  input: { subject: string; classroom: number } | undefined,
  deps: PipelineDeps = {},
): Promise<{ ok: true; jobId: string } | { ok: false; reason: string }> {
  const { store } = await resolveDeps(deps);
  const map = await store.loadMap(mapId);
  if (!map) return { ok: false, reason: "A térkép nem található." };
  if (map.concepts.length === 0) {
    return { ok: false, reason: "A térkép nem tartalmaz fogalmat — a pedagógus nem tud vázlatot készíteni." };
  }
  // #180: no scope in the request = the map's scope (the UI promises exactly that).
  if (input && (map.meta.subject !== input.subject || map.meta.classroom !== input.classroom)) {
    return {
      ok: false,
      reason: "A kért tantárgy/osztály eltér a térkép adataitól — a lecke a térkép szerinti osztálynak készül.",
    };
  }

  const hash = computeStepHash("pedagogue", PIPELINE_PROMPT_VERSION, pedagogueInputOf(map), 0);
  const jobId = await store.createJob({
    mapId,
    step: "pedagogue",
    status: "pending",
    model: resolveStudioModel("pedagogue"),
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: hash,
  });
  await store.saveStep(jobId, { output: { methodVersion: LESSON_METHOD_VERSION } });
  return { ok: true, jobId };
}

/* ------------------------------------------------------------------ *
 * Real Drizzle adapter. `db` is imported lazily: importing this module
 * in a unit test must never open a database connection.
 * ------------------------------------------------------------------ */

export async function createDrizzlePipelineStore(): Promise<PipelineStore> {
  const { db } = await import("../db");

  return {
    async loadJob(jobId) {
      const [row] = await db.select().from(studioJobs).where(eq(studioJobs.id, jobId)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        lessonId: row.lessonId,
        mapId: row.mapId,
        step: normalizeStep(row.step),
        status: row.status,
        round: row.round,
        inputHash: row.inputHash,
        output: (row.output ?? null) as Record<string, unknown> | null,
        error: row.error,
      };
    },

    async loadMap(mapId) {
      const [map] = await db
        .select({
          id: knowledgeMaps.id,
          title: knowledgeMaps.title,
          subject: knowledgeMaps.subject,
          classroom: knowledgeMaps.classroom,
        })
        .from(knowledgeMaps)
        .where(eq(knowledgeMaps.id, mapId))
        .limit(1);
      if (!map) return null;

      // #174: a kihúzott (rejected) fogalom nem tananyag — a vázlat-lefedettség
      // és a fogalom-javítás sem követelheti.
      const concepts = await db
        // #196: a `term` KELL a megalapozottság-ellenőrzéshez (grounding.ts) —
        // enélkül a kapu némán nem mérne semmit, ami pontosan az a hazug-kapu
        // minta, amit ez a jegy megszüntet.
        .select({
          id: kmConcepts.id,
          localId: kmConcepts.localId,
          term: kmConcepts.term,
          definition: kmConcepts.definition,
          quote: kmConcepts.quote,
          examWeight: kmConcepts.examWeight,
        })
        .from(kmConcepts)
        .where(and(eq(kmConcepts.mapId, mapId), ne(kmConcepts.reviewState, "rejected")));

      return {
        meta: { id: map.id, title: map.title, subject: map.subject, classroom: map.classroom },
        concepts: concepts.map((c) => ({
          id: c.id,
          localId: c.localId,
          term: c.term,
          definition: c.definition,
          quote: c.quote,
          examWeight: c.examWeight as ExamWeight,
        })),
      };
    },

    async loadBlockerNotes(jobId, round) {
      // Audit 2026-09-05 (C): only the requested lektor round — the union of every
      // earlier round told the Author to re-fix findings it had already fixed.
      const rows = await db
        .select({
          kind: lektorNotes.kind,
          subkind: lektorNotes.subkind,
          message: lektorNotes.message,
          blockPath: lektorNotes.blockPath,
        })
        .from(lektorNotes)
        .where(
          and(
            eq(lektorNotes.jobId, jobId),
            eq(lektorNotes.severity, "blocker"),
            eq(lektorNotes.round, round),
          ),
        );
      return rows.map((r) => ({
        kind: r.kind as RawNote["kind"],
        subkind: r.subkind ?? undefined,
        message: r.message,
        blockPath: r.blockPath ?? undefined,
      }));
    },

    async saveStep(jobId, patch) {
      await db.update(studioJobs).set(patch).where(eq(studioJobs.id, jobId));
    },

    async saveNotes(jobId, notes, round) {
      if (notes.length === 0) return;
      await db.insert(lektorNotes).values(
        notes.map((n) => ({
          jobId,
          kind: n.kind,
          subkind: n.subkind ?? null,
          severity: n.severity,
          message: n.message,
          blockPath: n.blockPath ?? null,
          round,
        })),
      );
    },

    async publishLesson(input) {
      // Audit 2026-09-05 (A): one transaction — a lesson is either fully reachable
      // (html_files row + publishedAt + quiz export) or untouched.
      // B6: re-publish keeps the existing htmlFileId so old /preview links stay valid.
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ htmlFileId: lessons.htmlFileId })
          .from(lessons)
          .where(eq(lessons.id, input.lessonId))
          .limit(1);

        let fileId = existing?.htmlFileId ?? null;
        if (fileId) {
          await tx
            .update(htmlFiles)
            .set({
              title: input.title,
              description: "Websuli lecke — a lecke-futtató jeleníti meg.",
              classroom: input.classroom,
              contentType: "lesson",
            })
            .where(eq(htmlFiles.id, fileId));
        } else {
          const [file] = await tx
            .insert(htmlFiles)
            .values({
              title: input.title,
              content: LESSON_PLACEHOLDER_HTML,
              description: "Websuli lecke — a lecke-futtató jeleníti meg.",
              classroom: input.classroom,
              contentType: "lesson",
            })
            .returning({ id: htmlFiles.id });
          fileId = file.id;
        }

        await tx
          .update(lessons)
          .set({
            htmlFileId: fileId,
            publishedAt: new Date(),
            coverage: input.coverage as never,
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, input.lessonId));
        // Idempotent re-publish: the previous export of this lesson goes first.
        await tx.delete(gameQuizItems).where(eq(gameQuizItems.lessonId, input.lessonId));
        if (input.quizItems.length > 0) {
          await tx
            .insert(gameQuizItems)
            .values(input.quizItems.map((q) => ({ ...q, sourceMaterialId: fileId })));
        }
        return { htmlFileId: fileId, exportedQuizItems: input.quizItems.length };
      });
      // A lista-cache a GET /api/html-files előtt áll. Invalidálás CSAK a sikeres
      // commit után: különben az előnézet (/preview/:id) működik, a főoldal/Fájlok
      // lista pedig 5 percig a régi sort szolgálja.
      getHtmlFilesCache().invalidate();
      return result;
    },

    async upsertLesson(lessonId, mapId, json) {
      if (lessonId) {
        await db.update(lessons).set({ json: json as never, updatedAt: new Date() }).where(eq(lessons.id, lessonId));
        return lessonId;
      }
      const [row] = await db.insert(lessons).values({ mapId, json: json as never }).returning({ id: lessons.id });
      return row.id;
    },

    async createJob(input) {
      const [row] = await db
        .insert(studioJobs)
        .values({
          mapId: input.mapId,
          step: input.step,
          status: input.status,
          model: input.model,
          promptVersion: input.promptVersion,
          inputHash: input.inputHash,
        })
        .returning({ id: studioJobs.id });
      return row.id;
    },
  };
}

/* ------------------------------------------------------------------ *
 * LS-5 — "fix this concept"
 * ------------------------------------------------------------------ */

export type FixConceptResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * A lektorált lecke EGY gyenge fogalmának célzott újraírása.
 *
 * A szerződés a checkConceptFixResult: CSAK a célfogalmat fedő blokkok
 * változhatnak, azonosító mezők és minden más blokk bájtra azonos, új
 * fogalom-id nem születhet. Bármilyen eltérésnél a lecke ÉRINTETLEN marad,
 * a hibaszöveg pedig megnevezi a sértést — a feedback-loop nem lehet
 * tanterv-átírás hátsó ajtaja.
 */
export async function fixConceptOnLesson(
  lessonId: string,
  conceptId: string,
  deps: PipelineDeps = {},
): Promise<FixConceptResult> {
  const { providerFactory, keyConfigured, promptLookup } = await resolveDeps(deps);
  // Lazy, mint a createDrizzlePipelineStore-ban: a modul importja nem nyithat adatbázis-kapcsolatot.
  const { db } = await import("../db");

  const [row] = await db
    .select({ json: lessons.json, mapId: lessons.mapId })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!row) return { ok: false, error: "A lecke nem található." };

  const original = row.json as Lesson;
  const mapId = row.mapId;

  const [mapRow] = await db
    .select({ subject: knowledgeMaps.subject, classroom: knowledgeMaps.classroom })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.id, mapId))
    .limit(1);
  if (!mapRow) return { ok: false, error: "A lecke fogalomtérképe nem található." };

  const conceptRows = await db
    .select({
      id: kmConcepts.id,
      localId: kmConcepts.localId,
      term: kmConcepts.term, // #196: a megalapozottság-ellenőrzéshez kell
      definition: kmConcepts.definition,
      quote: kmConcepts.quote,
      examWeight: kmConcepts.examWeight,
    })
    .from(kmConcepts)
    .where(and(eq(kmConcepts.mapId, mapId), ne(kmConcepts.reviewState, "rejected")));

  if (!keyConfigured()) return { ok: false, error: NO_OPENROUTER_KEY_MESSAGE };

  const model = resolveStudioModel("author");
  const provider = providerFactory(model);

  const fallback = buildConceptFixPrompt(original, {
    subject: mapRow.subject,
    classroom: mapRow.classroom,
    concepts: conceptRows.map((c) => ({ ...c, examWeight: c.examWeight as ExamWeight })),
  }, conceptId);
  const system = await promptLookup(STUDIO_PROMPT_NAMES.authorFix, fallback);

  let json: unknown;
  try {
    const result = await callStepModel(provider, {
      step: "author",
      model,
      system,
      user: "Válaszolj kizárólag a kért JSON-nal.",
    });
    json = result.json;
  } catch (error) {
    const reason = error instanceof StepModelError ? error.message : "A modellhívás meghiúsult.";
    return { ok: false, error: reason };
  }

  const parsed = lessonSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `A javított lecke érvénytelen: ${zodIssues(parsed.error)}` };
  }

  const check = checkConceptFixResult(original, parsed.data, conceptId);
  if (!check.ok) {
    return { ok: false, error: `A javítás túllépett a célfogalmon — a lecke érintetlen: ${check.reasons.join("; ")}` };
  }

  await db.update(lessons).set({ json: parsed.data as never, updatedAt: new Date() }).where(eq(lessons.id, lessonId));
  return { ok: true, message: `A(z) ${conceptId} fogalom blokkjai frissítve.` };
}
