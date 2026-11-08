# Spec: Célkártya, nyitómese és játékos (IQ-) kérdezés a tananyaggyártásban

> Dátum: 2026-11-08 · Szerző: Claude (Opus 5.5) · Állapot: **JÓVÁHAGYVA (tulajdonos, 2026-11-08)** — S1 és S2 KÉSZ (A1–A6, mérve 2026-11-08: célzott 144/144, teljes `npm test` 2599/2599, check/lint/check:test 0 hiba); S2b KÉSZ (`docs/measurements/2026-11-08-nyitomese-ab.json`): Opus 5.5-ön, 0 tartalékváltással, 3 évfolyam × KI/BE — Célkártya 4/4 és 5 mondatos mese minden kapcsolós futásban, IQ-kvíz 0–2 → 24–31 / 98, hossz +9% / +4% / −2%, ív rendben (A7 teljesül); a tartalék modelles előmérés két hibát hozott, mindkettő javítva
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes-vegrehajtas.md`.
> Kanban: #6.

## 0. Kérés és tulajdonosi döntések

Tulajdonosi kérés (2026-11-08): a két feltöltött könyv (Oțoiu: *Terápiás mesék gyermekeknek*; Coatu: *600 IQ-fejlesztő játék,
fejtörő és találós kérdés gyerekeknek*) **módszertanát** — nem a szövegét — építsük be a tananyaggyártásba tudásként; minden
korosztálynak a maga szellemi és lelki szintjén, magasabb évfolyamon komolyabb, de figyelemfelkeltő formában. Mindkét könyvhöz
nyílt licencű forrásokat keressünk, és azok tudását is építsük be.

Döntések, első kör (2026-11-08): **A)** két rétegű nyitás: a lecke tantárgyi problémája + tanulási-lelki nehézség; **B)** először
promptbővítés kapcsolóval, saját blokktípus csak mérés után; **C)** csak az új és a javított leckék.

Döntések, második kör (2026-11-08, a 10. pont kérdéseire):
1. A lépcsők formái elfogadva.
2. A lelki témalista **bővül** (4.3).
3. Az S2b mérés költsége **jóváhagyva**; a három térképet a végrehajtó választja (1–4., 5–8., 9–12. évfolyamból egyet-egyet).
4. S3 és S4 a mérés után, külön specben.

Kiegészítő tulajdonosi kérés (2026-11-08, szó szerint összefoglalva):
- **D) Célkártya** — a tananyag elején, a könyvek mintájára, legyenek meghatározva a célok: mit akarunk elérni; mi az, ami miatt
  esetleg nem sikerül; ennek az oka; és hogyan küzdje le a tanuló.
- **E) Mini mese** — utána jön a tananyag, és minden tananyagban legyen egy **pici, 5 mondatos** minta mese.
- **F) IQ-kérdések a számonkérésben** — a fejtörő-módszertan kérdései **a kvízekben, a kontrollkérdésekben és a szöveges
  feladatokban** jelenjenek meg (nem csak a Módszerek lapon).
  „Kontrollkérdés” = a Tananyag lap `check` blokkjai és a Módszerek lap kapukérdései (`gate`) — a tulajdonos 2026-11-08-án
  megerősítette.

## 1. Cél

1. A két könyv és a nyílt források módszertana egy helyen, saját megfogalmazásban, forrásjegyzékkel legyen a repóban.
2. Minden új lecke 1. fejezete így kezdődjön: **Célkártya** (cél, buktató, oka, leküzdés) → **5 mondatos mini mese** → tanítás; a
   lecke záró összefoglalója visszatér a meséhez és a célhoz. Mindez évfolyamlépcsőhöz hangolva.
3. IQ-típusú kérdésformák (kakukktojás, sorminta, analógia, hamis állítás keresése, találós kérdés, következtetés, „magyarázd el,
   miért”, „mi lenne, ha”) jelenjenek meg a kvízben, a `check` és `gate` kérdésekben és a szöveges feladatokban, mindig a tanított
   tartalomhoz kötve.
4. Mindez kapcsolóval (alapból KI) mérhető legyen az éles működés megváltoztatása nélkül.

## 2. NEM cél

- A két könyv szövegének, szereplőinek, feladatainak, cselekményének átvétele vagy átírása (szerzői jog, „Tilos a terjesztés”).
- Terápiás ígéret, diagnózis, szakember helyettesítése.
- Új blokktípus, séma-, renderer-, szókeret- vagy kapumódosítás (S3, külön spec); új bankmező, pl. kvíz `hint` (S4, külön spec).
- Meglévő leckék tömeges újragyártása.
- A befagyasztott `websuli-runtime-2` csomag módosítása (`shared/instruction-bundles/roles.ts:50`).
- A Tananyag Készítő skill átírása.
- A kapcsoló élesben való bekapcsolása (az S2b mérés és tulajdonosi döntés után, külön lépés).

## 3. Mért tények (kódból ellenőrizve, 2026-11-08)

| Tény | Hely |
|---|---|
| Nincs nyitó/cél/mese blokk; minden szakasz `explain` blokkal kezdődik, kérdéssel nyitni tilos | `source/shared/lesson-arc.ts:221-232` |
| A hat blokkfajta és mezőik a szerzői promptban | `source/server/studio/step-io.ts:390-406` (`AUTHOR_BLOCK_CATALOG`) |
| Címke = állítás (a fogalom `term`-je a blokk szövegében); csak a térkép fogalmai; a megalapozás fejezetenként mér | `step-io.ts:441-449` (`TEACHING_CONTRACT`) |
| `explain.text` ≤ 4000 karakter, `recap` pont ≤ 500; a recap 2–3 pont | `source/shared/lesson-schema.ts` (`LESSON_TEXT_LIMITS`); `step-io.ts:498` |
| Szerzői prompt: korsáv + regiszter, majd szerződések | `step-io.ts:463-508` |
| Korsáv három fokozatban; finomabb öt csoport (0 → 7-8) | `lesson-schema.ts:90-94`; `source/shared/lesson-band.ts:27-34`, `:59-68` |
| Lektor; jegyzetfajták source_conflict / coverage_gap / language / age, az `age` nem blokkoló | `step-io.ts:592-652` |
| Bank közös szerződése; tíz módszertípus; kvíz 3–4 opció, egy helyes; nyílt feladat `required` rubrikával | `source/shared/lesson-experience.ts:325-336`, `:21`, `:41-98` |
| A bank statikus (gyorsítótárazott) előtagja, amelyet a kérésblokk-építő is összevet | `source/server/studio/experience-builder.ts:34-35`; `single-run/engine.ts:180-188` |
| HTML-út: a spec-rész statikus (évfolyamfüggetlen), a téma-rész változó | `source/server/ai/lesson-html-spec.ts:545-548`; `tests/prompt-cache.test.ts:39-44` |
| Webkutatásos HTML-szerző prompt | `source/server/studio/web-research-agent.ts:176-199` |
| A főoldali kártya leírása az első fejezet első `explain` blokkjának első bekezdéséből készül | `source/shared/lesson-teaser.ts` |
| Szülői panasz: túl hosszú leckék; szókeret évfolyamonként | `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md`; `source/shared/lesson-length.ts` |
| Teljes gyártás mérése, környezeti változós A/B mintával | `source/scripts/measure/single-run-measure.mts:1-20` |
| A futás promptazonosítója konstans | `source/server/studio/single-run/engine.ts:503` |

## 4. Módszertani tartalom (rögzített)

### 4.1 A lecke nyitánya: Célkártya → mini mese → tanítás

**Célkártya** (az 1. fejezet ELSŐ blokkja, `explain`, depth "core"). A könyvek mesefejlécének (állapot – cél – tanulság) tanulói
változata, négy rövid bekezdésben, a lépcső saját címkéivel (4.2):
1. **Cél** — mit akarunk elérni a lecke végére; megnevezi az 1. fejezet első fogalmát természetes mondatba illesztve (ragozva,
   kisbetűvel is — címszerű alakot nem másol be; S2b mérés, 2026-11-08) és a lecke fő képességét.
   Ez az első bekezdés, ezért a főoldali kártya leírása is ez lesz (`lesson-teaser.ts`) — egész mondat, címke nélkül is érthető.
2. **Buktató** — mi az, ami miatt a cél esetleg nem sikerül: a térkép tévhitei közül vagy a téma tipikus nehézségéből (tantárgyi)
   és/vagy a választott tanulási nehézségből (lelki réteg, 4.3).
3. **Oka** — miért történik ez (egy-két mondat, megszégyenítés nélkül).
4. **Leküzdés** — hogyan győzi le: egy konkrét, megismételhető stratégia, amelyet a mini mese meg is mutat.

**Mini mese** (az 1. fejezet MÁSODIK blokkja, `explain`, depth "core") — **pontosan 5 mondat**, a könyvek dramaturgiájának tömörítése:
1. hős és helyzet; 2. a lecke tantárgyi problémája és az elakadás, az érzés megnevezésével; 3. segítő vagy felismerés, amely
normalizál; 4. a Célkártya stratégiája működés közben; 5. **nyitott kérdés**, amelyre a lecke adja meg a választ.
A mese a fogalmat természetes szavakkal idézi fel és jelöli; a pontos nevét (`term`) a fejezet tanító blokkja mondja ki szó
szerint, és az alapozza meg a címkét (`grounding.ts:330-361`, fejezeten belüli szabály). Módosítás az S2b mérés alapján
(2026-11-08): a szó szerinti beillesztés mindhárom kapcsolós futásban darabos, idézőjeles címalakot adott.

**Tanítás** — a harmadik blokktól a meglévő ív szerint (`LESSON_ARC_CONTRACT`).

**Visszatérés** — a lecke utolsó `recap` blokkjának ELSŐ pontja visszatér a mese hőséhez és a Célkártya céljához: mit tanult meg,
hogyan segített a stratégia (a recap továbbra is 2–3 pont).

### 4.2 Évfolyamlépcső (rögzített)

| Lépcső | Évfolyam | Mese formája | Mondathossz (szó, legfeljebb) | Célkártya címkéi | Tanulság |
|---|---|---|---|---|---|
| L1 | 1–2. | állat- vagy fantáziamese, bölcs segítő; a stratégia „varázstárgy”, de kimondva, hogy valódi módszer | 10 | Mit tanulunk ma? / Mi lehet nehéz? / Miért? / Így sikerül! | a recapben egyszerű mondattal kimondva |
| L2 | 3–4. | kaland gyerek- vagy fantáziahőssel; az 5. mondat „Te mit tennél?” típusú | 12 | Mit tanulunk ma? / Mi lehet nehéz? / Miért? / Így sikerül! | a recapben kimondva |
| L3 | 5–6. | életszerű kortárs helyzet vagy kis rejtély; a hős hibázik | 15 | Célunk / Ami nehezítheti / Miért? / Hogyan győzd le? | a recapben, a tanuló szemszögéből |
| L4 | 7–8. és 0. (programozás) | dilemma, csoporthelyzet, döntés; vagy a térképben szereplő esemény jelenetként | 18 | Célunk / Ami nehezítheti / Miért? / Hogyan győzd le? | a tanuló vonja le; a recap kérdésként zárja |
| L5 | 9–10. | esetleírás valósághű helyzetben, ütköző nézőpontokkal, vagy gondolatkísérlet | 22 | Cél / Tipikus buktató / Oka / Leküzdés | nyitott; a recap az elemzés eredményét mondja ki |
| L6 | 11–12. | érett eset vagy szakmai / erkölcsi dilemma, érettségi- és életpálya-vonatkozással; mesélő hang nélkül | 22 | Cél / Tipikus buktató / Oka / Leküzdés | nyitott; a recap szintézisként zárja |

A Célkártya és a mini mese együtt a szókereten **belül** van (`lesson-length.ts`): a fejezet bevezető mondatait váltják ki. A
Célkártya bekezdései 1–2 mondatosak.

### 4.3 A lelki réteg — bővített témalista (2. döntés)

Egy, a tantárgyhoz és az évfolyamhoz illő **tanulási** nehézség, konkrét, otthon is megismételhető stratégiával:

| Téma | Évfolyam | Példastratégia |
|---|---|---|
| halogatás és szervezés | mind | teendőlista fontossági sorrendben, egyszerre egy tétel |
| figyelem | mind | „csak én és a feladat” belső mondat, zavaró tárgyak elrakása |
| türelem és önuralom | mind | megállás, három lassú levegő, újrakezdés |
| hibától vagy kudarctól való félelem | mind | a hiba mint nyom: mit mutat meg? |
| kitartás | mind | kis lépésekre bontás, minden lépés kipipálása |
| segítségkérés | mind | pontos kérdés megfogalmazása: hol akadtam el? |
| együttműködés | mind | szerepek kiosztása, a másik ötletének meghallgatása |
| tökéletességre törekvés | 3.– | „elég jó” határ kijelölése, ellenőrzés egyszer |
| megszólalás mások előtt | 3.– | rövid gyakorlás hangosan, egy kezdőmondat előre |
| önbizalom, „nem vagyok elég jó” érzés | 3.– | amit már tudok: három dolog felsorolása |
| izgulás dolgozat vagy felelés előtt | 3.– | felkészülési terv, légzés, a könnyű feladattal kezdés |
| unalom, motiváció hiánya | 3.– | „mire jó ez nekem?” kérdés, kis cél és jutalom |
| összehasonlítás és irigység | 3.– | a saját tegnapi eredmény a mérce |
| változáshoz alkalmazkodás (új téma, új közeg) | mind | ami ismerős benne: kapcsolás a már tudotthoz |
| csalódás és kudarc feldolgozása | 3.– | mi sikerült mégis? mit csinálok másképp? |
| időbeosztás | 5.– | időbecslés, majd összevetés a valós idővel |
| képernyő és figyelemelterelés | 5.– | értesítések némítása tanulás közben, időkeret |
| vita és nézeteltérés kezelése | 5.– | előbb meghallgatom, aztán elmondom, mit gondolok és miért |
| szükségletek kifejezése | mind | „Szükségem van…, mert…” mondat |
| másság és sokszínűség elfogadása | mind | kérdezek, mielőtt ítélek |
| felelősségvállalás | 5.– | „ezt én vállalom” — és a határidő kimondása |
| kíváncsiság, a kérdezés bátorsága | mind | minden új témánál egy saját kérdés felírása |
| döntés bizonytalanságban | 9.– | érvek és ellenérvek táblázata, majd döntés |
| forráskritika, álhírek | 7.– | ki mondja, honnan tudja, mi a bizonyíték? |

### 4.4 Biztonsági és tartalmi korlátok (rögzített, minden lépcsőn)

- Nincs diagnózis- vagy betegségcímke (pl. ADHD, szorongásos zavar), terápiás ígéret, megszégyenítés, testi jellemzők kritikája; a
  nehézséget viselkedésként írjuk le, a hőst nem címkézzük.
- 1–6. évfolyamon tilos: halál, bántalmazás, válás, betegség, erőszak, félelemkeltő jelenet. 7–12. évfolyamon társas nehézség
  (kirekesztés, csoportnyomás) visszafogottan megengedett, naturalisztikus részlet nélkül.
- **Új tény nem kerülhet be**: a kitalált keret nem tény; minden tantárgyi állítás a térképből jön. Valós személy vagy esemény
  csak akkor szerepelhet, ha a térképben van.
- A két licencelt könyvből szöveg, szereplő, tárgy, feladat nem vehető át.

### 4.5 Játékos (IQ-) kérdezés (F döntés)

**IQ-formák** (a fejtörőkönyv taxonómiájából, saját szavakkal), mindegyik a tanított tartalomra:

| Forma | Hol | Megkötés |
|---|---|---|
| kakukktojás („Melyik nem illik közé, és miért?”) | kvíz, `check`, szöveges feladat | kvízben/`check`-ben pontosan egy védhető helyes válasz; a visszajelzés megnevezi a szempontot |
| sorminta / következő elem | kvíz, `check` | a szabály a tanított tartalomból következik |
| analógia („A úgy aránylik B-hez, mint C …-hoz”) | kvíz, `check`, `analogy` módszer | |
| hamis állítás keresése („Melyik állítás hamis?”) / igaz-hamis csapda | kvíz, `check`, `myth` módszer | hihető, de hamis; a magyarázat megmondja, mi tévesztett meg |
| találós kérdés (tulajdonságleírásból a fogalom) | kvíz, `popup` módszer | pontozott szöveges feladatként nem (nincs egyértelmű kulcs — S2b mérés, 2026-11-08) |
| következtetés („Ha …, akkor mi igaz?”), nyomozós kizárás | kvíz, `check`, `gate` | egyértelmű, ellenőrzött megoldás |
| előkérdés / becslés | `prediction` módszer, szöveges feladat (indoklással) | hibázni szabad |
| „Magyarázd el, miért” / ellenpélda | szöveges feladat, `selfCheck` | a `required` a tanított fogalmat méri |
| „Mi következik, ha …?” | szöveges feladat (szóbeli is) | csak egyértelmű, a tanított tartalomból következő kulccsal; a `required` soha nem üres, megkülönbözteti a helyes választ a tipikus hibástól (S2b mérés, 2026-11-08: a kulcs nélküli „mi lenne, ha” és „írj találós kérdést” feladatok üres `required`-del buktatták a bankkaput) |
| feltevés–tény ütköztetés / dilemma | `conflict` módszer, szöveges feladat | a `conflict` minden évfolyamon kötelező (bankterv): tantárgyi feltevés és tény ütköztetése mindenkor, társas / erkölcsi dilemma csak 7. évfolyamtól (review #403) |

**Mennyiség** (minimum, a meglévő darabszámokon belül, nem azokon felül): banki csomagonként legalább **egy** IQ-formájú kvízkérdés
és legalább **egy** IQ-formájú szöveges feladat; a Tananyag lapon leckénként legalább **egy** IQ-formájú `check` kérdés (ha a
leckében van `check`). A Módszerek lap leképezése: `prediction` = előkérdés/becslés, `myth` = igaz-hamis csapda, `popup` = találós
kérdés, `gate` = kapurejtvény, `analogy` = analógia, `conflict` = feltevés–tény ütköztetés (minden évfolyamon; dilemma 7.-től), `selfCheck` = „magyarázd el, miért”.

**Nehézségi ív**: minden csomagban és fejezetben könnyű, sikerélményt adó tétel az első, utána közepes, végül kihívás.

**Évfolyam szerinti forma**: 1–2. konkrét, egylépéses, csapda nélkül (kakukktojás képszerű szavakkal, egyszerű sorminta);
3–4. találós kérdés, kakukktojás, egyszerű analógia; 5–6. hamis állítás keresése indoklással, kétlépéses következtetés;
7–8. többlépéses és laterális kérdés, nyomozós kizárás; 9–12. dilemma, becslés, ellenpélda, „magyarázd el, miért”.

**Visszajelzés** (`feedbackPerOption`, módszer `answer`): helyes válasznál röviden, miért jó; rossz válasznál az első mondat
bátorító, utána mi tévesztett meg, mit kérdezett valójában a feladat, és a helyes gondolatmenet egy mondatban. A `check.hint` irányt
mutat, nem árulja el a választ. Erőfeszítést dicsér, nem minősít.

A játékos keret **nem enged** új tényt: a „KIZÁRÓLAG a Tananyag lapon ténylegesen megtanított állítások kérdezhetők” szabály
(`lesson-experience.ts:334`) változatlan.

### 4.6 Forrásjegyzék — licencellenőrzés állapota

Ötlet és módszer szerzői jogilag nem védett; szöveget csak közkincsből vagy CC BY / CC BY-SA forrásból veszünk át, forrásmegjelöléssel.

| Forrás | Licenc | Ellenőrzés | Mit használunk |
|---|---|---|---|
| Linnavalli és mtsai (2024): SAGA második vizsgálat, *Frontiers in Education*, doi:10.3389/feduc.2024.1284474 | CC BY | **oldalon ellenőrizve** 2026-11-08 | mese utáni „mit érezhetett / gondolhatott?” kérdés hatása |
| Redman és mtsai (2024): iskolai kreatív biblioterápia protokoll, PMC10936023 | CC BY (AAM) | **oldalon ellenőrizve** 2026-11-08 | iskolai, nem klinikus által vezetett történetalapú keret (protokoll, eredmény nélkül) |
| Dudeney: *Amusements in Mathematics*, Project Gutenberg #16713 | „Public domain in the USA” | **oldalon ellenőrizve** 2026-11-08 | feladat → tipp → megoldás minta, történetbe ágyazott fejtörő |
| Aiszóposz-mesék, Project Gutenberg #11339 | közkincs (USA) | keresési találat | rövid mese, kimondott tanulság |
| Wikipedia: Zone of proximal development | CC BY-SA 4.0 | kutatóügynök látta | fokozatosan elhagyható segítség |
| IES/WWC Practice Guide (Pashler és mtsai 2007) | valószínűleg közkincs (USA szövetségi) | UNVERIFIED | ismétlő kvíz (erős), mély „miért” kérdés (erős), előkérdés (gyenge) |
| OpenStax *Psychology 2e*, *Lifespan Development* | **CC BY-NC-SA 4.0** | **oldalon ellenőrizve** | csak módszertani tájékozódás, szöveg nem |
| Benedek Elek, Arany László népmesék (MEK) | UNVERIFIED (a MEK nem töltött be) | — | csak ellenőrzés után |
| Kizárva: NRICH, Open Middle, Deans for Impact (minden jog fenntartva); Susan Perrow könyvei (kereskedelmi) | — | — | — |

## 5. Szeletek

- **S1 — Tudásbázis.** `docs/modszertan-nyitomese-jatekos-kerdezes.md` a 4. fejezet teljes tartalmával, lépcsőnként saját
  mintával (Célkártya + 5 mondatos mini mese + egy IQ-kérdés); hivatkozás a `docs/lesson-improvement.md`-ből.
- **S2 — Szerződések kapcsolóval (alapból KI).** `source/shared/lesson-opener.ts`, `source/server/studio/lesson-opener-flag.ts`
  (`STUDIO_LESSON_OPENER=on`), bekötés: szerző, lektor, bank statikus előtag, HTML-spec, webes HTML-szerző. Tesztek.
- **S2b — Mérés (jóváhagyva).** Három térkép (1–4., 5–8., 9–12. évfolyamból egy-egy) két ágon (`STUDIO_LESSON_OPENER` nélkül és
  `on`), `single-run-measure.mts`. Eredmény: `docs/measurements/2026-11-08-nyitomese-ab.json` (a futás tényleges dátumával) + rubrika.
- **S3 (külön spec, a mérés után)** — saját blokktípus(ok) (`goal`, `story`), blokkoló biztonsági ellenőrzés, saját szókeret,
  ha a mérés indokolja.
- **S4 (külön spec)** — kvíz/módszer `hint` mező, lépcsős segítség a felületen, IQ-forma jelölése a bankban (mérhetőség).

## 6. Edge case-ek

- `classroom = 0` (programozás) és nem pozitív / nem véges érték → L4; 12 felett → L6.
- Célzott javítás, ha a 0. fejezet nincs a célok között: a szerződés kimondja, hogy most nincs Célkártya / mini mese, a meglévőt
  nem érinti.
- Nyelvi lecke: a Célkártya és a mese magyarul; az idegen szó a térkép szerinti alakban szerepelhet.
- Rövid forrás, kevés fogalom: a Célkártya 4 × 1 mondat, a mese 5 rövid mondat; ha a szókeret ezt sem engedi, a bevezető mondatok
  helyére lépnek, nem adódnak hozzájuk.
- Ha a térképben nincs tévhit és a téma nem ad tipikus nehézséget: a Buktató a lelki rétegből jön.
- Az 1. fejezetben csak egy fogalom van: a Célkártya és a mese is ezt jelöli; a tanítás a harmadik blokkban.
- Kvíz és `check` egy helyes válasz: a kakukktojás és a következtetés csak egyértelmű megoldással; ha nincs ilyen, másik IQ-forma.
- A kapcsoló futás közben változik: a prompt az épp épülő lépésnél olvassa; a mérés friss futásokkal történik.
- Runtime-2 pillanatképpel folytatott futás: a bekötés csak az élő promptépítőkbe kerül, a runtime-2 szövegek érintetlenek.
- Lektor: a mese kitalált kerete nem `not_in_map`; csak a kimondott tantárgyi állítás mérendő.

## 7. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [x] A1: WHEN a tudásbázis elkészül THEN SHALL tartalmazni a 4.1–4.6 pontokat, a hat lépcső mindegyikéhez egy saját mintát
  (Célkártya + pontosan 5 mondatos mini mese + egy IQ-kérdés), és a `docs/lesson-improvement.md` hivatkozzon rá.
  Mérés: `rg -c "^### L[1-6]" docs/modszertan-nyitomese-jatekos-kerdezes.md` → 6; `rg "modszertan-nyitomese" docs/lesson-improvement.md` → találat.
- [x] A2: WHEN `openerStageForClassroom(c)` hívódik c ∈ {0,1,…,12, −1, 13, NaN} értékekre THEN SHALL a 4.2 táblázat és a 6.
  fejezet szerinti lépcsőt adja. Mérés: `tests/lesson-opener.test.ts`.
- [x] A3: WHEN `STUDIO_LESSON_OPENER` nincs beállítva (vagy nem `on`) THEN a `buildAuthorPrompt`, `buildLektorPrompt`,
  `bankStaticPrefix`, `lessonHtmlSpecParts`, `webLessonAuthorPrompt` kimenete SHALL bájtra megegyezni a változás előttivel.
  Mérés: a bekapcsolt kimenetből a beszúrt blokk(ok)at pontosan eltávolítva a kikapcsolt kimenetet kapjuk, és a meglévő prompttesztek
  (8. fejezet) változatlanul zöldek. (Rögzített hash szándékosan nincs: a runtime-3 élő szövegének jogos változása eltörné.)
- [x] A3b: WHEN a kapcsoló `on` THEN `lessonHtmlSpecParts(a).spec === lessonHtmlSpecParts(b).spec` SHALL igaz maradni két
  különböző évfolyamra; a lépcső a téma-részbe kerül. Mérés: `tests/lesson-opener.test.ts`.
- [x] A4: WHEN `STUDIO_LESSON_OPENER=on` THEN a szerzői prompt SHALL tartalmazni a Célkártya négy elemét a lépcső címkéivel, az
  5 mondatos mini mese szabályát a lépcső formájával és mondathosszával, a `term`-szabályt, az „új tény nem” szabályt, a biztonsági
  korlátokat, a recap-visszatérést és a `check` blokkokra vonatkozó IQ- és visszajelzési szabályt; a lektor prompt a lektori
  ellenőrzőlistát; a bank előtag és a két HTML-prompt a játékos (IQ-) kérdezési szerződést a csomagonkénti minimummal (a HTML-promptok
  a Célkártya és mini mese szerződést is). Mérés: `tests/lesson-opener.test.ts`.
- [x] A5: WHEN a kapcsoló `on` és a hívás célzott javítás a 0. fejezet nélkül THEN a szerzői prompt SHALL kimondani, hogy most
  nincs Célkártya és mini mese. Mérés: `tests/lesson-opener.test.ts`.
- [x] A6: WHEN a teljes ellenőrzés fut THEN `npm run check`, `npm run lint`, `npm run check:test`, `npm test` SHALL hibátlan legyen.
- [x] A7 (S2b) — TELJESÜL, 2026-11-08 (Opus 5.5): hossz +9% / +4% / −2%, ív és job rendben mind a 6 futásban; a teljes kézi rubrika
  (évfolyamhoz illő forma, 4 elem, 5 mondat, nyitott kérdés, visszatérés, biztonsági sértés, új tantárgyi tény) mindhárom kapcsolós
  leckén rendben — `opus.rubrika` a mérési fájlban (review #403 után pótolva). (Tartalék modelles előmérés: a 6.-on
  (+52%) a kinyerés eltérése (7 → 11 fogalom; fogalmanként 93 → 90 szó) miatt nem összevethető volt.) WHEN a három térkép mindkét ágon lefut THEN a mérési fájl SHALL rögzíteni ágonként a látható szót, a kapu- és
  ív-eredményt, a Célkártya és a mese szó- és mondatszámát, az IQ-formájú kvíz/feladat/`check` darabszámát (kézi számolás), és a
  rubrikát (lépcsőhöz illő forma; négy Célkártya-elem; 5 mondat; nyitott kérdés; recap-visszatérés; biztonsági sértés; új tény) — és
  a kapcsolós ág kapu/ív eredménye SHALL nem rosszabb, a látható szó SHALL legfeljebb 10%-kal nagyobb.

## 8. Tesztterv

- Új: `source/tests/lesson-opener.test.ts` — A2–A5.
- Változatlanul zöld: `tests/u4-author-pedagogue.test.ts`, `tests/u5-lektor-verifiers.test.ts`, `tests/lesson-html-spec.test.ts`,
  `tests/prompt-cache.test.ts`, `tests/web-research-agent.test.ts`, `tests/web-research-completion.test.ts`,
  `tests/lesson-experience.test.ts`, `tests/instruction-bundles.test.ts`, `tests/runtime-knowledge.test.ts`, `tests/lesson-arc.test.ts`.
- Teljes kör: `npm run check`, `npm run lint`, `npm run check:test`, `npm test` (a `source/` mappából).

## 9. Kockázatok / visszavonás

- **Hossz-regresszió** (szülői panasz): a Célkártya és a mese a szókereten belül; A7 legfeljebb +10%.
- **Kapubukás** (megalapozás, ív): mindkét nyitóblokk `explain`, tartalmazza a `term`-et; A7 méri.
- **Kártyaleírás**: a Célkártya első bekezdése (cél) lesz a leírás — szándékos, értelmes szöveg; a mese nem kerül oda.
- **Biztonság**: a lektor `age` jegyzete nem blokkoló — élesítés csak a mérés és tulajdonosi döntés után; blokkoló kapu S3.
- **IQ-minimum nem mérhető gépileg** (nincs formajelölés a sémában) — S2b kézi számolás; gépi jelölés S4.
- **Promptköltség**: a bank statikus előtagja hosszabb (gyorsítótárazott); S2b méri.
- **Visszavonás**: a kapcsoló kikapcsolása (alapállapot) azonnal visszaállítja a bájtra azonos promptokat; kódszinten egy revert.

## 10. Nyitott kérdés a tulajdonosnak

Nincs. (A „kontrollkérdés” értelmezését a tulajdonos 2026-11-08-án megerősítette: `check` + `gate`.)

## 11. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes-vegrehajtas.md`
