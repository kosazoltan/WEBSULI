import assert from "node:assert/strict";
import test from "node:test";

import { SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, medianOf, runSim, runSimSeeds, simSeeds, type SimGameFactory } from "./support/game-sim";
import { createSimGame } from "../client/src/lib/speedMath/sim";

/**
 * J4a — „Neon védőtorony” szimulációs elfogadás a közös harness-szel (végrehajtás K.6, J4a 6.; terv 6.2, J2, J3, J4, J6,
 * J9; K.4/26). 20 seed (`seedFrom("sim", "speed-quiz-math", i)`), a terv játékosmodelljeivel. A „legfeljebb / legalább”
 * küszöbök mind a 20 futásra, a mediános küszöbök a mediánra.
 *
 * Mért értékek (2026-11-16, ezen a gépen; a PR-ban és a jelentésben is): lásd a `console.log` sorokat (`node --test`).
 */

const factory = createSimGame as unknown as SimGameFactory;
const GAME = "speed-quiz-math" as const;

function summary(name: string, runs: ReturnType<typeof runSimSeeds>): void {
  const s = runs.map((r) => r.stats);
  console.log(
    `[speed-math-sim] ${name}: kérdés/perc medián ${medianOf(s.map((x) => x.perMinute)).toFixed(2)}, ` +
      `kérdés nélküli leghosszabb ${Math.max(...s.map((x) => x.maxGapSec)).toFixed(2)} s, ` +
      `legrövidebb indítási rés ${Math.min(...s.map((x) => x.minGapSec)).toFixed(2)} s, ` +
      `ismétlés 3.–6. medián ${medianOf(s.map((x) => x.reviewReturnWithin6)).toFixed(2)}, ≤ 10 medián ${medianOf(s.map((x) => x.reviewReturnWithin10)).toFixed(2)}, ` +
      `ismétlési arány max ${Math.max(...s.map((x) => x.reviewShare)).toFixed(2)}, ` +
      `menethossz medián ${(medianOf(runs.map((r) => r.durationSec)) / 60).toFixed(2)} perc, győzelem ${runs.filter((r) => r.won).length}/20`,
  );
}

test("J2 / J3 / J4 / J6 — SIM_AVERAGE, 7. évfolyam, 180 mp × 20 seed", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 180, grade: 7 });
  summary("SIM_AVERAGE 180 s", runs);
  const s = runs.map((r) => r.stats);
  // J2: Matek ≥ 10 kérdés/perc (medián)
  assert.ok(medianOf(s.map((x) => x.perMinute)) >= 10, `kérdés/perc medián ${medianOf(s.map((x) => x.perMinute))}`);
  // J3: kérdés nélküli leghosszabb szakasz ≤ 6 mp (az első 10 mp után), két indítás között ≥ 1,5 mp — mind a 20 futásban
  for (const x of s) {
    assert.ok(x.maxGapSec <= 6, `maxGap ${x.maxGapSec}`);
    assert.ok(x.minGapSec >= 1.5, `minGap ${x.minGapSec}`);
  }
  // J4: a hibázott tételek ≥ 95%-a a 3.–6. következő kérdésként tér vissza (medián); az ismétlés aránya ≤ 30% mindenhol
  assert.ok(medianOf(s.map((x) => x.reviewReturnWithin6)) >= 0.95, `3.–6.: ${medianOf(s.map((x) => x.reviewReturnWithin6))}`);
  for (const x of s) assert.ok(x.reviewShare <= 0.3 + 1e-9, `ismétlési arány ${x.reviewShare}`);
  // J6: az új (nem ismétlés) kérdések bármely 40-es ablakában nincs duplikátum (a sim-bank ≥ 300 tétel)
  // J4b: a Becslő-bomba (`noReview`) nem számít a változatossági ablakba, ezért a régi „ablak ≥ min(40, új kérdések)”
  // összevetés helyett a szigorúbb feltétel: az ismétlésnek nem minősülő kérdések MIND különböző tételek (a menet egészén).
  for (const x of s) assert.equal(x.distinctKeys, x.asked - x.reviewsAsked, `ismétlődő új tétel: ${x.distinctKeys} / ${x.asked - x.reviewsAsked}`);
  // A tanulás tényleg megtörténik: minden menetben van kérdés és válasz.
  for (const x of s) assert.ok(x.answered >= 20, `válaszok ${x.answered}`);
});

test("J4 — SIM_WEAK (45%): a hibázott tételek ≥ 60%-a ≤ 10 kérdésen belül visszatér (medián)", () => {
  const runs = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 180, grade: 7 });
  summary("SIM_WEAK 180 s", runs);
  assert.ok(medianOf(runs.map((r) => r.stats.reviewReturnWithin10)) >= 0.6);
  for (const r of runs) assert.ok(r.stats.reviewShare <= 0.3 + 1e-9);
});

test("J2 — SIM_YOUNG (3. évfolyam, ×1,25 ablak): ≥ 10 kérdés/perc és ≤ 6 mp kérdés nélküli szakasz", () => {
  const runs = runSimSeeds(factory, SIM_YOUNG, { gameId: GAME, seconds: 180, grade: 3 });
  summary("SIM_YOUNG 180 s (3. évf.)", runs);
  assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 10);
  for (const r of runs) assert.ok(r.stats.maxGapSec <= 6, `maxGap ${r.stats.maxGapSec}`);
});

test("J9 / K.4/26 — a menet íve: SIM_AVERAGE medián 2–5 perc, a menetnek vége van; veszíteni is lehet (gyengébb játékos)", () => {
  const avg = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 600, grade: 7 });
  summary("SIM_AVERAGE a menet végéig", avg);
  const med = medianOf(avg.map((r) => r.durationSec));
  assert.ok(med >= 120 && med <= 300, `menethossz medián ${med} s`);
  assert.ok(avg.every((r) => r.durationSec < 600), "minden menet véget ér 10 percen belül");
  assert.ok(avg.filter((r) => r.won).length >= 12, "az átlagos játékos többnyire megvédi a tornyot");
  const weak = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 600, grade: 7 });
  summary("SIM_WEAK a menet végéig", weak);
  assert.ok(weak.some((r) => !r.won && r.durationSec < 600), "van vereség (a pajzs elfogy)");
  assert.ok(weak.every((r) => r.durationSec >= 60), "a vereség nem azonnali (≥ 1 perc játék)");
  const strong = runSimSeeds(factory, SIM_STRONG, { gameId: GAME, seconds: 600, grade: 7 });
  summary("SIM_STRONG a menet végéig", strong);
  assert.ok(strong.every((r) => r.won), "az erős játékos nyer");
});

test("kérdés nélküli mód (K.6): a menet végigjátszható, és van vesztési feltétel", () => {
  const avg = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 600, questions: false });
  const weak = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 600, questions: false });
  console.log(`[speed-math-sim] kérdés nélkül: SIM_AVERAGE győzelem ${avg.filter((r) => r.won).length}/20, SIM_WEAK győzelem ${weak.filter((r) => r.won).length}/20`);
  assert.ok(avg.some((r) => r.won), "kérdés nélkül is végigjátszható");
  assert.ok(weak.some((r) => !r.won && r.durationSec < 600), "kérdés nélkül is el lehet veszíteni");
  for (const r of avg) assert.equal(r.stats.asked, 0, "kérdés nélküli módban nincs kérdés");
});

test("a kérdés segít, nem büntet: ügyetlenebb kéz (skill 0,6), átlagos számolás (75%, 2,8 s) — kérdéssel kevesebb vereség", () => {
  // Mért (review #451 után, a lap léptetésével): a lassú számoló (SIM_WEAK, 4 s medián reakció a 4,5 s-os ablakhoz) sokat
  // késik, ott a kérdés teher — ezt a flow-sáv könnyíti, nem a játék; a mérés a jelentésben szerepel.
  const player = { ...SIM_AVERAGE, skill: 0.6 };
  const withQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 600, grade: 7 });
  const noQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 600, questions: false });
  const lostQ = withQ.filter((r) => !r.won).length;
  const lostNoQ = noQ.filter((r) => !r.won).length;
  const slowQ = runSimSeeds(factory, { ...SIM_WEAK, accuracy: 0.75 }, { gameId: GAME, seconds: 600, grade: 7 }).filter((r) => !r.won).length;
  const slowNoQ = runSimSeeds(factory, { ...SIM_WEAK, accuracy: 0.75 }, { gameId: GAME, seconds: 600, questions: false }).filter((r) => !r.won).length;
  console.log(`[speed-math-sim] skill 0,6 / 75% / 2,8 s: vereség kérdéssel ${lostQ}/20, kérdés nélkül ${lostNoQ}/20; lassú számoló (4 s): ${slowQ}/20 vs ${slowNoQ}/20`);
  assert.ok(lostQ <= lostNoQ, `kérdéssel ${lostQ}, kérdés nélkül ${lostNoQ}`);
});

test("arany visszajátszás (J19): azonos seed → azonos végállapot és statisztika", () => {
  const seed = simSeeds(GAME, 1)[0]!;
  const a = runSim(factory, SIM_AVERAGE, { seed, seconds: 120, grade: 5 });
  const b = runSim(factory, SIM_AVERAGE, { seed, seconds: 120, grade: 5 });
  assert.deepEqual(a, b);
  const c = runSim(factory, SIM_AVERAGE, { seed: seed + 1, seconds: 120, grade: 5 });
  assert.notDeepEqual(a.stats, c.stats);
});

test("J4b — a kérdés egyik játékosmodellnél sem büntet: kérdéssel ≤ annyi vereség, mint nélküle (a lassú, de pontos számolónál is)", () => {
  const SIM_SLOW_ACCURATE = { accuracy: 0.85, reactionMedianMs: 4000, skill: 0.8 };
  const models = [
    ["SIM_AVERAGE", SIM_AVERAGE, 7],
    ["SIM_YOUNG", SIM_YOUNG, 3],
    ["SIM_STRONG", SIM_STRONG, 7],
    ["SIM_WEAK", SIM_WEAK, 7],
    ["lassú, pontos (85%, 4 s)", SIM_SLOW_ACCURATE, 7],
  ] as const;
  for (const [name, player, grade] of models) {
    const withQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 900, grade });
    const noQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 900, grade, questions: false });
    const lostQ = withQ.filter((r) => !r.won).length;
    const lostNoQ = noQ.filter((r) => !r.won).length;
    console.log(`[speed-math-sim] ${name}: győzelem kérdéssel ${20 - lostQ}/20, kérdés nélkül ${20 - lostNoQ}/20; menethossz medián ${(medianOf(withQ.map((r) => r.durationSec)) / 60).toFixed(2)} perc`);
    assert.ok(lostQ <= lostNoQ, `${name}: kérdéssel ${lostQ}, nélküle ${lostNoQ} vereség`);
  }
});

test("J4b — a Zéró-robot harca a menet csúcspontja: SIM_AVERAGE-nél elér hozzá, és a harc 30–150 mp", () => {
  const seeds = simSeeds(GAME, 20);
  const fights: number[] = [];
  for (const seed of seeds) {
    const g = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => g as never, SIM_AVERAGE, { seed, seconds: 900, grade: 7 });
    const f = g.bossFight();
    assert.ok(f.startMs !== null, `${seed}: a menet eljut a főellenfélig`);
    if (f.endMs !== null) fights.push((f.endMs - f.startMs!) / 1000);
  }
  const med = medianOf(fights);
  console.log(`[speed-math-sim] Zéró-robot harca (SIM_AVERAGE): medián ${med.toFixed(1)} s, ${fights.length}/20 lezárult`);
  assert.ok(med >= 30 && med <= 150, `harc medián ${med}`);
});

test("J4b — győzelmi arány évfolyam-sávonként (SIM_AVERAGE; 3–4. évf. SIM_YOUNG): mérés a jelentéshez", () => {
  for (const [label, player, grade] of [["3. évf. (YOUNG)", SIM_YOUNG, 3], ["4. évf. (YOUNG)", SIM_YOUNG, 4], ["7. évf.", SIM_AVERAGE, 7], ["11. évf.", SIM_AVERAGE, 11]] as const) {
    const runs = runSimSeeds(factory, player, { gameId: GAME, seconds: 900, grade });
    const won = runs.filter((r) => r.won).length;
    console.log(`[speed-math-sim] ${label}: győzelem ${won}/20, kérdés/perc medián ${medianOf(runs.map((r) => r.stats.perMinute)).toFixed(2)}`);
    assert.ok(won >= 12, `${label}: ${won}/20`);
  }
});
