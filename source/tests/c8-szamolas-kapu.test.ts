import test from "node:test";
import assert from "node:assert/strict";
import { falseArithmeticClaims } from "../server/studio/tools/arithmetic-claims";
import { singleChoiceProblems } from "../shared/single-choice-check";

/* Spec 2026-10-21-c8-szamolas-kapu — a ciklus 8 naplójában mért hamis jelzések. */

test("(A) a számhoz tapadó lépés-címke nem osztás: a mért három eset nem hamis", () => {
  for (const line of ["0: 4 + 0 = 4", "1: 5 + 6 + 1 = 12", "40 · 6: 4 · 6 = 24, majd ezt tízzel szorzom."]) {
    assert.deepEqual(falseArithmeticClaims(line), [], line);
  }
});

test("(A) a címkés, de hamis állítás jelzése megmarad; a hanyag tapadó osztás igaz olvasata sem jelez", () => {
  assert.equal(falseArithmeticClaims("2: 4 + 1 = 6").length, 1, "mindkét olvasat hamis");
  assert.deepEqual(falseArithmeticClaims("12: 4 = 3"), []);
  assert.equal(falseArithmeticClaims("95 : 4 = 20").length, 1, "a szóközös osztás változatlan");
});

const item = (prompt: string, options: string[], correctIndex: number) => ({ prompt, options, correctIndex });

test("(B) maradékos osztás egész opciókkal: az egész hányados a helyes (mért: 95 : 4)", () => {
  assert.deepEqual(singleChoiceProblems(item("Mennyi a 95 : 4 hányadosa?", ["22", "23", "24"], 1)), []);
  const wrongKey = singleChoiceProblems(item("Mennyi a 95 : 4 hányadosa?", ["22", "23", "24"], 2));
  assert.equal(wrongKey.length, 1);
  assert.match(wrongKey[0], /egész hányadosával \(95 : 4 = 23 maradék 3\)/);
  assert.equal(singleChoiceProblems(item("Mennyi a 95 : 4 hányadosa?", ["21", "22", "24"], 0)).length, 1, "nincs jó opció → jelzés");
});

test("(B) maradék-kérdés egész opciókkal: a maradék a helyes", () => {
  assert.deepEqual(singleChoiceProblems(item("Mennyi a 95 : 4 maradéka?", ["1", "3", "2"], 1)), []);
  assert.equal(singleChoiceProblems(item("Mennyi a 95 : 4 maradéka?", ["1", "3", "2"], 0)).length, 1);
});

test("(B) változatlan: tizedes opciók a pontos értéket, maradék nélküli osztás a pontos hányadost kéri", () => {
  assert.deepEqual(singleChoiceProblems(item("Mennyi a 95 : 4 eredménye?", ["23,75", "23", "24"], 0)), []);
  assert.equal(singleChoiceProblems(item("Mennyi a 95 : 4 eredménye?", ["23,75", "23", "24"], 1)).length, 1);
  assert.deepEqual(singleChoiceProblems(item("Mennyi a 96 : 4 eredménye?", ["23", "24", "25"], 1)), []);
});
