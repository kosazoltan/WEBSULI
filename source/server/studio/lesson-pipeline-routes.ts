import express, { type Request, type Response } from "express";
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import {
  conceptResults,
  gameQuizItems,
  gamesCatalog,
  kmConcepts,
  knowledgeMaps,
  lektorNotes,
  lessons,
  oneStepRuns,
  studioJobs,
  htmlFiles,
} from "../../shared/schema";
import { isAuthenticatedAdmin } from "../auth";
import { logger } from "../lib/logger";
import { aggregateConceptResults } from "../rewards/aggregate";
import { COUPON_GAME_IDS, conceptIdResolver, exportQuizItemsFromChecks } from "./quiz-export";
import { canonicalLessonQuiz } from "./canonical-quiz-bank";
import { fromMapBody } from "./from-map-body";
import { outlineSchema } from "./step-io";
import { decideOneStepAction, parseOneStepRequest, type OneStepRequest } from "./one-step";
import {
  createRun as createRunBase,
  getRun as getRunBase,
  markOrphanedRuns,
  updateRun as updateRunBase,
  type OneStepPhase,
  type OneStepRun,
} from "./one-step-progress";
import { ORPHAN_JOB_ERROR, sweepDecision, type SweepRow } from "./orphan-jobs";
import { executeWorkflow, workflowFence, workflowPhase, WorkflowWaiting, WorkflowConflict } from "../workflows/engine";
import { workflowStore } from "../workflows/store";
import { normalizeOwnerInstruction } from "../../shared/owner-instruction";
import type { RunTiming } from "../../shared/studio-ui";
import { telemetryOf } from "./single-run/telemetry";
import { resumePointOf, singleRunResumable, SINGLE_RUN_VERSION } from "./single-run/engine";
import type { ExtractorFile } from "./extractor";

/*
 * docs/specs/2026-10-16-egy-futas.md (S4b): a tananyaggyártás egyetlen útja az egyfutásos motor (Opus 5.5 medium egy beszélgetésben,
 * tartalék GPT-6.1 Sol). A régi többmodelles lépésgép (drive / driveTracked, automatikus folytatás, helyreállító vezérlő) kivezetve:
 * a megállt gyártás a piszkozatából nem folytatódik, hanem a mentett forrásból egyfutásosan újragyártható (`remakeAsSingleRun`).
 */

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



/**
 * #168 — boot-sweep: a folyamat halálakor árván maradt futások explicit hibára záródnak, hogy a kliens jelzője ne ragadjon be.
 * Induláskor egyszer fut. S4b: a megszakadt gyártás nem folytatódik magától (a beszélgetés közepéről való folytatás külön szelet);
 * csak az a futás marad nyitva, amelynek jobját épp egy MÁSIK élő folyamat viszi (élő lízing — `sweepDecision` → „leave”).
 */
export async function closeOrphanedOneStepRuns(): Promise<number> {
  const open = await db
    .select({ id: oneStepRuns.id, phase: oneStepRuns.phase, jobId: oneStepRuns.jobId })
    .from(oneStepRuns);
  const driven = new Set<string>();
  const jobIds = open.filter((r) => r.jobId).map((r) => r.jobId!);
  if (jobIds.length) {
    const { rows } = await db.execute(sql`
      SELECT j.id, j.status, r.id AS run_id, r.owner_id, r.state AS run_state, r.lease_until,
             COALESCE((r.snapshot->>'executions')::int, 0) AS executions
      FROM studio_jobs j
      LEFT JOIN LATERAL (
        SELECT w.id, w.owner_id, w.state, w.lease_until, w.snapshot FROM lesson_workflow_runs w
        WHERE w.id = j.id OR w.resource_id = j.id ORDER BY w.created_at DESC LIMIT 1
      ) r ON true
      WHERE j.id IN (${sql.join(jobIds.map((id) => sql`${id}`), sql`, `)}) AND j.status NOT IN ('ok', 'error')`);
    const now = Date.now();
    for (const raw of rows as Array<Record<string, unknown>>) {
      const row: SweepRow = { id: String(raw.id), status: String(raw.status), runId: (raw.run_id as string | null) ?? null, owner: (raw.owner_id as string | null) ?? null,
        runState: (raw.run_state as string | null) ?? null, leaseUntil: raw.lease_until ? new Date(String(raw.lease_until)) : null, executions: Number(raw.executions ?? 0) };
      if (sweepDecision(row, now, true) === "leave") driven.add(row.id);
    }
  }
  const orphans = markOrphanedRuns(open.filter((r) => !(r.jobId && driven.has(r.jobId))));
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
 * A nyitott jobok söprése a `sweepDecision` szerint: élő lízingnél érintetlen, különben hibára zárul a pontos okkal (a piszkozat
 * megmarad, a döntés — újragyártás vagy elvetés — a felhasználóé). S4b: automatikus folytatás nincs (a régi lépésgép kivezetve).
 * Indításkor ÉS utána STUDIO_SWEEP_INTERVAL_MS-onként fut: deploykor a régi példány még tartja a lízinget, annak lejárta után zárul.
 */
export async function sweepStudioJobs(boot: boolean): Promise<number> {
  const { rows } = await db.execute(sql`
    SELECT j.id, j.status, r.id AS run_id, r.owner_id, r.state AS run_state, r.lease_until,
           COALESCE((r.snapshot->>'executions')::int, 0) AS executions
    FROM studio_jobs j
    LEFT JOIN LATERAL (
      SELECT w.id, w.owner_id, w.state, w.lease_until, w.snapshot FROM lesson_workflow_runs w
      WHERE w.id = j.id OR w.resource_id = j.id ORDER BY w.created_at DESC LIMIT 1
    ) r ON true
    WHERE j.status NOT IN ('ok', 'error')`);
  const now = Date.now();
  let acted = 0;
  for (const raw of rows as Array<Record<string, unknown>>) {
    const row: SweepRow = {
      id: String(raw.id), status: String(raw.status), runId: (raw.run_id as string | null) ?? null, owner: (raw.owner_id as string | null) ?? null,
      runState: (raw.run_state as string | null) ?? null, leaseUntil: raw.lease_until ? new Date(String(raw.lease_until)) : null, executions: Number(raw.executions ?? 0),
    };
    if (sweepDecision(row, now, boot) === "leave") continue;
    acted++;
    await db.update(studioJobs).set({ status: "error", step: "error", error: ORPHAN_JOB_ERROR, finishedAt: new Date() }).where(and(eq(studioJobs.id, row.id), ne(studioJobs.status, "ok")));
    logger.warn(`[STUDIO] Árva lecke-job hibára zárva (${row.id}) — a piszkozat megmarad, újragyártható.`);
  }
  return acted;
}

// Spec 2026-10-19-eroforras-s1 + review #324: 15 perc (korábban 100 s) — biztosan hosszabb a Neon 5 perces elalvási küszöbénél; a
// leállás a futó munkát kivárja (max 270 s), így árva job ritka, és indításkor a söprés úgyis lefut.
export const STUDIO_SWEEP_INTERVAL_MS = 15 * 60_000;
/** Időszakos söprés (a lejárt lízingű, gazdátlanná vált jobok lezárása); a folyamat leállását nem tartja fel. */
export function startStudioJobSweeper(): void {
  setInterval(() => {
    void sweepStudioJobs(false).catch((error) => logger.warn(`[STUDIO] Időszakos söprés hibája: ${error instanceof Error ? error.message : String(error)}`));
  }, STUDIO_SWEEP_INTERVAL_MS).unref();
}

/**
 * LS-2c — a tananyaggyártás admin végpontjai (/api/studio alatt, admin-védett). A gyártás az egyfutásos motoron
 * (`single-run/`), ezek a kezelők csak indítanak, követnek és kezelik a piszkozatokat.
 */
export const lessonPipelineRouter = express.Router();

lessonPipelineRouter.use(isAuthenticatedAdmin);

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
export function startOneStepRun(data: OneStepRequest, userId: string | undefined, targetHtmlFileId?: string): string {
  const runId = createRun();
  void runOneStep(runId, data, userId, targetHtmlFileId).catch((error) => {
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
} & RunTiming;

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
    const { visits } = run.phase === "draft" ? await workflowVisitsOfJob(run.jobId) : await workflowVisitsOf(runId);
    stop = job ? jobStopInfo(job, visits) : { resumable: false, stoppedAt: visits.filter((v) => v.state === "error").at(-1)?.step };
  }
  // Spec 2026-10-16-gyartas-haladas: futó fázisnál az idők (a szerver órája szerint) és a háttérfolyamat élő volta (workflow-lízing).
  let timing: RunTiming = {};
  if (!["done", "error", "parked", "draft", "waiting"].includes(run.phase)) {
    const now = Date.now();
    const lease = await db.execute(sql`SELECT lease_until > now() AS alive FROM lesson_workflow_runs WHERE id = ${runId} LIMIT 1`).catch(() => ({ rows: [] }));
    const alive = (lease.rows[0] as { alive?: boolean | null } | undefined)?.alive;
    timing = { elapsedSec: Math.max(0, Math.round((now - run.startedAt) / 1000)), sinceUpdateSec: Math.max(0, Math.round((now - run.updatedAt) / 1000)), ...(typeof alive === "boolean" ? { alive } : {}) };
  }
  return { phase: run.phase, detail: run.detail, error: run.error, mapId: run.mapId, jobId: run.jobId, lessonId: run.lessonId, htmlFileId, ...timing, ...(draft ? { draft } : {}),
    ...(draftRunId ? { draftRunId } : {}), ...(ownerInstruction ? { ownerInstruction } : {}),
    ...(stop ? { resumable: stop.resumable, ...(stop.stoppedAt ? { stoppedAt: stop.stoppedAt } : {}), ...(stop.resumeKind ? { resumeKind: stop.resumeKind } : {}),
      ...(stop.nextRecovery ? { nextRecovery: stop.nextRecovery } : {}) } : {}) };
}

/** A megállt job nézete — EGY szabály a futásnézetnek és az admin piszkozatlistának (docs/specs/2026-10-15-admin-tananyag-draft.md). */
export type JobStopInfo = { resumable: boolean; stoppedAt?: string; resumeKind?: string; nextRecovery?: { strategy: string; reason: string } };
/**
 * J5: a megállt EGYFUTÁSOS gyártás a mentett részeiből (terv, tananyag, bank-ellenőrzőpont, beszélgetés) folytatható, ha nincs közzétéve és
 * nem indult helyette új gyártás. A régi lépésgép jobja nem folytatható (S4b): ott a teendő az újragyártás vagy az elvetés.
 */
function jobStopInfo(job: { output: unknown }, visits: Array<{ step: string; state: string; error?: string }>): JobStopInfo {
  const remanufacturedAs = (job.output as { remanufacturedAs?: unknown } | null)?.remanufacturedAs;
  const resumable = typeof remanufacturedAs !== "string" && singleRunResumable(job.output);
  return {
    resumable,
    ...(resumable ? { resumeKind: resumePointOf(job.output as Record<string, unknown>).stage === "lektor" ? "lektor" : "bank" } : {}),
    stoppedAt: visits.filter((v) => v.state === "error").at(-1)?.step,
    ...(typeof remanufacturedAs === "string"
      ? { nextRecovery: { strategy: "ask-owner", reason: `új gyártás indult ugyanabból a forrásból (${remanufacturedAs.slice(0, 8)}) — a Tananyagkészítési futások között követhető` } }
      : {}),
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
  const result = await db.execute(sql`SELECT id FROM lesson_workflow_runs WHERE id = ${jobId} OR resource_id = ${jobId} ORDER BY created_at DESC LIMIT 1`);
  const row = result.rows[0] as { id?: string } | undefined;
  return row?.id ? workflowVisitsOf(String(row.id)) : { visits: [], executions: 0 };
}

/** docs/specs/2026-10-15-admin-tananyag-draft.md + 2026-10-16-draft-kezeles.md: az admin „Tananyag draft” listájának egy tétele. */
export type OwnerDraft = { jobId: string; title: string; subject: string; classroom: number; draft: OneStepDraft | null; running: boolean;
  error: string | null; updatedAt: string; step: string; ownerless: boolean; hasPublished: boolean; awaitingApproval: boolean;
  /** Spec 2026-10-16-gyartas-haladas: futó tételnél a job legutóbbi futásának részlete és ideje. */
  progress?: { detail: string | null } & RunTiming } & JobStopInfo;

/**
 * docs/specs/2026-10-16-draft-kezeles.md: a belépett admin által kezelhető job — nincs olyan workflow-sora, amelynek MÁS a gazdája
 * (saját vagy gazdátlan). Feltétel: a lekérdezésben `j` a job.
 */
const manageableBy = (owner: string) => sql`NOT EXISTS (SELECT 1 FROM lesson_workflow_runs ow WHERE (ow.id = j.id OR ow.resource_id = j.id) AND ow.owner_id <> ${owner})`;

/**
 * Review #255 (P2): elvetni csak olyan jobot lehet, amelyet épp senki nem visz (nincs élő workflow-lízing, nincs folyamatban lévő újragyártás) —
 * a folytatás a lízing alatt újraellenőrzi az elvetést, így a kettő atomikusan kizárja egymást.
 */
const notBeingDriven = sql`NOT EXISTS (SELECT 1 FROM lesson_workflow_runs lw WHERE (lw.id = j.id OR lw.resource_id = j.id) AND lw.lease_until > now())
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
    LEFT JOIN LATERAL (SELECT w.owner_id FROM lesson_workflow_runs w WHERE w.id = j.id OR w.resource_id = j.id ORDER BY w.created_at DESC LIMIT 1) wr ON true
    WHERE coalesce(j.output->>'recoveryState', '') NOT IN ('superseded', 'remanufactured', 'remanufacturing', 'discarded')
      AND ((j.output ? 'lesson' AND l.published_at IS NULL AND j.status <> 'ok' AND ${manageableBy(owner)})
        OR (j.status IN ('pending', 'running') AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner})
        OR (j.status = 'ok' AND j.step = 'author' AND j.output ? 'outline' AND NOT j.output ? 'approvedOutline' AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner}))`);
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function ownerDrafts(owner: string): Promise<OwnerDraft[]> {
  const { rows } = await db.execute(sql`SELECT j.id, j.step, j.status, j.error, j.lesson_id, j.output, coalesce(j.finished_at, j.created_at) AS updated_at,
      m.title AS map_title, m.subject, m.classroom, wr.visits AS wf_visits, wr.executions AS wf_executions, wr.owner_id AS wf_owner,
      osr.detail AS run_detail, osr.elapsed AS run_elapsed, osr.since AS run_since, osr.alive AS run_alive,
      EXISTS (SELECT 1 FROM lessons p WHERE p.map_id = j.map_id AND p.published_at IS NOT NULL) AS has_published
    FROM studio_jobs j LEFT JOIN lessons l ON l.id = j.lesson_id JOIN knowledge_maps m ON m.id = j.map_id
    -- Review #253 (P2): a job legutóbbi workflow-pillanatképe ugyanebben a lekérdezésben (nincs tételenkénti 2 körút).
    LEFT JOIN LATERAL (
      SELECT w.owner_id, w.snapshot->'visits' AS visits, w.snapshot->'executions' AS executions FROM lesson_workflow_runs w
      WHERE w.id = j.id OR w.resource_id = j.id ORDER BY w.created_at DESC LIMIT 1
    ) wr ON true
    -- Spec 2026-10-16-gyartas-haladas: a job legutóbbi futásának részlete, ideje (a szerver órája szerint) és a háttérfolyamat lízingje.
    LEFT JOIN LATERAL (
      SELECT r.detail, extract(epoch FROM now() - r.started_at)::int AS elapsed, extract(epoch FROM now() - r.updated_at)::int AS since,
        (SELECT w.lease_until > now() FROM lesson_workflow_runs w WHERE w.id = r.id) AS alive
      FROM one_step_runs r WHERE r.job_id = j.id ORDER BY r.updated_at DESC LIMIT 1
    ) osr ON true
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
    const { visits } = parseWorkflowVisits({ visits: raw.wf_visits, executions: raw.wf_executions });
    const lessonTitle = (raw.output as { lesson?: { title?: unknown } } | null)?.lesson?.title;
    const ownerless = !raw.wf_owner;
    const stop = running || awaitingApproval ? { resumable: false } : jobStopInfo(job, visits);
    out.push({
      jobId: String(raw.id), title: typeof lessonTitle === "string" && lessonTitle.trim() ? lessonTitle : String(raw.map_title ?? "Névtelen tananyag"),
      subject: String(raw.subject ?? ""), classroom: Number(raw.classroom ?? 0), draft: draftSummaryOf(raw.output), running,
      error: running ? null : job.error, updatedAt: new Date(String(raw.updated_at)).toISOString(), step: job.step,
      ownerless, hasPublished: raw.has_published === true, awaitingApproval,
      ...(running && typeof raw.run_elapsed === "number" ? { progress: { detail: (raw.run_detail as string | null) ?? null, elapsedSec: Math.max(0, raw.run_elapsed),
        ...(typeof raw.run_since === "number" ? { sinceUpdateSec: Math.max(0, raw.run_since) } : {}), ...(typeof raw.run_alive === "boolean" ? { alive: raw.run_alive } : {}) } } : {}),
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

/** J2/J3: POST /api/studio/drafts/:jobId/continue — a saját, tervre váró régi job: egyfutásos újragyártás a mentett forrásból. */
lessonPipelineRouter.post("/drafts/:jobId/continue", async (req: Request, res: Response) => {
  const owner = req.user!.id;
  const { rows } = await db.execute(sql`SELECT j.id FROM studio_jobs j
    LEFT JOIN LATERAL (SELECT w.owner_id FROM lesson_workflow_runs w WHERE w.id = j.id OR w.resource_id = j.id ORDER BY w.created_at DESC LIMIT 1) wr ON true
    WHERE j.id = ${req.params.jobId} AND ${notBeingDriven} AND coalesce(j.output->>'recoveryState', '') <> 'discarded' AND (j.status = 'ok' AND j.step = 'author' AND j.output ? 'outline' AND NOT j.output ? 'approvedOutline' AND j.created_at > now() - interval '7 days' AND wr.owner_id = ${owner})`);
  if (!rows.length) return res.status(409).json({ message: "Ez a job nem vár a tanulási terv jóváhagyására (vagy másik készítőhöz tartozik)." });
  try { return res.status(202).json({ jobId: req.params.jobId, runId: await remakeAsSingleRun(req.params.jobId, owner) }); }
  catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "A folytatás nem indítható." }); }
});

/** D3: POST /api/studio/drafts/:jobId/remake — teljes újragyártás ugyanabból a forrásból (egyfutásos; a válasz a futás azonosítója). */
lessonPipelineRouter.post("/drafts/:jobId/remake", async (req: Request, res: Response) => {
  const owner = req.user!.id;
  const { rows } = await db.execute(sql`SELECT j.id FROM studio_jobs j WHERE j.id = ${req.params.jobId} AND j.status = 'error'
    AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = j.lesson_id AND l.published_at IS NOT NULL) AND ${manageableBy(owner)}`);
  if (!rows.length) return res.status(409).json({ message: "Ez a piszkozat nem gyártható újra (fut, publikált, vagy másik készítőhöz tartozik)." });
  try { return res.status(202).json({ jobId: req.params.jobId, runId: await remakeAsSingleRun(req.params.jobId, owner), remanufactured: true }); }
  catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Az újragyártás nem indítható." }); }
});

/** GET /api/studio/lessons/one-step/:runId — the progress poll. */
lessonPipelineRouter.get("/lessons/one-step/:runId", async (req: Request, res: Response) => {
  const view = await oneStepRunView(req.params.runId);
  if (!view) return res.status(404).json({ message: "Ismeretlen vagy lejárt futás." });
  res.json(view);
});

/** The whole one-step chain, reporting each phase into the progress store. */
export async function runOneStep(
  runId: string,
  data: OneStepRequest,
  userId: string | undefined,
  /** Spec 2026-10-20-regi-anyag-studio-atalakitas: csak a szerveroldali átalakító sor adja (a nyilvános kérés nem). */
  targetHtmlFileId?: string,
): Promise<void> {
  if (!userId) throw new Error("A futáshoz hitelesített készítő szükséges.");
  await executeWorkflow(workflowStore, { id: runId, owner: userId, mode: "upload", request: data }, async () => {
    await runOneStepCore(runId, data, userId, targetHtmlFileId);
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

async function readPublishedLesson(lessonId: string) {
  await workflowPhase("readback");
  const [row] = await db.select({ id: htmlFiles.id, content: lessons.json, publishedAt: lessons.publishedAt })
    .from(lessons).innerJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id)).where(eq(lessons.id, lessonId));
  if (!row?.id || !row.content || !row.publishedAt) throw new Error("A közzétett tananyag nem olvasható vissza.");
  return { kind: "material" as const, id: row.id };
}

/**
 * docs/specs/2026-10-16-egy-futas.md (tulajdonosi döntés 2026-10-16): minden gyártás az egyfutásos motoron — Opus 5.5 (medium) egy
 * beszélgetésben a forrástól a közzétételig, tartalék GPT-6.1 Sol.
 */
async function runOneStepCore(runId: string, data: OneStepRequest, userId: string, targetHtmlFileId?: string) {
  const { runSingleUpload } = await import("./single-run/live");
  try {
    const result = await runSingleUpload(
      { files: data.files as ExtractorFile[], instruction: normalizeOwnerInstruction(data.instructions), title: data.title, ownerId: userId, ...(targetHtmlFileId ? { targetHtmlFileId } : {}) },
      (p) => updateRun(runId, { phase: p.phase, ...(p.detail !== undefined ? { detail: p.detail } : {}), ...(p.mapId ? { mapId: p.mapId } : {}), ...(p.jobId ? { jobId: p.jobId } : {}) }),
    );
    updateRun(runId, { phase: "done", lessonId: result.lessonId, mapId: result.mapId, jobId: result.jobId, detail: "A tananyag elkészült és közzétéve." });
  } catch (error) {
    logger.error(`[EGYFUTÁS] A gyártás megállt (${runId}): ${error instanceof Error ? error.message : String(error)}`);
    updateRun(runId, { phase: "error", error: error instanceof Error ? error.message.slice(0, 1500) : "Az egyfutásos gyártás megállt." });
  }
}

/**
 * POST /api/studio/lessons/from-map/:mapId — egyfutásos gyártás a JÓVÁHAGYOTT, gondozott térképről (review #262: nincs újrakinyerés, a
 * fogalomazonosítók stabilak); a kliens a visszaadott futást (`runId`) követi. #180: az üres törzs a térkép saját tantárgyát / évfolyamát
 * jelenti; a megadott hatókörnek egyeznie kell vele.
 */
lessonPipelineRouter.post("/lessons/from-map/:mapId", async (req: Request, res: Response) => {
  const parsed = fromMapBody.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ message: "Hibás kérés.", issues: parsed.error.issues.map((i) => i.message) });
  }
  const scope = parsed.data && "subject" in parsed.data ? parsed.data : undefined;
  const [map] = await db.select({ subject: knowledgeMaps.subject, classroom: knowledgeMaps.classroom, status: knowledgeMaps.status })
    .from(knowledgeMaps).where(eq(knowledgeMaps.id, req.params.mapId)).limit(1);
  if (!map) return res.status(404).json({ message: "A térkép nem található." });
  if (map.status !== "approved") return res.status(409).json({ message: "A tudástár még nincs jóváhagyva — előbb nézd át és hagyd jóvá." });
  if (scope && (scope.subject !== map.subject || scope.classroom !== map.classroom)) return res.status(409).json({ message: "A megadott tantárgy / évfolyam nem egyezik a térképével." });
  if (!(await hasTaughtConcepts(req.params.mapId))) return res.status(409).json({ message: "A tudástárban nincs tanítható (jóváhagyott) fogalom." });
  return res.status(202).json({ runId: startMapRun(req.params.mapId, req.user!.id) });
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
      // J3: az egyfutásos gyártás telemetriája (állomásonként forduló, token, idő; friss hívások; kapuk) — régi jobnál null.
      telemetry: telemetryOf(output),
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

/** POST /api/studio/jobs/:id/approve-outline — a tervre váró régi job: egyfutásos újragyártás a mentett forrásból (S4a). */
lessonPipelineRouter.post("/jobs/:id/approve-outline", async (req: Request, res: Response) => {
  const trackedId = (await workflowStore.related(req.params.id, req.user!.id)) ?? req.params.id;
  if (await workflowStore.exists(req.params.id) && !await workflowStore.read(trackedId, req.user!.id)) return res.status(404).json({ message: "A futás nem található." });
  // Review #261/#262: a tanár által jóváhagyott (átrendezett) vázlat SZERKEZETILEG utazik az újragyártásba — a terv-állomás ezt veszi át.
  const outline = req.body?.outline === undefined ? undefined : outlineSchema.safeParse(req.body.outline);
  if (outline && !outline.success) return res.status(400).json({ message: "A vázlat alakilag hibás.", issues: outline.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) });
  try { return res.status(202).json({ jobId: req.params.id, runId: await remakeAsSingleRun(req.params.id, req.user!.id, outline?.success ? { approvedOutline: outline.data } : {}), remanufactured: true }); }
  catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Az újragyártás nem indítható." }); }
});

/**
 * POST /api/studio/jobs/:id/resume — J5: a megállt egyfutásos gyártás folytatása a mentett részeiből, ugyanazon a jobon; a régi lépésgép
 * jobja (vagy a mentett rész nélküli megállás) egyfutásos újragyártás a gondozott térképről (a piszkozat megmarad).
 */
lessonPipelineRouter.post("/jobs/:id/resume", async (req: Request, res: Response) => {
  const [job] = await db
    .select({ id: studioJobs.id, output: studioJobs.output })
    .from(studioJobs)
    .where(eq(studioJobs.id, req.params.id))
    .limit(1);
  if (!job) return res.status(404).json({ message: "A job nem található." });
  try {
    if (jobStopInfo(job, []).resumable) return res.status(202).json({ jobId: req.params.id, runId: await resumeSingleRun(req.params.id, req.user!.id), resumed: true });
    return res.status(202).json({ jobId: req.params.id, runId: await remakeAsSingleRun(req.params.id, req.user!.id), remanufactured: true });
  } catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "A folytatás nem indítható." }); }
});

/**
 * J5: a megállt egyfutásos job atomikus foglalása (hibás → fut; dupla kattintás sem indít kettőt; csak saját / gazdátlan, épp nem vitt,
 * nem közzétett job) és a folytatás indítása saját futással és workflow-val (a felület ugyanúgy követi, mint a gyártást).
 */
export async function resumeSingleRun(jobId: string, owner: string): Promise<string> {
  const claim = await db.execute(sql`UPDATE studio_jobs j SET status = 'running', error = NULL, finished_at = NULL
    WHERE j.id = ${jobId} AND j.status = 'error' AND j.output->'singleRun'->>'version' = ${SINGLE_RUN_VERSION}
      AND coalesce(j.output->>'recoveryState', '') NOT IN ('remanufacturing', 'remanufactured', 'discarded') AND NOT j.output ? 'remanufacturedAs'
      AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = j.lesson_id AND l.published_at IS NOT NULL)
      AND ${notBeingDriven} AND ${manageableBy(owner)}
    RETURNING j.map_id`);
  const row = claim.rows[0] as { map_id: string } | undefined;
  if (!row) throw new WorkflowConflict("A folytatás már elindult, a piszkozat törölve, épp fut, vagy nem a tiéd.");
  const runId = createRun();
  updateRun(runId, { phase: "pedagogue", mapId: row.map_id, jobId, detail: "Folytatás a mentett részeredményekből…" });
  const message = (error: unknown) => error instanceof Error ? error.message.slice(0, 1500) : "A folytatás megállt.";
  const release = (error: unknown) => sql`UPDATE studio_jobs SET status = 'error', error = ${message(error)}, finished_at = now() WHERE id = ${jobId} AND status = 'running'`;
  let started = false;
  void executeWorkflow(workflowStore, { id: runId, owner, mode: "upload", request: { mapId: row.map_id, resumeJobId: jobId } }, async () => {
    started = true;
    const { runSingleResume } = await import("./single-run/live");
    try {
      const result = await runSingleResume({ jobId, ownerId: owner },
        (p) => updateRun(runId, { phase: p.phase, ...(p.detail !== undefined ? { detail: p.detail } : {}), ...(p.mapId ? { mapId: p.mapId } : {}), ...(p.jobId ? { jobId: p.jobId } : {}) }));
      updateRun(runId, { phase: "done", lessonId: result.lessonId, mapId: result.mapId, jobId: result.jobId, detail: "A tananyag elkészült és közzétéve." });
      return readPublishedLesson(result.lessonId);
    } catch (error) {
      logger.error(`[EGYFUTÁS] A folytatás megállt (${runId}, job ${jobId}): ${error instanceof Error ? error.message : String(error)}`);
      updateRun(runId, { phase: "error", jobId, error: error instanceof Error ? error.message.slice(0, 1500) : "A folytatás megállt." });
      // A motor a saját hibáját a jobra írja; ha a motor el sem indult, a foglalás itt áll vissza (a job nem ragad „fut” állapotban).
      // Review #263: csak az érvényes lízingű végrehajtó állíthatja vissza (egy későbbi folytatás futását nem zárhatja le).
      await db.transaction(async (tx) => { await workflowFence(tx); await tx.execute(release(error)); }).catch(() => undefined);
      throw error;
    }
  }).catch(async (error) => {
    if (error instanceof WorkflowWaiting) return;
    // Review #263: ha a workflow a callback előtt hibázott (sor létrehozása / foglalása), a foglalás itt áll vissza. Ha a callback
    // elindult, a visszaállítás már a kerítés mögött megtörtént — itt nem írunk (egy újabb folytatás futását nem zárhatjuk le).
    if (!started) await db.execute(release(error)).catch(() => undefined);
    void recordOneStepFailure(runId, error);
  });
  logger.warn(`[EGYFUTÁS] ${jobId}: folytatás a mentett részekből → futás ${runId}`);
  return runId;
}

/** A térkép tanítható (megtartott / szerkesztett) fogalmainak száma > 0 — nélküle a gyártás nem indul (nincs fizetős, biztosan bukó futás). */
async function hasTaughtConcepts(mapId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`SELECT 1 FROM km_concepts WHERE map_id = ${mapId} AND review_state IN ('kept', 'edited') LIMIT 1`);
  return rows.length > 0;
}

/**
 * Review #262: egyfutásos gyártás a MEGLÉVŐ térképről, saját futással és workflow-val (a haladásjelző és a felület ugyanúgy követi, mint a
 * feltöltést). `approvedOutline`: a tanár által jóváhagyott vázlat — a terv-állomás ezt veszi át.
 */
export function startMapRun(mapId: string, owner: string, extra: { instruction?: string; approvedOutline?: unknown } = {}): string {
  const runId = createRun();
  updateRun(runId, { phase: "extract", mapId, detail: "A meglévő tudásbank betöltése…" });
  void executeWorkflow(workflowStore, { id: runId, owner, mode: "upload", request: { mapId, ...(extra.instruction ? { instruction: extra.instruction } : {}), approvedOutline: extra.approvedOutline !== undefined } }, async () => {
    const { runSingleFromMap } = await import("./single-run/live");
    try {
      const result = await runSingleFromMap({ mapId, ownerId: owner, ...(extra.instruction ? { instruction: extra.instruction } : {}), ...(extra.approvedOutline !== undefined ? { approvedOutline: extra.approvedOutline } : {}) },
        (p) => updateRun(runId, { phase: p.phase, ...(p.detail !== undefined ? { detail: p.detail } : {}), ...(p.mapId ? { mapId: p.mapId } : {}), ...(p.jobId ? { jobId: p.jobId } : {}) }));
      updateRun(runId, { phase: "done", lessonId: result.lessonId, mapId: result.mapId, jobId: result.jobId, detail: "A tananyag elkészült és közzétéve." });
      return readPublishedLesson(result.lessonId);
    } catch (error) {
      logger.error(`[EGYFUTÁS] A gyártás megállt (${runId}): ${error instanceof Error ? error.message : String(error)}`);
      updateRun(runId, { phase: "error", error: error instanceof Error ? error.message.slice(0, 1500) : "Az egyfutásos gyártás megállt." });
      throw error;
    }
  }).catch((error) => {
    if (error instanceof WorkflowWaiting) return;
    void recordOneStepFailure(runId, error);
  });
  return runId;
}

/**
 * docs/specs/2026-10-16-egy-futas.md (D) + review #262: az újragyártás / folytatás új EGYFUTÁSOS gyártás a job GONDOZOTT térképéről (nincs
 * újrakinyerés), az eredeti tanári kéréssel; jóváhagyott vázlatnál azzal. A régi job atomikusan „újragyártott” lesz (dupla kattintás sem
 * indít kettőt); csak saját / gazdátlan, épp nem vitt job foglalható. Tanítható fogalom nélküli térképnél a foglalás visszaáll.
 */
export async function remakeAsSingleRun(jobId: string, owner: string, extra: { approvedOutline?: unknown } = {}): Promise<string> {
  const claim = await db.execute(sql`UPDATE studio_jobs j SET output = coalesce(j.output, '{}'::jsonb) || '{"recoveryState":"remanufactured"}'::jsonb
    WHERE j.id = ${jobId} AND coalesce(j.output->>'recoveryState', '') NOT IN ('remanufacturing', 'remanufactured', 'discarded')
      AND j.status IN ('error', 'ok') AND j.step <> 'done'
      AND ${notBeingDriven} AND ${manageableBy(owner)}
    RETURNING j.map_id, j.output->>'ownerInstruction' AS instruction`);
  const row = claim.rows[0] as { map_id: string; instruction: string | null } | undefined;
  if (!row) throw new WorkflowConflict("Az újragyártás már elindult, a piszkozat törölve, épp fut, vagy nem a tiéd.");
  if (!(await hasTaughtConcepts(row.map_id))) {
    await db.execute(sql`UPDATE studio_jobs SET output = output - 'recoveryState' WHERE id = ${jobId}`);
    throw new WorkflowConflict("Ehhez a piszkozathoz a tudástárban nincs tanítható fogalom — töltsd fel újra a forrást.");
  }
  const runId = startMapRun(row.map_id, owner, { ...(row.instruction ? { instruction: row.instruction } : {}), ...(extra.approvedOutline !== undefined ? { approvedOutline: extra.approvedOutline } : {}) });
  await db.execute(sql`UPDATE studio_jobs SET output = output || ${JSON.stringify({ remanufacturedAs: `single-run:${runId}` })}::jsonb WHERE id = ${jobId}`);
  logger.warn(`[EGYFUTÁS] ${jobId}: újragyártás egyfutásos motoron a gondozott térképről → futás ${runId}`);
  return runId;
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

/** POST /api/studio/lessons/:id/fix-concept — egy gyenge fogalom célzott újraírása egy beszélgetésben (S4a). */
lessonPipelineRouter.post("/lessons/:id/fix-concept", async (req: Request, res: Response) => {
  const body = z.object({ conceptId: z.string().trim().min(1).max(64) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "conceptId kötelező (1-64 karakter)." });

  const lessonId = req.params.id;
  const actorId = req.user!.id;
  const runId = createRun();
  updateRun(runId, { phase: "author", lessonId, detail: "Fogalomjavítás és a gyakorlóbankok frissítése…" });
  res.status(202).json({ runId, lessonId });
  // A bankcsomagok hívásai nem tarthatnak nyitva HTTP-kérést a proxy időkorlátján túl.
  void executeWorkflow(workflowStore, { id: runId, owner: actorId, mode: "concept", request: { lessonId, conceptId: body.data.conceptId } }, async () => {
    const result = await (await import("./single-run/concept-fix")).fixConceptSingleRun(lessonId, body.data.conceptId, actorId);
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
