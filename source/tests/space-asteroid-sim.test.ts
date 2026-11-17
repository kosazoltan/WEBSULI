import assert from "node:assert/strict";
import test from "node:test";

import { SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, medianOf, runSim, runSimSeeds, simSeeds, type SimGameFactory } from "./support/game-sim";
import { SIM_STEP_MS } from "../client/src/game-engine/play/loop";
import {
  ASTEROID_SLOW_MO,
  BOSS_TOTAL_HP,
  SIM_POWER_SEC,
  SIM_SHIELD_SEC,
  START_LIVES,
  asteroidDirectorConfig,
  createAsteroidDriver,
  createAsteroidWorld,
  createSimGame,
  questionTotals,
} from "../client/src/lib/spaceAsteroid/sim";
import { BOSS_WAVE, HIT_INVULN_SEC, TUTORIAL_SEC, WAVE_COUNT, waveEnemyCount } from "../client/src/lib/spaceAsteroid/physics";

/**
 * J6a — Galaktikus Aszteroida szimulációs elfogadás a közös harness-szel (végrehajtás K.6, J6a 5.; terv 6.2: J2, J3, J4, J6,
 * J7, J9; K.4/26). 20 seed (`seedFrom("sim", "space-asteroid-quiz", i)`), a terv játékosmodelljeivel; a „legfeljebb /
 * legalább” küszöbök mind a 20 futásra, a mediánosak a mediánra.
 *
 * MIT MÉR EZ A SZIMULÁCIÓ ÉS MIT NEM (őszintén): a kérdés-ütemezést, az ismétlést, a menet ívét (8 hullám + főellenfél, életek,
 * 2 mp sérthetetlenség, a rossz kristály 3 apró sziklája, a jó válasz fejlesztései) a lappal KÖZÖS kódon méri — meghajtó
 * (`createAsteroidDriver`), kérdés-ütemező, kérdés-sáv állapotgép, hullám-képlet (`physics.ts`), kristály-modul. A lap 3D
 * fizikáját (lövedék-röppálya, célzássegéd, ütközési gömbök) NEM futtatja: a bot ügyességét egy dobás helyettesíti, amelynek
 * küszöbeit a modell kalibrálja (`sim.ts`). A lapon mért kérdés/perc külön: `T/space-asteroid-play.spec.ts`.
 *
 * Review #486 M3 óta a modell a lappal KÖZÖS szabálymagot használ a felvehető elemekre (`dropChance`, `pickDropKind`,
 * `applyPickupEffect`), az ütközés szabályára (`lifeLossOutcome`) és az évfolyam-sáv szerinti könnyítésre (`gradeEase`); a hajóhoz
 * érő ellenfél csak `LATERAL_OVERLAP` eséllyel ütközik (a hajó oszlopába ér), a bot a hulló elemeket felveszi. Nem minden
 * ellenfél ütközik, ami nincs lelőve.
 *
 * Mért értékek (2026-11-17, ezen a gépen, 20 seed, 900 mp): győzelem kérdéssel / kérdés nélkül — SIM_YOUNG (3. évf.) 17 / 14,
 * SIM_AVERAGE 19 / 14, SIM_STRONG 20 / 20, SIM_WEAK 1 / 0; a pontos számokat a `console.log` sorok adják (`node --test`).
 */

const factory = createSimGame as unknown as SimGameFactory;
const GAME = "space-asteroid-quiz" as const;

function summary(name: string, runs: ReturnType<typeof runSimSeeds>): void {
  const s = runs.map((r) => r.stats);
  console.log(
    `[space-asteroid-sim] ${name}: kérdés/perc medián ${medianOf(s.map((x) => x.perMinute)).toFixed(2)}, ` +
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
  // J2: Aszteroida ≥ 4 kérdés/perc (medián)
  assert.ok(medianOf(s.map((x) => x.perMinute)) >= 4, `kérdés/perc medián ${medianOf(s.map((x) => x.perMinute))}`);
  // J3: kérdés nélküli leghosszabb szakasz ≤ 20 mp (az első 10 mp után), két indítás között ≥ 1,5 mp — mind a 20 futásban
  for (const x of s) {
    assert.ok(x.maxGapSec <= 20, `maxGap ${x.maxGapSec}`);
    assert.ok(x.minGapSec >= 1.5, `minGap ${x.minGapSec}`);
  }
  // J4: a hibázott tételek ≥ 95%-a a 3.–6. következő kérdésként tér vissza (medián); az ismétlés aránya ≤ 30% mindenhol
  assert.ok(medianOf(s.map((x) => x.reviewReturnWithin6)) >= 0.95, `3.–6.: ${medianOf(s.map((x) => x.reviewReturnWithin6))}`);
  for (const x of s) assert.ok(x.reviewShare <= 0.3 + 1e-9, `ismétlési arány ${x.reviewShare}`);
  // J6: az ismétlésnek nem minősülő kérdések MIND különböző tételek (a sim-bank ≥ 300 tétel)
  for (const x of s) assert.equal(x.distinctKeys, x.asked - x.reviewsAsked, `ismétlődő új tétel: ${x.distinctKeys} / ${x.asked - x.reviewsAsked}`);
  // A tanulás tényleg megtörténik: minden menetben van kérdés és válasz.
  for (const x of s) assert.ok(x.answered >= 5, `válaszok ${x.answered}`);
});

test("J4 — SIM_WEAK (45%): a hibázott tételek ≥ 60%-a ≤ 10 kérdésen belül visszatér (medián)", () => {
  const runs = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 180, grade: 7 });
  summary("SIM_WEAK 180 s", runs);
  assert.ok(medianOf(runs.map((r) => r.stats.reviewReturnWithin10)) >= 0.6);
  for (const r of runs) assert.ok(r.stats.reviewShare <= 0.3 + 1e-9);
});

test("J2 / J3 — SIM_YOUNG (3. évfolyam, ×1,25 ablak): ≥ 4 kérdés/perc és ≤ 20 mp kérdés nélküli szakasz", () => {
  const runs = runSimSeeds(factory, SIM_YOUNG, { gameId: GAME, seconds: 180, grade: 3 });
  summary("SIM_YOUNG 180 s (3. évf.)", runs);
  assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 4);
  for (const r of runs) assert.ok(r.stats.maxGapSec <= 20, `maxGap ${r.stats.maxGapSec}`);
});

test("J9 / K.4/26 — a menet íve: SIM_AVERAGE medián 2–5 perc, a menetnek vége van (életalapú), veszíteni is lehet", () => {
  const avg = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 900, grade: 7 });
  summary("SIM_AVERAGE a menet végéig", avg);
  const med = medianOf(avg.map((r) => r.durationSec));
  assert.ok(med >= 120 && med <= 300, `menethossz medián ${med} s`);
  assert.ok(avg.every((r) => r.durationSec < 600), "minden menet véget ér 10 percen belül (nincs idő-limit, mégis véges)");
  assert.ok(avg.filter((r) => r.won).length >= 8, "az átlagos játékos gyakran végigviszi");
  assert.ok(avg.some((r) => !r.won), "az átlagos játékos olykor veszít (az életek elfogynak)");
  const weak = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 900, grade: 7 });
  summary("SIM_WEAK a menet végéig", weak);
  assert.ok(weak.some((r) => !r.won && r.durationSec < 600), "van vereség (az életek elfogynak)");
  assert.ok(medianOf(weak.map((r) => r.durationSec)) >= 60, "a vereség nem azonnali (a medián ≥ 1 perc játék)");
  const strong = runSimSeeds(factory, SIM_STRONG, { gameId: GAME, seconds: 900, grade: 7 });
  summary("SIM_STRONG a menet végéig", strong);
  assert.ok(strong.every((r) => r.won), "az erős játékos nyer");
  assert.ok(medianOf(strong.map((r) => r.durationSec)) >= 120, "az erős játékos sem végez 2 percen belül");
});

test("kérdés nélküli mód (K.6): a menet végigjátszható, és van vesztési feltétel", () => {
  const strong = runSimSeeds(factory, SIM_STRONG, { gameId: GAME, seconds: 900, questions: false });
  const avg = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 900, questions: false });
  const weak = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 900, questions: false });
  console.log(
    `[space-asteroid-sim] kérdés nélkül: SIM_STRONG győzelem ${strong.filter((r) => r.won).length}/20, SIM_AVERAGE ${avg.filter((r) => r.won).length}/20, SIM_WEAK ${weak.filter((r) => r.won).length}/20`,
  );
  assert.ok(strong.some((r) => r.won), "kérdés nélkül is végigjátszható");
  assert.ok(avg.some((r) => !r.won && r.durationSec < 900) && weak.every((r) => !r.won), "kérdés nélkül is el lehet veszíteni");
  for (const r of [...strong, ...avg, ...weak]) assert.equal(r.stats.asked, 0, "kérdés nélküli módban nincs kérdés");
});

test("J1 — nyitott kérdés alatt a világ ≥ 0,35× sebességgel fut (a lassítás 0,7×, soha nem áll meg)", () => {
  assert.equal(ASTEROID_SLOW_MO, 0.7);
  assert.equal(asteroidDirectorConfig(7).slowMo, 0.7);
  const seed = simSeeds(GAME, 1)[0]!;
  const sim = createSimGame({ seed, grade: 7, questions: true });
  let guard = 0;
  while (!sim.question() && guard++ < 6000) sim.step(SIM_STEP_MS, { skillRoll: 0.5 });
  assert.ok(sim.question(), "a menetben nyílik kérdés");
  const worldBefore = sim.world.steps();
  const clockBefore = sim.simTimeMs();
  // 1 mp valós idő nyitott kérdés mellett (a bot nem válaszol)
  for (let i = 0; i < 60 && sim.question(); i++) sim.step(SIM_STEP_MS, { skillRoll: 0.5 });
  const worldMs = (sim.world.steps() - worldBefore) * SIM_STEP_MS;
  const realMs = sim.simTimeMs() - clockBefore;
  assert.ok(realMs > 500, `valós idő ${realMs}`);
  assert.ok(worldMs / realMs >= 0.35, `világ / valós = ${(worldMs / realMs).toFixed(2)}`);
  assert.ok(worldMs / realMs <= 0.8, `a lassítás látszik: ${(worldMs / realMs).toFixed(2)}`);
});

test("hullámok: 8 hullám + főellenfél, a hullám-váltás kapu nélküli (azonnali), a főellenfél 90 HP-ja", () => {
  assert.equal(WAVE_COUNT, 8);
  assert.equal(BOSS_WAVE, 9);
  assert.equal(BOSS_TOTAL_HP, 90);
  assert.equal(waveEnemyCount(BOSS_WAVE), 1);
  const wins = simSeeds(GAME, 20).map((seed) => {
    const sim = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => sim as never, SIM_STRONG, { seed, seconds: 900, grade: 7 });
    return sim;
  });
  for (const sim of wins) {
    const st = sim.world.state();
    assert.equal(st.phase, "won");
    assert.equal(st.wave, BOSS_WAVE, "a főellenfél hullámában ért véget");
    assert.equal(st.waveChanges, WAVE_COUNT, "8 hullám-váltás: nincs kapu, nincs kimaradó hullám");
    assert.equal(st.bossHp, 0);
  }
});

test("a rossz kristály 3 apró sziklára hasad; a jó válasz fejlesztése az intenzitás szerint: pajzs / hármas lövés / bomba", () => {
  const w = createAsteroidWorld({ seed: 5, band: () => 0.4, signal: () => {} });
  assert.equal(w.state().threats.length, 0);
  w.shatter({ x: 1, y: 5 });
  assert.equal(w.state().threats.length, 3);
  assert.equal(w.state().shardsSpawned, 3);
  assert.ok(w.state().threats.every((t) => t.kind === "rock" && t.size === 1 && t.hp === 1 && t.vy < 0));
  assert.equal(w.upgrade(0.1), "shield");
  assert.equal(w.state().shield, SIM_SHIELD_SEC);
  assert.equal(w.upgrade(0.5), "triple");
  assert.equal(w.state().power, SIM_POWER_SEC);
  assert.equal(w.upgrade(0.9), "bomb");
  assert.equal(w.state().bombs, 1);
  // a bomba minden ellenfelet eltüntet
  assert.equal(w.detonate(), true);
  assert.equal(w.state().threats.length, 0);
  assert.equal(w.detonate(), false, "bomba nélkül nincs robbanás");
});

// SPEC-VÁLTOZÁS 2026-11-17 (J6a review #486 M3, oldalirányú átfedés): az ütközés-próbák `overlap: 1`-gyel kényszerítik az átfedést; a szigor nem csökken.
test("ütközés: élet −1 és 2 mp sérthetetlenség, nem kvíz; a pajzs és a sérthetetlenség alatt nincs sérülés", () => {
  assert.equal(HIT_INVULN_SEC, 2);
  assert.equal(START_LIVES, 3);
  let damage = 0;
  const w = createAsteroidWorld({ seed: 1, overlap: 1, band: () => 0.4, signal: (k) => { if (k === "damage") damage += 1; } });
  // a tanító szakasz (30 mp, nincs életvesztés) és a menet eleji sérthetetlenség lejár, mielőtt a próba kezdődik
  for (let i = 0; i < 31 * 60; i++) w.step(SIM_STEP_MS, { dodgeRoll: 0 });
  assert.equal(w.state().lives, START_LIVES);
  // egy közvetlenül a hajónál lévő szikla, a kitérés sikertelen (dobás 5 ≥ küszöb)
  w.shatter({ x: 0, y: -4.5 });
  for (let i = 0; i < 90; i++) w.step(SIM_STEP_MS, { dodgeRoll: 5 });
  const st = w.state();
  assert.equal(st.lives, START_LIVES - 1, "az első ütközés egy életbe kerül");
  assert.equal(damage, 1, "a mini-Director sérülés-jelzést kap");
  assert.equal(st.hits, 1);
  // a sérthetetlenség alatt (a következő 2 mp) újabb ütközés nem von le életet
  w.shatter({ x: 0, y: -4.5 });
  w.step(SIM_STEP_MS, { dodgeRoll: 5 });
  w.step(SIM_STEP_MS, { dodgeRoll: 5 });
  assert.equal(w.state().lives, START_LIVES - 1);
});

test("a menet statisztikája valós kérdés-szám (recordRun: correctAnswers / wrongAnswers) — nem „leszedett ellenfél ≈ helyes válasz”", () => {
  assert.deepEqual(questionTotals(null), { correct: 0, wrong: 0, total: 0 });
  assert.deepEqual(questionTotals({ correct: 5, wrong: 2, timeouts: 1 }), { correct: 5, wrong: 3, total: 8 }, "a lejárt kérdés hibának számít");
  for (const seed of simSeeds(GAME, 6)) {
    const sim = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => sim as never, SIM_AVERAGE, { seed, seconds: 900, grade: 7 });
    const st = sim.stats();
    const t = questionTotals(st);
    assert.equal(t.correct, st.correct);
    assert.equal(t.wrong, st.wrong + st.timeouts);
    assert.equal(t.total, st.answered + st.timeouts);
    assert.ok(t.total > 0 && t.total <= st.asked, "a válaszolt + lejárt ≤ feltett (a megszakított nem számít)");
    // a leszedett ellenfelek száma NEM a kérdés-szám (a régi proxy)
    assert.notEqual(t.correct, sim.world.state().kills);
  }
});

test("arany visszajátszás (J19): azonos seed → azonos végállapot és statisztika; más seed → más menet", () => {
  const seed = simSeeds(GAME, 1)[0]!;
  const a = runSim(factory, SIM_AVERAGE, { seed, seconds: 120, grade: 5 });
  const b = runSim(factory, SIM_AVERAGE, { seed, seconds: 120, grade: 5 });
  assert.deepEqual(a, b);
  const c = runSim(factory, SIM_AVERAGE, { seed: seed + 1, seconds: 120, grade: 5 });
  assert.notDeepEqual(a.stats, c.stats);
});

test("közös meghajtó (K.6): eltérő képkocka-időknél, lépés-indexhez kötött bemenettel az állapot bitre azonos", () => {
  // A J4a pilot tanulsága: a `dt × timeScale` lépéssel futó sim más ellenfélsort mért, mint a lap. A közös meghajtó a fix
  // lépésű hurkon át lépteti a világot, így az N. lépés utáni állapot a seedtől és a lépésenkénti bemenettől függ, a
  // képkocka-időktől nem. A bemenet a lépés SORSZÁMÁNAK függvénye; az N. lépés után a világ nem lép tovább (azonos végpont).
  const N = 1800;
  const run = (frameMs: number): string => {
    const world = createAsteroidWorld({ seed: 77, band: () => 0.4, signal: () => {} });
    const roll = (n: number) => ((n * 2654435761) % 1000) / 1000;
    const driver = createAsteroidDriver({
      seed: 77,
      questions: null,
      step: (dtMs) => {
        if (world.steps() < N) world.step(dtMs, { dodgeRoll: roll(world.steps()) });
      },
      over: () => world.state().phase !== "play",
    });
    for (let guard = 0; world.steps() < N; guard++) {
      driver.frame(frameMs, false);
      assert.ok(guard < 100_000, "a világ nem lép előre");
    }
    return world.digest();
  };
  const base = run(SIM_STEP_MS);
  for (const frameMs of [1000 / 120, 1000 / 30, 41]) {
    assert.equal(run(frameMs), base, `${frameMs.toFixed(1)} ms-os képkockákkal más állapot`);
  }
  assert.equal(JSON.parse(base).steps, N);
});

test("tanító szakasz (K.4/25): az első 30 mp-ben az ütközés nem von le életet, utána igen", () => {
  assert.equal(TUTORIAL_SEC, 30);
  const w = createAsteroidWorld({ seed: 3, overlap: 1, band: () => 0.4, signal: () => {} });
  // 20 mp-nél: közvetlenül a hajónál lévő szikla, sikertelen kitérés
  for (let i = 0; i < 20 * 60; i++) w.step(SIM_STEP_MS, { dodgeRoll: 0 });
  w.shatter({ x: 0, y: -4.5 });
  w.step(SIM_STEP_MS, { dodgeRoll: 5 });
  assert.equal(w.state().lives, START_LIVES, "a tanító szakaszban az ütközés nem vesz életet");
  assert.equal(w.state().hits, 0);
  // 35 mp-nél már igen (a sérthetetlenség közben lejárt)
  for (let i = 0; i < 15 * 60; i++) w.step(SIM_STEP_MS, { dodgeRoll: 0 });
  w.shatter({ x: 0, y: -4.5 });
  w.step(SIM_STEP_MS, { dodgeRoll: 5 });
  assert.equal(w.state().lives, START_LIVES - 1);
});

test("J9 / review #486 M3 — nyerési arány (mint a Matek): a 3–4. évfolyamos modell ≥ 12/20-szor nyer kérdésekkel, és a tudás SEGÍT (kérdéssel nem több a vereség, mint nélkül)", () => {
  const models = [
    ["SIM_YOUNG (3. évf.)", SIM_YOUNG, 3],
    ["SIM_AVERAGE (7. évf.)", SIM_AVERAGE, 7],
    ["SIM_STRONG (7. évf.)", SIM_STRONG, 7],
    ["SIM_WEAK (7. évf.)", SIM_WEAK, 7],
  ] as const;
  for (const [name, model, grade] of models) {
    const withQ = runSimSeeds(factory, model, { gameId: GAME, seconds: 900, grade, questions: true });
    const noQ = runSimSeeds(factory, model, { gameId: GAME, seconds: 900, grade, questions: false });
    const winsQ = withQ.filter((r) => r.won).length;
    const winsNo = noQ.filter((r) => r.won).length;
    console.log(`[space-asteroid-sim] ${name}: győzelem kérdéssel ${winsQ}/20, kérdés nélkül ${winsNo}/20`);
    assert.ok(winsQ >= winsNo, `${name}: kérdéssel ${winsQ} győzelem < kérdés nélkül ${winsNo} (több vereség a kérdésekkel)`);
    if (model === SIM_YOUNG) assert.ok(winsQ >= 12, `${name}: ${winsQ}/20 győzelem kérdésekkel (kell ≥ 12)`);
  }
});

test("a felvehető elemek (élet / pajzs / erő / bomba) a szimulációban is működnek, a lappal közös drop-táblával és hatással", () => {
  const picked = simSeeds(GAME, 20).map((seed) => {
    const sim = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => sim as never, SIM_AVERAGE, { seed, seconds: 900, grade: 7 });
    return sim.world.state().pickedUp;
  });
  assert.ok(picked.some((n) => n > 0), "a menetekben van felvett elem");
  assert.ok(medianOf(picked) >= 2, `felvett elem medián ${medianOf(picked)}`);
});

test("J7 — a menet első kérdése a tananyag (material) tétele, utána a bank folytatja", () => {
  const material = [1, 2, 3].map((n) => ({ id: `m${n}`, prompt: `Tananyag ${n}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  const sim = createSimGame({ seed: 5, grade: 7, questions: true, material });
  for (let i = 0; i < 60 * 90 && !sim.done(); i++) {
    const q = sim.question();
    if (q) sim.answer(q.id, q.correctOption);
    sim.step(SIM_STEP_MS, { skillRoll: 0.5 });
  }
  const keys = sim.askedKeys();
  assert.equal(sim.stats().firstSource, "material");
  assert.deepEqual(keys.slice(0, 3), ["mat:m1", "mat:m2", "mat:m3"]);
  assert.ok(keys.length > 3 && keys.slice(3).every((k) => !k.startsWith("mat:")), "a tananyag elfogyása után a bank folytatja");
});
