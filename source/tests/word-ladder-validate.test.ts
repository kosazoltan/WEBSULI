import assert from "node:assert/strict";
import test from "node:test";

import type { LadderItem } from "../client/src/data/wordLadder/types";
import { ladderBankProblems } from "../client/src/data/wordLadder/validate";

// Spec 2026-09-29-palyak-szoletra-nyelvek (5. döntés): a közös bank-validátor önellenőrzése.
const good: LadderItem = {
  id: "de0-001", tier: 0, category: "word", prompt: "„Kutya” németül:", options: ["die Katze", "der Hund", "das Pferd", "die Maus"],
  correctIndex: 1, explanation: "A kutya németül der Hund — hímnemű főnév, ezért der névelővel és nagy kezdőbetűvel írjuk.",
};

test("helyes tétel: nincs szerkezeti hiba (minimumok nélkül)", () => {
  assert.deepEqual(ladderBankProblems([good], "de", { checkMinimums: false }), []);
});

test("a hibás tételeket név szerint jelzi", () => {
  const bad: LadderItem[] = [
    { ...good, id: "fr0-001" },
    { ...good, id: "de1-002" },
    { ...good, id: "de0-003", options: ["a", "a", "b", "c"] },
    { ...good, id: "de0-004", prompt: "„Macska” németül:", correctIndex: 4 },
    { ...good, id: "de0-005", prompt: "„Ló” németül:", explanation: "Rövid." },
    { ...good, id: "de0-006", prompt: "„Egér” németül:", explanation: "Az első válasz a helyes, mert ez a leggyakoribb ilyen szó itt." },
    { ...good, id: "de0-007", prompt: "„Madár” németül:", explanation: "Ez a magyarázat nem mondja ki a helyes választ egyáltalán, csak kerülget." },
  ];
  const problems = ladderBankProblems(bad, "de", { checkMinimums: false }).join("\n");
  assert.match(problems, /fr0-001: az azonosító alakja/);
  assert.match(problems, /de1-002: az azonosító szintje eltér/);
  assert.match(problems, /de0-003: ismétlődő opció/);
  assert.match(problems, /de0-004: a helyes index/);
  assert.match(problems, /de0-005: a magyarázat 30–300/);
  assert.match(problems, /de0-006: a magyarázat sorrendre hivatkozik/);
  assert.match(problems, /de0-007: a magyarázat nem említi/);
});

test("a minimumokat szintenként és kategóriánként méri", () => {
  const problems = ladderBankProblems([good], "de").join("\n");
  assert.match(problems, /0\. szinten 1 tétel \(legalább 124\)/);
  assert.match(problems, /„irregular” kategóriában 0 tétel/);
});
