# Régi kliens + új lecke: ne legyen „sérült”

Dátum: 2026-09-24 · Mért élesben (tulajdonosi képernyőkép): a telepítés előtt megnyitott fülön a régi JS a `princess` témát nem ismerte → `lessonSchema.safeParse` bukott → „Ez a lecke sérült” (1 hibás mező: experience.theme). A szerviz-worker átengedő (nem cache-el), a hiba a memóriában maradt régi bundle.

## Cél
1. Ismeretlen (újabb) téma vagy különlegesség ne tegye olvashatatlanná a leckét: alapértelmezett témával, a különlegesség nélkül jelenjen meg.
2. Ha egy lecke mégsem olvasható, a kliens ellenőrizze, van-e újabb app-verzió, és egyszer töltsön újra magától; különben „Frissítés” gomb.

## Nem cél
Új blokktípusok előre-kompatibilitása; a szerver szigorú sémájának lazítása (írásnál szigorú marad).

## Elfogadás
1. `tolerantLessonInput`: ismeretlen theme → "ocean", ismeretlen flair elem → kihagyva; ismert értékek változatlanok. (unit)
2. `newerBuildAvailable(html, loadedSrcs)`: más main-*.js → true; ugyanaz → false; hiányzó → false. (unit)
3. LessonView: a megengedő bemenetet parse-olja; hibánál egyszeri automatikus újratöltés (sessionStorage-őr), majd „Frissítés” gomb.
4. tsc (+test), eslint, teljes teszt, build zöld.
