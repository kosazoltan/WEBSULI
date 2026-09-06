import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #310 class: hooks after an early return crash the whole admin page.
 * The studio parse-guard covers studio/*.tsx only. The lint gate must
 * refuse the class everywhere — which requires eslint-plugin-react-hooks
 * to actually be imported, not just mentioned in a comment.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("package.json listázza az eslint-plugin-react-hooks-t", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  assert.ok(
    pkg.devDependencies?.["eslint-plugin-react-hooks"],
    "eslint-plugin-react-hooks missing from devDependencies",
  );
});

test("eslint.config.js importálja a plugint és rules-of-hooks error (kommentek nélkül)", () => {
  const src = stripComments(readFileSync(join(root, "eslint.config.js"), "utf8"));
  assert.match(src, /eslint-plugin-react-hooks/);
  assert.match(src, /react-hooks\/rules-of-hooks/);
  assert.match(src, /["']error["']/);
});

test("source/.npmrc legacy-peer-deps=true — npm ci ESLint 10 + hooks 5.x mellett", () => {
  const npmrc = readFileSync(join(root, ".npmrc"), "utf8");
  assert.match(npmrc, /^legacy-peer-deps\s*=\s*true\s*$/m);
});
