# 05 · A WEBSULI kódja és dokumentált működése

**Állapotnap: 2026-11-20.** A főág helyi referenciája `origin/main`, commit `d9d1e6c6d706a0c96b1f16d5fd44db2c7b09a1d8`. A korábbi teljes Claude-átiratok hiányoznak. A megmaradt tulajdonosi exportban 2026-10-14-i üzenet is van, a november előtti időszak folytonossága nem igazolható. A legkorábbi főági commit `303898a4` (2025-12-09).

**Első javítási kör.** A fejlesztői statikus audit két működésképtelen keresés után is PASS-t jelent (001). A böngésző a lejáró push-feliratkozás megújításakor elhagyja a szerver által megkövetelt fejlécet, majd megszünteti a helyi feliratkozást (003). A kisfilmgyártó a fejezet megkezdésekor nézi a tárkeretet, így a mentés átlépheti a dokumentált mérethatárt (007). Ezekhez helyi, szolgáltatófüggetlen elfogadási próbák adhatók.

## Mit fed le a vizsgálat?

Az elsődleges forráselem egy követett szövegfájl a kijelölt működési körben. A 3674 fájlos főági fából 2389 útvonal tartozik ide. A 631 kép-, betűkészlet-, ikon- és bájtkódeszköz útvonal-leltárként szerepelt. A fennmaradó **1758 fájl 308 189 sorát** Git-objektumból olvastam be. A bejárás szöveges, az importkapcsolatok és a további források ellenőrzése célzott. Ez a nevező fájllefedettséget mér, nem minden lehetséges futási állapot kipróbálását.

| Könyvtár | Szövegfájl | Sor |
|---|---:|---:|
| Gyökér – vezérlés, indítás, telepítés | 11 | 946 |
| `.claude/` – két hookbeállítás | 2 | 155 |
| `.github/workflows/` | 3 | 475 |
| `scripts/qa/` | 47 | 7 043 |
| `scripts/tananyag/` | 3 | 335 |
| `shared/` | 1 | 74 |
| `source/` közvetlen fájljai | 54 | 18 133 |
| `source/.vscode/` | 3 | 73 |
| `source/client/` | 435 | 95 624 |
| `source/design-assets/` | 4 | 10 684 |
| `source/migrations/` | 48 | 3 608 |
| `source/scripts/` | 53 | 8 448 |
| `source/server/` | 256 | 45 280 |
| `source/shared/` | 144 | 28 360 |
| `source/tests/` | 694 | 88 951 |

**Ismételhetőség.** A `git ls-tree -r --name-only origin/main` sorrendjében a kör része minden `source/`, `scripts/`, `shared/`, `.github/workflows/` fájl, a két `.claude/settings*.json`, a gyökérszintű shell-, PowerShell-, JavaScript- és YAML-fájlok, továbbá az `AGENTS.md`, `package.json`, `.dependency-cruiser.cjs`, `.jscpd.json`, `.agentic-qa-kit.json`. A szöveges listából a webp, png, ico, woff2 és pyc kiterjesztés marad ki. Az útvonal UTF-8 bájtjai, nulla bájt, a blob hexazonosítója és LF elemekből képzett sorozat SHA-256 lenyomata `0abab2ebccb0eb9fa5482c88c987b38beb1e15408b81577c77aed3fc2a586296`. A sortördelés a BOM-os UTF-16 állományokat is kezeli.

**Döntési szabály.** A kommentet, helyőrzőt, 501-es választ, kapcsolóolvasást és használó nélküli exportot jelöltként kezeltem. Ellenőriztem a hívót, az érintett belépési pontot, a tervet és ahol van, a teszt állítását. A `todo` változó például munkasor a `source/client/src/lesson-runtime/arbiter.ts:60` helyen. A külön Vite-belépési pont és a globbal importált szóbank hagyományos importkereséssel tévesen holtnak látszik. Az éles beállításoknál külön szerepel a kód alapértéke és az utolsó dokumentált döntés. KÉSZ csak a megnevezett, statikusan bizonyított viselkedésre vonatkozik.

**Kapcsolat a sorozattal.** A tervcsaládokat a [01. szelet](01-tervek-es-vegrehajtasok.md), a szál- és PR-szintű döntéseket a [02. szelet](02-pr-ok-es-review-szalak.md), a jegyeket és csapdákat a [03. szelet](03-kanban-memoria-csapdak.md), a kérések időrendjét a [04. szelet](04-tulajdonosi-utasitasok.md) tartalmazza. A P- és D-azonosítók helye a `docs/websuli-potlasok` ág (`7ed789ee`), `7ed789ee:docs/websuli-potlasok.md` és `7ed789ee:docs/specs/2026-11-19-websuli-potlasok-terv.md`. Ezek azonos hiányaihoz lent hivatkozás vezet. A javítási javaslatok tesztnevei a következő fejlesztés elfogadását szolgálják. Ebben a revízióban teszt, build, kapu, adatbázis-művelet és élő szolgáltatói próba nem futott.

## Javítandó vagy eldöntendő kódviselkedés

### R-KOD-001 · A statikus audit keresőhibából sikeres eredményt állít elő

- **Azonosító** — R-KOD-001
- **Cím** — A statikus audit keresőhibából sikeres eredményt állít elő
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztő hibátlan forrásvizsgálatot lát akkor is, ha a keresés el sem indul.
- **Eredeti utasítás / cél** — A fejlesztői audit mutassa meg a típusmegkerülések és a konzolnaplózás tényleges gyakoriságát.
- **Forrás** — `source/server/lib/static-audit.ts:2`, bevezetés `93f3067f` (2026-03-11), bizonyítási követelmény `AGENTS.md:73`.
- **Mi van kész** — A fejlesztői adminút meghívja az auditot (`source/server/routes/static-audit.ts:17`). A két beégetett Git-keresést külön, csak olvasó parancsként ellenőriztem. Mindkettő 128-as kilépési kódot adott.
- **Mi hiányzik** — A 33. és 78. sor keresési argumentumai hibásak. A 43. és 88. sor bármely kivétel esetén találatmentes PASS-t ad. A meglévő őr a hozzáférést vizsgálja (`source/tests/static-audit-guard.test.ts:8`).
- **Folytatás helye** — `origin/main`, `source/server/lib/static-audit.ts:30`.
- **Következő lépés** — Használj argumentumlistás Git-hívást és Git-útvonalmintákat. A 0-s kilépésnél számold a találatokat, 1-nél jelezz találatmentességet, más kódnál mérési hibát. Helyi egységpróbában ellenőrizd külön a találatot, az üres keresést, a 128-as kódot és az időtúllépést.
- **Függőség / ütközés** — A fejlesztői adminút élesben 404-et ad. Az itt igazolt hiba független a PR előtti kapuk állapotától (R-TERV-205).
- **Kapcsolódó P-tétel** — —

### R-KOD-002 · Az adatbázis-konfiguráció auditja eltér a futó szerver választásától

- **Azonosító** — R-KOD-002
- **Cím** — Az adatbázis-konfiguráció auditja eltér a futó szerver választásától
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Egy fejlesztő helyes helyi beállítással figyelmeztetést, használaton kívüli beállítással jó eredményt kaphat.
- **Eredeti utasítás / cél** — Az adminisztrátor ugyanarról a kapcsolatválasztásról kapjon visszajelzést, amelyet az alkalmazás használ.
- **Forrás** — `source/server/lib/static-audit.ts:59`, `source/server/db.ts:11`, `source/server/routes/static-audit.ts:13`.
- **Mi van kész** — A fejlesztői szerver a fejlesztői címet, utána az általános címet olvassa. A diagnosztika az általános cím mellett egy másik, Neon nevű változót tekint elegendőnek (`source/server/lib/static-audit.ts:63`).
- **Mi hiányzik** — Kizárólag fejlesztői cím esetén az audit hiányt jelez. Kizárólag a Neon nevű változó esetén ezt a részfeltételt teljesültnek tekinti, miközben az alkalmazás a helyi tartalékágára lép (`source/server/db.ts:22`).
- **Folytatás helye** — `origin/main`, a kapcsolat kiválasztása és a fejlesztői statikus audit.
- **Következő lépés** — Emeld ki a konfiguráció forrásának kiválasztását tiszta függvénybe, és hívd mindkét helyen. Teszteld csak fejlesztői, csak általános, csak régi változóval és mindkettő hiányában. A diagnosztikába csak a forrás neve és az állapot kerülhet.
- **Függőség / ütközés** — Az E2E-adatbázis őrét a kiválasztott értéken továbbra is alkalmazni kell (`source/server/db.ts:29`).
- **Kapcsolódó P-tétel** — —

### R-KOD-003 · A push-feliratkozás megújításakor elveszhet a működő helyi feliratkozás

- **Azonosító** — R-KOD-003
- **Cím** — A push-feliratkozás megújításakor elveszhet a működő helyi feliratkozás
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. Az érintett böngésző többé nem kap értesítést, és az automatikus megújítás hibája rejtve maradhat.
- **Eredeti utasítás / cél** — A lejáró feliratkozást a böngésző a már alkalmazott kérelemvédelemmel újítsa meg. Átmeneti mentési hiba után legyen helyreállítható.
- **Forrás** — `docs/specs/sec-107-csrf-client-calls-2026-09-04.md:31`, `source/client/public/service-worker.js:214`.
- **Mi van kész** — A normál kliens az `apiRequest` segédet használja (`source/client/src/lib/pushNotifications.ts:195`), amely a szinkronizáló fejlécet hozzáadja (`source/client/src/lib/queryClient.ts:149`). A szerver a többi módosító kérésre is előírja (`source/server/routes.ts:850`).
- **Mi hiányzik** — A service worker ugyanazt a POST-ot csak tartalomtípus-fejléccel küldi. Sikertelen HTTP-válasz után leiratkozik. A kliensnek küldött hibajelzés a kivételágban van, ahová a normál HTTP-elutasítás nem kerül (`source/client/public/service-worker.js:257`, 263–276).
- **Folytatás helye** — `origin/main`, a nyilvános service worker és a meglévő szinkronizáló védelem.
- **Következő lépés** — A worker ugyanolyan munkamenethez tartozó tokent kérjen a meglévő token-végponttól, mint a kliens. Átmeneti hibánál tartsa meg a megújítandó feliratkozást és jelezze az újrapróbálást. A worker eseménykezelőjét helyettesített hálózattal próbáld ki siker, elutasítás és hálózatvesztés esetén. Csak sikeres szervermentést tekints megújításnak.
- **Függőség / ütközés** — A szerver kérelemvédelme marad szükséges. A már regisztrált böngészők életciklusa független az új feliratkozás felületétől (004).
- **Kapcsolódó P-tétel** — —

### R-KOD-004 · Új böngészőből nincs igazolt út a push-feliratkozás indítására

- **Azonosító** — R-KOD-004
- **Cím** — Új böngészőből nincs igazolt út a push-feliratkozás indítására
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A régi és az új böngészők eltérően érhetik el az értesítési szolgáltatást.
- **Eredeti utasítás / cél** — Tisztázni kell, hogy az új eszközön is elvárt-e az önkéntes push-feliratkozás az adminfelület átalakítása után.
- **Forrás** — `docs/specs/2026-10-18-admin-korszerusites.md:24`, `e9dc3425` (2026-10-18), R-TERV-318, R-UTAS-079.
- **Mi van kész** — A szerver kezeli a feliratkozást (`source/server/routes.ts:2961`), a klienssegéd elkészült (`source/client/src/lib/pushNotifications.ts:208`), az alkalmazás regisztrálja a workert (`source/client/src/main.tsx:11`).
- **Mi hiányzik** — Az eltávolított kapcsoló után a főági kliensben nincs importálója a feliratkozási segédnek. A worker regisztrálása önmagában nem kér értesítési engedélyt. Nyitott kérdés a frissebb felületi szándék és a főágon kívüli esetleges belépési pont.
- **Folytatás helye** — `origin/main`, a fenti adminterv és a push klienssegéd.
- **Következő lépés** — A javító szeletben igazold az első feliratkozás elvárását az admintervvel és az értesítési folyamat gazdájával. Ha elvárt, a jóváhagyott beállítási felület felhasználói műveletből hívja a meglévő segédet. Ha kivezetett, dokumentáld a meglévő előfizetések támogatási határát. Új böngészőprofilban, helyettesített push-szolgáltatóval ellenőrizd mindkét jóváhagyott felületi állapotot.
- **Függőség / ütközés** — A 2026-10-18-i döntés kifejezetten a régi komponens eltávolítását kérte. Annak automatikus visszaállítására nincs bizonyíték.
- **Kapcsolódó P-tétel** — —

### R-KOD-005 · A push-küldés naplója az előfizetési cím egy részét is megőrzi

- **Azonosító** — R-KOD-005
- **Cím** — A push-küldés naplója az előfizetési cím egy részét is megőrzi
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. A kézbesítési cím útvonalának előtagja bekerülhet az üzemi naplóba.
- **Eredeti utasítás / cél** — A kézbesítési sikert, hibát és lejáratot személyhez vagy eszközhöz kötődő címrészletek nélkül lehessen követni.
- **Forrás** — `AGENTS.md:103`, `AGENTS.md:238`, `source/server/lib/push-endpoint.ts:32`, `source/server/pushNotifications.ts:92`.
- **Mi van kész** — A célcím ellenőrzött szolgáltatóhoz tartozik, és a megvalósítás összesített siker- és hibaszámlálót is ír (`source/server/pushNotifications.ts:108`).
- **Mi hiányzik** — Siker, hiba és lejárat esetén az URL első 50 karakterét naplózza (92., 96., 100. sor). A rögzített karakterszám nem választja el a hosztot az előfizetés útvonalától.
- **Folytatás helye** — `origin/main`, `source/server/pushNotifications.ts:85`.
- **Következő lépés** — A naplózásnál használj eseménytípust, számlálót és szükség esetén engedélyezett szolgáltatónevet. Próbáld ki szintetikus, egyedi útvonaljelölővel a sikeres, a sikertelen és a lejárt küldést. A jelölő egyik naplóüzenetben vagy szolgáltatói hibaszövegben se szerepeljen.
- **Függőség / ütközés** — A tárolt kézbesítési címet maga a küldés használja. A változtatás a naplózott mezőket érinti.
- **Kapcsolódó P-tétel** — —

### R-KOD-006 · Leállás alatt a Párbaj működőként kínálja a szobanyitást

- **Azonosító** — R-KOD-006
- **Cím** — Leállás alatt a Párbaj működőként kínálja a szobanyitást
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. A játékos olyan elsődleges gombot kap, amelynek kérését a szerver már biztosan elutasítja.
- **Eredeti utasítás / cél** — Tervezett újraindításkor a kezdőképernyő a szoba tényleges elérhetőségét mutassa.
- **Forrás** — `source/shared/duel/protocol.ts:371`, `source/server/realtime/index.ts:123`, #476 (`31dfcdea`).
- **Mi van kész** — A státusz külön közli a leállást (`draining`), a kiszolgáló ilyenkor új szobára és belépésre újraindítási hibát ad (`source/server/realtime/gateway.ts:675`).
- **Mi hiányzik** — A kliens az `off` és `full` állapotot figyeli, a leállást nem. Jogosult játékosnál a „Szoba létrehozása” marad az elsődleges gomb, a kódos belépés is választható (`source/client/src/pages/DuelOnline.tsx:204`, 486–495., 663. sor).
- **Folytatás helye** — `origin/main`, Párbaj kezdőoldal és kódos belépés.
- **Következő lépés** — A státuszból külön számítsd az új szoba nyitását, a csatlakozást és a helyi gépi játékot. A `source/tests/duel-online.spec.ts` próbában helyettesített leállási státusszal ellenőrizd, hogy látható az újraindítás oka, új szobakérés nem indul, és a gép elleni játék elérhető.
- **Függőség / ütközés** — A megtelt szerveren egy meglévő szobába még be lehet lépni. A leállás ettől eltérő állapot. Éles próba sorrendje R-UTAS-084.
- **Kapcsolódó P-tétel** — P-018, P-022, P-052 (kapcsolódó bevezetés és leállítás).

### R-KOD-007 · A kisfilmek médiatáblája átlépheti a megadott mérethatárt

- **Azonosító** — R-KOD-007
- **Cím** — A kisfilmek médiatáblája átlépheti a megadott mérethatárt
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. Egy csaknem megtelt tárba több párhuzamos fejezet is beírhatja a teljes médiáját.
- **Eredeti utasítás / cél** — A tárolt kisfilmmédia összmérete férjen bele a beállított keretbe.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md:20` (D7), #417 (`3e9df145`).
- **Mi van kész** — A munkás fejezetkezdéskor összeveti a jelenlegi méretet a határral. Azonos tartalmat az adatbázis egyszer tárol (`source/server/lesson-clips.ts:311`, `source/server/lesson-clips-db.ts:53`).
- **Mi hiányzik** — A beszúrás nem vizsgálja az új bájtokkal növelt méretet. Egyetlen fejezet is átlépheti a határt, a két párhuzamos fejezet pedig azonos szabad helyet láthat. A meglévő próba kifejezetten számol a túllépéssel (`source/tests/lesson-clip-worker.test.ts:253`).
- **Folytatás helye** — `origin/main`, a kisfilmtár írási szerződése. A `kisfilm-memoria-javitas` ág párhuzamossági módosításait egyeztesd P-041 szerint.
- **Következő lépés** — A tartalomazonosító szerinti meglévő sort és az új bájtokkal számolt keretet egyetlen szerializált írás részeként ellenőrizd. Külön tesztelje két párhuzamos mentés az utolsó szabad helyet, a pontos határt és a duplikált média nulla többletét. A meglévő leállási tesztet tartsd meg.
- **Függőség / ütközés** — A TTS-tárban van már zárolt méretellenőrzési minta (`source/server/tts/audio-store.ts:147`). A két médiatár kerete külön érvényes.
- **Kapcsolódó P-tétel** — P-041 (párhuzamosság).

### R-KOD-008 · Sikertelen kisfilmgyártás után a kész részletek foglalhatják a tárkeretet

- **Azonosító** — R-KOD-008
- **Cím** — Sikertelen kisfilmgyártás után a kész részletek foglalhatják a tárkeretet
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. Ismétlődő részhibáknál úgy telhet a tár, hogy a tanuló nem kap lejátszható fejezetet.
- **Eredeti utasítás / cél** — Az újrapróbálható fejezetgyártásnak konzisztens állapotban kell hagynia a kisfilmet és a hozzá tartozó médiát.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md:62`, `source/server/lesson-clips.ts:227`.
- **Mi van kész** — A képek és a hangok tartalomazonosítóval mentődnek. A fejezet eredménye külön sor, a sikertelen kísérlet is számlálódik (`source/server/lesson-clips-db.ts:41`, 53. sor).
- **Mi hiányzik** — A jelenetek még a végső sémaellenőrzés előtt mentenek (245., 254., 266. sor). Másik jelenet hibája vagy végső validációs hiba után a munkás üres klipet rögzít (`source/server/lesson-clips.ts:280`, 320. sor). A teljes táblát összegző méretőr ezeket a médiabájtokat is beszámítja (`source/server/lesson-clips-db.ts:59`).
- **Folytatás helye** — `origin/main`, `makeChapterClip`, a médiatároló és a fejezet véglegesítése.
- **Következő lépés** — Rendelj a folyamatban lévő kísérlethez ideiglenes médiahivatkozásokat, vagy készíts újraindítható, korhatáros takarítást az igazoltan hivatkozás nélküli médiára. Két fejezettel teszteld a részhibát, a párhuzamos mentést és egy közös kép megőrzését a sikeres fejezet számára.
- **Függőség / ütközés** — Az azonos tartalom több leckében szerepelhet. A hibás fejezet minden médiájának feltétlen törlése adatvesztést okozna. A 007-es írási kerettel együtt tervezendő.
- **Kapcsolódó P-tétel** — P-041.

### R-KOD-009 · A kisfilm állapotjelzése leállt gyártásnál is várakoztat

- **Azonosító** — R-KOD-009
- **Cím** — A kisfilm állapotjelzése leállt gyártásnál is várakoztat
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A lejátszó készülő filmet jelez és újra lekérdez akkor is, amikor a munkás keret híján nem kezdhet hozzá.
- **Eredeti utasítás / cél** — A gyerek akkor lásson folyamatban lévő gyártást, amikor van esély az adott lecke elkészülésére a jelzett folyamatban.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek.md:123`, R-TERV-255, R-KAN-328.
- **Mi van kész** — Az API külön kezeli az inaktív módot, a régi leckét és az elfogyott kísérleteket. A kliens újrakérdezése 20 másodperces és legfeljebb 30 percig fut (`source/tests/lesson-clip-worker.test.ts:209`, `source/client/src/lesson-runtime/clips/useLessonClips.ts:43`).
- **Mi hiányzik** — A válasz kizárólag az automata módot, a frissességet és a hátralévő fejezeteket nézi (`source/server/lesson-clips.ts:100`). Nulla napi keret vagy megtelt tár mellett a munkás nem gyárt (304., 311. sor). A felületen továbbra is „Készülnek a kisfilmek…” látható (`source/client/src/lesson-runtime/clips/ClipContext.tsx:61`).
- **Folytatás helye** — `origin/main`, a kisfilmek státuszválasza és annak lejátszóbeli megjelenítése.
- **Következő lépés** — A munkás és a státuszút ugyanabból a gyártási alkalmassági döntésből dolgozzon. A kérésenkénti teljes méretösszegzés helyett használj frissíthető keretállapotot. A worker-próbában és a kliensben ellenőrizd a nulla keretet, a megtelt tárat, a már kész filmet és a ténylegesen folyamatban lévő gyártást.
- **Függőség / ütközés** — A napi kvóta másnap felszabadulhat. A későbbre váró és az éppen készülő állapot felirata, illetve lekérdezési gyakorisága különbözzön.
- **Kapcsolódó P-tétel** — P-041 (ugyanaz a háttérmunkás).

### R-KOD-010 · A kisfilmgyártó az első ötven friss lecke mögé nem jut el

- **Azonosító** — R-KOD-010
- **Cím** — A kisfilmgyártó az első ötven friss lecke mögé nem jut el
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Tömeges közzétételnél az érvényes időablakon belüli lecke kimaradhat még szabad napi keret mellett is.
- **Eredeti utasítás / cél** — A három napnál frissebb leckéket a munkás a megengedett kereten belül, a legfrissebbel kezdve dolgozza fel.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek.md:101`, `source/server/lesson-clips-db.ts:26`.
- **Mi van kész** — A lekérdezés dátum szerint szűr és rendez. A munkás kiszűri azokat a leckéket, amelyekhez már minden szükséges film elkészült (`source/server/lesson-clips.ts:298`).
- **Mi hiányzik** — Az SQL előbb ötvenre korlátozza a találatokat, a kész leckéket csak ezután ejti ki a háttérmunkás. Ha az első ötven kész vagy alkalmatlan, az 51. feldolgozható lecke a következő körben is kívül marad.
- **Folytatás helye** — `origin/main`, `source/server/lesson-clips-db.ts:29`, `source/server/lesson-clips.ts:301`.
- **Következő lépés** — Lapozz dátum és azonosító szerint a friss jelöltek között, vagy szűrd a feldolgozhatókat a limit előtt. A `source/tests/lesson-clip-worker.test.ts` kiegészítése ötven kész és egy régebbi, még friss, hiányos leckével igazolja a sorra kerülést. A három napnál régebbi kontroll maradjon ki.
- **Függőség / ütközés** — A lapozás őrizze meg a napi keretet és a munkás kizárólagos futását. Tényleges érintett éles leckeszámot nem mértünk.
- **Kapcsolódó P-tétel** — —

### R-KOD-011 · A szakaszkapu kihagyja a TypeScript-modulformátumú szkripteket

- **Azonosító** — R-KOD-011
- **Cím** — A szakaszkapu kihagyja a TypeScript-modulformátumú szkripteket
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Egy gyártási vagy mérőszkript módosítása célzott teszt és hiányzóteszt-jelzés nélkül átjuthat ezen a lépésen.
- **Eredeti utasítás / cél** — A változott fájlokhoz válassza ki a helyi kapu az érintett egységpróbákat, és jelezze a lefedetlen változást.
- **Forrás** — `AGENTS.md:158`, `scripts/qa/gates/stage-gate.mjs:29`, R-TERV-205.
- **Mi van kész** — A kapu fájlnév és tesztimport alapján párosít. A kiválasztás mellé az őrteszteket is hozzáteszi (`scripts/qa/gates/stage-gate.mjs:45`, 73. sor).
- **Mi hiányzik** — A 36. sor kiterjesztéslistáján nincs `.mts`, így a fájl az `unmapped` listáig sem jut el. A főágon 20 ilyen szkript van. Konkrét eset a `source/scripts/gates/run-gates.mts`, amelyet a `source/tests/source-coverage-gate.test.ts:412` folyamatként indít.
- **Folytatás helye** — `origin/main`, `scripts/qa/gates/stage-gate.mjs`, `scripts/qa/gates/stage-gate.test.mjs`.
- **Következő lépés** — Vedd fel az .mts végződést a kiválasztásba, és tedd felismerhetővé a folyamatként hívott szkript és a teszt kapcsolatát. A kapu saját tesztje ellenőrizze a fenti párosítást és egy ismeretlen .mts fájl bekerülését az unmapped listába. A gyors lint és típusellenőrzés hatókörét külön igazold a `scripts/qa/gates/lint-gate.mjs:17` és a `source/tsconfig.json:2` alapján.
- **Függőség / ütközés** — A mindig futó őrök nem helyettesítik a szkripthez tartozó viselkedési tesztet. A teljes kapurendszer más hiányai R-TERV-205 alatt vannak.
- **Kapcsolódó P-tétel** — P-042, P-046.

### R-KOD-012 · A Stúdió mérőprogramja saját szabállyal olvassa a vizuális kapcsolót

- **Azonosító** — R-KOD-012
- **Cím** — A Stúdió mérőprogramja saját szabállyal olvassa a vizuális kapcsolót
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Két külön értelmezés mellett a mérési jelentés és az éles kód idővel eltérő konfigurációt vizsgálhat.
- **Eredeti utasítás / cél** — Az éles motor és a mérőprogram közös értelmezőt használjon, a mérés dokumentáltan eltérő alapértékével.
- **Forrás** — `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md:100`, 707–710. sor, `docs/lesson-improvement.md:48`.
- **Mi van kész** — A motor a központi függvényt használja, és a mérőszkript a tényleges eredményt befecskendezi (`source/server/studio/source-visuals-flag.ts:13`, `source/scripts/measure/single-run-measure.mts:141`).
- **Mi hiányzik** — A mérőprogram a 75. sorban másolja a változó olvasását és normalizálását. Jelenleg az explicit értékek egyeznek. A terv a közvetlen olvasást egyetlen függvényre korlátozza.
- **Folytatás helye** — `origin/main`, a kapcsoló tiszta értelmezője és a mérőszkript.
- **Következő lépés** — Használd ugyanazt az értelmezőt mindkét hívónál, a hiányzó értékhez a méréstől explicit BE, az éles úttól KI alapértéket átadva. A `source/tests/source-visuals-flag.test.ts` próba hasonlítsa össze a két hívót hiányzó, üres, szóközös, érvénytelen és explicit BE/KI bemenetre.
- **Függőség / ütközés** — Az éles bekapcsoláshoz S10/1 mérés és tulajdonosi döntés kell. Ezt a refaktorálás nem teljesíti.
- **Kapcsolódó P-tétel** — P-028, P-066.

### R-KOD-013 · A száraz Stúdió-mérés kimenete nem bizonyítja a tervezett első modellkérést

- **Azonosító** — R-KOD-013
- **Cím** — A száraz Stúdió-mérés kimenete nem bizonyítja a tervezett első modellkérést
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A költséges mérés előtti ellenőrzés úgy sikerülhet, hogy az első kérésből hiányzó szerződés észrevétlen marad.
- **Eredeti utasítás / cél** — A fizetős mérés előtt helyileg derüljön ki, hogy a forrás vizuális leltárát ténylegesen kéri-e az első állomás.
- **Forrás** — `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md:705`, R-TERV-393 (a régebbi A/B használat).
- **Mi van kész** — A szkript betölti a bemenetet, rögzíti az értelmezett kapcsolót, és a száraz ágban adatbázis-számlálókat ír. Mindez a modell létrehozása előtt történik (`source/scripts/measure/single-run-measure.mts:76`, 106–126. sor).
- **Mi hiányzik** — A száraz út a 120. sorban lezárul. A fájlból készülő első kérés és az abban szereplő leltárszerződés vizsgálata kimarad. A kapcsoló true értéke önmagában nem ilyen bizonyíték.
- **Folytatás helye** — `origin/main`, `source/scripts/measure/single-run-measure.mts:106`, a motor `source/server/studio/single-run/engine.ts:363` kérésépítése.
- **Következő lépés** — A száraz fájlút futtassa a valódi első kérésépítőt rögzítő próbafüggőséggel. Csak az állomás nevét, a szerződés jelenlétét és lenyomatát írja ki. Egy szintetikus fájllal ellenőrizd a vizuális BE és KI esetet, a szolgáltatói hívások száma mindkettőben nulla legyen.
- **Függőség / ütközés** — Az SK3 költségjelzését a frissített D-02 szerint kell kezelni. A régi keretkapcsoló önmagában nem igazolhat új éles leállítási feltételt.
- **Kapcsolódó P-tétel** — P-029, P-033, P-065.

### R-KOD-014 · Az éles játékcsomag két őrpróbája a szokásos CI-ben feltétel nélkül sikeres

- **Azonosító** — R-KOD-014
- **Cím** — Az éles játékcsomag két őrpróbája a szokásos CI-ben feltétel nélkül sikeres
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Egy éles csomagolási regresszió átmehet a kiadási útvonalon anélkül, hogy a kész JavaScriptet ez a két próba megvizsgálná.
- **Eredeti utasítás / cél** — A kiadásra épített csomagban ne szerepeljen a játéklabor és a játék tesztfelülete.
- **Forrás** — `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:936`, `source/tests/game-test-hooks-guard.test.ts:38`.
- **Mi van kész** — A forrásban létezik a buildkapcsoló és a tényleges csomagvizsgálat (43–50., 58–64. sor). A CI éles buildet is készít (`.github/workflows/ci.yml:156`).
- **Mi hiányzik** — A két próba a WEBSULI_CHECK_PROD_BUNDLE=1 hiányában azonnal sikerrel tér vissza. A főági scripts, source és .github fákban csak maga az őr hivatkozik erre a névre. Az egységteszt az éles build előtt szerepel (`.github/workflows/ci.yml:153`).
- **Folytatás helye** — `origin/main`, CI éles build utáni lépése és `source/tests/game-test-hooks-guard.test.ts:39`.
- **Következő lépés** — A sikeres éles build közvetlen folytatásaként futtasd a meglévő őrt a kiválasztó változóval. A job az éppen elkészült csomagot olvassa. Ellenőrizd egy szintetikus tiltott jelölőt tartalmazó és egy tiszta csomagmintával, hogy a két út külön eredményt ad.
- **Függőség / ütközés** — Az E2E-buildnek éppen szüksége van a játékkampókra (`source/package.json:12`). A próba az éles buildet célozza. Kézi korábbi futás lehetséges.
- **Kapcsolódó P-tétel** — P-042, P-050.

### R-KOD-015 · Kijelölt tananyagoknál az admin használhatónak lát egy mindig visszautasított levélműveletet

- **Azonosító** — R-KOD-015
- **Cím** — Kijelölt tananyagoknál az admin használhatónak lát egy mindig visszautasított levélműveletet
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A kezelő csak kattintás után tudja meg, hogy a kijelölt művelet most nem hajtható végre.
- **Eredeti utasítás / cél** — A felület már a választáskor pontosan jelezze a tömeges értesítés elérhetőségét.
- **Forrás** — `docs/specs/2026-11-10-gyartas-meres.md:85` és 187. sor, R-TERV-102.
- **Mi van kész** — A szerver valós 501-es állapotot ad (`source/server/routes.ts:3583`). A kliens hibaüzenetet mutat, és ezt forrásőr ellenőrzi (`source/tests/bulk-email-honest.test.ts:11`).
- **Mi hiányzik** — A kijelölési sáv aktív Email gombja csak másik folyamat futásakor tiltott (`source/client/src/components/AdminFileDashboard.tsx:588`). Érvényes kijelölés esetén a kattintással elindított kérés sem tud levelet küldeni.
- **Folytatás helye** — `origin/main`, a kijelölési sáv és az adminfelület böngészős próbája.
- **Következő lépés** — A kijelölési sávban jelenítsd meg az elérhetetlen műveletet érthető magyarázattal, vagy csak elérhető képesség esetén kínáld fel. A `source/tests/admin-responsive.spec.ts` próbában jelölj ki tananyagot, és ellenőrizd, hogy küldés nem kezdeményezhető, a többi művelet használható. Tartsd meg a szerver 501-szerződését.
- **Függőség / ütközés** — A 2026-11-10-i terv kifejezetten kizárta a valódi tömeges küldés megvalósítását ebből a javításból. Az egyedi levelezés külön folyamat.
- **Kapcsolódó P-tétel** — —

### R-KOD-016 · Két használaton kívüli szervermodul működő infrastruktúrának látszik

- **Azonosító** — R-KOD-016
- **Cím** — Két használaton kívüli szervermodul működő infrastruktúrának látszik
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3. Egy későbbi javítás a tényleges adatbázis- vagy modellút helyett könnyen csak az árva segédet módosítaná.
- **Eredeti utasítás / cél** — A dokumentációból és a szerverkódból derüljön ki, mely gyorsítótár és adatbázis-kapcsolat vesz részt a kiszolgálásban.
- **Forrás** — R-UTAS-079, `source/server/ai/AICache.ts:5`, `source/server/utils/database.ts:63`.
- **Mi van kész** — Van TTL-es AICache és példánygyár (25., 172. sor), valamint külön kliens- és Drizzle-gyár (`source/server/utils/database.ts:67`, 82. sor). A használatban lévő adatbázismodul saját poolt és Drizzle-példányt exportál (`source/server/db.ts:39`, 83. sor).
- **Mi hiányzik** — A két modulhoz a követett modulok importgráfjában nincs bejövő import, a gyárnevek keresése sem ad alkalmazáshívót. A gyorsítótárban található időzítő és a másik modul felébresztő ellenőrzése így nem igazolja, hogy ezek a szerverindításkor futnak.
- **Folytatás helye** — `origin/main`, a két szervermodul és a hivatkozó történeti audit (`docs/specs/audit-4day-fixes-2026-09-05.md:43`).
- **Következő lépés** — Ellenőrizd a CLI- és csomagbelépőket is az exportnevekre. Amennyiben ott sincs szerződött fogyasztó, szüntesd meg a két belső maradványt, és a jelenlegi kapcsolat ellenőrzését a valódi db.ts mellett tartsd. Típusellenőrzéssel, a szerverépítéssel és a normál indulás helyi próbájával igazold a kompatibilitást.
- **Függőség / ütközés** — A történeti modellköltség-csökkentési terv (R-TERV-127) más gyorsítótárakat is érinthet. A két árva modul eltávolítása önmagában nem hoz igazolt memória- vagy költségnyereséget.
- **Kapcsolódó P-tétel** — —

### R-KOD-017 · Mobilos átállás után tesztek és dokumentumok tartanak életben két régi játékkomponenst

- **Azonosító** — R-KOD-017
- **Cím** — Mobilos átállás után tesztek és dokumentumok tartanak életben két régi játékkomponenst
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P3. A fejlesztő könnyen olyan komponensben javít érintést vagy céljelzőt, amelyet a játékos már nem lát.
- **Eredeti utasítás / cél** — Az érintés és a következő cél ellenőrzése a ténylegesen használt játékfelületet fedje.
- **Forrás** — `source/client/src/hooks/useCoarsePointer.ts:8`, R-PR-044-S01, R-UTAS-079, `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:753`.
- **Mi van kész** — A két korábbi fogyasztó közvetlenül az új hookot hívja (`source/client/src/pages/BlockCraftQuiz.tsx:1134`, `source/client/src/pages/SpaceAsteroidQuiz.tsx:767`). A régi céljelző komponens is megvan (`source/client/src/components/GameNextGoalBar.tsx:35`).
- **Mi hiányzik** — Egyik régi modulhoz sincs használó alkalmazásimport. A kompatibilitási hook meglétét a `source/tests/game-mobile-shell.test.ts:188`, a régi céljelző létét és szövegét a `source/tests/game-ethics-guard.test.ts:60` és 88. sora rögzíti. A hook kommentje még a korábbi fogyasztókra hivatkozik.
- **Folytatás helye** — `origin/main`, a mobilos megjelenítés és a két őrteszt.
- **Következő lépés** — A lapokból kövesd végig a közös érintéskezelést és az aktív HUD-ot. Bővítsd az őrt ezekre az útvonalakra és a valóban megjelenő célfeliratra. Dokumentált kompatibilitási döntés után vezesd ki a régi modulokat és a fájlnevükhöz kötött állításokat. A tapintásos és vegyes egér–érintés próba maradjon meg.
- **Függőség / ütközés** — A terv név szerint kéri a régi céljelző őrzését. Ezt a szerződést a használaton kívüli fájl kivételével egyidejűleg kell frissíteni, a működő felület lefedettségét megőrizve.
- **Kapcsolódó P-tétel** — —

### R-KOD-018 · Az első válasz pontozásához a játékterv újrapróbálkozási paramétert ad

- **Azonosító** — R-KOD-018
- **Cím** — Az első válasz pontozásához a játékterv újrapróbálkozási paramétert ad
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A végrehajtási utasítás szó szerinti átvétele megfelezné a pontot és elhagyná a bónuszt.
- **Eredeti utasítás / cél** — A Neon védőtorony első helyes válasza az érvényes pontozási szabályt kapja, és egy másik ügynök ezt helyesen tudja folytatni.
- **Forrás** — `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:1377` és 1378. sor, R-KAN-044.
- **Mi van kész** — A játék magja maga adja a gyorsasággal és erővel skálázott pontot (`source/client/src/lib/speedMath/core.ts:718`). A régi segéd szerződése és a két eltérő próba ellenőrizhető (`source/client/src/game-engine/retry-policy.ts:30`, `source/tests/game-retry-policy.test.ts:36`, 43. sor).
- **Mi hiányzik** — A terv a régi segédet első válaszra attempt=1 értékkel nevezi meg. A segéd ekkor az alappont felét adja. A segédet csak a régi egységteszt importálja; ez nem bizonyítja a mai toronypontozást.
- **Folytatás helye** — `origin/main`, a J4a végrehajtási utasítás és a `source/tests/speed-math-core.test.ts`.
- **Következő lépés** — Vesd össze a mai mag képletét a J4a elfogadott változtatásaival, majd pontosítsd a végrehajtási utasítást a valódi hívásra és pontra. Rögzíts egy normál és egy gyors első találatot közvetlenül a játékmag próbájában. A segéd meghívása előtt a 0-alapú próbálkozás fogalmát is tisztázd.
- **Függőség / ütközés** — A novemberi J4a a retry-t a játékmenetből szándékosan kivette (`docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:1374`). Egy régi szeptemberi pontozási tesztből nem következik, hogy a gyerek ma hibás pontot kap.
- **Kapcsolódó P-tétel** — —

### R-KOD-019 · Kisfilm- és borítókereteknél a numerikus beállítás végtelenné válhat

- **Azonosító** — R-KOD-019
- **Cím** — Kisfilm- és borítókereteknél a numerikus beállítás végtelenné válhat
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. Egy hibás üzemeltetési beállítás érvényes véges korlát nélkül hagyhat fizetős gyártást.
- **Eredeti utasítás / cél** — A napi darabszám és a médiakeret csak ténylegesen érvényes, véges értéket fogadjon el.
- **Forrás** — `docs/fejezet-kisfilmek-hasznalat.md:33`, `docs/specs/2026-11-03-leckeborito-auto.md:46`.
- **Mi van kész** — A kód számjegyeket ellenőriz, a hibás alakra alapértéket ad, a 0 mindkét gyártásnál értelmes korlát (`source/server/lesson-clips.ts:30`, `source/server/lesson-covers.ts:268`).
- **Mi hiányzik** — A Number-konverzió után nincs véges, biztonságos egészre ellenőrzés. Hosszú, csak számjegyekből álló beállításra a konverzió Infinity lehet. MB értéknél a bájtra váltás is meghaladhatja a pontos egész tartományát.
- **Folytatás helye** — `origin/main`, a kisfilm- és borítómunkás konfigurációja.
- **Következő lépés** — Vezess be validált, nemnegatív egész olvasást a két munkáshoz. Az átváltott bájtértéket is ellenőrizd. A `source/tests/lesson-clip-worker.test.ts` és `source/tests/lesson-cover-auto.test.ts` tesztelje a hiányt, 0-t, normál értéket és túlcsordulást. Hibás konfigurációnál a dokumentált biztonságos alapérték vagy egyértelmű letiltás érvényesüljön.
- **Függőség / ütközés** — A 007-es tétel érvényes keret melletti írási hibáról szól. A két javítás egymástól függetlenül próbálható.
- **Kapcsolódó P-tétel** — —

### R-KOD-020 · A TTS-kiszolgáló gyorsítótárából kilökött hangok metaadatai megmaradnak

- **Azonosító** — R-KOD-020
- **Cím** — A TTS-kiszolgáló gyorsítótárából kilökött hangok metaadatai megmaradnak
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P2. Hosszan futó kiszolgálón az egyedi hangok metaadatai a gyorsítótár méretkorlátjától függetlenül gyűlnek.
- **Eredeti utasítás / cél** — A kiszolgálás gyors maradjon úgy, hogy a folyamat memóriája korlátozott legyen.
- **Forrás** — `source/server/tts/audio-routes.ts:63`, `source/shared/speech-fallback.ts:76`, R-PR-503-L1.
- **Mi van kész** — A hangbájtok korlátos cache-be kerülnek. Az általános cache kilökését kis mérethatárral is vizsgálja a `source/tests/speech-fallback.test.ts:69` teszt.
- **Mi hiányzik** — A router ettől független MIME-térképet hoz létre. Minden sikeres tártalálatnál írja a bejegyzést, de a bájtok kilökésekor nem távolítja el (`source/server/tts/audio-routes.ts:68`, 87–96. sor). Ez metaadat-felhalmozódás. Éles memórianövekedést a revízió nem mért.
- **Folytatás helye** — `origin/main`, a lecke-hangtár routere.
- **Következő lépés** — Kezeld a MIME-típust a cache-bejegyzés életciklusával együtt, vagy a tároló igazolt egyetlen MIME-típusát használd (`source/server/tts/audio-store.ts:75`). Szűk cache-sel és több különböző szintetikus hanggal ellenőrizd a kilökést, az ismételt betöltést, a Content-Type-ot és a tartománykérés válaszát.
- **Függőség / ütközés** — A 16 MB-os folyamatmemória és a 40/80 MB-os tartós hangtár külön erőforrás. D-01 a tartós tárról döntött.
- **Kapcsolódó P-tétel** — P-032, P-064.

### R-KOD-021 · A lejátszó az előző leckék hangjegyzékét a memóriában korlátlanul egyesíti

- **Azonosító** — R-KOD-021
- **Cím** — A lejátszó az előző leckék hangjegyzékét a memóriában korlátlanul egyesíti
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P2. Sok leckét egymás után megnyitó böngészőlap memóriája az érintett egyedi hangok számával nőhet.
- **Eredeti utasítás / cél** — Leckeváltáskor a még használható hangtudás maradjon elérhető, meghatározott memóriakerettel.
- **Forrás** — `source/client/src/lesson-runtime/ExperienceSpeech.tsx:106`, `source/shared/speech-preload.ts:137`, R-UTAS-105.
- **Mi van kész** — A tartós jegyzéket az egyesítő korlátozza, a lejátszó lecseréli az előtöltésekhez tartozó bejegyzéseket (`source/client/src/lesson-runtime/speech-player.ts:204`).
- **Mi hiányzik** — A modul teljes életére létrehozott lejátszó másik, availableSizes nevű térképe az új jegyzékek kulcsait felveszi, kilökési feltétele nincs. A visszaérkező régi válasz is az aktuális lecke azonosságának ellenőrzése előtt egyesül (57., 147–152. sor).
- **Folytatás helye** — `origin/main`, `source/client/src/lesson-runtime/speech-player.ts:147`.
- **Következő lépés** — Korlátozd az előző leckékből őrzött adatokat, a jelenlegi lecke kulcsainak megtartásával. A `source/tests/speech-player.test.ts` váltson sok, eltérő mintaszövegű lecke között, majd játssza le az első leckét offline. Vizsgálja a térkép felső korlátját, valamint egy későn beérkező korábbi válasz kezelését.
- **Függőség / ütközés** — Az előtöltési bájtkeret a hangadatot korlátozza, önmagában nem korlátozza ezt a kulcsjegyzéket. Az offline állapotot és a már pufferelt hangot meg kell őrizni.
- **Kapcsolódó P-tétel** — P-032.

### R-KOD-022 · Az adventi elérhetőség két kapcsolója külön kiadási lépést igényel

- **Azonosító** — R-KOD-022
- **Cím** — Az adventi elérhetőség két kapcsolója külön kiadási lépést igényel
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — advent
- **Prioritás-javaslat** — P1. Csak a szerverkapcsoló átállítása után a statikus kliens továbbra sem tölti be a naptároldalt.
- **Eredeti utasítás / cél** — Az előnézet után a főoldali kártya, a naptároldal és a kiszolgáló összehangoltan váljon elérhetővé.
- **Forrás** — `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md:328`, a 2026-11-19-i D-11 (`docs/websuli-potlasok:docs/specs/2026-11-19-websuli-potlasok-terv.md:179`), R-TERV-001.
- **Mi van kész** — Főágon megvan az adventi szabály, óra és adatszerződés. A szerverolvasó a B-ágon (`eeb6fae1:source/server/advent/clock.ts:9`), a külön buildkapcsoló és a lusta naptároldal a C-ágon van (`41bdaa86:source/client/src/advent/season-flag.ts:13`, `41bdaa86:source/client/src/App.tsx:51`).
- **Mi hiányzik** — A megnevezett két olvasó nincs az origin/main megfelelő szerver- és kliensútján. A szerver változása nem építi újra a kliensbe égetett értéket. A két ági implementáció ténye nem igazol éles bevezetést.
- **Folytatás helye** — `feat/advent-b-adatmodell-vegpontok`, `feat/advent-c-felulet`, az A-1 bevezetési szelet.
- **Következő lépés** — Az A-1 kiadási utasításban szerepeljen a kliensbuild konfigurációja és a szerver indítási értéke. Helyi, helyettesített dátumú próbában ellenőrizd mind a négy KI/BE kombinációt a kártyán, a közvetlen oldalon és a státuszvégponton. A kiadási sorrendet és a visszakapcsolás feltételét a próba alapján rögzítsd.
- **Függőség / ütközés** — D-11 szerint a bekapcsolás a tulajdonosi előnézet és A-1 után esedékes, tervezett végső nap november 30. A levelek indításának külön feltétele van (P-056).
- **Kapcsolódó P-tétel** — P-034, P-035, P-038, P-056.

### R-KOD-023 · A korábbi többmodelles Stúdió-kapcsolók visszaállítási utasítása történeti

- **Azonosító** — R-KOD-023
- **Cím** — A korábbi többmodelles Stúdió-kapcsolók visszaállítási utasítása történeti
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. A régi tervet mai üzemeltetési utasításként használva egy beállítás módosítása hatástalan lenne.
- **Eredeti utasítás / cél** — A gyártás visszaállításakor a ténylegesen választható motor és a jelenlegi eljárás legyen egyértelmű.
- **Forrás** — `docs/specs/2026-10-16-egy-futas.md:138`, 144. és 155. sor. Az egyfutásos motorra váltás döntése 2026-10-16, kivezetési commit `d9e9c8e9`.
- **Mi van kész** — A főági gyártás az egyfutásos motorhoz tartozó függőségeket építi (`source/server/studio/single-run/live.ts:104`). A Git-történetben a STUDIO_SINGLE_RUN, STUDIO_BANK_ONLY_REPAIR, STUDIO_VISUAL_DESIGNER és WORKFLOW_ORCHESTRATOR korábbi olvasóinak kivezetése ugyanahhoz a commithoz tartozik.
- **Mi hiányzik** — A történeti értékekből nem lehet mai tartalékmotort kapcsolni. A mai főágon a régi lépésenkénti modell-felülírásoknak sincs működő fogyasztójuk (`source/tests/models-routing.test.ts:31`).
- **Folytatás helye** — `origin/main`, az S4a/S4b időrendi határa és a történeti üzemeltetési hivatkozások.
- **Következő lépés** — Az aktív runbookból ellenőrizd a régi beállításokra vezető hivatkozásokat. Az S4b előtti példákat történeti jelöléssel tartsd meg. A modellútvonal-őr és a főági motorindítás legyen az ellenőrzési alap, ha új üzemeltetési dokumentum készül.
- **Függőség / ütközés** — A 2026-10-19-i S5/S6 döntés két másik kapcsolót újból bekötött (R-TERV-393). Az S4b-kivezetés rájuk nem alkalmazható.
- **Kapcsolódó P-tétel** — —

### R-KOD-024 · A szeptemberi matekidőzítő tesztje ma történeti viselkedést ellenőriz

- **Azonosító** — R-KOD-024
- **Cím** — A szeptemberi matekidőzítő tesztje ma történeti viselkedést ellenőriz
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — játékok
- **Prioritás-javaslat** — P3. A régi teszt nevéből tévesen következtetni lehetne arra, hogy a mai játék minden kérdésére legalább húsz másodperc jut.
- **Eredeti utasítás / cél** — A gondolkodási időt mindig a játék aktuális változatának és korosztályának szerződéséhez mérjük.
- **Forrás** — `docs/specs/2026-09-29-tobb-gondolkodasi-ido-vegrehajtas.md:10`, a 2026-11-16-i J4a végrehajtás 1372–1374. sora (`docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`).
- **Mi van kész** — A régi modult a húsz másodperces minimumot mérő teszt importálja (`source/tests/think-time.test.ts:10`, 16. sor). Az új kérdésütemező saját ablakot számít (`source/client/src/game-engine/play/questionDirector.ts:148`, 195. sor), a játéklap a kapott ablak hosszát adja vissza (`source/client/src/pages/SpeedQuizMath.tsx:2691`).
- **Mi hiányzik** — A régi teszt neve és eredménye nem bizonyítja a mai lap kérdésidejét. A régi modul szándékos megtartását maga a J4a terv megengedi.
- **Folytatás helye** — `origin/main`, a J4a időzítése és a történeti időzítő egységtesztje.
- **Következő lépés** — A teszt leírásában jelöld a régi Villám matek hatókörét. Az új korosztályos időablakot a tényleges kérdésütemező és a játéklap próbáján ellenőrizd. A két tesztnek eltérő működési szerződést kell bizonyítania.
- **Függőség / ütközés** — A 2026-11-16-i terv az időzítéscserét előírja. A szeptemberi értékek visszaállítása nincs a pótlások között.
- **Kapcsolódó P-tétel** — —

### R-KOD-025 · A kabala ági kapcsolója a statikus főoldalhoz nem jut el

- **Azonosító** — R-KOD-025
- **Cím** — A kabala ági kapcsolója a statikus főoldalhoz nem jut el
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A tulajdonos engedélyezheti a kabalát úgy, hogy a statikus főoldal látogatói továbbra sem látják.
- **Eredeti utasítás / cél** — Az előnézet elfogadása után a főoldali kabala az első rajzoláskor, fölösleges hálózati kör nélkül jelenjen meg.
- **Forrás** — P-007, a 2026-11-19-i D-12 döntés (`docs/websuli-potlasok:docs/specs/2026-11-19-websuli-potlasok-terv.md:180`), `80f4c6cc:docs/specs/2026-11-18-kabala-fooldal.md`.
- **Mi van kész** — A főágon még nincs ez a kapcsoló. A `feat/kabala-fooldal` ágon a szerver olvassa a változót és a válasz HTML-jébe írja a metaelemet (`80f4c6cc:source/server/lib/home-flags.ts:11`, `80f4c6cc:source/server/vite.ts:126`). A kliens pontosan ezt az elemet olvassa (`80f4c6cc:source/client/src/lib/home-mascot.ts:14`).
- **Mi hiányzik** — Az ági Vercel-konfiguráció a statikus dist/public könyvtárból szolgálja ki az indexet (`80f4c6cc:source/vercel.json:4`, 57. sor). A kliensbuild nem futtatja az Express-válasz módosítását (`80f4c6cc:source/package.json:13`). A kapcsoló és a metaelem ági hivatkozásainak teljes keresésében nincs statikus buildoldali beszúrás.
- **Folytatás helye** — `feat/kabala-fooldal` (`80f4c6cc`), P-007/G-3. Ez az ágon is hiányzó bekötést jelöli.
- **Következő lépés** — A kliensbuild is állítsa elő a jóváhagyott metaelemet, vagy használjon egyetlen nyilvános buildkapcsolót minden kiszolgálási módhoz. A `80f4c6cc:source/tests/home-mascot.spec.ts` ági próbáját egészítsd ki a tényleges statikus index kiszolgálásával, KI és BE build mellett. A BE változatot a tulajdonosi előnézet után add ki.
- **Függőség / ütközés** — A szerveroldali kapcsoló átállítása önmagában a már felépített statikus fájlt nem változtatja meg. A másik novemberi, adventi kapcsolópár (022) bevált mintát adhat.
- **Kapcsolódó P-tétel** — P-007.

## Kapcsolóleltár

A táblák a főági olvasót, a változó hiányában kapott viselkedést és a bevezetés okát külön mutatják. A buildkapcsoló megváltoztatásához új klienscsomag kell. Az utoljára dokumentált éles állapot nem helyettesíti a szolgáltatónál megfigyelt aktuális értéket.

### Stúdió, tananyag és hang

| Kapcsoló vagy mód | Kód szerinti alap és hatás | Bevezetési szándék, döntés, bizonyíték |
|---|---|---|
| `STUDIO_CATALOG_S6` | KI. Pontosan `1` engedi a tantárgyi katalógust a tervezéshez és bankhoz. | A fizetős A/B külön tulajdonosi lépés. A 2026-10-19-i újrabekötés alapból kikapcsolva történt. `source/server/catalog/s6-context.ts:11`, `source/server/studio/single-run/engine.ts:631`, `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md:36`, R-TERV-393. |
| `STUDIO_SUBJECT_MEMORY` | KI. Pontosan `1` mellett a tantárgy nyitott memóriakártyái bekerülhetnek a kérésbe. | Az élő leletgyűjtés és a kártyák promptba olvasása külön művelet. Az éles írásos feltöltés és a páros próba feltételeit a terv rögzíti. `source/server/memory/subject-memory.ts:13`, `source/server/studio/single-run/engine.ts:655`, `docs/specs/2026-10-06-s5-tantargyi-memoria.md:132`, 191–192. sor. |
| `STUDIO_LESSON_OPENER` | KI. Normalizált `on` mellett Célkártya, nyitómese és lektori ellenőrzés. | Dokumentált éles bekapcsolás **2026-11-08**, #403. A környezeti alapértékből nem következik elmaradt bevezetés. `source/server/studio/lesson-opener-flag.ts:3`, `source/server/studio/step-io.ts:553`, 683. sor, `docs/lesson-improvement.md:46`, R-TERV-159. |
| `STUDIO_SOURCE_VISUALS` | Éles kódalap KI, a normalizált `on` kapcsolja be. A mérőprogram alapja BE, felülírható. A térkép lenyomata is különválik. | A 2026-11-18-i leírás szerint élesben KI, engedélyezés S10/1 mérés és tulajdonosi döntés után. `source/server/studio/source-visuals-flag.ts:13`, `source/server/studio/single-run/live.ts:76`, `source/scripts/measure/single-run-measure.mts:75`, `docs/lesson-improvement.md:48`. R-KOD-012–013, P-028, P-066. |
| `sourceCoverage` | A kódbeli kapumód `report`. Vizuális leltár nélkül a motor tényleges módja `off`. A futás saját `gateModes` felülírása más módot is enged. | Jelentés az átmeneti szakaszban, később `enforce` a megjelenítő és az ábrakészítő után. D-03 szerint kapuhibánál vázlat és értesítés a cél. `source/server/studio/gates/config.ts:12`, `source/server/studio/single-run/engine.ts:713`, pótlási terv 131. sor. |
| `STUDIO_ANSWER_KEY_TESTS` | Alapból BE, pontosan `0` tiltja a válaszkulcs-próbákat a friss ellenőrző beszélgetésnél. | Vészfék külön többletellenőrzéshez. `source/server/studio/answer-key-writer.ts:89`, `source/server/studio/single-run/engine.ts:307`, `source/tests/answer-key-tests.test.ts`. |
| `STUDIO_QUIZ_BLIND` | Alapból BE, pontosan `0` tiltja a kulcs nélküli kvízellenőrző függőség bekötését. | Önálló vészfék a bank ellenőrzési költségéhez és viselkedéséhez. `source/server/studio/single-run/engine.ts:302`, 308. sor. |
| `STUDIO_CHECK_EFFORT` | Normalizált `low` esetén alacsony, minden más értéknél `medium`. | Az ellenőrző hívások A/B mérése. A mérési kimenet rögzíti az értelmezett értéket. `source/server/studio/single-run/engine.ts:161`, 293. sor, `source/scripts/measure/single-run-measure.mts:17`. |
| `STUDIO_BANK_CONCURRENCY`, `STUDIO_KNOWLEDGE_TIMEOUT_MS` | Alapból 3 párhuzamos bankegység (1–5 választható), illetve 20 000 ms a tudásbetöltési határidő. | A gyártási sebesség és a lassú tudásforrás elválasztása. `source/server/studio/single-run/engine.ts:62`, 81–87. sor. |
| `LESSON_COVERS`, `LESSON_COVER_DAILY_LIMIT` | Éles, nem E2E indításnál, szolgáltatói kulccsal alapból indulhat a borítógyártás. Pontosan `0` letiltja. Alap napi 20 kép. | Az elkészült képek száma táblából jön, UTC-naponként. Az új képhívások külön, **folyamatonkénti** korlátot kapnak. Az újraindulás ezt az utóbbi számlálót nullázza, a terv is így határozza meg. `source/server/index.ts:550`, `source/server/lesson-covers.ts:265`, 287–292., 305. sor, `docs/specs/2026-11-03-leckeborito-auto.md:46`. |
| `LESSON_CLIPS`, `LESSON_CLIPS_AUTO` | `LESSON_CLIPS=0` mindkettőt leállítja. Egyébként alapból `idle` (kiszolgálás). `LESSON_CLIPS_AUTO=on` és használható szolgáltatói kulcs esetén `auto`. | A meglévő filmek megtekintése és a fizetős gyártás külön engedély. A leckeút vészféknél olvasás nélkül üres listát ad. `source/server/lesson-clips.ts:26`, `source/server/index.ts:555`, `source/server/studio/lesson-routes.ts:107`, `docs/fejezet-kisfilmek-hasznalat.md:38`. |
| `LESSON_CLIP_DAILY_LIMIT`, `LESSON_CLIP_MEDIA_MAX_MB` | V2 alapérték 2 lecke/nap, illetve 400 × 1024² bájt. Automata módban egy körben két párhuzamos fejezet. | A korábbi terv 10 leckés példáját a V2 D7 pontosította. `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md:20`, `source/server/lesson-clips.ts:20`, 30–32. sor. R-KOD-007–010, 019. |
| `TTS_AUDIO_MAX_TOTAL_BYTES` | A verziónkénti 40 MiB lefelé állítható, akár nullára. Az abszolút 80 MiB és a fájlonkénti 300 KiB kódállandó. Az olvasó és a gyártó különálló. | D-01, 2026-11-19 jóváhagyta a 40/80-as párost és a néma próbakimondás elhagyását. `source/server/tts/audio-store.ts:47`, 52., 85. és 147. sor, pótlási terv 129. sor, R-PR-503-L1, P-064. |
| Játék helyi `tts` és blokk `readAloud` | A játék saját beállítása alapból BE, a felolvasás támogatott környezetet és a csökkentett mozgás kikapcsolását is megköveteli ezen a játékútvonalon. | A felhasználó döntése és a böngésző képessége külön feltétel. A leckelejátszó saját hangtár–böngésző–szerver sorrendet számít. `source/client/src/game-engine/play/gameSettings.ts:18`, `source/client/src/game-engine/play/speech.ts:48`, `source/client/src/lib/tts.ts:19`, `source/client/src/lesson-runtime/speech-player.ts:399`, R-UTAS-105. |
| `TTS_AUTO_GENERATE` | **Tervezett név**, a főági lecke végén nincs ilyen változóolvasó. | S8c tulajdonosi kapcsolója lenne az új leckék szószedetéhez, alapból KI. A már megvalósult hangtár, GET és elérhetőségi jegyzék nem indít hanggyártást. `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md:1094`, `source/server/tts/audio-routes.ts:79`, 83. sor. A végrehajtandó pótlás P-032. |
| Tanulói `newsletter` | Adatbázisban alapból hamis. A munkás az aktív címet és a fogadó tanuló választását küldés előtt újra ellenőrzi. | Személyes hozzájárulás, független a globális értesítési háttérmunkástól. `source/shared/schema.ts:1230`, `source/server/newsletter.ts:172`, 183., 250. és 298. sor. |

### Fiók, közös játék és évszakos felület

| Kapcsoló | Alapállapot és fogyasztó | Üzemeltetési jelentés |
|---|---|---|
| `PLAYER_ACCOUNTS` | Alap KI, a normalizált `on`, `1`, `true` engedélyez. A státusz KI esetén is elérhető, a védett fiókút 404. | A 2026-11-16-i tulajdonosi döntés szerint a fiókok BE, a közös játék még KI. Az üzemeltetési lap is a fiókok bekapcsolását rögzíti. `source/server/player/require-player.ts:10`, `source/server/routes.ts:897`, `docs/jatek-fiok-uzemeltetes.md:3`, pótlási terv 87. sor, R-UTAS-084. |
| `PLAYER_BAN_MAINTENANCE` | Normalizált `off` mindig tilt. Egyébként production vagy explicit `on` engedélyez. A lejárt belépőkódok takarítása külön indul. | Fejlesztői indításkor a tartós tiltás-karbantartás csak kifejezett beállításra fusson. `source/server/player/account-store.ts:79`, `source/server/index.ts:641`. |
| `PLAYER_LOGIN_EMAIL_DAILY_MAX`, `PLAYER_BAN_RETENTION_MONTHS` | Alap 300 levél/24 óra, illetve 12 hónap. Tartományon kívül visszaállnak az alapértékre. | Kézbesítési és adatmegőrzési korlát, a felhasználói fiókkapcsoló mellett. `source/server/player/codes.ts:38`, 124. sor. |
| `MP_MODE` | Alap `off`. Az `admin` pilotot és az `on` nyilvános módot ismeri. Admin módban a szobanyitás adminjoghoz kötött. A már futó átjáró megléte is feltétel. | A 2026-11-19-i D-07 az M-1 után adminpilotot, a JM3b után nyilvános nyitást ír elő. `source/server/realtime/config.ts:45`, `source/server/routes/rt.ts:82`, `source/server/realtime/index.ts:117`, pótlási terv 177–178. sor, P-022. |
| `MP_GAMES`, `MP_ROOM_MAX_PLAYERS` | A főági protokoll ismert játéka a `parbaj`, ez az alaplista. Szobaméret alap 2, az értelmező 2–4 között enged értéket. | Az értelmező felső határa önmagában nem igazol kész négyfős felületet. Az első publikus többfős kiadás feltételeit P-018 írja le. `source/shared/duel/protocol.ts:46`, 53. sor, `source/server/realtime/config.ts:69`, 83. sor. |
| `MP_RUNS_PRIORITY`, `MP_MAX_ROOMS`, `MP_MAX_ROOMS_DURING_RUNS` | Alap `auto`, a futó gyártás alapján. `on` mindig az alacsonyabb plafon, `off` a normál plafon. Alap 50, terhelés alatt legfeljebb 10. | A tananyaggyártás védelme új szoba nyitásakor. `source/server/realtime/config.ts:7`, 68–76. sor. |
| Egyéb `MP_*` beállítások | Kapcsolat- és IP-plafon, jegy-, szoba-, csatlakozási és kézfogási korlát, ülőhely és kapcsolódás határideje. A direkt HTTPS-cím opcionális. `MP_DRAIN_WINDOW_MS` alap 2500, elfogadott 0–5000 ms. | Minden numerikus név, alapérték és korlát egy helyen, `source/server/realtime/config.ts:77`–88. sor. A leállási idő külön olvasója `source/server/realtime/index.ts:35`. A kliensre átadott elérhetőség hibája R-KOD-006. |
| `PLAYER_POINTS` | A JM8a tervében szerepel, a főág futó kódjában nincs olvasója. | A pontkönyv és a meglévő eredményút közötti későbbi átmenet. Egy környezeti érték most nem kapcsol át pontkönyvre. `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:2842`, 2888. sor, P-019. |
| `ADVENT_CALENDAR`, `VITE_ADVENT_CALENDAR` | Főágon a naptár alapmoduljai vannak. B/C ágon az előbbi szerveroldali, normalizált `on/1/true`. A C-ágon az utóbbi kliensbuild-érték, pontosan `on`. Mindkettő hiányában KI. | A két kiadási lépés, ág és dátum R-KOD-022-ben szerepel. Főági alapok `source/shared/advent/calendar.ts:2`, `source/shared/advent/rules.ts:6`, `source/shared/advent/contract.ts:12`. |
| `HOME_MASCOT` | Csak a kabalaágon van olvasó. Hiányában KI, normalizált `on` esetén a szerver HTML-metajelzést ad. | A D-12 szerinti előnézeti elfogadást a statikus kliensbuild bekötésével is össze kell egyeztetni. `80f4c6cc:source/server/lib/home-flags.ts:11`, R-KOD-025. |

### Teszt, mérés, QA és kivezetett kapcsolók

| Vezérlés | Alap és indok | Ellenőrzési hely |
|---|---|---|
| `VITE_ENABLE_GAME_TEST_HOOKS`, `VITE_ENABLE_RUNTIME_PROBE` | Nincs beállítva → KI. Pontos `1` engedi a labor-, illetve a próbaútvonalakat. A külön E2E-build mindkettőt bekapcsolja. | `source/client/src/App.tsx:29`, 79–97. sor, `source/client/src/game-engine/game-test-hooks.ts:9`, `source/package.json:12`. A kész éles csomag vizsgálata R-KOD-014. |
| `WEBSULI_E2E`, `WEBSULI_DISPOSABLE_DB` | Pontos `1` az alkalmazás E2E-módja. A tesztfuttató saját eldobható adatbázis-azonosítót ad az integrációs próbáknak. Más belépési pontok eltérő bizonyítékot ellenőriznek. | `source/playwright.config.ts:67`, `source/server/lib/e2e-mode.ts:7`, `source/server/index.ts:541`, `source/scripts/run-e2e-tests.ts:82`, `source/tests/daily-reminder-db.integration.ts:11`, R-TERV-192. |
| `WEBSULI_CHECK_PROD_BUNDLE` | Pontos `1` aktiválja a két készcsomag-ellenőrzést. A forrásőr alapból ettől függetlenül fut. | `source/tests/game-test-hooks-guard.test.ts:30`, 39. és 54. sor. A CI-bekötés R-KOD-014. |
| `LESSON_LIVE_BROWSER`, `LESSON_CURRENT_BANK` | Alapból a szokásos fúziós böngészőpróba fut. `1` az élő böngészőfájlra, azon belül a második kapcsoló a másik helyi bankmintára vált. | `source/playwright.lesson-fusion.config.ts:4`, `source/tests/lesson-fusion-live.browser.ts:6`. Ezek tesztválasztók, az elkészült leckét nem módosítják. |
| `MEASURE_SAME_MAP`, `MEASURE_KNOWLEDGE` | Alapból KI. Az első `1`-nél térképből indulna, a második tantárgyhoz tartozó tudásmásolatot készíthet. Fájl és azonos térkép nem használható együtt. | `source/scripts/measure/single-run-measure.mts:62`, 69–71. sor. A mérési adat előállítását meg kell különböztetni az S5/S6 motorbeli felhasználásától. |
| `MEASURE_DRY`, `MEASURE_SAVE_LESSON` | Alapból KI. Pontos `1` az előbbinél modellhívás előtti leállás, az utóbbinál a teljes elkészült lecke mentése a mérés kimenetébe. | `source/scripts/measure/single-run-measure.mts:106`, 120., 162. sor. A száraz út ettől még helyi adat-előkészítést végez. R-KOD-013. |
| `MEASURE_BUDGET_USD` | A tervben javasolt mérési paraméter, főágon nincs megvalósított olvasó. | A korábbi próbaköltség-javaslat a TGM végrehajtás 648. és 713. sorában áll. A 2026-11-19-i D-02 az új futásidő- és körszámmegállítókról döntött. A mérési költségkeret külön követelmény. P-029, P-065. |
| `JOY_MEASURE`, `JOY_CI_LAG_MS`, `BR_CPU_THROTTLE`, `BR_CI_LAG_MS`, `E2E_CPU_THROTTLE` | A részletes joystickmérés és a mesterséges késés/lassítás külön próbabeállítás. Hiányuk nem kapcsol ki játékfunkciót. | `source/tests/joystick-response.spec.ts:27`, 258. sor, `source/tests/brainrot-play.spec.ts:22`, 42. sor, `source/tests/word-ladder-play.spec.ts:50`. |
| `MATERIAL_TITLE_SHOTS_ONLY`, `E2E_SHARDS` | Az első a címpróba képrögzítő üzemmódja. A CI felosztása a rögzített workflow-ban 6 szelet. | `source/tests/material-title.spec.ts:6`, `.github/workflows/ci.yml:12`. |
| `WEBSULI_DIFF_SCAN` | A teljes szerkesztést vizsgáló hook és a lint hozzáadott sorokat látó futása eltérő bemenetet kap. A lint a gyermekfolyamatában adja a módot. | `scripts/qa/hooks/enforce-repo-rules.mjs:86`, `scripts/qa/gates/lint-gate.mjs:173`. A hookok telepítése `.claude/settings.json:70`. R-TERV-205, P-045. |
| `WEBSULI_QA_EVIDENCE_DIR`, `WEBSULI_RT_STATUS_URL` | Opcionális bizonyítéktár-, illetve státuszútvonal. Alapértelmezésben a Git közös könyvtára, illetve a kapukonfiguráció címe. | `scripts/qa/gates/lib.mjs:160`, `scripts/qa/hooks/check-quality-gates.mjs:355`, `scripts/qa/gates/pre-merge-gate.mjs:180`. A meglévő munkafaszintű pótlás P-058. |
| `WEBSULI_HOOK_GIT_TIMEOUT_MS`, `WEBSULI_HOOK_GH_TIMEOUT_MS`, `WEBSULI_HOOK_BUDGET_MS`, `WEBSULI_AUDIT_GIT_TIMEOUT_MS` | Időkeretek. A minőségkapu-hook a konfigurációból indul. Az audit Git-időkeretének próbafelülírása tesztfolyamathoz kötött. | `scripts/qa/hooks/check-quality-gates.mjs:309`, `scripts/qa/gates/gates.config.json:72`, `scripts/qa/hooks/check-audit-ok.mjs:34`. P-045, P-046. |
| `NODE_ENV`, Vite `DEV/PROD`, szolgáltatói képességek | Futtatási környezetek és képességek. Például csak éles módban indul az időzített hírlevél; a fejlesztői statikus audit ugyanitt tiltott. A hiányzó beszéd- vagy képszolgáltató a kisfilm tartalékútját választhatja. | `source/server/newsletter.ts:298`, `source/server/routes/static-audit.ts:13`, `source/server/lesson-clips-providers.ts:25`, `source/server/lesson-clips.ts:103`. A proxy-hitelesítés konfigurációs hivatkozása `source/server/lib/client-ip.ts:18`; konfigurált titokérték nem része a leltárnak. |
| `STUDIO_SINGLE_RUN`, `STUDIO_BANK_ONLY_REPAIR`, `STUDIO_VISUAL_DESIGNER`, `WORKFLOW_ORCHESTRATOR`, régi `STUDIO_MODEL_*` | Történeti kapcsolók, a mai egyfutásos motorban hatástalanok. Ide tartoznak a régi scope, OCR, author, animator és gate-helper modellpéldák. | `d9e9c8e9`, `docs/specs/2026-10-16-egy-futas.md:138`, `source/tests/models-routing.test.ts:31`. R-KOD-023. |

**Alapból KI, dokumentált okkal.** A fenti főági termékfunkcióknál méréshez, fázishoz vagy tulajdonosi döntéshez kötött indulást találtam. Pusztán az alapérték alapján egyikhez sem indokolt éles átkapcsolás. A főági olvasó nélküli tervnevek, a működő ági olvasók és a kivezetett nevek külön azonosíthatók. A CI-ből kimaradt készcsomag-ellenőrzés (014) ténylegesen bekötetlen automatizmus.

## A mérési keret külön átadandó javítása

### R-KOD-026 · A fizetős mérőprogram nem adja át a próbafutás költségplafonját

- **Azonosító** — R-KOD-026
- **Cím** — A fizetős mérőprogram nem adja át a próbafutás költségplafonját
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A terv szerinti változó beállítása ma nem korlátozza a mérőprogram szolgáltatói költését.
- **Eredeti utasítás / cél** — Az éles gyártás költségjelzése mellett a tulajdonos által elkülönített mérési keretnek kemény határa legyen.
- **Forrás** — `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md:647`, 648., 711–713. sor. A **2026-11-19-i pótlási terv 163. sora** külön megőrzi a kemény próbakeretet, a 479. és 545. sor az éles SK3 új megállítóit korlátozza.
- **Mi van kész** — A mérőprogramnak van száraz útja, a valódi futásnál pedig elkülönített beszélgetést és adattárat ad a motornak (`source/scripts/measure/single-run-measure.mts:106`, 131–142. sor). A motor rögzíti a használati adatokat (`source/server/studio/single-run/telemetry.ts`).
- **Mi hiányzik** — A MEASURE_BUDGET_USD olvasása és a trialBudgetUsd átadása hiányzik a főági mérőből és motorból. A költség után visszaolvasott telemetria nem állítja meg a következő hívás elindítását. A rögzített főágon a tervben megnevezett trial-ledger.mts útvonal sincs.
- **Folytatás helye** — `origin/main`, TGM SK3 mérési része, `source/scripts/measure/single-run-measure.mts:135`.
- **Következő lépés** — A mérés előellenőrzésében olvasd és validáld a próbakeretet. A fizetős kérés indítása előtt foglald le a tervezett összeget, majd számold el a felhasználást; a párhuzamos bankhívások ugyanazt a keretet terheljék. Szintetikus költségekkel teszteld a maradékot meghaladó következő hívást, a párhuzamos indulást, a hibás konfigurációt és a keret nélküli normál gyártást. Az előellenőrzéshez ne kelljen szolgáltatói hívás.
- **Függőség / ütközés** — A 7,5 USD a tervben megadott egyfutásos próbaérték, a pótlási tervben a teljes próbakeret 30 USD. A D-02 szerinti éles működésbe ne kerüljön általános új leállító.
- **Kapcsolódó P-tétel** — P-029, P-033, P-065; az elkülönített mérőparaméter kódútja az itteni többlet.

## Forrásmérleg és átadás

| Állapot | Tételek | Azonosítók (R-KOD-) |
|---|---:|---|
| RÉSZBEN | 21 | 001–003, 005–021, 025 |
| NEM VALÓSULT MEG | 1 | 026 |
| ÁGON KÉSZ, NINCS BENT | 1 | 022 |
| NEM IDŐSZERŰ | 2 | 023–024 |
| ELLENŐRIZETLEN | 1 | 004 |
| KÉSZ | 8 | 027–034 |
| **Összesen** | **34** | **001–034** |

**A javítások sorrendje.** A 001 és 011–014 az ellenőrzések megbízhatóságát javítja. A 003 a meglévő push-feliratkozások helyreállítását érinti, így nem kell megvárnia az új feliratkozási felületről szóló 004-es döntést. A 007-es kemény mérethatárhoz igazítható a 008-as részhiba és a 009-es állapotjelzés. A 013 és 026 lezárása előtt a dokumentált fizetős „utána” mérés előfeltételei nincsenek igazolva. Az adventi és kabalaág átvételekor a lefordított, statikusan kiszolgált index is az elfogadás része.

**Forráshatárok.** A főági fájlok számlálása a jelen dokumentum első táblájának megfelelően 1758/1758. A Git-napló, a megmaradt munkamenetek, az összesített PR- és kanbanexport, az 522 szálfájl, a verziózott és a helyi memória a kapcsolódó szándékok és duplikátumok feloldásához szolgáltak. Ezek elsődleges forrástérképe az 01–04. szeletben van. A más ágakról vett konkrét implementáció mellett mindig szerepel a ref vagy a commit. A helyi Git-lenyomat utáni távoli változások, a Vercel/Render aktuális konfigurációja, a kiadott ügyfelek száma, az esetleges tár- vagy memórianövekedés tényleges mértéke és a nem megmaradt Claude-átiratok tartalma ellenőrizetlen. A statikusan bizonyítható eltéréseket ezek nélkül is át lehet adni helyi javításra.

**Jelöltek kizárása.** A szöveges keresésben a TODO lehet feladatállapot vagy bankadat, a FIXME lehet a tiltást leíró szabály saját mintája, az 501 pedig egy matekfeladat válaszlehetősége is. Az űrlap helyőrzője, a munka közbeni „feldolgozás alatt” tartalom és a lejátszó próbafogadó útja eltérő életciklusban működik. A szó szerinti TODO/FIXME-megjegyzések keresése mellett a tényleges válaszkódot, a statikus vagy dinamikus belépőt, a teszt-only fogyasztót és a megszüntetett motor olvasóit is vizsgáltam. A közös adventi könyvtárnak az alkalmazásimport hiánya mellett is van igazolt önálló szerződése és tesztje.

## KÉSZ · egysoros bizonyítékok

A következő nyolc sor egyenként egy szűk, főágon igazolható viselkedést zár le. A próbahivatkozások verziózott teszteket jelölnek.

| Azonosító | Cím | Állapot | Terület | Prioritás-javaslat | Eredeti utasítás / cél | Forrás | Mi van kész | Mi hiányzik | Folytatás helye | Következő lépés | Függőség / ütközés | Kapcsolódó P-tétel |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R-KOD-027 | A HTML-leckék önálló interakciós belépője | KÉSZ | tananyag | P1. A régi leckék lejátszását érinti. | Épüljön külön betölthető leckeinterakciós csomag. | `source/vite.config.ts:22` | Az önálló bemenetnek rögzített kimeneti neve van a 24. sorban. Próba: `source/tests/lesson-interactions.browser.ts:14`. | — | origin/main | A belépő módosításakor ellenőrizd a régi HTML-leckében a külön csomag betöltését. | A fő SPA importgráfjában önmagában nem látszik. | — |
| R-KOD-028 | Német és francia Szólétra-bank | KÉSZ | játékok | P2. A nyelvválasztó kínálatát határozza meg. | A létező nyelvi bankok kerüljenek a választóba. | `source/client/src/data/wordLadder/registry.ts:12` | A Vite-glob mindkét modult beemeli, a regiszter név szerint kiválasztja őket (23–24. sor). A lap ebből számolja a kínálatot (`source/client/src/pages/WordLadderHuEn.tsx:314`). | — | origin/main | A bankok módosításakor maradjon a választó és a két nyelvi bank próbája. | A külön szóbankbetöltő másik adatforrás. | — |
| R-KOD-029 | Forrásábrás térkép elkülönítése a korábbi térképtől | KÉSZ | tananyag | P1. Hibás cache-találat kihagyhatná a kinyerést. | Bekapcsolt leltárnál kapjon új lenyomatot a térkép. | `source/server/studio/single-run/live.ts:76` | A keresés a sémaverziós lenyomatot használja (81., 89–91. sor), a két mód eltérését teszt rögzíti (`source/tests/source-visuals-flag.test.ts:75`). | — | origin/main | A séma frissítésekor őrizd meg a KI állapot régi lenyomatát. | A térkép tulajdonosi elkülönítése külön tétel, R-KAN-011. | P-028 |
| R-KOD-030 | A hangtár olvasása nem indít fizetős gyártást | KÉSZ | TTS | P1. A nyilvános olvasásnak költségmentesnek kell maradnia a hanggyártás szempontjából. | Külön út adja a rendelkezésre állást és a meglévő hangot. | `source/server/tts/audio-routes.ts:9` | A jegyzék store.existing hívásra, a hang store.get hívásra épül (79–80., 93. sor). | — | origin/main | Gyártó bekötésekor ellenőrizd, hogy hiányzó hang GET-je sem hoz létre sort. | Az S8c gyártási kapcsoló külön tervezett funkció. | P-032 |
| R-KOD-031 | A belépőkód-takarítás külön áll a tiltáskarbantartástól | KÉSZ | fiók-közös játék | P1. A lejárt azonosítók megőrzését érinti. | A kódok takarítása menjen, a tartós tiltások karbantartása a saját feltételeit kövesse. | `source/server/index.ts:641` | A kódok törlési callbackje feltétlen paraméter, a tiltásoké csak engedélyezett módban kerül átadásra (644. sor, `source/server/player/account-store.ts:79`). | — | origin/main | A két időzített funkciót külön visszatérési feltételekkel ellenőrizd változtatáskor. | E2E-ben az indítási ág elkülönül. | — |
| R-KOD-032 | Az adventi nap időzónája | KÉSZ | advent | P1. A decemberi ablak helyi éjfélkor vált. | Az átadott időpontból budapesti naptári napot számítson. | `source/shared/advent/calendar.ts:2` | A dátumformázó Europe/Budapest zónát használ (8. sor), a téli UTC-napváltáshoz konkrét próba tartozik (`source/tests/advent-calendar.test.ts:10`). | — | origin/main | A szerver bekötésekor ugyanezt a modult ellenőrizd éjfél mindkét oldalán. | Ez a mag állapota; az ági oldal és végpont a 022-es tétel. | P-034 |
| R-KOD-033 | Az E2E-adatbázis hálózati céljának ellenőrzése | KÉSZ | infrastruktúra | P1. Elkerüli az éles adatbázis közvetlen használatát a próbában. | E2E-módban csak megengedett loopback célhoz nyíljon pool. | `source/server/db.ts:29` | A kapcsolati cím ellenőrzése a pool létrehozása előtt fut. Az URL-ellenőrzés és a literális IP próbája visszakereshető (`source/server/lib/e2e-mode.ts:12`, `source/tests/e2e-mode.test.ts:15`). | — | origin/main | Az E2E indító módosításakor a címválasztást és a tesztadatbázis létrehozását együtt ellenőrizd. | Egy loopback cím önmagában nem azonosítja a konténer tulajdonosát. | — |
| R-KOD-034 | A kisfilmek KI állapota adatbázis-olvasás nélkül válaszol | KÉSZ | tananyag | P2. Leállított funkciónál is működőképes marad a leckelap. | A vészfék rejtse el a filmet és zárja le a várakozást. | `source/server/studio/lesson-routes.ts:106` | A korai visszatérés üres listát és pending=false értéket ad (109. sor), a kiszolgálási módokra külön állítások vannak (`source/tests/lesson-clip-worker.test.ts:212`). | — | origin/main | A 009-es állapotjavításkor tartsd meg a KI ág adatbázismentes válaszát. | Az idle mód a már kész filmeket továbbra is kiszolgálhatja. | — |
