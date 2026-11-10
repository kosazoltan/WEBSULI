/**
 * LS-6b (#165) + #168 — progress store for one-step lesson runs.
 *
 * #168 root cause (measured in prod): Render restarted mid-run (uptime probes
 * showed fresh processes at 13:04/13:29/13:44), the in-memory map vanished and
 * the client's indicator froze at "Kép átírása: 8/10" forever. The store is
 * still memory-first (fast polls), but every create/update is ALSO persisted
 * through an injected fire-and-forget writer, polls fall back to a DB loader
 * when memory misses, and boot marks every unfinished persisted run as error —
 * the teacher gets an honest "a szerver újraindult" instead of a frozen bar.
 *
 * The one-step endpoint answers 202 + runId immediately, updates this store at
 * every phase boundary, and the client polls GET /lessons/one-step/:runId.
 */

import { randomUUID } from "node:crypto";

export type OneStepPhase =
  | "indul"
  | "ocr"
  | "extract"
  | "pedagogue"
  | "author"
  | "animator"
  | "lektor"
  | "gate"
  | "done"
  | "parked"
  /** docs/specs/2026-10-15-hiba-gombok.md (E1): ugyanabból a forrásból folytatható piszkozat van — gyártás nem indult, választás kell. */
  | "draft"
  | "error";

export type OneStepRun = {
  id: string;
  phase: OneStepPhase;
  /** Human detail, Hungarian, e.g. "Kép átírása: 3/10". */
  detail: string | null;
  error: string | null;
  mapId: string | null;
  jobId: string | null;
  lessonId: string | null;
  startedAt: number;
  updatedAt: number;
};

/** Fire-and-forget DB writer; failures are logged by the caller, never thrown. */
export type PersistRunFn = (run: OneStepRun) => Promise<void>;
/** DB loader for polls that miss the in-memory map (post-restart). */
export type LoadRunFn = (id: string) => Promise<OneStepRun | null>;

const TTL_FINISHED_MS = 15 * 60 * 1000; // finished runs linger 15 min for late polls
const TTL_STALE_MS = 60 * 60 * 1000; // a run silent for an hour is dead either way

const runs = new Map<string, OneStepRun>();

/**
 * Spec 2026-11-10-gyartas-meres (J6): az írások futásonként SORBAN mennek ki. Mérve élesben (futás 5708791f, 2026-11-10): a motor
 * „done” haladásjelzése és a lezáró frissítés (a lecke azonosítójával) két független, egyszerre futó írás volt; a korábbi pillanatkép
 * ért később az adatbázisba, és a sorból eltűnt a `lessonId` — újraindulás után a kész futás „kész, de nincs lecke” állapotban töltődött
 * vissza. A lánc garantálja, hogy mindig az utolsó állapot marad.
 */
const persistChains = new Map<string, Promise<void>>();

function persistQuietly(run: OneStepRun, persist?: PersistRunFn): void {
  if (!persist) return;
  const snapshot = { ...run };
  const chain = (persistChains.get(run.id) ?? Promise.resolve())
    .then(() => persist(snapshot))
    .catch(() => {
      /* a progress-írás sosem döntheti be a gyártást */
    });
  persistChains.set(run.id, chain);
  void chain.then(() => { if (persistChains.get(run.id) === chain) persistChains.delete(run.id); });
}

/**
 * J6: a motor haladásjelzéséből a futás frissítése. A motor saját „done” jelzése NEM zárja le a futást: a lezárást a hívó végzi a
 * lecke azonosítójával együtt — különben a lekérdezés egy pillanatra (és hibás írási sorrendnél tartósan) „kész, lecke nélkül”
 * állapotot látna.
 */
export function progressPatch(p: { phase: OneStepPhase; detail?: string | null; mapId?: string | null; jobId?: string | null }): Partial<Pick<OneStepRun, "phase" | "detail" | "mapId" | "jobId">> {
  const closing = p.phase === "done";
  return {
    ...(closing ? {} : { phase: p.phase }),
    ...(!closing && p.detail !== undefined ? { detail: p.detail } : {}),
    ...(p.mapId ? { mapId: p.mapId } : {}),
    ...(p.jobId ? { jobId: p.jobId } : {}),
  };
}

/** Spec 2026-10-06-s7: a webes Studio-út a saját job-azonosítóját adja (a haladás és a workflow ugyanazzal az azonosítóval követhető). */
export function createRun(persist?: PersistRunFn, id: string = randomUUID()): string {
  pruneRuns();
  const now = Date.now();
  const run: OneStepRun = {
    id,
    phase: "indul",
    detail: null,
    error: null,
    mapId: null,
    jobId: null,
    lessonId: null,
    startedAt: now,
    updatedAt: now,
  };
  runs.set(id, run);
  persistQuietly(run, persist);
  return id;
}

export function updateRun(
  id: string,
  patch: Partial<Pick<OneStepRun, "phase" | "detail" | "error" | "mapId" | "jobId" | "lessonId">>,
  persist?: PersistRunFn,
): void {
  const run = runs.get(id);
  if (!run) return;
  Object.assign(run, patch, { updatedAt: Date.now() });
  persistQuietly(run, persist);
}

/** Memory first; on miss (fresh process after a restart) ask the DB loader. */
export async function getRun(id: string, load?: LoadRunFn): Promise<OneStepRun | null> {
  const inMemory = runs.get(id);
  if (inMemory) return inMemory;
  if (!load) return null;
  try {
    const loaded = await load(id);
    // A concurrent load must not overwrite progress updated since this read began.
    if (runs.has(id)) return runs.get(id)!;
    if (loaded) runs.set(id, loaded);
    return loaded;
  } catch {
    return null;
  }
}

const FINISHED: ReadonlySet<OneStepPhase> = new Set(["done", "parked", "error", "draft"]);

/**
 * #168 — boot-time sweep: every persisted run that is not finished belonged to
 * a process that died. Return the error patches the caller writes back to the
 * DB; the message tells the teacher exactly what happened.
 */
export function markOrphanedRuns(rows: Array<{ id: string; phase: string }>): Array<{ id: string; error: string }> {
  return rows
    .filter((r) => !FINISHED.has(r.phase as OneStepPhase))
    .map((r) => ({
      id: r.id,
      error: "A szerver újraindult a gyártás közben — indítsd újra a feltöltést (a kész tudástár megmaradt).",
    }));
}

/** Drop finished runs past their linger TTL and anything silently stale. */
export function pruneRuns(now: number = Date.now()): void {
  for (const [id, run] of runs) {
    const age = now - run.updatedAt;
    if ((FINISHED.has(run.phase) && age > TTL_FINISHED_MS) || age > TTL_STALE_MS) runs.delete(id);
  }
}

/** Test seam: the store is module-global by design. */
export function __resetRunsForTest(): void {
  runs.clear();
}
