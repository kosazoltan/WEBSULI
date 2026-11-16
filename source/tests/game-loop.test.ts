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

test("holdFor: a tartás alatt nincs lépés, a beállított szorzó megmarad", () => {
  const { loop, steps } = counter();
  loop.setTimeScale(0.5);
  loop.frame(0);
  loop.holdFor(80);
  loop.frame(80);
  assert.equal(steps(), 0);
  assert.equal(loop.timeScale(), 0.5);
  assert.equal(loop.holdRemainingMs(), 0);
  loop.frame(80 + 1000 / 60 / 0.5);
  assert.equal(steps(), 1);
});

test("holdFor: csak a lejárat utáni valós idő kerül az akkumulátorba (review #442)", () => {
  const { loop, steps } = counter();
  loop.frame(0);
  loop.holdFor(40);
  loop.frame(50); // 40 ms tartás + 10 ms futás → 0 lépés
  assert.equal(steps(), 0);
  assert.equal(loop.holdRemainingMs(), 0);
  loop.frame(60); // 10 + 10 = 20 ms ≥ 16,67 → 1 lépés
  assert.equal(steps(), 1);
  // Egyetlen, a tartásnál nem hosszabb képkocka sem futtat lépést (akadozó kijelzőn sem tűnik el a megállás).
  const other = counter();
  other.loop.frame(0);
  other.loop.holdFor(120);
  other.loop.frame(120);
  assert.equal(other.steps(), 0);
  // Átfedő kérésnél a hosszabb maradék számít; érvénytelen kérés hatástalan.
  other.loop.holdFor(30);
  other.loop.holdFor(10);
  other.loop.holdFor(Number.NaN);
  other.loop.holdFor(-5);
  assert.equal(other.loop.holdRemainingMs(), 30);
});

test("a lépésen belül kért tartás / szünet megállítja a képkocka további lépéseit (review #442)", () => {
  let n = 0;
  const holding = createFixedLoop(() => {
    n++;
    if (n === 1) holding.holdFor(80);
  });
  holding.frame(0);
  holding.frame(50); // 3 lépésnyi idő, de az első lépés 80 ms-os hitstopot kér → a többi 2 lépés vár
  assert.equal(n, 1);
  assert.equal(holding.holdRemainingMs(), 80);
  // 50→130: a 80 ms-ot a tartás fogyasztja; a bent maradt 2 lépés most fut le.
  // Szabály: T valós idő és H tartás után a lépésszám floor((T − H) / 16,67) = floor(50 / 16,67) = 3.
  holding.frame(130);
  assert.equal(n, 3);
  holding.frame(210); // floor((210 − 80) / 16,67) = 7 — ugyanannyi lépés, mint hitstop nélkül 130 ms alatt
  assert.equal(n, 7);

  let m = 0;
  const pausing = createFixedLoop(() => {
    m++;
    if (m === 2) pausing.setTimeScale(0);
  });
  pausing.frame(0);
  pausing.frame(80);
  assert.equal(m, 2, "a második lépés szünetet kért: a képkocka többi lépése nem fut");
  pausing.frame(500);
  assert.equal(m, 2, "szünetben a bent maradt idő sem fut le");
  pausing.setTimeScale(1);
  pausing.frame(500 + 1000 / 60);
  // 80 ms (szünet előtt) + 16,67 ms (szünet után) = 96,67 ms → floor(5,8) = 5 lépés: a szünet előtti idő nem veszett el.
  assert.equal(m, 5);
});

test("akadozó (250 ms-os) képkocka hitstoppal: a tartás után a képkockánkénti plafon érvényes", () => {
  const { loop, steps } = counter();
  loop.frame(0);
  loop.holdFor(80);
  loop.frame(250); // 80 ms tartás, 170 ms futás → 10 lépésnyi idő, de legfeljebb 5 fut; a többi eldobva
  assert.equal(steps(), 5);
  assert.equal(loop.holdRemainingMs(), 0);
  loop.frame(250 + 1000 / 60);
  assert.ok(steps() <= 7, "a plafon feletti lemaradás nem fut le utólag (nincs „spiral of death”)");
});

test("hitstop + szünet együtt: a tartás lejárta után is szünet marad, folytatásra fut", () => {
  const { loop, steps } = counter();
  loop.frame(0);
  loop.holdFor(100);
  loop.setTimeScale(0);
  loop.frame(300);
  assert.equal(steps(), 0);
  assert.equal(loop.holdRemainingMs(), 0, "a tartás valós időben a szünet alatt is lejár");
  loop.setTimeScale(1);
  loop.frame(300 + 1000 / 60);
  assert.equal(steps(), 1);
});

test("reset: lépésszám, időalap, szorzó és tartás törlődik", () => {
  const { loop, steps } = counter();
  loop.setTimeScale(0.5);
  loop.holdFor(10_000);
  runFrames(loop, 0, 16, 10);
  loop.reset();
  assert.equal(loop.simTimeMs(), 0);
  assert.equal(loop.timeScale(), 1);
  assert.equal(loop.holdRemainingMs(), 0);
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

/**
 * Lépésenkénti állapot-napló egy seedelt sim-ből; `hitstopEvery > 0` esetén minden ennyiedik lépés (egy „találat”) a lépésen
 * belül 90 ms-os hitstopot kér — ahogy a játék tenné.
 */
function simulateWithHitstops(frameIntervals: (i: number) => number, totalMs: number, hitstopEvery: number) {
  const rng = createRng("hitstop-determinizmus");
  let x = 0;
  let v = 0;
  let n = 0;
  const trace: number[] = [];
  const loop = createFixedLoop((dtMs) => {
    n++;
    const input = rng.int(3) - 1;
    v += input * 0.002 * dtMs - v * 0.01;
    x += v * dtMs;
    trace.push(Math.round(x * 1e9));
    if (hitstopEvery > 0 && n % hitstopEvery === 0) loop.holdFor(90);
  });
  let now = 0;
  loop.frame(now);
  for (let i = 0; now < totalMs; i++) {
    now = Math.min(totalMs, now + frameIntervals(i));
    loop.frame(now);
  }
  return trace;
}

test("a hitstop a sim eredményét nem változtatja: azonos lépésszámnál azonos állapot, csak később (párbaj / bot előfeltétele)", () => {
  const total = 10_000;
  const jitter = createRng("akadozás-2");
  const jittered = Array.from({ length: 5000 }, () => 1 + jitter.next() * 65);
  const plain = simulateWithHitstops(() => 1000 / 60, total, 0);
  for (const [name, run] of [
    ["60 Hz, hitstop 37 lépésenként", simulateWithHitstops(() => 1000 / 60, total, 37)],
    ["30 Hz, hitstop 23 lépésenként", simulateWithHitstops(() => 1000 / 30, total, 23)],
    ["egyenetlen, hitstop 11 lépésenként", simulateWithHitstops((i) => jittered[i], total, 11)],
  ] as const) {
    assert.ok(run.length < plain.length, `${name}: a hitstop késlelteti a sim-et (${run.length} < ${plain.length})`);
    assert.deepEqual(run, plain.slice(0, run.length), `${name}: azonos lépésszámnál eltérő állapot`);
  }
  // Szabály: a lépésszám floor((T − ΣH) / 16,67) — 60 Hz-en 37 lépésenként 90 ms: ha k hitstop volt, n = floor((10000 − 90k) / 16,67).
  const run60 = simulateWithHitstops(() => 1000 / 60, total, 37);
  const k = Math.floor(run60.length / 37);
  assert.ok(Math.abs(run60.length - Math.floor((total - 90 * k) / SIM_STEP_MS)) <= 1, `${run60.length} lépés, ${k} hitstop`);
});
