import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SUN_SHADE_TINT, sunShadeAt, type SunOccluder } from "../client/src/lib/voxelSunShade";

/** Sütött blokk-árnyék (terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md, 3/a, G-2). A nap a −z irány felől, ≈ 45°-ban süt. */

const MAX_Y = 14;

function world(cells: Record<string, SunOccluder>) {
  return (x: number, y: number, z: number): SunOccluder => cells[`${x},${y},${z}`] ?? 0;
}

describe("sunShadeAt", () => {
  it("szabad ég alatt napos", () => {
    assert.equal(sunShadeAt(world({}), 5, 3, 5, MAX_Y), 0);
  });

  it("a nap felőli átlóban álló tömör blokk árnyékot vet — bármilyen magasan", () => {
    assert.equal(sunShadeAt(world({ "5,4,4": 2 }), 5, 3, 5, MAX_Y), 2);
    assert.equal(sunShadeAt(world({ "5,8,0": 2 }), 5, 3, 5, MAX_Y), 2);
  });

  it("a fatörzs árnyéka a törzstől a naptól elfelé (+z) vetül, a törzs magasságáig", () => {
    const trunk = world({ "5,4,5": 2, "5,5,5": 2, "5,6,5": 2 });
    assert.equal(sunShadeAt(trunk, 5, 3, 6, MAX_Y), 2);
    assert.equal(sunShadeAt(trunk, 5, 3, 8, MAX_Y), 2);
    assert.equal(sunShadeAt(trunk, 5, 3, 9, MAX_Y), 0, "a törzs fölött már átsüt a nap");
    assert.equal(sunShadeAt(trunk, 5, 3, 4, MAX_Y), 0, "a nap felőli oldal világos");
    assert.equal(sunShadeAt(trunk, 6, 3, 6, MAX_Y), 0, "a szomszéd oszlop világos");
  });

  it("csak lomb takarja → lombszűrte félárnyék; lomb mögött tömör → árnyék", () => {
    assert.equal(sunShadeAt(world({ "5,5,3": 1 }), 5, 3, 5, MAX_Y), 1);
    assert.equal(sunShadeAt(world({ "5,5,3": 1, "5,7,1": 2 }), 5, 3, 5, MAX_Y), 2);
  });

  it("a közvetlenül fölötte álló blokk nem árnyékol (a nap felé néző sziklafal világos marad)", () => {
    assert.equal(sunShadeAt(world({ "5,4,5": 2 }), 5, 3, 5, MAX_Y), 0);
  });

  it("a világ tetején álló kockának nincs mi árnyékot vessen", () => {
    assert.equal(sunShadeAt(world({ "5,13,4": 2 }), 5, MAX_Y - 1, 5, MAX_Y), 0);
  });
});

describe("SUN_SHADE_TINT", () => {
  it("árnyalatonként sötétedik, a napos kocka színe változatlan", () => {
    assert.deepEqual(SUN_SHADE_TINT[0], [1, 1, 1]);
    const lum = (t: readonly [number, number, number]) => t[0] + t[1] + t[2];
    assert.ok(lum(SUN_SHADE_TINT[1]!) < lum(SUN_SHADE_TINT[0]!));
    assert.ok(lum(SUN_SHADE_TINT[2]!) < lum(SUN_SHADE_TINT[1]!));
  });
});
