/**
 * Villám matek időzítés — tiszta modul, hogy a teszt a React-oldal betöltése nélkül mérhesse
 * (spec 2026-09-29-tobb-gondolkodasi-ido).
 */
export type SpeedGrade = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A teljes kör ideje (s). */
export const ROUND_SECONDS: Record<SpeedGrade, number> = {
  3: 210,
  4: 220,
  5: 260,
  6: 240,
  7: 240,
  8: 240,
  9: 270,
  10: 270,
  11: 300,
  12: 300,
};

/** Egy kérdés alapideje (s) az évfolyamon. */
export const QUESTION_SECONDS: Record<SpeedGrade, number> = {
  3: 30,
  4: 30,
  5: 30,
  6: 32,
  7: 35,
  8: 35,
  9: 40,
  10: 40,
  11: 45,
  12: 45,
};

/** A győzelemhez szükséges jó válaszok. */
export const TARGET_CORRECT: Record<SpeedGrade, number> = {
  3: 15,
  4: 18,
  5: 21,
  6: 20,
  7: 18,
  8: 18,
  9: 16,
  10: 16,
  11: 15,
  12: 15,
};

/** Egy kérdés ideje sosem kevesebb ennél (s). */
export const MIN_QUESTION_SECONDS = 20;

/**
 * Egy kérdés ideje a nehézségi sáv (0–1) szerint: az alapidő ×1,5 (könnyű sáv) és ×1,0 (nehéz sáv) között —
 * a nehezítés nem vesz el az alapidőből (korábban ×0,75-ig csökkent, 5. o.-ban 11 s-ig).
 */
export function questionSecondsForBand(level: SpeedGrade, band: number): number {
  const b = Math.min(1, Math.max(0, band));
  return Math.max(MIN_QUESTION_SECONDS, Math.round(QUESTION_SECONDS[level] * (1.5 - b * 0.5)));
}
