import assert from "node:assert/strict";
import test from "node:test";

import { autoReviewDecision, summarizeAutoReview } from "../server/studio/auto-approve";

/**
 * #174 — az egylépeses gyártás gépi kurálása. A tulajdonos EGY gombot akar:
 * feltöltés → kész tananyag. A D1-kapu nem gyengül: az igazolt idézetű fogalom
 * elfogadva, a nem igazolható KULCSfogalom kihúzva (nem tanítjuk), a nem
 * igazolható kiegészítő megmarad (a kaput nem blokkolja).
 */

test("igazolt idézet → elfogadva (kept), súlytól függetlenül", () => {
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk: true }), "kept");
  assert.equal(autoReviewDecision({ examWeight: "supporting", verbatimOk: true }), "kept");
});

test("nem igazolható KULCSfogalom → kihúzva (rejected) — D1: nem tanítunk igazolatlan állítást", () => {
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk: false }), "rejected");
});

test("nem igazolható kiegészítő fogalom → megmarad (kept), a kaput nem blokkolja", () => {
  assert.equal(autoReviewDecision({ examWeight: "supporting", verbatimOk: false }), "kept");
});

test("összegzés: darabszámok a futás-jelzőnek", () => {
  const s = summarizeAutoReview([
    { examWeight: "core", verbatimOk: true },
    { examWeight: "core", verbatimOk: false },
    { examWeight: "supporting", verbatimOk: false },
  ]);
  assert.deepEqual(s, { kept: 2, rejected: 1 });
});
