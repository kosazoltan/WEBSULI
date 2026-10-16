import { test } from "node:test";
import assert from "node:assert/strict";
import { illustrationFacts, lektorLessonView } from "../server/studio/lektor-view";
import { buildLektorPrompt, LEKTOR_SOLUTIONS_MAX, lektorReportSchema, parseLektorResponse, TEACHING_CONTRACT } from "../server/studio/step-io";
import { blindSolutionsPromptBlock, NOT_ENOUGH, parseBlindSolverAnswer } from "../server/studio/blind-solver";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import { LESSON_QUALITY_CONTRACT } from "../shared/lesson-quality";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U5): C5/H8, C6/H15, H32, H45/C18, H48, H49, H51, ábra-kapu, H37. */

const SVG = '<svg viewBox="0 0 800 520"><rect x="1" y="1" width="10" height="10"/><text x="10" y="20">Nílus</text><text x="10" y="40">2500 km</text><path d="M0 0"/></svg>';

test("C5/H8: a lektor bemenete kiírt útvonalas, tömör nézet — SVG-törzs nélkül, az ábra ellenőrizhető tényeivel, az igazolt tételek jelölve", () => {
  const lesson = standardFusionFixture();
  lesson.sections[0].blocks.push({ kind: "animate", animKind: "illustration", params: { svg: SVG }, caption: "A Nílus hossza.", coversConceptIds: ["area"] } as never);
  const facts = illustrationFacts(SVG);
  assert.deepEqual(facts.labels, ["Nílus", "2500 km"]); assert.deepEqual(facts.numbers, ["2500"]); assert.equal(facts.elements, 4);
  const view = lektorLessonView(lesson, { verifiedPaths: new Set(["experience.quiz[1]", "experience.tasks[0]"]) });
  assert.doesNotMatch(view, /<svg|<rect|<path/, "az SVG-törzs nem a lektor bemenete");
  assert.match(view, /animate\/illustration: caption: A Nílus hossza\. \| feliratok: „Nílus”, „2500 km” \| számok: 2500 \| elemek: 4/);
  assert.match(view, /^sections\[0\]\.heading: /m);
  assert.match(view, /^sections\[0\]\.blocks\[0\] explain\(core\) \[area\]: /m);
  assert.match(view, /^experience\.tasks\[0\] \[area\] s0 (oral|written): /m);
  assert.match(view, /^experience\.quiz\[0\] \[area\] s0 (recall|apply)?: .* \| helyes: \d/m);
  assert.match(view, /IGAZOLT TÉTELEK .*: experience\.quiz\[1\], experience\.tasks\[0\]/);
  const prompt = buildLektorPrompt(lesson, { title: "T", subject: "m", classroom: 5, concepts: [] }, [], undefined, undefined, new Set(["experience.quiz[1]"]));
  assert.doesNotMatch(prompt, /"blocks": \[/, "nincs behúzott JSON-lecke");
  assert.match(prompt, /IGAZOLT TÉTELEK/);
  assert.equal(prompt.split("TANÍTÁSI SZERZŐDÉS").length - 1, 1, "a tanítási szerződés egyszer");
  assert.ok(!prompt.includes(LESSON_QUALITY_CONTRACT), "a minőségi szerződést a runbook adja — a promptban nem ismétlődik (H8: 3× volt)");
  assert.ok(prompt.includes(TEACHING_CONTRACT));
  assert.match(prompt, /üres notes CSAK reviewedAll: true mellett/);
});

test("H45/C18/H49: a lektori jelentés modell-határa — {} érvénytelen, üres notes csak reviewedAll mellett, 200 fölött jelölt csonkolás; a tárolt régi jelentés olvasható marad", () => {
  assert.equal(parseLektorResponse({}).ok, false);
  assert.match((parseLektorResponse({}) as { reason: string }).reason, /notes/);
  assert.equal(parseLektorResponse({ notes: [] }).ok, false, "üres jelentés kimondás nélkül");
  assert.equal(parseLektorResponse({ notes: [], reviewedAll: true }).ok, false, "review #163: a solutions kulcs kötelező");
  assert.equal(parseLektorResponse({ solutions: [], notes: [], reviewedAll: true }).ok, true);
  assert.equal(parseLektorResponse({ solutions: [], notes: [{ kind: "language", message: "x" }] }).ok, true);
  assert.equal(parseLektorResponse("nem objektum").ok, false);
  const many = Array.from({ length: LEKTOR_SOLUTIONS_MAX + 7 }, (_, i) => ({ task: `f${i}`, own: "1", lesson: "1", match: true }));
  const truncated = parseLektorResponse({ solutions: many, notes: [], reviewedAll: true });
  assert.equal(truncated.ok, true);
  if (truncated.ok) { assert.equal(truncated.report.solutions?.length, LEKTOR_SOLUTIONS_MAX); assert.equal(truncated.report.solutionsTruncated, 7); }
  assert.equal(lektorReportSchema.safeParse({ notes: [] }).success, true, "tárolt (régi) jelentés: lenient séma");
});

test("C6/H15: vak megoldó — elemenkénti sémahiba → az elem kimarad (partial), a „NINCS ELÉG ADAT” megőrizve és a lektor látja; saját skill", () => {
  const answer = parseBlindSolverAnswer({ solutions: [
    { task: "Téglatest: élek", answer: "a = 7, b = 11, c = 6 egység" },
    { task: "Piac: Piri", answer: NOT_ENOUGH },
    { task: "", answer: "hibás elem" },
    { task: "Réka", answer: "nincs elég adat" },
  ] });
  assert.deepEqual(answer.solutions.map((s) => s.task), ["Téglatest: élek"]);
  assert.deepEqual(answer.notEnough, ["Piac: Piri", "Réka"]);
  assert.equal(answer.partial, true);
  assert.deepEqual(parseBlindSolverAnswer({ solutions: [{ task: "a", answer: "1" }] }), { solutions: [{ task: "a", answer: "1" }], notEnough: [], partial: false });
  const block = blindSolutionsPromptBlock({ sourceHash: "h", model: "m", solutions: answer.solutions, notEnough: answer.notEnough, partial: true }).join("\n");
  assert.match(block, /„NINCS ELÉG ADAT”-nak jelölte .*Piac: Piri; Réka/);
  assert.match(block, /RÉSZLEGES/);
  assert.match(blindSolutionsPromptBlock({ sourceHash: "h", model: "m", solutions: [], notEnough: ["x"] }).join("\n"), /egyetlen forrásfeladatot sem tudott megoldani/);
  for (const must of ["NINCS ELÉG ADAT", "hibás alakú elem kimarad", "tananyag ismerete NÉLKÜL"]) assert.ok(SUPPORT_SKILLS["blind-solver"].includes(must), must);
  assert.ok(SUPPORT_SKILLS["blind-solver"].length < 2800);
});
