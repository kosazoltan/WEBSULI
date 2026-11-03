import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- plain .mjs script without type declarations
import { checkNativeArch } from "../scripts/check-native-arch.mjs";

test("a natív függőségek az aktuális architektúrához települtek (ARM64 és x64)", () => {
  const { target, results } = checkNativeArch() as {
    target: string;
    results: { name: string; ok: boolean; detail: string }[];
  };
  assert.ok(results.length >= 4, `legalább 4 natív modul ellenőrzendő, van: ${results.length}`);
  for (const r of results) {
    assert.ok(r.ok, `${r.name} (${target}): ${r.detail} — javítás: npm ci a source/ mappában`);
  }
});
