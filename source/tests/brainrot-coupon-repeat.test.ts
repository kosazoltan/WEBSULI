import assert from "node:assert/strict";
import test from "node:test";

import { couponBaseKey, createCouponRepeat } from "../client/src/lib/brainRot/couponRepeat";

/** Review #485 K1 — a kupon-tartalék sorrendje (végrehajtás J5a 17.). #483 után törölhető a modullal együtt. */
const items = ["mat:a", "mat:b", "mat:c"];
const key = (s: string) => s;

test("kimerüléskor előbb a hibázott tétel, utána a legrégebben látott; a közvetlenül előző soha (≥ 2 tételnél)", () => {
  const r = createCouponRepeat();
  for (const k of items) r.asked(k);
  r.outcome("mat:a", "correct");
  r.outcome("mat:b", "wrong");
  r.outcome("mat:c", "correct");
  const first = r.next(items, key)!;
  assert.equal(couponBaseKey(first.key), "mat:b", "a hibázott előbb");
  assert.ok(first.key !== "mat:b" && first.key.startsWith("mat:b#ism"), "új változat-kulcs");
  r.asked(first.key);
  r.outcome(first.key, "correct"); // javítva
  const second = r.next(items, key)!;
  assert.equal(couponBaseKey(second.key), "mat:a", "utána a legrégebben látott");
  r.asked(second.key);
  r.outcome(second.key, "timeout");
  const third = r.next(items, key)!;
  assert.notEqual(couponBaseKey(third.key), "mat:a", "a közvetlenül előzőt nem ismétli, akkor sem, ha hibázott");
  assert.equal(couponBaseKey(third.key), "mat:c");
  r.asked(third.key);
  assert.equal(couponBaseKey(r.next(items, key)!.key), "mat:a", "a hibázott a következő körben jön");
});

test("egy tételnél ismétli ugyanazt; üres készletnél null; a megszakítás nem hiba; reset után tiszta", () => {
  const r = createCouponRepeat();
  r.asked("mat:x");
  assert.equal(couponBaseKey(r.next(["mat:x"], key)!.key), "mat:x");
  assert.equal(r.next([], key), null);
  const r2 = createCouponRepeat();
  for (const k of items) r2.asked(k);
  r2.outcome("mat:a", "aborted");
  assert.equal(couponBaseKey(r2.next(items, key)!.key), "mat:a", "nem hibázott → a legrégebben látott");
  r2.reset();
  assert.equal(couponBaseKey(r2.next(items, key)!.key), "mat:a");
});
