/**
 * Adventi naptár — a kéréskorlátok EGY helyen (docs/specs/2026-11-18-adventi-naptar.md 16.1, 18.2, 19.). Tulajdonosi döntés
 * (2026-11-18): „Emeljük iskolai méretre” — 90 új névtelen sor / óra / IP és 1500 írás / 15 perc / IP; az alanyonkénti
 * 200 / 15 perc marad; az állapot-olvasás 400 / perc / IP (ugyanebből a döntésből, a felület ellenőri köre után: 120 volt).
 * A router ezt a táblát kapja (tesztben kisebb értékkel injektálható).
 */
export type AdventLimit = { limit: number; windowMs: number };
export type AdventLimits = {
  /** Írás alanyonként: a szabályos legrosszabb eset 24 ablak × 3 kérdés × 2 kérés = 144. */
  subjectWrites: AdventLimit;
  /** Írás IP-nként (visszaélés ellen; egy hálózaton több alany is játszik). */
  ipWrites: AdventLimit;
  /** Állapot-olvasás IP-nként: három-négy osztály egyszerre (betöltés + főoldali kártya + fókuszra frissítés). */
  ipReads: AdventLimit;
  /** LÉTREJÖTT új névtelen (eszköz-) sor IP-nként — ez védi az adatbázis-keretet. A kísérlet nem számít, csak a létrejött sor. */
  newDeviceRows: AdventLimit;
};

export const ADVENT_LIMITS: AdventLimits = {
  subjectWrites: { limit: 200, windowMs: 15 * 60_000 },
  ipWrites: { limit: 1500, windowMs: 15 * 60_000 },
  ipReads: { limit: 400, windowMs: 60_000 },
  newDeviceRows: { limit: 90, windowMs: 60 * 60_000 },
};

/**
 * Csúszóablakos számláló kulcsonként, memóriában: `full(kulcs)` megmondja, betelt-e a keret, `hit(kulcs)` egy eseményt rögzít.
 * A kettő külön hívható — így csak a TÉNYLEGESEN létrejött sor számít, a visszagördült kísérlet nem (review K2).
 */
export function createWindowCounter(rule: AdventLimit, now: () => number = Date.now) {
  const events = new Map<string, number[]>();
  let sweptAt = now();
  const live = (key: string): number[] => {
    const cutoff = now() - rule.windowMs;
    const kept = (events.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) events.set(key, kept); else events.delete(key);
    return kept;
  };
  /** Ablakonként egyszer MINDEN kulcs lejárt eseménye kikerül — a többé nem kérdezett kulcs sem marad meg (review U2). */
  const sweep = (): void => {
    if (now() - sweptAt < rule.windowMs) return;
    sweptAt = now();
    for (const key of [...events.keys()]) live(key);
  };
  const hit = (key: string): number => { sweep(); const at = now(); events.set(key, [...live(key), at]); return at; };
  return {
    full: (key: string): boolean => live(key).length >= rule.limit,
    hit: (key: string): void => { hit(key); },
    count: (key: string): number => live(key).length,
    /**
     * Hely FOGLALÁSA egy lépésben (ellenőrzés + rögzítés, közte nincs várakozás): `null`, ha a keret betelt, különben a foglalás
     * jegye. Párhuzamos kéréseknél így a keret nem léphető túl (review U1).
     */
    reserve: (key: string): number | null => (live(key).length >= rule.limit ? null : hit(key)),
    /** A foglalás visszaadása, ha végül nem jött létre, amit védett. */
    release: (key: string, ticket: number): void => {
      const list = events.get(key);
      const index = list ? list.indexOf(ticket) : -1;
      if (!list || index < 0) return;
      list.splice(index, 1);
      if (!list.length) events.delete(key);
    },
    /** A nyilvántartott kulcsok száma (teszthez és megfigyeléshez). */
    size: (): number => events.size,
  };
}
