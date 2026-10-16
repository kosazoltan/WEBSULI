import { withLessonInteractions } from "./lesson-interactions";
/**
 * Only these measured, bundled families may be used for lesson text. Websuli Design (docs/specs/2026-10-16-websuli-design.md,
 * docs/design/): Nunito Sans az 1–5., Inter a 0. és 6–12. évfolyamon — önhostolt WOFF2, a manifest ő/ű-ellenőrzésével.
 */
export const LESSON_FONTS = ["Nunito Sans", "Inter"] as const;
export type LessonFont = typeof LESSON_FONTS[number];
/** Minden helyben kiszolgált család (client/public/fonts/lesson-fonts.css) — a régi HTML-témák leíró mezőihez. */
export type BundledFont = LessonFont | "Nunito" | "Source Sans 3" | "Source Serif 4";
export const HUNGARIAN_FONT_PROBE = "Árvíztűrő tükörfúrógép · ÁÉÍÓÖŐÚÜŰ áéíóöőúüű";
export const LESSON_FONT_CSS = "/fonts/lesson-fonts.css";
export const LESSON_FONT_VERSION = "hu-2";
/** A design-leírás tartaléklánca: a saját font után Noto Sans, majd rendszer sans-serif. */
export const LESSON_FONT_FALLBACK = '"Noto Sans", sans-serif';

/** Websuli Design: 1–5. o. Nunito Sans, 0. (programozás) és 6–12. o. Inter; a címsor ugyanaz a család (serif-kivétel nincs). */
export function lessonFontPair(classroom: number, _subject = ""): { body: LessonFont; heading: LessonFont } {
  const font: LessonFont = classroom >= 1 && classroom <= 5 ? "Nunito Sans" : "Inter";
  return { body: font, heading: font };
}

/**
 * Websuli Design (§2.4: tilos a hiányzó glifa pótlása): a lecke szövegei NFC-alakban jelennek meg — a felbontott (NFD) ő/ű is az
 * előre összetett glifát kapja a saját fontból (az Interben a kombinálható U+030B nincs, lásd client/public/fonts/manifest.json).
 */
export function nfcDeep<T>(value: T): T {
  if (typeof value === "string") return value.normalize("NFC") as T;
  if (Array.isArray(value)) return value.map((v) => nfcDeep(v)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, nfcDeep(v)])) as T;
  return value;
}

/** Preview and published HTML share this adapter; stored originals stay intact.
 * This is not HTML sanitization. Text and author scripts stay intact; opt-in interaction data receives the shared runtime.
 */
export function withLessonTypography(html: string, classroom = 7, subject = "", assetOrigin = ""): string {
  if (!html.trim()) return html;
  // Websuli Design (§2.4): NFC — a felbontott ő/ű is a lecke saját fontjának előre összetett glifáját kapja (nem tartalékfontot).
  html = html.normalize("NFC");
  const { body, heading } = lessonFontPair(classroom, subject);
  // Only a caller-provided HTTP(S) origin, never an arbitrary HTML/CSS fragment.
  const origin = assetOrigin ? new URL(assetOrigin).origin : "";
  if (origin && !/^https?:\/\//.test(origin)) throw new Error("Invalid font origin");
  const css = `<!--websuli-typography:start--><link id="websuli-fonts" rel="stylesheet" href="${origin}${LESSON_FONT_CSS}">
<style id="websuli-typography">
html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }
body { font-family:"${body}",${LESSON_FONT_FALLBACK}!important; line-height:1.65; }
body :where(p,div,span,strong,em,b,i,u,small,mark,li,a,button,input,textarea,select,label,td,th,dt,dd,summary,blockquote,figcaption,text):not(.katex *):not(.MathJax *) { font-family:"${body}",${LESSON_FONT_FALLBACK}!important; }
body :where(h1,h2,h3,h4,h5,h6) { font-family:"${heading}",${LESSON_FONT_FALLBACK}!important; line-height:1.3; padding-block:.08em; }
body :where(h1,h2,h3,h4,h5,h6) :where(span,a,strong,em) { font-family:inherit!important; }
button,input,textarea,select { font-size:inherit; }
</style><!--websuli-typography:end-->`;
  let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<!--websuli-typography:start-->[\s\S]*?<!--websuli-typography:end-->|<link\b[^>]*>/gi, tag => {
    if (/^<script/i.test(tag)) return tag;
    if (tag.startsWith("<!--websuli-typography:start-->")) return "";
    return /\bhref=["']https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\//i.test(tag) ? "" : tag;
  });
  if (/<\/head\s*>/i.test(out)) return withLessonInteractions(out.replace(/<\/head\s*>/i, `${css}</head>`), origin);
  if (/<html\b[^>]*>/i.test(out)) return withLessonInteractions(out.replace(/<html\b[^>]*>/i, tag => `${tag}<head><meta charset="utf-8">${css}</head>`), origin);
  out = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body>${out}</body></html>`;
  return withLessonInteractions(out, origin);
}

export const LESSON_TYPOGRAPHY_CONTRACT = `Magyar tipográfia (${LESSON_FONT_VERSION}): kizárólag Nunito Sans (1–5. évfolyam) és Inter (6–12. évfolyam).
Helyi készlet: <link rel="stylesheet" href="${LESSON_FONT_CSS}">. Normál és dőlt változat, 400–800 súly; teljes magyar kis- és nagybetűk, köztük ő/Ő/ű/Ű.
Ne tölts be Google Fonts vagy más külső fontot. Ne használj nem csomagolt díszbetűt. A fallback csak hálózati hibatűrés, nem bizonyíték az ékezethelyességre.
UTF-8 és lang="hu"; hibásan kódolt szöveget fontcsere nem javít. Látható próbasor: ${HUNGARIAN_FONT_PROBE}. A próbasor a minőségellenőrzés része, nem kell minden tananyagba kiírni.
Legalább 1.3 címsor-magasság és ékezeteknek elegendő felső tér. Szöveghez ne használj fix magasságot vagy overflow:hidden-t. A szöveges gomb és SVG-ábra felirata is a megadott készletet használja.`;
