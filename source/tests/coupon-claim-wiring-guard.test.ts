import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The coupon HUD is mounted on every coupon game, but claimBonus was only
 * wired in Tornado Hunter. A green unit suite on the hook itself cannot see
 * that the four other pages never call it.
 *
 * Comment-stripping is mandatory: a `// maybeClaimCouponBonus(` match is a
 * lying gate (measured #183).
 */

const root = fileURLToPath(new URL("..", import.meta.url));

const COUPON_PAGES = [
  "client/src/pages/TsunamiEscapeEnglish.tsx",
  "client/src/pages/BrainRotSteal.tsx",
  "client/src/pages/SpaceAsteroidQuiz.tsx",
  "client/src/pages/BlockCraftQuiz.tsx",
  "client/src/pages/TornadoHunter200.tsx",
] as const;

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function countCalls(src: string, name: string): number {
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  return (src.match(re) ?? []).length;
}

for (const rel of COUPON_PAGES) {
  test(`${rel} hívja a maybeClaimCouponBonus-t (kommentek nélkül)`, () => {
    const code = stripComments(readFileSync(join(root, rel), "utf8"));
    assert.ok(
      countCalls(code, "maybeClaimCouponBonus") >= 1,
      `${rel} missing maybeClaimCouponBonus(`,
    );
  });
}

test("a komment-szűrő önellenőrzése: a kikommentezett hívás nem számít", () => {
  const fake = `maybeClaimCouponBonus(c, id);\n// maybeClaimCouponBonus(\n/* maybeClaimCouponBonus( */`;
  assert.equal(countCalls(stripComments(fake), "maybeClaimCouponBonus"), 1);
});
