import assert from "node:assert/strict";
import test from "node:test";

import { runShutdownFlushes } from "../server/shutdown-flush";

/** B6 / R33 (docs/specs/2026-11-25-eredmeny-email-b6.md 4. pont): a leállítás ürítései párhuzamosan, korlátosan. */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

test("B6 / R33: az ürítések egyszerre indulnak (a teljes idő ≈ a leghosszabb, nem az összeg)", async () => {
  const started: string[] = [];
  const t0 = Date.now();
  await runShutdownFlushes([
    { name: "a", maxMs: 5000, run: async () => { started.push("a"); await sleep(300); } },
    { name: "b", maxMs: 5000, run: async () => { started.push("b"); await sleep(300); } },
    { name: "c", maxMs: 5000, run: async () => { started.push("c"); await sleep(300); } },
  ], 10_000, () => {});
  const took = Date.now() - t0;
  assert.deepEqual(started.sort(), ["a", "b", "c"]);
  assert.ok(took < 800, `párhuzamos: ${took} ms`);
});

test("B6 / R33: a saját felső korlát és a közös keret közül a kisebbik", async () => {
  let t0 = Date.now();
  await runShutdownFlushes([{ name: "lassú", maxMs: 200, run: () => sleep(5000) }], 10_000, () => {});
  assert.ok(Date.now() - t0 < 1000, "a saját korlát (200 ms) vág");
  t0 = Date.now();
  await runShutdownFlushes([{ name: "lassú", maxMs: 10_000, run: () => sleep(5000) }], 200, () => {});
  assert.ok(Date.now() - t0 < 1000, "a közös keret (200 ms) vág");
  t0 = Date.now();
  await runShutdownFlushes([{ name: "x", maxMs: 10_000, run: () => sleep(5000) }], -5, () => {});
  assert.ok(Date.now() - t0 < 500, "negatív keret = azonnal");
});

test("B6 / E49: az egyik hibája nem akasztja meg a többit, és a függvény nem dob", async () => {
  const errors: string[] = [];
  let ran = false;
  await runShutdownFlushes([
    { name: "rossz", maxMs: 1000, run: () => { throw new Error("szinkron hiba"); } },
    { name: "rossz2", maxMs: 1000, run: async () => { throw new Error("aszinkron hiba"); } },
    { name: "jó", maxMs: 1000, run: async () => { await sleep(50); ran = true; } },
  ], 5000, name => errors.push(name));
  assert.equal(ran, true);
  assert.deepEqual(errors.sort(), ["rossz", "rossz2"]);
});
