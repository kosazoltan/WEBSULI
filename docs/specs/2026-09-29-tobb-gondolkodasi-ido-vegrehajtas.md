# Végrehajtási utasítás: több gondolkodási idő (2026-09-29)

Terv: `docs/specs/2026-09-29-tobb-gondolkodasi-ido.md`. Két ágon, mert a két fájl két nyitott PR-ben változik:
- a Villám matek és a Szólétra-gombok a `feat/jatek-bankok-ismetles` ágra kerülnek (PR #135);
- a Szökőár a `feat/evfolyam-bank-tartalom` ágra (PR #136).

A spec és ez a fájl mindkét ágon azonos tartalommal szerepel.

## Lépések
1. **Villám matek:** új tiszta modul `source/client/src/game-engine/speedQuizTiming.ts` (a tesztek nem importálhatják a
   React/three oldalt):
   - `ROUND_SECONDS`, `QUESTION_SECONDS` (1. döntés), `TARGET_CORRECT` (változatlan értékek);
   - `questionSecondsForBand(level, band)` = `Math.max(20, Math.round(QUESTION_SECONDS[level] * (1.5 - band * 0.5)))`.

   A `SpeedQuizMath.tsx` innen importál; a `questionSecondsFor` ezt hívja.
2. **Szólétra** `source/client/src/pages/WordLadderHuEn.tsx`: az évfolyam-választó gombjain `min-h-[44px]`.
3. **Szökőár** `source/client/src/pages/TsunamiEscapeEnglish.tsx`:
   - `QUIZ_TIMEOUT_SEC` 32/28/28;
   - új tiszta modul `source/client/src/game-engine/tsunamiTiming.ts`: `QUIZ_TIMEOUT_SEC`, `QUIZ_MIN_SEC = 24`,
     `tsunamiQuizSeconds(difficulty, band)` = `Math.max(QUIZ_MIN_SEC, adaptiveTimeBudget(QUIZ_TIMEOUT_SEC[d], band))`;
   - minden `setQuizTimeLeft(...)` hívás ezt használja.
4. **Tesztek (új):**
   - `tests/think-time.test.ts` (#135): E1, E2 minden évfolyamra és a sávokra (0, 0,25, 0,5, 0,75, 1).
   - `tests/tsunami-think-time.test.ts` (#136): E3.
   - Mindkettő bukjon a régi értékeken.
5. **Kapuk** (`source/`): tsc ×2, lint, unit-suite, build. Böngészőben a kijelzett idő ellenőrzése.
6. Atomi commit ágonként, push, CI, merge.
