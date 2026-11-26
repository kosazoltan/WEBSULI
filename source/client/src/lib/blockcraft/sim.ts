/**
 * J3a — a Kockavadász „Rúnabánya” node-szimulációja a közös harness-hez (`T/support/game-sim.ts` `SimGame`; végrehajtás
 * J3a 4. lépés, K.6; terv 6.2). React, three.js, DOM és hang nélkül fut.
 *
 * „Rácson járó” modell a seedelt voxel-világon (review #484 H1): a bot a felszínen jár, egy blokknyi lépcsőt megmászik, a
 * magasabb falat / fejmagasságú blokkot (fatörzs, lomb, domb) KIBÁNYÁSSZA a mag tartásos bányászásával (`MINE_MS`: fű / föld
 * 0,4 s, kő 0,8 s, érc 1,2 s), lefelé lelép; víz felett úszik. A rúnaérc-elhelyezés, a bányászás, a rúnaérc-felfedezés, a
 * Rúna-zár (élesítéssel), a kérdés-ütemező és a kérdés-sáv állapotgépe UGYANAZ, mint a lapon (`createRuneMine` +
 * `createQuestionDirector` + `createQuestionUi`), a fix lépésű hurok is (K.6 „Közös meghajtó”).
 *
 * Két játékosmodell (`style`):
 *  - `hunter` („rúnavadász”): a legközelebbi rúnaérchez megy, útközben csak az akadályt bányássza;
 *  - `miner` („bányászó, nem siető”): minden zár után `MINER_MS`-ig szabadon bányászik maga körül (lefelé, oldalra), csak utána
 *    indul ércet keresni — a felfedezett (a kibányászott blokk helyén előbukkanó) rúnaércet viszont azonnal megérinti.
 * Mindkét bot „tovább bányászik” a zár megnyílása után: `KEEP_MINING_MS`-ig (150–500 ms, seedelt) még koppint az érc felé
 * (a lap vászon-útján, sugárral) — ez sosem választhat rúnakövet (review #484 B1); a téves választásokat `accidentalPicks()` számolja.
 *
 * A menet: az 5 pálya egymás után, a sim-ben nincs időkorlát (J3a-ban nincs vereség — J3b).
 */
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  type QuestionDirector,
} from "@/game-engine/play/questionDirector";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import { createQuestionUi, type QuestionUi } from "@/game-engine/play/questionUi";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import { AIR, BEDROCK, MOVE_SPEED_BPS, PLAYER_EYE, RUNE_ORE, WATER, WX, WZ, findVoxelSpawn, generateVoxelWorld, vGet, vMineable, vSolid } from "../voxelcraft";
import {
  BLOCK_CRAFT_GAME_ID,
  BLOCK_CRAFT_LEVELS,
  blockCraftDirectorConfig,
  createRuneMine,
  genCfgFor,
  nearestRune,
  type MineTarget,
  type Pos,
  type RuneMine,
  type Vec3,
} from "./core";

/** A bot járási sebessége (a futás 70%-a: kerülők, fordulások). */
export const BOT_SPEED_BPS = MOVE_SPEED_BPS * 0.7;
/** Új cél után ennyi a reakció (ms). */
export const REACT_MS = 600;
/** Ilyen közelről érinti meg az ércet (blokk). */
export const REACH = 2.5;
/** A „bányászó” játékos ennyi ideig bányászik szabadon minden zár után (ms). */
export const MINER_MS = 7000;
/** A zár megnyílása után még ennyi ideig bányászó koppintás (ms; seedelt 150–500). */
export const KEEP_MINING_MIN_MS = 150;
export const KEEP_MINING_MAX_MS = 500;
/** A tovább bányászó koppintások üteme (ms). */
export const KEEP_TAP_MS = 120;

const T0 = 1_800_000_000_000;

export type BotStyle = "hunter" | "miner";

export type BlockCraftSimOptions = {
  seed: number;
  grade: number;
  questions: boolean;
  /** Tananyag-tételek (a forrásrend 1. helye, terv J7). */
  material?: readonly FourChoiceQuiz[];
  /** A szintetikus bank mérete (alap 600). 0 → üres forrás (terv 8.1: a játék kérdés nélkül fut). */
  bankSize?: number;
  /**
   * Lecke-kupon mód (terv 8.6; review #484 M5, a közös #483-szabállyal): CSAK a `material` tételei jönnek (`coupon`
   * forrással); a kimerülést és az ismétlést a közös director kezeli.
   */
  couponOnly?: boolean;
  style?: BotStyle;
};

export type BlockCraftSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): { id: number; correctOption: number; windowMs: number; optionCount: number } | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
  /** A közös mag (teszt: arany visszajátszás, rúnaérc-elérhetőség). */
  mine: RuneMine;
  /** A menet kérdés-kulcsai sorban (forrásrend / változatosság). */
  askedKeys(): readonly string[];
  /** A teljesített pályák száma. */
  levelsCleared(): number;
  /** A bot helye. */
  player(): Vec3;
  /** A bányászó gesztusokból (tovább bányászó koppintás) adódó rúnakő-választások száma — mindig 0 kell legyen. */
  accidentalPicks(): number;
  /** A tovább bányászó koppintások száma (a mérés nem üres). */
  keepTaps(): number;
  /** A tartásos bányászással töltött idő aránya (a menetidőhöz). */
  miningShare(): number;
  /** A kibányászott blokkok és a felfedezett rúnaércek száma. */
  blocksMined(): number;
  /** A kérdés nélkül tört Rúna-zárak száma (`runeBreak` „free”) — kérdéssel futó menetben (kupon módban is) 0 kell legyen. */
  freeLocks(): number;
  revealed(): number;
  director: QuestionDirector;
};

function syntheticQuiz(n: number): FourChoiceQuiz {
  return {
    id: `bc-sim-${n}`,
    prompt: `Melyik a helyes? (${n})`,
    options: [`válasz ${n}`, `${n}-b`, `${n}-c`, `${n}-d`],
    correctIndex: n % 4,
    explanation: `A ${n}. tétel helyes válasza: válasz ${n}.`,
  };
}

export function createSimGame(opts: BlockCraftSimOptions): BlockCraftSim {
  const { seed, grade, questions } = opts;
  const style: BotStyle = opts.style ?? "hunter";
  const bankSize = opts.bankSize ?? 600;
  const material = opts.material ?? [];
  let freshCursor = 0;
  let materialCursor = 0;
  const director = createQuestionDirector({
    config: blockCraftDirectorConfig(grade),
    provider: {
      couponOnly: opts.couponOnly ?? false,
      material: () =>
        materialCursor < material.length ? materialPlayQuestion(material[materialCursor++]!, opts.couponOnly ? { coupon: true } : {}) : null,
      fresh: () => {
        if (freshCursor >= bankSize) return null;
        const q = syntheticQuiz(freshCursor);
        freshCursor += 1;
        return bankPlayQuestion(BLOCK_CRAFT_GAME_ID, q);
      },
      restore: (item) => restoreReviewQuestion(item, {}),
    },
    review: createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "review")) }),
    rng: createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "q")),
    startBand: 0.4,
    now: () => T0,
  });

  const pos: Vec3 = { x: 0, y: 0, z: 0 };
  const botRng: Rng = createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "bot"));
  let roll = 0;
  let target: Pos | null = null;
  let reactUntil = 0;
  let cleared = 0;
  const asked: string[] = [];
  let mine: RuneMine | null = null;
  /** A bányászás alatt álló blokk (akadály vagy szabad bányászás) — amíg nem levegő, a bot tartja. */
  let digging: MineTarget | null = null;
  let miningMs = 0;
  let minerUntil = 0;
  let accidental = 0;
  let keepTaps = 0;
  let keepUntil = -1;
  let nextKeepTap = 0;
  let lockSeen = -1;
  let revealedCount = 0;
  let blocks = 0;
  let freeLocks = 0;
  /** Az események ürítése (a lap is ezt teszi): a kérdés nélküli zárak számlálása. */
  const drainEvents = () =>
    mine?.drain((e) => {
      if (e.type === "runeBreak" && e.result === "free") freeLocks += 1;
    });

  const ui: QuestionUi = createQuestionUi({
    director: () => (questions ? director : null),
    onView: () => {},
    onShow: (p) => {
      asked.push(p.question.key);
      mine!.noteShow(p);
    },
    onOutcome: (o, p) => mine!.applyOutcome(o, p),
  });

  const world = () => mine!.state().world;
  const solidAt = (x: number, y: number, z: number) => vSolid(vGet(world(), x, y, z));

  /** Egy lépés a cél felé: lépcső, esés, víz; ha fal / fejmagasságú blokk állja útját, azt bányászandónak jelöli. */
  function walkToward(tx: number, tz: number, dt: number): void {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= REACH) return;
    const speed = BOT_SPEED_BPS * (roll < 1 ? 1 : 0.5);
    const len = Math.min(d - REACH * 0.8, (speed * dt) / 1000);
    const nx = pos.x + (dx / d) * len;
    const nz = pos.z + (dz / d) * len;
    const cx = Math.floor(nx);
    const cz = Math.floor(nz);
    if (cx < 1 || cz < 1 || cx >= WX - 1 || cz >= WZ - 1) return;
    const fy = Math.floor(pos.y + 0.01);
    if (cx !== Math.floor(pos.x) || cz !== Math.floor(pos.z)) {
      const feet = solidAt(cx, fy, cz);
      const head = solidAt(cx, fy + 1, cz);
      const above = solidAt(cx, fy + 2, cz);
      if (feet && (head || above)) {
        // Fal (≥ 2 magas) vagy fejmagasságú akadály: ki kell bányászni — előbb a fej, aztán a láb magasságában.
        const t = head ? { x: cx, y: fy + 1, z: cz } : { x: cx, y: fy + 2, z: cz };
        const tt = vGet(world(), t.x, t.y, t.z);
        digging = vMineable(tt) && tt !== RUNE_ORE ? t : { x: cx, y: fy, z: cz };
        return;
      }
      if (!feet && head) {
        digging = { x: cx, y: fy + 1, z: cz }; // fejmagasságú lomb / törzs
        return;
      }
    }
    pos.x = nx;
    pos.z = nz;
    // Felszín: a lépcsőt megmássza (≤ 1), lefelé lelép; víz felett marad (úszik).
    let y = Math.floor(pos.y + 0.01);
    if (solidAt(cx, y, cz)) y += 1;
    while (y > 1 && !solidAt(cx, y - 1, cz) && vGet(world(), cx, y - 1, cz) !== WATER) y -= 1;
    pos.y = y;
  }

  /** Szabad bányászás (a „bányászó” modell): a lábánál előtte / oldalt / alatta lévő legközelebbi sima blokk. */
  function pickFreeBlock(): MineTarget | null {
    const fx = Math.floor(pos.x);
    const fz = Math.floor(pos.z);
    const fy = Math.floor(pos.y + 0.01);
    const cand: MineTarget[] = [
      { x: fx + 1, y: fy - 1, z: fz }, { x: fx - 1, y: fy - 1, z: fz }, { x: fx, y: fy - 1, z: fz + 1 }, { x: fx, y: fy - 1, z: fz - 1 },
      { x: fx + 1, y: fy - 2, z: fz }, { x: fx - 1, y: fy - 2, z: fz }, { x: fx, y: fy - 2, z: fz + 1 }, { x: fx, y: fy - 2, z: fz - 1 },
      { x: fx + 1, y: fy, z: fz }, { x: fx - 1, y: fy, z: fz },
    ];
    for (const c of cand) {
      const t = vGet(world(), c.x, c.y, c.z);
      if (vMineable(t) && t !== RUNE_ORE && t !== BEDROCK) return c;
    }
    // Semmi a közelben: arrébb lép (a következő lépésben új helyet keres).
    pos.x = Math.min(WX - 2, Math.max(1.5, pos.x + (botRng.next() - 0.5) * 2));
    pos.z = Math.min(WZ - 2, Math.max(1.5, pos.z + (botRng.next() - 0.5) * 2));
    return null;
  }

  /** Egy, a lap vászon-útját utánzó koppintás az érc felé (sugár a szemből az érc egy pontjára). */
  function keepMiningTap(ore: Pos): void {
    const eye = { x: pos.x, y: pos.y + PLAYER_EYE, z: pos.z };
    const pt = { x: ore.x + 0.15 + botRng.next() * 0.7, y: ore.y + 0.15 + botRng.next() * 0.7, z: ore.z + 0.15 + botRng.next() * 0.7 };
    const d = { x: pt.x - eye.x, y: pt.y - eye.y, z: pt.z - eye.z };
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    keepTaps += 1;
    if (mine!.tapRay(eye, { x: d.x / l, y: d.y / l, z: d.z / l }, mine!.clockMs(), l)) accidental += 1;
    mine!.hit(ore); // a bányászó koppintás a nyitott zár alatt hatástalan
  }

  const m = createRuneMine({
    seed,
    questions: () => (questions ? ui : null),
    minGapMs: blockCraftDirectorConfig(grade).minGapMs,
    player: () => pos,
    movePlayer: (dt) => {
      if (digging) {
        miningMs += dt;
        return;
      }
      if (!target || m.clockMs() < reactUntil) return;
      if (style === "miner" && m.clockMs() < minerUntil) return;
      walkToward(target.x + 0.5, target.z + 0.5, dt);
    },
  });
  mine = m;

  function beginLevel(index: number): void {
    const cfg = BLOCK_CRAFT_LEVELS[index]!;
    // A lappal azonos seed-szerkezet (`seedFrom(gameId, seed, "world", menet, pálya)`; a sim-ben a menet 1).
    const w = generateVoxelWorld(genCfgFor(cfg), createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "world", 1, index)).next);
    const spawn = findVoxelSpawn(w);
    pos.x = spawn.x;
    pos.y = spawn.y;
    pos.z = spawn.z;
    target = null;
    digging = null;
    minerUntil = 0;
    m.startLevel(w, index, { x: 0, z: -1 });
    ui.reset();
  }
  beginLevel(0);

  const allDone = () => cleared >= BLOCK_CRAFT_LEVELS.length;

  return {
    mine: m,
    director,
    step(dtMs, input) {
      if (allDone()) return;
      roll = input.skillRoll;
      // A bányászás célja (a tartás a mag fix lépésében halad).
      if (digging) {
        const t = vGet(world(), digging.x, digging.y, digging.z);
        if (t === AIR || t === WATER || !vMineable(t)) {
          m.release();
          digging = null;
        } else if (t === RUNE_ORE) {
          // A kibányászott helyen rúnaérc bukkant elő (felfedezés): a bot megérinti.
          m.release();
          revealedCount += 1;
          target = { x: digging.x, y: digging.y, z: digging.z };
          digging = null;
        } else {
          m.aim(digging);
          if (!m.state().mining.pressing) m.press();
        }
      }
      const before = m.state().blocks;
      drainEvents();
      m.frame(dtMs, false);
      blocks += m.state().blocks - before;
      const st = m.state();
      if (st.phase === "won") {
        digging = null;
        if (!questions || ui.settled()) {
          cleared += 1;
          if (!allDone()) beginLevel(cleared);
        }
        return;
      }
      // Tovább bányászó koppintás a zár megnyílása után (review #484 B1: sosem választhat).
      const lock = st.lock;
      if (lock && lock.resolved === null && lock.presentationId !== lockSeen) {
        lockSeen = lock.presentationId;
        keepUntil = m.clockMs() + KEEP_MINING_MIN_MS + botRng.next() * (KEEP_MINING_MAX_MS - KEEP_MINING_MIN_MS);
        nextKeepTap = m.clockMs() + KEEP_TAP_MS;
        if (style === "miner") minerUntil = 0;
      }
      if (lock && lock.resolved === null && m.clockMs() <= keepUntil && m.clockMs() >= nextKeepTap) {
        nextKeepTap = m.clockMs() + KEEP_TAP_MS;
        keepMiningTap(lock.ore);
      }
      if (lock && lock.resolved !== null && style === "miner" && minerUntil === 0) minerUntil = m.clockMs() + MINER_MS;
      if (digging) return;
      const busy = lock !== null && lock.resolved === null;
      if (busy) return;
      // „Bányászó” modell: a zár után szabadon bányászik (a felfedezett ércet azonnal megérinti).
      if (style === "miner" && m.clockMs() < minerUntil && !(target && vGet(world(), target.x, target.y, target.z) === RUNE_ORE && Math.hypot(target.x + 0.5 - pos.x, target.z + 0.5 - pos.z) <= REACH + 0.5)) {
        digging = pickFreeBlock();
        return;
      }
      const alive = target && vGet(world(), target.x, target.y, target.z) === RUNE_ORE;
      if (!alive) {
        target = nearestRune(st.ores, pos.x, pos.z).ore;
        reactUntil = m.clockMs() + REACT_MS;
        return;
      }
      const d = Math.hypot(target!.x + 0.5 - pos.x, target!.z + 0.5 - pos.z);
      if (d <= REACH + 0.5 && m.clockMs() >= reactUntil) m.hit(target!);
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal || !m.lockArmed()) return null;
      return { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length };
    },
    answer(id, option) {
      const p = ui.active();
      if (!p || p.id !== id) return;
      m.pick(option);
    },
    done: allDone,
    won: allDone,
    stats: () => director.stats(m.clockMs()),
    simTimeMs: () => m.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
    askedKeys: () => asked,
    levelsCleared: () => cleared,
    player: () => pos,
    accidentalPicks: () => accidental,
    keepTaps: () => keepTaps,
    miningShare: () => (m.clockMs() > 0 ? miningMs / m.loop.simTimeMs() : 0),
    blocksMined: () => blocks,
    freeLocks: () => {
      drainEvents();
      return freeLocks;
    },
    revealed: () => revealedCount,
  };
}
