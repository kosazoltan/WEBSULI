/**
 * Brain Rot — olvasásalapú válaszablak (tulajdonosi hibajelentés 2026-11-17: „nagyon kevés időt adsz a válaszadásra”;
 * terv docs/specs/2026-11-17-brainrot-valaszido.md, D1–D3).
 *
 * Tiszta modul (nincs DOM, React, óra, `Math.random`): a lap (`P/BrainRotSteal.tsx`) és a szimuláció (`./sim.ts`)
 * UGYANEZT hívja (K.6). A közös director nem változik (más játékok is használják; a felső korlátja 9 s): a Brain Rot a
 * director presentation-jét burkolja (`paceBrainRotDirector`) — a Szólétra-javítás `paceDirector`-mintája.
 *
 * Ablak = tájékozódás + a TELJES olvasnivaló (prompt + mind a 4 válasz, teljes súllyal) az évfolyam olvasási tempójával
 * + döntés + a ketrechez jutás (a sim mért mozgása: 90% 1,45 s); alsó korlát 9 s és a mostani (közös) ablak 1,25-szöröse,
 * felső korlát 30 s. Az óra a ketrecek élesítése (előjelzés, `CAGE_ARM_MS`) után indul.
 */
import { CAGE_ARM_MS, CAGE_WINDOW_MS } from "./core";
import { windowMsFor, type QuestionDirector } from "../../game-engine/play/questionDirector";
import { READING_WINDOW_CAP_MS, readingMsFor, wordsOf } from "../../game-engine/play/reading";
import type { QuestionPresentation } from "../../game-engine/play/types";

export const BR_ORIENT_MS = 1000;
export const BR_DECIDE_MS = 2000;
export const BR_DECIDE_YOUNG_MS = 2500;
/** A ketrechez jutás (a sim mért 90%-os mozgása 1,45 s + megállás 0,16 s + ráhagyás). */
export const BR_MOVE_MS = 1800;
export const BR_WINDOW_MIN_MS = 9000;
export const BR_FLOOR_FACTOR = 1.25;
export const BR_WINDOW_MAX_MS = 30_000;
/** Az óra az előjelzés (a ketrecek élesítése) után indul. */
export const BR_LEAD_IN_MS = CAGE_ARM_MS;

/**
 * Olvasási tempó (szó / perc), becslés: a 8–12 évesek hangos-olvasási 100–140-es sávjának lassabb végéhez igazítva
 * (a gyerek minden válaszlehetőséget végigolvas).
 */
export function brainRotWpm(grade: number | null): number {
  if (grade === null || !Number.isFinite(grade)) return 100;
  if (grade <= 4) return 90;
  if (grade <= 6) return 100;
  if (grade <= 8) return 120;
  return 140;
}

/** A teljes olvasnivaló (prompt + minden válasz, teljes súllyal) ideje ms-ban. */
export function brainRotFullReadMs(prompt: string, options: readonly string[], grade: number | null): number {
  const words = wordsOf(prompt) + options.reduce((n, o) => n + wordsOf(o), 0);
  return Math.round((words / brainRotWpm(grade)) * 60_000);
}

/** A mostani (közös, a director `readingAware`) ablak — a padló viszonyítási alapja. */
export function sharedBrainRotWindowMs(prompt: string, options: readonly string[], grade: number | null): number {
  return Math.min(READING_WINDOW_CAP_MS, Math.max(windowMsFor(prompt, grade, CAGE_WINDOW_MS), readingMsFor(prompt, options, grade)));
}

/** A Brain Rot válaszablaka (ms), az előjelzés UTÁN. Monoton a szöveg hosszában. */
export function brainRotWindowMs(q: { prompt: string; options: readonly string[]; grade: number | null }): number {
  const young = q.grade !== null && q.grade <= 4;
  const need = BR_ORIENT_MS + brainRotFullReadMs(q.prompt, q.options, q.grade) + (young ? BR_DECIDE_YOUNG_MS : BR_DECIDE_MS) + BR_MOVE_MS;
  const floor = Math.max(BR_WINDOW_MIN_MS, sharedBrainRotWindowMs(q.prompt, q.options, q.grade) * BR_FLOOR_FACTOR);
  return Math.round(Math.min(BR_WINDOW_MAX_MS, Math.max(need, floor)));
}

/**
 * A director presentation-jének burkolása: az óra az előjelzés után indul (`startedAtSimMs + BR_LEAD_IN_MS`), az ablak a
 * `brainRotWindowMs`. A director állapota és kimenete változatlan (a válasz / lejárat a valós kérdés-órával megy be).
 * Kérdésenként egy burkolt objektum (azonos identitás).
 */
/** A burkolt presentation-höz a director nyers (régi) ablaka — a menet-óra ennyit fogyaszt a kérdés alatt (D5-módosítás). */
const baseWindows = new WeakMap<QuestionPresentation, number>();
export function baseWindowMs(p: QuestionPresentation): number {
  return baseWindows.get(p) ?? p.windowMs;
}

export function paceBrainRotDirector(base: QuestionDirector, opts: { grade: () => number | null }): QuestionDirector {
  let last: { src: QuestionPresentation; paced: QuestionPresentation } | null = null;
  const pace = (p: QuestionPresentation | null): QuestionPresentation | null => {
    if (!p) return null;
    if (last && last.src === p) return last.paced;
    const windowMs = brainRotWindowMs({ prompt: p.question.quiz.prompt, options: p.options.map((o) => o.label), grade: opts.grade() });
    const paced: QuestionPresentation = { ...p, startedAtSimMs: p.startedAtSimMs + BR_LEAD_IN_MS, windowMs };
    baseWindows.set(paced, p.windowMs);
    last = { src: p, paced };
    return paced;
  };
  return {
    ...base,
    tick: (now, ctx) => pace(base.tick(now, ctx)),
    request: (reason, now) => pace(base.request(reason, now)),
    active: () => pace(base.active()),
  };
}
