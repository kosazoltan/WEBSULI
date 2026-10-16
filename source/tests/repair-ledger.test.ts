import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_AUTHOR_ROUNDS, MAX_BANK_ONLY_ROUNDS, MAX_CHAIN_STEPS, REPAIR_CHAIN_STEPS, REPAIR_KINDS } from "../server/studio/pipeline";

/* Spec 2026-10-01-javitasi-fokonyv: a körlimit-javítások egyetlen főkönyve — egy tábla, egy olvasó, egy író, egy keret-döntés. */

test("a lánc-korlát a javítás-táblából számolódik, értéke változatlan (35)", () => {
  assert.equal(REPAIR_CHAIN_STEPS, Object.values(REPAIR_KINDS).reduce((n, k) => n + k.limit * k.steps.length, 0));
  assert.equal(MAX_CHAIN_STEPS, 1 + (MAX_AUTHOR_ROUNDS + 1) * 4 + REPAIR_CHAIN_STEPS + 1);
  assert.equal(MAX_CHAIN_STEPS, 35, "a refaktor előtti kézi képlet értéke");
  assert.equal(MAX_BANK_ONLY_ROUNDS, 2);
});
