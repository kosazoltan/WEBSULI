import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STALE_ROUND_DAYS, quizRoundComplete, roundActivityAt, roundTooOld } from "../shared/quiz-round";

/**
 * Spec 2026-11-17-eredmeny-email-kviz: a helyi kvíz akkor is beküldendő, ha a tanuló minden kérdésre válaszolt, de a „Kvíz kiértékelése”
 * gombot nem nyomta meg. A feltétel tiszta része itt mérve; a beküldő (böngészős importok) feltétele szerkezeti őrrel; a viselkedést a
 * `lesson-result-email-quiz.spec.ts` böngészős próbája méri.
 */

test("quizRoundComplete: van kérdés, és mindegyikre van válasz", () => {
  assert.equal(quizRoundComplete({ ids: [], picks: {} }), false, "üres kör nem kész");
  assert.equal(quizRoundComplete({ ids: ["a", "b"], picks: {} }), false);
  assert.equal(quizRoundComplete({ ids: ["a", "b"], picks: { a: 0 } }), false, "hiányos kör nem kész");
  assert.equal(quizRoundComplete({ ids: ["a", "b"], picks: { b: 2 } }), false);
  assert.equal(quizRoundComplete({ ids: ["a", "b"], picks: { a: 0, b: 3 } }), true);
  assert.equal(quizRoundComplete({ ids: ["a"], picks: { a: 0, regi: 1 } }), true, "a körön kívüli bejegyzés nem számít");
  assert.equal(quizRoundComplete({ ids: ["a", "b"], picks: { regi: 1, masik: 2 } }), false, "a darabszám egyezése nem elég");
});

test("a küldés feltétele: lezárt kör VAGY (csak kvíznél) teljes kör; a feladatoknál továbbra is csak a lezárás", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.match(source, /const done = !!round\.finishedAt \|\| \(kind === "quiz" && quizRoundComplete\(round\)\);/);
  assert.match(source, /if \(!lessonId \|\| !done \|\| sending\.current \|\| !\(ready \|\| timedOut\)\) return;/);
  // A körönkénti egyszeri küldés őrei változatlanok: a localStorage-jelző és a folyamatban lévő küldés.
  assert.match(source, /if \(localStorage\.getItem\(flag\)\) return;/);
  assert.match(source, /sending\.current = true;/);
});

// --- Eredmény-e-mail B1b (R2): korhatár az utolsó válaszhoz ---

test("B1b: roundActivityAt — az utolsó válasz ideje, ennek hiányában a kezdés", () => {
  assert.equal(roundActivityAt({ startedAt: 100, lastAnsweredAt: 500 }), 500);
  assert.equal(roundActivityAt({ startedAt: 100 }), 100, "régebbi tárolt kör: a kezdés");
  assert.equal(roundActivityAt({ startedAt: 0 }), 0);
});

test("B1b: roundTooOld — pontosan 7 nap még nem régi, egy ezredmásodperccel több már az; kezdés nélküli körre nem vonatkozik", () => {
  const day = 86_400_000;
  const now = 1_800_000_000_000;
  assert.equal(STALE_ROUND_DAYS, 7);
  assert.equal(roundTooOld(now - 7 * day, now), false);
  assert.equal(roundTooOld(now - 7 * day - 1, now), true);
  assert.equal(roundTooOld(now - 1, now), false);
  assert.equal(roundTooOld(0, now), false, "kezdés nélküli kör");
  // A régen megnyitott, de ma megválaszolt kör megy: a korhatár az utolsó válaszhoz mér.
  assert.equal(roundTooOld(roundActivityAt({ startedAt: now - 30 * day, lastAnsweredAt: now - 1000 }), now), false);
  assert.equal(roundTooOld(roundActivityAt({ startedAt: now - 30 * day }), now), true);
});

test("B1b: a beküldő a korhatárt csak LE NEM ZÁRT körre alkalmazza, és a két időmezőt a törzsbe teszi (szerkezeti őr; a viselkedést a böngészős próba méri)", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.ok(source.includes("if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;"));
  assert.ok(source.includes('...(round.startedAt > 0 ? { startedAt: round.startedAt } : {})'));
  assert.ok(source.includes('...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {})'));
  const view = readFileSync(new URL("../client/src/lesson-runtime/LessonExperienceView.tsx", import.meta.url), "utf8");
  assert.ok(view.includes("lastAnsweredAt: Date.now()"), "a kvízválasz rögzíti az utolsó válasz idejét");
});
