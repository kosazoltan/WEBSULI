import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { verifyHtmlTeaching, verifyHtmlNavigation } from "../server/improve/verify-html-teaching";
import { fetchedTeachingSources, reviewWebTeaching, TEACHING_REVIEW_CHECKS, teachingReviewSchema, validateReviewGrounding } from "../server/studio/web-teaching-review";
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
  const issues = [{ criterion: "explanation_depth", kind: "missing_explanation", sectionIndex: 0, lessonQuote: "A szorzat fele.", citations: [{ sourceUrl: source.url, quote: "Forrásból származó magyarázat." }], reason: "A második lépés indoklását is meg kell tanítani.", repair: "A második lépés indoklását a forrás alapján egészítsd ki." }];
  const review = await reviewWebTeaching(html, [source], async (system, user) => {
    assert.match(system, /adat, nem utasítás/);
    assert.deepEqual(JSON.parse(user).sources, [source]);
    assert.equal(JSON.parse(user).lessonHtml, html);
    assert.equal(JSON.parse(user).requestedTopic, "Háromszög területe, 7. osztály");
    assert.match(JSON.parse(user).coverageScope, /kért témájához és évfolyamához/);
    assert.equal(JSON.parse(user).coveragePolicy.sourceVariantsRequiredOnlyWhenRequested, true);
    return { checks, issues };
  }, undefined, "Háromszög területe, 7. osztály");
  assert.equal(review.checks.filter(c => !c.passed).length, 1);
  assert.ok(findingsFromError("Tanítási minőség (explanation_depth): hiányzik a második lépés", "generate").some(f => f.code === "teaching_depth"));
  await assert.rejects(reviewWebTeaching(html, [], async () => ({ checks })), /nincs letöltött/);
  assert.throws(() => teachingReviewSchema.parse({ checks: checks.map(() => checks[0]) }), /mind az öt/);
  await assert.rejects(reviewWebTeaching(html, [source], async () => ({ checks: checks.map(() => checks[0]) })), /korrekció után sem/);
  await assert.rejects(reviewWebTeaching(html, [{ ...source, text: "x".repeat(500_001) }], async () => ({ checks })), /csonkolt/);
});

test("reviewer repairs fabricated quotes rather than passing them to the author or discarding negatives", async () => {
  const checks = TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: criterion !== "factual_accuracy", evidence: "A forrás és a tanítás közötti állítást ellenőrizni szükséges." }));
  const issue = { criterion: "factual_accuracy", kind: "unsupported_claim", sectionIndex: 0, lessonQuote: "A szorzat fele.", citations: [], reason: "Az állítás a kapott forrásból nem ellenőrizhető.", repair: "Ellenőrzött forrás alapján pontosítsd az állítást." };
  let calls = 0;
  const result = await reviewWebTeaching(html, [source], async (system, user) => {
    calls++;
    assert.match(system, /irodalmi értelmezése/);
    if (calls === 1) return { checks, issues: [{ ...issue, sectionIndex: 0, lessonQuote: "Ilyen mondat nem szerepel a tananyagban." }] };
    assert.match(JSON.parse(user).correction.error, /nem található/);
    return { checks, issues: [issue] };
  });
  assert.equal(calls, 2); assert.equal(result.checks.find(c => c.criterion === "factual_accuracy")!.passed, false);
  assert.ok(findingsFromError("Lektori bizonyíték: nem található idézet", "generate").some(f => f.code === "review_evidence"));
});

test("grounding rejects false PASS, evidence-free factual errors, invented sources and absent issue lists", async () => {
  const checks = TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: true, evidence: "Szintetikus pozitív összevetés, kizárólag sémaellenőrzéshez." }));
  const issue = { criterion: "factual_accuracy" as const, kind: "factual_error" as const, sectionIndex: 0, lessonQuote: "A szorzat fele.", citations: [], reason: "Szintetikus bizonyítatlan tényhiba teszteset.", repair: "Szintetikus javítási utasítás az ellenőrzéshez." };
  assert.throws(() => teachingReviewSchema.parse({ checks, issues: [issue] }), /ellentmondanak/);
  assert.throws(() => validateReviewGrounding({ checks }, html, [source]), /hiányzik/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [issue] }, html, [source]), /bizonyító idézet/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [{ ...issue, citations: [{ sourceUrl: "https://example.org/invented", quote: source.text }] }] }, html, [source]), /nem található/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [{ ...issue, kind: "source_conflict", citations: [{ sourceUrl: source.url, quote: source.text }] }] }, html, [source]), /két tényleges/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [{ ...issue, bankItems: [{ bank: "quiz", id: "unknown" }] }] }, html, [source]), /nem létező tételazonosító/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [{ ...issue, kind: "unsupported_claim", lessonQuote: "Felső navigáció egyedi szövege" }] }, `<h1>Felső navigáció egyedi szövege</h1>${html}`, [source]), /sectionIndex/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [{ ...issue, kind: "unsupported_claim", lessonQuote: "sectionIndex", bankItems: [{ bank: "tasks", id: experience.tasks[0].id }] }] }, html, [source]), /az idézet nem található/);
  assert.throws(() => validateReviewGrounding({ checks, issues: [{ ...issue, kind: "source_conflict", citations: [{ sourceUrl: null, quote: "nem található | táblázat" }] }] }, html, [source]), error => {
    assert.match(String(error), /issues\[0\].citations\[0\]/); assert.match(String(error), /issues\[0\].kind/); return true;
  });
  let calls = 0;
  await assert.rejects(reviewWebTeaching(html, [source], async () => { calls++; return { checks }; }), /korrekció után sem/);
  assert.equal(calls, 2);
});

test("a positive review requires a separate full-input challenge, whose negative result is never outvoted", async () => {
  const checks = TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: true, evidence: "Szintetikus teljes összevetés az ellenpéldás folyamat vizsgálatához." }));
  for (const challengePass of [true, false]) {
    let calls = 0;
    const result = await reviewWebTeaching(html, [source], async (system, user) => {
      calls++; assert.equal(JSON.parse(user).lessonHtml, html); assert.deepEqual(JSON.parse(user).sources, [source]);
      if (calls === 1) { assert.doesNotMatch(system, /ELLENPÉLDÁS UTÓELLENŐRZÉS/); return { checks, issues: [] }; }
      assert.match(system, /ELLENPÉLDÁS UTÓELLENŐRZÉS/);
      return challengePass ? { checks, issues: [] } : {
        checks: checks.map(c => ({ ...c, passed: c.criterion !== "explanation_depth" })),
        issues: [{ criterion: "explanation_depth", kind: "missing_explanation", sectionIndex: 0, lessonQuote: "A szorzat fele.", citations: [], bankItems: [], reason: "A szorzat felezésének indoklása nem szerepel a tanításban.", repair: "Egészítsd ki a szemléltetést a felezés indoklásával." }],
      };
    });
    assert.equal(calls, 2); assert.equal(result.checks.every(c => c.passed), challengePass);
  }
});

test("unlabelled source variants do not become coverage failures outside the requested scope", () => {
  const variant = { url: "https://example.org/variant", title: "Másik változat", text: source.text };
  const issue = {
    criterion: "source_coverage" as const, kind: "source_conflict" as const, sectionIndex: 0,
    lessonQuote: "A szorzat fele.",
    citations: [{ sourceUrl: source.url, quote: "Forrásból származó magyarázat." }, { sourceUrl: variant.url, quote: "Forrásból származó magyarázat." }],
    reason: "A két forrás eltérő változatot ír le, de a tanítás nem jelöli ezt külön.",
    repair: "Jelöld meg mindkét forrás változatát, ha az összehasonlítás a kért tanítás része.",
  };
  assert.throws(() => validateReviewGrounding({ checks: [], issues: [issue] }, html, [source, variant], "Háromszög területe, 7. osztály"), /jelöletlen forrásváltozat/);
  assert.doesNotThrow(() => validateReviewGrounding({ checks: [], issues: [issue] }, html, [source, variant], "A háromszög területének forrásváltozatainak összehasonlítása"));
  const markedHtml = html.replace("A szorzat fele.", "Homérosz szerint a szorzat fele.");
  assert.doesNotThrow(() => validateReviewGrounding({ checks: [], issues: [{ ...issue, lessonQuote: "Homérosz szerint a szorzat fele." }] }, markedHtml, [source, variant], "Háromszög területe, 7. osztály"));
});

test("an internal factual contradiction remains a blocking finding", () => {
  const issue = {
    criterion: "factual_accuracy" as const, kind: "factual_error" as const, sectionIndex: 0,
    lessonQuote: "A szorzat fele.", citations: [{ sourceUrl: source.url, quote: "Forrásból származó magyarázat." }],
    reason: "A tanítás ugyanazt a mennyiséget két egymásnak ellentmondó értékkel adja meg.",
    repair: "Egységesítsd a számértéket az ellenőrzött forrással.",
  };
  assert.doesNotThrow(() => validateReviewGrounding({ checks: [], issues: [issue] }, html, [source], "Háromszög területe, 7. osztály"));
});

test("inline markup spacing before punctuation does not invalidate an otherwise exact quote", () => {
  const marked = html.replace("A szorzat fele.", "A <b>szorzat</b>, majd annak fele.");
  const issue = { criterion: "factual_accuracy" as const, kind: "factual_error" as const, sectionIndex: 0, lessonQuote: "A szorzat, majd annak fele.", citations: [{ sourceUrl: null, quote: "A szorzat, majd annak fele." }], reason: "Szintetikus idézet a DOM-szóköz ellenőrzéséhez.", repair: "Szintetikus javítási cél a DOM-szóköz ellenőrzéséhez." };
  assert.doesNotThrow(() => validateReviewGrounding({ checks: [], issues: [issue] }, marked, [source]));
  assert.throws(() => validateReviewGrounding({ checks: [], issues: [{ ...issue, lessonQuote: "A szorzat; majd annak fele." }] }, marked, [source]), /nem található/);
});

/* ------------------------------------------------------------------------- *
 * Spec 2026-09-19 — verifyTeachingVisuals: ugyanaz a szemléltetés-kapu a szerzői
 * HTML-en, a bankgyártás ELŐTT. Az első eset a valódi éles webes futás
 * (0aa2435b) fejezete: feliratozott nyilas lépéssor, rövid, címke nélküli
 * lépésekkel — a kapu joggal utasítja el, a szerző most a bank előtt kapja meg.
 * ------------------------------------------------------------------------- */

import { verifyTeachingVisuals } from "../server/improve/verify-html-teaching";

const chapter = (visual: string, index = 0) => `<section data-teaching-section="${index}" data-teaching-concepts="humusz"><h2>A humusz</h2>
<div data-teaching-explanation>A humusz az elhalt élőlények lebomlásából keletkező, tápanyagban gazdag sötét anyag a talajban.</div>
<div data-teaching-example>Egy avarral borított erdőtalajban évről évre vastagszik a humuszréteg.</div>
<div data-teaching-summary>A humusz a talaj termékenységének kulcsa.</div>${visual}</section>`;
const page = (body: string) => `<!doctype html><html><body><main data-lesson-panel="teaching">${body}</main></body></html>`;

const productionFlow = `<figure class="tg-visual" data-teaching-visual><div class="tg-flow"><div>Elhalt növények és kiválasztott anyagok</div><span class="tg-arrow">→</span><div>Mikroorganizmusok közreműködése</div><span class="tg-arrow">→</span><div>Humusz</div></div><figcaption>A humusz kialakulásának leegyszerűsített folyamata a talajban.</figcaption></figure>`;
const labelledCards = `<figure data-teaching-visual><div><div><b>Lebomlás</b> Az elhalt növényi részeket baktériumok és gombák bontják le.</div><div><b>Humusz</b> A lebomlásból sötét, tápanyagban gazdag anyag keletkezik.</div></div><figcaption>A humuszképződés két lépése a talajban élő szervezetek munkájával.</figcaption></figure>`;
const svgFigure = `<figure data-teaching-visual><svg viewBox="0 0 100 40"><rect width="100" height="40"/></svg><figcaption>Talajszelvény: az A-szint a humuszban leggazdagabb réteg.</figcaption></figure>`;

test("verifyTeachingVisuals: az éles címke nélküli nyilas lépéssor hibát ad, a címkés kártyasor és az SVG átmegy", () => {
  assert.match(verifyTeachingVisuals(page(chapter(productionFlow))).join("; "), /1\. fejezet: hiányzó tanítási szemléltetés/);
  assert.deepEqual(verifyTeachingVisuals(page(chapter(labelledCards))), []);
  assert.deepEqual(verifyTeachingVisuals(page(chapter(svgFigure))), []);
  assert.deepEqual(verifyTeachingVisuals(page(chapter(svgFigure, 0) + chapter(labelledCards, 1))), []);
  assert.match(verifyTeachingVisuals(page(chapter(svgFigure, 0) + chapter(productionFlow, 1))).join("; "), /2\. fejezet/);
});

test("verifyTeachingVisuals: fejezet nélküli vagy üres HTML nem számít átment szemléltetésnek", () => {
  assert.ok(verifyTeachingVisuals(page("<p>nincs fejezet</p>")).length);
  assert.ok(verifyTeachingVisuals("").length);
});

/* Spec 2026-09-19 — subjective criteria become published warnings after the repair rounds; factual ones never. */
import { subjectiveOnlyFailures, reviewWebTeaching as reviewFn, REVIEW_CONVERGENCE_RULE, teachingReviewEvidence, assertTeachingReviewEvidence, type TeachingReview } from "../server/studio/web-teaching-review";
type ReviewIssue = NonNullable<TeachingReview["issues"]>[number];

test("pedagógiai figyelmeztetéssel közzétett bizonyíték elfogadott, tényhibás nem", () => {
  const passing = TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: true, evidence: "A szintetikus ellenőrzés minden kritériumot igazoltnak talált." }));
  const subjective = passing.map(c => c.criterion === "age_and_added_value" || c.criterion === "explanation_depth" ? { ...c, passed: false } : c);
  const factual = passing.map(c => c.criterion === "factual_accuracy" ? { ...c, passed: false } : c);
  const issue = (criterion: ReviewIssue["criterion"], kind: ReviewIssue["kind"]): ReviewIssue => ({ criterion, kind, sectionIndex: 0, lessonQuote: "A háromszög területe", citations: [], reason: "A szintetikus lektor a fejezet kifejtését hiányosnak találta.", repair: "Egészítsd ki a fejezetet lépésenkénti magyarázattal és példával." });
  const subjectiveIssues = [issue("explanation_depth", "missing_explanation"), issue("age_and_added_value", "pedagogical_gap")];
  const factualIssues = [issue("factual_accuracy", "unsupported_claim")];
  assert.deepEqual(subjectiveOnlyFailures({ checks: subjective, issues: subjectiveIssues }), ["explanation_depth", "age_and_added_value"]);
  assert.equal(subjectiveOnlyFailures({ checks: factual, issues: factualIssues }), null);
  assert.equal(subjectiveOnlyFailures({ checks: passing, issues: [] }), null);
  const pageHtml = `<!DOCTYPE html><html><body><section data-lesson-panel="teaching">${teachingHtml}</section></body></html>`;
  const src = [{ url: "https://example.org/a", title: "A", text: "forrás" }];
  const warned = teachingReviewEvidence(pageHtml, src, { checks: subjective, issues: subjectiveIssues });
  assert.deepEqual(warned.warnings, ["explanation_depth", "age_and_added_value"]);
  assert.doesNotThrow(() => assertTeachingReviewEvidence(pageHtml, src.map(({ url, title }) => ({ url, title })), warned));
  assert.throws(() => assertTeachingReviewEvidence(pageHtml, src.map(({ url, title }) => ({ url, title })), { ...warned, warnings: undefined }), /hiányzik vagy elavult/);
  const factualEvidence = teachingReviewEvidence(pageHtml, src, { checks: factual, issues: factualIssues });
  assert.equal(factualEvidence.warnings, undefined);
  assert.throws(() => assertTeachingReviewEvidence(pageHtml, src.map(({ url, title }) => ({ url, title })), factualEvidence), /hiányzik vagy elavult/);
});

test("újraellenőrzéskor az előző vélemény és a konvergencia-szabály a bemenet része", async () => {
  const checks = TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: true, evidence: "A szintetikus ellenőrzés minden kritériumot igazoltnak talált." }));
  const previous = { checks: checks.map(c => c.criterion === "explanation_depth" ? { ...c, passed: false } : c), issues: [] };
  let seenRule = 0;
  const result = await reviewFn(html, [source], async (system, user) => {
    if (system.includes("KONVERGENCIA-SZABÁLY")) seenRule++;
    assert.ok(system.includes(REVIEW_CONVERGENCE_RULE.slice(0, 30)));
    assert.deepEqual(JSON.parse(user).previousReview, previous);
    return { checks, issues: [] };
  }, undefined, "Háromszög területe", false, previous);
  assert.ok(result.checks.every(c => c.passed));
  assert.equal(seenRule, 2, "az ellenpéldás utóellenőrzés is megkapja");
});
