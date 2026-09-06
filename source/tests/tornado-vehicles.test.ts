import assert from "node:assert/strict";
import test from "node:test";

import {
  VEHICLES,
  VEHICLE_COUNT,
  RARITY_PRICE_RANGE,
  VEHICLE_CATEGORIES,
  RARITY_ORDER,
  NAMED_VEHICLE_PRICES,
  vehicleById,
  vehiclesByCategory,
  STARTER_VEHICLE_ID,
  type Rarity,
} from "../client/src/lib/tornado/vehicles";

/**
 * Tornado Hunter 200 — vehicle catalogue invariants.
 *
 * The owner's brief fixes three things that a generator can silently break:
 * the total (160), the rarity price bands, and the twelve named vehicles with
 * their exact prices. Each is asserted here so a future tweak to the generator
 * cannot quietly drift away from the brief.
 */

test("pontosan 160 jármű van, egyedi azonosítóval és névvel", () => {
  assert.equal(VEHICLE_COUNT, 160);
  assert.equal(VEHICLES.length, 160);

  const ids = new Set(VEHICLES.map((v) => v.id));
  const names = new Set(VEHICLES.map((v) => v.name));
  assert.equal(ids.size, 160, "minden azonosító egyedi");
  assert.equal(names.size, 160, "minden név egyedi");
});

test("mind az 5 kategória legalább 10 járművet kap", () => {
  assert.equal(VEHICLE_CATEGORIES.length, 5);
  for (const cat of VEHICLE_CATEGORIES) {
    const list = vehiclesByCategory(cat.id);
    assert.ok(list.length >= 10, `${cat.id}: ${list.length} jármű (>=10 kell)`);
    assert.ok(
      list.every((v) => v.category === cat.id),
      `${cat.id}: a szűrő csak saját kategóriát ad`,
    );
  }
  const sum = VEHICLE_CATEGORIES.reduce((n, c) => n + vehiclesByCategory(c.id).length, 0);
  assert.equal(sum, 160, "a kategóriák lefedik a teljes flottát");
});

test("minden ár a ritkasági sávján belül van", () => {
  for (const v of VEHICLES) {
    const [lo, hi] = RARITY_PRICE_RANGE[v.rarity];
    assert.ok(
      v.price >= lo && v.price <= hi,
      `${v.name} (${v.rarity}): ${v.price} SC nincs a ${lo}–${hi} sávban`,
    );
  }
});

test("a leírás 12 nevesített járműve pontosan a megadott áron van", () => {
  for (const [name, price] of Object.entries(NAMED_VEHICLE_PRICES)) {
    const v = VEHICLES.find((x) => x.name === name);
    assert.ok(v, `hiányzik a nevesített jármű: ${name}`);
    assert.equal(v.price, price, `${name} ára`);
  }
  assert.ok(NAMED_VEHICLE_PRICES["TIV 2"] === 15000);
  assert.ok(NAMED_VEHICLE_PRICES["Dominator 3"] === 25000);
  assert.equal(Object.keys(NAMED_VEHICLE_PRICES).length, 12);
});

test("minden ritkasági fokozat képviselve van, és a sávok nem fedik egymást felfelé", () => {
  const present = new Set(VEHICLES.map((v) => v.rarity));
  for (const r of RARITY_ORDER) {
    assert.ok(present.has(r), `nincs ${r} jármű`);
  }
  for (let i = 1; i < RARITY_ORDER.length; i++) {
    const prev = RARITY_PRICE_RANGE[RARITY_ORDER[i - 1] as Rarity];
    const cur = RARITY_PRICE_RANGE[RARITY_ORDER[i] as Rarity];
    assert.ok(cur[0] >= prev[1], `${RARITY_ORDER[i]} alsó határa nem lehet a előző sáv alatt`);
    assert.ok(cur[1] > cur[0]);
  }
});

test("feloldási szint 1..200 között, a kezdőjármű 1. szinten ingyen elérhető", () => {
  for (const v of VEHICLES) {
    assert.ok(
      Number.isInteger(v.unlockLevel) && v.unlockLevel >= 1 && v.unlockLevel <= 200,
      `${v.name}: feloldási szint ${v.unlockLevel}`,
    );
  }
  const starter = vehicleById(STARTER_VEHICLE_ID);
  assert.ok(starter, "a kezdőjármű létezik");
  assert.equal(starter.unlockLevel, 1);
  assert.ok(starter.price <= 2500, "a kezdőjármű Common sávban van");
});

test("drágább ritkaság = magasabb átlagos feloldási szint (haladás-ív)", () => {
  const avgUnlock = (r: Rarity) => {
    const list = VEHICLES.filter((v) => v.rarity === r);
    return list.reduce((n, v) => n + v.unlockLevel, 0) / list.length;
  };
  assert.ok(avgUnlock("common") < avgUnlock("rare"));
  assert.ok(avgUnlock("rare") < avgUnlock("legendary"));
  assert.ok(avgUnlock("legendary") <= avgUnlock("ultimate"));
});

test("minden jármű teljes statkészletet kap, értelmes tartományban", () => {
  for (const v of VEHICLES) {
    for (const key of [
      "speed",
      "acceleration",
      "handling",
      "braking",
      "mass",
      "stability",
      "windResistance",
      "anchorPower",
    ] as const) {
      const value = v[key];
      assert.ok(Number.isFinite(value), `${v.name}.${key} nem szám`);
      assert.ok(value > 0, `${v.name}.${key} nem pozitív`);
    }
    assert.ok(v.speed >= 60 && v.speed <= 260, `${v.name}: sebesség km/h`);
    assert.ok(v.mass >= 1200 && v.mass <= 22000, `${v.name}: tömeg kg`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(v.colors.body), `${v.name}: testszín hex`);
  }
});

test("a katalógus determinisztikus: kétszeri olvasás ugyanazt adja", async () => {
  const again = await import("../client/src/lib/tornado/vehicles");
  assert.deepEqual(
    again.VEHICLES.map((v) => `${v.id}:${v.price}:${v.unlockLevel}`),
    VEHICLES.map((v) => `${v.id}:${v.price}:${v.unlockLevel}`),
  );
});
