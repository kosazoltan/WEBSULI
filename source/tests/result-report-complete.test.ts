import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answeredCount, quizRoundComplete, roundTooOld, snapshotDue, STALE_ROUND_DAYS } from "../shared/quiz-round";

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
  // PR #510: a döntés körhöz kötött (snapshotDue), és a lebontó ág is küld (alkalmazáson belüli elhagyás).
  assert.match(source, /if \(!snapshotDue\(state, roundId, count\)\) return;/);
  assert.match(source, /window\.removeEventListener\("pagehide", snapshot\); snapshot\(\); \};/);
  assert.match(source, /if \(!accepted\) return;/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(source, /window\.addEventListener\("pagehide", snapshot\)/);
  // A pillanatkép nem GET és nem sendBeacon (CSRF-fejléc kell): keepalive-os POST a gyorsítótárazott tokennel.
  const client = readFileSync(new URL("../client/src/lib/queryClient.ts", import.meta.url), "utf8");
  assert.match(client, /method: "POST", keepalive: true, credentials: "include"/);
  assert.match(client, /if \(!token\) return false;/);
  assert.doesNotMatch(source + client, /sendBeacon\(/);
});

test("PR #510: snapshotDue — körhöz kötött; az úton lévő azonos állapot nem megy kétszer; a sikertelen küldés újrapróbálható", () => {
  const none = { sent: null, pending: null };
  assert.equal(snapshotDue(none, "round-a", 0), false, "válasz nélkül nincs pillanatkép");
  assert.equal(snapshotDue(none, "round-a", 1), true);
  const sentFive = { sent: { roundId: "round-a", count: 5 }, pending: null };
  assert.equal(snapshotDue(sentFive, "round-a", 5), false, "változatlan állapot nem megy újra");
  assert.equal(snapshotDue(sentFive, "round-a", 3), false);
  assert.equal(snapshotDue(sentFive, "round-a", 6), true, "új válasszal megy");
  // Codex / Vercel: új kör ugyanabban a nézetben — a régi kör számlálója nem nyomhatja el az új kör első válaszait.
  assert.equal(snapshotDue(sentFive, "round-b", 1), true, "új kör tiszta lappal indul");
  // Úton lévő kérés: ugyanaz az állapot nem megy párhuzamosan kétszer, de a több válasz igen.
  const pendingTwo = { sent: null, pending: { roundId: "round-a", count: 2 } };
  assert.equal(snapshotDue(pendingTwo, "round-a", 2), false);
  assert.equal(snapshotDue(pendingTwo, "round-a", 3), true);
  assert.equal(snapshotDue(pendingTwo, "round-b", 2), true);
  // Sikertelen küldés után a `pending` törlődik, a `sent` nem változik → ugyanaz az állapot újra küldendő.
  assert.equal(snapshotDue({ sent: null, pending: null }, "round-a", 2), true);
  assert.equal(snapshotDue({ sent: { roundId: "round-a", count: 1 }, pending: null }, "round-a", 2), true);
});
