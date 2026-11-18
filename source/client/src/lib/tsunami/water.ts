/**
 * Szökőár szökés — az emelkedő víz tiszta, seedelt magja (terv: docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md, tulajdonosi
 * döntés D1 2026-11-18: „Vissza a régi, emelkedő vízhez”). A régi (`b4b84db6`) lap hurok-logikája kiemelve, a közös rétegekhez
 * igazítva: a víz alulról emelkedik (12 % → 88 % = utolért), a figura egy tengelyen (balra–jobbra) mozog, a zöld biztonsági zónában
 * lassabban emelkedik a víz, a sodrás oldalra tol, Sprint gyorsít. A kérdés NEM állítja meg a világot (a J1 kifogása): nyitott kérdés
 * alatt a víz lassítva emelkedik (`slowMo`). D4: jó válasz → a víz látványosan visszahúzódik (`waterDrop` esemény, permet); rossz /
 * lejárt → egy ugrással feljebb jön (`waterSurge`, rázás, morajlás). Győzelem: N jó válasz → a figura a menedékbe ér (`won`).
 *
 * Nincs benne React, DOM, three.js, hang, `Math.random`, `Date.now` (a determinizmus-őr hatóköre): a zóna új helye a menet RNG-jéből.
 */
import { extraTimeFrom } from "./pacing";
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { createIntensityDirector, type IntensityDirector } from "@/game-engine/play/director";
import { createFeel, type Feel } from "@/game-engine/play/feel";
import { createFixedLoop, SIM_STEP_MS, type FixedLoop } from "@/game-engine/play/loop";
import type { DirectorConfig } from "@/game-engine/play/questionDirector";
import { fitsAllViewports } from "@/game-engine/play/promptFit";
import type { QuestionOutcome, QuestionPresentation, QuestionResult } from "@/game-engine/play/types";

export const TSUNAMI_GAME_ID = "tsunami-english";
/** A kérdés alatti lassítás (a víz emelkedése és a mozgás ennyiszeres sebességgel fut — nem áll meg). */
export const TSUNAMI_SLOW_MO = 0.6;
/** Élesítés: a kérdés megjelenése utáni ennyi ms-ban (a kérdés-órával) az érintés nem válasz. */
export const ANSWER_ARM_MS = 400;
export const WATER_START = 12;
/** Ennél a szintnél a víz utoléri a figurát (vereség). */
export const WATER_LOSE = 88;
/** Jó válasz után a víz ennél lejjebb nem megy. */
export const WATER_MIN = 5;
/** A biztonsági zóna fél szélessége (% — a régi lap ±9 %-a). */
export const ZONE_HALF = 9;

export type TsunamiDifficulty = "easy" | "normal" | "hard";

export type WaterTuning = {
  /** Alap emelkedés (%/s). */
  risePerSec: number;
  /** Jó válasz: ennyivel húzódik vissza a víz (%). */
  push: number;
  /** Rossz / lejárt válasz: ennyivel ugrik feljebb (%). */
  wrongPenalty: number;
  /** Ennyi jó válasz = a menedék (győzelem). */
  winCorrect: number;
  /** A zóna ennyi mp-enként ugrik új helyre. */
  zoneEverySec: number;
};

/**
 * A régi lap (`b4b84db6`) számaiból: PRESETS, QUIZ_WRONG_WATER_PENALTY, WIN_QUIZ_COUNT, a zóna-időzítés — a nem blokkoló kérdéshez
 * hangolva (a régiben a kvíz MEGÁLLÍTOTTA a vizet; most a kérdés alatt is lassítva emelkedik). Mérve (20 seed, 600 mp-es keret,
 * 2026-11-18): a régi számokkal a menet medián 1,7 perc (a J9 2–5 perc), a 3–4. évfolyam nehéz szinten 9/20 győzelem; ezekkel
 * átlagos játékos közepesen 18/20, 2,25 perc; 3–4. évfolyam nehéz szinten 15/20.
 */
export const WATER_TUNING: Record<TsunamiDifficulty, WaterTuning> = {
  easy: { risePerSec: 1.25, push: 25, wrongPenalty: 4, winCorrect: 8, zoneEverySec: 7.6 },
  normal: { risePerSec: 1.6, push: 23, wrongPenalty: 6, winCorrect: 10, zoneEverySec: 6.3 },
  hard: { risePerSec: 2.0, push: 22, wrongPenalty: 8, winCorrect: 12, zoneEverySec: 5.2 },
};

export type WaterPhase = "run" | "won" | "lost";

export type WaterState = {
  phase: WaterPhase;
  timeMs: number;
  /** Vízszint (%, 0 = a kép alja, `WATER_LOSE` = utolért). */
  water: number;
  /** Az előző fix lépés vízszintje (a nézet interpolációjához). */
  prevWater: number;
  /** A figura vízszintes helye (%, 8..92). */
  x: number;
  prevX: number;
  /** A biztonsági zóna közepe (%). */
  zoneX: number;
  inZone: boolean;
  /** A sodrás pillanatnyi ereje (%/s, előjeles). */
  drift: number;
  correct: number;
  wrong: number;
  target: number;
};

export type WaterEventType = "waterDrop" | "waterSurge" | "zoneMove" | "won" | "lost";
export type WaterEvent = { type: WaterEventType; amount: number; at: number };

export type WaterInput = { move: number; sprint: boolean };

export type WaterCore = {
  state(): Readonly<WaterState>;
  tuning(): Readonly<WaterTuning>;
  input: WaterInput;
  step(dtMs: number): void;
  /** A kérdés kimenete → a víz (D4). */
  applyOutcome(result: QuestionResult): void;
  running(): boolean;
  forceEnd(won: boolean): void;
  drainEvents(cb: (e: WaterEvent) => void): void;
};

const EVENT_CAP = 32;

export function createWaterCore(opts: { seed: number | string; difficulty: TsunamiDifficulty; pace?: number }): WaterCore {
  const tuning = WATER_TUNING[opts.difficulty];
  const pace = Number.isFinite(opts.pace) && (opts.pace as number) > 0 ? (opts.pace as number) : 1;
  const rng: Rng = createRng(seedFrom(TSUNAMI_GAME_ID, opts.seed, "water"));
  const st: WaterState = {
    phase: "run",
    timeMs: 0,
    water: WATER_START,
    prevWater: WATER_START,
    x: 50,
    prevX: 50,
    zoneX: 50,
    inZone: true,
    drift: 0,
    correct: 0,
    wrong: 0,
    target: tuning.winCorrect,
  };
  const input: WaterInput = { move: 0, sprint: false };
  const events: WaterEvent[] = [];
  let zoneTimer = 0;
  const emit = (type: WaterEventType, amount = 0) => {
    if (events.length < EVENT_CAP) events.push({ type, amount, at: st.timeMs });
  };
  const end = (won: boolean) => {
    if (st.phase !== "run") return;
    st.phase = won ? "won" : "lost";
    emit(won ? "won" : "lost");
  };
  const stress = () => Math.pow(Math.min(1, st.correct / Math.max(1, st.target)), 1.42);

  return {
    state: () => st,
    tuning: () => tuning,
    input,
    step(dtMs) {
      st.prevWater = st.water;
      st.prevX = st.x;
      if (st.phase !== "run") return;
      const dt = dtMs / 1000;
      st.timeMs += dtMs;
      const s = stress();
      st.drift = Math.sin(st.timeMs * 0.0017) * (4 + s * 18);
      st.inZone = Math.abs(st.x - st.zoneX) <= ZONE_HALF;
      const zoneFactor = st.inZone ? 0.74 : 1.04;
      st.water += tuning.risePerSec * (0.62 + s * 1.18) * zoneFactor * pace * dt;
      if (st.water >= WATER_LOSE) {
        st.water = WATER_LOSE;
        end(false);
        return;
      }
      const move = Math.max(-1, Math.min(1, Number.isFinite(input.move) ? input.move : 0));
      st.x = Math.max(8, Math.min(92, st.x + 38 * (input.sprint ? 1.5 : 1) * move * dt + st.drift * dt));
      zoneTimer += dt;
      if (zoneTimer >= tuning.zoneEverySec) {
        zoneTimer = 0;
        st.zoneX = 16 + rng.next() * 68;
        emit("zoneMove", st.zoneX);
      }
    },
    applyOutcome(result) {
      if (st.phase !== "run" || result === "aborted") return;
      if (result === "correct") {
        const before = st.water;
        st.water = Math.max(WATER_MIN, st.water - tuning.push);
        st.correct += 1;
        emit("waterDrop", before - st.water);
        if (st.correct >= st.target) end(true);
      } else {
        const before = st.water;
        st.water = Math.min(WATER_LOSE, st.water + tuning.wrongPenalty);
        st.wrong += 1;
        emit("waterSurge", st.water - before);
        if (st.water >= WATER_LOSE) end(false);
      }
    },
    running: () => st.phase === "run",
    forceEnd: (won) => end(won),
    drainEvents(cb) {
      const list = events.splice(0, events.length);
      for (const e of list) cb(e);
    },
  };
}

/** A kérdés-ütemező beállítása: 4 opció (a régi játék A–D-je), a víz tempójához igazított rés (≥ 5 kérdés / perc). */
export function tsunamiDirectorConfig(grade: number | null): DirectorConfig {
  const baseWindowMs = 6000;
  return {
    gameId: TSUNAMI_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 11000,
    targetPerMin: 5,
    baseWindowMs,
    slowMo: TSUNAMI_SLOW_MO,
    grade,
    readingAware: true,
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs }).ok,
  };
}

export type TsunamiQuestionUi = {
  frame(clockMs: number, ctx: { calm: boolean; tick?: boolean; hold?: boolean }): void;
  timeScale(): number;
  finished(): boolean;
  finish(): unknown;
  pick(optionIndex: number, clockMs?: number): QuestionOutcome | null;
  active(): QuestionPresentation | null;
};

export type TsunamiDriver = {
  core: WaterCore;
  loop: FixedLoop;
  feel: Feel;
  pace: IntensityDirector;
  /** Egy képkocka: kérdés-óra (szünetben áll) → menetvégnél a kérdés lezárása → a kérdés-sáv → időskála → fix lépés → események. */
  frame(realDtMs: number, paused: boolean, onEvent?: (e: WaterEvent) => void): number;
  /** Érintés / billentyű egy válaszgombon (élesítés után). */
  tapOption(optionIndex: number): QuestionOutcome | null;
  /** A nyitott kérdés azonosítója, ha a válaszgombok már élesek (`tapOption` elfogadná); különben null. */
  armedPresentationId(): number | null;
  /** A kérdés-sáv kimenete → a víz (a lap / sim `onOutcome`-ja hívja). */
  onOutcome(o: QuestionOutcome, p: QuestionPresentation): void;
  /** A lassítatlan kérdés-óra (ms; szünetben áll). */
  clockMs(): number;
};

/** Rossz válasznál / ütközésnél a rázás erőssége (a közös `feel`, csökkentett mozgásnál 0). */
const SURGE_TRAUMA = 0.45;

export function createTsunamiDriver(opts: {
  seed: number | string;
  difficulty: TsunamiDifficulty;
  pace?: number;
  questions: TsunamiQuestionUi | null;
  reducedMotion?: boolean;
}): TsunamiDriver {
  const core = createWaterCore({ seed: opts.seed, difficulty: opts.difficulty, pace: opts.pace });
  const pace = createIntensityDirector();
  let clock = 0;
  let real = 0;
  const q = opts.questions;
  const loop = createFixedLoop((dt) => {
    core.step(dt);
    const st = core.state();
    if (st.water > WATER_LOSE - 14) pace.signal("nearThreat", dt / 1000);
    pace.update(dt / 1000);
  });
  const feel = createFeel({ reducedMotion: opts.reducedMotion ?? false, loop, fxRng: createRng(seedFrom(TSUNAMI_GAME_ID, opts.seed, "fx")).next });
  const drain = (onEvent?: (e: WaterEvent) => void) => {
    core.drainEvents((e) => {
      if (e.type === "waterSurge") {
        feel.addTrauma(SURGE_TRAUMA);
        pace.signal("wrong");
      }
      onEvent?.(e);
    });
  };
  return {
    core,
    loop,
    feel,
    pace,
    frame(realDtMs, paused, onEvent) {
      const dt = Number.isFinite(realDtMs) && realDtMs > 0 ? realDtMs : 0;
      real += dt;
      if (!paused) clock += dt;
      feel.update(paused ? 0 : dt);
      if (q && !core.running() && !q.finished()) q.finish();
      if (q && !paused && core.running()) q.frame(clock, { calm: pace.calm() });
      // Olvasási többletidő (pacing.ts): a közös ablakon túl a víz áll, amíg a kérdés nyitva.
      const act = q && core.running() ? q.active() : null;
      const extraFrom = extraTimeFrom(act);
      const inExtra = extraFrom !== null && clock >= extraFrom;
      loop.setTimeScale(paused || inExtra ? 0 : q ? q.timeScale() : 1);
      const alpha = loop.frame(real);
      drain(onEvent);
      return alpha;
    },
    armedPresentationId() {
      if (!q || !core.running()) return null;
      const act = q.active();
      if (!act) return null;
      return clock - act.startedAtSimMs >= ANSWER_ARM_MS ? act.id : null;
    },
    tapOption(optionIndex) {
      if (!q || !core.running()) return null;
      const act = q.active();
      if (!act) return null;
      // Élesítés: a megjelenés utáni első 400 ms érintése nem válasz; a lap a gombokat ugyanezzel a feltétellel mutatja.
      if (clock - act.startedAtSimMs < ANSWER_ARM_MS) return null;
      return q.pick(optionIndex, clock);
    },
    onOutcome(o) {
      core.applyOutcome(o.result as QuestionResult);
    },
    clockMs: () => clock,
  };
}

export { SIM_STEP_MS };
