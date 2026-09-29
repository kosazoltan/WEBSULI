import assert from "node:assert/strict";
import test from "node:test";

import { WORD_LADDER_DE } from "../client/src/data/wordLadder/de";
import { ladderBankProblems } from "../client/src/data/wordLadder/validate";

// Spec 2026-09-29-palyak-szoletra-nyelvek (5. döntés, E4): a német Szólétra-bank szerkezete és minimumai.
test("a német bank megfelel a közös validátornak (szerkezet + szint- és kategória-minimumok)", () => {
  assert.deepEqual(ladderBankProblems(WORD_LADDER_DE, "de"), []);
});

test("a helyes válasz helye változatos: mind a négy index előfordul, egyik sem uralkodó", () => {
  const counts = [0, 0, 0, 0];
  for (const item of WORD_LADDER_DE) counts[item.correctIndex]++;
  for (const n of counts) {
    assert.ok(n > 0, `minden index előfordul: ${counts.join("/")}`);
    assert.ok(n < WORD_LADDER_DE.length * 0.4, `egyik index sem uralkodó: ${counts.join("/")}`);
  }
});

test("a kérdés magyar, és mindkét fordítási irány szerepel", () => {
  const toGerman = WORD_LADDER_DE.filter((i) => /németül/u.test(i.prompt)).length;
  const toHungarian = WORD_LADDER_DE.filter((i) => /^Mit jelent/u.test(i.prompt)).length;
  assert.ok(toGerman >= 50, `magyar → német kérdések: ${toGerman}`);
  assert.ok(toHungarian >= 50, `német → magyar kérdések: ${toHungarian}`);
  for (const item of WORD_LADDER_DE) {
    assert.match(item.prompt, /[áéíóöőúüű]|németül|Mit jelent|Melyik|Hogyan|Mi /u, `${item.id}: magyar kérdés`);
  }
});
