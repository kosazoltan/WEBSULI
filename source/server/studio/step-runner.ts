import { and, eq } from "drizzle-orm";

import { kmConcepts, knowledgeMaps, lektorNotes, lessons, studioJobs } from "../../shared/schema";
import type { IAIProvider } from "../ai/AIProvider";
import { resolveStudioModel } from "../ai/models";
import { isOpenRouterConfigured, OpenRouterProvider } from "../ai/OpenRouterProvider";
import { logger } from "../lib/logger";
import type { MapConcept } from "./coverage";
import { SUPPORTING_THRESHOLD } from "./coverage";
import { classifyNotes, type RawNote } from "./lektor";
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
import type { ZodError } from "zod";

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

export const PIPELINE_PROMPT_VERSION = "ls-2c-1";

export const NO_OPENROUTER_KEY_MESSAGE =
  "Az OPENROUTER_API_KEY nincs beállítva — a modell-lépés nem indítható el. " +
  "Állítsd be a kulcsot a környezeti változók között, vagy nézd meg a /api/studio/ai-status végpontot.";

export type MapMeta = { id: string; title: string; subject: string; classroom: number };

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
  /** Blocking lektor notes of a job — what the next Author round must fix. */
  loadBlockerNotes(jobId: string): Promise<RawNote[]>;
  saveStep(jobId: string, patch: JobPatch): Promise<void>;
  saveNotes(jobId: string, notes: Array<RawNote & { severity: "blocker" | "warn" | "info" }>): Promise<void>;
  /** Insert a new lessons row, or overwrite the existing one on a later Author round. */
  upsertLesson(lessonId: string | null, mapId: string, json: unknown): Promise<string>;
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
  return {
    store: deps.store ?? (await createDrizzlePipelineStore()),
    providerFactory: deps.providerFactory ?? defaultProviderFactory,
    keyConfigured: deps.keyConfigured ?? (() => isOpenRouterConfigured()),
    promptLookup: deps.promptLookup ?? ((name, fallback) => studioPromptStore.get(name, fallback)),
  };
}

const defaultProviderFactory = (model: string): IAIProvider =>
  new OpenRouterProvider({ model, apiKey: process.env.OPENROUTER_API_KEY ?? "" });

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
    // The deterministic gate is a later slice; here the pipeline simply waits.
    return { ok: true, next: { step: "gate", round: job.round }, cached: true };
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
      const blockers = await store.loadBlockerNotes(job.id);
      input = { outline, blockers, map: mapInputOf(map), concepts: map.concepts };
      system = await promptLookup(
        STUDIO_PROMPT_NAMES.author,
        buildAuthorPrompt(outline.sections, promptMapOf(map), blockers),
      );
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

  const hash = computeStepHash(job.step, PIPELINE_PROMPT_VERSION, input, job.round);

  // Idempotency: this exact input was already paid for and its output is stored.
  if (job.status === "ok" && job.inputHash === hash && job.output !== null) {
    return { ok: true, next: cachedNext(job), cached: true };
  }

  await store.saveStep(job.id, { status: "running", finishedAt: null, error: null });

  const model = resolveStudioModel(job.step);
  const provider = providerFactory(model);

  let json: unknown;
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  try {
    const result = await callStepModel(provider, {
      step: job.step,
      model,
      system,
      user: "Válaszolj kizárólag a kért JSON-nal.",
    });
    json = result.json;
    usage = result.usage ?? null;
  } catch (error) {
    const reason =
      error instanceof StepModelError
        ? error.message
        : `A(z) "${job.step}" lépés modellhívása hibára futott: ${
            error instanceof Error ? error.message : String(error)
          }`;
    return fail(store, job, reason);
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
      const parsed = lessonSchema.safeParse(json);
      if (!parsed.success) return fail(store, job, `A lecke alakilag hibás: ${zodIssues(parsed.error)}`);
      const unknownIds = lessonIdsSubsetOfMap(parsed.data, map.concepts);
      if (unknownIds.length > 0) {
        return fail(
          store,
          job,
          `A lecke olyan fogalomra hivatkozik, ami nem szerepel a térképen: ${unknownIds.join(", ")}.`,
        );
      }

      const lessonId = await store.upsertLesson(job.lessonId, job.mapId, parsed.data);
      await store.saveStep(
        job.id,
        successPatch({ ...job.output, lesson: parsed.data }, { lessonId }),
      );
      return { ok: true, next: nextStep({ step: job.step, ok: true, round: job.round }) };
    }

    case "animator": {
      const original = job.output?.lesson as Lesson | undefined;
      if (!original) return fail(store, job, "Az animátor lépéshez nincs lecke a jobban.");

      const parsed = lessonSchema.safeParse(json);
      if (!parsed.success) return fail(store, job, `Az animált lecke alakilag hibás: ${zodIssues(parsed.error)}`);

      const check = checkAnimatorResult(original, parsed.data);
      if (!check.ok) {
        return fail(store, job, `Az animátor megsértette a szerződést — ${check.reasons.join("; ")}`);
      }

      const lessonId = await store.upsertLesson(job.lessonId, job.mapId, parsed.data);
      await store.saveStep(
        job.id,
        successPatch({ ...job.output, lesson: parsed.data }, { lessonId }),
      );
      return { ok: true, next: nextStep({ step: job.step, ok: true, round: job.round }) };
    }

    case "lektor": {
      const parsed = lektorReportSchema.safeParse(json);
      if (!parsed.success) return fail(store, job, `A lektori jelentés alakilag hibás: ${zodIssues(parsed.error)}`);

      const notes = classifyNotes(parsed.data.notes);
      await store.saveNotes(job.id, notes);
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

      await store.saveStep(job.id, successPatch({ ...job.output, report: parsed.data, blockers }));
      return { ok: true, next: transition };
    }
  }
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
  await store.saveStep(jobId, {
    step: next.step,
    round: next.round,
    status: next.step === "error" ? "error" : opts.status,
    error: next.step === "error" ? (next.reason ?? "Ismeretlen hiba.") : null,
    finishedAt: new Date(),
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
 * Create the job row for a new lesson and hand back its id. The caller then drives
 * `runPipelineStep`; the input hash recorded here is the pedagogue input, computed from
 * the map's own subject/classroom — the request must agree with the map (one source of
 * truth, and the reason for the 409 otherwise).
 */
export async function startJobFromMap(
  mapId: string,
  input: { subject: string; classroom: number },
  deps: PipelineDeps = {},
): Promise<{ ok: true; jobId: string } | { ok: false; reason: string }> {
  const { store } = await resolveDeps(deps);
  const map = await store.loadMap(mapId);
  if (!map) return { ok: false, reason: "A térkép nem található." };
  if (map.concepts.length === 0) {
    return { ok: false, reason: "A térkép nem tartalmaz fogalmat — a pedagógus nem tud vázlatot készíteni." };
  }
  if (map.meta.subject !== input.subject || map.meta.classroom !== input.classroom) {
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

      const concepts = await db
        .select({ localId: kmConcepts.localId, examWeight: kmConcepts.examWeight })
        .from(kmConcepts)
        .where(eq(kmConcepts.mapId, mapId));

      return {
        meta: { id: map.id, title: map.title, subject: map.subject, classroom: map.classroom },
        concepts: concepts.map((c) => ({ localId: c.localId, examWeight: c.examWeight as ExamWeight })),
      };
    },

    async loadBlockerNotes(jobId) {
      const rows = await db
        .select({
          kind: lektorNotes.kind,
          subkind: lektorNotes.subkind,
          message: lektorNotes.message,
          blockPath: lektorNotes.blockPath,
        })
        .from(lektorNotes)
        .where(and(eq(lektorNotes.jobId, jobId), eq(lektorNotes.severity, "blocker")));
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

    async saveNotes(jobId, notes) {
      if (notes.length === 0) return;
      await db.insert(lektorNotes).values(
        notes.map((n) => ({
          jobId,
          kind: n.kind,
          subkind: n.subkind ?? null,
          severity: n.severity,
          message: n.message,
          blockPath: n.blockPath ?? null,
        })),
      );
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
    .select({ localId: kmConcepts.localId, examWeight: kmConcepts.examWeight })
    .from(kmConcepts)
    .where(eq(kmConcepts.mapId, mapId));

  if (!keyConfigured()) return { ok: false, error: NO_OPENROUTER_KEY_MESSAGE };

  const model = resolveStudioModel("author");
  const provider = providerFactory(model);

  const fallback = buildConceptFixPrompt(original, {
    subject: mapRow.subject,
    classroom: mapRow.classroom,
    concepts: conceptRows.map((c) => ({ localId: c.localId, examWeight: c.examWeight as ExamWeight })),
  }, conceptId);
  const system = await promptLookup(STUDIO_PROMPT_NAMES.author, fallback);

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

