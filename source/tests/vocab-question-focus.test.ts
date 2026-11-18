import assert from "node:assert/strict";
import test from "node:test";

import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { generateVocabQuestion, type VocabQuestionType } from "../client/src/game-engine/vocab/questionGenerator";
import { createRng, seedFrom } from "../shared/game-rng";

/**
 * Szóbank célrésze (`VocabQuiz.focus`, docs/specs/2026-11-17-szoletra-olvashatosag.md D): a kérdés ADATÁBÓL jön, minden
 * kérdéstípusnál a prompt rész-szövege — magyar→cél: a magyar szó; cél→magyar: a célnyelvi szó; mondat-jelentés: a mondat;
 * hiányos mondat (játék- és teljes alak): a mondat a hiánnyal. A teljes bankon, mindhárom nyelven.
 */

const TYPES: VocabQuestionType[] = ["hu-to-target", "target-to-hu", "cloze", "phrase-meaning"];

test("minden generált kérdésnek van célrésze, és az a prompt rész-szövege a típus szabálya szerint (teljes bank, 3 nyelv)", () => {
  for (const [lang, bank] of [["en", VOCAB_EN], ["de", VOCAB_DE], ["fr", VOCAB_FR]] as const) {
    const rng = createRng(seedFrom("focus", lang)).next;
    let n = 0;
    for (const entry of bank) {
      for (const type of TYPES) {
        for (const clozeStyle of type === "cloze" ? (["game", "full"] as const) : (["game"] as const)) {
          const q = generateVocabQuestion(entry, bank, type, rng, { clozeStyle });
          if (!q) continue;
          n += 1;
          assert.ok(q.focus, `${q.id}: nincs célrész`);
          assert.ok(q.prompt.includes(q.focus!), `${q.id}: a célrész nincs a promptban`);
          if (type === "hu-to-target") assert.equal(q.focus, entry.hu);
          if (type === "target-to-hu") assert.equal(q.focus, entry.term);
          if (type === "phrase-meaning") assert.equal(q.focus, entry.example);
          if (type === "cloze") assert.match(q.focus!, /_{3,}/, `${q.id}: hiányos mondatnál a hiány a célrészben`);
          if (type === "cloze" && clozeStyle === "game") assert.equal(q.focus, q.prompt, "játék-alakban a prompt maga a mondat");
        }
      }
    }
    assert.ok(n > 1000, `${lang}: ${n} kérdés`);
  }
});
