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
import { createQuestionUi } from "@/game-engine/play/questionUi";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";

import type { PlayQuestion } from "@/game-engine/play/types";

import {
  RAIDERS,
  SPEED_MATH_GAME_ID,
  createTowerDriver,
  createTowerTasks,
  towerDirectorConfig,
  towerQuestionKind,
  type TowerCore,
  type TowerDriver,
} from "./core";

/** A bot koppintási üteme (valós ms). */
export const TAP_MS = 800;
/** A bot a főellenfél töltő magjára ekkora könnyítéssel bök (nagy cél, ≥ 600 ms előjelzés). */
export const BOT_CORE_EASE = 0.75;

type SimQuestion = { id: number; correctOption: number; windowMs: number; optionCount: number };

/** Seedelt számolási bank a sim-hez: a × b, a + b, a − b — kulcsonként egyedi. */
function simProvider(seed: number, special: () => PlayQuestion | null): QuestionProvider {
  const rng = createRng(seedFrom(SPEED_MATH_GAME_ID, seed, "simbank"));
  return {
    couponOnly: false,
    material: () => null,
    fresh: () => {
      // A különleges kérdések (Becslő-bomba, főellenfél, Számlánc) ugyanabból a magból, mint a lapon.
      const sp = special();
      if (sp) return sp;
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
  /** J4b: a Zéró-robot harcának kezdete és vége (kérdés-óra ms; null, ha nem jött el / nem ért véget). */
  bossFight(): { startMs: number | null; endMs: number | null };
  /** A menetben ténylegesen feltett Becslő-bombák száma. */
  bombs(): number;
};

export function createSimGame(opts: { seed: number; grade: number; questions: boolean }): SpeedMathSim {
  let tasks: ReturnType<typeof createTowerTasks> | null = null;
  const director = createQuestionDirector({
    config: towerDirectorConfig(opts.grade),
    provider: simProvider(opts.seed, () => tasks?.special() ?? null),
    review: createReviewQueue(null),
    rng: createRng(seedFrom(SPEED_MATH_GAME_ID, opts.seed, "q")),
    startBand: 0.4,
    now: () => 0,
  });
  let tapAcc = 0;
  let bombs = 0;
  let answeredOpen = false;
  // A lappal AZONOS meghajtó (fix lépésű hurok, időskála, hitstop): a sim ugyanazt a lépéssort futtatja (review #451).
  let driver: TowerDriver | null = null;
  const ui = createQuestionUi({
    director: () => (opts.questions ? director : null),
    onView: () => {},
    onShow: (p) => {
      answeredOpen = false;
      if (towerQuestionKind(p) === "bomb") bombs += 1;
    },
    onOutcome: (o, p) => {
      const speed = o.result === "correct" ? Math.max(0, 1 - o.responseMs / p.windowMs) : 0;
      driver!.core.applyOutcome(o.result, speed, towerQuestionKind(p));
      tasks?.noteOutcome(o, p);
    },
  });
  driver = createTowerDriver({ seed: opts.seed, questions: opts.questions ? ui : null, intensity: () => (opts.questions ? director.intensity() : 0.4) });
  const d = driver;
  const core = d.core;
  const taskRng = createRng(seedFrom(SPEED_MATH_GAME_ID, opts.seed, "special"));
  tasks = createTowerTasks({ core, grade: () => opts.grade, rng: taskRng.next });
  const over = () => !core.running();
  let bossStart: number | null = null;
  let bossEnd: number | null = null;

  return {
    core,
    step(dtMs, input) {
      if (over()) {
        if (!ui.finished()) ui.finish();
        return;
      }
      d.frame(dtMs, false);
      const b = core.state().boss;
      if (b?.kind === "zero" && bossStart === null) bossStart = d.clockMs();
      if (bossStart !== null && bossEnd === null && (core.state().phase === "won" || core.state().phase === "lost")) bossEnd = d.clockMs();
      // A bot lövése (valós időben).
      tapAcc += dtMs;
      const busy = ui.active() !== null && !answeredOpen;
      if (tapAcc >= (busy ? 2 * TAP_MS : TAP_MS)) {
        tapAcc = 0;
        const boss = core.state().boss;
        const id = core.mostAdvanced();
        const urgent = id >= 0 && core.progressOf(id) > 0.6;
        if (boss && (boss.attack === "charge" || (boss.kind === "factory" && !urgent))) {
          // A mag megérintése: a Zéró-robotnál az előjelzésre reagál, a Hibagyárnál ha nincs közeli fosztogató.
          if (input.skillRoll < BOT_CORE_EASE) core.hitBossCore();
          d.drain();
        } else if (id >= 0) {
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
    bombs: () => bombs,
    bossFight: () => ({ startMs: bossStart, endMs: bossEnd ?? (bossStart !== null && over() ? d.clockMs() : null) }),
    done: () => over(),
    won: () => core.state().phase === "won",
    stats: () => director.stats(d.clockMs()),
    simTimeMs: () => d.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
  };
}
