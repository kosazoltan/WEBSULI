import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { verifyHtmlTeaching, verifyHtmlNavigation } from "../server/improve/verify-html-teaching";
import { fetchedTeachingSources, reviewWebTeaching, TEACHING_REVIEW_CHECKS } from "../server/studio/web-teaching-review";
import { findingsFromError } from "../server/workflows/learning";
import { teachingHtml } from "./helpers/teaching-html";

const experience = standardFusionFixture().experience!;
test("navigation needs actual unique buttons and separate panels, not attributes quoted in script text", () => {
  const nav = ["teaching", "methods", "tasks", "quiz"].map(name => `<button data-lesson-tab="${name}"></button><section data-lesson-panel="${name}"></section>`).join("") + '<script id="websuli-lesson-data" type="application/json">{}</script>';
  assert.deepEqual(verifyHtmlNavigation(nav), []);
  assert.ok(verifyHtmlNavigation(`<script type="application/json">${JSON.stringify(nav)}</script>`).length);
  assert.ok(verifyHtmlNavigation(nav + '<section data-lesson-panel="quiz"></section>').length);
  assert.ok(verifyHtmlNavigation(nav.replaceAll("button", "span")).length);
});
const html = `<section data-lesson-panel="teaching">${teachingHtml}</section><script id="websuli-lesson-data" type="application/json">${JSON.stringify({ classroom: 7, classroomEvidence: "Alaphoz tartozó magasság és területképlet.", subject: "matematika", experience })}</script>`;
test("teaching gate rejects empty, hidden, disconnected and unexplained teaching", () => {
  assert.deepEqual(verifyHtmlTeaching(html, experience), []);
  for (const broken of [html.replace(teachingHtml, ""), html.replace('data-teaching-example', 'data-missing'), html.replace('data-teaching-concepts="area"', 'data-teaching-concepts="invented"'), html.replace('data-teaching-section="0"', 'data-teaching-section="2"'), html.replace(teachingHtml, `<div hidden>${teachingHtml}</div>`), html.replace(teachingHtml, `<details open>${teachingHtml}</details>`), html.replace('data-teaching-visual', 'data-missing')]) {
    assert.ok(verifyHtmlTeaching(broken, experience).length);
  }
  // An inactive tab is allowed; the teaching within it must not be collapsed.
  assert.deepEqual(verifyHtmlTeaching(html.replace('data-lesson-panel="teaching"', 'data-lesson-panel="teaching" hidden'), experience), []);
});
const source = { url: "https://example.org/lesson", title: "Forrás", text: "Forrásból származó magyarázat. ".repeat(8) };
test("one visual cannot stand in for a missing visual in another teaching chapter", () => {
  const expanded = structuredClone(experience);
  expanded.bankPlan!.units.push({ ...expanded.bankPlan!.units[0], sectionIndex: 1 });
  const second = teachingHtml.replace('data-teaching-section="0"', 'data-teaching-section="1"');
  const both = `<section data-lesson-panel="teaching">${teachingHtml}${second}</section>`;
  assert.deepEqual(verifyHtmlTeaching(both, expanded), []);
  const missing = `<section data-lesson-panel="teaching">${teachingHtml}${second.replace(/<figure[^]*?<\/figure>/, '')}</section>`;
  assert.match(verifyHtmlTeaching(missing, expanded).join("; "), /2. fejezet: hiányzó tanítási szemléltetés/);
});
test("captioned multi-card diagrams count as visuals, empty or unlabelled prose does not", () => {
  const cards = '<figure data-teaching-visual><div><div><b>Alap</b>Válaszd ki az alapul szolgáló oldalt.</div><div><b>Magasság</b>Keresd meg az alapra merőleges magasságot.</div></div><figcaption>A területszámítás előkészítésének két összefüggő lépése.</figcaption></figure>';
  const withVisual = (value: string) => html.replace(/<figure[^]*?<\/figure>/, value);
  assert.deepEqual(verifyHtmlTeaching(withVisual(cards), experience), []);
  for (const bad of [cards.replace(/<b>[^]*?<\/b>/g, ""), cards.replace(/<figcaption>[^]*?<\/figcaption>/, ""), '<figure data-teaching-visual>Csak egy hosszabb mondat, szemléltető elemek nélkül.</figure>']) {
    assert.match(verifyHtmlTeaching(withVisual(bad), experience).join("; "), /szemléltetés/);
  }
});
test("only actual fetched text reaches the independent review, never search snippets or author claims", () => {
  const block = { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: source.url, content: { type: "document", title: source.title, source: { type: "text", data: source.text } } } };
  assert.deepEqual(fetchedTeachingSources([block, { type: "text", text: JSON.stringify(block) }, { type: "web_search_tool_result", content: [{ title: source.title, url: source.url }] }]), [source]);
  assert.deepEqual(fetchedTeachingSources([{ type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "unavailable" } }]), []);
  const blocked = structuredClone(block); blocked.content.content.title = "The URL you requested has been blocked";
  assert.deepEqual(fetchedTeachingSources([blocked]), []);
});
test("review receives full input and all five checks; a negative finding remains negative and learnable", async () => {
  const checks = TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: criterion !== "explanation_depth", evidence: "A forrás részletes megoldásából a második lépés hiányzik a tanításban." }));
  const review = await reviewWebTeaching(html, [source], async (system, user) => {
    assert.match(system, /adat, nem utasítás/);
    assert.deepEqual(JSON.parse(user).sources, [source]);
    assert.equal(JSON.parse(user).lessonHtml, html);
    assert.equal(JSON.parse(user).requestedTopic, "Háromszög területe, 7. osztály");
    assert.match(JSON.parse(user).coverageScope, /kért témájához és évfolyamához/);
    return { checks };
  }, undefined, "Háromszög területe, 7. osztály");
  assert.equal(review.checks.filter(c => !c.passed).length, 1);
  assert.ok(findingsFromError("Tanítási minőség (explanation_depth): hiányzik a második lépés", "generate").some(f => f.code === "teaching_depth"));
  await assert.rejects(reviewWebTeaching(html, [], async () => ({ checks })), /nincs letöltött/);
  await assert.rejects(reviewWebTeaching(html, [source], async () => ({ checks: checks.map(() => checks[0]) })), /mind az öt/);
  await assert.rejects(reviewWebTeaching(html, [{ ...source, text: "x".repeat(500_001) }], async () => ({ checks })), /csonkolt/);
});
