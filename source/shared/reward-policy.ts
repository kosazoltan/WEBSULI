/**
 * LS-3a — the reward ladder (owner decision D2), as data plus one pure function.
 *
 * The owner's design: finishing a section well buys play time, and finishing several in
 * a row without a mistake buys progressively more — 1, 2, 3, then 4 minutes — with a
 * flawless lesson-closing Próba worth up to ten. A merely good result still pays, but at
 * the current rung: the increase is the prize for perfection, not for attendance.
 *
 * Every number lives in the `reward_policy` table and arrives here as an argument. That
 * is deliberate and is enforced by a test: the owner must be able to retune the ladder
 * for his child from the Studio without a deploy, and a value baked into a comparison
 * would quietly outrank the table.
 */

export type RewardPolicy = {
  /** Minutes granted for the 1st, 2nd, … consecutive perfect section. Last entry is the cap. */
  ladder: number[];
  /** Minutes for a flawless lesson-closing Próba. */
  lessonPerfectMax: number;
  thresholds: {
    /** Below this percentage nothing is granted and the streak resets. */
    retry: number;
    /** At this percentage the ladder advances. */
    perfect: number;
  };
  /** Seconds added for one verified correct in-game quiz answer. */
  bonusSeconds: number;
  /** How long an unspent coupon stays valid. */
  couponTtlHours: number;
  /**
   * Whether the games are playable without a coupon.
   *
   * Default true: coupon-free play is how the site works today, and a reward feature
   * must not lock an existing page. Tightening this is a row in the table, not a deploy.
   */
  freePlay: boolean;
};

export const DEFAULT_REWARD_POLICY: RewardPolicy = {
  ladder: [1, 2, 3, 4],
  lessonPerfectMax: 10,
  thresholds: { retry: 80, perfect: 100 },
  bonusSeconds: 30,
  couponTtlHours: 24,
  freePlay: true,
};

/** The per-(child, lesson) ladder position. */
export type LadderState = {
  /** How many consecutive perfect sections precede this one. */
  streak: number;
};

export type ProbaOutcome = {
  /** 0–100, computed by the server from the stored lesson. */
  score: number;
  /** Whether this was the lesson's last section. */
  isLessonFinal: boolean;
};

export type CouponGrant = {
  /** Minutes to grant, or null when the result did not earn play time. */
  minutes: number | null;
  /** The streak to persist after this Próba. */
  nextStreak: number;
};

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Read a stored policy row, falling back to the built-in defaults.
 *
 * A missing or malformed row must not break a child's Próba, so anything that does not
 * validate is replaced wholesale rather than merged: a half-applied policy (say, a
 * ladder from the table and thresholds from code) is harder to reason about than either.
 */
export function parseRewardPolicy(value: unknown): RewardPolicy {
  if (!value || typeof value !== "object") return DEFAULT_REWARD_POLICY;
  const raw = value as Record<string, unknown>;

  const ladder = raw.ladder;
  if (!Array.isArray(ladder) || ladder.length === 0 || !ladder.every(isFiniteNumber)) {
    return DEFAULT_REWARD_POLICY;
  }

  const thresholds = raw.thresholds as Record<string, unknown> | undefined;
  if (
    !thresholds ||
    typeof thresholds !== "object" ||
    !isFiniteNumber(thresholds.retry) ||
    !isFiniteNumber(thresholds.perfect)
  ) {
    return DEFAULT_REWARD_POLICY;
  }

  if (
    !isFiniteNumber(raw.lessonPerfectMax) ||
    !isFiniteNumber(raw.bonusSeconds) ||
    !isFiniteNumber(raw.couponTtlHours) ||
    typeof raw.freePlay !== "boolean"
  ) {
    return DEFAULT_REWARD_POLICY;
  }

  return {
    ladder: ladder as number[],
    lessonPerfectMax: raw.lessonPerfectMax,
    thresholds: { retry: thresholds.retry, perfect: thresholds.perfect },
    bonusSeconds: raw.bonusSeconds,
    couponTtlHours: raw.couponTtlHours,
    freePlay: raw.freePlay,
  };
}

/** The minutes at a given streak position, clamped to the ladder's top rung. */
function rungFor(policy: RewardPolicy, streak: number): number {
  const index = Math.min(Math.max(streak, 0), policy.ladder.length - 1);
  return policy.ladder[index];
}

/**
 * Decide what a finished Próba is worth.
 *
 * Pure on purpose: this is the one place where "how much screen time" is decided, and it
 * has to be testable without a database, a clock or a logged-in child.
 */
export function computeCoupon(
  policy: RewardPolicy,
  state: LadderState,
  outcome: ProbaOutcome,
): CouponGrant {
  const { score, isLessonFinal } = outcome;

  if (score < policy.thresholds.retry) {
    return { minutes: null, nextStreak: 0 };
  }

  if (score >= policy.thresholds.perfect) {
    const minutes = isLessonFinal ? policy.lessonPerfectMax : rungFor(policy, state.streak);
    return { minutes, nextStreak: state.streak + 1 };
  }

  // Good but not perfect: paid at the current rung, ladder unchanged.
  return { minutes: rungFor(policy, state.streak), nextStreak: state.streak };
}
