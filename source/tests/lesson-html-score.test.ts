import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { LESSON_HTML_SPEC_V74 } from "../server/ai/lesson-html-spec";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";

test("the HTML author receives a working scorer with the same Hungarian, numeric and negation behavior", () => {
  // Evaluate only the checked-in reference functions, never learner or AI input.
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const end = LESSON_HTML_SPEC_V74.indexOf("```", begin);
  assert.ok(begin >= 0 && end > begin);
  const context: Record<string, unknown> = {};
  runInNewContext(LESSON_HTML_SPEC_V74.slice(begin, end), context, { timeout: 1000 });
  const score = context.ee_evaluate as typeof evaluateOpenAnswer;
  const original = compactFusionFixture().experience!.tasks[1];
  const cases = [
    { ...original, required: [["4.5"]], minWords: 1, needsSentence: false, sample: "4,5 cm²", answers: ["", "4,5 cm²", "4.5", "−4,5", "45", "4 5", "-4.5"] },
    { ...original, required: [["magasság"], ["merőleges"]], minWords: 2, needsSentence: true, sample: "A magasság merőleges az alapra, mert így mérjük a távolságot.", answers: ["magasság merőleges", "A magasság meröleges az alapra, mert így mérjük a távolságot.", "A magasság nem merőleges az alapra.", "kék bicikli"] },
    { ...original, required: [["alap"], ["egységesít"]], minWords: 2, needsSentence: true, sample: "Az alaphoz egységesítjük a mértékegységet, mert így számolhatunk.", answers: ["kalap egységesít", "Az alaphoz egységesítjük a mértékegységet, mert így számolhatunk."] },
  ];
  for (const task of cases) for (const answer of [...task.answers, task.sample.normalize("NFD")]) {
    const actual = score(answer, task), expected = evaluateOpenAnswer(answer, task);
    assert.equal(actual.score, expected.score, answer);
    assert.equal(actual.state, expected.state, answer);
  }
});

test("spec 2026-11-03-pontozo-szoalak: a HTML-pontozó a szóalak-tűrésben és a magyar tagadásőrben is azonos a közös pontozóval", () => {
  const begin = LESSON_HTML_SPEC_V74.indexOf("function ee_norm(s)");
  const end = LESSON_HTML_SPEC_V74.indexOf("```", begin);
  const context: Record<string, unknown> = {};
  runInNewContext(LESSON_HTML_SPEC_V74.slice(begin, end), context, { timeout: 1000 });
  const score = context.ee_evaluate as typeof evaluateOpenAnswer;
  const original = compactFusionFixture().experience!.tasks[1];
  const cases = [
    { required: [["makacs"]], sample: "makacs", answers: ["makacsságában", "makacskodjon", "boldogtalan"] },
    { required: [["lelkiismeret"]], sample: "lelkiismeret", answers: ["lelkiismeretével", "lelkiismeretlen"] },
    { required: [["barlangba"]], sample: "barlangba", answers: ["sziklabarlangba", "barlang"] },
    { required: [["lapos"]], sample: "lapos", answers: ["alapos", "laposabb"] },
    { required: [["megkövezés"], ["kötél"]], sample: "megkövezés kötél", answers: ["megkövezéssel és kötéllel", "kötéltelen"] },
    { required: [["Polüneikészt"], ["eltemetni"]], sample: "Polüneikészt tilos eltemetni.", answers: ["Polüneikészt nem szabad eltemetni."] },
    { required: [["Antigoné"], ["eltemeti"]], sample: "Antigoné eltemeti a testvérét.", answers: ["Antigoné nem eltemeti a testvérét."] },
  ];
  for (const c of cases) for (const answer of c.answers) {
    const t = { ...original, required: c.required, minWords: 1, needsSentence: false, sample: c.sample };
    const actual = score(answer, t), expected = evaluateOpenAnswer(answer, t);
    assert.equal(actual.score, expected.score, answer);
    assert.equal(actual.state, expected.state, answer);
  }
});
