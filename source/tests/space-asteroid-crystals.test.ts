import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import {
  CRYSTAL_FLOOR_CLEARANCE,
  CRYSTAL_HIT_FACTOR,
  CRYSTAL_MIN_ZONE_HEIGHT,
  CRYSTAL_RADIUS,
  CRYSTAL_SHARD_COUNT,
  CRYSTAL_SHARD_VY_MAX,
  CRYSTAL_SHARD_VY_MIN,
  crystalAt,
  crystalBounds,
  crystalShards,
  hitCrystal,
  rezoneCrystals,
  spawnCrystals,
  stepCrystals,
  type CrystalPresentation,
} from "../client/src/lib/spaceAsteroid/crystals";
import { PLAYER_Y_MAX } from "../client/src/lib/spaceAsteroid/physics";

/**
 * J6a — a Kristály-válasz tiszta magja (végrehajtás J6a 2., 5. lépés; terv 5.6 Q1): spawn (3–4 kristály, felső sáv,
 * nem ütközik a játékossal, nem fedik egymást), találat (egy válasz kristályonként, idempotens), hasadás (3 apró szikla).
 */

const pres = (n: 3 | 4, correct = 0, id = 1): CrystalPresentation => ({
  id,
  options: Array.from({ length: n }, (_, i) => ({ label: `válasz ${i + 1}`, correct: i === correct })),
});
const bounds = (halfWidth = 8.9) => crystalBounds({ halfWidth, minY: 0.5, maxY: 6.2 });
/** A modul nem nulla lebegést is helyesen kezeli (az alapérték 0: a cél áll) — a mozgás-tesztek ezt kérik. */
const DRIFT = { x: 0.4, y: 0.35 };

test("a kristályzóna a hajó legfelső helye fölött marad, ha van hely; különben a felső perembe kapaszkodva a minimum-magasságot tartja", () => {
  // elég hely: a kért alsó perem a hajó fölötti padló alá nem mehet
  const roomy = crystalBounds({ halfWidth: 9, minY: -20, maxY: 6 });
  assert.ok(roomy.minY >= PLAYER_Y_MAX + CRYSTAL_FLOOR_CLEARANCE - 1e-9, `minY ${roomy.minY}`);
  assert.ok(roomy.maxY - roomy.minY >= CRYSTAL_MIN_ZONE_HEIGHT - 1e-9);
  // szűk hely (hosszú kérdés: a kártya alatt alig maradt hely): a zóna a felső pereméből lefelé nyúlik, a magassága megvan
  const tight = crystalBounds({ halfWidth: 9, minY: 3.5, maxY: 4.5 });
  assert.ok(Math.abs(tight.maxY - tight.minY - CRYSTAL_MIN_ZONE_HEIGHT) < 1e-9, `magasság ${tight.maxY - tight.minY}`);
  assert.equal(tight.maxY, 4.5);
  // a pálya tetején belül marad
  const high = crystalBounds({ halfWidth: 9, minY: 3, maxY: 40 });
  assert.ok(high.maxY <= 12 - CRYSTAL_RADIUS + 1e-9);
  assert.ok(high.maxY >= high.minY);
  const b = roomy;
  // érvénytelen félszélesség: biztonságos alapérték, nem NaN
  const bad = crystalBounds({ halfWidth: Number.NaN, minY: 0, maxY: 6 });
  assert.ok(Number.isFinite(bad.minX) && bad.minX < bad.maxX);
});

test("spawn: pontosan annyi kristály, ahány opció (3 vagy 4), opció-indexszel, felirattal és a helyes jelöléssel", () => {
  for (const n of [3, 4] as const) {
    const cs = spawnCrystals(pres(n, n - 1), bounds(), createRng(7).next);
    assert.equal(cs.length, n);
    cs.forEach((c, i) => {
      assert.equal(c.optionIndex, i);
      assert.equal(c.label, `válasz ${i + 1}`);
      assert.equal(c.correct, i === n - 1);
      assert.ok(c.alive);
    });
    assert.equal(new Set(cs.map((c) => c.id)).size, n, "az azonosítók egyediek");
  }
  assert.deepEqual(spawnCrystals(pres(3), bounds(), createRng(1).next).map((c) => c.id).sort((a, b) => a - b), [8, 9, 10]);
  // kétnél kevesebb opció: nincs mit választani
  assert.deepEqual(spawnCrystals({ id: 1, options: [{ label: "a", correct: true }] }, bounds(), createRng(1).next), []);
});

test("spawn: azonos seed → azonos kristályok; más seed → más lebegés (determinizmus)", () => {
  const a = spawnCrystals(pres(4), bounds(), createRng(11).next);
  const b = spawnCrystals(pres(4), bounds(), createRng(11).next);
  const c = spawnCrystals(pres(4), bounds(), createRng(12).next);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((x) => x.phase), c.map((x) => x.phase));
});

test("a kristályok a zónájukban lebegnek és soha nem érnek a hajó legfelső helyére (60 mp lebegés, sok seed, keskeny és széles nézet)", () => {
  for (const halfWidth of [6.2, 8.9, 20]) {
    for (let seed = 1; seed <= 30; seed++) {
      const b = bounds(halfWidth);
      const cs = spawnCrystals(pres(seed % 2 === 0 ? 4 : 3), b, createRng(seed).next, DRIFT);
      for (let step = 0; step < 3600; step++) {
        stepCrystals(cs, 1 / 60);
        for (const c of cs) {
          assert.ok(c.y - CRYSTAL_RADIUS * CRYSTAL_HIT_FACTOR > PLAYER_Y_MAX + 1.5, `seed ${seed}: a kristály (${c.y.toFixed(2)}) a hajó legfelső helyére ért`);
          assert.ok(c.y >= b.minY - 1e-9 && c.y <= b.maxY + 1e-9, `seed ${seed}: kiesett a zónából (${c.y})`);
          assert.ok(c.x >= b.minX - 1e-9 && c.x <= b.maxX + 1e-9, `seed ${seed}: kiesett a zónából (${c.x})`);
        }
      }
    }
  }
});

test("a kristályok soha nem fedik egymást: két kristály középpontja ≥ 2 × sugár (a mobil mérő M2 pontja)", () => {
  for (const halfWidth of [5.5, 8.9, 20]) {
    for (let seed = 1; seed <= 40; seed++) {
      const cs = spawnCrystals(pres(4), bounds(halfWidth), createRng(seed * 31).next, DRIFT);
      for (let step = 0; step < 1800; step++) {
        stepCrystals(cs, 1 / 60);
        for (let i = 0; i < cs.length; i++) {
          for (let j = i + 1; j < cs.length; j++) {
            const d = Math.hypot(cs[i]!.x - cs[j]!.x, cs[i]!.y - cs[j]!.y);
            assert.ok(d >= CRYSTAL_RADIUS * 2, `halfWidth ${halfWidth}, seed ${seed}: ${d.toFixed(2)} < ${CRYSTAL_RADIUS * 2}`);
          }
        }
      }
    }
  }
});

test("stepCrystals: a halott kristály áll, a nem pozitív lépés nem mozdít", () => {
  const cs = spawnCrystals(pres(3), bounds(), createRng(3).next, DRIFT);
  const before = cs.map((c) => [c.x, c.y]);
  stepCrystals(cs, 0);
  stepCrystals(cs, -1);
  stepCrystals(cs, Number.NaN);
  assert.deepEqual(cs.map((c) => [c.x, c.y]), before);
  cs[0]!.alive = false;
  const frozen = [cs[0]!.x, cs[0]!.y];
  stepCrystals(cs, 1);
  assert.deepEqual([cs[0]!.x, cs[0]!.y], frozen);
});

test("hitCrystal: a helyes kristály helyes, a rossz rossz; egy kristályra csak az első találat számít (multitouch)", () => {
  const cs = spawnCrystals(pres(4, 2), bounds(), createRng(5).next);
  const good = hitCrystal(cs, cs[2]!.id);
  assert.ok(good && good.correct && good.crystal.optionIndex === 2);
  assert.equal(hitCrystal(cs, cs[2]!.id), null, "ugyanarra a kristályra a második találat nem számít");
  const bad = hitCrystal(cs, cs[0]!.id);
  assert.ok(bad && !bad.correct && bad.crystal.optionIndex === 0);
  assert.equal(hitCrystal(cs, 99999), null, "ismeretlen azonosító");
  assert.deepEqual(cs.map((c) => c.alive), [false, true, false, true]);
});

test("crystalAt: a találati gömb a látványnál nagyobb (+20%), a legközelebbi élő kristályt adja, a halottat nem", () => {
  const cs = spawnCrystals(pres(3), bounds(), createRng(9).next);
  const c = cs[1]!;
  assert.equal(crystalAt(cs, c.x, c.y)?.id, c.id);
  // a látvány sugarán KÍVÜL, de a megnagyobbított gömbön belül: találat
  const justOutsideVisual = CRYSTAL_RADIUS * 1.1;
  assert.equal(crystalAt(cs, c.x + justOutsideVisual, c.y, 0)?.id, c.id);
  assert.equal(crystalAt(cs, c.x + CRYSTAL_RADIUS * CRYSTAL_HIT_FACTOR + 0.2, c.y, 0), null);
  c.alive = false;
  assert.equal(crystalAt(cs, c.x, c.y), null);
});

test("hasadás: a rossz kristályból 3 apró (1-es) szikla hasad, szétnyílva, a hajó felé hullva; seedelt", () => {
  const shards = crystalShards({ x: 2, y: 4 }, createRng(21).next);
  assert.equal(shards.length, CRYSTAL_SHARD_COUNT);
  assert.equal(CRYSTAL_SHARD_COUNT, 3);
  for (const s of shards) {
    assert.equal(s.size, 1);
    assert.ok(s.vy >= CRYSTAL_SHARD_VY_MIN && s.vy <= CRYSTAL_SHARD_VY_MAX, `vy ${s.vy}`);
    assert.ok(s.vy < 0, "a hajó felé hullik");
    assert.ok(Math.abs(s.y - 4) < 1);
  }
  // szétnyílnak: a bal és a jobb szélső ellentétes irányba repül
  assert.ok(shards[0]!.vx < shards[2]!.vx);
  assert.ok(shards[0]!.x < shards[1]!.x && shards[1]!.x < shards[2]!.x);
  assert.deepEqual(shards, crystalShards({ x: 2, y: 4 }, createRng(21).next));
});

test("rezoneCrystals: a zóna változásakor a kristályok az új zónába húzódnak (nem ugranak), és közben sem fedik egymást", () => {
  const cs = spawnCrystals(pres(4), bounds(), createRng(4).next, DRIFT);
  const before = cs.map((c) => c.homeY);
  // a kártya megnőtt: a zóna lejjebb csúszik
  const lower = crystalBounds({ halfWidth: 8.9, minY: -0.5, maxY: 3.6 });
  rezoneCrystals(cs, lower, 0.3, DRIFT);
  assert.ok(cs.every((c, i) => c.homeY < before[i]!), "egy lépésben elindul lefelé");
  assert.ok(cs.every((c) => c.homeY > lower.minY - 0.01), "de nem ugrik át a célon");
  for (let k = 0; k < 40; k++) {
    rezoneCrystals(cs, lower, 0.3, DRIFT);
    stepCrystals(cs, 1 / 60);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) assert.ok(Math.hypot(cs[i]!.x - cs[j]!.x, cs[i]!.y - cs[j]!.y) >= CRYSTAL_RADIUS * 2);
  }
  for (const c of cs) {
    assert.ok(c.y >= lower.minY - 1e-6 && c.y <= lower.maxY + 1e-6, `kiesett az új zónából: ${c.y}`);
    assert.ok(c.x >= lower.minX - 1e-6 && c.x <= lower.maxX + 1e-6);
  }
  // ease = 1: azonnal átrendez; egy kristálynál nincs mit
  rezoneCrystals(cs, bounds(), 1, DRIFT);
  assert.ok(cs.every((c) => c.homeY >= bounds().minY - 1e-9 && c.homeY <= bounds().maxY + 1e-9));
  rezoneCrystals([cs[0]!], bounds(), 1, DRIFT);
});

test("alapértelmezésben a válaszcél ÁLL (a lebegés a nézeté): hosszú lépésnél sem mozdul, és a lebegő változat tényleg mozog (a modul mindkettőt kezeli)", () => {
  const still = spawnCrystals(pres(4), bounds(), createRng(8).next);
  const start = still.map((c) => [c.x, c.y]);
  for (let i = 0; i < 600; i++) stepCrystals(still, 1 / 60);
  assert.deepEqual(still.map((c) => [c.x, c.y]), start, "az álló célpont elmozdult");
  const moving = spawnCrystals(pres(4), bounds(), createRng(8).next, DRIFT);
  const m0 = moving.map((c) => [c.x, c.y]);
  for (let i = 0; i < 120; i++) stepCrystals(moving, 1 / 60);
  assert.notDeepEqual(moving.map((c) => [c.x, c.y]), m0, "a lebegő célpont nem mozdul");
});
