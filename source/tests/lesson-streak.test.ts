import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_STREAK, parseStreak, recordLessonResult, STREAK_GOOD_PERCENT, streakBadge, streakNext } from "../shared/lesson-streak";

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
  assert.deepEqual(parseStreak(JSON.stringify({ count: 2, last: "a", rounds: ["a|1"] })), { count: 2, last: "a", rounds: ["a|1"] });
});
