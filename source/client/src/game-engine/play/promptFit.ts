/**
 * J0c-b — befér-e a kérdés a kérdés-sávba KOPPINTÁS NÉLKÜL, és elolvasható-e a válaszablakon belül
 * (kanban #46; terv 4.1/4–5, 8.9, J10; végrehajtás J0c).
 *
 * Tiszta, DOM nélküli becslő: a sáv geometriáját (`index.css` `.play-question*`) és a betűméretét képletben tükrözi, a
 * sortörést szavanként szimulálja. A becslés szándékosan óvatos (széles betűket feltételez); a sáv maga ettől függetlenül
 * VALÓDI méréssel igazodik (`InlineQuestion`: 5 sor → 15 px-en 7 sor → csak végső tartalékként „Mutasd”), ezt a segédet a
 * kérdésforrás használja, hogy a sávba nem férő / a 9 mp alatt el nem olvasható tételt hátrébb sorolja
 * (`DirectorConfig.promptFits`, vagy a játék saját választója).
 *
 * Olvasási idő: `reading.ts` (feltételezett szó/perc évfolyamonként + 1,5 mp döntés). „Olvasható” = ez ≤ 9 mp.
 *
 * Használat (játékszelet):
 *   import { fitsInline, fitsAllViewports } from "@/game-engine/play";
 *   const config: DirectorConfig = { …, promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs }).ok };
 *   // vagy egy nézetre: fitsInline(quiz.prompt, { width: innerWidth, height: innerHeight }, { grade, options: quiz.options }).ok
 */
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import { windowMsFor } from "./questionDirector";
import { READING_WINDOW_CAP_MS, readingMsFor } from "./reading";

export { DECIDE_MS, readingMsFor, readingWpm, wordsOf } from "./reading";

export type PromptViewport = { width: number; height: number };

/** A mért mobilnézetek (`T/support/game-mobile-quality.ts` `MOBILE_VIEWPORTS`). */
export const PROMPT_VIEWPORTS: readonly PromptViewport[] = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

/** E fölött (karakter) a prompt kisebb betűt kap (`[data-long="true"]`). */
export const LONG_PROMPT_CHARS = 70;
/** Kibontás nélkül ennyi sor fér a sávba (mindhárom nézetben). */
export const PROMPT_MAX_LINES = 5;
/** A valódi mérés tartaléka: 15 px-en ennyi sorig nő a kártya, mielőtt a „Mutasd” megjelenne. */
export const PROMPT_EXTENDED_LINES = 7;
export const PROMPT_MIN_FONT_PX = 15;
/** A válaszgomb felirata legfeljebb ennyi sor (a „szén-monoxid” két sorba törése rendben van, a 3+ nem). */
export const OPTION_MAX_LINES = 2;

/** Átlagos betűszélesség em-ben, félkövér betűre, óvatosan (szélesebb a Roboto / SF félkövérnél). */
const CHAR_EM = 0.6;
const NARROW_EM = 0.32;
const NARROW = /[\s.,:;'’!|ilIjtf()„”"-]/u;

const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

export function isLandscapePhone(vp: PromptViewport): boolean {
  return vp.width > vp.height && vp.height <= 520;
}

/** A prompt szövegdobozának szélessége és betűmérete — az `index.css` `.play-question-prompt` szabályainak tükre. */
export function promptLayout(vp: PromptViewport, promptChars: number): { textWidthPx: number; fontPx: number; lineHeightPx: number } {
  const vmin = Math.min(vp.width, vp.height);
  const long = promptChars > LONG_PROMPT_CHARS;
  if (isLandscapePhone(vp)) {
    const card = Math.min(0.4 * vp.width, 400);
    const fontPx = long ? 15 : clamp(15, 0.044 * vmin, 19);
    return { textWidthPx: card - 27, fontPx, lineHeightPx: fontPx * 1.28 };
  }
  const card = Math.min(vp.width - 16, 560);
  const fontPx = long ? clamp(15, 0.04 * vmin, 18) : clamp(16, 0.046 * vmin, 21);
  return { textWidthPx: card - 27, fontPx, lineHeightPx: fontPx * 1.28 };
}

function textWidth(s: string, fontPx: number): number {
  let em = 0;
  for (const ch of s) em += NARROW.test(ch) ? NARROW_EM : CHAR_EM;
  return em * fontPx;
}

/** Becsült sorszám szavankénti tördeléssel; a dobozánál hosszabb szó karakterenként törik (`overflow-wrap: anywhere`). */
export function estimateLines(text: string, widthPx: number, fontPx: number): number {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0 || widthPx <= 0) return 0;
  const space = NARROW_EM * fontPx;
  let lines = 1;
  let used = 0;
  for (const w of words) {
    let ww = textWidth(w, fontPx);
    if (used > 0 && used + space + ww <= widthPx) {
      used += space + ww;
      continue;
    }
    if (used > 0) lines += 1;
    while (ww > widthPx) {
      lines += 1;
      ww -= widthPx;
    }
    used = ww;
  }
  return lines;
}

export type PromptFit = {
  /** Kibontás nélkül befér (≤ `PROMPT_MAX_LINES` sor). */
  fits: boolean;
  lines: number;
  maxLines: number;
  /** A sáv valódi mérése szerinti tartalékkal (15 px, ≤ 7 sor) még kibontás nélkül olvasható. */
  fitsExtended: boolean;
  /** Elolvasható-e a 9 mp-es plafon alatt (végigolvasás + döntés ≤ 9 mp). */
  readable: boolean;
  readingMs: number;
  /** A szöveghossz szerinti ablak (`windowMsFor`) — az olvasás-tudatos director ennél többet is ad, ≤ 9 mp. */
  windowMs: number;
  /** Az ajánlott válaszablak: max(windowMs, readingMs), ≤ 9 mp (`DirectorConfig.readingAware`). */
  recommendedWindowMs: number;
  /** A gombfeliratok közül a leghosszabb becsült sorszáma (gombos mód, ebben a nézetben). */
  optionLines: number;
  optionsFit: boolean;
  /** fits && readable && optionsFit — ezt a tételt a forrás nyugodtan adhatja. */
  ok: boolean;
};

/** A válaszgomb feliratának szélessége gombos módban (`.play-question-option`): álló 2 / 1 oszlop, fekvő oldalsáv. */
export function optionLabelWidth(vp: PromptViewport, cols: 1 | 2): { widthPx: number; fontPx: number } {
  const vmin = Math.min(vp.width, vp.height);
  const fontPx = clamp(16, 0.044 * vmin, 20);
  // padding 2×12 + keret 3 + jel 30 + rés 10 = 67 px
  if (isLandscapePhone(vp)) return { widthPx: Math.min(0.28 * vp.width, 250) - 67, fontPx };
  const inner = Math.min(vp.width - 16, 560);
  return { widthPx: (cols === 2 ? (inner - 8) / 2 : inner) - 67, fontPx };
}

/** Az `InlineQuestion` oszlopválasztása: 2 oszlop, ha minden felirat ≤ 2 sorban fér; különben 1 (álló nézetben). */
export function optionColumns(labels: readonly string[], vp: PromptViewport): 1 | 2 {
  const { widthPx, fontPx } = optionLabelWidth(vp, 2);
  return labels.every((l) => estimateLines(l, widthPx, fontPx) <= OPTION_MAX_LINES) ? 2 : 1;
}

export function fitsInline(
  prompt: string,
  vp: PromptViewport,
  opts: { grade?: number | null; baseWindowMs?: number; options?: readonly string[] } = {},
): PromptFit {
  const text = typeof prompt === "string" ? prompt : "";
  const { textWidthPx, fontPx } = promptLayout(vp, text.length);
  const lines = estimateLines(text, textWidthPx, fontPx);
  const ext = estimateLines(text, textWidthPx, PROMPT_MIN_FONT_PX);
  const grade = opts.grade ?? null;
  const options = opts.options ?? [];
  const windowMs = windowMsFor(text, grade, opts.baseWindowMs ?? 4000);
  const readingMs = readingMsFor(text, options, grade);
  const cols = optionColumns(options, vp);
  const ow = optionLabelWidth(vp, cols);
  const optionLines = options.reduce((m, o) => Math.max(m, estimateLines(o, ow.widthPx, ow.fontPx)), 0);
  const fits = lines <= PROMPT_MAX_LINES;
  const readable = readingMs <= READING_WINDOW_CAP_MS;
  const recommendedWindowMs = Math.min(READING_WINDOW_CAP_MS, Math.max(windowMs, readingMs));
  const optionsFit = optionLines <= OPTION_MAX_LINES;
  return {
    fits,
    lines,
    maxLines: PROMPT_MAX_LINES,
    fitsExtended: ext <= PROMPT_EXTENDED_LINES,
    readable,
    readingMs,
    windowMs,
    recommendedWindowMs,
    optionLines,
    optionsFit,
    ok: fits && readable && optionsFit,
  };
}

/** Mindhárom mobilnézetben befér és olvasható-e (a `DirectorConfig.promptFits` kényelmi alakja). */
export function fitsAllViewports(quiz: Pick<FourChoiceQuiz, "prompt" | "options">, opts: { grade?: number | null; baseWindowMs?: number } = {}): PromptFit & { worst: PromptViewport } {
  const all = PROMPT_VIEWPORTS.map((vp) => ({ vp, f: fitsInline(quiz.prompt, vp, { ...opts, options: quiz.options }) }));
  // A „legrosszabb” nézet: előbb a nem megfelelő, azon belül a legtöbb sor.
  const rank = (x: (typeof all)[number]) => (x.f.ok ? 0 : 1000) + x.f.lines * 10 + x.f.optionLines;
  const worst = all.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  return {
    ...worst.f,
    worst: worst.vp,
    fits: all.every((x) => x.f.fits),
    fitsExtended: all.every((x) => x.f.fitsExtended),
    optionsFit: all.every((x) => x.f.optionsFit),
    ok: all.every((x) => x.f.ok),
  };
}
