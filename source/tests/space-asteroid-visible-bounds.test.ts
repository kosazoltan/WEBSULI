import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_W,
  integratePlayer,
  playerXLimit,
  visibleHalfWidth,
  type PlayerBody,
} from "../client/src/lib/spaceAsteroid/physics";

/**
 * G-11 — a hajó nem csúszhat le a képernyőről.
 *
 * Élesben mérve (2026-09-07, Pixel 7): a hajó a jobb szélen FÉLIG kilógott a
 * játéktérből. A fizikai határolás megvolt (±8,3 világegység), csak épp nem azt
 * a mennyiséget korlátozta, ami számít.
 *
 * A pálya 18 egység SZÉLES, a kamera viszont 46°-os FÜGGŐLEGES látószöggel néz,
 * és a vízszintes kiterjedés ebből a képaránnyal jön. Álló telefonon (0,46-os
 * arány) a látható sáv jóval keskenyebb 18 egységnél — a hajó tehát a pályán
 * belül maradt, a KÉPEN mégis kicsúszott.
 *
 * Ezért a vízszintes határ mostantól a kamerából származik, nem konstansból: a
 * kisebbik nyer a pálya széle és a látható sáv széle közül.
 */

const FOV_DEG = 46;
/** A kamera és a játéksík távolsága a lapon beállított értékek szerint. */
const CAMERA_DISTANCE = 15;

const body = (over: Partial<PlayerBody> = {}): PlayerBody => ({
  x: 0,
  y: -8,
  vx: 0,
  vy: 0,
  bobPhase: 0,
  ...over,
});

test("álló telefonon a látható sáv keskenyebb a pályánál", () => {
  const portrait = visibleHalfWidth(FOV_DEG, 412 / 900, CAMERA_DISTANCE);

  assert.ok(
    portrait * 2 < GAME_W,
    `a látható szélesség ${(portrait * 2).toFixed(1)}, a pálya ${GAME_W} — enélkül nincs is hiba`,
  );
});

test("fekvő képarányon a látható sáv szélesebb, mint állóban", () => {
  const portrait = visibleHalfWidth(FOV_DEG, 412 / 900, CAMERA_DISTANCE);
  const landscape = visibleHalfWidth(FOV_DEG, 900 / 412, CAMERA_DISTANCE);

  assert.ok(landscape > portrait, `álló ${portrait}, fekvő ${landscape}`);
});

test("a határ a kisebbiket veszi: a pálya szélét vagy a látható sávot", () => {
  const narrow = playerXLimit(visibleHalfWidth(FOV_DEG, 412 / 900, CAMERA_DISTANCE));
  const wide = playerXLimit(visibleHalfWidth(FOV_DEG, 3, CAMERA_DISTANCE));

  assert.ok(narrow < GAME_W / 2, "álló telefonon a látható sáv szűkít");
  assert.ok(wide <= GAME_W / 2, "széles képernyőn sem lóghat túl a pályán");
  assert.ok(narrow > 0, "a határ nem tüntetheti el a mozgásteret");
});

test("a hajó a képen belül marad, bármeddig nyomják jobbra", () => {
  const limit = playerXLimit(visibleHalfWidth(FOV_DEG, 412 / 900, CAMERA_DISTANCE));

  let p = body();
  for (let i = 0; i < 200; i += 1) {
    p = integratePlayer(p, { mx: 1, my: 0 }, 1 / 60, limit);
  }

  assert.ok(p.x <= limit + 1e-6, `a hajó ${p.x}-nél áll, a határ ${limit}`);
  assert.equal(p.vx, 0, "a falnak érve a sebességnek nullázódnia kell, különben ott ragad");
});

test("balra ugyanígy", () => {
  const limit = playerXLimit(visibleHalfWidth(FOV_DEG, 412 / 900, CAMERA_DISTANCE));

  let p = body();
  for (let i = 0; i < 200; i += 1) {
    p = integratePlayer(p, { mx: -1, my: 0 }, 1 / 60, limit);
  }

  assert.ok(p.x >= -limit - 1e-6, `a hajó ${p.x}-nél áll, a határ -${limit}`);
});

test("határ nélkül a régi viselkedés marad — a hívók nem törnek el", () => {
  let p = body();
  for (let i = 0; i < 200; i += 1) {
    p = integratePlayer(p, { mx: 1, my: 0 }, 1 / 60);
  }

  // A régi konstans: GAME_W / 2 - 0.7
  assert.ok(Math.abs(p.x - (GAME_W / 2 - 0.7)) < 1e-6, `x=${p.x}`);
});

test("a hajó SZÁRNYA sem lóghat le a képről", async () => {
  const { PLAYER_HALF_WIDTH } = await import("../client/src/lib/spaceAsteroid/physics");

  // A szárny 0,85 széles doboz a középtől 0,7-re → 1,125. Élesben a korábbi
  // 0,7-es ráhagyással a szárny fele lelógott a jobb szélen.
  const half = visibleHalfWidth(FOV_DEG, 412 / 900, CAMERA_DISTANCE);
  const limit = playerXLimit(half);

  assert.ok(
    limit + PLAYER_HALF_WIDTH <= half + 1e-6,
    `a hajó jobb széle ${limit + PLAYER_HALF_WIDTH}, a látható sáv ${half}`,
  );
});

test("elfajult képarány nem ad NaN határt", () => {
  for (const aspect of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const half = visibleHalfWidth(FOV_DEG, aspect, CAMERA_DISTANCE);
    assert.ok(Number.isFinite(playerXLimit(half)), `aspect=${aspect}`);
  }
});

/* --------------------- G-12: a hajó a képen legyen --------------------- */

test("a játékos teljes mozgássávja a képernyőn belül van", async () => {
  const THREE = await import("three");
  const {
    CAMERA_FOV_DEG,
    CAMERA_Y,
    CAMERA_Z,
    CAMERA_LOOK_Y,
    PLAYER_Y_MIN,
    PLAYER_Y_MAX,
  } = await import("../client/src/lib/spaceAsteroid/physics");

  /*
   * Mérve (2026-09-07, Pixel 7): a korábbi kameraállással (y=-2.5, lookAt 1.5)
   * a hajó kiinduló helye ndc y = -1,26-ra vetült — a képernyő alsó éle ALATT.
   * A gyerek a saját hajóját csak akkor látta, ha feltolta a képbe. Böngészőben
   * is ellenőrizve: alaphelyzetben nincs hajó a képen, felfelé húzásra megjelenik.
   */
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 412 / 900, 0.1, 100);
  camera.position.set(0, CAMERA_Y, CAMERA_Z);
  camera.lookAt(0, CAMERA_LOOK_Y, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const ndcY = (y: number) => new THREE.Vector3(0, y, 0).project(camera).y;

  // 0.95: marad hely a hajó magasságának és a kamerarázásnak is.
  for (const [label, y] of [
    ["alsó határ", PLAYER_Y_MIN],
    ["kiinduló hely", -24 / 2 + 2.4],
    ["felső határ", PLAYER_Y_MAX],
  ] as const) {
    const v = ndcY(y);
    assert.ok(
      v > -0.95 && v < 0.95,
      `${label} (y=${y}) ndc ${v.toFixed(2)} — a hajó kilóg a képből`,
    );
  }
});
