import assert from "node:assert/strict";
import test from "node:test";

import {
  LADDER_RUNGS,
  LADDER_EASY,
  LADDER_MED,
  LADDER_HARD,
  LADDER_ZONES,
  zoneForRung,
  milestoneFor,
  xpForCorrect,
  nextRung,
  streakMessage,
  encouragement,
  confettiParticles,
} from "../client/src/lib/wordLadderLogic";

test("a fokok nehézségi felosztása kiadja a létra hosszát", () => {
  assert.equal(LADDER_EASY + LADDER_MED + LADDER_HARD, LADDER_RUNGS);
  assert.ok(LADDER_RUNGS >= 10 && LADDER_RUNGS <= 20, "gyereknek való hossz");
});

test("zónák: növekvő kezdőfok, az első 0-tól, mind a létrán belül", () => {
  assert.equal(LADDER_ZONES[0]!.from, 0);
  for (let i = 1; i < LADDER_ZONES.length; i++) {
    assert.ok(LADDER_ZONES[i]!.from > LADDER_ZONES[i - 1]!.from);
    assert.ok(LADDER_ZONES[i]!.from < LADDER_RUNGS);
  }
});

test("zoneForRung: a fok a megfelelő zónába esik", () => {
  assert.equal(zoneForRung(0).id, "meadow");
  assert.equal(zoneForRung(4).id, "meadow");
  assert.equal(zoneForRung(5).id, "forest");
  assert.equal(zoneForRung(10).id, "clouds");
  assert.equal(zoneForRung(15).id, "stars");
  assert.equal(zoneForRung(LADDER_RUNGS).id, "stars");
});

test("milestoneFor: csak felfelé, zónaváltáskor ad feliratot", () => {
  assert.equal(milestoneFor(4, 5), "🌲 Elérted az erdőt!");
  assert.equal(milestoneFor(9, 10), "☁️ Fel a felhők közé!");
  assert.equal(milestoneFor(14, 15), "⭐ Csillagok között — mindjárt fent vagy!");
  assert.equal(milestoneFor(5, 6), null, "zónán belül nincs");
  assert.equal(milestoneFor(5, 4), null, "lefelé nincs");
  assert.equal(milestoneFor(0, 1), null, "az első zónának nincs mérföldköve");
});

test("xpForCorrect: a meglévő képlet (30 + 2·sorozat) változatlan", () => {
  assert.equal(xpForCorrect(0), 30);
  assert.equal(xpForCorrect(4), 38);
  assert.equal(xpForCorrect(-3), 30);
});

test("nextRung: fel +1 a célig, le −1 a 0-ig", () => {
  assert.equal(nextRung(0, true), 1);
  assert.equal(nextRung(0, false), 0, "0-ról nem lehet lecsúszni");
  assert.equal(nextRung(LADDER_RUNGS - 1, true), LADDER_RUNGS);
  assert.equal(nextRung(LADDER_RUNGS, true), LADDER_RUNGS);
  assert.equal(nextRung(7, false), 6);
});

test("streakMessage: 3-nál és 5-ösöknél", () => {
  assert.equal(streakMessage(2), null);
  assert.match(streakMessage(3)!, /3-as/);
  assert.equal(streakMessage(4), null);
  assert.match(streakMessage(5)!, /5-ös/);
  assert.match(streakMessage(10)!, /10-ös/);
});

test("encouragement: determinisztikus választás, 0. fokon külön üzenet", () => {
  assert.match(encouragement(true, 3, 0), /Szuper/);
  assert.match(encouragement(true, 3, 0.99), /Pontosan/);
  assert.match(encouragement(false, 3, 0), /zöld/i);
  assert.match(encouragement(false, 0, 0.5), /nem estél le/);
});

test("confettiParticles: determinisztikus, tartományon belül", () => {
  const a = confettiParticles(40);
  const b = confettiParticles(40);
  assert.deepEqual(a, b);
  assert.equal(a.length, 40);
  for (const p of a) {
    assert.ok(p.left >= 0 && p.left <= 100);
    assert.ok(p.delay >= 0 && p.delay <= 1.2);
    assert.ok(p.hue >= 0 && p.hue <= 360);
    assert.ok(p.size >= 6 && p.size <= 14);
  }
});
