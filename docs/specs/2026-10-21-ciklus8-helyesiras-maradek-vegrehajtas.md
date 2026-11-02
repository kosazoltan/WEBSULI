# Ciklus 8 — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus8-helyesiras-maradek.md`.

1. **`shared/single-choice-check.ts`:** `textKey` kis- és nagybetű-megtartó (`caseKey`) az ismétlődés-vizsgálatban; a többi norm változatlan.
2. **`server/studio/legacy-migration.ts`:** `LEGACY_REDO_ROUND = 3`; `LEGACY_BATCH_LIMIT = 178`.
3. **Teszt:** a helyesírási opciók (Egri / egri; a Petőfi-iskola három írásmódja) nem ismétlődések, a szó szerinti ismétlődés az;
   a regi-anyag-studio és a ciklus6 teszt rögzített értékei (dokumentált spec-változás).
4. **Review #361:** közös, kérdésfüggő kulcs (`shared/option-key.ts`: `isSpellingPrompt` szűk, Unicode-betűhatáros felismeréssel —
   a „leírás” / „helyesen jellemzi” nem helyesírás; `foldCaseUnlessSpelling`) az ellenőrzőben, a kvíz- és módszersémában és az
   előfeldolgozó `dedupeOptions`-ában; nem helyesírási kérdésnél a sémák szabálya pontosan a régi (a tárolt leckék érvényesek maradnak).
5. **Review #361 (2. kör):** `optionKeyFor` a katalógusban (`itemFingerprint`, `verifyItem`, `verbatimEligible`) és a játék-kvízben (`isPlayableQuestion`); a felismerés a „helyesen leírva / írja helyesen / helyesen van írva” formákat is ismeri.
6. **Mért (élesben, 2026-10-21 16:5x):** a VS Code-anyag „apiKey” / „ApiKey” opciója ismétlődésnek látszott → `caseMatters`: programkód-
   azonosítónál (camelCase) a betűméret kérdéstől függetlenül számít; az „Alma” / „alma” ismétlődés marad. A piszkozat-takarítás MINDEN
   sorelemre kiterjed (anyagonként csak a legutolsó próbálkozás piszkozata látszik — tulajdonosi jelzés: „még mindig vannak elakadt
   draftok”). `LEGACY_REDO` + a VS Code-anyag és Az Erdő („őz” kulcsfogalom tanítatlan) célzott utasítással.
