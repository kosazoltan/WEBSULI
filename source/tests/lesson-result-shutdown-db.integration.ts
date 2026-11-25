import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { knowledgeMaps, lessons } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// B6 (docs/specs/2026-11-25-eredmeny-email-b6.md; #510 R14, R41): leállításkor a várakozó, a küldés alatt álló és a halasztott
// eredménylevelek a pool lezárása előtt, korlátos időn belül kimennek — eldobható Postgresben.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
process.env.ADMIN_EMAILS = "admin-a@example.test, admin-b@example.test";
process.env.RESULT_PARTIAL_EMAIL = "on";
const { db, dbPool } = await import("../server/db");
const { lessonResultsRouter, setResultSender, setPartialDelay, setRetryDelay, pendingPartialCount, flushLessonResults, resetResultShutdownForTests, setRoundStateFault } = await import("../server/lesson-result-email");

const sent: Array<{ subject: string; to: string }> = [];
let failing = false;
let holdMs = 0;
let attempts = 0;
setResultSender(async (subject, _html, to) => {
  attempts += 1;
  if (holdMs) await new Promise(r => setTimeout(r, holdMs));
  if (failing) throw new Error("átmeneti hiba");
  sent.push({ subject, to });
});
const lesson = fusionFixture();
const q = lesson.experience!.quiz;
let base = "";
let close = () => {};
before(async () => {
  await db.insert(knowledgeMaps).values({ id: "shutdown-map", title: "Leállítás", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "shutdown-integration-only" });
  await db.insert(lessons).values({ id: "shutdown-lesson", mapId: "shutdown-map", json: lesson, version: 1, publishedAt: new Date() });
  const app = express();
  app.use(express.json());
  app.use("/api/lessons", lessonResultsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
beforeEach(() => { sent.length = 0; failing = false; holdMs = 0; attempts = 0; resetResultShutdownForTests(); setPartialDelay(60_000); setRetryDelay(60_000); });
after(async () => { close(); setResultSender(null); resetResultShutdownForTests(); await dbPool.end(); });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const waitFor = async (pred: () => boolean) => { for (let i = 0; i < 80 && !pred(); i++) await sleep(50); };
const picksOf = (n: number) => Object.fromEntries(q.slice(0, n).map(x => [x.id, x.correctIndex]));
const post = async (roundId: string, body: Record<string, unknown>) => {
  const res = await fetch(`${base}/api/lessons/shutdown-lesson/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "quiz", roundId, fingerprint: "fp-s", ...body }) });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};
const partialMails = () => sent.filter(m => /félbehagyva/.test(m.subject));
const finalMails = () => sent.filter(m => !/félbehagyva/.test(m.subject));

test("B6 / R14 (E29): leállításkor a várakozó pillanatkép a 60 s-os késleltetés kivárása nélkül kimegy", async () => {
  await post("s-wait", { picks: picksOf(3), partial: true, lastAnsweredAt: Date.now() });
  assert.equal(pendingPartialCount(), 1);
  const t0 = Date.now();
  const result = await flushLessonResults(5000);
  assert.ok(Date.now() - t0 < 4000, "nem várta ki a késleltetést");
  assert.equal(partialMails().length, 2);
  assert.equal(pendingPartialCount(), 0);
  assert.equal(result.left, 0);
});

test("B6 / R41: a halasztott „félbehagyva” újrapróba az ürítéskor azonnal lefut", async () => {
  setPartialDelay(50);
  failing = true;
  await post("s-retry", { picks: picksOf(2), partial: true });
  await waitFor(() => attempts >= 2);
  assert.equal(partialMails().length, 0, "az első kísérlet bukott, az újrapróba 60 s-ra halasztva");
  failing = false;
  await flushLessonResults(5000);
  assert.equal(partialMails().length, 2, "az ürítés előrehozta az újrapróbát");
});

test("B6 / R41: a halasztott VÉGLEGES újrapróba is azonnal lefut", async () => {
  failing = true;
  await post("s-final", { picks: picksOf(25) });
  await waitFor(() => attempts >= 2);
  failing = false;
  await flushLessonResults(5000);
  assert.equal(finalMails().length, 2);
});

test("B6 / R41: a véglegesített körre az előrehozott „félbehagyva” újrapróba sem küld (ugyanaz a kapu)", async () => {
  setPartialDelay(50);
  failing = true;
  await post("s-gate", { picks: picksOf(2), partial: true });
  await waitFor(() => attempts >= 2);
  failing = false;
  await post("s-gate", { picks: picksOf(25) });
  await waitFor(() => finalMails().length === 2);
  await flushLessonResults(5000);
  assert.equal(partialMails().length, 0);
});

test("B6 / R41: a küldés alatt álló kísérletet az ürítés megvárja", async () => {
  holdMs = 600;
  setPartialDelay(20);
  await post("s-inflight", { picks: picksOf(4), partial: true });
  await waitFor(() => attempts >= 1);
  assert.equal(partialMails().length, 0, "még küldés alatt");
  await flushLessonResults(5000);
  assert.equal(partialMails().length, 2);
});

test("B6: a határidőn túl függő küldésnél az ürítés a határidő után visszatér, a függők számával", async () => {
  holdMs = 3000;
  await post("s-slow", { picks: picksOf(5), partial: true });
  const t0 = Date.now();
  const result = await flushLessonResults(300);
  assert.ok(Date.now() - t0 < 1500, `határidő: ${Date.now() - t0} ms`);
  assert.ok(result.left > 0);
  await sleep(3200);
});

test("B6 / R41: az ürítés UTÁN érkező pillanatkép nem vár 60 s-ot (azonnal megy)", async () => {
  await flushLessonResults(1000);
  await post("s-after", { picks: picksOf(2), partial: true });
  await waitFor(() => partialMails().length === 2);
  assert.equal(partialMails().length, 2);
  assert.equal(pendingPartialCount(), 0);
});

test("review #607: a 202-vel nyugtázott VÉGLEGES levél háttérlánca a küldés előtt is nyilvántartott — az azonnali ürítés megvárja", async () => {
  const res = await post("s-chain", { picks: picksOf(25) });
  assert.equal(res.status, 202);
  const result = await flushLessonResults(5000);
  assert.equal(finalMails().length, 2, "az ürítés visszatérésekor a végleges levél már kiment");
  assert.equal(result.left, 0);
});

test("review #607: a felülírás-ellenőrzés újrapróbájának várakozását az ürítés előrehozza (nem 60 s)", async () => {
  let faults = 2;
  // a kör véglegesítése (előtte pillanatkép érkezett): a végleges ág a felülírás-ellenőrzésen megy át
  await post("s-supersede", { picks: picksOf(2), partial: true });
  setRoundStateFault((stage) => { if (stage === "partialSent" && faults > 0) { faults -= 1; throw new Error("átmeneti DB-hiba"); } });
  try {
    await post("s-supersede", { picks: picksOf(25) });
    await sleep(300);
    const t0 = Date.now();
    const result = await flushLessonResults(5000);
    assert.ok(Date.now() - t0 < 4000, `nem várta ki a 60 s-os újrapróbát: ${Date.now() - t0} ms`);
    assert.equal(finalMails().length, 2, "a végleges levél az ürítésen belül kiment");
    assert.equal(result.left, 0);
  } finally { setRoundStateFault(null); }
});
