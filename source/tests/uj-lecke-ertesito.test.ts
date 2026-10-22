import test from "node:test";
import assert from "node:assert/strict";
import { NEW_LESSON_FOOTER, NEW_LESSON_LABEL, newLessonRecipients, newLessonSubject, reminderHtml, repeatOnlyPlan } from "../shared/daily-reminder";

/* Spec 2026-10-22-uj-lecke-ertesito. */

test("az ütemezett reggeli levél csak az ismétlést küldi", () => {
  const plan = [
    { email: "a@x.hu", materialId: "m1" },
    { email: "b@x.hu", materialId: "m2", repeatPercent: 55 },
    { email: "c@x.hu", materialId: "m3", repeatPercent: 0 },
  ];
  assert.deepEqual(repeatOnlyPlan(plan).map((p) => p.email), ["b@x.hu", "c@x.hu"]);
  assert.deepEqual(repeatOnlyPlan<{ email: string; repeatPercent?: number }>([{ email: "a@x.hu" }]), []);
});

test("az új lecke címzettjei: aktív, nevesített tanulói cím az évfolyamon", () => {
  const rows = [
    { email: "hat@x.hu", studentName: "Minta Bence", isActive: true, classrooms: [6] },
    { email: "hat2@x.hu", studentName: "Minta Bence", isActive: true, classrooms: [6] },
    { email: "ot@x.hu", studentName: "Próba Lili", isActive: true, classrooms: [5] },
    { email: "szulo@x.hu", studentName: null, isActive: true, classrooms: [5, 6, 7] },
    { email: "ures@x.hu", studentName: "  ", isActive: true, classrooms: [6] },
    { email: "inaktiv@x.hu", studentName: "Régi Anna", isActive: false, classrooms: [6] },
  ];
  assert.deepEqual(newLessonRecipients(rows, 6).map((r) => r.email), ["hat@x.hu", "hat2@x.hu"]);
  assert.deepEqual(newLessonRecipients(rows, 8), []);
});

test("az értesítő tárgya és címkéje az új anyagot jelzi, a link a levélben", () => {
  assert.equal(newLessonSubject("Bence", "A középkori Magyar Királyság fénykora"), "Bence, új tananyagod érkezett: A középkori Magyar Királyság fénykora");
  const html = reminderHtml({ first: "Bence", title: "Új lecke", url: "https://websuli.vip/preview/x?t=tok", motivation: "Hajrá!", label: NEW_LESSON_LABEL });
  assert.match(html, /ÚJ TANANYAG/);
  // Review #365: a lábléc az elkészülést nevezi meg, nem a reggeli küldést.
  const withFooter = reminderHtml({ first: "Bence", title: "Új lecke", url: "u", motivation: "m", label: NEW_LESSON_LABEL, footer: NEW_LESSON_FOOTER });
  assert.match(withFooter, /amikor elkészül egy új tananyag/);
  assert.doesNotMatch(withFooter, /minden tanítási reggel/);
  assert.doesNotMatch(html, /A MAI TANANYAGOD/);
  assert.match(html, /href="https:\/\/websuli\.vip\/preview\/x\?t=tok"/);
  // A címke nélküli hívás változatlan (a reggeli levél).
  assert.match(reminderHtml({ first: "Bence", title: "T", url: "u", motivation: "m", repeatPercent: 55 }), /ISMÉTLÉS — MÚLTKOR 55% LETT/);
  assert.match(reminderHtml({ first: "Bence", title: "T", url: "u", motivation: "m" }), /minden tanítási reggel/);
});
