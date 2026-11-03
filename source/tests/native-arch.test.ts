import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBES = ["esbuild", "tsx", "tsx/esbuild", "rollup", "sharp", "better-sqlite3"];

// The checker runs in its own process: loading every native module inside the test runner's child crashed it
// silently on the Windows CI runner (no TAP output, exit 1), while the same check as a process passed (PR #391).
test("a natív függőségek az aktuális architektúrához települtek (ARM64 és x64)", () => {
  const run = spawnSync(process.execPath, [path.join(sourceDir, "scripts/check-native-arch.mjs")], {
    cwd: sourceDir,
    encoding: "utf8",
    timeout: 60_000,
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  assert.equal(run.status, 0, `doctor:arch kilépési kód ${run.status} (${run.signal ?? "nincs jel"}):\n${output}`);
  // The reported target must be this runtime's, and every probe must be present and OK (review #392).
  const lines = output.split(/\r?\n/);
  assert.ok(lines.includes(`Natív függőségek — cél: ${process.platform}-${process.arch}`), `rossz vagy hiányzó cél:\n${output}`);
  for (const name of PROBES) {
    assert.ok(lines.some((line) => line.startsWith(`OK   ${name} — `)), `${name} nem OK:\n${output}`);
  }
});
