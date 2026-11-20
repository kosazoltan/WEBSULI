import assert from "node:assert/strict";
import test from "node:test";
import { buildResultEmail, formatBudapest, gradePartialQuiz, gradeQuiz, gradeTasks, resultRequestSchema } from "../shared/lesson-result-email";
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

/* S1b: félbehagyott kvíz, dátum a levélben, a séma új mezői. */
const QUIZ3 = [
  { id: "q1", question: "Első kérdés?", options: ["jó egy", "rossz egy", "más egy"], correctIndex: 0 },
  { id: "q2", question: "Második kérdés?", options: ["rossz kettő", "jó kettő", "más kettő"], correctIndex: 1 },
  { id: "q3", question: "Harmadik kérdés?", options: ["rossz három", "más három", "jó három"], correctIndex: 2 },
];
const AT = new Date("2026-11-17T19:41:00Z");

test("S1b: a félbehagyott kvíz csak a megválaszolt kérdéseket pontozza; válasz nélkül nincs miről levelet küldeni", () => {
  const g = gradePartialQuiz(QUIZ3, { q1: 0, q2: 0, q3: -1, ismeretlen: 1 })!;
  assert.deepEqual(g.meta, { partial: { answered: 2, total: 3 } });
  assert.deepEqual([g.summary.points, g.summary.total, g.summary.percent], [1, 2, 50], "a pont a megválaszolt kérdésekre vonatkozik");
  assert.deepEqual(g.rows.map(r => r.question), ["Első kérdés?", "Második kérdés?"], "a meg nem válaszolt kérdés nem szerepel hibaként");
  assert.equal(gradePartialQuiz(QUIZ3, { q1: -1, q2: -1, q3: -1 }), null);
  assert.equal(gradePartialQuiz(QUIZ3, {}), null);
  assert.equal(gradePartialQuiz(QUIZ3, { ismeretlen: 0 }), null);
});

test("S1b: a „félbehagyva” levél tárgya és állapotsora; a befejezett kör levele jelzi, ha korábbi levél helyébe lép", () => {
  const partial = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: gradePartialQuiz(QUIZ3, { q1: 0, q2: 0, q3: -1 })!, sentAt: AT });
  assert.match(partial.subject, /^\[WebSuli eredmény\] Lecke — Kvíz \(félbehagyva: 2 \/ 3\) — 50% \(/);
  assert.match(partial.html, /<strong>Állapot:<\/strong> félbehagyva — 2 \/ 3 kérdésre válaszolt; a pont a megválaszolt kérdésekre vonatkozik\./);
  assert.equal((partial.html.match(/<li>/g) ?? []).length, 2);
  assert.doesNotMatch(partial.html, /nem válaszolt/);
  assert.doesNotMatch(partial.html, /helyébe lép/);
  const full = gradeQuiz(QUIZ3, { q1: 0, q2: 0, q3: -1 });
  const plain = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: full, sentAt: AT });
  assert.match(plain.subject, /— Kvíz — 33% \(/);
  assert.doesNotMatch(plain.html, /Állapot:/);
  const superseding = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: { ...full, meta: { supersedesPartial: true } }, sentAt: AT });
  assert.match(superseding.html, /ez a befejezett kör eredménye — a korábbi, „félbehagyva” jelzésű levél helyébe lép\./);
  assert.match(superseding.subject, /— Kvíz — 33% \(/);
});

test("S1b (review K1): a levélben a beküldés ideje magyar idő szerint (téli és nyári időszámítás), és a hihető körkezdet", () => {
  assert.equal(formatBudapest(new Date("2026-11-17T19:41:00Z")), "2026. 11. 17. 20:41", "tél: UTC+1");
  assert.equal(formatBudapest(new Date("2026-07-01T21:30:00Z")), "2026. 07. 01. 23:30", "nyár: UTC+2");
  assert.equal(formatBudapest(new Date("2026-12-31T23:30:00Z")), "2027. 01. 01. 00:30", "a dátumhatár magyar idő szerint");
  const graded = gradeQuiz(QUIZ3, { q1: 0 });
  const mail = (meta: object, sentAt = AT) => buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: { ...graded, meta }, sentAt }).html;
  assert.match(mail({}), /<strong>Beküldve:<\/strong> 2026\. 11\. 17\. 20:41 \(magyar idő\)/);
  assert.doesNotMatch(mail({}), /A kör kezdete/);
  assert.match(mail({ startedAt: Date.parse("2026-11-12T15:05:00Z") }), /<strong>A kör kezdete:<\/strong> 2026\. 11\. 12\. 16:05/);
  assert.doesNotMatch(mail({ startedAt: AT.getTime() + 60_000 }), /A kör kezdete/, "jövőbeli kezdés nem jelenik meg");
  assert.doesNotMatch(mail({ startedAt: AT.getTime() - 500 * 86_400_000 }), /A kör kezdete/, "képtelenül régi kezdés nem jelenik meg");
  // A feladatok levele is kap dátumot; alapértelmezésben a mostani időt.
  const tasksMail = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: gradeTasks(e.tasks, { [e.tasks[0].id]: "valami" }) }).html;
  assert.match(tasksMail, /<strong>Beküldve:<\/strong> \d{4}\. \d{2}\. \d{2}\. \d{2}:\d{2} \(magyar idő\)/);
});

test("S1b: a beküldés sémája — `partial` csak kvíznél, `startedAt` pozitív egész; ismeretlen mező továbbra is elutasítva", () => {
  const ok = (body: object) => resultRequestSchema.safeParse(body).success;
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, partial: true, startedAt: 1_763_408_460_000 }), true);
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 } }), true, "a régi kliens alakja változatlanul érvényes");
  assert.equal(ok({ kind: "tasks", roundId: "round-abcd", answers: { t1: "x" }, startedAt: 1_763_408_460_000 }), true);
  assert.equal(ok({ kind: "tasks", roundId: "round-abcd", answers: { t1: "x" }, partial: true }), false, "a feladatoknak nincs pillanatképe");
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, partial: "igen" }), false);
  for (const startedAt of [0, -5, 1.5, "tegnap"]) assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, startedAt }), false, String(startedAt));
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, score: 100 }), false);
});

test("R5 / S3: a félbehagyott kvíz összes-száma a megadott (szerveroldali) körméret — a kliens rövidebb azonosítólistája nem csökkenti", () => {
  // Csak 2 azonosító érkezik egy 25 kérdéses körből: a levél nem állíthat „2 / 2”-t.
  const g = gradePartialQuiz(QUIZ3, { q1: 0, q2: 1 }, 25)!;
  assert.deepEqual(g.meta, { partial: { answered: 2, total: 25 } });
  assert.deepEqual([g.summary.points, g.summary.total], [2, 2], "a pont továbbra is a megválaszolt kérdésekre vonatkozik");
  const mail = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: g, sentAt: AT });
  assert.match(mail.subject, /— Kvíz \(félbehagyva: 2 \/ 25\) — 100% \(/);
  // Ha a megválaszoltak száma meghaladná a körméretet (a lecke közben rövidebb kört kapott), az összes nem lehet kisebb náluk.
  assert.deepEqual(gradePartialQuiz(QUIZ3, { q1: 0, q2: 1, q3: 2 }, 2)!.meta, { partial: { answered: 3, total: 3 } });
  // Körméret nélkül (régi hívók) a viselkedés változatlan.
  assert.deepEqual(gradePartialQuiz(QUIZ3, { q1: 0, q2: -1 })!.meta, { partial: { answered: 1, total: 2 } });
});

test("R2: a kvíz beküldésének új, opcionális `lastAnsweredAt` mezője — pozitív egész, csak kvíznél", () => {
  const ok = (body: object) => resultRequestSchema.safeParse(body).success;
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, partial: true, startedAt: 1_763_408_460_000, lastAnsweredAt: 1_763_408_470_000 }), true);
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, lastAnsweredAt: 1_763_408_470_000 }), true);
  for (const lastAnsweredAt of [0, -5, 1.5, "tegnap"]) assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, lastAnsweredAt }), false, String(lastAnsweredAt));
  assert.equal(ok({ kind: "tasks", roundId: "round-abcd", answers: { t1: "x" }, lastAnsweredAt: 1_763_408_470_000 }), false);
});

test("R13 / K6: a részleges levél nem állítja, hogy minden kérdésre helyes választ adott; a dátumsora az utolsó válasz ideje", () => {
  const partial = gradePartialQuiz(QUIZ3, { q1: 0, q2: -1, q3: -1 }, 3)!;
  const lastAnsweredAt = Date.parse("2026-11-17T19:20:00Z");
  const html = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: { ...partial, meta: { ...partial.meta, lastAnsweredAt } }, sentAt: AT }).html;
  assert.doesNotMatch(html, /Minden kérdésre helyes választ adott/);
  assert.match(html, /Minden megválaszolt kérdésre helyes választ adott\./);
  assert.match(html, /<strong>Utolsó válasz:<\/strong> 2026\. 11\. 17\. 20:20/);
  assert.doesNotMatch(html, /Beküldve:/, "a részleges levél nem a 15 perccel későbbi küldési időt mutatja");
  // Utolsó válasz nélkül (régi kliens) marad a „Beküldve”; a végleges levél szövege változatlan.
  assert.match(buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: partial, sentAt: AT }).html, /<strong>Beküldve:<\/strong>/);
  const full = buildResultEmail({ lessonTitle: "Lecke", classroom: 5, learner: "Vendég tanuló", url: "", graded: gradeQuiz(QUIZ3, { q1: 0, q2: 1, q3: 2 }), sentAt: AT }).html;
  assert.match(full, /Minden kérdésre helyes választ adott\./);
  assert.match(full, /<strong>Beküldve:<\/strong>/);
});

test("R13: a beküldés új, opcionális `clientNow` mezője — pozitív egész, mindkét fajtánál", () => {
  const ok = (body: object) => resultRequestSchema.safeParse(body).success;
  assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, partial: true, clientNow: 1_763_408_470_000 }), true);
  assert.equal(ok({ kind: "tasks", roundId: "round-abcd", answers: { t1: "x" }, clientNow: 1_763_408_470_000 }), true);
  for (const clientNow of [0, -5, 1.5, "most"]) assert.equal(ok({ kind: "quiz", roundId: "round-abcd", picks: { q1: 0 }, clientNow }), false, String(clientNow));
});
