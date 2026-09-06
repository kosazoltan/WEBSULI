import assert from "node:assert/strict";
import test from "node:test";

import {
  LEVELS,
  LEVEL_COUNT,
  LEVEL_STAGES,
  stageForLevel,
  levelSpec,
  ULTIMATE_LEVEL,
} from "../client/src/lib/tornado/levels";

/**
 * Tornado Hunter 200 — level ladder invariants.
 *
 * The brief fixes the stage boundaries (1-25 Light Storm … 200 THE ULTIMATE
 * STORM) and demands that level 200 be the hardest. Both are asserted from the
 * data, so a hand-edited table cannot drift.
 */

test("pontosan 200 szint van, hézag és duplikátum nélkül", () => {
  assert.equal(LEVEL_COUNT, 200);
  assert.equal(LEVELS.length, 200);
  LEVELS.forEach((l, i) => assert.equal(l.level, i + 1));
});

test("a szakaszhatárok a leírás szerintiek", () => {
  const expected: [string, number, number][] = [
    ["light", 1, 25],
    ["beginner", 26, 50],
    ["advanced", 51, 75],
    ["pro", 76, 100],
    ["expert", 101, 125],
    ["master", 126, 150],
    ["extreme", 151, 175],
    ["legendary", 176, 199],
    ["ultimate", 200, 200],
  ];
  assert.equal(LEVEL_STAGES.length, expected.length);
  expected.forEach(([id, from, to], i) => {
    const stage = LEVEL_STAGES[i]!;
    assert.equal(stage.id, id);
    assert.equal(stage.from, from, `${id} kezdete`);
    assert.equal(stage.to, to, `${id} vége`);
  });
  // A határok folytonosak és lefedik az 1..200 tartományt.
  for (let i = 1; i < LEVEL_STAGES.length; i++) {
    assert.equal(LEVEL_STAGES[i]!.from, LEVEL_STAGES[i - 1]!.to + 1);
  }
});

test("stageForLevel a határokon is a helyes szakaszt adja", () => {
  assert.equal(stageForLevel(1).id, "light");
  assert.equal(stageForLevel(25).id, "light");
  assert.equal(stageForLevel(26).id, "beginner");
  assert.equal(stageForLevel(100).id, "pro");
  assert.equal(stageForLevel(101).id, "expert");
  assert.equal(stageForLevel(175).id, "extreme");
  assert.equal(stageForLevel(176).id, "legendary");
  assert.equal(stageForLevel(199).id, "legendary");
  assert.equal(stageForLevel(200).id, "ultimate");
});

test("a nehézség monoton nem csökken, a jutalom nő", () => {
  for (let n = 2; n <= 200; n++) {
    const prev = levelSpec(n - 1);
    const cur = levelSpec(n);
    assert.ok(cur.tornadoIntensity >= prev.tornadoIntensity, `intenzitás esik: ${n}`);
    assert.ok(cur.windPeak >= prev.windPeak, `szélcsúcs esik: ${n}`);
    assert.ok(cur.coinReward >= prev.coinReward, `SC-jutalom esik: ${n}`);
    assert.ok(cur.scoreBase >= prev.scoreBase, `pontalap esik: ${n}`);
  }
});

test("a 200. szint a legnehezebb minden mutatóban", () => {
  const ultimate = levelSpec(ULTIMATE_LEVEL);
  assert.equal(ULTIMATE_LEVEL, 200);
  assert.equal(ultimate.stage, "ultimate");
  for (const l of LEVELS) {
    if (l.level === 200) continue;
    assert.ok(l.tornadoIntensity < ultimate.tornadoIntensity, `${l.level} intenzitása nem kisebb`);
    assert.ok(l.windPeak < ultimate.windPeak, `${l.level} szélcsúcsa nem kisebb`);
  }
  assert.ok(ultimate.windPeak >= 480, "az ultimate vihar EF5 feletti szélcsúcsot ad");
});

test("minden szint játszható paramétereket ad", () => {
  for (const l of LEVELS) {
    assert.ok(l.timeLimit >= 60 && l.timeLimit <= 600, `${l.level}: időkeret`);
    assert.ok(l.anchorBand.min > 0 && l.anchorBand.max > l.anchorBand.min, `${l.level}: horgonysáv`);
    assert.ok(l.tornadoScale > 0 && l.tornadoSpeed > 0, `${l.level}: tornádó paraméterek`);
    assert.ok(l.tornadoIntensity >= 1 && l.tornadoIntensity <= 10, `${l.level}: intenzitás 1..10`);
    assert.ok(l.debrisDensity >= 0 && l.rainIntensity >= 0 && l.lightningRate >= 0);
  }
});

test("a horgonysáv szűkül, ahogy nő a nehézség", () => {
  const width = (n: number) => {
    const b = levelSpec(n).anchorBand;
    return b.max - b.min;
  };
  assert.ok(width(1) > width(100));
  assert.ok(width(100) > width(200));
});
