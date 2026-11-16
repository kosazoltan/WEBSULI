/**
 * G-8 — virtuális joystick matematikája.
 *
 * Tiszta modul: a React-komponens csak kirajzolja, amit itt kiszámolunk, így a
 * vezérlés viselkedése tesztelhető böngésző nélkül.
 *
 * A három szabály, ami a telefonos játszhatóságot eldönti:
 *
 *  - **Holtsáv.** A hüvelykujj sosem áll pontosan egy helyben. Holtsáv nélkül a
 *    hajó magától sodródik, és a gyerek azt hiszi, elromlott a játék. A
 *    holtsávon túl a sebesség NULLÁRÓL indul, nem a holtsáv értékéről —
 *    különben a lépés pillanatában ugrik egyet.
 *
 *  - **Egységkörre vágás.** Négyzetes vágásnál az átló √2-szer gyorsabb lenne
 *    az egyenesnél; ez a régi arcade-játékok jellegzetes hibája, és a gyerekek
 *    meg is tanulják kihasználni ahelyett, hogy a játékkal foglalkoznának.
 *
 *  - **A gomb nem lóghat ki a tárcsából.** A `knobOffset` ugyanarra a sugárra
 *    vág, amire az irányvektor — így amit a gyerek lát, az az, ami történik.
 *
 * A képernyő y tengelye lefelé nő, a játékok „előre" iránya viszont fölfelé
 * mutat, ezért a modul megfordítja: a kimenő `y` pozitív, ha fölfelé húznak.
 */

/** A tárca sugarának hányada, amin belül nincs mozgás. */
export const JOYSTICK_DEAD_ZONE = 0.15;

export type Point = { x: number; y: number };

export type JoystickInput = {
  /** Ahol a tárca közepe van (képernyő-koordináta). */
  origin: Point;
  /** Ahol az ujj éppen van (képernyő-koordináta). */
  point: Point;
  /** A tárca sugara pixelben. */
  radius: number;
};

export type JoystickVector = {
  /** -1..1, jobbra pozitív. */
  x: number;
  /** -1..1, ELŐRE (a képernyőn fölfelé) pozitív. */
  y: number;
  /** 0..1, a kitérés nagysága. */
  magnitude: number;
};

const ZERO: JoystickVector = { x: 0, y: 0, magnitude: 0 };

export function joystickVector(input: JoystickInput): JoystickVector {
  const { origin, point, radius } = input;
  if (!(radius > 0)) return ZERO;

  const dx = point.x - origin.x;
  // A képernyő lefelé nő; a játékokban az „előre" fölfelé mutat.
  const dy = origin.y - point.y;

  const distance = Math.hypot(dx, dy);
  if (distance === 0) return ZERO;

  const raw = Math.min(1, distance / radius);
  if (raw <= JOYSTICK_DEAD_ZONE) return ZERO;

  // Nullától induló skála a holtsáv után: a lépés pillanatában ne ugorjon.
  const magnitude = (raw - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE);
  const ux = dx / distance;
  const uy = dy / distance;

  return { x: ux * magnitude, y: uy * magnitude, magnitude };
}

/**
 * A tárca gombjának eltolása a középtől, pixelben, a sugárra vágva.
 *
 * Képernyő-koordinátában adja vissza (y lefelé nő), mert a kirajzolás ott
 * történik — a `joystickVector` fordítása csak a játéklogikának szól.
 */
export function knobOffset(input: JoystickInput): Point {
  const { origin, point, radius } = input;
  if (!(radius > 0)) return { x: 0, y: 0 };

  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return { x: dx, y: dy };

  const scale = radius / distance;
  return { x: dx * scale, y: dy * scale };
}

/**
 * Egy tárcsa-húzás állapota (lenyomás → mozgás → felengedés), React nélkül.
 *
 * A `reset` a futó húzást is megszakítja: fókuszvesztéskor (blur, háttérbe kerülő lap) a hívó
 * elengedi a vezérlést, és az ezután érkező, még a régi ujjhoz tartozó mozgás már nem vezet
 * (review PR #137). A késve érkező `up` ilyenkor nem csinál semmit.
 */
export type JoystickDrag = {
  readonly active: boolean;
  down(point: Point): void;
  /** Null, ha nincs futó húzás — ilyenkor a mozgás nem vezet. */
  move(point: Point): { vector: JoystickVector; knob: Point } | null;
  /** Igaz, ha volt mit elengedni. */
  up(): boolean;
  /** Mint az `up`, de kívülről (fókuszvesztés); igaz, ha húzást szakított meg. */
  reset(): boolean;
};

export function createJoystickDrag(radius: number): JoystickDrag {
  let origin: Point | null = null;
  const release = () => {
    const was = origin !== null;
    origin = null;
    return was;
  };
  return {
    get active() {
      return origin !== null;
    },
    down(point) {
      origin = { x: point.x, y: point.y };
    },
    move(point) {
      if (!origin) return null;
      return {
        vector: joystickVector({ origin, point, radius }),
        knob: knobOffset({ origin, point, radius }),
      };
    },
    up: release,
    reset: release,
  };
}

/**
 * Példánycsere sugárváltáskor (review PR #422): a `radius="auto"` tárcsa elforgatáskor új húzás-példányt
 * kap. A régi futó húzását le kell zárni, különben a későbbi felengedés az új, inaktív példányon `false`-szal
 * tér vissza, nem megy ki nulla vektor, és a játék az ujj felemelése után is tartja az utolsó irányt.
 * Igaz, ha volt megszakított húzás — ilyenkor a hívó nulla vektort küld és törli a gombot.
 */
export function retireJoystickDrag(prev: JoystickDrag | null, next: JoystickDrag): boolean {
  if (!prev || prev === next) return false;
  return prev.reset();
}

/**
 * Joystick-reakció (kanban #49) — folytonos válaszgörbe.
 *
 * Mért gyökérok: a játékok a holtsáv UTÁN még egy saját küszöböt raktak a tárcsára (`joystickToDirections` 0,35;
 * a Tornado kormánya 0,2 + négyzetes görbe), így az ujjnak a sugár ~32–45%-áig kellett mennie, mire bármi
 * történt, utána pedig egyszerre teljes sebesség jött. A görbe ehelyett a holtsáv szélétől folytonos:
 * `(1 − expo)·t + expo·t³` — kis kitérésnél finom (expo 0,4 mellett 10% → 6%), teljes kitérésnél pontosan 1,
 * szigorúan monoton, ugrás nélkül. Második holtsávot a hívó NE tegyen rá.
 */
export const JOYSTICK_EXPO = 0.4;

export function joystickCurve(t: number, expo = JOYSTICK_EXPO): number {
  if (!(t > 0)) return 0;
  const u = Math.min(1, t);
  const e = Math.max(0, Math.min(1, expo));
  return (1 - e) * u + e * u * u * u;
}

/** Analóg tárcsa-érték a görbével: az irány marad, a nagyság `joystickCurve(magnitude)`. */
export function shapeJoystick(v: JoystickVector, expo = JOYSTICK_EXPO): JoystickVector {
  if (!(v.magnitude > 0)) return ZERO;
  const m = joystickCurve(v.magnitude, expo);
  const k = m / v.magnitude;
  return { x: v.x * k, y: v.y * k, magnitude: m };
}

/**
 * Négyirányú lebontás a joystickból.
 *
 * A meglévő játékok logikája négy logikai gombot vár (`fwd/back/left/right`),
 * nem folytonos vektort. Így a joystick bekötéséhez nem kell a játékok
 * fizikáját átírni — ami sokkal kockázatosabb lenne, mint amennyit érne.
 */
export function joystickToDirections(
  v: JoystickVector,
  threshold = 0.35,
): { fwd: boolean; back: boolean; left: boolean; right: boolean } {
  return {
    fwd: v.y > threshold,
    back: v.y < -threshold,
    left: v.x < -threshold,
    right: v.x > threshold,
  };
}
