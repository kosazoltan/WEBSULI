import assert from "node:assert/strict";
import test from "node:test";

import type { Lesson } from "../shared/lesson-schema";
import {
  factKeys,
  lessonVisibleText,
  measureLesson,
  nonSourceShare,
  repetitionShare,
  termCoverage,
  termKeys,
  words,
} from "../server/studio/lesson-metrics";

/** Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S1): a mérés kézzel ellenőrizhető mini-leckéken. */

const lesson = {
  sections: [
    {
      heading: "Folyóvölgyi civilizációk",
      probaEnabled: false,
      blocks: [
        { kind: "explain", text: "Mezopotámia a Tigris és az Eufrátesz között feküdt.", depth: "what", readAloud: true, coversConceptIds: ["c1"] },
        { kind: "example", problem: "Melyik két folyó?", steps: ["Nézd meg a térképet.", "Keresd a két folyót."], answer: "Tigris és Eufrátesz.", coversConceptIds: ["c1"] },
        { kind: "check", question: "Hol feküdt Mezopotámia?", options: ["A Nílusnál", "A Tigrisnél"], correctIndex: 1, feedbackPerOption: ["Nem, az Egyiptom.", "Igen, helyes."], hint: "Két folyó.", coversConceptIds: ["c1"] },
        { kind: "recap", bullets: ["Két folyó között."] },
      ],
    },
  ],
} as unknown as Pick<Lesson, "sections">;

test("a látható szöveg minden diák által látott mezőt számol, a válasz utáni visszajelzést külön", () => {
  const visible = lessonVisibleText(lesson);
  for (const part of ["Folyóvölgyi", "Mezopotámia a Tigris", "Melyik két folyó", "Keresd a két folyót", "Tigris és Eufrátesz.", "Hol feküdt", "A Nílusnál", "Két folyó között"]) {
    assert.ok(visible.includes(part), `hiányzik a látható szövegből: ${part}`);
  }
  assert.ok(!visible.includes("Igen, helyes"), "a visszajelzés csak válasz után látszik");
  const after = lessonVisibleText(lesson, true);
  // Review #210 (spec-javítás): a kliens CSAK a kiválasztott opció visszajelzését mutatja → egy (a helyes válaszé) számít, nem mind.
  assert.ok(after.includes("Igen, helyes"), "a helyes válasz visszajelzése a válasz utáni rész");
  assert.ok(!after.includes("Nem, az Egyiptom."), "a többi opció visszajelzése nem jelenik meg egyszerre");
  assert.ok(!after.includes("Folyóvölgyi"), "a fejezetcím nem válasz utáni szöveg");
});

test("review #210: a try- és ábrablokk RENDERELT szövege is látható szöveg (a megalapozási kapuval azonos mezők)", () => {
  const interactive = {
    sections: [{
      heading: "Gyakorlás",
      probaEnabled: false,
      blocks: [
        { kind: "try", tryKind: "fillBlank", spec: { text: "A Nílus áradása termékeny iszapot hozott.", blanks: ["iszapot"] }, coversConceptIds: ["c1"] },
        { kind: "try", tryKind: "dragSort", spec: { items: ["vetés", "aratás"] }, coversConceptIds: ["c1"] },
      ],
    }],
  } as unknown as Pick<Lesson, "sections">;
  const visible = lessonVisibleText(interactive);
  for (const part of ["Nílus áradása termékeny iszapot", "vetés", "aratás"]) assert.ok(visible.includes(part), `hiányzik: ${part}`);
});

test("szótő-kulcs: ragozott alakok egy kulcsra, töltelékszó és rövid szó kimarad, évszám egészben", () => {
  assert.deepEqual([...termKeys("fogalmat fogalmak")], ["fogalm"]);
  assert.equal(termKeys("akkor amely a az").size, 0);
  assert.deepEqual([...termKeys("Kr. e. 3000 körül, 1456-ban")].sort(), ["1456", "3000"]);
  assert.equal(words("Tigris, Eufrátesz!").length, 2);
});

test("lefedettség és nem-forrás arány: a forrás szótöveiből mennyi jut a szövegbe", () => {
  const source = "Mezopotámia folyóvölgyi civilizáció Tigris Eufrátesz öntözés csatornák";
  const cov = termCoverage(source, "Mezopotámiában öntözőcsatornák épültek.");
  // forrás-kulcsok: mezopo, folyóv, civili, tigris, eufrát, öntözé, csator (7); a szöveg kulcsai: mezopo, öntöző, épülte → 1 egyezés
  assert.equal(cov.total, 7);
  assert.equal(cov.covered, 1);
  assert.equal(cov.pct, 14);
  assert.equal(nonSourceShare(source, "Mezopotámia piramisok fáraók"), 67, "3 kulcsból 2 nincs a forrásban");
  assert.equal(nonSourceShare(source, ""), null);
});

test("ismétlés: a 6 szavas részletek ismétlődő aránya", () => {
  assert.equal(repetitionShare("egy kettő három négy öt hat hét"), 0);
  // 14 szó → 9 hatszavas ablak; a 0. és 1. ablak kétszer fordul elő → 4 ismétlődő előfordulás a 9-ből = 44%.
  const twice = "a folyók között feküdt az ősi ország. a folyók között feküdt az ősi ország.";
  assert.equal(repetitionShare(twice), 44);
});

test("measureLesson: szószám, olvasási idő, blokkok fajtánként, forrás→térkép→lecke lánc", () => {
  const m = measureLesson(lesson, {
    sourceText: "Mezopotámia a Tigris és az Eufrátesz között feküdt. Az öntözés csatornákkal történt.",
    concepts: [{ term: "Mezopotámia", definition: "folyóvölgyi terület a Tigris mentén", quote: "Mezopotámia a Tigris és az Eufrátesz között" }],
  });
  assert.equal(m.sections, 1);
  assert.equal(m.blocks, 4);
  assert.deepEqual(m.blocksByKind, { explain: 1, example: 1, check: 1, recap: 1 });
  assert.equal(m.visibleWords, words(lessonVisibleText(lesson)).length);
  assert.equal(m.readingMinutes, Math.round((10 * m.visibleWords) / 120) / 10);
  // forrás-kulcsok („között” töltelékszó): mezopo, tigris, eufrát, feküdt, öntözé, csator, történ (7)
  assert.equal(m.sourceInMapPct, 43, "a térkép 3 kulcsot tart: mezopo, tigris, eufrát");
  assert.equal(m.sourceInLessonPct, 57, "a lecke 4 kulcsot tart: + feküdt");
  assert.equal(m.repetitionPct, 0);
});

test("tény-kulcsok: számok, a fogalom neve, tulajdonnevek — kötőszó és mondatkezdő szó nem", () => {
  const keys = factKeys({ term: "Hunyadi János", definition: "Kormányzó 1446-tól. A nándorfehérvári diadal után Szilágyi Mihály segítette.", quote: "tovább látjuk, amilyen 3,5" });
  // Review #213 (spec-javítás): a fogalomnév MINDEN szava kulcs, a rövid is — fogalomnév: hunyad, jános; számok: 1446, 3.5;
  // tulajdonnév (nem mondatkezdő): szilág, mihály
  assert.deepEqual([...keys].sort(), ["1446", "3.5", "hunyad", "jános", "mihály", "szilág"]);
});

test("review #213: a rövid nevű fogalom („gumó”, „sejt”) teljes hiánya csökkenti a tényszintű lefedettséget", () => {
  const concepts = [
    { term: "gumó", definition: "Föld alatti szár.", quote: "", examWeight: "core" },
    { term: "sejt", definition: "Az élőlények egysége.", quote: "", examWeight: "core" },
  ];
  const only = (text: string) => ({ sections: [{ heading: "x", probaEnabled: false, blocks: [{ kind: "explain", text, depth: "what", readAloud: true, coversConceptIds: ["c1"] }] }] }) as unknown as Pick<Lesson, "sections">;
  const both = measureLesson(only("A gumó föld alatti szár. A sejt az élőlények egysége."), { sourceText: "x", concepts });
  const noGumo = measureLesson(only("A sejt az élőlények egysége."), { sourceText: "x", concepts });
  assert.ok((noGumo.requiredFactsPct ?? 100) < (both.requiredFactsPct ?? 0), `a gumó hiánya nem látszott: ${noGumo.requiredFactsPct} vs ${both.requiredFactsPct}`);
});

test("tény-kulcsok: a tankönyvi ábra-/kép-/oldalszám nem tény (mért Zöldségek-eset), a valódi szám igen", () => {
  const keys = factKeys({ term: "gumó", definition: "Föld alatti szár.", quote: "A gumóját fogyasztjuk (4. ábra). Lásd a 12. oldalt és a 3. képen. Kb. 2 kg terem." });
  assert.ok(!keys.has("4") && !keys.has("12") && !keys.has("3"), "ábra-, oldal-, képszám nem tény");
  assert.ok(keys.has("2"), "a valódi adat (2 kg) tény");
});

test("tényszintű lefedettség: a kötőszavak hiánya nem tényhiány (mért Oszthatóság-eset)", () => {
  const concept = { term: "Oszthatóság 3-mal", definition: "Egy szám osztható 3-mal, ha számjegyeinek összege osztható 3-mal.", quote: "8232: 8+2+3+2=15, tovább látjuk, hogy osztható.", examWeight: "core" };
  const short = { sections: [{ heading: "3-mal", probaEnabled: false, blocks: [{ kind: "explain", text: "Oszthatóság 3-mal: a 8232 számjegyeinek összege 8+2+3+2=15, ez osztható 3-mal.", depth: "what", readAloud: true, coversConceptIds: ["c1"] }] }] } as unknown as Pick<Lesson, "sections">;
  const m = measureLesson(short, { sourceText: "x", concepts: [concept] });
  assert.equal(m.requiredFactsPct, 100, "minden szám és a fogalom neve megvan");
  assert.ok((m.requiredConceptTermsPct ?? 0) < 100, "a szótő-mérő a hiányzó kötőszavakat („tovább”, „látjuk”) hiánynak veszi");
});

test("kötelező-fogalom lefedettség: az `extra` (fókuszon kívüli) fogalom nem számít", () => {
  const m = measureLesson(lesson, {
    sourceText: "x",
    concepts: [
      { term: "Mezopotámia", definition: "Tigris és Eufrátesz", quote: "", examWeight: "core" },
      { term: "Piramisok", definition: "Egyiptomi sírépítmények", quote: "", examWeight: "extra" },
    ],
  });
  // kötelező kulcsok: mezopo, tigris, eufrát → mind a leckében
  assert.equal(m.requiredConceptTermsPct, 100);
  const withExtra = measureLesson(lesson, { sourceText: "x", concepts: [{ term: "Piramisok", definition: "Egyiptomi sírépítmények", quote: "", examWeight: "core" }] });
  assert.equal(withExtra.requiredConceptTermsPct, 0, "ha a piramis kötelező, a lecke nem fedi");
});
