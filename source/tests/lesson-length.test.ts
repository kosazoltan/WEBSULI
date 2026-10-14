import assert from "node:assert/strict";
import test from "node:test";

import type { MapConcept } from "../server/studio/coverage";
import { buildAuthorPrompt, buildPedagoguePrompt, OUTLINE_MAX_SECTIONS } from "../server/studio/step-io";
import { lessonLengthBudget } from "../shared/lesson-length";

/**
 * Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S2). Mérve (43 tárolt lecke): a Tananyag lap hossza nem függ a forrástól
 * (r = −0,10), medián 2210 látható szó; a 46 szavas forrásból 2756 szavas lecke lett. A terjedelem a tanítandó fogalmakból
 * és az évfolyamból jön, nem fix sablonból.
 */

const concepts = (n: number, weight: MapConcept["examWeight"] = "core"): MapConcept[] =>
  Array.from({ length: n }, (_, i) => ({ localId: `c${i + 1}`, term: `Fogalom ${i + 1}`, definition: "d", quote: "q", examWeight: weight }) as MapConcept);

// Spec-változás (kalibráció, 2026-10-14, próbaharness 4 térképen): a kezdeti 45/60/75/90 szó/fogalom keret a kötelező fogalmak
// lefedettségét 9–17 ponttal rontotta → 70/90/110/130, plafon 1600/2600/3200/3800 (shared/lesson-length.ts).
test("terjedelmi keret: kb. 3 fogalom / fejezet, fogalmanként évfolyamfüggő szókeret, plafonnal", () => {
  // a Mezopotámia-eset: 10 tanítandó fogalom, 6. évfolyam
  assert.deepEqual(lessonLengthBudget({ classroom: 6, concepts: concepts(10) }), { requiredConcepts: 10, maxSections: 4, targetWords: 900, maxWords: 1080 });
  // sok fogalom: a fejezetszám a 12-es abszolút plafonnál, a szókeret az évfolyam-plafonnál áll meg
  const big = lessonLengthBudget({ classroom: 5, concepts: concepts(49) });
  assert.equal(big.maxSections, OUTLINE_MAX_SECTIONS);
  assert.equal(big.targetWords, 2600);
  // évfolyamonként nő a fogalmankénti keret: 1–4.: 70, 5–6.: 90, 7–8.: 110, 9+: 130
  assert.equal(lessonLengthBudget({ classroom: 3, concepts: concepts(3) }).targetWords, 250, "alsó határ 250 szó");
  assert.equal(lessonLengthBudget({ classroom: 4, concepts: concepts(10) }).targetWords, 700);
  assert.equal(lessonLengthBudget({ classroom: 7, concepts: concepts(10) }).targetWords, 1100);
  assert.equal(lessonLengthBudget({ classroom: 10, concepts: concepts(10) }).targetWords, 1300);
});

test("terjedelmi keret: az `extra` (témafókuszon kívüli) fogalom nem tanítandó, és legalább 2 fejezet", () => {
  const mixed = [...concepts(3), ...concepts(20, "extra").map((c, i) => ({ ...c, localId: `x${i}` }))];
  const b = lessonLengthBudget({ classroom: 6, concepts: mixed });
  assert.equal(b.requiredConcepts, 3);
  assert.equal(b.maxSections, 2);
});

test("tervező: a keret a promptban, a sablon-fejezetek feltételesek", () => {
  const prompt = buildPedagoguePrompt({ title: "Mezopotámia", subject: "történelem", classroom: 6, concepts: concepts(10) });
  assert.match(prompt, /TERJEDELMI KERET/);
  assert.match(prompt, /legfeljebb 4 fejezet/);
  assert.match(prompt, /kb\. 900 látható szó/);
  assert.match(prompt, /CÉL-TANANYAG MINTA/, "a minta neve megmarad, de feltételes");
  assert.match(prompt, /CSAK ha a forrásban gyakorlófeladat van/);
  assert.match(prompt, /CSAK ha legalább 3/);
  assert.doesNotMatch(prompt, /Nyitó fejezet: miért kell ez a tudás/, "a motiváció nem külön fejezet");
});

test("szerző: tömör és teljes, a keret a promptban; a „ne rövidítsd vázlattá” mondat megszűnt", () => {
  const map = { title: "Mezopotámia", subject: "történelem", classroom: 6, concepts: concepts(10) };
  const prompt = buildAuthorPrompt([{ heading: "A két folyó", conceptIds: ["c1"], plannedBlocks: ["explain", "check"], animationSuggestions: [] }] as never, map, []);
  assert.match(prompt, /TÖMÖR ÉS TELJES/);
  assert.match(prompt, /kb\. 900 látható szó \(legfeljebb 1080\)/);
  assert.match(prompt, /TÉNYVÉDELEM/, "a rövidítés nem vághat tényt (kalibráció 2026-10-14)");
  // mérve (Hunyadi): a mindig-true minta a tömör fejezetekben elérhetetlen Próbát → ív-hibát → hosszító javítókört adott
  assert.match(prompt, /PRÓBA: a fejezet probaEnabled értéke CSAK akkor true, ha a fejezetben legalább 5 check/);
  assert.match(prompt, /"probaEnabled": boolean/);
  assert.doesNotMatch(prompt, /Ne rövidítsd vázlattá/);
});
