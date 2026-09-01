/**
 * BACKLOG T2 (2026-09-02) — megtekintés-dedup a publikus /dev/:id útvonalhoz.
 *
 * Eddig minden GET egy `material_views` sort írt, rate-limit nélkül: egy anonim kliens
 * korlátlanul tudott sorokat generálni (és a napi összesítőt/statisztikát torzítani).
 * IP-alapú limiter helyett dedup: ugyanaz a kulcs (ip|materialId) egy TTL-ablakon belül
 * csak egyszer számít — iskolai NAT mögül így sem zárunk ki senkit a tartalomból.
 * Korlátos memória: ha a kulcsok száma túllépi a maximumot, a legrégebbieket dobjuk.
 */
export class ViewDedup {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number = 60 * 60 * 1000,
    private readonly maxEntries: number = 50_000,
  ) {}

  /** true, ha a kulcs ebben az ablakban még nem szerepelt (→ rögzíteni kell). */
  shouldRecord(key: string, now: number = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < this.ttlMs) {
      return false;
    }
    // Map iterációs sorrend = beszúrási sorrend; a frissítéshez töröljük és újra beszúrjuk,
    // így a legrégebbi bejegyzés mindig elöl van.
    if (last !== undefined) this.seen.delete(key);
    this.seen.set(key, now);
    this.prune(now);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  private prune(now: number): void {
    if (this.seen.size <= this.maxEntries) {
      // olcsó: csak a legelső (legrégebbi) lejárt bejegyzéseket takarítjuk
      for (const [k, t] of this.seen) {
        if (now - t < this.ttlMs) break;
        this.seen.delete(k);
      }
      return;
    }
    // túlcsordulás: a legrégebbieket dobjuk, amíg a méret a korlát alá nem esik
    for (const k of this.seen.keys()) {
      if (this.seen.size <= this.maxEntries) break;
      this.seen.delete(k);
    }
  }
}
