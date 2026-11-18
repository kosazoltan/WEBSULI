import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answeredCount, quizRoundComplete, roundTooOld, STALE_ROUND_DAYS } from "../shared/quiz-round";

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

test("S1b: answeredCount csak a kör saját kérdéseit számolja; roundTooOld a 7 napos határon", () => {
  assert.equal(answeredCount({ ids: ["a", "b", "c"], picks: {} }), 0);
  assert.equal(answeredCount({ ids: ["a", "b", "c"], picks: { a: 0, c: 2, regi: 1 } }), 2);
  const DAY = 86_400_000, now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(STALE_ROUND_DAYS, 7);
  assert.equal(roundTooOld(now - 7 * DAY, now), false, "pontosan 7 nap még megy");
  assert.equal(roundTooOld(now - 7 * DAY - 1, now), true);
  assert.equal(roundTooOld(now - 60_000, now), false);
  assert.equal(roundTooOld(0, now), false, "el nem indított körre nem vonatkozik");
});

test("S1b: a beküldő a le nem zárt, régi kört nem küldi; a pillanatkép feltételei és az eseményfigyelők a forrásban", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!round\.finishedAt && roundTooOld\(round\.startedAt, Date\.now\(\)\)\) return;/);
  assert.match(source, /if \(current\.finishedAt \|\| quizRoundComplete\(current\) \|\| count === 0 \|\| roundTooOld\(current\.startedAt, Date\.now\(\)\)\) return;/);
  assert.match(source, /if \(count <= sentCount\) return;/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(source, /window\.addEventListener\("pagehide", snapshot\)/);
  // A pillanatkép nem GET és nem sendBeacon (CSRF-fejléc kell): keepalive-os POST a gyorsítótárazott tokennel.
  const client = readFileSync(new URL("../client/src/lib/queryClient.ts", import.meta.url), "utf8");
  assert.match(client, /method: "POST", keepalive: true, credentials: "include"/);
  // Review #510 (SPEC-VÁLTOZÁS): token nélkül el sem indul (`null`); a siker csak 2xx válasz (`res.ok`), így a sikertelen újrapróbálható.
  assert.match(client, /if \(!token\) return null;/);
  assert.match(client, /\.then\(res => res\.ok, \(\) => false\)/);
  assert.match(source, /void sending\.then\(ok => \{/);
  assert.doesNotMatch(source + client, /sendBeacon\(/);
});
