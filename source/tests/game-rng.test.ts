import assert from "node:assert/strict";
import test from "node:test";
import { createRng, restoreRng, seedFrom } from "../shared/game-rng";

/**
 * J0a — seedelt RNG (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J0a, K.4/12–13).
 *
 * A párbaj és a napi kihívás azon múlik, hogy két gép (kliens és szerver, két diák telefonja) azonos seedből bitre azonos
 * sorozatot kap. Ezért a teszt nem csak önmagával veti össze a generátort, hanem a közkincs xmur3 + sfc32 referencia
 * (bryc, „PRNG shootout”) független átiratával is: ha valaki „optimalizálja” az implementációt és a sorozat elcsúszik, a
 * régi visszajátszások és a futó párbajok szétesnének — ez a teszt ezt fogja meg.
 */

/** Független átirat a referenciából (szándékosan más szerkezettel, mint a modul). */
function referenceSequence(seed: string, count: number, warmup: number): number[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const hash = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a = hash(), b = hash(), c = hash(), d = hash();
  const sfc32 = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < warmup; i++) sfc32();
  return Array.from({ length: count }, sfc32);
}

const draw = (seed: string | number, count: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
};

test("azonos seed → bitre azonos 10 000 elemű sorozat (két külön példány)", () => {
  const a = draw("tsunami-english:2026-11-16:K7QM2X:3", 10_000);
  const b = draw("tsunami-english:2026-11-16:K7QM2X:3", 10_000);
  assert.deepEqual(a, b);
  for (const x of a) assert.ok(x >= 0 && x < 1, `tartományon kívül: ${x}`);
});

test("a sorozat a közkincs xmur3 + sfc32 referenciával egyezik (15 lépés bemelegítés után)", () => {
  for (const seed of ["websuli", "", "árvíztűrő tükörfúrógép", "duel:ROOM42:1"]) {
    assert.deepEqual(draw(seed, 1000), referenceSequence(seed, 1000, 15), `eltérés a(z) "${seed}" seednél`);
  }
});

test("különböző seed → eltérő sorozat", () => {
  const base = draw("seed-1", 100);
  for (const other of ["seed-2", "seed-10", "Seed-1", "seed-1 "]) {
    const seq = draw(other, 100);
    const same = seq.filter((x, i) => x === base[i]).length;
    assert.ok(same <= 1, `a(z) "${other}" seed ${same} azonos elemet adott a "seed-1"-gyel`);
  }
});

test("a szám-seed a szöveges alakjával egyenértékű; nem véges szám hiba", () => {
  assert.deepEqual(draw(3, 50), draw("3", 50));
  assert.throws(() => createRng(Number.NaN), RangeError);
  assert.throws(() => createRng(Number.POSITIVE_INFINITY), RangeError);
});

test("seedFrom stabil, a határ nem csúszhat el", () => {
  assert.equal(seedFrom("tsunami-english", "2026-11-16", "K7QM2X", 3), "tsunami-english:2026-11-16:K7QM2X:3");
  assert.equal(seedFrom("sim", "math", 7), seedFrom("sim", "math", "7"));
  assert.notEqual(seedFrom("a:b"), seedFrom("a", "b"));
  assert.notEqual(seedFrom("a\\", "b"), seedFrom("a", "\\b"));
  assert.equal(seedFrom(), "");
  assert.throws(() => seedFrom("x", Number.NaN), RangeError);
});

test("shuffle: a bemenet permutációja, a bemenet változatlan, azonos seedre azonos", () => {
  const input = Object.freeze(Array.from({ length: 50 }, (_, i) => i));
  const a = createRng("keverés").shuffle(input);
  const b = createRng("keverés").shuffle(input);
  assert.deepEqual(a, b);
  assert.notEqual(a, input);
  assert.deepEqual([...a].sort((x, y) => x - y), [...input]);
  assert.notDeepEqual(a, [...input], "50 elemnél a változatlan sorrend 1/50! esélyű — keverés nem történt");
  assert.deepEqual(createRng(1).shuffle([]), []);
  assert.deepEqual(createRng(1).shuffle(["egy"]), ["egy"]);
});

test("int és pick: tartomány, minden érték előfordul, érvénytelen bemenet hiba", () => {
  const rng = createRng("kocka");
  const seen = new Set<number>();
  for (let i = 0; i < 6000; i++) {
    const v = rng.int(6);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6);
    seen.add(v);
  }
  assert.equal(seen.size, 6);
  for (const bad of [0, -1, 2.5, Number.NaN]) assert.throws(() => rng.int(bad), RangeError);
  assert.ok(["a", "b", "c"].includes(rng.pick(["a", "b", "c"])));
  assert.throws(() => rng.pick([]), RangeError);
});

test("state / restoreRng: a mentett állapotból ugyanott folytatódik", () => {
  const rng = createRng("visszajátszás");
  for (let i = 0; i < 137; i++) rng.next();
  const saved = rng.state();
  const expected = Array.from({ length: 500 }, () => rng.next());
  const restored = restoreRng(saved);
  assert.deepEqual(Array.from({ length: 500 }, () => restored.next()), expected);
  saved[0] = 0; // a visszaadott tömb másolat: módosítása nem hat a generátorra
  assert.notDeepEqual(rng.state(), saved);
  assert.throws(() => restoreRng([1, 2, 3] as unknown as [number, number, number, number]), RangeError);
  assert.throws(() => restoreRng([1, 2, 3, 0.5]), RangeError);
});

test("a metódusok leválasztva is működnek (rng.next átadható () => number-ként)", () => {
  const { next, int } = createRng("leválasztva");
  const ref = createRng("leválasztva");
  assert.equal(next(), ref.next());
  assert.equal(int(1000), ref.int(1000));
});

test("eloszlás: χ² 10 kosárra, 100 000 mintán, öt seeddel a p = 0,001 küszöb alatt", () => {
  // 9 szabadsági fok, p = 0,001 kritikus érték: 27,877 (χ²-táblázat). Determinisztikus seedek → nem pelyhes.
  const CRITICAL = 27.877;
  const N = 100_000;
  for (let s = 1; s <= 5; s++) {
    const rng = createRng(seedFrom("chi2", s));
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < N; i++) bins[Math.floor(rng.next() * 10)]++;
    const expected = N / 10;
    const chi2 = bins.reduce((sum, observed) => sum + ((observed - expected) ** 2) / expected, 0);
    assert.ok(chi2 < CRITICAL, `seed ${s}: χ² = ${chi2.toFixed(2)} ≥ ${CRITICAL}`);
  }
});
