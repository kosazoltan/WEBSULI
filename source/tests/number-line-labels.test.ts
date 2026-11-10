import { test } from "node:test";
import assert from "node:assert/strict";
import { isNumberLineLabel, numberLineLabelStep } from "../shared/number-line-labels";

/** Spec 2026-11-10-gyartas-meres (J3): a számegyenes feliratai a szép lépés többszörösei, 0-ra horgonyozva. */

function labels(from: number, to: number, step: number): number[] {
  const n = Math.floor((to - from) / step + 1e-9) + 1;
  const ticks = Array.from({ length: n }, (_, i) => from + i * step);
  const ls = numberLineLabelStep(from, to, step);
  return ticks.filter((v) => isNumberLineLabel(v, ls)).map((v) => Math.round(v * 1e6) / 1e6);
}

function checkGeneral(from: number, to: number, step: number) {
  const ls = numberLineLabelStep(from, to, step);
  const out = labels(from, to, step);
  assert.ok(out.length <= 8, `legfeljebb 8 felirat (${from}..${to}, ${step}): ${out.length}`);
  if (from <= 0 && to >= 0) assert.ok(out.includes(0), `a 0 felirata megvan (${from}..${to})`);
  for (const v of out) assert.ok(isNumberLineLabel(v, ls), `${v} a lépés többszöröse`);
  if ((to - from) / step >= 2) assert.ok(out.length >= 2, `legalább 2 felirat (${from}..${to}, ${step})`);
}

test("−10..10, lépés 1: −10, −5, 0, 5, 10", () => {
  assert.deepEqual(labels(-10, 10, 1), [-10, -5, 0, 5, 10]);
});

test("−14..2, lépés 1: a 0 benne van, minden felirat a lépés többszöröse", () => {
  checkGeneral(-14, 2, 1);
  assert.deepEqual(labels(-14, 2, 1), [-10, -5, 0]);
});

test("−6..6, lépés 2: minden második érték", () => {
  assert.deepEqual(labels(-6, 6, 2), [-6, -4, -2, 0, 2, 4, 6]);
});

test("tört lépések: 0..1 / 0,1 és 0..3 / 0,5, lebegőpontos hiba nélkül", () => {
  assert.deepEqual(labels(0, 1, 0.1), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(labels(0, 3, 0.5), [0, 0.5, 1, 1.5, 2, 2.5, 3]);
  checkGeneral(0, 1, 0.1);
  checkGeneral(0, 3, 0.5);
  checkGeneral(0, 2, 0.25);
  assert.ok(isNumberLineLabel(0.3, 0.1));
  assert.ok(!isNumberLineLabel(0.25, 0.1));
});

test("csak pozitív tartomány: 3..9, lépés 1 → minden felirat", () => {
  assert.deepEqual(labels(3, 9, 1), [3, 4, 5, 6, 7, 8, 9]);
});

test("nagy tartomány: 0..100 / 10 és 0..1000 / 100", () => {
  assert.deepEqual(labels(0, 100, 10), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(labels(0, 1000, 100), [0, 200, 400, 600, 800, 1000]);
});

test("általános tulajdonságok sok tartományon", () => {
  const cases: Array<[number, number, number]> = [
    [-10, 10, 1], [-20, 20, 1], [-3, 12, 1], [-100, 100, 10], [-1, 1, 0.1], [-0.5, 0.5, 0.05],
    [0, 24, 1], [1900, 2000, 10], [0, 7, 1], [-9, 3, 3], [0, 100, 7],
  ];
  for (const [f, t, s] of cases) checkGeneral(f, t, s);
});

test("a felirat lépése legalább a szerzői lépés, és annak egész számú többszöröse", () => {
  const ls = numberLineLabelStep(-10, 10, 1);
  assert.ok(ls >= 1 && Math.abs(ls - Math.round(ls)) < 1e-9);
  const l2 = numberLineLabelStep(0, 1, 0.1);
  assert.ok(Math.abs(l2 / 0.1 - Math.round(l2 / 0.1)) < 1e-6);
});

test("J3 — numberLineLabelFlags: a 0-hoz nem igazodó osztásoknál is marad felirat (sorszám szerinti ritkítás)", async () => {
  const { numberLineLabelFlags } = await import("../shared/number-line-labels");
  const ticksOf = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step + 1e-9) + 1 }, (_, i) => from + i * step);
  const labels = (from: number, to: number, step: number) => { const t = ticksOf(from, to, step); const f = numberLineLabelFlags(t, step); return t.filter((_, i) => f[i]); };
  assert.deepEqual(labels(-10, 10, 1), [-10, -5, 0, 5, 10]);
  assert.deepEqual(labels(-14, 2, 1), [-10, -5, 0]);
  assert.deepEqual(labels(1, 9, 2), [1, 3, 5, 7, 9], "páratlan rács: nincs elveszett felirat");
  assert.ok(labels(1, 41, 2).length >= 2, "hosszú páratlan rácson is van felirat");
  assert.ok(labels(1, 41, 2).length <= 8);
  assert.deepEqual(numberLineLabelFlags([], 1), []);
  assert.deepEqual(labels(5, 5, 1), [5]);
});
