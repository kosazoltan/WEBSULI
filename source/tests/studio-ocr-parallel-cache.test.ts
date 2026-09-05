import assert from "node:assert/strict";
import test from "node:test";

import { ocrTextsOf, withOcrCache, ocrCacheKeyOf } from "../server/studio/ocr";
import type { ExtractorFile } from "../server/studio/extractor";

/**
 * #170 — az OCR gyökér-oka: 10 kép szekvenciálisan, képenként 40-90 s, egyetlen
 * törékeny async-láncban (Render-restart mindent elveszített, minden kép újra
 * fizetve). Új megközelítés: párhuzamos pool + tartalom-hash átirat-cache.
 */

const img = (n: string): ExtractorFile => ({ name: n, kind: "image", content: `data:image/jpeg;base64,${n}` });

test("párhuzamos pool: sorrend tartva, tényleges konkurencia > 1, progress darabszámmal", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const progress: number[] = [];
  const slowOcr = async (file: ExtractorFile) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 30));
    inFlight--;
    return `T(${file.name})`;
  };
  const out = await ocrTextsOf(
    [img("a"), img("b"), img("c"), img("d"), img("e")],
    slowOcr,
    (done, total) => progress.push(done * 100 + total),
  );
  assert.deepEqual(
    out.map((o) => o.text),
    ["T(a)", "T(b)", "T(c)", "T(d)", "T(e)"],
    "a kimenet a bemenet sorrendjében van",
  );
  assert.ok(maxInFlight > 1, `a hívások párhuzamosan futnak (max in-flight: ${maxInFlight})`);
  assert.equal(progress.at(-1), 505, "a progress a kész darabszámot jelenti (5/5)");
});

test("párhuzamos pool: egy bukó kép üres átirattal folytat, a többi megvan", async () => {
  const flaky = async (file: ExtractorFile) => {
    if (file.name === "b") throw new Error("model down");
    return `T(${file.name})`;
  };
  const out = await ocrTextsOf([img("a"), img("b"), img("c")], flaky);
  assert.deepEqual(
    out.map((o) => o.text),
    ["T(a)", "", "T(c)"],
  );
});

test("cache: találatnál NINCS modellhívás; miss hív és ment — restart után olcsó az újrafutás", async () => {
  const store = new Map<string, string>();
  let calls = 0;
  const ocr = async (file: ExtractorFile) => {
    calls++;
    return `T(${file.name})`;
  };
  const cached = withOcrCache(ocr, "test-model", {
    get: async (k) => store.get(k) ?? null,
    put: async (k, text) => void store.set(k, text),
  });

  assert.equal(await cached(img("a")), "T(a)");
  assert.equal(calls, 1);
  assert.equal(await cached(img("a")), "T(a)", "másodszor cache-ből");
  assert.equal(calls, 1, "nem volt új modellhívás");

  // üres átirat (bukott OCR) NEM kerül cache-be — következő futás újrapróbálja
  const empty = withOcrCache(async () => "", "test-model", {
    get: async (k) => store.get(k) ?? null,
    put: async (k, text) => void store.set(k, text),
  });
  await empty(img("x"));
  assert.equal(store.has(ocrCacheKeyOf(img("x").content, "test-model")), false, "üres átirat nincs cache-elve");
});

test("cache-kulcs: tartalom ÉS modell szerint különbözik", () => {
  const k1 = ocrCacheKeyOf("data:1", "m1");
  assert.equal(k1, ocrCacheKeyOf("data:1", "m1"), "determinista");
  assert.notEqual(k1, ocrCacheKeyOf("data:2", "m1"), "más kép, más kulcs");
  assert.notEqual(k1, ocrCacheKeyOf("data:1", "m2"), "más modell, más kulcs");
  assert.equal(k1.length, 64, "sha256 hex");
});
