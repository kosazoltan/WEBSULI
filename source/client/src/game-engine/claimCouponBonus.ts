import type { CouponSession } from "./useCouponSession";

/**
 * Accept stored legacy UUIDs and versioned canonical SHA-256 question ids.
 * Fallback-bank ids ("1", "mat-0") and the Tsunami `db:` prefix must not
 * hit the network — every miss is a 400 the child did nothing to cause.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strip the quiz-bank prefix without allowing static fallback ids. */
export function claimableQuizItemId(id: string | undefined | null): string | null {
  if (!id) return null;
  const raw = id.startsWith("db:") ? id.slice(3) : id;
  return UUID_RE.test(raw) || /^[0-9a-f]{64}$/i.test(raw) ? raw : null;
}

export function isClaimableQuizItemId(id: string | undefined | null): boolean {
  return claimableQuizItemId(id) !== null;
}

export function maybeClaimCouponBonus(
  coupon: Pick<CouponSession, "active" | "claimBonus">,
  id: string | undefined | null,
  pickedIndex: number,
): void {
  if (!coupon.active) return;
  const quizItemId = claimableQuizItemId(id);
  if (!quizItemId) return;
  void coupon.claimBonus(quizItemId, pickedIndex);
}
