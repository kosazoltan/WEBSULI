# Régi anyagok Stúdió-leckévé — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md`. Munkakönyvtár: `source/`. Ág: `feat/regi-anyag-studio`.

1. **`server/studio/pipeline-store.ts`:**
   - `PublishInput.targetHtmlFileId?: string`;
   - a `publishLesson` ágai:
     - ha a leckének nincs `htmlFileId`-je, és van cél: a cél sorát `for update` olvassa;
     - ha a cél nem létezik, vagy már `lesson`: hiba (a tranzakció visszagördül);
     - mentés a `materialImprovementBackups`-ba (`backupData`: a régi mezők, `notes: "legacy-studio-migration"`);
     - utána ugyanaz a frissítés, mint a meglévő `fileId` ágon, plusz `content: LESSON_PLACEHOLDER_HTML`.
2. **`server/studio/single-run/engine.ts`:**
   - `SingleRunInput.targetHtmlFileId`;
   - a job kimenetébe kerül (442. sor körül, az `ownerInstruction` mellé);
   - a `publishLesson` hívás a kimenetből olvassa (a folytatott futás is).
3. **`server/studio/single-run/live.ts` `runSingleUpload`:** továbbadja a `targetHtmlFileId`-t.
4. **`server/studio/lesson-pipeline-routes.ts`:** a `runOneStep` / `runOneStepCore` belső paraméterként átveszi (a nyilvános kéréssémát
   NEM bővítjük: csak a szerveroldali sor használja).
5. **`server/studio/legacy-migration.ts` (új):**
   - a kapcsoló (`LEGACY_MIGRATION_MODE`), a próba-azonosítók, a határnap, a párhuzamosság;
   - tiszta függvények (tesztelhetők):
     - `legacyCandidates(rows, mode)`: a szűrés, a kihagyás okai, a sorrend;
     - `reconcile(job, target, run)`: `done` | `retry` | `error` | `running`;
     - `legacySource(file)`: a szövegforrás és az utasítás;
   - `tick()` 60 másodpercenként:
     - egyeztetés, utána a szabad helyek feltöltése (`scheduled_jobs` sorok);
     - indítás: `startOneStepRun`-nal azonos módon a `runOneStep` (workflow, lízing) a cél-azonosítóval;
   - indítás a `server/index.ts`-ből, az e2e-módon kívül.
6. **Teszt** (`tests/regi-anyag-studio.test.ts`):
   - jelöltszűrés (határnap, `pdf`, méret, `lesson`, sorrend, `off` / `pilot` / `all`);
   - egyeztetés;
   - forrásszöveg;
   - a `publishLesson` célágának tiszta része (a mentésrekord alakja).
7. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`, háromfázisú ellenőrzés.
8. **Indítás:**
   - összevonás `pilot` kapcsolóval (AKTIV=0 mellett), majd a 3 próba mérése (költség, idő, valódi böngészős ellenőrzés: a lecke, a
     kiértékelés és az eredmény-e-mail útja);
   - utána egy PR `all`-ra; onnan a sor éjszaka fut.
