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
