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
/**
 * A kristály KÖZÉPPONTJA legalább ennyivel a játékos legfelső hajó-helye (`PLAYER_Y_MAX`) fölött marad (a hajó orra +0,7, a
 * kristály fél magassága ~0,9): ha a zónának van helye, a kristály soha nem ér a hajó sávjába.
 */
export const CRYSTAL_FLOOR_CLEARANCE = 1.6;
/**
 * A zóna legkisebb magassága (játékegység ≈ 64 px): a kérdés-kártya alatti hely keskeny telefonon kicsi, hosszú kérdésnél
 * a zóna LEJJEBB csúszik (a hajó felső sávjába) — a gomb (≥ 48 px) és a lebegés mindig belefér.
 */
export const CRYSTAL_MIN_ZONE_HEIGHT = 3.0;
/**
 * Lebegés: a sávon belüli vízszintes / függőleges kitérés felső korlátja (játékegység). ALAPÉRTÉK 0: a válaszcél a
 * logikai helyén ÁLL — ujjal így könnyebb eltalálni / megérinteni, a kristályok soha nem fedik egymást, és a mobil mérők
 * (M2, a joystick-mérő) stabil dobozt várnak. A „lebegés” a NÉZETÉ: a 3D kristály ring és a gomb fénye lassan billeg
 * (csökkentett mozgásnál nem). A modul a nem nulla kitérést is helyesen kezeli (a tesztek mindkettőt mérik).
 */
export const CRYSTAL_DRIFT_X = 0;
export const CRYSTAL_DRIFT_Y = 0;
/**
 * Egy opció felirata legfeljebb ennyi karakter: a keskeny (360 px-es) nézetben a kristály-gomb ~76 px széles, a felirat ≤ 2
 * sor 12–14 px-en. A hosszabb feliratú tételt a forrás hátrébb sorolja (`asteroidDirectorConfig.promptFits`).
 */
export const CRYSTAL_LABEL_MAX_CHARS = 22;

/** Beférnek-e az opciók a kristály-feliratba (a forrás-választás szűrője; tiszta, olcsó). */
export function crystalLabelsFit(options: readonly string[]): boolean {
  return options.every((o) => o.length <= CRYSTAL_LABEL_MAX_CHARS);
}

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
 * A kristályzóna: `halfWidth` a LÁTHATÓ félszélesség a játéksíkon (kamera), `minY` / `maxY` a kért alsó / felső perem
 * (a lap a kérdés-kártya alatti sávot kéri). Az alsó perem nem lehet a hajó legfelső helye fölötti `CRYSTAL_FLOOR_CLEARANCE`
 * alatt — kivéve, ha ettől a zóna `minHeight`-nál alacsonyabb lenne: akkor a zóna a felső pereméből lefelé nyúlik.
 */
export function crystalBounds(args: { halfWidth: number; minY: number; maxY: number; margin?: number; minHeight?: number }): CrystalBounds {
  const margin = args.margin ?? 0.4;
  const minHeight = args.minHeight ?? CRYSTAL_MIN_ZONE_HEIGHT;
  const half = Number.isFinite(args.halfWidth) && args.halfWidth > 0 ? args.halfWidth : 9;
  const floor = PLAYER_Y_MAX + CRYSTAL_FLOOR_CLEARANCE;
  const top = Math.min(Number.isFinite(args.maxY) ? args.maxY : 6, GAME_H / 2 - CRYSTAL_RADIUS);
  let bottom = Math.max(Number.isFinite(args.minY) ? args.minY : 0, floor);
  if (top - bottom < minHeight) bottom = top - minHeight;
  const side = Math.max(CRYSTAL_RADIUS * 2, half - margin);
  return { minX: -side, maxX: side, minY: bottom, maxY: top };
}

/** A lebegés kitérése (játékegység); alapértéke `CRYSTAL_DRIFT_X / Y` (0: a cél áll), a tesztek nem nullát is kérhetnek. */
export type CrystalDrift = { x?: number; y?: number };

/** A sávok elrendezése: sávszélesség, megengedett kitérés és a két sor magassága (páros: fent, páratlan: lent). */
function layout(bounds: CrystalBounds, n: number, drift?: CrystalDrift) {
  const lane = (bounds.maxX - bounds.minX) / n;
  const driftX = Math.max(0, Math.min(drift?.x ?? CRYSTAL_DRIFT_X, lane / 2 - CRYSTAL_RADIUS * 1.15));
  const height = Math.max(0, bounds.maxY - bounds.minY);
  const driftY = Math.min(drift?.y ?? CRYSTAL_DRIFT_Y, height / 4);
  return { lane, driftX, driftY, rowLow: bounds.minY + driftY, rowHigh: bounds.maxY - driftY };
}

/**
 * 3–4 kristály a kérdés opcióiból: az opció-sorrend a director által seedelten kevert sorrend, a sávok balról jobbra
 * követik. Páros / páratlan sávok váltakozó magasságon (a feliratok így sem fedik egymást keskeny nézetben), a lebegés
 * fázisa és kitérése seedelt. A kitérés sávon belül marad: két szomszéd kristály közepe soha nincs `2 × sugár`-nál közelebb.
 */
export function spawnCrystals(presentation: CrystalPresentation, bounds: CrystalBounds, rng: () => number, drift?: CrystalDrift): Crystal[] {
  const n = presentation.options.length;
  if (n < 2) return [];
  const { lane, driftX, driftY, rowLow, rowHigh } = layout(bounds, n, drift);
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

/**
 * A zóna megváltozott (a kérdés-kártya magassága a hosszú prompttól / a megoldás-sortól függ): a sávok közepe `ease`
 * (0..1) arányban az új helyre húzódik — a kristályok nem ugranak. Az `ease = 1` azonnal átrendez.
 */
export function rezoneCrystals(crystals: Crystal[], bounds: CrystalBounds, ease = 1, drift?: CrystalDrift): void {
  const n = crystals.length;
  if (n < 2) return;
  const k = Math.min(1, Math.max(0, ease));
  const { lane, driftX, driftY, rowLow, rowHigh } = layout(bounds, n, drift);
  for (const c of crystals) {
    const i = c.optionIndex;
    const targetX = bounds.minX + lane * (i + 0.5);
    const targetY = i % 2 === 0 ? rowHigh : rowLow;
    c.homeX += (targetX - c.homeX) * k;
    c.homeY += (targetY - c.homeY) * k;
    c.driftX = Math.min(c.driftX, driftX);
    c.driftY = Math.min(c.driftY, driftY);
    placeCrystal(c);
  }
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
