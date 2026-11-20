import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Terv R33 (PR #510, review 4642333294): a pool lezárása előtti ürítések párhuzamosan, a közös határidőn belül — a soros várakozások
 * (270 + 3 + 10 + 15 + 15 s) túllépték a 295 s-os kényszerleállítást, és a „félbehagyva” levelek ürítése kimaradhatott.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("R33: az ürítések párhuzamosan futnak — az összidő a leghosszabb, nem az összeg", async () => {
  const { runShutdownFlushes } = await import("../server/shutdown-flush");
  const started: string[] = [];
  const t0 = Date.now();
  await runShutdownFlushes([
    { name: "a", maxMs: 2000, run: async () => { started.push("a"); await sleep(300); } },
    { name: "b", maxMs: 2000, run: async () => { started.push("b"); await sleep(300); } },
    { name: "c", maxMs: 2000, run: async () => { started.push("c"); await sleep(300); } },
  ], 5000, () => {});
  const took = Date.now() - t0;
  assert.deepEqual(started, ["a", "b", "c"]);
  assert.ok(took < 750, `párhuzamos (${took} ms; sorosan ~900 ms lenne)`);
});

test("R33: a lefagyott ürítés a saját korlátja és a közös keret közül a kisebbiknél elengedődik; a hiba nem akasztja meg a többit", async () => {
  const { runShutdownFlushes } = await import("../server/shutdown-flush");
  const errors: string[] = [];
  let finished = false;
  const t0 = Date.now();
  await runShutdownFlushes([
    { name: "lefagy", maxMs: 10_000, run: () => new Promise(() => {}) },
    { name: "hibas", maxMs: 10_000, run: async () => { throw new Error("x"); } },
    { name: "rendes", maxMs: 10_000, run: async () => { await sleep(50); finished = true; } },
  ], 250, name => errors.push(name));
  const took = Date.now() - t0;
  assert.ok(took >= 200 && took < 700, `a közös keret (250 ms) köti (${took} ms)`);
  assert.deepEqual(errors, ["hibas"]);
  assert.equal(finished, true);
  const t1 = Date.now();
  await runShutdownFlushes([{ name: "lefagy", maxMs: 150, run: () => new Promise(() => {}) }], 10_000, () => {});
  assert.ok(Date.now() - t1 < 600, "a feladat saját korlátja is köt");
  // Elfogyott keretnél nem vár.
  const t2 = Date.now();
  await runShutdownFlushes([{ name: "lefagy", maxMs: 10_000, run: () => new Promise(() => {}) }], -5, () => {});
  assert.ok(Date.now() - t2 < 200);
});

test("R33: a leállítás a három ürítést együtt, a 295 s-os határidőből számolt kerettel futtatja", () => {
  const source = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  assert.match(source, /const FORCE_EXIT_MS = 295_000;/);
  assert.match(source, /await runShutdownFlushes\(\[/);
  assert.match(source, /FORCE_EXIT_MS - \(Date\.now\(\) - shutdownStartedAt\) - SHUTDOWN_POOL_RESERVE_MS/);
  for (const name of ["flushPendingMaterialResults", "pendingNewLessonNotifications", "flushPendingPartials"]) assert.match(source, new RegExp(name));
  // A sorosan egymás után várt ürítések megszűntek.
  assert.doesNotMatch(source, /await Promise\.race\(\[flushPendingMaterialResults\(\)/);
});
