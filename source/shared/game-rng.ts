/**
 * Seedelt véletlenszám-generátor a játékok szimulációjához (terv 2026-11-16-jatekok-jatekelmeny 4.3 és 6.1; J0a).
 *
 * Kliens ÉS szerver használja (párbaj-kérdéssor, napi kihívás, kihívás-link): DOM-, three- és React-mentes, nincs benne
 * `Math.random`, `Date.now` vagy `performance.now` (őr: `tests/game-sim-determinism-guard.test.ts`).
 *
 * Algoritmus: a seed-szövegből xmur3 hash ad négy 32 bites szót, ezek az sfc32 (Small Fast Counting, 128 bites állapot)
 * kezdőállapota. Mindkettő a bryc-féle közkincs referencia-implementáció szerint (a teszt egy független átiratával
 * összeveti), külső csomag nélkül. Azonos seed → bitre azonos sorozat minden JavaScript-motoron, mert csak 32 bites egész
 * műveletek (`Math.imul`, eltolás, `| 0`, `>>> 0`) szerepelnek.
 *
 * A metódusok zárványok (nem `this`-alapúak): a `rng.next` leválasztva is átadható `() => number`-ként.
 */

export type RngState = [number, number, number, number];

export type Rng = {
  /** Egyenletes eloszlású szám a [0, 1) tartományban. */
  next(): number;
  /** Egész szám a [0, maxExclusive) tartományban; `maxExclusive` pozitív egész, különben RangeError. */
  int(maxExclusive: number): number;
  /** Egy elem a nem üres tömbből (üres tömbnél RangeError). */
  pick<T>(arr: readonly T[]): T;
  /** Új, kevert tömb (Fisher–Yates); a bemenet változatlan marad. */
  shuffle<T>(arr: readonly T[]): T[];
  /** A pillanatnyi 128 bites állapot másolata (a `restoreRng` innen folytatja a sorozatot). */
  state(): RngState;
};

const TWO_POW_32 = 4294967296;
/** Az sfc32 ajánlott bemelegítése: az első kimenetek a gyengén kevert kezdőállapotot tükrözik. */
const WARMUP = 15;

/** xmur3: szövegből 32 bites hash-sorozat (minden hívás újabb szót ad). */
function xmur3(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function fromState(initial: readonly [number, number, number, number]): Rng {
  let a = initial[0] >>> 0;
  let b = initial[1] >>> 0;
  let c = initial[2] >>> 0;
  let d = initial[3] >>> 0;

  const nextU32 = (): number => {
    const t0 = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t = (t0 + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };

  const next = (): number => nextU32() / TWO_POW_32;

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > TWO_POW_32) {
      throw new RangeError(`game-rng: az int() felső korlátja 1 és 2^32 közötti egész legyen (kapott: ${maxExclusive})`);
    }
    return Math.floor(next() * maxExclusive);
  };

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new RangeError("game-rng: a pick() üres tömböt kapott");
    return arr[int(arr.length)];
  };

  const shuffle = <T>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };

  const state = (): RngState => [a >>> 0, b >>> 0, c >>> 0, d >>> 0];

  return { next, int, pick, shuffle, state };
}

/**
 * Új generátor a seedből. A szám-seed a szöveges alakjával egyenértékű (`createRng(3)` ≡ `createRng("3")`), hogy az URL-ből
 * szövegként érkező szerveroldali érték és a kliens számértéke ugyanazt a sorozatot adja. Nem véges szám RangeError.
 */
export function createRng(seed: string | number): Rng {
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new RangeError(`game-rng: a seed véges szám vagy szöveg legyen (kapott: ${seed})`);
  }
  const hash = xmur3(String(seed));
  const rng = fromState([hash(), hash(), hash(), hash()]);
  for (let i = 0; i < WARMUP; i++) rng.next();
  return rng;
}

/**
 * Stabil seed-szöveg részekből: `seedFrom("tsunami-english", "2026-11-16", "K7QM2X", 3)` →
 * `"tsunami-english:2026-11-16:K7QM2X:3"`. A részeket `:` választja el; a részen belüli `:` és `\` visszaperjellel
 * escape-elt, így a határ nem csúszhat el (`seedFrom("a:b")` ≠ `seedFrom("a", "b")`). A számok szöveges alakjukkal
 * szerepelnek (3 ≡ "3"); nem véges szám RangeError.
 */
export function seedFrom(...parts: ReadonlyArray<string | number>): string {
  return parts
    .map((part) => {
      if (typeof part === "number" && !Number.isFinite(part)) {
        throw new RangeError(`game-rng: a seedFrom() része véges szám vagy szöveg legyen (kapott: ${part})`);
      }
      return String(part).replace(/[\\:]/g, "\\$&");
    })
    .join(":");
}

/** A `state()`-tel elmentett állapotból folytatja a sorozatot (visszajátszás, újracsatlakozás). */
export function restoreRng(state: readonly [number, number, number, number]): Rng {
  if (state.length !== 4 || state.some((word) => !Number.isInteger(word))) {
    throw new RangeError("game-rng: a restoreRng() négy egész számból álló állapotot vár");
  }
  return fromState(state);
}
