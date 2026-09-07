/**
 * G-4 — közös, adaptív nehézség-sáv a játékokhoz.
 *
 * Measured on 2026-09-07: BlockCraft had fourteen references to its own ramp,
 * SpeedQuiz and BrainRot had none. The same child therefore met one game that
 * adapted and another that did not — nobody chose that, it is just where the two
 * files happened to stop.
 *
 * The band is a single number in [DIFFICULTY_FLOOR, 1]. What a game does with it is
 * its own business (spawn rate, timer length, question tier); what every game shares
 * is HOW the number moves.
 *
 * Two decisions worth keeping honest:
 *
 *  - The rule is asymmetric. Three correct answers harden the band by 0.10, two
 *    wrong ones soften it by 0.15. Boredom costs a session; frustration costs the
 *    child's willingness to come back at all. Unequal costs, unequal constants.
 *
 *  - Only the tail of the history counts. A child who struggled at the start of a
 *    round and has now answered three in a row deserves the harder band now — being
 *    held back by five-minute-old mistakes is exactly what makes a game feel dead.
 *
 * Pure: no seed, no clock. The same history always yields the same band, so a bug
 * report can be reproduced from the history alone.
 */

/** A legkönnyebb sáv. Nulla nehézségen már nincs mit megoldani. */
export const DIFFICULTY_FLOOR = 0.15;

/** Ennyi egymás utáni helyes válasz után nehezítünk. */
export const HARDEN_AFTER = 3;

/** Ennyi egymás utáni rossz válasz után könnyítünk. */
export const SOFTEN_AFTER = 2;

const HARDEN_STEP = 0.1;
const SOFTEN_STEP = 0.15;

function clampBand(value: number): number {
  if (Number.isNaN(value)) return DIFFICULTY_FLOOR;
  return Math.min(1, Math.max(DIFFICULTY_FLOOR, value));
}

/** Hány azonos kimenetelű válasz áll a sorozat végén. */
function tailStreak(recentCorrect: boolean[]): { correct: boolean; length: number } | null {
  if (recentCorrect.length === 0) return null;

  const correct = recentCorrect[recentCorrect.length - 1] as boolean;
  let length = 0;
  for (let i = recentCorrect.length - 1; i >= 0; i -= 1) {
    if (recentCorrect[i] !== correct) break;
    length += 1;
  }
  return { correct, length };
}

export function nextDifficulty(state: {
  /** A válaszok időrendben; csak a sorozat vége számít. */
  recentCorrect: boolean[];
  /** A jelenlegi sáv. */
  current: number;
}): number {
  const tail = tailStreak(state.recentCorrect);
  if (tail === null) return state.current;

  if (tail.correct && tail.length >= HARDEN_AFTER) {
    return clampBand(state.current + HARDEN_STEP);
  }
  if (!tail.correct && tail.length >= SOFTEN_AFTER) {
    return clampBand(state.current - SOFTEN_STEP);
  }
  return state.current;
}

/**
 * Kezdő sáv osztály szerint.
 *
 * Nem a tudást becsüli — azt a menet közbeni válaszok mérik. Csak azt kerüli el,
 * hogy egy nyolcadikos az első három kérdést unja végig, mielőtt a szabály
 * egyáltalán mozdulna.
 */
export function startingDifficulty(classroom: number): number {
  const safe = Number.isFinite(classroom) ? Math.min(12, Math.max(0, classroom)) : 0;
  return clampBand(0.3 + (safe / 12) * 0.35);
}
