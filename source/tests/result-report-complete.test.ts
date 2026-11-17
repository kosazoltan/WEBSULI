import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { quizRoundComplete } from "../shared/quiz-round";

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
