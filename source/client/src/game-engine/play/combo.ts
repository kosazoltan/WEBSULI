/**
 * J0b — kombó-szorzó (végrehajtás J0b „Szerződés”; terv 6.1). Tiszta, változtathatatlan állapot: minden függvény új
 * objektumot ad vissza, így a React-HUD pillanatképe és a sim állapota nem fut össze.
 *
 * Lépcsők: 0–2 helyes egymás után ×1, 3–5 ×2, 6–9 ×3, 10–14 ×4, 15-től ×5. A `best` a menet legjobb sorozata — ez megy
 * a `POST /api/games/score` `runStreak` mezőjébe (K.2 „Pontszám-szerződés”, terv J12).
 */

export type ComboState = { count: number; multiplier: 1 | 2 | 3 | 4 | 5; best: number };

export const COMBO_STEPS: readonly number[] = [0, 3, 6, 10, 15]; // count küszöbök → ×1..×5

function multiplierFor(count: number): ComboState["multiplier"] {
  let m = 0;
  for (const step of COMBO_STEPS) if (count >= step) m += 1;
  return Math.max(1, Math.min(5, m)) as ComboState["multiplier"];
}

export function createCombo(): ComboState {
  return { count: 0, multiplier: 1, best: 0 };
}

export function comboCorrect(s: ComboState): ComboState {
  const count = s.count + 1;
  return { count, multiplier: multiplierFor(count), best: Math.max(s.best, count) };
}

/** count 0, multiplier 1, best megmarad. */
export function comboBreak(s: ComboState): ComboState {
  return { count: 0, multiplier: 1, best: s.best };
}
