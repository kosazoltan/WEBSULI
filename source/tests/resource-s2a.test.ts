import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { slimRun } from "../server/workflows/slim";
import { workflowDefinition, type WorkflowView } from "../shared/lesson-workflow";

/* Spec 2026-10-19-eroforras-s2a — mért: 11,6 GB kimenő forgalom egy 158 MB-os adatbázisból (okt. 1. óta). */

test("a futásnapló-lista eleme lépésnapló nélküli, a többi mező marad", () => {
  const view = { id: "r1", definition: workflowDefinition("html"), state: "running", createdAt: 1, updatedAt: 2, revision: 3, executions: 1,
    visits: [{ step: "source", attempt: 1, startedAt: 1, state: "done", cacheHits: 0 }], history: [{ state: "error", visits: [] }], resourceId: "x" } as unknown as WorkflowView;
  const slim = slimRun(view);
  assert.deepEqual(slim.visits, []);
  assert.equal(slim.history, undefined);
  assert.deepEqual([slim.id, slim.state, slim.createdAt, slim.definition.label, slim.resourceId, slim.executions], ["r1", "running", 1, view.definition.label, "x", 1]);
  assert.equal(view.visits.length, 1, "az eredeti nem változik");
});

test("a lista content nélkül, a képvégpont 304-e bájtolvasás nélkül, a nem használt fájlok törölve", () => {
  const storage = fs.readFileSync("server/storage.ts", "utf8");
  assert.match(storage, /const \{ content: _content, \.\.\.listColumns \} = getTableColumns\(improvedHtmlFiles\)/);
  assert.match(storage, /\.limit\(200\)/);
  const assets = fs.readFileSync("server/design-assets.ts", "utf8");
  assert.match(assets, /select\(\{ mime: designAssets\.mime, sha256: designAssets\.sha256 \}\)/);
  assert.ok(assets.indexOf("status(304)") < assets.indexOf("bytes: designAssets.bytes"), "a 304 a bájtok olvasása előtt");
  for (const f of ["christmas-bg.jpg", "christmas-bg.png", "hero-video.mp4"]) assert.equal(fs.existsSync(`client/public/${f}`), false, f);
});

// Review #325: a futáslista a lépésnaplót már az SQL-ben elhagyja; a kép fejlécei a bájtokkal együtt olvasott lenyomatból jönnek.
test("futáslista: SQL-szintű karcsúsítás; képvégpont: ETag a bájtokkal egy lekérdezésből", () => {
  const store = fs.readFileSync("server/workflows/store.ts", "utf8");
  assert.match(store, /snapshot - 'visits' - 'history'/);
  const assets = fs.readFileSync("server/design-assets.ts", "utf8");
  assert.match(assets, /sha256: designAssets\.sha256, bytes: designAssets\.bytes/);
  assert.match(assets, /res\.set\("ETag", `"\$\{row\.sha256\}"`\)/);
});
