import assert from "node:assert/strict";
import test from "node:test";

import { resolveStudioModel, STUDIO_STEPS } from "../server/ai/models";

/**
 * #163 — the OCR step exists in the model registry and defaults to a CHEAP
 * vision-capable model (owner requirement: image transcription must not run
 * on the expensive extract model).
 */

test("a modell-lista tartalmazza az ocr lépést", () => {
  assert.ok((STUDIO_STEPS as readonly string[]).includes("ocr"));
});

test("az ocr alapmodellje olcsó vision-képes modell, nem az extract modellje", () => {
  const ocr = resolveStudioModel("ocr" as (typeof STUDIO_STEPS)[number]);
  const extract = resolveStudioModel("extract");
  assert.notEqual(ocr, extract, "az OCR nem a drága extract-modellen fut");
  assert.match(ocr, /flash|mini|lite/i, "olcsó modellosztály");
});

test("az ocr modell env-var-ral felülírható (STUDIO_MODEL_OCR)", () => {
  const overridden = resolveStudioModel("ocr" as (typeof STUDIO_STEPS)[number], {
    STUDIO_MODEL_OCR: "x/custom-ocr",
  });
  assert.equal(overridden, "x/custom-ocr");
});
