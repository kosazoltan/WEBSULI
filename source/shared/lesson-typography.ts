/** Only these measured, bundled families may be used for lesson text. */
export const LESSON_FONTS = ["Nunito", "Source Sans 3", "Source Serif 4"] as const;
export type LessonFont = typeof LESSON_FONTS[number];
export const HUNGARIAN_FONT_PROBE = "Árvíztűrő tükörfúrógép · ÁÉÍÓÖŐÚÜŰ áéíóöőúüű";
export const LESSON_FONT_CSS = "/fonts/lesson-fonts.css";
export const LESSON_FONT_VERSION = "hu-1";

export function lessonFontPair(classroom: number, subject = ""): { body: LessonFont; heading: LessonFont } {
  if (classroom >= 1 && classroom <= 4) return { body: "Nunito", heading: "Nunito" };
  return { body: "Source Sans 3", heading: /irodal|történ|vers|mese|nyelv/i.test(subject) ? "Source Serif 4" : "Source Sans 3" };
}

/** Preview and published HTML share this adapter; stored originals stay intact.
 * This is typography, not HTML sanitization. Never changes text or executable code.
 */
export function withLessonTypography(html: string, classroom = 7, subject = "", assetOrigin = ""): string {
  if (!html.trim()) return html;
  const { body, heading } = lessonFontPair(classroom, subject);
  // Only a caller-provided HTTP(S) origin, never an arbitrary HTML/CSS fragment.
  const origin = assetOrigin ? new URL(assetOrigin).origin : "";
  if (origin && !/^https?:\/\//.test(origin)) throw new Error("Invalid font origin");
  const css = `<!--websuli-typography:start--><link id="websuli-fonts" rel="stylesheet" href="${origin}${LESSON_FONT_CSS}">
<style id="websuli-typography">
html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }
body { font-family:"${body}",sans-serif!important; line-height:1.65; }
body :where(p,div,span,strong,em,b,i,u,small,mark,li,a,button,input,textarea,select,label,td,th,dt,dd,summary,blockquote,figcaption,text):not(.katex *):not(.MathJax *) { font-family:"${body}",sans-serif!important; }
body :where(h1,h2,h3,h4,h5,h6) { font-family:"${heading}",serif!important; line-height:1.3; padding-block:.08em; }
body :where(h1,h2,h3,h4,h5,h6) :where(span,a,strong,em) { font-family:inherit!important; }
button,input,textarea,select { font-size:inherit; }
</style><!--websuli-typography:end-->`;
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--websuli-typography:start-->[\s\S]*?<!--websuli-typography:end-->|<link\b[^>]*>/gi, tag => {
    if (/^<script/i.test(tag)) return tag;
    if (tag.startsWith("<!--websuli-typography:start-->")) return "";
    return /\bhref=["']https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\//i.test(tag) ? "" : tag;
  });
  if (/<\/head\s*>/i.test(out)) return out.replace(/<\/head\s*>/i, `${css}</head>`);
  if (/<html\b[^>]*>/i.test(out)) return out.replace(/<html\b[^>]*>/i, tag => `${tag}<head><meta charset="utf-8">${css}</head>`);
  out = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body>${out}</body></html>`;
  return out;
}

export const LESSON_TYPOGRAPHY_CONTRACT = `Magyar tipográfia (${LESSON_FONT_VERSION}): kizárólag Nunito, Source Sans 3, Source Serif 4.
Helyi készlet: <link rel="stylesheet" href="${LESSON_FONT_CSS}">. Normál és dőlt változat, 400–800 súly; teljes magyar kis- és nagybetűk, köztük ő/Ő/ű/Ű.
Ne tölts be Google Fonts vagy más külső fontot. Ne használj nem csomagolt díszbetűt. A fallback csak hálózati hibatűrés, nem bizonyíték az ékezethelyességre.
UTF-8 és lang="hu"; hibásan kódolt szöveget fontcsere nem javít. Látható próbasor: ${HUNGARIAN_FONT_PROBE}. A próbasor a minőségellenőrzés része, nem kell minden tananyagba kiírni.
Legalább 1.3 címsor-magasság és ékezeteknek elegendő felső tér. Szöveghez ne használj fix magasságot vagy overflow:hidden-t. A szöveges gomb és SVG-ábra felirata is a megadott készletet használja.`;
