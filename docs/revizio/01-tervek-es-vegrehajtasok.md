# WEBSULI teljes revízió · 01. Tervek és végrehajtások

**Állapotnap: 2026. november 20.** A vizsgált főág az `origin/main` helyben elérhető `d9d1e6c6d706a0c96b1f16d5fd44db2c7b09a1d8` commitja. A megmaradt Claude-munkamenetek tulajdonosi üzenetei csak 2026. november elejéig nyúlnak vissza. A korábbi Claude-átiratok elvesztek. A régebbi kérések a Gitből, a tervekből, a végrehajtási naplókból, az átadókból és a PR-okból rekonstruálhatók. A git-előzmény legkorábbi elérhető főági commitja 2025-12-09, `303898a4`.

A főágon **680** fájlt olvastam végig a `docs/specs/` alatt, az alkönyvtárakkal együtt, továbbá **15** átadót és **19** közvetlen Markdown-útmutatót. A rögzített helyi refek teljes előzménye további **56** különböző útvonalat ad. A 770 fájl **406** átadható tervcsaládhoz tartozik. Azonos nevű ági dokumentumokból további **114** külön szövegváltozatot vetettem össze a választott példánnyal.

**Olvasási sorrend.** Először a konkrét eltéréseket és a kiadásra váró ágakat nézd. Az elfogadási sormutató a hosszú végrehajtási utasítások közepén és végén álló pontokra is visszavezet. A teljesült családok egysoros listája a dokumentum végén van.

| Állapot | Tervcsaládok |
|---|---:|
| NEM VALÓSULT MEG | 4 |
| RÉSZBEN | 225 |
| ÁGON KÉSZ, NINCS BENT | 16 |
| ELLENŐRIZETLEN | 14 |
| NEM IDŐSZERŰ | 14 |
| KÉSZ | 133 |

**Bizonyítás.** A dátum nélküli fájlhivatkozások a fenti főági commitra mutatnak. Az ági hivatkozás alakja `commit:útvonal:sor`. A PR-szám mellett említett futás az eredeti PR vagy a commit korabeli eredménye. Ebben a revízióban csak olvasási műveletek történtek. Az elfogadott állapothoz az eredeti feltételeket vizsgáltam. Egy rokon fájl neve, egy kipipált sor vagy a PR beolvasztása önmagában nem ad teljes elfogadást. Ahol csak azonosítót, megvalósítást vagy próbát sikerült azonosítani, a teljes szerződés ellenőrizetlen marad.

**Kapcsolódó leltár.** A P-azonosítók a `7ed789eebe:docs/websuli-potlasok.md` 68 tételére mutatnak. A folytatás sorrendje ugyanott a `docs/specs/2026-11-19-websuli-potlasok-terv.md` 50 szelete. A hivatkozott P-állapotot az újabb főági kód, PR vagy tulajdonosi döntés pontosíthatja. Az ellenőrzésben 522 PR-leírást és 522 review-szál-exportot olvastam be. Az ügynökmemóriában 36 elérhető Markdown-fájl volt. A helyi PR-export, a review-szálak, a kanban-lista és jegyszövegek, a főági napló, a Codex- és a megmaradt tulajdonosi üzenetexport segítette az összevetést.

## Önálló javítási és ellenőrzési tételek

A következő szeletekhez a forrás már konkrét javítási vagy mérési feladatot ad.

- **R-TERV-014** — A visszatöltés közben mentett adminmódosítás felülíródhat. A korábbi 81 soros sikeres visszatöltés nem vizsgálta ezt a versenyhelyzetet.
- **R-TERV-094** — Két párhuzamos lektorfolyamat ugyanazt a szabad költségkeretet költheti el.
- **R-TERV-277** — A normál állapotlekérdezés kész futást jelezhet használható publikációs hivatkozás nélkül.
- **R-TERV-162** — A hideg kérés 1977–3495 ms-os mérése meghaladta a 2000 ms-os felső célt.
- **R-TERV-262** — A minta rövidülése 16% volt az elvárt legalább 25% helyett.
- **R-TERV-217** — A bizonyíték-átvitel és a végleges összefésült próba a tulajdonosi döntés szerint külön szelet.

## Igazolt eltérések, követőpontok és ági megvalósítások

### R-TERV-001 · Spec: Adventi naptár — „Fénylő ablakok” (új, szezonális játék)

- **Azonosító** — R-TERV-001
- **Cím** — Spec: Adventi naptár — „Fénylő ablakok” (új, szezonális játék)
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A szezonhoz kötött feladat csak adott napokon elérhető.
- **Eredeti utasítás / cél** — A tanuló a megfelelő napon nyithassa ki az ajtót, és a haladása a fiók-, kép- és értesítési úton is megmaradjon.
- **Forrás** — `docs/specs/2026-11-18-adventi-naptar.md:103`, `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md:456`, `docs/handoffs/2026-11-18-adventi-naptar-retro.md:74`
- **Mi van kész** — A főági naptármag és kérdéskészlet megvan (#511), és a képgyártó többletköltséget, hibás kérést, zár utáni újraolvasást is kezel (#519). source/shared/advent/calendar.ts:24, source/tests/advent-christmas-bank.test.ts:21, source/scripts/design-assets/generate.ts:114, :180 és source/tests/advent-art-pipeline.test.ts:153, :473.
- **Mi hiányzik** — Az adatmodell és végpontok a feat/advent-b-adatmodell-vegpontok ágon, az oldal és kártya a feat/advent-c-felulet ágon található. A főági kiszolgálás, az eszközök jóváhagyása, az egyetlen szezonális levél és a takarítás nincs együtt készen.
- **Folytatás helye** — `docs/specs/2026-11-18-adventi-naptar.md:1` · #511
- **Következő lépés** — A B ágon kezdd a vendég haladásának párosításkori átvitelével. Ugyanazt az ajtót két azonos idejű kéréssel is ellenőrizd. Ezt követheti a C nézet dátumhatára, majd az admin előnézet és a levél.
- **Függőség / ütközés** — A terv 969. sora a régi 881. sor levélütemét felülírja. A végleges kép és levél jóváhagyásáról P-056 rendelkezik.
- **Kapcsolódó P-tétel** — P-034, P-035, P-036, P-037, P-038, P-039, P-055, P-056

### R-TERV-004 · Spec: az IP-alapú kéréskorlátok a valódi kliens címe szerint számoljanak

- **Azonosító** — R-TERV-004
- **Cím** — Spec: az IP-alapú kéréskorlátok a valódi kliens címe szerint számoljanak
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. A hozzáférés vagy az adatvédelem közvetlenül érintett.
- **Eredeti utasítás / cél** — A korlátozás a valós klienshez tartozzon a jóváhagyott proxyútvonalon keresztül is.
- **Forrás** — `docs/specs/2026-11-10-korlat-kliens-ip.md:77`, `docs/specs/2026-11-10-korlat-kliens-ip-vegrehajtas.md:5`
- **Mi van kész** — A szerveres döntés a source/server/lib/client-ip.ts:74 alatt fut. A terv 84., 92–104. sorai a közvetlen Render-út mérését rögzítik.
- **Mi hiányzik** — Az A6 két külön hálózatból, Vercelen át kapott külön számlálója akkor nem volt igazolva.
- **Folytatás helye** — `docs/specs/2026-11-10-korlat-kliens-ip.md:1` · #412
- **Következő lépés** — A Cloudflare-követő ág elfogadását egyeztesd A6-tal. Két külön ellenőrzött hálózaton ugyanazon anonimizált számláló viselkedését hasonlítsd össze, címek közlése nélkül.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-052

### R-TERV-006 · Spec: a kitakaró (titok- / e-mail-maszkoló) minták négyzetes futása és összeomlása

- **Azonosító** — R-TERV-006
- **Cím** — Spec: a kitakaró (titok- / e-mail-maszkoló) minták négyzetes futása és összeomlása
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint.
- **Eredeti utasítás / cél** — Az érzékeny szöveg kitakarása hosszú bemeneten is kiszámítható ideig tartson.
- **Forrás** — `3641d3926:docs/specs/2026-11-19-kitakaro-negyzetes-regex.md:93`, `70067c1db:docs/specs/2026-11-19-kitakaro-negyzetes-regex-vegrehajtas.md:7`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `70067c1db:scripts/qa/gates/lib.mjs:45` és `70067c1db:source/tests/design-assets.test.ts:167`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/kitakaro-negyzetes-regex` (70067c1db) · #521 OPEN
- **Következő lépés** — A(z) `fix/kitakaro-negyzetes-regex` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-049 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-049

### R-TERV-007 · Terv: a CF-Connecting-IP csak igazolt Cloudflare-úton számítson (kliens-IP hamisítás, 169)

- **Azonosító** — R-TERV-007
- **Cím** — Terv: a CF-Connecting-IP csak igazolt Cloudflare-úton számítson (kliens-IP hamisítás, 169)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. A hozzáférés vagy az adatvédelem közvetlenül érintett.
- **Eredeti utasítás / cél** — A korlátozás a valós klienshez tartozzon a jóváhagyott proxyútvonalon keresztül is.
- **Forrás** — `1416cbf1f:docs/specs/2026-11-20-kliens-ip-cloudflare-ut.md:72`, `b73f464c8:docs/specs/2026-11-20-kliens-ip-cloudflare-ut-vegrehajtas.md:30`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `1416cbf1f:source/server/lib/client-ip.ts:64` és `1416cbf1f:source/tests/client-ip.test.ts:182`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/kliens-ip-cloudflare-ut` (1416cbf1f)
- **Következő lépés** — A(z) `fix/kliens-ip-cloudflare-ut` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-052 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-052

### R-TERV-010 · Titok- és fájlhigiéniai jegyzet — 2026-09-13

- **Azonosító** — R-TERV-010
- **Cím** — Titok- és fájlhigiéniai jegyzet — 2026-09-13
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. A hozzáférés vagy az adatvédelem közvetlenül érintett.
- **Eredeti utasítás / cél** — A korábban nyilvánossá vált hozzáférést vonják vissza, a program környezeti hivatkozást használjon.
- **Forrás** — `docs/security-secret-hygiene-2026-09-13.md:1`
- **Mi van kész** — Az aktuális szkript környezeti hivatkozást használ (add-mcp-config.ps1:6, :9). A dokumentum 15–17. sora a visszavonást külön üzemeltetési feladatként rögzíti.
- **Mi hiányzik** — Szolgáltatói nyugta nélkül a korábbi hozzáférés visszavonása nem állapítható meg gitből.
- **Folytatás helye** — `docs/security-secret-hygiene-2026-09-13.md:1` · #475
- **Következő lépés** — A titokkezelő és szolgáltató naplójában ellenőrizd a régi jogosultság visszavonásának időpontját. A jelentésben csak a siker tényét és a dátumot rögzítsd.
- **Függőség / ütközés** — A munkafa állapota és a történetkezelés külön döntés. P-023 egy eltérő adatvédelmi ügy.
- **Kapcsolódó P-tétel** — —

### R-TERV-014 · A meglévő leckék arculatának mentése az adatbázisba (backfill) — terv

- **Azonosító** — R-TERV-014
- **Cím** — A meglévő leckék arculatának mentése az adatbázisba (backfill) — terv
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P1. Egy párhuzamos módosítás elveszhet.
- **Eredeti utasítás / cél** — A tananyagokhoz jóváhagyott, témához illő kép tartozzon, a régi tartalom megőrzése mellett.
- **Forrás** — `docs/specs/2026-10-18-arculat-backfill.md:30`, `docs/specs/2026-10-18-arculat-backfill-vegrehajtas.md:1`
- **Mi van kész** — A visszatöltő megvizsgálja a régi dokumentumot és az írásnál az arculat hiányát. A visszaállító külön összevetést végez. source/scripts/design-assets/backfill-lesson-art.mts:21, :34–38, :54. A #283 visszaállítási pontot és 81 soros írást, az ismételt száraz futásban nulla teendőt rögzít.
- **Mi hiányzik** — A teljes korábbi JSON visszaírása elveszítheti a közben végzett adminmódosítást, ha az arculat mező továbbra is üres. A tranzakció kezdete nem zárja e sorokat (source/scripts/lib/read-only-db.ts:53).
- **Folytatás helye** — `docs/specs/2026-10-18-arculat-backfill.md:1` · #283
- **Következő lépés** — A módosítást kösd a visszaolvasott verzióhoz, vagy zárd a sort és olvasd újra. Két kapcsolattal teszteld a szöveg párhuzamos szerkesztését és a csak arculatra vonatkozó új módosítás megőrzését.
- **Függőség / ütközés** — A terv 19. és 26–30. sora írja le a meglévő tartalom és visszaállíthatóság követelményét.
- **Kapcsolódó P-tétel** — —

### R-TERV-094 · Tömeges tartalmi lektorálás a 2026. szeptember végéig készült tananyagokon — terv

- **Azonosító** — R-TERV-094
- **Cím** — Tömeges tartalmi lektorálás a 2026. szeptember végéig készült tananyagokon — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. Párhuzamos hívásokkal túlléphető a vállalt költséghatár.
- **Eredeti utasítás / cél** — A meglévő anyagok tartalmi lektorálása ellenőrizhető javítással és közös költségplafonnal fusson.
- **Forrás** — `docs/specs/2026-10-18-tartalmi-lektoralas.md:80`, `docs/specs/2026-10-18-tartalmi-lektoralas-vegrehajtas.md:1`
- **Mi van kész** — A költségolvasás megelőzi a hívást, a tényleges összeget a válasz után számolják, a kötegenkénti napló pedig az anyag végén frissül. source/scripts/content-review/proofread.mts:70, :76, :84, :214. Az ötanyagos próbát a végrehajtás 44–47. sora rögzíti.
- **Mi hiányzik** — Két egyidejű folyamat ugyanazt a még szabad keretet láthatja. A 20 USD-s közös korlátot ez nem garantálja (terv 60–63, 83).
- **Folytatás helye** — `docs/specs/2026-10-18-tartalmi-lektoralas.md:1` · #299
- **Következő lépés** — A hívás elé tegyél közösen érvényes, atomi költségfoglalást. Két párhuzamos, szimulált hívással ellenőrizd, hogy csak az egyik kapja meg az utolsó keretet, és a hiba után elszámolható a foglalás.
- **Függőség / ütközés** — A teljes köteg adat- és költségnyugtája külön ellenőrzendő.
- **Kapcsolódó P-tétel** — —

### R-TERV-107 · Spec: Tananyaggyártás minősége — értelmezett forrásbeolvasás, változatosság, mért javítás, brit felolvasás

- **Azonosító** — R-TERV-107
- **Cím** — Spec: Tananyaggyártás minősége — értelmezett forrásbeolvasás, változatosság, mért javítás, brit felolvasás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A tananyag megtartsa a forrás vizuális és tartalmi elemeit, a kész termék minősége pedig mérhető legyen.
- **Forrás** — `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md:323`, `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md:190`
- **Mi van kész** — A forrásvizuál kapcsolója, a fedettségi kapu és a táblázat/szabálydoboz megjelenítői megvannak (source/server/studio/source-visuals-flag.ts:13, source/server/studio/gates/source-coverage-gate.ts:25 és source/client/src/lesson-runtime/blocks/source-visuals.tsx:106, :148). A hanglánc #516-ban került be (source/shared/speech-chain.ts:26).
- **Mi hiányzik** — A kapcsoló éles bekötése, a tényleges hanggyártás, S4–S7 utómunka és az S9/S10 kiadási mérés még külön bizonyítást kér. Az S5a újabb terve önmagában tervezés.
- **Folytatás helye** — `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md:1` · #516
- **Következő lépés** — A P-028–P-033 sorrendjében indulj a forrás megtartásának próbájával: hiányzó és igazolt vizuált külön példán ellenőrizz kikapcsolt, megfigyelő és kötelező módban. Csak a működő hanglánc megállapításából ne jelentsd késznek a hanggyártást.
- **Függőség / ütközés** — A hangtárban van méretőr (source/server/tts/audio-store.ts:47, :52). A néma próba, a keretek és az éles kapcsolók döntéseit a P-064–P-066 tartalmazza.
- **Kapcsolódó P-tétel** — P-028, P-029, P-030, P-031, P-032, P-033, P-064, P-065, P-066

### R-TERV-138 · Spec: a kisfilm-gyártás memóriabarát átkódolása (éles hiba javítása)

- **Azonosító** — R-TERV-138
- **Cím** — Spec: a kisfilm-gyártás memóriabarát átkódolása (éles hiba javítása)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A dokumentált memóriahatár-átlépés újraindította a szolgáltatást.
- **Eredeti utasítás / cél** — A tanuló fejezetenként kapjon lejátszható kisfilmet, a gyártás férjen bele az erőforráskorlátokba.
- **Forrás** — `5bbaab438:docs/specs/2026-11-10-kisfilm-memoria.md:48`, `5bbaab438:docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md:1`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `fc8aa73d5:source/scripts/clip-trial.ts:40` és `fc8aa73d5:source/tests/lesson-clip.test.ts:91`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `kisfilm-memoria-javitas` (fc8aa73d5) · #418 OPEN
- **Következő lépés** — A(z) `kisfilm-memoria-javitas` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-041 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-041

### R-TERV-139 · Telepítés előtti őr — ne szakíts meg futó tananyaggyártást

- **Azonosító** — R-TERV-139
- **Cím** — Telepítés előtti őr — ne szakíts meg futó tananyaggyártást
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint.
- **Eredeti utasítás / cél** — Folyamatban lévő gyártás vagy játék idején a telepítés ne szakítsa meg a felhasználó munkáját.
- **Forrás** — `docs/telepites-elotti-or.md:3`
- **Mi van kész** — A merge előtti szkript meghívja az aktív futások őrét (scripts/qa/gates/pre-merge-gate.mjs:108–110, :178). Az útmutató 29–34. sora minden egyes összevonás előtti újbóli ellenőrzést ír elő.
- **Mi hiányzik** — A Render oldali beállítás és az éles többjátékos mérkőzések tényleges védelme külön környezeti bizonyítékot igényel.
- **Folytatás helye** — `docs/telepites-elotti-or.md:1` · #489
- **Következő lépés** — Az őr és a külső telepítési esemény idősorát vesd össze egy korábbi, azonos verziójú kiadásban. Az 1-es és 2-es kilépési utat próbáld ki helyi helyettesítővel.
- **Függőség / ütközés** — P-052-nél folytasd; az ablakonként egyszeri ellenőrzést a 29. sor pontosítja.
- **Kapcsolódó P-tétel** — P-052

### R-TERV-162 · Terv — a játék-kérdésbank végpont memória- és időigénye (kanban 67, havi audit T1)

- **Azonosító** — R-TERV-162
- **Cím** — Terv — a játék-kérdésbank végpont memória- és időigénye (kanban 67, havi audit T1)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A szerver hideg állapotból is elfogadható idő és memória mellett állítsa elő a kérdésbankot.
- **Forrás** — `docs/specs/2026-11-16-quiz-bank-memoria.md:118`, `docs/specs/2026-11-16-quiz-bank-memoria-vegrehajtas.md:4`
- **Mi van kész** — A kötegelt beolvasás a source/server/gameQuizBankService.ts:64 alatt van. A source/tests/quiz-bank-scale-db.integration.ts:145 tíz párhuzamos kérésnél vizsgálja az egyszeri építést.
- **Mi hiányzik** — A 118–122. sorban a hideg kérés 1977–3495 ms a legfeljebb 2 s cél mellett. A fél CPU-n végzett mérés hiányzik.
- **Folytatás helye** — `docs/specs/2026-11-16-quiz-bank-memoria.md:1` · #67
- **Következő lépés** — A meglévő 300×2 adatsoron, 0,5 CPU-val válaszd külön a hideg és a gyorsítótárból kiszolgált kéréseket. A lekérdezés és az építés idejét külön rögzítsd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-009

### R-TERV-206 · Spec: Szkript-ellenőrző kapuk a teljes vertikumra (terv)

- **Azonosító** — R-TERV-206
- **Cím** — Spec: Szkript-ellenőrző kapuk a teljes vertikumra (terv)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A tervezéstől a kiadásig minden előírt szkriptkapunak legyen egyértelmű bemenete és ellenőrizhető kimenete.
- **Forrás** — `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:386`, `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md:306`
- **Mi van kész** — P1 a főági d9d1e6c6 (#517) commitban van. A P2 bizonyítéklánc külön ágon szerepel. A terv 330–350. sora az eredeti S0–S2 és S8 szeleteket osztja újra.
- **Mi hiányzik** — Az új P1–P5 sorrend nem fedi az eredeti S3 spec–teszt kötést, S4 játékszerződést, S5 telepítés utáni próbát, S6 higiéniát, S7 teljesítménykeretet, S9 javaslatot és S10 kapumetrikát.
- **Folytatás helye** — `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:1` · #517
- **Következő lépés** — P2-nél a munkafánkénti bizonyítékot és a fejazonosságot ellenőrizd. Önálló követőként kezeld az S3-at: egy név szerint megadott elfogadási pontra és a hozzá tartozó tesztre legyen pozitív és hiányzó kötéses próba.
- **Függőség / ütközés** — P-042 csak részben fedi a teljes tervet. A P-047/P-054 részátfedését a következő szelet előtt egyeztesd.
- **Kapcsolódó P-tétel** — P-042, P-047, P-054, P-058

### R-TERV-248 · Értesítő az új Stúdió-leckéről; a reggeli levél csak ismétlést ajánl

- **Azonosító** — R-TERV-248
- **Cím** — Értesítő az új Stúdió-leckéről; a reggeli levél csak ismétlést ajánl
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek.
- **Eredeti utasítás / cél** — Új lecke publikálásakor egyszer, a jogosult címzettekhez jusson el az értesítés.
- **Forrás** — `docs/specs/2026-10-22-uj-lecke-ertesito.md:38`, `docs/specs/2026-10-22-uj-lecke-ertesito-vegrehajtas.md:1`
- **Mi van kész** — Az új lecke publikálása indítja a címzettek értesítését, a régi általános napi küldés megváltozott. source/server/daily-reminder.ts:173–195 és source/server/studio/pipeline-store.ts:300.
- **Mi hiányzik** — A még nem kézbesített címzettek sora csak memóriában él. A mentés után leálló folyamatban a maradék elveszhet.
- **Folytatás helye** — `docs/specs/2026-10-22-uj-lecke-ertesito.md:1` · #365
- **Következő lépés** — Szimuláld a leállást a publikálás és a címzettek befejezése között. A megismételhető, címzettenként folytatható megoldást az eredeti 30. sorral egyeztesd.
- **Függőség / ütközés** — A 2026-10-22-i terv kizárta a külön ismétlésvédelmi táblát. A tartós küldési szándék megoldásához erről dönteni kell; P-025 a leckeeredmény másik levéltípusa.
- **Kapcsolódó P-tétel** — —

### R-TERV-258 · Spec: Változatos tananyag és szebb ábrák — a TGM-lánc változatossági és ábra-szeleteinek előrehozása

- **Azonosító** — R-TERV-258
- **Cím** — Spec: Változatos tananyag és szebb ábrák — a TGM-lánc változatossági és ábra-szeleteinek előrehozása
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Spec: Változatos tananyag és szebb ábrák.
- **Forrás** — `f2df634a5:docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:154`, `f2df634a5:docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md:24`
- **Mi van kész** — A f2df634a commit az új S5a tervet és a végrehajtási párját adja hozzá. A főági ábramegjelenítés ettől külön, korábbi rész (source/client/src/lesson-runtime/blocks/source-visuals.tsx:106).
- **Mi hiányzik** — Az új S5a változatos nyitásainak és visszajelzéseinek működő bekötése nincs igazolva a rögzített ági változtatásban vagy a főági megvalósításban.
- **Folytatás helye** — `feat/tgm-s5a-visszajelzes-nyitasok` (f2df634a5)
- **Következő lépés** — A tervben kijelölt változatossági feltételt két egymást követő generált blokk szintetikus mintáján ellenőrizd, utána kösd be az ági végrehajtás szerint.
- **Függőség / ütközés** — P-030 továbbvitele; a tervpár megjelenése még nem beolvasztott szolgáltatás.
- **Kapcsolódó P-tétel** — P-030

### R-TERV-356 · Eredménylevél — tartós szerveres küldési sor (tervvázlat, a pótlási terv T-3 szelete)

- **Azonosító** — R-TERV-356
- **Cím** — Eredménylevél — tartós szerveres küldési sor (tervvázlat, a pótlási terv T-3 szelete)
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek.
- **Eredeti utasítás / cél** — A kész leckeeredményhez tartozó levél folyamatleállás után is egyszer kézbesíthető maradjon.
- **Forrás** — `d3c0f4bfc:docs/specs/2026-11-20-eredmenylevel-tartos-sor.md:22`
- **Mi van kész** — #495/#496 külön foglalást és teljes kvízeredményt ad, #510 a megszakított körön dolgozik. A tartós szerveres sor a 2026-11-20-i ági terv 1–4. sora szerint önálló T-3 vázlat. A főági beszámoló küldési útja source/server/lesson-result-email.ts:67, :110.
- **Mi hiányzik** — A leállás utáni ismételhető szerveres kézbesítés a rögzített főági és #510-es munkától külön feladat.
- **Folytatás helye** — `fix/eredmeny-email-kviz` (444872920) · #510 OPEN
- **Következő lépés** — Az alkalmazott eredmény és a tartós küldési szándék kapcsolatát tervezd meg. Próba közben szakítsd meg a folyamatot a rögzítés és a küldés között, majd ellenőrizd az egyszeri kézbesítést.
- **Függőség / ütközés** — A levelekre az aktív foglalás önmagában nem tartós sor. P-025; az S1b elkészülte külön P-024.
- **Kapcsolódó P-tétel** — P-024, P-025

### R-TERV-024 · Spec: korszerű főoldal — borító-bélyegképes, évfolyamsáv-arculatú tananyagkártyák

- **Azonosító** — R-TERV-024
- **Cím** — Spec: korszerű főoldal — borító-bélyegképes, évfolyamsáv-arculatú tananyagkártyák
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A kezdőoldal a tervben megjelölt nézetben gyorsan és használható állapotban jelenjen meg.
- **Forrás** — `docs/specs/2026-11-03-fooldal-boritokartyak.md:99`, `docs/specs/2026-11-03-fooldal-boritokartyak-vegrehajtas.md:18`
- **Mi van kész** — A #381 375 és 1280 pixel szélességen rögzített eredményt.
- **Mi hiányzik** — A terv külön kért 390 pixeles nézetéhez nincs azonosított mérés.
- **Folytatás helye** — `docs/specs/2026-11-03-fooldal-boritokartyak.md:1` · #381
- **Következő lépés** — A #381 kiinduló főoldalával ellenőrizd a 390 pixeles nézetben a képkivágást, a feliratot és a megnyitást.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-031 · Spec: WEBSULI pótlások — a heti elmaradások teljes vertikumú pótlási terve

- **Azonosító** — R-TERV-031
- **Cím** — Spec: WEBSULI pótlások — a heti elmaradások teljes vertikumú pótlási terve
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A korábbi hiányok listájából egy másik ügynök egyenként átvehető javítási szeleteket kapjon.
- **Forrás** — `7ed789eeb:docs/specs/2026-11-19-websuli-potlasok-terv.md:337`, `4cdd7af74:docs/websuli-potlasok.md:159`, `7ed789eeb:docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md:73`
- **Mi van kész** — A leltár és az 50 szelet terve a docs/websuli-potlasok ágon megtalálható.
- **Mi hiányzik** — A dokumentumsorozat külön ágon van. A javítások állapotát a P-azonosítók szerint kell követni.
- **Folytatás helye** — `docs/websuli-potlasok` (7ed789eeb)
- **Következő lépés** — A folytatáshoz keresd ki az érintett P-azonosítót a leltárból és a hozzá rendelt szeletet a végrehajtási tervből.
- **Függőség / ütközés** — A tervre mutató commit és az ági megvalósítás feje eltérhet.
- **Kapcsolódó P-tétel** — —

### R-TERV-032 · Spec — A 2026-09-01-i audit 4 nyitott tétele (2026-09-02)

- **Azonosító** — R-TERV-032
- **Cím** — Spec — A 2026-09-01-i audit 4 nyitott tétele (2026-09-02)
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A 2026-09-01-i audit 4 nyitott tétele (2026-09-02).
- **Forrás** — `docs/specs/backlog-4-2026-09-02.md:9`
- **Mi van kész** — A négy javítás 8b8e2622, 172 teszt és helyi próbák mellett került be. source/server/routes.ts:1014, :1082, :3124 és source/server/lib/migration-sql.ts:24.
- **Mi hiányzik** — A terv 54–61. sorában kért éles lekérés és beágyazás eredménye továbbra is hiányzik.
- **Folytatás helye** — `docs/specs/backlog-4-2026-09-02.md:1`
- **Következő lépés** — Az eredeti kiadáshoz vagy azzal azonos működésű új verzióhoz kösd a nyilvános lekérés és a tényleges beágyazott nézet személytelen nyugtáját.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-033 · Tanulói profil: ki tanul, mit, milyen eredménnyel — terv

- **Azonosító** — R-TERV-033
- **Cím** — Tanulói profil: ki tanul, mit, milyen eredménnyel — terv
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A profil, a haladás és a kapcsolódó értesítés ugyanahhoz a jogosult tanulóhoz tartozzon.
- **Forrás** — `docs/specs/2026-10-18-tanuloi-profil.md:67`
- **Mi van kész** — A profil és a hozzárendelés #301/#302, a sorozat, heti összesítés és emlékeztető a lezárt külön ágak után #305-ben van. source/tests/learner-profile.test.ts:16, source/tests/learner-attribution.test.ts:32, source/tests/learner-streak.test.ts:6 és source/tests/learner-report.test.ts:23.
- **Mi hiányzik** — Az öt végrehajtási utasítás külön éles hozzáférési, párosítási és nézetpróbákat is előír. Az egyes hiányzó nyugtákat az S1–S5 tételek azonosítják.
- **Folytatás helye** — `docs/specs/2026-10-18-tanuloi-profil.md:1` · #301
- **Következő lépés** — Az öt végrehajtási párból indulva egyeztesd a telepített fejet, a jogosultsági utat és a személytelen eredményt. A helyi működés bizonyítékát külön őrizd meg.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-034 · Tanulói profil — S1 Azonosítás — végrehajtási utasítás (ügynöknek)

- **Azonosító** — R-TERV-034
- **Cím** — Tanulói profil — S1 Azonosítás — végrehajtási utasítás (ügynöknek)
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A profil, a haladás és a kapcsolódó értesítés ugyanahhoz a jogosult tanulóhoz tartozzon.
- **Forrás** — `docs/specs/2026-10-18-tanuloi-profil-s1-vegrehajtas.md:1`
- **Mi van kész** — #301, 2130/2130, source/tests/learner-profile.test.ts:16, :35, :59, :67.
- **Mi hiányzik** — A funkció igazolt. A külön végrehajtásban előírt, még visszakeresendő nyugta: a négy-hat arányú éles aggregátum és az érvénytelen munkamenet 401-es válasza (végrehajtás 67–69).
- **Folytatás helye** — `docs/specs/2026-10-18-tanuloi-profil-s1-vegrehajtas.md:1` · #301
- **Következő lépés** — Az elfogadott fejhez és a megjelölt belépőhöz rendeld az eredeti, személytelenített futási eredményt. Új termékmódosítást csak kimutatott eltérés indokol.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-035 · Tanulói profil — S2 Hozzárendelés — végrehajtási utasítás (ügynöknek)

- **Azonosító** — R-TERV-035
- **Cím** — Tanulói profil — S2 Hozzárendelés — végrehajtási utasítás (ügynöknek)
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A profil, a haladás és a kapcsolódó értesítés ugyanahhoz a jogosult tanulóhoz tartozzon.
- **Forrás** — `docs/specs/2026-10-18-tanuloi-profil-s2-vegrehajtas.md:1`
- **Mi van kész** — #302, nyolcból nyolc eredményrögzítési eset és a hozzárendelés útja (source/tests/learner-attribution.test.ts:32, :49, :76).
- **Mi hiányzik** — A végrehajtás 58. sora éles, párosított mobilpróbát is kér.
- **Folytatás helye** — `docs/specs/2026-10-18-tanuloi-profil-s2-vegrehajtas.md:1` · #302
- **Következő lépés** — A mai munkamenet-kezeléssel kövesd a párosított telefon eredményét a megfelelő profilhoz. Az azonosítót hagyd ki a megosztott nyugtából.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-036 · Tanulói profil — S3 Napi sorozat — végrehajtási utasítás (ügynöknek)

- **Azonosító** — R-TERV-036
- **Cím** — Tanulói profil — S3 Napi sorozat — végrehajtási utasítás (ügynöknek)
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A profil, a haladás és a kapcsolódó értesítés ugyanahhoz a jogosult tanulóhoz tartozzon.
- **Forrás** — `docs/specs/2026-10-18-tanuloi-profil-s3-vegrehajtas.md:16`
- **Mi van kész** — A lezárt #303 után a közös #305-ben van a főági változat és a source/tests/learner-streak.test.ts:6, :28.
- **Mi hiányzik** — A funkció igazolt. A külön végrehajtásban előírt, még visszakeresendő nyugta: az éles, jogosulatlan profil-lekérés 401-es válasza (végrehajtás 32).
- **Folytatás helye** — `docs/specs/2026-10-18-tanuloi-profil-s3-vegrehajtas.md:1` · #305
- **Következő lépés** — Az elfogadott fejhez és a megjelölt belépőhöz rendeld az eredeti, személytelenített futási eredményt. Új termékmódosítást csak kimutatott eltérés indokol.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-037 · Tanulói profil — S4 Admin — végrehajtási utasítás (ügynöknek)

- **Azonosító** — R-TERV-037
- **Cím** — Tanulói profil — S4 Admin — végrehajtási utasítás (ügynöknek)
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A profil, a haladás és a kapcsolódó értesítés ugyanahhoz a jogosult tanulóhoz tartozzon.
- **Forrás** — `docs/specs/2026-10-18-tanuloi-profil-s4-vegrehajtas.md:15`
- **Mi van kész** — A főági heti összesítés #305-ben van. source/server/learner-reports.ts:74–78, :145 és source/tests/learner-report.test.ts:8, :23.
- **Mi hiányzik** — A végrehajtás 60. sorában kért tényleges heti tesztlevél kiküldéséhez külön nyugta hiányzik.
- **Folytatás helye** — `docs/specs/2026-10-18-tanuloi-profil-s4-vegrehajtas.md:1` · #305
- **Következő lépés** — A jogosult címzetthez küldött, engedélyezett próba összesített eredményét ellenőrizd.
- **Függőség / ütközés** — A részletes terv tanulónkénti aggregátumot kér egy adminlevélben, az általános terv tanulónkénti levele helyett.
- **Kapcsolódó P-tétel** — —

### R-TERV-038 · Tanulói profil — S5 Okos emlékeztető — végrehajtási utasítás (ügynöknek)

- **Azonosító** — R-TERV-038
- **Cím** — Tanulói profil — S5 Okos emlékeztető — végrehajtási utasítás (ügynöknek)
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A profil, a haladás és a kapcsolódó értesítés ugyanahhoz a jogosult tanulóhoz tartozzon.
- **Forrás** — `docs/specs/2026-10-18-tanuloi-profil-s5-vegrehajtas.md:1`
- **Mi van kész** — #305, source/tests/daily-reminder-smart.test.ts:15, :29, :53, a korábban lezárt külön ág helyett.
- **Mi hiányzik** — A funkció igazolt. A külön végrehajtásban előírt, még visszakeresendő nyugta: az éles adminelőnézet (végrehajtás 36–37).
- **Folytatás helye** — `docs/specs/2026-10-18-tanuloi-profil-s5-vegrehajtas.md:1` · #305
- **Következő lépés** — Az elfogadott fejhez és a megjelölt belépőhöz rendeld az eredeti, személytelenített futási eredményt. Új termékmódosítást csak kimutatott eltérés indokol.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-040 · Spec: Játékélmény — a hét tanulójáték valódi telefonos játékká alakítása (J0–J9), közös többjátékos mód, párbaj és játékos-fiók (JM0–JM11, JB)

- **Azonosító** — R-TERV-040
- **Cím** — Spec: Játékélmény — a hét tanulójáték valódi telefonos játékká alakítása (J0–J9), közös többjátékos mód, párbaj és játékos-fiók (JM0–JM11, JB)
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A hét játék fejlesztése, az online párbaj és a játékosfiók egymásra épülő szeletekben legyen átadható.
- **Forrás** — `docs/specs/2026-11-16-jatekok-jatekelmeny.md:566`, `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md:189`, `docs/handoffs/2026-11-16-jatekelmeny-fiok-retro.md:139` és 1 további forrás a sormutatóban
- **Mi van kész** — J1a, J2a, J4a/b, J5a és J7a átvételét többek közt #483, #454, #466, #485 és #482 támasztja alá. A Brain Rot már a közös ismétlősort használja (source/client/src/lib/brainRot/sim.ts:26, :146 és source/tests/brainrot-sim.test.ts:230). A JM3a két játékost kezel (source/shared/duel/room-machine.ts:159).
- **Mi hiányzik** — J1b/c, J2b, J3b/c, J5b, J6b, J7c, a hullámzárás és a JM3b utáni fiók- és közösségi szeletek maradnak. J3a, J6a és J7b ágon elkészült részleteihez lásd a P-mutatót.
- **Folytatás helye** — `docs/specs/2026-11-16-jatekok-jatekelmeny.md:1` · #475
- **Következő lépés** — Előbb az ágak pontskála-, mérési és döntési feltételeit egyeztesd a kapcsolódó P-tétellel. A többjátékos munkát a kétfős szoba → újracsatlakozás → több résztvevő sorrendben mérd.
- **Függőség / ütközés** — A helyi kétfős arénát a JM1r váltotta fel. A végrehajtás 2154–2156. sora szerint a korábbi mód eltávolítása szándékos.
- **Kapcsolódó P-tétel** — P-001, P-002, P-003, P-013, P-014, P-015, P-016, P-017, P-018, P-019, P-021, P-022, P-063

### R-TERV-041 · Futó Websuli saját tudásrendszere

- **Azonosító** — R-TERV-041
- **Cím** — Futó Websuli saját tudásrendszere
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás közben szerzett ismeret ellenőrizhető és visszavonható módon segítse a következő futást.
- **Forrás** — `docs/specs/2026-09-12-runtime-knowledge.md:15`, `docs/specs/2026-09-12-runtime-knowledge-vegrehajtas.md:1`, `docs/handoffs/2026-09-12-runtime-knowledge-release.md:41`
- **Mi van kész** — A saját 15–21. sor összes pontja teljesült, #60. docs/handoffs/2026-09-12-runtime-knowledge-release.md:25–31, 1179 unit, 20 PG/HTTP, 150 E2E, jogosult és 401-es út. source/shared/runtime-knowledge.ts:21, :31 és source/tests/runtime-knowledge.test.ts:10, :33, :39.
- **Mi hiányzik** — A családhoz kapcsolt átadó 37–43. sora külön kérte az új feltöltés teljes folyamatát; az eredeti runtime-tudástár elfogadása ezt nem tartalmazza.
- **Folytatás helye** — `docs/specs/2026-09-12-runtime-knowledge.md:1` · #60
- **Következő lépés** — Az új feltöltés eredményét a feltöltési család konkrét forrására és publikációjára keresd vissza. A tudástár adminnézetének ismételt felépítésére nincs szükség.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-042 · Internetes tananyag: tudásbázis és 7.4 fúziós gyártás

- **Azonosító** — R-TERV-042
- **Cím** — Internetes tananyag: tudásbázis és 7.4 fúziós gyártás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A témához gyűjtött forrásokból teljes, visszaolvasható lecke készüljön a webes készítőn keresztül.
- **Forrás** — `docs/specs/2026-09-13-web-knowledge-pipeline.md:61`, `docs/specs/2026-09-13-web-knowledge-pipeline-vegrehajtas.md:104`, `docs/handoffs/2026-09-13-tananyag-pipeline-handoff.md:36`
- **Mi van kész** — Van témát használó helyi átadási próba (source/tests/web-studio-handoff.test.ts:12, :43). Az átadó az Egervár-téma indítását és végigfuttatását külön kérte (docs/handoffs/2026-09-13-tananyag-pipeline-handoff.md:32–49).
- **Mi hiányzik** — Ehhez a témához nem azonosítható hiteles, publikált végeredmény a helyi próba alapján.
- **Folytatás helye** — `docs/specs/2026-09-13-web-knowledge-pipeline.md:1` · #66
- **Következő lépés** — Az admin futásnaplóban és a katalógusban keresd meg az azonos témájú futást. Hasonlítsd össze a forrásszöveget, a végeredményt, a bankot és a publikált visszaolvasást, mielőtt új gyártást indítasz.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-044 · Kivonatolás: csonka válasz ne állítsa meg a gyártást (2026-09-30)

- **Azonosító** — R-TERV-044
- **Cím** — Kivonatolás: csonka válasz ne állítsa meg a gyártást (2026-09-30)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A hosszú forrásból is befejezett, ellenőrizhető fogalomkivonat készüljön.
- **Forrás** — `docs/specs/2026-09-30-kivonatolas-keret.md:9`, `docs/specs/2026-09-30-kivonatolas-keret-vegrehajtas.md:1`
- **Mi van kész** — A korábbi pontos modellsorrend vagy lépésenkénti bővítés története: #156. A 2026-10-16-i tulajdonosi döntést a #262, d9e9c8e9 valósította meg (docs/specs/2026-10-16-egy-futas.md:3, :138, :147). A főági beszélgetés beállításai: source/server/studio/single-run/conversation.ts:22, :83, :118.
- **Mi hiányzik** — Az előző gyártási gép modell- vagy keretszerződése nem hatályos. A korabeli mérés és az új út teljesítménye külön kérdés.
- **Folytatás helye** — `docs/specs/2026-09-30-kivonatolas-keret.md:1` · #156
- **Következő lépés** — Az új egyfutásos úton, a mai beállítással vesd össze az eredmény minőségét. A régi sorrend vagy külön alügynök visszaépítése nem következik a régi tervből.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-045 · Spec: A tanári kérés forrásból igazolt pontjai kiegészítő fogalmak (nem elakadó közzététel, 6. szelet)

- **Azonosító** — R-TERV-045
- **Cím** — Spec: A tanári kérés forrásból igazolt pontjai kiegészítő fogalmak (nem elakadó közzététel, 6. szelet)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár által megadott szempontokhoz legyen ellenőrizhető forráskötés és teljesítési eredmény.
- **Forrás** — `docs/specs/2026-09-30-tanari-keres-forrasbol.md:21`, `docs/specs/2026-09-30-tanari-keres-forrasbol-vegrehajtas.md:1`
- **Mi van kész** — A #155 az Egyiptom-forrásból 4/4 tanári kérést és további négy fogalmat azonosított. A korabeli tesztkör 1785/1785.
- **Mi hiányzik** — Az eredeti instruction-check és step-runner út megszűnt. Az új motor ugyanezen forrásból kinyert kérései nincsenek visszaigazolva.
- **Folytatás helye** — `docs/specs/2026-09-30-tanari-keres-forrasbol.md:1` · #155
- **Következő lépés** — A #155 forrásmintáját kövesd végig a source/server/studio/single-run/engine.ts bemenetétől a publikált anyagig. A négy kérést külön soron egyeztesd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-050 · S6 — A tantárgyi katalógus bekötése a gyártásba (2026-10-06)

- **Azonosító** — R-TERV-050
- **Cím** — S6 — A tantárgyi katalógus bekötése a gyártásba (2026-10-06)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A katalógusba kerülő és onnan kiválasztott tartalom használata legyen forrással és méréssel igazolható.
- **Forrás** — `docs/specs/2026-10-06-s6-katalogus-bekotes.md:96`, `docs/specs/2026-10-06-s6-katalogus-bekotes-vegrehajtas.md:1`
- **Mi van kész** — Az egyfutásos úton a kapcsolós tudásbetöltés visszakerült (source/server/studio/single-run/engine.ts:679, :870, :948 és source/tests/single-run-knowledge.test.ts:127, :142).
- **Mi hiányzik** — A ≥50%-os cél helyett a visszajátszás 13,16% lelet- és 19,23% körszámcsökkenést becsült. docs/measurements/2026-10-16-katalogus-ab-replay.json:28–42.
- **Folytatás helye** — `docs/specs/2026-10-06-s6-katalogus-bekotes.md:1` · #202
- **Következő lépés** — Egyeztesd a terv 104–105. és 153. sorát az új bekötéssel. Ugyanabból a forrásból, azonos kerettel mérj katalógussal és nélküle, ha az új mérést a tulajdonos kéri.
- **Függőség / ütközés** — A 1120-as mérést korábban okafogyottként zárták. docs/archive/agent-vezerles-2026-11-17/kanban-allapot-2026-10-05_11-02.md:15.
- **Kapcsolódó P-tétel** — —

### R-TERV-052 · MHT (MHTML) forrásfájl feltöltése tananyagkészítéshez

- **Azonosító** — R-TERV-052
- **Cím** — MHT (MHTML) forrásfájl feltöltése tananyagkészítéshez
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A mentett webarchívumból az ékezethelyes tananyagszöveg kerüljön a forrásfeldolgozásba.
- **Forrás** — `docs/specs/2026-11-02-mht-forras.md:45`, `docs/specs/2026-11-02-mht-forras-vegrehajtas.md:5`
- **Mi van kész** — A #374 valódi ISO-8859-2 MHT-ból 53 984 karaktert nyert ki, helyes ékezetekkel, helyettesítő karakter és követőkód nélkül. source/server/studio/document-source.ts:49 és source/tests/studio-mht-upload.spec.ts:16.
- **Mi hiányzik** — A terv 48–49. sorában nevesített fordítói szöveg pontos találatát a PR nem közli.
- **Folytatás helye** — `docs/specs/2026-11-02-mht-forras.md:1` · #374
- **Következő lépés** — A megőrzött eredeti fájlon hasonlítsd össze a feladatban megadott három tartalmi jelet. A feldolgozott anyag közzététele és fizetős gyártása ehhez nem szükséges.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-055 · A tananyagkészítés didaktikai íve — mérés és terv (M-1…M-4)

- **Azonosító** — R-TERV-055
- **Cím** — A tananyagkészítés didaktikai íve — mérés és terv (M-1…M-4)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke egymásra épülő lépésekben készítse fel a gyereket az önálló feladatra.
- **Forrás** — `docs/specs/2026-09-07-tananyag-didaktikai-iv.md:67`
- **Mi van kész** — A didaktikai ív és a jutalmazás szabályait a c66342ae commit vezette be. A főágon source/shared/lesson-arc.ts:89, :174, :230 és source/shared/reward-policy.ts:52, :120, :166 tartalmazza a szabályokat. A didaktikai próba helye source/tests/lesson-arc.test.ts:104, :124.
- **Mi hiányzik** — A régi terv egy kör után hibával is publikálna. A jelenlegi motor elfogadási és publikálási döntésében a teljes ív teljesülése külön ellenőrzendő.
- **Folytatás helye** — `docs/specs/2026-09-07-tananyag-didaktikai-iv.md:1`
- **Következő lépés** — A source/server/studio/single-run/engine.ts:761 és :1018 döntéseit vesd össze a terv 103. sorával. A célzott próbába kerüljön egy hiányos és egy teljes didaktikai ív. A mostani publikálási kaput őrizd meg.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-056 · Spec: Tananyag Készítő v7.4 skill beépítése a HTML-tananyagkészítésbe

- **Azonosító** — R-TERV-056
- **Cím** — Spec: Tananyag Készítő v7.4 skill beépítése a HTML-tananyagkészítésbe
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A 7.4-es készítési szabályok a valódi gyártási bemeneten és a létrejött leckén is érvényesüljenek.
- **Forrás** — `docs/specs/2026-09-09-tananyag-keszito-v74-integracio.md:42`, `docs/specs/2026-09-09-tananyag-keszito-v74-integracio-vegrehajtas.md:1`
- **Mi van kész** — 1039/1039, 382 s-os teljes mintagenerálás, 15/15 pont, nulla JS-hiba és túlcsordulás (terv 61–69).
- **Mi hiányzik** — A konkrét minta 74 kvízelemet számolt, a kívánt 75 egyedi tételhez a feljegyzett formázási eltérés nem elegendő.
- **Folytatás helye** — `docs/specs/2026-09-09-tananyag-keszito-v74-integracio.md:1`
- **Következő lépés** — A megőrzött minta strukturált bankját és a megjelenített elemeket számold újra, duplikátumokra is ellenőrizve.
- **Függőség / ütközés** — A bankminimum és a régi webes megjelenítő technológiája külön követelmény.
- **Kapcsolódó P-tétel** — —

### R-TERV-062 · Pipeline lezárás: megőrzött HTML-kvíz és éles átvétel

- **Azonosító** — R-TERV-062
- **Cím** — Pipeline lezárás: megőrzött HTML-kvíz és éles átvétel
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A beküldés, az állapotmegőrzés és a kiadott lecke visszaolvasása együtt legyen igazolható.
- **Forrás** — `docs/specs/2026-09-12-pipeline-closure.md:6`, `docs/specs/2026-09-12-pipeline-closure-vegrehajtas.md:1`
- **Mi van kész** — A HTML tárolása, a hibás első válasz, sérült tár, bankváltozás és újratöltés #59-ben három Chrome-próbán és 1163/1163 teszten igazolt (docs/handoffs/2026-09-12-scored-banks.md:10–12). A webes anyagnál az API és a DB egyezett.
- **Mi hiányzik** — A teljes új feltöltés és az abból készült jelölt alkalmazása a külön átvételi napló 20–22. sorában nyitott.
- **Folytatás helye** — `docs/specs/2026-09-12-pipeline-closure.md:1` · #59
- **Következő lépés** — A kapcsolódó feltöltési család pontos mintáján kövesd a kapu utáni publikációt és a jelölt alkalmazását. A HTML ági próbát nem szükséges újraimplementálni.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-071 · Lektor: kimeneti tokenkeret 12 000 → 32 000 (2026-09-29)

- **Azonosító** — R-TERV-071
- **Cím** — Lektor: kimeneti tokenkeret 12 000 → 32 000 (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A lektor elég kimeneti keretet kapjon ahhoz, hogy a jelentése ne szakadjon félbe.
- **Forrás** — `docs/specs/2026-09-29-lektor-tokenkeret.md:21`, `docs/specs/2026-09-29-lektor-tokenkeret-vegrehajtas.md:1`
- **Mi van kész** — #144, a 32 000-es beállítás a source/server/ai/studio-provider.ts:115 helyen szerepel. 1657/1657 korabeli teszt.
- **Mi hiányzik** — A kijelölt kombinált forrás új, csonkulásmentes lektorálását a PR későbbre hagyta. Az új egyfutásos út ténylegesen átadott keretét külön kell igazolni.
- **Folytatás helye** — `docs/specs/2026-09-29-lektor-tokenkeret.md:1` · #144
- **Következő lépés** — A kijelölt forráshoz tartozó későbbi futás nyugtáján a teljes jelentést és a befejezési okot keresd meg, majd ellenőrizd a mai hívási út keretét.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-072 · Spec: Dinamikus javítási keret (nem elakadó közzététel, 5. szelet)

- **Azonosító** — R-TERV-072
- **Cím** — Spec: Dinamikus javítási keret (nem elakadó közzététel, 5. szelet)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártási keret a ténylegesen elvégzett és hátralevő munkához alkalmazkodjon.
- **Forrás** — `docs/specs/2026-09-30-dinamikus-keret.md:22`, `docs/specs/2026-09-30-dinamikus-keret-vegrehajtas.md:1`
- **Mi van kész** — A korábbi pontos modellsorrend vagy lépésenkénti bővítés története: #154. A 2026-10-16-i tulajdonosi döntést a #262, d9e9c8e9 valósította meg (docs/specs/2026-10-16-egy-futas.md:3, :138, :147). A főági beszélgetés beállításai: source/server/studio/single-run/conversation.ts:22, :83, :118.
- **Mi hiányzik** — Az előző gyártási gép modell- vagy keretszerződése nem hatályos. A korabeli mérés és az új út teljesítménye külön kérdés.
- **Folytatás helye** — `docs/specs/2026-09-30-dinamikus-keret.md:1` · #154
- **Következő lépés** — Az új egyfutásos úton, a mai beállítással vesd össze az eredmény minőségét. A régi sorrend vagy külön alügynök visszaépítése nem következik a régi tervből.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-073 · Spec: Nem elakadó közzététel („95%-os” szabály) — 1. szelet

- **Azonosító** — R-TERV-073
- **Cím** — Spec: Nem elakadó közzététel („95%-os” szabály) — 1. szelet
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A még menthető lecke jusson el közzétételig a minőségi minimum megtartásával.
- **Forrás** — `docs/specs/2026-09-30-nem-elakado-kozzetetel.md:74`, `docs/specs/2026-09-30-nem-elakado-kozzetetel-vegrehajtas.md:1`
- **Mi van kész** — #151 az ismert hibák 11/11 visszajátszását, 55 ismert hivatkozást és 1769/1769 tesztet rögzít. A limitpolitika ma is elérhető (source/server/studio/limit-policy.ts:19, :123).
- **Mi hiányzik** — A korabeli 7.4-es eset egy része ismeretlen maradt. A régi hivatkozásdetektor és lépésgép #262 után nincs a régi futási úton.
- **Folytatás helye** — `docs/specs/2026-09-30-nem-elakado-kozzetetel.md:1` · #151
- **Következő lépés** — Az utód gyártási belépőjén ugyanazt a korábban hibás lecke- és bankállapotot játsszák vissza. Jelöld külön az elvárt sikeres és a szándékosan blokkolt esetet.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-074 · Utasításrendszer rendbetétele — skillek, lélek, runbook, promptok, pontozó, dokumentáció, memória (2026-09-30, v6)

- **Azonosító** — R-TERV-074
- **Cím** — Utasításrendszer rendbetétele — skillek, lélek, runbook, promptok, pontozó, dokumentáció, memória (2026-09-30, v6)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártási utasítások ellentmondásai és mérhető hibái legyenek feloldva a tényleges futási úton.
- **Forrás** — `docs/specs/2026-09-30-utasitasrendszer-rendbetetel.md:236`, `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-vegrehajtas.md:46`, `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/evidence-models-raw.json:1` és 11 további forrás a sormutatóban
- **Mi van kész** — Az ábra forráskötését ellenőrzi a source/server/studio/single-run/engine.ts:1047 és a source/tests/source-visual-coverage.test.ts:25, :102. A tört sorrendjét az új pontozó megkülönbözteti, a régi visszajátszás külön út (source/tests/scoring-v2.test.ts:18–23).
- **Mi hiányzik** — Az U5 a készre rajzolt ábra jelentésének visszaolvasását is kérte. Az azonosító-egyezés ezt nem bizonyítja (2026-09-30-utasitasrendszer-rendbetetel-status.md:58–60).
- **Folytatás helye** — `docs/specs/2026-09-30-utasitasrendszer-rendbetetel.md:1` · #167
- **Következő lépés** — Készíts két azonos forrásazonosítójú próbaábrát, amelyek közül az egyik tartalmilag hibás. Ellenőrizd a ténylegesen renderelt tartalom értékelését.
- **Függőség / ütközés** — A későbbi vizuális kapuk P-028 és P-033 alatt folytatódnak.
- **Kapcsolódó P-tétel** — —

### R-TERV-083 · Elakadás-vezérlő — szerverbe épített, haladás-alapú automatikus folytatás (2026-10-15)

- **Azonosító** — R-TERV-083
- **Cím** — Elakadás-vezérlő — szerverbe épített, haladás-alapú automatikus folytatás (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás állapotából derüljön ki, miért állt meg és melyik meglévő művelettel folytatható.
- **Forrás** — `docs/specs/2026-10-15-elakadas-vezerlo.md:46`
- **Mi van kész** — V1 #233, 2338/2338 és 6/6 böngésző; V4 #237, 2351/2351; #238 egy szélső esetet javított. A 2026-10-16-i váltás eredménye a source/server/studio/lesson-pipeline-routes.ts:178 és source/server/studio/single-run/engine.ts:926, :982.
- **Mi hiányzik** — E5 nehéz forráson az automatikus befejezést vagy indokolt tulajdonosi döntéskérést ír elő. A régi vezérlő saját regisztere nincs a mai útban.
- **Folytatás helye** — `docs/specs/2026-10-15-elakadas-vezerlo.md:1` · #236
- **Következő lépés** — A régi elakadt állapotot a mai motorban reprodukáld. A befejezett lecke vagy az indokolt megállás legyen a megfigyelt végállapot.
- **Függőség / ütközés** — A régi recovery-függvények visszahozása nem önálló követelmény.
- **Kapcsolódó P-tétel** — —

### R-TERV-084 · Végrehajtási utasítás — Elakadás-vezérlő V1: hiba-ujjlenyomat és döntési lépcső (tiszta, tesztelt)

- **Azonosító** — R-TERV-084
- **Cím** — Végrehajtási utasítás — Elakadás-vezérlő V1: hiba-ujjlenyomat és döntési lépcső (tiszta, tesztelt)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás állapotából derüljön ki, miért állt meg és melyik meglévő művelettel folytatható.
- **Forrás** — `docs/specs/2026-10-15-elakadas-vezerlo-v1-vegrehajtas.md:1`
- **Mi van kész** — A korábbi vezérlő #233-ben megvalósult. A 2026-10-16-i S4b döntés (#262) a régi lépésgépet kiváltotta; a mai bankjavítás source/server/studio/single-run/engine.ts:926, :982.
- **Mi hiányzik** — A régi regiszter és az ahhoz kötött döntés ma nem követelmény. A nehéz forráson bizonyítandó eredmény a vezérlő ernyőtervéhez tartozik.
- **Folytatás helye** — `docs/specs/2026-10-15-elakadas-vezerlo-v1-vegrehajtas.md:1` · #233
- **Következő lépés** — A fennmaradó üzemi esetet az utódút tényleges bemenetével és végállapotával ellenőrizd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-086 · Végrehajtási utasítás — Elakadás-vezérlő V4: szerzői javítás és teljes újragyártás, automatikusan

- **Azonosító** — R-TERV-086
- **Cím** — Végrehajtási utasítás — Elakadás-vezérlő V4: szerzői javítás és teljes újragyártás, automatikusan
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás állapotából derüljön ki, miért állt meg és melyik meglévő művelettel folytatható.
- **Forrás** — `docs/specs/2026-10-15-elakadas-vezerlo-v4-vegrehajtas.md:1`
- **Mi van kész** — A korábbi vezérlő #237-ben megvalósult. A 2026-10-16-i S4b döntés (#262) a régi lépésgépet kiváltotta; a mai bankjavítás source/server/studio/single-run/engine.ts:926, :982.
- **Mi hiányzik** — A régi regiszter és az ahhoz kötött döntés ma nem követelmény. A nehéz forráson bizonyítandó eredmény a vezérlő ernyőtervéhez tartozik.
- **Folytatás helye** — `docs/specs/2026-10-15-elakadas-vezerlo-v4-vegrehajtas.md:1` · #237
- **Következő lépés** — A fennmaradó üzemi esetet az utódút tényleges bemenetével és végállapotával ellenőrizd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-089 · Egyfutásos tananyaggyártás — terv (2026-10-16)

- **Azonosító** — R-TERV-089
- **Cím** — Egyfutásos tananyaggyártás — terv (2026-10-16)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke előállításáért egy követhető gyártási folyamat feleljen.
- **Forrás** — `docs/specs/2026-10-16-egy-futas.md:95`, `docs/specs/2026-10-16-egy-futas-vegrehajtas.md:46`
- **Mi van kész** — A közös gyártási állapot megmaradt. A bank és a lektor friss kontextust kap. source/server/studio/single-run/engine.ts:275, :882 és source/tests/single-run-engine.test.ts:331, :344.
- **Mi hiányzik** — A minden állomásra azonos beszélgetést előíró eredeti feltételt a 2026-10-16-i mért J2 döntés meghaladta. Az egyéb munkafolyamat-pontokat a sormutató tartalmazza.
- **Folytatás helye** — `docs/specs/2026-10-16-egy-futas.md:1` · #261
- **Következő lépés** — Az új bank és lektor megvalósítását a 2026-10-16-egyfutas-atvilagitas.md 76., 98–99. és 108. sorához mérd.
- **Függőség / ütközés** — A bank bemenete 3,41 millióról 0,22 millió tokenre csökkent az utódterv mérésében.
- **Kapcsolódó P-tétel** — —

### R-TERV-090 · Az együgynökös (egyfutásos) tananyagkészítés teljes átvilágítása — terv

- **Azonosító** — R-TERV-090
- **Cím** — Az együgynökös (egyfutásos) tananyagkészítés teljes átvilágítása — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az egyfutásos rendszer teljes adatútján igazolható legyen az eredmény és a felhasznált keret.
- **Forrás** — `docs/specs/2026-10-16-egyfutas-atvilagitas.md:11`
- **Mi van kész** — #263 három valódi forrás után a korábban elakadt lecke is publikált, 7 fejezettel, 55 feladattal és 98 kvízzel. 2006/2006, 31/31 DB, 18/18 böngésző. source/server/studio/single-run/engine.ts:482, :563.
- **Mi hiányzik** — A 25–38. sor számszerű prompt- és skillméretet, importgráfot, illetve pénzben kifejezett futásköltséget kér. A zárótáblák tokenszámai ezeket nem mind igazolják.
- **Folytatás helye** — `docs/specs/2026-10-16-egyfutas-atvilagitas.md:1` · #263
- **Következő lépés** — A mért három futáshoz egyeztesd az akkori díjat és a tényleges bemenet méretét. Az új út függőségi gráfját a vizsgált revízión rögzítsd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-092 · Újragyártás: a tanulási terv automatikus jóváhagyása + elakadt jobok folytatása (terv, 2026-10-16)

- **Azonosító** — R-TERV-092
- **Cím** — Újragyártás: a tanulási terv automatikus jóváhagyása + elakadt jobok folytatása (terv, 2026-10-16)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Újragyártás előtt a felhasználó lássa, mit fog a rendszer ismét elvégezni.
- **Forrás** — `docs/specs/2026-10-16-ujragyartas-jovahagyas.md:23`, `docs/specs/2026-10-16-ujragyartas-jovahagyas-vegrehajtas.md:1`
- **Mi van kész** — #256 történeti jóváhagyás: 33/33 DB és 23/23 E2E. #262 után a korábban tervre váró feladat a mentett forrásból új egyfutásos leckét készít (source/server/studio/lesson-pipeline-routes.ts:556). Az egykéréses felületet a source/tests/admin-draft-lessons.spec.ts:176, :204 őrzi.
- **Mi hiányzik** — A korábbi lépésgép tervjóváhagyása önálló régi kódként már nem hatályos; az újragyártás felületi visszaigazolása továbbra is elvárt.
- **Folytatás helye** — `docs/specs/2026-10-16-ujragyartas-jovahagyas.md:1` · #256
- **Következő lépés** — A mai egyetlen újragyártási kérés és a jogosultság a jelenlegi főági belépőn legyen ellenőrizve.
- **Függőség / ütközés** — Tulajdonosi irányváltás 2026-10-16, docs/specs/2026-10-16-egy-futas.md:3.
- **Kapcsolódó P-tétel** — —

### R-TERV-095 · Mély elemzés: miért akad el a tananyaggyártás és -javítás — és a javítás terve

- **Azonosító** — R-TERV-095
- **Cím** — Mély elemzés: miért akad el a tananyaggyártás és -javítás — és a javítás terve
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A ténylegesen ismétlődő gyártási hibát ismerje fel a rendszer, és menthető állapotban folytasson.
- **Forrás** — `docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md:45`
- **Mi van kész** — Az R1/R2 javításokra a #331 és #332, source/tests/elakadas-r1.test.ts:17 és source/tests/okositas-r2-bankjavitas.test.ts:22 ad bizonyítékot.
- **Mi hiányzik** — A terv 93–95. sorában kért kapus megállások feleződéséhez a teljes futásszámra normalizált összevetés hiányzik.
- **Folytatás helye** — `docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md:1` · #331
- **Következő lépés** — Azonos időszakok sikeres és megállt futásaiból mérj arányt az eltérő forrástípusok szerint.
- **Függőség / ütközés** — A lektori kivételek 2,17 → 0,42 darab/anyag csökkenése másik mérőszám.
- **Kapcsolódó P-tétel** — —

### R-TERV-102 · Gyártás-mérés 2026-11-10 — két élő futás mérése és a mért hibák javítása

- **Azonosító** — R-TERV-102
- **Cím** — Gyártás-mérés 2026-11-10 — két élő futás mérése és a mért hibák javítása
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Az eredeti bankhibát és a javított gyártási időt összehasonlítható futásban kell megmérni.
- **Forrás** — `docs/specs/2026-11-10-gyartas-meres.md:153`, `docs/specs/2026-11-10-gyartas-meres-vegrehajtas.md:27`
- **Mi van kész** — A célzott bankjavító út a source/server/studio/experience-builder.ts:913, :917 alatt megvan. A terv 161., 172. és 176–178. sorában szereplő futás bankideje 1059 mp, és a keresztütközés nem jelentkezett.
- **Mi hiányzik** — Az eredeti futás nem mérte meg, hogy a célzott út mennyivel csökkenti a bankidőt. A 110–113. sor külön admin- és tartalmi követőpontokat sorol.
- **Folytatás helye** — `docs/specs/2026-11-10-gyartas-meres.md:1` · #415
- **Következő lépés** — Azonos forrást és bankméretet használó, a célágat ténylegesen elérő két futást hasonlíts össze. Rögzítsd a bankidőt, körszámot és költséget. A katalóguseredmények kliensnézetét a source/server/catalog/admin-routes.ts:55 mögötti adatúthoz illeszd.
- **Függőség / ütközés** — A korabeli függő fogalmak darabszámát friss olvasással kell megállapítani.
- **Kapcsolódó P-tétel** — —

### R-TERV-106 · Osztály a tananyag címénél és a keresőben (FIX, kanban 116)

- **Azonosító** — R-TERV-106
- **Cím** — Osztály a tananyag címénél és a keresőben (FIX, kanban 116)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tananyag címében az évfolyam ott és pontosan egyszer jelenjen meg, ahol az azonosítást segíti.
- **Forrás** — `docs/specs/2026-11-17-tananyag-cim-osztaly.md:141`, `docs/specs/2026-11-17-tananyag-cim-osztaly-vegrehajtas.md:126`
- **Mi van kész** — Az első szelet közös címfüggvénye a source/shared/material-title.ts fájlban van, a FileCard közvetlenül használja (source/client/src/components/FileCard.tsx:11). #494.
- **Mi hiányzik** — A 159–162. sor szerinti további szülői és tanulói listák, levéltárgy, PDF-cím és böngészőfül eltérő felületek. A keresési szélek a 143–155. sorban külön állnak.
- **Folytatás helye** — `docs/specs/2026-11-17-tananyag-cim-osztaly.md:1` · #116
- **Következő lépés** — Kövesd végig a cím útját a következő listától a közös függvényig. Ugyanazt a régi és már évfolyammal ellátott címet ellenőrizd a listán, majd külön szeletben levélben, PDF-ben és a fülön.
- **Függőség / ütközés** — A keresési utómunkát a P-026 fogja össze.
- **Kapcsolódó P-tétel** — P-026

### R-TERV-108 · Lesson Studio — Master Plan (C-variant)

- **Azonosító** — R-TERV-108
- **Cím** — Lesson Studio — Master Plan (C-variant)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Lesson Studio — Master Plan (C-variant).
- **Forrás** — `docs/specs/lesson-studio-master-plan-2026-09-04.md:158`, `docs/specs/lesson-studio-execution-runbook-2026-09-04.md:165`
- **Mi van kész** — Az LS-0–LS-5 szeletekhez későbbi főági PR-ok tartoznak; #10 adatforrást, #12 tanári felületet, #15 szülői leckeszintű eredményt hozott. A kupon lejárati felülete source/client/src/game-engine/CouponHud.tsx:129, :149.
- **Mi hiányzik** — Az eredeti fogalomszintű szülői összesítő és heti levél nincs teljesen bekötve, az animációs szelethez a 90-es akadálymentességi küszöb mért nyugtája hiányzik.
- **Folytatás helye** — `docs/specs/lesson-studio-master-plan-2026-09-04.md:1`
- **Következő lépés** — A futtatókönyv 137. és 143–148. sorát az LS-4 és az LS-5 külön tételeivel együtt vedd át. A mai fókuszált visszalinket a régi automatikus átirányítás miatt ne cseréld vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-109 · LS-2c — Pipeline modellhívások bekötése (pedagogue / author / lektor)

- **Azonosító** — R-TERV-109
- **Cím** — LS-2c — Pipeline modellhívások bekötése (pedagogue / author / lektor)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — LS-2c — Pipeline modellhívások bekötése (pedagogue / author / lektor).
- **Forrás** — `docs/specs/ls-2c-pipeline-calls-2026-09-04.md:53`, `docs/ls-2c-pipeline-hasznalat.md:50`
- **Mi van kész** — #8 416/416 és 20/20 UI/E2E. #41 már a tényleges bemenetet is ellenőrzi. Az egyfutásos út a source/server/studio/lesson-pipeline-routes.ts:573 és :877 alatt kezeli a régi feladatot.
- **Mi hiányzik** — A régi szerepenkénti hívássor ma megszűnt (#262). Az útmutatóban nyitva hagyott visszajelzés, animáció és közzététel részben későbbi szeletekhez tartozik.
- **Folytatás helye** — `docs/specs/ls-2c-pipeline-calls-2026-09-04.md:1`
- **Következő lépés** — Az engedélyezett tudástérképtől indulva a mai gyártóban, a végkapun és a publikált eredményben is kövesd az eredeti tanulói feltételeket. A régi szereplánc másolása elavult teendő.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-112 · Kiadás: közvetlen API és fogalomazonosító-javítás

- **Azonosító** — R-TERV-112
- **Cím** — Kiadás: közvetlen API és fogalomazonosító-javítás
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A közvetlen gyártási API kiadását a ténylegesen telepített változaton lehessen azonosítani.
- **Forrás** — `docs/specs/2026-09-11-direct-api-release.md:3`, `docs/specs/2026-09-11-direct-api-release-vegrehajtas.md:1`
- **Mi van kész** — A #58 igazolja a szerveroldali beállítást és a biztonságos visszaolvasást. A merge 50c886d0, a közvetlen API próbája source/tests/direct-studio-api.test.ts.
- **Mi hiányzik** — A terv 11. sora pontosan erre a SHA-ra kér sikeres frontend Production, backend health és PR CI nyugtát. A későbbi kiadás visszaállási bázisa nem mindhárom nyugta.
- **Folytatás helye** — `docs/specs/2026-09-11-direct-api-release.md:1` · #58
- **Következő lépés** — A három eredményt külön keresd vissza a 50c886d0-t telepítő kiadáshoz; eltérő fej esetén a kiadási pont maradjon ellenőrizetlen.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-116 · Átadás gépleállítás előtt — tananyagkészítés és előnézet

- **Azonosító** — R-TERV-116
- **Cím** — Átadás gépleállítás előtt — tananyagkészítés és előnézet
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A webes kutatás megszakítás után is követhető módon jusson el egy elmentett tananyagig.
- **Forrás** — `docs/handoffs/2026-09-11-web-research-javitas.md:87`
- **Mi van kész** — Az átadóban még nyitott #56 később beolvadt. A #54, #55 és #57 a forráspublikálás és az élesítési út korabeli mérését rögzíti. docs/handoffs/2026-09-11-web-research-javitas.md:49 és docs/handoffs/2026-09-11-workflow-elesites.md:37.
- **Mi hiányzik** — A fizikai Safari-próbához nincs azonosított eredmény.
- **Folytatás helye** — `docs/handoffs/2026-09-11-web-research-javitas.md:1` · #65
- **Következő lépés** — Az átadó 82. sorának készülékes Safari-esetét ismételd meg. Rögzítsd az eszközt, a felhasználói lépést és az eredményt.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-121 · A Node-verzió rögzítése: 24.x mindenhol — terv (2026-10-15)

- **Azonosító** — R-TERV-121
- **Cím** — A Node-verzió rögzítése: 24.x mindenhol — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A fejlesztői, CI- és éles futtató ugyanazt az előírt Node-verziót használja.
- **Forrás** — `docs/specs/2026-10-15-node-24-rogzites.md:20`, `docs/specs/2026-10-15-node-24-rogzites-vegrehajtas.md:1`
- **Mi van kész** — #246 3163ea00, source/package.json:7, .github/workflows/ci.yml:27, :52 és render.yaml:14 rögzíti a futtatót.
- **Mi hiányzik** — E2 külön kéri a tényleges Render-verziót, a sikeres egészségi választ és a PDF-útvonal figyelmeztetés nélküli működését.
- **Folytatás helye** — `docs/specs/2026-10-15-node-24-rogzites.md:1` · #246
- **Következő lépés** — Az érintett telepítés naplóját párosítsd a commitra, majd a PDF-ellenőrzés eredményére. A manifestben szereplő verzió önmagában nem igazolja a futtatót.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-123 · Újraindulás utáni folytatás a mentett részekből — terv (2026-10-15)

- **Azonosító** — R-TERV-123
- **Cím** — Újraindulás utáni folytatás a mentett részekből — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Újraindulás után a ténylegesen elmentett részekből lehessen helyreállítani a munkát.
- **Forrás** — `docs/specs/2026-10-15-ujraindulas-utani-folytatas.md:36`, `docs/specs/2026-10-15-ujraindulas-utani-folytatas-vegrehajtas.md:1`
- **Mi van kész** — A mentett részekből történő helyreállítás #247-ben elkészült. A #262 új egyfutásos gyártásra váltott, a mai út source/server/studio/lesson-pipeline-routes.ts:573, :877.
- **Mi hiányzik** — A korábbi lépésgép visszaállítása és a mai, mentett forrásból induló új futás eltér. Az eredeti dupla futás elleni feltételt a mai úton külön kell igazolni.
- **Folytatás helye** — `docs/specs/2026-10-15-ujraindulas-utani-folytatas.md:1` · #247
- **Következő lépés** — Megszakított régi és megszakított egyfutásos feladatra is ellenőrizd, hogy a jóváhagyott folytatás egyszer indul, és a használható mentés megmarad.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-126 · Nyilvános oldal: betöltési idő és felesleges háttérmunka — terv

- **Azonosító** — R-TERV-126
- **Cím** — Nyilvános oldal: betöltési idő és felesleges háttérmunka — terv
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A kezdőoldal kevesebb blokkoló munkát és tétlen rajzolást végezzen.
- **Forrás** — `docs/specs/2026-10-18-nyilvanos-oldal-sebesseg.md:47`, `docs/specs/2026-10-18-nyilvanos-oldal-sebesseg-vegrehajtas.md:15`
- **Mi van kész** — #297 és 51dc45dd három mobilmérés mediánja: TBT 2,62 → 0,87 s, a végtelen animációk száma 220 → 0, LCP 2,63 → 1,95 s. source/client/src/index.css:1231 és source/tests/public-perf.spec.ts:19, :22.
- **Mi hiányzik** — A kért 30 mp helyett 10 mp tétlen rajzolás szerepel a régi A/B-ben. A telepítés utáni mérés a #297-ben jövő idejű.
- **Folytatás helye** — `docs/specs/2026-10-18-nyilvanos-oldal-sebesseg.md:1` · #297
- **Következő lépés** — A terv 46–50. sora szerinti, azonos adatos 30 mp-es mérés nyers eredményét keresd meg. Csak ennek hiányában tervezz új, azonos terhelésű mérést.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-130 · Erőforrás-optimalizálás S3a — gyorsítótár-barát kérésszerkezet (bank, lektor)

- **Azonosító** — R-TERV-130
- **Cím** — Erőforrás-optimalizálás S3a — gyorsítótár-barát kérésszerkezet (bank, lektor)
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szolgáltatás költségét és erőforrásigényét mérhetően csökkentse a kijelölt szelet.
- **Forrás** — `docs/specs/2026-10-19-eroforras-s3a.md:55`, `docs/specs/2026-10-19-eroforras-s3a-vegrehajtas.md:1`
- **Mi van kész** — Az egyórás szerződés és a legfeljebb két jelölő #329-ben megvan (source/tests/resource-s3a.test.ts:18, :26).
- **Mi hiányzik** — A bank és lektor gyorsítótár-találati arányának éles javulása #329 szerint NOT RUN.
- **Folytatás helye** — `docs/specs/2026-10-19-eroforras-s3a.md:1` · #329
- **Következő lépés** — A következő normál gyártás bank- és lektorhívásainál számítsd ki az arányt a módosítás előtti azonos szerepű hívásokhoz képest. Terv 59–60.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-133 · Befejezési mandátum, önfejlesztési hurok és ARM64 + x64 futás

- **Azonosító** — R-TERV-133
- **Cím** — Befejezési mandátum, önfejlesztési hurok és ARM64 + x64 futás
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A befejezési és ellenőrzési rend mindkét támogatott Windows-architektúrán legyen követhető.
- **Forrás** — `docs/specs/2026-11-03-befejezes-onfejlesztes-dual-arch.md:80`, `docs/specs/2026-11-03-befejezes-onfejlesztes-dual-arch-vegrehajtas.md:5`
- **Mi van kész** — A CI két Windows-architektúrát ír le (.github/workflows/ci.yml:121, :128), helyi ellenőrzője a source/tests/native-arch.test.ts:12. A 24c5308e a helyi doctor és 2577/2577 unit eredményét rögzíti.
- **Mi hiányzik** — Nincs ugyanahhoz a fejhez igazolt mindkét natív futási nyugta és a globális vezérlő telepítésének állapota.
- **Folytatás helye** — `docs/specs/2026-11-03-befejezes-onfejlesztes-dual-arch.md:1` · #391
- **Következő lépés** — A Windows x64 és az ARM64 archivált jobját párosítsd azonos commitra. A közös szabályok jelenlétét az érintett ügynökkörnyezetben külön ellenőrizd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-134 · Spec: a főoldal gyorsítása — build-időben készülő bélyegképek, gyorsítótár-ostrom megszüntetése

- **Azonosító** — R-TERV-134
- **Cím** — Spec: a főoldal gyorsítása — build-időben készülő bélyegképek, gyorsítótár-ostrom megszüntetése
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A kezdőoldal a tervben megjelölt nézetben gyorsan és használható állapotban jelenjen meg.
- **Forrás** — `docs/specs/2026-11-03-fooldal-sebesseg.md:79`, `docs/specs/2026-11-03-fooldal-sebesseg-vegrehajtas.md:5`
- **Mi van kész** — A lista gyorsítótára a source/server/cache/HtmlFilesCache.ts:61 alatt van. A 4acc2548 commit 3,8 s-os kiinduló értéket közöl.
- **Mi hiányzik** — A javítás utáni húsz hideg képbetöltés, a szerver első válaszáig és a fő elem megjelenéséig eltelt idő együtt nem igazolt.
- **Folytatás helye** — `docs/specs/2026-11-03-fooldal-sebesseg.md:1` · #385
- **Következő lépés** — Azonos klienssel, gyorsítótár-állapottal és hálózati feltételekkel mérd újra a terv húsz esetét. A kezdeti és ismételt kérés idejét külön rögzítsd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-136 · A Render-beállítás összevetése a repóval, CI-ben (2026-11-05)

- **Azonosító** — R-TERV-136
- **Cím** — A Render-beállítás összevetése a repóval, CI-ben (2026-11-05)
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A telepített szolgáltatás tényleges konfigurációja és revíziója ellenőrizhető legyen.
- **Forrás** — `docs/specs/2026-11-05-render-beallitas-ellenorzes.md:34`, `docs/specs/2026-11-05-render-beallitas-ellenorzes-vegrehajtas.md:1`
- **Mi van kész** — A szkript A1–A4 pontjai dokumentáltan teljesültek (terv 34–44, #402 és .github/workflows/render-settings.yml:35).
- **Mi hiányzik** — A szolgáltatói építési parancs és a CI-ben használt hiteles hozzáférés éles mérése külön maradt (terv 13–14, 26, 31).
- **Folytatás helye** — `docs/specs/2026-11-05-render-beallitas-ellenorzes.md:1` · #402
- **Következő lépés** — A beállítási ellenőrző legutóbbi engedélyezett futásából a szolgáltatás revízióját és az összevetés kimenetét olvasd vissza. Az értékeket és a hozzáférési adatokat ne másold a jegybe.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-052

### R-TERV-140 · Egyképernyős játékélmény

- **Azonosító** — R-TERV-140
- **Cím** — Egyképernyős játékélmény
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A kérdés, a pálya és az irányítás játék közben egy képernyőn legyen elérhető.
- **Forrás** — `docs/specs/2026-09-07-game-viewport-experience.md:22`
- **Mi van kész** — A terv 54–59. sora 63/63 eredményt, hét menüt és a Szólétra két méreten elért győzelmét igazolja. A főági menüteszt négy képernyőméretet használ (source/tests/game-viewport-experience.spec.ts:95–97).
- **Mi hiányzik** — Mind a hét játék összes előírt végállapota csak 390×844-es nézeten szerepel (source/tests/game-win-paths.spec.ts:77–79). A hét játék × négy méret mátrixból három méret végállapotai hiányoznak.
- **Folytatás helye** — `docs/specs/2026-09-07-game-viewport-experience.md:1` · #43
- **Következő lépés** — A létező végállapottesztet terjeszd ki a további három előírt méretre. A ráfedést, a vezérlő és a válasz elérhetőségét is ellenőrizd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-142 · Játékélmény + tananyaglogika — javítási terv (2026-09-08)

- **Azonosító** — R-TERV-142
- **Cím** — Játékélmény + tananyaglogika — javítási terv (2026-09-08)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A tananyag és a játék együtt legyen végigjátszható, olvasható és tanulható.
- **Forrás** — `docs/specs/2026-09-08-jatek-tananyag-javitasi-terv.md:45`
- **Mi van kész** — #43 és #44 a célzott javításokat és 48 Playwright-próbát rögzítik. source/tests/game-viewport-experience.spec.ts:95–97.
- **Mi hiányzik** — D2 a menü, játék és végállapot mindhárom részét hét játék × négy nézetben kéri. A mai végállapot-próba egyetlen méretet állít be (source/tests/game-win-paths.spec.ts:77–79).
- **Folytatás helye** — `docs/specs/2026-09-08-jatek-tananyag-javitasi-terv.md:1` · #44
- **Következő lépés** — A közös végállapotmátrixot a szeptember 7-i viewport-családdal együtt zárd. A két dokumentált ismétlési kivételt a #44 feltétele szerint ellenőrizd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-148 · Végrehajtási utasítás — évfolyam-bank TARTALOM (3–12.), 2026-09-29

- **Azonosító** — R-TERV-148
- **Cím** — Végrehajtási utasítás — évfolyam-bank TARTALOM (3–12.), 2026-09-29
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A 3–12. évfolyam kérdései a helyes játékhoz és nehézséghez legyenek bekötve.
- **Forrás** — `docs/specs/2026-09-29-jatekok-3-12-evfolyam-tartalom-vegrehajtas.md:1`
- **Mi van kész** — A #136 öt játék tartalmi készletét vizsgálta. A korabeli eredmények 900/900 banktétel és 1513/1513 teszt. A főági őr helye source/tests/grade-quiz-bank-coverage.test.ts:40.
- **Mi hiányzik** — A későbbi tartalombővítéshez új vakmegoldói mérés tartozik. A 3–6. évfolyam jegyzőkönyve önmagában nem fedi le az összes játék és évfolyam párosát.
- **Folytatás helye** — `docs/specs/2026-09-29-jatekok-3-12-evfolyam-tartalom-vegrehajtas.md:1` · #136
- **Következő lépés** — A docs/measurements/2026-11-16-evfolyam-bank-3-6-vakmegoldo.md:5 alapján párosíts minden kért évfolyamot és játékot a megfelelő vizsgálattal. Csak a fedetlen pároknál készíts új mintát.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-151 · Szólétra — 3D kérdések, nyelvválasztó, pályák, angol bank (B szelet) — végrehajtási utasítás

- **Azonosító** — R-TERV-151
- **Cím** — Szólétra — 3D kérdések, nyelvválasztó, pályák, angol bank (B szelet) — végrehajtási utasítás
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A Szólétra kérdései, feliratai és tempója a célzott nyelvhez és a képernyőhöz igazodjanak.
- **Forrás** — `docs/specs/2026-09-29-szoletra-3d-nyelvek-vegrehajtas.md:12`
- **Mi van kész** — A #145 korabeli eredménye 1726/1726 egységteszt és 52/52 böngészőpróba. A német készlet 478, a francia 490 elemet adott.
- **Mi hiányzik** — A főági felület 600 pixel alatt szándékosan elhagyja a 3D megjelenítést. A kis képernyős nyelvváltás és olvashatóság teljes elfogadása külön igazolandó.
- **Folytatás helye** — `docs/specs/2026-09-29-szoletra-3d-nyelvek-vegrehajtas.md:1` · #145
- **Következő lépés** — A source/client/src/pages/WordLadderHuEn.tsx:351 melletti nézetet ellenőrizd a töréspont két oldalán, német és francia nyelven. Kövesd a későbbi játékélményterv mobilos döntését.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-158 · Spec: korszerű üdvözlő kártya és játékkártyák; az admin (szülő) mindig az összes tananyagot látja

- **Azonosító** — R-TERV-158
- **Cím** — Spec: korszerű üdvözlő kártya és játékkártyák; az admin (szülő) mindig az összes tananyagot látja
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A visszatérő és az új látogató a saját állapotához illő belépési lehetőségeket lássa.
- **Forrás** — `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo.md:76`, `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo-vegrehajtas.md:5`
- **Mi van kész** — A #389 korabeli eredménye 32/32, a rögzített szélességek 320, 375 és 1280 pixel. A főági próba helye source/tests/home-cards-modern.test.ts:26.
- **Mi hiányzik** — A terv összes útvonalához nincs 1440 pixeles elfogadási bizonyíték.
- **Folytatás helye** — `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo.md:1` · #389
- **Következő lépés** — Az üdvözlő, játék- és szülői nézetet 1440 pixelen nyisd meg. Ellenőrizd a szöveg láthatóságát és a kártyák célját mindhárom útvonalon.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-159 · Spec: Célkártya, nyitómese és játékos (IQ-) kérdezés a tananyaggyártásban

- **Azonosító** — R-TERV-159
- **Cím** — Spec: Célkártya, nyitómese és játékos (IQ-) kérdezés a tananyaggyártásban
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A lecke kezdése a korosztályhoz illő célt és felütést adjon, a kérdésekhez pedig adagolható segítség tartozzon.
- **Forrás** — `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md:215`, `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes-vegrehajtas.md:8`, `docs/modszertan-nyitomese-jatekos-kerdezes.md:61`
- **Mi van kész** — A korábbi S1/S2/S2b A1–A7 mérés a terv 236–261. sorában van. A felütés meglévő blokktípust használ (source/shared/lesson-opener.ts:99).
- **Mi hiányzik** — S3 az önálló cél- és meseblokk feltételes döntése, S4 a lépcsős súgó és a kérdésmetaadat. Terv 214–216.
- **Folytatás helye** — `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md:1` · #404
- **Következő lépés** — Először a meglévő felütés használatát mérd. Az S4-et külön blokk- és renderpróbával dolgozd ki: a tanuló egyenként nyithassa a segítségeket.
- **Függőség / ütközés** — A saját blokktípust csak az S3-ban megadott igény esetén kell bevezetni.
- **Kapcsolódó P-tétel** — P-030

### R-TERV-160 · Spec: Játékok mobilos színvonalra emelése és központi nyelvi szóbank

- **Azonosító** — R-TERV-160
- **Cím** — Spec: Játékok mobilos színvonalra emelése és központi nyelvi szóbank
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A telefonos játékmenethez tartozó szavak és kezelőszervek mérhetően használhatók legyenek.
- **Forrás** — `docs/specs/2026-11-15-jatekok-mobil-szobank.md:195`, `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md:1358`, `docs/handoffs/2026-11-16-jatekok-mobil-szobank-retro.md:78`
- **Mi van kész** — A termékoldali A/M pontokhoz vannak mérések. source/tests/vocab-bank-validate.test.ts:24, :30. Az átfogó review tartalmát a 2026-11-16-i mobil-szóbank átadó 34. sora rögzíti.
- **Mi hiányzik** — A végrehajtás 1869–1872. sora P1 főági ellenőrzéshez, P3 PR-kommenthez és P4 adminisztratív befejezéshez külső bizonyítékot hagy.
- **Folytatás helye** — `docs/specs/2026-11-15-jatekok-mobil-szobank.md:1` · #419
- **Következő lépés** — Kösd az eredeti PR fejéhez a főági ellenőrzés eredményét, a teljes áttekintés kommentjét és a lezárási nyugtát. Új játékfejlesztést csak az azonosított termékhiányból indíts.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-017

### R-TERV-163 · Brain Rot — több idő a válaszadásra (terv)

- **Azonosító** — R-TERV-163
- **Cím** — Brain Rot — több idő a válaszadásra (terv)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A játékban a kérdés hosszához elég olvasási idő jusson, az előírt tempókorláttal együtt.
- **Forrás** — `docs/specs/2026-11-17-brainrot-valaszido.md:97`, `docs/specs/2026-11-17-brainrot-valaszido-vegrehajtas.md:22`
- **Mi van kész** — #497 (21c81998), source/client/src/lib/brainRot/pacing.ts:24, :61 és source/tests/brainrot-pacing.test.ts:51. A normál kérdések olvasási alsó határa és a kemény felső határ működik.
- **Mi hiányzik** — A 400 szavas tesztnél 30 s a várt maximum. A terv 97–98. sorának általános 100 szó/perc + 1,8 s alsó határa erre legalább 241,8 s lenne.
- **Folytatás helye** — `docs/specs/2026-11-17-brainrot-valaszido.md:1` · #497
- **Következő lépés** — Rögzítsd a 61. és 97–98. sor közti elsőbbséget vagy a bankban megengedett kérdéshosszt. A határ alatti és fölötti esetet külön teszteld.
- **Függőség / ütközés** — A főági teszt konkrét ellenpélda az összes bemenetre egyszerre értelmezett két követelményre.
- **Kapcsolódó P-tétel** — P-008, P-010

### R-TERV-166 · Spec: Kockavadász telefonon — eltérés-tábla, mérés, eszközön belüli diagnosztika (?perf=1)

- **Azonosító** — R-TERV-166
- **Cím** — Spec: Kockavadász telefonon — eltérés-tábla, mérés, eszközön belüli diagnosztika (?perf=1)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Spec: Kockavadász telefonon.
- **Forrás** — `8d42332dc:docs/specs/2026-11-17-kockavadasz-telefon.md:61`, `8d42332dc:docs/specs/2026-11-17-kockavadasz-telefon-vegrehajtas.md:186`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `58969f07e:source/client/src/pages/BlockCraftQuiz.tsx:1865` és `58969f07e:source/tests/blockcraft-perf-panel.spec.ts:52`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `perf/kockavadasz-telefon` (58969f07e)
- **Következő lépés** — A(z) `perf/kockavadasz-telefon` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-004 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-004

### R-TERV-167 · Spec: Kockavadász telefonon — gyors, main-alapú szelet (olcsóbb megjelenítés a telefonos szinteken + ?perf=1 panel)

- **Azonosító** — R-TERV-167
- **Cím** — Spec: Kockavadász telefonon — gyors, main-alapú szelet (olcsóbb megjelenítés a telefonos szinteken + ?perf=1 panel)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Spec: Kockavadász telefonon.
- **Forrás** — `0219e4dd2:docs/specs/2026-11-17-kockavadasz-telefon-gyors.md:55`, `023eb27f6:docs/specs/2026-11-17-kockavadasz-telefon-gyors-vegrehajtas.md:144`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `80cdfd172:source/client/src/pages/BlockCraftQuiz.tsx:619` és `80cdfd172:source/tests/perf-stats.test.ts:9`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `perf/kockavadasz-telefon-gyors` (80cdfd172) · #504 OPEN
- **Következő lépés** — A(z) `perf/kockavadasz-telefon-gyors` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-004 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-004

### R-TERV-169 · Joystick a jobb kézre, akciógombok a bal kézre (terv)

- **Azonosító** — R-TERV-169
- **Cím** — Joystick a jobb kézre, akciógombok a bal kézre (terv)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A mozgásvezérlő használható legyen érintőképernyőn, és a játék megállapíthatóan reagáljon rá.
- **Forrás** — `fc0121787:docs/specs/2026-11-18-joystick-jobb-kez.md:177`, `f511ea5af:docs/specs/2026-11-18-joystick-jobb-kez-vegrehajtas.md:5`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `fc0121787:source/playwright.game-mobile.config.ts:13` és `fc0121787:source/tests/joystick-side.spec.ts:170`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `feat/joystick-jobb-kez` (fc0121787)
- **Következő lépés** — A(z) `feat/joystick-jobb-kez` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-006 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-006

### R-TERV-170 · Terv: az ingadozó „joystick-reakció: tsunami-english” mérő stabilizálása az okánál

- **Azonosító** — R-TERV-170
- **Cím** — Terv: az ingadozó „joystick-reakció: tsunami-english” mérő stabilizálása az okánál
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A mozgásvezérlő használható legyen érintőképernyőn, és a játék megállapíthatóan reagáljon rá.
- **Forrás** — `docs/specs/2026-11-18-joystick-tsunami-stabil.md:110`, `docs/specs/2026-11-18-joystick-tsunami-stabil-vegrehajtas.md:53`
- **Mi van kész** — J1–J5 mért eredménye a terv 110–117. sorában van. #514 (b930c0f3), source/tests/joystick-response.spec.ts:424.
- **Mi hiányzik** — J6 történeti stage- és push-nyugtája a 118. sorban nyitott.
- **Folytatás helye** — `docs/specs/2026-11-18-joystick-tsunami-stabil.md:1` · #514
- **Következő lépés** — A #514 tényleges fejéhez tartozó két helyi kapurekordot keresd meg. A mainbe kerülésből a két helyi futásra külön nem lehet következtetni.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-050

### R-TERV-171 · Szökőár szökés — a téma visszaadása (a hullám a kép és a tét közepén) és a sebesség

- **Azonosító** — R-TERV-171
- **Cím** — Szökőár szökés — a téma visszaadása (a hullám a kép és a tét közepén) és a sebesség
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Szökőár szökés — a téma visszaadása (a hullám a kép és a tét közepén) és a sebesség.
- **Forrás** — `737de8fe7:docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md:66`, `737de8fe7:docs/specs/2026-11-18-szokoar-tema-es-sebesseg-vegrehajtas.md:103`, `d41693458:docs/handoffs/2026-11-18-szokoar-latvany-atadas.md:69`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `e1332ec73:source/client/src/game-engine/scenes/TsunamiScene3D.tsx:79` és `e1332ec73:source/tests/tsunami-play.spec.ts:149`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` (e1332ec73)
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-005 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-005

### R-TERV-175 · LS-3b — Közös játék-menet: kupon-óra, HUD és a lecke Próbája

- **Azonosító** — R-TERV-175
- **Cím** — LS-3b — Közös játék-menet: kupon-óra, HUD és a lecke Próbája
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A játékmotor a tényleges kuponidőt mutassa, és lejáratkor használható visszatérési lehetőséget adjon.
- **Forrás** — `docs/specs/ls-3b-game-engine-2026-09-04.md:69`
- **Mi van kész** — A történeti óra 1bebcc23, 12/12 célzott, 356/356 és 20/20 E2E. A CSRF-bekötés 40cd6f94. A mai lejárati felület fókuszált visszatérési lehetőséget ad (source/client/src/game-engine/CouponHud.tsx:129, :149).
- **Mi hiányzik** — A régi azonnali visszairányítást a novemberi felületi szerződés váltotta fel. A teljes játékút és az ismétlési határidő külön folytatás.
- **Folytatás helye** — `docs/specs/ls-3b-game-engine-2026-09-04.md:1`
- **Következő lépés** — A mai lejárt állapotot a 2026-11-16-e2e-coupon-expired-block-craft.md 84. sorához igazítsd. A hibás kérdés újra elővételét a P-010 szerint külön mérd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-179 · Spec — Szólétra (WordLadderHuEn) grafikai és játékélmény-újratervezés (2026-09-02)

- **Azonosító** — R-TERV-179
- **Cím** — Spec — Szólétra (WordLadderHuEn) grafikai és játékélmény-újratervezés (2026-09-02)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Szólétra (WordLadderHuEn) grafikai és játékélmény-újratervezés (2026-09-02).
- **Forrás** — `docs/specs/wordladder-redesign-2026-09-02.md:71`
- **Mi van kész** — Az eredeti létra 7cbf198e-ban célzott és böngészős próbákat kapott. #145 a tíz pályát, #454 a térbeli riválist hozta. source/tests/word-ladder-logic.test.ts:19, :41 és source/tests/word-ladder-core.test.ts:49, :79, :176.
- **Mi hiányzik** — A korábbi kötelező 16 fokot az évfolyamfüggő pályaszerződés leváltotta.
- **Folytatás helye** — `docs/specs/wordladder-redesign-2026-09-02.md:1`
- **Következő lépés** — A játék hosszát a választott pályához mérd; a régi fix hossz visszaépítése hibás elfogadás lenne.
- **Függőség / ütközés** — 2026-09-29-i pálya- és nyelvterv, majd a 2026-11-16-i játékélményterv.
- **Kapcsolódó P-tétel** — —

### R-TERV-180 · Tananyagkészítés — logika, metodika, folyamat: audit és végrehajtási terv (2026-09-07)

- **Azonosító** — R-TERV-180
- **Cím** — Tananyagkészítés — logika, metodika, folyamat: audit és végrehajtási terv (2026-09-07)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A tananyaggyártás hibáit lépésenként kell visszakövetni és mérhető javításokra bontani.
- **Forrás** — `docs/specs/2026-09-07-tananyagkeszites-audit-es-terv.md:71`
- **Mi van kész** — A 43fba199 commit szintetikus példán vizsgálta a sémát és a kötelező elemek teljes fedését. A #43 és a 4b3ec6e3 a szerkesztői minőségi jelzést, a #53 egy forrásból készült anyagot ellenőrzött.
- **Mi hiányzik** — Az eredeti szintetikus próbát a #262 kivezette. Az új motor azonos jelentésű fedettség-ellenőrzését és a minőségi megjegyzések végső megjelenését még össze kell kötni.
- **Folytatás helye** — `docs/specs/2026-09-07-tananyagkeszites-audit-es-terv.md:1`
- **Következő lépés** — Kövesd a #43 és #53 bemenetét a source/server/studio/single-run/engine.ts útján, és az alapvető forráselemeket vesd össze az elkészült anyaggal. Az évfolyam forrásalapú kiválasztására a #42 döntése érvényes.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-181 · Spec: Internetes tananyag-ügynök, mentés a listába, 80%-os készítőfelület

- **Azonosító** — R-TERV-181
- **Cím** — Spec: Internetes tananyag-ügynök, mentés a listába, 80%-os készítőfelület
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Internetes témából az admin felületén lehessen kész, mentett leckét előállítani.
- **Forrás** — `docs/specs/2026-09-09-webes-tananyag-agent-es-mentes.md:58`, `docs/specs/2026-09-09-webes-tananyag-agent-vegrehajtas.md:37`
- **Mi van kész** — A webes mód és a keresés működött, a #54/#55 ugyanazon eredeti feladatból 16 forrást és SQL/API egyezést, mobilnézetet, újratöltést és pontozást igazolt. docs/handoffs/2026-09-11-web-research-javitas.md:49–60.
- **Mi hiányzik** — A korábbi kézi HTML-mentési és osztályválasztási szerződést a szerveres automatikus közzététel és forrásalapú besorolás váltotta fel. A megmaradt admin-értesítési feltétel tényleges kézbesítését az adott kiadásra külön kell igazolni.
- **Folytatás helye** — `docs/specs/2026-09-09-webes-tananyag-agent-es-mentes.md:1`
- **Következő lépés** — A korábbi kézi POST helyett a mai automatikus publikációból induló értesítést kövesd a személytelen kézbesítési nyugtáig.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-188 · A háromfázisú rend CI-kikényszerítése — terv (2026-10-15)

- **Azonosító** — R-TERV-188
- **Cím** — A háromfázisú rend CI-kikényszerítése — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A terv, a végrehajtási utasítás és a kód sorrendje a CI-ben is ellenőrizhető legyen.
- **Forrás** — `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md:32`, `docs/specs/2026-10-15-haromfazis-ci-ellenorzes-vegrehajtas.md:19`
- **Mi van kész** — A saját E1–E4 feltételek és az egysoros kivétel #236/#238-ban megvalósultak (.github/workflows/ci.yml:37 és scripts/qa/three-phase-check.test.mjs:12, :18, :26, :33).
- **Mi hiányzik** — Az egysoros módosítást a kapu végrehajtási fájl nélkül is átengedi (scripts/qa/three-phase-check.mjs:25–27), miközben AGENTS.md:12 és docs/agent-haromfazisu-munka.md:9, :18, :26 a külön utasítást előírja.
- **Folytatás helye** — `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md:1` · #236
- **Következő lépés** — A runbook könnyített tervközlését és a végrehajtás kötelezettségét egyeztesd. Az elhatározott szabályt ugyanazzal az egysoros diffel ellenőrizd mind a dokumentumban, mind a kaputesztben.
- **Függőség / ütközés** — Az októberi kapu saját terve teljesült, a későbbi üzemeltetési használatban viszont két szabály eltérő eredményt ad.
- **Kapcsolódó P-tétel** — —

### R-TERV-192 · E2E: eldobható adatbázis és az éles DB kizárása (2026-10-17)

- **Azonosító** — R-TERV-192
- **Cím** — E2E: eldobható adatbázis és az éles DB kizárása (2026-10-17)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A böngészőtesztek elkülönített, a futás végén lezárt adatbázist használjanak.
- **Forrás** — `docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md:71`, `docs/specs/2026-10-17-e2e-eldobhato-adatbazis-vegrehajtas.md:1`
- **Mi van kész** — A negatív indítási próba és 206+10 sikeres teszt a terv 82–91. sorában szerepel. source/scripts/run-e2e-tests.ts:87.
- **Mi hiányzik** — Ugyanebben a mérésben a Windows worker leállási hibája miatt a teljes futtató 1-es kóddal lépett ki.
- **Folytatás helye** — `docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md:1` · #296
- **Következő lépés** — Azonos konfigurációjú Windows-futás nyugtájában a tesztesetek mellett a főfolyamat kilépési kódját és a gyermekfolyamatok lezárását is ellenőrizd.
- **Függőség / ütközés** — A CI-idő és az indítási lánc P-046/P-050-nel átfed.
- **Kapcsolódó P-tétel** — —

### R-TERV-193 · Átfogó review: a PR és a program egésze, nem csak a szelet — terv

- **Azonosító** — R-TERV-193
- **Cím** — Átfogó review: a PR és a program egésze, nem csak a szelet — terv
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A felülvizsgálat fogja át az egész PR-t és a több szeletből épülő funkció teljes folyamatát.
- **Forrás** — `docs/specs/2026-10-18-atfogo-review.md:35`, `docs/specs/2026-10-18-atfogo-review-vegrehajtas.md:23`
- **Mi van kész** — A szabály #306-ban megvan (8/8 és érvényes YAML), AGENTS.md:98, :109 és .github/workflows/auto-review.yml:17, :68. #438 későbbi példa a teljes áttekintésre.
- **Mi hiányzik** — A PR-leírásokat és review-szálakat tartalmazó export nem igazolja minden lezáró szeletnél a külön, átfogó PR-komment meglétét.
- **Folytatás helye** — `docs/specs/2026-10-18-atfogo-review.md:1` · #306
- **Következő lépés** — Az érintett utolsó szelet tényleges hozzászóláslistáját vesd össze az elfogadott fejjel és az összes korábbi szelet azonosítójával. A repóbeli szabályt emiatt nem kell ismét létrehozni.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-194 · Elmaradt feladatok lezárása (2026-10-22) — terv

- **Azonosító** — R-TERV-194
- **Cím** — Elmaradt feladatok lezárása (2026-10-22) — terv
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A korábbi átadásokból fennmaradt konkrét javításokat visszaolvasással és méréssel kell lezárni.
- **Forrás** — `docs/specs/2026-10-22-elmaradt-feladatok.md:40`, `docs/specs/2026-10-22-elmaradt-feladatok-vegrehajtas.md:1`
- **Mi van kész** — Az öt téves kategória mindhárom adattárának 5/5/5 visszaolvasása a #366-ban van, PG 70/70 és 393/1280 px leállítási próba mellett. source/tests/workflow-stop.test.ts:6, :15. A függő fókuszgyűrűt #367 pótolta.
- **Mi hiányzik** — Az EARS szűk köre megvalósult. A tágabb követő mérési döntések állapotát külön kell egyeztetni a #373-mal és az ismét bekötött katalógussal.
- **Folytatás helye** — `docs/specs/2026-10-22-elmaradt-feladatok.md:1` · #366
- **Következő lépés** — A terv 13–18. sora szerinti mérési pontokat a #373 végső modellbeállításával és az S6 főági bekötésével egyeztesd. Az öt anyagot ne javítsd újra.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-199 · E2E-ingadozók, 2. kör: joystick-mérő, szóbank-napló, a lejárt kupon a közös rétegben (kanban 58)

- **Azonosító** — R-TERV-199
- **Cím** — E2E-ingadozók, 2. kör: joystick-mérő, szóbank-napló, a lejárt kupon a közös rétegben (kanban 58)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A megnevezett üzemi viselkedést az időzítéstől és a párhuzamos futás sorrendjétől független próba őrizze.
- **Forrás** — `docs/specs/2026-11-16-e2e-ingadozok-2.md:46`, `docs/specs/2026-11-16-e2e-ingadozok-2-vegrehajtas.md:3`
- **Mi van kész** — A főági javításban megvan a kuponteszt és a szóbank próbája. A végrehajtás 44–50. sora a régebbi változaton 12/12, a végső A/B-ben 8/8 és a CI-ben 726/726 eredményt közöl (#477).
- **Mi hiányzik** — A végső változaton a külön tízes ismétlés 9/10 volt, miközben a terv 48. sora legalább tíz stabil ismétlést kér.
- **Folytatás helye** — `docs/specs/2026-11-16-e2e-ingadozok-2.md:1` · #58
- **Következő lépés** — Ugyanazzal az adattal és a végleges tesztváltozaton ismételd a hibás esetet legalább tízszer. Rögzítsd az egyes kimeneteket és a bukó állapotot.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-050

### R-TERV-200 · Spec: Állapot-ellenőrző szkriptek (memória, kanban, futtatókörnyezet, keresés-pontosság)

- **Azonosító** — R-TERV-200
- **Cím** — Spec: Állapot-ellenőrző szkriptek (memória, kanban, futtatókörnyezet, keresés-pontosság)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A memória, a munkatábla és a futtatókörnyezet állapotát megismételhető szkriptek ellenőrizzék.
- **Forrás** — `ffb4774e4:docs/specs/2026-11-17-allapot-ellenorok.md:63`, `ffb4774e4:docs/specs/2026-11-17-allapot-ellenorok-vegrehajtas.md:4`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `ab69f0001:scripts/qa/checks/lib.mjs:12`.
- **Mi hiányzik** — A külön ágon megvan az állapotellenőrző szkriptek egy része; a főági környezeti bekötés és a közös átvételi nyugta hiányzik.
- **Folytatás helye** — `chore/allapot-ellenorok` (ab69f0001)
- **Következő lépés** — Először a kanban- és memóriavizsgálatot kösd egy-egy hibás szintetikus bemenethez, majd a főági indítási pontot igazold.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-047

### R-TERV-201 · E2E-ingadozók, 3. kör: joystick-renderszámláló, eredmény-e-mail, Párbaj-visszavágó, győzelmi képernyő, Neon védőtorony (kanban 76, 31)

- **Azonosító** — R-TERV-201
- **Cím** — E2E-ingadozók, 3. kör: joystick-renderszámláló, eredmény-e-mail, Párbaj-visszavágó, győzelmi képernyő, Neon védőtorony (kanban 76, 31)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A megnevezett üzemi viselkedést az időzítéstől és a párhuzamos futás sorrendjétől független próba őrizze.
- **Forrás** — `docs/specs/2026-11-17-e2e-ingadozok-3.md:26`, `docs/specs/2026-11-17-e2e-ingadozok-3-vegrehajtas.md:111`
- **Mi van kész** — A párbaj későbbi 20/20 eredménye felülírja a korábbi 19/20-at (végrehajtás 110–116). A joystick ellenpróbájához a 151. sor és a 54620024 commit 3/3 eredményt ad.
- **Mi hiányzik** — A független védőtorony-eset gyökere a végrehajtás 207–210. sora szerint nyitott.
- **Folytatás helye** — `docs/specs/2026-11-17-e2e-ingadozok-3.md:1` · #76
- **Következő lépés** — A sorokban rögzített hibás állapotból indulj, azonos pályán különítsd el a megjelenítési és időzítési okot. A már lezárt párbajtesztet ne írd át emiatt.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-050

### R-TERV-202 · Spec: A minőségkapuk mély beépítése minden ügynökbe és környezetbe (+ a vezérlés-diéta 2. lépcsője)

- **Azonosító** — R-TERV-202
- **Cím** — Spec: A minőségkapuk mély beépítése minden ügynökbe és környezetbe (+ a vezérlés-diéta 2. lépcsője)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A kiadási ellenőrzések helyben, a CI-ben és a használt ügynökkörnyezetekben is érvényesüljenek.
- **Forrás** — `3feb81546:docs/specs/2026-11-17-kapuk-beepites.md:75`, `9a4c5ff37:docs/specs/2026-11-17-kapuk-beepites-vegrehajtas.md:4`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `ab87bf160:scripts/qa/gates/ci-static-gate.mjs:20`; `ab87bf160:scripts/qa/gates/ci-static-gate.test.mjs:14`.
- **Mi hiányzik** — A CI-, felhő- és helyi bekötések nem egyszerre kerültek a főágra. A külső ügynökkörnyezet telepítése a repo tartalmából nem igazolható.
- **Folytatás helye** — `chore/kapuk-beepites` (ab87bf160)
- **Következő lépés** — A CI statikus kapuját és helyi megfelelőjét azonos próbarepón ellenőrizd. A külső környezetben külön kérj telepítési nyugtát.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-047

### R-TERV-205 · Spec: Minőségkapuk — lint kapu, szakasz-kapu, push / PR / merge előtti kapu, független fejlesztési ellenőr

- **Azonosító** — R-TERV-205
- **Cím** — Spec: Minőségkapuk — lint kapu, szakasz-kapu, push / PR / merge előtti kapu, független fejlesztési ellenőr
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A kiadás feltételeit egységesen, az adott fejhez kötött bizonyítékokkal ellenőrizzék a kapuk.
- **Forrás** — `docs/specs/2026-11-17-minosegkapuk.md:115`, `docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md:188`, `docs/minosegkapuk.md:197`
- **Mi van kész** — Az eredeti E1–E15 alapkapukat #489 (26bae97f) beemelte. scripts/qa/gates/lint-gate.mjs:95, scripts/qa/gates/stage-gate.mjs:62, scripts/qa/gates/pre-pr-gate.mjs:132 és scripts/qa/gates/pre-merge-gate.mjs:83.
- **Mi hiányzik** — Az útmutató 166–178. sora az önbevallásos ítéletet, a hozzászólás eredetét és a CI alapjának ellenőrzését korlátnak nevezi.
- **Folytatás helye** — `docs/specs/2026-11-17-minosegkapuk.md:1` · #489
- **Következő lépés** — A P-043–P-046 beolvasztási feltételeihez kapcsold az ítéletet, és egy másik fejhez tartozó nyugtával is ellenőrizd az elutasítást.
- **Függőség / ütközés** — Az alapkapuk bevezetése és a bizonyítéklánc későbbi szigorítása külön munka.
- **Kapcsolódó P-tétel** — P-042, P-044, P-045, P-046

### R-TERV-207 · Spec: Ügynök-vezérlő anyagok diétája (AGENTS.md, skillek, csapdák, memória)

- **Azonosító** — R-TERV-207
- **Cím** — Spec: Ügynök-vezérlő anyagok diétája (AGENTS.md, skillek, csapdák, memória)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A fejlesztői utasítások maradjanak rövidek, követhetők és az adott munka során visszakereshetők.
- **Forrás** — `docs/specs/2026-11-17-vezerles-dieta.md:62`, `docs/specs/2026-11-17-vezerles-dieta-vegrehajtas.md:4`
- **Mi van kész** — Az első lépcső #488-ban megvan: 72/72 index–fejezet egyezés, hat sikeres őrteszt. docs/agent-csapdak.md:10, :38 és docs/kanban.md:71.
- **Mi hiányzik** — A második lépcső a terv 87–114. sorában nyitott. Az ismételt utasítások több helyen megmaradtak, például AGENTS.md:12, :116, :194 és docs/agent-haromfazisu-munka.md:28.
- **Folytatás helye** — `docs/specs/2026-11-17-vezerles-dieta.md:1` · #488
- **Következő lépés** — A közös utasítás megtartása mellett a másolatok helyére tedd a hiteles forrást. A régi Cursor-fájl archiválásához először a 112. sor szerinti döntést keresd vissza.
- **Függőség / ütközés** — A későbbi takarítási elvet a helyi cleanup-delete-archives.md:11 rögzíti. P-051.
- **Kapcsolódó P-tétel** — P-051

### R-TERV-208 · Terv: a CI böngészős körének (Playwright E2E) szeletelése

- **Azonosító** — R-TERV-208
- **Cím** — Terv: a CI böngészős körének (Playwright E2E) szeletelése
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A nagy böngészős csomag párhuzamos szeleteken belül is maradjon teljes és a megadott időn belül végezzen.
- **Forrás** — `docs/specs/2026-11-18-ci-e2e-szeleteles.md:168`, `docs/specs/2026-11-18-ci-e2e-szeleteles-vegrehajtas.md:101`
- **Mi van kész** — A főági CI-ben hat szelet szerepel (.github/workflows/ci.yml:12, #518).
- **Mi hiányzik** — Az E7 a legelső CI legfeljebb 30 perces idejét kéri. A terv 178. sorában ez nyitott.
- **Folytatás helye** — `docs/specs/2026-11-18-ci-e2e-szeleteles.md:1` · #518
- **Következő lépés** — A #518 fejéhez tartozó legelső teljes CI-ből számíts időt a szeletek közös indulásától az utolsó sikeres befejezésig. Rögzítsd az időpontokat és vesd össze a 30 perccel.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-050

### R-TERV-209 · A kapu-hook hibája / időtúllépése = tiltás (onFailure: "block") + az audit-hook fail-closed időtúllépése

- **Azonosító** — R-TERV-209
- **Cím** — A kapu-hook hibája / időtúllépése = tiltás (onFailure: "block") + az audit-hook fail-closed időtúllépése
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A kiadás ellenőrzésekor a hook saját hibája is a jóváhagyott tiltó döntést adja.
- **Forrás** — `docs/specs/2026-11-18-hook-onfailure.md:46`, `docs/specs/2026-11-18-hook-onfailure-vegrehajtas.md:21`, `docs/handoffs/2026-11-18-kapu-hook-retro.md:1`
- **Mi van kész** — Az eredeti F1–F10 és javítókörök a #506 (14c859ee) részei. scripts/qa/hooks/hook-failure.test.mjs:29, :41, :50, :58, :85, :100, :110. #520 később az auditkapu indítását is rendezte.
- **Mi hiányzik** — Az összekapcsolt retro követői, köztük a konfigurációváltozás határa, továbbra is külön elfogadást kérnek (terv 154).
- **Folytatás helye** — `docs/specs/2026-11-18-hook-onfailure.md:1` · #506
- **Következő lépés** — A P-045/P-057 alatt nyitott határokat eseményenként ellenőrizd. Az F1–F10 elfogadását a régi „nyitott PR” szöveg miatt ne nyisd újra.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-045, P-057

### R-TERV-210 · A merge előtti kapu REST-en is fut (felhős munkamenet)

- **Azonosító** — R-TERV-210
- **Cím** — A merge előtti kapu REST-en is fut (felhős munkamenet)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A PR-ról a merge-őr lapozva és megfelelően értelmezve olvassa ki az elfogadás feltételeit.
- **Forrás** — `05ff81780:docs/specs/2026-11-18-merge-kapu-rest.md:59`, `05ff81780:docs/specs/2026-11-18-merge-kapu-rest-vegrehajtas.md:10`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `2373a3f4d:scripts/qa/gates/pre-merge-gate.mjs:130` és `2373a3f4d:scripts/qa/gates/pre-merge-gate.test.mjs:144`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/merge-kapu-rest` (2373a3f4d) · #513 OPEN
- **Következő lépés** — A(z) `fix/merge-kapu-rest` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-044 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-044

### R-TERV-211 · Vak, hibakereső független ellenőr; a külső (Gemini) ellenőr kikerül a kapukból

- **Azonosító** — R-TERV-211
- **Cím** — Vak, hibakereső független ellenőr; a külső (Gemini) ellenőr kikerül a kapukból
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Vak, hibakereső független ellenőr; a külső (Gemini) ellenőr kikerül a kapukból.
- **Forrás** — `eda8fff9a:docs/specs/2026-11-18-vak-hibakereso-ellenor.md:101`, `3155c7ced:docs/specs/2026-11-18-vak-hibakereso-ellenor-vegrehajtas.md:23`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `eda8fff9a:scripts/qa/gates/record-review.mjs:32` és `eda8fff9a:scripts/qa/gates/vak-ellenor.test.mjs:25`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `chore/vak-hibakereso-ellenor` (eda8fff9a)
- **Következő lépés** — A(z) `chore/vak-hibakereso-ellenor` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-043 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-043

### R-TERV-213 · Terv: a PR-kapu böngészős köre csak az érintett játékra, és olcsó lépések előre (fail-fast)

- **Azonosító** — R-TERV-213
- **Cím** — Terv: a PR-kapu böngészős köre csak az érintett játékra, és olcsó lépések előre (fail-fast)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Terv: a PR-kapu böngészős köre csak az érintett játékra, és olcsó lépések előre (fail-fast).
- **Forrás** — `40a582ba7:docs/specs/2026-11-19-gate-pr-celzott-e2e.md:61`, `40a582ba7:docs/specs/2026-11-19-gate-pr-celzott-e2e-vegrehajtas.md:1`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `9765df58a:scripts/qa/gates/pre-pr-gate.mjs:28`; `9765df58a:scripts/qa/gates/pre-pr-gate.test.mjs:27`.
- **Mi hiányzik** — A játékonkénti 5–15 perces cél és az összes játék-spec besorolása csak az adott ág végső fején fogadható el.
- **Folytatás helye** — `fix/gate-pr-celzott-e2e` (9765df58a)
- **Következő lépés** — A játékválasztó őrt üres és ismeretlen bejegyzéssel, majd egy mért valós játék-körrel ellenőrizd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-046

### R-TERV-214 · Terv: gépi zár — a nehéz körök egy sávban, sorban (scripts/qa/machine-lock.mjs)

- **Azonosító** — R-TERV-214
- **Cím** — Terv: gépi zár — a nehéz körök egy sávban, sorban (scripts/qa/machine-lock.mjs)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gép terhelését egyetlen, szabályosan átadott végrehajtási sáv korlátozza a nehéz ellenőrzések alatt.
- **Forrás** — `dbbb0ae6f:docs/specs/2026-11-19-gepi-zar.md:151`, `dbbb0ae6f:docs/specs/2026-11-19-gepi-zar-vegrehajtas.md:1`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `a707d24d6:scripts/qa/machine-lock.mjs:25`; `a707d24d6:scripts/qa/machine-lock.test.mjs:68`.
- **Mi hiányzik** — A zár ági implementációja megvan, a teljes főági indítási lánc és a más gépen futó ellenőrzés külön feltétel.
- **Folytatás helye** — `feat/gepi-zar` (a707d24d6)
- **Következő lépés** — Egy aktív és egy várakozó folyamat mellett ellenőrizd a sorrendet, az elhalt foglalást és a kilépési takarítást.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-215 · Spec: falióra-független egységtesztek terhelt gépen (kanban 205, 206)

- **Azonosító** — R-TERV-215
- **Cím** — Spec: falióra-független egységtesztek terhelt gépen (kanban 205, 206)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A terhelt gép lassulása önmagában ne okozzon hibás tesztbukást.
- **Forrás** — `9981db1bb:docs/specs/2026-11-19-idozitesfuggo-tesztek.md:124`, `9981db1bb:docs/specs/2026-11-19-idozitesfuggo-tesztek-vegrehajtas.md:5`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `29913579e:source/tests/parallel-bank.test.ts:53`.
- **Mi hiányzik** — A három időzítésérzékeny eset ági változata még nem váltotta fel a teljes főági tesztutat.
- **Folytatás helye** — `fix/idozitesfuggo-tesztek` (29913579e)
- **Következő lépés** — A céltesztekben igazold, hogy a korán elutasított feladatot és a teljesen megvárt mentést a teszt megkülönbözteti, terhelt gépen is.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-050

### R-TERV-216 · Terv: kapu-gyorsítás — gépi összefésült próba a merge-kapuban, bizonyíték-átvitel főág-beolvasztás után, vak-kör szabály

- **Azonosító** — R-TERV-216
- **Cím** — Terv: kapu-gyorsítás — gépi összefésült próba a merge-kapuban, bizonyíték-átvitel főág-beolvasztás után, vak-kör szabály
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Terv: kapu-gyorsítás — gépi összefésült próba a merge-kapuban, bizonyíték-átvitel főág-beolvasztás után, vak-kör szabály.
- **Forrás** — `68b72fb3c:docs/specs/2026-11-19-kapu-gyorsitas.md:64`, `68b72fb3c:docs/specs/2026-11-19-kapu-gyorsitas-vegrehajtas.md:1`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `037691a23:scripts/qa/gates/merged-probe.mjs:22`; `037691a23:scripts/qa/gates/merged-probe.test.mjs:12`.
- **Mi hiányzik** — A későbbi szétválasztás után a bizonyítékátvitel és a végleges összevont próba önálló tervek.
- **Folytatás helye** — `fix/kapu-gyorsitas` (037691a23)
- **Következő lépés** — A három terv leírt sorrendjét vesd össze. Az elfogadott első szeletet az aktuális gépi zár és a mért futási idők alapján vedd át.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-046

### R-TERV-217 · Terv (VÁZLAT): bizonyíték-átvitel főág-beolvasztás után — külön PR

- **Azonosító** — R-TERV-217
- **Cím** — Terv (VÁZLAT): bizonyíték-átvitel főág-beolvasztás után — külön PR
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Csak igazoltan változatlan munka esetén legyen átvihető egy korábbi ellenőrzési bizonyíték.
- **Forrás** — `68b72fb3c:docs/specs/2026-11-20-bizonyitek-atvitel.md:10`
- **Mi van kész** — A 2026-11-19-i döntés szerint a korábbi próbálkozás kikerült a kapugyorsítás PR-ból, az önálló terv ezt az 1–4. sorban rögzíti. A főági pre-merge kapu scripts/qa/gates/pre-merge-gate.mjs:83 alatt működik.
- **Mi hiányzik** — A külön elfogadott átviteli út és a közben visszavont forrásítélet érvénytelenítése nincs a főágban.
- **Folytatás helye** — `fix/kapu-gyorsitas` (037691a23)
- **Következő lépés** — Külön szeletben egyeztesd az eredeti ítélet fejét és lenyomatát a közzététel pillanatában. Futtass olyan célzott próbát, amelyben az eredeti ítélet a két olvasás között megváltozik.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-046

### R-TERV-218 · Terv: a független ítélet rögzítése a jelentés ZÁRÓ Fej: sorához kötve

- **Azonosító** — R-TERV-218
- **Cím** — Terv: a független ítélet rögzítése a jelentés ZÁRÓ Fej: sorához kötve
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az ellenőr jelentése és a jóváhagyott commit feje bizonyíthatóan ugyanaz legyen.
- **Forrás** — `10f53ac09:docs/specs/2026-11-20-itelet-fej-egyeztetes.md:40`, `10f53ac09:docs/specs/2026-11-20-itelet-fej-egyeztetes-vegrehajtas.md:1`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `f06c55a8a:scripts/qa/gates/record-review.mjs:36` és `f06c55a8a:scripts/qa/gates/record-review.test.mjs:49`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/itelet-fej-egyeztetes` (f06c55a8a)
- **Következő lépés** — A(z) `fix/itelet-fej-egyeztetes` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-044 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-044

### R-TERV-219 · Terv (VÁZLAT): gépi összefésült próba a merge-kapuban (C-61 új CI helyett) — PR-2, egyszerűbb konstrukció

- **Azonosító** — R-TERV-219
- **Cím** — Terv (VÁZLAT): gépi összefésült próba a merge-kapuban (C-61 új CI helyett) — PR-2, egyszerűbb konstrukció
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A kiadás előtt a ténylegesen összeillesztett változatot kell megvizsgálni a megadott időkereten belül.
- **Forrás** — `10f53ac09:docs/specs/2026-11-20-osszefesult-proba.md:10`
- **Mi van kész** — A 2026-11-19-i döntés a végleges kialakítást külön PR-2-re osztotta. Az ági terv 3–4. sorában előfeltétel a gépi zár és az időzítési javítás. A korábbi ági prototípus belépője 037691a23:scripts/qa/gates/merged-probe.mjs:22.
- **Mi hiányzik** — A végleges konstrukció főági bekötése és a legrosszabb eset legfeljebb hétperces, zárral mért ideje hiányzik.
- **Folytatás helye** — `fix/itelet-fej-egyeztetes` (f06c55a8a)
- **Következő lépés** — A két előfeltétel után a merge-őrben ellenőrizd a megváltozott alapot, az ütköző próbát és a menet közben visszavont ítéletet, majd mérd a leglassabb teljes kört.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-046

### R-TERV-220 · Ügynök-csapdakatalógus — WEBSULI

- **Azonosító** — R-TERV-220
- **Cím** — Ügynök-csapdakatalógus — WEBSULI
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A már előfordult hiba felismerése és megelőzése legyen visszakereshető a következő fejlesztéskor.
- **Forrás** — `docs/agent-csapdak.md:1021`
- **Mi van kész** — A katalógus a korábbi hibákat, dátumokat és megelőzési szabályokat rögzíti (docs/agent-csapdak.md:8, :103). A merge előtti őr tényleges belépője scripts/qa/gates/pre-merge-gate.mjs:83.
- **Mi hiányzik** — Egyes bejegyzések már kijavított eseteket írnak le; az összes későbbi munkamenetben betartott használatot egy repo-pillanatkép nem bizonyítja.
- **Folytatás helye** — `docs/agent-csapdak.md:1` · #506
- **Következő lépés** — A javítandó részterület csapdáját a megfelelő programváltozat és egy reprodukálható ellenpróba mellé rendeld. A példa-NOT DONE sorokat ne számold önálló programhibának.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-222 · Spec: 4-napos fejlesztés-audit javításai (2026-09-02..09-05)

- **Azonosító** — R-TERV-222
- **Cím** — Spec: 4-napos fejlesztés-audit javításai (2026-09-02..09-05)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Spec: 4-napos fejlesztés-audit javításai (2026-09-02..09-05).
- **Forrás** — `docs/specs/audit-4day-fixes-2026-09-05.md:102`
- **Mi van kész** — A #30 553/553 eredményt közöl. A #31–#33 követő javításokat tartalmaz. source/tests/studio-autonomous.test.ts:26 és source/tests/studio-one-menu.test.ts:82 a későbbi működést igazolja.
- **Mi hiányzik** — A korábbi külön menüfület, kapuhiba utáni ágat és két külön modellcsaládot utódtervek módosították. Az egyéb eredeti auditfeltételeket változatlanul az elsődleges tervponthoz kell mérni.
- **Folytatás helye** — `docs/specs/audit-4day-fixes-2026-09-05.md:1` · #175
- **Következő lépés** — A terv 107–108., 118–120. sorában a #38, #40 és a 2026-10-16-i S4b döntését vezesd át a következő javítás előtt. A mai modellszabályt source/tests/models-routing.test.ts:47, :73 ellenőrzi.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-223 · Codex felhőkörnyezet — WEBSULI

- **Azonosító** — R-TERV-223
- **Cím** — Codex felhőkörnyezet — WEBSULI
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A felhős fejlesztőkörnyezet reprodukálható beállítást és ellenőrzést kapjon.
- **Forrás** — `docs/codex-felhokornyezet.md:41`
- **Mi van kész** — A tárolt környezetleírásban szerepel a felépítés, az ellenőrzés és az újralétrehozás (docs/codex-felhokornyezet.md:5, :14, :64); a történeti bevezetés #307.
- **Mi hiányzik** — A külső fiókhoz rendelt környezet ténylegesen megőrzött beállításai a git fájából nem olvashatók vissza.
- **Folytatás helye** — `docs/codex-felhokornyezet.md:1` · #307
- **Következő lépés** — Egy már engedélyezett felhős futás beállítási nyugtájában ellenőrizd az előírt setupot és futtatót. A hozzáférési adatokat ne másold a revízióba.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-225 · Spec — Mély kódaudit javítások (2026-09-01)

- **Azonosító** — R-TERV-225
- **Cím** — Spec — Mély kódaudit javítások (2026-09-01)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Mély kódaudit javítások (2026-09-01).
- **Forrás** — `docs/specs/deep-audit-2026-09-01.md:67`
- **Mi van kész** — A mentési, eredetellenőrzési és ütemezési javításokhoz a source/tests/backup-guard.test.ts:34, source/tests/origin-guard-order.test.ts:58 és source/tests/scheduled-publishing-db.integration.ts:5 ad összevetést. A történeti 994 lintfigyelmeztetés 989-re csökkent (8b8e2622).
- **Mi hiányzik** — A terv 71. sora gépi hibakódot és HTTP 400 választ kért ismeretlen játékhoz. A tényleges FK-hibaág szöveges üzenetet küld a gépi kód nélkül (source/server/routes.ts:1429–1432).
- **Folytatás helye** — `docs/specs/deep-audit-2026-09-01.md:1`
- **Következő lépés** — Egyeztesd az ismeretlen játék válaszsémáját a klienssel, és ellenőrizd a 400-as státuszt, valamint a géppel olvasható kódot egyetlen regressziós esetben.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-226 · Kanban-tábla — WEBSULI

- **Azonosító** — R-TERV-226
- **Cím** — Kanban-tábla — WEBSULI
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az ügynökök ugyanazon táblán rögzítsék, mi kész, mi van folyamatban és mihez kell döntés.
- **Forrás** — `docs/kanban.md:53`
- **Mi van kész** — A kijelölt munkatábla megőrzött exportja 209 jegyet sorol. A docs/kanban.md:7, :25, :41 a közös táblát és állapotkezelését írja elő.
- **Mi hiányzik** — A rendszeres használat és az egyes feladatok közbeni fegyelmezett állapotváltás minden munkamenetre nem bizonyítható a főági programból.
- **Folytatás helye** — `docs/kanban.md:1` · #488
- **Következő lépés** — A kérdéses végrehajtásnál a kanban-jegy időpontjait, a lezáró nyugtát és a megfelelő commitot együtt ellenőrizd. Egy útmutató példamondata önmagában nem félbehagyott fejlesztés.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-229 · Tananyagkészítés: v7.4 és a Studio fúziója

- **Azonosító** — R-TERV-229
- **Cím** — Tananyagkészítés: v7.4 és a Studio fúziója
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke többféle tanítási és gyakorlási módját egységesen lehessen használni és értékelni.
- **Forrás** — `docs/specs/2026-09-10-lesson-method-fusion.md:7`, `docs/specs/2026-09-10-lesson-method-fusion-vegrehajtas.md:1`, `docs/specs/2026-09-10-lesson-method-fusion-evidence.md:45`
- **Mi van kész** — Az eredeti tanulói működéshez három valódi, 13 fogalmas modelljelölt, 15/15 és 25/25 pont, 9 böngésző és 320–2560 px tartozik. docs/specs/2026-09-10-lesson-method-fusion-evidence.md:17–21, :41; #45 és #54/#55.
- **Mi hiányzik** — A fizikai mikrofonfelvétel és a hallható minőség külön nyitott bizonyítási korlát (az evidence 47. sora).
- **Folytatás helye** — `docs/specs/2026-09-10-lesson-method-fusion.md:1` · #45
- **Következő lépés** — Valódi eszközön, szintetikus diktált mondattal mérd a felvételt és a lejátszást. Az automatikus pontozás már igazolt eredményét ettől külön őrizd meg.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-237 · Változatos, figyelemfelkeltő megjelenés: „Hercegnő-kastély” világ + lecke-szintű különlegességek

- **Azonosító** — R-TERV-237
- **Cím** — Változatos, figyelemfelkeltő megjelenés: „Hercegnő-kastély” világ + lecke-szintű különlegességek
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A leckék saját arculati változatokat és hozzájuk illő, kikapcsolható megjelenítést kapjanak.
- **Forrás** — `docs/specs/2026-09-24-lesson-flair-princess.md:30`, `docs/specs/2026-09-24-lesson-flair-princess-vegrehajtas.md:1`
- **Mi van kész** — A #106/#107 375 és 800 px-en igazolta a korábbi tervet. A 2026-10-18-i arculati döntés után a teszt kifejezetten tiltja a nemre utaló szóból választott hangulatot (source/tests/lesson-flair.test.ts:13, :23, :32 és docs/specs/2026-10-18-arculati-bank-s4.md).
- **Mi hiányzik** — E1/E3/E4 régi automatikus választását az új arculati szerződés kiváltotta.
- **Folytatás helye** — `docs/specs/2026-09-24-lesson-flair-princess.md:1` · #106
- **Következő lépés** — A mai arculatot a source/shared/lesson-design.ts:66 szerint ellenőrizd. A korábbi szóalapú választásra ne nyiss javítást.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-241 · Spec: Ábratervező ügynök + forgatható 3D-jelenet, Mezopotámia-összefésülés

- **Azonosító** — R-TERV-241
- **Cím** — Spec: Ábratervező ügynök + forgatható 3D-jelenet, Mezopotámia-összefésülés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tananyaghoz választott térbeli ábra paraméterei legyenek érvényesek és tanításra alkalmasak.
- **Forrás** — `docs/specs/2026-09-30-abratervezo-3d.md:64`, `docs/specs/2026-09-30-abratervezo-3d-vegrehajtas.md:1`
- **Mi van kész** — #150, három mintából három sikeres, 375 és 1280 px, 1752/1752 teszt. source/tests/scene3d-params.test.ts:17.
- **Mi hiányzik** — A terv 69. sorának két eredeti forrásból publikált teljes leckéje a PR leírásakor még futott. #262 után a régi külön tervező nem ugyanazon úton fut.
- **Folytatás helye** — `docs/specs/2026-09-30-abratervezo-3d.md:1` · #150
- **Következő lépés** — A konkrét forráspár kész leckéjének és képi tartalmának visszaolvasását keresd a futásnaplóban. A helyi három minta nem zárja ezt a pontot.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-243 · Websuli lecke-hős és sávfejléc a képkészletből — terv

- **Azonosító** — R-TERV-243
- **Cím** — Websuli lecke-hős és sávfejléc a képkészletből — terv
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke nyitóképe illeszkedjen a felülethez és a tananyag tartalmához.
- **Forrás** — `docs/specs/2026-10-17-websuli-lecke-hos.md:25`, `docs/specs/2026-10-17-websuli-lecke-hos-vegrehajtas.md:1`
- **Mi van kész** — A képi alap #273, 23/23, majd #274, 21/21 próbával került be. A #322 döntése szerint a sávhős állandó, a kabala forog. source/tests/design-assets.test.ts:89–111, source/shared/design-assets.ts:110–129.
- **Mi hiányzik** — Az eredeti hősképrotáció már nem követelmény. A tárgyillesztést később #405 egészítette ki.
- **Folytatás helye** — `docs/specs/2026-10-17-websuli-lecke-hos.md:1` · #273
- **Következő lépés** — A lecke-azonosító változtatásakor külön ellenőrizd a sávhőst és a kabalát, a #322 utáni elvárással.
- **Függőség / ütközés** — A döntés forrása a 2026-10-19-i hos-kep-sav terv és #322.
- **Kapcsolódó P-tétel** — —

### R-TERV-256 · Spec: Fejezet-kisfilmek v2 — korosztályos, rajzolt képsor + pontos ábrák + természetes hang

- **Azonosító** — R-TERV-256
- **Cím** — Spec: Fejezet-kisfilmek v2 — korosztályos, rajzolt képsor + pontos ábrák + természetes hang
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanuló fejezetenként kapjon lejátszható kisfilmet, a gyártás férjen bele az erőforráskorlátokba.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md:211`, `docs/specs/2026-11-10-fejezet-kisfilmek-v2-vegrehajtas.md:1`, `docs/fejezet-kisfilmek-hasznalat.md:14`
- **Mi van kész** — Helyi videópróbák a terv 171–177. sorában. Az éles kísérletet a későbbi memória-terv 8–18. sora dokumentálja: 526 MB terhelés 512 MB-os keretben, négy újraindulás után kikapcsolták.
- **Mi hiányzik** — A javított változattal nincs igazolt éles ffmpeg-futás és tartósan tárolt kisfilm.
- **Folytatás helye** — `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md:1` · #417
- **Következő lépés** — A P-041-re építve előbb az erőforrásmérést ismételd meg korlátozott környezetben, majd engedélyezett próba esetén ellenőrizd a tárolt média visszaolvasását.
- **Függőség / ütközés** — A v2 a v1 kézi sablonjait tudatosan vezeti ki (v2 terv 114). A régi feladat újranyitása félrevezető.
- **Kapcsolódó P-tétel** — P-041

### R-TERV-260 · LS-4 — Animáció, gyakorlat, Animator lépés, szigorú CSP, TTS, Space + BlockCraft

- **Azonosító** — R-TERV-260
- **Cím** — LS-4 — Animáció, gyakorlat, Animator lépés, szigorú CSP, TTS, Space + BlockCraft
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az animált és kipróbálható blokk a tanulói nézetben a hozzáférési és mozgáscsökkentési szabályokat is tartsa.
- **Forrás** — `docs/specs/ls-4-animate-try-animator-2026-09-04.md:69`, `docs/ls-4-animate-hasznalat.md:45`
- **Mi van kész** — A működési és jogosultsági feltételekhez #10 (451/451 és 22/22), #11 és source/tests/animator-invariants.test.ts:62, source/tests/csp-lesson-route.test.ts:22 ad alapot.
- **Mi hiányzik** — Az eredeti terv 101. és 109. sorához tartozó legalább 90-es Lighthouse Accessibility mérés tényleges pontszáma nincs azonosítva.
- **Folytatás helye** — `docs/specs/ls-4-animate-try-animator-2026-09-04.md:1` · #8
- **Következő lépés** — Az eredeti nézethez és kiadáshoz rendelj akadálymentességi jelentést, majd az újabb renderrel is vesd össze.
- **Függőség / ütközés** — A rendes működési tesztek teljesülése külön igazolt.
- **Kapcsolódó P-tétel** — —

### R-TERV-261 · Kivonatolás: minden forrásfájl kapjon fogalmat — a rövid füzetlapot a hosszú webes szöveg ne szorítsa ki (2026-09-29)

- **Azonosító** — R-TERV-261
- **Cím** — Kivonatolás: minden forrásfájl kapjon fogalmat — a rövid füzetlapot a hosszú webes szöveg ne szorítsa ki (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Minden beadott forrást külön ellenőrizzen a fogalomkivonatolás.
- **Forrás** — `docs/specs/2026-09-29-forrasonkenti-fedettseg.md:31`, `docs/specs/2026-09-29-forrasonkenti-fedettseg-vegrehajtas.md:5`
- **Mi van kész** — A korábbi főági segéd most is megtalálható source/server/studio/extractor.ts:214 alatt. #147 1737/1737 történeti tesztet közöl.
- **Mi hiányzik** — Az eredeti segéd mai szerveroldali hívója nem azonosítható név szerinti kereséssel. E4 kombinált forrású próbáját a #147 későbbre írta.
- **Folytatás helye** — `docs/specs/2026-09-29-forrasonkenti-fedettseg.md:1` · #147
- **Következő lépés** — Az egyfutásos út valódi kivonatolási belépőjén kövess két forrást, amelyből kezdetben csak az egyikhez születik fogalom. A javítást a másik forrásból tényleg előálló fogalom igazolja.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-262 · Tananyag tömörsége és forrás-lefedettsége: mérés, v7.5-összevetés, javítási terv (2026-10-14)

- **Azonosító** — R-TERV-262
- **Cím** — Tananyag tömörsége és forrás-lefedettsége: mérés, v7.5-összevetés, javítási terv (2026-10-14)
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Rövidebb tananyag készüljön úgy, hogy a kötelező fogalmak fedettsége ne csökkenjen.
- **Forrás** — `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md:106`, `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg-vegrehajtas.md:9`
- **Mi van kész** — A terjedelem mérhető a source/server/studio/lesson-metrics.ts:14 implementációban. A terv 139–148. sora egy mintán 16% rövidülést rögzít.
- **Mi hiányzik** — E1 célja legalább 25%. E2 másik két referenciaanyagának eredménye hiányzik.
- **Folytatás helye** — `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md:1` · #310
- **Következő lépés** — A lesson-metrics azonos mérőjével hasonlítsd össze a három tervbeli forrás régi és új kimenetét, hossz és fogalomfedettség szerint. A nyers tanulói adatot hagyd ki a jelentésből.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-264 · Spec: a „Meghallgatás” mindig szóljon — szerveroldali hangtartalék

- **Azonosító** — R-TERV-264
- **Cím** — Spec: a „Meghallgatás” mindig szóljon — szerveroldali hangtartalék
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Ha az első hangforrás nem működik, a tanuló a jóváhagyott tartalékúton is hallja a szöveget.
- **Forrás** — `docs/specs/2026-11-09-felolvasas-tartalek.md:40`, `docs/specs/2026-11-09-felolvasas-tartalek-vegrehajtas.md:5`
- **Mi van kész** — A gyorsítótár útvonala és a szerveres válasz megvan (source/vercel.json:75, :87 és source/server/routes.ts:2664, :2675).
- **Mi hiányzik** — A terv 52., 75–76. sora szerinti valódi CDN-találat és iPhone-os hangfeloldás nincs igazolva.
- **Folytatás helye** — `docs/specs/2026-11-09-felolvasas-tartalek.md:1` · #410
- **Következő lépés** — Ugyanazt a hangot kérd le kétszer azonos nyilvános útvonalon, és ellenőrizd a gyorsítótár válaszjelzését. Valódi iPhone-on külön próbáld ki az első felhasználói érintés utáni hangot.
- **Függőség / ütközés** — A brit hanggyártás és a hangtár P-032/P-064 alatt külön feladat.
- **Kapcsolódó P-tétel** — P-032, P-064

### R-TERV-265 · Hátralévő tanulási javítások

- **Azonosító** — R-TERV-265
- **Cím** — Hátralévő tanulási javítások
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Pótolni kell a játékok magyarázatait, a hibás régi címeket és a még kipróbálandó forrásalapú gyártást.
- **Forrás** — `docs/specs/2026-09-07-remaining-learning-fixes.md:18`
- **Mi van kész** — #42 és a terv 52–59. sora öt éles forrásleckét, tizenöt tartalomhash-megőrző címjavítást, négy Chrome-nézetet és az öt érintett játék adaptív útját igazolja.
- **Mi hiányzik** — A 61. sorban külön vállalt két teljes fájlútból a DOCX-feldolgozástól a publikációig nem azonosítható megszakítás nélküli nyugta. A későbbi PDF-út #110–#119.
- **Folytatás helye** — `docs/specs/2026-09-07-remaining-learning-fixes.md:1` · #42
- **Következő lépés** — A DOCX-hez valódi, már dokumentált futásból párosítsd össze a kivonatolt forrást a közzétett lecke visszaolvasásával. A formátum olvashatósága csak az első lépés.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-267 · Szerzői fogalomazonosító javítás

- **Azonosító** — R-TERV-267
- **Cím** — Szerzői fogalomazonosító javítás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szerző hibás fogalomazonosítóját a rendszer a tényleges forráskészlet ellenében tudja javítani.
- **Forrás** — `docs/specs/2026-09-11-author-id-repair.md:10`, `docs/specs/2026-09-11-author-id-repair-vegrehajtas.md:1`
- **Mi van kész** — Az eredeti AC10 teljesült #58-ban: két szerzőhívásból csak egy új, érvényes jelölt, 39/39 célzott teszt, hibás jelöltnél nulla mentés és kumulatív token. Terv 10., 15–20. sor.
- **Mi hiányzik** — Ugyanennek a megőrzött jelöltnek az éles publikációja és visszaolvasása külön utófeltétel maradt.
- **Folytatás helye** — `docs/specs/2026-09-11-author-id-repair.md:1` · #58
- **Következő lépés** — A korábbi próbajelöltet és a publikált lecke forráskészletét hasonlítsd össze, mielőtt új költséges szerzőhívást indítasz.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-270 · Tanulási termék – kiadási ellenőrzés

- **Azonosító** — R-TERV-270
- **Cím** — Tanulási termék – kiadási ellenőrzés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A játék és a lecke használhatósága mellett a késleltetett tanulási eredményt is mérni kell.
- **Forrás** — `docs/specs/2026-09-11-learning-product-evidence.md:1`, `docs/learning-pilot.md:12`
- **Mi van kész** — A terv 35–39. sora böngészős megjelenítési eredményeket rögzít. A pilot külön az azonnali és az egy hét múlva segítség nélkül felidézhető tudást kéri. docs/learning-pilot.md:3–12.
- **Mi hiányzik** — A 37. sor szerint akkor még nem volt résztvevős hatásvizsgálat. Az elérhető anyagból a későbbi mintanagyság és eredmény sem igazolható.
- **Folytatás helye** — `docs/specs/2026-09-11-learning-product-evidence.md:1` · #46
- **Következő lépés** — Keresd vissza a pilot összesített, személytelen eredményét. Ha nem készült mérés, a két időpontot és azonos feladatsort használó pilot marad a következő szelet.
- **Függőség / ütközés** — A mobil nézet emulációja és a tanulási hatás külön elfogadási pont.
- **Kapcsolódó P-tétel** — —

### R-TERV-274 · Új feltöltés éles átvétele

- **Azonosító** — R-TERV-274
- **Cím** — Új feltöltés éles átvétele
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Egy tényleges új feltöltéstől a közzétételen át a javított lecke visszaolvasásáig legyen folytonos bizonyíték.
- **Forrás** — `docs/specs/2026-09-12-upload-acceptance.md:9`, `docs/handoffs/2026-09-12-upload-acceptance.md:8`, `docs/specs/2026-09-12-upload-acceptance-vegrehajtas.md:9` és 1 további forrás a sormutatóban
- **Mi van kész** — A konkrét háromszöges szövegfájl kiválasztásáig eljutott az átvétel, de az eszköz blokkolta a feltöltést (docs/handoffs/2026-09-12-upload-acceptance.md:3–8). A webes ág elfogadása másik példával sikerült.
- **Mi hiányzik** — Ugyanahhoz a TXT-hez nincs teljes lánc újratöltéssel, 15/15 eredménnyel, négy felülettel, új javítójelölttel, mentéssel, alkalmazással és visszaolvasással.
- **Folytatás helye** — `docs/specs/2026-09-12-upload-acceptance.md:1` · #65
- **Következő lépés** — A konkrét mintához keresd vissza a későbbi normál feltöltést. Csak a nyugta hiányában tervezz engedélyezett új feltöltési próbát, és végig ugyanazt a publikált leckét kövesd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-276 · Continuous practice kiadas

- **Azonosító** — R-TERV-276
- **Cím** — Continuous practice kiadas
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Újratöltéskor a gyakorlás állapota maradjon meg, a tanuló folytathassa a kört.
- **Forrás** — `docs/specs/2026-09-14-continuous-practice-release.md:16`, `docs/specs/2026-09-14-continuous-practice-release-vegrehajtas.md:1`
- **Mi van kész** — A #67 merge-je 2eb52a19, a PR CI futása 34879035708. A kért 15/25-ös gyakorlás és annak tárolása helyben dokumentált.
- **Mi hiányzik** — Az adott merge-fej Production READY és a telepítés utáni 15/25-ös mobil görgetési próba nyugtája nem azonosítható. A terv 23. sora az előző kiadást igazolja.
- **Folytatás helye** — `docs/specs/2026-09-14-continuous-practice-release.md:1` · #67
- **Következő lépés** — A konkrét 2eb52a19 telepítési nyugtájához rendeld hozzá az éles mobilmérést. Más verzió READY jelzése ne zárja le az átvételt.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-277 · Spec: one-step lesson run finalization fix

- **Azonosító** — R-TERV-277
- **Cím** — Spec: one-step lesson run finalization fix
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Egyetlen hibás lépés lezárása után a gyártás ne maradjon határozatlan ideig folyamatban.
- **Forrás** — `docs/specs/2026-09-14-one-step-termination.md:40`, `docs/specs/2026-09-14-one-step-termination-vegrehajtas.md:34`
- **Mi van kész** — Van terminális állapotőr (source/server/studio/lesson-pipeline-routes.ts:235) és külön publikációs visszaolvasási hiba (:648–651). #68.
- **Mi hiányzik** — Ha a futás már done, de a lecke vagy a közzétett fájlazonosító hiányzik, a normál poll üres hivatkozással továbbra is done állapotot adhat (:315–321, :359, :598). Az E4 konkrét oka itt nem látható.
- **Folytatás helye** — `docs/specs/2026-09-14-one-step-termination.md:1`
- **Következő lépés** — Eldobható adatbázison hozz létre készre jelölt, publikált hivatkozás nélküli szintetikus futást. A normál állapotvégpont válaszában ellenőrizd a diagnosztikát, és őrizd meg a valódi sikeres done-választ is.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-280 · Spec: a főoldal tananyaglistája mobilon is magától frissüljön; könnyű váltás a tananyagok között

- **Azonosító** — R-TERV-280
- **Cím** — Spec: a főoldal tananyaglistája mobilon is magától frissüljön; könnyű váltás a tananyagok között
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A nyitóoldal a mentett tananyagokat a megfelelő sorrendben, friss állapotban mutassa.
- **Forrás** — `docs/specs/2026-09-20-home-list-refresh.md:22`
- **Mi van kész** — A lista frissítése és az előnézeti navigáció a source/client/src/lib/home-files-query.ts:13, :34 és source/client/src/pages/Preview.tsx:70 helyen van bekötve. #94 1345/1345 tesztet közöl.
- **Mi hiányzik** — A terv 24. sorának követelménye új publikáció megjelenése legfeljebb 60 másodperc alatt, továbbá oda-vissza szomszédváltás. A valós idejű utómérést nem azonosítottam.
- **Folytatás helye** — `docs/specs/2026-09-20-home-list-refresh.md:1` · #94
- **Következő lépés** — Azonos munkamenetben mérd meg a megjelenésig eltelt időt, és az új anyag mindkét szomszédját nyisd meg a tényleges felületről.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-285 · Tanári témafókusz az egylépéses Studio-gyártásban (2026-09-29)

- **Azonosító** — R-TERV-285
- **Cím** — Tanári témafókusz az egylépéses Studio-gyártásban (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár által kijelölt témát és résztémát a rendszer felismerje, megőrizze és észszerű időn belül feldolgozza.
- **Forrás** — `docs/specs/2026-09-29-tanari-temafokusz.md:24`, `docs/specs/2026-09-29-tanari-temafokusz-vegrehajtas.md:5`
- **Mi van kész** — A #132 régi motoron 1473/1473 tesztet rögzített. A #262 kivezette az eredeti témaszűrő útját.
- **Mi hiányzik** — A szűkebb tanári kérés végigviteléhez nincs az új motorhoz kötött teljes eredmény.
- **Folytatás helye** — `docs/specs/2026-09-29-tanari-temafokusz.md:1` · #132
- **Következő lépés** — Kövesd végig a #132 szűk témájú bemenetét a source/server/studio/single-run/engine.ts folyamatában. Ellenőrizd, hogy a publikált anyagban a kért téma az elsődleges.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-286 · Szökőár-szökés és Villám matek: több gondolkodási idő (2026-09-29)

- **Azonosító** — R-TERV-286
- **Cím** — Szökőár-szökés és Villám matek: több gondolkodási idő (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A kérdés elolvasására és megválaszolására a játék ténylegesen adjon elegendő időt.
- **Forrás** — `docs/specs/2026-09-29-tobb-gondolkodasi-ido.md:45`, `docs/specs/2026-09-29-tobb-gondolkodasi-ido-vegrehajtas.md:1`
- **Mi van kész** — A #135 eredeti időbővítését a source/tests/think-time.test.ts:16, :32 és source/tests/tsunami-think-time.test.ts:11 régi modulokon ellenőrzi. A mai kérdésablak hossz alapján számol (source/client/src/game-engine/play/questionDirector.ts:148, :198).
- **Mi hiányzik** — A tényleges játékban a 4,5 s-os alap és az olvasási idő együtt nem igazolja a korábbi összes évfolyamos minimumot. source/client/src/lib/speedMath/core.ts:62 és source/client/src/lib/tsunami/core.ts:197.
- **Folytatás helye** — `docs/specs/2026-09-29-tobb-gondolkodasi-ido.md:1` · #135
- **Következő lépés** — Mérd az aktív játék kérdésablakát rövid és hosszú kérdésen, évfolyamhatárokon. A régi modul tesztsikerét ne használd az új belépő bizonyítására.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-288 · Spec: Tanári kérés ellenőrzőlista-kapu (nem elakadó közzététel, 2. szelet)

- **Azonosító** — R-TERV-288
- **Cím** — Spec: Tanári kérés ellenőrzőlista-kapu (nem elakadó közzététel, 2. szelet)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár által megadott szempontokhoz legyen ellenőrizhető forráskötés és teljesítési eredmény.
- **Forrás** — `docs/specs/2026-09-30-tanari-ellenorzolista.md:39`, `docs/specs/2026-09-30-tanari-ellenorzolista-vegrehajtas.md:1`
- **Mi van kész** — A #152 korabeli eredménye 1777/1777 teszt. A további dokumentált próbák a #175-ben 13/13 és a #178-ban 11/11.
- **Mi hiányzik** — A korábbi instruction_missing jelzés, az egyszeri javítás és a megmaradt hiány megjelenítése együtt nincs igazolva a mai motoron.
- **Folytatás helye** — `docs/specs/2026-09-30-tanari-ellenorzolista.md:1` · #152
- **Következő lépés** — A source/server/studio/single-run/engine.ts feldolgozását vizsgáld hiányosan teljesített tanári listával. Hasonlítsd össze a hibalistát javítás előtt és után a #152 elfogadott eseteivel.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-289 · Témafókusz: késleltetés és félrevezető időtúllépés-napló (2026-09-30)

- **Azonosító** — R-TERV-289
- **Cím** — Témafókusz: késleltetés és félrevezető időtúllépés-napló (2026-09-30)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár által kijelölt témát és résztémát a rendszer felismerje, megőrizze és észszerű időn belül feldolgozza.
- **Forrás** — `docs/specs/2026-09-30-temafokusz-kesleltetes.md:42`, `docs/specs/2026-09-30-temafokusz-kesleltetes-vegrehajtas.md:1`
- **Mi van kész** — A korábbi pontos modellsorrend vagy lépésenkénti bővítés története: #148. A 2026-10-16-i tulajdonosi döntést a #262, d9e9c8e9 valósította meg (docs/specs/2026-10-16-egy-futas.md:3, :138, :147). A főági beszélgetés beállításai: source/server/studio/single-run/conversation.ts:22, :83, :118.
- **Mi hiányzik** — Az előző gyártási gép modell- vagy keretszerződése nem hatályos. A korabeli mérés és az új út teljesítménye külön kérdés.
- **Folytatás helye** — `docs/specs/2026-09-30-temafokusz-kesleltetes.md:1` · #148
- **Következő lépés** — Az új egyfutásos úton, a mai beállítással vesd össze az eredmény minőségét. A régi sorrend vagy külön alügynök visszaépítése nem következik a régi tervből.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-290 · Témafókusz — a résztéma-döntés pontosítása (2026-09-30)

- **Azonosító** — R-TERV-290
- **Cím** — Témafókusz — a résztéma-döntés pontosítása (2026-09-30)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár által kijelölt témát és résztémát a rendszer felismerje, megőrizze és észszerű időn belül feldolgozza.
- **Forrás** — `docs/specs/2026-09-30-temafokusz-resztema-dontes.md:26`, `docs/specs/2026-09-30-temafokusz-resztema-dontes-vegrehajtas.md:1`
- **Mi van kész** — A korábbi pontos modellsorrend vagy lépésenkénti bővítés története: #149. A 2026-10-16-i tulajdonosi döntést a #262, d9e9c8e9 valósította meg (docs/specs/2026-10-16-egy-futas.md:3, :138, :147). A főági beszélgetés beállításai: source/server/studio/single-run/conversation.ts:22, :83, :118.
- **Mi hiányzik** — Az előző gyártási gép modell- vagy keretszerződése nem hatályos. A korabeli mérés és az új út teljesítménye külön kérdés.
- **Folytatás helye** — `docs/specs/2026-09-30-temafokusz-resztema-dontes.md:1` · #149
- **Következő lépés** — Az új egyfutásos úton, a mai beállítással vesd össze az eredmény minőségét. A régi sorrend vagy külön alügynök visszaépítése nem következik a régi tervből.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-299 · S0 — Mérési alap a tudásbank-programhoz (2026-10-05)

- **Azonosító** — R-TERV-299
- **Cím** — S0 — Mérési alap a tudásbank-programhoz (2026-10-05)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás kiindulási sikerét, hibáit és költségét később összehasonlítható módon kell mérni.
- **Forrás** — `docs/specs/2026-10-05-s0-meresi-alap.md:22`, `docs/specs/2026-10-05-s0-meresi-alap-vegrehajtas.md:1`
- **Mi van kész** — A mérőszkript és a tesztje kivezetését a 6e997425 rögzíti. A megőrzött mérés #187 után 75 lezárt, 23 sikeres és 52 hibás futás (docs/measurements/2026-10-05-baseline.json:3, :7–9).
- **Mi hiányzik** — Az egyszeri mérés teljesült. A kivezetett lépésgép mérőjének állandó fenntartása nem a mai szerződés.
- **Folytatás helye** — `docs/specs/2026-10-05-s0-meresi-alap.md:1` · #187
- **Következő lépés** — A régi adatokat használhatod történeti bázisként. Új összevetés előtt az új gyártó eseményeiben ellenőrizd, mit számítasz lezárt és hibás futásnak.
- **Függőség / ütközés** — Az egyfutásos döntés 2026-10-16-i, #262.
- **Kapcsolódó P-tétel** — —

### R-TERV-302 · S8 — Tanulói eredményesség: tételenkénti helyes-arány a katalógusban (2026-10-06)

- **Azonosító** — R-TERV-302
- **Cím** — S8 — Tanulói eredményesség: tételenkénti helyes-arány a katalógusban (2026-10-06)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A katalógustételről a tényleges válaszok alapján meg lehessen mondani, mennyire eredményes.
- **Forrás** — `docs/specs/2026-10-06-s8-tanuloi-eredmenyesseg.md:98`, `docs/specs/2026-10-06-s8-tanuloi-eredmenyesseg-vegrehajtas.md:41`
- **Mi van kész** — #201 2132/2132 unit és 22/22 PostgreSQL-próbát ír le, kétszeri migrációval és párhuzamos lezárással. source/migrations/0023_catalog_item_outcomes.sql:4, source/tests/catalog-outcomes.test.ts:77 és source/server/catalog/admin-routes.ts:55.
- **Mi hiányzik** — A szerveroldali statisztika megléte megállapítható. A később igényelt admin-kliensnézetet ez nem igazolja (2026-11-10-gyartas-meres.md:110–113).
- **Folytatás helye** — `docs/specs/2026-10-06-s8-tanuloi-eredmenyesseg.md:1` · #201
- **Következő lépés** — Az adminútból kösd az eredménylistát a meglévő adatvégpontra, és szintetikus mintával ellenőrizd a nulla próbás és a vegyes eredményű tételeket.
- **Függőség / ütközés** — A régi sémát és a lezárási számlálót a kliensoldali igény miatt nem kell újratervezni.
- **Kapcsolódó P-tétel** — —

### R-TERV-303 · WebSuli saját ikon (robot) — terv

- **Azonosító** — R-TERV-303
- **Cím** — WebSuli saját ikon (robot) — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az asszisztenst jelölő ikon egyértelműen, megfelelő arculattal jelenjen meg.
- **Forrás** — `docs/specs/2026-10-13-robot-ikon.md:40`, `docs/specs/2026-10-13-robot-ikon-vegrehajtas.md:1`
- **Mi van kész** — #206 hét eszközt, manifestet és linkteszteket rögzít, 2207/2207 és vizuális ellenőrzés mellett. source/tests/app-icons.test.ts:36, :49, :68, :84.
- **Mi hiányzik** — Az új éles ikonok MIME-típusának és a linkek sikeres visszaolvasásának nyugtája nincs a javítás előtti szerverválaszban.
- **Folytatás helye** — `docs/specs/2026-10-13-robot-ikon.md:1` · #206
- **Következő lépés** — Az elfogadott verzióhoz rendelt telepítési nyugtában ellenőrizd az új favicon, PNG és manifest MIME-típusát, státuszát és linkcélját.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-305 · Elakadt gyártás folytatása a mentett részekből (2026-10-14)

- **Azonosító** — R-TERV-305
- **Cím** — Elakadt gyártás folytatása a mentett részekből (2026-10-14)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A már elkészült munkát ne kelljen elölről legyártani a folytatáshoz.
- **Forrás** — `docs/specs/2026-10-14-folytatas-mentett-reszekbol.md:68`, `docs/specs/2026-10-14-folytatas-mentett-reszekbol-vegrehajtas.md:5`
- **Mi van kész** — Az eredeti szerződés #215-ben lezárult: 2247/2247, 4/4 Chrome, egyszeri kérés három méreten. Az október 16-i döntés (#262, #263) a mentett egyfutásos állomásból folytat. source/server/studio/single-run/engine.ts:482, :615, :829.
- **Mi hiányzik** — A régi lépésszámokhoz és hibatípusokhoz kötött E1–E3 nem a mai út elfogadása.
- **Folytatás helye** — `docs/specs/2026-10-14-folytatas-mentett-reszekbol.md:1` · #215
- **Következő lépés** — Az új út mentési és folytatási feltételeit a jelenlegi állomásokból ellenőrizd, és a régi leckeadat megőrzését külön kövesd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-309 · Bővülő szinonimaszótár (válaszbank) — mérés terve (2026-10-16)

- **Azonosító** — R-TERV-309
- **Cím** — Bővülő szinonimaszótár (válaszbank) — mérés terve (2026-10-16)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Mérés döntse el, átvihetők-e haszonnal az elfogadott rokon értelmű válaszok másik leckére.
- **Forrás** — `docs/specs/2026-10-16-szinonimaszotar-meres.md:40`, `docs/specs/2026-10-16-szinonimaszotar-meres-vegrehajtas.md:1`
- **Mi van kész** — Az azonos tárgyú, külön leckék közötti átvitel mintája szűk. A terv 61–76. sora 5,4%-os becsült megtakarítást közöl a kívánt 15% helyett.
- **Mi hiányzik** — A tantárgyak közötti és a tantárgyon belüli átvitel külön megbízható becslése hiányzik.
- **Folytatás helye** — `docs/specs/2026-10-16-szinonimaszotar-meres.md:1` · #254
- **Következő lépés** — Azonos tárgyból 5–10 meglévő futás után ismételd meg a páros összevetést a source/scripts/measure/synonym-bank-trial.mts mérővel.
- **Függőség / ütközés** — A termékbe építés feltételes volt. A mérés eredménye előtt ne vezesd be a szótárt.
- **Kapcsolódó P-tétel** — —

### R-TERV-315 · Tananyaglista a NAT 2020 tanítási menetrendje szerint — terv

- **Azonosító** — R-TERV-315
- **Cím** — Tananyaglista a NAT 2020 tanítási menetrendje szerint — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tananyagok témájuk és évfolyamuk szerint a tanmenet megfelelő sorrendjében jelenjenek meg.
- **Forrás** — `docs/specs/2026-10-17-tanmenet-rendezes.md:67`, `docs/specs/2026-10-17-tanmenet-rendezes-vegrehajtas.md:1`
- **Mi van kész** — A sorrend és a szünet működését a #282 (939b3887), a source/tests/curriculum-order.spec.ts és a source/tests/curriculum.test.ts:24 fedik le. 135/208 illesztés 65%, a későbbi 9c67a926 után 149/209.
- **Mi hiányzik** — A szúrópróba a mennyiségi cél mellett hibás szemantikai egyezést is jelzett. Nincs mindkét feltételt lezáró ellenőrzés.
- **Folytatás helye** — `docs/specs/2026-10-17-tanmenet-rendezes.md:1` · #282
- **Következő lépés** — Tedd a megtévesztően hasonló szófaj- és mondattani címeket ellenpéldaként az illesztési próbába. A javítás után a megfelelő lefedettséget és a minta helyességét is rögzítsd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-317 · Websuli képkészlet — MI-generált, kurált saját képek — terv

- **Azonosító** — R-TERV-317
- **Cím** — Websuli képkészlet — MI-generált, kurált saját képek — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A felület jóváhagyott képei a megfelelő helyen és méretben jelenjenek meg.
- **Forrás** — `docs/specs/2026-10-17-websuli-kepkeszlet.md:70`, `docs/specs/2026-10-17-websuli-kepkeszlet-vegrehajtas.md:1`
- **Mi van kész** — #273: 36 jóváhagyott saját WebP, mintegy 1,5 MB, 2045/2045. Az eszköz- és eredetpróbák source/tests/design-assets.test.ts:30, :46.
- **Mi hiányzik** — A terv 70. sora a seed mentését is kéri. A napló, a jóváhagyás és a főági séma csak a modellre, promptlenyomatra és költségre ad igazolást (source/scripts/design-assets/generate.ts:115, source/scripts/design-assets/approve.ts:51–52 és source/shared/design-assets.ts:21–24).
- **Folytatás helye** — `docs/specs/2026-10-17-websuli-kepkeszlet.md:1` · #273
- **Következő lépés** — Ha a szolgáltató ad seedet, őrizd meg a gyártástól a jóváhagyott metaadatig. A hiányzó seed kezelése is legyen kifejezett és tesztelt.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-320 · Régi anyag eredménye: ne vesszen el a gyors visszalépésnél — terv

- **Azonosító** — R-TERV-320
- **Cím** — Régi anyag eredménye: ne vesszen el a gyors visszalépésnél — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A régi formátumú tananyag használata is adjon visszakövethető eredményt.
- **Forrás** — `docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md:41`, `docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal-vegrehajtas.md:1`
- **Mi van kész** — #300, 2122/2122, hat valódi böngészőeset a három eredeti EARS-hoz. source/tests/material-result-capture.spec.ts:43, :115, :144. Az éles mobilos utókövetés külön kérés.
- **Mi hiányzik** — A funkció igazolt. A külön végrehajtásban előírt, még visszakeresendő nyugta: a tényleges mobilos eredményküldés elfogott válasza (végrehajtás 43–44).
- **Folytatás helye** — `docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md:1` · #300
- **Következő lépés** — Az elfogadott fejhez és a megjelölt belépőhöz rendeld az eredeti, személytelenített futási eredményt. Új termékmódosítást csak kimutatott eltérés indokol.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-346 · Az ellenőrzés-állomás effort-A/B mérése (kanban 5)

- **Azonosító** — R-TERV-346
- **Cím** — Az ellenőrzés-állomás effort-A/B mérése (kanban 5)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Azonos feladatokon mért megtakarítás és minőség döntse el, megváltozhat-e az ellenőrző szerep beállítása.
- **Forrás** — `docs/specs/2026-11-02-ellenorzes-effort-ab.md:70`, `docs/specs/2026-11-02-ellenorzes-effort-ab-vegrehajtas.md:1`
- **Mi van kész** — Az 5+5 futás 39,7% megtakarítást mért a 40%-os váltási küszöb mellett, ezért maradt a medium (terv 44., 54., 65. sor, source/tests/check-effort.test.ts:29).
- **Mi hiányzik** — Az összesítésből nem állítható vissza az E3 minden egyes párjának aránya és körszáma.
- **Folytatás helye** — `docs/specs/2026-11-02-ellenorzes-effort-ab.md:1` · #5
- **Következő lépés** — Az eredeti mérésekből készíts személytelen páronkénti táblát. A küszöb alatti megtakarítás miatt a modellbeállítás módosítása nem feladat.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-347 · Görög dráma borító a 9–10. sávnak

- **Azonosító** — R-TERV-347
- **Cím** — Görög dráma borító a 9–10. sávnak
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az irodalmi témájú tananyagot a hozzá illő borító azonosítsa.
- **Forrás** — `docs/specs/2026-11-02-irodalmi-borito.md:32`, `docs/specs/2026-11-02-irodalmi-borito-vegrehajtas.md:5`
- **Mi van kész** — A #377 és source/tests/cover-gorog-drama.test.ts:11, :18 a görög dráma borítóválasztását vizsgálja.
- **Mi hiányzik** — A terv 36. sorában kért konkrét képazonosító és az ismételt mentés után kiszolgált kép egyezése nincs igazolva.
- **Folytatás helye** — `docs/specs/2026-11-02-irodalmi-borito.md:1` · #377
- **Következő lépés** — A borítóteszt bemenetével mentsd újra a mintát, majd a visszaolvasott képazonosítót hasonlítsd össze az elfogadott képpel.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-349 · Lecke-javítás alkalmazása: hamis „eltér a jelölttől” hiba borítóváltáskor

- **Azonosító** — R-TERV-349
- **Cím** — Lecke-javítás alkalmazása: hamis „eltér a jelölttől” hiba borítóváltáskor
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tárolt állapot és a hozzáférés helyességét érinti.
- **Eredeti utasítás / cél** — Alkalmazás után lehessen ellenőrizni, hogy a tárolt tananyag pontosan a jóváhagyott változat.
- **Forrás** — `docs/specs/2026-11-03-apply-visszaolvasas.md:12`, `docs/specs/2026-11-03-apply-visszaolvasas-vegrehajtas.md:5`
- **Mi van kész** — A visszaolvasás minden algoritmikus esete megvan (source/server/workflows/apply.ts:21, :54 és source/tests/apply-readback.test.ts:11, :15, :20, :24, :31).
- **Mi hiányzik** — A végrehajtásban külön kért éles admin-alkalmazás sikerének nyugtája nincs azonosítva.
- **Folytatás helye** — `docs/specs/2026-11-03-apply-visszaolvasas.md:1` · #378
- **Következő lépés** — Egy már engedélyezetten alkalmazott jelölt műveleti naplójában vesd össze az alkalmazás előtti lenyomatot és a tárolt eredmény visszaolvasását.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-353 · A vak hibakereső ellenőr futtató gépe — független, olcsó modell (DeepSeek, OpenRouter)

- **Azonosító** — R-TERV-353
- **Cím** — A vak hibakereső ellenőr futtató gépe — független, olcsó modell (DeepSeek, OpenRouter)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A vak hibakereső ellenőr futtató gépe.
- **Forrás** — `c31164815:docs/specs/2026-11-18-vak-ellenor-deepseek.md:147`, `679c23e40:docs/specs/2026-11-18-vak-ellenor-deepseek-vegrehajtas.md:37`, `4c7061b34:docs/handoffs/2026-11-18-vak-ellenor-futtato-retro.md:40`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `c31164815:scripts/qa/gates/record-review.mjs:33` és `c31164815:scripts/qa/gates/blind-review/rules-guard.test.mjs:16`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `chore/vak-ellenor-deepseek` (c31164815)
- **Következő lépés** — A(z) `chore/vak-ellenor-deepseek` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-043 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-043

### R-TERV-354 · Korábbi automatikus ellenőr kivezetése

- **Azonosító** — R-TERV-354
- **Cím** — Korábbi automatikus ellenőr kivezetése
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A korábbi automatikus ellenőrző kivezetése után a régi bekötések és hivatkozások is kerüljenek ki a kiadási folyamatból.
- **Forrás** — `903138925:Git-objektum 1407e36879a4:85`, `903138925:Git-objektum 87a614c851a8:90`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `58e3054d4:.github/workflows/auto-review.yml:1` és `58e3054d4:source/tests/auto-review-workflow-guard.test.ts:73`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `58e3054d4a` (58e3054d4) · #522 OPEN
- **Következő lépés** — A(z) `58e3054d4a` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-048 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-048

### R-TERV-355 · Hang-előmelegítés — a menet közbeni 1–2 mp-es megakadás megszüntetése minden játékban

- **Azonosító** — R-TERV-355
- **Cím** — Hang-előmelegítés — a menet közbeni 1–2 mp-es megakadás megszüntetése minden játékban
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Hang-előmelegítés — a menet közbeni 1–2 mp-es megakadás megszüntetése minden játékban.
- **Forrás** — `f9e715932:docs/specs/2026-11-19-hang-elomelegites.md:55`, `f9e715932:docs/specs/2026-11-19-hang-elomelegites-vegrehajtas.md:1`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `fe2916155:source/client/src/lib/audioEngine.ts:89` és `fe2916155:source/tests/audio-engine-prewarm-hook.test.ts:110`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/hang-elomelegites` (fe2916155)
- **Következő lépés** — A(z) `fix/hang-elomelegites` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-040 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-040

### R-TERV-357 · LS-5 — Visszacsatolási kör: fogalmak, javítás, játék-kvíz export

- **Azonosító** — R-TERV-357
- **Cím** — LS-5 — Visszacsatolási kör: fogalmak, javítás, játék-kvíz export
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A fogalmonkénti eredmény legyen áttekinthető, és a gyenge fogalom célzottan javítható legyen.
- **Forrás** — `docs/ls-5-visszacsatolas-hasznalat.md:41`
- **Mi van kész** — Az admin panel a fogalomstatisztika lekérését, a javítást és exportot is eléri (source/client/src/components/studio/FeedbackPanel.tsx:49, :59, :80, :137). #10 adatforrást, #12 tanári felületet, #15 szülői leckeszintű eredményt hozott.
- **Mi hiányzik** — A fogalmonkénti eredmény nincs a szülői összesítőbe és heti levélbe kötve. A forrás és a képernyő: source/server/lib/parent-dashboard.ts:71 és source/client/src/components/ParentDashboardPanel.tsx:38, :176.
- **Folytatás helye** — `docs/ls-5-visszacsatolas-hasznalat.md:1`
- **Következő lépés** — Szintetikus tanuló két eltérő fogalomeredményével kösd össze az összesítőt, a szülői nézetet és a heti levelet. Ellenőrizd az idegen tanulóhoz tartozó adatok elutasítását.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-368 · Szerzőmodell: GPT-6 Luna elsődleges, GPT-5.6 Terra tartalék (2026-09-29)

- **Azonosító** — R-TERV-368
- **Cím** — Szerzőmodell: GPT-6 Luna elsődleges, GPT-5.6 Terra tartalék (2026-09-29)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szerzői szerephez a döntés szerinti modell és mérhető hívási elszámolás tartozzon.
- **Forrás** — `docs/specs/2026-09-29-szerzomodell-gpt6-luna.md:42`, `docs/specs/2026-09-29-szerzomodell-gpt6-luna-vegrehajtas.md:5`
- **Mi van kész** — A korábbi pontos modellsorrend vagy lépésenkénti bővítés története: #131. A 2026-10-16-i tulajdonosi döntést a #262, d9e9c8e9 valósította meg (docs/specs/2026-10-16-egy-futas.md:3, :138, :147). A főági beszélgetés beállításai: source/server/studio/single-run/conversation.ts:22, :83, :118.
- **Mi hiányzik** — Az előző gyártási gép modell- vagy keretszerződése nem hatályos. A korabeli mérés és az új út teljesítménye külön kérdés.
- **Folytatás helye** — `docs/specs/2026-09-29-szerzomodell-gpt6-luna.md:1` · #131
- **Következő lépés** — Az új egyfutásos úton, a mai beállítással vesd össze az eredmény minőségét. A régi sorrend vagy külön alügynök visszaépítése nem következik a régi tervből.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-369 · Spec: Bankcsomag-mentés és modellhiba-tűrés (nem elakadó közzététel, 3–4. szelet)

- **Azonosító** — R-TERV-369
- **Cím** — Spec: Bankcsomag-mentés és modellhiba-tűrés (nem elakadó közzététel, 3–4. szelet)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Érvénytelen részválaszból csak az ellenőrzötten használható bankrész kerüljön tovább.
- **Forrás** — `docs/specs/2026-09-30-bank-mentes-modelltures.md:22`, `docs/specs/2026-09-30-bank-mentes-modelltures-vegrehajtas.md:1`
- **Mi van kész** — A hibás banktételekből történő részleges mentés ma is működési út (source/server/studio/experience-builder.ts:408, :803 és source/tests/bank-salvage.test.ts:17). #153 dokumentálta a korábbi szerződést.
- **Mi hiányzik** — A korábbi többmodelletes pedagógus- és lektorfallbacket #262 váltotta fel. Az új út hibakimenete külön igazolandó.
- **Folytatás helye** — `docs/specs/2026-09-30-bank-mentes-modelltures.md:1` · #153
- **Következő lépés** — A mai provider megszakítását szimulálva ellenőrizd a megtartott és újrakért banktételeket. A régi modellcsaládok visszaállítása nem feltétel.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-370 · Forrásgyűjtés több oldalra + bankban maradó tananyag-hivatkozás (2026-10-01)

- **Azonosító** — R-TERV-370
- **Cím** — Forrásgyűjtés több oldalra + bankban maradó tananyag-hivatkozás (2026-10-01)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A webes forrás és a hozzá kötött bank-visszajelzés útja legyen követhető.
- **Forrás** — `docs/specs/2026-10-01-forrasgyujtes-es-bank-hivatkozas.md:5`, `docs/specs/2026-10-01-forrasgyujtes-es-bank-hivatkozas-vegrehajtas.md:1`
- **Mi van kész** — A 05df41eb és a #176 a forrásgyűjtés oldalát igazolja. A mai megvalósítás source/server/studio/web-research-agent.ts:45, :126, :131, a próbapont source/tests/web-research-agent.test.ts:66.
- **Mi hiányzik** — A bankhivatkozáshoz tartozó semleges visszajelzés régi útjának mai megfelelője nincs végig igazolva.
- **Folytatás helye** — `docs/specs/2026-10-01-forrasgyujtes-es-bank-hivatkozas.md:1` · #176
- **Következő lépés** — Az első feltételhez tartsd meg a webes forrásgyűjtési próbát. A másodikhoz a terv bankpéldájával kövesd a hivatkozást a megjelenő tanulói visszajelzésig.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-381 · Végrehajtási utasítás — Tételgyár T1: 130%-os túltermelés, kivétel javítás helyett

- **Azonosító** — R-TERV-381
- **Cím** — Végrehajtási utasítás — Tételgyár T1: 130%-os túltermelés, kivétel javítás helyett
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-t1-tultermeles-vegrehajtas.md:1`
- **Mi van kész** — A fejezetminimum és legalább 30% többlet a source/shared/lesson-bank-plan.ts:25, :34 helyen van. #226, 2315/2315; a szélső egységszámot #229 kezeli.
- **Mi hiányzik** — T1.3 a kiadás utáni csomagonkénti mentést, kivételt, darabszámot és bank-tokenköltséget kéri. A #230 visszajátszása még a régi 107%-os bankkal történt.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-t1-tultermeles-vegrehajtas.md:1` · #226
- **Következő lépés** — Az első bizonyítottan új banktervű futás csomagonkénti nyugtáját keresd ki, és a korábbi méréshez azonos mértékegységben hasonlítsd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-383 · Tételgyár T3: rubrikafordító — terv és T3.0 mérés (2026-10-15)

- **Azonosító** — R-TERV-383
- **Cím** — Tételgyár T3: rubrikafordító — terv és T3.0 mérés (2026-10-15)
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md:67`, `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito-vegrehajtas.md:1`
- **Mi van kész** — 2026-10-15-én a tulajdonos lezárta a mért próbát termékkód nélkül és a parafrázis kezelését a T7 döntőbíróra bízta (terv 70–73).
- **Mi hiányzik** — A régi termékkód-kérés megszűnt. A döntőbíró használatának és késleltetésének visszamérése külön feltételes feladat.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md:1` · #252
- **Következő lépés** — A T7 méréseinél vedd elő a terv 73. sorát. A korábbi fordító implementálása előtt új tulajdonosi döntés szükséges.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-389 · Párhuzamos gyakorlóbank az egyfutásos gyártásban — terv

- **Azonosító** — R-TERV-389
- **Cím** — Párhuzamos gyakorlóbank az egyfutásos gyártásban — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Az egymástól független bankrészek gyorsabban készüljenek el a minőségi kapuk megtartásával.
- **Forrás** — `docs/specs/2026-10-16-parhuzamos-bank.md:37`, `docs/specs/2026-10-16-parhuzamos-bank-vegrehajtas.md:1`
- **Mi van kész** — A párhuzamossági korlátot és az egyesével futó utat a #265, 2017/2017 és a sorosra visszaállított ellenpróba igazolja. source/server/studio/single-run/engine.ts:63, :72, :828, :884. A teljes falióra 1898 → 1022 s.
- **Mi hiányzik** — Az eredeti kritérium külön a bank fali idejét kéri 771 s alatt. Az összegzett hívási idő 771 → 856 s, ez más mérő (terv 41., 48–57. sor).
- **Folytatás helye** — `docs/specs/2026-10-16-parhuzamos-bank.md:1` · #265
- **Következő lépés** — Az azonos forráson a legelső bankhívástól az utolsó mentett bankegységig mérd az eltelt időt. A párhuzamos hívások időtartamait ne add össze ennél a feltételnél.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-401 · Spec: a lecke-javítás ne rontsa a gyakorlóbankot

- **Azonosító** — R-TERV-401
- **Cím** — Spec: a lecke-javítás ne rontsa a gyakorlóbankot
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Javításkor a már jó gyakorlóbank tartalma ne vesszen el.
- **Forrás** — `docs/specs/2026-11-03-javitas-bank-megorzes.md:36`, `docs/specs/2026-11-03-javitas-bank-megorzes-vegrehajtas.md:13`
- **Mi van kész** — A meglévő feladatbank javításkori átvételét a source/tests/repair-bank-reuse.test.ts:26 vizsgálja.
- **Mi hiányzik** — A terv 111–115. sorának régi, harmadik verziójú anyagára nem találtam a bankazonosságot igazoló alkalmazás utáni visszaolvasást.
- **Folytatás helye** — `docs/specs/2026-11-03-javitas-bank-megorzes.md:1` · #379
- **Következő lépés** — A régi verzió személyes adat nélküli megfelelőjén hasonlítsd össze a feladatok azonosítóit javítás előtt, a javítási eredményben és a visszaolvasott anyagban.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-402 · Spec: a nyílt feladat pontozója ismerje fel a magyar szóalakokat

- **Azonosító** — R-TERV-402
- **Cím** — Spec: a nyílt feladat pontozója ismerje fel a magyar szóalakokat
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A tanuló válaszát tartalma és nyelvtani jelentése szerint értékelje a közös pontozó.
- **Forrás** — `docs/specs/2026-11-03-pontozo-szoalak.md:72`, `docs/specs/2026-11-03-pontozo-szoalak-vegrehajtas.md:5`
- **Mi van kész** — Az fff64cdb commit vakmintán dokumentálja a helyes és helytelen válaszok eredményeit. source/tests/score-word-forms.test.ts:13, :26.
- **Mi hiányzik** — A végleges #380 változat vak nyers mérésének megismétléséhez szükséges adatsor nem igazolt (terv 126–132).
- **Folytatás helye** — `docs/specs/2026-11-03-pontozo-szoalak.md:1` · #380
- **Következő lépés** — A ténylegesen elfogadott revízióhoz párosítsd az anonimizált mérőanyag lenyomatát és az összesített hibamátrixot. A megmaradt funkcionális teszteket külön kezeld.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-406 · Pontozó: polinom után álló pontsor / „…”, és két számeredmény műveleti jel után (121, 122)

- **Azonosító** — R-TERV-406
- **Cím** — Pontozó: polinom után álló pontsor / „…”, és két számeredmény műveleti jel után (121, 122)
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A tanuló válaszát tartalma és nyelvtani jelentése szerint értékelje a közös pontozó.
- **Forrás** — `63bc94a43:docs/specs/2026-11-20-pontozo-polinom-ket-szam.md:62`, `63bc94a43:docs/specs/2026-11-20-pontozo-polinom-ket-szam-vegrehajtas.md:10`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `63bc94a43:source/shared/answer-value.ts:224` és `63bc94a43:source/tests/scorer-corpus.test.ts:55`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `fix/pontozo-polinom-ket-szam` (63bc94a43)
- **Következő lépés** — A(z) `fix/pontozo-polinom-ket-szam` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-027 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-027

### R-TERV-011 · A hero CTA-gombok érintőfelülete: 46 px — terv (2026-10-15)

- **Azonosító** — R-TERV-011
- **Cím** — A hero CTA-gombok érintőfelülete: 46 px — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A főoldal cselekvésre szolgáló gombjai telefonon is kényelmesen megérinthetők legyenek.
- **Forrás** — `docs/specs/2026-10-15-hero-cta-46px.md:14`, `docs/specs/2026-10-15-hero-cta-46px-vegrehajtas.md:1`
- **Mi van kész** — A négy CTA a közös 46 px-es CSS-t használja (source/client/src/components/HeroSection.tsx:102, :111, :124, :131 és source/client/src/index.css:1466–1472), #240. source/tests/websuli.spec.ts:89, :108–122 két fő gombot és a vízszintes túlcsordulást ellenőrzi.
- **Mi hiányzik** — Mind a négy gomb váratlan sortörésére nincs külön azonosított mérés.
- **Folytatás helye** — `docs/specs/2026-10-15-hero-cta-46px.md:1` · #240
- **Következő lépés** — A tervben megadott nézeteken mind a négy gomb szövegének sorait és tényleges befoglaló téglalapját ellenőrizd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-013 · Websuli arculati bank — végrehajtási utasítás (AI-ügynöknek), S2–S3: blokkjelzők, fejezetdíszek, kabalapózok

- **Azonosító** — R-TERV-013
- **Cím** — Websuli arculati bank — végrehajtási utasítás (AI-ügynöknek), S2–S3: blokkjelzők, fejezetdíszek, kabalapózok
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A tananyagokhoz jóváhagyott, témához illő kép tartozzon, a régi tartalom megőrzése mellett.
- **Forrás** — `docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md:1`
- **Mi van kész** — #279: harminc jelző, tíz dísz és hat póz, 2062/2062 unit, 18/18 és 10/10 böngészőeset. source/shared/block-art.ts:14, :16, :18 és source/tests/block-art.test.ts:23.
- **Mi hiányzik** — A végrehajtás 26. sora 24 px-es blokkjelzőt kér, a főági komponens és stílus 22 px-et használ (source/client/src/lesson-runtime/BlockArt.tsx:27 és source/client/src/lesson-runtime/lesson-design.css:257).
- **Folytatás helye** — `docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md:1` · #279
- **Következő lépés** — A 24 px-es elfogadási pontot egyeztesd a mai képpel. Jóváhagyott eltérés hiányában a komponens és stílus azonos értékét teszteld a ténylegesen renderelt jelzőn.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-029 · Spec: A Websuli makija a főoldalon — animált ajánló a három legújabb tananyaghoz

- **Azonosító** — R-TERV-029
- **Cím** — Spec: A Websuli makija a főoldalon — animált ajánló a három legújabb tananyaghoz
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A kezdőoldal a tervben megjelölt nézetben gyorsan és használható állapotban jelenjen meg.
- **Forrás** — `a8354f22a:docs/specs/2026-11-18-kabala-fooldal.md:75`, `69216bd09:docs/specs/2026-11-18-kabala-fooldal-vegrehajtas.md:10`, `80f4c6cc3:docs/kabala-fooldal.md:3`
- **Mi van kész** — A rögzített ágban a főágétól eltérő implementáció és hozzá tartozó próba olvasható: `80f4c6cc3:source/scripts/blender/kabala-fooldal/build.mjs:40` és `80f4c6cc3:source/tests/home-mascot.spec.ts:112`.
- **Mi hiányzik** — A módosított eset főági bekötése és a jelenlegi fejhez tartozó integrációs bizonyíték hiányzik.
- **Folytatás helye** — `feat/kabala-fooldal` (80f4c6cc3)
- **Következő lépés** — A(z) `feat/kabala-fooldal` ágon a megjelölt ági teszt feltételét a főág ugyanazon belépési pontjával hasonlítsd össze, majd a P-007 nyitott elfogadási feltétele szerint folytasd.
- **Függőség / ütközés** — A „kész” itt az ág implementációjára vonatkozik. A PR állapota és a kiadási feltétel külön adat.
- **Kapcsolódó P-tétel** — P-007

### R-TERV-030 · Kabala-maki — a Websuli 3D kabalafigurája (kísérlet, terv)

- **Azonosító** — R-TERV-030
- **Cím** — Kabala-maki — a Websuli 3D kabalafigurája (kísérlet, terv)
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. Kényelmi vagy karbantartási javítás.
- **Eredeti utasítás / cél** — A kabala animált, megnyitható modelljéről mérhető kísérlet készüljön.
- **Forrás** — `bc3196e09:docs/specs/2026-11-18-kabala-maki.md:66`, `bc3196e09:docs/specs/2026-11-18-kabala-maki-vegrehajtas.md:4`, `bc3196e09:docs/kabala-maki.md:3`
- **Mi van kész** — Ági kód- vagy teszteltérés a főághoz képest: `bc3196e09:source/scripts/blender/kabala-maki/build.py:33`; `bc3196e09:source/tests/kabala-model-budget-guard.test.ts:59`.
- **Mi hiányzik** — A kísérleti modell és animáció megvan az ágon, főoldali kiadásához külön jóváhagyott integráció kell.
- **Folytatás helye** — `kiserlet/kabala-maki` (bc3196e09)
- **Következő lépés** — Mérd az eszköz keretét, majd ugyanazzal a GLB-vel a nyugalmi és az örömmozdulatot a főoldali helyen. A kísérletet külön vezesd a kibocsátástól.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-007

## További tervcsaládok és visszakeresendő átvételi bizonyítékok

### R-TERV-002 · Dokumentáció-, memória-, skill- és fájlhigiénia

- **Azonosító** — R-TERV-002
- **Cím** — Dokumentáció-, memória-, skill- és fájlhigiénia
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint.
- **Eredeti utasítás / cél** — Dokumentáció-, memória-, skill- és fájlhigiénia.
- **Forrás** — `docs/specs/2026-09-13-documentation-memory-hygiene.md:44`, `docs/specs/2026-09-13-documentation-memory-hygiene-vegrehajtas.md:32`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `add-mcp-config.ps1:1`. Történeti kapcsolat: #65 · c1e463ee. Rögzített eredmény: `docs/specs/2026-09-13-documentation-memory-hygiene.md:48`. A korabeli mérés a #65 leírásának 21. sorában található.
- **Mi hiányzik** — Még ellenőrizendő: WHEN az admin runtime API admin nélkül érhető el THEN a dokumentum 401-et ad, és a handoff ezt NOT RUN/BLOCKED állapotként jelöli. `docs/specs/2026-09-13-documentation-memory-hygiene.md:47`.
- **Folytatás helye** — `docs/specs/2026-09-13-documentation-memory-hygiene.md:1` · #65
- **Következő lépés** — A `add-mcp-config.ps1:1` útján kövesd a feltételt. Elsőként a `docs/specs/2026-09-13-documentation-memory-hygiene.md:47` bemenetét és elvárt eredményét egyeztesd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-005 · Terv — valódi e-mail-címek eltávolítása a nyilvános repóból + a 462 review N2–N4 lelete

- **Azonosító** — R-TERV-005
- **Cím** — Terv — valódi e-mail-címek eltávolítása a nyilvános repóból + a 462 review N2–N4 lelete
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. A hozzáférés vagy az adatvédelem közvetlenül érintett.
- **Eredeti utasítás / cél** — A nyilvános forrásban ne szerepeljen személyhez köthető cím, és a regressziót próba szűrje ki.
- **Forrás** — `docs/specs/2026-11-16-valodi-cimek-ki.md:79`, `docs/specs/2026-11-16-valodi-cimek-ki-vegrehajtas.md:9`
- **Mi van kész** — A `displayHandle` főági megvalósítását (`source/server/lib/display-handle.ts:14`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/jm0-privacy-guards.test.ts:58`). A korabeli mérés helye a #462 leírásának 59. sora (360 / 390).
- **Mi hiányzik** — Még ellenőrizendő: 7 hely kitisztítva, git grep 0. `docs/specs/2026-11-16-valodi-cimek-ki.md:91`.
- **Folytatás helye** — `docs/specs/2026-11-16-valodi-cimek-ki.md:1` · #462
- **Következő lépés** — A `displayHandle` bemenetétől (`source/server/lib/display-handle.ts:14`) kövesd az eredményt a `source/tests/jm0-privacy-guards.test.ts:58` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-023

### R-TERV-232 · Elavult internetes tananyag minőségjelzése

- **Azonosító** — R-TERV-232
- **Cím** — Elavult internetes tananyag minőségjelzése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint.
- **Eredeti utasítás / cél** — Elavult internetes tananyag minőségjelzése.
- **Forrás** — `docs/specs/2026-09-13-stale-web-lesson-quality-gate.md:44`, `docs/specs/2026-09-13-stale-web-lesson-quality-gate-vegrehajtas.md:19`
- **Mi van kész** — A `prependWebLessonQualityNotice` főági megvalósítását (`source/server/lib/web-lesson-quality-notice.ts:71`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/html-lesson-quality.browser.ts:34`). A korabeli mérés helye a #64 leírásának 13. sora (17/34, 5/10).
- **Mi hiányzik** — Még ellenőrizendő: munkamenet nincs, a tényleges új Trója-generálás NOT RUN, és ezt a záró. `docs/specs/2026-09-13-stale-web-lesson-quality-gate-vegrehajtas.md:19`.
- **Folytatás helye** — `docs/specs/2026-09-13-stale-web-lesson-quality-gate.md:1` · #64
- **Következő lépés** — A `prependWebLessonQualityNotice` bemenetétől (`source/server/lib/web-lesson-quality-notice.ts:71`) kövesd az eredményt a `source/tests/html-lesson-quality.browser.ts:34` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-300 · S10 — Adatvesztés-mentesség: streamelt modellhívás és automatikus folytatás (tulajdonosi kérés, 2026-10-05)

- **Azonosító** — R-TERV-300
- **Cím** — S10 — Adatvesztés-mentesség: streamelt modellhívás és automatikus folytatás (tulajdonosi kérés, 2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A tárolt állapot és a hozzáférés helyességét érinti.
- **Eredeti utasítás / cél** — Egy szolgáltatói megszakítás vagy újraindulás miatt a kész részek és az elszámolt munka ne vesszen el.
- **Forrás** — `docs/specs/2026-10-05-s10-adatvesztes-mentesseg.md:34`, `docs/specs/2026-10-05-s10-adatvesztes-mentesseg-vegrehajtas.md:1`
- **Mi van kész** — A `OpenRouterProvider` főági megvalósítását (`source/server/ai/OpenRouterProvider.ts:66`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/stream-collect.test.ts:68`). A korabeli mérés helye a #191 leírásának 7. sora (10/2).
- **Mi hiányzik** — Még ellenőrizendő: HA a modell lassan, de folyamatosan generál, AKKOR a hívás nem bukik el teljes-válasz korláton. `docs/specs/2026-10-05-s10-adatvesztes-mentesseg.md:34`.
- **Folytatás helye** — `docs/specs/2026-10-05-s10-adatvesztes-mentesseg.md:1` · #191
- **Következő lépés** — A `OpenRouterProvider` bemenetétől (`source/server/ai/OpenRouterProvider.ts:66`) kövesd az eredményt a `source/tests/stream-collect.test.ts:68` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-020 · Mai felfedezés” — napi, érdeklődés szerinti hírlevél a saját gyerekeknek

- **Azonosító** — R-TERV-020
- **Cím** — Mai felfedezés” — napi, érdeklődés szerinti hírlevél a saját gyerekeknek
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek.
- **Eredeti utasítás / cél** — A hírlevélhez a címzetthez illő, ellenőrizhető tartalom és küldési út tartozzon.
- **Forrás** — `docs/specs/2026-10-19-mai-felfedezes-hirlevel.md:50`, `docs/specs/2026-10-19-mai-felfedezes-hirlevel-vegrehajtas.md:5`
- **Mi van kész** — A `newsletterHtml` főági megvalósítását (`source/shared/newsletter.ts:46`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/newsletter.test.ts:95`). A korabeli mérés helye a #312 leírásának 11. sora (2178/2178).
- **Mi hiányzik** — Még ellenőrizendő: mód: a cron nem indul. `docs/specs/2026-10-19-mai-felfedezes-hirlevel.md:56`.
- **Folytatás helye** — `docs/specs/2026-10-19-mai-felfedezes-hirlevel.md:1` · #312
- **Következő lépés** — A `newsletterHtml` bemenetétől (`source/shared/newsletter.ts:46`) kövesd az eredményt a `source/tests/newsletter.test.ts:95` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-021 · Mai felfedezés” hírlevél — S2 végrehajtási utasítás (ügynöknek), review-keményítéssel

- **Azonosító** — R-TERV-021
- **Cím** — Mai felfedezés” hírlevél — S2 végrehajtási utasítás (ügynöknek), review-keményítéssel
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek.
- **Eredeti utasítás / cél** — A hírlevélhez a címzetthez illő, ellenőrizhető tartalom és küldési út tartozzon.
- **Forrás** — `docs/specs/2026-10-19-mai-felfedezes-hirlevel-s2-vegrehajtas.md:19`
- **Mi van kész** — A `chooseRequest` főági megvalósítását (`source/server/newsletter.ts:66`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/newsletter.test.ts:78`). A korabeli mérés helye a #315 leírásának 16. sora (2202/2202, 15/15, 66/66).
- **Mi hiányzik** — Még ellenőrizendő: Ha nincs használható cikk, de volt sikertelen letöltés → dob (újrapróbálható). `docs/specs/2026-10-19-mai-felfedezes-hirlevel-s2-vegrehajtas.md:19`.
- **Folytatás helye** — `docs/specs/2026-10-19-mai-felfedezes-hirlevel-s2-vegrehajtas.md:1` · #315
- **Következő lépés** — A `chooseRequest` bemenetétől (`source/server/newsletter.ts:66`) kövesd az eredményt a `source/tests/newsletter.test.ts:78` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-023 · YouTube-csatorna-ajánló a „Mai felfedezés” hírlevélben

- **Azonosító** — R-TERV-023
- **Cím** — YouTube-csatorna-ajánló a „Mai felfedezés” hírlevélben
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek.
- **Eredeti utasítás / cél** — A hírlevélhez a címzetthez illő, ellenőrizhető tartalom és küldési út tartozzon.
- **Forrás** — `docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md:57`, `docs/specs/2026-10-31-hirlevel-youtube-ajanlo-vegrehajtas.md:46`
- **Mi van kész** — A `pickYoutubeChannel` főági megvalósítását (`source/shared/youtube-channels.ts:93`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/youtube-channels.test.ts:9`). A korabeli mérés helye a #369 leírásának 29. sora.
- **Mi hiányzik** — Még ellenőrizendő: a záró jelentésben: módosított fájlok, PASS/FAIL, NOT RUN + ok. `docs/specs/2026-10-31-hirlevel-youtube-ajanlo-vegrehajtas.md:46`.
- **Folytatás helye** — `docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md:1` · #369
- **Következő lépés** — A `pickYoutubeChannel` bemenetétől (`source/shared/youtube-channels.ts:93`) kövesd az eredményt a `source/tests/youtube-channels.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-039 · Tanulói párosítás — QR-kód, igaz riasztás, vendég-eredmény útmutató

- **Azonosító** — R-TERV-039
- **Cím** — Tanulói párosítás — QR-kód, igaz riasztás, vendég-eredmény útmutató
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. A tárolt állapot és a hozzáférés helyességét érinti.
- **Eredeti utasítás / cél** — Az új kapcsolat a tanuló haladásának és a hozzáférési határoknak a megőrzésével jöjjön létre.
- **Forrás** — `docs/specs/2026-10-21-tanulo-parositas.md:23`, `docs/specs/2026-10-21-tanulo-parositas-vegrehajtas.md:1`
- **Mi van kész** — A `alertPeriodKey` főági megvalósítását (`source/shared/learner-report.ts:29`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/learner-report.test.ts:23`). A korabeli mérés helye a #362 leírásának 14. sora (2420/2420).
- **Mi hiányzik** — Még ellenőrizendő: HA a tanuló profiljához 3 tanítási napja nincs tevékenység, AKKOR a riasztás tárgya és szövege a profilra vonatkozik, és megnevezi a párosítást. `docs/specs/2026-10-21-tanulo-parositas.md:23`.
- **Folytatás helye** — `docs/specs/2026-10-21-tanulo-parositas.md:1` · #362
- **Következő lépés** — A `alertPeriodKey` bemenetétől (`source/shared/learner-report.ts:29`) kövesd az eredményt a `source/tests/learner-report.test.ts:23` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-047 · S11 — Forrás-javítás: gyenge kép OCR-je — elrendezés-szemantika és bizonytalanság (tulajdonosi döntés, 2026-10-05)

- **Azonosító** — R-TERV-047
- **Cím** — S11 — Forrás-javítás: gyenge kép OCR-je — elrendezés-szemantika és bizonytalanság (tulajdonosi döntés, 2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Bizonytalan szövegfelismerés vagy oldalszerkezet esetén a hibát jelölje a feldolgozás.
- **Forrás** — `docs/specs/2026-10-05-s11-forras-ocr-elrendezes-bizonytalansag.md:32`, `docs/specs/2026-10-05-s11-forras-ocr-elrendezes-bizonytalansag-vegrehajtas.md:22`
- **Mi van kész** — A `keyTokenRecall` főági megvalósítását (`source/server/studio/ocr-recall.ts:41`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/ocr-handwriting-history.test.ts:13`). A korabeli mérés helye a #197 leírásának 26. sora (2112/2112).
- **Mi hiányzik** — Még ellenőrizendő: Ha minden kulcsfogalom pending lenne → a meglévő autonomousApprovalDecision (≥ 1 igazolt core, ≥ 60 %) dönt — nem új szabály. `docs/specs/2026-10-05-s11-forras-ocr-elrendezes-bizonytalansag.md:32`.
- **Folytatás helye** — `docs/specs/2026-10-05-s11-forras-ocr-elrendezes-bizonytalansag.md:1` · #197
- **Következő lépés** — A `keyTokenRecall` bemenetétől (`source/server/studio/ocr-recall.ts:41`) kövesd az eredményt a `source/tests/ocr-handwriting-history.test.ts:13` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-048 · S4 — Tantárgyi és lecketípus-skillek a visszafejtett katalógusból (2026-10-05)

- **Azonosító** — R-TERV-048
- **Cím** — S4 — Tantárgyi és lecketípus-skillek a visszafejtett katalógusból (2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az adott tantárgy tudása és bevált javításai eljussanak az őket használó gyártási lépéshez.
- **Forrás** — `docs/specs/2026-10-05-s4-tantargyi-skillek.md:44`, `docs/specs/2026-10-05-s4-tantargyi-skillek-vegrehajtas.md:1`
- **Mi van kész** — A `subjectSkillBlock` főági megvalósítását (`source/server/studio/subject-skills.ts:21`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/subject-skills.test.ts:62`). A korabeli mérés helye a #193 leírásának 8. sora (2/9, 5/9).
- **Mi hiányzik** — Még ellenőrizendő: HA a generátor kétszer fut azonos DB-n, AKKOR a kimenet bájtra azonos. `docs/specs/2026-10-05-s4-tantargyi-skillek.md:44`.
- **Folytatás helye** — `docs/specs/2026-10-05-s4-tantargyi-skillek.md:1` · #193
- **Következő lépés** — A `subjectSkillBlock` bemenetétől (`source/server/studio/subject-skills.ts:21`) kövesd az eredményt a `source/tests/subject-skills.test.ts:62` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-049 · S5 — Tantárgyi memória (kanban) (2026-10-06)

- **Azonosító** — R-TERV-049
- **Cím** — S5 — Tantárgyi memória (kanban) (2026-10-06)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az adott tantárgy tudása és bevált javításai eljussanak az őket használó gyártási lépéshez.
- **Forrás** — `docs/specs/2026-10-06-s5-tantargyi-memoria.md:158`, `docs/specs/2026-10-06-s5-tantargyi-memoria-vegrehajtas.md:1`
- **Mi van kész** — A `evidenceFromRun` főági megvalósítását (`source/server/memory/subject-memory.ts:91`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/subject-memory.test.ts:43`). A korabeli mérés helye a #204 leírásának 32. sora (2153/2153).
- **Mi hiányzik** — Még ellenőrizendő: HA STUDIO_SUBJECT_MEMORY nem 1, AKKOR a tervező, a szerző és a bank rendszerpromptja és a csomag-hash bájtra azonos a. `docs/specs/2026-10-06-s5-tantargyi-memoria.md:158`.
- **Folytatás helye** — `docs/specs/2026-10-06-s5-tantargyi-memoria.md:1` · #204
- **Következő lépés** — A `evidenceFromRun` bemenetétől (`source/server/memory/subject-memory.ts:91`) kövesd az eredményt a `source/tests/subject-memory.test.ts:43` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-051 · Forrás-olvasás és tantárgy/évfolyam-felismerés: OpenRouter helyett saját kulcs (2026-10-14)

- **Azonosító** — R-TERV-051
- **Cím** — Forrás-olvasás és tantárgy/évfolyam-felismerés: OpenRouter helyett saját kulcs (2026-10-14)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A forrás besorolása a kijelölt döntési szabályt és modellt használja.
- **Forrás** — `docs/specs/2026-10-14-forras-besorolo-openai-luna.md:82`, `docs/specs/2026-10-14-forras-besorolo-openai-luna-vegrehajtas.md:7`
- **Mi van kész** — A `providerForModel` főági megvalósítását (`source/server/ai/models.ts:99`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/scope-luna-openai.test.ts:16`). A korabeli mérés helye a #214 leírásának 9. sora (2244/2244).
- **Mi hiányzik** — Még ellenőrizendő: A forrás-OCR-lépés (ocr) modellcseréje a kézírásos mérés UTÁN (lásd Nyitott kérdés). `docs/specs/2026-10-14-forras-besorolo-openai-luna.md:59`.
- **Folytatás helye** — `docs/specs/2026-10-14-forras-besorolo-openai-luna.md:1` · #214
- **Következő lépés** — A `providerForModel` bemenetétől (`source/server/ai/models.ts:99`) kövesd az eredményt a `source/tests/scope-luna-openai.test.ts:16` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-054 · Tananyag-jobbítás és gyártási promptok

- **Azonosító** — R-TERV-054
- **Cím** — Tananyag-jobbítás és gyártási promptok
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás a ténylegesen átadott forrásból dolgozzon, és a javított lecke menthető, visszaolvasható legyen.
- **Forrás** — `docs/specs/2026-09-07-lesson-improvement-prompts.md:14`, `docs/lesson-improvement.md:86`
- **Mi van kész** — A `buildLessonExperience` főági megvalósítását (`source/server/studio/experience-builder.ts:477`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-experience.test.ts:120`). A korabeli mérés helye a #42 leírásának 5. sora (4/4).
- **Mi hiányzik** — Még ellenőrizendő: Fizetős modellhívás, új élő tananyaggyártás és deploy: NOT RUN, nem része ennek a szeletnek. A tesztek az adatút és szerződés működését igazolják; a következő tényleges…. `docs/specs/2026-09-07-lesson-improvement-prompts.md:30`.
- **Folytatás helye** — `docs/specs/2026-09-07-lesson-improvement-prompts.md:1` · #42
- **Következő lépés** — A `buildLessonExperience` bemenetétől (`source/server/studio/experience-builder.ts:477`) kövesd az eredményt a `source/tests/lesson-experience.test.ts:120` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-058 · Valódi tananyag-folyamat átvételi ellenőrzése

- **Azonosító** — R-TERV-058
- **Cím** — Valódi tananyag-folyamat átvételi ellenőrzése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás lépései, hibái és újraindítása legyen követhető valódi futáson.
- **Forrás** — `docs/specs/2026-09-11-live-workflow-acceptance.md:11`, `docs/handoffs/2026-09-11-live-workflow-acceptance.md:15`, `docs/specs/2026-09-11-live-workflow-acceptance-vegrehajtas.md:8` és 1 további forrás a sormutatóban
- **Mi van kész** — A `workflowDefinition` főági megvalósítását (`source/shared/lesson-workflow.ts:42`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/workflow-db.integration.ts:152`). A korabeli mérés helye a #65 leírásának 21. sora.
- **Mi hiányzik** — Még ellenőrizendő: Négy lap és pontozás: valódi böngésző, magyar ékezetek, helyes/hibás válasz és újratöltés. Mobil álló/fekvő nézetet ellenőrizz. Írd le a PASS/FAIL/NOT RUN eredményeket,…. `docs/specs/2026-09-11-live-workflow-acceptance-vegrehajtas.md:8`.
- **Folytatás helye** — `docs/specs/2026-09-11-live-workflow-acceptance.md:1` · #58
- **Következő lépés** — A `workflowDefinition` bemenetétől (`source/shared/lesson-workflow.ts:42`) kövesd az eredményt a `source/tests/workflow-db.integration.ts:152` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-060 · Lektori hatókör és forrásváltozat-kezelés

- **Azonosító** — R-TERV-060
- **Cím** — Lektori hatókör és forrásváltozat-kezelés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A lektor azonosítsa a neki kiosztott hibát, és ugyanaz a hiba javítás után visszaellenőrizhető legyen.
- **Forrás** — `docs/specs/2026-09-12-lektori-hatokeszeles.md:44`, `docs/specs/2026-09-12-lektori-hatokeszeles-vegrehajtas.md:1`
- **Mi van kész** — A `verifyTeachingVisuals` főági megvalósítását (`source/server/improve/verify-html-teaching.ts:82`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-teaching-quality.test.ts:133`). A korabeli mérés helye a #63 leírásának 5. sora (1208/1208).
- **Mi hiányzik** — Még ellenőrizendő: Ha a kért téma nem kér változat-összehasonlítást, és a lektori hibajegy egy. `docs/specs/2026-09-12-lektori-hatokeszeles.md:44`.
- **Folytatás helye** — `docs/specs/2026-09-12-lektori-hatokeszeles.md:1` · #63
- **Következő lépés** — A `verifyTeachingVisuals` bemenetétől (`source/server/improve/verify-html-teaching.ts:82`) kövesd az eredményt a `source/tests/lesson-teaching-quality.test.ts:133` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-061 · Bizonyítékhoz kötött lektor és célzott javítókör

- **Azonosító** — R-TERV-061
- **Cím** — Bizonyítékhoz kötött lektor és célzott javítókör
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A lektor azonosítsa a neki kiosztott hibát, és ugyanaz a hiba javítás után visszaellenőrizhető legyen.
- **Forrás** — `docs/specs/2026-09-12-lektori-javitokor.md:13`, `docs/specs/2026-09-12-lektori-javitokor-vegrehajtas.md:1`
- **Mi van kész** — A `verifyTeachingVisuals` főági megvalósítását (`source/server/improve/verify-html-teaching.ts:82`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-teaching-quality.test.ts:133`). A korabeli mérés helye a #63 leírásának 5. sora (1208/1208).
- **Mi hiányzik** — Még ellenőrizendő: Elfogadás (EARS): ha a lektor nem létező idézetre hivatkozik, a program lektori korrekciót kér, és két hibás válasz után megáll. Ha a lektor érvényes hibát talál, a…. `docs/specs/2026-09-12-lektori-javitokor.md:13`.
- **Folytatás helye** — `docs/specs/2026-09-12-lektori-javitokor.md:1` · #63
- **Következő lépés** — A `verifyTeachingVisuals` bemenetétől (`source/server/improve/verify-html-teaching.ts:82`) kövesd az eredményt a `source/tests/lesson-teaching-quality.test.ts:133` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-065 · Spec: autonóm tananyagkészítő ökoszisztéma (feltöltés + internetes készítés)

- **Azonosító** — R-TERV-065
- **Cím** — Spec: autonóm tananyagkészítő ökoszisztéma (feltöltés + internetes készítés)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártósor kézi tartalompótlás nélkül állítson elő ellenőrzött kész leckét.
- **Forrás** — `docs/specs/2026-09-19-autonomous-lesson-pipeline.md:105`, `docs/specs/2026-09-19-autonomous-lesson-pipeline-vegrehajtas.md:61`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #76 leírásának 14. sora.
- **Mi hiányzik** — Még ellenőrizendő: Memória + LEDGER bejegyzés; záró jelentés: futtatott parancsok kimenetével, NOT RUN tételekkel. `docs/specs/2026-09-19-autonomous-lesson-pipeline-vegrehajtas.md:85`.
- **Folytatás helye** — `docs/specs/2026-09-19-autonomous-lesson-pipeline.md:1` · #76
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-066 · Spec: modellmátrix lépésenként + Opus 5 tervkészítő + tokentakarékos gyártás

- **Azonosító** — R-TERV-066
- **Cím** — Spec: modellmátrix lépésenként + Opus 5 tervkészítő + tokentakarékos gyártás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szerepekhez kijelölt modellek választását és a tervezés eredményét valódi futások támasszák alá.
- **Forrás** — `docs/specs/2026-09-19-model-matrix-and-planner.md:58`, `docs/specs/2026-09-19-model-matrix-and-planner-vegrehajtas.md:1`
- **Mi van kész** — A `modelFamily` főági megvalósítását (`source/server/ai/models.ts:201`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/models-routing.test.ts:24`). A korabeli mérés helye a #101 leírásának 16. sora (1354/1354).
- **Mi hiányzik** — Még ellenőrizendő: WHEN a bank vagy az ábra lépés fut THEN a szolgáltatói kérés modellje z-ai/glm-5.3-flash (tartalék deepseek), reasoning.effort = low; 3 bukott csomagkísérlet után a csomag…. `docs/specs/2026-09-19-model-matrix-and-planner.md:58`.
- **Folytatás helye** — `docs/specs/2026-09-19-model-matrix-and-planner.md:1` · #101
- **Következő lépés** — A `modelFamily` bemenetétől (`source/server/ai/models.ts:201`) kövesd az eredményt a `source/tests/models-routing.test.ts:24` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-067 · Lektor-tanítás a felvételi feladatlap öt élő futásából (2026-09-24)

- **Azonosító** — R-TERV-067
- **Cím** — Lektor-tanítás a felvételi feladatlap öt élő futásából (2026-09-24)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A lektor a tanítás érthetőségét és forráshűségét is értékelje.
- **Forrás** — `docs/specs/2026-09-24-lektor-tanitas.md:29`, `docs/specs/2026-09-24-lektor-tanitas-vegrehajtas.md:1`
- **Mi van kész** — A `buildLektorPrompt` főági megvalósítását (`source/server/studio/step-io.ts:652`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/blind-solver.test.ts:8`). A korabeli mérés helye a #119 leírásának 10. sora (1421/1421).
- **Mi hiányzik** — Még ellenőrizendő: A hibás téglatest-leckén az új lektor blokkolót ad a tanításra a helyes értékkel — élőben mérve ✅. `docs/specs/2026-09-24-lektor-tanitas.md:29`.
- **Folytatás helye** — `docs/specs/2026-09-24-lektor-tanitas.md:1` · #119
- **Következő lépés** — A `buildLektorPrompt` bemenetétől (`source/server/studio/step-io.ts:652`) kövesd az eredményt a `source/tests/blind-solver.test.ts:8` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-068 · Spec — Kimerült OpenAI-keret: igaz hibaüzenet és automatikus átállás (2026-09-25)

- **Azonosító** — R-TERV-068
- **Cím** — Spec — Kimerült OpenAI-keret: igaz hibaüzenet és automatikus átállás (2026-09-25)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Kimerült szolgáltatói keret esetén a tartalék út és a hibajelzés legyen következetes.
- **Forrás** — `docs/specs/2026-09-25-openai-keret-atallas.md:39`
- **Mi van kész** — A `isQuotaExhausted` főági megvalósítását (`source/server/ai/AIProvider.ts:162`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/ai-quota-failover.test.ts:15`). A korabeli mérés helye a #126 leírásának 18. sora (1435/1435).
- **Mi hiányzik** — Még ellenőrizendő: HA az OpenAI 429-et ad insufficient_quota típussal, AKKOR AIProviderQuotaError (nem újrapróbálható) keletkezik. `docs/specs/2026-09-25-openai-keret-atallas.md:39`.
- **Folytatás helye** — `docs/specs/2026-09-25-openai-keret-atallas.md:1` · #126
- **Következő lépés** — A `isQuotaExhausted` bemenetétől (`source/server/ai/AIProvider.ts:162`) kövesd az eredményt a `source/tests/ai-quota-failover.test.ts:15` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-069 · Spec: Internetes tananyag a feltöltős Studio-gyártással (2. szelet: módszer)

- **Azonosító** — R-TERV-069
- **Cím** — Spec: Internetes tananyag a feltöltős Studio-gyártással (2. szelet: módszer)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A forrásgyűjtés eredménye a Stúdió tényleges munkafolyamatába kerüljön.
- **Forrás** — `docs/specs/2026-09-25-webes-studio-atadas.md:45`, `docs/specs/2026-09-25-webes-studio-atadas-vegrehajtas.md:5`
- **Mi van kész** — A `publicResearchJob` főági megvalósítását (`source/server/studio/web-research-jobs.ts:52`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/web-research-jobs.test.ts:313`). A korabeli mérés helye a #128 leírásának 27. sora (7/7).
- **Mi hiányzik** — Még ellenőrizendő: NOT RUN: éles internetes gyártás, mert nincs éles hálózat és kulcs a munkamenetben. Élő próbát a tulajdonos vagy egy helyi munkamenet futtathat. `docs/specs/2026-09-25-webes-studio-atadas.md:84`.
- **Folytatás helye** — `docs/specs/2026-09-25-webes-studio-atadas.md:1` · #128
- **Következő lépés** — A `publicResearchJob` bemenetétől (`source/server/studio/web-research-jobs.ts:52`) kövesd az eredményt a `source/tests/web-research-jobs.test.ts:313` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-070 · Kapu: elérhetetlen Próba determinisztikus kikapcsolása + célzott javítás csak kerettel (2026-09-29)

- **Azonosító** — R-TERV-070
- **Cím** — Kapu: elérhetetlen Próba determinisztikus kikapcsolása + célzott javítás csak kerettel (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Az ellenőrző kör ne álljon meg egy olyan keret miatt, amelyből még végezhető biztonságos javítás.
- **Forrás** — `docs/specs/2026-09-29-kapu-proba-keret.md:23`, `docs/specs/2026-09-29-kapu-proba-keret-vegrehajtas.md:1`
- **Mi van kész** — A `checkLessonArc` főági megvalósítását (`source/shared/lesson-arc.ts:174`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-arc.test.ts:376`). A korabeli mérés helye a #143 leírásának 5. sora (1658/1658).
- **Mi hiányzik** — Még ellenőrizendő: A limiten, egyetlen proba_unreachable lelettel a kapu SHALL NOT szerzői kört kérni; SHALL publikálni, a szakasz probaEnabled: false-szal (teszt; a régi kódon szerzői kör). `docs/specs/2026-09-29-kapu-proba-keret.md:30`.
- **Folytatás helye** — `docs/specs/2026-09-29-kapu-proba-keret.md:1` · #143
- **Következő lépés** — A `checkLessonArc` bemenetétől (`source/shared/lesson-arc.ts:174`) kövesd az eredményt a `source/tests/lesson-arc.test.ts:376` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-075 · Egységes javítási főkönyv (2026-10-01)

- **Azonosító** — R-TERV-075
- **Cím** — Egységes javítási főkönyv (2026-10-01)
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A javítási kísérletek és felhasznált keretek egységes nyilvántartásból legyenek megállapíthatók.
- **Forrás** — `docs/specs/2026-10-01-javitasi-fokonyv.md:33`, `docs/specs/2026-10-01-javitasi-fokonyv-vegrehajtas.md:1`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `source/server/studio/pipeline.ts:61`; `source/tests/repair-ledger.test.ts:7`. Történeti kapcsolat: #179.
- **Mi hiányzik** — Még ellenőrizendő: HA egy javításfajta limitje elfogyott, AKKOR canSpendRepair hamis; HA van limit és a teljes út látogatható, AKKOR igaz; HA a. `docs/specs/2026-10-01-javitasi-fokonyv.md:33`.
- **Folytatás helye** — `docs/specs/2026-10-01-javitasi-fokonyv.md:1` · #179
- **Következő lépés** — A `source/server/studio/pipeline.ts:61` útján kövesd a feltételt a `source/tests/repair-ledger.test.ts:7` eseteivel összevetve. Elsőként a `docs/specs/2026-10-01-javitasi-fokonyv.md:33` bemenetét és elvárt eredményét egyeztesd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-076 · Lektor- és szerzőmodell-csere (tulajdonosi döntés, 2026-10-05)

- **Azonosító** — R-TERV-076
- **Cím** — Lektor- és szerzőmodell-csere (tulajdonosi döntés, 2026-10-05)
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A jóváhagyott modellcserét a tényleges szerzői és lektori hívások is kövessék.
- **Forrás** — `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:21`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:21`. Történeti kapcsolat: #190. Rögzített eredmény: `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:18`. A korabeli mérés a #190 leírásának 10. sorában található (9/1).
- **Mi hiányzik** — Még ellenőrizendő: assertDistinctFamilies minden (szerző / tartalék) × (lektor / tartalék) párra teljesül. `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:21`.
- **Folytatás helye** — `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:1` · #190
- **Következő lépés** — A `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:21` útján kövesd a feltételt. Elsőként a `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md:21` bemenetét és elvárt eredményét egyeztesd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-077 · S9 — Prompt-javító orkesztrátor (tulajdonosi tervezés, 2026-10-05)

- **Azonosító** — R-TERV-077
- **Cím** — S9 — Prompt-javító orkesztrátor (tulajdonosi tervezés, 2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártási hibából származó promptmódosítás legyen célzott és visszaellenőrizhető.
- **Forrás** — `docs/specs/2026-10-05-s9-prompt-javito-orkesztrator.md:49`, `docs/specs/2026-10-05-s9-prompt-javito-orkesztrator-vegrehajtas.md:54`
- **Mi van kész** — A `buildAuthorPrompt` főági megvalósítását (`source/server/studio/step-io.ts:520`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/source-arithmetic-corrections.test.ts:65`). A korabeli mérés helye a #190 leírásának 10. sora (9/1).
- **Mi hiányzik** — Még ellenőrizendő: Az orkesztrált kísérletek sikeressége a fizetős A/B-n jobb a mai ismétlésnél ugyanazon pontokon (cél: ≥ +25 százalékpont),. `docs/specs/2026-10-05-s9-prompt-javito-orkesztrator.md:51`.
- **Folytatás helye** — `docs/specs/2026-10-05-s9-prompt-javito-orkesztrator.md:1` · #190
- **Következő lépés** — A `buildAuthorPrompt` bemenetétől (`source/server/studio/step-io.ts:520`) kövesd az eredményt a `source/tests/source-arithmetic-corrections.test.ts:65` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-078 · Spec: S7 — Workflow-rendbetétel (H, I, J, K, B′ workflow alá; a webes út egy futásban; skillek; támogató lelet-kódok)

- **Azonosító** — R-TERV-078
- **Cím** — Spec: S7 — Workflow-rendbetétel (H, I, J, K, B′ workflow alá; a webes út egy futásban; skillek; támogató lelet-kódok)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás lépései, hibái és újraindítása legyen követhető valódi futáson.
- **Forrás** — `docs/specs/2026-10-06-s7-workflow-rendbetetel.md:112`, `docs/specs/2026-10-06-s7-workflow-rendbetetel-vegrehajtas.md:1`
- **Mi van kész** — A `publicResearchJob` főági megvalósítását (`source/server/studio/web-research-jobs.ts:52`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/web-research-jobs.test.ts:313`). A korabeli mérés helye a #203 leírásának 25. sora (2154/2154).
- **Mi hiányzik** — Még ellenőrizendő: WHEN a H /html-fix/errors / theme / chat vagy az I öt végpontja sikeresen lefut THEN the system SHALL egy htmlAssist/creator. `docs/specs/2026-10-06-s7-workflow-rendbetetel.md:114`.
- **Folytatás helye** — `docs/specs/2026-10-06-s7-workflow-rendbetetel.md:1` · #203
- **Következő lépés** — A `publicResearchJob` bemenetétől (`source/server/studio/web-research-jobs.ts:52`) kövesd az eredményt a `source/tests/web-research-jobs.test.ts:313` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-079 · Ellentétes családú tartalékmodell mindenhol (2026-10-14)

- **Azonosító** — R-TERV-079
- **Cím** — Ellentétes családú tartalékmodell mindenhol (2026-10-14)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szolgáltatói hiba után a jóváhagyott tartalék út érvényes és ellenőrzött eredménnyel folytasson.
- **Forrás** — `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md:31`, `docs/specs/2026-10-14-ellentetes-csalad-tartalek-vegrehajtas.md:5`
- **Mi van kész** — A `createStudioStepProvider` főági megvalósítását (`source/server/ai/studio-provider.ts:198`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/cross-family-fallback.test.ts:32`). A korabeli mérés helye a #216 leírásának 22. sora (2251/2251).
- **Mi hiányzik** — Még ellenőrizendő: Élő próbahívás (kis, csak olvasó, nem éles adat): gpt-6.1-sol chat úton reasoning_effort: "medium" + JSON-mód →. `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md:89`.
- **Folytatás helye** — `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md:1` · #223
- **Következő lépés** — A `createStudioStepProvider` bemenetétől (`source/server/ai/studio-provider.ts:198`) kövesd az eredményt a `source/tests/cross-family-fallback.test.ts:32` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-080 · Tananyag v7.5 – asztali reszponzivitás és console-mentesség (terv)

- **Azonosító** — R-TERV-080
- **Cím** — Tananyag v7.5 – asztali reszponzivitás és console-mentesség (terv)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az új módszertan asztali felületen is látható és hibamentesen használható legyen.
- **Forrás** — `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console.md:63`, `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console-vegrehajtas.md:5`
- **Mi van kész** — A `verifyImprovedHtml` főági megvalósítását (`source/server/improve/verify-html.ts:18`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/improve-verify-html.test.ts:65`). A korabeli mérés helye a #208 leírásának 33. sora (2211/2211).
- **Mi hiányzik** — Még ellenőrizendő: WHEN a generált HTML bármely futtatható <script> blokkja console.<x>( hívást vagy debugger utasítást tartalmaz, THE verifyImprovedHtml SHALL ok:false-t és egy magyar nyelvű…. `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console.md:63`.
- **Folytatás helye** — `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console.md:1` · #208
- **Következő lépés** — A `verifyImprovedHtml` bemenetétől (`source/server/improve/verify-html.ts:18`) kövesd az eredményt a `source/tests/improve-verify-html.test.ts:65` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-081 · Ellentétes családú tartalék — B szelet: a ma tartalék nélküli hívóhelyek (2026-10-14)

- **Azonosító** — R-TERV-081
- **Cím** — Ellentétes családú tartalék — B szelet: a ma tartalék nélküli hívóhelyek (2026-10-14)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szolgáltatói hiba után a jóváhagyott tartalék út érvényes és ellenőrzött eredménnyel folytasson.
- **Forrás** — `docs/specs/2026-10-14-tartalek-b-szelet.md:42`, `docs/specs/2026-10-14-tartalek-b-szelet-vegrehajtas.md:5`
- **Mi van kész** — A `providerForModel` főági megvalósítását (`source/server/ai/models.ts:99`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/ai-model-routing-complete.test.ts:95`). A korabeli mérés helye a #217 leírásának 21. sora (2261/2261).
- **Mi hiányzik** — Még ellenőrizendő: WHEN egy B1 hívóhely elsődleges hívása StepModelError-ral bukik, THE rendszer SHALL egyszer a tartalékon. `docs/specs/2026-10-14-tartalek-b-szelet.md:42`.
- **Folytatás helye** — `docs/specs/2026-10-14-tartalek-b-szelet.md:1` · #217
- **Következő lépés** — A `providerForModel` bemenetétől (`source/server/ai/models.ts:99`) kövesd az eredményt a `source/tests/ai-model-routing-complete.test.ts:95` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-085 · Végrehajtási utasítás — Elakadás-vezérlő V2+V3: célzott újraépítés és automatikus, haladás-alapú végrehajtás

- **Azonosító** — R-TERV-085
- **Cím** — Végrehajtási utasítás — Elakadás-vezérlő V2+V3: célzott újraépítés és automatikus, haladás-alapú végrehajtás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás állapotából derüljön ki, miért állt meg és melyik meglévő művelettel folytatható.
- **Forrás** — `docs/specs/2026-10-15-elakadas-vezerlo-v3-vegrehajtas.md:1`
- **Mi van kész** — A `executeWorkflow` főági megvalósítását (`source/server/workflows/engine.ts:333`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/recovery-sweep.test.ts:8`). A korabeli mérés helye a #234 leírásának 13. sora (2342/2342).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-10-15-elakadas-vezerlo-v3-vegrehajtas.md:1` · #234
- **Következő lépés** — A `executeWorkflow` bemenetétől (`source/server/workflows/engine.ts:333`) kövesd az eredményt a `source/tests/recovery-sweep.test.ts:8` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-087 · Kapu: részleges tételjavítás, kapuhiba-folytatás, gyártáskövetés (2026-10-15)

- **Azonosító** — R-TERV-087
- **Cím** — Kapu: részleges tételjavítás, kapuhiba-folytatás, gyártáskövetés (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A végkapu után folytatható legyen a célzott javítás a megőrzött eredményből.
- **Forrás** — `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas.md:13`, `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas-vegrehajtas.md:15`
- **Mi van kész** — A `oneStepPhaseRows` főági megvalósítását (`source/shared/studio-ui.ts:455`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/studio-one-step-progress.test.ts:63`). A korabeli mérés helye a #224 leírásának 16. sora (2306/2307, 8/8).
- **Mi hiányzik** — Még ellenőrizendő: (élő): a deploy után a 416ad01d job a felületről folytatható, és publikál VAGY a megmaradt hibás tételeket pontosan megnevező kapuhibával áll meg. `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas.md:86`.
- **Folytatás helye** — `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas.md:1` · #224
- **Következő lépés** — A `oneStepPhaseRows` bemenetétől (`source/shared/studio-ui.ts:455`) kövesd az eredményt a `source/tests/studio-one-step-progress.test.ts:63` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-088 · Ellentétes családú tartalék — B4: webes forrásgyűjtés (2026-10-15)

- **Azonosító** — R-TERV-088
- **Cím** — Ellentétes családú tartalék — B4: webes forrásgyűjtés (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szolgáltatói hiba után a jóváhagyott tartalék út érvényes és ellenőrzött eredménnyel folytasson.
- **Forrás** — `docs/specs/2026-10-15-tartalek-b4-webgyujtes.md:40`, `docs/specs/2026-10-15-tartalek-b4-webgyujtes-vegrehajtas.md:5`
- **Mi van kész** — A `fetchPublicPage` főági megvalósítását (`source/server/studio/safe-fetch.ts:155`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/web-gather-gpt.test.ts:43`). A korabeli mérés helye a #222 leírásának 21. sora (2282/2282).
- **Mi hiányzik** — Még ellenőrizendő: WHEN a Claude-gyűjtés hibával áll le (nem külső megszakítás), THE rendszer SHALL egyszer a GPT-6.1 Sol tartalékkal. `docs/specs/2026-10-15-tartalek-b4-webgyujtes.md:40`.
- **Folytatás helye** — `docs/specs/2026-10-15-tartalek-b4-webgyujtes.md:1` · #222
- **Következő lépés** — A `fetchPublicPage` bemenetétől (`source/server/studio/safe-fetch.ts:155`) kövesd az eredményt a `source/tests/web-gather-gpt.test.ts:43` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-096 · R1 — kivétel megállás helyett az utolsó lektorkörben — végrehajtási utasítás (ügynöknek)

- **Azonosító** — R-TERV-096
- **Cím** — R1 — kivétel megállás helyett az utolsó lektorkörben — végrehajtási utasítás (ügynöknek)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A ténylegesen ismétlődő gyártási hibát ismerje fel a rendszer, és menthető állapotban folytasson.
- **Forrás** — `docs/specs/2026-10-20-elakadas-r1-vegrehajtas.md:6`
- **Mi van kész** — A `removeLektorBlockers` főági megvalósítását (`source/server/studio/choice-gate.ts:106`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/elakadas-r1.test.ts:67`). A korabeli mérés helye a #331 leírásának 17. sora (2268/2268).
- **Mi hiányzik** — Még ellenőrizendő: Ha van tanítási (nem experience…) blokkoló: a régi hiba. `docs/specs/2026-10-20-elakadas-r1-vegrehajtas.md:6`.
- **Folytatás helye** — `docs/specs/2026-10-20-elakadas-r1-vegrehajtas.md:1` · #331
- **Következő lépés** — A `removeLektorBlockers` bemenetétől (`source/server/studio/choice-gate.ts:106`) kövesd az eredményt a `source/tests/elakadas-r1.test.ts:67` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-098 · A régi (2026. június 1. előtti) anyagok átalakítása Stúdió-leckévé

- **Azonosító** — R-TERV-098
- **Cím** — A régi (2026. június 1. előtti) anyagok átalakítása Stúdió-leckévé
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A régi tananyag a forrástartalom megőrzésével legyen átalakítható Stúdió-leckévé.
- **Forrás** — `docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md:58`, `docs/specs/2026-10-20-regi-anyag-studio-atalakitas-vegrehajtas.md:8`
- **Mi van kész** — A `legacyCandidates` főági megvalósítását (`source/server/studio/legacy-migration.ts:90`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/regi-anyag-studio.test.ts:12`). A korabeli mérés helye a #349 leírásának 29. sora.
- **Mi hiányzik** — Még ellenőrizendő: HA a gyártás targetHtmlFileId-vel fut és sikeres, AKKOR. `docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md:58`.
- **Folytatás helye** — `docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md:1` · #349
- **Következő lépés** — A `legacyCandidates` bemenetétől (`source/server/studio/legacy-migration.ts:90`) kövesd az eredményt a `source/tests/regi-anyag-studio.test.ts:12` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-099 · 2. ciklus — a halott futás azonnali felismerése és a ragos alak pontos rubrikája

- **Azonosító** — R-TERV-099
- **Cím** — 2. ciklus — a halott futás azonnali felismerése és a ragos alak pontos rubrikája
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe.
- **Forrás** — `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak.md:24`, `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak-vegrehajtas.md:1`
- **Mi van kész** — A `reconcileLegacy` főági megvalósítását (`source/server/studio/legacy-migration.ts:121`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/regi-anyag-studio.test.ts:121`). A korabeli mérés helye a #354 leírásának 13. sora.
- **Mi hiányzik** — Még ellenőrizendő: HA a sorelem futásának jobja error, és a bérlet nem él, AKKOR az egyeztetés azonnal újrapróbál (vagy hibára zár, ha a keret elfogyott). `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak.md:24`.
- **Folytatás helye** — `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak.md:1` · #354
- **Következő lépés** — A `reconcileLegacy` bemenetétől (`source/server/studio/legacy-migration.ts:121`) kövesd az eredményt a `source/tests/regi-anyag-studio.test.ts:121` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-100 · Fényképezős forrásfelvétel a tananyagkészítésben (Post Planner élő kamera technika átvétele)

- **Azonosító** — R-TERV-100
- **Cím** — Fényképezős forrásfelvétel a tananyagkészítésben (Post Planner élő kamera technika átvétele)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár mobilról fényképezett forrást is be tudjon adni az elkészítési folyamatba.
- **Forrás** — `docs/specs/2026-10-31-tananyag-fenykepezo.md:65`, `docs/specs/2026-10-31-tananyag-fenykepezo-vegrehajtas.md:1`
- **Mi van kész** — A `classifyCameraError` főági megvalósítását (`source/client/src/lib/camera-capture.ts:18`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/camera-capture.test.ts:20`). A korabeli mérés helye a #370 leírásának 24. sora.
- **Mi hiányzik** — Még ellenőrizendő: HA az admin a „Fényképezés” gombra nyom ÉS a kamera elindul, AKKOR élő előnézetet lát, és az exponálás után a kép. `docs/specs/2026-10-31-tananyag-fenykepezo.md:65`.
- **Folytatás helye** — `docs/specs/2026-10-31-tananyag-fenykepezo.md:1` · #370
- **Következő lépés** — A `classifyCameraError` bemenetétől (`source/client/src/lib/camera-capture.ts:18`) kövesd az eredményt a `source/tests/camera-capture.test.ts:20` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-110 · Tananyag Készítő v7.4

- **Azonosító** — R-TERV-110
- **Cím** — Tananyag Készítő v7.4
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Tananyag Készítő v7.4.
- **Forrás** — `docs/specs/tananyag-keszito-SKILL-v7_4.md:47`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `source/server/ai/lesson-html-spec.ts:246`; `source/tests/lesson-html-spec.test.ts:20`. Történeti kapcsolat: c78f89fa.
- **Mi hiányzik** — Még ellenőrizendő: Google Fonts CDN &subset=latin,latin-ext&display=swap paraméterrel?. `docs/specs/tananyag-keszito-SKILL-v7_4.md:545`.
- **Folytatás helye** — `docs/specs/tananyag-keszito-SKILL-v7_4.md:1`
- **Következő lépés** — A feltételhez keresd ki az azonos verziójú mérés, böngészőpróba vagy kiadás nyugtáját. A kódoldali összevetés helye `source/server/ai/lesson-html-spec.ts:246`; `source/tests/lesson-html-spec.test.ts:20`.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-111 · Tananyag Készítő – v7.5 kiegészítés (runbook)

- **Azonosító** — R-TERV-111
- **Cím** — Tananyag Készítő – v7.5 kiegészítés (runbook)
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az új módszertan asztali felületen is látható és hibamentesen használható legyen.
- **Forrás** — `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md:169`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `scripts/tananyag/tananyag_verify.py:1`; `source/tests/improve-verify-html.test.ts:65`. Történeti kapcsolat: #208 · cd211053. Rögzített eredmény: `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md:163`. A korabeli mérés a #208 leírásának 33. sorában található (2211/2211).
- **Mi hiányzik** — Még ellenőrizendő: grep -c "console" <html> értéke 0. `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md:169`.
- **Folytatás helye** — `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md:1` · #208
- **Következő lépés** — A `scripts/tananyag/tananyag_verify.py:1` útján kövesd a feltételt a `source/tests/improve-verify-html.test.ts:65` eseteivel összevetve. Elsőként a `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md:169` bemenetét és elvárt eredményét egyeztesd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-118 · Spec: Internetes tananyagkészítés — elakadás megszüntetése (1. szelet: működés)

- **Azonosító** — R-TERV-118
- **Cím** — Spec: Internetes tananyagkészítés — elakadás megszüntetése (1. szelet: működés)
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A webes gyártó elakadása után a kész részekből lehessen továbbhaladni.
- **Forrás** — `docs/specs/2026-09-25-webes-gyartas-elakadas.md:24`, `docs/specs/2026-09-25-webes-gyartas-elakadas-vegrehajtas.md:5`
- **Mi van kész** — A `publicResearchJob` főági megvalósítását (`source/server/studio/web-research-jobs.ts:52`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/web-research-jobs.test.ts:313`). A korabeli mérés helye a #127 leírásának 16. sora (1441/1441).
- **Mi hiányzik** — Még ellenőrizendő: NOT RUN ebben a munkamenetben: éles webes gyártás (nincs éles hálózat/kulcs a konténerben). `docs/specs/2026-09-25-webes-gyartas-elakadas.md:92`.
- **Folytatás helye** — `docs/specs/2026-09-25-webes-gyartas-elakadas.md:1` · #127
- **Következő lépés** — A `publicResearchJob` bemenetétől (`source/server/studio/web-research-jobs.ts:52`) kövesd az eredményt a `source/tests/web-research-jobs.test.ts:313` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-119 · Resend sandbox-feladó őr + csendes küldési hiba jelzése — terv

- **Azonosító** — R-TERV-119
- **Cím** — Resend sandbox-feladó őr + csendes küldési hiba jelzése — terv
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A levélküldés beállítási hibáját a program még a téves sikerjelzés előtt jelezze.
- **Forrás** — `docs/specs/2026-10-13-resend-sandbox-or.md:47`, `docs/specs/2026-10-13-resend-sandbox-or-vegrehajtas.md:1`
- **Mi van kész** — A `checkResendSender` főági megvalósítását (`source/server/lib/resend-sender.ts:26`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/resend-sender.test.ts:14`). A korabeli mérés helye a #205 leírásának 17. sora (2203/2203).
- **Mi hiányzik** — Még ellenőrizendő: HA a RESEND_FROM_EMAIL domainje resend.dev, AKKOR isResendConfigured() { ok: false, reason }-t ad, a reason. `docs/specs/2026-10-13-resend-sandbox-or.md:47`.
- **Folytatás helye** — `docs/specs/2026-10-13-resend-sandbox-or.md:1` · #205
- **Következő lépés** — A `checkResendSender` bemenetétől (`source/server/lib/resend-sender.ts:26`) kövesd az eredményt a `source/tests/resend-sender.test.ts:14` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-122 · Végrehajtási utasítás — Tételgyár T1b: a padló alá eső kapuhibából a bank újraépül (130%-os tartalékkal)

- **Azonosító** — R-TERV-122
- **Cím** — Végrehajtási utasítás — Tételgyár T1b: a padló alá eső kapuhibából a bank újraépül (130%-os tartalékkal)
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-t1b-bank-ujraepites-vegrehajtas.md:13`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #230 leírásának 12. sora (2321/2321).
- **Mi hiányzik** — Még ellenőrizendő: resumeKindOf bemenete kap gateRecoveryAttempt?: number; kapu-látogatás + egyező hiba + GATE_RESUMABLE_ERRORS esetén. `docs/specs/2026-10-15-tetelgyar-t1b-bank-ujraepites-vegrehajtas.md:13`.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-t1b-bank-ujraepites-vegrehajtas.md:1` · #230
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-127 · Erőforrás-optimalizálás S1 — az adatbázis elaludhat, 1 órás AI-gyorsítótár, kitelepítés futás közben

- **Azonosító** — R-TERV-127
- **Cím** — Erőforrás-optimalizálás S1 — az adatbázis elaludhat, 1 órás AI-gyorsítótár, kitelepítés futás közben
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szolgáltatás költségét és erőforrásigényét mérhetően csökkentse a kijelölt szelet.
- **Forrás** — `docs/specs/2026-10-19-eroforras-s1.md:50`, `docs/specs/2026-10-19-eroforras-s1-vegrehajtas.md:14`
- **Mi van kész** — A `anthropicClient` főági megvalósítását (`source/server/studio/single-run/conversation.ts:66`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/resource-s1.test.ts:21`). A korabeli mérés helye a #324 leírásának 30. sora.
- **Mi hiányzik** — Még ellenőrizendő: Ütemezés: HA a szerver fut, AKKOR a scheduled_jobs-t legfeljebb óránként kérdezi; a tanulási ellenőrzés legfeljebb. `docs/specs/2026-10-19-eroforras-s1.md:50`.
- **Folytatás helye** — `docs/specs/2026-10-19-eroforras-s1.md:1` · #324
- **Következő lépés** — A `anthropicClient` bemenetétől (`source/server/studio/single-run/conversation.ts:66`) kövesd az eredményt a `source/tests/resource-s1.test.ts:21` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-128 · Erőforrás-optimalizálás S2a — forgalom: karcsú listák, állapotfüggő lekérdezés, képvégpont

- **Azonosító** — R-TERV-128
- **Cím** — Erőforrás-optimalizálás S2a — forgalom: karcsú listák, állapotfüggő lekérdezés, képvégpont
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A szolgáltatás költségét és erőforrásigényét mérhetően csökkentse a kijelölt szelet.
- **Forrás** — `docs/specs/2026-10-19-eroforras-s2a.md:39`, `docs/specs/2026-10-19-eroforras-s2a-vegrehajtas.md:1`
- **Mi van kész** — A `slimRun` főági megvalósítását (`source/server/workflows/slim.ts:8`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/resource-s2a.test.ts:9`). A korabeli mérés helye a #325 leírásának 15. sora (2232/2232, 17/17).
- **Mi hiányzik** — Még ellenőrizendő: Futásnapló-lista: HA a futásnapló-listát kérik, AKKOR egyik elem sem tartalmaz visits-t és history-t; az egyes futás. `docs/specs/2026-10-19-eroforras-s2a.md:39`.
- **Folytatás helye** — `docs/specs/2026-10-19-eroforras-s2a.md:1` · #325
- **Következő lépés** — A `slimRun` bemenetétől (`source/server/workflows/slim.ts:8`) kövesd az eredményt a `source/tests/resource-s2a.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-141 · Játékélmény master-terv — mind a 7 játék (2026-09-07)

- **Azonosító** — R-TERV-141
- **Cím** — Játékélmény master-terv — mind a 7 játék (2026-09-07)
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A hét játék a korosztályhoz igazodjon, és hibás válasz esetén is segítse a tanulást.
- **Forrás** — `docs/specs/2026-09-07-jatekelmeny-master-terv.md:68`
- **Mi van kész** — A `buildFeedback` főági megvalósítását (`source/client/src/game-engine/feedback.ts:131`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/game-feedback.test.ts:41`).
- **Mi hiányzik** — Még ellenőrizendő: Kész, ha: az 5 teszt zöld, és a motor egyetlen játékhoz sincs kötve. `docs/specs/2026-09-07-jatekelmeny-master-terv.md:102`.
- **Folytatás helye** — `docs/specs/2026-09-07-jatekelmeny-master-terv.md:1`
- **Következő lépés** — A `buildFeedback` bemenetétől (`source/client/src/game-engine/feedback.ts:131`) kövesd az eredményt a `source/tests/game-feedback.test.ts:41` esetig. A még nem igazolt bemenetet ezen az úton vesd össze a terv elfogadási feltételével.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-143 · Egységes, köralakú joystick-vezérlés minden irányvezérléses játékban (2026-09-20)

- **Azonosító** — R-TERV-143
- **Cím** — Egységes, köralakú joystick-vezérlés minden irányvezérléses játékban (2026-09-20)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A mozgásvezérlő használható legyen érintőképernyőn, és a játék megállapíthatóan reagáljon rá.
- **Forrás** — `docs/specs/2026-09-20-joystick-minden-jatekban.md:56`
- **Mi van kész** — A `joystickVector` főági megvalósítását (`source/client/src/game-engine/joystick.ts:50`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/game-touch-controls.test.ts:82`). A korabeli mérés helye a #103 leírásának 18. sora (1365/1365).
- **Mi hiányzik** — Még ellenőrizendő: WHEN bármelyik irányvezérléses játék érintőképernyőn fut THEN a lapon pontosan egy. `docs/specs/2026-09-20-joystick-minden-jatekban.md:56`.
- **Folytatás helye** — `docs/specs/2026-09-20-joystick-minden-jatekban.md:1` · #103
- **Következő lépés** — A `joystickVector` bemenetétől (`source/client/src/game-engine/joystick.ts:50`) kövesd az eredményt a `source/tests/game-touch-controls.test.ts:82` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-145 · Végrehajtás — E szelet: 10 pálya a 6 játékban (2026-09-29)

- **Azonosító** — R-TERV-145
- **Cím** — Végrehajtás — E szelet: 10 pálya a 6 játékban (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A kijelölt évfolyamokon tíz, érzékelhetően különböző pályán haladhasson a játékos.
- **Forrás** — `docs/specs/2026-09-29-jatekok-10-palya-vegrehajtas.md:1`
- **Mi van kész** — A `createAdaptiveSession` főági megvalósítását (`source/client/src/game-engine/adaptiveSession.ts:10`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/game-levels-wiring.test.ts:29`). A korabeli mérés helye a #145 leírásának 15. sora (1726/1726, 390/1280, 52/52).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-09-29-jatekok-10-palya-vegrehajtas.md:1` · #145
- **Következő lépés** — A `createAdaptiveSession` bemenetétől (`source/client/src/game-engine/adaptiveSession.ts:10`) kövesd az eredményt a `source/tests/game-levels-wiring.test.ts:29` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-147 · Végrehajtás — évfolyam-bank bekötése az öt játékba (2026-09-29)

- **Azonosító** — R-TERV-147
- **Cím** — Végrehajtás — évfolyam-bank bekötése az öt játékba (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A 3–12. évfolyam kérdései a helyes játékhoz és nehézséghez legyenek bekötve.
- **Forrás** — `docs/specs/2026-09-29-jatekok-3-12-evfolyam-bekotes-vegrehajtas.md:1`
- **Mi van kész** — A `bandShiftForDifficulty` főági megvalósítását (`source/client/src/game-engine/gradeQuiz.ts:135`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/grade-quiz-select.test.ts:156`). A korabeli mérés helye a #136 leírásának 17. sora (1513/1513).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-09-29-jatekok-3-12-evfolyam-bekotes-vegrehajtas.md:1` · #136
- **Következő lépés** — A `bandShiftForDifficulty` bemenetétől (`source/client/src/game-engine/gradeQuiz.ts:135`) kövesd az eredményt a `source/tests/grade-quiz-select.test.ts:156` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-150 · Minden játék: évfolyamonként 10 nehezedő pálya · Szólétra: 3D kérdések, angol–német–francia, szókincs-kategóriák (2026-09-29)

- **Azonosító** — R-TERV-150
- **Cím** — Minden játék: évfolyamonként 10 nehezedő pálya · Szólétra: 3D kérdések, angol–német–francia, szókincs-kategóriák (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — A Szólétra kérdései, feliratai és tempója a célzott nyelvhez és a képernyőhöz igazodjanak.
- **Forrás** — `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md:92`
- **Mi van kész** — A `clampToLevel` főági megvalósítását (`source/client/src/game-engine/gradeLevels.ts:27`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/grade-levels.test.ts:22`). A korabeli mérés helye a #145 leírásának 15. sora (1726/1726, 390/1280, 52/52).
- **Mi hiányzik** — Még ellenőrizendő: A levelBand SHALL szigorúan növekvő legyen 1-től 10-ig, 0,15-től 0,95-ig; a clampToLevel SHALL a sávot a pálya sávja ±0,15-ön belül tartani (teszt). `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md:92`.
- **Folytatás helye** — `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md:1` · #145
- **Következő lépés** — A `clampToLevel` bemenetétől (`source/client/src/game-engine/gradeLevels.ts:27`) kövesd az eredményt a `source/tests/grade-levels.test.ts:22` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-152 · Szólétra — francia bank (D szelet) · végrehajtási utasítás

- **Azonosító** — R-TERV-152
- **Cím** — Szólétra — francia bank (D szelet) · végrehajtási utasítás
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A Szólétra kérdései, feliratai és tempója a célzott nyelvhez és a képernyőhöz igazodjanak.
- **Forrás** — `docs/specs/2026-09-29-szoletra-francia-bank-vegrehajtas.md:1`
- **Mi van kész** — A `ladderBankProblems` főági megvalósítását (`source/client/src/data/wordLadder/validate.ts:19`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/word-ladder-fr.test.ts:9`). A korabeli mérés helye a #145 leírásának 15. sora (1726/1726, 390/1280, 52/52).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-09-29-szoletra-francia-bank-vegrehajtas.md:1` · #145
- **Következő lépés** — A `ladderBankProblems` bemenetétől (`source/client/src/data/wordLadder/validate.ts:19`) kövesd az eredményt a `source/tests/word-ladder-fr.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-153 · Végrehajtás — Szólétra német bank (C szelet, 2026-09-29)

- **Azonosító** — R-TERV-153
- **Cím** — Végrehajtás — Szólétra német bank (C szelet, 2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A Szólétra kérdései, feliratai és tempója a célzott nyelvhez és a képernyőhöz igazodjanak.
- **Forrás** — `docs/specs/2026-09-29-szoletra-nemet-bank-vegrehajtas.md:6`
- **Mi van kész** — A `ladderBankProblems` főági megvalósítását (`source/client/src/data/wordLadder/validate.ts:19`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/word-ladder-de.test.ts:8`). A korabeli mérés helye a #145 leírásának 15. sora (1726/1726, 390/1280, 52/52).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-09-29-szoletra-nemet-bank-vegrehajtas.md:1` · #145
- **Következő lépés** — A `ladderBankProblems` bemenetétől (`source/client/src/data/wordLadder/validate.ts:19`) kövesd az eredményt a `source/tests/word-ladder-de.test.ts:8` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-164 · Retro — Játékok utómunka: piros main, E2E-ablakok, kérdésbank-mérés (2026-11-16 este – 2026-11-17 hajnal)

- **Azonosító** — R-TERV-164
- **Cím** — Retro — Játékok utómunka: piros main, E2E-ablakok, kérdésbank-mérés (2026-11-16 este – 2026-11-17 hajnal)
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A játszható menet és a gyakorlási feladat használhatóságát érinti.
- **Eredeti utasítás / cél** — Retro — Játékok utómunka: piros main, E2E-ablakok, kérdésbank-mérés (2026-11-16 este – 2026-11-17 hajnal).
- **Forrás** — `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md:12`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `source/server/gameQuizBankService.ts:167`; `source/tests/no-real-emails-guard.test.ts:116`. Történeti kapcsolat: #481. Rögzített eredmény: `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md:23`.
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md:1` · #481
- **Következő lépés** — A `source/server/gameQuizBankService.ts:167` útján kövesd a feltételt a `source/tests/no-real-emails-guard.test.ts:116` eseteivel összevetve. Az eredeti terv soraihoz rendeld hozzá az igazolt és a hiányzó kimenetet.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-053

### R-TERV-165 · Spec: a játékok kérdésbankjának karcsúsítása (kanban 101)

- **Azonosító** — R-TERV-165
- **Cím** — Spec: a játékok kérdésbankjának karcsúsítása (kanban 101)
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A közös bank fölösleges feldolgozása és a játék főszálának terhelése mérhetően csökkenjen.
- **Forrás** — `docs/specs/2026-11-17-kerdesbank-karcsusitas.md:115`, `docs/specs/2026-11-17-kerdesbank-karcsusitas-vegrehajtas.md:87`
- **Mi van kész** — A `canonicalBanks` főági megvalósítását (`source/server/studio/canonical-quiz-bank.ts:45`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/quiz-bank-scale-db.integration.ts:282`). A korabeli mérés helye a #101 leírásának 16. sora (1354/1354).
- **Mi hiányzik** — Még ellenőrizendő: (S1): WHEN a kliens ugyanazt a quiz-bankot másodszor kéri, és a bank nem változott THEN the server SHALL 304-et adni test nélkül. `docs/specs/2026-11-17-kerdesbank-karcsusitas.md:115`.
- **Folytatás helye** — `docs/specs/2026-11-17-kerdesbank-karcsusitas.md:1` · #101
- **Következő lépés** — A `canonicalBanks` bemenetétől (`source/server/studio/canonical-quiz-bank.ts:45`) kövesd az eredményt a `source/tests/quiz-bank-scale-db.integration.ts:282` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-009

### R-TERV-186 · Teljes rendszer-audit 2026-09-24 — leletek és javítások

- **Azonosító** — R-TERV-186
- **Cím** — Teljes rendszer-audit 2026-09-24 — leletek és javítások
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Teljes rendszer-audit 2026-09-24.
- **Forrás** — `docs/specs/2026-09-24-audit.md:1`
- **Mi van kész** — A `normalizeMaterialIdBatch` főági megvalósítását (`source/server/lib/public-input.ts:36`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/audit-2026-09-24.test.ts:8`). A korabeli mérés helye a #109 leírásának 6. sora (1393/0).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-09-24-audit.md:1` · #109
- **Következő lépés** — A `normalizeMaterialIdBatch` bemenetétől (`source/server/lib/public-input.ts:36`) kövesd az eredményt a `source/tests/audit-2026-09-24.test.ts:8` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-187 · Spec — Bank-ellenőr (Opus 5.5) a vak megoldókkal (2026-09-24)

- **Azonosító** — R-TERV-187
- **Cím** — Spec — Bank-ellenőr (Opus 5.5) a vak megoldókkal (2026-09-24)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A bank ellenőrzése tárja fel a hibás kulcsot, feladatot és javítási szempontot.
- **Forrás** — `docs/specs/2026-09-24-bank-ellenor.md:49`, `docs/specs/2026-09-24-bank-ellenor-vegrehajtas.md:1`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #120 leírásának 12. sora (1429/1429).
- **Mi hiányzik** — Még ellenőrizendő: HA a leckének van bankja és van vak megoldás, AKKOR a lektor-lépés fejezetenként egy bank-ellenőr. `docs/specs/2026-09-24-bank-ellenor.md:49`.
- **Folytatás helye** — `docs/specs/2026-09-24-bank-ellenor.md:1` · #120
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-189 · A 236 és a 237 review-leleteinek javítása — terv (2026-10-15)

- **Azonosító** — R-TERV-189
- **Cím** — A 236 és a 237 review-leleteinek javítása — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A megnevezett PR-ok ellenőrzése során talált konkrét hibák kerüljenek vissza a programba javításként.
- **Forrás** — `docs/specs/2026-10-15-review-236-237-javitas.md:37`, `docs/specs/2026-10-15-review-236-237-javitas-vegrehajtas.md:8`
- **Mi van kész** — A `decideThreePhase` főági megvalósítását (`scripts/qa/three-phase-check.mjs:21`) közvetlenül meghívja az állítást tartalmazó próba (`scripts/qa/three-phase-check.test.mjs:26`). A korabeli mérés helye a #236 leírásának 10. sora (6/6).
- **Mi hiányzik** — Még ellenőrizendő: HA az első kódcommit idején a végrehajtási fájl üres / nem hivatkozik létező tervre, AKKOR a CI piros. `docs/specs/2026-10-15-review-236-237-javitas.md:37`.
- **Folytatás helye** — `docs/specs/2026-10-15-review-236-237-javitas.md:1` · #236
- **Következő lépés** — A `decideThreePhase` bemenetétől (`scripts/qa/three-phase-check.mjs:21`) kövesd az eredményt a `scripts/qa/three-phase-check.test.mjs:26` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-190 · Review-követés: 247 (újraindulás utáni folytatás) és 248 (hiba-gombok) — terv (2026-10-15)

- **Azonosító** — R-TERV-190
- **Cím** — Review-követés: 247 (újraindulás utáni folytatás) és 248 (hiba-gombok) — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A megnevezett PR-ok ellenőrzése során talált konkrét hibák kerüljenek vissza a programba javításként.
- **Forrás** — `docs/specs/2026-10-15-review-247-248.md:16`, `docs/specs/2026-10-15-review-247-248-vegrehajtas.md:1`
- **Mi van kész** — A `buildLessonExperience` főági megvalósítását (`source/server/studio/experience-builder.ts:477`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-repair.test.ts:91`). A korabeli mérés helye a #247 leírásának 19. sora (2412/2412).
- **Mi hiányzik** — Még ellenőrizendő: HA ugyanabban a tételben jogos és jogosulatlan mező is változik, AKKOR a jogos érvényes, a jogosulatlan az eredeti. `docs/specs/2026-10-15-review-247-248.md:16`.
- **Folytatás helye** — `docs/specs/2026-10-15-review-247-248.md:1` · #247
- **Következő lépés** — A `buildLessonExperience` bemenetétől (`source/server/studio/experience-builder.ts:477`) kövesd az eredményt a `source/tests/bank-repair.test.ts:91` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-191 · Végrehajtási utasítás — Tételgyár review-követés (225, 226, 227 észrevételei) és a D5 pótolt végrehajtási leírása

- **Azonosító** — R-TERV-191
- **Cím** — Végrehajtási utasítás — Tételgyár review-követés (225, 226, 227 észrevételei) és a D5 pótolt végrehajtási leírása
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-review-kovetes-vegrehajtas.md:8`
- **Mi van kész** — A `bankUnitQuota` főági megvalósítását (`source/shared/lesson-bank-plan.ts:19`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-item-ref.test.ts:53`). A korabeli mérés helye a #225 leírásának 15. sora (2314/2314).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-review-kovetes-vegrehajtas.md:1` · #225
- **Következő lépés** — A `bankUnitQuota` bemenetétől (`source/shared/lesson-bank-plan.ts:19`) kövesd az eredményt a `source/tests/bank-item-ref.test.ts:53` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-221 · Háromfázisú munka — kötelező (tulajdonosi utasítás 2026-09-09)

- **Azonosító** — R-TERV-221
- **Cím** — Háromfázisú munka — kötelező (tulajdonosi utasítás 2026-09-09)
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A terv, a végrehajtási utasítás és a kód sorrendje a CI-ben is ellenőrizhető legyen.
- **Forrás** — `docs/agent-haromfazisu-munka.md:8`, `docs/specs/_TEMPLATE.md:29`, `docs/specs/contract-template.yaml:1`
- **Mi van kész** — A `extractGeneratedHtml` főági megvalósítását (`source/server/studio/web-research-agent.ts:29`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/web-research-agent.test.ts:16`). A korabeli mérés helye a #489 leírásának 30. sora (84/84).
- **Mi hiányzik** — Még ellenőrizendő: blokkolónál: NOT DONE + ok + kockázat. `docs/agent-haromfazisu-munka.md:35`.
- **Folytatás helye** — `docs/agent-haromfazisu-munka.md:1` · #489
- **Következő lépés** — A `extractGeneratedHtml` bemenetétől (`source/server/studio/web-research-agent.ts:29`) kövesd az eredményt a `source/tests/web-research-agent.test.ts:16` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-228 · Egységes tanulási folyamat és magyar tipográfia

- **Azonosító** — R-TERV-228
- **Cím** — Egységes tanulási folyamat és magyar tipográfia
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanuló a tanításból az önálló gyakorlásba, onnan az eredményhez jusson.
- **Forrás** — `docs/specs/2026-09-10-lesson-learning-flow.md:29`, `docs/specs/2026-09-10-lesson-learning-flow-vegrehajtas.md:62`
- **Mi van kész** — A `canonicalLessonQuiz` főági megvalósítását (`source/server/studio/canonical-quiz-bank.ts:24`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/learning-db.integration.ts:201`). A korabeli mérés helye a #45 leírásának 16. sora.
- **Mi hiányzik** — Még ellenőrizendő: Nem cél: új LMS, gráfadatbázis, válaszonkénti AI-hívás, önkényes éles tartalomtörlés, nem mért pedagógiai hatásosság ígérete. A gyermekes, késleltetett hatásvizsgálat…. `docs/specs/2026-09-10-lesson-learning-flow.md:9`.
- **Folytatás helye** — `docs/specs/2026-09-10-lesson-learning-flow.md:1` · #45
- **Következő lépés** — A `canonicalLessonQuiz` bemenetétől (`source/server/studio/canonical-quiz-bank.ts:24`) kövesd az eredményt a `source/tests/learning-db.integration.ts:201` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-230 · Tananyagkészítés: egyszerűsítés a tudás és a játékos tanulás megtartásával

- **Azonosító** — R-TERV-230
- **Cím** — Tananyagkészítés: egyszerűsítés a tudás és a játékos tanulás megtartásával
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanulói folyamatból a fölösleges lépéseket a tartalmi és pontozási szabályok megőrzésével kell kivenni.
- **Forrás** — `docs/specs/2026-09-10-lesson-simplification-decision.md:151`
- **Mi van kész** — A `pickLessonTheme` főági megvalósítását (`source/server/ai/lesson-html-spec.ts:187`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-html-spec.test.ts:51`). A korabeli mérés helye a #45 leírásának 16. sora.
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-09-10-lesson-simplification-decision.md:1` · #45
- **Következő lépés** — A `pickLessonTheme` bemenetétől (`source/server/ai/lesson-html-spec.ts:187`) kövesd az eredményt a `source/tests/lesson-html-spec.test.ts:51` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-231 · Kötelező WebSuli 7.4 minimum és tanulói használhatóság

- **Azonosító** — R-TERV-231
- **Cím** — Kötelező WebSuli 7.4 minimum és tanulói használhatóság
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A 7.4 minőségi követelmények az elkészült, megnyitható tananyagban is teljesüljenek.
- **Forrás** — `docs/specs/2026-09-12-lesson-quality-v74.md:31`, `docs/handoffs/2026-09-12-lesson-quality-v74.md:38`, `docs/specs/2026-09-12-lesson-quality-v74-vegrehajtas.md:9`
- **Mi van kész** — A `fetchedTeachingSources` főági megvalósítását (`source/server/studio/web-teaching-review.ts:16`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-teaching-quality.test.ts:27`). A korabeli mérés helye a #61 leírásának 13. sora.
- **Mi hiányzik** — Még ellenőrizendő: Önálló diff-review a terv összes elfogadási pontjára. git diff --check, npm.cmd run verify, npm.cmd run test:learning-db, célzott böngészőfutások. A hibákat ok szerint…. `docs/specs/2026-09-12-lesson-quality-v74-vegrehajtas.md:9`.
- **Folytatás helye** — `docs/specs/2026-09-12-lesson-quality-v74.md:1` · #61
- **Következő lépés** — A `fetchedTeachingSources` bemenetétől (`source/server/studio/web-teaching-review.ts:16`) kövesd az eredményt a `source/tests/lesson-teaching-quality.test.ts:27` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-234 · Spec: színes, figyelemfelkeltő tananyag — vizuális világ a tervező fázisból

- **Azonosító** — R-TERV-234
- **Cím** — Spec: színes, figyelemfelkeltő tananyag — vizuális világ a tervező fázisból
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tananyag megjelenése az évfolyamhoz és a lecke témájához igazodjon.
- **Forrás** — `docs/specs/2026-09-20-colorful-lessons.md:42`
- **Mi van kész** — A `pickVisualWorld` főági megvalósítását (`source/shared/lesson-visuals.ts:89`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-visuals.test.ts:13`). A korabeli mérés helye a #91 leírásának 11. sora (1342/1342).
- **Mi hiányzik** — Még ellenőrizendő: Kapuk: tsc, check:test, lint, npm test; valódi futás done-nal, a lecke élesben színes világgal. `docs/specs/2026-09-20-colorful-lessons.md:49`.
- **Folytatás helye** — `docs/specs/2026-09-20-colorful-lessons.md:1` · #91
- **Következő lépés** — A `pickVisualWorld` bemenetétől (`source/shared/lesson-visuals.ts:89`) kövesd az eredményt a `source/tests/lesson-visuals.test.ts:13` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-235 · Külön „Tananyagjavító” menüpont

- **Azonosító** — R-TERV-235
- **Cím** — Külön „Tananyagjavító” menüpont
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az admin elérje és követhetően alkalmazhassa a korábbi tananyag javítását.
- **Forrás** — `docs/specs/2026-09-23-lesson-repair-menu.md:17`, `docs/specs/2026-09-23-lesson-repair-menu-vegrehajtas.md:1`
- **Mi van kész** — A `buildStructuredImprovement` főági megvalósítását (`source/server/studio/structured-improvement.ts:154`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/owner-instructions-repair.test.ts:99`). A korabeli mérés helye a #104 leírásának 17. sora (1379/0).
- **Mi hiányzik** — Még ellenőrizendő: Az új fül megjelenik az admin felületen, a lista csak strukturált leckéket mutat. (böngészős próba vagy build + kódellenőrzés). `docs/specs/2026-09-23-lesson-repair-menu.md:17`.
- **Folytatás helye** — `docs/specs/2026-09-23-lesson-repair-menu.md:1` · #104
- **Következő lépés** — A `buildStructuredImprovement` bemenetétől (`source/server/studio/structured-improvement.ts:154`) kövesd az eredményt a `source/tests/owner-instructions-repair.test.ts:99` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-236 · Tanári kérés a készítéshez, javító modul a lecke alatt, lektor-kalibrálás átírási hibára

- **Azonosító** — R-TERV-236
- **Cím** — Tanári kérés a készítéshez, javító modul a lecke alatt, lektor-kalibrálás átírási hibára
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az admin elérje és követhetően alkalmazhassa a korábbi tananyag javítását.
- **Forrás** — `docs/specs/2026-09-23-owner-instructions-and-lesson-repair.md:37`, `docs/specs/2026-09-23-owner-instructions-and-lesson-repair-vegrehajtas.md:1`
- **Mi van kész** — A `filterSourceCorrections` főági megvalósítását (`source/server/studio/source-corrections.ts:125`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/owner-instructions-repair.test.ts:18`). A korabeli mérés helye a #104 leírásának 17. sora (1379/0).
- **Mi hiányzik** — Még ellenőrizendő: Ha ugyanaz a forrás már fel volt dolgozva ÉS van kérés: nem a régi leckét adjuk vissza, hanem a meglévő térképből új gyártás indul. `docs/specs/2026-09-23-owner-instructions-and-lesson-repair.md:37`.
- **Folytatás helye** — `docs/specs/2026-09-23-owner-instructions-and-lesson-repair.md:1` · #104
- **Következő lépés** — A `filterSourceCorrections` bemenetétől (`source/server/studio/source-corrections.ts:125`) kövesd az eredményt a `source/tests/owner-instructions-repair.test.ts:18` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-239 · Magyarázó ábrák — a primitív ábragenerátor lecserélése (2026-09-24)

- **Azonosító** — R-TERV-239
- **Cím** — Magyarázó ábrák — a primitív ábragenerátor lecserélése (2026-09-24)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az ábrák a tananyag állításait magyarázzák, és a felirataik olvashatók legyenek.
- **Forrás** — `docs/specs/2026-09-24-magyarazo-abrak.md:6`, `docs/specs/2026-09-24-magyarazo-abrak-vegrehajtas.md:5`
- **Mi van kész** — A `modelFamily` főági megvalósítását (`source/server/ai/models.ts:201`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/models-routing.test.ts:24`). A korabeli mérés helye a #117 leírásának 8. sora (1415/1415).
- **Mi hiányzik** — Még ellenőrizendő: HA a lecke holdfázisokat tanít, AKKOR a fejezet ábrája cycle (moon) vagy illustration, legalább 4 megnevezett fázissal — élő futáson mérve. `docs/specs/2026-09-24-magyarazo-abrak.md:41`.
- **Folytatás helye** — `docs/specs/2026-09-24-magyarazo-abrak.md:1` · #117
- **Következő lépés** — A `modelFamily` bemenetétől (`source/server/ai/models.ts:201`) kövesd az eredményt a `source/tests/models-routing.test.ts:24` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-242 · Lecke megnyitása: egyetlen, sávszínű betöltés, és a mentéskor rögzített arculat — terv

- **Azonosító** — R-TERV-242
- **Cím** — Lecke megnyitása: egyetlen, sávszínű betöltés, és a mentéskor rögzített arculat — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik.
- **Eredeti utasítás / cél** — A lecke gyorsan, egyetlen követhető betöltési állapoton át jelenjen meg.
- **Forrás** — `docs/specs/2026-10-17-lecke-betoltes.md:68`, `docs/specs/2026-10-17-lecke-betoltes-vegrehajtas.md:32`
- **Mi van kész** — A `lessonArtIds` főági megvalósítását (`source/shared/design-assets.ts:147`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/stored-art.test.ts:11`). A korabeli mérés helye a #275 leírásának 26. sora (61/61).
- **Mi hiányzik** — Még ellenőrizendő: HA egy lecke megnyílik, AKKOR legfeljebb egy töltőképernyő látszik, és ismert évfolyamnál annak háttere a sáv felülete. `docs/specs/2026-10-17-lecke-betoltes.md:68`.
- **Folytatás helye** — `docs/specs/2026-10-17-lecke-betoltes.md:1` · #275
- **Következő lépés** — A `lessonArtIds` bemenetétől (`source/shared/design-assets.ts:147`) kövesd az eredményt a `source/tests/stored-art.test.ts:11` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-249 · Leckénkénti, tartalomhoz illő borítókép minden éles leckének

- **Azonosító** — R-TERV-249
- **Cím** — Leckénkénti, tartalomhoz illő borítókép minden éles leckének
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke témájához illő borító készüljön, és a már jóváhagyott borító ne íródjon felül.
- **Forrás** — `docs/specs/2026-11-03-leckeborito.md:85`, `docs/specs/2026-11-03-leckeborito-vegrehajtas.md:5`
- **Mi van kész** — A `pickLessonArt` főági megvalósítását (`source/shared/design-assets.ts:97`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-cover-key.test.ts:32`). A korabeli mérés helye a #382 leírásának 25. sora (390 / 1280).
- **Mi hiányzik** — Még ellenőrizendő: HA két lecke sávja, tantárgya és címe ékezet- / írásjel- / kis-nagybetű-eltéréstől eltekintve azonos, AKKOR a lessonCoverId azonos. `docs/specs/2026-11-03-leckeborito.md:85`.
- **Folytatás helye** — `docs/specs/2026-11-03-leckeborito.md:1` · #382
- **Következő lépés** — A `pickLessonArt` bemenetétől (`source/shared/design-assets.ts:97`) kövesd az eredményt a `source/tests/lesson-cover-key.test.ts:32` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-251 · Leckeborító-utómunka: gyengén illeszkedő képek cseréje, lecke nélküli anyagok borítója

- **Azonosító** — R-TERV-251
- **Cím** — Leckeborító-utómunka: gyengén illeszkedő képek cseréje, lecke nélküli anyagok borítója
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke témájához illő borító készüljön, és a már jóváhagyott borító ne íródjon felül.
- **Forrás** — `docs/specs/2026-11-03-leckeborito-utomunka.md:41`, `docs/specs/2026-11-03-leckeborito-utomunka-vegrehajtas.md:5`
- **Mi van kész** — A `materialCoverId` főági megvalósítását (`source/shared/lesson-cover.ts:43`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/material-covers.test.ts:9`). A korabeli mérés helye a #386 leírásának 17. sora (2547/2547).
- **Mi hiányzik** — Még ellenőrizendő: HA a 4 lecke megnyílik, AKKOR az új, tartalomhű kép látszik (élesben, 390 és 1280 px); HA a főoldal betölt, AKKOR a 4 anyag kártyáján is. `docs/specs/2026-11-03-leckeborito-utomunka.md:43`.
- **Folytatás helye** — `docs/specs/2026-11-03-leckeborito-utomunka.md:1` · #386
- **Következő lépés** — A `materialCoverId` bemenetétől (`source/shared/lesson-cover.ts:43`) kövesd az eredményt a `source/tests/material-covers.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-253 · Spec: az ellenőrző kérdés és a záró összefoglaló fejléce a tartalomból

- **Azonosító** — R-TERV-253
- **Cím** — Spec: az ellenőrző kérdés és a záró összefoglaló fejléce a tartalomból
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A lecke fejléce a valós tartalmat írja le a technikai típusnév helyett.
- **Forrás** — `docs/specs/2026-11-08-tartalmi-fejlecek-2.md:29`, `docs/specs/2026-11-08-tartalmi-fejlecek-2-vegrehajtas.md:5`
- **Mi van kész** — A `blockLabel` főági megvalósítását (`source/shared/lesson-block-label.ts:83`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-block-label.test.ts:54`). A korabeli mérés helye a #406 leírásának 8. sora (2617/2617).
- **Mi hiányzik** — Még ellenőrizendő: WHEN a check kérdése a felsorolt formák egyike THEN a blockLabel SHALL a forma nevét adja; egyébként a sáv címkéjét. `docs/specs/2026-11-08-tartalmi-fejlecek-2.md:29`.
- **Folytatás helye** — `docs/specs/2026-11-08-tartalmi-fejlecek-2.md:1` · #406
- **Következő lépés** — A `blockLabel` bemenetétől (`source/shared/lesson-block-label.ts:83`) kövesd az eredményt a `source/tests/lesson-block-label.test.ts:54` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-255 · Spec: Fejezetenkénti rajzfilmes kisfilmek a leckékben

- **Azonosító** — R-TERV-255
- **Cím** — Spec: Fejezetenkénti rajzfilmes kisfilmek a leckékben
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanuló fejezetenként kapjon lejátszható kisfilmet, a gyártás férjen bele az erőforráskorlátokba.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek.md:78`, `docs/specs/2026-11-10-fejezet-kisfilmek-vegrehajtas.md:6`
- **Mi van kész** — A `animateBlockIndexes` főági megvalósítását (`source/shared/lesson-clip.ts:87`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-clip.test.ts:22`). A korabeli mérés helye a #417 leírásának 27. sora (23/23).
- **Mi hiányzik** — Még ellenőrizendő: WHEN egy publikált lecke fejezetéhez kész kisfilm van THEN a lejátszó a fejezetcím mellett „Kisfilm” gombot SHALL mutatni, és arra a kisfilm elindul. `docs/specs/2026-11-10-fejezet-kisfilmek.md:150`.
- **Folytatás helye** — `docs/specs/2026-11-10-fejezet-kisfilmek.md:1` · #417
- **Következő lépés** — A `animateBlockIndexes` bemenetétől (`source/shared/lesson-clip.ts:87`) kövesd az eredményt a `source/tests/lesson-clip.test.ts:22` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-041

### R-TERV-257 · Végrehajtási utasítás: fejezet-kisfilmek v2 — P1 (tárolás, kiszolgálás, a v1 kivezetése) és P2 (háttérgyártás)

- **Azonosító** — R-TERV-257
- **Cím** — Végrehajtási utasítás: fejezet-kisfilmek v2 — P1 (tárolás, kiszolgálás, a v1 kivezetése) és P2 (háttérgyártás)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanuló fejezetenként kapjon lejátszható kisfilmet, a gyártás férjen bele az erőforráskorlátokba.
- **Forrás** — `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md:1`
- **Mi van kész** — A `clipSourceHash` főági megvalósítását (`source/server/lesson-clips.ts:34`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-clip-worker.test.ts:190`). A korabeli mérés helye a #417 leírásának 27. sora (23/23).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md:1` · #417
- **Következő lépés** — A `clipSourceHash` bemenetétől (`source/server/lesson-clips.ts:34`) kövesd az eredményt a `source/tests/lesson-clip-worker.test.ts:190` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-041

### R-TERV-268 · Tananyaggyártás: egységes forrásátirat és tartós futásjelzés

- **Azonosító** — R-TERV-268
- **Cím** — Tananyaggyártás: egységes forrásátirat és tartós futásjelzés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás a valóban kiolvasott és visszaellenőrizhető forrásszövegre épüljön.
- **Forrás** — `docs/specs/2026-09-11-generation-source-transcript.md:25`, `docs/specs/2026-09-11-generation-source-transcript-vegrehajtas.md:1`
- **Mi van kész** — A `checkSourceQuotes` főági megvalósítását (`source/server/studio/source-transcript.ts:33`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/studio-source-transcript.test.ts:14`). A korabeli mérés helye a #47 leírásának 5. sora.
- **Mi hiányzik** — Még ellenőrizendő: Lint, típusellenőrzések, tesztek, build, PR CI, merge és mindkét éles komponens ellenőrzött telepítése szükséges. `docs/specs/2026-09-11-generation-source-transcript.md:29`.
- **Folytatás helye** — `docs/specs/2026-09-11-generation-source-transcript.md:1` · #47
- **Következő lépés** — A `checkSourceQuotes` bemenetétől (`source/server/studio/source-transcript.ts:33`) kövesd az eredményt a `source/tests/studio-source-transcript.test.ts:14` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-271 · Teljes tanulási folyamat kiadása

- **Azonosító** — R-TERV-271
- **Cím** — Teljes tanulási folyamat kiadása
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanulói termék ellenőrzött változata kerüljön kiadásra, a kiadás után visszamérhető állapotban.
- **Forrás** — `docs/specs/2026-09-11-learning-product-release.md:14`, `docs/specs/2026-09-11-learning-product-release-vegrehajtas.md:1`
- **Mi van kész** — A `canonicalLessonQuiz` főági megvalósítását (`source/server/studio/canonical-quiz-bank.ts:24`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/learning-db.integration.ts:201`). A korabeli mérés helye a #45 leírásának 16. sora.
- **Mi hiányzik** — Még ellenőrizendő: Játékbónuszhoz a szerver kapja és ellenőrzi a választ; a hibás első válasz sem cserélhető később jutalomért. Párhuzamos kérés, idegen kupon, lejárat és bankcsere nem ad…. `docs/specs/2026-09-11-learning-product-release.md:13`.
- **Folytatás helye** — `docs/specs/2026-09-11-learning-product-release.md:1` · #45
- **Következő lépés** — A `canonicalLessonQuiz` bemenetétől (`source/server/studio/canonical-quiz-bank.ts:24`) kövesd az eredményt a `source/tests/learning-db.integration.ts:201` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-272 · Növényes forrásátirat forráshű javítása

- **Azonosító** — R-TERV-272
- **Cím** — Növényes forrásátirat forráshű javítása
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A gyártás a valóban kiolvasott és visszaellenőrizhető forrásszövegre épüljön.
- **Forrás** — `docs/specs/2026-09-11-plant-source-transcript-repair.md:12`, `docs/specs/2026-09-11-plant-source-transcript-repair-vegrehajtas.md:1`
- **Mi van kész** — A `buildLessonExperience` főági megvalósítását (`source/server/studio/experience-builder.ts:477`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-experience.test.ts:140`). A korabeli mérés helye a #50 leírásának 5. sora.
- **Mi hiányzik** — Még ellenőrizendő: Előbb teljes visszaállítható adatmentés és csak olvasó dry-run; a régi sorok teljes helyi pillanatképe. `docs/specs/2026-09-11-plant-source-transcript-repair.md:12`.
- **Folytatás helye** — `docs/specs/2026-09-11-plant-source-transcript-repair.md:1` · #50
- **Következő lépés** — A `buildLessonExperience` bemenetétől (`source/server/studio/experience-builder.ts:477`) kövesd az eredményt a `source/tests/lesson-experience.test.ts:140` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-273 · Régi HTML tanítás teljes áttekintése

- **Azonosító** — R-TERV-273
- **Cím** — Régi HTML tanítás teljes áttekintése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A régi tananyagban is követhető legyen a tanítás áttekintése.
- **Forrás** — `docs/specs/2026-09-12-legacy-teaching-overview.md:9`, `docs/specs/2026-09-12-legacy-teaching-overview-vegrehajtas.md:1`
- **Mi van kész** — A `withLessonTypography` főági megvalósítását (`source/shared/lesson-typography.ts:51`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/html-lesson-quality.browser.ts:9`). A korabeli mérés helye a #62 leírásának 5. sora (320/390, 844/1366).
- **Mi hiányzik** — Még ellenőrizendő: Elfogadás: ha egy régi tanítópanel több pg-ch fejezetből áll és a régi script elrejti a továbbiakat, mindegyik egyszerre olvasható marad. A régi lapozó nincs jelen a…. `docs/specs/2026-09-12-legacy-teaching-overview.md:9`.
- **Folytatás helye** — `docs/specs/2026-09-12-legacy-teaching-overview.md:1` · #62
- **Következő lépés** — A `withLessonTypography` bemenetétől (`source/shared/lesson-typography.ts:51`) kövesd az eredményt a `source/tests/html-lesson-quality.browser.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-283 · Élő próba: felvételi feladatlap PDF → gyakorló tananyag (2026-09-24)

- **Azonosító** — R-TERV-283
- **Cím** — Élő próba: felvételi feladatlap PDF → gyakorló tananyag (2026-09-24)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A valódi PDF-próba során feltárt tartalmi és feldolgozási hibákra legyen regressziós bizonyíték.
- **Forrás** — `docs/specs/2026-09-24-live-exam-pdf.md:35`, `docs/specs/2026-09-24-live-exam-pdf-vegrehajtas.md:1`
- **Mi van kész** — A `falseArithmeticClaims` főági megvalósítását (`source/server/studio/tools/arithmetic-claims.ts:29`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/live-exam-pdf-2026-09-24.test.ts:53`). A korabeli mérés helye a #112 leírásának 6. sora (1396/1396).
- **Mi hiányzik** — Még ellenőrizendő: HA a lánc előtt számot/zárójelet követő műveleti jel áll, AKKOR az őr nem jelez. `docs/specs/2026-09-24-live-exam-pdf.md:35`.
- **Folytatás helye** — `docs/specs/2026-09-24-live-exam-pdf.md:1` · #112
- **Következő lépés** — A `falseArithmeticClaims` bemenetétől (`source/server/studio/tools/arithmetic-claims.ts:29`) kövesd az eredményt a `source/tests/live-exam-pdf-2026-09-24.test.ts:53` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-284 · Körlimiten maradt hibás ellenőrző kérdés (check blokk): a blokk esik ki, nem a lecke (2026-09-29)

- **Azonosító** — R-TERV-284
- **Cím** — Körlimiten maradt hibás ellenőrző kérdés (check blokk): a blokk esik ki, nem a lecke (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A javítási korlátnál a lokális hiba ne semmisítse meg az egész használható leckét.
- **Forrás** — `docs/specs/2026-09-29-limit-check-kivetel.md:30`, `docs/specs/2026-09-29-limit-check-kivetel-vegrehajtas.md:1`
- **Mi van kész** — A `checkBlockPath` főági megvalósítását (`source/shared/bank-item-ref.ts:55`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-item-ref.test.ts:43`). A korabeli mérés helye a #142 leírásának 13. sora (1656/1656).
- **Mi hiányzik** — Még ellenőrizendő: A limiten a banktételre és egy check blokkra mutató blokkolókkal a lektor-lépés SHALL a kapura lépni; a kapu SHALL mindkettőt kivenni és publikálni (teszt; a régi kódon a…. `docs/specs/2026-09-29-limit-check-kivetel.md:31`.
- **Folytatás helye** — `docs/specs/2026-09-29-limit-check-kivetel.md:1` · #142
- **Következő lépés** — A `checkBlockPath` bemenetétől (`source/shared/bank-item-ref.ts:55`) kövesd az eredményt a `source/tests/bank-item-ref.test.ts:43` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-291 · Gyökérok-elemzés és egyben-javítás — Studio tananyag-pipeline (2026-10-01)

- **Azonosító** — R-TERV-291
- **Cím** — Gyökérok-elemzés és egyben-javítás — Studio tananyag-pipeline (2026-10-01)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az ismétlődő gyártási megállások közös okát a teljes futási út mentén kell kezelni.
- **Forrás** — `docs/specs/2026-10-01-gyokerok-egyben.md:88`, `docs/specs/2026-10-01-gyokerok-egyben-vegrehajtas.md:1`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #177 leírásának 11. sora (1890/1890).
- **Mi hiányzik** — Még ellenőrizendő: Teljes unit + E2E zöld; ezután EGY fizetős élő futás bizonyítékként (tulajdonosi engedély megvan). `docs/specs/2026-10-01-gyokerok-egyben.md:96`.
- **Folytatás helye** — `docs/specs/2026-10-01-gyokerok-egyben.md:1` · #177
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-293 · Limiten a hibás tétel kivétele után lazított fejezet-csomag (2026-10-01)

- **Azonosító** — R-TERV-293
- **Cím** — Limiten a hibás tétel kivétele után lazított fejezet-csomag (2026-10-01)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A javítási korlátnál a lokális hiba ne semmisítse meg az egész használható leckét.
- **Forrás** — `docs/specs/2026-10-01-limit-csomag-lazitas.md:15`, `docs/specs/2026-10-01-limit-csomag-lazitas-vegrehajtas.md:1`
- **Mi van kész** — A `experienceProblems` főági megvalósítását (`source/shared/lesson-experience-validation.ts:7`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/limit-trimmed-packets.test.ts:80`). A korabeli mérés helye a #173 leírásának 9. sora (1876/1876).
- **Mi hiányzik** — Még ellenőrizendő: AKKOR a lecke publikál, trimmedSections jelöléssel és minőségi jegyzettel; HA bármely fogalomnak nem marad nyílt feladata,. `docs/specs/2026-10-01-limit-csomag-lazitas.md:15`.
- **Folytatás helye** — `docs/specs/2026-10-01-limit-csomag-lazitas.md:1` · #173
- **Következő lépés** — A `experienceProblems` bemenetétől (`source/shared/lesson-experience-validation.ts:7`) kövesd az eredményt a `source/tests/limit-trimmed-packets.test.ts:80` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-294 · GPT-6.1 Sol modellváltás + KV-cache maximalizálás (2026-10-03)

- **Azonosító** — R-TERV-294
- **Cím** — GPT-6.1 Sol modellváltás + KV-cache maximalizálás (2026-10-03)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A kiválasztott modellnél a bemenet ismétlődő részeire legyen mérhető gyorsítótár-használat.
- **Forrás** — `docs/specs/2026-10-03-gpt61-sol-kv-cache.md:38`, `docs/specs/2026-10-03-gpt61-sol-kv-cache-vegrehajtas.md:1`
- **Mi van kész** — A `cacheConversation` főági megvalósítását (`source/server/ai/prompt-cache.ts:33`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/prompt-cache.test.ts:11`). A korabeli mérés helye a #180 leírásának 15. sora (1904/1904).
- **Mi hiányzik** — Még ellenőrizendő: HA egy útvonal Anthropic-hívást tesz statikus rendszerprompttal, AKKOR a statikus rész az első, cache_control-os blokk, és. `docs/specs/2026-10-03-gpt61-sol-kv-cache.md:38`.
- **Folytatás helye** — `docs/specs/2026-10-03-gpt61-sol-kv-cache.md:1` · #180
- **Következő lépés** — A `cacheConversation` bemenetétől (`source/server/ai/prompt-cache.ts:33`) kövesd az eredményt a `source/tests/prompt-cache.test.ts:11` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-295 · Élő próba leletei — 3 determinisztikus hiba (2026-10-04)

- **Azonosító** — R-TERV-295
- **Cím** — Élő próba leletei — 3 determinisztikus hiba (2026-10-04)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A valódi gyártási próbán megfigyelt hibák visszajátszhatók és külön javíthatók legyenek.
- **Forrás** — `docs/specs/2026-10-04-elo-proba-leletek.md:40`, `docs/specs/2026-10-04-elo-proba-leletek-vegrehajtas.md:5`
- **Mi van kész** — A `checkGrounding` főági megvalósítását (`source/server/studio/grounding.ts:58`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/grounding-formula.test.ts:10`). A korabeli mérés helye a #184 leírásának 24. sora (1919/1919).
- **Mi hiányzik** — Még ellenőrizendő: referenceValue("+3") = 3, referenceValue("+(-6)") = -6, referenceValue("(+3)") = 3; a „+3” referenciájú helyes válasz teljes pont. `docs/specs/2026-10-04-elo-proba-leletek.md:40`.
- **Folytatás helye** — `docs/specs/2026-10-04-elo-proba-leletek.md:1` · #184
- **Következő lépés** — A `checkGrounding` bemenetétől (`source/server/studio/grounding.ts:58`) kövesd az eredményt a `source/tests/grounding-formula.test.ts:10` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-296 · Képlet-biztos szöveg-heurisztikák — egy közös modul (2026-10-04)

- **Azonosító** — R-TERV-296
- **Cím** — Képlet-biztos szöveg-heurisztikák — egy közös modul (2026-10-04)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A képlettel vagy számmal írt válasz igazságát a formázás ne rontsa el.
- **Forrás** — `docs/specs/2026-10-04-kepletbiztos-heurisztikak.md:47`, `docs/specs/2026-10-04-kepletbiztos-heurisztikak-vegrehajtas.md:1`
- **Mi van kész** — A `containsFormula` főági megvalósítását (`source/shared/formula-text.ts:73`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/formula-text.test.ts:37`). A korabeli mérés helye a #186 leírásának 28. sora (1928/1928).
- **Mi hiányzik** — Még ellenőrizendő: művelet + szám/zárójel; egyenlet-képletnél a bal oldal + a láncban később álló „= jobb oldal” is egyezés). Mind a 7 hely ezt. `docs/specs/2026-10-04-kepletbiztos-heurisztikak.md:28`.
- **Folytatás helye** — `docs/specs/2026-10-04-kepletbiztos-heurisztikak.md:1` · #186
- **Következő lépés** — A `containsFormula` bemenetétől (`source/shared/formula-text.ts:73`) kövesd az eredményt a `source/tests/formula-text.test.ts:37` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-297 · Tanári kérés pontjai — képlet-sor mint betűhű forrás-idézet (2026-10-04)

- **Azonosító** — R-TERV-297
- **Cím** — Tanári kérés pontjai — képlet-sor mint betűhű forrás-idézet (2026-10-04)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanár által megadott szempontokhoz legyen ellenőrizhető forráskötés és teljesítési eredmény.
- **Forrás** — `docs/specs/2026-10-04-tanari-pont-keplet-idezet.md:32`, `docs/specs/2026-10-04-tanari-pont-keplet-idezet-vegrehajtas.md:1`
- **Mi van kész** — A `normalizeOwnerInstruction` főági megvalósítását (`source/shared/owner-instruction.ts:17`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/instruction-points.test.ts:23`). A korabeli mérés helye a #185 leírásának 13. sora (1924/1924).
- **Mi hiányzik** — Még ellenőrizendő: HA az idézet a forrás egy teljes képlet-sora (pipával vagy anélkül), AKKOR a pont pending (igazolt), nem not_in_source. `docs/specs/2026-10-04-tanari-pont-keplet-idezet.md:32`.
- **Folytatás helye** — `docs/specs/2026-10-04-tanari-pont-keplet-idezet.md:1` · #185
- **Következő lépés** — A `normalizeOwnerInstruction` bemenetétől (`source/shared/owner-instruction.ts:17`) kövesd az eredményt a `source/tests/instruction-points.test.ts:23` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-298 · Illusztráció: érvénytelen szám-attribútum (<rect y="+">) — terv

- **Azonosító** — R-TERV-298
- **Cím** — Illusztráció: érvénytelen szám-attribútum (<rect y="+">) — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A képi attribútumokat és a ténylegesen tanított számértékeket különböztesse meg az ellenőrzés.
- **Forrás** — `docs/specs/2026-10-05-illusztracio-szam-attributum.md:73`, `docs/specs/2026-10-05-illusztracio-szam-attributum-vegrehajtas.md:1`
- **Mi van kész** — A `sanitizeIllustration` főági megvalósítását (`source/shared/illustration-svg.ts:112`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/illustration-svg.test.ts:77`). A korabeli mérés helye a #198 leírásának 13. sora (10/10).
- **Mi hiányzik** — Még ellenőrizendő: AMIKOR a Mezopotámia-lecke a javított klienssel (helyi build, éles API) jelenik meg, a böngésző konzoljában. `docs/specs/2026-10-05-illusztracio-szam-attributum.md:78`.
- **Folytatás helye** — `docs/specs/2026-10-05-illusztracio-szam-attributum.md:1` · #198
- **Következő lépés** — A `sanitizeIllustration` bemenetétől (`source/shared/illustration-svg.ts:112`) kövesd az eredményt a `source/tests/illustration-svg.test.ts:77` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-301 · S2 — Tartalom alapú besorolás: tantárgy · ág · évfolyam · téma · lecketípus (2026-10-05)

- **Azonosító** — R-TERV-301
- **Cím** — S2 — Tartalom alapú besorolás: tantárgy · ág · évfolyam · téma · lecketípus (2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A meglévő tananyagot tartalma alapján sorolja a megfelelő tantárgyhoz és évfolyamhoz a rendszer.
- **Forrás** — `docs/specs/2026-10-05-s2-tartalom-besorolas.md:36`, `docs/specs/2026-10-05-s2-tartalom-besorolas-vegrehajtas.md:1`
- **Mi van kész** — A `classifyLesson` főági megvalósítását (`source/server/catalog/classify.ts:112`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/catalog-classify.test.ts:28`). A korabeli mérés helye a #189 leírásának 20. sora.
- **Mi hiányzik** — Még ellenőrizendő: A pilot 10/10 leckére érvényes (sémának megfelelő) besorolást ad; a kézi besorolással a tantárgy ≥ 9/10, a lecketípus ≥ 8/10. `docs/specs/2026-10-05-s2-tartalom-besorolas.md:36`.
- **Folytatás helye** — `docs/specs/2026-10-05-s2-tartalom-besorolas.md:1` · #189
- **Következő lépés** — A `classifyLesson` bemenetétől (`source/server/catalog/classify.ts:112`) kövesd az eredményt a `source/tests/catalog-classify.test.ts:28` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-304 · Claude-stream: a néma gondolkodás ne számítson tétlenségnek

- **Azonosító** — R-TERV-304
- **Cím** — Claude-stream: a néma gondolkodás ne számítson tétlenségnek
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A hosszú gondolkodási szakasz alatt érkező aktivitás is jelezze, hogy a folyamat nem állt le.
- **Forrás** — `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel.md:74`, `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel-vegrehajtas.md:7`
- **Mi van kész** — A `ClaudeProvider` főági megvalósítását (`source/server/ai/ClaudeProvider.ts:49`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/claude-stream-thinking-liveness.test.ts:46`). A korabeli mérés helye a #212 leírásának 19. sora (2226/2226).
- **Mi hiányzik** — Még ellenőrizendő: élőben a summarized delták milyen sűrűn jönnek — élő mérés NOT RUN, lásd kockázatok). `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel.md:67`.
- **Folytatás helye** — `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel.md:1` · #212
- **Következő lépés** — A `ClaudeProvider` bemenetétől (`source/server/ai/ClaudeProvider.ts:49`) kövesd az eredményt a `source/tests/claude-stream-thinking-liveness.test.ts:46` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-307 · Külön gombok hiba / megszakadt piszkozat esetén — terv (2026-10-15)

- **Azonosító** — R-TERV-307
- **Cím** — Külön gombok hiba / megszakadt piszkozat esetén — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A hibás állapotban felkínált műveletek közül csak az indítható jelenjen meg.
- **Forrás** — `docs/specs/2026-10-15-hiba-gombok.md:24`, `docs/specs/2026-10-15-hiba-gombok-vegrehajtas.md:1`
- **Mi van kész** — A `oneStepPhaseRows` főági megvalósítását (`source/shared/studio-ui.ts:455`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/studio-one-step-progress.test.ts:55`). A korabeli mérés helye a #248 leírásának 15. sora (8/8).
- **Mi hiányzik** — Még ellenőrizendő: HA ugyanabból a térképből (ugyanazzal a kéréssel) van mentett, nem publikált, nem lezárt-sikeres piszkozat, AKKOR az új feltöltés. `docs/specs/2026-10-15-hiba-gombok.md:24`.
- **Folytatás helye** — `docs/specs/2026-10-15-hiba-gombok.md:1` · #248
- **Következő lépés** — A `oneStepPhaseRows` bemenetétől (`source/shared/studio-ui.ts:455`) kövesd az eredményt a `source/tests/studio-one-step-progress.test.ts:55` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-310 · Websuli Design — az öt évfolyamsávos arculat a tananyag-megjelenítésben — terv

- **Azonosító** — R-TERV-310
- **Cím** — Websuli Design — az öt évfolyamsávos arculat a tananyag-megjelenítésben — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanulói és az adminfelület közös arculata következetesen érvényesüljön.
- **Forrás** — `docs/specs/2026-10-16-websuli-design.md:53`, `docs/specs/2026-10-16-websuli-design-vegrehajtas.md:1`
- **Mi van kész** — A `contrastRatio` főági megvalósítását (`source/shared/svg-contrast.ts:91`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-design.test.ts:145`). A korabeli mérés helye a #266 leírásának 24. sora (4/4).
- **Mi hiányzik** — Még ellenőrizendő: A Nunito Sans és az Inter WOFF2 a manifest szerint betöltődik, Google- vagy CDN-kérés nélkül. Az Árvíztűrő tükörfúrógép. `docs/specs/2026-10-16-websuli-design.md:57`.
- **Folytatás helye** — `docs/specs/2026-10-16-websuli-design.md:1` · #310
- **Következő lépés** — A `contrastRatio` bemenetétől (`source/shared/svg-contrast.ts:91`) kövesd az eredményt a `source/tests/lesson-design.test.ts:145` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-311 · Websuli Design — memóriakártya és ismétlés-ütemezés a lecke-lejátszóban — terv

- **Azonosító** — R-TERV-311
- **Cím** — Websuli Design — memóriakártya és ismétlés-ütemezés a lecke-lejátszóban — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A tanuló eredményei alapján a megfelelő feladat térjen vissza gyakorlásra.
- **Forrás** — `docs/specs/2026-10-16-websuli-ismetles.md:85`, `docs/specs/2026-10-16-websuli-ismetles-vegrehajtas.md:1`
- **Mi van kész** — A `lessonFlashcards` főági megvalósítását (`source/shared/lesson-flashcards.ts:30`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/review-db.integration.ts:114`). A korabeli mérés helye a #268 leírásának 20. sora (38/38).
- **Mi hiányzik** — Még ellenőrizendő: ISO 8601 időpontot tárol; a megjelenített dátum hu-HU formátumú. Az algoritmus később cserélhető. `docs/specs/2026-10-16-websuli-ismetles.md:27`.
- **Folytatás helye** — `docs/specs/2026-10-16-websuli-ismetles.md:1` · #268
- **Következő lépés** — A `lessonFlashcards` bemenetétől (`source/shared/lesson-flashcards.ts:30`) kövesd az eredményt a `source/tests/review-db.integration.ts:114` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-314 · Régi (HTML) tananyagok eredménye e-mailben az adminoknak — terv

- **Azonosító** — R-TERV-314
- **Cím** — Régi (HTML) tananyagok eredménye e-mailben az adminoknak — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A régi formátumú tananyag használata is adjon visszakövethető eredményt.
- **Forrás** — `docs/specs/2026-10-17-regi-anyag-eredmeny.md:54`, `docs/specs/2026-10-17-regi-anyag-eredmeny-vegrehajtas.md:27`
- **Mi van kész** — A `materialResultDedupKey` főági megvalósítását (`source/server/lib/material-result.ts:23`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/material-mailto.test.ts:87`). A korabeli mérés helye a #281 leírásának 56. sora.
- **Mi hiányzik** — Még ellenőrizendő: Mind a 183 éles HTML a kiszolgáláskori átalakítás után is szintaktikailag érvényes. `docs/specs/2026-10-17-regi-anyag-eredmeny.md:75`.
- **Folytatás helye** — `docs/specs/2026-10-17-regi-anyag-eredmeny.md:1` · #281
- **Következő lépés** — A `materialResultDedupKey` bemenetétől (`source/server/lib/material-result.ts:23`) kövesd az eredményt a `source/tests/material-mailto.test.ts:87` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-316 · Websuli tantárgyi ikonkészlet adatbázisból — terv

- **Azonosító** — R-TERV-316
- **Cím** — Websuli tantárgyi ikonkészlet adatbázisból — terv
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A felület saját ikonokat használjon a fontos műveletek és tartalmak jelzésére.
- **Forrás** — `docs/specs/2026-10-17-websuli-ikonkeszlet.md:45`, `docs/specs/2026-10-17-websuli-ikonkeszlet-vegrehajtas.md:37`
- **Mi van kész** — A `lessonCoverId` főági megvalósítását (`source/shared/lesson-cover-key.ts:19`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/design-assets.test.ts:150`). A korabeli mérés helye a #274 leírásának 24. sora (21/21).
- **Mi hiányzik** — Még ellenőrizendő: Ha a leckében van art.subjectIcon, az ikon a /api/design-assets/<id> címről jön. `docs/specs/2026-10-17-websuli-ikonkeszlet.md:45`.
- **Folytatás helye** — `docs/specs/2026-10-17-websuli-ikonkeszlet.md:1` · #274
- **Következő lépés** — A `lessonCoverId` bemenetétől (`source/shared/lesson-cover-key.ts:19`) kövesd az eredményt a `source/tests/design-assets.test.ts:150` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-322 · Admin menü — a csoportnevek a bennük lévő funkciókat mondják (mobil és asztali)

- **Azonosító** — R-TERV-322
- **Cím** — Admin menü — a csoportnevek a bennük lévő funkciókat mondják (mobil és asztali)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az admin műveleteinek megnevezése a tényleges feladatot írja le.
- **Forrás** — `docs/specs/2026-10-19-admin-menu-nevek.md:27`, `docs/specs/2026-10-19-admin-menu-nevek-vegrehajtas.md:1`
- **Mi van kész** — A `resolveAdminTab` főági megvalósítását (`source/client/src/lib/admin-tabs.ts:48`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/admin-korszerusites.test.ts:45`). A korabeli mérés helye a #316 leírásának 16. sora (8/8).
- **Mi hiányzik** — Még ellenőrizendő: Mobil: HA az admin mobilon megnyitja az alsó menüt, AKKOR a négy gomb: Tananyagok, Készítés, Tanulók, Rendszer, és a. `docs/specs/2026-10-19-admin-menu-nevek.md:27`.
- **Folytatás helye** — `docs/specs/2026-10-19-admin-menu-nevek.md:1` · #316
- **Következő lépés** — A `resolveAdminTab` bemenetétől (`source/client/src/lib/admin-tabs.ts:48`) kövesd az eredményt a `source/tests/admin-korszerusites.test.ts:45` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-325 · Lecke-hős: a sáv saját képe, témaborító csak célzottan

- **Azonosító** — R-TERV-325
- **Cím** — Lecke-hős: a sáv saját képe, témaborító csak célzottan
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A nyitókép a kártya használhatóságát megőrző sávban jelenjen meg.
- **Forrás** — `docs/specs/2026-10-19-hos-kep-sav.md:49`, `docs/specs/2026-10-19-hos-kep-sav-vegrehajtas.md:1`
- **Mi van kész** — A `resolveStoredArt` főági megvalósítását (`source/shared/design-assets.ts:157`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/stored-art.test.ts:21`). A korabeli mérés helye a #322 leírásának 31. sora (18/18).
- **Mi hiányzik** — Még ellenőrizendő: Kulcsszó nélkül: HA a lecke címe egyik borító kulcsszavát sem tartalmazza, AKKOR a fejléckép a sáv saját hős-képe. `docs/specs/2026-10-19-hos-kep-sav.md:49`.
- **Folytatás helye** — `docs/specs/2026-10-19-hos-kep-sav.md:1` · #322
- **Következő lépés** — A `resolveStoredArt` bemenetétől (`source/shared/design-assets.ts:157`) kövesd az eredményt a `source/tests/stored-art.test.ts:21` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-327 · Rövid (1–2 betűs) fogalomnév megalapozása — a „Where I Live” gyártás gyökéroka

- **Azonosító** — R-TERV-327
- **Cím** — Rövid (1–2 betűs) fogalomnév megalapozása — a „Where I Live” gyártás gyökéroka
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A rövid vagy ékezetes fogalom ne okozzon hamis fedettségi hibát.
- **Forrás** — `docs/specs/2026-10-19-rovid-fogalom-megalapozas.md:33`, `docs/specs/2026-10-19-rovid-fogalom-megalapozas-vegrehajtas.md:13`
- **Mi van kész** — A `checkGrounding` főági megvalósítását (`source/server/studio/grounding.ts:58`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/studio-grounding-short-term.test.ts:80`). A korabeli mérés helye a #326 leírásának 13. sora (2239/2239).
- **Mi hiányzik** — Még ellenőrizendő: ha ezek közül legalább egy szóhatárosan szerepel a blokkban, a címke megalapozott. `docs/specs/2026-10-19-rovid-fogalom-megalapozas.md:33`.
- **Folytatás helye** — `docs/specs/2026-10-19-rovid-fogalom-megalapozas.md:1` · #326
- **Következő lépés** — A `checkGrounding` bemenetétől (`source/server/studio/grounding.ts:58`) kövesd az eredményt a `source/tests/studio-grounding-short-term.test.ts:80` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-330 · Robot-megtekintések kiszűrése a megtekintés-statisztikából

- **Azonosító** — R-TERV-330
- **Cím** — Robot-megtekintések kiszűrése a megtekintés-statisztikából
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Az automata lekérések ne torzítsák a látogatási adatokat.
- **Forrás** — `docs/specs/2026-10-20-robot-megtekintes.md:28`, `docs/specs/2026-10-20-robot-megtekintes-vegrehajtas.md:8`
- **Mi van kész** — A `isAutomatedUserAgent` főági megvalósítását (`source/server/lib/automated-agent.ts:11`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/automated-agent.test.ts:8`). A korabeli mérés helye a #335 leírásának 13. sora (2279/2279).
- **Mi hiányzik** — Még ellenőrizendő: Robot: HA a kérés UA-ja robot (pl. meta-externalagent/1.1), AKKOR a /dev/:id kiszolgál, de nem rögzít megtekintést. `docs/specs/2026-10-20-robot-megtekintes.md:28`.
- **Folytatás helye** — `docs/specs/2026-10-20-robot-megtekintes.md:1` · #335
- **Következő lépés** — A `isAutomatedUserAgent` bemenetétől (`source/server/lib/automated-agent.ts:11`) kövesd az eredményt a `source/tests/automated-agent.test.ts:8` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-331 · S4 — a rubrika-szigorítás mérhetősége és automatikus lazítása

- **Azonosító** — R-TERV-331
- **Cím** — S4 — a rubrika-szigorítás mérhetősége és automatikus lazítása
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — Mért hibák alapján dőljön el, mely pontozási szabályt kell szigorítani vagy lazítani.
- **Forrás** — `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md:5`, `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas-vegrehajtas.md:1`
- **Mi van kész** — A `calibrateRubric` főági megvalósítását (`source/shared/answer-key-calibrate.ts:311`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/s3c-rubrika-szigoritas.test.ts:21`). A korabeli mérés helye a #340 leírásának 29. sora (2307/2307).
- **Mi hiányzik** — Még ellenőrizendő: Ha a szigorítás túl szigorú: „Automatikus lazítás”. `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md:5`.
- **Folytatás helye** — `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md:1` · #340
- **Következő lépés** — A `calibrateRubric` bemenetétől (`source/shared/answer-key-calibrate.ts:311`) kövesd az eredményt a `source/tests/s3c-rubrika-szigoritas.test.ts:21` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-335 · 1. ciklus — csoportos rubrika-szigorítás és analitikai archívum

- **Azonosító** — R-TERV-335
- **Cím** — 1. ciklus — csoportos rubrika-szigorítás és analitikai archívum
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe.
- **Forrás** — `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas.md:43`, `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas-vegrehajtas.md:1`
- **Mi van kész** — A `calibrateRubric` főági megvalósítását (`source/shared/answer-key-calibrate.ts:311`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/s3d-csoportos-szigoritas.test.ts:21`). A korabeli mérés helye a #353 leírásának 22. sora.
- **Mi hiányzik** — Még ellenőrizendő: HA a helyes válaszok eltérő szinonimát használnak, és a hibás próba egyiket sem, AKKOR a csoportos szigorítás kizárja, és a minta. `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas.md:43`.
- **Folytatás helye** — `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas.md:1` · #353
- **Következő lépés** — A `calibrateRubric` bemenetétől (`source/shared/answer-key-calibrate.ts:311`) kövesd az eredményt a `source/tests/s3d-csoportos-szigoritas.test.ts:21` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-337 · Ciklus 4 — a minta kifejezés-alakja és a számos referencia gépi javítása (modellkör nélkül)

- **Azonosító** — R-TERV-337
- **Cím** — Ciklus 4 — a minta kifejezés-alakja és a számos referencia gépi javítása (modellkör nélkül)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe.
- **Forrás** — `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md:22`, `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix-vegrehajtas.md:1`
- **Mi van kész** — A `autofixBankPacket` főági megvalósítását (`source/server/studio/tools/bank-packet-autofix.ts:172`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/ciklus4-diagnozis.test.ts:24`). A korabeli mérés helye a #355 leírásának 17. sora.
- **Mi hiányzik** — Még ellenőrizendő: HA a minta a kifejezést más (tűréssel egyező) alakban tartalmazza, AKKOR a javítás után a minta teljes pontot kap, a javítás naplózott. `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md:22`.
- **Folytatás helye** — `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md:1` · #355
- **Következő lépés** — A `autofixBankPacket` bemenetétől (`source/server/studio/tools/bank-packet-autofix.ts:172`) kövesd az eredményt a `source/tests/ciklus4-diagnozis.test.ts:24` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-342 · Ciklus 8 — helyesírási opciók (kis- és nagybetű) + a teljes maradék átalakítása

- **Azonosító** — R-TERV-342
- **Cím** — Ciklus 8 — helyesírási opciók (kis- és nagybetű) + a teljes maradék átalakítása
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe.
- **Forrás** — `docs/specs/2026-10-21-ciklus8-helyesiras-maradek.md:21`, `docs/specs/2026-10-21-ciklus8-helyesiras-maradek-vegrehajtas.md:1`
- **Mi van kész** — A `singleChoiceProblems` főági megvalósítását (`source/shared/single-choice-check.ts:295`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/single-choice-check.test.ts:45`). A korabeli mérés helye a #361 leírásának 11. sora (2408/2408).
- **Mi hiányzik** — Még ellenőrizendő: HA két opció csak kis- és nagybetűben tér el, AKKOR nem ismétlődés. `docs/specs/2026-10-21-ciklus8-helyesiras-maradek.md:21`.
- **Folytatás helye** — `docs/specs/2026-10-21-ciklus8-helyesiras-maradek.md:1` · #361
- **Következő lépés** — A `singleChoiceProblems` bemenetétől (`source/shared/single-choice-check.ts:295`) kövesd az eredményt a `source/tests/single-choice-check.test.ts:45` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-344 · A régi anyagok átalakítása 5-ös ciklusokban, felülvizsgálattal

- **Azonosító** — R-TERV-344
- **Cím** — A régi anyagok átalakítása 5-ös ciklusokban, felülvizsgálattal
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A régi anyagok következő javítási köréről a korábbi mérés és a megmaradt hibák döntsenek.
- **Forrás** — `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat.md:27`, `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat-vegrehajtas.md:1`
- **Mi van kész** — A `legacyCandidates` főági megvalósítását (`source/server/studio/legacy-migration.ts:90`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/regi-anyag-studio.test.ts:12`). A korabeli mérés helye a #351 leírásának 13. sora.
- **Mi hiányzik** — Még ellenőrizendő: HA a sorelemek száma eléri a LEGACY_BATCH_LIMIT-et, AKKOR új anyag nem indul; a futó elemek egyeztetése és újrapróbája folytatódik. `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat.md:27`.
- **Folytatás helye** — `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat.md:1` · #351
- **Következő lépés** — A `legacyCandidates` bemenetétől (`source/server/studio/legacy-migration.ts:90`) kövesd az eredményt a `source/tests/regi-anyag-studio.test.ts:12` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — P-059

### R-TERV-348 · A válaszkeverés utáni maradó kockázatok felszámolása

- **Azonosító** — R-TERV-348
- **Cím** — A válaszkeverés utáni maradó kockázatok felszámolása
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A válaszkeverés utáni maradó kockázatok felszámolása.
- **Forrás** — `docs/specs/2026-11-02-maradek-kockazatok.md:52`, `docs/specs/2026-11-02-maradek-kockazatok-vegrehajtas.md:5`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `source/playwright.learning-flow.config.ts:1`; `source/tests/learning-flow.browser.ts:15`. Történeti kapcsolat: #376 · 8005eb62. A korabeli mérés a #376 leírásának 16. sorában található (23/23).
- **Mi hiányzik** — Még ellenőrizendő: mindkettő tulajdonosi döntés és költség; kód nem változik e nélkül. NOT DONE ebben a szeletben, ok: jóváhagyás szükséges. `docs/specs/2026-11-02-maradek-kockazatok.md:31`.
- **Folytatás helye** — `docs/specs/2026-11-02-maradek-kockazatok.md:1` · #376
- **Következő lépés** — A `source/playwright.learning-flow.config.ts:1` útján kövesd a feltételt a `source/tests/learning-flow.browser.ts:15` eseteivel összevetve. Elsőként a `docs/specs/2026-11-02-maradek-kockazatok.md:31` bemenetét és elvárt eredményét egyeztesd.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-361 · Pontozott bankok, minimum 15/15

- **Azonosító** — R-TERV-361
- **Cím** — Pontozott bankok, minimum 15/15
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Pontozott bankok, minimum 15/15.
- **Forrás** — `docs/handoffs/2026-09-12-scored-banks.md:3`
- **Mi van kész** — A `withLessonTypography` főági megvalósítását (`source/shared/lesson-typography.ts:51`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/html-lesson-persistence.browser.ts:6`). A korabeli mérés helye a #59 leírásának 5. sora.
- **Mi hiányzik** — Még ellenőrizendő: Tulajdonosi követelmény: minden új/felújított teljes tananyag legalább 15 különböző szöveges feladatot és 15 kvízkérdést tartalmazzon, mindkettő pontozva. A rövid kör külön…. `docs/handoffs/2026-09-12-scored-banks.md:3`.
- **Folytatás helye** — `docs/handoffs/2026-09-12-scored-banks.md:1` · #59
- **Következő lépés** — A `withLessonTypography` bemenetétől (`source/shared/lesson-typography.ts:51`) kövesd az eredményt a `source/tests/html-lesson-persistence.browser.ts:6` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-365 · Spec — Bankmodell kiválasztása méréssel (2026-09-24)

- **Azonosító** — R-TERV-365
- **Cím** — Spec — Bankmodell kiválasztása méréssel (2026-09-24)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A bankot készítő modell kiválasztását az azonos mérőanyagon kapott eredmény és költség döntse el.
- **Forrás** — `docs/specs/2026-09-24-bankmodell-valasztas.md:40`
- **Mi van kész** — A `modelFamily` főági megvalósítását (`source/server/ai/models.ts:201`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/models-routing.test.ts:24`). A korabeli mérés helye a #123 leírásának 15. sora (1431/1431).
- **Mi hiányzik** — Még ellenőrizendő: HA a váltás élesben van, AKKOR egy teljes éles gyártás done állapotba ér, a kész bank bank-ellenőr hibaaránya. `docs/specs/2026-09-24-bankmodell-valasztas.md:42`.
- **Folytatás helye** — `docs/specs/2026-09-24-bankmodell-valasztas.md:1` · #123
- **Következő lépés** — A `modelFamily` bemenetétől (`source/server/ai/models.ts:201`) kövesd az eredményt a `source/tests/models-routing.test.ts:24` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-366 · Egyválasztós tételek: pontosan egy helyes válasz — bármely témában (2026-09-29)

- **Azonosító** — R-TERV-366
- **Cím** — Egyválasztós tételek: pontosan egy helyes válasz — bármely témában (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A feleletválasztós kérdéshez pontosan egy tartalmilag védhető kulcs tartozzon.
- **Forrás** — `docs/specs/2026-09-29-egy-helyes-valasz.md:66`, `docs/specs/2026-09-29-egy-helyes-valasz-vegrehajtas.md:89`
- **Mi van kész** — A `singleChoiceProblems` főági megvalósítását (`source/shared/single-choice-check.ts:295`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/single-choice-check.test.ts:15`). A korabeli mérés helye a #134 leírásának 16. sora (1499/1499).
- **Mi hiányzik** — Még ellenőrizendő: Egyetlen helyes opciós oszthatósági és számtani tételre SHALL NOT hibát adni (teszt, pozitív esetek). `docs/specs/2026-09-29-egy-helyes-valasz.md:67`.
- **Folytatás helye** — `docs/specs/2026-09-29-egy-helyes-valasz.md:1` · #134
- **Következő lépés** — A `singleChoiceProblems` bemenetétől (`source/shared/single-choice-check.ts:295`) kövesd az eredményt a `source/tests/single-choice-check.test.ts:15` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-367 · Körlimiten maradt banktétel-hiba: a tétel kiesik, nem a lecke (2026-09-29)

- **Azonosító** — R-TERV-367
- **Cím** — Körlimiten maradt banktétel-hiba: a tétel kiesik, nem a lecke (2026-09-29)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A javítási korlátnál a lokális hiba ne semmisítse meg az egész használható leckét.
- **Forrás** — `docs/specs/2026-09-29-limit-banktetel-kivetel.md:20`, `docs/specs/2026-09-29-limit-banktetel-kivetel-vegrehajtas.md:1`
- **Mi van kész** — A `bankUnitQuota` főági megvalósítását (`source/shared/lesson-bank-plan.ts:19`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-item-ref.test.ts:53`). A korabeli mérés helye a #139 leírásának 15. sora (1635/1635).
- **Mi hiányzik** — Még ellenőrizendő: A bankItemRef SHALL a zárójeles, a pontozott és az al-útvonalas alakot ugyanarra a tételre képezni (teszt). `docs/specs/2026-09-29-limit-banktetel-kivetel.md:63`.
- **Folytatás helye** — `docs/specs/2026-09-29-limit-banktetel-kivetel.md:1` · #139
- **Következő lépés** — A `bankUnitQuota` bemenetétől (`source/shared/lesson-bank-plan.ts:19`) kövesd az eredményt a `source/tests/bank-item-ref.test.ts:53` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-371 · Kapu-javítás utáni csak-bank kör (2026-10-01)

- **Azonosító** — R-TERV-371
- **Cím** — Kapu-javítás utáni csak-bank kör (2026-10-01)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A végkapu hibáját az arra alkalmas javítókör kapja vissza.
- **Forrás** — `docs/specs/2026-10-01-kapu-javitas-bankkor.md:17`, `docs/specs/2026-10-01-kapu-javitas-bankkor-vegrehajtas.md:1`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #169 leírásának 5. sora (1869/1869).
- **Mi hiányzik** — Még ellenőrizendő: Elfogadás (EARS): HA a lektor-lépés a célzott kapu-javítás körében fut ÉS a csak-bank körök elfogytak ÉS a. `docs/specs/2026-10-01-kapu-javitas-bankkor.md:17`.
- **Folytatás helye** — `docs/specs/2026-10-01-kapu-javitas-bankkor.md:1` · #169
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-372 · Limit-blokk-kivétel után a bank igazítása (2026-10-01)

- **Azonosító** — R-TERV-372
- **Cím** — Limit-blokk-kivétel után a bank igazítása (2026-10-01)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A javítási korlátnál a lokális hiba ne semmisítse meg az egész használható leckét.
- **Forrás** — `docs/specs/2026-10-01-limit-blokk-kivetel-bank.md:14`, `docs/specs/2026-10-01-limit-blokk-kivetel-bank-vegrehajtas.md:1`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #170 leírásának 5. sora (1871/1871).
- **Mi hiányzik** — Még ellenőrizendő: Elfogadás (EARS): HA a limiten blokk-kivétel történt, AKKOR a tanítatlan fogalmú banktételek kikerülnek, a bankterv. `docs/specs/2026-10-01-limit-blokk-kivetel-bank.md:14`.
- **Folytatás helye** — `docs/specs/2026-10-01-limit-blokk-kivetel-bank.md:1` · #170
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-373 · Hamis egyenlőség a forrásban — determinisztikus forrás-helyesbítés (2026-10-03)

- **Azonosító** — R-TERV-373
- **Cím** — Hamis egyenlőség a forrásban — determinisztikus forrás-helyesbítés (2026-10-03)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A számolási állítás igazsága az előjelek, törtek és műveletek alapján legyen ellenőrizhető.
- **Forrás** — `docs/specs/2026-10-03-forras-aritmetika-helyesbites.md:45`, `docs/specs/2026-10-03-forras-aritmetika-helyesbites-vegrehajtas.md:1`
- **Mi van kész** — A `arithmeticSourceCorrections` főági megvalósítását (`source/server/studio/source-corrections.ts:298`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/source-arithmetic-corrections.test.ts:17`). A korabeli mérés helye a #181 leírásának 15. sora (1903/1903).
- **Mi hiányzik** — Még ellenőrizendő: HA a térkép a mért 13 idézetet tartalmazza, AKKOR pontosan c2, c4, c5, c6, c7, c8, c11 kap helyesbítést, rendre 15, −14, −2,. `docs/specs/2026-10-03-forras-aritmetika-helyesbites.md:45`.
- **Folytatás helye** — `docs/specs/2026-10-03-forras-aritmetika-helyesbites.md:1` · #181
- **Következő lépés** — A `arithmeticSourceCorrections` bemenetétől (`source/server/studio/source-corrections.ts:298`) kövesd az eredményt a `source/tests/source-arithmetic-corrections.test.ts:17` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-374 · Kötelező banktartalék és előjel-szabályok a gyakorlóbankban (2026-10-04)

- **Azonosító** — R-TERV-374
- **Cím** — Kötelező banktartalék és előjel-szabályok a gyakorlóbankban (2026-10-04)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Bankhiba esetén a tartalék út kezelje az eredeti előjelhibát is.
- **Forrás** — `docs/specs/2026-10-04-bank-tartalek-es-elojel.md:70`, `docs/specs/2026-10-04-bank-tartalek-es-elojel-vegrehajtas.md:1`
- **Mi van kész** — A `buildLessonExperience` főági megvalósítását (`source/server/studio/experience-builder.ts:477`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-reserve-sign-rules.test.ts:63`). A korabeli mérés helye a #182 leírásának 31. sora.
- **Mi hiányzik** — Még ellenőrizendő: NOT RUN: éles újraindítás (a felhőből az éles szerver nem érhető el); a tulajdonos indítja újra a leckét. `docs/specs/2026-10-04-bank-tartalek-es-elojel.md:90`.
- **Folytatás helye** — `docs/specs/2026-10-04-bank-tartalek-es-elojel.md:1` · #182
- **Következő lépés** — A `buildLessonExperience` bemenetétől (`source/server/studio/experience-builder.ts:477`) kövesd az eredményt a `source/tests/bank-reserve-sign-rules.test.ts:63` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-375 · Kapu-javítás utáni csak-bank kör — holtzóna a látogatási keretnél (2026-10-04)

- **Azonosító** — R-TERV-375
- **Cím** — Kapu-javítás utáni csak-bank kör — holtzóna a látogatási keretnél (2026-10-04)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Az ellenőrző és a bankot javító kör közti átadás egyik kerethatárnál se okozzon elakadást.
- **Forrás** — `docs/specs/2026-10-04-kapu-bankkor-holtzona.md:34`, `docs/specs/2026-10-04-kapu-bankkor-holtzona-vegrehajtas.md:1`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #183 leírásának 26. sora (1911/1911).
- **Mi hiányzik** — Még ellenőrizendő: HA a lektor a célzott kapu-javítás körében fut, a bankOnly limitből marad, de az animator/lektor látogatás elfogyott, van. `docs/specs/2026-10-04-kapu-bankkor-holtzona.md:34`.
- **Folytatás helye** — `docs/specs/2026-10-04-kapu-bankkor-holtzona.md:1` · #183
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-376 · Bank: determinisztikus normalizálás a modell-javítókörök helyett (tulajdonosi utasítás, 2026-10-05)

- **Azonosító** — R-TERV-376
- **Cím** — Bank: determinisztikus normalizálás a modell-javítókörök helyett (tulajdonosi utasítás, 2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A biztosan helyreállítható bankformátumot a program egységesítse.
- **Forrás** — `docs/specs/2026-10-05-bank-determinisztikus-normalizalas.md:18`
- **Mi van kész** — A `alignTaskToSample` főági megvalósítását (`source/server/studio/bank-normalize.ts:47`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-normalize.test.ts:20`). A korabeli mérés helye a #196 leírásának 26. sora (2096/2096).
- **Mi hiányzik** — Még ellenőrizendő: A szószám-küszöb (minWords) SOHA nem csökken; a rövid minta a modell-javítókörben marad. `docs/specs/2026-10-05-bank-determinisztikus-normalizalas.md:18`.
- **Folytatás helye** — `docs/specs/2026-10-05-bank-determinisztikus-normalizalas.md:1` · #196
- **Következő lépés** — A `alignTaskToSample` bemenetétől (`source/server/studio/bank-normalize.ts:47`) kövesd az eredményt a `source/tests/bank-normalize.test.ts:20` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-377 · S3 — Gépi ellenőrzés, bizalmi szint és tárolás: tantárgyi katalógus-bankok (2026-10-05)

- **Azonosító** — R-TERV-377
- **Cím** — S3 — Gépi ellenőrzés, bizalmi szint és tárolás: tantárgyi katalógus-bankok (2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A katalógusba kerülő és onnan kiválasztott tartalom használata legyen forrással és méréssel igazolható.
- **Forrás** — `docs/specs/2026-10-05-s3-katalogus-bank.md:33`, `docs/specs/2026-10-05-s3-katalogus-bank-vegrehajtas.md:1`
- **Mi van kész** — A `falseArithmeticClaims` főági megvalósítását (`source/server/studio/tools/arithmetic-claims.ts:29`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/catalog-verify.test.ts:21`). A korabeli mérés helye a #193 leírásának 8. sora (2/9, 5/9).
- **Mi hiányzik** — Még ellenőrizendő: A migráció additív és idempotens (kétszer futtatva hibátlan). `docs/specs/2026-10-05-s3-katalogus-bank.md:33`.
- **Folytatás helye** — `docs/specs/2026-10-05-s3-katalogus-bank.md:1` · #193
- **Következő lépés** — A `falseArithmeticClaims` bemenetétől (`source/server/studio/tools/arithmetic-claims.ts:29`) kövesd az eredményt a `source/tests/catalog-verify.test.ts:21` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-378 · Tantárgyi tudásbank, munkafolyamat-rendbetétel és tanult skillek — TERV (2026-10-05)

- **Azonosító** — R-TERV-378
- **Cím** — Tantárgyi tudásbank, munkafolyamat-rendbetétel és tanult skillek — TERV (2026-10-05)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — Az adott tantárgy tudása és bevált javításai eljussanak az őket használó gyártási lépéshez.
- **Forrás** — `docs/specs/2026-10-05-tantargyi-tudasbank-terv.md:206`
- **Mi van kész** — A `buildSubjectSkill` főági megvalósítását (`source/server/catalog/subject-skill-builder.ts:51`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/subject-skills.test.ts:72`). A korabeli mérés helye a #193 leírásának 8. sora (2/9, 5/9).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-10-05-tantargyi-tudasbank-terv.md:1` · #193
- **Következő lépés** — A `buildSubjectSkill` bemenetétől (`source/server/catalog/subject-skill-builder.ts:51`) kövesd az eredményt a `source/tests/subject-skills.test.ts:72` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-379 · Tételgyár — a bank és a lektor együttműködésének új módszertana (2026-10-15)

- **Azonosító** — R-TERV-379
- **Cím** — Tételgyár — a bank és a lektor együttműködésének új módszertana (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md:101`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #239 leírásának 24. sora (2372/2372).
- **Mi hiányzik** — Még ellenőrizendő: HA T0 élesben van, AKKOR a 416ad01d a felületről folytatva publikál (vagy pontosan megnevezett, nem bizonyíték-eredetű okkal áll meg). `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md:103`.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md:1` · #239
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-380 · Végrehajtási utasítás — Tételgyár T0: determinisztikus, komponensenkénti lektor-bizonyíték

- **Azonosító** — R-TERV-380
- **Cím** — Végrehajtási utasítás — Tételgyár T0: determinisztikus, komponensenkénti lektor-bizonyíték
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-t0-bizonyitek-vegrehajtas.md:1`
- **Mi van kész** — A `executeWorkflow` főági megvalósítását (`source/server/workflows/engine.ts:333`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lektor-evidence.test.ts:8`). A korabeli mérés helye a #225 leírásának 15. sora (2314/2314).
- **Mi hiányzik** — A teljes célra nincs azonosított, pontról pontra hozzáillesztett elfogadási eredmény. A sormutató megadja a fennmaradó jelzéseket.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-t0-bizonyitek-vegrehajtas.md:1` · #225
- **Következő lépés** — A `executeWorkflow` bemenetétől (`source/server/workflows/engine.ts:333`) kövesd az eredményt a `source/tests/lektor-evidence.test.ts:8` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-382 · Végrehajtási utasítás — Tételgyár T2: válaszkulcs-tesztek

- **Azonosító** — R-TERV-382
- **Cím** — Végrehajtási utasítás — Tételgyár T2: válaszkulcs-tesztek
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md:54`
- **Mi van kész** — A korabeli megvalósítás és a főági összevetés kiindulópontja `source/server/studio/answer-key-writer.ts:15`; `source/tests/bank-answer-keys.test.ts:24`. Történeti kapcsolat: #243 · #239 · 9679a1e9. Rögzített eredmény: `docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md:61`. A korabeli mérés a #243 leírásának 18. sorában található (2389/2389).
- **Mi hiányzik** — Még ellenőrizendő: HA egy feladat helyes parafrázisa nem kap teljes pontot, AKKOR a csomag javítókörbe megy a konkrét esettel; az utolsó kísérletnél a tétel kikerül. `docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md:54`.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md:1` · #243
- **Következő lépés** — A `source/server/studio/answer-key-writer.ts:15` útján kövesd a feltételt a `source/tests/bank-answer-keys.test.ts:24` eseteivel összevetve. Elsőként a `docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md:54` bemenetét és elvárt eredményét egyeztesd.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-387 · Tételgyár T7 — döntőbíró a nyílt feladatokra (GPT-6.1 Sol) — terv (2026-10-15)

- **Azonosító** — R-TERV-387
- **Cím** — Tételgyár T7 — döntőbíró a nyílt feladatokra (GPT-6.1 Sol) — terv (2026-10-15)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dokumentált tulajdonosi vagy végrehajtási követelmény.
- **Eredeti utasítás / cél** — A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa.
- **Forrás** — `docs/specs/2026-10-15-tetelgyar-t7-dontobiro.md:18`, `docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md:1`
- **Mi van kész** — A `combineVerdicts` főági megvalósítását (`source/server/arbiter/arbiter.ts:90`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/arbiter.test.ts:41`). A korabeli mérés helye a #241 leírásának 18. sora (2380/2380).
- **Mi hiányzik** — Még ellenőrizendő: HA a pontozó ok-t ad, AKKOR nincs modellhívás. `docs/specs/2026-10-15-tetelgyar-t7-dontobiro.md:50`.
- **Folytatás helye** — `docs/specs/2026-10-15-tetelgyar-t7-dontobiro.md:1` · #241
- **Következő lépés** — A `combineVerdicts` bemenetétől (`source/server/arbiter/arbiter.ts:90`) kövesd az eredményt a `source/tests/arbiter.test.ts:41` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-388 · Lektor bankhibái: kivétel a kapunál, nem csak-bank újragyártás (terv, 2026-10-16)

- **Azonosító** — R-TERV-388
- **Cím** — Lektor bankhibái: kivétel a kapunál, nem csak-bank újragyártás (terv, 2026-10-16)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A bank helyileg javítható hibája miatt ne vesszen el egy egyébként megfelelő lecke.
- **Forrás** — `docs/specs/2026-10-16-bankhiba-kivetel.md:31`, `docs/specs/2026-10-16-bankhiba-kivetel-vegrehajtas.md:1`
- **Mi van kész** — A `draftSummaryOf` főági megvalósítását (`source/server/studio/lesson-pipeline-routes.ts:289`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-pipeline-runner.test.ts:9`). A korabeli mérés helye a #257 leírásának 24. sora (6/6).
- **Mi hiányzik** — Még ellenőrizendő: HA minden lektor-blokkoló kivehető banktétel, AKKOR a következő lépés a gate; a choiceFlags tartalmazza a tételeket, bankReview nincs. `docs/specs/2026-10-16-bankhiba-kivetel.md:31`.
- **Folytatás helye** — `docs/specs/2026-10-16-bankhiba-kivetel.md:1` · #257
- **Következő lépés** — A `draftSummaryOf` bemenetétől (`source/server/studio/lesson-pipeline-routes.ts:289`) kövesd az eredményt a `source/tests/lesson-pipeline-runner.test.ts:9` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573.
- **Kapcsolódó P-tétel** — —

### R-TERV-393 · Tudásbank S5/S6 újrabekötése az egyfutásos gyártásba (kanban 1120)

- **Azonosító** — R-TERV-393
- **Cím** — Tudásbank S5/S6 újrabekötése az egyfutásos gyártásba (kanban 1120)
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A meglévő tantárgyi tudás az új gyártó tényleges hívásában is hasznosuljon.
- **Forrás** — `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md:57`, `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes-vegrehajtas.md:1`
- **Mi van kész** — A `runSingleLesson` főági megvalósítását (`source/server/studio/single-run/engine.ts:554`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/single-run-engine.test.ts:301`). A korabeli mérés helye a #311 leírásának 21. sora.
- **Mi hiányzik** — Még ellenőrizendő: Kikapcsolva: HA egyik kapcsoló sincs bekapcsolva, AKKOR a betöltők nem hívódnak, és a 2. és 3. állomás kérésének szövege. `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md:57`.
- **Folytatás helye** — `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md:1` · #311
- **Következő lépés** — A `runSingleLesson` bemenetétől (`source/server/studio/single-run/engine.ts:554`) kövesd az eredményt a `source/tests/single-run-engine.test.ts:301` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-394 · A levágott modellválasz megszüntetése — előre megadott kimeneti keret

- **Azonosító** — R-TERV-394
- **Cím** — A levágott modellválasz megszüntetése — előre megadott kimeneti keret
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A bankhívás egy teljes, értékelhető választ kapjon a rendelkezésre álló tokenkeretből.
- **Forrás** — `docs/specs/2026-10-20-bank-kimeneti-keret.md:49`, `docs/specs/2026-10-20-bank-kimeneti-keret-vegrehajtas.md:1`
- **Mi van kész** — A `bankPacketContract` főági megvalósítását (`source/shared/lesson-experience.ts:326`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/bank-kimeneti-keret.test.ts:19`). A korabeli mérés helye a #345 leírásának 23. sora (2334/2334).
- **Mi hiányzik** — Még ellenőrizendő: HA egy forduló kimenete 64 000 és 128 000 token közé esik, AKKOR nem vágódik le. `docs/specs/2026-10-20-bank-kimeneti-keret.md:49`.
- **Folytatás helye** — `docs/specs/2026-10-20-bank-kimeneti-keret.md:1` · #345
- **Következő lépés** — A `bankPacketContract` bemenetétől (`source/shared/lesson-experience.ts:326`) kövesd az eredményt a `source/tests/bank-kimeneti-keret.test.ts:19` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-012 · Websuli arculati bank — előre gyártott díszítőelemek az adatbázisból — terv

- **Azonosító** — R-TERV-012
- **Cím** — Websuli arculati bank — előre gyártott díszítőelemek az adatbázisból — terv
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A tananyagokhoz jóváhagyott, témához illő kép tartozzon, a régi tartalom megőrzése mellett.
- **Forrás** — `docs/specs/2026-10-17-arculati-bank.md:73`, `docs/specs/2026-10-17-arculati-bank-vegrehajtas.md:16`
- **Mi van kész** — A `topicCoverId` főági megvalósítását (`source/shared/topic-taxonomy.ts:443`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/topic-taxonomy.test.ts:64`). A korabeli mérés helye a #277 leírásának 29. sora.
- **Mi hiányzik** — Még ellenőrizendő: ha több címke illik, nincs témakör (összefoglaló esetén a sáv hőse jön). `docs/specs/2026-10-17-arculati-bank.md:73`.
- **Folytatás helye** — `docs/specs/2026-10-17-arculati-bank.md:1` · #277
- **Következő lépés** — A `topicCoverId` bemenetétől (`source/shared/topic-taxonomy.ts:443`) kövesd az eredményt a `source/tests/topic-taxonomy.test.ts:64` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-015 · Arculati bank S4: feliratszótár és a flair kivezetése — terv

- **Azonosító** — R-TERV-015
- **Cím** — Arculati bank S4: feliratszótár és a flair kivezetése — terv
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta.
- **Eredeti utasítás / cél** — A tananyagokhoz jóváhagyott, témához illő kép tartozzon, a régi tartalom megőrzése mellett.
- **Forrás** — `docs/specs/2026-10-18-arculati-bank-s4.md:35`, `docs/specs/2026-10-18-arculati-bank-s4-vegrehajtas.md:1`
- **Mi van kész** — A `displayHeading` főági megvalósítását (`source/shared/lesson-ui-text.ts:66`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-ui-text.test.ts:43`). A korabeli mérés helye a #288 leírásának 12. sora (2 / 2).
- **Mi hiányzik** — Még ellenőrizendő: HA a tanuló választ, AKKOR a visszajelzés ítélete a szótár szövege, utána a modell indoklása előtag nélkül (dupla „Helyes” nincs). `docs/specs/2026-10-18-arculati-bank-s4.md:35`.
- **Folytatás helye** — `docs/specs/2026-10-18-arculati-bank-s4.md:1` · #288
- **Következő lépés** — A `displayHeading` bemenetétől (`source/shared/lesson-ui-text.ts:66`) kövesd az eredményt a `source/tests/lesson-ui-text.test.ts:43` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

### R-TERV-019 · Az évfolyamsávos arculat látható — a Csendes nézet nem ragad be, telítettebb sávháttér

- **Azonosító** — R-TERV-019
- **Cím** — Az évfolyamsávos arculat látható — a Csendes nézet nem ragad be, telítettebb sávháttér
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. Kényelmi vagy karbantartási javítás.
- **Eredeti utasítás / cél** — A tananyagokhoz jóváhagyott, témához illő kép tartozzon, a régi tartalom megőrzése mellett.
- **Forrás** — `docs/specs/2026-10-19-evfolyam-arculat-lathato.md:60`, `docs/specs/2026-10-19-evfolyam-arculat-lathato-vegrehajtas.md:1`
- **Mi van kész** — A `contrastRatio` főági megvalósítását (`source/shared/svg-contrast.ts:91`) közvetlenül meghívja az állítást tartalmazó próba (`source/tests/lesson-design.test.ts:145`). A korabeli mérés helye a #320 leírásának 32. sora (32/32).
- **Mi hiányzik** — Még ellenőrizendő: Kezdőállapot: HA a régi kulcsban true áll, AKKOR a lecke színes nézettel nyílik. `docs/specs/2026-10-19-evfolyam-arculat-lathato.md:60`.
- **Folytatás helye** — `docs/specs/2026-10-19-evfolyam-arculat-lathato.md:1` · #320
- **Következő lépés** — A `contrastRatio` bemenetétől (`source/shared/svg-contrast.ts:91`) kövesd az eredményt a `source/tests/lesson-design.test.ts:145` esetig. A sormutató nyitva hagyott pontjaihoz a hiányzó mérés nyugtáját keresd vissza.
- **Függőség / ütközés** — —
- **Kapcsolódó P-tétel** — —

## Elfogadási sormutató

A tábla mind a 770 útvonalat felsorolja. A sorok 5954 megjelölt helyet tartalmaznak. Egy több sorba tört feltételnél a kezdősor az irányadó. A „követés”, „szelet” és „állapot” a dokumentum jelzője. Az értelmezés és a későbbi döntés a család tételében olvasható. A „KÉSZ” az igazolt családban lezárt feltétel. Az „egyezés” a korabeli lezárás és egy főági próbapont közötti szöveg- vagy esetazonosító-egyezés, a bizonyíték mindkét végével. Ahol ennek viselkedési vagy éles része nyitott, az „ellenőrizetlen” soroknál kell folytatni. Egy teszt forráshelye önmagában nem igazol mai futást.

| Család | Forrás a rögzített főágon vagy jelölt commitban | Pontok és eredményük (sorok) | Tételes bizonyíték / összevetendő egyezés |
|---|---|---|---|
| R-TERV-001 | `docs/handoffs/2026-11-18-adventi-naptar-retro.md` | szelet 12–17 · követés 34–35, 64 · ELLENŐRIZETLEN 74–77, 79 | — |
| R-TERV-001 | `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | állapot 3 · szelet 35, 95, 129, 183, 222, 256, 290, 313, 343, 373, 386, 409, 416, 454, 467, 499, 574 · ELLENŐRIZETLEN 93, 127, 181, 220, 254, 288, 311, 341, 407, 411, 413–414, 448, 452, 456, 460, 462, 464, 469, 473, 475, 478, 480, 482–483, 486, 490, 492–495, 497, 501, 504–507, 509, 511–512, 514, 518, 523, 526, 530, 533, 540, 542, 548–549, 551, 553–556, 558–559, 561 | — |
| R-TERV-001 | `docs/specs/2026-11-18-adventi-naptar.md` | követés 30, 98 · ELLENŐRIZETLEN 89–90, 97, 102–104, 112, 114, 121–122, 128, 133–134, 140–141, 147, 153, 157, 163, 175, 181, 189, 215, 238, 243, 249, 264, 271–282, 284, 286, 288–294, 296–298, 304–305, 307, 309, 311, 313, 315, 317, 319, 321, 323, 325, 328–329, 331, 333, 335, 337, 340–341, 343, 345–346, 348, 350, 352, 354, 357–358, 361–362, 365, 367–370, 372, 374, 541, 544–546, 548, 550, 552, 554, 588, 597, 599–605, 607, 615, 619–620, 622–623, 629, 631–636, 638, 643, 651, 653, 655–683, 685, 689, 691–697, 699, 702–703, 705–706, 708, 714, 718, 721, 723–724, 731, 734, 736, 738–739, 743, 746, 752, 755, 763, 767, 770, 772, 774, 780, 782, 784–790, 792, 796, 798, 803, 805, 808, 811, 813, 817, 819, 821, 830, 834, 836, 838, 840, 843, 947, 951, 954, 956, 958 · szelet 416, 429, 437–447, 557, 564, 568–577, 859, 861, 875, 881, 889, 897, 912, 933, 967, 992, 998, 1014 · állapot 783 | — |
| R-TERV-002 | `docs/specs/2026-09-13-documentation-memory-hygiene-vegrehajtas.md` | követés 32 | — |
| R-TERV-002 | `docs/specs/2026-09-13-documentation-memory-hygiene.md` | ELLENŐRIZETLEN 44–46, 48–49 · követés 47 | — |
| R-TERV-003 | `docs/specs/2026-10-14-higienia-vegrehajtas.md` | KÉSZ 5, 25 · követés 7 | — |
| R-TERV-003 | `docs/specs/2026-10-14-higienia.md` | követés 8 · KÉSZ 21–25 | — |
| R-TERV-004 | `docs/specs/2026-11-10-korlat-kliens-ip-vegrehajtas.md` | ELLENŐRIZETLEN 5, 15, 22, 29, 39, 49, 59 | — |
| R-TERV-004 | `docs/specs/2026-11-10-korlat-kliens-ip.md` | ELLENŐRIZETLEN 76, 79, 84, 90 · egyezés 77, 81–83, 87–88 · követés 97 | 77 → docs/specs/2026-11-10-korlat-kliens-ip.md:77 + source/tests/client-ip.test.ts:160 / 81 → docs/specs/2026-11-10-korlat-kliens-ip.md:81 + source/tests/client-ip.test.ts:38 / 82 → docs/specs/2026-11-10-korlat-kliens-ip.md:82 + source/tests/client-ip.test.ts:82 / 83 → docs/specs/2026-11-10-korlat-kliens-ip.md:83 + source/tests/client-ip.test.ts:91 / 87 → docs/specs/2026-11-10-korlat-kliens-ip.md:87 + source/tests/client-ip.test.ts:202 / 88 → docs/specs/2026-11-10-korlat-kliens-ip.md:88 + source/tests/client-ip.test.ts:213 |
| R-TERV-005 | `docs/specs/2026-11-16-valodi-cimek-ki-vegrehajtas.md` | állapot 3, 82 · ELLENŐRIZETLEN 9, 15, 27, 38, 43, 57, 64, 74, 80 | — |
| R-TERV-005 | `docs/specs/2026-11-16-valodi-cimek-ki.md` | ELLENŐRIZETLEN 75, 77, 79–83, 85–88, 91–97 | — |
| R-TERV-006 | `70067c1db:docs/specs/2026-11-19-kitakaro-negyzetes-regex-vegrehajtas.md` | ELLENŐRIZETLEN 7, 43, 53, 70, 84, 93, 108, 111 | — |
| R-TERV-006 | `3641d3926:docs/specs/2026-11-19-kitakaro-negyzetes-regex.md` | ELLENŐRIZETLEN 56, 63, 65, 71, 93–95, 97, 99, 101 | — |
| R-TERV-007 | `b73f464c8:docs/specs/2026-11-20-kliens-ip-cloudflare-ut-vegrehajtas.md` | ELLENŐRIZETLEN 7, 22, 30, 35, 40, 47 | — |
| R-TERV-007 | `1416cbf1f:docs/specs/2026-11-20-kliens-ip-cloudflare-ut.md` | ELLENŐRIZETLEN 72, 75, 78, 80–81, 83, 85–86, 89 | 78, 83 → Összevetendő: source/tests/client-ip.test.ts:82 |
| R-TERV-008 | `docs/specs/ls-0-hygiene-2026-09-04.md` | szelet 1 · KÉSZ 70–77 · követés 101 | — |
| R-TERV-009 | `docs/specs/sec-107-csrf-client-calls-2026-09-04.md` | KÉSZ 1, 43–45, 47–49, 51 | — |
| R-TERV-010 | `docs/security-secret-hygiene-2026-09-13.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-011 | `docs/specs/2026-10-15-hero-cta-46px-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-011 | `docs/specs/2026-10-15-hero-cta-46px.md` | ELLENŐRIZETLEN 14 | — |
| R-TERV-012 | `docs/specs/2026-10-17-arculati-bank-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 16, 33 | — |
| R-TERV-012 | `docs/specs/2026-10-17-arculati-bank.md` | ELLENŐRIZETLEN 73, 82–86 | — |
| R-TERV-013 | `docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md` | szelet 1 | — |
| R-TERV-014 | `docs/specs/2026-10-18-arculat-backfill-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-014 | `docs/specs/2026-10-18-arculat-backfill.md` | ELLENŐRIZETLEN 29–32 | — |
| R-TERV-015 | `docs/specs/2026-10-18-arculati-bank-s4-vegrehajtas.md` | szelet 1 | — |
| R-TERV-015 | `docs/specs/2026-10-18-arculati-bank-s4.md` | szelet 1 · ELLENŐRIZETLEN 34–37 | — |
| R-TERV-016 | `docs/specs/2026-10-18-emlekezteto-probalevel-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-016 | `docs/specs/2026-10-18-emlekezteto-probalevel.md` | KÉSZ 21, 24–26 | — |
| R-TERV-017 | `docs/specs/2026-10-18-napi-emlekezteto-vegrehajtas.md` | KÉSZ 14 | — |
| R-TERV-017 | `docs/specs/2026-10-18-napi-emlekezteto.md` | KÉSZ 35, 55–56, 58–59, 61–63 | — |
| R-TERV-018 | `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo-vegrehajtas.md` | KÉSZ 16, 18 | — |
| R-TERV-018 | `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md` | KÉSZ 26, 31, 60–61, 65–67, 69–71 | — |
| R-TERV-019 | `docs/specs/2026-10-19-evfolyam-arculat-lathato-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-019 | `docs/specs/2026-10-19-evfolyam-arculat-lathato.md` | állapot 3 · ELLENŐRIZETLEN 59–61, 63, 65–66 | — |
| R-TERV-020 | `docs/specs/2026-10-19-mai-felfedezes-hirlevel-vegrehajtas.md` | szelet 5, 34 | — |
| R-TERV-020 | `docs/specs/2026-10-19-mai-felfedezes-hirlevel.md` | állapot 3 · ELLENŐRIZETLEN 19, 24, 49–50, 52, 54–56 | — |
| R-TERV-021 | `docs/specs/2026-10-19-mai-felfedezes-hirlevel-s2-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 19 | — |
| R-TERV-022 | `docs/specs/2026-10-21-diktalas-hid-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-022 | `docs/specs/2026-10-21-diktalas-hid.md` | KÉSZ 24–25, 27 | — |
| R-TERV-023 | `docs/specs/2026-10-31-hirlevel-youtube-ajanlo-vegrehajtas.md` | követés 46 | — |
| R-TERV-023 | `docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md` | állapot 3 · követés 23, 26 · ELLENŐRIZETLEN 56–57, 59, 62–64 | — |
| R-TERV-024 | `docs/specs/2026-11-03-fooldal-boritokartyak-vegrehajtas.md` | ELLENŐRIZETLEN 18, 27, 54, 68 | — |
| R-TERV-024 | `docs/specs/2026-11-03-fooldal-boritokartyak.md` | ELLENŐRIZETLEN 97, 99, 101–104 | — |
| R-TERV-025 | `docs/specs/2026-11-03-fooldal-nezetek-vegrehajtas.md` | KÉSZ 5, 18, 24, 35, 52, 62 · állapot 38 | — |
| R-TERV-025 | `docs/specs/2026-11-03-fooldal-nezetek.md` | KÉSZ 69, 71–72, 74–78 | — |
| R-TERV-026 | `docs/specs/2026-11-03-hero-szponzor-2026-vegrehajtas.md` | KÉSZ 5, 13, 38, 47 | — |
| R-TERV-026 | `docs/specs/2026-11-03-hero-szponzor-2026.md` | KÉSZ 72, 74, 76–77, 79 | — |
| R-TERV-027 | `docs/specs/2026-11-03-szponzor-fejlec-vegrehajtas.md` | KÉSZ 5, 13, 27 | — |
| R-TERV-027 | `docs/specs/2026-11-03-szponzor-fejlec.md` | KÉSZ 65, 67–68, 70 | — |
| R-TERV-028 | `docs/specs/2026-11-05-napi-emlekezteto-teszt-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-028 | `docs/specs/2026-11-05-napi-emlekezteto-teszt.md` | KÉSZ 20–21 | — |
| R-TERV-029 | `80f4c6cc3:docs/kabala-fooldal.md` | állapot 3 | — |
| R-TERV-029 | `69216bd09:docs/specs/2026-11-18-kabala-fooldal-vegrehajtas.md` | állapot 4 · ELLENŐRIZETLEN 10, 15, 38, 65, 74 | — |
| R-TERV-029 | `a8354f22a:docs/specs/2026-11-18-kabala-fooldal.md` | ELLENŐRIZETLEN 75, 200–217, 219, 221–225 | — |
| R-TERV-030 | `bc3196e09:docs/kabala-maki.md` | állapot 3 | — |
| R-TERV-030 | `bc3196e09:docs/specs/2026-11-18-kabala-maki-vegrehajtas.md` | állapot 4 · követés 7, 114 | — |
| R-TERV-030 | `bc3196e09:docs/specs/2026-11-18-kabala-maki.md` | ELLENŐRIZETLEN 66, 72–73, 75, 77, 79–86, 88, 129–130, 132–140, 148, 150, 152, 154–155, 157–159, 161–162 | — |
| R-TERV-031 | `7ed789eeb:docs/specs/2026-11-19-websuli-potlasok-terv-vegrehajtas.md` | ELLENŐRIZETLEN 73, 102, 111, 113, 128, 130, 142, 144, 155, 157, 164, 167, 179, 181, 189, 191, 200, 202, 210, 214, 232, 234, 242, 250, 252, 260, 262, 268, 270, 278, 280, 288, 290, 298, 300, 307, 309, 315, 317, 324, 326, 332, 334, 341, 353, 368, 370, 376, 383, 392, 409, 411, 415, 428, 431, 433, 443, 445, 449, 451, 455, 457, 461, 463, 466, 472, 479, 483–484, 486 · szelet 82, 104, 244, 379, 385, 404, 474 · követés 95, 490 | — |
| R-TERV-031 | `7ed789eeb:docs/specs/2026-11-19-websuli-potlasok-terv.md` | szelet 42, 46–48, 51, 68, 78–79, 87, 93–98, 101, 119, 121, 129–131, 183, 189–190, 201, 212–218, 220–222, 224, 226, 234–235, 545, 550–551, 554 · követés 148, 256, 546 · ELLENŐRIZETLEN 245, 264, 269, 277, 281, 287, 292, 307, 314, 324, 328, 334, 337, 340, 346, 349, 354, 356, 358, 365, 369, 373, 377, 381, 386, 392, 397, 403, 409, 413, 417, 420, 425–427, 435, 454, 456, 516, 525, 528, 531, 537, 571, 576–577, 579–580, 582–584 | — |
| R-TERV-031 | `4cdd7af74:docs/websuli-potlasok.md` | követés 6, 23–24, 44, 53, 57, 95–96, 226, 361, 421, 535, 815, 1017, 1032, 1240 · szelet 37–39, 45, 49–51, 54–55, 60, 64–69, 72, 74, 90, 99, 101–102, 108, 126, 144, 237, 297, 312, 327, 372, 387, 462, 525, 541, 557, 573, 589, 606, 654, 684, 938, 1074, 1104, 1245, 1255–1257, 1275, 1277, 1282–1283, 1290–1291, 1302–1306, 1310–1312, 1314–1319, 1327–1328, 1349–1351 · állapot 112, 130, 148, 163, 181, 196, 211, 241, 256, 271, 286, 301, 316, 331, 346, 376, 391, 406, 436, 451, 466, 484, 499, 514, 529, 545, 561, 577, 593, 610, 628, 643, 658, 673, 688, 703, 718, 733, 751, 769, 785, 803, 821, 836, 851, 866, 881, 896, 912, 927, 942, 957, 972, 987, 1002, 1047, 1062, 1078, 1093, 1108, 1123, 1138, 1153 · ELLENŐRIZETLEN 159, 177, 192, 207, 222, 252, 267, 282, 342, 357, 402, 417, 432, 447, 480, 495, 510, 624, 639, 649, 669, 699, 714, 729, 747, 765, 781, 799, 817, 832, 847, 862, 877, 892, 908, 923, 953, 968, 983, 998, 1013, 1028, 1043, 1058, 1089, 1119, 1134, 1149 | — |
| R-TERV-032 | `docs/specs/backlog-4-2026-09-02.md` | ELLENŐRIZETLEN 9–10, 12–13, 17–19, 22, 24–25, 27, 30–31, 36–37, 40, 43, 47–50, 53–54, 56–59, 61 | — |
| R-TERV-033 | `docs/specs/2026-10-18-tanuloi-profil.md` | ELLENŐRIZETLEN 66–69, 71–72 | — |
| R-TERV-034 | `docs/specs/2026-10-18-tanuloi-profil-s1-vegrehajtas.md` | szelet 1 | — |
| R-TERV-035 | `docs/specs/2026-10-18-tanuloi-profil-s2-vegrehajtas.md` | szelet 1 | — |
| R-TERV-036 | `docs/specs/2026-10-18-tanuloi-profil-s3-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 16 | — |
| R-TERV-037 | `docs/specs/2026-10-18-tanuloi-profil-s4-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 15 · követés 60 | — |
| R-TERV-038 | `docs/specs/2026-10-18-tanuloi-profil-s5-vegrehajtas.md` | szelet 1 · követés 37 | — |
| R-TERV-039 | `docs/specs/2026-10-21-tanulo-parositas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-039 | `docs/specs/2026-10-21-tanulo-parositas.md` | ELLENŐRIZETLEN 22–25, 41–42, 44–45 | — |
| R-TERV-040 | `docs/handoffs/2026-11-16-jatekelmeny-fiok-retro.md` | szelet 1, 33–40 · követés 64, 154, 159 · ELLENŐRIZETLEN 118, 139, 141, 143–144, 147–148, 150, 152, 156 | — |
| R-TERV-040 | `docs/jatek-fiok-uzemeltetes.md` | követés 34 | — |
| R-TERV-040 | `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | szelet 1, 14–38, 99, 137, 167, 285, 312–318, 385, 472, 479, 793, 806, 933, 946, 974, 1024, 1056, 1081, 1116, 1129, 1143, 1160, 1187, 1220, 1233, 1247, 1271, 1296, 1307, 1317, 1332, 1357, 1390, 1406, 1424, 1436, 1465, 1494, 1515, 1546, 1584, 1650, 1665, 1678, 1702, 1726, 1736, 1801, 1825, 1840, 1855, 1868, 1890, 1904, 1952, 1957, 1978, 2003, 2010, 2016, 2087, 2122, 2154, 2178, 2247, 2285, 2300, 2360, 2371, 2388, 2400, 2412, 2495, 2526, 2562, 2584, 2619, 2722, 2762, 2767, 2827, 2842, 2884, 2894, 2911, 2921, 2952–2959 · állapot 169, 322, 387, 481, 808, 948, 1032, 1162, 1249, 1334, 1438, 1467, 1680, 1803, 1870, 1906, 1959, 1980, 2089, 2124, 2156, 2180, 2249, 2287, 2362, 2373, 2390, 2402, 2414, 2497, 2528, 2564, 2586, 2621, 2724, 2769, 2829, 2844, 2886, 2896, 2913, 2923, 2936 · ELLENŐRIZETLEN 189–195, 376, 388, 474–475, 477, 482, 780, 795–797, 809, 935–937, 949, 1145–1148, 1150, 1163, 1235, 1237–1239, 1250, 1303, 1319–1321, 1335, 1426, 1428–1429, 1461, 1468, 1480, 1667–1669, 1681, 1738–1740, 1769, 1804, 1892–1893, 1895, 1908, 1954–1955, 1972, 1981, 2005–2006, 2008, 2298, 2330, 2337–2338, 2374, 2559, 2582, 2616, 2720, 2758, 2822, 2837, 2937 · követés 201, 470, 790, 920, 1070, 1414, 1637, 1752, 2609 | — |
| R-TERV-040 | `docs/specs/2026-11-16-jatekok-jatekelmeny.md` | szelet 1, 349, 365–369, 389, 391, 410–411, 416, 478–487, 495, 730–736, 767, 771–784, 926–938, 947–948, 955, 958–959, 963, 965–967 · követés 120, 378, 946 · ELLENŐRIZETLEN 566, 615, 790–791, 793, 795, 798, 802, 804, 806, 808, 811, 813, 815, 817, 819, 821, 824, 826, 829, 831, 833, 835, 837, 839, 841, 843, 846–847, 849, 853–854, 857, 860–861, 863, 865, 870, 873, 877, 881, 883, 885, 887, 890, 892, 895, 900, 902, 905, 907, 909, 911, 914–916, 918–919, 924 · állapot 880 | — |
| R-TERV-041 | `docs/handoffs/2026-09-12-runtime-knowledge-release.md` | követés 39 · ELLENŐRIZETLEN 41 | — |
| R-TERV-041 | `docs/specs/2026-09-12-runtime-knowledge-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-041 | `docs/specs/2026-09-12-runtime-knowledge.md` | követés 10 · KÉSZ 15–21 | 15–21 → #60 · docs/handoffs/2026-09-12-runtime-knowledge-release.md:25–31. |
| R-TERV-042 | `docs/handoffs/2026-09-13-tananyag-pipeline-handoff.md` | követés 32, 34–35 · ELLENŐRIZETLEN 36–38, 42–49 | — |
| R-TERV-042 | `docs/specs/2026-09-13-web-knowledge-pipeline-vegrehajtas.md` | ELLENŐRIZETLEN 104 · követés 107 | — |
| R-TERV-042 | `docs/specs/2026-09-13-web-knowledge-pipeline.md` | ELLENŐRIZETLEN 61–67 | — |
| R-TERV-043 | `docs/specs/2026-09-29-nat2020-grade6-knowledge-vegrehajtas.md` | követés 31, 53, 59 | — |
| R-TERV-043 | `docs/specs/2026-09-29-nat2020-grade6-knowledge.md` | KÉSZ 33, 35–37 | — |
| R-TERV-044 | `docs/specs/2026-09-30-kivonatolas-keret-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-044 | `docs/specs/2026-09-30-kivonatolas-keret.md` | ELLENŐRIZETLEN 8–11 | — |
| R-TERV-045 | `docs/specs/2026-09-30-tanari-keres-forrasbol-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-045 | `docs/specs/2026-09-30-tanari-keres-forrasbol.md` | szelet 1 · ELLENŐRIZETLEN 21–23 | — |
| R-TERV-046 | `docs/specs/2026-10-05-s1-katalogus-kinyeres-vegrehajtas.md` | szelet 1 | — |
| R-TERV-046 | `docs/specs/2026-10-05-s1-katalogus-kinyeres.md` | szelet 1 · KÉSZ 30–31, 33–34 | — |
| R-TERV-047 | `docs/specs/2026-10-05-s11-forras-ocr-elrendezes-bizonytalansag-vegrehajtas.md` | szelet 1, 17, 35, 49, 60 · ELLENŐRIZETLEN 22 | — |
| R-TERV-047 | `docs/specs/2026-10-05-s11-forras-ocr-elrendezes-bizonytalansag.md` | szelet 1, 43, 51, 64, 113, 149, 184 · ELLENŐRIZETLEN 32, 36–38, 40–41, 48, 103–104, 106–108, 122, 132–134, 136, 140, 144, 161, 163–164, 166, 200–203 | — |
| R-TERV-048 | `docs/specs/2026-10-05-s4-tantargyi-skillek-vegrehajtas.md` | szelet 1 | — |
| R-TERV-048 | `docs/specs/2026-10-05-s4-tantargyi-skillek.md` | szelet 1 · ELLENŐRIZETLEN 43–45, 47, 49–50 | — |
| R-TERV-049 | `docs/specs/2026-10-06-s5-tantargyi-memoria-vegrehajtas.md` | szelet 1 | — |
| R-TERV-049 | `docs/specs/2026-10-06-s5-tantargyi-memoria.md` | szelet 1, 62, 68 · ELLENŐRIZETLEN 157–158, 160, 162–164, 166–169 | — |
| R-TERV-050 | `docs/specs/2026-10-06-s6-katalogus-bekotes-vegrehajtas.md` | szelet 1, 23, 52 | — |
| R-TERV-050 | `docs/specs/2026-10-06-s6-katalogus-bekotes.md` | szelet 1, 34, 39 · állapot 47 · ELLENŐRIZETLEN 95–96, 98, 100–104, 106 | — |
| R-TERV-051 | `docs/specs/2026-10-14-forras-besorolo-openai-luna-vegrehajtas.md` | ELLENŐRIZETLEN 7, 15, 20, 26, 30, 35, 40 · követés 18 | — |
| R-TERV-051 | `docs/specs/2026-10-14-forras-besorolo-openai-luna.md` | követés 59, 71 · ELLENŐRIZETLEN 81–82, 84–87 | — |
| R-TERV-052 | `docs/specs/2026-11-02-mht-forras-vegrehajtas.md` | ELLENŐRIZETLEN 5, 9, 21, 28, 34 | — |
| R-TERV-052 | `docs/specs/2026-11-02-mht-forras.md` | ELLENŐRIZETLEN 44–46, 48, 50–51 | — |
| R-TERV-053 | `docs/ls-1-tudas-terkep-hasznalat.md` | szelet 1 · KÉSZ 51, 65, 72, 76, 78, 80–81, 83, 85–86 · követés 67 | — |
| R-TERV-053 | `docs/specs/ls-1-knowledge-map-2026-09-04.md` | szelet 1, 19 · KÉSZ 60, 75, 78, 80–83 | — |
| R-TERV-054 | `docs/lesson-improvement.md` | követés 86 | — |
| R-TERV-054 | `docs/specs/2026-09-07-lesson-improvement-prompts.md` | ELLENŐRIZETLEN 14–18 · követés 30 | — |
| R-TERV-055 | `docs/specs/2026-09-07-tananyag-didaktikai-iv.md` | szelet 65 · ELLENŐRIZETLEN 67, 100, 108, 115 | — |
| R-TERV-056 | `docs/specs/2026-09-09-tananyag-keszito-v74-integracio-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-056 | `docs/specs/2026-09-09-tananyag-keszito-v74-integracio.md` | ELLENŐRIZETLEN 40, 42–46 | — |
| R-TERV-057 | `docs/specs/2026-09-11-lesson-workflow-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-057 | `docs/specs/2026-09-11-lesson-workflow.md` | KÉSZ 31, 33–40, 44, 46 · követés 60 | — |
| R-TERV-058 | `docs/handoffs/2026-09-11-live-workflow-acceptance.md` | követés 15 | — |
| R-TERV-058 | `docs/handoffs/2026-09-11-workflow-elesites.md` | követés 44 | — |
| R-TERV-058 | `docs/specs/2026-09-11-live-workflow-acceptance-vegrehajtas.md` | követés 8 | — |
| R-TERV-058 | `docs/specs/2026-09-11-live-workflow-acceptance.md` | ELLENŐRIZETLEN 11–14 | — |
| R-TERV-059 | `docs/specs/2026-09-11-prompt-version-width-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-059 | `docs/specs/2026-09-11-prompt-version-width.md` | KÉSZ 7 | — |
| R-TERV-060 | `docs/specs/2026-09-12-lektori-hatokeszeles-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-060 | `docs/specs/2026-09-12-lektori-hatokeszeles.md` | ELLENŐRIZETLEN 44, 48, 50, 52 | — |
| R-TERV-061 | `docs/specs/2026-09-12-lektori-javitokor-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-061 | `docs/specs/2026-09-12-lektori-javitokor.md` | ELLENŐRIZETLEN 13, 25, 29 | — |
| R-TERV-062 | `docs/specs/2026-09-12-pipeline-closure-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-062 | `docs/specs/2026-09-12-pipeline-closure.md` | ELLENŐRIZETLEN 6 | — |
| R-TERV-063 | `docs/handoffs/2026-09-12-runtime-skill-learning.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-063 | `docs/runtime-skill-learning.md` | követés 49 | — |
| R-TERV-063 | `docs/specs/2026-09-12-runtime-skill-learning-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-063 | `docs/specs/2026-09-12-runtime-skill-learning.md` | követés 6 · KÉSZ 20–26 | — |
| R-TERV-064 | `docs/specs/2026-09-14-lektor-skill-gate-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-064 | `docs/specs/2026-09-14-lektor-skill-gate.md` | KÉSZ 17–21, 23 | — |
| R-TERV-065 | `docs/specs/2026-09-19-autonomous-lesson-pipeline-vegrehajtas.md` | szelet 15, 49 · követés 61, 85 | — |
| R-TERV-065 | `docs/specs/2026-09-19-autonomous-lesson-pipeline.md` | ELLENŐRIZETLEN 105, 107–108, 112–113, 115–116, 121, 129, 134, 140, 151, 159, 164, 170–171, 173–174, 176, 184, 187, 190, 193 | — |
| R-TERV-066 | `docs/specs/2026-09-19-model-matrix-and-planner-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-066 | `docs/specs/2026-09-19-model-matrix-and-planner.md` | ELLENŐRIZETLEN 57–61, 183, 235, 240, 281, 287, 309, 348, 355, 379, 401 | — |
| R-TERV-067 | `docs/specs/2026-09-24-lektor-tanitas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-067 | `docs/specs/2026-09-24-lektor-tanitas.md` | ELLENŐRIZETLEN 29–30 | — |
| R-TERV-068 | `docs/specs/2026-09-25-openai-keret-atallas.md` | ELLENŐRIZETLEN 37, 39, 41, 44–45, 47 | — |
| R-TERV-069 | `docs/specs/2026-09-25-webes-studio-atadas-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 5, 9, 16, 24, 35, 48, 54 | — |
| R-TERV-069 | `docs/specs/2026-09-25-webes-studio-atadas.md` | szelet 1 · ELLENŐRIZETLEN 45, 69–74 · követés 84 | — |
| R-TERV-070 | `docs/specs/2026-09-29-kapu-proba-keret-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-070 | `docs/specs/2026-09-29-kapu-proba-keret.md` | ELLENŐRIZETLEN 23, 29–32 | 30 → Összevetendő: source/tests/lesson-arc.test.ts:406 |
| R-TERV-071 | `docs/specs/2026-09-29-lektor-tokenkeret-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-071 | `docs/specs/2026-09-29-lektor-tokenkeret.md` | ELLENŐRIZETLEN 21–22 | — |
| R-TERV-072 | `docs/specs/2026-09-30-dinamikus-keret-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-072 | `docs/specs/2026-09-30-dinamikus-keret.md` | szelet 1 · ELLENŐRIZETLEN 22–23 | — |
| R-TERV-073 | `docs/specs/2026-09-30-nem-elakado-kozzetetel-vegrehajtas.md` | szelet 1 | — |
| R-TERV-073 | `docs/specs/2026-09-30-nem-elakado-kozzetetel.md` | szelet 1 · ELLENŐRIZETLEN 74–79 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/evidence-models-raw.json` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/evidence-so-bank.txt` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/evidence-so-probe.txt` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/evidence-visits-tokens.txt` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/hibakorpusz.txt` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/kor1.md` | ELLENŐRIZETLEN 11, 13, 19, 21–24, 26, 28, 30, 32, 34, 48, 211–216, 218, 220–222, 301–306, 412–419, 421 · követés 252, 349 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/kor2.md` | ELLENŐRIZETLEN 72 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/kor3.md` | ELLENŐRIZETLEN 35, 72, 74, 76, 111, 113 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/kor4.md` | ELLENŐRIZETLEN 54, 61, 63, 65–68, 70, 95, 119 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/kor5.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-astra/kor6.md` | ELLENŐRIZETLEN 3, 5, 7, 11, 13–14, 16, 18, 20–21, 23, 25–26, 28, 30, 36, 38–44, 46, 50, 52, 54, 56–58, 60, 62, 66–69, 75, 77–78, 80–82, 84, 86, 88–89, 91–93, 95, 97–99, 101, 103, 106, 109, 113, 115–117, 119, 123–126, 130, 132, 134–138, 140, 144, 146–152, 154 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-status.md` | ELLENŐRIZETLEN 62, 65, 67 · RÉSZBEN 64 | 64 → A zárólap 60. és 64. sora eltérő megvalósítást rögzít. |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel-vegrehajtas.md` | ELLENŐRIZETLEN 14, 37, 46, 58, 81, 97, 112, 134 | — |
| R-TERV-074 | `docs/specs/2026-09-30-utasitasrendszer-rendbetetel.md` | ELLENŐRIZETLEN 16, 32, 87, 96, 125, 145, 163, 169, 172, 236, 239, 242, 250–251, 254–255, 257, 259, 261, 263, 265–266 · állapot 262 | — |
| R-TERV-075 | `docs/specs/2026-10-01-javitasi-fokonyv-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-075 | `docs/specs/2026-10-01-javitasi-fokonyv.md` | ELLENŐRIZETLEN 32–33, 35–38 | — |
| R-TERV-076 | `docs/specs/2026-10-05-lektor-szerzo-modellcsere.md` | ELLENŐRIZETLEN 21–23 | — |
| R-TERV-077 | `docs/specs/2026-10-05-s9-prompt-javito-orkesztrator-vegrehajtas.md` | szelet 1, 19, 35, 47, 83, 93, 106, 116, 122 · ELLENŐRIZETLEN 54, 78, 98 | — |
| R-TERV-077 | `docs/specs/2026-10-05-s9-prompt-javito-orkesztrator.md` | szelet 1 · ELLENŐRIZETLEN 48–49, 51, 53–54 | — |
| R-TERV-078 | `docs/specs/2026-10-06-s7-workflow-rendbetetel-vegrehajtas.md` | szelet 1, 6, 29, 42, 59, 91, 106 | — |
| R-TERV-078 | `docs/specs/2026-10-06-s7-workflow-rendbetetel.md` | szelet 1 · ELLENŐRIZETLEN 112, 114, 116–120, 123–124 | — |
| R-TERV-079 | `docs/specs/2026-10-14-ellentetes-csalad-tartalek-vegrehajtas.md` | ELLENŐRIZETLEN 5, 13, 19, 25, 42 | — |
| R-TERV-079 | `docs/specs/2026-10-14-ellentetes-csalad-tartalek.md` | ELLENŐRIZETLEN 31, 39, 55, 80–81, 83, 85, 87, 89, 92, 94 · állapot 91 | — |
| R-TERV-080 | `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console-vegrehajtas.md` | ELLENŐRIZETLEN 5, 19, 38, 44, 58, 77 | — |
| R-TERV-080 | `docs/specs/2026-10-14-tananyag-v7_5-asztali-es-console.md` | ELLENŐRIZETLEN 63–67 | — |
| R-TERV-081 | `docs/specs/2026-10-14-tartalek-b-szelet-vegrehajtas.md` | ELLENŐRIZETLEN 5, 12, 31, 42, 50 | — |
| R-TERV-081 | `docs/specs/2026-10-14-tartalek-b-szelet.md` | ELLENŐRIZETLEN 22, 24, 27, 41–42, 44–46 | — |
| R-TERV-082 | `docs/specs/2026-10-15-admin-tananyag-draft-vegrehajtas.md` | KÉSZ 31–32, 40 | — |
| R-TERV-082 | `docs/specs/2026-10-15-admin-tananyag-draft.md` | követés 4 · KÉSZ 43–48 | — |
| R-TERV-083 | `docs/specs/2026-10-15-elakadas-vezerlo.md` | állapot 6 · ELLENŐRIZETLEN 46, 67–70, 72–73, 75–78, 81 · szelet 66 | — |
| R-TERV-084 | `docs/specs/2026-10-15-elakadas-vezerlo-v1-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-085 | `docs/specs/2026-10-15-elakadas-vezerlo-v3-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-086 | `docs/specs/2026-10-15-elakadas-vezerlo-v4-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-087 | `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas-vegrehajtas.md` | ELLENŐRIZETLEN 5, 15, 25, 33, 58, 74, 89 | — |
| R-TERV-087 | `docs/specs/2026-10-15-kapu-reszleges-javitas-folytatas.md` | ELLENŐRIZETLEN 13, 54, 57, 59, 63, 66, 69–70, 80, 82–86 · követés 21 | — |
| R-TERV-088 | `docs/specs/2026-10-15-tartalek-b4-webgyujtes-vegrehajtas.md` | ELLENŐRIZETLEN 5, 10, 16, 25 | — |
| R-TERV-088 | `docs/specs/2026-10-15-tartalek-b4-webgyujtes.md` | ELLENŐRIZETLEN 39–40, 42–44 | — |
| R-TERV-089 | `docs/specs/2026-10-16-egy-futas-vegrehajtas.md` | szelet 6, 18, 37, 73, 84, 90, 95, 109, 118, 127, 144, 196, 226, 239, 245, 260, 263, 271, 279, 285, 289 · ELLENŐRIZETLEN 46, 56, 152, 299, 301–302 | — |
| R-TERV-089 | `docs/specs/2026-10-16-egy-futas.md` | ELLENŐRIZETLEN 94–95, 97–98, 100, 102–103, 158–160 · szelet 105, 107, 120, 138 | — |
| R-TERV-090 | `docs/specs/2026-10-16-egyfutas-atvilagitas.md` | szelet 11, 93 | — |
| R-TERV-091 | `docs/specs/2026-10-16-gyartas-haladas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-091 | `docs/specs/2026-10-16-gyartas-haladas.md` | KÉSZ 35–38, 40 | — |
| R-TERV-092 | `docs/specs/2026-10-16-ujragyartas-jovahagyas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-092 | `docs/specs/2026-10-16-ujragyartas-jovahagyas.md` | ELLENŐRIZETLEN 22–26 | — |
| R-TERV-093 | `docs/specs/2026-10-17-studio-ui-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-093 | `docs/specs/2026-10-17-studio-ui.md` | KÉSZ 39, 50–52, 54 | — |
| R-TERV-094 | `docs/specs/2026-10-18-tartalmi-lektoralas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-094 | `docs/specs/2026-10-18-tartalmi-lektoralas.md` | ELLENŐRIZETLEN 79–81, 83–84 | — |
| R-TERV-095 | `docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md` | állapot 3 · szelet 25 · ELLENŐRIZETLEN 45, 72, 78, 83, 85, 87, 89–90, 92, 94 | — |
| R-TERV-096 | `docs/specs/2026-10-20-elakadas-r1-vegrehajtas.md` | ELLENŐRIZETLEN 1, 6, 9 | — |
| R-TERV-097 | `docs/specs/2026-10-20-elakadas-r3-ismetlodo-hiba-vegrehajtas.md` | KÉSZ 1, 13 | — |
| R-TERV-097 | `docs/specs/2026-10-20-elakadas-r3-ismetlodo-hiba.md` | KÉSZ 1, 23–24, 31–32, 34–35 · állapot 3 | — |
| R-TERV-098 | `docs/specs/2026-10-20-regi-anyag-studio-atalakitas-vegrehajtas.md` | ELLENŐRIZETLEN 8–9 | — |
| R-TERV-098 | `docs/specs/2026-10-20-regi-anyag-studio-atalakitas.md` | állapot 3 · ELLENŐRIZETLEN 51, 57–65 | — |
| R-TERV-099 | `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-099 | `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak.md` | állapot 3 · ELLENŐRIZETLEN 23–24 · egyezés 25 | 25 → #354 L7 + source/tests/regi-anyag-studio.test.ts:121 |
| R-TERV-100 | `docs/specs/2026-10-31-tananyag-fenykepezo-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-100 | `docs/specs/2026-10-31-tananyag-fenykepezo.md` | állapot 3 · ELLENŐRIZETLEN 64–65, 67, 69–71 | — |
| R-TERV-101 | `docs/specs/2026-11-05-gyartas-reszletes-kovetes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-101 | `docs/specs/2026-11-05-gyartas-reszletes-kovetes.md` | KÉSZ 17, 19–20, 44–48 | — |
| R-TERV-102 | `docs/specs/2026-11-10-gyartas-meres-vegrehajtas.md` | szelet 1, 7, 20, 38, 48, 59, 69, 78, 87, 116 · ELLENŐRIZETLEN 27 · követés 129 | — |
| R-TERV-102 | `docs/specs/2026-11-10-gyartas-meres.md` | szelet 32, 48, 56 · követés 103, 189 · ELLENŐRIZETLEN 117–120, 143–149, 153, 155–157, 159–160, 182, 184, 186–188 · RÉSZBEN 161 | 161 → A napló 1059 mp-et mér, a javítandó keresztütközés nem futott le. |
| R-TERV-103 | `docs/specs/2026-11-16-tananyag-evfolyam-jeloles-vegrehajtas.md` | állapot 3 · KÉSZ 8, 20, 30, 37, 45, 59, 76 | — |
| R-TERV-103 | `docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md` | állapot 3 · KÉSZ 9, 91, 93–98, 100–101 | — |
| R-TERV-104 | `docs/specs/2026-11-16-tananyag-evfolyam-modositas-vegrehajtas.md` | állapot 3 · KÉSZ 8, 19, 25, 31, 38, 51, 57 | — |
| R-TERV-104 | `docs/specs/2026-11-16-tananyag-evfolyam-modositas.md` | szelet 1 · állapot 3 · KÉSZ 75, 99, 102, 104, 106–107, 112–115 | — |
| R-TERV-105 | `docs/specs/2026-11-16-tananyag-programozas-felirat-vegrehajtas.md` | állapot 3 · KÉSZ 8, 16, 24, 30, 39 | — |
| R-TERV-105 | `docs/specs/2026-11-16-tananyag-programozas-felirat.md` | szelet 1 · állapot 3 · KÉSZ 54, 56–59 | — |
| R-TERV-106 | `docs/specs/2026-11-17-tananyag-cim-osztaly-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 126–128, 154, 157 · egyezés 129 | 129 → docs/specs/2026-11-17-tananyag-cim-osztaly-vegrehajtas.md:137 + source/tests/material-title.test.ts:239 |
| R-TERV-106 | `docs/specs/2026-11-17-tananyag-cim-osztaly.md` | állapot 3 · ELLENŐRIZETLEN 141, 143, 146, 150, 152, 154, 171–172, 179, 181, 183, 186, 188–189, 193, 195 · egyezés 168, 170, 174, 176–178, 184, 191 | 168 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:168 + source/tests/material-title.test.ts:23 / 170 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:170 + source/tests/material-title.test.ts:45 / 174 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:174 + source/tests/material-title.test.ts:149 / 176 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:176 + source/tests/material-title.test.ts:159 / 177 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:177 + source/tests/material-title.test.ts:176 / 178 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:178 + source/tests/material-title.test.ts:113 / 179 → Összevetendő: source/tests/material-title.spec.ts:227 / 184 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:184 + source/tests/material-title.test.ts:270 / 189 → Összevetendő: source/tests/material-title.test.ts:104 / 191 → docs/specs/2026-11-17-tananyag-cim-osztaly.md:191 + source/tests/material-title.test.ts:343 / 193 → Összevetendő: source/tests/material-title.test.ts:419 |
| R-TERV-107 | `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | szelet 1, 77–93, 117, 166, 205, 292, 355, 419, 509, 544, 572, 602, 665, 667, 689, 729, 741, 773, 795, 829, 850, 873, 904, 950, 964, 997, 1060, 1142, 1225, 1253, 1272 · ELLENŐRIZETLEN 190, 200, 283, 422, 684, 1080 · követés 737, 1209, 1303 | — |
| R-TERV-107 | `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | szelet 77, 183–192, 251, 256, 273, 285, 296, 307, 330, 339, 351, 360, 427, 511–523, 568–570, 576, 578–579 · követés 231, 413, 639 · ELLENŐRIZETLEN 258, 264, 298, 300, 323, 362, 365–366, 380, 388, 422, 439, 470, 489, 495, 500, 609, 618, 626, 633, 646, 652, 659, 675, 677, 679, 682, 684–685, 687, 689–691, 693–694, 696, 699, 701, 703–704, 706–707, 709, 711, 713–714, 717, 719, 721, 723–726, 728–729, 731, 734, 736, 738–739, 741, 745, 747, 749, 751, 753, 761, 763, 765, 767–768, 770–771, 773, 775, 778, 780, 784, 786, 788, 791, 793, 795 · RÉSZBEN 755, 757 | 755, 757 → A költség éles üzemben jelzés, kemény korlát csak próbán. P-065. |
| R-TERV-108 | `docs/specs/lesson-studio-execution-runbook-2026-09-04.md` | követés 14, 42, 78 · ELLENŐRIZETLEN 165–170 | — |
| R-TERV-108 | `docs/specs/lesson-studio-master-plan-2026-09-04.md` | ELLENŐRIZETLEN 158, 193–200 | — |
| R-TERV-109 | `docs/ls-2c-pipeline-hasznalat.md` | szelet 1 · ELLENŐRIZETLEN 50–51 | — |
| R-TERV-109 | `docs/specs/ls-2c-pipeline-calls-2026-09-04.md` | szelet 1 · ELLENŐRIZETLEN 53, 56, 58, 61–62, 64, 66 | — |
| R-TERV-110 | `docs/specs/tananyag-keszito-SKILL-v7_4.md` | ELLENŐRIZETLEN 47, 51, 116–120, 122, 340–342, 344–346, 481–482, 484–485, 489–492, 494–495, 497–498, 501–503, 506–508, 510–511, 513–514, 516, 530–552 | — |
| R-TERV-111 | `docs/specs/tananyag-keszito-SKILL-v7_5-kiegeszites.md` | ELLENŐRIZETLEN 169–174 | — |
| R-TERV-112 | `docs/specs/2026-09-11-direct-api-release-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-112 | `docs/specs/2026-09-11-direct-api-release.md` | ELLENŐRIZETLEN 3, 11 | — |
| R-TERV-113 | `docs/specs/2026-09-11-direct-studio-api-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-113 | `docs/specs/2026-09-11-direct-studio-api.md` | KÉSZ 9 · követés 20 | — |
| R-TERV-114 | `docs/specs/2026-09-11-web-research-background-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-114 | `docs/specs/2026-09-11-web-research-background.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-115 | `docs/specs/2026-09-11-web-research-completion-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-115 | `docs/specs/2026-09-11-web-research-completion.md` | KÉSZ 14–20 | — |
| R-TERV-116 | `docs/handoffs/2026-09-11-web-research-javitas.md` | követés 64 · ELLENŐRIZETLEN 66, 68, 70, 76, 78, 87–94 | — |
| R-TERV-117 | `docs/specs/2026-09-14-scheduled-publishing-db-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-117 | `docs/specs/2026-09-14-scheduled-publishing-db.md` | KÉSZ 8–9 · követés 24 | — |
| R-TERV-118 | `docs/specs/2026-09-25-webes-gyartas-elakadas-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 5, 16, 24, 33, 45, 50, 55 · követés 58 | — |
| R-TERV-118 | `docs/specs/2026-09-25-webes-gyartas-elakadas.md` | szelet 1, 99 · ELLENŐRIZETLEN 24, 77–85 · követés 92 | — |
| R-TERV-119 | `docs/specs/2026-10-13-resend-sandbox-or-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-119 | `docs/specs/2026-10-13-resend-sandbox-or.md` | ELLENŐRIZETLEN 46–47, 49–52, 56, 58, 60–61 | — |
| R-TERV-120 | `docs/specs/2026-10-13-sw-telepites-cache-biztonsag-vegrehajtas.md` | állapot 9 | — |
| R-TERV-120 | `docs/specs/2026-10-13-sw-telepites-cache-biztonsag.md` | KÉSZ 9, 34, 36, 38, 40 | — |
| R-TERV-121 | `docs/specs/2026-10-15-node-24-rogzites-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-121 | `docs/specs/2026-10-15-node-24-rogzites.md` | ELLENŐRIZETLEN 20–21 | — |
| R-TERV-122 | `docs/specs/2026-10-15-tetelgyar-t1b-bank-ujraepites-vegrehajtas.md` | ELLENŐRIZETLEN 13, 15, 18 | — |
| R-TERV-123 | `docs/specs/2026-10-15-ujraindulas-utani-folytatas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-123 | `docs/specs/2026-10-15-ujraindulas-utani-folytatas.md` | ELLENŐRIZETLEN 34, 36–40 · követés 35 | — |
| R-TERV-124 | `docs/specs/2026-10-18-autobackup-indulas-vegrehajtas.md` | KÉSZ 15 | — |
| R-TERV-124 | `docs/specs/2026-10-18-autobackup-indulas.md` | KÉSZ 31–32, 34–36 | — |
| R-TERV-125 | `docs/specs/2026-10-18-kliens-hibariport-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-125 | `docs/specs/2026-10-18-kliens-hibariport.md` | KÉSZ 41–42, 44–47 | — |
| R-TERV-126 | `docs/specs/2026-10-18-nyilvanos-oldal-sebesseg-vegrehajtas.md` | ELLENŐRIZETLEN 15 | — |
| R-TERV-126 | `docs/specs/2026-10-18-nyilvanos-oldal-sebesseg.md` | ELLENŐRIZETLEN 46–47, 49 | — |
| R-TERV-127 | `docs/specs/2026-10-19-eroforras-s1-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 14 | — |
| R-TERV-127 | `docs/specs/2026-10-19-eroforras-s1.md` | szelet 1 · állapot 3 · ELLENŐRIZETLEN 49–50, 52–53, 55 | — |
| R-TERV-128 | `docs/specs/2026-10-19-eroforras-s2a-vegrehajtas.md` | szelet 1 | — |
| R-TERV-128 | `docs/specs/2026-10-19-eroforras-s2a.md` | szelet 1 · állapot 3 · ELLENŐRIZETLEN 38–39, 41–43 | — |
| R-TERV-129 | `docs/specs/2026-10-19-eroforras-s2b-vegrehajtas.md` | szelet 1 | — |
| R-TERV-129 | `docs/specs/2026-10-19-eroforras-s2b.md` | szelet 1 · állapot 3 · KÉSZ 49–51, 53–54 | — |
| R-TERV-130 | `docs/specs/2026-10-19-eroforras-s3a-vegrehajtas.md` | szelet 1 | — |
| R-TERV-130 | `docs/specs/2026-10-19-eroforras-s3a.md` | szelet 1 · állapot 3 · ELLENŐRIZETLEN 54–55, 57–59 · követés 60 | — |
| R-TERV-131 | `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas-vegrehajtas.md` | szelet 1 · KÉSZ 14, 16–17 | — |
| R-TERV-131 | `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas.md` | szelet 1 · állapot 3 · KÉSZ 30, 51–52, 55–56 | — |
| R-TERV-132 | `docs/specs/2026-11-01-db-pool-error-crash-vegrehajtas.md` | KÉSZ 8, 16 | — |
| R-TERV-132 | `docs/specs/2026-11-01-db-pool-error-crash.md` | állapot 3 · KÉSZ 39–42 | — |
| R-TERV-133 | `docs/specs/2026-11-03-befejezes-onfejlesztes-dual-arch-vegrehajtas.md` | ELLENŐRIZETLEN 5, 19, 25, 30, 38, 59, 65, 71, 78 | — |
| R-TERV-133 | `docs/specs/2026-11-03-befejezes-onfejlesztes-dual-arch.md` | követés 76 · ELLENŐRIZETLEN 78, 80, 82, 84–85, 87, 89 | — |
| R-TERV-134 | `docs/specs/2026-11-03-fooldal-sebesseg-vegrehajtas.md` | ELLENŐRIZETLEN 5, 46, 59 | — |
| R-TERV-134 | `docs/specs/2026-11-03-fooldal-sebesseg.md` | ELLENŐRIZETLEN 77, 79, 81–82, 84 | — |
| R-TERV-135 | `docs/specs/2026-11-05-ci-learning-db-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-135 | `docs/specs/2026-11-05-ci-learning-db.md` | KÉSZ 26–27 | — |
| R-TERV-136 | `docs/specs/2026-11-05-render-beallitas-ellenorzes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-136 | `docs/specs/2026-11-05-render-beallitas-ellenorzes.md` | ELLENŐRIZETLEN 34, 37, 39, 43 | 37 → Összevetendő: scripts/qa/verify-render-settings.test.mjs:62 |
| R-TERV-137 | `docs/specs/2026-11-05-render-telepites-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-137 | `docs/specs/2026-11-05-render-telepites.md` | KÉSZ 27, 30, 32 | — |
| R-TERV-138 | `5bbaab438:docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-138 | `5bbaab438:docs/specs/2026-11-10-kisfilm-memoria.md` | ELLENŐRIZETLEN 46, 48–50 | — |
| R-TERV-139 | `docs/telepites-elotti-or.md` | állapot 3 | — |
| R-TERV-140 | `docs/specs/2026-09-07-game-viewport-experience.md` | ELLENŐRIZETLEN 22–26 · követés 42, 51, 53, 61 | — |
| R-TERV-141 | `docs/specs/2026-09-07-jatekelmeny-master-terv.md` | szelet 61 · ELLENŐRIZETLEN 68, 102, 106, 126, 146, 172, 188, 211 | — |
| R-TERV-142 | `docs/specs/2026-09-08-jatek-tananyag-javitasi-terv.md` | állapot 3 · ELLENŐRIZETLEN 43, 45, 56, 58–63, 65–66, 71, 74, 76, 78, 80, 123, 144, 162, 180, 210, 236, 240, 260, 280, 300, 320, 340, 370, 394, 417, 425 · követés 451 | — |
| R-TERV-143 | `docs/specs/2026-09-20-joystick-minden-jatekban.md` | ELLENŐRIZETLEN 56, 59–60, 62–63 | — |
| R-TERV-144 | `docs/specs/2026-09-29-jatek-bankok-ismetles-vegrehajtas.md` | KÉSZ 6, 32, 45, 60, 72, 88, 105 | — |
| R-TERV-144 | `docs/specs/2026-09-29-jatek-bankok-ismetles.md` | KÉSZ 51–52, 54–57, 79–80, 82 | — |
| R-TERV-145 | `docs/specs/2026-09-29-jatekok-10-palya-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-146 | `docs/specs/2026-09-29-jatekok-3-12-evfolyam.md` | KÉSZ 67–72 | — |
| R-TERV-147 | `docs/specs/2026-09-29-jatekok-3-12-evfolyam-bekotes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-148 | `docs/specs/2026-09-29-jatekok-3-12-evfolyam-tartalom-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-149 | `docs/specs/2026-09-29-jatekok-3d-latvany-vegrehajtas.md` | KÉSZ 18, 50, 59, 69, 78, 84, 90, 96, 102 | — |
| R-TERV-149 | `docs/specs/2026-09-29-jatekok-3d-latvany.md` | állapot 102 · KÉSZ 155, 157, 159–160, 162, 164, 166 | — |
| R-TERV-150 | `docs/specs/2026-09-29-palyak-szoletra-nyelvek.md` | ELLENŐRIZETLEN 91–97 | — |
| R-TERV-151 | `docs/specs/2026-09-29-szoletra-3d-nyelvek-vegrehajtas.md` | ELLENŐRIZETLEN 12, 17, 19, 22, 24, 37, 52, 69, 80, 88, 93, 103 | — |
| R-TERV-152 | `docs/specs/2026-09-29-szoletra-francia-bank-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-153 | `docs/specs/2026-09-29-szoletra-nemet-bank-vegrehajtas.md` | ELLENŐRIZETLEN 6, 12, 24, 49 | — |
| R-TERV-154 | `docs/specs/2026-09-29-tornado-fizika-vegrehajtas.md` | KÉSZ 6, 13, 23, 38, 43, 50, 60, 67 | — |
| R-TERV-154 | `docs/specs/2026-09-29-tornado-fizika.md` | KÉSZ 8, 20, 26, 47, 49, 51, 109–110, 112, 114–121, 132, 135, 141 | — |
| R-TERV-155 | `docs/specs/2026-09-29-tornado-motorfek-vegrehajtas.md` | KÉSZ 5–6 | — |
| R-TERV-155 | `docs/specs/2026-09-29-tornado-motorfek.md` | KÉSZ 13, 21–24 | — |
| R-TERV-156 | `docs/specs/2026-09-29-tornado-roadfactor-vegrehajtas.md` | KÉSZ 5, 17, 24, 35 · követés 41 | — |
| R-TERV-156 | `docs/specs/2026-09-29-tornado-roadfactor.md` | KÉSZ 66, 68–74 · követés 82 | — |
| R-TERV-157 | `docs/specs/2026-09-29-tornado-ut-kormanyzas-vegrehajtas.md` | KÉSZ 7, 20, 37, 55, 59, 66 | — |
| R-TERV-157 | `docs/specs/2026-09-29-tornado-ut-kormanyzas.md` | KÉSZ 9, 21, 64, 66–68, 70, 126–127, 129–131, 133, 136–137, 140–143, 146, 163, 172, 187 | — |
| R-TERV-158 | `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo-vegrehajtas.md` | ELLENŐRIZETLEN 5, 13, 35, 47, 56 | — |
| R-TERV-158 | `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo.md` | ELLENŐRIZETLEN 74, 76, 78, 80 | — |
| R-TERV-159 | `docs/modszertan-nyitomese-jatekos-kerdezes.md` | követés 38, 80, 103, 124, 148, 173, 200 · ELLENŐRIZETLEN 61, 83, 106, 127, 151, 177 | — |
| R-TERV-159 | `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes-vegrehajtas.md` | szelet 1, 15, 338 · ELLENŐRIZETLEN 8, 24–29, 59, 72, 96–101, 236, 245, 260, 270, 285, 294, 324, 331, 361 · követés 49, 359 | — |
| R-TERV-159 | `docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md` | követés 88, 256, 260, 281 · szelet 163, 167, 206 · ELLENŐRIZETLEN 208, 210, 212, 215, 226, 236, 239, 241, 254–255, 283 · egyezés 245, 247, 252 | 245 → docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md:245 + source/tests/prompt-cache.test.ts:39 / 247 → docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md:247 + source/tests/lesson-opener.test.ts:71 / 252 → docs/specs/2026-11-08-nyitomese-jatekos-kerdezes.md:252 + source/tests/lesson-opener.test.ts:82 |
| R-TERV-160 | `docs/handoffs/2026-11-16-jatekok-mobil-szobank-retro.md` | szelet 1, 10–22, 24–25 · ELLENŐRIZETLEN 78 | — |
| R-TERV-160 | `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` | szelet 13–26, 102, 164, 166, 202, 266, 352, 598, 726, 747, 911, 1027, 1066, 1107, 1151, 1236, 1296, 1377, 1466, 1545, 1630, 1719, 1798–1801, 1812–1842, 1844, 1856, 1860, 1865, 1867–1868, 1870 · követés 138, 565, 1339, 1749 · ELLENŐRIZETLEN 157, 742, 877, 881–882, 903, 1021, 1060, 1100, 1143, 1229, 1290, 1358, 1371, 1460, 1539, 1624, 1713, 1768, 1773, 1810, 1846, 1850–1855, 1858–1859, 1861, 1863, 1869, 1871–1872, 1876, 1878–1882 · állapot 728, 749, 913, 1029, 1068, 1109, 1153, 1238, 1298, 1379, 1468, 1547, 1632, 1721 · egyezés 1848–1849, 1857, 1862, 1864, 1866 | 1848 → #437 L18 + source/tests/vocab-bank-validate.test.ts:30 / 1849 → #437 L18 + source/tests/vocab-bank-validate.test.ts:24 / 1857 → #433 L21 + source/tests/support/game-mobile-quality.ts:385 / 1862 → #433 L21 + source/tests/support/game-mobile-quality.ts:433 / 1864 → #437 L17 + source/tests/support/game-mobile-quality.ts:474 / 1866 → #433 L21 + source/tests/support/game-mobile-quality.ts:500 |
| R-TERV-160 | `docs/specs/2026-11-15-jatekok-mobil-szobank.md` | ELLENŐRIZETLEN 63–64, 66–67, 194–195, 197, 199, 201, 203, 205–207, 209, 212–216, 218–220, 222–223, 225, 227, 229–233 · egyezés 217, 224 | 217 → #433 L15 + source/tests/game-mobile-shell.test.ts:40 / 224 → docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md:1866 + source/tests/support/game-mobile-quality.ts:500 |
| R-TERV-161 | `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas-vegrehajtas.md` | állapot 3 · KÉSZ 9, 25, 38, 53, 72, 78, 90 | — |
| R-TERV-161 | `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md` | KÉSZ 132, 134, 136–138, 140–141, 144–151 | — |
| R-TERV-162 | `docs/specs/2026-11-16-quiz-bank-memoria-vegrehajtas.md` | állapot 3 · ELLENŐRIZETLEN 4, 57–59 · egyezés 55, 60–61 · szelet 70 | 55 → #478 L68 + source/tests/quiz-bank-scale-db.integration.ts:128 / 59 → Összevetendő: source/tests/quiz-bank-scale-db.integration.ts:145 / 60 → #478 L67 + source/tests/quiz-bank-scale-db.integration.ts:249 / 61 → #478 L70 + source/tests/quiz-bank-scale-db.integration.ts:296 |
| R-TERV-162 | `docs/specs/2026-11-16-quiz-bank-memoria.md` | állapot 3 · ELLENŐRIZETLEN 116, 118–119, 124–125, 129, 131 · egyezés 123, 126, 128, 130 | 123 → #478 L63 + source/tests/quiz-bank-scale-db.integration.ts:201 / 125 → Összevetendő: source/tests/quiz-bank-scale-db.integration.ts:201 / 126 → #478 L67 + source/tests/quiz-bank-scale-db.integration.ts:249 / 128 → #478 L68 + source/tests/quiz-bank-scale-db.integration.ts:128 / 130 → #478 L70 + source/tests/quiz-bank-scale-db.integration.ts:296 |
| R-TERV-163 | `docs/specs/2026-11-17-brainrot-valaszido-vegrehajtas.md` | követés 22, 28 | — |
| R-TERV-163 | `docs/specs/2026-11-17-brainrot-valaszido.md` | állapot 3 · követés 42, 62, 67, 72, 86–87, 99 · ELLENŐRIZETLEN 56, 64–66, 95, 97, 100, 102–103 | 97 → Összevetendő: source/tests/brainrot-pacing.test.ts:38 |
| R-TERV-164 | `docs/handoffs/2026-11-17-jatekok-utomunka-retro.md` | szelet 12 | — |
| R-TERV-165 | `docs/specs/2026-11-17-kerdesbank-karcsusitas-vegrehajtas.md` | szelet 9, 90, 97, 101 · ELLENŐRIZETLEN 11, 28, 38, 63, 87 | — |
| R-TERV-165 | `docs/specs/2026-11-17-kerdesbank-karcsusitas.md` | szelet 94, 157 · ELLENŐRIZETLEN 115, 119, 122, 128, 130, 132, 137, 141 · egyezés 117, 121, 124, 126 | 117 → #502 L25 + source/tests/quiz-bank-s1.test.ts:65 / 121 → #502 L27 + source/tests/quiz-bank-scale-db.integration.ts:402 / 124 → #502 L28 + source/tests/quiz-bank-scale-db.integration.ts:439 / 126 → #502 L29 + source/tests/quiz-bank-scale-db.integration.ts:514 |
| R-TERV-166 | `8d42332dc:docs/specs/2026-11-17-kockavadasz-telefon-vegrehajtas.md` | szelet 1, 151, 178 · követés 186, 207 | — |
| R-TERV-166 | `8d42332dc:docs/specs/2026-11-17-kockavadasz-telefon.md` | követés 43, 51, 79, 90, 121 · ELLENŐRIZETLEN 61, 83, 88, 114–116, 118, 120, 122–124 · szelet 96, 135, 153 | — |
| R-TERV-167 | `023eb27f6:docs/specs/2026-11-17-kockavadasz-telefon-gyors-vegrehajtas.md` | követés 144, 160 | — |
| R-TERV-167 | `0219e4dd2:docs/specs/2026-11-17-kockavadasz-telefon-gyors.md` | ELLENŐRIZETLEN 55–61, 63–64 | — |
| R-TERV-168 | `docs/specs/2026-11-17-szoletra-olvashatosag-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-168 | `docs/specs/2026-11-17-szoletra-olvashatosag.md` | követés 114, 178, 201 · KÉSZ 207, 218, 221, 223, 225, 227, 232, 234, 237–238, 240 · szelet 247–248 | — |
| R-TERV-169 | `f511ea5af:docs/specs/2026-11-18-joystick-jobb-kez-vegrehajtas.md` | állapot 5 | — |
| R-TERV-169 | `fc0121787:docs/specs/2026-11-18-joystick-jobb-kez.md` | ELLENŐRIZETLEN 73, 80, 89, 99, 106, 177, 179–180, 182, 189, 192, 195, 197, 199, 201, 203, 205, 207–208 · szelet 181, 183–184 | — |
| R-TERV-170 | `docs/specs/2026-11-18-joystick-tsunami-stabil-vegrehajtas.md` | állapot 5 · ELLENŐRIZETLEN 53 · követés 68 | — |
| R-TERV-170 | `docs/specs/2026-11-18-joystick-tsunami-stabil.md` | állapot 3 · követés 72, 104 · ELLENŐRIZETLEN 110, 112, 114–116, 118 | — |
| R-TERV-171 | `d41693458:docs/handoffs/2026-11-18-szokoar-latvany-atadas.md` | követés 69 | — |
| R-TERV-171 | `737de8fe7:docs/specs/2026-11-18-szokoar-tema-es-sebesseg-vegrehajtas.md` | állapot 7 · követés 82 · ELLENŐRIZETLEN 103–107, 114 | — |
| R-TERV-171 | `737de8fe7:docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md` | állapot 3 · szelet 30, 33, 43–44, 175 · ELLENŐRIZETLEN 66, 123, 134, 141, 146, 165–170, 260–262 · követés 225, 278 | — |
| R-TERV-172 | `docs/specs/2026-11-18-szoletra-kovetes-vegrehajtas.md` | KÉSZ 10, 21, 24 · követés 23 | — |
| R-TERV-172 | `docs/specs/2026-11-18-szoletra-kovetes.md` | követés 9, 27 · KÉSZ 23, 26, 28 | — |
| R-TERV-173 | `docs/specs/asteroid-physics-turbo-2026-09-06.md` | KÉSZ 53, 55, 57–58, 60–62 | — |
| R-TERV-174 | `docs/ls-3-jutalom-hasznalat.md` | szelet 1 · KÉSZ 17, 51 · követés 55 | — |
| R-TERV-174 | `docs/specs/ls-3a-rewards-coupons-2026-09-04.md` | szelet 1, 14, 36 · követés 49, 77, 105, 107, 110 · KÉSZ 68, 70, 72, 74–75, 79, 81, 83 | — |
| R-TERV-175 | `docs/specs/ls-3b-game-engine-2026-09-04.md` | szelet 1, 15, 44 · követés 12, 67, 71, 87 · ELLENŐRIZETLEN 69, 73, 75, 77 | — |
| R-TERV-176 | `docs/specs/tornado-hunter-200-2026-09-06.md` | KÉSZ 147, 149, 152, 155, 157, 159, 161, 164, 166, 168, 171, 173 | — |
| R-TERV-177 | `docs/specs/wo-2026-09-06-tornado-buttons-still-missing.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-178 | `docs/specs/wo-2026-09-06-tornado-uncontrollable.md` | KÉSZ 30–32 | — |
| R-TERV-179 | `docs/specs/wordladder-redesign-2026-09-02.md` | ELLENŐRIZETLEN 70–71, 73–76 | — |
| R-TERV-180 | `docs/specs/2026-09-07-tananyagkeszites-audit-es-terv.md` | ELLENŐRIZETLEN 71, 110, 125, 134, 146 | — |
| R-TERV-181 | `docs/specs/2026-09-09-webes-tananyag-agent-es-mentes.md` | ELLENŐRIZETLEN 58–64 | — |
| R-TERV-181 | `docs/specs/2026-09-09-webes-tananyag-agent-vegrehajtas.md` | ELLENŐRIZETLEN 37, 52–53, 88, 119, 318–321, 333 · követés 351 | — |
| R-TERV-182 | `docs/specs/2026-09-11-bank-review-routing-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-182 | `docs/specs/2026-09-11-bank-review-routing.md` | KÉSZ 16–20 | — |
| R-TERV-183 | `docs/specs/2026-09-11-generation-review-continuity-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-183 | `docs/specs/2026-09-11-generation-review-continuity.md` | KÉSZ 13 | — |
| R-TERV-184 | `docs/specs/2026-09-11-material-preview-runtime-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-184 | `docs/specs/2026-09-11-material-preview-runtime.md` | KÉSZ 13 | — |
| R-TERV-185 | `docs/specs/2026-09-11-preview-navigation-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-185 | `docs/specs/2026-09-11-preview-navigation.md` | KÉSZ 13–17 | — |
| R-TERV-186 | `docs/specs/2026-09-24-audit.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-187 | `docs/specs/2026-09-24-bank-ellenor-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-187 | `docs/specs/2026-09-24-bank-ellenor.md` | ELLENŐRIZETLEN 47, 49, 51, 53–56 | — |
| R-TERV-188 | `docs/specs/2026-10-15-haromfazis-ci-ellenorzes-vegrehajtas.md` | ELLENŐRIZETLEN 19–21 | — |
| R-TERV-188 | `docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md` | ELLENŐRIZETLEN 31–35 | — |
| R-TERV-189 | `docs/specs/2026-10-15-review-236-237-javitas-vegrehajtas.md` | ELLENŐRIZETLEN 8, 14, 20, 25 | — |
| R-TERV-189 | `docs/specs/2026-10-15-review-236-237-javitas.md` | ELLENŐRIZETLEN 18–20, 22–23, 32–33, 36–41 · egyezés 31 | 31 → docs/specs/2026-10-15-review-236-237-javitas.md:18 + scripts/qa/three-phase-check.test.mjs:61 |
| R-TERV-190 | `docs/specs/2026-10-15-review-247-248-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-190 | `docs/specs/2026-10-15-review-247-248.md` | ELLENŐRIZETLEN 15–22 | — |
| R-TERV-191 | `docs/specs/2026-10-15-tetelgyar-review-kovetes-vegrehajtas.md` | ELLENŐRIZETLEN 8, 15, 25 · egyezés 20 | 15 → Összevetendő: source/tests/bank-item-ref.test.ts:87 / 20 → #229 L7 + source/tests/bank-item-ref.test.ts:80 |
| R-TERV-192 | `docs/specs/2026-10-17-e2e-eldobhato-adatbazis-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-192 | `docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md` | ELLENŐRIZETLEN 69, 71, 73–74, 76–77 | — |
| R-TERV-193 | `docs/specs/2026-10-18-atfogo-review-vegrehajtas.md` | követés 23 | — |
| R-TERV-193 | `docs/specs/2026-10-18-atfogo-review.md` | ELLENŐRIZETLEN 34–36 | — |
| R-TERV-194 | `docs/specs/2026-10-22-elmaradt-feladatok-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-194 | `docs/specs/2026-10-22-elmaradt-feladatok.md` | ELLENŐRIZETLEN 21, 24–25, 39–40, 42–43 | — |
| R-TERV-195 | `docs/specs/2026-11-05-gyartas-kovetes-review-javitas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-195 | `docs/specs/2026-11-05-gyartas-kovetes-review-javitas.md` | követés 27 · KÉSZ 33–36 | — |
| R-TERV-196 | `docs/specs/2026-11-05-hookspath-tiltas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-196 | `docs/specs/2026-11-05-hookspath-tiltas.md` | KÉSZ 31–32, 34 | — |
| R-TERV-197 | `docs/specs/2026-11-10-hibavadaszat-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-197 | `docs/specs/2026-11-10-hibavadaszat.md` | KÉSZ 80–83, 87–96 | — |
| R-TERV-198 | `docs/specs/2026-11-16-e2e-coupon-expired-block-craft-vegrehajtas.md` | állapot 3 · KÉSZ 85, 89 | — |
| R-TERV-198 | `docs/specs/2026-11-16-e2e-coupon-expired-block-craft.md` | állapot 3 · szelet 14 · KÉSZ 80, 82, 84, 86–87, 90–95 | — |
| R-TERV-199 | `docs/specs/2026-11-16-e2e-ingadozok-2-vegrehajtas.md` | állapot 3 | — |
| R-TERV-199 | `docs/specs/2026-11-16-e2e-ingadozok-2.md` | állapot 3 · ELLENŐRIZETLEN 44, 46, 48–50, 53–54, 56–57 | — |
| R-TERV-200 | `ffb4774e4:docs/specs/2026-11-17-allapot-ellenorok-vegrehajtas.md` | állapot 4 | — |
| R-TERV-200 | `ffb4774e4:docs/specs/2026-11-17-allapot-ellenorok.md` | követés 41 · ELLENŐRIZETLEN 63–69 | — |
| R-TERV-201 | `docs/specs/2026-11-17-e2e-ingadozok-3-vegrehajtas.md` | állapot 3, 130 · KÉSZ 111, 178 · követés 134 | 111, 178 → A későbbi 116. sor és 54620024 (három mutáció). |
| R-TERV-201 | `docs/specs/2026-11-17-e2e-ingadozok-3.md` | állapot 3 · ELLENŐRIZETLEN 26, 51, 53, 55, 57, 60, 63–64, 68–69, 73–75 · követés 56 | — |
| R-TERV-202 | `9a4c5ff37:docs/specs/2026-11-17-kapuk-beepites-vegrehajtas.md` | állapot 4 | — |
| R-TERV-202 | `3feb81546:docs/specs/2026-11-17-kapuk-beepites.md` | követés 70, 121 · ELLENŐRIZETLEN 75, 77, 79–80, 82 | — |
| R-TERV-203 | `docs/specs/2026-11-17-kerdesbank-hook-memo-vegrehajtas.md` | KÉSZ 6, 44, 49, 57 · állapot 83 | — |
| R-TERV-203 | `docs/specs/2026-11-17-kerdesbank-hook-memo.md` | KÉSZ 59, 62, 64, 66, 68–69, 81–82, 85–86, 117–122 | — |
| R-TERV-204 | `docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md` | KÉSZ 24–28, 43 · követés 85 | — |
| R-TERV-204 | `docs/specs/2026-11-17-kulso-ellenor.md` | KÉSZ 27, 30–31, 33, 36, 38, 40, 47, 49–53, 92, 107, 113, 118, 126, 149, 168, 187 · szelet 161 | — |
| R-TERV-205 | `docs/minosegkapuk.md` | állapot 3 · követés 22–23, 122 · ELLENŐRIZETLEN 197, 202 | — |
| R-TERV-205 | `docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md` | állapot 4 · követés 23, 104, 107 · ELLENŐRIZETLEN 188–197, 199, 203, 206–207, 210–211, 213–214, 219, 223, 226, 228, 232, 234, 237 | — |
| R-TERV-205 | `docs/specs/2026-11-17-minosegkapuk.md` | ELLENŐRIZETLEN 53, 56, 59, 61, 65, 67, 70, 72, 75, 79, 82, 87, 90, 93, 116, 119, 122, 125, 128–130, 133–134, 138, 140, 142–144 · követés 57–58, 86, 102 · egyezés 115, 146 | 115 → #489 L18 + scripts/qa/gates/lint-gate.test.mjs:55 / 119 → Összevetendő: scripts/qa/gates/lint-gate.test.mjs:25 / 125 → Összevetendő: scripts/qa/gates/lint-gate.test.mjs:70 / 133 → Összevetendő: scripts/qa/gates/pre-merge-gate.test.mjs:123 / 134 → Összevetendő: scripts/qa/gates/pre-merge-gate.test.mjs:40 / 146 → #489 L24 + scripts/qa/gates/lib.test.mjs:19 |
| R-TERV-206 | `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` | állapot 6 · követés 47, 87, 123, 155, 173, 264, 311 · ELLENŐRIZETLEN 63, 306, 328, 342, 355, 367, 382 · szelet 92, 98, 100, 106, 129, 141, 148, 167, 196, 198, 207, 227, 247, 267, 280, 302, 315, 331, 345, 358, 378 | — |
| R-TERV-206 | `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` | szelet 57–58, 60–62, 65, 68–70, 78, 88, 93–94, 104, 107–108, 158–162, 164–167, 228–231, 237, 319–324, 339–341, 343–350 · követés 64, 138, 163, 217, 227, 325–326 · ELLENŐRIZETLEN 386, 388–389, 391, 393, 402, 404, 407 | — |
| R-TERV-207 | `docs/specs/2026-11-17-vezerles-dieta-vegrehajtas.md` | állapot 4 · követés 25, 40, 50 | — |
| R-TERV-207 | `docs/specs/2026-11-17-vezerles-dieta.md` | ELLENŐRIZETLEN 62–64, 66–67 | — |
| R-TERV-208 | `docs/specs/2026-11-18-ci-e2e-szeleteles-vegrehajtas.md` | követés 5, 95, 106 · ELLENŐRIZETLEN 101 | — |
| R-TERV-208 | `docs/specs/2026-11-18-ci-e2e-szeleteles.md` | követés 3, 169 · ELLENŐRIZETLEN 162, 168, 172, 176–178, 180 · egyezés 170, 174 | 168 → Összevetendő: scripts/qa/e2e-shards.test.mjs:267 / 170 → docs/specs/2026-11-18-ci-e2e-szeleteles.md:170 + scripts/qa/e2e-shards.test.mjs:275 / 174 → #518 L59 + scripts/qa/e2e-shards.test.mjs:156 / 178 → .github/workflows/ci.yml:12 csak a szeletszámot igazolja. |
| R-TERV-209 | `docs/handoffs/2026-11-18-kapu-hook-retro.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-209 | `docs/specs/2026-11-18-hook-onfailure-vegrehajtas.md` | ELLENŐRIZETLEN 21, 34, 45, 59 | — |
| R-TERV-209 | `docs/specs/2026-11-18-hook-onfailure.md` | ELLENŐRIZETLEN 43, 52, 95, 103, 129, 132, 158 · egyezés 46, 48, 50–51, 55, 57, 97, 99, 102, 130, 159, 161, 163, 165 | 46 → docs/specs/2026-11-18-hook-onfailure.md:46 + scripts/qa/hooks/hook-failure.test.mjs:29 / 48 → docs/specs/2026-11-18-hook-onfailure.md:48 + scripts/qa/hooks/hook-failure.test.mjs:41 / 50 → docs/specs/2026-11-18-hook-onfailure.md:50 + scripts/qa/hooks/hook-failure.test.mjs:50 / 51 → docs/specs/2026-11-18-hook-onfailure.md:51 + scripts/qa/hooks/hook-failure.test.mjs:58 / 55 → docs/specs/2026-11-18-hook-onfailure.md:55 + scripts/qa/hooks/hook-failure.test.mjs:100 / 57 → docs/specs/2026-11-18-hook-onfailure.md:57 + scripts/qa/hooks/hook-failure.test.mjs:195 / 97 → docs/specs/2026-11-18-hook-onfailure.md:97 + scripts/qa/hooks/hook-failure.test.mjs:129 / 99 → docs/specs/2026-11-18-hook-onfailure.md:99 + scripts/qa/hooks/hook-failure.test.mjs:169 / 102 → docs/specs/2026-11-18-hook-onfailure.md:102 + scripts/qa/hooks/hook-failure.test.mjs:195 / 130 → docs/specs/2026-11-18-hook-onfailure.md:130 + scripts/qa/hooks/hook-failure.test.mjs:258 / 132 → Összevetendő: scripts/qa/gates/lint-gate.test.mjs:46 / 159 → docs/specs/2026-11-18-hook-onfailure.md:159 + scripts/qa/hooks/hook-failure.test.mjs:274 / 161 → docs/specs/2026-11-18-hook-onfailure.md:161 + scripts/qa/hooks/hook-failure.test.mjs:258 / 163 → docs/specs/2026-11-18-hook-onfailure.md:163 + scripts/qa/hooks/hook-failure.test.mjs:225 / 165 → docs/specs/2026-11-18-hook-onfailure.md:165 + scripts/qa/gates/lint-gate.test.mjs:100 |
| R-TERV-210 | `05ff81780:docs/specs/2026-11-18-merge-kapu-rest-vegrehajtas.md` | ELLENŐRIZETLEN 10, 22 | — |
| R-TERV-210 | `05ff81780:docs/specs/2026-11-18-merge-kapu-rest.md` | állapot 3 · ELLENŐRIZETLEN 57, 59, 61–64, 66, 71 · szelet 69 | — |
| R-TERV-211 | `3155c7ced:docs/specs/2026-11-18-vak-hibakereso-ellenor-vegrehajtas.md` | ELLENŐRIZETLEN 23, 41 | — |
| R-TERV-211 | `eda8fff9a:docs/specs/2026-11-18-vak-hibakereso-ellenor.md` | ELLENŐRIZETLEN 98, 101, 103, 105, 107, 109–110, 170, 172, 174, 176, 178, 180 · követés 162 | — |
| R-TERV-212 | `docs/specs/2026-11-19-audit-hook-kapuinditas-vegrehajtas.md` | KÉSZ 17, 27, 38 | — |
| R-TERV-212 | `docs/specs/2026-11-19-audit-hook-kapuinditas.md` | követés 25 · KÉSZ 46, 48, 50, 52–54, 62, 69, 71, 82 | — |
| R-TERV-213 | `40a582ba7:docs/specs/2026-11-19-gate-pr-celzott-e2e-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-213 | `40a582ba7:docs/specs/2026-11-19-gate-pr-celzott-e2e.md` | ELLENŐRIZETLEN 58, 61, 63–65, 67 | — |
| R-TERV-214 | `dbbb0ae6f:docs/specs/2026-11-19-gepi-zar-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-214 | `dbbb0ae6f:docs/specs/2026-11-19-gepi-zar.md` | ELLENŐRIZETLEN 56, 60, 63, 68, 71, 76, 79, 82–83, 86–87, 90, 92, 103, 105, 107, 114, 120, 122, 125, 127–128, 151, 166–170, 172–180, 182, 184–185 · követés 124 | — |
| R-TERV-215 | `9981db1bb:docs/specs/2026-11-19-idozitesfuggo-tesztek-vegrehajtas.md` | állapot 5 | — |
| R-TERV-215 | `9981db1bb:docs/specs/2026-11-19-idozitesfuggo-tesztek.md` | követés 53, 56 · ELLENŐRIZETLEN 59, 61, 124, 126–127, 129–130, 132, 134, 136 | — |
| R-TERV-216 | `68b72fb3c:docs/specs/2026-11-19-kapu-gyorsitas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-216 | `68b72fb3c:docs/specs/2026-11-19-kapu-gyorsitas.md` | ELLENŐRIZETLEN 61, 64, 66–67, 70–71, 104–111, 138, 160–162 | — |
| R-TERV-217 | `68b72fb3c:docs/specs/2026-11-20-bizonyitek-atvitel.md` | ELLENŐRIZETLEN 10, 22, 24, 26, 28, 30, 32–35 | — |
| R-TERV-218 | `10f53ac09:docs/specs/2026-11-20-itelet-fej-egyeztetes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-218 | `10f53ac09:docs/specs/2026-11-20-itelet-fej-egyeztetes.md` | követés 5 · ELLENŐRIZETLEN 37, 40–44 | — |
| R-TERV-219 | `10f53ac09:docs/specs/2026-11-20-osszefesult-proba.md` | ELLENŐRIZETLEN 10, 12, 36, 38–39, 41, 43–44, 46, 49, 51, 53, 55, 57–59, 61–62 | — |
| R-TERV-220 | `docs/agent-csapdak.md` | ELLENŐRIZETLEN 14–26, 29–38, 41–50, 53–56, 59–64, 67–74, 77–89, 92–96, 99–101, 103, 114, 123, 132, 138, 145, 153, 164, 171, 182, 193, 201, 208, 215, 221, 228, 237, 249, 260, 274, 291, 303, 316, 325, 340, 368, 393, 418, 438, 478, 493, 519, 528, 575, 585, 597, 607, 616, 625, 635, 646, 668, 681, 698, 725, 740, 757, 774, 789, 808, 825, 838, 853, 870, 882, 897, 914, 927, 942, 960, 972, 981, 991, 999, 1009, 1017, 1019, 1021–1022, 1025, 1035, 1047, 1053, 1060, 1067, 1079, 1090 · követés 130, 185, 246, 601, 887 · szelet 545 | — |
| R-TERV-221 | `docs/agent-haromfazisu-munka.md` | ELLENŐRIZETLEN 8 · követés 35 | — |
| R-TERV-221 | `docs/specs/_TEMPLATE.md` | ELLENŐRIZETLEN 29–30 | — |
| R-TERV-221 | `docs/specs/contract-template.yaml` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-222 | `docs/specs/audit-4day-fixes-2026-09-05.md` | ELLENŐRIZETLEN 102, 107, 109, 111, 113–118, 120–121 | — |
| R-TERV-223 | `docs/codex-felhokornyezet.md` | ELLENŐRIZETLEN 41, 48 | — |
| R-TERV-224 | `docs/specs/coupon-claim-hooks-gate-2026-09-06.md` | KÉSZ 47, 49, 51–53, 55, 57 | — |
| R-TERV-225 | `docs/specs/deep-audit-2026-09-01.md` | ELLENŐRIZETLEN 66–72 | — |
| R-TERV-226 | `docs/kanban.md` | követés 53 | — |
| R-TERV-227 | `docs/specs/tornado-audit-fixes-2026-09-06.md` | szelet 22, 24, 42, 65, 79, 91, 116 · KÉSZ 125, 127, 129, 131, 133–134, 136 | — |
| R-TERV-228 | `docs/specs/2026-09-10-lesson-learning-flow-vegrehajtas.md` | követés 17, 32, 46 · ELLENŐRIZETLEN 62, 64–67 | — |
| R-TERV-228 | `docs/specs/2026-09-10-lesson-learning-flow.md` | állapot 3 · követés 9 · ELLENŐRIZETLEN 29–35 | — |
| R-TERV-229 | `docs/specs/2026-09-10-lesson-method-fusion-evidence.md` | ELLENŐRIZETLEN 45–49 | — |
| R-TERV-229 | `docs/specs/2026-09-10-lesson-method-fusion-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-229 | `docs/specs/2026-09-10-lesson-method-fusion.md` | ELLENŐRIZETLEN 7–10, 36–40 | — |
| R-TERV-230 | `docs/specs/2026-09-10-lesson-simplification-decision.md` | állapot 3 · ELLENŐRIZETLEN 151–153, 155 · követés 154 | — |
| R-TERV-231 | `docs/handoffs/2026-09-12-lesson-quality-v74.md` | ELLENŐRIZETLEN 38 | — |
| R-TERV-231 | `docs/specs/2026-09-12-lesson-quality-v74-vegrehajtas.md` | követés 9 | — |
| R-TERV-231 | `docs/specs/2026-09-12-lesson-quality-v74.md` | ELLENŐRIZETLEN 31–36 | — |
| R-TERV-232 | `docs/specs/2026-09-13-stale-web-lesson-quality-gate-vegrehajtas.md` | követés 19 | — |
| R-TERV-232 | `docs/specs/2026-09-13-stale-web-lesson-quality-gate.md` | ELLENŐRIZETLEN 44, 47, 49–50 | — |
| R-TERV-233 | `docs/specs/2026-09-14-lesson-dev-csp-vegrehajtas.md` | követés 11 | — |
| R-TERV-233 | `docs/specs/2026-09-14-lesson-dev-csp.md` | KÉSZ 16–21 · követés 40 | — |
| R-TERV-234 | `docs/specs/2026-09-20-colorful-lessons.md` | ELLENŐRIZETLEN 42, 44, 47–49 | — |
| R-TERV-235 | `docs/specs/2026-09-23-lesson-repair-menu-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-235 | `docs/specs/2026-09-23-lesson-repair-menu.md` | ELLENŐRIZETLEN 17–20 | — |
| R-TERV-236 | `docs/specs/2026-09-23-owner-instructions-and-lesson-repair-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-236 | `docs/specs/2026-09-23-owner-instructions-and-lesson-repair.md` | ELLENŐRIZETLEN 37, 73–81 | — |
| R-TERV-237 | `docs/specs/2026-09-24-lesson-flair-princess-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-237 | `docs/specs/2026-09-24-lesson-flair-princess.md` | ELLENŐRIZETLEN 30–35 | — |
| R-TERV-238 | `docs/specs/2026-09-24-lesson-version-skew-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-238 | `docs/specs/2026-09-24-lesson-version-skew.md` | KÉSZ 13–16 | — |
| R-TERV-239 | `docs/specs/2026-09-24-magyarazo-abrak-vegrehajtas.md` | szelet 5, 11, 16, 22 | — |
| R-TERV-239 | `docs/specs/2026-09-24-magyarazo-abrak.md` | ELLENŐRIZETLEN 6, 8–14, 40–45 · szelet 22, 47, 55, 60 | — |
| R-TERV-240 | `docs/specs/2026-09-29-lecke-dizajn-vegrehajtas.md` | KÉSZ 5, 23, 29, 33, 42, 47, 52, 61, 68 | — |
| R-TERV-240 | `docs/specs/2026-09-29-lecke-dizajn.md` | KÉSZ 11, 13–20, 117–118, 120–122, 125–126, 167 | — |
| R-TERV-241 | `docs/specs/2026-09-30-abratervezo-3d-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-241 | `docs/specs/2026-09-30-abratervezo-3d.md` | ELLENŐRIZETLEN 64, 66–69, 71, 83 | — |
| R-TERV-242 | `docs/specs/2026-10-17-lecke-betoltes-vegrehajtas.md` | ELLENŐRIZETLEN 32, 42 | — |
| R-TERV-242 | `docs/specs/2026-10-17-lecke-betoltes.md` | ELLENŐRIZETLEN 67–69, 71, 73–74 | — |
| R-TERV-243 | `docs/specs/2026-10-17-websuli-lecke-hos-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-243 | `docs/specs/2026-10-17-websuli-lecke-hos.md` | ELLENŐRIZETLEN 25–26, 33–34, 54–55, 57–59, 70, 74 | — |
| R-TERV-244 | `docs/specs/2026-10-18-evfolyam-nem-torolheto-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-244 | `docs/specs/2026-10-18-evfolyam-nem-torolheto.md` | KÉSZ 12, 15–16, 18 | — |
| R-TERV-245 | `docs/specs/2026-10-18-pontos-evfolyam-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-245 | `docs/specs/2026-10-18-pontos-evfolyam.md` | KÉSZ 21–23 | — |
| R-TERV-246 | `docs/specs/2026-10-18-tanulo-evfolyam-szuro-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-246 | `docs/specs/2026-10-18-tanulo-evfolyam-szuro.md` | KÉSZ 12–13, 17–20 | — |
| R-TERV-247 | `docs/specs/2026-10-22-lecke-szeles-elrendezes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-247 | `docs/specs/2026-10-22-lecke-szeles-elrendezes.md` | KÉSZ 35–38 | — |
| R-TERV-248 | `docs/specs/2026-10-22-uj-lecke-ertesito-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-248 | `docs/specs/2026-10-22-uj-lecke-ertesito.md` | ELLENŐRIZETLEN 37–40 | — |
| R-TERV-249 | `docs/specs/2026-11-03-leckeborito-vegrehajtas.md` | ELLENŐRIZETLEN 5, 12, 17, 21, 27, 32 | — |
| R-TERV-249 | `docs/specs/2026-11-03-leckeborito.md` | ELLENŐRIZETLEN 84–88, 90, 92, 94 | — |
| R-TERV-250 | `docs/specs/2026-11-03-leckeborito-auto-vegrehajtas.md` | KÉSZ 5, 9, 14, 20 | — |
| R-TERV-250 | `docs/specs/2026-11-03-leckeborito-auto.md` | követés 58 · KÉSZ 63–64, 66–72 | — |
| R-TERV-251 | `docs/specs/2026-11-03-leckeborito-utomunka-vegrehajtas.md` | ELLENŐRIZETLEN 5, 11, 17 | — |
| R-TERV-251 | `docs/specs/2026-11-03-leckeborito-utomunka.md` | követés 35 · ELLENŐRIZETLEN 40–41, 43–45 | — |
| R-TERV-252 | `docs/specs/2026-11-03-webes-keszites-mobil-vegrehajtas.md` | KÉSZ 5, 12, 20, 31, 38, 43, 49 | — |
| R-TERV-252 | `docs/specs/2026-11-03-webes-keszites-mobil.md` | KÉSZ 48, 50, 52–53 | — |
| R-TERV-253 | `docs/specs/2026-11-08-tartalmi-fejlecek-2-vegrehajtas.md` | ELLENŐRIZETLEN 5, 23, 27, 32 | — |
| R-TERV-253 | `docs/specs/2026-11-08-tartalmi-fejlecek-2.md` | ELLENŐRIZETLEN 28–31 | — |
| R-TERV-254 | `docs/specs/2026-11-09-lecke-betucsere-vegrehajtas.md` | KÉSZ 5, 13, 20, 27, 33, 39, 46 | — |
| R-TERV-254 | `docs/specs/2026-11-09-lecke-betucsere.md` | KÉSZ 35–37, 39–41, 43, 49, 60 | — |
| R-TERV-255 | `docs/specs/2026-11-10-fejezet-kisfilmek-vegrehajtas.md` | szelet 6, 47, 88, 92, 125 | — |
| R-TERV-255 | `docs/specs/2026-11-10-fejezet-kisfilmek.md` | ELLENŐRIZETLEN 78, 150–161, 192–193 · követés 85 · szelet 190 | — |
| R-TERV-256 | `docs/fejezet-kisfilmek-hasznalat.md` | ELLENŐRIZETLEN 14, 43, 61–64 | — |
| R-TERV-256 | `docs/specs/2026-11-10-fejezet-kisfilmek-v2-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-256 | `docs/specs/2026-11-10-fejezet-kisfilmek-v2.md` | ELLENŐRIZETLEN 111, 114–115, 209, 211–215 | — |
| R-TERV-257 | `docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-258 | `f2df634a5:docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md` | szelet 24, 79, 87, 94 | — |
| R-TERV-258 | `f2df634a5:docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` | szelet 111, 115–122, 127, 152 · ELLENŐRIZETLEN 154, 156, 158, 160, 162, 164–165, 168, 172–178 | — |
| R-TERV-259 | `docs/ls-2-lecke-keszites-hasznalat.md` | szelet 1 · KÉSZ 48, 61, 74–75, 77, 79, 83, 86, 88, 90, 92, 95, 98–99 · követés 72, 107 | — |
| R-TERV-259 | `docs/specs/ls-2-lesson-schema-2026-09-04.md` | szelet 1, 14 · KÉSZ 71–77, 79–80 | — |
| R-TERV-260 | `docs/ls-4-animate-hasznalat.md` | szelet 1 · ELLENŐRIZETLEN 45, 47 | — |
| R-TERV-260 | `docs/specs/ls-4-animate-try-animator-2026-09-04.md` | szelet 1 · ELLENŐRIZETLEN 69, 72, 74, 77, 79, 81, 83, 114, 117, 119 · követés 112, 120 | — |
| R-TERV-261 | `docs/specs/2026-09-29-forrasonkenti-fedettseg-vegrehajtas.md` | ELLENŐRIZETLEN 5–7 | — |
| R-TERV-261 | `docs/specs/2026-09-29-forrasonkenti-fedettseg.md` | ELLENŐRIZETLEN 31, 35, 37–40 · egyezés 36 | 36 → #147 L12 + source/tests/source-coverage.test.ts:31 |
| R-TERV-262 | `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg-vegrehajtas.md` | állapot 5 · szelet 7, 39, 62 · ELLENŐRIZETLEN 9, 17, 24, 41, 46, 51, 55 | — |
| R-TERV-262 | `docs/specs/2026-10-14-tananyag-tomorseg-lefedettseg.md` | állapot 3 · ELLENŐRIZETLEN 81, 86, 97, 101, 105–107, 109–112 · szelet 121, 135–136 | — |
| R-TERV-263 | `docs/specs/2026-10-21-nyelvlecke-kiejtes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-263 | `docs/specs/2026-10-21-nyelvlecke-kiejtes.md` | KÉSZ 30–33 | — |
| R-TERV-264 | `docs/specs/2026-11-09-felolvasas-tartalek-vegrehajtas.md` | ELLENŐRIZETLEN 5, 13, 17, 23, 29, 35, 39, 43, 47, 51, 55, 59 | — |
| R-TERV-264 | `docs/specs/2026-11-09-felolvasas-tartalek.md` | ELLENŐRIZETLEN 39–40, 42–46, 74–75, 77–80, 87 | — |
| R-TERV-265 | `docs/specs/2026-09-07-remaining-learning-fixes.md` | követés 1, 7, 37, 47, 60–61 · ELLENŐRIZETLEN 3, 18–24, 32, 46 | — |
| R-TERV-266 | `docs/specs/2026-09-10-material-list-connection-recovery-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-266 | `docs/specs/2026-09-10-material-list-connection-recovery.md` | KÉSZ 18–23 · követés 39 | — |
| R-TERV-267 | `docs/specs/2026-09-11-author-id-repair-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-267 | `docs/specs/2026-09-11-author-id-repair.md` | ELLENŐRIZETLEN 10 · követés 20 | — |
| R-TERV-268 | `docs/specs/2026-09-11-generation-source-transcript-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-268 | `docs/specs/2026-09-11-generation-source-transcript.md` | ELLENŐRIZETLEN 25–29 | — |
| R-TERV-269 | `docs/specs/2026-09-11-grading-evidence-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-269 | `docs/specs/2026-09-11-grading-evidence.md` | KÉSZ 11 | — |
| R-TERV-270 | `docs/learning-pilot.md` | követés 3, 8 · ELLENŐRIZETLEN 12 | — |
| R-TERV-270 | `docs/specs/2026-09-11-learning-product-evidence.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-271 | `docs/specs/2026-09-11-learning-product-release-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-271 | `docs/specs/2026-09-11-learning-product-release.md` | ELLENŐRIZETLEN 11, 14–18, 22 · követés 13 | — |
| R-TERV-272 | `docs/specs/2026-09-11-plant-source-transcript-repair-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-272 | `docs/specs/2026-09-11-plant-source-transcript-repair.md` | ELLENŐRIZETLEN 11–16 | — |
| R-TERV-273 | `docs/specs/2026-09-12-legacy-teaching-overview-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-273 | `docs/specs/2026-09-12-legacy-teaching-overview.md` | ELLENŐRIZETLEN 9, 17 | — |
| R-TERV-274 | `docs/handoffs/2026-09-12-final-pipeline-acceptance.md` | állapot 3 · követés 21–22, 26 | — |
| R-TERV-274 | `docs/handoffs/2026-09-12-upload-acceptance.md` | követés 8 | — |
| R-TERV-274 | `docs/specs/2026-09-12-upload-acceptance-vegrehajtas.md` | követés 9 | — |
| R-TERV-274 | `docs/specs/2026-09-12-upload-acceptance.md` | ELLENŐRIZETLEN 9 | — |
| R-TERV-275 | `docs/specs/2026-09-14-continuous-practice-vegrehajtas.md` | követés 8 | — |
| R-TERV-275 | `docs/specs/2026-09-14-continuous-practice.md` | KÉSZ 13–17 · követés 33 | — |
| R-TERV-276 | `docs/specs/2026-09-14-continuous-practice-release-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-276 | `docs/specs/2026-09-14-continuous-practice-release.md` | ELLENŐRIZETLEN 16 | — |
| R-TERV-277 | `docs/specs/2026-09-14-one-step-termination-vegrehajtas.md` | ELLENŐRIZETLEN 34 | — |
| R-TERV-277 | `docs/specs/2026-09-14-one-step-termination.md` | ELLENŐRIZETLEN 40–43 | — |
| R-TERV-278 | `docs/specs/2026-09-14-real-learning-tests-vegrehajtas.md` | követés 9, 17 | — |
| R-TERV-278 | `docs/specs/2026-09-14-real-learning-tests.md` | KÉSZ 16–23 · követés 47–48, 52–53, 65–67 | — |
| R-TERV-279 | `docs/specs/2026-09-14-resume-http-acceptance-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-279 | `docs/specs/2026-09-14-resume-http-acceptance.md` | KÉSZ 7–12, 15, 19, 23–27 · követés 28 | — |
| R-TERV-280 | `docs/specs/2026-09-20-home-list-refresh.md` | ELLENŐRIZETLEN 22–24 | — |
| R-TERV-281 | `docs/specs/2026-09-20-home-list-visibility.md` | KÉSZ 40, 42–43, 45 | — |
| R-TERV-282 | `docs/specs/2026-09-23-role-skills-everywhere-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-282 | `docs/specs/2026-09-23-role-skills-everywhere.md` | KÉSZ 24–28 | — |
| R-TERV-283 | `docs/specs/2026-09-24-live-exam-pdf-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-283 | `docs/specs/2026-09-24-live-exam-pdf.md` | követés 19, 41 · ELLENŐRIZETLEN 34–39 | — |
| R-TERV-284 | `docs/specs/2026-09-29-limit-check-kivetel-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-284 | `docs/specs/2026-09-29-limit-check-kivetel.md` | ELLENŐRIZETLEN 29, 31–33 · egyezés 30 | 30 → #142 L13 + source/tests/bank-item-ref.test.ts:43 |
| R-TERV-285 | `docs/specs/2026-09-29-tanari-temafokusz-vegrehajtas.md` | ELLENŐRIZETLEN 5, 15, 30, 36, 44 | — |
| R-TERV-285 | `docs/specs/2026-09-29-tanari-temafokusz.md` | ELLENŐRIZETLEN 24, 37, 57–63, 78 | — |
| R-TERV-286 | `docs/specs/2026-09-29-tobb-gondolkodasi-ido-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-286 | `docs/specs/2026-09-29-tobb-gondolkodasi-ido.md` | ELLENŐRIZETLEN 45, 47–48, 50–53 | — |
| R-TERV-287 | `docs/specs/2026-09-30-korforgas-felirat-utkozes-vegrehajtas.md` | KÉSZ 25 | — |
| R-TERV-287 | `docs/specs/2026-09-30-korforgas-felirat-utkozes.md` | KÉSZ 61–62, 65, 67–68, 70–71, 81–82, 95–99, 101 | — |
| R-TERV-288 | `docs/specs/2026-09-30-tanari-ellenorzolista-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-288 | `docs/specs/2026-09-30-tanari-ellenorzolista.md` | szelet 1 · ELLENŐRIZETLEN 27, 38–42 | — |
| R-TERV-289 | `docs/specs/2026-09-30-temafokusz-kesleltetes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-289 | `docs/specs/2026-09-30-temafokusz-kesleltetes.md` | ELLENŐRIZETLEN 41–45 | — |
| R-TERV-290 | `docs/specs/2026-09-30-temafokusz-resztema-dontes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-290 | `docs/specs/2026-09-30-temafokusz-resztema-dontes.md` | ELLENŐRIZETLEN 25–26, 28–30 | — |
| R-TERV-291 | `docs/specs/2026-10-01-gyokerok-egyben-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-291 | `docs/specs/2026-10-01-gyokerok-egyben.md` | ELLENŐRIZETLEN 87–88, 92–93, 95–96 | — |
| R-TERV-292 | `docs/specs/2026-10-01-javitopanel-cim-kontraszt-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-292 | `docs/specs/2026-10-01-javitopanel-cim-kontraszt.md` | KÉSZ 10 | — |
| R-TERV-293 | `docs/specs/2026-10-01-limit-csomag-lazitas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-293 | `docs/specs/2026-10-01-limit-csomag-lazitas.md` | ELLENŐRIZETLEN 14–15 | 14 → Összevetendő: source/tests/limit-trimmed-packets.test.ts:40 |
| R-TERV-294 | `docs/specs/2026-10-03-gpt61-sol-kv-cache-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-294 | `docs/specs/2026-10-03-gpt61-sol-kv-cache.md` | ELLENŐRIZETLEN 37–38, 40–42 | — |
| R-TERV-295 | `docs/specs/2026-10-04-elo-proba-leletek-vegrehajtas.md` | ELLENŐRIZETLEN 5 | — |
| R-TERV-295 | `docs/specs/2026-10-04-elo-proba-leletek.md` | ELLENŐRIZETLEN 10, 39–43, 46 | — |
| R-TERV-296 | `docs/specs/2026-10-04-kepletbiztos-heurisztikak-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-296 | `docs/specs/2026-10-04-kepletbiztos-heurisztikak.md` | követés 28 · ELLENŐRIZETLEN 46–47, 49 | — |
| R-TERV-297 | `docs/specs/2026-10-04-tanari-pont-keplet-idezet-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-297 | `docs/specs/2026-10-04-tanari-pont-keplet-idezet.md` | ELLENŐRIZETLEN 31–34 | — |
| R-TERV-298 | `docs/specs/2026-10-05-illusztracio-szam-attributum-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-298 | `docs/specs/2026-10-05-illusztracio-szam-attributum.md` | ELLENŐRIZETLEN 71, 73, 75, 77–78, 80 | — |
| R-TERV-299 | `docs/specs/2026-10-05-s0-meresi-alap-vegrehajtas.md` | szelet 1 | — |
| R-TERV-299 | `docs/specs/2026-10-05-s0-meresi-alap.md` | szelet 1 · ELLENŐRIZETLEN 21–22, 24–25 | — |
| R-TERV-300 | `docs/specs/2026-10-05-s10-adatvesztes-mentesseg-vegrehajtas.md` | szelet 1, 12, 30, 39 | — |
| R-TERV-300 | `docs/specs/2026-10-05-s10-adatvesztes-mentesseg.md` | szelet 1 · ELLENŐRIZETLEN 33–36, 38–39 | — |
| R-TERV-301 | `docs/specs/2026-10-05-s2-tartalom-besorolas-vegrehajtas.md` | szelet 1 | — |
| R-TERV-301 | `docs/specs/2026-10-05-s2-tartalom-besorolas.md` | szelet 1 · ELLENŐRIZETLEN 35–36, 38–39 | — |
| R-TERV-302 | `docs/specs/2026-10-06-s8-tanuloi-eredmenyesseg-vegrehajtas.md` | szelet 1 · ELLENŐRIZETLEN 41 | — |
| R-TERV-302 | `docs/specs/2026-10-06-s8-tanuloi-eredmenyesseg.md` | szelet 1 · ELLENŐRIZETLEN 4, 96 · KÉSZ 98–99, 101, 103–107 | 98–99, 101, 103–107 → #201, 22/22 PG, 2132/2132 unit és source/tests/catalog-outcomes.test.ts:77. |
| R-TERV-303 | `docs/specs/2026-10-13-robot-ikon-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-303 | `docs/specs/2026-10-13-robot-ikon.md` | ELLENŐRIZETLEN 39–40, 42–45 | — |
| R-TERV-304 | `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel-vegrehajtas.md` | ELLENŐRIZETLEN 7 | — |
| R-TERV-304 | `docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel.md` | követés 48, 67 · ELLENŐRIZETLEN 55–56, 60, 66, 68–70, 74, 76, 82, 86 · egyezés 78, 81 | 78 → docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel-vegrehajtas.md:22 + source/tests/claude-stream-thinking-liveness.test.ts:56 / 81 → docs/specs/2026-10-14-claude-stream-gondolkodas-eletjel-vegrehajtas.md:23 + source/tests/claude-stream-thinking-liveness.test.ts:94 |
| R-TERV-305 | `docs/specs/2026-10-14-folytatas-mentett-reszekbol-vegrehajtas.md` | ELLENŐRIZETLEN 5, 13, 20, 30 | — |
| R-TERV-305 | `docs/specs/2026-10-14-folytatas-mentett-reszekbol.md` | ELLENŐRIZETLEN 67–68, 70, 72, 74, 76, 78 | — |
| R-TERV-306 | `docs/specs/2026-10-15-folytatas-szoveg-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-306 | `docs/specs/2026-10-15-folytatas-szoveg.md` | KÉSZ 26–28 | — |
| R-TERV-307 | `docs/specs/2026-10-15-hiba-gombok-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-307 | `docs/specs/2026-10-15-hiba-gombok.md` | ELLENŐRIZETLEN 23–24, 26–29 | — |
| R-TERV-308 | `docs/specs/2026-10-16-draft-kezeles-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-308 | `docs/specs/2026-10-16-draft-kezeles.md` | KÉSZ 20, 40–46 | — |
| R-TERV-309 | `docs/specs/2026-10-16-szinonimaszotar-meres-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-309 | `docs/specs/2026-10-16-szinonimaszotar-meres.md` | ELLENŐRIZETLEN 40 | — |
| R-TERV-310 | `docs/specs/2026-10-16-websuli-design-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-310 | `docs/specs/2026-10-16-websuli-design.md` | ELLENŐRIZETLEN 52–53, 55–57, 59–60 | — |
| R-TERV-311 | `docs/specs/2026-10-16-websuli-ismetles-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-311 | `docs/specs/2026-10-16-websuli-ismetles.md` | követés 27, 39 · ELLENŐRIZETLEN 84–85, 87, 89–92, 94 | — |
| R-TERV-312 | `docs/specs/2026-10-17-eredmeny-email-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-312 | `docs/specs/2026-10-17-eredmeny-email.md` | KÉSZ 61–62, 64–66 | — |
| R-TERV-313 | `docs/specs/2026-10-17-fokuszgyuru-ketszinu-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-313 | `docs/specs/2026-10-17-fokuszgyuru-ketszinu.md` | KÉSZ 59, 61, 63 | — |
| R-TERV-314 | `docs/specs/2026-10-17-regi-anyag-eredmeny-vegrehajtas.md` | ELLENŐRIZETLEN 27 | — |
| R-TERV-314 | `docs/specs/2026-10-17-regi-anyag-eredmeny.md` | ELLENŐRIZETLEN 54, 71–75 | — |
| R-TERV-315 | `docs/specs/2026-10-17-tanmenet-rendezes-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-315 | `docs/specs/2026-10-17-tanmenet-rendezes.md` | ELLENŐRIZETLEN 66–67, 69–71 | — |
| R-TERV-316 | `docs/specs/2026-10-17-websuli-ikonkeszlet-vegrehajtas.md` | ELLENŐRIZETLEN 37 | — |
| R-TERV-316 | `docs/specs/2026-10-17-websuli-ikonkeszlet.md` | ELLENŐRIZETLEN 45, 61–62, 64–66 | — |
| R-TERV-317 | `docs/specs/2026-10-17-websuli-kepkeszlet-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-317 | `docs/specs/2026-10-17-websuli-kepkeszlet.md` | ELLENŐRIZETLEN 69–70, 72, 74 | — |
| R-TERV-318 | `docs/specs/2026-10-18-admin-korszerusites-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-318 | `docs/specs/2026-10-18-admin-korszerusites.md` | KÉSZ 89–91, 93–95 | — |
| R-TERV-319 | `docs/specs/2026-10-18-legacy-maradvanyok-vegrehajtas.md` | KÉSZ 7 | — |
| R-TERV-319 | `docs/specs/2026-10-18-legacy-maradvanyok.md` | KÉSZ 34–37 | — |
| R-TERV-320 | `docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-320 | `docs/specs/2026-10-18-regi-anyag-eredmeny-azonnal.md` | ELLENŐRIZETLEN 40–41, 43–44 | — |
| R-TERV-321 | `docs/specs/2026-10-18-tanmenet-kiegeszites-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-321 | `docs/specs/2026-10-18-tanmenet-kiegeszites.md` | KÉSZ 39–40, 42–43 | — |
| R-TERV-322 | `docs/specs/2026-10-19-admin-menu-nevek-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-322 | `docs/specs/2026-10-19-admin-menu-nevek.md` | állapot 3 · ELLENŐRIZETLEN 26–27, 29–31 | — |
| R-TERV-323 | `docs/specs/2026-10-19-admin-reszponzivitas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-323 | `docs/specs/2026-10-19-admin-reszponzivitas.md` | állapot 3 · követés 65 · KÉSZ 119–120, 122, 124–126 | — |
| R-TERV-324 | `docs/specs/2026-10-19-algebrai-referencia-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-324 | `docs/specs/2026-10-19-algebrai-referencia.md` | állapot 3 · KÉSZ 52–53, 55, 57–61 | — |
| R-TERV-325 | `docs/specs/2026-10-19-hos-kep-sav-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-325 | `docs/specs/2026-10-19-hos-kep-sav.md` | állapot 3 · ELLENŐRIZETLEN 48–53, 55, 57 | — |
| R-TERV-326 | `docs/specs/2026-10-19-okositas-fazisjelzo-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-326 | `docs/specs/2026-10-19-okositas-fazisjelzo.md` | állapot 3 · KÉSZ 59–60, 63–65, 67 | — |
| R-TERV-327 | `docs/specs/2026-10-19-rovid-fogalom-megalapozas-vegrehajtas.md` | ELLENŐRIZETLEN 13 | — |
| R-TERV-327 | `docs/specs/2026-10-19-rovid-fogalom-megalapozas.md` | állapot 3 · ELLENŐRIZETLEN 33, 46–47, 49–51 | — |
| R-TERV-328 | `docs/specs/2026-10-19-webes-keszites-uj-inditas-vegrehajtas.md` | KÉSZ 7, 14 | — |
| R-TERV-328 | `docs/specs/2026-10-19-webes-keszites-uj-inditas.md` | állapot 3 · KÉSZ 29–30, 32–34 | — |
| R-TERV-329 | `docs/specs/2026-10-20-okositas-bukott-jelolt-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-329 | `docs/specs/2026-10-20-okositas-bukott-jelolt.md` | állapot 3 · követés 10 · KÉSZ 26–27, 29 | — |
| R-TERV-330 | `docs/specs/2026-10-20-robot-megtekintes-vegrehajtas.md` | ELLENŐRIZETLEN 8 | — |
| R-TERV-330 | `docs/specs/2026-10-20-robot-megtekintes.md` | állapot 3 · ELLENŐRIZETLEN 27–29 | — |
| R-TERV-331 | `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas-vegrehajtas.md` | szelet 1, 9, 30 | — |
| R-TERV-331 | `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md` | szelet 1, 29, 36, 45 · állapot 3 · ELLENŐRIZETLEN 5, 57, 69, 93–95, 97, 99 | — |
| R-TERV-332 | `docs/specs/2026-10-20-s5-sorrendes-kifejezes-vegrehajtas.md` | szelet 1, 9, 60 · KÉSZ 42 | — |
| R-TERV-332 | `docs/specs/2026-10-20-s5-sorrendes-kifejezes.md` | szelet 1, 25, 50, 61 · állapot 3 · követés 65 · KÉSZ 80–81, 83, 85–86 | — |
| R-TERV-333 | `docs/specs/2026-10-20-s6-fogalom-sorrend-vegrehajtas.md` | szelet 1, 9, 53, 66 | — |
| R-TERV-333 | `docs/specs/2026-10-20-s6-fogalom-sorrend.md` | szelet 1, 18, 35 · állapot 3 · KÉSZ 28, 71–72, 74–75 | — |
| R-TERV-334 | `docs/specs/2026-10-20-v1-kotojeles-szam-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-334 | `docs/specs/2026-10-20-v1-kotojeles-szam.md` | állapot 3 · KÉSZ 29–32 | — |
| R-TERV-335 | `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-335 | `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas.md` | állapot 3 · ELLENŐRIZETLEN 42–43, 45–46 | — |
| R-TERV-336 | `docs/specs/2026-10-21-ciklus3-kvota-autofix-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-336 | `docs/specs/2026-10-21-ciklus3-kvota-autofix.md` | állapot 3 · KÉSZ 17–19 | — |
| R-TERV-337 | `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-337 | `docs/specs/2026-10-21-ciklus4-minta-kifejezes-autofix.md` | állapot 3 · ELLENŐRIZETLEN 21–24 | — |
| R-TERV-338 | `docs/specs/2026-10-21-ciklus5-mentes-felkarakter-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-338 | `docs/specs/2026-10-21-ciklus5-mentes-felkarakter.md` | KÉSZ 19–21 | — |
| R-TERV-339 | `docs/specs/2026-10-21-ciklus6-csoport-ujraszigoritas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-339 | `docs/specs/2026-10-21-ciklus6-csoport-ujraszigoritas.md` | KÉSZ 19–21 | — |
| R-TERV-340 | `docs/specs/2026-10-21-ciklus6b-felirat-takaritas-hatokor-vegrehajtas.md` | követés 10 | — |
| R-TERV-340 | `docs/specs/2026-10-21-ciklus6b-felirat-takaritas-hatokor.md` | KÉSZ 20–23 | — |
| R-TERV-341 | `docs/specs/2026-10-21-ciklus7-pontos-alak-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-341 | `docs/specs/2026-10-21-ciklus7-pontos-alak.md` | KÉSZ 23–24, 26 | — |
| R-TERV-342 | `docs/specs/2026-10-21-ciklus8-helyesiras-maradek-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-342 | `docs/specs/2026-10-21-ciklus8-helyesiras-maradek.md` | ELLENŐRIZETLEN 20–22 | — |
| R-TERV-343 | `docs/specs/2026-10-21-fogalom-tipus-hossz-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-343 | `docs/specs/2026-10-21-fogalom-tipus-hossz.md` | állapot 3 · KÉSZ 21–23 | — |
| R-TERV-344 | `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-344 | `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat.md` | állapot 3, 8 · ELLENŐRIZETLEN 26–28 | — |
| R-TERV-345 | `docs/specs/2026-10-21-rovid-fogalom-ekezet-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-345 | `docs/specs/2026-10-21-rovid-fogalom-ekezet.md` | állapot 3 · KÉSZ 44–49 | — |
| R-TERV-346 | `docs/specs/2026-11-02-ellenorzes-effort-ab-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-346 | `docs/specs/2026-11-02-ellenorzes-effort-ab.md` | állapot 3 · ELLENŐRIZETLEN 69–72, 74 | — |
| R-TERV-347 | `docs/specs/2026-11-02-irodalmi-borito-vegrehajtas.md` | ELLENŐRIZETLEN 5, 10, 15, 26, 31 | — |
| R-TERV-347 | `docs/specs/2026-11-02-irodalmi-borito.md` | ELLENŐRIZETLEN 31–32, 34–37 | — |
| R-TERV-348 | `docs/specs/2026-11-02-maradek-kockazatok-vegrehajtas.md` | ELLENŐRIZETLEN 5, 10, 15, 20 · követés 27 | — |
| R-TERV-348 | `docs/specs/2026-11-02-maradek-kockazatok.md` | ELLENŐRIZETLEN 21, 51–53 · követés 31, 39, 54 | — |
| R-TERV-349 | `docs/specs/2026-11-03-apply-visszaolvasas-vegrehajtas.md` | ELLENŐRIZETLEN 5, 19 | — |
| R-TERV-349 | `docs/specs/2026-11-03-apply-visszaolvasas.md` | ELLENŐRIZETLEN 12, 34–40 | — |
| R-TERV-350 | `docs/specs/2026-11-03-egyseges-kartya-leiras-vegrehajtas.md` | KÉSZ 5, 13, 20, 28, 34 | — |
| R-TERV-350 | `docs/specs/2026-11-03-egyseges-kartya-leiras.md` | KÉSZ 55, 57–60 | — |
| R-TERV-351 | `docs/specs/2026-11-08-borito-blokkcimkek-vegrehajtas.md` | KÉSZ 7, 41, 55, 100, 110, 124, 131, 135 | — |
| R-TERV-351 | `docs/specs/2026-11-08-borito-blokkcimkek.md` | KÉSZ 62–63, 65, 68, 70, 72, 74 | — |
| R-TERV-352 | `docs/specs/2026-11-17-eredmeny-email-foglalas-vegrehajtas.md` | szelet 1 · állapot 3 · KÉSZ 9, 22, 29 | — |
| R-TERV-352 | `docs/specs/2026-11-17-eredmeny-email-foglalas.md` | szelet 1, 78 · állapot 3 · KÉSZ 63, 65–69, 72–76 | — |
| R-TERV-353 | `4c7061b34:docs/handoffs/2026-11-18-vak-ellenor-futtato-retro.md` | követés 40 | — |
| R-TERV-353 | `679c23e40:docs/specs/2026-11-18-vak-ellenor-deepseek-vegrehajtas.md` | ELLENŐRIZETLEN 37, 51, 69, 86, 99 | — |
| R-TERV-353 | `c31164815:docs/specs/2026-11-18-vak-ellenor-deepseek.md` | ELLENŐRIZETLEN 75, 86, 116, 130, 142, 147, 154, 199, 202–203, 205–206, 208–209, 211, 213–214, 216, 218, 221–224, 247, 280, 282, 284, 286, 288, 290, 355, 357, 359–360, 362, 364–365, 375, 399, 407, 413, 417, 421, 427, 429, 431–432, 434, 443, 458, 477, 493, 495, 499, 507, 509, 511–512, 514–515, 517, 519, 545, 550, 554, 564, 569, 571, 573, 575 · szelet 236, 254, 260, 267, 276, 302, 309, 328, 350 · követés 396 | — |
| R-TERV-354 | `903138925:Git-objektum 87a614c851a8` | követés 90 | — |
| R-TERV-354 | `903138925:Git-objektum 1407e36879a4` | ELLENŐRIZETLEN 85, 87, 89, 91–93 · követés 110 | — |
| R-TERV-355 | `f9e715932:docs/specs/2026-11-19-hang-elomelegites-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-355 | `f9e715932:docs/specs/2026-11-19-hang-elomelegites.md` | állapot 3 · ELLENŐRIZETLEN 54–56, 58 | — |
| R-TERV-356 | `d3c0f4bfc:docs/specs/2026-11-20-eredmenylevel-tartos-sor.md` | szelet 1 · állapot 3 · ELLENŐRIZETLEN 20, 22, 25–27, 60–61 | — |
| R-TERV-357 | `docs/ls-5-visszacsatolas-hasznalat.md` | szelet 1 · KÉSZ 41 · RÉSZBEN 44 | 41 → source/client/src/components/studio/FeedbackPanel.tsx:49, :59, :80. / 44 → source/server/lib/parent-dashboard.ts:71 és source/client/src/components/ParentDashboardPanel.tsx:176. |
| R-TERV-358 | `docs/specs/ls-9-age-band-visual-system-2026-09-06.md` | szelet 1 · KÉSZ 76–82 · követés 108 | — |
| R-TERV-359 | `docs/specs/2026-09-11-bank-generation-contract-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-359 | `docs/specs/2026-09-11-bank-generation-contract.md` | KÉSZ 20–24, 41 | — |
| R-TERV-360 | `docs/specs/2026-09-11-bank-rubric-diagnostics-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-360 | `docs/specs/2026-09-11-bank-rubric-diagnostics.md` | KÉSZ 16, 18 | — |
| R-TERV-361 | `docs/handoffs/2026-09-12-scored-banks.md` | követés 3 | — |
| R-TERV-362 | `docs/specs/2026-09-14-bank-binding-recovery-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-362 | `docs/specs/2026-09-14-bank-binding-recovery.md` | KÉSZ 21–25 | — |
| R-TERV-363 | `docs/specs/2026-09-24-aritmetika-elojel.md` | KÉSZ 20, 22–25 | — |
| R-TERV-364 | `docs/specs/2026-09-24-bankjavitas-celzott.md` | KÉSZ 21, 23, 25–27 | — |
| R-TERV-365 | `docs/specs/2026-09-24-bankmodell-valasztas.md` | ELLENŐRIZETLEN 38, 40–42, 44 | — |
| R-TERV-366 | `docs/specs/2026-09-29-egy-helyes-valasz-vegrehajtas.md` | ELLENŐRIZETLEN 6, 14, 53, 68, 80, 89, 97, 102 · egyezés 16 | 16 → docs/specs/2026-09-29-egy-helyes-valasz.md:66 + source/tests/single-choice-check.test.ts:8 |
| R-TERV-366 | `docs/specs/2026-09-29-egy-helyes-valasz.md` | ELLENŐRIZETLEN 65, 67–68, 70, 72, 90 · egyezés 66, 71 | 66 → docs/specs/2026-09-29-egy-helyes-valasz-vegrehajtas.md:16 + source/tests/single-choice-check.test.ts:8 / 71 → docs/specs/2026-09-29-egy-helyes-valasz-vegrehajtas.md:26 + source/tests/game-quiz-contract.test.ts:48 |
| R-TERV-367 | `docs/specs/2026-09-29-limit-banktetel-kivetel-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-367 | `docs/specs/2026-09-29-limit-banktetel-kivetel.md` | ELLENŐRIZETLEN 20, 62–66, 68 · egyezés 67 | 67 → #139 L9 + source/tests/bank-item-ref.test.ts:30 |
| R-TERV-368 | `docs/specs/2026-09-29-szerzomodell-gpt6-luna-vegrehajtas.md` | ELLENŐRIZETLEN 5, 11, 17, 21 | — |
| R-TERV-368 | `docs/specs/2026-09-29-szerzomodell-gpt6-luna.md` | ELLENŐRIZETLEN 41–43, 45–46 | — |
| R-TERV-369 | `docs/specs/2026-09-30-bank-mentes-modelltures-vegrehajtas.md` | szelet 1, 5, 19 | — |
| R-TERV-369 | `docs/specs/2026-09-30-bank-mentes-modelltures.md` | szelet 1 · ELLENŐRIZETLEN 22–24 | — |
| R-TERV-370 | `docs/specs/2026-10-01-forrasgyujtes-es-bank-hivatkozas-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-370 | `docs/specs/2026-10-01-forrasgyujtes-es-bank-hivatkozas.md` | ELLENŐRIZETLEN 5, 20 | — |
| R-TERV-371 | `docs/specs/2026-10-01-kapu-javitas-bankkor-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-371 | `docs/specs/2026-10-01-kapu-javitas-bankkor.md` | ELLENŐRIZETLEN 17 | — |
| R-TERV-372 | `docs/specs/2026-10-01-limit-blokk-kivetel-bank-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-372 | `docs/specs/2026-10-01-limit-blokk-kivetel-bank.md` | ELLENŐRIZETLEN 14 | — |
| R-TERV-373 | `docs/specs/2026-10-03-forras-aritmetika-helyesbites-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-373 | `docs/specs/2026-10-03-forras-aritmetika-helyesbites.md` | ELLENŐRIZETLEN 44–45, 47, 49–50 | — |
| R-TERV-374 | `docs/specs/2026-10-04-bank-tartalek-es-elojel-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-374 | `docs/specs/2026-10-04-bank-tartalek-es-elojel.md` | állapot 3 · ELLENŐRIZETLEN 68, 70–74 · követés 90 | — |
| R-TERV-375 | `docs/specs/2026-10-04-kapu-bankkor-holtzona-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-375 | `docs/specs/2026-10-04-kapu-bankkor-holtzona.md` | ELLENŐRIZETLEN 33–34, 37–38 | — |
| R-TERV-376 | `docs/specs/2026-10-05-bank-determinisztikus-normalizalas.md` | ELLENŐRIZETLEN 18–20, 23, 26–27, 31–35 | — |
| R-TERV-377 | `docs/specs/2026-10-05-s3-katalogus-bank-vegrehajtas.md` | szelet 1 | — |
| R-TERV-377 | `docs/specs/2026-10-05-s3-katalogus-bank.md` | szelet 1 · ELLENŐRIZETLEN 32–34, 36–37 | — |
| R-TERV-378 | `docs/specs/2026-10-05-tantargyi-tudasbank-terv.md` | ELLENŐRIZETLEN 206 · szelet 208–218 | — |
| R-TERV-379 | `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` | állapot 6 · ELLENŐRIZETLEN 37, 40, 43, 45, 47, 49, 89–95, 99, 101, 103–106, 110–111, 116, 121–122, 136 · szelet 85 | — |
| R-TERV-380 | `docs/specs/2026-10-15-tetelgyar-t0-bizonyitek-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-381 | `docs/specs/2026-10-15-tetelgyar-t1-tultermeles-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-382 | `docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md` | ELLENŐRIZETLEN 53–58 · szelet 97 | — |
| R-TERV-383 | `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-383 | `docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md` | ELLENŐRIZETLEN 37, 66–69 | — |
| R-TERV-384 | `docs/specs/2026-10-15-tetelgyar-t4-nyelvi-adatbank-vegrehajtas.md` | szelet 1 · KÉSZ 11 | — |
| R-TERV-385 | `docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-385 | `docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol.md` | KÉSZ 26–27, 29–31 | — |
| R-TERV-386 | `docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas-vegrehajtas.md` | szelet 15 | — |
| R-TERV-386 | `docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas.md` | KÉSZ 30–33 | — |
| R-TERV-387 | `docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-387 | `docs/specs/2026-10-15-tetelgyar-t7-dontobiro.md` | ELLENŐRIZETLEN 18, 49–53, 55 · követés 37 · egyezés 54 | 54 → docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md:41 + source/tests/arbiter.test.ts:71 |
| R-TERV-388 | `docs/specs/2026-10-16-bankhiba-kivetel-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-388 | `docs/specs/2026-10-16-bankhiba-kivetel.md` | ELLENŐRIZETLEN 30–34 | — |
| R-TERV-389 | `docs/specs/2026-10-16-parhuzamos-bank-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-389 | `docs/specs/2026-10-16-parhuzamos-bank.md` | ELLENŐRIZETLEN 36–37, 39–41 · szelet 46 | — |
| R-TERV-390 | `docs/specs/2026-10-18-bank-ures-lista-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-390 | `docs/specs/2026-10-18-bank-ures-lista.md` | KÉSZ 28–29, 31 | — |
| R-TERV-391 | `docs/specs/2026-10-19-javito-valaszto-mobil-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-391 | `docs/specs/2026-10-19-javito-valaszto-mobil.md` | állapot 3 · KÉSZ 31–32, 34, 36–37 | — |
| R-TERV-392 | `docs/specs/2026-10-19-okositas-bank-igazitas-vegrehajtas.md` | KÉSZ 10 | — |
| R-TERV-392 | `docs/specs/2026-10-19-okositas-bank-igazitas.md` | állapot 3 · KÉSZ 48–49, 51–53 | — |
| R-TERV-393 | `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes-vegrehajtas.md` | szelet 1 | — |
| R-TERV-393 | `docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md` | szelet 1 · állapot 3 · ELLENŐRIZETLEN 7, 9, 56–57, 59–63, 65 | — |
| R-TERV-394 | `docs/specs/2026-10-20-bank-kimeneti-keret-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-394 | `docs/specs/2026-10-20-bank-kimeneti-keret.md` | állapot 3 · ELLENŐRIZETLEN 48–51 | — |
| R-TERV-395 | `docs/specs/2026-10-20-kviz-hatvany-ertek-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-395 | `docs/specs/2026-10-20-kviz-hatvany-ertek.md` | állapot 3 · KÉSZ 27–29 | — |
| R-TERV-396 | `docs/specs/2026-10-20-okositas-r2-bankjavitas-vegrehajtas.md` | KÉSZ 1, 13 | — |
| R-TERV-396 | `docs/specs/2026-10-20-okositas-r2-bankjavitas.md` | KÉSZ 1, 26, 37–38, 40–42 · állapot 3 | — |
| R-TERV-397 | `docs/specs/2026-10-20-pontozo-angol-tagadas-vegrehajtas.md` | KÉSZ 11 · követés 31 | — |
| R-TERV-397 | `docs/specs/2026-10-20-pontozo-angol-tagadas.md` | állapot 3 · követés 46 · KÉSZ 51–56 | — |
| R-TERV-398 | `docs/specs/2026-10-20-r5-pontozo-korpusz-vegrehajtas.md` | KÉSZ 1 | — |
| R-TERV-398 | `docs/specs/2026-10-20-r5-pontozo-korpusz.md` | KÉSZ 1, 35–38 · állapot 3 | — |
| R-TERV-399 | `docs/specs/2026-10-21-c8-szamolas-kapu-vegrehajtas.md` | Nincs külön megjelölt elfogadási pont. A teljes szöveget a családhoz vettem. | — |
| R-TERV-399 | `docs/specs/2026-10-21-c8-szamolas-kapu.md` | állapot 3 · KÉSZ 23, 37–40 | — |
| R-TERV-400 | `docs/specs/2026-11-02-valasz-keveres-vegrehajtas.md` | KÉSZ 5, 17, 24, 30, 49 | — |
| R-TERV-400 | `docs/specs/2026-11-02-valasz-keveres.md` | állapot 27 · KÉSZ 57–58, 61–63, 65, 68, 70 | — |
| R-TERV-401 | `docs/specs/2026-11-03-javitas-bank-megorzes-vegrehajtas.md` | ELLENŐRIZETLEN 5, 13, 15, 19, 28, 40, 55, 76 | — |
| R-TERV-401 | `docs/specs/2026-11-03-javitas-bank-megorzes.md` | ELLENŐRIZETLEN 36, 65, 105, 107–108, 110–115 | — |
| R-TERV-402 | `docs/specs/2026-11-03-pontozo-szoalak-vegrehajtas.md` | ELLENŐRIZETLEN 5, 23, 56, 60, 63 | — |
| R-TERV-402 | `docs/specs/2026-11-03-pontozo-szoalak.md` | ELLENŐRIZETLEN 70, 72, 74–78, 136 | — |
| R-TERV-403 | `docs/specs/2026-11-17-eredmeny-email-kviz-vegrehajtas.md` | állapot 3 · KÉSZ 9, 26, 38 | — |
| R-TERV-403 | `docs/specs/2026-11-17-eredmeny-email-kviz.md` | állapot 3 · KÉSZ 58, 60–61, 63–64, 66, 77, 79–85, 99–105 | — |
| R-TERV-404 | `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz-vegrehajtas.md` | állapot 3 · KÉSZ 9, 26, 32, 45, 53, 59 | — |
| R-TERV-404 | `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md` | állapot 3 · KÉSZ 53, 55, 57, 59–60, 138, 140–142, 144–147, 149, 151, 157–164 | 138, 140–142, 144–147, 149, 151, 157–164 → #509 a1342ba8 és a 157–164. sor tételes mérése |
| R-TERV-405 | `docs/specs/2026-11-17-szoveges-valasz-irasjel-vegrehajtas.md` | állapot 3 · KÉSZ 8, 18–20, 27, 33, 51 · szelet 43 | — |
| R-TERV-405 | `docs/specs/2026-11-17-szoveges-valasz-irasjel.md` | állapot 3 · szelet 9 · KÉSZ 87, 89, 91–93, 95, 97–98, 112–118 | — |
| R-TERV-406 | `63bc94a43:docs/specs/2026-11-20-pontozo-polinom-ket-szam-vegrehajtas.md` | állapot 3 · ELLENŐRIZETLEN 10, 22, 27, 37 · követés 40 | — |
| R-TERV-406 | `63bc94a43:docs/specs/2026-11-20-pontozo-polinom-ket-szam.md` | állapot 3 · ELLENŐRIZETLEN 44, 60, 62–67, 75–80 | — |

## Eltérő ági tervszövegek

Az alábbi sorok ugyanannak az útvonalnak eltérő, az ágon módosított tartalmát adják meg. Az egyforma Git-objektum egyetlen sor. A felsorolt sorszámok olyan elfogadási vagy követő jelzések, amelyek szövege eltér a sormutatónál használt változattól. Az ági tervezés ténye és a főági kiadás külön követhető.

| Család | Tervváltozat | Új vagy eltérő pont az ági példányban |
|---|---|---|
| R-TERV-220 | `7ea695550:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `80cdfd172:docs/agent-csapdak.md` | 1121, 1135 |
| R-TERV-220 | `5c14aab6a:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `037691a23:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `e1332ec73:docs/agent-csapdak.md` | 1124, 1132 |
| R-TERV-220 | `e800d853e:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `eda8fff9a:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `a707d24d6:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `fc8aa73d5:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `4fabc5adb:docs/agent-csapdak.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-220 | `77e69552c:docs/agent-csapdak.md` | 1110, 1115 |
| R-TERV-221 | `eda8fff9a:docs/agent-haromfazisu-munka.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-221 | `c31164815:docs/agent-haromfazisu-munka.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-221 | `ab87bf160:docs/agent-haromfazisu-munka.md` | 31 |
| R-TERV-223 | `73a32457c:docs/codex-felhokornyezet.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-223 | `ab87bf160:docs/codex-felhokornyezet.md` | 33 |
| R-TERV-223 | `eda8fff9a:docs/codex-felhokornyezet.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-223 | `c31164815:docs/codex-felhokornyezet.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-256 | `fc8aa73d5:docs/fejezet-kisfilmek-hasznalat.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-256 | `4fabc5adb:docs/fejezet-kisfilmek-hasznalat.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `a3eb9bb01:docs/handoffs/2026-11-18-adventi-naptar-retro.md` | 82 |
| R-TERV-001 | `eeb6fae10:docs/handoffs/2026-11-18-adventi-naptar-retro.md` | 82 |
| R-TERV-001 | `41bdaa862:docs/handoffs/2026-11-18-adventi-naptar-retro.md` | 82, 98, 120, 168 |
| R-TERV-001 | `28949f205:docs/handoffs/2026-11-18-adventi-naptar-retro.md` | 82, 98 |
| R-TERV-209 | `eda8fff9a:docs/handoffs/2026-11-18-kapu-hook-retro.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-171 | `e1332ec73:docs/handoffs/2026-11-18-szokoar-latvany-atadas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-226 | `ab87bf160:docs/kanban.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `9765df58a:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `ab87bf160:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `82ea5b1a2:docs/minosegkapuk.md` | 119, 135, 140 |
| R-TERV-205 | `eda8fff9a:docs/minosegkapuk.md` | 200 |
| R-TERV-205 | `d4674ad2f:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `2373a3f4d:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `f894999ec:docs/minosegkapuk.md` | 119, 135 |
| R-TERV-205 | `f98dfc426:docs/minosegkapuk.md` | 119, 132, 154, 170, 196, 221, 240 |
| R-TERV-205 | `f06c55a8a:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `a707d24d6:docs/minosegkapuk.md` | 170 |
| R-TERV-205 | `69b1c41af:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `037691a23:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-205 | `c31164815:docs/minosegkapuk.md` | 110 |
| R-TERV-205 | `77e69552c:docs/minosegkapuk.md` | 175 |
| R-TERV-205 | `c96e48013:docs/minosegkapuk.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-004 | `1416cbf1f:docs/specs/2026-11-10-korlat-kliens-ip.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-160 | `5ea84392b:docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` | 983, 1107, 1192, 1333, 1418, 1495, 1572, 1661 |
| R-TERV-160 | `dfdd4192d:docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` | 983, 1107, 1192, 1252, 1422, 1499, 1576, 1665 |
| R-TERV-160 | `b152e3c12:docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` | 966, 1005, 1046, 1087, 1232, 1313, 1398, 1475, 1552, 1641 |
| R-TERV-160 | `b919a7038:docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` | 966, 1005, 1046, 1172, 1232, 1313, 1398, 1475, 1552, 1641 |
| R-TERV-040 | `58969f07e:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 948, 1156, 1203, 1230, 1240, 1290, 1507 |
| R-TERV-040 | `5c14aab6a:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 1803, 1855, 1896, 1924, 1927, 1934, 1942, 1972, 1988, 2024 |
| R-TERV-040 | `895c85d12:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 948, 1156, 1203, 1230, 1240, 1461 |
| R-TERV-040 | `9083a7c01:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 948, 1156, 1203, 1230, 1240, 1461 |
| R-TERV-040 | `46df90261:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 1680, 1750, 1753, 1850, 1858, 1883, 1905 |
| R-TERV-040 | `9da0e8c25:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 948, 1374, 1448, 1518, 1521, 1590 |
| R-TERV-040 | `d2536dfeb:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 1249, 1296, 1325, 1335, 1385, 1416 |
| R-TERV-040 | `695470673:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-040 | `87d3d5d8e:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-040 | `bc91a9694:docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` | 948, 1374, 1571, 1623, 1664, 1692, 1695, 1702, 1725 |
| R-TERV-403 | `f5a1e7127:docs/specs/2026-11-17-eredmeny-email-kviz-vegrehajtas.md` | 3, 52, 62, 73, 83, 143 |
| R-TERV-403 | `444872920:docs/specs/2026-11-17-eredmeny-email-kviz-vegrehajtas.md` | 3, 52, 62, 73, 83, 143, 244 |
| R-TERV-403 | `444872920:docs/specs/2026-11-17-eredmeny-email-kviz.md` | 3, 91, 106, 296, 376, 410–447 |
| R-TERV-403 | `f5a1e7127:docs/specs/2026-11-17-eredmeny-email-kviz.md` | 3, 88, 103, 336–361 |
| R-TERV-167 | `635e5d017:docs/specs/2026-11-17-kockavadasz-telefon-gyors-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-167 | `635e5d017:docs/specs/2026-11-17-kockavadasz-telefon-gyors.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-204 | `d4674ad2f:docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-204 | `d4674ad2f:docs/specs/2026-11-17-kulso-ellenor.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-206 | `cfe88a12d:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` | 6, 36, 74, 118 |
| R-TERV-206 | `f98dfc426:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` | 6, 89, 127 |
| R-TERV-206 | `77e69552c:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` | 6 |
| R-TERV-206 | `f894999ec:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` | 6, 36, 74, 118 |
| R-TERV-206 | `82ea5b1a2:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md` | 6, 36, 74, 118 |
| R-TERV-206 | `82ea5b1a2:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` | 64, 295, 312, 320, 360, 364 |
| R-TERV-206 | `f98dfc426:docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` | 64, 225–226, 382, 386 |
| R-TERV-001 | `9ae67890a:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `588fac557:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `a3eb9bb01:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `b1532322c:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `a31fc28af:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `28949f205:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | 612 |
| R-TERV-001 | `e855d8a73:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `eeb6fae10:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `ad46b3645:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `15f9baeae:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | 640, 656 |
| R-TERV-001 | `9418eecd1:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `41bdaa862:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | 640, 656 |
| R-TERV-001 | `d3098dfa2:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `4ecc044f2:docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `a3eb9bb01:docs/specs/2026-11-18-adventi-naptar.md` | 1031 |
| R-TERV-001 | `41bdaa862:docs/specs/2026-11-18-adventi-naptar.md` | 798, 1041 |
| R-TERV-001 | `588fac557:docs/specs/2026-11-18-adventi-naptar.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-001 | `eeb6fae10:docs/specs/2026-11-18-adventi-naptar.md` | 1036 |
| R-TERV-001 | `d3098dfa2:docs/specs/2026-11-18-adventi-naptar.md` | 1036 |
| R-TERV-001 | `15f9baeae:docs/specs/2026-11-18-adventi-naptar.md` | 798, 1041 |
| R-TERV-209 | `eda8fff9a:docs/specs/2026-11-18-hook-onfailure-vegrehajtas.md` | 21 |
| R-TERV-209 | `eda8fff9a:docs/specs/2026-11-18-hook-onfailure.md` | 46, 48, 50–52, 55, 57 |
| R-TERV-210 | `c96e48013:docs/specs/2026-11-18-merge-kapu-rest-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-210 | `c96e48013:docs/specs/2026-11-18-merge-kapu-rest.md` | 57, 61 |
| R-TERV-107 | `6a8e81da0:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `19925a115:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | 82, 419 |
| R-TERV-107 | `94d6a83a7:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | 82, 440 |
| R-TERV-107 | `d302bb5e2:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `744b8443a:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | 82, 419 |
| R-TERV-107 | `e800d853e:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `c73e14a91:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `7ea695550:docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `19925a115:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | 421, 647–648 |
| R-TERV-107 | `744b8443a:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | 414, 636–637 |
| R-TERV-107 | `d302bb5e2:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `7ea695550:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `c73e14a91:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-107 | `94d6a83a7:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | 437, 659–660 |
| R-TERV-107 | `e800d853e:docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-006 | `f024bb3db:docs/specs/2026-11-19-kitakaro-negyzetes-regex-vegrehajtas.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-006 | `f024bb3db:docs/specs/2026-11-19-kitakaro-negyzetes-regex.md` | A jelzett pontok szövegében nincs új sor. |
| R-TERV-139 | `ab87bf160:docs/telepites-elotti-or.md` | A jelzett pontok szövegében nincs új sor. |

## KÉSZ · lezárt családok

Az oszlopok az önálló tételekkel azonos mezőket tartalmazzák. A lezárt követelménynek nincs további implementációs lépése.

| Azonosító | Cím | Állapot | Terület | Prioritás-javaslat | Eredeti utasítás / cél | Forrás | Mi van kész | Mi hiányzik | Folytatás helye | Következő lépés | Függőség / ütközés | Kapcsolódó P-tétel |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R-TERV-003 | Fejlesztés utáni higiénia (2026-10-14) | KÉSZ | biztonság | P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint. | Fejlesztés utáni higiénia (2026-10-14) | `docs/specs/2026-10-14-higienia.md:22`, `docs/specs/2026-10-14-higienia-vegrehajtas.md:5` | Az egyszeri karbantartás #214-ben hét ág és egy munkafa tartalmi összevetésével, négy nulla DB-számlálóval, 2244/2244 teszttel és builddel lezárult. A külön futó és várakozó számláló forrása source/scripts/measure/db-hygiene-report.mts:10–13. | — | `docs/specs/2026-10-14-higienia.md:1` · #214 | — | — | — |
| R-TERV-008 | Spec: LS-0 — Higiénia és alapok (Lesson Studio 0. szelet) | KÉSZ | biztonság | P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint. | LS-0 — Higiénia és alapok (Lesson Studio 0. szelet) | `docs/specs/ls-0-hygiene-2026-09-04.md:70` | 50d6b39f, 222/222 teszt, háromszor 18/18 böngésző és ellenpróba. source/tests/auth-return-to.test.ts:17 és source/tests/screens-defined.test.ts:87. | — | `docs/specs/ls-0-hygiene-2026-09-04.md:1` | — | — | — |
| R-TERV-009 | SEC-107 — A 12 token nélküli mutáló fetch rendbetétele | KÉSZ | biztonság | P1. A hozzáférés vagy az adatvédelem közvetlenül érintett. | SEC-107 — A 12 token nélküli mutáló fetch rendbetétele | `docs/specs/sec-107-csrf-client-calls-2026-09-04.md:43` | 2ab9e56b, 370/370 unit, 20/20 és két ellenpróba. source/tests/client-csrf-guard.test.ts:101, :124, :143. | — | `docs/specs/sec-107-csrf-client-calls-2026-09-04.md:1` | — | — | — |
| R-TERV-016 | Napi emlékeztető: tiszta tanmenet-téma és próbalevél az adminnak — terv | KÉSZ | egyéb | P2. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek. | Az emlékeztető megfelelő időben és a megfelelő címzetti körnek menjen ki | `docs/specs/2026-10-18-emlekezteto-probalevel.md:21`, `docs/specs/2026-10-18-emlekezteto-probalevel-vegrehajtas.md:1` | #294, 2106/2106, DB 57/57, böngésző 11/11. source/tests/daily-reminder-admin.spec.ts:15. | — | `docs/specs/2026-10-18-emlekezteto-probalevel.md:1` · #294 | — | — | — |
| R-TERV-017 | Napi tananyag-emlékeztető a regisztrált tanulóknak — terv | KÉSZ | egyéb | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az emlékeztető megfelelő időben és a megfelelő címzetti körnek menjen ki | `docs/specs/2026-10-18-napi-emlekezteto.md:35`, `docs/specs/2026-10-18-napi-emlekezteto-vegrehajtas.md:14` | #292, 2104/2104, DB 54/54, 2/2 böngésző. A név, aktivitás, szünnap, egyszeri küldés és célút próbái: source/tests/daily-reminder-db.integration.ts:42, :57, :68, :81 és source/tests/daily-reminder.test.ts:16, :32, :49. Az október 22-i új leckeértesítés a későbbi küldési szabály. | — | `docs/specs/2026-10-18-napi-emlekezteto.md:1` · #292 | — | — | — |
| R-TERV-018 | Nyilvános oldal: átláthatóbb lista és személyes üdvözlő ajánló — terv | KÉSZ | egyéb | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A visszatérő és az új látogató a saját állapotához illő belépési lehetőségeket lássa | `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md:26`, `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo-vegrehajtas.md:16` | #289, 2097/2097 unit és 7/7 üdvözlő- és tanmenetpróba. source/tests/welcome-card.spec.ts:27, :67, :76, :91. Az évfolyam későbbi módosításának szabályát a követő terv pontosította. | — | `docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md:1` · #289 | — | — | — |
| R-TERV-022 | Diktálás-híd — a régi HTML-anyagok diktálásának gyökérok-javítása | KÉSZ | egyéb | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A diktált válasz ugyanazon a tanulói úton legyen beadható, mint a billentyűzettel írt | `docs/specs/2026-10-21-diktalas-hid.md:25`, `docs/specs/2026-10-21-diktalas-hid-vegrehajtas.md:1` | #360, 2408/2408 és böngészőpróba felismerővel és anélkül, mobil- és asztali nézet. source/tests/diktalas-hid.test.ts:27, :51, :67, :79. | — | `docs/specs/2026-10-21-diktalas-hid.md:1` · #360 | — | — | — |
| R-TERV-025 | Nyilvános főoldal: „Legfrissebb” és „Tantárgyanként” nézet, külön és együtt | KÉSZ | egyéb | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A kezdőoldal a tervben megjelölt nézetben gyorsan és használható állapotban jelenjen meg | `docs/specs/2026-11-03-fooldal-nezetek.md:71`, `docs/specs/2026-11-03-fooldal-nezetek-vegrehajtas.md:5` | b7383a98, 7/7 Playwright és 2589/2589 unit a commitban. source/client/src/lib/home-views.ts:35 és source/tests/home-views.spec.ts. | — | `docs/specs/2026-11-03-fooldal-nezetek.md:1` · #393 | — | — | — |
| R-TERV-026 | Spec: korszerű fejléc (Hero) és szponzorsáv, új Exclusive Change logó | KÉSZ | egyéb | P3. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A szponzor és a főoldali műveletek kis képernyőn is elérhetők legyenek | `docs/specs/2026-11-03-hero-szponzor-2026.md:74`, `docs/specs/2026-11-03-hero-szponzor-2026-vegrehajtas.md:5` | #388 a három kért töréspontot és a gomb tényleges méretét is méri. source/client/src/components/HeroSection.tsx:58, :87. | — | `docs/specs/2026-11-03-hero-szponzor-2026.md:1` · #388 | — | — | — |
| R-TERV-027 | Spec: szponzorfejléc a nyilvános főoldalon | KÉSZ | egyéb | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A szponzor és a főoldali műveletek kis képernyőn is elérhetők legyenek | `docs/specs/2026-11-03-szponzor-fejlec.md:67`, `docs/specs/2026-11-03-szponzor-fejlec-vegrehajtas.md:5` | #387 dokumentálja a 320, 375 és 1280 px-es méréseket és az érintési cél méretét. source/client/src/components/SponsorBar.tsx:17, :22. | — | `docs/specs/2026-11-03-szponzor-fejlec.md:1` · #387 | — | — | — |
| R-TERV-028 | Napi emlékeztető — a „review 292” integrációs teszt javítása (2026-11-05) | KÉSZ | egyéb | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | Az emlékeztető megfelelő időben és a megfelelő címzetti körnek menjen ki | `docs/specs/2026-11-05-napi-emlekezteto-teszt.md:20`, `docs/specs/2026-11-05-napi-emlekezteto-teszt-vegrehajtas.md:1` | A terv 20–22. sora archiválja az elfogadást. A valódi DB-regresszió source/tests/daily-reminder-db.integration.ts:95. | — | `docs/specs/2026-11-05-napi-emlekezteto-teszt.md:1` · #292 | — | — | — |
| R-TERV-043 | NAT 2020 6. évfolyam — tudásbázis és tananyag | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tantervi térkép forráshű fogalmakra épüljön, és legalább az előírt valós lecke elkészüljön | `docs/specs/2026-09-29-nat2020-grade6-knowledge.md:35`, `docs/specs/2026-09-29-nat2020-grade6-knowledge-vegrehajtas.md:31` | A végrehajtás 31. sorának 401-es akadályát a 37–60. sorban három publikált próba és az egy előírt lecke váltja fel. A forrást, sémát és témaköröket a source/tests/nat2020-grade6-maps.test.ts:36, :49, :65, :74 köti össze. | — | `docs/specs/2026-09-29-nat2020-grade6-knowledge.md:1` · #391 | — | — | — |
| R-TERV-046 | S1 — Determinisztikus katalógus-kinyerés mind a 201 leckéből (2026-10-05) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A katalógusba kerülő és onnan kiválasztott tartalom használata legyen forrással és méréssel igazolható | `docs/specs/2026-10-05-s1-katalogus-kinyeres.md:31`, `docs/specs/2026-10-05-s1-katalogus-kinyeres-vegrehajtas.md:1` | #188 d0a56adb. A ≥95% célra 171/177 (96,6%) kinyert szkript és 7691/7760 (99,1%) kulcs. docs/measurements/2026-10-05-catalog-extract.json:7–11 és source/tests/catalog-extract.test.ts:23, :38, :65. | — | `docs/specs/2026-10-05-s1-katalogus-kinyeres.md:1` · #188 | — | — | — |
| R-TERV-053 | LS-1 — Tudás-térkép (KnowledgeMap) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tanár a forrásból kinyert fogalmakat és idézeteket jóváhagyhassa a lecke elkészítése előtt | `docs/specs/ls-1-knowledge-map-2026-09-04.md:60`, `docs/ls-1-tudas-terkep-hasznalat.md:51` | cdcbb550, 18/18 Playwright és tizenkét hibás változat elutasítása. source/tests/knowledge-map-schema.test.ts:30. A kezdeti feltöltőhiányt #13 követte; jóváhagyott térképből a későbbi LS-2 út készít leckét. | — | `docs/specs/ls-1-knowledge-map-2026-09-04.md:1` | — | — | — |
| R-TERV-057 | Tananyag-folyamatok közös végrehajtása és élő ábrája | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A gyártás lépései, hibái és újraindítása legyen követhető valódi futáson | `docs/specs/2026-09-11-lesson-workflow.md:33`, `docs/specs/2026-09-11-lesson-workflow-vegrehajtas.md:1` | #57, 15 izolált DB/HTTP és kilenc Chrome-próba hét móddal. Az adminhiba, újratöltés és visszaolvasás eredménye docs/handoffs/2026-09-11-workflow-elesites.md:34–40. source/tests/lesson-workflow.test.ts:7, :18, :28. | — | `docs/specs/2026-09-11-lesson-workflow.md:1` · #57 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-059 | Promptverzió adatbázis-hosszkorlátja | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A promptverzió az adatbázis mezőjébe veszteség nélkül férjen be | `docs/specs/2026-09-11-prompt-version-width.md:7`, `docs/specs/2026-09-11-prompt-version-width-vegrehajtas.md:1` | A túl hosszú név eredetileg 33 volt 32 karakteres mezőhöz, az új név 25. A #51 valódi PostgreSQL-tranzakcióban ellenőrizte, a #53 normál böngészőből sikeresen publikálta az eredeti feltöltést (docs/specs/2026-09-11-grading-evidence.md:17). | — | `docs/specs/2026-09-11-prompt-version-width.md:1` · #52 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-063 | Futásonkénti önellenőrzés és alkalmazásszintű skill-tanulás | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A rendszer a megoldott futási hibából a megfelelő szerep számára alkalmazható javítást tudjon tanulni | `docs/specs/2026-09-12-runtime-skill-learning.md:20`, `docs/handoffs/2026-09-12-runtime-skill-learning.md:1`, `docs/specs/2026-09-12-runtime-skill-learning-vegrehajtas.md:1` és 1 további forrás a sormutatóban | E1–E7, #60. Az atomi audit, ismétlésbiztosság, ellenőrzött állapotkép és elkülönített változatok 20 DB- és 9 Chrome-próbában. docs/handoffs/2026-09-12-runtime-skill-learning.md:11–14 és source/tests/runtime-knowledge.test.ts:39, :51, :81. | — | `docs/specs/2026-09-12-runtime-skill-learning.md:1` · #60 | — | — | — |
| R-TERV-064 | Lektor időkeret és 7.4 ellenőrző | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | Lektor időkeret és 7.4 ellenőrző | `docs/specs/2026-09-14-lektor-skill-gate.md:18`, `docs/specs/2026-09-14-lektor-skill-gate-vegrehajtas.md:1` | #68. A terv 18–21. és 28–30. sora az izolált, 22 053 ms-os valós hívást és a 45/80-as bankot rögzíti nulla blokkolóval, az eredeti futás megőrzésével. source/tests/lesson-skill-checks.test.ts. A régi feladat folytatását ma a source/server/studio/lesson-pipeline-routes.ts:368–373 szabályozza. | — | `docs/specs/2026-09-14-lektor-skill-gate.md:1` | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-082 | Megszakadt piszkozatok az adminfelületen — „Tananyag draft” (terv, 2026-10-15) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A félkész leckék az admin számára felismerhetők, folytathatók és kezelhetők legyenek | `docs/specs/2026-10-15-admin-tananyag-draft.md:44`, `docs/specs/2026-10-15-admin-tananyag-draft-vegrehajtas.md:40` | #253: saját feladatok és nyilvános leckék elkülönítése, mentett darabszám, egyszeri kérés, 390/1366, DB 30/30 és E2E 174/174. source/server/studio/lesson-pipeline-routes.ts:534, source/client/src/components/studio/DraftLessons.tsx:60, :67 és source/tests/admin-draft-lessons.spec.ts:67. | — | `docs/specs/2026-10-15-admin-tananyag-draft.md:1` · #253 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-091 | A tananyaggyártás észlelhetősége (haladásjelzés) — terv | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A felület a ténylegesen elkészült munka szerint mutassa a haladást | `docs/specs/2026-10-16-gyartas-haladas.md:36`, `docs/specs/2026-10-16-gyartas-haladas-vegrehajtas.md:1` | #264, 2012/2012, 33/33 DB és 18/18 böngésző 390 px-en. source/server/studio/single-run/engine.ts:72, :877, :903, source/client/src/components/studio/CreationProgress.tsx:7 és source/tests/run-progress.test.ts:7. | — | `docs/specs/2026-10-16-gyartas-haladas.md:1` · #264 | — | — | — |
| R-TERV-093 | Leckekészítő stúdió — Websuli Design, látható arculat, mért hibák javítása — terv | KÉSZ | tananyag | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A Stúdió felületén a gyártási műveletek és állapotok közvetlenül kezelhetők legyenek | `docs/specs/2026-10-17-studio-ui.md:39`, `docs/specs/2026-10-17-studio-ui-vegrehajtas.md:1` | #278: hat szélesség × két színmód, kontraszt, 44×44-es célpont, túlcsordulás és tárolt arculat, 46/46 E2E. source/tests/studio-ui.spec.ts:96, :115, :140, :160 és source/client/src/components/studio/LessonArtSummary.tsx:14. | — | `docs/specs/2026-10-17-studio-ui.md:1` · #278 | — | — | — |
| R-TERV-097 | R3 — ismétlődő hiba: nincs újabb, azonos javítókör a bankcsomagnál | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A ténylegesen ismétlődő gyártási hibát ismerje fel a rendszer, és menthető állapotban folytasson | `docs/specs/2026-10-20-elakadas-r3-ismetlodo-hiba.md:23`, `docs/specs/2026-10-20-elakadas-r3-ismetlodo-hiba-vegrehajtas.md:13` | A terv 31–44. sora szerint a végleges küszöb három azonos kör. #333, 2278/2278. source/tests/elakadas-r3.test.ts:9, :15, :35. | — | `docs/specs/2026-10-20-elakadas-r3-ismetlodo-hiba.md:1` · #333 | — | — | — |
| R-TERV-101 | Futó gyártás részletes követése kilépés után (2026-11-05) | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A feltöltéstől az eredményig minden fontos gyártási állomás követhető legyen | `docs/specs/2026-11-05-gyartas-reszletes-kovetes.md:44`, `docs/specs/2026-11-05-gyartas-reszletes-kovetes-vegrehajtas.md:1` | A terv 44–48. sora zárja mind az öt pontot, #395. source/client/src/components/studio/SourceUploadForm.tsx:222 és source/server/studio/lesson-pipeline-routes.ts:587, :593. | — | `docs/specs/2026-11-05-gyartas-reszletes-kovetes.md:1` · #395 | — | — | — |
| R-TERV-103 | Évfolyam-jelölés a tananyagkártyákon — főoldal és admin (FIX, kanban 54) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tananyag évfolyama minden érintett nézetben következetesen olvasható legyen | `docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md:9`, `docs/specs/2026-11-16-tananyag-evfolyam-jeloles-vegrehajtas.md:8` | E1–E9. #459 (340e63dd), source/shared/classrooms.ts:59, source/tests/classrooms.test.ts:125, :130 és source/tests/classroom-badge.spec.ts:78, :109. A PR nem vezetett be új adatbázis- vagy API-műveletet. | — | `docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md:1` · #54 | — | — | — |
| R-TERV-104 | Következetes évfolyam-módosítás az adminban — Studio-leckénél is (FIX, kanban 54, 2. szelet) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az admin módosíthassa a tananyag évfolyamát, és az új érték minden olvasási úton látszódjék | `docs/specs/2026-11-16-tananyag-evfolyam-modositas.md:75`, `docs/specs/2026-11-16-tananyag-evfolyam-modositas-vegrehajtas.md:19` | M1–M9. #465 (fe7c89fb), közös tranzakció source/server/material-classroom.ts:61, gyorsítótárürítés source/server/routes.ts:1950, :2007, adatbázis-szélek source/tests/material-classroom-db.integration.ts:66, :141, :157, :168 és felületi út source/tests/classroom-badge.spec.ts:120. | — | `docs/specs/2026-11-16-tananyag-evfolyam-modositas.md:1` · #54 | — | — | — |
| R-TERV-105 | Programozás” felirat a programozási lecke oldalán + eseményalapú mentés e2e-módban (kanban 54, 3. szelet) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A programozási kategória felirata egyezően jelenjen meg a listában és az adminfelületen | `docs/specs/2026-11-16-tananyag-programozas-felirat.md:54`, `docs/specs/2026-11-16-tananyag-programozas-felirat-vegrehajtas.md:8` | P1–P5. #468 (78809df3), source/shared/classrooms.ts:72, source/tests/classroom-badge.spec.ts:158, source/server/autoBackup.ts:169, source/tests/auto-backup-event.test.ts:8 és source/tests/material-classroom-db.integration.ts:59–63. | — | `docs/specs/2026-11-16-tananyag-programozas-felirat.md:1` · #54 | — | — | — |
| R-TERV-113 | Közvetlen Studio API | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az adminfelület és a Stúdió közti közvetlen út a teljes munkamenetet végigvigye | `docs/specs/2026-09-11-direct-studio-api.md:9`, `docs/specs/2026-09-11-direct-studio-api-vegrehajtas.md:1` | #58, mindkét szolgáltató adott valódi választ, a prefix és a környezeti routing, valamint a kulcshiány kezelése igazolt. A történeti futások 1154/1154 és 1161/1161 (terv 9., 15–19. sor és source/tests/direct-studio-api.test.ts). A pontos modellsorrendet a későbbi döntések módosították. | — | `docs/specs/2026-09-11-direct-studio-api.md:1` · #58 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-114 | Internetes tananyagkészítés: háttérfutás és pontos javítás | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A webes kutatás megszakítás után is követhető módon jusson el egy elmentett tananyagig | `docs/specs/2026-09-11-web-research-background.md:1`, `docs/specs/2026-09-11-web-research-background-vegrehajtas.md:1` | #55/#56, tényleges újratöltés után ugyanaz a munka, mentett eredmény, konkurens DB- és visszagörgetési próbák. docs/handoffs/2026-09-11-web-research-javitas.md:49–60 és source/tests/web-research-completion.spec.ts:21, :38, :53. | — | `docs/specs/2026-09-11-web-research-background.md:1` · #56 | — | — | — |
| R-TERV-115 | Internetes tananyagkészítés valódi befejezése | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A webes kutatás megszakítás után is követhető módon jusson el egy elmentett tananyagig | `docs/specs/2026-09-11-web-research-completion.md:15`, `docs/specs/2026-09-11-web-research-completion-vegrehajtas.md:1` | #54–#56. A tényleges témához 16 forrás, megőrzött job, azonos SQL/API-adat, 12/12, 11,5/12 és 24/24 pont és három képernyőméret szerepel az átadóban (docs/handoffs/2026-09-11-web-research-javitas.md:43, :49–60). source/tests/web-research-completion.test.ts:16, :21. | — | `docs/specs/2026-09-11-web-research-completion.md:1` · #54 | — | — | — |
| R-TERV-117 | Időzített publikálás — közös adatbáziskapcsolat | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Ütemezett közzétételkor ugyanazt az adatbázist használja a szerver, mint a felület kiszolgálásakor | `docs/specs/2026-09-14-scheduled-publishing-db.md:8`, `docs/specs/2026-09-14-scheduled-publishing-db-vegrehajtas.md:1` | A közös adatbázist használó feladat a source/server/scheduledPublishing.ts:14 alatt indul. Eltérő fejlesztői és fő adatbázissal a valós PostgreSQL-próba 1/1 és az 50 böngészős válasz szerepel a terv 24. sorában. source/tests/scheduled-publishing-db.integration.ts:5. | — | `docs/specs/2026-09-14-scheduled-publishing-db.md:1` | — | — | — |
| R-TERV-120 | Service worker: biztonságos telepítés (offline cache nem vész el) | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A félbeszakadt frissítés után is maradjon használható az előző offline verzió | `docs/specs/2026-10-13-sw-telepites-cache-biztonsag.md:9`, `docs/specs/2026-10-13-sw-telepites-cache-biztonsag-vegrehajtas.md:9` | #207 dd92ba48. Az új cache sikeres cseréjét, megszakításnál a régi offline réteg megőrzését és a jelölt takarítását lefedi a source/client/public/service-worker.js:20, :33, :49 és a source/tests/service-worker-install.browser.ts:58, :70. A végrehajtás 10-16-i kiegészítése indokolja a teszt átnevezését. | — | `docs/specs/2026-10-13-sw-telepites-cache-biztonsag.md:1` · #207 | — | — | — |
| R-TERV-124 | Automatikus mentés — nincs új mentés minden szerverinduláskor (kanban 187) | KÉSZ | infrastruktúra | P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint. | Az automatikus mentés a jóváhagyott környezetben és indítási feltételekkel fusson | `docs/specs/2026-10-18-autobackup-indulas.md:32`, `docs/specs/2026-10-18-autobackup-indulas-vegrehajtas.md:15` | #308, 7/7 és az eredeti hibát visszahozó ellenpróba. source/tests/backup-startup.test.ts:12. Az S2b később a Render-környezetet szándékos kivétellé tette. | — | `docs/specs/2026-10-18-autobackup-indulas.md:1` · #187 | — | — | — |
| R-TERV-125 | Böngészős hibajelentés — külön, titok nélküli végpont (kanban 127) | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A klienshibát a szerver megbízhatóan, korlátozott és megfelelően szűrt adatokkal kapja meg | `docs/specs/2026-10-18-kliens-hibariport.md:42`, `docs/specs/2026-10-18-kliens-hibariport-vegrehajtas.md:1` | #309, HTTP 8/8 és két ellenpróba. source/tests/client-error-route.test.ts:46, :69, :77, :85, :93, :106. | — | `docs/specs/2026-10-18-kliens-hibariport.md:1` · #127 | — | — | — |
| R-TERV-129 | Erőforrás-optimalizálás S2b — felesleges induló mentés, a futás→job keresés kicsomagolás nélkül | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A szolgáltatás költségét és erőforrásigényét mérhetően csökkentse a kijelölt szelet | `docs/specs/2026-10-19-eroforras-s2b.md:50`, `docs/specs/2026-10-19-eroforras-s2b-vegrehajtas.md:1` | #328, 2252/2252 és valódi PostgreSQL 67/67. source/tests/resource-s2b.test.ts:8. | — | `docs/specs/2026-10-19-eroforras-s2b.md:1` · #328 | — | — | — |
| R-TERV-131 | S3c — gépi rubrika-szigorítás: a teljes pontot kapó hibás válasz kizárása modellhívás nélkül | KÉSZ | infrastruktúra | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A szolgáltatás költségét és erőforrásigényét mérhetően csökkentse a kijelölt szelet | `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas.md:30`, `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas-vegrehajtas.md:14` | Terv 51–56, #338, öt célzott eset és egyhívásos banképítés. source/tests/s3c-rubrika-szigoritas.test.ts:21, :36, :48. | — | `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas.md:1` · #338 | — | — | — |
| R-TERV-132 | A szerver leáll, ha az adatbázis lezár egy tétlen kapcsolatot (Render „Exited with status 1”) | KÉSZ | infrastruktúra | P1. Éles működést, költséget, adatmegőrzést vagy kiadási döntést érint. | A háttérben megszakadó adatbázis-kapcsolat ne állítsa le a szervert és a következő lekérdezést | `docs/specs/2026-11-01-db-pool-error-crash.md:40`, `docs/specs/2026-11-01-db-pool-error-crash-vegrehajtas.md:8` | #371 korabeli jegyzőkönyve PostgreSQL 16-on kapcsolatbontást, három naplósort, majd mindkét új kérésre 200-as választ rögzít. source/server/lib/pool-error-handler.ts:5 és source/tests/pool-error-handler.test.ts:13. | — | `docs/specs/2026-11-01-db-pool-error-crash.md:1` · #371 | — | — | — |
| R-TERV-135 | Az adatbázisos integrációs tesztek a CI-ben (2026-11-05) | KÉSZ | infrastruktúra | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A tanulási folyamat valódi adatbázisos regressziója a CI-ben is lefusson | `docs/specs/2026-11-05-ci-learning-db.md:26`, `docs/specs/2026-11-05-ci-learning-db-vegrehajtas.md:1` | A terv 26–27. sora rögzíti a próbát. A CI DB-s tesztet futtat, .github/workflows/ci.yml:95, :118. | — | `docs/specs/2026-11-05-ci-learning-db.md:1` · #400 | — | — | — |
| R-TERV-137 | A Render-telepítés pontos leírása és az éles revízió ellenőrzése (2026-11-05) | KÉSZ | infrastruktúra | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A telepített szolgáltatás tényleges konfigurációja és revíziója ellenőrizhető legyen | `docs/specs/2026-11-05-render-telepites.md:27`, `docs/specs/2026-11-05-render-telepites-vegrehajtas.md:1` | A terv 27–34. sora rögzíti az eredeti revízióellenőrző elfogadását (#401). .github/workflows/ci.yml:29 és scripts/qa/verify-render-revision.test.mjs. | — | `docs/specs/2026-11-05-render-telepites.md:1` · #401 | — | — | — |
| R-TERV-144 | Szólétra és Villám matek: nagyobb bankok, futáson belül nincs ismétlés (2026-09-29) | KÉSZ | játékok | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | Egy játékmeneten belül csökkenjen az ismétlődés, a bank pedig fedje a célzott évfolyamokat | `docs/specs/2026-09-29-jatek-bankok-ismetles.md:52`, `docs/specs/2026-09-29-jatek-bankok-ismetles-vegrehajtas.md:6` | A #135 leírásában évenként 3000 generálás, egyetlen helyes opció, 375/1280 px böngészőpróba és 24 ismétlés nélküli kérdés szerepel. A történeti teljes futás 1515/1515. source/tests/game-bank-no-repeat-content.test.ts. | — | `docs/specs/2026-09-29-jatek-bankok-ismetles.md:1` · #135 | — | — | — |
| R-TERV-146 | Minden játék: 3–12. évfolyamos nehézség, közös évfolyam-kérdésbank (2026-09-29) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A 3–12. évfolyam kérdései a helyes játékhoz és nehézséghez legyenek bekötve | `docs/specs/2026-09-29-jatekok-3-12-evfolyam.md:68` | #136 az eredeti 900/900 vak tételt, a hat kézzel ellenőrzött jelzést és öt működő játékot dokumentálja (1513/1513). source/tests/grade-quiz-select.test.ts:69 és source/tests/grade-quiz-bank.test.ts:28, :43. A novemberi bővítés külön eljárása nem írja át ezt a korabeli elfogadást. | — | `docs/specs/2026-09-29-jatekok-3-12-evfolyam.md:1` · #136 | — | — | — |
| R-TERV-149 | A hét játék 3D-s látványának feljavítása (2026-09-29) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A játékok térbeli látványa mellett a vezérlés és a tanulási feladat használható maradjon | `docs/specs/2026-09-29-jatekok-3d-latvany.md:155`, `docs/specs/2026-09-29-jatekok-3d-latvany-vegrehajtas.md:18` | #129, mind a hét játékban GPU-, mobil- és csökkentett minőségű út, nulla túlcsordulás, 1450/1450. source/client/src/game-engine/three-look/renderer.ts:25, :36, source/tests/three-look.test.ts:19, :61 és source/tests/three-look-dispose.test.ts:15. | — | `docs/specs/2026-09-29-jatekok-3d-latvany.md:1` · #129 | — | — | — |
| R-TERV-154 | Tornado Hunter — híd, ütközés, magától induló autó (spec, 2026-09-29) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A jármű a pálya, a gázadás és a kormányzás szerint kiszámíthatóan mozogjon | `docs/specs/2026-09-29-tornado-fizika.md:110`, `docs/specs/2026-09-29-tornado-fizika-vegrehajtas.md:6` | E1–E8. #137, 1569/1569, valódi GPU-n átkelés és sodródás. source/tests/tornado-bridge.test.ts:32, :49, source/tests/tornado-wind-drift.test.ts és source/tests/tornado-input-release.test.ts. A falkontaktus képkockafüggetlensége source/tests/tornado-collision.test.ts:166, :193. | — | `docs/specs/2026-09-29-tornado-fizika.md:1` · #137 | — | — | — |
| R-TERV-155 | Tornádó: motorfék — gáz nélkül az autó hamar megáll (2026-09-29) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A jármű a pálya, a gázadás és a kormányzás szerint kiszámíthatóan mozogjon | `docs/specs/2026-09-29-tornado-motorfek.md:13`, `docs/specs/2026-09-29-tornado-motorfek-vegrehajtas.md:5` | A #146-ban 30/60/144 Hz mellett 2,5 s után azonos lassulást mértek, a korábbi 37,5% helyett a végsebesség 5%-a alá. A mobil böngészőpróba 3/3, unit 1662/1662. source/tests/tornado-engine-brake.test.ts. | — | `docs/specs/2026-09-29-tornado-motorfek.md:1` · #146 | — | — | — |
| R-TERV-156 | Spec: Tornado Hunter 200 — a roadFactor fordított értéke | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A jármű a pálya, a gázadás és a kormányzás szerint kiszámíthatóan mozogjon | `docs/specs/2026-09-29-tornado-roadfactor.md:68`, `docs/specs/2026-09-29-tornado-roadfactor-vegrehajtas.md:5` | #130, 1459/1459, több mint 400 minta és valódi GPU-próba. source/tests/tornado-road-factor.test.ts:21, :30 és source/tests/tornado-terrain-shader-road.test.ts:55 az út és a shader egyezését ellenőrzi. | — | `docs/specs/2026-09-29-tornado-roadfactor.md:1` · #130 | — | — | — |
| R-TERV-157 | Tornado Hunter — ház az úton, kóválygó és lassú mobilvezetés (spec, 2026-09-29) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A jármű a pálya, a gázadás és a kormányzás szerint kiszámíthatóan mozogjon | `docs/specs/2026-09-29-tornado-ut-kormanyzas.md:127`, `docs/specs/2026-09-29-tornado-ut-kormanyzas-vegrehajtas.md:7` | #140: a korábbi 426 útra lógó ütköző és hat hibás érintési eset javult, 1638/1638. 390×844, 20 s alatt 0% útelhagyás. source/tests/tornado-prop-clearance.test.ts:53, :69 és source/tests/tornado-touch-drive.test.ts. | — | `docs/specs/2026-09-29-tornado-ut-kormanyzas.md:1` · #140 | — | — | — |
| R-TERV-161 | Játékok telefonos reszponzivitása — Vihargarázs és a meta-képernyők (FIX, kanban 59) | KÉSZ | játékok | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A játék összes szükséges vezérlője elérhető legyen a célzott telefonos nézeteken | `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md:132`, `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas-vegrehajtas.md:90` | E1–E7. #467 (6a4f7a48), source/tests/game-meta-quality.spec.ts:88, :156, a hat kért nézet és a 44 px méretű bezárógomb javítása a commitban. A fizikai telefonpróba túlmutat a terv Playwright-feltételén. | — | `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md:1` · #59 | — | — | P-017 |
| R-TERV-168 | Szólétra — olvasható, nyugodt tempó és kiemelt célszó (terv) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A Szólétra kérdései, feliratai és tempója a célzott nyelvhez és a képernyőhöz igazodjanak | `docs/specs/2026-11-17-szoletra-olvashatosag.md:218`, `docs/specs/2026-11-17-szoletra-olvashatosag-vegrehajtas.md:1` | SZ1–SZ10. #498 (e0dba1db), a terv 218–240. és a végrehajtás 140. sora. source/client/src/lib/wordLadder/pacing.ts:22, :24 és source/tests/word-ladder-readability.spec.ts:405, :464. P-011/P-012 külön utómunka. | — | `docs/specs/2026-11-17-szoletra-olvashatosag.md:1` · #498 | — | — | P-011, P-012 |
| R-TERV-172 | Szólétra olvashatóság — követő javítás (terv) | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A Szólétra kérdései, feliratai és tempója a célzott nyelvhez és a képernyőhöz igazodjanak | `docs/specs/2026-11-18-szoletra-kovetes.md:26`, `docs/specs/2026-11-18-szoletra-kovetes-vegrehajtas.md:10` | R1/R2. #500 (99c6dc29), előtte/utána mérés a végrehajtás 19–28. sorában. source/tests/word-ladder-sim.test.ts:251 és source/tests/word-ladder-readability.spec.ts:367. | — | `docs/specs/2026-11-18-szoletra-kovetes.md:1` · #500 | — | — | P-011, P-012 |
| R-TERV-173 | Spec: Galaktikus Aszteroida — fizika, irányítás, grafika turbó | KÉSZ | játékok | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Spec: Galaktikus Aszteroida | `docs/specs/asteroid-physics-turbo-2026-09-06.md:55` | e4ccc247, 728/728, 46/46 böngésző és 5/5 ellenpróba. source/tests/space-asteroid-physics.test.ts:29. | — | `docs/specs/asteroid-physics-turbo-2026-09-06.md:1` · #205 | — | — | — |
| R-TERV-174 | LS-3a — Jutalom-politika, kupon és szerveroldali Próba-értékelés | KÉSZ | játékok | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az eredményes leckepróbából a szabályzatnak megfelelő játékidő és egyszer felhasználható kupon keletkezzen | `docs/specs/ls-3a-rewards-coupons-2026-09-04.md:68`, `docs/ls-3-jutalom-hasznalat.md:17` | Az eredeti jutalom- és kuponszerződés 34cfd5c3-ban 344/344, 19 E2E és 6/6 valós DB eredménnyel járt. source/tests/reward-policy.test.ts:26, source/tests/proba-server-grading.test.ts:73 és source/tests/coupon-clock.test.ts:41. A kapcsolt útmutató további játékokra vonatkozó követését az LS-3b és a játékélmény-család viszi. | — | `docs/specs/ls-3a-rewards-coupons-2026-09-04.md:1` | — | — | — |
| R-TERV-176 | Spec: Tornado Hunter 200 — 3D storm-chasing játék | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A jármű a pálya, a gázadás és a kormányzás szerint kiszámíthatóan mozogjon | `docs/specs/tornado-hunter-200-2026-09-06.md:147` | 0246368b, 160 jármű, 200 pálya, 55 új célzott eset, 682/682 és 46/46 böngészőpróba. source/tests/tornado-vehicles.test.ts:26, source/tests/tornado-levels.test.ts:21 és source/tests/tornado-hunter-render.spec.ts:20. | — | `docs/specs/tornado-hunter-200-2026-09-06.md:1` · #200 | — | — | — |
| R-TERV-177 | Work order: Tornado Hunter control buttons still missing | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | A szükséges járművezérlők telefonon is legyenek a játékos számára láthatók | `docs/specs/wo-2026-09-06-tornado-buttons-still-missing.md:1` | 5a460055 és 84219e7a tényleges telefonos vezérlő- és gamepadpróbákat, négy és három ellenpróbát rögzít. source/tests/tornado-controls.test.ts:11 és source/tests/tornado-wiring-guard.test.ts:31. | — | `docs/specs/wo-2026-09-06-tornado-buttons-still-missing.md:1` · #206 | — | — | — |
| R-TERV-178 | Work order: Tornado Hunter cannot be steered | KÉSZ | játékok | P2. A játszható menet és a gyakorlási feladat használhatóságát érinti. | Érintéssel és gamepaddal is kiszámíthatóan irányítható legyen a jármű | `docs/specs/wo-2026-09-06-tornado-uncontrollable.md:30` | 5a460055 és 84219e7a ellenpróbákkal együtt kezelte a telefonos és gamepad-irányítást. source/tests/tornado-controls.test.ts:11 és source/tests/tornado-wiring-guard.test.ts:31. | — | `docs/specs/wo-2026-09-06-tornado-uncontrollable.md:1` · #206 | — | — | — |
| R-TERV-182 | A lektori javítás visszavezetése a feladatbankhoz | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A lektori bankhibát az azt ténylegesen javítani képes lépés kapja meg | `docs/specs/2026-09-11-bank-review-routing.md:16`, `docs/specs/2026-09-11-bank-review-routing-vegrehajtas.md:1` | #50 a három célzott feladat javítását 23 276 ms-ban rögzíti, 51 célzott teszttel. A közzétételi AC-t később #53 zárja (docs/specs/2026-09-11-grading-evidence.md:17). source/tests/bank-repair.test.ts:70. | — | `docs/specs/2026-09-11-bank-review-routing.md:1` · #50 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-183 | Javítások folytonossága a tananyaggyártásban | KÉSZ | kapuk-QA | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A megszakadt lektorálás folytatásakor a korábbi visszajelzés és a végső döntés is megmaradjon | `docs/specs/2026-09-11-generation-review-continuity.md:13`, `docs/specs/2026-09-11-generation-review-continuity-vegrehajtas.md:1` | #52 rögzíti a két kör kilenc kapuhibáját, három bankjegyzetét és az utolsó jelentés megőrzését, 1120/1120. #53 lezárja az eredeti feltöltés közzétételét és visszaolvasását (docs/specs/2026-09-11-grading-evidence.md:17). A régi lépésgép utódjának szerződését #262 külön rögzíti. | — | `docs/specs/2026-09-11-generation-review-continuity.md:1` · #52 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-184 | Az elkészült internetes tananyag előnézetének javítása | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A strukturált tananyag az előnézetben is teljes méretben és működő vezérlőkkel jelenjen meg | `docs/specs/2026-09-11-material-preview-runtime.md:13`, `docs/specs/2026-09-11-material-preview-runtime-vegrehajtas.md:1` | #56/#57, a kiadott javítás a korábban hibás leckén három méretben nulla JS-hibát és túlcsordulást hozott. docs/handoffs/2026-09-11-workflow-elesites.md:37 és source/tests/preview-navigation.spec.ts:140, :150. | — | `docs/specs/2026-09-11-material-preview-runtime.md:1` · #56 | — | — | — |
| R-TERV-185 | Éles előnézet: elérhető tanulási lapok | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A megnyitott előnézetben az újratöltés, a navigáció és a megnyitás működjön rendeltetésszerűen | `docs/specs/2026-09-11-preview-navigation.md:13`, `docs/specs/2026-09-11-preview-navigation-vegrehajtas.md:1` | #46 a négy lapfül érintési középpontját, a túlcsordulást, a friss lekérést és az új lapot három nézeten ellenőrizte. source/client/src/pages/Preview.tsx:29, :81 és source/tests/preview-navigation.spec.ts:59. | — | `docs/specs/2026-09-11-preview-navigation.md:1` · #46 | — | — | — |
| R-TERV-195 | Futó gyártás követése — review-javítás (395 után, 2026-11-05) | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A gyártás haladása, a visszalépés és a befejezett állapot a felületen egyértelmű legyen | `docs/specs/2026-11-05-gyartas-kovetes-review-javitas.md:33`, `docs/specs/2026-11-05-gyartas-kovetes-review-javitas-vegrehajtas.md:1` | A terv 33–36. sora zárja a feltételeket. source/client/src/components/studio/SourceUploadForm.tsx:222 és source/server/studio/lesson-pipeline-routes.ts:587, :593. #396. | — | `docs/specs/2026-11-05-gyartas-kovetes-review-javitas.md:1` · #396 | — | — | — |
| R-TERV-196 | A core.hooksPath felülírásának tiltása (2026-11-05) | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A minőségellenőrző hookok útvonala ne legyen észrevétlenül átállítható | `docs/specs/2026-11-05-hookspath-tiltas.md:31`, `docs/specs/2026-11-05-hookspath-tiltas-vegrehajtas.md:1` | A terv 31–34. sora, #398, scripts/qa/repo-rules.json:5 és .github/workflows/ci.yml:29. | — | `docs/specs/2026-11-05-hookspath-tiltas.md:1` · #398 | — | — | — |
| R-TERV-197 | Spec: hibavadászat — megerősített hibák javítása (kliens, közös logika, szerver, régi Safari) | KÉSZ | kapuk-QA | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A vizsgálatban azonosított hibákat a tényleges tanulói és adminútvonalon is le kell zárni | `docs/specs/2026-11-10-hibavadaszat.md:87`, `docs/specs/2026-11-10-hibavadaszat-vegrehajtas.md:1` | H1–H10, #413 történeti teljes futása 2652/2652. source/tests/hibavadaszat-a.test.ts:12, :30, :40, :59, :71, :77, source/tests/hibavadaszat-b.test.ts:14 és source/tests/no-lookbehind-client.test.ts:63. A fizikai iOS hangpróba külön TTS-követő. | — | `docs/specs/2026-11-10-hibavadaszat.md:1` · #1 | — | — | — |
| R-TERV-198 | Kockavadász: lejáratkor a játék megáll (ingadozó coupon-expired e2e, kanban 58) | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A megnevezett üzemi viselkedést az időzítéstől és a párhuzamos futás sorrendjétől független próba őrizze | `docs/specs/2026-11-16-e2e-coupon-expired-block-craft.md:82`, `docs/specs/2026-11-16-e2e-coupon-expired-block-craft-vegrehajtas.md:89` | #470 (66b67317), source/tests/coupon-expired-all-games.spec.ts:96, :122, 32/32 mobil és 3/3 hibát visszaadó ellenpróba a végrehajtási naplóban. A többi játék korábbi nyitott kérdését #477 külön lefedi. | — | `docs/specs/2026-11-16-e2e-coupon-expired-block-craft.md:1` · #58 | — | — | — |
| R-TERV-203 | Spec: a useMaterialQuizzes hook referencia-stabil kimenete (Kockavadász-akadás gyökéroka) | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A közös bank fölösleges feldolgozása és a játék főszálának terhelése mérhetően csökkenjen | `docs/specs/2026-11-17-kerdesbank-hook-memo.md:59`, `docs/specs/2026-11-17-kerdesbank-hook-memo-vegrehajtas.md:6` | AC1–6. A végrehajtás 76., 81–84., 124–131. sorában 4/4 teszt, hibát visszahozó ellenpróba és 56–59 fps szerepel. source/tests/material-quizzes-hook-memo.test.ts:179. Az indulási blokk másik követőfeladat. | — | `docs/specs/2026-11-17-kerdesbank-hook-memo.md:1` · #90 | — | — | P-009 |
| R-TERV-204 | Spec: Külső, más rendszerű ellenőr (Google Gemini) a minőségkapuk mellé | KÉSZ | kapuk-QA | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A külső ellenőrzés értékelhető eredményt adjon, és a hozzáférés hiánya is meghatározott állapot legyen | `docs/specs/2026-11-17-kulso-ellenor.md:49`, `docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md:24` | Az öt eredeti feltétel #490 (3924beb7) része. scripts/qa/gates/external-review.mjs:607, :652, :661, scripts/qa/gates/external-review.test.mjs:168, scripts/qa/gates/pre-pr-gate.mjs:135 és .github/workflows/ci.yml:33. A P-043 későbbi eljárás. | — | `docs/specs/2026-11-17-kulso-ellenor.md:1` · #499 | — | — | P-045, P-057 |
| R-TERV-212 | Terv — az audit-hook csak a valódi git push-ra vonatkozzon, és a valós lépést írja (2026-11-19) | KÉSZ | kapuk-QA | P1. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A kiadás előtti műveletek felismerése a tényleges műveletből és ne annak puszta szövegéből következzen | `docs/specs/2026-11-19-audit-hook-kapuinditas.md:48`, `docs/specs/2026-11-19-audit-hook-kapuinditas-vegrehajtas.md:17` | A1–A5. A #520 már a főágon van, d7583576, a commit 8/8 ellenpróbát rögzít. scripts/qa/hooks/check-audit-ok.mjs:60, :83, :96 és scripts/qa/hooks/check-audit-ok.test.mjs:85, :91, :102, :122. A 65. sor szerinti új szélek P-045. | — | `docs/specs/2026-11-19-audit-hook-kapuinditas.md:1` · #520 | — | — | P-045, P-057 |
| R-TERV-224 | Spec: kupon-bónusz bekötés + react-hooks kapu | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | Spec: kupon-bónusz bekötés + react-hooks kapu | `docs/specs/coupon-claim-hooks-gate-2026-09-06.md:49` | b19aa412, 717/717 és 4/4 ellenpróba. source/tests/coupon-claim-wiring-guard.test.ts:38. | — | `docs/specs/coupon-claim-hooks-gate-2026-09-06.md:1` · #204 | — | — | — |
| R-TERV-227 | Spec: Tornado Hunter audit-javítások | KÉSZ | kapuk-QA | P2. Az elfogadási döntés és a kiadás megbízhatóságát érinti. | A jármű a pálya, a gázadás és a kormányzás szerint kiszámíthatóan mozogjon | `docs/specs/tornado-audit-fixes-2026-09-06.md:125` | cadd6d4b, 1/1 render és 46/46 böngészőpróba. source/tests/tornado-chunk-dispose.test.ts:20, source/tests/tornado-controls.test.ts:11 és source/tests/tornado-wiring-guard.test.ts:31. | — | `docs/specs/tornado-audit-fixes-2026-09-06.md:1` · #203 | — | — | — |
| R-TERV-233 | Közvetlen fejlesztői leckeoldal CSP-javítása | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A fejlesztői lecke megnyithatósága a szükséges biztonsági fejléc mellett is maradjon ellenőrizhető | `docs/specs/2026-09-14-lesson-dev-csp.md:16`, `docs/specs/2026-09-14-lesson-dev-csp-vegrehajtas.md:11` | A fejlesztői használatra szűkített 16–21. sor összes feltétele teljesült. #68, 9/9 fejlécpróba, 24/24 valódi közvetlen és előnézeti képernyő. source/tests/lesson-dev-csp.test.ts:9, :18. | — | `docs/specs/2026-09-14-lesson-dev-csp.md:1` | — | — | — |
| R-TERV-238 | Régi kliens + új lecke: ne legyen „sérült” | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Eltérő kliens- és leckeverziónál is egyértelmű legyen, hogyan folytatható a megnyitás | `docs/specs/2026-09-24-lesson-version-skew.md:13`, `docs/specs/2026-09-24-lesson-version-skew-vegrehajtas.md:1` | #108 régi tab és új témaverzió, 1387 hibamentes teszt. source/tests/lesson-version-skew.test.ts:10, :24, source/client/src/lesson-runtime/LessonView.tsx:62 és source/client/src/lib/app-version.ts:9, :22. | — | `docs/specs/2026-09-24-lesson-version-skew.md:1` · #108 | — | — | — |
| R-TERV-240 | Lecke-dizájn és ábra-kontrasztőr (2026-09-29) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A leckében a szöveg, az ábrák és az interakciók minden célzott nézeten jól olvashatók legyenek | `docs/specs/2026-09-29-lecke-dizajn.md:11`, `docs/specs/2026-09-29-lecke-dizajn-vegrehajtas.md:5` | #138: 15 téma × 3 korosztály, interaktív állapotok, mobilon legalább 5,02 kontraszt, 0/29 problémás felirat mindkét nézetben, 1516/1516 és 3/3 böngésző. source/shared/svg-contrast.ts:91, :109 és source/server/studio/visual-patch.ts:103. | — | `docs/specs/2026-09-29-lecke-dizajn.md:1` · #138 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-244 | A tanuló nem törölheti a megadott évfolyamát — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A már beállított évfolyamot lehessen javítani, de véletlenül ne lehessen törölni | `docs/specs/2026-10-18-evfolyam-nem-torolheto.md:12`, `docs/specs/2026-10-18-evfolyam-nem-torolheto-vegrehajtas.md:1` | #293, unit 2099/2099, böngésző 10/10. source/tests/welcome-card.spec.ts:27. A 2026-10-18-i döntés szerint az első belépőnél választható az évfolyam, a már megadott nem törölhető (terv 11–18). | — | `docs/specs/2026-10-18-evfolyam-nem-torolheto.md:1` · #293 | — | — | — |
| R-TERV-245 | Pontos évfolyam a lecke fejlécében — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az évfolyamot egyértelműen és pontos egyezéssel kezelje minden érintett felület | `docs/specs/2026-10-18-pontos-evfolyam.md:22`, `docs/specs/2026-10-18-pontos-evfolyam-vegrehajtas.md:1` | #290, 2095/2095, két böngészős csomag 18/18. source/tests/exact-grade.test.ts:9 (terv 21). | — | `docs/specs/2026-10-18-pontos-evfolyam.md:1` · #290 | — | — | — |
| R-TERV-246 | A lista a tanuló évfolyamára szűrve nyílik — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tanuló a neki megfelelő évfolyamhoz tartozó tartalmakat tudja kiválasztani | `docs/specs/2026-10-18-tanulo-evfolyam-szuro.md:12`, `docs/specs/2026-10-18-tanulo-evfolyam-szuro-vegrehajtas.md:1` | #291, üdvözlő és tanmenet 10/10, fő webes csomag 22/22. source/tests/welcome-card.spec.ts:107, :134. | — | `docs/specs/2026-10-18-tanulo-evfolyam-szuro.md:1` · #291 | — | — | — |
| R-TERV-247 | Stúdió-lecke: a kijelzőt kitöltő reszponzív elrendezés (7.5-ös skill szerint) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Széles képernyőn a lecke használja ki az elérhető helyet a kisebb nézetek elrontása nélkül | `docs/specs/2026-10-22-lecke-szeles-elrendezes.md:36`, `docs/specs/2026-10-22-lecke-szeles-elrendezes-vegrehajtas.md:1` | #368, 10/10 böngészőmátrix és 16/16 megjelenítési teszt. source/tests/lesson-responsive.spec.ts:32. | — | `docs/specs/2026-10-22-lecke-szeles-elrendezes.md:1` · #368 | — | — | — |
| R-TERV-250 | Új leckék automatikus, tartalomhoz illő borítója (B) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A lecke témájához illő borító készüljön, és a már jóváhagyott borító ne íródjon felül | `docs/specs/2026-11-03-leckeborito-auto.md:64`, `docs/specs/2026-11-03-leckeborito-auto-vegrehajtas.md:5` | source/shared/lesson-cover-key.ts:19 és source/tests/lesson-cover-auto.test.ts:44, :55, :71, :85, :101, :109, :124, :146, :157. A b7383a98 idején a teljes főági ellenőrzésben már ez a változat is szerepelt. | — | `docs/specs/2026-11-03-leckeborito-auto.md:1` · #384 | — | — | — |
| R-TERV-252 | Webes tananyagkészítés — mobilnézet szétesése | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az admin a webes készítést egyértelműen el tudja indítani és mobilon is végig tudja követni | `docs/specs/2026-11-03-webes-keszites-mobil.md:50`, `docs/specs/2026-11-03-webes-keszites-mobil-vegrehajtas.md:5` | #390 valós 390 px-es előtte/utána mérés, webes kutatás 12/12, Studio-folyamat 5/5 és admin reszponzivitás 18/18. source/client/src/lib/chat-markdown.ts:31 és source/tests/web-research-completion.spec.ts:28. | — | `docs/specs/2026-11-03-webes-keszites-mobil.md:1` · #390 | — | — | — |
| R-TERV-254 | Spec: szebb, magyar ékezetbiztos tananyagbetű | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tanuló évfolyamához rendelt, valóban renderelt betűkészlet jelenjen meg a leckében | `docs/specs/2026-11-09-lecke-betucsere.md:36`, `docs/specs/2026-11-09-lecke-betucsere-vegrehajtas.md:5` | #408 a végső Lexend-beállításhoz 4/4 tipográfiai, 4/4 labor és 13/13 fúziós próbát, valamint tényleges CDP-betűvizsgálatot közöl. source/shared/lesson-typography.ts:4, :6. A 2026-11-09-i végső döntés a korábbi betűjavaslatokat felülírja. | — | `docs/specs/2026-11-09-lecke-betucsere.md:1` · #408 | — | — | — |
| R-TERV-259 | LS-2 — Lecke-séma, csővezeték és futtató | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A lecke tartalma, szerkezete és forrásfedettsége egy közös sémával legyen ellenőrizhető | `docs/specs/ls-2-lesson-schema-2026-09-04.md:71`, `docs/ls-2-lecke-keszites-hasznalat.md:48` | 5522680f, háromszor 19/19 böngésző, valódi 360×740 nézet és 44 px célpont. A fedettség, lektori szabály és az állapotgép próbája source/tests/coverage-gate.test.ts:59, source/tests/lektor-d1.test.ts:48 és source/tests/pipeline-state.test.ts:28. A régi körkorlátot #38 pontosította. | — | `docs/specs/ls-2-lesson-schema-2026-09-04.md:1` | — | — | — |
| R-TERV-263 | Nyelvleckék: kiejtésgyakorló fül, felolvasás minden eszközön, nyelvválasztós diktálás | KÉSZ | TTS | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A nyelvleckében a tanított szóhoz a megfelelő kiejtés legyen elérhető | `docs/specs/2026-10-21-nyelvlecke-kiejtes.md:31`, `docs/specs/2026-10-21-nyelvlecke-kiejtes-vegrehajtas.md:1` | #360, 2408/2408 és mobil-/asztali böngészőpróba. source/tests/pronunciation.test.ts:7, :14, :22. | — | `docs/specs/2026-10-21-nyelvlecke-kiejtes.md:1` · #360 | — | — | — |
| R-TERV-266 | Tananyaglista kapcsolati hiba — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Hálózati kiesés után a tananyaglista magától vagy egy kézi művelettel helyreálljon | `docs/specs/2026-09-10-material-list-connection-recovery.md:19`, `docs/specs/2026-09-10-material-list-connection-recovery-vegrehajtas.md:1` | A hiba utáni automatikus és kézi visszatérés, az üres lista és a gyorsítótárazott adat megőrzése az 5 Chrome-próbában és a valódi, 177 elemű listával dokumentált (terv 29–36). source/client/src/pages/Home.tsx:24, :59, source/tests/material-list-recovery.spec.ts:42, :49, :60. | — | `docs/specs/2026-09-10-material-list-connection-recovery.md:1` · #45 | — | — | — |
| R-TERV-269 | Lektori pontozási állítások mért bizonyítéka | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tanuló képernyőjén kapott pontot az eredeti válaszból is vissza lehessen igazolni | `docs/specs/2026-09-11-grading-evidence.md:11`, `docs/specs/2026-09-11-grading-evidence-vegrehajtas.md:1` | #53 a valós Chrome-feltöltés publikált eredményét négy lapon, három nézeten, 20/20 és 15/15 ponttal, megtartott korábbi változattal ellenőrizte (terv 15–17). 57 célzott és 1122/1122 teljes teszt. source/tests/bank-binding-diagnostics.test.ts:37. | — | `docs/specs/2026-09-11-grading-evidence.md:1` · #53 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-275 | Folyamatos feladat- es kvizlista | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Újratöltéskor a gyakorlás állapota maradjon meg, a tanuló folytathassa a kört | `docs/specs/2026-09-14-continuous-practice.md:13`, `docs/specs/2026-09-14-continuous-practice-vegrehajtas.md:8` | #67, a terv 23–30. sora szerinti valódi PostgreSQL, Express és Chrome. Két 25-ös kör, fordított sorrend, egy kupon, 15+15 feladat, vendégút, első hiányos válasz fókusza, SQL-visszaolvasás és három képernyőméret. | — | `docs/specs/2026-09-14-continuous-practice.md:1` · #67 | — | — | — |
| R-TERV-278 | Valós tanulói tesztek — szerződés | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Valódi adatbázissal és böngészővel legyen ellenőrizve a tanuló, a lecke és a jutalom adatútja | `docs/specs/2026-09-14-real-learning-tests.md:16`, `docs/specs/2026-09-14-real-learning-tests-vegrehajtas.md:9` | #68, terv 42–51. és 59–65. sora. Valódi PostgreSQL 17, Express és Chrome, két kör, 50 válasz, egy kupon, offline ismétlés, vendég 12,5/15, 3 oldalas tanári riport SQL-egyezéssel, idegen hozzáférés tiltása és három viewport. A 47–48. sor korábbi NOT RUN állapotát a 61–63. sor lezárja. | — | `docs/specs/2026-09-14-real-learning-tests.md:1` | — | — | — |
| R-TERV-279 | Studio folytatás: rövid HTTP elfogadás | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az újraindított futás állapota a HTTP-válaszban és a felületen is a valós lépést mutassa | `docs/specs/2026-09-14-resume-http-acceptance.md:7`, `docs/specs/2026-09-14-resume-http-acceptance-vegrehajtas.md:1` | #68; a terv 23–27. sorában négy valódi Express-eset és öt Chrome-próba szerepel, a már elkészült anyagra 269 ms alatt idempotens válasz érkezett. Az örökös útvonal source/server/studio/lesson-pipeline-routes.ts:573. | — | `docs/specs/2026-09-14-resume-http-acceptance.md:1` | — | — | — |
| R-TERV-281 | A főoldal tananyaglistája sosem tűnhet el (2026-09-20) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A nyitóoldal a mentett tananyagokat a megfelelő sorrendben, friss állapotban mutassa | `docs/specs/2026-09-20-home-list-visibility.md:40` | #102 visszalépéskor 194 látható kártyát, teljes átlátszatlanságot és beragadt inline stílus nélküli listát dokumentált. source/tests/home-list-visibility.test.ts:24, :30, :39. | — | `docs/specs/2026-09-20-home-list-visibility.md:1` · #102 | — | — | — |
| R-TERV-282 | Minden szerepkörnek kötelező skill (runbook) — és a lektor támpontjai | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A szerepkörök tényleges hívásaiba kerüljenek be a rájuk tartozó ellenőrzött útmutatók | `docs/specs/2026-09-23-role-skills-everywhere.md:24`, `docs/specs/2026-09-23-role-skills-everywhere-vegrehajtas.md:1` | #104, 1379 sikeres teszt és valódi futáson a hat hamis blokkoló mindegyike megszűnt. A szakaszok, promptkeretek és a lektori kötés próbái: source/tests/role-skills-everywhere.test.ts:30, :43, :58, :66. A hívó source/server/studio/role-skills.ts:296. | — | `docs/specs/2026-09-23-role-skills-everywhere.md:1` · #104 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-287 | Körforgás-ábra: a fázisfelirat nem csúszhat a számozott körre (2026-09-30) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A körforgásábrán a feliratok és nyilak ne takarják el egymást | `docs/specs/2026-09-30-korforgas-felirat-utkozes.md:62`, `docs/specs/2026-09-30-korforgas-felirat-utkozes-vegrehajtas.md:25` | E1–E9, #199. Három nézeten 6/6 Playwright és 2099/2099 unit. source/tests/cycle-layout.test.ts:66, :74. | — | `docs/specs/2026-09-30-korforgas-felirat-utkozes.md:1` · #199 | — | — | — |
| R-TERV-292 | Tananyag javítása” admin-panel címének kontrasztja (2026-10-01) | KÉSZ | tananyag | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | A javítópanel címe kis képernyőn világos és sötét rendszerbeállítás mellett is legyen olvasható | `docs/specs/2026-10-01-javitopanel-cim-kontraszt.md:10`, `docs/specs/2026-10-01-javitopanel-cim-kontraszt-vegrehajtas.md:1` | Az egyetlen AC mindkét színmódban 390×844 nézeten legalább 4,5:1 kontrasztot követel. c2e6170b, source/client/src/components/LessonRepairPanel.tsx:117 és source/tests/repair-panel-contrast.spec.ts:18, :43. | — | `docs/specs/2026-10-01-javitopanel-cim-kontraszt.md:1` · #172 | — | — | — |
| R-TERV-306 | A folytatás szövege a folytatás fajtája szerint — terv (2026-10-15) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A folytatást indító gomb arról tájékoztasson, amit a művelet ténylegesen tesz | `docs/specs/2026-10-15-folytatas-szoveg.md:27`, `docs/specs/2026-10-15-folytatas-szoveg-vegrehajtas.md:1` | E1–E2, #232 b5c51681. source/client/src/components/studio/SourceUploadForm.tsx:20 és source/tests/studio-generation-recovery.spec.ts:50, :108 (360 px és alapnézet). A régi gyártási útvonalat az S4b később lecserélte. | — | `docs/specs/2026-10-15-folytatas-szoveg.md:1` · #232 | — | — | — |
| R-TERV-308 | Piszkozatok kezelése: törlés, mindig van továbblépés, folyamatjelző (terv, 2026-10-16) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A félkész leckék az admin számára felismerhetők, folytathatók és kezelhetők legyenek | `docs/specs/2026-10-16-draft-kezeles.md:20`, `docs/specs/2026-10-16-draft-kezeles-vegrehajtas.md:1` | #255, az egyszeri és kötegelt elvetés, jogosultság, futó feladat védelme, követés és két nézet 32/32 DB és 22/22 böngészőpróbával. source/server/studio/lesson-pipeline-routes.ts:541, :549, :568 és source/tests/admin-draft-lessons.spec.ts:109, :145, :163, :170. | — | `docs/specs/2026-10-16-draft-kezeles.md:1` · #255 | — | — | — |
| R-TERV-312 | Tanulói eredmény e-mailben az adminoknak (strukturált leckék) — terv | KÉSZ | tananyag | P1. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek. | A lecke eredménye a tényleges szerveres értékeléssel és az ismételt küldés kezelésével kerüljön levélbe | `docs/specs/2026-10-17-eredmeny-email.md:62`, `docs/specs/2026-10-17-eredmeny-email-vegrehajtas.md:1` | Az eredeti négy pontot #495 és #496 is megerősíti. source/tests/lesson-result-email-db.integration.ts:52, :67 (szerveres pontozás, egyszeri küldés), source/tests/lesson-result-email-quiz.spec.ts:29, :61 (vendég). 3ff4d173 összesen 204/204 DB-esetet és három ellenpróbát rögzít. | — | `docs/specs/2026-10-17-eredmeny-email.md:1` · #280 | — | — | — |
| R-TERV-313 | Spec: kétszínű fókuszgyűrű a témás tananyag-lejátszóban | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A billentyűzettel kijelölt elemet minden témában jól látható fókuszgyűrű jelezze | `docs/specs/2026-10-17-fokuszgyuru-ketszinu.md:59`, `docs/specs/2026-10-17-fokuszgyuru-ketszinu-vegrehajtas.md:1` | A két 3 px-es gyűrű, minden témában legalább 3:1 kontraszt és a kijelölt fül kerete #367 (cc405b5c). source/client/src/lesson-runtime/lesson-design.css:215, :219, source/tests/lesson-design.test.ts:100, :102, :112, valamint a végrehajtás 50., 55–56. sora. | — | `docs/specs/2026-10-17-fokuszgyuru-ketszinu.md:1` · #367 | — | — | — |
| R-TERV-318 | Admin felület korszerűsítése: keresőmező, felhasználókezelés, menü, halott kód — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az admin feladatai áttekinthetőbb és kezelhetőbb felületet kapjanak | `docs/specs/2026-10-18-admin-korszerusites.md:90`, `docs/specs/2026-10-18-admin-korszerusites-vegrehajtas.md:1` | #287, 2090/2090, build, két böngészőméret (390 és 1366), négy csoport és legalább 4,5:1 kontraszt. source/tests/admin-korszerusites.test.ts:16, :26, :45, :67 és source/tests/admin-korszerusites.spec.ts:12. | — | `docs/specs/2026-10-18-admin-korszerusites.md:1` · #287 | — | — | — |
| R-TERV-319 | Admin-maradványok kivezetése — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A kivezetett működés nyomait a használatban lévő útvonalak megóvásával kell eltávolítani | `docs/specs/2026-10-18-legacy-maradvanyok.md:35`, `docs/specs/2026-10-18-legacy-maradvanyok-vegrehajtas.md:7` | #295, 2092/2092 és build. A kivezetett kódra nem maradt találat. source/tests/ai-model-routing-complete.test.ts:130, source/tests/backup-guard.test.ts:41 és source/client/src/lib/admin-tabs.ts:37. | — | `docs/specs/2026-10-18-legacy-maradvanyok.md:1` · #295 | — | — | — |
| R-TERV-321 | Tanmenet-rendezés kiegészítése: tartalom szerinti illesztés és nyelvi tanmenet — terv | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A tananyagok témájuk és évfolyamuk szerint a tanmenet megfelelő sorrendjében jelenjenek meg | `docs/specs/2026-10-18-tanmenet-kiegeszites.md:40`, `docs/specs/2026-10-18-tanmenet-kiegeszites-vegrehajtas.md:1` | Második illesztési körben a 209 anyagból a csak címes 143 helyett tartalommal 149 illeszthető, tíz évfolyam nélküli anyag szándékosan marad ki (terv 39., 65–67. sor). source/server/curriculum/match.ts:166, :233 és source/tests/curriculum-hints.test.ts:23, :30, :35, :71. | — | `docs/specs/2026-10-18-tanmenet-kiegeszites.md:1` · #284 | — | — | — |
| R-TERV-323 | Adminfelületek reszponzivitás-revíziója — Honor Magic V6 külső és belső kijelző | KÉSZ | tananyag | P2. A tanuló vagy az admin közvetlenül ezen a felületen dolgozik. | Az adminfelület a célzott telefonméreteken is látható és használható maradjon | `docs/specs/2026-10-19-admin-reszponzivitas.md:120`, `docs/specs/2026-10-19-admin-reszponzivitas-vegrehajtas.md:1` | #321, négy Magic V6 profil, 14/14. source/tests/admin-responsive.spec.ts:15. | — | `docs/specs/2026-10-19-admin-reszponzivitas.md:1` · #321 | — | — | — |
| R-TERV-324 | Algebrai (betűs) végeredmény a típusos pontozóban | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az algebrai válasz értékét és alakját a jóváhagyott referenciához képest értékelje a pontozó | `docs/specs/2026-10-19-algebrai-referencia.md:53`, `docs/specs/2026-10-19-algebrai-referencia-vegrehajtas.md:1` | #319 mért képletek, nyolc új eset, 2217/2217. source/tests/polynomial-answer.test.ts:12. A P-027 későbbi szélső esete külön folytatás. | — | `docs/specs/2026-10-19-algebrai-referencia.md:1` · #319 | — | — | — |
| R-TERV-326 | Okosítás és javítás: állandóan látható fázisjelző, elárvult futások azonnali lezárása | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A meglévő tananyag javításakor a kész részek megmaradjanak, és a felület az igazi állapotot mutassa | `docs/specs/2026-10-19-okositas-fazisjelzo.md:60`, `docs/specs/2026-10-19-okositas-fazisjelzo-vegrehajtas.md:1` | #323, 2/2 valódi böngésző 393×780 és 835×810 méreten. source/tests/phase-bar.spec.ts:44, :83. | — | `docs/specs/2026-10-19-okositas-fazisjelzo.md:1` · #323 | — | — | — |
| R-TERV-328 | Internetes készítés — új készítés indítható egy korábbi futás után | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | Az admin a webes készítést egyértelműen el tudja indítani és mobilon is végig tudja követni | `docs/specs/2026-10-19-webes-keszites-uj-inditas.md:30`, `docs/specs/2026-10-19-webes-keszites-uj-inditas-vegrehajtas.md:7` | #317, böngésző 9/9 és reprodukált korábbi hiba. source/tests/web-research-completion.spec.ts:21. | — | `docs/specs/2026-10-19-webes-keszites-uj-inditas.md:1` · #317 | — | — | — |
| R-TERV-329 | HTML-okosítás: a záró kapun bukott jelölt megőrzése diagnosztikának | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A meglévő tananyag javításakor a kész részek megmaradjanak, és a felület az igazi állapotot mutassa | `docs/specs/2026-10-20-okositas-bukott-jelolt.md:27`, `docs/specs/2026-10-20-okositas-bukott-jelolt-vegrehajtas.md:1` | Terv 26–29, #336, 2278/2278. source/tests/okositas-bukott-jelolt.test.ts:8, :15, :28, :36. | — | `docs/specs/2026-10-20-okositas-bukott-jelolt.md:1` · #336 | — | — | — |
| R-TERV-332 | S5 — sorrendérzékeny kifejezés a nyílt feladat rubrikájában (nyelvtani feladatok) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A jelentést megváltoztató szórendi eltérést az értékelés is vegye figyelembe | `docs/specs/2026-10-20-s5-sorrendes-kifejezes.md:81`, `docs/specs/2026-10-20-s5-sorrendes-kifejezes-vegrehajtas.md:42` | Terv 80–91, #341 és #343, 2318/2318, 2329/2329 és 69/69 DB. source/tests/s5-sorrendes-kifejezes.test.ts:23, :33, :44, :83. Az újralapozott #343 került be a lezárt #342 helyett. | — | `docs/specs/2026-10-20-s5-sorrendes-kifejezes.md:1` · #343 | — | — | — |
| R-TERV-333 | S6 — a fogalmak sorrendje a nyílt feladat rubrikájában (sorrendi / műveleti sorrend feladatok) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A fogalmak elvárt sorrendje a megfelelő feladattípusban legyen számonkérhető | `docs/specs/2026-10-20-s6-fogalom-sorrend.md:72`, `docs/specs/2026-10-20-s6-fogalom-sorrend-vegrehajtas.md:1` | Terv 71–75, #346 és #347, 2346/2346 és 2361/2361. source/tests/s6-fogalom-sorrend.test.ts:23, :33, :40, :106. | — | `docs/specs/2026-10-20-s6-fogalom-sorrend.md:1` · #346 | — | — | — |
| R-TERV-334 | A kötőjeles szám nem negatív szám (v1-pontozó) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A kötőjellel írt számalakot a régi pontozó is helyesen értelmezze | `docs/specs/2026-10-20-v1-kotojeles-szam.md:30`, `docs/specs/2026-10-20-v1-kotojeles-szam-vegrehajtas.md:1` | Terv 29–32, #348, 2367/2367. source/tests/v1-kotojeles-szam.test.ts:16, :25, :35, :50. | — | `docs/specs/2026-10-20-v1-kotojeles-szam.md:1` · #348 | — | — | — |
| R-TERV-336 | Ciklus 3 — a kategóriakvóta sémahibáinak gépi javítása (modellkör nélkül) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe | `docs/specs/2026-10-21-ciklus3-kvota-autofix.md:18`, `docs/specs/2026-10-21-ciklus3-kvota-autofix-vegrehajtas.md:1` | #354, 2382/2382. source/tests/ciklus3-kvota-autofix.test.ts:10, :21, :30, :39. | — | `docs/specs/2026-10-21-ciklus3-kvota-autofix.md:1` · #354 | — | — | — |
| R-TERV-338 | Ciklus 5 — félbevágott emoji a mentésben + beragadt sorelem | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe | `docs/specs/2026-10-21-ciklus5-mentes-felkarakter.md:20`, `docs/specs/2026-10-21-ciklus5-mentes-felkarakter-vegrehajtas.md:1` | #356, 2396/2396. source/tests/ciklus5-mentes-felkarakter.test.ts:12, :27, :37. | — | `docs/specs/2026-10-21-ciklus5-mentes-felkarakter.md:1` · #356 | — | — | — |
| R-TERV-339 | Ciklus 6 — a lektor által kifogásolt gépi csoport ne kerüljön vissza + a két elakadt anyag célzott újragyártása | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe | `docs/specs/2026-10-21-ciklus6-csoport-ujraszigoritas.md:20`, `docs/specs/2026-10-21-ciklus6-csoport-ujraszigoritas-vegrehajtas.md:1` | #357, 2399/2399. source/tests/ciklus6-csoport-ujraszigoritas.test.ts:26, :34, :52. | — | `docs/specs/2026-10-21-ciklus6-csoport-ujraszigoritas.md:1` · #357 | — | — | — |
| R-TERV-340 | Ciklus 6b — a belső minőség-felirat csak adminnak, elavult piszkozatok takarítása, a június utáni régi anyagok is | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe | `docs/specs/2026-10-21-ciklus6b-felirat-takaritas-hatokor.md:21`, `docs/specs/2026-10-21-ciklus6b-felirat-takaritas-hatokor-vegrehajtas.md:10` | A #358 a három feltételt együtt vitte be: adminjelzés, elavult hibás piszkozat elvetése és a kijelölt felső dátumhatár. A főági fájl- és tesztkapcsolat a sormutatóban szerepel. source/server/routes.ts:3194 és source/server/studio/legacy-migration.ts:24, :94, :240. | — | `docs/specs/2026-10-21-ciklus6b-felirat-takaritas-hatokor.md:1` · #358 | — | — | — |
| R-TERV-341 | Ciklus 7 — „pontos alak” a magyar nyelvtani feladatokra (toldalékcsere ne kapjon teljes pontot) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A megnevezett javítási ciklusban feltárt hiba reprodukálható példával kerüljön vissza a gyártó ellenőrzésébe | `docs/specs/2026-10-21-ciklus7-pontos-alak.md:24`, `docs/specs/2026-10-21-ciklus7-pontos-alak-vegrehajtas.md:1` | #359 célzott ragozási példák, későbbi #361 teljes csomag 2408/2408. source/tests/ciklus7-pontos-alak.test.ts:21, :32, :37, :49. | — | `docs/specs/2026-10-21-ciklus7-pontos-alak.md:1` · #359 | — | — | — |
| R-TERV-343 | A tudásbank fogalomtípusa nem lépheti túl az oszlophatárt | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A túl hosszú vagy hibás típusú fogalom kezelése ne szakítsa meg indokolatlanul a futást | `docs/specs/2026-10-21-fogalom-tipus-hossz.md:22`, `docs/specs/2026-10-21-fogalom-tipus-hossz-vegrehajtas.md:1` | A javítás az egyszeri újrasorolással végül a #352-ben került be, 2375 sikeres teszttel. A #351 önálló beolvasztása helyett az utód PR-t kell követni. source/server/studio/single-run/live.ts:27 és source/server/studio/legacy-migration.ts:170. | — | `docs/specs/2026-10-21-fogalom-tipus-hossz.md:1` · #351 | — | — | — |
| R-TERV-345 | Rövid fogalomnév megalapozása II — ékezetes rövid szó („Őz”) és nagybetűs elöljáró („AT / ON / IN”) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A rövid vagy ékezetes fogalom ne okozzon hamis fedettségi hibát | `docs/specs/2026-10-21-rovid-fogalom-ekezet.md:45`, `docs/specs/2026-10-21-rovid-fogalom-ekezet-vegrehajtas.md:1` | #363 két futás minden szerzői körét ellenőrizte. A két esetben 3, illetve 7–10 volt a hamis hiányok száma, javítás után nulla. 2425/2425. source/tests/studio-grounding-short-term.test.ts:20. | — | `docs/specs/2026-10-21-rovid-fogalom-ekezet.md:1` · #363 | — | — | — |
| R-TERV-350 | Spec: egységes főoldali megjelenítés — a kártya leírása a lecke saját bevezetője | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A kártyákon az adott tananyagot bemutató rövid leírás jelenjen meg | `docs/specs/2026-11-03-egyseges-kartya-leiras.md:57`, `docs/specs/2026-11-03-egyseges-kartya-leiras-vegrehajtas.md:13` | A1–A4. A 434d87b1 commit 213/213 éles bevezetőt rögzít. source/server/storage.ts:441, :450, source/server/studio/pipeline-store.ts:218 és source/tests/lesson-teaser.test.ts:25, :33, :52. | — | `docs/specs/2026-11-03-egyseges-kartya-leiras.md:1` · #383 | — | — | — |
| R-TERV-351 | Spec: Tantárgyhoz illő nyitókép (híd helyett), a néma borítóhiba feltárása, tartalom szerinti blokkcímkék | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A borító és a blokkcímke a tananyag tartalmáról adjon helyes jelzést | `docs/specs/2026-11-08-borito-blokkcimkek.md:63`, `docs/specs/2026-11-08-borito-blokkcimkek-vegrehajtas.md:7` | A1–A6, történeti 2615/2615 és dokumentált előnézeti render (53a8d90e, terv 73). source/tests/subject-cover-fallback.test.ts:12, :22, source/tests/lesson-block-label.test.ts:14, :40 és source/server/lesson-covers.ts:97. | — | `docs/specs/2026-11-08-borito-blokkcimkek.md:1` · #405 | — | — | — |
| R-TERV-352 | Eredmény-e-mail S2: atomi kézbesítés-foglalás + a bejelentkezett felhasználó kvíze az utolsó válasznál is küld | KÉSZ | tananyag | P1. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek. | A lecke eredménye a tényleges szerveres értékeléssel és az ismételt küldés kezelésével kerüljön levélbe | `docs/specs/2026-11-17-eredmeny-email-foglalas.md:65`, `docs/specs/2026-11-17-eredmeny-email-foglalas-vegrehajtas.md:9` | E1–E5. #495 (3ff4d173), a terv 72–76. sora és a commit 204/204 DB-eset eredménye. source/server/lesson-result-email.ts:67, :110 és source/tests/lesson-result-email-db.integration.ts:52, :272. A tartóssági követő P-025. | — | `docs/specs/2026-11-17-eredmeny-email-foglalas.md:1` · #495 | — | — | P-025 |
| R-TERV-358 | Spec: LS-9 — Korosztályos vizuális rendszer a lecke-futtatóban | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A lecke vizuális megjelenése kövesse az évfolyamsávot és a tanuló választott módját | `docs/specs/ls-9-age-band-visual-system-2026-09-06.md:76` | b075cbe8, 7/7 egység- és 15/15 böngészőpróba az évfolyamsávokra és módokra. source/tests/lesson-band-visual.spec.ts:32 és source/tests/lesson-band-theme.test.ts:26. A jelenlegi öt sáv későbbi arculati döntés. | — | `docs/specs/ls-9-age-band-visual-system-2026-09-06.md:1` · #198 | — | — | — |
| R-TERV-359 | Feladatbank-gyártás hibájának javítása | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A részben hibás bank javítása őrizze meg a már jó tételeket és a teljes elvárt fedettséget | `docs/specs/2026-09-11-bank-generation-contract.md:20`, `docs/specs/2026-09-11-bank-generation-contract-vegrehajtas.md:1` | #48 korabeli valós 12 hívás, 7 validált csomag, 14 módszer, 35 feladat, 70 kérdés és PG17-es visszaállítás (terv 37–40). A #53 később az eredeti feltöltés publikálását is mérte három nézeten. source/server/studio/experience-builder.ts:741 és source/tests/bank-repair.test.ts:39, :70. | — | `docs/specs/2026-09-11-bank-generation-contract.md:1` · #48 | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-360 | Mintaválasz és értékelési rubrika célzott egyeztetése | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A pontozás mutassa meg, melyik tartalmi feltétel teljesült, és miért jár az adott pont | `docs/specs/2026-09-11-bank-rubric-diagnostics.md:16`, `docs/specs/2026-09-11-bank-rubric-diagnostics-vegrehajtas.md:1` | #49 két hívásos javítást és nulla új hívásos teljes visszajátszást mér (terv 30). A #53 az eredeti feltöltés publikációját és pontozását is igazolja. docs/specs/2026-09-11-grading-evidence.md:17 és source/tests/bank-binding-diagnostics.test.ts:37. | — | `docs/specs/2026-09-11-bank-rubric-diagnostics.md:1` · #49 | — | — | — |
| R-TERV-362 | Bankcsomag-hivatkozás és elvesző szolgáltatóhiba | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A hibásan kötött banktételek legyenek azonosíthatók és a helyes fogalomhoz visszaköthetők | `docs/specs/2026-09-14-bank-binding-recovery.md:21`, `docs/specs/2026-09-14-bank-binding-recovery-vegrehajtas.md:1` | #68, az eredeti 21–25. sor feltételei, 3/7/12 csomag, 1250 hibamentes eset és 18 Chrome-próba. Egy tényleges futás 11/45/75 eredményt és sikeres visszaolvasást adott. source/tests/bank-binding-diagnostics.test.ts:7, :24, :37. | — | `docs/specs/2026-09-14-bank-binding-recovery.md:1` | — | A korábbi lépésgépet a d9e9c8e9 (2026-10-16) kivezette. A viselkedési követelményt a mai egyfutásos úton kell értelmezni, lásd source/server/studio/lesson-pipeline-routes.ts:573. | — |
| R-TERV-363 | Spec — Aritmetika-ellenőrző: előjeles szám és vegyes tört (2026-09-24) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A számolási állítás igazsága az előjelek, törtek és műveletek alapján legyen ellenőrizhető | `docs/specs/2026-09-24-aritmetika-elojel.md:22` | #121/#122 ugyanazon bankokon három hamis riasztás helyett nulla. A hibás előjel és a rossz vegyes tört ismét hibát ad. source/shared/arithmetic-expression.ts:10, :17, source/server/studio/tools/arithmetic-claims.ts:29. | — | `docs/specs/2026-09-24-aritmetika-elojel.md:1` · #121 | — | — | — |
| R-TERV-364 | Spec — Célzott bankjavítás közös fogalmú fejezeteknél (2026-09-24) | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | Részleges hibánál csak az érintett banktételt kelljen újragyártani | `docs/specs/2026-09-24-bankjavitas-celzott.md:23` | #124: ugyanazon mentett futásból pontos célzás 2/5 → 5/5, utána a teljes futás 736 s, hibák 13 → 1 → 0. memory/projects/websuli/LEDGER.md:528, :531, source/tests/bank-binding-diagnostics.test.ts:37 és source/server/studio/experience-builder.ts:741. | — | `docs/specs/2026-09-24-bankjavitas-celzott.md:1` · #124 | — | — | — |
| R-TERV-384 | Végrehajtási utasítás — Tételgyár T4′: magyar nyelvi adatbank a rubrikához (1. szelet, determinisztikus) | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa | `docs/specs/2026-10-15-tetelgyar-t4-nyelvi-adatbank-vegrehajtas.md:11` | #228/#231, a determinisztikus nyelvi szelet szóalak-, irányrag-, tagadás-, ékezet- és tiltott szinonimaesetei, 2332/2332. source/shared/hu-lexicon.ts:28, :48, :105, :130 és source/tests/hu-lexicon.test.ts:11, :35, :59, :70, :93. Az ernyőterv legalább hat forrásos mérését külön kell számonkérni. | — | `docs/specs/2026-10-15-tetelgyar-t4-nyelvi-adatbank-vegrehajtas.md:1` · #228 | — | — | — |
| R-TERV-385 | Tételgyár T5 — számolás programból (a kvíz számolós kulcsa) — terv (2026-10-15) | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa | `docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol.md:27`, `docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol-vegrehajtas.md:1` | E1–E4, #244 a18c7c76. source/shared/single-choice-check.ts:252, :279, source/tests/single-choice-arithmetic-t5.test.ts:9, :82. Az ismételt mérés öt valódi és nulla téves találatot hozott (docs/measurements/2026-10-15-t5-szamolos-kulcs.json). | — | `docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol.md:1` · #244 | — | — | — |
| R-TERV-386 | Tételgyár T6 — a kvíz vak megoldása tételenként, gyártáskor — terv (2026-10-15) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A feladatgyártó adott szelete a helyes kulcsot, a bankméretet és a javítás ellenőrizhetőségét biztosítsa | `docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas.md:31`, `docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas-vegrehajtas.md:15` | E1–E3, #245 b1a6f540. A tényleges hívó source/server/studio/single-run/engine.ts:310, a tartalékút source/server/studio/quiz-blind-check.ts:18, :51. source/tests/quiz-blind-check.test.ts:14, :23, :42, :75. A PR-ben nincs kliens- vagy pontozóváltozás. | — | `docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas.md:1` · #245 | — | — | — |
| R-TERV-390 | Gyakorlóbank: az üres választható lista nem buktathatja a gyártást — terv | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | Üres, opcionális lista miatt egy egyébként érvényes banktétel ne bukjon el | `docs/specs/2026-10-18-bank-ures-lista.md:29`, `docs/specs/2026-10-18-bank-ures-lista-vegrehajtas.md:1` | #298, 2105/2105, source/tests/bank-empty-optional.test.ts:15 (terv 28). | — | `docs/specs/2026-10-18-bank-ures-lista.md:1` · #298 | — | — | — |
| R-TERV-391 | Tananyagjavító — a régebbi tananyagok is kiválaszthatók (mobilon is) | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | Régi HTML és új lecke egyaránt megtalálható és javításra kiválasztható legyen mobilon | `docs/specs/2026-10-19-javito-valaszto-mobil.md:32`, `docs/specs/2026-10-19-javito-valaszto-mobil-vegrehajtas.md:1` | #318 (db8b9d70) 4/4 keresési és 3/3 böngészőesetet rögzít: régi HTML, évfolyam, választás, alkalmazhatóság és két viewport. source/client/src/lib/lesson-repair-search.ts és source/tests/lesson-repair-workbench.spec.ts. | — | `docs/specs/2026-10-19-javito-valaszto-mobil.md:1` · #318 | — | — | — |
| R-TERV-392 | HTML-okosítás: a záró kapu gépi rubrika-igazítása és célzott újrapróba — az okosítás gyökéroka | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A meglévő tananyag javításakor a kész részek megmaradjanak, és a felület az igazi állapotot mutassa | `docs/specs/2026-10-19-okositas-bank-igazitas.md:49`, `docs/specs/2026-10-19-okositas-bank-igazitas-vegrehajtas.md:10` | #327, célzott 5/5 és teljes 2239/2239. source/tests/improve-align-html-bank.test.ts:25, :33, :41, :50. | — | `docs/specs/2026-10-19-okositas-bank-igazitas.md:1` · #327 | — | — | — |
| R-TERV-395 | Kvíz-kulcsellenőrzés: a hatványalak értéke (a „7²” nem 7) | KÉSZ | tananyag | P2. Dokumentált tulajdonosi vagy végrehajtási követelmény. | A hatványalak értéke alapján dőljön el, helyes-e a kvízkulcs | `docs/specs/2026-10-20-kviz-hatvany-ertek.md:28`, `docs/specs/2026-10-20-kviz-hatvany-ertek-vegrehajtas.md:1` | Terv 27–29, #344, 2335/2335. source/tests/kviz-hatvany-ertek.test.ts:10, :14, :20, :26. | — | `docs/specs/2026-10-20-kviz-hatvany-ertek.md:1` · #344 | — | — | — |
| R-TERV-396 | R2 — HTML-okosítás: determinisztikus bankjavítás a záró kapu előtt | KÉSZ | tananyag | P2. A gyártás befejezhetősége és a kész tananyag minősége múlik rajta. | A meglévő tananyag javításakor a kész részek megmaradjanak, és a felület az igazi állapotot mutassa | `docs/specs/2026-10-20-okositas-r2-bankjavitas.md:26`, `docs/specs/2026-10-20-okositas-r2-bankjavitas-vegrehajtas.md:13` | Terv 37–42, #332, öt eset a 45-ös padlóval. source/tests/okositas-r2-bankjavitas.test.ts:22, :36, :45, :54, :64. | — | `docs/specs/2026-10-20-okositas-r2-bankjavitas.md:1` · #332 | — | — | — |
| R-TERV-397 | Pontozó: az angol tagadás (n't) felismerése — a „Where I Live” lektor-megállás gyökéroka | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A tanuló válaszát tartalma és nyelvtani jelentése szerint értékelje a közös pontozó | `docs/specs/2026-10-20-pontozo-angol-tagadas.md:52`, `docs/specs/2026-10-20-pontozo-angol-tagadas-vegrehajtas.md:11` | Terv 51–56, #330, 6/6 célzott és 2263/2263 összes teszt. source/tests/score-english-negation.test.ts:22, :42, :54, :65. | — | `docs/specs/2026-10-20-pontozo-angol-tagadas.md:1` · #330 | — | — | — |
| R-TERV-398 | R5 — a pontozó regressziós korpusza (+ a korpusz által talált ragozási hiba) | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A tanuló válaszát tartalma és nyelvtani jelentése szerint értékelje a közös pontozó | `docs/specs/2026-10-20-r5-pontozo-korpusz.md:36`, `docs/specs/2026-10-20-r5-pontozo-korpusz-vegrehajtas.md:1` | A #334 2279/2279-es eredményt és buildet dokumentál. Mindkét pontozót a corpus ugyanazzal a bemenettel méri: source/tests/scorer-corpus.test.ts:27, :35. A tudatosan elvetett általános toldalékheurisztika és a fixture 417., 435. sorában megőrzött határeset a mérés eredménye, nem új hibátlanul kezelendő alaklista. | — | `docs/specs/2026-10-20-r5-pontozo-korpusz.md:1` · #334 | — | — | — |
| R-TERV-399 | Ciklus 8 — a számolás-ellenőrzők két mért hamis jelzése (címke-kettőspont, maradékos osztás) | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A hibás számolási állítást már a kiadás előtti kapu szűrje ki | `docs/specs/2026-10-21-c8-szamolas-kapu.md:23`, `docs/specs/2026-10-21-c8-szamolas-kapu-vegrehajtas.md:1` | #364, 2436/2436. source/tests/c8-szamolas-kapu.test.ts:8, :14, :27, :35. | — | `docs/specs/2026-10-21-c8-szamolas-kapu.md:1` · #364 | — | — | — |
| R-TERV-400 | Feleletválasztós válaszok kevert megjelenítése | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A helyes válasz helye kiegyenlítetten változzon a kulcs és a pontozás megőrzésével | `docs/specs/2026-11-02-valasz-keveres.md:58`, `docs/specs/2026-11-02-valasz-keveres-vegrehajtas.md:5` | 04cd8d4c a két mért eloszlást is közli (2/2/1/2 és 25/25/24/24). source/shared/option-order.ts:66, source/tests/option-shuffle.spec.ts:14, :42. | — | `docs/specs/2026-11-02-valasz-keveres.md:1` · #375 | — | — | — |
| R-TERV-403 | Eredmény-e-mail: a kvíz eredménye is menjen el, kérdésenkénti részletezéssel | KÉSZ | tananyag | P1. A címzettnek el kell jutnia a neki szánt értesítésnek vagy eredménynek. | A lecke eredménye a tényleges szerveres értékeléssel és az ismételt küldés kezelésével kerüljön levélbe | `docs/specs/2026-11-17-eredmeny-email-kviz.md:79`, `docs/specs/2026-11-17-eredmeny-email-kviz-vegrehajtas.md:9` | Az eredeti S1a összes E1–E7 pontja a teljes kvízkörre vonatkozik. #496 (b7622adf), 3/3 böngészőpróba, source/shared/quiz-round.ts:6, source/tests/lesson-result-email-quiz.spec.ts:29, :61. A megszakított kör ági bővítése P-024. | — | `docs/specs/2026-11-17-eredmeny-email-kviz.md:1` · #496 | — | — | P-024, P-025 |
| R-TERV-404 | Nyílt feladat: a tömör, de tartalmilag teljes válasz fél pontot kap (nem nullát), egyértelmű üzenettel | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A rövid, de tartalmilag teljes válasz a megállapodás szerinti részpontot kapja | `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md:140`, `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz-vegrehajtas.md:9` | E1–E8. A terv 157–164. sora pontonként zár, #509 (a1342ba8) nyolc ellenpróbát és három böngészőpróbát rögzít. source/shared/lesson-experience-score.ts:175 és source/tests/open-answer-short.test.ts:32, :44. | — | `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md:1` · #509 | — | — | P-027 |
| R-TERV-405 | Szöveges válasz: a mondatvégi írásjel, a szóköz és a tipográfiai változat ne számítson hibának | KÉSZ | tananyag | P2. Az eredmény befolyásolja a tanuló pontszámát vagy visszajelzését. | A válasz érdemi helyességét ne változtassa meg az opcionális mondatvégi írásjel | `docs/specs/2026-11-17-szoveges-valasz-irasjel.md:89`, `docs/specs/2026-11-17-szoveges-valasz-irasjel-vegrehajtas.md:18` | E1–E6 és E4b. #493 (56d1a9af), source/shared/text-answer.ts:19, :37, source/tests/text-answer.test.ts:42, :60, :85, source/tests/fill-blank-punctuation.spec.ts:18 és source/tests/scoring-v2.test.ts:220–237. | — | `docs/specs/2026-11-17-szoveges-valasz-irasjel.md:1` · #493 | — | — | — |
