import test from "node:test";
import assert from "node:assert/strict";
import { qualityNoticeFor, showQualityNotice } from "../server/lib/web-lesson-quality-notice";
import { LEGACY_SCOPE_END, legacyCandidates, type LegacyRow } from "../server/studio/legacy-migration";

/* Spec 2026-10-21-ciklus6b (+ review #358): a belső minőség-felirat csak adminnak; a hatókör a döntés idején meglévő anyagokra szól. */

// Régi módszerverziójú HTML-anyag (mint az Odysseus): a felirat-döntés a route-ban használt függvénnyel.
const oldHtml = `<html><body><script id="websuli-lesson-data" type="application/json">{"experience":{"version":"fusion-7.4-2"}}</script></body></html>`;

test("ciklus6b: a minőség-felirat csak bejelentkezett adminnak jelenik meg (a /dev/:id route döntése)", () => {
  assert.equal(qualityNoticeFor({ id: "u1", isAdmin: true }, oldHtml)?.kind, "legacy", "admin: felirat");
  assert.equal(qualityNoticeFor({ id: "u2", isAdmin: false }, oldHtml), null, "nem admin felhasználó: nincs");
  assert.equal(qualityNoticeFor(undefined, oldHtml), null, "névtelen / tanulói látogató: nincs");
  assert.equal(showQualityNotice(null), false);
});

test("review #358: a hatókör felső határa — a döntés után feltöltött új HTML anyag nem alakul át magától", () => {
  const row = (over: Partial<LegacyRow>): LegacyRow => ({ id: "x", title: "Új anyag", contentType: "html", bytes: 70_000, createdAt: new Date("2026-09-12"), views: 1, hasMedia: false, ...over });
  const { queue } = legacyCandidates([
    row({ id: "szeptemberi" }),
    row({ id: "utana", createdAt: new Date(LEGACY_SCOPE_END.getTime() + 60_000) }),
  ], "all");
  assert.deepEqual(queue, ["szeptemberi"]);
  assert.equal(LEGACY_SCOPE_END.toISOString(), "2026-10-21T13:00:00.000Z", "a tulajdonosi döntés napja, Budapest szerint 15:00");
});
