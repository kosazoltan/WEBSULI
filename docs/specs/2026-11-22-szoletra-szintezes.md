# Spec: Szólétra — évfolyamhoz és tudáshoz igazított szintezés, osztályozott szó- és kifejezésbank

> Dátum: 2026-11-22 · Szerző: Claude (fejlesztő alügynök) · Állapot: VÁZLAT → a tulajdonosi kérés alapján végrehajtva
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

- **Célrész** (`ladderDifficultyInput`): hiányos mondatnál a mondat a helyes válasszal kitöltve (mondat = igen); „… angolul /
  németül / franciául” kérdésnél a helyes opció; egyébként a célrész (`focus`); célrész nélkül (helyzet-kérdés) a helyes opció.
  Mondatnak számít az 5+ szavas célrész is.
- **Pont** = betűszám (névelő nélkül) / nyelvi szorzó (en 1,00 · de 1,35 · fr 1,20 — a szóbank 0. szintjének átlag-betűszáma
  alapján: 6,9 / 9,4 / 8,5) + 2 × (szótag − szó) + 3 × (szó − 1) + 6 (ha mondat) + kategória-súly (word / topic 0, everyday 3,
  phrase 4, regular 5, irregular 7; szóbanknál word 0, phrase 4). Szótag = magánhangzó-csoport (ékezetesekkel), szavanként ≥ 1.
- **Alsó korlát (felsorolás csak felfelé):** pont ≥ 20 → legalább 1. szint; pont ≥ 40 → legalább 2. szint. Lefelé nem
  sorolunk (a bank szintje a tartalmi tudást — nyelvtan, ritkaság — is hordozza, amit a felszíni mérce nem lát).
  Mért hatás: kézi bank en 51/627, de 36/478, fr 43/490; szóbank en 109/2664, de 71/2080, fr 74/2064 tétel kerül feljebb
  (jellemzően a 0. szint 3+ szavas kifejezései: „open the door”, „ich habe Hunger”, „ouvre la porte”).
- **Alfok** a (feljebb sorolt) szinten belül, rögzített határokkal (a három nyelv együttes p33 / p67 kvantilisei):
  0. szint ≤ 5 / ≤ 9; 1. ≤ 9 / ≤ 21; 2. ≤ 9 / ≤ 20; 3. ≤ 11 / ≤ 21; 4. ≤ 13 / ≤ 24 (különben 2. alfok).
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
- Üres vödör a kért fokozaton → a `pickUnseen` a sávon belül a szomszédba lép; ha a sáv minden tétele látott, a sávon belül a
  legrégebben látott jön. Ha a sávban egyáltalán nincs tétel (nem fordulhat elő a mért bankokkal), a teljes vödörsor a tartalék.
- Szerver-bank tétel kategória nélkül → kategória-súly 0.
- Szóbankos tétel célrésze: a lap a `VocabQuiz.focus`-t a tételre teszi a besoroláshoz (a kiemelés útja változatlan).
- `?wlItems=` teszt-út: változatlan (nem a választón megy át).

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [ ] A1 — WHEN bármely kézi- vagy szóbank-tételre (en / de / fr) a mércét alkalmazzuk THEN the system SHALL véges pontot és
  0–14 közötti fokozatot adni, és a fokozat szintje SHALL ≥ a bank szintje.
- [ ] A2 — WHEN a bankokat osztályozzuk THEN a fokozatok átlagpontja SHALL szintenként szigorúan nőni (0 → 4), és minden
  nyelv minden szintjének minden alfokán SHALL legalább 5 % (és legalább 10) tétel lenni (kézi + szóbank együtt).
- [ ] A3 — WHEN egy tétel pontja ≥ 20 (≥ 40) THEN fokozatának szintje SHALL ≥ 1 (≥ 2).
- [ ] A4 — WHEN évfolyam-sávonként (3–4., 5–6., 7–8., 9–10., 11–12.) lekérjük az osztályozott bankot THEN minden nyelven a
  sáv minden fokozatán SHALL legalább 20 tétel lenni; szintenként a 0. alfokon legalább 20 egyes szó, a 2. alfokon legalább
  20 kifejezés (a kifejezések a mérce szerint a szint 2. alfokára esnek — mért, ld. 11. szakasz), és a sávon kívüli
  fokozat SHALL üres lenni.
- [ ] A5 — WHEN az évfolyam ismert THEN az 1. pálya belépő fokozata SHALL az alapszint×3 lenni; a belépő fokozat SHALL pályánként
  nem csökkenni, és SHALL ≤ min(sáv teteje, (alapszint + 1)×3) maradni.
- [ ] A6 — WHEN az évfolyam ismeretlen THEN a játék SHALL a 4. évfolyam belépőjével (0. fokozat az 1. pályán) indulni.
- [ ] A7 — WHEN 3 egymás utáni helyes válasz érkezik THEN a fokozat SHALL eggyel nőni; WHEN 2 egymás utáni hiba THEN SHALL eggyel
  csökkenni; WHEN a sorozatot hiba szakítja meg THEN SHALL NOT nőni; a fokozat SHALL a sávon belül maradni.
- [ ] A8 — WHEN 3. évfolyamos játszik bármely pályán, bármely válaszsorozattal THEN a kiválasztott tétel fokozata SHALL ≤ 5
  (legfeljebb 1. szint) lenni.
- [ ] A9 — WHEN egy 3. évfolyamos az 1. pályán végig helyesen válaszol (böngészőben) THEN az első kérdés SHALL a 0. szintről jönni,
  egyik kérdés sem SHALL 1. szint fölötti lenni, és a futás végére a kérdezett fokozat SHALL nagyobb lenni a kezdetinél.
- [ ] A10 — WHEN az évfolyam × pálya futáson belüli ismétlés-mentessége mért (a meglévő 6. döntés-teszt) THEN SHALL
  ismétlésmentes maradni az új választóval is.
- [ ] A11 — A pontozás (XP, ranglista-nehézség) és a haladás-kulcsok SHALL változatlanok maradni; a D-05 kiemelés érintetlen.
- [ ] A12 — A felülíró tábla minden bejegyzése SHALL létező azonosítóra mutatni, 0–14 fokozattal.

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

## 9. NYITOTT DÖNTÉSEK (a javasolt opcióval haladunk, mind visszafordítható)

- **ND-1 — a 10. pálya felső korlátja.** (a) *(Javasolt)* évfolyam-sáv: legfeljebb alapszint + 1 — a tulajdonosi kérés
  szövegét követi; (b) a régi 6. döntés (10. pálya = B2 minden évfolyamon). Indok: a 3.-osnak a B2 a mérés szerint a
  „felsőbb szintes” nehéz szó.
- **ND-2 — kézi bankbővítés.** A mért készlet minden sávban elég (ld. A4-teszt számai), ezért bővítés nem kell. Ha később a
  tulajdonos sűrűbb A1-szókincset kér: (a) *(Javasolt)* kézi bővítés a szóbank 0. szintjén (ingyenes, lassabb); (b) keretes,
  jóváhagyott generálás.
- **ND-3 — kereszt-banki szintellentmondás (22 angol tétel).** (a) *(Javasolt)* marad, a mérce felfelé sorolása kezeli a
  hosszabbakat; (b) tételenkénti kézi felülírás a `LADDER_STEP_OVERRIDES`-ban.

## 10. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md`

## 11. Mért osztályozás (S1, 2026-11-22) — fokozatonkénti tételszám (kézi + szóbank; „kifejezés” = phrase / everyday)

```
fokozat:        0   1   2   3   4   5   6   7   8   9  10  11  12  13  14
en szó:       222 181  74 320 171  17 224 183  72 189 178  40 156 102  28
en kifejezés:   0   0  99   0 152 202   1 101 158   1 102 126  15  84  93
de szó:       171 145  25 259 123  25 212 140  22 178 127   9 134  85  14
de kifejezés:   0   1  94   1  98 184   3  50 141   1  43 132   1  29 111
fr szó:       109 186  69 213 139  25 186 149  40 156 109  43 128  77  31
fr kifejezés:   0   0  74   0  72 220   0  22 184   0  21 155   1  32 113
```

A tervezett „1–2. alfokon ≥ 1 kifejezés” küszöb a 0. szint 1. alfokán (en, fr) nem teljesült: a legrövidebb kifejezés
(„thank you”) is 15 pont, ezért a kifejezések a szint 2. alfokán gyűlnek — ez a kívánt sorrend (előbb egyes szavak, utána
kifejezések). Az A4 ennek megfelelően: fokozatonként ≥ 20 tétel, 0. alfok ≥ 20 szó, 2. alfok ≥ 20 kifejezés.
