import assert from "node:assert/strict";
import test from "node:test";

import { relativeBearingDeg, targetMarker } from "../client/src/lib/tornado/targetMarker";

/**
 * G-9b — céljelző a tornádóhoz.
 *
 * Élesben mérve (2026-09-07, Pixel 7): a HUD azt írja ki, hogy „Menj közelebb a
 * tornádóhoz!", a cél 3,25 km-re van, az álló telefon vízszintes látószöge
 * viszont csak ~33° (62°-os függőleges látószög, 0,46-os képarány mellett). Ha a
 * cél nem pont előre van, a gyerek nem látja, és nem is tudja, merre forduljon:
 * húsz másodperc vezetés után 3,47-ről 3,25 km-re jutott, félig véletlenül.
 *
 * A megoldás az, amit a menekülős és üldözős játékok is használnak: nyíl a
 * képernyő szélén, ami a képen kívüli cél felé mutat, és eltűnik, amint a cél
 * úgyis látszik.
 *
 * A szögtan tiszta modulban él, mert ez az a fajta kód, ami elsőre mindig
 * elfordul 90 vagy 180 fokkal.
 */

test("egyenesen előre nulla fok", () => {
  assert.equal(relativeBearingDeg(0, 0), 0);
  assert.equal(relativeBearingDeg(90, 90), 0);
});

test("a jobbra lévő cél pozitív, a balra lévő negatív", () => {
  // A jármű északnak néz (0°), a cél keletre (90°) → jobbra fordulj.
  assert.equal(relativeBearingDeg(0, 90), 90);
  // A cél nyugatra (270°) → balra fordulj, ne 270 fokot jobbra.
  assert.equal(relativeBearingDeg(0, 270), -90);
});

test("a kör átfordulásánál sem ugrik nagyot", () => {
  // 350°-ról 10°-ra: húsz fok jobbra, nem 340 fok balra.
  assert.equal(relativeBearingDeg(350, 10), 20);
  assert.equal(relativeBearingDeg(10, 350), -20);
});

test("a hátunk mögötti cél ±180 fok", () => {
  assert.equal(Math.abs(relativeBearingDeg(0, 180)), 180);
});

test("a jelző elrejtőzik, ha a cél amúgy is a képen van", () => {
  const marker = targetMarker({ heading: 0, targetBearing: 5, halfFovDeg: 16.5 });

  assert.equal(marker.visible, false, "a látható célra fölösleges nyíl");
});

test("a jelző megjelenik, ha a cél kilóg a látómezőből", () => {
  const marker = targetMarker({ heading: 0, targetBearing: 90, halfFovDeg: 16.5 });

  assert.equal(marker.visible, true);
  assert.equal(marker.side, "right");
  assert.equal(marker.angleDeg, 90);
});

test("a bal oldali cél a bal szélre kerül", () => {
  const marker = targetMarker({ heading: 0, targetBearing: 280, halfFovDeg: 16.5 });

  assert.equal(marker.visible, true);
  assert.equal(marker.side, "left");
});

test("a pontosan hátul lévő cél is kap oldalt — nem tűnhet el", () => {
  const marker = targetMarker({ heading: 0, targetBearing: 180, halfFovDeg: 16.5 });

  assert.equal(marker.visible, true);
  assert.ok(marker.side === "left" || marker.side === "right");
});
