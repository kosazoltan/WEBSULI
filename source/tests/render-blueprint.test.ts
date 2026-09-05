import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Audit 2026-09-05 (szelet D) — render.yaml build guard.
 *
 * `(npm run db:migrate || echo MIGRATE_SKIPPED)` swallowed REAL migration failures (bad
 * SQL, lock timeout, connection error) exactly like "nothing to apply": the service then
 * booted on a stale schema and Studio features failed at request time. migrate.ts is
 * idempotent and exits 0 when everything is applied, so the `||` bought nothing but
 * silence. `npm install` also ignored package-lock.json (CI uses `npm ci`).
 */

const yaml = readFileSync(
  new URL("../../render.yaml", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "utf8",
);
const build = yaml.split("\n").find((l) => l.includes("buildCommand:")) ?? "";

test("render.yaml: a migráció hibája buktatja a buildet (nincs '|| echo')", () => {
  assert.ok(build.includes("npm run db:migrate"), "db:migrate a buildben");
  assert.doesNotMatch(build, /db:migrate\s*\|\|/, "a migráció-hiba nem nyelhető el");
  assert.doesNotMatch(build, /MIGRATE_SKIPPED/);
});

test("render.yaml: reprodukálható telepítés (npm ci, nem npm install)", () => {
  assert.match(build, /npm ci\b/);
  assert.doesNotMatch(build, /npm install\b/);
});

test("render.yaml: a migráció a build ELŐTT fut, a start nem migrál", () => {
  assert.ok(build.indexOf("db:migrate") < build.indexOf("npm run build"));
  const start = yaml.split("\n").find((l) => l.includes("startCommand:")) ?? "";
  assert.doesNotMatch(start, /migrate/);
});
