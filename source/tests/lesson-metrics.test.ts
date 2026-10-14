import assert from "node:assert/strict";
import test from "node:test";

import type { Lesson } from "../shared/lesson-schema";
import {
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
  assert.ok(after.includes("Igen, helyes") && after.includes("Két folyó."), "a válasz utáni rész külön mérve");
  assert.ok(!after.includes("Folyóvölgyi"), "a fejezetcím nem válasz utáni szöveg");
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
