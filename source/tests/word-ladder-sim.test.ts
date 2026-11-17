import assert from "node:assert/strict";
import test from "node:test";
import { medianOf, runSim, runSimSeeds, simSeeds, SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, type SimGameFactory } from "./support/game-sim";
import { createSimGame, simRevealWrongMs, wordLadderDirectorConfig } from "../client/src/lib/wordLadder/sim";
import { stateFingerprint } from "../client/src/lib/wordLadder/core";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import { REVEAL_CORRECT_MS, REVEAL_WRONG_MS } from "../client/src/game-engine/play/useQuestionDirector";
import { SIM_REVEAL_CORRECT_MS } from "../client/src/lib/wordLadder/sim";
import { LEAD_IN_MS, type LadderTempo } from "../client/src/lib/wordLadder/pacing";
import { READER_SLOW, READER_STRONG, READER_TYPICAL, realLadderBank, runReader, type ReaderProfile, type ReaderRun } from "./support/word-ladder-reader";

/**
 * J2a — a Szikla-verseny szimulációs elfogadása (végrehajtás J2a 7., K.6; terv 6.2, J2, J3, J4, J6, J7, J9, J10):
 * 20 seed (`seedFrom("sim", "word-ladder-hu-en", i)`), a menet végéig (≤ 600 mp), a referencia-pályán (6. pálya,
 * 35 fok — a „14 fokos pálya” a régi létra-egységben; a fal-egység a `climbTarget`-ben).
 *
 * SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag): a tempó-választó (docs/specs/2026-11-17-szoletra-olvashatosag.md C)
 * óta a lap alapértéke a NYUGODT tempó. A régi elvárások (kérdés/perc ≥ 10, SIM_AVERAGE 50–80%, kérdés nélkül, arany
 * lenyomat) a régi tempót mérik: ezek a „Gyors” tempón futnak (a „Gyors” = a régi tempó + előjelzés). A nyugodt tempót az
 * emberi olvasási idővel válaszoló bot méri (SZ-7) — a hossztól független reakcióidejű `SIM_AVERAGE` a nyugodt ablakot
 * nem méri.
 */

const GAME = "word-ladder-hu-en" as const;
const factory = (extra: Record<string, unknown> = {}): SimGameFactory => (o) => createSimGame({ ...o, ...extra });
const FAST = { tempo: "fast" as LadderTempo };

const avg = runSimSeeds(factory(FAST), SIM_AVERAGE, { gameId: GAME, seconds: 600 });

test("a sim a közös kérdés-sáv kijelzési idejével számol — a mérés a lap viselkedését méri", () => {
  assert.equal(SIM_REVEAL_CORRECT_MS, REVEAL_CORRECT_MS);
  // SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag): a hibás válasz kijelzése a tempóé; a Gyors (régi) tempón a közös 2 s.
  assert.equal(simRevealWrongMs("fast"), REVEAL_WRONG_MS);
  assert.ok(simRevealWrongMs("calm") >= 3000);
});

// SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag): a terv 6.2 „Szólétra ≥ 10 / perc” küszöbe a Gyors (régi) tempón él;
// a Nyugodt tempó alsó korlátja (emberi olvasóval) lent, az SZ-7 tesztekben.
test("J2: kérdés/perc (SIM_AVERAGE, Gyors tempó, 20 seed medián) ≥ 10 — minden fogás egy kérdés", () => {
  const perMin = medianOf(avg.map((r) => r.stats.perMinute));
  assert.ok(perMin >= 10, `medián ${perMin.toFixed(2)} / perc`);
});

test("J3: a menet első 10 mp-e után nincs 8 mp-nél hosszabb kérdés nélküli szakasz; két indítás között ≥ 1,5 mp (minden tempón)", () => {
  for (const r of avg) {
    assert.ok(r.stats.maxGapSec <= 8, `maxGap ${r.stats.maxGapSec}`);
    assert.ok(r.stats.minGapSec >= 1.5, `minGap ${r.stats.minGapSec}`);
  }
  for (const r of runSimSeeds(factory(FAST), SIM_WEAK, { gameId: GAME, seconds: 600 })) assert.ok(r.stats.maxGapSec <= 8);
  for (const tempo of ["calm", "normal"] as LadderTempo[]) {
    for (const r of runSimSeeds(factory({ tempo }), SIM_WEAK, { gameId: GAME, seconds: 600 })) {
      assert.ok(r.stats.maxGapSec <= 8, `${tempo} maxGap ${r.stats.maxGapSec}`);
      assert.ok(r.stats.minGapSec >= 1.5, `${tempo} minGap ${r.stats.minGapSec}`);
    }
  }
});

test("J9: a menet medián 2–5 perc a referencia-pályán (SIM_AVERAGE, Gyors tempó), és mindig véget ér", () => {
  const dur = medianOf(avg.map((r) => r.durationSec));
  assert.ok(dur >= 120 && dur <= 300, `medián ${dur.toFixed(0)} mp`);
  assert.ok(avg.every((r) => r.durationSec < 600), "minden menet véget ér 10 percen belül");
});

test("riválisos verseny (Gyors tempó): a SIM_AVERAGE a menetek 50–80%-át nyeri (szoros, de legyőzhető); veszíteni is lehet", () => {
  const wins = avg.filter((r) => r.won).length / avg.length;
  assert.ok(wins >= 0.5 && wins <= 0.8, `nyerési arány ${wins}`);
  assert.ok(avg.some((r) => !r.won), "van vereség");
  const strong = runSimSeeds(factory(FAST), SIM_STRONG, { gameId: GAME, seconds: 600 });
  assert.ok(strong.filter((r) => r.won).length >= 18, "az erős játékos szinte mindig nyer");
});

test("J4: ismétlés — arány ≤ 30%, a hibázott tételek ≥ 95%-a (medián) a 3.–6. kérdésként visszatér (minden tempón)", () => {
  for (const tempo of ["fast", "calm"] as LadderTempo[]) {
    const runs = tempo === "fast" ? avg : runSimSeeds(factory({ tempo }), SIM_AVERAGE, { gameId: GAME, seconds: 600 });
    for (const r of runs) assert.ok(r.stats.reviewShare <= 0.3 + 1e-9, `${tempo} reviewShare ${r.stats.reviewShare}`);
    const within6 = medianOf(runs.map((r) => r.stats.reviewReturnWithin6));
    assert.ok(within6 >= 0.95, `${tempo} 3.–6. kérdésen belül: ${within6}`);
  }
  const weak = runSimSeeds(factory(FAST), SIM_WEAK, { gameId: GAME, seconds: 600 });
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
  for (let i = 0; i < 60 * 120 && !g.done(); i++) {
    const q = g.question();
    if (q && g.simTimeMs() >= q.armedAtMs) g.answer(q.id, q.correctOption);
    g.step(1000 / 60, { skillRoll: 0.5 });
  }
  const keys = g.askedKeys();
  assert.equal(g.stats().firstSource, "material");
  assert.deepEqual(keys.slice(0, 3), ["mat:m1", "mat:m2", "mat:m3"]);
  assert.ok(keys.slice(3).every((k) => k.startsWith("bank:")));
});

test("J10: a közös ablak rövid tételnél 4,5 mp (3–4. évfolyamon 5,6 mp), hosszúnál olvasási pótlékkal, ≤ 9 mp (a Gyors tempó ablaka)", () => {
  const cfg = wordLadderDirectorConfig(7);
  assert.equal(windowMsFor("Mit jelent: apple?", 7, cfg.baseWindowMs), 4500);
  assert.equal(windowMsFor("Mit jelent: apple?", 4, cfg.baseWindowMs), 5625);
  assert.ok(windowMsFor("x".repeat(400), 3, cfg.baseWindowMs) <= 9000);
  const young = runSimSeeds(factory(FAST), SIM_YOUNG, { gameId: GAME, seconds: 600, grade: 4 });
  assert.ok(medianOf(young.map((r) => r.stats.perMinute)) >= 10, "a 3–4. évfolyamos átlagos játékosnál is ≥ 10 / perc (Gyors tempó)");
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

test("K.6 kérdés nélkül (questions: false): a menet szabad fogással végigjátszható, és van vesztési feltétel (minden tempón)", () => {
  for (const extra of [FAST, { tempo: "calm" as LadderTempo, level: 1 }]) {
    const noQ = runSimSeeds(factory(extra), SIM_AVERAGE, { gameId: GAME, seconds: 600, questions: false });
    assert.ok(noQ.every((r) => r.durationSec < 600), `${extra.tempo}: minden menet véget ér`);
    assert.ok(noQ.some((r) => r.won), `${extra.tempo}: megnyerhető`);
    assert.ok(noQ.some((r) => !r.won), `${extra.tempo}: elveszíthető (a rivális felér)`);
    assert.ok(noQ.every((r) => r.stats.asked === 0));
  }
  // Üres kérdésforrás (terv 8.1): ugyanígy szabad fogással megy.
  const empty = runSim(factory({ bankSize: 0 }), SIM_AVERAGE, { seed: 3, seconds: 600 });
  assert.equal(empty.stats.asked, 0);
  assert.ok(empty.durationSec < 600);
});

test("arany visszajátszás: fix seed + bot-bemenet → azonos végállapot és statisztika; a lenyomat rögzített", () => {
  const a = createSimGame({ seed: 42, grade: 7, questions: true, tempo: "fast" });
  const b = createSimGame({ seed: 42, grade: 7, questions: true, tempo: "fast" });
  const ra = runSim(() => a, SIM_AVERAGE, { seed: 42, seconds: 600 });
  const rb = runSim(() => b, SIM_AVERAGE, { seed: 42, seconds: 600 });
  assert.deepEqual(ra, rb);
  assert.equal(stateFingerprint(a.state()), stateFingerprint(b.state()));
  assert.equal(stateFingerprint(a.state()), GOLDEN_42);
  const c = createSimGame({ seed: 42, grade: 4, questions: true });
  const d = createSimGame({ seed: 42, grade: 4, questions: true });
  assert.deepEqual(runSim(() => c, SIM_YOUNG, { seed: 42, seconds: 600 }), runSim(() => d, SIM_YOUNG, { seed: 42, seconds: 600 }));
  assert.equal(stateFingerprint(c.state()), stateFingerprint(d.state()), "Nyugodt tempón is determinisztikus");
});

// SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag): a lenyomat változott — a Gyors tempón is van 600 ms-os előjelzés, és a
// világot a lap meghajtója (createFixedLoop) lépteti. A régi érték: "won|188700|35|30|30.173479|7|7|29|7".
const GOLDEN_42 = "won|110967|35|19|19.737758|3|10|23|2";

/* ------------------------------------------------------------------------------------------------------------------ */
/* SZ-7 — Nyugodt tempó, EMBERI olvasási idővel (valódi tételekkel, docs/specs/2026-11-17-szoletra-olvashatosag.md)     */
/* ------------------------------------------------------------------------------------------------------------------ */

const banks = new Map<number, ReturnType<typeof realLadderBank>>();
const bankFor = (grade: number) => {
  if (!banks.has(grade)) banks.set(grade, realLadderBank(grade));
  return banks.get(grade)!;
};
const readerRuns = (profile: ReaderProfile, grade: number, extra: { tempo?: LadderTempo; level?: number; questions?: boolean } = {}): ReaderRun[] =>
  simSeeds(GAME).map((seed) => runReader(profile, { seed, grade, questions: extra.questions ?? true, tempo: extra.tempo ?? "calm", level: extra.level ?? 1, bank: bankFor(grade) }));
const winsOf = (runs: ReaderRun[]) => runs.filter((r) => r.won).length;
const inWindowShare = (runs: ReaderRun[]) => runs.reduce((a, r) => a + r.inWindow, 0) / Math.max(1, runs.reduce((a, r) => a + r.questions, 0));

test("SZ-7: a „lassú olvasó” Nyugodt tempón a kérdések ≥ 95%-át végigolvassa és megválaszolja az ablakon belül (3., 5., 8., 11. évf.)", () => {
  for (const grade of [3, 5, 8, 11]) {
    const share = inWindowShare(readerRuns(READER_SLOW, grade));
    assert.ok(share >= 0.95, `${grade}. évf: ${(share * 100).toFixed(1)}%`);
  }
});

test("SZ-7: a régi (Gyors) tempón ugyanez a lassú olvasó szinte semmit nem tud elolvasni — a javítás mért oka", () => {
  const share = inWindowShare(readerRuns(READER_SLOW, 3, { tempo: "fast" }));
  assert.ok(share < 0.2, `régi tempó, 3. évf lassú olvasó: ${(share * 100).toFixed(1)}%`);
});

test("SZ-7: a 3–4. évfolyamos átlagos olvasó kérdéssel ≥ 12/20 menetet nyer Nyugodt tempón (1. pálya)", () => {
  for (const grade of [3, 4]) {
    const wins = winsOf(readerRuns(READER_TYPICAL, grade));
    assert.ok(wins >= 12, `${grade}. évf: ${wins}/20`);
  }
});

test("SZ-7: a nyerési arány a pontossággal monoton; kérdéssel ≥ kérdés nélkül (Nyugodt tempó)", () => {
  for (const grade of [4, 8]) {
    const by = [0.55, 0.75, 0.95].map((accuracy) => winsOf(readerRuns({ ...READER_TYPICAL, name: `acc${accuracy}`, accuracy }, grade)));
    assert.ok(by[0]! <= by[1]! && by[1]! <= by[2]!, `${grade}. évf pontosság → győzelem: ${by.join(" / ")}`);
    const withQ = winsOf(readerRuns(READER_TYPICAL, grade));
    const noQ = winsOf(readerRuns(READER_TYPICAL, grade, { questions: false }));
    assert.ok(withQ >= noQ, `${grade}. évf kérdéssel ${withQ} / kérdés nélkül ${noQ}`);
  }
  assert.equal(winsOf(readerRuns(READER_STRONG, 8)), 20, "az erős olvasó mindig nyer");
});

test("SZ-7: Nyugodt tempón a menet medián 2–5 perc a referencia-pályán (átlagos olvasó), ≥ 4 kérdés / perc, mindig véget ér", () => {
  for (const grade of [3, 8]) {
    const runs = readerRuns(READER_TYPICAL, grade, { level: 6 });
    const dur = medianOf(runs.map((r) => r.durationSec));
    assert.ok(dur >= 120 && dur <= 300, `${grade}. évf medián ${dur.toFixed(0)} mp`);
    assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 4, `${grade}. évf kérdés/perc`);
    assert.ok(runs.every((r) => r.durationSec < 900));
  }
});

test("SZ-2 / kapu 3(a): az előjelzés alatti koppintás hatástalan — nem válasz, nem hiba; az élesítés után számít", () => {
  const g = createSimGame({ seed: 9, grade: 4, questions: true });
  let id = -1;
  for (let i = 0; i < 600 && id < 0; i++) {
    g.step(1000 / 60, { skillRoll: 0.5 });
    const q = g.question();
    if (q) {
      id = q.id;
      assert.equal(q.armedAtMs - g.simTimeMs() > LEAD_IN_MS - 40, true, "a kérdés megjelenésekor még előjelzés van");
      g.answer(q.id, (q.correctOption + 1) % 4); // azonnali (olvasás nélküli) rossz koppintás
    }
  }
  assert.equal(g.earlyTaps(), 1);
  assert.equal(g.stats().answered, 0, "nem számít válasznak");
  assert.equal(g.state().slips, 0, "nem csúszott meg");
  const q = g.question()!;
  assert.equal(q.id, id, "a kérdés nyitva maradt");
  while (g.simTimeMs() < q.armedAtMs) g.step(1000 / 60, { skillRoll: 0.5 });
  g.answer(q.id, q.correctOption);
  assert.equal(g.stats().answered, 1);
  assert.equal(g.stats().correct, 1);
});
