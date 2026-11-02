import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { openTaskSchema, type OpenTask } from "../shared/lesson-experience";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import { CALIBRATION_VERSION, calibrationOptionsFor } from "../server/studio/experience-builder";

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

test("review #359: elütés (más szó) nem vált ki pontos-alak szigorítást; eltérő tövű helyes alternatívák is a csoportba kerülnek", () => {
  const typo = task({ required: [["virág"]], sample: "A virág.", q: "Mi ez?" });
  const typoCases: AnswerKeyCases = { correct: ["A virág.", "Ez virág."], wrong: [{ kind: "forditott", text: "A világ." }] };
  assert.ok(!calibrateRubric(typo, typoCases, { exactForms: true }).changes.some((c) => c.includes("pontos alak")));
  const multi = task({ required: [["anyával", "késsel", "apával"]] });
  const multiCases: AnswerKeyCases = { correct: ["anyával", "késsel", "apával"], wrong: [{ kind: "forditott", text: "anyának" }] };
  const { task: out, changes } = calibrateRubric(multi, multiCases, { exactForms: true });
  assert.ok(changes.some((c) => c.includes("pontos alak")), JSON.stringify(changes));
  for (const a of ["anyával", "késsel", "apával"]) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
  assert.notEqual(evaluateOpenAnswer("anyának", out).state, "ok");
});

test("review #359: a kalibráció verziója a bank-csomag hash-ében (a régi mentett csomag nem kerül át kalibrálatlanul)", () => {
  assert.equal(CALIBRATION_VERSION, "exact-forms-1");
});

test("ciklus7: a builder-beállítás: magyar leckén pontos alak, idegen nyelvin kifejezés-szigorítás", () => {
  assert.deepEqual(calibrationOptionsFor("t1", new Set(), false), { phrases: false, exactForms: true, lektorReviewed: false });
  assert.deepEqual(calibrationOptionsFor("t1", new Set(), true), { phrases: true, exactForms: false, lektorReviewed: false });
});
