# Szólétra szintezés — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-22-szoletra-szintezes.md`](2026-11-22-szoletra-szintezes.md) (teljes útvonal:
`docs/specs/2026-11-22-szoletra-szintezes.md`). **Ág:** `feat/szoletra-szintezes`, munkafa
`.claude/worktrees/szoletra-szintezes` (`origin/main` 0645f48f-ről). Push / PR / merge: az orkesztrátor.

Parancsok a `source/` mappából (Windows: `npx.cmd`, `npm.cmd`). Fizetős AI-hívás TILOS.

## S1 — mérce, osztályozás, évfolyam-sávos bank, lépés-szabály (tiszta modul + teszt)

1. **Bukó teszt előbb:** `source/tests/word-ladder-grading.test.ts` — importálja a még nem létező
   `../client/src/lib/wordLadderGrading` modult. Esetek (terv 6. A1–A8, A12):
   - A1/A3: `ladderItemStep` mindhárom nyelv kézi bankján (`WORD_LADDER_EN/DE/FR`) és szóbankján (`VOCAB_EN/DE/FR`,
     `vocabEntryStep`): véges pont, 0–14, `floor(step/3) ≥ tier`; pont ≥ 20 → szint ≥ 1, ≥ 40 → ≥ 2.
   - A2: fokozat-szintenként az átlagpont szigorúan nő; nyelv × szint × alfok ≥ max(10, 5 %).
   - A4: `gradedLadderBank(items, lang, grade)` évfolyam-sávonként: a sáv minden fokozatán ≥ 20 tétel, a 0. alfokon ≥ 20 szó, a 2. alfokon ≥ 20
     kifejezés-tétel (kézi `phrase` / `everyday` kategória, szóbank `kind: "phrase"`).
   - A5/A6: `ladderStartStep(grade, level)`: 1. pálya = alap×3; pályánként nem csökken; ≤ (alap+1)×3; `ladderGradeWindow`.
   - A7: `createLadderStepSession`: 3 jó → +1; 2 rossz → −1; jó-jó-rossz-jó-jó → nem nő; sávban marad (12 jó / 12 rossz).
   - A8: 3. évfolyam, pálya 1–10, 200 véletlen válaszsorozat (seedelt): a választott tételek (`pickUnseen` a sávra vágott
     vödrökön) fokozata ≤ 5.
   - A12: `LADDER_STEP_OVERRIDES` kulcsai létező kézi azonosítók, értékük 0–14.
   Futtatás: `npx.cmd tsx --test tests/word-ladder-grading.test.ts` → **várt: bukik** (hiányzó modul).
2. **Kód:** `source/client/src/lib/wordLadderGrading.ts` a terv 4.1–4.4 szerint:
   `LADDER_LETTER_FACTOR`, `LADDER_CATEGORY_WEIGHT`, `ladderDifficultyInput`, `ladderDifficultyScore`, `LADDER_TIER_FLOORS`,
   `LADDER_SUB_CUTS`, `LADDER_STEP_OVERRIDES` (üres), `LADDER_STEP_COUNT = 15`, `ladderItemStep`, `vocabEntryStep`,
   `ladderGradeWindow`, `ladderStartStep`, `createLadderStepSession`, `ladderStepBuckets`, `windowLadderSteps`,
   `gradedLadderBank`, `LADDER_GRADE_BANDS`. Csak relatív importok (node-teszt).
3. Futtatás: `npx.cmd tsx --test tests/word-ladder-grading.test.ts` → **várt: mind zöld**. Ha az A2 / A4 küszöb nem teljesül,
   a mért számot a tervbe kell írni, és a terv döntése szerint (nem a teszt gyengítésével) kell javítani.

## S2 — bekötés a játékba

4. `source/client/src/lib/wordLadderLevels.ts`: `ladderTierForLevel(grade, level)` = `floor(ladderStartStep(grade, level) / 3)`
   (dokumentált spec-változás, terv 4.2); a fejkomment frissül.
5. `source/tests/word-ladder-levels.test.ts`: a „6. döntés: … 10. pálya = legfelső szint” teszt az új szabályra
   (cím: „SPEC-VÁLTOZÁS 2026-11-22”); az ismétlés-mentességi teszt az új választóval (`createLadderStepSession` +
   `windowLadderSteps(ladderStepBuckets(...))`) — a régi változat is marad mellette (a `createLadderLevelSession` továbbra is
   exportált, más teszt használja).
6. `source/client/src/pages/WordLadderHuEn.tsx`:
   - `levelSessionRef` → `stepSessionRef = useRef(createLadderStepSession(4, 1))`; `onOutcome`: `.answer(correct)`;
     `startGame`: `.reset(grade, level)`, `runTierRef.current = floor(step / 3)`.
   - szóbank-készlet: a `toLadderItem(q)` eredménye a `q.focus`-szal (besoroláshoz).
   - `termFloors = buildLadderTermFloors({ manual: WORD_LADDER_BANKS[lang] (TELJES kézi bank), vocab: a TELJES szóbank `{ id, term }` },
     lang)`; `stepBuckets = useMemo(ladderStepBuckets(allTiers, lang, termFloors))` — a korlát soha nem a szűrt készletből (terv 15.);
     a választó: `windowLadderSteps(stepBuckets, grade)` vödrökön
     `pickUnseen(..., step, ...)`; tartalék a teljes vödörsor.
   - probe: `ladderStep` (a futás fokozata) és `questionStep` (a nyitott kérdés fokozata, azonosító szerint).
7. `source/tests/word-ladder-play.spec.ts` új eset (A9): `websuli.classroomGrade = 3`, friss tároló (1. pálya),
   `?seed=5&wall=60`, a teszt-kampós `data-correct="true"` fogással 12 helyes válasz; probe `questionStep` mind ≤ 5, az első
   ≤ 2, az utolsó > az első.
8. Ellenőrzés:
   - `npx.cmd tsx --test tests/word-ladder-grading.test.ts tests/word-ladder-levels.test.ts tests/no-repeat.test.ts`
     és a többi `tests/word-ladder-*.test.ts` → zöld;
   - `npx.cmd tsc --noEmit` → 0 hiba;
   - `npm.cmd run test:e2e -- tests/word-ladder-play.spec.ts` (Chrome 158 / Playwright 1.57 „Target page … closed” hiba
     környezeti — jelezni, nem megkerülni);
   - a munkafa gyökeréből `npm run gate:stage` → zöld.
9. Commitok (atomi, `git commit -F <scratchpad-fájl>`): docs → S1 → S2. Csapda-bejegyzés `C-SZL-1` ideiglenes sorszámmal a
   `docs/agent-csapdak.md`-be, ha a munka közben hiba / tévút történt.

## Döntések és PR-bontás (2026-11-22)

- ND-1 (a) évfolyam-sáv, ND-3 (a) a mérce kezeli — DÖNTÖTT (terv 9. szakasz). ND-2 (b) fizetős generálás — S3, csak külön
  költségkeret-jóváhagyás után (terv 12. szakasz); addig fizetős szolgáltató NEM hívható.
- **PR-1** `feat/szoletra-szintezes-1`: ez a fájl + a terv + `source/client/src/lib/wordLadderGrading.ts` +
  `source/tests/word-ladder-grading.test.ts` + C-SZL-1 (`docs/agent-csapdak.md`) — az éles működés változatlan.
- **PR-2** `feat/szoletra-szintezes-2` (a PR-1-re épül): S2 (4–8. lépés): `wordLadderLevels.ts`, `WordLadderHuEn.tsx`,
  `word-ladder-levels.test.ts`, `word-ladder-3d-wiring.test.ts`, `word-ladder-play.spec.ts`.

## S3 — sűrűbb kezdő A1 anyag (KERETRE VÁR — végrehajtani TILOS a jóváhagyásig)

10. A keret jóváhagyása után: nyelvenként ~300 új 0. szintű szóbank-bejegyzés a terv 12. szakasza szerint, a meglévő
    tartalomszelet-úton (`docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`), futáskorláttal; vak megoldó
    (`node --import tsx scripts/vocab-bank.ts blind-export … / blind-score …`); javító kör.
11. Ellenőrzés: `npx.cmd tsx --test tests/vocab-bank-validate.test.ts tests/word-ladder-grading.test.ts` zöld; a 0–1. fokozat
    egyes-szó-száma nyelvenként ≥ 300 (a terv 11. szakaszának táblája újramérve); a tényleges költség a PR-leírásba.

## Mért számok (2026-11-22)

- **S1:** `tests/word-ladder-grading.test.ts` — előbb bukott (hiányzó modul), a kód után 8/8 zöld. Két küszöb a mért táblából
  javítva (terv 11. szakasz, csapda C-SZL-1): A4 (kifejezés a 2. alfokon), A5 (10. pálya ≤ min(sáv teteje, (alap+1)×3)).
  Mutációs ellenpróba: a sáv felső korlátja 14-re → A5, A7, A8 bukik; a lépés-szabály 1 jó válaszra → A7 bukik.
  Legkisebb fokozat-vödör (kézi + szóbank): de 11. fokozat 9 szó + 132 kifejezés; minden sáv minden fokozata ≥ 20 tétel.
- **S2 (PR-2 ág, nem ez a fej):** `tests/word-ladder-levels.test.ts` — a SPEC-VÁLTOZÁS-teszt az új szabály előtt bukott, utána zöld; az új
  ismétlés-mentességi teszt (évfolyam × pálya, sávon belül) zöld. `tests/word-ladder-3d-wiring.test.ts` a lap új bekötését
  (`createLadderStepSession`, `windowLadderSteps`) követeli (dokumentált spec-változás). A Szólétra 16 egységteszt-fájlja +
  `no-repeat`: 135/135 zöld; `tsc --noEmit` 0 hiba.
- **Böngésző (A9) — a PR-2 ágon mérve** (`feat/szoletra-szintezes-2`, a mérés idején d1f5dbb3; a `source/` bájtra azonos a
  61a47716-tal); ezen a PR-1 fejen a lap még nem hívja a modult, az A9 itt NYITOTT: `npm.cmd run test:e2e -- tests/word-ladder-play.spec.ts --workers=1` → 2 passed (2,5 perc); mért sor: `A9|kérdés-fokozatok: 0,0,0,1,1,1,2,2,2,3,3,3 | futás-fokozat: 0,0,0,1,1,1,2,2,2,3,3,3` (3. évf., 1. pálya, 12 helyes válasz: 0. szintről indul, 3 jó után +1 fokozat, max 3 ≤ 5).
- **`gate:stage`:** a 24 őrteszt közül a `memory-index-guard` („nincs indexeletlen élő memóriafájl”) bukik a
  `memory/notes/00-Index.md` miatt — ezt a `origin/main` 0645f48f (`chore(zaro-hurok)`) hozta be, a munkaág nem érinti a
  `memory/` mappát. Minden más lépés PASS.
- **Vak kör 1 javítása (PR-1, a 0fe24459-re építve):** terv 13. szakasz — osztálytáblázat. Előbb a bukó tesztek (az új
  segédek hiánya miatt az egész fájl piros), utána a javítás: `npx.cmd tsx --test tests/word-ladder-grading.test.ts` → 15/15.
  Mutációs ellenpróba (`mutate.mjs` a scratchpadben, szöveges csere + `cmp` visszaállítás): M1 locale → csak O1/L2 bukik; M2
  francia elízió → O1/L3; M3 nyers út mondat=false → O2/L4; M4 régi célrész-szabály → O2/L5; M5 bankközi korlát ki → O2/L1;
  M6 reset sorozat-nullázás nélkül → O4/L7.
- **PR-2 a vak kör 1 javításával** (a `feat/szoletra-szintezes-1` beolvasztva): a lap a bankközi korlátot a teljes szóbankból
  építi (`ladderTermFloors` + `vocabFloorSources`; `word-ladder-3d-wiring.test.ts` új állításai előbb bukottak, utána zöldek).
  Egységtesztek (Szólétra + `no-repeat`): 142/142; `tsc` (alkalmazás és tesztek) 0 hiba. Böngésző ezen a fejen:
  `npm.cmd run test:e2e -- tests/word-ladder-play.spec.ts --workers=1` → 2 passed (2,4 perc); `A9|kérdés-fokozatok: 0,0,0,1,1,1,2,2,2,3,3,3 | futás-fokozat: 0,0,0,1,1,1,2,2,2,3,3,3`.
- **Vak kör 2 javítása (PR-1, az e2d8c86d-re építve):** terv 14. szakasz (szerződés, invariáns, osztálytábla). Előbb 5 új
  teszt bukott (O5 osztály-mérés 4 hibával, O5/L1, O5/L3, O5/L5, O6/L2), majd a határpont-teszt a régi [9, 20] értékkel; a
  javítás után `npx.cmd tsx --test tests/word-ladder-grading.test.ts` → 23/23, a Szólétra-egységtesztek + `no-repeat` 149/149,
  `tsc -p tsconfig.test.json` 0 hiba. Mutációs ellenpróba (`mutate2.mjs`): 5/5 mutáns a saját osztálytesztjén bukik.
- **PR-2 a vak kör 2 javításával** (a `feat/szoletra-szintezes-1` beolvasztva): a lap korlátforrása is a tétel saját szintjét
  használja (`declaredTierOf`; a `word-ladder-3d-wiring.test.ts` új állítása előbb bukott, utána zöld). Szólétra + `no-repeat`:
  150/150; `tsc` 0 hiba. Böngésző: `npm.cmd run test:e2e -- tests/word-ladder-play.spec.ts --workers=1` → 2 passed (2,4 perc),
  `A9|kérdés-fokozatok: 0,0,0,1,1,1,2,2,2,3,3,3 | futás-fokozat: 0,0,0,1,1,1,2,2,2,3,3,3` (a futás után csak típus-aláírás változott:
  `declaredTierOf(item: object, …)`, futásidejű viselkedés nem).
- **Vak kör 3 → tulajdonosi döntés „CSAK STRUKTÚRÁLT MEZŐK” (PR-1, a 130f18e3-ra építve):** terv 15. szakasz. A heurisztikák
  kikerültek, a korlát egyes szóra szűkült és márkázott (teljes bankból). `npx.cmd tsx --test tests/word-ladder-grading.test.ts`
  → 18/18; mutációs ellenpróba (`mutate3.mjs`) 7/7.
