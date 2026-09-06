import assert from "node:assert/strict";
import test from "node:test";

import {
  initialWind,
  advanceWind,
  windSpeedAt,
  compassFor,
  bearingBetween,
  COMPASS_POINTS,
} from "../client/src/lib/tornado/wind";
import {
  anchorOutcome,
  interceptReward,
  ANCHOR_QUIZ_PENALTY,
} from "../client/src/lib/tornado/scoring";
import { levelSpec } from "../client/src/lib/tornado/levels";
import { makeRng } from "../client/src/lib/tornado/questions";

/**
 * Tornado Hunter 200 — wind model and scoring.
 *
 * The HUD's km/h number is the game's core feedback signal, so its two promised
 * properties are pinned: it rises as the driver closes in, and the session
 * maximum never goes backwards.
 */

test("a szél a tornádóhoz közeledve nő, távolodva csökken", () => {
  const spec = levelSpec(120);
  let prev = -Infinity;
  // Csökkenő távolság → szigorúan növekvő szélsebesség.
  for (const km of [6, 5, 4, 3, 2, 1.5, 1, 0.6, 0.3, 0.1]) {
    const v = windSpeedAt(km, spec.windPeak);
    assert.ok(v > prev, `${km} km-nél nem nőtt a szél (${v} vs ${prev})`);
    prev = v;
  }
  assert.ok(
    windSpeedAt(6, spec.windPeak) > windSpeedAt(9, spec.windPeak),
    "távolodva csökken",
  );
  assert.ok(windSpeedAt(0.05, spec.windPeak) <= spec.windPeak, "nem lépi túl a szint csúcsát");
  assert.ok(windSpeedAt(12, spec.windPeak) >= 0, "távol sem negatív");
});

test("a maximum szélsebesség a futás legnagyobb mért értéke marad", () => {
  const spec = levelSpec(80);
  const rng = makeRng(4);
  let w = initialWind(spec);
  const seen: number[] = [];
  // Beközelít, majd elhagyja a tornádót.
  for (const km of [8, 6, 4, 2, 0.8, 0.4, 1.5, 4, 9]) {
    w = advanceWind(w, { distanceKm: km, peak: spec.windPeak, tornadoIntensity: spec.tornadoIntensity, dt: 0.5, bearingDeg: 45, rng });
    seen.push(w.currentWindSpeed);
    assert.ok(w.maximumWindSpeed >= w.currentWindSpeed);
  }
  assert.equal(w.maximumWindSpeed, Math.max(...seen.map((x) => Math.round(x))) || w.maximumWindSpeed);
  const dropped = advanceWind(w, { distanceKm: 20, peak: spec.windPeak, tornadoIntensity: spec.tornadoIntensity, dt: 1, bearingDeg: 0, rng });
  assert.ok(dropped.currentWindSpeed < w.maximumWindSpeed, "a pillanatnyi szél lecsökken");
  assert.equal(dropped.maximumWindSpeed, w.maximumWindSpeed, "a maximum nem csökken");
});

test("a széllökés sosem kisebb a pillanatnyi szélnél", () => {
  const spec = levelSpec(160);
  const rng = makeRng(21);
  let w = initialWind(spec);
  for (let i = 0; i < 100; i++) {
    w = advanceWind(w, { distanceKm: 0.5 + (i % 7), peak: spec.windPeak, tornadoIntensity: spec.tornadoIntensity, dt: 0.25, bearingDeg: i * 7, rng });
    assert.ok(w.windGusts >= w.currentWindSpeed, `lökés (${w.windGusts}) < szél (${w.currentWindSpeed})`);
    assert.ok(w.currentWindSpeed >= 0);
    assert.ok(w.windDirection >= 0 && w.windDirection < 360);
  }
});

test("az égtáj-leképezés a 8 fő irányt adja, nyíllal", () => {
  assert.equal(COMPASS_POINTS.length, 8);
  assert.equal(compassFor(0).label, "N");
  assert.equal(compassFor(45).label, "NE");
  assert.equal(compassFor(90).label, "E");
  assert.equal(compassFor(180).label, "S");
  assert.equal(compassFor(270).label, "W");
  assert.equal(compassFor(359).label, "N", "körbeér");
  assert.equal(compassFor(45).arrow, "↗");
  for (let d = 0; d < 360; d += 3) {
    const c = compassFor(d);
    assert.ok(c.arrow.length > 0 && c.label.length > 0, `${d}° nincs leképezve`);
  }
});

test("bearingBetween a világ-koordinátákból fokot ad 0..360 között", () => {
  assert.equal(Math.round(bearingBetween(0, 0, 0, -10)), 0, "észak");
  assert.equal(Math.round(bearingBetween(0, 0, 10, 0)), 90, "kelet");
  assert.equal(Math.round(bearingBetween(0, 0, 0, 10)), 180, "dél");
  assert.equal(Math.round(bearingBetween(0, 0, -10, 0)), 270, "nyugat");
});

test("a horgonyzás csak a sávon belül és helyes válasszal sikerül", () => {
  const spec = levelSpec(50);
  const inBand = (spec.anchorBand.min + spec.anchorBand.max) / 2;

  const good = anchorOutcome({ distanceKm: inBand, spec, answerCorrect: true, surfaceGrip: 1 });
  assert.equal(good.ok, true);

  const wrongAnswer = anchorOutcome({ distanceKm: inBand, spec, answerCorrect: false, surfaceGrip: 1 });
  assert.equal(wrongAnswer.ok, false);
  assert.equal(wrongAnswer.reason, "wrong_answer");
  assert.equal(wrongAnswer.retryAllowed, true, "hibás válasz után újra lehet próbálni");

  const tooClose = anchorOutcome({ distanceKm: spec.anchorBand.min / 2, spec, answerCorrect: true, surfaceGrip: 1 });
  assert.equal(tooClose.ok, false);
  assert.equal(tooClose.reason, "too_close");

  const tooFar = anchorOutcome({ distanceKm: spec.anchorBand.max * 2, spec, answerCorrect: true, surfaceGrip: 1 });
  assert.equal(tooFar.ok, false);
  assert.equal(tooFar.reason, "too_far");

  const slippery = anchorOutcome({ distanceKm: inBand, spec, answerCorrect: true, surfaceGrip: 0.2 });
  assert.equal(slippery.ok, false);
  assert.equal(slippery.reason, "bad_ground");
});

test("a pontszám és a Storm Coin külön rendszer, mindkettő pozitív sikeres interceptnél", () => {
  const spec = levelSpec(90);
  const r = interceptReward({
    spec,
    secondsUsed: 60,
    anchorAttempts: 1,
    peakWind: 260,
    distanceKm: (spec.anchorBand.min + spec.anchorBand.max) / 2,
    correctAnswers: 3,
    wrongAnswers: 0,
  });
  assert.ok(r.score > 0);
  assert.ok(r.coins > 0);
  assert.notEqual(r.score, r.coins, "a két rendszer nem ugyanaz a szám");
  assert.equal(
    r.breakdown.base + r.breakdown.speedBonus + r.breakdown.stormBonus + r.breakdown.answerBonus + r.breakdown.positionBonus,
    r.score,
  );
});

test("a gyorsabb teljesítés, erősebb vihar és jobb pozíció többet ér", () => {
  const spec = levelSpec(140);
  const mid = (spec.anchorBand.min + spec.anchorBand.max) / 2;
  const base = { spec, anchorAttempts: 1, correctAnswers: 2, wrongAnswers: 0, distanceKm: mid, peakWind: 300, secondsUsed: 120 };

  assert.ok(interceptReward({ ...base, secondsUsed: 40 }).score > interceptReward({ ...base, secondsUsed: 200 }).score);
  assert.ok(interceptReward({ ...base, peakWind: 420 }).score > interceptReward({ ...base, peakWind: 180 }).score);
  assert.ok(
    interceptReward({ ...base, distanceKm: spec.anchorBand.min * 1.02 }).score >
      interceptReward({ ...base, distanceKm: spec.anchorBand.max * 0.98 }).score,
    "a kockázatosabb (közelebbi) pozíció többet ér",
  );
});

test("a hibás válasz csökkenti a jutalmat, de nem viszi nullára", () => {
  const spec = levelSpec(30);
  const mid = (spec.anchorBand.min + spec.anchorBand.max) / 2;
  const clean = interceptReward({ spec, secondsUsed: 50, anchorAttempts: 1, peakWind: 200, distanceKm: mid, correctAnswers: 2, wrongAnswers: 0 });
  const messy = interceptReward({ spec, secondsUsed: 50, anchorAttempts: 4, peakWind: 200, distanceKm: mid, correctAnswers: 2, wrongAnswers: 3 });
  assert.ok(messy.score < clean.score);
  assert.ok(messy.score > 0, "a kitartást is jutalmazzuk");
  assert.ok(messy.coins > 0);
  assert.ok(ANCHOR_QUIZ_PENALTY > 0 && ANCHOR_QUIZ_PENALTY < 1);
});

test("magasabb szint = nagyobb alapjutalom", () => {
  const args = (level: number) => {
    const spec = levelSpec(level);
    return {
      spec,
      secondsUsed: 60,
      anchorAttempts: 1,
      peakWind: 250,
      distanceKm: (spec.anchorBand.min + spec.anchorBand.max) / 2,
      correctAnswers: 2,
      wrongAnswers: 0,
    };
  };
  assert.ok(interceptReward(args(200)).coins > interceptReward(args(100)).coins);
  assert.ok(interceptReward(args(100)).coins > interceptReward(args(1)).coins);
});
