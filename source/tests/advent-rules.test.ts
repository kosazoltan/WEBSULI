import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVENT_CHRISTMAS_DAYS,
  ADVENT_GIFT_MESSAGE,
  adventClosing,
  adventPassed,
  adventPercent,
  adventSummary,
  adventStillReachable,
  clampAdventGrade,
  doorState,
  isChristmasDoor,
  limitsForGrade,
  type DoorRecord,
} from "../shared/advent/rules";

/** Adventi naptár — szabályok (docs/specs/2026-11-18-adventi-naptar.md R1–R3, 12.3; A8–A11, A34, A35). */

const attempt = (correct: boolean) => ({ questionId: "q", pick: 0, correct, at: "2026-12-01T10:00:00.000Z" });
const closing = (doors: Record<number, DoorRecord>, ctx: Partial<Parameters<typeof adventClosing>[1]> = {}) =>
  adventClosing(adventSummary(doors, 2), { round: 1, maxRounds: 3, phase: "open", waiting: 0, ...ctx });

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
  assert.equal(closing(doorsOf(24)).kind, "gift");
  const edge = closing(doorsOf(23, 0, 1));
  assert.equal(edge.kind, "gift");
  assert.equal(edge.text, ADVENT_GIFT_MESSAGE);
  // 23 megoldott + 1 javítható → már megfelel (mind megválaszolva, 23 megoldott).
  assert.equal(closing(doorsOf(23, 1)).kind, "gift");
  // 23 megoldott + 1 ki nem nyitott → még nem ért végig.
  const notFinished = closing(doorsOf(23));
  assert.equal(notFinished.kind, "progress");
  assert.notEqual(notFinished.text, ADVENT_GIFT_MESSAGE);
  // 22 megoldott + 2 javítható → javítás.
  const repair = closing(doorsOf(22, 2));
  assert.equal(repair.kind, "repair");
  assert.match(repair.text, /22 ablak már világít a 24-ből/);
  assert.match(repair.text, /2 ablak javításra vár/);
  // 20 megoldott + 4 végleg hibás → új kör; az utolsó kör után nincs több.
  assert.equal(closing(doorsOf(20, 0, 4)).kind, "new-round");
  assert.equal(closing(doorsOf(20, 0, 4), { round: 2 }).kind, "new-round");
  const done = closing(doorsOf(20, 0, 4), { round: 3 });
  assert.equal(done.kind, "done");
  assert.notEqual(done.text, ADVENT_GIFT_MESSAGE);
});

test("a bátorító szövegek nem hibáztatnak és nem ígérnek ajándékot", () => {
  const texts = [
    closing(doorsOf(22, 2)).text,
    closing(doorsOf(18, 3, 3)).text,
    closing(doorsOf(20, 0, 4)).text,
    closing(doorsOf(20, 0, 4), { round: 3 }).text,
    closing(doorsOf(3)).text,
    closing(doorsOf(3), { waiting: 2 }).text,
    closing(doorsOf(20), { phase: "closed" }).text,
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /ajándék/i);
    assert.doesNotMatch(text, /rossz|hib[aá]|buk|sajnos/i);
  }
});

test("vegyes kiosztás: a 3–12. évfolyamon a 3-mal osztható napok karácsonyiak, az 1–2. évfolyamon mind (A34, A35)", () => {
  assert.deepEqual([...ADVENT_CHRISTMAS_DAYS], [3, 6, 9, 12, 15, 18, 21, 24]);
  // Egy igazságforrás (review A5): a lista és a függvény nem térhet el.
  for (let day = 1; day <= 24; day++) assert.equal(isChristmasDoor(day, 7), ADVENT_CHRISTMAS_DAYS.includes(day));
  for (let grade = 3; grade <= 12; grade++) {
    const days = Array.from({ length: 24 }, (_, i) => i + 1).filter((day) => isChristmasDoor(day, grade));
    assert.deepEqual(days, [...ADVENT_CHRISTMAS_DAYS], `${grade}. évfolyam`);
    assert.deepEqual(limitsForGrade(grade), { maxRepairs: 2, maxRounds: 3 });
  }
  for (const grade of [1, 2]) {
    for (let day = 1; day <= 24; day++) assert.equal(isChristmasDoor(day, grade), true);
    // A (b) döntés kivétel nélküli: az 1–2. évfolyamon is 2 javítás (review K3); a készlet mérete miatt 2 kör.
    assert.deepEqual(limitsForGrade(grade), { maxRepairs: 2, maxRounds: 2 });
  }
});

test("évfolyam-határok: 1 alatt 1, 12 felett 12", () => {
  assert.equal(clampAdventGrade(0), 1);
  assert.equal(clampAdventGrade(-3), 1);
  assert.equal(clampAdventGrade(13), 12);
  assert.equal(clampAdventGrade(7.4), 7);
  assert.equal(clampAdventGrade(Number.NaN), 1);
});

test("a záró szöveg a fázishoz igazodik (review K5): lezárva nincs „holnap” és nincs új kör", () => {
  // Nyitott fázis, minden mai ablak megvan → holnap; van még váró ablak → azt mondja.
  assert.match(closing(doorsOf(5)).text, /Gyere vissza holnap is!/);
  assert.match(closing(doorsOf(5), { waiting: 3 }).text, /Még 3 ablak vár rád!/);
  // Pótlási időszak: nincs „holnap”.
  const catchup = closing(doorsOf(20), { phase: "catchup", waiting: 4 });
  assert.equal(catchup.kind, "progress");
  assert.doesNotMatch(catchup.text, /holnap/);
  assert.doesNotMatch(closing(doorsOf(23), { phase: "catchup", waiting: 0 }).text, /holnap/);
  // Lezárt naptár: sem „holnap”, sem új kör, sem javítás — de aki megfelelt, annak az üzenete megmarad.
  for (const doors of [doorsOf(20), doorsOf(20, 0, 4), doorsOf(22, 2)]) {
    const closed = closing(doors, { phase: "closed" });
    assert.equal(closed.kind, "closed");
    assert.doesNotMatch(closed.text, /holnap|új naptár|javítsd/);
    assert.match(closed.text, /jövőre újra találkozunk/);
  }
  assert.equal(closing(doorsOf(24), { phase: "closed" }).kind, "gift");
});

test("a javító szöveg csak akkor ígér meglepetést, ha a 95% még elérhető (review A6)", () => {
  // 22 megoldott + 2 javítható → 24 elérhető.
  assert.equal(adventStillReachable(adventSummary(doorsOf(22, 2), 2)), true);
  assert.match(closing(doorsOf(22, 2)).text, /meglepetés vár/);
  // 18 megoldott + 3 javítható + 3 végleg hibás → legfeljebb 21: nincs ígéret.
  assert.equal(adventStillReachable(adventSummary(doorsOf(18, 3, 3), 2)), false);
  const text = closing(doorsOf(18, 3, 3)).text;
  assert.doesNotMatch(text, /meglepetés/);
  assert.match(text, /3 ablak javításra vár/);
  // 10 megoldott + 1 javítható, 13 még megválaszolatlan → elérhető.
  assert.equal(adventStillReachable(adventSummary(doorsOf(10, 1), 2)), true);
  // 2 végleg hibás → 22 a legtöbb: nem elérhető.
  assert.equal(adventStillReachable(adventSummary(doorsOf(5, 0, 2), 2)), false);
});

test("összesítés egy javítással is számol (maxRepairs = 1): a második hiba végleges", () => {
  const doors: Record<number, DoorRecord> = { 1: { attempts: [attempt(false)] }, 2: { attempts: [attempt(false), attempt(false)] }, 3: { attempts: [attempt(false), attempt(true)] } };
  assert.deepEqual(adventSummary(doors, 1), { total: 24, answered: 3, solved: 1, firstTry: 0, repairable: 1, failed: 1, passed: false, percent: 4 });
});
