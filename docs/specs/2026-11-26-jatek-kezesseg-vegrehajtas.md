Terv: `docs/specs/2026-11-26-jatek-kezesseg.md`

# Játékok kezessége — végrehajtás

## JK (2026-11-26): közös preferencia, választó; mind az öt joystickos játék (a JK-1 és a JK-2 egy PR-ban)
1. RED: `source/tests/game-handedness.spec.ts` — érintős Pixel 7 profilban az öt joystickos játék (közös esetfájlok:
   `tests/game-mobile-cases/*`) jobb- és balkezes elrendezése: a joystick és az akciógombok középpontja a megfelelő képernyőfélen;
   a kezdőképernyő választója (`game-hand-left`) állítja, és a preferencia a következő játékban is érvényes.
   `source/tests/game-handedness.test.ts` — a tároló (alapérték, hibás érték, tárolóhiba, régi kulcs tartaléka, írás mindkettőbe).
2. GREEN: `client/src/game-engine/handedness.ts` (+ `HandednessPicker.tsx`), `pages/SpaceAsteroidQuiz.tsx`, `pages/TsunamiEscapeEnglish.tsx`
   (`data-hand` + CSS-tükrözés), `pages/BrainRotSteal.tsx` (közös hook a régi kulccsal), `pages/TornadoHunter200.tsx` +
   `lib/tornado/progress.ts` (a váltás a közös preferenciát is írja; friss haladás a közösből indul), `pages/BlockCraftQuiz.tsx`
   (az akció-ív tükrözése, a kérdés-sáv a két vezérlő tényleges helyéből).
3. Próbahiba, kapulánc, PR.

Állapot: JK folyamatban.
