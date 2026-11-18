/**
 * J1a — a „Hegyre fel!” node-szimulációja a közös harness-hez (`T/support/game-sim.ts` `SimGame`; végrehajtás K.6, J1a 4.;
 * terv 6.2). React, DOM, three.js és hang nélkül fut; ugyanazt a meghajtót (`createTsunamiDriver`: mag, fix lépésű hurok,
 * kérdés alatti lassítás, hitstop), ugyanazt a kérdés-ütemezőt (`createQuestionDirector`) és ugyanazt a kérdés-sáv
 * állapotgépet (`createQuestionUi`: megoldás-kijelzés ≥ 1,8 mp, csak nyitott kérdésnél lassít) hajtja, mint a lap.
 *
 * A kérdésforrás egy szintetikus, ≥ 200 tételes kézi bank (végrehajtás J1a 4.), opcionálisan tananyag-tételekkel (J7): a sim
 * az ütemezést, az ismétlést és a játékmenetet méri, a tételek minőségét a lap saját őrei nézik.
 *
 * A BOT (a harness megállapodása szerint):
 *  - Kitérés: amikor egy akadály a sávjában `REACT_M` méteren belül van (és a futó a földön, nem botlik), egyszer dönt — ha
 *    `skillRoll < könnyítés`, jól reagál (ugorható akadálynál ugrik, kocsinál a legközelebbi szabad sávba vált), különben
 *    rosszul / későn (nem tesz semmit).
 *  - Kagyló: ha a szomszéd sávban kagyló jön és ott nincs akadály, átvált (szintén ügyességi dobással).
 *  - Kérdés: a harness a reakcióidő után `answer(id, option)`-t hív → a bot a válasz sávjába vált, és ÁTFUT a kapun (a válasz
 *    a kapu átlépésekor dől el, mint a lapon — D-J1a-2). Ha a reakció a kapu elérése után jönne, a futó a sávja kapuján megy át.
 */
import { createRng, seedFrom } from "@shared/game-rng";
import { bankPlayQuestion, createQuestionDirector, materialPlayQuestion, restoreReviewQuestion, type QuestionProvider } from "@/game-engine/play/questionDirector";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import { createQuestionUi } from "@/game-engine/play/questionUi";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import {
  JUMP_AIR_SEC,
  TSUNAMI_GAME_ID,
  createTsunamiDriver,
  tsunamiDirectorConfig,
  tuningFor,
  type TsunamiCore,
  type TsunamiDifficulty,
  type TsunamiDriver,
} from "./core";
import { OBSTACLE_SPECS } from "./obstacles";

/** A bot ennyi méteren belül reagál az előtte lévő akadályra. */
export const REACT_M = 9;
/** A szintetikus kézi bank mérete (végrehajtás J1a 4.: 200 tétel). */
export const SIM_BANK_SIZE = 200;

type SimQuestion = { id: number; correctOption: number; windowMs: number; optionCount: number };

/** Szintetikus kézi bank: kulcsonként egyedi, négy opciós tételek. */
export function simBank(seed: number, size = SIM_BANK_SIZE): FourChoiceQuiz[] {
  const rng = createRng(seedFrom(TSUNAMI_GAME_ID, seed, "simbank"));
  const out: FourChoiceQuiz[] = [];
  for (let i = 0; i < size; i++) {
    const correctIndex = rng.int(4);
    out.push({ id: `sim-${i}`, prompt: `Szimulált kérdés ${i}?`, options: ["alma", "körte", "szilva", "barack"], correctIndex });
  }
  return out;
}

function simProvider(seed: number, material: readonly FourChoiceQuiz[], coupon = false): QuestionProvider {
  const bank = simBank(seed);
  const rng = createRng(seedFrom(TSUNAMI_GAME_ID, seed, "simpick"));
  const asked = new Set<string>();
  let matIdx = 0;
  return {
    // Kupon mód (review #483, M2): csak a lecke tananyaga — a kimerülés utáni ismétlést a director adja.
    couponOnly: coupon,
    material: () => {
      while (matIdx < material.length) {
        const q = material[matIdx++]!;
        return materialPlayQuestion(q);
      }
      return null;
    },
    fresh: () => {
      // A még nem kérdezett tételek közül seedelten (a lap választója is a futás egészére kerüli az ismétlést).
      for (let tries = 0; tries < 8; tries++) {
        const q = bank[rng.int(bank.length)]!;
        if (asked.has(q.id!)) continue;
        asked.add(q.id!);
        return bankPlayQuestion(TSUNAMI_GAME_ID, q);
      }
      const q = bank.find((b) => !asked.has(b.id!)) ?? bank[0]!;
      asked.add(q.id!);
      return bankPlayQuestion(TSUNAMI_GAME_ID, q);
    },
    restore: (item) => (item.key.startsWith(`bank:${TSUNAMI_GAME_ID}:`) || item.key.startsWith("mat:") ? restoreReviewQuestion(item, {}) : null),
  };
}

export type TsunamiSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): SimQuestion | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
  core: TsunamiCore;
  driver: TsunamiDriver;
};

export function createSimGame(opts: {
  seed: number;
  grade: number;
  questions: boolean;
  difficulty?: TsunamiDifficulty;
  material?: readonly FourChoiceQuiz[];
  /** Kupon (lecke-jutalom) mód: csak a `material` tételei kérdeznek. */
  coupon?: boolean;
}): TsunamiSim {
  const director = createQuestionDirector({
    config: tsunamiDirectorConfig(opts.grade),
    provider: simProvider(opts.seed, opts.material ?? [], opts.coupon ?? false),
    review: createReviewQueue(null),
    rng: createRng(seedFrom(TSUNAMI_GAME_ID, opts.seed, "q")),
    startBand: 0.4,
    now: () => 0,
  });
  let driver: TsunamiDriver | null = null;
  const ui = createQuestionUi({
    director: () => (opts.questions ? director : null),
    onView: () => {},
    onOutcome: (o, p) => driver!.onOutcome(o, p),
  });
  driver = createTsunamiDriver({
    seed: opts.seed,
    tuning: tuningFor(opts.difficulty ?? "normal"),
    questions: opts.questions ? ui : null,
    intensity: () => (opts.questions ? director.intensity() : 0.4),
  });
  const d = driver;
  const core = d.core;
  /** Az akadály, amelyre a bot már döntött (egyszer dob egy akadályra). */
  const decided = new Map<number, number>(); // készlet-hely → az akadály helye (a hely újrahasznosul)
  /** A sikeres döntés után az időzített ugrás célja (akadály-azonosító), vagy −1. */
  let jumpFor = -1;
  let lastShellRow = -1;
  const over = () => !core.running();

  /** Szabad-e az `l` sáv a [from, to] szakaszon (élő, el nem ütött akadály nélkül). */
  function laneClear(l: number, from: number, to: number): boolean {
    for (const o of core.state().obstacles) {
      if (!o.alive || o.hit || o.lane !== l) continue;
      const half = OBSTACLE_SPECS[o.kind].length / 2;
      if (o.at + half >= from && o.at - half <= to) return false;
    }
    return true;
  }

  /** A legközelebbi sáv, amely a futótól az akadály mögé (+4 m) szabad; ha nincs, a saját. */
  function freeLaneFrom(lane: number, at: number): number {
    const from = core.state().distance;
    const order = lane === 1 ? [0, 2] : lane === 0 ? [1, 2] : [1, 0];
    for (const l of order) {
      // Két sávnyi váltásnál a köztes sávon is át kell jutni (ott az akadály előtt 3 m-ig szabad legyen).
      if (Math.abs(l - lane) === 2 && !laneClear(1, from, at - 3)) continue;
      if (laneClear(l, from, at + 4)) return l;
    }
    return lane;
  }

  return {
    core,
    driver: d,
    step(dtMs, input) {
      if (over()) {
        if (!ui.finished()) ui.finish();
        return;
      }
      const st = core.state();
      let acted = false;
      // Kitérés: a sávjában a legközelebbi, még el nem döntött akadály.
      if (st.y <= 0) {
        let near: (typeof st.obstacles)[number] | null = null;
        for (const o of st.obstacles) {
          if (!o.alive || o.hit || decided.get(o.id) === o.at || o.lane !== st.lane) continue;
          const ahead = o.at - OBSTACLE_SPECS[o.kind].length / 2 - st.distance;
          if (ahead > 0 && ahead < REACT_M && (!near || o.at < near.at)) near = o;
        }
        if (near) {
          decided.set(near.id, near.at);
          acted = true;
          if (input.skillRoll < 1) {
            if (OBSTACLE_SPECS[near.kind].jumpable) jumpFor = near.id;
            else {
              const to = freeLaneFrom(st.lane, near.at);
              if (to !== st.lane) core.input.laneDelta = to - st.targetLane;
            }
          }
        }
        // Az időzített ugrás: a légi idő közepe essen az akadályra.
        if (jumpFor >= 0) {
          const o = st.obstacles[jumpFor]!;
          const ahead = o.at - st.distance;
          if (!o.alive || o.hit || ahead < 0) jumpFor = -1;
          else if (ahead <= st.speed * JUMP_AIR_SEC * 0.45) {
            core.input.jump = true;
            jumpFor = -1;
          }
        }
      }
      // Kagyló a szomszéd sávban (nincs nyitott kapu, épp nem tér ki): átvált, ha az odáig vezető út szabad.
      if (!st.gates && !acted && jumpFor < 0 && st.lane === st.targetLane) {
        for (const s of st.shells) {
          if (!s.alive || s.row === lastShellRow || s.at < st.distance || s.at - st.distance > 14) continue;
          lastShellRow = s.row;
          if (s.lane !== st.lane && Math.abs(s.lane - st.lane) === 1 && laneClear(s.lane, st.distance, s.at + 8) && input.skillRoll < 1) {
            core.input.laneDelta = s.lane - st.targetLane;
          }
          break;
        }
      }
      d.frame(dtMs, false);
      if (over() && !ui.finished()) ui.finish();
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal) return null;
      return { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length };
    },
    answer(id, option) {
      const p = ui.active();
      const g = core.state().gates;
      if (!p || p.id !== id || !g || g.presentationId !== id) return;
      // A bot a válasz sávjába vált; a válasz a kapu átlépésekor dől el.
      const lane = g.laneOptions.indexOf(option);
      if (lane >= 0) {
        core.input.steer = 0;
        core.input.laneDelta = 0;
        const delta = lane - core.state().targetLane;
        // D-J1a-13: ha már a jó sávban fut, a döntését a tábla megérintésével jelzi (a tétlen átfutás nem számít válasznak).
        if (delta === 0) d.tapOption(option);
        else core.input.laneDelta = delta;
      }
    },
    done: () => over(),
    won: () => core.state().phase === "won",
    stats: () => director.stats(d.clockMs()),
    simTimeMs: () => d.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
  };
}
