import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer, missingOrder } from "../shared/lesson-experience-score";
import { openTaskSchema, type OpenTask } from "../shared/lesson-experience";
import { tightenedOnlyMiss } from "../shared/lesson-result-email";
import { relaxTask } from "../server/task-results";
import { applyBankPacketRepair } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { AnswerKeyCases } from "../shared/answer-key-tests";

/* Spec 2026-10-20-s6-fogalom-sorrend (S6b): gépi sorrend-szigorítás (minden nyelven), S4-lánc. Mért eset: job be3bd5d2, s1-t1. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mi a műveletek sorrendje a 4·(x+3)² kifejezésben?",
  required: [["négyzetre", "négyzet"], ["szorzunk", "szoroz"]], bonus: [], minWords: 3, needsSentence: false,
  sample: "Először négyzetre emelünk, utána szorzunk 4-gyel.", mode: "written", ...over,
}) as OpenTask;
// A helyesekben van a hibásban nem szereplő szó → a hibás próba nem J1 (blokkol); a minta minden szava a hibásban is megvan → szóval nincs jelölt.
const cases: AnswerKeyCases = {
  correct: ["Először négyzetre emelünk, és csak utána szorzunk 4-gyel.", "A négyzetre emelés jön előbb, aztán szorzunk.", "Előbb a zárójel négyzetre emelése, majd szorzunk néggyel."],
  wrong: [{ kind: "forditott", text: "Először 4-gyel szorzunk, utána emelünk négyzetre." }, { kind: "temaidegen", text: "Szeretem az almát nagyon." }],
};
const reversedCorrect = "Szorzunk 4-gyel, de csak miután négyzetre emeltük.";

test("S6b: azonos fogalmak, fordított sorrend → szóval nincs jelölt, a minta sorrendje lesz a szabály (magyar leckén is)", () => {
  const t = task();
  assert.equal(evaluateOpenAnswer(cases.wrong[0].text, t).state, "ok", "előfeltétel: a fordított válasz teljes pontot kap");
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.deepEqual(out.requiredOrder, [["négyzetre", "négyzet"], ["szorzunk", "szoroz"]], JSON.stringify(out));
  assert.equal(out.tightenedOrder, true);
  assert.ok(changes.some((c) => c.startsWith("szigorítás (sorrend):")), JSON.stringify(changes));
  assert.notEqual(evaluateOpenAnswer(cases.wrong[0].text, out).state, "ok");
  assert.equal(evaluateOpenAnswer(out.sample, out).state, "ok");
  for (const a of cases.correct) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
  assert.ok(openTaskSchema.safeParse(out).success, JSON.stringify(openTaskSchema.safeParse(out).error?.issues));
});

test("S6b: ha nem minden helyes válasz egyirányú, nincs sorrendi szabály", () => {
  const mixed: AnswerKeyCases = { ...cases, correct: [...cases.correct, reversedCorrect] };
  const out = calibrateRubric(task(), mixed);
  assert.equal(out.task.requiredOrder, undefined);
  assert.deepEqual(out.changes, []);
});

test("S6b: a szóalapú szigorítás előnyt élvez — ha egy szó megkülönböztet, nincs sorrendi szabály", () => {
  // Minden helyes válaszban megvan az „emelünk”, a hibásban nincs → a szó különbözteti meg.
  const wordCases: AnswerKeyCases = {
    correct: ["Először négyzetre emelünk, és csak utána szorzunk 4-gyel.", "Előbb négyzetre emelünk, aztán szorzunk.", "Négyzetre emelünk elsőként, majd szorzunk néggyel."],
    wrong: [{ kind: "forditott", text: "Először 4-gyel szorzunk, aztán négyzetre." }, cases.wrong[1]],
  };
  const out = calibrateRubric(task(), wordCases);
  assert.equal(out.task.requiredOrder, undefined, JSON.stringify(out.changes));
  assert.ok(out.changes.some((c) => c.startsWith("szigorítás: + kötelező csoport")), JSON.stringify(out.changes));
});

test("S6b: a meglévő (modell adta) sorrendi szabályhoz nem nyúl, és a jelölés is marad, ha már szigorított", () => {
  const given = task({ requiredOrder: [["szorzunk", "szoroz"], ["négyzetre", "négyzet"]], sample: "Először szorzunk, utána négyzetre emelünk." });
  const out = calibrateRubric(given, { correct: ["Előbb szorzunk, aztán négyzetre emelünk.", "Először szorzunk, és csak utána négyzetre emelünk."], wrong: [cases.wrong[1]] });
  assert.deepEqual(out.task.requiredOrder, given.requiredOrder);
  assert.equal(out.task.tightenedOrder, undefined, "a modell adta szabály nem gépi szigorítás");
  const { task: tight } = calibrateRubric(task(), cases);
  const again = calibrateRubric(tight, cases);
  assert.equal(again.task.tightenedOrder, true, "újrakalibráláskor a jelölés megmarad");
  assert.deepEqual(again.task.requiredOrder, tight.requiredOrder);
});

test("S6b: a „csak a sorrend miatt bukott” jel ellenpróbával, és a lazítás (a pont nem csökken)", () => {
  const { task: tight } = calibrateRubric(task(), cases);
  const det = evaluateOpenAnswer(reversedCorrect, tight).state;
  assert.notEqual(det, "ok", "a helyes, más sorrendű megfogalmazás részpontot kap");
  assert.equal(missingOrder(reversedCorrect, tight), true);
  assert.equal(tightenedOnlyMiss(tight, reversedCorrect, det), true);
  // A modell adta (nem gépi) sorrendi szabály hiánya nem a szigorítás téves elutasítása.
  const { tightenedOrder: _t, ...modelOrder } = tight;
  assert.equal(tightenedOnlyMiss({ ...modelOrder, tightened: [["négyzetre", "négyzet"]] } as OpenTask, reversedCorrect, det), false);
  const relaxed = relaxTask(tight, { answered: 20, falseRejects: 10 }, new Date())!;
  assert.ok(relaxed, "lazítva");
  assert.equal(relaxed.requiredOrder, undefined);
  assert.equal("tightenedOrder" in relaxed, false);
  assert.equal(relaxed.required.length, tight.required.length + 1, "a sorrendi feltétel egy fogalomcsoport lett (a feltételszám változatlan)");
  assert.deepEqual(relaxed.relaxedTightening?.previousRequiredOrder, tight.requiredOrder);
  for (const a of [reversedCorrect, cases.wrong[0].text, ...cases.correct, "négyzetre", "szorzunk négyzetre", "semmi köze hozzá"]) {
    assert.ok(evaluateOpenAnswer(a, relaxed).score >= evaluateOpenAnswer(a, tight).score, a);
  }
  assert.equal(evaluateOpenAnswer(reversedCorrect, relaxed).state, "ok");
  assert.ok(openTaskSchema.safeParse(relaxed).success);
  assert.equal(relaxTask(relaxed, { answered: 40, falseRejects: 30 }, new Date()), null, "már lazított");
});

test("S6b: a lektori bankjavítás a `tightenedOrder` jelölést csak változatlan sorrenddel örökli", () => {
  const e = standardFusionFixture().experience!;
  const t0 = { ...e.tasks[0], requiredOrder: [["alfa"], ["béta"]], tightenedOrder: true };
  const original = { methods: e.methods, tasks: [t0, ...e.tasks.slice(1)], quiz: e.quiz, glossary: [] };
  const { tightenedOrder: _omit, ...withoutTag } = t0;
  const kept = applyBankPacketRepair(original, { tasks: [{ ...withoutTag, sample: `${t0.sample} Bővítve.` }] }, new Set([t0.id]));
  assert.equal(kept.tasks[0].tightenedOrder, true);
  const changed = applyBankPacketRepair(original, { tasks: [{ ...withoutTag, requiredOrder: [["béta"], ["alfa"]] }] }, new Set([t0.id]));
  assert.equal(changed.tasks[0].tightenedOrder, undefined, "a lektori javítás új sorrendje már nem gépi szigorítás");
});
