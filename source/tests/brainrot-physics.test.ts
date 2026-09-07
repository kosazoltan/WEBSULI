import assert from "node:assert/strict";
import test from "node:test";

import { stepBrainRot, type MovingRot } from "../client/src/lib/brainRotPhysics";

/**
 * G-10 — a Brain Rot mozgása.
 *
 * Két hiba mérve a kódban (2026-09-07):
 *
 *  1. A mozgás képkocka-alapú volt (`x += vx`), nem idő-alapú. Aki 120 Hz-es
 *     telefonon játszik, annál minden kétszer olyan gyorsan mozgott, mint 60
 *     Hz-en — ugyanaz a játék, két nehézség, véletlenül.
 *
 *  2. Az állapotfrissítés ~10 FPS-re volt fojtva (100 ms), teljesítmény miatt.
 *     A fojtás maga jó ötlet (a React újrarajzolása drága), de a lépés ekkor
 *     TÍZSZER akkorát ugrott — a lény ugrálva, nem úszva mozgott.
 *
 * A javítás mindkettőre ugyanaz: a lépés a ténylegesen eltelt időt kapja meg, és
 * a sebességet 60 FPS-hez normalizáljuk, hogy a meglévő értékek megtartsák az
 * eddigi „érzetüket".
 */

const BOUNDS = { width: 400, height: 300 };

const rot = (over: Partial<MovingRot> = {}): MovingRot => ({
  x: 200,
  y: 150,
  vx: 1,
  vy: 0,
  size: 40,
  rotation: 0,
  rotSpeed: 2,
  ...over,
});

test("ugyanaz az idő ugyanoda visz, a képkockák számától függetlenül", () => {
  // 100 ms egy lépésben…
  const oneStep = stepBrainRot(rot(), 100, BOUNDS);

  // …és ugyanaz 10 ms-os lépésekben.
  let many = rot();
  for (let i = 0; i < 10; i += 1) many = stepBrainRot(many, 10, BOUNDS);

  assert.ok(
    Math.abs(oneStep.x - many.x) < 1e-6,
    `10 FPS: ${oneStep.x}, 100 FPS: ${many.x} — a nehézség nem függhet a telefontól`,
  );
});

test("a fal visszapattint, és nem lehet kicsúszni rajta", () => {
  const atRightEdge = rot({ x: BOUNDS.width - 20, vx: 5 });
  const next = stepBrainRot(atRightEdge, 100, BOUNDS);

  assert.ok(next.vx < 0, "a falról vissza kell pattannia");
  assert.ok(
    next.x <= BOUNDS.width - next.size / 2 + 1e-6,
    `kilógott a pályáról: ${next.x}`,
  );
});

test("egyetlen nagy lépés sem visz ki a pályáról", () => {
  // Lassú telefonon egy „kockakihagyás" akár fél másodperc is lehet.
  const fast = rot({ x: 380, y: 290, vx: 40, vy: 40 });
  const next = stepBrainRot(fast, 500, BOUNDS);

  assert.ok(next.x >= next.size / 2 && next.x <= BOUNDS.width - next.size / 2, `x=${next.x}`);
  assert.ok(next.y >= next.size / 2 && next.y <= BOUNDS.height - next.size / 2, `y=${next.y}`);
});

test("a lépés felső határa véd a háttérbe tett fül ellen", () => {
  // Ha a fül percekig háttérben volt, a `dt` óriási lenne, és a lény egyetlen
  // képkocka alatt átrepülne a pályán. A lépést ezért maximáljuk.
  const huge = stepBrainRot(rot({ vx: 3 }), 60_000, BOUNDS);
  const normal = stepBrainRot(rot({ vx: 3 }), 100, BOUNDS);

  assert.ok(
    Math.abs(huge.x - 200) < Math.abs(BOUNDS.width),
    "a beragadt fül után nem teleportálhat",
  );
  assert.notEqual(huge.x, normal.x);
});

test("a forgás is idő-alapú", () => {
  const slow = stepBrainRot(rot(), 100, BOUNDS);
  const fast = stepBrainRot(rot(), 200, BOUNDS);

  assert.ok(fast.rotation > slow.rotation, "kétszer annyi idő alatt kétszer annyit fordul");
});

test("nulla eltelt idő nem mozdít", () => {
  const same = stepBrainRot(rot(), 0, BOUNDS);

  assert.equal(same.x, 200);
  assert.equal(same.y, 150);
});

test("elfajult pályaméret nem okoz NaN-t", () => {
  const next = stepBrainRot(rot(), 100, { width: 0, height: 0 });

  assert.ok(Number.isFinite(next.x) && Number.isFinite(next.y));
});
