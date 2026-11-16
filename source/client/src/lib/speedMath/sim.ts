/**
 * J4a — a „Neon védőtorony” node-szimulációja a közös harness-hez (`T/support/game-sim.ts` `SimGame`; végrehajtás K.6,
 * J4a 6.; terv 6.2). React, DOM, three.js és hang nélkül fut; ugyanazt a magot (`core.ts`), ugyanazt a kérdés-ütemezőt
 * (`createQuestionDirector`) és ugyanazt a kérdés-sáv állapotgépet (`createQuestionUi`: megoldás-kijelzés ≥ 1,8 mp, csak
 * nyitott kérdésnél lassít) hajtja, mint a lap — a lap rajzol és koppintást fogad, a sim a botot kérdezi.
 *
 * Időkezelés: a `step(dtMs)` egy „képkocka” `dtMs` valós idővel; a lappal AZONOS `createTowerDriver` (`core.ts`) lépteti a
 * magot a fix lépésű hurkon át (1/60 s, nyitott kérdésnél `TOWER_SLOW_MO` időskála, hitstop) — review #451: korábban a sim
 * `dtMs × timeScale` méretű lépésekkel futott, és a hullám-RNG lépésenkénti fogyasztása miatt más ellenfélsort mért.
 *
 * A kérdésforrás itt egy seedelt, évfolyamtól független számolási bank (≥ 300 különböző feladat): a sim az ütemezést, az
 * ismétlést és a játékmenetet méri, a feladatok minőségét a lap saját őrei (`T/game-bank-no-repeat-content.test.ts`,
 * `T/speed-quiz-explanations.test.ts`) nézik.
 *
 * A bot koppintása (a harness megállapodása): a valós időben `TAP_MS`-onként a beéréshez legközelebbi fosztogatóra
 * lő; talál, ha `skillRoll < ease` (a fajta könnyítése). Nyitott kérdés alatt, amíg nem válaszolt, feleannyiszor lő (a
 * figyelme megoszlik a feladat és a pálya között).
 */
import { createRng, seedFrom } from "@shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  restoreReviewQuestion,
  type QuestionProvider,
} from "@/game-engine/play/questionDirector";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import { createQuestionUi } from "@/game-engine/play/useQuestionDirector";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";

import { RAIDERS, SPEED_MATH_GAME_ID, createTowerDriver, towerDirectorConfig, type TowerCore, type TowerDriver } from "./core";

/** A bot koppintási üteme (valós ms). */
export const TAP_MS = 800;

type SimQuestion = { id: number; correctOption: number; windowMs: number; optionCount: number };

/** Seedelt számolási bank a sim-hez: a × b, a + b, a − b — kulcsonként egyedi. */
function simProvider(seed: number): QuestionProvider {
  const rng = createRng(seedFrom(SPEED_MATH_GAME_ID, seed, "simbank"));
  return {
    couponOnly: false,
    material: () => null,
    fresh: () => {
      const op = rng.int(3);
      const a = 3 + rng.int(10);
      const b = 3 + rng.int(10);
      const value = op === 0 ? a * b : op === 1 ? a + b + 10 * rng.int(5) : a + b + 20 - b;
      const shown = op === 0 ? `${a} × ${b} = ?` : op === 1 ? `${a} + ${value - a} = ?` : `${a + 20} − ${b} = ?`;
      const answer = op === 2 ? a + 20 - b : value;
      const options = [answer, answer + 1 + rng.int(3), answer - 1 - rng.int(3), answer + 10];
      return bankPlayQuestion(SPEED_MATH_GAME_ID, {
        id: "",
        prompt: shown,
        options: options.map(String),
        correctIndex: 0,
        explanation: `${shown.replace(" = ?", "")} = ${answer}.`,
      });
    },
    restore: (item) => restoreReviewQuestion(item, {}),
  };
}

export type SpeedMathSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): SimQuestion | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
  /** A világ (mérés / arany visszajátszás). */
  core: TowerCore;
};

export function createSimGame(opts: { seed: number; grade: number; questions: boolean }): SpeedMathSim {
  const director = createQuestionDirector({
    config: towerDirectorConfig(opts.grade),
    provider: simProvider(opts.seed),
    review: createReviewQueue(null),
    rng: createRng(seedFrom(SPEED_MATH_GAME_ID, opts.seed, "q")),
    startBand: 0.4,
    now: () => 0,
  });
  let tapAcc = 0;
  let answeredOpen = false;
  // A lappal AZONOS meghajtó (fix lépésű hurok, időskála, hitstop): a sim ugyanazt a lépéssort futtatja (review #451).
  let driver: TowerDriver | null = null;
  const ui = createQuestionUi({
    director: () => (opts.questions ? director : null),
    onView: () => {},
    onShow: () => {
      answeredOpen = false;
    },
    onOutcome: (o, p) => {
      const speed = o.result === "correct" ? Math.max(0, 1 - o.responseMs / p.windowMs) : 0;
      driver!.core.applyOutcome(o.result, speed);
    },
  });
  driver = createTowerDriver({ seed: opts.seed, questions: opts.questions ? ui : null, intensity: () => (opts.questions ? director.intensity() : 0.4) });
  const d = driver;
  const core = d.core;
  const over = () => !core.running();

  return {
    core,
    step(dtMs, input) {
      if (over()) {
        if (!ui.finished()) ui.finish();
        return;
      }
      d.frame(dtMs, false);
      // A bot lövése (valós időben).
      tapAcc += dtMs;
      const busy = ui.active() !== null && !answeredOpen;
      if (tapAcc >= (busy ? 2 * TAP_MS : TAP_MS)) {
        tapAcc = 0;
        const id = core.mostAdvanced();
        if (id >= 0) {
          const r = core.state().raiders[id]!;
          if (input.skillRoll < RAIDERS[r.kind].ease) core.shoot(id);
          d.drain();
        }
      }
      if (over() && !ui.finished()) ui.finish();
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal) return null;
      return { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length };
    },
    answer(id, option) {
      const p = ui.active();
      if (!p || p.id !== id) return;
      answeredOpen = true;
      ui.pick(option, d.clockMs());
    },
    done: () => over(),
    won: () => core.state().phase === "won",
    stats: () => director.stats(d.clockMs()),
    simTimeMs: () => d.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
  };
}
