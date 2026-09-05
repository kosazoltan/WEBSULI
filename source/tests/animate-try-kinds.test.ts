import assert from "node:assert/strict";
import test from "node:test";

import { ANIM_KINDS, TRY_KINDS } from "../shared/lesson-schema";
import { ANIMATE_REGISTRY } from "../client/src/lesson-runtime/blocks/animate-blocks";
import { TRY_REGISTRY } from "../client/src/lesson-runtime/blocks/try-blocks";

/**
 * LS-4 — every planned animate/try kind must have a renderer (master plan §4).
 *
 * Same class of static guard as screens-defined.test.ts: the schema declares the
 * kinds, the runtime must cover all of them, and a registry that silently loses an
 * entry would otherwise turn a whole block kind into a crash at render time.
 */

test("minden ANIM_KINDS értékhez van renderelő az animációs regiszterben", () => {
  for (const kind of ANIM_KINDS) {
    assert.ok(kind in ANIMATE_REGISTRY, `${kind} hiányzik az ANIMATE_REGISTRY-ből`);
  }
});

test("az animációs regiszter nem ismer nem tervezett fajtát", () => {
  for (const key of Object.keys(ANIMATE_REGISTRY)) {
    assert.ok((ANIM_KINDS as readonly string[]).includes(key), `${key} nincs az ANIM_KINDS-ben`);
  }
});

test("minden TRY_KINDS értékhez van renderelő a gyakorlat-regiszterben", () => {
  for (const kind of TRY_KINDS) {
    assert.ok(kind in TRY_REGISTRY, `${kind} hiányzik a TRY_REGISTRY-ből`);
  }
});

test("a gyakorlat-regiszter nem ismer nem tervezett fajtát", () => {
  for (const key of Object.keys(TRY_REGISTRY)) {
    assert.ok((TRY_KINDS as readonly string[]).includes(key), `${key} nincs a TRY_KINDS-ben`);
  }
});
