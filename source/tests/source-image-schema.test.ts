import test from "node:test";
import assert from "node:assert/strict";
import { lessonSchema, modelLessonSchema, ANIM_KINDS } from "../shared/lesson-schema";
import { sourceImageParamsSchema } from "../shared/source-image";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** D1H-1 (docs/specs/2026-11-25-d1h-kivagott-kep.md): a `sourceImage` ábrafajta paraméterei és a modellkimenet határa. */

const ID = "a".repeat(64);
const block = (params: Record<string, unknown>) => ({ kind: "animate", animKind: "sourceImage", params, caption: "A vulkán keresztmetszete a forrásban.", coversConceptIds: [] });
function withBlock(params: Record<string, unknown>) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: unknown[] }> };
  lesson.sections[0].blocks.push(block(params));
  return lesson;
}

test("a sourceImage ismert ábrafajta; a paraméterek: sha256-azonosító, alt, forrásmegjelölés, https forrás-URL", () => {
  assert.ok((ANIM_KINDS as readonly string[]).includes("sourceImage"));
  assert.equal(sourceImageParamsSchema.safeParse({ imageId: ID, alt: "Vulkán keresztmetszete", credit: "nkp.hu — Földrajz 7.", sourceUrl: "https://www.nkp.hu/x" }).success, true);
  assert.equal(sourceImageParamsSchema.safeParse({ imageId: ID, alt: "Kép", credit: "Feltöltött forrás: tankonyv.pdf, 3. oldal", page: 3 }).success, true);
  for (const bad of [
    { imageId: "nem-hex", alt: "x", credit: "y" },
    { imageId: ID, alt: "", credit: "y" },
    { imageId: ID, alt: "x", credit: "" },
    { imageId: ID, alt: "x", credit: "y", sourceUrl: "http://nem-biztonsagos.hu" },
    { imageId: ID, alt: "x".repeat(201), credit: "y" },
    { imageId: ID, alt: "x", credit: "y", extra: 1 },
  ]) assert.equal(sourceImageParamsSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 60));
});

test("a lecke sémája a sourceImage blokkot érvényes paraméterrel elfogadja, hibással elutasítja", () => {
  assert.equal(lessonSchema.safeParse(withBlock({ imageId: ID, alt: "Vulkán", credit: "nkp.hu" })).success, true);
  assert.equal(lessonSchema.safeParse(withBlock({ imageId: "x", alt: "Vulkán", credit: "nkp.hu" })).success, false);
});

test("a modell kimenete sourceImage blokkot SOHA nem hozhat (a képet a program vágja és tölti) — kapcsoló BE és KI mellett sem", () => {
  for (const on of [true, false]) assert.equal(modelLessonSchema(on).safeParse(withBlock({ imageId: ID, alt: "Vulkán", credit: "nkp.hu" })).success, false, `sourceVisuals=${on}`);
  assert.equal(modelLessonSchema(true).safeParse(fusionFixture()).success, true, "a kép nélküli lecke változatlanul átmegy");
});
