import { test } from "node:test";
import assert from "node:assert/strict";
import { alertPeriodKey, inactivityAlertEmail, isInactive, pendingAlertRecipients, weeklySummaryEmail, type LearnerReport } from "../shared/learner-report";

// docs/specs/2026-10-18-tanuloi-profil.md (S4): inaktivitás tanítási napokon, egy riasztás időszakonként, escape-elt levelek.
const weekdays = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };

test("inaktivitás: az utolsó 3 tanítási nap a hétvégén átível (hétfő → csütörtök)", () => {
  // 2026-10-19 hétfő: a 3 tanítási nap hétfő, péntek (16.), csütörtök (15.)
  assert.equal(isInactive("2026-10-14", "2026-10-19", weekdays), true);
  assert.equal(isInactive("2026-10-15", "2026-10-19", weekdays), false);
  assert.equal(isInactive("2026-10-19", "2026-10-19", weekdays), false);
  assert.equal(isInactive(null, "2026-10-19", weekdays), true, "soha nem aktív tanuló tanítási időben inaktív");
});

test("inaktivitás: szünetben (30 napon belül nincs 3 tanítási nap) nem riaszt", () => {
  assert.equal(isInactive(null, "2026-07-20", () => false), false);
  const onlyTwo = (iso: string) => iso === "2026-08-31" || iso === "2026-09-01";
  assert.equal(isInactive(null, "2026-09-01", onlyTwo), false);
});

// Review #304: címzettenkénti állapot — a kimaradt admin pótlódik, a már értesített nem kap duplikátumot; új időszak újraindít.
test("riasztás: időszakonként címzettenként egyszer; közbeni tevékenység után újra élesedik", () => {
  const admins = ["a@x.test", "b@x.test"];
  const period = alertPeriodKey(new Date("2026-10-14T10:00:00Z"));
  assert.equal(alertPeriodKey(null), "never");
  assert.deepEqual(pendingAlertRecipients(admins, period, { key: null, to: [] }), admins, "első riasztás: mindenki");
  assert.deepEqual(pendingAlertRecipients(admins, period, { key: period, to: ["a@x.test"] }), ["b@x.test"], "részleges hiba: csak a kimaradt");
  assert.deepEqual(pendingAlertRecipients(admins, period, { key: period, to: admins }), [], "már mindenki értesült");
  const later = alertPeriodKey(new Date("2026-10-20T10:00:00Z"));
  assert.deepEqual(pendingAlertRecipients(admins, later, { key: period, to: admins }), admins, "azóta tanult, majd újra elmaradt");
});

test("levelek: a név és a cím escape-elve; a tárgy névvel", () => {
  const r: LearnerReport = { name: "Teszt <b>Anna</b>", grade: 5, lastActive: "2026-10-17", activeDays7: 3, views7: 7,
    results: [{ title: "Törtek & <script>", percent: 92, at: "2026-10-17" }, { title: "Igék", percent: null, at: "2026-10-16" }] };
  const weekly = weeklySummaryEmail([r], "2026-10-12 – 2026-10-18");
  assert.ok(!weekly.html.includes("<script>") && !weekly.html.includes("<b>Anna</b>"));
  assert.match(weekly.html, /Törtek &amp; &lt;script&gt;: <strong>92%<\/strong>/);
  assert.match(weekly.html, /Igék: <strong>—<\/strong>/);
  const alert = inactivityAlertEmail(r);
  assert.equal(alert.subject, "[WebSuli] Teszt <b>Anna</b> 3 tanítási napja nem tanult");
  assert.ok(!alert.html.includes("<b>Anna</b>"));
});
