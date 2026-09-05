import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldIssueCoupon,
  BONUS_ALREADY_CLAIMED,
  BONUS_NOT_SERVED,
  applyBonus,
  remainingSeconds,
  type CouponState,
} from "../server/rewards/coupons";

/**
 * LS-3a — the clock belongs to the server.
 *
 * Whatever the page believes about time, the remaining play seconds are derived from
 * `serverStartedAt` and the coupon's own grant. A hidden tab, a paused animation frame
 * or a rewound system clock therefore cannot extend the reward.
 *
 * The bonus is guarded twice: the quiz item must be one the server handed to this coupon
 * session, and it may only be redeemed once. Both are checked here, because "reward the
 * child for a correct answer" is exactly the kind of endpoint that gets replayed.
 */

const T0 = new Date("2026-09-04T10:00:00.000Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function coupon(over: Partial<CouponState> = {}): CouponState {
  return {
    id: "cp-1",
    minutes: 2,
    bonusSeconds: 0,
    serverStartedAt: T0,
    expiresAt: new Date(T0.getTime() + 24 * 3600 * 1000),
    servedItems: [],
    claimedItems: [],
    ...over,
  };
}

test("AC6 a hátralévő idő a serverStartedAt-ból számolódik", () => {
  const c = coupon();

  assert.equal(remainingSeconds(c, T0), 120);
  assert.equal(remainingSeconds(c, at(30)), 90);
  assert.equal(remainingSeconds(c, at(119)), 1);
});

test("AC6 lejárt kupon: 0 másodperc", () => {
  const c = coupon();

  assert.equal(remainingSeconds(c, at(120)), 0);
  assert.equal(remainingSeconds(c, at(10_000)), 0, "nem megy negatívba");
});

test("a lejárati idő is levágja a hátralévő időt", () => {
  const c = coupon({ minutes: 60, expiresAt: at(45) });

  assert.equal(remainingSeconds(c, at(10)), 35, "az expiresAt előbb ér véget, mint a perckeret");
  assert.equal(remainingSeconds(c, at(50)), 0);
});

test("el nem indított kupon: a teljes idő hátravan", () => {
  const c = coupon({ serverStartedAt: null });

  assert.equal(remainingSeconds(c, at(9999)), 120, "az óra csak indításkor kezd járni");
});

test("a bónusz hozzáadódik a hátralévő időhöz", () => {
  const c = coupon({ bonusSeconds: 30 });

  assert.equal(remainingSeconds(c, at(120)), 30);
});

test("AC7 ki nem szolgált kérdés bónusza elutasítva", () => {
  const c = coupon({ servedItems: ["q-1"] });

  const out = applyBonus(c, "q-hamis", 30, at(10));

  assert.equal(out.ok, false);
  assert.equal(out.reason, BONUS_NOT_SERVED);
  assert.equal(c.bonusSeconds, 0, "a bemeneti állapot nem módosul");
});

test("AC8 kétszer beváltott kérdés elutasítva", () => {
  const c = coupon({ servedItems: ["q-1"] });

  const first = applyBonus(c, "q-1", 30, at(10));
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.coupon.bonusSeconds, 30);

  const second = applyBonus(first.ok ? first.coupon : c, "q-1", 30, at(20));
  assert.equal(second.ok, false);
  assert.equal(second.reason, BONUS_ALREADY_CLAIMED);
});

test("lejárt kuponra nem jár bónusz", () => {
  const c = coupon({ servedItems: ["q-1"] });

  const out = applyBonus(c, "q-1", 30, at(500));

  assert.equal(out.ok, false, "a lejárt kupont nem lehet bónusszal feltámasztani");
});

test("a bónusz nem növelheti a hátralévő időt a lejárat fölé", () => {
  const c = coupon({ minutes: 5, expiresAt: at(60), servedItems: ["q-1"] });

  const out = applyBonus(c, "q-1", 30, at(50));
  assert.equal(out.ok, true);

  assert.equal(
    remainingSeconds(out.ok ? out.coupon : c, at(50)),
    10,
    "a lejárat a bónusz fölött is felső korlát",
  );
});

/* ------------------------------------------------------------------ *
 * Audit 2026-09-05 (szelet B) — kupon-idempotencia egy szakaszra
 * ------------------------------------------------------------------ */

test("shouldIssueCoupon: ugyanarra a szakaszra 24 órán belül volt kupon → nem jár újra (farmolás tilos)", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const recent = [{ sectionIdx: 2, issuedAt: new Date("2026-09-05T11:00:00Z") }];
  assert.equal(shouldIssueCoupon(recent, 2, now), false);
});

test("shouldIssueCoupon: más szakasz, vagy 24 óránál régebbi kupon → jár", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  assert.equal(shouldIssueCoupon([{ sectionIdx: 1, issuedAt: new Date("2026-09-05T11:00:00Z") }], 2, now), true);
  assert.equal(shouldIssueCoupon([{ sectionIdx: 2, issuedAt: new Date("2026-09-04T11:59:00Z") }], 2, now), true);
  assert.equal(shouldIssueCoupon([], 0, now), true);
});
