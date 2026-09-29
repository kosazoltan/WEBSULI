# Minden játék: 3–12. évfolyamos nehézség, közös évfolyam-kérdésbank (2026-09-29)

## Kérés
Tulajdonos: „Az összes játékban harmadik osztálytól tizenkettedik osztályig helyezz el nehézségi fokokat, hogy a teljes
általános és középiskola le legyen fedve. A kérdésbankokat is bővítsd nehezebb feladatokkal.”
(A Szólétra és a Villám matek külön szeletben: `2026-09-29-jatek-bankok-ismetles.md`, „Bővítés” szakasz.)

## Kiindulás (felderítve, fájl:sor)
- Évfolyam-választás: közös `classroomStore` (1–12, `lib/classroomStore.ts:14-40`, `ClassroomGateModal`); az Aszteroida
  saját 1–12 választót és kulcsot használ (`SpaceAsteroidQuiz.tsx:164,245-260`); a Tornádó `SchoolLevel` csak 1–6
  (`lib/tornado/questions.ts:16`, `progress.ts:367` levágja).
- Az évfolyam egyik játékban sem választ kérdés-tartalmat (csak tananyag-kvízt kér le, vagy időt/tempót skáláz):
  Aszteroida `pickQuiz` (`:896`) véletlen; Kockavadász (`:1346`) tantárgy-körforgás; Brain Rot (`:329`) véletlen,
  `startingDifficulty(4)` rögzítve; Szökőár a haladás szerint választ szintet; Tornádó 1–6 évfolyam-tábla.
- Beépített bankok: Aszteroida 38, Kockavadász 213, Brain Rot 75, Szökőár ~180 (angol) + 45, Tornádó 120 — mind alsós szint.
- Rögzített darabszámú tesztek: `remaining-quiz-explanations.test.ts` (Aszteroida `=== 38`, Kockavadász `=== 213`,
  Tornádó `=== 120`), `tornado-questions.test.ts` (`q.grade <= 6`, `AUTO_GRADE_TABLE` határai, 1..6 ciklus).

## Cél
Mind az öt játékban (Aszteroida, Tornádó, Kockavadász, Szökőár, Brain Rot) a játékos évfolyama (3–12) határozza meg a
kérdések tartalmát és nehézségét; a teljes általános és középiskolát lefedő, bővített, ellenőrzött kérdésanyaggal.

## Nem cél
- Játékmenet, grafika, pontozás; a tananyag-kvízek (szerver) logikája.
- 1–2. évfolyam átalakítása (a meglévő alsós bankok maradnak és ott használatban maradnak).

## Rögzített döntések
1. **Közös évfolyam-bank** `client/src/data/gradeQuizBank/grade-03.ts … grade-12.ts` + `index.ts`:
   ```ts
   export type GradeSubject = "math" | "english" | "hungarian" | "science" | "history";
   export type GradeQuizItem = { id: string; grade: number; subject: GradeSubject; tier: 1 | 2 | 3;
     prompt: string; options: string[]; correctIndex: number; explanation: string };
   ```
   Egy tétel = egy sor (a meglévő szkennerek miatt), 4 különböző opció, PONTOSAN egy helyes; magyarázat 30–300 kar.,
   tartalmazza a helyes válasz egy kulcsszavát, nem hivatkozik sorrendre („az első”, „A)”). Azonosító: `g{évf}-{tárgy}-{nnn}`.
   Tartalom a NAT 2020 és a korosztály szerint (pl. matek: 6. törtek/százalék, 7. negatív számok/hatvány, 8. egyenletek/
   gyök, 9. lineáris függvény, 10. másodfokú, 11. logaritmus/trigonometria/sorozat, 12. valószínűség/statisztika;
   angol: A1→B2; magyar: helyesírás, nyelvtan, irodalom; science: biológia/földrajz alsóbb, fizika/kémia/biológia felsőbb;
   history: évfolyam szerinti korszakok).
   **Minimum:** évfolyamonként × tárgyanként ≥ 18 tétel (6-6-6 a három szinten) → ≥ 900 tétel.
2. **Közös választó** `client/src/game-engine/gradeQuiz.ts`:
   `pickGradeQuiz({ grade, band, subjects, seen, rng }): GradeQuizItem | null` — a játékos évfolyamának tételeiből, a
   sáv szerinti szinttel (`band < 0.4` → 1, `< 0.7` → 2, különben 3; hiány esetén a szomszédos szint), ismétlés nélkül
   (`seen` azonosító- ÉS prompt-szinten); ha az évfolyam kimerült, előbb az eggyel alacsonyabb, aztán a magasabb évfolyam.
   `gradeForGame(grade)`: 1–2 → a játék saját alsós bankja; 3–12 → közös bank (a saját bank kiegészítésként marad).
3. **Bekötés játékonként:**
   - **Aszteroida:** a saját 1–12 választó marad (az évfolyam a közös `classroomStore`-ba is íródik); `pickQuiz` 3–12-nél a
     közös bankból (összes tárgy), a sáv az adaptív session sávja; tananyag-kvíz elsőbbsége változatlan.
   - **Kockavadász:** a tárgy-körforgás a közös tárgyakkal bővül (a `BlockCraftSubject` típus és a `blockCraftSubjects.ts`
     leképezés `science`/`history`-val); 3–12-nél a közös bankból, a saját bank kiegészítés.
   - **Brain Rot:** kategóriák bővülnek; `startingDifficulty(userGrade ?? 4)`; választás a közös bankból 3–12-nél.
   - **Szökőár:** a tárgy-módok (angol, matek, nyelvtan, természet, vegyes) a közös bank megfelelő tárgyaira képeződnek;
     a könnyű/közepes/nehéz gomb alapértéke az évfolyamból (3–5 könnyű, 6–8 közepes, 9–12 nehéz), a sáv eltol.
   - **Tornádó:** `SchoolLevel` 1–12 (+ auto); a beállításokban 1–12; `progress.ts` 1–12-ig fogad el; az `AUTO_GRADE_TABLE`
     a 200 szintet 1–12-re osztja; 7–12-nél matek/angol a közös bankból.
4. **Dokumentált tesztmódosítás (spec-változás):** a rögzített darabszámok (`=== 38`, `=== 213`, `=== 120`) a bővített
   értékre, a Tornádó `grade <= 6` / 1..6 ciklus / `AUTO_GRADE_TABLE` határai az új, 1–12-es táblára igazodnak — a teszt
   szándéka (teljes, magyarázott bank; érvényes évfolyam-sáv) megmarad.
5. **Helyesség:** minden új tételt független vak megoldó (más modellcsalád, a kulcs nélkül, opciónként igaz/hamis) ellenőriz;
   új teszt: számolható matek-tételeknél pontosan egy opció egyenlő a kiszámolt értékkel; nincs duplikált prompt/opció.

## Edge case-ek
- Nincs évfolyam (a játékos még nem választott) → az eddigi viselkedés (a játék saját bankja, 4. évfolyamos sáv).
- Egy tárgy üres az évfolyamon → a tárgy kimarad a körforgásból, nem áll meg a játék.
- Tananyag-kvíz van → továbbra is elsőbbséget élvez.

## Elfogadás (EARS)
- **E1** 3–12. évfolyamon a játékok SHALL az adott évfolyam tételeiből kérdezni (teszt: választó + bekötés-őr játékonként).
- **E2** A közös bank SHALL évfolyamonként × tárgyanként ≥ 18 tételt tartalmazni, pontosan egy helyes válasszal.
- **E3** Egy futásban SHALL NOT ismétlődni tétel, amíg van nem látott (szimulációs teszt).
- **E4** A vak megoldós ellenőrzés minden új tételre: pontosan egy igaz opció, és az a kulcs.
- **E5** Kapuk zöldek; a módosított tesztek csak a dokumentált darabszám/tartomány-változást követik.

## Tesztváltozás a CI-ben (2026-09-29 délután)
- `tests/remaining-learning.spec.ts` („asteroid wrong-answer explanation…”) 7. évfolyamot állít be, és a várt kérdést
  eddig csak az Aszteroida saját bankjából kereste. A 3. döntés szerint 3–12. évfolyamon a kérdés a közös bankból jön,
  ezért a teszt a közös bank fájljait (`gradeQuizBank/grade-*.ts`) is beolvassa. A teszt szándéka változatlan: a rossz
  válaszra a tétel saját magyarázata jelenik meg, olvasható, és bezárás után új kérdés jön. Új ellenőrzés: a beolvasott
  bank > 900 tétel.
