/**
 * J0b — szimulációs harness: „bot játékos” a játékok tiszta magjához (végrehajtás J0b „Szerződés”, K.6; terv 6.2
 * „Szimulációs paraméterek”). A játékszeletek ezzel mérik a kérdés/perc, a kérdés nélküli rés, az ismétlés és a
 * változatosság elfogadási pontjait (`T/<játék>-sim.test.ts`), React és three.js nélkül, `node --test` alatt.
 *
 * A JÁTÉK oldala (`SimGame`, a játék `createSimGame(opts)`-ja adja):
 * - `step(dtMs, input)` — egy lépés. A `dtMs` a lassítatlan kérdés-óra lépése (a kérdés alatti `slowMo` a játék VILÁGÁT
 *   lassítja, a válaszablakot és a `simTimeMs()`-t nem — lásd `GE/play/questionDirector.ts` „IDŐ”). A játék a lépésben
 *   maga hívja a director `tick`-jét, és lejáratkor az `expire`-t (a bot időtúllépéskor egyszerűen nem válaszol).
 * - `input.skillRoll` — a játékos ügyességi dobása erre a lépésre: `u / player.skill`, ahol `u` egyenletes [0, 1).
 *   Megállapodás: a játék akkor ítél sikert (kitérés, találat), ha `skillRoll < könnyítés`, ahol a könnyítés 1 a normál
 *   helyzetben (siker esélye = `skill`), kisebb a nehezebbben (esély = könnyítés × skill). Ugyanazt a dobást a lépés
 *   minden ügyességi döntése használhatja.
 * - `question()` — a nyitott kérdés (a helyes opció indexe a `QuestionPresentation.options` tömbben), különben null.
 * - `answer(id, option)` — a bot válasza (opció-index ugyanabban a tömbben).
 * - `stats()` — a director `stats(simTimeMs())` pillanatképe; `done()` / `won()` a menet vége és kimenete.
 *
 * A BOT (a terv 6.2 játékosmodelljei): reakcióidő log-normális (σ = 0,35) a `reactionMedianMs` mediánnal, helyes
 * válasz `accuracy` eséllyel (különben egyenletesen egy rossz opció), és ha a reakció > `windowMs`, nem válaszol
 * (időtúllépés). A véletlen `mulberry32(seed ^ 0x9e37)` — a játék saját seedelt RNG-jétől független.
 *
 * Használat egy játékszelet tesztjében:
 *
 *   import { runSimSeeds, medianOf, SIM_AVERAGE } from "./support/game-sim";
 *   import { createSimGame } from "../client/src/lib/tsunami/sim";
 *   const runs = runSimSeeds(createSimGame, SIM_AVERAGE, { gameId: "tsunami-english", seconds: 180, grade: 7 });
 *   assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 5);          // terv 6.2 kérdés/perc, medián
 *   assert.ok(runs.every((r) => r.stats.maxGapSec <= 15));                  // „legfeljebb” küszöb: mindegyik futás
 *   const noQ = runSimSeeds(createSimGame, SIM_AVERAGE, { gameId: "tsunami-english", seconds: 600, questions: false });
 *   assert.ok(noQ.some((r) => r.durationSec < 600 && !r.won));              // van vesztési feltétel
 */
import { createRng, seedFrom } from "../../shared/game-rng";
import type { RunStatsSnapshot } from "../../client/src/game-engine/play/runStats";
import type { PlayGameId } from "../../client/src/game-engine/play/types";
import { seededRng } from "./vocab-fixture";

export type SimPlayer = { accuracy: number; reactionMedianMs: number; skill: number };
export const SIM_AVERAGE: SimPlayer = { accuracy: 0.75, reactionMedianMs: 2800, skill: 0.8 };
export const SIM_YOUNG: SimPlayer = { accuracy: 0.75, reactionMedianMs: 3500, skill: 0.7 }; // 3–4. évf.
export const SIM_STRONG: SimPlayer = { accuracy: 0.95, reactionMedianMs: 1800, skill: 0.9 };
export const SIM_WEAK: SimPlayer = { accuracy: 0.45, reactionMedianMs: 4000, skill: 0.6 };
export type SimInput = { skillRoll: number }; // a játék a skill-dobásból dönti el a kitérés / célzás sikerét
export type SimGame = {
  step(dtMs: number, input: SimInput): void;
  question(): { id: number; correctOption: number; windowMs: number; optionCount: number } | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
};
export type SimGameFactory = (opts: { seed: number; grade: number; questions: boolean }) => SimGame;
export type SimResult = { stats: RunStatsSnapshot; won: boolean; durationSec: number };

/** Log-normális reakcióidő σ-ja (terv 6.2). */
export const SIM_REACTION_SIGMA = 0.35;
/** Alap lépés: 1/60 s (terv 6.2). */
export const SIM_DT_MS = 1000 / 60;
export const SIM_DEFAULT_GRADE = 7;

/** Box–Muller: standard normális minta két egyenletesből. */
function normal(rng: () => number): number {
  const u1 = Math.max(Number.EPSILON, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function runSim(
  factory: SimGameFactory,
  player: SimPlayer,
  opts: { seed: number; seconds: number; grade?: number; questions?: boolean; dtMs?: number },
): SimResult {
  const dtMs = opts.dtMs ?? SIM_DT_MS;
  if (!(dtMs > 0) || !(opts.seconds > 0)) throw new RangeError("runSim: dtMs > 0 és seconds > 0 kell");
  if (!(player.skill > 0) || player.accuracy < 0 || player.accuracy > 1) throw new RangeError("runSim: skill > 0, accuracy 0..1");
  const game = factory({ seed: opts.seed, grade: opts.grade ?? SIM_DEFAULT_GRADE, questions: opts.questions ?? true });
  const rng = seededRng((opts.seed ^ 0x9e37) >>> 0);
  const limitMs = opts.seconds * 1000;
  let planned: { id: number; at: number; option: number } | null = null;
  let seenId = -1;

  // A lépésszám-korlát a lebegőpontos idő-összegzés ellen véd (nem a játék idejét szabja meg).
  const maxSteps = Math.ceil(limitMs / dtMs) + 1;
  for (let i = 0; i < maxSteps && !game.done() && game.simTimeMs() < limitMs; i++) {
    const q = game.question();
    if (q && q.id !== seenId) {
      seenId = q.id;
      const reaction = player.reactionMedianMs * Math.exp(SIM_REACTION_SIGMA * normal(rng));
      const correct = rng() < player.accuracy;
      let option = q.correctOption;
      if (!correct && q.optionCount > 1) {
        const k = Math.min(q.optionCount - 2, Math.floor(rng() * (q.optionCount - 1)));
        option = k >= q.correctOption ? k + 1 : k;
      }
      planned = reaction > q.windowMs ? null : { id: q.id, at: game.simTimeMs() + reaction, option };
    }
    if (planned && q && q.id === planned.id && game.simTimeMs() >= planned.at) {
      game.answer(planned.id, planned.option);
      planned = null;
    }
    game.step(dtMs, { skillRoll: rng() / player.skill });
  }
  return { stats: game.stats(), won: game.won(), durationSec: game.simTimeMs() / 1000 };
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A terv 6.2 seedjei: `seedFrom("sim", gameId, i)`, i = 1…count, 32 bites egészre képezve (a `SimGameFactory` számot vár). */
export function simSeeds(gameId: PlayGameId, count = 20): number[] {
  return Array.from({ length: count }, (_, k) => Math.floor(createRng(seedFrom("sim", gameId, k + 1)).next() * 0x1_0000_0000));
}

/** `runSim` a terv 6.2 seedjein (alap 20); az eredmények a seedek sorrendjében. */
export function runSimSeeds(
  factory: SimGameFactory,
  player: SimPlayer,
  opts: { gameId: PlayGameId; seconds: number; grade?: number; questions?: boolean; dtMs?: number; count?: number },
): SimResult[] {
  return simSeeds(opts.gameId, opts.count).map((seed) => runSim(factory, player, { ...opts, seed }));
}
