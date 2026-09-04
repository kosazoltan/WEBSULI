/**
 * LS-3a — the coupon clock, owned by the server (owner decision D2).
 *
 * Time is the reward, so time cannot be measured in the page. Everything here derives
 * from `serverStartedAt` and the grant recorded at issue time; the client only renders
 * the number it is told. A hidden tab, a throttled animation frame or a rewound system
 * clock therefore cannot buy another minute of Tsunami.
 *
 * The bonus for a correct in-game answer is guarded twice: the quiz item must be one the
 * server handed to this coupon session, and it may be redeemed once. Both matter because
 * "give the child more time when they answer right" is exactly the request a replay
 * attack would repeat, and here the attacker is a clever nine-year-old with a mouse.
 *
 * Pure functions plus explicit `now` — no `Date.now()` inside — so expiry and replay can
 * be tested without waiting for real minutes to pass.
 */

export const BONUS_NOT_SERVED = "not_served" as const;
export const BONUS_ALREADY_CLAIMED = "already_claimed" as const;
export const BONUS_EXPIRED = "expired" as const;

export type BonusRejection =
  | typeof BONUS_NOT_SERVED
  | typeof BONUS_ALREADY_CLAIMED
  | typeof BONUS_EXPIRED;

export type CouponState = {
  id: string;
  /** Minutes granted when the coupon was issued. */
  minutes: number;
  /** Extra seconds earned in-game so far. */
  bonusSeconds: number;
  /** When the child pressed "play". Null while the coupon is still unspent. */
  serverStartedAt: Date | null;
  /** Hard deadline: an unused coupon does not keep forever. */
  expiresAt: Date;
  /** Quiz item ids this coupon session was served. */
  servedItems: string[];
  /** Quiz item ids already redeemed for a bonus. */
  claimedItems: string[];
};

/**
 * Seconds of play left.
 *
 * Two independent limits apply and the smaller wins: the granted time counted from the
 * start, and the coupon's own expiry. Without the second one a coupon started five
 * minutes before it expires would keep running past its deadline.
 */
export function remainingSeconds(coupon: CouponState, now: Date): number {
  const granted = coupon.minutes * 60 + coupon.bonusSeconds;

  // Not started: the clock has not begun, the whole grant is still ahead.
  if (!coupon.serverStartedAt) return granted;

  const elapsed = Math.floor((now.getTime() - coupon.serverStartedAt.getTime()) / 1000);
  const byGrant = granted - elapsed;
  const byExpiry = Math.floor((coupon.expiresAt.getTime() - now.getTime()) / 1000);

  return Math.max(0, Math.min(byGrant, byExpiry));
}

export type BonusResult =
  | { ok: true; coupon: CouponState }
  | { ok: false; reason: BonusRejection };

/**
 * Award bonus seconds for a verified correct in-game answer.
 *
 * Returns a new state rather than mutating: the caller writes it to the database in one
 * update, and a rejected bonus leaves nothing half-applied.
 */
export function applyBonus(
  coupon: CouponState,
  quizItemId: string,
  bonusSeconds: number,
  now: Date,
): BonusResult {
  // Both ways a coupon can be over: its deadline passed, or its play time ran out.
  // A bonus must not resurrect a finished session — the child earns extra time while
  // still playing, not after the HUD hit zero.
  if (now.getTime() >= coupon.expiresAt.getTime() || remainingSeconds(coupon, now) <= 0) {
    return { ok: false, reason: BONUS_EXPIRED };
  }
  if (!coupon.servedItems.includes(quizItemId)) {
    return { ok: false, reason: BONUS_NOT_SERVED };
  }
  if (coupon.claimedItems.includes(quizItemId)) {
    return { ok: false, reason: BONUS_ALREADY_CLAIMED };
  }

  return {
    ok: true,
    coupon: {
      ...coupon,
      bonusSeconds: coupon.bonusSeconds + bonusSeconds,
      claimedItems: [...coupon.claimedItems, quizItemId],
    },
  };
}

/** When a coupon issued now should expire, per policy. */
export function expiryFor(now: Date, couponTtlHours: number): Date {
  return new Date(now.getTime() + couponTtlHours * 3600 * 1000);
}
