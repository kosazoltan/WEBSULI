import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { teachingHtml } from "./helpers/teaching-html";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { readHtmlLessonData, writeHtmlLessonData } from "../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import type { CanonicalQuizRow } from "../server/studio/canonical-quiz-bank";

/** TG-P5b (docs/specs/2026-11-27-tananyag-gyakorlati-p5b-vegrehajtas.md). */

const row = (i: number): CanonicalQuizRow => ({
  id: `h${i}`, gameId: "space-asteroid-quiz", tier: "easy", topic: "math", prompt: `Kérdés ${i}?`, options: ["a", "b", "c", "d"],
  correctIndex: 0, explanation: "Mert.", feedbackPerOption: ["", "", "", ""], sourceMaterialId: "m1", lessonId: "lesson-1",
  questionId: `q${i}`, questionVersion: "v", coversConceptIds: [],
});

test("TG-P5b: kanonikus Stúdió-leckénél a generate-quiz nem hív modellt és nem ír — a lecke saját bankját jelzi", async () => {
  const { generateMaterialQuiz } = await import("../server/gameQuizGeneratorService");
  const asked: string[] = [];
  const result = await generateMaterialQuiz("m1", 10, "owner", {
    materialExists: async () => true,
    canonicalQuiz: async (id) => { asked.push(id); return [row(1), row(2), row(3)]; },
  });
  assert.deepEqual(asked, ["m1"]);
  assert.equal(result.inserted, 0);
  assert.deepEqual(result.canonical, { lessonId: "lesson-1", items: 3 });
  assert.deepEqual(result.errors, []);
});

test("TG-P5b: érvénytelen kanonikus bank → nincs generálás (a régi export nem éled fel), hibaüzenet", async () => {
  const { generateMaterialQuiz } = await import("../server/gameQuizGeneratorService");
  const result = await generateMaterialQuiz("m1", 10, "owner", { materialExists: async () => true, canonicalQuiz: async () => [] });
  assert.equal(result.inserted, 0);
  assert.match(result.errors.join(" "), /Stúdió/u);
});

function htmlDocument() {
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "matematika", experience: fusionFixture().experience };
  return `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id = "websuli-lesson-data">${JSON.stringify(data)}</script></body></html>`;
}

test("TG-P5b: a HTML-javítás kapuja a JSON-bank meta-tételét (kvíz és nyílt feladat) tételazonosítóval jelzi", () => {
  const html = htmlDocument();
  assert.deepEqual(verifyLessonMethodHtml(html), { ok: true, problems: [] }, "a fixture-bank meta nélkül tiszta");
  const data = readHtmlLessonData(html);
  data.experience.quiz[0].question = "Hány pontot ér a feladatlapon a 3. feladat?";
  data.experience.tasks[0].q = "Hány pontot ér a feladatlapon a 2. feladat, és milyen feladattípus?";
  const result = verifyLessonMethodHtml(writeHtmlLessonData(html, data));
  assert.equal(result.ok, false);
  const joined = result.problems.join("\n");
  assert.match(joined, new RegExp(`${data.experience.quiz[0].id}: a feladatlapra`, "u"));
  assert.match(joined, new RegExp(`${data.experience.tasks[0].id}: a feladatlapra`, "u"));
});

test("review #637: a mentés a zár alatt újraellenőrzi a kanonikus leckét (az írás előtt), a két választó holtversenyben is azonos", () => {
  const src = fs.readFileSync("server/gameQuizGeneratorService.ts", "utf8");
  const lock = src.indexOf("pg_advisory_xact_lock");
  const recheck = src.indexOf("canonicalAppeared = true", lock);
  const deactivate = src.indexOf(".set({ isActive: false })", lock);
  assert.ok(lock > -1 && recheck > lock && recheck < deactivate, "zár → kanonikus újraellenőrzés → deaktiválás");
  assert.match(src, /orderBy\(desc\(lessons\.version\), desc\(lessons\.publishedAt\), desc\(lessons\.id\)\)/u);
  assert.match(fs.readFileSync("server/gameQuizBankService.ts", "utf8"), /\$\{lessons\.publishedAt\} DESC, \$\{lessons\.id\} DESC/u);
});
