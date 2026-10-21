import test from "node:test";
import assert from "node:assert/strict";
import { showQualityNotice } from "../server/lib/web-lesson-quality-notice";

/* Spec 2026-10-21-ciklus6b: a belső minőség-felirat csak adminnak (a tanulónak „teljesen oda nem illő”). */

test("ciklus6b: a minőség-felirat csak bejelentkezett adminnak jelenik meg", () => {
  assert.equal(showQualityNotice({ id: "u1", isAdmin: true }), true);
  assert.equal(showQualityNotice({ id: "u2", isAdmin: false }), false, "nem admin felhasználó");
  assert.equal(showQualityNotice(undefined), false, "névtelen / tanulói látogató");
  assert.equal(showQualityNotice(null), false);
});
