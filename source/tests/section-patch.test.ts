import test from "node:test";
import assert from "node:assert/strict";
import { falseArithmeticClaims, evaluateExpression, arithmeticClaimProblems } from "../server/studio/tools/arithmetic-claims";

test("aritmetikai állítások: a mért hibaosztályok kódból buknak, a helyes állítás nem", () => {
  assert.equal(evaluateExpression("12 · 2"), 24);
  assert.equal(evaluateExpression("30+3·6–12:4"), 45);
  assert.equal(evaluateExpression("36 ÷ (3 · 2)"), null, "zárójelet nem értékel");
  assert.equal(evaluateExpression("7 : 2"), 3.5);
  assert.deepEqual(falseArithmeticClaims("A hibás út 12 · 2 = 48-at állít."), ["12 · 2 = 48 (helyesen: 24)"]);
  assert.deepEqual(falseArithmeticClaims("A zárójeles példa szerint 154 · 8 = 1238."), ["154 · 8 = 1238 (helyesen: 1232)"]);
  assert.deepEqual(falseArithmeticClaims("194·5 = 970"), []);
  assert.deepEqual(falseArithmeticClaims("Először 6 · 8 = 48, majd 148 + 48 = 196. 30+3·6–12:4 = 45."), []);
  assert.deepEqual(falseArithmeticClaims("36 ÷ (3 · 2) – 3 = 3"), [], "zárójeles kifejezésről nem ítél");
  // Mérve (regressziós futás 94a5ccf9): a tanulói lépéssor egyenlőség-LÁNC — tagonként kiértékelve mind 26.
  assert.deepEqual(falseArithmeticClaims("Egy tanuló így számolta: 40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 26. Ellenőrizd!"), [], "lépéssor nem hamis");
  assert.deepEqual(falseArithmeticClaims("40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 27"), ["22 + 4 = 27 (helyesen: 26)"], "a lánc utolsó, hibás tagja");
  assert.equal(evaluateExpression("26"), 26, "önálló szám önmaga");
  const problems = arithmeticClaimProblems({ quiz: [{ id: "q1", question: "Mennyi 12 · 2?", feedbackPerOption: ["Helyes: 12 · 2 = 24.", "Nem: 12 · 2 = 48 téves."] }], tasks: [{ id: "t1", sample: "148 + 6 · 8 = 196" }] });
  assert.equal(problems.length, 1); assert.match(problems[0], /q1: .*12 · 2 = 48/);
});
