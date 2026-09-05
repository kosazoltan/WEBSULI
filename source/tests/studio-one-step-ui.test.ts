import assert from "node:assert/strict";
import test from "node:test";

import { oneStepSubmitDisabledReason } from "../shared/studio-ui";

/** LS-6 (#164) — one-step button gating: files required, scope optional. */

test("fájl nélkül tiltott", () => {
  assert.equal(oneStepSubmitDisabledReason("", 4, 0), "Tölts fel legalább egy forrásfájlt.");
});

test("csak fájlokkal (scope nélkül) mehet — a gép felismeri a tantárgyat", () => {
  assert.equal(oneStepSubmitDisabledReason("", 4, 2), null);
});

test("kitöltött tantárgy mellett az osztálynak érvényesnek kell lennie", () => {
  assert.equal(oneStepSubmitDisabledReason("Természetismeret", 99, 2), "Az osztály 0 és 12 között lehet.");
  assert.equal(oneStepSubmitDisabledReason("Természetismeret", 4, 2), null);
});
