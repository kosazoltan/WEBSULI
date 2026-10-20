/**
 * Spec docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md: a 2026-06-01 előtti (régi, HTML) anyagok átalakítása Stúdió-leckévé, HELYBEN
 * (azonos azonosító / link; a régi sor mentésbe kerül a publikáló tranzakcióban). Szerveroldali, újraindításbiztos sor a `scheduled_jobs`
 * táblában; a kapcsoló a kódban van (`off` | `pilot` | `all`), így az indítás és a leállítás egy-egy PR — prod-DB-írás és konfiguráció nélkül.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { htmlFiles, oneStepRuns, scheduledJobs, studioJobs, users } from "../../shared/schema";
import { logger } from "../lib/logger";
import { htmlToText } from "./safe-fetch";

export type LegacyMode = "off" | "pilot" | "all";
/** A kapcsoló — tulajdonosi döntés 2026-10-20: előbb 3 próba, utána mind. */
export const LEGACY_MIGRATION_MODE: LegacyMode = "pilot";
export const LEGACY_CUTOFF = new Date("2026-06-01T00:00:00Z");
export const LEGACY_JOB_TYPE = "legacy-studio-migration";
export const LEGACY_CONCURRENCY = 3;
export const LEGACY_MAX_ATTEMPTS = 2;
/** A szövegkivonat a beágyazott képeket elveszíti: a képgazdag (nagy) anyag kimarad, kézi döntésre. */
export const LEGACY_MAX_BYTES = 300_000;
/** A próba: 4. o. magyar (igekötők), 5. o. matek (törtek), 8. o. matek (szöveges feladatok). */
export const LEGACY_PILOT_IDS: readonly string[] = [
  "1d905a9f-0045-45c8-89d1-bef9365c345f",
  "225c9ec5-13f6-4b4b-876e-35f767a29d84",
  "ca6c41d8-0a4c-4602-898d-c33afb1a3932",
];
/** Tulajdonosi utasítás 2026-10-20: az Abigélhez (a lecke és a PDF-es regény) nem nyúlunk. */
export const LEGACY_EXCLUDED_IDS: readonly string[] = [
  "d1cbfb26-577a-4681-a828-86831a5f9886",
  "8eca0ab6-571b-4562-a84d-3fc05dceb1e2",
];

export type LegacyRow = { id: string; title: string; contentType: string; bytes: number; createdAt: Date; views: number; hasMedia: boolean };
export type LegacyCandidates = { queue: string[]; skipped: Array<{ id: string; title: string; reason: string }> };

/** Tiszta: a jelöltek (a kapcsoló szerint) és a kihagyottak okkal; `all` módban a nézettség szerint csökkenő sorrendben. */
export function legacyCandidates(rows: readonly LegacyRow[], mode: LegacyMode): LegacyCandidates {
  const skipped: LegacyCandidates["skipped"] = [];
  const eligible: LegacyRow[] = [];
  for (const r of rows) {
    if (r.createdAt >= LEGACY_CUTOFF || r.contentType === "lesson") continue;
    const reason = LEGACY_EXCLUDED_IDS.includes(r.id) || /abig[eé]l/i.test(r.title) ? "tulajdonosi kizárás (Abigél)"
      : r.contentType === "pdf" ? "PDF-anyag (külön forrásút)"
      : r.bytes > LEGACY_MAX_BYTES ? `képgazdag / nagy anyag (${Math.round(r.bytes / 1000)} kB) — a szövegkivonat a képeket elveszítené`
      : r.hasMedia ? "hang / videó beágyazás — a lecke elveszítené"
      : null;
    if (reason) skipped.push({ id: r.id, title: r.title, reason });
    else eligible.push(r);
  }
  if (mode === "off") return { queue: [], skipped };
  const pool = mode === "pilot" ? eligible.filter((r) => LEGACY_PILOT_IDS.includes(r.id)) : eligible;
  return { queue: [...pool].sort((a, b) => b.views - a.views || a.createdAt.getTime() - b.createdAt.getTime()).map((r) => r.id), skipped };
}

export type LegacyJobState = { status: string; attempt: number; startedAt: number; runPhase: string | null; runUpdatedAt: Date | null; targetIsLesson: boolean; jobResumable: boolean };
export type LegacyDecision = "done" | "running" | "resume" | "restart" | "error";
const STALE_MS = 45 * 60_000;
/** A futás DB-sora aszinkron íródik: az indítás utáni hiánya még nem leállás. */
const START_GRACE_MS = 10 * 60_000;

/** Tiszta: a futó sorelem állapota az anyag, a futás és a job alapján (újraindítás után is). */
export function reconcileLegacy(s: LegacyJobState, now: number): LegacyDecision {
  if (s.targetIsLesson) return "done";
  if (s.runPhase === null && now - s.startedAt < START_GRACE_MS) return "running";
  // A kész futás, amely mégsem a célt alakította át, nem újrapróbálandó (duplikátum keletkezne) — hiba, kézi vizsgálatra.
  if (s.runPhase === "done") return "error";
  const finished = s.runPhase === "error" || s.runPhase === "done" || s.runPhase === "parked" || s.runPhase === "draft" || s.runPhase === null;
  const stale = s.runUpdatedAt ? now - s.runUpdatedAt.getTime() > STALE_MS : true;
  if (!finished && !stale) return "running";
  if (s.attempt >= LEGACY_MAX_ATTEMPTS) return "error";
  return s.jobResumable ? "resume" : "restart";
}

/** Tiszta: a régi anyag szövege forrásként, és a gyártási utasítás. */
export function legacySource(file: { title: string; content: string }): { files: Array<{ name: string; kind: "text"; content: string }>; instructions: string } {
  const { text } = htmlToText(file.content);
  const name = `${file.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 200) || "regi-anyag"}.txt`;
  return {
    files: [{ name, kind: "text", content: `${file.title}\n\n${text}` }],
    instructions: "A forrás egy korábbi, interaktív Websuli-tananyag kivonata. A benne TANÍTOTT tartalmat dolgozd fel teljes mélységben "
      + "(fogalmak, példák, feladatok témái); a weboldal kezelőfelületének szövegeit (gombok, pontszámítás, menük) hagyd figyelmen kívül. "
      + "Az évfolyamot a tartalomból állapítsd meg.",
  };
}

type QueueRow = { id: string; status: string; payload: { htmlFileId: string; runId?: string; attempt?: number; startedAt?: number } };

async function ownerFor(fileUserId: string | null): Promise<string | null> {
  if (fileUserId) {
    const [u] = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, fileUserId)).limit(1);
    if (u?.isAdmin) return u.id;
  }
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).limit(1);
  return admin?.id ?? null;
}

async function startFresh(htmlFileId: string): Promise<string> {
  const [file] = await db.select({ title: htmlFiles.title, content: htmlFiles.content, userId: htmlFiles.userId }).from(htmlFiles).where(eq(htmlFiles.id, htmlFileId)).limit(1);
  if (!file) throw new Error("a régi anyag nem található");
  const owner = await ownerFor(file.userId);
  if (!owner) throw new Error("nincs admin készítő");
  const source = legacySource(file);
  const { startOneStepRun } = await import("./lesson-pipeline-routes");
  return startOneStepRun({ title: file.title, instructions: source.instructions, files: source.files }, owner, htmlFileId);
}

async function resumeJob(jobId: string, htmlFileId: string): Promise<string> {
  const [file] = await db.select({ userId: htmlFiles.userId }).from(htmlFiles).where(eq(htmlFiles.id, htmlFileId)).limit(1);
  const owner = await ownerFor(file?.userId ?? null);
  if (!owner) throw new Error("nincs admin készítő");
  const { resumeSingleRun } = await import("./lesson-pipeline-routes");
  return resumeSingleRun(jobId, owner);
}

const setJob = (id: string, patch: Partial<{ status: string; payload: QueueRow["payload"]; error: string | null; completedAt: Date | null }>) =>
  db.update(scheduledJobs).set(patch).where(eq(scheduledJobs.id, id));

let ticking = false;
/** Egy kör: egyeztetés, utána a szabad helyek feltöltése. */
export async function legacyMigrationTick(now = Date.now()): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const rows = (await db.select({ id: scheduledJobs.id, status: scheduledJobs.status, payload: scheduledJobs.payload }).from(scheduledJobs)
      .where(eq(scheduledJobs.type, LEGACY_JOB_TYPE))) as QueueRow[];
    let running = 0;
    for (const row of rows.filter((r) => r.status === "running")) {
      const { htmlFileId, runId, attempt = 1, startedAt = 0 } = row.payload;
      const [file] = await db.select({ contentType: htmlFiles.contentType }).from(htmlFiles).where(eq(htmlFiles.id, htmlFileId)).limit(1);
      const [run] = runId ? await db.select({ phase: oneStepRuns.phase, updatedAt: oneStepRuns.updatedAt, jobId: oneStepRuns.jobId, error: oneStepRuns.error }).from(oneStepRuns).where(eq(oneStepRuns.id, runId)).limit(1) : [];
      let resumable = false;
      if (run?.jobId) {
        const [job] = await db.select({ status: studioJobs.status, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, run.jobId)).limit(1);
        const { singleRunResumable } = await import("./single-run/engine");
        resumable = job?.status === "error" && singleRunResumable((job.output ?? {}) as Record<string, unknown>);
      }
      const decision = reconcileLegacy({ status: row.status, attempt, startedAt, runPhase: run?.phase ?? null, runUpdatedAt: run?.updatedAt ?? null, targetIsLesson: file?.contentType === "lesson", jobResumable: resumable }, now);
      if (decision === "running") { running++; continue; }
      if (decision === "done") {
        await setJob(row.id, { status: "done", completedAt: new Date(), error: null });
        logger.info(`[RÉGI→STÚDIÓ] Kész: ${htmlFileId} (${attempt}. kísérlet)`);
        continue;
      }
      if (decision === "error") {
        await setJob(row.id, { status: "error", completedAt: new Date(), error: (run?.phase === "done" ? "a futás kész, de a cél nem lett lecke (kézi vizsgálat)" : run?.error ?? "a futás megállt").slice(0, 2000) });
        logger.warn(`[RÉGI→STÚDIÓ] Hiba, nincs több kísérlet: ${htmlFileId}: ${run?.error ?? "?"}`);
        continue;
      }
      try {
        const next = decision === "resume" && run?.jobId ? await resumeJob(run.jobId, htmlFileId) : await startFresh(htmlFileId);
        await setJob(row.id, { payload: { htmlFileId, runId: next, attempt: attempt + 1, startedAt: Date.now() } });
        logger.info(`[RÉGI→STÚDIÓ] ${decision === "resume" ? "Folytatás" : "Újrakezdés"} (${attempt + 1}. kísérlet): ${htmlFileId} — előző hiba: ${run?.error ?? "?"}`);
        running++;
      } catch (error) {
        await setJob(row.id, { status: "error", completedAt: new Date(), error: `újrapróba nem indítható: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2000) });
      }
    }
    if (LEGACY_MIGRATION_MODE === "off" || running >= LEGACY_CONCURRENCY) return;
    const { rows: fileRows } = await db.execute(sql`SELECT h.id, h.title, h.content_type, length(h.content) AS bytes, h.created_at,
        (h.content ILIKE '%<audio%' OR h.content ILIKE '%<video%') AS has_media,
        (SELECT count(*) FROM material_views v WHERE v.material_id = h.id) AS views
      FROM html_files h WHERE h.created_at < ${LEGACY_CUTOFF.toISOString()}`);
    const { queue } = legacyCandidates((fileRows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), title: String(r.title), contentType: String(r.content_type), bytes: Number(r.bytes), createdAt: new Date(String(r.created_at)),
      views: Number(r.views ?? 0), hasMedia: Boolean(r.has_media),
    })), LEGACY_MIGRATION_MODE);
    const queued = new Set(rows.map((r) => r.payload.htmlFileId));
    for (const htmlFileId of queue) {
      if (running >= LEGACY_CONCURRENCY) break;
      if (queued.has(htmlFileId)) continue;
      // A sorelem ELŐBB kerül be (a kettős indítás ellen), utána indul a gyártás.
      const [job] = await db.insert(scheduledJobs).values({ type: LEGACY_JOB_TYPE, scheduledFor: new Date(), status: "running", payload: { htmlFileId, attempt: 1, startedAt: Date.now() } }).returning({ id: scheduledJobs.id });
      try {
        const runId = await startFresh(htmlFileId);
        await setJob(job.id, { payload: { htmlFileId, runId, attempt: 1, startedAt: Date.now() } });
        logger.info(`[RÉGI→STÚDIÓ] Indul: ${htmlFileId} (futás ${runId})`);
        running++;
      } catch (error) {
        await setJob(job.id, { status: "error", completedAt: new Date(), error: `nem indítható: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2000) });
      }
    }
  } finally {
    ticking = false;
  }
}

/** Indítás a szerverből (az e2e-módon kívül): 2 perc múlva először (a boot söprései előbb lefutnak), utána percenként. */
export function startLegacyMigration(): void {
  const tick = () => void legacyMigrationTick().catch((error) => logger.error(`[RÉGI→STÚDIÓ] A kör hibája: ${error instanceof Error ? error.message : String(error)}`));
  setTimeout(() => { tick(); setInterval(tick, 60_000).unref(); }, 120_000).unref();
}

/** A mérés / jelentés: a sor állapota anyagonként (csak olvasás). */
export async function legacyMigrationStatus() {
  return db.select({ status: scheduledJobs.status, payload: scheduledJobs.payload, error: scheduledJobs.error }).from(scheduledJobs)
    .where(and(eq(scheduledJobs.type, LEGACY_JOB_TYPE), inArray(scheduledJobs.status, ["running", "done", "error"])));
}
