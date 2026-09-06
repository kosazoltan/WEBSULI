import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * D1 — phone cannot steer Tornado Hunter.
 *
 * Root cause (measured): TouchControls used `sm:hidden`, so any viewport
 * ≥640px (every phone in landscape) hid the bar. The canvas is `touch-none`,
 * so there is no fallback joystick. Comment-stripping is mandatory (#183).
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(page);

function touchControlsBlock(): string {
  const start = code.indexOf("function TouchControls");
  assert.ok(start >= 0, "TouchControls missing");
  const end = code.indexOf("function TouchBtn", start);
  assert.ok(end > start, "TouchBtn missing after TouchControls");
  return code.slice(start, end);
}

test("TouchControls NEM sm:hidden / md:hidden — landscape telefonon is látszik", () => {
  const block = touchControlsBlock();
  assert.doesNotMatch(block, /\bsm:hidden\b/);
  assert.doesNotMatch(block, /\bmd:hidden\b/);
  assert.doesNotMatch(block, /\blg:hidden\b/);
  // Hide on mouse (pointer:fine), show on touch (pointer:coarse). Width
  // breakpoints hid every landscape phone; pointer media does not.
  assert.match(block, /(?:^|[\s"'`])coarse:flex/);
});

test("TouchControls overlay a vásznon (absolute + z-index), nem flex-testvér ami összenyomódik", () => {
  const block = touchControlsBlock();
  assert.match(block, /\babsolute\b/);
  assert.match(block, /\bz-\[?[0-9]/);
});

test("a play-canvas touch-none marad — a gombok kapják a pointert, nem a WebGL", () => {
  assert.match(code, /canvas[^>]{0,80}touch-none/);
});

test("a komment-szűrő önellenőrzése: sm:hidden kommentben nem számít", () => {
  const fake = `function TouchControls() {\n  return <div className="absolute z-20">ok</div>;\n}\n// sm:hidden\n`;
  const stripped = stripComments(fake);
  assert.doesNotMatch(stripped, /\bsm:hidden\b/);
});
