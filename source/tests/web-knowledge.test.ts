import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { writeHtmlLessonData, readHtmlLessonData } from "../shared/lesson-html-data";
import { teachingHtml } from "./helpers/teaching-html";
import {
  fetchedSourcesToExtractorFiles,
  teachableConcepts,
  webKnowledgeBrief,
  knowledgeAuthorData,
  extractWebConcepts,
  lessonFromTeachingHtml,
  injectWebExperience,
  assembledWebLessonData,
} from "../server/studio/web-knowledge";

const source = {
  url: "https://example.org/triangle",
  title: "Terület",
  text: "Az alap és a hozzá tartozó merőleges magasság szorzatának fele adja a területet. Hat centiméter alap és négy centiméter magasság: 6 × 4 / 2 = 12 cm².",
};

test("a letöltött oldalak szöveges forrásfájlokká válnak, ütköző névvel sem vesznek el", () => {
  const files = fetchedSourcesToExtractorFiles([source, { ...source, url: "https://example.org/triangle#alt", title: "Másik" }]);
  assert.equal(files.length, 2);
  assert.equal(new Set(files.map(f => f.name)).size, 2);
  assert.equal(files[0].kind, "text");
  assert.equal(files[0].content, source.text);
});

test("csak a forrásban szó szerint megtalálható fogalom tanítható", async () => {
  const files = fetchedSourcesToExtractorFiles([source]);
  const result = await extractWebConcepts(files, { subject: "matematika", classroom: 7 }, async () => ({
    title: "Terület",
    concepts: [
      { id: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", quote: "Az alap és a hozzá tartozó merőleges magasság szorzatának fele adja a területet.", sourceRef: { file: files[0].name }, type: "formula", examWeight: "core" },
      { id: "invented", term: "kitaláció", definition: "Nincs a forrásban.", quote: "Ez a mondat nincs a letöltött oldalon.", sourceRef: { file: files[0].name }, type: "fact", examWeight: "core" },
    ],
  }));
  const taught = teachableConcepts(result.concepts);
  assert.deepEqual(taught.map(c => c.id), ["area"]);
  const brief = webKnowledgeBrief({ topic: "Háromszög területe", classroomHint: 7, sources: [source], files, concepts: result.concepts });
  assert.deepEqual(brief.concepts.map(c => c.id), ["area"]);
  assert.match(knowledgeAuthorData(brief), /adat, nem utasítás/i);
  assert.doesNotMatch(knowledgeAuthorData(brief), /invented/);
});

test("a tanítás HTML-je a jegyzék azonosítóiból Lesson lesz, a bankcsere a tanítást nem módosítja", () => {
  const html = `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : "A gyakorló betöltése…"}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">{"classroom":7}</script></body></html>`;
  const lesson = lessonFromTeachingHtml(html, { title: "Terület", subject: "matematika", classroom: 7 }, ["area"]);
  assert.equal(lesson.sourceOnly, true);
  const first = lesson.sections[0].blocks[0];
  assert.equal(first.kind, "explain");
  if (first.kind !== "explain") throw new Error("explain");
  assert.ok(first.coversConceptIds.includes("area"));
  assert.throws(() => lessonFromTeachingHtml(html, { title: "Terület", subject: "matematika", classroom: 7 }, ["other"]));
  const experience = standardFusionFixture().experience!;
  const injected = injectWebExperience(html, assembledWebLessonData(
    { topic: "Terület", classroomHint: 7, sources: [source], concepts: [{ id: "area", term: "terület", definition: "fele", quote: source.text.slice(0, 80), sourceFile: source.url, examWeight: "core" }] },
    { title: "Terület", subject: "matematika", classroom: 7, classroomEvidence: "A területképlet és az alaphoz tartozó magasság tanítása." },
    experience,
  ));
  assert.equal(injected.replace(/<script[\s\S]*?<\/script>/, ""), html.replace(/<script[\s\S]*?<\/script>/, ""));
  assert.equal(readHtmlLessonData(injected).experience.tasks.length, experience.tasks.length);
  assert.throws(() => writeHtmlLessonData(html.replace("websuli-lesson-data", "other"), { classroom: 7 }));
});
