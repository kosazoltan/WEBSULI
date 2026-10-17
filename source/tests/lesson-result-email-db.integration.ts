import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { knowledgeMaps, lessonResultEmails, lessons } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { gradeQuiz } from "../shared/lesson-result-email";

// Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — eldobható Postgresben.
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
process.env.ADMIN_EMAILS = "admin-a@example.test, admin-b@example.test";
const { db, dbPool } = await import("../server/db");
const { lessonResultsRouter, roundKeyOf, sendLessonResult, sendPracticeResult, setResultSender } = await import("../server/lesson-result-email");

const sent: Array<{ subject: string; html: string; to: string }> = [];
setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
const lesson = fusionFixture();
let base = "";
let close = () => {};
before(async () => {
  await db.insert(knowledgeMaps).values({ id: "result-map", title: "Eredmény próba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "result-integration-only" });
  await db.insert(lessons).values([
    { id: "result-published", mapId: "result-map", json: lesson, version: 1, publishedAt: new Date() },
    { id: "result-draft", mapId: "result-map", json: lesson, version: 2 },
  ]);
  const app = express();
  app.use(express.json());
  app.use("/api/lessons", lessonResultsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(async () => { close(); setResultSender(null); await dbPool.end(); });
const waitFor = async (pred: () => boolean) => { for (let i = 0; i < 50 && !pred(); i++) await new Promise(r => setTimeout(r, 50)); };

test("valódi DB: egy kör egyszer küld, mindkét adminnak; a második azonos kör nem küld", async () => {
  sent.length = 0;
  const q = lesson.experience!.quiz;
  const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
  const first = await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-1"), learner: "Vendég tanuló", graded });
  assert.deepEqual(first, { sent: 2, duplicate: false });
  assert.deepEqual(sent.map(s => s.to).sort(), ["admin-a@example.test", "admin-b@example.test"]);
  assert.match(sent[0].subject, /\[WebSuli eredmény\] .* — Kvíz — 100% \(Jeles\)/);
  const again = await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-1"), learner: "Vendég tanuló", graded });
  assert.deepEqual(again, { sent: 0, duplicate: true });
  assert.equal(sent.length, 2);
  const rows = await db.select().from(lessonResultEmails).where(eq(lessonResultEmails.lessonId, "result-published"));
  assert.equal(rows.length, 1); assert.deepEqual([...rows[0].delivered].sort(), ["admin-a@example.test", "admin-b@example.test"]); assert.equal(rows[0].percent, 100);
});

test("valódi HTTP: a feladatok beküldése 202, a szerver újrapontoz és a háttérben küld; publikálatlan lecke 404, hibás kérés 400", async () => {
  sent.length = 0;
  const task = lesson.experience!.tasks[0];
  const res = await fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "tasks", roundId: "round-http", answers: { [task.id]: task.sample }, fingerprint: "fp-1" }) });
  assert.equal(res.status, 202);
  await waitFor(() => sent.length === 2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /— Feladatok —/);
  assert.match(sent[0].html, /Vendég tanuló/);
  const repeat = await fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "tasks", roundId: "round-http", answers: { [task.id]: task.sample }, fingerprint: "fp-1" }) });
  assert.equal(repeat.status, 202);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(sent.length, 2, "ugyanaz a kör nem küld újra");
  assert.equal((await fetch(`${base}/api/lessons/result-draft/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "quiz", roundId: "round-x", picks: {} }) })).status, 404);
  assert.equal((await fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "tasks", roundId: "round-x", answers: {}, score: 100 }) })).status, 400);
});

test("valódi DB: a bejelentkezett tanuló szerveres kvíze a kör pillanatképéből pontoz és küld", async () => {
  sent.length = 0;
  const q = lesson.experience!.quiz[0];
  await sendPracticeResult({ userId: "nincs-ilyen", attemptId: "attempt-1", lessonId: "result-published",
    questions: [{ id: "a1", questionId: q.id, questionVersion: "v", prompt: q.question, options: q.options, correctIndex: q.correctIndex, feedbackPerOption: q.feedbackPerOption, coversConceptIds: [] }],
    answers: { a1: { pickedIndex: (q.correctIndex + 1) % q.options.length, usedHint: false, correct: false, answeredAt: new Date().toISOString() } } });
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /— Kvíz — 0% \(Elégtelen\)/);
  assert.match(sent[0].html, /helyes: /);
});

test("valódi DB (review #280): a meghiúsult címzett pótolható — a második hívás csak neki küld, a kézbesítettnek nem", async () => {
  sent.length = 0;
  let failB = true;
  setResultSender(async (subject, html, to) => { if (to === "admin-b@example.test" && failB) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
  const q = lesson.experience!.quiz;
  const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
  const first = await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-retry"), learner: "Vendég tanuló", graded }, false);
  assert.deepEqual(first, { sent: 1, duplicate: false });
  failB = false;
  const second = await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-retry"), learner: "Vendég tanuló", graded }, false);
  assert.deepEqual(second, { sent: 1, duplicate: false });
  assert.deepEqual(sent.map(s => s.to), ["admin-a@example.test", "admin-b@example.test"]);
  const third = await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-retry"), learner: "Vendég tanuló", graded }, false);
  assert.deepEqual(third, { sent: 0, duplicate: true });
  setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
});
