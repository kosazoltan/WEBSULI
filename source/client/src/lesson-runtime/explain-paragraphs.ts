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
 * Spec 2026-11-18 (tananyaggyártás minősége, S2a / E8): a jelölt, sortöréssel tagolt sorok eddig egyetlen bekezdésbe folytak (a `<p>`
 * a sortörést szóközzé vonja össze). Legalább KÉT egymást követő jelölt sor valódi lista. A „•” egyértelmű listajel. A „-” / „*”
 * csak akkor az, ha a kötőjel biztosan nem a tartalom része (független review J1) — kétség esetén a sorok bekezdés maradnak:
 *  - a jel után betű (vagy kiemelt / idézett szó) áll, nem szám és nem műveleti jel („- 5 + 3 = -2” egyenlet, „- 5 fok” előjel);
 *  - a sorban nincs további közbevetett kötőjel / gondolatjel („- Haza - felelte.” párbeszéd);
 *  - a sor nem kérdés / felkiáltás („- Hová mész?” párbeszéd).
 * A gondolatjeles („–”) sor soha nem lista; a `**kiemelés**` nem listajel (a jel után szóköz kell).
 */
const DOT = /^•\s+(?=\S)/;
const DASH = /^[-*]\s+(?=(?:\*\*|__|["„»'])?\p{L})/u;
const dashItem = (line: string) => DASH.test(line) && !/\s[-–—]\s/.test(line.replace(DASH, "")) && !/[?!]["”»]?$/.test(line);
const isItem = (line: string) => DOT.test(line) || dashItem(line);
export type ExplainPart = { kind: "p"; text: string } | { kind: "ul"; items: string[] };
export function explainParts(text: string): ExplainPart[] {
  return explainParagraphs(text).flatMap((paragraph): ExplainPart[] => {
    const lines = paragraph.split("\n").map((l) => l.trim()).filter(Boolean);
    const parts: ExplainPart[] = [];
    let prose: string[] = [];
    const flush = () => { if (prose.length) parts.push({ kind: "p", text: prose.join("\n") }); prose = []; };
    for (let i = 0; i < lines.length;) {
      let end = i;
      while (end < lines.length && isItem(lines[end])) end++;
      // A jelölt sorok csak akkor lista, ha a futás a bekezdés MINDEN jelölt sorát lefedi — egy kétes sor az egész futást bekezdésben hagyja.
      const bounded = end === lines.length || !/^[•\-*]\s/.test(lines[end]);
      const opened = i === 0 || !/^[•\-*]\s/.test(lines[i - 1]);
      if (end - i >= 2 && bounded && opened) { flush(); parts.push({ kind: "ul", items: lines.slice(i, end).map((l) => l.replace(DOT, "").replace(DASH, "")) }); i = end; }
      else { prose.push(...lines.slice(i, Math.max(end, i + 1))); i = Math.max(end, i + 1); }
    }
    flush();
    return parts.length === 1 && parts[0].kind === "p" ? [{ kind: "p", text: paragraph }] : parts;
  });
}
