import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { readHtmlLessonData } from "../shared/lesson-html-data";
import { applyTeachingPatch, reviewAndRepairWebTeaching } from "../server/studio/web-teaching-repair";
import { TEACHING_REVIEW_CHECKS, teachingReviewEvidence, assertTeachingReviewEvidence } from "../server/studio/web-teaching-review";
import { teachingHtml } from "./helpers/teaching-html";

const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "Matematika", experience: standardFusionFixture().experience! };
const html = `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(data)}</script><script>const data = JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;
const source = { url: "https://example.org/lesson", title: "Szintetikus tesztforrás", text: "Az alap és a magasság szorzata egy kétszer akkora területű téglalapot ad." };
const before = "Az alap és a magasság szorzata.";
const after = "Az alap és a magasság szorzata egy kétszer akkora területű téglalapot ad.";
const patch = { edits: [{ sectionIndex: 0, before, after }] };
const review = (passed: boolean) => ({ checks: TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: criterion !== "explanation_depth" || passed, evidence: "A szintetikus javítófolyamat célzott állapotellenőrzése." })), issues: passed ? [] : [{ criterion: "explanation_depth" as const, kind: "missing_explanation" as const, sectionIndex: 0, lessonQuote: "A háromszög területe", citations: [], reason: "A területképlet második lépésének indoklása hiányzik.", repair: "Egészítsd ki a képlet magyarázatát a területek összevetésével." }] });

test("targeted teaching change preserves every other byte and all bank items", () => {
  const updated = applyTeachingPatch(html, patch);
  assert.equal(updated, html.replace(before, after));
  assert.deepEqual(readHtmlLessonData(updated), data);
  assert.equal(applyTeachingPatch(html, { ...patch, bank: { tasks: [], methods: [], quiz: [] } }), updated);
  assert.throws(() => applyTeachingPatch(html, { edits: [], bank: {} }), /Üres/);
});

test("a short correction or deletion retains the chapter gate and an exact text anchor", () => {
  const text = "Régi bizonyítatlan részlet.";
  const draft = html.replace('<h2>', `<p>${text}</p><h2>`);
  for (const replacement of ["Jó.", ""]) {
    assert.equal(applyTeachingPatch(draft, { edits: [{ sectionIndex: 0, before: text, after: replacement }] }), draft.replace(text, replacement));
  }
  assert.throws(() => applyTeachingPatch(draft, { edits: [{ sectionIndex: 0, before: "hiányzó idézet", after: "Jó." }] }), /edits\[0\].before: hiányzó/);
});

test("teaching patch cannot escape chapters, add active HTML, rewrite metadata or replan questions", () => {
  for (const bad of [
    { ...patch, bank: null }, { ...patch, bank: false },
    { ...patch, classroom: 1 }, { edits: [{ ...patch.edits[0], sectionIndex: 1 }] },
    { edits: [{ ...patch.edits[0], before: "data-lesson-panel" }] },
    { edits: [{ ...patch.edits[0], after: '<script>alert(1)</script>' }] },
    { edits: [{ ...patch.edits[0], after: '</section><p>Más fejezet.</p>' }] },
    { edits: [{ ...patch.edits[0], after: '<b onclick="alert(1)">Hibás tartalom.</b>' }] },
    { edits: [{ ...patch.edits[0], after: '<p>Lezáratlan tartalom' }] },
    { edits: [{ ...patch.edits[0], after: '<b>Hibás tartalom.</p>' }] },
    { edits: [], bank: { tasks: [{ ...data.experience.tasks[0], id: "unknown" }] } },
    { edits: [], bank: { tasks: [{ ...data.experience.tasks[0], sectionIndex: 1 }] } },
  ]) assert.throws(() => applyTeachingPatch(html, bad));
  assert.throws(() => applyTeachingPatch(html.replace(before, before + before), patch), /ismétlődő/);
  assert.throws(() => applyTeachingPatch(html, patch, new Set([1])), /érintett fejezetre/);
  assert.throws(() => applyTeachingPatch(html, { edits: [], bank: { tasks: [{ ...data.experience.tasks[0], sample: "hibás" }] } }), /teljes kaput/);
});

test("a plain substring in an attribute, script or style cannot be mistaken for visible teaching", () => {
  for (const node of ['<p title="ORIGINAL_TEXT_VALUE">Tanító kiegészítés.</p>', '<script>const marker = "ORIGINAL_TEXT_VALUE";</script>', '<style>:root { --marker: ORIGINAL_TEXT_VALUE; }</style>']) {
    const embedded = html.replace('<h2>', `${node}<h2>`);
    assert.throws(() => applyTeachingPatch(embedded, { edits: [{ sectionIndex: 0, before: "ORIGINAL_TEXT_VALUE", after: "REPLACEMENT_VALUE" }] }), /DOM-szövegcsomóponton/);
  }
});

test("bank corrections need an independently named item, not merely the same chapter", () => {
  const item = data.experience.tasks[0];
  const bankPatch = { edits: [], bank: { tasks: [{ ...item, q: item.q + ' Indokold is!' }] } };
  assert.throws(() => applyTeachingPatch(html, bankPatch, new Set([0]), new Set()), /lektor által megnevezett/);
  const changed = applyTeachingPatch(html, bankPatch, new Set([0]), new Set([`tasks:${item.id}`]));
  assert.equal(readHtmlLessonData(changed).experience.tasks[0].q, item.q + ' Indokold is!');
  assert.deepEqual(readHtmlLessonData(changed).experience.tasks.slice(1), data.experience.tasks.slice(1));
});

test("negative review triggers focused correction then a fresh full review tied to the changed HTML", async () => {
  let reviews = 0, repairs = 0, problems = 0, candidates = 0;
  const result = await reviewAndRepairWebTeaching(html, [source], {
    requestedTopic: "Háromszög területe", review: async (candidate, sources, _call, _signal, topic) => {
      reviews++; assert.deepEqual(sources, [source]); assert.equal(topic, "Háromszög területe");
      assert.equal(candidate, reviews === 1 ? html : html.replace(before, after));
      return review(reviews === 2);
    }, repair: async (system, user) => {
      repairs++; assert.match(system, /Ne add vissza a teljes HTML/);
      assert.equal(JSON.parse(user).lessonHtml, html); assert.equal(JSON.parse(user).review.checks[2].passed, false);
      return patch;
    }, onProblem: async () => { problems++; }, onCandidate: async () => { candidates++; },
  });
  assert.deepEqual([reviews, repairs, problems, candidates], [2, 1, 1, 1]);
  assert.ok(result.review.checks.every(c => c.passed));
  const proof = teachingReviewEvidence(result.html, [source], result.review);
  assert.doesNotThrow(() => assertTeachingReviewEvidence(result.html, [{ url: source.url, title: source.title }], proof));
  assert.throws(() => assertTeachingReviewEvidence(html, [{ url: source.url, title: source.title }], proof), /elavult/);
});

test("failed patch has bounded retry with its exact error; no repeated verdict turns failure into PASS", async () => {
  let reviews = 0, repairs = 0; const diagnostics: string[] = [];
  const result = await reviewAndRepairWebTeaching(html, [source], {
    review: async () => { reviews++; return review(false); },
    repair: async (_system, user) => { repairs++; if (repairs === 2) { assert.match(JSON.parse(user).patchFailure, /Üres/); assert.deepEqual(JSON.parse(user).previousPatch, { edits: [] }); } return { edits: [] }; },
    onProblem: async (problem, candidate) => { assert.equal(candidate, html); diagnostics.push(problem); },
  });
  assert.equal(reviews, 1); assert.equal(repairs, 2); assert.equal(result.html, html);
  assert.equal(result.review.checks[2].passed, false);
  assert.equal(diagnostics.filter(d => /Üres/.test(d)).length, 2);
});

test("two semantic corrections that do not fix the problem remain unpublishable", async () => {
  let reviews = 0, repairs = 0, problems = 0;
  const result = await reviewAndRepairWebTeaching(html, [source], {
    review: async () => { reviews++; return review(false); },
    repair: async () => { repairs++; return repairs === 1 ? patch : { edits: [{ sectionIndex: 0, before: after, after: after + ' Gondold végig!' }] }; },
    onProblem: async () => { problems++; },
  });
  assert.equal(reviews, 3); assert.equal(repairs, 2); assert.equal(result.review.checks[2].passed, false);
  assert.equal(problems, 3);
});

test("cancellation after the author cannot apply or accept its response", async () => {
  const controller = new AbortController(); let saved = 0;
  await assert.rejects(reviewAndRepairWebTeaching(html, [source], {
    signal: controller.signal, review: async () => review(false),
    repair: async () => { controller.abort(); return patch; }, onCandidate: async () => { saved++; },
  }));
  assert.equal(saved, 0);
});
