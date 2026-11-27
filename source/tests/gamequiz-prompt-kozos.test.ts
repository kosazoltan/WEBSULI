import { test } from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_BANK_RULE } from "../shared/practice-rules";
import { GAME_QUIZ_SYSTEM_PROMPT } from "../server/gameQuizGeneratorService";

// GAMEQUIZ-PROMPT-KOZOS (review #640): egy szabály egy helyen — a játékkvíz-generátor a közös gyakorlatiassági szöveget kapja.
test("a játékkvíz-generátor rendszerpromptja a közös PRACTICE_BANK_RULE-t tartalmazza, saját gyakorlatiassági sort nem", () => {
  assert.ok(GAME_QUIZ_SYSTEM_PROMPT.includes(PRACTICE_BANK_RULE));
  assert.doesNotMatch(GAME_QUIZ_SYSTEM_PROMPT, /- GYAKORLATIASSÁG: a tanuló a tanított példán/u);
  assert.match(GAME_QUIZ_SYSTEM_PROMPT, /adj vissza üres tömböt/u, "a játékspecifikus kiegészítés marad");
});
