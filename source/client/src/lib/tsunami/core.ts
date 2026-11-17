/**
 * J1a — „Hegyre fel!”: a Szökőár szökés háromsávos menekülő-futásának tiszta magja (végrehajtás J1a 2., D-J1a-1…7; terv
 * 5.1 Q1, 4.1/2–4; K.5 KSZ-1, KSZ-2, KSZ-4–6, KSZ-11, KSZ-12, KSZ-15).
 *
 * TISZTA TS: nincs DOM, three, React, hang, `Math.random`, `Date.now` (őr: `T/game-sim-determinism-guard.test.ts`). A nézet
 * (`GE/scenes/TsunamiScene3D.tsx`, a lap DOM-táblái) csak olvassa az állapotot és a kibocsátott eseményeket; a hang, a rezgés,
 * a rázás és a hitstop az eseményekből dolgozik.
 *
 * JÁTÉK (terv 5.1):
 *  - A figura egy hegyi úton fut három sávban; mögötte a hullám (`waveGap` méter). Akadály: uszadékfa és kerítés (átugorható),
 *    felborult kocsi (csak sávváltással kerülhető). Ütközés: 0,8 mp botlás (lassul), a hullám 6 m-rel közelebb.
 *  - Kagyló: pont; egy teljes kagylósor 0,8 mp-es mini-turbó (D-J1a-5).
 *  - Kapukérdés (Q1): a kérdés megjelenésekor a három sávban három kapu kerül a pályára (`placeGate`), olyan messze, hogy a
 *    lassított futás a válaszablak vége előtt 300 ms-mal érjen oda (D-J1a-3). A kapu ELŐTTI 4 mp és utána 6 m üres
 *    („kapu-pillanat”). Jó kapu: 1,5 mp turbó és a hullám 12 m-rel hátrébb; rossz kapu: 0,8 mp botlás.
 *  - Vég (J1a): a hullám utoléri a futót (`waveGap ≤ 0`; a mentőöv a J1b-ben). Győzelem: a pálya hossza (a nehézség szerint
 *    1200 / 1600 / 2000 m) — NEM a jó válaszok száma.
 *  - A rés dinamikája (D-J1a-4): lépésenként `waveGap += (v_futó − v_alap) · dt − tempó · dt`, tempó = alap × pálya-tempó ×
 *    (0,8 + 0,4 × intensity).
 *  - Tanító szakasz (D-J1a-6, K.4/25): az első 30 mp-ben az ütközés nem viszi a rést (nincs vereség), csak botlás.
 *
 * IDŐ: a `step(dtMs)` a VILÁG ideje — a lap és a node-szimuláció UGYANAZZAL a meghajtóval lépteti (`createTsunamiDriver`: fix
 * 1/60 s-os hurok, a kérdés alatti lassítás a hurok szorzója, hitstop) — C-52 / review #451 tanulsága.
 */
import { createRng, seedFrom } from "@shared/game-rng";
import { comboBreak, comboCorrect, createCombo, type ComboState } from "@/game-engine/play/combo";
import { createIntensityDirector, type IntensityDirector } from "@/game-engine/play/director";
import { createFeel, type Feel } from "@/game-engine/play/feel";
import { createFixedLoop, SIM_STEP_MS, type FixedLoop } from "@/game-engine/play/loop";
import type { DirectorConfig } from "@/game-engine/play/questionDirector";
import { estimateLines, fitsAllViewports } from "@/game-engine/play/promptFit";
import type { QuestionOutcome, QuestionPresentation, QuestionResult } from "@/game-engine/play/types";

import {
  OBSTACLE_SPECS,
  SHELL_ROW,
  TUTORIAL_SEC,
  clearRange,
  createTrackGen,
  createTrackPools,
  despawnBehind,
  fillTrack,
  type BlockedRange,
  type Lane,
  type Obstacle,
  type TrackGen,
  type TrackPools,
} from "./obstacles";

export const TSUNAMI_GAME_ID = "tsunami-english";

export type TsunamiDifficulty = "easy" | "normal" | "hard";

/** A kérdés alatti lassítás (végrehajtás J1a 5.: `slowMo: 0.6`; terv 4.1/3: ≥ 0,35×). */
export const TSUNAMI_SLOW_MO = 0.6;
/** A kapu a válaszablak vége előtt ennyivel érjen a futóhoz (D-J1a-3). */
export const GATE_LEAD_MS = 300;
/** A kapu előtti üres szakasz (mp, az alap sebességgel) és a kapu utáni üres méter (D-J1a-3). */
export const GATE_CLEAR_SEC = 4;
export const GATE_CLEAR_AFTER_M = 6;
export const TURBO_MS = 1500;
export const TURBO_FACTOR = 1.45;
export const MINI_TURBO_MS = 800;
export const MINI_TURBO_FACTOR = 1.3;
export const STUMBLE_MS = 800;
export const STUMBLE_FACTOR = 0.6;
export const COLLIDE_GAP_LOSS = 6;
export const GOOD_GATE_GAP_GAIN = 12;
/** A rés felső határa (m): ennél messzebb a hullám nem „bankolható” (a feszültség megmarad). */
export const GAP_MAX = 30;
/** A tanító szakaszban a rés ennél kisebb nem lehet (nincs vereség, D-J1a-6). */
export const TUTORIAL_GAP_FLOOR = 8;
/** Ugrás: teljes légi idő és csúcsmagasság (világ-mp, m). */
export const JUMP_AIR_SEC = 0.62;
export const JUMP_PEAK_M = 1.3;
const JUMP_V = (4 * JUMP_PEAK_M) / JUMP_AIR_SEC;
const GRAVITY = (8 * JUMP_PEAK_M) / (JUMP_AIR_SEC * JUMP_AIR_SEC);
/** Bemenet-puffer (KSZ-12): a földet érés előtt 120 ms-on belül kért ugrás a földet éréskor indul. */
export const JUMP_BUFFER_MS = 120;
/** Oldalirány: sávváltás (sáv/mp, a húzásé) és az analóg tárcsa legnagyobb sebessége (sáv/mp, D-J1a-1). */
export const LANE_SPEED = 8;
export const STEER_SPEED = 1.6;
/** A futó oldalirányú „ütköző-fele” (sávban mérve) — kisebb a látványnál (megbocsátó ütközés, KSZ-12). */
export const HIT_HALF_LANE = 0.42;
export const HIT_HALF_DEPTH = 0.35;
/** Ilyen közel (m) járó akadály a futó sávjában „közeli veszély” a mini-Directornak. */
export const NEAR_THREAT_M = 12;
/** Az első akadálysor helye (m) — 3 mp-nél (terv 5.1: „első akadály 3 mp-nél”). */
export const FIRST_ROW_SEC = 3;
export const EVENT_CAP = 48;
/** A tárcsa ennél nagyobb kitérése szándékos bemenet (D-J1a-13). */
export const STEER_INPUT_MIN = 0.2;
/** Kegyelmi rés (D-J1a-14): rossz / lejárt kapu után ennyi ideig a rés nem eshet `GRACE_GAP_M` alá. */
export const GRACE_MS = 1500;
export const GRACE_GAP_M = 2;
/** A kérdés megjelenése után ennyi ideig (kérdés-óra ms) az érintés / billentyű nem válasz (élesítés). */
export const ANSWER_ARM_MS = 400;

/**
 * Sáv ↔ opció leképezés (a mag és a lap közös szabálya, review #483 A1): 3 opció bal–közép–jobb; 2 opció a két szélső sáv
 * (középen nincs válasz); 1 opció középen. −1 = abban a sávban nincs válasz.
 */
export function optionForLane(lane: number, optionCount: number): number {
  if (optionCount >= 3) return lane;
  if (optionCount === 2) return lane === 0 ? 0 : lane === 2 ? 1 : -1;
  return lane === 1 ? 0 : -1;
}

export function laneForOption(option: number, optionCount: number): number {
  for (let l = 0; l < 3; l++) if (optionForLane(l, optionCount) === option) return l;
  return -1;
}

/**
 * D-J1a-17 (újra-review #483, ÚK2): a tétlen átfutás (D-J1a-13) a JÓ kapun történt-e. A kimenet alkalmazása ELŐTT kell
 * kérdezni (utána a kapu `idle` jelzése törlődik). A lap ezzel dönt a felirat között: „Jó kapu! …” vagy „Lejárt az idő”.
 */
export function idleCrossingWasGood(st: Readonly<Pick<TsunamiState, "gates" | "lane">>, correctOption: number): boolean {
  const g = st.gates;
  return !!g && g.idle && g.laneOptions[st.lane] === correctOption;
}

/** D-J1a-17: a jó kapun tétlenül átfutó gyerek állapotsora (a nyilvántartásban „nem válaszolt” marad). */
export const IDLE_GOOD_GATE_STATUS = "Jó kapu! Most nem választottál — ezt még megkérdezzük.";

/**
 * A kapu-tábla belső szélessége a legkeskenyebb (360 px-es) nézetben: 106 px tábla − 2 × 8 px belső margó − 2 × 3 px keret
 * (a lap `gateLayout`-ja és `.ts-gate` CSS-e szerint). D-J1a-11, review #483 M3.
 */
export const GATE_LABEL_MIN_WIDTH_PX = 84;
/** A tábla felirata legfeljebb ennyi sor (a CSS line-clamp-je). */
export const GATE_LABEL_MAX_LINES = 3;
export const GATE_LABEL_LONG_CHARS = 22;

/** Befér-e a válasz a kapu-táblába levágás nélkül (16 px, hosszú szövegnél 13 px; ≤ 3 sor) a megadott belső szélességen. */
export function gateLabelFits(label: string, innerWidthPx = GATE_LABEL_MIN_WIDTH_PX): boolean {
  const font = label.length > GATE_LABEL_LONG_CHARS ? 13 : 16;
  return estimateLines(label, innerWidthPx, font) <= GATE_LABEL_MAX_LINES;
}

/**
 * D-J1a-18: a kapu-tábla várható magassága (px) a felirat sorszámából és a tábla CSS-méreteiből (a lap `.ts-gate` szabályai:
 * keret 2 × 3 px, belső margó 6 + 7 px, szimbólum-kör 26 px, köz 3 px, sormagasság 1,15, min. 56 px). Nem a kirajzolt
 * táblából mérjük, hogy a tábla / lista mód döntése ne váltson oda-vissza.
 */
export function gateHeightPx(label: string, innerWidthPx = GATE_LABEL_MIN_WIDTH_PX): number {
  const font = label.length > GATE_LABEL_LONG_CHARS ? 13 : 16;
  // Óvatos becslés (8 px-szel keskenyebb doboz): a határesetű felirat inkább két sornak számít → inkább lista mód, mint takarás.
  const lines = Math.min(GATE_LABEL_MAX_LINES, Math.max(1, estimateLines(label, innerWidthPx - 8, font)));
  // + 4 px: a felirat 2 + 2 px-es függőleges belső ráhagyása (D-J1a-19, ékezet / alsó szár csonkolása ellen).
  return Math.max(56, 6 + 13 + 26 + 3 + 4 + Math.ceil(lines * font * 1.15));
}

/**
 * D-J1a-18: elférnek-e a táblák függőlegesen a kérdés-kártya alja és a futó vetített feje között (px, a játéktér
 * tetejétől). A táblák teteje a kártya alatt 10 px-re (de legalább a játéktér 18%-ánál — a lap elrendezésével egyezően),
 * az aljuk legalább 8 px-re a fej fölött. Ha nem férnek: lista mód (ugyanúgy, mint a szélességnél).
 */
export function gatesFitVertically(opts: { labels: readonly string[]; innerWidthPx: number; cardBottomPx: number; runnerHeadPx: number; stageHeightPx: number }): boolean {
  if (opts.labels.length === 0) return true;
  const top = Math.max(opts.stageHeightPx * 0.18, opts.cardBottomPx + 10);
  const h = Math.max(...opts.labels.map((l) => gateHeightPx(l, opts.innerWidthPx)));
  return top + h <= opts.runnerHeadPx - 8;
}

export type TsunamiTuning = {
  /** Alap futósebesség (m/s). */
  speed: number;
  /** A pálya hossza (m) — a győzelem feltétele. */
  levelDistance: number;
  /** A hullám alap közeledési tempója (m/s). */
  waveBase: number;
  /** A pálya tempó-szorzója (`tsunamiWaterPace(band)`; pálya nélkül 1). */
  wavePace: number;
  /** A hullám kezdeti távolsága (m). */
  startGap: number;
  /** A rés felső határa (m). */
  gapMax: number;
};

/** A meglévő nehézségi preset (terv 5.1 „Marad”) új értelmezése: táv a régi 6 / 8 / 10 jó válasz helyett. */
export const TSUNAMI_TUNING: Record<TsunamiDifficulty, Omit<TsunamiTuning, "wavePace">> = {
  easy: { speed: 8.5, levelDistance: 1200, waveBase: 0.09, startGap: 30, gapMax: 32 },
  normal: { speed: 9.5, levelDistance: 1600, waveBase: 0.12, startGap: 30, gapMax: GAP_MAX },
  hard: { speed: 10.5, levelDistance: 2000, waveBase: 0.15, startGap: 28, gapMax: 28 },
};

export function tuningFor(difficulty: TsunamiDifficulty, wavePace = 1): TsunamiTuning {
  return { ...TSUNAMI_TUNING[difficulty], wavePace: Number.isFinite(wavePace) && wavePace > 0 ? wavePace : 1 };
}

/**
 * A kérdés-ütemező beállítása (végrehajtás J1a 5.): 3 opció (sávonként egy kapu), 1,5–15 mp rés (terv 6.2: ≤ 15 mp kérdés
 * nélkül), 5 kérdés/perc cél, 4,5 mp alap ablak (3–4. évfolyamon ×1,25 a `windowMsFor`-ban), lassítás 0,6×.
 */
export function tsunamiDirectorConfig(grade: number | null): DirectorConfig {
  const baseWindowMs = 4500;
  return {
    gameId: TSUNAMI_GAME_ID,
    optionCount: 3,
    minGapMs: 1500,
    maxGapMs: 15000,
    targetPerMin: 5,
    baseWindowMs,
    slowMo: TSUNAMI_SLOW_MO,
    grade,
    // J0c-b (#450): az ablak a gyerek becsült olvasási idejéhez igazodik (≤ 9 mp), és a forrás előbb a sávba beférő tételt adja.
    readingAware: true,
    // D-J1a-11 (review #483, M3): a sávba ÉS a kapu-táblába (valódi, legkeskenyebb szélesség) is beférő tétel előbb.
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs }).ok && quiz.options.every((o) => gateLabelFits(o)),
  };
}

export type TsunamiPhase = "run" | "won" | "lost";

export type Gate = {
  presentationId: number;
  /** A kapu helye a pályán (m). */
  atDistance: number;
  /** Sávonként a `presentation.options` indexe (−1: abban a sávban nincs válasz). */
  laneOptions: [number, number, number];
  /** Eldőlt-e már (érintés / billentyű / lejárat): ilyenkor a futó csak átfut rajta. */
  resolved: boolean;
  /** Kimenet után: a helyes és a választott sáv (−1, ha nincs). */
  correctLane: number;
  pickedLane: number;
  /** A szándékos-bemenet számláló a kapu lerakásakor (D-J1a-13). */
  inputSeqAtPlace: number;
  /** Tétlen átfutással dőlt el (a játékbeli hatás már megtörtént). */
  idle: boolean;
};

export type TsunamiInput = {
  /** Sávváltás (húzás / nyíl): a következő lépés elfogyasztja. */
  laneDelta: number;
  /** Ugrás-kérés (élre): a következő lépés elfogyasztja. */
  jump: boolean;
  /** Analóg oldalirány (tárcsa / A–D), −1…1; 0 = sávsegéd. */
  steer: number;
};

export type TsunamiState = {
  phase: TsunamiPhase;
  /** A futó sávja (a folytonos `x` legközelebbi sávja). */
  lane: Lane;
  /** Oldalirányú hely sávban: −1 (bal) … 1 (jobb). */
  x: number;
  targetLane: Lane;
  /** Ugrás magassága (m) és függőleges sebessége. */
  y: number;
  vy: number;
  distance: number;
  /** Az előző lépés távolsága, oldalhelye és magassága (a nézet interpolál: K.4/9). */
  prevDistance: number;
  prevX: number;
  prevY: number;
  /** A futó pillanatnyi sebessége (m/s). */
  speed: number;
  waveGap: number;
  obstacles: Obstacle[];
  shells: TrackPools["shells"];
  gates: Gate | null;
  shellCount: number;
  /** Szakasz (tengerpart → falu → erdő → hegyoldal), 0…3. */
  stage: 0 | 1 | 2 | 3;
  stumbleMs: number;
  shieldMs: number;
  turboMs: number;
  miniTurboMs: number;
  /** A menet világideje (ms). */
  timeMs: number;
  combo: ComboState;
  score: number;
  gatesCorrect: number;
  gatesWrong: number;
  collisions: number;
  shellRows: number;
  jumps: number;
};

export type TsunamiEventType =
  | "collide"
  | "jump"
  | "land"
  | "shell"
  | "shellRow"
  | "laneChange"
  | "gatePlaced"
  | "gateCorrect"
  | "gateWrong"
  | "gatePassed"
  | "cleared"
  | "won"
  | "lost";

export type TsunamiEvent = { type: TsunamiEventType; lane: number; at: number; n: number; kind: string };

/** A futó lépésenkénti eredménye a meghajtónak: átlépett-e egy még el nem dőlt kaput. */
export type StepResult = { gateReached: boolean };

export type TsunamiCore = {
  state(): Readonly<TsunamiState>;
  tuning(): Readonly<TsunamiTuning>;
  input: TsunamiInput;
  step(dtMs: number, intensity: number): StepResult;
  /** A kapu lerakása a nyitott kérdéshez (D-J1a-3); a kapu-pillanat kitakarítása. */
  placeGate(p: Pick<QuestionPresentation, "id" | "windowMs" | "slowMo"> & { optionCount: number }): Gate;
  /** A kapu átlépésekor a futó sávjához tartozó opció (−1: nincs). */
  resolveGate(): { laneIndex: number; optionIndex: number };
  /** Érintés / billentyű: a futó a választott opció sávjába fut. */
  steerToOption(optionIndex: number): void;
  /** A kérdés kimenete a világban (≤ 2 s játékbeli következmény, K.4/23). */
  applyOutcome(o: Pick<QuestionOutcome, "id" | "result"> & { pickedOption: number | null; correctOption: number }): void;
  running(): boolean;
  /** Teszt-kampó / eredményképernyő: a menet lezárása kívülről. */
  forceEnd(won: boolean): void;
  drainEvents(cb: (e: TsunamiEvent) => void): void;
  /** Kérdés-pihenő kéréshez: van-e akadály a futó előtt `m` méteren belül a sávjában. */
  threatAhead(m: number): boolean;
  /** Szándékos bemenet (pl. koppintás a táblán) — D-J1a-13. */
  markInput(): void;
  /** Volt-e szándékos bemenet a nyitott kapu lerakása óta. */
  hadInputSinceGate(): boolean;
  /**
   * Tétlen átfutás (D-J1a-13): a kapu játékbeli hatása a sáv szerint (jó: turbó + 12 m; rossz: botlás, kegyelmi rés), a kombó
   * megszakad, pont nem jár; a kapu „tétlen” jelölést kap, így a kérdés lejárt kimenete a világban már nem hat újra.
   */
  applyIdleCrossing(correctOption: number): void;
};

const clamp = (min: number, v: number, max: number): number => (v < min ? min : v > max ? max : v);
const laneOf = (x: number): Lane => (x < -0.5 ? 0 : x > 0.5 ? 2 : 1);

export function createTsunamiCore(opts: { seed: number | string; tuning: TsunamiTuning }): TsunamiCore {
  const tuning: TsunamiTuning = { ...opts.tuning };
  const rng = createRng(seedFrom(TSUNAMI_GAME_ID, opts.seed, "track"));
  const random = rng.next;
  const pools = createTrackPools();
  const gen: TrackGen = createTrackGen(tuning.speed * FIRST_ROW_SEC);
  const blocked: BlockedRange = { from: 1, to: 0 };
  const input: TsunamiInput = { laneDelta: 0, jump: false, steer: 0 };
  const st: TsunamiState = {
    phase: "run",
    lane: 1,
    x: 0,
    targetLane: 1,
    y: 0,
    vy: 0,
    distance: 0,
    prevDistance: 0,
    prevX: 0,
    prevY: 0,
    speed: tuning.speed,
    waveGap: tuning.startGap,
    obstacles: pools.obstacles,
    shells: pools.shells,
    gates: null,
    shellCount: 0,
    stage: 0,
    stumbleMs: 0,
    shieldMs: 0,
    turboMs: 0,
    miniTurboMs: 0,
    timeMs: 0,
    combo: createCombo(),
    score: 0,
    gatesCorrect: 0,
    gatesWrong: 0,
    collisions: 0,
    shellRows: 0,
    jumps: 0,
  };
  const gate: Gate = { presentationId: -1, atDistance: 0, laneOptions: [0, 1, 2], resolved: false, correctLane: -1, pickedLane: -1, inputSeqAtPlace: 0, idle: false };
  /** Szándékos bemenetek számlálója (D-J1a-13): sávváltás, ugrás, koppintás, tárcsa-elmozdulás. */
  let inputSeq = 0;
  let steerCounted = false;
  /** Kegyelmi rés (D-J1a-14): rossz / lejárt kapu után ennyi ideig a rés nem eshet GRACE_GAP_M alá. */
  let graceMs = 0;
  let gatePoints = 0;
  let shellPoints = 0;
  let jumpBuffer = 0;
  let rowCur = -1;
  let rowStreak = 0;

  // Esemény-gyűrű előre lefoglalt elemekkel (KSZ-5: a lépésben nincs allokáció).
  const events: TsunamiEvent[] = [];
  for (let i = 0; i < EVENT_CAP; i++) events.push({ type: "jump", lane: 0, at: 0, n: 0, kind: "" });
  let evCount = 0;
  const emit = (type: TsunamiEventType, lane: number, at: number, n = 0, kind = ""): void => {
    if (evCount >= EVENT_CAP) return;
    const e = events[evCount++]!;
    e.type = type;
    e.lane = lane;
    e.at = at;
    e.n = n;
    e.kind = kind;
  };
  const onCleared = (o: Obstacle): void => emit("cleared", o.lane, o.at, 0, o.kind);

  fillTrack(pools, gen, 0, 0, tuning.speed, blocked, random);

  function recomputeScore(): void {
    st.score = shellPoints + gatePoints + Math.floor(st.distance / 10);
  }

  function end(won: boolean): void {
    if (st.phase !== "run") return;
    st.phase = won ? "won" : "lost";
    emit(won ? "won" : "lost", st.lane, st.distance);
  }

  const result: StepResult = { gateReached: false };

  return {
    state: () => st,
    tuning: () => tuning,
    input,
    step(dtMs, intensity) {
      result.gateReached = false;
      if (st.phase !== "run") return result;
      const dt = dtMs / 1000;
      st.timeMs += dtMs;
      st.prevDistance = st.distance;
      st.prevX = st.x;
      st.prevY = st.y;
      const tutorial = st.timeMs < TUTORIAL_SEC * 1000;

      // --- oldalirány: húzás (sávváltás) vagy analóg tárcsa (sávsegéddel) ---
      if (input.laneDelta !== 0) {
        inputSeq += 1;
        const before = st.targetLane;
        st.targetLane = clamp(0, st.targetLane + clamp(-2, Math.round(input.laneDelta), 2), 2) as Lane;
        input.laneDelta = 0;
        if (st.targetLane !== before) emit("laneChange", st.targetLane, st.distance);
      }
      const steer = Number.isFinite(input.steer) ? clamp(-1, input.steer, 1) : 0;
      if (Math.abs(steer) > STEER_INPUT_MIN) {
        if (!steerCounted) inputSeq += 1;
        steerCounted = true;
      } else steerCounted = false;
      if (Math.abs(steer) > 0.001) {
        st.x = clamp(-1, st.x + steer * STEER_SPEED * dt, 1);
        st.targetLane = laneOf(st.x);
      } else {
        const tx = st.targetLane - 1;
        const d = tx - st.x;
        const stepX = LANE_SPEED * dt;
        st.x = Math.abs(d) <= stepX ? tx : st.x + Math.sign(d) * stepX;
      }
      st.lane = laneOf(st.x);

      // --- ugrás (puffer a földet érésig) ---
      if (input.jump) {
        inputSeq += 1;
        input.jump = false;
        if (st.y <= 0 && st.vy <= 0) {
          st.vy = JUMP_V;
          st.jumps += 1;
          emit("jump", st.lane, st.distance);
        } else {
          jumpBuffer = JUMP_BUFFER_MS;
        }
      }
      if (st.y > 0 || st.vy > 0) {
        // Pontos (állandó gyorsulású) lépés: a csúcs és a légi idő lépésmérettől független.
        st.y += st.vy * dt - 0.5 * GRAVITY * dt * dt;
        st.vy -= GRAVITY * dt;
        if (st.y <= 0) {
          st.y = 0;
          st.vy = 0;
          emit("land", st.lane, st.distance);
          if (jumpBuffer > 0) {
            jumpBuffer = 0;
            st.vy = JUMP_V;
            st.jumps += 1;
            emit("jump", st.lane, st.distance);
          }
        }
      }
      if (jumpBuffer > 0) jumpBuffer = Math.max(0, jumpBuffer - dtMs);

      // --- sebesség, táv, a hullám rése ---
      st.stumbleMs = Math.max(0, st.stumbleMs - dtMs);
      st.turboMs = Math.max(0, st.turboMs - dtMs);
      st.miniTurboMs = Math.max(0, st.miniTurboMs - dtMs);
      st.shieldMs = Math.max(0, st.shieldMs - dtMs);
      const boost = st.turboMs > 0 ? TURBO_FACTOR : st.miniTurboMs > 0 ? MINI_TURBO_FACTOR : 1;
      st.speed = tuning.speed * (st.stumbleMs > 0 ? STUMBLE_FACTOR : 1) * boost;
      const prevDistance = st.distance;
      st.distance += st.speed * dt;
      const i = Number.isFinite(intensity) ? clamp(0, intensity, 1) : 0;
      const tempo = tuning.waveBase * tuning.wavePace * (0.8 + 0.4 * i);
      // A tanító szakaszban a botlás nem viszi a rést (csak a tempó), és a rés a padló alá sem eshet (D-J1a-6).
      const speedTerm = tutorial ? Math.max(0, st.speed - tuning.speed) : st.speed - tuning.speed;
      st.waveGap = Math.min(tuning.gapMax, st.waveGap + speedTerm * dt - tempo * dt);
      if (tutorial) st.waveGap = Math.max(TUTORIAL_GAP_FLOOR, st.waveGap);
      if (graceMs > 0) {
        graceMs = Math.max(0, graceMs - dtMs);
        st.waveGap = Math.max(GRACE_GAP_M, st.waveGap);
      }
      const stage = clamp(0, Math.floor((4 * st.distance) / tuning.levelDistance), 3) as 0 | 1 | 2 | 3;
      st.stage = stage;

      // --- akadályok ---
      const lo = st.distance - HIT_HALF_DEPTH;
      const hi = st.distance + HIT_HALF_DEPTH;
      for (let k = 0; k < pools.obstacles.length; k++) {
        const o = pools.obstacles[k]!;
        if (!o.alive || o.hit) continue;
        const spec = OBSTACLE_SPECS[o.kind];
        if (o.at + spec.length / 2 < lo || o.at - spec.length / 2 > hi) continue;
        if (Math.abs(st.x - (o.lane - 1)) >= HIT_HALF_LANE + 0.5) continue;
        if (spec.jumpable && st.y >= spec.clearY) continue;
        o.hit = true;
        st.collisions += 1;
        st.stumbleMs = STUMBLE_MS;
        st.turboMs = 0;
        st.miniTurboMs = 0;
        if (!tutorial && st.shieldMs <= 0) st.waveGap -= COLLIDE_GAP_LOSS;
        emit("collide", o.lane, o.at, 0, o.kind);
      }

      // --- kagylók ---
      for (let k = 0; k < pools.shells.length; k++) {
        const s = pools.shells[k]!;
        if (!s.alive) continue;
        if (s.at < st.distance - 0.8) {
          // Felszedés nélkül elmaradt: a sora már nem teljes.
          s.alive = false;
          if (s.row === rowCur) rowStreak = -SHELL_ROW;
          else {
            rowCur = s.row;
            rowStreak = -SHELL_ROW;
          }
          continue;
        }
        if (Math.abs(s.at - st.distance) > 0.7 || Math.abs(st.x - (s.lane - 1)) > 0.5 || st.y > 1.2) continue;
        s.alive = false;
        st.shellCount += 1;
        shellPoints += 5;
        if (s.row === rowCur) rowStreak += 1;
        else {
          rowCur = s.row;
          rowStreak = 1;
        }
        emit("shell", s.lane, s.at, st.shellCount);
        if (rowStreak === SHELL_ROW) {
          st.shellRows += 1;
          st.miniTurboMs = MINI_TURBO_MS;
          emit("shellRow", s.lane, s.at, st.shellRows);
        }
      }

      // --- kapu ---
      const g = st.gates;
      if (g && prevDistance < g.atDistance && st.distance >= g.atDistance) {
        if (g.resolved) {
          st.gates = null;
          emit("gatePassed", st.lane, g.atDistance, g.correctLane);
        } else {
          result.gateReached = true;
        }
      }

      // --- pálya-generálás, kitakarítás ---
      despawnBehind(pools, st.distance);
      if (st.gates && st.gates.atDistance < st.distance - 2) st.gates = null;
      if (!st.gates) {
        blocked.from = 1;
        blocked.to = 0;
      }
      fillTrack(pools, gen, st.distance, st.timeMs / 1000, tuning.speed, blocked, random);

      recomputeScore();
      if (st.distance >= tuning.levelDistance) end(true);
      else if (st.waveGap <= 0) {
        st.waveGap = 0;
        end(false);
      }
      return result;
    },
    placeGate(p) {
      const arriveSec = Math.max(1.2, (p.windowMs - GATE_LEAD_MS) / 1000);
      const slow = clamp(0.35, p.slowMo, 1);
      gate.presentationId = p.id;
      // D-J1a-12 (review #483, K1): a hátralévő botlás alatt a futó lassabban halad — a kapu ennyivel közelebb kerül, így a
      // botlás közben induló kérdésnél is az ablak vége előtt ér oda.
      const worldSec = slow * arriveSec;
      const stumbleSec = Math.min(worldSec, st.stumbleMs / 1000);
      gate.atDistance = st.distance + tuning.speed * (stumbleSec * STUMBLE_FACTOR + (worldSec - stumbleSec));
      gate.inputSeqAtPlace = inputSeq;
      gate.idle = false;
      const n = clamp(1, Math.floor(p.optionCount), 3);
      for (let l = 0; l < 3; l++) gate.laneOptions[l] = optionForLane(l, n);
      gate.resolved = false;
      gate.correctLane = -1;
      gate.pickedLane = -1;
      st.gates = gate;
      // A kapu-pillanat a futótól (legfeljebb a kapu előtti 4 mp-től) a kapuig tart: hosszú ablaknál sem marad akadály előtte.
      blocked.from = Math.min(st.distance - 1, gate.atDistance - tuning.speed * GATE_CLEAR_SEC);
      blocked.to = gate.atDistance + GATE_CLEAR_AFTER_M;
      clearRange(pools, blocked, onCleared);
      emit("gatePlaced", 1, gate.atDistance, n);
      return gate;
    },
    resolveGate() {
      const optionIndex = st.gates ? st.gates.laneOptions[st.lane] : -1;
      return { laneIndex: st.lane, optionIndex };
    },
    steerToOption(optionIndex) {
      const g = st.gates;
      if (!g) return;
      const lane = g.laneOptions.indexOf(optionIndex);
      if (lane < 0) return;
      if (lane !== st.targetLane) emit("laneChange", lane, st.distance);
      st.targetLane = lane as Lane;
      input.steer = 0;
    },
    applyOutcome(o) {
      const g = st.gates;
      const own = !!g && g.presentationId === o.id;
      if (o.result === "aborted") {
        if (own) st.gates = null;
        return;
      }
      if (own && g) {
        g.resolved = true;
        g.correctLane = g.laneOptions.indexOf(o.correctOption);
        g.pickedLane = o.pickedOption === null ? -1 : g.laneOptions.indexOf(o.pickedOption);
        // Ha a futó már a kapun van (átlépéssel döntött), a kapu mögötte marad: a következő lépés kiveszi.
        if (st.distance >= g.atDistance) st.gates = null;
      }
      if (own && g && g.idle) {
        // D-J1a-13: a tétlen átfutás játékbeli hatása már megtörtént (`applyIdleCrossing`); itt csak a kapu dőlt el.
        g.idle = false;
        recomputeScore();
        return;
      }
      if (o.result === "correct") {
        st.combo = comboCorrect(st.combo);
        st.gatesCorrect += 1;
        gatePoints += 30 * st.combo.multiplier;
        st.turboMs = TURBO_MS;
        st.stumbleMs = 0;
        st.waveGap = Math.min(tuning.gapMax, st.waveGap + GOOD_GATE_GAP_GAIN);
        emit("gateCorrect", own && g ? g.correctLane : st.lane, st.distance, st.combo.multiplier);
      } else {
        st.combo = comboBreak(st.combo);
        st.gatesWrong += 1;
        st.stumbleMs = STUMBLE_MS;
        st.turboMs = 0;
        graceMs = GRACE_MS;
        emit("gateWrong", own && g ? g.correctLane : -1, st.distance, own && g ? g.pickedLane : -1, o.result);
      }
      recomputeScore();
    },
    running: () => st.phase === "run",
    forceEnd(won) {
      end(won);
    },
    drainEvents(cb) {
      const n = evCount;
      evCount = 0;
      for (let k = 0; k < n; k++) cb(events[k]!);
    },
    markInput() {
      inputSeq += 1;
    },
    hadInputSinceGate: () => !!st.gates && inputSeq > st.gates.inputSeqAtPlace,
    applyIdleCrossing(correctOption) {
      const g = st.gates;
      if (!g) return;
      const lane = st.lane;
      const good = g.laneOptions[lane] === correctOption;
      g.idle = true;
      st.combo = comboBreak(st.combo);
      if (good) {
        st.turboMs = TURBO_MS;
        st.stumbleMs = 0;
        st.waveGap = Math.min(tuning.gapMax, st.waveGap + GOOD_GATE_GAP_GAIN);
      } else {
        st.stumbleMs = STUMBLE_MS;
        st.turboMs = 0;
        graceMs = GRACE_MS;
      }
      emit(good ? "gateCorrect" : "gateWrong", g.laneOptions.indexOf(correctOption), st.distance, good ? 1 : lane, "idle");
    },
    threatAhead(m) {
      for (let k = 0; k < pools.obstacles.length; k++) {
        const o = pools.obstacles[k]!;
        if (o.alive && !o.hit && o.lane === st.lane && o.at > st.distance && o.at - st.distance < m) return true;
      }
      return false;
    },
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A menet meghajtója: a lap (rAF) és a node-szimuláció UGYANEZT futtatja (C-52)                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Ütközés hitstopja (valós ms; a hurok `holdFor`-ja a lépések idejét tolja el, nem a tartalmukat). */
export const HITSTOP_COLLIDE_MS = 70;

/** A kérdés-sáv állapotgépének az a része, amit a meghajtó használ (`createQuestionUi` / `usePlayQuestion` adja). */
export type TsunamiQuestionUi = {
  frame(clockMs: number, ctx: { calm: boolean; tick?: boolean; hold?: boolean }): void;
  timeScale(): number;
  finished(): boolean;
  finish(): unknown;
  pick(optionIndex: number, clockMs?: number): QuestionOutcome | null;
  active(): QuestionPresentation | null;
};

export type TsunamiDriver = {
  core: TsunamiCore;
  loop: FixedLoop;
  feel: Feel;
  pace: IntensityDirector;
  /**
   * Egy képkocka (`realDtMs` valós idő). Sorrend (mindkét úton azonos): kérdés-óra (szünetben áll) → menetvégnél a kérdés
   * lezárása → a kérdés-sáv képkockája → új kérdésnél kapu a pályára → időskála (szünet 0, nyitott kérdés slowMo) → fix
   * lépésű hurok (a kapu átlépésekor a sáv válaszol) → események ürítése (hitstop, majd a nézet `onEvent`-je). Az alphát adja.
   */
  frame(realDtMs: number, paused: boolean, onEvent?: (e: TsunamiEvent) => void): number;
  /** Érintés / billentyű a kapu-táblán: a sávba fut és azonnal választ (D-J1a-2). */
  tapOption(optionIndex: number): QuestionOutcome | null;
  /** A nyitott kérdés azonosítója, ha a válaszcélok már élesek (`tapOption` elfogadná); különben null. */
  armedPresentationId(): number | null;
  /** A kérdés-sáv kimenete → a világ (a lap / sim `onOutcome`-ja hívja). */
  onOutcome(o: QuestionOutcome, p: QuestionPresentation): void;
  drain(onEvent?: (e: TsunamiEvent) => void): void;
  /** A lassítatlan kérdés-óra (ms; szünetben áll). */
  clockMs(): number;
};

export function createTsunamiDriver(opts: {
  seed: number | string;
  tuning: TsunamiTuning;
  questions: TsunamiQuestionUi | null;
  /** A director áramlat-intenzitása (a hullám tempójához); kérdés nélkül 0,4. */
  intensity: () => number;
  reducedMotion?: boolean;
}): TsunamiDriver {
  const core = createTsunamiCore({ seed: opts.seed, tuning: opts.tuning });
  const pace = createIntensityDirector();
  let clock = 0;
  let real = 0;
  const q = opts.questions;
  const loop = createFixedLoop((dt) => {
    const before = core.state().collisions;
    const r = core.step(dt, opts.intensity());
    if (r.gateReached && q) {
      // A kapu átlépése: a futó sávja a válasz (D-J1a-2). Az opció nélküli sáv (2 opciónál a közép) a lejáratra vár.
      const g = core.state().gates;
      const act = q.active();
      const { optionIndex } = core.resolveGate();
      if (g && act && act.id === g.presentationId) {
        if (!core.hadInputSinceGate()) {
          // D-J1a-13: tétlen átfutás — a játékban hat, a nyilvántartásba lejártként kerül (a határidőre igazított `pick`).
          core.applyIdleCrossing(act.options.findIndex((o) => o.correct));
          q.pick(0, act.startedAtSimMs + act.windowMs);
        } else if (optionIndex >= 0) q.pick(optionIndex, clock);
      }
    }
    if (core.state().collisions > before) pace.signal("damage");
    if (core.threatAhead(NEAR_THREAT_M)) pace.signal("nearThreat", dt / 1000);
    pace.update(dt / 1000);
  });
  const feel = createFeel({ reducedMotion: opts.reducedMotion ?? false, loop, fxRng: createRng(seedFrom(TSUNAMI_GAME_ID, opts.seed, "fx")).next });
  const drain = (onEvent?: (e: TsunamiEvent) => void) => {
    core.drainEvents((e) => {
      if (e.type === "collide") feel.hitstop(HITSTOP_COLLIDE_MS);
      if (e.type === "gateWrong") pace.signal("wrong");
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
      if (q && !paused) {
        q.frame(clock, { calm: pace.calm() });
        const act = q.active();
        const g = core.state().gates;
        if (act && core.running() && (!g || g.presentationId !== act.id)) {
          core.placeGate({ id: act.id, windowMs: act.windowMs, slowMo: act.slowMo, optionCount: act.options.length });
        }
      }
      loop.setTimeScale(paused ? 0 : q ? q.timeScale() : 1);
      const alpha = loop.frame(real);
      drain(onEvent);
      return alpha;
    },
    armedPresentationId() {
      if (!q) return null;
      const act = q.active();
      const g = core.state().gates;
      if (!act || !g || g.presentationId !== act.id || g.resolved) return null;
      return clock - act.startedAtSimMs >= ANSWER_ARM_MS ? act.id : null;
    },
    tapOption(optionIndex) {
      if (!q) return null;
      const act = q.active();
      const g = core.state().gates;
      if (!act || !g || g.presentationId !== act.id || g.resolved) return null;
      // Élesítés (átmeneti kapu 3a): a kérdés megjelenése utáni első 400 ms érintése / billentyűje nem válasz (olvasás nélkül
      // vagy a megjelenés pillanatában a tábla helyére eső ujj). A lap a válaszcélokat ugyanezzel a feltétellel mutatja
      // (`armedPresentationId`) — a kérdés-órával, nem valós idővel, így lassú képkockánál sem nyel el érintést.
      if (clock - act.startedAtSimMs < ANSWER_ARM_MS) return null;
      core.markInput();
      core.steerToOption(optionIndex);
      return q.pick(optionIndex, clock);
    },
    onOutcome(o, p) {
      const correctOption = p.options.findIndex((opt) => opt.correct);
      const pickedOption = o.pickedOriginalIndex === null ? null : p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
      core.applyOutcome({ id: o.id, result: o.result as QuestionResult, pickedOption: pickedOption === -1 ? null : pickedOption, correctOption });
    },
    drain,
    clockMs: () => clock,
  };
}

/** A lépés hossza (újraexport a lapnak / sim-nek). */
export { SIM_STEP_MS };
