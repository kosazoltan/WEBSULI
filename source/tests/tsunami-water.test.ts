import assert from "node:assert/strict";
import test from "node:test";

import { ANSWER_ARM_MS, WATER_LOSE, WATER_MIN, WATER_START, WATER_TUNING, ZONE_HALF, createTsunamiDriver, createWaterCore, tsunamiDirectorConfig } from "../client/src/lib/tsunami/water";

/**
 * Szökőár — az emelkedő víz magja (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md, D1 / D4; végrehajtás 1. lépés).
 * A futó-mag (`core.ts`) tesztjeinek helyén: ugyanaz a mérce (determinizmus, élesítés, kérdés alatti lassítás, vesztési és
 * győzelmi feltétel), a vízre mérve.
 */

const STEP = 1000 / 60;

function run(core: ReturnType<typeof createWaterCore>, ms: number): void {
  for (let t = 0; t < ms; t += STEP) core.step(STEP);
}

test("a víz magától emelkedik, és a vesztési vonalnál a menet véget ér", () => {
  const core = createWaterCore({ seed: 1, difficulty: "normal" });
  assert.equal(core.state().water, WATER_START);
  run(core, 5_000);
  assert.ok(core.state().water > WATER_START, "5 mp alatt emelkedett");
  run(core, 600_000);
  assert.equal(core.state().phase, "lost");
  assert.equal(core.state().water, WATER_LOSE);
  assert.equal(core.running(), false);
});

test("D4: jó válasz → a víz apad (waterDrop), rossz / lejárt → ugrik (waterSurge); megszakított → semmi", () => {
  const core = createWaterCore({ seed: 2, difficulty: "normal" });
  run(core, 20_000);
  const w0 = core.state().water;
  core.applyOutcome("correct");
  assert.equal(core.state().water, Math.max(WATER_MIN, w0 - WATER_TUNING.normal.push));
  const w1 = core.state().water;
  core.applyOutcome("wrong");
  assert.equal(core.state().water, w1 + WATER_TUNING.normal.wrongPenalty);
  const w2 = core.state().water;
  core.applyOutcome("timeout");
  assert.equal(core.state().water, w2 + WATER_TUNING.normal.wrongPenalty);
  const w3 = core.state().water;
  core.applyOutcome("aborted");
  assert.equal(core.state().water, w3);
  const types: string[] = [];
  core.drainEvents((e) => types.push(e.type));
  assert.deepEqual(types.filter((t) => t !== "zoneMove"), ["waterDrop", "waterSurge", "waterSurge"]);
});

test("győzelem: N jó válasz hozza a menedéket (nehézségenként), utána a mag nem változik", () => {
  for (const d of ["easy", "normal", "hard"] as const) {
    const core = createWaterCore({ seed: 3, difficulty: d });
    for (let i = 0; i < WATER_TUNING[d].winCorrect - 1; i++) core.applyOutcome("correct");
    assert.equal(core.state().phase, "run");
    core.applyOutcome("correct");
    assert.equal(core.state().phase, "won", d);
    const w = core.state().water;
    run(core, 2_000);
    core.applyOutcome("wrong");
    assert.equal(core.state().water, w, "a menet vége után a víz áll");
  }
});

test("a zónában lassabban emelkedik a víz, mint azon kívül", () => {
  const inside = createWaterCore({ seed: 4, difficulty: "normal" });
  const outside = createWaterCore({ seed: 4, difficulty: "normal" });
  for (let t = 0; t < 3_000; t += STEP) {
    // A zóna követése / elhagyása (a zóna 6,3 mp-ig a közepén áll).
    inside.input.move = Math.sign(inside.state().zoneX - inside.state().x) * (Math.abs(inside.state().zoneX - inside.state().x) > 1 ? 1 : 0);
    outside.input.move = 1;
    inside.step(STEP);
    outside.step(STEP);
  }
  assert.ok(outside.state().x - outside.state().zoneX > ZONE_HALF, "a második figura kiment a zónából");
  assert.ok(inside.state().water < outside.state().water, "a zónában lassabb az emelkedés");
});

test("determinizmus: azonos seed + bemenet → azonos állapot; a zóna helye a menet RNG-jéből", () => {
  const a = createWaterCore({ seed: "x", difficulty: "hard" });
  const b = createWaterCore({ seed: "x", difficulty: "hard" });
  const c = createWaterCore({ seed: "y", difficulty: "hard" });
  for (const core of [a, b, c]) run(core, 30_000);
  assert.deepEqual(a.state(), b.state());
  assert.notEqual(a.state().zoneX, c.state().zoneX);
});

test("a figura a 8..92 % sávban marad, a Sprint gyorsít", () => {
  const slow = createWaterCore({ seed: 5, difficulty: "easy" });
  const fast = createWaterCore({ seed: 5, difficulty: "easy" });
  slow.input.move = 1;
  fast.input.move = 1;
  fast.input.sprint = true;
  run(slow, 300);
  run(fast, 300);
  assert.ok(fast.state().x > slow.state().x, "a sprint gyorsabb");
  run(fast, 10_000);
  assert.ok(fast.state().x <= 92);
  fast.input.move = -1;
  run(fast, 10_000);
  assert.ok(fast.state().x >= 8);
});

test("a kérdés-ütemező: 4 opció, ≥ 5 kérdés / perc cél, a kérdés alatt lassítás (nem állítás)", () => {
  const cfg = tsunamiDirectorConfig(4);
  assert.equal(cfg.optionCount, 4);
  assert.ok(cfg.targetPerMin >= 5);
  assert.ok(cfg.maxGapMs <= 15_000);
  assert.ok(cfg.slowMo > 0 && cfg.slowMo < 1, "a világ lassul, nem áll meg");
});

test("élesítés: a megjelenés utáni első ANSWER_ARM_MS-ban a válasz nem fogadható el", () => {
  let clockAt = 0;
  let picked: number | null = null;
  const pres = { id: 7, startedAtSimMs: 0, options: [], windowMs: 6000 } as unknown as ReturnType<NonNullable<Parameters<typeof createTsunamiDriver>[0]["questions"]>["active"]>;
  const driver = createTsunamiDriver({
    seed: 1,
    difficulty: "normal",
    questions: {
      frame: (c) => {
        clockAt = c;
      },
      timeScale: () => 0.6,
      finished: () => false,
      finish: () => null,
      pick: (i) => {
        picked = i;
        return null;
      },
      active: () => pres,
    },
  });
  driver.frame(ANSWER_ARM_MS - 50, false);
  assert.equal(driver.armedPresentationId(), null);
  driver.tapOption(1);
  assert.equal(picked, null, "élesítés előtt nincs válasz");
  driver.frame(100, false);
  assert.equal(driver.armedPresentationId(), 7);
  driver.tapOption(2);
  assert.equal(picked, 2);
  assert.ok(clockAt >= ANSWER_ARM_MS);
});

test("szünetben a kérdés-óra és a világ áll", () => {
  const driver = createTsunamiDriver({ seed: 1, difficulty: "normal", questions: null });
  driver.frame(1000, false);
  const c = driver.clockMs();
  const w = driver.core.state().water;
  driver.frame(1000, true);
  assert.equal(driver.clockMs(), c);
  assert.equal(driver.core.state().water, w);
});
