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

// Spec 2026-11-10-gyartas-meres (J6): mérve élesben — a „done” haladásjelzés írása megelőzte a lezáró írást, és a lessonId elveszett.
test("J6: az írások futásonként sorban mennek — lassú korábbi írás mellett is az utolsó állapot marad", async () => {
  const { createRun, updateRun, progressPatch, __resetRunsForTest } = await import("../server/studio/one-step-progress");
  __resetRunsForTest();
  const db = new Map<string, { phase: string; lessonId: string | null }>();
  const order: string[] = [];
  let call = 0;
  const persist = async (run: { id: string; phase: string; lessonId: string | null }) => {
    const n = call++;
    // a KORÁBBI írások lassabbak, mint a későbbiek — sorrendtartás nélkül a régi pillanatkép írna utoljára
    await new Promise((r) => setTimeout(r, n === 0 ? 5 : n === 1 ? 40 : 1));
    order.push(`${run.phase}:${run.lessonId ?? "-"}`);
    db.set(run.id, { phase: run.phase, lessonId: run.lessonId });
  };
  const id = createRun(persist);
  updateRun(id, { phase: "done" }, persist); // a régi viselkedés: lezárás lecke nélkül
  updateRun(id, { phase: "done", lessonId: "lesson-1" }, persist);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(order, ["indul:-", "done:-", "done:lesson-1"], "a hívás sorrendjében");
  assert.deepEqual(db.get(id), { phase: "done", lessonId: "lesson-1" });

  // a hibás írás nem szakítja meg a láncot
  let fail = true;
  const flaky = async (run: { id: string; phase: string; lessonId: string | null }) => { if (fail) { fail = false; throw new Error("db"); } db.set(run.id, { phase: run.phase, lessonId: run.lessonId }); };
  const id2 = createRun(flaky);
  updateRun(id2, { phase: "author" }, flaky);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(db.get(id2), { phase: "author", lessonId: null });

  // a motor „done” jelzése nem zárja le a futást
  assert.deepEqual(progressPatch({ phase: "done", detail: "A tananyag elkészült és közzétéve.", mapId: "m", jobId: "j" }), { mapId: "m", jobId: "j" });
  assert.deepEqual(progressPatch({ phase: "lektor", detail: "Lektorálás (1. kör)…" }), { phase: "lektor", detail: "Lektorálás (1. kör)…" });
  assert.deepEqual(progressPatch({ phase: "author", detail: null, jobId: "j" }), { phase: "author", detail: null, jobId: "j" });
  __resetRunsForTest();
});

test("J6 — forrásőr: a haladás-visszahívások a progressPatch-et használják; a lekérdezés a jobból pótolja a leckét", async () => {
  const { readFileSync } = await import("node:fs");
  const routes = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  assert.equal(routes.match(/\(p\) => updateRun\(runId, progressPatch\(p\)\)/g)?.length, 3);
  assert.doesNotMatch(routes, /updateRun\(runId, \{ phase: p\.phase/);
  assert.match(routes, /run\.phase === "done" && !lessonId && run\.jobId/);
});
