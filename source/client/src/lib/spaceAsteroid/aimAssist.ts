/**
 * S10 / terv 4.6/6 — automatikus célzássegéd érintéses lövéshez (Galaktikus Aszteroida).
 *
 * Telefonon a hüvelykujj a joystickon és a tűzgombon van: pontos vízszintes igazításra nincs mód, a lövés
 * így gyakran épp a cél mellett megy el. A segéd a hajó FÖLÖTTI, a függőlegestől `coneDeg`-en belül álló élő
 * célok közül a legközelebbi felé dönti a középső lövedéket — a kúpon kívüli célra nem céloz, így a játék
 * nem játssza magát. Billentyűzetnél a lap nem hívja (a lövés ott változatlanul egyenesen felfelé megy).
 *
 * Tiszta függvény: a lap és a teszt közös forrása (szerződés: végrehajtás S10 / 2. lépés).
 */

export type AimTarget = { x: number; y: number; alive?: boolean };

export type AimAssistOptions = {
  /** A célzási kúp fél-nyílásszöge a függőlegestől, fokban. */
  coneDeg: number;
  /** A középső lövedék vízszintes sebességének felső korlátja (abszolút érték). */
  maxVx: number;
  /** A lövedék sebessége (a lap `BULLET_SPEED`-je). */
  speed: number;
};

/** A lap `BULLET_SPEED` állandója (SpaceAsteroidQuiz.tsx) — a segéd alapértéke ugyanaz. */
export const AIM_ASSIST_DEFAULTS: AimAssistOptions = { coneDeg: 25, maxVx: 6, speed: 14 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * A középső lövedék vízszintes sebessége: a legközelebbi, kúpon belüli élő cél felé mutató
 * `clamp(speed × dx / dist, −maxVx, maxVx)`; nincs ilyen cél → 0.
 */
export function aimAssistVx(
  ship: { x: number; y: number },
  targets: ReadonlyArray<AimTarget>,
  opts: AimAssistOptions = AIM_ASSIST_DEFAULTS,
): number {
  const tanCone = Math.tan((opts.coneDeg * Math.PI) / 180);
  let best: { dx: number; dist: number } | null = null;
  for (const t of targets) {
    if (t.alive === false) continue;
    const dy = t.y - ship.y;
    if (!(dy > 0)) continue; // csak a hajó fölött
    const dx = t.x - ship.x;
    if (Math.abs(dx) > dy * tanCone) continue; // a kúpon kívül
    const dist = Math.hypot(dx, dy);
    if (best === null || dist < best.dist) best = { dx, dist };
  }
  if (best === null || best.dist === 0) return 0;
  const vx = clamp((opts.speed * best.dx) / best.dist, -opts.maxVx, opts.maxVx);
  // −0 helyett 0 (a teszt és a naplók szempontjából ugyanaz, de az egyenlőség-vizsgálat egyértelmű).
  return vx === 0 ? 0 : vx;
}
