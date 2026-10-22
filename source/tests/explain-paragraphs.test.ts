import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EXPLAIN_LONG_CHARS, explainIsLong, explainParagraphs } from "../client/src/lesson-runtime/explain-paragraphs";

// Review #368 (spec 2026-10-22-lecke-szeles-elrendezes): a hasábváltás csak bekezdéshatáron — bekezdés sosem törik ketté.
test("a magyarázat bekezdései az üres soroknál válnak szét", () => {
  assert.deepEqual(explainParagraphs("Első.\n\nMásodik.\n  \nHarmadik."), ["Első.", "Második.", "Harmadik."]);
  assert.deepEqual(explainParagraphs("Egy sor.\nUgyanaz a bekezdés."), ["Egy sor.\nUgyanaz a bekezdés."]);
});

test("két hasáb csak hosszú ÉS többbekezdéses magyarázatnak", () => {
  const long = "x".repeat(EXPLAIN_LONG_CHARS + 1);
  assert.equal(explainIsLong(long), false, "egyetlen hosszú bekezdés nem kap hasábot");
  assert.equal(explainIsLong(`${long}\n\nMásodik bekezdés.`), true);
  assert.equal(explainIsLong("Rövid.\n\nKét bekezdés."), false, "rövid szöveg nem kap hasábot");
});

test("a CSS a hasábos magyarázatban nem engedi a bekezdés kettétörését", () => {
  const css = fs.readFileSync("client/src/lesson-runtime/lesson-experience.css", "utf8");
  assert.doesNotMatch(css, /\[data-long\] > p \{ break-inside: auto/);
  assert.match(css, /\[data-block="explain"\]\[data-long\] > \* \{ break-inside: avoid; \}/);
});
