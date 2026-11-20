# 04 · Tulajdonosi utasítások és megfigyelt hibák

**Vizsgált főág** — `origin/main`, `d9d1e6c6d706a0c96b1f16d5fd44db2c7b09a1d8`, 2026-11-20. A korai Claude-munkamenetek teljes átiratai már nincsenek meg. A megmaradt Claude-export első üzenete 2026-10-14-i, a Codex-exporté 2026-09-15-i. A git-történet 2025-12-09-ig ér vissza. A történeti megvalósításból önmagában nem állapítható meg, mit mondott szó szerint a tulajdonos.

**Forráskulcs** — C = `tulajdonosi-uzenetek-mind.md` (304 üzenet), X = `codex-uzenetek.md` (26 bejegyzés), G = `git-naplo.txt` (1 674 commit). A C/X szám az időrendi bejegyzés sorszáma, a forrásjegyzék az export megfelelő sorát adja meg. A G szám közvetlenül a napló sorszáma. Mind az 1 674 rövid hash egyedi, halmazuk egyezik az `origin/main` teljes őshalmazával. Az élő rendszert, levelezést, adatbázist és külső szolgáltatásokat ebben a vizsgálatban nem kérdeztük le.

**Értelmezés** — A KÉSZ a megnevezett elfogadási feltételre és a rögzített főágra vonatkozik. A megfigyelt hibák jegyzéke az ismételt panaszt is megőrzi. Az éles kézbesítést, valódi telefonon mért sebességet és adatjavítást külön bizonyítékhoz kötjük. A tesztnevek visszakeresési pontok, a revízió során nem futottak. A P-hivatkozások a `docs/websuli-potlasok` ág `docs/websuli-potlasok.md` leltárára vonatkoznak.

## Eredmény

| Állapot | Tétel |
|---|---:|
| KÉSZ | 63 |
| RÉSZBEN | 56 |
| NEM VALÓSULT MEG | 2 |
| ÁGON KÉSZ, NINCS BENT | 8 |
| NEM IDŐSZERŰ | 13 |
| ELLENŐRIZETLEN | 30 |
| **Összesen** | **172** |

A javítások átvételénél elsőként az ismételten jelzett felhasználói hibákat érdemes megnyitni. A kihajtott telefonon akadó Kockavadász (R-UTAS-091), a hiányzó kvízeredmény (R-UTAS-037) és a lassan megszólaló brit hang (R-UTAS-105) mind kapott főági javítást, de a tulajdonos teljes elfogadási feltételét még ellenőrizni kell. A Szólétra hibás tárgyragja (R-UTAS-114) a rögzített főág kódjában is olvasható.

## A tulajdonos által megfigyelt hibák

A sorok az eredeti megfigyelést követik. A „feltételezett” jelölés azt mutatja, hogy a tulajdonos lehetséges hibát jelzett. A részletes tétel a mért hibát és a feltételezett okot külön kezeli. A KÉSZ tételek bizonyítékai a dokumentum végén szerepelnek.

| Azonosító | Megfigyelés | Főági állapot |
|---|---|---|
| R-UTAS-001 | Tantárgy- és évfolyamfelismerő modell (az ok feltételezett) | NEM IDŐSZERŰ |
| R-UTAS-005 | Tömörség és tényfedettség | KÉSZ |
| R-UTAS-006 | Eltűnő draft és újrakezdődő gyártás | KÉSZ |
| R-UTAS-010 | Gyártáskövetés és három teljes próbafutás | RÉSZBEN |
| R-UTAS-017 | Egy indításra három aktív draft (az ok feltételezett) | ELLENŐRIZETLEN |
| R-UTAS-018 | Ismétlődő lektori elutasítás | RÉSZBEN |
| R-UTAS-029 | Eltűnt képek és egyforma arculat | RÉSZBEN |
| R-UTAS-030 | Lecke megnyitásakor felvillanó újrarajzolás | KÉSZ |
| R-UTAS-032 | Róka az idősebb évfolyamokon | RÉSZBEN |
| R-UTAS-034 | Meg nem nyitott böngésző és levélcsatlakozó | ELLENŐRIZETLEN |
| R-UTAS-037 | Hiányzó kvízeredmény a szülői levélből | RÉSZBEN |
| R-UTAS-042 | Tanulók fül mobilon | KÉSZ |
| R-UTAS-043 | Elkészült webes gyártás fogva tartja az indítást | KÉSZ |
| R-UTAS-044 | Régi HTML mobilos kiválasztása | KÉSZ |
| R-UTAS-045 | Hat évfolyamsáv tényleges színei | RÉSZBEN |
| R-UTAS-046 | Lecsúszó feltöltési és újragyártási gomb | KÉSZ |
| R-UTAS-047 | Elmaradt napi levelek | ELLENŐRIZETLEN |
| R-UTAS-048 | Csak feladatlapfotókat mutató nyelvlecke | RÉSZBEN |
| R-UTAS-050 | Okosítás fázissora | KÉSZ |
| R-UTAS-051 | Hibás publikált példányok és draftok | ELLENŐRIZETLEN |
| R-UTAS-054 | Magyar döntési űrlap | RÉSZBEN |
| R-UTAS-058 | Mentés közben sérülő karakterek | KÉSZ |
| R-UTAS-059 | El sem induló és beragadt javítások | RÉSZBEN |
| R-UTAS-060 | Kiejtésgyakorlás a régi nyelvleckékben | RÉSZBEN |
| R-UTAS-062 | Téves inaktivitás párosított telefonon | RÉSZBEN |
| R-UTAS-067 | Keskeny lecke asztali monitoron | RÉSZBEN |
| R-UTAS-085 | Lomha érintős joystick | KÉSZ |
| R-UTAS-086 | Osztályjelzés a tananyag címében | RÉSZBEN |
| R-UTAS-090 | Szólétra olvasási idő és célszó | RÉSZBEN |
| R-UTAS-091 | Kockavadász akadozik kihajtott telefonon | RÉSZBEN |
| R-UTAS-094 | Opcionális mondatvégi pont | KÉSZ |
| R-UTAS-096 | Brain Rot válaszideje | KÉSZ |
| R-UTAS-097 | Cloudflare-hitelesítés és DNS | ELLENŐRIZETLEN |
| R-UTAS-099 | Szökőár helyett autóborogatás és akadás | ÁGON KÉSZ, NINCS BENT |
| R-UTAS-103 | Figyelmen kívül maradó forrásábrák | RÉSZBEN |
| R-UTAS-104 | Monoton lecketartalom | RÉSZBEN |
| R-UTAS-105 | Brit hang és későn induló felolvasás | RÉSZBEN |
| R-UTAS-107 | Szürke folt a maki orránál | ELLENŐRIZETLEN |
| R-UTAS-108 | Jobbkezes joystick és bal oldali tűzgomb | ÁGON KÉSZ, NINCS BENT |
| R-UTAS-113 | Olvashatatlan árnyékolt szöveg | NEM VALÓSULT MEG |
| R-UTAS-114 | Hibás tárgyrag a Szólétrában | NEM VALÓSULT MEG |
| R-UTAS-115 | Megszakadó mobilos munkamenet | ELLENŐRIZETLEN |
| R-UTAS-116 | Hosszú hibaüzenetek kitakarási ideje (az ok feltételezett) | ÁGON KÉSZ, NINCS BENT |

### R-UTAS-001 · Tantárgy- és évfolyamfelismerő modell

- **Azonosító** — R-UTAS-001
- **Cím** — Tantárgy- és évfolyamfelismerő modell
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A tantárgy és az évfolyam felismerése fusson közvetlen OpenAI-kapcsolaton Lunával.
- **Forrás** — C2 (2026-10-14, 7. sor), C4 (2026-10-14, 15. sor), C8 (2026-10-14, 31. sor)
- **Mi van kész** — A #209 a felismerőt átállította. A #262 egyfutásos gyártásra váltott. A mai katalógus két tényleges modellje a source/server/catalog/classify.ts:51 konstansban látható. #209 (`8851d417`), #262 (`93c0c642`), `source/tests/catalog-classify.test.ts:14`.
- **Mi hiányzik** — A korábbi modellkiosztást a gyártásban a 2026-10-16-i C55 felülírta.
- **Folytatás helye** — origin/main, #209, #262 · `source/tests/catalog-classify.test.ts:14`
- **Következő lépés** — A #209 regresszióját szolgáltatói hibával ellenőrizd, a jelenlegi gyártást a #262 modellpárjához mérd.
- **Függőség / ütközés** — C55 csak a tananyaggyártó útvonalra vonatkozik.
- **Kapcsolódó P-tétel** — —

### R-UTAS-010 · Gyártáskövetés és három teljes próbafutás

- **Azonosító** — R-UTAS-010
- **Cím** — Gyártáskövetés és három teljes próbafutás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — Legyen látható az elakadás helye, és legyen végigmért fájlos, webes és folytatott mintafutás.
- **Forrás** — C28 (2026-10-15, 111. sor), C29 (2026-10-15, 115. sor), C34 (2026-10-15, 135. sor), C56 (2026-10-16, 243. sor), C59 (2026-10-16, 256. sor), C60 (2026-10-16, 260. sor), C141 (2026-10-20, 851. sor), C149 (2026-10-20, 883. sor), C150 (2026-10-20, 887. sor), C152 (2026-10-20, 895. sor)
- **Mi van kész** — A gyártáskövetés, a fejezetenkénti haladás, a telemetria és az újraindítás utáni visszamérés bekerült. #224 (`d854e4f0`), #263 (`e1c305ef`), #264 (`0959a52a`), #395 (`b655c878`), #416 (`19e9298d`), `source/tests/single-run-follow.spec.ts:5`.
- **Mi hiányzik** — A három kért eredeti futás teljes, egymáshoz rendelt mérési sora nincs igazolva.
- **Folytatás helye** — origin/main, #224, #263, #264, #395, #416 · `source/tests/single-run-follow.spec.ts:5`
- **Következő lépés** — A #263 egyfutásos követésének mintájával hasonlíts össze egy megszakított draftot, egy fájlos és egy webes gyártást. Jegyezd fel a fázist, mentett fejezeteket, végállapotot és költséget.
- **Függőség / ütközés** — Először a tárolt méréseket használd.
- **Kapcsolódó P-tétel** — —

### R-UTAS-017 · Egy indításra három aktív draft

- **Azonosító** — R-UTAS-017
- **Cím** — Egy indításra három aktív draft
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — Egy piszkozat indítása ne indítsa el a másik kettőt.
- **Forrás** — C51 (2026-10-16, 213. sor)
- **Mi van kész** — A #396 az aktív futást gyártásra és élő bérletre szűkíti. Ez a kijelzett állapotot bizonyítja. #253 (`f0b54b2f`), #256 (`6c822600`), #396 (`9aea1459`), `source/tests/admin-draft-lessons.spec.ts:6`.
- **Mi hiányzik** — Az októberi esetben három szerveres munkakezdés történt-e, vagy három kártya látszott aktívnak, tisztázatlan.
- **Folytatás helye** — origin/main, #253, #256, #396 · `source/tests/admin-draft-lessons.spec.ts:6`
- **Következő lépés** — A draftlista e2e-próbájában hozz létre három piszkozatot, egyet folytass, és a végpont hívásszámát, valamint a három job állapotát együtt ellenőrizd.
- **Függőség / ütközés** — A régi időszak naplója személyes adatok nélkül vizsgálható.
- **Kapcsolódó P-tétel** — —

### R-UTAS-018 · Ismétlődő lektori elutasítás

- **Azonosító** — R-UTAS-018
- **Cím** — Ismétlődő lektori elutasítás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A lektor ne dobálja vissza vég nélkül az egyébként javítható leckét.
- **Forrás** — C51 (2026-10-16, 213. sor), C101 (2026-10-18, 668. sor), C127 (2026-10-19, 784. sor), C142 (2026-10-20, 855. sor)
- **Mi van kész** — Üres banklista, algebrai kulcs, utolsó kör és ismétlődő bankhiba ellen is van main-javítás. #257 (`a4647fa4`), #298 (`28c2c07b`), #319 (`5aeb4a12`), #331 (`bca4aae1`), #333 (`d39e4200`), #414 (`7bdbddb4`), `source/tests/lesson-pipeline-runner.test.ts:9`.
- **Mi hiányzik** — A tulajdonos minden érintett futásához nincs igazolt bemenet–hibakód–újrajátszás kapcsolat.
- **Folytatás helye** — origin/main, #257, #298, #319, #331, #333, #414 · `source/tests/lesson-pipeline-runner.test.ts:9`
- **Következő lépés** — A #331 és #333 javításokban érintett gyártómotort a megőrzött hibajegyekkel játszd vissza. Külön ellenőrizd az elfogadható bank és a valódi tartalmi hiba végállapotát.
- **Függőség / ütközés** — A külső megoldások kutatását C142 kérte, ennek külön nyoma szükséges.
- **Kapcsolódó P-tétel** — —

### R-UTAS-029 · Eltűnt képek és egyforma arculat

- **Azonosító** — R-UTAS-029
- **Cím** — Eltűnt képek és egyforma arculat
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A lapos, uniformizált régi és új leckék kapjanak változatos, korosztályos képeket. A minta HTML-ben is látszódjanak.
- **Forrás** — C78 (2026-10-17, 338. sor), C79 (2026-10-17, 342. sor), C80 (2026-10-17, 346. sor), C81 (2026-10-17, 350. sor), C84 (2026-10-17, 362. sor), C85 (2026-10-17, 366. sor), C86 (2026-10-17, 370. sor)
- **Mi van kész** — A grafikai szabályterv, a 36 elemű készlet, az adatbázisos ikonválasztás és a színek bekerültek. #272 (`bf8a511b`), #273 (`e475387a`), #274 (`ea469791`), #320 (`a1463b66`), `source/tests/subject-icon.spec.ts:8`.
- **Mi hiányzik** — Az eredeti minta összes képének és a 6–8. évfolyam természettudományi ikonjának tényleges megjelenése nincs páronként ellenőrizve.
- **Folytatás helye** — origin/main, #272, #273, #274, #320 · `source/tests/subject-icon.spec.ts:8`
- **Következő lépés** — A #274 ikonpróbáját futtasd a minta HTML és egy régi, egy új 6–8. osztályos természettudomány-lecke megnyitásával. Ellenőrizd a betöltött képet és a rotáció stabilitását.
- **Függőség / ütközés** — Az eredeti referenciaképről csak szöveges leírás áll rendelkezésre.
- **Kapcsolódó P-tétel** — —

### R-UTAS-032 · Róka az idősebb évfolyamokon

- **Azonosító** — R-UTAS-032
- **Cím** — Róka az idősebb évfolyamokon
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. A változtatás a megjelenítést pontosítja.
- **Eredeti utasítás / cél** — Az idősebb korosztálynál tantárgyi motívum jelenjen meg, ötödikben maradhat a róka.
- **Forrás** — C88 (2026-10-17, 608. sor), C91 (2026-10-17, 620. sor)
- **Mi van kész** — A sávspecifikus hős és az adatbázisos ikon megvan. C91 kilencedikben nem találta meg a korábban feltételezett hibát. #273 (`e475387a`), #274 (`ea469791`), #322 (`bc90b3ea`), `source/tests/stored-art.test.ts:11`.
- **Mi hiányzik** — A teljes felső tagozatos állományban a kivételek száma nincs igazolva.
- **Folytatás helye** — origin/main, #273, #274, #322 · `source/tests/stored-art.test.ts:11`
- **Következő lépés** — A #322 hősképválasztását próbáld végig ötödik, hatodik és kilencedik évfolyamon, régi arculattal mentett leckén is. Csak a tévesen társított képet cseréld.
- **Függőség / ütközés** — C91 pontosította C88-at 2026-10-17-én.
- **Kapcsolódó P-tétel** — —

### R-UTAS-034 · Meg nem nyitott böngésző és levélcsatlakozó

- **Azonosító** — R-UTAS-034
- **Cím** — Meg nem nyitott böngésző és levélcsatlakozó
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A kért üzemeltetési állapotot vissza kell igazolni.
- **Eredeti utasítás / cél** — A megnyitott belső böngészőben lehessen belépni, elérni a csatlakoztatott levelezést és a kért letöltést.
- **Forrás** — C30 (2026-10-15, 119. sor), C31 (2026-10-15, 123. sor), C32 (2026-10-15, 127. sor), C33 (2026-10-15, 131. sor), C89 (2026-10-17, 612. sor), C90 (2026-10-17, 616. sor), C93 (2026-10-18, 628. sor), C109 (2026-10-18, 700. sor), C117 (2026-10-19, 734. sor), C121 (2026-10-19, 760. sor), C215 (2026-11-16, 1253. sor)
- **Mi van kész** — C32 szerint az ablak nem nyílt meg, C33, C89 és C117 később belépést igazol. C93 továbbra is a levelező elérését kifogásolja. `docs/codex-felhokornyezet.md:1`.
- **Mi hiányzik** — A böngésző, a mobilos munkamenet és a levelező csatlakozója külön hozzáférés. Az eredeti levélkeresés és letöltés sikere ismeretlen.
- **Folytatás helye** — origin/main · `docs/codex-felhokornyezet.md:1`
- **Következő lépés** — A docs/codex-felhokornyezet.md alapján az érintett futtatón ellenőrizd az adminoldal megnyitását, majd próbafiókkal külön a levélkeresést és a fájlletöltést. Csak eredményt rögzíts.
- **Függőség / ütközés** — A munkamenetbe való belépés nem ad új adminjogot.
- **Kapcsolódó P-tétel** — —

### R-UTAS-037 · Hiányzó kvízeredmény a szülői levélből

- **Azonosító** — R-UTAS-037
- **Cím** — Hiányzó kvízeredmény a szülői levélből
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A szülő a szöveges feladat mellett a kvíz eredményét is kapja meg.
- **Forrás** — C106 (2026-10-18, 688. sor), C252 (2026-11-17, 1409. sor)
- **Mi van kész** — A befejezett kör küldése, a foglalás és a szerveroldali utolsó válasz javítása mainen van. #510 nyitott. #280 (`ddaff0f2`), #281 (`5447994d`), #300 (`166bb9be`), #495 (`3ff4d173`), #496 (`b7622adf`), `source/tests/lesson-result-email-quiz.spec.ts:9`.
- **Mi hiányzik** — A félbehagyott kör eredményének kézbesítése és az átmeneti küldési hiba utáni ismétlés nem lezárt.
- **Folytatás helye** — origin/main, #280, #281, #300, #495, #496 · `source/tests/lesson-result-email-quiz.spec.ts:9`
- **Következő lépés** — A #510 pillanatképét vesd össze a source/server/lesson-result-email.ts foglalásával. A befejezett, megszakított és újranyitott körnél ellenőrizd a tényleges kvízpontot és az egyszeri küldést.
- **Függőség / ütközés** — A szülői eredménylevél és a tanulói emlékeztető külön küldési út.
- **Kapcsolódó P-tétel** — P-024, P-025

### R-UTAS-045 · Hat évfolyamsáv tényleges színei

- **Azonosító** — R-UTAS-045
- **Cím** — Hat évfolyamsáv tényleges színei
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Minden kért kétosztályos sáv legyen színnel megkülönböztethető, a korábbi Stúdió-anyagokon is.
- **Forrás** — C128 (2026-10-19, 788. sor)
- **Mi van kész** — A #267 öt design-sávot vitt be, a #320 megszüntette a beragadt csendes nézetet és látható színátmeneteket vezetett be. #267 (`7c2f6a36`), #320 (`a1463b66`), `source/tests/lesson-band-colors.spec.ts:8`.
- **Mi hiányzik** — C128 hat sávot sorol 1–2-től 11–12-ig. Az öt témából nem következik a hat külön háttér, betűszín és a régi állomány teljes átállása.
- **Folytatás helye** — origin/main, #267, #320 · `source/tests/lesson-band-colors.spec.ts:8`
- **Következő lépés** — A #320 témaválasztásán adj a vizuális próbának egy-egy régi és új leckét mind a hat kért sávból. Rögzítsd a tényleges színpárokat és javítsd az ütköző hozzárendelést.
- **Függőség / ütközés** — A konkrét C128 későbbi a designcsomag elfogadásánál.
- **Kapcsolódó P-tétel** — —

### R-UTAS-047 · Elmaradt napi levelek

- **Azonosító** — R-UTAS-047
- **Cím** — Elmaradt napi levelek
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — Derüljön ki, miért maradt el az aznapi emlékeztető és a délutáni hírlevél.
- **Forrás** — C130 (2026-10-19, 800. sor), C115 (2026-10-19, 726. sor)
- **Mi van kész** — A két időzített küldés kódja megvan. A 16:45-ös panaszhoz nincs címzettmentes kézbesítési nyugta az exportban. #292 (`fc70aa4f`), #315 (`17e84334`), `source/tests/newsletter-db.integration.ts:51`.
- **Mi hiányzik** — Az október 19-i kiválasztás, foglalás, szolgáltatói átvétel és kézbesítés közötti töréspont ismeretlen.
- **Folytatás helye** — origin/main, #292, #315 · `source/tests/newsletter-db.integration.ts:51`
- **Következő lépés** — A source/server/newsletter.ts és a napi emlékeztető naplóit időrendben párosítsd Europe/Budapest szerint. Tesztcímzetten próbáld ki a késő indítást, a hiányzó forrást és az újraküldést.
- **Függőség / ütközés** — A Resend-keret közlése nem kézbesítési bizonyíték.
- **Kapcsolódó P-tétel** — —

### R-UTAS-048 · Csak feladatlapfotókat mutató nyelvlecke

- **Azonosító** — R-UTAS-048
- **Cím** — Csak feladatlapfotókat mutató nyelvlecke
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A Where I Live modul fényképeiből készüljön teljes interaktív nyelvlecke.
- **Forrás** — C131 (2026-10-19, 804. sor)
- **Mi van kész** — A #326 az egy-két betűs angol fogalmak kapuhibáját javította. #326 (`722cfd0e`), `source/tests/studio-grounding-short-term.test.ts:20`.
- **Mi hiányzik** — Az adott kiadott lecke teljes forráshű tartalma, képei és interakciói nem igazolhatók a kódjavításból.
- **Folytatás helye** — origin/main, #326 · `source/tests/studio-grounding-short-term.test.ts:20`
- **Következő lépés** — A docs/lesson-improvement.md szerint hasonlítsd a mentett forrásoldalakat a lecke fejezeteihez, próbálj ki egy feladatot és egy kvízt, majd olvasd vissza a mentett változatot.
- **Függőség / ütközés** — Az eredeti képek személyes másolatai nem publikálhatók.
- **Kapcsolódó P-tétel** — —

### R-UTAS-051 · Hibás publikált példányok és draftok

- **Azonosító** — R-UTAS-051
- **Cím** — Hibás publikált példányok és draftok
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A hibás anyag csak igazoltan jó példány mellett törölhető, máskülönben javítás és kép kell. A hibás draft ne zavarja a listát.
- **Forrás** — C134 (2026-10-19, 818. sor), C167 (2026-10-21, 962. sor)
- **Mi van kész** — A #358 a piszkozatok takarítását bevezette. A három konkrét példány sorsát a beolvasott üzenet nem tartalmazza. #323 (`17e98afa`), #358 (`441e1eac`), `source/tests/ciklus6b-felirat-takaritas.test.ts:11`.
- **Mi hiányzik** — Hiányzik a három eredeti és a helyettesítők páronkénti ellenőrzése.
- **Folytatás helye** — origin/main, #323, #358 · `source/tests/ciklus6b-felirat-takaritas.test.ts:11`
- **Következő lépés** — A #323 állapotlistájából és a mentésekből különítsd el az árva futást a hibás publikált anyagtól. Mindháromhoz ellenőrizd a jó példány megnyitását vagy a javított kép betöltését törlés előtt.
- **Függőség / ütközés** — Éles adatmódosításhoz külön ellenőrzött mentés kell.
- **Kapcsolódó P-tétel** — —

### R-UTAS-054 · Magyar döntési űrlap

- **Azonosító** — R-UTAS-054
- **Cím** — Magyar döntési űrlap
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A döntéseket magyarul, jól látható kérdéssel, űrlapon, lehetőségekkel és indokolt ajánlással kapja meg a tulajdonos.
- **Forrás** — C40 (2026-10-15, 159. sor), C41 (2026-10-15, 173. sor), C111 (2026-10-19, 708. sor), C138 (2026-10-19, 838. sor), C145 (2026-10-20, 867. sor), C146 (2026-10-20, 871. sor), C163 (2026-10-21, 943. sor), C179 (2026-10-22, 1013. sor), C201 (2026-11-02, 1195. sor), C203 (2026-11-02, 1203. sor), C217 (2026-11-16, 1261. sor), C268 (2026-11-18, 1492. sor), C287 (2026-11-19, 1568. sor), C86 (2026-10-17, 370. sor)
- **Mi van kész** — Az AGENTS.md előírja a magyar kommunikációt. C40 három magyarázott lehetőséget kért, C268 szerint a javaslat kérdés nélkül látszott. `AGENTS.md:3`.
- **Mi hiányzik** — Az összes futtató űrlapjának tényleges használatára nincs bizonyíték.
- **Folytatás helye** — origin/main · `AGENTS.md:3`
- **Következő lépés** — Az AGENTS.md munkafolyamatában rögzíts mintát kérdésre, három válaszra és ajánlásra. Telefonos próbakérdésnél ellenőrizd, hogy a kérdés és az ajánlás együtt látszik.
- **Függőség / ütközés** — A nem interaktív futásban a jelen megbízás az irányadó.
- **Kapcsolódó P-tétel** — —

### R-UTAS-059 · El sem induló és beragadt javítások

- **Azonosító** — R-UTAS-059
- **Cím** — El sem induló és beragadt javítások
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A javítás indítása után minden kiválasztott anyagnál a tényleges futási állapot látszódjon.
- **Forrás** — C165 (2026-10-21, 954. sor), C166 (2026-10-21, 958. sor)
- **Mi van kész** — Árva futás és beragadt sorelem célzott javítása van a mainen. #354 (`892d84ad`), #356 (`76ffa45e`), #357 (`67d88d20`), `source/tests/regi-anyag-studio.test.ts:12`.
- **Mi hiányzik** — A pontosan egy futó, egy elakadt és két el sem indult feladatról nincs közös újrajátszás.
- **Folytatás helye** — origin/main, #354, #356, #357 · `source/tests/regi-anyag-studio.test.ts:12`
- **Következő lépés** — A source/server/studio/legacy-migration.ts sorát négy tétellel próbáld ki megszűnő worker mellett. A kliens jelzése egyezzen az egyes sorok bérletével és végállapotával.
- **Függőség / ütközés** — Az ötös cikluskapu szándékos várakozását külön kezeld.
- **Kapcsolódó P-tétel** — —

### R-UTAS-060 · Kiejtésgyakorlás a régi nyelvleckékben

- **Azonosító** — R-UTAS-060
- **Cím** — Kiejtésgyakorlás a régi nyelvleckékben
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P1. A nyelvlecke egyik tanulási feladata válik nehezen használhatóvá.
- **Eredeti utasítás / cél** — Minden angol és francia nyelvleckében legyen szó- és szövegfelolvasás, valamint kiejtésgyakorlás.
- **Forrás** — C169 (2026-10-21, 970. sor)
- **Mi van kész** — A #360 gyakorlót és diktálást, a #409 szerveroldali tartalékot, a #516 hangláncot hozott. #360 (`9d0d3a0a`), #409 (`597f986c`), #516 (`b7165a56`), `source/tests/pronunciation.test.ts:7`.
- **Mi hiányzik** — Az összes régi nyelvlecke tényleges átállítása és a gyártáskor felismert leckék teljes lefedettsége nincs igazolva.
- **Folytatás helye** — origin/main, #360, #409, #516 · `source/tests/pronunciation.test.ts:7`
- **Következő lépés** — A #360 kiejtési tesztjét futtasd régi HTML, átalakított és új Stúdió-leckén angolul és franciául. Leltározd külön a hiányzó szó-, mondat- és gyakorlógombot.
- **Függőség / ütközés** — A brit hang minőségét külön kérés rögzíti.
- **Kapcsolódó P-tétel** — P-032

### R-UTAS-062 · Téves inaktivitás párosított telefonon

- **Azonosító** — R-UTAS-062
- **Cím** — Téves inaktivitás párosított telefonon
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A párosított telefonról elvégzett lecke alapján ne menjen téves inaktivitási riasztás.
- **Forrás** — C172 (2026-10-21, 982. sor)
- **Mi van kész** — Aláírt párosítás, eredmény-hozzárendelés, QR-kód és javított riasztási logika megvan. #301 (`e4d9644c`), #302 (`b5006583`), #362 (`aaca73f4`), `source/tests/learner-attribution.test.ts:11`.
- **Mi hiányzik** — A konkrét korábbi vendégeredmény és a családi készülék összerendelése nem ellenőrizhető nyilvánosan.
- **Folytatás helye** — origin/main, #301, #302, #362 · `source/tests/learner-attribution.test.ts:11`
- **Következő lépés** — A #362 tanuló-hozzárendelési tesztjében külön kezeld a párosítás előtti vendégkört és a párosított kört. Az utóbbinál ne keletkezzen téves riasztás.
- **Függőség / ütközés** — A valós tanuló és eszköz adatai maradjanak a védett rendszerben.
- **Kapcsolódó P-tétel** — —

### R-UTAS-067 · Keskeny lecke asztali monitoron

- **Azonosító** — R-UTAS-067
- **Cím** — Keskeny lecke asztali monitoron
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A lecke töltse ki a telefon, a nyitott hajlítható kijelző és a széles asztali monitor hasznos terét, tömeges újragyártás nélkül.
- **Forrás** — C184 (2026-10-22, 1056. sor), C185 (2026-10-22, 1060. sor), C186 (2026-10-22, 1064. sor), C187 (2026-10-22, 1068. sor), C189 (2026-10-22, 1076. sor)
- **Mi van kész** — A #368 átalakította a Stúdió-lejátszó töréspontjait. C189 az eredményt élesben továbbra is keskenynek látta. #368 (`94a3a3e2`), `source/tests/lesson-responsive.spec.ts:8`.
- **Mi hiányzik** — Nincs visszaigazolás azonos leckéről, viewportból és kiszolgált verzióból, illetve az összes régi anyagról. C187 egy kivételt enged.
- **Folytatás helye** — origin/main, #368 · `source/tests/lesson-responsive.spec.ts:8`
- **Következő lépés** — A source/tests/lesson-responsive.spec.ts próbájában mérd meg a tényleges tartalomszélességet keskeny és kihajtott telefonon, tableten és széles monitoron. Régi HTML és Stúdió is szerepeljen.
- **Függőség / ütközés** — A kivételt az eredeti forrás alapján, nyilvános személynév nélkül azonosítsd.
- **Kapcsolódó P-tétel** — —

### R-UTAS-086 · Osztályjelzés a tananyag címében

- **Azonosító** — R-UTAS-086
- **Cím** — Osztályjelzés a tananyag címében
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — Az Összes listában a cím mellett lehessen látni és keresni az osztályt, a jó címek duplázása nélkül.
- **Forrás** — C218 (2026-11-16, 1265. sor), C219 (2026-11-16, 1269. sor), C250 (2026-11-17, 1399. sor)
- **Mi van kész** — A #459 jelvénye után ismételt panasz érkezett. A #494 a címet és a keresőt is javította. A korabeli #54 jegy 241/241 évfolyamot rögzít. #459 (`340e63dd`), #465 (`fe7c89fb`), #494 (`a7b3b787`), `source/tests/material-title.spec.ts:8`.
- **Mi hiányzik** — A ragos évfolyam, kötőjeles tartomány és üres keresőkifejezés szélei a #142 jegy alapján nyitottak.
- **Folytatás helye** — origin/main, #459, #465, #494 · `source/tests/material-title.spec.ts:8`
- **Következő lépés** — A source/shared/material-title.ts és a material-title.test.ts kapjon táblázatos próbát kész osztályfeliratra, hiányzó feliratra, tartományra és üres szűrőre.
- **Függőség / ütközés** — C219 a hiányzó megjelenítést kéri javítani, nem az egész állomány címének átírását.
- **Kapcsolódó P-tétel** — P-026

### R-UTAS-090 · Szólétra olvasási idő és célszó

- **Azonosító** — R-UTAS-090
- **Cím** — Szólétra olvasási idő és célszó
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot.
- **Eredeti utasítás / cél** — A Szólétrában legyen több olvasási idő és a célzott szó könnyen megtalálható legyen.
- **Forrás** — C241 (2026-11-17, 1359. sor)
- **Mi van kész** — A #498 és #500 javította a tempót, a kiemelést és a hosszú válaszpanelt. #498 (`e0dba1db`), #500 (`99c6dc29`), `source/tests/word-ladder-readability.spec.ts:28`.
- **Mi hiányzik** — A november 19-i D-05 pontosítás a célszót a mondatban, sárga címkeként kéri, külön nagy kártya nélkül.
- **Folytatás helye** — origin/main, #498, #500 · `source/tests/word-ladder-readability.spec.ts:28`
- **Következő lépés** — A source/client/src/pages/WordLadderHuEn.tsx megjelenítését a D-05 szerint módosítsd. A word-ladder-readability.spec.ts próbáljon hosszú mondatot keskeny kijelzőn és nyugodt tempón.
- **Függőség / ütközés** — Az árnyék és a tárgyrag külön megfigyelés.
- **Kapcsolódó P-tétel** — P-011, P-012

### R-UTAS-091 · Kockavadász akadozik kihajtott telefonon

- **Azonosító** — R-UTAS-091
- **Cím** — Kockavadász akadozik kihajtott telefonon
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot.
- **Eredeti utasítás / cél** — A Kockavadász maradjon folyamatos a kihajtott Honor Magic V6-on bányászás közben is.
- **Forrás** — C242 (2026-11-17, 1363. sor), C243 (2026-11-17, 1367. sor), C244 (2026-11-17, 1371. sor), C245 (2026-11-17, 1375. sor), C246 (2026-11-17, 1379. sor), C250 (2026-11-17, 1399. sor), C262 (2026-11-18, 1460. sor)
- **Mi van kész** — A #491 stabilizálta a kérdésbank referenciáját. A #504 nyitott ágon könnyíti a renderelést és mérőpanelt ad. C250 és C262 továbbra is erős akadozást jelzett. #470 (`66b67317`), #491 (`2b873e3c`), `source/tests/material-quizzes-hook-memo.test.ts:66`.
- **Mi hiányzik** — A világ újraépítésének tényleges költsége és a kiadott javítás eredménye az eredeti készüléken nincs igazolva.
- **Folytatás helye** — #504, source/client/src/pages/BlockCraftQuiz.tsx
- **Következő lépés** — A source/client/src/pages/BlockCraftQuiz.tsx bányászási útján mérd az újraépített darabokat és a képkockaidő eloszlását azonos felbontáson. A #504-et összevonás előtt ugyanezen a készüléken mérd vissza.
- **Függőség / ütközés** — A tulajdonosi okfeltételezés különbözik a #491-ben bizonyított gyökéroktól.
- **Kapcsolódó P-tétel** — P-001, P-004

### R-UTAS-097 · Cloudflare-hitelesítés és DNS

- **Azonosító** — R-UTAS-097
- **Cím** — Cloudflare-hitelesítés és DNS
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Állapítsuk meg, miért nem működött a Cloudflare-belépés, illetve változott-e a DNS-adat.
- **Forrás** — C257 (2026-11-18, 1431. sor), C258 (2026-11-18, 1435. sor), C259 (2026-11-18, 1439. sor)
- **Mi van kész** — C258 belépési hibát és lehetséges címváltozást jelzett. C259 szerint a VPN-t kikapcsolták. A leállás, hibás módosítás vagy támadás egyike sem igazolt. `source/README-CLOUDFLARE.md:1`.
- **Mi hiányzik** — Hiányzik a szolgáltatói hitelesítési esemény és a DNS-változás időbélyeges előtte–utána összevetése.
- **Folytatás helye** — origin/main · `source/README-CLOUDFLARE.md:1`
- **Következő lépés** — A source/README-CLOUDFLARE.md alapján külön hasonlítsd össze a működő rekordot, a változástörténetet és a szolgáltatói belépést. Jogosult tesztfiókkal ellenőrizd az elérést. A jelentésbe csak az okkategória kerüljön.
- **Függőség / ütközés** — A WEBSULI admin Google-belépése és a DNS-szolgáltató belépése két külön rendszer.
- **Kapcsolódó P-tétel** — —

### R-UTAS-099 · Szökőár helyett autóborogatás és akadás

- **Azonosító** — R-UTAS-099
- **Cím** — Szökőár helyett autóborogatás és akadás
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot.
- **Eredeti utasítás / cél** — A Szökőár témája legyen ismét felismerhető és mobilon fusson folyamatosan.
- **Forrás** — C262 (2026-11-18, 1460. sor)
- **Mi van kész** — A #483 sávos futót és kapukérdést vezetett be. A fix/szokoar-tema-es-sebesseg ágon e1332ec7 a tartalék kirajzolást és az újrakezdést is módosítja. #483 (`a11b1b79`), #491 (`2b873e3c`), `source/tests/tsunami-core.test.ts:63`.
- **Mi hiányzik** — A téma- és sebességjavító ág nincs a vizsgált mainen. A valós kihajtott kijelző végső eredménye nem ismert.
- **Folytatás helye** — fix/szokoar-tema-es-sebesseg @ e1332ec7
- **Következő lépés** — Az ági tsunami megjelenítést vesd össze a főági source/client/src/lib/tsunami/core.ts menettel. Telefonon ellenőrizd a hullám, a menekülési cél, az akadályok és a képkockaidő változását.
- **Függőség / ütközés** — A #514 stabil e2e-mérése önmagában nem bizonyít eszközön mért gyorsulást.
- **Kapcsolódó P-tétel** — P-005, P-013

### R-UTAS-103 · Figyelmen kívül maradó forrásábrák

- **Azonosító** — R-UTAS-103
- **Cím** — Figyelmen kívül maradó forrásábrák
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A PDF ábráinak és folyamatainak jelentése kerüljön át a leckébe, az OCR mellett.
- **Forrás** — C265 (2026-11-18, 1474. sor), C266 (2026-11-18, 1484. sor)
- **Mi van kész** — A #515 vizuális leltárt, fedettségi kaput és megjelenítőket adott. A source-visuals kapcsoló alapból ki van kapcsolva. #515 (`f756588c`), `source/tests/source-visuals-flag.test.ts:32`.
- **Mi hiányzik** — A két eredeti forrásból a kiadott leckéig nincs bemutatott, teljes képi egyezés. Az enforce hibakezelésének D-03 döntése is ellenőrzendő.
- **Folytatás helye** — origin/main, #515 · `source/tests/source-visuals-flag.test.ts:32`
- **Következő lépés** — A #515 forrásleltár- és renderpróbáit bővítsd dátumelöljárós és mennyiségi nyelvtani ábrával. Kövesd a forráshivatkozást a kész fejezetig. kapuhibánál igazold a piszkozatot és az értesítést.
- **Függőség / ütközés** — C266 visszavonta a véletlen diktálási töredéket.
- **Kapcsolódó P-tétel** — P-028, P-033, P-066

### R-UTAS-104 · Monoton lecketartalom

- **Azonosító** — R-UTAS-104
- **Cím** — Monoton lecketartalom
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A lecke szövegében, formájában és ábráiban legyen pedagógiailag indokolt változatosság.
- **Forrás** — C265 (2026-11-18, 1474. sor)
- **Mi van kész** — A SK2 ágon ba3d431c már magában foglalja az S6c ábrafajta-munkát. A #515 főági változása a vizuális lánc. #515 (`f756588c`), `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md:1`.
- **Mi hiányzik** — A változatossági mérő, a szövegváltozatok és az ábrák éles bekötése, valamint a tényleges monotonitás csökkenése nyitott.
- **Folytatás helye** — feat/tgm-sk2-valtozatossag-kapu @ ba3d431c
- **Következő lépés** — A feat/tgm-sk2-valtozatossag-kapu ágat vesd össze a docs/specs/2026-11-18-tananyag-gyartas-minoseg.md S5–S6 feltételeivel. Két különböző típusú leckén ellenőrizd a változatosságot és a változatlan tényfedettséget.
- **Függőség / ütközés** — 2026-11-20-i prioritáspontosítás a lesson-variety-priority.md memóriában.
- **Kapcsolódó P-tétel** — P-030

### R-UTAS-105 · Brit hang és későn induló felolvasás

- **Azonosító** — R-UTAS-105
- **Cím** — Brit hang és későn induló felolvasás
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P1. A nyelvlecke egyik tanulási feladata válik nehezen használhatóvá.
- **Eredeti utasítás / cél** — A természetes brit felolvasás szólaljon meg gyorsan. A megnyitott lecke hangjai készüljenek elő.
- **Forrás** — C265 (2026-11-18, 1474. sor), C272 (2026-11-18, 1508. sor)
- **Mi van kész** — A #516 hangrangsoroló, hangtár és előtöltő lánca mainen van. A D-01 a néma próbát elhagyta és jóváhagyta a tárplafonokat. #516 (`b7165a56`), `source/tests/speech-preload.test.ts:19`.
- **Mi hiányzik** — Az előre gyártott hangok tényleges teljessége, a brit hangminőség és a jelzett 3–6 másodperces indulási késés megszűnése nincs igazolva.
- **Folytatás helye** — origin/main, #516 · `source/tests/speech-preload.test.ts:19`
- **Következő lépés** — A source/shared/speech-preload.ts és a speech-chain próbáján mérj első és második lejátszást hideg/meleg gyorsítótárral valódi mobilon. Brit mintán külön ellenőrizd a választott hangot és a hiány esetén használt tartalékot.
- **Függőség / ütközés** — A játékhang előmelegítése P-040, másik út.
- **Kapcsolódó P-tétel** — P-032, P-064

### R-UTAS-107 · Szürke folt a maki orránál

- **Azonosító** — R-UTAS-107
- **Cím** — Szürke folt a maki orránál
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. A változtatás a megjelenítést pontosítja.
- **Eredeti utasítás / cél** — A maki orra mögötti szürke folt ne keltsen lebegő orr benyomását.
- **Forrás** — C274 (2026-11-18, 1516. sor)
- **Mi van kész** — A 2026-11-19-i D-12 döntés a modell és az orrfolt képes ellenőrzéséhez köti a bekapcsolást.
- **Mi hiányzik** — A pontos megfigyelésre nincs azonos nézetű előtte–utána elfogadási bizonyíték.
- **Folytatás helye** — feat/kabala-fooldal @ 80f4c6cc, source/scripts/blender/kabala-maki/maki_model.py
- **Következő lépés** — A feat/kabala-fooldal ági képanyagon azonos kamerával és átlátszó háttérrel hasonlítsd a két változatot. Mobilméretben ellenőrizd az orr csatlakozását a gazdagép hátterén.
- **Függőség / ütközés** — P-007, D-12.
- **Kapcsolódó P-tétel** — P-007

### R-UTAS-108 · Jobbkezes joystick és bal oldali tűzgomb

- **Azonosító** — R-UTAS-108
- **Cím** — Jobbkezes joystick és bal oldali tűzgomb
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot.
- **Eredeti utasítás / cél** — A joystick legyen jobb kéznél, a tűz és az egyéb műveletek bal oldalon.
- **Forrás** — C275 (2026-11-18, 1520. sor)
- **Mi van kész** — A feat/joystick-jobb-kez ágon fc012178 már az új kiosztás őrét tartalmazza. A #456 a holtsávot javította. #456 (`9038fce2`), `source/tests/joystick-response.spec.ts:25`.
- **Mi hiányzik** — A jobbkezes kiosztás és az összes érintett játék közös telefonos próbája nincs mainen.
- **Folytatás helye** — feat/joystick-jobb-kez @ fc012178
- **Következő lépés** — Az ág változásait a source/client/src/game-engine/joystick.ts fogyasztóin vedd át. Jobbkezes szimulált érintéssel és valós telefonnal próbálj egyszerre mozogni és tüzelni, álló és fekvő nézetben.
- **Függőség / ütközés** — A joystick megtartását C229 kifejezetten kéri.
- **Kapcsolódó P-tétel** — P-006

### R-UTAS-113 · Olvashatatlan árnyékolt szöveg

- **Azonosító** — R-UTAS-113
- **Cím** — Olvashatatlan árnyékolt szöveg
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot.
- **Eredeti utasítás / cél** — A Szólétra felirata árnyékolás mellett is legyen jól olvasható telefonon.
- **Forrás** — C290 (2026-11-19, 1580. sor)
- **Mi van kész** — A #498 és #500 a tempót és a panelt javította. A source/client/src/pages/WordLadderHuEn.tsx:1744 még sötét szövegárnyékot alkalmaz. #498 (`e0dba1db`), #500 (`99c6dc29`), `source/client/src/pages/WordLadderHuEn.tsx:1744`.
- **Mi hiányzik** — Az érintett felirat árnyékának megszüntetése és a repro állapotban igazolt kontraszt hiányzik a főágról.
- **Folytatás helye** — origin/main, #498, #500 · `source/client/src/pages/WordLadderHuEn.tsx:1744`
- **Következő lépés** — A 1744. sor stílusán a problémás állapothoz igazítsd az árnyékot és az alapszínt. A word-ladder-readability.spec.ts telefonos nézetében azonos fonthoz és háttérhez hasonlítsd az előtte–utána képet.
- **Függőség / ütközés** — D-16 (2026-11-19) a P1-blokk utánra tette, felülírva a teljes sor végére hagyást.
- **Kapcsolódó P-tétel** — P-011

### R-UTAS-114 · Hibás tárgyrag a Szólétrában

- **Azonosító** — R-UTAS-114
- **Cím** — Hibás tárgyrag a Szólétrában
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Kifejezett játékélmény- vagy tartalmi kérés.
- **Eredeti utasítás / cél** — A győzelmi és előzési üzenetben helyesen szerepeljen a Villámot tárgyeset.
- **Forrás** — C291 (2026-11-19, 1584. sor)
- **Mi van kész** — A játékszereplő neve a WordLadderHuEn.tsx:148 szerint Villám. A :808 és :1816 egyszerű t betűt fűz hozzá. #454 (`d5c91060`), `source/client/src/pages/WordLadderHuEn.tsx:1816`.
- **Mi hiányzik** — Mindkét üzenet hibásan ragoz a vizsgált mainen.
- **Folytatás helye** — origin/main, #454 · `source/client/src/pages/WordLadderHuEn.tsx:1816`
- **Következő lépés** — A source/client/src/pages/WordLadderHuEn.tsx mindkét ágában használd a helyes tárgyesetet. A győzelmi képernyő és az előzési sáv szövegét is ellenőrizd böngészőben.
- **Függőség / ütközés** — A fiktív rivális neve termékszöveg.
- **Kapcsolódó P-tétel** — P-011

### R-UTAS-115 · Megszakadó mobilos munkamenet

- **Azonosító** — R-UTAS-115
- **Cím** — Megszakadó mobilos munkamenet
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Derüljön ki, miért szakad meg a telefonon látható munkamenet kommunikációja, miközben a helyi munka fut.
- **Forrás** — C292 (2026-11-19, 1588. sor)
- **Mi van kész** — Az üzenet többszöri kiesést ír le. Nem azonosítja a kapcsolatot vagy az okot. `AGENTS.md:1`.
- **Mi hiányzik** — Hiányzik a mobil állapotváltásának és a helyi folyamat eseményeinek közös idővonala.
- **Folytatás helye** — origin/main · `AGENTS.md:1`
- **Következő lépés** — Az AGENTS.md aktív követési eljárásával jelölj egy hosszabb próbaműveletet. Mobil lezárás, hálózatváltás és visszanyitás után hasonlítsd a helyi eseménysorszámot a kliens utolsó eseményéhez.
- **Függőség / ütközés** — Ismeretlen, a külső munkamenet-futtató vagy az alkalmazás érintett-e.
- **Kapcsolódó P-tétel** — —

### R-UTAS-116 · Hosszú hibaüzenetek kitakarási ideje

- **Azonosító** — R-UTAS-116
- **Cím** — Hosszú hibaüzenetek kitakarási ideje
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — A hosszú visszhangzott hibaüzenet kitakarása maradjon korlátos idejű és ne szivárogtasson titkot.
- **Forrás** — C293 (2026-11-19, 1592. sor), C294 (2026-11-19, 1596. sor), C295 (2026-11-19, 1601. sor)
- **Mi van kész** — A #521 nyitott. A fix/kitakaro-negyzetes-regex fej 70067c1d a kapuk, külső ellenőr és képgeneráló szűrését is érinti. #489 (`26bae97f`), `scripts/qa/gates/lib.test.mjs:1`.
- **Mi hiányzik** — Főági integráció és az összes érintett út közös határértékpróbája hiányzik. Ez feltételezett lassulás, nem igazolt éles incidens.
- **Folytatás helye** — #521, fix/kitakaro-negyzetes-regex @ 70067c1d
- **Következő lépés** — A scripts/qa/gates/lib.test.mjs és a source/tests/design-assets.test.ts szintetikus hosszú üzenetén mérd meg a futást, a kimenet hosszát és a maszkolást közvetlenül a vágási határnál is.
- **Függőség / ütközés** — A tévéből áthallott szöveget C294 kizárta.
- **Kapcsolódó P-tétel** — P-049

## Kérések, eljárások és felülírt döntések

### R-UTAS-002 · A forráselemző modellje

- **Azonosító** — R-UTAS-002
- **Cím** — A forráselemző modellje
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A forrás és az eredeti tartalom feldolgozását is Luna végezze.
- **Forrás** — C2 (2026-10-14, 7. sor)
- **Mi van kész** — A #209 a felismerésről, a #262 a teljes új motor modelljeiről rendelkezik. #209 (`8851d417`), #262 (`93c0c642`), `source/tests/single-run-engine.test.ts:82`.
- **Mi hiányzik** — A kizárólagos Luna-előírás 2026-10-16-tól elvesztette a hatályát.
- **Folytatás helye** — origin/main, #209, #262 · `source/tests/single-run-engine.test.ts:82`
- **Következő lépés** — A #262 egyfutásos tesztjében ellenőrizd a forrástól a publikálásig alkalmazott modellpárt.
- **Függőség / ütközés** — C55.
- **Kapcsolódó P-tétel** — —

### R-UTAS-004 · Titkos adatot tartalmazó köztes szövegek

- **Azonosító** — R-UTAS-004
- **Cím** — Titkos adatot tartalmazó köztes szövegek
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint.
- **Eredeti utasítás / cél** — A kulcsot tartalmazó köztes szövegeket és az engedélyszabály nyílt jelszavát távolítsuk el.
- **Forrás** — C6 (2026-10-14, 23. sor), C83 (2026-10-17, 358. sor), C86 (2026-10-17, 370. sor)
- **Mi van kész** — A két üzenet pontosan azonosítja a törlendő szövegek fajtáját. Az AGENTS.md:13 tiltja a titkok közzétételét. A C86 utólagos összefoglalója az engedélyszabály tisztítását elvégzettként írja le; közvetlen visszaolvasást nem tartalmaz. `AGENTS.md:13`.
- **Mi hiányzik** — A nem verziózott engedélyszabály tisztítása és a köztes szövegek eltávolítása nem bizonyítható a mainből.
- **Folytatás helye** — origin/main · `AGENTS.md:13`
- **Következő lépés** — Az engedélyfájl és a megmaradt átadók helyi titokellenőrzésén csak találatszámot rögzíts. Visszaellenőrzéskor ennek nullának kell lennie.
- **Függőség / ütközés** — A jelszó cseréjét a tulajdonos magának tartotta fenn.
- **Kapcsolódó P-tétel** — —

### R-UTAS-008 · A Qwen történeti szerepe

- **Azonosító** — R-UTAS-008
- **Cím** — A Qwen történeti szerepe
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Ha GPT-tartalék írta a leckét, a független Qwen-lektor OpenRouteren high efforton fusson.
- **Forrás** — C20 (2026-10-14, 79. sor), C25 (2026-10-15, 99. sor)
- **Mi van kész** — A docs/specs/2026-10-14-ellentetes-csalad-tartalek.md:8–10 ezt a lektori harmadik családot nevezi meg, a #223 mérési lezárást rögzít. #223 (`3eadcde1`), #262 (`93c0c642`), `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md:8`.
- **Mi hiányzik** — A régi, különálló gyártási modellkiosztást C55 2026-10-16-án felülírta.
- **Folytatás helye** — origin/main, #223, #262 · `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md:8`
- **Következő lépés** — A #223 Qwen-mérését a történeti lektori szerephez rendeld. Az új motorban azt ellenőrizd, hogy a #262 utáni modellpár végzi a közzétételig tartó munkát.
- **Függőség / ütközés** — A forrásgyűjtés GPT-tartalékának B4 szelete külön kérés. A fejlesztési vak ellenőr is más szerep.
- **Kapcsolódó P-tétel** — —

### R-UTAS-013 · A Tételgyár korábbi modellkiosztása

- **Azonosító** — R-UTAS-013
- **Cím** — A Tételgyár korábbi modellkiosztása
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A külön döntőbíró, tesztíró és megoldó korábbi modellkiosztása.
- **Forrás** — C40 (2026-10-15, 159. sor), C42 (2026-10-15, 177. sor), C55 (2026-10-16, 231. sor)
- **Mi van kész** — T7-ben Sol, T2.3-ban MiniMax volt a kiosztás. 2026-10-16-án C55 egy alapmodellt és egy tartalékot kért. #241 (`dec7a71e`), #242 (`5d7c4f8d`), #243 (`9679a1e9`), #258 (`3b6a8eb6`), #262 (`93c0c642`), `source/tests/models-routing.test.ts:24`.
- **Mi hiányzik** — A korábbi külön alügynökök visszakötése meghaladná az érvényes döntést.
- **Folytatás helye** — origin/main, #241, #242, #243, #258, #262 · `source/tests/models-routing.test.ts:24`
- **Következő lépés** — A #258 tesztjén ellenőrizd az Opus elsődleges és Sol tartalék utat, a korábbi T2/T7 teszteken a megőrzött viselkedést.
- **Függőség / ütközés** — A későbbi fejlesztési ellenőr döntése független ettől.
- **Kapcsolódó P-tétel** — —

### R-UTAS-014 · A megengedőbb lektor kiadási feltétele

- **Azonosító** — R-UTAS-014
- **Cím** — A megengedőbb lektor kiadási feltétele
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A megengedőbb lektort csak négy lecke összehasonlító mérése után élesítsük.
- **Forrás** — C40 (2026-10-15, 159. sor)
- **Mi van kész** — A docs/measurements/2026-10-15-t8-lektor-lelek.json tartalmazza a mentett ítéleteket. A #257 célzott bankhibát kezel. A JSON nyolc mérési rekordot tartalmaz. #257 (`a4647fa4`), `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md:143`.
- **Mi hiányzik** — A T8 változat önálló élesítését ez a két bizonyíték nem igazolja.
- **Folytatás helye** — origin/main, #257 · `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md:143`
- **Következő lépés** — A T8 JSON futásonkénti régi és új ítéleteit vesd össze a mai egyfutásos lektorral. A hibás tétel bukjon, a bizonyítottan jó lecke jusson tovább.
- **Függőség / ütközés** — A modellkiosztást C55 megváltoztatta.
- **Kapcsolódó P-tétel** — —

### R-UTAS-019 · Futó, régi gyártás célzott leállítása

- **Azonosító** — R-UTAS-019
- **Cím** — Futó, régi gyártás célzott leállítása
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A régi kóddal futó gyártást állítsuk le, ne induljon újra hibás állapottal.
- **Forrás** — C52 (2026-10-16, 219. sor), C53 (2026-10-16, 223. sor), C54 (2026-10-16, 227. sor), C220 (2026-11-16, 1273. sor)
- **Mi van kész** — A tulajdonos C220-ban egy későbbi megszakítást visszaigazolt. Mainen van leállítási út. #366 (`78a736e6`), `source/tests/workflow-stop.test.ts:6`.
- **Mi hiányzik** — A korábbi konkrét futás leállását és adatállapotát nem támasztja alá a későbbi gomb.
- **Folytatás helye** — origin/main, #366 · `source/tests/workflow-stop.test.ts:6`
- **Következő lépés** — A #366 tervének állapotátmeneteit vesd össze az adott futás eseménysorrendjével. Megszakítás után a régi worker ne írhasson kész állapotot.
- **Függőség / ütközés** — Éles azonosító csak a védett rendszerben használható.
- **Kapcsolódó P-tétel** — —

### R-UTAS-021 · Újrahasznosítható gyakorlóbank

- **Azonosító** — R-UTAS-021
- **Cím** — Újrahasznosítható gyakorlóbank
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Legyen újrahasznosítható tudásbank, a katalógus és a tantárgyi memória jusson el a gyártásig.
- **Forrás** — C58 (2026-10-16, 252. sor), C61 (2026-10-16, 264. sor), C62 (2026-10-16, 268. sor), C63 (2026-10-16, 272. sor), C112 (2026-10-19, 712. sor)
- **Mi van kész** — A fix katalógus kipróbálásáról van visszajátszás, az S5/S6 bekötése alapból kikapcsolható úton megvan. #265 (`5a6aaa1f`), #311 (`91a6b561`), `source/tests/single-run-knowledge.test.ts:111`.
- **Mi hiányzik** — Az általános, állandó feladatbankból való kiválasztás teljes helyettesítő képessége nincs igazolva.
- **Folytatás helye** — origin/main, #265, #311 · `source/tests/single-run-knowledge.test.ts:111`
- **Következő lépés** — A #311 gyártási tesztjét egészítsd ki ismert katalógustalálattal és találat nélküli fejezettel. A fedettséget és az újonnan generált elemek számát hasonlítsd össze.
- **Függőség / ütközés** — C114 külön fizetős A/B-mérést kért.
- **Kapcsolódó P-tétel** — —

### R-UTAS-023 · Olcsó bankmodellek leállított versenye

- **Azonosító** — R-UTAS-023
- **Cím** — Olcsó bankmodellek leállított versenye
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Öt olcsóbb jelölt teljes bankversenye ugyanazon a leckén.
- **Forrás** — C64 (2026-10-16, 280. sor), C66 (2026-10-16, 288. sor)
- **Mi van kész** — C64 felsorolta a Luna, Qwen, DeepSeek, MiniMax és Muse jelölteket. C66 ugyanaznap leállította a mérést a költségek miatt. #265 (`5a6aaa1f`), `source/tests/parallel-bank.test.ts:10`.
- **Mi hiányzik** — A fennmaradó jelöltek lemérése a korábbi döntés része.
- **Folytatás helye** — origin/main, #265 · `source/tests/parallel-bank.test.ts:10`
- **Következő lépés** — A #265 mellé rendeld a bank-model-opus-decision.md mérési döntését. A lezárt futásból ellenőrizd a hibaarányt és az eltelt időt.
- **Függőség / ütközés** — C66 és C68 az irányadó.
- **Kapcsolódó P-tétel** — —

### R-UTAS-025 · Munkamenet archiválási joga

- **Azonosító** — R-UTAS-025
- **Cím** — Munkamenet archiválási joga
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — Munkamenetet csak külön tulajdonosi utasításra lehessen archiválni.
- **Forrás** — C70 (2026-10-16, 304. sor), C86 (2026-10-17, 370. sor)
- **Mi van kész** — A 2026-10-16-i üzenetben az eljárás kifejezett. A C86 megőrizte az automatikus archiválás kikapcsolását kérő futtatóbeállítást. `AGENTS.md:1`.
- **Mi hiányzik** — A helyi futtató archiválási beállítása és eseménynaplója nincs a git-történetben igazolva.
- **Folytatás helye** — origin/main · `AGENTS.md:1`
- **Következő lépés** — Az AGENTS.md munkamenet-szabályát egyeztesd a futtató archiválási műveletével. Eldobható munkamenettel próbáld ki az utasítás nélküli és az engedélyezett esetet.
- **Függőség / ütközés** — Nem érinti a verziózott elavult dokumentáció későbbi takarítását.
- **Kapcsolódó P-tétel** — —

### R-UTAS-027 · Visszavont projektváltás

- **Azonosító** — R-UTAS-027
- **Cím** — Visszavont projektváltás
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. Egyszeri szervezési kérés.
- **Eredeti utasítás / cél** — A tévesen beillesztett külső frissítési és projektváltási utasítás visszavonása.
- **Forrás** — C73 (2026-10-16, 316. sor), C74 (2026-10-16, 322. sor), C75 (2026-10-16, 326. sor)
- **Mi van kész** — C75 2026-10-16-án név szerint visszavonta az előző üzenetet és a WEBSULI-designt jelölte ki. `docs/specs/2026-10-17-websuli-ikonkeszlet.md:1`.
- **Mi hiányzik** — A külső projekt frissítése kiesett a megbízásból.
- **Folytatás helye** — origin/main · `docs/specs/2026-10-17-websuli-ikonkeszlet.md:1`
- **Következő lépés** — A design lezárását a #274 változásaival ellenőrizd. A visszavont beillesztést tartsd kívül a feladatlistán.
- **Függőség / ütközés** — A későbbi, önálló fényképezési átvétel C193 más kérés.
- **Kapcsolódó P-tétel** — —

### R-UTAS-036 · Régi anyagok tartalmi lektorálása

- **Azonosító** — R-UTAS-036
- **Cím** — Régi anyagok tartalmi lektorálása
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A szeptemberig készült anyagok tartalmát olcsó lektor vizsgálja, csak megerősített hibát javítson, a kinézet maradjon meg.
- **Forrás** — C102 (2026-10-18, 672. sor), C103 (2026-10-18, 676. sor)
- **Mi van kész** — A #299 tömeges tartalmi lektorálót, a #327 javított okosítási utat adott. #299 (`9f82f1e6`), #323 (`17e98afa`), #327 (`666f62d0`), `source/tests/content-review-lib.test.ts:9`.
- **Mi hiányzik** — Az összes szeptemberig készült anyag lezárt, visszaolvasott lektori eredménye hiányzik. A korábbi HTML-ek tömeges migrációja más halmaz.
- **Folytatás helye** — origin/main, #299, #323, #327 · `source/tests/content-review-lib.test.ts:9`
- **Következő lépés** — A #299 futási összesítőjét a dátum szerint kiválasztott katalógussal párosítsd. Hiányzó rekordnál először egy mentett példányon ellenőrizd a tartalmi diffet és a visszaállítást.
- **Függőség / ütközés** — P-059 a migrált anyagokra is vonatkozik.
- **Kapcsolódó P-tétel** — P-059

### R-UTAS-039 · Tudásbank A/B azonos térképen

- **Azonosító** — R-UTAS-039
- **Cím** — Tudásbank A/B azonos térképen
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A tudásbank KI/BE hatását páros futással mérjük meg, majd ismételjük azonos térképen.
- **Forrás** — C112 (2026-10-19, 712. sor), C113 (2026-10-19, 716. sor), C114 (2026-10-19, 720. sor), C116 (2026-10-19, 730. sor), C201 (2026-11-02, 1195. sor)
- **Mi van kész** — A lesson-trial-harness.md rögzíti az első párt: 18,1 és 15,2 perc, eltérő 23 és 19 fogalommal. A #311-ben külön tudáskapcsoló van. #311 (`91a6b561`), `source/tests/single-run-knowledge.test.ts:111`.
- **Mi hiányzik** — A torzítatlan második pár eredménye nem igazolt. A történeti 1120 jegy újrafuttatását a 2026-11-02-i tulajdonosi döntés lezárta.
- **Folytatás helye** — origin/main, #311 · `source/tests/single-run-knowledge.test.ts:111`
- **Következő lépés** — A #311 kapcsoló mögötti bekötést a single-run-knowledge próbájában ellenőrizd KI/BE értékkel. Jelöld a leltárban a dokumentációs eltérést. új fizetős méréshez új döntés kell.
- **Függőség / ütközés** — A docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:13 okafogyottként zárja le. Indoklása az útvonal hiányáról feszültségben áll a #311 kapcsoló mögötti kóddal.
- **Kapcsolódó P-tétel** — P-059

### R-UTAS-040 · Külső review-szolgáltató hatóköre

- **Azonosító** — R-UTAS-040
- **Cím** — Külső review-szolgáltató hatóköre
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A külső review-szolgáltatás megfelelő fiókkal a teljes változtatást lássa.
- **Forrás** — C115 (2026-10-19, 726. sor), C117 (2026-10-19, 734. sor), C125 (2026-10-19, 776. sor)
- **Mi van kész** — A #306 dokumentálja a review körét, C125 az előfizetési szint emelését közli. #306 (`cbaf3fbf`), `docs/specs/2026-10-18-atfogo-review.md:1`.
- **Mi hiányzik** — A szolgáltatás tényleges beállítása és a teljes PR lefedése a repóból nem olvasható ki.
- **Folytatás helye** — origin/main, #306 · `docs/specs/2026-10-18-atfogo-review.md:1`
- **Következő lépés** — A #306 alapján egy változatlan PR felületén olvasd vissza az ellenőri hatókört és a vizsgált fájlokat. Az eredményt az AGENTS.md review-szabályával egyeztesd.
- **Függőség / ütközés** — A külső review és a kötelező vak ellenőr eltérő feladat.
- **Kapcsolódó P-tétel** — —

### R-UTAS-049 · Mobilról elérhető képek

- **Azonosító** — R-UTAS-049
- **Cím** — Mobilról elérhető képek
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. Egyszeri szervezési kérés.
- **Eredeti utasítás / cél** — A kért képek legyenek telefonról letölthetők, Drive-on közvetlen linkkel.
- **Forrás** — C132 (2026-10-19, 810. sor), C133 (2026-10-19, 814. sor)
- **Mi van kész** — A 2026-10-19-i C133 elfogadta a Drive-os átadást. `docs/lesson-improvement.md:1`.
- **Mi hiányzik** — A képek készlete és a működő átadás nyugtája nem szerepel a három exportban.
- **Folytatás helye** — origin/main · `docs/lesson-improvement.md:1`
- **Következő lépés** — A C132–C133 átadási nyugtáját a képek készletével egyeztesd. Jogosult próbafiókkal nyiss meg egy fájlt mobilon. egy belépés nélkül elérhető másolatot ne tekints magánátadásnak.
- **Függőség / ütközés** — A Drive-hivatkozást ne publikáld.
- **Kapcsolódó P-tétel** — —

### R-UTAS-052 · Neon-minimum és erőforrásmérés

- **Azonosító** — R-UTAS-052
- **Cím** — Neon-minimum és erőforrásmérés
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Csökkenjen a tárhely, adatbázis és modellhasználat költsége, Neon minimuma 0,25 CU legyen.
- **Forrás** — C135 (2026-10-19, 826. sor), C136 (2026-10-19, 830. sor), C137 (2026-10-19, 834. sor), C139 (2026-10-19, 842. sor)
- **Mi van kész** — Ritkább időzítők, kisebb listák, indulási mentés optimalizálása és promptcache mainen. A 0,25 CU döntést a docs/specs/2026-10-19-eroforras-s1.md:41 rögzíti. #324 (`dc6192c6`), #325 (`e1cc81c5`), #328 (`1783d5f8`), #329 (`2cc1204c`), `source/tests/resource-s1.test.ts:12`.
- **Mi hiányzik** — Az aktuális szolgáltatói minimum és az összes végpont terhelésének összehasonlítható mérése hiányzik.
- **Folytatás helye** — origin/main, #324, #325, #328, #329 · `source/tests/resource-s1.test.ts:12`
- **Következő lépés** — A #324 bevezetése előtti és utáni üresjárati CU-órát, listaválaszméretet és DB-olvasást hasonlítsd össze, a szolgáltatói minimumot csak olvasd vissza.
- **Függőség / ütközés** — C137 a futó gyártás megóvását írta elő.
- **Kapcsolódó P-tétel** — P-053

### R-UTAS-053 · Futó gyártás védelme telepítéskor

- **Azonosító** — R-UTAS-053
- **Cím** — Futó gyártás védelme telepítéskor
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Telepítéskor a futó tananyaggyártást védje előzetes ellenőrzés.
- **Forrás** — C137 (2026-10-19, 834. sor), C141 (2026-10-20, 851. sor), C152 (2026-10-20, 895. sor), C86 (2026-10-17, 370. sor)
- **Mi van kész** — A szerver leálláskor vár a munkára, a #473 a telepítés előtti őrt dokumentálja. #324 (`dc6192c6`), #473 (`2c21484b`), `docs/telepites-elotti-or.md:1`.
- **Mi hiányzik** — Az összes kiadási út kötelező ellenőrzése és az aktuális szolgáltatói konfiguráció egyezése nyitott.
- **Folytatás helye** — origin/main, #324, #473 · `docs/telepites-elotti-or.md:1`
- **Következő lépés** — A scripts/qa/active-runs-guard.sh használatát vesd össze a docs/telepites-elotti-or.md útvonalaival. Szimulált élő bérletnél a deploy várjon, lezárás után továbbmehessen.
- **Függőség / ütközés** — P-052.
- **Kapcsolódó P-tétel** — P-052

### R-UTAS-056 · Költség és minőség ötös ciklusonként

- **Azonosító** — R-UTAS-056
- **Cím** — Költség és minőség ötös ciklusonként
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Ciklusonként legyen azonos minőségi és költségkimutatás, a promptok és a cache valódi megtakarítása látszódjon.
- **Forrás** — C154 (2026-10-21, 905. sor), C155 (2026-10-21, 909. sor), C156 (2026-10-21, 913. sor), C157 (2026-10-21, 917. sor), C158 (2026-10-21, 921. sor), C161 (2026-10-21, 935. sor)
- **Mi van kész** — A cikluskapu és a cache-barát szerkezet megvan. A legacy-migration-cycles.md:12 átlagot is közöl. A #373 ellenőrzési kísérletének döntése medium maradt. #329 (`2cc1204c`), #352 (`75cd6e74`), #355 (`9903713e`), #373 (`333bfcd4`), `source/tests/resource-s3a.test.ts:18`.
- **Mi hiányzik** — Minden ciklus összehasonlítható teljes adatsora és a csökkenő költség változatlan minőség mellett nincs egy helyen igazolva.
- **Folytatás helye** — origin/main, #329, #352, #355, #373 · `source/tests/resource-s3a.test.ts:18`
- **Következő lépés** — A #352 ciklusaihoz párosítsd a token-, idő-, javítókör- és minőségi mutatókat. Egy táblában külön mutasd a promptcache és a lerövidített kimenet megtakarítását.
- **Függőség / ütközés** — Az egyes leckék eltérő hossza torzíthatja az átlagot.
- **Kapcsolódó P-tétel** — —

### R-UTAS-057 · Célzott szülői adminjog

- **Azonosító** — R-UTAS-057
- **Cím** — Célzott szülői adminjog
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint.
- **Eredeti utasítás / cél** — A külön engedélyezett szülői fiókok a WEBSULI-adminban tudjanak tananyagot készíteni és fényképet használni.
- **Forrás** — C159 (2026-10-21, 925. sor), C160 (2026-10-21, 931. sor), C194 (2026-10-31, 1167. sor)
- **Mi van kész** — A jogosultsági mátrix és az admin engedélylista létezik, az októberi első bővítést korabeli memória említi. #445 (`9bda1373`), #462 (`015b5a9a`), `source/tests/admin-allowlist-db.integration.ts:62`.
- **Mi hiányzik** — A konkrét fiókok aktuális hozzáférése és a második meghívás sikeressége privát szolgáltatói állapot.
- **Folytatás helye** — origin/main, #445, #462 · `source/tests/admin-allowlist-db.integration.ts:62`
- **Következő lépés** — A source/server/admin-users.ts engedélylistáját jogosult kezelő ellenőrizze. Egy engedélyezett és egy hétköznapi próbafiókkal teszteld a készítőoldalt és a kamerát, azonosító rögzítése nélkül.
- **Függőség / ütközés** — A GitHub-hozzáférést C160 külön kezeli.
- **Kapcsolódó P-tétel** — —

### R-UTAS-061 · Hallásszervről szóló állítás ellenőrzése

- **Azonosító** — R-UTAS-061
- **Cím** — Hallásszervről szóló állítás ellenőrzése
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A hallásról szóló anatómiai állítást ellenőrizzük és csak tévedés esetén javítsuk a leckében.
- **Forrás** — C170 (2026-10-21, 974. sor)
- **Mi van kész** — A tulajdonos feltételes ellenőrzést kért, a futások megszakítása nélkül. `docs/lesson-improvement.md:1`.
- **Mi hiányzik** — A kérdéses publikált mondat és a forrással összevetett döntés nem szerepel az exportokban.
- **Folytatás helye** — origin/main · `docs/lesson-improvement.md:1`
- **Következő lépés** — A docs/lesson-improvement.md szerint keresd vissza a tényleges mondatot és a forrásoldalt. A szakmai állítás ellenőrzése után csak igazolt eltérésnél javíts, majd olvasd vissza a leckét.
- **Függőség / ütközés** — Nem szabad a felvetést eleve tényhibának venni.
- **Kapcsolódó P-tétel** — —

### R-UTAS-063 · Osztályváltás teljes újragyártás nélkül

- **Azonosító** — R-UTAS-063
- **Cím** — Osztályváltás teljes újragyártás nélkül
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A megfelelő lecke besorolása ötödikről hatodikra átírható legyen újragyártás nélkül.
- **Forrás** — C173 (2026-10-22, 986. sor)
- **Mi van kész** — Van leállítási művelet és következetes Stúdió-évfolyammódosítás. #366 (`78a736e6`), #465 (`fe7c89fb`), `source/tests/material-classroom-db.integration.ts:66`.
- **Mi hiányzik** — Az októberi konkrét történelmi lecke leállítását és visszaolvasott új besorolását nem igazolja a későbbi általános javítás.
- **Folytatás helye** — origin/main, #366, #465 · `source/tests/material-classroom-db.integration.ts:66`
- **Következő lépés** — A #465 adminútján mintaleckén változtass csak évfolyamot. A régi és új címke, a változatlan tartalom és a nulla új gyártási job legyen a próba feltétele.
- **Függőség / ütközés** — C173 a tartalmat megfelelőnek mondta.
- **Kapcsolódó P-tétel** — —

### R-UTAS-064 · Másodlagos tanulói cím és párosítás

- **Azonosító** — R-UTAS-064
- **Cím** — Másodlagos tanulói cím és párosítás
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A kiválasztott tanuló kiegészítő iskolai címére is működjön a párosítás és az újlecke-értesítés.
- **Forrás** — C174 (2026-10-22, 990. sor), C175 (2026-10-22, 994. sor), C176 (2026-10-22, 998. sor), C183 (2026-10-22, 1052. sor)
- **Mi van kész** — Létezik az egyszeri publikálási értesítő és a párosítási folyamat. #301 (`e4d9644c`), #365 (`51d55dee`), `source/tests/uj-lecke-ertesito.test.ts:7`.
- **Mi hiányzik** — A konkrét cím rögzítése, a kézbesítés és a két cím azonos tanulóhoz kötése nincs ellenőrizve.
- **Folytatás helye** — origin/main, #301, #365 · `source/tests/uj-lecke-ertesito.test.ts:7`
- **Következő lépés** — A #365 küldőjét két címes szintetikus tanulóval, a #301 párosítását mindkét címre teszteld. A korábbi szállítás nyugtáját privát felületen olvasd vissza.
- **Függőség / ütközés** — C176 kizárta a tömeges átalakítás utólagos 178 értesítőjét.
- **Kapcsolódó P-tétel** — —

### R-UTAS-065 · Vercel–Neon konfiguráció

- **Azonosító** — R-UTAS-065
- **Cím** — Vercel–Neon konfiguráció
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — A Vercel-környezetben a szükséges Neon-kapcsolat működjön.
- **Forrás** — C180 (2026-10-22, 1017. sor)
- **Mi van kész** — Az üzenet a műveletet engedélyezi. A szolgáltatói titok jelenlétéről nincs értékmentes nyugta a főágon. #307 (`301ca824`), `source/vercel.json:1`.
- **Mi hiányzik** — Az érintett környezet, a változónév és a működő kapcsolat együttes igazolása hiányzik.
- **Folytatás helye** — origin/main, #307 · `source/vercel.json:1`
- **Következő lépés** — A deploy dokumentáció és a szolgáltatói változónevek alapján végezz jogosult olvasási kapcsolatpróbát. A jelentés csak környezetet és sikerállapotot tartalmazzon.
- **Függőség / ütközés** — A tényleges értéket ne exportáld.
- **Kapcsolódó P-tétel** — —

### R-UTAS-066 · Szolgáltatói PHP-értesítés érintettsége

- **Azonosító** — R-UTAS-066
- **Cím** — Szolgáltatói PHP-értesítés érintettsége
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint.
- **Eredeti utasítás / cél** — A tárhelyszolgáltató PHP-biztonsági értesítésének WEBSULI-érintettsége tisztázandó.
- **Forrás** — C182 (2026-10-22, 1025. sor)
- **Mi van kész** — C182 továbbított értesítés, önmagában nem igazol érintett komponenst. A korábbi VPS-dokumentáció archívumban is létezik. `render.yaml:1`.
- **Mi hiányzik** — A futó szolgáltatások PHP-használata és javítási szintje nincs bizonyítva.
- **Folytatás helye** — origin/main · `render.yaml:1`
- **Következő lépés** — A render.yaml szolgáltatáslistáját vesd össze a kezelt hosztok csomagleltárával. Érintett hosztnál az üzemeltető ellenőrizze a telepített javítás verzióját.
- **Függőség / ütközés** — A levél önmagában nem adott engedélyt éles módosításra.
- **Kapcsolódó P-tétel** — —

### R-UTAS-068 · Rubrikaszigorítás egyhetes hatása

- **Azonosító** — R-UTAS-068
- **Cím** — Rubrikaszigorítás egyhetes hatása
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — Az S3c szigorítás egyhetes tanulói hatását névtelenül mérjük vissza.
- **Forrás** — C190 (2026-10-30, 1080. sor)
- **Mi van kész** — A szigorítás, jelölés, feladatszintű mérés és lazítás kódja főágon van. #338 (`6c7932e2`), #339 (`8c98c2bd`), #340 (`2d12cf7d`), `source/tests/s4-feladat-eredmeny.test.ts:16`.
- **Mi hiányzik** — Az október 30-i ütemezett feladat kész jelentését és mintaszámait nem igazolja a feladatleírás.
- **Folytatás helye** — origin/main, #338, #339, #340 · `source/tests/s4-feladat-eredmeny.test.ts:16`
- **Következő lépés** — A source/server/task-results.ts mérései alapján hasonlítsd a szigorított és a többi feladatot. Tíz kör vagy közreműködő alatt jelölj kis mintát. Vizsgáld a 15 százalékpontos és 40%-os gyanúküszöböt, hiányzó táblánál a C190 aggregált e-mailes pótmérését.
- **Függőség / ütközés** — Csak olvasó, anonimizált kimutatás.
- **Kapcsolódó P-tétel** — —

### R-UTAS-073 · Azonosítatlan két fogalom

- **Azonosító** — R-UTAS-073
- **Cím** — Azonosítatlan két fogalom
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A régi 1118-as jegy két függő fogalma kapjon döntést.
- **Forrás** — C201 (2026-11-02, 1195. sor)
- **Mi van kész** — A docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:14 november 2-i felmérése szerint az érintett lecke a táblákból és mentésekből is hiányzott, a tulajdonosi döntés a jegyet lezárta. `docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:14`.
- **Mi hiányzik** — A keresett régi lecke további javítása tárgytalanná vált. Az új #13 külön halmaz.
- **Folytatás helye** — origin/main · `docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:14`
- **Következő lépés** — A november 2-i archív sor lezárását rendeld a régi 1118-hoz. Az új #13 eredményét a hat térkép döntési naplójából, külön ellenőrizd.
- **Függőség / ütközés** — Külön ügy a későbbi 62 függő fogalom.
- **Kapcsolódó P-tétel** — —

### R-UTAS-074 · A 62 függő fogalom sorsa

- **Azonosító** — R-UTAS-074
- **Cím** — A 62 függő fogalom sorsa
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A 62 függő fogalomról a tanári elutasítási döntés érvényesüljön.
- **Forrás** — C203 (2026-11-02, 1203. sor), C204 (2026-11-02, 1207. sor)
- **Mi van kész** — C204 az elutasítást választja. A docs/specs/2026-11-10-gyartas-meres.md:113 továbbra is tanári átnézést említ. A docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:15 hat térképen rögzítette a 62 függő fogalmat. `docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:15`.
- **Mi hiányzik** — Az adminművelet tényleges alkalmazása és az érintett halmaz egyezése nem látszik a mainen.
- **Folytatás helye** — origin/main · `docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:15`
- **Következő lépés** — A korabeli függő lista elemszámát egyeztesd a döntési naplóval, majd ellenőrizd az elutasított státuszok számát. Az újabban függő fogalmakat ne vond a régi döntés alá.
- **Függőség / ütközés** — A történeti és az exportált jelenlegi kanbanszámok újrahasznosulhatnak.
- **Kapcsolódó P-tétel** — —

### R-UTAS-075 · Mobilos játékélmény és tanulás

- **Azonosító** — R-UTAS-075
- **Cím** — Mobilos játékélmény és tanulás
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Kifejezett játékélmény- vagy tartalmi kérés.
- **Eredeti utasítás / cél** — Mindegyik telefonos játékban maga a játék, a győzelem és a pontszerzés vigye előre a tanulást.
- **Forrás** — C205 (2026-11-15, 1211. sor), C208 (2026-11-16, 1223. sor), C210 (2026-11-16, 1233. sor)
- **Mi van kész** — Közös mobilkeret, nem blokkoló kérdéssáv és több játszható vertikális szelet van. A J0–J9 terv a korábbi mobilmodernizálásnál tovább megy. #419 (`bf100e9f`), #422 (`050778d5`), #438 (`86a39ae2`), #440 (`d1794c91`), #444 (`bf804bfb`), #446 (`57bd1b0e`), #466 (`24add8b6`), #483 (`a11b1b79`), #485 (`b4b84db6`), `source/tests/game-question-director.test.ts:120`.
- **Mi hiányzik** — A későbbi játékmenet-szeletek és az összes játék együttes, valós telefonos elfogadása hiányos.
- **Folytatás helye** — origin/main, #419, #422, #438, #440, #444, #446, #466, #483, #485 · `source/tests/game-question-director.test.ts:120`
- **Következő lépés** — A #440 végrehajtási tervében játékonként kövesd a belépést, tanulási kérdést, ellenfelet, pontot és menet végét. Először a nyitott #484 és #486 viselkedését hasonlítsd a mainhez.
- **Függőség / ütközés** — A korábbi mobilos S13 lezárása nem zárja a J-sorozatot.
- **Kapcsolódó P-tétel** — P-001, P-002, P-003, P-013, P-014, P-015, P-016

### R-UTAS-077 · Fable orkesztrátori szerepe

- **Azonosító** — R-UTAS-077
- **Cím** — Fable orkesztrátori szerepe
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A Fable 5.2 kizárólag tervezzen, ossza ki és ellenőrizze az Opus/Sonnet munkáját a feladat nehézsége szerint.
- **Forrás** — C205 (2026-11-15, 1211. sor), C226 (2026-11-17, 1297. sor), C228 (2026-11-17, 1305. sor)
- **Mi van kész** — A tulajdonosi szereposztás C205-ben szerepel. C226 és C228 interaktív modellváltási jelzés. Az orchestration-lessons-games.md helyi emlékeztető. #488 (`46931d8c`), `docs/specs/2026-11-17-vezerles-dieta.md:1`.
- **Mi hiányzik** — Az összes érintett session tényleges szerepkiosztása és a programozás delegálása nem következik a modellváltási jelzésekből.
- **Folytatás helye** — origin/main, #488 · `docs/specs/2026-11-17-vezerles-dieta.md:1`
- **Következő lépés** — Az AGENTS.md és a futtató szerepbeállításai mellé rendelj anonimizált próbamunkát. A transcriptben ellenőrizd a tervező, végrehajtó és ellenőr szerepét, azonos feladat kétszeri kiadása nélkül.
- **Függőség / ütközés** — Az alkalmazás tananyagmodellje más szerep.
- **Kapcsolódó P-tétel** — P-051

### R-UTAS-078 · Másik projekthez tartozó videók

- **Azonosító** — R-UTAS-078
- **Cím** — Másik projekthez tartozó videók
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. Egyszeri szervezési kérés.
- **Eredeti utasítás / cél** — A mintavideó után öt reklámvideóötlet legyártása és mérése.
- **Forrás** — C206 (2026-11-15, 1215. sor)
- **Mi van kész** — A 2026-11-19-i D-15 döntés ezt másik projekthez rendelte. Bizonyíték a docs/websuli-potlasok ág 7ed789ee commitja.
- **Mi hiányzik** — WEBSULI-végrehajtásra nincs érvényes megbízás.
- **Folytatás helye** — docs/websuli-potlasok @ 7ed789ee, terv D-15
- **Következő lépés** — A pótlási terv D-15 sorát használd a besorolás ellenőrzésére. Ne nyiss videógyártási szeletet a WEBSULI-ban.
- **Függőség / ütközés** — Nem tévesztendő össze a tananyagok fejezet-kisfilmjeivel.
- **Kapcsolódó P-tétel** — —

### R-UTAS-079 · Replit, holt kód, memóriaméret és sebesség

- **Azonosító** — R-UTAS-079
- **Cím** — Replit, holt kód, memóriaméret és sebesség
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Vizsgáljuk át a Replit-maradványokat, a holt kódot, az elavult tudást, az egy hónap regresszióit és a valós hardver sebességét.
- **Forrás** — C207 (2026-11-16, 1219. sor), C225 (2026-11-16, 1293. sor), C232 (2026-11-17, 1321. sor)
- **Mi van kész** — A #488 az első dokumentációs lépcső, a #478 és #502 mérhető kérdésbank-optimalizálás. #478 (`76cf426a`), #488 (`46931d8c`), #502 (`cd3f7744`), `source/tests/quiz-bank-scale-db.integration.ts:128`.
- **Mi hiányzik** — A teljes kódbázis és a készülékenkénti záró teljesítménypróba, továbbá a vezérlődokumentáció második lépcsője nyitott.
- **Folytatás helye** — origin/main, #478, #488, #502 · `source/tests/quiz-bank-scale-db.integration.ts:128`
- **Következő lépés** — A docs/specs/2026-11-17-vezerles-dieta.md második lépcsőjében azonosítsd a még hívott útvonalakat. A source/server/routes.ts legdrágább olvasásait mérd, és a megváltozott játékokat valódi mobilon vesd össze az alapvonallal.
- **Függőség / ütközés** — Az aktív fejlesztést a takarítás alatt is folytatni kell.
- **Kapcsolódó P-tétel** — P-051, P-053

### R-UTAS-080 · Pontgyűjtés, online párbaj és csoportos játék

- **Azonosító** — R-UTAS-080
- **Cím** — Pontgyűjtés, online párbaj és csoportos játék
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. A közös játék vállalt funkciója érintett.
- **Eredeti utasítás / cél** — A játékosnak legyen pontokat megőrző fiókja, online párbaja, csoportos közös játéka és győzteshirdetése.
- **Forrás** — C209 (2026-11-16, 1227. sor), C210 (2026-11-16, 1233. sor)
- **Mi van kész** — Az e-mailes játékosfiók, a valósidejű csatorna, kétfős párbaj és visszavágó mainen van. #445 (`9bda1373`), #449 (`50605100`), #452 (`f06c35df`), #464 (`5bb648ca`), #476 (`31dfcdea`), `source/tests/duel-online.spec.ts:29`.
- **Mi hiányzik** — A két játékosnál nagyobb szoba, az összes játékban közös mód és a teljes jutalomút nincs lezárva.
- **Folytatás helye** — origin/main, #445, #449, #452, #464, #476 · `source/tests/duel-online.spec.ts:29`
- **Következő lépés** — A source/shared/duel/room-machine.ts köré építs három klienses próbát. Ellenőrizd a helyes és gyors válasz sorrendjét, döntetlent, kilépést, visszacsatlakozást, eredményt és egyszeri pontjóváírást.
- **Függőség / ütközés** — JM3b, majd a további közösségi szeletek.
- **Kapcsolódó P-tétel** — P-018, P-019

### R-UTAS-081 · Három kutatási szál a többjátékos módhoz

- **Azonosító** — R-UTAS-081
- **Cím** — Három kutatási szál a többjátékos módhoz
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. A közös játék vállalt funkciója érintett.
- **Eredeti utasítás / cél** — Három külön kutatás alapozza meg a fiók-, párbaj- és csoportos játéktervet.
- **Forrás** — C209 (2026-11-16, 1227. sor), C210 (2026-11-16, 1233. sor)
- **Mi van kész** — A #440 végrehajtási terv és a #447, #460, #464 változásai követik a játékszabály és a szobagép fejlődését. #440 (`d1794c91`), #447 (`17d95333`), #460 (`e1852e89`), #464 (`5bb648ca`), `source/tests/rt-room-machine.test.ts:79`.
- **Mi hiányzik** — Három független kutatás teljes forrásjegyzéke és a csoportos játék végső döntései nem igazoltak együtt.
- **Folytatás helye** — origin/main, #440, #447, #460, #464 · `source/tests/rt-room-machine.test.ts:79`
- **Következő lépés** — A #440 tervhez rendeld a fiók-, párbaj- és csoportos kutatás eredeti átadóit. A csoportos szabályból vezess le botokkal ellenőrizhető győzelmi és döntetlen példát.
- **Függőség / ütközés** — Az egyeszközös módot a #460 kivezette.
- **Kapcsolódó P-tétel** — P-018

### R-UTAS-084 · Fiókok és közös játék élesítési rendje

- **Azonosító** — R-UTAS-084
- **Cím** — Fiókok és közös játék élesítési rendje
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. Jogosultságot, játékosadatot vagy hozzáférést érint.
- **Eredeti utasítás / cél** — Összevonás után a fiókok és az online játék a jóváhagyott sorrendben legyenek elérhetők.
- **Forrás** — C224 (2026-11-16, 1289. sor)
- **Mi van kész** — A ki-be kapcsolható fiók, belépési felület és párbaj elkészült. A 2026-11-19-i D-07 admin-pilotot ír elő M-1 után, nyilvános indulást JM3b után. #445 (`9bda1373`), #452 (`f06c35df`), #472 (`83a648c8`), #476 (`31dfcdea`), `source/tests/duel-online.spec.ts:29`.
- **Mi hiányzik** — Az éles kapcsolók aktuális értéke és a pilot teljesülése ismeretlen.
- **Folytatás helye** — origin/main, docs/jatek-fiok-uzemeltetes.md és a pótlási terv D-07 sora
- **Következő lépés** — A docs/jatek-fiok-uzemeltetes.md szerint olvasd vissza a kapcsolókat, majd ellenőrizd a D-07 előfeltételeit admin, vendég és meghívott próbafiókkal.
- **Függőség / ütközés** — A november 19-i pontosítás azonnali nyilvános nyitást kizár.
- **Kapcsolódó P-tétel** — P-022

### R-UTAS-088 · Egyszeri Gemini-audit hatóköre

- **Azonosító** — R-UTAS-088
- **Cím** — Egyszeri Gemini-audit hatóköre
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A Gemini high egyszer vizsgálja át a háromnapos teljes rendszert, műszaki utasítással, független bemenettel és 20–25 dolláros kerettel.
- **Forrás** — C233 (2026-11-17, 1325. sor), C234 (2026-11-17, 1329. sor), C235 (2026-11-17, 1333. sor), C236 (2026-11-17, 1337. sor), C239 (2026-11-17, 1349. sor), C240 (2026-11-17, 1355. sor), C256 (2026-11-17, 1427. sor)
- **Mi van kész** — A #490 második véleményként vezette be. A #99 jegy november 20-i bejegyzése az egyszeri audit leleteire és a kötelező Gemini-sor visszavonására utal. #490 (`3924beb7`), `scripts/qa/gates/external-review.mjs:30`.
- **Mi hiányzik** — A tényleges felhasználás és a háromnapos hardver-, szerver-, szoftver- és üzleti lefedettség nem igazolt teljesen. A hátralévő Gemini-köröket C271 november 18-án kivette a rendszeres sorból.
- **Folytatás helye** — origin/main, #490 · `scripts/qa/gates/external-review.mjs:30`
- **Következő lépés** — A #99 jegyhez rendeld a már meglevő G-A/G-B/G-C leleteket, a számlázási összesítőt és a megvizsgált modulokat. Hiányzó témát a hatályos ellenőrzéshez rendelj.
- **Függőség / ütközés** — A befizetés közlése nem igazol sikeres API-hívást. C240 kiszűrte a tévéből bekerült mondatot.
- **Kapcsolódó P-tétel** — P-043

### R-UTAS-089 · Szökőár-javító ügynök költsége

- **Azonosító** — R-UTAS-089
- **Cím** — Szökőár-javító ügynök költsége
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — Vizsgáljuk meg, hogy a Szökőár-javító ügynök miért fogyaszt tokent hasznos változtatás nélkül.
- **Forrás** — C238 (2026-11-17, 1345. sor)
- **Mi van kész** — A #483 bizonyítja az első játszható változatot. C238 túlfutást gyanít, nem mérési eredményt közöl. #483 (`a11b1b79`), `source/tests/tsunami-core.test.ts:63`.
- **Mi hiányzik** — Az adott session bemenete, hívásszáma, javítókörei és hasznos kimenete nincs egymáshoz rendelve.
- **Folytatás helye** — origin/main, #483 · `source/tests/tsunami-core.test.ts:63`
- **Következő lépés** — A #483 diffjét és az adott javítókör idővonalát párosítsd, majd összesítsd a megismételt, változatlan bemenetű hívásokat. Egy ilyen körnél a felügyelőnek új feladatot vagy leállást kell választania.
- **Függőség / ütközés** — Külön vizsgálandó a játék tényleges lagjától.
- **Kapcsolódó P-tétel** — P-005

### R-UTAS-092 · Szkriptkapuk a teljes működésben

- **Azonosító** — R-UTAS-092
- **Cím** — Szkriptkapuk a teljes működésben
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — Minden érdemi fejlesztési és futásidejű fázist ténylegesen használt, helyi szkript vagy hook ellenőrizzen.
- **Forrás** — C247 (2026-11-17, 1383. sor), C248 (2026-11-17, 1389. sor), C267 (2026-11-18, 1488. sor), C298 (2026-11-19, 1613. sor)
- **Mi van kész** — A #489 kiadási kapui és a #517 teljes vertikumra szóló terve mainen vannak. A P2 ág 77e69552 feje külön tartalmaz bizonyítékláncot. #489 (`26bae97f`), #517 (`d9d1e6c6`), `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:69`.
- **Mi hiányzik** — A tervben lévő összes fázis futtatható bekötése, próbája, valamint a futtatók és skillek egyezése nincs mainen igazolva.
- **Folytatás helye** — origin/main, #489, #517 · `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:69`
- **Következő lépés** — A docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md fázistáblájához rendelj konkrét belépési pontot. Először az aktuális fej és az állítás-bizonyíték kapcsolatát próbáld ki elavult rekorddal és hibás kimenettel.
- **Függőség / ütközés** — P-042 a kapumunka, P-054 a termékbeli őrök.
- **Kapcsolódó P-tétel** — P-042, P-045, P-047, P-054

### R-UTAS-093 · Keresési és környezeti állapotellenőrzők

- **Azonosító** — R-UTAS-093
- **Cím** — Keresési és környezeti állapotellenőrzők
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — A keresés pontosságát, a kanbant, a memóriát és a futtatókörnyezetet gépi referenciaadat ellenőrizze.
- **Forrás** — C249 (2026-11-17, 1393. sor)
- **Mi van kész** — A #517 terve megnevezi az állapotellenőrzőket, a chore/allapot-ellenorok ágon ab69f000 őrzi a kódot. #517 (`d9d1e6c6`), `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:342`.
- **Mi hiányzik** — A referencia-találatok valós pontossága, a főági bekötés és a futtatókönyvek szerinti használat nincs készre igazolva.
- **Folytatás helye** — chore/allapot-ellenorok @ ab69f000 és chore/kapuk-beepites @ ab87bf16
- **Következő lépés** — Az ág scripts/qa/checks ellenőrzőit próbáld ismert jó és rossz találatokkal, elavult memóriával és hiányzó futtatókörnyezettel. Csak a valóban érzékelt hibát kösd blokkoló kapuba.
- **Függőség / ütközés** — A kapcsolódó bekötési ág chore/kapuk-beepites, ab87bf16.
- **Kapcsolódó P-tétel** — P-047

### R-UTAS-098 · Ágak, archívumok és adatok takarítása

- **Azonosító** — R-UTAS-098
- **Cím** — Ágak, archívumok és adatok takarítása
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Csak a WEBSULI-ban legyen teljes, veszteségmentes munkafa-, ág-, mappa-, tudásbázis- és adatbázis-takarítás.
- **Forrás** — C17 (2026-10-14, 67. sor), C207 (2026-11-16, 1219. sor), C213 (2026-11-16, 1245. sor), C260 (2026-11-18, 1443. sor), C261 (2026-11-18, 1456. sor), C282 (2026-11-18, 1548. sor), C286 (2026-11-19, 1564. sor)
- **Mi van kész** — A #214 és #310 korábbi takarításokat dokumentál, #488 az első vezérlési lépcsőt végezte el. A november 18-i döntés az elavult archívumokat is érinti. #214 (`e7c8d018`), #310 (`76197cae`), #488 (`46931d8c`), `docs/specs/2026-10-14-higienia.md:3`.
- **Mi hiányzik** — A teljes mai állomány beolvasztottsága, egyedi tartalma, használata és visszaállíthatósága nincs bizonyítva.
- **Folytatás helye** — origin/main, #214, #310, #488 · `docs/specs/2026-10-14-higienia.md:3`
- **Következő lépés** — A docs/specs/2026-10-14-higienia.md mintájával készíts csak olvasó listát a ma egyedi commitokról, aktív bérletekről és elavult mentésekről. A takarítási jelöltet külön igazold visszaállítási próbával.
- **Függőség / ütközés** — A felhasználó megtiltotta az idegen repók takarítását. Az aktív munkát őrizni kell.
- **Kapcsolódó P-tétel** — P-051, P-058, P-059

### R-UTAS-100 · Adventi tudásszint és jutalom

- **Azonosító** — R-UTAS-100
- **Cím** — Adventi tudásszint és jutalom
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Határidős tulajdonosi funkció.
- **Eredeti utasítás / cél** — Az adventi ablak a tanuló szintjéhez illő kérdést adjon és a 95%-os eredménynél jelenjen meg az ajándéküzenet.
- **Forrás** — C262 (2026-11-18, 1460. sor)
- **Mi van kész** — A #511 a közös szabályokat és a karácsonyi készletet tartalmazza. Az adat- és felületi út külön ágakon készül. #511 (`dc76ba52`), `source/tests/advent-rules.test.ts:35`.
- **Mi hiányzik** — A nyitható nap, mentett haladás és záróüzenet teljes útja még nem érhető el a rögzített mainen.
- **Folytatás helye** — wip/advent-b-egyesites @ 79d35d16, wip/advent-c-javitas @ ebd03a42
- **Következő lépés** — A wip/advent-b-egyesites és wip/advent-c-javitas változásait a source/shared/advent/rules.ts szabályaihoz illeszd. Próbálj decemberi napváltást és közvetlenül a 95%-os határ két oldalán záródó kört.
- **Függőség / ütközés** — D-11 szerint tulajdonosi előnézet után, legkésőbb november 30-ra célzott az indulás.
- **Kapcsolódó P-tétel** — P-034, P-035, P-038, P-039

### R-UTAS-101 · Karácsonyi képkészlet

- **Azonosító** — R-UTAS-101
- **Cím** — Karácsonyi képkészlet
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Határidős tulajdonosi funkció.
- **Eredeti utasítás / cél** — A naptár klasszikus karácsonyi grafikát kapjon, a kért motívumokkal.
- **Forrás** — C263 (2026-11-18, 1466. sor)
- **Mi van kész** — A #519 a képgyártás előkészítését és költségvédelmét tartalmazza. A képek jóváhagyása a feat/advent-s3c-kepek ágon külön munkafolyamat. #519 (`7176046f`), `source/tests/advent-art-pipeline.test.ts:27`.
- **Mi hiányzik** — A végleges mobil- és asztali kép, valamint a felsorolt motívumok vizuális elfogadása hiányzik.
- **Folytatás helye** — feat/advent-s3c-kepek @ 28949f20
- **Következő lépés** — A source/design-assets/advent/prompts.json és a style.md alapján ellenőrizd az összes kért motívumot a már legyártott jelölteken. Mérd a bájtméretet és nézd meg mobilon a vágást.
- **Függőség / ütközés** — Új képgyártás külön költségdöntés.
- **Kapcsolódó P-tétel** — P-036, P-037, P-056

### R-UTAS-102 · Adventi kártya a főoldalon

- **Azonosító** — R-UTAS-102
- **Cím** — Adventi kártya a főoldalon
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — advent
- **Prioritás-javaslat** — P2. Határidős tulajdonosi funkció.
- **Eredeti utasítás / cél** — Az adventi kártya a Hero és a tananyaglista között legyen, teljes szélességben és kis magassággal.
- **Forrás** — C264 (2026-11-18, 1470. sor)
- **Mi van kész** — A wip/advent-c-javitas ági felület létezik, ebd03a42 a B-adatágat is magába foglalja. Mainen csak az A mag van. #511 (`dc76ba52`), `source/tests/advent-contract.test.ts:10`.
- **Mi hiányzik** — A kártya főági integrációja és a mobil fókusz, koppintás, szezonalitás végpróbája hiányzik.
- **Folytatás helye** — wip/advent-c-javitas @ ebd03a42
- **Következő lépés** — Az ági főoldali kártyát ültesd az azonos főágra a naptárvégponttal. Valódi böngészőben ellenőrizd a Hero → advent → lista sorrendet, a teljes szélességet és a szezonon kívüli helyfoglalást.
- **Függőség / ütközés** — Advent B adatmodell és D-11.
- **Kapcsolódó P-tétel** — P-035

### R-UTAS-106 · Főoldali animált ajánló

- **Azonosító** — R-UTAS-106
- **Cím** — Főoldali animált ajánló
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A főoldali animált maki a három legújabb tananyagot ajánlja és mobilon is könnyű maradjon.
- **Forrás** — C273 (2026-11-18, 1512. sor)
- **Mi van kész** — A feat/kabala-fooldal ágon 80f4c6cc méréseket és képeket tartalmaz. Külön prototípus is létezik.
- **Mi hiányzik** — Az ajánlósáv nem jutott be a vizsgált főágra. D-12 szerint első látogatáskor legyen körbevezetés.
- **Folytatás helye** — feat/kabala-fooldal @ 80f4c6cc, source/tests/home-mascot.spec.ts
- **Következő lépés** — Az ági ajánlóban próbálj nulla, egy és három leckét, majd visszatérő látogatót. Mérd telefonon a betöltést és a célkártyára mutatást.
- **Függőség / ütközés** — A jóváhagyás az orrfolt képes visszamérésétől is függ.
- **Kapcsolódó P-tétel** — P-007

### R-UTAS-109 · DeepSeek- és Qwen-kizárólagosság

- **Azonosító** — R-UTAS-109
- **Cím** — DeepSeek- és Qwen-kizárólagosság
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — A kötelező vak ellenőr legyen előbb DeepSeek Flash, majd a november 18-i pontosítás szerint Qwen Max.
- **Forrás** — C276 (2026-11-18, 1524. sor), C277 (2026-11-18, 1528. sor), C278 (2026-11-18, 1532. sor), C296 (2026-11-19, 1605. sor), C298 (2026-11-19, 1613. sor)
- **Mi van kész** — C278 még aznap felülírta a DeepSeek döntést. A blind-review-runner.md 2026-11-19-i bejegyzése a Qwent is felülírta GPT-6.2 Sol high kizárólagos használatával. #489 (`26bae97f`), #490 (`3924beb7`), `scripts/qa/gates/external-review.mjs:30`.
- **Mi hiányzik** — A korábbi két modell egyikének kizárólagossá tétele sem hatályos feladat.
- **Folytatás helye** — chore/vak-ellenor-deepseek @ 1e564a01
- **Következő lépés** — A chore/vak-ellenor-deepseek ág nevéből ne következtess a modellre. Olvasd vissza a gates.config.json tényleges modell-, reasoning- és exclusive-értékeit, ellenőrizd a november 19-i döntéssel.
- **Függőség / ütközés** — C271 a Gemini egyszeri szerepét is tisztázta.
- **Kapcsolódó P-tétel** — P-043

### R-UTAS-110 · Egységes Sol high vak ellenőr

- **Azonosító** — R-UTAS-110
- **Cím** — Egységes Sol high vak ellenőr
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — Az érvényes vak ellenőr kizárólagos ítélete legyen kötelező minden futtatóban, skillben és PR-kapun.
- **Forrás** — C271 (2026-11-18, 1504. sor), C276 (2026-11-18, 1524. sor), C277 (2026-11-18, 1528. sor), C278 (2026-11-18, 1532. sor), C296 (2026-11-19, 1605. sor), C298 (2026-11-19, 1613. sor)
- **Mi van kész** — A főági alapkapuk megvannak. A chore/vak-ellenor-deepseek ágon 1e564a01-ig gépi futtató, külön rekord, mélységi őr és kitakarás van. #489 (`26bae97f`), #490 (`3924beb7`), `scripts/qa/gates/external-review.mjs:30`.
- **Mi hiányzik** — A 2026-11-19-i Sol high kizárólagos beállítás és a teljes eszközlánc főági átvétele hiányzik.
- **Folytatás helye** — chore/vak-ellenor-deepseek @ 1e564a01
- **Következő lépés** — Az ági scripts/qa/gates/gates.config.json, record-review.mjs és pre-pr-gate.mjs szerződését együtt vedd át. Másik modell, hiányzó rekord és hibás fej esetén mindhárom próbánál legyen egyértelmű elutasítás.
- **Függőség / ütközés** — A modellcsere a fejlesztői ellenőrre vonatkozik, nem a leckegyártásra.
- **Kapcsolódó P-tétel** — P-043, P-048

### R-UTAS-111 · Promptcache az ügynöki futtatókban

- **Azonosító** — R-UTAS-111
- **Cím** — Promptcache az ügynöki futtatókban
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A prompt- és KV-cache működjön az orkesztrátor, az alügynökök és a vak ellenőr ismétlődő bemeneteinél is.
- **Forrás** — C279 (2026-11-18, 1536. sor), C280 (2026-11-18, 1540. sor), C281 (2026-11-18, 1544. sor)
- **Mi van kész** — A mainen van cache-barát gyártási kérés. A maximize-prompt-cache.md:3 az elvárást a saját munkafolyamatra is kiterjeszti. #329 (`2cc1204c`), `source/tests/resource-s3a.test.ts:18`.
- **Mi hiányzik** — A belső futtatók tényleges cache-találatai és a stabil bemeneti előtag alkalmazása nem igazolt mindegyik úton.
- **Folytatás helye** — origin/main, #329 · `source/tests/resource-s3a.test.ts:18`
- **Következő lépés** — A source/server/ai/prompt-cache.ts szerkezetét hasonlítsd az ági vak futtató kérésépítéséhez. Két azonos előtagú hívás rögzített telemetriáján ellenőrizd a cache-ből olvasott tokeneket.
- **Függőség / ütközés** — Titkos vagy felhasználói tartalom ne kerüljön a mérési jelentésbe.
- **Kapcsolódó P-tétel** — P-043

### R-UTAS-112 · Munkafák és munkamenetek közös átadása

- **Azonosító** — R-UTAS-112
- **Cím** — Munkafák és munkamenetek közös átadása
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — Minden aktív munkaszál kerüljön közös átadásba, a lezárt munka ellenőrzött kiadással és utólagos higiéniával érjen mainre.
- **Forrás** — C282 (2026-11-18, 1548. sor), C283 (2026-11-18, 1552. sor), C286 (2026-11-19, 1564. sor), C289 (2026-11-19, 1576. sor), C296 (2026-11-19, 1605. sor)
- **Mi van kész** — A #501 lezárt előzményét a #515 integrálta, a brit hanglánc #516-ban mainre került. A #520 feloldott egy kapuindítási hibát. #515 (`f756588c`), #516 (`b7165a56`), #520 (`d7583576`), `source/tests/source-visuals-flag.test.ts:32`.
- **Mi hiányzik** — A J7b és több nyitott PR, az összes munkafa, illetve a hozzájuk rendelt telepítési nyugta nincs lezárva. A központi sessionnek való átadás sem igazolt minden ágnál.
- **Folytatás helye** — origin/main, #515, #516, #520 · `source/tests/source-visuals-flag.test.ts:32`
- **Következő lépés** — A docs/handoffs/ és a kanban forráspillanat alapján készíts ág–PR–main hash–telepített revízió megfeleltetést. A J7b-hez és a #504-hez keresd meg a megmaradt eltérést. A készültséget a végpont és az éles revízió együtt igazolja.
- **Függőség / ütközés** — Ezek történeti engedélyek. A jelen revízió írási tilalmai érvényesek.
- **Kapcsolódó P-tétel** — P-003, P-044, P-046, P-061, P-062

### R-UTAS-117 · Ismétlődő vagy lassú kapufutások

- **Azonosító** — R-UTAS-117
- **Cím** — Ismétlődő vagy lassú kapufutások
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — A lint-, push-, merge- és deploykapukban ne ismétlődjenek feleslegesen a drága ellenőrzések.
- **Forrás** — C294 (2026-11-19, 1596. sor), C295 (2026-11-19, 1601. sor)
- **Mi van kész** — A #518 hat szeletre osztotta az E2E-kört, a #520 a kapu saját indítását feloldotta. A fix/kapu-gyorsitas ág 037691a2 fejen külön finomít. #518 (`ce5205dc`), #520 (`d7583576`), `scripts/qa/gates/pre-merge-gate.mjs:1`.
- **Mi hiányzik** — Nem igazolt, hogy minden észlelt lassulás visszhangból ered. A saját és az ismételt munkák száma, illetve a mai teljes futásidő nincs együtt megmérve.
- **Folytatás helye** — fix/kapu-gyorsitas @ 037691a2
- **Következő lépés** — A scripts/qa/gates/pre-pr-gate.mjs és pre-merge-gate.mjs gyermekfolyamait azonos fej esetén időzítsd. Rögzíts minden meghívást egyszer, az elavult vagy átvitt bizonyíték maradjon érvénytelen.
- **Függőség / ütközés** — P-049 a szövegszűrés, külön gyökérok.
- **Kapcsolódó P-tétel** — P-044, P-045, P-046, P-050

### R-UTAS-118 · A heti leltár két köre

- **Azonosító** — R-UTAS-118
- **Cím** — A heti leltár két köre
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A heti hiányleltárhoz kerüljenek be az összes PR-szál és a tananyag-oldalszál eredményei is.
- **Forrás** — C297 (2026-11-19, 1609. sor), X9 (2026-11-19, 94. sor), X10 (2026-11-19, 164. sor)
- **Mi van kész** — A docs/websuli-potlasok ág 7ed789ee főkönyve 68 tételre bővült. fa8ea2e7 a tervet és végrehajtási utasítást is tartalmazza.
- **Mi hiányzik** — A heti leltár és az ötven szelet terve a kijelölt főágon kívül található.
- **Folytatás helye** — docs/websuli-potlasok @ 7ed789ee
- **Következő lépés** — A docs/websuli-potlasok:docs/websuli-potlasok.md és a terv P-001–P-068 hivatkozásait egyeztesd az aktuális origin/main hashével. minden lezárható sorhoz rendelj beolvadási bizonyítékot.
- **Függőség / ütközés** — A friss főág már tartalmazza a #517 és #520 változását.
- **Kapcsolódó P-tétel** — —

### R-UTAS-119 · A 68 tétel végrehajtása és követése

- **Azonosító** — R-UTAS-119
- **Cím** — A 68 tétel végrehajtása és követése
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A heti jelentés mind az ötven szelete a tizenhat döntéssel együtt kapjon nyomon követhető végrehajtást és státuszjelentést.
- **Forrás** — C299 (2026-11-19, 1617. sor), C300 (2026-11-19, 1621. sor), C301 (2026-11-20, 1625. sor), C302 (2026-11-20, 1629. sor), C303 (2026-11-20, 1633. sor)
- **Mi van kész** — Az 50 szelet és D-01–D-16 döntés a docs/websuli-potlasok ágon van. A #517, #519 és #520 igazolt részszállítás. #517 (`d9d1e6c6`), #519 (`7176046f`), #520 (`d7583576`).
- **Mi hiányzik** — A teljes 68-as és 50-es halmaz közti megfeleltetés minden aktuális PR-hoz és futó munkához rendelt lezárással hiányzik.
- **Folytatás helye** — docs/websuli-potlasok @ 7ed789ee, docs/specs/2026-11-19-websuli-potlasok-terv.md
- **Következő lépés** — A 2026-11-19-websuli-potlasok-terv.md P-tétel–szelet táblájában minden elemhez írd vissza a main hashét vagy a nyitott ágat és az elfogadási próbát. Külön számold a még be nem olvadt szeleteket.
- **Függőség / ütközés** — A már futó javítások után következik a végrehajtás.
- **Kapcsolódó P-tétel** — —

### R-UTAS-120 · Teljes történeti revízió és javítási átadás

- **Azonosító** — R-UTAS-120
- **Cím** — Teljes történeti revízió és javítási átadás
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A kezdetektől készüljön teljes, szeletelt revízió, amelyből másik ügynök a hiányokat kijavíthatja.
- **Forrás** — C304 (2026-11-20, 1637. sor)
- **Mi van kész** — A heti leltár mellett a docs/teljes-revizio munkafában megjelentek a tervek, PR-ok és kanban külön dokumentumai. A vizsgált main és a revíziós munkafa eltérő bizonyítékszint.
- **Mi hiányzik** — A teljes sorozat egymás közötti megfeleltetése és az abból következő programjavítások beolvadása nem igazolt.
- **Folytatás helye** — docs/teljes-revizio, docs/revizio/
- **Következő lépés** — A docs/revizio/ szeleteiben a duplikált P/PR hivatkozásokat párosítsd. minden nyitott azonosítót rendelj végrehajtási szelethez, célfájlhoz és elfogadási próbához.
- **Függőség / ütközés** — A jelen 04-es szelet megbízása kizárólag leltárkészítés.
- **Kapcsolódó P-tétel** — —

### R-UTAS-121 · Eseti kiadási utasítások

- **Azonosító** — R-UTAS-121
- **Cím** — Eseti kiadási utasítások
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — Az adott munkamenet kiadását a tulajdonos engedélye szerint, zöld CI-vel, áttekinthető committal, rendes PR-ral és igazolt telepítéssel fejezzük be.
- **Forrás** — C1 (2026-10-14, 3. sor), C9 (2026-10-14, 35. sor), C12 (2026-10-14, 47. sor), C15 (2026-10-14, 59. sor), C26 (2026-10-15, 103. sor), C27 (2026-10-15, 107. sor), C36 (2026-10-15, 143. sor), C57 (2026-10-16, 248. sor), C75 (2026-10-16, 326. sor), C105 (2026-10-18, 684. sor), C137 (2026-10-19, 834. sor), C178 (2026-10-22, 1009. sor), C188 (2026-10-22, 1072. sor), C192 (2026-10-31, 1138. sor), C195 (2026-10-31, 1171. sor), C198 (2026-11-01, 1183. sor), C202 (2026-11-02, 1199. sor), C282 (2026-11-18, 1548. sor), C286 (2026-11-19, 1564. sor), C296 (2026-11-19, 1605. sor)
- **Mi van kész** — A main rögzíti a háromfázisú CI-ellenőrzést, a Render-revízió ellenőrzését és a helyi kapukat. C192 véleményezhető, rendes PR-t kért. #236 (`a9f95c9e`), #401 (`ca765bae`), #489 (`26bae97f`), `scripts/qa/verify-render-revision.mjs:18`.
- **Mi hiányzik** — Egy adott pull, commit, merge vagy deploy teljesülése nem olvasható ki minden rövid jóváhagyásból. A kiadásra váró ágak nem mind a főág részei.
- **Folytatás helye** — origin/main, #236, #401, #489 · `scripts/qa/verify-render-revision.mjs:18`
- **Következő lépés** — A docs/minosegkapuk.md és a scripts/qa/verify-render-revision.mjs alapján az adott nap és ág PR-ját párosítsd a főági és a kiadott revízióval. Külön jelöld, ha csak a kiadásra szóló engedély ismert.
- **Függőség / ütközés** — A történeti engedélyek az akkori munkamenetekre szóltak.
- **Kapcsolódó P-tétel** — P-044, P-052, P-061

### R-UTAS-122 · Állapotjelentés, folytatás és befejezés

- **Azonosító** — R-UTAS-122
- **Cím** — Állapotjelentés, folytatás és befejezés
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — Az ügynök kérdezés nélkül vigye végig a jóváhagyott szeletet, olvassa be az alügynökök eredményét, és számszerű, őszinte készre jelentést adjon.
- **Forrás** — C13 (2026-10-14, 51. sor), C14 (2026-10-14, 55. sor), C16 (2026-10-14, 63. sor), C21 (2026-10-14, 83. sor), C24 (2026-10-15, 95. sor), C28 (2026-10-15, 111. sor), C35 (2026-10-15, 139. sor), C37 (2026-10-15, 147. sor), C38 (2026-10-15, 151. sor), C43 (2026-10-15, 181. sor), C47 (2026-10-16, 197. sor), C48 (2026-10-16, 201. sor), C57 (2026-10-16, 248. sor), C72 (2026-10-16, 312. sor), C82 (2026-10-17, 354. sor), C92 (2026-10-18, 624. sor), C94 (2026-10-18, 632. sor), C95 (2026-10-18, 636. sor), C96 (2026-10-18, 640. sor), C99 (2026-10-18, 660. sor), C100 (2026-10-18, 664. sor), C104 (2026-10-18, 680. sor), C107 (2026-10-18, 692. sor), C140 (2026-10-20, 847. sor), C143 (2026-10-20, 859. sor), C144 (2026-10-20, 863. sor), C147 (2026-10-20, 875. sor), C148 (2026-10-20, 879. sor), C151 (2026-10-20, 891. sor), C177 (2026-10-22, 1005. sor), C178 (2026-10-22, 1009. sor), C181 (2026-10-22, 1021. sor), C199 (2026-11-01, 1187. sor), C227 (2026-11-17, 1301. sor), C230 (2026-11-17, 1313. sor), C237 (2026-11-17, 1341. sor), C270 (2026-11-18, 1500. sor), C284 (2026-11-19, 1556. sor), C286 (2026-11-19, 1564. sor), C288 (2026-11-19, 1572. sor), C302 (2026-11-20, 1629. sor), C303 (2026-11-20, 1633. sor)
- **Mi van kész** — A formális befejezési mandátum az AGENTS.md:123 alatt megtalálható. Az üzenetek ismételten kérnek állapotot, elmaradáslistát és várható befejezést. #372 (`0c914eec`), #391 (`5018f01e`), `AGENTS.md:123`.
- **Mi hiányzik** — Az eredeti szeletekhez tartozó összes futtatói válasz és határidő-becslés nem maradt meg.
- **Folytatás helye** — origin/main, #372, #391 · `AGENTS.md:123`
- **Következő lépés** — A docs/kanban.md és a megfelelő terv elfogadási sorai alapján készíts lezárási egyezést: kérés, feladat, független eredmény, main hash, nyitott függőség. A becslés csak a még nyitott sorokra vonatkozzon.
- **Függőség / ütközés** — A rövid nyugták nem igazolják egy funkció elkészültét.
- **Kapcsolódó P-tétel** — P-061

### R-UTAS-123 · Munkamenetmodell és kapufájl sorainak száma

- **Azonosító** — R-UTAS-123
- **Cím** — Munkamenetmodell és kapufájl sorainak száma
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Egyszeri munkamenet-diagnosztika.
- **Eredeti utasítás / cél** — Azonosítsuk a tényleges futtatómodellt és mérjük meg a hivatkozott kapufájl sorait.
- **Forrás** — X5 (2026-11-19, 78. sor), X25 (2026-11-20, 247. sor)
- **Mi van kész** — A megnevezett scripts/qa/gate.mjs útvonalra a teljes helyi git-történet nem ad találatot. A valódi kapuk a scripts/qa/gates alatt vannak. `scripts/qa/gates/gates.config.json:1`.
- **Mi hiányzik** — Az akkori futtató válasza, tényleges modellje és az Astra-elérhetőség nem dönthető el egy termékrepó forrásából.
- **Folytatás helye** — origin/main · `scripts/qa/gates/gates.config.json:1`
- **Következő lépés** — A munkamenet eredeti modellmetaadatát és az akkori munkakönyvtárat ellenőrizd. Sorokat csak az ott ténylegesen létező fájlban számolj. eltérő repó esetén jegyezd fel a hatókört.
- **Függőség / ütközés** — Az X5 diagnosztikai kérésben a repo nincs azonosítva.
- **Kapcsolódó P-tétel** — —

### R-UTAS-124 · A képmodell végleges kiválasztása

- **Azonosító** — R-UTAS-124
- **Cím** — A képmodell végleges kiválasztása
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. A változtatás a megjelenítést pontosítja.
- **Eredeti utasítás / cél** — A korábbi két képmodell kombinációját az egyetlen jóváhagyott Seedream 5.0 Pro váltsa fel.
- **Forrás** — C86 (2026-10-17, 370. sor)
- **Mi van kész** — A C86 összefoglaló döntési sorrendje a kizárólagos modellt teszi későbbre. A grafikai szabályterv és a készlet főágon van. A source/design-assets/prompts.json:2 a jóváhagyott modellt rögzíti. #272 (`bf8a511b`), #273 (`e475387a`), `source/tests/design-assets.test.ts:14`.
- **Mi hiányzik** — A kétmodelles korábbi elvárást nem kell végrehajtani.
- **Folytatás helye** — origin/main, #272, #273 · `source/tests/design-assets.test.ts:14`
- **Következő lépés** — A #273 képgeneráló beállítását hasonlítsd a C86-ban megőrzött végső modellválasztáshoz. A mintakészlet metaadatain ellenőrizd a tényleges előállítót.
- **Függőség / ütközés** — C86 közvetett forrás, 2026-10-17.
- **Kapcsolódó P-tétel** — —

### R-UTAS-125 · Közös kabala és saját képi arculat

- **Azonosító** — R-UTAS-125
- **Cím** — Közös kabala és saját képi arculat
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A leckedesign saját képeket és egységes kabalát használjon. A lecke legyen elsődleges, a kézírásos betű csak marketingfelületen jelenjen meg.
- **Forrás** — C86 (2026-10-17, 370. sor)
- **Mi van kész** — A képkészlet, tantárgyi ikonok és Stúdió megjelenés mainen van. A design-bank-decisions.md az asztali és mobil méretezést külön is rögzíti. C86 szerint a természettudományi minta a kémiaikonhoz lett társítva. #272 (`bf8a511b`), #273 (`e475387a`), #274 (`ea469791`), #278 (`0867fa4e`), `source/tests/studio-ui.spec.ts:11`.
- **Mi hiányzik** — A régi mintákon, minden tantárgyban és korcsoportban nem igazolt az összes vizuális korlátozás betartása.
- **Folytatás helye** — origin/main, #272, #273, #274, #278 · `source/tests/studio-ui.spec.ts:11`
- **Következő lépés** — A #274 és #278 által érintett nézetekről készíts vizuális mátrixot a tananyag és a marketingfelület szétválasztásával. Ellenőrizd a fontot, az ikonválasztást és a mobil érintési célt.
- **Függőség / ütközés** — A külön tanulói dashboard csak mintaként engedélyezett.
- **Kapcsolódó P-tétel** — —

### R-UTAS-129 · VPS-ről Vercelre és Renderre váltás

- **Azonosító** — R-UTAS-129
- **Cím** — VPS-ről Vercelre és Renderre váltás
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A kért üzemeltetési állapotot vissza kell igazolni.
- **Eredeti utasítás / cél** — A VPS-es kiszolgálást váltsa fel a Vercel és Render feladatmegosztása, igazolható éles revízióval.
- **Forrás** — G1 (`303898a4`), G9 (`189069eb`), G149 (`99250dab`), G150 (`6ecbded0`), G210 (`cee57419`), G229 (`671d3d38`), G238 (`0fa0c0f3`), G273 (`93b89321`)
- **Mi van kész** — A decemberi indulástól a februári platformváltásig vezet a napló. A #401/#402 a kiadott revízió és a Render-beállítás ellenőrzését hozta. #401 (`ca765bae`), #402 (`fe807806`), `scripts/qa/verify-render-settings.mjs:13`.
- **Mi hiányzik** — A régi VPS-eljárások minden hivatkozásának kivezetése és a mai éles egyezés nincs teljesen igazolva.
- **Folytatás helye** — origin/main, #401, #402 · `scripts/qa/verify-render-settings.mjs:13`
- **Következő lépés** — A render.yaml és a source/vercel.json belépőit hasonlítsd az aktuális üzemeltetési útmutatóhoz. A régi VPS-útvonalat hivatkozási kereséssel különítsd el, majd ellenőrizd a kiszolgált revíziót.
- **Függőség / ütközés** — Az eredeti dizájnváltozatok történeti alakulása nem bizonyít egyenként tulajdonosi jóváhagyást.
- **Kapcsolódó P-tétel** — —

### R-UTAS-132 · Előnézet és tartós HTML-mentés

- **Azonosító** — R-UTAS-132
- **Cím** — Előnézet és tartós HTML-mentés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A teljes dokumentum javítása követhető legyen, a megnyitott előnézet pedig a tartósan mentett változatot mutassa.
- **Forrás** — G31 (`39ba664f`), G64 (`97edb672`), G96 (`a794e3b1`), G232 (`19bd0e6d`), G248 (`40b96bcd`), G252 (`98c4dadf`), G254 (`36ff2d9f`), G256 (`7ff48d49`)
- **Mi van kész** — A PDF összes oldalának beolvasása, az aszinkron munka, adatbázisos állapot és visszaolvasás külön főági változás. A #378/#379 megerősítette a mentés és bankfolytonosság kezelését. #323 (`17e98afa`), #378 (`3ff652ad`), #379 (`dcf840bf`), `source/tests/repair-bank-reuse.test.ts:26`.
- **Mi hiányzik** — A legrégebbi HTML-formátum, a teljes PDF és a frissítést túlélő kliens együtt nincs azonos bemeneten igazolva.
- **Folytatás helye** — origin/main, #323, #378, #379 · `source/tests/repair-bank-reuse.test.ts:26`
- **Következő lépés** — A #378 elfogadási próbáját többoldalas forráson ismételd meg: előnézet, szerver-újraindítás, véglegesítés, közvetlen megnyitás és korábbi változatra visszaállítás.
- **Függőség / ütközés** — Az üzenetexport előtti cél a változástörténetből rekonstruálható.
- **Kapcsolódó P-tétel** — —

### R-UTAS-133 · Többszörös feltöltés és elavult lista

- **Azonosító** — R-UTAS-133
- **Cím** — Többszörös feltöltés és elavult lista
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — Egy feltöltés pontosan egyszer kerüljön be, törlés és feltöltés után a lista frissüljön.
- **Forrás** — G116 (`55ebb06b`), G119 (`9d29551e`), G121 (`710a6d64`), G122 (`e512752c`)
- **Mi van kész** — A főági előzmény kikapcsolta az ismétlődő módosító kérést és kezelt kliens-, böngésző- és service-worker cache-t. `source/server/routes.ts:1`.
- **Mi hiányzik** — A régi négyszeres feltöltés mai adminútvonalon végzett célzott regressziópróbája nincs azonosítva.
- **Folytatás helye** — origin/main · `source/server/routes.ts:1`
- **Következő lépés** — A source/server/routes.ts feltöltési útján szimulálj megszakadt választ és ismételt beküldést. Az adminlistán és új megnyitáskor egy példány legyen, törlés után nulla.
- **Függőség / ütközés** — A deploy- és rendercache más gyorsítótár.
- **Kapcsolódó P-tétel** — —

### R-UTAS-134 · Korai játékmódok pont- és fejlődésútja

- **Azonosító** — R-UTAS-134
- **Cím** — Korai játékmódok pont- és fejlődésútja
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Kifejezett játékélmény- vagy tartalmi kérés.
- **Eredeti utasítás / cél** — A játékban tananyag-alapú kérdések, olvasható időkeret, visszajelzés és megőrzött fejlődés legyen.
- **Forrás** — G278 (`793e4c12`), G286 (`dbc712ef`), G288 (`92b65390`), G299 (`ccd2e967`), G314 (`a67169fa`), G316 (`3f74cd00`), G317 (`3d77c3bf`), G318 (`b179cd64`), G320 (`9dcfae76`), G321 (`188c4629`), G322 (`a591bb40`)
- **Mi van kész** — A tavaszi játékközpontot kérdésbankok, profil, napi kihívás, főellenfelek és az őszi mobilos szeletek követték. #424 (`7ae49b33`), #425 (`50c6041c`), #430 (`e729789c`), #434 (`8a92cd7a`), #435 (`fbb00395`), `source/tests/blockcraft-mobile.test.ts:34`.
- **Mi hiányzik** — A korábbi teljesítmények és mai játékosfiókok egybefüggő pontútja nem igazolt minden játéknál.
- **Folytatás helye** — origin/main, #424, #425, #430, #434, #435 · `source/tests/blockcraft-mobile.test.ts:34`
- **Következő lépés** — A korábbi pontbeküldés és a #445 fiók összekötését ellenőrizd egy vendégként kezdett, majd bejelentkezve befejezett játékkal. A korábbi eredmény ne vesszen el és ne duplázódjon.
- **Függőség / ütközés** — P-019, régi és új pontkulcsok.
- **Kapcsolódó P-tétel** — P-014, P-016, P-019

### R-UTAS-138 · Szerepkörhöz kötött utasításcsomag

- **Azonosító** — R-UTAS-138
- **Cím** — Szerepkörhöz kötött utasításcsomag
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A gyártási szerepekhez verziózott utasítás- és tudáscsomag tartozzon, a futás az alkalmazott változattal legyen visszakereshető.
- **Forrás** — G670 (`6abd1a64`), G904 (`176c2f59`), G930 (`ee090421`)
- **Mi van kész** — A role-skills és runtime-csomag bevezetése a naplóban és a docs/runtime-skill-learning.md leírásában megtalálható. #262 (`93c0c642`), `source/tests/role-skills-everywhere.test.ts:30`.
- **Mi hiányzik** — A régi szerepenkénti őrök mindegyikének mai megfelelője az egyfutásos és javítási úton nincs igazolva.
- **Folytatás helye** — origin/main, #262 · `source/tests/role-skills-everywhere.test.ts:30`
- **Következő lépés** — A source/server/studio/role-skills.ts és az új motor szerepkiosztását vesd össze a source/tests/role-skills-everywhere.test.ts által bejárt utakkal. Egy mentett futásnál ellenőrizd az alkalmazott csomagverziót.
- **Függőség / ütközés** — A szerepkiosztást október 16-án C55 megváltoztatta.
- **Kapcsolódó P-tétel** — —

### R-UTAS-139 · Körlimiten alkalmazott bankminimum

- **Azonosító** — R-UTAS-139
- **Cím** — Körlimiten alkalmazott bankminimum
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Kimerített javítási keretnél csak a jóváhagyott feltételekkel lehessen lazítani a bank és a módszerek minimumán.
- **Forrás** — G881 (`181d157a`), G958 (`4d997884`)
- **Mi van kész** — A 4d997884 kifejezetten tulajdonosi kiterjesztést rögzít. A source/tests/limit-trimmed-packets.test.ts megmaradt. #262 (`93c0c642`), `source/tests/limit-trimmed-packets.test.ts:25`.
- **Mi hiányzik** — A jelenlegi egyfutásos motor azonos határhelyzetének egyezése külön ellenőrzendő.
- **Folytatás helye** — origin/main, #262 · `source/tests/limit-trimmed-packets.test.ts:25`
- **Következő lépés** — A megmaradt limit-trimmed-packets próbát kösd egy mai motorból érkező csomaghoz. Ellenőrizd a limit előtti és utáni küszöböt, valamint a hibás forráshivatkozást.
- **Függőség / ütközés** — A 95%-os történeti publikálási küszöb nem az adventi jutalom szabálya.
- **Kapcsolódó P-tétel** — —

### R-UTAS-141 · Tantárgyi tudás és javító orkesztrátor

- **Azonosító** — R-UTAS-141
- **Cím** — Tantárgyi tudás és javító orkesztrátor
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A tantárgyi tudásbank, a tanult szabályok és a javító orkesztrátor ellenőrzött láncot alkosson.
- **Forrás** — G1000 (`e446a1a0`), G1023 (`6f1345b1`)
- **Mi van kész** — A katalógus-kinyerés, besorolás, 17 tantárgyi skill, eredményességmérés és memóriabekötés dokumentált főági szeletek. S9/2 már bekötést is adott az S9/1 maghoz. #188 (`d0a56adb`), #189 (`8f936431`), #190 (`79b4a988`), #191 (`795c7c69`), #192 (`affd2d0b`), #193 (`4924e570`), #201 (`b7eff29e`), #202 (`ad36ca67`), #203 (`1ef0fc9d`), #204 (`b57c2174`), `source/tests/catalog-s6.test.ts:1`.
- **Mi hiányzik** — A rögzített új motoron az összes korábbi útvonal tényleges használata nem következik az őszi beolvadásokból.
- **Folytatás helye** — origin/main, #188, #189, #190, #191, #192, #193, #201, #202, #203, #204 · `source/tests/catalog-s6.test.ts:1`
- **Következő lépés** — A #311 egyfutásos tudáspróbáját a katalógus, tantárgyi memória és javítás kapcsolói szerint járd végig. Tételenként ellenőrizd a tényleges felhasználást és a biztonságos kikapcsolást.
- **Függőség / ütközés** — C112 külön kérte a #262 után kiesett bekötés pótlását.
- **Kapcsolódó P-tétel** — —

### R-UTAS-142 · Két erős OCR-olvasó

- **Azonosító** — R-UTAS-142
- **Cím** — Két erős OCR-olvasó
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — Kézírásos forráson egyeztesse két erős olvasó az eltérő OCR-olvasatot.
- **Forrás** — G1061 (`ce53cbed`)
- **Mi van kész** — A #197 a két olvasó fúzióját szállította. A 44ad2477 öt kézírásos lapon rögzít mérést. #195 (`263831fc`), #196 (`3af699b5`), #197 (`78a8e211`), #262 (`93c0c642`), `source/tests/ocr-handwriting-history.test.ts:13`.
- **Mi hiányzik** — Az október 16-i modellváltás utáni konkrét olvasási út és a nehéz példák mai hibaaránya külön igazolandó.
- **Folytatás helye** — origin/main, #195, #196, #197, #262 · `source/tests/ocr-handwriting-history.test.ts:13`
- **Következő lépés** — A #197 méréseinek változatlan mintáit játszd vissza rögzített modellválaszokkal. Ellenőrizd az egyező, ütköző és kieső olvasatot a mai PDF-belépési pontig.
- **Függőség / ütközés** — A forrásszöveg felismerése nem fedi le a forrásábrák későbbi kérését.
- **Kapcsolódó P-tétel** — —

### R-UTAS-146 · Összehasonlító kutatás az elakadásokhoz

- **Azonosító** — R-UTAS-146
- **Cím** — Összehasonlító kutatás az elakadásokhoz
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A gyártás egyszerűsítéséről mérések és hasonló rendszerek dokumentált megoldásai alapján szülessen döntés.
- **Forrás** — C10 (2026-10-14, 39. sor), C56 (2026-10-16, 243. sor), C142 (2026-10-20, 855. sor)
- **Mi van kész** — A docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md:39 azonos forráson végzett összevetést, a #263 telemetriát és egyszerűsítést tartalmaz. #263 (`e1c305ef`), `source/scripts/measure/single-run-measure.mts:1`.
- **Mi hiányzik** — Az október 20-án kért külső szakmai, nyílt forrású és egyetemi megoldások tényleges összevetése nincs azonosítva.
- **Folytatás helye** — origin/main, #263 · `source/scripts/measure/single-run-measure.mts:1`
- **Következő lépés** — A #263 egyfutásos motorjának dokumentált elakadásaihoz keress megőrzött kutatási jegyzetet. Egy javaslatot offline hibavisszajátszással hasonlíts a jelenlegi javítókörhöz, a hívásszám és téves elfogadás rögzítésével.
- **Függőség / ütközés** — Ez a tétel a kutatás bizonyítékáról szól.
- **Kapcsolódó P-tétel** — —

### R-UTAS-147 · Diktált API- és korlátbeállítás

- **Azonosító** — R-UTAS-147
- **Cím** — Diktált API- és korlátbeállítás
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A kért üzemeltetési állapotot vissza kell igazolni.
- **Eredeti utasítás / cél** — Az API és a korlátok nyitott beállításaihoz legyen megnevezett választás, indoklás és javítási lehetőség.
- **Forrás** — C146 (2026-10-20, 871. sor)
- **Mi van kész** — C146 egy feltöltött API-t és korlátokat említ, de a diktált név és a pontos hatókör bizonytalan. `docs/specs/2026-10-19-eroforras-s1.md:1`.
- **Mi hiányzik** — A szolgáltató, a konkrét korlát és a ténylegesen kiválasztott opció nem azonosítható ebből az üzenetből.
- **Folytatás helye** — origin/main · `docs/specs/2026-10-19-eroforras-s1.md:1`
- **Következő lépés** — A docs/specs/2026-10-19-eroforras-s1.md erőforrásdöntéseit és a korabeli kérdéslistát párosítsd a dátummal. Csak névvel és mért határértékkel azonosított beállításhoz készíts ellenőrzést.
- **Függőség / ütközés** — A Neon 0,25 CU-ról külön, egyértelmű döntés született.
- **Kapcsolódó P-tétel** — —

### R-UTAS-148 · Korlátlan tömeges átalakítás visszavonása

- **Azonosító** — R-UTAS-148
- **Cím** — Korlátlan tömeges átalakítás visszavonása
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást.
- **Eredeti utasítás / cél** — A három próba után az összes régi anyag feltétel nélküli, folyamatos futtatása.
- **Forrás** — C153 (2026-10-20, 899. sor), C154 (2026-10-21, 905. sor), C164 (2026-10-21, 947. sor)
- **Mi van kész** — A #350 megnyitotta a teljes sort. C154 2026-10-21-én ezt számon kérte. C164 az ötös ciklust és két célzott újragyártást hagyta jóvá. #349 (`fcd57053`), #350 (`bb0d096d`), #352 (`75cd6e74`), `source/tests/regi-anyag-studio.test.ts:12`.
- **Mi hiányzik** — A korlátlan tömeges indítás már nem érvényes munkamód.
- **Folytatás helye** — origin/main, #349, #350, #352 · `source/tests/regi-anyag-studio.test.ts:12`
- **Következő lépés** — A source/server/studio/legacy-migration.ts cikluskorlátját teszteld három próba és egy ötös köteg határán. Újabb köteg csak a jóváhagyott feltétellel induljon.
- **Függőség / ütközés** — legacy-migration-cycles.md:14–16 és #352.
- **Kapcsolódó P-tétel** — —

### R-UTAS-149 · J7b saját PR-ja

- **Azonosító** — R-UTAS-149
- **Cím** — J7b saját PR-ja
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Kifejezett játékélmény- vagy tartalmi kérés.
- **Eredeti utasítás / cél** — A J7b útelágazás és turbó szelet kapjon saját PR-t.
- **Forrás** — C283 (2026-11-18, 1552. sor)
- **Mi van kész** — A főágon a J7a #482 található. P-003 külön ági J7b munkát tart nyilván. A mai helyi ág feje b066296d. A közös őstől a diff 40 fájlt érint. #482 (`443d6b76`), `source/tests/tornado-j7a.spec.ts:56`.
- **Mi hiányzik** — J7b néven elfogadott főági szállítás és kiadási bizonyíték nincs igazolva.
- **Folytatás helye** — feat/jatek-j7b-tornado-utelagazas @ b066296d, P-003
- **Következő lépés** — A P-003-ban megnevezett ági Tornado-változást vesd össze a #482 állapotával. Az útválasztást és turbóidőt külön telefonos játékmenetben ellenőrizd, majd rögzítsd a PR és main megfeleltetését.
- **Függőség / ütközés** — C283 másik feladata, a #501 utódja, közben a #515-ben beolvadt.
- **Kapcsolódó P-tétel** — P-003

### R-UTAS-150 · Hiányzó kérdéshez tartozó igenlő válaszok

- **Azonosító** — R-UTAS-150
- **Cím** — Hiányzó kérdéshez tartozó igenlő válaszok
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. Egyedi tulajdonosi átadás.
- **Eredeti utasítás / cél** — A rövid igenlő és számozott válaszokat csak az eredeti kérdéssel együtt szabad végrehajtási döntésnek tekinteni.
- **Forrás** — C45 (2026-10-16, 189. sor), C46 (2026-10-16, 193. sor), C168 (2026-10-21, 966. sor), C200 (2026-11-01, 1191. sor)
- **Mi van kész** — C45, C46, C168 és C200 válaszai fennmaradtak. A két üzenetexport felhasználói üzeneteket őriz, a közvetlen kérdés nem mindenütt látszik. `docs/kanban.md:1`.
- **Mi hiányzik** — A négy válasz tárgya nem bizonyítható egyértelműen csak az egymás utáni fejlécekből.
- **Folytatás helye** — origin/main · `docs/kanban.md:1`
- **Következő lépés** — A dátumhoz tartozó docs/specs/ döntési sorokban és korabeli átadóban keresd mind a válaszlehetőséget, mind a választást. Ügyet csak egyező kérdés és opció esetén zárj le.
- **Függőség / ütközés** — A C62 választ ezzel szemben a párhuzamos bank terve kifejezetten azonosította.
- **Kapcsolódó P-tétel** — —

### R-UTAS-158 · A főoldal történeti arculatváltásai

- **Azonosító** — R-UTAS-158
- **Cím** — A főoldal történeti arculatváltásai
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. A változtatás a megjelenítést pontosítja.
- **Eredeti utasítás / cél** — A kezdőlap fejlécét és kártyáit a mindenkori arculathoz igazítsuk, mobilon gazdaságosan jelenjenek meg.
- **Forrás** — G1 (`303898a4`), G51 (`34b96461`), G58 (`4e10d0e0`), G109 (`7a9bb1ec`), G123 (`d95dd319`), G154 (`13318daa`), G178 (`b7f732de`), G185 (`b28b0eea`), G203 (`8c58c48e`), G215 (`b8745789`), G218 (`f0192c0a`)
- **Mi van kész** — Decembertől szezonális, tudományos és később kompakt kezdőlap-változatok szerepelnek. A mai fejléchez és tananyagkártyákhoz későbbi beolvadt változások tartoznak. #381 (`febd949e`), #387 (`0b51df9d`), #388 (`70f37d78`), #389 (`be48d34d`), `source/client/src/components/HeroSection.tsx:1`.
- **Mi hiányzik** — A korai látványváltozatokhoz nem maradt eredeti tulajdonosi döntés, amelyből valamennyi elem mai kötelezősége levezethető volna.
- **Folytatás helye** — origin/main, #381, #387, #388, #389 · `source/client/src/components/HeroSection.tsx:1`
- **Következő lépés** — A source/client/src/components/HeroSection.tsx és az aktuális kártyák mobilos képeit a legutolsó elfogadott tervhez mérd. Korábbi szezonális változat visszaállítását csak dátumozott döntés alapján vedd fel.
- **Függőség / ütközés** — A novemberi adventi kártyát a tulajdonos külön a Hero alá kérte.
- **Kapcsolódó P-tétel** — —

### R-UTAS-159 · Érzékeny adatok a nyilvános fájlokban

- **Azonosító** — R-UTAS-159
- **Cím** — Érzékeny adatok a nyilvános fájlokban
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint.
- **Eredeti utasítás / cél** — A nyilvános fájlok és helyreállítási útmutatók ne tegyenek közzé érzékeny adatot.
- **Forrás** — G22 (`ca854b41`), G297 (`8004b6d3`), G340 (`58156f0a`), G342 (`d162bd45`), G343 (`5b55fe0a`)
- **Mi van kész** — A júliusi előzmény tisztítást rögzít, novemberben címőr és szintetikus tesztcím-kivétel került mainre. #474 (`38861d28`), #479 (`f7894087`), `AGENTS.md:13`.
- **Mi hiányzik** — A kód és a történet eltérő hatókör. A teljes friss nyilvános anyag egyszeri átvizsgálása nem igazolja az összes külső másolat állapotát.
- **Folytatás helye** — origin/main, #474, #479 · `AGENTS.md:13`
- **Következő lépés** — A #474 címőréhez ellenőrizd a követett fájlok hatókörét és a #479 szintetikus kivételeit. A naplóba csak találatszám kerüljön.
- **Függőség / ütközés** — D-14 2026-11-19-én a történet megőrzését választotta a régi címadat ügyében.
- **Kapcsolódó P-tétel** — P-023

### R-UTAS-162 · Kiadás és adatbázisséma összhangja

- **Azonosító** — R-UTAS-162
- **Cím** — Kiadás és adatbázisséma összhangja
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — A telepítéshez a szükséges adatbázisséma és az ellenőrzött alkalmazásverzió együtt álljon rendelkezésre.
- **Forrás** — G259 (`6c09e311`), G260 (`7b74cb4a`)
- **Mi van kész** — A februári esetben hiányzó éles táblát és a migrációs megoldást a docs/archive/session.md:193 és :221 rögzíti. A #399 integrációs, a #401 revíziós ellenőrzést ad. #399 (`41c5cb92`), #401 (`ca765bae`), `docs/archive/session.md:221`.
- **Mi hiányzik** — Az egyes mai telepítések séma–alkalmazás megfelelése nem olvasható ki egy korábbi migráció bevezetéséből.
- **Folytatás helye** — origin/main, #399, #401 · `docs/archive/session.md:221`
- **Következő lépés** — A render.yaml build- és indítási lépéseit hasonlítsd a migrációs jegyzékhez. Eldobható DB-n próbálj üres és előző verziós sémát, majd igazold a futó revíziót.
- **Függőség / ütközés** — Éles migráció nem része az auditnak.
- **Kapcsolódó P-tétel** — —

### R-UTAS-164 · Idegen Docker-adatbázis védelme

- **Azonosító** — R-UTAS-164
- **Cím** — Idegen Docker-adatbázis védelme
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat.
- **Eredeti utasítás / cél** — Az elkülönített, más munkához tartozó Docker-adatbázist hagyjuk érintetlenül.
- **Forrás** — C86 (2026-10-17, 370. sor)
- **Mi van kész** — A C86 összefoglaló ezt önálló munkakörnyezeti korlátként őrzi. A verziózott próbákban az eldobható cél ellenőrzése megtalálható. `source/scripts/measure/single-run-measure.mts:95`.
- **Mi hiányzik** — Az egykori helyi konténer műveleti naplója és valamennyi segédszkript hatóköre nem ismert.
- **Folytatás helye** — origin/main · `source/scripts/measure/single-run-measure.mts:95`
- **Következő lépés** — A source/scripts/measure/single-run-measure.mts:95 célvizsgálatát vesd össze a futtató konténerválasztásával. Elkülönített helyi próbakonfigurációban más cél kiválasztására még csatlakozás előtt álljon meg.
- **Függőség / ütközés** — Valós adatbázishoz az ellenőrzés során ne csatlakozz.
- **Kapcsolódó P-tétel** — —

### R-UTAS-165 · Hitelesítési adatok kezelése

- **Azonosító** — R-UTAS-165
- **Cím** — Hitelesítési adatok kezelése
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint.
- **Eredeti utasítás / cél** — A futtató titkot csak a megfelelő környezeti forrásból olvasson, jelszót ne gépeljen be és ne írjon naplóba.
- **Forrás** — C3 (2026-10-14, 11. sor), C6 (2026-10-14, 23. sor), C7 (2026-10-14, 27. sor), C25 (2026-10-15, 99. sor), C86 (2026-10-17, 370. sor)
- **Mi van kész** — A C86 összefoglaló a nyílt szövegű engedélyadat eltávolítását késznek jelzi és a jelszócserét tulajdonosi feladatnak hagyja. Az AGENTS.md:13 rögzíti a titokkezelési tilalmat. `AGENTS.md:13`.
- **Mi hiányzik** — Az eredeti nyugtához nem tartozik visszaolvasott, kitakart állapot. Az egyes régi futtatók naplózási és hitelesítési viselkedése nem igazolt.
- **Folytatás helye** — origin/main · `AGENTS.md:13`
- **Következő lépés** — Az AGENTS.md titokszabályát egyeztesd a tényleges beviteli és naplózási úttal. Fiktív canary értékkel bizonyítsd, hogy sem az engedélyszabályba, sem a kimenetbe nem kerül érzékeny adat.
- **Függőség / ütközés** — A C3, C7 és C25 a hitelesítő adat forrására tett eseti javaslat volt.
- **Kapcsolódó P-tétel** — —

### R-UTAS-168 · Eseti commit- és PR-formátum

- **Azonosító** — R-UTAS-168
- **Cím** — Eseti commit- és PR-formátum
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Egyszeri munkamenet-diagnosztika.
- **Eredeti utasítás / cél** — Az eseti PR-nál legyen visszakereshető a commit-üzenet, az ügynöki közreműködés és a futtató által kért jelölés.
- **Forrás** — C86 (2026-10-17, 370. sor), C192 (2026-10-31, 1138. sor)
- **Mi van kész** — C86 fájlból beolvasott üzenetet, társszerzői jelzést és PR-láblécet említ. C192 külön kéri a rendes PR-nyitást és a helyes célágat. `source/tests/no-real-emails-guard.test.ts:49`.
- **Mi hiányzik** — A két munkamenet tényleges PR-jai és azok összes formai követelménye nem azonosítható biztosan a felhasználói exportból.
- **Folytatás helye** — origin/main · `source/tests/no-real-emails-guard.test.ts:49`
- **Következő lépés** — A konkrét naphoz és ághoz azonosított PR metaadatait hasonlítsd a két eredeti sablonhoz. Ellenőrizd a célágat, draft állapotot és a közreműködő jelölés jelenlétét, személyes adatok másolása nélkül.
- **Függőség / ütközés** — A régi futtatósablon formátuma nem általános termékkövetelmény.
- **Kapcsolódó P-tétel** — —

### R-UTAS-169 · Review-szál érdemi megválaszolása

- **Azonosító** — R-UTAS-169
- **Cím** — Review-szál érdemi megválaszolása
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást.
- **Eredeti utasítás / cél** — A review-szálra érdemi válasz után kerülhessen lezárás.
- **Forrás** — C86 (2026-10-17, 370. sor)
- **Mi van kész** — A docs/minosegkapuk.md:39 a nyitott szálak ellenőrzését írja elő. A resolve-only-answered-threads.md helyi szabály az adott válasz meglétét külön megkívánja. #489 (`26bae97f`), `docs/minosegkapuk.md:39`.
- **Mi hiányzik** — A nyitott szálak száma önmagában nem mutatja, hogy a régi lezárt szálak mindegyikére érkezett javítás vagy indokolt válasz.
- **Folytatás helye** — origin/main, #489 · `docs/minosegkapuk.md:39`
- **Következő lépés** — A scripts/qa/gates/pre-merge-gate.mjs szálállapotát vesd össze a PR-export üzenetsorrendjével. Szintetikus válasz nélküli lezárt, megválaszolt nyitott és megválaszolt lezárt szál legyen a három próba.
- **Függőség / ütközés** — Egy korábbi sablon csak az adott session eljárását igazolja.
- **Kapcsolódó P-tétel** — P-061

### R-UTAS-170 · Windowsos böngészőpróbák

- **Azonosító** — R-UTAS-170
- **Cím** — Windowsos böngészőpróbák
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért.
- **Eredeti utasítás / cél** — A helyi böngészős próbák használhatóak legyenek Windowsról, route-mock mellett is.
- **Forrás** — C86 (2026-10-17, 370. sor)
- **Mi van kész** — A source/tests/admin-draft-lessons.spec.ts:6 a service workert blokkolja a próba alatt. C86 egymunkásos CLI-futtatást és Windows-specifikus indítási tapasztalatot rögzít. #296 (`bdbe118f`), `source/tests/admin-draft-lessons.spec.ts:6`.
- **Mi hiányzik** — Az adott gépen az akkori shellhiba pontos újrajátszása és az összes érintett böngészőkonfiguráció nem igazolt.
- **Folytatás helye** — origin/main, #296 · `source/tests/admin-draft-lessons.spec.ts:6`
- **Következő lépés** — A projekt Playwright-konfigurációjában szűrt tesztnévvel és egy workerrel ellenőrizd a Windows-argumentumátadást. A mockolt kérés érje el a route-kezelőt, a tényleges PWA-teszten maradjon aktív a worker.
- **Függőség / ütközés** — A tesztkonfiguráció és a termék service workere külön út.
- **Kapcsolódó P-tétel** — —

### R-UTAS-171 · Helyi letöltési engedély

- **Azonosító** — R-UTAS-171
- **Cím** — Helyi letöltési engedély
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. Egyszeri szervezési kérés.
- **Eredeti utasítás / cél** — A munkamenethez kapcsolódó fájlletöltésnél legyen azonosítható a jogosultság és az átadás célja.
- **Forrás** — C86 (2026-10-17, 370. sor), C132 (2026-10-19, 810. sor), C133 (2026-10-19, 814. sor)
- **Mi van kész** — C86 külön engedélyhez kötött letöltést említ, C133 engedélyezte a Drive-os átadást. `docs/lesson-improvement.md:1`.
- **Mi hiányzik** — Az eredeti session letöltési engedélybeállítása és a készüléken elért példány nem ellenőrizhető főági kóddal.
- **Folytatás helye** — origin/main · `docs/lesson-improvement.md:1`
- **Következő lépés** — A C86/C133 átadási eseményt ellenőrizd a futtató helyi jogosultságnaplójában. Egy saját mintafájl letöltése igazolja a célmappa és a hozzáférés működését.
- **Függőség / ütközés** — Az engedély a megjelölt fájlokra és munkamenetre vonatkozik.
- **Kapcsolódó P-tétel** — —

### R-UTAS-172 · A régi leckék arculatának visszatöltése

- **Azonosító** — R-UTAS-172
- **Cím** — A régi leckék arculatának visszatöltése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt.
- **Eredeti utasítás / cél** — A régi leckék arculata is kerüljön tartósan az adatbázisba, a tematikus ikon előre készüljön el.
- **Forrás** — C86 (2026-10-17, 370. sor), C93 (2026-10-18, 628. sor)
- **Mi van kész** — A #274 ikontára és a #283 visszaállítható backfillje megvan. A docs/specs/2026-10-18-arculat-backfill-vegrehajtas.md:10 a csak olvasó próbát is dokumentálja. #274 (`ea469791`), #283 (`41dea926`), `source/scripts/design-assets/backfill-lesson-art.mts:1`.
- **Mi hiányzik** — Az engedélyezett éles művelet minden régi leckére kiterjedő alkalmazása és utólagos visszaolvasása nem következik a szkript beolvadásából.
- **Folytatás helye** — origin/main, #274, #283 · `source/scripts/design-assets/backfill-lesson-art.mts:1`
- **Következő lépés** — A source/scripts/design-assets/backfill-lesson-art.mts próbafutását egyeztesd a korabeli mentéssel. A korábban érintett és változatlan leckékből is ellenőrizd a tárolt arculatot és a megjelenő képet.
- **Függőség / ütközés** — R-UTAS-030 a megnyitáskori villanás kódjavítását külön zárja.
- **Kapcsolódó P-tétel** — —

## Forráselemek visszakeresése

Egy többcélú üzenet több tételhez is kapcsolódhat. A visszavont és más projektre vonatkozó közlések itt is helyet kapnak. A C86 folytatási összefoglaló az eredeti képes üzenetek közvetett forrása. A modellek nevét a korabeli forrás szerinti döntésként használjuk.

### Claude-export

| Üzenet | Forrássorok | Dátum (UTC) | Tétel vagy elhatárolás |
|---|---:|---|---|
| C1 | 3–6 | 2026-10-14 | R-UTAS-121 |
| C2 | 7–10 | 2026-10-14 | R-UTAS-001, R-UTAS-002 |
| C3 | 11–14 | 2026-10-14 | R-UTAS-003, R-UTAS-165 |
| C4 | 15–18 | 2026-10-14 | R-UTAS-001 |
| C5 | 19–22 | 2026-10-14 | R-UTAS-003 |
| C6 | 23–26 | 2026-10-14 | R-UTAS-004, R-UTAS-165 |
| C7 | 27–30 | 2026-10-14 | R-UTAS-003, R-UTAS-165 |
| C8 | 31–34 | 2026-10-14 | R-UTAS-001, R-UTAS-003 |
| C9 | 35–38 | 2026-10-14 | R-UTAS-121 |
| C10 | 39–42 | 2026-10-14 | R-UTAS-005, R-UTAS-146 |
| C11 | 43–46 | 2026-10-14 | R-UTAS-005 |
| C12 | 47–50 | 2026-10-14 | R-UTAS-121 |
| C13 | 51–54 | 2026-10-14 | R-UTAS-122 |
| C14 | 55–58 | 2026-10-14 | R-UTAS-122 |
| C15 | 59–62 | 2026-10-14 | R-UTAS-121 |
| C16 | 63–66 | 2026-10-14 | R-UTAS-122 |
| C17 | 67–70 | 2026-10-14 | R-UTAS-098 |
| C18 | 71–74 | 2026-10-14 | R-UTAS-006 |
| C19 | 75–78 | 2026-10-14 | R-UTAS-007 |
| C20 | 79–82 | 2026-10-14 | R-UTAS-008 |
| C21 | 83–86 | 2026-10-14 | R-UTAS-122 |
| C22 | 87–90 | 2026-10-15 | R-UTAS-007 |
| C23 | 91–94 | 2026-10-15 | R-UTAS-009 |
| C24 | 95–98 | 2026-10-15 | R-UTAS-122 |
| C25 | 99–102 | 2026-10-15 | R-UTAS-008, R-UTAS-165 |
| C26 | 103–106 | 2026-10-15 | R-UTAS-121 |
| C27 | 107–110 | 2026-10-15 | R-UTAS-121 |
| C28 | 111–114 | 2026-10-15 | R-UTAS-010, R-UTAS-122 |
| C29 | 115–118 | 2026-10-15 | R-UTAS-010 |
| C30 | 119–122 | 2026-10-15 | R-UTAS-034 |
| C31 | 123–126 | 2026-10-15 | R-UTAS-034 |
| C32 | 127–130 | 2026-10-15 | R-UTAS-034 |
| C33 | 131–134 | 2026-10-15 | R-UTAS-034 |
| C34 | 135–138 | 2026-10-15 | R-UTAS-010 |
| C35 | 139–142 | 2026-10-15 | R-UTAS-122 |
| C36 | 143–146 | 2026-10-15 | R-UTAS-121 |
| C37 | 147–150 | 2026-10-15 | R-UTAS-122 |
| C38 | 151–154 | 2026-10-15 | R-UTAS-122 |
| C39 | 155–158 | 2026-10-15 | R-UTAS-011 |
| C40 | 159–172 | 2026-10-15 | R-UTAS-011, R-UTAS-012, R-UTAS-013, R-UTAS-014, R-UTAS-015, R-UTAS-054, R-UTAS-126, R-UTAS-127, R-UTAS-143, R-UTAS-144, R-UTAS-145 |
| C41 | 173–176 | 2026-10-15 | R-UTAS-054 |
| C42 | 177–180 | 2026-10-15 | R-UTAS-013 |
| C43 | 181–184 | 2026-10-15 | R-UTAS-122 |
| C44 | 185–188 | 2026-10-15 | R-UTAS-006, R-UTAS-127, R-UTAS-145 |
| C45 | 189–192 | 2026-10-16 | R-UTAS-150 |
| C46 | 193–196 | 2026-10-16 | R-UTAS-150 |
| C47 | 197–200 | 2026-10-16 | R-UTAS-122 |
| C48 | 201–204 | 2026-10-16 | R-UTAS-122 |
| C49 | 205–208 | 2026-10-16 | R-UTAS-016 |
| C50 | 209–212 | 2026-10-16 | R-UTAS-006 |
| C51 | 213–218 | 2026-10-16 | R-UTAS-017, R-UTAS-018 |
| C52 | 219–222 | 2026-10-16 | R-UTAS-019 |
| C53 | 223–226 | 2026-10-16 | R-UTAS-019 |
| C54 | 227–230 | 2026-10-16 | R-UTAS-019 |
| C55 | 231–242 | 2026-10-16 | R-UTAS-013, R-UTAS-020 |
| C56 | 243–247 | 2026-10-16 | R-UTAS-010, R-UTAS-146 |
| C57 | 248–251 | 2026-10-16 | R-UTAS-121, R-UTAS-122 |
| C58 | 252–255 | 2026-10-16 | R-UTAS-021 |
| C59 | 256–259 | 2026-10-16 | R-UTAS-010 |
| C60 | 260–263 | 2026-10-16 | R-UTAS-010 |
| C61 | 264–267 | 2026-10-16 | R-UTAS-021 |
| C62 | 268–271 | 2026-10-16 | R-UTAS-021 |
| C63 | 272–279 | 2026-10-16 | R-UTAS-021, R-UTAS-022 |
| C64 | 280–283 | 2026-10-16 | R-UTAS-022, R-UTAS-023 |
| C65 | 284–287 | 2026-10-16 | R-UTAS-024 |
| C66 | 288–291 | 2026-10-16 | R-UTAS-022, R-UTAS-023 |
| C67 | 292–295 | 2026-10-16 | R-UTAS-022 |
| C68 | 296–299 | 2026-10-16 | R-UTAS-022 |
| C69 | 300–303 | 2026-10-16 | R-UTAS-022 |
| C70 | 304–307 | 2026-10-16 | R-UTAS-025 |
| C71 | 308–311 | 2026-10-16 | R-UTAS-026 |
| C72 | 312–315 | 2026-10-16 | R-UTAS-122 |
| C73 | 316–321 | 2026-10-16 | R-UTAS-027 |
| C74 | 322–325 | 2026-10-16 | R-UTAS-027 |
| C75 | 326–329 | 2026-10-16 | R-UTAS-026, R-UTAS-027, R-UTAS-121 |
| C76 | 330–333 | 2026-10-17 | R-UTAS-028 |
| C77 | 334–337 | 2026-10-17 | R-UTAS-028 |
| C78 | 338–341 | 2026-10-17 | R-UTAS-029 |
| C79 | 342–345 | 2026-10-17 | R-UTAS-029 |
| C80 | 346–349 | 2026-10-17 | R-UTAS-029 |
| C81 | 350–353 | 2026-10-17 | R-UTAS-026, R-UTAS-029 |
| C82 | 354–357 | 2026-10-17 | R-UTAS-122 |
| C83 | 358–361 | 2026-10-17 | R-UTAS-004 |
| C84 | 362–365 | 2026-10-17 | R-UTAS-029 |
| C85 | 366–369 | 2026-10-17 | R-UTAS-029 |
| C86 | 370–603 | 2026-10-17 | R-UTAS-004, R-UTAS-025, R-UTAS-026, R-UTAS-029, R-UTAS-053, R-UTAS-054, R-UTAS-124, R-UTAS-125, R-UTAS-136, R-UTAS-163, R-UTAS-164, R-UTAS-165, R-UTAS-166, R-UTAS-167, R-UTAS-168, R-UTAS-169, R-UTAS-170, R-UTAS-171, R-UTAS-172 |
| C87 | 604–607 | 2026-10-17 | R-UTAS-030 |
| C88 | 608–611 | 2026-10-17 | R-UTAS-031, R-UTAS-032 |
| C89 | 612–615 | 2026-10-17 | R-UTAS-034 |
| C90 | 616–619 | 2026-10-17 | R-UTAS-034 |
| C91 | 620–623 | 2026-10-17 | R-UTAS-032 |
| C92 | 624–627 | 2026-10-18 | R-UTAS-122 |
| C93 | 628–631 | 2026-10-18 | R-UTAS-030, R-UTAS-034, R-UTAS-172 |
| C94 | 632–635 | 2026-10-18 | R-UTAS-122 |
| C95 | 636–639 | 2026-10-18 | R-UTAS-122 |
| C96 | 640–643 | 2026-10-18 | R-UTAS-122 |
| C97 | 644–655 | 2026-10-18 | R-UTAS-024, R-UTAS-031, R-UTAS-033 |
| C98 | 656–659 | 2026-10-18 | R-UTAS-035 |
| C99 | 660–663 | 2026-10-18 | R-UTAS-122 |
| C100 | 664–667 | 2026-10-18 | R-UTAS-122 |
| C101 | 668–671 | 2026-10-18 | R-UTAS-018 |
| C102 | 672–675 | 2026-10-18 | R-UTAS-036 |
| C103 | 676–679 | 2026-10-18 | R-UTAS-036 |
| C104 | 680–683 | 2026-10-18 | R-UTAS-122 |
| C105 | 684–687 | 2026-10-18 | R-UTAS-121 |
| C106 | 688–691 | 2026-10-18 | R-UTAS-037 |
| C107 | 692–695 | 2026-10-18 | R-UTAS-122 |
| C108 | 696–699 | 2026-10-18 | R-UTAS-038 |
| C109 | 700–703 | 2026-10-18 | R-UTAS-034 |
| C110 | 704–707 | 2026-10-18 | R-UTAS-038 |
| C111 | 708–711 | 2026-10-19 | R-UTAS-054 |
| C112 | 712–715 | 2026-10-19 | R-UTAS-021, R-UTAS-039 |
| C113 | 716–719 | 2026-10-19 | R-UTAS-039 |
| C114 | 720–725 | 2026-10-19 | R-UTAS-039 |
| C115 | 726–729 | 2026-10-19 | R-UTAS-040, R-UTAS-047 |
| C116 | 730–733 | 2026-10-19 | R-UTAS-039 |
| C117 | 734–737 | 2026-10-19 | R-UTAS-034, R-UTAS-040 |
| C118 | 738–747 | 2026-10-19 | R-UTAS-041 |
| C119 | 748–751 | 2026-10-19 | R-UTAS-041 |
| C120 | 752–759 | 2026-10-19 | R-UTAS-035, R-UTAS-041 |
| C121 | 760–763 | 2026-10-19 | R-UTAS-034 |
| C122 | 764–767 | 2026-10-19 | R-UTAS-042 |
| C123 | 768–771 | 2026-10-19 | R-UTAS-042 |
| C124 | 772–775 | 2026-10-19 | R-UTAS-043 |
| C125 | 776–779 | 2026-10-19 | R-UTAS-040 |
| C126 | 780–783 | 2026-10-19 | R-UTAS-044 |
| C127 | 784–787 | 2026-10-19 | R-UTAS-018 |
| C128 | 788–793 | 2026-10-19 | R-UTAS-045 |
| C129 | 794–799 | 2026-10-19 | R-UTAS-046 |
| C130 | 800–803 | 2026-10-19 | R-UTAS-047 |
| C131 | 804–809 | 2026-10-19 | R-UTAS-048 |
| C132 | 810–813 | 2026-10-19 | R-UTAS-049, R-UTAS-171 |
| C133 | 814–817 | 2026-10-19 | R-UTAS-049, R-UTAS-171 |
| C134 | 818–825 | 2026-10-19 | R-UTAS-050, R-UTAS-051 |
| C135 | 826–829 | 2026-10-19 | R-UTAS-052 |
| C136 | 830–833 | 2026-10-19 | R-UTAS-052 |
| C137 | 834–837 | 2026-10-19 | R-UTAS-052, R-UTAS-053, R-UTAS-121 |
| C138 | 838–841 | 2026-10-19 | R-UTAS-054 |
| C139 | 842–846 | 2026-10-19 | R-UTAS-052 |
| C140 | 847–850 | 2026-10-20 | R-UTAS-122 |
| C141 | 851–854 | 2026-10-20 | R-UTAS-010, R-UTAS-053 |
| C142 | 855–858 | 2026-10-20 | R-UTAS-018, R-UTAS-146 |
| C143 | 859–862 | 2026-10-20 | R-UTAS-122 |
| C144 | 863–866 | 2026-10-20 | R-UTAS-122 |
| C145 | 867–870 | 2026-10-20 | R-UTAS-054 |
| C146 | 871–874 | 2026-10-20 | R-UTAS-054, R-UTAS-147 |
| C147 | 875–878 | 2026-10-20 | R-UTAS-122 |
| C148 | 879–882 | 2026-10-20 | R-UTAS-122 |
| C149 | 883–886 | 2026-10-20 | R-UTAS-010 |
| C150 | 887–890 | 2026-10-20 | R-UTAS-010 |
| C151 | 891–894 | 2026-10-20 | R-UTAS-122 |
| C152 | 895–898 | 2026-10-20 | R-UTAS-010, R-UTAS-053 |
| C153 | 899–904 | 2026-10-20 | R-UTAS-055, R-UTAS-148 |
| C154 | 905–908 | 2026-10-21 | R-UTAS-055, R-UTAS-056, R-UTAS-148 |
| C155 | 909–912 | 2026-10-21 | R-UTAS-056 |
| C156 | 913–916 | 2026-10-21 | R-UTAS-056 |
| C157 | 917–920 | 2026-10-21 | R-UTAS-055, R-UTAS-056 |
| C158 | 921–924 | 2026-10-21 | R-UTAS-056 |
| C159 | 925–930 | 2026-10-21 | R-UTAS-057 |
| C160 | 931–934 | 2026-10-21 | R-UTAS-057 |
| C161 | 935–938 | 2026-10-21 | R-UTAS-055, R-UTAS-056 |
| C162 | 939–942 | 2026-10-21 | R-UTAS-058 |
| C163 | 943–946 | 2026-10-21 | R-UTAS-054 |
| C164 | 947–953 | 2026-10-21 | R-UTAS-055, R-UTAS-148 |
| C165 | 954–957 | 2026-10-21 | R-UTAS-059 |
| C166 | 958–961 | 2026-10-21 | R-UTAS-059 |
| C167 | 962–965 | 2026-10-21 | R-UTAS-051 |
| C168 | 966–969 | 2026-10-21 | R-UTAS-150 |
| C169 | 970–973 | 2026-10-21 | R-UTAS-060, R-UTAS-135 |
| C170 | 974–977 | 2026-10-21 | R-UTAS-061 |
| C171 | 978–981 | 2026-10-21 | R-UTAS-055 |
| C172 | 982–985 | 2026-10-21 | R-UTAS-062 |
| C173 | 986–989 | 2026-10-22 | R-UTAS-063 |
| C174 | 990–993 | 2026-10-22 | R-UTAS-064 |
| C175 | 994–997 | 2026-10-22 | R-UTAS-035, R-UTAS-064 |
| C176 | 998–1004 | 2026-10-22 | R-UTAS-035, R-UTAS-064 |
| C177 | 1005–1008 | 2026-10-22 | R-UTAS-122 |
| C178 | 1009–1012 | 2026-10-22 | R-UTAS-121, R-UTAS-122 |
| C179 | 1013–1016 | 2026-10-22 | R-UTAS-054 |
| C180 | 1017–1020 | 2026-10-22 | R-UTAS-065 |
| C181 | 1021–1024 | 2026-10-22 | R-UTAS-122 |
| C182 | 1025–1051 | 2026-10-22 | R-UTAS-066 |
| C183 | 1052–1055 | 2026-10-22 | R-UTAS-064 |
| C184 | 1056–1059 | 2026-10-22 | R-UTAS-067 |
| C185 | 1060–1063 | 2026-10-22 | R-UTAS-067 |
| C186 | 1064–1067 | 2026-10-22 | R-UTAS-067 |
| C187 | 1068–1071 | 2026-10-22 | R-UTAS-067 |
| C188 | 1072–1075 | 2026-10-22 | R-UTAS-121 |
| C189 | 1076–1079 | 2026-10-22 | R-UTAS-067 |
| C190 | 1080–1133 | 2026-10-30 | R-UTAS-068 |
| C191 | 1134–1137 | 2026-10-31 | R-UTAS-069 |
| C192 | 1138–1160 | 2026-10-31 | R-UTAS-121, R-UTAS-168 |
| C193 | 1161–1166 | 2026-10-31 | R-UTAS-070 |
| C194 | 1167–1170 | 2026-10-31 | R-UTAS-057, R-UTAS-070 |
| C195 | 1171–1174 | 2026-10-31 | R-UTAS-121 |
| C196 | 1175–1178 | 2026-10-31 | R-UTAS-069 |
| C197 | 1179–1182 | 2026-11-01 | R-UTAS-071 |
| C198 | 1183–1186 | 2026-11-01 | R-UTAS-121 |
| C199 | 1187–1190 | 2026-11-01 | R-UTAS-071, R-UTAS-122 |
| C200 | 1191–1194 | 2026-11-01 | R-UTAS-150 |
| C201 | 1195–1198 | 2026-11-02 | R-UTAS-039, R-UTAS-054, R-UTAS-072, R-UTAS-073 |
| C202 | 1199–1202 | 2026-11-02 | R-UTAS-121 |
| C203 | 1203–1206 | 2026-11-02 | R-UTAS-054, R-UTAS-074 |
| C204 | 1207–1210 | 2026-11-02 | R-UTAS-074 |
| C205 | 1211–1214 | 2026-11-15 | R-UTAS-075, R-UTAS-076, R-UTAS-077 |
| C206 | 1215–1218 | 2026-11-15 | R-UTAS-078 |
| C207 | 1219–1222 | 2026-11-16 | R-UTAS-079, R-UTAS-098 |
| C208 | 1223–1226 | 2026-11-16 | R-UTAS-075 |
| C209 | 1227–1232 | 2026-11-16 | R-UTAS-080, R-UTAS-081 |
| C210 | 1233–1236 | 2026-11-16 | R-UTAS-075, R-UTAS-080, R-UTAS-081 |
| C211 | 1237–1240 | 2026-11-16 | R-UTAS-082 |
| C212 | 1241–1244 | 2026-11-16 | R-UTAS-082 |
| C213 | 1245–1248 | 2026-11-16 | R-UTAS-098 |
| C214 | 1249–1252 | 2026-11-16 | Működést visszajelző nyugta; az üzenet nem nevezi meg a funkciót. |
| C215 | 1253–1256 | 2026-11-16 | R-UTAS-034 |
| C216 | 1257–1260 | 2026-11-16 | R-UTAS-085 |
| C217 | 1261–1264 | 2026-11-16 | R-UTAS-054 |
| C218 | 1265–1268 | 2026-11-16 | R-UTAS-086 |
| C219 | 1269–1272 | 2026-11-16 | R-UTAS-086 |
| C220 | 1273–1276 | 2026-11-16 | R-UTAS-019 |
| C221 | 1277–1280 | 2026-11-16 | R-UTAS-071, R-UTAS-087 |
| C222 | 1281–1284 | 2026-11-16 | R-UTAS-083 |
| C223 | 1285–1288 | 2026-11-16 | R-UTAS-082 |
| C224 | 1289–1292 | 2026-11-16 | R-UTAS-084 |
| C225 | 1293–1296 | 2026-11-16 | R-UTAS-079 |
| C226 | 1297–1300 | 2026-11-17 | R-UTAS-077 |
| C227 | 1301–1304 | 2026-11-17 | R-UTAS-122 |
| C228 | 1305–1308 | 2026-11-17 | R-UTAS-077 |
| C229 | 1309–1312 | 2026-11-17 | R-UTAS-085 |
| C230 | 1313–1316 | 2026-11-17 | R-UTAS-071, R-UTAS-122 |
| C231 | 1317–1320 | 2026-11-17 | R-UTAS-087 |
| C232 | 1321–1324 | 2026-11-17 | R-UTAS-079 |
| C233 | 1325–1328 | 2026-11-17 | R-UTAS-088 |
| C234 | 1329–1332 | 2026-11-17 | R-UTAS-088 |
| C235 | 1333–1336 | 2026-11-17 | R-UTAS-088 |
| C236 | 1337–1340 | 2026-11-17 | R-UTAS-088 |
| C237 | 1341–1344 | 2026-11-17 | R-UTAS-122 |
| C238 | 1345–1348 | 2026-11-17 | R-UTAS-089 |
| C239 | 1349–1354 | 2026-11-17 | R-UTAS-088 |
| C240 | 1355–1358 | 2026-11-17 | R-UTAS-088 |
| C241 | 1359–1362 | 2026-11-17 | R-UTAS-090 |
| C242 | 1363–1366 | 2026-11-17 | R-UTAS-091 |
| C243 | 1367–1370 | 2026-11-17 | R-UTAS-091 |
| C244 | 1371–1374 | 2026-11-17 | R-UTAS-091 |
| C245 | 1375–1378 | 2026-11-17 | R-UTAS-091 |
| C246 | 1379–1382 | 2026-11-17 | R-UTAS-091 |
| C247 | 1383–1388 | 2026-11-17 | R-UTAS-092 |
| C248 | 1389–1392 | 2026-11-17 | R-UTAS-092 |
| C249 | 1393–1398 | 2026-11-17 | R-UTAS-093 |
| C250 | 1399–1404 | 2026-11-17 | R-UTAS-086, R-UTAS-091 |
| C251 | 1405–1408 | 2026-11-17 | R-UTAS-094 |
| C252 | 1409–1412 | 2026-11-17 | R-UTAS-037 |
| C253 | 1413–1418 | 2026-11-17 | R-UTAS-095 |
| C254 | 1419–1422 | 2026-11-17 | R-UTAS-096 |
| C255 | 1423–1426 | 2026-11-17 | R-UTAS-096 |
| C256 | 1427–1430 | 2026-11-17 | R-UTAS-088 |
| C257 | 1431–1434 | 2026-11-18 | R-UTAS-097 |
| C258 | 1435–1438 | 2026-11-18 | R-UTAS-097 |
| C259 | 1439–1442 | 2026-11-18 | R-UTAS-097 |
| C260 | 1443–1455 | 2026-11-18 | R-UTAS-098 |
| C261 | 1456–1459 | 2026-11-18 | R-UTAS-098 |
| C262 | 1460–1465 | 2026-11-18 | R-UTAS-091, R-UTAS-099, R-UTAS-100 |
| C263 | 1466–1469 | 2026-11-18 | R-UTAS-101 |
| C264 | 1470–1473 | 2026-11-18 | R-UTAS-102 |
| C265 | 1474–1483 | 2026-11-18 | R-UTAS-103, R-UTAS-104, R-UTAS-105 |
| C266 | 1484–1487 | 2026-11-18 | R-UTAS-103 |
| C267 | 1488–1491 | 2026-11-18 | R-UTAS-092 |
| C268 | 1492–1495 | 2026-11-18 | R-UTAS-054 |
| C269 | 1496–1499 | 2026-11-18 | Véletlen leütés, C270 kifejezetten visszavonta. |
| C270 | 1500–1503 | 2026-11-18 | R-UTAS-122 |
| C271 | 1504–1507 | 2026-11-18 | R-UTAS-087, R-UTAS-110 |
| C272 | 1508–1511 | 2026-11-18 | R-UTAS-105 |
| C273 | 1512–1515 | 2026-11-18 | R-UTAS-106 |
| C274 | 1516–1519 | 2026-11-18 | R-UTAS-107 |
| C275 | 1520–1523 | 2026-11-18 | R-UTAS-108 |
| C276 | 1524–1527 | 2026-11-18 | R-UTAS-109, R-UTAS-110 |
| C277 | 1528–1531 | 2026-11-18 | R-UTAS-109, R-UTAS-110 |
| C278 | 1532–1535 | 2026-11-18 | R-UTAS-109, R-UTAS-110 |
| C279 | 1536–1539 | 2026-11-18 | R-UTAS-111 |
| C280 | 1540–1543 | 2026-11-18 | R-UTAS-111 |
| C281 | 1544–1547 | 2026-11-18 | R-UTAS-111 |
| C282 | 1548–1551 | 2026-11-18 | R-UTAS-098, R-UTAS-112, R-UTAS-121 |
| C283 | 1552–1555 | 2026-11-18 | R-UTAS-112, R-UTAS-149 |
| C284 | 1556–1559 | 2026-11-19 | R-UTAS-122 |
| C285 | 1560–1563 | 2026-11-19 | Keretemelés bejelentése, önálló fejlesztési kérés nélkül. |
| C286 | 1564–1567 | 2026-11-19 | R-UTAS-098, R-UTAS-112, R-UTAS-121, R-UTAS-122 |
| C287 | 1568–1571 | 2026-11-19 | R-UTAS-054 |
| C288 | 1572–1575 | 2026-11-19 | R-UTAS-122 |
| C289 | 1576–1579 | 2026-11-19 | R-UTAS-112 |
| C290 | 1580–1583 | 2026-11-19 | R-UTAS-113 |
| C291 | 1584–1587 | 2026-11-19 | R-UTAS-114 |
| C292 | 1588–1591 | 2026-11-19 | R-UTAS-115 |
| C293 | 1592–1595 | 2026-11-19 | R-UTAS-116 |
| C294 | 1596–1600 | 2026-11-19 | R-UTAS-116, R-UTAS-117 |
| C295 | 1601–1604 | 2026-11-19 | R-UTAS-116, R-UTAS-117 |
| C296 | 1605–1608 | 2026-11-19 | R-UTAS-109, R-UTAS-110, R-UTAS-112, R-UTAS-121 |
| C297 | 1609–1612 | 2026-11-19 | R-UTAS-118 |
| C298 | 1613–1616 | 2026-11-19 | R-UTAS-092, R-UTAS-109, R-UTAS-110 |
| C299 | 1617–1620 | 2026-11-19 | R-UTAS-119 |
| C300 | 1621–1624 | 2026-11-19 | R-UTAS-119 |
| C301 | 1625–1628 | 2026-11-20 | R-UTAS-119 |
| C302 | 1629–1632 | 2026-11-20 | R-UTAS-119, R-UTAS-122 |
| C303 | 1633–1636 | 2026-11-20 | R-UTAS-119, R-UTAS-122 |
| C304 | 1637–1641 | 2026-11-20 | R-UTAS-120 |

### Codex-export

| Üzenet | Forrássorok | Dátum (UTC) | Tétel vagy elhatárolás |
|---|---:|---|---|
| X1 | 3–61 | 2026-09-15 | Külső munkakönyvtár környezetleírása, termékutasítás nélkül. |
| X2 | 62–65 | 2026-09-15 | Magánjellegű, más tárgyú kérdés. |
| X3 | 66–69 | 2026-09-15 | A privát külső kérdés dokumentumának átadása. |
| X4 | 70–77 | 2026-11-11 | Más témájú korábbi PDF letöltése. |
| X5 | 78–81 | 2026-11-19 | R-UTAS-123 |
| X6 | 82–85 | 2026-11-19 | Külső repó briefje, 021b ellenőrzése. |
| X7 | 86–89 | 2026-11-19 | Külső repó briefje, 021b ellenőrzése. |
| X8 | 90–93 | 2026-11-19 | Külső repó briefje, 021b ellenőrzése. |
| X9 | 94–163 | 2026-11-19 | R-UTAS-118 |
| X10 | 164–190 | 2026-11-19 | R-UTAS-118 |
| X11 | 191–194 | 2026-11-19 | Külső repó briefje, 022c ellenőrzése. |
| X12 | 195–198 | 2026-11-19 | Külső repó briefje, 022c ellenőrzése. |
| X13 | 199–202 | 2026-11-19 | Külső repó briefje, 022c ellenőrzése. |
| X14 | 203–206 | 2026-11-19 | Külső repó briefje, 022c ellenőrzése. |
| X15 | 207–210 | 2026-11-19 | Külső repó briefje, JVM-tesztek ellenőrzése. |
| X16 | 211–214 | 2026-11-19 | Külső repó briefje, JVM-tesztek ellenőrzése. |
| X17 | 215–218 | 2026-11-19 | Külső repó briefje, JVM-tesztek ellenőrzése. |
| X18 | 219–222 | 2026-11-19 | Külső repó briefje, banki levél ellenőrzése. |
| X19 | 223–226 | 2026-11-19 | Külső repó briefje, banki levél ellenőrzése. |
| X20 | 227–230 | 2026-11-19 | Külső repó briefje, banki levél ellenőrzése. |
| X21 | 231–234 | 2026-11-19 | Külső repó briefje, 022d ellenőrzése. |
| X22 | 235–238 | 2026-11-19 | Külső repó briefje, 022d ellenőrzése. |
| X23 | 239–242 | 2026-11-20 | Külső repó briefje, 023 tesztdiff ellenőrzése. |
| X24 | 243–246 | 2026-11-20 | Külső repó briefje, 023 tesztdiff ellenőrzése. |
| X25 | 247–250 | 2026-11-20 | R-UTAS-123 |
| X26 | 251–253 | 2026-11-20 | A hivatkozott teljesrevízió-briefet visszaolvasva a cél az EC-Residence. Az azonos napú WEBSULI-megbízás forrása C304. |


### Git-napló · 2025. december – 2026. november

A G-szám a változatlan export fizikai sora. A következő tárgymutató minden sort egyszer helyez el. Első illeszkedés szerinti tárgyszó-besorolás, az összevonások külön soron szerepelnek. Ez visszakeresési segédlet. A döntések bizonyítékai a tételekben felsorolt konkrét PR-ok, commitok, dokumentumok és tesztfájlok. Egy implementációs vagy összevonási commitból önálló tulajdonosi ígéretre csak további forrás alapján következtettünk.

| Időszak | Commit |
|---|---:|
| 2025-12 | 114 |
| 2026-01 | 95 |
| 2026-02 | 64 |
| 2026-03 | 25 |
| 2026-04 | 25 |
| 2026-05 | 4 |
| 2026-06 | 11 |
| 2026-07 | 4 |
| 2026-08 | 3 |
| 2026-09 | 587 |
| 2026-10 | 542 |
| 2026-11 | 200 |
| **Összesen** | **1674** |

**Játékok és játékosfiókok** (219 sor) · 134, 278–292, 295–296, 298–300, 302–303, 305–306, 308, 310–318, 320–321, 323, 325, 330–333, 335, 337, 350, 363, 368–370, 381–382, 407, 430–444, 446–449, 451–453, 462, 464, 466, 469, 485, 493, 496, 498, 665–666, 745–756, 758, 763, 766, 778–781, 783, 785–786, 788, 790, 793–795, 797–800, 803, 805, 807–809, 822–825, 828, 834, 836–837, 839–847, 854, 857, 859, 862, 874, 877–878, 880, 1095, 1245, 1296, 1457, 1557, 1586–1621, 1623–1626, 1628, 1630–1637, 1639, 1641–1645, 1647–1648, 1651–1653, 1657–1658, 1662–1664, 1666, 1669, 1671.

**Tartalom, leckegyártás és nyelvi funkciók** (848 sor) · 3, 20, 28–31, 36, 41, 43–44, 60–74, 76–79, 81–83, 85–87, 89–90, 93–104, 107–108, 111, 113–116, 118–119, 121–122, 131, 149, 159, 168, 172, 174, 190, 192–194, 205, 208, 211–212, 217, 224, 228, 230–234, 237–239, 245, 248, 250, 255, 259–261, 270–272, 277, 294, 307, 328–329, 334, 344, 355, 361, 364–365, 367, 372, 375–378, 380, 384–388, 390–394, 396–399, 401–406, 408, 410–417, 420–424, 426–429, 445, 450, 454–459, 463, 465, 471–484, 486–487, 489–490, 495, 500–502, 504–511, 513, 516, 518–519, 521–523, 525–526, 528–532, 534–535, 537–538, 541–546, 550, 552, 554–557, 560, 562, 565, 567, 571, 573, 575–578, 580, 582, 584, 586, 588–590, 592, 594–595, 597–599, 601, 603–604, 606, 608–610, 612, 614, 616–617, 619–620, 622, 624, 626, 628–629, 631, 633, 635–636, 639–641, 643, 645–646, 648–649, 651–653, 655–656, 658, 660–661, 663, 668–672, 675–676, 678–681, 683, 685–686, 688, 693–694, 697, 699, 701–703, 708–709, 714, 717, 719–720, 722–723, 725–726, 728, 730, 732, 734–736, 738, 740, 742–744, 759–762, 764, 769, 771–773, 777, 782, 784, 789, 792, 801, 813–815, 817–818, 820, 826–827, 831–832, 835, 838, 851, 853, 863–864, 866–868, 870–871, 875–876, 881–883, 886–889, 891, 894–895, 897–898, 900–901, 903–904, 906, 908–909, 911–914, 916–918, 920–921, 923–924, 926–927, 929–930, 932–933, 935–936, 938–940, 942–943, 945–946, 948, 950–952, 954–955, 958–959, 961, 963, 965–966, 968–971, 973, 975–977, 979–982, 985, 987–992, 994–995, 997–998, 1000–1002, 1004–1007, 1009–1017, 1019–1020, 1022–1041, 1043, 1047–1049, 1051–1058, 1060–1063, 1066–1067, 1070, 1075–1078, 1080–1083, 1085–1094, 1098–1101, 1110–1112, 1114–1126, 1128–1139, 1141–1149, 1151–1154, 1156–1157, 1159, 1161–1165, 1167–1168, 1170–1171, 1174–1175, 1177–1181, 1183–1184, 1186–1187, 1189, 1191–1199, 1201–1204, 1206–1210, 1212–1215, 1217, 1220–1221, 1223–1225, 1231, 1234–1236, 1238–1241, 1244, 1246–1247, 1249, 1251–1252, 1254–1255, 1257–1263, 1265–1270, 1272–1280, 1283, 1285–1286, 1288, 1290–1291, 1293, 1301–1302, 1305–1306, 1310–1317, 1320, 1322–1323, 1329, 1331, 1333–1334, 1338–1341, 1345–1346, 1350–1355, 1362–1363, 1365, 1367–1369, 1371–1376, 1378–1380, 1382–1385, 1387, 1389–1393, 1400, 1402–1403, 1406, 1409, 1411–1412, 1420, 1423–1426, 1428, 1430, 1433–1434, 1436–1441, 1443–1456, 1458–1461, 1463–1465, 1467–1473, 1477–1481, 1484–1488, 1490, 1493, 1499–1500, 1502, 1504–1513, 1516, 1518–1526, 1528–1531, 1533, 1535, 1538–1539, 1541–1543, 1549–1551, 1558–1560, 1562–1563, 1570–1577, 1579–1584, 1622, 1627, 1629, 1649–1650, 1655–1656, 1660–1661, 1665, 1667, 1672, 1674.

**Kiadás, tárolás, biztonság és minőségkapu** (255 sor) · 4, 6–7, 9–19, 21–24, 26–27, 32–35, 37, 45–46, 48–50, 55, 57, 59, 80, 88, 91–92, 106, 117, 120, 123–126, 132, 140–141, 143–147, 150–153, 155, 160–161, 164–166, 170–171, 173, 175–176, 179–181, 183–184, 186, 188–189, 191, 195–200, 202, 209–210, 214–216, 220, 227, 229, 235–236, 240–244, 246–247, 251–254, 256–257, 262–269, 273–276, 297, 301, 319, 322, 324, 326–327, 336, 338–341, 343, 345–347, 349, 352–354, 356–360, 362, 366, 371, 373–374, 379, 383, 389, 409, 418–419, 425, 488, 491, 497, 512, 514, 524, 540, 548, 553, 558, 568–570, 673, 689, 692, 695, 802, 812, 931, 956, 1065, 1069, 1073, 1103–1105, 1108, 1140, 1150, 1155, 1160, 1216, 1227–1229, 1232, 1237, 1256, 1281, 1289, 1297–1299, 1303, 1307–1308, 1324–1325, 1327, 1332, 1335, 1342–1343, 1348, 1356–1357, 1364, 1386, 1397–1398, 1410, 1413, 1416–1418, 1422, 1427, 1429, 1431–1432, 1435, 1442, 1462, 1466, 1475, 1491–1492, 1495–1496, 1501, 1517, 1527, 1548, 1555, 1564–1569, 1578, 1585, 1638, 1640, 1654, 1659, 1668, 1670, 1673.

**Felület, megjelenés és egyéb projektmunka** (100 sor) · 1–2, 5, 8, 25, 38–40, 42, 47, 51–54, 56, 58, 75, 84, 105, 109–110, 112, 127–130, 133, 135–139, 142, 148, 154, 156–158, 162, 167, 169, 177–178, 182, 185, 187, 201, 203–204, 206–207, 213, 218–219, 221–223, 225–226, 249, 258, 293, 304, 342, 395, 400, 460, 492, 494, 536, 547, 563, 690, 707, 713, 716, 873, 885, 893, 1018, 1107, 1113, 1127, 1158, 1242, 1248, 1250, 1321, 1330, 1394, 1419, 1421, 1474, 1476, 1482, 1494, 1554, 1556, 1561, 1646.

**Ágak és PR-ok összevonása** (252 sor) · 163, 309, 348, 351, 461, 467–468, 470, 499, 503, 515, 517, 520, 527, 533, 539, 549, 551, 559, 561, 564, 566, 572, 574, 579, 581, 583, 585, 587, 591, 593, 596, 600, 602, 605, 607, 611, 613, 615, 618, 621, 623, 625, 627, 630, 632, 634, 637–638, 642, 644, 647, 650, 654, 657, 659, 662, 664, 667, 674, 677, 682, 684, 687, 691, 696, 698, 700, 704–706, 710–712, 715, 718, 721, 724, 727, 729, 731, 733, 737, 739, 741, 757, 765, 767–768, 770, 774–776, 787, 791, 796, 804, 806, 810–811, 816, 819, 821, 829–830, 833, 848–850, 852, 855–856, 858, 860–861, 865, 869, 872, 879, 884, 890, 892, 896, 899, 902, 905, 907, 910, 915, 919, 922, 925, 928, 934, 937, 941, 944, 947, 949, 953, 957, 960, 962, 964, 967, 972, 974, 978, 983–984, 986, 993, 996, 999, 1003, 1008, 1021, 1042, 1044–1046, 1050, 1059, 1064, 1068, 1071–1072, 1074, 1079, 1084, 1096–1097, 1102, 1106, 1109, 1166, 1169, 1172–1173, 1176, 1182, 1185, 1188, 1190, 1200, 1205, 1211, 1218–1219, 1222, 1226, 1230, 1233, 1243, 1253, 1264, 1271, 1282, 1284, 1287, 1292, 1294–1295, 1300, 1304, 1309, 1318–1319, 1326, 1328, 1336–1337, 1344, 1347, 1349, 1358–1361, 1366, 1370, 1377, 1381, 1388, 1395–1396, 1399, 1401, 1404–1405, 1407–1408, 1414–1415, 1483, 1489, 1497–1498, 1503, 1514–1515, 1532, 1534, 1536–1537, 1540, 1544–1547, 1552–1553.

## KÉSZ · egysoros tételek

Az alábbi sorok a megjelölt részfeladat elkészültét igazolják. A PR száma után a helyi főág történetében azonosított commit áll.

- **Azonosító** — R-UTAS-003 · **Cím** — Haiku–Luna összehasonlító mérés · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — Hasonlítsuk össze a Haiku high és a Luna felismerési pontosságát. · **Forrás** — C3 (2026-10-14, 11. sor), C5 (2026-10-14, 19. sor), C7 (2026-10-14, 27. sor), C8 (2026-10-14, 31. sor) · **Mi van kész** — A docs/specs/2026-10-14-forras-besorolo-openai-luna.md:33–42 a két modell high mérését közli azonos mintán; C8 a Haikut elvetette. #209 (`8851d417`), `source/tests/scope-luna-openai.test.ts:16`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #209 · `source/tests/scope-luna-openai.test.ts:16` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — A titkok maguk nem auditforrások. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-005 · **Cím** — Tömörség és tényfedettség · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A 7.5 skillhez mérve rövidítsük a leckét és őrizzük meg a forrás tényeit. · **Forrás** — C10 (2026-10-14, 39. sor), C11 (2026-10-14, 43. sor) · **Mi van kész** — Azonos forrású próba és végső terjedelmi összevetés került a mainre. A lezárt #211 helyett #213 adta ki a módosítást. #210 (`d1599c05`), #213 (`31b97479`), `source/tests/lesson-length.test.ts:20`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #210, #213 · `source/tests/lesson-length.test.ts:20` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-006 · **Cím** — Eltűnő draft és újrakezdődő gyártás · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Újraindítás és telepítés után látszódjon a piszkozat és mentett szakaszból folytatódjon. · **Forrás** — C18 (2026-10-14, 71. sor), C44 (2026-10-15, 185. sor), C50 (2026-10-16, 209. sor) · **Mi van kész** — A megszakított gyártás visszatöltését, a draftlistát és a kész futás újbóli megnyitását külön javítások fedik. #215 (`77639a38`), #247 (`ec2a86f2`), #253 (`f0b54b2f`), #415 (`7152d299`), `source/tests/restart-resume.test.ts:7`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #215, #247, #253, #415 · `source/tests/restart-resume.test.ts:7` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-007 · **Cím** — Szolgáltatói tartalék az AI-hívásoknál · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — Legyen ellentétes szolgáltatói tartalék a támogató hívásoknál és a webes forrásgyűjtésnél. · **Forrás** — C19 (2026-10-14, 75. sor), C22 (2026-10-15, 87. sor) · **Mi van kész** — A B1–B4 útvonalak történeti bevezetése igazolt. Az egyfutásos motorra C55 vonatkozik. #216 (`59ee12a2`), #217 (`a6a7731b`), #218 (`3e28d29f`), #219 (`76cda655`), #220 (`f5d761d5`), #222 (`76b82631`), `source/tests/web-gather-gpt.test.ts:12`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #216, #217, #218, #219, #220, #222 · `source/tests/web-gather-gpt.test.ts:12` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-009 · **Cím** — Érvénytelen HTML utáni tartalékút · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — Érvénytelen elkészült HTML esetén is induljon teljes tartalékgenerálás. · **Forrás** — C23 (2026-10-15, 91. sor) · **Mi van kész** — A source/server/improveAsync.ts:54 érvénytelen kimenetnél csak az engedélyezett tartalékra vált. A source/tests/cross-family-fallback-b3.test.ts:93 ezt az üres, rövid, nem HTML és kapun elbukott eredményre is ellenőrzi. #219 (`76cda655`), #221 (`52bdfbc8`), `source/tests/cross-family-fallback-b3.test.ts:93`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #219, #221 · `source/tests/cross-family-fallback-b3.test.ts:93` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — A többlethívásra C23 tartalmazza az akkori engedélyt. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-011 · **Cím** — Automatikus helyreállítás a kerethatáron · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — A keretkimerülés után működjön automatikus helyreállítás, szerzői javítással és végső újragyártással. · **Forrás** — C39 (2026-10-15, 155. sor), C40 (2026-10-15, 159. sor) · **Mi van kész** — A V1–V4 lépcsők mainre kerültek. A Python az üzenetben lehetséges eszköz volt. #233 (`c40e4054`), #234 (`be21b31e`), #237 (`02e7dd42`), `source/tests/recovery-sweep.test.ts:8`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #233, #234, #237 · `source/tests/recovery-sweep.test.ts:8` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-012 · **Cím** — Válaszkulcspróba és rubrikakalibráció · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A válaszkulcsokhoz legyen gépi teszt és rubrikakalibráció. · **Forrás** — C40 (2026-10-15, 159. sor) · **Mi van kész** — A T2 válaszkulcspróba és a gépi kalibráció együtt került mainre. #239 (`4a64c3bb`), `source/tests/answer-key-calibrate.test.ts:17`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #239 · `source/tests/answer-key-calibrate.test.ts:17` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-015 · **Cím** — Háromfázisú sorrend a CI-ben · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást. · **Eredeti utasítás / cél** — A #227 és #232 után kényszerítsük ki a terv, a végrehajtási utasítás és a kód sorrendjét. · **Forrás** — C40 (2026-10-15, 159. sor) · **Mi van kész** — A #236 a dokumentált döntéseket és a háromfázisú rend ellenőrzését vitte mainre. #236 (`a9f95c9e`), `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #236 · `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-016 · **Cím** — Offline gyorsítótár megőrzése · **Állapot** — KÉSZ · **Terület** — infrastruktúra · **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat. · **Eredeti utasítás / cél** — Őrizzük meg az offline PWA gyorsítótárat az új service worker telepítésekor. · **Forrás** — C49 (2026-10-16, 205. sor) · **Mi van kész** — A #207 a telepítést és a böngészős regressziópróbát együtt vitte mainre. #207 (`dd92ba48`), `source/tests/service-worker-install.browser.ts:58`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #207 · `source/tests/service-worker-install.browser.ts:58` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-020 · **Cím** — Egyfutásos gyártás és döntőbíró · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A gyártás a forrástól a közzétételig Opus mediumon menjen, Sol medium tartalékkal. A nyílt válasz döntőbírója is ezt a párt használja. · **Forrás** — C55 (2026-10-16, 231. sor) · **Mi van kész** — S1–S4b bevezette az egyfutásos beszélgetést és kivezette a régi lépésgépet. A bank párhuzamosítását C68 később engedte. #258 (`3b6a8eb6`), #259 (`aea57914`), #260 (`683bb0fd`), #261 (`0b5f1348`), #262 (`93c0c642`), `source/tests/single-run-engine.test.ts:82`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #258, #259, #260, #261, #262 · `source/tests/single-run-engine.test.ts:82` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-022 · **Cím** — Párhuzamos bankgyártás Opusszal · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A bank olcsóbb jelöltjeinek mérését zárjuk le, maradjon Opus medium és legyen szabályozható, akár öt párhuzamos fejezet. · **Forrás** — C63 (2026-10-16, 272. sor), C64 (2026-10-16, 280. sor), C66 (2026-10-16, 288. sor), C67 (2026-10-16, 292. sor), C68 (2026-10-16, 296. sor), C69 (2026-10-16, 300. sor) · **Mi van kész** — A 2026-10-16-i C66 leállította a kiválasztást, C68 a minimum helyett mediumot választott. A #265 tartalmazza a párhuzamos motort és mérését. A source/server/studio/experience-builder.ts:212 az ötös csomagkeretet rögzíti. #265 (`5a6aaa1f`), `source/tests/parallel-bank.test.ts:10`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #265 · `source/tests/parallel-bank.test.ts:10` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-024 · **Cím** — Eldobható próbaadatbázis · **Állapot** — KÉSZ · **Terület** — infrastruktúra · **Prioritás-javaslat** — P1. A hiba szolgáltatáskiesést vagy adatvesztést okozhat. · **Eredeti utasítás / cél** — A böngészős és adatbázisos próbák eldobható PostgreSQL-en fussanak. · **Forrás** — C65 (2026-10-16, 284. sor), C97 (2026-10-18, 644. sor) · **Mi van kész** — A #296 kizárta az éles adatbázist az e2e úton, a #399 a DB-integrációs próbákat CI-be kötötte. #296 (`bdbe118f`), #399 (`41c5cb92`), `docs/specs/2026-11-05-ci-learning-db.md:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #296, #399 · `docs/specs/2026-11-05-ci-learning-db.md:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-026 · **Cím** — A grafikai csomag beépítése · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A kapott designleírás szerint készüljenek a leckék, legyen saját tipográfia, sávarculat, tantárgyi ikon és ismétlőkártya. · **Forrás** — C71 (2026-10-16, 308. sor), C75 (2026-10-16, 326. sor), C81 (2026-10-17, 350. sor), C86 (2026-10-17, 370. sor) · **Mi van kész** — A designcsomag A–D szeletei és a jóváhagyott grafikai táblázat a mainen követhetők. #266 (`6fe6db24`), #267 (`7c2f6a36`), #268 (`9fab99bd`), #269 (`cc6edb36`), #272 (`bf8a511b`), #273 (`e475387a`), #274 (`ea469791`), `source/tests/subject-icon.spec.ts:8`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #266, #267, #268, #269, #272, #273, #274 · `source/tests/subject-icon.spec.ts:8` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-028 · **Cím** — Tanulói dashboard mintafájl · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P3. A változtatás a megjelenítést pontosítja. · **Eredeti utasítás / cél** — A tanulói irányítópultról készüljön mentett HTML-minta éles bekötés nélkül. · **Forrás** — C76 (2026-10-17, 330. sor), C77 (2026-10-17, 334. sor) · **Mi van kész** — A #270 kifejezetten megőrzött mintaként vitte mainre. #270 (`cb640ec8`), `docs/design/Websuli_Tanuloi_Keret_Minta.html:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #270 · `docs/design/Websuli_Tanuloi_Keret_Minta.html:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-030 · **Cím** — Lecke megnyitásakor felvillanó újrarajzolás · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Megnyitáskor szűnjön meg a regenerálásnak látszó villanás, az arculat mentéskor rögzüljön. · **Forrás** — C87 (2026-10-17, 604. sor), C93 (2026-10-18, 628. sor) · **Mi van kész** — A tárolt arculat, az egységes első festés és a régi leckék visszatölthető backfillje mainre került. Maga a villanás nem igazolta, hogy modellhívás történt. #275 (`478df720`), #276 (`3a25b0f1`), #283 (`41dea926`), `source/tests/stored-art.test.ts:11`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #275, #276, #283 · `source/tests/stored-art.test.ts:11` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-031 · **Cím** — NAT szerinti heti rendezés · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A főlista és az évfolyamlista a NAT 2020 szerinti aktuális hetet részesítse előnyben, nyelvi tanmenettel és tartalmi illesztéssel. · **Forrás** — C88 (2026-10-17, 608. sor), C97 (2026-10-18, 644. sor) · **Mi van kész** — A naptári rendezést az iskolai nyelvi források és a tartalom alapú felismerés követte. #282 (`939b3887`), #284 (`6fe9ba2e`), `source/tests/curriculum-order.spec.ts:5`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #282, #284 · `source/tests/curriculum-order.spec.ts:5` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-033 · **Cím** — Feliratszótár és díszítőelem-bank · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A díszítőelemek generálását váltsa ki közös arculati bank és feliratszótár. · **Forrás** — C97 (2026-10-18, 644. sor) · **Mi van kész** — A #285 a kódbeli szótárt és a generált flair kivezetését együtt szállította. #285 (`aacfbadd`), `source/tests/lesson-ui-text.test.ts:8`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #285 · `source/tests/lesson-ui-text.test.ts:8` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-035 · **Cím** — Reggeli ismétlés és publikáláskori értesítés · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — Reggel menjen a tanmenethez igazodó ismétlőlevél, publikáláskor külön az új lecke évfolyam szerinti értesítője. · **Forrás** — C98 (2026-10-18, 656. sor), C120 (2026-10-19, 752. sor), C175 (2026-10-22, 994. sor), C176 (2026-10-22, 998. sor) · **Mi van kész** — A napi emlékeztetőt a #365 az ismétlésre szűkítette. A közvetlen leckeút és a külön megjelenési értesítő verziózott. #292 (`fc70aa4f`), #294 (`52d70b35`), #365 (`51d55dee`), `source/tests/uj-lecke-ertesito.test.ts:7`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #292, #294, #365 · `source/tests/uj-lecke-ertesito.test.ts:7` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-038 · **Cím** — Fejlesztői felhőkörnyezet · **Állapot** — KÉSZ · **Terület** — infrastruktúra · **Prioritás-javaslat** — P2. A kért üzemeltetési állapotot vissza kell igazolni. · **Eredeti utasítás / cél** — Legyen WEBSULI-felhőkörnyezet és követhető beüzemelési leírás. · **Forrás** — C108 (2026-10-18, 696. sor), C110 (2026-10-18, 704. sor) · **Mi van kész** — A #307 a repo leírását tartalmazza, a korabeli létrehozást a codex-cloud-env-docs.md:11 rögzíti. C110 többi projektje kívül esik ezen a repón. #307 (`301ca824`), `docs/codex-felhokornyezet.md:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #307 · `docs/codex-felhokornyezet.md:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-041 · **Cím** — Személyre szabott délutáni hírlevél · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — Az engedélyezett családi tanulók érdeklődésükhöz illő magyar cikket és leckét kapjanak délután négykor. · **Forrás** — C118 (2026-10-19, 738. sor), C119 (2026-10-19, 748. sor), C120 (2026-10-19, 752. sor) · **Mi van kész** — A hírlevél kapcsolója, forrásválasztása és napi küldése szerepel a két szeletben. Az élő kézbesítés külön megfigyelés. #312 (`0d29f413`), #315 (`17e84334`), `source/tests/newsletter-db.integration.ts:51`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #312, #315 · `source/tests/newsletter-db.integration.ts:51` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-042 · **Cím** — Tanulók fül mobilon · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Mobilon a Tanulók menüpont neve jelezze a mögöttes funkciót. · **Forrás** — C122 (2026-10-19, 764. sor), C123 (2026-10-19, 768. sor) · **Mi van kész** — A #316 a mobilmenü és az admincsoportok feliratait javította. #316 (`620a3544`), `source/tests/admin-korszerusites.spec.ts:4`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #316 · `source/tests/admin-korszerusites.spec.ts:4` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-043 · **Cím** — Elkészült webes gyártás fogva tartja az indítást · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Elkészült internetes gyártás után új kereséses tananyag indulhasson. · **Forrás** — C124 (2026-10-19, 772. sor) · **Mi van kész** — A #317 kifejezetten a korábbi futás után újraindítható felületet szállította. #317 (`69609131`), `source/tests/web-research-completion.spec.ts:4`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #317 · `source/tests/web-research-completion.spec.ts:4` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-044 · **Cím** — Régi HTML mobilos kiválasztása · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Telefonon is lehessen régebbi HTML-anyagot választani javításra. · **Forrás** — C126 (2026-10-19, 780. sor) · **Mi van kész** — A #318 a keresőt, az évfolyamot, a régi HTML-listát és a mobilos elhelyezést javította. #318 (`db8b9d70`), `source/tests/lesson-repair-search.test.ts:18`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #318 · `source/tests/lesson-repair-search.test.ts:18` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-046 · **Cím** — Lecsúszó feltöltési és újragyártási gomb · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — A feltöltés és újragyártás gombja elérhető maradjon az összecsukható telefon mindkét kijelzőjén. · **Forrás** — C129 (2026-10-19, 794. sor) · **Mi van kész** — A #321 a külső és belső nézet reszponzivitását javította az adminoldalakon. #321 (`51779299`), `source/tests/admin-responsive.spec.ts:10`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #321 · `source/tests/admin-responsive.spec.ts:10` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-050 · **Cím** — Okosítás fázissora · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Okosítás és javítás közben mindig látszódjon az aktuális fázis és a fázissorrend. · **Forrás** — C134 (2026-10-19, 818. sor) · **Mi van kész** — A #323 állandó fázissort és elárvult okosítások lezárását tartalmazza. #323 (`17e98afa`), `source/tests/phase-bar.spec.ts:8`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #323 · `source/tests/phase-bar.spec.ts:8` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-055 · **Cím** — Június előtti HTML-ek átalakítása · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A június előtti régi HTML-ekből helyben teljes Stúdió-leckék készüljenek, ötös ellenőrzési ciklusokban. · **Forrás** — C153 (2026-10-20, 899. sor), C154 (2026-10-21, 905. sor), C157 (2026-10-21, 917. sor), C161 (2026-10-21, 935. sor), C164 (2026-10-21, 947. sor), C171 (2026-10-21, 978. sor) · **Mi van kész** — A legacy-migration-cycles.md:12 korabeli összesítése 178/178 kész és nulla hiba. A #352 bevezette az ötös felülvizsgálatot, a #357 és #359 a célzott javítást. #349 (`fcd57053`), #352 (`75cd6e74`), #353 (`1049fe03`), #357 (`67d88d20`), #359 (`2945e2a2`), #361 (`f47bf7a1`), `source/tests/regi-anyag-studio.test.ts:12`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #349, #352, #353, #357, #359, #361 · `source/tests/regi-anyag-studio.test.ts:12` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-058 · **Cím** — Mentés közben sérülő karakterek · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — A mentés ne rontsa el az ékezetes szöveget vagy a kettévágott emojit. · **Forrás** — C162 (2026-10-21, 939. sor) · **Mi van kész** — A mojibake-őr és a job mentésének emoji-javítása bekerült. #355 (`9903713e`), #356 (`76ffa45e`), `source/tests/ciklus5-mentes-felkarakter.test.ts:12`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #355, #356 · `source/tests/ciklus5-mentes-felkarakter.test.ts:12` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-069 · **Cím** — Magyar oktatóvideók a hírlevélben · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A napi cikkajánló ellenőrzött magyar oktató YouTube-csatornákról is ajánljon videót. · **Forrás** — C191 (2026-10-31, 1134. sor), C196 (2026-10-31, 1175. sor) · **Mi van kész** — A #369 összevonva, a csatornaválasztás és a hírlevél összekötése a főágon van. #369 (`51156c78`), `source/tests/youtube-channels.test.ts:9`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #369 · `source/tests/youtube-channels.test.ts:9` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-070 · **Cím** — Kamera a tananyagkészítőben · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A tananyagkészítőben közvetlenül a telefon saját kamerájával is lehessen tankönyvoldalt beolvasni. · **Forrás** — C193 (2026-10-31, 1161. sor), C194 (2026-10-31, 1167. sor) · **Mi van kész** — A #370 bevezette a fényképezés gombot és a készítőfolyamatba kötött kamerás bemenetet. #370 (`b7a5da15`), `source/tests/camera-capture.spec.ts:9`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #370 · `source/tests/camera-capture.spec.ts:9` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-071 · **Cím** — Befejezési mandátum · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást. · **Eredeti utasítás / cél** — A spec és végrehajtás legyen teljes, minden feladat végén legyen tételes teljességellenőrzés és független átvizsgálás. · **Forrás** — C197 (2026-11-01, 1179. sor), C199 (2026-11-01, 1187. sor), C221 (2026-11-16, 1277. sor), C230 (2026-11-17, 1313. sor) · **Mi van kész** — A befejezési mandátum, a csapdakatalógus és a független helyi kapufolyamat külön main-commitokkal igazolható. #372 (`0c914eec`), #391 (`5018f01e`), #489 (`26bae97f`), `AGENTS.md:123`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #372, #391, #489 · `AGENTS.md:123` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-072 · **Cím** — Ellenőrzési effort összehasonlítása · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — Az ellenőrző fokozat költségét kontrollált A/B mérés döntse el. · **Forrás** — C201 (2026-11-02, 1195. sor) · **Mi van kész** — A #373-ban a négy tiszta pár ellenőrzési megtakarítása átlagosan 39,7%, a 40%-os küszöb alatt maradt. A döntés medium. #373 (`333bfcd4`), `source/tests/check-effort.test.ts:8`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #373 · `source/tests/check-effort.test.ts:8` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-076 · **Cím** — Változatos nyelvi játékbankok · **Állapot** — KÉSZ · **Terület** — játékok · **Prioritás-javaslat** — P2. Kifejezett játékélmény- vagy tartalmi kérés. · **Eredeti utasítás / cél** — A nyelvi játékok kapjanak változatos angol, francia és német szó- és kifejezésbankot, ismétlést figyelő kiválasztással. · **Forrás** — C205 (2026-11-15, 1211. sor) · **Mi van kész** — A három nyelvi készlet, a vak megoldók, az átfedő elterelők szűrése és a játékközi napló főágon van. #421 (`9f87c942`), #427 (`e51c9926`), #428 (`cf5b591c`), #431 (`4075df5c`), #432 (`0b386870`), #437 (`b5041240`), #477 (`bab40853`), `source/tests/vocab-cross-game-log.spec.ts:3`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #421, #427, #428, #431, #432, #437, #477 · `source/tests/vocab-cross-game-log.spec.ts:3` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-082 · **Cím** — Önregisztráció és elkülönített adminjog · **Állapot** — KÉSZ · **Terület** — fiók-közös játék · **Prioritás-javaslat** — P1. Jogosultságot, játékosadatot vagy hozzáférést érint. · **Eredeti utasítás / cél** — A diák regisztrálhasson saját e-maillel, a Google-játékfiók pedig ne léphessen be az adminfelületre. · **Forrás** — C211 (2026-11-16, 1237. sor), C212 (2026-11-16, 1241. sor), C223 (2026-11-16, 1285. sor) · **Mi van kész** — A játékos Google-út és a külön admin-engedélylista szerepmátrixa mainen van. C223 a történeti adminbelépést is visszaigazolja. #445 (`9bda1373`), #449 (`50605100`), #462 (`015b5a9a`), `source/tests/player-admin-isolation.spec.ts:57`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #445, #449, #462 · `source/tests/player-admin-isolation.spec.ts:57` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-083 · **Cím** — Tiltási lenyomat megőrzése · **Állapot** — KÉSZ · **Terület** — biztonság · **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint. · **Eredeti utasítás / cél** — A törölt, tiltott játékfiók tiltási lenyomata legfeljebb tizenkét hónapig maradjon meg. · **Forrás** — C222 (2026-11-16, 1281. sor) · **Mi van kész** — A rövid C222 válasz tárgyát a fiók-retro és a #471/#475 tárolási és karbantartási szabálya azonosítja. #471 (`5cb3cd3e`), #475 (`b826932d`), `source/tests/player-account-db.integration.ts:83`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #471, #475 · `source/tests/player-account-db.integration.ts:83` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-085 · **Cím** — Lomha érintős joystick · **Állapot** — KÉSZ · **Terület** — játékok · **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot. · **Eredeti utasítás / cél** — A joystick maradjon meg, finoman és késés nélkül lehessen vele kormányozni. · **Forrás** — C216 (2026-11-16, 1257. sor), C229 (2026-11-17, 1309. sor) · **Mi van kész** — A #456 egyetlen holtsávra és folytonos analóg vezérlésre állt át. A #477 érintéses mérést tartalmaz. Az oldalcsere külön kérés. #456 (`9038fce2`), #477 (`bab40853`), `source/tests/joystick-curve.test.ts:28`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #456, #477 · `source/tests/joystick-curve.test.ts:28` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-087 · **Cím** — Kötelező helyi kapuk és független ellenőr · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást. · **Eredeti utasítás / cél** — Kibocsátás előtt lint, minden szakasz után gyors helyi teszt, majd független hibakereső és külön push-, PR-, merge-kapu fusson. · **Forrás** — C231 (2026-11-17, 1317. sor), C221 (2026-11-16, 1277. sor), C271 (2026-11-18, 1504. sor) · **Mi van kész** — Az öt skill, a helyi futtatók, az ellenőri rekord és a blokkoló hook mainre került. A később megadott ellenőrmodell külön tétel. A főági eljárást az AGENTS.md:157–165 írja le. #489 (`26bae97f`), #506 (`14c859ee`), `AGENTS.md:157`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #489, #506 · `AGENTS.md:157` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-094 · **Cím** — Opcionális mondatvégi pont · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Helyes szöveges válasznál az opcionális mondatvégi pont ne okozzon hibát. · **Forrás** — C251 (2026-11-17, 1405. sor) · **Mi van kész** — A #493 normalizálja az írásjelet, szóközt és tipográfiai eltérést. A főágon böngészős regresszió tartozik hozzá. #493 (`56d1a9af`), `source/tests/fill-blank-punctuation.spec.ts:8`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #493 · `source/tests/fill-blank-punctuation.spec.ts:8` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-095 · **Cím** — Rövid helyes válasz pontértéke · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A tartalmilag helyes, de kifejtést igénylő rövid válasz fél pontot érjen. · **Forrás** — C253 (2026-11-17, 1413. sor) · **Mi van kész** — A #509 megvalósította a pontozó rövid válasz ágát. A generálási prompt és döntőbíró további összehangolását P-031 követi. #509 (`a1342ba8`), `source/tests/open-answer-short.spec.ts:11`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #509 · `source/tests/open-answer-short.spec.ts:11` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — P-031

- **Azonosító** — R-UTAS-096 · **Cím** — Brain Rot válaszideje · **Állapot** — KÉSZ · **Terület** — játékok · **Prioritás-javaslat** — P1. A hiba akadályozza a telefonos játékot. · **Eredeti utasítás / cél** — A Brain Rot adjon elég olvasási és válaszidőt. · **Forrás** — C254 (2026-11-17, 1419. sor), C255 (2026-11-17, 1423. sor) · **Mi van kész** — A #497 az olvasási idő szerint ad pótidőt és erre az időre megállítja a menetórát. #497 (`21c81998`), `source/tests/brainrot-pacing.test.ts:29`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #497 · `source/tests/brainrot-pacing.test.ts:29` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-126 · **Cím** — Banktartalék és magyar nyelvi adatbank · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A bank a tényleges minimum fölé 30% tartalékot készítsen, a nyílt feladat maradjon meg, és a nyelvi egyezést közös magyar adatbank segítse. · **Forrás** — C40 (2026-10-15, 159. sor) · **Mi van kész** — A 2026-10-15-i Tételgyár-terv 110–120. sorának D1 és D2 döntését külön bank- és kalibrációs szeletek követték. #226 (`9f452db6`), #228 (`fa84ca93`), #239 (`4a64c3bb`), `source/tests/bank-answer-keys.test.ts:24`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #226, #228, #239 · `source/tests/bank-answer-keys.test.ts:24` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-127 · **Cím** — A kézi és automatikus folytatás kerete · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — Az automatikus folytatás és a tulajdonosi gomb eltérő végrehajtási keretét a felület is helyesen mutassa. · **Forrás** — C40 (2026-10-15, 159. sor), C44 (2026-10-15, 185. sor) · **Mi van kész** — A Tételgyár-terv 136–139. sora négy automatikus és legfeljebb hat explicit végrehajtást rögzít. A #227 és #232 a keretet és a kijelzést módosította. #227 (`658375c8`), #232 (`b5c51681`), `source/tests/studio-generation-recovery.spec.ts:3`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #227, #232 · `source/tests/studio-generation-recovery.spec.ts:3` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-128 · **Cím** — ARM64 és x64 fejlesztői környezet · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P2. A tulajdonos megismételhető fejlesztési eljárást kért. · **Eredeti utasítás / cél** — A fejlesztői környezet működjön Windows ARM64-en és x64-en, architektúránként telepített függőségekkel. · **Forrás** — G1558 (`5018f01e`) · **Mi van kész** — Az AGENTS.md hardverelőírását a #391 natív CI- és diagnosztikai őre, majd a #392 követő javítása támogatja. #391 (`5018f01e`), `source/tests/native-arch.test.ts:12`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #391 · `source/tests/native-arch.test.ts:12` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-130 · **Cím** — Nyilvános nézet és admin elkülönítése · **Állapot** — KÉSZ · **Terület** — biztonság · **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint. · **Eredeti utasítás / cél** — A nyilvános kezdőlap és a Google-admin belépés jogköre legyen külön. · **Forrás** — G3 (`44870a95`), G6 (`ef257e75`), G39 (`e2b70061`), G41 (`dedc13cb`), G216 (`cd4d5aba`) · **Mi van kész** — Az eredeti adminszétválasztást a későbbi engedélylista és a játékos-admin izolációs próba is alátámasztja. #445 (`9bda1373`), #462 (`015b5a9a`), `source/tests/player-admin-isolation.spec.ts:57`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #445, #462 · `source/tests/player-admin-isolation.spec.ts:57` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-131 · **Cím** — Kimenő levelek feladója · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A levelek éles küldőn keresztül menjenek, a hibás beállítás ne tűnjön sikeres küldésnek. · **Forrás** — G26 (`324df6ce`), G27 (`9075ee73`), G319 (`f1eed1d3`) · **Mi van kész** — A kimenő levél történeti átállása után a #205 a sandbox feladót és a csendes hibát kezeli. A későbbi levéltípusok saját próbákat kaptak. #205 (`cb8f467a`), #280 (`ddaff0f2`), #292 (`fc70aa4f`), `source/server/resend.ts:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #205, #280, #292 · `source/server/resend.ts:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-135 · **Cím** — Diktálás beágyazott leckében · **Állapot** — KÉSZ · **Terület** — TTS · **Prioritás-javaslat** — P2. A hangélményre kifejezett elvárás vonatkozik. · **Eredeti utasítás / cél** — A beágyazott idegen nyelvi leckében működjön a diktálási bemenet. · **Forrás** — G328 (`a7c379e9`), C169 (2026-10-21, 970. sor) · **Mi van kész** — A júniusi diktálási javítást az októberi #360 a gyakorlóval és a diktálási híddal egészítette ki. #360 (`9d0d3a0a`), `source/tests/diktalas-hid.test.ts:27`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #360 · `source/tests/diktalas-hid.test.ts:27` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-136 · **Cím** — Verziózott és kikényszerített eljárásrend · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást. · **Eredeti utasítás / cél** — A repo eljárási szabályaihoz legyen futtatható kikényszerítés, a terv előzze meg a megvalósítást. · **Forrás** — G336 (`f3707972`), G346 (`36181603`), G1140 (`a9f95c9e`), C86 (2026-10-17, 370. sor) · **Mi van kész** — Az AGENTS.md:12 a 2026-09-09-i döntés, a #236 és #489 kódot és tesztet is hozott hozzá. #236 (`a9f95c9e`), #489 (`26bae97f`), `scripts/qa/gates/record-review.test.mjs:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #236, #489 · `scripts/qa/gates/record-review.test.mjs:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-137 · **Cím** — Tudástérkép és mentett folyamat · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A forráshoz kötött fogalomtérkép és a mentett munkafolyamat követhetően, a tulajdonosához kötve folytatódjon. · **Forrás** — G365 (`cdcbb550`), G518 (`c3430938`) · **Mi van kész** — A G365 térképjóváhagyást, a G518 mentett folyamat-életciklust, később a #247 újraindítási próbát vezetett be. #203 (`1ef0fc9d`), #247 (`ec2a86f2`), `source/tests/restart-resume.test.ts:7`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #203, #247 · `source/tests/restart-resume.test.ts:7` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-140 · **Cím** — Tanulói tévedés negatív példaként · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A tanuló hibás válaszát negatív példaként kezelje a forráshelyesbítés. · **Forrás** — G982 (`7d1e5c78`) · **Mi van kész** — A 2026-10-03-i 7d1e5c78 a source/server/studio/source-corrections.ts fájlban és a source-arithmetic-corrections tesztben rögzíti a döntést. #192 (`affd2d0b`), `source/tests/source-arithmetic-corrections.test.ts:17`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #192 · `source/tests/source-arithmetic-corrections.test.ts:17` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-143 · **Cím** — Programmal számított kvízkulcs · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A számolós kvíz helyes kulcsát program is számítsa ki. · **Forrás** — C40 (2026-10-15, 159. sor) · **Mi van kész** — A T5 verziózott megvalósítása és a docs/measurements/2026-10-15-t5-szamolos-kulcs.json mérési minta a főágon van. #244 (`a18c7c76`), `source/tests/single-choice-arithmetic-t5.test.ts:9`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #244 · `source/tests/single-choice-arithmetic-t5.test.ts:9` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-144 · **Cím** — Vak kvízmegoldás a gyártáskor · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A kvízt független, vak megoldás szűrje a gyártáskor. · **Forrás** — C40 (2026-10-15, 159. sor) · **Mi van kész** — A T6 előszűrő a #245-ben beolvadt, a docs/measurements/2026-10-15-t6-kviz-vak.json a mérést őrzi. A későbbi modellkiosztás külön döntés. #245 (`b1a6f540`), `source/tests/quiz-blind-check.test.ts:14`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #245 · `source/tests/quiz-blind-check.test.ts:14` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-145 · **Cím** — Rubrikafordító mérési döntése · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A T3 rubrikafordító szükségéről a mérés döntsön. · **Forrás** — C40 (2026-10-15, 159. sor), C44 (2026-10-15, 185. sor) · **Mi van kész** — A docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md:71 döntése a mérés lezárása, a parafrázist a T7 kezeli. A követő PR a mérőeszközt javította. #249 (`3384cb0c`), #252 (`d213ea0c`), `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #249, #252 · `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-151 · **Cím** — Tanári kérés a forrásfeltöltésnél · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A forrásfeltöltés mellé a tanár külön szöveges kérést adhasson, amely eljut az előállításhoz és a lektorhoz. · **Forrás** — G674 (`28d90019`) · **Mi van kész** — A docs/specs/2026-09-23-owner-instructions-and-lesson-repair.md:34–38 szerződéséhez a #104 tartalmazza az adminbevitelt és a gyártási bekötést. #104 (`28d90019`), #105 (`ef05159a`), `source/tests/owner-instructions-repair.test.ts:18`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #104, #105 · `source/tests/owner-instructions-repair.test.ts:18` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-152 · **Cím** — Javító modul a lecke alatt · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A kész lecke alatt az admin utasítással indíthasson javítást, majd az ellenőrzött jelöltet alkalmazhassa vagy elvethesse. · **Forrás** — G674 (`28d90019`) · **Mi van kész** — A szeptemberi terv 51–53. sora, a source/client/src/components/LessonRepairPanel.tsx és a javítás utáni visszaolvasás főági bizonyíték. #104 (`28d90019`), #378 (`3ff652ad`), #379 (`dcf840bf`), `source/tests/lesson-fusion-repair.test.ts:1`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #104, #378, #379 · `source/tests/lesson-fusion-repair.test.ts:1` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-153 · **Cím** — Dokumentált forráshelyesbítések · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A lektor tartsa meg az igazolt tanári vagy OCR-helyesbítést, miközben a forrást bizonyító idézet megmarad. · **Forrás** — G674 (`28d90019`), G677 (`ef05159a`) · **Mi van kész** — A #104 és #105 a dokumentált helyesbítést és a mentett okkódot vezette be. A forrásidézet megőrzésének feltétele a szeptemberi terv 31. sora. #104 (`28d90019`), #105 (`ef05159a`), `source/server/studio/source-corrections.ts:25`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #104, #105 · `source/server/studio/source-corrections.ts:25` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-154 · **Cím** — Lista és lapozás a nyilvános leckeúton · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — A főoldali lista mobilon frissüljön, hibás vagy függő kérés közben se tűnjön el, a leckéből lehessen tovább lépni. · **Forrás** — G642 (`cc6a4e8a`), G664 (`36b5d3fb`) · **Mi van kész** — A #94 és #102 az olvasó nyilvános útját külön javította. #94 (`cc6a4e8a`), #102 (`36b5d3fb`), `source/tests/home-list-visibility.test.ts:24`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #94, #102 · `source/tests/home-list-visibility.test.ts:24` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-155 · **Cím** — Közös joystick a játékokban · **Állapot** — KÉSZ · **Terület** — játékok · **Prioritás-javaslat** — P2. Kifejezett játékélmény- vagy tartalmi kérés. · **Eredeti utasítás / cél** — Minden irányvezérléses játék kapjon közös, kör alakú joystickot. · **Forrás** — G667 (`dac806a5`) · **Mi van kész** — Az eredeti #103 bevezetését a #456 analóg finomítása követte. #103 (`dac806a5`), #456 (`9038fce2`), `source/tests/joystick-curve.test.ts:28`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #103, #456 · `source/tests/joystick-curve.test.ts:28` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-156 · **Cím** — Olvasható magyarázó ábrák · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A leckékhez legyenek számegyenesek, diagramok, címkézett ábrák és javítható, olvasható magyarázó vizuálok. · **Forrás** — G704 (`f81477c2`), G706 (`e3a4b593`), G710 (`7770d8ad`), G712 (`abc58efa`), G715 (`dd81324f`) · **Mi van kész** — A szeptemberi sorozat bővítette az ábraformákat, a biztonságos SVG-megjelenítést és a címkeellenőrzést. A PDF-forrás ábrájának hű átvétele külön novemberi követelmény. #113 (`f81477c2`), #114 (`e3a4b593`), #115 (`7770d8ad`), #116 (`abc58efa`), #117 (`dd81324f`), `source/tests/illustration-svg.test.ts:11`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #113, #114, #115, #116, #117 · `source/tests/illustration-svg.test.ts:11` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-157 · **Cím** — Lektori konvergencia és figyelmeztetés · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — A végződő lektorkör maradék pedagógiai figyelmeztetése ne tartsa végtelenül nyitva a futást, és legyen látható a Stúdióban. · **Forrás** — G590 (`04bb16f1`), G587 (`c80666a3`), G591 (`a9fb1c3a`) · **Mi van kész** — A #73 konvergenciát, a #74 paneles visszajelzést vezetett be. A lezárást a G590 ledger-commit rögzíti. #73 (`c80666a3`), #74 (`a9fb1c3a`), `source/tests/lektor-d1.test.ts:48`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #73, #74 · `source/tests/lektor-d1.test.ts:48` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-160 · **Cím** — Mentés és állapotverseny a régi javítóban · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P1. A hiba megakaszthatja a tanulást vagy a gyártást. · **Eredeti utasítás / cél** — A javítás alkalmazása, törlése és szerver-újraindítás közben is maradjon helyreállítható az állapot. · **Forrás** — G239 (`3a6f4e7c`), G243 (`4bd6873a`), G248 (`40b96bcd`), G250 (`454a5aa4`), G252 (`98c4dadf`), G253 (`a04d9066`), G254 (`36ff2d9f`), G259 (`6c09e311`), G265 (`7ccbab64`) · **Mi van kész** — A február 24–25-i docs/archive/session.md:12, :50 és :151 külön rögzíti az állapotversenyt, a tartós mentést és az atomi frissítést. A #378 visszaolvasási hibát is javított. #378 (`3ff652ad`), `docs/archive/session.md:151`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #378 · `docs/archive/session.md:151` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-161 · **Cím** — Kedvelések hibás visszaolvasása · **Állapot** — KÉSZ · **Terület** — tananyag · **Prioritás-javaslat** — P2. A tulajdonos a tananyag tartalmára vagy elkészítésére adott elfogadási feltételt. · **Eredeti utasítás / cél** — A kedvelés ellenőrzése ne adjon ismételt hibás kéréseket és visszakapott mezői egyezzenek a klienssel. · **Forrás** — G250 (`454a5aa4`), G251 (`f05eb59b`) · **Mi van kész** — A docs/archive/session.md:166 és a G251 dokumentálja a mezőeltérés javítását, később #109 a tömeges olvasási hibát is kezelte. #109 (`08e2e777`), `docs/archive/session.md:166`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #109 · `docs/archive/session.md:166` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-163 · **Cím** — Csak olvasó éles gyártási mérések · **Állapot** — KÉSZ · **Terület** — biztonság · **Prioritás-javaslat** — P1. Hozzáférést vagy érzékeny adatot érint. · **Eredeti utasítás / cél** — Az éles adatbázishoz a mérő csak olvasással férjen hozzá, az eldobható adatbázis legyen elkülönítve. · **Forrás** — C86 (2026-10-17, 370. sor) · **Mi van kész** — A source/scripts/lib/read-only-db.ts:35 olvasási tranzakciót indít. Az egyfutásos mérő a source/scripts/measure/single-run-measure.mts:95 sorban az írás célját ellenőrzi. #296 (`bdbe118f`), `source/scripts/lib/read-only-db.ts:35`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #296 · `source/scripts/lib/read-only-db.ts:35` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-166 · **Cím** — QA-hookok és tesztintegritás · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást. · **Eredeti utasítás / cél** — A QA-hookokat ne lehessen megkerülni, a teszt mércéjét ne lehessen a bukás elfedésére gyengíteni. · **Forrás** — C86 (2026-10-17, 370. sor) · **Mi van kész** — Az AGENTS.md tesztintegritási és megkerülési tiltását a #398 kiterjesztette a hooksPath-útvonalra. A #489 saját lintkaput és a #520 pontosított push-őrt ad. #398 (`b89ba153`), #489 (`26bae97f`), #520 (`d7583576`), `AGENTS.md:86`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #398, #489, #520 · `AGENTS.md:86` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —

- **Azonosító** — R-UTAS-167 · **Cím** — Friss auditjelző push előtt · **Állapot** — KÉSZ · **Terület** — kapuk-QA · **Prioritás-javaslat** — P1. A bizonytalan vagy lassú ellenőrzés akadályozza a kiadást. · **Eredeti utasítás / cél** — Push előtt friss auditbizonyíték készüljön, és a kapu saját elindítását engedje át a hook. · **Forrás** — C86 (2026-10-17, 370. sor) · **Mi van kész** — A docs/minosegkapuk.md:17 és a scripts/qa/gates/gates.config.json:76 rögzíti az auditjelzőt. A #520 az indítóparancs és a tényleges push megkülönböztetését javította. #489 (`26bae97f`), #520 (`d7583576`), `docs/minosegkapuk.md:17`. · **Mi hiányzik** — A megjelölt célhoz nincs nyitott fejlesztési tétel. · **Folytatás helye** — origin/main, #489, #520 · `docs/minosegkapuk.md:17` · **Következő lépés** — A megjelölt főági referencia alapján lezárható. · **Függőség / ütközés** — További igazolt előfeltétel nincs. · **Kapcsolódó P-tétel** — —
