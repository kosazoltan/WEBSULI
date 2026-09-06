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
  // #190: a korábbi `/flash|mini|lite/` NÉV-minta hazug kapu volt — a modell
  // olcsósága nem a nevéből következik. A mért OpenRouter-ár (2026-09-06):
  //   qwen/qwen3-vl-32b-instruct  $0.104/M input   <- ez, 96.3% kézírás-recall
  //   z-ai/glm-5.3-flash          $0.075/M         (88.2%, `r`-t `m`-nek olvasta)
  //   openai/gpt-5.6-terra        $2.000/M         (az extract modellje)
  // A szabály tehát: az OCR olcsó OSZTÁLYBAN marad — ismert olcsó modellek
  // listája, amit ár-méréssel bővítünk, nem névtalálgatással.
  const CHEAP_VISION_MODELS = [
    "qwen/qwen3-vl-32b-instruct",
    "qwen/qwen3-vl-8b-instruct",
    "z-ai/glm-5.3-flash",
    "google/gemini-3.1-flash-lite",
    "google/gemini-2.5-flash-lite",
    "qwen/qwen3.8-flash",
  ];
  assert.ok(
    CHEAP_VISION_MODELS.includes(ocr),
    `az OCR modellje (${ocr}) nincs a mért olcsó vision-listán — ha új modellre váltasz, előbb mérd az árát és vedd fel ide`,
  );
});

test("az ocr modell env-var-ral felülírható (STUDIO_MODEL_OCR)", () => {
  const overridden = resolveStudioModel("ocr" as (typeof STUDIO_STEPS)[number], {
    STUDIO_MODEL_OCR: "x/custom-ocr",
  });
  assert.equal(overridden, "x/custom-ocr");
});
