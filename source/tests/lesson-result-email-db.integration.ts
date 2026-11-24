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
const { lessonResultsRouter, roundKeyOf, sendLessonResult, sendPracticeResult, setResultSender, setFinalMarkerFault, setOwnerCheckFault, setFinalClaimFault, setPairingFault } = await import("../server/lesson-result-email");

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

test("valódi DB (Codex-review #532): az újrapróba levele bájtra azonos az elsővel — a „Beküldve” ideje a kör ELSŐ beküldéséé (az idempotencia-kulcshoz)", async () => {
  sent.length = 0;
  let failB = true;
  setResultSender(async (subject, html, to) => { if (to === "admin-b@example.test" && failB) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
  try {
    const q = lesson.experience!.quiz;
    const graded = gradeQuiz(q, { [q[0].id]: q[0].correctIndex });
    const roundKey = roundKeyOf("t", "quiz", "round-retry-date");
    await sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false);
    // A kör első beküldése óta „eltelt idő”: a tárolt sor ideje a múltba kerül — az újrapróba levele ezt mutassa, ne a mostani percet.
    await dbPool.query("UPDATE lesson_result_emails SET created_at = '2026-01-05T10:00:00Z' WHERE lesson_id = 'result-published' AND round_key = $1", [roundKey]);
    failB = false;
    await sendLessonResult({ lessonId: "result-published", roundKey, learner: "Vendég tanuló", graded }, false);
    await sendLessonResult({ lessonId: "result-published", roundKey: roundKeyOf("t", "quiz", "round-retry-date-2"), learner: "Vendég tanuló", graded }, false);
    const b = sent.filter(s => s.to === "admin-b@example.test");
    assert.ok(b[0].html.includes("Beküldve:</strong> 2026. 01. 05. 11:00 (magyar idő)"), "az újrapróba a kör első beküldésének idejét viszi");
    assert.ok(!b[1].html.includes("2026. 01. 05. 11:00"), "másik kör: a saját (mostani) ideje");
  } finally { setResultSender(async (subject, html, to) => { sent.push({ subject, html, to }); }); }
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

/* Bontás B4a (#510 R27, R42, R47 szerver, R49 c): körönként egy végleges levél, kiléttől függetlenül — a `RESULT_PARTIAL_EMAIL` kapcsoló mögött. */
const postQuiz = (roundId: string, fingerprint: string, extra: Record<string, unknown> = {}) => {
  const q = lesson.experience!.quiz;
  return fetch(`${base}/api/lessons/result-published/results`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "quiz", roundId, picks: { [q[0].id]: q[0].correctIndex }, fingerprint, ...extra }) });
};
const withFlag = async (value: string | undefined, fn: () => Promise<void>) => {
  const previous = process.env.RESULT_PARTIAL_EMAIL;
  if (value === undefined) delete process.env.RESULT_PARTIAL_EMAIL; else process.env.RESULT_PARTIAL_EMAIL = value;
  try { await fn(); } finally { if (previous === undefined) delete process.env.RESULT_PARTIAL_EMAIL; else process.env.RESULT_PARTIAL_EMAIL = previous; }
};

test("B4a: kapcsoló KI — a főági viselkedés változatlan (két kilét két levélpár, jelzősor nem íródik)", async () => {
  await withFlag(undefined, async () => {
    sent.length = 0;
    assert.equal((await postQuiz("b4-off", "fp-a")).status, 202);
    await waitFor(() => sent.length === 2);
    const res = await postQuiz("b4-off", "fp-b");
    assert.deepEqual(await res.json(), { queued: true });
    await waitFor(() => sent.length === 4);
    assert.equal(sent.length, 4);
    const marker = await db.select().from(lessonResultEmails).where(and(eq(lessonResultEmails.lessonId, "result-published"), eq(lessonResultEmails.roundKey, roundKeyOf("final-round", "quiz", "b4-off"))));
    assert.equal(marker.length, 0, "KI állásban nem íródik végleges jelzősor");
  });
});

test("B4a (R27): kapcsoló BE — ugyanannak a körnek más kilétű ismétlése duplikátum, második levél nem megy; azonos kilét a pótlásra fut", async () => {
  await withFlag("on", async () => {
    sent.length = 0;
    assert.deepEqual(await (await postQuiz("b4-on", "fp-a")).json(), { queued: true });
    await waitFor(() => sent.length === 2);
    assert.deepEqual(await (await postQuiz("b4-on", "fp-b")).json(), { queued: false, duplicate: true });
    assert.deepEqual(await (await postQuiz("b4-on", "fp-a")).json(), { queued: true }, "azonos kilét: a címzettenkénti pótlásra fut");
    await new Promise(r => setTimeout(r, 300));
    assert.equal(sent.length, 2, "egy levélpár a körre");
  });
});

test("B4a (R42): a jelzősor után, a 202 előtt megszakadt első kérés — az eredeti beküldő ismétlése küld, más kilét duplikátum", async () => {
  await withFlag("on", async () => {
    sent.length = 0;
    setFinalClaimFault(() => { throw new Error("megszakadt"); });
    try { assert.equal((await postQuiz("b4-r42", "fp-a")).status, 500); } finally { setFinalClaimFault(null); }
    assert.deepEqual(await (await postQuiz("b4-r42", "fp-b")).json(), { queued: false, duplicate: true });
    assert.deepEqual(await (await postQuiz("b4-r42", "fp-a")).json(), { queued: true });
    await waitFor(() => sent.length === 2);
    assert.equal(sent.length, 2);
  });
});

test("B4a (R49 c, R51 L2): a jelzősor írásának és a tulajdonos-lekérdezésnek az átmeneti hibája 503 a 202 előtt; az élettartam-frissítés hibája nem", async () => {
  await withFlag("on", async () => {
    sent.length = 0;
    setFinalMarkerFault(stage => { if (stage === "insert") throw new Error("db"); });
    try { assert.equal((await postQuiz("b4-503", "fp-a")).status, 503); } finally { setFinalMarkerFault(null); }
    assert.deepEqual(await (await postQuiz("b4-503", "fp-a")).json(), { queued: true }, "a hiba után rögzítés nélkül újrapróbálható");
    await waitFor(() => sent.length === 2);
    setOwnerCheckFault(() => { throw new Error("db"); });
    try { assert.equal((await postQuiz("b4-503", "fp-b")).status, 503); } finally { setOwnerCheckFault(null); }
    setFinalMarkerFault(stage => { if (stage === "ttl") throw new Error("db"); });
    try { assert.deepEqual(await (await postQuiz("b4-503", "fp-b")).json(), { queued: false, duplicate: true }, "a tulajdonos-ellenőrzés a ttl-hiba után is fut"); }
    finally { setFinalMarkerFault(null); }
    await new Promise(r => setTimeout(r, 300));
    assert.equal(sent.length, 2);
  });
});

test("B4a (R47 szerver): a párosítás feloldásának átmeneti hibája BE állásban 503 (nem vendég); KI állásban a régi vendég-út", async () => {
  setPairingFault(() => { throw new Error("db"); });
  try {
    await withFlag("on", async () => {
      sent.length = 0;
      assert.equal((await postQuiz("b4-pair", "fp-a", { learner: "token-xyz" })).status, 503);
      await new Promise(r => setTimeout(r, 200));
      assert.equal(sent.length, 0, "rögzítés és levél nélkül");
    });
    await withFlag(undefined, async () => {
      assert.deepEqual(await (await postQuiz("b4-pair-off", "fp-a", { learner: "token-xyz" })).json(), { queued: true });
    });
  } finally { setPairingFault(null); }
});
