import { test } from "node:test";
import assert from "node:assert/strict";

// Review #377 (docs/specs/2026-11-02-irodalmi-borito.md): a sikertelen induló képkészlet-szinkron a mentés előtt újrafut.

test("sikertelen induló szinkron után a mentés előtti várakozás egyszer újrafuttatja a szinkront", async () => {
  const { startDesignAssetSync, initialSyncSettled } = await import("../server/design-assets");
  let calls = 0;
  const run = () => (++calls === 1 ? Promise.reject(new Error("átmeneti DB-hiba")) : Promise.resolve({ written: 1, unchanged: 0, missing: [] }));
  startDesignAssetSync(run).catch(() => undefined);
  await initialSyncSettled(1000);
  assert.equal(calls, 2, "egy újrafutás");
  await initialSyncSettled(1000);
  assert.equal(calls, 2, "sikeres szinkron után nincs újabb futás");
});

test("sikeres induló szinkronnál nincs újrafutás", async () => {
  const { startDesignAssetSync, initialSyncSettled } = await import("../server/design-assets");
  let calls = 0;
  startDesignAssetSync(() => { calls++; return Promise.resolve({ written: 0, unchanged: 1, missing: [] }); });
  await initialSyncSettled(1000);
  assert.equal(calls, 1);
});

test("egyidejű mentések a sikertelen szinkron után egyetlen közös újrafutást várnak meg", async () => {
  const { startDesignAssetSync, initialSyncSettled } = await import("../server/design-assets");
  let calls = 0;
  const run = () => (++calls === 1 ? Promise.reject(new Error("átmeneti DB-hiba")) : new Promise<{ written: number; unchanged: number; missing: string[] }>(r => setTimeout(() => r({ written: 1, unchanged: 0, missing: [] }), 50)));
  startDesignAssetSync(run).catch(() => undefined);
  await Promise.all([initialSyncSettled(1000), initialSyncSettled(1000), initialSyncSettled(1000)]);
  assert.equal(calls, 2, "egy közös újrafutás");
});
