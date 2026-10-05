# Végrehajtás — S11 forrás-javítás (ügynöknek)

1. `server/studio/ocr.ts`:
   - `UNCERTAIN_MARK = "⟦?⟧"`; `markUnresolvedDisputes(adjudicated, disputes)` — a döntő átiratban a vitatott szakasz (a két olvasat
     > 2 szerkesztésre eltér) végére jel, ha a döntő olvasat a vitatott helyen egyik olvasattal sem egyezik pontosan VAGY a két
     olvasat > 2 szerkesztésre tér el; tiszta függvény, a `dualReadOcr` sikeres ágán hívva.
   - `OCR_ADJUDICATION_PROMPT`: bizonytalan döntésnél az olvasott alak + `⟦?⟧`.
2. `server/studio/role-skills.ts` `ROLE_SKILLS.ocr`: keret / sorrend / nyíl konvenció; a „legközelebbi valós szó” csere helyett
   olvasott alak + `⟦?⟧`. `ROLE_SKILLS.extract` 6. lépés: `⟦?⟧`-es idézetű fogalom definíciója nem értelmezi át a bizonytalan részt.
3. Fogalom-állapot: a kurálás (`autoReviewDecision` / `autoCurateKnowledgeMap`) a `⟦?⟧`-es idézetű fogalmat `pending`-ben hagyja.
4. Szerzői kimenet: a `⟦?⟧` és `[KERET` jelölők kiszűrése / tiltása a gyereknek szóló szövegben (a meglévő forrás-hivatkozás
   ellenőrzés mellé).
5. Tesztek: `markUnresolvedDisputes` (a mért „Kesia, Föld - Felt.” eset), skill-konvenció jelen, `⟦?⟧`-es fogalom pending, jelölő
   nem kerül a leckébe. Teljes unit, tsc, lint.
6. Mérés: a Mezopotámia-fotó OCR-je az új skillel (csak OCR, néhány cent) — `[KERET: társadalom]` sorszámozva, a vitatott sor `⟦?⟧`.

## S11/4 — szótár-őr + erős olvasó (ügynöknek)
1. Függőség: `hunspell-asm` (MIT) + `dictionary-hu` (MPL-1.1) a `source/package.json`-ba (pontos verzió: 4.0.2 / 3.0.0).
2. `server/studio/ocr-lexicon.ts` (új): lusta, egyszer betöltött szótár (`loadModule` → `mountBuffer(aff/dic)` → `create`); tiszta
   `nonWordLines(text, isWord)` → `{ line: number; text: string; words: string[] }[]` — tokenizálás betűkre (kötőjeles szó egyben és
   részenként is próbálva), kivétel: szám, rövid (≤ 2 betű) szó, ⟦?⟧, `[KERET…]`, rövidítés-lista (Kr, e, pl, stb, ill, kb, sz, i, u).
   Ha a nem-szavak aránya > 40 % → üres lista (idegen nyelvű szöveg). Betöltési hiba → `null` (fail-safe, napló „degraded”).
3. `server/studio/ocr.ts`: `verifyNonWords(text, file, strongLines, isWord)` tiszta döntés soronként a spec 3. pontja szerint;
   `strongLines(file, lines)` az erős olvasó (OCR_THIRD_READER_MODEL) célzott újraolvasása: a prompt csak a sorszámokat és a sor
   HELYÉT írja le (pl. „a 3. sor”), a két alap-olvasatot NEM adja meg; válasz: JSON `{ lines: [{ n, text }] }`.
   Bekötés: a `dualReadOcr` végső (settle utáni) szövegén, csak ha `nonWordLines` nem üres; a meglévő S11/2–S11/3 út változatlan.
4. Szerző-skill (`ROLE_SKILLS` author / bank, `role-skills.ts`): „A forrásszöveg értelmetlen, nem létező szavaiból (OCR-zaj) tényt
   kikövetkeztetni tilos.”
5. Tesztek (`tests/ocr-uncertainty-layout.test.ts` mellé új `tests/ocr-lexicon.test.ts`): Kesia-sor erős olvasattal (szótár-helyes)
   → csere; erős olvasat is nem-szó → ⟦?⟧; „sumérok” megerősítve → marad jel nélkül; tiszta szöveg → 0 erős hívás; valódi
   szótárral egy integrációs teszt (Kesia/Lepesztető jelölt, Ázsia/zikkurat nem). Teljes unit, tsc, lint.
6. Mérés: a Mezopotámia-fotó OCR-je (csak OCR + célzott erős olvasás, néhány cent) — a „Kesia, Föld - Felt.” sor nem marad
   jelöletlen nem-szó.

## S11/5 — erős elsődleges olvasó (ügynöknek)
1. Mérés: a 3 kézírásos lap képei a sol-lal (`callOcrModel`, a jelenlegi OCR-skill) → a NYERS átiratok a fixture
   `transcripts["gpt-6.1-sol"]` alá, a `measured` pontszám a `keyTokenRecall` átlagából. Ha < qwen: STOP.
2. `server/ai/models.ts`: `DEFAULT_MODELS.ocr = "gpt-6.1-sol"` (a mérés-kommentbe az új sor), `FALLBACK_MODELS.ocr = qwen3-vl-32b`.
   `OCR_THIRD_READER_MODEL` marad (szótár-őr célzott újraolvasása).
3. `run-extraction.ts` `createCachedSourceOcr`: a harmadik szavazó csak akkor, ha különbözik az elsőtől (`third` = undefined, ha
   `thirdModel === ocrModel`).
4. `role-skills.ts` OCR-skill: márka-/gyártó-felirat kihagyása (egy mondat).
5. Tesztek: a meglévő recall-teszt (változatlan) igazolja; új: a harmadik szavazó elmarad, ha azonos az elsővel. Teljes unit, tsc, lint.
6. Élő futás a Mezopotámia-fotón (engedélyezett, 2026-10-05).
**Módosítva a tulajdonosi döntés szerint:** az 1–2. lépés elmarad (a `DEFAULT_MODELS.ocr` és a `FALLBACK_MODELS.ocr` változatlan); a
3. lépés helyett `createCachedSourceOcr`: első olvasó és döntő = `OCR_THIRD_READER_MODEL`, ha kész; második = a konfigurált OCR-modell;
nincs harmadik szavazó. Ha a sol nincs beállítva: a régi lánc változatlanul.
