import assert from "node:assert/strict";
import test from "node:test";

import { isClaimableQuizItemId, maybeClaimCouponBonus } from "../client/src/game-engine/claimCouponBonus.ts";
import type { CouponSession } from "../client/src/game-engine/useCouponSession.ts";

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function session(over: Partial<CouponSession> = {}): CouponSession {
  return {
    active: true,
    remaining: 90,
    expired: false,
    lessonId: "lesson-1",
    sectionIdx: 0,
    minutes: 5,
    claimBonus: async () => {},
    ...over,
  };
}

test("UUID formájú id claimelhető", () => {
  assert.equal(isClaimableQuizItemId(UUID), true);
});

test("fallback bank id (\"1\", \"mat-0\") NEM claimelhető", () => {
  assert.equal(isClaimableQuizItemId("1"), false);
  assert.equal(isClaimableQuizItemId("mat-0"), false);
  assert.equal(isClaimableQuizItemId(""), false);
  assert.equal(isClaimableQuizItemId(undefined), false);
});

test("a quiz-bank db: előtagot levágja, a nyers UUID-t küldi", async () => {
  assert.equal(isClaimableQuizItemId(`db:${UUID}`), true);
  const seen: string[] = [];
  const coupon = session({
    claimBonus: async (id) => {
      seen.push(id);
    },
  });
  maybeClaimCouponBonus(coupon, `db:${UUID}`);
  await Promise.resolve();
  assert.deepEqual(seen, [UUID]);
});

test("aktív kupon + UUID → claimBonus egyszer, az id-vel", async () => {
  const seen: string[] = [];
  const coupon = session({
    claimBonus: async (id) => {
      seen.push(id);
    },
  });
  maybeClaimCouponBonus(coupon, UUID);
  await Promise.resolve();
  assert.deepEqual(seen, [UUID]);
});

test("inaktív kupon → 0 hívás", async () => {
  const seen: string[] = [];
  const coupon = session({
    active: false,
    claimBonus: async (id) => {
      seen.push(id);
    },
  });
  maybeClaimCouponBonus(coupon, UUID);
  await Promise.resolve();
  assert.deepEqual(seen, []);
});

test("nem-UUID id → 0 hívás még aktív kuponon is", async () => {
  const seen: string[] = [];
  const coupon = session({
    claimBonus: async (id) => {
      seen.push(id);
    },
  });
  maybeClaimCouponBonus(coupon, "1");
  maybeClaimCouponBonus(coupon, "mat-0");
  maybeClaimCouponBonus(coupon, undefined);
  await Promise.resolve();
  assert.deepEqual(seen, []);
});
