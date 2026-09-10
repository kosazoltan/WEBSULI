import assert from "node:assert/strict";
import test from "node:test";

import { autoReviewDecision, summarizeAutoReview } from "../server/studio/auto-approve";
import { canApprove } from "../server/studio/extractor";

/**
 * #174 — az egylépeses gyártás gépi kurálása. A tulajdonos EGY gombot akar:
 * feltöltés → kész tananyag. A D1-kapu nem gyengül: az igazolt idézetű fogalom
 * elfogadva, a nem igazolható KULCSfogalom átnézésre vár (nem tanítjuk), a nem
 * igazolható kiegészítő megmarad (a kaput nem blokkolja).
 */

test("igazolt idézet → elfogadva (kept), súlytól függetlenül", () => {
  assert.equal(autoReviewDecision({ examWeight: "core", verbatimOk: true }), "kept");
  assert.equal(autoReviewDecision({ examWeight: "supporting", verbatimOk: true }), "kept");
});

test("nem igazolható KULCSfogalom látható és blokkoló marad, nem tűnhet el a teljességből", () => {
  const unresolved = { id: "missing-source", examWeight: "core" as const, verbatimOk: false };
  assert.equal(autoReviewDecision(unresolved), "pending");
  const reviewed = [unresolved, { id: "verified", examWeight: "core" as const, verbatimOk: true }]
    .map(c => ({ ...c, reviewState: autoReviewDecision(c) }));
  assert.equal(reviewed.length, 2);
  assert.equal(canApprove(reviewed).ok, false);
  const fixed = reviewed.map(c => ({ ...c, verbatimOk: true, reviewState: autoReviewDecision({ ...c, verbatimOk: true }) }));
  assert.equal(canApprove(fixed).ok, true);
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
  assert.deepEqual(s, { kept: 2, pending: 1 });
});
