import test from "node:test";
import assert from "node:assert/strict";
import { singleChoiceProblems } from "../shared/single-choice-check";

/* Tételgyár T5 (docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol-vegrehajtas.md): a számolós kvízkulcs programból. */

const item = (prompt: string, options: string[], correctIndex: number) => ({ prompt, options, correctIndex });

test("E1: a T6.0 valós hibás tételei — beágyazott, előjeles zárójeles kifejezés, rossz kulcs → lelet", () => {
  const a = singleChoiceProblems(item("Melyik eredmény tartozik a -8-(-6) kifejezéshez?", ["-14", "-2", "6"], 0));
  assert.equal(a.length, 1);
  assert.match(a[0], /a kulcs „-14”, de csak „-2” egyenlő a kiszámolt eredménnyel \(-8-\(-6\) = -2\)/);
  const b = singleChoiceProblems(item("Mi a -5-(+8) kifejezéshez megadott eredmény?", ["+3", "-13", "+8"], 0));
  assert.match(b.join(), /a kulcs „\+3”, de csak „-13”/);
  const c = singleChoiceProblems(item("Melyik eredmény van a 9-(-6) kifejezéshez rendelve?", ["+3", "-6", "+6"], 0));
  assert.match(c.join(), /0 opció egyenlő a kiszámolt eredménnyel \(9-\(-6\) = 15\)/);
});

test("E1: ugyanezek helyes kulccsal → nincs lelet", () => {
  assert.deepEqual(singleChoiceProblems(item("Melyik eredmény tartozik a -8-(-6) kifejezéshez?", ["-14", "-2", "6"], 1)), []);
  assert.deepEqual(singleChoiceProblems(item("Mi a -5-(+8) kifejezéshez megadott eredmény?", ["+3", "-13", "+8"], 1)), []);
  assert.deepEqual(singleChoiceProblems(item("Mennyi lesz a 12 · 3 + 4 eredménye?", ["40", "48", "36"], 0)), []);
});

test("E2: fordított forma — a válaszok kifejezések, a kérdésben az eredmény", () => {
  const bad = singleChoiceProblems(item("Melyik kifejezés megadott eredménye +6?", ["-2-8", "-2-(-8)", "-2-(+8)"], 2));
  assert.match(bad.join(), /a kulcs „-2-\(\+8\)”, de csak „-2-\(-8\)” értéke 6/);
  assert.deepEqual(singleChoiceProblems(item("Melyik kifejezés megadott eredménye +6?", ["-2-8", "-2-(-8)", "-2-(+8)"], 1)), []);
  const two = singleChoiceProblems(item("Melyik kifejezés értéke 10?", ["5 + 5", "2 · 5", "12 - 3"], 0));
  assert.match(two.join(), /2 opció értéke 10/);
});

test("E3: hallgat, ha nem biztosan kiszámolható", () => {
  for (const [prompt, options] of [
    ["Melyik eredmény NEM tartozik a -8-(-6) kifejezéshez?", ["-14", "-2", "6"]],
    ["Ha a -8-(-6) eredményéhez 3-at adunk, mennyi lesz?", ["1", "-2", "6"]],
    ["Melyik eredmény nagyobb: 3 + 4 vagy 2 · 5?", ["7", "10", "egyenlők"]],
    ["Mennyi a 3 + 4 és a 2 · 5 összegének eredménye?", ["17", "7", "10"]],
    ["Melyik eredmény tartozik a -8-(-6) kifejezéshez?", ["mínusz kettő", "-14", "6"]],
    ["Melyik mondat kapcsolja össze helyesen a zárójelet és az eredményt?", ["A (-6) esetén +2.", "A (+6) esetén -14.", "Egyik sem."]],
    ["Hány éves volt 1848-ban, aki 1823-ban született?", ["25", "24", "26"]],
    ["Melyik eredmény tartozik a 4-gyel osztható számokhoz?", ["12", "13", "14"]],
  ] as Array<[string, string[]]>) {
    assert.deepEqual(singleChoiceProblems(item(prompt, options, 0)), [], prompt);
  }
});

test("a tiszta forma (régi őr) változatlan, és nincs dupla lelet", () => {
  const pure = singleChoiceProblems(item("Mennyi 12 · 3?", ["36", "38", "32"], 1));
  assert.equal(pure.length, 1);
  assert.match(pure[0], /a kulcs „38”, de csak „36”/);
  assert.deepEqual(singleChoiceProblems(item("7 + 8 = ?", ["15", "16", "14"], 0)), []);
});

test("T5.2 mérés téves riasztásai: csoportosító zárójel és részeredmény → hallgat (köztük a 2 publikált tétel)", () => {
  for (const [prompt, options, key] of [
    ["Számold ki a tanult sorrend szerint: 9 + [(12 – 8) · 3]. Mennyi az eredmény?", ["21", "39", "33"], 0],
    ["Számold ki a tanult sorrend szerint: 36 ÷ (3 · 2) – 3. Mennyi az eredmény?", ["3", "15", "9"], 0],
    ["Mennyi a (148 + 6) · 8 feladat eredménye?", ["1232", "196", "1192"], 0],
    ["A 656 – 140 : 4 műveletsorban mennyi az osztás részeredménye?", ["164", "35", "621"], 1],
    ["Mi a közbülső eredmény a 9 + 3 · 2 feladatban a szorzás elvégzése után?", ["12", "6", "15"], 1],
    ["A 24 · 3 ÷ 2 ÷ 4 műveletsorban mi az első eredmény, amikor balról jobbra haladsz?", ["12", "72", "36"], 1],
  ] as Array<[string, string[], number]>) {
    assert.deepEqual(singleChoiceProblems(item(prompt, options, key)), [], prompt);
  }
});

test("T5.2 mérés valódi lelete: zárójel nélküli műveletsor rossz kulccsal", () => {
  const r = singleChoiceProblems(item("A teljes példa mintájára számold ki: mennyi a 60 – 42 : 7 · 5 + 4 kifejezés értéke?", ["86", "58", "90"], 0));
  assert.match(r.join(), /0 opció egyenlő a kiszámolt eredménnyel \(60 – 42 : 7 · 5 \+ 4 = 34\)/);
});
