import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLiteral, extractLegacyLesson, textSections } from "../server/catalog/legacy-extract";
import { extractFusionLesson } from "../server/catalog/fusion-extract";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-10-05-s1-katalogus-kinyeres — a régi leckék MÉRT formátumai (2026-10-05, 177 lecke objektum-szignatúrái). */

test("mért formátumok osztályozása: feleletválasztós (index, betű, rövid kulcs), rövid válasz, nyílt feladat, szókincs", () => {
  assert.deepEqual(classifyLiteral({ q: "Melyik a helyes kérdés az időre?", opts: ["What time is it?", "How time is it?", "What is time?"], correct: 0 }), { kind: "quiz", prompt: "Melyik a helyes kérdés az időre?", options: ["What time is it?", "How time is it?", "What is time?"], correctIndex: 0, shape: "correct,opts,q" });
  assert.equal(classifyLiteral({ q: "Milyen ünnep van október 7-én?", o: ["Húsvét", "Notre-Dame du Rosaire", "Karácsony"], c: 1 })!.correctIndex, 1);
  const letter = classifyLiteral({ q: "'There ___ a cat on the table.' Mi hiányzik?", a: "is", b: "are", c: "am", correct: "a" })!;
  assert.deepEqual([letter.kind, letter.options, letter.correctIndex], ["quiz", ["is", "are", "am"], 0]);
  assert.equal(classifyLiteral({ kerdes: "Mi a fotoszintézis terméke?", valaszok: ["oxigén", "nitrogén", "hélium"], helyes: "oxigén" })!.correctIndex, 0, "a kulcs maga az opció szövege");
  assert.deepEqual(classifyLiteral({ q: "Hogyan mondod angolul: 'Egy óra van'?", a: ["it's one o'clock", "it is one o'clock"] }), { kind: "short_answer", prompt: "Hogyan mondod angolul: 'Egy óra van'?", accepted: ["it's one o'clock", "it is one o'clock"], shape: "a,q" });
  const task = classifyLiteral({ q: "Sorold fel a három halmazállapotot!", keywords: ["szilárd", "folyékony", "gáz"], key: "Szilárd, folyékony, gáz." })!;
  assert.deepEqual([task.kind, task.keywordGroups, task.body], ["open_task", [["szilárd"], ["folyékony"], ["gáz"]], "Szilárd, folyékony, gáz."]);
  assert.deepEqual(classifyLiteral({ en: "Christmas", hu: "karácsony" })!.pair, { source: "Christmas", target: "karácsony", sourceLang: "en", targetLang: "hu" });
  assert.equal(classifyLiteral({ q: "Kérdés?", opts: ["a", "b", "c"], correct: 7 })!.kind, "quiz_unkeyed", "érvénytelen kulcs: szó szerint nem vehető át");
  assert.equal(classifyLiteral({ color: "#fff", size: 3 }), null, "nem tudás-tétel");
});

test("mintavételes javítás (2026-10-05): az `a` opció-lista, ha helyes-kulcs is van; egyelemű tömb-kulcs; „E” betű; `ok` kulcs", () => {
  // 1199 tétel: {q, a:[…], c|correct} — az `a` az OPCIÓK, nem az elfogadott válaszok (különben a hibás opciót is elfogadná)
  const a1 = classifyLiteral({ q: "Mi táplálja az égést?", a: ["Nitrogén", "Oxigén", "Szén-dioxid"], correct: 1 })!;
  assert.deepEqual([a1.kind, a1.options, a1.correctIndex, a1.accepted], ["quiz", ["Nitrogén", "Oxigén", "Szén-dioxid"], 1, undefined]);
  assert.equal(classifyLiteral({ q: "Mit jelent: 'wake up'?", a: ["felébredni", "aludni", "sétálni"], c: 0 })!.kind, "quiz");
  assert.equal(classifyLiteral({ question: "Hány hl 150 liter?", answers: ["1,5", "1.5"], unit: "hl" })!.kind, "short_answer", "kulcs nélkül: elfogadott válaszok");
  assert.equal(classifyLiteral({ question: "Melyik?", options: ["A) x", "B) y", "C) z", "D) w", "E) v"], correct: [4] })!.correctIndex, 4, "egyelemű tömb-kulcs, E opció");
  assert.equal(classifyLiteral({ question: "Melyek?", options: ["A) x", "B) y", "C) z"], correct: [0, 2] })!.kind, "quiz_unkeyed", "több helyes válasz: nem egyválasztós");
  assert.equal(classifyLiteral({ q: "Melyik szó tőszám?", opts: ["ötödik", "öt", "ötöd"], ok: 1 })!.correctIndex, 1);
  assert.equal(classifyLiteral({ q: "Melyik?", a: "x", b: "y", c: "z", d: "w", correct: "e" })!.kind, "quiz_unkeyed", "nem létező betű");
  // mért (430 + 198 tétel): {q, o|opts, a: <index>} — nevesített opció-mező mellett az `a` a helyes kulcs
  assert.equal(classifyLiteral({ q: "Milyen kérdésre felel a helyhatározó?", o: ["Mikor?", "Hol? Hová? Honnan?", "Hogyan?", "Kivel?"], a: 1 })!.correctIndex, 1);
  assert.equal(classifyLiteral({ q: "Mi a szorzás jelentése?", opts: ["Ismételt összeadás", "Ismételt kivonás", "Ismételt osztás"], a: 0 })!.correctIndex, 0);
});

test("a szkriptet NEM futtatjuk: csak literál objektum; futásidejű objektum és hibás szkript kihagyva", () => {
  const html = `<html><body><h2>Az óra kifejezése</h2><p>Angolul az egész órát az o'clock szóval mondjuk, például: it's one o'clock.</p>
<script>const quizBank = [{q: "Mennyi az idő? (1:00)", opts: ["one o'clock", "two o'clock", "three o'clock"], correct: 0}, {q: "Fél kettő angolul?", a: ["half past one"]}];
function render(item){ return { question: item.q, options: item.opts, correctAnswer: item.correct }; } window.__x = (() => { throw new Error("nem futhat"); });</script>
<script>this is not javascript (</script>
<script src="/x.js"></script></body></html>`;
  const r = extractLegacyLesson(html, "legacy_html:t1");
  assert.equal(r.stats.scriptErrors, 1);
  assert.deepEqual(r.items.filter((i) => i.kind !== "section").map((i) => i.kind), ["quiz", "short_answer"]);
  assert.ok(r.items.every((i) => i.provenance === "legacy_html:t1" && i.fingerprint.length === 16));
  assert.equal(r.sections[0].heading, "Az óra kifejezése");
  assert.ok(r.items.some((i) => i.kind === "section" && /o'clock/.test(i.body ?? "")));
});

test("duplikátum-szűrés lenyomattal és a szöveg-szakaszok (≥ 40 karakter, script/style nélkül)", () => {
  const dup = `<script>var a=[{q:"Mi 2+2?",opts:["3","4","5"],correct:1},{q:"Mi 2+2?",opts:["3","4","5"],correct:1}];</script>`;
  const r = extractLegacyLesson(dup, "legacy_html:t2");
  assert.equal(r.items.filter((i) => i.kind === "quiz").length, 1);
  assert.equal(r.stats.duplicates, 1);
  assert.deepEqual(textSections("<h3>Rövid</h3><p>túl rövid</p><style>.x{}</style>"), []);
});

test("fúziós lecke: a kinyert kvíz/feladat/módszer darab egyezik a lecke bankjával", () => {
  const lesson = standardFusionFixture();
  const items = extractFusionLesson(lesson, "lesson:f1");
  const count = (k: string) => items.filter((i) => i.kind === k).length;
  const uniq = <T,>(xs: T[], key: (x: T) => string) => new Set(xs.map(key)).size;
  assert.equal(count("quiz"), uniq(lesson.experience!.quiz, (q) => q.question + q.options.join("|") + q.correctIndex));
  assert.equal(count("open_task"), uniq(lesson.experience!.tasks, (t) => t.q));
  assert.ok(count("method") > 0 && count("section") > 0);
  assert.ok(items.filter((i) => i.kind === "quiz").every((i) => typeof i.correctIndex === "number"));
});
