# Végrehajtás: tananyag tömörsége és lefedettsége (2026-10-14)

Spec: `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md` (tulajdonosi jóváhagyás 2026-10-14). A háromfázisú munkarend
(`docs/agent-haromfazisu-munka.md:9,31`) végrehajtási dokumentuma. Minden parancs a `source/` mappából fut.
Állapot: **S1 kész (#210, mergelve). S2 kész — a végső mérés szerint igazolt javítás (lásd lent és a spec végrehajtási naplóját).**

## S1 — mérőeszköz és próbaharness (viselkedésváltozás nélkül)

### T1 — mérőmodul
- Fájl: `source/server/studio/lesson-metrics.ts`
- Lépés: a diák által LÁTOTT szöveg a `client/src/lesson-runtime/LessonRuntime.tsx` mezői szerint (explain szöveg, example
  feladat+lépések+válasz, check kérdés+opciók, recap pontok, animate felirat; a válasz utáni visszajelzés külön); szószám,
  olvasási idő (120 szó/perc), 6 betűs szótő-kulcs lefedettség (forrás→térkép, forrás→lecke), nem-forrás arány, 6 szavas ismétlés.
- Teszt: `source/tests/lesson-metrics.test.ts` — kézzel kiszámolt mini-leckék.
- Parancs: `node --import tsx --test tests/lesson-metrics.test.ts` → `ℹ pass 5`, `ℹ fail 0`.

### T2 — tárolt leckék mérése
- Fájl: `source/scripts/measure/lesson-length-coverage.mts` (csak olvasás, modellhívás nélkül).
- Parancs: `npx tsx scripts/measure/lesson-length-coverage.mts ../docs/measurements/2026-10-14-lesson-length-coverage.json`
- Elvárt kimenet (2026-10-14, review #210 után: ellenőrzött TLS, renderelt try/ábra-szöveg, átlagolt medián):
  `leckék: 43, valós: 36`; valós medián `láthatóSzó: 2394.5`, `olvasásPerc: 20`, `szakasz: 11.5`. A kimenet anonim
  (`lesson: m-<hash>`, `testRun`), belső azonosító és leckecím nélkül.

### T3 — próbaharness
- Fájl: `source/scripts/measure/lesson-trial.mts`
- Lépés: a valódi `buildPedagoguePrompt` / `buildAuthorPrompt` + `callStepModel`, a tulajdonos aktív tanult szabályaival
  (`withPreparationSkill`), a tanítható (`kept`/`edited`) fogalmakkal és a job témafókuszával; DB-írás nélkül; a kapuk
  (`checkCoverageGate`, `checkLessonArc`) és a T1 mérés; a programmezők (mapId/title/subject/classroom) a program értéke;
  hibánál a teljes ok-lánc.
- Parancs: `npx tsx scripts/measure/lesson-trial.mts <címke> <mappa> <mapId,...>` (fizetős modellhívás).
- Review #210: a VALÓDI éles prompt-feloldást használja (`skilledPromptLookup` + `studioPromptStore`, mint
  `step-runner.ts:264-285` — a szerep-skill is a promptban), a TÉRKÉP tulajdonosának aktív tanult szabályait, ellenőrzött
  TLS-t; ha bármely térkép hibázik, nem-nulla kilépési kód.
- Elvárt kimenet: soronként `<szó> szó, <n> fejezet, forrás→lecke <p>%, nem-forrás <p>%, kapu OK|BUKOTT, ív OK|BUKOTT`.

### T4 — kapuk
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build` → exit 0.

## S2 — terjedelmi keret

### T5 — terjedelmi keret
- Fájl: `source/shared/lesson-length.ts` — `lessonLengthBudget({classroom, concepts})`: fejezetszám `clamp(ceil(kötelező/3), 2, 12)`,
  szókeret 70/90/110/130 szó/fogalom (1–4. / 5–6. / 7–8. / 9+), plafon 1600/2600/3200/3800, alsó határ 250, tűrés 1,2×.
- Teszt: `tests/lesson-length.test.ts`. Parancs: `node --import tsx --test tests/lesson-length.test.ts` → `ℹ fail 0`.

### T6 — tervező és szerző prompt
- Fájlok: `source/server/studio/step-io.ts` (TERJEDELMI KERET; feltételes sablon-fejezetek; TÖMÖR ÉS TELJES; PRÓBA csak ≥ 5 checknél,
  `"probaEnabled": boolean` minta; A TÖMÖRÍTÉS NEM BONT KAPUT; TÉNYVÉDELEM), `source/server/studio/role-skills.ts` (tervező 2. lépés,
  szerző 5–5b. lépés), `source/shared/lesson-experience.ts` (a METHOD szerződés 1. pontja: „mély” → „tömör, érthető”).

### T7 — tényszintű mérés
- Fájl: `source/server/studio/lesson-metrics.ts` — `requiredConceptTermsPct`, `factKeys`, `requiredFactsPct` (számok, fogalomnév,
  tulajdonnevek; tankönyvi ábra-/kép-/oldalszám nélkül). Teszt: `tests/lesson-metrics.test.ts`.

### T8 — végső mérés
- Parancs: `npx tsx scripts/measure/lesson-trial.mts <címke> <mappa> <6 térkép>` mindkét ágon, majd
  `npx tsx scripts/measure/rescore-trials.mts <mappa> fbase,fs2`.
- Eredmény: `docs/measurements/2026-10-14-s2-final-trial.json` — Mezopotámia 2530→792 (−69%), Oszthatóság 3891→954 (−75%),
  Egyiptom 4259→3395 (−20%), Zöldségek 3771→3154 (−16%); a kötelező tények minden párosított térképen változatlanok
  (100/100/98/100%); kapu nem romlott (Zöldségek BUK→OK).

## S3–S4
Nincs elkezdve (forrásszöveg a szerzőnek; darabolt kinyerés).
