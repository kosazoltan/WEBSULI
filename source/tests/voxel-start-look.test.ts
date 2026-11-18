import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generateVoxelWorld, findVoxelSpawn, raycastVoxel, vMineable, lookDirection, pickStartLook, PLAYER_EYE,
  type VoxelGenConfig,
} from "../client/src/lib/voxelcraft";

/**
 * E24 / 3. pont — éles próba: a pálya kezdetén a célkereszt a horizontra nézett, a „Bányász” gomb semmit sem
 * talált, így nem jött kvíz. A kezdő nézés mostantól mindig elérhető, bányászható blokkra mutat.
 */
const CFGS: VoxelGenConfig[] = [1, 2, 3, 4, 5].flatMap((id) =>
  [false, true].map((desert) => ({
    oreMultiplier: 1,
    treeCount: 14 + id * 3,
    surfaceMobCount: id >= 3 ? 3 + id : 2,
    caveMobCount: id >= 4 ? 5 : 0,
    lakeCount: desert ? 2 : 1,
    sandPatchCount: desert ? 6 : 1,
    allowZombies: id >= 3,
  })),
);

test("a generált világokban a kezdő nézés 3,2 blokkon belül bányászható blokkra mutat", () => {
  let fixedByPick = 0;
  let worlds = 0;
  for (const cfg of CFGS) {
    for (let rep = 0; rep < 12; rep++) {
      const w = generateVoxelWorld(cfg);
      const spawn = findVoxelSpawn(w);
      const base = lookDirection(Math.PI * 0.25, -0.15);
      const baseHit = raycastVoxel(w, spawn.x, spawn.y + PLAYER_EYE, spawn.z, base.x, base.y, base.z, 3.2);
      const look = pickStartLook(w, spawn, Math.PI * 0.25, -0.15);
      const d = lookDirection(look.yaw, look.pitch);
      const hit = raycastVoxel(w, spawn.x, spawn.y + PLAYER_EYE, spawn.z, d.x, d.y, d.z, 3.2);
      assert.ok(hit && vMineable(hit.t), `nincs bányászható blokk a kezdő nézésben (${JSON.stringify(cfg)} #${rep})`);
      worlds++;
      if (!(baseHit && vMineable(baseHit.t))) fixedByPick++;
    }
  }
  // Ellenőrzi a teszt érzékenységét: az alap nézés a próbált világok egy részében nem talált (ezt javítja a választás).
  console.log(`pickStartLook: ${fixedByPick}/${worlds} világban kellett a javítás`);
});

test("ha az alap nézés már talál, változatlan marad", () => {
  const w = generateVoxelWorld(CFGS[0]!);
  const spawn = findVoxelSpawn(w);
  for (let i = 0; i < 20; i++) {
    const base = lookDirection(Math.PI * 0.25, -0.15);
    const baseHit = raycastVoxel(w, spawn.x, spawn.y + PLAYER_EYE, spawn.z, base.x, base.y, base.z, 3.2);
    if (baseHit && vMineable(baseHit.t)) {
      assert.deepEqual(pickStartLook(w, spawn, Math.PI * 0.25, -0.15), { yaw: Math.PI * 0.25, pitch: -0.15 });
      return;
    }
  }
});
