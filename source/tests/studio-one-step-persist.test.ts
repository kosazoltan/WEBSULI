import assert from "node:assert/strict";
import test from "node:test";

import {
  createRun,
  getRun,
  updateRun,
  markOrphanedRuns,
  __resetRunsForTest,
} from "../server/studio/one-step-progress";

/**
 * #168 — a Render menet közbeni újraindulása elveszítette az in-memory futást:
 * a jelző örökre "Kép átírása: 8/10"-en ragadt. A futás-státusz mostantól
 * DB-be is íródik (injektált persist-függvényeken át), és boot-kor az árván
 * maradt futások explicit hibára záródnak — néma beragadás nincs többé.
 */

test("persist-hook: create és update kiírja a sort (fire-and-forget)", async () => {
  __resetRunsForTest();
  const writes: Array<{ id: string; phase: string }> = [];
  const persist = async (run: { id: string; phase: string }) => {
    writes.push({ id: run.id, phase: run.phase });
  };
  const id = createRun(persist);
  updateRun(id, { phase: "ocr", detail: "Kép átírása: 1/10" }, persist);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(writes.some((w) => w.id === id && w.phase === "indul"), "create perzisztálva");
  assert.ok(writes.some((w) => w.id === id && w.phase === "ocr"), "update perzisztálva");
});

test("getRun: memóriában nem lévő futás a DB-loaderből jön vissza", async () => {
  __resetRunsForTest();
  const stored = {
    id: "run-a",
    phase: "author" as const,
    detail: null,
    error: null,
    mapId: "m1",
    jobId: "j1",
    lessonId: null,
    startedAt: 1,
    updatedAt: 2,
  };
  const load = async (id: string) => (id === "run-a" ? stored : null);
  assert.deepEqual(await getRun("run-a", load), stored, "restart után is válaszol a poll");
  assert.equal(await getRun("nincs", load), null);
});

test("markOrphanedRuns: a futó fázisú sorok hibára záródnak, a készek nem", () => {
  const rows = [
    { id: "r1", phase: "ocr" },
    { id: "r2", phase: "done" },
    { id: "r3", phase: "author" },
    { id: "r4", phase: "error" },
  ];
  const orphans = markOrphanedRuns(rows);
  assert.deepEqual(
    orphans.map((o) => o.id),
    ["r1", "r3"],
    "csak a nem-lezárt futások árvák",
  );
  assert.ok(orphans[0].error.includes("újraindult"), "a hibaüzenet megmondja az okot");
});
