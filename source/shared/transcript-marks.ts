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
