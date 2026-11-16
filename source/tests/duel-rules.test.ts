import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import {
  DUEL_BASE_DAMAGE,
  DUEL_HP,
  DUEL_MAX_TIEBREAKS,
  DUEL_ROUNDS,
  HUMAN_MIN_MS,
  MAX_LATENCY_SLACK_MS,
  SPEED_BANDS,
  TIE_MS,
  acceptedTimeMs,
  accuracyOf,
  aliveOf,
  applyRound,
  createDuel,
  scoreRound,
  speedBonusFor,
  verdict,
  type DuelAnswer,
  type DuelState,
} from "../shared/duel/rules";

/**
 * JM1 — párbaj-szabálymotor (végrehajtás JM-K + JM1 2. lépés; terv 10.5, D14; elfogadás JM-A3).
 * A kötelező egységtesztek a JM-K kommentje szerint (az `acceptedTimeMs` határesetei), plusz a JM1 2. lépés listája.
 */

const W = 6000;
const ans = (playerId: string, correct: boolean, acceptedMs: number | null, windowMs = W): DuelAnswer => ({
  playerId,
  correct,
  acceptedMs,
  windowMs,
});

/** Egy kör lejátszása a szabály szerint (az élő játékosokkal). */
function play(s: DuelState, answers: DuelAnswer[]): DuelState {
  return applyRound(s, scoreRound(answers, aliveOf(s)), answers);
}

test("konstansok: 100 életerő, 10 alapsebzés, 7 kör, legfeljebb 2 döntő; a bónusz-sávok ≤ 25%", () => {
  assert.equal(DUEL_HP, 100);
  assert.equal(DUEL_BASE_DAMAGE, 10);
  assert.equal(DUEL_ROUNDS, 7);
  assert.equal(DUEL_MAX_TIEBREAKS, 2);
  assert.deepEqual(SPEED_BANDS.map((b) => [b.maxRatio, b.bonus]), [[0.25, 2.5], [0.5, 1.5], [0.75, 0.5]]);
  for (const b of SPEED_BANDS) assert.ok(b.bonus <= DUEL_BASE_DAMAGE * 0.25);
  assert.equal(TIE_MS, 200);
  assert.equal(MAX_LATENCY_SLACK_MS, 400);
  assert.equal(HUMAN_MIN_MS, 200);
});

test("2 játékos, mindkettő jó → mindkettő sebez (alap + saját sávos bónusz)", () => {
  const o = scoreRound([ans("a", true, 1000), ans("b", true, 4000)], ["a", "b"]);
  // a: 1000/6000 = 0,167 → +2,5 → b kap 12,5; b: 4000/6000 = 0,667 → +0,5 → a kap 10,5
  assert.deepEqual(o.damageTo, { a: 10.5, b: 12.5 });
  assert.deepEqual(o.speedBonus, { a: 2.5, b: 0.5 });
  assert.equal(o.fastestCorrect, "a");
});

test("sávhatárok: 0,25 / 0,5 / 0,75 a határon még a gyorsabb sáv; fölötte a következő; 0,75 fölött 0", () => {
  assert.equal(speedBonusFor(1500, 6000), 2.5); // 0,25
  assert.equal(speedBonusFor(1501, 6000), 1.5);
  assert.equal(speedBonusFor(3000, 6000), 1.5); // 0,5
  assert.equal(speedBonusFor(3001, 6000), 0.5);
  assert.equal(speedBonusFor(4500, 6000), 0.5); // 0,75
  assert.equal(speedBonusFor(4501, 6000), 0);
  assert.equal(speedBonusFor(6000, 6000), 0);
  // a saját ablakhoz mért arány: 7500 ms-os (3–4. évf.) ablakban 1875 ms még 0,25
  assert.equal(speedBonusFor(1875, 7500), 2.5);
  assert.equal(speedBonusFor(1875, 6000), 1.5);
});

test("rossz válasz 0 sebzés és nincs levonás; a hiányzó válasz is 0", () => {
  const o = scoreRound([ans("a", false, 800), ans("b", false, null)], ["a", "b"]);
  assert.deepEqual(o.damageTo, { a: 0, b: 0 });
  assert.deepEqual(o.speedBonus, { a: 0, b: 0 });
  assert.equal(o.fastestCorrect, null);
  const s = play(createDuel(["a", "b"]), [ans("a", false, 800), ans("b", false, null)]);
  assert.deepEqual(s.hp, { a: 100, b: 100 }, "a rossz válaszoló sem veszít életerőt");
  assert.equal(s.stats.a!.answered, 1);
  assert.equal(s.stats.b!.answered, 0);
  assert.equal(s.stats.a!.asked, 1);
  assert.equal(s.stats.b!.asked, 1);
});

test("az ablakon túli (vagy nem véges) elfogadott idő nem számít helyesnek", () => {
  const o = scoreRound([ans("a", true, 6001), ans("b", true, Number.NaN)], ["a", "b"]);
  assert.deepEqual(o.damageTo, { a: 0, b: 0 });
});

test("150 ms-os elfogadott idő: a válasz helyes (sebez), de bónusz 0, és a leggyorsabb időbe nem számít", () => {
  const o = scoreRound([ans("a", true, 150), ans("b", false, 2000)], ["a", "b"]);
  assert.equal(o.speedBonus.a, 0);
  assert.equal(o.damageTo.b, 10);
  const s = applyRound(createDuel(["a", "b"]), o, [ans("a", true, 150), ans("b", false, 2000)]);
  assert.equal(s.stats.a!.correct, 1);
  assert.equal(s.stats.a!.fastestMs, null, "gyanús kör kihagyva");
});

test("leggyorsabb helyes: 200 ms-on belüli különbség holtverseny (null), azon túl a gyorsabb", () => {
  assert.equal(scoreRound([ans("a", true, 1000), ans("b", true, 1199)], ["a", "b"]).fastestCorrect, null);
  assert.equal(scoreRound([ans("a", true, 1000), ans("b", true, 1200)], ["a", "b"]).fastestCorrect, "a");
  assert.equal(scoreRound([ans("a", false, 500), ans("b", true, 5000)], ["a", "b"]).fastestCorrect, "b");
});

test("csak az élők válasza számít, csak élő kap sebzést, és játékosonként csak az első bejegyzés", () => {
  const o = scoreRound([ans("a", true, 1000), ans("a", true, 300), ans("x", true, 300)], ["a", "b"]);
  assert.deepEqual(o.damageTo, { a: 0, b: 12.5 });
  assert.equal("x" in o.damageTo, false);
});

test("3–4 fő: a sebzés egyenlően oszlik a többi élő között, felfelé kerekítve (a sajátodat nem csökkenti)", () => {
  const three = scoreRound([ans("a", true, 1000), ans("b", false, 900), ans("c", false, null)], ["a", "b", "c"]);
  assert.deepEqual(three.damageTo, { a: 0, b: 6.3, c: 6.3 }); // 12,5 / 2 = 6,25 → 6,3
  const four = scoreRound([ans("a", true, 1000), ans("b", true, 5000)], ["a", "b", "c", "d"]);
  // a: 12,5 / 3 = 4,1667 → 4,2 mindenkinek (b, c, d); b: 10 / 3 = 3,333 → 3,4 (a, c, d)
  assert.deepEqual(four.damageTo, { a: 3.4, b: 4.2, c: 7.6, d: 7.6 });
  for (const share of [4.2, 3.4]) assert.ok(share * 3 >= 10 - 1e-9);
});

test("7 kör után holtverseny → döntő; 2 döntő után még holtverseny → közös győzelem", () => {
  let s = createDuel(["a", "b"]);
  for (let r = 0; r < DUEL_ROUNDS; r++) s = play(s, [ans("a", true, 2000), ans("b", true, 2000)]);
  assert.equal(s.round, 7);
  assert.equal(s.hp.a, s.hp.b);
  let v = verdict(s);
  assert.deepEqual([v.finished, v.needTiebreak], [false, true]);
  s = play(s, [ans("a", true, 2000), ans("b", true, 2000)]);
  assert.equal(s.tiebreaks, 1);
  v = verdict(s);
  assert.deepEqual([v.finished, v.needTiebreak], [false, true]);
  s = play(s, [ans("a", false, 2000), ans("b", false, 2000)]);
  assert.equal(s.tiebreaks, 2);
  v = verdict(s);
  assert.equal(v.finished, true);
  assert.equal(v.coWin, true);
  assert.deepEqual(v.winners.sort(), ["a", "b"]);
  assert.deepEqual(v.podium, [["a", "b"]]);
});

test("döntő kör eldönti: aki jól válaszol, nyer (még ha a rendes körökben egyenlők voltak)", () => {
  let s = createDuel(["a", "b"]);
  for (let r = 0; r < DUEL_ROUNDS; r++) s = play(s, [ans("a", r % 2 === 0, 2000), ans("b", r % 2 === 0, 2000)]);
  s = play(s, [ans("a", false, 2000), ans("b", true, 5000)]);
  const v = verdict(s);
  assert.deepEqual([v.finished, v.coWin, v.winners], [true, false, ["b"]]);
  assert.deepEqual(v.podium, [["b"], ["a"]]);
});

test("pontosság-elsődleges: 7/7 lassú helyes legyőzi a 6/7 közepes tempójú helyest", () => {
  let s = createDuel(["pontos", "gyors"]);
  for (let r = 0; r < DUEL_ROUNDS; r++) s = play(s, [ans("pontos", true, 5000), ans("gyors", r > 0, 2500)]);
  // pontos: 7 × 10 = 70 sebzés; gyors: 6 × 11,5 = 69 sebzés
  assert.deepEqual(verdict(s).winners, ["pontos"]);
});

test("KO: ha egy kivételével mindenki 0 életerőn, a meccs véget ér; több fő esetén a később kiesett előrébb áll", () => {
  let s: DuelState = { ...createDuel(["a", "b", "c"]), hp: { a: 100, b: 6, c: 12 } };
  s = play(s, [ans("a", true, 1000), ans("b", false, 900), ans("c", false, 900)]);
  assert.deepEqual(s.hp, { a: 100, b: 0, c: 5.7 });
  assert.equal(s.koRound.b, 1);
  assert.equal(verdict(s).finished, false);
  s = play(s, [ans("a", true, 1000), ans("c", false, 900)]);
  const v = verdict(s);
  assert.equal(v.finished, true);
  assert.deepEqual(v.winners, ["a"]);
  assert.deepEqual(v.podium, [["a"], ["c"], ["b"]]);
});

test("sorozat és leggyorsabb: a rossz válasz nullázza a sorozatot, a legjobb megmarad", () => {
  let s = createDuel(["a", "b"]);
  for (const c of [true, true, true, false, true]) s = play(s, [ans("a", c, c ? 2400 : 900), ans("b", false, null)]);
  assert.equal(s.stats.a!.bestStreak, 3);
  assert.equal(s.stats.a!.streak, 1);
  assert.equal(s.stats.a!.fastestMs, 2400);
  assert.equal(accuracyOf(s.stats.a!), 4 / 5);
  assert.equal(accuracyOf(s.stats.b!), 0);
});

test("createDuel: 2–4 egyedi, nem üres azonosító; különben RangeError; az applyRound a bemenetet nem módosítja", () => {
  assert.throws(() => createDuel(["a"]), RangeError);
  assert.throws(() => createDuel(["a", "b", "c", "d", "e"]), RangeError);
  assert.throws(() => createDuel(["a", "a"]), RangeError);
  assert.throws(() => createDuel(["a", ""]), RangeError);
  const s = createDuel(["a", "b"]);
  const snapshot = JSON.stringify(s);
  play(s, [ans("a", true, 1000), ans("b", true, 1000)]);
  assert.equal(JSON.stringify(s), snapshot);
});

test("tulajdonság (10 000 seedelt véletlen kör): a bónusz ≤ 25%, a sebzés ≥ 0, a rossz válaszoló nem sebez, az életerő 0..100", () => {
  const rng = createRng("duel-rules-property");
  for (let i = 0; i < 10_000; i++) {
    const n = 2 + rng.int(3);
    const ids = ["p0", "p1", "p2", "p3"].slice(0, n);
    const answers = ids.map((id) => {
      const windowMs = 2500 + rng.int(6501);
      const kind = rng.int(10);
      const acceptedMs = kind === 0 ? null : kind === 1 ? rng.int(HUMAN_MIN_MS) : rng.int(windowMs + 800);
      return ans(id, rng.next() < 0.6, acceptedMs, windowMs);
    });
    const o = scoreRound(answers, ids);
    for (const a of answers) {
      const bonus = o.speedBonus[a.playerId]!;
      assert.ok(bonus >= 0 && bonus <= DUEL_BASE_DAMAGE * 0.25, `bónusz ${bonus}`);
      if (!a.correct) assert.equal(bonus, 0);
      if (a.acceptedMs !== null && a.acceptedMs < HUMAN_MIN_MS) assert.equal(bonus, 0);
    }
    let dealtTotal = 0;
    for (const a of answers) {
      if (a.correct && a.acceptedMs !== null && a.acceptedMs <= a.windowMs) dealtTotal += DUEL_BASE_DAMAGE + o.speedBonus[a.playerId]!;
    }
    const received = Object.values(o.damageTo).reduce((x, y) => x + y, 0);
    assert.ok(received + 1e-9 >= dealtTotal, "a kerekítés nem csökkenti a kiosztott sebzést");
    assert.ok(received <= dealtTotal + 0.1 * n * n, "a kerekítés legfeljebb tizedenként növel");
    for (const v of Object.values(o.damageTo)) assert.ok(v >= 0);
    const s = applyRound(createDuel(ids), o, answers);
    for (const id of ids) assert.ok(s.hp[id]! >= 0 && s.hp[id]! <= DUEL_HP);
  }
});

// --- acceptedTimeMs: a JM-K kötelező listája ---

test("acceptedTimeMs: clientRtMs = 0 → serverRtMs", () => {
  assert.equal(acceptedTimeMs(0, 2000, 100).acceptedMs, 2000);
});

test("acceptedTimeMs: negatív clientRtMs → serverRtMs", () => {
  assert.equal(acceptedTimeMs(-50, 2000, 100).acceptedMs, 2000);
});

test("acceptedTimeMs: NaN / Infinity / -Infinity / undefined / null → serverRtMs", () => {
  for (const c of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, null]) {
    assert.equal(acceptedTimeMs(c, 2000, 100).acceptedMs, 2000, String(c));
  }
});

test("acceptedTimeMs: clientRtMs > serverRtMs → serverRtMs (felső vágás)", () => {
  assert.equal(acceptedTimeMs(2500, 2000, 100).acceptedMs, 2000);
});

test("acceptedTimeMs: clientRtMs < serverRtMs − slack → serverRtMs − slack (alsó vágás)", () => {
  assert.equal(acceptedTimeMs(1000, 2000, 300).acceptedMs, 1700);
});

test("acceptedTimeMs: a kettő között → clientRtMs", () => {
  assert.equal(acceptedTimeMs(1800, 2000, 300).acceptedMs, 1800);
});

test("acceptedTimeMs: medianRttMs = 5000 → slack 400 (plafon)", () => {
  assert.equal(acceptedTimeMs(100, 2000, 5000).acceptedMs, 1600);
});

test("acceptedTimeMs: medianRttMs negatív / NaN / Infinity → slack 0", () => {
  for (const m of [-100, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(acceptedTimeMs(1500, 2000, m).acceptedMs, 2000, String(m));
  }
});

test("acceptedTimeMs: acceptedMs = 150 → speedEligible false, suspicious true, bónusz 0", () => {
  const r = acceptedTimeMs(150, 150, 0);
  assert.deepEqual(r, { acceptedMs: 150, speedEligible: false, suspicious: true });
  assert.equal(speedBonusFor(r.acceptedMs, 6000), 0);
  const ok = acceptedTimeMs(null, 200, 0);
  assert.deepEqual(ok, { acceptedMs: 200, speedEligible: true, suspicious: false });
});

test("acceptedTimeMs: a kliens állítása sosem tesz gyorsabbá, mint a mérés mínusz a slack (és nem negatív)", () => {
  const rng = createRng("accepted-time-property");
  for (let i = 0; i < 5000; i++) {
    const server = rng.int(9001);
    const rtt = rng.int(1200) - 100;
    const client = rng.next() < 0.1 ? Number.NaN : rng.int(10_000) - 500;
    const r = acceptedTimeMs(client, server, rtt);
    const slack = Math.min(400, Math.max(0, rtt));
    assert.ok(r.acceptedMs <= server);
    assert.ok(r.acceptedMs >= Math.max(0, server - slack));
  }
});

test("az ablakon túl érkező válasz ROUND_CLOSED — a motor elutasítja, nem kerül a pontozásba (lásd rt-room-machine.test.ts)", () => {
  // A `scoreRound` védekezésből is 0-t ad rá (fent), a tényleges elutasítást a `reduceRoom` végzi (JM1r: a `reduceMatch` megszűnt).
  assert.equal(scoreRound([ans("a", true, W + 1)], ["a", "b"]).damageTo.b, 0);
});
