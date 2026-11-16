import assert from "node:assert/strict";
import test from "node:test";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { findFormInText } from "../client/src/data/vocabBank/validate";
import { meaningKeys } from "../client/src/game-engine/vocab/questionGenerator";
import type { VocabEntry } from "../client/src/data/vocabBank/types";

/**
 * S13 utójavítás (végrehajtás S13, orkesztrátori teendőlista A/3): a kérdés nem lehet tartalmatlan.
 * Szabály (a terv 4.3 „a helyes válasz nem olvasható ki a kérdésből” elvéből):
 *  (a) a `hu` egyik jelentés-kulcsa (`meaningKeys`) nem lehet BETŰRE azonos a névelő nélküli term-mel
 *      (kis-/nagybetű független, ékezet NEM hajlik: „Auto” ↔ „autó” még megengedett nemzetközi szó, „Park” ↔ „park” nem);
 *  (b) a `hu` szövege nem tartalmazhatja a term-et (vagy a névelő nélküli alakját) szóhatáron, ha az legalább 3 betűs.
 * Ilyen bejegyzésnél a „Mit jelent: der Park?” → „park” kérdésre tudás nélkül is jó válasz adható.
 */
const ARTICLE = /^(der|die|das|le|la|les|l'|l’)\s*/iu;
const bare = (term: string): string =>
  term.normalize("NFC").toLowerCase().replace(ARTICLE, "").replace(/[?!.…]+$/u, "").trim();

function contentlessEntries(entries: VocabEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    const b = bare(e.term);
    if (meaningKeys(e.hu).some((k) => k === b)) out.push(`${e.id} — azonos: ${e.term} = ${e.hu}`);
    else if (b.length >= 3 && (findFormInText(b, e.hu) || findFormInText(e.term, e.hu))) {
      out.push(`${e.id} — a hu tartalmazza a term-et: ${e.term} ⊂ ${e.hu}`);
    }
  }
  return out;
}

test("segéd: a szabály a mért eseteket fogja (der Park = park, fair ⊂ „fair, sportszerű”), az ékezetes nemzetközi szót nem", () => {
  const mk = (term: string, hu: string): VocabEntry =>
    ({ id: `de0-city-${term}`, term, hu, kind: "word", level: 0, topic: "city", pos: "noun", example: "X.", exampleHu: "X." }) as VocabEntry;
  assert.equal(contentlessEntries([mk("der Park", "park")]).length, 1);
  assert.equal(contentlessEntries([mk("lila", "lila")]).length, 1);
  assert.equal(contentlessEntries([mk("fair", "fair, sportszerű")]).length, 1);
  assert.equal(contentlessEntries([mk("der Strand", "tengerpart, strand")]).length, 1);
  assert.equal(contentlessEntries([mk("das Auto", "autó")]).length, 0);
  assert.equal(contentlessEntries([mk("die Feuerwehr", "tűzoltóság, tűzoltók")]).length, 0);
});

for (const [lang, entries] of [["en", VOCAB_EN], ["de", VOCAB_DE], ["fr", VOCAB_FR]] as const) {
  test(`${lang}: nincs tartalmatlan (betűre azonos vagy a hu-ban szereplő) bejegyzés`, () => {
    assert.deepEqual(contentlessEntries(entries), []);
  });
}
