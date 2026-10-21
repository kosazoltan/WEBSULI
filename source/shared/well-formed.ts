/**
 * Spec 2026-10-21-ciklus4 / ciklus5: érvényes UTF-16 szöveg — a `.slice()` kettévághat egy emojit; a magányos fél-karaktert (pl. \ud83e)
 * a szigorú JSON-olvasó (modell-API) és a PostgreSQL JSONB is elutasítja. U+FFFD lesz belőle; az ép emoji és szöveg érintetlen.
 */
export const wellFormed = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");

/** Rekurzív változat mentéshez: a szövegek tisztulnak, a tömb és a sima objektum bejárva, minden más (szám, null, Date…) érintetlen. */
export function deepWellFormed<T>(value: T): T {
  if (typeof value === "string") return wellFormed(value) as T;
  if (Array.isArray(value)) return value.map((v) => deepWellFormed(v)) as T;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepWellFormed(v)])) as T;
  }
  return value;
}
