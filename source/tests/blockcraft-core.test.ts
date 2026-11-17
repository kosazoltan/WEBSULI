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
  RUNE_ARM_MS,
  RUNE_CHECK_MS,
  RUNE_LOOT_CORRECT,
  RUNE_LOOT_WRONG,
  RUNE_NEAR_RADIUS,
  RUNE_REVEAL_GAP_MS,
  RUNE_SLOW_MO,
  RUNE_STONE_HIT_RADIUS,
  RUNE_XP_FREE,
  RUNE_XP_WRONG,
  TAP_HITS,
  blockCraftDirectorConfig,
  canHostRune,
  createRuneMine,
  genCfgFor,
  levelClockTick,
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

test("Rúna-zár: a rúnaérc érintése kérdést nyit, a kövek az érc fölött, a nézésre merőleges síkban állnak; élesítés után jó válasz = dupla zsákmány, kombó, a zár feloldva", () => {
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
  // SPEC-VÁLTOZÁS (review #484 B1/4): a kövek nem az érc ELŐTT (a célkereszt útjában), hanem az érc középpontján átmenő,
  // a vízszintes nézésre merőleges síkban, az érc fölötti íven állnak.
  const fx = r.player.x - (ore.x + 0.5);
  const fz = r.player.z - (ore.z + 0.5);
  const fl = Math.hypot(fx, fz);
  for (const s of lock.stones) {
    assert.ok(Math.abs(((s.x - ore.x - 0.5) * fx + (s.z - ore.z - 0.5) * fz) / fl) < 1e-9, "a kő a nézésre merőleges síkban");
    assert.ok(s.y - RUNE_STONE_HIT_RADIUS >= ore.y + 0.6, `a kő (y ${s.y.toFixed(2)}) az érc fölött`);
  }
  const correct = p.options.findIndex((o) => o.correct);
  assert.equal(r.mine.pick(correct), false, "élesítés (400 ms) előtt nincs válasz");
  r.tick(RUNE_ARM_MS);
  assert.equal(r.mine.pick(correct), true);
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
  r.tick(RUNE_ARM_MS); // review #484 B1: élesítés
  assert.ok(r.mine.pick(wrong));
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

test("lejárt ablak = rossz válasz (kisebb zsákmány); a kijelzés alatt megérintett érc NEM nyílik később magától (L2), újra érintve nyílik", () => {
  const r = rig();
  const st = r.mine.state();
  const [a, b] = st.ores;
  r.mine.hit(a!);
  const p = r.ui!.active()!;
  r.tick(p.windowMs + 50);
  assert.equal(st.lock?.resolved, "timeout");
  assert.equal(st.crystals, RUNE_LOOT_WRONG);
  // SPEC-VÁLTOZÁS (review #484 L2): a kijelzés alatti érintés nem jegyződik elő — nincs ~2 mp-cel később, előjelzés
  // nélkül megnyíló kérdés.
  r.mine.hit(b!);
  assert.equal(st.pendingOre, null, "a kijelzés alatt nincs függő kérés");
  r.tick(REVEAL_WRONG_MS + 100);
  assert.equal(st.lock, null, "a kijelzés után sem nyílt meg magától zár");
  assert.equal(r.ui!.active(), null);
  r.mine.hit(b!);
  const reopened = r.mine.state().lock;
  assert.ok(reopened && reopened.resolved === null, "újra megérintve a második zár megnyílt");
  assert.deepEqual(reopened.ore, b);
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

test("review #484: az utolsó rúnazár az időkeret utolsó másodpercében → győzelem (az óra a cél után áll); fordítva lejárat", () => {
  // Pálya-óra: 1 mp van hátra, a cél egy rúnaércnyire.
  const r = rig();
  const st = r.mine.state();
  st.opened = st.goal - 1;
  r.mine.hit(st.ores[0]!);
  const p = r.ui!.active()!;
  let timeLeft = 1;
  r.tick(RUNE_ARM_MS); // review #484 B1: élesítés (közben óra-lépés nem jött)
  assert.ok(r.mine.pick(p.options.findIndex((o) => o.correct))); // a célt teljesítő válasz az óra-lépés ELŐTT
  assert.equal(st.phase, "won");
  // A megoldás-kijelzés még fut (a lap csak utána mutat eredményt) — közben több óra-lépés is jöhet.
  for (let i = 0; i < 3; i++) {
    const t = levelClockTick(timeLeft, st.phase);
    assert.equal(t.expired, false, "a határidő előtt teljesített pálya nem jár le");
    timeLeft = t.timeLeft;
  }
  assert.equal(timeLeft, 1, "a cél után az óra áll");
  // Fordított sorrend: a lejárat a válasz ELŐTT jön (a zár még nyitott) → a pálya lejár, a kérdés megszakítva zárul.
  const r2 = rig();
  const s2 = r2.mine.state();
  s2.opened = s2.goal - 1;
  r2.mine.hit(s2.ores[0]!);
  assert.ok(r2.ui!.active());
  const t2 = levelClockTick(1, s2.phase);
  assert.equal(t2.expired, true);
  assert.equal(t2.timeLeft, 0);
  assert.equal(r2.ui!.finish()?.result, "aborted", "a nyitott zár kérdése megszakítva zárul (nem hiba, nem ismétlés)");
  assert.deepEqual(levelClockTick(5, "play"), { timeLeft: 4, expired: false });
});

test("a lap: a pálya visszaszámlálása a mag fázisán át (`levelClockTick`) — a cél után nem léptet vereségbe", () => {
  const src = readFileSync(fileURLToPath(new URL("../client/src/pages/BlockCraftQuiz.tsx", import.meta.url)), "utf8");
  assert.ok(/const minePhase = mineRef\.current\?\.state\(\)\.phase[^;]*;\s*if \(minePhase !== "play"\) return;/.test(src), "az óra a cél után is jár");
  assert.ok(/levelClockTick\(s, minePhase\)/.test(src), "a lap nem a közös óra-szabályt használja");
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

/** A review #484 geometriai szkriptje fixture-ként: az érc felénk néző oldallapjára / tetejére célzott sugarak + az érc közepe. */
function oreAimedRays(ore: Vec3, eye: Vec3): Vec3[] {
  const rays: Vec3[] = [];
  for (let a = 0.05; a < 1; a += 0.1) for (let b = 0.05; b < 1; b += 0.1) {
    for (const pt of [{ x: ore.x + a, y: ore.y + b, z: ore.z + 1 }, { x: ore.x + a, y: ore.y + 1, z: ore.z + b }]) {
      if (pt.y === ore.y + 1 && eye.y < ore.y + 1) continue; // a tetőlap nem látszik
      const d = { x: pt.x - eye.x, y: pt.y - eye.y, z: pt.z - eye.z };
      const l = Math.hypot(d.x, d.y, d.z);
      rays.push({ x: d.x / l, y: d.y / l, z: d.z / l });
    }
  }
  const c = { x: ore.x + 0.5 - eye.x, y: ore.y + 0.5 - eye.y, z: ore.z + 0.5 - eye.z };
  const cl = Math.hypot(c.x, c.y, c.z);
  rays.push({ x: c.x / cl, y: c.y / cl, z: c.z / cl });
  return rays;
}

test("B1 (review #484, a reviewer geometriája): az ércre célzó sugár 0%-ban talál rúnakövet (1,5–4 blokk, egy szinten és egy blokkal lejjebb)", () => {
  const ore = { x: 10, y: 20, z: 10 };
  let total = 0;
  for (const dist of [1.5, 2, 2.5, 3, 4]) {
    for (const dy of [0, -1]) {
      const player = { x: 10.5, y: ore.y + dy, z: 10.5 + dist };
      const eye = { x: player.x, y: player.y + 1.62, z: player.z };
      const stones = runeStoneLayout(ore, player, 4);
      const rays = oreAimedRays(ore, eye);
      const hits = rays.filter((u) => pickRuneStone(eye, u, stones) >= 0).length;
      total += rays.length;
      assert.equal(hits, 0, `dist ${dist} dy ${dy}: ${hits}/${rays.length} ércre célzott sugár rúnakövet talált`);
      // A célkereszt (a képernyő közepe) az érc közepén: a kövek a célkereszt-sugártól is távol vannak.
      const c = rays[rays.length - 1]!;
      for (const s of stones) {
        const v = { x: s.x - eye.x, y: s.y - eye.y, z: s.z - eye.z };
        const along = v.x * c.x + v.y * c.y + v.z * c.z;
        const perp = Math.hypot(v.x - c.x * along, v.y - c.y * along, v.z - c.z * along);
        assert.ok(perp > RUNE_STONE_HIT_RADIUS, `a kő ${perp.toFixed(2)} távolságra a célkereszt-sugártól`);
      }
    }
  }
  assert.ok(total > 500, `a mérés nem üres (${total} sugár)`);
});

test("B1 (review #484): élesítés 400 ms; csak az élesítés UTÁN indult lenyomás válaszol; az ércre eső vászon-koppintás nem választ", () => {
  const r = rig();
  const st = r.mine.state();
  const ore = st.ores[0]!;
  r.mine.hit(ore);
  const lock = st.lock!;
  assert.ok(lock);
  assert.ok(RUNE_ARM_MS >= 400);
  assert.equal(lock.armedAt - lock.openedAt, RUNE_ARM_MS);
  const correct = r.ui!.active()!.options.findIndex((o) => o.correct);
  const pressBefore = r.mine.clockMs();
  r.tick(RUNE_ARM_MS / 2);
  assert.equal(r.mine.lockArmed(), false);
  assert.equal(r.mine.pick(correct), false, "élesítés alatt nincs válasz");
  r.tick(RUNE_ARM_MS / 2 + STEP);
  assert.equal(r.mine.lockArmed(), true);
  assert.equal(r.mine.pick(correct, pressBefore), false, "a zár nyitása alatt indult lenyomás felengedése nem válasz");
  // Vászon-koppintás az érc közepére (a voxel-találat az érc): nem választ.
  const eye = { x: r.player.x, y: r.player.y + 1.62, z: r.player.z };
  const c = { x: ore.x + 0.5 - eye.x, y: ore.y + 0.5 - eye.y, z: ore.z + 0.5 - eye.z };
  const cl = Math.hypot(c.x, c.y, c.z);
  assert.equal(r.mine.tapRay(eye, { x: c.x / cl, y: c.y / cl, z: c.z / cl }, r.mine.clockMs(), cl - 0.5), false, "az ércre eső koppintás nem válasz");
  assert.equal(lock.resolved, null);
  // A kőre eső, élesítés utáni koppintás szándékos gesztus: választ.
  const s = lock.stones[correct]!;
  const v = { x: s.x - eye.x, y: s.y - eye.y, z: s.z - eye.z };
  const vl = Math.hypot(v.x, v.y, v.z);
  assert.equal(r.mine.tapRay(eye, { x: v.x / vl, y: v.y / vl, z: v.z / vl }, r.mine.clockMs(), 99), true, "a kőre eső koppintás választ");
  assert.equal(st.lock?.resolved, "correct");
});

test("B1 ellenpróba: ha a sugár első voxel-találata közelebb van a kőnél, a kőre eső koppintás sem választ", () => {
  const r = rig();
  const st = r.mine.state();
  r.mine.hit(st.ores[0]!);
  r.tick(RUNE_ARM_MS + STEP);
  const lock = st.lock!;
  const eye = { x: r.player.x, y: r.player.y + 1.62, z: r.player.z };
  const s = lock.stones[0]!;
  const v = { x: s.x - eye.x, y: s.y - eye.y, z: s.z - eye.z };
  const vl = Math.hypot(v.x, v.y, v.z);
  assert.equal(r.mine.tapRay(eye, { x: v.x / vl, y: v.y / vl, z: v.z / vl }, r.mine.clockMs(), vl - 0.6), false);
  assert.equal(lock.resolved, null);
});

test("M3 (review #484): a zár megnyílása elengedi a tartást; nyitott zár alatt a tartás nem indul és nem bányászik", () => {
  const r = rig();
  const st = r.mine.state();
  const w = st.world;
  const ore = st.ores[0]!;
  r.mine.aim(ore);
  r.mine.press(); // tartás az ércen → zár
  assert.ok(st.lock && st.lock.resolved === null);
  assert.equal(st.mining.pressing, false, "a zár nyitása elengedte a tartást");
  vSet(w, 20, 5, 20, GRASS);
  r.mine.aim({ x: 20, y: 5, z: 20 });
  r.mine.press();
  assert.equal(st.mining.pressing, false, "nyitott zár alatt nem indul tartás");
  r.tick(1000);
  assert.equal(vGet(w, 20, 5, 20), GRASS, "a zár alatt nem bányászik tovább");
  r.mine.release();
  assert.equal(st.lock?.resolved, null, "az elengedés sem válasz");
});

test("H1 (review #484): a bányászó gyerek is kap kérdést — RUNE_REVEAL_GAP_MS után a kibányászott blokk helyén rúnaérc bukkan elő", () => {
  const r = rig();
  const st = r.mine.state();
  const w = st.world;
  vSet(w, 20, 5, 20, GRASS);
  r.mine.aim({ x: 20, y: 5, z: 20 });
  r.mine.press();
  r.tick(450);
  r.mine.release();
  assert.equal(vGet(w, 20, 5, 20), AIR, "a célrésen belül sima bányászás");
  assert.ok(!r.events.some((e) => e.type === "runeSpawn" && e.ore.x === 20 && e.ore.z === 20));
  r.tick(RUNE_REVEAL_GAP_MS);
  vSet(w, 21, 5, 20, GRASS);
  r.mine.aim({ x: 21, y: 5, z: 20 });
  r.mine.press();
  r.tick(450);
  assert.ok(r.events.some((e) => e.type === "runeSpawn" && e.ore.x === 21 && e.ore.y === 5 && e.ore.z === 20), "a kibányászott helyen rúnaérc bukkant elő");
  assert.equal(vGet(w, 21, 5, 20), RUNE_ORE);
  assert.equal(st.mining.pressing, false, "a felfedezés megállítja a tartást");
  r.tick(500);
  assert.equal(st.lock, null, "a lenyomott ujj alatt nem nyílik magától kérdés");
  r.mine.hit({ x: 21, y: 5, z: 20 });
  const touched = r.mine.state().lock;
  assert.ok(touched && touched.resolved === null, "szándékos érintésre zár");
  // Kérdés nélküli módban nincs felfedezés.
  const q = rig({ questions: false });
  vSet(q.mine.state().world, 21, 5, 20, GRASS);
  q.tick(RUNE_REVEAL_GAP_MS + 100);
  q.mine.aim({ x: 21, y: 5, z: 20 });
  q.mine.press();
  q.tick(450);
  assert.equal(vGet(q.mine.state().world, 21, 5, 20), AIR);
});

test("M5 (review #484): a kérdés nélküli zár nem ér többet a rossz válasznál", () => {
  assert.ok(RUNE_XP_FREE <= RUNE_XP_WRONG, `kérdés nélkül ${RUNE_XP_FREE} XP, rossz válasz ${RUNE_XP_WRONG} XP`);
});

test("N2 (review #484, a reviewer stone-overlap2 mérője): körbejárás / fölé állás a zár után — az ércre célzott koppintás SOHA nem választ (tapRay), a nyers geometria viszont talál", () => {
  const r = rig();
  const st = r.mine.state();
  const ore = st.ores[0]!;
  r.mine.hit(ore);
  r.tick(RUNE_ARM_MS + STEP);
  const lock = st.lock!;
  assert.ok(r.mine.lockArmed());
  const c = { x: ore.x + 0.5, y: ore.y + 0.5, z: ore.z + 0.5 };
  const faces = [
    { n: [1, 0, 0], p: (a: number, b: number) => ({ x: ore.x + 1, y: ore.y + a, z: ore.z + b }) },
    { n: [-1, 0, 0], p: (a: number, b: number) => ({ x: ore.x, y: ore.y + a, z: ore.z + b }) },
    { n: [0, 1, 0], p: (a: number, b: number) => ({ x: ore.x + a, y: ore.y + 1, z: ore.z + b }) },
    { n: [0, 0, 1], p: (a: number, b: number) => ({ x: ore.x + a, y: ore.y + b, z: ore.z + 1 }) },
    { n: [0, 0, -1], p: (a: number, b: number) => ({ x: ore.x + a, y: ore.y + b, z: ore.z }) },
  ];
  let n = 0;
  let rawHits = 0;
  for (const phiDeg of [0, 30, 60, 90, 135, 180]) {
    for (const dist of [1.5, 2.5, 3.5]) for (const dy of [-1, 0, 1, 2]) {
      const phi = (phiDeg * Math.PI) / 180;
      const eye = { x: c.x + Math.sin(phi) * dist, y: ore.y + dy + 1.62, z: c.z + Math.cos(phi) * dist };
      for (const f of faces) for (let a = 0.05; a < 1; a += 0.1) for (let b = 0.05; b < 1; b += 0.1) {
        const pt = f.p(a, b);
        const d = { x: pt.x - eye.x, y: pt.y - eye.y, z: pt.z - eye.z };
        if (d.x * f.n[0]! + d.y * f.n[1]! + d.z * f.n[2]! >= 0) continue; // a lap nem néz a szem felé
        const l = Math.hypot(d.x, d.y, d.z);
        const u = { x: d.x / l, y: d.y / l, z: d.z / l };
        n++;
        if (pickRuneStone(eye, u, lock.stones, Math.min(6, l)) >= 0) rawHits++;
        assert.equal(r.mine.tapRay(eye, u, r.mine.clockMs(), l), false, `phi ${phiDeg} dist ${dist} dy ${dy}: az ércre célzott koppintás választott`);
      }
    }
  }
  assert.equal(lock.resolved, null);
  assert.ok(n > 1000, `a mérés nem üres (${n} sugár)`);
  assert.ok(rawHits > 0, `ellenpróba: a nyers geometria (érc-szabály nélkül) ${rawHits} sugárnál követ talál`);
});

test("N1 (review #484): a lap áthelyezheti a köveket (setLockStones) — a kőre eső koppintás az új helyen választ, a régin nem", () => {
  const r = rig();
  const st = r.mine.state();
  r.mine.hit(st.ores[0]!);
  r.tick(RUNE_ARM_MS + STEP);
  const lock = st.lock!;
  const eye = { x: r.player.x, y: r.player.y + 1.62, z: r.player.z };
  const old = { ...lock.stones[2]! };
  const moved = lock.stones.map((s, i) => ({ x: eye.x - 1 + i * 0.7, y: eye.y - 0.4, z: eye.z - 2 }));
  r.mine.setLockStones(moved);
  assert.deepEqual(lock.stones[2], moved[2]);
  r.mine.setLockStones(moved.slice(0, 2)); // rossz darabszám: nem változik
  assert.deepEqual(lock.stones[2], moved[2]);
  const ray = (t: Vec3) => {
    const v = { x: t.x - eye.x, y: t.y - eye.y, z: t.z - eye.z };
    const l = Math.hypot(v.x, v.y, v.z);
    return { u: { x: v.x / l, y: v.y / l, z: v.z / l }, l };
  };
  const o = ray(old);
  assert.equal(r.mine.tapRay(eye, o.u, r.mine.clockMs(), 99), false, "a régi helyen nincs kő");
  const m = ray(moved[2]!);
  assert.equal(r.mine.tapRay(eye, m.u, r.mine.clockMs(), 99), true, "az új helyen a kő választ");
  assert.ok(lock.resolved !== null);
});
