/**
 * Szólétra „Szikla-verseny” — a szimulációs harness játék-oldala (végrehajtás K.6, J2a 3. lépés; terv 6.2).
 *
 * A `createSimGame` a játék tiszta magját (`./core`) és a közös kérdés-ütemezőt (`createQuestionDirector`) köti össze
 * React és three.js nélkül, PONTOSAN úgy, ahogy a lap (`P/WordLadderHuEn.tsx`) teszi:
 *  - minden fogás egy kérdés: amint nincs nyitott kérdés és lejárt a megoldás-kijelzés, a játék azonnal kér egyet
 *    (`request("trigger")`, a director `minGapMs`-e szerint) — az első fogás `FIRST_HOLD_MS`-nél;
 *  - a megoldás-kijelzés a közös kérdés-sáv szabálya (`usePlayQuestion`): jó válasz után 900 ms, hibás / lejárt után
 *    2000 ms — ezalatt új fogás nem jelenik meg (a lap a kérést függőben tartja);
 *  - kérdés közben a világ teljes sebességgel fut (`slowMo: 1`, a rivális is mászik);
 *  - ha a forrás nem ad tételt (terv 8.1) vagy `questions: false`: szabad fogás `FREE_GRIP_COOLDOWN_MS`-onként, a
 *    játékos ügyességi dobásával (a bot `FREE_TAP_MS` után koppint).
 *
 * A kérdésforrás alapból szintetikus (≥ 200 egyedi tétel, a terv 6.2 változatosság-mérésének feltétele); a teszt
 * tananyag-tételt és saját bankot is adhat (`material`, `bankSize`).
 */
import { createRng, seedFrom } from "../../../../shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  type DirectorConfig,
  type QuestionDirector,
} from "../../game-engine/play/questionDirector";
import { createReviewQueue } from "../../game-engine/play/reviewQueue";
import type { RunStatsSnapshot } from "../../game-engine/play/runStats";
import type { QuestionOutcome } from "../../game-engine/play/types";
import type { FourChoiceQuiz } from "../../types/gameQuiz";
import { ladderRungsForLevel } from "../wordLadderLevels";
import {
  FIRST_HOLD_MS,
  FREE_GRIP_COOLDOWN_MS,
  answer as applyAnswer,
  climbTarget,
  createLadderState,
  drainEvents,
  freeGrab,
  rivalBaseRungPerSec,
  rivalSecPerRungForLevel,
  step as stepCore,
  type LadderState,
} from "./core";

export const WORD_LADDER_GAME_ID = "word-ladder-hu-en" as const;

/** A lap director-konfigurációja (végrehajtás J2a 4.: optionCount 4, minGap 1,5 s, maxGap 8 s, 10 / perc, ablak 4,5 s, slowMo 1). */
export function wordLadderDirectorConfig(grade: number | null): DirectorConfig {
  return {
    gameId: WORD_LADDER_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 8000,
    targetPerMin: 10,
    baseWindowMs: 4500,
    slowMo: 1,
    grade,
    warmupMs: FIRST_HOLD_MS,
  };
}

/** A közös kérdés-sáv megoldás-kijelzése (`GE/play/useQuestionDirector.ts` `REVEAL_CORRECT_MS` / `REVEAL_WRONG_MS`). */
export const SIM_REVEAL_CORRECT_MS = 900;
export const SIM_REVEAL_WRONG_MS = 2000;
/** A bot ennyi idő után koppint a szabad fogásra. */
export const FREE_TAP_MS = 700;

const T0 = 1_800_000_000_000;

export type WordLadderSimOptions = {
  seed: number;
  grade: number;
  questions: boolean;
  /** A pálya (1–10; alap 6 — a terv 6.2 „középső” pályája): fal-magasság és rivális-tempó. */
  level?: number;
  /** A fal magassága (fok) — felülírja a pályáét. */
  rungs?: number;
  /** Tananyag-tételek (a forrásrend 1. helye, terv J7). */
  material?: readonly FourChoiceQuiz[];
  /** A szintetikus bank mérete (alap 600). 0 → üres forrás (terv 8.1: a játék kérdés nélkül fut). */
  bankSize?: number;
};

export type WordLadderSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): { id: number; correctOption: number; windowMs: number; optionCount: number } | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
  /** A sim-mag állapota (teszt: arany visszajátszás, rivális). */
  state(): LadderState;
  /** A menet kérdés-kulcsai sorban (változatosság / forrásrend teszt). */
  askedKeys(): readonly string[];
  director: QuestionDirector;
};

function syntheticQuiz(n: number): FourChoiceQuiz {
  const a = `szó${n}`;
  return {
    id: `wl-sim-${n}`,
    prompt: `Mit jelent: word${n}?`,
    options: [a, `${a}-b`, `${a}-c`, `${a}-d`],
    correctIndex: n % 4,
    explanation: `word${n} = ${a}.`,
  };
}

export function createSimGame(opts: WordLadderSimOptions): WordLadderSim {
  const { seed, grade, questions } = opts;
  const bankSize = opts.bankSize ?? 600;
  const material = opts.material ?? [];
  let freshCursor = 0;
  let materialCursor = 0;
  const director = createQuestionDirector({
    config: wordLadderDirectorConfig(grade),
    provider: {
      couponOnly: false,
      material: () => (materialCursor < material.length ? materialPlayQuestion(material[materialCursor++]!) : null),
      fresh: () => {
        if (freshCursor >= bankSize) return null;
        const q = syntheticQuiz(freshCursor);
        freshCursor += 1;
        return bankPlayQuestion(WORD_LADDER_GAME_ID, q);
      },
      restore: (item) => restoreReviewQuestion(item, {}),
    },
    review: createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom(WORD_LADDER_GAME_ID, seed, "review")) }),
    rng: createRng(seedFrom(WORD_LADDER_GAME_ID, seed, "q")),
    startBand: 0.4,
    now: () => T0,
  });
  const world = createRng(seedFrom(WORD_LADDER_GAME_ID, seed, "world"));
  const level = opts.level ?? 6;
  const state = createLadderState({
    targetRung: opts.rungs ?? climbTarget(ladderRungsForLevel(level)),
    baseRungPerSec: rivalBaseRungPerSec(rivalSecPerRungForLevel(level)),
  });
  const asked: string[] = [];
  let t = 0;
  let revealUntil = 0;
  let lastStart: number | null = null;
  let freeAt = Number.POSITIVE_INFINITY;
  let freeTapAt = Number.POSITIVE_INFINITY;

  const settle = (o: QuestionOutcome | null) => {
    if (!o || o.result === "aborted") return;
    applyAnswer(state, o.result);
    revealUntil = t + (o.result === "correct" ? SIM_REVEAL_CORRECT_MS : SIM_REVEAL_WRONG_MS);
    drainEvents(state);
  };

  const ask = () => {
    if (state.phase !== "play" || t < FIRST_HOLD_MS || director.active() || t < revealUntil) return;
    if (questions) {
      const p = director.request("trigger", t);
      if (p) {
        lastStart = t;
        asked.push(p.question.key);
        freeAt = Number.POSITIVE_INFINITY;
        freeTapAt = Number.POSITIVE_INFINITY;
        return;
      }
      // A director a minGap miatt még nem ad kérdést: várunk. Ha a rés letelt és mégsem adott, a forrás üres (8.1).
      if (lastStart !== null && t - lastStart < wordLadderDirectorConfig(grade).minGapMs) return;
    }
    if (freeAt === Number.POSITIVE_INFINITY) {
      freeAt = t + (state.climbs === 0 && state.slips === 0 ? 0 : FREE_GRIP_COOLDOWN_MS);
      freeTapAt = freeAt + FREE_TAP_MS;
    }
  };

  return {
    step(dtMs, input) {
      if (state.phase !== "play") return;
      t += dtMs;
      const active = director.active();
      if (active && t >= active.startedAtSimMs + active.windowMs) settle(director.expire(t));
      stepCore(state, dtMs, director.intensity(), world);
      if (state.phase !== "play") {
        director.abort();
        drainEvents(state);
        return;
      }
      if (t >= freeTapAt) {
        freeGrab(state, input.skillRoll < 1);
        drainEvents(state);
        freeAt = Number.POSITIVE_INFINITY;
        freeTapAt = Number.POSITIVE_INFINITY;
      }
      ask();
      drainEvents(state);
    },
    question() {
      const p = director.active();
      return p ? { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length } : null;
    },
    answer(id, option) {
      settle(director.answer(id, option, t));
      if (state.phase !== "play") director.abort();
    },
    done: () => state.phase !== "play",
    won: () => state.phase === "won",
    stats: () => director.stats(t),
    simTimeMs: () => t,
    band: () => director.band(),
    intensity: () => director.intensity(),
    state: () => state,
    askedKeys: () => asked,
    director,
  };
}
