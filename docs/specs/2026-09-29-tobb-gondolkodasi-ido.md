# Szökőár-szökés és Villám matek: több gondolkodási idő (2026-09-29)

## Kérés
Tulajdonos: „A szökőár szökésben és a villám matekban adjál több időt, hogy fejben ki lehessen számolni, még én sem
tudtam kiszámolni ilyen rövid idő alatt.”

## Kiindulás (felderítve, fájl:sor)
- **Villám matek** (`client/src/pages/SpeedQuizMath.tsx`):
  - `QUESTION_SECONDS` 14–22 s évfolyamonként.
  - `questionSecondsFor` = alap × (1,5 − sáv·0,75), legalább 6 s, így magas sávon az alapidő 75%-a (pl. 5. o.: 11 s).
  - `ROUND_SECONDS` 100–120 s, `TARGET_CORRECT` 15–21 jó válasz. Ez átlagosan kb. 5 s-ot hagy egy kérdésre (5. o.: 100 s / 21).
    A szűk keresztmetszet tehát a kör ideje is.
- **Szökőár** (`client/src/pages/TsunamiEscapeEnglish.tsx`):
  - `QUIZ_TIMEOUT_SEC` easy 14 / normal 11 / hard 9.
  - `adaptiveTimeBudget` × (1,3 − sáv·0,6), ami magas sávon hard esetén 6 s.
  - A 3–12. évfolyamos bekötés (#136) óta itt évfolyami matek- és szöveges kérdések is jönnek.
- A kvíz alatt a játék áll: a Szökőár a `phase === "quiz"` alatt nem léptet, a Villám matek pedig megállítja az órákat
  a magyarázat idejére. A hosszabb idő tehát csak gondolkodási idő, nem nehezíti a játékot.

## Cél
Kényelmesen elég idő egy fejben megoldható feladatra minden évfolyamon; az adaptív nehezítés ne vegyen el a kérdésidőből
az alapérték alá.

## Nem cél
A pontozás, az életek, a nehézségi sáv logikája és a közös `adaptiveTimeBudget` függvény (a Kockavadász is használja, tesztelt).

## Rögzített döntések
1. **Villám matek:**
   - `QUESTION_SECONDS`: 3–5. o. 30 s, 6. o. 32 s, 7–8. o. 35 s, 9–10. o. 40 s, 11–12. o. 45 s.
   - Sávszorzó (1,5 − sáv·0,5), azaz ×1,0 és ×1,5 között; alsó határ 20 s.
   - `ROUND_SECONDS`: 3. o. 210, 4. o. 220, 5–8. o. 240, 9–10. o. 270, 11–12. o. 300 s. Ez kb. 12–20 s jut egy célkérdésre.
2. **Szökőár:**
   - `QUIZ_TIMEOUT_SEC` easy 32 / normal 28 / hard 28. A nehéz fokozat nem kap kevesebb gondolkodási időt: a 9–12.
     évfolyam alapból nehéz, és ott a legnehezebbek a kérdések. Mérés közben derült ki: 24 s-os hard alappal a
     12. évfolyam csak 22 s-ot kapott, kevesebbet, mint a 4.
   - A számolt keret alsó határa `QUIZ_MIN_SEC = 24` (`Math.max`).
   - Az időtúllépéses E2E (`remaining-learning.spec.ts`, 35 s-os várakozás) a kiinduló normál sávon (kb. 0,42 → kb. 29 s)
     változatlanul teljesül.
3. **Érintési cél** (a #135 E2E-bukása, `games-touch-controls.spec.ts:168`): a Szólétra új évfolyam-gombjai 34 px
   magasak. Ezeknek legalább 44 px kell (`min-h-[44px]`). Ez kódjavítás, a teszt nem változik.

## Edge case-ek
- Magas sáv (1,0): Villám matek 5. o. 30 s (korábban 11 s); Szökőár hard 24 s (korábban 6 s).
- Alacsony sáv: legfeljebb ×1,5 (Villám matek) vagy ×1,21 (Szökőár).
- Ha a kör ideje lejár, a győzelemhez szükséges célszám nem változik.

## Elfogadás (EARS)
- **E1** A Villám matek kérdésideje SHALL legalább 20 s és legalább az évfolyam alapideje legyen, bármely sávon (új unit-teszt
  a kivezetett tiszta függvényre).
- **E2** A Villám matek köre SHALL legalább 12 s-ot adjon célkérdésenként (`ROUND_SECONDS / TARGET_CORRECT ≥ 12`, teszt).
- **E3** A Szökőár kérdésideje SHALL ≥ 24 s legyen minden nehézségen és sávon (teszt).
- **E4** A Szólétra minden látható vezérlője SHALL ≥ 44 px legyen (a meglévő E2E zöld).
- **E5** Kapuk zöldek. Böngészőben a kijelzett idő az új értéket mutatja.
