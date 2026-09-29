import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { followHeight } from "../client/src/lib/tornado/drive";

// Review PR #140: újraindításkor / szintváltáskor a kamera talajreferenciája nullázódjon, különben a kamera a régi
// hely magasságáról siklik át (a ≤ 8 egységes különbség nem váltja ki a snap-ágat; cockpit módban a talajba lóghat).
const page = readFileSync(new URL("../client/src/pages/TornadoHunter200.tsx", import.meta.url), "utf8");

test("minden játékos-teleport után a kamera talajreferenciája NaN-ra áll (a következő képkocka azonnal az új talajon)", () => {
  const teleports = [...page.matchAll(/playerRef\.current = \{ x: [^\n]*\n/g)];
  assert.ok(teleports.length >= 2, `teleportok: ${teleports.length}`);
  for (const t of teleports) {
    const after = page.slice(t.index! + t[0].length, t.index! + t[0].length + 400);
    assert.match(after, /camGroundRef\.current = Number\.NaN/, `a teleport után nincs kamera-nullázás: ${t[0].trim()}`);
  }
});

test("followHeight: NaN előzményből azonnal az új talaj (a nullázás így snap)", () => {
  assert.equal(followHeight(Number.NaN, 3.53, 1 / 60), 3.53);
  assert.notEqual(followHeight(0, 3.53, 1 / 60), 3.53, "véges előzményből kis különbségnél csak simít");
});
