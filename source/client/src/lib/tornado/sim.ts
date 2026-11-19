/**
 * J7b — Tornado Hunter 200: a kérdés-üldözés közös, tiszta magja (`createChaseCore` / `createChaseDriver`) és a
 * node-szimuláció (`createSimGame`, `T/support/game-sim.ts` `SimGame`; végrehajtás K.6, J7b; terv 5.7, 6.2).
 *
 * A mag a lapon és a szimulációban UGYANAZ (K.6 „közös meghajtó”): fix lépésű hurok (`createFixedLoop`, 1/60 s), a
 * kérdés-óra (szünetben áll; `slowMo: 1`, a vezetés a kérdés alatt nem lassul), az útelágazás (Q1: a kérdés megjelenésekor
 * három kapu a jármű előtt, a választás az áthajtás iránya), a turbópad (Q3: a pad elérésekor `request("trigger")`), a
 * horgony-kérdés kérése, a nitró és a kerülő. A lap a valódi járműfizikát adja a lépésnek (`physics`), a szimuláció egy
 * egyszerű „bot-sofőrt” (állandó tempó, a választott kapu / pad / tölcsér felé kormányoz) — a mért ütemezés így a lap
 * ütemezése, a vezetés finomsága nem része a mérésnek.
 *
 * Rétegrend (KSZ-1): nincs DOM, three.js, React, óra és `Math.random`; a véletlen a seedelt `createRng` (KSZ-2).
 */
import { createRng, seedFrom } from "@shared/game-rng";
import { createFixedLoop, type FixedLoop } from "@/game-engine/play/loop";
import { fitsAllViewports } from "@/game-engine/play/promptFit";
import {
  bankPlayQuestion,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  type DirectorConfig,
  type QuestionProvider,
} from "@/game-engine/play/questionDirector";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import { createQuestionUi } from "@/game-engine/play/questionUi";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";
import type { QuestionOutcome, QuestionPresentation, QuestionResult } from "@/game-engine/play/types";
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import { collidersNear, type Collider } from "./collision";
import {
  freezeJunction,
  gateDrivable,
  gatePoint,
  junctionCrossing,
  slideJunction,
  junctionEffect,
  nextJunctionGapMs,
  nextTurboGapMs,
  NITRO_MS,
  NITRO_SPEED_FACTOR,
  padReached,
  planJunction,
  planTurboPad,
  type Junction,
  type Pose,
  type TurboPad,
} from "./junctions";
import { levelSpec, type LevelSpec } from "./levels";
import { AUTO_GRADE_TABLE } from "./questions";
import { anchorBandState, interceptReward, type RewardResult } from "./scoring";
import { ANCHOR_HOLD_BASE_MS } from "./upgrades";
import { clampToWorld, fromKm, toKm } from "./world";

export const TORNADO_GAME_ID = "tornado-hunter-200" as const;

/** A kérdés-sáv alap ablaka rövid tételnél (ms) — a kapuvonal távolsága ehhez igazodik. */
export const TORNADO_BASE_WINDOW_MS = 6000;

/** A director beállítása (végrehajtás J7b 3.; „J7b döntések” 11.). */
export function tornadoDirectorConfig(grade: number): DirectorConfig {
  return {
    gameId: TORNADO_GAME_ID,
    optionCount: 3,
    minGapMs: 1500,
    maxGapMs: 20_000,
    targetPerMin: 4,
    baseWindowMs: TORNADO_BASE_WINDOW_MS,
    slowMo: 1,
    grade,
    readingAware: true,
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs: TORNADO_BASE_WINDOW_MS }).ok,
  };
}

/** A tölcsér mozgása egy lépésben (a lap és a szimuláció közös képlete; a J7c zajpályája ezt váltja). */
export type TornadoBody = { x: number; z: number; angle: number; born: number };
export function advanceTornado(tp: TornadoBody, spec: Pick<LevelSpec, "tornadoSpeed">, dtSec: number): void {
  tp.born += dtSec;
  tp.angle += dtSec * 0.15;
  tp.x = clampToWorld(tp.x + Math.cos(tp.angle) * spec.tornadoSpeed * dtSec);
  tp.z = clampToWorld(tp.z + Math.sin(tp.angle) * spec.tornadoSpeed * dtSec);
}

/**
 * A győzelmi jutalom (review #482 K2, kanban #83 L3): MINDIG az ALAP szint-specifikációval (a műszer-fejlesztés csak a
 * sáv elérhetőségét könnyíti, a pontot nem emeli — ezért a függvény szintszámot kap, szélesített sávot nem kaphat),
 * és a HORGONYZÁS PILLANATÁNAK távolságával (a rögzítés után a tölcsér tovább mozog; az nem a játékos pozíciója).
 */
export function winReward(args: {
  level: number;
  secondsUsed: number;
  anchorAttempts: number;
  peakWind: number;
  anchoredDistanceKm: number;
  correctAnswers: number;
  wrongAnswers: number;
}): RewardResult {
  return interceptReward({
    spec: levelSpec(args.level),
    secondsUsed: args.secondsUsed,
    anchorAttempts: args.anchorAttempts,
    peakWind: args.peakWind,
    distanceKm: args.anchoredDistanceKm,
    correctAnswers: args.correctAnswers,
    wrongAnswers: args.wrongAnswers,
  });
}

/**
 * Kupon (lecke-jutalom) mód: csak tananyag jöhet, ezért a kis lecke se fogyjon el (önellenőrző lista b). Az `n`. ismétlés
 * a tananyag körbejárásával a következő tétel, KÖRÖNKÉNT saját kulccsal (a director egy menetben egy kulcsot csak egyszer
 * ad; kupon módban ismétlési sor nincs). Üres tananyagnál null (a játék kérdés nélkül fut — terv 8.1).
 */
export function couponRepeat<T>(items: readonly T[], n: number): { item: T; keySuffix: string } | null {
  if (items.length === 0 || !(n >= 0)) return null;
  return { item: items[n % items.length]!, keySuffix: `~${Math.floor(n / items.length) + 2}` };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A közös mag                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export type QuestionKind = "junction" | "turbo" | "anchor";

/** A kérdés-sáv állapotgépének az a része, amit a mag használ (`createQuestionUi` / `usePlayQuestion` adja). */
export type ChaseQuestions = {
  frame(clockMs: number, ctx: { calm: boolean; hold: boolean }): void;
  request(reason: "trigger" | "rescue", clockMs: number): QuestionPresentation | null;
  pick(optionIndex: number, clockMs: number): QuestionOutcome | null;
  active(): QuestionPresentation | null;
  abort(): QuestionOutcome | null;
  canAsk(): boolean;
  /** Megoldás-kijelzés alatt beérkezett, a kijelzés végén induló kérés van-e. */
  pending(): boolean;
};

export type ChaseEvent =
  | { kind: "junction"; junction: Junction }
  /** `frozen`: a kapuk a kérdés végén rögzültek-e (mérés: a rögzítés után lejárt kérdés — J7b döntések 26.). */
  | { kind: "junction-done"; result: QuestionResult; nitroMs: number; detourSec: number; frozen: boolean }
  | { kind: "pad"; pad: TurboPad }
  | { kind: "pad-gone" }
  | { kind: "turbo-done"; result: QuestionResult; nitroMs: number }
  /** K4 (J7b döntések 19.): a padon nem jött kérdés (üres forrás) — kérdés nélkül nitró, a pad eltűnik. */
  | { kind: "pad-free"; nitroMs: number }
  | { kind: "junction-frozen"; junction: Junction }
  | { kind: "anchor-answer"; result: QuestionResult };

/**
 * A jármű egy lépés utáni helyzete + a játékos bemenete ebben a lépésben (a szándék-figyeléshez, J7b döntések 25.):
 * `brake` lenyomva, `reverse` hátrahúzott gáz / tolatás. A kormány nem bemenete a szándéknak (a vezetés nem válaszolhat).
 */
export type VehicleSample = Pose & { speed: number; brake?: boolean; reverse?: boolean };

/**
 * A kapuk rögzítése (J7b döntések 25., orkesztrátori döntés B): csak a kérdés megjelenése után `INTENT_MIN_READ_MS`-mal
 * LENYOMOTT fék vagy hátrahúzott gáz (felfutó él) rögzít — a korábban lenyomott és tovább tartott fék / tolatás (akadály) nem.
 * A választ magát a táblára koppintás / 1–3 billentyű adja (a lap közvetlenül `pick`-el), vagy a rögzült kapun áthajtás.
 * A kormánymozdulat önmagában soha nem szándék.
 */
export const INTENT_MIN_READ_MS = 1000;
/** R2 / J7b döntések 26.: rögzüléskor a határidő legalább a legtávolabbi kapuig vezető út ideje + ennyi. */
export const FREEZE_DEADLINE_MARGIN_MS = 600;
/** A legtávolabbi kapuig vezető út: egyenes táv × ennyi (a fordulás miatt hosszabb). */
export const FREEZE_PATH_SLACK = 1.3;
/** Az érkezést legalább ekkora tempóval számoljuk (álló / lassú járműnél se nőjön az ablak korlátlanul — Ú5). */
export const FREEZE_MIN_ARRIVE_SPEED = 8;
/** A rögzülés legfeljebb ennyivel hosszabbítja a kérdés eredeti ablakát. */
export const FREEZE_EXTEND_CAP_MS = 5000;
/** K4: ennyi ms után a turbópad kérdés nélkül ad nitrót, ha a director nem ad kérdést. */
export const PAD_FREE_AFTER_MS = 1500;

export type ChaseCore = {
  /** A kérdés-óra (ms): a lefutott lépések összege (szünetben nem fut lépés). */
  clockMs(): number;
  /** Egy fix lépés: a jármű ÚJ helyzete (a fizika után), és hogy tartani kell-e (horgony / mérési sáv). */
  step(dtMs: number, v: VehicleSample, ctx: { hold: boolean }): void;
  /** A kérdés-sáv visszahívásai (a lap `usePlayQuestion` `onShow` / `onOutcome`-ja ide továbbít). */
  onShow(p: QuestionPresentation): void;
  onOutcome(o: QuestionOutcome, p: QuestionPresentation): void;
  /** Horgony-kérdés kérése. Nyitott elágazás / turbó kérdést megszakít (nem hiba, nem ismétlés). */
  requestAnchor(): boolean;
  /** Teszt-kampó (`forceState({ question: true })`): azonnali turbó-kérdés, a nyitott kérdés megszakításával. */
  forceTurbo(): boolean;
  /** Teszt-kampó (`forceState({ junction: true })`): azonnali elágazás. */
  forceJunction(): boolean;
  /** K2: a fék / a tárcsa hátrahúzása megszakítja a nitrót. */
  cancelNitro(): void;
  /** Volt-e szándékos bemenet a nyitott elágazás megjelenése óta (a lap a feliratban jelzi). */
  intentSeen(): boolean;
  kindOf(id: number): QuestionKind | null;
  junction(): Junction | null;
  pad(): TurboPad | null;
  nitroLeftMs(): number;
  /** Az eddigi kerülők összege (mp). */
  detourTotalSec(): number;
  drainEvents(): ChaseEvent[];
};

export function createChaseCore(opts: {
  seed: number | string;
  questions: ChaseQuestions | null;
  /** A világ ütközői egy pont körül (a kapuk folyosó-ellenőrzéséhez, J7b döntések 14.); alap: `collidersNear`. */
  collidersAt?: (x: number, z: number) => readonly Collider[];
}): ChaseCore {
  const rng = createRng(seedFrom(TORNADO_GAME_ID, opts.seed, "chase")).next;
  const q = opts.questions;
  const collidersAt = opts.collidersAt ?? collidersNear;
  let clock = 0;
  // Lépésenként nem foglalunk új objektumot (K5): a helyzet számokban.
  let px = 0;
  let pz = 0;
  let ph = 0;
  let speed = 0;
  /** Az előző lépés fék- / tolatás-állapota: a szándékhoz felfutó él kell (J7b döntések 25.). */
  let brakePrev = false;
  let reversePrev = false;
  let intent = false;
  let freezeRetry = 0;
  let freezeAttempt = 0;
  let freezeBackoff = 3;
  let shownAt = 0;
  /** A kérdés saját (rögzülés előtti) ablaka: a hosszabbítás felső korlátjához. */
  let baseWindowMs = 0;
  let intentHeading = 0;
  const prevPt = { x: 0, z: 0 };
  const freezePose = { x: 0, z: 0, heading: 0 };
  let padAskSince: number | null = null;
  let junction: Junction | null = null;
  /** Az első elágazás a director bemelegítése után azonnal jöhet; utána indítástól számított 15–20 mp. */
  let nextJunctionAt = 0;
  let pad: TurboPad | null = null;
  let padArmed = false;
  let nextPadAt = nextTurboGapMs(rng);
  let nitro = 0;
  let detourTotal = 0;
  const kinds = new Map<number, QuestionKind>();
  /** A legutóbb kért (nem ütemezett) kérdés fajtája — a kijelzés végén induló függő kérésnél is megmarad. */
  let requested: QuestionKind | null = null;
  let events: ChaseEvent[] = [];

  const ask = (kind: QuestionKind, reason: "trigger" | "rescue"): boolean => {
    if (!q) return false;
    requested = kind;
    const p = q.request(reason, clock);
    if (p) return true;
    if (!q.pending()) requested = null; // a director most nem adott (min. rés / üres forrás): nincs függő kérés
    return false;
  };
  /** A legtávolabbi kapuig vezető út ideje (ms) a pillanatnyi tempóval (J7b döntések 26.). Lépésenként nem foglal (K5). */
  let fitGates = 3;
  let fitCapEnd = 0;
  const arriveFor = (line: number, spacing: number) =>
    ((Math.hypot(line, ((fitGates - 1) / 2) * spacing) * FREEZE_PATH_SLACK) / Math.max(FREEZE_MIN_ARRIVE_SPEED, Math.abs(speed))) * 1000;
  const fitsDeadline = (line: number, spacing: number) => clock + arriveFor(line, spacing) + FREEZE_DEADLINE_MARGIN_MS <= fitCapEnd;
  const abortOpen = () => {
    if (!q) return;
    const act = q.active();
    if (act && kinds.get(act.id) !== "anchor") q.abort();
  };

  return {
    clockMs: () => clock,
    step(dtMs, v, ctx) {
      const prevX = px;
      const prevZ = pz;
      px = v.x;
      pz = v.z;
      ph = v.heading;
      speed = v.speed;
      const brakeEdge = v.brake === true && !brakePrev;
      const reverseEdge = v.reverse === true && !reversePrev;
      brakePrev = v.brake === true;
      reversePrev = v.reverse === true;
      clock += dtMs;
      if (nitro > 0) nitro = Math.max(0, nitro - dtMs);
      if (!q) return;
      // Q1: a táblák várnak, amíg szándékot nem lát (J7b döntések 12–13.), utána rögzülnek, és a rögzült kapun áthajtás a válasz.
      if (junction) {
        const act = q.active();
        if (act && act.id === junction.questionId) {
          // J7b döntések 25.: a minimális olvasás UTÁN lenyomott fék / hátrahúzott gáz rögzít, a pillanatnyi menetirányhoz.
          if (!intent && (brakeEdge || reverseEdge) && clock - shownAt >= INTENT_MIN_READ_MS) {
            intent = true;
            intentHeading = v.heading;
          }
          if (!junction.frozen) {
            slideJunction(junction, v, speed);
            // Rögzülés a szándék után; foglalt folyosónál növekvő várakozással, próbánként egy távolsággal (R3).
            if (intent && freezeRetry-- <= 0) {
              freezePose.x = v.x;
              freezePose.z = v.z;
              freezePose.heading = intentHeading;
              // 33.: csak a hosszabbítási plafonon belül elérhető elrendezés rögzül (a rögzítés után a jó kapu felé tartó nem jár le).
              fitGates = junction.gates;
              fitCapEnd = act.startedAtSimMs + Math.max(act.windowMs, baseWindowMs + FREEZE_EXTEND_CAP_MS);
              if (freezeJunction(junction, freezePose, speed, collidersAt, freezeAttempt++, fitsDeadline)) {
                // J7b döntések 26.: a legtávolabbi kapuig vezető út + ráhagyás belefér az ablakba, legfeljebb +5 s.
                const arriveMs = arriveFor(junction.line, junction.spacing);
                const oldWindow = act.windowMs;
                const want = clock - act.startedAtSimMs + arriveMs + FREEZE_DEADLINE_MARGIN_MS;
                act.windowMs = Math.max(oldWindow, Math.min(want, baseWindowMs + FREEZE_EXTEND_CAP_MS));
                // 27.: a csík nem töltődik vissza — a rögzüléskori arány marad, és simán az új határidőn fogy el.
                const leftOld = act.startedAtSimMs + oldWindow - clock;
                const leftNew = act.startedAtSimMs + act.windowMs - clock;
                junction.barWindowMs = act.windowMs > oldWindow && leftOld > 0 ? (leftNew * oldWindow) / leftOld : 0;
                events.push({ kind: "junction-frozen", junction });
              } else {
                freezeRetry = freezeBackoff;
                freezeBackoff = Math.min(30, freezeBackoff + 3);
              }
            }
          } else {
            prevPt.x = prevX;
            prevPt.z = prevZ;
            const opt = junctionCrossing(junction, prevPt, v);
            if (opt !== null) q.pick(opt, clock);
          }
        }
      }
      // Q3: turbópad — megjelenik, lejár, elérve kérdést kér (a kérés a min. rés miatt később is sikerülhet).
      if (pad && !padArmed && clock >= pad.expiresAtMs) {
        pad = null;
        nextPadAt = clock + nextTurboGapMs(rng);
        events.push({ kind: "pad-gone" });
      }
      if (pad && !padArmed && padReached(pad, px, pz)) padArmed = true;
      if (pad && padArmed && q.canAsk()) {
        if (padAskSince === null) padAskSince = clock;
        if (!ask("turbo", "trigger") && !q.pending() && clock - padAskSince >= PAD_FREE_AFTER_MS) {
          // K4: nincs kérdés-forrás (üres kupon-lecke, kérdés nélküli mód) — a pad nem ragad be.
          pad = null;
          padArmed = false;
          padAskSince = null;
          nextPadAt = clock + nextTurboGapMs(rng);
          nitro = Math.max(nitro, NITRO_MS);
          events.push({ kind: "pad-free", nitroMs: NITRO_MS });
        }
      } else if (!pad && clock >= nextPadAt && !ctx.hold && q.canAsk()) {
        pad = planTurboPad({ x: px, z: pz, heading: ph }, clock);
        padArmed = false;
        padAskSince = null;
        events.push({ kind: "pad", pad });
      }
      q.frame(clock, { calm: clock >= nextJunctionAt && !padArmed, hold: ctx.hold });
    },
    onShow(p) {
      const kind: QuestionKind = p.reason === "scheduled" ? "junction" : requested ?? "turbo";
      if (p.reason !== "scheduled") requested = null;
      kinds.set(p.id, kind);
      if (kind === "junction") {
        junction = planJunction({ pose: { x: px, z: pz, heading: ph }, speed, windowMs: p.windowMs, questionId: p.id, optionCount: p.options.length, rng });
        nextJunctionAt = clock + nextJunctionGapMs(rng);
        // A szándék a megjelenés ÓTA számít (felfutó él a minimális olvasás után — a már tartott fék nem válasz).
        intent = false;
        baseWindowMs = p.windowMs;
        freezeRetry = 0;
        freezeAttempt = 0;
        freezeBackoff = 3;
        shownAt = clock;
        events.push({ kind: "junction", junction });
      }
    },
    onOutcome(o, p) {
      // A fajta a megoldás-kijelzés alatt is kell (a lap a sáv módját és a táblák színét ebből rajzolja) — nem törlődik.
      const kind = kinds.get(p.id);
      if (kind === "junction") {
        const j = junction && junction.questionId === p.id ? junction : null;
        junction = null;
        const eff = junctionEffect(o.result, j ?? { detourSec: 0 });
        nitro = Math.max(nitro, eff.nitroMs);
        detourTotal += eff.detourSec;
        events.push({ kind: "junction-done", result: o.result, ...eff, frozen: j?.frozen === true });
      } else if (kind === "turbo") {
        pad = null;
        padArmed = false;
        padAskSince = null;
        nextPadAt = clock + nextTurboGapMs(rng);
        const nitroMs = o.result === "correct" ? NITRO_MS : 0;
        nitro = Math.max(nitro, nitroMs);
        events.push({ kind: "turbo-done", result: o.result, nitroMs });
      } else if (kind === "anchor") {
        events.push({ kind: "anchor-answer", result: o.result });
      }
    },
    requestAnchor() {
      if (!q) return false;
      abortOpen();
      return q.canAsk() || q.pending() ? ask("anchor", "trigger") : false;
    },
    forceTurbo() {
      if (!q) return false;
      abortOpen();
      return ask("turbo", "rescue");
    },
    forceJunction() {
      if (!q) return false;
      abortOpen();
      return ask("junction", "rescue");
    },
    cancelNitro() {
      nitro = 0;
    },
    intentSeen: () => intent,
    kindOf: (id) => kinds.get(id) ?? null,
    junction: () => junction,
    pad: () => pad,
    nitroLeftMs: () => nitro,
    detourTotalSec: () => detourTotal,
    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
  };
}

/** A mag a fix lépésű hurokkal: a lépés előbb a fizikát hívja (a jármű új helyzete), utána a magot. */
export type ChaseDriver = { core: ChaseCore; loop: FixedLoop; frame(nowMs: number): number };
export function createChaseDriver(opts: {
  seed: number | string;
  questions: ChaseQuestions | null;
  physics: (dtSec: number) => VehicleSample & { hold: boolean };
  collidersAt?: (x: number, z: number) => readonly Collider[];
}): ChaseDriver {
  const core = createChaseCore({ seed: opts.seed, questions: opts.questions, collidersAt: opts.collidersAt });
  const loop = createFixedLoop((dtMs) => {
    const v = opts.physics(dtMs / 1000);
    core.step(dtMs, v, { hold: v.hold });
  });
  return { core, loop, frame: (nowMs) => loop.frame(nowMs) };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Node-szimuláció (K.6)                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A bot tempója (világegység / s) és kormányzási sebessége (rad / s). */
export const BOT_SPEED = 16;
export const BOT_TURN = 2.2;
/** A jármű kezdőhelye a tölcsértől (km) — a lappal azonos. */
export const START_DISTANCE_KM = 3.4;

/** Az évfolyam AUTO-szintsávjának közepe (a sim ezt a pályát futja). */
export function levelForGrade(grade: number): number {
  const g = Math.max(1, Math.min(12, Math.round(grade)));
  const row = AUTO_GRADE_TABLE[g - 1]!;
  return Math.round((row.from + row.to) / 2);
}

/** Seedelt, kulcsonként egyedi számolási bank (≥ 300 tétel) — a sim az ütemezést méri, nem a tartalmat. */
function simProvider(seed: number, material: readonly FourChoiceQuiz[]): QuestionProvider {
  const rng = createRng(seedFrom(TORNADO_GAME_ID, seed, "simbank"));
  let m = 0;
  return {
    couponOnly: false,
    material: () => (m < material.length ? materialPlayQuestion(material[m++]!) : null),
    fresh: () => {
      const a = 3 + rng.int(40);
      const b = 2 + rng.int(30);
      const answer = a + b;
      return bankPlayQuestion(TORNADO_GAME_ID, {
        id: `sim-${a}-${b}`,
        prompt: `${a} + ${b} = ?`,
        options: [String(answer), String(answer + 1 + rng.int(3)), String(answer - 1 - rng.int(3)), String(answer + 10)],
        correctIndex: 0,
        explanation: `${a} + ${b} = ${answer}.`,
      });
    },
    restore: (item) => restoreReviewQuestion(item, {}),
  };
}

export type TornadoSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): { id: number; correctOption: number; windowMs: number; optionCount: number } | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
  /** Mérés: elágazások / turbók / kerülők száma, a menet ideje és a győzelmi pont. */
  tally(): { junctions: number; frozen: number; frozenTimeouts: number; turbos: number; detours: number; nitros: number; anchorQuestions: number; score: number };
  /** Arany visszajátszás: a végállapot rövid lenyomata. */
  fingerprint(): string;
};

/**
 * K1 (J7b döntések 16.): a kerülő ennyi másodpercet ad hozzá a menet órájához / a tölcsér életkorához úgy, hogy mindkettőből
 * legalább `DETOUR_GRACE_SEC` maradjon — a rossz kapu nem okozhat azonnali vereséget, és a helyes tábla kijelzése (≥ 1,8 s) látszik.
 */
export const DETOUR_GRACE_SEC = 5;
export function detourWithGrace(detourSec: number, lifeLeftSec: number, timeLeftSec: number): number {
  const room = Math.min(lifeLeftSec, timeLeftSec) - DETOUR_GRACE_SEC;
  return Math.max(0, Math.min(detourSec, room));
}

/**
 * Nem olvasó vezetési minták (J7b döntések 29.; a független ellenőr botjai): a bot a kérdés ALATT is így vezet, és soha nem
 * válaszol szándékosan. `wobble`: ±amp kormányrezgés (sin 1,7t); `turn-straighten`: a kérdéssel együtt induló 1,5 s-os ±0,9
 * kanyar, utána egyenesít; `curve`: 7 s-onként 1 s-os ±0,9 útkanyar; `random`: 0,7 s-onként véletlen kormány ±1;
 * `brake-early`: a kérdés után 0,3 s-mal fékez (vagy `reverse`: tolat), és `releaseSec`-kor enged el (az olvasási küszöb előtt
 * kezdett, akár tovább tartott fék / tolatás — akadály).
 * A vak ellenőrzés K1-lelete után (J7b döntések 33.) az olvasási küszöb UTÁN kezdett akadály-fék is: `brake-periodic` — a
 * kérdéstől függetlenül `periodSec`-enként `holdSec`-ig fékez; `brake-after` — a kérdés megjelenése után `atSec`-kor `holdSec`-ig.
 * Kérdés nélkül a tölcsér felé tart; nyitott elágazás alatt egyenesen halad (a kormányhoz nem nyúl), vagy `chase`: akkor is a
 * tölcsér felé kormányoz (a kérdést nem olvasó üldöző);
 * `swerve`: a fék elengedése után ~2,4 egységes kitérés és vissza (az akadály kikerülése).
 */
export type SimDrivePattern =
  | { kind: "wobble"; amp: number }
  | { kind: "turn-straighten" }
  | { kind: "curve" }
  | { kind: "random" }
  | { kind: "brake-early"; releaseSec: number; reverse?: boolean }
  | { kind: "brake-periodic"; periodSec: number; holdSec: number; swerve?: boolean; chase?: boolean }
  | { kind: "brake-after"; atSec: number; holdSec: number; swerve?: boolean; chase?: boolean };

/** A `swerve` kitérés kormánya a fék elengedése óta eltelt idő (s) szerint: ki, vissza, át, vissza (nettó oldaltáv ≈ 0). */
function swerveSteer(sinceRelease: number): number {
  if (sinceRelease < 0 || sinceRelease >= 2) return 0;
  return sinceRelease < 0.5 || sinceRelease >= 1.5 ? 0.3 : -0.3;
}

export function createSimGame(opts: {
  seed: number;
  grade: number;
  questions: boolean;
  material?: readonly FourChoiceQuiz[];
  /** A bot tempója (világegység / s; alap `BOT_SPEED`) — a „minden sebességnél” mérésekhez. */
  botSpeed?: number;
  /** Mérés: a bot soha nem nyúl a vezérlőhöz a kérdések alatt (B1: a passzív átlépés nem válasz). */
  passive?: boolean;
  /** Mérés: nem olvasó vezetési minta a `passive` bothoz (a kérdés alatt is fut). */
  drive?: SimDrivePattern;
  /**
   * Az elágazás megválaszolásának útja (J7b döntések 25.): `brake` (alap) — az olvasási küszöb után fékez (rögzít), és a
   * választott kapun hajt át; `tap` — a táblára koppint (közvetlen válasz, mint a lapon).
   */
  answerBy?: "brake" | "tap";
}): TornadoSim {
  const botSpeed = opts.botSpeed ?? BOT_SPEED;
  const level = levelForGrade(opts.grade);
  const spec = levelSpec(level);
  const director = createQuestionDirector({
    config: tornadoDirectorConfig(opts.grade),
    provider: simProvider(opts.seed, opts.material ?? []),
    review: createReviewQueue(null),
    rng: createRng(seedFrom(TORNADO_GAME_ID, opts.seed, "q")),
    startBand: 0.4,
    now: () => 0,
  });
  let driver: ChaseDriver | null = null;
  const ui = createQuestionUi({
    director: () => (opts.questions ? director : null),
    onView: () => {},
    onShow: (p) => driver!.core.onShow(p),
    onOutcome: (o, p) => driver!.core.onOutcome(o, p),
  });
  const world = createRng(seedFrom(TORNADO_GAME_ID, opts.seed, "world"));
  const tp: TornadoBody = { x: 0, z: 0, angle: world.next() * Math.PI * 2, born: 0 };
  const car = { x: 0, z: fromKm(START_DISTANCE_KM), heading: Math.PI, speed: 0 };
  let elapsed = 0;
  let anchored = false;
  let anchoredKm = 0;
  let holdUntil = 0;
  let won = false;
  let lost = false;
  let attempts = 1;
  let correct = 0;
  let wrong = 0;
  let score = 0;
  let choice: { id: number; option: number } | null = null;
  let padTry = true;
  let roll = 0;
  const tally = { junctions: 0, frozen: 0, frozenTimeouts: 0, turbos: 0, detours: 0, nitros: 0, anchorQuestions: 0 };

  const distKm = () => toKm(Math.hypot(car.x - tp.x, car.z - tp.z));
  /** A bot fék- / tolatás-bemenete ebben a lépésben — a mag ebből látja a rögzítő szándékot (felfutó él). */
  let brakeOut = false;
  let reverseOut = false;
  /** A nyitott elágazás megjelenésének ideje (mag-óra) és kérdés-azonosítója — a vezetési mintákhoz és a fék-időzítéshez. */
  let jShownAt = 0;
  let jSeen = -1;
  const driveRng = createRng(seedFrom(TORNADO_GAME_ID, opts.seed, "drive")).next;
  let randomSteer = 0;
  let randomAt = 0;
  /** A `brake-periodic` / `brake-after` minta: a fék legutóbbi elengedése óta eltelt idő (s; negatív = nincs kitérés). */
  let sinceBrakeRelease = -1;
  const steerTo = (tx: number, tz: number, dt: number) => {
    const want = Math.atan2(tx - car.x, -(tz - car.z));
    const diff = ((want - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = Math.max(-BOT_TURN * dt, Math.min(BOT_TURN * dt, diff));
    car.heading += turn;
  };
  /** A nem olvasó vezető kormánya (−1..1) a tölcsér felé tartó alapkormányra ültetve; hamis, ha nincs minta (akkor a bot maga kormányoz). */
  const patternSteer = (dt: number): boolean => {
    const dp = opts.drive;
    if (!dp || dp.kind === "brake-early") return false;
    if (dp.kind === "brake-periodic" || dp.kind === "brake-after") {
      // Kérdés nélkül a tölcsér felé tart; nyitott elágazás alatt egyenesen halad (`chase`: akkor is a tölcsér felé, mint a
      // kérdést nem olvasó üldöző). A kitérés az akadály kikerülése.
      if (dp.chase || !driver!.core.junction()) steerTo(tp.x, tp.z, dt);
      if (dp.swerve) car.heading += swerveSteer(sinceBrakeRelease) * BOT_TURN * dt;
      return true;
    }
    const want = Math.atan2(tp.x - car.x, -(tp.z - car.z));
    const diff = ((want - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const sinceQ = (driver!.core.clockMs() - jShownAt) / 1000;
    let st = Math.max(-1, Math.min(1, diff * 2));
    if (dp.kind === "wobble") st = Math.max(-1, Math.min(1, st + dp.amp * Math.sin(elapsed * 1.7)));
    else if (dp.kind === "turn-straighten") st = driver!.core.junction() && sinceQ < 1.5 ? 0.9 : st;
    else if (dp.kind === "curve") st = elapsed % 7 < 1 ? 0.9 * (Math.floor(elapsed / 7) % 2 === 0 ? 1 : -1) : st;
    else if (dp.kind === "random") {
      if (elapsed >= randomAt) {
        randomAt = elapsed + 0.7;
        randomSteer = driveRng() * 2 - 1;
      }
      st = randomSteer;
    }
    car.heading += st * BOT_TURN * dt;
    return true;
  };


  const physics = (dt: number): VehicleSample & { hold: boolean } => {
    const core = driver!.core;
    for (const e of core.drainEvents()) {
      if (e.kind === "junction") tally.junctions += 1;
      else if (e.kind === "junction-frozen") tally.frozen += 1;
      else if (e.kind === "pad-free") tally.nitros += 1;
      else if (e.kind === "junction-done") {
        if (e.frozen && e.result === "timeout") tally.frozenTimeouts += 1;
        const sec = detourWithGrace(e.detourSec, spec.tornadoLifetime - tp.born, spec.timeLimit - elapsed);
        if (sec > 0) {
          tally.detours += 1;
          elapsed += sec;
          tp.born += sec;
        }
        if (e.nitroMs > 0) tally.nitros += 1;
      } else if (e.kind === "turbo-done") {
        tally.turbos += 1;
        if (e.nitroMs > 0) tally.nitros += 1;
      } else if (e.kind === "pad") padTry = roll < 1;
      else if (e.kind === "anchor-answer") {
        if (e.result === "correct" && !anchored) {
          anchored = true;
          anchoredKm = distKm();
          holdUntil = elapsed + ANCHOR_HOLD_BASE_MS / 1000;
        } else if (e.result === "wrong" || e.result === "timeout") attempts += 1;
      }
      if (e.kind === "junction-done" || e.kind === "turbo-done" || e.kind === "anchor-answer") {
        if (e.result === "correct") correct += 1;
        else if (e.result === "wrong" || e.result === "timeout") wrong += 1;
      }
    }
    const over = won || lost;
    const openJ = core.junction();
    if (openJ && openJ.questionId !== jSeen) {
      jSeen = openJ.questionId;
      jShownAt = core.clockMs();
    }
    brakeOut = false;
    reverseOut = false;
    const sinceShow = core.clockMs() - jShownAt;
    if (opts.drive?.kind === "brake-early" && openJ) {
      const on = sinceShow >= 300 && sinceShow < opts.drive.releaseSec * 1000;
      if (opts.drive.reverse) reverseOut = on;
      else brakeOut = on;
    }
    if (opts.drive?.kind === "brake-periodic") {
      const { periodSec, holdSec } = opts.drive;
      const phase = elapsed % periodSec;
      brakeOut = phase < holdSec;
      sinceBrakeRelease = brakeOut ? -1 : phase - holdSec;
    } else if (opts.drive?.kind === "brake-after") {
      const { atSec, holdSec } = opts.drive;
      const t = sinceShow / 1000;
      brakeOut = openJ !== null && t >= atSec && t < atSec + holdSec;
      sinceBrakeRelease = openJ !== null && t >= atSec + holdSec ? t - atSec - holdSec : -1;
    }
    const anchorAsking = (() => {
      const act = ui.active();
      return (act !== null && core.kindOf(act.id) === "anchor") || (ui.view().reveal !== null && ui.view().presentation !== null && core.kindOf(ui.view().presentation!.id) === "anchor");
    })();
    if (!over) {
      elapsed += dt;
      advanceTornado(tp, spec, dt);
      const inBand = anchorBandState(distKm(), spec.anchorBand) === "in_band";
      if (anchored) {
        car.speed = 0;
        if (elapsed >= holdUntil) {
          won = true;
          score = winReward({ level, secondsUsed: elapsed, anchorAttempts: attempts, peakWind: spec.windPeak, anchoredDistanceKm: anchoredKm, correctAnswers: correct, wrongAnswers: wrong }).score;
        }
      } else if (inBand) {
        car.speed = 0;
        const act = ui.active();
        if (!opts.questions) {
          anchored = true;
          anchoredKm = distKm();
          holdUntil = elapsed + ANCHOR_HOLD_BASE_MS / 1000;
        } else if (!act || core.kindOf(act.id) !== "anchor") {
          if (core.requestAnchor()) tally.anchorQuestions += 1;
        }
      } else {
        const j = core.junction();
        const pad = core.pad();
        if (patternSteer(dt)) {
          // Nem olvasó vezető: a minta kormányoz a kérdés alatt is (J7b döntések 29.).
        } else if (j) {
          if (choice && choice.id === j.questionId) {
            if (j.frozen) {
              // A tábla felé (közvetlenül a kapupont mögé) kormányoz — a keresztezésnek a kapu folyosóján kell lennie (33.).
              const g = gatePoint(j, choice.option);
              steerTo(g.x + j.fx * 3, g.z + j.fz * 3, dt);
            } else if (sinceShow >= INTENT_MIN_READ_MS + 20) {
              // J7b döntések 25.: az olvasási küszöb után fékez (rögzít), utána a kormány visz a kapuhoz.
              brakeOut = !core.intentSeen();
            }
          }
        } else if (pad && padTry && !opts.passive) steerTo(pad.x, pad.z, dt);
        else steerTo(tp.x, tp.z, dt);
        car.speed = botSpeed * (core.nitroLeftMs() > 0 ? NITRO_SPEED_FACTOR : 1);
        car.x = clampToWorld(car.x + Math.sin(car.heading) * car.speed * dt);
        car.z = clampToWorld(car.z - Math.cos(car.heading) * car.speed * dt);
      }
      // K3 (J7b döntések 18.): horgony-kérdés alatt a vereség feltétele nem teljesülhet.
      if (!anchored && !anchorAsking && (tp.born > spec.tornadoLifetime || elapsed > spec.timeLimit)) lost = true;
    }
    // A passzív bot (B1-mérés) szándékosan semmit nem jelez; a `brake-early` minta fékje / tolatása a megjelenés utáni 1 s-on belül indul.
    return { ...car, brake: brakeOut, reverse: reverseOut, hold: anchored || anchorBandState(distKm(), spec.anchorBand) === "in_band" };
  };
  driver = createChaseDriver({
    seed: opts.seed,
    questions: {
      frame: (c, ctx) => ui.frame(c, ctx),
      request: (reason, c) => ui.request(reason, c),
      pick: (i, c) => ui.pick(i, c),
      active: () => ui.active(),
      abort: () => ui.abort(),
      canAsk: () => ui.canAsk(),
      pending: () => ui.view().pending !== null,
    },
    physics,
  });
  const d = driver;
  let wall = 0;

  return {
    step(dtMs, input) {
      roll = input.skillRoll;
      if (won || lost) {
        if (!ui.finished()) ui.finish();
        return;
      }
      wall += dtMs;
      d.frame(wall);
      if ((won || lost) && !ui.finished()) ui.finish();
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal) return null;
      return { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length };
    },
    answer(id, option) {
      const p = ui.active();
      if (!p || p.id !== id) return;
      if (opts.passive) return;
      const j = d.core.junction();
      // 33.: a középső (egyenes) kapu csak koppintással választható — azt a bot is koppintással választja, mint a gyerek.
      if (d.core.kindOf(id) === "junction" && opts.answerBy !== "tap" && j && gateDrivable(j, option)) {
        choice = { id, option }; // fék (rögzítés) után a választott oldalsó kapu felé kormányoz; a válasz az áthajtás
        return;
      }
      ui.pick(option, d.core.clockMs());
    },
    done: () => won || lost,
    won: () => won,
    stats: () => director.stats(d.core.clockMs()),
    simTimeMs: () => d.core.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
    tally: () => ({ ...tally, score }),
    fingerprint: () =>
      [car.x, car.z, car.heading, tp.x, tp.z, elapsed].map((n) => n.toFixed(4)).join("|") + `|${won ? 1 : 0}${lost ? 1 : 0}|${correct}/${wrong}|${score}`,
  };
}
