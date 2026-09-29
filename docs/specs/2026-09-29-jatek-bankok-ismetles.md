# Szólétra és Villám matek: nagyobb bankok, futáson belül nincs ismétlés (2026-09-29)

## Kérés
Tulajdonos: „Bővítsd a Szólétra kifejezés-bankját, mert ugyanaz a kérdés többször is beugrik. Legyen sokkal több szó
és kifejezés. A matek, villám matek feladatait is bővítsd lényegesen, mert ott is egy futam alatt többször előkerül
ugyanaz a kérdés.”

## Kiindulás (felderítve, fájl:sor)
**Szólétra** (`client/src/pages/WordLadderHuEn.tsx`, `client/src/data/englishGameQuizExtras.ts`):
- Statikus bank: könnyű 38 (`:63-83` + `wordLadderEasyMore`), közepes 34 (`:85-101` + `wordLadderMedMore`), nehéz 24.
- Minden válasz után `pickAdaptiveTier(pools, band, recent)` (`adaptiveSession.ts:26-33`) választ: EGY készletből,
  véletlenszerűen, visszatevéssel; a `recent` csak az utolsó 8 azonosító (`WordLadderHuEn.tsx:565`). Az előre felépített
  6/5/5-ös sor (`buildLongRunQueue`) gyakorlatilag nem használt. A rossz válasz visszaléptet → 25–30 kérdéses futás egy
  ~34-es készletből → biztos ismétlés.
**Villám matek** (`client/src/pages/SpeedQuizMath.tsx`):
- `TEACHER_BANK` évfolyamonként 12/11/11 (`:85-126`); `pickTask` (`:257-276`) 68%-ban ebből húz, 8 véletlen próbával
  az utolsó 6 prompt elkerülésére, utána CSENDBEN elfogadja az ismétlést; a 32%-os generátor (`:128-247`, 4–5 sablon
  évfolyamonként, pl. 3. o. `a×b` 2–9 → 64 kombináció) semmilyen ismétlés-ellenőrzést nem végez.
- A szerver-bank és a tananyag-kvízek ezt a játékot nem táplálják.

## Cél
1. **Futáson belül nincs ismétlés**, amíg a készletekben van még nem látott kérdés (azonos azonosító VAGY azonos
   prompt-szöveg sem).
2. **Sokkal nagyobb bankok:** Szólétra könnyű ≥ 120, közepes ≥ 120, nehéz ≥ 90 statikus tétel; Villám matek tanári
   bank évfolyamonként ≥ 40; a generátor évfolyamonként ≥ 8 sablonnal és bővebb számtartománnyal.
3. Minden új tétel: pontosan EGY helyes válasz, a helytelenek egyértelműen hibásak, magyarázat a meglévő szabályok szerint.

## Nem cél
- A játékmenet (létra-szabály, idő, élet, pontozás), a felület, a szerver-bank, a nehézségi sáv logikája.

## Rögzített döntések
1. **Közös, tiszta függvény** `pickUnseen` a `client/src/game-engine/adaptiveSession.ts`-ben (vagy új `no-repeat.ts`):
   a kért nehézségű készletből a még nem látott tételt választja; ha ott nincs, a SZOMSZÉDOS nehézségből (előbb a
   könnyebb, aztán a nehezebb); ha minden készlet elfogyott, a legrégebben látottat. A „látott” a futás teljes listája
   (azonosító + normalizált prompt).
2. **Szólétra:** a `recentAdaptiveRef` a futás összes látott tételét tartalmazza (nem csak 8-at); a választás `pickUnseen`.
   A statikus és a szerver-bank közötti tartalmi duplikátumok (azonos prompt+helyes válasz) összevonva.
3. **Villám matek:** a futás összes promptja nyilvántartva; a tanári húzás a nem látottak közül; a generátor legfeljebb
   30 próbával nem látott promptot keres; ha nem talál, a tanári bankból húz nem látottat.
4. **Tartalom:** az új tételek egysoros formában (a meglévő tesztek szkennere miatt), magyarázattal; a Szólétra-azonosítók
   `[a-z]?\d+` alakúak és egyediek; a Villám matek magyarázatai tartalmaznak műveleti jelet.
5. **Helyesség-ellenőrzés:** minden új tételt egy független vak megoldó (más modell, a kulcs ismerete nélkül) old meg és
   minden opciót külön minősít; ahol nem pontosan az egy kulcs szerinti opció helyes, a tételt javítani kell. Villám
   matek: új teszt kiszámolja a számtani promptok eredményét, és ellenőrzi, hogy PONTOSAN egy opció egyenlő vele.

## Edge case-ek
- Csak egy készletnek van eleme → abból fogy, utána a legrégebbi.
- Szerver-tétel ugyanazzal a prompttal, mint egy statikus → egyszer jelenik meg.
- Nagyon hosszú futás (sok rossz válasz) → csak a teljes kimerülés után ismétel.

## Elfogadás (EARS)
- **E1** Egy futás első N kérdése SHALL NOT ismétlődni, ahol N a három készlet együttes mérete (szimulációs teszt 2000
  véletlen futással, sávváltásokkal és rossz válaszokkal).
- **E2** A statikus bankok mérete SHALL ≥ a cél 2. pontja (teszt).
- **E3** Minden Villám matek számtani tétel SHALL pontosan egy helyes opcióval rendelkezni (teszt, kiszámolva).
- **E4** A meglévő bank-tesztek (`quiz-bank-integrity`, `game-quiz-explanations`, `speed-quiz-explanations`) változatlanul zöldek.
- **E5** A vak megoldós ellenőrzés minden új tételre: pontosan egy helyes opció.

## Bővítés 2026-09-29 délután (tulajdonosi kiegészítés)
1. **3–12. évfolyam mindkét játékban.** A Villám matek évfolyam-táblái (`ROUND_SECONDS`, `QUESTION_SECONDS`,
   `TARGET_CORRECT`, `LEVEL_LABEL`, `SCORE_DIFFICULTY`, `TEACHER_BANK`, `generatedTaskForGrade`, a menü gombjai)
   3..12-re bővülnek, NAT-hoz igazított tartalommal (6.: törtek, tizedes törtek, százalék, oszthatóság; 7.: negatív
   számok, hatványok, százalék, egyszerű egyenlet; 8.: egyenletek, arányosság, négyzetgyök, terület/térfogat;
   9.: algebrai kifejezések, lineáris függvény, egyenletrendszer; 10.: másodfokú egyenlet, gyökök, racionális
   kitevő; 11.: logaritmus, szögfüggvény-értékek, sorozatok; 12.: kombinatorika, valószínűség, statisztika).
   Továbbra is egy számválaszos, négyopciós feladat (a `MathTask` alakja marad; új, csak ellenőrzésre szolgáló
   opcionális `calc` mező), PONTOSAN egy helyes opció, a magyarázatban műveleti jel / képlet.
2. **Szorzás ÉS osztás minden évfolyamon** a Villám matekban — a tanári bankban és a generátor-sablonok között is.
3. **Szólétra 3–12:** öt nehézségi szint: könnyű (3–4., A1), közepes (5–6., A1–A2), nehéz (7–8., A2),
   B1 (9–10.: phrasal verbs, idiómák, kollokációk, igeidők), B2 (11–12.). A kezdő szint az évfolyamból jön, a
   meglévő közös sáv (`startingDifficulty` / `nextDifficulty`, változatlan) ettől tér el:
   `eltolás = round((sáv − startingDifficulty(évfolyam)) / 0.15)`, a szint `[0, 4]`-re vágva. A választás
   `pickUnseen` a szintek rendezett listáján (előbb a kért szint, aztán távolság szerint, azonos távolságon előbb
   a könnyebb). Az új B1 és B2 szint ≥ 60–60 tétel. A menüben évfolyam-választó (3–12), alapértéke az osztály.
   A szerver-bank `easy/medium/hard` sorai az első három szintre kerülnek (változatlanul).
4. A vak megoldós ellenőrzés és a „pontosan egy helyes opció” teszt MINDEN új tételre vonatkozik (a Villám matek
   generátor-sablonjaira mintavétellel: sablononként legalább 2 példány).

### Elfogadás (kiegészítés)
- **E6** A Villám matek minden 3..12 évfolyamra: tanári bank ≥ 40, generátor ≥ 8 sablon, mindkettőben van `×` és `÷`
  (teszt: a generátor 3000 futása évfolyamonként; minden kimenet pontosan egy helyes opcióval, a `calc` kiszámolva).
- **E7** A Szólétra szintjei: könnyű ≥ 120, közepes ≥ 120, nehéz ≥ 90, B1 ≥ 60, B2 ≥ 60 (teszt); az évfolyam→szint
  leképezés tesztelt (3→0, 5→1, 7→2, 9→3, 12→4).
