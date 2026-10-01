import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { applyWebBankPatch } from "../server/studio/web-bank-repair";
import { readHtmlLessonData } from "../shared/lesson-html-data";
import { LESSON_SCORING_VERSION } from "../shared/answer-value";
import { scoringVersionFor } from "../shared/lesson-experience";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { teachingHtml } from "./helpers/teaching-html";

/* Spec 2026-09-30 (U1, B0): a pontozási verzió a tartalomból következik, a program állítja be.
   Mért hiba (élő Egyiptom-futás 7ee8913e, 2026-10-01): típusos feladat → „scoringVersion=2 kell” → a csomag 4 kísérlet után bukott. */

const typedBank = () => {
  const e = standardFusionFixture().experience!;
  return { ...e, tasks: e.tasks.map((t, i) => (i === 1 ? { ...t, typedAnswers: [{ part: "a", kind: "number" as const, value: "12" }] } : t)) };
};

test("scoringVersionFor: típusos feladat → 2, típus nélküli bank → a meglévő érték (hiányzik = 1)", () => {
  assert.equal(scoringVersionFor(typedBank().tasks), LESSON_SCORING_VERSION);
  assert.equal(scoringVersionFor(standardFusionFixture().experience!.tasks), undefined);
  assert.equal(scoringVersionFor([{ requiredDistinct: [{}] }]), LESSON_SCORING_VERSION);
  assert.equal(scoringVersionFor([], 2), 2, "a meglévő verzió nem csökken");
});

test("a bankgyártó a típusos feladatot tartalmazó csomagot elfogadja, és a lecke scoringVersion=2-t kap; típus nélkül marad a régi", async () => {
  const lesson = standardFusionFixture();
  const bank = typedBank();
  let calls = 0;
  const typed = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], { call: async () => { calls++; return { methods: bank.methods, tasks: bank.tasks, quiz: bank.quiz, glossary: [] }; } });
  assert.equal(calls, 1, "nincs javító kör a verzió miatt");
  assert.equal(typed.scoringVersion, LESSON_SCORING_VERSION);
  const plain = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], { call: async () => standardFusionFixture().experience! });
  assert.equal(plain.scoringVersion, undefined, "típus nélküli lecke: a régi kliens is pontozza");
});

test("a webes bankfolt típusos feladata a lecke pontozási verzióját 2-re emeli", () => {
  const e = standardFusionFixture().experience!;
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "Matematika", experience: e };
  const html = `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map((t) => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`;
  const patched = applyWebBankPatch(html, { tasks: [typedBank().tasks[1]] });
  assert.equal(readHtmlLessonData(patched).experience.scoringVersion, LESSON_SCORING_VERSION);
});
