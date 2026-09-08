/**
 * D1 — game test hooks must stay behind VITE_ENABLE_GAME_TEST_HOOKS.
 *
 * After `build:e2e` the hooks ARE in dist (that is intentional). The production
 * gate is the compile-time string compare; optionally assert a production
 * `npm run build` output with WEBSULI_CHECK_PROD_BUNDLE=1.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOOKS_SRC = join(process.cwd(), "client", "src", "game-engine", "game-test-hooks.ts");
const PKG = join(process.cwd(), "package.json");
const DIST = join(process.cwd(), "dist", "public", "assets");

describe("game test hooks production gate (D1)", () => {
  it("source gates install on VITE_ENABLE_GAME_TEST_HOOKS === \"1\"", () => {
    const src = readFileSync(HOOKS_SRC, "utf8");
    assert.match(src, /VITE_ENABLE_GAME_TEST_HOOKS\s*===\s*"1"/);
    assert.match(src, /__websuliGame/);
  });

  it("build:e2e enables the hook flag", () => {
    const pkg = JSON.parse(readFileSync(PKG, "utf8")) as { scripts: Record<string, string> };
    assert.match(pkg.scripts["build:e2e"] ?? "", /VITE_ENABLE_GAME_TEST_HOOKS=1/);
  });

  it("optional: production dist must not contain __websuliGame", () => {
    if (process.env.WEBSULI_CHECK_PROD_BUNDLE !== "1") {
      assert.ok(true);
      return;
    }
    assert.ok(existsSync(DIST), "dist/public/assets missing — run npm run build first");
    const files = readdirSync(DIST).filter((f) => f.endsWith(".js"));
    assert.ok(files.length > 0);
    for (const f of files) {
      const src = readFileSync(join(DIST, f), "utf8");
      assert.equal(src.includes("__websuliGame"), false, `${f} leaked __websuliGame`);
    }
  });
});
