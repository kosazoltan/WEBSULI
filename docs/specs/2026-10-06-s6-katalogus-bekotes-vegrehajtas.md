# S6 — végrehajtási utasítás (AI-olvasható)

Spec: `docs/specs/2026-10-06-s6-katalogus-bekotes.md`. Munkakönyvtár: `source/`. Fizetős modellhívás TILOS. Éles DB: csak
`withReadOnlyDb` (BEGIN READ ONLY). Sorrend kötelező; minden lépés után a megadott parancs.

## 1. `server/catalog/retrieval.ts` (új, tiszta)
- Típusok: `CatalogPoolItem = { fingerprint; subject; grade: number|null; topic: string; kind; trust; prompt; options?: string[];
  correctIndex?: number; body?: string; accepted?: string[]; verbatim: boolean; score: number; provenances: string[] }`,
  `CatalogPool = { version: 1; subject; grade; items: CatalogPoolItem[] }`, `CatalogRowLike` (a `catalog_items` olvasott mezői).
- `stems(text)`: NFC, `toLocaleLowerCase("hu")`, `/[\p{L}\p{N}]+/gu`, hossz ≥ 3, töltelékszó-lista nélkül, `slice(0, 6)`.
- `topicMatch(lessonTopic, itemTopic)`: közös tő ≥ 2, vagy ≥ 1 és ≥ fele a tétel-téma töveinek.
- `conceptScore(concept, text)` és `conceptMatches(concept, text)`: a spec képlete (term-tövek mind benne, vagy 2·term + def ≥ 4).
- `verbatimEligible(row, grade, topicOk)`: spec „Szó szerint” feltételei; `verifyItem` újrafuttatva; `isExcludedSample`.
- `buildCatalogPool(rows, { subject, grade, topic, concepts, excludeProvenances? })`: más tantárgy / nem active / kizárt → eldob;
  relevancia (téma- vagy fogalom-egyezés) nélkül → eldob; évfolyam: verbatim-hoz azonos, mintához |Δ| ≤ 1 vagy null; rangsor a
  spec szerint; kvíz ≤ 80, egyéb ≤ 40; szövegmezők levágva.
- `unitCatalog(pool, concepts, { quizTarget, used })`: az egység fogalmaihoz illő szó szerinti kvíz ≤ `min(6, floor(quizTarget/2))`
  (a `used` halmazban lévő lenyomat kimarad és a kiválasztott bekerül), minta ≤ 4; mindegyik kap `conceptId`-t (legjobb fogalom).
- `unitCatalogBlock(unit)`, `planningCatalogBlock(pool)`: magyar, korlátozott hosszú prompt-blokk (5 000 / 4 000 karakter).
- `quizKey(question, options, correctIndex)` és `catalogVerbatimPaths(lesson, pool)`: `experience.quiz[n]` útvonalak.
Ellenőrzés: `npx.cmd tsx --test tests/catalog-s6.test.ts` (a 6. lépés után).

## 2. `server/catalog/s6-context.ts` (új)
- `catalogS6Enabled(env = process.env)`: `env.STUDIO_CATALOG_S6 === "1"`.
- `catalogQueryOf(map)`: `{ subject: subjectKeyOf(map.meta.subject), grade: map.meta.classroom, topic: map.meta.title, concepts }`.
- `planningContextBlock(pool | undefined, subject)`: `subjectSkillBlock(subject, null)` + `planningCatalogBlock(pool)`; üres, ha egyik sincs.
- Ez az EGYETLEN gyártási modul, amely a `../studio/subject-skills`-t importálja.

## 3. `server/studio/experience-builder.ts`
- `ExperienceBuildDeps.catalog?: CatalogPool`.
- `buildLessonExperience` elején `const catalogUsed = new Set<string>()`; az egységek SORRENDBEN előre kiszámolt `unitCatalog`-ja
  (`unitCatalogs[unitIndex]`) — párhuzamos építésnél is determinisztikus.
- `unitTeaching`: ha van egység-katalógus tétele, a `teaching` kap `catalog: { version, fingerprints }` mezőt (hash-be kerül);
  különben a `teaching` VÁLTOZATLAN.
- `buildUnit`: a `system` a `signRules` után kapja a `unitCatalogBlock`-ot; üres katalógusnál a `system` változatlan.

## 4. `server/studio/lektor-view.ts`, `server/studio/step-io.ts`
- `lektorLessonView(lesson, { verifiedPaths, catalogPaths })`: ha `catalogPaths` nem üres, új sor `KATALÓGUS-TÉTELEK (…)`.
- `buildLektorPrompt(..., verifiedPaths, catalogPaths?)` továbbadja.

## 5. `server/studio/step-runner.ts`
- `PipelineStore.loadCatalogRows?(subject: string): Promise<CatalogRowLike[]>`; Drizzle: `select … from catalog_items where
  subject = $1 and status = 'active'`.
- `ensureCatalogPool(job, map, store)`: kapcsoló ki → `undefined`; `job.output.catalog` (azonos subject/grade/topic) újrahasznosul;
  különben betöltés + `buildCatalogPool`, mentés `job.output.catalog`-ba; hiba → `undefined` + warn.
- pedagogue és author: `system += "\n" + planningContextBlock(pool, subject)` (csak nem üres blokknál), a `promptLookup` UTÁN.
- animator → `buildLessonExperience(..., { ..., ...(pool ? { catalog: pool } : {}) })`.
- lektor: `catalogPaths = catalogVerbatimPaths(lesson, pool)` → `buildLektorPrompt`; `startBankVerifier`: a `catalogPaths`
  tételeinek hash-e a `cleared` készletbe.
Ellenőrzés: `npx.cmd tsx --test tests/step-runner*.test.ts tests/experience-builder*.test.ts` (meglévők zöldek, kapcsoló nélkül).

## 6. `tests/catalog-s6.test.ts` (új)
Hamis sorokkal: pool csak az adott tantárgy active sorai (más tantárgy, flagged, review, rejected kizárva); szó szerinti
szabály (parent+azonos évfolyam+téma ✔; pipeline / más évfolyam / téma nélkül / hibás kulcs / 2 opció → csak minta vagy kizárt);
egység-katalógus korlátai és a `used` egyedisége; blokk-hosszkorlát; `quizKey` egyezés → `catalogVerbatimPaths`; kapcsoló;
`lektorLessonView` sor; banképítő: kapcsoló nélkül (nincs `catalog`) a rendszerprompt bájtra azonos, `catalog`-gal a blokk benne van.
Parancs: `npx.cmd tsx --test tests/catalog-s6.test.ts tests/subject-skills.test.ts`.

## 7. `scripts/catalog/ab-replay.mts` (új)
CSAK OLVAS. Jobok + kimenet + jegyzetek + fogalmak + tantárgyi sorok; a spec „protokoll” 1–4. pontja a gyártási függvényekkel;
kimenet: `docs/measurements/2026-10-06-s6-ab-replay.json` (tantárgyanként és összesen, fedett és összes).
Parancs: `npx.cmd tsx scripts/catalog/ab-replay.mts`.

## 8. Záró kapuk
`npx.cmd tsc --noEmit -p tsconfig.test.json`; `npm.cmd run check`; `npm.cmd run lint`; `npm.cmd test`. Commit:
`feat(catalog): S6 — …`, utolsó sor `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push NINCS.
