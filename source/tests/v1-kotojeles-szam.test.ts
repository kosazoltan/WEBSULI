import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { LESSON_HTML_SPEC_V74 } from "../server/ai/lesson-html-spec";
import { evaluateOpenAnswer, normalizeAnswer } from "../shared/lesson-experience-score";
import type { OpenTask } from "../shared/lesson-experience";

/* Spec 2026-10-20-v1-kotojeles-szam: a kötőjeles szám (telefonszám, tartomány) nem negatív szám. Mért: job 102bedaa, s1-t-9. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mi a KAPCSOLAT angol párja, és mi az iskola telefonszáma?",
  required: [["Contact"], ["72"], ["552"], ["270", "kétszázhetven"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "A KAPCSOLAT angol párja a Contact, a telefonszám 72/552-270.", mode: "written", ...over,
}) as OpenTask;

test("a kötőjeles szám két szám: a mért telefonszám-minta teljes pont", () => {
  assert.equal(normalizeAnswer("72/552-270"), "72 552 270");
  assert.equal(normalizeAnswer("2-3"), "2 3");
  assert.equal(normalizeAnswer("1848-49"), "1848 49");
  const t = task();
  assert.equal(evaluateOpenAnswer(t.sample, t).state, "ok");
  assert.equal(evaluateOpenAnswer("Contact, telefonszám: 72-552-270", t).state, "ok");
});

test("az önálló negatív szám negatív marad; a + előjel levágódik", () => {
  assert.equal(normalizeAnswer("-4,5"), "-4.5");
  assert.equal(normalizeAnswer("−4,5 fok"), "-4.5 fok");
  assert.equal(normalizeAnswer("a hőmérséklet -5 fok"), "a homerseklet -5 fok");
  assert.equal(normalizeAnswer("(-3)"), "-3");
  assert.equal(normalizeAnswer("+4,5"), "4.5");
  const t = task({ required: [["4.5"]], minWords: 1, sample: "4,5" });
  for (const a of ["-4.5", "−4,5"]) assert.equal(evaluateOpenAnswer(a, t).score, 0, a);
});

test("a HTML-szerző referencia-pontozója ugyanígy kezeli a kötőjeles számot (paritás)", () => {
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const end = LESSON_HTML_SPEC_V74.indexOf("```", begin);
  const context: Record<string, unknown> = {};
  runInNewContext(LESSON_HTML_SPEC_V74.slice(begin, end), context, { timeout: 1000 });
  const htmlNorm = context.ee_norm as (s: string) => string;
  const score = context.ee_evaluate as typeof evaluateOpenAnswer;
  for (const s of ["72/552-270", "2-3", "-4,5", "−4,5 fok", "x-3", "(-3)"]) assert.equal(htmlNorm(s), normalizeAnswer(s), s);
  const t = task();
  for (const a of [t.sample, "Contact, telefonszám: 72-552-270", "Contact 72 552 -270"]) {
    assert.equal(score(a, t).state, evaluateOpenAnswer(a, t).state, a);
  }
});

test("review #348: egyik pontozó sem használ lookbehindot (a régebbi Safari a regexet be sem tölti — az egész szkript leállna)", () => {
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const htmlScorer = LESSON_HTML_SPEC_V74.slice(begin, LESSON_HTML_SPEC_V74.indexOf("```", begin));
  for (const source of [htmlScorer, normalizeAnswer.toString()]) {
    assert.ok(!/\(\?<[=!]/.test(source), source.slice(0, 120));
  }
  assert.equal(normalizeAnswer("1-2-3 és x-4, +5"), "1 2 3 es x 4 5");
});
