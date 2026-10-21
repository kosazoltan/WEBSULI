/**
 * Spec docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md: a 2026-06-01 előtti (régi, HTML) anyagok átalakítása Stúdió-leckévé, HELYBEN
 * (azonos azonosító / link; a régi sor mentésbe kerül a publikáló tranzakcióban). Szerveroldali, újraindításbiztos sor a `scheduled_jobs`
 * táblában; a kapcsoló a kódban van (`off` | `pilot` | `all`), így az indítás és a leállítás egy-egy PR — prod-DB-írás és konfiguráció nélkül.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { htmlFiles, oneStepRuns, scheduledJobs, studioJobs, users } from "../../shared/schema";
import { logger } from "../lib/logger";
import { htmlToText } from "./safe-fetch";

export type LegacyMode = "off" | "pilot" | "all";
/** A kapcsoló — tulajdonosi döntés 2026-10-20: előbb 3 próba, utána mind. */
export const LEGACY_MIGRATION_MODE: LegacyMode = "all";
/** Review #349: a határnap Budapest szerinti éjfél (2026. június 1-jén UTC+2). */
export const LEGACY_CUTOFF = new Date("2026-06-01T00:00:00+02:00");
export const LEGACY_JOB_TYPE = "legacy-studio-migration";
export const LEGACY_CONCURRENCY = 3;
export const LEGACY_MAX_ATTEMPTS = 2;
/** A szövegkivonat a beágyazott képeket elveszíti: a képgazdag (nagy) anyag kimarad, kézi döntésre (bájtban mérve). */
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

export type LegacyRow = { id: string; title: string; contentType: string; bytes: number; createdAt: Date; views: number; hasMedia: boolean; hasEmbed?: boolean };
export type LegacyCandidates = { queue: string[]; skipped: Array<{ id: string; title: string; reason: string }> };

/** Tiszta: a jelöltek (a kapcsoló szerint) és a kihagyottak okkal; a nézettség szerint csökkenő sorrendben. */
export function legacyCandidates(rows: readonly LegacyRow[], mode: LegacyMode): LegacyCandidates {
  const skipped: LegacyCandidates["skipped"] = [];
  const eligible: LegacyRow[] = [];
  for (const r of rows) {
    if (r.createdAt >= LEGACY_CUTOFF || r.contentType === "lesson") continue;
    const reason = LEGACY_EXCLUDED_IDS.includes(r.id) || /abig[eé]l/i.test(r.title) ? "tulajdonosi kizárás (Abigél)"
      : r.contentType === "pdf" ? "PDF-anyag (külön forrásút)"
      : r.bytes > LEGACY_MAX_BYTES ? `képgazdag / nagy anyag (${Math.round(r.bytes / 1000)} kB) — a szövegkivonat a képeket elveszítené`
      : r.hasMedia ? "hang / videó beágyazás — a lecke elveszítené"
      : r.hasEmbed ? "kép / beágyazott keret — a szövegkivonat elveszítené"
      : null;
    if (reason) skipped.push({ id: r.id, title: r.title, reason });
    else eligible.push(r);
  }
  if (mode === "off") return { queue: [], skipped };
  const pool = mode === "pilot" ? eligible.filter((r) => LEGACY_PILOT_IDS.includes(r.id)) : eligible;
  return { queue: [...pool].sort((a, b) => b.views - a.views || a.createdAt.getTime() - b.createdAt.getTime()).map((r) => r.id), skipped };
}

export type LegacyJobState = { attempt: number; startedAt: number; runPhase: string | null; runUpdatedAt: Date | null; leaseAlive: boolean; targetIsLesson: boolean; jobResumable: boolean;
  /** Review #350: a Stúdió-job épp fut (pl. egy másik példány folytatása) — élő, nem indul mellé újabb. */
  jobRunning?: boolean };
export type LegacyDecision = "done" | "running" | "waiting" | "resume" | "restart" | "error";
const STALE_MS = 45 * 60_000;
/** A futás DB-sora aszinkron íródik: az indítás utáni hiánya még nem leállás. */
const START_GRACE_MS = 10 * 60_000;

/** Tiszta: a futó sorelem állapota az anyag, a futás és a job alapján (újraindítás után is). */
export function reconcileLegacy(s: LegacyJobState, now: number): LegacyDecision {
  if (s.targetIsLesson) return "done";
  // Review #349: az élő lízing (a végrehajtó szívverése) a futás jele, akkor is, ha a fázis rég nem változott.
  if (s.leaseAlive || s.jobRunning) return "running";
  if (s.runPhase === null && now - s.startedAt < START_GRACE_MS) return "running";
  // A kész futás, amely mégsem a célt alakította át, nem újrapróbálandó (duplikátum keletkezne) — hiba, kézi vizsgálatra.
  if (s.runPhase === "done") return "error";
  // Review #349: emberi döntésre váró futás — nem indul újra, a kísérletet nem fogyasztja, a helyet felszabadítja.
  if (s.runPhase === "parked" || s.runPhase === "draft") return "waiting";
  const finished = s.runPhase === "error" || s.runPhase === null;
  const stale = s.runUpdatedAt ? now - s.runUpdatedAt.getTime() > STALE_MS : true;
  if (!finished && !stale) return "running";
  if (s.attempt >= LEGACY_MAX_ATTEMPTS) return "error";
  return s.jobResumable ? "resume" : "restart";
}

/** A régi anyag tartalmának lenyomata: a publikálás csak akkor cseréli, ha közben nem változott (review #349). */
export const legacyBaseline = (content: string) => createHash("sha256").update(content).digest("hex");

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

type Payload = { htmlFileId: string; runId?: string; attempt?: number; startedAt?: number; requeued?: boolean };

/** Spec 2026-10-21-fogalom-tipus-hossz: a csak a tudásbank-oszlophatár miatt hibára zárt elem egyszer újra sorba kerül. */
export function shouldRequeue(row: { status: string; error: string | null; payload: { requeued?: boolean } }): boolean {
  return row.status === "error" && !row.payload.requeued && (row.error ?? "").startsWith('Failed query: insert into "km_concepts"');
}
type QueueRow = { id: string; status: string; payload: Payload };

async function ownerFor(fileUserId: string | null): Promise<string | null> {
  if (fileUserId) {
    const [u] = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, fileUserId)).limit(1);
    if (u?.isAdmin) return u.id;
  }
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).limit(1);
  return admin?.id ?? null;
}

/** A futás indítása a MÁR rögzített azonosítóval (review #349: a sor előbb rögzít, utána indít). */
async function startFresh(htmlFileId: string, runId: string): Promise<void> {
  const [file] = await db.select({ title: htmlFiles.title, content: htmlFiles.content, userId: htmlFiles.userId }).from(htmlFiles).where(eq(htmlFiles.id, htmlFileId)).limit(1);
  if (!file) throw new Error("a régi anyag nem található");
  const owner = await ownerFor(file.userId);
  if (!owner) throw new Error("nincs admin készítő");
  const source = legacySource(file);
  const { startOneStepRun } = await import("./lesson-pipeline-routes");
  startOneStepRun({ title: file.title, instructions: source.instructions, files: source.files }, owner, { htmlFileId, baseline: legacyBaseline(file.content) }, runId);
}

async function resumeJob(jobId: string, htmlFileId: string): Promise<string> {
  const [file] = await db.select({ userId: htmlFiles.userId }).from(htmlFiles).where(eq(htmlFiles.id, htmlFileId)).limit(1);
  const owner = await ownerFor(file?.userId ?? null);
  if (!owner) throw new Error("nincs admin készítő");
  const { resumeSingleRun } = await import("./lesson-pipeline-routes");
  return resumeSingleRun(jobId, owner);
}

/**
 * Review #349: a sorelem ATOMI foglalása (több példány / deploy-átfedés ellen): csak az a végrehajtó lép tovább, amelyik a várt
 * előállapotból (futás-azonosító) frissít.
 */
async function claimRetry(row: QueueRow, next: Payload): Promise<boolean> {
  const { rows } = await db.execute(sql`UPDATE scheduled_jobs SET payload = ${JSON.stringify(next)}::jsonb
    WHERE id = ${row.id} AND status = 'running' AND coalesce(payload->>'runId', '') = ${row.payload.runId ?? ""} RETURNING id`);
  return rows.length === 1;
}

const LOCK_KEY = sql`hashtext(${LEGACY_JOB_TYPE})`;
const finish = (id: string, status: "done" | "error" | "waiting", error: string | null) =>
  db.update(scheduledJobs).set({ status, error, completedAt: new Date() }).where(and(eq(scheduledJobs.id, id), eq(scheduledJobs.status, "running")));

let ticking = false;
let skippedLogged = false;
/** Review #349: leállításkor új kör (és benne új gyártás) nem indul. */
let stopped = false;
/** Egy kör: egyeztetés, utána a szabad helyek feltöltése. Visszaad: van-e még teendő (futó elem vagy jelölt) — tétlenül ritkább kör. */
export async function legacyMigrationTick(now = Date.now()): Promise<boolean> {
  if (ticking || stopped) return true;
  ticking = true;
  try {
    let rows = (await db.select({ id: scheduledJobs.id, status: scheduledJobs.status, payload: scheduledJobs.payload, error: scheduledJobs.error }).from(scheduledJobs)
      .where(eq(scheduledJobs.type, LEGACY_JOB_TYPE))) as Array<QueueRow & { error: string | null }>;
    if (LEGACY_MIGRATION_MODE !== "off") {
      for (const row of rows.filter(shouldRequeue)) {
        await db.execute(sql`UPDATE scheduled_jobs SET status = 'running', error = NULL, completed_at = NULL,
          payload = ${JSON.stringify({ htmlFileId: row.payload.htmlFileId, attempt: 0, startedAt: 0, requeued: true })}::jsonb
          WHERE id = ${row.id} AND status = 'error' AND coalesce(payload->>'requeued', '') <> 'true'`);
        logger.info(`[RÉGI→STÚDIÓ] Újra sorba (a tudásbank-oszlophatár javítása után): ${row.payload.htmlFileId}`);
      }
      rows = rows.map((r) => (shouldRequeue(r) ? { ...r, status: "running", payload: { htmlFileId: r.payload.htmlFileId, attempt: 0, startedAt: 0, requeued: true } } : r));
    }
    let running = 0;
    const retries: Array<{ row: QueueRow; decision: "resume" | "restart"; jobId: string | null; error: string | null }> = [];
    for (const row of rows.filter((r) => r.status === "running")) {
      const { htmlFileId, runId, attempt = 1, startedAt = 0 } = row.payload;
      const [file] = await db.select({ contentType: htmlFiles.contentType }).from(htmlFiles).where(eq(htmlFiles.id, htmlFileId)).limit(1);
      const [run] = runId ? await db.select({ phase: oneStepRuns.phase, updatedAt: oneStepRuns.updatedAt, jobId: oneStepRuns.jobId, error: oneStepRuns.error }).from(oneStepRuns).where(eq(oneStepRuns.id, runId)).limit(1) : [];
      const lease = runId ? await db.execute(sql`SELECT 1 FROM lesson_workflow_runs WHERE id = ${runId} AND lease_until > now() LIMIT 1`) : { rows: [] };
      let resumable = false;
      let jobRunning = false;
      if (run?.jobId) {
        const [job] = await db.select({ status: studioJobs.status, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, run.jobId)).limit(1);
        const { singleRunResumable } = await import("./single-run/engine");
        resumable = job?.status === "error" && singleRunResumable((job.output ?? {}) as Record<string, unknown>);
        jobRunning = job?.status === "running";
      }
      const decision = reconcileLegacy({ attempt, startedAt, runPhase: run?.phase ?? null, runUpdatedAt: run?.updatedAt ?? null, leaseAlive: lease.rows.length > 0,
        targetIsLesson: file?.contentType === "lesson", jobResumable: resumable, jobRunning }, now);
      if (decision === "running") { running++; continue; }
      if (decision === "done") { await finish(row.id, "done", null); logger.info(`[RÉGI→STÚDIÓ] Kész: ${htmlFileId} (${attempt}. kísérlet)`); continue; }
      if (decision === "waiting") { await finish(row.id, "waiting", `emberi döntésre vár (${run?.phase}): ${run?.error ?? ""}`.slice(0, 2000)); continue; }
      if (decision === "error") {
        await finish(row.id, "error", (run?.phase === "done" ? "a futás kész, de a cél nem lett lecke (kézi vizsgálat)" : run?.error ?? "a futás megállt").slice(0, 2000));
        logger.warn(`[RÉGI→STÚDIÓ] Hiba, nincs több kísérlet: ${htmlFileId}: ${run?.error ?? "?"}`);
        continue;
      }
      retries.push({ row, decision, jobId: run?.jobId ?? null, error: run?.error ?? null });
    }
    // Review #349: `off` módban újrapróba sem indul; a párhuzamosság az újrapróbákra is érvényes (azok elsőbbséget kapnak).
    if (LEGACY_MIGRATION_MODE === "off") return running > 0;
    for (const { row, decision, jobId, error } of retries) {
      if (running >= LEGACY_CONCURRENCY || stopped) break;
      const { htmlFileId, attempt = 1 } = row.payload;
      try {
        if (decision === "resume" && jobId) {
          // Review #350: a sorelem ELŐBB foglalódik (helyőrző azonosítóval), csak a nyertes folytat; utána a valódi futás-azonosító kerül be.
          const placeholder = `resume-${randomUUID()}`;
          if (!await claimRetry(row, { htmlFileId, runId: placeholder, attempt: attempt + 1, startedAt: Date.now() })) continue;
          const next = await resumeJob(jobId, htmlFileId);
          await db.execute(sql`UPDATE scheduled_jobs SET payload = jsonb_set(payload, '{runId}', to_jsonb(${next}::text)) WHERE id = ${row.id} AND payload->>'runId' = ${placeholder}`);
        } else {
          const runId = randomUUID();
          if (!await claimRetry(row, { htmlFileId, runId, attempt: attempt + 1, startedAt: Date.now() })) continue;
          await startFresh(htmlFileId, runId);
        }
        logger.info(`[RÉGI→STÚDIÓ] ${decision === "resume" ? "Folytatás" : "Újrakezdés"} (${attempt + 1}. kísérlet): ${htmlFileId} — előző hiba: ${error ?? "?"}`);
        running++;
      } catch (e) {
        // A foglalás megmaradt (futás-azonosítóval): a türelmi idő után a következő kör dönt — nem ragad be, nem indul kétszer.
        logger.warn(`[RÉGI→STÚDIÓ] Újrapróba nem indult (${htmlFileId}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (running >= LEGACY_CONCURRENCY) return true;
    const { rows: fileRows } = await db.execute(sql`SELECT h.id, h.title, h.content_type, octet_length(h.content) AS bytes, h.created_at,
        (h.content ILIKE '%<audio%' OR h.content ILIKE '%<video%') AS has_media,
        (h.content ILIKE '%<img%' OR h.content ILIKE '%<iframe%' OR h.content ILIKE '%<embed%' OR h.content ILIKE '%<object%') AS has_embed,
        (SELECT count(*) FROM material_views v WHERE v.material_id = h.id) AS views
      FROM html_files h WHERE h.created_at < ${LEGACY_CUTOFF.toISOString()}`);
    const { queue, skipped } = legacyCandidates((fileRows as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), title: String(r.title), contentType: String(r.content_type), bytes: Number(r.bytes), createdAt: new Date(String(r.created_at)),
      views: Number(r.views ?? 0), hasMedia: Boolean(r.has_media), hasEmbed: Boolean(r.has_embed),
    })), LEGACY_MIGRATION_MODE);
    if (!skippedLogged) {
      skippedLogged = true;
      for (const s of skipped) logger.info(`[RÉGI→STÚDIÓ] Kimarad: ${s.id} „${s.title}” — ${s.reason}`);
    }
    const queuedIds = new Set(rows.map((r) => r.payload.htmlFileId));
    const pending = queue.filter((id) => !queuedIds.has(id));
    for (const htmlFileId of pending) {
      if (running >= LEGACY_CONCURRENCY || stopped) break;
      // Review #349: atomi foglalás tranzakciós zárral — két példány nem foglalhatja ugyanazt az anyagot; a futás-azonosító ELŐBB rögzül.
      const runId = randomUUID();
      const claimed = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
        const { rows: exists } = await tx.execute(sql`SELECT 1 FROM scheduled_jobs WHERE type = ${LEGACY_JOB_TYPE} AND payload->>'htmlFileId' = ${htmlFileId} LIMIT 1`);
        if (exists.length) return false;
        const { rows: active } = await tx.execute(sql`SELECT count(*)::int AS n FROM scheduled_jobs WHERE type = ${LEGACY_JOB_TYPE} AND status = 'running'`);
        if (Number((active[0] as { n?: number } | undefined)?.n ?? 0) >= LEGACY_CONCURRENCY) return false;
        await tx.insert(scheduledJobs).values({ type: LEGACY_JOB_TYPE, scheduledFor: new Date(), status: "running", payload: { htmlFileId, runId, attempt: 1, startedAt: Date.now() } });
        return true;
      });
      if (!claimed) continue;
      try {
        await startFresh(htmlFileId, runId);
        logger.info(`[RÉGI→STÚDIÓ] Indul: ${htmlFileId} (futás ${runId})`);
      } catch (error) {
        // Review #349: az indítási hiba nem végleges — a foglalás marad, a türelmi idő után újrapróba (a keret szerint).
        logger.warn(`[RÉGI→STÚDIÓ] Az indítás nem sikerült (${htmlFileId}): ${error instanceof Error ? error.message : String(error)}`);
      }
      running++;
    }
    return running > 0 || pending.length > 0 || retries.length > 0;
  } finally {
    ticking = false;
  }
}

/** Munka közben percenként; tétlenül (nincs futó elem, sem jelölt) a Neon 5 perces elalvási küszöbénél ritkábban (review #349). */
export const LEGACY_BUSY_MS = 60_000;
export const LEGACY_IDLE_MS = 30 * 60_000;
let timer: NodeJS.Timeout | null = null;

/** Indítás a szerverből (az e2e-módon kívül): 2 perc múlva először (a boot söprései előbb lefutnak); `off` módban el sem indul. */
export function startLegacyMigration(): void {
  if (LEGACY_MIGRATION_MODE === "off") return;
  const schedule = (ms: number) => { if (!stopped) { timer = setTimeout(run, ms); timer.unref(); } };
  const run = () => void legacyMigrationTick()
    .then((busy) => schedule(busy ? LEGACY_BUSY_MS : LEGACY_IDLE_MS))
    .catch((error) => { logger.error(`[RÉGI→STÚDIÓ] A kör hibája: ${error instanceof Error ? error.message : String(error)}`); schedule(LEGACY_BUSY_MS); });
  schedule(120_000);
}

/** Review #349: a leállítás ELEJÉN — az időzítő törlődik, és a futó kör sem indít több gyártást. */
export function stopLegacyMigration(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
