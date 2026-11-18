import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LEVEL_STAGES, stormLabel } from "../client/src/lib/tornado/levels";
import { VEHICLE_CATEGORIES, RARITY_LABEL } from "../client/src/lib/tornado/vehicles";
import { COMPASS_POINTS } from "../client/src/lib/tornado/wind";
import { QUIZ_MODE_LABEL } from "../client/src/lib/tornado/questions";

/**
 * E24 — a Tornado Hunter 200 felülete magyar (docs/specs/tornado-hunter-200-2026-09-06.md 14. pont).
 * Őr: a játékos számára látható angol felirat nem szivároghat vissza (nyelvtanulási tartalom és járműnevek kivétel).
 */
const page = readFileSync(new URL("../client/src/pages/TornadoHunter200.tsx", import.meta.url), "utf8");

test("a HUD és a menük forrásában nincs angol felirat", () => {
  for (const banned of [
    "LEVEL {", "WIND SPEED", "STORM:", "ANCHOR:", '"READY"', 'label="Cam"', "Storm Garage", 'title="Highscore"',
    "Total Score", "Best Level", "Tornadoes Intercepted", "Correct Answers", "Best Time", "Levels Completed",
    "Successful Anchors", "Wrong Answers", "Kilometers Traveled", "Maximum Wind Speed", "Longest Intercept",
    "School Level", '"LOW"', '"MEDIUM"', '"HIGH"', "Intercept sikeres", "Sikertelen intercept", "THE ULTIMATE STORM",
  ]) {
    assert.ok(!page.includes(banned), `angol felirat a játékoldalon: ${banned}`);
  }
});

test("a viharfokozatok, kategóriák, ritkaságok, égtájak és kérdéstípusok magyar szövegűek", () => {
  const english = /\b(Light Storm|Beginner|Advanced|Pro|Expert|Master|Extreme|Legendary|Ultimate|THE ULTIMATE STORM|Scout|Interceptor|Heavy|Research|Vehicle|Math|English|Mixed)\b/;
  const labels = [
    ...LEVEL_STAGES.map((s) => s.label),
    ...VEHICLE_CATEGORIES.map((c) => c.label),
    ...Object.values(RARITY_LABEL),
    ...Object.values(QUIZ_MODE_LABEL),
  ];
  for (const l of labels) assert.ok(!english.test(l), `angol felirat: ${l}`);
  assert.deepEqual(COMPASS_POINTS.map((c) => c.label), ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"]);
  assert.equal(stormLabel(51), "HALADÓ");
  assert.equal(stormLabel(200), "VÉGSŐ");
});
