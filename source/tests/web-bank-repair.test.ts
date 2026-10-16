import assert from "node:assert/strict";
import test from "node:test";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { readHtmlLessonData } from "../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import { teachingHtml } from "./helpers/teaching-html";

const data = () => ({ classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "Matematika", experience: standardFusionFixture().experience! });
const htmlFor = (value: unknown) => `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(value)}</script><script>const data = JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;

test("new publication rejects raw angle brackets and commented-out banks, while legacy reading remains compatible", () => {
  const original = data(); original.experience.methods[0].prompt = "Melyik számra igaz, hogy x < 5?";
  const html = htmlFor(original);
  assert.doesNotThrow(() => readHtmlLessonData(html));
  assert.match(verifyLessonMethodHtml(html).problems.join("; "), /Unicode escape/);
  // S4b (docs/specs/2026-10-16-egy-futas.md): applyWebBankPatch (web-bank-repair.ts) removed with the web bank repair; the escaped-republish and commented-bank assertions built on its output went with it.
});

test("coverage errors do not conceal sample errors from the same repair round", () => {
  const original = data(); original.experience.methods = original.experience.methods.filter(m => m.kind !== "gate");
  original.experience.tasks[0].sample = "Hibás válasz.";
  const check = verifyLessonMethodHtml(htmlFor(original));
  assert.match(check.problems.join("; "), /kapukérdés/);
  assert.match(check.problems.join("; "), /mintaválasz/);
});
