/**
 * J3a — a Kockavadász „Rúnabánya” node-szimulációja a közös harness-hez (`T/support/game-sim.ts` `SimGame`; végrehajtás
 * J3a 4. lépés, K.6; terv 6.2). React, three.js, DOM és hang nélkül fut.
 *
 * Egyszerűsített „rácson járó” modell (a voxel-fizika nélkül): a bot a seedelt voxel-világ felszínén egyenesen a
 * legközelebbi rúnaérchez sétál (ütközés nélkül), és megérinti; a rúnaérc-elhelyezés, a bányászás, a Rúna-zár, a
 * kérdés-ütemező és a kérdés-sáv állapotgépe UGYANAZ, mint a lapon (`createRuneMine` + `createQuestionDirector` +
 * `createQuestionUi`), a fix lépésű hurok is (K.6 „Közös meghajtó”): a kérdés alatt a bot is fele sebességgel halad.
 *
 * A bot (a harness megállapodása): új cél kiválasztása után `REACT_MS` reakció, járás `BOT_SPEED_BPS`-sel (sikertelen
 * ügyességi dobásnál — `skillRoll ≥ 1` — fele sebességgel: kerülő, ugrás), `REACH` blokkra érve koppint az ércre. A
 * megoldás-kijelzés alatt már a következő érc felé indul (ahogy egy gyerek); a kérés a kijelzés végéig függőben vár.
 *
 * A menet: az 5 pálya egymás után (a pálya-cél után azonnal a következő), a sim-ben nincs időkorlát — J3a-ban még nincs
 * vereség (végrehajtás J3a 5.: kérdés nélküli módban a sim J3b-ig `won()`-nal jelzi a végigjátszást).
 */
import { createRng, seedFrom } from "@shared/game-rng";
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

import { MOVE_SPEED_BPS, findVoxelSpawn, generateVoxelWorld } from "../voxelcraft";
import {
  BLOCK_CRAFT_GAME_ID,
  BLOCK_CRAFT_LEVELS,
  blockCraftDirectorConfig,
  createRuneMine,
  genCfgFor,
  nearestRune,
  surfaceTop,
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

const T0 = 1_800_000_000_000;

export type BlockCraftSimOptions = {
  seed: number;
  grade: number;
  questions: boolean;
  /** Tananyag-tételek (a forrásrend 1. helye, terv J7). */
  material?: readonly FourChoiceQuiz[];
  /** A szintetikus bank mérete (alap 600). 0 → üres forrás (terv 8.1: a játék kérdés nélkül fut). */
  bankSize?: number;
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
  const bankSize = opts.bankSize ?? 600;
  const material = opts.material ?? [];
  let freshCursor = 0;
  let materialCursor = 0;
  const director = createQuestionDirector({
    config: blockCraftDirectorConfig(grade),
    provider: {
      couponOnly: false,
      material: () => (materialCursor < material.length ? materialPlayQuestion(material[materialCursor++]!) : null),
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
  let roll = 0;
  let target: Pos | null = null;
  let reactUntil = 0;
  let cleared = 0;
  const asked: string[] = [];
  let mine: RuneMine | null = null;

  const ui: QuestionUi = createQuestionUi({
    director: () => (questions ? director : null),
    onView: () => {},
    onShow: (p) => {
      asked.push(p.question.key);
      mine!.noteShow(p);
    },
    onOutcome: (o, p) => mine!.applyOutcome(o, p),
  });

  const m = createRuneMine({
    seed,
    questions: () => (questions ? ui : null),
    minGapMs: blockCraftDirectorConfig(grade).minGapMs,
    player: () => pos,
    movePlayer: (dt) => {
      if (!target || m.clockMs() < reactUntil) return;
      const dx = target.x + 0.5 - pos.x;
      const dz = target.z + 0.5 - pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= REACH) return;
      const speed = BOT_SPEED_BPS * (roll < 1 ? 1 : 0.5);
      const stepLen = Math.min(d - REACH * 0.8, (speed * dt) / 1000);
      pos.x += (dx / d) * stepLen;
      pos.z += (dz / d) * stepLen;
      const top = surfaceTop(m.state().world, Math.floor(pos.x), Math.floor(pos.z));
      pos.y = (top < 0 ? pos.y - 1 : top) + 1;
    },
  });
  mine = m;

  function beginLevel(index: number): void {
    const cfg = BLOCK_CRAFT_LEVELS[index]!;
    const world = generateVoxelWorld(genCfgFor(cfg), createRng(seedFrom(BLOCK_CRAFT_GAME_ID, seed, "world", index)).next);
    const spawn = findVoxelSpawn(world);
    pos.x = spawn.x;
    pos.y = spawn.y;
    pos.z = spawn.z;
    target = null;
    m.startLevel(world, index, { x: 0, z: -1 });
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
      m.frame(dtMs, false);
      const st = m.state();
      if (st.phase === "won") {
        if (!questions || ui.settled()) {
          cleared += 1;
          if (!allDone()) beginLevel(cleared);
        }
        return;
      }
      // A bot döntése: a legközelebbi érc felé; odaérve megérinti (a zár / a függő kérés alatt nem kezd újat).
      const busy = st.pendingOre !== null || (st.lock !== null && st.lock.resolved === null);
      if (busy) return;
      const alive = target && st.ores.some((o) => o.x === target!.x && o.y === target!.y && o.z === target!.z);
      if (!alive) {
        const near = nearestRune(st.ores, pos.x, pos.z).ore;
        target = near;
        reactUntil = m.clockMs() + REACT_MS;
        return;
      }
      const d = Math.hypot(target!.x + 0.5 - pos.x, target!.z + 0.5 - pos.z);
      if (d <= REACH && m.clockMs() >= reactUntil) m.hit(target!);
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal) return null;
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
  };
}
