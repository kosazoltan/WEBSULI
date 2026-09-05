import assert from "node:assert/strict";
import test from "node:test";

import { scopeRequestParams } from "../server/studio/one-step";
import { ocrRequestParams } from "../server/studio/ocr";

/**
 * #165 gyökér-ok regresszió: a glm-flash osztályú modelleknél a reasoning
 * KÖTELEZŐ, és mérve 300 token keretet teljesen elevett (finish=length,
 * content=null) — a scope-felismerés ezért bukott élesben. A kérés-paraméterek
 * pin-elve: alacsony reasoning-effort + elég nagy completion-keret.
 */

test("scope-kérés: reasoning effort low + legalább 2000 token keret", () => {
  const p = scopeRequestParams("z-ai/glm-5.3-flash", [{ type: "text", text: "x" }]);
  assert.equal(p.model, "z-ai/glm-5.3-flash");
  assert.ok(p.max_completion_tokens >= 2000, "a reasoning nem eheti el a választ");
  assert.deepEqual(p.reasoning, { effort: "low" });
});

test("OCR-kérés: reasoning effort low + legalább 4096 token keret", () => {
  const p = ocrRequestParams("z-ai/glm-5.3-flash", "data:image/jpeg;base64,AA");
  assert.ok(p.max_completion_tokens >= 4096);
  assert.deepEqual(p.reasoning, { effort: "low" });
  const userContent = p.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  assert.equal(userContent[0]?.image_url?.url, "data:image/jpeg;base64,AA");
});
