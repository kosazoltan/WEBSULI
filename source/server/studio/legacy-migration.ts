/**
 * Spec docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md: a 2026-06-01 előtti (régi, HTML) anyagok átalakítása Stúdió-leckévé, HELYBEN
 * (azonos azonosító / link; a régi sor mentésbe kerül a publikáló tranzakcióban). Szerveroldali, újraindításbiztos sor a `scheduled_jobs`
 * táblában; a kapcsoló a kódban van (`off` | `pilot` | `all`), így az indítás és a leállítás egy-egy PR — prod-DB-írás és konfiguráció nélkül.
 */
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { htmlFiles, oneStepRuns, scheduledJobs, studioJobs, users } from "../../shared/schema";
import { SCORING_RULE_MARK } from "../../shared/scoring-rules";
import { logger } from "../lib/logger";
import { htmlToText } from "./safe-fetch";

export type LegacyMode = "off" | "pilot" | "all";
/** A kapcsoló — tulajdonosi döntés 2026-10-20: előbb 3 próba, utána mind. */
export const LEGACY_MIGRATION_MODE: LegacyMode = "all";
/** Review #349: a határnap Budapest szerinti éjfél. Spec 2026-10-21-ciklus6b óta TÖRTÉNETI (a jelöltek köre nem szűr rá; az eredeti hatókör jelölése). */
export const LEGACY_CUTOFF = new Date("2026-06-01T00:00:00+02:00");
/**
 * Spec 2026-10-21-ciklus6b + review #358: a hatókör felső határa — a tulajdonosi döntés (2026-10-21 14:40) idején már meglévő anyagok. A később
 * feltöltött HTML anyag NEM alakul át magától (különben minden új feltöltés a sorba kerülne).
 */
export const LEGACY_SCOPE_END = new Date("2026-10-21T15:00:00+02:00");
export const LEGACY_JOB_TYPE = "legacy-studio-migration";
export const LEGACY_CONCURRENCY = 3;
export const LEGACY_MAX_ATTEMPTS = 2;
/**
 * Spec 2026-10-21-regi-anyag-ciklusos-felulvizsgalat: a sorelemek felső száma — a sor eddig indít új anyagot, utána megáll (az újrapróba a
 * meglévő elemen belül marad). Minden felülvizsgálati ciklus (5 anyag) egy PR-rel emeli; így a deploy mindig futásmentes állapotban megy.
 */
export const LEGACY_BATCH_LIMIT = 178;

/**
 * Spec 2026-10-21-ciklus6 (tulajdonosi döntés): a két tartalmi okból kétszer elbukott anyag egyszeri, célzott újragyártása — a forrás
 * melletti utasítás a lektor visszatérő kifogását előzi meg.
 */
export const LEGACY_REDO: Readonly<Record<string, string>> = {
  // A főnév – Magyar nyelvtan 4. osztály (a lektor: a -val/-vel ragos példára az „anyának” is teljes pontot kapott).
  "7f9083e5-b1f9-4fe0-8c94-376ed61d228c": "A ragos alakokat gyakoroltató feladatoknál a pontozás CSAK a kérdezett rag pontos alakját fogadja el "
    + "teljes ponttal (pl. -val/-vel ragnál az „anyával”, nem az „anyának”); a más raggal ellátott alak hibás válasz.",
  // Spec 2026-10-21-ciklus8: Programozási alapismeretek – VS Code & GitHub („apiKey” / „ApiKey” ismétlődésnek látszott — javítva).
  "3j1DnOnG1Lts-YPCic70R": "A programkód-azonosítóknál (változó-, függvény-, kulcsnév) a kis- és nagybetű különbözik; az ilyen kérdés "
    + "válaszlehetőségeinek írásmódja pontosan a kódban használt alak legyen.",
  // Spec 2026-10-21-ciklus8: Az Erdő – Környezetismeret 4. osztály (a tudásbank „őz” kulcsfogalmát egyetlen blokk sem tanította).
  "02d9aecf-65cc-4b73-af57-6f1009211736": "A tudásbank MINDEN kulcsfogalmát (köztük az erdő állatait, pl. az őzet) tanítsa legalább egy tanítási "
    + "blokk a fogalom nevével.",
  // Spec 2026-10-21-rovid-fogalom-ekezet: időhatározói elöljárószók (AT / ON / IN) — a kapu a rövid nevű fogalmat hamisan jelezte.
  "345a84d9-9d3a-4f4c-9e7b-622e53a7d01d": "Az időhatározói elöljárószókat (AT, ON, IN) a forrás saját példáival tanítsa (pl. at noon, on Monday, "
    + "in July), természetes magyar magyarázattal.",
  // 4. osztály – Tulajdonságot kifejező szavak (a lektor: a mintaválasz önkényes szavai lettek kötelezők).
  "59f1ce9a-92e5-4908-82fa-1027d82583bf": "A mondatalkotó, szabadon megfogalmazható feladatoknál a kötelező (required) fogalmak CSAK a kérdés által "
    + "megkövetelt elemek (pl. a kért tulajdonságot kifejező szó); a mintaválasz többi szava (névelő, ige, tárgy) soha ne legyen kötelező.",
};
/**
 * Spec 2026-10-21-ciklus7: a célzott újragyártás köre. Az 1. kör (ciklus 6, `redo: true`) a pontos-alak hiánya miatt elbukott; a 2. kör a
 * pontos-alak szigorítással fut (tulajdonosi jóváhagyás). Körönként egyszer. Spec 2026-10-21-rovid-fogalom-ekezet: 4. kör — Az Erdő és
 * az elöljárós anyag a javított rövid-név kapuval.
 */
export const LEGACY_REDO_ROUND = 4;
/** A sorelem célzott köre: a régi `true` az 1. kör. */
export const redoRoundOf = (redo: boolean | number | undefined): number => (redo === true ? 1 : typeof redo === "number" ? redo : 0);
/** Review #357: a listás anyag MINDEN újraindítása (az infrastruktúra-hiba miatti is) célzott — a redo-jelző körönként egyszeri futást biztosít. */
const redoFlag = (htmlFileId: string) => (Object.prototype.hasOwnProperty.call(LEGACY_REDO, htmlFileId) ? { redo: LEGACY_REDO_ROUND } : {});
/** Spec 2026-10-21-ciklus6: a hibás, célzott újragyártásra kijelölt, még újra nem gyártott sorelem. */
export const shouldRedo = (row: { status: string; payload: { htmlFileId: string; redo?: boolean | number } }): boolean =>
  row.status === "error" && redoRoundOf(row.payload.redo) < LEGACY_REDO_ROUND && Object.prototype.hasOwnProperty.call(LEGACY_REDO, row.payload.htmlFileId);
// Review #352: a következő ciklus korlátja a TÉNYLEGES sorelemszám + 5 (nem az előző korlát + 5) — a korlát fölötti (pl. újrapróbált)
// elem miatt a ciklus nem lehet 5-nél rövidebb.
/** Tiszta: hány új anyag indulhat még a korlátig. */
export const batchRoom = (totalRows: number, limit = LEGACY_BATCH_LIMIT) => Math.max(0, limit - totalRows);
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
    // Spec 2026-10-21-ciklus6b (tulajdonosi döntés): a határnap utáni régi formátumú HTML anyag is jelölt — csak a lecke típus kimarad.
    if (r.contentType === "lesson" || r.createdAt >= LEGACY_SCOPE_END) continue;
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
  jobRunning?: boolean;
  /** Spec 2026-10-21-ciklus2: a Stúdió-job `error` — lejárt bérlettel ez leállt futás (nincs 45 perces várakozás). */
  jobFailed?: boolean };
export type LegacyDecision = "done" | "running" | "waiting" | "resume" | "restart" | "error";
const STALE_MS = 45 * 60_000;
/** A futás DB-sora aszinkron íródik: az indítás utáni hiánya még nem leállás. */
const START_GRACE_MS = 10 * 60_000;

/** Tiszta: a futó sorelem állapota az anyag, a futás és a job alapján (újraindítás után is). */
export function reconcileLegacy(s: LegacyJobState, now: number): LegacyDecision {
  if (s.targetIsLesson) return "done";
  // Review #349: az élő lízing (a végrehajtó szívverése) a futás jele, akkor is, ha a fázis rég nem változott.
  if (s.leaseAlive || s.jobRunning) return "running";
  // Review #354: a hibás job (nem élő bérlettel) a türelmi idő ELŐTT dönt — a futás-sor hiánya ilyenkor nem „még íródik”, hanem leállás.
  if (s.runPhase === null && now - s.startedAt < START_GRACE_MS && !s.jobFailed) return "running";
  // A kész futás, amely mégsem a célt alakította át, nem újrapróbálandó (duplikátum keletkezne) — hiba, kézi vizsgálatra.
  if (s.runPhase === "done") return "error";
  // Review #349: emberi döntésre váró futás — nem indul újra, a kísérletet nem fogyasztja, a helyet felszabadítja.
  if (s.runPhase === "parked" || s.runPhase === "draft") return "waiting";
  // Spec 2026-10-21-ciklus2: a hibás job + nem élő bérlet = leállt futás, akkor is, ha a futás fázisa (a deploy miatt) nem záródott le.
  const finished = s.runPhase === "error" || s.runPhase === null || s.jobFailed === true;
  const stale = s.runUpdatedAt ? now - s.runUpdatedAt.getTime() > STALE_MS : true;
  if (!finished && !stale) return "running";
  if (s.attempt >= LEGACY_MAX_ATTEMPTS) return "error";
  return s.jobResumable ? "resume" : "restart";
}

/**
 * Spec 2026-10-21-ciklus5: a „running” job csak akkor fut, ha a futása nem hibás, vagy a job él (`jobActive`: valamely futásának bérlete él,
 * VAGY valamely futása a türelmi időn belül frissült — review #356: a folytatás még bérlet nélkül is élőnek számít).
 */
export const jobStillRunning = (jobStatus: string | undefined, runPhase: string | null, jobActive: boolean) =>
  jobStatus === "running" && (runPhase !== "error" || jobActive);

/** A régi anyag tartalmának lenyomata: a publikálás csak akkor cseréli, ha közben nem változott (review #349). */
export const legacyBaseline = (content: string) => createHash("sha256").update(content).digest("hex");

/** Tiszta: a régi anyag szövege forrásként, és a gyártási utasítás. */
export function legacySource(file: { title: string; content: string }, extra?: string): { files: Array<{ name: string; kind: "text"; content: string }>; instructions: string } {
  const { text } = htmlToText(file.content);
  const name = `${file.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 200) || "regi-anyag"}.txt`;
  return {
    files: [{ name, kind: "text", content: `${file.title}\n\n${text}` }],
    instructions: "A forrás egy korábbi, interaktív Websuli-tananyag kivonata. A benne TANÍTOTT tartalmat dolgozd fel teljes mélységben "
      + "(fogalmak, példák, feladatok témái); a weboldal kezelőfelületének szövegeit (gombok, pontszámítás, menük) hagyd figyelmen kívül. "
      + "Az évfolyamot a tartalomból állapítsd meg."
      // Spec 2026-10-21-ciklus6: a célzott újragyártás utasítása.
      // Review #357: külön sorban, jelölve — a banképítő kötelező pontozási szabályként kapja (scoringRulesOf).
      + (extra ? `\n${SCORING_RULE_MARK} ${extra}` : ""),
  };
}

type Payload = { htmlFileId: string; runId?: string; attempt?: number; startedAt?: number; requeued?: boolean;
  /** Spec 2026-10-21-ciklus6: a célzott újragyártás egyszer fut. */
  redo?: boolean | number;
  /** Review #352: a folytatott Stúdió-job — a futás-azonosító nélkül (helyőrző) is felismerhető, hogy a folytatás él. */
  jobId?: string };

/** Spec 2026-10-21-fogalom-tipus-hossz: a csak a tudásbank-oszlophatár miatt hibára zárt elem egyszer újra sorba kerül. */
export function shouldRequeue(row: { status: string; error: string | null; payload: { requeued?: boolean } }): boolean {
  // Két külön feltétel (a forrásellenőrző a teljes SQL-szöveget nyers tudástár-írásnak látná): a beszúrás hibája a fogalomtáblán.
  const error = row.error ?? "";
  if (row.status !== "error" || row.payload.requeued) return false;
  return (error.startsWith("Failed query: insert") && error.includes('"km_concepts"')) || isInfrastructureError(error);
}

/**
 * Spec 2026-10-21-ciklus4: infrastruktúra-hiba (nem tartalmi) — a deploy-átfedésben megszakadt futás („A szerver újraindult…”, az eltűnt
 * futás „a futás megállt”) és a félbevágott emoji miatt elutasított kérés (a 4. ciklus javítja). Egyszer újra sorba kerül.
 */
export function isInfrastructureError(error: string): boolean {
  return /szerver újraindult|^a futás megállt$|unexpected end of hex escape/.test(error);
}
type QueueRow = { id: string; status: string; payload: Payload };

/** Review #351: az újrapróba payloadja — az újrasorolás jelzője (`requeued`) megmarad, így a tartós hiba nem indít végtelen újragyártást. */
export const retryPayload = (prev: Payload, runId: string, attempt: number, startedAt: number, jobId?: string): Payload =>
  ({ htmlFileId: prev.htmlFileId, runId, attempt, startedAt, ...(prev.requeued ? { requeued: true } : {}), ...(prev.redo ? { redo: prev.redo } : {}), ...(jobId ? { jobId } : {}) });

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
  const source = legacySource(file, LEGACY_REDO[htmlFileId]);
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
  // Review #355: a példánykerítés a foglalás feltételében (atomi) — a leváltott példány nem foglalhat a feltétel ellenőrzése után sem.
  const { rows } = await db.execute(sql`UPDATE scheduled_jobs SET payload = ${JSON.stringify(next)}::jsonb
    WHERE id = ${row.id} AND status = 'running' AND coalesce(payload->>'runId', '') = ${row.payload.runId ?? ""} AND ${isLatestInstance()} RETURNING id`);
  return rows.length === 1;
}

const LOCK_KEY = sql`hashtext(${LEGACY_JOB_TYPE})`;
/** Review #351: a lezárás csak az e kör által látott futásra érvényes (egy elavult döntés nem írhat felül egy közben újrasorolt elemet). */
const finish = (row: QueueRow, status: "done" | "error" | "waiting", error: string | null) =>
  db.execute(sql`UPDATE scheduled_jobs SET status = ${status}, error = ${error}, completed_at = now()
    WHERE id = ${row.id} AND status = 'running' AND coalesce(payload->>'runId', '') = ${row.payload.runId ?? ""}`);

/**
 * Spec 2026-10-21-ciklus6b (+ ciklus 8: nem csak a kész, MINDEN sorelemnél — anyagonként csak a legutolsó próbálkozás piszkozata látszik):
 * a régi anyag korábbi (nem aktuális, nem publikált) Stúdió-piszkozatai elvetett jelölést kapnak — ugyanaz,
 * mint a felület „Törlés” gombja (visszafordítható). Különben a draftlista a már kész anyag elbukott próbálkozásait mutatja („megtévesztő”).
 * Review #358: minden körben fut (idempotens — a hibás próbálkozás és a korábban kész elemek is sorra kerülnek); az aktívan vitt (élő
 * bérletű) vagy újragyártott job érintetlen; a hibás és a beragadt „running” (élő bérlet és türelmi időn belüli frissülés nélküli) job is.
 */
export const supersededDraftCondition = sql`j.output ? 'targetHtmlFileId'
  AND coalesce(j.output->>'recoveryState', '') NOT IN ('discarded', 'remanufacturing', 'remanufactured', 'superseded')
  AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = j.lesson_id AND l.published_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM lesson_workflow_runs lw WHERE (lw.id = j.id OR lw.resource_id = j.id) AND lw.lease_until > now())
  AND NOT EXISTS (SELECT 1 FROM one_step_runs r JOIN lesson_workflow_runs w ON w.id = r.id WHERE r.job_id = j.id AND w.lease_until > now())
  AND (j.status = 'error' OR (j.status = 'running' AND NOT EXISTS (SELECT 1 FROM one_step_runs r WHERE r.job_id = j.id
    AND r.updated_at > now() - make_interval(secs => ${START_GRACE_MS / 1000}))))
  AND EXISTS (SELECT 1 FROM scheduled_jobs s WHERE s.type = ${LEGACY_JOB_TYPE}
    AND s.payload->>'htmlFileId' = j.output->>'targetHtmlFileId'
    AND NOT EXISTS (SELECT 1 FROM one_step_runs r WHERE r.id = s.payload->>'runId' AND r.job_id = j.id))`;
async function discardSupersededDrafts(): Promise<void> {
  try {
    await db.execute(sql`UPDATE studio_jobs j SET output = coalesce(j.output, '{}'::jsonb)
        || jsonb_build_object('recoveryState', 'discarded', 'discardedAt', now()::text, 'discardedBy', 'legacy-cleanup')
      WHERE ${supersededDraftCondition}`);
  } catch (error) {
    // A következő kör újrapróbálja (idempotens).
    logger.warn(`[RÉGI→STÚDIÓ] A régi piszkozatok elvetése nem sikerült: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let ticking = false;
let skippedLogged = false;
/** Review #349: leállításkor új kör (és benne új gyártás) nem indul. */
let stopped = false;
/** Spec 2026-10-21-ciklus4: e folyamat azonosítója a példánykerítéshez. */
const INSTANCE_ID = randomUUID();
const INSTANCE_TYPE = "legacy-instance";
/** Review #355: bejegyzés nélkül a példány nem foglal (a kerítés csak bejegyzett példányt enged). */
let registered = false;
/** Review #355: a legújabb példány minden körben frissíti a jelét; ennél régebbi jel = a példány nem él (pl. elbukott deploy) → a régi átveszi. */
export const INSTANCE_STALE_MS = 35 * 60_000;
/** SQL-feltétel: a legutóbb bejegyzett példány ez — a foglalások (új elem, újrapróba) feltételében, így a kerítés atomi. */
const isLatestInstance = () => sql`(SELECT payload->>'instance' FROM scheduled_jobs WHERE type = ${INSTANCE_TYPE} ORDER BY created_at DESC, id DESC LIMIT 1) = ${INSTANCE_ID}`;
async function registerInstance(): Promise<void> {
  await db.insert(scheduledJobs).values({ type: INSTANCE_TYPE, scheduledFor: new Date(), status: "done", payload: { instance: INSTANCE_ID, bootedAt: Date.now() } });
  registered = true;
}
/**
 * Igaz, ha a legutóbb bejegyzett példány nem ez (deploy-átfedés: a régi példány ne indítson munkát, amit a leállása megszakít). A legújabb
 * példány itt frissíti a jelét; ha a legújabb jele elavult (a példány nem él), ez a példány újra bejegyzi magát és folytatja.
 */
async function supersededInstance(now: number): Promise<boolean> {
  const { rows } = await db.execute(sql`SELECT payload->>'instance' AS instance, scheduled_for FROM scheduled_jobs WHERE type = ${INSTANCE_TYPE} ORDER BY created_at DESC, id DESC LIMIT 1`);
  const latest = rows[0] as { instance?: string; scheduled_for?: string | Date } | undefined;
  if (latest?.instance === INSTANCE_ID) {
    await db.execute(sql`UPDATE scheduled_jobs SET scheduled_for = now() WHERE type = ${INSTANCE_TYPE} AND payload->>'instance' = ${INSTANCE_ID}`);
    return false;
  }
  if (latest && now - new Date(String(latest.scheduled_for)).getTime() < INSTANCE_STALE_MS) return true;
  await registerInstance();
  logger.info("[RÉGI→STÚDIÓ] A legújabb példány jele elavult — ez a példány veszi át a sort.");
  return false;
}
/** Egy kör: egyeztetés, utána a szabad helyek feltöltése. Visszaad: van-e még teendő (futó elem vagy jelölt) — tétlenül ritkább kör. */
export async function legacyMigrationTick(now = Date.now()): Promise<boolean> {
  if (ticking || stopped) return true;
  if (!registered) return true;
  ticking = true;
  try {
    let rows = (await db.select({ id: scheduledJobs.id, status: scheduledJobs.status, payload: scheduledJobs.payload, error: scheduledJobs.error }).from(scheduledJobs)
      .where(eq(scheduledJobs.type, LEGACY_JOB_TYPE))) as Array<QueueRow & { error: string | null }>;
    if (LEGACY_MIGRATION_MODE !== "off") {
      for (const row of rows.filter(shouldRequeue)) {
        await db.execute(sql`UPDATE scheduled_jobs SET status = 'running', error = NULL, completed_at = NULL,
          payload = ${JSON.stringify({ htmlFileId: row.payload.htmlFileId, attempt: 0, startedAt: 0, requeued: true, ...redoFlag(row.payload.htmlFileId) })}::jsonb
          WHERE id = ${row.id} AND status = 'error' AND coalesce(payload->>'requeued', '') <> 'true'`);
        logger.info(`[RÉGI→STÚDIÓ] Újra sorba (a tudásbank-oszlophatár javítása után): ${row.payload.htmlFileId}`);
      }
      rows = rows.map((r) => (shouldRequeue(r) ? { ...r, status: "running", payload: { htmlFileId: r.payload.htmlFileId, attempt: 0, startedAt: 0, requeued: true, ...redoFlag(r.payload.htmlFileId) } } : r));
      // Spec 2026-10-21-ciklus6: célzott újragyártás — egyszer, a redo-jelzővel (a hibás állapotból, feltételes UPDATE-tel).
      for (const row of rows.filter(shouldRedo)) {
        const next = { htmlFileId: row.payload.htmlFileId, attempt: 0, startedAt: 0, requeued: true, redo: LEGACY_REDO_ROUND };
        await db.execute(sql`UPDATE scheduled_jobs SET status = 'running', error = NULL, completed_at = NULL, payload = ${JSON.stringify(next)}::jsonb
          WHERE id = ${row.id} AND status = 'error' AND coalesce(payload->>'redo', '') <> ${String(LEGACY_REDO_ROUND)}`);
        logger.info(`[RÉGI→STÚDIÓ] Célzott újragyártás: ${row.payload.htmlFileId}`);
      }
      rows = rows.map((r) => (shouldRedo(r) ? { ...r, status: "running", payload: { htmlFileId: r.payload.htmlFileId, attempt: 0, startedAt: 0, requeued: true, redo: LEGACY_REDO_ROUND } } : r));
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
      let jobFailed = false;
      let jobError: string | null = null;
      // Review #352: ha a futás-azonosító (még) helyőrző, a sorelemben rögzített folytatott job dönt.
      const knownJobId = run?.jobId ?? row.payload.jobId;
      if (knownJobId) {
        const [job] = await db.select({ status: studioJobs.status, output: studioJobs.output, error: studioJobs.error }).from(studioJobs).where(eq(studioJobs.id, knownJobId)).limit(1);
        jobError = job?.error ?? null;
        const { singleRunResumable } = await import("./single-run/engine");
        resumable = job?.status === "error" && singleRunResumable((job.output ?? {}) as Record<string, unknown>);
        // Spec 2026-10-21-ciklus5: a hibás fázisú futás job-ja „running” maradhat, ha a hibaállapot mentése is elbukott (mért: 100+ perces
        // beragadás) — ilyenkor a job BÁRMELY futásának élő bérlete (review #350: egy másik példány folytatása) vagy a türelmi időn belüli
        // frissülése (review #356: a még bérlet nélküli folytatás, ill. a friss hiba) jelez valódi futást.
        const jobActive = job?.status === "running" && run?.phase === "error"
          ? (await db.execute(sql`SELECT 1 FROM one_step_runs r LEFT JOIN lesson_workflow_runs w ON w.id = r.id WHERE r.job_id = ${knownJobId}
              AND (w.lease_until > now() OR r.updated_at > now() - make_interval(secs => ${START_GRACE_MS / 1000})) LIMIT 1`)).rows.length > 0
          : false;
        jobRunning = jobStillRunning(job?.status, run?.phase ?? null, jobActive);
        jobFailed = job?.status === "error";
      }
      const decision = reconcileLegacy({ attempt, startedAt, runPhase: run?.phase ?? null, runUpdatedAt: run?.updatedAt ?? null, leaseAlive: lease.rows.length > 0,
        targetIsLesson: file?.contentType === "lesson", jobResumable: resumable, jobRunning, jobFailed }, now);
      if (decision === "running") { running++; continue; }
      if (decision === "done") { await finish(row, "done", null); logger.info(`[RÉGI→STÚDIÓ] Kész: ${htmlFileId} (${attempt}. kísérlet)`); continue; }
      if (decision === "waiting") { await finish(row, "waiting", `emberi döntésre vár (${run?.phase}): ${run?.error ?? ""}`.slice(0, 2000)); continue; }
      if (decision === "error") {
        // Spec 2026-10-21-ciklus4: a futás hibaszövege hiányában a Stúdió-job hibája (pl. „A szerver újraindult…”) kerül a sorba.
        await finish(row, "error", (run?.phase === "done" ? "a futás kész, de a cél nem lett lecke (kézi vizsgálat)" : run?.error || jobError || "a futás megállt").slice(0, 2000));
        logger.warn(`[RÉGI→STÚDIÓ] Hiba, nincs több kísérlet: ${htmlFileId}: ${run?.error ?? "?"}`);
        continue;
      }
      retries.push({ row, decision, jobId: knownJobId ?? null, error: run?.error ?? null });
    }
    // Review #349: `off` módban újrapróba sem indul; a párhuzamosság az újrapróbákra is érvényes (azok elsőbbséget kapnak).
    if (LEGACY_MIGRATION_MODE === "off") return running > 0;
    // Spec 2026-10-21-ciklus4: példánykerítés — ha már újabb példány indult (deploy-átfedés), ez a kör új munkát nem kezd.
    if (await supersededInstance(now)) return running > 0;
    // Review #358: a kész elemek elavult piszkozatainak takarítása minden körben (újrapróbálható, a korábban kész elemekre is).
    await discardSupersededDrafts();
    for (const { row, decision, jobId, error } of retries) {
      if (running >= LEGACY_CONCURRENCY || stopped) break;
      const { htmlFileId, attempt = 1 } = row.payload;
      try {
        if (decision === "resume" && jobId) {
          // Review #350: a sorelem ELŐBB foglalódik (helyőrző azonosítóval), csak a nyertes folytat; utána a valódi futás-azonosító kerül be.
          const placeholder = `resume-${randomUUID()}`;
          if (!await claimRetry(row, retryPayload(row.payload, placeholder, attempt + 1, Date.now(), jobId))) continue;
          const next = await resumeJob(jobId, htmlFileId);
          await db.execute(sql`UPDATE scheduled_jobs SET payload = jsonb_set(payload, '{runId}', to_jsonb(${next}::text)) WHERE id = ${row.id} AND payload->>'runId' = ${placeholder}`);
        } else {
          const runId = randomUUID();
          if (!await claimRetry(row, retryPayload(row.payload, runId, attempt + 1, Date.now()))) continue;
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
      FROM html_files h WHERE h.created_at < ${LEGACY_SCOPE_END.toISOString()}`);
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
      if (running >= LEGACY_CONCURRENCY || stopped || batchRoom(rows.length) <= 0) break;
      // Review #349: atomi foglalás tranzakciós zárral — két példány nem foglalhatja ugyanazt az anyagot; a futás-azonosító ELŐBB rögzül.
      const runId = randomUUID();
      const claimed = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
        // Review #355: a kerítés a foglaló tranzakcióban is (atomi a beszúrással).
        const { rows: fence } = await tx.execute(sql`SELECT ${isLatestInstance()} AS ok`);
        if (!(fence[0] as { ok?: boolean } | undefined)?.ok) return false;
        const { rows: exists } = await tx.execute(sql`SELECT 1 FROM scheduled_jobs WHERE type = ${LEGACY_JOB_TYPE} AND payload->>'htmlFileId' = ${htmlFileId} LIMIT 1`);
        if (exists.length) return false;
        const { rows: active } = await tx.execute(sql`SELECT count(*)::int AS n FROM scheduled_jobs WHERE type = ${LEGACY_JOB_TYPE} AND status = 'running'`);
        if (Number((active[0] as { n?: number } | undefined)?.n ?? 0) >= LEGACY_CONCURRENCY) return false;
        // A ciklus-kapu: az összes sorelem (kész, hibás, várakozó, futó) a korlát alatt.
        const { rows: all } = await tx.execute(sql`SELECT count(*)::int AS n FROM scheduled_jobs WHERE type = ${LEGACY_JOB_TYPE}`);
        if (batchRoom(Number((all[0] as { n?: number } | undefined)?.n ?? 0)) <= 0) return false;
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
    // Review #352: a ciklus-kapu szünetében a várakozó jelölt nem munka — tétlen ütem (nincs percenkénti foglalási próba).
    return running > 0 || retries.length > 0 || (pending.length > 0 && batchRoom(rows.length) > 0);
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
  // Spec 2026-10-21-ciklus4 + review #355: a példány AZONNAL bejegyzi magát (a régi példány a következő foglalásánál már látja); a körök
  // csak sikeres bejegyzés után indulnak — hiba esetén percenként újrapróba.
  const register = () => void registerInstance()
    .then(() => schedule(120_000))
    .catch((error) => {
      logger.warn(`[RÉGI→STÚDIÓ] A példány bejegyzése nem sikerült: ${error instanceof Error ? error.message : String(error)}`);
      if (!stopped) { timer = setTimeout(register, LEGACY_BUSY_MS); timer.unref(); }
    });
  register();
}

/** Review #349: a leállítás ELEJÉN — az időzítő törlődik, és a futó kör sem indít több gyártást. */
export function stopLegacyMigration(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
