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
  const out = computeCoupon(P, { streak: 3 }, { score: 55, isLessonFinal: false , correctCount: 6 });

  assert.equal(out.minutes, null, "80 % alatt nem jár kupon");
  assert.equal(out.nextStreak, 0, "a létra-sorozat visszaesik nullára");
});

test("AC2 80–99 %: kupon jár, a létra nem lép", () => {
  const out = computeCoupon(P, { streak: 1 }, { score: 90, isLessonFinal: false , correctCount: 6 });

  assert.equal(out.minutes, P.ladder[1], "az aktuális létrafok jár");
  assert.equal(out.nextStreak, 1, "a sorozat változatlan marad");
});

test("AC3 négy egymást követő 100 %: 1, 2, 3, 4 perc", () => {
  let streak = 0;
  const granted: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const out = computeCoupon(P, { streak }, { score: 100, isLessonFinal: false , correctCount: 6 });
    assert.notEqual(out.minutes, null);
    granted.push(out.minutes as number);
    streak = out.nextStreak;
  }

  assert.deepEqual(granted, [1, 2, 3, 4]);
  assert.equal(streak, 4);
});

test("AC3 a létra a legfelső fokon megáll", () => {
  const out = computeCoupon(P, { streak: 99 }, { score: 100, isLessonFinal: false , correctCount: 6 });

  assert.equal(out.minutes, P.ladder[P.ladder.length - 1], "a legfelső fok az plafon");
  assert.equal(out.nextStreak, 100, "a sorozat tovább számol, a perc nem nő");
});

test("AC4 záró próba 100 %-on lessonPerfectMax", () => {
  const out = computeCoupon(P, { streak: 0 }, { score: 100, isLessonFinal: true , correctCount: 6 });

  assert.equal(out.minutes, P.lessonPerfectMax);
  assert.equal(out.minutes, 10);
});

test("záró próba 80–99 %-on nem kapja meg a 10 percet", () => {
  const out = computeCoupon(P, { streak: 0 }, { score: 95, isLessonFinal: true , correctCount: 6 });

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
    computeCoupon(custom, { streak: 0 }, { score: 100, isLessonFinal: false , correctCount: 6 }).minutes,
    7,
  );
  assert.equal(
    computeCoupon(custom, { streak: 1 }, { score: 100, isLessonFinal: false , correctCount: 6 }).minutes,
    9,
  );
  assert.equal(
    computeCoupon(custom, { streak: 0 }, { score: 100, isLessonFinal: true , correctCount: 6 }).minutes,
    42,
  );
  // A saját küszöb szerint az 55 % már jutalmazott, holott az alapértelmezett 80 alatt van.
  assert.equal(
    computeCoupon(custom, { streak: 0 }, { score: 55, isLessonFinal: false , correctCount: 6 }).minutes,
    7,
  );
});

/* ------------- M-4: játékidő öt helyes válasz után, nem egy után ------------- */

/**
 * A tulajdonos észrevétele (2026-09-07): „nem mindegyik helyes válasz után mehessen
 * játszani a gyerek, hanem mondjuk öt helyes válasz után, mert így végigjátszani
 * fognak és nem tanulni."
 *
 * A kódból mérve ez pontosan így is volt: a `computeCoupon` csak a SZÁZALÉKOT nézte, a
 * helyes válaszok számát nem. Egy egyetlen `check` blokkból álló szakasz Próbája
 * 1/1 = 100% → azonnal kupon. A küszöb mostantól a `reward_policy` táblából jön, mint
 * minden más érték: a tulajdonos hangolhatja deploy nélkül.
 */

test("M-4 egyetlen helyes válasz nem ér játékidőt", () => {
  const out = computeCoupon(P, { streak: 0 }, { score: 100, isLessonFinal: false, correctCount: 1 });

  assert.equal(out.minutes, null, "1/1 = 100%, de egyetlen válasz nem tanulás");
});

test("M-4 négy helyes válasz még kevés, öt már elég", () => {
  const four = computeCoupon(P, { streak: 0 }, { score: 100, isLessonFinal: false, correctCount: 4 });
  const five = computeCoupon(P, { streak: 0 }, { score: 100, isLessonFinal: false, correctCount: 5 });

  assert.equal(four.minutes, null);
  assert.ok(five.minutes !== null && five.minutes > 0, "öt helyes válasz után jár a játékidő");
});

test("M-4 a küszöb alatt a sorozat NEM esik vissza", () => {
  // A gyerek nem hibázott — csak kevés kérdés volt a szakaszban. Büntetni ezért hibás.
  const out = computeCoupon(P, { streak: 3 }, { score: 100, isLessonFinal: false, correctCount: 2 });

  assert.equal(out.minutes, null);
  assert.equal(out.nextStreak, 3, "a hibátlan teljesítmény nem törheti meg a sorozatot");
});

test("M-4 a gyenge eredmény továbbra is nullázza a sorozatot, akárhány kérdés volt", () => {
  const out = computeCoupon(P, { streak: 3 }, { score: 55, isLessonFinal: false, correctCount: 6 });

  assert.equal(out.minutes, null);
  assert.equal(out.nextStreak, 0, "a rossz eredmény az RÉGI szabály szerint nulláz");
});

test("M-4 a küszöb a táblából jön, nem a kódból", () => {
  const strict: RewardPolicy = { ...P, minCorrectForCoupon: 8 };
  const loose: RewardPolicy = { ...P, minCorrectForCoupon: 2 };
  const outcome = { score: 100, isLessonFinal: false, correctCount: 5 } as const;

  assert.equal(computeCoupon(strict, { streak: 0 }, outcome).minutes, null, "8-as küszöbnél 5 kevés");
  assert.ok(computeCoupon(loose, { streak: 0 }, outcome).minutes !== null, "2-es küszöbnél 5 elég");
});

test("M-4 az alapérték öt, ahogy a tulajdonos kérte", () => {
  assert.equal(DEFAULT_REWARD_POLICY.minCorrectForCoupon, 5);
});

test("M-4 a mező nélküli RÉGI policy-sor továbbra is beolvasható", () => {
  // A `reward_policy` táblában már van sor; az nem tartalmazza az új mezőt. Ha a
  // beolvasás emiatt a teljes alapértelmezésre esne vissza, a tulajdonos hangolt
  // létrája némán elveszne.
  const legacy = {
    ladder: [2, 4, 6],
    lessonPerfectMax: 12,
    thresholds: { retry: 70, perfect: 95 },
    bonusSeconds: 45,
    couponTtlHours: 48,
    freePlay: false,
  };

  const parsed = parseRewardPolicy(legacy);

  assert.deepEqual(parsed.ladder, [2, 4, 6], "a hangolt létra maradjon meg");
  assert.equal(parsed.lessonPerfectMax, 12);
  assert.equal(parsed.minCorrectForCoupon, DEFAULT_REWARD_POLICY.minCorrectForCoupon);
});

test("M-4 a táblában megadott küszöb felülírja az alapértéket", () => {
  const parsed = parseRewardPolicy({ ...DEFAULT_REWARD_POLICY, minCorrectForCoupon: 3 });

  assert.equal(parsed.minCorrectForCoupon, 3);
});
