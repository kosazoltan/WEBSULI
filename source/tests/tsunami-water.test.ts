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

/* ---- K1 (független ellenőr, koordinátori döntés 2026-11-18): olvasási idő szerinti ablak, a többletidő alatt a víz áll ---- */
import { extraTimeFrom, paceTsunamiDirector, tsunamiWindowMs } from "../client/src/lib/tsunami/pacing";
import { createSimGame, setSimQuestionSource } from "../client/src/lib/tsunami/sim";
import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
setSimQuestionSource((grade) => {
  const four = GRADE_QUIZ_ITEMS.filter((g) => g.options.length === 4);
  const own = grade === null ? [] : four.filter((g) => g.grade === grade);
  return own.length >= 40 ? own : four;
});
import { SIM_AVERAGE, SIM_YOUNG, runSim, runSimSeeds, simSeeds, type SimGameFactory } from "./support/game-sim";

test("K1: hosszú kérdésnél az ablak az olvasási idő (9 mp fölött), rövidnél legalább a közös ablak, legfeljebb 40 s", () => {
  const longPrompt = "Melyik gerinces csoportra igaz: változó testhőmérsékletűek, bőrüket szarupikkelyek fedik, szárazföldön raknak tojást?";
  const longOpts = ["élőlények táplálkozási kapcsolatát", "Kell megcsinálnom a házi feladatom.", "távolságát a kezdő hosszúsági körtől", "kulacs használata eldobható palack helyett"];
  const w4 = tsunamiWindowMs(longPrompt, longOpts, 4, 9000);
  assert.ok(w4 > 20_000, `3–4. évfolyamon a hosszú kérdés ablaka ${w4} ms`);
  assert.ok(tsunamiWindowMs(longPrompt, longOpts, 9, 9000) < w4, "idősebbnél rövidebb");
  assert.equal(tsunamiWindowMs("Mennyi 2 + 2?", ["3", "4", "5", "6"], 7, 6000), Math.max(6000, tsunamiWindowMs("Mennyi 2 + 2?", ["3", "4", "5", "6"], 7, 0)));
  assert.ok(tsunamiWindowMs(longPrompt.repeat(20), longOpts, 3, 9000) <= 40_000);
});

test("K1: a többletidő alatt a víz NEM emelkedik, a közös ablakon belül lassítva emelkedik", () => {
  const pres = { id: 1, startedAtSimMs: 0, windowMs: 9000, options: [{ label: "a", correct: true }], question: { quiz: { prompt: "x " .repeat(60), options: ["a", "b", "c", "d"] } } };
  const base = { tick: () => pres, request: () => pres, active: () => pres } as unknown as Parameters<typeof paceTsunamiDirector>[0];
  const paced = paceTsunamiDirector(base, { grade: () => 4 });
  const p = paced.active()!;
  assert.ok(p.windowMs > 9000);
  assert.equal(extraTimeFrom(p), 9000);
  const driver = createTsunamiDriver({
    seed: 1,
    difficulty: "normal",
    questions: { frame: () => {}, timeScale: () => 0.6, finished: () => false, finish: () => null, pick: () => null, active: () => p },
  });
  for (let t = 0; t < 8000; t += 50) driver.frame(50, false);
  const w8 = driver.core.state().water;
  assert.ok(w8 > WATER_START, "a közös ablakon belül emelkedik");
  for (let t = 0; t < 2000; t += 50) driver.frame(50, false);
  const w10 = driver.core.state().water;
  for (let t = 0; t < 5000; t += 50) driver.frame(50, false);
  assert.equal(driver.core.state().water, w10, "a többletidőben áll");
});

/*
 * Vak ellenőr K1 (2026-11-19): a többletidőben CSAK a víz álljon — a figura mozgása, a sodrás és a szimulációs idő nem (a régi
 * megoldás a teljes fix lépést megállította: a tárcsa / nyíl akár ~25 s-ig nem mozgatott, a gyerek ezt fagyásnak érezte).
 */
test("vak K1: a többletidőben a víz áll, de a figura a bemenetre mozog és a szimuláció fut", () => {
  const pres = { id: 1, startedAtSimMs: 0, windowMs: 9000, options: [{ label: "a", correct: true }], question: { quiz: { prompt: "x ".repeat(60), options: ["a", "b", "c", "d"] } } };
  const base = { tick: () => pres, request: () => pres, active: () => pres } as unknown as Parameters<typeof paceTsunamiDirector>[0];
  const p = paceTsunamiDirector(base, { grade: () => 4 }).active()!;
  const from = extraTimeFrom(p)!;
  const driver = createTsunamiDriver({
    seed: 1,
    difficulty: "normal",
    questions: { frame: () => {}, timeScale: () => 0.6, finished: () => false, finish: () => null, pick: () => null, active: () => p },
  });
  for (let t = 0; t < from + 500; t += 50) driver.frame(50, false); // a többletidőben vagyunk
  const s0 = driver.loop.simTimeMs();
  const w0 = driver.core.state().water;
  const x0 = driver.core.state().x;
  driver.core.input.move = 1;
  for (let t = 0; t < 2000; t += 50) driver.frame(50, false);
  assert.equal(driver.core.state().water, w0, "a többletidőben a víz áll");
  assert.ok(driver.core.state().x > x0 + 5, `a figura a bemenetre mozog (${x0} → ${driver.core.state().x})`);
  assert.ok(driver.loop.simTimeMs() > s0, "a szimulációs idő fut (sodrás, zóna)");
});

/* ---- K5: a kiesett, játékmenettől független állítások pótlása ---- */
test("K5: meghajtó-determinizmus egyenetlen képkockákkal — 16,67 és 33,3 ms-os képkockákkal bitre azonos állapot", () => {
  const a = createTsunamiDriver({ seed: "d", difficulty: "normal", questions: null });
  const b = createTsunamiDriver({ seed: "d", difficulty: "normal", questions: null });
  a.core.input.move = 1;
  b.core.input.move = 1;
  // Pillanatkép lépés-indexenként (a fix lépések száma: időMs / lépés); a 33 ms-os képkocka két lépést tesz.
  const snap = (d: typeof a, frameMs: number, frames: number) => {
    const out = new Map<number, string>();
    for (let i = 0; i < frames; i++) {
      d.frame(frameMs, false);
      out.set(Math.round(d.core.state().timeMs / (1000 / 60)), JSON.stringify(d.core.state()));
    }
    return out;
  };
  const sa = snap(a, 1000 / 60, 1800);
  const sb = snap(b, 2000 / 60, 900);
  let compared = 0;
  for (const [step, st] of sb) {
    if (step < 100 || !sa.has(step)) continue;
    assert.equal(sa.get(step), st, `lépés ${step}`);
    compared += 1;
  }
  assert.ok(compared > 500, `összevetett lépések: ${compared}`);
});

test("K5: arany visszajátszás — teljes sim-menet azonos seedre azonos, másik seedre más", () => {
  const f = createSimGame as unknown as SimGameFactory;
  const [s1, s2] = simSeeds("tsunami-english", 2);
  const r1 = runSim(f, SIM_AVERAGE, { seed: s1!, seconds: 240 });
  const r1b = runSim(f, SIM_AVERAGE, { seed: s1!, seconds: 240 });
  const r2 = runSim(f, SIM_AVERAGE, { seed: s2!, seconds: 240 });
  assert.deepEqual(r1, r1b);
  assert.notDeepEqual(r1, r2);
});

/* ---- K6: a sim a lap pálya-tempójával (`tsunamiWaterPace` 0,85–1,15) is ---- */
test("K6: a 10. pálya tempójával (1,15) is ≥ 12/20 győzelem 3–4. évfolyamon közepesen, és lassabb tempón sem rosszabb", () => {
  const at = (pace: number) =>
    runSimSeeds(((o: { seed: number; grade: number; questions: boolean }) => createSimGame({ ...o, pace })) as unknown as SimGameFactory, SIM_YOUNG, { gameId: "tsunami-english", seconds: 600, grade: 3 }).filter((r) => r.won).length;
  const fast = at(1.15);
  const slow = at(0.85);
  assert.ok(fast >= 12, `1,15: ${fast}/20`);
  assert.ok(slow >= fast, `0,85: ${slow}/20 ≥ 1,15: ${fast}/20`);
});
