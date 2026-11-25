import test from "node:test";
import assert from "node:assert/strict";
import { lessonSchema, modelLessonSchema, ANIM_KINDS } from "../shared/lesson-schema";
import { sourceImageParamsSchema } from "../shared/source-image";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** D1H-1 (docs/specs/2026-11-25-d1h-kivagott-kep.md): a `sourceImage` ábrafajta paraméterei és a modellkimenet határa. */

const ID = "a".repeat(64);
function withBlock(params: Record<string, unknown>) {
  const lesson = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<{ coversConceptIds?: string[] }> }> };
  const concept = lesson.sections[0].blocks.find(b => b.coversConceptIds?.length)!.coversConceptIds!.slice(0, 1);
  lesson.sections[0].blocks.push({ kind: "animate", animKind: "sourceImage", params, caption: "A vulkán keresztmetszete a forrásban.", coversConceptIds: concept } as never);
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

test("a sourceImage a gyártó promptjaiban nem hirdetett fajta (a modell nem ismeri); KI kapcsolónál a modell-séma nem fogadja el", async () => {
  const { PROMPT_ANIM_KINDS } = await import("../shared/lesson-schema");
  const { SOURCE_VISUALS_CONTRACT } = await import("../shared/source-visuals");
  assert.equal((PROMPT_ANIM_KINDS as readonly string[]).includes("sourceImage"), false);
  assert.doesNotMatch(String(SOURCE_VISUALS_CONTRACT), /sourceImage/);
  assert.equal(modelLessonSchema(false).safeParse(withBlock({ imageId: ID, alt: "Vulkán", credit: "nkp.hu" })).success, false);
});
