import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { FLASHCARD_ID_MAX, lessonFlashcards } from "../shared/lesson-flashcards";

// Websuli Design §3/§6 (docs/specs/2026-10-16-websuli-ismetles.md): a kártyák a lecke saját, ellenőrzött anyagából készülnek.
test("a kvíz felidéző kérdéseiből: előlap a kérdés, hátlap a helyes válasz; az alkalmazó kérdés kimarad", () => {
  const base = fusionFixture();
  // A minta kvízében nincs intent: minden második kérdést alkalmazónak, a többit felidézőnek jelöljük.
  const lesson = { ...base, experience: { ...base.experience!, quiz: base.experience!.quiz.map((q, i) => ({ ...q, intent: i % 2 ? "apply" as const : "recall" as const })) } };
  const cards = lessonFlashcards(lesson);
  const recall = lesson.experience.quiz.filter(q => q.intent === "recall");
  assert.ok(recall.length > 0 && recall.length < lesson.experience.quiz.length);
  // intent nélküli (régebbi) kvíz: minden kérdés felidéző kártya.
  assert.equal(lessonFlashcards(base).length, base.experience!.quiz.length);
  assert.equal(cards.filter(c => c.kind === "quiz").length, recall.length);
  for (const q of recall) {
    const card = cards.find(c => c.id === `q:${q.id}`)!;
    assert.equal(card.front, q.question);
    assert.equal(card.back, q.options[q.correctIndex]);
  }
  assert.ok(cards.every(c => c.id.length <= FLASHCARD_ID_MAX));
  assert.deepEqual(lessonFlashcards(lesson).map(c => c.id), cards.map(c => c.id), "determinisztikus");
});

test("nyelvi leckénél a szószedet is kártya (szó → fordítás); experience nélkül nincs kártya", () => {
  const lesson = fusionFixture();
  const e = { ...lesson.experience!, language: "en-GB", glossary: [{ word: "fire", translation: "tűz", partOfSpeech: "főnév", example: "The fire is hot.", exampleTranslation: "A tűz forró." }] };
  const cards = lessonFlashcards({ experience: e });
  assert.deepEqual(cards.at(-1), { id: "g:0", front: "fire", back: "tűz", kind: "glossary" });
  // Nyelv nélkül a szószedet nem kerül be.
  assert.equal(lessonFlashcards({ experience: { ...e, language: undefined } }).some(c => c.kind === "glossary"), false);
  assert.deepEqual(lessonFlashcards({ experience: undefined }), []);
});
