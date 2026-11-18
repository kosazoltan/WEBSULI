import assert from "node:assert/strict";
import test from "node:test";
import { createRng } from "../shared/game-rng";
import { COMBO_STEPS, comboBreak, comboCorrect, createCombo } from "../client/src/game-engine/play/combo";
import { createWaveDirector, waveTempo, type WaveSpec } from "../client/src/game-engine/play/waves";

/** J0b — kombó és hullám (végrehajtás J0b „Tesztek”; terv 6.1). */

test("kombó: lépcsők 3/6/10/15 → ×2/×3/×4/×5; comboBreak megtartja a best-et", () => {
  assert.deepEqual(COMBO_STEPS, [0, 3, 6, 10, 15]);
  let s = createCombo();
  assert.deepEqual(s, { count: 0, multiplier: 1, best: 0 });
  const seen: number[] = [];
  for (let i = 1; i <= 20; i++) {
    s = comboCorrect(s);
    seen.push(s.multiplier);
  }
  // count: 1 2 | 3 4 5 | 6 7 8 9 | 10..14 | 15..20
  assert.deepEqual(seen, [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5]);
  const broken = comboBreak(s);
  assert.deepEqual(broken, { count: 0, multiplier: 1, best: 20 });
  const again = comboCorrect(comboCorrect(broken));
  assert.equal(again.best, 20, "a menet legjobb sorozata megmarad (runStreak)");
  assert.equal(again.count, 2);
  assert.notEqual(s, comboCorrect(s), "változtathatatlan: új objektum");
});

const SCRIPT: WaveSpec[] = [
  { id: "w1", budget: 30, spawnEverySec: 1, enemies: [{ kind: "dron", cost: 2, weight: 3 }, { kind: "tank", cost: 5, weight: 1 }], miniboss: "hibagyar" },
  { id: "w2", budget: 10, spawnEverySec: 0.5, enemies: [{ kind: "dron", cost: 2, weight: 1 }], boss: "zero" },
];

function runWaves(seed: number) {
  const w = createWaveDirector(SCRIPT, createRng(seed));
  const log: string[] = [];
  for (let step = 0; step < 6000 && !w.done(); step++) {
    const born = w.tick(1 / 60, 0.5);
    for (const kind of born) log.push(`${w.index()}:${kind}`);
    if (born.length) w.onCleared(born.length); // azonnal legyőzve
    if (w.waveDone()) {
      log.push(`done:${w.current().id}`);
      if (!w.next()) break;
    }
  }
  return { w, log };
}

test("hullám: a költségvetés determinisztikus seeddel; a keret elfogy, a záró ellenfél kijön, utána next()", () => {
  const a = runWaves(7);
  assert.deepEqual(runWaves(7).log, a.log, "azonos seed → azonos hullám");
  const other = [8, 9, 10, 11].map((s) => runWaves(s).log.join(","));
  assert.ok(other.some((l) => l !== a.log.join(",")), "más seed → más összetétel");
  // A w1 ellenfeleinek összköltsége ≤ 30, és a maradék keret semmire nem elég (< 2).
  const w1 = a.log.filter((l) => l.startsWith("0:") && !l.endsWith("hibagyar")).map((l) => (l.endsWith("tank") ? 5 : 2));
  const spent = w1.reduce((x, y) => x + y, 0);
  assert.ok(spent <= 30 && 30 - spent < 2, `w1 költés ${spent}`);
  assert.ok(a.log.includes("0:hibagyar"), "a miniboss a hullám végén jön");
  assert.ok(a.log.indexOf("0:hibagyar") > a.log.lastIndexOf(a.log.find((l) => l.startsWith("0:") && !l.endsWith("hibagyar"))!));
  assert.ok(a.log.includes("1:zero"), "a második hullám főellenfele kijön");
  assert.deepEqual(a.log.filter((l) => l.startsWith("done:")), ["done:w1", "done:w2"]);
  assert.equal(a.w.done(), true);
  assert.equal(a.w.next(), false);
  assert.deepEqual(a.w.tick(1, 1), [], "vége után nincs spawn");
});

test("hullám: a boss csak akkor jön, ha már senki nem él; waveDone csak tiszta pályán", () => {
  const w = createWaveDirector([{ id: "b", budget: 4, spawnEverySec: 1, enemies: [{ kind: "x", cost: 2, weight: 1 }], boss: "B" }], createRng(1));
  const born: string[] = [];
  for (let i = 0; i < 10; i++) born.push(...w.tick(1, 0.5));
  assert.deepEqual(born, ["x", "x"], "életben lévő ellenfél mellett nincs boss");
  assert.equal(w.waveDone(), false);
  w.onCleared(2);
  assert.deepEqual(w.tick(0.1, 0.5), ["B"]);
  assert.equal(w.waveDone(), false);
  w.onCleared();
  assert.equal(w.waveDone(), true);
  assert.equal(w.done(), true, "az utolsó hullám kész → done");
});

test("hullám: intensity 0 / 1 → spawn-tempó −30% / +30% (0,5-höz képest)", () => {
  assert.ok(Math.abs(waveTempo(0) - 0.7) < 1e-12);
  assert.ok(Math.abs(waveTempo(0.5) - 1) < 1e-12);
  assert.ok(Math.abs(waveTempo(1) - 1.3) < 1e-12);
  const count = (intensity: number) => {
    const w = createWaveDirector([{ id: "big", budget: 1_000_000, spawnEverySec: 1, enemies: [{ kind: "x", cost: 1, weight: 1 }] }], createRng(1));
    let n = 0;
    for (let i = 0; i < 6000; i++) n += w.tick(1 / 60, intensity).length; // 100 s
    return n;
  };
  const base = count(0.5);
  assert.equal(base, 100);
  assert.ok(Math.abs(count(0) / base - 0.7) <= 0.011, `${count(0)}`);
  assert.ok(Math.abs(count(1) / base - 1.3) <= 0.011, `${count(1)}`);
});

test("hullám: hibás forgatókönyv → RangeError; Rng objektum is átadható", () => {
  assert.throws(() => createWaveDirector([], () => 0.5), RangeError);
  assert.throws(() => createWaveDirector([{ id: "x", budget: 1, spawnEverySec: 0, enemies: [] }], () => 0.5), RangeError);
  assert.throws(() => createWaveDirector([{ id: "x", budget: 1, spawnEverySec: 1, enemies: [{ kind: "a", cost: 0, weight: 1 }] }], () => 0.5), RangeError);
  const w = createWaveDirector([{ id: "x", budget: 2, spawnEverySec: 1, enemies: [{ kind: "a", cost: 1, weight: 1 }] }], createRng(3));
  assert.deepEqual(w.tick(2, 0.5), ["a", "a"]);
});
