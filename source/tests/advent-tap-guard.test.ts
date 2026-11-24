import assert from "node:assert/strict";
import test from "node:test";

import { GUARD_RADIUS_PX, guardSwallows } from "../client/src/advent/tap-guard";

/**
 * Adventi naptár — a „Tovább” utáni védőidő (vak ellenőr KICSI-4): csak a dupla koppintás második felét nyeli el (ugyanazon a
 * ponton), a másik ablakra irányuló szándékos koppintást nem.
 */
test("koppintás: a „Tovább” pontján (sugáron belül) elnyelve, máshol nem", () => {
  const at = { x: 200, y: 600 };
  assert.equal(guardSwallows(at, { pointer: true, x: 200, y: 600 }, false), true);
  assert.equal(guardSwallows(at, { pointer: true, x: 200 + GUARD_RADIUS_PX, y: 600 }, false), true);
  assert.equal(guardSwallows(at, { pointer: true, x: 200 + GUARD_RADIUS_PX + 1, y: 600 }, false), false);
  assert.equal(guardSwallows(at, { pointer: true, x: 60, y: 300 }, true), false, "a megnyitó ablak máshol: szándékos koppintás");
});

test("billentyű / Escape: csak a megnyitó elemre (ide tér vissza a fókusz) visszatérő ismételt Enter nyelődik el", () => {
  assert.equal(guardSwallows(null, { pointer: false, x: 0, y: 0 }, true), true);
  assert.equal(guardSwallows(null, { pointer: false, x: 0, y: 0 }, false), false);
  assert.equal(guardSwallows({ x: 1, y: 1 }, { pointer: false, x: 0, y: 0 }, true), true);
  assert.equal(guardSwallows(null, { pointer: true, x: 5, y: 5 }, false), false, "pont nélkül (billentyűs zárás) a koppintás átmegy");
  assert.equal(guardSwallows(null, { pointer: true, x: 5, y: 5 }, true), false);
});
