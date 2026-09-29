import DOMPurify from "isomorphic-dompurify";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-lecke-dizajn.md, 1. pont): ábra-kontrasztőr.
 *
 * Élesben mért hiba (Hunyadi János, 6. o.): a modell világos pasztell kártyára `fill="currentColor"`
 * feliratot írt; sötét témában a currentColor világos lett → 1,17:1. Ez a modul megméri, milyen színen
 * áll ténylegesen egy felirat (a festési sorrendben előtte lévő, a helyét tartalmazó kitöltött alakzatok,
 * áttetszőséggel a papírra keverve), és ha kell, olvasható színt ad neki.
 *
 * DOM-alapú, de React-mentes: a szerver (jsdom, isomorphic-dompurify) és a böngésző ugyanazt futtatja.
 * A geometria becslés (a felirat közepe ~0,55 em/betűvel; görbék mintavételezve) — a cél az, hogy a
 * felirat mögötti szín ne a témától, hanem a rajztól függjön, és ≥ 4,5:1 legyen.
 */

export type Rgb = { r: number; g: number; b: number };
type Rgba = Rgb & { a: number };
export type Surface = { background: string; ink: string };
export type TextContrast = { text: string; color: string; background: string; ratio: number };

/** Az illusztráció témától független papírja (a kártyán belüli „tábla”) és tintája. */
export const ILLUSTRATION_PAPER = { background: "#f8fafc", ink: "#0f172a" } as const;
const DARK_TEXT = "#0f172a";
const LIGHT_TEXT = "#ffffff";
/** WCAG 2.x AA: szöveg 4,5:1, nem-szöveges elem (vonal, körvonal) 3:1. */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_GRAPHIC_CONTRAST = 3;

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500",
  purple: "#800080", gray: "#808080", grey: "#808080", brown: "#a52a2a", pink: "#ffc0cb", navy: "#000080", teal: "#008080",
  lime: "#00ff00", cyan: "#00ffff", aqua: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff", silver: "#c0c0c0", maroon: "#800000",
  olive: "#808000", gold: "#ffd700", darkblue: "#00008b", darkgreen: "#006400", darkred: "#8b0000", lightblue: "#add8e6",
  lightgreen: "#90ee90", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", darkgray: "#a9a9a9", darkgrey: "#a9a9a9", skyblue: "#87ceeb",
  beige: "#f5f5dc", tan: "#d2b48c", khaki: "#f0e68c", crimson: "#dc143c", coral: "#ff7f50", salmon: "#fa8072", ivory: "#fffff0",
  wheat: "#f5deb3", steelblue: "#4682b4", saddlebrown: "#8b4513", sienna: "#a0522d", forestgreen: "#228b22", seagreen: "#2e8b57",
  royalblue: "#4169e1", dodgerblue: "#1e90ff", slategray: "#708090", whitesmoke: "#f5f5f5", goldenrod: "#daa520", indigo: "#4b0082",
  violet: "#ee82ee", orchid: "#da70d6", turquoise: "#40e0d0", chocolate: "#d2691e", peru: "#cd853f", firebrick: "#b22222",
  tomato: "#ff6347", darkorange: "#ff8c00", lavender: "#e6e6fa", linen: "#faf0e6", aliceblue: "#f0f8ff", azure: "#f0ffff",
  snow: "#fffafa", gainsboro: "#dcdcdc", mintcream: "#f5fffa", honeydew: "#f0fff0",
};

/* ------------------------------------------------------------------ colour */

/** CSS szerinti vágás: csatorna 0–255, alfa/telítettség/világosság 0–1 (review #138: rgb(999,999,999) = fehér). */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** CSS/SVG szín → RGBA (0–255, a: 0–1), vagy null, ha nem szín (none, url(), ismeretlen). */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[v]) return parseColor(NAMED[v]);
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(([^)]*)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (s: string) => (s.endsWith("%") ? (parseFloat(s) * 255) / 100 : parseFloat(s));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const out = { r: clamp(ch(parts[0]), 0, 255), g: clamp(ch(parts[1]), 0, 255), b: clamp(ch(parts[2]), 0, 255), a: clamp(alpha, 0, 1) };
    return [ch(parts[0]), ch(parts[1]), ch(parts[2]), alpha].every(Number.isFinite) ? out : null;
  }
  m = /^hsla?\(([^)]*)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360, s = clamp(parseFloat(parts[1]) / 100, 0, 1), l = clamp(parseFloat(parts[2]) / 100, 0, 1);
    const rawAlpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if (![h, s, l, rawAlpha].every(Number.isFinite)) return null;
    const alpha = clamp(rawAlpha, 0, 1);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const hue = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255, a: alpha };
  }
  return null;
}

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ({ r, g, b }: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const asRgb = (c: string | Rgb): Rgb => (typeof c === "string" ? parseColor(c) ?? { r: 0, g: 0, b: 0 } : c);

/** WCAG 2.x kontrasztarány (1–21). */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const x = luminance(asRgb(a)), y = luminance(asRgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const over = (top: Rgba, under: Rgb): Rgb => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a) });
const toHex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** A háttérhez a nagyobb kontrasztot adó szín: sötét tinta vagy fehér. */
function readableOn(bg: Rgb): string {
  return contrastRatio(DARK_TEXT, bg) >= contrastRatio(LIGHT_TEXT, bg) ? DARK_TEXT : LIGHT_TEXT;
}

/* ---------------------------------------------------------------- geometry */

type Matrix = [number, number, number, number, number, number];
type Point = [number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, [x, y]: Point): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/** SVG `transform` → affin mátrix; ismeretlen alak → null (az elemet nem ítéljük meg). */
function parseTransform(value: string | null): Matrix | null {
  if (!value || !value.trim()) return IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  if (value.replace(re, "").replace(/[\s,]/g, "")) return null;
  let m = IDENTITY;
  for (let hit = re.exec(value); hit; hit = re.exec(value)) {
    const n = hit[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some((x) => !Number.isFinite(x))) return null;
    const rad = (d: number) => (d * Math.PI) / 180;
    let t: Matrix;
    switch (hit[1].toLowerCase()) {
      case "matrix": if (n.length !== 6) return null; t = n as Matrix; break;
      case "translate": t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]; break;
      case "scale": t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]; break;
      case "rotate": {
        const a = rad(n[0] ?? 0), c = Math.cos(a), s = Math.sin(a), cx = n[1] ?? 0, cy = n[2] ?? 0;
        t = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case "skewx": t = [1, 0, Math.tan(rad(n[0] ?? 0)), 1, 0, 0]; break;
      default: t = [1, Math.tan(rad(n[0] ?? 0)), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  return m;
}

/** Az elem teljes transzformációja a gyökérhez képest (saját + ősök), vagy null. */
function ctm(el: Element, root: Element): Matrix | null {
  const chain: Element[] = [];
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) chain.unshift(e);
  let m = IDENTITY;
  for (const e of chain) {
    const t = parseTransform(e.getAttribute("transform"));
    if (!t) return null;
    m = multiply(m, t);
  }
  return m;
}

const num = (el: Element, name: string, fallback = 0): number | null => {
  const v = el.getAttribute(name);
  if (v === null || v === "") return fallback;
  if (/%/.test(v)) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const pointsOf = (value: string | null): Point[] => {
  const n = (value ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
  const out: Point[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) if (Number.isFinite(n[i]) && Number.isFinite(n[i + 1])) out.push([n[i], n[i + 1]]);
  return out;
};

/** Elliptikus ív mintapontjai (SVG 1.1 F.6.5, végpontos → középpontos alak). */
function arcPoints(x1: number, y1: number, rxIn: number, ryIn: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Point[] {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (!rx || !ry) return [[x2, y2]];
  const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num2 / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const out: Point[] = [];
  for (let k = 1; k <= 8; k++) {
    const t = t1 + (dt * k) / 8;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return out;
}

/** Path → sokszögek (alútvonalanként), a görbék mintavételezve. */
function pathPolygons(d: string | null): Point[][] {
  const tokens = (d ?? "").match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  const polys: Point[][] = [];
  let poly: Point[] = [];
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, lastCtrl: Point | null = null, lastCmd = "";
  const next = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const bez = (p0: Point, pts: Point[]) => {
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const all = [p0, ...pts];
      let layer = all;
      while (layer.length > 1) layer = layer.slice(1).map((p, k) => [layer[k][0] + (p[0] - layer[k][0]) * t, layer[k][1] + (p[1] - layer[k][1]) * t] as Point);
      poly.push(layer[0]);
    }
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") {
      if (poly.length) polys.push(poly);
      poly = []; x = sx; y = sy; lastCtrl = null; lastCmd = C;
      cmd = ""; // a Z után csak új parancs jöhet; szám → vége (végtelen ciklus ellen)
      continue;
    }
    if (!isNum()) continue; // argumentum nélküli parancs: a következő kör a következő parancsot olvassa
    switch (C) {
      case "M": { if (poly.length) polys.push(poly); x = ox + next(); y = oy + next(); sx = x; sy = y; poly = [[x, y]]; cmd = rel ? "l" : "L"; lastCtrl = null; break; }
      case "L": x = ox + next(); y = oy + next(); poly.push([x, y]); lastCtrl = null; break;
      case "H": x = ox + next(); poly.push([x, y]); lastCtrl = null; break;
      case "V": y = oy + next(); poly.push([x, y]); lastCtrl = null; break;
      case "C": { const c1: Point = [ox + next(), oy + next()], c2: Point = [ox + next(), oy + next()], e: Point = [ox + next(), oy + next()]; bez([x, y], [c1, c2, e]); lastCtrl = c2; [x, y] = e; break; }
      case "S": { const c1: Point = lastCtrl && /[CS]/.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y]; const c2: Point = [ox + next(), oy + next()], e: Point = [ox + next(), oy + next()]; bez([x, y], [c1, c2, e]); lastCtrl = c2; [x, y] = e; break; }
      case "Q": { const c: Point = [ox + next(), oy + next()], e: Point = [ox + next(), oy + next()]; bez([x, y], [c, e]); lastCtrl = c; [x, y] = e; break; }
      case "T": { const c: Point = lastCtrl && /[QT]/.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y]; const e: Point = [ox + next(), oy + next()]; bez([x, y], [c, e]); lastCtrl = c; [x, y] = e; break; }
      case "A": { const rx = next(), ry = next(), rot = next(), large = next() !== 0, sweep = next() !== 0; const e: Point = [ox + next(), oy + next()]; poly.push(...arcPoints(x, y, rx, ry, rot, large, sweep, e[0], e[1])); [x, y] = e; lastCtrl = null; break; }
      default: i++;
    }
    lastCmd = C;
    if (![x, y].every(Number.isFinite)) return polys;
  }
  if (poly.length) polys.push(poly);
  return polys;
}

function insidePolygons(polys: Point[][], [px, py]: Point): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
    }
  }
  return inside;
}

/** Tartalmazza-e az alakzat (saját koordinátákban) a pontot? null = nem ítélhető. */
function shapeContains(el: Element, p: Point): boolean | null {
  switch (el.tagName.toLowerCase()) {
    case "rect": {
      const x = num(el, "x"), y = num(el, "y"), w = num(el, "width", NaN), h = num(el, "height", NaN);
      if (x === null || y === null || w === null || h === null || !Number.isFinite(w) || !Number.isFinite(h)) return null;
      return p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + h;
    }
    case "circle": {
      const cx = num(el, "cx"), cy = num(el, "cy"), r = num(el, "r");
      if (cx === null || cy === null || r === null) return null;
      return (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= r * r;
    }
    case "ellipse": {
      const cx = num(el, "cx"), cy = num(el, "cy"), rx = num(el, "rx"), ry = num(el, "ry");
      if (cx === null || cy === null || rx === null || ry === null || !rx || !ry) return null;
      return ((p[0] - cx) / rx) ** 2 + ((p[1] - cy) / ry) ** 2 <= 1;
    }
    case "polygon":
    case "polyline": return insidePolygons([pointsOf(el.getAttribute("points"))], p);
    case "path": return insidePolygons(cachedPath(el.getAttribute("d") ?? ""), p);
    default: return null;
  }
}

/* Feliratonként minden előtte lévő alakzatot vizsgálunk (≤ 400 elem): a path-sokszöget és az inverz
   transzformációt egyszer számoljuk. A geometria a javítás közben nem változik (csak szín). */
const PATH_CACHE = new Map<string, Point[][]>();
function cachedPath(d: string): Point[][] {
  let hit = PATH_CACHE.get(d);
  if (!hit) {
    if (PATH_CACHE.size > 2000) PATH_CACHE.clear();
    hit = pathPolygons(d);
    PATH_CACHE.set(d, hit);
  }
  return hit;
}
const INVERSE_CACHE = new WeakMap<Element, Matrix | null>();
function inverseCtm(el: Element, root: Element): Matrix | null {
  if (INVERSE_CACHE.has(el)) return INVERSE_CACHE.get(el)!;
  const m = ctm(el, root);
  const inv = m && invert(m);
  INVERSE_CACHE.set(el, inv);
  return inv;
}

/** A körvonal egy pontja (saját koordinátákban), amely alatt a hátteret mérjük. */
function strokePoint(el: Element): Point | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "line") {
    const x1 = num(el, "x1"), y1 = num(el, "y1"), x2 = num(el, "x2"), y2 = num(el, "y2");
    return x1 === null || y1 === null || x2 === null || y2 === null ? null : [(x1 + x2) / 2, (y1 + y2) / 2];
  }
  if (tag === "rect") { const x = num(el, "x"), y = num(el, "y"), h = num(el, "height", NaN); return x === null || y === null || h === null || !Number.isFinite(h) ? null : [x, y + h / 2]; }
  if (tag === "circle") { const cx = num(el, "cx"), cy = num(el, "cy"), r = num(el, "r"); return cx === null || cy === null || r === null ? null : [cx + r, cy]; }
  if (tag === "ellipse") { const cx = num(el, "cx"), cy = num(el, "cy"), rx = num(el, "rx"); return cx === null || cy === null || rx === null ? null : [cx + rx, cy]; }
  const pts = tag === "path" ? pathPolygons(el.getAttribute("d"))[0] ?? [] : pointsOf(el.getAttribute("points"));
  if (pts.length >= 2) return [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  return pts[0] ?? null;
}

/* ------------------------------------------------------------------ paint */

const SHAPES = new Set(["rect", "circle", "ellipse", "polygon", "polyline", "path"]);
const NON_PAINTED = new Set(["defs", "marker", "lineargradient", "radialgradient", "title", "desc", "clippath", "mask", "pattern", "symbol"]);

const inherited = (el: Element, name: string, root: Element): string | null => {
  for (let e: Element | null = el; e; e = e === root ? null : e.parentElement) { const v = e.getAttribute(name); if (v !== null && v !== "" && v !== "inherit") return v; }
  return null;
};
const opacityChain = (el: Element, root: Element): number => {
  let o = 1;
  for (let e: Element | null = el; e; e = e === root ? null : e.parentElement) { const v = parseFloat(e.getAttribute("opacity") ?? "1"); if (Number.isFinite(v)) o *= Math.min(1, Math.max(0, v)); }
  return o;
};
const inNonPainted = (el: Element, root: Element) => { for (let e: Element | null = el; e && e !== root; e = e.parentElement) if (NON_PAINTED.has(e.tagName.toLowerCase())) return true; return false; };

/** A kitöltés/körvonal tényleges színe (a gradiens stop-színeinek átlaga), vagy null (nincs festés / nem ítélhető). */
function paintOf(el: Element, root: Element, kind: "fill" | "stroke", ink: string): Rgba | null {
  const raw = inherited(el, kind, root) ?? (kind === "fill" ? "#000000" : "none");
  const value = raw.trim();
  if (/^none$/i.test(value)) return null;
  let color: Rgba | null;
  const url = /^url\(\s*#([\w-]+)\s*\)/i.exec(value);
  if (url) {
    const grad = Array.from(root.querySelectorAll("linearGradient, radialGradient")).find((g) => g.getAttribute("id") === url[1]);
    const stops = grad ? Array.from(grad.querySelectorAll("stop")) : [];
    const colors = stops.map((s) => {
      const c = parseColor(/^currentcolor$/i.test(s.getAttribute("stop-color") ?? "") ? ink : s.getAttribute("stop-color") ?? "#000000");
      const so = parseFloat(s.getAttribute("stop-opacity") ?? "1");
      return c ? { ...c, a: c.a * (Number.isFinite(so) ? so : 1) } : null;
    }).filter((c): c is Rgba => !!c);
    if (!colors.length) return null;
    const avg = (k: keyof Rgba) => colors.reduce((s, c) => s + c[k], 0) / colors.length;
    color = { r: avg("r"), g: avg("g"), b: avg("b"), a: avg("a") };
  } else {
    color = parseColor(/^currentcolor$/i.test(value) ? ink : value);
  }
  if (!color) return null;
  const partial = parseFloat(inherited(el, `${kind}-opacity`, root) ?? "1");
  return { ...color, a: color.a * (Number.isFinite(partial) ? Math.min(1, Math.max(0, partial)) : 1) * opacityChain(el, root) };
}

/** A pont (gyökér-koordinátában) mögötti szín: a `before` előtti kitöltött alakzatok a mezőre keverve. */
function backgroundAt(root: Element, point: Point, before: Element, surface: Surface, skip?: Element): Rgb {
  let bg: Rgb = parseColor(surface.background) ?? { r: 255, g: 255, b: 255 };
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el === before) break;
    if (el === skip || !SHAPES.has(el.tagName.toLowerCase()) || inNonPainted(el, root)) continue;
    const fill = paintOf(el, root, "fill", surface.ink);
    if (!fill || fill.a <= 0) continue;
    const inv = inverseCtm(el, root);
    if (!inv) continue;
    if (shapeContains(el, apply(inv, point))) bg = over(fill, bg);
  }
  return bg;
}

type TextPart = { el: Element; text: string; point: Point };

/**
 * Hossz felhasználói egységben: szám, px, em (× betűméret), ex (× fél betűméret). `undefined` = nincs megadva,
 * `null` = nem támogatott (pl. %) — ilyenkor a felirat helye nem számolható, a tisztító elutasít.
 */
function lengthOf(value: string | null, fontSize: number): number | null | undefined {
  if (value === null || !value.trim()) return undefined;
  const m = /^([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)(px|em|ex)?$/i.exec(value.trim().split(/[\s,]+/)[0]);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  return unit === "em" ? n * fontSize : unit === "ex" ? n * fontSize * 0.5 : n;
}

/**
 * A felirat szövegszakaszai és becsült középpontjuk gyökér-koordinátában. Review #138: az SVG szövegkurzort
 * követjük — x/y abszolút (új szövegdarab, a `text-anchor` erre hat), dx/dy relatív eltolás, a szöveg a
 * becsült szélességgel (~0,55 em/betű) lépteti a kurzort. Így a többsoros (`tspan x dy`) felirat soronként mérődik.
 */
function textParts(text: Element, root: Element, unsupported?: string[]): TextPart[] {
  const m = ctm(text, root);
  if (!m) return [];
  const fontSize = (el: Element) => { const v = parseFloat(inherited(el, "font-size", root) ?? "16"); return Number.isFinite(v) && v > 0 ? v : 16; };
  const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const cursor = { x: 0, y: 0 };
  let bad = false;
  const position = (el: Element): boolean => {
    const fs = fontSize(el);
    const [x, y, dx, dy] = ["x", "y", "dx", "dy"].map((name) => lengthOf(el.getAttribute(name), fs));
    if ([x, y, dx, dy].some((v) => v === null)) bad = true;
    if (typeof x === "number") cursor.x = x;
    if (typeof y === "number") cursor.y = y;
    if (typeof dx === "number") cursor.x += dx;
    if (typeof dy === "number") cursor.y += dy;
    return typeof x === "number" || typeof y === "number";
  };
  const parts: TextPart[] = [];
  const walk = (el: Element, chunkStart: boolean) => {
    let startsChunk = chunkStart;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const content = clean(node.textContent);
        if (!content) continue;
        const fs = fontSize(el);
        const w = content.length * fs * 0.55;
        const anchor = inherited(el, "text-anchor", root) ?? "start";
        const x0 = startsChunk ? (anchor === "middle" ? cursor.x - w / 2 : anchor === "end" ? cursor.x - w : cursor.x) : cursor.x;
        startsChunk = false;
        parts.push({ el, text: content, point: apply(m, [x0 + w / 2, cursor.y - fs * 0.35]) });
        cursor.x = x0 + w;
      } else if (node.nodeType === 1 && (node as Element).tagName.toLowerCase() === "tspan") {
        const child = node as Element;
        const absolute = position(child);
        walk(child, absolute || startsChunk);
        startsChunk = false;
      }
    }
  };
  position(text);
  walk(text, true);
  if (bad) unsupported?.push(clean(text.textContent));
  return parts;
}

function measureRoot(root: Element, surface: Surface, unsupported?: string[]): Array<TextContrast & { el: Element; bg: Rgb }> {
  const out: Array<TextContrast & { el: Element; bg: Rgb }> = [];
  for (const text of Array.from(root.querySelectorAll("text"))) {
    if (inNonPainted(text, root)) continue;
    for (const part of textParts(text, root, unsupported)) {
      const paint = paintOf(part.el, root, "fill", surface.ink);
      if (!paint) continue;
      const bg = backgroundAt(root, part.point, text, surface);
      const ink = over(paint, bg);
      out.push({ el: part.el, bg, text: part.text, color: toHex(ink), background: toHex(bg), ratio: contrastRatio(ink, bg) });
    }
  }
  return out;
}

const parseSvg = (svg: string): Element | null => {
  const fragment = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true }, RETURN_DOM_FRAGMENT: true }) as unknown as DocumentFragment;
  const root = fragment.firstElementChild;
  return root && root.tagName.toLowerCase() === "svg" ? root : null;
};

/**
 * Feliratonként a tényleges szín, háttér és kontrasztarány, ha az SVG a megadott felületen (kártyaháttér,
 * `currentColor` = a felület tintája) jelenik meg. Tiszta mérés, nem módosít.
 */
export function measureIllustrationText(svg: string, surface: Surface): TextContrast[] {
  const root = parseSvg(svg);
  return root ? measureRoot(root, surface).map(({ text, color, background, ratio }) => ({ text, color, background, ratio })) : [];
}

/** Sötét és világos témájú lecke-kártya (a „currentColor” a téma tintája) — a témafüggőség próbája. */
const THEME_PROBES: Surface[] = [{ background: "#1e293b", ink: "#f1f5f9" }, { background: "#ffffff", ink: "#172c45" }];

/**
 * Azok a feliratok, amelyek a rajz ÁTALAKÍTÁSA ELŐTT valamelyik témán olvashatatlanok volnának (pl. világos
 * kitöltésen `currentColor`, ami sötét témában világos). Ez a modellnek szóló jelzés alapja.
 */
export function themeDependentTexts(root: Element): string[] {
  const [dark, light] = THEME_PROBES.map((surface) => measureRoot(root, surface));
  const bad = new Set<string>();
  // Témafüggő = a felirat színe a téma tintájából jön (currentColor), és valamelyik témán < 4,5:1.
  dark.forEach((d, i) => { const l = light[i]; if (l && d.color !== l.color && Math.min(d.ratio, l.ratio) < MIN_TEXT_CONTRAST) bad.add(d.text); });
  return [...bad];
}

const PRESENTATION = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline"];

/**
 * Review #138: az ős `<g opacity>` a felirat színétől függetlenül halványít — a szín cseréje ott nem elég.
 * A feliratot kivesszük a halványított csoportból: a gyökér végére kerül a teljes transzformációjával
 * (`matrix(…)`) és az örökölt megjelenítési attribútumaival, így ugyanott, ugyanúgy, de teljes fedéssel látszik.
 */
function liftOutOfFadedGroup(text: Element, root: Element): void {
  const m = ctm(text, root);
  if (!m || !text.parentElement || text.parentElement === root) return;
  for (const name of PRESENTATION) {
    if (text.getAttribute(name) !== null) continue;
    const value = inherited(text.parentElement, name, root);
    if (value !== null) text.setAttribute(name, value);
  }
  const identity = m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9);
  if (identity) text.removeAttribute("transform");
  else text.setAttribute("transform", `matrix(${m.map((v) => +v.toFixed(6)).join(" ")})`);
  text.removeAttribute("opacity");
  root.appendChild(text);
}

/**
 * A feliratok színe a mögöttük lévő színhez (≥ 4,5:1), a csak-körvonalas elemeké a háttérhez (≥ 3:1).
 * Ami megfelel, változatlan; ami nem, sötét tintát vagy fehéret kap — amelyik jobban olvasható; ha egy
 * halványított csoport miatt így sem elég, a felirat kikerül a csoportból. Visszaadja a javított feliratokat.
 * Az eredményt a hívó az `illustrationTextProblems`-szel UTÓMÉRI — csak az számít sikernek.
 */
export function enforceIllustrationContrast(root: Element, paper: Surface = ILLUSTRATION_PAPER): string[] {
  const fixed: string[] = [];
  // Két kör: a kiemelt felirat a festési sorrend végére kerül, ott más lehet a háttere — újramérjük.
  for (let round = 0; round < 2; round++) {
    for (const t of measureRoot(root, paper)) {
      if (t.ratio >= MIN_TEXT_CONTRAST) continue;
      t.el.setAttribute("fill", readableOn(t.bg));
      if (parseFloat(inherited(t.el, "fill-opacity", root) ?? "1") < 1) t.el.setAttribute("fill-opacity", "1");
      const text = t.el.closest("text");
      for (let e: Element | null = t.el; e && e !== text?.parentElement; e = e.parentElement) e.removeAttribute("opacity");
      if (text && text.parentElement && opacityChain(text.parentElement, root) < 1) liftOutOfFadedGroup(text, root);
      if (!fixed.includes(t.text)) fixed.push(t.text);
    }
  }
  for (const el of Array.from(root.querySelectorAll("line, polyline, path, rect, circle, ellipse, polygon"))) {
    if (inNonPainted(el, root)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag !== "line" && paintOf(el, root, "fill", paper.ink)) continue; // kitöltött alakzat: a körvonal csak szegély
    const stroke = paintOf(el, root, "stroke", paper.ink);
    const local = strokePoint(el);
    const m = ctm(el, root);
    if (!stroke || !local || !m) continue;
    const bg = backgroundAt(root, apply(m, local), el, paper, el);
    if (contrastRatio(over(stroke, bg), bg) >= MIN_GRAPHIC_CONTRAST) continue;
    el.setAttribute("stroke", readableOn(bg));
    if (parseFloat(inherited(el, "stroke-opacity", root) ?? "1") < 1) el.setAttribute("stroke-opacity", "1");
  }
  return fixed;
}

/**
 * Utómérés (review #138): a tisztító csak akkor ad `ok`-t, ha ez üres. Nem támogatott feliratpozíció
 * (pl. %-os dy) vagy a javítás után is 4,5:1 alatti felirat → az ábra elutasítva, okkal.
 */
export function illustrationTextProblems(root: Element, paper: Surface = ILLUSTRATION_PAPER): string[] {
  const unsupported: string[] = [];
  const low = measureRoot(root, paper, unsupported).filter((t) => t.ratio < MIN_TEXT_CONTRAST);
  const problems: string[] = [];
  if (unsupported.length) problems.push(`nem támogatott feliratpozíció (csak szám, px, em, ex): ${[...new Set(unsupported)].slice(0, 4).join(", ")}`);
  if (low.length) problems.push(`olvashatatlan felirat a javítás után is: ${low.slice(0, 4).map((t) => `${t.text} (${t.ratio.toFixed(2)}:1)`).join(", ")}`);
  return problems;
}
