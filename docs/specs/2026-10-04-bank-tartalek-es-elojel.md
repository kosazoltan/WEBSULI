# Kötelező banktartalék és előjel-szabályok a gyakorlóbankban (2026-10-04)

> Állapot: JÓVÁHAGYVA (tulajdonosi döntés 2026-10-04: „Akkor végezd el a javítást a javaslat szerint”).
> Végrehajtás: `docs/specs/2026-10-04-bank-tartalek-es-elojel-vegrehajtas.md`.

## Mért tünet (élő admin-képernyő, 2026-10-04 15:55–15:58)

Egy negatív számos matek lecke (a 10-03-i `Negatív számok kivonása` újraindítása): tananyag-írás 4 kör, ábrák és bank 5 kör,
lektor 5 kör, majd a kapu (`Ellenőrzések és közzététel`) 2. látogatása **megállt**:

> Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható:
> `experience.quiz[73]` két helyes opció („-8-6=-14”, „-8-(+6)=-14”); `experience.tasks[22]` a required `["-13","13"]` a +13-at is
> elfogadja; `experience.methods[22]` disztraktor-magyarázat „+6-ról nyolcat balra → -14” (helyesen -2); `experience.methods[23]`
> „-8-ról hatot jobbra → +14” (helyesen -2); `experience.quiz[17]` „9-ről hatot balra → -3” (helyesen 3).

A „(kivétel után: …)” rész a képernyőn levágódott — NEM ellenőrzött, melyik padló bukott. A 10-03-i elemzés (job 9f2087ef,
`docs/specs/2026-10-03-forras-aritmetika-helyesbites.md`) ugyanennél a leckénél a **45/75-ös darabszámot** és a
**fogalmankénti felidéző/alkalmazó kvízpárt** mérte bukónak.

## Gyökérok (kódból ellenőrizve)

1. **A tartalék nem garantált.** A `bankUnitQuota` (`shared/lesson-bank-plan.ts`) tartalékkal kér (`taskTarget`, `quizTarget`:
   +3 feladat, +5 kvíz leckeszinten), de a csomag-séma (`experience-builder.ts`, `packetSchema`) a minimumot (`taskCount`,
   `quizCount`) fogadja el, a mentő kivétel (`salvagePacket`) is a minimumig vehet ki. A kapu körlimites kivétele
   (`resolveChoiceGate`) után a globális 45/75 nem lazul (`publicationBankProblems`) → egyetlen kivett tétel is buktat.
2. **A banképítő előjeles számolásban téveszt, és a javítókörök nem konvergálnak.** A bank-rendszerprompt nem tartalmaz
   előjel-szabályt; a determinisztikus őrök nem látják a hibát:
   - `shared/single-choice-check.ts` az egyenértékű opciót csak magányos számnál ismeri fel, egyenlőség-opciónál
     („-8-6=-14” ≡ „-8-(+6)=-14”) nem; az előjeles zárójelet a kiértékelő nem értékeli;
   - a nyílt feladat rubrikájában egy VAGY-csoportban a szám és az ellentettje (`["-13","13"]`) előjel-kétértelmű, ezt
     semmi nem jelzi.

## Cél

1. **Kötelező tartalék:** a bankcsomag csak a tartalékos darabszámmal (`taskTarget`, `quizTarget`) fogadható el; a mentő
   kivétel sem mehet alá. Így a kapu legfeljebb 3 feladatot / 5 kvízt kivehet a 45/75 megsértése nélkül.
2. **Előjel-szabályok a bankpromptban:** egész számos (negatív számot tartalmazó) matematika-fejezetnél a bank
   rendszerpromptja kifejezett előjel-szabályokat kap.
3. **Determinisztikus őrök (modell nélkül, a csomag-ellenőrzésben → olcsó csomagon belüli javítás, nem lektori kör):**
   a. egyválasztós tételben két **igaz, azonos értékű egyenlőség-opció** (előjeles zárójel összevonva) = „ugyanazt jelenti”;
   b. nyílt feladat required/bonus VAGY-csoportjában egy nem nulla **szám és az ellentettje** együtt = előjel-kétértelmű rubrika.

## NEM cél

- A 45/75 és a fogalmankénti felidéző/alkalmazó pár padlója változatlan (tulajdonosi szabály).
- A természetes nyelvű lépés-állítások („6-ról nyolcat balra → -14”) gépi ellenőrzése — ezt a prompt-szabály és a
  bank-ellenőr fedi.
- A `evaluateExpression` globális viselkedése nem változik (a kliens is használja); az előjeles zárójelet csak az új őr
  normalizálja.
- A már megállt lecke gyógyítása: újraindítás szükséges.

## Edge case-ek

- Régi checkpoint-csomag a minimum és a tartalék közötti darabszámmal → a séma elutasítja, a csomag újraépül (költség, de
  helyes). A tartalék nélküli régi (publikált) leckék olvasása nem érintett (csak a csomag-építés sémája változik).
- `ABOUT_FORM` kérdés (alak, írásmód) → az egyenértékű egyenlőség jogos, az őr hallgat (a meglévő szabállyal egyezően).
- Hamis egyenlőség-opció (disztraktor) → nem „igaz”, az új őr nem jelzi (a hamis disztraktor jogos).
- `["0","-0"]`, nem szám elem (`["tizenhárom","13"]`) → nem jelez.
- A required külön csoportjaiban (ÉS) a `13` és a `-13` jogos (pl. „mindkét szám abszolút értéke 13”) → nem jelez.
- Nem matematika vagy negatív szám nélküli fejezet → az előjel-blokk nem kerül a promptba (a csomag-hash nem változik).
- A mentő kivétel (utolsó kísérlet, `salvagePacket`) vészút: a minimumig (`taskCount`/`quizCount`) mehet le, különben a teljes
  lépés halna meg — ilyenkor a kapu nem kap tartalékot (dokumentált kompromisszum).
- A csomag felső korlátja a lecke tartalékos mérete (`max(cél, 45) + 3`, `max(cél, 75) + 5`), hogy a tartalékos csomag
  többfejezetes leckében is elférjen.
- A játék-kvíz szerződés (`shared/game-quiz-contract.ts`) ugyanazt az egy-helyes őrt használja: két igaz, azonos értékű
  egyenlőség-opciós kérdés nem játszható (helyes — kétértelmű kérdés).

## Elfogadás (EARS)

- WHEN a bankmodell a `taskTarget`/`quizTarget` alatti csomagot ad THEN the system SHALL azt elutasítani (javító kísérlet).
- WHEN a mentő kivétel a csomagot a tartalék alá vinné THEN the system SHALL nem fogadni el a mentést.
- WHEN egy egyválasztós tétel két opciója igaz, azonos értékű egyenlőség THEN the system SHALL „ugyanazt jelenti” hibát adni.
- WHEN egy nyílt feladat VAGY-csoportja egy számot és az ellentettjét is tartalmazza THEN the system SHALL tételhibát adni.
- WHEN a fejezet matematika és negatív számot tartalmaz THEN the bank system prompt SHALL tartalmazni az előjel-szabályokat.

## Teszt

- `tests/bank-reserve-sign-rules.test.ts`: őrök (igaz/hamis/ABOUT_FORM/zárójel), rubrika (OR/AND, nulla, szöveg),
  prompt-blokk feltétele, tartalék a csomag-sémában (alacsony darabszám bukik, tartalékos átmegy).
- Teljes kapu: `check`, `check:test`, `lint`, `npm test`, `build`.
- Dokumentált teszt-igazítás (a spec 1. célja miatt, gyengítés nélkül):
  - `shared/fixtures/lesson-fusion.ts` `standardFusionFixture` (csak unit tesztek használják): +3 feladat / +5 kvíz tartalék;
    a `fusionFixture`/`compactFusionFixture` kimenete változatlan (a böngészős tesztek ezeket használják).
  - `tests/lesson-experience.test.ts`: a felépített bank 48/80 (volt 45/75).
  - `tests/bank-repair.test.ts`: a prompt és a szerződés szövege a kötelező tartalékot mondja.
  - `tests/lesson-pipeline-runner.test.ts` `bankVerifierSetup`: a kapu-tesztek továbbra is a tartalék NÉLKÜLI 45/75-ös bankot
    mérik (kifejezetten levágva), a tartalékot a meglévő `spare` paraméter adja — az állítások változatlanok.
  - `tests/html-lesson-quality.browser.ts` (CI: Playwright E2E): a „teljes bank” darabszáma a tesztadatból jön (volt: rögzített
    45/75) — ugyanazt méri (minden banktétel megjelenik), csak a tartalékos tesztadathoz igazodik.
- NOT RUN: éles újraindítás (a felhőből az éles szerver nem érhető el); a tulajdonos indítja újra a leckét.
