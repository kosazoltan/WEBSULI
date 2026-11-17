import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  evaluateOpenAnswer, evaluateOpenAnswerV1, isTypedTask, NEEDS_SENTENCE_REASON, OPEN_ANSWER_RULES_HU, shortAndIncompleteReason, shortButCompleteReason,
} from "../shared/lesson-experience-score";
import { buildResultEmail, gradeTasks } from "../shared/lesson-result-email";
import { LESSON_HTML_SPEC_V74 } from "../server/ai/lesson-html-spec";
import type { OpenTask } from "../shared/lesson-experience";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Spec 2026-11-17-nyilt-feladat-rovid-valasz: a `minWords`-nél rövidebb, de tartalmilag teljes válasz FÉL pont (a 2026-09-11-i szerződés:
 * a puszta kulcsszólista részpont, nem nulla); rövid válasz soha nem teljes pont; az üzenet megmondja a teendőt, és nem írásjelre utal.
 */
const base = (over: Partial<OpenTask>): OpenTask => ({
  ...standardFusionFixture().experience!.tasks[0],
  q: "Mi az erdő? Írd le, hogyan jöhet létre, és melyek a meghatározó növényei!",
  required: [["élőhely"], ["természetes"], ["telepített"], ["fák", "fa"]], bonus: [], minWords: 8, needsSentence: false,
  sample: "Az erdő élőhely, amely lehet természetes vagy ember által telepített. Meghatározó növényei a fák.",
  ...over,
});
function eeEvaluate(): typeof evaluateOpenAnswer {
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const end = LESSON_HTML_SPEC_V74.indexOf("```", begin);
  const context: Record<string, unknown> = {};
  runInNewContext(LESSON_HTML_SPEC_V74.slice(begin, end), context, { timeout: 1000 });
  return context.ee_evaluate as typeof evaluateOpenAnswer;
}

test("v1: rövid, de minden kötelező fogalom megvan → fél pont a biztató üzenettel; ponttal és pont nélkül azonos", () => {
  const task = base({});
  assert.equal(isTypedTask(task), false);
  for (const answer of ["élőhely, természetes, telepített, fák", "élőhely, természetes, telepített, fák.", "Élőhely természetes telepített fák!", "fák telepített természetes élőhely"]) {
    const verdict = evaluateOpenAnswer(answer, task);
    assert.deepEqual({ state: verdict.state, score: verdict.score }, { state: "partial", score: 0.5 }, answer);
    assert.equal(verdict.reason, "A lényeg megvan. Teljes pontért fejtsd ki egész mondatban, legalább 8 szóval.");
    assert.equal(verdict.reason, shortButCompleteReason(8));
  }
  assert.equal(evaluateOpenAnswer(task.sample, task).score, 1, "a kifejtett válasz teljes pont");
});

test("v1: rövid ÉS hiányos, üres, csak írásjel, töltelék → 0 pont a pontos üzenettel (a megoldást nem árulja el)", () => {
  const task = base({});
  for (const answer of ["élőhely, természetes, telepített", "fák", "élőhely fák", "", "   ", ".", "?!", "nem tudom", "hát izé szóval"]) {
    const verdict = evaluateOpenAnswer(answer, task);
    assert.deepEqual({ state: verdict.state, score: verdict.score }, { state: "fail", score: 0 }, JSON.stringify(answer));
    assert.equal(verdict.reason, "Még nincs benne minden fontos fogalom, és rövid is: írj legalább 8 szót.");
    assert.equal(verdict.reason, shortAndIncompleteReason(8));
    assert.doesNotMatch(verdict.reason, /élőhely|természetes|telepített|fák/);
  }
  // Tartalmi feltétel nélküli feladat rövid válasza nem bizonyít semmit.
  assert.equal(evaluateOpenAnswerV1("alma körte", base({ required: [], minWords: 5 })).score, 0);
});

test("a rövid válasz soha nem kap teljes pontot — a fixture minden feladatán, a minWords emelésével", () => {
  for (const original of standardFusionFixture().experience!.tasks) {
    const concise = original.required.map(group => group[0]).join(", ");
    for (const minWords of [20, 50, 100]) {
      const verdict = evaluateOpenAnswer(concise, { ...original, minWords });
      assert.ok(verdict.score <= 0.5, `${original.id}: ${verdict.score}`);
      const sample = evaluateOpenAnswer(original.sample, { ...original, minWords: 100 });
      assert.ok(sample.score <= 0.5, `${original.id}: a mintaválasz is rövid a 100 szavas minimumhoz`);
    }
  }
});

test("a hosszú válasz ágai változatlanok: fele-szabály, hiányzó fogalom, teljes pont", () => {
  const task = base({ minWords: 3 });
  assert.equal(evaluateOpenAnswer("Az erdő élőhely és vannak benne fák", task).score, 0.5);
  assert.match(evaluateOpenAnswer("Az erdő élőhely és vannak benne fák", task).reason, /^Részben jó\. Még 2 kötelező fogalom hiányzik\.$/);
  assert.equal(evaluateOpenAnswer("Az erdő nagyon szép hely", task).score, 0);
  assert.equal(evaluateOpenAnswer("Az erdő nagyon szép hely", task).reason, "A lényegi fogalmak még hiányoznak.");
  assert.equal(evaluateOpenAnswer("élőhely természetes telepített fák", task).score, 1, "elég hosszú, minden megvan, mondat nem kell");
});

test("needsSentence: a pont változatlan (fél), az üzenet a teendőt mondja, és kimondja, hogy az írásjel nem számít", () => {
  const task = base({ minWords: 3, needsSentence: true });
  for (const answer of ["élőhely természetes telepített fák", "Élőhely természetes telepített fák.", "élőhely, természetes, telepített, fák!"]) {
    const verdict = evaluateOpenAnswer(answer, task);
    assert.deepEqual({ state: verdict.state, score: verdict.score }, { state: "partial", score: 0.5 }, answer);
    assert.equal(verdict.reason, "A fogalmak megvannak. Teljes pontért kösd össze őket kötőszóval (mert, hogy, és, ezért…) — az írásjel nem számít.");
    assert.equal(verdict.reason, NEEDS_SENTENCE_REASON);
  }
  assert.equal(evaluateOpenAnswer("élőhely, mert természetes vagy telepített fák", task).score, 1);
  // Rövid ÉS mondatot kérő feladat: a rövid ág üzenete jön (a teendő ugyanaz: kifejteni).
  assert.equal(evaluateOpenAnswer("élőhely természetes telepített fák", base({ needsSentence: true })).reason, shortButCompleteReason(8));
});

test("v2 (számolós): helyes végeredmény röviden → fél pont; hibás érték, rossz mértékegység → 0", () => {
  const task = base({ q: "Mennyi 12 · 3?", required: [["szorzat", "eredmény"]], minWords: 4, sample: "A szorzat eredménye 36 cm.", typedAnswers: [{ part: "a", kind: "number", value: "36", unit: "cm" }] });
  assert.equal(isTypedTask(task), true);
  for (const answer of ["36 cm", "36 cm.", "36cm!"]) {
    const verdict = evaluateOpenAnswer(answer, task);
    assert.deepEqual({ state: verdict.state, score: verdict.score, reason: verdict.reason }, { state: "partial", score: 0.5, reason: shortButCompleteReason(4) }, answer);
  }
  // Review K1: a rövid, HIBÁS számolós válasznál a tényleges ok jelenik meg (a hosszú ág üzenetével azonos), nem a „fogalom hiányzik”.
  for (const answer of ["35 cm", "36", "36 m", "cm", ""]) {
    const verdict = evaluateOpenAnswer(answer, task);
    assert.deepEqual({ state: verdict.state, score: verdict.score, reason: verdict.reason },
      { state: "fail", score: 0, reason: "A(z) a rész eredménye a(z) cm mértékegységgel hiányzik vagy hibás." }, JSON.stringify(answer));
    assert.equal(verdict.reason, evaluateOpenAnswer(`Szerintem ez lett a végső válaszom: ${answer}`, task).reason, "azonos a hosszú ág üzenetével");
    assert.doesNotMatch(verdict.reason, /fogalom/);
  }
  const noUnit = base({ required: [["eredmény"]], minWords: 4, sample: "Az eredmény tehát: 8 : 2 = 4.", typedAnswers: [{ part: "a", kind: "number", value: "4" }] });
  assert.deepEqual([evaluateOpenAnswer("8 : 2 = 5", noUnit).score, evaluateOpenAnswer("8 : 2 = 5", noUnit).reason], [0, "A(z) a rész eredménye hiányzik vagy hibás."]);
  const fraction = base({ required: [["eredmény"]], minWords: 4, sample: "Az eredmény egyszerűsítve 1/2.", typedAnswers: [{ part: "a", kind: "fraction", value: "1/2", form: "simplified-fraction" }] });
  assert.deepEqual([evaluateOpenAnswer("2/4", fraction).score, evaluateOpenAnswer("2/4", fraction).reason], [0, "A(z) a rész eredményét egyszerűsített törtként várjuk."]);
  assert.equal(evaluateOpenAnswer("1/2", fraction).score, 0.5);
  assert.equal(evaluateOpenAnswer("A szorzat eredménye 36 cm.", task).score, 1);
  const two = base({ required: [["eredmény"]], minWords: 6, sample: "Az eredmény 5, a másik eredmény 3.", typedAnswers: [{ part: "a", kind: "number", value: "5" }, { part: "b", kind: "number", value: "3" }] });
  assert.equal(evaluateOpenAnswer("5, 3", two).score, 0.5);
  assert.equal(evaluateOpenAnswer("5", two).score, 0, "az egyik részeredmény hiányzik");
  assert.equal(evaluateOpenAnswer("3, 5", two).score, 0, "felcserélt részeredmény");
});

test("v2 (szöveges): a hiányzó nyelvtani kifejezés, sorrend vagy kvóta rövid válasznál nem tartalmilag teljes → 0", () => {
  const phrase = base({ q: "Mondd angolul: Van egy íróasztal a szobában.", required: [["desk"], ["room"]], minWords: 6, sample: "There's a desk in the room.", requiredPhrases: [["there's a desk", "there is a desk"]] });
  assert.deepEqual([evaluateOpenAnswer("desk, room", phrase).score, evaluateOpenAnswer("desk, room", phrase).reason], [0, shortAndIncompleteReason(6)]);
  assert.equal(evaluateOpenAnswer("there's a desk, room", phrase).score, 0.5, "rövid, de a fogalmak és a kifejezés is megvan");
  assert.equal(evaluateOpenAnswer("There's a desk in the room.", phrase).score, 1);
  const order = base({ required: [["szorzunk"], ["négyzetre"]], minWords: 6, sample: "Először szorzunk, és csak utána emelünk négyzetre.", requiredOrder: [["szorzunk"], ["négyzetre"]] });
  assert.equal(evaluateOpenAnswer("négyzetre, szorzunk", order).score, 0, "fordított sorrend röviden");
  assert.equal(evaluateOpenAnswer("szorzunk, négyzetre", order).score, 0.5);
  const quota = base({ required: [["gyümölcs"]], minWords: 6, sample: "Gyümölcs például az alma és a körte.", requiredDistinct: [{ category: "gyümölcs", from: [["alma"], ["körte"], ["szilva"]], count: 2 }] });
  assert.equal(evaluateOpenAnswer("gyümölcs: alma", quota).score, 0, "a kvóta nem teljesül");
  assert.equal(evaluateOpenAnswer("gyümölcs: alma, körte", quota).score, 0.5);
});

test("paritás: a HTML-referencia (ee_evaluate) ugyanazt a pontot és üzenetet adja a rövid válaszra és a mondat-ágra", () => {
  const score = eeEvaluate();
  const task = base({});
  const sentence = base({ minWords: 3, needsSentence: true });
  const cases: Array<[string, OpenTask]> = [
    ["élőhely, természetes, telepített, fák", task], ["élőhely, természetes, telepített, fák.", task], ["élőhely, természetes", task], ["fák", task], ["", task], ["nem tudom", task],
    [task.sample, task], ["élőhely természetes telepített fák", sentence], ["élőhely, mert természetes vagy telepített fák", sentence],
  ];
  for (const [answer, t] of cases) {
    const expected = evaluateOpenAnswerV1(answer, t), actual = score(answer, t);
    assert.deepEqual({ state: actual.state, score: actual.score }, { state: expected.state, score: expected.score }, JSON.stringify(answer));
    if (expected.reason === shortButCompleteReason(t.minWords) || expected.reason === shortAndIncompleteReason(t.minWords) || expected.reason === NEEDS_SENTENCE_REASON) {
      assert.equal(actual.reason, expected.reason, JSON.stringify(answer));
    }
  }
  assert.equal(score("alma", base({ required: [], minWords: 5 })).score, 0);
});

test("a levél ugyanazt a pontot mutatja: a tömör válasz 🟡 fél pont, a kifejtett ✅", () => {
  const short = base({ id: "rovid" }), full = base({ id: "teljes" }), missing = base({ id: "hianyos" });
  const graded = gradeTasks([short, full, missing], { rovid: "élőhely, természetes, telepített, fák.", teljes: full.sample, hianyos: "fák" });
  assert.deepEqual(graded.rows.map(r => [r.taskId, r.state, r.score]), [["rovid", "partial", 0.5], ["teljes", "ok", 1], ["hianyos", "fail", 0]]);
  assert.equal(graded.summary.points, 1.5);
  assert.equal(graded.summary.percent, 50);
  const html = buildResultEmail({ lessonTitle: "Erdő", classroom: 4, learner: "Vendég tanuló", url: "", graded }).html;
  assert.match(html, /🟡 élőhely, természetes, telepített, fák\./);
  assert.match(html, /1\.5 \/ 3 pont — 50%/);
});

test("őr: a bank promptjának pontozó-szabályai (OPEN_ANSWER_RULES_HU) bájtra változatlanok — nincs promptverzió-emelés", () => {
  assert.equal(createHash("sha256").update(OPEN_ANSWER_RULES_HU).digest("hex"), "635719af48c1962d29ce9af1db8db9671744437121f52d8b89fc094a66d8920b");
});
