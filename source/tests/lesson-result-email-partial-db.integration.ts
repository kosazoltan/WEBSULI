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
const { lessonResultsRouter, setResultSender, setPartialDelay, setRetryDelay, pendingPartialCount, finalRoundKeyOf, setRoundStateFault } = await import("../server/lesson-result-email");

const sent: Array<{ subject: string; html: string; to: string }> = [];
let failing = false;
let attempts = 0; // minden küldési kísérlet (a bukott is) — az időzítés helyett erre várnak a tesztek
setResultSender(async (subject, html, to) => { attempts += 1; if (failing) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
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
  const delay = setPartialDelay(2000); // terhelt gépen is a késleltetésen BELÜL érkezik a végleges
  try {
    await post("p-cancel", { picks: picksOf(3), partial: true });
    assert.deepEqual((await post("p-cancel", { picks: picksOf(25) })).json, { queued: true });
  } finally { setPartialDelay(delay); }
  await sleep(2300);
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
  const retry = setRetryDelay(1500); // az újrapróba terhelt gépen is a véglegesítés UTÁN esedékes
  const before = attempts;
  try {
    await post("p-retry", { picks: picksOf(3), partial: true });
    await waitFor(() => attempts > before); // az első kísérlet lefutott és bukott
    failing = false;
    await post("p-retry", { picks: picksOf(25) });
    await sleep(1900); // az újrapróba ideje is letelt
  } finally { setRetryDelay(retry); failing = false; }
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

// ---- PR #577 review ----
const postTo = async (lessonId: string, roundId: string, body: Record<string, unknown>) => {
  const res = await fetch(`${base}/api/lessons/${lessonId}/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "quiz", roundId, fingerprint: "fp-p", ...body }) });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};

test("#577 (kapuhiba = sikertelen kísérlet): ha a küldési kísérlet állapot-lekérdezése átmenetileg hibázik, az egyetlen újrapróba elküldi", async () => {
  sent.length = 0;
  let faults = 1;
  try {
    await post("p-gate-fault", { picks: picksOf(3), partial: true, lastAnsweredAt: Date.now() });
    // a kérés már nyugtázva (202); a hiba a 150 ms-os időzítő utáni küldési kísérlet kapujában jön
    setRoundStateFault((stage) => { if (stage === "finalized" && faults > 0) { faults -= 1; throw new Error("átmeneti DB-hiba"); } });
    await waitFor(() => partialMails().length === 2);
    assert.equal(partialMails().length, 2, "a kapu hibája után az újrapróba kiküldte a levélpárt");
  } finally { setRoundStateFault(null); }
});

test("#577 (R7 küldés közben): bukott ötválaszos küldés után érkező kétválaszos pillanatkép nem írja felül — öt válaszról megy levél", async () => {
  sent.length = 0;
  failing = true;
  const retry = setRetryDelay(1500);
  const before = attempts;
  try {
    await post("p-r7-retry", { picks: picksOf(5), partial: true, lastAnsweredAt: Date.now() });
    await waitFor(() => attempts > before); // az első kísérlet lefutott és bukott; az újrapróba még vár
    await post("p-r7-retry", { picks: picksOf(2), partial: true, lastAnsweredAt: Date.now() });
  } finally { failing = false; setRetryDelay(retry); }
  await waitFor(() => partialMails().length === 2);
  await sleep(200);
  assert.equal(partialMails().length, 2);
  assert.match(partialMails()[0].subject, /félbehagyva: 5 \/ 25/, "a legtöbb választ tartalmazó állapot ment ki");
});

test("#577 (R5): az ismeretlen válaszidő nem elavult — régen kezdett kör lastAnsweredAt nélkül is ütemeződik", async () => {
  sent.length = 0;
  const r = await post("p-old-start", { picks: picksOf(2), partial: true, startedAt: Date.now() - 9 * 86_400_000 });
  assert.deepEqual(r.json, { queued: true, partial: true });
  await waitFor(() => partialMails().length === 2);
});

test("#577 (leckénkénti korlát): ugyanaz a tanuló négy KÜLÖN leckét hagy félbe — mind a négy várakozó megmarad", async () => {
  sent.length = 0;
  for (const id of ["partial-lesson-b", "partial-lesson-c", "partial-lesson-d"]) {
    await db.insert(lessons).values({ id, mapId: "partial-map", json: lesson, version: 1, publishedAt: new Date() }).onConflictDoNothing();
  }
  const delay = setPartialDelay(800);
  try {
    for (const id of ["partial-lesson", "partial-lesson-b", "partial-lesson-c", "partial-lesson-d"]) {
      assert.deepEqual((await postTo(id, "p-many-lessons", { picks: picksOf(2), partial: true, lastAnsweredAt: Date.now() })).json, { queued: true, partial: true });
    }
    assert.equal(pendingPartialCount(), 4, "a korlát leckénként (lecke|tanuló) számol, nem tanulónként");
  } finally { setPartialDelay(delay); }
  await waitFor(() => partialMails().length === 8);
  assert.equal(partialMails().length, 8);
});

test("#577 (R1 a ismeretlen állapotban): a felülírás-ellenőrzés átmeneti hibája után sem megy felülíró mondat nélküli végleges levél", async () => {
  sent.length = 0;
  await post("p-supersede-fault", { picks: picksOf(3), partial: true, lastAnsweredAt: Date.now() });
  await waitFor(() => partialMails().length === 2);
  let faults = 2;
  setRoundStateFault((stage) => { if (stage === "partialSent" && faults > 0) { faults -= 1; throw new Error("átmeneti DB-hiba"); } });
  try {
    await post("p-supersede-fault", { picks: picksOf(25) });
    await waitFor(() => finalMails().length === 2);
    assert.equal(finalMails().length, 2);
    assert.ok(finalMails().every(m => /helyébe lép/.test(m.html)), "a végleges levél a felülíró mondattal ment ki");
  } finally { setRoundStateFault(null); }
});

test("#577 / 35501fd3: a felülírás-ellenőrzés tartós hibájánál a végleges levél nem vész el — feltételes felülíró mondattal megy ki", async () => {
  sent.length = 0;
  await post("p-supersede-down", { picks: picksOf(3), partial: true, lastAnsweredAt: Date.now() });
  await waitFor(() => partialMails().length === 2);
  setRoundStateFault((stage) => { if (stage === "partialSent") throw new Error("tartós DB-hiba"); });
  try {
    await post("p-supersede-down", { picks: picksOf(25) });
    await waitFor(() => finalMails().length === 2);
    assert.equal(finalMails().length, 2, "a végleges levélpár kiment");
    assert.ok(finalMails().every(m => /ha erről a körről korábban/.test(m.html)), "feltételes felülíró mondat");
  } finally { setRoundStateFault(null); }
});

// Review #613 (Codex, Copilot): a B8 két azonosítója (r2-<nonce> és a régi round-<lenyomat>) a szerveren UGYANAZ a logikai kör.
test("review #613: az r2 pillanatkép után a régi azonosítóval érkező végleges beküldés elnyomja a „félbehagyva” levelet", async () => {
  sent.length = 0;
  const delay = setPartialDelay(2000);
  try {
    await post("r2-0123456789abcdef0123456789abcdef", { picks: picksOf(3), partial: true, legacyRoundId: "round-legacy613a" });
    assert.deepEqual((await post("round-legacy613a", { picks: picksOf(25) })).json, { queued: true });
  } finally { setPartialDelay(delay); }
  await sleep(2300);
  assert.equal(partialMails().length, 0, "a régi azonosítójú véglegesítés után nem megy „félbehagyva” levél");
  assert.equal(finalMails().length, 2);
});

test("review #613: az r2 végleges beküldés után ugyanannak a körnek a régi azonosítójú (régi kliens) véglegese duplikátum", async () => {
  sent.length = 0;
  assert.deepEqual((await post("r2-fedcba9876543210fedcba9876543210", { picks: picksOf(25), legacyRoundId: "round-legacy613b" })).json, { queued: true });
  await waitFor(() => finalMails().length === 2);
  const late = await post("round-legacy613b", { picks: picksOf(25) });
  assert.equal(late.json.duplicate, true, "a régi azonosítójú második végleges beküldés duplikátum");
  await sleep(300);
  assert.equal(finalMails().length, 2, "egy kör — egy végleges levélpár");
});
