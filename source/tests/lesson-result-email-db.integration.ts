import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { knowledgeMaps, lessonResultEmails, lessons, taskResults, users } from "../shared/schema";
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
/** S4: a fixture első feladata gépileg szigorított csoporttal (a minta egy szava kötelező, `tightened`-ként jelölve). */
const tightenedLesson = () => {
  const l = structuredClone(fusionFixture());
  const t = l.experience!.tasks[0];
  t.required = [...t.required, ["kötelezőszó"]];
  t.tightened = [["kötelezőszó"]];
  t.sample = `${t.sample} kötelezőszó`;
  return l;
};
setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
const lesson = fusionFixture();
let base = "";
let close = () => {};
before(async () => {
  await db.insert(knowledgeMaps).values({ id: "result-map", title: "Eredmény próba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "result-integration-only" });
  await db.insert(lessons).values([
    { id: "result-published", mapId: "result-map", json: lesson, version: 1, publishedAt: new Date() },
    { id: "result-draft", mapId: "result-map", json: lesson, version: 2 },
    { id: "result-tightened", mapId: "result-map", json: tightenedLesson(), version: 1, publishedAt: new Date() },
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

/* Spec 2026-10-20-s4 (S4b + S4c): feladatszintű, névtelen eredmény + a szigorítás automatikus lazítása, valódi DB-n és HTTP-n. */
test("S4b: a feladatkör beküldése feladatonként egy névtelen sort ír; ugyanaz a kör újra nem duplikál; tanulói szöveg nincs", async () => {
  const task = lesson.experience!.tasks[0];
  const post = () => fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "tasks", roundId: "round-s4b", answers: { [task.id]: task.sample }, fingerprint: "fp-s4b" }) });
  const mailsBefore = sent.length;
  assert.equal((await post()).status, 202);
  await waitFor(() => sent.length === mailsBefore + 2); // a háttérlevél is lezárul (a pool a tesztek végén zárul)
  // A vendég kör kulcsa ugyanaz, mint a levélé (who = guest:<fingerprint>); a korábbi teszt köre külön kulcs.
  const mine = () => db.select().from(taskResults).where(and(eq(taskResults.lessonId, "result-published"), eq(taskResults.roundKey, roundKeyOf("guest:fp-s4b", "tasks", "round-s4b"))));
  let rows: Array<typeof taskResults.$inferSelect> = [];
  for (let i = 0; i < 50 && !rows.length; i++) { await new Promise(r => setTimeout(r, 50)); rows = await mine(); }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskId, task.id);
  assert.equal(rows[0].finalState, "ok");
  assert.equal(rows[0].tightenedOnlyMiss, false);
  assert.match(rows[0].contributor, /^[a-f0-9]{64}$/, "álnevesített lenyomat, nem nyers azonosító");
  assert.equal(JSON.stringify(rows[0]).includes(task.sample), false, "a válasz szövege nincs tárolva");
  assert.equal((await post()).status, 202);
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await mine()).length, 1, "a kör nem duplikál");
});

test("S4c: a küszöb alatt nincs lazítás; ≥ 20 kör és ≥ 40 % téves elutasítás után a szigorított csoport bónusz lesz, a verzió nő", async () => {
  const { contributorKey, maybeRelaxTightening, RELAX_MIN_ANSWERED } = await import("../server/task-results");
  // S7: a lazítás workflow alatt fut; a futás tulajdonosa a lecke gyártója (a térkép `createdBy`-ja).
  await db.insert(users).values({ id: "s4c-owner" });
  await db.update(knowledgeMaps).set({ createdBy: "s4c-owner" }).where(eq(knowledgeMaps.id, "result-map"));
  const taskId = tightenedLesson().experience!.tasks[0].id;
  const row = (i: number, falseReject: boolean, who = `c${i}`) => ({ lessonId: "result-tightened", taskId, roundKey: roundKeyOf("s4c", String(i)), contributor: contributorKey(who),
    detState: falseReject ? "partial" as const : "ok" as const, finalState: "ok" as const, arbiterRaised: falseReject, tightenedOnlyMiss: falseReject });
  // Review #340 (P1): egyetlen közreműködő 30 körrel (kliens által választott kör-azonosítókkal) sem lazít.
  await db.insert(taskResults).values(Array.from({ length: 30 }, (_, i) => row(1000 + i, true, "egy-kliens")));
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "egy közreműködő = 1, a küszöb alatt");
  await db.delete(taskResults).where(eq(taskResults.lessonId, "result-tightened"));
  await db.insert(taskResults).values(Array.from({ length: RELAX_MIN_ANSWERED - 1 }, (_, i) => row(i, i < 10)));
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "19 kör: a küszöb alatt");
  await db.insert(taskResults).values(row(99, false));
  const relaxed = await maybeRelaxTightening("result-tightened", [taskId]);
  assert.deepEqual(relaxed, [taskId]);
  const [saved] = await db.select().from(lessons).where(eq(lessons.id, "result-tightened"));
  const t = (saved.json as typeof lesson).experience!.tasks[0];
  assert.equal(saved.version, 2);
  assert.ok(!t.required.some(g => g[0] === "kötelezőszó") && t.bonus.some(g => g[0] === "kötelezőszó"), JSON.stringify(t));
  assert.equal(t.tightened, undefined);
  assert.deepEqual({ answered: t.relaxedTightening?.answered, falseRejects: t.relaxedTightening?.falseRejects }, { answered: 20, falseRejects: 10 });
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "már lazított: nincs második módosítás");
  assert.equal((await db.select().from(lessons).where(eq(lessons.id, "result-tightened")))[0].version, 2);
  const runs = await db.execute(sql`select snapshot->>'state' as state, snapshot->'definition'->>'mode' as mode from lesson_workflow_runs where owner_id = 's4c-owner'`);
  assert.ok(runs.rows.some((r) => (r as { mode: string; state: string }).mode === "relax" && (r as { state: string }).state === "done"), JSON.stringify(runs.rows));
});
