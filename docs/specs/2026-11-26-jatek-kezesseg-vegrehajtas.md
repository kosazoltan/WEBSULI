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

Megvalósítás (2026-11-26): a tükrözés CSS-ből a `data-hand` attribútummal (`.game-touch-layer[data-hand="left"]` közös szabály a
Cunami és a Kockavadász rétegén, `.sa-controls[data-hand="left"]` az Aszteroidán — az akciócsoporton belül is fordítva, így a tűz a
szélen marad); a Kockavadász akció-íve oszlopcserével, a kérdés-sáv szünetgombja balra, a `belowBand` a két vezérlő tényleges helyéből.
A kérdés-állapot célpontjai balkezesnél sem fedik a vezérlőket (Kockavadász, Aszteroida, álló és fekvő — mérve).
Mérés: `game-handedness.spec.ts` 23 passed; `brainrot-play.spec.ts` (benne a régi kezesség-teszt) zöld; `blockcraft-play.spec.ts`
54 passed — a 2 „M5 kupon” bukás a mainen is ugyanígy bukik (`FLAKE-BC-M5`, nem ennek a szeletnek a hibája).

Állapot: JK kész — kapulánc, PR.
