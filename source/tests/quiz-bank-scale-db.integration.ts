/**
 * #67 (havi audit T1, 2026-11-16) — a `GET /api/games/quiz-bank/:gameId` nem dolgozhat a leckék számával arányosan
 * kérésenként. Terv: docs/specs/2026-11-16-quiz-bank-memoria.md (A2–A7). Valódi, eldobható Postgres (run-learning-db-tests).
 *
 * 300 közzétett anyag × 2 közzétett verzió (+ piszkozat, régi formátumú legfrissebb verzió, anyag nélküli lecke,
 * régi exportok). A régi algoritmus (minden közzétett sor teljes JSON-ja + canonicalBanks) a viszonyítás: a válasz
 * tartalma és sorrendje nem változhat.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import pg from "pg";
import { and, desc, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { isPlayableQuestion, uniqueQuizContent } from "../shared/game-quiz-contract";
import { gameQuizItems, gamesCatalog, htmlFiles, knowledgeMaps, lessons } from "../shared/schema";
import { canonicalBanks } from "../server/studio/canonical-quiz-bank";
import { COUPON_GAME_IDS } from "../server/studio/quiz-export";

// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);

// Lekérdezés-számláló a pg kliensen: hány lekérdezés fut, és egy `json`-t olvasó lekérdezés hány sort ad vissza.
const probe = { queries: 0, maxJsonRows: 0, jsonDelayMs: 0, failNextJson: false };
const originalQuery = pg.Client.prototype.query as (...args: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: unknown }).query = function (this: unknown, ...args: unknown[]) {
  probe.queries++;
  const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text ?? "";
  const readsJson = /"json"/.test(text) && /from "lessons"/i.test(text);
  const note = (rows: unknown[] | undefined) => { if (readsJson) probe.maxJsonRows = Math.max(probe.maxJsonRows, rows?.length ?? 0); };
  const cb = args.findIndex(a => typeof a === "function");
  if (cb >= 0) {
    const done = args[cb] as (e: unknown, r: { rows?: unknown[] }) => void;
    // Review #478 (L4): a lecke-JSON lekérdezés késleltethető (átfedő kérések), illetve egyszer hibára állítható.
    const fail = readsJson && probe.failNextJson;
    if (fail) probe.failNextJson = false;
    const delay = readsJson ? probe.jsonDelayMs : 0;
    args[cb] = (e: unknown, r: { rows?: unknown[] }) => {
      note(r?.rows);
      const finish = () => fail ? done(new Error("QBS: szándékos építési hiba"), undefined as never) : done(e, r);
      if (delay) setTimeout(finish, delay); else finish();
    };
  }
  const result = originalQuery.apply(this, args) as Promise<{ rows?: unknown[] }> | undefined;
  if (result && typeof result.then === "function") void result.then(r => note(r?.rows), () => {});
  return result;
};

// A valódi útvonal-felcsatolás (mountAppRoutes) a közös, e2e-módú segéddel — a route-szintű próbához (A8).
await import("./support/authz-db-harness");
const { default: express } = await import("express");
const { default: compression } = await import("compression");
const { mountAppRoutes } = await import("../server/app-routes");
const { db, dbPool } = await import("../server/db");
const svc = await import("../server/gameQuizBankService");
const { loadCurriculumContent, CURRICULUM_JSON_BATCH } = await import("../server/curriculum/load");
after(async () => {
  await db.delete(gameQuizItems).where(like(gameQuizItems.prompt, "QBS %"));
  await db.delete(lessons).where(like(lessons.id, "qbs-%"));
  await db.delete(htmlFiles).where(like(htmlFiles.id, "qbs-%"));
  await db.delete(knowledgeMaps).where(eq(knowledgeMaps.id, "qbs-map"));
  await dbPool.end();
});

const GAMES = ["tsunami-english", "word-ladder-hu-en", "block-craft-quiz", "space-asteroid-quiz", "tornado-hunter-200", "brain-rot-steal"];
const MATERIALS = 300;
const T0 = Date.UTC(2026, 9, 1);

function lessonJson(i: number, v: number) {
  const json = compactFusionFixture();
  json.title = `QBS lecke ${i}`;
  json.sections[0].heading = `QBS fejezet ${i} v${v}`;
  for (const q of json.experience!.quiz) q.question = `[QBS ${i} v${v}] ${q.question}`.slice(0, 300);
  return json;
}
const legacyJson = (i: number) => { const json = lessonJson(i, 9) as { experience?: unknown }; delete json.experience; return json; };

/** A javítás ELŐTTI algoritmus, szó szerint (gameQuizBankService.ts @ 5cb3cd3e). */
async function oldListGameQuizBank(gameId: string) {
  const couponGame = (COUPON_GAME_IDS as readonly string[]).includes(gameId);
  const rows = couponGame ? await db.select({ id: lessons.id, json: lessons.json, htmlFileId: lessons.htmlFileId, version: lessons.version })
    .from(lessons).where(isNotNull(lessons.publishedAt)).orderBy(desc(lessons.version), desc(lessons.publishedAt)) : [];
  const canonical = canonicalBanks(rows, couponGame ? gameId : undefined);
  const legacy = await db.select().from(gameQuizItems).where(and(eq(gameQuizItems.gameId, gameId), eq(gameQuizItems.isActive, true)));
  const out: Array<Record<string, unknown> & { id: string; prompt: string; options: string[]; correctIndex: number }> = [...canonical.items];
  for (const r of legacy) {
    if ((r.lessonId && canonical.lessonIds.has(r.lessonId)) || (r.sourceMaterialId && canonical.materialIds.has(r.sourceMaterialId))) continue;
    if (!isPlayableQuestion(r)) continue;
    out.push({ id: r.id, gameId: r.gameId, tier: ({ "1": "easy", "2": "medium", "3": "hard", med: "medium" } as Record<string, string>)[r.tier] ?? r.tier,
      topic: r.topic, prompt: r.prompt, options: r.options, correctIndex: r.correctIndex, explanation: r.explanation ?? null, sourceMaterialId: r.sourceMaterialId });
  }
  return uniqueQuizContent(out);
}

async function responseOf(gameId: string) {
  const res = await svc.gameQuizBankResponse(gameId);
  assert.ok(res);
  const text = gunzipSync(res.gzip).toString("utf8");
  assert.equal(Buffer.byteLength(text), res.bytes);
  return { text, body: JSON.parse(text) as { gameId: string; items: Array<{ id: string; prompt: string; sourceMaterialId: string | null }> } };
}

before(async () => {
  await db.insert(gamesCatalog).values(COUPON_GAME_IDS.map(id => ({ id, title: id }))).onConflictDoNothing();
  await db.insert(knowledgeMaps).values({ id: "qbs-map", title: "Méretpróba", subject: "matematika", classroom: 7, sourceFiles: [], inputHash: "qbs" });
  await db.insert(htmlFiles).values(Array.from({ length: MATERIALS }, (_, i) => ({ id: `qbs-${i}`, title: `QBS anyag ${i}`, content: "lesson", classroom: 3 + (i % 10) })));
  const rows = [];
  for (let i = 0; i < MATERIALS; i++) {
    for (const v of [1, 2]) rows.push({ id: `qbs-${i}-v${v}`, mapId: "qbs-map", htmlFileId: `qbs-${i}`, json: lessonJson(i, v), version: v, publishedAt: new Date(T0 + (i * 3 + v) * 1000) });
  }
  // Piszkozat: újabb verzió, közzététel nélkül — nem kerülhet a bankba.
  rows.push({ id: "qbs-3-v3", mapId: "qbs-map", htmlFileId: "qbs-3", json: lessonJson(3, 3), version: 3, publishedAt: null as unknown as Date });
  // Régi formátumú legfrissebb verzió: az anyag „elfogyott”, a korábbi fúziós verzió nem éledhet fel.
  rows.push({ id: "qbs-4-v3", mapId: "qbs-map", htmlFileId: "qbs-4", json: legacyJson(4), version: 3, publishedAt: new Date(T0 + 5_000_000) });
  // Anyag nélküli lecke: saját azonosság.
  rows.push({ id: "qbs-free", mapId: "qbs-map", htmlFileId: null as unknown as string, json: lessonJson(999, 1), version: 1, publishedAt: new Date(T0 + 6_000_000) });
  for (let i = 0; i < rows.length; i += 50) await db.insert(lessons).values(rows.slice(i, i + 50));
  // Régi exportok: a fúziós anyaghoz tartozó elavult másolat ki, a csak-régi anyag (qbs-4) exportja be.
  await db.insert(gameQuizItems).values(COUPON_GAME_IDS.flatMap(gameId => [
    { gameId, tier: "1", sourceMaterialId: "qbs-10", prompt: "QBS elavult export", options: ["A", "B", "C"], correctIndex: 0 },
    { gameId, tier: "2", sourceMaterialId: "qbs-4", prompt: "QBS régi anyag kérdése", options: ["A", "B", "C"], correctIndex: 1, explanation: "Mert." },
  ]));
});

test("A5: a válasz tartalma és sorrendje bájtra azonos a javítás előtti algoritmussal, mind a 6 játékra", async () => {
  svc.resetQuizBankCacheForTests();
  for (const gameId of GAMES) {
    const old = await oldListGameQuizBank(gameId);
    assert.deepEqual(await svc.listGameQuizBank(gameId), old, gameId);
    const { text } = await responseOf(gameId);
    assert.equal(text, JSON.stringify({ gameId, items: old.map(r => svc.quizBankApiItem(r as never)) }), gameId);
  }
  const { body } = await responseOf("tsunami-english");
  const prompts = body.items.map(q => q.prompt);
  assert.ok(prompts.some(p => p.startsWith("[QBS 299 v2]")) && !prompts.some(p => p.startsWith("[QBS 299 v1]")), "csak a legfrissebb közzétett verzió");
  assert.ok(!prompts.some(p => p.startsWith("[QBS 3 v3]")), "piszkozat nem");
  assert.ok(!prompts.some(p => p.startsWith("[QBS 4 ")), "régi formátumú legfrissebb verzió mellett a korábbi fúziós nem éled fel");
  assert.ok(prompts.includes("QBS régi anyag kérdése") && !prompts.includes("QBS elavult export"));
  assert.ok(prompts.some(p => p.startsWith("[QBS 999 v1]")), "anyag nélküli lecke");
});

test("A2/A3/A6: 10 párhuzamos hideg kérés = 1 építés, kötegenként ≤16 lecke-JSON; a meleg kérés 1 könnyű lekérdezés", async () => {
  svc.resetQuizBankCacheForTests();
  probe.queries = 0; probe.maxJsonRows = 0;
  const cold = await Promise.all(Array.from({ length: 10 }, () => responseOf("tsunami-english")));
  assert.equal(svc.quizBankCacheStats().builds, 1);
  assert.equal(svc.quizBankCacheStats().gameBuilds, 1);
  assert.ok(cold.every(r => r.text === cold[0].text));
  assert.ok(probe.maxJsonRows > 0 && probe.maxJsonRows <= svc.LESSON_JSON_BATCH, `json-sor/lekérdezés: ${probe.maxJsonRows}`);
  // A teljes hideg építés lekérdezésszáma a kötegek számával nő, nem a kérésekével: 10 ujjlenyomat + 1 kiválasztás + kötegek + 1 régi export.
  const coldQueries = probe.queries;
  const { rows: [{ latest }] } = await dbPool.query("SELECT count(DISTINCT coalesce(html_file_id, id))::int AS latest FROM lessons WHERE published_at IS NOT NULL");
  assert.ok(coldQueries <= 10 + 1 + Math.ceil(latest / svc.LESSON_JSON_BATCH) + 1, `hideg lekérdezések: ${coldQueries}`);

  probe.queries = 0; probe.maxJsonRows = 0;
  const started = performance.now();
  await svc.gameQuizBankResponse("tsunami-english");
  const ms = performance.now() - started;
  const warm = await responseOf("tsunami-english");
  probe.queries -= 1; // a responseOf saját (második) ujjlenyomat-lekérdezése
  assert.equal(warm.text, cold[0].text);
  assert.equal(probe.queries, 1, "meleg kérés: csak az ujjlenyomat");
  assert.equal(probe.maxJsonRows, 0, "meleg kérés nem olvas lecke-JSON-t");
  assert.equal(svc.quizBankCacheStats().builds, 1);
  assert.ok(ms < 200, `meleg kérés ${Math.round(ms)} ms`);

  // Másik játék ugyanabból a pillanatképből: nincs új kanonikus építés.
  await responseOf("block-craft-quiz");
  assert.equal(svc.quizBankCacheStats().builds, 1);
  assert.equal(svc.quizBankCacheStats().gameBuilds, 2);
  assert.equal(await svc.gameQuizBankResponse("ismeretlen-jatek"), null);
});

test("review #478 (Codex P2): a nem kupon-játék (Szólétra) hideg kérése nem olvas lecke-JSON-t és nem épít kanonikus pillanatképet", async () => {
  svc.resetQuizBankCacheForTests();
  await db.insert(gamesCatalog).values({ id: "word-ladder-hu-en", title: "word-ladder-hu-en" }).onConflictDoNothing();
  await db.insert(gameQuizItems).values({ gameId: "word-ladder-hu-en", tier: "1", prompt: "QBS szólétra kérdés", options: ["egy", "kettő", "három"], correctIndex: 0 });
  probe.queries = 0; probe.maxJsonRows = 0;
  const cold = await responseOf("word-ladder-hu-en");
  assert.equal(probe.maxJsonRows, 0, "a Szólétra nem olvas lecke-JSON-t");
  assert.equal(probe.queries, 2, "hideg: 1 saját lenyomat + 1 régi-export lekérdezés");
  assert.equal(svc.quizBankCacheStats().builds, 0, "nincs kanonikus pillanatkép");
  assert.ok(cold.body.items.some(q => q.prompt === "QBS szólétra kérdés"));
  assert.equal(cold.text, JSON.stringify({ gameId: "word-ladder-hu-en", items: (await oldListGameQuizBank("word-ladder-hu-en")).map(r => svc.quizBankApiItem(r as never)) }));
  probe.queries = 0;
  await svc.gameQuizBankResponse("word-ladder-hu-en");
  assert.equal(probe.queries, 1, "meleg: csak a lenyomat");
  assert.equal(svc.quizBankCacheStats().gameBuilds, 1);
  // A saját exportjának módosítása érvénytelenít; lecke-írás nem.
  await db.execute(sql`UPDATE game_quiz_items SET prompt = 'QBS szólétra javított' WHERE prompt = 'QBS szólétra kérdés'`);
  assert.ok((await responseOf("word-ladder-hu-en")).body.items.some(q => q.prompt === "QBS szólétra javított"));
  await db.execute(sql`UPDATE lessons SET updated_at = now() WHERE id = 'qbs-1-v2'`);
  await responseOf("word-ladder-hu-en");
  assert.equal(svc.quizBankCacheStats().gameBuilds, 2);
  assert.equal(svc.quizBankCacheStats().builds, 0);
});

test("review #478 M1/L4a+c: eltérő lenyomatú párhuzamos kérések mellett egyszerre legfeljebb EGY építés fut; a követő a legutolsó írást látja", async () => {
  svc.resetQuizBankCacheForTests();
  probe.jsonDelayMs = 15; // ~20 köteg × 15 ms: az első építés biztosan átfedi a közbeni írásokat
  try {
    const first = svc.gameQuizBankResponse("tsunami-english");
    const later: Array<Promise<unknown>> = [];
    for (const k of [1, 2, 3]) {
      await new Promise(r => setTimeout(r, 40));
      await db.execute(sql`UPDATE lessons SET json = jsonb_set(json, '{experience,quiz,0,question}', ${JSON.stringify(`QBS M1 írás ${k}?`)}::jsonb) WHERE id = 'qbs-20-v2'`);
      later.push(svc.gameQuizBankResponse("tsunami-english"));
      later.push(svc.gameQuizBankResponse("block-craft-quiz"));
    }
    await Promise.all([first, ...later]);
    const stats = svc.quizBankCacheStats();
    assert.equal(stats.maxConcurrentBuilds, 1, "egyszerre legfeljebb egy építés");
    assert.ok(stats.builds <= 2, `építések: ${stats.builds} (az első + egyetlen összevont követő)`);
  } finally { probe.jsonDelayMs = 0; }
  // (c) a késői kérés és a következő kérés is a legutolsó írást adja, újabb építés nélkül.
  const builds = svc.quizBankCacheStats().builds;
  const prompts = (await responseOf("tsunami-english")).body.items.map(q => q.prompt);
  assert.ok(prompts.includes("QBS M1 írás 3?") && !prompts.includes("QBS M1 írás 2?"));
  assert.equal(svc.quizBankCacheStats().builds, builds);
  // Építés közbeni írás → a következő kérés új lenyomatot lát és újraépít az új tartalommal.
  probe.jsonDelayMs = 15;
  try {
    await db.execute(sql`UPDATE lessons SET updated_at = now() WHERE id = 'qbs-21-v2'`);
    const during = svc.gameQuizBankResponse("tsunami-english");
    await new Promise(r => setTimeout(r, 40));
    await db.execute(sql`UPDATE lessons SET json = jsonb_set(json, '{experience,quiz,0,question}', '"QBS közbeni írás?"') WHERE id = 'qbs-21-v2'`);
    await during;
  } finally { probe.jsonDelayMs = 0; }
  assert.ok((await responseOf("tsunami-english")).body.items.some(q => q.prompt === "QBS közbeni írás?"));
  assert.equal(svc.quizBankCacheStats().maxConcurrentBuilds, 1);
});

test("review #478 L4b: elbukott építés után a következő kérés újrapróbál és sikeres", async () => {
  svc.resetQuizBankCacheForTests();
  probe.failNextJson = true;
  // A drizzle „Failed query” hibába csomagolja; az eredeti a `cause`-ban.
  await assert.rejects(svc.gameQuizBankResponse("tsunami-english"), (e: unknown) => /szándékos építési hiba/.test(String((e as { cause?: unknown }).cause ?? e)));
  assert.equal(probe.failNextJson, false);
  const ok = await responseOf("tsunami-english");
  assert.ok(ok.body.items.length > 0);
  assert.equal(svc.quizBankCacheStats().builds, 2);
  const old = await oldListGameQuizBank("tsunami-english");
  assert.equal(ok.text, JSON.stringify({ gameId: "tsunami-english", items: old.map(r => svc.quizBankApiItem(r as never)) }));
});

test("A4: bármely írás (közvetlen SQL is) érvényteleníti: módosítás, visszavonás, új lecke, törlés; plusz a 15 perces lejárat", async () => {
  svc.resetQuizBankCacheForTests();
  const promptsOf = async () => (await responseOf("tsunami-english")).body.items.map(q => q.prompt);
  await promptsOf();
  // Kvízkérdés javítása közvetlen SQL-lel (updated_at és verzió nélkül).
  await db.execute(sql`UPDATE lessons SET json = jsonb_set(json, '{experience,quiz,0,question}', '"QBS javított kérdés?"') WHERE id = 'qbs-5-v2'`);
  assert.ok((await promptsOf()).includes("QBS javított kérdés?"));
  // A legfrissebb verzió visszavonása: az előző közzétett verzió lép a helyére.
  await db.update(lessons).set({ publishedAt: null }).where(eq(lessons.id, "qbs-6-v2"));
  let prompts = await promptsOf();
  assert.ok(prompts.some(p => p.startsWith("[QBS 6 v1]")) && !prompts.some(p => p.startsWith("[QBS 6 v2]")));
  // Új anyag közzététele.
  await db.insert(htmlFiles).values({ id: "qbs-new", title: "QBS új", content: "lesson", classroom: 5 });
  await db.insert(lessons).values({ id: "qbs-new-v1", mapId: "qbs-map", htmlFileId: "qbs-new", json: lessonJson(777, 1), version: 1, publishedAt: new Date() });
  assert.ok((await promptsOf()).some(p => p.startsWith("[QBS 777 v1]")));
  // Anyag törlése (a leckéi kaszkádolva).
  await db.delete(htmlFiles).where(eq(htmlFiles.id, "qbs-7"));
  prompts = await promptsOf();
  assert.ok(!prompts.some(p => p.startsWith("[QBS 7 ")));
  const builds = svc.quizBankCacheStats().builds;
  assert.equal(builds, 5);
  // Változatlan adat + lejárt pillanatkép → újraépítés.
  const realNow = Date.now;
  Date.now = () => realNow() + svc.QUIZ_BANK_CACHE_TTL_MS + 1000;
  try { await promptsOf(); } finally { Date.now = realNow; }
  assert.equal(svc.quizBankCacheStats().builds, builds + 1);
  // Minden állapotban azonos a régi algoritmussal.
  for (const gameId of GAMES) {
    const old = await oldListGameQuizBank(gameId);
    assert.equal((await responseOf(gameId)).text, JSON.stringify({ gameId, items: old.map(r => svc.quizBankApiItem(r as never)) }), gameId);
  }
});

test("material-quizzes: a 3 legutóbbi anyag bankja a régi algoritmussal azonos, kötegelt JSON-olvasással", async () => {
  probe.maxJsonRows = 0;
  const result = await svc.listLatestMaterialQuizzes(5);
  const maxJsonRows = probe.maxJsonRows;
  const ids = result.materials.map(m => m.id);
  assert.equal(ids.length, 3);
  const rows = await db.select({ id: lessons.id, json: lessons.json, htmlFileId: lessons.htmlFileId, version: lessons.version }).from(lessons)
    .where(and(isNotNull(lessons.publishedAt), inArray(lessons.htmlFileId, ids))).orderBy(desc(lessons.version), desc(lessons.publishedAt));
  const expected = canonicalBanks(rows).items.map(q => q.id);
  assert.ok(expected.length > 0);
  assert.deepEqual(result.items.filter(q => q.questionVersion).map(q => q.id), expected);
  assert.ok(maxJsonRows <= 3, `json-sor/lekérdezés: ${maxJsonRows}`);
});

test("A7: a tanmenet-betöltő anyagonként a legutóbb közzétett lecke fejezeteit adja, kötegenként", async () => {
  probe.maxJsonRows = 0;
  const items = Array.from({ length: 40 }, (_, i) => ({ id: `qbs-${100 + i}`, title: `QBS anyag ${100 + i}`, classroom: 5 }));
  const out = await loadCurriculumContent(items);
  assert.equal(out.size, 40);
  for (const item of items) {
    const lesson = out.get(item.id)?.lesson as { sections: Array<{ heading: string }> };
    assert.equal(lesson.sections[0].heading, `QBS fejezet ${item.id.slice(4)} v2`);
  }
  assert.ok(probe.maxJsonRows > 0 && probe.maxJsonRows <= CURRICULUM_JSON_BATCH, `json-sor/lekérdezés: ${probe.maxJsonRows}`);
});

test("route: GET /api/games/quiz-bank/:gameId a kész gzip-választ küldi, a compression réteg nem tömöríti újra; gzip nélkül kibontva", async () => {
  const app = express();
  app.use(compression({ level: 6, threshold: 1024 })); // mint a server/index.ts
  await mountAppRoutes(app);
  const server = await new Promise<import("node:http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  try {
    const expected = JSON.stringify({ gameId: "tsunami-english", items: (await oldListGameQuizBank("tsunami-english")).map(r => svc.quizBankApiItem(r as never)) });
    const gz = await fetch(`${base}/api/games/quiz-bank/tsunami-english`, { headers: { "accept-encoding": "gzip, deflate, br" } });
    assert.equal(gz.status, 200);
    assert.equal(gz.headers.get("content-encoding"), "gzip");
    assert.match(gz.headers.get("content-type") ?? "", /^application\/json; charset=utf-8/);
    assert.match(gz.headers.get("vary") ?? "", /Accept-Encoding/i);
    assert.equal(await gz.text(), expected);
    const plain = await fetch(`${base}/api/games/quiz-bank/tsunami-english`, { headers: { "accept-encoding": "identity" } });
    assert.equal(plain.status, 200);
    assert.equal(plain.headers.get("content-encoding"), null);
    assert.equal(await plain.text(), expected);
    const unknown = await fetch(`${base}/api/games/quiz-bank/ismeretlen`);
    assert.deepEqual(await unknown.json(), { gameId: "ismeretlen", items: [] });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("#84 (J7b): material-quizzes — a tétel a forrás-lecke VALÓDI tantárgyát kapja; tantárgy nélküli régi sornál a mező hiányzik", async () => {
  // Saját osztály (1): a fenti fixture a 3–12. osztályt használja.
  await db.insert(knowledgeMaps).values({ id: "qbs-map-en", title: "Angol próba", subject: "angol nyelv", classroom: 1, sourceFiles: [], inputHash: "qbs-en" });
  await db.insert(htmlFiles).values([
    { id: "qbs-s-1", title: "QBS Present Simple", content: "lesson", classroom: 1 },
    { id: "qbs-s-2", title: "QBS régi anyag", content: "lesson", classroom: 1 },
    { id: "qbs-s-3", title: "QBS generált", content: "lesson", classroom: 1 },
  ]);
  // Régi formátumú (nem kanonikus) közzétett lecke az angol tudástérképről.
  await db.insert(lessons).values({ id: "qbs-s-1-v1", mapId: "qbs-map-en", htmlFileId: "qbs-s-1", json: legacyJson(501), version: 1, publishedAt: new Date(T0 + 7_000_000) });
  await db.insert(gameQuizItems).values([
    // Régi Stúdió-export: a téma a lecke CÍME; az anyagán át a lecke tantárgya: angol.
    { gameId: "tornado-hunter-200", tier: "1", sourceMaterialId: "qbs-s-1", topic: "Present Simple", prompt: "QBS went magyarul?", options: ["ment", "jött", "volt"], correctIndex: 0 },
    // Régi sor lecke nélkül, cím-témával: a tantárgy nem állapítható meg → a mező hiányzik.
    { gameId: "tornado-hunter-200", tier: "1", sourceMaterialId: "qbs-s-2", topic: "Hund magyarul", prompt: "QBS Hund magyarul?", options: ["kutya", "macska", "ló"], correctIndex: 0 },
    // A generátor sora: a téma maga a tantárgy.
    { gameId: "tornado-hunter-200", tier: "1", sourceMaterialId: "qbs-s-3", topic: "nature", prompt: "QBS Mi a víz?", options: ["folyadék", "fém", "gáz"], correctIndex: 0 },
    // Kupon-ág (lessonId): a lecke tantárgya.
    { gameId: "tornado-hunter-200", tier: "1", lessonId: "qbs-s-1-v1", topic: "QBS Present Simple", prompt: "QBS kupon went?", options: ["ment", "jött", "volt"], correctIndex: 0 },
  ]);
  try {
    const recent = await svc.listLatestMaterialQuizzes(1, 3);
    const byPrompt = new Map(recent.items.map((q) => [q.prompt, q]));
    assert.equal(byPrompt.get("QBS went magyarul?")?.subject, "english");
    assert.equal(byPrompt.get("QBS Mi a víz?")?.subject, "nature");
    const unknown = byPrompt.get("QBS Hund magyarul?");
    assert.ok(unknown, "a tantárgy nélküli régi sor is a válaszban van");
    assert.equal("subject" in unknown, false, "ismeretlen tantárgynál a mező hiányzik (nem üres, nem találgatott)");
    const coupon = await svc.listLatestMaterialQuizzes(1, 3, "qbs-s-1-v1");
    assert.deepEqual(coupon.items.map((q) => [q.prompt, q.subject]), [["QBS kupon went?", "english"]]);
    // A kanonikus (fúziós) tétel a lecke tantárgyát kapja (a fixture tudástérképe: „matematika”).
    const canonical = await svc.listLatestMaterialQuizzes(5);
    const versioned = canonical.items.filter((q) => q.questionVersion);
    assert.ok(versioned.length > 0 && versioned.every((q) => q.subject === "math"), "kanonikus tétel tantárgya");

    // A route is kiadja (és a hiányzó tantárgyat a JSON-ban sem írja ki).
    const app = express();
    await mountAppRoutes(app);
    const server = await new Promise<import("node:http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
      const body = await (await fetch(`${base}/api/games/material-quizzes?classroom=1&limit=3`)).json() as { items: Array<Record<string, unknown>> };
      const items = new Map(body.items.map((i) => [i.prompt, i]));
      assert.equal(items.get("QBS went magyarul?")?.subject, "english");
      assert.equal(Object.prototype.hasOwnProperty.call(items.get("QBS Hund magyarul?") ?? {}, "subject"), false);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  } finally {
    await db.delete(gameQuizItems).where(inArray(gameQuizItems.prompt, ["QBS went magyarul?", "QBS Hund magyarul?", "QBS Mi a víz?", "QBS kupon went?"]));
    await db.delete(lessons).where(eq(lessons.id, "qbs-s-1-v1"));
    await db.delete(htmlFiles).where(like(htmlFiles.id, "qbs-s-%"));
    await db.delete(knowledgeMaps).where(eq(knowledgeMaps.id, "qbs-map-en"));
  }
});
