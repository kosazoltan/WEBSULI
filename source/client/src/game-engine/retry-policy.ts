/**
 * Shared retry / XP policy for learning games (A2).
 *
 * Matek Sprint is the reference: one retry while lives remain; a second correct
 * answer earns base credit without speed/combo bonuses.
 */

export const RETRY_XP_FACTOR = 0.5;

export function canRetry(input: {
  attempt: number;
  remainingLives?: number;
}): boolean {
  if (input.attempt > 0) return false;
  if (typeof input.remainingLives === "number") return input.remainingLives > 0;
  // Games without a lives counter still allow one mastery retry.
  return true;
}

/** Full XP on first attempt; reduced credit on a later attempt. */
export function xpForAttempt(baseXp: number, attempt: number): number {
  if (attempt <= 0) return Math.max(0, Math.round(baseXp));
  return Math.max(0, Math.round(baseXp * RETRY_XP_FACTOR));
}

/**
 * First-try scoring: base + optional bonuses.
 * Retry scoring: base only (no speed / combo), then halved via xpForAttempt.
 */
export function scoreCorrectAnswer(input: {
  attempt: number;
  base: number;
  speedBonus?: number;
  comboBonus?: number;
}): number {
  if (input.attempt > 0) {
    return xpForAttempt(input.base, input.attempt);
  }
  return Math.max(
    0,
    Math.round(input.base + (input.speedBonus ?? 0) + (input.comboBonus ?? 0)),
  );
}
