import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { gameQuizItems, gamesCatalog, htmlFiles, knowledgeMaps, lessons } from "../shared/schema";
import { canonicalLessonQuiz } from "../server/studio/canonical-quiz-bank";
import { COUPON_GAME_IDS } from "../server/studio/quiz-export";

// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { listGameQuizBank, listLatestMaterialQuizzes } = await import("../server/gameQuizBankService");
const { quizItemIdsOfLesson } = await import("../server/rewards/store");
after(() => dbPool.end());

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
  ]);
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
