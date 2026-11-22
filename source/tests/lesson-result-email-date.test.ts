import assert from "node:assert/strict";
import test from "node:test";
import { buildResultEmail, formatBudapest, gradeQuiz, resultRequestSchema } from "../shared/lesson-result-email";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Bontás B1a (docs/specs/2026-11-22-eredmeny-email-bontas.md; a #510 R2 / R13 teljes kör része): a szerver ELFOGADJA a kör kezdetét és az
 * utolsó válasz idejét (opcionális mezők — a régi kliens nélkülük küld), és a levél dátumsort kap magyar idő szerint. A kliens csak a B1b-ben
 * kezdi küldeni őket (a szigorú séma miatt előbb a szervernek kell települnie).
 */
const e = standardFusionFixture().experience!;
const quiz = gradeQuiz(e.quiz, Object.fromEntries(e.quiz.map((q) => [q.id, q.correctIndex])));

test("séma: a startedAt / lastAnsweredAt opcionális — nélkülük (régi kliens) és velük (új kliens) is elfogadott, érvénytelen értékkel nem", () => {
  const base = { kind: "quiz", roundId: "round-abc1", picks: { q1: 0 } };
  assert.ok(resultRequestSchema.safeParse(base).success, "régi kliens");
  assert.ok(resultRequestSchema.safeParse({ ...base, startedAt: 1_790_000_000_000, lastAnsweredAt: 1_790_000_100_000 }).success, "új kliens");
  assert.ok(resultRequestSchema.safeParse({ kind: "tasks", roundId: "round-abc1", answers: { t1: "x" }, startedAt: 1_790_000_000_000 }).success);
  for (const bad of [0, -1, 1.5, "1790000000000"]) assert.equal(resultRequestSchema.safeParse({ ...base, startedAt: bad }).success, false, `startedAt=${String(bad)}`);
  assert.equal(resultRequestSchema.safeParse({ ...base, ismeretlen: 1 }).success, false, "a séma továbbra is szigorú");
});

test("formatBudapest: magyar idő, nyári és téli időszámítással", () => {
  assert.equal(formatBudapest(new Date("2026-11-17T19:41:00Z")), "2026. 11. 17. 20:41", "télen UTC+1");
  assert.equal(formatBudapest(new Date("2026-07-01T10:05:00Z")), "2026. 07. 01. 12:05", "nyáron UTC+2");
  assert.equal(formatBudapest(new Date("2026-12-31T23:30:00Z")), "2027. 01. 01. 00:30", "dátumhatár Budapest szerint");
});

test("levél: beküldési dátum mindig; a kör kezdete csak hihető értékkel (múltbeli, legfeljebb 400 napos)", () => {
  const sentAt = new Date("2026-11-17T19:41:00Z");
  const mail = (meta?: { startedAt?: number }) => buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "https://example.test/x", graded: { ...quiz, meta }, sentAt }).html;
  assert.match(mail(), /Beküldve:<\/strong> 2026\. 11\. 17\. 20:41 \(magyar idő\)/);
  assert.doesNotMatch(mail(), /A kör kezdete/);
  assert.match(mail({ startedAt: Date.parse("2026-11-17T19:00:00Z") }), /A kör kezdete:<\/strong> 2026\. 11\. 17\. 20:00/);
  assert.doesNotMatch(mail({ startedAt: Date.parse("2026-11-18T19:00:00Z") }), /A kör kezdete/, "jövőbeli kezdés nem jelenik meg");
  assert.doesNotMatch(mail({ startedAt: Date.parse("2025-01-01T00:00:00Z") }), /A kör kezdete/, "400 napnál régebbi nem jelenik meg");
});
