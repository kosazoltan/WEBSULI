import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  JOYSTICK_DEAD_ZONE,
  JOYSTICK_EXPO,
  joystickCurve,
  joystickVector,
  shapeJoystick,
} from "../client/src/game-engine/joystick.ts";
import { touchDriveInput } from "../client/src/lib/tornado/controls.ts";
import { PLAYER_MAX_SPEED, integratePlayer } from "../client/src/lib/spaceAsteroid/physics.ts";

/*
 * Joystick-reakció (kanban #49, `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` „Joystick-reakció”).
 * Mért gyökérok: a tárcsa holtsávja UTÁN a játékok még egy küszöböt tettek rá (`joystickToDirections` 0,35, a Tornado
 * kormánya 0,2 + négyzetes görbe) — az ujjnak a sugár ~32–45%-áig kellett mennie, mire bármi történt, utána egyszerre
 * jött a teljes sebesség. Ezek a tesztek a folytonos, finom válaszgörbét és a holtsáv egyszeri alkalmazását rögzítik.
 */

const R = 60;
/** Vízszintes kitérés a sugár `frac` hányadával (a tárcsa közepétől). */
const horiz = (frac: number) => joystickVector({ origin: { x: 0, y: 0 }, point: { x: frac * R, y: 0 }, radius: R });

test("joystickCurve: 0-ban 0, 1-ben 1, szigorúan monoton és ugrás nélküli", () => {
  assert.equal(joystickCurve(0), 0);
  assert.equal(joystickCurve(-0.3), 0);
  assert.ok(Math.abs(joystickCurve(1) - 1) < 1e-12);
  assert.ok(Math.abs(joystickCurve(1.7) - 1) < 1e-12, "a sugáron túl nem nő tovább");
  let prev = 0;
  for (let i = 1; i <= 1000; i++) {
    const v = joystickCurve(i / 1000);
    assert.ok(v > prev, `nem szigorúan monoton ${i / 1000}-nél`);
    // Folytonosság: 0,001-es lépésre a változás legfeljebb a görbe legnagyobb meredeksége (1 + 2·expo) szerinti.
    assert.ok(v - prev <= (1 + 2 * JOYSTICK_EXPO) * 0.001 + 1e-9, `ugrás ${i / 1000}-nél: ${v - prev}`);
    prev = v;
  }
});

test("finomság: 10% kitérésre a kimenet a maximum ≤ 10%-a, de nem nulla; 50%-nál érdemi", () => {
  const small = joystickCurve(0.1);
  assert.ok(small > 0 && small <= 0.1, `10% → ${small}`);
  const half = joystickCurve(0.5);
  assert.ok(half > 0.25 && half < 0.5, `50% → ${half}`);
});

test("shapeJoystick: az irány marad, a nagyság a görbe szerinti", () => {
  const v = joystickVector({ origin: { x: 0, y: 0 }, point: { x: 30, y: -30 }, radius: R });
  const s = shapeJoystick(v);
  assert.ok(Math.abs(Math.atan2(s.y, s.x) - Math.atan2(v.y, v.x)) < 1e-12);
  assert.ok(Math.abs(s.magnitude - joystickCurve(v.magnitude)) < 1e-12);
  assert.ok(Math.abs(Math.hypot(s.x, s.y) - s.magnitude) < 1e-12);
  assert.deepEqual(shapeJoystick({ x: 0, y: 0, magnitude: 0 }), { x: 0, y: 0, magnitude: 0 });
});

test("holtsáv csak egyszer: a holtsáv szélén túl 5%-kal már van kimenet (a régi bekötésnél a sugár 45%-áig semmi)", () => {
  const just = shapeJoystick(horiz(JOYSTICK_DEAD_ZONE + 0.05));
  assert.ok(just.x > 0 && just.x < 0.1, `holtsáv + 5% → ${just.x}`);
  assert.equal(shapeJoystick(horiz(JOYSTICK_DEAD_ZONE * 0.9)).x, 0, "a holtsávon belül semmi");
});

test("Tornado kormány: a sugár 25%-ánál már kormányoz (régen 0), teljes kitérésnél teljesen, végig monoton", () => {
  // Az ujj fölfelé (gáz) és oldalra: a gyerek így vezet.
  const drive = (fx: number) =>
    touchDriveInput(joystickVector({ origin: { x: 0, y: 0 }, point: { x: fx * R, y: -0.5 * R }, radius: R }));
  assert.ok(drive(0.25).steer > 0.03, `25% → ${drive(0.25).steer}`);
  assert.ok(drive(0.1).steer < 0.1, `10% → ${drive(0.1).steer} (finom korrekció)`);
  assert.equal(drive(1.2).steer, 1);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const s = drive(i / 100).steer;
    assert.ok(s >= prev - 1e-12, `nem monoton ${i}%-nál`);
    prev = s;
  }
});

test("Aszteroida: analóg tárcsa — a fél kitérés fél sebességet tart (nem gyorsul végsebességre)", () => {
  let p = { x: 0, y: -6.4, vx: 0, vy: 0, bobPhase: 0 };
  for (let t = 0; t < 1; t += 0.01) p = integratePlayer(p, { mx: 0.5, my: 0 }, 0.01, 100);
  assert.ok(Math.abs(p.vx - PLAYER_MAX_SPEED * 0.5) < 0.1, `fél kitérés → ${p.vx}`);
});

test("Aszteroida: a hajó gyorsan követi a tárcsát — 90% ≤ 150 ms, irányváltás ≤ 250 ms (60 és 30 Hz)", () => {
  for (const hz of [60, 30]) {
    const dt = 1 / hz;
    let p = { x: 0, y: -6.4, vx: 0, vy: 0, bobPhase: 0 };
    let t90 = NaN;
    for (let i = 1; i <= hz; i++) {
      p = integratePlayer(p, { mx: 1, my: 0 }, dt, 100);
      if (Number.isNaN(t90) && p.vx >= 0.9 * PLAYER_MAX_SPEED) t90 = i * dt;
    }
    assert.ok(t90 <= 0.15 + dt, `${hz} Hz: 90% ${t90}s`);
    let tRev = NaN;
    for (let i = 1; i <= hz; i++) {
      p = integratePlayer(p, { mx: -1, my: 0 }, dt, 100);
      if (Number.isNaN(tRev) && p.vx <= -0.9 * PLAYER_MAX_SPEED) tRev = i * dt;
    }
    assert.ok(tRev <= 0.25 + dt, `${hz} Hz: irányváltás ${tRev}s`);
  }
});

const root = fileURLToPath(new URL("..", import.meta.url));
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("VirtualJoystick: a húzás nem React-állapot — a gomb DOM-on át mozog, nincs useState a gombhoz", () => {
  const code = strip(readFileSync(join(root, "client/src/game-engine/VirtualJoystick.tsx"), "utf8"));
  assert.doesNotMatch(code, /useState<\{\s*x:\s*number;\s*y:\s*number\s*\}\s*\|\s*null>/, "a gomb helye React-állapot");
  assert.match(code, /style\.transform\s*=/, "a gomb nem közvetlen DOM-transzformációval mozog");
  assert.match(code, /onLostPointerCapture=/, "a capture elvesztése nem enged el (KSZ-14)");
});

test("a három irány-játék a folytonos görbét használja, nem a négyirányú bontást", () => {
  for (const file of ["SpaceAsteroidQuiz.tsx", "BlockCraftQuiz.tsx", "TsunamiEscapeEnglish.tsx"]) {
    const code = strip(readFileSync(join(root, "client/src/pages", file), "utf8"));
    assert.match(code, /shapeJoystick\s*\(/, `${file}: nincs shapeJoystick`);
  }
});
