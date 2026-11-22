import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LIGHT_GRAPHICS_MAX_PIXELS, isLightGraphicsFrom, isTouchDeviceFrom, pixelRatioForBudget, scaledPixelRatio } from "../client/src/game-engine/perf/pixelBudget";

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
    assert.equal(isLightGraphicsFrom({ touchDevice: true, tier: "medium", reducedMotion: false, memoryGb: 8 }), false);
    assert.equal(isLightGraphicsFrom({ touchDevice: true, tier: "high", reducedMotion: false, memoryGb: null }), false);
  });

  it("a három jel bármelyike könnyű módot ad", () => {
    assert.equal(isLightGraphicsFrom({ touchDevice: true, tier: "low", reducedMotion: false, memoryGb: 8 }), true);
    assert.equal(isLightGraphicsFrom({ touchDevice: true, tier: "medium", reducedMotion: true, memoryGb: 8 }), true);
    assert.equal(isLightGraphicsFrom({ touchDevice: true, tier: "medium", reducedMotion: false, memoryGb: 4 }), true);
  });
});

describe("könnyű grafika csak érintős eszközön (review F2)", () => {
  it("asztali low szint (≤ 4 mag) nem kap képpont-plafont — a felbontás nem csökken", () => {
    assert.equal(isLightGraphicsFrom({ touchDevice: false, tier: "low", reducedMotion: false, memoryGb: 8 }), false);
    assert.equal(isLightGraphicsFrom({ touchDevice: false, tier: "low", reducedMotion: true, memoryGb: 2 }), false);
  });

  it("érintős telefonon low szinten a plafon hat", () => {
    assert.equal(isLightGraphicsFrom({ touchDevice: true, tier: "low", reducedMotion: false, memoryGb: 8 }), true);
  });

  it("az érintős-eszköz jel: durva mutató és ≤ 1024 px rövidebb oldal", () => {
    assert.equal(isTouchDeviceFrom(true, 412), true);
    assert.equal(isTouchDeviceFrom(true, 1024), true);
    assert.equal(isTouchDeviceFrom(true, 1080), false, "érintős nagy monitor");
    assert.equal(isTouchDeviceFrom(false, 412), false, "egér, kis ablak");
    assert.equal(isTouchDeviceFrom(true, 0), false);
  });
});

describe("scaledPixelRatio — a panel százaléka a plafonos 100 %-hoz képest (2026-11-21 vak kör L3, E-4)", () => {
  it("aktív plafon mellett a 100 / 75 / 50 % három különböző rajzpuffert ad", () => {
    // A vak próba esete: 950×939 CSS px, dpr 2,625, könnyű mód.
    const r100 = scaledPixelRatio(950, 939, 2.625, 1, LIGHT_GRAPHICS_MAX_PIXELS);
    const r75 = scaledPixelRatio(950, 939, 2.625, 0.75, LIGHT_GRAPHICS_MAX_PIXELS);
    const r50 = scaledPixelRatio(950, 939, 2.625, 0.5, LIGHT_GRAPHICS_MAX_PIXELS);
    assert.equal(r100, pixelRatioForBudget(950, 939, 2.625, LIGHT_GRAPHICS_MAX_PIXELS));
    assert.ok(Math.abs(r75 - r100 * 0.75) < 1e-9, `75 %: ${r75} vs ${r100}`);
    assert.ok(Math.abs(r50 - r100 * 0.5) < 1e-9);
    assert.ok(950 * r100 * 939 * r100 <= LIGHT_GRAPHICS_MAX_PIXELS + 1, "a plafon 100 %-on is teljesül");
  });

  it("plafon nélkül az alap arány skálázódik (a korábbi viselkedés)", () => {
    assert.equal(scaledPixelRatio(827, 835, 1.5, 0.75, null), 1.125);
    assert.equal(scaledPixelRatio(827, 835, 1.5, 1, null), 1.5);
  });
});
