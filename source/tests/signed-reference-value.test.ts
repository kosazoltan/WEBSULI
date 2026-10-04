import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeTypedAnswers, parseReferenceExpression, referenceValue, referenceValueProblems } from "../shared/answer-value";

/* Mért (2026-10-04, run 69cacab5, „Negatív számok kivonása”): a „+3” referencia „nem értelmezhető” volt, így minden
 * előjeles eredményű bankcsomag bukott kísérletet ért. A pozitív előjel a 7. osztályos jelölés része. */

test("egyoperandusú plusz: „+3”, „+(-6)”, „(+3)” értelmezhető, az érték helyes", () => {
  assert.equal(referenceValue("+3"), 3);
  assert.equal(referenceValue("+13"), 13);
  assert.equal(referenceValue("+(-6)"), -6);
  assert.equal(referenceValue("(+3)"), 3);
  assert.equal(referenceValue("9 - (+6)"), 3);
  assert.equal(referenceValue("-5 - (+8)"), -13);
  assert.equal(parseReferenceExpression("+").valid, false, "magában álló jel nem kifejezés");
  assert.equal(referenceValue("3 +"), null, "csonka kifejezés");
  assert.equal(referenceValue("++3"), 3, "ismételt előjel matematikailag értelmes");
});

test("a pozitív előjeles referenciával a helyes tanulói válasz teljes pont, a hibás nem", () => {
  const typed = [{ part: "végpont", kind: "number" as const, value: "+3" }];
  assert.equal(gradeTypedAnswers("9-(+6)=+3, mert hatot balra lépünk.", typed).correct, 1);
  assert.equal(gradeTypedAnswers("9-(+6)=3", typed).correct, 1);
  assert.equal(gradeTypedAnswers("9-(+6)=15", typed).correct, 0);
  assert.equal(gradeTypedAnswers("9-(+6)=+3", typed).undecidable, false);
});

test("a csomag-ellenőrzés a „+3” referenciát nem jelzi „nem értelmezhetőnek”; zárójel nélküli kérdésnél a hamis referencia továbbra is hiba", () => {
  const plus = (q: string, value: string) => referenceValueProblems({ id: "t", q, typedAnswers: [{ part: "eredmény", kind: "number", value }] });
  assert.deepEqual(plus("Számold ki: 9-(+6)", "+3"), [], "a mért hiba: „+3” nem értelmezhető volt");
  assert.deepEqual(plus("Számold ki: 9 - 6", "+3"), []);
  assert.equal(plus("Számold ki: 9 - 6", "+15").length, 1, "zárójel nélküli kifejezésnél a hamis referencia hiba");
  // zárójeles kérdést a függvény dokumentáltan nem ítél meg (a bank-ellenőr dolga) — ez nem változik
  assert.deepEqual(plus("Számold ki: 9-(-6)", "+3"), []);
});
