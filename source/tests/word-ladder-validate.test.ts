import assert from "node:assert/strict";
import test from "node:test";

import type { LadderItem } from "../client/src/data/wordLadder/types";
import { ladderBankProblems } from "../client/src/data/wordLadder/validate";

// Spec 2026-09-29-palyak-szoletra-nyelvek (5. döntés): a közös bank-validátor önellenőrzése.
const good: LadderItem = {
  id: "de0-001", tier: 0, category: "word", prompt: "„Kutya” németül:", options: ["die Katze", "der Hund", "das Pferd", "die Maus"],
  correctIndex: 1, explanation: "A kutya németül der Hund — hímnemű főnév, ezért der névelővel és nagy kezdőbetűvel írjuk.",
  // SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag): az idézőjeles kérdés célrésze (focus) kötelező mező lett.
  focus: "Kutya",
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

test("célrész (focus): a prompt rész-szövege, nem üres, hiányos mondatnál a hiánnyal; idézőjeles / kettőspontos kérdésnél kötelező", () => {
  const { focus: _goodFocus, ...plain } = good;
  void _goodFocus;
  const situation: LadderItem = { ...plain, id: "de0-010", prompt: "Ajándékot kaptál. Mit mondasz németül?", options: ["Danke!", "Bitte!", "Hallo!", "Tschüss!"], correctIndex: 0, explanation: "Ha ajándékot kapsz, azt mondod: Danke! — köszönöm." };
  assert.deepEqual(ladderBankProblems([situation], "de", { checkMinimums: false }), [], "helyzetleírásnál nincs célrész");
  const bad: LadderItem[] = [
    { ...good, id: "de0-011", prompt: "„Hal” németül:", focus: "Macska" },
    { ...good, id: "de0-012", prompt: "„Ló” németül:", focus: "  " },
    { ...good, id: "de0-013", prompt: "Egészítsd ki: „Ich ___ müde.”", focus: "Ich" },
    { ...plain, id: "de0-014", prompt: "„Egér” németül:" },
    { ...plain, id: "de0-015", prompt: "Mit jelent: die Maus?" },
  ];
  const problems = ladderBankProblems(bad, "de", { checkMinimums: false }).join("\n");
  assert.match(problems, /de0-011: a célrész \(focus\) nem rész-szövege/);
  assert.match(problems, /de0-012: üres célrész/);
  assert.match(problems, /de0-013: hiányos mondatnál a célrész tartalmazza a hiányt/);
  assert.match(problems, /de0-014: hiányzik a célrész/);
  assert.match(problems, /de0-015: hiányzik a célrész/);
});

test("a három valódi kézi bank minden tételének célrésze érvényes (szerkezeti őr az adatfájlokra)", async () => {
  const { WORD_LADDER_EN } = await import("../client/src/data/wordLadder/en");
  const { WORD_LADDER_DE } = await import("../client/src/data/wordLadder/de");
  const { WORD_LADDER_FR } = await import("../client/src/data/wordLadder/fr");
  for (const [lang, items] of [["en", WORD_LADDER_EN], ["de", WORD_LADDER_DE], ["fr", WORD_LADDER_FR]] as const) {
    const focusProblems = ladderBankProblems(items, lang, { checkMinimums: false }).filter((p) => /célrész/.test(p));
    assert.deepEqual(focusProblems, [], lang);
    assert.ok(items.filter((i) => i.focus).length / items.length > 0.85, `${lang}: a tételek nagy része célrészes`);
  }
});

test("a minimumokat szintenként és kategóriánként méri", () => {
  const problems = ladderBankProblems([good], "de").join("\n");
  assert.match(problems, /0\. szinten 1 tétel \(legalább 124\)/);
  assert.match(problems, /„irregular” kategóriában 0 tétel/);
});
