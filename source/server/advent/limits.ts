/**
 * Adventi naptár — a kéréskorlátok EGY helyen (docs/specs/2026-11-18-adventi-naptar.md 16.1, 19., 21.).
 *
 * Méretezés (orkesztrátori döntés 2026-11-18, a tulajdonos „iskolai méretre” szándéka szerint; a vak ellenőr K1 / K2 lelete után):
 * a hálózati (IP-) keretek EGY iskolai cím legrosszabb SZABÁLYOS esetére szólnak — 4 osztály × 30 gyerek egy tanórán, december
 * 24-i teljes pótlással —, kétszeres tartalékkal. A hálózati keretbe CSAK az érvényes, alanyhoz köthető, sikeres kérés számít,
 * így az érvénytelen kérésekkel nem fogyasztható el (ezeknek saját, rövid ablakú keretük van, amely a szabályos kérést soha nem
 * állítja meg). Új névtelen naptárat munkamenetenként is csak keveset lehet kezdeni, hogy egy kliens ne fogyaszthassa el a
 * hálózat új-sor keretét.
 */
/** Egy iskolai cím legrosszabb szabályos esete: ennyi gyerek egyszerre. */
export const ADVENT_SCHOOL_KIDS = 4 * 30;
/** Egy gyerek írásai a december 24-i teljes pótláskor: évfolyam (1) + 24 ablak × (megnyitás + válasz) + 5 javítás × (megnyitás + válasz). */
export const ADVENT_WRITES_PER_KID = 1 + 24 * 2 + 5 * 2;
/** Egy kör legrosszabb esete egy alanynál: 24 ablak × 3 kérdés × (megnyitás + válasz). */
export const ADVENT_ROUND_WORST = 24 * 3 * 2;
const RESERVE = 2;

export type AdventLimit = { limit: number; windowMs: number };
export type AdventLimits = {
  /** Írás alanyonként: két teljes kör legrosszabb esete (2 × 144) + évfolyam + új kör — a 2. kör sem fogy el (vak ellenőr k2). */
  subjectWrites: AdventLimit;
  /** Érvényes, sikeres írás IP-nként: 120 gyerek × 59 írás × 2 = 14 160 / 15 perc. */
  ipWrites: AdventLimit;
  /** Állapot-olvasás IP-nként: 120 gyerek × ~5 olvasás / perc × 2 = 1200 / perc. */
  ipReads: AdventLimit;
  /** LÉTREJÖTT új névtelen (eszköz-) sor IP-nként (8 osztály / óra) — ez védi az adatbázis-keretet. Csak a létrejött sor számít. */
  newDeviceRows: AdventLimit;
  /** Új névtelen sor MUNKAMENETENKÉNT: egy kliens (süti) ne fogyaszthassa el a hálózat új-sor keretét. */
  sessionNewRows: AdventLimit;
  /** Érvénytelen kérés IP-nként (rövid ablak): csak az érvénytelen kérést utasítja el 429-cel, a szabályosat soha. */
  ipInvalid: AdventLimit;
};

export const ADVENT_LIMITS: AdventLimits = {
  subjectWrites: { limit: 2 * ADVENT_ROUND_WORST + 2, windowMs: 15 * 60_000 },
  ipWrites: { limit: ADVENT_SCHOOL_KIDS * ADVENT_WRITES_PER_KID * RESERVE, windowMs: 15 * 60_000 },
  ipReads: { limit: 1200, windowMs: 60_000 },
  newDeviceRows: { limit: 240, windowMs: 60 * 60_000 },
  sessionNewRows: { limit: 3, windowMs: 60 * 60_000 },
  ipInvalid: { limit: 120, windowMs: 60_000 },
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
    /** Hány másodperc múlva szabadul fel hely a kulcs keretében (a 429 `Retry-After` fejlécéhez); 0, ha van szabad hely. */
    retryAfterSec: (key: string): number => {
      const list = live(key);
      if (list.length < rule.limit) return 0;
      return Math.max(1, Math.ceil((list[0]! + rule.windowMs - now()) / 1000));
    },
    /** A nyilvántartott kulcsok száma (teszthez és megfigyeléshez). */
    size: (): number => events.size,
  };
}
