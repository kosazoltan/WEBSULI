# Független review — TGM S6a, visszaellenőrző kör 2
Fej: 17cb0074ea6acd5361936a5a7cd596551930cdc1
## Ítélet: IGEN, FELTÉTELLEL
Az előző kör mindkét blokkolója megszűnt a jelentett bemeneten és a kibővített tesztmintán. Az azóta változott részekben új blokkolót nem igazoltam. L4 és L6 külön jegyre megy.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L4 — közepes, részben javítva — A BE kérés felülírást kér, de a rendszerutasításban megmaradt a régi tervezői szerződés.** `source/server/studio/step-io.ts:372`. A Stúdióból BE állapotban indító tanár fejezeteihez a 2. állomás `sectionKind`-ot kér. Az új mondat már kifejezetten felülírja a szerepleírás régi ívét és JSON-alakját. A tényleges rendszerutasítás ugyanakkor beemeli a pedagógusskillt (`source/server/studio/single-run/engine.ts:182–194`; a beszélgetés létrehozása: `source/server/studio/single-run/live.ts:104–109`). A skill kimeneti alakjából hiányzik a `sectionKind`, a lépések a régi ívet írják elő (`source/server/studio/role-skills.ts:92–96`). Ez a fájl a base-hez képest nem változott; ott a kérés és a skill ugyanarra az ívre épült. **Ellenérv:** a rendszerprompt bevezetője is a fordulóban kért JSON-t kéri, és a forduló most egyértelműsíti a felülírást. Nem igazolt, hogy a modell emiatt elhagyná a mezőt; ha mégis elhagyja, a kiosztás `any`-ra esik vissza (`source/shared/lesson-section-shapes.ts:98`). Modellreakció: **UNVERIFIED**. **Javítás:** BE futásnál a rendszeroldali szerződés is ugyanazt az alakot és a program általi kiosztást mondja, a rögzített futásállapot alapján; KI-ben maradjon a régi bájtsor. Tesztelje együtt a két üzenetet. Az alap-végrehajtás is a tervező skilljében kéri a kiosztásra hivatkozást (`docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md:815–820`).
- **L6 — kicsi — A repó útmutatója a vak kör indítására külön feltételt szab.** `docs/agent-csapdak.md:1207–1208`. A diffben hozzáadott „Szabály 3” szerint vak kör csak a review-botok leleteinek beérkezése és javítása után indulhat. Ha egy ellenőr a már megkapott, pontos fejre szóló megbízás mellett ezt futtatási utasításként kezeli, külső eredményre várva késleltetheti az ellenőrzést. Nem követtem; ez nem alkalmazáshiba. **Javítás:** az ellenőrzés *megrendelőjének* szóló szervezési ajánlásként fogalmazni, nem egy már megbízott ellenőr előfeltételeként.

## Az előző kör leleteinek sorsa

| Lelet | Állapot és ellenpróba |
|---|---|
| L1 — blokkoló, mohó 40%-os túllépés | **Megszűnt.** A `3379279618` magon a tíz `comparison` fejezetből egyik mintaazonosító sem kapott négynél több helyet (`source/tests/lesson-section-shapes.test.ts:149–155`, zöld). A `source/shared/lesson-section-shapes.ts:55–76` már visszalép; nem az első helyi zsákutca után engedi el a kvótát. |
| L2 — blokkoló, záró `recap` miatti sorazonosság | **Megszűnt.** A `…000030` térképazonosító négy `any` fejezetén a szerzőnek szánt végleges sorokon sem volt azonos szomszéd, sem kettőnél gyakoribb sor (`source/tests/lesson-section-shapes.test.ts:178–185`, zöld). A keresés a zárással képzett sorkulcsot és a mintaazonosítót is méri (`source/shared/lesson-section-shapes.ts:54–69`). |
| L3 — közepes, különleges záró fejezet | **Megszűnt.** Az `Ellenőrzés` `explain,animate` sora `explain,animate,recap` lett; a már zárt sor és a nem záró hibafejezet nem változott (`source/shared/lesson-section-shapes.ts:102–108`; teszt: `source/tests/lesson-section-shapes.test.ts:187–204`, zöld). A mentett és a jóváhagyott terv nem kap kiosztási magot. |
| L4 — közepes, tervezői prompt és skill | **Részben.** A fordulóban hozzáadták a felülírást (`source/server/studio/step-io.ts:372`); a szerepskill maga nem változott. A zöld promptteszt a forduló szövegét vizsgálja, nem a rendszerüzenettel együtt (`source/tests/lesson-section-shapes.test.ts:98–119`). Lásd a megmaradt jegyet. |
| L5 — kicsi, üres szimuláció sikeresnek látszik | **Megszűnt a két jelentett bemenetre.** `shapeSimulation([], 400)` és `shapeSimulation([3, 4], 0)` is kivételt ad (`source/shared/lesson-section-shapes.ts:117–120`; `source/tests/lesson-section-shapes.test.ts:206–209`, zöld). A CLI ezt a függvényt a sikerküszöb és a kilépési kód beállítása előtt hívja (`source/scripts/measure/shape-simulation.mts:8–21`); külön CLI-folyamatot nem futtattam. |

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba: L4.** A bemeneti `sectionKind` opcionális enum, hibás alakból nem lesz kiosztási hiba; a végleges tervből a mező távozik, a szerző `plannedBlocks`-ot kap (`step-io.ts:76–108`, `lesson-section-shapes.ts:88–108`, `engine.ts:782–783`). A modellnek küldött két utasítás nincs teljesen összhangban.
2. **Biztonság és adatvédelem — alkalmazáskódra nem alkalmazható a kör új változásainál.** Nincs új végpont, URL-, token-, hozzáférési, origin- vagy naplómező. A repódokumentumban külön eljárási lelet van (L6); nem tekintettem utasításnak.
3. **Regresszió — próbáltam, nem sikerült megtörni.** Az új forrásos és a meglévő térképes KI kéréslenyomatok zöldek. A régi lecke olvasási próbája és a tárolt állapotból javító út zöld. A kapcsolódó S5b-változás az azonos nevű, eltérő korcsoportos nyitásleírásokkal futott (`source/tests/lesson-opening-forms.test.ts:164–179`). A jóváhagyás, újratöltés és folytatás meglévő Stúdió-specje böngészőben is zöld, mockolt API-val.
4. **Europe/Budapest — nem alkalmazható.** Az új kiosztásnak térképazonosítóból képzett magja van; a módosított blokkválasztás és nyitás-visszaolvasás nem használ időt vagy dátumot.
5. **Migráció, Drizzle, indítás, cron, e2e — próbáltam, nem sikerült megtörni.** Nincs új migráció, Drizzle-oszlop vagy háttérjob. A Playwright-harness eldobható PostgreSQL 17-en migrált, elindult, majd eltávolította az adatbázist; négy spec-eset zöld. Ez nem éles cron-próba.
6. **Megszakítás, ismétlés, párhuzamosság — próbáltam, nem sikerült megtörni a vizsgált utakon.** A bankban megszakított KI→BE és BE→KI környezetváltás motorpróbája zöld. A terv útján `resumed?.outline ?? input.approvedOutline` veszi át a meglévő tervet, és csak új modellterv kap magot (`engine.ts:719–731`); az új keresés szinkron és determinisztikus. A route valódi párhuzamos foglalását nem mértem.
7. **Tesztminőség — a numerikus és a zárótesztek viselkedést mérnek; a teljes promptpár nincs ellenőrizve.** A korábbi bemenetek visszatértek regressziós tesztként, a pontosítás dokumentált (`docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:260–263`). Az `engine.ts`-re írt regex szerkezeti őr, nem checkpointos viselkedésteszt. Saját sorkvóta- és recap-mutációt készítettem, de a futtató a saját Node-próbát nem engedte elindítani; mutációs eredményt nem állítok.
8. **S6a elfogadás — célzottan próbáltam megtörni.** V13: a hat készletbeli minta három pozícióban, a zárással és nyitóblokkokkal felépített ál-leckében átment az ívkapun. V14: a végső sorokra 10 fejezetszám × 200 mag × 6 típuseloszlás × 2 zárási mód, azaz 24 000 eset zöld, mellettük a két eredeti ellenpélda. V15: a különleges fejezetre csak a dokumentált `recap`-kivétel látszik a tesztben; a KI lenyomatok, a szerkezeti őr és a jóváhagyott terv motorpróbája zöld. BE promptnál lásd L4. V16: a rögzített eloszlású, 400 leckés szimuláció tesztje igazolta a `<35%` és `<20%` küszöböt és az ismételhetőséget; pontos százalékot a futás nem nyomtatott.
9. **Egyéb — próbáltam, nem sikerült megtörni.** A szimuláció üres bemenetét külön támadtam (L5). Mockolt tervvel megnyitottam a Stúdió tervkártyát álló és fekvő telefonon: a `try` és a záró `recap` címkéje látszott mindkét képen. Az oldal `scrollWidth/clientWidth` értéke 360/360 és 844/844 px. Fekvőn a kártya alsó része a hajtás alá esik; a mért elemben nincs vízszintes túlcsordulás. Ez megjelenítési ellenpróba, nem valódi modellgyártás.

## Mit próbáltam megtörni, és nem sikerült

- A tíz összehasonlító fejezettel előidézett eredeti kvótatúllépést és a négy `any` fejezetnél jelentett záró ütközést. Az eredeti bemenetek zöldek, a kibővített számlálás a végleges sorokat is vizsgálja.
- Az üres mérés elfogadását, a különleges utolsó fejezet `recap` nélküli továbbadását, és a korosztályok között közös nyitásazonosítók visszaolvasását; mindháromra zöld célzott teszt van.
- A KI lenyomatokat és a megszakadt futás kapcsolóját környezetváltással. A meglévő regressziós próbák nem mutattak eltérést; a forrásban a kiosztás feltétele a mentett vagy jóváhagyott tervet kizárja.

## Mit NEM vizsgáltam

- Nem hívtam fizetős modellt. A rendszer- és felhasználói utasításra adott tényleges modellválasz, illetve a kiosztott ív követése valós tananyagon **UNVERIFIED**.
- A saját Node-próba (benne a mutációk) nem futott: a futtató a Node v24.22.3 hálózati sandboxja miatt elutasította. Nem mértem függetlenül a keresési keret legrosszabb esetét, és nem futtattam külön CLI-folyamatot.
- Nem futtattam teljes DB-integrációs csomagot vagy valódi kétkéréses folytatási versenyt, és nem mértem együtt egy futó gyártást és a térkép évfolyamának megváltoztatását. A böngészős Stúdió-út mockolt válaszokat használt; az adatbázis-indítás valós volt, az érintett jobírás nem.
- Nem futott végig éles vagy friss S6a-lecke lejátszói vizuális ellenőrzése; az álló/fekvő képek a Stúdió tervnézetét fedik. A korábbi kör változatlan kliensrészeit nem auditáltam újra.

## Megcáfolt gyanúk

- A záró alak csak az íráskor kerül figyelembe vételre: a keresés már ugyanezt a `shapeBlocks` alakot kulcsolja; a jelentett ütközés megszűnt.
- Az új `recap`-pótlás a jóváhagyott tervet is átírhatja: a motor mag nélkül megy arra az ágra, a mag nélküli `applySectionShapes` nem cseréli a blokksorokat.
- Az első saját böngészős próbában hiányzó tervkártya regressziót jelzett volna: a nézet `selectedMap`-et is kér (`source/client/src/components/studio/LessonStudioPanel.tsx:213–215`); a térképet kiválasztó javított esetben mindkét nézetben megjelent.

## Mit futtattam (parancs + eredmény)

- `git diff base...head`, `git log`, `git show 17cb0074`, `git show 6922ea8f`, valamint a base pedagógusskilljének olvasása: a visszaellenőrzési delta és a rendszerutasítás változatlansága azonosítva.
- `npx tsx --test source/tests/lesson-section-shapes.test.ts source/tests/lesson-opening-forms.test.ts source/tests/lesson-arc.test.ts source/tests/source-visuals-flag.test.ts source/tests/single-run-engine.test.ts source/tests/studio-role-skills.test.ts` — 129/129 zöld; külön a `lesson-section-shapes.test.ts`: 13/13 zöld.
- `npx tsx --test source/tests/lesson-variety-paths.test.ts source/tests/lesson-variety-flag.test.ts source/tests/lesson-feedback-openers.test.ts source/tests/apply-readback.test.ts` — 33/33 zöld. A modell nélküli tesztfutások DB-konfigurációs figyelmeztetése nem DB-bizonyíték.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0.
- `run_e2e source/tests/single-run-follow.spec.ts` — 4 zöld, eldobható adatbázis eltávolítva.
- `run_browser_scenario .blind-review-tmp/s6a-outline-view.json` — a tervkártya-várás időtúllépett térképválasztás nélkül. `run_browser_scenario .blind-review-tmp/s6a-outline-view-v2.json` — mindkét viewporton megjelent a kártya, mért szélesség és képek ellenőrizve.
- `node .blind-review-tmp/s6a-shapes.mjs` — a futtató elutasította a saját Node-próbát; nincs futási eredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 1 | 1 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L4** (közepes) A BE kérés felülírást kér, de a rendszerutasításban megmaradt a régi tervezői szerződés — `source/server/studio/step-io.ts:372` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 27 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3239
- tokenek: 2829122 bemeneti (ebből gyorsítótárból: 2675521, gyorsítótárba írva: 153520), 17840 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 95.1%; becsült megtakarítás: 10.0135 USD
- költség (a tényleges usage alapján): 0.8299 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
