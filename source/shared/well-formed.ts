/**
 * Spec 2026-10-21-ciklus4 / ciklus5: érvényes UTF-16 szöveg — a `.slice()` kettévághat egy emojit; a magányos fél-karaktert (pl. \ud83e)
 * a szigorú JSON-olvasó (modell-API) és a PostgreSQL JSONB is elutasítja. U+FFFD lesz belőle; az ép emoji és szöveg érintetlen.
 */
export const wellFormed = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");

/** Review #356: vágás kódpont-határon — ha a vágás egy emoji két fele közé esne, eggyel előbb vág (nincs csereképkarakter). */
export function sliceCodePoints(s: string, n: number): string {
  const cut = s.slice(0, n);
  const last = cut.charCodeAt(cut.length - 1);
  return cut.length === n && last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** Rekurzív változat mentéshez: a szövegek tisztulnak, a tömb és a sima objektum bejárva, minden más (szám, null, Date…) érintetlen. */
export function deepWellFormed<T>(value: T): T {
  if (typeof value === "string") return wellFormed(value) as T;
  if (Array.isArray(value)) return value.map((v) => deepWellFormed(v)) as T;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    // Review #356: a kulcs is tisztul (a JSONB a kulcsban sem fogad magányos fél-karaktert).
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [wellFormed(k), deepWellFormed(v)])) as T;
  }
  return value;
}
