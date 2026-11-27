import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { selectPracticeQuestions } from "../shared/lesson-attempt";
import { sampleTaskIds } from "../shared/lesson-experience-score";
import { isApplyQuiz, sampleQuizIds } from "../shared/practice-sampling";
import type { OpenTask } from "../shared/lesson-experience";

/** TG-P6 (docs/specs/2026-11-27-tananyag-gyakorlati-p6-vegrehajtas.md): kiegyensúlyozott tanulói kör. */

const concept = (i: number) => ({ id: `f${i}`, prompt: `Mit jelent a ${i}. fogalom?`, question: `Mit jelent a ${i}. fogalom?`, options: ["a", "b", "c", "d"] });
const apply = (i: number) => ({ id: `a${i}`, prompt: `Egészítsd ki a ${i}. mondatot: A kutya ___ ugat.`, question: `Egészítsd ki a ${i}. mondatot: A kutya ___ ugat.`, options: ["a", "b", "c", "d"] });
const conceptFirst = [...Array.from({ length: 20 }, (_, i) => concept(i)), ...Array.from({ length: 30 }, (_, i) => apply(i))];

function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
}

test("TG-P6: a szerveres gyakorlás üres előzménnyel, fogalmi elejű bankon is 15–18 alkalmazót ad a 25-ös körben", () => {
  const picked = selectPracticeQuestions(conceptFirst, 25, {}, 0, isApplyQuiz);
  const applied = picked.filter((q) => q.id.startsWith("a"));
  assert.equal(picked.length, 25);
  assert.ok(applied.length >= 15 && applied.length <= 18, `${applied.length}`);
  // Csoporton belül a mai rangsor (üres előzménynél a banksorrend) marad.
  assert.deepEqual(applied.map((q) => q.id), Array.from({ length: applied.length }, (_, i) => `a${i}`));
  assert.deepEqual(picked.filter((q) => q.id.startsWith("f")).map((q) => q.id), Array.from({ length: 25 - applied.length }, (_, i) => `f${i}`));
});

test("TG-P6: a csoporton belül az ismétlési rangsor dönt (a rosszul megválaszolt alkalmazó tétel előre kerül)", () => {
  // Minden alkalmazó tétel frissen, jól megválaszolt (hátra sorolt), kivéve az a29-et (hibás → előre).
  const history: Record<string, Array<{ at: number; correct: boolean; usedHint: boolean }>> = {};
  for (let i = 0; i < 29; i++) history[`a${i}`] = [{ at: 4 + i, correct: true, usedHint: false }];
  history.a29 = [{ at: 50, correct: false, usedHint: false }];
  const picked = selectPracticeQuestions(conceptFirst, 25, history, 60, isApplyQuiz).filter((q) => q.id.startsWith("a"));
  assert.equal(picked[0].id, "a29", "a hibás tétel a csoport elején");
  assert.deepEqual(picked.slice(1).map((q) => q.id), Array.from({ length: picked.length - 1 }, (_, i) => `a${i}`), "utána a legrégebben látott");
});

test("TG-P6: besoroló nélkül a selectPracticeQuestions régi viselkedése marad", () => {
  assert.deepEqual(selectPracticeQuestions(conceptFirst, 25, {}, 0).map((q) => q.id), conceptFirst.slice(0, 25).map((q) => q.id));
});

test("TG-P6: a helyi kvízkör 25-ből 15–18 alkalmazót sorsol; csak fogalmi banknál is teljes a kör", () => {
  for (let s = 1; s <= 200; s++) {
    const ids = sampleQuizIds(conceptFirst, 25, seeded(s));
    assert.equal(new Set(ids).size, 25);
    const n = ids.filter((id) => id.startsWith("a")).length;
    assert.ok(n >= 15 && n <= 18, `mag ${s}: ${n}`);
  }
  assert.equal(sampleQuizIds(conceptFirst.slice(0, 20), 15, seeded(3)).length, 15);
  assert.equal(sampleQuizIds(conceptFirst.slice(0, 10), 15, seeded(3)).length, 10, "kis bank: annyi, amennyi van");
});

test("TG-P6: a nyílt kör 15-ből 9–11 alkalmazót ad, a szóbeli feladat továbbra is benne van", () => {
  const task = (id: string, q: string, sample: string, mode = "written") => ({ id, q, sample, mode }) as unknown as OpenTask;
  const bank = [
    ...Array.from({ length: 10 }, (_, i) => task(`f${i}`, `Mit jelent a ${i}. fogalom?`, "Egy meghatározás.")),
    ...Array.from({ length: 18 }, (_, i) => task(`a${i}`, `Egészítsd ki a ${i}. mondatot: A kutya ___ ugat.`, "hangosan")),
    task("o1", "Mit jelent a szólás? Mondd el.", "Egy meghatározás.", "oral"),
    task("o2", "Mit jelent a közmondás? Mondd el.", "Egy meghatározás.", "oral"),
  ];
  for (let s = 1; s <= 200; s++) {
    const ids = sampleTaskIds(bank, 15, seeded(s));
    assert.equal(new Set(ids).size, 15);
    const n = ids.filter((id) => id.startsWith("a")).length;
    assert.ok(n >= 9 && n <= 11, `mag ${s}: ${n}`);
    assert.ok(ids.some((id) => id.startsWith("o")), `mag ${s}: szóbeli`);
  }
});

test("TG-P6: a szerver és a helyi körök a kiegyensúlyozott választót használják", () => {
  assert.match(fs.readFileSync("server/rewards/lesson-attempts.ts", "utf8"), /selectPracticeQuestions\(.*isApplyQuiz\)/u);
  assert.match(fs.readFileSync("client/src/lesson-runtime/useExperienceRound.ts", "utf8"), /sampleQuizIds\(/u);
  assert.match(fs.readFileSync("client/src/lesson-runtime/HtmlLessonQuiz.tsx", "utf8"), /sampleQuizIds\(/u);
});
