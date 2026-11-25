import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { knowledgeMaps, lessons, users } from "../shared/schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// U4b (docs/specs/2026-11-24-osszevont-eredmenylevel.md, E2, E3, E5, E6, E8–E10): kétrészes leckénél a szöveges feladatok és a kvíz
// végleges eredménye EGY levélben megy; az első rész félreteendő (`awaiting`), a második párosít — eldobható Postgresben, hamis küldővel.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
process.env.ADMIN_EMAILS = "admin-a@example.test, admin-b@example.test";
const { db, dbPool } = await import("../server/db");
const { lessonResultsRouter, sendPracticeResult, setResultSender, setRetryDelay } = await import("../server/lesson-result-email");

const sent: Array<{ subject: string; html: string; to: string }> = [];
let failing = false;
setResultSender(async (subject, html, to) => { if (failing) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
setRetryDelay(50);
const lesson = fusionFixture();
const ex = lesson.experience!;
let base = "";
let close = () => {};
before(async () => {
  await db.insert(knowledgeMaps).values({ id: "comb-map", title: "Összevont", subject: "matematika", classroom: 6, sourceFiles: [], inputHash: "combined-integration-only" });
  await db.insert(lessons).values([
    { id: "comb-two", mapId: "comb-map", json: lesson, version: 1, publishedAt: new Date() },
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
beforeEach(() => { sent.length = 0; failing = false; process.env.RESULT_COMBINED_EMAIL = "on"; });
// Review #586: rögzített alvás helyett korlátos várakozás a várt levélszámra, utána rövid türelmi idő a fölösleges levél elkapására.
const settle = async (expected = 0) => {
  for (let i = 0; i < 100 && sent.length < expected; i++) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 250));
};
const post = async (lessonId: string, body: Record<string, unknown>, user?: string) => {
  const r = await fetch(`${base}/api/lessons/${lessonId}/results`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};
const quizBody = (fp: string, roundId: string) => ({ kind: "quiz", roundId, fingerprint: fp, picks: { [ex.quiz[0].id]: ex.quiz[0].correctIndex, [ex.quiz[1].id]: ex.quiz[1].correctIndex } });
const tasksBody = (fp: string, roundId: string) => ({ kind: "tasks", roundId, fingerprint: fp, answers: { [ex.tasks[0].id]: ex.tasks[0].sample } });
// E1 (egyrészes lecke): a lecke sémája minden tapasztalatban legalább 1 feladatot és 2 kvízkérdést ír elő (shared/lesson-experience.ts),
// így az összevont út minden tapasztalatos leckére vonatkozik; az `isTwoPartExperience` a régi / hiányos adatot védi (egységteszt).
const open = async (owner: string) => (await dbPool.query(`SELECT kind, round_id FROM lesson_result_pending WHERE lesson_id = 'comb-two' AND owner_key = $1 AND sent_at IS NULL`, [owner])).rows;

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
  await settle(2);
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
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, / — Kvíz — /);
  assert.deepEqual(await open("guest:fp-c"), []);
});

test("E8: üres várakozóállapotból a két rész egyszerre (két kapcsolat) → pontosan egy összevont levél, nem marad nyitott sor", async () => {
  const [a, b] = await Promise.all([post("comb-two", quizBody("fp-d", "d-q1")), post("comb-two", tasksBody("fp-d", "d-t1"))]);
  assert.equal(a.status, 202);
  assert.equal(b.status, 202);
  assert.equal([a.body.combined, b.body.combined].filter(Boolean).length, 1, "pontosan az egyik párosít");
  await settle(2);
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
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /Feladatok \+ kvíz/);
  assert.deepEqual(await open("comb-user"), []);
});

// Review #586 — a kézbesítés tartóssága, a kilét és a kapcsoló-időszakok.
const delivered = async (owner: string) => (await dbPool.query(`SELECT kind, delivered_at IS NOT NULL AS d FROM lesson_result_pending WHERE owner_key = $1 AND sent_reason = 'pair' ORDER BY kind`, [owner])).rows;

test("R1: a sikertelen kézbesítés után a pár nincs lezárva; a kör ismételt beküldése újrakézbesít, utána delivered_at íródik", async () => {
  await post("comb-two", quizBody("fp-r1", "r1-q"));
  failing = true;
  const t = await post("comb-two", tasksBody("fp-r1", "r1-t"));
  assert.equal(t.body.combined, true);
  await new Promise(r => setTimeout(r, 600));
  assert.equal(sent.length, 0);
  assert.deepEqual(await delivered("guest:fp-r1"), [{ kind: "quiz", d: false }, { kind: "tasks", d: false }]);
  failing = false;
  const again = await post("comb-two", tasksBody("fp-r1", "r1-t"));
  assert.equal(again.body.alreadySent, true);
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /Feladatok \+ kvíz/);
  assert.deepEqual(await delivered("guest:fp-r1"), [{ kind: "quiz", d: true }, { kind: "tasks", d: true }]);
  sent.length = 0;
  await post("comb-two", quizBody("fp-r1", "r1-q"));
  await settle();
  assert.equal(sent.length, 0, "a kézbesített pár nem megy újra");
});

test("R2: ujjlenyomat nélküli vendég (kétértelmű kilét) nem párosul — a régi egyrészes út", async () => {
  const { fingerprint: _omit, ...body } = quizBody("x", "r2-q");
  const r = await post("comb-two", body);
  assert.equal(r.body.awaiting, undefined);
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, / — Kvíz — /);
});

test("R3: a régebbi kör (kezdési idő szerint) ismétlése nem írja felül az újabb félretett kört", async () => {
  await post("comb-two", { ...quizBody("fp-r3", "r3-new"), startedAt: Date.now() - 1_000 });
  await post("comb-two", { ...quizBody("fp-r3", "r3-old"), startedAt: Date.now() - 60_000 });
  assert.deepEqual(await open("guest:fp-r3"), [{ kind: "quiz", round_id: "r3-new" }]);
});

test("R4: 7 napnál régebbi félretett rész nem párosul (a söprő kezeli)", async () => {
  await dbPool.query(`INSERT INTO lesson_result_pending (lesson_id, owner_key, kind, round_id, graded, learner, created_at)
    VALUES ('comb-two', 'guest:fp-r4', 'quiz', 'r4-old', '{"kind":"quiz"}', '{"learner":"Vendég","guest":true}', now() - interval '8 days')`);
  const t = await post("comb-two", tasksBody("fp-r4", "r4-t"));
  assert.equal(t.body.awaiting, "quiz");
  await settle();
  assert.equal(sent.length, 0);
  assert.equal((await open("guest:fp-r4")).length, 2, "az elavult kvíz és az új feladat is nyitott");
});

test("R5: a kapcsoló KI állásában a korábban félretett rész a régi úton, egyrészes levélként megy (nem marad elavult pár)", async () => {
  await post("comb-two", quizBody("fp-r5", "r5-q"));
  process.env.RESULT_COMBINED_EMAIL = "off";
  await post("comb-two", tasksBody("fp-r5", "r5-t"));
  await settle(4);
  assert.equal(sent.length, 4, "a feladat és a félretett kvíz is külön levélben");
  assert.ok(sent.some(m => / — Kvíz — /.test(m.subject)) && sent.some(m => / — Feladatok — /.test(m.subject)));
  assert.deepEqual(await open("guest:fp-r5"), []);
  // A kézbesítés nyoma a háttérküldés UTÁN íródik — korlátos várakozás (CI-terhelés alatt lassabb), nem fix alvás.
  let rows: Array<{ d: boolean }> = [];
  for (let i = 0; i < 60; i++) {
    rows = (await dbPool.query(`SELECT delivered_at IS NOT NULL AS d FROM lesson_result_pending WHERE owner_key = 'guest:fp-r5'`)).rows;
    if (rows.every(r => r.d)) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.deepEqual(rows, [{ d: true }], "a kiürített rész csak sikeres küldés után kap delivered_at-et");
});

test("R7: a kiürített rész sikertelen küldés után kézbesítetlen marad (a söprő pótolja)", async () => {
  await post("comb-two", quizBody("fp-r7", "r7-q"));
  process.env.RESULT_COMBINED_EMAIL = "off";
  failing = true;
  await post("comb-two", tasksBody("fp-r7", "r7-t"));
  await new Promise(r => setTimeout(r, 700));
  const rows = (await dbPool.query(`SELECT sent_reason, delivered_at IS NOT NULL AS d FROM lesson_result_pending WHERE owner_key = 'guest:fp-r7'`)).rows;
  assert.deepEqual(rows, [{ sent_reason: "timeout", d: false }]);
});

test("R6: a fiókos gyakorlókör azonosítója vendégként újraküldve sem képez új párt", async () => {
  const r = await post("comb-two", quizBody("fp-r6", "att-u1"));
  assert.equal(r.body.alreadySent, true);
  await settle();
  assert.equal(sent.length, 0);
});

// U4c — söprő (végrehajtás 3. pont): S1 = E4, az óra paraméterként.
const sweeper = () => import("../server/lesson-result-sweeper");
const rowsOf = async (owner: string) => (await dbPool.query(`SELECT kind, sent_reason, delivered_at IS NOT NULL AS d, graded IS NULL AS scrubbed
  FROM lesson_result_pending WHERE owner_key = $1 ORDER BY kind`, [owner])).rows;

test("S1 (E4): 7 napnál régebbi pár nélküli rész → egy jelölt részleges levél, timeout, kézbesítve, tartalom törölve", async () => {
  const { sweepPendingResults } = await sweeper();
  // A korábbi tesztek szándékosan hagyott maradéka (R4 elavult sora, R7 kézbesítetlen sora) ne keveredjen a söprő-tesztekbe.
  await dbPool.query(`UPDATE lesson_result_pending SET sent_at = coalesce(sent_at, now()), sent_reason = coalesce(sent_reason, 'timeout'),
    delivered_at = coalesce(delivered_at, now())`);
  await post("comb-two", quizBody("fp-s1", "s1-q"));
  await dbPool.query(`UPDATE lesson_result_pending SET created_at = now() - interval '8 days' WHERE owner_key = 'guest:fp-s1'`);
  await sweepPendingResults({ now: new Date() });
  await settle(2);
  assert.equal(sent.length, 2, "egy levél mindkét adminnak");
  assert.match(sent[0].subject, /Kvíz \(részleges: a feladatok hiányoznak\)/);
  assert.match(sent[0].html, /Részleges eredmény/);
  assert.deepEqual(await rowsOf("guest:fp-s1"), [{ kind: "quiz", sent_reason: "timeout", d: true, scrubbed: true }]);
  sent.length = 0;
  await sweepPendingResults({ now: new Date() });
  await settle();
  assert.equal(sent.length, 0, "S2: az újrafuttatás (újraindulás) nem küld újra");
});

test("S3: a 6 napos nyitott rész marad (a határ a paraméterként adott óra szerint számít)", async () => {
  const { sweepPendingResults } = await sweeper();
  await post("comb-two", quizBody("fp-s3", "s3-q"));
  await dbPool.query(`UPDATE lesson_result_pending SET created_at = now() - interval '6 days' WHERE owner_key = 'guest:fp-s3'`);
  await sweepPendingResults({ now: new Date() });
  await settle();
  assert.equal(sent.length, 0);
  assert.equal((await open("guest:fp-s3")).length, 1);
  await sweepPendingResults({ now: new Date(Date.now() + 2 * 86_400_000) });
  await settle(2);
  assert.equal(sent.length, 2, "két nappal későbbi órával már lejárt");
});

test("S4: a kézbesítetlen pár (szolgáltatói hiba után) a söprővel pótlódik", async () => {
  const { sweepPendingResults } = await sweeper();
  await post("comb-two", quizBody("fp-s4", "s4-q"));
  failing = true;
  await post("comb-two", tasksBody("fp-s4", "s4-t"));
  await new Promise(r => setTimeout(r, 600));
  failing = false;
  assert.equal(sent.length, 0);
  await dbPool.query(`UPDATE lesson_result_pending SET sent_at = now() - interval '20 minutes' WHERE owner_key = 'guest:fp-s4'`);
  await sweepPendingResults({ now: new Date() });
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, /Feladatok \+ kvíz/);
  assert.deepEqual((await rowsOf("guest:fp-s4")).map(r => r.d), [true, true]);
});

test("S5: a kiürített (KI állás) rész kézbesítetlen timeout sora a régi levélformával pótlódik", async () => {
  const { sweepPendingResults } = await sweeper();
  await post("comb-two", quizBody("fp-s5", "s5-q"));
  process.env.RESULT_COMBINED_EMAIL = "off";
  failing = true;
  await post("comb-two", tasksBody("fp-s5", "s5-t"));
  await new Promise(r => setTimeout(r, 700));
  failing = false;
  sent.length = 0;
  await dbPool.query(`UPDATE lesson_result_pending SET sent_at = now() - interval '20 minutes' WHERE owner_key = 'guest:fp-s5'`);
  await sweepPendingResults({ now: new Date() });
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, / — Kvíz — /, "a kiürítés régi (egyrészes) levélformája");
  assert.deepEqual((await rowsOf("guest:fp-s5")).map(r => r.d), [true]);
});

test("S6: két egyidejű söprés ugyanarra a lejárt részre pontosan egy levelet küld", async () => {
  const { sweepPendingResults } = await sweeper();
  await post("comb-two", tasksBody("fp-s6", "s6-t"));
  await dbPool.query(`UPDATE lesson_result_pending SET created_at = now() - interval '9 days' WHERE owner_key = 'guest:fp-s6'`);
  await Promise.all([sweepPendingResults({ now: new Date() }), sweepPendingResults({ now: new Date() })]);
  await settle(2);
  assert.equal(sent.length, 2, "egy levél (két admin)");
  assert.match(sent[0].subject, /Feladatok \(részleges: a kvíz hiányzik\)/);
});

// Review #589 — a kézbesítési zár és a régi (U4b) sorok.
test("T1: a pair_key nélkül lezárt (U4b-kori) kézbesítetlen timeout sor a régi körkulccsal és levélformával pótlódik", async () => {
  const { sweepPendingResults } = await sweeper();
  await post("comb-two", quizBody("fp-t1", "t1-q"));
  await dbPool.query(`UPDATE lesson_result_pending SET sent_at = now() - interval '20 minutes', sent_reason = 'timeout', pair_key = NULL WHERE owner_key = 'guest:fp-t1'`);
  await sweepPendingResults({ now: new Date() });
  await settle(2);
  assert.equal(sent.length, 2);
  assert.match(sent[0].subject, / — Kvíz — /);
  assert.deepEqual((await rowsOf("guest:fp-t1")).map(r => r.d), [true]);
});

test("T2: két egyidejű pótlásból a második nem jelölheti kézbesítettnek a folyamatban lévő (később meghiúsuló) küldést", async () => {
  const { sweepPendingResults } = await sweeper();
  // Kézbesítetlen timeout sor új körrel (tartalommal), 20 perce elküldve; a küldő lassan, hibával válaszol.
  await post("comb-two", quizBody("fp-t2b", "t2b-q"));
  await dbPool.query(`UPDATE lesson_result_pending SET created_at = now() - interval '8 days' WHERE owner_key = 'guest:fp-t2b'`);
  setResultSender(async () => { await new Promise(r => setTimeout(r, 400)); throw new Error("lassú hiba"); });
  try {
    await sweepPendingResults({ now: new Date() }); // lejárt → timeout, a küldés meghiúsul
    await dbPool.query(`UPDATE lesson_result_pending SET sent_at = now() - interval '20 minutes' WHERE owner_key = 'guest:fp-t2b'`);
    await Promise.all([sweepPendingResults({ now: new Date() }), sweepPendingResults({ now: new Date() })]);
  } finally {
    setResultSender(async (subject, html, to) => { if (failing) throw new Error("átmeneti hiba"); sent.push({ subject, html, to }); });
  }
  const rows = await rowsOf("guest:fp-t2b");
  assert.deepEqual(rows.map(r => [r.d, r.scrubbed]), [[false, false]], "kézbesítetlen marad, a tartalma megvan (pótolható)");
});

// U4d (E9b): a bejelentkezett tanuló gyakorlókörének lezáró válasza a nézetben hozza a várakozó részt.
test("E9b: a gyakorlókör lezáró válaszának nézete resultAwaiting: tasks (a feladatok még hiányoznak)", async () => {
  const { beginPractice, answerPractice } = await import("../server/rewards/lesson-attempts");
  await db.insert(users).values({ id: "comb-user3", email: "comb-user3@example.test", firstName: "Teszt", lastName: "Hármas" }).onConflictDoNothing();
  const view = await beginPractice("comb-user3", "comb-two");
  let last: Record<string, unknown> = view as never;
  for (const q of view.questions) last = await answerPractice("comb-user3", view.id, q.id, 0, false) as never;
  assert.equal(last.resultAwaiting, "tasks");
});
