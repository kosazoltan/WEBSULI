import assert from "node:assert/strict";
import test from "node:test";

import { checkGrounding, shortTermExamplePresent } from "../server/studio/grounding";
import type { MapConcept } from "../server/studio/coverage";

/* Spec 2026-10-19-rovid-fogalom-megalapozas — mérve: „Where I Live” (639b5201, 6f1158ce, 55736ce3), a térkép fogalmai szó szerint. */

const articleA = {
  localId: "article-a", term: "a", examWeight: "core",
  definition: "Az a névelő mássalhangzó hang előtt áll: a lamp, a sofa.",
  quote: "a = before consonant sounds: a lamp, a sofa",
} as MapConcept;
const articleAn = {
  localId: "article-an", term: "an", examWeight: "core",
  definition: "Az an névelő magánhangzó hang előtt áll: an armchair, an orange.",
  quote: "an = before vowel sounds: an armchair, an orange",
} as MapConcept;

test("a forrás saját példáját tanító angol blokk megalapozza az „an” címkét", () => {
  assert.equal(checkGrounding("Look! This is an armchair in the living room. It is big and soft.", articleAn), true);
  assert.equal(shortTermExamplePresent("an", articleAn.quote ?? "", "I have an orange for lunch today."), true);
});

test("a definíciót magyarázó blokk megalapozza az „a” címkét (eddig a tartalékig sem jutott)", () => {
  assert.equal(checkGrounding("Az a névelőt mássalhangzó hang előtt használjuk, például: a bed, a chair, a table.", articleA), true);
});

test("más témájú magyar blokk, benne csak a magyar „a” névelővel: nem megalapozott", () => {
  assert.equal(checkGrounding("A szobában a kanapé mellett áll a kis asztal, és a falon egy kép lóg.", articleA), false);
  assert.equal(checkGrounding("A szobában a kanapé mellett áll a kis asztal, és a falon egy kép lóg.", articleAn), false);
});

test("a magyarázó (=) idézetdarab és az egyszavas darab nem számít példának", () => {
  assert.equal(shortTermExamplePresent("an", "an = before vowel sounds", "an before vowel sounds is the rule here"), false);
  assert.equal(shortTermExamplePresent("a", "a, b, c", "this is a test of the rule"), false);
});

test("rövidítés-fogalom: a kétszavas kifejezés-egyezés változatlanul dönt", () => {
  const c = { localId: "kr", term: "Kr. u. / i. sz.", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Az időszámításunk szerinti évek jele: Kr. u. / i. sz. — például Kr. u. 1000.", c), true);
  assert.equal(checkGrounding("Ez a blokk egészen másról, a vulkánokról és a földrengésekről szól.", c), false);
});
