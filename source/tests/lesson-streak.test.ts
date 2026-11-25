import assert from "node:assert/strict";
import test from "node:test";

import { createStreakStore, EMPTY_STREAK, parseStreak, recordLessonResult, STREAK_GOOD_PERCENT, streakBadge, streakNext } from "../shared/lesson-streak";

/** V5c (docs/specs/2026-11-25-v5c-sorozatjelveny.md): a sorozatjelvény tiszta szabályai. */
const rec = (s = EMPTY_STREAK, lessonKey = "l1", roundKey = `${lessonKey}|r`, percent = 90) => recordLessonResult(s, { lessonKey, roundKey, percent });

test("V5c: jó kör (≥ 80 %) növel, különböző leckékből épül a sorozat", () => {
  assert.equal(STREAK_GOOD_PERCENT, 80);
  let s = rec(EMPTY_STREAK, "a", "a|1", 80);
  assert.equal(s.count, 1);
  s = rec(s, "b", "b|1", 95);
  s = rec(s, "c", "c|1", 100);
  assert.equal(s.count, 3);
  assert.deepEqual(streakBadge(s.count), { at: 3, name: "Bronz" });
});

test("V5c: 80 % alatti kör nulláz", () => {
  let s = rec(EMPTY_STREAK, "a", "a|1", 90);
  s = rec(s, "b", "b|1", 79);
  assert.equal(s.count, 0);
  assert.equal(streakBadge(s.count), null);
});

test("V5c: ugyanaz a kör kétszer nem számít; ugyanannak a leckének újabb jó köre nem növel", () => {
  let s = rec(EMPTY_STREAK, "a", "a|1", 90);
  const again = rec(s, "a", "a|1", 90);
  assert.equal(again, s, "azonos kör: változatlan állapot (ugyanaz az objektum)");
  s = rec(s, "a", "a|2", 100);
  assert.equal(s.count, 1, "azonos lecke új köre nem növel");
  s = rec(s, "b", "b|1", 100);
  assert.equal(s.count, 2);
});

test("V5c: szintek és a következő szint", () => {
  assert.equal(streakBadge(2), null);
  assert.deepEqual(streakBadge(4), { at: 3, name: "Bronz" });
  assert.deepEqual(streakBadge(5), { at: 5, name: "Ezüst" });
  assert.deepEqual(streakBadge(12), { at: 10, name: "Arany" });
  assert.deepEqual(streakNext(0), { at: 3, name: "Bronz", missing: 3 });
  assert.deepEqual(streakNext(4), { at: 5, name: "Ezüst", missing: 1 });
  assert.equal(streakNext(10), null);
});

test("V5c: a körkulcs-lista az utolsó 50-re korlátos", () => {
  let s = EMPTY_STREAK;
  for (let i = 0; i < 60; i++) s = rec(s, `l${i}`, `l${i}|r`, 90);
  assert.equal(s.rounds.length, 50);
  assert.equal(s.count, 60);
});

test("V5c: sérült / idegen tároló → üres állapot", () => {
  for (const raw of [null, "", "{", "[]", JSON.stringify({ count: -1, last: null, rounds: [] }), JSON.stringify({ count: 2, last: 5, rounds: [] }), JSON.stringify({ count: 2, last: "a", rounds: "x" })]) {
    assert.deepEqual(parseStreak(raw), EMPTY_STREAK, String(raw));
  }
  // review #606: a régi (leckelista nélküli) érték a legutóbbi leckét beszámítottnak veszi
  assert.deepEqual(parseStreak(JSON.stringify({ count: 2, last: "a", rounds: ["a|1"] })), { count: 2, last: "a", rounds: ["a|1"], lessons: ["a"] });
});

test("review #606: A → B → A — a sorozatban már beszámított lecke újra nem növel (különböző leckékből épül)", () => {
  let s = rec(EMPTY_STREAK, "a", "a|1", 90);
  s = rec(s, "b", "b|1", 90);
  s = rec(s, "a", "a|2", 90);
  assert.equal(s.count, 2, "A → B → A: két különböző lecke");
  for (let i = 0; i < 10; i++) s = rec(s, i % 2 ? "a" : "b", `x|${i}`, 100);
  assert.equal(s.count, 2, "két lecke váltogatása sem ad magasabb szintet");
  s = rec(s, "c", "c|1", 90);
  assert.equal(s.count, 3);
  s = rec(s, "d", "d|1", 50);
  assert.equal(s.count, 0, "nullázás");
  s = rec(s, "a", "a|9", 90);
  assert.equal(s.count, 1, "nullázás után a korábbi lecke újra beszámít");
});

test("review #606: régi (leckelista nélküli) tárolt érték is beolvasható; a lista ellenőrzött", () => {
  const old = parseStreak(JSON.stringify({ count: 2, last: "b", rounds: ["a|1", "b|1"] }));
  assert.equal(old.count, 2);
  assert.equal(rec(old, "b", "b|2", 90).count, 2, "a legutóbbi lecke a régi állapotból is ismétlés");
  assert.deepEqual(parseStreak(JSON.stringify({ count: 1, last: "a", rounds: [], lessons: [1] })), EMPTY_STREAK, "idegen elem → üres");
});

test("review #606: sikertelen írás (betelt tár) után a memóriabeli állapotból számol tovább", () => {
  const data = new Map<string, string>();
  let full = false;
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { if (full) throw new Error("QuotaExceededError"); data.set(k, v); },
  };
  const store = createStreakStore(() => storage);
  const step = (lessonKey: string) => { const after = recordLessonResult(store.load(), { lessonKey, roundKey: `${lessonKey}|1`, percent: 90 }); store.save(after); return after.count; };
  assert.equal(step("a"), 1);
  assert.equal(step("b"), 2);
  full = true;
  assert.deepEqual([step("c"), step("d")], [3, 4], "íráshiba után a memória a forrás");
  full = false;
  assert.equal(step("e"), 5, "a sikeres mentés után újra a tároló — benne a friss állapot");
  assert.equal(parseStreak(data.get("websuli:lesson-streak:v1") ?? null).count, 5);
  const broken = createStreakStore(() => { throw new Error("nincs localStorage"); });
  broken.save(recordLessonResult(broken.load(), { lessonKey: "a", roundKey: "a|1", percent: 90 }));
  assert.equal(broken.load().count, 1, "olvashatatlan tárolónál is a memória");
});

test("review #606: a sorozat csak a HELYI kvíz ágában rögzül (bejelentkezve a mentett kvíz fut — a hook ott nem renderelődik)", async () => {
  const { readFileSync } = await import("node:fs");
  const view = readFileSync(new URL("../client/src/lesson-runtime/LessonExperienceView.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(view, /useLessonStreak\(/, "a szülő nem hívja a hookot (az azonosítás előtt / bejelentkezve is futna)");
  const block = view.slice(view.indexOf("<PracticeAccess"), view.indexOf("</PracticeAccess>"));
  assert.match(block, /<LocalStreak\b/, "a rögzítő komponens a PracticeAccess helyi (children) ágában");
});
