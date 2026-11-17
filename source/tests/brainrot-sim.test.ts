import assert from "node:assert/strict";
import test from "node:test";

import { medianOf, runSim, runSimSeeds, SIM_AVERAGE, SIM_STRONG, SIM_WEAK, SIM_YOUNG, type SimGameFactory, type SimPlayer } from "./support/game-sim";
import { createSimGame } from "../client/src/lib/brainRot/sim";
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

test("a menet a 90 mp-es valós órával ér véget (a kérdés alatt is jár)", () => {
  for (const r of avg) assert.ok(Math.abs(r.durationSec - ROUND_MS / 1000) < 0.05, `${r.durationSec} mp`);
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
  assert.ok(noQ.some((r) => r.won), "megnyerhető");
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
