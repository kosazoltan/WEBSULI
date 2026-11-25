import test from "node:test";
import assert from "node:assert/strict";
import { lessonSchema, PROMPT_TRY_KINDS, TRY_KINDS } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import {
  scoreTrueFalseSeries, scoreHighlight, scoreCategorize, scoreNumberLine, scoreEstimate, verdictOf, highlightTokens, trySpecProblems,
} from "../shared/try-scoring";

/** V2a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): öt új feladatfajta — determinisztikus, dokumentált pontozás. */

test("igaz/hamis sorozat: pont = helyes jelölés; teljes / részleges / rossz", () => {
  const spec = { statements: [{ text: "A", answer: true }, { text: "B", answer: false }, { text: "C", answer: true }] };
  assert.deepEqual(scoreTrueFalseSeries(spec, [true, false, true]), { points: 3, max: 3, verdict: "teljes" });
  assert.deepEqual(scoreTrueFalseSeries(spec, [true, true, null]), { points: 1, max: 3, verdict: "részleges" });
  assert.deepEqual(scoreTrueFalseSeries(spec, [false, true, false]), { points: 0, max: 3, verdict: "rossz" });
});

test("szókiemelés: pont = max(0, eltalált − téves); a célszavak a szöveg szavai", () => {
  const spec = { text: "A macska gyorsan fut, a kutya lassan sétál.", targets: ["gyorsan", "lassan"] };
  const tokens = highlightTokens(spec.text);
  const at = (w: string) => tokens.findIndex((t) => t.word === w);
  assert.deepEqual(scoreHighlight(spec, [at("gyorsan"), at("lassan")]), { points: 2, max: 2, verdict: "teljes" });
  assert.deepEqual(scoreHighlight(spec, [at("gyorsan")]), { points: 1, max: 2, verdict: "részleges" });
  assert.deepEqual(scoreHighlight(spec, [at("gyorsan"), at("macska")]), { points: 0, max: 2, verdict: "rossz" });
  assert.deepEqual(scoreHighlight(spec, [at("gyorsan"), at("lassan"), at("kutya")]), { points: 1, max: 2, verdict: "részleges" });
});

test("kategorizálás: pont = helyesen besorolt elem", () => {
  const spec = { categories: ["emlős", "madár"], items: [{ text: "kutya", category: "emlős" }, { text: "veréb", category: "madár" }, { text: "bálna", category: "emlős" }] };
  assert.deepEqual(scoreCategorize(spec, ["emlős", "madár", "emlős"]), { points: 3, max: 3, verdict: "teljes" });
  assert.deepEqual(scoreCategorize(spec, ["emlős", "emlős", null]), { points: 1, max: 3, verdict: "részleges" });
  assert.deepEqual(scoreCategorize(spec, ["madár", "emlős", "madár"]), { points: 0, max: 3, verdict: "rossz" });
});

test("számegyenes: tűrésen belül 2, kétszeres tűrésen belül 1, különben 0", () => {
  const spec = { min: 0, max: 10, target: 7, tolerance: 0.5 };
  assert.deepEqual(scoreNumberLine(spec, 7.4), { points: 2, max: 2, verdict: "teljes" });
  assert.deepEqual(scoreNumberLine(spec, 7.9), { points: 1, max: 2, verdict: "részleges" });
  assert.deepEqual(scoreNumberLine(spec, 3), { points: 0, max: 2, verdict: "rossz" });
  assert.deepEqual(scoreNumberLine(spec, null), { points: 0, max: 2, verdict: "rossz" });
});

test("becslés: ≤ 5% eltérés 2, ≤ 15% 1, különben 0", () => {
  const spec = { min: 0, max: 1000, answer: 400 };
  assert.deepEqual(scoreEstimate(spec, 415), { points: 2, max: 2, verdict: "teljes" });
  assert.deepEqual(scoreEstimate(spec, 450), { points: 1, max: 2, verdict: "részleges" });
  assert.deepEqual(scoreEstimate(spec, 700), { points: 0, max: 2, verdict: "rossz" });
  assert.equal(verdictOf(0, 0), "rossz");
});

test("séma: a helyes specifikáció átmegy, a hibás elutasítva; a modellnek hirdetett fajták a régi hármas", () => {
  assert.deepEqual([...PROMPT_TRY_KINDS], ["dragSort", "fillBlank", "match"]);
  for (const k of ["trueFalseSeries", "highlight", "categorize", "numberLine", "estimate"]) assert.ok((TRY_KINDS as readonly string[]).includes(k), k);
  const good: Record<string, unknown> = {
    trueFalseSeries: { statements: [{ text: "A víz 100 °C-on forr.", answer: true }, { text: "A jég meleg.", answer: false }] },
    highlight: { text: "A macska gyorsan fut.", targets: ["gyorsan"] },
    categorize: { categories: ["páros", "páratlan"], items: [{ text: "2", category: "páros" }, { text: "3", category: "páratlan" }, { text: "4", category: "páros" }] },
    numberLine: { min: 0, max: 10, target: 7, tolerance: 0.5 },
    estimate: { min: 0, max: 1000, answer: 400, unit: "m" },
  };
  const bad: Record<string, unknown> = {
    trueFalseSeries: { statements: [{ text: "egy", answer: true }] },
    highlight: { text: "A macska fut.", targets: ["kutya"] },
    categorize: { categories: ["a", "b"], items: [{ text: "x", category: "c" }, { text: "y", category: "a" }, { text: "z", category: "b" }] },
    numberLine: { min: 10, max: 0, target: 5, tolerance: 1 },
    estimate: { min: 0, max: 100, answer: 500 },
  };
  for (const k of Object.keys(good)) {
    assert.deepEqual(trySpecProblems(k, good[k]), [], `${k}: helyes`);
    assert.ok(trySpecProblems(k, bad[k]).length > 0, `${k}: hibás`);
    const l = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> };
    const concept = (l.sections[0].blocks.find((b) => Array.isArray(b.coversConceptIds))!.coversConceptIds as string[]).slice(0, 1);
    l.sections[0].blocks.push({ kind: "try", tryKind: k, spec: good[k], coversConceptIds: concept });
    assert.equal(lessonSchema.safeParse(l).success, true, `${k}: séma`);
    l.sections[0].blocks[l.sections[0].blocks.length - 1].spec = bad[k];
    assert.equal(lessonSchema.safeParse(l).success, false, `${k}: hibás séma`);
  }
});
