import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REWARD_POLICY,
  computeCoupon,
  parseRewardPolicy,
  type RewardPolicy,
} from "../shared/reward-policy";

/**
 * LS-3a — D2 in machine-checkable form.
 *
 * The coupon ladder is the owner's reward design: a child who nails a section gets one
 * minute of Tsunami, and each consecutive flawless section is worth one more, up to the
 * ladder's top. A section that was merely good still pays, but does not advance the
 * ladder — the increase is the prize for perfection, not for participation.
 *
 * Every number here comes from the `reward_policy` table. The last test in this file is
 * the guard for that: it feeds a policy with different values and requires the output to
 * follow the policy, so a literal hard-coded in the implementation cannot survive.
 */

const P = DEFAULT_REWARD_POLICY;

test("AC1 gyenge eredmény: nincs kupon, a sorozat nullázódik", () => {
  const out = computeCoupon(P, { streak: 3 }, { score: 55, isLessonFinal: false });

  assert.equal(out.minutes, null, "80 % alatt nem jár kupon");
  assert.equal(out.nextStreak, 0, "a létra-sorozat visszaesik nullára");
});

test("AC2 80–99 %: kupon jár, a létra nem lép", () => {
  const out = computeCoupon(P, { streak: 1 }, { score: 90, isLessonFinal: false });

  assert.equal(out.minutes, P.ladder[1], "az aktuális létrafok jár");
  assert.equal(out.nextStreak, 1, "a sorozat változatlan marad");
});

test("AC3 négy egymást követő 100 %: 1, 2, 3, 4 perc", () => {
  let streak = 0;
  const granted: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const out = computeCoupon(P, { streak }, { score: 100, isLessonFinal: false });
    assert.notEqual(out.minutes, null);
    granted.push(out.minutes as number);
    streak = out.nextStreak;
  }

  assert.deepEqual(granted, [1, 2, 3, 4]);
  assert.equal(streak, 4);
});

test("AC3 a létra a legfelső fokon megáll", () => {
  const out = computeCoupon(P, { streak: 99 }, { score: 100, isLessonFinal: false });

  assert.equal(out.minutes, P.ladder[P.ladder.length - 1], "a legfelső fok az plafon");
  assert.equal(out.nextStreak, 100, "a sorozat tovább számol, a perc nem nő");
});

test("AC4 záró próba 100 %-on lessonPerfectMax", () => {
  const out = computeCoupon(P, { streak: 0 }, { score: 100, isLessonFinal: true });

  assert.equal(out.minutes, P.lessonPerfectMax);
  assert.equal(out.minutes, 10);
});

test("záró próba 80–99 %-on nem kapja meg a 10 percet", () => {
  const out = computeCoupon(P, { streak: 0 }, { score: 95, isLessonFinal: true });

  assert.equal(out.minutes, P.ladder[0], "a záró bónusz csak hibátlanért jár");
});

test("AC9 hiányzó politika-sor esetén a beépített alapérték érvényes", () => {
  const parsed = parseRewardPolicy(undefined);

  assert.deepEqual(parsed, DEFAULT_REWARD_POLICY);
  assert.deepEqual(parsed.ladder, [1, 2, 3, 4]);
  assert.equal(parsed.freePlay, true);
});

test("hibás politika-sor esetén is a beépített alapérték érvényes", () => {
  assert.deepEqual(parseRewardPolicy({ ladder: "nem tömb" }), DEFAULT_REWARD_POLICY);
  assert.deepEqual(parseRewardPolicy({ ladder: [] }), DEFAULT_REWARD_POLICY);
  assert.deepEqual(parseRewardPolicy(null), DEFAULT_REWARD_POLICY);
});

test("a percértékek a politikából jönnek, nem literálból", () => {
  const custom: RewardPolicy = {
    ...DEFAULT_REWARD_POLICY,
    ladder: [7, 9],
    lessonPerfectMax: 42,
    thresholds: { retry: 50, perfect: 100 },
  };

  assert.equal(
    computeCoupon(custom, { streak: 0 }, { score: 100, isLessonFinal: false }).minutes,
    7,
  );
  assert.equal(
    computeCoupon(custom, { streak: 1 }, { score: 100, isLessonFinal: false }).minutes,
    9,
  );
  assert.equal(
    computeCoupon(custom, { streak: 0 }, { score: 100, isLessonFinal: true }).minutes,
    42,
  );
  // A saját küszöb szerint az 55 % már jutalmazott, holott az alapértelmezett 80 alatt van.
  assert.equal(
    computeCoupon(custom, { streak: 0 }, { score: 55, isLessonFinal: false }).minutes,
    7,
  );
});
