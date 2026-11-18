/**
 * Kanban #101 (S1) — a quiz-bank karcsúsítás adatbázis nélküli részei (spec: docs/specs/2026-11-17-kerdesbank-karcsusitas.md 10.1):
 * az évfolyam-változat bővítési szabálya, a feltételes GET segédek és a Vercel gyorsítótár-fejléce.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MIN_CLASSROOM_ITEMS, pickClassroomSet } from "../server/lib/quiz-bank-classroom";
import { etagMatches, QUIZ_BANK_CLASSROOM_RE } from "../server/lib/conditional-get";

/** Az éles bank évfolyamonkénti tételszáma (2026-11-17, csak olvasó GET; spec 3.2). */
const PROD: Record<number, number> = { 0: 718, 1: 0, 2: 95, 3: 2629, 4: 5745, 5: 5313, 6: 2029, 7: 489, 8: 5652, 9: 2474, 10: 0, 11: 0, 12: 0 };
const countOf = (table: Record<number, number>) => (cs: readonly number[]) => cs.reduce((s, c) => s + (table[c] ?? 0), 0);

test("pickClassroomSet: az éles számokkal — saját évfolyam, bővítés, végül teljes bank", () => {
  const c = countOf(PROD);
  assert.deepEqual(pickClassroomSet(0, c), [0], "0. sáv (programozás): 718");
  // Review #101 K1 (hibás elvárás javítása): a 0. sáv nem évfolyam-szomszéd → az 1. évfolyam a 2.-kal 95 < 200 → teljes bank.
  assert.equal(pickClassroomSet(1, c), null, "1. évf.: 0, az 1+2 = 95 → teljes bank");
  assert.deepEqual(pickClassroomSet(2, c), [1, 2, 3], "2. évf.: 95 → 2724");
  assert.deepEqual(pickClassroomSet(3, c), [3]);
  assert.deepEqual(pickClassroomSet(7, c), [7], "7. évf.: 489");
  assert.deepEqual(pickClassroomSet(10, c), [9, 10, 11], "10. évf.: 0 → a 9. adja");
  assert.equal(pickClassroomSet(12, c), null, "12. évf.: a szomszéddal (11.) sincs → teljes bank");
});

test("pickClassroomSet: küszöb (199 / 200), sáv-vágás a 0 és 12 szélén, determinizmus", () => {
  assert.equal(MIN_CLASSROOM_ITEMS, 200);
  assert.deepEqual(pickClassroomSet(5, countOf({ 5: 200 })), [5]);
  assert.deepEqual(pickClassroomSet(5, countOf({ 5: 199, 4: 1 })), [4, 5, 6]);
  assert.equal(pickClassroomSet(5, countOf({ 5: 100, 4: 50, 6: 49 })), null);
  const seen: number[][] = [];
  pickClassroomSet(0, (cs) => { seen.push([...cs]); return 0; });
  assert.deepEqual(seen, [[0]], "a 0. sáv nem bővül az 1. évfolyammal");
  seen.length = 0;
  pickClassroomSet(1, (cs) => { seen.push([...cs]); return 0; });
  assert.deepEqual(seen, [[1], [1, 2]], "az 1. évfolyam szomszédja nem a 0. sáv");
  assert.deepEqual(pickClassroomSet(1, countOf({ 0: 5000, 1: 10, 2: 300 })), [1, 2], "a 0. sáv tételei nem számítanak bele");
  assert.equal(pickClassroomSet(0, countOf({ 0: 150, 1: 5000 })), null, "kevés programozási tétel → teljes bank, nem 1. évfolyam");
  seen.length = 0;
  pickClassroomSet(12, (cs) => { seen.push([...cs]); return 0; });
  assert.deepEqual(seen, [[12], [11, 12]], "a 12. évfolyamnál nincs 13");
  const c = countOf(PROD);
  for (let n = 0; n <= 12; n++) assert.deepEqual(pickClassroomSet(n, c), pickClassroomSet(n, c));
});

test("QUIZ_BANK_CLASSROOM_RE: csak egész 0–12", () => {
  for (const ok of ["0", "1", "9", "10", "12"]) assert.ok(QUIZ_BANK_CLASSROOM_RE.test(ok), ok);
  for (const bad of ["", "abc", "-1", "13", "01", "1.5", " 3", "3 ", "+3", "1e1", "0x3", "١"]) assert.ok(!QUIZ_BANK_CLASSROOM_RE.test(bad), JSON.stringify(bad));
});

test("etagMatches: gyenge összevetés, vesszős lista, *, hiány", () => {
  const tag = 'W/"qb-abc"';
  assert.equal(etagMatches(undefined, tag), false);
  assert.equal(etagMatches("", tag), false);
  assert.equal(etagMatches('W/"qb-abc"', tag), true);
  assert.equal(etagMatches('"qb-abc"', tag), true, "erős alak is egyezik (gyenge összevetés)");
  assert.equal(etagMatches('"x", W/"qb-abc"', tag), true);
  assert.equal(etagMatches(['"x"', 'W/"qb-abc"'], tag), true);
  assert.equal(etagMatches("*", tag), true);
  assert.equal(etagMatches('W/"qb-abd"', tag), false);
  assert.equal(etagMatches('W/"qb-ab"', tag), false);
});

test("vercel.json: a quiz-bank no-cache (újraérvényesíthető), minden más /api útvonal no-store marad, a TTS / klip kivétel változatlan", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const apiRules = (cfg.headers ?? []).filter((h) => h.source.startsWith("/api/"));
  /** A ráillő szabályok `Cache-Control` értékei (a Vercel `source` mintái itt reguláris kifejezésként is érvényesek). */
  const cacheControlFor = (path: string) =>
    apiRules.filter((h) => new RegExp(`^${h.source}$`).test(path))
      .map((h) => h.headers.find((x) => x.key.toLowerCase() === "cache-control")?.value)
      .filter((v): v is string => typeof v === "string");
  assert.deepEqual(cacheControlFor("/api/games/quiz-bank/block-craft-quiz"), ["no-cache"]);
  assert.deepEqual(cacheControlFor("/api/games/quiz-bank/tsunami-english"), ["no-cache"]);
  for (const p of ["/api/games/material-quizzes", "/api/games/catalog", "/api/user", "/api/games/quiz-bankx", "/api/lessons/coupons/active"]) {
    assert.deepEqual(cacheControlFor(p), ["no-store, no-cache, must-revalidate, max-age=0"], p);
  }
  assert.deepEqual(cacheControlFor("/api/tts/audio"), [], "TTS: nincs no-store");
  assert.deepEqual(cacheControlFor("/api/lesson-clips/media/x.mp4"), [], "klip: nincs no-store");
});
