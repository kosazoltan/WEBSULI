import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { answeredCount, quizRoundComplete, roundActivityAt, roundTooOld, snapshotDue, STALE_ROUND_DAYS } from "../shared/quiz-round";

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
  // Terv R20 (gépi vak ellenőrzés L1, dokumentált spec-változás): az „úton van” őr a KÖRHÖZ kötött, nem a komponenshez; a viselkedést a
  // „R20 / L1” böngészőteszt méri (függő előző kör mellett az új kör is megy).
  assert.match(source, /if \(!lessonId \|\| !done \|\| !\(ready \|\| timedOut\)\) return;/);
  // Terv R24 (gépi vak ellenőrzés, 2. célzott kör, dokumentált spec-változás): a végleges beküldés tartós kimenő soron megy (az R20
  // körönkénti állapota a sor bejegyzésében és a kísérlet-számlálóban); a viselkedést az „R20 / L1” és „R24” böngészőtesztek mérik.
  assert.match(source, /enqueueResult\(\{ id: `\$\{lessonId\}\|\$\{kind\}\|\$\{roundId\}`/);
  // A körönkénti egyszeri küldés őrei változatlanok: a localStorage-jelző és a folyamatban lévő küldés.
  assert.match(source, /if \(localStorage\.getItem\(flag\)\) return;/);
  // R54 (dokumentált spec-változás): a kimerült / úton lévő kihagyása változatlan; a még nem esedékes (monoton óra) bejegyzés újraélesített ébresztővel vár.
  assert.match(source, /if \(outboxInFlight\.has\(entry\.id\) \|\| \(state && state\.attempts >= OUTBOX_MAX_ATTEMPTS\)\) continue;/);
  assert.match(source, /if \(state && state\.nextAt > mono\) \{ if \(state\.wake === undefined\) armOutboxWake\(entry\.id, state\.nextAt - mono\); continue; \}/);
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
  // Terv R2 (vak ellenőrzés K2): a korhatár az UTOLSÓ VÁLASZHOZ mér (`roundActivityAt`), nem a kvíz-fül első megnyitásához — a két
  // minta a szabályváltozást követi. A viselkedést a „R2 / K2” egységteszt és a böngészős próbák mérik.
  assert.match(source, /if \(!round\.finishedAt && roundTooOld\(roundActivityAt\(round\), Date\.now\(\)\)\) return;/);
  assert.match(source, /if \(current\.finishedAt \|\| quizRoundComplete\(current\) \|\| count === 0 \|\| roundTooOld\(roundActivityAt\(current\), Date\.now\(\)\)\) return;/);
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

test("R2 / K2: a 7 napos korhatár az UTOLSÓ VÁLASZHOZ mér — a régen megnyitott, ma megválaszolt kör nem „régi”", () => {
  const DAY = 86_400_000, now = Date.parse("2026-11-18T12:00:00Z");
  // Régebbi tárolt kör (nincs `lastAnsweredAt`): a kezdés számít, mint eddig.
  assert.equal(roundActivityAt({ startedAt: now - 8 * DAY }), now - 8 * DAY);
  assert.equal(roundTooOld(roundActivityAt({ startedAt: now - 8 * DAY }), now), true);
  // A vak ellenőrzés K2 forgatókönyve: hétfőn megnyitva, 8 nappal később megválaszolva → megy.
  const answeredToday = { startedAt: now - 8 * DAY, lastAnsweredAt: now - 60_000 };
  assert.equal(roundActivityAt(answeredToday), now - 60_000);
  assert.equal(roundTooOld(roundActivityAt(answeredToday), now), false);
  // Az utolsó válasz is régi → nem megy; a határ pontosan 7 nap.
  assert.equal(roundTooOld(roundActivityAt({ startedAt: now - 30 * DAY, lastAnsweredAt: now - 7 * DAY - 1 }), now), true);
  assert.equal(roundTooOld(roundActivityAt({ startedAt: now - 30 * DAY, lastAnsweredAt: now - 7 * DAY }), now), false);
  // El nem indított kör (0) továbbra sem „régi”.
  assert.equal(roundTooOld(roundActivityAt({ startedAt: 0 }), now), false);
});

test("R10: legacyResultBody — a végleges beküldés régi alakja az új mezők nélkül; pillanatképre és új mező nélküli törzsre nincs", async () => {
  const { legacyResultBody } = await import("../shared/result-compat");
  const quiz = { kind: "quiz", roundId: "round-a", picks: { q1: 0, q2: -1 }, fingerprint: "fp", learner: "tok", startedAt: 1, lastAnsweredAt: 2 };
  assert.deepEqual(legacyResultBody(quiz), { kind: "quiz", roundId: "round-a", picks: { q1: 0, q2: -1 }, fingerprint: "fp", learner: "tok" });
  const tasks = { kind: "tasks", roundId: "round-b", answers: { t1: "x" }, startedAt: 1 };
  assert.deepEqual(legacyResultBody(tasks), { kind: "tasks", roundId: "round-b", answers: { t1: "x" } });
  // A pillanatkép nem lép vissza: a régi szerver a `partial` nélküli törzset VÉGLEGES beküldésnek venné.
  assert.equal(legacyResultBody({ ...quiz, partial: true }), null);
  // Új mező nélkül nincs mit elhagyni: a 400 valódi hiba, nincs ismétlés.
  assert.equal(legacyResultBody({ kind: "quiz", roundId: "round-a", picks: { q1: 0 } }), null);
  // A bemenet nem módosul.
  assert.equal(quiz.startedAt, 1);
});

test("R24 / L1: a kimenő sor újrapróbájának késleltetése — Retry-After tiszteletben, különben növekvő, felső korláttal; azonnali ismétlés nincs", async () => {
  const { outboxRetryDelayMs, OUTBOX_MAX_ATTEMPTS } = await import("../shared/quiz-round");
  assert.equal(OUTBOX_MAX_ATTEMPTS, 3);
  assert.equal(outboxRetryDelayMs(1, 1), 1000, "Retry-After: 1 → 1 s");
  assert.equal(outboxRetryDelayMs(2, 120), 120_000, "Retry-After: 120 → 120 s");
  assert.equal(outboxRetryDelayMs(1, 0), 1000, "értelmetlen Retry-After esetén is legalább 1 s");
  assert.equal(outboxRetryDelayMs(1), 30_000);
  assert.equal(outboxRetryDelayMs(2), 60_000);
  assert.equal(outboxRetryDelayMs(10), 300_000, "legfeljebb 5 perc");
  for (let attempt = 1; attempt <= 5; attempt++) assert.ok(outboxRetryDelayMs(attempt) >= 30_000, "Retry-After nélkül sincs azonnali ismétlés");
});
