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
