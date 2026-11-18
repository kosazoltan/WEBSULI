import assert from "node:assert/strict";
import test from "node:test";

import { loadVocabBank, resetVocabBankCache } from "../client/src/data/vocabBank/loader";
import type { VocabLang } from "../client/src/data/vocabBank/types";

/**
 * JM1 / review #447 (vercel 4584953989): a közös szóbank-betöltő (a szójátékok és a JM3b szóbankos párbaja is ezt
 * használja) az ELUTASÍTOTT ígéretet kiveszi a gyorsítótárból (`client/src/data/vocabBank/loader.ts`), így a következő
 * hívás tényleg újra próbál — ezt rögzíti ez a teszt (a betöltő változatlan).
 */
test("loadVocabBank: elutasított betöltés után a következő hívás új próbát indít (nem a gyorsítótárazott hibát adja)", async () => {
  resetVocabBankCache();
  const bad = "xx" as VocabLang;
  const first = loadVocabBank(bad);
  await assert.rejects(first);
  const second = loadVocabBank(bad);
  assert.notEqual(second, first, "a hibás ígéret kikerült a gyorsítótárból");
  await assert.rejects(second);
  // a sikeres betöltés továbbra is gyorsítótárazott
  const ok = loadVocabBank("en");
  assert.equal(loadVocabBank("en"), ok);
  assert.ok((await ok).length > 0);
  resetVocabBankCache();
});
