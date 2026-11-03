import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import type { OpenTask } from "../shared/lesson-experience";

// Spec 2026-11-03-pontozo-szoalak: a vak helyes diákválaszok pontvesztésének fő oka a toldalékolt / képzett / összetett alak volt
// (Antigoné, 9. évf.); a fosztóképzős, ellentétes jelentésű alak továbbra sem talál.
const task = (word: string, sample: string): OpenTask => ({
  id: "t-1", sectionIndex: 0, coversConceptIds: ["c"], q: "Kérdés?", required: [[word]], bonus: [], minWords: 1, needsSentence: false, sample, mode: "written",
});
const scoreOf = (word: string, answer: string) => evaluateOpenAnswer(answer, task(word, word)).score;

test("a ≥ 5 betűs rubrikaszó képzett, többszörösen ragozott és összetett alakja talál (mért diákválaszok)", () => {
  for (const [word, answer] of [
    ["lelkiismeret", "a hatalom parancsa szembemegy a lelkiismeretével"],
    ["makacs", "kitart a makacsságában"],
    ["makacs", "ne makacskodjon tovább"],
    ["ellenáll", "kitart az ellenállása mellett"],
    ["megkövezés", "megkövezéssel bűnhődik"],
    ["kötél", "kötéllel vetett véget"],
    ["barlangba", "egy sziklabarlangba zárja"],
    ["nemzedék", "nemzedékről nemzedékre száll"],
  ] as const) assert.equal(scoreOf(word, answer), 1, `${word} ← „${answer}”`);
});

test("a fosztóképzős (ellentétes) alak, a rövid szó, a szám és a véletlen belső egyezés NEM talál", () => {
  for (const [word, answer] of [
    ["boldog", "a király boldogtalan lett"],
    ["jogos", "a parancs jogtalan volt"],
    ["lelkiismeret", "lelkiismeretlen ember"],
    ["alap", "a kalap a fején volt"],
    ["442", "4420-ban mutatták be"],
    ["sír", "a sírás hallatszott"],
  ] as const) assert.equal(scoreOf(word, answer), 0, `${word} ↛ „${answer}”`);
});

test("review #380: a rövidebb tő sem kerülheti meg a fosztóképzőt, és az ellentétes előtag/utótag (magyar, angol) nem talál", () => {
  for (const [word, answer] of [
    ["haszon", "haszontalan"],
    ["vagyon", "vagyontalan"],
    ["oxigén", "oxigénmentes"],
    ["dohányzó", "nemdohányzó"],
    ["agree", "disagree"],
    ["appear", "disappear"],
    ["honest", "dishonest"],
    ["colour", "colourless"],
    ["sugar", "sugarfree"],
  ] as const) assert.equal(scoreOf(word, answer), 0, `${word} ↛ „${answer}”`);
  for (const [word, answer] of [["agree", "agreement"], ["haszon", "hasznos haszonnal"], ["colour", "colourful"]] as const) {
    assert.equal(scoreOf(word, answer), 1, `${word} ← „${answer}” (nem ellentétes alak)`);
  }
});

test("a mintában más szóval kifejezett magyar tagadás mellett a válasz „nem”-je nem von le pontot; tagadás nélküli mintánál igen", () => {
  const forbidden: OpenTask = { ...task("eltemetni", "Polüneikészt tilos eltemetni."), required: [["Polüneikészt"], ["eltemetni"]] };
  assert.equal(evaluateOpenAnswer("Polüneikészt nem szabad eltemetni.", forbidden).score, 1);
  const never: OpenTask = { ...task("hazudott", "A jós sosem hazudott Kreónnak."), required: [["jós"], ["hazudott"]] };
  assert.equal(evaluateOpenAnswer("A jós nem hazudott Kreónnak.", never).score, 1);
  const affirmative: OpenTask = { ...task("eltemeti", "Antigoné eltemeti a testvérét."), required: [["Antigoné"], ["eltemeti"]] };
  assert.equal(evaluateOpenAnswer("Antigoné nem temeti el, nem eltemeti a testvérét.", affirmative).score, 0.5, "a tagadásőr az állító mintánál marad");
});
