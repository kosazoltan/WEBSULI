/**
 * JM0: a `POST /api/games/score` opcionális `runId`-jének memóriabeli, idő- és méretkorlátos újraküldés-védelme
 * (séma nélkül; a ViewDedup mintájára). NEM csalásvédelem: a kliens új runId-kkel ugyanúgy küldhet; a valódi
 * hihetőség-ellenőrzés a szerver által kiadott futásoké (JM8). Egy Render-példányra érvényes; újraindításkor kiürül.
 *
 * Viselkedés ugyanazon (felhasználó, runId) kulcsra:
 *  - első érkezés: a hívó lefuttatja az írást, az eredményt a `run` adja vissza;
 *  - ugyanaz a tartalom újra (akár az első még fut): ugyanaz az eredmény, új írás nélkül (`duplicate: true`);
 *  - eltérő tartalom: `conflict`;
 *  - sikertelen írás: a kulcs törlődik, újrapróbálható.
 */
export type ScoreRunOutcome<T> =
  | { kind: "created"; value: T }
  | { kind: "duplicate"; value: T }
  | { kind: "conflict" };

interface Entry<T> {
  fingerprint: string;
  at: number;
  result: Promise<T>;
}

export class ScoreRunDedup<T> {
  private readonly seen = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
    private readonly maxEntries: number = 50_000,
  ) {}

  async run(
    key: string,
    fingerprint: string,
    write: () => Promise<T>,
    now: number = Date.now(),
  ): Promise<ScoreRunOutcome<T>> {
    this.pruneExpired(now);
    const existing = this.seen.get(key);
    if (existing && now - existing.at < this.ttlMs) {
      if (existing.fingerprint !== fingerprint) return { kind: "conflict" };
      try {
        return { kind: "duplicate", value: await existing.result };
      } catch {
        // az első kísérlet elbukott → a kulcs már törölve; ez a kérés újra próbálkozhat
        return this.run(key, fingerprint, write, now);
      }
    }
    if (existing) this.seen.delete(key);
    this.makeRoom();
    const result = write();
    this.seen.set(key, { fingerprint, at: now, result });
    try {
      return { kind: "created", value: await result };
    } catch (err) {
      if (this.seen.get(key)?.result === result) this.seen.delete(key);
      throw err;
    }
  }

  get size(): number {
    return this.seen.size;
  }

  /** Csak a lejárt bejegyzések törlése (a Map beszúrási sorrendje = időrend); meglévő kulcsot sosem dob el méret miatt. */
  private pruneExpired(now: number): void {
    for (const [k, e] of this.seen) {
      if (now - e.at < this.ttlMs) break;
      this.seen.delete(k);
    }
  }

  /** Új kulcs beszúrása előtt: a legrégebbieket dobjuk, hogy a méret a korlát alatt maradjon (Codex P2, #441). */
  private makeRoom(): void {
    for (const k of this.seen.keys()) {
      if (this.seen.size < this.maxEntries) break;
      this.seen.delete(k);
    }
  }
}
