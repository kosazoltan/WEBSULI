/**
 * Adventi naptár — a kéréskorlátok EGY helyen (docs/specs/2026-11-18-adventi-naptar.md 16.1, 18.2, 19.). Tulajdonosi döntés
 * (2026-11-18): „Emeljük iskolai méretre” — 90 új névtelen sor / óra / IP és 1500 írás / 15 perc / IP; az alanyonkénti
 * 200 / 15 perc marad. A router ezt a táblát kapja (tesztben kisebb értékkel injektálható).
 */
export type AdventLimit = { limit: number; windowMs: number };
export type AdventLimits = {
  /** Írás alanyonként: a szabályos legrosszabb eset 24 ablak × 3 kérdés × 2 kérés = 144. */
  subjectWrites: AdventLimit;
  /** Írás IP-nként (visszaélés ellen; egy hálózaton több alany is játszik). */
  ipWrites: AdventLimit;
  /** Állapot-olvasás IP-nként. */
  ipReads: AdventLimit;
  /** LÉTREJÖTT új névtelen (eszköz-) sor IP-nként — ez védi az adatbázis-keretet. A kísérlet nem számít, csak a létrejött sor. */
  newDeviceRows: AdventLimit;
};

export const ADVENT_LIMITS: AdventLimits = {
  subjectWrites: { limit: 200, windowMs: 15 * 60_000 },
  ipWrites: { limit: 1500, windowMs: 15 * 60_000 },
  ipReads: { limit: 120, windowMs: 60_000 },
  newDeviceRows: { limit: 90, windowMs: 60 * 60_000 },
};

/**
 * Csúszóablakos számláló kulcsonként, memóriában: `full(kulcs)` megmondja, betelt-e a keret, `hit(kulcs)` egy eseményt rögzít.
 * A kettő külön hívható — így csak a TÉNYLEGESEN létrejött sor számít, a visszagördült kísérlet nem (review K2).
 */
export function createWindowCounter(rule: AdventLimit, now: () => number = Date.now) {
  const events = new Map<string, number[]>();
  const live = (key: string): number[] => {
    const cutoff = now() - rule.windowMs;
    const kept = (events.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) events.set(key, kept); else events.delete(key);
    return kept;
  };
  return {
    full: (key: string): boolean => live(key).length >= rule.limit,
    hit: (key: string): void => { events.set(key, [...live(key), now()]); },
    count: (key: string): number => live(key).length,
  };
}
