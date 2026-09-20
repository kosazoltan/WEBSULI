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

test("TouchControls mindig látszik — nincs sm:hidden, nincs hidden+coarse:flex", () => {
  const block = touchControlsBlock();
  assert.doesNotMatch(block, /\bsm:hidden\b/);
  assert.doesNotMatch(block, /\bmd:hidden\b/);
  assert.doesNotMatch(block, /\blg:hidden\b/);
  // `hidden coarse:flex` hides the bar on Steam Deck / mouse (pointer:fine).
  // Sibling games always render on-screen buttons; Tornado must too.
  assert.doesNotMatch(block, /(?:^|[\s"'`])hidden(?:[\s"'`]|$)/);
  assert.doesNotMatch(block, /coarse:flex/);
  assert.match(block, /(?:^|[\s"'`])flex(?:[\s"'`]|$)/);
});

/*
 * SPEC-VÁLTOZÁS 2026-09-20 (tulajdonosi utasítás, `docs/specs/2026-09-20-joystick-minden-jatekban.md`):
 * „Mindegyik vezérelhető játék vezérlését állítsd át az Asteroidban kialakított, köralakú,
 * joystick-szerű vezérlésre." A kormányzás ÉS a gyorsítás/fékezés is IRÁNY, ezért mindkettő a
 * tárcsára került; gombon csak a nem irányjellegű művelet marad (horgony, kamera). A követelmény
 * nem lazult: a lenti ellenőrzés a tárcsa MEGLÉTÉT és mind a négy irány bekötését is megköveteli,
 * ráadásul kizárja a régi irány-gombok visszaszivárgását.
 */
test("TouchControls: köralakú tárcsa vezet (mind a négy irány), gombon csak horgony és Cam", () => {
  const block = touchControlsBlock();
  assert.match(block, /<VirtualJoystick\b/, "nincs tárcsa a vezérlésben");
  assert.match(block, /joystickToDirections\s*\(/, "a tárcsa vektora nincs bekötve");
  for (const dir of ["left", "right", "fwd", "back"]) {
    assert.match(block, new RegExp(`touchRef\\.current\\.${dir}\\s*=\\s*dirs\\.`), `${dir} nincs a tárcsára kötve`);
  }
  assert.match(block, /label="⚓"/, "a horgony gomb marad");
  assert.match(block, /label="Cam"/, "a kamera gomb marad");
  for (const gone of ['label="Gáz"', 'label="Fék"', 'label="◀"', 'label="▶"']) {
    assert.ok(!block.includes(gone), `${gone} visszaszivárgott a tárcsa mellé`);
  }
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
