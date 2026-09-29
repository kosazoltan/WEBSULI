# Végrehajtás — E szelet: 10 pálya a 6 játékban (2026-09-29)

Terv: `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md` (1–3. döntés, E szelet). Ág: `feat/jatekok-10-palya`
(alap: `origin/feat/palyak-nyelvek-alap`). A Szólétrához (`WordLadderHuEn.tsx`, B szelet) nem nyúlunk; a közös
`gradeLevels.ts` és `GradeLevelPicker.tsx` változatlan, csak használjuk.

## Rögzített döntések (ebben a szeletben)

| # | Döntés |
|---|---|
| D1 | **Pálya csak 3–12. évfolyamon.** Évfolyam nélkül (`null`) és 1–2. évfolyamon a játék a mai módon fut, pályaválasztó nélkül (`levelsActiveForGrade` = hamis → `level = null` → a kezdősáv és az adaptív sáv a régi). |
| D2 | A menü a **legmagasabb feloldott** pályát ajánlja; győzelem után a következőt (`nextSuggestedLevel`). A futás pályáját a futás elején egy ref rögzíti (`runLevelRef`), a menet közbeni menüváltás nem hat rá. |
| D3 | Kezdő sáv: `levelBand(level)`. Futás közben a közös szabály (`nextDifficulty`) mozgatja, utána `clampToLevel(band, level)`. A `createAdaptiveSession` kap egy opcionális `level` paramétert (`reset(grade, level)`); `level` nélkül a viselkedés bitre azonos a régivel. |
| D4 | **Győzelem = a játék meglévő feltétele:** Aszteroida `gameWon && phase==="over"` (12 hullám/boss); Kockavadász `gameWon && phase==="over"` (mind az 5 bánya); Brain Rot `phase==="over" && totalCaught >= 10` (a meglévő napi „sikeres futás” küszöb, `BRAIN_ROT_CLEAR_CATCHES`); Szökőár `phase==="won"`; Tornádó `finishRun(true)` pályás futásban; Villám matek `phase==="won"`. |
| D5 | `gameId`: `asteroid`, `blockcraft`, `brainrot`, `tsunami`, `tornado`, `speedmath`. |
| D6 | **Tornádó:** évfolyam = a Beállítások számmal megadott iskolai szintje, AUTO esetén a közös `classroomStore` évfolyama. Pálya → világszint: az évfolyam `AUTO_GRADE_TABLE`-sorának `from..to` tartományán `from + round((to-from)*(level-1)/9)`. A „Vadászat indítása” és a „Szintek” képernyő változatlan (a meglévő E2E-k erre épülnek); a menüben a választó alatt külön gomb indítja a pályát (`tornado-level-start`). Új, mérsékelt sávfüggő tempó csak pályás futásban: időkeret × `tornadoLevelTimeScale(levelBand(level))` = `1.15 − 0.3·sáv` (1. pálya ×1,105; 10. pálya ×0,865). A „Szintek”-ből indított futás időkerete változatlan. |
| D7 | **Villám matek:** `ROUND_SECONDS`/`TARGET_CORRECT`/`QUESTION_SECONDS` változatlan. A kérdésidő a meglévő `questionSecondsForBand` (20 s alsó határ marad). Feladat-nehézség a sávon át: 3 jelölt (tanári bank vagy sablon, a meglévő 68%-os arány és no-repeat szerint), számjegy-komplexitás szerint rendezve, a sáv választ indexet (`pickByBand`): alacsony sáv → a legkisebb számok, magas sáv → a legnagyobbak. |
| D8 | **Szökőár:** új, mérsékelt sávfüggő tempó: a víz emelkedése × `tsunamiWaterPace(band)` = `0.85 + 0.3·sáv` (1. pálya ×0,895; 10. pálya ×1,135). Pálya nélkül (D1) a szorzó 1 (a mai viselkedés). A nehézség-gombok maradnak. |
| D9 | Aszteroida, Brain Rot, Kockavadász: a meglévő sávfüggő tempó hat (spawn-intervallum `1.4 − sáv·0.6`; spawn-ütem `1.4 − sáv·0.55`; időkeret `adaptiveTimeBudget(timeLimit, sáv)`). Új tempóparaméter nem kell. |
| D10 | Mérés: a teszt-hook API (`VITE_ENABLE_GAME_TEST_HOOKS=1`) opcionális `probe()`-ot kap: `{ level, band, ...tempó }`. Élesben nincs benne (a meglévő fordítási kapu). |
| D11 | Elrendezés: a választó a menüben az indítógomb **után** áll, hogy a meglévő „indító görgetés nélkül elérhető” E2E-k (390×844, 360×640, 844×390, 1366×768) ne romoljanak. |

## Lépések

### 1. Tesztek (előbb; a régi kódon buknak)
1. `source/tests/game-levels-wiring.test.ts` — új:
   - `levelTuning`: `levelsActiveForGrade` (null/1/2/13/2.5 → hamis; 3..12 → igaz), `levelStartBand(null, x) === x`, `levelStartBand(l, x) === levelBand(l)`, `levelAdaptBand(b, null) === b`, `levelAdaptBand` a ±0,15-ös sávban, `nextSuggestedLevel`, `pickByBand` (alacsony sáv → legkisebb, magas → legnagyobb komplexitás), `digitComplexity`.
   - `createAdaptiveSession(g, level)` / `reset(g, level)`: kezdősáv `levelBand(level)`, 20 helyes / 20 rossz után is `clampToLevel` sávban; `reset(g)` szint nélkül a régi `startingDifficulty(g)`.
   - `tsunamiWaterPace`: monoton, 0,85–1,15, a 10. pálya > 1. pálya.
   - Játékonkénti bekötés-őr (komment-szűrt forrás, a `game-feedback-wiring-guard` mintája): `useGradeLevel("<gameId>"` hívás; `<GradeLevelPicker` a menüben; a pálya a kezdősávba megy (`reset(…, …level…)` vagy `levelStartBand(`); futás közben `levelAdaptBand(` (Brain Rot, Villám matek); a győzelem `.complete(` hívással old fel.
2. `source/tests/tornado-grade-levels.test.ts` — új: `tornadoWorldLevel(grade, level)` minden 3–12. évfolyamra: 1. pálya = `from`, 10. = `to`, szigorúan növekvő, tartományon belül, `resolveGrades("auto", világszint)` = `[grade]`; érvénytelen évfolyam → `null`; `tornadoLevelTimeScale` monoton csökkenő, 1. pálya > 1, 10. pálya < 1.
3. Futtatás: `node --import tsx --test tests/game-levels-wiring.test.ts tests/tornado-grade-levels.test.ts` → **FAIL** (hiányzó modulok/bekötés). Elvárt: minden új teszt bukik.

### 2. Közös, tiszta modulok
1. `source/client/src/game-engine/levelTuning.ts` — új: `LEVEL_MIN_GRADE=3`, `LEVEL_MAX_GRADE=12`, `levelsActiveForGrade`, `levelStartBand`, `levelAdaptBand`, `nextSuggestedLevel`, `digitComplexity`, `pickByBand`.
2. `source/client/src/game-engine/useGradeLevel.ts` — új hook: `{ active, level, unlocked, select, complete }`, render-közbeni állapot-igazítás évfolyamváltáskor (effekt nélkül).
3. `source/client/src/game-engine/adaptiveSession.ts` — `createAdaptiveSession(classroom, level = null)`, `reset(grade, level = null)`, `answer` után `levelAdaptBand`.
4. `source/client/src/game-engine/tsunamiTiming.ts` — `tsunamiWaterPace(band)`.
5. `source/client/src/lib/tornado/gradeWorld.ts` — új: `tornadoWorldLevel`, `tornadoLevelTimeScale`.
6. `source/client/src/game-engine/game-test-hooks.ts` — `WebsuliGameTestApi.probe?`.

### 3. Játékok bekötése (mindegyiknél: import, `useGradeLevel`, `runLevelRef`, választó az indító után, kezdősáv, győzelem → `complete`, `probe`)
1. `pages/SpaceAsteroidQuiz.tsx` — évfolyam: a lokális `grade`; `startNewRun`: `reset(grade ?? 4, level)`; győzelem-effekt `phase==="over" && gameWon`; probe: `spawnFactor = 1.4 − sáv·0.6`.
2. `pages/BlockCraftQuiz.tsx` — évfolyam: `userGrade`; `beginLevel(resetSession)`: `reset(userGrade ?? 4, level)`; győzelem `gameWon && over`; probe: `timeBudget = adaptiveTimeBudget(LEVELS[0].timeLimit, sáv)`.
3. `pages/BrainRotSteal.tsx` — `startGame`: `difficultyRef = levelStartBand(level, startingDifficulty(userGrade ?? 4))`; `recordDifficultyAnswer`: `levelAdaptBand`; győzelem `over && totalCaught >= BRAIN_ROT_CLEAR_CATCHES`; probe: `paceScale`.
4. `pages/TsunamiEscapeEnglish.tsx` — `startGame`: `reset(userGrade ?? 4, level)`; víz: `× (runLevel == null ? 1 : tsunamiWaterPace(band))`; győzelem `phase==="won"`; probe: `waterPace`, `quizSeconds`.
5. `pages/TornadoHunter200.tsx` — `MenuScreen`: választó + „N. pálya indítása” gomb; `PlayScreen` új `gradeLevel` prop; `createAdaptiveSession(primaryGrade, gradeLevel)` és `reset(primaryGrade, gradeLevel)`; időkeret `runTimeLimit`; `finishRun(true)` → `onGradeLevelWin`; probe: `worldLevel`, `timeLimit`.
6. `pages/SpeedQuizMath.tsx` — `pickTask(level, seen, band)` 3 jelölttel + `pickByBand`; `startGame`: `levelStartBand`; `recordDifficultyAnswer`: `levelAdaptBand`; győzelem `phase==="won"`; probe: `questionSeconds`.

### 4. Kapuk (a `source/`-ban)
`npx tsc --noEmit` · `npx tsc --noEmit -p tsconfig.test.json` · `npm run lint` · `node --import tsx --test tests/*.test.ts` · `npm run build` — mind PASS.

### 5. Böngésző (Playwright, `channel: "chrome"`, 390×844)
Vite: `npx cross-env VITE_ENABLE_GAME_TEST_HOOKS=1 vite --port 5197 --strictPort`. Szkript a scratchpadben:
mind a 6 játék menüje (évfolyam 7): a `level-picker` látható, a `level-2` zárt (`disabled`), a `level-1` kiválasztható;
`scrollWidth − clientWidth ≤ 2`; a választó gombjai nem fedik egymást és nincs levágott felirat; a feloldott
10. pálya (localStorage `websuli.levels.<gameId>.7 = 10`) és az 1. pálya futásának `probe()`-ja → mért különbség.
A meglévő `game-viewport-experience`, `game-win-paths`, `games-touch-controls` E2E ugyanezen a szerveren (scratch config) zöld.
Képek: `…/scratchpad/palyak-*.png`. A végén az 5197-es port folyamatfája leállítva.

### 6. Commit, sentinel, push
Atomi commitok (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); külön hívásban
`date +%s > <munkafa>/.audit-ok && date +%s > /d/repo/WEBSULI/.audit-ok`; `git push -u origin feat/jatekok-10-palya`. PR nincs.
