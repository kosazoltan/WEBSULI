import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createRng, seedFrom } from "../shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  restoreReviewQuestion,
  type QuestionProvider,
} from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import { createQuestionUi, REVEAL_WRONG_MS } from "../client/src/game-engine/play/questionUi";
import { SIM_STEP_MS } from "../client/src/game-engine/play/loop";
import {
  AIR, DIRT, GRASS, IRON, LEAVES, RUNE_ORE, STONE, WX, WY, WZ, findVoxelSpawn, generateVoxelWorld, vGet, vSet,
  type VoxelWorld,
} from "../client/src/lib/voxelcraft";
import {
  BLOCK_CRAFT_GAME_ID,
  BLOCK_CRAFT_LEVELS,
  RUNE_CHECK_MS,
  RUNE_LOOT_CORRECT,
  RUNE_LOOT_WRONG,
  RUNE_NEAR_RADIUS,
  RUNE_SLOW_MO,
  TAP_HITS,
  blockCraftDirectorConfig,
  canHostRune,
  createRuneMine,
  genCfgFor,
  mineTimeMs,
  nearestRune,
  pickRuneStone,
  runeStoneLayout,
  surfaceTop,
  type RuneMine,
  type RuneMineEvent,
  type Vec3,
} from "../client/src/lib/blockcraft/core";

/**
 * J3a — a Rúnabánya tiszta magja (végrehajtás J3a 2., 5.; terv 5.3, J-BC): a sima blokk kérdés nélkül bányászható
 * (tartás / koppintás), rúnaérc mindig elérhető, a Rúna-zár a kérdés-sávon át nyílik és old fel, a zsákmány a válasz
 * kimenetétől függ, a pálya-cél a kinyitott zárak száma.
 */

const T0 = 1_800_000_000_000;
const STEP = SIM_STEP_MS;

/** Sík, üres próbavilág: bedrock + kő, a felszín y=4-ig, fölötte levegő. */
function flatWorld(): VoxelWorld {
  const w = new Uint8Array(WX * WY * WZ);
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
    vSet(w, x, 0, z, STONE);
    for (let y = 1; y <= 3; y++) vSet(w, x, y, z, DIRT);
    vSet(w, x, 4, z, GRASS);
  }
  return w;
}

type Rig = { mine: RuneMine; player: Vec3; events: RuneMineEvent[]; requests: number; ui: ReturnType<typeof createQuestionUi> | null; tick(ms: number): void };

function rig(opts: { questions?: boolean; bankSize?: number; world?: VoxelWorld; seed?: number } = {}): Rig {
  const player: Vec3 = { x: 24.5, y: 5, z: 24.5 };
  const bankSize = opts.bankSize ?? 200;
  let n = 0;
  const provider: QuestionProvider = {
    couponOnly: false,
    material: () => null,
    fresh: () => (n < bankSize ? bankPlayQuestion(BLOCK_CRAFT_GAME_ID, { id: `q${n}`, prompt: `Kérdés ${n++}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }) : null),
    restore: (it) => restoreReviewQuestion(it, {}),
  };
  const director = createQuestionDirector({
    config: blockCraftDirectorConfig(7),
    provider,
    review: createReviewQueue(null, { now: () => T0, rng: createRng("r") }),
    rng: createRng("q"),
    startBand: 0.4,
    now: () => T0,
  });
  const r: Rig = { mine: null as unknown as RuneMine, player, events: [], requests: 0, ui: null, tick: () => {} };
  const ui = opts.questions === false ? null : createQuestionUi({
    director: () => director,
    onView: () => {},
    onShow: (p) => r.mine.noteShow(p),
    onOutcome: (o, p) => r.mine.applyOutcome(o, p),
  });
  if (ui) {
    const orig = ui.request.bind(ui);
    ui.request = (reason, clock) => {
      r.requests += 1;
      return orig(reason, clock);
    };
  }
  r.ui = ui;
  r.mine = createRuneMine({ seed: opts.seed ?? 1, questions: () => ui, movePlayer: () => {}, player: () => player, minGapMs: 1500 });
  r.mine.startLevel(opts.world ?? flatWorld(), 0, { x: 0, z: -1 });
  r.tick = (ms: number) => {
    const frames = Math.round(ms / STEP);
    for (let i = 0; i < frames; i++) {
      r.mine.frame(STEP, false);
      r.mine.drain((e) => r.events.push(e));
    }
  };
  return r;
}

test("sima blokk tartással kérdés nélkül: fű / föld 0,4 mp, kő 0,8 mp, érc 1,2 mp — kérdés nem nyílik", () => {
  assert.equal(mineTimeMs(GRASS), 400);
  assert.equal(mineTimeMs(DIRT), 400);
  assert.equal(mineTimeMs(STONE), 800);
  assert.equal(mineTimeMs(IRON), 1200);
  for (const [t, ms] of [[GRASS, 400], [STONE, 800], [IRON, 1200]] as const) {
    const r = rig();
    const w = r.mine.state().world;
    vSet(w, 20, 5, 20, t);
    r.mine.aim({ x: 20, y: 5, z: 20 });
    r.mine.press();
    r.tick(ms - 100);
    assert.equal(vGet(w, 20, 5, 20), t, `${t}: ${ms - 100} ms után még áll`);
    r.tick(150);
    assert.equal(vGet(w, 20, 5, 20), AIR, `${t}: ${ms + 50} ms után kibányászva`);
    assert.equal(r.requests, 0, "sima blokknál nincs kérdés-kérés");
    assert.equal(r.ui!.active(), null);
    assert.ok(r.events.some((e) => e.type === "mined" && e.t === t));
    assert.equal(r.mine.state().blocks, 1);
  }
});

test("koppintós mód: egy koppintás egy ütés, 3 ütés = egy blokk; másik blokkra váltás nullázza", () => {
  assert.equal(TAP_HITS, 3);
  const r = rig();
  const w = r.mine.state().world;
  vSet(w, 10, 5, 10, STONE);
  vSet(w, 12, 5, 12, STONE);
  r.mine.hit({ x: 10, y: 5, z: 10 });
  r.mine.hit({ x: 10, y: 5, z: 10 });
  r.mine.hit({ x: 12, y: 5, z: 12 }); // másik blokk: az előző ütései elvesznek
  r.mine.hit({ x: 10, y: 5, z: 10 });
  r.mine.hit({ x: 10, y: 5, z: 10 });
  assert.equal(vGet(w, 10, 5, 10), STONE, "4 ütés két blokk között szétosztva még nem elég");
  r.mine.hit({ x: 10, y: 5, z: 10 });
  assert.equal(vGet(w, 10, 5, 10), AIR);
  // A Bányász-gomb rövid nyomása (< 250 ms) is ütés.
  r.mine.aim({ x: 12, y: 5, z: 12 });
  for (let i = 0; i < 3; i++) {
    r.mine.press();
    r.tick(50);
    r.mine.release();
  }
  assert.equal(vGet(w, 12, 5, 12), AIR);
  assert.equal(r.requests, 0);
});

test("a tartás a következő blokkra is folytatódik (a célkereszt alatti új blokk)", () => {
  const r = rig();
  const w = r.mine.state().world;
  vSet(w, 5, 5, 5, LEAVES);
  vSet(w, 5, 6, 5, LEAVES);
  r.mine.aim({ x: 5, y: 5, z: 5 });
  r.mine.press();
  r.tick(450);
  assert.equal(vGet(w, 5, 5, 5), AIR);
  r.mine.aim({ x: 5, y: 6, z: 5 });
  r.tick(450);
  assert.equal(vGet(w, 5, 6, 5), AIR);
  r.mine.release();
});

test("rúnaérc mindig elérhető: a játékos 8 blokkos körzetében RUNE_CHECK_MS-en belül van (20 seed, vándorló játékos, 180 mp)", () => {
  for (let s = 1; s <= 20; s++) {
    const cfg = BLOCK_CRAFT_LEVELS[(s - 1) % BLOCK_CRAFT_LEVELS.length]!;
    const world = generateVoxelWorld(genCfgFor(cfg), createRng(seedFrom("t", s)).next);
    const spawn = findVoxelSpawn(world);
    const player: Vec3 = { ...spawn };
    const walk = createRng(seedFrom("walk", s));
    let heading = walk.next() * Math.PI * 2;
    const mine = createRuneMine({
      seed: s,
      questions: () => null,
      minGapMs: 1500,
      player: () => player,
      movePlayer: (dt) => {
        if (walk.next() < 0.01) heading = walk.next() * Math.PI * 2;
        player.x = Math.min(WX - 1.5, Math.max(1.5, player.x + Math.sin(heading) * 4.3 * (dt / 1000)));
        player.z = Math.min(WZ - 1.5, Math.max(1.5, player.z + Math.cos(heading) * 4.3 * (dt / 1000)));
      },
    });
    mine.startLevel(world, 0, { x: 0, z: -1 });
    let without = 0;
    let worst = 0;
    for (let t = 0; t < 180_000; t += STEP) {
      mine.frame(STEP, false);
      mine.drain(() => {});
      // A játékos minden 5. mp-ben kibányássza a legközelebbi ércet (elfogynak a közeliek).
      const st = mine.state();
      let broke = false;
      if (Math.floor(t / 5000) !== Math.floor((t + STEP) / 5000)) {
        const near = nearestRune(st.ores, player.x, player.z).ore;
        if (near) mine.hit(near);
        broke = near !== null;
        st.phase = "play"; // a pálya-cél itt nem számít: a teszt az elérhetőséget méri
      }
      const d = nearestRune(st.ores, player.x, player.z).dist;
      // A „körzet üres” szakasz a kiürülés pillanatától számít (az elbányászott érc után újraindul).
      without = d <= RUNE_NEAR_RADIUS ? 0 : broke ? STEP : without + STEP;
      worst = Math.max(worst, without);
    }
    assert.ok(worst <= RUNE_CHECK_MS + 2 * STEP, `seed ${s}: ${worst.toFixed(0)} ms rúnaérc nélkül a körzetben`);
  }
});

test("a rúnaérc a felszínen nő (fölötte szabad), és a pálya elején az első a kezdő nézés irányában, közel van", () => {
  const r = rig();
  const st = r.mine.state();
  assert.ok(st.ores.length >= 3);
  for (const o of st.ores) {
    assert.equal(vGet(st.world, o.x, o.y, o.z), RUNE_ORE);
    assert.equal(vGet(st.world, o.x, o.y + 1, o.z), AIR);
    assert.equal(o.y, surfaceTop(st.world, o.x, o.z));
  }
  const first = st.ores[0]!;
  const d = Math.hypot(first.x + 0.5 - r.player.x, first.z + 0.5 - r.player.z);
  assert.ok(d >= 2.5 && d <= 5.8, `az első érc ${d.toFixed(2)} blokkra`);
  assert.ok(first.z + 0.5 < r.player.z, "a kezdő nézés (−z) irányában");
  assert.equal(canHostRune(st.world, 0, 0), false, "a világ szélén nem nő");
});

test("Rúna-zár: a rúnaérc érintése kérdést nyit, a kövek a játékos felé néznek; jó válasz = dupla zsákmány, kombó, a zár feloldva", () => {
  const r = rig();
  const st = r.mine.state();
  const ore = st.ores[0]!;
  r.mine.hit(ore);
  const lock = st.lock!;
  assert.ok(lock, "a zár megnyílt");
  assert.equal(r.requests, 1);
  const p = r.ui!.active()!;
  assert.equal(lock.presentationId, p.id);
  assert.equal(lock.stones.length, p.options.length);
  assert.equal(p.slowMo, RUNE_SLOW_MO);
  assert.equal(r.mine.loop.timeScale(), 1, "a lassítás a következő képkockán áll be");
  r.tick(STEP);
  assert.equal(r.mine.loop.timeScale(), RUNE_SLOW_MO, "nyitott kérdés alatt a világ lassítva fut, nem áll");
  // A kövek az érc előtt, a játékos felé (a játékos felőli oldalon).
  for (const s of lock.stones) {
    assert.ok(Math.hypot(s.x - r.player.x, s.z - r.player.z) < Math.hypot(ore.x + 0.5 - r.player.x, ore.z + 0.5 - r.player.z));
  }
  const correct = p.options.findIndex((o) => o.correct);
  r.mine.pick(correct);
  assert.equal(st.crystals, RUNE_LOOT_CORRECT);
  assert.equal(st.opened, 1);
  assert.equal(st.combo.count, 1);
  assert.equal(vGet(st.world, ore.x, ore.y, ore.z), AIR, "az érc kitört");
  r.mine.drain((e) => r.events.push(e));
  assert.ok(r.events.some((e) => e.type === "runeBreak" && e.result === "correct" && e.crystals === 2));
});

test("rossz válasz: kisebb zsákmány, a kombó megszakad, a helyes rúna a megoldás-kijelzés alatt (≥ 1,8 mp) látszik", () => {
  const r = rig();
  const st = r.mine.state();
  const ore = st.ores[0]!;
  r.mine.hit(ore);
  const p = r.ui!.active()!;
  const wrong = p.options.findIndex((o) => !o.correct);
  r.mine.pick(wrong);
  assert.equal(st.crystals, RUNE_LOOT_WRONG);
  assert.equal(st.opened, 1, "a zár így is kinyílik (a cél nem akad el), csak a zsákmány kisebb");
  assert.equal(st.combo.count, 0);
  assert.equal(st.lock?.resolved, "wrong");
  const correctIdx = p.options.findIndex((o) => o.correct);
  let shownMs = 0;
  while (st.lock && shownMs < 5000) {
    assert.equal(r.ui!.view().reveal?.correctOptionIndex, correctIdx);
    r.tick(STEP);
    shownMs += STEP;
  }
  assert.ok(shownMs >= 1800 && shownMs >= REVEAL_WRONG_MS - 2 * STEP, `a zár ${shownMs.toFixed(0)} ms-ig mutatta a megoldást`);
  assert.equal(r.mine.loop.timeScale(), 1, "a kijelzés alatt teljes sebesség");
});

test("lejárt ablak = rossz válasz (kisebb zsákmány); a kijelzés alatt megérintett érc kérdése a kijelzés végén nyílik", () => {
  const r = rig();
  const st = r.mine.state();
  const [a, b] = st.ores;
  r.mine.hit(a!);
  const p = r.ui!.active()!;
  r.tick(p.windowMs + 50);
  assert.equal(st.lock?.resolved, "timeout");
  assert.equal(st.crystals, RUNE_LOOT_WRONG);
  r.mine.hit(b!);
  assert.deepEqual(st.pendingOre, b, "a kijelzés alatt a kérés függőben vár");
  r.tick(REVEAL_WRONG_MS + 100);
  assert.ok(st.lock && st.lock.resolved === null, "a kijelzés után a második zár megnyílt");
  assert.deepEqual(st.lock.ore, b);
});

test("kérdés nélküli mód és üres forrás (terv 8.1): a rúnaérc zár nélkül törik, a pálya így is teljesíthető", () => {
  const noQ = rig({ questions: false });
  const st = noQ.mine.state();
  const goal = st.goal;
  for (let i = 0; i < goal; i++) {
    noQ.mine.hit(st.ores[0]!);
    noQ.tick(STEP);
  }
  assert.equal(st.opened, goal);
  assert.equal(st.phase, "won");
  const empty = rig({ bankSize: 0 });
  const es = empty.mine.state();
  empty.mine.hit(es.ores[0]!);
  empty.tick(50);
  assert.equal(es.opened, 1, "üres forrásnál az érc kérdés nélkül tört");
  assert.equal(es.lock, null);
});

test("pálya-cél: N kinyitott rúnaérc után győzelem; a nyitott kérdés lezárul, új nem indul", () => {
  const r = rig();
  const st = r.mine.state();
  assert.equal(st.goal, BLOCK_CRAFT_LEVELS[0]!.runeGoal);
  assert.deepEqual(BLOCK_CRAFT_LEVELS.map((l) => l.runeGoal), [3, 4, 5, 6, 7]);
  while (st.phase === "play") {
    const near = nearestRune(st.ores, r.player.x, r.player.z).ore!;
    r.mine.hit(near);
    const p = r.ui!.active();
    if (p) r.mine.pick(p.options.findIndex((o) => o.correct));
    r.tick(1600);
  }
  assert.equal(st.phase, "won");
  assert.equal(st.opened, st.goal);
  assert.ok(r.ui!.finished());
  r.tick(1000);
  assert.equal(r.ui!.active(), null);
});

test("rúnakő-találat: a sugár a középre célzott követ választja, a kövek nem fedik egymást", () => {
  const ore = { x: 10, y: 5, z: 10 };
  const player = { x: 10.5, y: 6.6, z: 14 };
  const stones = runeStoneLayout(ore, player, 4);
  assert.equal(stones.length, 4);
  for (let i = 0; i < stones.length; i++) for (let j = i + 1; j < stones.length; j++) {
    const d = Math.hypot(stones[i]!.x - stones[j]!.x, stones[i]!.y - stones[j]!.y, stones[i]!.z - stones[j]!.z);
    assert.ok(d >= 0.6, `a ${i}. és ${j}. kő ${d.toFixed(2)} távol`);
  }
  const eye = { x: 10.5, y: 6.6, z: 14 };
  for (let i = 0; i < stones.length; i++) {
    const s = stones[i]!;
    const len = Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z);
    const dir = { x: (s.x - eye.x) / len, y: (s.y - eye.y) / len, z: (s.z - eye.z) / len };
    assert.equal(pickRuneStone(eye, dir, stones), i);
  }
  assert.equal(pickRuneStone(eye, { x: 0, y: 1, z: 0 }, stones), -1, "az égre nézve nincs találat");
});

test("a lap: a pálya ideje nem függ a válaszoktól (a régi időcsökkentés megszűnt), és nincs kvíz-fázis", () => {
  const src = readFileSync(fileURLToPath(new URL("../client/src/pages/BlockCraftQuiz.tsx", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  // A forrást nem írjuk a hibaüzenetbe (assert.ok + saját üzenet).
  assert.ok(!/setPhase\("quiz"\)/.test(src), "J3 elfogadás: nincs setPhase(\"quiz\")");
  assert.ok(!/nextBudget - previousBudget/.test(src), "a jó válasz nem módosítja a hátralévő időt");
  // A setTimeLeft csak a pálya indításakor és a másodpercenkénti órában szerepel.
  const sets = src.match(/setTimeLeft\(/g)?.length ?? 0;
  assert.equal(sets, 2, `setTimeLeft hívások: ${sets}`);
  assert.ok(!/aria-label="Mini-teszt"/.test(src), "a régi teljes képernyős kvíz-modál megszűnt");
});
