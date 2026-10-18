import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { firstNameOf, pickDailyMaterial, reminderHtml, reminderSubject } from "../shared/daily-reminder";
import { isSchoolDay } from "../shared/school-calendar";

// Spec: docs/specs/2026-10-18-napi-emlekezteto.md
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("keresztnév magyar névsorrendben", () => {
  assert.equal(firstNameOf("Kósa Kristóf Máté"), "Kristóf");
  assert.equal(firstNameOf("  Kiss   Léna Szonja "), "Léna");
  assert.equal(firstNameOf("Dominik"), "Dominik");
});

test("a nap anyaga: az évfolyamról, tanmenet szerint, a mostanában küldöttek kimaradnak", () => {
  const files = [
    { id: "mult", title: "Szeptemberi", classroom: 5, curriculum: { pos: 0.05, label: "Szeptember" } },
    { id: "mai", title: "Mai téma", classroom: 5, curriculum: { pos: 0.19, label: "Törtek" } },
    { id: "kozelgo", title: "Novemberi", classroom: 5, curriculum: { pos: 0.27, label: "November" } },
    { id: "mas", title: "Másik évfolyam", classroom: 4, curriculum: { pos: 0.19, label: "x" } },
    { id: "illesztetlen", title: "Tanmenet nélkül", classroom: 5, createdAt: "2026-10-18T00:00:00Z", curriculum: null },
  ];
  const today = 0.18;
  assert.equal(pickDailyMaterial(files, 5, today, new Set())?.id, "mai");
  assert.equal(pickDailyMaterial(files, 5, today, new Set(["mai"]))?.id, "kozelgo", "a következő hetek előbb, mint az ismétlés");
  assert.equal(pickDailyMaterial(files, 5, today, new Set(["mai", "kozelgo", "mult"]))?.id, "illesztetlen");
  assert.equal(pickDailyMaterial(files, 5, today, new Set(files.map(f => f.id)))?.id, "mai", "minden szerepelt → a legközelebbi");
  assert.equal(pickDailyMaterial(files, 9, today, new Set()), null, "üres évfolyam");
});

test("tanítási nap: hétköznap igen; hétvége, őszi szünet és nyár nem", () => {
  assert.equal(isSchoolDay(new Date(2026, 9, 19)), true);
  assert.equal(isSchoolDay(new Date(2026, 9, 18)), false);
  assert.equal(isSchoolDay(new Date(2026, 9, 26)), false);
  assert.equal(isSchoolDay(new Date(2026, 6, 15)), false);
});

test("a levél: tárgy, köszönés, egy kattintásos link; a mezők escape-elve", () => {
  assert.equal(reminderSubject("Léna", "Törtek"), "Léna, a mai tananyagod: Törtek");
  const html = reminderHtml({ first: "Léna", title: "A <b>tört</b> & társai", topic: "Matematika 5.: Törtek", url: "https://websuli.vip/preview/abc", motivation: "Hajrá!" });
  assert.match(html, /Szia, Léna!/);
  assert.match(html, /A &lt;b&gt;tört&lt;\/b&gt; &amp; társai/);
  assert.match(html, /href="https:\/\/websuli\.vip\/preview\/abc"/);
  assert.match(html, /Megnyitom a tananyagot/);
  assert.doesNotMatch(html, /leiratkoz/i, "a tulajdonos döntése: nincs leiratkozás");
});

test("az ütemezés: tanítási napokon magyar idő szerint, csak éles környezetben; az index elindítja", () => {
  const src = read("server/daily-reminder.ts");
  assert.match(src, /cron\.schedule\("45 6 \* \* 1-5"[\s\S]*timezone: REMINDER_TIMEZONE/);
  assert.match(src, /REMINDER_TIMEZONE = "Europe\/Budapest"/);
  assert.match(src, /if \(process\.env\.NODE_ENV !== "production"\) return;/);
  assert.match(read("server/index.ts"), /setupDailyReminders\(\);/);
});

test("review #292: a napló nem tartalmaz tanulónevet és címet; futásszintű hiba HTTP-hibaként jelenik meg", () => {
  const src = read("server/daily-reminder.ts");
  assert.match(src, /sendAdminNotification\(subject, html, to, \{ quiet: true \}\)/);
  assert.doesNotMatch(src, /logger\.\w+\([^)]*(studentName|p\.email)/, "nincs név vagy cím a naplóhívásban");
  assert.match(src, /eq\(dailyReminderEmails\.status, "sent"\)/, "csak a kiküldött anyag számít ismétlésnek");
  const resend = read("server/resend.ts");
  assert.match(resend, /if \(opts\.quiet\) logger\.info\('\[RESEND\] Értesítés küldése \(címzett és tárgy a naplóban elrejtve\)'\)/);
  assert.match(read("server/routes.ts"), /res\.status\(result\.error \? 500 : 200\)/);
});

test("a tanmenet-téma emberi alakja: OH-kód és felesleges írásjelek nélkül", async () => {
  const { displayTopic } = await import("../shared/daily-reminder");
  assert.equal(displayTopic("Matematika 6. (OH-MAT06TA): EGÉSZ SZÁMOK — Összetett oszthatósági szabályok"), "Matematika 6.: EGÉSZ SZÁMOK — Összetett oszthatósági szabályok");
  assert.equal(displayTopic("Biológia 9. (OH-BIO09TB): Sejtek — . Anyagforgalom a sejtmembránon"), "Biológia 9.: Sejtek — Anyagforgalom a sejtmembránon");
  assert.equal(displayTopic("Történelem 5.: Az ókori Egyiptom világa"), "Történelem 5.: Az ókori Egyiptom világa");
  assert.equal(displayTopic(null), null);
  assert.equal(displayTopic("  "), null);
});

test("review #294: a valódi tanmenet-adat egyik tervcímében sem marad OH-kód", async () => {
  const { displayTopic } = await import("../shared/daily-reminder");
  const data = JSON.parse(read("server/data/tanmenet-2020.json")) as { plans: Array<{ title: string }> };
  const titles = data.plans.map(p => p.title).filter(t => t.includes("OH-"));
  assert.ok(titles.length > 100);
  const left = titles.map(t => displayTopic(`${t}: téma`)!).filter(t => /OH-/.test(t));
  assert.deepEqual(left, []);
  assert.equal(displayTopic("Etika 1. (OH-ETI01TA ): Én"), "Etika 1.: Én");
  assert.equal(displayTopic("Földrajz 9-10. I. rész (OH-FOL910TA/I): Térkép"), "Földrajz 9-10. I. rész: Térkép");
  assert.equal(displayTopic("Földrajz 10. (OH-FOL910TA_II): Gazdaság"), "Földrajz 10.: Gazdaság");
});
