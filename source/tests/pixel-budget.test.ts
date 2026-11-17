import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LIGHT_GRAPHICS_MAX_PIXELS, isLightGraphicsFrom, pixelRatioForBudget } from "../client/src/game-engine/perf/pixelBudget";

/** Képpontszám-plafon és „könnyű grafika” (terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md, 3/f, G-5, G-6). */

describe("pixelRatioForBudget", () => {
  it("plafon nélkül a szint képpontaránya marad (a felbontás alapértéke nem csökken)", () => {
    assert.equal(pixelRatioForBudget(827, 835, 1.5, null), 1.5);
  });

  it("ha a kép belefér a plafonba, az arány nem változik", () => {
    assert.equal(pixelRatioForBudget(390, 844, 1.5, LIGHT_GRAPHICS_MAX_PIXELS), 1.5);
  });

  it("a kihajtott nézet könnyű módban legfeljebb 1,0 Mpx, a képarány változatlan", () => {
    const ratio = pixelRatioForBudget(827, 835, 1.5, LIGHT_GRAPHICS_MAX_PIXELS);
    assert.ok(ratio < 1.5 && ratio > 1);
    const pixels = 827 * ratio * 835 * ratio;
    assert.ok(pixels <= LIGHT_GRAPHICS_MAX_PIXELS + 1, `képpont: ${pixels}`);
    assert.ok(pixels > LIGHT_GRAPHICS_MAX_PIXELS * 0.99);
  });

  it("nulla méretű (rejtett) vászonnál és értelmetlen plafonnál nem oszt nullával", () => {
    assert.equal(pixelRatioForBudget(0, 0, 1.5, LIGHT_GRAPHICS_MAX_PIXELS), 1.5);
    assert.equal(pixelRatioForBudget(827, 835, 1.5, 0), 1.5);
  });

  it("soha nem ad nagyobb arányt az alapnál", () => {
    assert.equal(pixelRatioForBudget(100, 100, 1, 10_000_000), 1);
  });
});

describe("isLightGraphicsFrom", () => {
  it("erős telefon (medium szint, 8 GB) nem könnyű mód — a felbontása változatlan", () => {
    assert.equal(isLightGraphicsFrom({ tier: "medium", reducedMotion: false, memoryGb: 8 }), false);
    assert.equal(isLightGraphicsFrom({ tier: "high", reducedMotion: false, memoryGb: null }), false);
  });

  it("a három jel bármelyike könnyű módot ad", () => {
    assert.equal(isLightGraphicsFrom({ tier: "low", reducedMotion: false, memoryGb: 8 }), true);
    assert.equal(isLightGraphicsFrom({ tier: "medium", reducedMotion: true, memoryGb: 8 }), true);
    assert.equal(isLightGraphicsFrom({ tier: "medium", reducedMotion: false, memoryGb: 4 }), true);
  });
});
