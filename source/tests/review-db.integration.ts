import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { knowledgeMaps, lessons, reviewEvents, reviewStates, users } from "../shared/schema";
import { lessonFlashcards } from "../shared/lesson-flashcards";
import express from "express";
import type { AddressInfo } from "node:net";

// Websuli Design §7 (docs/specs/2026-10-16-websuli-ismetles.md) — a memóriakártya-ismétlés valódi mentése, eldobható Postgresben.
// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { db, dbPool } = await import("../server/db");
const { rateCard, readReview, ReviewError } = await import("../server/rewards/review-store");
after(() => dbPool.end());

const lesson = fusionFixture();
const [card, other] = lessonFlashcards(lesson);
const DAY = 86_400_000;

before(async () => {
  await db.insert(knowledgeMaps).values({ id: "review-map", title: "Ismétlés próba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "review-integration-only" });
  await db.insert(lessons).values([
    { id: "review-published", mapId: "review-map", json: lesson, version: 1, publishedAt: new Date() },
    { id: "review-draft", mapId: "review-map", json: lesson, version: 2 },
  ]);
  await db.insert(users).values(["review-a", "review-b", "review-race"].map(id => ({ id })));
});

test("valódi DB: az értékelés eseményt és a §7 szerinti állapotot ment; a szerver órája számít", async () => {
  const t0 = new Date("2026-10-16T08:00:00.000Z");
  const first = await rateCard("review-a", "review-published", card.id, "known", t0);
  assert.deepEqual(first.state, { intervalDays: 1, repetitions: 1, dueAt: new Date(t0.getTime() + DAY).toISOString() });
  const t1 = new Date(t0.getTime() + DAY);
  const second = await rateCard("review-a", "review-published", card.id, "known", t1);
  assert.equal(second.state.intervalDays, 2);
  const again = await rateCard("review-a", "review-published", card.id, "again", t1);
  assert.deepEqual(again.state, { intervalDays: 0, repetitions: 0, dueAt: new Date(t1.getTime() + 10 * 60_000).toISOString() });
  const events = await db.select().from(reviewEvents).where(and(eq(reviewEvents.userId, "review-a"), eq(reviewEvents.cardId, card.id)));
  assert.deepEqual(events.map(e => e.rating).sort(), ["again", "known", "known"]);
  const rows = await db.select().from(reviewStates).where(eq(reviewStates.userId, "review-a"));
  assert.equal(rows.length, 1, "kártyánként egy aktuális állapot");
  assert.deepEqual((await readReview("review-a", "review-published")).states, { [card.id]: again.state });
});

test("valódi DB: ismeretlen kártya 400, publikálatlan vagy nem létező lecke 404; a tanulók nem látják egymást", async () => {
  await assert.rejects(rateCard("review-a", "review-published", "q:nincs-ilyen", "known"), (e: unknown) => e instanceof ReviewError && e.status === 400);
  await assert.rejects(rateCard("review-a", "review-draft", card.id, "known"), (e: unknown) => e instanceof ReviewError && e.status === 404);
  await assert.rejects(readReview("review-a", "nincs-ilyen-lecke"), (e: unknown) => e instanceof ReviewError && e.status === 404);
  await rateCard("review-b", "review-published", other.id, "known");
  assert.deepEqual(Object.keys((await readReview("review-b", "review-published")).states), [other.id]);
  assert.ok(!(other.id in (await readReview("review-a", "review-published")).states));
  assert.equal((await db.select().from(reviewEvents).where(eq(reviewEvents.lessonId, "review-draft"))).length, 0);
});

test("valódi DB: párhuzamos értékelések mind eseményként mentődnek, az állapot sorosítva lép", async () => {
  const now = new Date("2026-10-16T09:00:00.000Z");
  await Promise.all(Array.from({ length: 5 }, () => rateCard("review-race", "review-published", card.id, "known", now)));
  const events = await db.select().from(reviewEvents).where(eq(reviewEvents.userId, "review-race"));
  assert.equal(events.length, 5);
  const [state] = await db.select().from(reviewStates).where(eq(reviewStates.userId, "review-race"));
  assert.equal(state.repetitions, 5);
  assert.equal(state.intervalDays, 16);
});

test("HTTP/DB: vendégnek 401, hibás vagy ismeretlen mezős értékelés 400, a kliens nem küldhet állapotot", async () => {
  const { reviewRouter } = await import("../server/rewards/review-router");
  const [testUser] = await db.select().from(users).where(eq(users.id, "review-b"));
  const app = express(); app.use(express.json());
  // Test-only session fixture; the application router receives the same req.user contract.
  app.use((req, _res, next) => { if (req.headers["x-test-session"]) req.user = testUser; next(); });
  app.use("/review", reviewRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/review/review-published`;
  const headers = { "Content-Type": "application/json", "X-Test-Session": "on" };
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(`${base}/rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, rating: "known" }) })).status, 401);
    assert.equal((await fetch(`${base}/rate`, { method: "POST", headers, body: JSON.stringify({ cardId: card.id, rating: "perfect" }) })).status, 400);
    assert.equal((await fetch(`${base}/rate`, { method: "POST", headers, body: JSON.stringify({ cardId: card.id, rating: "known", dueAt: "2099-01-01T00:00:00Z" }) })).status, 400);
    const ok = await fetch(`${base}/rate`, { method: "POST", headers, body: JSON.stringify({ cardId: card.id, rating: "known" }) });
    assert.equal(ok.status, 200);
    const saved = await ok.json() as { cardId: string; state: { intervalDays: number } };
    assert.equal(saved.state.intervalDays, 1);
    const view = await (await fetch(base, { headers })).json() as { states: Record<string, unknown> };
    assert.deepEqual(Object.keys(view.states).sort(), [card.id, other.id].sort());
  } finally { server.close(); }
});
