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
