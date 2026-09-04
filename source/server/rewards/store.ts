import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import { conceptResults, coupons, lessons, rewardPolicy } from "../../shared/schema";
import {
  DEFAULT_REWARD_POLICY,
  parseRewardPolicy,
  type RewardPolicy,
} from "../../shared/reward-policy";
import type { ProbaGrade } from "./grade";
import { expiryFor, type CouponState } from "./coupons";

/**
 * LS-3a — the database side of the reward loop.
 *
 * Kept apart from `grade.ts` and `coupons.ts` so the rules stay pure and testable; this
 * file is the only place that talks to Postgres, and it does nothing a test would want
 * to assert about beyond "it stored what it was told".
 */

/** Who earned this: a logged-in child, or an anonymous browser. */
export type Learner = { userId: string | null; fingerprint: string | null };

const POLICY_CACHE_MS = 60_000;
let cached: { at: number; policy: RewardPolicy } | null = null;

/**
 * The active policy, cached for a minute.
 *
 * The row is read on every Próba, and it changes about as often as the owner opens the
 * Studio — but a stale minute after a retune is invisible to a child mid-lesson, while a
 * query per submission is not free.
 */
export async function loadRewardPolicy(now = Date.now()): Promise<RewardPolicy> {
  if (cached && now - cached.at < POLICY_CACHE_MS) return cached.policy;

  try {
    const [row] = await db
      .select({ value: rewardPolicy.value })
      .from(rewardPolicy)
      .where(eq(rewardPolicy.key, "default"))
      .limit(1);

    const policy = parseRewardPolicy(row?.value);
    cached = { at: now, policy };
    return policy;
  } catch {
    // A missing table (un-migrated deploy) must not stop a child finishing a section.
    return DEFAULT_REWARD_POLICY;
  }
}

/** Drop the cache after an admin edits the policy. */
export function invalidateRewardPolicyCache(): void {
  cached = null;
}

/** Matches rows belonging to this learner, whichever identity they have. */
function learnerFilter(
  learner: Learner,
  userCol: typeof coupons.userId,
  fpCol: typeof coupons.fingerprint,
) {
  return learner.userId
    ? eq(userCol, learner.userId)
    : and(isNull(userCol), eq(fpCol, learner.fingerprint ?? ""));
}

/**
 * How many consecutive perfect sections precede this one, for this learner and lesson.
 *
 * Derived from the coupons already issued rather than kept in its own counter column:
 * one source of truth, and a coupon row is the thing that actually happened.
 */
export async function currentStreak(learner: Learner, lessonId: string): Promise<number> {
  const rows = await db
    .select({ reason: coupons.reason })
    .from(coupons)
    .where(
      and(
        eq(coupons.lessonId, lessonId),
        learnerFilter(learner, coupons.userId, coupons.fingerprint),
      ),
    )
    .orderBy(desc(coupons.issuedAt))
    .limit(50);

  let streak = 0;
  for (const row of rows) {
    if (row.reason === "section_good") break;
    streak += 1;
  }
  return streak;
}

/** Record every concept outcome of a graded Próba. */
export async function saveConceptResults(
  learner: Learner,
  lessonId: string,
  sectionIdx: number,
  grade: ProbaGrade,
): Promise<void> {
  if (grade.perConcept.length === 0) return;

  await db.insert(conceptResults).values(
    grade.perConcept.map((entry) => ({
      lessonId,
      conceptId: entry.conceptId,
      userId: learner.userId,
      fingerprint: learner.fingerprint,
      sectionIdx,
      correct: entry.correct,
    })),
  );
}

export type IssuedCoupon = { id: string; minutes: number; expiresAt: Date };

/** Write a granted coupon. */
export async function issueCoupon(
  learner: Learner,
  lessonId: string,
  sectionIdx: number,
  minutes: number,
  reason: string,
  policy: RewardPolicy,
  now: Date,
): Promise<IssuedCoupon> {
  const expiresAt = expiryFor(now, policy.couponTtlHours);

  const [row] = await db
    .insert(coupons)
    .values({
      userId: learner.userId,
      fingerprint: learner.fingerprint,
      lessonId,
      sectionIdx,
      minutes,
      reason,
      expiresAt,
    })
    .returning({ id: coupons.id });

  return { id: row.id, minutes, expiresAt };
}

/** Map a database row onto the pure clock's view of a coupon. */
function toState(row: typeof coupons.$inferSelect): CouponState {
  return {
    id: row.id,
    minutes: row.minutes,
    bonusSeconds: row.bonusSeconds,
    serverStartedAt: row.serverStartedAt,
    expiresAt: row.expiresAt,
    servedItems: row.servedItems ?? [],
    claimedItems: row.claimedItems ?? [],
  };
}

/** One coupon, but only if it belongs to this learner. */
export async function loadCoupon(
  learner: Learner,
  couponId: string,
): Promise<CouponState | null> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(
      and(eq(coupons.id, couponId), learnerFilter(learner, coupons.userId, coupons.fingerprint)),
    )
    .limit(1);

  return row ? toState(row) : null;
}

/** The learner's newest coupon that has not expired yet. */
export async function activeCoupon(
  learner: Learner,
  now: Date,
): Promise<(CouponState & { lessonId: string; sectionIdx: number }) | null> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(
      and(
        learnerFilter(learner, coupons.userId, coupons.fingerprint),
        gt(coupons.expiresAt, now),
      ),
    )
    .orderBy(desc(coupons.issuedAt))
    .limit(1);

  if (!row) return null;
  return { ...toState(row), lessonId: row.lessonId, sectionIdx: row.sectionIdx };
}

/**
 * Start a coupon's clock, once.
 *
 * The `IS NULL` in the WHERE clause is the guard: two taps on "Játék" cannot reset the
 * countdown, because the second update matches no row.
 */
export async function startCoupon(couponId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(coupons)
    .set({ serverStartedAt: now })
    .where(and(eq(coupons.id, couponId), isNull(coupons.serverStartedAt)))
    .returning({ id: coupons.id });

  return rows.length > 0;
}

/** Persist a bonus the pure layer already validated. */
export async function persistBonus(state: CouponState): Promise<void> {
  await db
    .update(coupons)
    .set({ bonusSeconds: state.bonusSeconds, claimedItems: state.claimedItems })
    .where(eq(coupons.id, state.id));
}

/** Remember that these quiz items were handed to this coupon session. */
export async function serveItems(couponId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;

  await db
    .update(coupons)
    .set({
      servedItems: sql`(
        select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
        from jsonb_array_elements(${coupons.servedItems} || ${JSON.stringify(itemIds)}::jsonb)
      )`,
    })
    .where(eq(coupons.id, couponId));
}

/** The published lesson JSON, or null. */
export async function loadPublishedLesson(lessonId: string) {
  const [row] = await db
    .select({ id: lessons.id, json: lessons.json, publishedAt: lessons.publishedAt })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (!row || !row.publishedAt) return null;
  return row;
}
