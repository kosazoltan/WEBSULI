import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCombinedResultEmail, buildResultEmail, gradeQuiz, gradeTasks } from "../shared/lesson-result-email";
import { scoreSummary } from "../shared/lesson-experience-score";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// U4a (docs/specs/2026-11-24-osszevont-eredmenylevel.md): a szöveges feladatok és a kvíz eredménye EGY levélben — két szakasz,
// közös összesítő; ha 7 nap alatt csak az egyik készült el, jelölt részleges levél.
const e = fusionFixture().experience!;
const tasks = gradeTasks(e.tasks, Object.fromEntries(e.tasks.map((t) => [t.id, t.sample])));
const [qa, qb] = e.quiz;
const quiz = gradeQuiz(e.quiz, { [qa.id]: qa.correctIndex, [qb.id]: (qb.correctIndex + 1) % qb.options.length });
const base = { lessonTitle: "Törtek <b>", classroom: 6, learner: "Kis <Marci>", learnerFirst: "Marci", url: "https://example.test/l", sentAt: new Date("2026-11-24T10:00:00Z") };

test("mindkét rész: egy tárgy a közös százalékkal, két szakasz a saját eredményével, közös összesítő", () => {
  const all = scoreSummary(tasks.summary.points + quiz.summary.points, tasks.summary.total + quiz.summary.total);
  const mail = buildCombinedResultEmail({ ...base, tasks, quiz });
  assert.equal(mail.subject, `[WebSuli eredmény] Marci – Törtek <b> — Feladatok + kvíz — ${all.percent}% (${all.label})`);
  assert.match(mail.html, /<h3>Feladatok — /);
  assert.match(mail.html, /<h3>Kvíz — /);
  assert.ok(mail.html.indexOf("<h3>Feladatok") < mail.html.indexOf("<h3>Kvíz"), "a feladatok előbb");
  assert.ok(mail.html.includes(`<strong>Összesítve:</strong> ${all.points} / ${all.total} pont — ${all.percent}% — ${all.grade}`));
  assert.ok(mail.html.includes(`${tasks.summary.points} / ${tasks.summary.total} pont`), "a feladatrész saját eredménye");
  assert.ok(mail.html.includes(`${quiz.summary.points} / ${quiz.summary.total} pont`), "a kvízrész saját eredménye");
  assert.ok(!/Részleges/.test(mail.html));
  assert.ok(mail.html.includes("Kis &lt;Marci&gt;") && mail.html.includes("Törtek &lt;b&gt;"), "escape");
  assert.ok(!mail.html.includes("<Marci>"));
});

test("részleges (csak a kvíz): jelölés a tárgyban és a levélben, az összesítő csak a meglévő részből", () => {
  const mail = buildCombinedResultEmail({ ...base, tasks: null, quiz });
  assert.equal(mail.subject, `[WebSuli eredmény] Marci – Törtek <b> — Kvíz (részleges: a feladatok hiányoznak) — ${quiz.summary.percent}% (${quiz.summary.label})`);
  assert.match(mail.html, /<strong>Részleges eredmény:<\/strong> a szöveges feladatok 7 napon belül nem készültek el\./);
  assert.ok(!mail.html.includes("<h3>Feladatok"));
  assert.ok(mail.html.includes(`<strong>Összesítve:</strong> ${quiz.summary.points} / ${quiz.summary.total} pont`));
});

test("részleges (csak a feladatok): a kvíz hiányát jelzi", () => {
  const mail = buildCombinedResultEmail({ ...base, tasks, quiz: null });
  assert.match(mail.subject, /— Feladatok \(részleges: a kvíz hiányzik\) —/);
  assert.match(mail.html, /a kvíz 7 napon belül nem készült el\./);
});

test("a szakaszok tartalma bájtra a meglévő egyrészes levél törzse (feladatlista, kvízkérdések); vendégnél útmutató", () => {
  const mail = buildCombinedResultEmail({ ...base, guest: true, tasks, quiz });
  for (const graded of [tasks, quiz]) {
    const single = buildResultEmail({ ...base, guest: false, graded }).html;
    const bodyStart = single.indexOf("</p>") + 4;
    const body = single.slice(bodyStart, single.indexOf("<p><a href="));
    assert.ok(body.length > 0 && mail.html.includes(body), `${graded.kind}: a törzs változatlan`);
  }
  assert.ok(/párosít/i.test(mail.html), "vendég-útmutató");
  assert.equal((mail.html.match(/<a href=/g) ?? []).length, 1, "egy leckelink");
});

test("legalább egy rész kötelező", () => {
  assert.throws(() => buildCombinedResultEmail({ ...base, tasks: null, quiz: null }));
});

// Review #585: a tárgysor a 200 karakteres keretben is megtartja a részjelölést és a százalékot (csak a név/cím rövidül);
// a „félbehagyva” pillanatkép helyébe lépő kvíz szakasza ezt közli (true és "unknown" is).
test("hosszú (255 karakteres) cím: a tárgy ≤ 200, a részleges jelölés és a százalék megmarad, a cím rövidül", () => {
  const long = "Á".repeat(255);
  const mail = buildCombinedResultEmail({ ...base, lessonTitle: long, tasks: null, quiz });
  assert.ok(mail.subject.length <= 200, String(mail.subject.length));
  assert.ok(mail.subject.endsWith(` — Kvíz (részleges: a feladatok hiányoznak) — ${quiz.summary.percent}% (${quiz.summary.label})`), mail.subject);
  assert.ok(mail.subject.startsWith("[WebSuli eredmény] Marci – ÁÁ"));
  assert.ok(mail.subject.includes("…"));
  const short = buildCombinedResultEmail({ ...base, tasks, quiz });
  assert.ok(!short.subject.includes("…"), "rövid címnél nincs rövidítés");
});

test("a félbehagyott pillanatkép helyébe lépő kvíz: a kvíz szakaszában a megfelelő állapotszöveg", () => {
  const sure = buildCombinedResultEmail({ ...base, tasks, quiz: { ...quiz, meta: { supersedesPartial: true } } });
  assert.match(sure.html, /<h3>Kvíz[^<]*<\/h3>\n<p><strong>Állapot:<\/strong> ez a befejezett kör eredménye — a korábbi, „félbehagyva” jelzésű levél helyébe lép\.<br>/);
  const maybe = buildCombinedResultEmail({ ...base, tasks, quiz: { ...quiz, meta: { supersedesPartial: "unknown" } } });
  assert.match(maybe.html, /ha erről a körről korábban „félbehagyva” jelzésű levél érkezett, ez lép a helyébe\./);
  assert.ok(!/Állapot:/.test(buildCombinedResultEmail({ ...base, tasks, quiz }).html));
});
