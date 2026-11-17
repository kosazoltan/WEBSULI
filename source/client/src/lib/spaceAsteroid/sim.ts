/**
 * Galaktikus Aszteroida — meghajtó és node-szimuláció (végrehajtás J6a; K.6; terv 5.6, 6.2).
 *
 * Két része van, mindkettő tiszta TypeScript (nincs DOM, three.js, React, hang, óra, `Math.random` — őr:
 * `T/game-sim-determinism-guard.test.ts`):
 *
 * 1. `createAsteroidDriver` — a lap ÉS a szimuláció KÖZÖS meghajtója (K.6 „Közös meghajtó”; a J4a pilot tanulsága: más
 *    lépésű sim más ellenfélsort mér). Fix 1/60 s-os hurok (`createFixedLoop`), a nyitott kérdés alatti időskála
 *    (`presentation.slowMo`), hitstop és rázás (`createFeel`), a mini-Director (`createIntensityDirector`) és a kérdés-sáv
 *    képkocka-hívása (a director `tick`-je a `calm()` pillanatokban). A világ egyetlen lépése az `opts.step`, amelyet a lap
 *    a saját (három.js-es, ref-alapú) játékvilágára, a szimuláció az alábbi `createAsteroidWorld`-re köt.
 *
 * 2. `createAsteroidWorld` + `createSimGame` — a játékmenet SZABÁLYAINAK tiszta modellje a `T/support/game-sim.ts`
 *    harness-hez: a hullám-képlet (`physics.ts` `waveEnemyCount`, `waveSpawnInterval`, `pickEnemyKind`, `enemyHp` — ugyanaz a
 *    függvény, mint a lapon), a rock-hasadás, az életek és a 2 mp sérthetetlenség, a főellenfél 90 HP-ja és három fázisa, a
 *    Kristály-válasz (`crystals.ts`) következményei (jó: fejlesztés az intenzitás szerint; rossz: 3 apró szikla). NEM a 3D
 *    lap pontos mása: a lövedék-fizikát és a célzást egy bot-lövés (ügyességi dobás) helyettesíti — ezt a PR „Eltérések”
 *    része és a `T/space-asteroid-sim.test.ts` fejkommentje is rögzíti. A lap saját méréséről: `T/space-asteroid-play.spec.ts`.
 */
import { createRng, seedFrom } from "@shared/game-rng";
import { createFeel, type Feel } from "@/game-engine/play/feel";
import { createFixedLoop, SIM_STEP_MS, type FixedLoop } from "@/game-engine/play/loop";
import { createIntensityDirector, type IntensityDirector } from "@/game-engine/play/director";
import {
  bankPlayQuestion,
  createQuestionDirector,
  restoreReviewQuestion,
  type DirectorConfig,
  type QuestionProvider,
} from "@/game-engine/play/questionDirector";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import { createQuestionUi } from "@/game-engine/play/questionUi";
import { fitsAllViewports } from "@/game-engine/play/promptFit";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";

import {
  crystalLabelsFit,
  crystalShards,
  hitCrystal,
  spawnCrystals,
  stepCrystals,
  crystalBounds,
  type Crystal,
} from "./crystals";
import {
  BOSS_WAVE,
  GAME_H,
  HIT_INVULN_SEC,
  PLAYER_Y_MAX,
  SPAWN_Y_MAX,
  SPAWN_Y_MIN,
  enemyHp,
  pickEnemyKind,
  pickRockSize,
  waveBaseVy,
  waveEnemyCount,
  waveSpawnInterval,
} from "./physics";

export const ASTEROID_GAME_ID = "space-asteroid-quiz" as const;

/**
 * A menet valós kérdés-számai a director statisztikájából (K.2 „Menet-statisztika”): a `ResultScreen` és a `recordRun`
 * (`correctAnswers` / `wrongAnswers`) ebből kap értéket — a korábbi „leszedett ellenfél ≈ helyes válasz” közelítés megszűnt.
 * A lejárt kérdés hibának számít (nem válasz, de nem is helyes).
 */
export function questionTotals(stats: Pick<RunStatsSnapshot, "correct" | "wrong" | "timeouts"> | null | undefined): { correct: number; wrong: number; total: number } {
  const correct = stats?.correct ?? 0;
  const wrong = (stats?.wrong ?? 0) + (stats?.timeouts ?? 0);
  return { correct, wrong, total: correct + wrong };
}

/** A nyitott kérdés alatti világ-sebesség (végrehajtás J6a: `slowMo: 0.7`). */
export const ASTEROID_SLOW_MO = 0.7;

/**
 * A kérdés-ütemező beállítása (végrehajtás J6a 3.): 4 opció (négy kristály), 1,5–20 mp rés, 4 kérdés/perc cél, 5,5 mp alap
 * ablak (3–4. évfolyamon ×1,25 a `windowMsFor`-ban), 0,7× lassítás a kérdés alatt. A tananyag-kérdések hosszúak: az ablak
 * a gyerek becsült olvasási idejéhez igazodik (≤ 9 mp), és a forrás előbb a mindhárom nézetben beférő tételt adja.
 */
export function asteroidDirectorConfig(grade: number | null): DirectorConfig {
  const baseWindowMs = 5500;
  return {
    gameId: ASTEROID_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 20000,
    targetPerMin: 4,
    baseWindowMs,
    slowMo: ASTEROID_SLOW_MO,
    grade,
    readingAware: true,
    promptFits: (quiz) => crystalLabelsFit(quiz.options) && fitsAllViewports(quiz, { grade, baseWindowMs }).ok,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Közös meghajtó (lap + szimuláció)                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A kérdés-sáv azon része, amelyet a meghajtó hív (a `QuestionUi` / `usePlayQuestion` megfelel neki). */
export type AsteroidQuestionUi = {
  frame(clockMs: number, ctx?: { calm?: boolean; tick?: boolean; hold?: boolean }): void;
  timeScale(): number;
  finished(): boolean;
  finish(): unknown;
};

export type AsteroidDriver = {
  loop: FixedLoop;
  feel: Feel;
  /** A mini-Director: a világ jelzi a sérülést / közeli veszélyt, a kérdés-ütemező a nyugodt pillanatot részesíti előnyben. */
  pace: IntensityDirector;
  /**
   * Egy képkocka a valós `realDtMs` idővel. `paused`: szünet / „Miért?” — a kérdés-óra és a világ áll. Visszaadja az
   * interpolációs alphát.
   */
  frame(realDtMs: number, paused: boolean): number;
  /** A lassítatlan kérdés-óra (ms): szünetben áll, a `slowMo` nem lassítja (J0b 7. eltérés). */
  clockMs(): number;
};

export function createAsteroidDriver(opts: {
  seed: number | string;
  questions: AsteroidQuestionUi | null;
  /** A világ egy fix lépése (`SIM_STEP_MS`). */
  step: (dtMs: number) => void;
  /** Vége-e a menetnek (győzelem / vereség): ekkor új kérdés nem indul, a nyitott kérdés „aborted”. */
  over: () => boolean;
  reducedMotion?: boolean;
}): AsteroidDriver {
  const pace = createIntensityDirector();
  const loop = createFixedLoop((dtMs) => {
    opts.step(dtMs);
    pace.update(dtMs / 1000);
  });
  // A rázás zaja kozmetikai (KSZ-2: külön fxRng); a hitstop determinisztikus (a hurok tartása).
  const feel = createFeel({ reducedMotion: opts.reducedMotion ?? false, loop, fxRng: createRng(seedFrom(ASTEROID_GAME_ID, opts.seed, "fx")).next });
  let clock = 0;
  let real = 0;
  return {
    loop,
    feel,
    pace,
    frame(realDtMs, paused) {
      const dt = Number.isFinite(realDtMs) && realDtMs > 0 ? realDtMs : 0;
      real += dt;
      if (!paused) clock += dt;
      feel.update(paused ? 0 : dt);
      const q = opts.questions;
      if (q && opts.over() && !q.finished()) q.finish();
      if (q && !paused) q.frame(clock, { calm: pace.calm() });
      loop.setTimeScale(paused ? 0 : q ? q.timeScale() : 1);
      return loop.frame(real);
    },
    clockMs: () => clock,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A játékmenet szabály-modellje (node-szimuláció)                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A hajó függőleges helye a modellben (a játékos sávja közepe) és a becsapódási vonal. */
const SHIP_Y = PLAYER_Y_MAX - 2;
const IMPACT_Y = SHIP_Y + 0.7;
/** A kristályzóna (a lap `crystalBounds`-ával megegyező alsó / felső perem a játéksíkon). */
const CRYSTAL_ZONE = { minY: 0.8, maxY: 6.0 };

export type WorldThreat = {
  id: number;
  kind: "rock" | "crystal" | "alien" | "fighter" | "boss";
  size: 1 | 2 | 3;
  hp: number;
  y: number;
  vy: number;
  /** a vadászgép / főellenfél következő lövéséig (mp) */
  fire: number;
};

export type WorldPhase = "play" | "won" | "lost";

export type WorldState = {
  phase: WorldPhase;
  wave: number;
  lives: number;
  invuln: number;
  shield: number;
  power: number;
  bombs: number;
  score: number;
  kills: number;
  combo: number;
  bestCombo: number;
  threats: readonly WorldThreat[];
  bossHp: number | null;
  /** Hány hullám-váltás történt (a folyamatos átmenet mérése). */
  waveChanges: number;
  /** Az élet-veszteségek száma. */
  hits: number;
  /** A rossz kristályokból hasadt apró sziklák száma. */
  shardsSpawned: number;
};

/** Egyenletes érték a [lo, hi) tartományban a [0, 1) dobásból. */
const range = (u: number, lo: number, hi: number): number => lo + u * (hi - lo);

/**
 * A kitérés küszöbei (ügyességi dobás; 1 felett a kitérés a `SIM_AVERAGE` játékosnál is többnyire sikerül): a hajóhoz érő
 * ellenfél / a vadászgép lövése / a főellenfél lövése elől. A bot-modell kalibrációja (20 seed, 2026-11-17): az átlagos
 * játékos menete ~3,4 perc, ~60% győzelem; a gyenge játékos veszít; az erős nyer — lásd `T/space-asteroid-sim.test.ts`.
 */
export const DODGE_IMPACT = 1.2;
export const DODGE_FIGHTER = 1.2;
export const DODGE_BOSS = 1.1;

export const BOSS_TOTAL_HP = 90;
const BOSS_PHASE_HP = [50, 25, 15] as const;
export const SIM_POWER_SEC = 10;
export const SIM_SHIELD_SEC = 8;
export const START_LIVES = 3;
export const MAX_LIVES = 9;

export type WorldInput = {
  /** A kitérés ügyességi dobása erre a lépésre (`u / skill`; siker, ha < könnyítés). */
  dodgeRoll: number;
};

export type AsteroidWorld = {
  step(dtMs: number, input: WorldInput): void;
  state(): WorldState;
  /** Bot-lövés: a legközelebbi ellenfél sérül (a találat esélyét a hívó dönti). Visszaadja az eredményt: nem volt célpont / talált / le is lőtte. */
  shoot(hits?: number): "none" | "hit" | "kill";
  /** Jó válasz: fejlesztés az intenzitás szerint (alacsony: pajzs, közepes: hármas lövés, magas: bomba). */
  upgrade(intensity: number): "shield" | "triple" | "bomb";
  /** Rossz válasz: a kristály helyén 3 apró szikla hasad. */
  shatter(at: { x: number; y: number }): void;
  /** Bomba: minden ellenfél megsemmisül (főellenfél: −12 HP). */
  detonate(): boolean;
  /** A bemutatott kérdés kristályai (a lap-béli kristálymodul tiszta használata). */
  crystalsFor(p: { id: number; options: ReadonlyArray<{ label: string; correct: boolean }> }): Crystal[];
  /** Teljes állapot-ujjlenyomat (arany visszajátszáshoz). */
  digest(): string;
  /** A hullám-forgatókönyv lépésszáma (a determinizmus-próbához). */
  steps(): number;
  /** A hullám-váltás kérése nélkül: a főellenfél hulláma azonnal (mérés / forceState). */
  skipToBoss(): void;
};

export function createAsteroidWorld(opts: { seed: number | string; band: () => number; signal: (kind: "damage" | "nearThreat", dtSec?: number) => void }): AsteroidWorld {
  const rng = createRng(seedFrom(ASTEROID_GAME_ID, opts.seed, "world"));
  const crystalRng = createRng(seedFrom(ASTEROID_GAME_ID, opts.seed, "crystals"));
  let nextId = 1;
  let wave = 1;
  let spawned = 0;
  let lastSpawn = 0;
  let clock = 0;
  let steps = 0;
  let phase: WorldPhase = "play";
  let lives = START_LIVES;
  let invuln = HIT_INVULN_SEC * 0.5;
  let shield = 0;
  let power = 0;
  let bombs = 0;
  let score = 0;
  let kills = 0;
  let combo = 0;
  let bestCombo = 0;
  let waveChanges = 0;
  let hits = 0;
  let shardsSpawned = 0;
  let threats: WorldThreat[] = [];
  let bossSpawned = false;
  let bossHp: number | null = null;
  let bossFire = 1.5;

  const bossStage = (hp: number): 0 | 1 | 2 => (hp > BOSS_TOTAL_HP - BOSS_PHASE_HP[0] ? 0 : hp > BOSS_TOTAL_HP - BOSS_PHASE_HP[0] - BOSS_PHASE_HP[1] ? 1 : 2);

  const spawnThreat = (): void => {
    spawned += 1;
    if (wave >= BOSS_WAVE) {
      bossSpawned = true;
      bossHp = BOSS_TOTAL_HP;
      threats.push({ id: nextId++, kind: "boss", size: 3, hp: BOSS_TOTAL_HP, y: GAME_H / 2 - 3.5, vy: 0, fire: 1.5 });
      return;
    }
    const kind = pickEnemyKind(wave, rng.next());
    const size = kind === "rock" ? pickRockSize(rng.next()) : 3;
    const baseVy = waveBaseVy(wave);
    const vy = kind === "alien" ? -0.55 : kind === "fighter" ? -0.85 : baseVy + range(rng.next(), -0.4, 0) - (3 - size) * 0.25;
    threats.push({ id: nextId++, kind, size, hp: enemyHp(kind, size), y: range(rng.next(), SPAWN_Y_MIN, SPAWN_Y_MAX), vy, fire: kind === "fighter" ? range(rng.next(), 1.0, 2.0) : 0 });
  };

  const addScore = (t: WorldThreat): void => {
    combo += 1;
    if (combo > bestCombo) bestCombo = combo;
    kills += 1;
    const base = t.kind === "rock" ? 25 * t.size : t.kind === "crystal" ? 60 : t.kind === "alien" ? 80 : t.kind === "fighter" ? 120 : 60;
    score += base + Math.min(20, combo * 4);
  };

  /** Egy találat: a rock hasad (mint a lapon), a többi elpusztul. */
  const damage = (t: WorldThreat, amount: number): void => {
    t.hp -= amount;
    if (t.kind === "boss") bossHp = Math.max(0, t.hp);
    if (t.hp > 0) return;
    threats = threats.filter((x) => x !== t);
    addScore(t);
    if (t.kind === "boss") {
      phase = "won";
      return;
    }
    if (t.kind === "rock" && t.size > 1) {
      const size = (t.size - 1) as 1 | 2;
      for (let k = 0; k < 2; k++) {
        threats.push({ id: nextId++, kind: "rock", size, hp: enemyHp("rock", size), y: t.y, vy: Math.max(-2.8, t.vy + range(rng.next(), -0.5, 0.5)), fire: 0 });
      }
    }
  };

  const loseLife = (): void => {
    if (invuln > 0 || shield > 0) return;
    hits += 1;
    lives -= 1;
    combo = 0;
    invuln = HIT_INVULN_SEC;
    opts.signal("damage");
    if (lives <= 0) phase = "lost";
  };

  return {
    step(dtMs, input) {
      if (phase !== "play") return;
      const dt = dtMs / 1000;
      steps += 1;
      clock += dt;
      if (invuln > 0) invuln -= dt;
      if (shield > 0) shield = Math.max(0, shield - dt);
      if (power > 0) power = Math.max(0, power - dt);

      // Érkezés: a hullám ellenfelei az `waveSpawnInterval` szerint (a főellenfél: egyetlen).
      const want = waveEnemyCount(wave);
      if (spawned < want && (threats.length === 0 || clock >= lastSpawn + waveSpawnInterval(wave, opts.band()))) {
        spawnThreat();
        lastSpawn = clock;
      }

      let near = false;
      for (const t of threats.slice()) {
        if (t.kind === "boss") {
          const stage = bossStage(bossHp ?? 0);
          bossFire -= dt;
          if (bossFire <= 0) {
            bossFire = stage === 0 ? 2.5 : stage === 1 ? 1.5 : 1.0;
            // A lövés előjelzett és kitérhető: siker, ha a dobás elég jó (a boss-lövés nehezebben kerülhető).
            if (input.dodgeRoll >= DODGE_BOSS) loseLife();
          }
          continue;
        }
        t.y += t.vy * dt;
        if (t.kind === "fighter") {
          t.fire -= dt;
          if (t.fire <= 0 && t.y > SHIP_Y + 4) {
            t.fire = range(rng.next(), 1.4, 2.2);
            if (input.dodgeRoll >= DODGE_FIGHTER) loseLife();
          }
        }
        if (t.y < SHIP_Y + 4.5) near = true;
        if (t.y <= IMPACT_Y) {
          // A hajóhoz érő ellenfél: kitérés (az ügyesség dobása) vagy ütközés.
          threats = threats.filter((x) => x !== t);
          // (kitért: az ellenfél a hajó mellett elhalad, nem ér pontot)
          if (input.dodgeRoll >= DODGE_IMPACT) loseLife();
        }
      }
      if (near) opts.signal("nearThreat", dt);

      // Hullám vége: minden érkezett és nincs ellenfél → a következő hullám azonnal (nincs kapu).
      if (spawned >= want && threats.length === 0 && phase === "play") {
        if (wave >= BOSS_WAVE) {
          if (bossSpawned) phase = "won";
        } else {
          wave += 1;
          waveChanges += 1;
          spawned = 0;
          lastSpawn = clock;
          score += 50;
        }
      }
    },
    state: () => ({
      phase, wave, lives, invuln, shield, power, bombs, score, kills, combo, bestCombo, threats, bossHp, waveChanges, hits, shardsSpawned,
    }),
    shoot(hitsPerShot = 1) {
      // A legközelebbi (legalacsonyabb) ellenfél; a főellenfél csak ha nincs más.
      let target: WorldThreat | null = null;
      for (const t of threats) {
        if (t.kind === "boss") continue;
        if (!target || t.y < target.y) target = t;
      }
      if (!target) target = threats.find((t) => t.kind === "boss") ?? null;
      if (!target) return "none";
      const amount = power > 0 ? hitsPerShot * 2 : hitsPerShot;
      damage(target, amount);
      return threats.includes(target) ? "hit" : "kill";
    },
    upgrade(intensity) {
      const kind = intensity < 0.34 ? "shield" : intensity < 0.67 ? "triple" : "bomb";
      if (kind === "shield") shield = Math.min(20, shield + SIM_SHIELD_SEC);
      else if (kind === "triple") power = SIM_POWER_SEC;
      else bombs = Math.min(5, bombs + 1);
      return kind;
    },
    shatter(at) {
      for (const s of crystalShards(at, crystalRng.next)) {
        shardsSpawned += 1;
        threats.push({ id: nextId++, kind: "rock", size: 1, hp: 1, y: Math.min(at.y, GAME_H / 2), vy: s.vy, fire: 0 });
      }
    },
    detonate() {
      if (bombs <= 0 || phase !== "play") return false;
      bombs -= 1;
      const before = combo;
      let killed = false;
      for (const t of threats.slice()) {
        if (t.kind === "boss") damage(t, 12);
        else {
          threats = threats.filter((x) => x !== t);
          addScore(t);
          killed = true;
        }
      }
      if (killed) combo = before + 1;
      return true;
    },
    crystalsFor(p) {
      return spawnCrystals(p, crystalBounds({ halfWidth: 8.9, ...CRYSTAL_ZONE }), crystalRng.next);
    },
    digest: () =>
      JSON.stringify({ phase, wave, lives, score, kills, bossHp, hits, steps, threats: threats.map((t) => [t.kind, t.size, t.hp, Math.round(t.y * 1000)]) }),
    steps: () => steps,
    skipToBoss() {
      wave = BOSS_WAVE;
      spawned = 0;
      threats = [];
      lastSpawn = clock;
    },
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A szimuláció kérdésforrása és a SimGame                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

type SimQuestion = { id: number; correctOption: number; windowMs: number; optionCount: number };

/** Seedelt, évfolyamtól független bank a sim-hez (≥ 300 különböző tétel): az ütemezést és az ismétlést méri. */
function simProvider(seed: number): QuestionProvider {
  const rng = createRng(seedFrom(ASTEROID_GAME_ID, seed, "simbank"));
  return {
    couponOnly: false,
    material: () => null,
    fresh: () => {
      const a = 3 + rng.int(12);
      const b = 3 + rng.int(12);
      const answer = a * b;
      const options = [answer, answer + 1 + rng.int(3), answer - 1 - rng.int(3), answer + 10];
      return bankPlayQuestion(ASTEROID_GAME_ID, {
        id: "",
        prompt: `Mennyi ${a} × ${b}?`,
        options: options.map(String),
        correctIndex: 0,
        explanation: `${a} × ${b} = ${answer}.`,
      });
    },
    restore: (item) => restoreReviewQuestion(item, {}),
  };
}

/** A bot lövési üteme (a lap tüzelési ideje: `BULLET_COOLDOWN` 0,18 s) és találati könnyítése (ügyességi dobás; a valós ügyesség nem mérhető: UNVERIFIED). */
export const BOT_SHOT_MS = 180;
/** Új célpontra állás ideje lelövés után (ms). */
export const BOT_AIM_MS = 300;
export const BOT_HIT_EASE = 1.0;
/** A főellenfélre a bot nagyobb célpontot talál (a boss sugara 2,0). */
export const BOT_BOSS_EASE = 1.2;

export type AsteroidSim = {
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
  world: AsteroidWorld;
};

export function createSimGame(opts: { seed: number; grade: number; questions: boolean }): AsteroidSim {
  const director = createQuestionDirector({
    config: asteroidDirectorConfig(opts.grade),
    provider: simProvider(opts.seed),
    review: createReviewQueue(null),
    rng: createRng(seedFrom(ASTEROID_GAME_ID, opts.seed, "q")),
    startBand: 0.4,
    now: () => 0,
  });
  let driver: AsteroidDriver | null = null;
  let crystals: Crystal[] = [];
  let currentInput = { dodgeRoll: 0 };
  const world = createAsteroidWorld({
    seed: opts.seed,
    band: () => (opts.questions ? director.band() : 0.4),
    signal: (kind, dt) => driver?.pace.signal(kind, dt),
  });
  const ui = createQuestionUi({
    director: () => (opts.questions ? director : null),
    onView: () => {},
    onShow: (p) => {
      crystals = world.crystalsFor(p);
    },
    onOutcome: (o, p) => {
      if (o.result === "aborted") return;
      if (o.result === "correct") {
        world.upgrade(director.intensity());
        crystals = [];
        return;
      }
      // rossz / lejárt: a kiválasztott kristály hasad (lejáratnál a helyes marad, nem hasad semmi)
      if (o.result === "wrong") {
        const picked = p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
        const hit = picked >= 0 ? hitCrystal(crystals, crystals[picked]?.id ?? -1) : null;
        if (hit) world.shatter({ x: hit.crystal.x, y: hit.crystal.y });
      }
      driver?.pace.signal("wrong");
    },
  });
  driver = createAsteroidDriver({
    seed: opts.seed,
    questions: opts.questions ? ui : null,
    step: (dtMs) => {
      stepCrystals(crystals, dtMs / 1000);
      world.step(dtMs, currentInput);
    },
    over: () => world.state().phase !== "play",
  });
  const d = driver;
  let shotAcc = 0;
  let aimMs = 0;

  return {
    world,
    step(dtMs, input) {
      if (world.state().phase !== "play") {
        if (!ui.finished()) ui.finish();
        return;
      }
      currentInput = { dodgeRoll: input.skillRoll };
      d.frame(dtMs, false);
      // A bot lövése (valós időben, a lap tüzelési ütemén): talál, ha az ügyességi dobás elég jó.
      shotAcc += dtMs;
      if (shotAcc >= BOT_SHOT_MS) {
        shotAcc -= BOT_SHOT_MS;
        const st = world.state();
        const bossTarget = st.threats.length > 0 && st.threats.every((t) => t.kind === "boss");
        if (aimMs > 0) aimMs -= BOT_SHOT_MS;
        else if (input.skillRoll < (bossTarget ? BOT_BOSS_EASE : BOT_HIT_EASE)) {
          // Lelövés után a bot új célpontra áll (a hajó mozgatása / célzás): ennyi ideig nem lő.
          if (world.shoot() === "kill") aimMs = BOT_AIM_MS;
        }
        // A bomba a bot szerint akkor kell, ha sok ellenfél van a pályán.
        if (st.bombs > 0 && st.threats.length >= 8) world.detonate();
      }
      if (world.state().phase !== "play" && !ui.finished()) ui.finish();
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal) return null;
      return { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length };
    },
    answer(id, option) {
      const p = ui.active();
      if (!p || p.id !== id) return;
      // A kristály kilövése: a rossz kristály helye a hasadáshoz kell (az `onOutcome` a kristályt a találat sorrendjében keresi).
      ui.pick(option, d.clockMs());
    },
    done: () => world.state().phase !== "play",
    won: () => world.state().phase === "won",
    stats: () => director.stats(d.clockMs()),
    simTimeMs: () => d.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
  };
}

export { SIM_STEP_MS };
