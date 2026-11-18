/**
 * Szólétra — EMBERI olvasási idővel válaszoló szimulációs bot (olvashatósági javítás, docs/specs/2026-11-17-szoletra-
 * olvashatosag.md 3. „Bizonyítás”; átmeneti kapu 3(d): a szimuláció ugyanazt a magot és szabályt hajtja, mint a lap,
 * emberi reakcióidővel).
 *
 * A közös `runSim` (T/support/game-sim.ts) a kérdés hosszától független reakcióidővel válaszol — az olvasási mérésre ez
 * nem elég. Ez a bot az élesítés (előjelzés vége) után a TELJES szöveget (prompt + mind a négy fogás) végigolvassa a
 * profil olvasási sebességével, majd dönt; ha ez az ablakon túl van, nem válaszol (lejár). A szórás seedelt.
 *
 * A profil olvasási sebessége az évfolyam közös becsléséhez (`readingWpm`) viszonyított szorzó, így egy „lassú olvasó”
 * minden évfolyamon az évfolyamához képest lassú.
 */
import { createRng, seedFrom } from "../../shared/game-rng";
import { readingWpm, wordsOf } from "../../client/src/game-engine/play/reading";
import { createSimGame, type WordLadderSimOptions } from "../../client/src/lib/wordLadder/sim";
import type { RunStatsSnapshot } from "../../client/src/game-engine/play/runStats";
import type { FourChoiceQuiz } from "../../client/src/types/gameQuiz";
import { WORD_LADDER_EN } from "../../client/src/data/wordLadder/en";
import { VOCAB_EN } from "../../client/src/data/vocabBank/vocab-en";
import { generateVocabQuestion, type VocabQuestionType } from "../../client/src/game-engine/vocab/questionGenerator";
import { ladderBaseTier } from "../../client/src/game-engine/no-repeat";

export type ReaderProfile = {
  name: string;
  /** Olvasási sebesség a `readingWpm(évfolyam)` szorzójaként. */
  wpmFactor: number;
  /** A végigolvasás utáni döntés mediánja (ms), lognormális szórással. */
  decideMedianMs: number;
  accuracy: number;
  /** Szabad fogásnál (kérdés nélkül) az ügyesség. */
  skill: number;
};

/** Lassú olvasó: az évfolyamához képest jóval lassabban olvas, sokat gondolkodik (a tulajdonos „el sem tudom olvasni” esete). */
export const READER_SLOW: ReaderProfile = { name: "lassú olvasó", wpmFactor: 0.6, decideMedianMs: 2500, accuracy: 0.65, skill: 0.6 };
/** Átlagos / fiatal játékos: az évfolyam becslésénél kicsit lassabban olvas. */
export const READER_TYPICAL: ReaderProfile = { name: "átlagos", wpmFactor: 0.8, decideMedianMs: 1800, accuracy: 0.75, skill: 0.75 };
/** Erős olvasó. */
export const READER_STRONG: ReaderProfile = { name: "erős", wpmFactor: 1.2, decideMedianMs: 1200, accuracy: 0.92, skill: 0.9 };

export const READ_SIGMA = 0.2;
export const DECIDE_SIGMA = 0.35;

function normal(rng: () => number): number {
  const u1 = Math.max(Number.EPSILON, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** A bot reakcióideje az élesítéstől (ms): teljes olvasás + döntés, lognormális szórással. */
export function readerReactionMs(profile: ReaderProfile, grade: number, prompt: string, options: readonly string[], rng: () => number): number {
  const words = wordsOf(prompt) + options.reduce((n, o) => n + wordsOf(o), 0);
  const wpm = readingWpm(grade) * profile.wpmFactor;
  const read = (words / wpm) * 60_000 * Math.exp(READ_SIGMA * normal(rng));
  const decide = profile.decideMedianMs * Math.exp(DECIDE_SIGMA * normal(rng));
  return read + decide;
}

export type ReaderRun = {
  won: boolean;
  durationSec: number;
  stats: RunStatsSnapshot;
  /** Hány kérdésnél végzett a bot az ablakon belül (a válaszra szánt idejével) / összes kérdés. */
  inWindow: number;
  questions: number;
  earlyTaps: number;
};

export function runReader(
  profile: ReaderProfile,
  opts: Omit<WordLadderSimOptions, "seed"> & { seed: number; seconds?: number; dtMs?: number },
): ReaderRun {
  const dtMs = opts.dtMs ?? 1000 / 60;
  const limitMs = (opts.seconds ?? 900) * 1000;
  const game = createSimGame(opts);
  const rng = createRng(seedFrom("reader", profile.name, opts.seed)).next;
  let planned: { id: number; at: number; option: number } | null = null;
  let seenId = -1;
  let inWindow = 0;
  let questions = 0;
  const maxSteps = Math.ceil(limitMs / dtMs) + 1;
  for (let i = 0; i < maxSteps && !game.done() && game.simTimeMs() < limitMs; i++) {
    const q = game.question();
    if (q && q.id !== seenId) {
      seenId = q.id;
      questions += 1;
      const reaction = readerReactionMs(profile, opts.grade, q.prompt, q.options, rng);
      const correct = rng() < profile.accuracy;
      let option = q.correctOption;
      if (!correct && q.optionCount > 1) {
        const k = Math.min(q.optionCount - 2, Math.floor(rng() * (q.optionCount - 1)));
        option = k >= q.correctOption ? k + 1 : k;
      }
      if (reaction <= q.windowMs) inWindow += 1;
      planned = reaction > q.windowMs ? null : { id: q.id, at: q.armedAtMs + reaction, option };
    }
    if (planned && q && q.id === planned.id && game.simTimeMs() >= planned.at) {
      game.answer(planned.id, planned.option);
      planned = null;
    }
    game.step(dtMs, { skillRoll: rng() / profile.skill });
  }
  return { won: game.won(), durationSec: game.simTimeMs() / 1000, stats: game.stats(), inWindow, questions, earlyTaps: game.earlyTaps() };
}

/**
 * Valódi angol tételek az évfolyam szintjén (a lap forrásai): a kézi bank szintje + a központi szóbank azonos szintű
 * bejegyzéseiből generált kérdések (játék-alakú hiányos mondattal), seedelt keveréssel. Az olvasási mérés így a valódi
 * prompt- és válaszhosszakkal fut, nem a szintetikus „Mit jelent: wordN?” tételekkel.
 */
export function realLadderBank(grade: number): FourChoiceQuiz[] {
  const tier = ladderBaseTier(grade);
  const rng = createRng(seedFrom("wl-real-bank", grade)).next;
  const out: FourChoiceQuiz[] = WORD_LADDER_EN.filter((i) => i.tier === tier).map((i) => ({ id: i.id, prompt: i.prompt, options: i.options.slice(), correctIndex: i.correctIndex }));
  const types: VocabQuestionType[] = ["hu-to-target", "target-to-hu", "cloze", "phrase-meaning"];
  for (const e of VOCAB_EN.filter((x) => x.level === tier)) {
    const q = generateVocabQuestion(e, VOCAB_EN, types[Math.min(3, Math.floor(rng() * 4))]!, rng, { clozeStyle: "game" });
    if (q) out.push({ id: q.id, prompt: q.prompt, options: q.options.slice(), correctIndex: q.correctIndex });
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
