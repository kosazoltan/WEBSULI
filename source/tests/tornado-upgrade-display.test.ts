import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { levelSpec } from "../client/src/lib/tornado/levels";
import { ANCHOR_HOLD_BASE_MS, MAX_UPGRADE_LEVEL, effectiveStats, emptyUpgrades } from "../client/src/lib/tornado/upgrades";
import { WIND_RESISTANCE_CAP, initialWind, windForceOn } from "../client/src/lib/tornado/wind";

/**
 * J7b — kanban #83: a Vihargarázs sávjai a játékban TÉNYLEGESEN ható számot mutatják („J7b döntések” 8.).
 * L1: a szélállóság a telítési pont (110,5) fölött nem hat → a sáv sem nő tovább. L2: a jármű alap stabilitása és
 * horgonyereje a játékban nem hat → a „Stabilitás” sáv az ütközés-tűrést, a „Horgony” a rögzítési gyorsaságot mutatja.
 */

const base = { speed: 160, acceleration: 70, handling: 70, stability: 60, windResistance: 100, anchorPower: 60 };
const wind = { ...initialWind(levelSpec(120)), currentWindSpeed: 300 };

test("L1: a szélállóság a telítési pontnál megáll — a sáv és a szélsodrás ugyanott telít", () => {
  assert.equal(WIND_RESISTANCE_CAP, 110.5);
  let prevShown = 0;
  for (let lvl = 0; lvl <= MAX_UPGRADE_LEVEL; lvl++) {
    const e = effectiveStats(base, { ...emptyUpgrades(), chassis: lvl });
    assert.ok(e.windResistance <= WIND_RESISTANCE_CAP, `${lvl}. szint: a sáv túlnő a telítésen (${e.windResistance})`);
    assert.ok(e.windResistance >= prevShown);
    prevShown = e.windResistance;
    // A sáv értéke és a nyers (levágatlan) érték ugyanazt a szélsodrást adja: a sáv nem ígér többet.
    const raw = base.windResistance * (e.crashTolerance / 100);
    assert.equal(windForceOn(wind, e.windResistance), windForceOn(wind, raw), `${lvl}. szint`);
  }
  const top = effectiveStats(base, { ...emptyUpgrades(), chassis: MAX_UPGRADE_LEVEL });
  assert.equal(top.windResistance, WIND_RESISTANCE_CAP, "a 100-as alapú jármű maxolt alvázzal a telítésnél áll");
  // A telítés alatt a sáv növekedése valódi szélsodrás-csökkenés.
  const low = { ...base, windResistance: 50 };
  const a = effectiveStats(low, emptyUpgrades());
  const b = effectiveStats(low, { ...emptyUpgrades(), chassis: 3 });
  assert.ok(b.windResistance > a.windResistance && windForceOn(wind, b.windResistance) < windForceOn(wind, a.windResistance));
});

test("L2: a jármű alap stabilitása és horgonyereje semmilyen ható értéket nem változtat, a garázs-sáv sem tőle függ", () => {
  const sturdy = { ...base, stability: 95, anchorPower: 95 };
  const flimsy = { ...base, stability: 20, anchorPower: 20 };
  for (const upgrades of [emptyUpgrades(), { ...emptyUpgrades(), chassis: 3, anchor: 4 }]) {
    const s = effectiveStats(sturdy, upgrades);
    const f = effectiveStats(flimsy, upgrades);
    for (const key of ["gripFactor", "crashLossFactor", "anchorHoldMs", "bandWidthFactor", "windResistance", "crashTolerance", "anchorSpeed"] as const) {
      assert.equal(s[key], f[key], key);
    }
  }
});

test("L2: „Stabilitás” = ütközés-tűrés, „Horgony” = rögzítési gyorsaság — 100 az alap, a fejlesztéssel szigorúan nő", () => {
  const e0 = effectiveStats(base, emptyUpgrades());
  assert.equal(e0.crashTolerance, 100);
  assert.equal(e0.anchorSpeed, 100);
  for (let lvl = 1; lvl <= MAX_UPGRADE_LEVEL; lvl++) {
    const c = effectiveStats(base, { ...emptyUpgrades(), chassis: lvl });
    const a = effectiveStats(base, { ...emptyUpgrades(), anchor: lvl });
    const cPrev = effectiveStats(base, { ...emptyUpgrades(), chassis: lvl - 1 });
    const aPrev = effectiveStats(base, { ...emptyUpgrades(), anchor: lvl - 1 });
    assert.ok(c.crashTolerance > cPrev.crashTolerance && a.anchorSpeed > aPrev.anchorSpeed, `${lvl}. szint`);
    assert.ok(Math.abs(c.crashTolerance - 100 / c.crashLossFactor) < 1e-9, "a sáv a ható ütközési szorzóból jön");
    assert.ok(Math.abs(a.anchorSpeed - (100 * ANCHOR_HOLD_BASE_MS) / a.anchorHoldMs) < 1e-9, "a sáv a ható készenléti időből jön");
  }
});

test("bekötés: a garázs sávjai a ható értékeket kapják", () => {
  const page = readFileSync(path.join(import.meta.dirname, "../client/src/pages/TornadoHunter200.tsx"), "utf8");
  assert.match(page, /<StatBar label="Stabilitás" value=\{detailStats\.crashTolerance\}/);
  assert.match(page, /<StatBar label="Szélállóság" value=\{detailStats\.windResistance\}/);
  assert.match(page, /<StatBar label="Horgony" value=\{detailStats\.anchorSpeed\}/);
  assert.doesNotMatch(page, /value=\{detailStats\.(stability|anchorPower)\}/);
});
