import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { dailyReminderEmails, extraEmailAddresses, htmlFiles } from "../shared/schema";

// Napi tananyag-emlékeztető (docs/specs/2026-10-18-napi-emlekezteto.md) — eldobható Postgresben.
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { runDailyReminders, planDailyReminders, setReminderSender } = await import("../server/daily-reminder");

const sent: Array<{ subject: string; html: string; to: string }> = [];
let failOnce = new Set<string>();
setReminderSender(async (subject, html, to) => {
  if (failOnce.has(to)) { failOnce.delete(to); throw new Error("átmeneti hiba"); }
  sent.push({ subject, html, to });
});

// Egy elszigetelt évfolyam (11.), hogy a többi integrációs teszt anyagai ne zavarjanak.
const GRADE = 11;
const MONDAY = new Date("2026-10-19T05:00:00Z"); // 7:00 Budapest, tanítási nap
const TUESDAY = new Date("2026-10-20T05:00:00Z");
const SATURDAY = new Date("2026-10-17T05:00:00Z");

before(async () => {
  await db.insert(htmlFiles).values([
    { id: "rem-a", title: "Reminder próba A anyag", content: "<p>A</p>", classroom: GRADE, createdAt: new Date("2026-10-10T10:00:00Z") },
    { id: "rem-b", title: "Reminder próba B anyag", content: "<p>B</p>", classroom: GRADE, createdAt: new Date("2026-10-05T10:00:00Z") },
  ]);
  await db.insert(extraEmailAddresses).values([
    { email: "tanulo-egy@example.test", classrooms: [GRADE], studentName: "Próba Péter Pál" },
    { email: "tanulo-ketto@example.test", classrooms: [GRADE], studentName: "Teszt Anna" },
    { email: "szulo@example.test", classrooms: [GRADE, 5] },
    { email: "inaktiv@example.test", classrooms: [GRADE], studentName: "Inaktív Imre", isActive: false },
  ]);
});
after(async () => { setReminderSender(null); await dbPool.end(); });

test("tanítási napon a nevesített, aktív címek kapnak egy-egy levelet a mai anyaggal; másodszor nem", async () => {
  const plan = await planDailyReminders(MONDAY);
  assert.deepEqual(plan.map(p => p.email).sort(), ["tanulo-egy@example.test", "tanulo-ketto@example.test"]);
  assert.ok(plan.every(p => p.materialId === "rem-a" && p.url.endsWith("/preview/rem-a")), "tanmenet nélkül a legújabb");
  const first = await runDailyReminders(MONDAY, { pauseMs: 0 });
  assert.deepEqual({ sent: first.sent, failed: first.failed, duplicate: first.duplicate }, { sent: 2, failed: 0, duplicate: 0 });
  const peter = sent.find(m => m.to === "tanulo-egy@example.test")!;
  assert.match(peter.subject, /^Péter, a mai tananyagod: Reminder próba A anyag$/);
  assert.match(peter.html, /Szia, Péter!/);
  assert.match(peter.html, /href="[^"]*\/preview\/rem-a"/);
  const again = await runDailyReminders(MONDAY, { pauseMs: 0 });
  assert.deepEqual({ sent: again.sent, duplicate: again.duplicate }, { sent: 0, duplicate: 2 }, "ugyanaznap nincs második levél");
  assert.equal(sent.length, 2);
});

test("másnap a már kiküldött anyag helyett a következő jön; hétvégén nincs levél", async () => {
  sent.length = 0;
  const tuesday = await runDailyReminders(TUESDAY, { pauseMs: 0 });
  assert.equal(tuesday.sent, 2);
  assert.ok(sent.every(m => m.html.includes("/preview/rem-b")), "a hétfői anyag nem ismétlődik");
  sent.length = 0;
  const saturday = await runDailyReminders(SATURDAY, { pauseMs: 0 });
  assert.equal(saturday.skipped, "nem tanítási nap");
  assert.equal(sent.length, 0);
});

test("a sikertelen küldés aznap egyszer újrapróbálható, utána már nem duplikál", async () => {
  sent.length = 0;
  const wednesday = new Date("2026-10-21T05:00:00Z");
  failOnce = new Set(["tanulo-ketto@example.test"]);
  const firstRun = await runDailyReminders(wednesday, { pauseMs: 0 });
  assert.deepEqual({ sent: firstRun.sent, failed: firstRun.failed }, { sent: 1, failed: 1 });
  const [row] = await db.select().from(dailyReminderEmails).where(eq(dailyReminderEmails.email, "tanulo-ketto@example.test")).orderBy(dailyReminderEmails.day);
  assert.ok(row);
  const retry = await runDailyReminders(wednesday, { pauseMs: 0 });
  assert.deepEqual({ sent: retry.sent, duplicate: retry.duplicate }, { sent: 1, duplicate: 1 });
  assert.deepEqual(sent.map(m => m.to).sort(), ["tanulo-egy@example.test", "tanulo-ketto@example.test"]);
});
