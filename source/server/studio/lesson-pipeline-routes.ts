import express, { type Request, type Response } from "express";
import { and, asc, desc, eq, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import {
  conceptResults,
  gameQuizItems,
  gamesCatalog,
  kmConcepts,
  lektorNotes,
  lessons,
  studioJobs,
} from "../../shared/schema";
import { isAuthenticatedAdmin } from "../auth";
import { logger } from "../lib/logger";
import { aggregateConceptResults } from "../rewards/aggregate";
import {
  advanceJob,
  createDrizzlePipelineStore,
  approveOutline,
  forceApproveOutline,
  retryOutlineRound,
  fixConceptOnLesson,
  runPipelineStep,
  retryTimedOutLektor,
  retryFailedBankBuild,
  retryFailedGate,
  retryWithAuthorRepair,
  retryAfterRestart,
  resumeKindOf,
  recoveryHistoryOf,
  startJobFromMap,
} from "./step-runner";
import { COUPON_GAME_IDS, conceptIdResolver, exportQuizItemsFromChecks } from "./quiz-export";
import { canonicalLessonQuiz } from "./canonical-quiz-bank";
import { MAX_CHAIN_STEPS } from "./pipeline";
import { fromMapBody } from "./from-map-body";
import { callScopeModel, decideOneStepAction, inferOneStepScope, parseOneStepRequest, type OneStepRequest } from "./one-step";
import {
  createRun as createRunBase,
  getRun as getRunBase,
  markOrphanedRuns,
  updateRun as updateRunBase,
  type OneStepPhase,
  type OneStepRun,
} from "./one-step-progress";
import { ORPHAN_JOB_ERROR, sweepDecision, type SweepRow } from "./orphan-jobs";
import { driveRemadeWith } from "./remade-drive";
import { singleRunEnabled } from "./single-run/switch";
import { UNCERTAIN_MARK } from "./ocr";
import { quoteTouchesUncertain } from "../../shared/transcript-marks";
import { autonomousDecision } from "./autonomous";
import { oneStepRuns } from "../../shared/schema";
import { NOT_RESUMABLE_STRATEGIES, failureFingerprint, planRecovery, recoveryReason, type RecoveryStep } from "./recovery-planner";
import { recoveryCandidate, type RecoveryRow } from "./recovery-sweep";
import { WORKFLOW_EXPLICIT_RESUME_BUDGET, executeWorkflow, workflowFinding, workflowPhase, workflowResource, workflowValidationFailure, workflowFence, WorkflowWaiting, WorkflowConflict } from "../workflows/engine";
import { workflowStore } from "../workflows/store";
import { runToolWorkflow } from "../workflows/tool-run";
import { htmlFiles } from "../../shared/schema";
import { respondToResume, guardResumedDrive } from "./resume-response";
import { normalizeOwnerInstruction } from "../../shared/owner-instruction";
import { arithmeticSourceCorrections, correctionApplied, correctionAuditText, correctionFindingNeeded, correctionReasonCode, explicitClassroomOf, mergeCorrections, proposeSourceCorrections, type SourceCorrection } from "./source-corrections";
import { callStepModel } from "./run-step";
import { decideTopicFocus, topicFocusModels, type TopicFocus } from "./topic-focus";
import { createStudioStepProvider } from "../ai/studio-provider";
import type { MapConcept } from "./coverage";

/* ------------------------------------------------------------------ *
 * #168 — a futás-státusz DB-perzisztálása (Render-restart ellen).
 * ------------------------------------------------------------------ */

async function persistRun(run: OneStepRun): Promise<void> {
  await db
    .insert(oneStepRuns)
    .values({
      id: run.id,
      phase: run.phase,
      detail: run.detail,
      error: run.error,
      mapId: run.mapId,
      jobId: run.jobId,
      lessonId: run.lessonId,
      startedAt: new Date(run.startedAt),
      updatedAt: new Date(run.updatedAt),
    })
    .onConflictDoUpdate({
      target: oneStepRuns.id,
      set: {
        phase: run.phase,
        detail: run.detail,
        error: run.error,
        mapId: run.mapId,
        jobId: run.jobId,
        lessonId: run.lessonId,
        updatedAt: new Date(run.updatedAt),
      },
    });
}

async function loadRun(id: string): Promise<OneStepRun | null> {
  const [row] = await db.select().from(oneStepRuns).where(eq(oneStepRuns.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    phase: row.phase as OneStepPhase,
    detail: row.detail,
    error: row.error,
    mapId: row.mapId,
    jobId: row.jobId,
    lessonId: row.lessonId,
    startedAt: row.startedAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

const createRun = (id?: string) => createRunBase(persistRun, id);
const updateRun = (id: string, patch: Parameters<typeof updateRunBase>[1]) =>
  updateRunBase(id, patch, persistRun);
const getRun = (id: string) => getRunBase(id, loadRun);

/** A haladásjelző szövege, amíg a job-söprés a megszakadt gyártást folytatja (a futás nem zárul hibára). */
/**
 * Review #247 (P2): „ugyanabból a forrásból újabb gyártás van” — csak UGYANANNAK a tulajdonosnak az újabb jobja számít (a térképek globálisan
 * újrahasznosíthatók; másik admin gyártása nem teheti félre ennek a piszkozatát). Feltétel: a lekérdezésben `j` a job, `r.owner_id` a gazdája.
 */
const HAS_NEWER_SAME_OWNER = sql.raw(`EXISTS (SELECT 1 FROM studio_jobs n JOIN lesson_workflow_runs nw ON (nw.id = n.id OR nw.snapshot->>'resourceId' = n.id)
  WHERE n.map_id = j.map_id AND n.created_at > j.created_at AND nw.owner_id = r.owner_id)`);

export const ONE_STEP_RESUMING_DETAIL = "A szerver újraindult — a gyártás magától folytatódik a mentett részekből (nem kell újra feltölteni).";

/**
 * #168 — boot-sweep: a folyamat halálakor árván maradt futások explicit hibára
 * záródnak, hogy a kliens jelzője ne ragadjon be. Induláskor egyszer fut.
 */
export async function closeOrphanedOneStepRuns(): Promise<number> {
  const open = await db
    .select({ id: oneStepRuns.id, phase: oneStepRuns.phase, jobId: oneStepRuns.jobId })
    .from(oneStepRuns);
  // Mért hiba 2026-10-15 (docs/specs/2026-10-15-ujraindulas-utani-folytatas.md): az „indítsd újra a feltöltést” üzenet új, elölről induló
  // gyártásra terelte a tulajdonost, holott a piszkozat (tanítás, kész bankcsomagok) megvolt. Ha a futás jobja mentett, nem publikált
  // leckével áll, a futás NEM zárul le: a job-söprés a megszakadt lépéstől folytatja, és ez a haladásjelzőt is frissíti.
  const resumable = new Set<string>();
  const jobIds = open.filter((r) => r.jobId).map((r) => r.jobId!);
  if (jobIds.length) {
    // Review #247 (P1): csak az a futás marad nyitva, amelynek jobját a job-söprés TÉNYLEG folytatja (ugyanaz a döntés: `sweepDecision`,
    // nem hibás/kész job, nincs ugyanattól a tulajdonostól újabb gyártás) — különben a kliens örökké „magától folytatódik”-ot pollozna.
    const { rows } = await db.execute(sql`
      SELECT j.id, j.status, r.id AS run_id, r.owner_id, r.state AS run_state, r.lease_until,
             COALESCE((r.snapshot->>'executions')::int, 0) AS executions, ${HAS_NEWER_SAME_OWNER} AS has_newer,
             (j.output ? 'lesson') AS has_lesson, (l.published_at IS NOT NULL) AS published
      FROM studio_jobs j
      LEFT JOIN lessons l ON l.id = j.lesson_id
      LEFT JOIN LATERAL (
        SELECT w.id, w.owner_id, w.state, w.lease_until, w.snapshot FROM lesson_workflow_runs w
        WHERE w.id = j.id OR w.snapshot->>'resourceId' = j.id ORDER BY w.created_at DESC LIMIT 1
      ) r ON true
      WHERE j.id IN (${sql.join(jobIds.map((id) => sql`${id}`), sql`, `)}) AND j.status NOT IN ('ok', 'error')`);
    const now = Date.now();
    for (const raw of rows as Array<Record<string, unknown>>) {
      if (raw.has_lesson !== true || raw.published === true || raw.has_newer === true) continue;
      const row: SweepRow = { id: String(raw.id), status: String(raw.status), runId: (raw.run_id as string | null) ?? null, owner: (raw.owner_id as string | null) ?? null,
        runState: (raw.run_state as string | null) ?? null, leaseUntil: raw.lease_until ? new Date(String(raw.lease_until)) : null, executions: Number(raw.executions ?? 0) };
      if (sweepDecision(row, now, true) !== "close") resumable.add(row.id);
    }
  }
  const orphans = markOrphanedRuns(open.filter((r) => !(r.jobId && resumable.has(r.jobId))));
  for (const r of open.filter((x) => x.jobId && resumable.has(x.jobId) && markOrphanedRuns([x]).length)) {
    await db.update(oneStepRuns).set({ detail: ONE_STEP_RESUMING_DETAIL, error: null, updatedAt: new Date() }).where(eq(oneStepRuns.id, r.id));
    logger.warn(`[STUDIO/1STEP] ${r.id}: szerver-újraindulás — a gyártás a mentett részekből folytatódik (job ${r.jobId}).`);
  }
  for (const o of orphans) {
    await db
      .update(oneStepRuns)
      .set({ phase: "error", error: o.error, updatedAt: new Date() })
      .where(eq(oneStepRuns.id, o.id));
  }
  if (orphans.length > 0) {
    logger.warn(`[STUDIO/1STEP] ${orphans.length} árva futás hibára zárva (szerver-újraindulás).`);
  }
  return orphans.length;
}

/**
 * #183 — ugyanaz a boot-sweep a studio_jobs sorokra. Mérve élesben: egy
 * step=gate/status=running sor 10 órán át állt finished_at nélkül, mert az őt
 * hajtó folyamat meghalt — a JobMonitor pedig 2 másodpercenként pollozta a
 * végtelenségig. A #168-as söprés csak a one_step_runs táblát fedte le.
 */
export async function closeOrphanedStudioJobs(): Promise<number> {
  return sweepStudioJobs(true);
}

/**
 * Spec 2026-10-05-s10-adatvesztes-mentesseg (2. szelet): a nyitott jobok söprése a `sweepDecision` szerint — folytatás a mentett
 * részeredményekből (kézi „Újra” nélkül), érintetlenül hagyás (élő lízing), vagy a régi lezárás (csak induláskor).
 * Indításkor ÉS utána STUDIO_SWEEP_INTERVAL_MS-onként fut: deploykor a régi példány még tartja a lízinget, annak lejárta után
 * a futás itt folytatódik (a terv-ellenőrzés blokkoló lelete).
 */
export async function sweepStudioJobs(boot: boolean): Promise<number> {
  const { rows } = await db.execute(sql`
    SELECT j.id, j.status, r.id AS run_id, r.owner_id, r.state AS run_state, r.lease_until,
           COALESCE((r.snapshot->>'executions')::int, 0) AS executions,
           ${HAS_NEWER_SAME_OWNER} AS has_newer
    FROM studio_jobs j
    LEFT JOIN LATERAL (
      SELECT w.id, w.owner_id, w.state, w.lease_until, w.snapshot FROM lesson_workflow_runs w
      WHERE w.id = j.id OR w.snapshot->>'resourceId' = j.id ORDER BY w.created_at DESC LIMIT 1
    ) r ON true
    WHERE j.status NOT IN ('ok', 'error')`);
  const now = Date.now();
  let acted = 0;
  for (const raw of rows as Array<Record<string, unknown>>) {
    const row: SweepRow = {
      id: String(raw.id), status: String(raw.status), runId: (raw.run_id as string | null) ?? null, owner: (raw.owner_id as string | null) ?? null,
      runState: (raw.run_state as string | null) ?? null, leaseUntil: raw.lease_until ? new Date(String(raw.lease_until)) : null, executions: Number(raw.executions ?? 0),
    };
    // Ugyanabból a forrásból újabb gyártás van: a régi, gazdátlan job NEM folytatódik (dupla, fizetős gyártás ellen) — lezárul.
    const raw0 = raw.has_newer === true && sweepDecision(row, now, boot) === "resume" ? "close" : sweepDecision(row, now, boot);
    // docs/specs/2026-10-16-egy-futas.md (D): egyfutásos módban a régi lépésgép jobja nem folytatódik automatikusan — lezárul (piszkozat marad).
    const decision = singleRunEnabled() && raw0 === "resume" ? "close" : raw0;
    if (decision === "leave") continue;
    acted++;
    if (decision === "close") {
      await db.update(studioJobs).set({ status: "error", step: "error", error: ORPHAN_JOB_ERROR, finishedAt: new Date() }).where(and(eq(studioJobs.id, row.id), ne(studioJobs.status, "ok")));
      logger.warn(`[STUDIO] Árva lecke-job hibára zárva (${row.id}) — nincs folytatható futás.`);
      continue;
    }
    logger.warn(`[STUDIO] Félbemaradt futás automatikus folytatása (${row.id}, ${row.executions + 1}. végrehajtás) a mentett részeredményekből.`);
    void driveTracked(row.id, row.owner!, false).catch((error) => {
      // Lízing-ütközés: egy másik élő folyamat hajtja (pl. ugyanazon a DB-n futó másik példány) — nem zárjuk hibára.
      if (error instanceof WorkflowConflict) { logger.warn(`[STUDIO] Automatikus folytatás kihagyva (${row.id}): ${error.message}`); return; }
      logger.error(`[STUDIO] Az automatikus folytatás elbukott (${row.id})`, error);
      void db.update(studioJobs).set({ status: "error", step: "error", error: ORPHAN_JOB_ERROR, finishedAt: new Date() }).where(and(eq(studioJobs.id, row.id), ne(studioJobs.status, "ok")))
        .catch(() => logger.error("[STUDIO] A megállás státuszát sem sikerült menteni."));
    });
  }
  return acted;
}

export const STUDIO_SWEEP_INTERVAL_MS = 100_000;
/** Időszakos söprés (a lejárt lízingű futások folytatása); a folyamat leállását nem tartja fel. */
export function startStudioJobSweeper(): void {
  setInterval(() => {
    void sweepStudioJobs(false).catch((error) => logger.warn(`[STUDIO] Időszakos söprés hibája: ${error instanceof Error ? error.message : String(error)}`));
    void sweepFailedStudioJobs().catch((error) => logger.warn(`[VEZÉRLŐ] Söprés hibája: ${error instanceof Error ? error.message : String(error)}`));
  }, STUDIO_SWEEP_INTERVAL_MS).unref();
}
import { computeInputHash, extractionSignature, ExtractionShapeError, type ExtractorFile } from "./extractor";
import { knowledgeMaps } from "../../shared/schema";
import { resolveStudioModel } from "../ai/models";

/**
 * LS-2c — the admin endpoints that drive the lesson pipeline.
 *
 * Mounted under /api/studio (admin-only, same guard as the KnowledgeMap routes).
 * Thin by design: the paid orchestration lives in step-runner.ts; these handlers
 * parse, drive the state machine one step at a time and report.
 *
 * Drive rule: after a successful step the job advances. A transition to `author`
 * without an admin-approved outline parks the job (`ok`, waiting); `lektor` and an
 * approved-outline `author` are automatic and keep running; the `gate` parks it
 * (the deterministic gate is a later slice). The loop is bounded — `nextStep`
 * hard-stops at the round limit regardless.
 */

export const lessonPipelineRouter = express.Router();

lessonPipelineRouter.use(isAuthenticatedAdmin);

// #177: derived from MAX_AUTHOR_ROUNDS in pipeline.ts — a hand-picked 8 cut a legal round 2 short.
const MAX_CHAIN = MAX_CHAIN_STEPS;

/** Run the current step and keep going while the transition is automatic. */
async function drive(jobId: string, onStep?: (step: string, round: number) => void): Promise<void> {
  for (let i = 0; i < MAX_CHAIN; i++) {
    const outcome = await runPipelineStep(jobId);
    if (!outcome.ok) return; // failure/park already persisted by the runner

    const [job] = await db
      .select({ output: studioJobs.output })
      .from(studioJobs)
      .where(eq(studioJobs.id, jobId))
      .limit(1);
    const output = (job?.output ?? null) as Record<string, unknown> | null;

    const next = outcome.next;
    const auto =
      next.step === "animator" ||
      next.step === "lektor" ||
      // Audit 2026-09-05 (A): the gate is deterministic — no admin click needed to run it.
      next.step === "gate" ||
      (next.step === "author" && output?.approvedOutline !== undefined);

    await advanceJob(jobId, next, { status: auto ? "running" : "ok" });
    // Spec 2026-09-19: the one-step progress store follows every automatic step, not only
    // the round boundaries (measured: a 7-minute animator round showed a stale "author").
    onStep?.(next.step, next.round);
    if (!auto) return;
  }

  // Bounded by construction (round limit), but never loop silently if that changes.
  logger.error(`[STUDIO] A pipeline-lánc túllépte a ${MAX_CHAIN} lépéses határt: ${jobId}`);
  await advanceJob(
    jobId,
    { step: "error", round: 0, reason: "A pipeline-lánc nem ért véget a lépés-határon belül." },
    { status: "ok" },
  );
}

/* fromMapBody moved to ./from-map-body (#180) so the unit test can import it DB-free. */

/**
 * POST /api/studio/lessons/one-step — LS-6 (#164): upload → map → lesson in one call.
 *
 * LS-6b (#165): answers 202 + runId IMMEDIATELY and does the work in the
 * background, updating an in-memory progress store at every phase boundary.
 * The client polls GET /lessons/one-step/:runId and shows a live phase list
 * (OCR i/n, extraction, outline, writing, animator, lektor) — the teacher must
 * see the machine working, not a dead spinner. Gates unchanged: outline
 * auto-approval goes through approveOutline() (coverage decides), lektor
 * untouched.
 */
export async function recordOneStepFailure(runId: string, error: unknown): Promise<void> {
  const current = await getRun(runId);
  if (!current) return;
  if (current.phase === "done" || current.phase === "parked" || current.phase === "error" || current.phase === "draft") return;
  logger.error(`[STUDIO/1STEP] Váratlan hiba: ${error instanceof Error ? error.message : String(error)}`);
  updateRun(runId, { phase: "error", error: "Váratlan hiba történt. Próbáld újra." });
}

lessonPipelineRouter.post("/lessons/one-step", async (req: Request, res: Response) => {
  const parsed = parseOneStepRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: "Hibás kérés.", issues: parsed.issues });
  }

  const userId = (req.user as { id?: string } | undefined)?.id;
  res.status(202).json({ runId: startOneStepRun(parsed.data, userId) });
});

/**
 * Starts a one-step run in the background; the run loop reports through the progress store.
 * Spec 2026-09-25: the internet path hands its downloaded sources to this same manufacture.
 */
export function startOneStepRun(data: OneStepRequest, userId: string | undefined): string {
  const runId = createRun();
  void runOneStep(runId, data, userId).catch((error) => {
    if (error instanceof WorkflowWaiting) return;
    void recordOneStepFailure(runId, error);
  });
  return runId;
}

/** Spec 2026-10-14-folytatas-mentett-reszekbol: a megállt gyártás mentett piszkozata (csak darabszámok, tartalom nem). */
export type OneStepDraft = { teachingSections: number; savedBankPackets: number };

export type OneStepRunView = {
  phase: OneStepPhase; detail: string | null; error: string | null;
  mapId: string | null; jobId: string | null; lessonId: string | null; htmlFileId: string | null;
  draft?: OneStepDraft;
  /** Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D3, D5): csak hibánál — folytatható-e, és melyik workflow-lépésnél állt meg. */
  resumable?: boolean; stoppedAt?: string;
  /** A folytatás fajtája (a felület szövege ehhez igazodik): bank | gate | review | rebuild | lektor. */
  resumeKind?: string;
  /** Elakadás-vezérlő V1: a program következő lépése (a döntési lépcső szerint). */
  nextRecovery?: { strategy: string; reason: string };
  /** docs/specs/2026-10-15-hiba-gombok.md (E2): a piszkozat saját feltöltéses futása — folytatáskor a felület ezt követi. */
  draftRunId?: string;
  /** Review #250 (P1): a megállt job eredeti tanári kérése — oldalfrissítés után az újragyártás ezzel indul (nem kérés nélkül). */
  ownerInstruction?: string;
};

/**
 * A job eredményéből: van-e nem publikált, mentett tananyag, és hány bankcsomag kész belőle. Review #215: a publikálás a
 * `lessons` sort előbb commitolja, mint a job-output `htmlFileId`-ját — a hívó a lecke `publishedAt`-ját is átadja.
 */
export function draftSummaryOf(output: unknown, lessonPublished = false): OneStepDraft | null {
  const o = (output ?? {}) as { lesson?: { sections?: unknown }; htmlFileId?: unknown; experienceCheckpoint?: { parts?: unknown } };
  if (lessonPublished || !o.lesson || !Array.isArray(o.lesson.sections) || o.htmlFileId) return null;
  const parts = o.experienceCheckpoint?.parts;
  return { teachingSections: o.lesson.sections.length, savedBankPackets: parts && typeof parts === "object" ? Object.keys(parts).length : 0 };
}

/**
 * docs/specs/2026-10-15-hiba-gombok.md (E1): a térkép legújabb folytatható piszkozata — mentett lecke, nem publikált, nem sikeresen lezárt,
 * nem félretett, 7 napon belüli, és ugyanaz a tanári kérés. `null`, ha nincs.
 */
export async function resumableDraftFor(mapId: string, instruction: string | undefined, owner: string): Promise<string | null> {
  // Review #248: a kérés-egyezés a lekérdezésben szűr (egy újabb, más kérésű változat nem takarja el a régebbi egyezőt), és csak a SAJÁT piszkozat
  // ajánlható fel (a térkép globálisan újrahasznosítható) — a gazdát a job workflow-ja adja.
  const { rows } = await db.execute(sql`SELECT j.id FROM studio_jobs j LEFT JOIN lessons l ON l.id = j.lesson_id
    WHERE j.map_id = ${mapId} AND j.output ? 'lesson' AND l.published_at IS NULL AND j.status <> 'ok' AND j.created_at > now() - interval '7 days'
      AND coalesce(j.output->>'recoveryState', '') NOT IN ('superseded', 'remanufactured', 'remanufacturing', 'discarded')
      AND coalesce(j.output->>'ownerInstruction', '') = ${instruction || ""}
      AND EXISTS (SELECT 1 FROM lesson_workflow_runs w WHERE (w.id = j.id OR w.snapshot->>'resourceId' = j.id) AND w.owner_id = ${owner})
    ORDER BY j.created_at DESC LIMIT 1`);
  const row = rows[0] as { id: string } | undefined;
  return row ? String(row.id) : null;
}

/**
 * E3: kifejezett újragyártásnál a forrás régi, MEGÁLLT piszkozatai félreteszve (a vezérlő nem folytatja őket). Review #248 (P1): csak az
 * ugyanazzal a kéréssel, ugyanattól a gazdától megállt (`error`) jobok — más kérésű változat és futó job nem érintett (azt a job-söprés kezeli).
 */
export async function supersedeDraftsOf(mapId: string, instruction: string | undefined, owner: string): Promise<void> {
  await db.execute(sql`UPDATE studio_jobs j SET output = coalesce(j.output, '{}'::jsonb) || '{"recoveryState":"superseded"}'::jsonb
    WHERE j.map_id = ${mapId} AND j.status = 'error' AND j.output ? 'lesson' AND coalesce(j.output->>'ownerInstruction', '') = ${instruction || ""}
      AND EXISTS (SELECT 1 FROM lesson_workflow_runs w WHERE (w.id = j.id OR w.snapshot->>'resourceId' = j.id) AND w.owner_id = ${owner})`);
}

/** The progress poll's view of a run, or null when it is unknown or expired. */
export async function oneStepRunView(runId: string): Promise<OneStepRunView | null> {
  const run = await getRun(runId);
  if (!run) return null;
  // Audit 2026-09-05 (A): a finished run points at the published material so the teacher
  // (and the child) can open it — the html_files id lives on the lessons row.
  let htmlFileId: string | null = null;
  if (run.phase === "done" && run.lessonId) {
    const [lesson] = await db
      .select({ htmlFileId: lessons.htmlFileId })
      .from(lessons)
      .where(eq(lessons.id, run.lessonId))
      .limit(1);
    htmlFileId = lesson?.htmlFileId ?? null;
  }
  let draft: OneStepDraft | null = null;
  let stop: { resumable: boolean; stoppedAt?: string; resumeKind?: string; nextRecovery?: { strategy: string; reason: string } } | null = null;
  // A piszkozat-választásnál (draft) ugyanaz a nézet, mint hibánál: mentett részek, folytathatóság, a piszkozat saját futása.
  let draftRunId: string | undefined;
  let ownerInstruction: string | undefined;
  if (run.phase === "draft" && run.jobId) {
    const [other] = await db.select({ id: oneStepRuns.id }).from(oneStepRuns).where(and(eq(oneStepRuns.jobId, run.jobId), ne(oneStepRuns.id, runId))).orderBy(desc(oneStepRuns.updatedAt)).limit(1);
    draftRunId = other?.id;
  }
  if ((run.phase === "error" || run.phase === "draft") && run.jobId) {
    const [job] = await db.select({ output: studioJobs.output, publishedAt: lessons.publishedAt, step: studioJobs.step, status: studioJobs.status,
      error: studioJobs.error, lessonId: studioJobs.lessonId }).from(studioJobs)
      .leftJoin(lessons, eq(studioJobs.lessonId, lessons.id)).where(eq(studioJobs.id, run.jobId)).limit(1);
    // E2 tartalék: ha a piszkozat jobja (a folytatás után) már halad vagy elkészült, a választó futás a job állapotát mutatja —
    // akkor is, ha a régi futás sora (draftRunId) már nincs meg; így a felület nem ragad a választásnál.
    if (run.phase === "draft" && job && job.status !== "error" && job.step !== "error") {
      const lessonId = job.step === "done" ? job.lessonId : null;
      const [published] = lessonId ? await db.select({ htmlFileId: lessons.htmlFileId }).from(lessons).where(eq(lessons.id, lessonId)).limit(1) : [];
      return { phase: (job.step === "done" ? "done" : job.step) as OneStepPhase, detail: "Folytatás a mentett részeredményekből.", error: null, mapId: run.mapId, jobId: run.jobId,
        lessonId, htmlFileId: published?.htmlFileId ?? null, ...(draftRunId ? { draftRunId } : {}) };
    }
    draft = draftSummaryOf(job?.output, !!job?.publishedAt);
    const instructionOfJob = (job?.output as { ownerInstruction?: unknown } | null)?.ownerInstruction;
    if (typeof instructionOfJob === "string" && instructionOfJob.trim()) ownerInstruction = instructionOfJob;
    // A piszkozat-választásnál a piszkozat jobjának saját workflow-ja számít (az új futásnak még nincs gyártási naplója).
    const { visits, executions } = run.phase === "draft" ? await workflowVisitsOfJob(run.jobId) : await workflowVisitsOf(runId);
    stop = job ? jobStopInfo(job, visits, executions) : { resumable: false, stoppedAt: visits.filter((v) => v.state === "error").at(-1)?.step };
  }
  return { phase: run.phase, detail: run.detail, error: run.error, mapId: run.mapId, jobId: run.jobId, lessonId: run.lessonId, htmlFileId, ...(draft ? { draft } : {}),
    ...(draftRunId ? { draftRunId } : {}), ...(ownerInstruction ? { ownerInstruction } : {}),
    ...(stop ? { resumable: stop.resumable, ...(stop.stoppedAt ? { stoppedAt: stop.stoppedAt } : {}), ...(stop.resumeKind ? { resumeKind: stop.resumeKind } : {}),
      ...(stop.nextRecovery ? { nextRecovery: stop.nextRecovery } : {}) } : {}) };
}

/** A megállt job folytathatósága — EGY szabály a futásnézetnek és az admin piszkozatlistának (docs/specs/2026-10-15-admin-tananyag-draft.md). */
export type JobStopInfo = { resumable: boolean; stoppedAt?: string; resumeKind?: string; nextRecovery?: { strategy: string; reason: string } };
function jobStopInfo(job: { output: unknown; publishedAt: Date | null; step: string; status: string; error: string | null; lessonId: string | null },
  visits: Array<{ step: string; state: string; error?: string }>, executions: number): JobStopInfo {
  const output = (job.output ?? {}) as { lesson?: unknown; htmlFileId?: unknown; gateRecoveryAttempt?: unknown };
  // Review #233/#234: a felület ugyanazzal a (régi mezőkből is visszafejtett) történettel tervez, mint a végrehajtás; a gomb csak akkor
  // látszik, ha a következő fok a mentett részekből tényleg végrehajtható.
  const remanufacturedAs = (job.output as { remanufacturedAs?: unknown } | null)?.remanufacturedAs;
  const plan = typeof remanufacturedAs === "string"
    ? { strategy: "ask-owner" as const, reason: `új gyártás indult ugyanabból a forrásból (${remanufacturedAs.slice(0, 8)}) — a Tananyagkészítési futások között követhető`, cls: "other" as const, fingerprint: "" }
    // Újraindulás utáni folytatás: nem a tervező lépcsője, hanem a megszakadt lépés folytatása (docs/specs/2026-10-15-ujraindulas-utani-folytatas.md).
    : job.error === ORPHAN_JOB_ERROR ? { strategy: "restart" as const, reason: recoveryReason("restart"), cls: "other" as const, fingerprint: "" }
    : job.error ? planRecovery({ error: job.error, history: recoveryHistoryOf(job.output as never, job.error) }) : null;
  const executable = !plan || !NOT_RESUMABLE_STRATEGIES.includes(plan.strategy);
  const kind = resumeKindOf({ step: job.step, status: job.status, error: job.error, hasLesson: !!job.lessonId && !!output.lesson,
    htmlFileId: output.htmlFileId, published: !!job.publishedAt, visit: visits.at(-1), gateRecoveryAttempt: output.gateRecoveryAttempt });
  return {
    // Tulajdonosi döntés 2026-10-15: a gomb a kifejezett folytatás végrehajtási keretét is nézi (a szerver ugyanezzel utasít el).
    resumable: executions < WORKFLOW_EXPLICIT_RESUME_BUDGET && kind !== null && executable,
    stoppedAt: visits.filter((v) => v.state === "error").at(-1)?.step,
    // A felület szövege a TÉNYLEGESEN végrehajtandó lépést mondja: kapuhibánál a tervező dönt (kapu / újraépítés), nem a régi számláló.
    ...(kind ? { resumeKind: (kind === "gate" || kind === "rebuild") && plan ? (plan.strategy === "gate" ? "gate" : plan.strategy.startsWith("rebuild") ? "rebuild" : kind) : kind } : {}),
    ...(plan ? { nextRecovery: { strategy: plan.strategy, reason: plan.reason } } : {}),
  };
}

/** A futás workflow-látogatásai és végrehajtásszáma (csak olvasás; workflow-napló nélküli futásnál üres / 0). */
async function workflowVisitsOf(runId: string): Promise<{ visits: Array<{ step: string; state: string; error?: string }>; executions: number }> {
  const result = await db.execute(sql`SELECT snapshot->'visits' AS visits, snapshot->'executions' AS executions FROM lesson_workflow_runs WHERE id = ${runId} LIMIT 1`);
  return parseWorkflowVisits(result.rows[0] as { visits?: unknown; executions?: unknown } | undefined);
}

/** A workflow-pillanatkép látogatásai és végrehajtásszáma — egy értelmezés a futásnézetnek és a kötegelt piszkozatlistának. */
function parseWorkflowVisits(row: { visits?: unknown; executions?: unknown } | undefined): { visits: Array<{ step: string; state: string; error?: string }>; executions: number } {
  const visits = Array.isArray(row?.visits) ? row!.visits.filter((v): v is { step: string; state: string; error?: string } => !!v && typeof v.step === "string" && typeof v.state === "string") : [];
  return { visits, executions: typeof row?.executions === "number" ? row.executions : 0 };
}

/** A job legutóbbi workflow-futásának látogatásai és végrehajtásszáma (a piszkozat-választás nézetéhez). */
async function workflowVisitsOfJob(jobId: string): Promise<{ visits: Array<{ step: string; state: string; error?: string }>; executions: number }> {
  const result = await db.execute(sql`SELECT id FROM lesson_workflow_runs WHERE id = ${jobId} OR snapshot->>'resourceId' = ${jobId} ORDER BY created_at DESC LIMIT 1`);
  const row = result.rows[0] as { id?: string } | undefined;
  return row?.id ? workflowVisitsOf(String(row.id)) : { visits: [], executions: 0 };
}

/** docs/specs/2026-10-15-admin-tananyag-draft.md + 2026-10-16-draft-kezeles.md: az admin „Tananyag draft” listájának egy tétele. */
export type OwnerDraft = { jobId: string; title: string; subject: string; classroom: number; draft: OneStepDraft | null; running: boolean;
  error: string | null; updatedAt: string; step: string; ownerless: boolean; hasPublished: boolean; awaitingApproval: boolean } & JobStopInfo;

/**
 * docs/specs/2026-10-16-draft-kezeles.md: a belépett admin által kezelhető job — nincs olyan workflow-sora, amelynek MÁS a gazdája
 * (saját vagy gazdátlan). Feltétel: a lekérdezésben `j` a job.
 */
const manageableBy = (owner: string) => sql`NOT EXISTS (SELECT 1 FROM lesson_workflow_runs ow WHERE (ow.id = j.id OR ow.snapshot->>'resourceId' = j.id) AND ow.owner_id <> ${owner})`;

/**
 * Review #255 (P2): elvetni csak olyan jobot lehet, amelyet épp senki nem visz (nincs élő workflow-lízing, nincs folyamatban lévő újragyártás) —
 * a folytatás a lízing alatt újraellenőrzi az elvetést, így a kettő atomikusan kizárja egymást.
 */
const notBeingDriven = sql`NOT EXISTS (SELECT 1 FROM lesson_workflow_runs lw WHERE (lw.id = j.id OR lw.snapshot->>'resourceId' = j.id) AND lw.lease_until > now())
  AND coalesce(j.output->>'recoveryState', '') NOT IN ('remanufacturing', 'remanufactured')`;

/**
 * A1/A2 + D1–D4: a kezelhető (saját vagy gazdátlan) megállt piszkozatok — mentett, nem publikált lecke; nem sikeres, nem félretett, nem elvetett
 * job — ÉS a saját, éppen futó gyártások (2 napon belül, lecke nélkül is), hogy a folytatás/újragyártás haladása látsszon.
 * A folytathatóság ugyanaz a döntés, mint a futásnézeté (`jobStopInfo`). Csak olvas.
 */
/** Review #255 (P2): a lista felső korlátja — a túlcsordulást a válasz `total` mezője jelzi (nem rejt el észrevétlenül). */
export const DRAFT_LIST_LIMIT = 200;

/** A kezelhető tételek teljes száma (a lista feltételével, korlát nélkül). */
export async function ownerDraftTotal(owner: string): Promise<number> {
  const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM studio_jobs j LEFT JOIN lessons l ON l.id = j.lesson_id
    LEFT JOIN LATERAL (SELECT w.owner_id FROM lesson_workflow_runs w WHERE w.id = j.id OR w.snapshot->>'resourceId' = j.id ORDER BY w.created_at DESC LIMIT 1) wr ON true
    WHERE coalesce(j.output->>'recoveryState', '') NOT IN ('superseded', 'remanufactured', 'remanufacturing', 'discarded')
      AND ((j.output ? 'lesson' AND l.published_at IS NULL AND j.status <> 'ok' AND ${manageableBy(owner)})
        OR (j.status IN ('pending', 'running') AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner})
        OR (j.status = 'ok' AND j.step = 'author' AND j.output ? 'outline' AND NOT j.output ? 'approvedOutline' AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner}))`);
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function ownerDrafts(owner: string): Promise<OwnerDraft[]> {
  const { rows } = await db.execute(sql`SELECT j.id, j.step, j.status, j.error, j.lesson_id, j.output, coalesce(j.finished_at, j.created_at) AS updated_at,
      m.title AS map_title, m.subject, m.classroom, wr.visits AS wf_visits, wr.executions AS wf_executions, wr.owner_id AS wf_owner,
      EXISTS (SELECT 1 FROM lessons p WHERE p.map_id = j.map_id AND p.published_at IS NOT NULL) AS has_published
    FROM studio_jobs j LEFT JOIN lessons l ON l.id = j.lesson_id JOIN knowledge_maps m ON m.id = j.map_id
    -- Review #253 (P2): a job legutóbbi workflow-pillanatképe ugyanebben a lekérdezésben (nincs tételenkénti 2 körút).
    LEFT JOIN LATERAL (
      SELECT w.owner_id, w.snapshot->'visits' AS visits, w.snapshot->'executions' AS executions FROM lesson_workflow_runs w
      WHERE w.id = j.id OR w.snapshot->>'resourceId' = j.id ORDER BY w.created_at DESC LIMIT 1
    ) wr ON true
    WHERE coalesce(j.output->>'recoveryState', '') NOT IN ('superseded', 'remanufactured', 'remanufacturing', 'discarded')
      AND (
        (j.output ? 'lesson' AND l.published_at IS NULL AND j.status <> 'ok' AND ${manageableBy(owner)})
        OR (j.status IN ('pending', 'running') AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner})
        -- J2: a saját, tanulási terv jóváhagyására váró job (pl. a javítás előtti újragyártás) — látszik és folytatható.
        OR (j.status = 'ok' AND j.step = 'author' AND j.output ? 'outline' AND NOT j.output ? 'approvedOutline' AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner})
      )
    ORDER BY (j.status IN ('pending', 'running')) DESC, j.created_at DESC LIMIT ${DRAFT_LIST_LIMIT}`);
  const out: OwnerDraft[] = [];
  for (const raw of rows as Array<Record<string, unknown>>) {
    const job = { output: raw.output, publishedAt: null, step: String(raw.step), status: String(raw.status), error: (raw.error as string | null) ?? null,
      lessonId: (raw.lesson_id as string | null) ?? null };
    const awaitingApproval = decideOneStepAction({ step: job.step, status: job.status, output: (raw.output ?? null) as Record<string, unknown> | null }) === "approve";
    const running = job.status !== "error" && job.step !== "error" && !awaitingApproval;
    const { visits, executions } = parseWorkflowVisits({ visits: raw.wf_visits, executions: raw.wf_executions });
    const lessonTitle = (raw.output as { lesson?: { title?: unknown } } | null)?.lesson?.title;
    const ownerless = !raw.wf_owner;
    const stop = running || awaitingApproval ? { resumable: false } : jobStopInfo(job, visits, executions);
    out.push({
      jobId: String(raw.id), title: typeof lessonTitle === "string" && lessonTitle.trim() ? lessonTitle : String(raw.map_title ?? "Névtelen tananyag"),
      subject: String(raw.subject ?? ""), classroom: Number(raw.classroom ?? 0), draft: draftSummaryOf(raw.output), running,
      error: running ? null : job.error, updatedAt: new Date(String(raw.updated_at)).toISOString(), step: job.step,
      ownerless, hasPublished: raw.has_published === true, awaitingApproval,
      // A gazdátlan job workflow-napló nélkül a mentett részekből nem folytatható (driveTracked) — nála csak újragyártás és törlés van.
      ...stop, ...(ownerless ? { resumable: false } : {}),
    });
  }
  return out;
}

/** D1: egy kezelhető, megállt, nem publikált piszkozat elvetése (visszaállítható: csak `recoveryState`). `true`, ha elvetette. */
export async function discardDraft(jobId: string, owner: string): Promise<boolean> {
  const { rows } = await db.execute(sql`UPDATE studio_jobs j SET output = coalesce(j.output, '{}'::jsonb)
      || jsonb_build_object('recoveryState', 'discarded', 'discardedAt', now()::text, 'discardedBy', ${owner}::text)
    WHERE j.id = ${jobId} AND ${notBeingDriven}
      AND (j.status = 'error' OR (j.status = 'ok' AND j.step = 'author' AND j.output ? 'outline' AND NOT j.output ? 'approvedOutline'))
      AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = j.lesson_id AND l.published_at IS NOT NULL)
      AND ${manageableBy(owner)} RETURNING j.id`);
  return (rows as unknown[]).length > 0;
}

/** D2 — a kötegelt törlés halmaza: kész (publikált) párral rendelkező, kezelhető, megállt, épp nem vitt piszkozat. Feltétel `j`-re. */
const redundantDraft = (owner: string) => sql`j.status = 'error' AND j.output ? 'lesson'
  AND coalesce(j.output->>'recoveryState', '') NOT IN ('superseded', 'remanufactured', 'remanufacturing', 'discarded') AND ${notBeingDriven}
  AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = j.lesson_id AND l.published_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM lessons p WHERE p.map_id = j.map_id AND p.published_at IS NOT NULL)
  AND ${manageableBy(owner)}`;

/** Review #255 (P2): a megerősítésben mutatott darabszám a szerver UGYANAZON feltételéből — a lista csonkolása nem téveszti meg. */
export async function redundantDraftCount(owner: string): Promise<number> {
  const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM studio_jobs j WHERE ${redundantDraft(owner)}`);
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
}

/**
 * D2: a kész párral rendelkező piszkozatok elvetése. Review #255: a felület a megerősített darabszámot is elküldi (`expected`); ha a halmaz
 * közben megváltozott, nincs törlés (409), a felület friss számmal újra kérdez.
 */
export async function discardDraftsWithPublished(owner: string, expected?: number): Promise<number | null> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT j.id FROM studio_jobs j WHERE ${redundantDraft(owner)} FOR UPDATE OF j`);
    const ids = (rows as Array<{ id: string }>).map((r) => r.id);
    if (expected !== undefined && expected !== ids.length) return null;
    if (!ids.length) return 0;
    await tx.execute(sql`UPDATE studio_jobs SET output = coalesce(output, '{}'::jsonb)
        || jsonb_build_object('recoveryState', 'discarded', 'discardedAt', now()::text, 'discardedBy', ${owner}::text)
      WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    return ids.length;
  });
}

/** GET /api/studio/drafts — a belépett admin kezelhető „Tananyag draft” listája és futó gyártásai (a router admin-védett). */
lessonPipelineRouter.get("/drafts", async (req: Request, res: Response) => {
  const owner = req.user!.id;
  const [drafts, total, redundant] = await Promise.all([ownerDrafts(owner), ownerDraftTotal(owner), redundantDraftCount(owner)]);
  res.json({ drafts, total, redundant });
});

/** D1: POST /api/studio/drafts/:jobId/discard — elvetés (megerősítés a felületen). */
lessonPipelineRouter.post("/drafts/:jobId/discard", async (req: Request, res: Response) => {
  if (!(await discardDraft(req.params.jobId, req.user!.id))) {
    return res.status(409).json({ message: "Ez a piszkozat nem törölhető (fut, publikált, már törölt, vagy másik készítőhöz tartozik)." });
  }
  res.json({ discarded: true });
});

/** D2: POST /api/studio/drafts/discard-published — a kész tananyaggal rendelkező piszkozatok kötegelt elvetése. */
lessonPipelineRouter.post("/drafts/discard-published", async (req: Request, res: Response) => {
  const expected = typeof req.body?.expected === "number" ? req.body.expected : undefined;
  const discarded = await discardDraftsWithPublished(req.user!.id, expected);
  if (discarded === null) return res.status(409).json({ message: "A törlendő piszkozatok köre közben megváltozott — nézd át újra a listát." });
  res.json({ discarded });
});

/** J2/J3: POST /api/studio/drafts/:jobId/continue — a saját, tervre váró job folytatása a terv gépi jóváhagyásával. */
lessonPipelineRouter.post("/drafts/:jobId/continue", async (req: Request, res: Response) => {
  const owner = req.user!.id;
  const { rows } = await db.execute(sql`SELECT j.id FROM studio_jobs j
    LEFT JOIN LATERAL (SELECT w.owner_id FROM lesson_workflow_runs w WHERE w.id = j.id OR w.snapshot->>'resourceId' = j.id ORDER BY w.created_at DESC LIMIT 1) wr ON true
    WHERE j.id = ${req.params.jobId} AND ${notBeingDriven} AND coalesce(j.output->>'recoveryState', '') <> 'discarded' AND (j.status = 'ok' AND j.step = 'author' AND j.output ? 'outline' AND NOT j.output ? 'approvedOutline' AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner})`);
  if (!rows.length) return res.status(409).json({ message: "Ez a job nem vár a tanulási terv jóváhagyására (vagy másik készítőhöz tartozik)." });
  if (singleRunEnabled()) {
    try { return res.status(202).json({ jobId: req.params.jobId, runId: await remakeAsSingleRun(req.params.jobId, owner) }); }
    catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "A folytatás nem indítható." }); }
  }
  void driveRemade(req.params.jobId, owner, false).catch((e) => logger.warn(`[STUDIO] A folytatás megállt (${req.params.jobId}): ${e instanceof Error ? e.message : String(e)}`));
  res.status(202).json({ jobId: req.params.jobId });
});

/** D3: POST /api/studio/drafts/:jobId/remake — teljes újragyártás ugyanabból a forrásból (a nem folytatható és a gazdátlan piszkozatnál is). */
lessonPipelineRouter.post("/drafts/:jobId/remake", async (req: Request, res: Response) => {
  const owner = req.user!.id;
  const { rows } = await db.execute(sql`SELECT j.error FROM studio_jobs j WHERE j.id = ${req.params.jobId} AND j.status = 'error'
    AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = j.lesson_id AND l.published_at IS NOT NULL) AND ${manageableBy(owner)}`);
  const row = rows[0] as { error: string | null } | undefined;
  if (!row) return res.status(409).json({ message: "Ez a piszkozat nem gyártható újra (fut, publikált, vagy másik készítőhöz tartozik)." });
  try {
    res.status(202).json({ jobId: await remanufactureFromMap(req.params.jobId, owner, row.error ?? "Kézi újragyártás az adminfelületről.") });
  } catch (error) {
    res.status(409).json({ message: error instanceof Error ? error.message : "Az újragyártás nem indítható." });
  }
});

/** GET /api/studio/lessons/one-step/:runId — the progress poll. */
lessonPipelineRouter.get("/lessons/one-step/:runId", async (req: Request, res: Response) => {
  const view = await oneStepRunView(req.params.runId);
  if (!view) return res.status(404).json({ message: "Ismeretlen vagy lejárt futás." });
  res.json(view);
});

/**
 * Spec 2026-09-29 (tanári témafókusz): one cheap classification on the gateHelper model, then its fallback (another
 * provider) if the first stalls or answers unusably; if both fail the full map stays.
 */
async function focusForInstruction(mapId: string, instruction: string): Promise<TopicFocus | null> {
  const map = await (await createDrizzlePipelineStore()).loadMap(mapId);
  if (!map) return null;
  return decideTopicFocus(instruction, map.concepts, topicFocusModels().map((model) => async (system: string, user: string) =>
    (await callStepModel(createStudioStepProvider(model, "topicFocus"), { step: "pedagogue", policy: "topicFocus", role: "topic-focus", model, system, user })).json));
}

/** The whole one-step chain, reporting each phase into the progress store. */
export async function runOneStep(
  runId: string,
  data: OneStepRequest,
  userId: string | undefined,
): Promise<void> {
  if (!userId) throw new Error("A futáshoz hitelesített készítő szükséges.");
  await executeWorkflow(workflowStore, { id: runId, owner: userId, mode: "upload", request: data }, async () => {
    await runOneStepCore(runId, data, userId, { offerDraft: true });
    const run = await getRun(runId);
    if (run?.phase === "parked") throw new WorkflowWaiting(run.detail ?? "Forrásellenőrzés szükséges.");
    // Review #248 (P1): a piszkozat-választás szabályos várakozás (a tanár dönt), nem hiba.
    if (run?.phase === "draft") throw new WorkflowWaiting(run.detail ?? "Ebből a forrásból van megszakadt piszkozat.");
    if (run?.phase !== "done" || !run.lessonId) throw new Error(run?.error ?? "A készítés nem adott vissza teljes leckét.");
    return readPublishedLesson(run.lessonId);
  });
}

/**
 * Spec 2026-10-06-s7 (C egy futásban): a feltöltéses gyártás magja a HÍVÓ workflow-jában (`webStudio`), saját futás és
 * visszaolvasás nélkül — a webes futás lépései így a valódi végrehajtást rögzítik. A haladásjelző azonosítója a hívóé.
 * Ha ugyanennek a futásnak egy korábbi végrehajtása már közzétette a leckét (pl. csak a lezárás bukott el), a kész lecke
 * újrahasznosul: a lépések modellhívás nélkül, látogatásként rögzülnek (mint a feltöltéses út kész-lecke ágánál), új lecke nem készül.
 */
export async function runOneStepInWorkflow(runId: string, data: OneStepRequest, userId: string): Promise<void> {
  const previous = await getRun(runId);
  if (previous?.phase === "done" && previous.lessonId) {
    const [published] = await db.select({ id: lessons.id }).from(lessons)
      .where(and(eq(lessons.id, previous.lessonId), isNotNull(lessons.publishedAt))).limit(1);
    if (published) {
      for (const phase of ["source", "scope", "knowledge", "sourceCheck", "pedagogue", "author", "animator", "lektor", "gate"]) await workflowPhase(phase);
      logger.info(`[STUDIO/WEB] A futás korábbi végrehajtásának kész leckéje újrahasznosítva (${runId} → ${published.id}).`);
      return;
    }
  }
  createRun(runId);
  await runOneStepCore(runId, data, userId);
}

/** Spec 2026-10-06-s7: a Studio-panelről / söprőből folytatott webes futás lezárása (a webes job kész jelzése + visszaolvasás). */
async function finishWebStudio(webJobId: string, owner: string, lessonId: string) {
  const [row] = await db.select({ htmlFileId: lessons.htmlFileId }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!row?.htmlFileId) throw new Error("A közzétett tananyag nem olvasható vissza.");
  const { researchJobStore } = await import("./web-research-job-store");
  const { completeWebStudioJob } = await import("./web-research-jobs");
  const job = await researchJobStore.read(webJobId, owner);
  if (!job) throw new Error("A webes készítés nem található.");
  return completeWebStudioJob(researchJobStore, job, { kind: "studio", runId: webJobId, lessonId, htmlFileId: row.htmlFileId, sources: [] });
}

async function readPublishedLesson(lessonId: string) {
  await workflowPhase("readback");
  const [row] = await db.select({ id: htmlFiles.id, content: lessons.json, publishedAt: lessons.publishedAt })
    .from(lessons).innerJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id)).where(eq(lessons.id, lessonId));
  if (!row?.id || !row.content || !row.publishedAt) throw new Error("A közzétett tananyag nem olvasható vissza.");
  return { kind: "material" as const, id: row.id };
}

async function runOneStepCore(runId: string, data: OneStepRequest, userId: string, options: { offerDraft?: boolean } = {}) {
  // docs/specs/2026-10-16-egy-futas.md (tulajdonosi döntés 2026-10-16): minden új gyártás az egyfutásos motoron — Opus 5.5 (medium) egy
  // beszélgetésben a forrástól a közzétételig, tartalék GPT-6.1 Sol. Vészfék az átállás idejére: STUDIO_SINGLE_RUN=0 (a régi lépésgép).
  const { singleRunEnabled, runSingleUpload } = await import("./single-run/live");
  if (singleRunEnabled()) {
    try {
      const result = await runSingleUpload(
        { files: data.files as ExtractorFile[], instruction: normalizeOwnerInstruction(data.instructions), title: data.title, ownerId: userId },
        (p) => updateRun(runId, { phase: p.phase, ...(p.detail !== undefined ? { detail: p.detail } : {}), ...(p.mapId ? { mapId: p.mapId } : {}), ...(p.jobId ? { jobId: p.jobId } : {}) }),
      );
      updateRun(runId, { phase: "done", lessonId: result.lessonId, mapId: result.mapId, jobId: result.jobId, detail: "A tananyag elkészült és közzétéve." });
    } catch (error) {
      logger.error(`[EGYFUTÁS] A gyártás megállt (${runId}): ${error instanceof Error ? error.message : String(error)}`);
      updateRun(runId, { phase: "error", error: error instanceof Error ? error.message.slice(0, 1500) : "Az egyfutásos gyártás megállt." });
    }
    return;
  }
  await workflowPhase("source");
  const { title } = data;
  const instruction = normalizeOwnerInstruction(data.instructions);
  const { normalizeDocumentSources } = await import("./document-source");
  const { createCachedSourceOcr } = await import("./run-extraction");
  const files = await normalizeDocumentSources(data.files, await createCachedSourceOcr(resolveStudioModel("ocr")));

  // 1) The source determines the grade, including for legacy clients sending scope.
  let scope: { subject: string; classroom: number };
  let inferredTitle: string | undefined;
  let classification: import("../../shared/source-classification").ScopeClassification;
  {
    await workflowPhase("scope");
    updateRun(runId, { phase: "ocr", detail: "Tantárgy és osztály felismerése…" });
    // Spec 2026-10-14: saját `scope` lépés (gpt-6-luna, közvetlen OpenAI) — az `ocr` modellje (qwen, OpenRouter) 404-et adott.
    const inferred = await inferOneStepScope({ ...data, files }, (f) =>
      callScopeModel(f, resolveStudioModel("scope")),
    );
    if (!inferred.ok) {
      // Spec 2026-10-06-s7 (§4/9): a támogató szerep saját lelet-kódja (a futást nem állítja meg).
      await workflowFinding("scope_classification");
      await workflowValidationFailure(inferred.reason);
      updateRun(runId, {
        phase: "error",
        error: `Nem sikerült felismerni a tantárgyat/osztályt (${inferred.reason}). Próbáld újra olvashatóbb forrással.`,
      });
      return;
    }
    scope = inferred.scope;
    inferredTitle = inferred.title;
    classification = inferred.classification;
    // Spec 2026-09-23: a grade the teacher states explicitly wins over the model's guess.
    const asked = explicitClassroomOf(instruction);
    if (asked !== undefined && asked !== scope.classroom) {
      logger.info(`[STUDIO/1STEP] A tanár kérése szerint ${asked}. osztály (a forrásból becsült: ${scope.classroom}).`);
      scope = { ...scope, classroom: asked };
      classification = { ...classification, reason: `A tanár kérése szerint ${asked}. osztály. ${classification.reason}`.slice(0, 1000), confidence: "high", gradeRange: [asked, asked] };
    }
  }

  // 2) Map: reuse by content hash or extract now (same as /maps/extract).
  await workflowPhase("knowledge");
  const { runExtraction, loadExtractionConfig } = await import("./run-extraction");
  const config = await loadExtractionConfig();
  const inputHash = computeInputHash(files as ExtractorFile[], scope, extractionSignature(config));
  const [existing] = await db
    .select({ id: knowledgeMaps.id })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.inputHash, inputHash))
    .limit(1);

  let mapId: string;
  if (existing) {
    mapId = existing.id;
    // Spec 2026-09-19: the same source uploaded again does not pay for a second lesson —
    // a published lesson of this map is the result (measured: the owner uploaded the same
    // photos three times on 2026-09-19 while the first run was parked).
    const [published] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id))
      .where(and(eq(lessons.mapId, mapId), isNotNull(lessons.publishedAt)))
      .orderBy(desc(lessons.publishedAt))
      .limit(1);
    // Spec 2026-09-23: with a teacher's request the old lesson is not the answer — a new one is made from the map.
    if (published && !instruction) {
      // The workflow ledger still records the skipped phases as visits (no model call).
      for (const phase of ["sourceCheck", "pedagogue", "author", "animator", "lektor", "gate"]) await workflowPhase(phase);
      updateRun(runId, { phase: "done", detail: "Ez a forrás már fel volt dolgozva — a belőle készült, közzétett lecke megnyitható.", mapId, lessonId: published.id });
      logger.info(`[STUDIO/1STEP] Kész lecke újrahasznosítva: térkép ${mapId}, lecke ${published.id}`);
      return;
    }
    updateRun(runId, { phase: "extract", detail: "Ez a forrás már fel volt dolgozva — a meglévő tudástárat használjuk.", mapId });
    logger.info(`[STUDIO/1STEP] Térkép gyorsítótárból: ${mapId}`);
  } else {
    updateRun(runId, { phase: "ocr", detail: null });
    try {
      mapId = await runExtraction({
        files: files as ExtractorFile[],
        scope,
        classification,
        title: title ?? inferredTitle,
        inputHash,
        config,
        userId,
        onPhase: (phase, detail) => updateRun(runId, { phase, detail }),
      });
    } catch (error) {
      logger.error(
        `[STUDIO/1STEP] Kivonatolás hiba: ${error instanceof Error ? error.message : String(error)}`,
      );
      updateRun(runId, { phase: "error", error: error instanceof ExtractionShapeError ? error.message : "A kivonatolás nem sikerült. Próbáld újra." });
      return;
    }
    updateRun(runId, { mapId });
  }

  // Spec 2026-09-19: the source gap (excluded, unverifiable concepts) travels to the end.
  let gapNote: string | null = null;

  // 2b) #174 — gépi kurálás + jóváhagyás: az egylépeses útvonal nem hagyhat
  // "Piszkozat" zsákutcát. Az igazolt fogalom kept, a nem igazolható
  // kulcsfogalom pending marad: a hiányzó forrás nem törölhető a teljességért.
  // A jóváhagyás a canApprove kapun MEGY ÁT, nem kerüli meg.
  {
    await workflowPhase("sourceCheck");
    const [mapRow] = await db
      .select({ status: knowledgeMaps.status })
      .from(knowledgeMaps)
      .where(eq(knowledgeMaps.id, mapId))
      .limit(1);

    if (mapRow && mapRow.status !== "approved") {
      updateRun(runId, { phase: "extract", detail: "Tudástár gépi átnézése és jóváhagyása…" });
      const curated = await autoCurateKnowledgeMap(mapId, userId);
      if (!curated.ok) {
        // Spec 2026-09-19: an unusable transcript is a real error, not a parked run.
        updateRun(runId, { phase: "error", error: curated.reason, mapId });
        return;
      }
      gapNote = curated.note;
    }
  }

  // 2b′) docs/specs/2026-10-15-hiba-gombok.md (tulajdonosi javaslat): a program soha nem kezd újra észrevétlenül — ha ugyanabból a
  // forrásból (ugyanazzal a kéréssel) folytatható piszkozat van, a gyártás nem indul, a felület választást kér (folytatás / újragyártás / új).
  if (!options.offerDraft) {
    // A webes (internetes) út nem kínál választást (nincs hozzá felület) — ott a régi viselkedés marad.
  } else if (!data.forceNew) {
    const draft = await resumableDraftFor(mapId, instruction, userId);
    if (draft) {
      updateRun(runId, { phase: "draft", mapId, jobId: draft, detail: "Ebből a forrásból van megszakadt piszkozat — folytatható vagy újragyártható." });
      return;
    }
  } else {
    // E3: kifejezett újragyártás — a régi piszkozatok félreteszve (a vezérlő és a söprés nem folytatja őket: nincs dupla gyártás).
    await supersedeDraftsOf(mapId, instruction, userId);
  }

  // 2c) Spec 2026-09-23: documented source corrections (teacher's request / photo misreads) before planning.
  const corrections = await correctMapFromOwner(mapId, instruction, files.some((f) => f.kind === "image"));
  if (corrections.length) updateRun(runId, { phase: "extract", detail: `Forrás-helyesbítés: ${corrections.length} fogalom (${corrections.map((c) => c.term ?? c.localId).join(", ").slice(0, 200)})` });

  // 2d) Spec 2026-09-29 (tanári témafókusz): with a teacher request, the concepts outside the requested topic
  // are `extra` in THIS job (the shared map stays untouched — other runs reuse it by source hash).
  const topicFocus = instruction ? await focusForInstruction(mapId, instruction) : null;
  if (topicFocus) updateRun(runId, { phase: "extract", detail: `Témafókusz: a kért témához ${topicFocus.localIds.length} fogalom kötelező, ${topicFocus.demoted} kiegészítő lett.` });

  // 3) Lesson job on the freshly built map, driven with outline auto-approval.
  const started = await startJobFromMap(mapId, { subject: scope.subject, classroom: scope.classroom }, {}, { instruction, corrections, topicFocus });
  if (!started.ok) {
    updateRun(runId, { phase: "error", error: started.reason, mapId });
    return;
  }
  if (gapNote) await seedSourceGapNote(started.jobId, gapNote);
  updateRun(runId, { phase: "pedagogue", jobId: started.jobId, detail: gapNote });
  await workflowResource(started.jobId);

  await driveOneStep(runId, started.jobId, gapNote);
}

/**
 * Spec 2026-10-06-s7 (B): a térképről indított lecke determinisztikus forrás-helyesbítése (modellhívás nélkül) saját
 * `mapCheck` futásban: forrás → kapu → mentés → visszaolvasás. A viselkedés változatlan: hibánál helyesbítés nélkül megy tovább.
 */
async function correctMapInWorkflow(mapId: string, owner: string): Promise<SourceCorrection[]> {
  return runToolWorkflow({ mode: "mapCheck", owner, request: { mapId, kind: "source-corrections" } }, async () => {
    await workflowPhase("source");
    await workflowPhase("gate");
    await workflowPhase("save");
    const corrections = await correctMapFromOwner(mapId, undefined, false);
    await workflowPhase("readback");
    const rows = await db.select().from(kmConcepts).where(eq(kmConcepts.mapId, mapId));
    const missing = corrections.filter((fix) => { const row = rows.find((r) => r.localId === fix.localId); return !row || !correctionApplied(fix, row); });
    if (missing.length) throw new Error(`A forrás-helyesbítés nem olvasható vissza: ${missing.map((m) => m.localId).join(", ").slice(0, 200)}`);
    return { value: corrections, result: { kind: "map" as const, id: mapId } };
  });
}

/**
 * Spec 2026-09-23 — the teacher's request and photo misreads become DOCUMENTED curation on the map rows
 * (term/definition only; the quote stays the transcript evidence). Never throws: no correction on failure.
 */
export async function correctMapFromOwner(mapId: string, instruction: string | undefined, transcript: boolean): Promise<SourceCorrection[]> {
  const rows = await db.select().from(kmConcepts).where(and(eq(kmConcepts.mapId, mapId), ne(kmConcepts.reviewState, "rejected")));
  const concepts = rows.map((c) => ({ id: c.id, localId: c.localId, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.examWeight as MapConcept["examWeight"] }));
  // Spec 2026-10-03-forras-aritmetika-helyesbites: a determinisztikus (modell nélküli) kör MINDIG fut — a hamis egyenlőség a
  // forrásban kéréstől és fotótól függetlenül hamis (mért: map 6701ee87, 7 hamis sor → 73 bank-lelet → nem publikálható).
  const arithmetic = arithmeticSourceCorrections(concepts);
  if (arithmetic.length) logger.warn(`[STUDIO/1STEP] Hamis egyenlőség a forrásban (${arithmetic.length}): ${arithmetic.map((c) => `${c.localId}: ${c.reason}`).join(" | ").slice(0, 1500)}`);
  const model = resolveStudioModel("pedagogue");
  const result = instruction || transcript
    ? await proposeSourceCorrections(async (system, user) =>
      (await callStepModel(createStudioStepProvider(model, "pedagogue"), { step: "pedagogue", role: "corrector", model, system, user })).json,
    concepts, { instruction, transcript })
    : { corrections: [] as SourceCorrection[], rejected: [] as string[] };
  if (result.warning) logger.warn(`[STUDIO/1STEP] ${result.warning}`);
  // Spec 2026-10-06-s7 (§4/9): a támogató szerep saját lelet-kódja (a futást nem állítja meg) — review #203: a modell-/parse-hiba
  // (warning) is lelet, nem csak az elvetett javaslat.
  if (correctionFindingNeeded(result)) await workflowFinding("source_correction");
  if (result.rejected.length) logger.info(`[STUDIO/1STEP] Elvetett helyesbítés-javaslatok: ${result.rejected.join(" | ").slice(0, 1500)}`);
  // Review #192: az új (pl. csak definíciós) helyesbítés nem ejtheti el ugyanannak a fogalomnak a MÁR érvényes másik mezőjét.
  const proposed = withPersistedFields(mergeCorrections(arithmetic, result.corrections), persistedCorrections(rows));
  // Review #181 javítása (mért élesben, job e9fac201): újraindításkor a térkép már helyesbített, a modell nem javasol semmit — a
  // MÁR ÉRVÉNYES tanári/átírási helyesbítést a DB-ből kell visszaadni, különben a job nélküle fut, és a független bank-ellenőr a
  // nyers átirathoz („bérművesek”) méri a helyes („kézművesek”) tételeket. Az aritmetikai kör determinisztikusan úgyis újrafut.
  // A már érvényes sort a `pending` szűrő magától kihagyja (nincs újraírás), de a lista része — minden kijáraton visszajön.
  const corrections = [...proposed, ...persistedCorrections(rows).filter((p) => !proposed.some((c) => c.localId === p.localId))];
  // The full audit goes to the log and the job output (sourceCorrections); the column holds only a code.
  for (const fix of corrections) logger.info(`[STUDIO/1STEP] ${fix.localId}: ${correctionAuditText(fix)}`);
  if (!corrections.length) return [];
  // Review #181: újraindításkor a sor már helyesbített — nincs írás, de a helyesbítés a jobbal utazik (bank-ellenőr mércéje).
  const pending = corrections.filter((fix) => { const row = rows.find((r) => r.localId === fix.localId); return row && !correctionApplied(fix, row); });
  if (!pending.length) return corrections;
  // Audit 2026-09-24: all rows commit together or none; a failed write never stops the run (the lesson is
  // then made from the uncorrected map, exactly as before corrections existed) — the docstring's promise.
  try {
    await db.transaction(async (tx) => {
      // Review #203: lízing-zár a tranzakció elején és végén (a kivonatolás mintájára) — lejárt lízingű végrehajtó nem írhat.
      await workflowFence(tx);
      for (const fix of pending) {
        const row = rows.find((r) => r.localId === fix.localId);
        if (!row) continue;
        await tx.update(kmConcepts).set({
          ...(fix.term !== undefined ? { term: fix.term } : {}),
          ...(fix.definition !== undefined ? { definition: fix.definition } : {}),
          // Spec 2026-10-05-s11: a tanár helyesbítése a bizonytalan („⟦?⟧”) olvasat miatt függő fogalmat is rendezi → tanítható.
          ...(row.reviewState === "kept" || (row.reviewState === "pending" && row.quote.includes(UNCERTAIN_MARK)) ? { reviewState: "edited" } : {}),
          verbatimReason: correctionReasonCode(fix),
          updatedAt: new Date(),
        }).where(eq(kmConcepts.id, row.id));
      }
      await workflowFence(tx);
    });
  } catch (error) {
    if (error instanceof WorkflowConflict) throw error; // a zár-ütközés nem nyelhető el
    logger.warn(`[STUDIO/1STEP] A forrás-helyesbítés mentése elmaradt (${error instanceof Error ? error.message : String(error)}) — helyesbítés nélkül folytatjuk.`);
    return [];
  }
  return corrections;
}

/** Review #192: mezőnkénti összefésülés — az új helyesbítés mezője nyer, a hiányzó mező a már érvényes helyesbítésből jön. */
export function withPersistedFields(proposed: SourceCorrection[], persisted: SourceCorrection[]): SourceCorrection[] {
  return proposed.map((c) => {
    const p = persisted.find((x) => x.localId === c.localId);
    if (!p) return c;
    return {
      ...c,
      ...(c.term === undefined && p.term !== undefined ? { term: p.term } : {}),
      ...(c.definition === undefined && p.definition !== undefined ? { definition: p.definition } : {}),
    };
  });
}

/** A térképen MÁR érvényes tanári/átírási helyesbítés (verbatimReason = corrected:<alap>), a korábbi alak nélkül (review #181). */
export function persistedCorrections(rows: Array<{ localId: string; term: string; definition: string; verbatimReason?: string | null }>): SourceCorrection[] {
  return rows.flatMap((r) => {
    const basis = String(r.verbatimReason ?? "").match(/^corrected:(owner|transcription)$/)?.[1] as SourceCorrection["basis"] | undefined;
    return basis ? [{ localId: r.localId, basis, term: r.term, definition: r.definition, reason: "Már érvényes helyesbítés (a forrás-idézet az eredeti átirat).", from: {} }] : [];
  });
}

/**
 * Spec 2026-09-19 — autonomous source check of a draft map, on its stored rows.
 *
 * 1. Every unverified quote is relocated onto the source passage it was transcribed
 *    from (`relocateQuote`, OCR noise only) and re-checked; a hit updates the row.
 * 2. Pending concepts get the conservative machine decision (`autoReviewDecision`):
 *    verified → kept, unverifiable core → stays pending (visible), unverifiable
 *    supporting → kept. Manual decisions are never overwritten.
 * 3. `autonomousApprovalDecision` approves the map when a verified core exists and
 *    the verified ratio holds; pending concepts stay out of the lesson
 *    (`TAUGHT_REVIEW_STATES`) and are named in the returned note.
 */
export async function autoCurateKnowledgeMap(
  mapId: string,
  userId: string | undefined,
): Promise<{ ok: true; note: string | null; relocated: number } | { ok: false; reason: string }> {
  const { kmConcepts } = await import("../../shared/schema");
  const { autoReviewDecision, autonomousApprovalDecision, sourceGapNote } = await import("./auto-approve");
  const { relocateQuote, checkVerbatim } = await import("./verbatim");
  const { sourceTextForReference } = await import("./source-transcript");

  const [map] = await db
    .select({ sourceText: knowledgeMaps.sourceText, sourceFiles: knowledgeMaps.sourceFiles })
    .from(knowledgeMaps)
    .where(eq(knowledgeMaps.id, mapId))
    .limit(1);
  if (!map) return { ok: false, reason: "A térkép nem található." };

  const concepts = await db
    .select({
      id: kmConcepts.id,
      term: kmConcepts.term,
      quote: kmConcepts.quote,
      sourceRef: kmConcepts.sourceRef,
      examWeight: kmConcepts.examWeight,
      verbatimOk: kmConcepts.verbatimOk,
      verbatimReason: kmConcepts.verbatimReason,
      reviewState: kmConcepts.reviewState,
    })
    .from(kmConcepts)
    .where(eq(kmConcepts.mapId, mapId));

  // 1) Deterministic relocation of unverified quotes (no model call, D1 stays exact).
  let relocated = 0;
  for (const c of concepts) {
    if (c.verbatimOk || c.reviewState === "rejected") continue;
    const source = sourceTextForReference(map.sourceFiles, map.sourceText, c.sourceRef.file);
    const candidate = relocateQuote(c.quote, source);
    if (!candidate || !checkVerbatim(candidate, source).ok) continue;
    c.quote = candidate;
    c.verbatimOk = true;
    relocated++;
    await db
      .update(kmConcepts)
      .set({ quote: candidate, verbatimOk: true, verbatimReason: null, updatedAt: new Date() })
      .where(eq(kmConcepts.id, c.id));
  }

  // 2) Machine review of what is still pending — manual decisions stay.
  for (const c of concepts) {
    if (c.reviewState !== "pending") continue;
    const decision = autoReviewDecision({
      examWeight: c.examWeight as "core" | "supporting",
      verbatimOk: c.verbatimOk,
      // Spec 2026-10-05-s11: bizonytalan OCR-olvasatra épülő fogalom nem tény (a tanári helyesbítés rendezheti).
      // Spec S11/6: a forrásban jelölt szót idéző (a jelet elhagyó) idézet is bizonytalan.
      uncertainQuote: quoteTouchesUncertain(c.quote, sourceTextForReference(map.sourceFiles, map.sourceText, c.sourceRef?.file)) && !String(c.verbatimReason ?? "").startsWith("corrected:"),
    });
    if (decision === c.reviewState) continue;
    c.reviewState = decision;
    await db
      .update(kmConcepts)
      .set({ reviewState: decision, updatedAt: new Date() })
      .where(eq(kmConcepts.id, c.id));
  }

  // 3) Autonomous approval; the gap is reported, never hidden.
  const decision = autonomousApprovalDecision(
    concepts.map((c) => ({
      id: c.id,
      term: c.term,
      examWeight: c.examWeight as "core" | "supporting",
      verbatimOk: c.verbatimOk,
      reviewState: c.reviewState as "pending" | "kept" | "edited" | "rejected",
    })),
  );
  if (!decision.ok) return decision;

  await db
    .update(knowledgeMaps)
    .set({ status: "approved", approvedBy: userId ?? null, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(knowledgeMaps.id, mapId));
  const note = sourceGapNote(decision.excluded);
  logger.info(
    `[STUDIO/1STEP] Térkép gépi kurálással jóváhagyva: ${mapId} (igazolt kulcsfogalom=${decision.verifiedCore}, élő=${decision.liveCount}, relokált=${relocated}, kimaradt=${decision.excluded.length})`,
  );
  return { ok: true, note, relocated };
}

/** The gap note travels with the job so the Studio panel shows it next to the lesson. */
async function seedSourceGapNote(jobId: string, note: string): Promise<void> {
  const { appendQualityNote } = await import("./autonomous");
  const [job] = await db.select({ output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, jobId)).limit(1);
  const output = (job?.output ?? {}) as Record<string, unknown>;
  await db
    .update(studioJobs)
    .set({ output: { ...output, qualityNotes: appendQualityNote(output.qualityNotes, { reason: "coverage", note, round: 0 }) } })
    .where(eq(studioJobs.id, jobId));
}

/** drive() plus outline auto-approval; approveOutline re-validates coverage. */
export async function driveOneStep(runId: string, jobId: string, gapNote: string | null = null): Promise<void> {
  for (let i = 0; i < MAX_CHAIN; i++) {
    await drive(jobId, (step, round) => {
      if (["pedagogue", "author", "animator", "lektor", "gate"].includes(step)) {
        updateRun(runId, { phase: step as OneStepPhase, detail: round > 0 ? `${round + 1}. kör` : null });
      }
    });

    const [job] = await db
      .select({
        step: studioJobs.step,
        status: studioJobs.status,
        round: studioJobs.round,
        output: studioJobs.output,
        error: studioJobs.error,
        lessonId: studioJobs.lessonId,
      })
      .from(studioJobs)
      .where(eq(studioJobs.id, jobId))
      .limit(1);
    if (!job) return;

    // LS-6b: mirror the pipeline's own step into the progress store.
    const phase = (
      ["pedagogue", "author", "animator", "lektor", "gate"].includes(job.step) ? job.step : null
    ) as OneStepPhase | null;
    if (phase) updateRun(runId, { phase });

    const action = decideOneStepAction({
      step: job.step,
      status: job.status,
      output: (job.output ?? null) as Record<string, unknown> | null,
    });
    if (action === "stop") {
      if (job.step === "error") {
        updateRun(runId, { phase: "error", error: job.error ?? "A gyártás hibára futott." });
      } else if (job.step === "done") {
        updateRun(runId, {
          phase: "done",
          detail: gapNote ? `A lecke elkészült. ${gapNote}` : "A lecke elkészült.",
          lessonId: job.lessonId ?? null,
        });
      } else {
        updateRun(runId, { phase: "parked", detail: "A futás kézi döntésre vár a Studio panelen." });
      }
      return;
    }
    if (action === "approve") {
      const result = await autoApproveOutline(jobId, (detail) => updateRun(runId, { phase: "pedagogue", detail }));
      if (result.outcome === "retry") continue;
      if (result.outcome === "failed") {
        updateRun(runId, { phase: "error", error: result.reason });
        return;
      }
      updateRun(runId, { phase: "author" });
    }
    // action === "continue": loop back into drive()
  }
  updateRun(runId, { phase: "error", error: "A pipeline-lánc nem ért véget a lépés-határon belül." });
}

/**
 * LS-7 (#189) + docs/specs/2026-10-16-ujragyartas-jovahagyas.md: a tanulási terv GÉPI jóváhagyása — egy szabály a feltöltéses útnak és az
 * újragyártásnak. A fedettségi hiány NEM parkol emberre: a gép javító kört fut (`retry` — a pedagógus újra dolgozik); ha a kör-limitet is
 * kimerítette, a vázlatot a mért hiánnyal ELFOGADJA (a tananyag elkészül, a hiány jelzés lesz).
 */
async function autoApproveOutline(jobId: string, onRetry?: (detail: string) => void): Promise<{ outcome: "approved" | "retry" | "failed"; reason: string }> {
  const [job] = await db.select({ round: studioJobs.round, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, jobId)).limit(1);
  if (!job) return { outcome: "failed", reason: "A job nem található." };
  const outline = (job.output as { outline?: unknown } | null)?.outline;
  const approved = await approveOutline(jobId, outline);
  if (approved.ok) return { outcome: "approved", reason: "" };
  const decision = autonomousDecision({ reason: "coverage", round: job.round, detail: approved.reason });
  if (decision.action === "retry") {
    logger.warn(`[STUDIO/1STEP] Fedettségi hiány, gépi javító kör ${decision.nextRound}: ${approved.reason}`);
    onRetry?.(`Gépi javítás (${decision.nextRound}. kör): ${approved.reason}`);
    const retried = await retryOutlineRound(jobId, decision.nextRound ?? job.round + 1);
    return retried ? { outcome: "retry", reason: approved.reason } : { outcome: "failed", reason: `A javító kör nem indult el: ${approved.reason}` };
  }
  logger.warn(`[STUDIO/1STEP] Fedettségi hiány elfogadva jelzéssel: ${approved.reason}`);
  const forced = await forceApproveOutline(jobId, outline, { reason: "coverage", note: decision.note ?? "A vázlat fedettsége hiányos.", round: job.round });
  return forced ? { outcome: "approved", reason: "" } : { outcome: "failed", reason: `A vázlat nem menthető: ${approved.reason}` };
}

/**
 * docs/specs/2026-10-16-ujragyartas-jovahagyas.md (J1): az újragyártott (vagy tervre váró) job végigvitele a lízinges `driveTracked`-del —
 * ha a terv jóváhagyására vár, a lízing alatt gépileg jóváhagy és folytat (mint a `/approve-outline` út). Mért hiba: e nélkül 3 újragyártás
 * `author/ok`-ban állt meg, láthatatlanul. Review #256 (P1): a `driveTracked` a várakozást (`WorkflowWaiting`) ELNYELI és normálisan tér
 * vissza — ezért a ciklus minden kör után a job TÉNYLEGES állapotából dönt, nem a kivételből.
 */
export async function driveRemade(jobId: string, owner: string, start = true): Promise<void> {
  const outcome = await driveRemadeWith({
    drive: (first, beforeDrive) => driveTracked(jobId, owner, first, beforeDrive),
    awaitingApproval: async () => {
      const [job] = await db.select({ step: studioJobs.step, status: studioJobs.status, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, jobId)).limit(1);
      return !!job && decideOneStepAction({ step: job.step, status: job.status, output: (job.output ?? null) as Record<string, unknown> | null }) === "approve";
    },
    // Review #256 (P2): a lízing alatt, friss állapotból — a közben törölt (elvetett) piszkozat nem hagyható jóvá és nem indul tovább.
    approve: async () => {
      const [job] = await db.select({ output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, jobId)).limit(1);
      if ((job?.output as { recoveryState?: unknown } | null)?.recoveryState === "discarded") return { outcome: "failed" as const, reason: "A piszkozatot törölték." };
      return autoApproveOutline(jobId);
    },
    maxRounds: MAX_CHAIN,
  }, start);
  if (outcome !== "done") logger.warn(`[STUDIO] Az újragyártás megállt (${jobId}): ${outcome === "approval-failed" ? "a terv gépi jóváhagyása nem sikerült" : "a lépés-határ elfogyott"}.`);
}

/** POST /api/studio/lessons/from-map/:mapId — start a new lesson pipeline. */
async function guardedDrive(jobId: string, onStep?: (step: string, round: number) => void) {
  const store = await createDrizzlePipelineStore();
  return guardResumedDrive(jobId, {
    loadJob: store.loadJob,
    saveStep: async (id, patch) => {
      await db.transaction(async tx => {
        await workflowFence(tx);
        await tx.update(studioJobs).set(patch).where(and(eq(studioJobs.id, id),
          notInArray(studioJobs.step, ["done", "error"]), ne(studioJobs.status, "error")));
        await workflowFence(tx);
      });
    },
  }, () => drive(jobId, onStep));
}

/** A haladásjelző (one-step progress) azonosítója a workflow-é: a feltöltéses és (spec s7) a webes Studio-futásnál. */
const tracksProgress = (mode: string | undefined) => mode === "upload" || mode === "webStudio";

async function driveTracked(jobId: string, owner: string, start = false, beforeDrive?: (visit?: import("../../shared/lesson-workflow").WorkflowVisit) => Promise<void>, onAccepted?: () => void, explicitResume = false, recoveryResume = false) {
  const id = (await workflowStore.related(jobId, owner)) ?? jobId;
  const previous = await workflowStore.read(id, owner);
  if (!start && !previous) {
    if (await workflowStore.exists(jobId)) throw new WorkflowConflict("A futás másik készítőhöz tartozik.");
    // Spec 2026-10-06-s7 (B′): workflow-napló nélküli (kiadás előtti) job nem folytatható — lecke-írás csak workflow alatt.
    throw new WorkflowConflict("Ehhez a készítéshez nincs workflow-napló (kiadás előtti futás); folytatás helyett indíts új készítést a térképről.");
  }
  let drove = false;
  try {
    const completed = await executeWorkflow(workflowStore, { id, owner, mode: previous?.view.definition.mode ?? "studio", retry: !start, continuation: !start, ...(explicitResume ? { explicitResume: true } : {}), ...(recoveryResume ? { recoveryResume: true } : {}) }, async () => {
      if (beforeDrive) {
        const current = await workflowStore.read(id, owner);
        await beforeDrive(current?.view.visits.at(-1));
      }
      drove = true;
      // Élő megfigyelés (job 416ad01d, 11:05): a vezérlő folytatásánál a fázis „error”-on maradt — a kézi gombhoz hasonlóan ott is frissül.
      // Review #235: a haladásjelző frissítése best-effort — a hibája nem szakíthatja meg a már elindított folytatást (különben a job
      // „pending”-ben ragadna, ahonnan sem a vezérlő, sem a söprés nem vinné tovább).
      if ((onAccepted || recoveryResume) && tracksProgress(previous?.view.definition.mode)) {
        try {
          const [job] = await db.select({ step: studioJobs.step }).from(studioJobs).where(eq(studioJobs.id, jobId));
          await getRun(id);
          if (job) updateRun(id, { phase: job.step as OneStepPhase, error: null, detail: "Folytatás a mentett részeredményekből." });
        } catch (error) {
          logger.warn(`[STUDIO] A haladásjelző frissítése elmaradt (${jobId}): ${error instanceof Error ? error.message : String(error)} — a folytatás megy tovább.`);
        }
      }
      onAccepted?.();
      // Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D6, élő: a fázis „animator”-on ragadt, miközben a lektor/kapu futott):
      // a követett folytatás ugyanúgy frissíti a haladásjelzőt, mint az első futás (driveOneStep).
      await guardedDrive(jobId, tracksProgress(previous?.view.definition.mode) ? (step, round) => {
        if (!["pedagogue", "author", "animator", "lektor", "gate"].includes(step)) return;
        void getRun(id).then(() => updateRun(id, { phase: step as OneStepPhase, detail: round > 0 ? `${round + 1}. kör` : "Folytatás a mentett részeredményekből." }));
      } : undefined);
      const [job] = await db.select().from(studioJobs).where(eq(studioJobs.id, jobId));
      if (job?.step === "done" && job.lessonId) return previous?.view.definition.mode === "webStudio" ? finishWebStudio(id, owner, job.lessonId) : readPublishedLesson(job.lessonId);
      if (!job || job.step === "error" || job.status === "error") throw new Error(job?.error ?? "A készítés megállt.");
      throw new WorkflowWaiting("A tanulási terv jóváhagyására vár.", true);
    });
    if (completed.state === "done" && tracksProgress(previous?.view.definition.mode)) {
      const [job] = await db.select().from(studioJobs).where(eq(studioJobs.id, jobId));
      await getRun(id);
      updateRun(id, { phase: "done", lessonId: job.lessonId, error: null, detail: "A tananyag ellenőrizve, közzétéve és visszaolvasva." });
    }
  } catch (error) {
    if (!(error instanceof WorkflowWaiting)) {
      if (drove && tracksProgress(previous?.view.definition.mode)) {
        await getRun(id);
        updateRun(id, { phase: "error", error: error instanceof Error ? error.message : "A folytatás megállt." });
      }
      throw error;
    }
  }
}

lessonPipelineRouter.post("/lessons/from-map/:mapId", async (req: Request, res: Response) => {
  const parsed = fromMapBody.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Hibás kérés.", issues: parsed.error.issues.map((i) => i.message) });
  }

  // #180: `{}` (the Studio panel's body) means "the map's own scope".
  const scope = parsed.data && "subject" in parsed.data ? parsed.data : undefined;
  // Spec 2026-10-03-forras-aritmetika-helyesbites: a meglévő térképről indított (újraindított) lecke is a determinisztikus
  // helyesbítésen megy át (kérés/fotó nélkül nincs modellhívás) — különben a hamis forrás-egyenlőség újra tényként tanítódna.
  // A helyesbítés hibája (a futás sem igazolja) sosem állítja meg a készítést — helyesbítés nélkül megy tovább, mint eddig.
  const corrections = await correctMapInWorkflow(req.params.mapId, req.user!.id).catch((error: unknown) => {
    logger.warn(`[STUDIO] A térkép forrás-helyesbítése elmaradt (${req.params.mapId}): ${error instanceof Error ? error.message : String(error)}`);
    return [] as SourceCorrection[];
  });
  const started = await startJobFromMap(req.params.mapId, scope, {}, corrections.length ? { corrections } : undefined);
  if (!started.ok) return res.status(409).json({ message: started.reason });

  res.status(201).json({ jobId: started.jobId });
  void driveTracked(started.jobId, req.user!.id, true).catch(error => {
    // Spec 2026-10-05-s10 (terv-ellenőrzés 2.): lízingvesztésnél (WorkflowConflict) egy MÁSIK vezérlő viszi tovább a futást —
    // a régi folyamat nem írhatja felül hibával az új vezérlő eredményét.
    if (error instanceof WorkflowConflict) { logger.warn(`[STUDIO] Követett készítés átadva (${started.jobId}): ${error.message}`); return; }
    logger.error("[STUDIO] Követett készítés megállt", error);
    void db.update(studioJobs).set({ status: "error", error: "A követett készítés megállt. Ellenőrizd a Futások naplóját.", finishedAt: new Date() }).where(eq(studioJobs.id, started.jobId))
      .catch(() => logger.error("[STUDIO] A megállás státuszát sem sikerült menteni."));
  });
});

/** GET /api/studio/jobs/:id — pollable job state plus what the pipeline produced. */
lessonPipelineRouter.get("/jobs/:id", async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);

  if (!row) return res.status(404).json({ message: "A job nem található." });

  const output = (row.output ?? null) as Record<string, unknown> | null;
  res.json({
    job: {
      id: row.id,
      step: row.step,
      status: row.status,
      round: row.round,
      error: row.error,
      model: row.model,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    },
    // LS-2c (kliens): amit a vázlat-jóváhagyó képernyő megmutat. A `coverage` a
    // pedagógus-lépéskor szerveroldalon számolt mérés — a kliens csak megjeleníti.
    produced: {
      outline: output?.outline ?? null,
      coverage: output?.coverage ?? null,
      approvedOutline: output?.approvedOutline !== undefined,
      lessonId: row.lessonId,
      // B5: quality notes from gate/lektor after round-limit publish (LS-7).
      qualityNotes: Array.isArray(output?.qualityNotes) ? output.qualityNotes : [],
      // U3 (C14): a tanár kérésének nem igazolható pontjai — a panel jelzi, nem néma kihagyás.
      gaps: Array.isArray(output?.gaps) ? output.gaps : [],
    },
  });
});

/** GET /api/studio/jobs/:id/notes — the lektor's notes of a job (LektorNotes panel). */
lessonPipelineRouter.get("/jobs/:id/notes", async (req: Request, res: Response) => {
  const [exists] = await db
    .select({ id: studioJobs.id })
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);
  if (!exists) return res.status(404).json({ message: "A job nem található." });

  const rows = await db
    .select({
      id: lektorNotes.id,
      kind: lektorNotes.kind,
      subkind: lektorNotes.subkind,
      severity: lektorNotes.severity,
      message: lektorNotes.message,
      blockPath: lektorNotes.blockPath,
      resolvedBy: lektorNotes.resolvedBy,
    })
    .from(lektorNotes)
    .where(eq(lektorNotes.jobId, req.params.id))
    .orderBy(asc(lektorNotes.createdAt));

  res.json({ notes: rows });
});

/** POST /api/studio/jobs/:id/approve-outline — the admin gate between pedagogue and author. */
lessonPipelineRouter.post("/jobs/:id/approve-outline", async (req: Request, res: Response) => {
  const trackedId = (await workflowStore.related(req.params.id, req.user!.id)) ?? req.params.id;
  if (await workflowStore.exists(req.params.id) && !await workflowStore.read(trackedId, req.user!.id)) return res.status(404).json({ message: "A futás nem található." });
  try {
    await driveTracked(req.params.id, req.user!.id, false, async () => {
      const approved = await approveOutline(req.params.id, req.body?.outline);
      if (!approved.ok) throw new WorkflowWaiting(approved.reason, true);
    });
    res.json({ jobId: req.params.id });
  } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : "A folytatás megállt." }); }
});

/** POST /api/studio/jobs/:id/resume — re-run the current step (input-hash idempotent). */
lessonPipelineRouter.post("/jobs/:id/resume", async (req: Request, res: Response) => {
  const [exists] = await db
    .select({ id: studioJobs.id })
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);
  if (!exists) return res.status(404).json({ message: "A job nem található." });

  // docs/specs/2026-10-16-egy-futas.md (D): egyfutásos módban a régi lépésgép nem folytatódik — a mentett forrásból egyfutásos újragyártás.
  if (singleRunEnabled()) {
    try { return res.status(202).json({ jobId: req.params.id, runId: await remakeAsSingleRun(req.params.id, req.user!.id), remanufactured: true }); }
    catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Az újragyártás nem indítható." }); }
  }
  // Elakadás-vezérlő V4 (egy szabály): ha a tervező következő foka a teljes újragyártás, a kézi gomb is azt indítja (új job).
  const [stopped] = await db.select({ output: studioJobs.output, error: studioJobs.error, status: studioJobs.status }).from(studioJobs).where(eq(studioJobs.id, req.params.id));
  if (stopped?.status === "error" && stopped.error
    && planRecovery({ error: stopped.error, history: recoveryHistoryOf(stopped.output as never, stopped.error) }).strategy === "remanufacture") {
    try { const jobId = await remanufactureFromMap(req.params.id, req.user!.id, stopped.error); return res.status(202).json({ jobId, remanufactured: true }); }
    catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Az újragyártás nem indítható." }); }
  }
  await respondToResume(res, req.params.id, accepted =>
    driveTracked(req.params.id, req.user!.id, false, (visit) => applyResume(req.params.id, visit), accepted, true));
});

/**
 * Egy szabály (elakadás-vezérlő V3): a kézi „Folytatás” gomb és az automatikus vezérlő ugyanezt hívja a lízing alatt.
 * Kapuhibánál a stratégiát a tervező adja (`retryFailedGate` → `planRecovery`); bank/lektor ágon a meglévő célzott folytatás.
 */
async function applyResume(jobId: string, visit: import("../../shared/lesson-workflow").WorkflowVisit | undefined): Promise<void> {
  // Újraindulás utáni folytatás (docs/specs/2026-10-15-ujraindulas-utani-folytatas.md, E2): a megszakadt lépéstől, a mentett részekkel.
  const [stopped] = await db.select({ error: studioJobs.error, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, jobId));
  // Review #255 (P2): a workflow-lízing ALATT friss állapotból — a törölt (elvetett) piszkozat nem folytatódik (a söprés régi olvasata sem viszi
  // tovább). Az elvetés élő lízing mellett nem lehetséges (`discardDraft`), így a kettő nem fut át egymáson.
  if ((stopped?.output as { recoveryState?: unknown } | null)?.recoveryState === "discarded") throw new WorkflowConflict("A piszkozatot törölték — nem folytatható.");
  if (stopped?.error === ORPHAN_JOB_ERROR) {
    // Review #247 (P2): a publikáltságot a lecke sora dönti el (a publikálás commitja után, a job-kimenet mentése előtt is megállhatott).
    const [lesson] = await db.select({ publishedAt: lessons.publishedAt }).from(studioJobs).innerJoin(lessons, eq(studioJobs.lessonId, lessons.id)).where(eq(studioJobs.id, jobId));
    if (lesson?.publishedAt) throw new WorkflowConflict("A lecke már publikált — a megszakadt lépés nem futtatható újra.");
    return retryAfterRestart(jobId, visit);
  }
  if (visit?.step !== "animator" && visit?.step !== "gate") return retryTimedOutLektor(jobId);
  const [draft] = await db.select({ publishedAt: lessons.publishedAt }).from(studioJobs)
    .innerJoin(lessons, eq(studioJobs.lessonId, lessons.id)).where(eq(studioJobs.id, jobId));
  if (!draft || draft.publishedAt) throw new WorkflowConflict("Csak meglévő, még nem publikált bankjelölt folytatható.");
  // Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D4): a kapu bank-eredetű megállása a kapu újrafuttatásával folytatható.
  // Elakadás-vezérlő V4: a tervező `author-repair` fokánál célzott szerzői javítás (a többi fok a `retryFailedGate`-ben).
  if (visit.step === "gate") {
    const [job] = await db.select({ output: studioJobs.output, error: studioJobs.error }).from(studioJobs).where(eq(studioJobs.id, jobId));
    const plan = planRecovery({ error: job?.error ?? "", history: recoveryHistoryOf(job?.output as never, job?.error) });
    if (plan.strategy === "author-repair") await retryWithAuthorRepair(jobId, visit);
    else await retryFailedGate(jobId, visit);
  } else await retryFailedBankBuild(jobId, visit);
}

/**
 * Elakadás-vezérlő V4.2: a lépcső utolsó végrehajtható foka — teljes újragyártás ugyanabból a térképből (új job, új workflow); a régi piszkozat
 * megmarad, a kimenete az újra hivatkozik (`remanufacturedAs`), és a vezérlő nem veszi fel újra. Futásonként egyszer (a tervező szerint).
 */
/**
 * docs/specs/2026-10-16-egy-futas.md (D): egyfutásos módban az újragyártás / folytatás új EGYFUTÁSOS gyártás a térkép mentett
 * forrásátiratából (a régi lépésgép nem indul). A régi job atomikusan „újragyártott” lesz (dupla kattintás sem indít kettőt).
 */
async function remakeAsSingleRun(jobId: string, owner: string): Promise<string> {
  const claim = await db.execute(sql`UPDATE studio_jobs j SET output = coalesce(j.output, '{}'::jsonb) || '{"recoveryState":"remanufactured"}'::jsonb
    WHERE j.id = ${jobId} AND coalesce(j.output->>'recoveryState', '') NOT IN ('remanufacturing', 'remanufactured', 'discarded')
      AND j.status IN ('error', 'ok') AND j.step <> 'done'
    RETURNING j.map_id, j.output->>'ownerInstruction' AS instruction`);
  const row = claim.rows[0] as { map_id: string; instruction: string | null } | undefined;
  if (!row) throw new WorkflowConflict("Az újragyártás már elindult (vagy a piszkozat törölve).");
  const [map] = await db.select({ title: knowledgeMaps.title, sourceText: knowledgeMaps.sourceText }).from(knowledgeMaps).where(eq(knowledgeMaps.id, row.map_id)).limit(1);
  if (!map?.sourceText?.trim()) {
    await db.execute(sql`UPDATE studio_jobs SET output = output - 'recoveryState' WHERE id = ${jobId}`);
    throw new WorkflowConflict("Ehhez a piszkozathoz nincs mentett forrásszöveg — töltsd fel újra a forrást.");
  }
  const runId = startOneStepRun({ title: map.title, ...(row.instruction ? { instructions: row.instruction } : {}),
    files: [{ name: "forras-atirat.txt", kind: "text", content: map.sourceText }] } as OneStepRequest, owner);
  await db.execute(sql`UPDATE studio_jobs SET output = output || ${JSON.stringify({ remanufacturedAs: `single-run:${runId}` })}::jsonb WHERE id = ${jobId}`);
  logger.warn(`[EGYFUTÁS] ${jobId}: újragyártás egyfutásos motoron a mentett forrásátiratból → futás ${runId}`);
  return runId;
}

async function remanufactureFromMap(jobId: string, owner: string, error: string): Promise<string> {
  if (singleRunEnabled()) return remakeAsSingleRun(jobId, owner);
  // Review #237 (P1): atomi foglalás a job létrehozása ELŐTT — két párhuzamos kérés (dupla kattintás, söprő + gomb) nem indíthat két gyártást.
  const claim = await db.execute(sql`UPDATE studio_jobs SET output = coalesce(output, '{}'::jsonb) || '{"recoveryState":"remanufacturing"}'::jsonb
    WHERE id = ${jobId} AND status = 'error' AND coalesce(output->>'recoveryState', '') NOT IN ('remanufacturing', 'remanufactured', 'discarded') RETURNING id`);
  if (!(claim.rows as unknown[]).length) throw new WorkflowConflict("A teljes újragyártás már elindult (vagy a job már nem hibás állapotú).");
  const release = () => db.execute(sql`UPDATE studio_jobs SET output = output - 'recoveryState' WHERE id = ${jobId} AND output->>'recoveryState' = 'remanufacturing'`);
  let started: Awaited<ReturnType<typeof startJobFromMap>>;
  let job: { mapId: string | null; output: unknown } | undefined;
  try {
    [job] = await db.select({ mapId: studioJobs.mapId, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, jobId));
    if (!job?.mapId) throw new WorkflowConflict("A teljes újragyártáshoz nincs forrástérkép.");
    const out = (job.output ?? {}) as { ownerInstruction?: string; sourceCorrections?: SourceCorrection[]; topicFocus?: TopicFocus | null };
    started = await startJobFromMap(job.mapId, undefined, {}, {
      ...(typeof out.ownerInstruction === "string" ? { instruction: out.ownerInstruction } : {}),
      ...(Array.isArray(out.sourceCorrections) && out.sourceCorrections.length ? { corrections: out.sourceCorrections } : {}),
      ...(out.topicFocus ? { topicFocus: out.topicFocus } : {}),
    });
    if (!started.ok) throw new WorkflowConflict(`A teljes újragyártás nem indítható: ${started.reason}`);
  } catch (e) {
    await release();
    throw e;
  }
  const fp = failureFingerprint(error);
  const history = recoveryHistoryOf(job.output as never, error);
  const step: RecoveryStep = { strategy: "remanufacture", fingerprint: fp.key, failing: fp.failing, at: Date.now() };
  // Review #237 (P1): az új job örökli az újragyártási lépést — ha ugyanígy megáll, a tervező nem gyárt újra (tulajdonosi döntés).
  await db.execute(sql`UPDATE studio_jobs SET output = coalesce(output, '{}'::jsonb) || ${JSON.stringify({ remanufacturedFrom: jobId, recovery: [step] })}::jsonb
    WHERE id = ${started.jobId}`);
  await db.execute(sql`UPDATE studio_jobs SET output = output || ${JSON.stringify({ remanufacturedAs: started.jobId, recoveryState: "remanufactured", recovery: [...history, step] })}::jsonb
    WHERE id = ${jobId}`);
  logger.warn(`[VEZÉRLŐ] ${jobId}: teljes újragyártás indult ugyanabból a forrásból → ${started.jobId}`);
  void driveRemade(started.jobId, owner).catch((e) => {
    if (e instanceof WorkflowConflict) { logger.warn(`[VEZÉRLŐ] Újragyártás átadva (${started.jobId}): ${e.message}`); return; }
    if (e instanceof WorkflowWaiting) { logger.warn(`[VEZÉRLŐ] Az újragyártás döntésre vár (${started.jobId}): ${e.message}`); return; }
    logger.error(`[VEZÉRLŐ] Az újragyártás megállt (${started.jobId})`, e);
  });
  return started.jobId;
}

/**
 * Elakadás-vezérlő V3: a hibával megállt, mentett, nem publikált jobok automatikus továbbvitele a tervező lépcsője szerint — söprésenként
 * legfeljebb egy. A végre nem hajtható fokot (V4: szerzői javítás, teljes újragyártás) kihagyottként naplózza, hogy a tervező továbblépjen;
 * a lépcső végén `recoveryState = "ask-owner"` (a felület a pontos okot mutatja), további automatikus lépés nincs.
 */
export async function sweepFailedStudioJobs(now = Date.now()): Promise<number> {
  // docs/specs/2026-10-16-egy-futas.md (D): egyfutásos módban nincs automatikus (fizetős) továbbvitel — a döntés a felhasználóé (draftlista).
  if (singleRunEnabled()) return 0;
  const { rows } = await db.execute(sql`
    SELECT j.id, j.status, j.step, j.error, j.finished_at, j.output ? 'lesson' AS has_lesson, (l.published_at IS NOT NULL) AS published,
           j.output->>'recoveryState' AS recovery_state, r.id AS run_id, r.owner_id, r.state AS run_state, r.lease_until,
           r.snapshot->'visits'->-1 AS last_visit, j.output->>'htmlFileId' AS html_file_id,
           ${HAS_NEWER_SAME_OWNER} AS has_newer
    FROM studio_jobs j
    LEFT JOIN lessons l ON l.id = j.lesson_id
    LEFT JOIN LATERAL (
      SELECT w.id, w.owner_id, w.state, w.lease_until, w.snapshot FROM lesson_workflow_runs w
      WHERE w.id = j.id OR w.snapshot->>'resourceId' = j.id ORDER BY w.created_at DESC LIMIT 1
    ) r ON true
    WHERE j.status = 'error' AND j.finished_at > now() - interval '7 days'
    ORDER BY j.finished_at ASC LIMIT 50`);
  for (const raw of rows as Array<Record<string, unknown>>) {
    const row: RecoveryRow = {
      id: String(raw.id), status: String(raw.status), step: String(raw.step), error: (raw.error as string | null) ?? null,
      finishedAt: raw.finished_at ? new Date(String(raw.finished_at)) : null, hasLesson: raw.has_lesson === true, published: raw.published === true,
      runId: (raw.run_id as string | null) ?? null, owner: (raw.owner_id as string | null) ?? null, runState: (raw.run_state as string | null) ?? null,
      leaseUntil: raw.lease_until ? new Date(String(raw.lease_until)) : null, recoveryState: (raw.recovery_state as string | null) ?? null,
    };
    if (recoveryCandidate(row, now) !== null) continue;
    const [job] = await db.select({ output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, row.id));
    const history = recoveryHistoryOf(job?.output as never, row.error);
    const lastVisit = (raw.last_visit ?? undefined) as { step: string; state: string; error?: string } | undefined;
    // Újraindulás utáni folytatás (E2): a tervező lépcsője helyett a megszakadt lépés folytatása — forrásonként csak a LEGÚJABB job (a régebbi
    // duplikátum nem indít második gyártást), legfeljebb kétszer (crash-loop ellen).
    if (row.error === ORPHAN_JOB_ERROR) {
      if (raw.has_newer === true) {
        await db.execute(sql`UPDATE studio_jobs SET output = coalesce(output, '{}'::jsonb) || '{"recoveryState":"superseded"}'::jsonb WHERE id = ${row.id} AND status = 'error'`);
        logger.warn(`[VEZÉRLŐ] ${row.id}: ugyanabból a forrásból újabb gyártás van — ez a megszakadt job nem folytatódik.`);
        continue;
      }
      const restarts = history.filter((h) => h.strategy === "restart").length;
      if (restarts >= 2 || resumeKindOf({ step: row.step, status: row.status, error: row.error, hasLesson: row.hasLesson, htmlFileId: raw.html_file_id, published: row.published, visit: lastVisit }) !== "restart") continue;
      const fp = failureFingerprint(row.error);
      const nextHistory = JSON.stringify([...history, { strategy: "restart", fingerprint: fp.key, failing: fp.failing, at: now }]);
      await db.execute(sql`UPDATE studio_jobs SET output = jsonb_set(coalesce(output, '{}'::jsonb), '{recovery}', ${nextHistory}::jsonb) WHERE id = ${row.id} AND status = 'error'`);
      logger.warn(`[VEZÉRLŐ] ${row.id}: szerver-újraindulás után folytatás a megszakadt lépéstől (${lastVisit?.step}), a mentett részekkel.`);
      void driveTracked(row.id, row.owner!, false, (visit) => applyResume(row.id, visit), undefined, false, true).catch((error) => {
        if (error instanceof WorkflowConflict) { logger.warn(`[VEZÉRLŐ] ${row.id}: kihagyva — ${error.message}`); return; }
        logger.error(`[VEZÉRLŐ] ${row.id}: az újraindulás utáni folytatás megállt`, error);
      });
      return 1;
    }
    // Ugyanaz a jogosultsági szabály, mint a kézi gombé: nem folytatható hibát a vezérlő nem hajt (különben söprésenként újra bukna).
    const eligible = resumeKindOf({ step: row.step, status: row.status, error: row.error, hasLesson: row.hasLesson, htmlFileId: raw.html_file_id,
      published: row.published, visit: lastVisit, gateRecoveryAttempt: (job?.output as { gateRecoveryAttempt?: unknown } | null)?.gateRecoveryAttempt }) !== null;
    const planned = planRecovery({ error: row.error!, history });
    const plan = eligible ? planned : { ...planned, strategy: "ask-owner" as const, reason: `${recoveryReason("ask-owner")} — ez a megállás a mentett részekből nem folytatható` };
    if (plan.strategy === "remanufacture") {
      await remanufactureFromMap(row.id, row.owner!, row.error!).catch((e) => logger.error(`[VEZÉRLŐ] ${row.id}: a teljes újragyártás nem indult`, e));
      return 1;
    }
    if (plan.strategy === "ask-owner") {
      // A lépcső végén (vagy nem folytatható hibánál): tulajdonosi döntés — egyszer naplózva, a felület a pontos okot mutatja.
      const fp = failureFingerprint(row.error!);
      const step: RecoveryStep = { strategy: plan.strategy, fingerprint: fp.key, failing: fp.failing, at: now };
      const done = true;
      const nextHistory = JSON.stringify([...history, step]);
      await db.execute(sql`UPDATE studio_jobs SET output = jsonb_set(jsonb_set(output, '{recovery}', ${nextHistory}::jsonb),
        '{recoveryState}', ${JSON.stringify(done ? "ask-owner" : "running")}::jsonb) WHERE id = ${row.id} AND status = 'error'`);
      logger.warn(`[VEZÉRLŐ] ${row.id}: tulajdonosi döntés szükséges — ${plan.reason}`);
      continue;
    }
    if (plan.strategy === "retry-provider") {
      // A szolgáltatói újrapróba a végrehajtás ELŐTT a naplóba kerül (a tervező így legfeljebb kétszer választja ugyanarra a hibára).
      const fp = failureFingerprint(row.error!);
      const nextHistory = JSON.stringify([...history, { strategy: plan.strategy, fingerprint: fp.key, failing: fp.failing, at: now }]);
      await db.execute(sql`UPDATE studio_jobs SET output = jsonb_set(output, '{recovery}', ${nextHistory}::jsonb) WHERE id = ${row.id} AND status = 'error'`);
    }
    logger.warn(`[VEZÉRLŐ] ${row.id}: automatikus folytatás — ${plan.strategy}: ${plan.reason}`);
    void driveTracked(row.id, row.owner!, false, (visit) => applyResume(row.id, visit), undefined, false, true).catch((error) => {
      if (error instanceof WorkflowConflict) { logger.warn(`[VEZÉRLŐ] ${row.id}: kihagyva — ${error.message}`); return; }
      logger.error(`[VEZÉRLŐ] ${row.id}: az automatikus folytatás megállt`, error);
    });
    return 1; // söprésenként legfeljebb egy
  }
  return 0;
}

/* ------------------------------------------------------------------ *
 * LS-5 — feedback loop: concept stats, fix-concept, quiz export
 * ------------------------------------------------------------------ */

/** GET /api/studio/lessons/:id/concept-stats — fogalmankénti összesítés (szülői összegző adata). */
lessonPipelineRouter.get("/lessons/:id/concept-stats", async (req: Request, res: Response) => {
  const rows = await db
    .select({ conceptId: conceptResults.conceptId, correct: conceptResults.correct })
    .from(conceptResults)
    .where(eq(conceptResults.lessonId, req.params.id));

  res.json({ stats: aggregateConceptResults(rows) });
});

/** POST /api/studio/lessons/:id/fix-concept — egy gyenge fogalom célzott újraírása. */
lessonPipelineRouter.post("/lessons/:id/fix-concept", async (req: Request, res: Response) => {
  const body = z.object({ conceptId: z.string().trim().min(1).max(64) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "conceptId kötelező (1-64 karakter)." });

  const lessonId = req.params.id;
  const actorId = req.user!.id;
  const runId = createRun();
  updateRun(runId, { phase: "author", lessonId, detail: "Fogalomjavítás és a gyakorlóbankok frissítése…" });
  res.status(202).json({ runId, lessonId });
  // Seven bank calls must not keep an HTTP request open across proxy timeouts.
  void executeWorkflow(workflowStore, { id: runId, owner: actorId, mode: "concept", request: { lessonId, conceptId: body.data.conceptId } }, async () => {
    const result = await fixConceptOnLesson(lessonId, body.data.conceptId, {}, actorId);
    if (!result.ok) throw new Error(result.error);
    return readPublishedLesson(lessonId);
  }).then(() => {
    updateRun(runId, { phase: "done", detail: "A javítás alkalmazva és visszaolvasva." });
  }).catch(error => {
    logger.error("[STUDIO] Fogalomjavítási futás meghiúsult", error);
    updateRun(runId, { phase: "error", error: "A fogalomjavítás nem fejeződött be. A mentett állapotot ellenőrizd újrapróbálás előtt." });
  });
});

const exportQuizBody = z.object({
  gameId: z.string().trim().min(1).max(64),
  topic: z.string().trim().max(128).optional(),
});

/** POST /api/studio/lessons/:id/export-quiz — a check-blokkok a játék-kvíz bankba, fogalom-kötéssel. */
lessonPipelineRouter.post("/lessons/:id/export-quiz", async (req: Request, res: Response) => {
  const body = exportQuizBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "gameId kötelező, topic legfeljebb 128 karakter." });

  const [game] = await db
    .select({ id: gamesCatalog.id })
    .from(gamesCatalog)
    .where(eq(gamesCatalog.id, body.data.gameId))
    .limit(1);
  if (!game) return res.status(400).json({ message: "Ismeretlen játék-azonosító." });

  const [lesson] = await db
    .select({ id: lessons.id, json: lessons.json, mapId: lessons.mapId, htmlFileId: lessons.htmlFileId, version: lessons.version, publishedAt: lessons.publishedAt })
    .from(lessons)
    .where(eq(lessons.id, req.params.id))
    .limit(1);
  if (!lesson) return res.status(404).json({ message: "A lecke nem található." });

  const sharedBank = canonicalLessonQuiz(lesson, body.data.gameId);
  if (sharedBank !== null) {
    if (!lesson.publishedAt) return res.status(409).json({ message: "Előbb publikáld az ellenőrzött leckét." });
    if (!(COUPON_GAME_IDS as readonly string[]).includes(body.data.gameId)) return res.status(400).json({ message: "Ez a játék nem használ tananyagkvízt." });
    if (!sharedBank.length) return res.status(422).json({ message: "A lecke kérdésbankja javítást igényel." });
    return res.json({ exported: 0, shared: sharedBank.length, canonical: true });
  }

  // #178: concept_id is an FK to km_concepts.id — resolve the lesson's local slugs through the map.
  const mapConcepts = await db
    .select({ id: kmConcepts.id, localId: kmConcepts.localId })
    .from(kmConcepts)
    .where(eq(kmConcepts.mapId, lesson.mapId));
  const rows = exportQuizItemsFromChecks(
    lesson.json as never,
    body.data.gameId,
    body.data.topic,
    req.params.id,
    conceptIdResolver(mapConcepts),
  );
  if (rows.length === 0) return res.status(400).json({ message: "A leckében nincs fogalommal köthető check-blokk." });

  // Audit 2026-09-05 (B): idempotent — a re-export of the same lesson→game replaces, not duplicates.
  await db.transaction(async (tx) => {
    await tx
      .delete(gameQuizItems)
      .where(and(eq(gameQuizItems.lessonId, req.params.id), eq(gameQuizItems.gameId, body.data.gameId)));
    await tx.insert(gameQuizItems).values(rows);
  });
  res.json({ exported: rows.length });
});
