import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRng, seedFrom } from "../shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  restoreReviewQuestion,
  type DirectorConfig,
} from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import {
  medianOf,
  runSim,
  runSimSeeds,
  SIM_AVERAGE,
  SIM_STRONG,
  SIM_WEAK,
  SIM_YOUNG,
  simSeeds,
  type SimGame,
  type SimGameFactory,
} from "./support/game-sim";

/**
 * J0b — a szimulációs harness próbája egy referencia-játékon (végrehajtás J0b 7. lépés): a `toyGame` sávfutó, amelyben
 * kérdés nélkül másodpercenként 0,1 eséllyel jön akadály, és a játékos az ügyességi dobása szerint tér ki (átlagos
 * játékosnál 0,1 × 0,2 = 2% / mp ütközés). Jó válasz pajzsot ad (a következő ütközést elnyeli), rossz válasz / időtúllépés
 * a pajzsot veszi el (erőforrás, nem élet — KSZ-15). 3 élet; 150 mp túlélés = győzelem.
 */

const TOY_CONFIG: DirectorConfig = {
  gameId: "tsunami-english",
  optionCount: 3,
  minGapMs: 1500,
  maxGapMs: 15_000,
  targetPerMin: 5,
  baseWindowMs: 4000,
  slowMo: 0.5,
  grade: 7,
};
const T0 = 1_800_000_000_000;
const GOAL_MS = 150_000;
const HAZARD_PER_SEC = 0.1;

const toyGame: SimGameFactory = ({ seed, grade, questions }): SimGame => {
  const world = createRng(seedFrom("toy", seed));
  let i = 0;
  const director = createQuestionDirector({
    config: { ...TOY_CONFIG, grade },
    provider: {
      couponOnly: false,
      material: () => null,
      fresh: () => {
        i += 1;
        return bankPlayQuestion("tsunami-english", { id: `t${i}`, prompt: `Kérdés ${i}?`, options: ["a", "b", "c", "d"], correctIndex: i % 4 });
      },
      restore: (item) => restoreReviewQuestion(item, {}),
    },
    review: createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom("toy-review", seed)) }),
    rng: createRng(seedFrom("toy-q", seed)),
    startBand: 0.4,
    now: () => T0,
  });
  let t = 0;
  let lives = 3;
  let shield = 0;
  let lastHazard = -Infinity;
  const apply = (result: string | undefined) => {
    if (result === "correct") shield = Math.min(2, shield + 1);
    else if (result === "wrong" || result === "timeout") shield = Math.max(0, shield - 1);
  };
  return {
    step(dtMs, input) {
      if (lives <= 0 || t >= GOAL_MS) return;
      t += dtMs;
      const active = director.active();
      if (active && t >= active.startedAtSimMs + active.windowMs) apply(director.expire(t)?.result);
      const worldSpeed = director.active() ? director.active()!.slowMo : 1;
      if (world.next() < HAZARD_PER_SEC * (dtMs / 1000) * worldSpeed) {
        lastHazard = t;
        if (input.skillRoll >= 1) {
          if (shield > 0) shield -= 1;
          else lives -= 1;
        }
      }
      if (questions) director.tick(t, { calm: t - lastHazard > 1000 });
    },
    question() {
      const p = director.active();
      return p ? { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length } : null;
    },
    answer(id, option) {
      apply(director.answer(id, option, t)?.result);
    },
    done: () => lives <= 0 || t >= GOAL_MS,
    won: () => lives > 0 && t >= GOAL_MS,
    stats: () => director.stats(t),
    simTimeMs: () => t,
    band: () => director.band(),
    intensity: () => director.intensity(),
  };
};

test("runSim determinisztikus: ugyanaz a seed → ugyanaz az eredmény; más seed → más", () => {
  const a = runSim(toyGame, SIM_AVERAGE, { seed: 123, seconds: 180 });
  const b = runSim(toyGame, SIM_AVERAGE, { seed: 123, seconds: 180 });
  assert.deepEqual(a, b);
  const others = [124, 125, 126].map((seed) => JSON.stringify(runSim(toyGame, SIM_AVERAGE, { seed, seconds: 180 })));
  assert.ok(others.some((o) => o !== JSON.stringify(a)));
  assert.deepEqual(simSeeds("tsunami-english"), simSeeds("tsunami-english"));
  assert.equal(new Set(simSeeds("tsunami-english")).size, 20);
  assert.notDeepEqual(simSeeds("tsunami-english"), simSeeds("word-ladder-hu-en"));
});

test("perMinute és maxGapSec a director beállításaival összhangban (SIM_AVERAGE, 20 seed × 180 mp)", () => {
  const runs = runSimSeeds(toyGame, SIM_AVERAGE, { gameId: "tsunami-english", seconds: 180 });
  // Kérdés/perc: a director célrése 10%-kal a küszöb fölé ütemez → a medián ≥ targetPerMin.
  const perMin = medianOf(runs.map((r) => r.stats.perMinute));
  assert.ok(perMin >= TOY_CONFIG.targetPerMin, `kérdés/perc medián ${perMin}`);
  for (const r of runs) {
    // „Legfeljebb” küszöbök: mindegyik futásra.
    assert.ok(r.stats.maxGapSec <= TOY_CONFIG.maxGapMs / 1000 + 1e-9, `maxGap ${r.stats.maxGapSec}`);
    assert.ok(r.stats.asked < 2 || r.stats.minGapSec >= TOY_CONFIG.minGapMs / 1000, `minGap ${r.stats.minGapSec}`);
    assert.ok(r.stats.reviewShare <= 0.3 + 1e-9);
    assert.equal(r.stats.firstSource, "bank");
    assert.ok(r.durationSec <= 180);
  }
  // A 75%-os játékos helyes aránya a mért válaszokon a modell körül van (időtúllépés nélkül ~75%).
  const acc = medianOf(runs.map((r) => r.stats.correct / Math.max(1, r.stats.answered)));
  assert.ok(acc > 0.65 && acc < 0.85, `helyes arány ${acc}`);
});

test("játékosmodellek: az erős többet és gyorsabban talál, a gyenge időtúllépéssel is hibázik", () => {
  const strong = runSimSeeds(toyGame, SIM_STRONG, { gameId: "tsunami-english", seconds: 180, count: 10 });
  const weak = runSimSeeds(toyGame, SIM_WEAK, { gameId: "tsunami-english", seconds: 180, count: 10 });
  const young = runSimSeeds(toyGame, SIM_YOUNG, { gameId: "tsunami-english", seconds: 180, count: 10, grade: 3 });
  const rate = (runs: typeof strong) => medianOf(runs.map((r) => r.stats.correct / Math.max(1, r.stats.asked)));
  assert.ok(rate(strong) > 0.85, `erős ${rate(strong)}`);
  assert.ok(rate(weak) < 0.5, `gyenge ${rate(weak)}`);
  assert.ok(medianOf(weak.map((r) => r.stats.timeouts)) > 0, "a 4 mp-es mediánú gyenge játékos néha kifut az ablakból");
  assert.ok(medianOf(strong.map((r) => r.stats.timeouts)) === 0);
  assert.ok(medianOf(young.map((r) => r.stats.asked)) > 0, "3. évfolyamon (×1,25 ablak) is fut");
  assert.ok(medianOf(strong.map((r) => r.stats.perMinute)) >= TOY_CONFIG.targetPerMin);
});

test("kérdés nélküli mód: a menet végigjátszható, és van vesztési feltétel", () => {
  const avg = runSimSeeds(toyGame, SIM_AVERAGE, { gameId: "tsunami-english", seconds: 600, questions: false });
  assert.ok(avg.every((r) => r.stats.asked === 0), "questions: false → nincs kérdés");
  assert.ok(avg.some((r) => r.won), "végigjátszható");
  const weak = runSimSeeds(toyGame, SIM_WEAK, { gameId: "tsunami-english", seconds: 600, questions: false });
  assert.ok(weak.some((r) => !r.won && r.durationSec < GOAL_MS / 1000), "van vesztés");
});

test("a J0b tiszta magja a J0a determinizmus-őre alatt van (fájlnevek egyeznek, a fájlok léteznek)", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const guard = readFileSync(join(root, "tests/game-sim-determinism-guard.test.ts"), "utf8");
  const list = /PLAY_SIM_FILES\s*=\s*\[([^\]]*)\]/.exec(guard)?.[1] ?? "";
  for (const name of ["flow", "combo", "waves", "reviewQueue", "runStats", "questionDirector"]) {
    assert.ok(list.includes(`"${name}"`), `${name} hiányzik a determinizmus-őr listájából`);
    assert.ok(existsSync(join(root, `client/src/game-engine/play/${name}.ts`)), `${name}.ts hiányzik`);
  }
});

test("runSim: hibás paraméter → RangeError", () => {
  assert.throws(() => runSim(toyGame, SIM_AVERAGE, { seed: 1, seconds: 0 }), RangeError);
  assert.throws(() => runSim(toyGame, { ...SIM_AVERAGE, skill: 0 }, { seed: 1, seconds: 10 }), RangeError);
  assert.ok(Number.isNaN(medianOf([])));
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 2, 3]), 2.5);
});
