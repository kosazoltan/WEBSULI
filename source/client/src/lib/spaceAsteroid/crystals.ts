/**
 * Galaktikus Aszteroida — a Kristály-válasz tiszta magja (végrehajtás J6a; terv 5.6 „Q1 Kristály-válasz”).
 *
 * A kérdés a játék világában érkezik: 3–4 feliratozott kristály-aszteroida lebeg be a felső sávba (a játékos fölé, a
 * képernyő felső harmadába), és a válasz maga a célpont — a helyes kristály kilövése fejlesztést ad, a rossz kristály
 * apró sziklákra hasad (veszély, nem menetvég). A kristályok lassan, a saját „sávjukban” lebegnek, ezért soha nem
 * fedik egymást (a mobil mérő M2 pontja: a válaszcélok nem takarhatják egymást), és soha nem érnek a játékos mozgássávjába.
 *
 * Tiszta TypeScript: nincs DOM, three.js, React, óra, `Math.random` (őr: `T/game-sim-determinism-guard.test.ts`, KSZ-1/2).
 * A lap rajzol és vetít; a node-szimuláció (`sim.ts`) ugyanezt a modult hívja. A célzássegéd (`aimAssist.ts`) a kristályokra
 * NEM vonatkozik (U-J6-1): a lap a célzássegédnek csak az ellenfeleket adja át — a kristály kiválasztása a játékosé.
 */

import { GAME_H, PLAYER_Y_MAX, type RockShard } from "./physics";

/** A kristály látványának sugara (játékegység). */
export const CRYSTAL_RADIUS = 0.9;
/** A találati gömb a látványnál nagyobb (KSZ-12: +15–25%): megbocsátóbb a célzás ujjal. */
export const CRYSTAL_HIT_FACTOR = 1.2;
/** A kristályok és a játékos mozgássávja (`PLAYER_Y_MAX`) közti legkisebb függőleges hézag. */
export const CRYSTAL_PLAYER_GAP = 3.2;
/** Lebegés: a sávon belüli vízszintes / függőleges kitérés felső korlátja (játékegység). */
export const CRYSTAL_DRIFT_X = 0.7;
export const CRYSTAL_DRIFT_Y = 0.45;
/** A rossz kristályból ennyi apró szikla hasad. */
export const CRYSTAL_SHARD_COUNT = 3;
/** A hasadék-szikla kezdő lefelé sebessége (egység / mp, a játékos felé): a veszély látható, de kitérhető. */
export const CRYSTAL_SHARD_VY_MIN = -3.4;
export const CRYSTAL_SHARD_VY_MAX = -2.4;

/** A kristályzóna a játéksíkon (világkoordináta). */
export type CrystalBounds = { minX: number; maxX: number; minY: number; maxY: number };

export type Crystal = {
  /** Menetenként / kérdésenként egyedi azonosító (a bemutatott kérdés azonosítójából és az opció-indexből). */
  id: number;
  /** A `QuestionPresentation.options` indexe — ez a válasz. */
  optionIndex: number;
  /** Az opció felirata (a lap a DOM-gombra írja). */
  label: string;
  /** A tárolt helyes / rossz jelölés (a `hitCrystal` ebből ítél; a lap a megoldás-kijelzéshez is ezt olvassa). */
  correct: boolean;
  x: number;
  y: number;
  /** A sáv közepe, amely körül a kristály lebeg. */
  homeX: number;
  homeY: number;
  /** A lebegés fázisa (rad), fázis-eltolás és kitérés — seedelt. */
  phase: number;
  driftX: number;
  driftY: number;
  /** false: már eltalálták (egyszer lehet válaszolni). */
  alive: boolean;
};

export type CrystalPresentation = {
  id: number;
  options: ReadonlyArray<{ label: string; correct: boolean }>;
};

/** A hasadék-sziklák helyi alakja (a lap `EnemyState`-té alakítja). */
export type CrystalShard = RockShard;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * A kristályzóna a játéktér szélességéből: `halfWidth` a LÁTHATÓ félszélesség a játéksíkon (kamera), `top` / `bottom` a
 * zóna alsó / felső pereme. A zóna alja soha nem lehet a játékos mozgássávja fölött `CRYSTAL_PLAYER_GAP`-nál közelebb,
 * a teteje a pálya tetején belül marad.
 */
export function crystalBounds(args: { halfWidth: number; minY: number; maxY: number; margin?: number }): CrystalBounds {
  const margin = args.margin ?? 0.4;
  const half = Number.isFinite(args.halfWidth) && args.halfWidth > 0 ? args.halfWidth : 9;
  const floor = PLAYER_Y_MAX + CRYSTAL_PLAYER_GAP + CRYSTAL_RADIUS;
  const minY = Math.max(args.minY, floor);
  const maxY = Math.max(minY, Math.min(args.maxY, GAME_H / 2 - CRYSTAL_RADIUS));
  const side = Math.max(CRYSTAL_RADIUS * 2, half - margin);
  return { minX: -side, maxX: side, minY, maxY };
}

/**
 * 3–4 kristály a kérdés opcióiból: az opció-sorrend a director által seedelten kevert sorrend, a sávok balról jobbra
 * követik. Páros / páratlan sávok váltakozó magasságon (a feliratok így sem fedik egymást keskeny nézetben), a lebegés
 * fázisa és kitérése seedelt. A kitérés sávon belül marad: két szomszéd kristály közepe soha nincs `2 × sugár`-nál közelebb.
 */
export function spawnCrystals(presentation: CrystalPresentation, bounds: CrystalBounds, rng: () => number): Crystal[] {
  const n = presentation.options.length;
  if (n < 2) return [];
  const width = bounds.maxX - bounds.minX;
  const lane = width / n;
  const driftX = Math.max(0, Math.min(CRYSTAL_DRIFT_X, lane / 2 - CRYSTAL_RADIUS * 1.15));
  const height = Math.max(0, bounds.maxY - bounds.minY);
  const driftY = Math.min(CRYSTAL_DRIFT_Y, height / 4);
  const rowLow = bounds.minY + driftY;
  const rowHigh = bounds.maxY - driftY;
  const out: Crystal[] = [];
  for (let i = 0; i < n; i++) {
    const opt = presentation.options[i]!;
    const homeX = bounds.minX + lane * (i + 0.5);
    const homeY = i % 2 === 0 ? rowHigh : rowLow;
    const c: Crystal = {
      id: presentation.id * 8 + i,
      optionIndex: i,
      label: opt.label,
      correct: opt.correct,
      x: homeX,
      y: homeY,
      homeX,
      homeY,
      phase: rng() * Math.PI * 2,
      driftX: driftX * (0.55 + 0.45 * rng()),
      driftY: driftY * (0.55 + 0.45 * rng()),
      alive: true,
    };
    placeCrystal(c);
    out.push(c);
  }
  return out;
}

/** A kristály helye a fázisából: a sáv közepe + lassú, egymástól független 8-as mozgás (korlátos kitérés). */
function placeCrystal(c: Crystal): void {
  c.x = c.homeX + c.driftX * Math.sin(c.phase);
  c.y = c.homeY + c.driftY * Math.sin(c.phase * 1.45 + 0.7);
}

/** Lépteti a lebegést (`dtSec` játékidő). */
export function stepCrystals(crystals: Crystal[], dtSec: number): void {
  if (!(dtSec > 0)) return;
  for (const c of crystals) {
    if (!c.alive) continue;
    // A fázis tolódik, a hely a fázisból jön: nincs állapot-torzulás hosszú futásnál, és a kitérés korlátos marad.
    c.phase += dtSec * 0.55;
    placeCrystal(c);
  }
}

export type CrystalHit = { crystal: Crystal; correct: boolean };

/**
 * A kristály-azonosító szerinti találat: a helyes választ a kristály maga hordozza, a modul semmit nem kérdez vissza.
 * Idempotens: ugyanarra a kristályra a második hívás `null` (két ujj / két lövedék egy képkockában — csak az első számít,
 * K.2). A találat után a kristály `alive = false`.
 */
export function hitCrystal(crystals: Crystal[], id: number): CrystalHit | null {
  const c = crystals.find((x) => x.id === id);
  if (!c || !c.alive) return null;
  c.alive = false;
  return { crystal: c, correct: c.correct };
}

/** Az élő kristály, amelynek (megnagyobbított) találati gömbjébe esik a pont — lövedék-ütközés. */
export function crystalAt(crystals: readonly Crystal[], x: number, y: number, bulletRadius = 0.12): Crystal | null {
  const r = CRYSTAL_RADIUS * CRYSTAL_HIT_FACTOR + bulletRadius;
  let best: Crystal | null = null;
  let bestD = Infinity;
  for (const c of crystals) {
    if (!c.alive) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    const d = dx * dx + dy * dy;
    if (d < r * r && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * A rossz kristály hasadéka: `CRYSTAL_SHARD_COUNT` apró (1-es méretű) szikla, a hajó felé hullva. A `splitRock`
 * mintájára (`physics.ts`): egymástól szétnyíló vízszintes sebesség, a lefelé sebesség alulról korlátos.
 */
export function crystalShards(at: { x: number; y: number }, rng: () => number): CrystalShard[] {
  const out: CrystalShard[] = [];
  for (let k = 0; k < CRYSTAL_SHARD_COUNT; k++) {
    const side = k - (CRYSTAL_SHARD_COUNT - 1) / 2; // -1, 0, 1
    out.push({
      x: at.x + side * 0.45,
      y: at.y - 0.2 - Math.abs(side) * 0.15,
      vx: side * (1.5 + rng() * 0.8) + (rng() - 0.5) * 0.6,
      vy: clamp(CRYSTAL_SHARD_VY_MIN + rng() * (CRYSTAL_SHARD_VY_MAX - CRYSTAL_SHARD_VY_MIN), CRYSTAL_SHARD_VY_MIN, CRYSTAL_SHARD_VY_MAX),
      size: 1,
    });
  }
  return out;
}
