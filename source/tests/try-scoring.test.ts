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
  // V2b (dokumentált spec-változás): a gyártás az öt új fajtát is hirdeti.
  for (const k of ["dragSort", "fillBlank", "match"]) assert.ok((PROMPT_TRY_KINDS as readonly string[]).includes(k), k);
  for (const k of ["trueFalseSeries", "highlight", "categorize", "numberLine", "estimate"]) assert.ok((TRY_KINDS as readonly string[]).includes(k), k);
  const good: Record<string, unknown> = {
    trueFalseSeries: { statements: [{ text: "A víz 100 °C-on forr.", answer: true }, { text: "A jég meleg.", answer: false }] },
    highlight: { text: "A macska gyorsan fut.", targets: ["gyorsan"] },
    categorize: { categories: ["páros", "páratlan"], items: [{ text: "2", category: "páros" }, { text: "3", category: "páratlan" }, { text: "4", category: "páros" }] },
    numberLine: { min: 0, max: 10, target: 7, tolerance: 0.5 },
    estimate: { prompt: "Hány méter magas a torony?", min: 0, max: 1000, answer: 400, unit: "m" },
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

test("review #609/#615/#617: a séma elutasítja a megoldhatatlan csúszkát — a lépésközzel legalább egy teljes pontot érő érték elérhető legyen", () => {
  const unsolvable: Array<[string, unknown]> = [
    ["numberLine", { min: 0, max: 10, step: 4, target: 6, tolerance: 0.1 }],
    ["numberLine", { min: 0, max: 10, step: 2, target: 5, tolerance: 0.1 }],
    ["numberLine", { min: 0, max: 10, step: 3, target: 7, tolerance: 0.1 }],
    ["estimate", { min: -1, max: 1, step: 0.3, answer: 0 }],
    ["estimate", { min: 0, max: 100, answer: 0.1 }],
    ["estimate", { min: 0, max: 100, step: 10, answer: 1 }],
    ["estimate", { min: 0, max: 1000, step: 10, answer: 1 }],
  ];
  for (const [k, s] of unsolvable) assert.ok(trySpecProblems(k, s).some((m) => /lépésköz/.test(m)), `${k} ${JSON.stringify(s)}: megoldhatatlan`);
  const solvable: Array<[string, unknown]> = [
    ["numberLine", { min: 0, max: 10, step: 1, target: 7, tolerance: 0.5 }],
    ["numberLine", { min: 0, max: 10, target: 7, tolerance: 0.5 }],
    ["numberLine", { min: 0, max: 10, step: 4, target: 8, tolerance: 0.1 }],
    // SPEC-VÁLTOZÁS (review #612): a becslés leírása (prompt) kötelező.
    ["estimate", { prompt: "Becsüld meg a távolságot!", min: 0, max: 1000, step: 10, answer: 400 }],
    ["estimate", { prompt: "Hány méter magas a torony?", min: 0, max: 1000, answer: 400, unit: "m" }],
    ["estimate", { prompt: "Becsüld meg az értéket!", min: -1, max: 1, step: 0.5, answer: 0 }],
  ];
  for (const [k, s] of solvable) assert.deepEqual(trySpecProblems(k, s), [], `${k} ${JSON.stringify(s)}: megoldható`);
});
// SPEC-VÁLTOZÁS (review #624): a leírás-követelmény a GYÁRTÁS határára került (`generatedTryProblems`) — a korábban mentett,
// leírás nélküli becslésblokkos lecke olvasható marad (a séma nem utasítja el), az új gyártás viszont nem adhat ilyet.
test("review #612/#624: a becslés leírás (prompt) nélkül a gyártásban hibás, olvasáskor (mentett lecke) érvényes", async () => {
  const { generatedTryProblems } = await import("../shared/try-scoring");
  assert.ok(generatedTryProblems("estimate", { min: 0, max: 1000, answer: 400, unit: "m" }).some((m) => /leírás/.test(m)));
  assert.ok(generatedTryProblems("estimate", { prompt: "   ", min: 0, max: 1000, answer: 400 }).some((m) => /leírás/.test(m)));
  assert.deepEqual(generatedTryProblems("estimate", { prompt: "Hány méter magas a torony?", min: 0, max: 1000, answer: 400, unit: "m" }), []);
  assert.deepEqual(trySpecProblems("estimate", { min: 0, max: 1000, step: 10, answer: 400, unit: "m" }), [], "a mentett, leírás nélküli becslés olvasható");
});

test("review #624/2: a leckejavító és a fogalomjavító is csak ÚJ / változott try-blokkra kéri a gyártás-határ követelményt", async () => {
  const { newTryProblems } = await import("../shared/try-scoring");
  const old = { kind: "try", tryKind: "estimate", spec: { min: 0, max: 1000, step: 10, answer: 400, unit: "m" } };
  const fresh = { kind: "try", tryKind: "estimate", spec: { min: 0, max: 50, answer: 20 } };
  const before = { sections: [{ blocks: [old] }] };
  assert.deepEqual(newTryProblems(before as never, { sections: [{ blocks: [old] }] } as never), [], "a mentett, változatlan blokk nem hiba");
  assert.ok(newTryProblems(before as never, { sections: [{ blocks: [old, fresh] }] } as never).some((m) => /leírás/.test(m)), "az új blokk hibás");
  assert.ok(newTryProblems(null, { sections: [{ blocks: [old] }] } as never).length > 0, "új gyártásnál minden blokk új");
  const { readFileSync } = await import("node:fs");
  for (const f of ["../server/studio/single-run/concept-fix.ts", "../server/studio/structured-improvement.ts", "../server/studio/single-run/engine.ts"]) {
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /newTryProblems\(/, f);
  }
});
