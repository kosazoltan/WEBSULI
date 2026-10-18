import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLessonArt } from "../shared/lesson-art-compute";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";

// A meglévő leckék arculatának mentése (docs/specs/2026-10-18-arculat-backfill.md): a tiszta mag.
const all = new Set(DESIGN_ASSET_CATALOG.map(a => a.id));

test("a mag determinisztikus, a témaköri borítót választja, a kabala csak 1–5. évfolyamon; érvénytelen lecke: null", () => {
  const egy = computeLessonArt({ subject: "Történelem", classroom: 5, title: "Az ókori Egyiptom" }, "lecke-1", all);
  assert.deepEqual(egy, computeLessonArt({ subject: "Történelem", classroom: 5, title: "Az ókori Egyiptom" }, "lecke-1", all));
  assert.equal(egy?.topic, "okor");
  assert.match(egy?.picture ?? "", /^cover-tortenelem-adventure-okor/);
  const hat = computeLessonArt({ subject: "Matematika", classroom: 6, title: "Oszthatóság 3-mal és 9-cel" }, "lecke-2", all);
  assert.ok(hat && !hat.mascot, "6. évfolyamon nincs kabala");
  assert.equal(computeLessonArt({ subject: "Matematika", title: "x" }, "s", all), null);
});

test("csak az adatbázisban meglévő elemekből választ", () => {
  const none = computeLessonArt({ subject: "Matematika", classroom: 5, title: "Törtek" }, "s", new Set());
  assert.deepEqual(none, { topic: "tortek" }, "kép-azonosító nincs, csak a témakör (mint a korábbi withLessonArt-nál)");
});
