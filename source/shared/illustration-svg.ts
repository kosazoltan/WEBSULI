import DOMPurify from "isomorphic-dompurify";
import { enforceIllustrationContrast, illustrationTextProblems, ILLUSTRATION_PAPER, themeDependentTexts } from "./svg-contrast";

/**
 * Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 2. szelet): szabad SVG-illusztráció.
 *
 * Az ábrakészítő (Claude Opus 5.5) SVG-t rajzolhat ott, ahol a paraméteres fajták nem mutatják a
 * lényeget (pl. Stonehenge kőkörei, egy sejt részei). A modell kimenete ADAT: szigorú allowlist
 * (alap alakzatok, szöveg, színátmenet, nyílhegy), nincs script, esemény, stílus, `foreignObject`,
 * kép, `use` vagy külső hivatkozás; csak belső `url(#…)`. A szerver a beillesztéskor, a kliens a
 * megjelenítéskor ugyanezzel a függvénnyel tisztít.
 */

const TAGS = ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text", "tspan",
  "defs", "linearGradient", "radialGradient", "stop", "marker", "title", "desc"];
const ATTRS = ["viewBox", "xmlns", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy",
  "d", "points", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity",
  "fill-opacity", "stroke-opacity", "transform", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline",
  "dx", "dy", "id", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "marker-start", "marker-end",
  "marker-mid", "refX", "refY", "markerWidth", "markerHeight", "orient", "markerUnits", "role", "aria-label", "preserveAspectRatio"];

export const ILLUSTRATION_MAX_CHARS = 30_000;
/**
 * Review #138: a tisztító kimenete nagyobb a bemenetnél (papír-háttér, role, kontraszt-színek, `<rect></rect>`
 * szerializálás). A saját kimenetét (a papír-jelölővel) ezért a papír nélkül, a kimeneti korláttal méri —
 * így `sanitize(sanitize(x)) === sanitize(x)` a határ közelében is. A modell bemenete a 30 000-es korlát alatt marad.
 */
export const ILLUSTRATION_OUTPUT_MAX_CHARS = 2 * ILLUSTRATION_MAX_CHARS;
const MAX_ELEMENTS = 400;

export type IllustrationCheck = { ok: true; svg: string; labels: string[]; contrastFixes: string[] } | { ok: false; problems: string[] };

const SVG_NS = "http://www.w3.org/2000/svg";
const PAPER_ID = "websuli-paper";
const PAPER_MARKUP = /<path\b[^>]*\bid="websuli-paper"[^>]*>(?:\s*<\/path>)?/g;
const withoutPaper = (svg: string) => svg.replace(PAPER_MARKUP, "");

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-lecke-dizajn.md, 1. pont): témafüggetlen illusztráció.
 * Élesben mérve: a `currentColor` felirat a sötét témában világos lett a modell világos kártyáján (1,17:1).
 * Ezért az SVG saját papírt kap (idempotensen), minden `currentColor` a papír tintája lesz, és a
 * kontraszt-őr a feliratokat a ténylegesen mögöttük lévő színhez igazítja.
 */
function makeThemeIndependent(root: Element, viewBox: number[]): string[] {
  const dependent = themeDependentTexts(root);
  for (const old of Array.from(root.querySelectorAll(`#${PAPER_ID}`))) old.remove();
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const name of ["fill", "stroke", "stop-color"]) {
      if (/^\s*currentcolor\s*$/i.test(el.getAttribute(name) ?? "")) el.setAttribute(name, ILLUSTRATION_PAPER.ink);
    }
  }
  const [vx, vy, vw, vh] = viewBox;
  const paper = root.ownerDocument.createElementNS(SVG_NS, "path");
  paper.setAttribute("id", PAPER_ID);
  // `path`, nem `rect`: a tisztított kimenetben nincs width/height attribútum (a befoglaló elem méretez).
  paper.setAttribute("d", `M${vx} ${vy}h${vw}v${vh}h${-vw}z`);
  paper.setAttribute("fill", ILLUSTRATION_PAPER.background);
  root.insertBefore(paper, root.firstChild);
  const fixed = enforceIllustrationContrast(root, ILLUSTRATION_PAPER);
  return [...new Set([...dependent, ...fixed])];
}

/** Tisztított SVG és feliratai, vagy az elutasítás okai. */
export function sanitizeIllustration(raw: unknown): IllustrationCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, problems: ["hiányzó svg"] };
  if (raw.length > ILLUSTRATION_OUTPUT_MAX_CHARS + 1000) return { ok: false, problems: [`túl nagy svg (${raw.length} > ${ILLUSTRATION_MAX_CHARS} karakter)`] };
  const content = withoutPaper(raw);
  const limit = content.length !== raw.length ? ILLUSTRATION_OUTPUT_MAX_CHARS : ILLUSTRATION_MAX_CHARS;
  if (content.length > limit) return { ok: false, problems: [`túl nagy svg (${content.length} > ${limit} karakter)`] };
  const fragment = DOMPurify.sanitize(raw.trim(), {
    USE_PROFILES: { svg: true },
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    FORBID_TAGS: ["style", "script", "foreignObject", "image", "use", "a", "animate", "set"],
    FORBID_ATTR: ["style", "href", "xlink:href"],
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment;
  const root = fragment.firstElementChild;
  const problems: string[] = [];
  if (!root || root.tagName.toLowerCase() !== "svg" || fragment.children.length !== 1) return { ok: false, problems: ["a gyökér nem egyetlen <svg> elem"] };
  const viewBox = root.getAttribute("viewBox");
  // Review #138: négy véges szám, pozitív szélesség és magasság (a „. . . .” és a 0/negatív méret NaN-os papírt adott).
  const vbTokens = (viewBox ?? "").trim().split(/[\s,]+/).filter(Boolean);
  const vb = vbTokens.map(Number);
  if (vbTokens.length !== 4 || !vbTokens.every((n) => /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?$/i.test(n)) || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) {
    problems.push("hiányzó vagy hibás viewBox (négy véges szám, pozitív szélesség és magasság)");
  }
  // A saját papír-háttér nem a modell eleme: a kliens újratisztításakor sem számít bele a korlátba.
  const elements = Array.from(root.querySelectorAll("*")).filter((el) => el.getAttribute("id") !== PAPER_ID);
  if (elements.length > MAX_ELEMENTS) problems.push(`túl sok elem (${elements.length} > ${MAX_ELEMENTS})`);
  for (const el of [root, ...elements]) {
    for (const attr of Array.from(el.attributes)) {
      const value = attr.value;
      if (/url\(/i.test(value) && !/^\s*url\(\s*#[\w-]+\s*\)\s*$/i.test(value)) problems.push(`külső hivatkozás: ${attr.name}`);
      if (/javascript:|data:/i.test(value)) problems.push(`tiltott érték: ${attr.name}`);
    }
  }
  const labels = Array.from(root.querySelectorAll("text")).map((t) => (t.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!labels.length) problems.push("nincs felirat — az illusztráció nem nevezi meg, mit mutat");
  if (problems.length) return { ok: false, problems };
  // Rugalmas méretezés: a befoglaló elem szélessége dönt, az arányt a viewBox adja.
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.setAttribute("role", "img");
  const contrastFixes = makeThemeIndependent(root, vb);
  // Utómérés: csak akkor ok, ha a javítás után MINDEN felirat ≥ 4,5:1 és a helye számolható.
  const after = illustrationTextProblems(root, ILLUSTRATION_PAPER);
  if (after.length) return { ok: false, problems: after };
  const svg = root.outerHTML;
  if (withoutPaper(svg).length > ILLUSTRATION_OUTPUT_MAX_CHARS) return { ok: false, problems: [`túl nagy svg a tisztítás után (${withoutPaper(svg).length} > ${ILLUSTRATION_OUTPUT_MAX_CHARS} karakter)`] };
  return { ok: true, svg, labels, contrastFixes };
}

const words = (text: string) => text.toLocaleLowerCase("hu").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * A lecke/térkép szövegében nem szereplő feliratok. Magyar ragozás miatt a szavakat 4 betűs tőre
 * vetjük össze („Holdat” ↔ „Hold”); szám pontosan szerepeljen; 1–3 betűs jel (A, B, É) szabad.
 */
export function ungroundedLabels(labels: string[], corpus: string): string[] {
  const corpusWords = words(corpus);
  const stems = new Set(corpusWords.filter((w) => !/\d/.test(w) && w.length >= 4).map((w) => w.slice(0, 4)));
  const numbers = new Set(corpusWords.filter((w) => /\d/.test(w)));
  return labels.filter((label) => words(label).some((w) => {
    if (/\d/.test(w)) return !numbers.has(w);
    if (w.length <= 3) return false;
    return !stems.has(w.slice(0, 4));
  }));
}

/** Telefonos tartalomszélesség (375 px-es nézetben mérve: 317 px) és a legkisebb olvasható betű. */
const PHONE_WIDTH_PX = 317;
const MIN_FONT_PX = 11.5;

type Box = { text: string; x0: number; x1: number; y0: number; y1: number };

/**
 * Élő mérés (2026-09-24, Opus 5.5-illusztrációk 375 px-en): 11,1 px-es betű és egymásra csúszó feliratok.
 * A jsdom nem rendez el, ezért a feliratok dobozát az attribútumokból becsüljük (x, y, font-size,
 * text-anchor, ~0,55 em/betű); transzformált feliratot nem ítélünk meg.
 */
export function illustrationLayoutProblems(svg: string): string[] {
  const fragment = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true }, RETURN_DOM_FRAGMENT: true }) as unknown as DocumentFragment;
  const root = fragment.firstElementChild;
  const vb = root?.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!root || !vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0) return [];
  const [vx, vy, vw, vh] = vb;
  const inherited = (el: Element | null, name: string): string | null => {
    for (let e = el; e && e !== root.parentElement; e = e.parentElement) { const v = e.getAttribute(name); if (v) return v; }
    return null;
  };
  const transformed = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) if (e.getAttribute("transform")) return true; return false; };
  const boxes: Box[] = [];
  const small = new Set<string>();
  for (const text of Array.from(root.querySelectorAll("text"))) {
    if (transformed(text)) continue;
    const parts = text.querySelectorAll("tspan[x], tspan[y]").length ? Array.from(text.querySelectorAll("tspan")) : [text];
    for (const part of parts) {
      const content = (part.textContent ?? "").trim();
      if (!content) continue;
      const fs = parseFloat(inherited(part, "font-size") ?? "16");
      const x = parseFloat(part.getAttribute("x") ?? text.getAttribute("x") ?? "0");
      const y = parseFloat(part.getAttribute("y") ?? text.getAttribute("y") ?? "0");
      if (!Number.isFinite(fs) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (fs * (PHONE_WIDTH_PX / vw) < MIN_FONT_PX) small.add(content);
      const w = content.length * fs * 0.55;
      const anchor = inherited(part, "text-anchor") ?? "start";
      const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      boxes.push({ text: content, x0, x1: x0 + w, y0: y - fs * 0.8, y1: y + fs * 0.2 });
    }
  }
  const problems: string[] = [];
  if (small.size) problems.push(`túl kicsi betű telefonon (< ${MIN_FONT_PX} px; a viewBox ${vw} szélességénél legalább ${Math.ceil((MIN_FONT_PX * vw) / PHONE_WIDTH_PX)} kell): ${[...small].slice(0, 4).join(", ")}`);
  const outside = boxes.filter((b) => b.x0 < vx - 1 || b.x1 > vx + vw + 1 || b.y0 < vy - 1 || b.y1 > vy + vh + 1).map((b) => b.text);
  if (outside.length) problems.push(`a rajzterületből kilógó felirat: ${outside.slice(0, 4).join(", ")}`);
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2) overlaps.push(`„${a.text}” × „${b.text}”`);
  }
  if (overlaps.length) problems.push(`egymásra csúszó felirat: ${overlaps.slice(0, 3).join("; ")}`);
  return problems;
}
