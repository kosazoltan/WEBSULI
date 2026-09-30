import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOpenAnswer, evaluateOpenAnswerV1, isTypedTask, normalizeAnswerV2, OPEN_ANSWER_RULES_HU, STEM_SUFFIXES } from "../shared/lesson-experience-score";
import { gradeTypedAnswers, referenceValueProblems, scoringGate, isSimplifiedFraction, normalizeExpressionText, LESSON_SCORING_VERSION } from "../shared/answer-value";
import { experienceSchema, type OpenTask } from "../shared/lesson-experience";
import { arithmeticClaimProblems } from "../server/studio/tools/arithmetic-claims";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U1, C13, H31): típusos válaszmodell; a v1 pontozó változatlan. */

const base = (over: Partial<OpenTask>): OpenTask => ({
  ...standardFusionFixture().experience!.tasks[0],
  required: [["eredmény", "eredménye"]], bonus: [], minWords: 1, needsSentence: false, sample: "Az eredmény 1/2.",
  ...over,
});

test("H31: a típusos feladatnál az érték dönt — 2/1 ≠ 1/2; a v1 (régi) pontozó ugyanerre 1 pontot adott", () => {
  const task = base({ typedAnswers: [{ part: "a", kind: "fraction", value: "1/2" }] });
  assert.equal(isTypedTask(task), true);
  assert.equal(evaluateOpenAnswer("Az eredmény 1/2.", task).score, 1);
  assert.equal(evaluateOpenAnswer("Az eredmény 2/1.", task).score, 0);
  assert.equal(evaluateOpenAnswerV1("Az eredmény 2/1.", { ...task, typedAnswers: undefined }).score, 1, "a mért régi hiba: a kulcsszó-pontozó a 2/1-et is elfogadta");
  assert.equal(evaluateOpenAnswer("Az eredmény 0,5.", task).score, 1, "form nélkül az értékazonos alak jó");
  const simplified = base({ typedAnswers: [{ part: "a", kind: "fraction", value: "1/2", form: "simplified-fraction" }] });
  assert.equal(evaluateOpenAnswer("Az eredmény 0,5.", simplified).score, 0);
  assert.equal(evaluateOpenAnswer("Az eredmény 2/4.", simplified).score, 0);
  assert.equal(evaluateOpenAnswer("Az eredmény 1/2.", simplified).score, 1);
  assert.equal(isSimplifiedFraction("3/6"), false); assert.equal(isSimplifiedFraction("−3/4"), true); assert.equal(isSimplifiedFraction("4/1"), false);
});

test("részfeladatok sorrendben: a felcserélt részeredmény nem teljes pont; indoklás közbeeső számai megengedettek", () => {
  const task = base({ sample: "Az eredmények: 17/12, 7/12, 6, 2.", typedAnswers: [
    { part: "a", kind: "fraction", value: "17/12" }, { part: "b", kind: "fraction", value: "7/12" }, { part: "c", kind: "number", value: "6" }, { part: "d", kind: "number", value: "2" },
  ] });
  assert.equal(evaluateOpenAnswer("Az eredmények: 17/12, 7/12, 6, 2.", task).score, 1);
  assert.equal(evaluateOpenAnswer("Az eredmény: a 3 és a 4 közös nevezője 12, ezért 17/12; aztán 7/12; 6; 2.", task).score, 1);
  const swapped = evaluateOpenAnswer("Az eredmények: 7/12, 17/12, 6, 2.", task);
  assert.equal(swapped.score, 0.5); assert.match(swapped.reason, /b rész/);
  assert.equal(evaluateOpenAnswer("Az eredmény semmi.", task).score, 0);
  const grade = gradeTypedAnswers("7/12, 17/12, 6, 2", task.typedAnswers!);
  assert.deepEqual(grade.verdicts.map((v) => v.ok), [true, false, true, true]);
});

test("mértékegység és köztes műveleti állapot (H53): az értékazonos, de nem a kért alak hibás", () => {
  const unit = base({ sample: "Az eredmény 5 °C.", typedAnswers: [{ part: "1", kind: "number", value: "5", unit: "°C" }] });
  assert.equal(evaluateOpenAnswer("Az eredmény 5.", unit).score, 0);
  assert.equal(evaluateOpenAnswer("Az eredmény 5 °C.", unit).score, 1);
  assert.equal(evaluateOpenAnswer("Az eredmény 5°C", unit).score, 1);
  const step = base({ sample: "Az első menet eredménye: 35 + 64 − 12.", typedAnswers: [{ part: "menet", kind: "expression", value: "35 + 64 − 12", form: "intermediate-step" }] });
  assert.equal(evaluateOpenAnswer("Az eredmény 35+64-12", step).score, 1, "szóköz és jel-szinonima nem különbség");
  assert.equal(evaluateOpenAnswer("Az eredmény 35 + 8 · 8 − 12", step).score, 0, "értékazonos, de nem a kért állapot");
  assert.equal(evaluateOpenAnswer("Az eredmény 87", step).score, 0);
  assert.equal(normalizeExpressionText("35 × 2 ÷ 7"), "35·2:7");
});

test("requiredDistinct: kategóriánként különböző elemek; két szinonima egy elem (Astra ellenpélda: „alma körte”)", () => {
  const task = base({ required: [["növény", "növények"]], sample: "Fás szárú növények: szilvafa, szőlő; lágy szárúak: tulipán, búza.", requiredDistinct: [
    { category: "fás szárú", from: [["szilvafa", "szilva"], ["szőlő"], ["almafa"]], count: 2 },
    { category: "lágy szárú", from: [["tulipán"], ["búza"], ["paradicsom"]], count: 2 },
  ] });
  assert.equal(evaluateOpenAnswer("szilvafa szőlő tulipán búza növény", task).score, 1);
  const repeated = evaluateOpenAnswer("szilvafa szilvafa tulipán búza növény", task);
  assert.equal(repeated.score, 0.5); assert.match(repeated.reason, /fás szárú/);
  assert.equal(evaluateOpenAnswer("szilvafa szilva tulipán búza növény", task).score, 0.5, "szinonima nem második példa");
  assert.equal(evaluateOpenAnswer("tulipán búza növény", task).score, 0, "egy kategória üres");
  const pair = base({ required: [["gyümölcs"]], sample: "Két gyümölcs: alma, körte.", requiredDistinct: [{ category: "gyümölcs", from: [["alma"], ["körte"], ["szilva"]], count: 2 }] });
  assert.equal(evaluateOpenAnswer("alma gyümölcs", pair).score, 0.5);
  assert.equal(evaluateOpenAnswer("alma körte gyümölcs", pair).score, 1);
});

test("régi lecke (típusos mező nélkül) bájtra a v1 pontozót kapja; a v2 normalizálás megtartja a műveleti jelet", () => {
  const tasks = standardFusionFixture().experience!.tasks;
  for (const t of tasks) {
    assert.equal(isTypedTask(t), false);
    for (const answer of ["", t.sample, "kék bicikli", t.required.map((g) => g[0]).join(" "), `${t.sample} nem`, "40 − 18 + 4 = 26"]) {
      assert.deepEqual(evaluateOpenAnswer(answer, t), evaluateOpenAnswerV1(answer, t), `${t.id}: ${answer}`);
    }
  }
  assert.notEqual(normalizeAnswerV2("8 : 2"), normalizeAnswerV2("8 · 2"));
  assert.notEqual(normalizeAnswerV2("1/2"), normalizeAnswerV2("2/1"));
  assert.equal(normalizeAnswerV2("8 × 2"), normalizeAnswerV2("8 · 2"));
});

test("séma: típusos feladathoz scoringVersion=2 kell, és a referenciaérték értelmezhető", () => {
  const e = standardFusionFixture().experience!;
  const typed = { ...e, tasks: e.tasks.map((t, i) => i === 0 ? { ...t, typedAnswers: [{ part: "a", kind: "number" as const, value: "26" }] } : t) };
  const missing = experienceSchema.safeParse(typed);
  assert.equal(missing.success, false);
  assert.match(JSON.stringify(missing.success ? [] : missing.error.issues), /scoringVersion=2/);
  assert.equal(experienceSchema.safeParse({ ...typed, scoringVersion: LESSON_SCORING_VERSION }).success, true);
  const bad = { ...typed, scoringVersion: 2, tasks: typed.tasks.map((t, i) => i === 0 ? { ...t, typedAnswers: [{ part: "a", kind: "number" as const, value: "huszonhat" }] } : t) };
  const parsed = experienceSchema.safeParse(bad);
  assert.equal(parsed.success, false);
  assert.match(JSON.stringify(parsed.success ? [] : parsed.error.issues), /nem értelmezhető/);
  assert.equal(experienceSchema.safeParse(e).success, true, "régi bank változatlanul érvényes");
});

test("a referencia igazságát a program újraszámolja a kérdés kifejezéséből (a típusos mező nem javítja a hibás számítást)", () => {
  const wrong = { id: "t6-gyak-2", q: "Számold ki: 40 − 18 + 4", typedAnswers: [{ part: "a", kind: "number" as const, value: "22" }] };
  assert.equal(referenceValueProblems(wrong).length, 1);
  assert.match(referenceValueProblems(wrong)[0], /26/);
  assert.deepEqual(referenceValueProblems({ ...wrong, typedAnswers: [{ part: "a", kind: "number", value: "26" }] }), []);
  assert.deepEqual(referenceValueProblems({ id: "x", q: "Mondj egy páros számot!", typedAnswers: [{ part: "a", kind: "number", value: "4" }] }), [], "nincs kifejezés → nincs ítélet");
  assert.match(arithmeticClaimProblems({ tasks: [{ ...wrong, sample: "22" }] }).join(" "), /hibás referencia/);
});

test("kiszolgálói kapu: a fejlécet nem küldő (régi) kliens nem kaphat típusos leckét; régi lecke mindenkinek megy", () => {
  assert.deepEqual(scoringGate(2, undefined), { ok: false, status: 409, requiredScoringVersion: 2, message: scoringGate(2, undefined).ok ? "" : (scoringGate(2, undefined) as { message: string }).message });
  assert.equal(scoringGate(2, "2").ok, true);
  assert.equal(scoringGate(2, "1").ok, false);
  assert.equal(scoringGate(undefined, undefined).ok, true);
  assert.equal(scoringGate(1, "abc").ok, true);
});

test("a pontozó szerződése a modellnek a kód konstansaiból generálódik", () => {
  assert.ok(OPEN_ANSWER_RULES_HU.includes(STEM_SUFFIXES[0]));
  assert.match(OPEN_ANSWER_RULES_HU, /2\/1 ≠ 1\/2/);
  assert.match(OPEN_ANSWER_RULES_HU, /requiredDistinct/);
  assert.match(OPEN_ANSWER_RULES_HU, /mert/);
  assert.ok(OPEN_ANSWER_RULES_HU.length < 3500, `tömör maradjon (${OPEN_ANSWER_RULES_HU.length})`);
});
