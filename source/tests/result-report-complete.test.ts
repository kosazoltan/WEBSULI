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
  assert.match(source, /if \(!lessonId \|\| !done \|\| !\(ready \|\| timedOut\)\) return;/);
  // A körönkénti egyszeri küldés őrei: a localStorage-jelző és a folyamatban lévő küldés. B5b / R20 (dokumentált spec-változás,
  // docs/specs/2026-11-25-eredmeny-email-b5b.md 6. pont): az „úton van” őr KÖRÖNKÉNTI (a jelző kulcsán), nem komponensszintű.
  assert.match(source, /if \(localStorage\.getItem\(flag\)\) return;/);
  assert.match(source, /if \(sentInMemory\.has\(flag\) \|\| sending\.current\.has\(flag\)\) return;/);
  assert.match(source, /sending\.current\.add\(flag\);/);
  assert.match(source, /finally \{ sending\.current\.delete\(flag\); \}/);
});

// --- Eredmény-e-mail B1b (R2): korhatár az utolsó válaszhoz ---

test("B1b: roundActivityAt — az utolsó válasz ideje; ennek hiányában ismeretlen (0), nem a kezdés", () => {
  assert.equal(roundActivityAt({ lastAnsweredAt: 500 }), 500);
  assert.equal(roundActivityAt({}), 0, "régebbi tárolt kör (nincs rögzített válaszidő): ismeretlen kor");
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
  assert.equal(roundTooOld(roundActivityAt({ lastAnsweredAt: now - 1000 }), now), false);
  assert.equal(roundTooOld(roundActivityAt({ lastAnsweredAt: now - 8 * day }), now), true);
  // 1. vak kör L1: a régi kliens által tárolt kör (válaszidő nélkül) NEM elavult — a friss válaszú régi kör eredménye nem veszhet el.
  assert.equal(roundTooOld(roundActivityAt({}), now), false);
});

test("B1b: a beküldő a korhatárt csak LE NEM ZÁRT körre alkalmazza, és a két időmezőt a törzsbe teszi (szerkezeti őr; a viselkedést a böngészős próba méri)", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.ok(source.includes("if (!round.finishedAt && roundTooOld(roundActivityAt(round), Date.now())) return;"));
  assert.ok(source.includes('...(round.startedAt > 0 ? { startedAt: round.startedAt } : {})'));
  assert.ok(source.includes('...(kind === "quiz" && round.lastAnsweredAt ? { lastAnsweredAt: round.lastAnsweredAt } : {})'));
  const view = readFileSync(new URL("../client/src/lesson-runtime/LessonExperienceView.tsx", import.meta.url), "utf8");
  assert.ok(view.includes("lastAnsweredAt: Date.now()"), "a kvízválasz rögzíti az utolsó válasz idejét");
});
