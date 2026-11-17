/* eslint-disable no-console -- a mért szimulációs értékek naplója (a PR és a jelentés ebből idéz) */
import assert from "node:assert/strict";
import test from "node:test";

import { SIM_AVERAGE, SIM_WEAK, SIM_YOUNG, medianOf, runSim, runSimSeeds, simSeeds, type SimGameFactory } from "./support/game-sim";
import {
  advanceTornado,
  createChaseDriver,
  createSimGame,
  levelForGrade,
  tornadoDirectorConfig,
  winReward,
  type ChaseQuestions,
  type TornadoSim,
} from "../client/src/lib/tornado/sim";
import { levelSpec } from "../client/src/lib/tornado/levels";
import { anchorBandState, anchorOutcome } from "../client/src/lib/tornado/scoring";
import { MAX_UPGRADE_LEVEL, effectiveAnchorBand, effectiveStats, emptyUpgrades } from "../client/src/lib/tornado/upgrades";
import { VEHICLES } from "../client/src/lib/tornado/vehicles";

/**
 * J7b — Tornado Hunter 200 szimulációs elfogadás a közös harness-szel (végrehajtás K.6, J7b 5.; terv 6.2 J2, J3, J4, J6,
 * J7). 20 seed (`seedFrom("sim", "tornado-hunter-200", i)`), a terv játékosmodelljeivel; a „legfeljebb / legalább”
 * küszöbök mind a 20 futásra, a mediánosak a mediánra. A mag (`createChaseCore`) a lappal közös; a bot-sofőr
 * egyszerűsített (lásd `sim.ts` fejkomment). A J9 menethossz (2–5 perc) a J7c-é (zajpálya, szupercella) — itt mérve, de
 * nem elfogadási pont.
 */

const factory = createSimGame as unknown as SimGameFactory;
const GAME = "tornado-hunter-200" as const;

function summary(name: string, runs: ReturnType<typeof runSimSeeds>): void {
  const s = runs.map((r) => r.stats);
  console.log(
    `[tornado-sim] ${name}: kérdés/perc medián ${medianOf(s.map((x) => x.perMinute)).toFixed(2)}, ` +
      `kérdés nélküli leghosszabb ${Math.max(...s.map((x) => x.maxGapSec)).toFixed(2)} s, ` +
      `legrövidebb indítási rés ${Math.min(...s.map((x) => x.minGapSec)).toFixed(2)} s, ` +
      `ismétlés 3.–6. medián ${medianOf(s.map((x) => x.reviewReturnWithin6)).toFixed(2)}, ≤ 10 medián ${medianOf(s.map((x) => x.reviewReturnWithin10)).toFixed(2)}, ` +
      `ismétlési arány max ${Math.max(...s.map((x) => x.reviewShare)).toFixed(2)}, ` +
      `menethossz medián ${(medianOf(runs.map((r) => r.durationSec)) / 60).toFixed(2)} perc, győzelem ${runs.filter((r) => r.won).length}/${runs.length}`,
  );
}

test("J2 / J3 / J6 — SIM_AVERAGE, 7. évfolyam, 180 mp × 20 seed: ≥ 4 kérdés/perc, ≤ 20 mp kérdés nélkül, ≥ 1,5 mp rés", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 180, grade: 7 });
  summary("SIM_AVERAGE 180 s", runs);
  const s = runs.map((r) => r.stats);
  assert.ok(medianOf(s.map((x) => x.perMinute)) >= 4, `kérdés/perc medián ${medianOf(s.map((x) => x.perMinute))}`);
  for (const x of s) {
    assert.ok(x.maxGapSec <= 20, `maxGap ${x.maxGapSec}`);
    assert.ok(x.minGapSec >= 1.5, `minGap ${x.minGapSec}`);
    assert.ok(x.reviewShare <= 0.3 + 1e-9, `ismétlési arány ${x.reviewShare}`);
    // J6: az ismétlésnek nem minősülő kérdések mind különböző tételek (a sim-bank ≥ 300 tétel).
    assert.equal(x.distinctKeys, x.asked - x.reviewsAsked, `ismétlődő új tétel: ${x.distinctKeys} / ${x.asked - x.reviewsAsked}`);
    // A J7b-menet ~1 perc (a 3,4 km-es út + horgony; a 2–5 perces ív a J7c-é): legalább 3 megválaszolt kérdés.
    assert.ok(x.answered >= 3, `válaszok ${x.answered}`);
  }
});

test("J2 / J3 — SIM_YOUNG (3. évfolyam, ×1,25 ablak) és SIM_WEAK (45%): a küszöbök ott is teljesülnek", () => {
  for (const [name, player, grade] of [["SIM_YOUNG", SIM_YOUNG, 3], ["SIM_WEAK", SIM_WEAK, 7]] as const) {
    const runs = runSimSeeds(factory, player, { gameId: GAME, seconds: 180, grade });
    summary(`${name} 180 s`, runs);
    const s = runs.map((r) => r.stats);
    assert.ok(medianOf(s.map((x) => x.perMinute)) >= 4, `${name} kérdés/perc ${medianOf(s.map((x) => x.perMinute))}`);
    for (const x of s) {
      assert.ok(x.maxGapSec <= 20, `${name} maxGap ${x.maxGapSec}`);
      assert.ok(x.minGapSec >= 1.5, `${name} minGap ${x.minGapSec}`);
    }
  }
});

test("a menet a kérdésekkel együtt is végigjátszható: elágazás, turbó és horgony-kérdés is jön, és van győzelem", () => {
  const seeds = simSeeds(GAME, 20);
  let junctions = 0;
  let turbos = 0;
  let anchors = 0;
  let wins = 0;
  for (const seed of seeds) {
    const g = createSimGame({ seed, grade: 7, questions: true }) as TornadoSim;
    runSimOn(g, seed);
    const t = g.tally();
    junctions += t.junctions;
    turbos += t.turbos;
    anchors += t.anchorQuestions;
    if (g.won()) wins += 1;
  }
  console.log(`[tornado-sim] 20 menet: elágazás ${junctions}, turbó ${turbos}, horgony-kérdés ${anchors}, győzelem ${wins}/20`);
  assert.ok(junctions >= 40 && turbos >= 10 && anchors >= 20, `${junctions} / ${turbos} / ${anchors}`);
  assert.ok(wins >= 10, `győzelem ${wins}/20`);
});

/** A harness bot-játékosa egy már létrehozott sim-en (a tally olvasásához). */
function runSimOn(g: TornadoSim, seed: number): void {
  runSim(() => g as never, SIM_AVERAGE, { seed, seconds: 600 });
}

test("J7 — elérhető tananyag mellett az első kérdés tananyag, utána a többi forrás", () => {
  const material = [1, 2, 3].map((n) => ({ id: `mat-${n}`, prompt: `Tananyag-kérdés ${n}?`, options: ["jó", "rossz egy", "rossz kettő", "rossz három"], correctIndex: 0 }));
  for (const seed of simSeeds(GAME, 5)) {
    const runs = runSim((o) => createSimGame({ ...o, material }) as never, SIM_AVERAGE, { seed, seconds: 120, grade: 7 });
    assert.equal(runs.stats.firstSource, "material");
    assert.ok(runs.stats.asked > 3, "a tananyag elfogyása után is jön kérdés");
  }
});

test("kérdés nélküli mód: a menet végigjátszható, és van vesztési feltétel (a tölcsér elhal)", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 600, grade: 7, questions: false });
  assert.ok(runs.some((r) => r.won), "kérdés nélkül is lehet nyerni");
  for (const r of runs) assert.equal(r.stats.asked, 0);
  // Vesztés: a jármű áll (a bot nem indul) → a tölcsér élettartama után vége.
  const g = createSimGame({ seed: 7, grade: 7, questions: false });
  let n = 0;
  while (!g.done() && n++ < 60 * 400) g.step(1000 / 60, { skillRoll: 0 });
  assert.ok(g.done());
});

test("arany visszajátszás: azonos seed + bemenet → azonos végállapot; más seed → más", () => {
  const play = (seed: number) => {
    const g = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => g as never, SIM_AVERAGE, { seed, seconds: 600 });
    return g.fingerprint();
  };
  assert.equal(play(11), play(11));
  assert.notEqual(play(11), play(12));
});

test("közös meghajtó: lépés-indexhez kötött bemenettel eltérő képkocka-időknél bitre azonos az állapot", () => {
  const run = (frames: number[]) => {
    const log: string[] = [];
    const tp = { x: 0, z: 0, angle: 1, born: 0 };
    const car = { x: 0, z: 300, heading: Math.PI, speed: 0 };
    let stepIndex = 0;
    const questions: ChaseQuestions = {
      frame: () => {}, request: () => null, pick: () => null, active: () => null, abort: () => null, canAsk: () => true, pending: () => false,
    };
    const d = createChaseDriver({
      seed: 5,
      questions,
      physics: (dt) => {
        stepIndex += 1;
        advanceTornado(tp, levelSpec(40), dt);
        car.heading += (stepIndex % 7 === 0 ? 0.01 : -0.004);
        car.speed = 12;
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z -= Math.cos(car.heading) * car.speed * dt;
        return { ...car, hold: false };
      },
    });
    let t = 0;
    d.frame(0);
    for (const f of frames) d.frame((t += f));
    for (const e of d.core.drainEvents()) log.push(e.kind);
    return `${stepIndex}|${car.x.toFixed(9)}|${car.z.toFixed(9)}|${tp.x.toFixed(9)}|${d.core.clockMs()}|${JSON.stringify(d.core.pad())}|${log.join(",")}`;
  };
  const total = 40_000;
  const at60 = run(Array.from({ length: total / (1000 / 60) }, () => 1000 / 60));
  const at30 = run(Array.from({ length: total / (1000 / 30) }, () => 1000 / 30));
  const mixed = run(Array.from({ length: 2400 }, (_, i) => (i % 3 === 0 ? 8 : i % 3 === 1 ? 33.333333333333336 : 8.666666666666666)));
  assert.equal(at30, at60);
  assert.equal(mixed.split("|")[0], at60.split("|")[0]);
  assert.equal(mixed, at60);
});

test("a director beállítása a végrehajtás J7b 3. pontja szerint", () => {
  const c = tornadoDirectorConfig(7);
  assert.deepEqual(
    { optionCount: c.optionCount, minGapMs: c.minGapMs, maxGapMs: c.maxGapMs, targetPerMin: c.targetPerMin, baseWindowMs: c.baseWindowMs, slowMo: c.slowMo },
    { optionCount: 3, minGapMs: 1500, maxGapMs: 20000, targetPerMin: 4, baseWindowMs: 5500, slowMo: 1 },
  );
  assert.equal(levelForGrade(7), 109);
});

/* ---- K2 (review #482) és #83 L3: a győzelmi jutalom viselkedése ---- */

test("K2: a pozíció-bónusz azonos távolságból minden műszer-szinten azonos — a szélesebb sáv csak a horgonyzást könnyíti", () => {
  const level = 50;
  const spec = levelSpec(level);
  const vehicle = VEHICLES[0]!;
  const args = { level, secondsUsed: 80, anchorAttempts: 1, peakWind: spec.windPeak * 0.8, correctAnswers: 4, wrongAnswers: 1 };
  const inBase = (spec.anchorBand.min + spec.anchorBand.max) / 2;
  const reference = winReward({ ...args, anchoredDistanceKm: inBase });
  for (let lvl = 0; lvl <= MAX_UPGRADE_LEVEL; lvl++) {
    const eff = effectiveStats(vehicle, { ...emptyUpgrades(), instruments: lvl });
    const band = effectiveAnchorBand(spec.anchorBand, eff.bandWidthFactor);
    // A horgonyzás a fejlesztett sávval dől el (a lap ugyanígy: `bandSpec`)…
    assert.equal(anchorOutcome({ distanceKm: inBase, spec: { ...spec, anchorBand: band }, answerCorrect: true, surfaceGrip: 1 }).ok, true);
    // …a pont viszont ugyanabból a távolságból ugyanannyi, bármely műszer-szinten.
    const r = winReward({ ...args, anchoredDistanceKm: inBase });
    assert.deepEqual(r, reference, `${lvl}. műszer-szint`);
    if (lvl === MAX_UPGRADE_LEVEL) {
      // A szélesített sáv külső részéből horgonyozni most már lehet, de pozíció-bónusz az alap sáv szerint jár.
      const outer = (spec.anchorBand.max + band.max) / 2;
      assert.equal(anchorBandState(outer, band), "in_band");
      assert.equal(anchorBandState(outer, spec.anchorBand), "too_far");
      assert.ok(winReward({ ...args, anchoredDistanceKm: outer }).breakdown.positionBonus <= reference.breakdown.positionBonus);
    }
  }
});

test("#83 L3: a pozíció-bónusz a horgonyzás pillanatának távolságából számol, nem a későbbi (elmozdult) tölcsérből", () => {
  const level = 30;
  const spec = levelSpec(level);
  const atAnchor = (spec.anchorBand.min + spec.anchorBand.max) / 2;
  const later = spec.anchorBand.max * 1.6; // a hold ideje alatt a tölcsér elhaladt
  const base = { level, secondsUsed: 70, anchorAttempts: 1, peakWind: spec.windPeak, correctAnswers: 3, wrongAnswers: 0 };
  assert.ok(winReward({ ...base, anchoredDistanceKm: atAnchor }).breakdown.positionBonus > winReward({ ...base, anchoredDistanceKm: later }).breakdown.positionBonus);
});
