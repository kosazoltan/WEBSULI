import { test } from "node:test";
import assert from "node:assert/strict";
import {
  animKindShares, failedThresholds, feedbackOpener, feedbackOpenerShares, legacyOpenerCount, patternShares, samePatternProbability,
  sectionPattern, tryShare, varietyReport, VARIETY_THRESHOLDS, type VarietyLesson,
} from "../shared/variety-metrics";
import { measureTable } from "../scripts/measure/variety-measure.mts";

const sec = (...kinds: string[]) => ({ blocks: kinds.map((kind) => ({ kind })) });
const check = (...fb: string[]) => ({ kind: "check", feedbackPerOption: fb });
const anim = (animKind: string) => ({ kind: "animate", animKind });

// 4 szintetikus lecke, kézzel számolt elvárással
const A: VarietyLesson = { sections: [sec("explain", "example", "check"), sec("explain", "try", "check"), sec("explain", "example", "check")] };
const B: VarietyLesson = { sections: [sec("explain", "example", "check"), sec("explain", "animate", "recap")] };
const C: VarietyLesson = { sections: [{ blocks: [{ kind: "explain" }, check("Jó próba, de a 12 páros.", "Igen, mert osztható.", "A 7 prím.")] }] };
const D: VarietyLesson = { sections: [{ blocks: [anim("process"), anim("process"), anim("process"), anim("compare"), { kind: "try" }] }, sec("explain")] };

test("SK2: fejezetminta és arányok — kézzel számolt", () => {
  assert.equal(sectionPattern(A.sections[0]), "explain,example,check");
  const s = patternShares([A, B]); // 5 fejezet: e,ex,c ×3; e,t,c ×1; e,a,r ×1
  assert.equal(s.get("explain,example,check"), 3 / 5);
  assert.equal(samePatternProbability([A, B]), Math.round(((9 + 1 + 1) / 25) * 1000) / 1000); // 0.44
  assert.equal(tryShare(A), 1 / 3);
  assert.equal(tryShare(B), 0);
});

test("SK2: visszajelzés-nyitás (első két szó) és régi bátorító nyitás — csak számlálás, a szöveg változatlan", () => {
  assert.equal(feedbackOpener("Jó próba, de a 12 páros."), "jó próba");
  const sh = feedbackOpenerShares([C]);
  assert.equal(sh.get("jó próba"), 1 / 3);
  assert.equal(legacyOpenerCount([C]), 2, "„Jó próba” és „Igen” a zárt listán van");
  assert.equal(C.sections[0].blocks[1].feedbackPerOption?.[0], "Jó próba, de a 12 páros.", "nincs levágás");
});

test("SK2: ábrafajta-arány — 4 ábrából 3 azonos → jelzés (> 0,4)", () => {
  assert.equal(animKindShares(D).get("process"), 3 / 4);
  const r = varietyReport([D]);
  assert.equal(r.kindHeavyLessonShare, 1);
  assert.equal(r.lowTryLessonShare, 0, "2 fejezetből 1 try = 0,5 ≥ 1/3");
});

test("SK2 mutáció: minden fejezet azonos mintájú → a küszöbök buknak", () => {
  const same: VarietyLesson[] = Array.from({ length: 10 }, () => ({ sections: [sec("explain", "check"), sec("explain", "check")] }));
  const r = varietyReport(same);
  assert.equal(r.topPatternShare, 1);
  assert.deepEqual(failedThresholds(r).slice(0, 2), ["topPatternShare", "samePatternProbability"]);
});

test("SK2: változatos állomány megfelel; a mérő füstpróbája 2 leckén „kis minta”, nem ítél", () => {
  const kinds = ["explain", "example", "try", "animate", "check", "recap"];
  const varied: VarietyLesson[] = Array.from({ length: 12 }, (_, i) => ({
    sections: [0, 1, 2].map((j) => ({ blocks: [{ kind: kinds[(i + j) % 6] }, { kind: kinds[(i * 2 + j + 1) % 6] }, check(`${["Nézd", "Gondold", "Figyeld", "Számold", "Vesd", "Idézd", "Keresd", "Mérd", "Rajzold", "Olvasd", "Írd"][(i + j) % 11]} ${i}-${j} meg újra.`)] })),
  }));
  const r = varietyReport(varied);
  assert.ok(r.topPatternShare <= VARIETY_THRESHOLDS.topPatternShare, `top ${r.topPatternShare}`);
  assert.deepEqual(failedThresholds(r), []);
  const t = measureTable(varietyReport([A, B]), { topPatternShare: 0.616 });
  assert.equal(t.small, true);
  assert.match(t.rows[0], /KIS MINTA/u);
  assert.match(t.rows.join("\n"), /\| topPatternShare \| 0\.616 \| 0\.6 \| ≤ 0\.35 \| NEM \|/u);
});
