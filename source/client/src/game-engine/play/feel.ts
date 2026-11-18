/**
 * Játékérzet: képernyőrázás, hitstop, easing (terv 2026-11-16-jatekok-jatekelmeny 6.1; végrehajtás J0a, K.4/19, KSZ-10).
 *
 * - Rázás: trauma-modell — a `addTrauma` 0..1 közötti „traumát” ad (plafon 1), a rázás mértéke trauma², a trauma valós
 *   időben 0,8/s-mal lineárisan cseng le. Az elmozdulás sima 1D értékzajból jön (nem képkockánkénti fehér zaj), legfeljebb
 *   a képmagasság 1%-a, a forgás legfeljebb 2,5°. Csökkentett mozgásnál az eltolás mindig 0 (`GE/useReducedMotion.ts`
 *   `motionScale().shake === 0` szabálya), helyette a játék nem mozgó jelzést ad.
 * - Hitstop: 40–120 ms VALÓS idejű megállás (a kért érték erre a sávra szorul), 150 ms-on belül (az előző kezdetétől) nem
 *   ismétlődik. Csak a szimulációt állítja meg a hurok `holdFor`-jával; a játék által beállított szorzót (szünet, kérdés alatti
 *   lassítás) nem írja felül. Hang és részecske-kezdőlöket nem áll meg — azokat a játék a hitstop hívásával egy időben indítja.
 * - Kozmetikai véletlen: a zajrács az átadott `fxRng`-ből jön (nem a sim RNG-je, KSZ-2), egyszer, létrehozáskor; a forró
 *   úton (`shakeOffset`, `update`) nincs allokáció.
 */

import type { FixedLoop } from "./loop";

export type ShakeOffset = { x: number; y: number; rot: number };
export type TweenKind = "outCubic" | "inOutQuad" | "outBack";

export type Feel = {
  /** 0..1, összeadódik, plafon 1. Negatív / nem véges érték hatástalan. */
  addTrauma(amount: number): void;
  /**
   * trauma², sima zaj, max 1% magasság, max 2.5° forgás. Az `out` mezőit írja (nincs allokáció): `x`, `y` CSS px a
   * `viewportH` mértékegységében, `rot` RADIÁNBAN (three.js és `ctx.rotate` közvetlenül használja; CSS-hez `rot * 180 / Math.PI` fok).
   */
  shakeOffset(out: ShakeOffset, viewportH: number): void;
  /** 40..120; 150 ms-on belül nem ismétlődik; a hurok `holdFor(ms)`-ével a sim-et átmenetileg megállítja. */
  hitstop(ms: number): void;
  /** Valós eltelt idő ms-ban (a rAF különbsége): trauma-lecsengés 0.8/s, a hitstop lejárata. */
  update(realDtMs: number): void;
  /** Easing a [0, 1] tartományra szorított `t`-re. */
  tween(t: number, kind: TweenKind): number;
};

/** Trauma-lecsengés másodpercenként (terv 6.1: 0,5–1,5/s sáv). */
export const TRAUMA_DECAY_PER_SEC = 0.8;
/** A legnagyobb eltolás a képmagasság arányában (terv 6.1: 1%). */
export const MAX_SHAKE_FRACTION = 0.01;
/** A legnagyobb forgás radiánban (2,5°). */
export const MAX_SHAKE_ROT_RAD = (2.5 * Math.PI) / 180;
export const HITSTOP_MIN_MS = 40;
export const HITSTOP_MAX_MS = 120;
/** Két hitstop kezdete között legalább ennyi valós idő telik el. */
export const HITSTOP_COOLDOWN_MS = 150;

/** A zaj mintavételi frekvenciája (rácspont / s): elég gyors a „rázásnak”, elég lassú, hogy ne vibráljon. */
const NOISE_HZ = 18;
const LATTICE = 64;
const LATTICE_MASK = LATTICE - 1;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export function tween(t: number, kind: TweenKind): number {
  const x = clamp01(Number.isFinite(t) ? t : 0);
  // A végpontok pontosak (az outBack képlete 0-nál lebegőpontosan 2e-16-ot adna — egy „nyugalmi” elem ne remegjen).
  if (x === 0) return 0;
  if (x === 1) return 1;
  switch (kind) {
    case "outCubic":
      return 1 - (1 - x) * (1 - x) * (1 - x);
    case "inOutQuad":
      return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) * (-2 * x + 2)) / 2;
    case "outBack": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const u = x - 1;
      return 1 + c3 * u * u * u + c1 * u * u;
    }
  }
}

export function createFeel(opts: { reducedMotion: boolean; loop?: FixedLoop; fxRng: () => number }): Feel {
  const { reducedMotion, loop, fxRng } = opts;
  // Három csatorna (x, y, forgás) egymástól független zajrácsa, [-1, 1] értékekkel.
  const lattice = new Float64Array(3 * LATTICE);
  for (let i = 0; i < lattice.length; i++) lattice[i] = fxRng() * 2 - 1;

  let trauma = 0;
  let clockMs = 0;
  let lastHitstopAtMs = Number.NEGATIVE_INFINITY;
  // A hitstop időtartamát a hurok a saját valós idejéből számolja (`loop.holdFor`); itt csak a hűtés órája fut.

  const noise = (channel: number, t: number): number => {
    const i = Math.floor(t);
    const f = t - i;
    const base = channel * LATTICE;
    const a = lattice[base + (i & LATTICE_MASK)];
    const b = lattice[base + ((i + 1) & LATTICE_MASK)];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };

  return {
    addTrauma(amount: number): void {
      if (!Number.isFinite(amount) || amount <= 0) return;
      trauma = Math.min(1, trauma + Math.min(1, amount));
    },
    shakeOffset(out: ShakeOffset, viewportH: number): void {
      if (reducedMotion || trauma <= 0 || !Number.isFinite(viewportH) || viewportH <= 0) {
        out.x = 0;
        out.y = 0;
        out.rot = 0;
        return;
      }
      const shake = trauma * trauma;
      const t = (clockMs / 1000) * NOISE_HZ;
      const maxOffset = viewportH * MAX_SHAKE_FRACTION;
      out.x = maxOffset * shake * noise(0, t);
      out.y = maxOffset * shake * noise(1, t + 17.3);
      out.rot = MAX_SHAKE_ROT_RAD * shake * noise(2, t + 41.7);
    },
    hitstop(ms: number): void {
      if (!Number.isFinite(ms)) return;
      if (clockMs - lastHitstopAtMs < HITSTOP_COOLDOWN_MS) return;
      lastHitstopAtMs = clockMs;
      loop?.holdFor(ms < HITSTOP_MIN_MS ? HITSTOP_MIN_MS : ms > HITSTOP_MAX_MS ? HITSTOP_MAX_MS : ms);
    },
    update(realDtMs: number): void {
      if (!Number.isFinite(realDtMs) || realDtMs <= 0) return;
      clockMs += realDtMs;
      trauma = Math.max(0, trauma - (TRAUMA_DECAY_PER_SEC * realDtMs) / 1000);
    },
    tween,
  };
}
