import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJoystickDrag } from "../client/src/game-engine/joystick";

/*
 * Review PR #137 (2): on window blur the Tornado page cleared its own touch flags, but the running
 * VirtualJoystick kept its drag origin and knob. The next pointermove (the capture outlives a
 * focus loss) drove again without a new touch, and the knob stayed visibly pulled. The drag state
 * now lives in `createJoystickDrag`, and the component resets it on a `resetSignal` change.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const component = strip(readFileSync(join(root, "client/src/game-engine/VirtualJoystick.tsx"), "utf8"));
const page = strip(readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8"));

test("húzás: lenyomás után a mozgás vezet, felengedés után nem", () => {
  const drag = createJoystickDrag(50);
  assert.equal(drag.move({ x: 100, y: 60 }), null, "no drag before a press");
  drag.down({ x: 100, y: 100 });
  const m = drag.move({ x: 100, y: 60 });
  assert.ok(m && m.vector.y > 0.5, `pulling up drives forward: ${JSON.stringify(m)}`);
  assert.equal(drag.up(), true);
  assert.equal(drag.move({ x: 100, y: 60 }), null);
  assert.equal(drag.up(), false, "a second release is a no-op");
});

test("reset: futó húzás közben is mindent elenged, a későbbi mozgás nem vezet új érintés nélkül", () => {
  const drag = createJoystickDrag(50);
  drag.down({ x: 100, y: 100 });
  assert.ok(drag.move({ x: 100, y: 150 }), "reversing before the blur");
  assert.equal(drag.active, true);
  assert.equal(drag.reset(), true, "reset reports that a drag was cut");
  assert.equal(drag.active, false);
  assert.equal(drag.move({ x: 100, y: 150 }), null, "the stale pointer must not drive after a reset");
  assert.equal(drag.up(), false, "the late pointerup of the cut drag changes nothing");
  assert.equal(drag.reset(), false, "reset without a drag is a no-op");
});

test("VirtualJoystick: opcionális resetSignal, változáskor nulláz (gomb + onChange), a többi hívót nem érinti", () => {
  assert.match(component, /resetSignal\?:\s*number/);
  assert.match(component, /createJoystickDrag\(/);
  assert.match(component, /\.reset\(\)/);
  assert.match(component, /\[\s*resetSignal\b/, "the reset effect runs on the signal");
});

test("a Tornado blur/visibilitychange-kor a tárcsának is reset-jelet ad", () => {
  assert.match(page, /setTouchReset\(\s*\(n\)\s*=>\s*n\s*\+\s*1\s*\)/);
  assert.match(page, /resetSignal=\{\s*props\.resetSignal\s*\}/);
});
