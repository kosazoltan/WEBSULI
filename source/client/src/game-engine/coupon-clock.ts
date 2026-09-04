/**
 * LS-3b — the HUD's clock, which is not the real clock.
 *
 * The server owns the coupon's time (LS-3a): it stamped the start, it counts the
 * seconds, it decides when the play time is gone. This module exists for one reason —
 * a countdown that only updated every fifteen seconds would look broken to a child.
 * So the number ticks locally between syncs, and a sync always wins.
 *
 * That rule is what keeps the HUD honest rather than merely pretty: the local counter
 * can never award time on its own, because the very next sync replaces it wholesale.
 * A bonus does raise the number — but only after the server has verified the answer
 * and told us so.
 *
 * Pure functions with `nowMs` passed in, so a ten-minute coupon is testable instantly.
 */

/** What `GET /api/lessons/coupons/active` tells us. */
export type ServerCoupon = { id: string; remainingSeconds: number };

export type CouponClock = {
  couponId: string;
  /** What the HUD shows right now. */
  remaining: number;
  /** The last value the server gave — the ceiling the local tick works down from. */
  serverRemaining: number;
  /** When the local counter was last decremented. */
  lastTickAt: number;
  /** Hidden tab / blurred window: the HUD stops counting until the next sync. */
  paused: boolean;
  expired: boolean;
};

/** Start a session from the first server answer; null when there is no coupon. */
export function initialClock(coupon: ServerCoupon | null, nowMs: number): CouponClock | null {
  if (!coupon) return null;

  const remaining = Math.max(0, Math.floor(coupon.remainingSeconds));
  return {
    couponId: coupon.id,
    remaining,
    serverRemaining: remaining,
    lastTickAt: nowMs,
    paused: false,
    expired: remaining <= 0,
  };
}

/**
 * Move the local counter forward.
 *
 * While paused nothing is subtracted — but note that this only freezes the *display*.
 * The server keeps counting, and the next sync brings the truth back, so hiding the tab
 * buys a stale HUD, not extra minutes.
 */
export function advanceClock(clock: CouponClock, nowMs: number): CouponClock {
  if (clock.paused) return { ...clock, lastTickAt: nowMs };

  const elapsed = Math.max(0, Math.floor((nowMs - clock.lastTickAt) / 1000));
  if (elapsed === 0) return clock;

  const remaining = Math.max(0, clock.remaining - elapsed);
  return { ...clock, remaining, lastTickAt: nowMs, expired: remaining <= 0 };
}

/**
 * Adopt the server's number.
 *
 * Unconditional on purpose. Taking `Math.min(local, server)` would look safer and be
 * wrong: a verified bonus legitimately *raises* the remaining time, and clamping to the
 * local value would silently swallow the reward the child just earned.
 */
export function applyServerSync(
  clock: CouponClock | null,
  coupon: ServerCoupon | null,
  nowMs: number,
): CouponClock {
  if (!coupon) {
    // The coupon is gone (spent or expired): end the session rather than keep counting.
    return {
      couponId: clock?.couponId ?? "",
      remaining: 0,
      serverRemaining: 0,
      lastTickAt: nowMs,
      paused: clock?.paused ?? false,
      expired: true,
    };
  }

  const remaining = Math.max(0, Math.floor(coupon.remainingSeconds));
  return {
    couponId: coupon.id,
    remaining,
    serverRemaining: remaining,
    lastTickAt: nowMs,
    paused: clock?.paused ?? false,
    expired: remaining <= 0,
  };
}

/** `m:ss`, the shape a child reads at a glance. */
export function formatRemaining(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
