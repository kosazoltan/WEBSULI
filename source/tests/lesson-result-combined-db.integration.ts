import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { knowledgeMaps, lessons, users } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// U4b (docs/specs/2026-11-24-osszevont-eredmenylevel.md, E1–E3, E5, E6, E8–E10): kétrészes leckénél a szöveges feladatok és a kvíz
// végleges eredménye EGY levélben megy; az első rész félreteendő (`awaiting`), a második párosít — eldobható Postgresben, hamis küldővel.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
process.env.ADMIN_EMAILS = "admin-a@example.test, admin-b@example.test";
const { db, dbPool } = await import("../server/db");
const { lessonResultsRouter, sendPracticeResult, setResultSender } = await import("../server/lesson-result-email");

const sent: Array<{ subject: string; html: string; to: string }> = [];
setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); });
const lesson = fusionFixture();
const quizOnly = () => { const l = structuredClone(fusionFixture()); l.experience!.tasks = []; return l; };
const ex = lesson.experience!;
let base = "";
let close = () => {};
before(async () => {
  await db.insert(knowledgeMaps).values({ id: "comb-map", title: "Összevont", subject: "matematika", classroom: 6, sourceFiles: [], inputHash: "combined-integration-only" });
  await db.insert(lessons).values([
    { id: "comb-two", mapId: "comb-map", json: lesson, version: 1, publishedAt: new Date() },
    { id: "comb-one", mapId: "comb-map", json: quizOnly(), version: 1, publishedAt: new Date() },
  ]);
  await db.insert(users).values({ id: "comb-user", email: "comb-user@example.test", firstName: "Teszt", lastName: "Tanuló" });
  const app = express();
  app.use(express.json());
  // A bejelentkezett tanuló a tesztben fejlécből (a valódi hitelesítés a routes.ts-ben).
  app.use((req, _res, nextFn) => { const id = req.header("x-test-user"); if (id) (req as unknown as { user: { id: string } }).user = { id }; nextFn(); });
  app.use("/api/lessons", lessonResultsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(async () => { close(); setResultSender(null); delete process.env.RESULT_COMBINED_EMAIL; await dbPool.end(); });
beforeEach(() => { sent.length = 0; process.env.RESULT_COMBINED_EMAIL = "on"; });
const settle = () => new Promise(r => setTimeout(r, 400));
const post = async (lessonId: string, body: Record<string, unknown>, user?: string) => {
  const r = await fetch(`${base}/api/lessons/${lessonId}/results`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};
const quizBody = (fp: string, roundId: string) => ({ kind: "quiz", roundId, fingerprint: fp, picks: { [ex.quiz[0].id]: ex.quiz[0].correctIndex, [ex.quiz[1].id]: ex.quiz[1].correctIndex } });
const tasksBody = (fp: string, roundId: string) => ({ kind: "tasks", roundId, fingerprint: fp, answers: { [ex.tasks[0].id]: ex.tasks[0].sample } });
const open = async (owner: string) => (await dbPool.query(`SELECT kind, round_id FROM lesson_result_pending WHERE lesson_id = 'comb-two' AND owner_key = $1 AND sent_at IS NULL`, [owner])).rows;

test("E1: egyrészes lecke → azonnal a régi egyrészes levél, nincs félretétel", async () => {
  const r = await post("comb-one", quizBody("fp-e1", "e1-q"));
  assert.equal(r.status, 202);
  assert.equal(r.body.awaiting, undefined);
  await settle();
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, / — Kvíz — /);
  assert.equal((await dbPool.query(`SELECT 1 FROM lesson_result_pending WHERE lesson_id = 'comb-one'`)).rowCount, 0);
});

test("E2 + E3 + E10: csak a kvíz → nincs levél, awaiting: tasks; a feladatok után EGY összevont levél; a felhasznált kör újraküldése alreadySent", async () => {
  const q = await post("comb-two", quizBody("fp-a", "a-q1"));
  assert.equal(q.status, 202);
  assert.equal(q.body.awaiting, "tasks");
  await settle();
  assert.equal(sent.length, 0, "az első rész után nincs levél");
  assert.deepEqual(await open("guest:fp-a"), [{ kind: "quiz", round_id: "a-q1" }]);
  const t = await post("comb-two", tasksBody("fp-a", "a-t1"));
  assert.equal(t.status, 202);
  assert.equal(t.body.awaiting, undefined);
  assert.equal(t.body.combined, true);
  await settle();
  assert.equal(sent.length, 2, "egy összevont levél mindkét adminnak");
  assert.match(sent[0].subject, / — Feladatok \+ kvíz — /);
  assert.ok(sent[0].html.includes("<h3>Feladatok") && sent[0].html.includes("<h3>Kvíz"));
  assert.deepEqual(await open("guest:fp-a"), []);
  const pair = (await dbPool.query(`SELECT kind, sent_reason FROM lesson_result_pending WHERE owner_key = 'guest:fp-a' ORDER BY kind`)).rows;
  assert.deepEqual(pair, [{ kind: "quiz", sent_reason: "pair" }, { kind: "tasks", sent_reason: "pair" }]);
  sent.length = 0;
  const again = await post("comb-two", tasksBody("fp-a", "a-t1"));
  assert.equal(again.body.alreadySent, true);
  const againQuiz = await post("comb-two", quizBody("fp-a", "a-q1"));
  assert.equal(againQuiz.body.alreadySent, true);
  await settle();
  assert.equal(sent.length, 0, "a felhasznált kör nem képez új párt");
});

test("E5: az újabb kör felülírja a nyitott részt", async () => {
  await post("comb-two", quizBody("fp-b", "b-q1"));
  await post("comb-two", quizBody("fp-b", "b-q2"));
  assert.deepEqual(await open("guest:fp-b"), [{ kind: "quiz", round_id: "b-q2" }]);
  await settle();
  assert.equal(sent.length, 0);
});

test("E6: kapcsoló KI → a régi kétlevelű viselkedés (azonnal megy, nincs félretétel)", async () => {
  process.env.RESULT_COMBINED_EMAIL = "off";
  const r = await post("comb-two", quizBody("fp-c", "c-q1"));
  assert.equal(r.body.awaiting, undefined);
  await settle();
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, / — Kvíz — /);
  assert.deepEqual(await open("guest:fp-c"), []);
});

test("E8: üres várakozóállapotból a két rész egyszerre (két kapcsolat) → pontosan egy összevont levél, nem marad nyitott sor", async () => {
  const [a, b] = await Promise.all([post("comb-two", quizBody("fp-d", "d-q1")), post("comb-two", tasksBody("fp-d", "d-t1"))]);
  assert.equal(a.status, 202);
  assert.equal(b.status, 202);
  assert.equal([a.body.combined, b.body.combined].filter(Boolean).length, 1, "pontosan az egyik párosít");
  await settle();
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /Feladatok \+ kvíz/);
  assert.deepEqual(await open("guest:fp-d"), []);
});

test("E9: a bejelentkezett tanuló gyakorlóköre (sendPracticeResult) ugyanazon a párosítón megy át", async () => {
  const t = await post("comb-two", tasksBody("fp-ignored", "u-t1"), "comb-user");
  assert.equal(t.body.awaiting, "quiz");
  await settle();
  assert.equal(sent.length, 0);
  const questions = ex.quiz.slice(0, 3).map(q => ({ id: q.id, prompt: q.question, options: q.options, correctIndex: q.correctIndex }));
  const answers = Object.fromEntries(questions.map(q => [q.id, { pickedIndex: q.correctIndex }]));
  const res = await sendPracticeResult({ userId: "comb-user", attemptId: "att-u1", lessonId: "comb-two", questions: questions as never, answers: answers as never });
  assert.equal(res?.awaiting ?? null, null);
  await settle();
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /Feladatok \+ kvíz/);
  assert.deepEqual(await open("comb-user"), []);
});
