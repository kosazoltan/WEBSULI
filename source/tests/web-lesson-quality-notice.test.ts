import assert from "node:assert/strict";
import { test } from "node:test";
import { compactFusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { teachingHtml } from "./helpers/teaching-html";
import { webLessonQualityNotice, prependWebLessonQualityNotice } from "../server/lib/web-lesson-quality-notice";

function htmlFor(experience: unknown): string {
  return `<!doctype html><html lang="hu"><body>${["teaching", "methods", "tasks", "quiz"].map(tab => `<button data-lesson-tab="${tab}">${tab}</button><section data-lesson-panel="${tab}">${tab === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify({ classroom: 7, classroomEvidence: "Bizonyított tanítás a forrás alapján", subject: "matematika", experience })}</script></body></html>`;
}

test("nem fúziós HTML nem kap minőségjelzést", () => {
  assert.equal(webLessonQualityNotice("<!doctype html><html><body><p>Régi HTML</p></body></html>"), null);
});

test("érvényes fusion-7.4-4 jelölt nem kap figyelmeztetést", () => {
  const notice = webLessonQualityNotice(htmlFor(standardFusionFixture().experience));
  assert.equal(notice, null);
});

test("régi és hiányos bank jelzést kap, de az eredeti HTML megmarad", () => {
  const old = structuredClone(compactFusionFixture().experience)!;
  old.version = "fusion-7.4-2";
  old.tasks = old.tasks.slice(0, 2);
  old.quiz = old.quiz.slice(0, 2);
  old.bankPlan = { ...old.bankPlan!, taskRound: 2, quizRound: 2 };
  const html = htmlFor(old);
  const notice = webLessonQualityNotice(html);
  assert.equal(notice?.kind, "legacy");
  const withBanner = prependWebLessonQualityNotice(html, notice!);
  assert.match(withBanner, /data-lesson-quality-notice="legacy"/);
  assert.match(withBanner, /websuli-lesson-data/);
  assert.match(withBanner, /fusion-7\.4-2/);
  assert.doesNotMatch(withBanner, /Hiányzó módszer:/);
});
