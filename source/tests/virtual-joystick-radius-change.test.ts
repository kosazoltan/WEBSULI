import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createJoystickDrag, retireJoystickDrag, type JoystickVector } from "../client/src/game-engine/joystick";

/*
 * Review PR #422 (S2): a `radius="auto"` tárcsa húzás közbeni sugárváltásakor (elforgatás) új, inaktív
 * húzás-példány jött létre; a későbbi felengedés az új példányon `up() === false`-szal elnyelődött, nulla
 * vektor nem ment ki, és a játék az ujj felemelése után is tartotta az utolsó irányt. A régi példányt
 * `retireJoystickDrag` zárja le, és a komponens ilyenkor nulla vektort küld (a `virtual-joystick-reset`
 * mintájára).
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const component = strip(readFileSync(join(root, "client/src/game-engine/VirtualJoystick.tsx"), "utf8"));

test("a hiba reprodukciója: példánycsere után az új példányon a felengedés nem enged el semmit", () => {
  const old = createJoystickDrag(58); // 360×640 → controlRadiusFor = 58
  old.down({ x: 100, y: 100 });
  assert.ok(old.move({ x: 100, y: 40 }), "a régi példány vezet");
  const fresh = createJoystickDrag(62); // elforgatás után más sugár
  assert.equal(fresh.up(), false, "az új példány nem tud a régi húzásról — innen jött a beragadt irány");
  assert.equal(old.active, true, "csere nélküli lezárás híján a régi húzás tovább él");
});

test("retireJoystickDrag: a régi futó húzást lezárja, és jelzi, hogy nulla vektor kell", () => {
  const old = createJoystickDrag(58);
  old.down({ x: 100, y: 100 });
  old.move({ x: 140, y: 100 });
  const fresh = createJoystickDrag(62);
  assert.equal(retireJoystickDrag(old, fresh), true);
  assert.equal(old.active, false);
  assert.equal(old.move({ x: 160, y: 100 }), null, "a régi ujj mozgása már nem vezet");
  assert.equal(old.up(), false, "a késve érkező felengedés semmit nem változtat");
});

test("retireJoystickDrag: húzás nélkül, null előzménnyel vagy azonos példánnyal nincs teendő", () => {
  const a = createJoystickDrag(58);
  const b = createJoystickDrag(62);
  assert.equal(retireJoystickDrag(a, b), false, "nem volt futó húzás");
  assert.equal(retireJoystickDrag(null, b), false);
  b.down({ x: 0, y: 0 });
  assert.equal(retireJoystickDrag(b, b), false, "ugyanaz a példány: nincs csere");
  assert.equal(b.active, true, "azonos példánynál a húzás érintetlen");
});

test("a komponens sugárváltáskor a lezárás után nulla vektort küld (szimuláció a komponens lépéseivel)", () => {
  const sent: JoystickVector[] = [];
  let knob: { x: number; y: number } | null = { x: 20, y: 0 };
  const old = createJoystickDrag(58);
  old.down({ x: 100, y: 100 });
  const moved = old.move({ x: 140, y: 100 });
  assert.ok(moved);
  sent.push(moved.vector);
  // A VirtualJoystick [drag]-effektjének lépései:
  const fresh = createJoystickDrag(62);
  if (retireJoystickDrag(old, fresh)) {
    knob = null;
    sent.push({ x: 0, y: 0, magnitude: 0 });
  }
  assert.deepEqual(sent.at(-1), { x: 0, y: 0, magnitude: 0 }, "az utolsó kiküldött vektor nulla");
  assert.equal(knob, null, "a gomb vizuális állapota törlődött");
});

test("forrásőr: a VirtualJoystick a drag-cserére lezár, capture-t enged, gombot töröl, nulla vektort küld", () => {
  assert.match(component, /retireJoystickDrag\(\s*prev\s*,\s*drag\s*\)/);
  const effect = component.slice(component.indexOf("retireJoystickDrag(prev"));
  const body = effect.slice(0, effect.indexOf("}, [drag]"));
  assert.match(body, /releasePointerCapture/);
  assert.match(body, /setKnob\(null\)/);
  assert.match(body, /onChangeRef\.current\(ZERO_VECTOR\)/);
  assert.ok(effect.includes("}, [drag]"), "az effekt a drag-példány cseréjére fut");
});
