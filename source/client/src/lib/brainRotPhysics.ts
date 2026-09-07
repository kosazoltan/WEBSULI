/**
 * G-10 — a Brain Rot lények mozgása, idő-alapon.
 *
 * Két hiba mérve a lapon (2026-09-07):
 *
 *  1. A mozgás képkocka-alapú volt (`x += vx`). Aki 120 Hz-es telefonon
 *     játszott, annál minden kétszer olyan gyorsan mozgott, mint 60 Hz-en —
 *     ugyanaz a játék, két nehézség, véletlenül.
 *
 *  2. Az állapotfrissítés ~10 FPS-re volt fojtva (100 ms), teljesítmény miatt.
 *     A fojtás jó ötlet — a React újrarajzolása drága —, de a lépés ekkor
 *     tízszer akkorát ugrott, és a lény ugrálva mozgott, nem úszva.
 *
 * Itt a lépés a ténylegesen eltelt időt kapja meg. A sebesség 60 FPS-hez van
 * normalizálva, hogy a meglévő `vx`/`vy` értékek megtartsák az eddigi érzetüket
 * — a cél a folyamatosság, nem az, hogy más játék legyen belőle.
 */

export type MovingRot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
};

export type Bounds = { width: number; height: number };

/** A régi, képkocka-alapú sebességek referencia-képkockaideje. */
const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * A legnagyobb egyetlen lépésben feldolgozott idő.
 *
 * Háttérbe tett fülnél a `requestAnimationFrame` percekig nem fut, és a
 * visszatéréskor kapott `dt` akkora lenne, hogy a lény egyetlen képkocka alatt
 * átrepülne a pályán — vagy a falon.
 */
const MAX_STEP_MS = 120;

export function stepBrainRot(rot: MovingRot, elapsedMs: number, bounds: Bounds): MovingRot {
  const dt = Math.max(0, Math.min(MAX_STEP_MS, elapsedMs)) / REFERENCE_FRAME_MS;
  if (dt === 0) return rot;

  const half = rot.size / 2;
  // Elfajult pályaméret (még nem mért DOM) esetén a határok összeérnek; a
  // clamp így is véges értéket ad, NaN helyett.
  const minX = Math.min(half, Math.max(0, bounds.width - half));
  const maxX = Math.max(minX, bounds.width - half);
  const minY = Math.min(half, Math.max(0, bounds.height - half));
  const maxY = Math.max(minY, bounds.height - half);

  let { x, y, vx, vy } = rot;
  x += vx * dt;
  y += vy * dt;

  // Visszapattanás: a sebességet fordítjuk, a pozíciót a pályára húzzuk vissza.
  // A kettő együtt kell — csak fordítással a lény a falba ragadna, csak
  // vágással pedig a fal mentén csúszna végig.
  if (x < minX || x > maxX) vx = -vx;
  if (y < minY || y > maxY) vy = -vy;

  x = Math.max(minX, Math.min(maxX, x));
  y = Math.max(minY, Math.min(maxY, y));

  return { ...rot, x, y, vx, vy, rotation: rot.rotation + rot.rotSpeed * dt };
}
