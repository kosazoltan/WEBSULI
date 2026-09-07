import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedback,
  type QuizLike,
} from "../client/src/game-engine/feedback";

/**
 * G-1 — a tanulási visszacsatolás motorja.
 *
 * Why this module exists at all: measured on 2026-09-07, not one of the seven games
 * told a child WHY an answer was wrong. Every game punished (life, water, time, XP)
 * and moved on, which leaves the wrong idea in place — the opposite of what a
 * teaching product is for. The lesson schema has carried per-option feedback since
 * LS-2; the games never got it.
 *
 * The rule this suite protects: a wrong answer ALWAYS produces a sentence that
 * teaches. Not "helytelen", not "a helyes válasz a 2." — a sentence. When the quiz
 * bank has no explanation, the fallback still has to say something true and useful,
 * because a missing explanation in the data must never become a missing explanation
 * for the child.
 *
 * Pure and deterministic, so the same answer always earns the same words: a child
 * who retries a question must not be told two different stories.
 */

const QUIZ_WITH_EXPLANATION: QuizLike = {
  prompt: "Melyik szó jelentése 'alma'?",
  options: ["apple", "orange", "pear", "plum"],
  correctIndex: 0,
  explanation: "Az 'apple' az alma; az 'orange' a narancs.",
};

const QUIZ_WITHOUT_EXPLANATION: QuizLike = {
  prompt: "Mennyi 7 × 8?",
  options: ["54", "56", "48", "64"],
  correctIndex: 1,
};

test("helyes válasz: nincs újrapróbálkozás, a kártya megerősít", () => {
  const card = buildFeedback({ quiz: QUIZ_WITH_EXPLANATION, chosenIndex: 0, attempt: 0 });

  assert.equal(card.outcome, "correct");
  assert.equal(card.retryable, false, "a helyeset nem kell újra megoldani");
  assert.equal(card.correctAnswer, "apple");
  assert.ok(card.headline.length > 0);
});

test("rossz válasz: a MIÉRT sosem üres, ha a bank hoz magyarázatot", () => {
  const card = buildFeedback({ quiz: QUIZ_WITH_EXPLANATION, chosenIndex: 1, attempt: 0 });

  assert.equal(card.outcome, "wrong");
  assert.ok(card.why.includes("apple"), "a magyarázat a bankból jön");
  assert.equal(card.correctAnswer, "apple");
});

test("rossz válasz magyarázat nélküli bankon is tanít", () => {
  const card = buildFeedback({ quiz: QUIZ_WITHOUT_EXPLANATION, chosenIndex: 0, attempt: 0 });

  assert.equal(card.outcome, "wrong");
  assert.ok(card.why.trim().length >= 10, "a tartalék sem lehet üres vagy csonk");
  assert.ok(card.why.includes("56"), "a tartalék mondja ki a helyes választ");
  assert.ok(
    card.why.includes("54"),
    "és nevezze meg, amit a gyerek választott — abból tanul",
  );
});

test("lejárt idő ugyanúgy tanít, mint a rossz válasz", () => {
  const card = buildFeedback({ quiz: QUIZ_WITHOUT_EXPLANATION, chosenIndex: null, attempt: 0 });

  assert.equal(card.outcome, "timeout");
  assert.ok(card.why.trim().length >= 10, "a lejárt idő nem mentesít a tanítás alól");
  assert.ok(card.why.includes("56"));
});

test("az első hiba után jár egy javítási esély, a másodikra már nem", () => {
  const first = buildFeedback({ quiz: QUIZ_WITH_EXPLANATION, chosenIndex: 2, attempt: 0 });
  const second = buildFeedback({ quiz: QUIZ_WITH_EXPLANATION, chosenIndex: 2, attempt: 1 });

  assert.equal(first.retryable, true, "mastery learning: ne bukott kérdéssel lépjen tovább");
  assert.equal(second.retryable, false, "a végtelen próbálkozás már nem tanulás");
});

test("a magyarázat sosem sorszámmal hivatkozik a válaszra", () => {
  const quizzes: QuizLike[] = [QUIZ_WITH_EXPLANATION, QUIZ_WITHOUT_EXPLANATION];

  for (const quiz of quizzes) {
    for (let chosen = 0; chosen < quiz.options.length; chosen += 1) {
      const card = buildFeedback({ quiz, chosenIndex: chosen, attempt: 0 });
      assert.doesNotMatch(
        card.why,
        /\d\.\s*(válasz|lehetőség|opció)/i,
        `"${card.why}" — a sorszám a képernyőn kevert sorrenddel értelmetlen`,
      );
    }
  }
});

test("determinisztikus: ugyanaz a válasz ugyanazt a szöveget kapja", () => {
  const a = buildFeedback({ quiz: QUIZ_WITHOUT_EXPLANATION, chosenIndex: 3, attempt: 0 });
  const b = buildFeedback({ quiz: QUIZ_WITHOUT_EXPLANATION, chosenIndex: 3, attempt: 0 });

  assert.deepEqual(a, b);
});

test("korosztályi sáv a hangnemet váltja, a tartalmat nem", () => {
  const kid = buildFeedback({
    quiz: QUIZ_WITH_EXPLANATION,
    chosenIndex: 1,
    attempt: 0,
    ageBand: "kid",
  });
  const senior = buildFeedback({
    quiz: QUIZ_WITH_EXPLANATION,
    chosenIndex: 1,
    attempt: 0,
    ageBand: "senior",
  });

  assert.notEqual(kid.headline, senior.headline, "a 8 és a 17 éves nem ugyanúgy szólítható meg");
  assert.equal(kid.why, senior.why, "a tananyag viszont ugyanaz marad");
});

test("hibás index nem dönti el a motort", () => {
  const card = buildFeedback({
    quiz: { prompt: "x", options: ["a", "b"], correctIndex: 5 },
    chosenIndex: 0,
    attempt: 0,
  });

  assert.equal(card.outcome, "wrong");
  assert.ok(card.why.trim().length > 0, "romlott bankon sem maradhat néma a visszajelzés");
});
