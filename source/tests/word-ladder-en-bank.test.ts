import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as extras from "../client/src/data/englishGameQuizExtras";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { LADDER_CATEGORIES, LADDER_CATEGORY_MINIMUMS, LADDER_TIER_MINIMUMS } from "../client/src/data/wordLadder/types";
import { ladderBankProblems } from "../client/src/data/wordLadder/validate";

/** Spec 2026-09-29-palyak-szoletra-nyelvek, 5. döntés és E4 — az angol bank (B szelet). */

test("E4: az angol bank megfelel a közös validátornak (szerkezet, szint- és kategória-minimumok)", () => {
  assert.deepEqual(ladderBankProblems(WORD_LADDER_EN, "en"), []);
});

test("E4: a bank nagyobb a régi 468 tételnél, és minden szint- és kategória-minimumot elér", () => {
  assert.ok(WORD_LADDER_EN.length > 468, `${WORD_LADDER_EN.length} tétel`);
  for (const tier of [0, 1, 2, 3, 4] as const) {
    assert.ok(WORD_LADDER_EN.filter((q) => q.tier === tier).length >= LADDER_TIER_MINIMUMS[tier]);
  }
  for (const c of LADDER_CATEGORIES) {
    assert.ok(WORD_LADDER_EN.filter((q) => q.category === c).length >= LADDER_CATEGORY_MINIMUMS[c], c);
  }
});

test("4. döntés: a prompt mindkét irányban szerepel (magyar → angol és angol → magyar)", () => {
  const toForeign = WORD_LADDER_EN.filter((q) => /angolul/i.test(q.prompt)).length;
  const toHungarian = WORD_LADDER_EN.filter((q) => /jelent/i.test(q.prompt)).length;
  assert.ok(toForeign >= 60, `magyar → angol: ${toForeign}`);
  assert.ok(toHungarian >= 60, `angol → magyar: ${toHungarian}`);
});

test("5. döntés: egy tétel egy sor az en.ts-ben (a forrás-szkennerek soronként olvasnak)", () => {
  const src = readFileSync(fileURLToPath(new URL("../client/src/data/wordLadder/en.ts", import.meta.url)), "utf8");
  const lines = src.split(/\r?\n/).filter((l) => /^\s*\{ id: "en[0-4]-\d{3}"/.test(l));
  assert.equal(lines.length, WORD_LADDER_EN.length);
  for (const l of lines) assert.match(l, /correctIndex: \d, explanation: ".+" \},$/);
});

test("a régi englishGameQuizExtras Szólétra-exportjai a bank szintjeinek aliasai", () => {
  const byTier = (t: number) => WORD_LADDER_EN.filter((q) => q.tier === t).map((q) => q.id);
  assert.deepEqual(extras.wordLadderEasyMore.map((q) => q.id), byTier(0));
  assert.deepEqual(extras.wordLadderMedMore.map((q) => q.id), byTier(1));
  assert.deepEqual(extras.wordLadderHardMore.map((q) => q.id), byTier(2));
  assert.deepEqual(extras.wordLadderB1.map((q) => q.id), byTier(3));
  assert.deepEqual(extras.wordLadderB2.map((q) => q.id), byTier(4));
});
