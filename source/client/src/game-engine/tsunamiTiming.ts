/**
 * Szökőár-szökés kvízidő — tiszta modul, hogy a teszt a React-oldal betöltése nélkül mérhesse
 * (spec 2026-09-29-tobb-gondolkodasi-ido).
 */
import { adaptiveTimeBudget } from "./adaptiveSession";

export type TsunamiDifficulty = "easy" | "normal" | "hard";

/** A kérdés alapideje (s) nehézségenként. */
export const QUIZ_TIMEOUT_SEC: Record<TsunamiDifficulty, number> = {
  easy: 32,
  normal: 28,
  hard: 28,
};

/** Egy kérdés ideje sosem kevesebb ennél (s) — korábban magas sávon hard 6 s volt. */
export const QUIZ_MIN_SEC = 24;

/** A kérdés ideje a nehézségi sáv (0–1) szerint, legalább `QUIZ_MIN_SEC`. */
export function tsunamiQuizSeconds(difficulty: TsunamiDifficulty, band: number): number {
  return Math.max(QUIZ_MIN_SEC, adaptiveTimeBudget(QUIZ_TIMEOUT_SEC[difficulty], band));
}
