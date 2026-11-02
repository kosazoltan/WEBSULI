import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { LESSON_SCORING_VERSION, TYPED_SCORING_VERSION } from "../shared/answer-value";
import { scoringVersionFor } from "../shared/lesson-experience";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30 (U1, B0): a pontozási verzió a tartalomból következik, a program állítja be.
   Mért hiba (élő Egyiptom-futás 7ee8913e, 2026-10-01): típusos feladat → „scoringVersion=2 kell” → a csomag 4 kísérlet után bukott. */

const typedBank = () => {
  const e = standardFusionFixture().experience!;
  return { ...e, tasks: e.tasks.map((t, i) => (i === 1 ? { ...t, typedAnswers: [{ part: "a", kind: "number" as const, value: "12" }] } : t)) };
};

test("scoringVersionFor: típusos feladat → 2, típus nélküli bank → a meglévő érték (hiányzik = 1)", () => {
  // Spec 2026-10-19-algebrai-referencia (dokumentált specváltozás): a számos típusos szerződés a 2-es marad, a 3-as a betűs.
  assert.equal(scoringVersionFor(typedBank().tasks), TYPED_SCORING_VERSION);
  assert.equal(scoringVersionFor(standardFusionFixture().experience!.tasks), undefined);
  assert.equal(scoringVersionFor([{ requiredDistinct: [{}] }]), TYPED_SCORING_VERSION);
  assert.equal(scoringVersionFor([], 2), 2, "a meglévő verzió nem csökken");
  // review #166: érvénytelen meglévő érték nem marad meg
  for (const bad of [LESSON_SCORING_VERSION + 1, 0, 1.5, "2", null]) assert.equal(scoringVersionFor([], bad), undefined, String(bad));
});

test("a bankgyártó a típusos feladatot tartalmazó csomagot elfogadja, és a lecke scoringVersion=2-t kap; típus nélkül marad a régi", async () => {
  const lesson = standardFusionFixture();
  const bank = typedBank();
  let calls = 0;
  const typed = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], { call: async () => { calls++; return { methods: bank.methods, tasks: bank.tasks, quiz: bank.quiz, glossary: [] }; } });
  assert.equal(calls, 1, "nincs javító kör a verzió miatt");
  assert.equal(typed.scoringVersion, TYPED_SCORING_VERSION);
  const plain = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], { call: async () => standardFusionFixture().experience! });
  assert.equal(plain.scoringVersion, undefined, "típus nélküli lecke: a régi kliens is pontozza");
  // review #166: újraépítéskor a korábbi v2 lecke nem minősül vissza
  const rebuilt = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], { previous: typed, call: async () => standardFusionFixture().experience! });
  assert.equal(rebuilt.scoringVersion, TYPED_SCORING_VERSION);
});
