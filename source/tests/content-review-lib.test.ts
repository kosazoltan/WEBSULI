import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHtmlPatches, applyLessonPatches, brokenScripts, chunkText, contextOf, costUsd, fromReviewLine, lessonParentContext, lessonTextFields, parseJsonReply, stripForReview, toReviewLine, validateFinding, type Finding } from "../scripts/content-review/lib";

// docs/specs/2026-10-18-tartalmi-lektoralas.md
const f = (quote: string, replacement: string, extra: Partial<Finding> = {}): Finding => ({ quote, replacement, category: "spelling", reason: "r", ...extra });

test("stripForReview: a stílus, az SVG és a data: URI kimarad, a szöveg betűhű", () => {
  const html = `<style>.a{color:red}</style><p>A fotoszintézis "fény" kell.</p><svg viewBox="0 0 1 1"><text>x</text></svg><img src="data:image/png;base64,AAAA">`;
  const s = stripForReview(html);
  assert.ok(!s.includes("color:red") && !s.includes("viewBox") && !s.includes("base64"));
  assert.ok(html.includes(`<p>A fotoszintézis "fény" kell.</p>`) && s.includes(`<p>A fotoszintézis "fény" kell.</p>`));
});

test("chunkText: sorhatáron vág, a darabok összefűzve az eredetit adják", () => {
  const text = Array.from({ length: 50 }, (_, i) => `sor ${i} ${"x".repeat(20)}`).join("\n");
  const chunks = chunkText(text, 200);
  assert.ok(chunks.length > 1 && chunks.every(c => c.length <= 200));
  assert.equal(chunks.join(""), text);
});

test("lessonTextFields: szöveges levelek útvonallal; a technikai kulcsok és a válaszillesztő szinonimák kimaradnak", () => {
  const json = { id: "x", title: "A sejt felépítése", sections: [{ blocks: [{ kind: "text", text: "A sejtmembrán határolja a sejtet." }] }],
    experience: { tasks: [{ q: "Mi határolja a sejtet?", required: [["sejtmembran", "membrán"]], sample: "A sejtmembrán határolja." }] } };
  const fields = lessonTextFields(json);
  assert.deepEqual(fields.map(x => x.id), ["title", "sections.0.blocks.0.text", "experience.tasks.0.q", "experience.tasks.0.sample"]);
});

test("validateFinding: egyszeri pontos előfordulás, valódi és arányos változás, tartalmi kategória", () => {
  const t = "A Föld a Nap körül kering. A Hold a Föld körül.";
  assert.equal(validateFinding(f("Nap körül kering", "Nap körül kering"), t, "lesson").ok, false);
  assert.equal(validateFinding(f("Mars körül", "Nap körül"), t, "lesson").reason, "az idézet nem található");
  assert.equal(validateFinding(f("Föld", "Földet"), t, "lesson").reason, "az idézet többször szerepel");
  assert.equal(validateFinding(f("A Hold a Föld körül.", "A."), t, "lesson").reason, "aránytalan hosszváltozás");
  assert.equal(validateFinding(f("A Hold a Föld körül.", "A Hold a Föld körül kering."), t, "lesson").ok, true);
  assert.equal(validateFinding(f("A Hold a Föld körül.", "A Hold a Föld körül kering.", { category: "style" as never }), t, "lesson").ok, false);
});

test("validateFinding HTML-ben: nem vezethet be idézőjelet vagy csúcsos zárójelet; a szkriptbeli puszta ékezetcsere nem hiba", () => {
  const html = `<p>A viz forrpontja 100 fok.</p><script>var T=[{required:[["viz forr"]]}];</script>`;
  assert.equal(validateFinding(f("A viz forrpontja", "A víz forrpontja"), html, "html").ok, true);
  assert.equal(validateFinding(f("forrpontja 100", "forrpontja \"100"), html, "html").reason, "a szerkezet (idézőjel, escape, tag) változna");
  assert.equal(validateFinding(f("100 fok.", "<b>100</b> fok."), html, "html").ok, false);
  assert.equal(validateFinding(f("[\"viz forr\"]", "[\"víz forr\"]"), html, "html").reason, "csak ékezet a szkriptben");
});

test("applyHtmlPatches: hátulról cserél, az átfedő második elvetődik", () => {
  const html = "<p>Egy ketto harom negy</p>";
  const r = applyHtmlPatches(html, [f("ketto", "kettő"), f("negy", "négy"), f("ketto harom", "kettő három")]);
  assert.equal(r.applied.length, 2);
  assert.equal(r.dropped.length, 1);
  assert.ok(r.html === "<p>Egy kettő harom négy</p>" || r.html === "<p>Egy kettő három négy</p>");
});

test("applyLessonPatches: útvonal szerinti cserét végez mély másolaton; hiányzó útvonal elvetve", () => {
  const json = { sections: [{ blocks: [{ text: "A Duna Európa második leghoszabb folyója." }] }] };
  const r = applyLessonPatches(json, [f("leghoszabb", "leghosszabb", { field: "sections.0.blocks.0.text" }), f("x y", "x z", { field: "sections.1.text" })]);
  assert.equal(r.json.sections[0].blocks[0].text, "A Duna Európa második leghosszabb folyója.");
  assert.equal(json.sections[0].blocks[0].text, "A Duna Európa második leghoszabb folyója.");
  assert.equal(r.applied.length, 1);
  assert.equal(r.dropped.length, 1);
});

test("costUsd: Haiku 5.5 sávos ár, Opus 5.5, ismeretlen modell hiba", () => {
  assert.equal(costUsd("claude-haiku-5-5", { input_tokens: 100_000, output_tokens: 0 }), 0.01);
  assert.equal(costUsd("claude-haiku-5-5", { input_tokens: 0, output_tokens: 100_000 }), 0.05);
  assert.equal(costUsd("claude-haiku-5-5", { input_tokens: 200_000, output_tokens: 0 }), 0.1);
  assert.equal(costUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 24);
  assert.throws(() => costUsd("gpt-x", { input_tokens: 1, output_tokens: 1 }));
});

test("parseJsonReply és contextOf", () => {
  assert.deepEqual(parseJsonReply<{ a: number }>("Íme:\n```json\n{\"a\":1}\n```"), { a: 1 });
  assert.deepEqual(parseJsonReply<{ a: number }>("{\"a\":2}"), { a: 2 });
  assert.equal(contextOf("abcXYZdef", "XYZ", 2), "bc⟦XYZ⟧de");
});

// Review #299 (Copilot): a karakterfajta jelenléte nem véd — a meglévő idézőjel mellé újabb kerülhet, vagy egy escape eltűnhet.
test("review #299: szerkezetváltoztató HTML/JS-csere elutasítva (idézőjel, escape, tag), a szöveges csere átmegy", () => {
  const html = `<script>var Q={"q":"A víz forráspontja 90 Celsius-fok.","s":"Azt mondta: \\"jó\\" válasz"};</script><p>Ez nevezik <b>fog</b> részének.</p>`;
  assert.equal(validateFinding(f("A víz forráspontja 90 Celsius-fok.", "A víz forráspontja \"100\" Celsius-fok."), html, "html").ok, false);
  assert.equal(validateFinding(f("Azt mondta: \\\"jó\\\" válasz", "Azt mondta: \"jó\" válasz"), html, "html").ok, false);
  assert.equal(validateFinding(f("<p>Ez nevezik <b>fog</b>", "<p>Ezt nevezik <i>fog</i>"), html, "html").ok, false);
  assert.equal(validateFinding(f("<p>Ez nevezik <b>fog</b>", "<p>Ezt nevezik <b>fog</b>"), html, "html").ok, true);
  assert.equal(validateFinding(f("forráspontja 90 Celsius-fok.", "forráspontja 100 Celsius-fok."), html, "html").ok, true);
});

test("review #299: a fordulni nem tudó szkriptblokk kimutatható (csak fordítás, futtatás nélkül)", async () => {
  const before = `<p>x</p><script>var a = "egy";</script><script type="application/json">{"a":1}</script>`;
  assert.deepEqual(await brokenScripts(before, before.replace('"egy"', '"egy" "ketto"')), [0]);
  assert.deepEqual(await brokenScripts(before, before.replace('{"a":1}', '{"a":1')), [1]);
  assert.deepEqual(await brokenScripts(before, before.replace("egy", "kettő")), []);
});

test("review #299: lecke — rövid mezők, sortörés-jel oda-vissza, helyes-index csere tartományellenőrzéssel, teljes szülőtétel", () => {
  const json = { title: "Fotoszintezis", sections: [{ blocks: [{ text: "A Duna Európa\nmásodik leghoszabb folyója." }] }],
    experience: { quiz: [{ question: "Mennyi 2 + 2?", options: ["3", "4", "5"], correctIndex: 0, feedbackPerOption: ["Nem.", "Igen.", "Nem."] }] } };
  const fields = lessonTextFields(json);
  assert.ok(fields.some(x => x.id === "title" && x.text === "Fotoszintezis"));
  assert.ok(fields.some(x => x.id === "experience.quiz.0.correctIndex" && x.text === "0"));
  assert.ok(fields.some(x => x.id === "experience.quiz.0.options.1" && x.text === "4"));
  const line = toReviewLine("A Duna Európa\nmásodik leghoszabb folyója.");
  assert.ok(!line.includes("\n"));
  const quote = fromReviewLine(line.slice(0, line.indexOf("leghoszabb")) + "leghoszabb");
  const r = applyLessonPatches(json, [f(quote, quote.replace("leghoszabb", "leghosszabb"), { field: "sections.0.blocks.0.text" }),
    f("0", "1", { field: "experience.quiz.0.correctIndex", category: "answer-key" })]);
  assert.equal(r.json.sections[0].blocks[0].text, "A Duna Európa\nmásodik leghosszabb folyója.");
  assert.equal(r.json.experience.quiz[0].correctIndex, 1);
  assert.equal(validateFinding(f("0", "1", { field: "experience.quiz.0.correctIndex" }), "0", "lesson").ok, true);
  assert.equal(validateFinding(f("0", "x", { field: "experience.quiz.0.correctIndex" }), "0", "lesson").ok, false);
  assert.equal(applyLessonPatches(json, [f("0", "7", { field: "experience.quiz.0.correctIndex" })]).dropped.length, 1);
  assert.match(lessonParentContext(json, "experience.quiz.0.options.1"), /"question":"Mennyi 2 \+ 2\?".*"correctIndex":0/);
});
