/** Spec 2026-10-22: a ennél hosszabb magyarázat ≥ 1500 px-en két hasábban folyik (rövid szövegnél a két hasáb csak szétszabdalná). */
export const EXPLAIN_LONG_CHARS = 600;
/** Review #368: a magyarázat bekezdései (üres sorral elválasztva) — a hasábváltás csak bekezdéshatáron történhet. */
export const explainParagraphs = (text: string): string[] => {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [text];
};
/** Két hasáb csak a hosszú, legalább két bekezdéses magyarázatnak jár (egy bekezdés sosem törik ketté). */
export const explainIsLong = (text: string): boolean => text.length > EXPLAIN_LONG_CHARS && explainParagraphs(text).length >= 2;

/**
 * Spec 2026-11-18 (tananyaggyártás minősége, S2a / E8): a „•” / „-” / „*” kezdetű, sortöréssel tagolt sorok eddig egyetlen bekezdésbe
 * folytak (a `<p>` a sortörést szóközzé vonja össze). Legalább KÉT egymást követő ilyen sor valódi lista; az egyetlen jelölt sor és
 * a gondolatjeles („–”) párbeszédsor bekezdés marad. A `**kiemelés**` nem listajel (a jel után szóköz kell).
 */
const BULLET = /^[•\-*]\s+(?=\S)/;
export type ExplainPart = { kind: "p"; text: string } | { kind: "ul"; items: string[] };
export function explainParts(text: string): ExplainPart[] {
  return explainParagraphs(text).flatMap((paragraph): ExplainPart[] => {
    const lines = paragraph.split("\n").map((l) => l.trim()).filter(Boolean);
    const parts: ExplainPart[] = [];
    let prose: string[] = [];
    const flush = () => { if (prose.length) parts.push({ kind: "p", text: prose.join("\n") }); prose = []; };
    for (let i = 0; i < lines.length;) {
      let end = i;
      while (end < lines.length && BULLET.test(lines[end])) end++;
      if (end - i >= 2) { flush(); parts.push({ kind: "ul", items: lines.slice(i, end).map((l) => l.replace(BULLET, "")) }); i = end; }
      else { prose.push(...lines.slice(i, Math.max(end, i + 1))); i = Math.max(end, i + 1); }
    }
    flush();
    return parts.length === 1 && parts[0].kind === "p" ? [{ kind: "p", text: paragraph }] : parts;
  });
}
