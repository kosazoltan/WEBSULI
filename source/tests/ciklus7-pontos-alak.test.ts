import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { openTaskSchema, type OpenTask } from "../shared/lesson-experience";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import { calibrationOptionsFor } from "../server/studio/experience-builder";

/* Spec 2026-10-21-ciklus7: magyar leckén a csak toldalékban eltérő hibás próba (ragcsere) ne kapjon teljes pontot. */

// Mért (A főnév, 4. osztály): a -val/-vel ragos példára az „anyának” is teljes pontot kapott (a pontozó toldaléktűrő).
const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Írj egy -val/-vel ragos főnevet a Kivel? kérdésre!",
  required: [["anyával"]], bonus: [], minWords: 1, needsSentence: false, sample: "anyával", mode: "written", ...over,
}) as OpenTask;
const cases: AnswerKeyCases = {
  correct: ["anyával", "Anyával."],
  wrong: [{ kind: "forditott", text: "anyának" }],
};

test("ciklus7: a ragcserés hibás válasz alapból teljes pontot kap (előfeltétel), a pontos-alak szigorítás után nem", () => {
  assert.equal(evaluateOpenAnswer("anyának", task()).state, "ok", "előfeltétel: a toldaléktűrő pontozó elfogadja");
  const { task: out, changes } = calibrateRubric(task(), cases, { exactForms: true });
  assert.ok(changes.some((c) => c.startsWith("szigorítás (pontos alak):")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer("anyának", out).state, "ok");
  assert.equal(evaluateOpenAnswer("anyával", out).state, "ok");
  assert.equal(evaluateOpenAnswer(out.sample, out).state, "ok");
  assert.deepEqual(out.tightenedPhrases, [["anyával"]], "gépi szigorításként jelölve (S4 lazíthat)");
  assert.ok(openTaskSchema.safeParse(out).success);
});

test("ciklus7: kikapcsolva (idegen nyelvi lecke), és a lektor által kifogásolt feladatra nem fut", () => {
  assert.ok(!calibrateRubric(task(), cases).changes.some((c) => c.includes("pontos alak")));
  assert.ok(!calibrateRubric(task(), cases, { exactForms: true, lektorReviewed: true }).changes.some((c) => c.includes("pontos alak")));
});

test("ciklus7: a builder-beállítás: magyar leckén pontos alak, idegen nyelvin kifejezés-szigorítás", () => {
  assert.deepEqual(calibrationOptionsFor("t1", new Set(), false), { phrases: false, exactForms: true, lektorReviewed: false });
  assert.deepEqual(calibrationOptionsFor("t1", new Set(), true), { phrases: true, exactForms: false, lektorReviewed: false });
});
