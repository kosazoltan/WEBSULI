/* eslint-disable no-console -- a mért szimulációs értékek naplója (a PR és a jelentés ebből idéz) */
import assert from "node:assert/strict";
import test from "node:test";

import { SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, medianOf, runSim, runSimSeeds, simSeeds, type SimGameFactory } from "./support/game-sim";
import {
  advanceTornado,
  couponRepeat,
  createChaseDriver,
  createSimGame,
  levelForGrade,
  tornadoDirectorConfig,
  winReward,
  type ChaseQuestions,
  type SimDrivePattern,
  type TornadoSim,
} from "../client/src/lib/tornado/sim";
import { levelSpec } from "../client/src/lib/tornado/levels";
import { anchorBandState, anchorOutcome } from "../client/src/lib/tornado/scoring";
import { MAX_UPGRADE_LEVEL, effectiveAnchorBand, effectiveStats, emptyUpgrades } from "../client/src/lib/tornado/upgrades";
import { VEHICLES } from "../client/src/lib/tornado/vehicles";

/**
 * J7b — Tornado Hunter 200 szimulációs elfogadás a közös harness-szel (végrehajtás K.6, J7b 5.; terv 6.2 J2, J3, J4, J6,
 * J7). 20 seed (`seedFrom("sim", "tornado-hunter-200", i)`), a terv játékosmodelljeivel; a „legfeljebb / legalább”
 * küszöbök mind a 20 futásra, a mediánosak a mediánra. A mag (`createChaseCore`) a lappal közös; a bot-sofőr
 * egyszerűsített (lásd `sim.ts` fejkomment). A J9 menethossz (2–5 perc) a J7c-é (zajpálya, szupercella) — itt mérve, de
 * nem elfogadási pont.
 */

const factory = createSimGame as unknown as SimGameFactory;
const GAME = "tornado-hunter-200" as const;

function summary(name: string, runs: ReturnType<typeof runSimSeeds>): void {
  const s = runs.map((r) => r.stats);
  console.log(
    `[tornado-sim] ${name}: kérdés/perc medián ${medianOf(s.map((x) => x.perMinute)).toFixed(2)}, ` +
      `kérdés nélküli leghosszabb ${Math.max(...s.map((x) => x.maxGapSec)).toFixed(2)} s, ` +
      `legrövidebb indítási rés ${Math.min(...s.map((x) => x.minGapSec)).toFixed(2)} s, ` +
      `ismétlés 3.–6. medián ${medianOf(s.map((x) => x.reviewReturnWithin6)).toFixed(2)}, ≤ 10 medián ${medianOf(s.map((x) => x.reviewReturnWithin10)).toFixed(2)}, ` +
      `ismétlési arány max ${Math.max(...s.map((x) => x.reviewShare)).toFixed(2)}, ` +
      `menethossz medián ${(medianOf(runs.map((r) => r.durationSec)) / 60).toFixed(2)} perc, győzelem ${runs.filter((r) => r.won).length}/${runs.length}`,
  );
}

test("J2 / J3 / J6 — SIM_AVERAGE, 7. évfolyam, 180 mp × 20 seed: ≥ 4 kérdés/perc, ≤ 20 mp kérdés nélkül, ≥ 1,5 mp rés", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 180, grade: 7 });
  summary("SIM_AVERAGE 180 s", runs);
  const s = runs.map((r) => r.stats);
  assert.ok(medianOf(s.map((x) => x.perMinute)) >= 4, `kérdés/perc medián ${medianOf(s.map((x) => x.perMinute))}`);
  for (const x of s) {
    assert.ok(x.maxGapSec <= 20, `maxGap ${x.maxGapSec}`);
    assert.ok(x.minGapSec >= 1.5, `minGap ${x.minGapSec}`);
    assert.ok(x.reviewShare <= 0.3 + 1e-9, `ismétlési arány ${x.reviewShare}`);
    // J6: az ismétlésnek nem minősülő kérdések mind különböző tételek (a sim-bank ≥ 300 tétel).
    assert.equal(x.distinctKeys, x.asked - x.reviewsAsked, `ismétlődő új tétel: ${x.distinctKeys} / ${x.asked - x.reviewsAsked}`);
    // A J7b-menet ~1 perc (a 3,4 km-es út + horgony; a 2–5 perces ív a J7c-é). A várakozó táblák (J7b döntések 13.) miatt a
    // késői döntés lejárat, nem rossz válasz — ezért: legalább 4 kérdés, ebből legalább 2 megválaszolt.
    assert.ok(x.asked >= 4 && x.answered >= 2, `kérdések ${x.asked}, válaszok ${x.answered}`);
  }
});

test("J2 / J3 — SIM_YOUNG (3. évfolyam, ×1,25 ablak) és SIM_WEAK (45%): a küszöbök ott is teljesülnek", () => {
  for (const [name, player, grade] of [["SIM_YOUNG", SIM_YOUNG, 3], ["SIM_WEAK", SIM_WEAK, 7]] as const) {
    const runs = runSimSeeds(factory, player, { gameId: GAME, seconds: 180, grade });
    summary(`${name} 180 s`, runs);
    const s = runs.map((r) => r.stats);
    assert.ok(medianOf(s.map((x) => x.perMinute)) >= 4, `${name} kérdés/perc ${medianOf(s.map((x) => x.perMinute))}`);
    for (const x of s) {
      assert.ok(x.maxGapSec <= 20, `${name} maxGap ${x.maxGapSec}`);
      assert.ok(x.minGapSec >= 1.5, `${name} minGap ${x.minGapSec}`);
    }
  }
});

test("a menet a kérdésekkel együtt is végigjátszható: elágazás, turbó és horgony-kérdés is jön, és van győzelem", () => {
  const seeds = simSeeds(GAME, 20);
  let junctions = 0;
  let turbos = 0;
  let anchors = 0;
  let wins = 0;
  for (const seed of seeds) {
    const g = createSimGame({ seed, grade: 7, questions: true }) as TornadoSim;
    runSimOn(g, seed);
    const t = g.tally();
    junctions += t.junctions;
    turbos += t.turbos;
    anchors += t.anchorQuestions;
    if (g.won()) wins += 1;
  }
  console.log(`[tornado-sim] 20 menet: elágazás ${junctions}, turbó ${turbos}, horgony-kérdés ${anchors}, győzelem ${wins}/20`);
  assert.ok(junctions >= 40 && turbos >= 10 && anchors >= 20, `${junctions} / ${turbos} / ${anchors}`);
  assert.ok(wins >= 10, `győzelem ${wins}/20`);
});

/** A harness bot-játékosa egy már létrehozott sim-en (a tally olvasásához). */
function runSimOn(g: TornadoSim, seed: number): void {
  runSim(() => g as never, SIM_AVERAGE, { seed, seconds: 600 });
}

test("J7 — elérhető tananyag mellett az első kérdés tananyag, utána a többi forrás", () => {
  const material = [1, 2, 3].map((n) => ({ id: `mat-${n}`, prompt: `Tananyag-kérdés ${n}?`, options: ["jó", "rossz egy", "rossz kettő", "rossz három"], correctIndex: 0 }));
  for (const seed of simSeeds(GAME, 5)) {
    const runs = runSim((o) => createSimGame({ ...o, material }) as never, SIM_AVERAGE, { seed, seconds: 120, grade: 7 });
    assert.equal(runs.stats.firstSource, "material");
    assert.ok(runs.stats.asked > 3, "a tananyag elfogyása után is jön kérdés");
  }
});

test("kérdés nélküli mód: a menet végigjátszható, és van vesztési feltétel (a tölcsér elhal)", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 600, grade: 7, questions: false });
  assert.ok(runs.some((r) => r.won), "kérdés nélkül is lehet nyerni");
  for (const r of runs) assert.equal(r.stats.asked, 0);
  // Vesztés: a jármű áll (`botSpeed: 0` — a bot valóban nem indul) → a tölcsér élettartama / az időkeret után vége, VERESÉGGEL.
  // (A vak ellenőrzés KICSI 5: a korábbi változat alapsebességű botot futtatott, és győzelemmel ért véget.)
  const g = createSimGame({ seed: 7, grade: 7, questions: false, botSpeed: 0 });
  let n = 0;
  while (!g.done() && n++ < 60 * 400) g.step(1000 / 60, { skillRoll: 0 });
  assert.ok(g.done(), "a menet véget ért");
  assert.equal(g.won(), false, "a mozdulatlan jármű menete vereség");
});

test("arany visszajátszás: azonos seed + bemenet → azonos végállapot; más seed → más", () => {
  const play = (seed: number) => {
    const g = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => g as never, SIM_AVERAGE, { seed, seconds: 600 });
    return g.fingerprint();
  };
  assert.equal(play(11), play(11));
  assert.notEqual(play(11), play(12));
});

test("közös meghajtó: lépés-indexhez kötött bemenettel eltérő képkocka-időknél bitre azonos az állapot", () => {
  const run = (frames: number[]) => {
    const log: string[] = [];
    const tp = { x: 0, z: 0, angle: 1, born: 0 };
    const car = { x: 0, z: 300, heading: Math.PI, speed: 0 };
    let stepIndex = 0;
    const questions: ChaseQuestions = {
      frame: () => {}, request: () => null, pick: () => null, active: () => null, abort: () => null, canAsk: () => true, pending: () => false,
    };
    const d = createChaseDriver({
      seed: 5,
      questions,
      physics: (dt) => {
        stepIndex += 1;
        advanceTornado(tp, levelSpec(40), dt);
        car.heading += (stepIndex % 7 === 0 ? 0.01 : -0.004);
        car.speed = 12;
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z -= Math.cos(car.heading) * car.speed * dt;
        return { ...car, hold: false };
      },
    });
    let t = 0;
    d.frame(0);
    for (const f of frames) d.frame((t += f));
    for (const e of d.core.drainEvents()) log.push(e.kind);
    return `${stepIndex}|${car.x.toFixed(9)}|${car.z.toFixed(9)}|${tp.x.toFixed(9)}|${d.core.clockMs()}|${JSON.stringify(d.core.pad())}|${log.join(",")}`;
  };
  const total = 40_000;
  const at60 = run(Array.from({ length: total / (1000 / 60) }, () => 1000 / 60));
  const at30 = run(Array.from({ length: total / (1000 / 30) }, () => 1000 / 30));
  const mixed = run(Array.from({ length: 2400 }, (_, i) => (i % 3 === 0 ? 8 : i % 3 === 1 ? 33.333333333333336 : 8.666666666666666)));
  assert.equal(at30, at60);
  assert.equal(mixed.split("|")[0], at60.split("|")[0]);
  assert.equal(mixed, at60);
});

test("a director beállítása a végrehajtás J7b 3. pontja szerint", () => {
  const c = tornadoDirectorConfig(7);
  assert.deepEqual(
    { optionCount: c.optionCount, minGapMs: c.minGapMs, maxGapMs: c.maxGapMs, targetPerMin: c.targetPerMin, baseWindowMs: c.baseWindowMs, slowMo: c.slowMo },
    { optionCount: 3, minGapMs: 1500, maxGapMs: 20000, targetPerMin: 4, baseWindowMs: 6000, slowMo: 1 },
  );
  assert.equal(levelForGrade(7), 109);
});

/* ---- K2 (review #482) és #83 L3: a győzelmi jutalom viselkedése ---- */

test("K2: a pozíció-bónusz azonos távolságból minden műszer-szinten azonos — a szélesebb sáv csak a horgonyzást könnyíti", () => {
  const level = 50;
  const spec = levelSpec(level);
  const vehicle = VEHICLES[0]!;
  const args = { level, secondsUsed: 80, anchorAttempts: 1, peakWind: spec.windPeak * 0.8, correctAnswers: 4, wrongAnswers: 1 };
  const inBase = (spec.anchorBand.min + spec.anchorBand.max) / 2;
  const reference = winReward({ ...args, anchoredDistanceKm: inBase });
  for (let lvl = 0; lvl <= MAX_UPGRADE_LEVEL; lvl++) {
    const eff = effectiveStats(vehicle, { ...emptyUpgrades(), instruments: lvl });
    const band = effectiveAnchorBand(spec.anchorBand, eff.bandWidthFactor);
    // A horgonyzás a fejlesztett sávval dől el (a lap ugyanígy: `bandSpec`)…
    assert.equal(anchorOutcome({ distanceKm: inBase, spec: { ...spec, anchorBand: band }, answerCorrect: true, surfaceGrip: 1 }).ok, true);
    // …a pont viszont ugyanabból a távolságból ugyanannyi, bármely műszer-szinten.
    const r = winReward({ ...args, anchoredDistanceKm: inBase });
    assert.deepEqual(r, reference, `${lvl}. műszer-szint`);
    if (lvl === MAX_UPGRADE_LEVEL) {
      // A szélesített sáv külső részéből horgonyozni most már lehet, de pozíció-bónusz az alap sáv szerint jár.
      const outer = (spec.anchorBand.max + band.max) / 2;
      assert.equal(anchorBandState(outer, band), "in_band");
      assert.equal(anchorBandState(outer, spec.anchorBand), "too_far");
      assert.ok(winReward({ ...args, anchoredDistanceKm: outer }).breakdown.positionBonus <= reference.breakdown.positionBonus);
    }
  }
});

test("#83 L3: a pozíció-bónusz a horgonyzás pillanatának távolságából számol, nem a későbbi (elmozdult) tölcsérből", () => {
  const level = 30;
  const spec = levelSpec(level);
  const atAnchor = (spec.anchorBand.min + spec.anchorBand.max) / 2;
  const later = spec.anchorBand.max * 1.6; // a hold ideje alatt a tölcsér elhaladt
  const base = { level, secondsUsed: 70, anchorAttempts: 1, peakWind: spec.windPeak, correctAnswers: 3, wrongAnswers: 0 };
  assert.ok(winReward({ ...base, anchoredDistanceKm: atAnchor }).breakdown.positionBonus > winReward({ ...base, anchoredDistanceKm: later }).breakdown.positionBonus);
});

/* ---- önellenőrző lista (b), (e): kupon módban nem fogy el a kérdés; győzelem és vereség nem fordul át ---- */

test("(b) kupon módban 3 tételes leckével sem fogy el a kérdés: a tananyag körönként, saját kulccsal ismétlődik", async () => {
  const { createQuestionDirector, materialPlayQuestion } = await import("../client/src/game-engine/play/questionDirector");
  const { createReviewQueue } = await import("../client/src/game-engine/play/reviewQueue");
  const { createRng } = await import("../shared/game-rng");
  const material = [1, 2, 3].map((n) => ({ id: `lecke-${n}`, prompt: `Lecke-kérdés ${n}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  let unseen = 0;
  let repeats = 0;
  const director = createQuestionDirector({
    config: { ...tornadoDirectorConfig(5), promptFits: undefined, readingAware: false },
    provider: {
      couponOnly: true,
      material: () => {
        if (unseen < material.length) return materialPlayQuestion(material[unseen++]!, { coupon: true });
        const again = couponRepeat(material, repeats++);
        return again ? { ...materialPlayQuestion(again.item, { coupon: true }), key: `mat:${again.item.id}${again.keySuffix}` } : null;
      },
      fresh: () => null,
      restore: () => null,
    },
    review: createReviewQueue(null),
    rng: createRng("kupon"),
    startBand: 0.4,
    now: () => 0,
  });
  const ids: string[] = [];
  for (let i = 0; i < 30; i++) {
    const p = director.request("rescue", i * 5000);
    assert.ok(p, `${i + 1}. kérdés: elfogyott a kérdés kupon módban`);
    ids.push(p.question.quiz.id);
    director.answer(p.id, 0, i * 5000 + 1000);
  }
  assert.deepEqual(new Set(ids), new Set(["lecke-1", "lecke-2", "lecke-3"]), "csak a lecke tételei");
  assert.equal(couponRepeat([], 0), null, "üres tananyagnál nincs kitalált kérdés");
});

test("(e) győzelem és vereség nem fordul át: a horgonyzott menet nem veszít, a lezárt menet állapota nem változik", () => {
  for (const seed of simSeeds(GAME, 10)) {
    const g = createSimGame({ seed, grade: 7, questions: true });
    runSim(() => g as never, SIM_AVERAGE, { seed, seconds: 600 });
    const before = g.fingerprint();
    const won = g.won();
    for (let i = 0; i < 600; i++) g.step(1000 / 60, { skillRoll: 0.5 });
    assert.equal(g.won(), won, "a kimenet a lezárás után megváltozott");
    assert.equal(g.fingerprint(), before, "a lezárt menet tovább futott");
  }
});

/* ---- a független ellenőrzés (J7b döntések 12–19) mérései ---- */

const quietRun = (g: TornadoSim, seed: number, player = SIM_AVERAGE) => runSim(() => g as never, player, { seed, seconds: 600 });

test("B1: a soha nem nyúló (passzív) bot egyetlen kérdése sem kerül válaszként a nyilvántartásba", () => {
  let asked = 0;
  for (const seed of simSeeds(GAME, 20)) {
    const g = createSimGame({ seed, grade: 7, questions: true, passive: true });
    quietRun(g, seed);
    const st = g.stats();
    asked += st.asked;
    assert.equal(st.answered, 0, `seed ${seed}: ${st.correct} jó / ${st.wrong} rossz válasz szándék nélkül`);
  }
  console.log(`[tornado-sim] passzív bot: ${asked} kérdés, 0 nyilvántartott válasz`);
  assert.ok(asked > 40);
});

test("M1: a mindig jót választó bot téves válasza 0 — 2,8 és 4 s reakcióval, lassú, gyors és nitrós tempónál", () => {
  for (const reactionMedianMs of [2800, 4000]) {
    for (const botSpeed of [8, 16, 22.2, 30]) {
      let right = 0;
      let wrong = 0;
      let timeouts = 0;
      for (const seed of simSeeds(GAME, 20)) {
        const g = createSimGame({ seed, grade: 5, questions: true, botSpeed });
        quietRun(g, seed, { accuracy: 1, reactionMedianMs, skill: 1 });
        const st = g.stats();
        right += st.correct;
        wrong += st.wrong;
        timeouts += st.timeouts;
      }
      console.log(`[tornado-sim] mindig jó, reakció ${reactionMedianMs} ms, tempó ${botSpeed}: jó ${right}, rossz ${wrong}, lejárt ${timeouts}`);
      assert.equal(wrong, 0, `reakció ${reactionMedianMs} ms, tempó ${botSpeed}: ${wrong} téves válasz`);
      if (reactionMedianMs === 2800) assert.ok(right > timeouts, "2,8 s-os reakcióval a tudott válaszok többsége helyesként számít");
    }
  }
});

test("K4: kérdés nélkül is végigjátszható (az erős modell ≥ 15/20), és minden modellnél kérdéssel ≥ kérdés nélkül", () => {
  for (const [name, player] of [["SIM_STRONG", SIM_STRONG], ["SIM_AVERAGE", SIM_AVERAGE], ["SIM_WEAK", SIM_WEAK]] as const) {
    const without = runSimSeeds(factory, player, { gameId: GAME, seconds: 600, grade: 7, questions: false }).filter((r) => r.won).length;
    const withQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 600, grade: 7, questions: true }).filter((r) => r.won).length;
    console.log(`[tornado-sim] ${name}: győzelem kérdéssel ${withQ}/20, kérdés nélkül ${without}/20`);
    assert.ok(withQ >= without, `${name}: kérdéssel ${withQ} < kérdés nélkül ${without}`);
    if (name === "SIM_STRONG") assert.ok(without >= 15, `kérdés nélkül ${without}/20`);
  }
});

/* ---- a harmadik ellenőrzés (J7b döntések 25–29.) ---- */

test("25. / 29.: a NEM olvasó vezető botok (rezgés, kanyar + egyenesítés, útkanyar, véletlen kormány, korai fék / tolatás) véletlen válasza 0", () => {
  const patterns: { name: string; drive: SimDrivePattern }[] = [
    { name: "rezgés ±0,5", drive: { kind: "wobble", amp: 0.5 } },
    { name: "rezgés ±1", drive: { kind: "wobble", amp: 1 } },
    { name: "kérdéssel induló kanyar + egyenesítés", drive: { kind: "turn-straighten" } },
    { name: "útkanyar 7 s-onként", drive: { kind: "curve" } },
    { name: "véletlen kormány 0,7 s-onként", drive: { kind: "random" } },
    { name: "akadály-fék 0,3–0,9 s", drive: { kind: "brake-early", releaseSec: 0.9 } },
    { name: "akadály-fék 0,3–3 s (a küszöbön át tartva)", drive: { kind: "brake-early", releaseSec: 3 } },
    { name: "tolatás 0,3–3 s", drive: { kind: "brake-early", releaseSec: 3, reverse: true } },
  ];
  for (const { name, drive } of patterns) {
    let asked = 0;
    let answered = 0;
    let frozen = 0;
    for (const seed of simSeeds(GAME, 20)) {
      const g = createSimGame({ seed, grade: 7, questions: true, passive: true, drive, botSpeed: 22 });
      quietRun(g, seed);
      asked += g.stats().asked;
      answered += g.stats().answered;
      frozen += g.tally().frozen;
    }
    console.log(`[tornado-sim] nem olvasó vezető (${name}): ${asked} kérdés, ${frozen} rögzülés, ${answered} véletlen válasz`);
    assert.equal(answered, 0, `${name}: ${answered} véletlen válasz`);
    assert.equal(frozen, 0, `${name}: ${frozen} rögzülés szándék nélkül`);
    assert.ok(asked > 40, `${name}: kevés kérdés (${asked})`);
  }
});

test("33. (vak ellenőrzés K1): az olvasási küszöb UTÁN kezdett akadály-fék + egyenes haladás / kitérés — 0 válasz, 0 kerülő", () => {
  // A korábbi minták (fent) csak a küszöb ELŐTT kezdett féket mérték; a küszöb utáni fék rögzít, és az egyenes továbbhaladás
  // régen a középső kaput „választotta” (pont + nitró vagy 8–12 s kerülő olvasás nélkül). Most a rögzítés megtörténhet (ezt a
  // `frozen > 0` igazolja: a teszt valóban a küszöb utáni utat járja), de válasz és kerülő nem lehet belőle.
  const patterns: { name: string; drive: SimDrivePattern; mustFreeze: boolean }[] = [
    { name: "fék 3 s-onként 0,25 s", drive: { kind: "brake-periodic", periodSec: 3, holdSec: 0.25 }, mustFreeze: true },
    { name: "fék 6 s-onként 0,3 s", drive: { kind: "brake-periodic", periodSec: 6, holdSec: 0.3 }, mustFreeze: true },
    { name: "fék 10 s-onként 0,3 s", drive: { kind: "brake-periodic", periodSec: 10, holdSec: 0.3 }, mustFreeze: true },
    { name: "fék 3 s-onként + kitérés", drive: { kind: "brake-periodic", periodSec: 3, holdSec: 0.25, swerve: true }, mustFreeze: true },
    { name: "fék a kérdés után 1,2 s-mal", drive: { kind: "brake-after", atSec: 1.2, holdSec: 0.3 }, mustFreeze: true },
    { name: "fék a kérdés után 2,5 s-mal + kitérés", drive: { kind: "brake-after", atSec: 2.5, holdSec: 0.4, swerve: true }, mustFreeze: true },
    // A tölcsér felé kormányzó (a kérdést nem olvasó) üldöző: a pályán marad, minden periódusnál rögzít.
    { name: "üldöz + fék 3 s-onként", drive: { kind: "brake-periodic", periodSec: 3, holdSec: 0.25, chase: true }, mustFreeze: true },
    { name: "üldöz + fék 6 s-onként + kitérés", drive: { kind: "brake-periodic", periodSec: 6, holdSec: 0.3, chase: true, swerve: true }, mustFreeze: true },
    { name: "üldöz + fék 10 s-onként", drive: { kind: "brake-periodic", periodSec: 10, holdSec: 0.3, chase: true }, mustFreeze: true },
    { name: "üldöz + fék a kérdés után 1,2 s-mal", drive: { kind: "brake-after", atSec: 1.2, holdSec: 0.3, chase: true }, mustFreeze: true },
  ];
  for (const { name, drive, mustFreeze } of patterns) {
    let asked = 0;
    let answered = 0;
    let frozen = 0;
    let detours = 0;
    let nitros = 0;
    for (const seed of simSeeds(GAME, 20)) {
      for (const botSpeed of [15, 22]) {
        const g = createSimGame({ seed, grade: 7, questions: true, passive: true, drive, botSpeed });
        for (let i = 0; i < 60 * 180 && !g.done(); i++) g.step(1000 / 60, { skillRoll: 0.5 });
        asked += g.stats().asked;
        answered += g.stats().answered;
        frozen += g.tally().frozen;
        detours += g.tally().detours;
        nitros += g.tally().nitros;
      }
    }
    console.log(`[tornado-sim] akadály-fék a küszöb után (${name}): ${asked} kérdés, ${frozen} rögzülés, ${answered} válasz, ${detours} kerülő, ${nitros} nitró`);
    assert.equal(answered, 0, `${name}: ${answered} olvasás nélküli válasz`);
    assert.equal(detours, 0, `${name}: ${detours} kerülő akadály-kerülésért`);
    if (mustFreeze) assert.ok(frozen > 0, `${name}: a minta nem érte el a küszöb utáni rögzülést — a teszt nem azt méri, amit kell`);
    assert.ok(asked > 40, `${name}: kevés kérdés (${asked})`);
  }
});

/** Rögzített reakcióidejű, mindig jót választó játékos (a független ellenőr R2-esete), a megadott válaszúton. */
function fixedReactionRun(seed: number, reactionMs: number, botSpeed: number, answerBy: "brake" | "tap") {
  const g = createSimGame({ seed, grade: 7, questions: true, botSpeed, answerBy });
  let seen = -1;
  let at = 0;
  let option = 0;
  for (let i = 0; i < 60 * 600 && !g.done(); i++) {
    const q = g.question();
    if (q && q.id !== seen) {
      seen = q.id;
      at = g.simTimeMs() + reactionMs;
      option = q.correctOption;
    }
    if (q && q.id === seen && at > 0 && g.simTimeMs() >= at) {
      g.answer(q.id, option);
      at = 0;
    }
    g.step(1000 / 60, { skillRoll: 0.5 });
  }
  return { ...g.stats(), ...g.tally() };
}

test("25. / 26.: a mindig jót választó bot — koppintással és fék + kormány úton, 2,8 / 4 s FIX reakció, minden tempónál: téves 0, rögzítés után lejárt 0", () => {
  for (const answerBy of ["brake", "tap"] as const) {
    for (const reactionMs of [2800, 4000]) {
      for (const botSpeed of [8, 16, 22.2, 30]) {
        let right = 0;
        let wrong = 0;
        let timeouts = 0;
        let frozen = 0;
        let frozenTimeouts = 0;
        for (const seed of simSeeds(GAME, 20)) {
          const st = fixedReactionRun(seed, reactionMs, botSpeed, answerBy);
          right += st.correct;
          wrong += st.wrong;
          timeouts += st.timeouts;
          frozen += st.frozen;
          frozenTimeouts += st.frozenTimeouts;
        }
        console.log(
          `[tornado-sim] mindig jó (${answerBy}), fix ${reactionMs} ms, tempó ${botSpeed}: jó ${right}, rossz ${wrong}, lejárt ${timeouts}; rögzült ${frozen}, ebből lejárt ${frozenTimeouts}`,
        );
        assert.equal(wrong, 0, `${answerBy}, ${reactionMs} ms, ${botSpeed}: ${wrong} téves válasz`);
        assert.equal(frozenTimeouts, 0, `${answerBy}, ${reactionMs} ms, ${botSpeed}: a rögzítés után ${frozenTimeouts} kérdés lejárt`);
        assert.ok(right > timeouts, `${answerBy}, ${reactionMs} ms, ${botSpeed}: a tudott válaszok többsége helyes (jó ${right}, lejárt ${timeouts})`);
      }
    }
  }
});
