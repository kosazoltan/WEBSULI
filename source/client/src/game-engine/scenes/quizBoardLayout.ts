/**
 * Szólétra 3D kérdés — tiszta elrendezés, színek, olvashatóság (spec 2026-09-29-palyak-szoletra-nyelvek, 7. döntés).
 *
 * A DOM a layout forrása: a 3D lapok pontosan a DOM-gombok téglalapjára kerülnek. A kamera keskeny látószögű
 * perspektív kamera, a lapok síkja z = 0, ahol 1 világegység = 1 CSS px — így a lap nem torzul, és a rajzolt
 * betűméret CSS px-ben mérhető. A színek `toneMapped: false` anyagon jelennek meg, tehát a kontraszt a tervezett.
 */
import type { LookTier } from "../three-look/tier";

/** Függőleges látószög (fok). A terv felső határa 12°. */
export const QUIZ3D_FOV_DEG = 10;
/** A válaszlapok betűmérete (CSS px); a 390 px-es nézetben is ennyi. */
export const QUIZ3D_OPTION_FONT_PX = 20;
/** A kérdéstábla betűmérete (CSS px). */
export const QUIZ3D_PROMPT_FONT_PX = 22;
/** A lapok vastagsága (világegység = CSS px) — a 3D élhez, a lap arca a z = 0 síkon marad. */
export const QUIZ3D_TILE_DEPTH = 10;

export type TileState = "idle" | "hover" | "correct" | "wrong" | "dim";

export type TileStyle = { face: string; text: string; edge: string; badge: string; badgeText: string };

/** Lapállapotok. Minden szöveg/háttér pár ≥ 4,5:1 (teszt). */
export const QUIZ3D_TILE_STYLES: Record<TileState, TileStyle> = {
  idle: { face: "#ffffff", text: "#0f172a", edge: "#38bdf8", badge: "#1d4ed8", badgeText: "#ffffff" },
  hover: { face: "#fef3c7", text: "#0f172a", edge: "#f59e0b", badge: "#b45309", badgeText: "#ffffff" },
  correct: { face: "#15803d", text: "#ffffff", edge: "#86efac", badge: "#ffffff", badgeText: "#14532d" },
  wrong: { face: "#be123c", text: "#ffffff", edge: "#fda4af", badge: "#ffffff", badgeText: "#881337" },
  dim: { face: "#cbd5e1", text: "#1e293b", edge: "#64748b", badge: "#475569", badgeText: "#ffffff" },
};

/** Az egyes válaszlapok keretszíne (gyerekbarát, négy jól elkülönülő szín). Csak díszítés, szöveg nincs rajta. */
export const QUIZ3D_OPTION_ACCENTS = ["#38bdf8", "#f472b6", "#4ade80", "#fb923c"] as const;

/** A kérdéstábla: krémszínű tábla, sötét szöveg, fa keret. */
export const QUIZ3D_BOARD_STYLE = { face: "#fff7e0", text: "#1e293b", edge: "#b45309" } as const;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 kontrasztarány (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A kamera távolsága, amelynél a z = 0 sík látható magassága pontosan `heightPx`. */
export function cameraDistanceFor(heightPx: number, fovDeg: number = QUIZ3D_FOV_DEG): number {
  return heightPx / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

export type CssRect = { left: number; top: number; width: number; height: number };

/** A vászonhoz mért CSS-téglalap → a z = 0 sík középpontja és mérete (origó a vászon közepén, y felfelé). */
export function rectToWorld(rect: CssRect, viewWidth: number, viewHeight: number): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.left + rect.width / 2 - viewWidth / 2,
    y: viewHeight / 2 - (rect.top + rect.height / 2),
    w: rect.width,
    h: rect.height,
  };
}

/** Szóhatáron tördelt sorok; szót nem vág (a túl hosszú szó saját sorba kerül). */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = words[0]!;
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (measure(candidate) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/** A 3D kérdésréteg csak valódi WebGL-lel és nem low szinten él; különben a DOM-kártya marad. */
export function quiz3dEnabled(tier: LookTier, webgl: boolean | null): boolean {
  return tier !== "low" && webgl !== false;
}
