import assert from "node:assert/strict";
import test from "node:test";

import { createSeenHistory } from "../client/src/game-engine/vocab/seenHistory";
import { createVocabSource } from "../client/src/game-engine/vocab/vocabSource";
import { meaningKeys } from "../client/src/game-engine/vocab/questionGenerator";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { makeSyntheticBank, memoryStorage, seededRng } from "./support/vocab-fixture";

/**
 * S13 / átfogó review L2: azonos magyar jelentésű szinonimák (pl. „nagymama” = grandmother / granny) egy futáson belül
 * ne jöjjenek egymás után ugyanazzal a prompttal, más helyes válasszal. A forrás az utoljára kérdezett bejegyzések
 * jelentés-kulcsait (`meaningKeys`) kerüli, amíg van más jelölt; ha nincs, a régi sorrend marad (nem fogy ki).
 */

test("szintetikus bank: két azonos hu-jú bejegyzés közül egy futásban csak az egyik jön (amíg van más jelölt)", () => {
  const bank = makeSyntheticBank("en", [30, 0, 0, 0, 0], 3);
  // a 0. és az 1. bejegyzés jelentése azonos lesz
  bank[1] = { ...bank[1]!, hu: bank[0]!.hu };
  const shared = new Set(meaningKeys(bank[0]!.hu));
  for (let seed = 1; seed <= 40; seed++) {
    const source = createVocabSource({ lang: "en", entries: bank, history: createSeenHistory(memoryStorage()), rng: seededRng(seed) });
    const asked: string[] = [];
    for (let i = 0; i < 20; i++) {
      const q = source.next(0);
      assert.ok(q, `seed ${seed}: elfogyott`);
      asked.push(q.vocabId);
    }
    const hits = asked.filter((id) => {
      const e = bank.find((b) => b.id === id)!;
      return meaningKeys(e.hu).some((k) => shared.has(k));
    });
    assert.ok(hits.length <= 1, `seed ${seed}: azonos jelentés kétszer egy futásban (${hits.join(", ")})`);
  }
});

test("valódi angol bank (L1): 40 kérdéses futásban nincs két azonos jelentés-kulcsú bejegyzés", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const source = createVocabSource({ lang: "en", entries: VOCAB_EN, history: createSeenHistory(memoryStorage()), rng: seededRng(seed) });
    const seenKeys = new Map<string, string>();
    for (let i = 0; i < 40; i++) {
      const q = source.next(1);
      assert.ok(q);
      const e = VOCAB_EN.find((b) => b.id === q.vocabId)!;
      for (const k of meaningKeys(e.hu)) {
        assert.ok(!seenKeys.has(k), `seed ${seed}: „${k}” kétszer (${seenKeys.get(k)} és ${e.id})`);
        seenKeys.set(k, e.id);
      }
    }
  }
});

test("ha minden jelölt ütközne, a forrás akkor is kérdez (nem fogy ki)", () => {
  // a 0. szint mind a 10 bejegyzése azonos jelentésű; a rossz válaszok a többi szintről jönnek
  const bank = makeSyntheticBank("en", [10, 10, 10, 0, 0], 5).map((e) => (e.level === 0 ? { ...e, hu: "ugyanaz" } : e));
  const source = createVocabSource({ lang: "en", entries: bank, history: createSeenHistory(memoryStorage()), rng: seededRng(2) });
  for (let i = 0; i < 4; i++) {
    const q = source.next(0);
    assert.ok(q, `#${i + 1}: nem kérdezett`);
    assert.equal(bank.find((b) => b.id === q.vocabId)!.level, 0, "a kért szint helyett máshonnan kérdezett");
  }
});
