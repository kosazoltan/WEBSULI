# Spec: Szólétra — évfolyamhoz és tudáshoz igazított szintezés, osztályozott szó- és kifejezésbank

> Dátum: 2026-11-22 · Szerző: Claude (fejlesztő alügynök) · Állapot: **ezen az ágon (PR-2, `feat/szoletra-szintezes-2`) S1 + S2
> végrehajtva (a lap az évfolyam-sávos választót és a teljes szóbankból épített bankközi korlátot használja); S3 keretre vár.**
> Ellenőrzés: `docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md` „Mért számok” (fejenként jelölve).
> Szabály: 3+ fájlt érintő feladat csak spec + AI-olvasható végrehajtási utasítás után indul (`docs/agent-haromfazisu-munka.md`).
> Végrehajtás: `docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md`.

## 0. Tulajdonosi kérés (2026-11-22, szó szerint)

> „Szólétrában a szinteket tisztázd ki sokkal jobban, mert az alsóbb szinteknél is ugyanolyan nehéz kifejezések és szavak
> vannak, mint a felsőbb szintenként. Osztályozd, finomítsd, alacsonyabb tudású diáknak alacsonyabb szintű feladatokat adj,
> majd a körök számával emelheted a nehézségi fokot, illetve alapvetően a belépéskor is vedd figyelembe, hogy hányadik
> osztályos a tanuló és annak megfelelő nehézségi fokú. A szó-kifejezés bankokat hozd létre.”

## 1. Felmérés (mért tények, 2026-11-22, `origin/main` 0645f48f)

Mérőszkript: a fejlesztő scratchpadjében (`measure.mts`, `calib.mts`); a mérce a repóba a `wordLadderGrading.ts`-ként kerül.

### 1.1 Hogyan dől el most a kérdés szintje

- A kérdés szintje (`source/client/src/pages/WordLadderHuEn.tsx` ~639. sor): `ladderTierIndex(évfolyam, levelSessionRef.band)`
  (`source/client/src/game-engine/no-repeat.ts:104`) = `ladderBaseTier(évf.) + round((sáv − startingDifficulty(évf.)) / 0,15)`.
- A sáv a PÁLYÁBÓL indul (`levelBand`: 1. pálya 0,15 … 10. pálya 0,95, `gradeLevels.ts`), és a pálya ±0,15-én belül mozog
  (`createLadderLevelSession`, `wordLadderLevels.ts:37`). A 2026-09-29-es 6. döntés szerint „a 10. pálya minden évfolyamon a
  legfelső szintről kérdez” (`wordLadderLevels.ts:6`).
- Az évfolyam: `pickedGrade ?? clampLadderGrade(userGrade ?? 4)` (`WordLadderHuEn.tsx:508`); a `userGrade` a
  `useClassroomGrade()` (`classroomStore.ts:61`, `localStorage["websuli.classroomGrade"]`) — ismeretlen évfolyamnál 4.
  A menü pályaválasztója (`GradeLevelPicker`) a feloldott pályára (`loadUnlockedLevel`) áll.

**Mért évfolyam × pálya → kezdő szint (zárójelben a ±0,15-ös sávmozgással elérhető tartomány):**

```
évf |     P1    P2    P3    P4    P5    P6    P7    P8    P9   P10
  3 | 0(0-0)0(0-0)0(0-1)0(0-1)1(0-2)1(0-2)2(1-3)3(2-4)3(2-4)4(3-4)
  4 | 0(0-0)0(0-0)0(0-0)0(0-1)1(0-2)1(0-2)2(1-3)2(1-3)3(2-4)4(3-4)
  7 | 0(0-1)0(0-1)1(0-2)1(0-2)2(1-3)3(2-4)3(2-4)4(3-4)4(3-4)4(4-4)
 12 | 1(1-2)1(1-2)2(1-3)2(1-3)3(2-4)4(3-4)4(3-4)4(4-4)4(4-4)4(4-4)
```

**1. ok — a pálya dönt, nem az évfolyam:** egy 3.-os a 8. pályától B1–B2 (3–4. szint) kérdést kap; egy 12.-es az 1. pályán
A1–A2-t. Ugyanazon a pályán a 3. és a 12. évfolyam között legfeljebb 1 szint a különbség.

### 1.2 Mi van egy szinten belül

Mérce-előkép (célnyelvi rész betűszáma a nyelv A1-átlagához normálva + plusz szótagok + plusz szavak + mondat + kategória,
ld. 4.1). A kézi bankok (`data/wordLadder/{en,de,fr}.ts`) szintjei jól elválnak (angol kézi átlag-betűszám 6,3 / 10,2 / 20,4 /
34,0 / 33,8 a 0–4. szinten). **A központi szóbank (`data/vocabBank/*`) szintjei viszont alig:**

| szóbank | 0. szint | 1. | 2. | 3. | 4. | 0. szinten ≥ 10 betűs |
|---|---|---|---|---|---|---|
| en (2664) átl. betű | 6,9 | 7,8 | 7,9 | 8,9 | 9,5 | 119 / 554 (21 %) |
| de (2080) | 9,4 | 11,3 | 11,9 | 12,6 | 14,5 | 156 / 409 (38 %) |
| fr (2064) | 8,5 | 10,3 | 10,6 | 11,8 | 12,4 | 129 / 411 (31 %) |

Mérce-pont kvantilisek (p33/p50/p67), angol szóbank: 0. szint 6/8/14, 4. szint 13/14/17 — **a 0. szint felső harmada
nehezebb a 4. szint mediánjánál**. A kifejezés-arány minden szinten 33–39 %.

**2. ok — a szóbank adja a kérdések felét** (`wantVocab = freshCountRef.current % 2 === 1`, ~646. sor), és a szinten belül
nincs sorrend: a `pickUnseen` véletlenszerűen húz a szint teljes készletéből, így a futás ELSŐ kérdése is lehet egy 3 szavas
kifejezés vagy egy hosszú mondat.

**3. ok — kereszt-banki ellentmondás:** az angol kézi bank 0. szintjének 119 olyan célszava van, amely a szóbankban is szerepel;
ebből 22-t a szóbank magasabb szintre sorol. (Tájékoztató adat; nem javítjuk tételenként — ld. 4.1 „felsorolás csak felfelé”.)

**4. — a pontozás nem függ a szinttől:** a helyes válasz XP-je a kombóból és a tempóból jön (`xpForCorrect`, `ladderXpScale`),
a ranglista-nehézség a pályából (`difficultyForLevel(result.level)`, ~1219. sor). A kérdés-szint változása a pontskálát nem
mozdítja → **nincs szükség új verziókulcsra** (a D-04 Rúnabánya-minta itt nem alkalmazandó).

## 2. Cél

1. Minden Szólétra-tétel (kézi bank + szóbank + szerver-bank) gépileg kiszámolható nehézségi pontot és ebből **15 fokozatú**
   besorolást kap (5 szint × 3 alfok) — ez az „osztályozott szó- és kifejezésbank”, évfolyam-sávonként lekérdezhetően.
2. A belépési nehézség az évfolyamból jön (ismeretlennél óvatos alacsony kezdés), a pálya csak a sávon belül tol.
3. A nehézség a helyes válaszok sorozatával fokozatosan emelkedik, hibasorozatnál csökken, és az évfolyam sávja fölé legfeljebb
   egy szinttel megy.

## 3. NEM cél

- Fizetős AI-generálás (bankbővítés vagy besorolás) — TILOS.
- A bankfájlok tételeinek átírása, azonosítóinak (és ezzel a naplók / ismétlés-kulcsok) változtatása.
- A pontozás, XP, ranglista, pálya-feloldás, fal-hossz, rivális-tempó, tempó-választó változtatása.
- A többi játék (`vocabLevelForGrade`, `ladderTierIndex` más hívói) viselkedése — a közös függvények változatlanok.
- A célszó kiemelése (D-05 tulajdonosi döntés: a célszó a mondatban kiemelve marad) — érintetlen.

## 4. Rögzített döntések

### 4.1 Mérce (determinisztikus, minden tételre kiszámolható)

Modul: `source/client/src/lib/wordLadderGrading.ts` (tiszta, node-ból tesztelhető).

- **Célrész** (`ladderDifficultyInput`) — CSAK STRUKTÚRÁLT MEZŐ (tulajdonosi döntés 2026-11-22, 15–16. szakasz): szóbanki
  tételnél a `term` (célnyelvi alak, `VocabQuiz.answerTerm` — a kérdés irányától függetlenül, így azonos a nyers bejegyzéssel);
  egyébként a `focus`, ha van (hiányos mondatnál a hiány a helyes válasszal kitöltve, mondat = igen), különben a helyes válasz.
  A `prompt` szövegét a mérce nem elemzi. Dokumentált korlát: magyar `focus` esetén (kézi bank, pl. „Hogy mondjuk angolul:
  olló?”) a magyar alakot méri; a `focus` zárójeles magyar súgója a pont része; kiemelés nélküli mondatkiegészítésnél
  (szerverbank) csak a helyes válasz.
- **Normalizálás**: NFC, nyelvi környezettől független kisbetűsítés (`toLowerCase`), minden szóköz (a nem törő is) egy
  szóközzé, a széli Unicode-írásjel / -szimbólum le (a zárójel kivételével), nyelvenkénti névelő le (en the / a / an / to; de
  der / die / das / den / dem / des / ein…; fr le / la / les / un / une / des / du és az elidált `l'` / `l’` szóköz nélkül).
- **Szó / mondat** (`isLadderSentence`): szó a normalizált szöveg szóközzel elválasztott, betűt vagy számot tartalmazó tagja
  (az önálló írásjel nem szó; a kötőjeles / aposztrófos alak — „arc-en-ciel” — egy szó); mondat = legalább 5 szó. A betűszám,
  a szótag (szavanként ≥ 1), a szótag-levonás és a szószám ugyanezeken a szavakon számol.
- **Pont** = betűszám (névelő nélkül) / nyelvi szorzó (en 1,00 · de 1,35 · fr 1,20 — a szóbank 0. szintjének átlag-betűszáma
  alapján: 6,9 / 9,4 / 8,5) + 2 × (szótag − szó) + 3 × (szó − 1) + 6 (ha mondat) + kategória-súly (word / topic 0, everyday 3,
  phrase 4, regular 5, irregular 7; szóbanknál word 0, phrase 4). Szótag = magánhangzó-csoport (ékezetesekkel), szavanként ≥ 1.
  A bankközi szintkorlát NINCS (16. szakasz): az ND-3 a pontszám-alapú felfelé sorolással teljesül.
- **Alsó korlát (felsorolás csak felfelé):** pont ≥ 20 → legalább 1. szint; pont ≥ 40 → legalább 2. szint. Lefelé nem
  sorolunk (a bank szintje a tartalmi tudást — nyelvtan, ritkaság — is hordozza, amit a felszíni mérce nem lát).
  Mért hatás: kézi bank en 51/627, de 36/478, fr 43/490; szóbank en 109/2664, de 71/2080, fr 74/2064 tétel kerül feljebb
  (jellemzően a 0. szint 3+ szavas kifejezései: „open the door”, „ich habe Hunger”, „ouvre la porte”).
- **Alfok** a (feljebb sorolt) szinten belül, rögzített határokkal (a három nyelv együttes p33 / p67 kvantilisei):
  0. szint ≤ 5 / ≤ 9; 1. ≤ 9 / ≤ 21; 2. ≤ 9 / ≤ 21; 3. ≤ 11 / ≤ 21; 4. ≤ 13 / ≤ 24 (különben 2. alfok). Oszloponként nem
  csökkenő (vak kör 2 O6: a 2. szint felső határa 20 → 21).
- **Fokozat** = szint × 3 + alfok (0–14).
- **Kézi finomítás:** felülíró tábla (`LADDER_STEP_OVERRIDES`, azonosító → fokozat) — induláskor ÜRES; csak dokumentált,
  tételenkénti indoklással bővíthető (validátor-teszt: létező azonosító, 0–14).

### 4.2 Évfolyam-sáv és belépés

- Alapszint: a meglévő `ladderBaseTier` (3–4. → 0, 5–6. → 1, 7–8. → 2, 9–10. → 3, 11–12. → 4).
- **Sáv:** alsó szint = alapszint − 1 (≥ 0), felső = alapszint + 1 (≤ 4). Fokozatban: [alsó×3, felső×3+2].
  (3–4.: 0–5; 5–6.: 0–8; 7–8.: 3–11; 9–10.: 6–14; 11–12.: 9–14.)
- **Belépő fokozat** = alapszint×3 + pálya-eltolás; eltolás = round((pálya − 1) × k / 9), k = min(3, felső fokozat − alap
  fokozat). Az 1. pálya mindig az évfolyam alapszintjének legkönnyebb alfoka; a 10. pálya legfeljebb egy szinttel feljebb
  indul. Ismeretlen évfolyam → a meglévő 4. évfolyamos alapérték (0. szint, 0. alfok): óvatos alacsony kezdés.
- **SPEC-VÁLTOZÁS** a 2026-09-29-es 6. döntéshez képest: „a 10. pálya minden évfolyamon a legfelső szintről kérdez” helyett a
  10. pálya is az évfolyam sávjában marad (tulajdonosi kérés 2026-11-22). A `ladderTierForLevel` (menü-felirat) az új
  belépő fokozat szintjét adja; a hozzá tartozó teszt ennek megfelelően változik (dokumentált spec-változás).

### 4.3 Fokozatos emelés futás közben

- `createLadderStepSession(évf., pálya)`: 3 egymás utáni helyes válasz (a közös `HARDEN_AFTER`) → +1 fokozat; 2 egymás utáni
  hiba (`SOFTEN_AFTER`) → −1 fokozat; lépés után a sorozat nullázódik; egy hiba megszakítja az emelkedő sorozatot.
- Korlátok: a sáv [alsó, felső] fokozata. Fölfelé így legfeljebb alapszint + 1 (felső korlát az évfolyam sávja fölött).
- A „körök száma” két szinten emel: futáson belül a helyes sorozatokkal, futások között a pálya-feloldással (a belépő fokozat
  pályánként nő).

### 4.4 Kiválasztás

- A futás összes tétele (kézi + szóbank + szerver) fokozat-vödrökbe kerül (15); a sávon kívüli vödrök kiürülnek.
- A meglévő `pickUnseen` a vödrökön fut: a kért fokozat, majd távolság szerint (azonos távolságon előbb a könnyebb). A
  szóbankos / beférő (`accept`) előszűrés és a „minden második szóbankos” szabály változatlan.
- A szóbank-készlet építése (`buildPool`) a futás belépő SZINTJE ± 1 szinten marad (a fokozat szintje = fokozat / 3).

### 4.5 Visszafelé-kompatibilitás

- Pontozás / ranglista: változatlan (1.2/4. pont) → nincs új verziókulcs.
- Haladás-kulcsok (`wordladder-<nyelv>`), tárolt pályák, ismétlés-kulcsok: változatlanok.
- D-05: a célrész-kiemelés érintetlen.

## 5. Edge case-ek

- Évfolyam 3 alatt / 12 fölött / nem szám → a meglévő `clampLadderGrade` (3–12) után számolunk; a modul maga is vág.
- Pálya NaN / 0 / 99 → 1–10-re vágva.
- Üres vödör a kért fokozaton → a `pickUnseen` a sávon belül a szomszédba lép (azonos távolságon előbb a könnyebb). Ha a
  kért fokozat minden tétele látott, de van nem látott a sávban, a keresési sorrend első nem látottat tartalmazó vödre jön.
  **Teljes kimerülésnél** (a sáv minden tétele látott) a keresési sorrend ELSŐ NEM ÜRES vödrének — jellemzően a kért
  fokozatnak — a saját legrégebben látott tétele jön, akkor is, ha egy szomszéd vödörben régebbi van (a közös `pickUnseen`
  szabálya, vak kör 1 L8; teszt: `word-ladder-grading.test.ts` O3/L8). Ha a sávban egyáltalán nincs tétel (a mért bankokkal
  nem fordul elő), a teljes vödörsor a tartalék.
- Szerver-bank tétel kategória nélkül → kategória-súly 0.
- Szóbankos tétel célrésze: a lap a `VocabQuiz.focus`-t a tételre teszi a besoroláshoz (a kiemelés útja változatlan).
- `?wlItems=` teszt-út: változatlan (nem a választón megy át).

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [x] A1 — WHEN bármely kézi- vagy szóbank-tételre (en / de / fr) a mércét alkalmazzuk THEN the system SHALL véges pontot és
  0–14 közötti fokozatot adni, és a fokozat szintje SHALL ≥ a bank szintje.
- [x] A2 — WHEN a bankokat osztályozzuk THEN a fokozatok átlagpontja SHALL szintenként szigorúan nőni (0 → 4), és minden
  nyelv minden szintjének minden alfokán SHALL legalább 5 % (és legalább 10) tétel lenni (kézi + szóbank együtt).
- [x] A3 — WHEN egy tétel pontja ≥ 20 (≥ 40) THEN fokozatának szintje SHALL ≥ 1 (≥ 2).
- [x] A4 — WHEN évfolyam-sávonként (3–4., 5–6., 7–8., 9–10., 11–12.) lekérjük az osztályozott bankot THEN minden nyelven a
  sáv minden fokozatán SHALL legalább 20 tétel lenni; szintenként a 0. alfokon legalább 20 egyes szó, a 2. alfokon legalább
  20 kifejezés (minimum, nem kizárólagosság — mért, ld. 11. szakasz), és a sávon kívüli
  fokozat SHALL üres lenni.
- [x] A5 — WHEN az évfolyam ismert THEN az 1. pálya belépő fokozata SHALL az alapszint×3 lenni; a belépő fokozat SHALL pályánként
  nem csökkenni, és SHALL ≤ min(sáv teteje, (alapszint + 1)×3) maradni.
- [x] A6 — WHEN az évfolyam ismeretlen THEN a játék SHALL a 4. évfolyam belépőjével (0. fokozat az 1. pályán) indulni.
- [x] A7 — WHEN 3 egymás utáni helyes válasz érkezik THEN a fokozat SHALL eggyel nőni; WHEN 2 egymás utáni hiba THEN SHALL eggyel
  csökkenni; WHEN a sorozatot hiba szakítja meg THEN SHALL NOT nőni; a fokozat SHALL a sávon belül maradni.
- [x] A8 — WHEN 3. évfolyamos játszik bármely pályán, bármely válaszsorozattal THEN a kiválasztott tétel fokozata SHALL ≤ 5
  (legfeljebb 1. szint) lenni.
- [x] A9 — *(PR-2 ezen az ágon: teljesítve, ld. végrehajtás „Mért számok”)* WHEN egy 3. évfolyamos az 1. pályán végig helyesen válaszol (böngészőben) THEN az első kérdés SHALL a 0. szintről jönni,
  egyik kérdés sem SHALL 1. szint fölötti lenni, és a futás végére a kérdezett fokozat SHALL nagyobb lenni a kezdetinél.
- [x] A10 — *(PR-2 ezen az ágon: teljesítve)* WHEN az évfolyam × pálya futáson belüli ismétlés-mentessége mért (a meglévő 6. döntés-teszt) THEN SHALL
  ismétlésmentes maradni az új választóval is.
- [x] A11 — *(ezen a fejen: a lap, a pontozás és a haladás diffje üres)* A pontozás (XP, ranglista-nehézség) és a haladás-kulcsok SHALL változatlanok maradni; a D-05 kiemelés érintetlen.
- [x] A12 — A felülíró tábla minden bejegyzése SHALL létező azonosítóra mutatni, 0–14 fokozattal.

## 7. Tesztterv

- `source/tests/word-ladder-grading.test.ts` (új): A1–A8, A12 — mérce, osztályozás mindhárom nyelv kézi + szóbankján,
  évfolyam-sávos bankok, belépés, lépés-szabály, 3. évfolyamos szimuláció (minden pálya, véletlen válaszsorozatok).
- `source/tests/word-ladder-levels.test.ts`: a 6. döntés-teszt az új szabályra (A5, dokumentált spec-változás); a futáson belüli
  ismétlés-mentesség az új választóval (A10).
- `source/tests/word-ladder-play.spec.ts` (új eset): A9 böngészőben (3. évfolyam, 1. pálya, `?seed=&wall=`, helyes fogások a
  teszt-kampós `data-correct`-tel, a probe `questionStep` mezője).
- Változatlanul zöld: a Szólétra többi egység- és böngészős tesztje, `tsc --noEmit`, `npm run gate:stage`.

## 8. Kockázatok / visszavonás

- A felszíni mérce nem lát ritkaságot / nyelvtani nehézséget → csak felfelé sorol, a bank szintje alsó korlát marad.
- Kis sávban (3–4.: 6 fokozat) a futás hamarabb ér a sáv tetejére → ott a `pickUnseen` a sávon belül marad; a mért készlet
  (en 0–1. szint ~1400 tétel) bőven elég.
- Visszavonás: egy commit revertje; a bankfájlok és a tárolt adatok nem változnak.

## 9. Döntések (tulajdonos, űrlapon, 2026-11-22 — az orkesztrátor közvetítésével)

- **ND-1 — a 10. pálya felső korlátja: (a) évfolyam-sáv** (legfeljebb alapszint + 1) — DÖNTÖTT, megvalósítva (4.2).
  Elvetett: (b) a régi 6. döntés (10. pálya = B2 minden évfolyamon).
- **ND-3 — kereszt-banki szintellentmondás (22 angol tétel): (a) a mérce kezeli** (felfelé sorolás) — DÖNTÖTT; tételenkénti
  kézi felülírás nincs (`LADDER_STEP_OVERRIDES` üres marad).
- **ND-2 — sűrűbb kezdő (A1) anyag: (b) fizetős, keretes generálás** — DÖNTÖTT, de **külön költségkeret-jóváhagyásig semmi nem
  generálható, fizetős szolgáltató nem hívható**. A munka S3 szeletként a tervben (12. szakasz); a keretet az orkesztrátor kéri
  a tulajdonostól.

**PR-bontás (tulajdonos / orkesztrátor, 2026-11-22): két PR.**
- PR-1 `feat/szoletra-szintezes-1`: terv + végrehajtás + `wordLadderGrading.ts` + `word-ladder-grading.test.ts` + C-SZL-1 —
  az éles működést NEM változtatja (a modult a lap még nem hívja).
- PR-2 `feat/szoletra-szintezes-2` (a PR-1-re épül): S2 bekötés + a két dokumentált teszt-módosítás + e2e A9.
- S3 (generálás): külön PR, csak a keret jóváhagyása után.

## 10. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md`

## 11. Mért osztályozás — fokozatonkénti tételszám (kézi + szóbank; „kifejezés” = phrase / everyday)

Fejhez kötve: a `feat/szoletra-szintezes-1` 17. szakaszbeli állapota (strukturált mérce, korlát nélkül, teljes magánhangzó-osztály). Ez az EGYETLEN tábla, amelyből az
A4 küszöbök és az S3 hiánya számol.

```
fokozat:        0   1   2   3   4   5   6   7   8   9  10  11  12  13  14
en szó:       205 186  86 322 169  16 224 181  75 188 175  44 155 102  29
en kifejezés:   0   0  99   0 154 199   1 111 149   0 103 126  15  84  93
de szó:       169 142  28 255 127  26 207 144  24 181 122  11 134  86  13
de kifejezés:   0   1  95   1 107 173   3  66 126   1  50 125   1  35 105
fr szó:       102 194  68 209 140  30 184 150  39 153 109  46 130  76  30
fr kifejezés:   0   0  77   0  71 216   0  30 178   0  21 155   1  32 113
```

A kifejezések nagyobb része a szint 2. alfokára esik, de az 1–4. szinten az 1. alfokon is van (pl. en 4. fokozat 155); a 0.
alfokon gyakorlatilag nincs (0–1 tétel). Az A4: fokozatonként ≥ 20 tétel, 0. alfok ≥ 20 szó, 2. alfok ≥ 20 kifejezés.

## 12. S3 — sűrűbb kezdő A1 anyag nyelvenként (fizetős generálás; KERET-JÓVÁHAGYÁSRA VÁR, végrehajtani TILOS addig)

**Cél:** a 3–4. évfolyam belépő fokozatain (0–1. fokozat) nyelvenként legalább 300 egyes szó.

**Kiinduló állapot és hiány — a 11. szakasz táblájából (egyes szavak):**

| nyelv | 0. fokozat | hiány 300-ig | 1. fokozat | hiány 300-ig |
|---|---|---|---|---|
| en | 205 | 95 | 186 | 114 |
| de | 169 | 131 | 142 | 158 |
| fr | 102 | 198 | 194 | 106 |

Összes hiány: 0. fokozat 424, 1. fokozat 378 szó. **Javasolt mennyiség (becslés, UNVERIFIED):** a két fokozat hiányának
összege nyelvenként (en 209, de 289, fr 304), a mérce szerint ≤ 9 pontos egyes szavak; összesen ~800 bejegyzés (a pontos
fokozat-eloszlás a generálás után újramérendő).

**A meglévő generáló útvonal (tény):** a szóbank tartalma (#431 angol, 2664 bejegyzés; a német / francia hasonlóan) ügynöki
tartalomszeletekben készült a `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` szerint, majd a vak megoldó kör
(`source/scripts/vocab-bank.ts blind-export` → független megoldó → `blind-score`, kanári-tételekkel) és javító kör követte; a
szerkezeti őr a `vocabBankProblems` / `minimumProblems`. Bejegyzésenkénti költségmérés NINCS a repóban (UNKNOWN).

**Költségbecslés (UNVERIFIED — tokenbecslés, az USD az aktuális árlistával számolandó):**
- generálás: ~800 bejegyzés × ~80 kimeneti token ≈ 64 ezer kimeneti token; 50-es kötegekben 16 köteg × ~4 ezer bemeneti token
  (szabály + téma-kvóta + meglévő termek kizáró listája) ≈ 64 ezer bemeneti token;
- vak megoldó: ~800 kérdés × ~150 bemeneti / ~30 kimeneti token ≈ 120 ezer bemeneti + 24 ezer kimeneti token;
- javító kör (a tételek ~30 %-a, a #431 1. körének arányából becsülve: 73 jelzés / ~2664): ≈ +50 ezer bemeneti / +25 ezer
  kimeneti token;
- összesen nagyságrendileg **~0,23 M bemeneti + ~0,11 M kimeneti token**; Opus-osztályú modellel nagyságrendileg
  **5–20 USD** (UNVERIFIED: árlista-feltevés; a pontos összeg = tokenek × a jóváhagyáskori hivatalos ár). Keretjavaslat:
  **legfeljebb 25 USD**, futáskorláttal (a generáló leáll, ha a mért költség eléri a keretet).

**Elfogadás (S3):** a validátorok (`vocabBankProblems`, `minimumProblems`, `word-ladder-grading.test.ts` A1–A4) zöldek; a vak
megoldó kanári 10/10, a jelzett tételek javítva; a 0–1. fokozat egyes-szó-száma nyelvenként ≥ 300; a mért tényleges költség a
PR-leírásban (gép által rögzített számláló, nem becslés); a hiány a 11. szakasz táblájának újramérésével igazolva.

## 13. Vak kör 1 (fej 0fe24459) — összefoglaló

2 blokkoló + 4 közepes + 3 kicsi lelet. MARADT: locale-független kisbetűsítés (L2), nyelvenkénti névelő / francia elízió (L3),
közös mondatfelismerő a nyers és a kérdés-úton (L4), bankközi korlát (L1 — a 15. szakasz szerint szűkítve), reset-teszt (L7),
kimerülési szabály a `pickUnseen` szerint (L8), fejenkénti dokumentum-státusz (L6), a csapdakatalógus jelölése (L9). KIKERÜLT
a 15. szakasz szerint: a célnyelvi-oldal választó (L5 javítása).

## 14. Vak kör 2 (fej e2d8c86d) — összefoglaló és a monotonitás

1 blokkoló + 3 közepes + 2 kicsi lelet. MARADT: a széli írásjel a kulcsban (L5), a vödrözés a tétel saját szintjével
(`declaredTierOf`, L2), a monotonitás invariánsa és a határpont-javítás (L4), a leíró katalógus-mondat (L6). KIKERÜLT a 15.
szakasz szerint: a kiemelés nélküli prompt-hiány kinyerése (L1) és a magyar-súgó felismerés (L3) — dokumentált korlát lett.

### 14.1 A monotonitás invariánsa (O6)

**Invariáns (egy mondatban):** a futás fokozata helyes válaszra soha nem csökken és válaszonként legfeljebb egyet lép; egy
szinten belül a következő alfok minden tételének mércepontja nagyobb az előző alfok minden tételénél; a fokozat-határpontok
szintenként nem csökkennek; **kivétel** a szinthatár (a 2. alfokról a következő szint 0. alfokára), ahol a bank-szint
elsőbbsége miatt a pont visszaeshet — ott a következő szint 0. alfokának mediánja nem kisebb az előző szint 0. alfokáénál.

**Döntés (L4):** a 15 fokozatos terv (szint × alfok, a bank-szint alsó korlát, lefelé nem sorolunk — 4.1, ND-3) miatt a
szinthatáron a felszíni pont szükségszerűen visszaeshet (pl. en 2. fokozat medián 14 → 3. fokozat medián 7): a bank szintje a
tartalmi nehézséget (ritkaság, nyelvtan) hordozza, amit a felszíni mérce nem lát. Ezt a terv vállalja; a fokozat definíciója
csak annyiban változik, hogy a határpontok oszloponként nem csökkenhetnek (a 2. szint felső határa 20 → 21). Mért mediánok
fokozatonként (a 17. szakasz állapotában): en 4 7 14 · 7 15 25 · 7 14 40 · 8 15 31 · 11 16 48; de 3 6,4 15,7 · 6,4 14,4 26,1 ·
6,4 12,9 29,8 · 7,9 14,1 26,1 · 9,9 16,6 33; fr 3,3 6,2 13,7 · 7 12,3 26,5 · 7 11,7 30,2 · 7,8 14,3 29,3 · 9,8 17,3 34,5. A 0. alfok mediánja
minden nyelven nem csökken (en 4 → 7 → 7 → 8 → 11); az 1. alfok mediánja az 1. → 2. szinten enyhén csökken (en 15 → 14, de
14,4 → 12,9, fr 12,3 → 11,7) — ezt a terv nem garantálja (eloszlás, nem határpont).

**L2:** a vödrözés a tétel saját `tier` mezőjét használja (`declaredTierOf`); a készlet-index csak szint nélküli tételnél
(szerverbank) pótlás — így egy kimerült szint pótlására más készletbe került tétel nem sorolódik vissza.

## 15. Tulajdonosi döntés: CSAK STRUKTÚRÁLT MEZŐK (2026-11-22, vak kör 3 után — a konvergencia-őr új kört tiltott)

**Döntés:** a mérce NEM elemzi a kérdés / utasítás szabad szövegét. Bemenete kizárólag a tétel strukturált mezői: a helyes
válasz (kézi bank), a szóbank `term`-je, és ha a tételnek van `focus` mezője, az — normalizálva (4.1).

**Kikerült és miért** (mindegyik a prompt szövegéből következtetett, és mindhárom vak körben újabb hibát hozott — vak kör 3:
L1 „Mi a „” mintára hamis bankközi korlát a „les jeux” alakfeladatból, L2 a `focus` belsejéből „? ” utáni vágás):
- a célnyelvi-oldal választó (magyarság-pont, „Mit jelent / Mire / magyarul …” minták, `TO_FOREIGN`);
- a kiemelés nélküli prompt-hiány kinyerése és a „: ” / „? ” utasításvágás (`fillBlank` a promptból);
- a magyar zárójeles súgó felismerése és levágása (`stripHungarianGlosses`).

**Szűkítve (a 16. szakasz szerint azóta teljesen kikerült):** a bankközi korlát csak pontos egyezésű EGYES SZÓRA élt (kézi helyes válasz = szóbanki `term`); mondat / kifejezés
soha nem forrás (vak kör 3 L5); csak a teljes, szűretlen bankokból épülhet, ezt a márkázott típus és a kötelező paraméter
kényszeríti (L4; a végrehajtási recept is így írja). **Javítva:** a nem törő szóköz és az önálló írásjel nem szó (L3: a
„comment va ta famille ?” négy szó, nem mondat). **L6:** a fokozat-tábla és az S3 hiánya egyetlen, fejhez kötött táblából
(11–12. szakasz).

**Dokumentált korlátok (tudatosan, heurisztika helyett):** magyar `focus` esetén a magyar alakot méri; a `focus` zárójeles
magyar súgója (de0-097, de1-077) a pont része; kiemelés nélküli mondatkiegészítésnél (a migrációs szerverbank 4. tétele) csak a
helyes válasz.

**Mért hatás a 130f18e3-hoz képest:**

| nyelv | kézi: pont változott | kézi: fokozat változott | kézi: szint változott | szóbank: pont | szóbank: fokozat | korlát-kulcs |
|---|---|---|---|---|---|---|
| en | 275 / 627 | 136 | 26 | 5 / 2664 | 28 | 2793 → 1861 |
| de | 178 / 478 | 98 | 35 | 5 / 2080 | 39 | 2228 → 1502 |
| fr | 140 / 490 | 88 | 29 | 3 / 2064 | 25 | 2185 → 1480 |

**Tesztek (dokumentált spec-változás, nem gyengítés — a szerződés változott):** a heurisztika-tesztek (O2/L5, O5, O5/L1,
O5/L3, O2/L1 régi alakja) helyére S1 (strukturált bemenet), S2 (a mérce a prompt szövegétől független: minden kézi tétel más
prompttal azonos pontot és fokozatot kap), S3 (normalizálás, nem törő szóköz, önálló írásjel), S4 (korlát csak egyes szóra),
S5 (márkázott korlát, típusszintű `@ts-expect-error`) lépett; az A1–A8, A12, a monotonitás- és lépés-tesztek maradtak.
Mutációs ellenpróba: 7/7 mutáns bukik (6 a saját tesztjén, a márka eltávolítása a `check:test`-en: TS2578).

## 16. Tulajdonosi döntés: KORLÁT ELHAGYÁSA (2026-11-22, vak kör 4 után)

**Döntés:** a bankközi szintkorlát teljesen kikerül a PR-1-ből és a PR-2-ből; az ND-3 („a mérce kezeli”) a pontszám-alapú
felfelé sorolással (20 / 40 pont, 4.1) teljesül.

**Kikerült:** `buildLadderTermFloors`, a márkázott `LadderTermFloors` típus, minden `floors` paraméter (`ladderItemStep`,
`vocabEntryStep`, `ladderStepBuckets`, `gradedLadderBank`), a lapon a teljes szóbankos korlátépítés, és a korlát tesztjei (S4, S5,
a márkára épülő `3d-wiring` állítások) — dokumentált spec-változásként. Ezzel a vak kör 4 L1 (a korlát egy bankon belül is
átsorolt: `de0-093` „ist” a B1-es `de3-044` miatt) és L3 (a márka nem igazolja a teljes bankot) felülete megszűnik.

**Javítva:**
- **L2:** szóbanki tételnél a mérce a `term`-et (`VocabQuiz.answerTerm`, célnyelvi alak) méri — a lap a besoroláshoz ezt adja
  (`term` mező), a megjelenített `focus` változatlan. Teszt (S6): mindhárom szóbank minden 7. bejegyzésére a valódi
  generátorral hu→cél és cél→hu kérdés, a pont és a fokozat azonos a nyers bejegyzésével (`en0-freetime-019`: „play the piano”,
  nem a magyar „zongorázik”).
- **L4:** a szótag-minimum és -levonás ugyanazokon a szavakon (`wordsOf`) fut: „l'arc-en-ciel” 11,5 pont / 4. fokozat
  (korábban 7,5 / 3.); teszt (S7) kötőjeles és aposztrófos alakkal.
- **L5:** a katalógus és a terv nem állít kizárólagosságot a kifejezések alfokára (a tényleges minimumot nevezi meg).
- **L6:** a csapdakatalógus bevezetője visszaállt a főág szövegére (nem minősíti a review hatókörét).

**A kereszt-banki eltérések mérve** (az 1.2 szakasz definíciójával: a kézi célrész a szóbankban magasabb szinten szerepel):
en 36 tétel (ebből a 0. szinten 22 — az 1.2-ben jelentett szám), de 12, fr 24. **A pontszám-alapú felsorolás egyiket sem emeli
a szóbanki szintre** (en 0 / 36, de 0 / 12, fr 0 / 24): mind rövid egyes szó, 20 pont alatt (pl. `en0-012` „moon”, `de0-055`,
`fr0-024`). Ez a döntés vállalt következménye: a bank-szint és a mérce együtt dönt, a két bank közti eltérés nem emel.

**Mutációs ellenpróba a maradó szabályokra** (`mutate4.mjs`): 8 / 8 mutáns bukik — prompt-elemzés vissza (A2, S1, S2), szóbanki
`term` kihagyva (S6), szótag-levonás részszavakon (S7), locale-függő kisbetű (S3), önálló írásjel szóként (S3), vödrözés
készlet-indexszel (O6/L2), alfok-sorrend felcserélve (O6/L4, S7), pont-alapú felsorolás ki (A1/A3).

## 17. PR #528 Copilot-észrevételek (2026-11-22, a b680efb4-re építve)

- **Szótag-osztály:** a magánhangzó-csoport osztályából hiányzott az á í ó ő ú ű (a magyar `focus` is a mérce bemenete), és a
  francia ÿ, valamint az ì ò. Javítás: közös `VOWEL_GROUP` (angol + magyar + német + francia, kisbetűs — a normalizálás után
  nagybetű nem fordul elő). Teszt (C1): minden magánhangzóra „bvb” → „bvbvb” pontosan +2 betű + 1 szótag; `en0-018` „Barát”
  5 → 7 pont, 0. → 1. fokozat. Mért hatás: a 11. szakasz táblája (előtte en 214 / 181, de 174 / 138, fr 111 / 186 a 0–1.
  fokozat egyes szavai; utána en 205 / 186, de 169 / 142, fr 102 / 194); az S3 hiánya ebből újraszámolva.
- **Felülíró tábla:** a `LADDER_STEP_OVERRIDES[String(item.id)]` az örökölt tulajdonságokat (`constructor`, `toString`,
  `__proto__`) is találatnak vette. Javítás: csak saját kulcs (`Object.hasOwn`) és csak 0–14 közötti egész érték. Teszt (C2):
  ezekkel az azonosítókkal a fokozat azonos a szokásos azonosítóéval, a vödrözés nem dob.
