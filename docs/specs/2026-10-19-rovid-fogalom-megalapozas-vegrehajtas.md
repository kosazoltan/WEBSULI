# Rövid fogalomnév megalapozása — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-rovid-fogalom-megalapozas.md`. Munkakönyvtár: `source/`. Ág: `fix/rovid-fogalom-megalapozas`.

1. **`server/studio/grounding.ts` `checkGrounding`:** az üres szólista ágában (`words.length === 0 && !formula`):
   - a kétszavas kifejezés-egyezés igaz eredménye marad;
   - utána `shortTermExamplePresent(phrase, concept.quote ?? "", blockText)` igaz → igaz;
   - különben NEM tér vissza, hanem továbbmegy a meglévő útra. A `< 4 szó` védelem, a definíció-tartalék és az idézetszám-tartalék
     ugyanúgy fut. A `words.every(present)` ág üres szólistánál nem ad igazat (`words.length > 0` feltétel, már most is így van).
2. **Új exportált tiszta függvény `shortTermExamplePresent(term, quote, blockText)`:**
   - a `quote` `[,;:\n]` mentén darabolva, minden darab `normalizeText`;
   - a darabok közül azok számítanak, amelyek ≥ 2 szóból állnak, és a `term` önálló szóként van bennük;
   - ha bármelyik szóhatárosan (` ${darab} `) benne van a ` ${normalizeText(blockText)} ` szövegben → igaz.
   - Az „a = before consonant sounds” típusú darab (`=` jellel) kimarad: csak a `=`-t nem tartalmazó darabokat nézzük, mert ezek
     a magyarázatot adják, nem a példát.
3. **Teszt — `tests/studio-grounding-short-term.test.ts`:**
   - az „an armchair” példát tanító angol blokk;
   - a definíciót („névelő”, „magánhangzó”, „hang”, „előtt”) magyarázó blokk;
   - egy más témájú magyar blokk, benne „a” névelővel → hamis;
   - a „Kr. u. / i. sz.” eset változatlan.
4. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
5. **Kitelepítés:** összevonás előtt az aktív-futás őr = 0.
