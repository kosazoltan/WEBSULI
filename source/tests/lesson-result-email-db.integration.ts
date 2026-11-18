import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { knowledgeMaps, lessonResultEmails, lessons, taskResults, users } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { gradeQuiz } from "../shared/lesson-result-email";
import { experienceRoundSizes } from "../shared/lesson-experience";

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

/* Spec 2026-11-17-eredmeny-email-foglalas: atomi foglalás a küldés ELŐTT — párhuzamos hívásoknál címzettenként egy levél. */
test("valódi DB: öt EGYIDEJŰ azonos kör címzettenként pontosan egy levelet küld (foglalás a küldés előtt)", async () => {
  sent.length = 0;
  setResultSender(async (subject, html, to) => { await new Promise(resolve => setTimeout(resolve, 150)); sent.push({ subject, html, to }); });
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const roundKey = roundKeyOf("t", "quiz", "round-parallel");
    const results = await Promise.all(Array.from({ length: 5 }, () => sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false)));
    assert.deepEqual(sent.map(s => s.to).sort(), ["admin-a@example.test", "admin-b@example.test"], "címzettenként egy levél");
    assert.equal(results.reduce((sum, r) => sum + r.sent, 0), 2);
    assert.ok(results.filter(r => r.sent === 0).every(r => r.duplicate), "aki nem küldött, az ismétlődést jelez");
    const [row] = await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, "result-published"), eq(lessonResultEmails.roundKey, roundKey)));
    assert.deepEqual([...row.delivered].sort(), ["admin-a@example.test", "admin-b@example.test"], "nincs ismétlődő bejegyzés");
  } finally { setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
});

test("valódi DB: párhuzamos hívásoknál a MEGHIÚSULT címzett foglalása felszabadul — pótolható, a kézbesített nem kap másodikat", async () => {
  sent.length = 0;
  let failB = true;
  setResultSender(async (subject, html, to) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (to === "admin-b@example.test" && failB) throw new Error("átmeneti hiba");
    sent.push({ subject, html, to });
  });
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const roundKey = roundKeyOf("t", "quiz", "round-parallel-retry");
    const call = () => sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false);
    await Promise.all([call(), call(), call()]);
    assert.deepEqual(sent.map(s => s.to), ["admin-a@example.test"], "a bukó címzett nem kapott, a másik pontosan egyet");
    const stored = async () => (await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, "result-published"), eq(lessonResultEmails.roundKey, roundKey))))[0].delivered;
    assert.deepEqual(await stored(), ["admin-a@example.test"], "a meghiúsult címzett foglalása felszabadult");
    failB = false;
    const again = await Promise.all([call(), call(), call()]);
    assert.equal(again.reduce((sum, r) => sum + r.sent, 0), 1);
    assert.deepEqual(sent.map(s => s.to), ["admin-a@example.test", "admin-b@example.test"]);
    assert.deepEqual([...await stored()].sort(), ["admin-a@example.test", "admin-b@example.test"]);
    assert.deepEqual(await call(), { sent: 0, duplicate: true });
  } finally { setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
});

/* Review K1–K3 (2026-11-17): a foglalás kivétel és lefagyott küldő után sem ragad be; a napló nem tartalmaz e-mail-címet. */
test("review K1: a küldő SZINKRON kivétele a foglalás után → a foglalás felszabadul, a következő hívás pótol", async () => {
  sent.length = 0;
  let broken = true;
  // Nem elutasított ígéret, hanem azonnali kivétel: a foglalás már megtörtént, a küldés el sem indult.
  setResultSender(((subject: string, html: string, to: string) => { if (broken) throw new TypeError(`váratlan hiba: ${to}`); sent.push({ subject, html, to }); return Promise.resolve(); }) as Parameters<typeof setResultSender>[0]);
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const roundKey = roundKeyOf("t", "quiz", "round-throw");
    const call = () => sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false);
    assert.deepEqual(await call(), { sent: 0, duplicate: false });
    const stored = async () => (await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, "result-published"), eq(lessonResultEmails.roundKey, roundKey))))[0].delivered;
    assert.deepEqual(await stored(), [], "a kivétel után nem maradt beragadt foglalás");
    broken = false;
    assert.deepEqual(await call(), { sent: 2, duplicate: false }, "a következő hívás mindkét címzettnek pótol");
    assert.deepEqual([...await stored()].sort(), ["admin-a@example.test", "admin-b@example.test"]);
  } finally { setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
});

test("review K2: a LEFAGYOTT küldő az időkorlát után bukottnak számít — a foglalása felszabadul, a másik címzett megkapja, a pótlás működik", async () => {
  const { setSendTimeout } = await import("../server/lesson-result-email");
  sent.length = 0;
  let hang = true;
  const previous = setSendTimeout(300);
  setResultSender(async (subject, html, to) => { if (to === "admin-b@example.test" && hang) await new Promise(() => { /* soha nem tér vissza */ }); sent.push({ subject, html, to }); });
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const roundKey = roundKeyOf("t", "quiz", "round-hang");
    const call = () => sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false);
    const started = Date.now();
    assert.deepEqual(await call(), { sent: 1, duplicate: false });
    assert.ok(Date.now() - started < 5000, "a hívás az időkorlát után visszatér");
    const stored = async () => (await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, "result-published"), eq(lessonResultEmails.roundKey, roundKey))))[0].delivered;
    assert.deepEqual(await stored(), ["admin-a@example.test"], "a lefagyott címzett foglalása felszabadult");
    hang = false;
    assert.deepEqual(await call(), { sent: 1, duplicate: false });
    assert.deepEqual(sent.map(s => s.to), ["admin-a@example.test", "admin-b@example.test"]);
  } finally { setSendTimeout(previous); setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
});

test("review K3: adatbázishiba a foglalás közben — a napló csak a hiba osztályát / kódját tartalmazza, e-mail-címet nem", async () => {
  const { errorClass } = await import("../server/lesson-result-email");
  const { logger } = await import("../server/lib/logger");
  const lines: string[] = [];
  const original = logger.error;
  logger.error = ((...args: unknown[]) => { lines.push(args.map(a => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" ")); }) as typeof logger.error;
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    // A körkulcs 64 karakteres oszlopba megy: a túl hosszú kulcs adatbázishibát ad — a hibaüzenet a paramétereket is tartalmazza.
    const result = await sendLessonResult({ lessonId: "result-published", roundKey: "x".repeat(80), learner: "admin-a@example.test nevű tanuló", graded }, false);
    assert.deepEqual(result, { sent: 0, duplicate: false });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[LESSON-RESULT\] a küldés nem sikerült: [A-Za-z0-9_]+( \([A-Za-z0-9_]+\))?$/); // újrapróba nélküli hívás: nincs utótag
    assert.ok(!lines.join(" ").includes("@"), "a napló nem tartalmaz e-mail-címet");
  } finally { logger.error = original; }
  assert.equal(errorClass(Object.assign(new Error("titok: admin-a@example.test"), { code: "23505" })), "Error (23505)");
  assert.equal(errorClass(Object.assign(new Error("x"), { name: "admin-a@example.test" })), "Error", "a nem szabályos név nem kerül ki");
  assert.equal(errorClass("admin-a@example.test"), "Error");
  assert.equal(errorClass(Object.assign(new Error("x"), { cause: { code: "22001" } })), "Error (22001)");
});

test("review: idempotencia-kulcs — ugyanarra a körre és címzettre ugyanaz megy (pótláskor is), más körre / címzettre más; a kulcsban nincs cím", async () => {
  const { resultIdempotencyKey } = await import("../server/lesson-result-email");
  const keys: Array<{ to: string; key: string }> = [];
  let failB = true;
  setResultSender(async (_subject, _html, to, key) => { keys.push({ to, key }); if (to === "admin-b@example.test" && failB) throw new Error("átmeneti hiba"); });
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const call = (round: string) => sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", round), learner: "Vendég tanuló", graded }, false);
    await call("round-idem-1");
    failB = false;
    await call("round-idem-1"); // pótlás a bukott címzettnek: UGYANAZZAL a kulccsal
    await call("round-idem-2");
    const of = (to: string) => keys.filter(k => k.to === to).map(k => k.key);
    const [b1, b1retry, b2] = of("admin-b@example.test");
    assert.equal(of("admin-b@example.test").length, 3);
    assert.equal(b1, b1retry, "az újraküldés ugyanazzal a kulccsal megy");
    assert.notEqual(b1, b2, "más kör: más kulcs");
    const [a1, a2] = of("admin-a@example.test");
    assert.notEqual(a1, b1, "más címzett: más kulcs");
    assert.notEqual(a1, a2);
    assert.equal(b1, resultIdempotencyKey("result-published", "quiz", roundKeyOf("t", "quiz", "round-idem-1"), "admin-b@example.test"));
    assert.notEqual(b1, resultIdempotencyKey("result-published", "tasks", roundKeyOf("t", "quiz", "round-idem-1"), "admin-b@example.test"), "más fajta: más kulcs");
    for (const { key } of keys) { assert.match(key, /^lesson-result\/[a-f0-9]{64}$/); assert.ok(!key.includes("@")); }
  } finally { setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
});

test("review: váratlan kivétel (az allSettled-en kívül) után is ütemeződik EGY újrapróba; újrapróba nélküli hívásnál nem", async () => {
  const { setRetryDelay } = await import("../server/lesson-result-email");
  const { logger } = await import("../server/lib/logger");
  const lines: string[] = [];
  const original = logger.error;
  logger.error = ((...args: unknown[]) => { lines.push(args.map(String).join(" ")); }) as typeof logger.error;
  const previous = setRetryDelay(150);
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    // Tartós adatbázishiba (64-nél hosszabb körkulcs): az első hívás és az EGY újrapróba is ide fut.
    assert.deepEqual(await sendLessonResult({ lessonId: "result-published", roundKey: "y".repeat(80), learner: "Vendég tanuló", graded }), { sent: 0, duplicate: false });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /— újrapróbálja$/);
    await new Promise(r => setTimeout(r, 900));
    assert.equal(lines.length, 2, "pontosan egy újrapróba futott (az újrapróba nem ütemez továbbit)");
    assert.doesNotMatch(lines[1], /újrapróbálja/);
    lines.length = 0;
    await sendLessonResult({ lessonId: "result-published", roundKey: "z".repeat(80), learner: "Vendég tanuló", graded }, false);
    await new Promise(r => setTimeout(r, 600));
    assert.equal(lines.length, 1, "újrapróba nélküli hívás nem ütemez");
  } finally { setRetryDelay(previous); logger.error = original; }
});

test("PR #495 (Codex P2): bukott küldés + átmenetileg sikertelen felszabadítás → az újrapróbált felszabadítás után a következő hívás ténylegesen küld", async () => {
  const { setReleaseFault } = await import("../server/lesson-result-email");
  sent.length = 0;
  let failB = true;
  let faults = 1;
  setResultSender(async (subject, html, to) => { if (to === "admin-b@example.test" && failB) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
  setReleaseFault(() => { if (faults > 0) { faults--; throw Object.assign(new Error("connection terminated"), { code: "57P01" }); } }, 20);
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const roundKey = roundKeyOf("t", "quiz", "round-release-retry");
    const call = () => sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false);
    assert.deepEqual(await call(), { sent: 1, duplicate: false });
    assert.equal(faults, 0, "az első felszabadítási kísérlet hibát kapott");
    const stored = async () => (await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, "result-published"), eq(lessonResultEmails.roundKey, roundKey))))[0].delivered;
    assert.deepEqual(await stored(), ["admin-a@example.test"], "a második kísérlet felszabadította a bukott címzett foglalását");
    failB = false;
    assert.deepEqual(await call(), { sent: 1, duplicate: false }, "a helyreállás után a következő hívás ténylegesen küld");
    assert.deepEqual(sent.map(s => s.to), ["admin-a@example.test", "admin-b@example.test"]);
  } finally { setReleaseFault(null); setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
});

test("PR #495: tartósan sikertelen felszabadítás — 3 kísérlet, utána egy naplósor a hiba osztályával (cím nélkül); az eset a kanban #128", async () => {
  const { setReleaseFault } = await import("../server/lesson-result-email");
  const { logger } = await import("../server/lib/logger");
  const lines: string[] = [];
  const original = logger.error;
  logger.error = ((...args: unknown[]) => { lines.push(args.map(String).join(" ")); }) as typeof logger.error;
  let attempts = 0;
  setResultSender(async (_subject, _html, to) => { if (to === "admin-b@example.test") throw new Error(`hiba: ${to}`); });
  setReleaseFault(() => { attempts++; throw Object.assign(new Error("admin-b@example.test: connection terminated"), { code: "57P01" }); }, 5);
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-release-stuck"), learner: "Vendég tanuló", graded }, false);
    assert.equal(attempts, 3);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /3 kísérlet után sem sikerült \(kanban #128\): Error \(57P01\)$/);
    assert.ok(!lines[0].includes("@"));
  } finally { logger.error = original; setReleaseFault(null); setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
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
  const { rubricHash } = await import("../shared/lesson-result-email");
  // S7: a lazítás workflow alatt fut; a futás tulajdonosa a lecke gyártója (a térkép `createdBy`-ja).
  await db.insert(users).values({ id: "s4c-owner" });
  await db.update(knowledgeMaps).set({ createdBy: "s4c-owner" }).where(eq(knowledgeMaps.id, "result-map"));
  const tightenedTask = tightenedLesson().experience!.tasks[0];
  const taskId = tightenedTask.id;
  const row = (i: number, falseReject: boolean, who = `c${i}`, hash = rubricHash(tightenedTask)) => ({ lessonId: "result-tightened", taskId, roundKey: roundKeyOf("s4c", String(i)),
    contributor: contributorKey(who), rubricHash: hash, detState: falseReject ? "partial" as const : "ok" as const, finalState: "ok" as const, arbiterRaised: falseReject, tightenedOnlyMiss: falseReject });
  // Review #340 (P1): egyetlen közreműködő 30 körrel (kliens által választott kör-azonosítókkal) sem lazít.
  await db.insert(taskResults).values(Array.from({ length: 30 }, (_, i) => row(1000 + i, true, "egy-kliens")));
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "egy közreműködő = 1, a küszöb alatt");
  await db.delete(taskResults).where(eq(taskResults.lessonId, "result-tightened"));
  // Review #340 (P2): a régi rubrikára (más lenyomat) adott eredmények nem számítanak.
  await db.insert(taskResults).values(Array.from({ length: 30 }, (_, i) => row(2000 + i, true, `regi${i}`, "0".repeat(64))));
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "régi rubrika eredményei nem számítanak");
  await db.delete(taskResults).where(eq(taskResults.lessonId, "result-tightened"));
  await db.insert(taskResults).values(Array.from({ length: RELAX_MIN_ANSWERED - 1 }, (_, i) => row(i, i < 10)));
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "19 kör: a küszöb alatt");
  await db.insert(taskResults).values(row(99, false));
  const relaxed = await maybeRelaxTightening("result-tightened", [taskId]);
  assert.deepEqual(relaxed, [taskId]);
  const [saved] = await db.select().from(lessons).where(eq(lessons.id, "result-tightened"));
  const t = (saved.json as typeof lesson).experience!.tasks[0];
  assert.equal(saved.version, 2);
  // Review #340 (P1): a csoport nem kerül ki (a pont sehol sem csökkenhet), hanem a többi kötelező fogalommal is teljesül.
  assert.equal(t.required.length, tightenedTask.required.length);
  const relaxedGroup = t.required.find(g => g[0] === "kötelezőszó")!;
  assert.ok(tightenedTask.required.filter(g => g[0] !== "kötelezőszó").flat().every(m => relaxedGroup.includes(m)), JSON.stringify(t.required));
  assert.deepEqual(t.relaxedTightening?.previousRequired, tightenedTask.required, "a pontos előállapot mentve");
  assert.equal(t.tightened, undefined);
  assert.deepEqual({ answered: t.relaxedTightening?.answered, falseRejects: t.relaxedTightening?.falseRejects }, { answered: 20, falseRejects: 10 });
  assert.deepEqual(await maybeRelaxTightening("result-tightened", [taskId]), [], "már lazított: nincs második módosítás");
  assert.equal((await db.select().from(lessons).where(eq(lessons.id, "result-tightened")))[0].version, 2);
  const runs = await db.execute(sql`select snapshot->>'state' as state, snapshot->'definition'->>'mode' as mode from lesson_workflow_runs where owner_id = 's4c-owner'`);
  assert.ok(runs.rows.some((r) => (r as { mode: string; state: string }).mode === "relax" && (r as { state: string }).state === "done"), JSON.stringify(runs.rows));
});

/* Spec 2026-11-17-eredmeny-email-kviz (S1b): a félbehagyott helyi kvíz — késleltetett küldés a legutolsó pillanatképből. */
test("S1b valódi HTTP + DB: két pillanatkép → EGY „félbehagyva” levél a legutolsóból; a végleges a várakozót törli; a késői végleges jelzi a felülírást", async () => {
  const { setPartialDelay, clearPendingPartials } = await import("../server/lesson-result-email");
  const previous = setPartialDelay(400);
  const q = lesson.experience!.quiz.slice(0, 5);
  const picks = (answered: number) => Object.fromEntries(q.map((item, i) => [item.id, i < answered ? item.correctIndex : -1]));
  const post = (body: object) => fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    // 0 válasz: nincs mit küldeni.
    sent.length = 0;
    const empty = await post({ kind: "quiz", roundId: "round-partial-0", picks: picks(0), partial: true, fingerprint: "fp-p0" });
    assert.deepEqual([empty.status, await empty.json()], [202, { queued: false }]);
    // Két pillanatkép (2, majd 4 válasz) a késleltetésen belül → egy levél, a 4 válaszos állapotból.
    const first = await post({ kind: "quiz", roundId: "round-partial-a", picks: picks(2), partial: true, fingerprint: "fp-pa", startedAt: Date.now() - 600_000 });
    assert.deepEqual([first.status, await first.json()], [202, { queued: true, partial: true }]);
    await new Promise(r => setTimeout(r, 150));
    assert.equal(sent.length, 0, "a pillanatkép nem küld azonnal");
    await post({ kind: "quiz", roundId: "round-partial-a", picks: picks(4), partial: true, fingerprint: "fp-pa", startedAt: Date.now() - 600_000 });
    await waitFor(() => sent.length === 2);
    await new Promise(r => setTimeout(r, 600));
    assert.equal(sent.length, 2, "körönként egy „félbehagyva” levél (címzettenként)");
    // Terv R5 (vak ellenőrzés S3): az „összes” a SZERVER körmérete (a fixture köre 25 kérdés), nem a beküldött 5 azonosító száma.
    const roundSize = experienceRoundSizes(lesson.experience!).quizRound;
    assert.equal(roundSize, 25);
    assert.match(sent[0].subject, new RegExp(`— Kvíz \\(félbehagyva: 4 / ${roundSize}\\) — 100% `));
    assert.match(sent[0].html, new RegExp(`félbehagyva — 4 / ${roundSize} kérdésre válaszolt`));
    assert.match(sent[0].html, /A kör kezdete:/);
    // A „félbehagyva” levél UTÁN befejezett kör: a végleges levél jelzi a felülírást.
    const final = await post({ kind: "quiz", roundId: "round-partial-a", picks: picks(5), fingerprint: "fp-pa" });
    assert.equal(final.status, 202);
    await waitFor(() => sent.length === 4);
    assert.equal(sent.length, 4);
    assert.match(sent[2].subject, /— Kvíz — 100% /);
    assert.match(sent[2].html, /a korábbi, „félbehagyva” jelzésű levél helyébe lép/);
    // Pillanatkép, majd a késleltetésen BELÜL a végleges: csak a végleges megy, felülíró mondat nélkül.
    sent.length = 0;
    await post({ kind: "quiz", roundId: "round-partial-b", picks: picks(3), partial: true, fingerprint: "fp-pb" });
    await post({ kind: "quiz", roundId: "round-partial-b", picks: picks(5), fingerprint: "fp-pb" });
    await waitFor(() => sent.length === 2);
    await new Promise(r => setTimeout(r, 800));
    assert.equal(sent.length, 2, "a várakozó pillanatkép törlődött — nincs ellentmondó levélpár");
    assert.ok(sent.every(mail => /— Kvíz — 100% /.test(mail.subject) && !/helyébe lép/.test(mail.html)));
  } finally { clearPendingPartials(); setPartialDelay(previous); }
});

test("review B1 (valódi HTTP + DB): vendégnél az UJJLENYOMAT NÉLKÜLI pillanatkép és az ujjlenyomatos végleges beküldés — a végleges törli a várakozót, nincs ellentmondó levél", async () => {
  const { setPartialDelay, clearPendingPartials, pendingPartialCount } = await import("../server/lesson-result-email");
  const previous = setPartialDelay(500);
  const q = lesson.experience!.quiz.slice(0, 5);
  const picks = (answered: number) => Object.fromEntries(q.map((item, i) => [item.id, i < answered ? item.correctIndex : -1]));
  const post = (body: object) => fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    sent.length = 0;
    // A valódi kliens törzse: a lap elhagyásakor az ujjlenyomat még hiányozhat (nincs `fingerprint` mező) …
    const snapshot = await post({ kind: "quiz", roundId: "round-b1", picks: picks(3), partial: true, startedAt: Date.now() - 60_000 });
    assert.deepEqual(await snapshot.json(), { queued: true, partial: true });
    const before = pendingPartialCount();
    // … a végleges beküldés viszont ujjlenyomattal megy (resultReport.ts: getFingerprint).
    assert.equal((await post({ kind: "quiz", roundId: "round-b1", picks: picks(5), fingerprint: "fp-b1", startedAt: Date.now() - 60_000 })).status, 202);
    await waitFor(() => sent.length === 2);
    assert.equal(pendingPartialCount(), before - 1, "a végleges beküldés törölte a várakozó pillanatképet");
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(sent.length, 2, "nincs késői „félbehagyva” levél a befejezett kör mellé");
    assert.ok(sent.every(mail => /— Kvíz — 100% /.test(mail.subject) && !/félbehagyva/.test(mail.subject)));
  } finally { clearPendingPartials(); setPartialDelay(previous); }
});

test("review K1: tanulónként legfeljebb 3 várakozó kör — a negyedik a legrégebbit szorítja ki (nem a jogos újat dobja el)", async () => {
  const { setPartialDelay, clearPendingPartials, pendingPartialCount, MAX_PENDING_PER_LEARNER } = await import("../server/lesson-result-email");
  const previous = setPartialDelay(60_000);
  clearPendingPartials();
  const q = lesson.experience!.quiz.slice(0, 5);
  const picks = Object.fromEntries(q.map((item, i) => [item.id, i < 2 ? item.correctIndex : -1]));
  const post = (roundId: string, fingerprint: string) => fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "quiz", roundId, picks, partial: true, fingerprint }) });
  try {
    assert.equal(MAX_PENDING_PER_LEARNER, 3);
    for (const round of ["round-k1-a", "round-k1-b", "round-k1-c", "round-k1-d"]) {
      const res = await post(round, "fp-k1");
      assert.deepEqual(await res.json(), { queued: true, partial: true }, `${round}: a jogos pillanatkép nem vész el`);
    }
    assert.equal(pendingPartialCount(), 3, "tanulónként 3 várakozó");
    assert.deepEqual(await (await post("round-k1-other", "fp-k1-masik")).json(), { queued: true, partial: true });
    assert.equal(pendingPartialCount(), 4, "a másik tanuló saját kerete független");
  } finally { clearPendingPartials(); setPartialDelay(previous); }
});

test("PR #510 (Codex P2): a VÉGLEGESÍTETT kör késve érkező pillanatképe nem küld „félbehagyva” levelet — memóriából és a nyilvántartásból is; a fordított sorrend változatlan", async () => {
  const { setPartialDelay, clearPendingPartials, clearFinalizedRounds, pendingPartialCount, resetPartialLimiter } = await import("../server/lesson-result-email");
  resetPartialLimiter();
  const previous = setPartialDelay(300);
  const q = lesson.experience!.quiz.slice(0, 5);
  const picks = (answered: number) => Object.fromEntries(q.map((item, i) => [item.id, i < answered ? item.correctIndex : -1]));
  const post = (body: object) => fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    clearPendingPartials();
    // 1. sorrend: végleges → késői pillanatkép (ujjlenyomat NÉLKÜL: más vendég-kulcs — a memória körazonosítója fedi).
    sent.length = 0;
    assert.equal((await post({ kind: "quiz", roundId: "round-late-a", picks: picks(5), fingerprint: "fp-late" })).status, 202);
    const late = await post({ kind: "quiz", roundId: "round-late-a", picks: picks(3), partial: true });
    assert.deepEqual([late.status, await late.json()], [202, { queued: false, finalized: true }]);
    assert.equal(pendingPartialCount(), 0, "a késői pillanatkép nem ütemeződött");
    await waitFor(() => sent.length === 2);
    await new Promise(r => setTimeout(r, 900));
    assert.equal(sent.length, 2, "csak a végleges levél ment ki");
    assert.ok(sent.every(mail => !/félbehagyva/.test(mail.subject)));
    // Újraindítás utánzása: a memória üres — a nyilvántartás végleges sora (azonos kulcs: ugyanaz az ujjlenyomat) is megfogja.
    clearFinalizedRounds();
    const afterRestart = await post({ kind: "quiz", roundId: "round-late-a", picks: picks(4), partial: true, fingerprint: "fp-late" });
    assert.deepEqual(await afterRestart.json(), { queued: false, finalized: true });
    // Más (nem véglegesített) kör pillanatképe továbbra is ütemeződik.
    assert.deepEqual(await (await post({ kind: "quiz", roundId: "round-late-other", picks: picks(2), partial: true, fingerprint: "fp-late" })).json(), { queued: true, partial: true });
    clearPendingPartials();
    // 2. sorrend: pillanatkép már VÁRAKOZIK, közben megjön a végleges más vendég-kulccsal, majd a memória kiürül (újraindítás nélkül
    // nem történhet, de a küldés előtti ellenőrzést így mérjük): a várakozó levél a küldés ELŐTT is ellenőriz.
    sent.length = 0;
    await post({ kind: "quiz", roundId: "round-late-b", picks: picks(2), partial: true, fingerprint: "fp-late-b" });
    assert.equal(pendingPartialCount(), 1);
    assert.equal((await post({ kind: "quiz", roundId: "round-late-b", picks: picks(5), fingerprint: "fp-late-b" })).status, 202);
    assert.equal(pendingPartialCount(), 0, "a végleges beküldés törölte a várakozót");
    await waitFor(() => sent.length === 2);
    await new Promise(r => setTimeout(r, 900));
    assert.equal(sent.length, 2);
    assert.ok(sent.every(mail => /— Kvíz — 100% /.test(mail.subject)));
  } finally { clearPendingPartials(); setPartialDelay(previous); }
});

test("PR #510: a várakozó pillanatkép a KÜLDÉS ELŐTT is ellenőrzi, hogy a kör közben véglegesült-e (a végleges más példányon / más kulcson rögzült)", async () => {
  const { setPartialDelay, clearPendingPartials, sendLessonResult: sendResult, resetPartialLimiter } = await import("../server/lesson-result-email");
  resetPartialLimiter();
  const previous = setPartialDelay(400);
  const q = lesson.experience!.quiz.slice(0, 5);
  const picks = Object.fromEntries(q.map((item, i) => [item.id, i < 2 ? item.correctIndex : -1]));
  try {
    clearPendingPartials();
    sent.length = 0;
    const res = await fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "quiz", roundId: "round-late-c", picks, partial: true, fingerprint: "fp-late-c" }) });
    assert.deepEqual(await res.json(), { queued: true, partial: true });
    // A végleges eredmény a várakozás alatt KÖZVETLENÜL a nyilvántartásba kerül (nem az útvonalon át: a várakozót semmi nem törli).
    await sendResult({ lessonId: "result-published", roundKey: roundKeyOf("guest:fp-late-c", "quiz", "round-late-c"), learner: "Vendég tanuló", graded: gradeQuiz(q, Object.fromEntries(q.map(item => [item.id, item.correctIndex]))) }, false);
    assert.equal(sent.length, 2);
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(sent.length, 2, "a várakozó pillanatkép a küldés előtt észrevette a végleges sort — nincs „félbehagyva” levél");
  } finally { clearPendingPartials(); setPartialDelay(previous); }
});

test("review K1: a pillanatkép-keret 10 / 15 perc / cím — a 11. pillanatkép 429, a végleges beküldés kerete ettől független", async () => {
  const { setPartialDelay, clearPendingPartials, resetPartialLimiter } = await import("../server/lesson-result-email");
  const previous = setPartialDelay(60_000);
  resetPartialLimiter();
  const q = lesson.experience!.quiz.slice(0, 5);
  const picks = (answered: number) => Object.fromEntries(q.map((item, i) => [item.id, i < answered ? item.correctIndex : -1]));
  const post = (body: object) => fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (let i = 1; i <= 10; i++) assert.equal((await post({ kind: "quiz", roundId: "round-limit", picks: picks(2), partial: true, fingerprint: "fp-limit" })).status, 202, `${i}. pillanatkép`);
    assert.equal((await post({ kind: "quiz", roundId: "round-limit", picks: picks(3), partial: true, fingerprint: "fp-limit" })).status, 429);
    const before = sent.length;
    assert.equal((await post({ kind: "quiz", roundId: "round-limit", picks: picks(5), fingerprint: "fp-limit" })).status, 202, "a végleges beküldés átmegy");
    await waitFor(() => sent.length === before + 2);
    assert.equal(sent.length, before + 2);
  } finally { clearPendingPartials(); resetPartialLimiter(); setPartialDelay(previous); }
});
