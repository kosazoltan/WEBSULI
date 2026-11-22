import { ClipAbortError } from "./lesson-clips";
import { logger } from "./lib/logger";

/**
 * A kisfilm-zár életciklusa (docs/specs/2026-11-10-kisfilm-memoria.md: „a kör minden írása a zárral együtt él és hal”). Adatbázis-
 * független: a kapcsolatot a `lesson-clips-db.ts` adja, tesztben csonkolható.
 *
 * A session-szintű advisory lockot tartó kapcsolatot egyetlen, egyszer használható release birtokolja a zárkéréstől a release-ig; a kör
 * MINDEN DB-művelete ugyanezen a kapcsolaton fut (a `work` ezt kapja). Kényszerített eldobáskor a kapcsolat bontódik, a szerveroldali
 * folyamat leáll (`terminate`), így a Postgres a még nyitott tranzakciót visszagörgeti és a zárat elengedi — nincs „írás a zár után”.
 */
export type LockClient = {
  processID?: number;
  /** A pg kliens eseményei: a kikért (pool által nem figyelt) kliens `error`-ja figyelő nélkül az egész folyamatot leállítaná. */
  on?(event: "error", listener: (error: Error) => void): unknown;
  removeListener?(event: "error", listener: (error: Error) => void): unknown;
  query(config: { text: string; values: unknown[]; query_timeout: number }): Promise<{ rows: Array<{ ok?: boolean }> }>;
  /** Hibával: a kapcsolat eldobva (nem kerül vissza a poolba); hiba nélkül: vissza a poolba. */
  release(error?: Error | boolean): void;
};
export type ClipLockState = "none" | "locking" | "working" | "unlocking";
type Lease = { state: Exclude<ClipLockState, "none">; release(reason?: Error): boolean };

/** Az élő zárkapcsolatok (egy folyamatban egy foglalt zárat kérő második hívás is élhet egyszerre). */
const leases = new Set<Lease>();
const noop = () => undefined;
const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

/** A zár-életciklus állapota (napló / teszt): a zárat tartóé, különben a zárkérőé. */
export function clipLockState(): ClipLockState {
  const all = [...leases];
  return (all.find((lease) => lease.state !== "locking") ?? all[0])?.state ?? "none";
}

/** Leállítási határidő: minden élő zárkapcsolat eldobása. Igaz CSAK akkor, ha ténylegesen eldobott egyet (a hívó csak ekkor naplózhat). */
export function forceReleaseClipLock(): boolean {
  let discarded = false;
  for (const lease of [...leases]) discarded = lease.release(new ClipAbortError("leállítási határidő: a kisfilm-zárat tartó kapcsolat eldobva")) || discarded;
  return discarded;
}

/**
 * A zárat tartó szerveroldali folyamat leállításának kérése (`pg_terminate_backend`). VÁLLALT KORLÁT (tulajdonosi döntés 2026-11-22):
 * a kérés a közös poolon, külön időkorlát és a backend leállásának ellenőrzése nélkül megy — a visszaigazolás a követő PR hatóköre.
 * Addig az eredmény és a hiba legalább figyelmeztetésként látszik; a zár felszabadulását nem állítjuk garantáltnak.
 */
export async function terminateClipBackend(run: (pid: number) => Promise<{ rows: Array<{ pg_terminate_backend?: unknown }> }>, pid: number, warn: (message: string) => void): Promise<boolean> {
  try {
    if ((await run(pid)).rows[0]?.pg_terminate_backend === true) return true;
    warn(`[lesson-clips] a DB-oldali leállítás nem igazolt (folyamat ${pid}: a backend nem állt le vagy már nem létezett) — a zár felszabadulása nincs visszaigazolva`);
  } catch (error) {
    warn(`[lesson-clips] a DB-oldali leállítás kérése nem sikerült (folyamat ${pid}: ${asError(error).message.slice(0, 120)}) — a zár felszabadulása nincs visszaigazolva`);
  }
  return false;
}

/** A kör kizárólagos futtatása a zár alatt, a zárat tartó kapcsolaton. Foglalt zárnál null. */
export async function exclusiveWithLock<T>(connect: () => Promise<LockClient>, key: number, timeoutMs: number, work: (client: LockClient) => Promise<T>, terminate: (pid: number) => void = noop): Promise<T | null> {
  const client = await connect();
  let rejectLost: (reason: Error) => void = noop;
  const lost = new Promise<never>((_resolve, reject) => { rejectLost = reject; });
  lost.catch(noop);
  let released = false;
  // DB-újraindítás / szakadás: a kikért kliens `error`-ja a zár elvesztése — a kör `ClipAbortError`-ral leáll, a kapcsolat eldobódik.
  const onError = (error: Error) => {
    logger.warn(`[lesson-clips] a kisfilm-zárat tartó kapcsolat megszakadt (${error.message.slice(0, 120)}) — a kör leáll`);
    lease.release(new ClipAbortError("a kisfilm-zárat tartó kapcsolat megszakadt"));
  };
  const lease: Lease = {
    state: "locking",
    // Pontosan egyszer: vissza a poolba, vagy eldobva (bontás + szerveroldali leállítás → visszagörgetés, zárfelengedés).
    release(reason) {
      if (released) return false;
      released = true;
      leases.delete(lease);
      client.removeListener?.("error", onError);
      if (reason) { rejectLost(reason); if (client.processID) terminate(client.processID); }
      client.release(reason);
      return true;
    },
  };
  leases.add(lease);
  client.on?.("error", onError);
  const race = <R>(promise: Promise<R>) => { promise.catch(noop); return Promise.race([promise, lost]); };
  const query = (text: string) => race(client.query({ text, values: [key], query_timeout: timeoutMs }));
  let locked: boolean;
  try {
    locked = !!(await query("SELECT pg_try_advisory_lock($1) AS ok")).rows[0]?.ok;
  } catch (error) {
    lease.release(asError(error)); // zárkérés-hiba / -időtúllépés / eldobás: bizonytalan kapcsolat
    throw error;
  }
  if (!locked) { lease.release(); return null; }
  lease.state = "working";
  try {
    return await race(work(client));
  } finally {
    if (!released) {
      lease.state = "unlocking";
      try { await query("SELECT pg_advisory_unlock($1)"); lease.release(); } catch (error) { lease.release(asError(error)); }
    }
  }
}
