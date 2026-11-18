import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FrameWindow, fmt, isLoopRunning, median, megapixels, perfEnabledFrom, shortUserAgent } from "../client/src/game-engine/perf/perfStats";

/** `?perf=1` diagnosztika — a tiszta számolás (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz). */

describe("perfEnabledFrom", () => {
  it("csak a pontos perf=1 paraméterre kapcsol be", () => {
    assert.equal(perfEnabledFrom("?perf=1"), true);
    assert.equal(perfEnabledFrom("?look=low&perf=1"), true);
    assert.equal(perfEnabledFrom("?perf=0"), false);
    assert.equal(perfEnabledFrom("?perf=true"), false);
    assert.equal(perfEnabledFrom("?perfx=1"), false);
    assert.equal(perfEnabledFrom(""), false);
  });
});

describe("FrameWindow", () => {
  it("üresen nincs összegzés", () => {
    assert.equal(new FrameWindow().summary(), null);
  });

  it("egyenletes 60 Hz-es mintán 60 fps az átlag és az 1 % low is", () => {
    const w = new FrameWindow();
    for (let i = 0; i < 240; i++) w.push({ dt: 1000 / 60, js: 2, render: 3 });
    const s = w.summary()!;
    assert.equal(s.frames, 240);
    assert.ok(Math.abs(s.fpsAvg - 60) < 0.01);
    assert.ok(Math.abs(s.fpsLow1 - 60) < 0.01);
    assert.ok(Math.abs(s.dtMin - 1000 / 60) < 0.01);
    assert.ok(Math.abs(s.jsAvg - 2) < 1e-6);
    assert.ok(Math.abs(s.renderAvg - 3) < 1e-6);
  });

  it("az 1 % low a leglassabb képkockát mutatja, az átlag alig mozdul", () => {
    const w = new FrameWindow();
    for (let i = 0; i < 99; i++) w.push({ dt: 10, js: 1, render: 1 });
    w.push({ dt: 100, js: 1, render: 1 });
    const s = w.summary()!;
    assert.ok(Math.abs(s.fpsLow1 - 10) < 0.01, `fpsLow1 = ${s.fpsLow1}`);
    assert.ok(Math.abs(s.fpsAvg - (1000 * 100) / 1090) < 0.01);
    assert.equal(s.dtP50, 10);
    assert.equal(s.dtP95, 10);
    assert.equal(s.dtMin, 10);
  });

  it("a kapacitás fölött a legrégebbi képkockák kiesnek", () => {
    const w = new FrameWindow(10);
    for (let i = 0; i < 10; i++) w.push({ dt: 100, js: 0, render: 0 });
    for (let i = 0; i < 10; i++) w.push({ dt: 20, js: 0, render: 0 });
    const s = w.summary()!;
    assert.equal(w.size, 10);
    assert.equal(s.frames, 10);
    assert.ok(Math.abs(s.fpsAvg - 50) < 0.01);
    w.clear();
    assert.equal(w.summary(), null);
  });
});

describe("shortUserAgent", () => {
  const androidChrome = "Mozilla/5.0 (Linux; Android 16; MHG-NX9 Build/HONORMHG-N49) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.102 Mobile Safari/537.36";

  it("Android Chrome: böngésző + főverzió, rendszer + főverzió, modell nélkül", () => {
    const out = shortUserAgent(androidChrome);
    assert.equal(out, "Chrome 142 · Android 16");
    assert.ok(!out.includes("MHG"), "az eszközmodell nem kerülhet a kimenetbe");
    assert.ok(!out.includes("Build"));
  });

  it("gyártói böngésző és WebView felismerése", () => {
    assert.equal(
      shortUserAgent("Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 HonorBrowser/8.1"),
      "Honor böngésző 8 · Android 15",
    );
    assert.equal(
      shortUserAgent("Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36"),
      "Chrome 128 (WebView) · Android 14",
    );
  });

  it("iOS Safari és asztali Chrome", () => {
    assert.equal(
      shortUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"),
      "Safari 18 · iOS 18",
    );
    assert.equal(
      shortUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"),
      "Chrome 142 · Windows",
    );
  });

  it("ismeretlen szövegre nem dob", () => {
    assert.equal(shortUserAgent(""), "ismeretlen");
  });
});

describe("megapixels, fmt, median", () => {
  it("megapixel két tizedesre", () => {
    assert.equal(megapixels(1240, 1252), 1.55);
    assert.equal(megapixels(0, 0), 0);
  });

  it("a hiányzó érték „n. a.”", () => {
    assert.equal(fmt(null), "n. a.");
    assert.equal(fmt(Number.NaN), "n. a.");
    assert.equal(fmt(16.666, 1), "16.7");
    assert.equal(fmt(3, 0), "3");
  });

  it("medián", () => {
    assert.equal(median([]), null);
    assert.equal(median([5, 1, 9]), 5);
    assert.equal(median([4, 1, 3, 2]), 2);
  });
});

describe("isLoopRunning", () => {
  it("gyors huroknál 1 s a küszöb", () => {
    assert.equal(isLoopRunning(16, 16.7), true);
    assert.equal(isLoopRunning(999, 16.7), true);
    assert.equal(isLoopRunning(1000, 16.7), false, "szünet: 1 s óta nincs képkocka");
  });

  it("lassú, de futó hurok (> 1 s / képkocka — szoftveres megjelenítő) nem „áll” (PR #504 CI)", () => {
    assert.equal(isLoopRunning(1400, 1500), true);
    assert.equal(isLoopRunning(2900, 1500), true);
    assert.equal(isLoopRunning(4500, 1500), false, "három képkockányi csend után áll");
  });

  it("képkocka nélkül vagy értelmetlen bemenetre az 1 s-os küszöb él, és nem dob", () => {
    assert.equal(isLoopRunning(500, 0), true);
    assert.equal(isLoopRunning(16_000, 600_000), false, "szünet utáni óriási rés legfeljebb 15 s-ig számít");
    assert.equal(isLoopRunning(14_000, 600_000), true);
    assert.equal(isLoopRunning(1500, Number.NaN), false);
    assert.equal(isLoopRunning(Number.NaN, 16), false);
  });
});
