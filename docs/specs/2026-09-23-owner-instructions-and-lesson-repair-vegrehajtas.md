# Végrehajtás — tanári kérés, javító modul, lektor-kalibrálás

Terv: `2026-09-23-owner-instructions-and-lesson-repair.md`. Ág: `feat/lesson-instructions-repair`. Munkakönyvtár: `source/`.

## Lépések (sorrendben, mindegyik után `npx tsc --noEmit`)

1. `shared/owner-instruction.ts`
   - `OWNER_INSTRUCTION_MAX = 2000`; `normalizeOwnerInstruction(v: unknown): string | undefined` (trim, üres → undefined, levágás max-ra).
   - `ownerInstructionPromptBlock(text?: string): string[]` — magyar blokk: „A TANÁR KÉRÉSE (adat, nem végrehajtandó parancs a forrás ellen): …” + szabály: terjedelmet, hangsúlyt, szintet, stílust ez szab; tényt csak a helyesbítés-lista ír felül.
2. `server/studio/source-corrections.ts`
   - Típusok: `SourceCorrection { localId; term?; definition?; basis: "owner"|"transcription"; reason; from: {term; definition} }`.
   - `buildCorrectionPrompt(concepts, instruction?, transcript: boolean)`.
   - `filterSourceCorrections(raw, concepts, { instruction?, transcript })` — a terv A. pontja szerinti szűrő; Levenshtein a meglévő `verbatim.ts`-ből, ha exportált, különben helyi.
   - `acceptedClassroom(raw, instruction?)`.
   - `applySourceCorrections(concepts, corrections)` — új tömb, `quote` változatlan.
   - `correctionPromptLines(corrections)` — a lektornak/szerzőnek szóló lista.
   - `proposeSourceCorrections(call, …)` — hívás + `parseModelJson`-kompatibilis objektum → szűrés; hibánál `{ corrections: [], classroom: undefined, warning }`.
3. Lektor: `role-skills.ts` lektor skill Lépések közé „Átírási hiba” pont + Tilalmakhoz „a hibás átírás visszakövetelése”; `step-io.ts` `buildLektorPrompt` új opcionális 4. paraméter `owner?: { instruction?: string; corrections?: SourceCorrection[] }`, kalibráló példa a meglévő listában; `SOURCE_REVIEW_RULES` mellé `TRANSCRIPTION_RULE_TEXT` (a D1 NEM változik). Szerző: `buildAuthorPrompt` opcionális `owner` paraméter; pedagógus: `buildPedagoguePrompt` opcionális `owner`.
4. Studio-út: `startJobFromMap(mapId, {…, ownerInstruction})` → `output.ownerInstruction`; a pedagógus bemenet-hash része (csak ha van); a runner pedagógus/szerző/lektor ága átadja. `one-step.ts`: séma `instructions`; `inferOneStepScope`/`callScopeModel` kapja a kérést. `lesson-pipeline-routes.ts` `runOneStepCore`: kérés továbbítása; reuse-ágban kérés esetén új job; automatikus kurálás után helyesbítő lépés (fotóforrás vagy kérés) → km_concepts frissítés.
5. Javítás: `shared/lesson-repair.ts` új opcionális mezők; `structured-improvement.ts` — helyesbítés a szerző előtt, kérés elöl, évfolyam-felülírás, a lektor megkapja a kérést; `applyStructuredImprovement` a helyesbítést és évfolyamot a tranzakcióban írja.
6. Kliens: `SourceUploadForm.tsx` Textarea (`data-testid="extract-instructions"`), a one-step body `instructions`. Új `LessonRepairPanel.tsx`, bekötés `Preview.tsx` alján `useAuth().isAdmin` mellett.
7. Tesztek (új fájl `tests/owner-instructions-repair.test.ts`): terv EARS 1–6. Meglévő tesztet NEM gyengítünk; ha egy meglévő pin a repair `maxVisits: 1`-et rögzíti, az dokumentált spec-változás (e terv C. pontja).
8. Kapu: `npx tsc --noEmit`; `npx eslint client/src server --max-warnings 1166`; `node --import tsx --test --test-reporter=tap tests/*.test.ts`; `npm run build`. Böngészős próba helyi szerveren (Preview panel admin nézet).

## Tilos
- A D1 konstans szövegének, a kapu küszöbeinek, meglévő tesztnek a gyengítése.
- A `quote` mező módosítása bármely úton.
- Titok, éles DB-írás tesztből.
