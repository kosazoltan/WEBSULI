import { test } from "node:test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { PRACTICE_BANK_RULE } from "../shared/practice-rules";
import { GAME_QUIZ_SYSTEM_PROMPT } from "../server/gameQuizGeneratorService";

// GAMEQUIZ-PROMPT-KOZOS (review #640): egy szabály egy helyen — a játékkvíz-generátor a közös gyakorlatiassági szöveget kapja.
test("a játékkvíz-generátor rendszerpromptja a közös PRACTICE_BANK_RULE-t tartalmazza, saját gyakorlatiassági sort nem", () => {
  assert.ok(GAME_QUIZ_SYSTEM_PROMPT.includes(PRACTICE_BANK_RULE));
  assert.doesNotMatch(GAME_QUIZ_SYSTEM_PROMPT, /- GYAKORLATIASSÁG: a tanuló a tanított példán/u);
  assert.match(GAME_QUIZ_SYSTEM_PROMPT, /adj vissza üres tömböt/u, "a játékspecifikus kiegészítés marad");
});

test("review #646: a játékkezelés tilos, a csak meta-adatos (pontozás nélküli) tananyag is üres tömböt ad; mindkét modellhívás a közös promptot küldi", () => {
  assert.match(GAME_QUIZ_SYSTEM_PROMPT, /TILOS a játék kezelésére/u);
  assert.match(GAME_QUIZ_SYSTEM_PROMPT, /feladattípusra, a feladatlap felépítésére vagy a játék kezelésére vonatkozó adatot tartalmaz, adj vissza üres tömböt/u);
  const src = fs.readFileSync("server/gameQuizGeneratorService.ts", "utf8");
  const calls = src.match(/withSupportSkill\("quiz-generator", [A-Z_]+\)/gu) ?? [];
  assert.ok(calls.length >= 2, "mindkét (Anthropic és OpenAI) hívási út");
  assert.ok(calls.every((c) => c.includes("GAME_QUIZ_SYSTEM_PROMPT")), "egyik út sem küld régi promptot");
  assert.doesNotMatch(src, /const SYSTEM_PROMPT = /u, "nincs régi, párhuzamos prompt");
});
