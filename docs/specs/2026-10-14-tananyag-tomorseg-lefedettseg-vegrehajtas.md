# Végrehajtás: tananyag tömörsége és lefedettsége (2026-10-14)

Spec: `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md` (tulajdonosi jóváhagyás 2026-10-14). A háromfázisú munkarend
(`docs/agent-haromfazisu-munka.md:9,31`) végrehajtási dokumentuma. Minden parancs a `source/` mappából fut.
Állapot: **S1 kész (ez a PR). S2 külön draft PR — a saját elfogadását nem teljesítette, nem élesíthető.**

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

## S2 — terjedelmi keret (külön draft PR, NEM élesítve)
Mért eredmény (próbaharness, 6 térkép, kötelező-fogalom lefedettség): Mezopotámia 2756→763 szó, 94%→94%; Zöldségek 5485→3284,
93%→93%; Oszthatóság 5661→1171, **89%→80%**. Az E2 (lefedettség nem romlik) matematikai eljárásnál nem teljesül; két
kalibráció után a harmadik tulajdonosi döntés. A szerző 3 friss futása `AIProviderIdleTimeoutError` (120 s) miatt bukott —
ennek javítása (külön feladat) előfeltétele a további megbízható mérésnek.

## S3–S4
Nincs elkezdve (forrásszöveg a szerzőnek; darabolt kinyerés).
