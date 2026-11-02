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
  // Review #366 (dokumentált spec-változás, docs/specs/2026-10-22-elmaradt-feladatok.md): az üzenet feltételes írása (a tulajdonos
  // leállítása megmarad) — a sorrend-követelmény változatlan: előbb a jelölt, utána az üzenet.
  const status = src.indexOf("failImprovedHtmlFileUnlessStopped(dbRecordId, userMessage, WORKFLOW_STOPPED_MESSAGE)");
  assert.ok(save > 0 && status > save, "előbb a jelölt, utána az üzenet");
  const storage = fs.readFileSync("server/storage.ts", "utf8");
  assert.match(storage, /if \(!\['pending', 'approved', 'applied'\]\.includes\(improved\.status\)\)/, "az alkalmazás státuszőre változatlan");
});

// Review #336: a jelölt nem felsorolható — a hibaobjektum naplózása / szerializálása nem viszi a nem publikált tartalmat.
test("a bukott jelölt nem kerül a hiba JSON-jába és felsorolásába", () => {
  const e = new ImproveOutputError("kapu", 0, true, [], "<html>titkos tartalom</html>");
  assert.equal(e.candidate, "<html>titkos tartalom</html>");
  assert.ok(!Object.keys(e).includes("candidate"));
  assert.doesNotMatch(JSON.stringify(e), /titkos tartalom/);
});

// Review #336: a 15 percen túli lekérdezés a közben hibára zárt rekordot NEM állítja `pending`-re a tartalma alapján.
test("időtúllépéses lekérdezés: az `error` friss állapot a válasz, a tartalomalapú helyreállítás csak `processing` rekordra fut", () => {
  const src = fs.readFileSync("server/improveAsync.ts", "utf8");
  const guard = src.indexOf("if (freshRecord.status === 'error') {");
  const recover = src.indexOf("const hasValidContent = contentLength > 200");
  assert.ok(guard > 0 && recover > guard);
  const block = src.slice(src.indexOf("if (freshRecord && freshRecord.status !== 'processing') {"), recover);
  assert.match(block, /return res\.json\(\{ status: 'completed', elapsed, improvedFile/, "minden nem-processing ág visszatér a helyreállítás előtt");
});
