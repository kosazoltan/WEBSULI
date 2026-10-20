import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ImproveOutputError } from "../server/improveAsync";

/* Spec 2026-10-20-okositas-bukott-jelolt — mért: 1e169ace, a0d16870, f2c2f102 bukott jelöltje elveszett (csak a helyőrző maradt). */

test("az ImproveOutputError hordozza a bukott jelöltet és a hibalistát", () => {
  const e = new ImproveOutputError("kapu", 0, true, ["t1: hiba"], "<html>jelölt</html>");
  assert.equal(e.candidate, "<html>jelölt</html>");
  assert.deepEqual(e.problems, ["t1: hiba"]);
  assert.equal(new ImproveOutputError("x", 0, false).candidate, undefined);
});

test("a kapu bukása átadja a jelöltet, a hibaág `error` állapotban menti; az alkalmazás `error`-t nem enged", () => {
  const src = fs.readFileSync("server/improveAsync.ts", "utf8");
  assert.match(src, /verification\.problems\.join\(' '\)\}`, verification\.problems, improvedHtml\)/);
  const save = src.indexOf("updateImprovedHtmlFileContentAndStatus(dbRecordId, error.candidate, 'error')");
  const status = src.indexOf("updateImprovedHtmlFileStatus(dbRecordId, 'error', undefined, userMessage)");
  assert.ok(save > 0 && status > save, "előbb a jelölt, utána az üzenet");
  const storage = fs.readFileSync("server/storage.ts", "utf8");
  assert.match(storage, /if \(!\['pending', 'approved', 'applied'\]\.includes\(improved\.status\)\)/, "az alkalmazás státuszőre változatlan");
});
