import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(page);

function countCalls(src: string, name: string): number {
  return (src.match(new RegExp(`\\b${name}\\s*\\(`, "g")) ?? []).length;
}

test("a play loop stepVehicle-t hív, nem a *60-as képletet", () => {
  assert.ok(countCalls(code, "stepVehicle") >= 1);
  assert.doesNotMatch(code, /fromKm\([^)]*\/\s*3600\)\s*\*\s*60/);
  assert.doesNotMatch(code, /acceleration\s*\*\s*0\.0016/);
});

test("a play loop readStandardGamepad-et hív (Steam Deck stick)", () => {
  assert.ok(countCalls(code, "readStandardGamepad") >= 1);
  assert.match(code, /getGamepads/);
});

test("review #610: a táblaválasztás a kibontott („Mutasd”) kérdés alatt tiltott — mint a közös kérdéskomponensben", () => {
  const i = code.indexOf("pointerTapHandlers(signTracker, i,");
  assert.ok(i > 0);
  const handler = code.slice(i, code.indexOf("qRef.current.pick(i)", i));
  assert.match(handler, /expandedRef\.current/, "a tábla-koppintás kezelője ellenőrzi a kibontást");
});

test("review #610: a menet lezárása kifuttatja a megoldás-kijelzést — az eredmény csak a settled() után", () => {
  const f = code.slice(code.indexOf("const finishRun = useCallback("), code.indexOf("const finishRunRef = useRef(finishRun)"));
  assert.match(f, /view\(\)\.reveal/, "a finishRun a futó megoldás-kijelzést felismeri");
  assert.match(f, /deferredFinishRef\.current\s*=/, "és a befejezést elhalasztja");
  assert.match(code, /deferredFinishRef\.current\s*!==\s*null\s*&&\s*qRef\.current\.settled\(\)/, "a képkocka a settled() után fejezi be");
  assert.match(code, /restartRef\.current = \(\) => \{[\s\S]{0,600}deferredFinishRef\.current = null/, "az újrakezdés törli a halasztást");
});

test("review #610: a „Miért?” / „Mutasd” olvasása alatt a játékóra (a horgonyzás utáni győzelmi időzítő is) áll", () => {
  assert.match(code, /const reading = [^;]*feedbackRef\.current[^;]*expandedRef\.current/, "olvasási állapot: Miért? vagy kibontás");
  assert.match(code, /if \(!halted && !reading\) \{\s*gameClockRef\.current \+= dt;/, "a játékóra olvasás alatt nem lép");
});
