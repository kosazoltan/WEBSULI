import { test } from "node:test";
import assert from "node:assert/strict";
import { applyVisualPatch } from "../server/studio/visual-patch";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 3. szelet): az ábrakészítő csak foltot ad. */

const lesson = {
  title: "Az időszámítás", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [
    { heading: "A Hold", probaEnabled: true, blocks: [
      { kind: "explain", text: "A Hold változása alapján készült a holdnaptár.", depth: "core", readAloud: true, coversConceptIds: ["c1"] },
      { kind: "animate", animKind: "process", params: { steps: ["Hold változása → holdnaptár.", "Olimpia"] }, caption: "Kezdőpontok", coversConceptIds: ["c1"] },
    ] },
    { heading: "Évszázad", probaEnabled: true, blocks: [
      { kind: "explain", text: "100 év = 1 évszázad.", depth: "core", readAloud: true, coversConceptIds: ["c2"] },
    ] },
  ],
} as unknown as Lesson;

const moon = { animKind: "cycle", params: { center: "Föld", phases: [{ label: "Újhold", moon: 0 }, { label: "Első negyed", moon: 0.5, waxing: true }, { label: "Telihold", moon: 1 }, { label: "Utolsó negyed", moon: 0.5, waxing: false }] }, caption: "A Hold fázisai (holdnaptár)", coversConceptIds: ["c1"] };

test("a folt kicseréli a szövegdobozos ábrát holdciklusra, és beszúr; a tanítás bájtra azonos", () => {
  const result = applyVisualPatch(lesson, { sections: [
    { index: 0, visuals: [{ ...moon, replace: 1 }] },
    { index: 1, visuals: [{ after: 0, animKind: "timeline", params: { events: ["1–100: 1. évszázad", "101–200: 2. évszázad"] }, caption: "Évszázadok", coversConceptIds: ["c2"] }] },
  ] });
  assert.ok(result);
  assert.deepEqual([result.added, result.replaced, result.rejected], [1, 1, []]);
  assert.equal((result.lesson.sections[0].blocks[1] as { animKind: string }).animKind, "cycle");
  assert.equal((result.lesson.sections[1].blocks[1] as { animKind: string }).animKind, "timeline");
  assert.deepEqual(result.lesson.sections.map((s) => s.blocks.filter((b) => b.kind !== "animate")),
    lesson.sections.map((s) => s.blocks.filter((b) => b.kind !== "animate")));
  assert.equal(lesson.sections[0].blocks.length, 2, "az eredeti lecke nem módosult");
});

test("érvénytelen ábra kimarad okkal: hiányos params, idegen fogalom, nem ábra cseréje, kitalált fajta", () => {
  const result = applyVisualPatch(lesson, { sections: [{ index: 0, visuals: [
    { ...moon, params: { phases: [{ label: "Hold" }] } },
    { ...moon, coversConceptIds: ["c2"] },
    { ...moon, replace: 0 },
    { ...moon, animKind: "hologram" },
  ] }, { index: 9, visuals: [moon] }] });
  assert.ok(result);
  assert.equal(result.added + result.replaced, 0);
  assert.equal(result.rejected.length, 5);
  assert.match(result.rejected.join("\n"), /cycle\.phases/);
  assert.match(result.rejected.join("\n"), /nem tanított fogalom: c2/);
  assert.match(result.rejected.join("\n"), /nem ábra, nem cserélhető/);
  assert.match(result.rejected.join("\n"), /10\. fejezet: nincs ilyen fejezet/);
  assert.deepEqual(result.lesson.sections, lesson.sections);
});

test("nem folt (régi alakú teljes lecke) → null, a régi út méri; after = -1 a fejezet elejére", () => {
  assert.equal(applyVisualPatch(lesson, lesson), null);
  assert.equal(applyVisualPatch(lesson, { sections: [] }), null);
  const first = applyVisualPatch(lesson, { sections: [{ index: 1, visuals: [{ after: -1, animKind: "numberLine", params: { from: 0, to: 300, step: 100, marks: [{ value: 100, label: "1 évszázad" }] }, caption: "Évszázad a számegyenesen", coversConceptIds: ["c2"] }] }] });
  assert.equal(first?.lesson.sections[1].blocks[0].kind, "animate");
});
