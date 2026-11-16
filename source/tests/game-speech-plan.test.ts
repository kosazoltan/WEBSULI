import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import { speechAfterOutcome, speechOnShow } from "../client/src/game-engine/play/questionUi";
import { bankPlayQuestion, vocabPlayQuestion } from "../client/src/game-engine/play/questionDirector";
import type { PlayQuestion, QuestionOutcome, QuestionPresentation } from "../client/src/game-engine/play/types";
import { makeSyntheticBank } from "./support/vocab-fixture";
import { generateVocabQuestion, type VocabQuiz } from "../client/src/game-engine/vocab/questionGenerator";

/**
 * Közös utójavítás (#454 / #455 review) — a felolvasás SOHA nem mondja ki a választ a kérdés megjelenésekor; a helyes szó
 * csak a kimenetel után hangzik el; magyar szöveget nem olvas fel idegen nyelvű hanggal. Mind a hét játékra érvényes
 * (a `usePlayQuestion` a `speechOnShow` / `speechAfterOutcome` szerint beszél).
 */

function pres(q: PlayQuestion): QuestionPresentation {
  return {
    id: 1, question: q, isReview: false, windowMs: 4000, slowMo: 0.5, startedAtSimMs: 0, reason: "scheduled",
    options: q.quiz.options.map((label, i) => ({ label, originalIndex: i, correct: i === q.quiz.correctIndex })),
  };
}
const outcome = (result: QuestionOutcome["result"]): QuestionOutcome => ({ id: 1, key: "k", result, pickedOriginalIndex: result === "correct" ? 0 : 1, correctOriginalIndex: 0, responseMs: 900 });

function vq(extra: Partial<VocabQuiz>): VocabQuiz {
  return {
    id: "v1", prompt: "Hogy mondod angolul: alma?", options: ["apple", "pear", "plum", "peach"], correctIndex: 0,
    vocabId: "en1-apple", lang: "en", level: 1, topic: "food", kind: "word", questionType: "hu-to-target", answerTerm: "apple",
    ...extra,
  } as VocabQuiz;
}

test("magyar→cél: megjelenéskor NINCS felolvasás (a régi hiba: a helyes szót mondta ki), a helyes szó a kimenetel után", () => {
  const p = pres(vocabPlayQuestion(vq({ speakAfter: "apple" })));
  assert.equal(p.question.speakText, undefined, "a `answerTerm` nem kerül a megjelenéskori felolvasásba");
  assert.equal(speechOnShow(p), null);
  for (const r of ["correct", "wrong", "timeout"] as const) assert.equal(speechAfterOutcome(p, outcome(r)), "apple");
  assert.equal(speechAfterOutcome(p, outcome("aborted")), null, "megszakított kérdésnél semmi");
});

test("hiányos mondat: a mondat a hiány helyén szünettel hangozhat el, a hiányzó szó csak utána", () => {
  const q = vq({ questionType: "cloze", prompt: "Egészítsd ki: I eat an … every day.", speakText: "I eat an … every day.", speakAfter: "apple" });
  const p = pres(vocabPlayQuestion(q));
  assert.equal(speechOnShow(p), "I eat an … every day.");
  assert.equal(speechAfterOutcome(p, outcome("wrong")), "apple");
});

test("biztonsági háló: ha a forrás mégis a választ adná (vagy tartalmazza), a megjelenéskor nem hangzik el", () => {
  assert.equal(speechOnShow(pres(vocabPlayQuestion(vq({ speakText: "apple" })))), null);
  assert.equal(speechOnShow(pres(vocabPlayQuestion(vq({ speakText: "An apple a day" })))), null);
  assert.equal(speechOnShow(pres(vocabPlayQuestion(vq({ speakText: "  APPLE " })))), null, "kis- / nagybetű, szóköz sem csal");
});

test("cél→magyar: a célnyelvi szó hangozhat el (nem a válasz, mert a válasz magyar)", () => {
  const q = vq({ questionType: "target-to-hu", prompt: "Mit jelent: apple?", options: ["alma", "körte", "szilva", "barack"], speakText: "apple" });
  assert.equal(speechOnShow(pres(vocabPlayQuestion(q))), "apple");
});

test("nyelv nélküli (pl. matek / magyar) tétel: semmit nem olvas fel idegen hanggal", () => {
  const q: PlayQuestion = { ...bankPlayQuestion("speed-quiz-math", { id: "m", prompt: "7 × 8 = ?", options: ["56", "54", "63", "48"], correctIndex: 0 }), speakText: "hét szer nyolc", speakAfter: "56" };
  const p = pres(q);
  assert.equal(speechOnShow(p), null);
  assert.equal(speechAfterOutcome(p, outcome("correct")), null);
});

test("a teljes szóbank-generátor minden típusán: a megjelenéskori szöveg sosem a helyes opció és nem tartalmazza azt", () => {
  const rng = createRng(11);
  let checked = 0;
  const bank = [...makeSyntheticBank("en", [30, 30], 5), ...makeSyntheticBank("de", [20], 6)];
  for (const entry of bank) {
    for (const type of ["target-to-hu", "hu-to-target", "cloze", "phrase-meaning"] as const) {
      const q = generateVocabQuestion(entry, bank, type, rng.next);
      if (!q) continue;
      checked += 1;
      const said = speechOnShow(pres(vocabPlayQuestion(q)));
      const correct = q.options[q.correctIndex]!.toLowerCase();
      if (said) assert.ok(!said.toLowerCase().includes(correct), `${type} ${entry.id}: „${said}” ⊇ „${correct}”`);
      if (type === "hu-to-target") assert.equal(said, null, `${entry.id}: magyar→cél típusnál megjelenéskor nincs felolvasás`);
    }
  }
  assert.ok(checked > 20, `ellenőrzött kérdések: ${checked}`);
});
