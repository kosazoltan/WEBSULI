import assert from "node:assert/strict";
import test from "node:test";

import { medianOf, runSim, runSimSeeds, SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, type SimGameFactory } from "./support/game-sim";
import { createSimGame } from "../client/src/lib/blockcraft/sim";
import {
  BLOCK_CRAFT_LEVELS, blockCraftDirectorConfig, createRuneMine, genCfgFor, mineFingerprint, nearestRune, RUNE_SLOW_MO,
} from "../client/src/lib/blockcraft/core";
import { findVoxelSpawn, generateVoxelWorld } from "../client/src/lib/voxelcraft";
import { createRng } from "../shared/game-rng";
import { MIN_SLOW_MO, SIM_STEP_MS } from "../client/src/game-engine/play/loop";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";

/**
 * J3a — a Rúnabánya szimulációs elfogadása (végrehajtás J3a 5., K.6; terv 6.2, J2, J3, J4, J6, J7, J10): 20 seed
 * (`seedFrom("sim", "block-craft-quiz", i)`), 180 mp, a közös `SIM_*` játékosmodellek. A sim ugyanazt a magot
 * (`createRuneMine`), kérdés-ütemezőt és kérdés-sáv állapotgépet hajtja, mint a lap (K.6 „Közös meghajtó”).
 */

const GAME = "block-craft-quiz" as const;
const factory = (extra: Record<string, unknown> = {}): SimGameFactory => (o) => createSimGame({ ...o, ...extra });

const avg = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 180 });
/** Review #484 H1: a „bányászó, nem siető” játékos (minden zár után 7 mp szabad bányászás, csak utána keres ércet). */
const miner = factory({ style: "miner" });
const avgMiner = runSimSeeds(miner, SIM_AVERAGE, { gameId: GAME, seconds: 180 });

test("J2: kérdés/perc (20 seed medián) ≥ 7 — rúnavadász és bányászó játékosnál, átlagos / 3–4. évfolyamos / gyenge modellel", () => {
  for (const [style, f, avgRuns] of [["rúnavadász", factory(), avg], ["bányászó", miner, avgMiner]] as const) {
    const perMin = medianOf(avgRuns.map((r) => r.stats.perMinute));
    assert.ok(perMin >= 7, `${style} SIM_AVERAGE medián ${perMin.toFixed(2)} / perc`);
    const young = runSimSeeds(f, SIM_YOUNG, { gameId: GAME, seconds: 180, grade: 4 });
    assert.ok(medianOf(young.map((r) => r.stats.perMinute)) >= 7, `${style} SIM_YOUNG (4. évf.)`);
    const weak = runSimSeeds(f, SIM_WEAK, { gameId: GAME, seconds: 180 });
    assert.ok(medianOf(weak.map((r) => r.stats.perMinute)) >= 7, `${style} SIM_WEAK`);
  }
});

test("J3: a menet első 10 mp-e után nincs 15 mp-nél hosszabb kérdés nélküli szakasz (minden futás, mindkét játékosstílus); két indítás között ≥ 1,5 mp", () => {
  for (const [style, f, avgRuns] of [["rúnavadász", factory(), avg], ["bányászó", miner, avgMiner]] as const) {
    for (const player of [SIM_AVERAGE, SIM_WEAK, SIM_STRONG, SIM_YOUNG]) {
      const runs = player === SIM_AVERAGE ? avgRuns : runSimSeeds(f, player, { gameId: GAME, seconds: 180, grade: player === SIM_YOUNG ? 4 : 7 });
      for (const r of runs) {
        assert.ok(r.stats.maxGapSec <= 15, `${style} maxGap ${r.stats.maxGapSec}`);
        assert.ok(r.stats.minGapSec >= 1.5, `${style} minGap ${r.stats.minGapSec}`);
      }
    }
  }
});

test("H1 (review #484): a sim valóban bányászik — a terep akadályait kivágja, a bányászó játékos ideje közel fele bányászás, a rúnaérc a kibányászott helyen is előbukkan", () => {
  const hunters: ReturnType<typeof createSimGame>[] = [];
  const miners: ReturnType<typeof createSimGame>[] = [];
  runSimSeeds((o) => { const g = createSimGame({ ...o }); hunters.push(g); return g; }, SIM_AVERAGE, { gameId: GAME, seconds: 180 });
  runSimSeeds((o) => { const g = createSimGame({ ...o, style: "miner" }); miners.push(g); return g; }, SIM_AVERAGE, { gameId: GAME, seconds: 180 });
  assert.ok(hunters.reduce((s, g) => s + g.blocksMined(), 0) > 0, "a rúnavadász is kivág akadályt");
  const share = medianOf(miners.map((g) => g.miningShare()));
  assert.ok(share >= 0.4, `bányászási arány (medián) ${share.toFixed(2)}`);
  assert.ok(medianOf(miners.map((g) => g.revealed())) >= 5, "felfedezett rúnaércek");
});

test("B1 (review #484): a „tovább bányászó” bot (a zár nyílása után 150–500 ms-ig koppint az ércre) sosem választ rúnakövet", () => {
  for (const style of ["hunter", "miner"] as const) {
    for (const player of [SIM_AVERAGE, SIM_WEAK, SIM_STRONG]) {
      const games: ReturnType<typeof createSimGame>[] = [];
      runSimSeeds((o) => { const g = createSimGame({ ...o, style }); games.push(g); return g; }, player, { gameId: GAME, seconds: 180 });
      const taps = games.reduce((s, g) => s + g.keepTaps(), 0);
      assert.ok(taps > 200, `${style}: a mérés nem üres (${taps} koppintás)`);
      assert.equal(games.reduce((s, g) => s + g.accidentalPicks(), 0), 0, `${style}: téves válasz`);
    }
  }
});

test("J1 (mag): nyitott kérdés alatt a szimuláció lassítva fut, nem áll — sim-idő / kérdés-óra = slowMo (≥ 0,35)", () => {
  assert.ok(RUNE_SLOW_MO >= MIN_SLOW_MO);
  const g = createSimGame({ seed: 7, grade: 7, questions: true });
  let open: { sim0: number; clock0: number } | null = null;
  let ratio = Number.NaN;
  for (let i = 0; i < 60 * 60 && Number.isNaN(ratio); i++) {
    const q = g.question();
    if (q && !open) open = { sim0: g.mine.loop.simTimeMs(), clock0: g.simTimeMs() };
    if (q && open && g.simTimeMs() - open.clock0 >= 2000) ratio = (g.mine.loop.simTimeMs() - open.sim0) / (g.simTimeMs() - open.clock0);
    g.step(1000 / 60, { skillRoll: 0.5 });
  }
  assert.ok(Math.abs(ratio - RUNE_SLOW_MO) < 0.02, `arány ${ratio}`);
});

test("J4: ismétlés — arány ≤ 30%, a hibázott tételek ≥ 95%-a (medián) a 3.–6. kérdésként visszatér; gyengénél ≥ 60% 10-en belül", () => {
  for (const r of avg) assert.ok(r.stats.reviewShare <= 0.3 + 1e-9, `reviewShare ${r.stats.reviewShare}`);
  const within6 = medianOf(avg.map((r) => r.stats.reviewReturnWithin6));
  assert.ok(within6 >= 0.95, `3.–6. kérdésen belül: ${within6}`);
  const weak = runSimSeeds(factory(), SIM_WEAK, { gameId: GAME, seconds: 180 });
  assert.ok(medianOf(weak.map((r) => r.stats.reviewReturnWithin10)) >= 0.6);
});

test("J6: az új (nem ismétlő) kérdések bármely 40-es ablaka duplikátum nélküli (≥ 200 tételes forrás)", () => {
  for (const r of avg) {
    const fresh = r.stats.asked - r.stats.reviewsAsked;
    assert.equal(r.stats.freshWindow40Distinct, Math.min(40, fresh), `freshWindow40Distinct ${r.stats.freshWindow40Distinct} (${fresh} új)`);
  }
});

test("J7: elérhető tananyag-tételnél az első rúnazár tananyag, utána a bank folytatja", () => {
  const material = [1, 2, 3].map((n) => ({ id: `m${n}`, prompt: `Tananyag ${n}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  const g = createSimGame({ seed: 5, grade: 7, questions: true, material });
  for (let i = 0; i < 60 * 90 && !g.done(); i++) {
    const q = g.question();
    if (q) g.answer(q.id, q.correctOption);
    g.step(1000 / 60, { skillRoll: 0.5 });
  }
  const keys = g.askedKeys();
  assert.equal(g.stats().firstSource, "material");
  assert.deepEqual(keys.slice(0, 3), ["mat:m1", "mat:m2", "mat:m3"]);
  assert.ok(keys.slice(3).every((k) => k.startsWith("bank:")));
});

test("J10: a válaszablak rövid tételnél 5 mp (3–4. évfolyamon 6,25 mp), hosszúnál olvasási pótlékkal, ≤ 9 mp", () => {
  const cfg = blockCraftDirectorConfig(7);
  assert.equal(cfg.maxGapMs, 15_000);
  assert.equal(cfg.targetPerMin, 7);
  assert.equal(windowMsFor("„Stone” jelentése:", 7, cfg.baseWindowMs), 5000);
  assert.equal(windowMsFor("„Stone” jelentése:", 4, cfg.baseWindowMs), 6250);
  assert.ok(windowMsFor("x".repeat(400), 3, cfg.baseWindowMs) <= 9000);
});

test("J9 (tájékoztató, a J3c elfogadása): az 5 pálya a SIM_AVERAGE-nél 2–5 perc alatt végigjátszható", () => {
  const full = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 600 });
  const dur = medianOf(full.map((r) => r.durationSec));
  assert.ok(full.every((r) => r.won), "minden menet végigér");
  assert.ok(dur >= 120 && dur <= 300, `medián ${dur.toFixed(0)} mp`);
});

test("K.6 kérdés nélkül (questions: false) és üres forrással: a menet végigjátszható (J3a-ban még nincs vereség — J3b)", () => {
  const noQ = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 600, questions: false });
  assert.ok(noQ.every((r) => r.won && r.durationSec < 600), "minden menet végigér");
  assert.ok(noQ.every((r) => r.stats.asked === 0));
  const empty = runSim(factory({ bankSize: 0 }), SIM_AVERAGE, { seed: 3, seconds: 600 });
  assert.equal(empty.stats.asked, 0);
  assert.ok(empty.won);
});

test("arany visszajátszás: fix seed + bot-bemenet → azonos végállapot és statisztika; a lenyomat rögzített", () => {
  const a = createSimGame({ seed: 42, grade: 7, questions: true });
  const b = createSimGame({ seed: 42, grade: 7, questions: true });
  const ra = runSim(() => a, SIM_AVERAGE, { seed: 42, seconds: 180 });
  const rb = runSim(() => b, SIM_AVERAGE, { seed: 42, seconds: 180 });
  assert.deepEqual(ra, rb);
  assert.equal(mineFingerprint(a.mine.state()), mineFingerprint(b.mine.state()));
  assert.equal(mineFingerprint(a.mine.state()), GOLDEN_42);
});

test("közös meghajtó (C-52): lépés-indexhez kötött bemenettel eltérő képkocka-időknél bitre azonos az állapot", () => {
  // Ugyanaz a menet 60 Hz-es és 30 Hz-es képkockákkal: a mozgás a fix lépésben fut, a bemenet (érc-koppintás, bányászó
  // tartás) lépés-indexhez kötött — a fix lépésű hurok miatt a lépések sora, így a végállapot is azonos.
  const run = (stepsPerFrame: 1 | 2) => {
    const world = generateVoxelWorld(genCfgFor(BLOCK_CRAFT_LEVELS[0]!), createRng("c52").next);
    const player = { ...findVoxelSpawn(world) };
    let dir = 1;
    const mine = createRuneMine({
      seed: 9,
      questions: () => null,
      minGapMs: 1500,
      player: () => player,
      movePlayer: (dt) => {
        player.x += dir * 0.003 * dt;
        if (player.x > 40 || player.x < 8) dir = -dir;
      },
    });
    mine.startLevel(world, 0, { x: 0, z: -1 });
    const steps = () => Math.round(mine.loop.simTimeMs() / SIM_STEP_MS);
    while (steps() < 2400) {
      mine.frame(SIM_STEP_MS * stepsPerFrame, false);
      mine.drain(() => {});
      const k = steps();
      if (k > 0 && k % 120 === 0) {
        const st = mine.state();
        const near = nearestRune(st.ores, player.x, player.z).ore;
        if (near) mine.hit(near);
        const below = { x: Math.floor(player.x), y: 4, z: Math.floor(player.z) };
        mine.aim(below);
        if (k % 240 === 0) mine.press();
        else mine.release();
        st.phase = "play";
      }
    }
    return mineFingerprint(mine.state());
  };
  const a = run(1);
  assert.equal(a, run(2));
  assert.notEqual(a.split("|")[4], "0", "a próba valóban bányászott");
});

// SPEC-VÁLTOZÁS (review #484 H1): a bot terepen jár és bányászik, a zár élesítéssel nyílik — új lenyomat.
const GOLDEN_42 = "won|4|7|37|3|1042|4|1|4a002bdc";
