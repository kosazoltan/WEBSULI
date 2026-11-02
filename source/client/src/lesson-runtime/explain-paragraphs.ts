/** Spec 2026-10-22: a ennél hosszabb magyarázat ≥ 1500 px-en két hasábban folyik (rövid szövegnél a két hasáb csak szétszabdalná). */
export const EXPLAIN_LONG_CHARS = 600;
/** Review #368: a magyarázat bekezdései (üres sorral elválasztva) — a hasábváltás csak bekezdéshatáron történhet. */
export const explainParagraphs = (text: string): string[] => {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [text];
};
/** Két hasáb csak a hosszú, legalább két bekezdéses magyarázatnak jár (egy bekezdés sosem törik ketté). */
export const explainIsLong = (text: string): boolean => text.length > EXPLAIN_LONG_CHARS && explainParagraphs(text).length >= 2;
