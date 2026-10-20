import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { openTaskSchema, type OpenTask } from "../shared/lesson-experience";
import { tightenedOnlyMiss } from "../shared/lesson-result-email";
import { relaxTask } from "../server/task-results";
import { applyBankPacketRepair } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { AnswerKeyCases } from "../shared/answer-key-tests";

/* Spec 2026-10-20-s5-sorrendes-kifejezes (S5b): gépi szigorítás egymás utáni kifejezéssel (csak idegen nyelvi leckén). */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Írd le angolul: van egy kanapé és sok szék a házamban.",
  required: [["sofa"], ["chairs"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "There is a sofa in my house. There are many chairs.", mode: "written", ...over,
}) as OpenTask;
const sofaCases: AnswerKeyCases = {
  // A helyesekben van a hibásban nem szereplő szó (and / too / today) → a hibás próba nem J1 (blokkol), de szóalapon nincs megkülönböztető elem.
  correct: ["In my house there is a sofa, and there are many chairs too.", "There is a sofa and there are many chairs in my house today.", "My house: there is a sofa and there are many chairs, too."],
  wrong: [{ kind: "tevhit", text: "There are a sofa in my house. There is many chairs." }, { kind: "temaidegen", text: "I like apples very much." }],
};

test("S5b: azonos szavak, más alak → szóalapon nincs jelölt, kifejezéssel szigorodik (nyelvi leckén)", () => {
  const t = task();
  assert.equal(evaluateOpenAnswer(sofaCases.wrong[0].text, t).state, "ok", "előfeltétel: a hibás alak teljes pontot kap");
  const { task: out, changes } = calibrateRubric(t, sofaCases, { phrases: true });
  assert.ok(out.requiredPhrases?.length === 1, JSON.stringify(out));
  assert.deepEqual(out.tightenedPhrases, out.requiredPhrases);
  assert.ok(changes.some((c) => c.startsWith("szigorítás (kifejezés):")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer(sofaCases.wrong[0].text, out).state, "ok");
  assert.equal(evaluateOpenAnswer(out.sample, out).state, "ok");
  for (const a of sofaCases.correct) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
  assert.ok(openTaskSchema.safeParse(out).success);
});

test("S5b: nem nyelvi leckén (alapértelmezés) nincs kifejezéses szigorítás — a magyar szórend szabad", () => {
  const out = calibrateRubric(task(), sofaCases);
  assert.deepEqual(out.changes, []);
  assert.equal(out.task.requiredPhrases, undefined);
});

test("S5b: tagadást tartalmazó kifejezés nem lehet a megkülönböztető (review #338 szerződése)", () => {
  const t = task({ q: "What does the sign say?", required: [["run"], ["corridor"]], minWords: 3, sample: "You mustn't run in the corridor." });
  const cases: AnswerKeyCases = {
    correct: ["You mustn't run in the corridor.", "Pupils mustn't run in the corridor.", "You mustn't run in this corridor."],
    wrong: [{ kind: "tevhit", text: "You cannot run in the corridor." }, { kind: "temaidegen", text: "I like apples." }],
  };
  const out = calibrateRubric(t, cases, { phrases: true });
  assert.ok(!out.changes.some((c) => /mustn/.test(c)), JSON.stringify(out.changes));
});

test("S5b: a kifejezéses szigorítás „csak emiatt bukott” jele és lazítása (pont nem csökken)", () => {
  const { task: tight } = calibrateRubric(task(), sofaCases, { phrases: true });
  const phrase = tight.requiredPhrases![0][0];
  // A helyes, más szórendű válasz, amely a kifejezést nem tartalmazza, de a többi fogalom megvan.
  const other = "My house has a sofa and many chairs, there is.";
  const det = evaluateOpenAnswer(other, tight).state;
  assert.notEqual(det, "ok", `${phrase}: a kifejezés hiányzik`);
  assert.equal(tightenedOnlyMiss(tight, other, det), true, `${phrase} / ${det}`);
  const relaxed = relaxTask(tight, { answered: 20, falseRejects: 10 }, new Date())!;
  assert.ok(relaxed, "lazítva");
  assert.equal(relaxed.requiredPhrases!.length, tight.requiredPhrases!.length, "a csoportszám változatlan");
  assert.equal("tightenedPhrases" in relaxed, false);
  assert.deepEqual(relaxed.relaxedTightening?.phraseGroups, tight.requiredPhrases);
  for (const a of [other, sofaCases.wrong[0].text, "sofa", "chairs sofa", "nothing at all here"]) {
    assert.ok(evaluateOpenAnswer(a, relaxed).score >= evaluateOpenAnswer(a, tight).score, a);
  }
  assert.ok(openTaskSchema.safeParse(relaxed).success);
});

test("S5b: a lektori bankjavítás a `tightenedPhrases` jelölést az előző tételből örökli", () => {
  const e = standardFusionFixture().experience!;
  const t0 = { ...e.tasks[0], requiredPhrases: [["a terulet"]], tightenedPhrases: [["a terulet"]] };
  const original = { methods: e.methods, tasks: [t0, ...e.tasks.slice(1)], quiz: e.quiz, glossary: [] };
  const { tightenedPhrases: _omit, ...withoutTag } = t0;
  const kept = applyBankPacketRepair(original, { tasks: [{ ...withoutTag, sample: `${t0.sample} Bővítve.` }] }, new Set([t0.id]));
  assert.deepEqual(kept.tasks[0].tightenedPhrases, t0.tightenedPhrases);
});
