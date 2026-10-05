/**
 * Spec 2026-10-05-s11: az OCR-átirat jelölői („⟦?⟧” bizonytalan olvasat, „[KERET: …]” / „[KERET VÉGE]” elrendezés) a FORRÁS
 * részei — a gyereknek szóló leckébe soha nem kerülhetnek. A publikálás előtt determinisztikusan eltávolítva (minden szövegmezőből).
 */
const MARKS = /\s*⟦\?⟧|\[KERET(?::[^\]\n]*)?\]|\[KERET VÉGE\]/gu;

export function hasTranscriptMarks(text: string): boolean {
  MARKS.lastIndex = 0;
  return MARKS.test(text);
}

export function stripTranscriptMarks<T>(value: T): T {
  // Csak a jelölőt tartalmazó szöveg változik (a többi mező bájtra azonos marad).
  if (typeof value === "string") return (hasTranscriptMarks(value) ? value.replace(MARKS, "").replace(/[ \t]{2,}/g, " ").trim() : value) as T;
  if (Array.isArray(value)) return value.map((v) => stripTranscriptMarks(v)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripTranscriptMarks(v)])) as T;
  return value;
}

// Review #196: NFC-normalizálás (NFD/NFC eltérés ne okozzon téves „biztos” eredményt).
const wordKey = (w: string) => w.normalize("NFC").toLocaleLowerCase("hu").replace(/[^\p{L}\p{N}]/gu, "");
/**
 * Spec S11/6 (biztonság): az idézet akkor is bizonytalan, ha a modell a jelet elhagyta, de a FORRÁSBAN jelölt („szó⟦?⟧”) szót idéz —
 * különben a jelölőket figyelmen kívül hagyó szó szerinti ellenőrzés mellett a bizonytalan olvasat tanított ténnyé válhatna.
 * Konzervatív: a jelölt szó (≥ 3 betű) bárhol előfordulva bizonytalanná teszi az idézetet.
 */
export function quoteTouchesUncertain(quote: string, sourceText: string): boolean {
  if (quote.includes("⟦?⟧")) return true;
  const marked = new Set([...sourceText.matchAll(/(\S+?)\s*⟦\?⟧/gu)].map((m) => wordKey(m[1])).filter((k) => k.length >= 3));
  if (!marked.size) return false;
  return quote.split(/\s+/).some((w) => marked.has(wordKey(w)));
}
