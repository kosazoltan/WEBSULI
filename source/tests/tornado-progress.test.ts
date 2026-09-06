import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultProgress,
  buyVehicle,
  selectVehicle,
  buyUpgrade,
  completeLevel,
  recordAnswer,
  parseProgress,
  serializeProgress,
  addDistance,
  PROGRESS_VERSION,
} from "../client/src/lib/tornado/progress";
import { UPGRADE_TRACKS, upgradeCost, upgradeEffect, MAX_UPGRADE_LEVEL } from "../client/src/lib/tornado/upgrades";
import { VEHICLES, STARTER_VEHICLE_ID, vehicleById } from "../client/src/lib/tornado/vehicles";
import { levelSpec } from "../client/src/lib/tornado/levels";

/**
 * Tornado Hunter 200 — save state.
 *
 * Storm Coin and Highscore are two separate systems by the brief; the reducer
 * keeps them apart, refuses purchases without funds, and survives a corrupted
 * localStorage payload instead of throwing on mount.
 */

test("az induló állapot: kezdőjármű, nulla SC-nél nem kevesebb, 1. szint elérhető", () => {
  const p = defaultProgress();
  assert.equal(p.version, PROGRESS_VERSION);
  assert.deepEqual(p.ownedVehicleIds, [STARTER_VEHICLE_ID]);
  assert.equal(p.selectedVehicleId, STARTER_VEHICLE_ID);
  assert.ok(p.coins >= 0);
  assert.equal(p.highestLevelUnlocked, 1);
  assert.equal(p.totalScore, 0);
  assert.equal(p.stats.levelsCompleted, 0);
});

test("vásárlás fedezettel: levonja az árat és birtokba adja a járművet", () => {
  const target = VEHICLES.find((v) => v.id !== STARTER_VEHICLE_ID && v.unlockLevel === 1)!;
  const start = { ...defaultProgress(), coins: target.price + 100, highestLevelUnlocked: 200 };
  const res = buyVehicle(start, target.id);
  assert.equal(res.ok, true);
  assert.equal(res.progress.coins, 100);
  assert.ok(res.progress.ownedVehicleIds.includes(target.id));
  assert.equal(start.coins, target.price + 100, "az eredeti állapot nem mutálódik");
});

test("fedezet nélkül a vásárlás elutasít, az egyenleg változatlan", () => {
  const target = VEHICLES.find((v) => v.price > 1000)!;
  const start = { ...defaultProgress(), coins: target.price - 1, highestLevelUnlocked: 200 };
  const res = buyVehicle(start, target.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "insufficient_funds");
  assert.equal(res.progress.coins, target.price - 1);
  assert.equal(res.progress.ownedVehicleIds.includes(target.id), false);
});

test("zárolt (magasabb szintű) jármű nem vehető meg", () => {
  const target = VEHICLES.find((v) => v.unlockLevel > 50)!;
  const start = { ...defaultProgress(), coins: 999_999, highestLevelUnlocked: 5 };
  const res = buyVehicle(start, target.id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "locked");
  assert.equal(res.progress.coins, 999_999);
});

test("ismeretlen azonosító és dupla vásárlás kezelve", () => {
  const start = { ...defaultProgress(), coins: 999_999, highestLevelUnlocked: 200 };
  assert.equal(buyVehicle(start, "nincs-ilyen").reason, "unknown_vehicle");
  const owned = buyVehicle(start, VEHICLES[3]!.id).progress;
  const again = buyVehicle(owned, VEHICLES[3]!.id);
  assert.equal(again.ok, false);
  assert.equal(again.reason, "already_owned");
  assert.equal(again.progress.coins, owned.coins);
});

test("csak birtokolt jármű választható ki", () => {
  const start = defaultProgress();
  const notOwned = VEHICLES.find((v) => v.id !== STARTER_VEHICLE_ID)!;
  assert.equal(selectVehicle(start, notOwned.id).ok, false);
  assert.equal(selectVehicle(start, STARTER_VEHICLE_ID).ok, true);
});

test("a 6 fejlesztési sáv a leírás szerinti, az ár szintenként nő", () => {
  assert.equal(UPGRADE_TRACKS.length, 6);
  assert.deepEqual(
    UPGRADE_TRACKS.map((t) => t.id).sort(),
    ["anchor", "chassis", "engine", "instruments", "suspension", "tires"],
  );
  for (const track of UPGRADE_TRACKS) {
    for (let lvl = 1; lvl < MAX_UPGRADE_LEVEL; lvl++) {
      assert.ok(upgradeCost(track.id, lvl + 1) > upgradeCost(track.id, lvl), `${track.id}: az ár nem nő`);
      assert.ok(upgradeEffect(track.id, lvl + 1) > upgradeEffect(track.id, lvl), `${track.id}: a hatás nem nő`);
    }
    assert.equal(upgradeEffect(track.id, 0), 0, `${track.id}: alapszinten nincs bónusz`);
  }
});

test("fejlesztés vásárlása: levon, szintet lép, maximumon megáll", () => {
  let p = { ...defaultProgress(), coins: 5_000_000 };
  for (let i = 1; i <= MAX_UPGRADE_LEVEL; i++) {
    const res = buyUpgrade(p, STARTER_VEHICLE_ID, "engine");
    assert.equal(res.ok, true, `${i}. szintű motorfejlesztés`);
    assert.ok(res.progress.coins < p.coins, "az ár levonódott");
    p = res.progress;
  }
  assert.equal(p.upgrades[STARTER_VEHICLE_ID]!.engine, MAX_UPGRADE_LEVEL);
  const over = buyUpgrade(p, STARTER_VEHICLE_ID, "engine");
  assert.equal(over.ok, false);
  assert.equal(over.reason, "max_level");
  assert.equal(over.progress.coins, p.coins);
});

test("fejlesztés fedezet nélkül elutasít", () => {
  const p = { ...defaultProgress(), coins: 0 };
  const res = buyUpgrade(p, STARTER_VEHICLE_ID, "anchor");
  assert.equal(res.ok, false);
  assert.equal(res.reason, "insufficient_funds");
});

test("szint teljesítése: SC és pont KÜLÖN nő, a következő szint feloldódik", () => {
  const start = defaultProgress();
  const spec = levelSpec(1);
  const after = completeLevel(start, {
    level: 1,
    score: 1234,
    coins: 500,
    secondsUsed: 42,
    peakWind: 214,
    anchored: true,
  });
  assert.equal(after.coins, start.coins + 500);
  assert.equal(after.totalScore, start.totalScore + 1234);
  assert.equal(after.highestLevelUnlocked, 2);
  assert.equal(after.stats.levelsCompleted, 1);
  assert.equal(after.stats.tornadoesIntercepted, 1);
  assert.equal(after.stats.successfulAnchors, 1);
  assert.equal(after.stats.maxWindSpeed, 214);
  assert.equal(after.levelRecords["1"]!.score, 1234);
  assert.equal(after.levelRecords["1"]!.bestTime, 42);
  void spec;
});

test("a szintrekord csak javulásra íródik felül", () => {
  let p = completeLevel(defaultProgress(), { level: 1, score: 900, coins: 100, secondsUsed: 80, peakWind: 100, anchored: true });
  p = completeLevel(p, { level: 1, score: 500, coins: 100, secondsUsed: 30, peakWind: 90, anchored: true });
  assert.equal(p.levelRecords["1"]!.score, 900, "gyengébb pont nem írja felül");
  assert.equal(p.levelRecords["1"]!.bestTime, 30, "gyorsabb idő igen");
  assert.equal(p.totalScore, 1400, "az összpontszám mindkét futásból gyűlik");
});

test("a szint feloldás nem lép vissza korábbi szint újrajátszásakor", () => {
  let p = defaultProgress();
  for (let n = 1; n <= 5; n++) {
    p = completeLevel(p, { level: n, score: 10, coins: 10, secondsUsed: 20, peakWind: 100, anchored: true });
  }
  assert.equal(p.highestLevelUnlocked, 6);
  p = completeLevel(p, { level: 2, score: 10, coins: 10, secondsUsed: 20, peakWind: 100, anchored: true });
  assert.equal(p.highestLevelUnlocked, 6, "a régi szint újrajátszása nem csökkenti a haladást");
});

test("a 200. szint teljesítése nem lép 200 fölé", () => {
  const p = completeLevel({ ...defaultProgress(), highestLevelUnlocked: 200 }, {
    level: 200,
    score: 1,
    coins: 1,
    secondsUsed: 1,
    peakWind: 500,
    anchored: true,
  });
  assert.equal(p.highestLevelUnlocked, 200);
});

test("a válaszok statisztikája külön gyűlik", () => {
  let p = defaultProgress();
  p = recordAnswer(p, true);
  p = recordAnswer(p, true);
  p = recordAnswer(p, false);
  assert.equal(p.stats.correctAnswers, 2);
  assert.equal(p.stats.wrongAnswers, 1);
});

test("a megtett kilométer akkumulálódik, negatív érték nem rontja el", () => {
  let p = addDistance(defaultProgress(), 1.5);
  p = addDistance(p, 2.25);
  assert.ok(Math.abs(p.stats.kilometersTraveled - 3.75) < 1e-9);
  p = addDistance(p, -100);
  assert.ok(Math.abs(p.stats.kilometersTraveled - 3.75) < 1e-9, "negatív távolság figyelmen kívül");
});

test("a mentés körbejár: serialize → parse ugyanazt adja", () => {
  let p = defaultProgress();
  p = completeLevel(p, { level: 1, score: 777, coins: 250, secondsUsed: 33, peakWind: 180, anchored: true });
  p = buyUpgrade({ ...p, coins: 100000 }, STARTER_VEHICLE_ID, "tires").progress;
  const round = parseProgress(serializeProgress(p));
  assert.deepEqual(round, p);
});

test("korrupt vagy régi mentés esetén alapállapotra esik vissza (nem dob)", () => {
  assert.deepEqual(parseProgress(null), defaultProgress());
  assert.deepEqual(parseProgress("{nem json"), defaultProgress());
  assert.deepEqual(parseProgress("[]"), defaultProgress());
  assert.deepEqual(parseProgress(JSON.stringify({ version: 0, coins: 5 })), defaultProgress());

  const partial = parseProgress(JSON.stringify({ version: PROGRESS_VERSION, coins: "sok", ownedVehicleIds: "nem tömb" }));
  assert.equal(partial.coins, defaultProgress().coins, "hibás típusú mező alapértékre esik");
  assert.deepEqual(partial.ownedVehicleIds, [STARTER_VEHICLE_ID]);

  const unknownVehicle = parseProgress(
    JSON.stringify({ ...defaultProgress(), ownedVehicleIds: [STARTER_VEHICLE_ID, "kitalált"], selectedVehicleId: "kitalált" }),
  );
  assert.deepEqual(unknownVehicle.ownedVehicleIds, [STARTER_VEHICLE_ID], "ismeretlen jármű kiszűrve");
  assert.equal(unknownVehicle.selectedVehicleId, STARTER_VEHICLE_ID);
  assert.ok(vehicleById(unknownVehicle.selectedVehicleId));
});
