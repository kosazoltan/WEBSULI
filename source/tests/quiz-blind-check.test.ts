import test from "node:test";
import assert from "node:assert/strict";
import { quizBlindProblems, QUIZ_BLIND_SYSTEM, type QuizBlindItem } from "../server/studio/quiz-blind-check";
import { WorkflowConflict } from "../server/workflows/engine";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";
import { experienceProblems } from "../shared/lesson-experience-validation";

/* Tételgyár T6.1 (docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas-vegrehajtas.md): a kvíz gyártáskori vak előszűrője. */

const q = (id: string, correctIndex: number): QuizBlindItem => ({ id, question: "Melyik eredmény tartozik a -8-(-6) kifejezéshez?", options: ["-14", "-2", "6"], correctIndex });

test("rossz kulcs → bukás a kód döntésével; helyes kulcs → átmegy; a kulcs nem megy ki a modellhez", async () => {
  let user = "";
  const call = async (_s: string, u: string) => { user = u; return { choices: [{ id: "a", truths: [false, true, false] }, { id: "b", truths: [false, true, false] }] }; };
  const out = await quizBlindProblems([q("a", 0), q("b", 1)], "tanítás", call, new Map());
  assert.deepEqual([...out.keys()], ["a"]);
  assert.match(out.get("a")!, /^a: kvíz-előszűrő \(vak ítélet\): a független ítélet szerint egyedül „-2” igaz, ez nem a kulcs/);
  assert.doesNotMatch(user, /correctIndex|feedback/);
});

test("hiba / hiányzó vagy rossz hosszú ítélet → nincs ítélet; a workflow-lízing hibája továbbmegy", async () => {
  const warnings: string[] = [];
  assert.equal((await quizBlindProblems([q("a", 0)], "", async () => { throw new Error("502"); }, new Map(), (w) => warnings.push(w))).size, 0);
  assert.match(warnings[0], /hívása hibázott/);
  assert.equal((await quizBlindProblems([q("a", 0)], "", async () => ({ choices: [] }), new Map())).size, 0);
  assert.equal((await quizBlindProblems([q("a", 0)], "", async () => ({ choices: [{ id: "a", truths: [true] }] }), new Map())).size, 0);
  await assert.rejects(quizBlindProblems([q("a", 0)], "", async () => { throw new WorkflowConflict("lízing"); }, new Map()), WorkflowConflict);
});

test("gyorsítótár: a változatlan tétel nem hív újra (a javítókörben sem)", async () => {
  let calls = 0;
  const cache = new Map<string, string | null>();
  const call = async () => { calls++; return { choices: [{ id: "a", truths: [false, true, false] }] }; };
  await quizBlindProblems([q("a", 0)], "t", call, cache);
  const again = await quizBlindProblems([q("a", 0)], "t", call, cache);
  assert.equal(calls, 1);
  assert.equal(again.size, 1);
});

test("a builderben: a bukott kvíztétel javítókör nélkül kiesik a tartalék terhére; ha a kivétel csomagszabályt sértene, bent marad", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  const withExtra = () => {
    const e = structuredClone(standardFusionFixture().experience!);
    e.quiz.push({ ...e.quiz[0], id: "extra-quiz", question: `${e.quiz[0].question} (tartalék)` });
    return e;
  };
  const fixes: string[] = [];
  let calls = 0;
  const experience = await buildLessonExperience({ ...lesson, experience: undefined }, concepts, {
    call: async () => { calls++; return withExtra(); },
    quizBlind: async (quiz) => new Map(quiz.filter((x) => x.question.endsWith("(tartalék)")).map((x) => [x.id, `${x.id}: kvíz-előszűrő (vak ítélet): teszt`] as const)),
    onToolFix: (tool, list) => { if (tool === "quiz-blind") fixes.push(...list); },
  });
  assert.equal(calls, 1, "nincs javítókör");
  assert.equal(experience.quiz.some((x) => x.question.endsWith("(tartalék)")), false);
  assert.match(fixes.join(" "), /1 kvíztétel kivéve a vak előszűrő szerint/);

  // Ha MINDEN kvíztétel bukna, a padló és a csomagszabályok védik a csomagot (a többség bent marad).
  const all = await buildLessonExperience({ ...lesson, experience: undefined }, concepts, {
    call: async () => withExtra(),
    quizBlind: async (quiz) => new Map(quiz.map((x) => [x.id, `${x.id}: teszt`] as const)),
  });
  // A valódi invariáns: a kivétel után is teljes a csomag (a builder a végén a teljes ellenőrzést futtatja — itt is igazoljuk), és nem ürül ki.
  assert.deepEqual(experienceProblems({ ...lesson, experience: all }), []);
  assert.ok(all.quiz.length > 0 && all.quiz.length < withExtra().quiz.length, `${all.quiz.length} kvíz maradt`);
});

test("a rendszerutasítás nem kéri és nem kapja a kulcsot", () => {
  assert.match(QUIZ_BLIND_SYSTEM, /A helyes választ szándékosan NEM kapod meg/);
});

test("újrahasznált (gyorsítótárból jövő) csomagnál nincs előszűrő-hívás", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  let checkpoint: import("../server/studio/experience-builder").ExperienceCheckpoint | undefined;
  await buildLessonExperience({ ...lesson, experience: undefined }, concepts, { call: async () => standardFusionFixture().experience!, save: async (cp) => { checkpoint = structuredClone(cp); } });
  let blindCalls = 0;
  await buildLessonExperience({ ...lesson, experience: undefined }, concepts, {
    checkpoint, call: async () => { throw new Error("nem hívható"); },
    quizBlind: async () => { blindCalls++; return new Map(); },
  });
  assert.equal(blindCalls, 0);
});
