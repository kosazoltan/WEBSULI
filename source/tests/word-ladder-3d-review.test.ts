import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Review PR #145 (spec 2026-09-29-palyak-szoletra-nyelvek, 7. döntés): olvashatóság és billentyűzetes hozzáférés.
const board = readFileSync(new URL("../client/src/game-engine/scenes/QuizBoard3D.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/WordLadderHuEn.tsx", import.meta.url), "utf8");

test("a 3D kérdéstábla betűje helyhiánynál sem megy a kérdés-minimum (QUIZ3D_PROMPT_FONT_PX) alá", () => {
  assert.doesNotMatch(board, /fontPx\s*=\s*QUIZ3D_OPTION_FONT_PX\s*;/, "a kérdés betűjét nem szabad a válaszméretre csökkenteni");
});

test("3D módban a fókuszált válaszgomb látható, nem box-shadow-alapú körvonalat kap", () => {
  const rule = page.match(/\[data-quiz3d="true"\] \.wl-answers button:focus-visible\s*\{[^}]*\}/);
  assert.ok(rule, "hiányzik a 3D módú :focus-visible szabály");
  assert.match(rule![0], /outline:\s*\d+px solid/);
  assert.doesNotMatch(rule![0], /outline:\s*none/);
});
