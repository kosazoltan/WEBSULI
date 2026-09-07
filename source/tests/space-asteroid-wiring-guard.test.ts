import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Physics lives in lib/spaceAsteroid/physics.ts. A green unit suite on the
 * helper is worthless if the 2400-line page still uses wall-clock spawn and
 * un-normalized WASD. Comment-stripping is mandatory (#183 class).
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/SpaceAsteroidQuiz.tsx"), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(page);

function countCalls(src: string, name: string): number {
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  return (src.match(re) ?? []).length;
}

test("a page hívja az integratePlayer / spawnReady / splitRock / starScrollY / enemyRenderSpin helper-eket", () => {
  for (const name of ["integratePlayer", "spawnReady", "splitRock", "starScrollY", "enemyRenderSpin"]) {
    assert.ok(countCalls(code, name) >= 1, `missing ${name}(`);
  }
});

test("a lefelé irány a vezérlésben is megvan", () => {
  // A teszt SZÁNDÉKA változatlan (volt egy hiba, amikor a lefelé irány
  // kimaradt), a mechanizmus viszont megváltozott: a négy nyílgombot joystick
  // váltotta, mert az átlós irány két gomb egyidejű nyomását követelte, ami egy
  // hüvelykujjal nem megy. A `startHold(..., "down")` helyett most a joystick
  // vektorát képezzük irányokra.
  assert.match(code, /touchRef[\s\S]{0,200}down/);
  assert.match(
    code,
    /touchRef\.current\.down\s*=/,
    "a lefelé irányt semmi nem állítja — a hajó nem tud hátrálni",
  );
  assert.match(code, /joystickToDirections\s*\(/, "a joystick nincs bekötve");
});

test("a komment-szűrő önellenőrzése: kikommentezett hívás nem számít", () => {
  const fake = `integratePlayer(p, i, dt);\n// integratePlayer(\n/* integratePlayer( */`;
  assert.equal(countCalls(stripComments(fake), "integratePlayer"), 1);
});
