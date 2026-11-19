/**
 * Szökőár — olvasási idő szerinti válaszablak (koordinátori döntés 2026-11-18, a tulajdonos Brain Rot-panasza alapján:
 * „nagyon kevés időt adsz a válaszadásra”; a független ellenőr K1 lelete). Terv: docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md.
 *
 * Tiszta modul (nincs DOM, React, óra, `Math.random`): a lap és a szimuláció UGYANEZT hívja.
 *
 * - Az ablak = tájékozódás + a TELJES olvasnivaló (kérdés + mind a négy válasz) az évfolyam olvasási sebességével + döntés;
 *   legalább a közös (director) ablak, legfeljebb 40 s. A közös director 9 mp-es plafonja ezt nem engedné, ezért a lap és a
 *   sim a director presentation-jét burkolja (a director maga nem változik) — a Szólétra `paceDirector`-ának mintájára.
 * - TÖBBLETIDŐ: a közös ablakon túli rész alatt a víz NEM emelkedik (a meghajtó a `extraTimeFrom` után 0-s időskálát ad).
 * - Későbbi közösítés: a #497 (Brain Rot) és a Szólétra (`lib/wordLadder/pacing.ts`) hasonló burkolójával egy közös
 *   `game-engine/play` modulba emelhető — a #497 összevonása után (most saját kis burkoló, hogy ne ütközzünk).
 */
import { readingWpm, wordsOf } from "../../game-engine/play/reading";
import type { QuestionDirector } from "../../game-engine/play/questionDirector";
import type { QuestionPresentation } from "../../game-engine/play/types";

/** Tájékozódás (a szem megtalálja a kártyát). */
export const ORIENT_MS = 1000;
/** Döntés a végigolvasás után; 3–4. évfolyamon hosszabb. */
export const DECIDE_MS = 3000;
export const DECIDE_YOUNG_MS = 3800;
/** A gyerek minden választ végigolvas: a közös olvasási sebesség ennyiszerese. */
export const WPM_FACTOR = 0.65;
export const WINDOW_CAP_MS = 40_000;

/** Az olvasási idő szerinti ablak (ms). */
export function tsunamiWindowMs(prompt: string, options: readonly string[], grade: number | null, sharedWindowMs: number): number {
  const words = wordsOf(prompt) + options.reduce((n, o) => n + wordsOf(o), 0);
  const wpm = Math.max(1, readingWpm(grade) * WPM_FACTOR);
  const young = grade !== null && grade <= 4;
  const ms = ORIENT_MS + (words / wpm) * 60_000 + (young ? DECIDE_YOUNG_MS : DECIDE_MS);
  return Math.round(Math.min(WINDOW_CAP_MS, Math.max(sharedWindowMs, ms)));
}

/** A burkolt presentation közös (director) ablaka — ettől kezdve „többletidő” van. */
const sharedWindowOf = new WeakMap<QuestionPresentation, number>();

/** A többletidő kezdete (a kérdés-óra szerint), vagy `null`, ha a kérdés nem burkolt / nincs többletidő. */
export function extraTimeFrom(p: QuestionPresentation | null): number | null {
  if (!p) return null;
  const shared = sharedWindowOf.get(p);
  if (shared === undefined || shared >= p.windowMs) return null;
  return p.startedAtSimMs + shared;
}

/** A director burkolása: az ablak az olvasási idő szerint; a director állapota és kimenete változatlan. */
export function paceTsunamiDirector(base: QuestionDirector, opts: { grade: () => number | null }): QuestionDirector {
  let last: { src: QuestionPresentation; paced: QuestionPresentation } | null = null;
  const pace = (p: QuestionPresentation | null): QuestionPresentation | null => {
    if (!p) return null;
    if (last && last.src === p) return last.paced;
    // A közös ablak az első burkoláskor rögzül (az objektumot a burkoló átírja, ezért az ismételt burkolás nem nyújt tovább).
    const shared = sharedWindowOf.get(p) ?? p.windowMs;
    const windowMs = tsunamiWindowMs(p.question.quiz.prompt, p.options.map((o) => o.label), opts.grade(), shared);
    /*
     * Vak ellenőr KICSI 6 (2026-11-19): a director a SAJÁT bemutatás-objektumán számolja a menet-statisztikát (lejáratkor a
     * válaszidő, válasznál az ablak) — ezért az olvasási ablak magán ezen az objektumon érvényes, nem egy másolaton.
     */
    (p as { windowMs: number }).windowMs = windowMs;
    sharedWindowOf.set(p, shared);
    last = { src: p, paced: p };
    return p;
  };
  return {
    ...base,
    tick: (now, ctx) => pace(base.tick(now, ctx)),
    request: (reason, now) => pace(base.request(reason, now)),
    active: () => pace(base.active()),
  };
}
