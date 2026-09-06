import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Audit #4/#5/#6/#8 — wiring that a unit suite on pure helpers cannot see:
 * one coupon hook, a real C-key case, timeout cleanup, a camera touch button.
 *
 * Comment-stripping is mandatory: a `// useCouponSession(` match is a lying gate
 * (measured #183).
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8");

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

test("pontosan egy useCouponSession() hívás van (kommentek nélkül)", () => {
  assert.equal(countCalls(code, "useCouponSession"), 1);
});

test("a keydown tartalmazza a case \"c\" kameraváltást", () => {
  assert.match(code, /case\s+["']c["']\s*:/);
});

test("a PlayScreen unmount timeout-okat töröl (timeoutsRef + clearTimeout)", () => {
  assert.match(code, /timeoutsRef/);
  assert.match(code, /clearTimeout/);
});

test("TouchControls kamera-gombot kap (onCamera)", () => {
  assert.match(code, /onCamera/);
});

test("a komment-szűrő önellenőrzése: a kikommentezett hívás nem számít", () => {
  const fake = `const a = useCouponSession();\n// useCouponSession(\n/* useCouponSession( */`;
  assert.equal(countCalls(stripComments(fake), "useCouponSession"), 1);
});
