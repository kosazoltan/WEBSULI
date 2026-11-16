import assert from "node:assert/strict";
import test from "node:test";
import { medianOf, runSim, runSimSeeds, SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, type SimGameFactory } from "./support/game-sim";
import { createSimGame, wordLadderDirectorConfig } from "../client/src/lib/wordLadder/sim";
import { stateFingerprint } from "../client/src/lib/wordLadder/core";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import { REVEAL_CORRECT_MS, REVEAL_WRONG_MS } from "../client/src/game-engine/play/useQuestionDirector";
import { SIM_REVEAL_CORRECT_MS, SIM_REVEAL_WRONG_MS } from "../client/src/lib/wordLadder/sim";

/**
 * J2a — a Szikla-verseny szimulációs elfogadása (végrehajtás J2a 7., K.6; terv 6.2, J2, J3, J4, J6, J7, J9, J10):
 * 20 seed (`seedFrom("sim", "word-ladder-hu-en", i)`), a menet végéig (≤ 600 mp), a referencia-pályán (6. pálya,
 * 35 fok — a „14 fokos pálya” a régi létra-egységben; a fal-egység a `climbTarget`-ben).
 */

const GAME = "word-ladder-hu-en" as const;
const factory = (extra: Record<string, unknown> = {}): SimGameFactory => (o) => createSimGame({ ...o, ...extra });

const avg = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 600 });

test("a sim a közös kérdés-sáv kijelzési idejével számol (900 / 2000 ms) — a mérés a lap viselkedését méri", () => {
  assert.equal(SIM_REVEAL_CORRECT_MS, REVEAL_CORRECT_MS);
  assert.equal(SIM_REVEAL_WRONG_MS, REVEAL_WRONG_MS);
});

test("J2: kérdés/perc (SIM_AVERAGE, 20 seed medián) ≥ 10 — minden fogás egy kérdés", () => {
  const perMin = medianOf(avg.map((r) => r.stats.perMinute));
  assert.ok(perMin >= 10, `medián ${perMin.toFixed(2)} / perc`);
});

test("J3: a menet első 10 mp-e után nincs 8 mp-nél hosszabb kérdés nélküli szakasz; két indítás között ≥ 1,5 mp", () => {
  for (const r of avg) {
    assert.ok(r.stats.maxGapSec <= 8, `maxGap ${r.stats.maxGapSec}`);
    assert.ok(r.stats.minGapSec >= 1.5, `minGap ${r.stats.minGapSec}`);
  }
  for (const r of runSimSeeds(factory(), SIM_WEAK, { gameId: GAME, seconds: 600 })) assert.ok(r.stats.maxGapSec <= 8);
});

test("J9: a menet medián 2–5 perc a referencia-pályán (SIM_AVERAGE), és mindig véget ér", () => {
  const dur = medianOf(avg.map((r) => r.durationSec));
  assert.ok(dur >= 120 && dur <= 300, `medián ${dur.toFixed(0)} mp`);
  assert.ok(avg.every((r) => r.durationSec < 600), "minden menet véget ér 10 percen belül");
});

test("riválisos verseny: a SIM_AVERAGE a menetek 50–80%-át nyeri (szoros, de legyőzhető); veszíteni is lehet", () => {
  const wins = avg.filter((r) => r.won).length / avg.length;
  assert.ok(wins >= 0.5 && wins <= 0.8, `nyerési arány ${wins}`);
  assert.ok(avg.some((r) => !r.won), "van vereség");
  const strong = runSimSeeds(factory(), SIM_STRONG, { gameId: GAME, seconds: 600 });
  assert.ok(strong.filter((r) => r.won).length >= 18, "az erős játékos szinte mindig nyer");
});

test("J4: ismétlés — arány ≤ 30%, a hibázott tételek ≥ 95%-a (medián) a 3.–6. kérdésként visszatér", () => {
  for (const r of avg) assert.ok(r.stats.reviewShare <= 0.3 + 1e-9, `reviewShare ${r.stats.reviewShare}`);
  const within6 = medianOf(avg.map((r) => r.stats.reviewReturnWithin6));
  assert.ok(within6 >= 0.95, `3.–6. kérdésen belül: ${within6}`);
  const weak = runSimSeeds(factory(), SIM_WEAK, { gameId: GAME, seconds: 600 });
  assert.ok(medianOf(weak.map((r) => r.stats.reviewReturnWithin10)) >= 0.6);
});

test("J6: az új (nem ismétlő) kérdések bármely 40-es ablaka duplikátum nélküli (≥ 200 tételes forrás)", () => {
  for (const r of avg) {
    const fresh = r.stats.asked - r.stats.reviewsAsked;
    assert.equal(r.stats.freshWindow40Distinct, Math.min(40, fresh), `freshWindow40Distinct ${r.stats.freshWindow40Distinct} (${fresh} új)`);
  }
});

test("J7: elérhető tananyag-tételnél az első fogás tananyag, utána a bank folytatja", () => {
  const material = [1, 2, 3].map((n) => ({ id: `m${n}`, prompt: `Tananyag ${n}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  const g = createSimGame({ seed: 5, grade: 7, questions: true, material });
  for (let i = 0; i < 60 * 60 && !g.done(); i++) {
    const q = g.question();
    if (q) g.answer(q.id, q.correctOption);
    g.step(1000 / 60, { skillRoll: 0.5 });
  }
  const keys = g.askedKeys();
  assert.equal(g.stats().firstSource, "material");
  assert.deepEqual(keys.slice(0, 3), ["mat:m1", "mat:m2", "mat:m3"]);
  assert.ok(keys.slice(3).every((k) => k.startsWith("bank:")));
});

test("J10: a válaszablak rövid tételnél 4,5 mp (3–4. évfolyamon 5,6 mp), hosszúnál olvasási pótlékkal, ≤ 9 mp", () => {
  const cfg = wordLadderDirectorConfig(7);
  assert.equal(windowMsFor("Mit jelent: apple?", 7, cfg.baseWindowMs), 4500);
  assert.equal(windowMsFor("Mit jelent: apple?", 4, cfg.baseWindowMs), 5625);
  assert.ok(windowMsFor("x".repeat(400), 3, cfg.baseWindowMs) <= 9000);
  const young = runSimSeeds(factory(), SIM_YOUNG, { gameId: GAME, seconds: 600, grade: 4 });
  assert.ok(medianOf(young.map((r) => r.stats.perMinute)) >= 10, "a 3–4. évfolyamos átlagos játékosnál is ≥ 10 / perc");
});

test("első fogás 2 mp körül (terv 5.2): az első kérdés a FIRST_HOLD_MS-nél indul, nem a 0. pillanatban", () => {
  const g = createSimGame({ seed: 1, grade: 7, questions: true });
  let firstAt = -1;
  for (let i = 0; i < 300 && firstAt < 0; i++) {
    g.step(1000 / 60, { skillRoll: 0.5 });
    if (g.question()) firstAt = g.simTimeMs();
  }
  assert.ok(firstAt >= 1400 && firstAt <= 2100, `első kérdés: ${firstAt} ms`);
});

test("K.6 kérdés nélkül (questions: false): a menet szabad fogással végigjátszható, és van vesztési feltétel", () => {
  const noQ = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 600, questions: false });
  assert.ok(noQ.every((r) => r.durationSec < 600), "minden menet véget ér");
  assert.ok(noQ.some((r) => r.won), "megnyerhető");
  assert.ok(noQ.some((r) => !r.won), "elveszíthető (a rivális felér)");
  assert.ok(noQ.every((r) => r.stats.asked === 0));
  // Üres kérdésforrás (terv 8.1): ugyanígy szabad fogással megy.
  const empty = runSim(factory({ bankSize: 0 }), SIM_AVERAGE, { seed: 3, seconds: 600 });
  assert.equal(empty.stats.asked, 0);
  assert.ok(empty.durationSec < 600);
});

test("arany visszajátszás: fix seed + bot-bemenet → azonos végállapot és statisztika; a lenyomat rögzített", () => {
  const a = createSimGame({ seed: 42, grade: 7, questions: true });
  const b = createSimGame({ seed: 42, grade: 7, questions: true });
  const ra = runSim(() => a, SIM_AVERAGE, { seed: 42, seconds: 600 });
  const rb = runSim(() => b, SIM_AVERAGE, { seed: 42, seconds: 600 });
  assert.deepEqual(ra, rb);
  assert.equal(stateFingerprint(a.state()), stateFingerprint(b.state()));
  assert.equal(stateFingerprint(a.state()), GOLDEN_42);
});

const GOLDEN_42 = "won|188700|35|30|30.173479|7|7|29|7";
