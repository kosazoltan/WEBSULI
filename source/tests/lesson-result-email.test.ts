import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResultEmail, gradeQuiz, gradeTasks, resultRequestSchema } from "../shared/lesson-result-email";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md): a tiszta modul.
const e = fusionFixture().experience!;

test("a beküldés sémája: csak a két ismert alak; ismeretlen mező, túl hosszú válasz és hamis pontszám elutasítva", () => {
  assert.ok(resultRequestSchema.safeParse({ kind: "tasks", roundId: "round-abc", answers: { t1: "válasz" } }).success);
  assert.ok(resultRequestSchema.safeParse({ kind: "quiz", roundId: "round-abc", picks: { q1: 2 }, fingerprint: "fp" }).success);
  assert.equal(resultRequestSchema.safeParse({ kind: "tasks", roundId: "round-abc", answers: {}, score: 100 }).success, false, "a kliens pontszámát nem fogadjuk");
  assert.equal(resultRequestSchema.safeParse({ kind: "tasks", roundId: "round-abc", answers: { t1: "x".repeat(2001) } }).success, false);
  assert.equal(resultRequestSchema.safeParse({ kind: "quiz", roundId: "round-abc", picks: { q1: 9 } }).success, false);
  assert.equal(resultRequestSchema.safeParse({ kind: "quiz", roundId: "../x", picks: {} }).success, false);
});

test("szerveroldali pontozás: a feladat a megosztott pontozóval; ismeretlen azonosító kimarad; a döntőbíró csak emel", () => {
  const task = e.tasks[0];
  const plain = gradeTasks(e.tasks, { [task.id]: "", ismeretlen: "bármi" });
  assert.equal(plain.rows.length, 1, "csak az ismert feladat");
  assert.equal(plain.rows[0].state, "fail");
  const raised = gradeTasks(e.tasks, { [task.id]: "egy rövid válasz" }, () => ({ state: "ok", score: 1 }));
  assert.equal(raised.rows[0].score, 1);
  const notLowered = gradeTasks(e.tasks, { [task.id]: task.sample }, () => ({ state: "fail", score: 0 }));
  assert.ok(notLowered.rows[0].score >= gradeTasks(e.tasks, { [task.id]: task.sample }).rows[0].score, "a döntőbíró nem ronthat");
});

test("kvíz: a helyes index szerint; a hibás kérdések a válasszal és a helyessel", () => {
  const [a, b] = e.quiz;
  const g = gradeQuiz(e.quiz, { [a.id]: a.correctIndex, [b.id]: (b.correctIndex + 1) % b.options.length, ismeretlen: 0 });
  assert.equal(g.summary.total, 2);
  assert.equal(g.summary.points, 1);
  assert.equal(g.wrong.length, 1);
  assert.equal(g.wrong[0].correct, b.options[b.correctIndex]);
});

test("a levél: tárgy a lecke címével, részével és százalékkal; minden tanulói szöveg escape-elve", () => {
  const task = e.tasks[0];
  const mail = buildResultEmail({ lessonTitle: "Törtek <b>", classroom: 5, learner: "Vendég tanuló", url: "https://websuli.vip/preview/x", graded: gradeTasks(e.tasks, { [task.id]: "<script>alert(1)</script>" }) });
  assert.match(mail.subject, /^\[WebSuli eredmény\] Törtek <b> — Feladatok — \d+% \(/);
  assert.ok(!mail.html.includes("<script>"), "a tanuló szövege nem kerülhet nyersen a levélbe");
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /Törtek &lt;b&gt;/);
  assert.match(mail.html, /Vendég tanuló/);
});
