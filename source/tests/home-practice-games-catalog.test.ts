import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Audit #3 — the home-page practice grid must list every playable game.
 * Dominik lands on `/`, not `/games`. A catalogue of 7 with a home grid of 5
 * hides Tornado Hunter and the asteroid quiz from the child's first screen.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const src = readFileSync(join(root, "client/src/components/HomePracticeGames.tsx"), "utf8");

const REQUIRED_HREFS = [
  "/games/tsunami-english",
  "/games/word-ladder-hu-en",
  "/games/block-craft-quiz",
  "/games/speed-quiz-math",
  "/games/brain-rot-steal",
  "/games/space-asteroid-quiz",
  "/games/tornado-hunter-200",
] as const;

test("a főoldali gyakorló lista tartalmazza a 7 játszható játék href-jét", () => {
  for (const href of REQUIRED_HREFS) {
    assert.ok(src.includes(`href="${href}`), `hiányzik a főoldalról: ${href}`);
  }
});

test("tornado-hunter-200 és space-asteroid-quiz külön is ki van kötve", () => {
  assert.ok(src.includes("/games/tornado-hunter-200"));
  assert.ok(src.includes("/games/space-asteroid-quiz"));
});
