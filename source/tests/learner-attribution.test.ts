import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { withLearnerScript } from "../server/lib/material-capture";
import { normalizeMaterialResult, percentOf, withLearnerSubject } from "../server/lib/material-result";
import { buildResultEmail, gradeQuiz, resultRequestSchema } from "../shared/lesson-result-email";

// docs/specs/2026-10-18-tanuloi-profil.md (S2): a párosított tanuló tevékenysége és eredménye névvel.
const TOKEN = "3f1c2a9e-1111-4222-8333-944455556666.1.abcdefghijklmnopqrstuv";

test("withLearnerScript: a <head> után, fej nélkül az elejére; a szöveg nem zárhatja le a szkriptet", () => {
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>x</body></html>';
  const out = withLearnerScript(html, TOKEN);
  assert.ok(out.startsWith('<!DOCTYPE html><html><head><script>window.__websuliLearner="'));
  assert.ok(out.endsWith('<meta charset="utf-8"></head><body>x</body></html>'));
  assert.ok(withLearnerScript("<p>töredék</p>", TOKEN).startsWith("<script>"));
  const evil = withLearnerScript("<head></head>", "</script><script>alert(1)</script>");
  assert.equal((evil.match(/<\/script>/g) ?? []).length, 1, "csak a saját záró tag");
  const code = /<script>([\s\S]*?)<\/script>/.exec(evil)![1];
  const ctx: { window: { __websuliLearner?: string } } = { window: {} };
  new Script(code).runInNewContext(ctx);
  assert.equal(ctx.window.__websuliLearner, "</script><script>alert(1)</script>");
});

test("percentOf: az első százalék 0–100 között; nincs vagy kívül esik → null", () => {
  assert.equal(percentOf("Kvíz eredmény\n23 / 25\n92%\nKitűnő"), 92);
  assert.equal(percentOf("Pontosság: 66,7 %"), 67);
  assert.equal(percentOf("Eredmény: 8/10"), null);
  assert.equal(percentOf("150% (hibás)"), null);
});

test("withLearnerSubject: a tárgy a keresztnévvel kezdődik; név nélkül változatlan; legfeljebb 200 karakter", () => {
  const p = { materialId: "m", subject: "Igék témazáró — eredmény", body: "" };
  assert.equal(withLearnerSubject(p, "Dominik").subject, "Dominik – Igék témazáró — eredmény");
  assert.equal(withLearnerSubject(p, null), p);
  assert.equal(withLearnerSubject({ ...p, subject: "x".repeat(200) }, "Dominik").subject.length, 200);
});

test("normalizeMaterialResult: opcionális learner (legfeljebb 120 karakter)", () => {
  const base = { materialId: "abc", subject: "Kvíz", body: "92%" };
  const ok = normalizeMaterialResult({ ...base, learner: TOKEN });
  assert.ok(ok.ok && ok.value.learner === TOKEN);
  assert.equal(normalizeMaterialResult({ ...base, learner: "x".repeat(121) }).ok, false);
  assert.equal(normalizeMaterialResult({ ...base, learner: 5 }).ok, false);
  const none = normalizeMaterialResult(base);
  assert.ok(none.ok && !("learner" in none.value));
});

test("Stúdió-lecke: a beküldés learner mezőt is fogadhat; a tárgy a keresztnévvel kezdődik", () => {
  assert.equal(resultRequestSchema.safeParse({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, learner: TOKEN }).success, true);
  assert.equal(resultRequestSchema.safeParse({ kind: "tasks", roundId: "round-abcd", answers: { t1: "x" }, learner: "x".repeat(121) }).success, false);
  const quiz = [{ id: "q1", question: "Mi az ige?", options: ["cselekvés", "tárgy", "szín"], correctIndex: 0 }];
  const graded = gradeQuiz(quiz as Parameters<typeof gradeQuiz>[0], { q1: 0 });
  const named = buildResultEmail({ lessonTitle: "Igék", classroom: 4, learner: "Teszt Dominik", learnerFirst: "Dominik", url: "", graded });
  assert.match(named.subject, /^\[WebSuli eredmény\] Dominik – Igék — Kvíz — 100% /);
  const guest = buildResultEmail({ lessonTitle: "Igék", classroom: 4, learner: "Vendég tanuló", guest: true, url: "", graded });
  assert.match(guest.subject, /^\[WebSuli eredmény\] Igék — Kvíz/);
  // Spec 2026-10-21-tanulo-parositas: vendég eredményénél párosítási útmutató; a párosított tanulóé nem kapja.
  // Review #362: a cselekvés (QR-kód beolvasása a gyerek telefonjával) szerepel; a döntés az attribúcióból jön, nem a névből.
  assert.match(guest.html, /Párosító QR-kód/);
  assert.match(guest.html, /a gyerek a telefonja kamerájával a te képernyődről olvassa be/);
  assert.match(guest.html, /küldd el neki üzenetben a párosító linket/);
  assert.doesNotMatch(named.html, /Párosító QR-kód/);
  const accountNamedLikeGuest = buildResultEmail({ lessonTitle: "Igék", classroom: 4, learner: "Vendég tanuló", url: "", graded });
  assert.doesNotMatch(accountNamedLikeGuest.html, /Párosító QR-kód/);
});

test("review #302: percentOf — előjeles és túl hosszú szám, a tartomány a kerekítés előtt", () => {
  assert.equal(percentOf("Eredmény: -10%"), null);
  assert.equal(percentOf("Eredmény: 1100%"), null);
  assert.equal(percentOf("Eredmény: 100,4%"), null);
  assert.equal(percentOf("Eredmény: 100%"), 100);
  assert.equal(percentOf("Eredmény: 0 %"), 0);
});

test("review #302: a beinjektált szkript a keret címéből is eltávolítja az lt tokent", () => {
  const out = withLearnerScript("<head></head>", TOKEN);
  const code = /<script>([\s\S]*?)<\/script>/.exec(out)![1];
  const replaced: string[] = [];
  const ctx = { window: {} as { __websuliLearner?: string }, URL,
    location: { href: `https://api.example/dev/abc?lt=${TOKEN}&x=1#k` },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url); } } };
  new Script(code).runInNewContext(ctx);
  assert.equal(ctx.window.__websuliLearner, TOKEN);
  assert.deepEqual(replaced, ["/dev/abc?x=1#k"]);
});
