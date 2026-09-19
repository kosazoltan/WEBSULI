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

/* ------------------------------------------------------------------------- *
 * Spec 2026-09-19 — autonomousApprovalDecision: az egylépéses futás nem parkol
 * emberre. A pending kulcsfogalom látható marad, de kimarad a tanításból; a térkép
 * akkor hagyható jóvá, ha van igazolt kulcsfogalom és az igazoltak aránya ≥ 60 %.
 * A kézi `canApprove` változatlan.
 * ------------------------------------------------------------------------- */

import { autonomousApprovalDecision, AUTONOMOUS_MIN_VERIFIED_RATIO, sourceGapNote } from "../server/studio/auto-approve";

const core = (id: string, reviewState: "pending" | "kept" | "edited" | "rejected", term = id) =>
  ({ id, term, examWeight: "core" as const, verbatimOk: reviewState !== "pending", reviewState });

test("autonóm: 3 pending kulcsfogalom 49-ből → jóváhagyás, a 3 kimarad és névvel jelezve", () => {
  const concepts = [
    ...Array.from({ length: 46 }, (_, i) => core(`c${i}`, "kept")),
    core("hagymafej", "pending", "hagymafej"),
    core("karogyoker", "pending", "karógyökér"),
    core("hagymafej-felepitese", "pending", "a hagymafej felépítése"),
  ];
  const decision = autonomousApprovalDecision(concepts);
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.deepEqual(decision.excluded.map(c => c.id), ["hagymafej", "karogyoker", "hagymafej-felepitese"]);
  assert.equal(decision.verifiedCore, 46);
  const note = sourceGapNote(decision.excluded)!;
  assert.match(note, /3 fogalom idézete nem igazolható/);
  assert.match(note, /hagymafej, karógyökér, a hagymafej felépítése/);
  // A kézi kapu ugyanerre továbbra is emberre vár.
  assert.equal(canApprove(concepts).ok, false);
});

test("autonóm: nincs igazolt kulcsfogalom → valódi hiba, nem parkolás", () => {
  const decision = autonomousApprovalDecision([core("a", "pending"), core("b", "pending"), { id: "s", examWeight: "supporting", verbatimOk: true, reviewState: "kept" }]);
  assert.equal(decision.ok, false);
  if (decision.ok) return;
  assert.match(decision.reason, /túl bizonytalan/);
});

test("autonóm: az igazolt arány a küszöb alatt → hiba; elutasított fogalom nem számít élőnek", () => {
  assert.equal(AUTONOMOUS_MIN_VERIFIED_RATIO, 0.6);
  const below = autonomousApprovalDecision([core("k1", "kept"), core("p1", "pending"), core("p2", "pending")]);
  assert.equal(below.ok, false);
  const rejectedIgnored = autonomousApprovalDecision([core("k1", "kept"), core("e1", "edited"), core("r1", "rejected"), core("r2", "rejected")]);
  assert.equal(rejectedIgnored.ok, true);
  if (rejectedIgnored.ok) assert.equal(rejectedIgnored.liveCount, 2);
  assert.equal(sourceGapNote([]), null);
});
