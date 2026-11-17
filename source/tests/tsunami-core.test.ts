import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLIDE_GAP_LOSS,
  GATE_CLEAR_AFTER_M,
  GATE_CLEAR_SEC,
  GATE_LEAD_MS,
  GOOD_GATE_GAP_GAIN,
  JUMP_AIR_SEC,
  JUMP_PEAK_M,
  STUMBLE_MS,
  TSUNAMI_SLOW_MO,
  TURBO_MS,
  createTsunamiCore,
  createTsunamiDriver,
  tsunamiDirectorConfig,
  tuningFor,
  type TsunamiCore,
  type TsunamiState,
} from "../client/src/lib/tsunami/core";
import { createTrackGen, createTrackPools, fillTrack, OBSTACLE_SPECS, TUTORIAL_LANE_ONLY_SEC, type Obstacle } from "../client/src/lib/tsunami/obstacles";
import { createSimGame } from "../client/src/lib/tsunami/sim";

/**
 * J1a — „Hegyre fel!” tiszta mag (végrehajtás J1a 7.; terv 5.1 Q1, J-TS; K.4/9, 13, 23–25; K.5 KSZ-4, KSZ-11, KSZ-12).
 * A mag React és three nélkül fut; az elvárások a tervből levezetve (nem a megvalósítás konkrét számaira szabva):
 * sávváltás, ugrás, ütközés, kapu-feloldás, győzelem távolságra, kapu-pillanatban nincs akadály a kapu sávjaiban,
 * determinizmus (azonos seed + lépés-indexhez kötött bemenet → bitre azonos állapot eltérő képkocka-időknél).
 */

const STEP = 1000 / 60;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function freshCore(seed = 1): TsunamiCore {
  return createTsunamiCore({ seed, tuning: tuningFor("normal") });
}

/** Az összes generált akadály és kagyló eltüntetése (célzott helyzetekhez). */
function clearTrack(core: TsunamiCore): void {
  for (const o of core.state().obstacles) (o as Obstacle).alive = false;
  for (const s of core.state().shells) (s as Mutable<typeof s>).alive = false;
}

function stepFor(core: TsunamiCore, ms: number, keepClear = true): void {
  for (let t = 0; t < ms; t += STEP) {
    if (keepClear) clearTrack(core);
    core.step(STEP, 0.4);
  }
}

/** Egy akadály elhelyezése a futó előtt `ahead` méterrel, a megadott sávban. */
function placeObstacle(core: TsunamiCore, kind: Obstacle["kind"], lane: 0 | 1 | 2, ahead: number): Obstacle {
  const slot = core.state().obstacles.find((o) => !o.alive) as Obstacle;
  slot.alive = true;
  slot.kind = kind;
  slot.lane = lane;
  slot.at = core.state().distance + ahead;
  slot.hit = false;
  return slot;
}

test("sávváltás: húzás egy sávot lép, a szélen nem lép ki, ~0,15 mp alatt a sáv közepén", () => {
  const core = freshCore();
  assert.equal(core.state().lane, 1);
  core.input.laneDelta = 1;
  stepFor(core, 150);
  assert.equal(core.state().lane, 2);
  assert.equal(core.state().x, 1);
  core.input.laneDelta = 1; // a jobb szélen nincs több sáv
  stepFor(core, 150);
  assert.equal(core.state().targetLane, 2);
  core.input.laneDelta = -1;
  stepFor(core, 150);
  core.input.laneDelta = -1;
  stepFor(core, 150);
  assert.equal(core.state().lane, 0);
  assert.equal(core.state().x, -1);
});

test("analóg tárcsa (D-J1a-1): a kitérés arányos sebességgel visz, elengedve a legközelebbi sáv közepére áll", () => {
  const core = freshCore();
  core.input.steer = 0.5;
  stepFor(core, 300);
  const half = core.state().x;
  const core2 = freshCore();
  core2.input.steer = 1;
  stepFor(core2, 300);
  assert.ok(half > 0.05 && half < core2.state().x, `fél kitérés ${half} < teljes ${core2.state().x}`);
  assert.ok(Math.abs(core2.state().x / half - 2) < 0.05, "a mozgás a kitéréssel arányos (folytonos görbe)");
  core.input.steer = 0;
  stepFor(core, 400);
  assert.equal(core.state().x, Math.round(core.state().x), "elengedve sáv közepén áll");
});

test("ugrás: ~0,62 mp légi idő, ~1,3 m csúcs; a földet érés előtt 120 ms-on belül kért ugrás azonnal újraindul (puffer)", () => {
  const core = freshCore();
  core.input.jump = true;
  let peak = 0;
  let air = 0;
  for (let t = 0; t < 2000; t += STEP) {
    clearTrack(core);
    core.step(STEP, 0.4);
    peak = Math.max(peak, core.state().y);
    if (core.state().y > 0) air += STEP;
    else if (air > 0) break;
  }
  assert.ok(Math.abs(peak - JUMP_PEAK_M) < 0.05, `csúcs ${peak}`);
  assert.ok(Math.abs(air / 1000 - JUMP_AIR_SEC) < 0.05, `légi idő ${air}`);
  // Puffer: a légi idő vége előtt 80 ms-mal kért ugrás a földet éréskor indul.
  core.input.jump = true;
  stepFor(core, JUMP_AIR_SEC * 1000 - 80);
  assert.ok(core.state().y > 0);
  core.input.jump = true;
  stepFor(core, 160);
  assert.ok(core.state().y > 0, "a pufferelt ugrás a földet éréskor elindult");
  assert.equal(core.state().jumps, 3, "első + második + a pufferelt ugrás");
});

test("ütközés (a tanító szakasz után): 0,8 mp botlás, a hullám ≥ 6 m-rel közelebb; az ugrás átviszi a fán, a kocsin nem", () => {
  const core = freshCore();
  stepFor(core, 31_000); // a 30 mp-es tanító szakasz után
  const gap0 = core.state().waveGap;
  placeObstacle(core, "car", 1, 3);
  stepFor(core, 600, false);
  assert.equal(core.state().collisions, 1);
  assert.ok(core.state().stumbleMs > 0 && core.state().stumbleMs <= STUMBLE_MS);
  assert.ok(gap0 - core.state().waveGap >= COLLIDE_GAP_LOSS, `rés ${gap0} → ${core.state().waveGap}`);

  // Ugrással a fa fölött: nincs ütközés.
  const c2 = freshCore();
  stepFor(c2, 31_000);
  placeObstacle(c2, "log", 1, 3);
  for (let t = 0; t < 800; t += STEP) {
    const o = c2.state().obstacles.find((x) => x.alive && x.kind === "log")!;
    if (o && o.at - c2.state().distance <= c2.state().speed * JUMP_AIR_SEC * 0.45 && c2.state().y === 0 && c2.state().jumps === 0) c2.input.jump = true;
    c2.step(STEP, 0.4);
  }
  assert.equal(c2.state().collisions, 0, "átugrott fa nem ütközés");
  // A kocsit nem lehet átugrani.
  const c3 = freshCore();
  stepFor(c3, 31_000);
  placeObstacle(c3, "car", 1, 3);
  c3.input.jump = true;
  stepFor(c3, 700, false);
  assert.equal(c3.state().collisions, 1, "a kocsi nem ugorható");
  // Másik sávban nincs ütközés.
  const c4 = freshCore();
  stepFor(c4, 31_000);
  placeObstacle(c4, "car", 0, 3);
  stepFor(c4, 700, false);
  assert.equal(c4.state().collisions, 0);
});

test("tanító szakasz (K.4/25, D-J1a-6): az első 30 mp-ben az ütközés nem viszi a rést, vereség nincs", () => {
  const core = freshCore();
  for (let k = 0; k < 6; k++) {
    placeObstacle(core, "car", core.state().lane, 2);
    stepFor(core, 1500, false);
  }
  assert.ok(core.state().collisions >= 5);
  assert.ok(core.state().timeMs < 30_000);
  assert.equal(core.running(), true);
  assert.ok(core.state().waveGap >= 8);
});

test("kapu: a lassított futás az ablak vége előtt 300 ms-mal ér oda; a kapu-pillanatban nincs akadály és kagyló a kapu sávjaiban", () => {
  const core = freshCore(5);
  stepFor(core, 40_000, false); // valódi generált pálya
  const st = core.state();
  const windowMs = 4500;
  const g = core.placeGate({ id: 1, windowMs, slowMo: TSUNAMI_SLOW_MO, optionCount: 3 });
  const expected = st.distance + core.tuning().speed * TSUNAMI_SLOW_MO * ((windowMs - GATE_LEAD_MS) / 1000);
  assert.ok(Math.abs(g.atDistance - expected) < 1e-9);
  assert.deepEqual(g.laneOptions, [0, 1, 2]);
  const from = g.atDistance - core.tuning().speed * GATE_CLEAR_SEC;
  const to = g.atDistance + GATE_CLEAR_AFTER_M;
  const inRange = (at: number) => at >= from && at <= to;
  // Lépkedés a kapuig: a generátor sem tesz oda semmit.
  for (let t = 0; t < 3000 && core.state().gates; t += STEP) {
    for (const o of core.state().obstacles) assert.ok(!(o.alive && inRange(o.at)), `akadály a kapu-pillanatban: ${o.kind}@${o.at}`);
    for (const s of core.state().shells) assert.ok(!(s.alive && inRange(s.at)), `kagyló a kapu-pillanatban @${s.at}`);
    const r = core.step(STEP, 0.4);
    if (r.gateReached) break;
  }
});

test("kapu-feloldás: átlépéskor a futó sávja a válasz; jó = 1,5 mp turbó + 12 m rés; rossz = botlás; megszakítás = a kapu eltűnik", () => {
  const core = freshCore(3);
  stepFor(core, 31_000);
  // A kapu a 2-es (jobb) sávban dől el: oda vált.
  core.placeGate({ id: 7, windowMs: 4500, slowMo: 1, optionCount: 3 });
  core.input.laneDelta = 1;
  let reached = false;
  for (let t = 0; t < 6000 && !reached; t += STEP) {
    clearTrack(core);
    reached = core.step(STEP, 0.4).gateReached;
  }
  assert.ok(reached, "a futó elérte a kaput");
  assert.deepEqual(core.resolveGate(), { laneIndex: 2, optionIndex: 2 });
  const gap0 = core.state().waveGap;
  core.applyOutcome({ id: 7, result: "correct", pickedOption: 2, correctOption: 2 });
  assert.equal(core.state().turboMs, TURBO_MS);
  assert.ok(Math.abs(core.state().waveGap - Math.min(core.tuning().gapMax, gap0 + GOOD_GATE_GAP_GAIN)) < 1e-9);
  assert.equal(core.state().gates, null, "átlépés után a kapu mögötte");
  assert.equal(core.state().combo.count, 1);

  core.placeGate({ id: 8, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.applyOutcome({ id: 8, result: "wrong", pickedOption: 0, correctOption: 1 });
  assert.equal(core.state().stumbleMs, STUMBLE_MS);
  assert.equal(core.state().combo.count, 0, "rossz kapu: a kombó megszakad");
  const g = core.state().gates!;
  assert.ok(g && g.resolved && g.correctLane === 1 && g.pickedLane === 0, "a kapu előtte marad, a helyes sáv jelölve");

  core.placeGate({ id: 9, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.applyOutcome({ id: 9, result: "aborted", pickedOption: null, correctOption: 0 });
  assert.equal(core.state().gates, null);
  assert.equal(core.state().gatesWrong, 1, "a megszakítás nem hiba");
});

test("érintés a táblán (D-J1a-2): a futó a választott opció sávjába fut", () => {
  const core = freshCore();
  core.placeGate({ id: 1, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.steerToOption(0);
  stepFor(core, 300);
  assert.equal(core.state().lane, 0);
});

test("győzelem a távolságra (nem a jó válaszok számára): a pálya végén won, a hullám utolérésekor lost", () => {
  const core = freshCore();
  (core.state() as Mutable<TsunamiState>).distance = core.tuning().levelDistance - 0.05;
  stepFor(core, 100);
  assert.equal(core.state().phase, "won");
  assert.equal(core.state().gatesCorrect, 0);
  const c2 = freshCore();
  stepFor(c2, 31_000);
  (c2.state() as Mutable<TsunamiState>).waveGap = 0.01;
  stepFor(c2, 100);
  assert.equal(c2.state().phase, "lost");
  assert.equal(c2.running(), false);
});

test("pálya-generátor: minden sorban van járható út, a sorok között ≥ 0,9 mp; az első 15 mp-ben csak sávváltós akadály", () => {
  const pools = createTrackPools();
  const speed = 9.5;
  const gen = createTrackGen(speed * 3);
  let seed = 9;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const rows = new Map<number, Obstacle[]>();
  for (let d = 0; d < 1500; d += 5) {
    fillTrack(pools, gen, d, d / speed, speed, { from: 1, to: 0 }, rng);
    for (const o of pools.obstacles) {
      if (!o.alive) continue;
      const list = rows.get(o.at) ?? [];
      if (!list.includes(o)) list.push({ ...o });
      rows.set(o.at, list);
      o.alive = false; // a sor rögzítve; a készlet felszabadul
    }
  }
  const ats = [...rows.keys()].sort((a, b) => a - b);
  assert.ok(ats.length > 50);
  for (let i = 1; i < ats.length; i++) assert.ok(ats[i]! - ats[i - 1]! >= speed * 0.9 - 1e-9, `sorköz ${ats[i]! - ats[i - 1]!}`);
  for (const at of ats) {
    const row = rows.get(at)!;
    const lanes = new Set(row.map((o) => o.lane));
    const passable = lanes.size < 3 || row.every((o) => OBSTACLE_SPECS[o.kind].jumpable);
    assert.ok(passable, `járhatatlan sor @${at}`);
    if (at / speed < TUTORIAL_LANE_ONLY_SEC) assert.ok(row.length === 1 && row[0]!.kind === "car", `tanító sor @${at}`);
  }
});

test("a kérdés-ütemező beállítása a végrehajtás szerint (3 opció, 1,5–15 mp, 5/perc, 4,5 mp ablak, 0,6× lassítás)", () => {
  const c = tsunamiDirectorConfig(7);
  assert.equal(c.optionCount, 3);
  assert.equal(c.minGapMs, 1500);
  assert.equal(c.maxGapMs, 15000);
  assert.equal(c.targetPerMin, 5);
  assert.equal(c.baseWindowMs, 4500);
  assert.equal(c.slowMo, 0.6);
  assert.equal(c.gameId, "tsunami-english");
});

test("meghajtó: azonos seed + lépés-indexhez kötött bemenet → bitre azonos állapot 16,67 / 33 ms-os és egyenetlen képkockákkal", () => {
  const TARGET = 3000;
  const runWithFrames = (frames: () => number): string => {
    let step = 0;
    let snapshot = "";
    let driver: ReturnType<typeof createTsunamiDriver> | null = null;
    // A bemenet a LÉPÉS elején érkezik (az intenzitás-visszahívás lépésenként egyszer, a mag lépése előtt fut).
    driver = createTsunamiDriver({
      seed: 41,
      tuning: tuningFor("normal"),
      questions: null,
      intensity: () => {
        step += 1;
        const core = driver!.core;
        if (step === TARGET + 1) {
          const st = core.state();
          snapshot = JSON.stringify({ d: st.distance, x: st.x, y: st.y, g: st.waveGap, c: st.collisions, s: st.shellCount, sc: st.score, o: st.obstacles.map((o) => [o.alive, o.kind, o.lane, o.at, o.hit]) });
        }
        if (step % 41 === 0) core.input.laneDelta = step % 82 === 0 ? 1 : -1;
        if (step % 53 === 0) core.input.jump = true;
        if (step === 700) core.placeGate({ id: 1, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
        if (step === 760) core.applyOutcome({ id: 1, result: "correct", pickedOption: 1, correctOption: 1 });
        return 0.5;
      },
    });
    for (let i = 0; i < 20_000 && snapshot === ""; i++) driver.frame(frames(), false);
    return snapshot;
  };
  const a = runWithFrames(() => STEP);
  const b = runWithFrames(() => 33);
  let k = 0;
  const c = runWithFrames(() => [7, 16.6667, 41, 23, 3][k++ % 5]!);
  assert.ok(a.length > 0);
  assert.equal(b, a);
  assert.equal(c, a);
});

test("arany visszajátszás: a teljes szimulált menet (kérdésekkel) azonos seedre azonos, más seedre más", () => {
  const play = (seed: number) => {
    const sim = createSimGame({ seed, grade: 7, questions: true });
    let u = seed;
    const rng = () => ((u = (u * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 60 * 90 && !sim.done(); i++) {
      const q = sim.question();
      if (q && rng() < 0.05) sim.answer(q.id, rng() < 0.7 ? q.correctOption : (q.correctOption + 1) % q.optionCount);
      sim.step(STEP, { skillRoll: rng() / 0.8 });
    }
    const st = sim.core.state();
    return JSON.stringify({ d: st.distance.toFixed(6), g: st.waveGap.toFixed(6), c: st.collisions, s: st.score, gc: st.gatesCorrect, gw: st.gatesWrong, q: sim.stats().asked });
  };
  assert.equal(play(12), play(12));
  assert.notEqual(play(12), play(13));
});

test("egy válasz / kérdés (terv 8.4): a kapu-tábla két egyidejű érintéséből csak az első számít", () => {
  const sim = createSimGame({ seed: 21, grade: 7, questions: true });
  let q = sim.question();
  for (let i = 0; i < 60 * 20 && !q; i++) {
    sim.step(STEP, { skillRoll: 0 });
    q = sim.question();
  }
  assert.ok(q, "20 mp-en belül nyílik kérdés");
  // Élesítés (átmeneti kapu 3a): a megjelenés utáni 400 ms-ban az érintés nem válasz.
  assert.equal(sim.driver.tapOption(q.correctOption), null, "a megjelenés pillanatában eső érintés nem válasz");
  for (let t = 0; t < 420; t += STEP) sim.step(STEP, { skillRoll: 0 });
  assert.equal(sim.stats().answered, 0);
  const wrong = (q.correctOption + 1) % q.optionCount;
  sim.driver.tapOption(wrong);
  sim.driver.tapOption(q.correctOption); // a második ujj — eldobódik
  sim.step(STEP, { skillRoll: 0 });
  const st = sim.stats();
  assert.equal(st.answered, 1);
  assert.equal(st.correct, 0);
});

test("K1 (review #483, D-J1a-12): botlás közben induló kérdésnél is az ablak vége előtt ér a futó a kapuhoz (4,5 / 6 / 9 mp, 0–800 ms botlás)", () => {
  for (const windowMs of [4500, 6000, 9000]) {
    for (const stumble of [0, 300, 500, 800]) {
      const core = freshCore(1);
      stepFor(core, 31_000, false);
      (core.state() as Mutable<TsunamiState>).stumbleMs = stumble;
      const coll0 = core.state().collisions;
      const g = core.placeGate({ id: 1, windowMs, slowMo: TSUNAMI_SLOW_MO, optionCount: 3 });
      let worldMs = 0;
      for (let guard = 0; guard < 100_000 && core.state().distance < g.atDistance; guard++) {
        core.step(STEP, 0.4);
        worldMs += STEP;
      }
      const realMs = worldMs / TSUNAMI_SLOW_MO;
      assert.ok(realMs <= windowMs - 100, `ablak ${windowMs}, botlás ${stumble}: érkezés ${realMs.toFixed(0)} ms`);
      assert.equal(core.state().collisions - coll0, 0, "a kapu előtt nincs akadály (a kapu-pillanat a futótól tart)");
    }
  }
});

test("K2 (D-J1a-13): tétlen átfutás — a játékban hat (jó: turbó + 12 m; rossz: botlás), a kombó megszakad, pont nem jár; bemenet után nem tétlen", () => {
  const core = freshCore(2);
  stepFor(core, 31_000);
  core.placeGate({ id: 1, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  assert.equal(core.hadInputSinceGate(), false);
  const gap0 = core.state().waveGap;
  const score0 = core.state().score;
  core.applyIdleCrossing(1); // a futó a középső (1.) sávban, a jó válasz is ott
  assert.equal(core.state().turboMs, TURBO_MS);
  assert.ok(core.state().waveGap > gap0);
  assert.equal(core.state().combo.count, 0);
  core.applyOutcome({ id: 1, result: "timeout", pickedOption: null, correctOption: 1 });
  assert.equal(core.state().stumbleMs, 0, "a lejárt kimenet a világban már nem hat újra");
  assert.equal(core.state().gatesWrong, 0);
  assert.ok(core.state().score - score0 < 30, "kapu-pont nem jár");
  core.placeGate({ id: 2, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.input.laneDelta = 1;
  core.step(STEP, 0.4);
  assert.equal(core.hadInputSinceGate(), true, "a sávváltás szándékos bemenet");
  core.placeGate({ id: 3, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.markInput();
  assert.equal(core.hadInputSinceGate(), true, "a koppintás szándékos bemenet");
});

test("A2 (D-J1a-14): közel nulla résnél a rossz kapu botlása nem zárja le azonnal a menetet (1,5 mp kegyelmi rés)", () => {
  const core = freshCore(4);
  stepFor(core, 31_000);
  (core.state() as Mutable<TsunamiState>).waveGap = 0.5;
  core.placeGate({ id: 1, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.applyOutcome({ id: 1, result: "wrong", pickedOption: 0, correctOption: 1 });
  stepFor(core, 1400);
  assert.equal(core.running(), true, "a kegyelmi rés alatt a hullám nem ér utol");
  assert.ok(core.state().waveGap >= 2 - 1e-9);
});

test("A1: a sáv ↔ opció leképezés a mag és a lap közös függvénye (3 és 2 opció)", async () => {
  const { optionForLane, laneForOption } = await import("../client/src/lib/tsunami/core");
  assert.deepEqual([0, 1, 2].map((l) => optionForLane(l, 3)), [0, 1, 2]);
  assert.deepEqual([0, 1, 2].map((l) => optionForLane(l, 2)), [0, -1, 1]);
  assert.deepEqual([0, 1].map((o) => laneForOption(o, 2)), [0, 2]);
  const core = freshCore();
  assert.deepEqual(core.placeGate({ id: 1, windowMs: 4500, slowMo: 0.6, optionCount: 2 }).laneOptions, [0, -1, 1]);
});

test("M3 (D-J1a-11): a kapu-tábla beférés-becslése a tábla valódi szélességével számol; a director a beférő tételt kéri előbb", async () => {
  const { gateLabelFits } = await import("../client/src/lib/tsunami/core");
  assert.equal(gateLabelFits("labdarúgás, foci"), true);
  assert.equal(gateLabelFits("Mert a növények fotoszintézissel oxigént termelnek"), false);
  const c = tsunamiDirectorConfig(5);
  assert.equal(c.promptFits!({ id: "x", prompt: "Miért fontos az erdő?", options: ["rövid", "más", "Mert a növények fotoszintézissel oxigént termelnek", "x"], correctIndex: 0 }), false);
  assert.equal(c.promptFits!({ id: "y", prompt: "Mi a fa?", options: ["növény", "állat", "kő", "víz"], correctIndex: 0 }), true);
});

test("átmeneti kapu 3a: a kérdés ELŐTTI bemenet nem számít szándékos válasznak (tétlen átfutás marad)", () => {
  const core = freshCore(6);
  stepFor(core, 31_000);
  core.input.laneDelta = 1;
  core.input.jump = true;
  core.step(STEP, 0.4);
  core.markInput();
  core.placeGate({ id: 1, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  assert.equal(core.hadInputSinceGate(), false, "a kapu lerakása előtti bemenet nem számít");
});

test("átmeneti kapu 3e: győzelem és vereség ugyanabban a lépésben — a győzelem nyer, és a vég után semmi nem fordít", () => {
  const core = freshCore(7);
  stepFor(core, 31_000);
  const st = core.state() as Mutable<TsunamiState>;
  st.distance = core.tuning().levelDistance - 0.01;
  st.waveGap = 0.001;
  core.step(STEP, 1);
  assert.equal(core.state().phase, "won");
  core.placeGate({ id: 9, windowMs: 4500, slowMo: 0.6, optionCount: 3 });
  core.applyOutcome({ id: 9, result: "wrong", pickedOption: 0, correctOption: 1 });
  stepFor(core, 2000);
  assert.equal(core.state().phase, "won", "a vég után (a kijelzés alatt) sem fordul vereségre");
  const c2 = freshCore(8);
  stepFor(c2, 31_000);
  (c2.state() as Mutable<TsunamiState>).waveGap = 0.001;
  c2.step(STEP, 1);
  assert.equal(c2.state().phase, "lost");
  (c2.state() as Mutable<TsunamiState>).distance = c2.tuning().levelDistance + 5;
  stepFor(c2, 500);
  assert.equal(c2.state().phase, "lost", "a vereség után sem fordul győzelemre");
});
