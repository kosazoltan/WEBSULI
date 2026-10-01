import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOpenAnswer, evaluateOpenAnswerV1, isTypedTask, normalizeAnswerV2, OPEN_ANSWER_RULES_HU, STEM_SUFFIXES } from "../shared/lesson-experience-score";
import { gradeTypedAnswers, referenceValueProblems, scoringGate, isSimplifiedFraction, normalizeExpressionText, LESSON_SCORING_VERSION, containsExpressionState, referenceValue, isExpressionText } from "../shared/answer-value";
import { evaluateExpression } from "../shared/arithmetic-expression";
import { experienceSchema, requiredDistinctSchema, type OpenTask } from "../shared/lesson-experience";
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
  const gate = scoringGate(2, undefined);
  assert.equal(gate.ok, false);
  if (!gate.ok) { assert.equal(gate.status, 409); assert.equal(gate.requiredScoringVersion, 2); assert.match(gate.message, /Frissítsd az oldalt/, "rögzített elvárás: az üzenet frissítésre utasít"); }
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

/* Review #159 (Codex P1/P1/P2, Copilot): tokenhatár, zárójel, kategória-duplikátum, szószám, 500 szavas ablak, köztes alak. */

test("review #159 P1: a köztes állapot csak tokenhatáron egyezik — a „35+64-12” nem a „135+64-12” részlete", () => {
  const step = base({ sample: "35 + 64 − 12", typedAnswers: [{ part: "menet", kind: "expression", value: "35 + 64 − 12", form: "intermediate-step" }] });
  assert.equal(evaluateOpenAnswer("Az eredmény 135 + 64 − 12", step).score, 0);
  assert.equal(evaluateOpenAnswer("Az eredmény 35 + 64 − 120", step).score, 0);
  assert.equal(evaluateOpenAnswer("Az eredmény 35 + 64 − 12,5", step).score, 0);
  assert.equal(evaluateOpenAnswer("Az eredmény tehát 35 + 64 − 12 = 87.", step).score, 1);
  assert.equal(evaluateOpenAnswer("Az eredmény (35 + 64 − 12) · 1", step).score, 1, "zárójel és műveleti jel a határon megengedett");
  assert.equal(containsExpressionState("35+64-12", ""), false);
});

test("review #159 P1: a referencia kifejezésnyelve zárójelet is ért; a közös állítás-szűrő (arithmetic-claims) változatlan", () => {
  assert.equal(referenceValue("(2 + 3) · 4"), 20);
  assert.equal(referenceValue("36 : (3 · 2)"), 6);
  assert.equal(referenceValue("-(1/2 + 1/4)"), -0.75);
  assert.equal(referenceValue("2 · (3"), null, "lezáratlan zárójel");
  assert.equal(referenceValue("(2 + 3) alma"), null, "idegen szöveg");
  assert.equal(referenceValue("4 : 0"), null, "nullával osztás");
  assert.equal(evaluateExpression("36 ÷ (3 · 2)"), null, "a bankszöveg állítás-szűrője továbbra sem ítél zárójelről");
  const task = base({ sample: "Az eredmény 20.", typedAnswers: [{ part: "a", kind: "number", value: "(2 + 3) · 4" }] });
  assert.equal(evaluateOpenAnswer("Az eredmény 20.", task).score, 1);
  const e = { ...standardFusionFixture().experience!, scoringVersion: LESSON_SCORING_VERSION };
  const withParens = { ...e, tasks: e.tasks.map((t, i) => (i === 0 ? task : t)) };
  assert.equal(experienceSchema.safeParse(withParens).success, true, "a zárójeles referencia nem sémahiba");
});

test("review #159: az intermediate-step referencia is a kifejezésnyelv mondata legyen — „eredmény” nem az", () => {
  const bad = base({ sample: "eredmény", typedAnswers: [{ part: "menet", kind: "expression", value: "eredmény", form: "intermediate-step" }] });
  assert.equal(evaluateOpenAnswer("az eredmény jó", bad).score, 0, "nem értelmezhető → nem pontozható (undecidable)");
  assert.equal(referenceValueProblems({ id: "t", q: "Mi az első menet eredménye?", typedAnswers: bad.typedAnswers }).length, 1);
  const e = { ...standardFusionFixture().experience!, scoringVersion: LESSON_SCORING_VERSION };
  const parsed = experienceSchema.safeParse({ ...e, tasks: e.tasks.map((t, i) => (i === 0 ? bad : t)) });
  assert.equal(parsed.success, false);
  assert.match(JSON.stringify(parsed.success ? [] : parsed.error.issues), /nem értelmezhető/);
});

test("review #159 P2: ugyanaz az elem két csoportban nem két példa — séma és pontozó", () => {
  const dup = requiredDistinctSchema.safeParse({ category: "gyümölcs", from: [["alma"], ["Alma"]], count: 2 });
  assert.equal(dup.success, false);
  const task = base({ required: [["gyümölcs"]], sample: "Gyümölcs: alma, körte.", requiredDistinct: [{ category: "gyümölcs", from: [["alma", "almát"], ["körte"], ["szilva"]], count: 2 }] });
  assert.equal(evaluateOpenAnswer("Gyümölcs: alma, alma.", task).score, 0.5, "egy előfordulás egy elem");
  assert.equal(evaluateOpenAnswer("Gyümölcs: alma, körte.", task).score, 1);
});

test("review #159: a műveleti jel nem szó (minWords), és az 500. szó utáni érték nem ér pontot", () => {
  const task = base({ minWords: 4, sample: "Az eredmény tehát: 8 : 2 = 4.", typedAnswers: [{ part: "a", kind: "number", value: "4" }] });
  assert.equal(evaluateOpenAnswer("8 : 2 = 4", task).score, 0, "három szám + két jel: 3 szó < 4 (a jel nem szó)");
  assert.equal(evaluateOpenAnswer("Az eredmény tehát 4", task).score, 1);
  const filler = Array.from({ length: 500 }, () => "alma").join(" "); // betűsor: a „szó4” alak számjegye maga is érték lenne
  assert.equal(evaluateOpenAnswer(`Az eredmény: ${filler} 4`, task).score, 0, "az 500. szó utáni érték már nem számít");
  assert.equal(evaluateOpenAnswer(`Az eredmény: 4 ${filler}`, task).score, 1);
});

test("élő mérés 35370b32: a nem-szöveg típusos érték (modell szám-értéke) sémahiba, nem kivétel — a csomag javító kört kaphat", () => {
  const e = standardFusionFixture().experience!;
  const bad = { ...e, scoringVersion: LESSON_SCORING_VERSION, tasks: e.tasks.map((t, i) => (i === 1 ? { ...t, typedAnswers: [{ part: "a", kind: "number", value: 12 }] } : t)) };
  let parsed: ReturnType<typeof experienceSchema.safeParse> | undefined;
  assert.doesNotThrow(() => { parsed = experienceSchema.safeParse(bad); });
  assert.equal(parsed!.success, false);
  assert.equal(referenceValue(12 as unknown), null);
  assert.equal(isExpressionText(undefined), false);
});
