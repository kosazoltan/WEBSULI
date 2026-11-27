# Végrehajtás — TG-P6 (TANANYAG-GYAKORLATI, PR 6: a tanuló által kapott kör)

Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` — „PR 6 — A tanuló által kapott kör ellenőrzése”.
Feladat (SQL): `TANANYAG-GYAKORLATI`.

Hiány: a jó (60–75% alkalmazó) teljes bankból a tanuló nem feltétlenül kap kiegyensúlyozott kört. A helyi kvíz (`sampleIds`)
véletlen mintát vesz, a nyílt kör (`sampleTaskIds`) csak a szóbeli feladatot biztosítja, a bejelentkezett gyakorlás
(`selectPracticeQuestions`) előzmény szerint rangsorol — üres előzménynél a bank eredeti sorrendje dönt, így egy fogalmi
tételekkel kezdődő bankból az első 25-ben túl sok fogalmi kérdés lehet.

1. Bukó tesztek (`tests/practice-sampling.test.ts`):
   - `selectPracticeQuestions` fogalmi tételekkel kezdődő bankon (20 fogalmi + 30 alkalmazó), üres előzménnyel: a 25-ös körben
     15–18 alkalmazó; a csoportokon belül a mai ismétlési rangsor (sorrend) megmarad; besoroló nélkül a régi viselkedés.
   - Helyi kvíz (`sampleQuizIds`): 25-ös kör 15–18 alkalmazóval, sok véletlenmagon; csak fogalmi banknál is teljes kör.
   - Nyílt kör (`sampleTaskIds`): 15-ös kör 9–11 alkalmazóval, a szóbeli feladat továbbra is benne.
   - Bekötés: a szerver (`beginPractice`) és a kliens (Stúdió-nézet, HTML-kör) a kiegyensúlyozott választót használja.
2. Javítás: új `shared/practice-sampling.ts` (célszám: kétharmad, a 60–75% sávba szorítva, a készlet erejéig; csoportonkénti
   mintavétel, csoporton belüli sorrend megtartása). A besorolás a közös mércéből (`classifyQuizItem` / `classifyOpenTask`)
   futásidőben — tárolt besorolási adat nem kell (régi, címkézetlen bank is ugyanígy kezelhető). A `sampleIds` általános
   viselkedése változatlan; a mentett kör a neki mentett azonosítókkal / kérdésekkel folytatódik (a választó csak új kört érint).
3. Ellenőrzés: új + érintett egységtesztek (lesson-attempt, lesson-experience*, no-lookbehind-client), tsc, eslint.

3b. Mért: RED 5 bukás (a régi minta / banksorrend fogalmi többséget adott, bekötés hiányzott); utána `practice-sampling`
   6/0, a 20 érintett tesztfájl (practice, lesson-attempt, lesson-experience, round, reward, coupon, lookbehind) 222/0; tsc, eslint OK.
   A csoporton belüli rangsor-teszt a régi kódon is zöld (a rangsort őrzi, nem a hiányt bizonyítja).

Állapot: kész — következő: kapulánc.
