/**
 * J7b — Tornado Hunter 200: útelágazás (Q1) és turbópad (Q3) geometriája és ütemezése (terv 5.7; végrehajtás J7b,
 * „J7b döntések” 1–3.). Tiszta modul: nincs DOM, three.js, React, óra és `Math.random` — a véletlent a hívó seedelt
 * RNG-je adja (`createRng`), így a lap és a node-szimuláció (`sim.ts`) ugyanazt a pályát kapja.
 *
 * Elágazás = „virtuális kapu” (U-J7-2: a `world.ts`-ben nincs út-gráf): a kérdés megjelenésekor a jármű előtt, a
 * menetirányra merőleges vonalon három kapu áll (bal / egyenes / jobb). A választás az áthajtás oldaliránya: ahol a
 * jármű a vonalat keresztezi, az a szektor (kapu) a válasz. A kapuk sorrendje a kérdés-sáv opcióinak sorrendje
 * (0 = bal) — a director seedelten kever, így a helyes kapu helye véletlen (a tornádó felé kormányzás nem árulja el).
 *
 * Irány-konvenció (a lap `PlayerState`-je): `heading` radián, 0 = észak (−Z), az óramutató járásával nő; előre
 * (sin h, −cos h), jobbra (cos h, sin h).
 */

/** Két szomszédos kapu oldaltávolsága (világegység; a jármű ~2,5 széles, az út fél-szélessége 9). */
export const JUNCTION_GATE_SPACING = 20;
/** A kapuvonal legkisebb / legnagyobb távolsága a kérdés megjelenésekor. */
export const JUNCTION_LINE_MIN = 30;
export const JUNCTION_LINE_MAX = 110;
/** A kapuvonal a válaszablak ennyiedrészénél érhető el a pillanatnyi sebességgel (marad idő dönteni és kormányozni). */
export const JUNCTION_LINE_WINDOW_SHARE = 0.85;
/** Két elágazás INDÍTÁSA között legalább ennyi menetidő (seedelten 15–20 mp, terv 5.7 / végrehajtás J7b 2.). */
export const JUNCTION_GAP_MIN_MS = 15_000;
export const JUNCTION_GAP_MAX_MS = 20_000;
/** A rossz út kerülője: ennyi másodperc (seedelt) a menet órájából és a tölcsér élettartamából. */
export const DETOUR_MIN_SEC = 8;
export const DETOUR_MAX_SEC = 12;
/** Turbópad: két pad között ennyi menetidő (seedelten 25–30 mp, végrehajtás J7b 4.). */
export const TURBO_GAP_MIN_MS = 25_000;
export const TURBO_GAP_MAX_MS = 30_000;
/** A pad ennyivel a jármű előtt jelenik meg, ekkora sugarú körben érhető el, és ennyi idő után eltűnik. */
export const TURBO_PAD_AHEAD = 45;
export const TURBO_PAD_RADIUS = 9;
export const TURBO_PAD_LIFE_MS = 12_000;
/** Jó válasz (elágazás / turbó) jutalma: ennyi ideig nitró. */
export const NITRO_MS = 3_000;
/** Nitró alatt a végsebesség és a gyorsulás szorzója. */
export const NITRO_SPEED_FACTOR = 1.35;
export const NITRO_ACCEL_FACTOR = 1.6;

export type Rand = () => number;

export type Pose = { x: number; z: number; heading: number };

export type Junction = {
  /** A kérdés-sáv `presentation.id`-je: a kapu ehhez a kérdéshez tartozik. */
  questionId: number;
  /** A kérdés megjelenésekori jármű-pozíció (a vonal távolságának kiindulópontja). */
  ox: number;
  oz: number;
  /** Előre- és jobbra-mutató egységvektor. */
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  /** A kapuvonal távolsága az origótól (világegység). */
  line: number;
  /** A kapuk (= opciók) száma, 2..4. */
  gates: number;
  /** Ennyi másodperc a kerülő ára, ha rossz kapun hajt át (seedelt, a kérdés megjelenésekor sorsolt). */
  detourSec: number;
};

export type TurboPad = { x: number; z: number; expiresAtMs: number };

function lerp(min: number, max: number, u: number): number {
  const t = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  return min + (max - min) * t;
}

/** A kapuvonal távolsága: |sebesség| × ablak × 0,85, a [30; 110] sávba vágva (álló járműnél is van elérhető vonal). */
export function junctionLineDistance(speed: number, windowMs: number): number {
  const v = Number.isFinite(speed) ? Math.abs(speed) : 0;
  const w = Number.isFinite(windowMs) ? Math.max(0, windowMs) : 0;
  return Math.min(JUNCTION_LINE_MAX, Math.max(JUNCTION_LINE_MIN, v * (w / 1000) * JUNCTION_LINE_WINDOW_SHARE));
}

/** Seedelt 15–20 mp a következő elágazás indításáig. */
export function nextJunctionGapMs(rng: Rand): number {
  return Math.round(lerp(JUNCTION_GAP_MIN_MS, JUNCTION_GAP_MAX_MS, rng()));
}

/** Seedelt 8–12 mp kerülő (egész másodperc, hogy a felirat és a hatás ugyanaz legyen). */
export function detourSeconds(rng: Rand): number {
  return Math.round(lerp(DETOUR_MIN_SEC, DETOUR_MAX_SEC, rng()));
}

/** Seedelt 25–30 mp a következő turbópadig. */
export function nextTurboGapMs(rng: Rand): number {
  return Math.round(lerp(TURBO_GAP_MIN_MS, TURBO_GAP_MAX_MS, rng()));
}

export function planJunction(args: {
  pose: Pose;
  speed: number;
  windowMs: number;
  questionId: number;
  optionCount: number;
  rng: Rand;
}): Junction {
  const h = args.pose.heading;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  return {
    questionId: args.questionId,
    ox: args.pose.x,
    oz: args.pose.z,
    fx,
    fz,
    rx: -fz,
    rz: fx,
    line: junctionLineDistance(args.speed, args.windowMs),
    gates: Math.max(2, Math.min(4, Math.round(args.optionCount))),
    detourSec: detourSeconds(args.rng),
  };
}

/** Az `i`. kapu oldaliránya a középvonaltól (negatív = bal); 3 kapunál −20 / 0 / +20. */
export function gateOffset(j: Pick<Junction, "gates">, i: number): number {
  return (i - (j.gates - 1) / 2) * JUNCTION_GATE_SPACING;
}

/** Az `i`. kapu világpontja a kapuvonalon (a táblák helye). */
export function gatePoint(j: Junction, i: number): { x: number; z: number } {
  const off = gateOffset(j, i);
  return { x: j.ox + j.fx * j.line + j.rx * off, z: j.oz + j.fz * j.line + j.rz * off };
}

/** Előre- és oldalirányú koordináta a kapu kiindulópontjához képest. */
export function junctionLocal(j: Junction, x: number, z: number): { forward: number; lateral: number } {
  const dx = x - j.ox;
  const dz = z - j.oz;
  return { forward: dx * j.fx + dz * j.fz, lateral: dx * j.rx + dz * j.rz };
}

/** Melyik kapu szektorába esik az oldalirány (a legközelebbi kapu; a szélső szektor a végtelenig tart). */
export function sectorFor(j: Pick<Junction, "gates">, lateral: number): number {
  const raw = Math.round(lateral / JUNCTION_GATE_SPACING + (j.gates - 1) / 2);
  return Math.max(0, Math.min(j.gates - 1, raw));
}

/**
 * Áthajtott-e a jármű a kapuvonalon ebben a lépésben (előző → mostani pozíció)? Ha igen, a keresztezés pontjának
 * szektora (= opció-index), különben null. Csak előre irányú áthaladás számít (visszafelé tolatva nem választ).
 */
export function junctionCrossing(j: Junction, prev: { x: number; z: number }, cur: { x: number; z: number }): number | null {
  const a = junctionLocal(j, prev.x, prev.z);
  const b = junctionLocal(j, cur.x, cur.z);
  if (!(a.forward < j.line && b.forward >= j.line)) return null;
  const span = b.forward - a.forward;
  const t = span > 0 ? (j.line - a.forward) / span : 1;
  return sectorFor(j, a.lateral + (b.lateral - a.lateral) * t);
}

export function planTurboPad(pose: Pose, nowMs: number): TurboPad {
  return {
    x: pose.x + Math.sin(pose.heading) * TURBO_PAD_AHEAD,
    z: pose.z - Math.cos(pose.heading) * TURBO_PAD_AHEAD,
    expiresAtMs: nowMs + TURBO_PAD_LIFE_MS,
  };
}

export function padReached(pad: TurboPad, x: number, z: number): boolean {
  return Math.hypot(x - pad.x, z - pad.z) <= TURBO_PAD_RADIUS;
}

/**
 * Az elágazás kimenetének játékbeli hatása (terv 5.7 Q1: a helyes úton rövidítés + turbó, a rosszon kerülő): a
 * menet órája és a tölcsér élettartama ennyi másodperccel lép előre (`detourSec`), és ennyi ms nitró jár (`nitroMs`).
 * Lejárat (nem hajtott át egyik kapun sem) és megszakítás: nincs külön hatás.
 */
export function junctionEffect(result: "correct" | "wrong" | "timeout" | "aborted", j: Pick<Junction, "detourSec">): { nitroMs: number; detourSec: number } {
  if (result === "correct") return { nitroMs: NITRO_MS, detourSec: 0 };
  if (result === "wrong") return { nitroMs: 0, detourSec: j.detourSec };
  return { nitroMs: 0, detourSec: 0 };
}
