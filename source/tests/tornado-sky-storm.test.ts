import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  buildSkyDome,
  buildStormCloud,
  animateStormCloud,
  QUALITY_PROFILES,
  skyDomeRadiusFor,
  cameraFarFor,
} from "../client/src/tornado/buildMeshes";

/**
 * G-9 — a vihar legyen LÁTHATÓ.
 *
 * Élesben mérve (2026-09-07, Pixel 7, 1. pálya): a HUD azt írja ki, hogy „Menj
 * közelebb a tornádóhoz!", a tornádó viszont 3,56 km-re van, ami 926
 * világegység (`UNITS_PER_KM = 260`). A köd a legjobb minőségi profilon is 900
 * egységnél elvág — vagyis a játék olyan célt tűz ki, amit a gyerek nem lát. Egy
 * viharvadász játékban ez maga a játékmenet hibája, nem szépészeti kérdés: az
 * igazi szuperfelhő kilométerekről látszik.
 *
 * Két állítás védi ezt:
 *
 *  - a viharfelhő anyaga NEM ködösödik (`fog: false`), különben ugyanúgy eltűnne,
 *    mint a tölcsér;
 *  - a felhő magassága és sugara akkora, hogy a látótávolságon túlról is a
 *    horizont fölé lógjon.
 *
 * Az égbolt-kupola ugyanezt a szabályt követi: köd nélkül, hátsó lapokkal,
 * mélységírás nélkül — különben kitakarná a jelenetet.
 */

const FAR_DISTANCE_UNITS = 926; // a mért 3,56 km

test("a viharfelhő nem ködösödik el — különben ugyanúgy eltűnne, mint a tölcsér", () => {
  const cloud = buildStormCloud("medium");

  const materials: THREE.Material[] = [];
  cloud.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      materials.push(...(Array.isArray(o.material) ? o.material : [o.material]));
    }
  });

  assert.ok(materials.length > 0, "üres viharfelhő");
  for (const m of materials) {
    assert.equal(m.fog, false, "a köd elnyelné a felhőt a látótávolságon túl");
  }
});

test("a viharfelhő a látótávolságon túlról is a horizont fölé lóg", () => {
  const cloud = buildStormCloud("medium");
  const box = new THREE.Box3().setFromObject(cloud.group);

  const height = box.max.y;
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;

  // Egyszerű látószög-ellenőrzés: a felhő teteje a 62°-os kamera látómezejében
  // legyen 926 egységről is, vagyis ne süllyedjen a horizont alá.
  const angle = Math.atan2(height, FAR_DISTANCE_UNITS);
  assert.ok(
    angle > 0.05,
    `a felhő 926 egységről alig ${(angle * 180) / Math.PI}°-ra emelkedik — nem látható`,
  );
  assert.ok(radius > 60, `a felhő sugara ${radius} — messziről pontnyi lenne`);
});

test("a felhő a köd határán túl van elhelyezve, nem a tölcsér tetején", () => {
  const cloud = buildStormCloud("medium");
  const box = new THREE.Box3().setFromObject(cloud.group);

  // A tölcsér 92 egység magas; a szuperfelhő e fölött ül.
  assert.ok(box.min.y > 92, `a felhő alja ${box.min.y} — belelógna a tölcsérbe`);
});

test("a felhő forog, de a mozgáscsökkentés lassítja", () => {
  const normal = buildStormCloud("medium");
  const reduced = buildStormCloud("medium");

  animateStormCloud(normal, 1, 1);
  animateStormCloud(reduced, 1, 0.25);

  assert.ok(normal.group.rotation.y > 0, "a szuperfelhő álló képként élettelen");
  assert.ok(
    reduced.group.rotation.y < normal.group.rotation.y,
    "mozgáscsökkentésnél lassabban kell forognia",
  );
});

test("az égbolt-kupola belülről látszik és nem takarja ki a jelenetet", () => {
  const dome = buildSkyDome(new THREE.Color("#8fb6d9"), new THREE.Color("#2a3550"), 1200);

  assert.ok(dome instanceof THREE.Mesh);
  const material = dome.material as THREE.Material;
  assert.equal(material.side, THREE.BackSide, "kívülről nézve eltakarná a világot");
  assert.equal(material.fog, false, "a ködbe olvadó égbolt értelmetlen");
  assert.equal(material.depthWrite, false, "mélységírással kitakarná a tornádót");
});

test("az égbolt-kupola túlnyúlik a köd határán", () => {
  for (const quality of ["low", "medium", "high"] as const) {
    const far = QUALITY_PROFILES[quality].fogFar;
    const dome = buildSkyDome(new THREE.Color("#fff"), new THREE.Color("#000"), far + 300);
    const box = new THREE.Box3().setFromObject(dome);

    assert.ok(
      box.max.x > far,
      `${quality}: a kupola ${box.max.x} egységnél véget ér, a köd ${far}-nál`,
    );
  }
});

test("a kamera vágósíkja a kupolán túl van — különben az egész eltűnik", () => {
  for (const quality of ["low", "medium", "high"] as const) {
    const profile = QUALITY_PROFILES[quality];
    const dome = skyDomeRadiusFor(profile);
    const far = cameraFarFor(profile);

    assert.ok(
      far > dome,
      `${quality}: a kamera ${far}-ig lát, a kupola ${dome}-nál van — kivágódna`,
    );
    // A szuperfelhőt a tornádó fölött is látni kell; a tornádó több kilométerre
    // is lehet (mérve: 3,56 km = 926 egység).
    assert.ok(far > 1500, `${quality}: ${far} egység kevés egy 3-4 km-es célhoz`);
  }
});
