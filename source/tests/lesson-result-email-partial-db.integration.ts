import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { knowledgeMaps, lessonResultEmails, lessons } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// Eredmény-e-mail B5a-1 (docs/specs/2026-11-22-eredmeny-email-bontas-vegrehajtas.md 5. pont; #510 S1b R1, R5–R7, R15, R18, R21): a
// „félbehagyva” pillanatkép szerveroldali ütemezése és elnyomása a `RESULT_PARTIAL_EMAIL=on` kapcsoló mögött — eldobható Postgresben.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
process.env.ADMIN_EMAILS = "admin-a@example.test, admin-b@example.test";
process.env.RESULT_PARTIAL_EMAIL = "on";
const { db, dbPool } = await import("../server/db");
const { lessonResultsRouter, setResultSender, setPartialDelay, setRetryDelay, pendingPartialCount, finalRoundKeyOf } = await import("../server/lesson-result-email");

const sent: Array<{ subject: string; html: string; to: string }> = [];
let failing = false;
setResultSender(async (subject, html, to) => { if (failing) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
const lesson = fusionFixture();
const q = lesson.experience!.quiz;
let base = "";
let close = () => {};
before(async () => {
  setPartialDelay(150);
  setRetryDelay(150);
  await db.insert(knowledgeMaps).values({ id: "partial-map", title: "Pillanatkép", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "partial-integration-only" });
  await db.insert(lessons).values({ id: "partial-lesson", mapId: "partial-map", json: lesson, version: 1, publishedAt: new Date() });
  const app = express();
  app.use(express.json());
  app.use("/api/lessons", lessonResultsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(async () => { close(); setResultSender(null); await dbPool.end(); });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const waitFor = async (pred: () => boolean) => { for (let i = 0; i < 60 && !pred(); i++) await sleep(50); };
const picksOf = (n: number) => Object.fromEntries(q.slice(0, n).map(x => [x.id, x.correctIndex]));
const post = async (roundId: string, body: Record<string, unknown>) => {
  const res = await fetch(`${base}/api/lessons/partial-lesson/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "quiz", roundId, fingerprint: "fp-p", ...body }) });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};
const partialMails = () => sent.filter(m => /félbehagyva/.test(m.subject));
const finalMails = () => sent.filter(m => !/félbehagyva/.test(m.subject));

test("B5a-1 (E9): a pillanatkép a késleltetés után EGY „félbehagyva” levélpárt küld, a megválaszolt / körméret számmal", async () => {
  sent.length = 0;
  assert.deepEqual((await post("p-one", { picks: picksOf(3), partial: true, lastAnsweredAt: Date.now() })).json, { queued: true, partial: true });
  await waitFor(() => partialMails().length === 2);
  assert.equal(partialMails().length, 2);
  assert.match(partialMails()[0].subject, /Kvíz \(félbehagyva: 3 \/ 25\)/);
  assert.match(partialMails()[0].html, /Utolsó válasz:/);
  assert.equal(pendingPartialCount(), 0);
});

test("B5a-1 (E9, R15): a késleltetésen belüli végleges beküldés elnyomja a pillanatképet — csak a végleges levél megy, felülíró mondat nélkül", async () => {
  sent.length = 0;
  await post("p-cancel", { picks: picksOf(3), partial: true });
  assert.deepEqual((await post("p-cancel", { picks: picksOf(25) })).json, { queued: true });
  await sleep(500);
  assert.equal(partialMails().length, 0);
  assert.equal(finalMails().length, 2);
  assert.doesNotMatch(finalMails()[0].html, /helyébe lép/);
});

test("B5a-1 (E10, R1 a): kiment „félbehagyva” levél után a végleges levél a felülíró mondatot viszi; további pillanatkép alreadySent", async () => {
  sent.length = 0;
  await post("p-super", { picks: picksOf(2), partial: true });
  await waitFor(() => partialMails().length === 2);
  assert.deepEqual((await post("p-super", { picks: picksOf(4), partial: true })).json, { queued: false, partial: true, alreadySent: true }, "R6");
  await post("p-super", { picks: picksOf(25) });
  await waitFor(() => finalMails().length === 2);
  assert.match(finalMails()[0].html, /ez a befejezett kör eredménye — a korábbi, „félbehagyva” jelzésű levél helyébe lép/);
});

test("B5a-1 (P4, R18): a végleges utáni késői pillanatkép nem ütemeződik — memóriából és a tartós jelzőből (újraindítás) is", async () => {
  sent.length = 0;
  await post("p-late", { picks: picksOf(25) });
  await waitFor(() => finalMails().length === 2);
  assert.deepEqual((await post("p-late", { picks: picksOf(3), partial: true })).json, { queued: false, partial: true, finalized: true });
  const { clearFinalizedRounds } = await import("../server/lesson-result-email");
  clearFinalizedRounds();
  assert.deepEqual((await post("p-late", { picks: picksOf(3), partial: true })).json, { queued: false, partial: true, finalized: true }, "a tartós jelzőből");
  await sleep(400);
  assert.equal(partialMails().length, 0);
});

test("B5a-1 (R7): a több választ tartalmazó pillanatkép marad; (R5) a 7 napnál régebbi tevékenység stale; válasz nélkül nincs ütemezés", async () => {
  sent.length = 0;
  await post("p-most", { picks: picksOf(5), partial: true });
  await post("p-most", { picks: picksOf(2), partial: true });
  await waitFor(() => partialMails().length === 2);
  assert.match(partialMails()[0].subject, /félbehagyva: 5 \/ 25/);
  assert.deepEqual((await post("p-stale", { picks: picksOf(3), partial: true, lastAnsweredAt: Date.now() - 8 * 86_400_000 })).json, { queued: false, partial: true, stale: true });
  assert.deepEqual((await post("p-empty", { picks: { [q[0].id]: -1 }, partial: true })).json, { queued: false, partial: true });
});

test("B5a-1 (E17, R1 b, R21): a bukott „félbehagyva” küldés újrapróbája a véglegesítés után SEM megy ki", async () => {
  sent.length = 0;
  failing = true;
  await post("p-retry", { picks: picksOf(3), partial: true });
  await sleep(250); // az első kísérlet lefutott és bukott
  failing = false;
  await post("p-retry", { picks: picksOf(25) });
  await sleep(600); // az újrapróba ideje is letelt
  assert.equal(partialMails().length, 0, "véglegesített körre „félbehagyva” levél soha");
  assert.equal(finalMails().length, 2);
  assert.doesNotMatch(finalMails()[0].html, /helyébe lép/, "részleges levél nem ment ki — nincs felülíró mondat");
});

test("B5a-1 (R1): versenyhelyzet — 20 kör, a pillanatkép időzítője és a végleges beküldés egyszerre: körönként vagy (a) részleges + felülíró végleges, vagy (b) csak végleges", async () => {
  sent.length = 0;
  setPartialDelay(20);
  try {
    for (let i = 0; i < 20; i++) {
      await post(`p-race-${i}`, { picks: picksOf(3), partial: true });
      await sleep(15 + (i % 5) * 3);
      await post(`p-race-${i}`, { picks: picksOf(25) });
    }
    await sleep(800);
    const finals = finalMails();
    assert.equal(finals.length, 40, "körönként egy végleges levélpár");
    const partials = partialMails().length / 2;
    const superseding = finals.filter(m => /helyébe lép/.test(m.html)).length / 2;
    assert.equal(superseding, partials, "pontosan annyi felülíró végleges, ahány részleges kiment");
  } finally { setPartialDelay(150); }
});

test("B5a-1 (R18, kizárás a küldési kísérletben): ha a kört MÁSIK példány véglegesítette (csak a tartós jelzősor létezik), a várakozó pillanatkép nem megy ki", async () => {
  sent.length = 0;
  await post("p-other", { picks: picksOf(3), partial: true });
  // a másik példány véglegesítése: csak a tartós, tanulófüggetlen jelzősor (ennek a példánynak a memóriája nem tud róla)
  await db.insert(lessonResultEmails).values({ lessonId: "partial-lesson", kind: "quiz", roundKey: finalRoundKeyOf("p-other", "quiz"), percent: 100 });
  await sleep(500);
  assert.equal(partialMails().length, 0, "a küldési kísérlet a kizárás alatt a tartós jelzőt is ellenőrzi");
});
