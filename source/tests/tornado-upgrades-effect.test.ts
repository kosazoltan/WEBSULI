import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { levelSpec } from "../client/src/lib/tornado/levels";
import {
  anchorBandMessage,
  anchorBandState,
  anchorOutcome,
  breakdownRows,
  createStreakTracker,
  interceptReward,
  recordStreak,
} from "../client/src/lib/tornado/scoring";
import {
  ANCHOR_HOLD_BASE_MS,
  ANCHOR_HOLD_MIN_MS,
  MAX_UPGRADE_LEVEL,
  effectiveAnchorBand,
  effectiveStats,
  effectiveSurfaceGrip,
  emptyUpgrades,
  softenImpact,
  type UpgradeState,
} from "../client/src/lib/tornado/upgrades";
import { stepVehicle } from "../client/src/lib/tornado/drive";
import { initialWind, windForceOn } from "../client/src/lib/tornado/wind";
import { VEHICLES } from "../client/src/lib/tornado/vehicles";

/**
 * J7a — Tornado Hunter 200 javítások (terv 5.7 „Javítás”): a fejlesztések hatása, horgony csak a sávban,
 * pont-bontás, a menet legjobb sorozata. Tiszta függvények + a lap bekötését ellenőrző forrásőr.
 */

const vehicle = VEHICLES[0]!;
const maxed = (track: keyof UpgradeState): UpgradeState => ({ ...emptyUpgrades(), [track]: MAX_UPGRADE_LEVEL });

test("fejlesztés nélkül a hatások az alapértékek (a viselkedés nem változik)", () => {
  const e = effectiveStats(vehicle, emptyUpgrades());
  assert.equal(e.acceleration, vehicle.acceleration);
  assert.equal(e.handling, vehicle.handling);
  assert.equal(e.stability, vehicle.stability);
  assert.equal(e.windResistance, vehicle.windResistance);
  assert.equal(e.anchorPower, vehicle.anchorPower);
  assert.equal(e.gripFactor, 1);
  assert.equal(e.crashLossFactor, 1);
  assert.equal(e.bandWidthFactor, 1);
  assert.equal(e.anchorHoldMs, ANCHOR_HOLD_BASE_MS);
});

test("mind az öt sáv szintenként szigorúan növeli a saját hatását", () => {
  const pick: Record<string, (s: ReturnType<typeof effectiveStats>) => number> = {
    engine: (s) => s.acceleration,
    suspension: (s) => s.handling,
    tires: (s) => s.gripFactor,
    chassis: (s) => s.stability,
    anchor: (s) => s.anchorPower,
    instruments: (s) => s.bandWidthFactor,
  };
  for (const [track, read] of Object.entries(pick)) {
    let prev = read(effectiveStats(vehicle, emptyUpgrades()));
    for (let lvl = 1; lvl <= MAX_UPGRADE_LEVEL; lvl++) {
      const cur = read(effectiveStats(vehicle, { ...emptyUpgrades(), [track]: lvl }));
      assert.ok(cur > prev, `${track} ${lvl}. szint: ${cur} nem nagyobb, mint ${prev}`);
      prev = cur;
    }
  }
});

test("a gumik (tires): a talaj tapadása nő, de a fizika felső korlátja (1) marad", () => {
  const e = effectiveStats(vehicle, maxed("tires"));
  assert.ok(e.gripFactor > 1.2);
  assert.ok(effectiveSurfaceGrip(0.4, e.gripFactor) > 0.4, "sáron javul");
  assert.equal(effectiveSurfaceGrip(1, e.gripFactor), 1, "aszfalton nem lépi túl az 1-et");
  assert.equal(effectiveSurfaceGrip(0.4, 1), 0.4, "fejlesztés nélkül nem változik");
});

test("a gumik valóban kisebb kanyar-csúszást adnak (a közös fizikán át mérve)", () => {
  // Sáros talaj, azonos kormány: a nagyobb tapadás nagyobb fordulatot ad (kevesebb kanyar-csúszás).
  const body = { x: 0, z: 0, heading: 0, speed: 8, anchored: false };
  const drive = { speedKmh: 150, acceleration: 60, handling: 70, windPush: 0, windAngle: 0 };
  const turn = (factor: number) => {
    let b = body;
    for (let i = 0; i < 60; i++) {
      b = stepVehicle(b, { throttle: 0.5, steer: 1, brake: false }, 1 / 60, { ...drive, grip: effectiveSurfaceGrip(0.4, factor) });
    }
    return b.heading;
  };
  assert.ok(turn(effectiveStats(vehicle, maxed("tires")).gripFactor) > turn(1));
});

test("az alváz (chassis): kisebb ütközési sebességvesztés és kisebb szélsodrás", () => {
  const base = effectiveStats(vehicle, emptyUpgrades());
  const tough = effectiveStats(vehicle, maxed("chassis"));
  assert.ok(tough.crashLossFactor < 1);
  // Frontális ütközés: 10 m/s-ból a nyers fal 0,5-re fékez.
  const raw = softenImpact(10, 0.5, 1);
  const soft = softenImpact(10, 0.5, tough.crashLossFactor);
  assert.equal(raw, 0.5, "fejlesztés nélkül a nyers eredmény");
  assert.ok(soft > raw && soft < 10, `a tompított sebesség (${soft}) nagyobb a nyersnél, de nem gyorsít`);
  // Tolatás: az irány megmarad.
  assert.ok(softenImpact(-10, -0.5, tough.crashLossFactor) < -0.5);
  // Ütközés nélkül vagy előjelváltásnál nem nyúl hozzá.
  assert.equal(softenImpact(10, 10, tough.crashLossFactor), 10);
  assert.equal(softenImpact(0, 0, tough.crashLossFactor), 0);
  assert.equal(softenImpact(5, -2, tough.crashLossFactor), -2);
  // Szél: ugyanaz a szél kevesebb erőt fejt ki a fejlesztett járműre.
  const wind = { ...initialWind(levelSpec(100)), currentWindSpeed: 150 };
  assert.ok(windForceOn(wind, tough.windResistance) < windForceOn(wind, base.windResistance));
  // A garázs „Stabilitás” és „Szélállóság” sávja a fejlesztéssel nő.
  assert.ok(tough.stability > base.stability && tough.windResistance > base.windResistance);
});

test("a horgony (anchor): rövidebb készenléti idő, alsó korláttal", () => {
  const hold = (lvl: number) => effectiveStats(vehicle, { ...emptyUpgrades(), anchor: lvl }).anchorHoldMs;
  for (let lvl = 1; lvl <= MAX_UPGRADE_LEVEL; lvl++) assert.ok(hold(lvl) < hold(lvl - 1), `${lvl}. szint nem rövidebb`);
  assert.ok(hold(MAX_UPGRADE_LEVEL) >= ANCHOR_HOLD_MIN_MS);
});

test("a műszer (instruments): a mérési sáv külső széle kijjebb, a belső él marad", () => {
  const band = { min: 0.34, max: 0.5 };
  assert.deepEqual(effectiveAnchorBand(band, 1), band);
  const wide = effectiveAnchorBand(band, effectiveStats(vehicle, maxed("instruments")).bandWidthFactor);
  assert.equal(wide.min, band.min, "a veszélyes belső él nem mozdul");
  assert.ok(wide.max > band.max);
  // Védekező eset: 1-nél kisebb szorzó sem szűkíti a sávot.
  assert.deepEqual(effectiveAnchorBand(band, 0.5), band);
});

test("horgony csak a sávban: a sávon kívül nincs kérdés, bent igen (a határok bent vannak)", () => {
  const band = { min: 0.34, max: 0.5 };
  assert.equal(anchorBandState(0.2, band), "too_close");
  assert.equal(anchorBandState(0.34, band), "in_band");
  assert.equal(anchorBandState(0.5, band), "in_band");
  assert.equal(anchorBandState(1.8, band), "too_far");
  assert.match(anchorBandMessage("too_far"), /közelebb/);
  assert.match(anchorBandMessage("too_close"), /Hátrébb/);
  // A fejlesztett sávval a korábban „túl messze” távolság már a sávon belül van — és az `anchorOutcome` is ezt látja.
  const spec = levelSpec(1);
  const wide = effectiveAnchorBand(spec.anchorBand, effectiveStats(vehicle, maxed("instruments")).bandWidthFactor);
  const d = (spec.anchorBand.max + wide.max) / 2;
  assert.equal(anchorBandState(d, spec.anchorBand), "too_far");
  assert.equal(anchorBandState(d, wide), "in_band");
  assert.equal(anchorOutcome({ distanceKm: d, spec: { ...spec, anchorBand: wide }, answerCorrect: true, surfaceGrip: 1 }).ok, true);
  assert.equal(anchorOutcome({ distanceKm: d, spec, answerCorrect: true, surfaceGrip: 1 }).reason, "too_far");
});

test("pont-bontás: öt sor, az összeg a menet pontszáma", () => {
  const spec = levelSpec(30);
  for (const attempts of [1, 2, 4]) {
    const r = interceptReward({
      spec,
      secondsUsed: 70,
      anchorAttempts: attempts,
      peakWind: spec.windPeak * 0.8,
      distanceKm: (spec.anchorBand.min + spec.anchorBand.max) / 2,
      correctAnswers: 5,
      wrongAnswers: 2,
    });
    const rows = breakdownRows(r.breakdown);
    assert.deepEqual(rows.map((x) => x.id), ["base", "speedBonus", "stormBonus", "answerBonus", "positionBonus"]);
    assert.ok(rows.every((x) => x.label.length > 0 && Number.isInteger(x.value) && x.value >= 0));
    assert.equal(rows.reduce((s, x) => s + x.value, 0), r.score, `${attempts}. kísérlet: a bontás összege nem a pontszám`);
  }
});

test("a menet legjobb sorozata: a hiba nullázza az aktuálist, a legjobb marad", () => {
  const seq = [true, true, true, false, true, true, false, true];
  let t = createStreakTracker();
  for (const c of seq) t = recordStreak(t, c);
  assert.equal(t.best, 3, "a legjobb sorozat 3, nem a helyes válaszok száma (6)");
  assert.equal(t.current, 1);
  assert.equal(recordStreak(createStreakTracker(), false).best, 0);
});

/* ---- a lap bekötése (forrásőr) ---- */

const page = readFileSync(path.join(import.meta.dirname, "../client/src/pages/TornadoHunter200.tsx"), "utf8");

test("bekötés: a lap a közös számításból dolgozik, és minden hatás el van érve", () => {
  assert.match(page, /effectiveStats\(detail, detailUpgrades\)/, "a garázs a közös függvényt hívja");
  assert.match(page, /effectiveStats\(props\.vehicle, upgradesFor\(props\.progress, props\.vehicle\.id\)\)/, "a játék is");
  assert.match(page, /effectiveSurfaceGrip\(gripAt\(p\.x, p\.z\), stats\.gripFactor\)/, "tires → tapadás");
  assert.match(page, /softenImpact\(next\.speed, solid\.speed, stats\.crashLossFactor\)/, "chassis → ütközés");
  assert.match(page, /windForceOn\(windRef\.current, stats\.windResistance\)/, "stabilitás → szélsodrás");
  assert.match(page, /effRef\.current\.anchorHoldMs/, "anchor → készenléti idő");
  assert.match(page, /effectiveAnchorBand\(spec\.anchorBand, eff\.bandWidthFactor\)/, "instruments → sáv");
  assert.doesNotMatch(page, /statMultiplier/, "nincs több közvetlen szorzó a lapon");
});

test("bekötés: a ⚓ a sávon kívül letiltott, a kérdés csak a sávban nyílik", () => {
  assert.match(page, /disabled=\{!props\.anchorEnabled\}/);
  assert.match(page, /anchorEnabled=\{hud\.inBand && !playerRef\.current\.anchored\}/);
  const tryAnchor = page.slice(page.indexOf("tryAnchorRef.current = () => {"), page.indexOf("const pendingAnchorRef"));
  assert.ok(tryAnchor.indexOf("anchorBandState(") > 0 && tryAnchor.indexOf("anchorBandState(") < tryAnchor.indexOf('raiseQuiz("anchor")'));
  assert.match(tryAnchor, /band !== "in_band"[\s\S]{0,200}return;/);
});

test("bekötés: pont-bontás az eredményen, a sorozat a legjobb sorozat", () => {
  assert.match(page, /breakdownRows\(result\.breakdown\)/);
  assert.match(page, /data-testid="tornado-score-breakdown"/);
  assert.match(page, /runStreak: streakRef\.current\.best/);
  assert.match(page, /maxStreak: streakRef\.current\.best/);
  assert.doesNotMatch(page, /runStreak: correctRef\.current/);
});
