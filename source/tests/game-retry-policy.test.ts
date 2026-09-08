import assert from "node:assert/strict";
import test from "node:test";

import {
  RETRY_XP_FACTOR,
  canRetry,
  scoreCorrectAnswer,
  xpForAttempt,
} from "../client/src/game-engine/retry-policy";

test("canRetry: első próbán élet nélkül nincs újrapróba", () => {
  assert.equal(canRetry({ attempt: 0, remainingLives: 0 }), false);
});

test("canRetry: első próbán megmaradt élettel jár az újrapróba", () => {
  assert.equal(canRetry({ attempt: 0, remainingLives: 2 }), true);
});

test("canRetry: második próba után nincs újabb retry", () => {
  assert.equal(canRetry({ attempt: 1, remainingLives: 2 }), false);
});

test("canRetry: élet nélküli játékoknál egy mastery-retry még jár", () => {
  assert.equal(canRetry({ attempt: 0 }), true);
  assert.equal(canRetry({ attempt: 1 }), false);
});

test("xpForAttempt: első próba teljes pont", () => {
  assert.equal(xpForAttempt(100, 0), 100);
});

test("xpForAttempt: későbbi próba felezett pont", () => {
  assert.equal(xpForAttempt(100, 1), Math.round(100 * RETRY_XP_FACTOR));
});

test("scoreCorrectAnswer: első próbán base+bónuszok", () => {
  assert.equal(
    scoreCorrectAnswer({ attempt: 0, base: 30, speedBonus: 10, comboBonus: 8 }),
    48,
  );
});

test("scoreCorrectAnswer: retry-n csak a felezett alappont", () => {
  assert.equal(
    scoreCorrectAnswer({ attempt: 1, base: 30, speedBonus: 10, comboBonus: 8 }),
    xpForAttempt(30, 1),
  );
});
