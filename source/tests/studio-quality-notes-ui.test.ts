import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("JobMonitor megjeleníti a qualityNotes mezőt (B5)", () => {
  const code = readFileSync(join(root, "client/src/components/studio/JobMonitor.tsx"), "utf8");
  assert.match(code, /qualityNotes/, "a monitor nem hivatkozik qualityNotes-ra");
  assert.match(code, /studio-quality-notes/, "a minőségi sáv data-testid-je hiányzik");
});

test("a jobs API válasz tartalmazza a qualityNotes mezőt", () => {
  const code = readFileSync(join(root, "server/studio/lesson-pipeline-routes.ts"), "utf8");
  assert.match(
    code,
    /qualityNotes:\s*Array\.isArray\(output\?\.qualityNotes\)/,
    "a GET /jobs/:id nem adja át a qualityNotes-t",
  );
});
