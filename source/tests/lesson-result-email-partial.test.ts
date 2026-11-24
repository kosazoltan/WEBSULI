import assert from "node:assert/strict";
import test from "node:test";
import { buildResultEmail, gradePartialQuiz, resultRequestSchema } from "../shared/lesson-result-email";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Eredmény-e-mail B5a-0 (docs/specs/2026-11-22-eredmeny-email-bontas-vegrehajtas.md 5. pont; #510 S1b, R5, R13): a pillanatkép (`partial`)
 * alakja és a „félbehagyva” / felülíró levél tartalma. A szerver kapcsoló nélkül a pillanatképet NEM pontozza véglegesként (DB-teszt).
 */
const e = standardFusionFixture().experience!;
const q = e.quiz;

test("B5a-0 séma: a kvíz `partial` jelzője opcionális logikai érték; a feladatoknál nincs; a séma szigorú marad", () => {
  const base = { kind: "quiz", roundId: "round-abc1", picks: { [q[0].id]: 0 } };
  assert.ok(resultRequestSchema.safeParse({ ...base, partial: true }).success);
  assert.ok(resultRequestSchema.safeParse(base).success, "régi alak");
  assert.equal(resultRequestSchema.safeParse({ ...base, partial: "true" }).success, false);
  assert.equal(resultRequestSchema.safeParse({ kind: "tasks", roundId: "round-abc1", answers: { t1: "x" }, partial: true }).success, false);
});

test("B5a-0 (R5): gradePartialQuiz — csak a megválaszolt kérdések számítanak; az összes a szerveroldali körméret (nem kisebb a megválaszoltnál)", () => {
  assert.equal(gradePartialQuiz(q, {}), null, "válasz nélkül nincs levél");
  assert.equal(gradePartialQuiz(q, { [q[0].id]: -1, ismeretlen: 0 }), null, "kihagyás és ismeretlen azonosító nem válasz");
  const g = gradePartialQuiz(q, { [q[0].id]: q[0].correctIndex, [q[1].id]: (q[1].correctIndex + 1) % q[1].options.length, [q[2].id]: -1 }, 25)!;
  assert.deepEqual(g.meta?.partial, { answered: 2, total: 25 });
  assert.equal(g.summary.total, 2); assert.equal(g.summary.points, 1);
  assert.deepEqual(gradePartialQuiz(q, { [q[0].id]: 0, [q[1].id]: 0 }, 1)!.meta?.partial, { answered: 2, total: 2 }, "a körméret nem lehet kisebb a megválaszoltnál");
  assert.deepEqual(gradePartialQuiz(q, { [q[0].id]: 0, [q[1].id]: -1 })!.meta?.partial, { answered: 1, total: 2 }, "körméret nélkül a beküldött ismert azonosítók száma");
});

test("B5a-0 (R13): a „félbehagyva” levél tárgya, állapotsora és dátumsora (utolsó válasz); csak a megválaszolt kérdésekről mond „minden helyes”-t", () => {
  const sentAt = new Date("2026-11-17T20:00:00Z");
  const g = gradePartialQuiz(q, { [q[0].id]: q[0].correctIndex }, 25)!;
  const mail = buildResultEmail({ lessonTitle: "Lecke", classroom: 7, learner: "Vendég tanuló", url: "", sentAt,
    graded: { ...g, meta: { ...g.meta, lastAnsweredAt: Date.parse("2026-11-17T19:41:00Z") } } });
  assert.match(mail.subject, /— Kvíz \(félbehagyva: 1 \/ 25\) — 100%/);
  assert.match(mail.html, /Állapot:<\/strong> félbehagyva — 1 \/ 25 kérdésre válaszolt/);
  assert.match(mail.html, /Utolsó válasz:<\/strong> 2026\. 11\. 17\. 20:41 \(magyar idő\)/);
  assert.doesNotMatch(mail.html, /Beküldve:/);
  assert.match(mail.html, /Minden megválaszolt kérdésre helyes választ adott\./);
});

test("B5a-0 (R1 a): a végleges levél felülíró mondata csak jelzéssel; jelzés nélkül a levél változatlan", () => {
  const g = gradePartialQuiz(q, { [q[0].id]: q[0].correctIndex }, 1)!;
  const final = { ...g, meta: undefined };
  const plain = buildResultEmail({ lessonTitle: "Lecke", classroom: 7, learner: "X", url: "", graded: final, sentAt: new Date("2026-11-17T20:00:00Z") });
  assert.doesNotMatch(plain.html, /helyébe lép/);
  assert.match(plain.html, /Beküldve:/);
  const sup = buildResultEmail({ lessonTitle: "Lecke", classroom: 7, learner: "X", url: "", graded: { ...final, meta: { supersedesPartial: true } }, sentAt: new Date("2026-11-17T20:00:00Z") });
  assert.match(sup.html, /ez a befejezett kör eredménye — a korábbi, „félbehagyva” jelzésű levél helyébe lép\./);
  assert.match(sup.subject, /— Kvíz — /, "a végleges levél tárgya nem „félbehagyva”");
});
