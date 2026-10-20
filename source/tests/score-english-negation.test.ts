import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { evaluateOpenAnswer, negationKind, normalizeAnswer, OPEN_ANSWER_RULES_HU } from "../shared/lesson-experience-score";
import { LESSON_HTML_SPEC_V74 } from "../server/ai/lesson-html-spec";
import type { OpenTask } from "../shared/lesson-experience";

/* Spec 2026-10-20-pontozo-angol-tagadas — mért: Where I Live e1f59f8d, a lektor 3 körön át blokkolta (kijavíthatatlan rubrika). */

const base = { id: "t", sectionIndex: 0, coversConceptIds: ["c"], q: "q", bonus: [], mode: "written" } as unknown as OpenTask;
const pool = { ...base, required: [["mustn't", "mustn", "mustnt"], ["run"], ["eat", "drink"]], minWords: 4, needsSentence: false, sample: "You mustn't run. You mustn't eat or drink." } as OpenTask;
const ticket = { ...base, required: [["must"], ["ticket"]], minWords: 4, needsSentence: false, sample: "You must buy a ticket." } as OpenTask;

function eeEvaluate(): typeof evaluateOpenAnswer {
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const end = LESSON_HTML_SPEC_V74.indexOf("```", begin);
  const context: Record<string, unknown> = {};
  runInNewContext(LESSON_HTML_SPEC_V74.slice(begin, end), context, { timeout: 1000 });
  return context.ee_evaluate as typeof evaluateOpenAnswer;
}

test("negationKind: not / cannot / n't / aposztróf nélküli alak → en; nem → hu; állító → none", () => {
  const kind = (s: string) => negationKind(normalizeAnswer(s).split(" ").filter(Boolean));
  assert.equal(kind("You mustn't run."), "en");
  assert.equal(kind("You mustnt run"), "en");
  assert.equal(kind("I don't know"), "en");
  assert.equal(kind("You cannot swim"), "en");
  assert.equal(kind("It is not big"), "en");
  assert.equal(kind("Nem szabad futni."), "hu");
  assert.equal(kind("You must run."), "none");
  assert.equal(kind("Tom's book is on the desk."), "none", "a birtokos 's nem tagadás");
});

test("Where I Live: a tagadás nélküli „You must run” a „mustn't” mintára már nem teljes pont (v1 és HTML-paritás)", () => {
  const ee = eeEvaluate();
  for (const score of [evaluateOpenAnswer, ee]) {
    assert.equal(score("You must run. You must eat.", pool).score, 0.5);
    assert.equal(score(pool.sample, pool).score, 1, "a saját minta teljes pont");
    assert.equal(score("You must not run. You must not eat.", pool).score, 1, "a kifejtett tagadás egyenértékű");
    assert.equal(score("You mustn't buy a ticket.", ticket).score, 0.5, "tagadó válasz állító mintára");
    assert.equal(score("You must buy a ticket.", ticket).score, 1);
  }
});

test("típusos (v2) feladatnál ugyanez a kétirányú őr", () => {
  const typed = { ...pool, requiredDistinct: [{ category: "szabály", from: [["run"], ["eat"]], count: 1 }] } as OpenTask;
  assert.equal(evaluateOpenAnswer("You must run. You must eat.", typed).score, 0.5);
  assert.equal(evaluateOpenAnswer(typed.sample, typed).score, 1);
});

test("a magyar fordított irány változatlan: a „nem” nélküli válasz a „nem”-es mintára nem lesz fél pont emiatt", () => {
  const hu = { ...base, required: [["tilos"], ["futni"]], minWords: 2, needsSentence: false, sample: "Nem szabad, tilos futni." } as OpenTask;
  assert.equal(evaluateOpenAnswer("Tilos futni.", hu).score, 1);
});

test("a pontozási szabály szövege (bank, lektor) leírja az angol tagadást", () => {
  assert.match(OPEN_ANSWER_RULES_HU, /angol n't \(don't, mustn't, can't…, cannot\)/);
  assert.match(OPEN_ANSWER_RULES_HU, /ha a minta angolul tagadó \(not \/ n't\), a válasz pedig nem → 0,5/);
});
