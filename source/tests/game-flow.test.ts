import assert from "node:assert/strict";
import test from "node:test";
import { createRng, seedFrom } from "../shared/game-rng";
import { createFlowController, FLOW_BAND_MAX } from "../client/src/game-engine/play/flow";
import { DIFFICULTY_FLOOR } from "../client/src/game-engine/difficulty";

/**
 * J0b — áramlat-vezérlő (végrehajtás J0b „Tesztek”; terv 6.2 „Adaptivitás”, J8): kiinduló sáv 0,40; 95%-os szimulált
 * játékosnál a `band` 30 kérdésen belül ≥ 0,75 és az `intensity` nő; 45%-osnál a `band` ≤ 0,35 és az `intensity` csökken;
 * a 75%-os játékosnál 60 kérdés után a csúszó (utolsó 20) sikerarány 65–90% (seed 1–20). A játékosmodell a terv 6.2
 * „Szimulációs paraméterei” szerint: helyes arány és log-normális reakcióidő (σ = 0,35) a mediánnal.
 */

const PLAYERS = {
  strong: { accuracy: 0.95, reactionMedianMs: 1800 },
  average: { accuracy: 0.75, reactionMedianMs: 2800 },
  weak: { accuracy: 0.45, reactionMedianMs: 4000 },
};
const WINDOW_MS = 5000;

function answers(player: { accuracy: number; reactionMedianMs: number }, seed: number, count: number) {
  const rng = createRng(seedFrom("flow", player.accuracy, seed));
  const out: Array<{ correct: boolean; responseMs: number }> = [];
  for (let i = 0; i < count; i++) {
    const u1 = Math.max(Number.EPSILON, rng.next());
    const u2 = rng.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const responseMs = player.reactionMedianMs * Math.exp(0.35 * z);
    out.push({ correct: responseMs <= WINDOW_MS && rng.next() < player.accuracy, responseMs: Math.min(responseMs, WINDOW_MS) });
  }
  return out;
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

test("95%-os játékos: 30 válaszon belül band ≥ 0,75 és az intensity nő (seed 1–20, mindegyik)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const flow = createFlowController({ startBand: 0.4 });
    const start = flow.intensity();
    let reached = -1;
    answers(PLAYERS.strong, seed, 30).forEach((a, i) => {
      flow.push({ kind: "answer", correct: a.correct, responseMs: a.responseMs, windowMs: WINDOW_MS });
      if (reached < 0 && flow.band() >= 0.75) reached = i + 1;
    });
    assert.ok(reached > 0 && reached <= 30, `seed ${seed}: band ${flow.band()}`);
    assert.ok(flow.intensity() > start, `seed ${seed}: intensity ${start} → ${flow.intensity()}`);
  }
});

test("45%-os játékos: band ≤ 0,35 és az intensity csökken (30 válasz után, seed 1–20, mindegyik)", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const flow = createFlowController({ startBand: 0.4 });
    const start = flow.intensity();
    for (const a of answers(PLAYERS.weak, seed, 30)) flow.push({ kind: "answer", correct: a.correct, responseMs: a.responseMs, windowMs: WINDOW_MS });
    assert.ok(flow.band() <= 0.35, `seed ${seed}: band ${flow.band()}`);
    assert.ok(flow.intensity() < start, `seed ${seed}: intensity ${start} → ${flow.intensity()}`);
  }
});

test("75%-os játékos: 60 válasz után a csúszó (utolsó 20) sikerarány 65–90% (seed 1–20 mediánja)", () => {
  const rates: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const flow = createFlowController({ startBand: 0.4 });
    for (const a of answers(PLAYERS.average, seed, 60)) flow.push({ kind: "answer", correct: a.correct, responseMs: a.responseMs, windowMs: WINDOW_MS });
    rates.push(flow.successRate(20));
  }
  const m = median(rates);
  assert.ok(m >= 0.65 && m <= 0.9, `medián ${m} (${rates.join(" ")})`);
});

test("padló 0,15 / plafon 0,95; a sáv a GE/difficulty.ts szabályát követi (3 jó +0,10, 2 rossz −0,15)", () => {
  const up = createFlowController({ startBand: 0.4 });
  const ok = { kind: "answer" as const, correct: true, responseMs: 1000, windowMs: 4000 };
  const bad = { kind: "answer" as const, correct: false, responseMs: 4000, windowMs: 4000 };
  up.push(ok);
  up.push(ok);
  assert.equal(up.band(), 0.4);
  up.push(ok);
  assert.ok(Math.abs(up.band() - 0.5) < 1e-9);
  for (let i = 0; i < 50; i++) up.push(ok);
  assert.equal(up.band(), FLOW_BAND_MAX);
  assert.equal(FLOW_BAND_MAX, 0.95);
  const down = createFlowController({ startBand: 0.4 });
  down.push(bad);
  assert.equal(down.band(), 0.4);
  down.push(bad);
  assert.ok(Math.abs(down.band() - 0.25) < 1e-9);
  for (let i = 0; i < 50; i++) down.push(bad);
  assert.equal(down.band(), DIFFICULTY_FLOOR);
  // A kiinduló sáv is a [0,15; 0,95] közé szorul.
  assert.equal(createFlowController({ startBand: 2 }).band(), 0.95);
  assert.equal(createFlowController({ startBand: -1 }).band(), 0.15);
  assert.equal(createFlowController({ startBand: Number.NaN }).band(), 0.15);
});

test("intensity: EMA α = 0,15 — gyors jó válasz 1 felé, lassú jó 0,6 felé, hiba és sérülés 0 felé; súlyozott játékjel", () => {
  const f = createFlowController({ startBand: 0.4, startIntensity: 0.5 });
  f.push({ kind: "answer", correct: true, responseMs: 1000, windowMs: 4000 }); // < 50% ablak
  assert.ok(Math.abs(f.intensity() - (0.5 + 0.15 * 0.5)) < 1e-12);
  const g = createFlowController({ startBand: 0.4, startIntensity: 0.5 });
  g.push({ kind: "answer", correct: true, responseMs: 3000, windowMs: 4000 });
  assert.ok(Math.abs(g.intensity() - (0.5 + 0.15 * 0.1)) < 1e-12);
  const h = createFlowController({ startBand: 0.4, startIntensity: 0.5 });
  h.push({ kind: "game", good: false, weight: 2 });
  assert.ok(Math.abs(h.intensity() - (0.5 - 0.3 * 0.5)) < 1e-12);
  h.push({ kind: "game", good: true, weight: 100 }); // α × súly legfeljebb 1
  assert.equal(h.intensity(), 1);
  for (let i = 0; i < 200; i++) h.push({ kind: "answer", correct: false, responseMs: 4000, windowMs: 4000 });
  assert.ok(h.intensity() >= 0 && h.intensity() < 0.01);
  assert.equal(h.successRate(), 0);
  assert.equal(createFlowController({ startBand: 0.4 }).successRate(), 0, "válasz nélkül 0");
});
