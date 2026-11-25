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

## V2b — végrehajtás (2026-11-25): az öt új feladatfajta GYÁRTÁSA
Előfeltétel: a V-kompat, a V2a és a V3a élesben (a megjelenítők a kliensen). A szerző és a vázlat innentől az öt új gyakorlófajtát is
ismeri (`PROMPT_TRY_KINDS`), a kiosztás (S6b) fajtakészlete bővül:
- `procedure` → `dragSort` (számtárgyban `numberLine` is); `comparison` → `match`, `categorize`; `description` → `fillBlank`,
  `trueFalseSeries`, `highlight`; `any` → mind a gyakorlófajta, a két számos (`numberLine`, `estimate`) csak számtárgyban
  (matematika, fizika, kémia, földrajz, természettudomány, informatika — a tantárgynévből);
- a szomszédos try-fajta továbbra sem egyezik (`any` fejezetnél), a kiosztás determinisztikus.
Dokumentált spec-változás: a V2a tesztje a hirdetett fajtákat a régi hármasra rögzítette — a V2b ezt szándékosan bővíti.
1. RED: `source/tests/lesson-try-assignment.test.ts` — 300 magon minden gyakorlófajta előfordul; nem számtárgyban nincs `numberLine` /
   `estimate`; a szerzői katalógus minden új fajta pontos spec-alakját közli; a vázlat `tryKind`-ja az újakat elfogadja.
2. GREEN: `shared/lesson-section-shapes.ts`, `shared/lesson-schema.ts` (`PROMPT_TRY_KINDS`), `server/studio/step-io.ts` (katalógus),
   `server/studio/single-run/engine.ts` (tantárgy → számos jelző).
3. Próbahiba, kapulánc, PR (a V3a után).

## V3b — végrehajtás (2026-11-25): kártyaformák a GYÁRTÁSBAN (V1 + V2b + V3a után)
- Új változatossági tengely: **kártyaforma** (`CARD_FORMS`: fordítókártya, lépésenkénti felfedés, „Tudtad?”, döntés–következmény) — a
  magból, a sorozatszabály a következőre lépteti, a job állapotába mentve (`cardForm`), folytatásnál a mentett számít (régi checkpoint:
  nincs kártya-kiosztás).
- Szerződés (BE változatosság): a lecke egy NEM első fejezetébe pontosan egy kiosztott kártya kerül `try` blokként (pontos spec-alak).
- Kapu: ≥ 4 fejezetes leckénél a kiosztott kártya hiánya (vagy csak az első fejezetben) javító kört kap (`cardFormProblems`).
- Új összefoglaló forma: **villámkártyák** (`villamkartya`) — a záró recap előtt egy `flashcards` csomag a kulcsfogalmakkal.
- A szerzői katalógus a kártyafajták spec-alakját is közli.
1. RED: `source/tests/lesson-card-form.test.ts`. 2. GREEN: `shared/lesson-variety-axes.ts`, `server/studio/{step-io.ts,pipeline-store.ts,
   single-run/engine.ts}`. 3. Próbahiba, kapulánc, PR (a V1, V2a, V3a, V2b után).
