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
   - A4: `gradedLadderBank(items, grade)` évfolyam-sávonként: a sáv minden fokozatán ≥ 10 szó-tétel, és az 1–2. alfokon ≥ 1
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
   - `stepBuckets = useMemo(ladderStepBuckets(allTiers, lang))`; a választó: `windowLadderSteps(stepBuckets, grade)` vödrökön
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

## Mért számok (kitöltendő a végrehajtás közben)

- S1: tesztek, a vödör-számok (A2 / A4 legkisebb értéke) — ld. alább.
