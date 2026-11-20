# Spec: Változatos tananyag és szebb ábrák — a TGM-lánc változatossági és ábra-szeleteinek előrehozása

> Dátum: 2026-11-20 · Szerző: ügynök (felülvizsgálat + szeletterv) · Állapot: a tulajdonos kérésére indított munka (2026-11-20, KIEMELT
> PRIORITÁS); a meglévő, jóváhagyott terv kiegészítése, nem felülírása.
> Alapterv: `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` (a továbbiakban: TGM-terv) és végrehajtása
> `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` (TGM-végrehajtás).
> Végrehajtási utasítás: [`2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`](2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md)
> Jelölés: **TÉNY** = a `main` `d9d1e6c6` állapotán a kódból ellenőrizve · **UNVERIFIED** = nem ellenőrzött. Kódútvonal a `source/` alatt.

## 1. Cél

A tulajdonos kérése (2026-11-20, szó szerint, a diktálás javítva): „…a tananyagok változatosabbak legyenek, ne egy sablonra
készüljenek, ne legyenek unalmasok. […] Az adott korosztályos kereteken belül ne mindig sablonosan ugyanaz ismétlődjön […] a
változékonyságot biztosítsd a tananyagokban. … a gyártási folyamat esztétikusabb, változékonyabb és lényegesen szebb ábrákkal
készüljön.”

Ebből a tervből: (1) a változatosság szeletei (TGM S5a → S5b → S6a → S6b → S6c → SK2) és az ábrák szeletei (S2b, S6c ábra-része)
előre kerülnek; (2) minden szelet MÉRHETŐ változatosságot ad determinisztikus mag mellett, a korosztályos keretek (évfolyamsáv,
nyitólépcső, ívkapu) betartásával; (3) a lánc önállóan beolvasztható: minden PR élesben semleges, a bekapcsolás tulajdonosi döntés.

## 2. NEM cél

- A TGM-terv 2. szakaszának minden kizárása érvényes (pontozás, tanulási cél, ívkapu „tanítás a kérdés előtt” és „összefoglalóval
  zárul” szabálya, arculati elv, éles adat, `db:push`, a kiadott leckék újragyártása).
- A forrásvizuál-lánc (S3a, S3b, S4, SK3, S10, SK1c) és a TTS-lánc ebben a körben nem változik; a sorrendjük a TGM-terv / pótlási terv
  7.6 szerint marad, csak a változatossági szeletek mögé kerülnek.
- Az önálló HTML-út (`server/ai/lesson-html-spec.ts:563`, `server/studio/web-research-agent.ts:199`) és a régi HTML-kvíz
  (`client/src/lesson-runtime/HtmlLessonQuiz.tsx`), valamint a gyakorlókör mentett válaszainak nézete (`SavedLessonQuiz.tsx`) — ezek a
  modell írta visszajelzést változatlanul mutatják.
- Fizetős AI-hívás (valódi lecke-generálás) tulajdonosi jóváhagyás nélkül (8. szakasz).

## 3. Felülvizsgálat — hol sablonos ma a gyártás (TÉNY, `main` `d9d1e6c6`)

A TGM-terv 3.3 mérése (239 kiadott lecke): a fejezetek 97,4%-a `explain → example → check → recap` vázú, 61,6% pontosan azonos
blokksorú; a hibás válaszok 46,8%-a „Jó próba…” kezdetű; 15/15 lecke ugyanazzal a nyitással (Célkártya → pontosan 5 mondatos mese);
minden lecke `prediction`-nel indul; 6/16 ábrafajta soha nem fordul elő. Az okok a kódban (a sorszámok a mai `main`-en, a TGM-terv
óta elmozdultak — 4. szakasz):

| Sablon | Hely (fájl:sor) | Mi rögzíti |
|---|---|---|
| Visszajelzés-nyitás | `shared/lesson-opener.ts:115` | „rossz válasznál az első mondat bátorító” (Tananyag lap check) |
| Visszajelzés-mintamondat | `shared/lesson-opener.ts:136` | „pl. „Jó próba, de itt a … a kérdés, ezért …”” (bank) |
| Nyitás hossza | `shared/lesson-opener.ts:72` | „A mini mese PONTOSAN 5 mondat” |
| Konfliktus-példamondat | `shared/lesson-opener.ts:133` | „Peti szerint…, de a lecke szerint…” |
| Módszersorrend | `shared/lesson-bank-plan.ts:44` | `[...METHOD_KINDS, "gate"]` mindig ugyanabban a sorrendben osztva → az első fajta mindig `prediction` |
| Fejezetív (tervező) | `server/studio/step-io.ts:395`, `:404` | „Fogalomcsoportonként egy fejezet: explain → example → check…”, „A plannedBlocks sorrendje EZT az ívet kövesse” |
| Fejezetív (szerző) | `server/studio/role-skills.ts:116` | „a vázlat plannedBlocks sorrendjét követed” |
| Ábraszám | `server/studio/role-skills.ts:138` | „legfeljebb 2 (inkább egy jó)” ábra fejezetenként |
| Ábraszínek | `server/studio/role-skills.ts:146` | név szerint rögzített hexa-színlista (föld / víz / növény / tégla / ég), nem az évfolyamsáv tokenjei |
| Leíratlan ábrafajták | `shared/lesson-visual-params.ts:181-193`, `:240-250` | a `fraction`, `map`, `wordBuilder`, `sentenceParts`, `geometry`, `triangleArea` paraméter-alakja nincs a szerződésben → a modell nem választja |
| Ítélet | `shared/lesson-ui-text.ts:7` | az ítéletet már a kód írja („Helyes!” / „Még nem helyes.”) — a bátorító nyitás viszont a modellé |

A magyarázó próza NEM sablonos (421 bekezdésből 364 különböző kezdés, TGM-terv 3.3) — a változatosságot tehát a szerződés oldja fel,
nem a modell.

### 3.1 Mi a hiányzó rész, és mi akadályozta eddig

- **Hiányzik (TÉNY):** `shared/seeded.ts`, `shared/lesson-feedback-openers.ts`, `shared/lesson-section-shapes.ts`,
  `shared/visual-kind-plan.ts`, `shared/variety-metrics.ts`, `server/studio/gates/variety-gate.ts` egyike sem létezik; a pótlási leltár
  (`docs/websuli-potlasok` ág, P-030) szerint a változatosság „NEM VALÓSULT MEG”.
- **Akadály 1 — sorrend:** a TGM-végrehajtás sorrendje (7. sor) a változatosságot az S10/1 fizetős első mérés MÖGÉ tette, az pedig az
  S2b–S4b, SK3 és S10/0 szeletekre vár. A változatossági szeletek fájllistája ezektől független (S5a: `shared/seeded.ts`,
  `shared/lesson-feedback-openers.ts`, `shared/lesson-opener.ts`, `VerdictFeedback.tsx` — egyik sem S2–S4 fájl), a függés csak a
  mérés tisztaságát szolgálta (az első mérés a forrásvizuál hatását mérje).
- **Akadály 2 — kapcsoló hiánya:** a TGM-terv kapcsolót csak a forrásvizuál-láncnak ad (5. szakasz 14. pont). A változatossági szeletek
  azonnal megváltoztatnák az éles gyártást és a régi leckék megjelenítését, ami ütközik az önálló beolvaszthatóság elvével (minden PR
  élesben semleges, kapcsoló a lánc alján). Ezt a jelen terv 5. szakasza pótolja.
- **Akadály 3 — prioritás:** a pótlási terv P2-be sorolta (7.6, 8. pont); a tulajdonos 2026-11-20-án előre vette.

## 4. Igazítások a TGM-tervhez (a mai `main` szerint)

1. Elmozdult sorszámok: `step-io.ts:325/:341` → `:395/:404`; `role-skills.ts:145-146` → `:146`; `lesson-bank-plan.ts:43-46` → `:44`.
2. S5a 4. lépés „a lektor ellenőrzőlistájából a bátorító első mondat számonkérése kikerül”: a `LESSON_OPENER_LEKTOR_CHECKLIST`
   (`shared/lesson-opener.ts:119-125`) ilyen mondatot NEM tartalmaz — teendő nincs.
3. S5a kulcs („a lecke azonosítója + a kérdés azonosítója”): a Tananyag lap `check` blokkjának nincs azonosítója. A kulcs ezért
   tartalomból képzett: `mapId` + `choiceSeed(kérdés, opciók)` (`shared/option-order.ts:56`) — újratöltésen és mentett válasznál is
   ugyanaz, és a leckén belül kérdésenként eltér.
4. S5a megjelenítés: a TGM-terv minden leckére (a régiekre is) levágná a modell írta bátorító előtagot. Ez élő változás a 239 kiadott
   leckén — az 5. szakasz szerint csak a kapcsolóval gyártott (jelölt) leckén történik; a régi leckékre való kiterjesztés a lánc végi
   tulajdonosi döntés egyik opciója (9. szakasz).
5. A nyitó- és IQ-szerződés ma is kapcsoló mögött áll (`server/studio/lesson-opener-flag.ts:2-3`, `STUDIO_LESSON_OPENER`; élesben BE a
   `docs/lesson-improvement.md:46` szerint). A változatossági prompt-változás csak BE nyitókapcsolóval hat (KI nyitókapcsolónál a
   promptban nincs visszajelzési szabály, amit cserélni lehetne).
6. Nézetek a böngészős próbán: a tulajdonosi megbízás szerint 360×640, 844×390 (fekvő telefon) és 1280×800 (a TGM-terv 390×844
   helyett / mellett).

## 5. Rögzített döntések

1. **Új kapcsoló: `STUDIO_LESSON_VARIETY`** (`on` = BE; bármi más és a hiány = **KI**, alapérték). Egy helyen olvasva:
   `server/studio/lesson-variety-flag.ts` (`lessonVarietyEnabled(env)`), a `lesson-opener-flag.ts` mintájára. Más helyen a változó
   olvasása tilos.
   - **KI:** a gyártás minden modellnek küldött kérése bájtra azonos a kapcsoló előttivel (`tests/source-visuals-flag.test.ts`
     lenyomatai zöldek maradnak); a mentett lecke nem kap jelölőt; a lejátszó minden lecke visszajelzését a mai módon mutatja.
   - **BE:** a lánc szeleteinek viselkedése (S5a: a modell nem ír bátorító nyitást, a nyitást a kód adja; S5b–S6c: kiosztott
     módszersor, nyitásforma, név, fejezetív, `try`, hang, ábrafajta-ajánlás).
   - **Ki kapcsolja be:** a tesztek; élesben a tulajdonos a lánc végén (SK2 mért számaival). Ügynök éles változót nem állít.
2. **A lecke jelölője:** `lesson.variety` (opcionális, engedékeny objektum: `{ version: string }`, hibás alak → elhagyva, `catch`).
   A szerver írja mentéskor (`pipeline-store.ts` `upsertLesson`), ha a kapcsoló BE — a modell által adott érték mindig felülíródik vagy
   törlődik. A lejátszó a jelölt leckén adja a kódszótári nyitást; jelöletlen leckén változatlan. A régi kliens az ismeretlen kulcsot
   elhagyja (a `lessonSchema` nem szigorú a gyökérben) — visszafelé kompatibilis.
3. **Determinizmus:** a változatosságot a kód osztja ki a `shared/seeded.ts` FNV-1a + mulberry32 magjából (ugyanaz az algoritmus, mint a
   `shared/option-order.ts:8-23` — onnan kiemelve, a meglévő keverés kimenete bájtra változatlan). Véletlen, óra, hálózat nincs.
4. **Korosztályos keret:** minden szótár / készlet évfolyamsávonként (`AgeBand`: `kid` 0–4, `teen` 5–8, `senior` 9–12 —
   `shared/lesson-schema.ts` `ageBandForClassroom`) készül, a nyitólépcsők (`OPENER_STAGES`) és az ívkapu változatlanok.
5. **Promptváltozás = verzióemelés:** BE kapcsolónál a nyitószerződés verziója `nyitomese-2` (S5b-ben `nyitomese-3`); a bank csomagjának
   `opener` jelölője ezt hordozza, így a v1-gyel gyártott csomag nem kerül át változatlanul (`experience-builder.ts:553`, `:559`).
6. **Mérhetőség:** minden szelet a változatosságot számszerű teszttel bizonyítja rögzített magkészleten (pl. 200 kulcson a leggyakoribb
   nyitás aránya; 100 magon a formák / nevek száma; 200 magon a fejezetív-szabályok); a lánc végén az SK2 mérőszáma és szimulációja
   (modellhívás nélkül) adja a bekapcsolási döntés számait.

## 6. Szeletsorrend (a legrövidebb út a tulajdonos céljához)

| # | Szelet | Ág | Munkafa | Függ | Miért itt |
|---|---|---|---|---|---|
| 1 | S5a — kódszótári visszajelzés-nyitás + kapcsoló | `feat/tgm-s5a-visszajelzes-nyitasok` | `.claude/worktrees/tgm-s5a` | — | a leggyakoribb, a gyerek által minden kérdésnél látott ismétlődés (46,8% „Jó próba”); itt születik a kapcsoló és a `seeded.ts` |
| 2 | S5b — módszersorrend, nyitásformák, névkészlet | `feat/tgm-s5b-nyitasformak` | `.claude/worktrees/tgm-s5b` | S5a | a lecke eleje (15/15 azonos nyitás) |
| 3 | S6a — fejezetív-készlet | `feat/tgm-s6a-fejezetiv` | `.claude/worktrees/tgm-s6a` | S5a (`seeded.ts`, kapcsoló) | a 61,6%-os azonos blokksor |
| 4 | S6b — `try` minimum és rotáció, szerzői hangok | `feat/tgm-s6b-try-hang` | `.claude/worktrees/tgm-s6b` | S6a | kézzelfogható feladat (ma 0,7%) |
| 5 | S2b — döntési fa, képes kártyák (megjelenítők) | `feat/tgm-s2b-dontesi-fa-kepes-kartya` | `.claude/worktrees/tgm-s2b` | — (S2a a `main`-en) | az S6c ábraajánlása (`pictureCards`) erre épül; „szebb ábrák” |
| 6 | S6c — ábrafajta-terv + sávtokenes színek | `feat/tgm-s6c-abrafajta` | `.claude/worktrees/tgm-s6c` | S2b, S5a | változatos és szebb ábrák |
| 7 | SK2 — változatosság gépi mérőszáma és küszöbe | `feat/tgm-sk2-valtozatossag-kapu` | `.claude/worktrees/tgm-sk2` | S6a–S6c | a bekapcsolási döntés számai |
| 8 | S3a, S3b — majd a TGM-lánc többi része a pótlási terv 7.6 szerint | `feat/tgm-s3a-…`, `feat/tgm-s3b-…` | … | S2b | forrásvizuál (P-028); a `STUDIO_SOURCE_VISUALS` mögött |

Az S3a / S3b nem előfeltétele a változatosságnak: az S6c „a forráshoz kötött ábra nem számít” szabálya a `sourceVisualId` mezőre
épül, amely az S1b óta a sémában van (`shared/lesson-schema.ts`, `sourceVisualId`).

## 7. Edge case-ek (az S5a-ra; a további szeletekre a TGM-terv 7. szakasza)

- A modell BE kapcsolónál is ír bátorító nyitást → a jelölt leckén a lejátszó levágja (`stripLegacyOpener`), így nincs dupla nyitás.
- A levágás után 12 karakternél rövidebb maradék → az eredeti szöveg marad (nem csonkolunk értelmetlenre).
- A modell csak ítéletet írt („Igen.”) → az ítélet-előtag levágása után üres; a lejátszó az ítéletet és a kódnyitást mutatja.
- Jelölt lecke régi kliensen → a jelölő elhagyódik, a visszajelzés a modell szövegével (nyitás nélkül) jelenik meg — érthető marad.
- Kapcsoló BE, nyitókapcsoló KI → a promptban nincs visszajelzési szabály; a jelölő a leckére kerül, a lejátszó kódnyitást ad, a
  modell esetleges bátorító előtagját levágja.
- A javítási út (`server/studio/structured-improvement.ts`, a tulajdonos indította javítás) a jelölőt nem kezeli: a modell-séma KI
  ágán (élesben ez az alapérték) a jelölt modell-jelölő elhagyódik, de a meglévő jelölő is elveszhet (`:196` a `modelLessonSchema`-n
  olvassa a pillanatképet) → a javított leckén a visszajelzés nyitás nélkül, ítélettel jelenik meg. A jelölő megőrzése és a modell
  jelölőjének kiszűrése a forrásvizuál BE ágán az S5b feladata.
- Javított (régi) lecke BE kapcsolóval → a bank a verzióemelés miatt újraépül (v2), a nem javított fejezetek régi check-visszajelzését
  a lejátszó a jelölő miatt levágja + kódnyitással mutatja.

## 8. Fizetős mérés

Ebben a láncban fizetős hívás nincs: a változatosságot rögzített (szintetikus) bemeneten és a kiosztás modellhívás nélküli
szimulációján mérjük. Ha a tulajdonos valódi gyártáson is látni akarja a hatást, a javasolt próbafutás: eldobható adatbázison, a
`scripts/measure/single-run-measure.mts` harnesszel, BE kapcsolóval, 3 lecke (két különböző korosztály, egy témán kétszer — az
ujjlenyomat-eltérés mérésére), futásonként átlag 6,64 USD (TGM-terv 3.4) → **≈ 20 USD**, a D2 30 USD-s kereten belül. Csak tulajdonosi
indítással (az orkesztrátor kéri).

## 9. Döntési pont a lánc végén (a tulajdonosnak, a mért számokkal)

- (a, javasolt) `STUDIO_LESSON_VARIETY=on` élesben az új gyártásra; a régi leckék változatlanok.
- (b) mint (a), és a régi leckék „Jó próba”-előtagja is levágva + kódnyitás (megjelenítési, adatírás nélküli változás).
- (c) marad KI.

## 10. Elfogadási kritériumok (EARS) — S5a

- **V1** — WHEN `STUDIO_LESSON_VARIETY` nincs `on`-ra állítva, THE gyártás SHALL minden modellnek küldött kérést bájtra a kapcsoló
  előttivel azonosan küldeni, és a mentett lecke SHALL NOT `variety` kulcsot kapni.
- **V2** — WHEN a kapcsoló BE és a nyitókapcsoló BE, THE szerző és a bank promptja SHALL NOT tartalmazni a „Jó próba” mintamondatot és a
  „bátorító” nyitás előírását, és a nyitószerződés verziója SHALL `nyitomese-2` lenni.
- **V3** — THE kódszótár SHALL évfolyamsávonként legalább 24 hibás- és 12 helyes-nyitást adni, mindegyik ≤ 40 karakter, egy kezdőszó a
  sáv készletének legfeljebb 15%-a.
- **V4** — WHEN 200 különböző kérdéskulcsra ugyanabban a sávban nyitás készül, THE leggyakoribb nyitás aránya SHALL 10% alatt lenni; és
  ugyanarra a kulcsra a nyitás SHALL mindig ugyanaz lenni.
- **V5** — WHEN a lecke jelölt, THE lejátszó SHALL az ítélet után a kódszótári nyitást, majd a régi bátorító előtag nélküli indoklást
  mutatni; WHEN a lecke jelöletlen, THE lejátszó SHALL a mai kimenetet adni.
- **V6** — THE `shared/option-order.ts` keverése SHALL a kiemelés után is bájtra azonos sorrendet adni (meglévő tesztek).
- **V7** — UI: a jelölt lecke visszajelzése 360×640, 844×390 és 1280×800 nézetben nem okoz oldalszintű vízszintes görgetést és nem
  vágódik le (böngészős próba, képernyőkép a PR-ben).

A lánc további szeleteinek elfogadása: TGM-terv E15–E21, E40 (a 4. szakasz igazításaival), és mindegyiknél: KI kapcsolónál a
lenyomat-teszt zöld (V1 megfelelője).

<!-- acceptance-checklist -->
- [ ] V1 kapcsoló KI → kérések bájtra azonosak, nincs jelölő
- [ ] V2 BE → nincs „Jó próba” / „bátorító” előírás, verzió `nyitomese-2`
- [ ] V3 szótár mérete, hossza, kezdőszó-korlát sávonként
- [ ] V4 200 kulcs: leggyakoribb < 10%, determinisztikus
- [ ] V5 jelölt / jelöletlen lecke megjelenítése
- [ ] V6 opciókeverés változatlan
- [ ] V7 böngészős próba három nézetben

## 11. S5b — módszersorrend, nyitásformák, névkészlet, a javítási út jelölője

Alap: TGM-terv S5b (TGM-végrehajtás 773. sortól), a 4. szakasz igazításaival. Minden új viselkedés a `STUDIO_LESSON_VARIETY` mögött.

Felülvizsgálat (TÉNY, a mai `main`): a nyitás egyetlen formája a mese (`shared/lesson-opener.ts:72`, `:99`), a hős nevét a modell
választja (15 hősből 9 Bence / Dóra / Dóri — TGM-terv 3.3); a módszerek körbeosztása (`shared/lesson-bank-plan.ts:44`) minden leckében
`prediction`-nel indul; a nyitóblokk fejléce csak „Mese” / „Történet” lehet (`shared/lesson-block-label.ts:89-93`).

Döntések:

1. **Nyitásformák lépcsőcsoportonként** (L1–L2, L3–L4, L5–L6; a lépcső a meglévő `openerStageForClassroom`): 3–4 forma, mindegyik 2–3
   mondatos leírással (pl. mese; kis rejtély / megfigyelés; „mit gondolsz?” jóslás; hétköznapi helyzet; idősebbeknek esetleírás,
   gondolatkísérlet, dilemma). A nyitás 3–6 mondat (a „PONTOSAN 5” helyett); a Célkártya négy eleme, a biztonsági és a „nincs új tény”
   szabály változatlan.
2. **Hősnév a kódból:** legalább 40 vegyes nemű magyar keresztnév, a három leggyakoribb mért név nélkül.
3. **Mag:** `seedFrom(mapId)` — ugyanaz a térkép mindig ugyanazt a formát és nevet kapja (megismételhető); két különböző térkép ugyanarra
   a témára (általában) mást.
4. **Módszersorrend:** maggal a tíz fajta + két kapukérdés keverve osztódik; mag nélkül (KI) a kimenet bájtra a régi.
5. **Verzió:** BE kapcsolónál a nyitószerződés `nyitomese-3` (az S5a `nyitomese-2` elvárása ezzel dokumentáltan változik); a jelölő
   `{ version: "valtozatossag-2", openingForm }` — a forma a lecke `mapId`-jából és évfolyamából ugyanúgy számolva, mint a promptban.
   A lejátszó a nyitóblokk fejlécét a formából veszi (kódszótár, pl. „Rejtély”, „Mit gondolsz?”); jelölő nélkül a régi címke.
6. **Javítási út:** `server/studio/structured-improvement.ts` a mentés előtt `withVarietyMarker`-t hív (a jelölő a mentéskori kapcsolót
   tükrözi, a modell jelölője sosem marad meg); a visszaolvasás (`server/workflows/apply.ts` `appliedLessonMatches`) a `variety` kulcsot
   az `art`-hoz hasonlóan figyelmen kívül hagyja.

Elfogadás (EARS):

- **V8** — WHEN a kapcsoló KI, THE szerző-, lektor- és bankprompt és a bank kvótái SHALL bájtra a korábbiak lenni.
- **V9** — WHEN a kapcsoló BE, THE nyitás SHALL a lépcsőcsoport 3–4 formájából és a ≥ 40 nevű készletből a magból kiosztva lenni; 100
  magon csoportonként SHALL ≥ 3 forma és ≥ 25 név előfordulni; a prompt SHALL NOT tartalmazni a „PONTOSAN 5” és a „Peti” szöveget.
- **V10** — WHEN a kapcsoló BE, THE módszerkiosztás SHALL mind a tíz fajtát és két kapukérdést megtartani, csomagonként ≥ 2 fajtával;
  50 magon az első módszer SHALL ≥ 6-féle lenni.
- **V11** — WHEN a lecke jelölője `openingForm`-ot hordoz, THE nyitóblokk fejléce SHALL a forma kódszótári címkéje lenni.
- **V12** — WHEN a tulajdonos javítást alkalmaz, THE mentett lecke jelölője SHALL a mentéskori kapcsolót tükrözni, és a visszaolvasás
  SHALL NOT a jelölő miatt bukni.

<!-- acceptance-checklist -->
- [ ] V8 KI → prompt és kvóta bájtra a régi
- [ ] V9 formák, nevek, nincs „PONTOSAN 5” / „Peti”
- [ ] V10 módszerkiosztás maggal
- [ ] V11 nyitóblokk-címke a formából
- [ ] V12 javítási út jelölője és visszaolvasás

## 12. S6a — fejezetív-készlet

Alap: TGM-terv S6a (TGM-végrehajtás 795. sortól). Kapcsoló: `STUDIO_LESSON_VARIETY`.

Felülvizsgálat (TÉNY): a tervező egyetlen ívet kap, kétszer (`server/studio/step-io.ts:395` „explain → example → check, a végén
legfeljebb egy rövid recap”, `:404` „A plannedBlocks sorrendje EZT az ívet kövesse”), a szerző a terv sorrendjét követi
(`server/studio/role-skills.ts:116`) → a fejezetek 61,6%-a pontosan azonos blokksorú (TGM-terv 3.3).

Döntések:

1. `shared/lesson-section-shapes.ts`: hat fejezetminta — `alap` (explain, example, animate, check, recap), `megmutatas` (explain,
   animate, example, try, check), `kerdesfelveto` (explain, example, check, explain, recap), `gyakorlo` (explain, example, try, check,
   recap), `osszehasonlito` (explain, animate, example, example, check), `donteshelyzet` (explain, example, animate, check). Mind
   átmegy a `shared/lesson-arc.ts` kapuján (magyarázattal kezd, példa a kérdés előtt, a gyakorlóarány ≤ 75%) — a kapu NEM változik.
2. A tervező BE kapcsolónál fejezettípust ad (`sectionKind`: `procedure` | `description` | `comparison` | `any`; engedékeny, opcionális
   mező); a fogalom-fejezetek `plannedBlocks`-át a program a terv elfogadása UTÁN a kiosztott mintára írja át (determinisztikus, modellkör
   nélkül). A különleges fejezetek (`sectionRoleOf` szerint: kidolgozott feladat, leggyakoribb hibák, ellenőrzés) és a tulajdonos
   jóváhagyott (`approvedOutline`) terve változatlan. Az utolsó fejezet mindig `recap`-pal zárul (a program hozzáfűzi).
3. Kiosztás (`assignSectionShapes(kinds, seed)`): a típushoz illő minták közül a magból (`seedFrom(mapId)`); szomszédos fejezet nem kapja
   ugyanazt; egy minta a fejezetek legfeljebb 40%-a (felfelé kerekítve); ha a szabályok ütköznek, előbb a 40%-os, majd a szomszéd-szabály
   enged. Illeszkedés: `any` → mind a hat; `procedure` → alap, megmutatás, gyakorló, döntéshelyzet; `description` → alap, megmutatás,
   kérdésfelvető; `comparison` → összehasonlító, döntéshelyzet, alap.
4. KI kapcsolónál a terv bájtra a régi (a kéretlen `sectionKind` mező is eldobva), a pedagógus-prompt bájtra a régi.
5. A kiosztott minták mentése (az SK2 kapujához) az SK2 feladata; addig az SK2 a „bármely készletbeli minta” szabályt méri.

Elfogadás (EARS):

- **V13** — THE hat minta SHALL átmenni a `checkLessonArc` kapun (nyitóblokkokkal és záró recap-pal épített ál-leckében).
- **V14** — WHEN a kiosztás 3…12 fejezetre fut 200 magon, THE szomszédos fejezetek SHALL NOT azonos mintát kapni, és egy minta SHALL
  legfeljebb a fejezetek 40%-a (felfelé kerekítve) lenni.
- **V15** — WHEN a kapcsoló BE, THE modell által tervezett fogalom-fejezetek `plannedBlocks`-a SHALL a kiosztott minta lenni, a különleges
  fejezeteké SHALL változatlan lenni, és az utolsó fejezet SHALL recap-pal zárulni; WHEN KI, THE terv SHALL bájtra a régi lenni.
- **V16** — WHEN a kiosztás szimulációja (modellhívás nélkül, minden típus `any`, 3–12 fejezet) fut, THE leggyakoribb fejezetminta
  aránya SHALL < 35% és két véletlen fejezet azonos mintájának valószínűsége SHALL < 20% lenni (alapvonal: 61,6% és 40,4%).

<!-- acceptance-checklist -->
- [ ] V13 minták az ívkapun
- [ ] V14 szomszéd- és 40%-szabály
- [ ] V15 átírás BE-nél, KI bájtra a régi
- [ ] V16 szimuláció < 35% / < 20%

## 13. S6b — `try` minimum és rotáció, szerzői hangok

Alap: TGM-terv S6b (TGM-végrehajtás 829. sortól). Kapcsoló: `STUDIO_LESSON_VARIETY`.

Felülvizsgálat (TÉNY): a `try` a blokkok 0,7%-a, 239 leckéből 196-ban egy sincs (TGM-terv 3.3); a szerző regiszterét sávonként egyetlen
mondat adja (`shared/lesson-band.ts:59-68`). Előfeltétel ellenőrizve: a `try` eredménye nem számít bele a pontozásba és a Próbába (a
`check` számít; `shared/lesson-arc.ts:34` csak a megmutató réteghez sorolja) — a pontozás nem változik.

Döntések:

1. A kiosztás (S6a `applySectionShapes`) a fogalom-fejezetek legalább harmadára (felfelé kerekítve) `try`-t ad: ha a kiosztott minták
   kevesebbet adnak, a magból választott fejezetek mintájába a `check` elé (ha nincs `check`, a végére, recap elé) `try` kerül. A
   különleges fejezetek nem változnak; a `try` nem gyakorlóblokk, az ívkapu aránya csak javul.
2. Fajta a fejezettípusból: `procedure` → `dragSort`, `comparison` → `match`, `description` → `fillBlank`, `any` → a magból forgatva úgy,
   hogy két egymást követő `try` ne legyen azonos fajtájú. A fajta a terv fejezetén `tryKind` mezőként megy a szerzőhöz (a vázlat
   JSON-jában), a szerző-prompt BE ága egy mondattal kéri a betartását. KI-nél a kéretlen `tryKind` is eldobva.
3. Jelzés, nem kapu: BE kapcsolónál `telemetry.gates.tryShare` (a kész lecke `try`-t tartalmazó fejezeteinek aránya, két tizedes) és
   `qualityNotes` bejegyzés (`try_share_low`), ha 1/3 alatt marad.
4. Szerzői hang sávonként (`BAND_VOICES`, sávonként 3 leírt hang, 2–3 mondat: mondatritmus, a kérdések aránya, a példák keretezése); a
   magból választva (`bandVoiceForPrompt(band, seed)`), a regisztersor után. A szöveg kimondja: a hang a tényekre és a fogalmak
   szóhasználatára nem hat.

Elfogadás (EARS):

- **V17** — WHEN a kiosztás 3…12 fogalom-fejezetre fut, THE `try`-t tartalmazó fejezetek aránya SHALL ≥ 1/3 lenni, a fajta SHALL a
  típushoz illeni, és két egymást követő `try` SHALL NOT azonos fajtájú lenni, ha van választás (`any`).
- **V18** — WHEN a kapcsoló BE, THE kész lecke `try`-aránya SHALL a telemetriába kerülni, és 1/3 alatt SHALL minőségi jelzést adni
  (megállás nélkül).
- **V19** — THE hangkiosztás SHALL determinisztikus lenni, és 50 magon sávonként SHALL ≥ 2 hang előfordulni; KI kapcsolónál a szerző-prompt
  SHALL bájtra a régi lenni.
- **V20** — WHEN a szimuláció fut, THE V16 küszöbei SHALL a `try`-beszúrással is teljesülni.

<!-- acceptance-checklist -->
- [ ] V17 try-minimum, fajta, rotáció
- [ ] V18 tryShare jelzés
- [ ] V19 hangok, KI bájtra a régi
- [ ] V20 szimuláció a beszúrással

## 14. S6c — ábrafajta-terv és szebb ábrák

Alap: TGM-terv S6c (TGM-végrehajtás 850. sortól), a tulajdonos 2026-11-20-i kérésével („lényegesen szebb ábrák”). Kapcsoló: `STUDIO_LESSON_VARIETY`.

Felülvizsgálat (TÉNY):
- A `fraction`, `map`, `wordBuilder`, `sentenceParts` paraméter-alakja nincs a `VISUAL_PARAMS_CONTRACT`-ban
  (`shared/lesson-visual-params.ts:240-250`), ezért a modell nem választja őket (a 239 kiadott leckében 0 előfordulás, TGM-terv 3.3).
- A négy megjelenítő (`client/src/lesson-runtime/blocks/animate-blocks.tsx:38-187`) egyszerű dobozsor, kódba írt színekkel
  (`#10b981`, `bg-emerald-500`, `bg-sky-100`…), nem az évfolyamsáv tokenjeivel (`--ws-accent`, `--ws-accent-2`, `--ws-accent-3`,
  `lesson-design.css:40-60`). A `process` és a `timeline` (a kiadott ábrák többsége a szabad rajzzal együtt) szintén.
- Nincs tantárgyi fajta-ajánlás és fajta-arány jelzés; az ábrakészítő minden tantárgyban ugyanazt a listát kapja (`step-io.ts:767`).

Döntések:

1. **A négy, élesben soha nem használt fajta megjelenítője újrarajzolva** a sáv tokenjeivel (tört: körcikk + téglalapsáv + számláló /
   nevező; térkép: pontok számozott jelölővel, jelmagyarázattal; szóépítés: színezett szórészek kötőjellel és eredménnyel; mondatrészek:
   színkódolt elemek szerepcímkével). Mivel a mért kiadott állományban 0 előfordulásuk van, a változás a kiadott leckéken gyakorlatilag
   semleges (UNVERIFIED a 2026-11-18 utáni gyártásra — ott is csak a kinézet változik, adat nem). Mobilon sortörés, vízszintes görgetés nélkül.
2. **`process` és `timeline` új megjelenése csak jelölt leckén** (`FeedbackVarietyContext`): számozott, sávszínű lépéskörök
   nyilakkal, mobilon függőleges elrendezésben; jelöletlen leckén a régi megjelenítő (bájtra azonos DOM).
3. **Prompt (BE):** az ábrakészítő promptjában (`buildAnimatorPrompt`) `visualParamsContract(true)` a négy fajta paraméter-alakjával (a szerzői blokk-katalógus és a fejezet-ábratervező állandó szövege változatlan, gyorsítótár-előtag); `shared/visual-kind-plan.ts`: `SUBJECT_KIND_HINTS`
   (tantárgy → legalább két ajánlott fajta a hirdetett listából) és a tantárgy ajánlása az ábrakészítő promptjában; KI: bájtra a régi.
4. **Jelzés, nem kapu:** `kindShareProblems(lesson)` — ha egy fajta a lecke nem forráshoz kötött ábráinak több mint 40%-a (legalább 5
   ábránál), `qualityNotes` (`visual_kind_share`); BE-nél `telemetry.gates.visualKinds` (fajtánkénti darabszám).
5. **Nem változik:** a szerepleírás (`role-skills.ts:146`) illusztráció-színlistája — a szabad SVG rajz konkrét színeket kér (a tisztító
   `currentColor`-t átszínez, `var()`-t nem ismer, `shared/illustration-svg.ts:88-90`); a paraméteres fajták színét a megjelenítő adja a
   sáv tokenjeiből. A `pictureCards` és `table` ajánlása az S2b / S3a után kerül a táblába (ma nincs a hirdetett listában).

Elfogadás (EARS):

- **V21** — THE négy fajta megjelenítője 360×640, 844×390 és 1280×800 nézetben SHALL átfedés, levágás és oldalszintű vízszintes görgetés
  nélkül, a sáv színeivel rajzolni (böngészős próba, képernyőkép).
- **V22** — WHEN a lecke jelölt, THE `process` / `timeline` SHALL az új megjelenítővel rajzolódni; WHEN jelöletlen, SHALL a régi DOM-mal.
- **V23** — WHEN a kapcsoló BE, THE ábrakészítő promptja SHALL a négy fajta paraméter-alakját és a tantárgy ajánlását tartalmazni; WHEN KI,
  SHALL bájtra a régi lenni. THE ajánlótábla SHALL minden katalógus-tantárgyra legalább két, a hirdetett listában szereplő fajtát adni.
- **V24** — THE fajta-arány jelzés SHALL 10 ábrából 5 azonosnál megszólalni, 4-nél nem, és a forráshoz kötött ábrák SHALL NOT számítani.

<!-- acceptance-checklist -->
- [ ] V21 négy fajta, három nézet, képernyőkép
- [ ] V22 process / timeline új megjelenés csak jelölt leckén
- [ ] V23 prompt BE / KI, ajánlótábla
- [ ] V24 fajta-arány jelzés

## 15. SK2 — a változatosság gépi mérőszáma és kapuja

Alap: TGM-terv SK2 (TGM-végrehajtás 873. sortól). Kapcsoló: `STUDIO_LESSON_VARIETY` (a kapu csak BE kapcsolónál fut a gyártásban).

Felülvizsgálat (TÉNY): a mérés eddig csak a munkamenet jegyzeteiben élt (`variety-fetch.mjs`, `variety-measure.mjs`, 402 sor, saját
számítással); a repóban nincs mérőszám, küszöb és kapu (`server/studio/gates/` csak a `sourceCoverage` kaput ismeri).

Döntések:

1. `shared/variety-metrics.ts` (tiszta, a mérőszkript és a kapu közös forrása): `sectionPattern` (blokkbetűk: E, X, A, C, T, R — a mért
   jelentés jelölése), `sectionSkeleton` (ábra és try nélkül, ismétlés összevonva), `patternShares`, `samePatternProbability` (két
   KÜLÖNBÖZŐ leckéből vett fejezet azonos mintája), `feedbackOpenerShares` (a hibás válasz első két szava), `tryShare` (S6b), `animKindShares`,
   `measureVariety`, `thresholdReport`. `VARIETY_THRESHOLDS = { topPatternShare: 0.35, samePatternProbability: 0.2,
   topFeedbackOpenerShare: 0.1, maxKindShare: 0.4, minTryShare: 1/3 }`.
2. `scripts/measure/fixtures/variety-baseline.json`: csak összesített alapvonal (239 lecke): 0,616 · 0,404 · 0,468 · 0,858 · 6 · 0,007.
3. `scripts/measure/variety-fetch.mjs` a jegyzetekből (átnézve: kapcsolati szöveg csak a `--env` fájlból, kiírás nélkül; `SET
   default_transaction_read_only = on`; csak `select`/`with`; útvonalak paraméterként). A 402 soros régi mérő helyett új, rövid
   `scripts/measure/variety-measure.mts` a közös modullal: `--population <json> --baseline <json> [--since <dátum>]` → táblázat
   (alapvonal | most | küszöb | megfelel); legalább 10 lecke alatt „kis minta” és 0 kilépési kód, különben küszöbsértésnél 1.
4. `server/studio/gates/variety-gate.ts` (bejegyezve a `GATE_REGISTRY`-be, `GATE_MODES.variety = "report"`): (a) **kapu** — a fogalom-
   fejezetek ábra és try nélküli váza (`sectionSkeleton`) egy készletbeli minta vázával egyezik (az S6a kiosztott mintáit nem mentjük, ezért
   „bármely készletbeli minta” — terv 12. szakasz 5. pont; az ábrakészítő beszúrt ábrái és a nyitóblokkok nem számítanak), és a
   visszajelzésekben nincs régi bátorító előtag (számolva); (b) **jelzés** — `tryShare < 1/3`, egy fajta > 40%. `report` módban a
   gyártást nem állítja meg; a motor BE kapcsolónál futtatja, a telemetriába (`varietyGate`) és a naplóba ír. `enforce` (egy célzott javító
   forduló) az S10 záró mérése után, orkesztrátori döntéssel — ebben a szeletben nem épül.

Elfogadás (EARS):

- **V25** — THE mérőszámok SHALL 4 szintetikus leckén a kézzel számolt értéket adni.
- **V26** — WHEN minden fejezet azonos, készleten kívüli vázú, THE kapu SHALL bukni a fejezet megnevezésével; WHEN a vázak a készletből
  valók (ábrával, try-jal, nyitóblokkal tarkítva is), SHALL átmenni.
- **V27** — WHEN egy visszajelzés „Jó próba, de…” kezdetű, THE kapu SHALL megszámolni; WHEN 10 ábrából 5 azonos, SHALL jelezni.
- **V28** — THE mérőszkript SHALL a küszöbtáblát kiírni, kis mintánál 0, küszöbsértésnél 1 kilépési kóddal (füstpróba 2 és 12 leckén).

<!-- acceptance-checklist -->
- [ ] V25 mérőszámok kézi elvárással
- [ ] V26 kapu: készleten kívüli váz bukik, készletbeli átmegy
- [ ] V27 régi előtag számolva, fajta-arány jelzés
- [ ] V28 mérőszkript kilépési kódjai

## 16. S2b — döntési fa és képes kártyák (két alszelet)

Alap: TGM-végrehajtás „S2b” (355. sortól). Kapcsoló: `STUDIO_SOURCE_VISUALS` (a modell kimenetének határa KI állapotban az új fajtát a
bővítés előtti hibával utasítja el — `legacyAnimKindSchema`); a megjelenítés a tárolt leckén kapcsolótól független (mint az S2a-nál).

A TGM-végrehajtás S2b-je a két megjelenítőn felül nyolc vak-leletet is kötelezővé tesz (vak J2, J5, J6, J7, J11, J12, tt J6, tt J9) —
együtt jóval 400 sor fölött. Ezért két alszelet:

- **S2b-1 (ez a PR):** `decisionTree` és `pictureCards` — `ANIM_KINDS` + `SOURCE_VISUAL_ANIM_KINDS` + `SOURCE_VISUAL_SCHEMA_KINDS`
  (a hibás paraméterű blokk nem rajzol, a szerzői kimenetből kimarad), szigorú paraméter-sémák a megosztott szerződés alakjával
  (`shared/source-visual-render.ts`; fordítási őr), `renderedVisualTexts` (lektor-nézet és címke-őr), feliratok (`ANIM_LABELS`),
  megjelenítők (`source-visuals.tsx`; sávtokenes CSS), tt J6 (a fedettségi kapu a két fajtát „megjelent”-nek méri — teszt), vak J12
  (`branchYes / branchNo` a fa alapértelmezett ágfelirata). Böngészős próba: kétszintű háromágú fa, Igen / Nem fa, 8 képes kártya,
  360×640, 844×390, 1280×800, képernyőképpel.
- **S2b-2 (következő PR):** vak J2 (görgetésjelző a tábla fölött, cím a görgőn kívül), J5 (kontraszt-őr a tokenekből), J6 (kisfilm
  ráúszó ábrája az új fajták nélkül), J7 (a tábla legkisebb szélessége a tartalomból), J11 (nyomtatás), tt J9 (`useHeaderFit`).

Sémák (S2b-1): `decisionTree` `{ root: Node }`, `Node = { text ≤ 120, branches?: 2..4 × { label ≤ 40, node } }`, legfeljebb 3 szint,
összesen ≤ 13 csomópont. `pictureCards` `{ cards: 2..8 × { label ≤ 40, svg ≤ 6000 (a meglévő illusztráció-tisztítón át), caption? ≤ 80,
example? ≤ 120 } }`.

Elfogadás (EARS):

- **V29** — THE séma SHALL elutasítani a 4 szintű fát, az 1 ágú csomópontot, a 14 csomópontos fát és a 9 kártyát; a `<script>`-et
  tartalmazó kártya-SVG SHALL ártalmatlan maradni.
- **V30** — WHEN `STUDIO_SOURCE_VISUALS` KI, THE modell kimenetének sémája SHALL a két új fajtát a korábbi hibával elutasítani
  (lenyomat-teszt zöld).
- **V31** — THE fedettségi kapu SHALL a forrás döntési fáját és képes kártyáit a megfelelő blokk mellett „megjelent”-nek mérni.
- **V32** — THE fa két levele SHALL ugyanannak a szülőnek két gyereke lenni a DOM-ban (nem nyíllal összekötött sor), és a három nézetben
  SHALL átfedés, levágás és oldalszintű vízszintes görgetés nélkül megjelenni (böngészős próba, képernyőkép).

<!-- acceptance-checklist -->
- [ ] V29 sémahatárok és SVG-tisztítás
- [ ] V30 KI kapcsolónál a modell-séma változatlan
- [ ] V31 fedettségi kapu: megjelent
- [ ] V32 DOM-szerkezet és böngészős próba

## 17. S2b-2 — a megjelenítők vak-leletei (vak J2, J5, J6, J7, J11, tt J9)

Alap: TGM-végrehajtás „S2b” vak-leletei (357–413. sor). Megjelenítési változás, adatírás nélkül; a forrás-ábrafajták élesben a
`STUDIO_SOURCE_VISUALS` (KI) miatt nem keletkeznek, ezért a kiadott leckéken semleges.

1. **J2 — görgetésjelző és táblacím:** a jelző a görgő tábla FÖLÖTT áll; a táblázat címe a görgő kereten kívül, látható címként
   (`.sv-table-title`) jelenik meg, a `<caption>` képernyőolvasónak megmarad (`sr-only`).
2. **J5 — kontraszt:** a „Példa” címke a sáv mért gomb-párját kapja (`--ws-strong` / `--ws-strong-ink`, ≥ 4,5:1 minden sávban és a
   csendes nézetben); a tónusjel és a fejléc alsó vonala saját jelző-tokent (`--sv-mark`: `--ws-mark-a/b/c`, alapértéke a kísérőszín) —
   a `future` sáv és a csendes nézet saját értéket kap, hogy a jel ≥ 3:1 legyen a fejléc hátterén. Őr: `tests/source-visual-contrast.test.ts`
   a CSS tokenjeiből számol (a `color-mix` 14%-os keverését is).
3. **J6 — fejezet-kisfilm:** a forrás-ábrafajták (`SOURCE_VISUAL_ANIM_KINDS`) és a hibás paraméterű blokk nem kínálható fel ráúszó
   ábrának (`animateBlockIndexes`), és a lejátszó a régi kisfilm ilyen hivatkozását sem rajzolja ki (görgetés nélküli, levágott keretben
   olvashatatlan lenne). Böngészős reprodukció nem készült: a kódút egyértelmű (`clips/clip2-overlays.tsx` `lessonVisual` ága +
   `lesson-clips2.css` `overflow: hidden`), a javítás védekező.
4. **J7 — fölösleges görgetés:** rövid tartalmú (minden cella ≤ 12 karakter) táblánál nincs oszlopszám-alapú legkisebb szélesség
   (`data-compact`), így egy „1 | 2 | 3” tábla 360 px-en sem görög.
5. **J11 — nyomtatás:** `@media print` — a görgő keret nem vág, a tábla tördelhető, a jelző rejtett.
6. **tt J9 — `useHeaderFit`:** a mérés a fejlécek szövegének változására is újrafut (a hatás függősége a fejléc-kulcs).

Elfogadás (EARS):

- **V33** — THE görgetésjelző SHALL a tábla fölött állni, és a táblacím SHALL a görgő kereten kívül, görgetés nélkül olvasható lenni.
- **V34** — THE „Példa” címke SHALL ≥ 4,5:1, a tónusjel SHALL ≥ 3:1 kontrasztú lenni mind az öt sávban és a csendes nézetben.
- **V35** — THE kisfilm SHALL NOT forrás-ábrafajtát vagy hibás paraméterű blokkot ráúszó ábrának kínálni vagy kirajzolni.
- **V36** — WHEN a tábla minden cellája rövid, THE tábla SHALL NOT görögni 360 px-en; nyomtatásban SHALL NOT levágódni.
- **V37** — WHEN a fejlécek szövege változik, THE fejléc-illesztés SHALL újramérni.

<!-- acceptance-checklist -->
- [ ] V33 jelző fölül, cím kívül
- [ ] V34 kontraszt minden sávban és csendes nézetben
- [ ] V35 kisfilm: nincs forrás-ábra / hibás blokk
- [ ] V36 rövid tábla nem görög; nyomtatás
- [ ] V37 fejléc-illesztés újramér
