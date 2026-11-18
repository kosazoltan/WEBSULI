import assert from "node:assert/strict";
import test from "node:test";
import { buildResultEmail, gradeQuiz, gradeTasks } from "../shared/lesson-result-email";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Spec 2026-11-17-eredmeny-email-kviz: a kvíz levele a kör MINDEN kérdését mutatja (a gyerek válasza, a helyes válasz, jó / rossz,
 * kihagyottnál „nem válaszolt”); a feladatok levele a mintaválaszt is. Minden beillesztett szöveg escape-elt.
 */
const e = standardFusionFixture().experience!;
const mailOf = (graded: ReturnType<typeof gradeQuiz> | ReturnType<typeof gradeTasks>) =>
  buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "https://example.test/preview/x", graded }).html;
const wrongIndex = (q: { options: string[]; correctIndex: number }) => (q.correctIndex + 1) % q.options.length;

test("gradeQuiz: a rows a kör minden kérdése a beküldés sorrendjében; a wrong a hibás és a kihagyott részhalmaz", () => {
  const [a, b, c] = e.quiz;
  const g = gradeQuiz(e.quiz, { [a.id]: a.correctIndex, [b.id]: wrongIndex(b), [c.id]: -1, ismeretlen: 0 });
  assert.equal(g.rows.length, 3);
  assert.equal(g.rows.length, g.summary.total);
  assert.deepEqual(g.rows.map(r => r.ok), [true, false, false]);
  assert.deepEqual(g.rows.map(r => r.question), [a.question, b.question, c.question]);
  assert.equal(g.rows[0].picked, a.options[a.correctIndex]);
  assert.equal(g.rows[1].picked, b.options[wrongIndex(b)]);
  assert.equal(g.rows[1].correct, b.options[b.correctIndex]);
  assert.equal(g.rows[2].picked, null);
  assert.equal(g.rows[2].correct, c.options[c.correctIndex]);
  assert.deepEqual(g.wrong, g.rows.filter(r => !r.ok).map(({ question, picked, correct }) => ({ question, picked, correct })));
  assert.equal(g.summary.points, 1);
});

test("a kvíz levele: összesítés + minden kérdés a gyerek válaszával; hibásnál és kihagyottnál a helyes válasz", () => {
  const quiz = [
    { id: "q1", question: "Első kérdés?", options: ["jó egy", "rossz egy", "más egy"], correctIndex: 0 },
    { id: "q2", question: "Második kérdés?", options: ["rossz kettő", "jó kettő", "más kettő"], correctIndex: 1 },
    { id: "q3", question: "Harmadik kérdés?", options: ["rossz három", "más három", "jó három"], correctIndex: 2 },
  ];
  const html = mailOf(gradeQuiz(quiz, { q1: 0, q2: 0, q3: -1 }));
  assert.match(html, /<strong>Eredmény:<\/strong> 1 \/ 3 pont — 33%/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3, "mind a három kérdés szerepel");
  assert.match(html, /<strong>Első kérdés\?<\/strong><\/p><p>✅ jó egy<\/p>/);
  assert.match(html, /<strong>Második kérdés\?<\/strong><\/p><p>❌ rossz kettő — helyes: jó kettő<\/p>/);
  assert.match(html, /<strong>Harmadik kérdés\?<\/strong><\/p><p>❌ <em>\(nem válaszolt\)<\/em> — helyes: jó három<\/p>/);
  assert.doesNotMatch(html, /Minden kérdésre helyes/);
  assert.ok(html.indexOf("Első kérdés") < html.indexOf("Második kérdés") && html.indexOf("Második kérdés") < html.indexOf("Harmadik kérdés"));
});

test("hibátlan kvíz: a dicsérő mondat mellett is minden kérdés látszik; a helyes sorban nincs „helyes:” ismétlés", () => {
  const [a, b] = e.quiz;
  const html = mailOf(gradeQuiz(e.quiz, { [a.id]: a.correctIndex, [b.id]: b.correctIndex }));
  assert.match(html, /Minden kérdésre helyes választ adott\./);
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /— helyes:/);
  assert.match(html, /2 \/ 2 pont — 100%/);
});

test("a kvíz kérdése és opciója is escape-elve kerül a levélbe", () => {
  const quiz = [{ id: "q1", question: "Mi a <b>címke</b>?", options: ["<script>alert(1)</script>", "a \"jó\" & 'szép'", "más"], correctIndex: 1 }];
  const html = mailOf(gradeQuiz(quiz, { q1: 0 }));
  assert.ok(!html.includes("<script>"), "nyers szkript nem kerülhet a levélbe");
  assert.ok(!html.includes("<b>címke</b>"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Mi a &lt;b&gt;címke&lt;\/b&gt;\?/);
  assert.match(html, /helyes: a &quot;jó&quot; &amp; &#39;szép&#39;/);
});

test("üres kvízkör: nincs kérdéslista (a szerver üres kört nem is küld)", () => {
  const g = gradeQuiz(e.quiz, {});
  assert.deepEqual(g.rows, []);
  assert.doesNotMatch(mailOf(g), /<ol>/);
});

test("a feladatok levele: kérdés, jelölés, válasz és a mintaválasz (escape-elve); a kihagyott „nem válaszolt”", () => {
  const [t1, t2] = e.tasks;
  const g = gradeTasks(e.tasks, { [t1.id]: t1.sample, [t2.id]: "" });
  assert.equal(g.rows[0].sample, t1.sample);
  assert.equal(g.rows[0].state, "ok", "a mintaválasz a saját rubrikáján teljes pont");
  const html = mailOf(g);
  assert.equal((html.match(/<em>Mintaválasz:<\/em>/g) ?? []).length, 2);
  assert.match(html, /✅ /);
  assert.match(html, /❌ <em>\(nem válaszolt\)<\/em>/);
  const tricky = { ...t1, sample: "A <i>minta</i> & társa" };
  const html2 = mailOf(gradeTasks([tricky], { [t1.id]: "valami" }));
  assert.match(html2, /<em>Mintaválasz:<\/em> A &lt;i&gt;minta&lt;\/i&gt; &amp; társa/);
  assert.ok(!html2.includes("<i>minta</i>"));
});
