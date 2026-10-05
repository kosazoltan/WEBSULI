# Végrehajtás — S1 katalógus-kinyerés
1. `server/catalog/catalog-item.ts`: `CatalogItemDraft` típus + `itemFingerprint`.
2. `server/catalog/legacy-extract.ts`: `inlineScripts`, `literalValue` (AST → érték, csak literál), `walkObjects`,
   `classifyLiteral`, `textSections`, `extractLegacyLesson`.
3. `server/catalog/fusion-extract.ts`: `extractFusionLesson(lessonJson)`.
4. `scripts/catalog/extract-all.mts`: csak olvasó tranzakció; összesítő JSON a docs/measurements alá, teljes lista `.catalog/`.
5. `tests/catalog-extract.test.ts`: a mért formátumok (`{q,a}`, `{q,opts,correct}`, `{q,o,c}`, betűs, kulcsszavas, `{en,hu}`,
   `{kerdes,valaszok,helyes}`), futásidejű objektum kihagyása, hibás szkript, szöveg-szakaszok, fúziós lecke.
6. `.gitignore`: `source/.catalog/`.
