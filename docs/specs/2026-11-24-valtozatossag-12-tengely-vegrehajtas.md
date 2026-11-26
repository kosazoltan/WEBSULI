# Végrehajtás: a 12 variációs tengely (tananyag-változatosság, 2026-11-24)

Forrás: tulajdonosi döntés, 2026-11-24 (űrlap): **„Mind a 12, szakaszolva”**, élesben **azonnal minden új leckére**. Kutatási minták:
- **H5P** (45+ tartalomtípus: kártyafordító, kiemelés, sorba rendezés, elágazó történet, keresztrejtvény);
- **Oppia** (beszélgetős kártyafelépítés, tippek);
- **Khan Academy Perseus** (kb. 30 interaktív elem: kategorizáló, számegyenes, becslés).

Alap: a `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` lánc. Az S5a–S6c szeletek beolvadtak.

Élesítésük a V0-ban történik: a terv (`docs/specs/2026-11-24-valtozatossag-alapbol-be.md`) és a végrehajtási utasítás a V0 saját PR-jában (`feat/valtozatossag-alapbol-be-v2`) kerül be. Ez a dokumentum felülírja az alaplánc „alapból KI” előírását (`2026-11-20-tgm-valtozatossag-abrak.md` 5.1): a tulajdonos 2026-11-24-i döntése szerint **élesben alapból BE**, az `off` vészfék.

| # | Tengely | Állapot / szelet |
|---|---|---|
| 1 | Fejezetváz-készlet | kész (S6a, hat minta) |
| 2 | Nyitásformák | kész (S5b); bővítés: kihívás, képtalálós, „híres történet” → **V1** |
| 3 | Új interaktív feladatok: igaz/hamis sorozat, szókiemelés, kategorizálás, számegyenesre helyezés, becslés csúszkával | **V2** (két rész: séma + megjelenítő + pontozó; gyártási prompt + kapu) |
| 4 | Kártyaformák: fordítókártya, lépésenkénti felfedés, „Tudtad?”, összehasonlító tábla, idővonal-kártya | **V3** |
| 5 | Elágazó mini-történet | részben kész (`decisionStory` ábra); döntés–következmény feladat → **V3** |
| 6 | Témakontextus a példákban (sport, űr, állatok, játék, főzés) | **V1** (determinisztikus kiosztás a lecke azonosítójából) |
| 7 | Narrátor / szerzői hang | kész (S6b) |
| 8 | Összefoglaló formák (gondolattérkép, 3-2-1, „Tanítsd meg a barátodnak!”, villámkártyák) | **V1** (szöveges formák); villámkártya → **V3** |
| 9 | Kvízkérdés-típusok keverése (többválasztós, igaz/hamis, képválasztós, beírós szám) | **V4** |
| 10 | Ritmus- és hosszvariáció | **V1** (fejezethossz-sáv a vázzal) |
| 11 | Játékos elemek: fejezetvégi „boss-kérdés”, sorozatjelvény | **V5** |
| 12 | Szókereső, keresztrejtvény (szókincsleckék) | **V5** |

Közös szabályok minden szeletre:
- a kiosztás determinisztikus (a lecke azonosítójából számolt mag);
- a gyártási kapu ellenőrzi, hogy ugyanabban a tantárgy–évfolyam sorozatban két egymás utáni lecke ne kapja ugyanazt a vázat;
- **blokkminimum:** fejezetenként legalább **3** különböző blokkfajta (`kind`; az `animate` különböző `animKind`-jai egynek számítanak). Kivétel: az egyetlen `recap` blokkból álló záró fejezet. Négy- vagy többféle blokk → átmegy. Kettő → a kapu egy javító fordulót kér;
- minden szelet a szokásos kapulánccal megy, és minden új interakció saját pontozóteszttel indul.

**Kompatibilitási előlépés: V-kompat, a V2 és a V3 előtt kötelező** (review #583).
- A mai kliens csak az ismeretlen `animate.animKind`-ot szűri. Új `kind` vagy `tryKind` esetén az egész leckét sérültnek mutathatja (`shared/lesson-schema.ts`, `client/src/lesson-runtime/LessonView.tsx`).
- Ezért előbb külön szelet jön, amely az olvasási sémában az ismeretlen `kind`-ot és `tryKind`-ot a blokk kihagyásával tűri; a lecke többi része megjelenik.
- Ez egy élesítési körrel (deploy) **megelőzi** az új fajták gyártását, hogy a már megnyitott régi fülek a cache-elt kliensen se törjenek.
- Teszt: régi kliens, új fajtát tartalmazó lecke → a lecke megjelenik, az új blokk kimarad (e2e).

**Szeletenkénti elfogadás (WHEN/THEN):**
- **V1:**
  - WHEN 200 különböző leckeazonosító THEN minden nyitásforma és témakontextus legalább egyszer előfordul, és egyik sem haladja meg a 25%-ot;
  - WHEN a sorozatban két egymás utáni lecke THEN eltérő vázat kap;
  - az összefoglaló forma a kiosztott formát követi (lektori ellenőrzés).
- **V2:**
  - WHEN bármely új feladat (igaz/hamis sorozat, szókiemelés, kategorizálás, számegyenes, becslés) THEN a pontozó determinisztikus, és teljes, részleges, illetve rossz válaszra a dokumentált pontot adja (egységteszt mindegyikre);
  - a megjelenítő billentyűzettel is kezelhető (e2e).
- **V3:**
  - WHEN fordítókártya, lépésenkénti felfedés vagy döntés–következmény THEN az állapot a lecke újranyitásakor visszaáll, és a kártya akadálymentes nevet visel (e2e).
- **V4:**
  - WHEN a kvíz legalább 6 kérdésből áll THEN legalább 2 kérdéstípus szerepel benne;
  - a pontozás típusonként tesztelt.
- **V5:**
  - WHEN szókincslecke THEN szókereső vagy keresztrejtvény készül, és a rácsgenerátor determinisztikus (mag);
  - a boss-kérdés a fejezet anyagából való (lektori ellenőrzés).

## V-kompat — végrehajtás (2026-11-25)
Cél: a régi (gyorsítótárazott) kliens az újabb programverzió blokkfajtáit tűrje — a lecke megjelenik, csak az ismeretlen blokk marad ki.
1. RED: `source/tests/lesson-unknown-blocks.test.ts` — `dropUnknownBlocks`: ismeretlen `kind`, ismeretlen `tryKind` és ismeretlen
   `animate.animKind` kimarad, az ismert blokkok sorrendje változatlan; ha egy fejezet MINDEN blokkja ismeretlen, a fejezet nem tűnik el
   (a fejezetindexek — pl. a gyakorlócsomagok `sectionIndex`-e — nem csúszhatnak el), hanem egy rövid „frissítsd az oldalt” magyarázat
   áll a helyén a kiesett blokkok fogalmával; nem lecke-alakú bemenet változatlan. `source/tests/lesson-unknown-blocks.spec.ts` (e2e):
   új `kind` és új `tryKind` a leckében → a lecke megjelenik, az ismert blokk látszik, az ismeretlen nem.
2. GREEN: `shared/lesson-schema.ts` (`dropUnknownBlocks`; a `dropUnknownAnimateBlocks` ennek része marad, visszafelé kompatibilis
   névvel), `client/src/lesson-runtime/LessonView.tsx` (olvasás).
3. Próbahiba, kapulánc, PR; beolvadás és DEPLOY után indulhat a V2 / V3 (új fajták gyártása).
Hatókörön kívül (a V4 terve dönt): a gyakorlókvíz új kérdéstípusai — a V4 visszafelé kompatibilis alakkal (választós alap) vezeti be.

## V4 — végrehajtás (2026-11-25): kvízkérdés-típusok keverése
**Döntés (a terv „beírós szám” típusától eltérve):** minden kvíztípus a meglévő, opcióindex-alapú adatmodellben marad (`options`,
`correctIndex`, `feedbackPerOption`) — a szabad beírás megtörné az index-alapú eredménymodellt (eredménylevél, részleges kiértékelés,
játékexport: `shared/lesson-result-email.ts` `gradeQuiz` a `picks` indexeiből dolgozik). A típus az opcionális `format` mező:
- `choice` (alapértelmezés, hiányzó mező = ez) — egyválasztós;
- `fillGap` — kiegészítés: a kérdés pontosan egy `___` hiányt tartalmaz, az opciók a hiány kitöltései; a megjelenítő a választott opciót a
  hiányba írja;
- `oddOneOut` — kakukktojás: pontosan 4 opció, a helyes a „nem illik a sorba”;
- `number` — számolós: minden opció szám (mértékegységgel is), a helyes a számítás eredménye.
A régi kliens a `format` mezőt figyelmen kívül hagyja (a zod objektum levágja) — egyválasztósként jeleníti meg, helyesen pontoz.
Szabály (gyártás, változatosság BE): ha a csomag kvíze ≥ 6 kérdés, legalább 2 különböző típus (`quizFormatProblems`, javító kört kap).
1. RED: `source/tests/quiz-formats.test.ts` (séma fajtánként; keverési szabály; szerződés-sor; a pontozás index-alapú, típustól független;
   a szigorú csomagséma a mezőt kéri), `source/tests/lesson-quiz-formats.spec.ts` (e2e: kiegészítésnél a hiányba kerül a válasz,
   kakukktojás- és számolós címke).
2. GREEN: `shared/lesson-experience.ts`, `server/studio/bank-schema.ts`, `server/studio/experience-builder.ts`,
   `client/src/lesson-runtime/LessonExperienceView.tsx`, `LessonRuntimeProbe.tsx` (`?quizFormats=1`).

### V4 — kapulánc-javítás (2026-11-25)
- A szolgáltatói szigorú séma (`bankResponseFormat`) a `format` mezőt CSAK változatosság BE mellett kéri (`quizFormats`); KI-ben a `response_format` bájtra a régi — a KI kérés nem változik (TRAP: új szerzői/szolgáltatói tartalom csak BE mögé).
- Dokumentált tesztváltozás: a `lesson-variety-paths` hamis modellje BE kérésben (KVÍZTÍPUSOK szabály) típusolt kvízt ad (`bankAnswer`), mert a V4 bankszabálya (≥ 6 kérdésnél ≥ 2 típus) BE-ben kötelező; a `quiz-formats` séma-tesztje a BE és a KI sémát külön méri.

### V4 — review #603 (2026-11-25)
- Számolós opció: a meglévő számértelmezővel (`isNumericOption`, `shared/single-choice-check.ts`) — tört, vegyes tört, tagolt egész, előjel, opcionális mértékegység.
- Ismétlődés-kulcs: a kakukktojás-törzs („Melyik nem illik a sorba?”) és minden `oddOneOut` tétel az opciókészlettel kulcsolt.
- Bejelentkezett tanuló mentett kvíze: a típus a lecke azonos kérdéséből (questionId + azonos szöveg) — címke és kitöltött hiány; eltérő szövegnél (frissült lecke) választós.

## V1 — végrehajtás (2026-11-25)
Tengelyek: 2 (nyitásformák bővítése), 6 (témakontextus a példákban), 8 (szöveges összefoglaló formák), 10 (fejezethossz-sáv), és a közös
sorozatszabály (két egymás utáni lecke ugyanabban a tantárgy–évfolyam sorozatban nem kap azonos vázat). Csak BE változatossági
kapcsolónál; KI állapotban a prompt bájtra változatlan.
1. RED: `source/tests/lesson-variety-axes.test.ts`:
   - 200 leckeazonosítón minden nyitásforma (korcsoportonként) és minden témakontextus előfordul, egyik sem > 25%;
   - a kiosztás determinisztikus; a fejezethossz-sáv ≥ 2 fejezetnél nem egyforma;
   - sorozatszabály: ha az előző lecke nyitásformája / témája / összefoglaló formája / blokkváza azonos lenne, a kiosztás determinisztikusan
     a következőre lép (blokkváznál újramagozás), előzmény nélkül a mag dönt;
   - szerzői szerződés: BE + kiosztásnál tartalmazza a témakört, az összefoglaló formát és a fejezetenkénti hosszsávot; a lektori lista
     az összefoglaló formát méri.
2. GREEN: `shared/lesson-variety-axes.ts` (új), `shared/lesson-opener.ts` (3 új nyitásforma: kihívás, képtalálós, híres történet),
   `server/studio/lesson-variety-flag.ts` (a futás kiosztott tengelyei), `server/studio/step-io.ts` (szerző + lektor),
   `server/studio/single-run/engine.ts` (kiosztás, mentés a job állapotába, folytatásnál a mentett), `server/studio/pipeline-store.ts`
   (`loadPreviousSeriesVariety`: a sorozat legutóbbi, ugyanabban a tantárgy–évfolyamban kiosztott futása).
3. Próbahiba, kapulánc, PR. A lektori „az összefoglaló a kiosztott formát követi” ellenőrzés a lektor listájában.

### V1 — review #611 (2026-11-25)
- A szerzői szerződés a futás KIOSZTOTT nyitásformáját írja elő (a sorozatszabállyal eltoltat is); a hős a magból marad — a szerző, a lektor és a jelölő ugyanazt a formát kapja.
- Eltérő blokkváz: korlátos (1–12), determinisztikus só-keresés a végleges aláírás ellenőrzésével (`seriesShapeSalt`); ha nincs eltérő, a váz marad (naplózva). A só a job állapotába kerül.
- A szerzői állomáson (lecke nélkül) megszakadt futás folytatása a mentett tengelyeket tölti vissza; új előzmény-lekérés és újraosztás nincs.

## V2a — végrehajtás (2026-11-25): öt új feladatfajta — séma, pontozó, megjelenítő (gyártás nélkül)
Előfeltétel: a V-kompat élesítése (a régi kliens az ismeretlen `tryKind` helyén frissítésre kérő magyarázatot mutat). A V2a a fajtákat
NEM hirdeti a modellnek (a szerzői katalógus és a vázlat `tryKind`-ja a régi hármas — `PROMPT_TRY_KINDS`); a gyártási prompt és a kapu
a V2b.
Fajták és DOKUMENTÁLT pontozás (`shared/try-scoring.ts`, determinisztikus):
- `trueFalseSeries` — 2–8 állítás igaz/hamis jelöléssel: pont = helyes jelölések száma, max = állítások száma.
- `highlight` (szókiemelés) — szöveg + 1–8 célszó (a szöveg szavai): pont = max(0, eltalált − téves kijelölés), max = célszavak száma.
- `categorize` — 2–4 kategória, 3–12 elem: pont = helyesen besorolt elemek, max = elemek száma.
- `numberLine` — min < cél < max, tűrés: |érték − cél| ≤ tűrés → 2 pont; ≤ 2×tűrés → 1 pont; különben 0 (max 2).
- `estimate` (becslés csúszkával) — relatív eltérés ≤ 5% → 2 pont; ≤ 15% → 1 pont; különben 0 (max 2).
Ítélet: max pont = „teljes”, 0 < pont < max = „részleges”, 0 = „rossz”.
1. RED: `source/tests/try-scoring.test.ts` (mind az öt pontozó teljes / részleges / rossz válaszra; a séma a hibás specifikációt elutasítja, a
   helyeset elfogadja; a modellnek hirdetett fajták a régi hármas), `source/tests/lesson-try-v2.spec.ts` (e2e: billentyűzettel kezelhető
   mind az öt, a visszajelzés megjelenik, az állapot újratöltés után visszaáll).
2. GREEN: `shared/try-scoring.ts`, `shared/lesson-schema.ts`, `client/src/lesson-runtime/blocks/try-blocks.tsx`,
   `client/src/lesson-runtime/useLessonProgress.ts`, `shared/lesson-block-label.ts`, `server/studio/grounding.ts`, `server/studio/step-io.ts`.
3. Próbahiba, kapulánc, PR.

## V3a — végrehajtás (2026-11-25): kártyaformák és döntés–következmény (séma, megjelenítő, állapot; gyártás nélkül)
A V2a-ra épül (azonos keret: `try` blokk, a V-kompat tűri). Fajták: `flipCard` (fordítókártya), `stepReveal` (lépésenkénti felfedés),
`didYouKnow` („Tudtad?”), `decision` (döntés–következmény: 2–4 lehetőség, pontosan egy „legjobb”; pont: legjobb = 1, más = 0 —
`shared/try-scoring.ts`), `flashcards` (villámkártyák, 2–12 kártya; az összefoglaló villámkártya-formája a V3b gyártásában).
Az összehasonlító tábla és az idővonal már meglévő ábrafajta (`compareCards`, `table`, idővonal) — a V3b a gyártásban kéri.
1. RED: `source/tests/try-cards.test.ts` (séma: helyes / hibás; a döntés pontozása), `source/tests/lesson-try-cards.spec.ts` (e2e: a kártya
   akadálymentes nevet visel, billentyűzettel kezelhető, az állapot a lecke újranyitásakor visszaáll).
2. GREEN: `shared/try-scoring.ts`, `client/src/lesson-runtime/blocks/try-cards.tsx`, `try-blocks.tsx`, `useLessonProgress.ts`,
   `shared/lesson-block-label.ts`, `server/studio/grounding.ts`.
3. Próbahiba, kapulánc, PR (a V2a beolvadása után).

## V5a — végrehajtás (2026-11-25): szókereső és keresztrejtvény (séma, rácsgenerátor, megjelenítő; gyártás nélkül)
A V3a-ra épül (`try` keret). Fajták: `wordSearch` (3–10 szó, 3–12 betű; a rács a szavakból számolt MAGBÓL determinisztikus,
vízszintes / függőleges / átlós elhelyezés, kitöltés magyar betűkkel) és `crossword` (3–10 bejegyzés: megfejtés + meghatározás; a
rácsgenerátor determinisztikus, a bejegyzések keresztezik egymást, ahol lehet; ami nem fér el keresztezve, külön sorba kerül).
Pontozás (`shared/word-grid.ts`): szókereső — pont = megtalált szavak; keresztrejtvény — pont = helyesen kitöltött bejegyzések
(kis- / nagybetű és ékezet nélküli összevetés NEM: a magyar ékezet számít, csak a kis- / nagybetű nem).
1. RED: `source/tests/word-grid.test.ts` (determinizmus azonos bemenetre; minden szó / bejegyzés a rácsban olvasható; a keresztrejtvény
   betűi ütközésmentesek; pontozás teljes / részleges / rossz; séma), `source/tests/lesson-word-grid.spec.ts` (e2e: billentyűzettel
   megoldható, az állapot visszaáll).
2. GREEN: `shared/word-grid.ts`, `shared/try-scoring.ts` (fajták, séma), `client/src/lesson-runtime/blocks/try-word-grid.tsx`, regiszter,
   állapot, címke, grounding.
3. A gyártás (szókincsleckénél kötelező kiosztás) és a fejezetvégi boss-kérdés a V5b.

### V3a — újraépítés és review #609 (2026-11-26)
- A V2a squash-beolvadása (#615) után az ág egymásra épített volt: `feat/v3a-kartyak-v2` az `origin/main`-ről, a V3a saját változása három commitban (utasítás → RED → kód); a #609 lezárva, utódja ez a PR.
- **Döntés rádiócsoport (review #609):** a döntés lehetőségei a V2a közös `RadioRow`-ját használják — egy Tab-megálló (kijelölt / első), a nyilak léptetnek és választanak. RED: `lesson-try-cards.spec.ts` „döntés: valódi rádiócsoport” (a javítás előtt a `tabindex` hiányzott).
- A #609 többi szála (csúszka-megoldhatóság, célszám, bővült mentés) a V2a-ban (#615, `b01fa85e`) már javítva a mainen.
- **Review #619:** (1) a hiányos lépés / lehetőség / kártya (üres, nem szöveges, következmény vagy hátoldal nélküli) érvénytelen — a séma a
  nyers elemszámot is nézi, nem tűnhet el csendben a megjelenítőben; (2) az utolsó lépés felfedése után az Újrakezdés, a döntés Újra gombja
  után a rádiócsoport kapja a fókuszt; (3) a „Tudtad?” kártya háttere és szövege ugyanabból a lecke-témás tokenpárból
  (`--lesson-warn-bg` / `--lesson-warn-ink`) jön — a 11–12. évfolyam sötét témájában a kontraszt 1,04 volt. RED: `try-cards.test.ts`,
  `lesson-try-cards.spec.ts` (+2). 2. kör (Vercel): az Újrakezdés után a fókusz a „Következő lépés” gombra kerül (RED + javítás).

### V2a — review #615 / #609 / #617 (2026-11-25)
- **Megoldhatatlan csúszka:** a séma (`trySpecProblems`) a számegyenesnél és a becslésnél is ellenőrzi, hogy a `min + k·step` rácson (≤ max) van-e teljes pontot érő érték (`sliderHasFullScore`, a célhoz legközelebbi két rácspont); ha nincs, elutasít.
- **Célszám:** a prompt nélküli számegyenes alaputasítása kiírja a célszámot; ha a prompt nem tartalmazza, zárójelben hozzáfűződik.
- **Rádiócsoport:** `RadioRow` — egy Tab-megálló (kijelölt / első), a nyilak léptetnek és választanak; az igaz/hamis és a kategorizálás ezt használja (a V3a döntési kártyái is).
- **Bővült feladat mentése:** az igaz/hamis és a kategorizálás mentése csak egyező elemszámnál áll vissza; eltérésnél az állapot (válaszok + ellenőrzött) újraindul.
- Tesztek: `try-scoring.test.ts` (megoldhatatlan/megoldható esetek), `lesson-try-v2.spec.ts` (+3 böngészős teszt); RED `d202fa52`. Teljes egységteszt 4729/0, e2e 5 passed.
