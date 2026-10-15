import test from "node:test";
import assert from "node:assert/strict";
import { calibrateRubric } from "../shared/answer-key-calibrate";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import type { OpenTask } from "../shared/lesson-experience";

/* Tételgyár T2.1b (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md): gépi rubrika-kalibráció. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Hogyan jött létre az almafa sokféle fajtája?",
  required: [["vadalma", "vadalmából"], ["nemesítették"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "A vadalmából nemesítették ki a sokféle fajtát.", mode: "written", ...over,
}) as OpenTask;
const wrong: AnswerKeyCases["wrong"] = [{ kind: "tevhit", text: "Az almafák maguktól lettek ilyenek." }, { kind: "temaidegen", text: "Az alma piros és édes gyümölcs." }];

test("alakfelvétel közös szótővel: „nemesítés” → a „nemesítették” csoportba (a mért 416-os eset)", () => {
  const cases: AnswerKeyCases = { correct: ["Az almafa sok fajtája a vadalmából nemesítés útján jött létre.", "A vadalmát nemesítéssel alakították sokféle fajtává.", "A vadalmából nemesítették ki őket."], wrong };
  const { task: out, changes } = calibrateRubric(task(), cases);
  assert.ok(out.required[1].some((f) => /nemesites/.test(f.normalize("NFD").replace(/\p{M}/gu, ""))), JSON.stringify(out.required));
  assert.ok(changes.some((c) => c.startsWith("alak")));
  for (const a of cases.correct) assert.equal(evaluateOpenAnswer(a, out).state, "ok", a);
});

test("a „rovar” nem rokona a „rovarbeporzás”-nak (a szótő-szabály maradékkorlátja)", () => {
  const t = task({ q: "Mi a rovarbeporzás?", required: [["rovarbeporzás"], ["virágpor", "virágport"]], sample: "A rovarbeporzás során a rovar viszi a virágport." });
  const cases: AnswerKeyCases = { correct: ["A rovar viszi a virágport egyik virágról a másikra.", "x y z w", "a b c d"], wrong: [{ kind: "temaidegen", text: "A méz édes." }, { kind: "tevhit", text: "A szél viszi." }] };
  const { task: out } = calibrateRubric(t, cases, { demoteWhenMissingIn: () => 99 });
  assert.deepEqual(out.required[0], ["rovarbeporzás"]);
});

test("bónuszba sorolás: a legalább 2 helyes válaszból hiányzó kötelező csoport bónusz lesz; ≥ 1 kötelező marad", () => {
  const t = task({ required: [["vadalma", "vadalmából"], ["nemesítették"], ["Tigris"]], sample: "A vadalmából nemesítették ki, a Tigris mellett." });
  const cases: AnswerKeyCases = { correct: ["A vadalmából nemesítették ki a fajtákat.", "Vadalmából nemesítették őket régen.", "A vadalmából nemesítették ki a sokféle almát."], wrong };
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.deepEqual(out.required.map((g) => g[0]), ["vadalma", "nemesítették"]);
  assert.deepEqual(out.bonus.map((g) => g[0]), ["Tigris"]);
  assert.ok(changes.some((c) => c.startsWith("bónuszba: \"Tigris\"")));
});

test("egyetlen zajos tesztválasz nem minősít vissza fogalmat (alapküszöb: legalább 2 helyesből hiányzik)", () => {
  const cases: AnswerKeyCases = { correct: ["A vadalmából nemesítették ki a fajtákat.", "Vadalmából nemesítették őket régen.", "Régen sokféle alma lett belőle."], wrong };
  const { task: out } = calibrateRubric(task(), cases);
  assert.equal(out.required.length, 2);
  assert.equal(out.bonus.length, 0);
});

test("az őr visszavon: ha a bónuszba sorolás után a hibás válasz teljes pontot kapna, a csoport kötelező marad", () => {
  const t = task({ required: [["almafa", "almafák"], ["nemesítették"]], sample: "Az almafák fajtáit nemesítették." });
  const cases: AnswerKeyCases = {
    correct: ["Az almafák fajtáit a vadalmából alakították ki.", "Az almafák sokféle fajtája így lett.", "Az almafák fajtái emberi munkával jöttek létre."],
    wrong: [{ kind: "tevhit", text: "Az almafák maguktól változtak meg." }, { kind: "temaidegen", text: "Az alma édes." }],
  };
  const { task: out } = calibrateRubric(t, cases);
  assert.deepEqual(out.required.map((g) => g[0]), ["almafa", "nemesítették"], "a „nemesítették” nélkül a tévhit is átmenne");
  for (const w of cases.wrong) assert.notEqual(evaluateOpenAnswer(w.text, out).state, "ok");
});

test("szóminimum és mondatfeltétel: csak ha a helyes válasz egyedül ezen bukik; a minta és a hibás válaszok őre alatt", () => {
  const t = task({ minWords: 9, needsSentence: true, sample: "A vadalmából nemesítették ki a sokféle almafajtát, és így lett sok fajta." });
  const cases: AnswerKeyCases = { correct: ["vadalmából nemesítették", "vadalmából nemesítették ki", "A vadalmából nemesítették."], wrong };
  const { task: out, changes } = calibrateRubric(t, cases);
  assert.equal(out.minWords, 2);
  assert.ok(changes.some((c) => c.startsWith("szóminimum 9 → 2")));
  assert.equal(out.needsSentence, false);
});

test("nincs eset, számolós feladat, vagy az eredeti rubrika már most enged hibás választ → nincs kalibráció", () => {
  assert.deepEqual(calibrateRubric(task(), null).changes, []);
  const typed = task({ typedAnswers: [{ part: "a", kind: "number", value: "4" }] } as Partial<OpenTask>);
  assert.deepEqual(calibrateRubric(typed, { correct: ["a", "b", "c"], wrong }).changes, []);
  const loose = calibrateRubric(task(), { correct: ["x y z w", "x y z w", "x y z w"], wrong: [{ kind: "tevhit", text: "A vadalmából nemesítették ki." }, { kind: "temaidegen", text: "q" }] });
  assert.deepEqual(loose.changes, [], "a túl megengedő rubrikát a kalibráció nem lazítja tovább");
});
