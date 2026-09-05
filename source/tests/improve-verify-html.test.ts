import assert from "node:assert/strict";
import test from "node:test";

import { verifyImprovedHtml } from "../server/improve/verify-html";

/**
 * #159 — the fail-closed verifier at the END of the improve pipeline.
 *
 * Measured root cause (hőtan, 2026-09-05): a truncated AI output (no </html>,
 * JS cut mid-line) was saved and APPLIED — the old validation only checked
 * length>100 and '<html'. The IIFE never ran, window.showTab never existed,
 * every tab button was dead. This verifier rejects exactly that class.
 */

const GOOD = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"></head><body>
<nav><button onclick="fo_showTab('p1')">Tananyag</button><button onclick="fo_showTab('p2')">Módszerek</button>
<button onclick="fo_showTab('p3')">Feladatok</button><button onclick="fo_showTab('p4')">Kvíz</button></nav>
<textarea></textarea>
<script>(function(){'use strict';
var quizBank=[{q:'K1?',opts:['a','b','c'],correct:0},{q:'K2?',opts:['a','b','c'],correct:1}];
window.fo_showTab=function(id){};
})();</script></body></html>`;

test("verify: a jó HTML átmegy", () => {
  const out = verifyImprovedHtml(GOOD);
  assert.equal(out.ok, true);
  assert.deepEqual(out.problems, []);
});

test("verify: hiányzó </html> = csonka kimenet, elutasítva", () => {
  // CSAK a záró </html> hiányzik — minden más ép: ez izoláltan a lezárás-őrt fogja.
  const truncated = GOOD.replace("</html>", "");
  const out = verifyImprovedHtml(truncated);
  assert.equal(out.ok, false);
  assert.match(out.problems.join("; "), /<\/html>/i);
});

test("verify: szintaktikailag hibás JS elutasítva (a halott gombok oka)", () => {
  const brokenJs = GOOD.replace("})();</script>", "if (x {</script>");
  const out = verifyImprovedHtml(brokenJs);
  assert.equal(out.ok, false);
  assert.match(out.problems.join("; "), /JavaScript/i);
});

test("verify: onclick-hivatkozott függvény window-export nélkül elutasítva", () => {
  const noExport = GOOD.replace("window.fo_showTab=function(id){};", "");
  const out = verifyImprovedHtml(noExport);
  assert.equal(out.ok, false);
  assert.match(out.problems.join("; "), /fo_showTab/);
});

test("verify: natív alert a kész anyagban elutasítva", () => {
  const withAlert = GOOD.replace("window.fo_showTab=function(id){};", "window.fo_showTab=function(id){alert('x');};");
  const out = verifyImprovedHtml(withAlert);
  assert.equal(out.ok, false);
  assert.match(out.problems.join("; "), /alert/i);
});

test("verify: a problémalista magyarul nevezi meg az összes hibát", () => {
  const out = verifyImprovedHtml("<div>semmi</div>");
  assert.equal(out.ok, false);
  assert.ok(out.problems.length >= 2, "several problems named");
});
