import assert from "node:assert/strict";
import test from "node:test";

import { ensureSectionVisuals } from "../server/studio/section-visuals";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";

/* Spec 2026-09-19 — a chapter without a figure gets its worked example as a process visual. */

const base: Lesson = lessonSchema.parse({
  title: "Műveleti sorrend", subject: "Matematika", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [
    { heading: "Szorzás előbb", probaEnabled: true, blocks: [
      { kind: "explain", text: "A szorzás és az osztás erősebb az összeadásnál és a kivonásnál.", depth: "core", readAloud: false, coversConceptIds: ["sorrend"] },
      { kind: "example", problem: "8 + 4 · 9 − 15 : 3", steps: ["4 · 9 = 36 és 15 : 3 = 5", "8 + 36 = 44", "44 − 5 = 39"], answer: "39", coversConceptIds: ["sorrend"] },
      { kind: "recap", bullets: ["Előbb szorzás és osztás."] },
    ] },
    { heading: "Már van ábra", probaEnabled: true, blocks: [
      { kind: "explain", text: "A zárójel mindent felülír, belülről kifelé haladunk.", depth: "core", readAloud: false, coversConceptIds: ["zarojel"] },
      { kind: "animate", animKind: "process", params: { steps: ["Belső zárójel", "Külső zárójel"] }, caption: "Zárójelek belülről kifelé.", coversConceptIds: ["zarojel"] },
      { kind: "recap", bullets: ["Zárójel először."] },
    ] },
    { heading: "Nincs levezetett példa", probaEnabled: true, blocks: [
      { kind: "explain", text: "Azonos rangú műveleteknél balról jobbra haladunk.", depth: "core", readAloud: false, coversConceptIds: ["balrol"] },
      { kind: "recap", bullets: ["Balról jobbra."] },
    ] },
  ],
});

test("példa-lépésekből process ábra kerül a figura nélküli fejezetbe, a többi fejezet érintetlen", () => {
  const { lesson, added } = ensureSectionVisuals(base);
  assert.deepEqual(added, [0]);
  const blocks = lesson.sections[0].blocks;
  assert.equal(blocks.length, 4);
  const visual = blocks[2];
  assert.equal(visual.kind, "animate");
  if (visual.kind !== "animate") return;
  assert.equal(visual.animKind, "process");
  assert.deepEqual(visual.params, { steps: ["4 · 9 = 36 és 15 : 3 = 5", "8 + 36 = 44", "44 − 5 = 39"] });
  assert.match(visual.caption, /8 \+ 4 · 9/);
  assert.deepEqual(visual.coversConceptIds, ["sorrend"]);
  assert.ok(lessonSchema.safeParse(lesson).success, "a bővített lecke sémahelyes");
  assert.deepEqual(lesson.sections[1], base.sections[1], "meglévő ábra mellé nem kerül új");
  assert.deepEqual(lesson.sections[2], base.sections[2], "példa nélkül nincs kitalált ábra");
});

test("ha minden fejezetben van ábra, ugyanaz az objektum jön vissza", () => {
  const withVisuals = { ...base, sections: [base.sections[1]] };
  const result = ensureSectionVisuals(withVisuals);
  assert.equal(result.lesson, withVisuals);
  assert.deepEqual(result.added, []);
});
