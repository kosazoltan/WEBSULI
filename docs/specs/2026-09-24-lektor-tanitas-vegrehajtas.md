# Végrehajtás — lektor-tanítás (ügynöknek)

Terv: `docs/specs/2026-09-24-lektor-tanitas.md`.

1. `source/server/studio/blind-solver.ts`: `BLIND_SOLVER_SYSTEM`, `parseBlindSolutions` (a „NINCS ELÉG ADAT” kimarad), `blindSolutionsPromptBlock`, `sourceHashOf`.
2. `step-runner.ts`: `MapMeta.sourceText` (a `loadMap` a `knowledge_maps.source_text`-et is olvassa); `ensureBlindSolutions` a lektor-lépés előtt — gyorsítótár `job.output.blindSolutions` (forrás-hash), Opus 5.5 `visuals` szabállyal, hiba esetén nélküle; napló az önálló megoldásokról.
3. `step-io.ts`: `lektorReportSchema.solutions` (opcionális, tárolt); `buildLektorPrompt(..., blind)` — vak megoldások blokk, ÖNÁLLÓ MEGOLDÁS, teljes javítási irány, bővített JSON-formátum.
4. `role-skills.ts`: lektor skill átírva ≤ 4800 karakter, a tesztek által rögzített kulcsmondatokkal.
5. Tesztek: `tests/blind-solver.test.ts`; runner-teszt (egyszer fut, nem látja a leckét, gyorsítótár). Meglévő teszt nem módosul.
6. Kapuk: tsc (+test), `npx eslint client/src server --max-warnings 0`, teljes teszt, build; PR → CI → merge → Render/Vercel ellenőrzés.
