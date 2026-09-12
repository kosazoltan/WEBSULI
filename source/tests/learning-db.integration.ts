import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { compactFusionFixture, fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { coupons, gameQuizItems, gamesCatalog, htmlFiles, knowledgeMaps, lessons, users } from "../shared/schema";
import { canonicalLessonQuiz } from "../server/studio/canonical-quiz-bank";
import { COUPON_GAME_IDS } from "../server/studio/quiz-export";
import express from "express";
import type { AddressInfo } from "node:net";

// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { listGameQuizBank, listLatestMaterialQuizzes } = await import("../server/gameQuizBankService");
const { quizItemIdsOfLesson } = await import("../server/rewards/store");
const { answerPractice, beginPractice, finishPractice, markPracticeHint, PracticeError, practiceReport, practiceReview, readPractice } = await import("../server/rewards/lesson-attempts");
after(() => dbPool.end());

test("real DB: coupon snapshots, first wrong answer, racing correct retries, expiry and bank changes", async () => {
  const { startCouponQuiz, answerCouponQuiz, CouponQuizError } = await import("../server/rewards/coupon-quiz");
  const learner = { userId: "learner-b", fingerprint: null };
  const now = new Date();
  await db.insert(coupons).values({ id: "coupon-answer-test", userId: learner.userId, lessonId: "practice", sectionIdx: 0,
    minutes: 10, reason: "section_good", expiresAt: new Date(now.getTime() + 3600_000) });
  const starts = await Promise.all(Array.from({ length: 4 }, () => startCouponQuiz(learner, "coupon-answer-test", now)));
  assert.ok(starts.every(s => s.remainingSeconds === 600));
  const [saved] = await db.select().from(coupons).where(eq(coupons.id, "coupon-answer-test"));
  assert.equal(saved.quizSnapshot.length, fusionFixture().experience!.quiz.length);
  const [wrong, right, changed] = saved.quizSnapshot;
  assert.equal((await answerCouponQuiz(learner, saved.id, wrong.id, (wrong.correctIndex + 1) % wrong.options.length, 30, now)).bonusSeconds, 0);
  await assert.rejects(answerCouponQuiz(learner, saved.id, wrong.id, wrong.correctIndex, 30, now), (e: unknown) => e instanceof CouponQuizError && e.reason === "first_answer_saved");
  const retries = await Promise.all(Array.from({ length: 5 }, () => answerCouponQuiz(learner, saved.id, right.id, right.correctIndex, 30, now)));
  assert.ok(retries.every(r => r.remainingSeconds === 630));
  await assert.rejects(answerCouponQuiz({ userId: "learner-a", fingerprint: null }, saved.id, right.id, right.correctIndex, 30, now), (e: unknown) => e instanceof CouponQuizError && e.status === 404);
  await assert.rejects(answerCouponQuiz(learner, saved.id, changed.id, 8, 30, now), (e: unknown) => e instanceof CouponQuizError && e.reason === "invalid_answer");
  const expired = new Date(now.getTime() + 3601_000);
  await assert.rejects(startCouponQuiz(learner, saved.id, expired), (e: unknown) => e instanceof CouponQuizError && e.reason === "expired");
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, "practice"));
  await db.update(lessons).set({ publishedAt: null }).where(eq(lessons.id, lesson.id));
  try {
    await assert.rejects(answerCouponQuiz(learner, saved.id, changed.id, changed.correctIndex, 30, now), (e: unknown) => e instanceof CouponQuizError && e.reason === "bank_changed");
  } finally { await db.update(lessons).set({ publishedAt: lesson.publishedAt }).where(eq(lessons.id, lesson.id)); }
  const bank = await listLatestMaterialQuizzes(1, 1, "practice");
  assert.deepEqual(bank.items.map(q => q.id).sort(), saved.quizSnapshot.map(q => q.id).sort());
  assert.equal((await listLatestMaterialQuizzes(7, 3, "draft")).items.length, 0);
});

before(async () => {
  await db.insert(gamesCatalog).values(COUPON_GAME_IDS.map(id => ({ id, title: id })));
  await db.insert(knowledgeMaps).values({ id: "map", title: "Szintetikus próba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "integration-only" });
  await db.insert(htmlFiles).values([
    { id: "fusion", title: "Közös bank", content: "lesson", classroom: 7 },
    { id: "legacy", title: "Régi bank", content: "html", classroom: 6 },
  ]);
  const old = compactFusionFixture(); old.experience!.quiz[0].question = "Régi, már javított kérdés";
  await db.insert(lessons).values([
    { id: "old", mapId: "map", htmlFileId: "fusion", json: old, version: 1, publishedAt: new Date() },
    { id: "current", mapId: "map", htmlFileId: "fusion", json: compactFusionFixture(), version: 2, publishedAt: new Date() },
    { id: "draft", mapId: "map", htmlFileId: "fusion", json: old, version: 3 },
    { id: "practice", mapId: "map", json: fusionFixture(), version: 1, publishedAt: new Date() },
  ]);
  await db.insert(users).values(["learner-a", "learner-b", "learner-hint", "learner-version", "learner-empty"].map(id => ({ id })));
  const legacyItems = Array.from({ length: 50 }, (_, i) => COUPON_GAME_IDS.map(gameId => ({
    gameId, tier: "1", sourceMaterialId: "legacy", prompt: `Régi kérdés ${String(i).padStart(3, "0")}`,
    options: ["Első", "Második", "Harmadik"], correctIndex: 0, explanation: "Ez a teljes magyarázat.",
  }))).flat();
  await db.insert(gameQuizItems).values([
    ...legacyItems,
    ...COUPON_GAME_IDS.map(gameId => ({ gameId, tier: "easy", sourceMaterialId: "fusion", lessonId: "old", prompt: "Elavult export", options: ["A", "B", "C"], correctIndex: 0 })),
    { gameId: COUPON_GAME_IDS[0], tier: "easy", lessonId: "draft", prompt: "Nem publikált", options: ["A", "B", "C"], correctIndex: 0, isActive: false },
  ]);
});

test("real DB: v4 has 25 saved questions at every age and supersedes a short round without losing its answers", async () => {
  for (const classroom of [1, 7]) {
    const id = `full-round-${classroom}`;
    await db.insert(users).values({ id });
    const full = standardFusionFixture(); full.classroom = classroom;
    const old = structuredClone(full); old.experience!.version = "fusion-7.4-3";
    old.experience!.methods = old.experience!.methods.slice(0, 2);
    old.experience!.bankPlan!.taskRound = classroom === 1 ? 3 : 5;
    old.experience!.bankPlan!.quizRound = classroom === 1 ? 5 : 10;
    await db.insert(lessons).values({ id, mapId: "map", json: old, version: 1, publishedAt: new Date() });
    const short = await beginPractice(id, id);
    assert.equal(short.questions.length, classroom === 1 ? 5 : 10);
    await answerPractice(id, short.id, short.questions[0].id, 0, false);
    await db.update(lessons).set({ json: full }).where(eq(lessons.id, id));
    const round = await beginPractice(id, id);
    assert.notEqual(round.id, short.id); assert.notEqual(round.bankVersion, short.bankVersion);
    assert.equal(round.questions.length, 25);
    assert.equal(new Set(round.questions.map(q => q.id)).size, 25);
    for (const q of round.questions) {
      const original = full.experience!.quiz.find(item => item.id === q.questionId)!;
      await answerPractice(id, round.id, q.id, original.correctIndex, false);
    }
    const restored = await readPractice(id, round.id);
    assert.equal(restored.questions.filter(q => q.answer).length, 25);
    const finished = await finishPractice(id, round.id);
    assert.equal(finished.result?.correctCount, 25); assert.equal(finished.result?.total, 25);
    const retained = await dbPool.query("SELECT answers,status FROM lesson_attempts WHERE id=$1", [short.id]);
    assert.equal(Object.keys(retained.rows[0].answers).length, 1); assert.equal(retained.rows[0].status, "superseded");
  }
});

test("real DB: concurrent starts resume one round, first answer is immutable and ownership is enforced", async () => {
  const started = await Promise.all(Array.from({ length: 5 }, () => beginPractice("learner-a", "practice")));
  assert.equal(new Set(started.map(r => r.id)).size, 1);
  const round = started[0]; const q = round.questions[0];
  assert.equal(round.questions.length, 10);
  assert.ok(!("correctIndex" in q) && !("feedbackPerOption" in q) && !("explanation" in q));
  await assert.rejects(readPractice("learner-b", round.id), (e: unknown) => e instanceof PracticeError && e.status === 404);
  await assert.rejects(answerPractice("learner-a", round.id, q.id, 99, false), (e: unknown) => e instanceof PracticeError && e.status === 400);
  await answerPractice("learner-a", round.id, q.id, 0, false);
  const duplicate = await answerPractice("learner-a", round.id, q.id, 0, false);
  assert.equal(duplicate.questions[0].answer?.pickedIndex, 0);
  await assert.rejects(answerPractice("learner-a", round.id, q.id, 1, false), (e: unknown) => e instanceof PracticeError && e.status === 409);
  assert.equal((await readPractice("learner-a", round.id)).questions[0].answer?.pickedIndex, 0);
  for (const item of round.questions.slice(1)) await answerPractice("learner-a", round.id, item.id, 0, false);
  const finished = await Promise.all(Array.from({ length: 6 }, () => finishPractice("learner-a", round.id)));
  assert.ok(finished[0].result?.coupon);
  assert.equal(new Set(finished.map(r => r.result?.coupon?.id)).size, 1);
  assert.equal(finished[0].result!.correctCount, 10);
  const next = await beginPractice("learner-a", "practice");
  assert.ok(next.questions.every(q => !round.questions.some(old => old.id === q.id)), "unseen questions are selected first");
  for (const item of next.questions) await answerPractice("learner-a", next.id, item.id, 0, false);
  const repeated = await finishPractice("learner-a", next.id);
  assert.equal(repeated.result!.coupon, null);
  assert.equal(repeated.result!.alreadyRewarded, true);
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(coupons).where(eq(coupons.userId, "learner-a"));
  assert.equal(count.count, 1);
});

test("real DB: help is remembered across reload; claiming usedHint=false cannot recover independent credit", async () => {
  const round = await beginPractice("learner-hint", "practice");
  for (const q of round.questions) {
    await markPracticeHint("learner-hint", round.id, q.id);
    await answerPractice("learner-hint", round.id, q.id, 0, false);
  }
  const saved = await readPractice("learner-hint", round.id);
  assert.ok(saved.questions.every(q => q.hintUsed && q.answer?.usedHint));
  const finished = await finishPractice("learner-hint", round.id);
  assert.equal(finished.result!.correctCount, 10);
  assert.equal(finished.result!.independentCorrect, 0);
  assert.equal(finished.result!.coupon, null);
  assert.deepEqual(finished.result!.weakConceptIds, ["area"]);
  const reviews = await practiceReview("learner-hint", "practice");
  assert.ok(reviews.every(r => r.streak === 0 && !r.due));
});

test("HTTP/DB: login required, untrusted score rejected, and competing first answers cannot both win", async () => {
  const { practiceRouter } = await import("../server/rewards/practice-router");
  const [testUser] = await db.select().from(users).where(eq(users.id, "learner-b"));
  const app = express(); app.use(express.json());
  // Test-only session fixture; the application router receives the same req.user contract.
  app.use((req, _res, next) => { if (req.headers["x-test-session"]) req.user = testUser; next(); });
  app.use("/practice", practiceRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/practice`;
  const headers = { "Content-Type": "application/json", "X-Test-Session": "on" };
  try {
    assert.equal((await fetch(`${base}/practice/start`, { method: "POST" })).status, 401);
    const started = await fetch(`${base}/practice/start`, { method: "POST", headers });
    assert.equal(started.status, 200);
    const round = await started.json() as Awaited<ReturnType<typeof beginPractice>>;
    const q = round.questions[0];
    const bad = await fetch(`${base}/${round.id}/answer`, { method: "POST", headers, body: JSON.stringify({ questionId: q.id, pickedIndex: 0, score: 100 }) });
    assert.equal(bad.status, 400);
    const competing = await Promise.all([0, 1].map(pickedIndex => fetch(`${base}/${round.id}/answer`, { method: "POST", headers, body: JSON.stringify({ questionId: q.id, pickedIndex }) })));
    assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
    const stored = await (await fetch(`${base}/${round.id}`, { headers })).json() as typeof round;
    assert.ok(stored.questions[0].answer);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test("real DB: edited bank invalidates open round; missing answers score zero; report exposes no learner IDs", async () => {
  const round = await beginPractice("learner-version", "practice");
  const changed = fusionFixture(); changed.experience!.quiz[0].feedbackPerOption[0] += " Javítva.";
  await db.update(lessons).set({ json: changed }).where(eq(lessons.id, "practice"));
  try {
    await assert.rejects(answerPractice("learner-version", round.id, round.questions[0].id, 0, false), (e: unknown) => e instanceof PracticeError && e.status === 409);
    const replacement = await beginPractice("learner-version", "practice");
    assert.notEqual(replacement.id, round.id);
    await assert.rejects(finishPractice("learner-version", round.id), (e: unknown) => e instanceof PracticeError && e.status === 409);
  } finally { await db.update(lessons).set({ json: fusionFixture() }).where(eq(lessons.id, "practice")); }
  const empty = await beginPractice("learner-empty", "practice");
  const beforeHint = (await practiceReport("practice")).questions.find(q => q.id === empty.questions[0].id)?.hints ?? 0;
  await markPracticeHint("learner-empty", empty.id, empty.questions[0].id);
  const finished = await finishPractice("learner-empty", empty.id);
  assert.equal(finished.result!.score, 0); assert.equal(finished.result!.coupon, null);
  const report = await practiceReport("practice");
  assert.equal(report.completedRounds, 4);
  assert.equal(report.questions.find(q => q.id === empty.questions[0].id)!.hints, beforeHint + 1);
  assert.ok(report.questions.some(q => q.wrong > 0 && q.hints > 0));
  assert.ok(!JSON.stringify(report).includes("learner-"));
});

test("real DB: five games and coupon use one current published bank with identical IDs and full feedback", async () => {
  const expected = canonicalLessonQuiz({ id: "current", json: compactFusionFixture(), htmlFileId: "fusion", version: 2 })!;
  for (const gameId of COUPON_GAME_IDS) {
    const rows = (await listGameQuizBank(gameId)).filter(q => q.sourceMaterialId === "fusion");
    assert.deepEqual(rows.map(q => q.id), expected.map(q => q.id));
    assert.deepEqual(rows.map(q => q.feedbackPerOption), expected.map(q => q.feedbackPerOption));
    assert.ok(rows.every(q => q.gameId === gameId && q.lessonId === "current"));
  }
  assert.deepEqual(await quizItemIdsOfLesson("current"), expected.map(q => q.id));
  assert.deepEqual(await quizItemIdsOfLesson("draft"), []);
  const material = await listLatestMaterialQuizzes(7);
  assert.deepEqual(material.items.map(q => q.id), expected.map(q => q.id));
  const [copies] = await db.select({ count: sql<number>`count(*)::int` }).from(gameQuizItems).where(eq(gameQuizItems.lessonId, "current"));
  assert.equal(copies.count, 0);
});

test("real PostgreSQL DISTINCT ON happens before limit: 250 game copies keep all 50 unique legacy questions", async () => {
  const result = await listLatestMaterialQuizzes(6);
  assert.equal(result.materials.length, 1);
  assert.equal(result.items.length, 50);
  assert.equal(new Set(result.items.map(q => q.prompt)).size, 50);
  assert.ok(result.items.every(q => q.tier === "easy" && q.explanation === "Ez a teljes magyarázat."));
});

test("real DB: replacing the current bank changes affected IDs and stale exports never reappear for an invalid bank", async () => {
  const original = compactFusionFixture();
  const before = await quizItemIdsOfLesson("current");
  const changed = compactFusionFixture(); changed.experience!.quiz[0].feedbackPerOption[0] += " Pontosított indoklás.";
  try {
    await db.update(lessons).set({ json: changed }).where(eq(lessons.id, "current"));
    const after = await quizItemIdsOfLesson("current");
    assert.notEqual(before[0], after[0]); assert.equal(before[1], after[1]);
    changed.experience!.quiz[0].options = ["Azonos", "Azonos", "Másik"];
    await db.update(lessons).set({ json: changed }).where(eq(lessons.id, "current"));
    assert.deepEqual(await quizItemIdsOfLesson("current"), []);
    assert.deepEqual((await listLatestMaterialQuizzes(7)).items, []);
    assert.deepEqual((await listGameQuizBank(COUPON_GAME_IDS[0])).filter(q => q.sourceMaterialId === "fusion"), []);
  } finally { await db.update(lessons).set({ json: original }).where(eq(lessons.id, "current")); }
});
