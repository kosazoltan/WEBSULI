import { ClipAbortError } from "./lesson-clips";

/**
 * A kisfilm-zár életciklusa (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md, „zár-életciklus”). Adatbázis-független: a valódi
 * kapcsolatot a `lesson-clips-db.ts` adja, tesztben csonkolható.
 *
 * Invariáns: a lefoglalt kapcsolatot EGY egyszer használható release-objektum (`ClipLockLease`) birtokolja a zárkéréstől a release-ig.
 * A normál feloldás és a kényszerített eldobás is ezen megy át, idempotensen (a kapcsolat pontosan egyszer kerül ki: vagy vissza a
 * poolba, vagy eldobva); a közös nyilvántartásból (`leases`) csak a release után kerül ki, így a leállítás a zárkérés, a munka és a feloldás
 * alatt is el tudja dobni a kapcsolatot — a bontással a Postgres a session-szintű advisory lockot biztosan elengedi.
 */
export type LockClient = {
  query(config: { text: string; values: unknown[]; query_timeout: number }): Promise<{ rows: Array<{ ok?: boolean }> }>;
  /** Hibával: a kapcsolat eldobva (nem kerül vissza a poolba); hiba nélkül: vissza a poolba. */
  release(error?: Error | boolean): void;
};
export type ClipLockState = "none" | "locking" | "working" | "unlocking";

class ClipLockLease {
  state: Exclude<ClipLockState, "none"> = "locking";
  private released = false;
  private lostReason: Error | undefined;
  private rejectLost: (reason: Error) => void = () => undefined;
  /** A kényszerített eldobáskor hibával záruló ígéret (a munkával versenyez). */
  readonly lost = new Promise<never>((_resolve, reject) => { this.rejectLost = reject; });
  constructor(private readonly client: LockClient, private readonly onReleased: (lease: ClipLockLease) => void) {
    this.lost.catch(() => undefined);
  }
  /** Érvényes-e még a zár: a munka minden DB-utasítás előtt ellenőrzi (eldobás után `ClipAbortError`). */
  readonly alive = (): void => { if (this.lostReason) throw this.lostReason; };
  /** A kapcsolat eldobása (idempotens). Igaz, ha ez a hívás dobta el; hamis, ha már korábban kikerült. */
  discard(reason: Error): boolean {
    if (this.released) return false;
    this.lostReason ??= reason;
    this.rejectLost(this.lostReason);
    this.finish(this.lostReason);
    return true;
  }
  /** Normál feloldás; elakadás / hiba esetén eldobás. Kényszerített eldobás után nem kérdez. */
  async unlock(query: () => Promise<unknown>): Promise<void> {
    if (this.released) return;
    this.state = "unlocking";
    try { await query(); } catch (error) { this.discard(error instanceof Error ? error : new Error(String(error))); return; }
    this.finish(undefined);
  }
  /** A kapcsolat pontosan egyszeri kiadása (eldobva vagy vissza a poolba); a birtokos csak ezután nullázódik. */
  finish(discardReason: Error | undefined): void {
    if (this.released) return;
    this.released = true;
    this.client.release(discardReason);
    this.onReleased(this);
  }
}

/** Az élő release-objektumok (egy folyamatban egyszerre több zárpróba is lehet, pl. egy foglalt zárat kérő második hívás). */
const leases = new Set<ClipLockLease>();

/** A zár-életciklus aktuális állapota (napló / teszt): a zárat tartó (munka / feloldás) objektumé, különben a zárkérőé. */
export function clipLockState(): ClipLockState {
  const all = [...leases];
  return (all.find((lease) => lease.state !== "locking") ?? all[0])?.state ?? "none";
}

/**
 * Leállítási határidő: a zárat tartó kapcsolat eldobása — bármely fázisban (zárkérés, munka, feloldás). Igaz CSAK akkor, ha ez a
 * hívás ténylegesen eldobott egy kapcsolatot; a hívó ezt ellenőrzi (csak ekkor naplózhat „eldobva”-t).
 */
export function forceReleaseClipLock(): boolean {
  let discarded = false;
  for (const lease of [...leases]) discarded = lease.discard(new ClipAbortError("leállítási határidő: a kisfilm-zárat tartó kapcsolat eldobva")) || discarded;
  return discarded;
}

/** A kör kizárólagos futtatása a zár alatt; a `work` a zár érvényesség-ellenőrzőjét kapja. Foglalt zárnál null. */
export async function exclusiveWithLock<T>(connect: () => Promise<LockClient>, key: number, timeoutMs: number, work: (alive: () => void) => Promise<T>): Promise<T | null> {
  const client = await connect();
  const query = (text: string) => client.query({ text, values: [key], query_timeout: timeoutMs });
  const lease = new ClipLockLease(client, (done) => { leases.delete(done); });
  leases.add(lease);
  let locked: boolean;
  try {
    const request = query("SELECT pg_try_advisory_lock($1) AS ok");
    request.catch(() => undefined); // eldobáskor a függő kérés később bukik — azt már nem kezeljük
    locked = !!(await Promise.race([request, lease.lost])).rows[0]?.ok;
  } catch (error) {
    // Zárkérés-hiba / -időtúllépés / eldobás: bizonytalan állapotú kapcsolat — eldobva.
    lease.discard(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
  if (!locked) { lease.finish(undefined); return null; }
  lease.state = "working";
  try {
    const running = work(lease.alive);
    running.catch(() => undefined); // eldobás után a munka későbbi hibája már nem a hívóé
    return await Promise.race([running, lease.lost]);
  } finally {
    await lease.unlock(() => query("SELECT pg_advisory_unlock($1)"));
  }
}
