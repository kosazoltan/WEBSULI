import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Review #147: a lefutott célzott fedettségi kör üres eredménnyel is „coverage” megfigyelés (spec 31–32. sor).
const src = readFileSync(new URL("../server/studio/run-extraction.ts", import.meta.url), "utf8");

test("a célzott fájlonkénti kör lefutása önmagában is rögzíti a coverage megfigyelést", () => {
  assert.match(src, /targetedCoverage\s*=\s*true/);
  assert.match(src, /if \(covered\.length > valid\.length \|\| targetedCoverage\) await workflowFinding\("coverage"\)/);
});
