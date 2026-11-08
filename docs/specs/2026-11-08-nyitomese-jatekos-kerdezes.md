# Spec: Nyitómese és játékos kérdezés a tananyaggyártásban

> Dátum: 2026-11-08 · Szerző: Claude (Opus 5.5) · Állapot: **VÁZLAT — tulajdonosi átnézésre vár**
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes-vegrehajtas.md`.
> Kanban: #6.

## 0. Kérés és tulajdonosi döntések

Tulajdonosi kérés (2026-11-08, szó szerint összefoglalva): a két feltöltött könyv (Oțoiu: *Terápiás mesék gyermekeknek*;
Coatu: *600 IQ-fejlesztő játék, fejtörő és találós kérdés gyerekeknek*) **módszertanát** — nem a szövegét — építsük be a
tananyaggyártásba tudásként. **Minden tananyag a mesék módszerére épülő nyitással kezdődjön**, minden korosztálynak a maga
szellemi és lelki szintjén; magasabb évfolyamon komolyabb, de figyelemfelkeltő formában. A fejtörők **kérdés–válasz és játékos
kérdezési módszertana** is épüljön be. Mindkét könyvhöz keressünk **nyílt licencű** forrásokat, és azok tudását is építsük be.

Tulajdonosi döntések (2026-11-08, a javasolt opciók elfogadva):
- **A)** A nyitómese **két rétegű**: a lecke saját tantárgyi problémája + egy tanulási-lelki nehézség (nem tisztán SEL).
- **B)** **Először csak promptbővítés** (mérhető, visszavonható), saját blokktípus csak a mérés után.
- **C)** **Csak az új és a javított leckék** kapják meg; tömeges újragyártás nincs.

## 1. Cél

1. A két könyv és a nyílt források módszertana **egy helyen, saját megfogalmazásban, forrásjegyzékkel** legyen a repóban
   (tudásbázis), és ebből vezessük le a gyártási szerződéseket.
2. Az AI-szerző (Stúdió JSON-út és önálló HTML-út) **minden új leckét évfolyamhoz hangolt nyitómesével** kezdjen, amely a lecke
   tantárgyi kérdéséhez vezet, egy átvihető tanulási stratégiát ad, és a lecke végén visszatér a tanulsággal.
3. A bank (Módszerek / Feladatok / Kvíz) gyártója a **játékos kérdezési módszertan** szerint dolgozzon: nehézségi ív, irányt mutató
   segítség, „mit kérdezett valójában” magyarázat, hibabarát visszajelzés, évfolyam szerinti feladatforma.
4. A viselkedés **kapcsolóval** (alapból KI) mérhető legyen az éles működés megváltoztatása nélkül, és a bekapcsolás feltételei
   rögzítettek legyenek.

## 2. NEM cél

- A két könyv szövegének, szereplőinek, feladatainak, cselekményének átvétele vagy átírása (szerzői jog, „Tilos a terjesztés”).
- Terápiás ígéret, diagnózis, szakember helyettesítése. A nyitómese tanulást segítő keret, nem terápia.
- Új blokktípus (`story`), séma-, renderer-, kártyaleírás-, szókeret- vagy kapumódosítás ebben a körben — ez az S3, a mérés után,
  külön spec szerint.
- Új bankmező (pl. kvíz `hint`) — ez az S4, külön spec szerint.
- Meglévő leckék tömeges újragyártása (C döntés).
- A befagyasztott `websuli-runtime-2` csomag bármilyen módosítása (`shared/instruction-bundles/roles.ts:50`, bájtra rögzített teszt).
- A Tananyag Készítő skill (`anthropic-skills:tananyag-keszito`, `.agents/skills/tananyag-keszito/`) átírása ebben a körben.

## 3. Mért tények (kódból ellenőrizve, 2026-11-08)

| Tény | Hely |
|---|---|
| Nincs nyitó/mese blokk; minden szakasz `explain` blokkal kezdődik, kérdéssel nyitni tilos | `source/shared/lesson-arc.ts:221-232` (`LESSON_ARC_CONTRACT`) |
| A hat blokkfajta és mezőik a szerzői promptban | `source/server/studio/step-io.ts:390-406` (`AUTHOR_BLOCK_CATALOG`) |
| A szerző mércéje: címke = állítás (a fogalom `term`-je a blokk szövegében), csak a térkép fogalmai, forráson kívüli érdekesség nem kell | `step-io.ts:441-449` (`TEACHING_CONTRACT`) |
| `explain.text` legfeljebb 4000 karakter, `recap` pont 500 | `source/shared/lesson-schema.ts` (`LESSON_TEXT_LIMITS`) |
| Szerzői prompt: korsáv + regiszter, majd szerződések | `step-io.ts:463-508` (`buildAuthorPrompt`, sáv: `:473`, `:478`) |
| Korsáv három fokozatban (≤4 kid, ≤8 teen, egyébként senior) | `source/shared/lesson-schema.ts:90-94`; regiszter: `source/shared/lesson-band.ts:59-68` |
| Finomabb öt csoport (1-2, 3-4, 5-6, 7-8, 9+; 0 → 7-8) | `lesson-band.ts:27-34` (`learningAgeGroup`) |
| Lektor prompt; jegyzetfajták: source_conflict, coverage_gap, language, age; az `age` nem blokkoló | `step-io.ts:592-652` (`buildLektorPrompt`, `:635`, `:641`) |
| Bank közös módszer-szerződése; tíz módszertípus | `source/shared/lesson-experience.ts:325-336`, `:21` (`METHOD_KINDS`) |
| A bank statikus (gyorsítótárazott) promptelőtagja | `source/server/studio/experience-builder.ts:34-35` (`bankStaticPrefix`) |
| A kvíz sémájában nincs `hint`; a `check` blokkban van opcionális `hint` | `lesson-experience.ts:89-98`; `step-io.ts:398` |
| HTML-út: spec + módszer-szerződés összefűzése | `source/server/ai/lesson-html-spec.ts:545-548` (`lessonHtmlSpecParts`) |
| Webkutatásos HTML-szerző prompt | `source/server/studio/web-research-agent.ts:176-199` (`webLessonAuthorPrompt`) |
| A főoldali kártya leírása az első fejezet első `explain` blokkjából készül | `source/shared/lesson-teaser.ts` (`lessonTeaser`) |
| A szülők panasza szerint a leckék túl hosszúak; szókeret évfolyamonként | `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md`; `source/shared/lesson-length.ts` |
| Mérőeszköz egy teljes gyártásra, környezeti változós A/B mintával (`STUDIO_CHECK_EFFORT`) | `source/scripts/measure/single-run-measure.mts:1-20` |
| A futás promptazonosítója konstans (`SINGLE_RUN_VERSION`), nem a prompt hash-e | `source/server/studio/single-run/engine.ts:503` |

## 4. Módszertani tartalom (rögzített, a tudásbázis és a szerződések alapja)

### 4.1 Nyitómese — dramaturgia (a terápiás mesékből absztrahálva, saját szavakkal)

1. Szerethető, a tanulóhoz illő hős; a nehézség **viselkedésként** jelenik meg, soha nem címkeként.
2. A hős a lecke **tantárgyi problémájával** találkozik egy konkrét helyzetben.
3. Elakad vagy hibázik; a mese megnevezi az érzést (és kicsiknél egy testi jelét).
4. Segítő/mentor vagy egy felismerés jelenik meg; normalizál („nem csak veled történik”).
5. Egy **konkrét, átvihető stratégia** (lépésekre bontás, ellenőrzés, lista, belső mondat, kérdezés, nyugodt újrapróbálás) —
   kisebbeknél „varázstárgyba” csomagolva, de kimondva, hogy valódi módszer, nem varázslat.
6. A mese **nyitott kérdéssel** ér véget (kíváncsiságrés), amelyre a lecke adja meg a választ.
7. A lecke **utolsó összefoglalója visszatér** a hőshöz: mit tanult meg, hogyan használta a stratégiát (kimondott tanulság).

### 4.2 Évfolyamlépcső (rögzített)

| Lépcső | Évfolyam | Forma | Hossz (látható szó) | Tanulság |
|---|---|---|---|---|
| L1 | 1–2. | állat- vagy fantáziamese, bölcs segítő, „varázstárgy” = stratégia; mondat ≤ 12 szó | 50–90 | a mese végén kimondva + a recapben |
| L2 | 3–4. | kaland gyerek- vagy fantáziahőssel, küldetés; „Te mit tennél?” | 70–110 | a recapben kimondva |
| L3 | 5–6. | életszerű kortárs helyzet vagy kis rejtély; a hős hibázik, a lecke adja a kulcsot | 80–130 | a recapben, a tanuló szemszögéből |
| L4 | 7–8. (és 0. programozás) | dilemma, csoporthelyzet, igazságosság, döntés; vagy a forrásban szereplő esemény jelenetként | 90–140 | a tanuló vonja le; a recap kérdésként zárja |
| L5 | 9–10. | esetleírás valósághű helyzetben, ütköző nézőpontok, gondolatkísérlet | 100–160 | nyitott; a recap az elemzés eredményét mondja ki |
| L6 | 11–12. | érett, „mesélő hang” nélküli eset vagy szakmai/erkölcsi dilemma, érettségi- és életpálya-vonatkozással | 100–170 | nyitott; a recap szintézise |

A felső határ a szókereten **belül** van: a nyitómese nem növeli a lecke célhosszát (`lesson-length.ts`), hanem a
szakasz bevezető mondatait váltja ki.

### 4.3 A lelki réteg (A döntés)

Egy, a tantárgyhoz illő **tanulási** nehézség a következő listából: halogatás és szervezés; figyelem; türelem és önuralom;
hibától/kudarctól való félelem; kitartás; segítségkérés; együttműködés; tökéletességre törekvés; megszólalás mások előtt.
A stratégia mindig konkrét és otthon is megismételhető.

### 4.4 Biztonsági és tartalmi korlátok (rögzített, minden lépcsőn)

- Nincs diagnózis vagy betegségcímke (pl. ADHD, szorongásos zavar), terápiás ígéret, megszégyenítés, testi jellemzők kritikája.
- 1–6. évfolyamon tilos: halál, bántalmazás, válás, betegség, erőszak, félelemkeltő jelenet. 7–12. évfolyamon társas nehézség
  (kirekesztés, csoportnyomás) visszafogottan megengedett, naturalisztikus részlet nélkül.
- **Új tény nem kerülhet be**: a mese kitalált kerete (szereplő, helyszín) nem tény; minden tantárgyi állítás a térképből jön
  (`TEACHING_CONTRACT` 2. pont változatlanul érvényes). Valós személy vagy esemény csak akkor szerepelhet, ha a térképben van.
- A mese az első fejezet első fogalmának nevét (`term`) szó szerint tartalmazza, és azt a `coversConceptIds`-ben jelöli; a
  fogalom tényleges tanítása a következő `explain` blokkban történik (a megalapozási kapu fejezetenként mér, `step-io.ts:443`).
- Szöveg, szereplő vagy feladat a két licencelt könyvből nem vehető át.

### 4.5 Játékos kérdezés — szabályok a bankhoz (saját szavakkal, a fejtörőkönyvből és nyílt forrásokból)

1. **Nehézségi ív** minden körben: könnyű, sikerélményt adó kezdés → közepes → kihívás.
2. **Formák leképezése a meglévő módszertípusokra** (séma nem változik):
   - `prediction` → előkérdés / becslés / kíváncsiságrés (hibázni szabad, a magyarázat a lecke tartalmára mutat);
   - `myth` → igaz/hamis csapda (hihető, de hamis állítás; a magyarázat megmondja, mi tévesztett meg);
   - `popup` → találós kérdés (tulajdonságleírásból a fogalom);
   - `gate` → kapurejtvény (csak egyértelmű, ellenőrzött megoldással);
   - `analogy` → „olyan, mint…” párosítás; `conflict` → dilemma (7. évfolyamtól); `selfCheck` → „magyarázd el, miért”.
   - Kvízben „melyik nem illik közé?” (kakukktojás) csak akkor, ha **egyetlen** védhető helyes válasz van, indoklással.
   - Nyílt feladatban „Mi lenne, ha…?” kérdés megengedett, de a pontozás a tanított fogalom alkalmazását méri (`required`), a
     mintaválasz egy lehetséges jó válasz.
3. **Visszajelzés** (`feedbackPerOption`, módszer `answer`): helyes válasznál a „miért jó”; rossz válasznál első mondat
   bátorító, utána **irány, nem a megoldás**, majd egy mondat arról, **mit kérdezett valójában** a feladat. Erőfeszítést dicsér,
   nem minősít.
4. **Évfolyam szerinti forma**: 1–2. konkrét, egylépéses, nincs csapda; 3–4. találós kérdés, kakukktojás; 5–6. igaz/hamis
   csapda indoklással, kétlépéses; 7–8. többlépéses, laterális; 9–12. dilemma, becslés, ellenpélda, „magyarázd el, miért”.
5. A játékos keret **nem engedi** új tény bevezetését: a meglévő „KIZÁRÓLAG a Tananyag lapon ténylegesen megtanított állítások
   kérdezhetők” szabály (`lesson-experience.ts:334`) változatlan.

### 4.6 Forrásjegyzék — licencellenőrzés állapota

Ötlet és módszer szerzői jogilag nem védett; szöveget csak közkincsből vagy CC BY / CC BY-SA forrásból veszünk át, forrásmegjelöléssel.

| Forrás | Licenc | Ellenőrzés | Mit használunk |
|---|---|---|---|
| Linnavalli és mtsai (2024): SAGA második vizsgálat, *Frontiers in Education*, doi:10.3389/feduc.2024.1284474 | CC BY | **oldalon ellenőrizve** 2026-11-08 | mese utáni „mit érezhetett / gondolhatott?” kérdés hatása |
| Redman és mtsai (2024): iskolai kreatív biblioterápia protokoll, PMC10936023 | CC BY (AAM) | **oldalon ellenőrizve** 2026-11-08 | iskolai, nem klinikus által vezetett történetalapú beavatkozás kerete (protokoll, eredmény nélkül) |
| Dudeney: *Amusements in Mathematics*, Project Gutenberg #16713 | „Public domain in the USA” | **oldalon ellenőrizve** 2026-11-08 | feladat → tipp → megoldás minta, történetbe ágyazott fejtörő |
| Aiszóposz-mesék, Project Gutenberg #11339 | közkincs (USA) | keresési találat | rövid mese, kimondott tanulság |
| Wikipedia: Zone of proximal development | CC BY-SA 4.0 | kutatóügynök látta | fokozatosan elhagyható segítség |
| IES/WWC Practice Guide (Pashler és mtsai 2007) | valószínűleg közkincs (USA szövetségi) | UNVERIFIED | ajánlások erőssége: ismétlő kvíz (erős), mély „miért” kérdés (erős), előkérdés (gyenge) |
| OpenStax *Psychology 2e*, *Lifespan Development* | **CC BY-NC-SA 4.0** | **oldalon ellenőrizve** | csak módszertani tájékozódás, szöveg nem vehető át |
| Benedek Elek, Arany László népmesék (MEK) | UNVERIFIED (a MEK nem töltött be) | — | csak ellenőrzés után |
| Kizárva: NRICH, Open Middle, Deans for Impact (minden jog fenntartva); Susan Perrow könyvei (kereskedelmi) | — | — | — |

## 5. Szeletek

- **S1 — Tudásbázis (viselkedésváltozás nélkül).** `docs/modszertan-nyitomese-jatekos-kerdezes.md` a 4. fejezet teljes
  tartalmával, kidolgozott (saját) példákkal lépcsőnként; hivatkozás a `docs/lesson-improvement.md`-ből.
- **S2 — Szerződések kapcsolóval (alapból KI).** Új `source/shared/lesson-opener.ts` (lépcső-hozzárendelés, nyitómese-szerződés,
  lektori ellenőrzőlista, játékos kérdezési szerződés), új `source/server/studio/lesson-opener-flag.ts`
  (`STUDIO_LESSON_OPENER=on`), bekötés: szerző, lektor, bank statikus előtag, HTML-spec, webes HTML-szerző. Tesztek.
- **S2b — Mérés (fizetős, tulajdonosi jóváhagyással).** Három térkép (1–4., 5–8., 9–12. évfolyamból egy-egy) két futással:
  `STUDIO_LESSON_OPENER` nélkül és `on` értékkel, `single-run-measure.mts`-sel. Eredmény: `docs/measurements/2026-11-xx-nyitomese-ab.json`
  + kézi értékelés a 6. fejezet rubrikája szerint.
- **S3 (külön spec, a mérés után)** — `story` blokktípus: séma, renderer, kártyaleírás-kizárás, saját szókeret, ív- és
  lefedettségi szabály, blokkoló biztonsági ellenőrzés. **Élesben a kapcsoló csak S3 után kapcsolható be**, mert addig a mese
  az első `explain` blokk, és bekerülne a főoldali kártya leírásába (`lesson-teaser.ts`).
- **S4 (külön spec)** — kvíz/módszer `hint` mező és lépcsős segítség a felületen.

## 6. Edge case-ek

- `classroom = 0` (programozás) → L4 (a `learningAgeGroup` 0 → 7-8 szabályával egyezően).
- Ismeretlen vagy tartományon kívüli évfolyam (negatív, 12 felett): a legközelebbi lépcső (≤0 → L4 a 0-s szabály szerint;
  >12 → L6).
- Célzott javítás (`repair.targetSections`), ha a 0. fejezet nincs a célok között: a nyitómese-szabály nem írhat elő változást
  más fejezetben; a szerződés kimondja, hogy csak akkor kell nyitómese, ha a 0. fejezet része a kimenetnek.
- Nyelvi lecke (idegen nyelv): a mese magyarul szól, az idegen szó a térkép szerinti alakban szerepelhet.
- Rövid forrás, kevés fogalom: a mese ilyenkor is a lépcső alsó hosszhatárán marad; ha a szókeret ezt sem engedi, a mese a
  bevezető mondatok helyére lép, nem adódik hozzájuk.
- A kapcsoló futás közben változik: a prompt az épp épülő lépésnél olvassa; vegyes futás lehetséges, ezért a mérés friss
  futásokkal történik (a promptazonosító konstans, `engine.ts:503`, a folytatást nem akadályozza).
- A befagyasztott runtime-2 pillanatképpel folytatott futás: a kapcsoló nem módosíthatja a runtime-2 szövegeket (a bekötés csak
  az élő promptépítőkbe kerül).
- Lektor: a mese kitalált kerete nem `not_in_map`; csak a mesében kimondott **tantárgyi** állítás mérendő a térképhez.

## 7. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [ ] A1: WHEN `docs/modszertan-nyitomese-jatekos-kerdezes.md` elkészül THEN SHALL tartalmazni a 4.1–4.6 pontok mindegyikét, a
  hat lépcső mindegyikéhez egy saját, a két könyvtől független mintamesét, és a `docs/lesson-improvement.md` hivatkozzon rá.
  Mérés: `rg -c "^### L[1-6]" docs/modszertan-nyitomese-jatekos-kerdezes.md` → 6; `rg "modszertan-nyitomese" docs/lesson-improvement.md` → találat.
- [ ] A2: WHEN `openerStageForClassroom(c)` hívódik c ∈ {0,1,…,12, −1, 13} értékekre THEN SHALL a 4.2 táblázat és a 6. fejezet
  szerinti lépcsőt adja. Mérés: `tests/lesson-opener.test.ts`.
- [ ] A3: WHEN `STUDIO_LESSON_OPENER` nincs beállítva (vagy nem `on`) THEN a `buildAuthorPrompt`, `buildLektorPrompt`,
  `bankStaticPrefix`, `lessonHtmlSpecParts`, `webLessonAuthorPrompt` kimenete SHALL bájtra megegyezni a változás előttivel.
  Mérés: `tests/lesson-opener.test.ts` — a bekapcsolt kimenetből a beszúrt blokk(ok)at pontosan eltávolítva a kikapcsolt
  kimenetet kapjuk (`on.replace(beszúrás, "") === off`), és a meglévő prompttesztek (8. fejezet) változatlanul zöldek.
  (Rögzített hash-t szándékosan nem használunk: a runtime-3 élő szövegének későbbi, jogos változása eltörné.)
- [ ] A3b: WHEN a kapcsoló `on` THEN `lessonHtmlSpecParts(a).spec === lessonHtmlSpecParts(b).spec` SHALL igaz maradni két
  különböző évfolyamra (a HTML-spec gyorsítótárazható, statikus része évfolyamfüggetlen; a lépcső a téma-részbe kerül,
  `tests/prompt-cache.test.ts:39-44` mintájára). Mérés: `tests/lesson-opener.test.ts`.
- [ ] A4: WHEN `STUDIO_LESSON_OPENER=on` THEN a szerzői prompt SHALL tartalmazni a nyitómese-szerződést a tanuló lépcsőjével
  (szóhatár, forma, tanulság-szabály), a biztonsági korlátokat, az „új tény nem” és a `term`-szabályt, a recap-visszatérést, valamint
  a Tananyag lap `check` blokkjaira vonatkozó játékos szabályt (a `hint` irányt mutat, nem árulja el a választ; könnyű kérdés elöl);
  a lektor prompt a lektori ellenőrzőlistát; a bank előtag és a két HTML-prompt a játékos kérdezési szerződést (a HTML-promptok a
  nyitómese-szerződést is). Mérés: `tests/lesson-opener.test.ts`.
- [ ] A5: WHEN a kapcsoló `on` és a hívás célzott javítás a 0. fejezet nélkül THEN a szerzői prompt SHALL kimondani, hogy most
  nem kell nyitómese. Mérés: `tests/lesson-opener.test.ts`.
- [ ] A6: WHEN a teljes ellenőrzés fut THEN `npm run check`, `npm run lint`, `npm run check:test`, `npm test` SHALL hibátlan legyen
  (a meglévő tesztek változatlanul). Mérés: parancskimenet.
- [ ] A7 (S2b, tulajdonosi jóváhagyás után): WHEN a három térkép mindkét ágon lefut THEN a mérési fájl SHALL rögzíteni ágonként a
  látható szót, a kapu- és ív-eredményt, a nyitómese szószámát és a rubrikát (lépcsőhöz illő forma; van-e tantárgyi probléma,
  stratégia, nyitott kérdés, recap-visszatérés; biztonsági sértés; új tény) — és a kapcsolós ág kapu/ív eredménye SHALL nem rosszabb.

## 8. Tesztterv

- Új: `source/tests/lesson-opener.test.ts` — A2–A5.
- Változatlanul zöld: `tests/u4-author-pedagogue.test.ts`, `tests/u5-lektor-verifiers.test.ts`, `tests/lesson-html-spec.test.ts`,
  `tests/lesson-experience.test.ts`, `tests/instruction-bundles.test.ts`, `tests/runtime-knowledge.test.ts`, `tests/lesson-arc.test.ts`.
- Teljes kör: `npm run check`, `npm run lint`, `npm run check:test`, `npm test` (a `source/` mappából).

## 9. Kockázatok / visszavonás

- **Hossz-regresszió** (szülői panasz): a mese a szókereten belül marad (4.2), mérés S2b-ben; túllépésnél a lépcsőhatár szűkül.
- **Kapubukás** (megalapozás, ív): a mese `explain` blokk, tartalmazza a `term`-et → a meglévő kapuk teljesíthetők; S2b méri.
- **Kártyaleírás-szivárgás**: csak bekapcsolt kapcsolónál; élesben S3 előtt nem kapcsoljuk be.
- **Biztonság**: a lektor `age` jegyzete nem blokkoló — ezért S3-ig nincs éles bekapcsolás; S2b kézi rubrikával ellenőriz.
- **Promptköltség**: a bank statikus előtagja hosszabb lesz (gyorsítótárazott); mérés S2b-ben.
- **Visszavonás**: a kapcsoló kikapcsolása (alapállapot) azonnal visszaállítja a bájtra azonos promptokat; kódszinten egy revert.

## 10. Nyitott kérdések a tulajdonosnak

1. A 4.2 hosszhatárok és formák megfelelnek-e (különösen L1 50–90 szó és L6 „mesélő hang nélkül”)?
2. A 4.3 lelki témalista bővítendő vagy szűkítendő?
3. S2b mérés: jóváhagyod-e a költséget (egy teljes gyártás 3,5–4,9 M bemeneti token, 25–27 perc; 6 futás), és melyik három térképen?
4. S3 és S4 a mérés után külön specben — egyetértesz-e ezzel a sorrenddel?

## 11. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes-vegrehajtas.md`
