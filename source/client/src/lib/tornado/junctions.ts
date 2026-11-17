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
 * J7b döntések 12–14 (a független ellenőrzés után): a táblák „várnak” — a megjelenéskori menetirányban a jármű előtt
 * állandó távolságban haladnak vele (`slideJunction`), amíg a gyerek szándékot nem jelez; akkor rögzülnek (`freezeJunction`)
 * olyan helyen, ahová mindhárom kapuhoz ütközőmentes folyosó vezet, és a döntés után mindig ~3 s marad a kormányzásra.
 * Csak rögzült kapun át lehet választani (szándék nélküli átlépés nincs).
 *
 * Irány-konvenció (a lap `PlayerState`-je): `heading` radián, 0 = észak (−Z), az óramutató járásával nő; előre
 * (sin h, −cos h), jobbra (cos h, sin h).
 */

import type { Collider } from "./collision";
import { HALF_WORLD } from "./world";

/** Két szomszédos kapu oldaltávolsága (világegység; a jármű ~2,5 széles, az út fél-szélessége 9) — alapérték. */
export const JUNCTION_GATE_SPACING = 16;
/** Ha az alap köz egy akadály miatt nem szabad, ezekkel próbálkozunk. */
export const JUNCTION_SPACINGS: readonly number[] = [16, 13, 20];
/** A rögzülés után a vonalig ennyi idő marad a pillanatnyi sebességgel (+ `JUNCTION_FREEZE_EXTRA` egység). */
export const JUNCTION_STEER_SEC = 2.2;
export const JUNCTION_FREEZE_EXTRA = 4;
/** A rögzülő vonal legkisebb távolsága (lassan a kormányzás rövidebb úton is kifér). */
export const JUNCTION_FREEZE_MIN = 14;
/** Várakozó (nem rögzült) táblák távolsága: ugyanez a képlet, legalább 40 egység. */
export const JUNCTION_SLIDE_MIN = 40;
/** A rögzülési hely keresése: a vonal ennyivel tolható ki. */
export const JUNCTION_FREEZE_SEARCH: readonly number[] = [0, 8, 16, 24, 32, 40, 48];
/** A folyosó-ellenőrzés: a jármű fél szélessége + biztonsági ráhagyás. */
export const CORRIDOR_HALF_WIDTH = 1.8;
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

/** A pálya széle (a `clampToWorld` határa, kis ráhagyással). */
const WORLD_EDGE = HALF_WORLD - 6;

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
  /** Két szomszédos kapu oldaltávolsága. */
  spacing: number;
  /** Rögzült-e (csak rögzült kapun át lehet választani — J7b döntések 12–13.). */
  frozen: boolean;
  /** Ennyi másodperc a kerülő ára, ha rossz kapun hajt át (seedelt, a kérdés megjelenésekor sorsolt). */
  detourSec: number;
  /**
   * Az időcsík teljes hossza (ms) a rögzülés után (J7b döntések 27.): a csík a rögzüléskor ugyanott áll, és simán a meghosszabbított
   * határidőn fogy el. 0 = a kérdés saját ablaka.
   */
  barWindowMs: number;
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
    line: slideLineDistance(args.speed),
    gates: Math.max(2, Math.min(4, Math.round(args.optionCount))),
    spacing: JUNCTION_GATE_SPACING,
    frozen: false,
    detourSec: detourSeconds(args.rng),
    barWindowMs: 0,
  };
}

/** A rögzülő vonal távolsága a pillanatnyi sebességből (nitróval együtt): |v| × 2,2 s + 4, legalább 14. */
export function freezeLineDistance(speed: number): number {
  const v = Number.isFinite(speed) ? Math.abs(speed) : 0;
  return Math.max(JUNCTION_FREEZE_MIN, v * JUNCTION_STEER_SEC + JUNCTION_FREEZE_EXTRA);
}
/** A várakozó táblák távolsága: ugyanez, legalább 40. */
export function slideLineDistance(speed: number): number {
  return Math.max(JUNCTION_SLIDE_MIN, freezeLineDistance(speed));
}

/** Várakozó táblák: az origó a jármű, az irány a megjelenéskori marad, a távolság a sebességgel nő (helyben módosít). */
export function slideJunction(j: Junction, pose: { x: number; z: number }, speed: number): void {
  if (j.frozen) return;
  j.ox = pose.x;
  j.oz = pose.z;
  j.line = slideLineDistance(speed);
}

function hitsCollider(c: Collider, x: number, z: number, r: number): boolean {
  if (c.kind === "circle") return Math.hypot(x - c.x, z - c.z) < c.r + r;
  const cos = Math.cos(c.rotation);
  const sin = Math.sin(c.rotation);
  const dx = x - c.x;
  const dz = z - c.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const qx = Math.max(-c.hx, Math.min(c.hx, lx));
  const qz = Math.max(-c.hz, Math.min(c.hz, lz));
  return Math.hypot(lx - qx, lz - qz) < r;
}

/** Akadály-próba: a szakasz mentén (≤ 2 egységenként) egy `radius` sugarú kör beleütközik-e egy ütközőbe. */
export function segmentBlocked(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  collidersAt: (x: number, z: number) => readonly Collider[],
  radius = CORRIDOR_HALF_WIDTH,
): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / 2));
  let cache: readonly Collider[] = [];
  let cacheAt = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (t * len - cacheAt > 4) {
      cache = collidersAt(x, z);
      cacheAt = t * len;
    }
    for (const c of cache) if (hitsCollider(c, x, z, radius)) return true;
  }
  return false;
}

/**
 * A táblák rögzítése a jármű pillanatnyi helyéről és MENETIRÁNYÁBÓL (R1: a középső kapu egyenesen előre van — a kanyar
 * vagy az úttartás utáni irány nem „választ”): a vonal |v| × 2,2 s + 4 (+0…48), a köz 16 / 13 / 20 — az első olyan
 * elrendezés, amelyben a jármű helyéről mindhárom kapuhoz (és 6 egységgel mögé) ütközőmentes egyenes folyosó vezet, és a
 * kapu a világon belül van. Ha nincs ilyen, `false` (a táblák tovább várnak). Helyben módosít.
 * R3: `attempt` megadásakor egy próba csak EGY vonal-távolságot néz (a keresés képkockák közé osztva, egy próba ≤ ~1 ms).
 */
export function freezeJunction(
  j: Junction,
  pose: { x: number; z: number; heading?: number },
  speed: number,
  collidersAt: (x: number, z: number) => readonly Collider[],
  attempt?: number,
): boolean {
  if (j.frozen) return true;
  const base = freezeLineDistance(speed);
  const h = pose.heading;
  const fx = h === undefined ? j.fx : Math.sin(h);
  const fz = h === undefined ? j.fz : -Math.cos(h);
  const extras = attempt === undefined ? JUNCTION_FREEZE_SEARCH : [JUNCTION_FREEZE_SEARCH[attempt % JUNCTION_FREEZE_SEARCH.length]!];
  for (const extra of extras) {
    for (const spacing of JUNCTION_SPACINGS) {
      const cand: Junction = { ...j, ox: pose.x, oz: pose.z, fx, fz, rx: -fz, rz: fx, line: base + extra, spacing };
      let ok = true;
      for (let i = 0; i < cand.gates && ok; i++) {
        const g = gatePoint(cand, i);
        if (Math.abs(g.x) > WORLD_EDGE || Math.abs(g.z) > WORLD_EDGE) ok = false;
        else if (segmentBlocked(pose.x, pose.z, g.x, g.z, collidersAt) || segmentBlocked(g.x, g.z, g.x + cand.fx * 6, g.z + cand.fz * 6, collidersAt)) ok = false;
      }
      if (ok) {
        Object.assign(j, cand, { frozen: true });
        return true;
      }
    }
  }
  return false;
}

/** Az `i`. kapu oldaliránya a középvonaltól (negatív = bal); 3 kapunál −20 / 0 / +20. */
export function gateOffset(j: Pick<Junction, "gates" | "spacing">, i: number): number {
  return (i - (j.gates - 1) / 2) * j.spacing;
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
export function sectorFor(j: Pick<Junction, "gates" | "spacing">, lateral: number): number {
  const raw = Math.round(lateral / j.spacing + (j.gates - 1) / 2);
  return Math.max(0, Math.min(j.gates - 1, raw));
}

/**
 * Áthajtott-e a jármű a kapuvonalon ebben a lépésben (előző → mostani pozíció)? Ha igen, a keresztezés pontjának
 * szektora (= opció-index), különben null. Csak előre irányú áthaladás számít (visszafelé tolatva nem választ).
 */
export function junctionCrossing(j: Junction, prev: { x: number; z: number }, cur: { x: number; z: number }): number | null {
  if (!j.frozen) return null;
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
