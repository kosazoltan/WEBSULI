import assert from "node:assert/strict";
import test from "node:test";

import { WORD_LADDER_FR } from "../client/src/data/wordLadder/fr";
import { ladderBankProblems } from "../client/src/data/wordLadder/validate";

// Spec 2026-09-29-palyak-szoletra-nyelvek (5. döntés, D szelet): a francia Szólétra-bank.

test("francia bank: nincs szerkezeti hiba, a szint- és kategória-minimumok teljesülnek", () => {
  assert.deepEqual(ladderBankProblems(WORD_LADDER_FR, "fr"), []);
});

test("francia írásjel: a ? ! : ; előtt nem törő szóköz áll, sima szóköz nem", () => {
  const bad = WORD_LADDER_FR.flatMap((item) =>
    [item.prompt, ...item.options, item.explanation ?? ""].filter((s) => / [?!:;]/.test(s)).map((s) => `${item.id}: ${s}`),
  );
  assert.deepEqual(bad, []);
});

test("a helyes válasz helye változatos: mind a 4 index előfordul, egyik sem több 40%-nál", () => {
  const counts = [0, 0, 0, 0];
  for (const item of WORD_LADDER_FR) counts[item.correctIndex]++;
  for (const n of counts) {
    assert.ok(n > 0, `üres index: ${counts.join("/")}`);
    assert.ok(n / WORD_LADDER_FR.length <= 0.4, `túl gyakori index: ${counts.join("/")}`);
  }
});
