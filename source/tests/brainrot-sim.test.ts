import assert from "node:assert/strict";
import test from "node:test";

import { medianOf, runSim, runSimSeeds, simSeeds, SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, type SimGameFactory, type SimPlayer } from "./support/game-sim";
import { createSimGame } from "../client/src/lib/brainRot/sim";
import { couponBaseKey } from "../client/src/lib/brainRot/couponRepeat";
import { ROUND_MS } from "../client/src/lib/brainRot/core";

/**
 * J5a — a „Lény-aréna” szimulációs elfogadása (végrehajtás J5a 4., K.6; terv 6.2, J2, J3, J4, J6, J7): 20 seed
 * (`seedFrom("sim", "brain-rot-steal", i)`), a menet végéig (90 mp-es valós óra), a közös harness botjával: a bot
 * a legközelebbi lényt üldözi, elkapja, és a reakcióidő után a választott ketrecbe FUT (a válasz a beállás — ha a
 * reakció + az út nem fér az ablakba, lejárat). A J9 (2–5 perces menet) a J5b három fordulójával mérhető (a J5a menete
 * 90 mp — végrehajtás J5a döntései 8.).
 */

const GAME = "brain-rot-steal" as const;
const factory = (extra: Record<string, unknown> = {}): SimGameFactory => (o) => createSimGame({ ...o, ...extra });

const avg = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 180 });

// SPEC-VÁLTOZÁS 2026-11-17 (terv 2026-11-17-brainrot-valaszido D5): a menet-óra a nyitott kérdés alatt áll, így a menet
// kérdés-óra szerinti hossza = 90 mp + a nyitott kérdések ideje (régi elvárás: pontosan 90 mp).
test("a menet a 90 mp-es menet-órával ér véget; a kérdések ideje ezen felül (D5)", () => {
  for (const r of avg) {
    assert.ok(r.durationSec >= ROUND_MS / 1000 - 0.05, `${r.durationSec} mp`);
    assert.ok(r.durationSec > ROUND_MS / 1000 + 5, `a kérdések ideje hozzáadódik: ${r.durationSec} mp`);
  }
  const g = createSimGame({ seed: 4, grade: 7, questions: true });
  runSim(() => g, SIM_AVERAGE, { seed: 4, seconds: 400 });
  assert.equal(g.done(), true);
  assert.equal(g.driver.remainingMs(), 0, "a menet-óra lefutott");
});

test("J2: kérdés/perc (SIM_AVERAGE, 20 seed medián) ≥ 8 — minden elkapás egy ketrec-kérdés", () => {
  const perMin = medianOf(avg.map((r) => r.stats.perMinute));
  assert.ok(perMin >= 8, `medián ${perMin.toFixed(2)} / perc`);
  // a 3–4. évfolyamos (lassabb) és a gyengébb játékosnál is
  const young = runSimSeeds(factory(), SIM_YOUNG, { gameId: GAME, seconds: 180, grade: 4 });
  assert.ok(medianOf(young.map((r) => r.stats.perMinute)) >= 8, "SIM_YOUNG ≥ 8 / perc");
  const weak = runSimSeeds(factory(), SIM_WEAK, { gameId: GAME, seconds: 180 });
  assert.ok(medianOf(weak.map((r) => r.stats.perMinute)) >= 8, "SIM_WEAK ≥ 8 / perc");
});

test("J3: a menet első 10 mp-e után nincs 12 mp-nél hosszabb kérdés nélküli szakasz; két indítás között ≥ 1,5 mp", () => {
  for (const players of [SIM_AVERAGE, SIM_WEAK, SIM_YOUNG]) {
    for (const r of runSimSeeds(factory(), players, { gameId: GAME, seconds: 180, grade: players === SIM_YOUNG ? 4 : 7 })) {
      assert.ok(r.stats.maxGapSec <= 12, `maxGap ${r.stats.maxGapSec}`);
      assert.ok(r.stats.minGapSec >= 1.5, `minGap ${r.stats.minGapSec}`);
    }
  }
});

test("J4: ismétlés — arány ≤ 30%, a hibázott tételek (medián) visszatérnek a 3.–6. kérdésként; a gyengébbnél ≤ 10 kérdésen belül", () => {
  for (const r of avg) assert.ok(r.stats.reviewShare <= 0.3 + 1e-9, `reviewShare ${r.stats.reviewShare}`);
  const within6 = medianOf(avg.map((r) => r.stats.reviewReturnWithin6));
  assert.ok(within6 >= 0.95, `3.–6. kérdésen belül: ${within6}`);
  const weak = runSimSeeds(factory(), SIM_WEAK, { gameId: GAME, seconds: 180 });
  assert.ok(medianOf(weak.map((r) => r.stats.reviewReturnWithin10)) >= 0.6);
});

test("J6: az új (nem ismétlő) kérdések bármely 40-es ablaka duplikátum nélküli (≥ 200 tételes forrás)", () => {
  for (const r of avg) {
    const fresh = r.stats.asked - r.stats.reviewsAsked;
    assert.equal(r.stats.freshWindow40Distinct, Math.min(40, fresh), `freshWindow40Distinct ${r.stats.freshWindow40Distinct} (${fresh} új)`);
  }
});

test("J7: elérhető tananyag-tételnél az első kérdés tananyag, utána a bank folytatja", () => {
  const material = [1, 2, 3].map((n) => ({ id: `m${n}`, prompt: `Tananyag ${n}?`, options: ["a", "b", "c", "d"], correctIndex: 0 }));
  const g = createSimGame({ seed: 5, grade: 7, questions: true, material });
  const r = runSim(() => g, SIM_STRONG, { seed: 5, seconds: 180 });
  const keys = g.askedKeys();
  assert.equal(r.stats.firstSource, "material");
  assert.deepEqual(keys.slice(0, 3), ["mat:m1", "mat:m2", "mat:m3"]);
  assert.ok(keys.slice(3).every((k) => k.startsWith("bank:")));
});

test("játszhatóság: a ketrec-kérdés nem büntet túl — az erős játékos szinte mindig, az átlagos a menetek többségében teljesíti a 10 lényt; a lejárat ritka", () => {
  const strong = runSimSeeds(factory(), SIM_STRONG, { gameId: GAME, seconds: 180 });
  assert.ok(strong.filter((r) => r.won).length >= 18, "az erős játékos szinte mindig nyer");
  const wins = avg.filter((r) => r.won).length / avg.length;
  assert.ok(wins >= 0.5, `átlagos nyerési arány ${wins}`);
  // A válasz = futás a ketrecig: az átlagos játékosnál a kérdések legfeljebb ~15%-a fut ki az időből.
  const timeoutShare = medianOf(avg.map((r) => r.stats.timeouts / Math.max(1, r.stats.asked)));
  assert.ok(timeoutShare <= 0.15, `lejárati arány medián ${timeoutShare.toFixed(2)}`);
});

test("K.6 kérdés nélkül (questions: false): a menet végigjátszható, és van vesztési feltétel (kevés lény a 90 mp végén)", () => {
  const noQ = runSimSeeds(factory(), SIM_AVERAGE, { gameId: GAME, seconds: 180, questions: false });
  assert.ok(noQ.every((r) => Math.abs(r.durationSec - 90) < 0.05), "minden menet a 90 mp végén zárul");
  assert.ok(noQ.every((r) => r.stats.asked === 0));
  // J5a 13. (review #485 K1/K2): a kérdés nélküli megtartás pontot ad, de győzelmet nem — a kérdés így sosem ront az esélyen.
  assert.ok(noQ.every((r) => !r.won), "kérdés nélkül nincs győzelem (a megtartás csak pont)");
  // Ügyetlen játékos (alig kormányoz): a 10 lény nem jön össze → vereség lehetséges.
  const clumsy: SimPlayer = { accuracy: 0.5, reactionMedianMs: 3000, skill: 0.03 };
  const lose = runSimSeeds(factory(), clumsy, { gameId: GAME, seconds: 180, questions: false });
  assert.ok(lose.some((r) => !r.won), "elveszíthető");
  // Üres kérdésforrás (terv 8.1): az elkapás közvetlenül számít, a játék megy.
  const empty = runSim(factory({ bankSize: 0 }), SIM_AVERAGE, { seed: 3, seconds: 180 });
  assert.equal(empty.stats.asked, 0);
  assert.ok(empty.won || empty.durationSec >= 89.9);
});

test("arany visszajátszás: fix seed + bot-bemenet → azonos végállapot és statisztika", () => {
  const a = createSimGame({ seed: 42, grade: 7, questions: true });
  const b = createSimGame({ seed: 42, grade: 7, questions: true });
  const ra = runSim(() => a, SIM_AVERAGE, { seed: 42, seconds: 180 });
  const rb = runSim(() => b, SIM_AVERAGE, { seed: 42, seconds: 180 });
  assert.deepEqual(ra, rb);
  assert.equal(a.hash(), b.hash());
});

test("C-56 / review #485: a mindig a jó ketrecet választó bot egyetlen kérdést sem ront el (átfutás nem választ)", () => {
  const perfect: SimPlayer = { accuracy: 1, reactionMedianMs: 2000, skill: 0.9 };
  const runs = runSimSeeds(factory(), perfect, { gameId: GAME, seconds: 180 });
  for (const r of runs) assert.equal(r.stats.wrong, 0, `téves válasz: ${r.stats.wrong}`);
});

test("review #485 B1: a döntés ELŐTT regisztrált (véletlen) válasz 0 — minden modellnél, emberi elengedéssel (150–500 ms), joystickkal és böködéssel", () => {
  for (const [player, grade] of [[SIM_AVERAGE, 7], [SIM_YOUNG, 4], [SIM_WEAK, 7], [SIM_STRONG, 7]] as const) {
    for (const input of ["stick", "tap"] as const) {
      for (const releaseMs of ["human", 500] as const) {
        let premature = 0;
        let asked = 0;
        for (const seed of simSeeds(GAME)) {
          const g = createSimGame({ seed, grade, questions: true, input, releaseMs });
          const r = runSim(() => g, player, { seed, seconds: 180 });
          premature += g.prematureAnswers();
          asked += r.stats.asked;
        }
        assert.ok(asked > 200, "érdemi minta");
        assert.equal(premature, 0, `${input}, elengedés ${releaseMs}: ${premature}/${asked} véletlen válasz`);
      }
    }
  }
});

test("review #485 Ú1: húzásos mód (az ujj a nyitáskor lent marad és mozdul) — a döntés előtti válasz 0, az ujj a lényen és 0,15 egységgel előtte", () => {
  for (const [player, grade] of [[SIM_AVERAGE, 7], [SIM_YOUNG, 4]] as const) {
    for (const dragLead of [0, 0.15]) {
      let premature = 0;
      let asked = 0;
      for (const seed of simSeeds(GAME)) {
        const g = createSimGame({ seed, grade, questions: true, input: "drag", dragLead });
        const r = runSim(() => g, player, { seed, seconds: 180 });
        premature += g.prematureAnswers();
        asked += r.stats.asked;
      }
      assert.ok(asked > 200, `érdemi minta (${asked})`);
      assert.equal(premature, 0, `húzás, előny ${dragLead}: ${premature}/${asked} véletlen válasz`);
    }
  }
});

test("review #485 K2: a gyengébb játékos kérdéssel is nyerhet néha (≥ 3/20), a 3–4. évfolyamos ≥ 12/20", () => {
  const weak = runSimSeeds(factory(), SIM_WEAK, { gameId: GAME, seconds: 180 });
  assert.ok(weak.filter((r) => r.won).length >= 3, `gyengébb: ${weak.filter((r) => r.won).length}/20`);
  const young = runSimSeeds(factory(), SIM_YOUNG, { gameId: GAME, seconds: 180, grade: 4 });
  assert.ok(young.filter((r) => r.won).length >= 12, `3–4. évf.: ${young.filter((r) => r.won).length}/20`);
});

test("review #485 Ú4: a győzelem a pontossággal monoton nem csökken (20 / 45 / 75 / 95%) minden évfolyamsávban (tűrés 1/20)", () => {
  // A reviewer `mono.ts` modelljei: évfolyamsávonként reakcióidő és ügyesség, csak a pontosság változik.
  for (const [grade, reactionMedianMs, skill] of [[4, 3500, 0.7], [7, 2800, 0.8], [11, 2400, 0.85]] as const) {
    const wins = [0.2, 0.45, 0.75, 0.95].map(
      (accuracy) => runSimSeeds(factory(), { accuracy, reactionMedianMs, skill }, { gameId: GAME, seconds: 180, grade }).filter((r) => r.won).length,
    );
    for (let i = 1; i < wins.length; i++) {
      assert.ok(wins[i]! >= wins[i - 1]! - 1, `${grade}. évf.: győzelem a pontossággal ${wins.join(" / ")} (nem csökkenhet)`);
    }
    assert.ok(wins[3]! > wins[0]!, `${grade}. évf.: a pontosság számít (${wins.join(" / ")})`);
  }
});

test("review #485 K1: kupon módban 8 / 5 / 3 tételes leckével sem fogy el a kérdés (nincs kérdés nélküli megtartás), és a győzelmi arány nem rosszabb a kupon nélkülinél", () => {
  const lesson = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `lecke-${i}`, prompt: `Lecke-kérdés ${i}?`, options: [`jó${i}`, `b${i}`, `c${i}`, `d${i}`], correctIndex: i % 4 }));
  for (const [player, grade] of [[SIM_AVERAGE, 7], [SIM_YOUNG, 4]] as const) {
    const plain = runSimSeeds(factory(), player, { gameId: GAME, seconds: 180, grade }).filter((r) => r.won).length;
    for (const n of [8, 5, 3]) {
      let wins = 0;
      for (const seed of simSeeds(GAME)) {
        const g = createSimGame({ seed, grade, questions: true, coupon: true, material: lesson(n) });
        const r = runSim(() => g, player, { seed, seconds: 180, grade });
        if (r.won) wins += 1;
        assert.equal(g.state().direct, 0, `${n} tétel, seed ${seed}: kérdés nélküli megtartás`);
        const keys = g.askedKeys();
        assert.ok(keys.length >= 10, `${n} tétel: ${keys.length} kérdés`);
        assert.ok(keys.every((k) => k.startsWith("mat:lecke-")), "csak a lecke anyaga");
        for (let i = 1; i < keys.length; i++) {
          assert.notEqual(couponBaseKey(keys[i]!), couponBaseKey(keys[i - 1]!), `${n} tétel: közvetlen ismétlés`);
        }
      }
      assert.ok(wins >= plain, `${n} tétel: kuponnal ${wins}/20, kupon nélkül ${plain}/20`);
    }
  }
});

test("review #485 (Vercel 4597845275): ha a vadász a nyitáskor egy ketrec peremén áll, a bot így is válaszol (a lejárat nem nő), idő előtti válasz nincs", () => {
  for (const [player, grade] of [[SIM_AVERAGE, 7], [SIM_YOUNG, 4], [SIM_STRONG, 7]] as const) {
    for (const input of ["stick", "tap", "drag"] as const) {
      const run = (startInCageZone: boolean) => {
        let timeouts = 0;
        let premature = 0;
        let asked = 0;
        for (const seed of simSeeds(GAME)) {
          const g = createSimGame({ seed, grade, questions: true, input, startInCageZone });
          const r = runSim(() => g, player, { seed, seconds: 180, grade });
          timeouts += r.stats.timeouts;
          premature += g.prematureAnswers();
          asked += r.stats.asked;
        }
        return { timeouts, premature, asked };
      };
      const base = run(false);
      const edge = run(true);
      assert.equal(edge.premature, 0, `${input}: idő előtti válasz a peremről`);
      // A javítás nélkül (mérve): átlagos bökésnél 75 lejárat a 14 helyett.
      assert.ok(edge.timeouts <= base.timeouts + 3, `${input}: lejárat a peremről ${edge.timeouts}/${edge.asked}, alap ${base.timeouts}/${base.asked}`);
    }
  }
});
