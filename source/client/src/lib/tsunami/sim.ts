/**
 * Szökőár szökés — az emelkedő víz node-szimulációja a közös harness-hez (`T/support/game-sim.ts` `SimGame`; terv:
 * docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md). React, DOM, three.js és hang nélkül fut; ugyanazt a meghajtót
 * (`createTsunamiDriver`: víz-mag, fix lépésű hurok, kérdés alatti lassítás), ugyanazt a kérdés-ütemezőt (`createQuestionDirector`)
 * és ugyanazt a kérdés-sáv állapotgépet (`createQuestionUi`) hajtja, mint a lap.
 *
 * A BOT: a biztonsági zóna felé mozog (ügyességi dobással: `skillRoll < 1` → a zóna felé, különben a sodrásra bízza magát), és a
 * harness által a reakcióidő után kért választ a válaszgomb megérintésével adja (élesítés után, mint a lapon).
 */
import { createRng, seedFrom } from "@shared/game-rng";
import { bankPlayQuestion, createQuestionDirector, materialPlayQuestion, restoreReviewQuestion, type QuestionProvider } from "@/game-engine/play/questionDirector";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import { createQuestionUi } from "@/game-engine/play/questionUi";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import { TSUNAMI_GAME_ID, ZONE_HALF, createTsunamiDriver, tsunamiDirectorConfig, type TsunamiDifficulty, type TsunamiDriver, type WaterCore } from "./water";
import { paceTsunamiDirector } from "./pacing";

/** A szintetikus kézi bank mérete. */
export const SIM_BANK_SIZE = 200;

type SimQuestion = { id: number; correctOption: number; windowMs: number; optionCount: number };

/** Valódi kérdés-forrás a szimulációhoz (a teszt adja meg — a kliensmodul nem olvassa az egész évfolyam-bankot). */
export type SimQuestionSource = (grade: number | null) => readonly { prompt: string; options: readonly string[]; correctIndex: number }[];
let realSource: SimQuestionSource | null = null;
/** A szimuláció valódi hosszúságú kérdéseket kap (a független ellenőr K1 lelete); `null` → a rövid szintetikus bank. */
export function setSimQuestionSource(src: SimQuestionSource | null): void {
  realSource = src;
}

/**
 * A szimuláció bankja: ha van valódi forrás (`setSimQuestionSource`), annak tételei — így az olvasási ablak a valódi
 * szöveghosszal számol —, különben rövid szintetikus tételek. Kulcsonként egyedi azonosító.
 */
export function simBank(seed: number, size = SIM_BANK_SIZE, grade: number | null = null): FourChoiceQuiz[] {
  const real = realSource?.(grade) ?? [];
  const pool = real.length ? real : [{ prompt: "Szimulált kérdés?", options: ["alma", "körte", "szilva", "barack"], correctIndex: 0 }];
  const rng = createRng(seedFrom(TSUNAMI_GAME_ID, seed, "simbank"));
  const out: FourChoiceQuiz[] = [];
  for (let i = 0; i < size; i++) {
    const g = pool[rng.int(pool.length)]!;
    const correctIndex = real.length ? g.correctIndex : rng.int(4);
    out.push({ id: `sim-${i}`, prompt: real.length ? g.prompt : `Szimulált kérdés ${i}?`, options: [...g.options], correctIndex });
  }
  return out;
}

function simProvider(seed: number, material: readonly FourChoiceQuiz[], coupon = false, grade: number | null = null): QuestionProvider {
  const bank = simBank(seed, SIM_BANK_SIZE, grade);
  const rng = createRng(seedFrom(TSUNAMI_GAME_ID, seed, "simpick"));
  const asked = new Set<string>();
  let matIdx = 0;
  return {
    couponOnly: coupon,
    material: () => {
      while (matIdx < material.length) {
        const q = material[matIdx++]!;
        return materialPlayQuestion(q);
      }
      return null;
    },
    fresh: () => {
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
  core: WaterCore;
  driver: TsunamiDriver;
};

export function createSimGame(opts: {
  seed: number;
  grade: number;
  questions: boolean;
  difficulty?: TsunamiDifficulty;
  material?: readonly FourChoiceQuiz[];
  coupon?: boolean;
  /** A lap pálya-tempója (`tsunamiWaterPace`, 0,85–1,15; a független ellenőr K6 lelete). */
  pace?: number;
}): TsunamiSim {
  const base = createQuestionDirector({
    config: tsunamiDirectorConfig(opts.grade),
    provider: simProvider(opts.seed, opts.material ?? [], opts.coupon ?? false, opts.grade),
    review: createReviewQueue(null),
    rng: createRng(seedFrom(TSUNAMI_GAME_ID, opts.seed, "q")),
    startBand: 0.4,
    now: () => 0,
  });
  // Ugyanaz az olvasási-ablak burkoló, mint a lapon (pacing.ts).
  const director = paceTsunamiDirector(base, { grade: () => opts.grade });
  let driver: TsunamiDriver | null = null;
  const ui = createQuestionUi({
    director: () => (opts.questions ? director : null),
    onView: () => {},
    onOutcome: (o, p) => driver!.onOutcome(o, p),
  });
  driver = createTsunamiDriver({ seed: opts.seed, difficulty: opts.difficulty ?? "normal", pace: opts.pace, questions: opts.questions ? ui : null });
  const d = driver;
  const core = d.core;
  const over = () => !core.running();
  /** A még meg nem érintett (élesítésre váró) válasz. */
  let pending: { id: number; option: number } | null = null;

  return {
    core,
    driver: d,
    step(dtMs, input) {
      if (over()) {
        if (!ui.finished()) ui.finish();
        return;
      }
      const st = core.state();
      // A zóna felé (ügyességi dobással); a zónán belül megáll.
      const off = st.zoneX - st.x;
      core.input.move = input.skillRoll < 1 && Math.abs(off) > ZONE_HALF * 0.5 ? Math.sign(off) : 0;
      core.input.sprint = input.skillRoll < 1 && Math.abs(off) > 25;
      if (pending) {
        const p = ui.active();
        if (!p || p.id !== pending.id) pending = null;
        else if (d.armedPresentationId() === pending.id) {
          d.tapOption(pending.option);
          pending = null;
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
      if (!p || p.id !== id) return;
      if (d.armedPresentationId() === id) d.tapOption(option);
      else pending = { id, option };
    },
    done: () => over(),
    won: () => core.state().phase === "won",
    stats: () => director.stats(d.clockMs()),
    simTimeMs: () => d.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
  };
}
