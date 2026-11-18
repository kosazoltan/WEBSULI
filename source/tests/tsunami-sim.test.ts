import assert from "node:assert/strict";
import test from "node:test";

import { SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, medianOf, runSim, runSimSeeds, simSeeds, type SimGameFactory } from "./support/game-sim";
import { createSimGame } from "../client/src/lib/tsunami/sim";

/**
 * Szökőár (emelkedő víz, terv 2026-11-18) szimulációs elfogadás a közös harness-szel (végrehajtás K.6, J1a 7.; terv 6.2, J2, J3, J4, J6, J7, J9;
 * K.4/26). 20 seed (`seedFrom("sim", "tsunami-english", i)`), a terv játékosmodelljeivel. A „legfeljebb / legalább” küszöbök
 * mind a 20 futásra, a mediános küszöbök a mediánra. A mért értékek a `console.log` sorokban (PR-leírás, záró jelentés).
 */

const factory = createSimGame as unknown as SimGameFactory;
const GAME = "tsunami-english" as const;

function summary(name: string, runs: ReturnType<typeof runSimSeeds>): void {
  const s = runs.map((r) => r.stats);
  console.log(
    `[tsunami-sim] ${name}: kérdés/perc medián ${medianOf(s.map((x) => x.perMinute)).toFixed(2)}, ` +
      `kérdés nélküli leghosszabb ${Math.max(...s.map((x) => x.maxGapSec)).toFixed(2)} s, ` +
      `legrövidebb indítási rés ${Math.min(...s.map((x) => x.minGapSec)).toFixed(2)} s, ` +
      `ismétlés 3.–6. medián ${medianOf(s.map((x) => x.reviewReturnWithin6)).toFixed(2)}, ≤ 10 medián ${medianOf(s.map((x) => x.reviewReturnWithin10)).toFixed(2)}, ` +
      `ismétlési arány max ${Math.max(...s.map((x) => x.reviewShare)).toFixed(2)}, ` +
      `menethossz medián ${(medianOf(runs.map((r) => r.durationSec)) / 60).toFixed(2)} perc, győzelem ${runs.filter((r) => r.won).length}/${runs.length}`,
  );
}

test("J2 / J3 / J4 / J6 — SIM_AVERAGE, 7. évfolyam, 180 mp × 20 seed", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 180, grade: 7 });
  summary("SIM_AVERAGE 180 s", runs);
  const s = runs.map((r) => r.stats);
  // J2: Szökőár ≥ 5 kérdés/perc (medián) — a régi becslés ~4 volt (terv 3.1).
  assert.ok(medianOf(s.map((x) => x.perMinute)) >= 5, `kérdés/perc medián ${medianOf(s.map((x) => x.perMinute))}`);
  for (const x of s) {
    // J3: kérdés nélküli leghosszabb szakasz ≤ 15 mp (az első 10 mp után), két indítás között ≥ 1,5 mp — mind a 20 futásban.
    assert.ok(x.maxGapSec <= 15, `maxGap ${x.maxGapSec}`);
    assert.ok(x.minGapSec >= 1.5, `minGap ${x.minGapSec}`);
    // J4: az ismétlések aránya ≤ 30% a menet végén is.
    assert.ok(x.reviewShare <= 0.3 + 1e-9, `ismétlési arány ${x.reviewShare}`);
    // J6: az új (nem ismétlés) kérdések között nincs duplikátum (a 200 tételes forrásból 40-nél kevesebb új kérdés jön:
    // ilyenkor az egész sorozat különböző).
    const fresh = x.asked - x.reviewsAsked;
    assert.equal(x.freshWindow40Distinct, Math.min(40, fresh), `új kérdések: ${fresh}, különböző: ${x.freshWindow40Distinct}`);
  }
  // J4: a hibázott tételek ≥ 95%-a a 3.–6. következő kérdésként tér vissza (medián a 20 futáson).
  assert.ok(medianOf(s.map((x) => x.reviewReturnWithin6)) >= 0.95, `3.–6. visszatérés medián ${medianOf(s.map((x) => x.reviewReturnWithin6))}`);
});

test("J9 — menethossz: SIM_AVERAGE medián 2–5 perc (a menet végéig, legfeljebb 600 mp); a győzelem a menedék (N jó válasz)", () => {
  const runs = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 600, grade: 7 });
  summary("SIM_AVERAGE a menet végéig", runs);
  const median = medianOf(runs.map((r) => r.durationSec)) / 60;
  assert.ok(median >= 2 && median <= 5, `menethossz medián ${median} perc`);
  assert.ok(runs.every((r) => r.durationSec < 600), "minden menet véget ér (győzelem vagy a hullám)");
});

test("a kérdés segít, nem büntet: kérdéssel minden játékosmodellnél legalább annyi győzelem, mint nélküle", () => {
  for (const [name, player] of [["SIM_AVERAGE", SIM_AVERAGE], ["SIM_STRONG", SIM_STRONG], ["SIM_WEAK", SIM_WEAK]] as const) {
    const withQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 600, grade: 7 });
    const noQ = runSimSeeds(factory, player, { gameId: GAME, seconds: 600, grade: 7, questions: false });
    summary(`${name} kérdéssel`, withQ);
    summary(`${name} kérdés nélkül`, noQ);
    assert.ok(withQ.filter((r) => r.won).length >= noQ.filter((r) => r.won).length, `${name}: kérdéssel kevesebb győzelem`);
  }
});

/*
 * SPEC-VÁLTOZÁS 2026-11-18 (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md, tulajdonosi döntés D1: „Vissza a régi, emelkedő
 * vízhez”): a régi játékban a menedéket a jó válaszok hozzák (N jó válasz = győzelem) — kérdés nélkül tehát nem lehet célba érni.
 * A szigor megmarad: kérdés nélkül is véget ér minden menet (a víz utoléri a figurát), és az ügyes játékos (a zónában maradva)
 * tovább bírja, mint a gyenge — a mozgásnak van tétje.
 */
test("kérdés nélküli mód (K.6): minden menet véget ér (a víz utolér), és a zónában maradó ügyes játékos tovább bírja", () => {
  const strong = runSimSeeds(factory, SIM_STRONG, { gameId: GAME, seconds: 600, questions: false });
  const weak = runSimSeeds(factory, SIM_WEAK, { gameId: GAME, seconds: 600, questions: false });
  summary("SIM_STRONG kérdés nélkül", strong);
  summary("SIM_WEAK kérdés nélkül", weak);
  assert.ok([...strong, ...weak].every((r) => !r.won && r.durationSec < 600), "kérdés nélkül a víz utoléri a figurát (van vesztési feltétel)");
  assert.ok(medianOf(strong.map((r) => r.durationSec)) > medianOf(weak.map((r) => r.durationSec)), "a zónában maradás számít");
  for (const r of [...strong, ...weak]) assert.equal(r.stats.asked, 0);
});

test("J3 — 3–4. évfolyam (SIM_YOUNG): a hosszabb ablak mellett is ≤ 15 mp kérdés nélküli szakasz, ≥ 5 / perc", () => {
  const runs = runSimSeeds(factory, SIM_YOUNG, { gameId: GAME, seconds: 180, grade: 3 });
  summary("SIM_YOUNG 3. évf. 180 s", runs);
  assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 5);
  for (const r of runs) assert.ok(r.stats.maxGapSec <= 15, `maxGap ${r.stats.maxGapSec}`);
});

test("kupon (lecke-jutalom) mód (review #483, M2): 8 és 3 kérdéses leckével sem fogy el a kérdés — J2, J3, visszatérés", () => {
  for (const size of [8, 3]) {
    const material = Array.from({ length: size }, (_, i) => ({ id: `lecke-${i}`, prompt: `Lecke kérdés ${i}?`, options: ["a", "b", "c", "d"], correctIndex: i % 4 }));
    const f = ((o: { seed: number; grade: number; questions: boolean }) => createSimGame({ ...o, material, coupon: true })) as unknown as SimGameFactory;
    const runs = runSimSeeds(f, SIM_AVERAGE, { gameId: GAME, seconds: 180, grade: 7 });
    summary(`kupon, ${size} kérdéses lecke`, runs);
    assert.ok(medianOf(runs.map((r) => r.stats.perMinute)) >= 5, `${size}: kérdés/perc ${medianOf(runs.map((r) => r.stats.perMinute))}`);
    for (const r of runs) {
      assert.ok(r.stats.maxGapSec <= 15, `${size}: kérdés nélküli szakasz ${r.stats.maxGapSec}`);
      assert.ok(r.stats.minGapSec >= 1.5);
      assert.ok(r.stats.reviewShare <= 0.3 + 1e-9);
    }
    assert.ok(medianOf(runs.map((r) => r.stats.reviewReturnWithin6)) >= 0.95, `${size}: visszatérés ${medianOf(runs.map((r) => r.stats.reviewReturnWithin6))}`);
    const long = runSimSeeds(f, SIM_AVERAGE, { gameId: GAME, seconds: 600, grade: 7 });
    const noQ = runSimSeeds(factory, SIM_AVERAGE, { gameId: GAME, seconds: 600, grade: 7, questions: false });
    assert.ok(long.filter((r) => r.won).length >= noQ.filter((r) => r.won).length, `${size}: kupon módban a kérdés nem büntet`);
  }
});

test("3–4. évfolyam (SIM_YOUNG) minden nehézségen ≥ 12/20 győzelem (a Matek-precedens; review #483)", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const f = ((o: { seed: number; grade: number; questions: boolean }) => createSimGame({ ...o, difficulty })) as unknown as SimGameFactory;
    const runs = runSimSeeds(f, SIM_YOUNG, { gameId: GAME, seconds: 600, grade: 3 });
    summary(`SIM_YOUNG 3. évf. ${difficulty}`, runs);
    assert.ok(runs.filter((r) => r.won).length >= 12, `${difficulty}: ${runs.filter((r) => r.won).length}/20`);
  }
});

test("tétlen játékos: a semmit nem csináló játékos kérdései a nyilvántartásban lejártak, nem válaszok", () => {
  // Teljesen tétlen: nem reagál a kérdésre és nem mozog (az ügyességi dobás sosem sikerül) — semmilyen szándékos bemenet.
  const idle = { accuracy: 1, reactionMedianMs: 1e9, skill: 1e-6 };
  const runs = runSimSeeds(factory, idle, { gameId: GAME, seconds: 120, grade: 7 });
  for (const r of runs) {
    assert.ok(r.stats.asked >= 2, `kérdések: ${r.stats.asked}`);
    assert.equal(r.stats.answered, 0, "tétlen játékosnál 0 rögzített válasz");
    assert.ok(r.stats.timeouts >= r.stats.asked - 1, `lejárt ${r.stats.timeouts} / ${r.stats.asked}`);
  }
});

test("J7 — tananyag-elsőbbség: elérhető tananyagnál az első kérdés tananyag, elfogyása után a kézi bank jön", () => {
  const material = [0, 1, 2].map((i) => ({ id: `lecke-${i}`, prompt: `Lecke kérdés ${i}?`, options: ["a", "b", "c", "d"], correctIndex: i % 4 }));
  for (const seed of simSeeds(GAME, 5)) {
    let sim: ReturnType<typeof createSimGame> | null = null;
    const f = ((o: { seed: number; grade: number; questions: boolean }) => (sim = createSimGame({ ...o, material }))) as unknown as SimGameFactory;
    const r = runSim(f, SIM_AVERAGE, { seed, seconds: 180 });
    assert.equal(r.stats.firstSource, "material");
    assert.ok(r.stats.asked > 3, "a tananyag után a bank folytatja");
    assert.ok(sim !== null);
  }
});
