/**
 * Szólétra „Szikla-verseny” — a szimulációs harness játék-oldala (végrehajtás K.6, J2a 3. lépés; terv 6.2; olvashatósági
 * javítás docs/specs/2026-11-17-szoletra-olvashatosag.md).
 *
 * A `createSimGame` a játék tiszta magját (`./core`) és a közös kérdés-ütemezőt (`createQuestionDirector`) köti össze
 * React és three.js nélkül, PONTOSAN úgy, ahogy a lap (`P/WordLadderHuEn.tsx`) teszi:
 *  - a director presentation-jét a lap is a `paceDirector`-ral burkolja (`./pacing`): az óra az előjelzés
 *    (`LEAD_IN_MS`) után indul, az ablak a tempó olvasásalapú `ladderWindowMs`-e; előjelzés alatt a fogás hatástalan;
 *  - minden fogás egy kérdés: amint nincs nyitott kérdés és lejárt a megoldás-kijelzés, a játék azonnal kér egyet
 *    (`request("trigger")`, a director `minGapMs`-e szerint) — az első fogás `FIRST_HOLD_MS`-nél;
 *  - a megoldás-kijelzés a közös kérdés-sáv szabálya: jó válasz után 900 ms, hibás / lejárt után a lap
 *    `LADDER_REVEAL_WRONG_MS`-e (3 s) — ezalatt új fogás nem jelenik meg;
 *  - a világ (a rivális) a lap meghajtójával lép: `createFixedLoop` (fix 1/60 s, ≤ 5 lépés / képkocka), nyitott kérdés
 *    alatt (előjelzéssel együtt) és a megoldás-kijelzés alatt a tempó `slowMo`-jával (K.6 „Közös meghajtó”, review K6);
 *  - ha a forrás nem ad tételt (terv 8.1) vagy `questions: false`: szabad fogás `FREE_GRIP_COOLDOWN_MS`-onként, a
 *    játékos ügyességi dobásával (a bot `FREE_TAP_MS` után koppint).
 *
 * A kérdésforrás alapból szintetikus (≥ 200 egyedi tétel, a terv 6.2 változatosság-mérésének feltétele); a teszt
 * tananyag-tételt, saját bankot (`bank`: valódi tételek az olvasási méréshez) és bankméretet is adhat.
 */
import { createRng, seedFrom } from "../../../../shared/game-rng";
import { createFixedLoop } from "../../game-engine/play/loop";
import {
  bankPlayQuestion,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  type DirectorConfig,
  type QuestionDirector,
} from "../../game-engine/play/questionDirector";
import { REVEAL_CORRECT_MS } from "../../game-engine/play/questionUi";
import { createReviewQueue } from "../../game-engine/play/reviewQueue";
import { fitsAllViewports } from "../../game-engine/play/promptFit";
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
  step as stepCore,
  type LadderState,
} from "./core";
import {
  DEFAULT_LADDER_TEMPO,
  LADDER_BASE_WINDOW_MS,
  LADDER_REVEAL_WRONG_MS,
  LEAD_IN_MS,
  armedAt,
  ladderFreeGripMs,
  ladderRivalSecPerRung,
  ladderWallRungs,
  paceDirector,
  tempoParams,
  type LadderTempo,
} from "./pacing";

export const WORD_LADDER_GAME_ID = "word-ladder-hu-en" as const;

/**
 * A lap director-konfigurációja (végrehajtás J2a 4.: optionCount 4, minGap 1,5 s, maxGap 8 s, 10 / perc, ablak 4,5 s).
 * A `slowMo` a tempóé (olvashatósági javítás B: a kérdés alatt a rivális lassít; „Gyors” = a régi 1). Az ablakot a lap a
 * `paceDirector`-ral szabja a tempóra — a director saját (≤ 9 mp-es) ablaka csak a közös áramlat-jelhez marad.
 */
export function wordLadderDirectorConfig(grade: number | null, tempo: LadderTempo = DEFAULT_LADDER_TEMPO): DirectorConfig {
  return {
    gameId: WORD_LADDER_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 8000,
    targetPerMin: 10,
    baseWindowMs: LADDER_BASE_WINDOW_MS,
    slowMo: tempoParams(tempo).slowMo,
    grade,
    warmupMs: FIRST_HOLD_MS,
    // J0c-b (#450): olvasás-tudatos ablak (≤ 9 mp) és a sávban beférő / elolvasható tétel elsőbbsége (a kapaszkodó-
    // feliratokkal együtt: `optionsFit`).
    readingAware: true,
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs: LADDER_BASE_WINDOW_MS }).ok,
  };
}

/** A közös kérdés-sáv megoldás-kijelzése (`GE/play/questionUi.ts` `REVEAL_CORRECT_MS`; hibásnál a tempóé). */
export const SIM_REVEAL_CORRECT_MS = REVEAL_CORRECT_MS;
export const SIM_REVEAL_WRONG_MS = LADDER_REVEAL_WRONG_MS;
/** A bot ennyi idő után koppint a szabad fogásra. */
export const FREE_TAP_MS = 700;

const T0 = 1_800_000_000_000;

export type WordLadderSimOptions = {
  seed: number;
  grade: number;
  questions: boolean;
  /** Tempó (alap: a lapé, NYUGODT). */
  tempo?: LadderTempo;
  /** A pálya (1–10; alap 6 — a terv 6.2 „középső” pályája): fal-magasság és rivális-tempó. */
  level?: number;
  /** A fal magassága (fok) — felülírja a pályáét. */
  rungs?: number;
  /** Tananyag-tételek (a forrásrend 1. helye, terv J7). */
  material?: readonly FourChoiceQuiz[];
  /** Valódi bank (pl. a kézi bank + szóbank egy szintje): a szintetikus helyett ebből jönnek az új tételek. */
  bank?: readonly FourChoiceQuiz[];
  /** A szintetikus bank mérete (alap 600). 0 → üres forrás (terv 8.1: a játék kérdés nélkül fut). */
  bankSize?: number;
};

export type WordLadderSimQuestion = {
  id: number;
  correctOption: number;
  /** A burkolt (tempó szerinti) ablak; az óra `armedAtMs`-től jár. */
  windowMs: number;
  optionCount: number;
  /** Az olvasó bothoz: a kérdés szövege és a fogások feliratai. */
  prompt: string;
  options: readonly string[];
  /** Előjelzés vége: ettől számít a fogás (és jár az óra). */
  armedAtMs: number;
};

export type WordLadderSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): WordLadderSimQuestion | null;
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
  /** Előjelzés alatt érkezett (hatástalan) koppintások száma. */
  earlyTaps(): number;
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
  const tempo = opts.tempo ?? DEFAULT_LADDER_TEMPO;
  const config = wordLadderDirectorConfig(grade, tempo);
  const bank = opts.bank ?? null;
  const bankSize = bank ? bank.length : opts.bankSize ?? 600;
  const material = opts.material ?? [];
  const freeGripMs = ladderFreeGripMs(FREE_GRIP_COOLDOWN_MS, opts.level ?? 6, grade, tempo);
  let freshCursor = 0;
  let materialCursor = 0;
  const base = createQuestionDirector({
    config,
    provider: {
      couponOnly: false,
      material: () => (materialCursor < material.length ? materialPlayQuestion(material[materialCursor++]!) : null),
      fresh: () => {
        if (freshCursor >= bankSize) return null;
        const q = bank ? bank[freshCursor]! : syntheticQuiz(freshCursor);
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
  const director = paceDirector(base, { grade: () => grade, tempo: () => tempo });
  const world = createRng(seedFrom(WORD_LADDER_GAME_ID, seed, "world"));
  const level = opts.level ?? 6;
  const state = createLadderState({
    targetRung: opts.rungs ?? ladderWallRungs(climbTarget(ladderRungsForLevel(level)), tempo),
    baseRungPerSec: rivalBaseRungPerSec(ladderRivalSecPerRung(level, grade, tempo)),
  });
  // A lap meghajtója (K.6): fix lépés, időskála. A sim „valós” órája a `t`; a hurok ebből lép.
  const loop = createFixedLoop((dt) => stepCore(state, dt, director.intensity(), world));
  loop.frame(0);
  const asked: string[] = [];
  let t = 0;
  let revealUntil = 0;
  let lastStart: number | null = null;
  let freeAt = Number.POSITIVE_INFINITY;
  let freeTapAt = Number.POSITIVE_INFINITY;
  let early = 0;
  /**
   * Menetvégkor nyitva maradt (megszakított) kérdés kezdete. A közös menet-statisztika a megszakított kérdést 0 ms-os
   * válaszidővel zárja, így a menet végi „kérdés nélküli szakasz” a kérdés KEZDETÉTŐL számítana, holott végig nyitva volt
   * (a Nyugodt tempó ≥ 12 s-os ablakánál ez 8 s fölé mehet). Ezért a `maxGapSec`-et a megszakított kérdés kezdetekor vesszük,
   * a többi értéket a menet végén (ORKESZTRÁTOR-KÉRÉS: a közös `abort` / `runStats` ezt maga kezelhetné).
   */
  let abortedAt: number | null = null;
  const abortOpen = () => {
    const open = director.active();
    if (open && abortedAt === null) abortedAt = Math.max(0, open.startedAtSimMs - LEAD_IN_MS);
    director.abort();
  };

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
      if (lastStart !== null && t - lastStart < config.minGapMs) return;
    }
    if (freeAt === Number.POSITIVE_INFINITY) {
      freeAt = t + (state.climbs === 0 && state.slips === 0 ? 0 : freeGripMs);
      freeTapAt = freeAt + FREE_TAP_MS;
    }
  };

  return {
    step(dtMs, input) {
      if (state.phase !== "play") return;
      t += dtMs;
      const active = director.active();
      if (active && t >= active.startedAtSimMs + active.windowMs) settle(director.expire(t));
      // A lap: nyitott kérdés (előjelzéssel együtt) ÉS a megoldás-kijelzés alatt a tempó `slowMo`-jával lassít (review K6).
      loop.setTimeScale(director.active() || t < revealUntil ? config.slowMo : 1);
      loop.frame(t);
      if (state.phase !== "play") {
        abortOpen();
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
      return p
        ? {
            id: p.id,
            correctOption: p.options.findIndex((o) => o.correct),
            windowMs: p.windowMs,
            optionCount: p.options.length,
            prompt: p.question.quiz.prompt,
            options: p.options.map((o) => o.label),
            armedAtMs: armedAt(p),
          }
        : null;
    },
    answer(id, option) {
      const p = director.active();
      // A lap: előjelzés alatt a fogás hatástalan (nem válasz, nem hiba).
      if (p && p.id === id && t < armedAt(p)) {
        early += 1;
        return;
      }
      settle(director.answer(id, option, t));
      if (state.phase !== "play") abortOpen();
    },
    done: () => state.phase !== "play",
    won: () => state.phase === "won",
    // Review #498 R1: a pillanatkép a menet VALÓDI végén (menetidő, kérdés / perc); csak a „kérdés nélküli szakasz” igazodik
    // a megszakított kérdés kezdetéhez (annak nyitott ideje nem rés).
    stats: () => (abortedAt === null ? director.stats(t) : { ...director.stats(t), maxGapSec: director.stats(abortedAt).maxGapSec }),
    simTimeMs: () => t,
    band: () => director.band(),
    intensity: () => director.intensity(),
    state: () => state,
    askedKeys: () => asked,
    earlyTaps: () => early,
    director,
  };
}
