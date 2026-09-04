import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceClock,
  applyServerSync,
  formatRemaining,
  initialClock,
  type CouponClock,
} from "../client/src/game-engine/coupon-clock";

/**
 * LS-3b — the client's view of a coupon clock.
 *
 * The server owns the time (LS-3a); this module exists only so the HUD can show a
 * smooth countdown between the 15-second syncs. That makes one rule load-bearing: a
 * sync always wins, and the local tick may only ever agree with the server or lag
 * behind it. If the local counter could outrun the server, the child would be shown
 * time they do not have — and the game would keep running past the reward.
 *
 * Pure, with time passed in, so a two-minute coupon can be tested in a millisecond.
 */

const T0 = 1_000_000;
const at = (s: number) => T0 + s * 1000;

test("AC4 kupon nélkül nincs menet", () => {
  const clock = initialClock(null, T0);

  assert.equal(clock, null, "aktív kupon nélkül a HUD-nak nincs mit mutatnia");
});

test("indításkor a szerver értékéből indul", () => {
  const clock = initialClock({ id: "c1", remainingSeconds: 120 }, T0);

  assert.equal(clock?.remaining, 120);
  assert.equal(clock?.expired, false);
});

test("a helyi tick másodpercenként fogy", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 120 }, T0) as CouponClock;

  clock = advanceClock(clock, at(1));
  assert.equal(clock.remaining, 119);

  clock = advanceClock(clock, at(5));
  assert.equal(clock.remaining, 115);
});

test("AC1 a szerver szinkronja felülírja a helyi számlálót", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 120 }, T0) as CouponClock;
  clock = advanceClock(clock, at(10));
  assert.equal(clock.remaining, 110);

  // A szerver kevesebbet mond (pl. máshol is fogyott az idő) — övé a döntés.
  clock = applyServerSync(clock, { id: "c1", remainingSeconds: 60 }, at(10));
  assert.equal(clock.remaining, 60);
});

test("AC1 a helyi tick nem mehet a szerver értéke fölé", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 30 }, T0) as CouponClock;
  clock = advanceClock(clock, at(5));

  // A szerver TÖBBET mond, mint a helyi számláló: bónusz nélkül ez nem hosszabbíthat.
  clock = applyServerSync(clock, { id: "c1", remainingSeconds: 300 }, at(5));

  assert.equal(clock.remaining, 300, "a szerver a mérce — bónusz után nőhet is");
  assert.equal(clock.serverRemaining, 300);
});

test("AC2 szünetben nem fogy a helyi idő", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 120 }, T0) as CouponClock;

  clock = { ...clock, paused: true, lastTickAt: T0 };
  clock = advanceClock(clock, at(45));

  assert.equal(clock.remaining, 120, "elrejtett fülön a HUD nem számol tovább");
});

test("AC2 szünet után a szinkron behozza a szerver szerinti időt", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 120 }, T0) as CouponClock;
  clock = { ...clock, paused: true, lastTickAt: T0 };
  clock = advanceClock(clock, at(45));
  assert.equal(clock.remaining, 120);

  // A szerver órája közben járt: 45 másodperc tényleg elfogyott.
  clock = applyServerSync(clock, { id: "c1", remainingSeconds: 75 }, at(45));

  assert.equal(clock.remaining, 75, "a szünet nem időnyerés");
});

test("AC3 a hátralévő idő nem megy negatívba", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 5 }, T0) as CouponClock;

  clock = advanceClock(clock, at(60));

  assert.equal(clock.remaining, 0);
});

test("AC3 nulla időnél a menet lejárt", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 2 }, T0) as CouponClock;

  clock = advanceClock(clock, at(1));
  assert.equal(clock.expired, false);

  clock = advanceClock(clock, at(2));
  assert.equal(clock.expired, true, "nulla másodperc = vége a menetnek");
});

test("egy másik kupon szinkronja új menetet kezd", () => {
  let clock = initialClock({ id: "c1", remainingSeconds: 10 }, T0) as CouponClock;
  clock = advanceClock(clock, at(9));

  clock = applyServerSync(clock, { id: "c2", remainingSeconds: 120 }, at(9));

  assert.equal(clock.couponId, "c2");
  assert.equal(clock.remaining, 120);
  assert.equal(clock.expired, false);
});

test("a szinkron eltűnt kuponra lejárttá teszi a menetet", () => {
  const clock = initialClock({ id: "c1", remainingSeconds: 120 }, T0) as CouponClock;

  const after = applyServerSync(clock, null, at(3));

  assert.equal(after.remaining, 0);
  assert.equal(after.expired, true);
});

test("a másodperc-formázás m:ss alakú", () => {
  assert.equal(formatRemaining(0), "0:00");
  assert.equal(formatRemaining(5), "0:05");
  assert.equal(formatRemaining(65), "1:05");
  assert.equal(formatRemaining(600), "10:00");
});
