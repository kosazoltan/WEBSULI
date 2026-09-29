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

/**
 * A víz emelkedésének szorzója a sávból (spec 2026-09-29-palyak-szoletra-nyelvek, E szelet, D8): `0,85 + 0,3·sáv`,
 * az 1. pályán ×0,895, a 10.-en ×1,135. Mérsékelt: a 10. pálya érezhetően sürgetőbb, de teljesíthető marad.
 */
export function tsunamiWaterPace(band: number): number {
  const b = Number.isFinite(band) ? Math.min(1, Math.max(0, band)) : 0;
  return 0.85 + 0.3 * b;
}
