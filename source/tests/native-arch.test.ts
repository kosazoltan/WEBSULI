import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  assert.match(output, /Natív függőségek — cél: (win32|linux|darwin)-(x64|arm64)/);
  assert.ok((output.match(/^OK {3}/gm) ?? []).length >= 4, `legalább 4 OK sor kell:\n${output}`);
});
