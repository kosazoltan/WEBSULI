import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVENT_CHRISTMAS_DAYS,
  ADVENT_GIFT_MESSAGE,
  adventClosing,
  adventPassed,
  adventPercent,
  adventSummary,
  clampAdventGrade,
  doorState,
  isChristmasDoor,
  limitsForGrade,
  type DoorRecord,
} from "../shared/advent/rules";

/** Adventi naptár — szabályok (docs/specs/2026-11-18-adventi-naptar.md R1–R3, 12.3; A8–A11, A34, A35). */

const attempt = (correct: boolean) => ({ questionId: "q", pick: 0, correct, at: "2026-12-01T10:00:00.000Z" });
/** `solved` megoldott, `repairable` egyszer elrontott, `failed` háromszor elrontott ablak; a többi megválaszolatlan. */
function doorsOf(solved: number, repairable = 0, failed = 0, firstTryWrong = 0): Record<number, DoorRecord> {
  const doors: Record<number, DoorRecord> = {};
  let day = 1;
  for (let i = 0; i < solved; i++) doors[day++] = { attempts: i < firstTryWrong ? [attempt(false), attempt(true)] : [attempt(true)] };
  for (let i = 0; i < repairable; i++) doors[day++] = { attempts: [attempt(false)] };
  for (let i = 0; i < failed; i++) doors[day++] = { attempts: [attempt(false), attempt(false), attempt(false)] };
  return doors;
}

test("a záró üzenet karakterre a tulajdonos szövege (R2, A8)", () => {
  assert.equal(ADVENT_GIFT_MESSAGE, "Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.");
});

test("a 95% szabálya: mind a 24 megválaszolva ÉS legalább 23 megoldott — teljes tábla (R1)", () => {
  for (let answered = 0; answered <= 24; answered++) {
    for (let solved = 0; solved <= answered; solved++) {
      assert.equal(adventPassed(solved, answered), answered === 24 && solved >= 23, `megoldott ${solved}, megválaszolt ${answered}`);
    }
  }
  assert.equal(adventPassed(23, 24), true, "23 / 24 = 95,83% megfelel");
  assert.equal(adventPassed(22, 24), false, "22 / 24 = 91,67% nem felel meg");
  assert.equal(adventPassed(23, 23), false, "23 megoldott, de a 24. ablak nincs megválaszolva: nem ért végig");
  assert.equal(adventPercent(23), 95);
  assert.equal(adventPercent(22), 91);
  assert.equal(adventPercent(24), 100);
});

test("az ablak állapota: megoldott / javítható (legfeljebb 2 javítás) / hibás", () => {
  assert.equal(doorState({ unlocked: false, attempts: [], maxRepairs: 2 }), "locked");
  assert.equal(doorState({ unlocked: true, attempts: [], maxRepairs: 2 }), "open");
  assert.equal(doorState({ unlocked: true, attempts: [attempt(true)], maxRepairs: 2 }), "solved");
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false)], maxRepairs: 2 }), "repairable");
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false), attempt(false)], maxRepairs: 2 }), "repairable");
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false), attempt(false), attempt(false)], maxRepairs: 2 }), "failed");
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false), attempt(false), attempt(true)], maxRepairs: 2 }), "solved");
  // 1–2. évfolyam: egy javítás.
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false)], maxRepairs: 1 }), "repairable");
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false), attempt(false)], maxRepairs: 1 }), "failed");
  // Javítás nélkül az első hiba végleges.
  assert.equal(doorState({ unlocked: true, attempts: [attempt(false)], maxRepairs: 0 }), "failed");
});

test("összesítés: megoldott, elsőre jó, javítható, hibás (A11)", () => {
  const s = adventSummary(doorsOf(20, 2, 1, 5), 2);
  assert.deepEqual(s, { total: 24, answered: 23, solved: 20, firstTry: 15, repairable: 2, failed: 1, passed: false, percent: 83 });
});

test("határesetek (terv R1, E1–E3): mikor jár az ajándék-üzenet", () => {
  // 24 / 24 és 23 megoldott + 1 végleg hibás → megfelel.
  assert.equal(adventClosing(adventSummary(doorsOf(24), 2), 1, 3).kind, "gift");
  const edge = adventClosing(adventSummary(doorsOf(23, 0, 1), 2), 1, 3);
  assert.equal(edge.kind, "gift");
  assert.equal(edge.text, ADVENT_GIFT_MESSAGE);
  // 23 megoldott + 1 javítható → már megfelel (mind megválaszolva, 23 megoldott).
  assert.equal(adventClosing(adventSummary(doorsOf(23, 1), 2), 1, 3).kind, "gift");
  // 23 megoldott + 1 ki nem nyitott → még nem ért végig.
  const notFinished = adventClosing(adventSummary(doorsOf(23), 2), 1, 3);
  assert.equal(notFinished.kind, "progress");
  assert.notEqual(notFinished.text, ADVENT_GIFT_MESSAGE);
  // 22 megoldott + 2 javítható → javítás.
  const repair = adventClosing(adventSummary(doorsOf(22, 2), 2), 1, 3);
  assert.equal(repair.kind, "repair");
  assert.match(repair.text, /22 ablak már világít a 24-ből/);
  assert.match(repair.text, /2 ablak javításra vár/);
  // 20 megoldott + 4 végleg hibás → új kör; az utolsó kör után nincs több.
  assert.equal(adventClosing(adventSummary(doorsOf(20, 0, 4), 2), 1, 3).kind, "new-round");
  assert.equal(adventClosing(adventSummary(doorsOf(20, 0, 4), 2), 2, 3).kind, "new-round");
  const done = adventClosing(adventSummary(doorsOf(20, 0, 4), 2), 3, 3);
  assert.equal(done.kind, "done");
  assert.notEqual(done.text, ADVENT_GIFT_MESSAGE);
});

test("a bátorító szövegek nem hibáztatnak és nem ígérnek ajándékot", () => {
  const texts = [
    adventClosing(adventSummary(doorsOf(22, 2), 2), 1, 3).text,
    adventClosing(adventSummary(doorsOf(20, 0, 4), 2), 1, 3).text,
    adventClosing(adventSummary(doorsOf(20, 0, 4), 2), 3, 3).text,
    adventClosing(adventSummary(doorsOf(3), 2), 1, 3).text,
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /ajándék/i);
    assert.doesNotMatch(text, /rossz|hib[aá]|buk|sajnos/i);
  }
});

test("vegyes kiosztás: a 3–12. évfolyamon a 3-mal osztható napok karácsonyiak, az 1–2. évfolyamon mind (A34, A35)", () => {
  assert.deepEqual([...ADVENT_CHRISTMAS_DAYS], [3, 6, 9, 12, 15, 18, 21, 24]);
  for (let grade = 3; grade <= 12; grade++) {
    const days = Array.from({ length: 24 }, (_, i) => i + 1).filter((day) => isChristmasDoor(day, grade));
    assert.deepEqual(days, [...ADVENT_CHRISTMAS_DAYS], `${grade}. évfolyam`);
    assert.deepEqual(limitsForGrade(grade), { maxRepairs: 2, maxRounds: 3 });
  }
  for (const grade of [1, 2]) {
    for (let day = 1; day <= 24; day++) assert.equal(isChristmasDoor(day, grade), true);
    assert.deepEqual(limitsForGrade(grade), { maxRepairs: 1, maxRounds: 2 });
  }
});

test("évfolyam-határok: 1 alatt 1, 12 felett 12", () => {
  assert.equal(clampAdventGrade(0), 1);
  assert.equal(clampAdventGrade(-3), 1);
  assert.equal(clampAdventGrade(13), 12);
  assert.equal(clampAdventGrade(7.4), 7);
  assert.equal(clampAdventGrade(Number.NaN), 1);
});
