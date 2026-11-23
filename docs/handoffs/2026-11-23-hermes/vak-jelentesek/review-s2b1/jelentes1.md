# Független review — feat/tgm-s2b1-v2
Fej: 236ca37a88d2d902b7eedb8d335441a6b159d6ad
## Ítélet: NEM

A KI állapotban várt kompatibilitást a futtatott tesztek nem törték meg. A két blokkoló az új ábrák megjelenítésében van: egy szabályos döntési fa fekvő telefonon olvashatatlanná törik, a kártyák egymás SVG-definícióit használhatják, és így hibás képet mutatnak.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — blokkoló — A szabályos, 13 csomópontos fa ágfeliratai kifutnak a keretükből fekvő telefonon.** `source/client/src/lesson-runtime/lesson-design.css:394`. Egy negyedikes 844×390-es telefonon nyit meg egy négyszögeket osztályozó leckét. A normál `/preview/review-tree` útvonalnak szintetikus tárolt leckét adtam az API-határon; a `LessonView` és a futtató változatlan. A böngésző 13 lerajzolt csomópontot mért; az első négy levél doboza egyenként 34 px-re szűkült, bennük a `scrollWidth − clientWidth` rendre 8, 8, 10 és 10 px. A `1-tarolt-fa.jpg` képen az ágcímkék betűnként törnek és túlnyúlnak a levél keretén. Az oldal és a fa külső keretének vízszintes túlcsordulása egyaránt 0 px: az oldalszintű ellenőrzés ezért zöld, miközben a V32 olvasható elrendezése nem teljesül. **Base:** a diff vezeti be a beágyazott sorok feltétel nélküli, egyenlő szélességű flex elosztását; a base-ben nincs ilyen megjelenítő. **Javítás:** a tényleges részfa-szélességtől függjön az elágazás iránya; ahol a feliratok nem férnek el olvasható oszlopokban, váltson behúzott listára. A 13 csomópontos, 4→4 elágazást tartalmazó mintát tegye a V32 böngészős tesztbe.

- **L2 — blokkoló — Az egyik képes kártya átveszi a másik színátmenetét.** `source/client/src/lesson-runtime/blocks/tree-cards.tsx:70`. Ha az egyazon blokkhoz készített „Piros négyzet” és „Kék téglalap” két külön SVG-jében egyaránt `paint0` a színátmenet neve, a 844×390-es Chromiumban mindkét alakzat piros. Mindkét SVG átmegy az éles kliens tisztítóján; a DOM-ban a két `url(#paint0)` megmarad, pedig a két definíció különböző színű. `1-ket-kartya-azonos-id.jpg`: két piros alakzat. Ellenpróbaként csak a második SVG definícióját és hivatkozását neveztem át `paint1`-re: `1-ket-kartya-egyedi-id.jpg`: a téglalap kék lett. Ez nem XSS, hanem hibás tananyag: a kép ellentmond a feliratának. **Base:** több régi inline illusztráció között elvileg korábban is lehetett ID-ütközés; a diff új, egy blokkon belüli utat nyit hozzá, mivel minden kártya külön SVG-t illeszt ugyanabba a dokumentumba, névtér nélkül. **Javítás:** a tisztított SVG-k definíció-azonosítóit és a rájuk mutató belső hivatkozásokat rajzonként együtt névterezze; regressziós próba két különböző, azonos lokális ID-jű színátmenettel.

- **L3 — közepes — A fa vezetékei megszakadnak és gyenge kontrasztúak.** `source/client/src/lesson-runtime/lesson-design.css:391`. A mintalecke Igen/Nem fájánál 844×390-ben és 1280×800-ban a két vízszintes szakasz vége között 14 px-t mértem. A képen a gyökér levezető vonala a résbe ér, a gyermekekhez vezető szakaszok leválnak róla. A böngészőben leolvasott vonal- és panelszínből, az sRGB relatív fénysűrűségével számolva a kontraszt 1,37:1 a világos és 1,41:1 a sötét mintán. A DOM-hierarchia helyes; a vizuális kapcsolat gyenge. **Javítás:** közös, folytonos összekötő vonal a testvérágakhoz, külön, megfelelő kontrasztú sávtoken a vonalnak.

- **L4 — kicsi — A szelet terve olyan alapértelmezett ágfeliratot ígér, amely nincs.** `docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md:28`. Egy címkézetlen kétágú fát átadó szerző a terv alapján Igen/Nem feliratot várhatna; a `lesson-visual-params.ts:158` kötelező `label` mezőt kér, a diff eltávolítja a szótári alapértékeket, a mintában pedig az Igen/Nem közvetlenül az adatban szerepel. A szülő végrehajtási terv (388–389. sor) megengedi a nem használt kulcsok törlését. Nem kell kitalálni ágcímkéket: a szelet tervében rögzítsék, hogy a forrás címkéje kötelező, az alapértékeket szándékosan törölték.

- **L5 — kicsi — A V29 mélységi próba nem a határértéket méri.** `source/tests/lesson-tree-cards.test.ts:32`. Ha egy karbantartó tévedésből 3-ról 4-re emeli a maximumot, az „4 szint” feliratú eset továbbra is zöld: a 31. sor leghosszabb útja `1 → 2 → 3 → 4 → 5`, azaz öt csomópont. Ez statikusan ellenőrzött teszthiány, nem hibás aktuális validáció. **Javítás:** pontosan négyszintes és legfeljebb 13 csomópontos negatív minta, mellé pontosan háromszintes pozitív minta.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba a megjelenítési határon.** A V31 pozitív teszt mindkét forrástételt `shown`-nak méri, a `pictureCard` → `pictureCards` megfeleltetés és a `branches[].node` alak egyezik. Ez nem garantálja, hogy a képernyőn helyes színnel jelenik meg a kártya (L2). A hibás paraméterű új blokkot a szerzői út (`single-run/engine.ts:749–756`) és a lejátszó (`LessonRuntime.tsx:320`) külön szűri.
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni a vizsgált határt.** V29 szkript- és eseménykezelő-próbája átment. A kártya HTML-be csak a közös tisztító sikeres kimenetét teszi; a többi felirat React-szöveg. Az új út nem vezet be tokent, kitöltött nyilvános adatmintát, módosító kérést vagy GET-mellékhatást. Az L2 azonosítóütközését nem minősítettem kódfuttatásnak.
3. **Regresszió — a vizsgált régi utakat nem sikerült megtörni.** V30 és a KI lenyomat zöld (gyártási kérések, elutasítások és mezőlevágás); a tárolt régi lecke alakjára is átment az összevetés. A teljes olvasási séma bővült, a legacy felsorolás nem. Az új típusokat a névtelen `/preview/` böngészőút az e2e alapbeállítás mellett megjelenítette. A régi táblázat-, szabálydoboz- és összehasonlítókártya-próbák is zöldek.
4. **Europe/Budapest — nem alkalmazható.** A diffben nincs dátummező, időzóna, időablak vagy időzített termékviselkedés.
5. **Migráció, indítás, cron, e2e — migráció/cron nem alkalmazható; az e2e indítását nem sikerült megtörni.** Nincs Drizzle-, migráció- vagy indítási diff; a követett spec eldobható PostgreSQL 17-tel és az e2e builddel 0-s kilépéssel futott. Ez nem külön migrációs vagy leállítási audit.
6. **Párhuzamosság, ismétlés, megszakítás — az új kódra nem alkalmazható mint önálló folyamat.** A diff sémát és megjelenítőket ad hozzá, nincs benne új aszinkron munka vagy írási tranzakció. A közös gyártó job párhuzamos folytatását nem mértem.
7. **Tesztminőség — talált hiba.** V29: L5. V32: a teszt méri a DOM-testvérséget és a minta szövegkereteit, de a legsűrűbb fát és a pszeudoelemekkel rajzolt kapcsolat folytonosságát nem. A katalógusteszt megőrzi a régi hirdetett listát, és az S3a-ig nem hirdetett fajták pontos listáját bővíti, dokumentáltan. A saját Node-mutáció futását a homokozó elutasította; ezt nem számítom futtatott próbának.
8. **Felület és akadálymentesség — talált hiba (L1, L3).** A repó mintáját mindhárom méreten, világos és sötét sávban megnyitottam. A mintán a külső és belső vízszintes túlcsordulás 0; az érvényes sűrű fa ellenpróbája hibás. A fa statikus, beágyazott listákból áll, a minta billentyűvel oldalszinten görgethető (Tab/PageDown); nem szükséges a nem interaktív csomópontokból mesterséges Tab-megállót csinálni. Mind a nyolc mintaképnek van nem üres `role=img` neve. A `.sv-pcard*` szelektor nem egyezik a régi `.sv-card*` szelektorral.
9. **Egyéb — talált hiba.** A külön SVG-k dokumentumszintű ID-ütközése (L2) és az alapértelmezett ágfelirat pontatlan dokumentációja (L4).

## Mit próbáltam megtörni, és nem sikerült

- Kéretlen új típus és mező a KI modellútvonalon, valamint régi mentett lecke beolvasása: a lenyomat-, séma- és katalógustesztek zöldek. A BE állapotban elfogadott ábra lejátszásához nem kell bekapcsolni a kapcsolót.
- A kétlevélű fa DOM-testvérsége, a rövid, háromágú minta oldalszintű görgetése, a nyolc mintakép felirata és a régi összehasonlító kártyák: a követett teszt és a mintán végzett mérések nem mutattak hibát ezen a határon.
- Szkript/eseménykezelő az új kártya SVG-jében a követett teszten: a renderelt HTML-ben nem jelent meg végrehajtható rész.

## Mit NEM vizsgáltam

- Firefox, Safari, valódi készülék, képernyőolvasó és nagyított szöveg: csak a futtató Chromiuma állt rendelkezésre. A natív lista felolvasása és a zoom viselkedése UNVERIFIED.
- Valódi AI-szolgáltatós gyártás, éles tárolt korpusz, bejelentkezett Stúdió-felület, párhuzamos vagy megszakított gyártó job és önálló DB-integrációs teszt: az automatizált gyártó- és olvasási határt, illetve a szintetikus preview-t vizsgáltam; ezek nem igazolják az üzemi viselkedést.
- Nyomtatás és kisfilm: következő szelet. Biztonsági ellenőrzés a megváltozott renderelési felületre korlátozódott, nem teljes sanitizáló- vagy alkalmazásaudit.
- A `node .blind-review-tmp/fa-orok.test.ts` saját séma-/mutációs ellenpróbája nem futott: a futtató Node-verziója nem támogatja a megkövetelt hálózati elzárást. L5 statikus megállapítás.

## Megcáfolt gyanúk

- Nem nőtt meg a KI ág enum-hibájában a fajták listája: a két új érték mind a teljes, mind a belőle kiszűrt listára felkerült, a legacy enum eredménye így nem változik.
- Nem a geometriai SVG vagy az API-hamisítás okozta a téglalap rossz színét: ugyanazon DOM-ban kizárólag a második lokális ID és hivatkozás átnevezése helyreállította a színt.
- A rövid fa helyes DOM-szerkezete nem cáfolja L1-et vagy L3-at: a DOM és az oldalszintű szélesség jó, miközben a sűrű ág vagy a vizuális vezeték hibás.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/lesson-source-visual-kinds.test.ts source/tests/source-coverage-gate.test.ts source/tests/source-visuals-flag.test.ts source/tests/studio-author-catalog.test.ts source/tests/lesson-schema.test.ts source/tests/animate-try-kinds.test.ts` — 95 passz, 0 bukás; az izolált körben hiányzó adatbázisról szóló naplóval.
- `npx tsc --noEmit` — 0.
- `run_e2e source/tests/source-visuals.spec.ts` — 0, eldobható adatbázissal. Az e2e naplóban a vizsgált ábrákhoz nem kötött szerverfigyelmeztetések is voltak.
- `run_browser_scenario .blind-review-tmp/vizualis-review.json` — 0; világos álló és asztali, sötét fekvő minta, 5 megtekintett képernyőkép.
- `run_browser_scenario .blind-review-tmp/tarolt-vizualis.json` — 0; tényleges preview két szintetikus API-válasszal, 3 megtekintett képernyőkép. A 0 a forgatókönyv lefutását jelenti, nem a mért elrendezés helyességét.
- `run_browser_scenario .blind-review-tmp/sav-es-tab.json` — 0; a másik három méret/sáv kombináció, billentyűpróba és kontrasztszámítás, 3 megtekintett képernyőkép.
- `node .blind-review-tmp/fa-orok.test.ts` — elutasítva futtatás előtt (homokozó). Az első böngészős forgatókönyv szintén nem futott a képszámkorlát miatt; a fenti sikeres futásokban szétbontottam.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 2 | 0 | 0 |
| közepes | 1 | 1 | 1 | 0 | 0 |
| kicsi | 2 | 2 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A szabályos, 13 csomópontos fa ágfeliratai kifutnak a keretükből 844×390-ben — `source/client/src/lesson-runtime/lesson-design.css:394` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (blokkoló) Az egyik képes kártya átveszi a másik SVG-színátmenetét — `source/client/src/lesson-runtime/blocks/tree-cards.tsx:70` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L3** (közepes) A fa ágvezető vonala megszakad és nehezen látható — `source/client/src/lesson-runtime/lesson-design.css:391` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 24 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3206
- tokenek: 1996814 bemeneti (ebből gyorsítótárból: 1873546, gyorsítótárba írva: 123196), 15879 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.2%; becsült megtakarítás: 6.9963 USD
- költség (a tényleges usage alapján): 0.6543 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
