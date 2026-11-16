import assert from "node:assert/strict";
import test from "node:test";
import { createRng } from "../shared/game-rng";
import { createFixedLoop, MIN_SLOW_MO, SIM_STEP_MS } from "../client/src/game-engine/play/loop";

/**
 * J0a — fix lépésű hurok (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J0a, K.4/9, KSZ-4).
 *
 * A legfontosabb állítás: a szimuláció végállapota NEM függ a képkocka-időktől. Egy 30 Hz-es olcsó telefon, egy 60 Hz-es
 * és egy egyenetlen (akadozó) képkocka-sorozat ugyanannyi valós idő alatt ugyanazt a lépés-sorozatot futtatja — ez a
 * párbaj (két telefon ugyanazzal a seeddel) és az arany visszajátszás előfeltétele.
 */

function counter() {
  let steps = 0;
  const dts: number[] = [];
  const loop = createFixedLoop((dt) => {
    steps++;
    dts.push(dt);
  });
  return { loop, steps: () => steps, dts };
}

/** `count` képkocka egyenletes `intervalMs` közzel; az első hívás csak időalapot rögzít. */
function runFrames(loop: ReturnType<typeof createFixedLoop>, startMs: number, intervalMs: number, count: number): number {
  let now = startMs;
  loop.frame(now);
  for (let i = 0; i < count; i++) {
    now += intervalMs;
    loop.frame(now);
  }
  return now;
}

test("60 Hz-en 1 s = 60 lépés, mindegyik pontosan SIM_STEP_MS", () => {
  const { loop, steps, dts } = counter();
  runFrames(loop, 1000, 1000 / 60, 60);
  assert.equal(steps(), 60);
  assert.ok(dts.every((dt) => dt === SIM_STEP_MS));
  assert.ok(Math.abs(loop.simTimeMs() - 1000) < 1e-9, `simTime = ${loop.simTimeMs()}`);
});

test("az első képkocka csak időalapot rögzít (nincs lépés)", () => {
  const { loop, steps } = counter();
  assert.equal(loop.frame(123_456), 0);
  assert.equal(steps(), 0);
});

test("250 ms-os ugrásnál legfeljebb 5 lépés, és az alpha 0..1 között marad", () => {
  const { loop, steps } = counter();
  loop.frame(0);
  const alpha = loop.frame(250);
  assert.equal(steps(), 5);
  assert.ok(alpha >= 0 && alpha <= 1);
  // 10 s-os ugrás (háttérből visszatérő lap) sem futtat többet: a lemaradás eldobva.
  loop.frame(10_250);
  assert.equal(steps(), 10);
});

test("a maxSteps állítható; érvénytelen beállítás hiba", () => {
  let n = 0;
  const loop = createFixedLoop(() => n++, { maxSteps: 2 });
  loop.frame(0);
  loop.frame(100);
  assert.equal(n, 2);
  assert.throws(() => createFixedLoop(() => {}, { maxSteps: 0 }), RangeError);
  assert.throws(() => createFixedLoop(() => {}, { maxFrameMs: 0 }), RangeError);
});

test("timeScale 0.35 → 1 s alatt ~21 lépés; 0 → szünet, a simTime áll", () => {
  const { loop, steps } = counter();
  loop.setTimeScale(0.35);
  const end = runFrames(loop, 0, 1000 / 60, 60);
  // 1000 ms × 0,35 / 16,667 ms = 21 lépés (±1 a lebegőpontos határ miatt).
  assert.ok(Math.abs(steps() - 21) <= 1, `${steps()} lépés`);
  loop.setTimeScale(0);
  const before = loop.simTimeMs();
  runFrames(loop, end, 1000 / 60, 120);
  assert.equal(loop.simTimeMs(), before);
});

test("setTimeScale korlátai: 0 < s < 0,35 → 0,35; s > 1 → 1; negatív → 0; NaN hiba", () => {
  const { loop } = counter();
  loop.setTimeScale(0.1);
  assert.equal(loop.timeScale(), MIN_SLOW_MO);
  loop.setTimeScale(2);
  assert.equal(loop.timeScale(), 1);
  loop.setTimeScale(-1);
  assert.equal(loop.timeScale(), 0);
  loop.setTimeScale(0.5);
  assert.equal(loop.timeScale(), 0.5);
  assert.throws(() => loop.setTimeScale(Number.NaN), RangeError);
});

test("az alpha minden képkockán 0..1; visszafelé ugró óra nem futtat lépést", () => {
  const { loop, steps } = counter();
  const rng = createRng("alpha");
  let now = 0;
  loop.frame(now);
  for (let i = 0; i < 2000; i++) {
    now += rng.next() * 120;
    const alpha = loop.frame(now);
    assert.ok(alpha >= 0 && alpha <= 1, `alpha = ${alpha}`);
  }
  const before = steps();
  loop.frame(now - 500);
  assert.equal(steps(), before);
});

test("setHold: a tartás alatt nincs lépés, a beállított szorzó megmarad", () => {
  const { loop, steps } = counter();
  loop.setTimeScale(0.5);
  loop.frame(0);
  loop.setHold(true);
  loop.frame(80);
  assert.equal(steps(), 0);
  assert.equal(loop.timeScale(), 0.5);
  loop.setHold(false);
  loop.frame(80 + 1000 / 60 / 0.5);
  assert.equal(steps(), 1);
});

test("reset: lépésszám, időalap, szorzó és tartás törlődik", () => {
  const { loop, steps } = counter();
  loop.setTimeScale(0.5);
  loop.setHold(true);
  runFrames(loop, 0, 16, 10);
  loop.reset();
  assert.equal(loop.simTimeMs(), 0);
  assert.equal(loop.timeScale(), 1);
  runFrames(loop, 5000, 1000 / 60, 60);
  assert.equal(steps(), 60);
});

/** Determinisztikus „játék”: seedelt RNG-ből bemenet lépésenként, egyszerű fizika; a végállapot hash-e. */
function simulate(frameIntervals: (i: number) => number, totalMs: number) {
  const rng = createRng("determinizmus-próba");
  let x = 0;
  let v = 0;
  let hash = 2166136261;
  const loop = createFixedLoop((dtMs) => {
    const input = rng.int(3) - 1; // -1 / 0 / +1 — a bemenet a lépés sorszámához kötött, nem a képkockához
    v += input * 0.002 * dtMs - v * 0.01;
    x += v * dtMs;
    hash = Math.imul(hash ^ Math.round(x * 1e6), 16777619) >>> 0;
  });
  let now = 0;
  loop.frame(now);
  for (let i = 0; now < totalMs; i++) {
    now = Math.min(totalMs, now + frameIntervals(i));
    loop.frame(now);
  }
  return { simTimeMs: loop.simTimeMs(), x, hash };
}

test("a fix lépésű hurok eredménye független a képkocka-időktől (30 Hz, 60 Hz, 144 Hz, egyenetlen)", () => {
  const total = 10_000;
  const jitter = createRng("akadozás");
  // Az egyenetlen közök 1–66 ms: így egy képkocka sosem éri el az 5 lépéses plafont (66 + 16,7 < 5 × 16,7 = 83,3).
  const jittered = Array.from({ length: 5000 }, () => 1 + jitter.next() * 65);
  const runs = [
    simulate(() => 1000 / 60, total),
    simulate(() => 1000 / 30, total),
    simulate(() => 1000 / 144, total),
    simulate((i) => jittered[i], total),
  ];
  for (const run of runs.slice(1)) {
    assert.equal(run.simTimeMs, runs[0].simTimeMs);
    assert.equal(run.hash, runs[0].hash);
    assert.equal(run.x, runs[0].x);
  }
  // 10 s = 600 lépés (a lebegőpontos tűrés miatt sem több, sem kevesebb).
  assert.equal(Math.round(runs[0].simTimeMs / SIM_STEP_MS), 600);
});
