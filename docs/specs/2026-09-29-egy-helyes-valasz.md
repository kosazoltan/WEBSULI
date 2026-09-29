# Egyválasztós tételek: pontosan egy helyes válasz — bármely témában (2026-09-29)

## Kérés
Tulajdonos: „Hiba a feladatlapodon: a 8. kérdésnél mind a négy válasz (234, 567, 891, 648) osztható 9-cel. Javítsd a
tananyagkészítő működését, hogy ilyen hiba ne fordulhasson elő többet. Bármilyen témakörben ne lehessen négy helyes válasz.”

## Tények (felderítve)
- A kérdéses PDF („Számonkérés … Ismétlő feladat · 15 kérdés”) NEM a WebSuli-repó terméke: sem generátora, sem szövegei
  nincsenek a kódban (grep). Külső eszköz készítette (a tulajdonos letöltése). A WebSuli gyártásában VISZONT ugyanez a hiba
  átjutna — ezt javítjuk.
- Mai ellenőrzések (egyik sem nézi, hogy a többi opció HAMIS):
  - `shared/lesson-schema.ts:128-131,175-190` (check blokk): opciók száma, index tartomány.
  - `shared/lesson-experience.ts:25-46` (`experienceQuizSchema`, `methodSchema`): különböző opciók, index tartomány.
  - `server/studio/experience-builder.ts` `validate` (~258) → `quizCorrectIndexProblems` (`:165`, csak ha MINDEN opció
    pontosan egy szám; 234/567/891/648 → kihagyja), `arithmeticClaimProblems` (`tools/arithmetic-claims.ts:118`).
  - `server/gameQuizGeneratorService.ts:182-195`, `shared/game-quiz-contract.ts` `isPlayableQuestion`: csak szerkezet.
  - Bank-ellenőr (`server/studio/bank-verifier.ts`): szabad szöveges `errors`, nincs opciónkénti ítélet; csak az
    `experience.{methods,tasks,quiz}` tételeit nézi (a lecke `check` blokkjait nem); és NEM FUT, ha nincs vak megoldás
    (`step-runner.ts:406` `!blind?.solutions.length`) — pl. tiszta magyarázó forrásnál (az oszthatóság-leckénél sem).
    A késői jegyzete nem blokkoló (`BANK_CHECK_LATE_SUBKIND`).

## Cél
Minden, a WebSuli által gyártott egyválasztós tételben (lecke `check` blokk, bank-kvíz, módszer-kérdések, játékba
exportált kvíz, játék-kvízgenerátor) PONTOSAN EGY opció igaz, és az a kulcs. Ahol ez nem igazolható, a tétel nem jut
a gyerekhez.

## Nem cél
- Külső eszközök (a PDF-et készítő eszköz) módosítása — a repón kívül esik; a záró jelentés megnevezi.
- Nyitott (rubrikás) feladatok értékelése.

## Rögzített döntések
1. **Determinisztikus őr** `shared/single-choice-check.ts`:
   `singleChoiceProblems({ prompt, options, correctIndex }): string[]` — kiszámolható osztályok:
   a) oszthatóság: a prompt „osztható(k) N-…” / „NEM osztható(k) N-…” / „melyik (szám) osztható …”, minden opció egész →
      megszámolja, hány opció teljesíti; ha ≠ 1, vagy nem a kulcs → hiba („N opció osztható 9-cel: 234, 567, …”).
   b) tiszta számtani kérdés („Mennyi …”, „Mennyi az eredménye …”, kifejezés `=` / `?` végű), számos opciók → a meglévő
      kifejezés-kiértékelővel (`tools/arithmetic-claims.ts`, ha újrahasznosítható) számolt eredménnyel egyenlő opciók száma ≠ 1 → hiba.
   c) duplikált / egyenértékű opció (normalizált szöveg; számként egyenlő, pl. „0,5” és „1/2” is) → hiba.
   Csak AKKOR szól, ha biztosan kiszámolható; egyébként üres lista (nem ad hamis riasztást).
2. **Bekötés:** `experience-builder.ts` `validate` (csomag-hiba → meglévő javító kör); `shared/lesson-skill-checks.ts`
   `verifyLessonSkillBank` (új kód `single_correct`, a kapu és a webes HTML-út is látja, a lecke `check` blokkjaira is);
   `gameQuizGeneratorService.ts` validálás (eldobás); `isPlayableQuestion` (a hibás régi sorok nem jutnak játékba);
   `quiz-export.ts` export (kihagyás).
3. **Opciónkénti AI-ítélet a bank-ellenőrben** (minden témára):
   - A darabok a lecke `check` blokkjait is tartalmazzák (`sections[i].blocks[j]`).
   - A kimenet új mezője: `choices: [{ "path": "…", "truths": [true, false, false, false] }]` — MINDEN opcióra külön
     igaz/hamis, a kulcs ismerete nélkül megítélve (a prompt a kulcsot a tételből eltávolítja: `correctIndex`,
     `feedbackPerOption` nélkül küldjük).
   - A KÓD dönt: ha `truths` hossza ≠ opciók száma, VAGY az igazak száma ≠ 1, VAGY az igaz nem a kulcs → blokkoló jegyzet
     („Egyválasztós tétel: 4 helyes opció …”). Ha egy egyválasztós tételhez nincs ítélet → a tétel nem „cleared” (a
     következő körben újra ellenőrzött).
   - Az egyválasztós jegyzet SOHA nem minősül vissza késői figyelmeztetéssé.
   - A bank-ellenőr vak megoldás NÉLKÜL is fut (üres kulcslistával).
4. **Kapu (fail-closed):** a kapu a determinisztikus őrt minden egyválasztós tételre lefuttatja; a bank-ellenőr utolsó
   körében még nyitott egyválasztós jelzéseket a job kimenetében tartja (`output.choiceFlags`). Ha a kapunál marad ilyen:
   `experience` tétel → kivéve a bankból, ha a bank a kivétel után is megfelel (`experienceProblems` üres); különben és
   a `check` blokknál → a kapu nem publikál (egyértelmű hibaüzenettel).

## Edge case-ek
- „Melyik NEM osztható 3-mal?” → a NEM teljesítő opciók száma legyen 1.
- Tizedes vessző / ezres szóköz az opcióban → számként olvasva; ha nem olvasható biztosan → az őr hallgat.
- A modell nem ad `truths`-t → nincs „cleared”, újraellenőrzés; ismételt hiány → blokkoló jegyzet a round-limitnél.
- Régi, már közzétett leckék → nem érintettek (az őr új gyártásra és a játék-kiolvasásra hat).

## Elfogadás (EARS)
- **E1** A „Melyik szám osztható 9-cel? 234/567/891/648” tételre a determinisztikus őr SHALL hibát adni (teszt).
- **E2** Egyetlen helyes opciós oszthatósági és számtani tételre SHALL NOT hibát adni (teszt, pozitív esetek).
- **E3** A bank-ellenőr SHALL blokkoló jegyzetet adni, ha az opciónkénti ítéletben ≠ 1 igaz van, vagy az igaz nem a kulcs
  (teszt, stub modellel), és vak megoldás nélkül is SHALL futni.
- **E4** A kapu SHALL NOT publikálni leckét, amelyben megoldatlan egyválasztós hiba maradt (teszt).
- **E5** A hibás régi játéktétel SHALL NOT jutni játékba (`isPlayableQuestion` teszt).
- **E6** Kapuk zöldek; az új tesztek a javítás előtti kódon buknak; élő próbagyártás `done`.

## Review-javítás 2026-09-29 (PR #134, 4 ellenőrzött lelet)
- **R1 (P1, fail-open):** javítható körben (`bankRepairPossible`) az ítélet nélküli egyválasztós tétel (a modell nem ad
  `choices`-t, vagy a darab elbukik/időtúllépés) sehol nem maradt nyitva, és blokkoló nélkül a job a kapura ment →
  nem determinisztikus több-helyes tétel publikálható volt. **Döntés:** (a) az elbukott darab kulcsos tételei is
  `unverifiedChoices`; (b) a lektor-lépésben ilyenkor a bank-ellenőr egyszer azonnal újrafut CSAK ezekre az
  útvonalakra (`onlyPaths`); (c) ami ezután is ítélet nélkül marad, az MINDIG `choiceFlags` (a `blocking`-tól
  függetlenül) → a kapu fail-closed kezeli. A következő lektor-kör a jelzéseket újraszámolja.
- **R2 (deduplikáció):** a lektor bármely (akár warn/info) jegyzete ugyanazon az útvonalon elfedte az egyválasztós
  blokkolót. **Döntés:** az egyválasztós jegyzet a deduplikáció miatt soha nem esik ki.
- **R3 (hamis negáció):** a `nem` a prompt bármely pontján tagadásnak számított („Melyik szám osztható 3-mal? Nem kell
  indokolni.” → hamis hiba). **Döntés:** a tagadás csak az állításhoz kötve érvényes: „nem osztható”, „NEM 3-mal
  osztható”; feltételes mellékmondat („ha …”) esetén az őr hallgat.
- **R4 (P2, újrahasználat):** a telepítéskor már `ok`-ként mentett lektor-lépés az új ellenőrzés nélkül
  újrahasználódott. **Döntés:** a lektor-bizonyíték verziója `skill-7.4-review-1` → `skill-7.4-review-2` (egy
  konstans, mindhárom helyen), és ez a lektor-lépés gyorsítótár-hashébe is bekerül, így a mentett lektor-lépés
  újrafut; a már kapura lépett, régi bizonyítékú job a kapun nem publikál (fail-closed).
- **Elfogadás:** R1–R4 mindegyikére új teszt, amely a javítás előtti kódon bukik; meglévő teszt nem gyengül.
