# Ciklus 7 — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus7-pontos-alak.md`.

1. **`shared/answer-key-calibrate.ts`:** `CalibrationOptions.exactForms?: boolean` (magyar lecke); a `tighten`-ben a szó- és csoportlépés
   után, ha `!fixed && isBlocking && exactForms`: `exactFormGroup(sample, okCorrect, wrongText)` — a minta tokenjei közül az, amelynek
   pontos alakja a hibásban nincs, de a tövezett alakja igen (`missingAnswerConcepts` szerint a hibás tartalmazza); a csoport = a minta
   és a helyes próbák pontos alakjai ennél a tőnél; felvétel `requiredPhrases`-be, `tightenedPhrases`-be, `szigorítás (pontos alak):`.
2. **`server/studio/experience-builder.ts`:** a kalibráció `exactForms: !language` (`calibrationOptionsFor` bővítve).
3. **Teszt:** `tests/ciklus7-pontos-alak.test.ts` — „anyával” / „anyának” eset; más szó nem vált ki; lektorReviewed → nincs; séma OK.
4. **Célzott újragyártás 2. köre:** `LEGACY_REDO_ROUND = 2`, a `redo` jelző körszám (`redoRoundOf`: a régi `true` = 1. kör); körönként
   egyszer; a ciklus-6-os teszt elvárása ennek megfelelően (dokumentált spec-változás).
5. **Ciklus-kapu:** `LEGACY_BATCH_LIMIT` 132 → 137 (a tényleges 132 sorelem + 5; dokumentált spec-változás).
6. **Review #359:** `sharesStem` (elütéstűrés nélküli közös tő), a minta szavát tartalmazó kötelező csoport más tövű, helyes próbákkal igazolt alternatívái; 80 karakteres korlát; `CALIBRATION_VERSION` a bank-csomag hash-ében (a régi mentett csomag nem kerül át kalibrálatlanul); a régi `redo: true` teszttel.
