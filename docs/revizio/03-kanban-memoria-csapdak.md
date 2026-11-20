# 03 · Kanban, memória, csapdák és működési szabályok

2026. november 20. · A vizsgált főág `origin/main`, commit `d9d1e6c6d706a0c96b1f16d5fd44db2c7b09a1d8`. A régebbi Claude-átiratok már nincsenek meg. A megmaradt tulajdonosi üzenetek november elejétől követhetők. A korábbi időszakot a kanban, a verziózott és a helyi memória, a tervek és a git-előzmények dokumentálják.

A kanban-azonosító és a PR-szám külön számtér. A táblastátusz a mentett export állapota. A KÉSZ itt a kért változtatás statikusan igazolt jelenlétét vagy a dokumentált művelet igazolt lezárását jelenti. Új tesztfutás, éles lekérdezés és szolgáltatói mérés nem volt. Az ágjelzés a helyi git-objektumokra vonatkozik. A folytatási próbák a javító ügynök feladatai. A korábbi P-leltár és a D-döntések a `docs/websuli-potlasok` ágon olvashatók. Az alábbi nyitott tételek a mainhez és a konkrét forráselemhez adnak többletet.

A 394 revíziós tételből 106 főágon vagy dokumentált lezárással igazolt, 200 részben teljesült, 4 nem valósult meg, 27 csak ágon készült el, 8-at későbbi döntés írt felül, 49 ellenőrizetlen. A forrásmérleg 395 elsődleges elemet tartalmaz. A javítások kiindulópontjai közé tartozik a Studio-térképek tulajdonosi elkülönítése (R-KAN-011), a forrástartalom nélkül bankot bővítő segédprogram (R-KAN-526) és a merge előtti review-szálak teljes bejárása (R-KAN-432).

## Csapdakatalógus

A 75 főági bejegyzésből 47 esetben marad kézi ellenőrzés, külön mérés vagy javítás. A rendeltetésszerűen kézi lépéseknél a következő próba a szabály alkalmazását igazolja. A hivatkozások a fejlécben rögzített főági revízióhoz tartoznak.

### R-KAN-302 Kanban-adatbázis feloldása (C-02)

- **Azonosító** — R-KAN-302
- **Cím** — Kanban-adatbázis feloldása
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — A kanban CLI-t a WEBSULI gyökeréből futtasd, üres lista előtt nézd meg, melyik táblát nyitotta meg.
- **Forrás** — `docs/agent-csapdak.md:114`, `docs/kanban.md:9`, `docs/kanban.md:14`
- **Mi van kész** — A CLI helyét változó adja meg, a tábla feloldási sorrendje dokumentált.
- **Mi hiányzik** — Az adott gépen kiválasztott tábla igazolása rendeltetésszerűen kézi.
- **Folytatás helye** — `docs/kanban.md`
- **Következő lépés** — `docs/kanban.md` — A dokumentált CLI-val egy eldobható táblából és repógyökérből ugyanazt a próbakártyát olvasd vissza.
- **Függőség / ütközés** — Külön telepített CLI és teszttábla kell.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-303 Félbehagyott spec és review-jegy (C-03)

- **Azonosító** — R-KAN-303
- **Cím** — Félbehagyott spec és review-jegy
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — Feladat maradhat félkészen két munkamenet között.
- **Eredeti utasítás / cél** — Session elején `git status --short` + kanban `list`, az untracked spec / `-vegrehajtas.md` félbehagyott munka: befejezni.
- **Forrás** — `docs/agent-csapdak.md:123`, `AGENTS.md:136`
- **Mi van kész** — A session eleji söprés szerepel a vezérlőfájlban.
- **Mi hiányzik** — A szabályból nem következik egy adott munkamenet lezárása. Ez kézi egyeztetés.
- **Folytatás helye** — `AGENTS.md`
- **Következő lépés** — `AGENTS.md` — Az előírt söprést próbáld félkész speccel és hozzá tartozó review-jeggyel. Mindkettő jelenjen meg a helyi átadóban.
- **Függőség / ütközés** — A kanban és Git külön nyilvántartás.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-304 Nagy parancskimenet szűrése (C-04)

- **Azonosító** — R-KAN-304
- **Cím** — Nagy parancskimenet szűrése
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Hosszú parancskimenetet szűrj (`--quiet`, `--shortstat`, `| tail`), ne öntsd a kontextusba.
- **Forrás** — `docs/agent-csapdak.md:132`, `docs/agent-csapdak.md:135`
- **Mi van kész** — A katalógus rövid diffstatot és kimenetszűrést ír elő.
- **Mi hiányzik** — A kimenet olvashatósága parancsválasztási kérdés, rendeltetésszerűen kézi.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — Nagy helyi diffen vesd össze a rövid összesítő fájlszámát a teljes statisztikával.
- **Függőség / ütközés** — A részletes diff hibakereséskor szükséges lehet.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-305 Projektmemória szinkronja (C-05)

- **Azonosító** — R-KAN-305
- **Cím** — Projektmemória szinkronja
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Tulajdonosi direktíva egy körben: repó-vezérlőfájl + projektmemória (+ globális CLAUDE.md, ha minden repóra szól).
- **Forrás** — `docs/agent-csapdak.md:138`, `docs/agent-csapdak.md:142`
- **Mi van kész** — A szabály megnevezi a projektmemória és a repó szerepét.
- **Mi hiányzik** — A géphez kötött memória frissessége a főági fájlból nem igazolható.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — Új helyi profilból keress rá egy ismert tulajdonosi szabályra, és hasonlítsd össze a verziózott előírással.
- **Függőség / ütközés** — A profilonkénti és globális beállítás tulajdonosi hatókör.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-306 Git-identitás új gépen (C-06)

- **Azonosító** — R-KAN-306
- **Cím** — Git-identitás új gépen
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Git-identitás hiányában parancsonként `git -c user.name=… -c user.email=… commit`, tartós beállítás a tulajdonosé.
- **Forrás** — `docs/agent-csapdak.md:145`, `docs/agent-csapdak.md:149`
- **Mi van kész** — Dokumentált a parancs hatókörére szóló identitás.
- **Mi hiányzik** — A gép Git-konfigurációjának ellenőrzése kézi.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — Eldobható repóban üres helyi identitással próbálj mintakommitot a dokumentált módon, és ellenőrizd a commit metaadatát.
- **Függőség / ütközés** — Tartós identitásról a tulajdonos dönt.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-308 Név szerinti staging ágváltás után (C-08)

- **Azonosító** — R-KAN-308
- **Cím** — Név szerinti staging ágváltás után
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — Helyi állomány kerülhet a commitba.
- **Eredeti utasítás / cél** — Ágváltás után név szerinti `git add <fájlok>`, nem `git add -A`, commit előtt `git diff --cached --stat`.
- **Forrás** — `docs/agent-csapdak.md:164`, `.gitignore:69`
- **Mi van kész** — A helyi kanban állományait kizárja a verziózásból.
- **Mi hiányzik** — Más, nem ignorált helyi fájl kiválasztása továbbra is kézi döntés.
- **Folytatás helye** — `.gitignore`
- **Következő lépés** — `.gitignore` — Eldobható ágon egy kívánt és egy idegen mintafájllal nézd meg a név szerinti staged diffet.
- **Függőség / ütközés** — A két ág ignore-szabályai eltérhetnek.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-310 Review-javítás bejutása a főágba (C-10)

- **Azonosító** — R-KAN-310
- **Cím** — Review-javítás bejutása a főágba
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1 — A javítás kimaradhat a főágból.
- **Eredeti utasítás / cél** — Review-javítás közben az auto-merge kikapcsolva, „kész” előtt tartalom szerint ellenőrizni, hogy a javítás a mainen van.
- **Forrás** — `docs/agent-csapdak.md:182`, `scripts/qa/gates/pre-merge-gate.mjs:159`
- **Mi van kész** — A kapu olvassa a review-szálakat.
- **Mi hiányzik** — Az automatikus összevonás állapota és a squash utáni tartalmi egyezés külön ellenőrzendő.
- **Folytatás helye** — `scripts/qa/gates/pre-merge-gate.mjs`
- **Következő lépés** — `scripts/qa/gates/pre-merge-gate.mjs` — A társított pre-merge-gate.test.mjs próbában új HEAD mellett maradjon régi a review, majd a squash tartalmát is vesd össze.
- **Függőség / ütközés** — GitHub-állapot szükséges az éles döntéshez.
- **Kapcsolódó P-tétel** — P-044, P-067

### R-KAN-311 Visszaperjelek szerkesztés után (C-11)

- **Azonosító** — R-KAN-311
- **Cím** — Visszaperjelek szerkesztés után
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Regexet / többsoros kódot Edit eszközzel vagy szkriptfájllal írj, ne inline `sed`/heredoc-kal, utána visszaolvasás.
- **Forrás** — `docs/agent-csapdak.md:193`, `docs/agent-csapdak.md:197`
- **Mi van kész** — Leírt eljárás a regex célzott szerkesztése és nyers visszaolvasása.
- **Mi hiányzik** — Az eszközválasztás és a konkrét változás ellenőrzése kézi.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — Egy módosított regexhez próbálj szóhatáron és azon kívül illeszkedő mintát, majd olvasd vissza a tényleges bájtokat.
- **Függőség / ütközés** — A héj és a forrásnyelv eltérően kezeli az escape-et.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-314 Félbeszakadt rebase identitás nélkül (C-14)

- **Azonosító** — R-KAN-314
- **Cím** — Félbeszakadt rebase identitás nélkül
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Rebase / cherry-pick is `-c user.name/email`-lel, félbemaradt picknél `git commit -C <sha>`, majd `--continue`.
- **Forrás** — `docs/agent-csapdak.md:215`, `docs/agent-csapdak.md:218`
- **Mi van kész** — A katalógus a félbemaradt pick staged állapotát és a helyreállítás sorrendjét leírja.
- **Mi hiányzik** — A helyreállítás az adott munkafa kézi vizsgálatát igényli.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — Eldobható repóban, mesterséges identitással reprodukáld a megszakadt picket, és ellenőrizd a régi és az új fájltartalom egyezését.
- **Függőség / ütközés** — Csak eldobható próbán indokolt előidézni.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-315 Tanmenetsorrend tesztelvárása (C-15)

- **Azonosító** — R-KAN-315
- **Cím** — Tanmenetsorrend tesztelvárása
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Új teszt elvárását a szabályból számítsd (kommentben), ne a kimenetből, meglévő tesztet bukás elfedésére soha.
- **Forrás** — `docs/agent-csapdak.md:221`, `source/shared/curriculum-order.ts:14`, `source/tests/curriculum-order.spec.ts:34`
- **Mi van kész** — A múltra alkalmazott 1,5-ös súly és a várt sorrend visszakereshető.
- **Mi hiányzik** — A későbbi tesztelvárások független levezetése review-feladat.
- **Folytatás helye** — `source/shared/curriculum-order.ts`
- **Következő lépés** — `source/shared/curriculum-order.ts` — A 1,5-ös súllyal kézzel számolt két határeset sorrendjét ellenőrizd a meglévő böngészőtesztben.
- **Függőség / ütközés** — A tanévi viszonyítási időt rögzíteni kell a próbában.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-317 Review-k eredménye a legutolsó commiton (C-17)

- **Azonosító** — R-KAN-317
- **Cím** — Review-k eredménye a legutolsó commiton
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1 — Nyitott review-val kerülhet be hibás változás.
- **Eredeti utasítás / cél** — Összevonás előtt a review-botok eredményét is meg kell várni és megválaszolni, nem csak a CI-t.
- **Forrás** — `docs/agent-csapdak.md:237`, `scripts/qa/gates/pre-merge-gate.mjs:159`
- **Mi van kész** — A megoldatlan szálak lekérdezése része a kapunak.
- **Mi hiányzik** — A három review-szolgáltató friss és teljes válaszát a szállekérés önmagában nem igazolja.
- **Folytatás helye** — `scripts/qa/gates/pre-merge-gate.mjs`
- **Következő lépés** — `scripts/qa/gates/pre-merge-gate.mjs` — A pre-merge-gate.test.mjs próbáiban szerepeljen hiányzó botválasz, elavult HEAD és második lapra kerülő szál.
- **Függőség / ütközés** — A jóváhagyás és a szál lezárása eltérő GitHub-adat.
- **Kapcsolódó P-tétel** — P-044, P-067

### R-KAN-318 Éles telepítési állítás visszamérése (C-18)

- **Azonosító** — R-KAN-318
- **Cím** — Éles telepítési állítás visszamérése
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2 — Elavult kiadás szolgálhat az éles állítás alapjául.
- **Eredeti utasítás / cél** — Telepítési / éles állítás előtt Render MCP-vel és a `verify-render-*.mjs` szkriptekkel mérj, a beállítás a tulajdonos lépése.
- **Forrás** — `docs/agent-csapdak.md:249`, `scripts/qa/verify-render-revision.test.mjs:10`, `scripts/qa/verify-render-settings.test.mjs:47`
- **Mi van kész** — A revízió és a beállítás összevetése automatizált próbákkal rendelkezik.
- **Mi hiányzik** — A pillanatnyi szolgáltatói beállítás és telepített revízió külön olvasási mérést igényel.
- **Folytatás helye** — `scripts/qa/verify-render-revision.test.mjs`
- **Következő lépés** — `scripts/qa/verify-render-revision.test.mjs` — A két teszt mintáival ellenőrizd az eltérést, majd engedélyezett üzemeltetési körben hasonlítsd össze a tényleges telepítéssel.
- **Függőség / ütközés** — Aktuális szolgáltatói nézet és hozzáférés kell.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-319 Licenc igazolása az eredeti forrásból (C-19)

- **Azonosító** — R-KAN-319
- **Cím** — Licenc igazolása az eredeti forrásból
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — A felhasználási jog feltétele tévesen kerülhet a forrásjegyzékbe.
- **Eredeti utasítás / cél** — Licencet csak a forrás saját oldaláról rögzíts (különben UNVERIFIED), commit-üzenet fájlból, .NET-hez abszolút út.
- **Forrás** — `docs/agent-csapdak.md:260`, `docs/agent-csapdak.md:264`, `docs/agent-csapdak.md:269`
- **Mi van kész** — A licenc helyének ellenőrzése, fájlból olvasott commitüzenet és abszolút út dokumentált.
- **Mi hiányzik** — A forrásonkénti licencmegállapítás kézi, a kiadó általános gyakorlata nem elég hozzá.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — A katalógus módszerével válassz egy saját licencsort közlő és egy hiányos mintabejegyzést. Csak az első legyen igazolt.
- **Függőség / ütközés** — Az eredeti forrás és verziója határozza meg az eredményt.
- **Kapcsolódó P-tétel** — P-059

### R-KAN-320 Adatbázis-azonosság és tartalékmodell a méréseknél (C-20)

- **Azonosító** — R-KAN-320
- **Cím** — Adatbázis-azonosság és tartalékmodell a méréseknél
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1 — Érvénytelen lehet az adatbázis- és modellmérés.
- **Eredeti utasítás / cél** — Élő adatbázist használó mérés előtt csak olvasó azonosság-próba, ahol lehet, `file:` mód éles DB nélkül.
- **Forrás** — `docs/agent-csapdak.md:274`, `source/scripts/measure/single-run-measure.mts:42`
- **Mi van kész** — A mérő előkészített fájlforrást fogad.
- **Mi hiányzik** — A valóban használt élő adatbázis és modell ellenőrzése külön művelet.
- **Folytatás helye** — `source/scripts/measure/single-run-measure.mts`
- **Következő lépés** — `source/scripts/measure/single-run-measure.mts` — A fájlmód eredményét és egy tartalékmodellre váltást jelző mintakimenetet hasonlíts össze. A külön DB-próba téves sémát utasítson el.
- **Függőség / ütközés** — Éles kulcs vagy adat helyett tesztfixtúrák használhatók.
- **Kapcsolódó P-tétel** — P-033

### R-KAN-321 Borítóválasztás és helyi szerver adatforrása (C-21)

- **Azonosító** — R-KAN-321
- **Cím** — Borítóválasztás és helyi szerver adatforrása
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1 — A szerverindítás idegen adatbázist módosíthat.
- **Eredeti utasítás / cél** — Arculati képválasztás előtt a korábbi döntések (tesztek, spec) elolvasása, idegen DB-vel helyi szerver nem indul.
- **Forrás** — `docs/agent-csapdak.md:291`, `source/tests/stored-art.test.ts:21`, `docs/agent-csapdak.md:299`
- **Mi van kész** — Mentett arculat évfolyamsávjának ellenőrzésére teszt van.
- **Mi hiányzik** — Képválasztás előtti döntésellenőrzés és az indítási adatforrás azonossága kézi lépés.
- **Folytatás helye** — `source/tests/stored-art.test.ts`
- **Következő lépés** — `source/tests/stored-art.test.ts` — Futtasd a stored-art.test.ts sávpróbáját, majd eldobható, téves sémagyűjteménnyel ellenőrizd a szerver előfeltételét.
- **Függőség / ütközés** — A régi anyagok tárolt borítói visszafelé kompatibilisek kell maradjanak.
- **Kapcsolódó P-tétel** — P-028

### R-KAN-322 Betűtípus-minta valódi böngészőben (C-22)

- **Azonosító** — R-KAN-322
- **Cím** — Betűtípus-minta valódi böngészőben
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Tulajdonosi vizuális mintához privát Artifact vagy a repó Playwright-konfigja, fontcserénél szóhatáros keresés.
- **Forrás** — `docs/agent-csapdak.md:303`, `source/playwright.lesson-typography.config.ts:5`, `source/tests/lesson-typography.browser.ts:14`
- **Mi van kész** — Vite-alapú böngészőpróba ellenőrzi a tényleges betűcsaládot.
- **Mi hiányzik** — Az összes felhasználási hely és teszt felkutatása, illetve a tulajdonosi minta kiválasztása kézi.
- **Folytatás helye** — `source/playwright.lesson-typography.config.ts`
- **Következő lépés** — `source/playwright.lesson-typography.config.ts` — Egy családnév módosítása után keresd meg az összes font-family elvárást és futtasd az érintett Playwright-konfigurációkat.
- **Függőség / ütközés** — A mintaoldal betűfájljainak betöltődése a mérés feltétele.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-324 Hangvégpont CDN-, Range- és kvótafejlécei (C-24)

- **Azonosító** — R-KAN-324
- **Cím** — Hangvégpont CDN-, Range- és kvótafejlécei
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P2 — A szolgáltatói réteg felülírhatja a helyi választ.
- **Eredeti utasítás / cél** — Fejléc-alapú állítást (cache, CSP, CORS) az éles címen `curl -D -`-vel igazolj, ne a szerverkódból.
- **Forrás** — `docs/agent-csapdak.md:325`, `source/tests/speech-fallback.test.ts:48`, `source/tests/tts-audio-store.test.ts:78`
- **Mi van kész** — A tartománykérés, a gyorsítótár és a válaszkódok helyi próbái megvannak.
- **Mi hiányzik** — A CDN fejlécfelülírását és a proxy mögötti keretet élő olvasási mérés igazolja.
- **Folytatás helye** — `source/tests/speech-fallback.test.ts`
- **Következő lépés** — `source/tests/speech-fallback.test.ts` — A helyi 206-próba fejléceit külön engedélyezett körben vesd össze a közvetlen és a proxyzott végpontéval.
- **Függőség / ütközés** — A két útvonal és az éles CDN-konfiguráció szükséges.
- **Kapcsolódó P-tétel** — P-032

### R-KAN-325 Kliensazonosítás a proxylánc mögött (C-25)

- **Azonosító** — R-KAN-325
- **Cím** — Kliensazonosítás a proxylánc mögött
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1 — A helytelen proxybeállítás sok felhasználó kvótáját érintheti.
- **Eredeti utasítás / cél** — Új `rateLimit(` csak `clientIpKeyGenerator`-ral, IP-kulcsot ugyanazon kliens ismételt kérésével mérj, titoktár-írás tilos.
- **Forrás** — `docs/agent-csapdak.md:340`, `source/tests/client-ip.test.ts:160`, `source/tests/client-ip.test.ts:202`
- **Mi van kész** — Azonos és eltérő kliens keretmegosztását, valamint a szerveres korlátok bekötését őr vizsgálja.
- **Mi hiányzik** — A tényleges proxysorrend és üzemeltetői beállítás érvényessége telepítésfüggő.
- **Folytatás helye** — `source/tests/client-ip.test.ts`
- **Következő lépés** — `source/tests/client-ip.test.ts` — A helyi próba mellett ugyanarról a kliensről ismételt olvasással kövesd a számlálót, majd hasonlítsd össze a második kliensével.
- **Függőség / ütközés** — Külön üzemeltetési hozzáférés szükséges. Titokérték kiírása nélkül mérhető.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-326 Klienskompatibilitás és aszinkron útvonalhibák (C-26)

- **Azonosító** — R-KAN-326
- **Cím** — Klienskompatibilitás és aszinkron útvonalhibák
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1 — Egy kezeletlen útvonalhiba több kérést érinthet.
- **Eredeti utasítás / cél** — Kliensben nincs visszatekintő regex, új `async` útvonal `try/catch`-csel vagy `asyncRoute`-tal, ismétlődő hibára forrásőr.
- **Forrás** — `docs/agent-csapdak.md:368`, `source/tests/no-lookbehind-client.test.ts:63`, `source/server/lib/async-route.ts:11`
- **Mi van kész** — A kliens importgráfjára van regexőr, a szerveren közös hibakezelő burkoló.
- **Mi hiányzik** — Ezekből nem igazolható minden új útvonal bekötése, minden időzített feladat időzónája és a böngészőtesztkettős helyessége.
- **Folytatás helye** — `source/tests/no-lookbehind-client.test.ts`
- **Következő lépés** — `source/tests/no-lookbehind-client.test.ts` — A burkolt kezelőt elutasított ígérettel, a napablakot óraátállítással, a böngészőágat tényleges speak-hívásszámlálóval próbáld.
- **Függőség / ütközés** — Az egymástól független hibákat külön fixtúrával kell mérni.
- **Kapcsolódó P-tétel** — P-054

### R-KAN-327 Tételhez kötött gyártási javítás (C-27)

- **Azonosító** — R-KAN-327
- **Cím** — Tételhez kötött gyártási javítás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — Egy hibás tétel teljes újragyártást és többletköltséget válthat ki.
- **Eredeti utasítás / cél** — Drága teljes újragyártás csak tételhez nem köthető hibánál, naplózott okkal, azonosság-kulcs a teljes tartalomból.
- **Forrás** — `docs/agent-csapdak.md:393`, `source/tests/bank-cross-repair.test.ts:12`, `source/tests/bank-cross-repair.test.ts:68`, `source/tests/explain-paragraphs.test.ts:12`
- **Mi van kész** — Különböző opciók, célzott javítás és a több bekezdésből álló magyarázat tesztelve vannak a forrásban.
- **Mi hiányzik** — A teljes gyártás valós költsége és végső megjelenése ebből nem mérhető.
- **Folytatás helye** — `source/tests/bank-cross-repair.test.ts`
- **Következő lépés** — `source/tests/bank-cross-repair.test.ts` — Hibás kiválasztó kérdéssel számold a javítóhívásokat, majd a kész magyarázatot nézd meg az eldobható e2e-környezetben.
- **Függőség / ütközés** — A költségméréshez a ténylegesen használt modell azonosítása kell.
- **Kapcsolódó P-tétel** — P-033

### R-KAN-328 Fejezet-kisfilm elérése és hangidő (C-28)

- **Azonosító** — R-KAN-328
- **Cím** — Fejezet-kisfilm elérése és hangidő
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Publikált lecke JSON-ja fejléces végponton, nagy választ fájlba, ne a kontextusba, fájltartalmat íróeszközzel.
- **Forrás** — `docs/agent-csapdak.md:418`, `source/tests/lesson-clips.spec.ts:52`, `docs/agent-csapdak.md:424`
- **Mi van kész** — A klip lejátszása és hangvégen történő váltása böngészőtesztben szerepel.
- **Mi hiányzik** — A tényleges média hosszát, a publikált lecke fejlécét és a két navigációs módot külön kell mérni.
- **Folytatás helye** — `source/tests/lesson-clips.spec.ts`
- **Következő lépés** — `source/tests/lesson-clips.spec.ts` — Ismert hosszú médiafixtúrával ellenőrizd a széles és keskeny fejezetváltást, és vesd össze az ffprobe időt a forgatókönyvvel.
- **Függőség / ütközés** — Az éles tartalomhoz szükséges hozzáférés külön kezelendő.
- **Kapcsolódó P-tétel** — P-041

### R-KAN-329 Kisfilm minta, stílus és szolgáltatói korlát (C-29)

- **Azonosító** — R-KAN-329
- **Cím** — Kisfilm minta, stílus és szolgáltatói korlát
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — Egy hibás minta tömeges legyártása költséges.
- **Eredeti utasítás / cél** — Új látható / hallható funkciónál előbb egy valódi minta a tulajdonos elé, a repó arculati szabályai a terv részei.
- **Forrás** — `docs/agent-csapdak.md:438`, `source/tests/clip-style.test.ts:14`, `source/tests/lesson-clip.test.ts:80`, `source/tests/lesson-clips.spec.ts:9`
- **Mi van kész** — Korosztályos stíluspróba, szolgáltatói párhuzamossági korlát és SW nélkül futó böngészőteszt van.
- **Mi hiányzik** — A kép-hang minta elfogadása emberi döntés. A teljes gyártás memória- és tárolási költségét a minta nem méri.
- **Folytatás helye** — `source/tests/clip-style.test.ts`
- **Következő lépés** — `source/tests/clip-style.test.ts` — Jóváhagyott mintával kalibráld a mérőt, majd hasonlítsd össze a gyártott média méretét és hangparamétereit.
- **Függőség / ütközés** — A tulajdonos érzékszervi szemléje és a szolgáltatói keret feltétel.
- **Kapcsolódó P-tétel** — P-041

### R-KAN-330 Mobil játékmérő helyi és CI-környezetben (C-30)

- **Azonosító** — R-KAN-330
- **Cím** — Mobil játékmérő helyi és CI-környezetben
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — A csak CI-ben jelentkező hibát helyileg zöldnek láthatjuk.
- **Eredeti utasítás / cél** — A helyi zöld nem a CI zöldje, környezeti zajt csak szűk, dokumentált mintával szűrj, saját scratchpad-almappa.
- **Forrás** — `docs/agent-csapdak.md:478`, `source/tests/support/game-mobile-quality.ts:46`, `source/tests/support/game-mobile-quality.ts:75`
- **Mi van kész** — A 48 pixeles cél és az animáció stabilitásának ellenőrzése megtalálható.
- **Mi hiányzik** — A terhelt CI és a védett munkamappa viselkedése külön futási feltétel.
- **Folytatás helye** — `source/tests/support/game-mobile-quality.ts`
- **Következő lépés** — `source/tests/support/game-mobile-quality.ts` — Épített alkalmazással, szoftveres WebGL-lel nyisd meg a beállítási panelt és mérd meg a legkisebb érintési célt.
- **Függőség / ütközés** — A helyi és CI-böngésző eltéréseit a jegyzőkönyvben fel kell tüntetni.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-331 Szóbank szemantikai ellenőrzése (C-31)

- **Azonosító** — R-KAN-331
- **Cím** — Szóbank szemantikai ellenőrzése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — A téves jelentés tanulói visszajelzést torzít.
- **Eredeti utasítás / cél** — A vak megoldó után kötelező idióma- és szinonima-audit a teljes bankon, a `hu` nem tartalmazhatja a term-et.
- **Forrás** — `docs/agent-csapdak.md:493`, `source/tests/vocab-bank-cognates.test.ts:46`, `source/tests/vocab-distractor-overlap.test.ts:123`
- **Mi van kész** — A triviálisan azonos szavak és ütköző elterelők egy része géppel szűrt.
- **Mi hiányzik** — Az idiómák és a különböző szintek azonos jelentése kézi nyelvi auditot igényel.
- **Folytatás helye** — `source/tests/vocab-bank-cognates.test.ts`
- **Következő lépés** — `source/tests/vocab-bank-cognates.test.ts` — A szóbank-ellenőrzők után keresd meg a több szinten előforduló jelentéseket, és a vak válasz tényleges szövegét vesd össze a felkínált opcióval.
- **Függőség / ütközés** — Nyelvenként külön jelentésvizsgálat szükséges.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-334 Játékfedőrétegek, időzítések és mobilérintés (C-34)

- **Azonosító** — R-KAN-334
- **Cím** — Játékfedőrétegek, időzítések és mobilérintés
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2 — Fedőréteg takarhatja el a játék vezérlését.
- **Eredeti utasítás / cél** — Fekvő tájolású játék kérése az e2e-ben kezelve, késleltetett írás funkcionális frissítéssel vagy ref-ből.
- **Forrás** — `docs/agent-csapdak.md:545`, `source/tests/tornado-material-unseen.test.ts:69`, `docs/agent-csapdak.md:553`
- **Mi van kész** — A valódi kérdésválasztó a megfelelő forráskeverést több húzással méri.
- **Mi hiányzik** — A helyes választás nem bizonyítja a háttérfókusz tiltását vagy a kétujjas kezelés helyességét minden játékban.
- **Folytatás helye** — `source/tests/tornado-material-unseen.test.ts`
- **Következő lépés** — `source/tests/tornado-material-unseen.test.ts` — A katalógus játékszeletein álló és fekvő nézetben nyiss fedőréteget, és próbálj a háttérre fókuszálni, illetve kétujjas eseményt küldeni.
- **Függőség / ütközés** — A valódi eszközméret és a játék tájolása számít.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-337 A végrehajtási utasítás commitjának sorrendje (C-37)

- **Azonosító** — R-KAN-337
- **Cím** — A végrehajtási utasítás commitjának sorrendje
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — Utólagos tervvel elveszhet a végrehajtási sorrend bizonyítéka.
- **Eredeti utasítás / cél** — Az ELSŐ commit a végrehajtási fájl saját állapotsora, a kód utána, push előtt `three-phase-check.mjs`.
- **Forrás** — `docs/agent-csapdak.md:597`, `scripts/qa/three-phase-check.test.mjs:18`, `scripts/qa/three-phase-check.test.mjs:26`
- **Mi van kész** — A kód után érkező végrehajtási fájlt a teszt elutasítja, egysoros javításra dokumentált kivétel él.
- **Mi hiányzik** — A kaputesztből nem igazolható, hogy minden szelet első commitja kizárólag a saját állapotsorát tartalmazza.
- **Folytatás helye** — `scripts/qa/three-phase-check.test.mjs`
- **Következő lépés** — `scripts/qa/three-phase-check.test.mjs` — Az ellenőrző fixtúrájába kerüljön csak állapotsoros első commit és ellenpárként később hozzáadott állapotsor.
- **Függőség / ütközés** — A dokumentált kivételt a vizsgálatban külön kell kezelni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-338 Friss munkafa natív telepítése (C-38)

- **Azonosító** — R-KAN-338
- **Cím** — Friss munkafa natív telepítése
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2 — A helyi ellenőrzés natív induláskor leállhat.
- **Eredeti utasítás / cél** — Friss munkafában `npm ci --prefix source --ignore-scripts`, a helyben bukó `native-arch` tesztet jelenteni, nem megkerülni.
- **Forrás** — `docs/agent-csapdak.md:607`, `.github/workflows/ci.yml:144`, `docs/agent-csapdak.md:612`
- **Mi van kész** — Windows CI alatt a telepítés teljes npm ci lépéssel megy.
- **Mi hiányzik** — Az ignore-scripts kerülőút után a natív modulok működése helyben nincs igazolva.
- **Folytatás helye** — `.github/workflows/ci.yml`
- **Következő lépés** — `.github/workflows/ci.yml` — Tiszta munkafán, architektúránként futtasd a teljes telepítést és az azt követő doctor:arch próbát.
- **Függőség / ütközés** — Gépenként telepített node_modules és a natív fordítás előfeltételei kellenek.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-339 Figyelőhurok külső jq nélkül (C-39)

- **Azonosító** — R-KAN-339
- **Cím** — Figyelőhurok külső jq nélkül
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Git Bashben nincs `jq`: `gh … --json … --jq`, figyelő-hurok előtt a lekérdezést egyszer kézzel lefuttatni.
- **Forrás** — `docs/agent-csapdak.md:616`, `docs/agent-csapdak.md:619`
- **Mi van kész** — A GitHub CLI beépített szűrője és az egyszeri előpróba dokumentált.
- **Mi hiányzik** — A konkrét lekérdezés kimenetének első használat előtti ellenőrzése kézi.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — A figyelő indítása előtt a dokumentált szűrőt futtasd ismert fixtúrán, majd hibás mezővel ellenőrizd a hiba felismerését.
- **Függőség / ütközés** — A GitHub CLI saját szűrőjét és a külső binárist külön kell kezelni.
- **Kapcsolódó P-tétel** — P-060

### R-KAN-342 Kérdéssáv célmérete és állapotkezelése (C-42)

- **Azonosító** — R-KAN-342
- **Cím** — Kérdéssáv célmérete és állapotkezelése
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2 — A vezérlő érintéssel használhatatlan lehet.
- **Eredeti utasítás / cél** — Mért elem belépő animációja `opacity` / `translate`, nem `scale`, `eslint-disable` csak a ténylegesen jelzett szabályra.
- **Forrás** — `docs/agent-csapdak.md:646`, `source/tests/game-play-question-ui.test.ts:73`, `source/tests/support/game-mobile-quality.ts:75`
- **Mi van kész** — A megoldáskijelzés és a Miért időtartamára, illetve a stabil célméretre van próba.
- **Mi hiányzik** — Az összes régi CSS-szabály és belépő animáció hatását a vezérlőegységteszt nem méri.
- **Folytatás helye** — `source/tests/game-play-question-ui.test.ts`
- **Következő lépés** — `source/tests/game-play-question-ui.test.ts` — A kérdéssávot valódi mobilnézetben, az animáció első képkockáján és a Miért határidejekor mérd. Az érintési méret végig maradjon megfelelő.
- **Függőség / ütközés** — A közös CSS és a játékspecifikus stílus együtt hat.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-344 Tantárgyi tények és hibás helyesírási opciók (C-44)

- **Azonosító** — R-KAN-344
- **Cím** — Tantárgyi tények és hibás helyesírási opciók
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — Helyes tanulói válasz minősülhet hibásnak.
- **Eredeti utasítás / cél** — Bank forrásból, tételenkénti forrás-megjegyzéssel, a „hibás” helyesírási opciót hunspell ellenőrzi, audit az első körben.
- **Forrás** — `docs/agent-csapdak.md:681`, `source/tests/grade-quiz-bank-coverage.test.ts:256`
- **Mi van kész** — A magyar szótár ellenőrzi az egyszavas helyes és hibás opciókat.
- **Mi hiányzik** — A konkrét irodalmi tény vagy homonima megítélése a forrás és szövegkörnyezet kézi ellenőrzését igényli.
- **Folytatás helye** — `source/tests/grade-quiz-bank-coverage.test.ts`
- **Következő lépés** — `source/tests/grade-quiz-bank-coverage.test.ts` — A szótárpróba mellé végy homonimát és egy forrásból igazolt tantárgyi kérdést. Külön vizsgáld mind a négy állítást.
- **Függőség / ütközés** — Többszavas és valódi, eltérő jelentésű alakokra a szótár önmagában kevés.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-345 Évfolyambank magyarázatainak ellenőrzése (C-45)

- **Azonosító** — R-KAN-345
- **Cím** — Évfolyambank magyarázatainak ellenőrzése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — A helyes kulcs mellett hibás magyarázat maradhat.
- **Eredeti utasítás / cél** — A vak megoldó `chosen` mezőjét kézzel írja, a tartalmi bizonyíték a forrásalapú audit, meglévő tesztet nem lazítunk.
- **Forrás** — `docs/agent-csapdak.md:698`, `source/tests/grade-quiz-bank.test.ts:122`, `source/tests/grade-quiz-bank-coverage.test.ts:193`
- **Mi van kész** — Van sorszámhivatkozás-próba és a játékkal közös olvashatósági szűrő.
- **Mi hiányzik** — A vak válasz helyessége nem igazolja a magyarázat járulékos tényállításait.
- **Folytatás helye** — `source/tests/grade-quiz-bank.test.ts`
- **Következő lépés** — `source/tests/grade-quiz-bank.test.ts` — Az olvashatósági teszt után egy kiválasztott magyarázat állításait egyenként ellenőrizd, és vess össze kézzel rögzített válaszszöveget az opciókkal.
- **Függőség / ütközés** — Tartalmi ellenőrzéshez az elsődleges tantárgyi forrás kell.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-346 Unicode-jelek és párhuzamos adminfelület-tesztek (C-46)

- **Azonosító** — R-KAN-346
- **Cím** — Unicode-jelek és párhuzamos adminfelület-tesztek
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Unicode-tartomány forrásban `\p{…}` kategóriával, ne `\uXXXX`-szel (az eszközparaméter dekódolja), `cat -A` ellenőrzés.
- **Forrás** — `docs/agent-csapdak.md:725`, `source/tests/nickname-filter.test.ts:13`, `source/tests/admin-korszerusites.spec.ts:22`, `source/tests/admin-korszerusites.test.ts:49`
- **Mi van kész** — A fixtúra kódpontot használ, és a 17 fület unit- és böngészőteszt is ellenőrzi.
- **Mi hiányzik** — Az összes érintett teszt és a nyers Unicode-karakterek ellenőrzése változásonként kézi.
- **Folytatás helye** — `source/tests/nickname-filter.test.ts`
- **Következő lépés** — `source/tests/nickname-filter.test.ts` — Kódpontból képzett sorelválasztóval futtasd a szűrőpróbát, fülszám módosítása után pedig mindkét említett admintesztet.
- **Függőség / ütközés** — A count-egyezést a két különböző futtatóban kell ellenőrizni.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-347 Aktív futások ellenőrzése közvetlenül a telepítés előtt (C-47)

- **Azonosító** — R-KAN-347
- **Cím** — Aktív futások ellenőrzése közvetlenül a telepítés előtt
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1 — Futó gyártás szakadhat meg.
- **Eredeti utasítás / cél** — Az aktív-futás őrt KÖZVETLENÜL minden merge előtt, zöld PR-ok egy ablakban, hiányzó számláló = hiba, nem nulla.
- **Forrás** — `docs/agent-csapdak.md:740`, `scripts/qa/active-runs-guard.sh:58`, `scripts/qa/gates/pre-merge-gate.test.mjs:134`
- **Mi van kész** — Hiányos mérésnél a szkript hibát jelez, aktív meccsre a merge-kapu tesztje elutasítást vár.
- **Mi hiányzik** — A két pillanat közé eső új gyártást a korábbi lekérdezés nem zárja ki.
- **Folytatás helye** — `scripts/qa/active-runs-guard.sh`
- **Következő lépés** — `scripts/qa/active-runs-guard.sh` — Hiányzó számlálóval és két egymást követő, eltérő aktívfutás-állapottal próbáld a döntést.
- **Függőség / ütközés** — A telepítési ablak és az éles kapcsolók üzemeltetési döntések.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-348 Párhuzamos szeletek közös sorszámai (C-48)

- **Azonosító** — R-KAN-348
- **Cím** — Párhuzamos szeletek közös sorszámai
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — A migrációs sorszám ütközése blokkolhatja az integrációt.
- **Eredeti utasítás / cél** — Szelet-PR nem ír a közös, hozzáfűzős katalógusba, a csapda-javaslat a zárójelentésbe, az orkesztrátor gyűjti.
- **Forrás** — `docs/agent-csapdak.md:757`, `docs/agent-csapdak.md:763`, `docs/agent-csapdak.md:769`
- **Mi van kész** — A katalógus bővítéséért felelős szerep és az ütköző migrációs sorszám esete dokumentált.
- **Mi hiányzik** — Az egymás mellett készülő szeletek sorszámfoglalása szervezési feladat.
- **Folytatás helye** — `docs/agent-csapdak.md`
- **Következő lépés** — `docs/agent-csapdak.md` — Két próbaágon azonos migrációs sorszámot és katalógushorgonyt használva ellenőrizd, hogy a próbaösszevonás kimutatja-e az ütközést.
- **Függőség / ütközés** — Az összes érintett párhuzamos ág ismerete kell.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-349 Főági változás utáni újramérés (C-49)

- **Azonosító** — R-KAN-349
- **Cím** — Főági változás utáni újramérés
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — A megváltozott közös réteg több fogyasztót érint.
- **Eredeti utasítás / cél** — A PR saját zöld CI-ja nem garancia: közös réteg változása után main beolvasása és újrafuttatás, ingadozó tesztre jegy.
- **Forrás** — `docs/agent-csapdak.md:774`, `scripts/qa/gates/pre-merge-gate.test.mjs:61`
- **Mi van kész** — A main elmozdulása repoőrnél hibát, más esetben figyelmeztetést eredményezhet.
- **Mi hiányzik** — A közös CSS vagy motor minden fogyasztójának újramérését ez nem bizonyítja.
- **Folytatás helye** — `scripts/qa/gates/pre-merge-gate.test.mjs`
- **Következő lépés** — `scripts/qa/gates/pre-merge-gate.test.mjs` — Próbáld ki a main-elmozdulást a meglévő kaputeszttel, majd közös CSS-változásnál ismételd meg az érintett játék e2e-próbáját.
- **Függőség / ütközés** — Az új head és a közben változó main együtt határozza meg az ellenőrzést.
- **Kapcsolódó P-tétel** — P-044, P-050

### R-KAN-350 Visszaperjel és sorvég bájtpontos visszaolvasása (C-50)

- **Azonosító** — R-KAN-350
- **Cím** — Visszaperjel és sorvég bájtpontos visszaolvasása
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Visszaperjeles szöveg csak Edit/Write-tal, bájtszintű visszaolvasás, szkriptes cserénél `git diff --stat` ellenőrzés.
- **Forrás** — `docs/agent-csapdak.md:789`, `.gitattributes:2`, `docs/agent-csapdak.md:795`
- **Mi van kész** — A shell-szkriptek LF-sorvégét a Git szabályozza.
- **Mi hiányzik** — Más fájlok regexének, visszaperjeleinek és változatlan sorvégeinek ellenőrzése kézi.
- **Folytatás helye** — `.gitattributes`
- **Következő lépés** — `.gitattributes` — CRLF-es mintafájl egy sorát módosítva vesd össze a bájtokat és a diff méretét. Az érintetlen sorok maradjanak bájtra azonosak.
- **Függőség / ütközés** — A szkriptfájl típusa és a Git-sorvégkonfiguráció meghatározó.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-353 Szólétra kérésgyakorisága, forráskeverése és gombmérete (C-53)

- **Azonosító** — R-KAN-353
- **Cím** — Szólétra kérésgyakorisága, forráskeverése és gombmérete
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2 — A hosszú válasz vagy gyors kérésismétlés akadályozhatja a játékost.
- **Eredeti utasítás / cél** — Átírt játéknál előbb `grep` a régi `index.css`-szabályokra, kijelzés alatt képkockánként ne kérj állapotot.
- **Forrás** — `docs/agent-csapdak.md:838`, `source/client/src/pages/WordLadderHuEn.tsx:642`, `source/client/src/pages/WordLadderHuEn.tsx:1035`
- **Mi van kész** — A forrásválasztás minden második új tételnél szóbankot kérhet, függő kérés mellett nem generál újabbat.
- **Mi hiányzik** — A régi CSS-szelektorok tényleges hatását és a ritka véletlen hibát csak ismételt futás méri.
- **Folytatás helye** — `source/client/src/pages/WordLadderHuEn.tsx`
- **Következő lépés** — `source/client/src/pages/WordLadderHuEn.tsx` — Hosszú felirattal mérd a gomb tényleges magasságát és a felülíró CSS-t, majd ismételd tízszer a vocab-cross-game-log.spec.ts megfelelő esetét.
- **Függőség / ütközés** — A szóbank csak rendelkezésre álló alkalmas tételből tud választani.
- **Kapcsolódó P-tétel** — P-011, P-012

### R-KAN-354 Megváltozott válaszkulcs újraellenőrzése (C-54)

- **Azonosító** — R-KAN-354
- **Cím** — Megváltozott válaszkulcs újraellenőrzése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2 — Két védhető válasz téves pontozást eredményezhet.
- **Eredeti utasítás / cél** — Minden `keyChanged` tétel újra-vak körbe, magyar szóhatár `(?!\p{L})` + `u`, nem `\b`.
- **Forrás** — `docs/agent-csapdak.md:853`, `source/tests/grade-quiz-bank-coverage.test.ts:152`, `docs/agent-csapdak.md:858`
- **Mi van kész** — A tiltott opció szűrője magyar betű utáni Unicode-határt kezel.
- **Mi hiányzik** — A helyes kulcs újravakítása és minden elterelő tarthatatlansága kézi tartalmi bizonyítékot igényel.
- **Folytatás helye** — `source/tests/grade-quiz-bank-coverage.test.ts`
- **Következő lépés** — `source/tests/grade-quiz-bank-coverage.test.ts` — Kulcscsere után külön auditor igazolja az eredeti forrás alapján mind a négy opciót, majd független megoldó válaszoljon újra.
- **Függőség / ütközés** — A megoldó ne kapja meg az integrátori választ.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-360 Adminjog és munkafához kötött tesztelés (C-60)

- **Azonosító** — R-KAN-360
- **Cím** — Adminjog és munkafához kötött tesztelés
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1 — Az elavult döntés hozzáférési jogot érint.
- **Eredeti utasítás / cél** — Worktree-ben minden abszolút út a munkafa alatt, a teszt a saját átirányítást kapja el, negatív cache nem lehet fail-open.
- **Forrás** — `docs/agent-csapdak.md:942`, `source/tests/admin-allowlist-db.integration.ts:204`, `source/tests/admin-allowlist-db.integration.ts:215`
- **Mi van kész** — A listáról levétel következő kérésnél érvényesül, a hibás lista kezelése külön integrációs próba.
- **Mi hiányzik** — A munkafa helyessége és az átirányítás első lépésének vizsgálata kézi környezeti előfeltétel.
- **Folytatás helye** — `source/tests/admin-allowlist-db.integration.ts`
- **Következő lépés** — `source/tests/admin-allowlist-db.integration.ts` — Az admin-allowlist.spec.ts futásakor csak a saját átirányítási választ fogd el, és a munkafától független tesztkonfigurációban is ellenőrizd az első választ.
- **Függőség / ütközés** — Hálózati bejelentkezés és működő külső azonosító nem szükséges ehhez a próbához.
- **Kapcsolódó P-tétel** — Nincs azonosított közvetlen P-tétel.

### R-KAN-361 Repószintű címőr és párhuzamos ágak (C-61)

- **Azonosító** — R-KAN-361
- **Cím** — Repószintű címőr és párhuzamos ágak
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — Az elavult őr több nyitott ágat érinthet.
- **Eredeti utasítás / cél** — Repó-szintű őrt a friss mainen és a nyitott PR-ágakon is futtatni összevonás előtt, kivétel pontos listával, nem előtaggal.
- **Forrás** — `docs/agent-csapdak.md:960`, `source/tests/no-real-emails-guard.test.ts:79`, `scripts/qa/gates/pre-merge-gate.test.mjs:61`
- **Mi van kész** — A fájlhoz kötött kivétel és a főág elmozdulásának felismerése forrásban igazolt.
- **Mi hiányzik** — Minden nyitott ág előzetes vizsgálata külön összehangolás.
- **Folytatás helye** — `source/tests/no-real-emails-guard.test.ts`
- **Következő lépés** — `source/tests/no-real-emails-guard.test.ts` — Eldobható főági és két párhuzamos munkafán futtasd az őrt. Hasonló előtagú, listán kívüli szintetikus cím bukjon.
- **Függőség / ütközés** — Az aktuális áglista és a kivétellista pontos fájlhatára szükséges.
- **Kapcsolódó P-tétel** — P-023, P-044

### R-KAN-362 Új commit a már zöld CI után (C-62)

- **Azonosító** — R-KAN-362
- **Cím** — Új commit a már zöld CI után
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — Zöld CI után nincs további push (doksi sem), a mondanivaló a zárójelentésbe / PR-leírásba megy.
- **Forrás** — `docs/agent-csapdak.md:972`, `.github/workflows/ci.yml:6`, `docs/agent-csapdak.md:978`
- **Mi van kész** — Az új PR-változás ellenőrzést indít, az utolsó push megválasztására van kézi szabály.
- **Mi hiányzik** — A változatlan fej fenntartása rendeltetésszerűen emberi vagy orkesztrátori döntés.
- **Folytatás helye** — `.github/workflows/ci.yml`
- **Következő lépés** — `.github/workflows/ci.yml` — A merge-kapu próbájában dokumentációs commit után a régi HEAD sikeres futását ne fogadja el a döntés.
- **Függőség / ütközés** — Új commit után a korábbi futás más tartalmat igazol.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-368 Újracsatlakozási token és elveszett nyugták (C-68)

- **Azonosító** — R-KAN-368
- **Cím** — Újracsatlakozási token és elveszett nyugták
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P2 — A kliens megszakadás után elveszítheti a helyét.
- **Eredeti utasítás / cél** — Token-forgatás csak nyugtával, kemény türelmi korláttal, protokolljavításnál véletlen állapottér-próba push előtt.
- **Forrás** — `docs/agent-csapdak.md:1025`, `source/tests/rt-gateway.test.ts:293`, `source/tests/rt-gateway.test.ts:344`
- **Mi van kész** — Elveszett és többször elvesző nyugtára, valamint a kemény türelmi határra célzott teszt van.
- **Mi hiányzik** — Véletlen műveletsorrendeket bejáró állapottérpróba nincs ezekkel a tesztekkel igazolva.
- **Folytatás helye** — `source/tests/rt-gateway.test.ts`
- **Következő lépés** — `source/tests/rt-gateway.test.ts` — Rögzített seedű generátorral váltogasd a próbában a lokális tokenállapotot, a kézbesítést és a nyugtát. A kliens állapota kövesse a protokollt.
- **Függőség / ütközés** — A fixtúra órája és a türelmi határ legyen determinisztikus.
- **Kapcsolódó P-tétel** — P-018

### R-KAN-369 Kérdésbank hideg építése a célgépen (C-69)

- **Azonosító** — R-KAN-369
- **Cím** — Kérdésbank hideg építése a célgépen
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1 — A hideg célgépes mérés meghaladta a célt.
- **Eredeti utasítás / cél** — Listázó végpont ne olvassa be a teljes tartalmat kérésenként, teljesítményt a célgép erőforrásaival mérj.
- **Forrás** — `docs/agent-csapdak.md:1035`, `source/tests/quiz-bank-scale-db.integration.ts:145`, `source/tests/quiz-bank-scale-db.integration.ts:201`, `docs/agent-csapdak.md:1039`
- **Mi van kész** — Integrációs teszt méri az olvasási köteget, a meleg lekérést és a párhuzamos egyszeri építést.
- **Mi hiányzik** — A katalógusban szereplő utolsó hideg célgépes mérés meghaladta a megadott célt. Friss mérés nincs ebben a revízióban.
- **Folytatás helye** — `source/tests/quiz-bank-scale-db.integration.ts`
- **Következő lépés** — `source/tests/quiz-bank-scale-db.integration.ts` — Erőforrás-korlátozott példányon azonos bankkal külön mérd a hideg és meleg utat, a memóriát és a lekérdezések számát.
- **Függőség / ütközés** — Csak azonos CPU-keret és adatmennyiség mellett hasonlítható a célértékhez.
- **Kapcsolódó P-tétel** — P-009, P-053

### R-KAN-370 Mutációs próba előtti visszaállítási pont (C-70)

- **Azonosító** — R-KAN-370
- **Cím** — Mutációs próba előtti visszaállítási pont
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1 — Commitolatlan munka veszhet el.
- **Eredeti utasítás / cél** — Mutációs ellenpróba előtt commit vagy másolat, visszaállítás után `cmp` — ne `git checkout <fájl>` commitolatlan munkán.
- **Forrás** — `docs/agent-csapdak.md:1047`, `scripts/qa/hooks/check-destructive.mjs:89`, `docs/agent-csapdak.md:1051`
- **Mi van kész** — A hook vizsgált szabálya a teljes munkafát érintő visszaállítást felismeri.
- **Mi hiányzik** — Egyetlen commitolatlan fájl mentése és bájtpontos visszaállítása kézi eljárás.
- **Folytatás helye** — `scripts/qa/hooks/check-destructive.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-destructive.mjs` — Eldobható munkafában már módosított fájl másolatán mutálj, majd hasonlítsd össze az eredeti, mentett és visszaállított tartalmat.
- **Függőség / ütközés** — Módosított valódi munkafán a próba visszafordíthatatlan lehet.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-372 E2E-portfoglalás versenyhelyzete (C-72)

- **Azonosító** — R-KAN-372
- **Cím** — E2E-portfoglalás versenyhelyzete
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2 — Párhuzamos indításkor hamis e2e-hiba keletkezhet.
- **Eredeti utasítás / cél** — Apróságok: időbélyeg-összevetés SQL-ben, `Failed query` oka a `cause`-ban, Playwright PowerShellből, e2e-port a szervertől.
- **Forrás** — `docs/agent-csapdak.md:1060`, `source/scripts/run-e2e-tests.ts:37`, `source/scripts/run-e2e-tests.ts:43`, `source/scripts/run-e2e-tests.ts:87`
- **Mi van kész** — A futtató szabad portot keres. A katalógus az SQL-időbélyeg, a hibák cause mezője és a PowerShell-futtatás szabályát is rögzíti.
- **Mi hiányzik** — A kereső bezárja a próbaszervert és későbbi indításra adja tovább a számot. Közben másik folyamat lefoglalhatja ugyanazt a portot.
- **Folytatás helye** — `source/scripts/run-e2e-tests.ts`
- **Következő lépés** — `source/scripts/run-e2e-tests.ts` — Az alkalmazásszerver válasszon portot, és jelezze vissza, miután megnyitotta. Két párhuzamos e2e-indítással ellenőrizd, hogy mindkét kliens a saját szerverét éri el.
- **Függőség / ütközés** — A kliens és a Playwright csak a ténylegesen megnyitott címből indulhat.
- **Kapcsolódó P-tétel** — P-046 és P-050 érintkező terület, saját P-azonosító nem található

### R-KAN-374 Láthatatlan Unicode-karakterek a forrásban (C-74)

- **Azonosító** — R-KAN-374
- **Cím** — Láthatatlan Unicode-karakterek a forrásban
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3 — a leírt módszer a következő érintett munkamenetben helyileg ellenőrizhető.
- **Eredeti utasítás / cél** — A láthatatlan karaktereket ellenőrizhető escape-pel kell írni, majd a fájl nyers tartalmát visszaolvasni.
- **Forrás** — `docs/agent-csapdak.md:1079`, `source/shared/source-visual-render.ts:81`, `source/tests/source-visuals.test.ts:282`
- **Mi van kész** — Az érintett kód escape-eket, a teszt kódpontokból felépített karaktereket használ.
- **Mi hiányzik** — A teljes állomány nyers bájtjainak ellenőrzése szerkesztés utáni kézi lépés.
- **Folytatás helye** — `source/shared/source-visual-render.ts`
- **Következő lépés** — `source/shared/source-visual-render.ts` — A meglévő normalizálópróbához használj kódpontból előállított U+2028 és kétirányú vezérlő karaktert, majd olvasd vissza a forrássor tényleges bájtjait.
- **Függőség / ütközés** — A literál és az escape futásidőben azonos karakterként jelenhet meg.
- **Kapcsolódó P-tétel** — P-028

### R-KAN-375 Valódi hookbekötés és soros merge-ablak (C-75)

- **Azonosító** — R-KAN-375
- **Cím** — Valódi hookbekötés és soros merge-ablak
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2 — A kiesett hook és a soron kívüli merge több PR-ra hat.
- **Eredeti utasítás / cél** — Az őrmódosításokat egymás után kell beolvasztani. A tényleges hookparancsokat több munkakönyvtárból és a támogatott héjakkal kell ellenőrizni.
- **Forrás** — `docs/agent-csapdak.md:1090`, `scripts/qa/hooks/settings-hooks.test.mjs:109`, `scripts/qa/hooks/check-quality-gates.test.mjs:416`, `docs/agent-csapdak.md:1094`
- **Mi van kész** — A verziózott settings több munkakönyvtárból és az idézőjelformák fixtúrával ellenőrizhetők.
- **Mi hiányzik** — Az őröket módosító ágak soros beolvasztását az orkesztrátor hangolja össze.
- **Folytatás helye** — `scripts/qa/hooks/settings-hooks.test.mjs`
- **Következő lépés** — `scripts/qa/hooks/settings-hooks.test.mjs` — Két próbaág közül az első beolvasztását kövesd a második főághoz viszonyításával. A quoting-forms fixtúrát a tényleges támogatott héjakon is hasonlítsd össze.
- **Függőség / ütközés** — A soros ablak az aktuális fejhez és a teljes e2e-körhöz kötött.
- **Kapcsolódó P-tétel** — P-044, P-045, P-057

## Kanban · nyitott, ági és felülírt feladatok

A #1–209 minden exportált jegyhez külön R-KAN-azonosító tartozik. A lezárást igazoló egysoros tételek a jelentés végén vannak.

### R-KAN-006 · A nagy forrás szövegét a tervező és a szerző is kapja meg

- **Azonosító** — R-KAN-006
- **Cím** — A nagy forrás szövegét a tervező és a szerző is kapja meg
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A nagy forrás szövegét a tervező és a szerző is kapja meg.
- **Forrás** — kanban-jegyek.txt:41 · #6 (todo, 2026-10-14)
- **Mi van kész** — Az egyfutásos út az átiratot menti és a kötelező fogalmakat ellenőrzi (source/server/studio/single-run/live.ts:46, engine.ts:705). A két fogyasztóhoz eljutó teljes szöveg mérése hiányzik. Kapcsolódó hely: `source/server/studio/extractor.ts:17`; `source/tests/studio-extractor.test.ts`.
- **Mi hiányzik** — Két külön modellbemenetben, hosszú forrás utolsó fejezetéből is mérhető ténymegőrzés.
- **Folytatás helye** — origin/main · `source/server/studio/extractor.ts`
- **Következő lépés** — `source/server/studio/extractor.ts` · Kövess egy háromfejezetes mintát a két modellhívás bemenetéig. Az utolsó fejezetből származó tény is legyen visszakereshető. Ellenőrzési hely: `source/tests/studio-extractor.test.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-007 · A hosszú bemenet feldolgozása jelezze a kimaradó témát

- **Azonosító** — R-KAN-007
- **Cím** — A hosszú bemenet feldolgozása jelezze a kimaradó témát
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A hosszú bemenet feldolgozása jelezze a kimaradó témát.
- **Forrás** — kanban-jegyek.txt:44 · #7 (todo, 2026-10-14)
- **Mi van kész** — A kivonatoló fájlonkénti fedettséget korlátoz (source/server/studio/extractor.ts:239), az egyfutásos ág külön fájlátiratot kér (source/server/studio/single-run/engine.ts:376). A dokumentumon belüli kihagyás riportja nincs ezzel igazolva. Kapcsolódó hely: `source/server/studio/extractor.ts:17`; `source/tests/studio-extractor.test.ts`.
- **Mi hiányzik** — Darabonkénti teljesség és a ténylegesen kihagyott témarészek név szerinti riportja.
- **Folytatás helye** — origin/main · `source/server/studio/extractor.ts`
- **Következő lépés** — `source/server/studio/extractor.ts` · Adj több részre bontandó forrást, az utolsó rész elhagyásakor kérj név szerinti hiányjelentést. Ellenőrzési hely: `source/tests/studio-extractor.test.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-008 · Kézírás-felismerő cseréje mért visszaidézéssel

- **Azonosító** — R-KAN-008
- **Cím** — Kézírás-felismerő cseréje mért visszaidézéssel
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Kézírás-felismerő cseréje mért visszaidézéssel.
- **Forrás** — kanban-jegyek.txt:47 · #8 (todo, 2026-10-14)
- **Mi van kész** — A lépésenkénti OCR-modell kivezetését a 2026-10-16-i döntés és a teszt együtt rögzíti (docs/specs/2026-10-16-egy-futas.md:3, source/tests/studio-ocr-recall.test.ts:58). A régi modellhelyre kért csere tárgytalanná vált. Kapcsolódó hely: `source/server/studio/ocr-recall.ts:16`; `source/tests/studio-ocr-recall.test.ts`.
- **Mi hiányzik** — A tábla még az október 16-án kivezetett lépésre kéri a modellcserét.
- **Folytatás helye** — origin/main · `source/server/studio/ocr-recall.ts`
- **Következő lépés** — A docs/specs/2026-10-16-egy-futas.md:3 döntésével vezesd át a tábla állapotát. A jelenlegi kézírás-fixtúra újramérése külön feladat; helye source/tests/studio-ocr-recall.test.ts:58.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-009 · Az októberi incidens után vonják vissza az érintett hozzáféréseket

- **Azonosító** — R-KAN-009
- **Cím** — Az októberi incidens után vonják vissza az érintett hozzáféréseket
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az érintett jogosultság vagy hozzáférés védelmét befolyásolja.
- **Eredeti utasítás / cél** — Az októberi incidens után vonják vissza az érintett hozzáféréseket.
- **Forrás** — kanban-jegyek.txt:50 · #9 (todo, 2026-10-14)
- **Mi van kész** — A nyilvános backlog külön nyitott sorban tartja a visszavonást. A titoktár állapotát gitből nem lehet igazolni. Kapcsolódó hely: `memory/projects/websuli/BACKLOG.md:17`; `AGENTS.md`.
- **Mi hiányzik** — A visszavonás időpontja és az új hozzáférés sikeres próbájának titokmentes igazolása.
- **Folytatás helye** — origin/main · `memory/projects/websuli/BACKLOG.md`
- **Következő lépés** — `memory/projects/websuli/BACKLOG.md` · A tulajdonos a titoktárban ellenőrizze a visszavonást. A backlogba csak a dátumot, az érintett kör lezárását és a jogosultságpróba eredményét írja. Ellenőrzési hely: `AGENTS.md`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-010 · Legyen egyértelmű a kvótakimerülés utáni szolgáltató

- **Azonosító** — R-KAN-010
- **Cím** — Legyen egyértelmű a kvótakimerülés utáni szolgáltató
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Legyen egyértelmű a kvótakimerülés utáni szolgáltató.
- **Forrás** — kanban-jegyek.txt:53 · #10 (todo, 2026-10-14)
- **Mi van kész** — A közvetlen kvótatartalék tesztje kifejezetten az OpenRouter-váltást várja a source/tests/quota-failover-direct.test.ts:25 sorától. Az egyfutásos modellpolitika külön szerződés (#262). Kapcsolódó hely: `source/tests/quota-failover-direct.test.ts:13`; `source/tests/ai-quota-failover.test.ts`.
- **Mi hiányzik** — A segédfüggvényt használó mai hívóhelyek és a megengedett szolgáltató sorrendjének egyezése.
- **Folytatás helye** — origin/main · `source/tests/quota-failover-direct.test.ts`
- **Következő lépés** — `source/tests/quota-failover-direct.test.ts` · Az aktív generálási út minden szolgáltatójára szimulálj kvótahibát. A hívási naplóban csak az engedélyezett következő szolgáltató szerepelhessen. Ellenőrzési hely: `source/tests/ai-quota-failover.test.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-011 · A térkép újrahasználata tartsa meg a tulajdonosi határt

- **Azonosító** — R-KAN-011
- **Cím** — A térkép újrahasználata tartsa meg a tulajdonosi határt
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. A tárolt térkép azonosítója másik felhasználóhoz tartozhat.
- **Eredeti utasítás / cél** — A térkép újrahasználata tartsa meg a tulajdonosi határt.
- **Forrás** — kanban-jegyek.txt:56 · #11 (todo, 2026-10-14)
- **Mi van kész** — A route továbbadja a tulajdonost, a tárolt térkép visszakeresése viszont csak a tartalmi lenyomattal szűr (source/server/studio/single-run/live.ts:88–91). A társtulajdonos kizárása a gyorsítótár ezen ágában hiányzik. Kapcsolódó hely: `source/server/studio/routes.ts:190`; `source/tests/studio-extractor.test.ts`.
- **Mi hiányzik** — A tárolt találatnak és az egyedi kulcsnak a tulajdonosi körhöz kötése.
- **Folytatás helye** — origin/main · source/server/studio/single-run/live.ts:88
- **Következő lépés** — A source/server/studio/single-run/live.ts tárolási és visszaolvasási feltételét, valamint a séma egyediségét igazítsd a tulajdonoshoz. Izolált DB-tesztben azonos forrásból két mesterséges tulajdonos két jogosult térképet kapjon; saját ismétlése legyen idempotens.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-015 · Öt korábbi konverzió évfolyamának felülvizsgálata

- **Azonosító** — R-KAN-015
- **Cím** — Öt korábbi konverzió évfolyamának felülvizsgálata
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Öt korábbi konverzió évfolyamának felülvizsgálata.
- **Forrás** — kanban-jegyek.txt:80 · #15 (todo, 2026-10-21)
- **Mi van kész** — A három évfolyammező egyezését integrációs próba ellenőrzi (source/tests/material-classroom-db.integration.ts:67). A korábban közzétett öt rekord egyedi döntését ez nem bizonyítja. Kapcsolódó hely: `source/server/catalog/classify.ts:11`; `source/tests/material-classroom-db.integration.ts`.
- **Mi hiányzik** — Az öt régi tananyaghoz rendelt tulajdonosi döntés és az alkalmazás utáni visszaolvasás.
- **Folytatás helye** — origin/main · `source/server/catalog/classify.ts`
- **Következő lépés** — `source/server/catalog/classify.ts` · A tulajdonos által elérhető forrás alapján egyeztesd az öt rekordot. Teszteld szintetikus régi leckén a kézi átsorolás összes olvasási útját. Ellenőrzési hely: `source/tests/material-classroom-db.integration.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-016 · A főnévi alak miatt jelzett konkrét lecke ellenőrzése

- **Azonosító** — R-KAN-016
- **Cím** — A főnévi alak miatt jelzett konkrét lecke ellenőrzése
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A főnévi alak miatt jelzett konkrét lecke ellenőrzése.
- **Forrás** — kanban-jegyek.txt:83 · #16 (todo, 2026-10-21)
- **Mi van kész** — A besorolási kód és a katalóguspróba elérhető. A jegyben szereplő publikált tartalomról nem áll rendelkezésre hitelesített visszaolvasás. Kapcsolódó hely: `source/server/catalog/classify.ts:11`; `source/tests/material-classroom-db.integration.ts`.
- **Mi hiányzik** — Forrás és publikált ragozott alak egymás melletti, jogosult összevetése.
- **Folytatás helye** — origin/main · `source/server/catalog/classify.ts`
- **Következő lépés** — `source/server/catalog/classify.ts` · Olvasd vissza a forrást és az érintett feladatot jogosult környezetben. Ragozott alakú mesterséges példával ellenőrizd a javítást, a tárgybesorolást külön. Ellenőrzési hely: `source/tests/material-classroom-db.integration.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-032 · Mindegyik játékban a játékmechanika hordozza a tanulást

- **Azonosító** — R-KAN-032
- **Cím** — Mindegyik játékban a játékmechanika hordozza a tanulást
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Mindegyik játékban a játékmechanika hordozza a tanulást.
- **Forrás** — kanban-jegyek.txt:232 · #32 (todo, 2026-11-16)
- **Mi van kész** — A #440 terv, a #483 Szökőár és #485 Brain Rot mag a főágon van. A #484 és #486 új játékmagja külön ágon áll. Kapcsolódó hely: `docs/specs/2026-11-16-jatekok-jatekelmeny.md:487`; `source/tests/game-mobile-quality.spec.ts`.
- **Mi hiányzik** — A J3a/J6a főági beépítése és a további játékok lezáró menetei.
- **Folytatás helye** — origin/main · `docs/specs/2026-11-16-jatekok-jatekelmeny.md`
- **Következő lépés** — `docs/specs/2026-11-16-jatekok-jatekelmeny.md` · A J0–J9 tervhez rendelj játékonként magot, lapi bekötést és mobil próbát. A J3a és J6a nyitott ágaira az adott játék érintéses menetét kérd. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-033 · A fiókhoz pontok, barátok és csoportos eredmény tartozzon

- **Azonosító** — R-KAN-033
- **Cím** — A fiókhoz pontok, barátok és csoportos eredmény tartozzon
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A fiókhoz pontok, barátok és csoportos eredmény tartozzon.
- **Forrás** — kanban-jegyek.txt:237 · #33 (todo, 2026-11-16)
- **Mi van kész** — A #445 és #449 hozta a fiókot, a #464 és #476 a kétfős párbajt. A pontok, barátok és csoportos mód a jegy külön céljai. Kapcsolódó hely: `source/shared/duel/room-machine.ts:10`; `source/tests/rt-room-machine.test.ts`.
- **Mi hiányzik** — Tartós fiókpontok, kétoldalú barátság és három- vagy négyfős eredmény.
- **Folytatás helye** — origin/main · `source/shared/duel/room-machine.ts`
- **Következő lépés** — `source/shared/duel/room-machine.ts` · Külön fogadd el a tartós pontmentést, a kétoldalú barátságot és a négyfős menet eredményét. Újrabelépés után is ugyanazt a pontszámot kérd. Ellenőrzési hely: `source/tests/rt-room-machine.test.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-034 · A havi átvilágításban talált holt elemek takarítása

- **Azonosító** — R-KAN-034
- **Cím** — A havi átvilágításban talált holt elemek takarítása
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A havi átvilágításban talált holt elemek takarítása.
- **Forrás** — kanban-jegyek.txt:243 · #34 (todo, 2026-11-16)
- **Mi van kész** — A #488 átírta a vezérlőanyagokat. A novemberi audit ennél nagyobb kört sorol fel, köztük hívó nélküli modulokat és függőségeket. Kapcsolódó hely: `docs/kanban.md:41`; `package.json`.
- **Mi hiányzik** — Hívóhelyekkel igazolt függőséglista és a nem használt szkriptek lezárása.
- **Folytatás helye** — origin/main · `docs/kanban.md`
- **Következő lépés** — `docs/kanban.md` · A gyártási függőségek és indítószkriptek hívóit külön listázd, majd egy használaton kívüli csoportot távolíts el. Tiszta telepítésből induljon a szerver és a kliens. Ellenőrzési hely: `package.json`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-035 · A kisfilmgyártás maradjon a memóriahatáron belül

- **Azonosító** — R-KAN-035
- **Cím** — A kisfilmgyártás maradjon a memóriahatáron belül
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A kisfilmgyártás maradjon a memóriahatáron belül.
- **Forrás** — kanban-jegyek.txt:248 · #35 (todo, 2026-11-16)
- **Mi van kész** — A főági párhuzamosság 2, a memóriaőr és az egyszeri átkódolás a #418 ági módosítása. Kapcsolódó hely: `source/server/lesson-clips.ts:20`; `source/tests/lesson-clip-worker.test.ts`.
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `kisfilm-memoria-javitas` @ `fc8aa73d`
- **Következő lépés** — A(z) `kisfilm-memoria-javitas` ágon hasonlítsd össze a főággal. `source/server/lesson-clips.ts` · Egyeztesd a #418 fejét a főággal. Nagy médiafixtúrán mérd az egyidejű átkódolások számát, az elutasítást és a takarítást. Ellenőrzési hely: `source/tests/lesson-clip-worker.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-041

### R-KAN-041 · Az egyeszközös párbaj kivezetése

- **Azonosító** — R-KAN-041
- **Cím** — Az egyeszközös párbaj kivezetése
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Az egyeszközös párbaj kivezetése.
- **Forrás** — kanban-jegyek.txt:305 · #41 (done, 2026-11-16)
- **Mi van kész** — A #447 hozta be az egyeszközös módot; a 2026-11-16-i D20 tulajdonosi döntés után a #460 eltávolította (e1852e89). Kapcsolódó hely: `source/shared/duel/room-machine.ts:10`; `source/tests/rt-room-machine.test.ts`.
- **Mi hiányzik** — A korábbi feladat táblastátuszának és indoklásának összehangolása a későbbi döntéssel.
- **Folytatás helye** — origin/main · `source/shared/duel/room-machine.ts`
- **Következő lépés** — `source/shared/duel/room-machine.ts` · A #447 szabálymotorján tartsd meg a meglévő próbákat, a #460 utáni navigációban kizárólag az online és bot módot ellenőrizd. Ellenőrzési hely: `source/tests/rt-room-machine.test.ts`.
- **Függőség / ütközés** — Önálló egyeztetés a jegy lezárása előtt.
- **Kapcsolódó P-tétel** — —

### R-KAN-052 · Három vagy négy játékos is befejezhessen közös párbajt

- **Azonosító** — R-KAN-052
- **Cím** — Három vagy négy játékos is befejezhessen közös párbajt
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Három vagy négy játékos is befejezhessen közös párbajt.
- **Forrás** — kanban-jegyek.txt:427 · #52 (in_progress, 2026-11-16)
- **Mi van kész** — Az egyeszközös módot a #460 kivezette. A #464 és #476 után a kétfős út megvan, a 3–4 fős és admin-pilot elfogadás külön maradt. Kapcsolódó hely: `source/shared/duel/room-machine.ts:10`; `source/tests/rt-room-machine.test.ts`.
- **Mi hiányzik** — JM3b, a #73 és #97 előfeltételei, a D-07 sorrend szerinti adminpróba.
- **Folytatás helye** — origin/main · `source/shared/duel/room-machine.ts`
- **Következő lépés** — `source/shared/duel/room-machine.ts` · A kétfős menet mellé építs 3–4 fős eredményhirdetést és visszavágót. Egy kilépő és két maradó résztvevővel is záruljon le a kör. Ellenőrzési hely: `source/tests/rt-room-machine.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-018

### R-KAN-062 · A korábbi felhasználó a megfelelő játékosprofilhoz kerüljön

- **Azonosító** — R-KAN-062
- **Cím** — A korábbi felhasználó a megfelelő játékosprofilhoz kerüljön
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A korábbi felhasználó a megfelelő játékosprofilhoz kerüljön.
- **Forrás** — kanban-jegyek.txt:580 · #62 (todo, 2026-11-16)
- **Mi van kész** — A főági kiindulópont `source/server/player/account-store.ts:280`; `source/tests/player-account-db.integration.ts`. A kapcsolódó alapváltozás #445 (9bda1373).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A korábbi felhasználó a megfelelő játékosprofilhoz kerüljön.
- **Folytatás helye** — origin/main · `source/server/player/account-store.ts`
- **Következő lépés** — `source/server/player/account-store.ts` · A régi belépési út és az új fiók összekötését teszteld már létező és üres profillal. Az adminjog minden esetben az engedélylistát kövesse. Ellenőrzési hely: `source/tests/player-account-db.integration.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-019

### R-KAN-064 · A kis képernyős játékhibák mindegyike kapjon visszamérést

- **Azonosító** — R-KAN-064
- **Cím** — A kis képernyős játékhibák mindegyike kapjon visszamérést
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A kis képernyős játékhibák mindegyike kapjon visszamérést.
- **Forrás** — kanban-jegyek.txt:593 · #64 (todo, 2026-11-16)
- **Mi van kész** — A #482 megváltoztatta a Tornado buborékját, a #485 a Brain Rot feliratait. A másik két észleléshez készülékmérés kell. Kapcsolódó hely: `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`.
- **Mi hiányzik** — Az induló Kockavadász-kamera és a Szökőár első kérdéséig eltelt idő valódi telefonos eredménye hiányzik. A Tornado buborékját és a Brain Rot egyszerre megjelenő feliratait ugyanabban a mátrixban kell visszaellenőrizni.
- **Folytatás helye** — origin/main · `source/client/src/pages/TsunamiEscapeEnglish.tsx`
- **Következő lépés** — `source/client/src/pages/TsunamiEscapeEnglish.tsx` · Ellenőrizd a Viharvadász buborékját és a Brain Rot feliratait, majd mérd a Kockavadász induló kameráját és a Szökőár első kérdésének idejét álló és fekvő telefonon. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-068 · A tényleges Render-build egyezzen a verziózott leírással

- **Azonosító** — R-KAN-068
- **Cím** — A tényleges Render-build egyezzen a verziózott leírással
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A tényleges Render-build egyezzen a verziózott leírással.
- **Forrás** — kanban-jegyek.txt:630 · #68 (todo, 2026-11-16)
- **Mi van kész** — A verziózott build szigorú parancslánc. A workflow csak megfelelő szolgáltatói hozzáféréssel tudja ellenőrizni a távoli beállítást. Kapcsolódó hely: `render.yaml:7`; `scripts/qa/verify-render-settings.test.mjs`.
- **Mi hiányzik** — A távoli beállítás mai értéke és a beállításfigyelő sikeres futásának bizonyítéka.
- **Folytatás helye** — origin/main · `render.yaml`
- **Következő lépés** — `render.yaml` · A beállítás-ellenőrző futását igazold jogosult környezetben, értékkiírás nélkül. Megváltoztatott tesztkonfigurációnál adjon hibát, migrációs hibával ne folytatódjon a build. Ellenőrzési hely: `scripts/qa/verify-render-settings.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-069 · A gyorsítótár és a betöltés csökkentse a mobil terhelést

- **Azonosító** — R-KAN-069
- **Cím** — A gyorsítótár és a betöltés csökkentse a mobil terhelést
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A gyorsítótár és a betöltés csökkentse a mobil terhelést.
- **Forrás** — kanban-jegyek.txt:637 · #69 (todo, 2026-11-16)
- **Mi van kész** — A főági kiindulópont `source/vercel.json:64`; `source/tests/quiz-bank-scale-db.integration.ts`. A kapcsolódó alapváltozás #478 (76cf426a).
- **Mi hiányzik** — Hat külön adat hiányzik: a design-assets gyorsítótárfejléce, előnézeti API-cél és 403-as naplózás, nyelvenkénti szóbankletöltés, főoldali kártyaszám és LCP, induló animációs csomag, valamint két játék menü alatti rajzolása.
- **Folytatás helye** — origin/main · `source/vercel.json`
- **Következő lépés** — A source/vercel.json szabályait és a főoldal betöltését ellenőrizd a source/tests/home-views.spec.ts böngészős útján. Mérd az előnézeti célkiszolgálót, a nyelvenként letöltött bájtokat, a DOM-ot, az induló csomagot és a menü alatti képkockákat a source/tests/game-mobile-quality.spec.ts mérőjével.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-053

### R-KAN-071 · A hideg kérdésbank és a tömörítés költsége legyen mérhető

- **Azonosító** — R-KAN-071
- **Cím** — A hideg kérdésbank és a tömörítés költsége legyen mérhető
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A hideg kérdésbank és a tömörítés költsége legyen mérhető.
- **Forrás** — kanban-jegyek.txt:649 · #71 (todo, 2026-11-16)
- **Mi van kész** — A #478 már megszüntette a kérésenkénti teljes építést, a #502 verziózott évfolyamválaszt hozott. Ezek nem igazolják a hideg építés célidejét. Kapcsolódó hely: `source/server/lib/quiz-bank-classroom.ts:7`; `source/tests/quiz-bank-s1.test.ts`.
- **Mi hiányzik** — Nyitott az M2 lenyomatköltség, L2 tömörítés a közvetítőn át, L3 építési idő és méret naplózása, L6 tömörítést vezérlő fejléc hatása.
- **Folytatás helye** — origin/main · `source/server/lib/quiz-bank-classroom.ts`
- **Következő lépés** — `source/server/lib/quiz-bank-classroom.ts` · Szintetikus készleten rögzíts hideg építési időt, méretet, lenyomatköltséget, tömörített és közvetítőn átadott választ. Az előmelegítés alatt is maradjon konzisztens a válasz. Ellenőrzési hely: `source/tests/quiz-bank-s1.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-009

### R-KAN-072 · A listázások és létezésvizsgálatok ne olvassanak teljes leckét

- **Azonosító** — R-KAN-072
- **Cím** — A listázások és létezésvizsgálatok ne olvassanak teljes leckét
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A listázások és létezésvizsgálatok ne olvassanak teljes leckét.
- **Forrás** — kanban-jegyek.txt:655 · #72 (todo, 2026-11-16)
- **Mi van kész** — A főági kiindulópont `source/server/routes.ts:3807`; `source/tests/quiz-bank-scale-db.integration.ts`. A kapcsolódó alapváltozás #478 (76cf426a).
- **Mi hiányzik** — A sitemap, a nyilvános HTML-lista, az admin megtekintésszámláló és szülői áttekintő, illetve az egyszerű létezésvizsgálatok külön lekérdezésének memóriaigénye nincs egyenként igazolva.
- **Folytatás helye** — origin/main · `source/server/routes.ts`
- **Következő lépés** — `source/server/routes.ts` · A sitemap, HTML-lista, admin nézetek és létezésvizsgálatok külön projekciót kapjanak. Nagy fixtúrán mérd a betöltött bájtokat és a maximum heapet. Ellenőrzési hely: `source/tests/quiz-bank-scale-db.integration.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-053

### R-KAN-073 · Kilépés után a maradók visszavághassanak

- **Azonosító** — R-KAN-073
- **Cím** — Kilépés után a maradók visszavághassanak
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Kilépés után a maradók visszavághassanak.
- **Forrás** — kanban-jegyek.txt:658 · #73 (todo, 2026-11-16)
- **Mi van kész** — A főági kiindulópont `source/shared/duel/room-machine.ts:10`; `source/tests/rt-room-machine.test.ts`. A kapcsolódó alapváltozás #464 (5bb648ca).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Kilépés után a maradók visszavághassanak.
- **Folytatás helye** — origin/main · `source/shared/duel/room-machine.ts`
- **Következő lépés** — `source/shared/duel/room-machine.ts` · A visszavágó átmeneteit igazítsd a jelen lévő létszámhoz. Három és négy főről indulva ellenőrizd a gazdaváltást, készenlétet és új menetet. Ellenőrzési hely: `source/tests/rt-room-machine.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-018

### R-KAN-074 · Szünetben a játékok 3D-háttere álljon meg

- **Azonosító** — R-KAN-074
- **Cím** — Szünetben a játékok 3D-háttere álljon meg
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Szünetben a játékok 3D-háttere álljon meg.
- **Forrás** — kanban-jegyek.txt:663 · #74 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/mobile/PauseMenu.tsx:19`; `source/tests/coupon-expired-all-games.spec.ts`. A kapcsolódó alapváltozás #467 (6a4f7a48).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Szünetben a játékok 3D-háttere álljon meg.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/mobile/PauseMenu.tsx`
- **Következő lépés** — `source/client/src/game-engine/mobile/PauseMenu.tsx` · A D-10 szerint rögzített, elmosott képet jeleníts meg. Mérd szünetben a képkockahívások számát és folytatáskor az első szimulációs lépést. Ellenőrzési hely: `source/tests/coupon-expired-all-games.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-075 · A tiltás és törlés párhuzamos művelete maradjon konzisztens

- **Azonosító** — R-KAN-075
- **Cím** — A tiltás és törlés párhuzamos művelete maradjon konzisztens
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A tiltás és törlés párhuzamos művelete maradjon konzisztens.
- **Forrás** — kanban-jegyek.txt:666 · #75 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/server/player/account-store.ts:280`; `source/tests/player-account-db.integration.ts`. A kapcsolódó alapváltozás #445 (9bda1373).
- **Mi hiányzik** — A ritka holtpont után szükséges tranzakció-újrapróbálás, a kulcs visszaváltásával újra érvényes tiltás és a párhuzamos adminisztrátori tiltás eredménye külön-külön igazolandó.
- **Folytatás helye** — origin/main · `source/server/player/account-store.ts`
- **Következő lépés** — A source/server/player/account-store.ts törlési és tiltásfeloldási tranzakcióinál ellenőrizd a zárolási sorrendet és a 40P01 újrapróbálását. A source/tests/player-account-db.integration.ts-ben külön eset mérje a párhuzamos törlés/feloldást, a kulcs visszaváltását és az új fiókkal egy időben változó tiltást.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-019

### R-KAN-076 · A két javított böngészőteszt mellett a közös időkeret is mérhető legyen

- **Azonosító** — R-KAN-076
- **Cím** — A két javított böngészőteszt mellett a közös időkeret is mérhető legyen
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A két javított böngészőteszt mellett a közös időkeret is mérhető legyen.
- **Forrás** — kanban-jegyek.txt:669 · #76 (in_review, 2026-11-17)
- **Mi van kész** — A #492 javította a két eredeti esetet. A legutolsó jegyzet szerint legalább négyszeres lassításnál a korai koppintás továbbra is mérendő. Kapcsolódó hely: `source/tests/game-mobile-quality.spec.ts:1`; `source/tests/joystick-response.spec.ts`.
- **Mi hiányzik** — A korai érintés esetleges bukásának visszamérése legalább négyszeres lassítással.
- **Folytatás helye** — origin/main · `source/tests/game-mobile-quality.spec.ts`
- **Következő lépés** — `source/tests/game-mobile-quality.spec.ts` · A #492 után nyitva maradt korai koppintást legalább négyszeres lassításnál vizsgáld. Az élesítés előtti és utáni érintésre külön elvárás legyen. Ellenőrzési hely: `source/tests/joystick-response.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-050

## Helyi ügynökmemória

A forráshivatkozásokban kizárólag a privát memória relatív fájlneve szerepel. A 36 aktív jegyzet, a tárgymutató és egy archív fájl összesen 38 forrás.

### R-KAN-401 · Magyar tulajdonosi összefoglaló minden esemény után

- **Azonosító** — R-KAN-401
- **Cím** — Magyar tulajdonosi összefoglaló minden esemény után
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Magyar tulajdonosi összefoglaló minden esemény után.
- **Forrás** — Privát projektmemória · `always-hungarian.md:11`
- **Mi van kész** — A főági protokoll magyar válasznyelvet ír elő. `AGENTS.md:218`
- **Mi hiányzik** — A CI-esemény utáni tényleges válasz nyelve csak munkamenetből igazolható.
- **Folytatás helye** — Főági kiindulópont `AGENTS.md:218`
- **Következő lépés** — Az AGENTS.md szabályához az eseményfeldolgozó átadásánál magyar státuszmintát rendelj. Angol CI-eseményből készült, személytelen magyar válasszal ellenőrizd.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

## A repó verziózott memóriája

### R-KAN-451 · A februári javítások alkalmazás után is visszaolvashatók legyenek

- **Azonosító** — R-KAN-451
- **Cím** — A februári javítások alkalmazás után is visszaolvashatók legyenek
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A februári javítások alkalmazás után is visszaolvashatók legyenek.
- **Forrás** — `memory/episodic/2026/session-dev-log.md:11`
- **Mi van kész** — A migráció a build előtt áll. A napló tárolási és kliensfrissítési javításokat is rögzít. `render.yaml:7`
- **Mi hiányzik** — Az eredmény alkalmazásának mai UI–adatbázis–visszaolvasás útját a napló nem bizonyítja.
- **Folytatás helye** — `memory/episodic/2026/session-dev-log.md` · `render.yaml:7`
- **Következő lépés** — A source/server/storage.ts régi HTML javítási útját próbáld mentéssel, újraindítással és visszaolvasással egy mesterséges leckén.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-452 · Az élő memória indexe teljes és feloldható legyen

- **Azonosító** — R-KAN-452
- **Cím** — Az élő memória indexe teljes és feloldható legyen
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — Az élő memória indexe teljes és feloldható legyen.
- **Forrás** — `memory/indexes/index.yml:1`
- **Mi van kész** — Az öt csoportban felsorolt 17 fájlcél mind létezik. A futásidejű exportjegyzék ugyanabban a projektmappában van. `RUNBOOK.md:194`
- **Mi hiányzik** — A memory/projects/websuli/runtime-document-manifest.yaml nem szerepel a fájllistán. A jelzett archívum élő vagy történeti szerepe a takarítási döntéssel egyeztetendő.
- **Folytatás helye** — `memory/indexes/index.yml` · `RUNBOOK.md:194`
- **Következő lépés** — Az indexben jelöld a manifest szerepét vagy az indokolt kizárást. A chore/allapot-ellenorok memory-check.mjs próbájába hiányzó cél és indexeletlen aktív fájl kerüljön.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-047, P-051

### R-KAN-453 · A helyreállítás előtt bizonyítható legyen a megfelelő adatbázis és visszaállítási pont

- **Azonosító** — R-KAN-453
- **Cím** — A helyreállítás előtt bizonyítható legyen a megfelelő adatbázis és visszaállítási pont
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A helyreállítás előtt bizonyítható legyen a megfelelő adatbázis és visszaállítási pont.
- **Forrás** — `memory/procedural/deploy/deploy-database-recovery.md:11`
- **Mi van kész** — A főág megadja a sémát és a migrációk könyvtárát, a memória márciusi azonosítási adatokat használ. `RUNBOOK.md:162`
- **Mi hiányzik** — A márciusi sor- és táblaszám mai környezetazonosítóként nem igazolt. A gyártási példány jelen állapota nem git-adat.
- **Folytatás helye** — `memory/procedural/deploy/deploy-database-recovery.md` · `RUNBOOK.md:162`
- **Következő lépés** — A helyreállítási leírásban a dátumozott állapotminta mellé tedd az engedélyezett, titokmentes azonosságpróbát. Eldobható mentésen igazold a visszaállítást és a sémaverziót.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-454 · A telepítési leírás tükrözze a tényleges CI és build sorrendjét

- **Azonosító** — R-KAN-454
- **Cím** — A telepítési leírás tükrözze a tényleges CI és build sorrendjét
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A telepítési leírás tükrözze a tényleges CI és build sorrendjét.
- **Forrás** — `memory/procedural/deploy/vercel-render-deploy.md:11`
- **Mi van kész** — A Vercel/Render szétválasztást a főági konfiguráció alátámasztja. A 36. sor csak build-ellenőrzést ír, közben a CI lintet, típust, teszteket és natív rendszereket vizsgál. `.github/workflows/ci.yml:66`
- **Mi hiányzik** — A kiadási feltételek és a két réteg külön verifikációjának frissítése.
- **Folytatás helye** — `memory/procedural/deploy/vercel-render-deploy.md` · `.github/workflows/ci.yml:66`
- **Következő lépés** — A deploy-memória CI-szakaszát hasonlítsd a workflow jobjaihoz és a render.yaml buildCommandhoz. Száraz konfiguráció-próbában egy kihagyott kötelező job legyen észlelhető.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-455 · A történeti függőségauditot verzióval lehessen értelmezni

- **Azonosító** — R-KAN-455
- **Cím** — A történeti függőségauditot verzióval lehessen értelmezni
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Hozzáférési vagy adatvédelmi következménye lehet.
- **Eredeti utasítás / cél** — A történeti függőségauditot verzióval lehessen értelmezni.
- **Forrás** — `memory/procedural/development/code-analysis-report.md:11`
- **Mi van kész** — A 2025-ös jelentés verzióérzékeny megállapításokat, a főág konkrét zárolt függőségfát tartalmaz. `source/package-lock.json:1`
- **Mi hiányzik** — Nincs azonosított mai auditkimenet, amelyből a történeti hibaszám és a mai érintettség egyezése következne.
- **Folytatás helye** — `memory/procedural/development/code-analysis-report.md` · `source/package-lock.json:1`
- **Következő lépés** — A jelentéshez rendelj forráscommittal azonosított lockfile-t. Jogosult friss felmérésben csomagonként verziót és javítási állapotot ellenőrizz, a régi összesítést dátumozva hagyd.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-456 · Többlépéses törlés és visszaállítás legyen atomi

- **Azonosító** — R-KAN-456
- **Cím** — Többlépéses törlés és visszaállítás legyen atomi
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — Többlépéses törlés és visszaállítás legyen atomi.
- **Forrás** — `memory/procedural/development/code-review-2024-12.md:11`
- **Mi van kész** — A régi revízió meghatározza az FK-sorrendet és tranzakciót javasol. A jelenlegi tároló külön megvizsgálható. `source/server/storage.ts:1`
- **Mi hiányzik** — A teljes felsorolt elemkörre részleges kudarc és ismétlés elleni védelem nincs igazolva egyetlen régi review-ból.
- **Folytatás helye** — `memory/procedural/development/code-review-2024-12.md` · `source/server/storage.ts:1`
- **Következő lépés** — A storage.ts és a mentéskezelő műveleteit párosítsd a régi listával. Eldobható kapcsolt sorokon közbülső hibát injektáló DB-próba igazolja a rollbacket.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-457 · A helyi indítás dokumentációja valódi jogosultsági útra vezessen

- **Azonosító** — R-KAN-457
- **Cím** — A helyi indítás dokumentációja valódi jogosultsági útra vezessen
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A helyi indítás dokumentációja valódi jogosultsági útra vezessen.
- **Forrás** — `memory/procedural/development/readme-local.md:11`
- **Mi van kész** — A memória automatikus dev-adminbelépést ígér; a #462 az engedélylistához köti az adminjogot. `source/tests/admin-authz-matrix-db.integration.ts:1`
- **Mi hiányzik** — A helyi út, az e2e kivétel és a normál hitelesítés feltételei összemosódnak.
- **Folytatás helye** — `memory/procedural/development/readme-local.md` · `source/tests/admin-authz-matrix-db.integration.ts:1`
- **Következő lépés** — A helyi README belépési példáját ellenőrizd normál és izolált e2e-konfigurációban. A mátrixban vendég adminjog nélkül, engedélyezett admin saját joggal lépjen be.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-019

### R-KAN-458 · A historikus backlog csak ténylegesen nyitott munkát jelöljön

- **Azonosító** — R-KAN-458
- **Cím** — A historikus backlog csak ténylegesen nyitott munkát jelöljön
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A historikus backlog csak ténylegesen nyitott munkát jelöljön.
- **Forrás** — `memory/projects/websuli/BACKLOG.md:11`
- **Mi van kész** — A #6–11 itt is szerepel. A szeptemberi négy auditpontot ugyanazon fájl zárja le, az eslint közben nullafigyelmeztetéses (.github/workflows/ci.yml:66). `memory/projects/websuli/BACKLOG.md:25`
- **Mi hiányzik** — Nyitott jelöléssel keverednek később megvalósult vagy felülírt igények, a júliusi titokforgatás bizonyítéka külön hiányzik.
- **Folytatás helye** — `memory/projects/websuli/BACKLOG.md` · `memory/projects/websuli/BACKLOG.md:25`
- **Következő lépés** — Egyeztesd a checkboxokat a #6–11, #41 és #66 eredményeivel, a régi számokat dátumozd. Ellenőrizd a külön rotációs tételt és az alábbi tételes backlog-mutatót.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-047, P-051

### R-KAN-459 · Az időrendi naplóból lehessen külön azonosítani a nyitva maradt döntéseket

- **Azonosító** — R-KAN-459
- **Cím** — Az időrendi naplóból lehessen külön azonosítani a nyitva maradt döntéseket
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — Az időrendi naplóból lehessen külön azonosítani a nyitva maradt döntéseket.
- **Forrás** — `memory/projects/websuli/LEDGER.md:11`
- **Mi van kész** — A júliustól novemberig tartó napló mérési, adatkezelési és PR-eseményeket rögzít. Az alábbi mutató minden dátumfejezetet lefed. `memory/projects/websuli/LEDGER.md:16`
- **Mi hiányzik** — Egy korabeli nyitott megjegyzés mai állapota csak a későbbi javítás vagy a jogosult tartalomellenőrzés után mondható ki.
- **Folytatás helye** — `memory/projects/websuli/LEDGER.md` · `memory/projects/websuli/LEDGER.md:16`
- **Következő lépés** — A fejezetmutatóban jelzett nyitott tartalom- és üzemeltetési eseteket vezesd külön utókövetésbe. PR-hivatkozásnál az utolsó szállító commitot, élő adatnál a visszaolvasás dátumát ellenőrizd.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-047, P-059

### R-KAN-460 · Az összefoglaló a használt kiszolgálási útvonalat nevezze meg

- **Azonosító** — R-KAN-460
- **Cím** — Az összefoglaló a használt kiszolgálási útvonalat nevezze meg
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — Az összefoglaló a használt kiszolgálási útvonalat nevezze meg.
- **Forrás** — `memory/projects/websuli/project-overview.md:11`
- **Mi van kész** — A főági runbook Vercel SPA-t és Render API-t ábrázol, a projektmemória az elhagyott VPS-t szerepelteti elsődlegesként. `RUNBOOK.md:34`
- **Mi hiányzik** — Az elsődleges és tartalék rendszer jelölése, valamint a márciusi DB-mérés történetiként megjelölése.
- **Folytatás helye** — `memory/projects/websuli/project-overview.md` · `RUNBOOK.md:34`
- **Következő lépés** — Az overview szolgáltatási tábláját egyeztesd a source/vercel.json átírásaival és a render.yaml szerverleírásával. Minden publikus út pontosan egy elsődleges réteget kapjon.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-051, P-052

### R-KAN-461 · A letöltött forrás telepítési leírása a támogatott auth- és buildúttal egyezzen

- **Azonosító** — R-KAN-461
- **Cím** — A letöltött forrás telepítési leírása a támogatott auth- és buildúttal egyezzen
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A letöltött forrás telepítési leírása a támogatott auth- és buildúttal egyezzen.
- **Forrás** — `memory/projects/websuli/readme-download.md:11`
- **Mi van kész** — A telepítési jegyzet korábbi auth-eszköz környezeti neveit adja, a főágon játékos- és admin-hitelesítési mátrix van (#445, #462). `render.yaml:7`
- **Mi hiányzik** — A feltételes és kötelező beállítások tiszta telepítésre ellenőrzött listája.
- **Folytatás helye** — `memory/projects/websuli/readme-download.md` · `render.yaml:7`
- **Következő lépés** — A letöltési README és a readme-local beállításait vesd össze a mai szerver bootjával. Titokmentes mintával egy hiányzó kötelező értéket és kikapcsolt opcionális modult próbálj.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-047

### R-KAN-462 · A futásidejű nyolc dokumentum eredete és verziója legyen visszakereshető

- **Azonosító** — R-KAN-462
- **Cím** — A futásidejű nyolc dokumentum eredete és verziója legyen visszakereshető
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A futásidejű nyolc dokumentum eredete és verziója legyen visszakereshető.
- **Forrás** — `memory/projects/websuli/runtime-document-manifest.yaml:1`
- **Mi van kész** — A manifest név szerint sorolja a nyolc dokumentumot és a két skillt. Az élő tudástár nincs exportálva. `memory/projects/websuli/runtime-document-manifest.yaml:11`
- **Mi hiányzik** — A hitelesített letöltés, tartalomlenyomat és összehasonlítás; a 401 csak a korabeli hozzáférés eredménye.
- **Folytatás helye** — `memory/projects/websuli/runtime-document-manifest.yaml` · `memory/projects/websuli/runtime-document-manifest.yaml:11`
- **Következő lépés** — Jogosult admin-környezetben mindkét skill nyolc dokumentumát olvasd vissza. A manifestben csak forrásrevízió, időpont, fájlszám és lenyomat szerepeljen.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-047

### R-KAN-463 · Az internetes készítés forrástól publikálásig igazolható legyen

- **Azonosító** — R-KAN-463
- **Cím** — Az internetes készítés forrástól publikálásig igazolható legyen
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — Az internetes készítés forrástól publikálásig igazolható legyen.
- **Forrás** — `memory/projects/websuli/session-export-2026-09-13.md:11`
- **Mi van kész** — A szeptemberi export a kódellenőrzést és a hitelesítés nélküli exportkorlátot is rögzíti. Későbbi főági szállítás #128, #131 és #132. `source/server/studio/web-research-routes.ts:1`
- **Mi hiányzik** — A pontosan ebben az exportban kért új teljes példához külön futás és visszaolvasás nem igazolt.
- **Folytatás helye** — `memory/projects/websuli/session-export-2026-09-13.md` · `source/server/studio/web-research-routes.ts:1`
- **Következő lépés** — A web-research-completion.test.ts fixtúrájával előbb ellenőrizd a forrás és a közzétett lecke kapcsolatát. A tényleges példát csak jogosult adminnal azonosítsd.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-059

### R-KAN-464 · A régi designterv különböztesse meg a megvalósult és a még döntésre váró elemeket

- **Azonosító** — R-KAN-464
- **Cím** — A régi designterv különböztesse meg a megvalósult és a még döntésre váró elemeket
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A régi designterv különböztesse meg a megvalósult és a még döntésre váró elemeket.
- **Forrás** — `memory/semantic/technology/design-implementation-plan.md:11`
- **Mi van kész** — A korosztályos arculati banknak főági szerződése van (S2–S3, 3a432dff). A régi fájl több arculati elemet hiányzóként hagy. `source/shared/design-assets.ts:1`
- **Mi hiányzik** — A tipográfia, korosztályos téma és opcionális látványelemek mai megfeleltetése.
- **Folytatás helye** — `memory/semantic/technology/design-implementation-plan.md` · `source/shared/design-assets.ts:1`
- **Következő lépés** — A terv minden fázisát rendeld mai komponenshez vagy dokumentált döntéshez. Három korcsoportban ellenőrizd a számított betűcsaládot és a hosszú magyar címet.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-465 · A magyar ékezetek, olvashatóság és érintési célok egyszerre teljesüljenek

- **Azonosító** — R-KAN-465
- **Cím** — A magyar ékezetek, olvashatóság és érintési célok egyszerre teljesüljenek
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A magyar ékezetek, olvashatóság és érintési célok egyszerre teljesüljenek.
- **Forrás** — `memory/semantic/technology/edu-platform-design-2026.md:11`
- **Mi van kész** — Van mobilcélt mérő próba és külön leckét renderelő tipográfiateszt. A memória minden felületre kiterjedő vizuális elveket sorol. `source/tests/support/game-mobile-quality.ts:46`
- **Mi hiányzik** — Az összes korosztályos sablon kontrasztjának, ékezeteinek és vezérlőméretének együttes igazolása.
- **Folytatás helye** — `memory/semantic/technology/edu-platform-design-2026.md` · `source/tests/support/game-mobile-quality.ts:46`
- **Következő lépés** — A source/tests/lesson-typography.browser.ts mintáiba tégy hosszú magyar szöveget. Mobil és asztali méreten mérj kontrasztot, valódi célméretet és tördelést.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-466 · A főoldal teljesítményjavítását valós felhasználási úton mérjék

- **Azonosító** — R-KAN-466
- **Cím** — A főoldal teljesítményjavítását valós felhasználási úton mérjék
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A főoldal teljesítményjavítását valós felhasználási úton mérjék.
- **Forrás** — `memory/semantic/technology/landing-performance-analysis.md:11`
- **Mi van kész** — A régi mérés a batch-kérést és háttérbe küldést rögzíti. A novemberi #69 még kártyaszámot, cache-t és belépőcsomagot tárgyal. `source/server/routes.ts:1`
- **Mi hiányzik** — Azonos eszközön mért hideg/meleg FCP, főszálidő és lekérdezésszám; lapozás és lusta betöltés mai szükségessége.
- **Folytatás helye** — `memory/semantic/technology/landing-performance-analysis.md` · `source/server/routes.ts:1`
- **Következő lépés** — A home-views.spec.ts környezetében friss induláskor számold a likes/batch kéréseket, majd nagy szintetikus listán hasonlítsd össze a látható kártyák és DOM-elemek számát.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-053

### R-KAN-467 · A tananyagjavító felülete, biztonsági korlátja és mentési pontja legyen visszakövethető

- **Azonosító** — R-KAN-467
- **Cím** — A tananyagjavító felülete, biztonsági korlátja és mentési pontja legyen visszakövethető
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A tananyagjavító felülete, biztonsági korlátja és mentési pontja legyen visszakövethető.
- **Forrás** — `memory/semantic/technology/material-improvement-feature.md:11`
- **Mi van kész** — A komponens és a főági tároló létezik. A funkcióleírás egy régebbi routes.ts sortartományhoz köti a végpontokat. `source/client/src/components/MaterialImprover.tsx:1`
- **Mi hiányzik** — A ma alkalmazott szerverút, szerveroldali méretkorlát és az alkalmazás utáni visszaolvasás helye.
- **Folytatás helye** — `memory/semantic/technology/material-improvement-feature.md` · `source/client/src/components/MaterialImprover.tsx:1`
- **Következő lépés** — A dokumentum végpontlistáját a MaterialImprover tényleges hívásaihoz kösd. Nagy és szabályos mesterséges HTML-lel ellenőrizd az elutasítást, előnézetet és visszaolvasást.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-468 · A jóváhagyás, előmentés és visszaállítás minden javításnál működjön

- **Azonosító** — R-KAN-468
- **Cím** — A jóváhagyás, előmentés és visszaállítás minden javításnál működjön
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A jóváhagyás, előmentés és visszaállítás minden javításnál működjön.
- **Forrás** — `memory/semantic/technology/material-improver-plan.md:11`
- **Mi van kész** — A szerepeltetett korábbi modell és időkorlát történeti; #261 és #262 az aktív AI-útvonalakat átszervezte. `source/server/storage.ts:1`
- **Mi hiányzik** — A terv „mind kész” megjelölése mellett a mai előnézet–alkalmazás–visszaállítás teljes bizonyítéka.
- **Folytatás helye** — `memory/semantic/technology/material-improver-plan.md` · `source/server/storage.ts:1`
- **Következő lépés** — A source/server/studio/structured-improvement.ts és a tényleges tárolóút közé adj hibás mentést. Csak sikeres előmentés után változzon a lecke, és visszaállításkor egyezzen a tartalom.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — —

### R-KAN-469 · A régi iframe-es diktálási megoldás helyes korszakhoz rendelése

- **Azonosító** — R-KAN-469
- **Cím** — A régi iframe-es diktálási megoldás helyes korszakhoz rendelése
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — TTS
- **Prioritás-javaslat** — P2. A korábbi fejlesztési vagy üzemeltetési kérés mai állapotát érinti.
- **Eredeti utasítás / cél** — A régi iframe-es diktálási megoldás helyes korszakhoz rendelése.
- **Forrás** — `memory/semantic/technology/speech-to-text-iframe-fix.md:1`
- **Mi van kész** — 2026-10-21-i tulajdonosi nyelvlecke-szabály és #360. A szeptembertől alkalmazott külön originhez a híd tartozik. `source/server/lib/speech-bridge.ts:1`
- **Mi hiányzik** — A korábbi egyedüli keretbeállításos javítás történeti jelölése, összekötése a ma támogatott úttal.
- **Folytatás helye** — `memory/semantic/technology/speech-to-text-iframe-fix.md` · `source/server/lib/speech-bridge.ts:1`
- **Következő lépés** — A memória megoldás fejezetét kösd a speech-bridge.ts-hez. Külön eredettel és megszakított mikrofonengedéllyel ellenőrizd a felhasználói visszajelzést.
- **Függőség / ütközés** — A történeti mérés dátuma és a vizsgált főág eltérhet.
- **Kapcsolódó P-tétel** — P-032

## Vezérlőfájlok, skillek és korábbi nyitott döntések

### R-KAN-501 · Ugyanaz a háromfázisú szabály legyen a szabálykönyvben és a kapuban

- **Azonosító** — R-KAN-501
- **Cím** — Ugyanaz a háromfázisú szabály legyen a szabálykönyvben és a kapuban
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Ugyanaz a háromfázisú szabály legyen a szabálykönyvben és a kapuban.
- **Forrás** — AGENTS.md:10; docs/agent-haromfazisu-munka.md:18
- **Mi van kész** — A háromfázisú ellenőr a push-kapuba van kötve (pre-push-gate.mjs:195). Az egyfájlos, egysoros javításra a three-phase-check.mjs:27 figyelmeztetés mellett sikert ad.
- **Mi hiányzik** — A „két fájl mindig kell” és a kézikönyvi kivétel határa eltér. A kritikus szerződés tartalmi megfelelőségét ez az ellenőr szintén nem méri.
- **Folytatás helye** — AGENTS.md:10
- **Következő lépés** — A docs/agent-haromfazisu-munka.md és az AGENTS.md szövegét egyetlen tulajdonosi döntéshez igazítsd. A scripts/qa/three-phase-check.test.mjs külön próbálja a dokumentációs, egysoros és többfájlos változást az első kódcommit állapotában.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-502 · Kritikus változtatás előtt legyen elfogadott viselkedési szerződés

- **Azonosító** — R-KAN-502
- **Cím** — Kritikus változtatás előtt legyen elfogadott viselkedési szerződés
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Kritikus változtatás előtt legyen elfogadott viselkedési szerződés.
- **Forrás** — AGENTS.md:51; AGENTS.md:56
- **Mi van kész** — A docs/specs/contract-template.yaml létezik. A scripts/qa/three-phase-check.mjs:13 a végrehajtási fájlt keresi. A sablonra nem találtam hivatkozást a scripts és .github futtatóiban.
- **Mi hiányzik** — A szerződés előfeltételeinek, invariánsainak, hibáinak és jóváhagyási bizonyítékának kritikus diffhez rendelése ma kézi.
- **Folytatás helye** — AGENTS.md:51
- **Következő lépés** — A háromfázisú ellenőr mellé a szerződéssablon ellenőrzését az érintett útvonalak alapján tervezd meg. Próbadiffben hiányzó invariánst, hiányzó jóváhagyást és nem kritikus módosítást különíts el.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-503 · A lezárás tartalmazza az eredeti kérést, a bizonyítékot és az elakadást

- **Azonosító** — R-KAN-503
- **Cím** — A lezárás tartalmazza az eredeti kérést, a bizonyítékot és az elakadást
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A lezárás tartalmazza az eredeti kérést, a bizonyítékot és az elakadást.
- **Forrás** — AGENTS.md:19; AGENTS.md:30; AGENTS.md:46; AGENTS.md:72; AGENTS.md:123; AGENTS.md:189
- **Mi van kész** — A befejezési és eszkalációs szabály főági dokumentáció. Az állítások és az elakadások tényleges ellenőrzése részben emberi. Az ági session-záró 231276f5 és a GPT-őr 7f15320b eltérő szinten működik.
- **Mi hiányzik** — A session végi kérés–eredmény összevetés, a hiányzó/ellenőrizetlen elem, az öt iteráció és az ismételt megközelítésváltás megbízható megkülönböztetése.
- **Folytatás helye** — AGENTS.md:19
- **Következő lépés** — A feat/session-zaras-kereses-osszevetes session-closeout.test.mjs és a feat/gpt-teljesitesi-or completeness.test.mjs próbájába egy elakadt és egy jogosan lezárt esetet tegyél. A tudatos emberi eszkalációt az ítélet hagyja jóváhagyható állapotban.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-042, P-047

### R-KAN-504 · A tesztintegritás és a bizonyíték minősége kapjon valódi ellenpróbát

- **Azonosító** — R-KAN-504
- **Cím** — A tesztintegritás és a bizonyíték minősége kapjon valódi ellenpróbát
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A tesztintegritás és a bizonyíték minősége kapjon valódi ellenpróbát.
- **Forrás** — AGENTS.md:41; AGENTS.md:67; RUNBOOK.md:262
- **Mi van kész** — Az enforce-repo-rules és warn-test-edit elérhető hook. A #517 terv a szemantikus tesztváltozások értékelését külön szakaszra teszi. A mechanikus figyelmeztetés nem ítéli meg a tartalmat.
- **Mi hiányzik** — A lazuló mérce, jogos spec-változás, túlélő mutáció és puszta formázás megbízható elkülönítése.
- **Folytatás helye** — AGENTS.md:41
- **Következő lépés** — A chore/kapu-teszt-integritas ág és a #187/#188 alapján a kapu fixtúráiban legyen változatlan állítás, lazított tűrés, szigorított tűrés és külön jóváhagyott spec-változás.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-505 · A teljes PR és a teljes funkció kapjon független, hivatkozható review-t

- **Azonosító** — R-KAN-505
- **Cím** — A teljes PR és a teljes funkció kapjon független, hivatkozható review-t
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A teljes PR és a teljes funkció kapjon független, hivatkozható review-t.
- **Forrás** — AGENTS.md:96; .agents/skills/websuli-fejlesztesi-ellenor/SKILL.md:32
- **Mi van kész** — A #489 rögzíti a fejhez kötött ítéletet; scripts/qa/gates/pre-merge-gate.mjs:105 ellenőrzi. A review tárgya a hívókra és korábbi szeletekre is kiterjed a szövegben.
- **Mi hiányzik** — Külön bizonyíték kell az összes érintett fogyasztóra, az utolsó szelet előtti átfogó PR-kommentre és a kritikus lelet cáfolási kísérletére. A főág szállekérése egyszerre az első 100-at kéri (pre-merge-gate.mjs:159).
- **Folytatás helye** — AGENTS.md:96
- **Következő lépés** — A fix/merge-kapu-rest ág #513 tesztjét 101 szállal ellenőrizd. A vak ellenőri ági próba utasítsa el a teljes funkciót el nem érő záró jelentést. A kézi tartalmi review maradjon meg.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-043, P-044, P-061

### R-KAN-506 · A commit, kiadás és környezet közös kapui egyezzenek a tényleges belépőkkel

- **Azonosító** — R-KAN-506
- **Cím** — A commit, kiadás és környezet közös kapui egyezzenek a tényleges belépőkkel
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A commit, kiadás és környezet közös kapui egyezzenek a tényleges belépőkkel.
- **Forrás** — AGENTS.md:152; RUNBOOK.md:247; package.json:13
- **Mi van kész** — Öt gate-parancs van. A .claude/settings.json:12 a támogatott eszközökhöz hookot regisztrál, a CI a lintet külön futtatja (.github/workflows/ci.yml:66). A kézi commit-sorozatzárás és minden telepítési út ugyanilyen kényszerítése nincs bizonyítva.
- **Mi hiányzik** — Az eszközönkénti és kibocsátásonkénti lefedés, beleértve a PR-eszközöket, hibás bizonyítékot és munkafaváltást.
- **Folytatás helye** — AGENTS.md:152
- **Következő lépés** — A következő Q-5 szeletben a settings-hooks.test.mjs állítson fel művelet × belépő × bizonyíték táblát. Minden támogatott kiadási út saját, aktuális bizonyítékot kérjen.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-045, P-047, P-057

### R-KAN-507 · Az architektúra-diagnosztika induljon a szabályban megadott könyvtárból

- **Azonosító** — R-KAN-507
- **Cím** — Az architektúra-diagnosztika induljon a szabályban megadott könyvtárból
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — Az architektúra-diagnosztika induljon a szabályban megadott könyvtárból.
- **Forrás** — AGENTS.md:144; source/package.json:25; package.json:5
- **Mi van kész** — A natív mátrix létezik (.github/workflows/ci.yml:128). A doctor:arch az alkalmazás manifestjében regisztrált, a gyökérmanifestben nincs ilyen név.
- **Mi hiányzik** — A repógyökérből értelmezett diagnosztikai parancs nem ugyanazt a belépőt találja, mint a source csomagból futtatott parancs.
- **Folytatás helye** — AGENTS.md:144
- **Következő lépés** — Egészítsd ki a gyökérmanifest delegálását vagy az AGENTS.md példájában jelöld a source munkakönyvtárat. Manifestfeloldási próbában mindkét dokumentált indulási helyzetet ellenőrizd.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — —

### R-KAN-508 · A kiadási sorrendnek egyetlen élő leírása legyen

- **Azonosító** — R-KAN-508
- **Cím** — A kiadási sorrendnek egyetlen élő leírása legyen
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A kiadási sorrendnek egyetlen élő leírása legyen.
- **Forrás** — RUNBOOK.md:257; AGENTS.md:184; docs/minosegkapuk.md:1
- **Mi van kész** — A runbook helyi main-összefésülést és főági pusht ír. A későbbi tulajdonosi folyamat feature-ágat, PR-t, zöld CI-t és közvetlenül összevonás előtti gate:merge-et ír elő (#489).
- **Mi hiányzik** — A runbookból induló olvasó elavult kiadási útvonalat követhet.
- **Folytatás helye** — RUNBOOK.md:257
- **Következő lépés** — A RUNBOOK.md 9.1–9.2-ben a docs/minosegkapuk.md tényleges sorrendjét hivatkozd. Dokumentációs próbában a kötelező sorrendet és az engedélyköteles lépéseket ellenőrizd.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-509 · A runbook a tényleges tananyaggyártót és jóváhagyási pontot mutassa

- **Azonosító** — R-KAN-509
- **Cím** — A runbook a tényleges tananyaggyártót és jóváhagyási pontot mutassa
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A runbook a tényleges tananyaggyártót és jóváhagyási pontot mutassa.
- **Forrás** — RUNBOOK.md:113; source/server/studio/single-run/engine.ts:554
- **Mi van kész** — A runbook régi step-runner.ts fájlt nevez meg; az origin/main fában nincs ilyen Studio-fájl. A jóváhagyott terv vagy modellterv kiválasztása az engine.ts:699 sorában van, az újragyártás jóváhagyása #256. A régi lépésgép #262-vel kivezetve.
- **Mi hiányzik** — A két indítási út, az egyes valódi döntéshozók, a régi OCR/modellút és a megmaradt aktív eszközök dokumentációja keveredik.
- **Folytatás helye** — RUNBOOK.md:113
- **Következő lépés** — A RUNBOOK.md 4. fejezetét a live.ts és a runSingleLesson állomásaihoz rendeld. A követett relatív fájlcélok létezését és a feltöltés/térképes/folytatási út jóváhagyási ágait ellenőrizd a single-run-engine.test.ts példáival.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-510 · A lintszabályzat a tényleges React-ellenőrzést írja le

- **Azonosító** — R-KAN-510
- **Cím** — A lintszabályzat a tényleges React-ellenőrzést írja le
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A lintszabályzat a tényleges React-ellenőrzést írja le.
- **Forrás** — RUNBOOK.md:321; source/eslint.config.js:33
- **Mi van kész** — A runbook hiányzó hookplugint említ. A csomag telepíti (source/package.json:168), a rules-of-hooks hiba, az exhaustive-deps ki van kapcsolva (eslint.config.js:33–34).
- **Mi hiányzik** — A runbook alapján egy meglévő védelmet hiányként kezelnek; a kézi/parse-őr és a lint tényleges szerepe nincs megkülönböztetve.
- **Folytatás helye** — RUNBOOK.md:321
- **Következő lépés** — A RUNBOOK.md 10. fejezetében dokumentáld a két szabály pontos állapotát. Ellenőrzési fixtúrában feltételes hookhívás bukjon, a célzott adminfelület külön böngészőpróbája maradjon meg.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-511 · A nyilvános dokumentáció is tartsa be a személyesadat-tilalmat

- **Azonosító** — R-KAN-511
- **Cím** — A nyilvános dokumentáció is tartsa be a személyesadat-tilalmat
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A nyilvános dokumentáció is tartsa be a személyesadat-tilalmat.
- **Forrás** — RUNBOOK.md:328; AGENTS.md:248; source/tests/no-real-emails-guard.test.ts:79
- **Mi van kész** — Van célzott e-mail-címőr (#474/#479). A RUNBOOK 11. fejezetében valós gyerekre utaló személyes név szerepel. A címőr csak egy részhalmazt fed le.
- **Mi hiányzik** — A nyilvános eljárásban személytelen példaszöveg és a dokumentumok tartalmi ellenőrzése.
- **Folytatás helye** — RUNBOOK.md:328
- **Következő lépés** — A RUNBOOK.md érintett mondatát szerepkörrel fogalmazd újra. Zárt ellenőrzésben vizsgáld át a régi memóriát is, a tesztbe kizárólag mesterséges példát tegyél. D-14 szerint a történetátírás külön lezárt döntés.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-023

### R-KAN-512 · A Claude-belépő ugyanazt a kötelező ellenőrt adja meg, mint a fő szabályzat

- **Azonosító** — R-KAN-512
- **Cím** — A Claude-belépő ugyanazt a kötelező ellenőrt adja meg, mint a fő szabályzat
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A Claude-belépő ugyanazt a kötelező ellenőrt adja meg, mint a fő szabályzat.
- **Forrás** — CLAUDE.md (origin/main fájlfája); chore/vak-ellenor-deepseek:CLAUDE.md:6
- **Mi van kész** — A helyi main fán és az auditmunkafában nincs gyökér-CLAUDE.md. Az ági fájl követett, a 93e85136, 23d9528b és f84742c7 módosította. Két elérhető munkafában azonos szöveg található.
- **Mi hiányzik** — Az ági belépő, a vak runner és a hozzá tartozó skill együttes főági integrációja.
- **Folytatás helye** — CLAUDE.md (origin/main fájlfája)
- **Következő lépés** — A chore/vak-ellenor-deepseek CLAUDE.md és AGENTS.md szabályát a vak-ellenor.test.mjs teszttel együtt vezesd át. Minden hivatkozása létezzen az egyesített fán.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-043

### R-KAN-513 · A táblastátusz és a lezárási jegyzet kövesse a tényleges eredményt

- **Azonosító** — R-KAN-513
- **Cím** — A táblastátusz és a lezárási jegyzet kövesse a tényleges eredményt
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A táblastátusz és a lezárási jegyzet kövesse a tényleges eredményt.
- **Forrás** — docs/kanban.md:17; docs/kanban.md:43; kanban-jegyek.txt #31/#170
- **Mi van kész** — A dokumentáció doing/review neveket mutat; a mentett export in_progress/in_review neveket használ. A #31 főágon lezárt, a #170 csak B ágon kész. A docs/kanban.md:18 által elveszettként jelölt régi #6–11 ma más jelentéssel szerepel az exportban.
- **Mi hiányzik** — Egyértelmű táblaazonosság, a régi és az új számterek elválasztása, valamint a hivatkozással igazolt státuszátvezetés.
- **Folytatás helye** — docs/kanban.md:17
- **Következő lépés** — A docs/kanban.md és a chore/allapot-ellenorok kanban-check.mjs próbája az export tényleges értékeivel dolgozzon. Külön fixtúra legyen lezárt de ági, nyitott de beépült és névazonos régi jegyre.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-047

### R-KAN-514 · A review-méret, szakaszolás és aktív követés határai legyenek ellenőrizhetők

- **Azonosító** — R-KAN-514
- **Cím** — A review-méret, szakaszolás és aktív követés határai legyenek ellenőrizhetők
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A review-méret, szakaszolás és aktív követés határai legyenek ellenőrizhetők.
- **Forrás** — AGENTS.md:62; AGENTS.md:194; scripts/qa/pr-size-check.mjs:1
- **Mi van kész** — Van PR-méretellenőr, a szakaszolás és a folyamatkövetés írott mandátum. A diffméret önmagában nem igazolja a teljes függőleges egységet vagy a folyamatos megfigyelést.
- **Mi hiányzik** — Túlméretes funkcióhoz szeletkapcsolat és megfigyelt futások lezárási bizonyítéka. A szakmai értékelést a reviewer végzi.
- **Folytatás helye** — AGENTS.md:62
- **Következő lépés** — A pr-size-check.mjs eredményét rendeld a spec szeleteihez, a hosszú futás állapotát a session-closeout ági próbájához. Egy közös modul több szeletet érintő változása legyen a kontroll.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-042, P-060

### R-KAN-515 · A javító skill minden tartalomtípusnál mentett, konkurenciabiztos alkalmazást kér

- **Azonosító** — R-KAN-515
- **Cím** — A javító skill minden tartalomtípusnál mentett, konkurenciabiztos alkalmazást kér
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A javító skill minden tartalomtípusnál mentett, konkurenciabiztos alkalmazást kér.
- **Forrás** — .agents/skills/tananyag-javito/SKILL.md:14; docs/lesson-improvement.md:1
- **Mi van kész** — A skill külön jelöltet, mentést, atomikus alkalmazást, visszaolvasást, a régi és új módszerverziók és a hibás válaszok vizsgálatát rögzíti. A szerveres structured-improvement és az integrációs leckepróbák léteznek.
- **Mi hiányzik** — Külön igazolandó a HTML és Studio ág, régi anyag, javítás alatti szerkesztés, valamint az admin-előnézet és a ténylegesen alkalmazott verzió egyezése.
- **Folytatás helye** — .agents/skills/tananyag-javito/SKILL.md:14
- **Következő lépés** — A structured-improvement.ts és a storage.ts próbájában ütközzön két jelölt. Siker után legyen meg az előmentés és az új hash. A tananyag_browser_test.py valamint a lapi próba ellenőrizze a négy lapot és részpontokat.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — —

### R-KAN-516 · A készítő skill pedagógiai minimumai és a megjelenés együtt érvényesüljenek

- **Azonosító** — R-KAN-516
- **Cím** — A készítő skill pedagógiai minimumai és a megjelenés együtt érvényesüljenek
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A készítő skill pedagógiai minimumai és a megjelenés együtt érvényesüljenek.
- **Forrás** — .agents/skills/tananyag-keszito/SKILL.md:14; .agents/skills/tananyag-keszito/SKILL.md:32
- **Mi van kész** — A HTML-ellenőr source/server/improve/verify-html.ts és a standalone tananyag_verify.py / tananyag_browser_test.py létezik. A #515 forrásábra- és #516 hanglánc csak a teljes szerződés része.
- **Mi hiányzik** — A 45/75 minimum, módszerek, tanított tartalom, nyelvlecke hangja, v7.5 asztali tördelés és évfolyamhoz illő tipográfia együttes igazolása minden generálási úton.
- **Folytatás helye** — .agents/skills/tananyag-keszito/SKILL.md:14
- **Következő lépés** — A scripts/tananyag két ellenőrzőjének és az improve-verify-html.test.ts próbának ugyanazt a szintetikus, hosszú leckét add. Hibás bankmérettel és 320/1200/1500/2000 px-en ellenőrizd a várt elkülönített hibát.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-028, P-030

### R-KAN-517 · Az internetes skill a jelenleg használt forrásgyűjtést és gyártást írja elő

- **Azonosító** — R-KAN-517
- **Cím** — Az internetes skill a jelenleg használt forrásgyűjtést és gyártást írja elő
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — Az internetes skill a jelenleg használt forrásgyűjtést és gyártást írja elő.
- **Forrás** — .agents/skills/websuli-internet-pipeline/SKILL.md:16; source/server/studio/web-research-routes.ts:21
- **Mi van kész** — A dokumentum köztes HTML-szerzőt és külön banképítést ír le. A fő működési út a gyűjtést és az egyfutásos Studio-gyártást köti össze.
- **Mi hiányzik** — A jelenlegi fetch–forrás–tananyag kapcsolat, jogosultság, üres letöltés és közös runtime igazolása a leírt sorrendhez képest.
- **Folytatás helye** — .agents/skills/websuli-internet-pipeline/SKILL.md:16
- **Következő lépés** — Az internet-pipeline skill lépéseit rendeld a generateWebStudioLesson tényleges függőségeihez. A web-research-completion.test.ts próbában letöltés nélküli vagy üres forrásból ne induljon gyártás.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-518 · A determinisztikus Studio-eszközök automatikus és kézi határa egyezzen

- **Azonosító** — R-KAN-518
- **Cím** — A determinisztikus Studio-eszközök automatikus és kézi határa egyezzen
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A determinisztikus Studio-eszközök automatikus és kézi határa egyezzen.
- **Forrás** — .agents/skills/websuli-studio-tools/SKILL.md:14; source/scripts/studio-tool.ts:31
- **Mi van kész** — A CLI a 31–60. sorban öt eszközt választ, köztük a bank-salvage-et. A skill táblázatában a kivezetett section-patch szerepel, a mai salvage belépő önálló sorban hiányzik. Az egyfutásos motor vázlatjavítása az engine.ts:701 sorában van.
- **Mi hiányzik** — Pontos név szerinti CLI-készlet, aktív lapi/gyártási hívó és érvényes szerep-skill összerendelése.
- **Folytatás helye** — .agents/skills/websuli-studio-tools/SKILL.md:14
- **Következő lépés** — A skill táblázatát egyeztesd a studio-tool.ts kapcsolóival és a role-skills.ts leírásaival. A studio-tools.test.ts egy javítható formai esetet és egy szándékosan változatlan tartalmi hibát fedjen.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-519 · A gyártáselemző skill külön jelezze a történeti árat és a ma érvényes cikluskorlátot

- **Azonosító** — R-KAN-519
- **Cím** — A gyártáselemző skill külön jelezze a történeti árat és a ma érvényes cikluskorlátot
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A gyártáselemző skill külön jelezze a történeti árat és a ma érvényes cikluskorlátot.
- **Forrás** — .claude/skills/websuli-gyartas-analitika/SKILL.md:8; source/server/studio/legacy-migration.ts:32
- **Mi van kész** — A skill ötös felülvizsgálatot és rögzített árú számítási példát ír. A korlát főági értéke 178, a teszt 137 + 41 engedélyezett végciklust rögzít (regi-anyag-studio.test.ts:113).
- **Mi hiányzik** — Az utolsó rendkívüli adag és a következő új kampány szabálya könnyen összetéveszthető. A történeti egységár nem friss árajánlat.
- **Folytatás helye** — .claude/skills/websuli-gyartas-analitika/SKILL.md:8
- **Következő lépés** — A skill jelölje külön a lezárt kampányt és az új jóváhagyást. Árazás dátumozott bemenetből számolódjon. Fixtúrán bizonyítsd az öt plusz egy határt és a történeti végciklust.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-059

## Ágakon fennmaradt csapdák

A helyi és távoli követőrefek 19 különböző katalógusverziójának címei alapján 23 további, tartalmilag különböző bejegyzés azonosítható. A régi C-73 cím azonos a mai C-75 címével. Az ági C-76, C-77, C-78, C-79 és C-86 több jelentést hordoz; a forráság a tétel kulcsának része.

### R-KAN-601 · C-86 — `npm ci` a runbook szerint, de ellenőrizetlen gépszintű következtetéssel; a kapu-napló közös útvonalon

- **Azonosító** — R-KAN-601
- **Cím** — C-86 — `npm ci` a runbook szerint, de ellenőrizetlen gépszintű következtetéssel; a kapu-napló közös útvonalon
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Közös napló helyett munkafához és futáshoz rendelt bizonyíték kell; a natív telepítési hiba gépszintű oka külön mérendő.
- **Forrás** — `chore/szkriptkapuk-p2-bizonyitek-lanc:docs/agent-csapdak.md:1110`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `77e69552`. Kapcsolódó kód vagy próba `scripts/qa/gates/evidence-chain.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `chore/szkriptkapuk-p2-bizonyitek-lanc` · `scripts/qa/gates/evidence-chain.test.mjs`
- **Következő lépés** — `scripts/qa/gates/evidence-chain.test.mjs` · Két munkafás próbában párhuzamos, eltérő eredményű futás naplója külön maradjon. A gépfüggő következtetést két környezeten ellenőrizd.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-058

### R-KAN-602 · C-80 — „Csak zároló” várakozó: a zár 1 óra 40 percig üresen állt

- **Azonosító** — R-KAN-602
- **Cím** — C-80 — „Csak zároló” várakozó: a zár 1 óra 40 percig üresen állt
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Üresen tartott zár blokkolhatja az egész sort.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1101`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · A zár megszerzése és a gyermek indítása közé adj hibát; a következő jogos váró kapja meg a sávot.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-603 · C-81 — A sorrend előzése: a hátrébb állók elvitték a sávot

- **Azonosító** — R-KAN-603
- **Cím** — C-81 — A sorrend előzése: a hátrébb állók elvitték a sávot
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A sor elején várakozó élő folyamat elsőbbsége megőrzendő.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1110`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · Három várót indíts eltérő időben, a másodikat szakítsd meg. Az első és harmadik FIFO-sorrendjét igazold.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-604 · C-82 — Futó bash-szkript szerkesztése

- **Azonosító** — R-KAN-604
- **Cím** — C-82 — Futó bash-szkript szerkesztése
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A futó shell-szkript módosítása összekeverheti a két verzió utasításait.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1117`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · A feat/gepi-zar runbookjában írj elő verziózott példányt. Két külön szintetikus szkript induláskor rögzített verziót használjon végig.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-060

### R-KAN-605 · C-83 — Mintaillesztéses folyamatleállítás idegen folyamatokat ölt meg

- **Azonosító** — R-KAN-605
- **Cím** — C-83 — Mintaillesztéses folyamatleállítás idegen folyamatokat ölt meg
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Leállításkor minden érintett folyamat a saját futás része legyen.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1123`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · Két egyformán nevezett, de külön tulajdonú próbafolyamattal ellenőrizd, hogy a másik folyamat életben marad.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-060

### R-KAN-606 · C-84 — A figyelő helyi időt számolt UTC helyett

- **Azonosító** — R-KAN-606
- **Cím** — C-84 — A figyelő helyi időt számolt UTC helyett
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A zár korát ne a helyi falióra-eltolásból számolják.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1132`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · Azonos UTC-pillanatot két időzónában és óraátállás körül modellezz. A várakozási sorrend és a lejárat legyen azonos.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-607 · C-85 — A vak futtató nehéz eszközei zár nélkül futottak

- **Azonosító** — R-KAN-607
- **Cím** — C-85 — A vak futtató nehéz eszközei zár nélkül futottak
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Az ellenőri segédfolyamat a nehéz eszközt ugyanazon soron indítsa.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1138`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · Két külön adapterből kérj nehéz műveletet; egyszerre egy szintetikus gyermek kapjon futási jogot.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-043, P-046

### R-KAN-608 · C-86 — Zár „ellenőrzöm, aztán cselekszem” lépéspárral: a régi gazda lebontotta volna az új zárat

- **Azonosító** — R-KAN-608
- **Cím** — C-86 — Zár „ellenőrzöm, aztán cselekszem” lépéspárral: a régi gazda lebontotta volna az új zárat
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A régi gazda zárfeloldása és az új gazda szerzése legyen kölcsönösen kizárt.
- **Forrás** — `feat/gepi-zar:docs/agent-csapdak.md:1147`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `a707d24d`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gepi-zar` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · Állítsd meg az első gazdát a két lépés közepén, indíts másodikat, és ellenőrizd a tulajdonjogot a folytatás után.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-609 · C-87 — A GPT-modell „megáll, mielőtt végrehajtaná”: terv / kérdés / félbehagyott jelentés, vagy élő, de nem haladó futás

- **Azonosító** — R-KAN-609
- **Cím** — C-87 — A GPT-modell „megáll, mielőtt végrehajtaná”: terv / kérdés / félbehagyott jelentés, vagy élő, de nem haladó futás
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A hiányzó javítási javaslattal lezárt válasz ne számítson késznek.
- **Forrás** — `feat/gpt-teljesitesi-or:docs/agent-csapdak.md:1110`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `27d51327`. Kapcsolódó kód vagy próba `scripts/qa/gates/blind-review/completeness.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gpt-teljesitesi-or` · `scripts/qa/gates/blind-review/completeness.test.mjs`
- **Következő lépés** — `scripts/qa/gates/blind-review/completeness.test.mjs` · Egyetlen üres következő lépéssel és egy hiányzó azonosítóval próbáld a determinisztikus számlálást és a korlátos folytatást.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — —

### R-KAN-610 · C-88 — „Néma” kilépés: az ok a naplóban volt, csak senki nem emelte ki; élő zárvárást halálnak néztünk

- **Azonosító** — R-KAN-610
- **Cím** — C-88 — „Néma” kilépés: az ok a naplóban volt, csak senki nem emelte ki; élő zárvárást halálnak néztünk
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Az élő várakozást és a tényleges befejezést külön kell jelezni.
- **Forrás** — `feat/gpt-teljesitesi-or:docs/agent-csapdak.md:1123`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `27d51327`. Kapcsolódó kód vagy próba `scripts/qa/gates/blind-review/exit-trace.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/gpt-teljesitesi-or` · `scripts/qa/gates/blind-review/exit-trace.mjs`
- **Következő lépés** — `scripts/qa/gates/blind-review/exit-trace.mjs` · Három fixtúra legyen: szabályos befejezés, hibakódos kilépés, élő zárvárás. Mindháromnál a megfelelő állapot maradjon a naplóban.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-060

### R-KAN-611 · C-76 — Sim-teszt csak a küszöb ELŐTTI eseményt mérte: a „véletlen válasz 0” a választott mintákra volt szabva

- **Azonosító** — R-KAN-611
- **Cím** — C-76 — Sim-teszt csak a küszöb ELŐTTI eseményt mérte: a „véletlen válasz 0” a választott mintákra volt szabva
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A nullahibás mintáról derüljön ki, hogy elérte-e a döntési ágat.
- **Forrás** — `feat/jatek-j7b-tornado-utelagazas:docs/agent-csapdak.md:1110`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `b066296d`. Kapcsolódó kód vagy próba `source/tests/tornado-sim.test.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/jatek-j7b-tornado-utelagazas` · `source/tests/tornado-sim.test.ts`
- **Következő lépés** — `source/tests/tornado-sim.test.ts` · A tiltott válasz számlálója mellé pozitív elérési feltételt adj; az időablak előtt és után is legyen szimulált mozdulat.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-003

### R-KAN-612 · C-76 — Célzott ellenőrzésből kimaradt teszt-típusellenőrzés; CRLF-es munkafa a szöveges cseréknél

- **Azonosító** — R-KAN-612
- **Cím** — C-76 — Célzott ellenőrzésből kimaradt teszt-típusellenőrzés; CRLF-es munkafa a szöveges cseréknél
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A célzott vizsgálat a teszt-típushibát és a sorvég okozta kihagyott módosítást is észlelje.
- **Forrás** — `feat/tgm-s2b-dontesi-fa-kepes-kartya:docs/agent-csapdak.md:1110`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `75c67b12`. Kapcsolódó kód vagy próba `source/tests/source-visuals.test.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `feat/tgm-s2b-dontesi-fa-kepes-kartya` · `source/tests/source-visuals.test.ts`
- **Következő lépés** — `source/tests/source-visuals.test.ts` · Az S2b próba TS-kódját az alkalmazás és a teszt külön konfigurációjával ellenőrizd; CRLF- és LF-fixtúrán azonos tartalmi diff keletkezzen.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-028

### R-KAN-613 · C-76 — Vak-kör oszcilláció: hat kör egy doksin

- **Azonosító** — R-KAN-613
- **Cím** — C-76 — Vak-kör oszcilláció: hat kör egy doksin
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A többkörös review ne ismételje korlátlanul ugyanazt a kis eltérést.
- **Forrás** — `fix/kapu-gyorsitas:docs/agent-csapdak.md:1114`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `037691a2`. Kapcsolódó kód vagy próba `scripts/qa/gates/pre-merge-gate.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/kapu-gyorsitas` · `scripts/qa/gates/pre-merge-gate.test.mjs`
- **Következő lépés** — `scripts/qa/gates/pre-merge-gate.test.mjs` · Alacsony és blokkoló lelet ugyanabban a szintetikus jelentésben kapjon eltérő megállási döntést a dokumentált körszám után.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-043, P-046

### R-KAN-614 · C-77 — Gép-zár: nehéz kör csak zárral; folyamat-leállítás csak pontos PID alapján

- **Azonosító** — R-KAN-614
- **Cím** — C-77 — Gép-zár: nehéz kör csak zárral; folyamat-leállítás csak pontos PID alapján
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A régi kétsávos előírást a november 19-i egy gépi sáv döntése felülírta.
- **Forrás** — `fix/kapu-gyorsitas:docs/agent-csapdak.md:1126`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `037691a2`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A régi üzemeltetési szabály szövegének átvezetése.
- **Folytatás helye** — `fix/kapu-gyorsitas` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · A fix/kapu-gyorsitas ági szövegét egyeztesd a feat/gepi-zar tesztjével; két egyidejű nehéz kérésnél a második várjon.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-615 · C-78 — Main-beolvasztás: új CI-kör és bizonyíték-vesztés helyett gépi próba és átvitel

- **Azonosító** — R-KAN-615
- **Cím** — C-78 — Main-beolvasztás: új CI-kör és bizonyíték-vesztés helyett gépi próba és átvitel
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Az összefésült próba különböztesse meg a valódi tesztet az üres modultól. Az átvitelt a 06116e93 különválasztotta.
- **Forrás** — `fix/kapu-gyorsitas:docs/agent-csapdak.md:1136`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `037691a2`. Kapcsolódó kód vagy próba `scripts/qa/gates/merged-probe.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/kapu-gyorsitas` · `scripts/qa/gates/merged-probe.test.mjs`
- **Következő lépés** — `scripts/qa/gates/merged-probe.test.mjs` · A merged-probe tesztben üres tesztmodul és egy tényleges állítás eltérő eredményt adjon. Az átvitel saját szerződése külön maradjon.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-046, P-058

### R-KAN-616 · C-79 — Gyorsító kapu bizalmi határa: ki indíthat kódfuttatást, mihez kötött az engedély

- **Azonosító** — R-KAN-616
- **Cím** — C-79 — Gyorsító kapu bizalmi határa: ki indíthat kódfuttatást, mihez kötött az engedély
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Az engedély és az ítélet pontosan a vizsgált főághoz, PR-hez és fejhez tartozzon.
- **Forrás** — `fix/kapu-gyorsitas:docs/agent-csapdak.md:1151`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `037691a2`. Kapcsolódó kód vagy próba `scripts/qa/gates/pre-merge-gate.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/kapu-gyorsitas` · `scripts/qa/gates/pre-merge-gate.test.mjs`
- **Következő lépés** — `scripts/qa/gates/pre-merge-gate.test.mjs` · Eltérő főági fejjel és meglévő elutasító eredménnyel próbáld a kaput. A korábbi ítélet helyességét az új bizonyíték ne feltételezze.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-044, P-046

### R-KAN-617 · C-76 — A push-kapu `native-arch` bukása önmagában kivétel; állapotra várj, ne időre

- **Azonosító** — R-KAN-617
- **Cím** — C-76 — A push-kapu `native-arch` bukása önmagában kivétel; állapotra várj, ne időre
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A dokumentált natív kivétel és a valódi alkalmazásteszt-hiba külön legyen látható.
- **Forrás** — `fix/szokoar-tema-es-sebesseg:docs/agent-csapdak.md:1114`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `e1332ec7`. Kapcsolódó kód vagy próba `scripts/qa/gates/pre-push-gate.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` · `scripts/qa/gates/pre-push-gate.test.mjs`
- **Következő lépés** — `scripts/qa/gates/pre-push-gate.test.mjs` · Natív és második hibás próbát együtt vizsgálj. A teljes csoport maradjon hibás, az élesedést váró mobilmérő pedig állapotra reagáljon.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-618 · C-77 — Takarás-döntés pontból: a rács hézagában „szabad”, közben takarva

- **Azonosító** — R-KAN-618
- **Cím** — C-77 — Takarás-döntés pontból: a rács hézagában „szabad”, közben takarva
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Üres rácshézagban sem takarhatja vezérlő a játékos interakciós területét.
- **Forrás** — `fix/szokoar-tema-es-sebesseg:docs/agent-csapdak.md:1123`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `e1332ec7`. Kapcsolódó kód vagy próba `source/tests/tsunami-shift.test.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` · `source/tests/tsunami-shift.test.ts`
- **Következő lépés** — `source/tests/tsunami-shift.test.ts` · A metszetet ne csak egyetlen pontban mérd. Rácshézag, takart él, álló és fekvő nézet külön próbát kapjon.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-005

### R-KAN-619 · C-78 — A „lagg” oka egy lusta hangkontextus volt, nem a grafika

- **Azonosító** — R-KAN-619
- **Cím** — C-78 — A „lagg” oka egy lusta hangkontextus volt, nem a grafika
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — Az első hang eszközmegnyitási ideje ne számítson grafikai akadásnak.
- **Forrás** — `fix/szokoar-tema-es-sebesseg:docs/agent-csapdak.md:1140`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `e1332ec7`. Kapcsolódó kód vagy próba `source/tests/audio-engine-prewarm.test.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` · `source/tests/audio-engine-prewarm.test.ts`
- **Következő lépés** — `source/tests/audio-engine-prewarm.test.ts` · Friss böngészőben hasonlítsd össze az első felhasználói mozdulat utáni és előmelegített lejátszást. Külön rögzítsd a hang és a render késését.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-040

### R-KAN-620 · C-79 — A kapu bukásának oka a kapu saját naplójában van; a jelenet-betöltés változása után a mobil mérő is kell

- **Azonosító** — R-KAN-620
- **Cím** — C-79 — A kapu bukásának oka a kapu saját naplójában van; a jelenet-betöltés változása után a mobil mérő is kell
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A jelenetbetöltés változása után a saját játékteszt mellett a közös mérő is fusson.
- **Forrás** — `fix/szokoar-tema-es-sebesseg:docs/agent-csapdak.md:1152`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `e1332ec7`. Kapcsolódó kód vagy próba `source/tests/game-mobile-quality.spec.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` · `source/tests/game-mobile-quality.spec.ts`
- **Következő lépés** — `source/tests/game-mobile-quality.spec.ts` · A Szökőár ágát késleltetett modellel vizsgáld a saját próbában és a közös mobilmátrixban. A hibás eset külön naplója visszakereshető legyen.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-005, P-050

### R-KAN-621 · C-76 — A teszt mércéjét ne igazítsd az új implementációhoz — a saját, még be nem olvasztott tesztét sem

- **Azonosító** — R-KAN-621
- **Cím** — C-76 — A teszt mércéjét ne igazítsd az új implementációhoz — a saját, még be nem olvasztott tesztét sem
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A mérőt ne igazítsák észrevétlenül az új kód pillanatnyi kimenetéhez.
- **Forrás** — `perf/kockavadasz-telefon-gyors:docs/agent-csapdak.md:1112`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `80cdfd17`. Kapcsolódó kód vagy próba `source/tests/perf-stats.test.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `perf/kockavadasz-telefon-gyors` · `source/tests/perf-stats.test.ts`
- **Következő lépés** — `source/tests/perf-stats.test.ts` · Ugyanazzal a képkocka-idősorral hasonlítsd össze a régi és új panelt. A mértékadó határ és a jelzés oka szerepeljen a próbában.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-004

### R-KAN-622 · C-77 — Folyamatot csak saját, egyedi jelölő vagy pontos PID alapján állíts le, mintaillesztéssel soha

- **Azonosító** — R-KAN-622
- **Cím** — C-77 — Folyamatot csak saját, egyedi jelölő vagy pontos PID alapján állíts le, mintaillesztéssel soha
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A várakozó leállítása azonos parancsú idegen munkamenetet nem érinthet.
- **Forrás** — `perf/kockavadasz-telefon-gyors:docs/agent-csapdak.md:1127`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `80cdfd17`. Kapcsolódó kód vagy próba `scripts/qa/machine-lock.test.mjs`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `perf/kockavadasz-telefon-gyors` · `scripts/qa/machine-lock.test.mjs`
- **Következő lépés** — `scripts/qa/machine-lock.test.mjs` · A Kockavadász ági szabályt hangold össze a feat/gepi-zar folyamatfatesztjével. Idegen azonos parancsú próbafolyamat folytassa a működést.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-060

### R-KAN-623 · C-89 — Ingadozó fókuszteszt: előbb napló (ki viszi a fókuszt), csak utána javítás; Radix-réteg Escape-vaksága

- **Azonosító** — R-KAN-623
- **Cím** — C-89 — Ingadozó fókuszteszt: előbb napló (ki viszi a fókuszt), csak utána javítás; Radix-réteg Escape-vaksága
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — advent
- **Prioritás-javaslat** — P2. Ági javítás vagy a munkarend integrálásához szükséges követő feladat.
- **Eredeti utasítás / cél** — A párbeszédablak bezárása utáni fókusz a helyes vezérlőre térjen vissza.
- **Forrás** — `wip/advent-c-javitas:docs/agent-csapdak.md:1110`
- **Mi van kész** — Az ág tartalmazza a csapdát. Ellenőrzött ágfej `1c667e26`. Kapcsolódó kód vagy próba `source/tests/advent-dialog-escape.test.ts`.
- **Mi hiányzik** — A főági katalógusban ez a cím hiányzik. A védelem integrációját az itt megadott ági próbával kell egyeztetni.
- **Folytatás helye** — `wip/advent-c-javitas` · `source/tests/advent-dialog-escape.test.ts`
- **Következő lépés** — `source/tests/advent-dialog-escape.test.ts` · Az ági dialog-escape.ts mellett a naptár valódi böngészőpróbájában Escape, eltűnő nyitógomb és felhasználó által közben átállított fókusz kapjon külön esetet.
- **Függőség / ütközés** — Az ági C-számok beolvasztás előtt ütközhetnek.
- **Kapcsolódó P-tétel** — P-035

## A segédprogramok és a kötelező kanban-jegy

### R-KAN-526 · A javító segédprogram forrástartalom nélkül ne tölthesse fel a bankot

- **Azonosító** — R-KAN-526
- **Cím** — A javító segédprogram forrástartalom nélkül ne tölthesse fel a bankot
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hibás elfogadás vagy a téves eljárási út későbbi munkát ronthat.
- **Eredeti utasítás / cél** — A javító segédprogram forrástartalom nélkül ne tölthesse fel a bankot.
- **Forrás** — .agents/skills/tananyag-javito/scripts/fix_tananyag.py:89; .agents/skills/tananyag-javito/SKILL.md:20
- **Mi van kész** — A generátor a témacímből készít A–D opciókat, a helyes indexet nullára állítja. A 106. sorban hasonlóan sablonos szöveges feladatot gyárt; a 120. sorban a kérdésszám a javítás célja.
- **Mi hiányzik** — A segédprogramban hiányzik a szakmai tartalomhoz és a megtanított tényhez kötött pótlási feltétel. Ez a kézi segédre vonatkozó lelet.
- **Folytatás helye** — .agents/skills/tananyag-javito/scripts/fix_tananyag.py:89
- **Következő lépés** — A fix_tananyag.py hiányos bankra jelezze a tényleges hiányt; tartalmat csak forráshoz rendelt, jóváhagyható jelöltből vegyen át. Egy 74 valódi kérdéses fixtúra automatikus javítás után se kapjon címből kitalált 75. kérdést.
- **Függőség / ütközés** — A javításkori érvényességet szintetikus bemenettel igazold.
- **Kapcsolódó P-tétel** — —

### R-KAN-527 · A javító skill régi HTML-ellenőre ne igazolhasson túl kicsi bankot

- **Azonosító** — R-KAN-527
- **Cím** — A javító skill régi HTML-ellenőre ne igazolhasson túl kicsi bankot
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hibás elfogadás vagy a téves eljárási út későbbi munkát ronthat.
- **Eredeti utasítás / cél** — A javító skill régi HTML-ellenőre ne igazolhasson túl kicsi bankot.
- **Forrás** — .agents/skills/tananyag-javito/scripts/validate_tananyag.py:110; .agents/skills/tananyag-javito/references/hiba-katalogus.md:1; .agents/skills/tananyag-javito/references/html-sablon.md:1
- **Mi van kész** — A két referencia v7.1. A validátor az egész szövegben számol mintákat; a 114. sornál 70-től teljesül az ellenőrzés, az üzenet 75-öt közöl, 50 felett a hiány legfeljebb figyelmeztetés. A készítő skill közös kiadási minimumot ír.
- **Mi hiányzik** — A lecke verziója szerint kiválasztott valódi JSON-bank és pontos kiadási darabszám ellenőrzése.
- **Folytatás helye** — .agents/skills/tananyag-javito/scripts/validate_tananyag.py:110
- **Következő lépés** — A validate_tananyag.py és a két referencia különítse el a történeti olvasást és az új publikálást. 49, 50, 69, 70, 74 és 75 elemnél ellenőrizd a kilépési állapotot, és külön fixtúrában legyen bankszerű szöveg a bankon kívül.
- **Függőség / ütközés** — A javításkori érvényességet szintetikus bemenettel igazold.
- **Kapcsolódó P-tétel** — —

### R-KAN-528 · A runbook HTML-ellenőrzési példája a megfelelő eszközt indítsa

- **Azonosító** — R-KAN-528
- **Cím** — A runbook HTML-ellenőrzési példája a megfelelő eszközt indítsa
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A hibás elfogadás vagy a téves eljárási út későbbi munkát ronthat.
- **Eredeti utasítás / cél** — A runbook HTML-ellenőrzési példája a megfelelő eszközt indítsa.
- **Forrás** — RUNBOOK.md:218; .agents/skills/tananyag-javito/scripts/quick_validate.py:12; .agents/skills/tananyag-javito/scripts/package_skill.py:16
- **Mi van kész** — A quick_validate egy könyvtár SKILL.md fájljának frontmatterjét várja (17–24. sor), a package_skill ezt importálja csomagoláshoz. A RUNBOOK.md HTML-fájlt ad neki. A repóban külön létezik a scripts/tananyag/tananyag_verify.py.
- **Mi hiányzik** — A dokumentált HTML-paraméter helyes HTML esetén is hibás bemenettípus ehhez a programhoz. A runbook „egyetlen Python-hely” állítása mellett a scripts/tananyag is követett.
- **Folytatás helye** — RUNBOOK.md:218
- **Következő lépés** — A RUNBOOK.md 7. fejezetében a csomagvalidálást és a tananyag-validálást saját parancsával dokumentáld. Egy érvényes skillkönyvtár és egy érvényes HTML mindegyike a neki szánt ellenőrön menjen át.
- **Függőség / ütközés** — A javításkori érvényességet szintetikus bemenettel igazold.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-529 · A kötelező állandó kanban-jegy legyen azonosítható a mentett táblán

- **Azonosító** — R-KAN-529
- **Cím** — A kötelező állandó kanban-jegy legyen azonosítható a mentett táblán
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A hibás elfogadás vagy a téves eljárási út későbbi munkát ronthat.
- **Eredeti utasítás / cél** — A kötelező állandó kanban-jegy legyen azonosítható a mentett táblán.
- **Forrás** — docs/kanban.md:18; docs/kanban.md:53; kanban-lista.txt:1
- **Mi van kész** — A dokumentum szerint a régi állandó jegyet újra felvették. A 209 exportált jegy címében nincs STANDING jelölés; a jelenlegi #11 térképtulajdonlási ügy.
- **Mi hiányzik** — Az új állandó jegy egyedi azonosítója és a régi számozás kapcsolata ebből a mentésből nem állapítható meg.
- **Folytatás helye** — docs/kanban.md:18
- **Következő lépés** — A jogosult táblatulajdonos a docs/kanban.md leírását egyeztesse a tábla eredetével és a teljes jegyszöveggel. A kanban-check próbája a történeti #11-et és a mostani eltérő tárgyú #11-et különítse el.
- **Függőség / ütközés** — A javításkori érvényességet szintetikus bemenettel igazold.
- **Kapcsolódó P-tétel** — P-047

### R-KAN-530 · A böngészős hibajelentések élő végpontja szerepeljen az üzemeltetési leírásban

- **Azonosító** — R-KAN-530
- **Cím** — A böngészős hibajelentések élő végpontja szerepeljen az üzemeltetési leírásban
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A hibakereső a téves leírás miatt kihagyhatja a szerveroldali kliensriportokat.
- **Eredeti utasítás / cél** — Klienshibánál az aktuális naplózási és diagnosztikai út vezessen a jelzéshez.
- **Forrás** — RUNBOOK.md:293; #309
- **Mi van kész** — A runbook a korábbi HMAC-os végpont alapján elérhetetlennek írja a kliensriportokat. A főági 5d3aebfe a böngészőhöz külön forrást adott: source/server/routes/client-error.ts és source/client/src/lib/client-error-body.ts.
- **Mi hiányzik** — A két külön rendeltetésű végpont és a nekik megfelelő bizonyíték megjelölése.
- **Folytatás helye** — RUNBOOK.md:285
- **Következő lépés** — A 9.4 szakaszt igazítsd a #309 útjához. A source/tests/client-error-report.spec.ts-ben mesterséges klienshiba jusson el a megfelelő handlerig, és az error-report-hmac.test.ts külön ellenőrizze a másik csatorna hitelesítését.
- **Függőség / ütközés** — A kliens naplóiból érzékeny adat nem kerülhet a hibajelentésbe.
- **Kapcsolódó P-tétel** — P-051

## LEDGER és BACKLOG · forrásmutató

A táblázat minden dátumfejezetet az eredeti sorrendben követ. A git-oszlop a fejezetben említett főági előzmény azonosítására szolgál. Egy kódcommit az adott kor éles adatműveletét önmagában nem tanúsítja.

| LEDGER-sor | Dátum | Tárgy | Főági nyom | Mai kapcsolat vagy lezárás |
|---:|---|---|---|---|
| 16 | 2026-07-20 | Főoldali kérésvihar, menühiba, titokhigiénia | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-523, R-KAN-524 |
| 47 | 2026-07-20 | A júliusi javítások kiadási kapui | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | A szolgáltatói kiszolgálás csak történeti mérés. |
| 61 | 2026-07-21 | Git-előzmény tisztítása és szolgáltatói visszavonás | `517510b4` | R-KAN-523 |
| 74 | 2026-09-01 | QA-készlet és szeptemberi kiadás | `d162bd45`, #5 `58ae1c7f` | A következő naplófejezet lezárja a #6 kérdését. |
| 95 | 2026-09-01 | #6 integráció és az akkori e2e-bukás | `5b55fe0a`, `158d24b3`, `1e1a1410` | A 197. sortól külön CI-javítás szerepel. |
| 111 | 2026-09-01 | Mélyaudit, blokkrajzolás és javítási útvonal | #2 `a7c379e9` | R-KAN-524 |
| 155 | 2026-09-02 | Audit utáni kiadás és CI-konfiguráció | `47ff967f`, `7a1f086f` | R-KAN-508 |
| 169 | 2026-09-02 | Négy adatvédelmi, nézet- és migrációs feladat | `9ff8ebb5` | 8b8e2622 · négy javítási osztály |
| 197 | 2026-09-02 | CI böngészőteszt és éles konfiguráció | `27c6bd7f` | R-KAN-068, R-KAN-530 |
| 219 | 2026-09-02 | Szólétra felület és pályaélmény | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-089 |
| 234 | 2026-09-09 | Fúziós v7.4 és internetes gyártás | `ce87955b` | R-KAN-516, R-KAN-517 |
| 250 | 2026-09-09 | Animátor szolgáltatói hibája és tartalékmodellje | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | A régi lépésgép kivezetése #262. |
| 262 | 2026-09-09 | Kulcssorrend miatti hibás szerződésítélet | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | #262 kivezette a régi gyártóutat. |
| 272 | 2026-09-13 | Internetes HTML forrásjegyzékének hiánya | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-517 |
| 293 | 2026-09-19 | Webes és feltöltéses teljes gyártás | `67a03dda`, #68 `a74a4e7f`, #69 `6cdb4aeb` | R-KAN-522 |
| 311 | 2026-09-19 | Szerepek, mérési időcél, bankkörök | `3f9aaa29`, `2a75e78b`, `2cdbf266` | R-KAN-522 |
| 333 | 2026-09-20 | Változatos tananyag-megjelenés | #91 `ec786823` | R-KAN-146 |
| 343 | 2026-09-20 | Mobil frissülés és leckeazonosító-feloldás | #94 `cc6a4e8a`, #95 `c87178e6`, #96 `c636440f` | R-KAN-522 |
| 355 | 2026-09-20 | Disztraktorok és javítókör-diagnosztika | #97 `00e33415` | R-KAN-327 |
| 365 | 2026-09-20 | SDK-újrapróba és időkorlát | #98 `8450426d` | R-KAN-522 |
| 381 | 2026-09-20 | Szolgáltatói JSON és szerkezeti diagnosztika | #99 `0b8cfb36` | R-KAN-518 |
| 396 | 2026-09-20 | Három sorosítási hibaosztály | #101 `f961509b` | R-KAN-518 |
| 411 | 2026-09-20 | Négy irányítható játék közös joystickja | #103 `dac806a5` | R-KAN-351 |
| 425 | 2026-09-23 | Tanári utasítás, OCR, szerep-skill és forráskonfliktus | `28d90019`, #104 `28d90019` | 4ec12adf · a forráskonfliktushoz; R-KAN-521 |
| 437 | 2026-09-23 | Történelmi mintalecke újraírása és kódjavítás | `ef05159a`, #105 `ef05159a` | R-KAN-521 |
| 445 | 2026-09-24 | Publikált lecke kézi rövidítése | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | Kézi adatművelet; az élő verzió R-KAN-521. |
| 453 | 2026-09-24 | Új vizuális téma és leckevariáció | `d1894a8b`, #106 `2c69a715` | R-KAN-146 |
| 463 | 2026-09-24 | Régi kliens és új lecke visszafelé kompatibilitása | #108 `7182508d` | R-KAN-516 |
| 469 | 2026-09-24 | Rendszervizsgálat és javítások | `08e2e777`, #109 `08e2e777` | R-KAN-524 |
| 476 | 2026-09-24 | PDF-feladatlap előállítása és részmegoldás | #110 `cd4f349a` | R-KAN-522 |
| 483 | 2026-09-24 | Magyarázó ábrák első szállításai | `e3a4b593`, #113 `f81477c2` | A 491. és 499. sorok ugyanennek a folytatásai. |
| 491 | 2026-09-24 | Illusztráció és ábraminőség-kapu | `abc58efa`, #115 `7770d8ad` | R-KAN-163 |
| 499 | 2026-09-24 | Kirajzolt ábracímkék forrásellenőrzése | `dd81324f`, #117 `dd81324f` | R-KAN-521 |
| 506 | 2026-09-24 | Kézi lektorjavítás és publikáció | `e635ffaa`, #118 `e635ffaa` | R-KAN-521 |
| 512 | 2026-09-24 | Teljes gyakorlólecke vak megoldóval | `469efeea`, #119 `469efeea` | A következő fejezetben a #120 szállította a bankellenőrt. |
| 519 | 2026-09-24 | Bankellenőr bevezetése | `f9f48b2f`, #120 `f9f48b2f` | R-KAN-518 |
| 526 | 2026-09-24 | Gyártássorozat és a hét ismert hibás tétel | #121 `1a2638c8`, #123 `4492084b`, #124 `3074cb55` | R-KAN-521 |
| 535 | 2026-09-25 | Internetes gyártás kvótakimerüléskor | `ba7786f6`, #126 `ba7786f6` | R-KAN-010; élő keret nem ellenőrzött. |
| 542 | 2026-09-25 | Webes és feltöltéses módszer eltérései | #126 `ba7786f6`, #127 `c3e1a354` | A módszerbeli folytatás az 558. és 575. sorban. |
| 552 | 2026-09-25 | Webes tartalék és javítókör integrálása | `c3e1a354`, #127 `c3e1a354` | R-KAN-010 |
| 558 | 2026-09-25 | Webes forrás egyfutásos gyártásba továbbítása | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-517 |
| 565 | 2026-09-29 | Hét játék 3D-je, útburkolat és mobil teljesítmény | `03e9a348`, #129 `03e9a348` | A roadFactor javítása #130, a mobil utómérés R-KAN-064. |
| 575 | 2026-09-29 | Internetes gyártás éles javítása és régi próbapéldány | `ddddbc3c`, `9d29be9c`, `2ba6d60a` | R-KAN-521 |
| 588 | 2026-09-29 | Játékbank, Tornado-fizika, egyértelmű helyes válasz | `277feddb`, `1aa47139`, `e521ed9f` | R-KAN-521, R-KAN-083 |
| 626 | 2026-09-30 | Forrásonkénti fedettség | `0e867051`, #147 `0e867051` | R-KAN-006, R-KAN-007 |
| 640 | 2026-09-30 | Témafókusz és kézi tartalomváltozat | `070657b2`, `b495b32b`, #148 `070657b2` | R-KAN-521, R-KAN-522 |
| 654 | 2026-09-30 | Ábratervező, 3D-jelenet és összefésülés | `5e0d27de`, #150 `5e0d27de` | R-KAN-163 |
| 667 | 2026-09-30 | Megakadt közzététel első szelete | #151 `0841619f` | A későbbi #152 és #153 szeletek a következő fejezetben. |
| 676 | 2026-09-30 | Közzététel folytatása és újraindítás | `026e62da`, `56e95f6f`, #152 `026e62da` | Az újraindítás utáni folytatás később #247 (ec2a86f2). |
| 686 | 2026-09-30 | Dinamikus keret és tanári forráspontok | `e082bbe0` | R-KAN-146 |
| 693 | 2026-10-05 | Tudásbank, OCR-fúzió és bank-normalizálás | `37a4b8a1` | R-KAN-008 |
| 702 | 2026-10-04 | Kötelező banktartalék és előjelszabályok | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-327 |
| 714 | 2026-10-13 | Eredményküldés és feladóellenőrzés | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-119, R-KAN-128 |
| 726 | 2026-10-14 | Forrásterjedelem, kézírás, kvóta és térkép | `8851d417`, `1071a1bd`, `31b97479` | R-KAN-006–011 |
| 742 | 2026-11-03 | Befejezési szabály, két architektúra, éles hozzáférés | Dátumozott naplóbejegyzés, külön kódszállítás nincs itt igazolva. | R-KAN-507, R-KAN-525 |

A BACKLOG 17–23. sorában szereplő két rotáció külön ügy (R-KAN-009, R-KAN-523). A 27–32. sorok megfelelői R-KAN-006–011. A 33. sor kanban-hivatkozását R-KAN-513 és R-KAN-529 vizsgálja. A 37–55. sor fejlesztőkörnyezeti, lint-, felület-, teljesítmény- és takarítási pontjai R-KAN-524 és R-KAN-034 alá tartoznak. Az 57–69. sor négy pontjára a napló közös szállítást ad: 8b8e2622, továbbá a ma is létező source/server/lib/material-result.ts és source/server/lib/view-dedup.ts. A megmaradt szolgáltatói beállítás az R-KAN-068 szerinti külön ellenőrzést igényli.

## Szabályok és végrehajtási pontok

| Szabályhely | Mit lehet a pillanatképből ellenőrizni? | Tétel |
|---|---|---|
| `AGENTS.md:6`, :17 és :116 | A feladatból kiinduló, magyar munkavégzés és a bizonytalanság jelölése emberi szabály. A terv–utasítás–kód sorrendet a háromfázisú ellenőr részben vizsgálja. | R-KAN-401, R-KAN-501–504 |
| `AGENTS.md:17` | Eszkaláció, elakadás, specifikáció, kritikus szerződés, tesztintegritás és atomi munka. A romboló parancsok és a tiltott kapcsolók hookja végrehajtható. A szemantikai helyesség, a teszt gyengítése és a leállási döntés külön review-kérdés. | R-KAN-502–506, R-KAN-514 |
| `AGENTS.md:96` | A teljes PR, felépült funkció, adatszerződés, személyes adatok, régi látogatói út, budapesti idő, migráció és szolgáltatás-életciklus ellenőrzésének tartalmát a reviewernek kell igazolnia. A rögzítő a review-eredményt kezeli. | R-KAN-405, R-KAN-432, R-KAN-505 |
| `AGENTS.md:123` | Lezárás, kanban-söprés, hibából csapdabejegyzés és kétarchitektúrás fejlesztés. A tábla és a git eltérései külön azonosítót kaptak. | R-KAN-503, R-KAN-507, R-KAN-513, R-KAN-529 |
| `AGENTS.md:152` | Helyi lint, szakasz-, push-, PR- és merge-kapu. A regisztrált hook, a CI-feladat és a kézi kiadási kötelezettség három külön bizonyíték. | R-KAN-405–407, R-KAN-505–507, R-KAN-520 |
| `AGENTS.md:177`, :184, :189 és :194 | Ellenőrzés, kiadási engedély, lezárási jelentés és aktív követés. A git és a CI műveleti nyomot ad. Az engedély vagy a munka közbeni figyelem a futási előzményből igazolható. | R-KAN-410, R-KAN-429, R-KAN-503, R-KAN-508, R-KAN-514 |
| `AGENTS.md:214` és :248 | Helyi vezérlő betöltése, bizonyíték, titokvédelem, személyesadat-szűrés, vizuális ellenőrzés, Windows-futtató, visszaállási pont és tiszta hatókör. A dokumentációs és böngészős példák megmutatják a kódolt őr határát. | R-KAN-402, R-KAN-453, R-KAN-504, R-KAN-507, R-KAN-511 |
| `CLAUDE.md` | A főági gyökérből hiányzik. A követett ági példányok és a vak ellenőr szabálya összevethetők. | R-KAN-405, R-KAN-512 |
| `RUNBOOK.md:13`, :25 és :63 | Projektcél, két kiszolgálóréteg, könyvtárszerkezet. A mai belépési pontokkal és a régi memória üzemeltetési útjaival együtt értelmezendők. | R-KAN-454, R-KAN-457, R-KAN-460–462, R-KAN-508 |
| `RUNBOOK.md:109`, :162, :182 | Studio-gépsor, adatbázis, memória. A gyártás jóváhagyása, az adatbázis-visszaállítás és az index teljessége külön ellenőrzési pont. | R-KAN-452–453, R-KAN-459, R-KAN-509 |
| `RUNBOOK.md:209`, :231 | Python-eszközök, konfiguráció. A HTML-ellenőrzés mintaparancsa más bemenetre írt eszközhöz vezet. A telepített konfiguráció külön ellenőrizendő. | R-KAN-068, R-KAN-526–528 |
| `RUNBOOK.md:245` | Napi kiadás, hibajelentés és megszakadt futások kezelése. A hibanapló végpontjára és az admin-visszaolvasásra külön tétel van. | R-KAN-508, R-KAN-525, R-KAN-530 |
| `RUNBOOK.md:312`, :328, :341 | Minőségi kapuk, tiltások és diagnosztika. A lint és a Python-segéd tényleges belépőjét a kódhoz ellenőriztük. | R-KAN-507, R-KAN-510–511, R-KAN-528 |
| `docs/kanban.md:9` | A tábla feloldása, állapotátmenetek és állandó jegy. A mentett részletes és listás export mind a 209 azonosítót tartalmazza. | R-KAN-302, R-KAN-513, R-KAN-529 |

### Skillfájlok

| Vizsgált útvonalak | Főági vagy ági bizonyíték | Tétel |
|---|---|---|
| `.agents/skills/websuli-lint-ellenor/SKILL.md`<br>`.claude/skills/websuli-lint-ellenor/SKILL.md` | A két példány egyezik. scripts/qa/gates/lint-gate.mjs | R-KAN-423, R-KAN-520 |
| `.agents/skills/websuli-push-elotti-kapu/SKILL.md`<br>`.claude/skills/websuli-push-elotti-kapu/SKILL.md` | A két példány egyezik. scripts/qa/gates/pre-push-gate.mjs | R-KAN-437, R-KAN-520 |
| `.agents/skills/websuli-pr-elotti-kapu/SKILL.md`<br>`.claude/skills/websuli-pr-elotti-kapu/SKILL.md` | A két példány egyezik. scripts/qa/gates/pre-pr-gate.mjs | R-KAN-505, R-KAN-520 |
| `.agents/skills/websuli-merge-elotti-kapu/SKILL.md`<br>`.claude/skills/websuli-merge-elotti-kapu/SKILL.md` | A két példány egyezik. scripts/qa/gates/pre-merge-gate.mjs | R-KAN-092, R-KAN-520 |
| `.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md`<br>`.claude/skills/websuli-fejlesztesi-ellenor/SKILL.md` | A két példány egyezik. scripts/qa/gates/record-review.mjs | R-KAN-405, R-KAN-505, R-KAN-520 |
| `.agents/skills/tananyag-javito/SKILL.md` | mentsd, alkalmazd, olvasd vissza | R-KAN-515, R-KAN-526–528 |
| `.agents/skills/tananyag-keszito/SKILL.md` | forrásfedettség és böngészős használhatóság | R-KAN-516 |
| `.agents/skills/websuli-internet-pipeline/SKILL.md` | webes forrásgyűjtés és gyártás | R-KAN-517 |
| `.agents/skills/websuli-studio-tools/SKILL.md` | automatikus és kézi Studio-parancsok | R-KAN-518 |
| `.claude/skills/websuli-gyartas-analitika/SKILL.md` | az analitika időpontja és költségadata | R-KAN-519 |
| `.agents/skills/websuli-vak-ellenor/SKILL.md`<br>`.claude/skills/websuli-vak-ellenor/SKILL.md` | Ági skill: `chore/vak-ellenor-deepseek` | R-KAN-405–406, R-KAN-512 |
| `.agents/skills/websuli-gep-zar/SKILL.md`<br>`.claude/skills/websuli-gep-zar/SKILL.md` | Ági skill: `feat/gepi-zar` | R-KAN-416 |
| `.agents/skills/websuli-session-zaras/SKILL.md`<br>`.claude/skills/websuli-session-zaras/SKILL.md` | Ági skill: `feat/session-zaras-kereses-osszevetes` | R-KAN-410, R-KAN-503 |

A javító skill két referenciája a `references/hiba-katalogus.md` és a `references/html-sablon.md`. A négy segéd a `scripts/fix_tananyag.py`, `scripts/validate_tananyag.py`, `scripts/quick_validate.py` és `scripts/package_skill.py`. Az útvonalak a `.agents/skills/tananyag-javito/` könyvtárhoz viszonyítottak. A javítás tartalmi helyességét R-KAN-526, a bankméret tényleges küszöbét R-KAN-527, a HTML-fájl és a skillcsomag eltérő bemeneti szerződését R-KAN-528 tárgyalja.

## Forrásmérleg és korlátok

| Elsődleges forráselem | Darab | Egyeztetés |
|---|---:|---|
| Kanban-jegy | 209 | 131 todo, 6 in_progress, 5 in_review, 67 done. Egy jegy egy azonosító, R-KAN-001–209. |
| Privát projektmemória fájlja | 38 | A 36 aktív jegyzet, az index és az archív példány. R-KAN-401–438. |
| Verziózott `memory/` fájl | 19 | R-KAN-451–469. A LEDGER 55 időrendi szakasza és a BACKLOG belső sorai külön visszakereshetők. |
| Főági csapdabejegyzés | 75 | C-01–C-75 → R-KAN-301–375. |
| További eltérő ági csapdabejegyzés | 23 | R-KAN-601–623. A címet és a tartalmat is egyeztettük a számazonosságok miatt. |
| Gyökér-vezérlőforrás | 3 | AGENTS, CLAUDE és RUNBOOK. A CLAUDE-fájl elérhető ági példánya szolgált összehasonlításul. |
| Kanban-eljárásleírás | 1 | `docs/kanban.md` |
| Főági skillbelépő | 15 | 9 a `.agents`, 6 a `.claude` alatt. |
| További ági skillbelépő | 6 | Három skill két-két példánya. |
| Javító skill referencia- és segédfájlja | 6 | Két referencia és négy szkript. |
| **Összesen** | **395** | A jegylistát és a részletes exportot azonosítónként egyszer számoltuk. |

A PR- és commitelőzmények, a fennmaradt üzenetek, a 68 P-tétel és az 50 szeletes végrehajtási terv keresztellenőrző források. Egy forrás több önálló hibát is igazolhat, több szabály pedig azonos hibára mutathat. Az élő szolgáltatói beállítás, a titokrotáció, a tényleges költség, a tartalom-adatbázis állapota és a készüléken mért viselkedés nem olvasható ki a gitből. A mentésben csak cím szerint említett külső vizsgálatok részletes állításai az érintett tételnél nyitva maradtak.

## KÉSZ tételek

- R-KAN-001 · A tábla technikai próbajegye · KÉSZ · kanban-jegyek.txt:1 · #1 (done, 2026-10-14) · A 2026-10-14-i lezáró bejegyzés igazolja a tesztazonosító lekérdezését. `docs/kanban.md:41`.
- R-KAN-002 · A forrás tantárgyának és évfolyamának közvetlen besorolása · KÉSZ · kanban-jegyek.txt:9 · #2 (done, 2026-10-14) · #209 · `8851d417` · `source/tests/scope-luna-openai.test.ts`
- R-KAN-003 · Lecke hossz- és lefedettség-mérő + próbaharness (S1) · KÉSZ · kanban-jegyek.txt:17 · #3 (done, 2026-10-14) · #210 · `d1599c05` · `source/tests/lesson-metrics.test.ts`
- R-KAN-004 · A gondolkodási esemény életjel a stream figyelésében · KÉSZ · kanban-jegyek.txt:25 · #4 (done, 2026-10-14) · #212 · `1071a1bd` · `source/tests/claude-stream-thinking-liveness.test.ts`
- R-KAN-005 · Tömörebb leckék tényvesztés nélkül · KÉSZ · kanban-jegyek.txt:33 · #5 (done, 2026-10-14) · #213 · `31b97479` · `source/tests/lesson-length.test.ts`
- R-KAN-012 · Csoportos bankjavítás szigorítása a régi leckék átalakításában · KÉSZ · kanban-jegyek.txt:59 · #12 (done, 2026-10-21) · #353 · `1049fe03` · `source/tests/s3d-csoportos-szigoritas.test.ts`
- R-KAN-013 · Régi→Stúdió 2. ciklus: jobFailed (árva futás 45 perc helyett azonnal), kvóta-autofix, lektor ragozott alak · KÉSZ · kanban-jegyek.txt:65 · #13 (done, 2026-10-21) · #354 · `892d84ad` · `source/tests/ciklus3-kvota-autofix.test.ts`
- R-KAN-014 · Régi→Stúdió 4. ciklus: atomi példánykerítés, UTF-16 wellFormed, lektor-archívum, minta-diagnózis, mojibake-őr · KÉSZ · kanban-jegyek.txt:71 · #14 (done, 2026-10-21) · #355 · `9903713e` · `source/tests/ciklus4-diagnozis.test.ts`
- R-KAN-017 · Mobiljátékok és szóbank bevezetési terve és kanban-szeletei · KÉSZ · kanban-jegyek.txt:86 · #17 (done, 2026-11-15) · #419 · `bf100e9f` · `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
- R-KAN-018 · S1 – szóbank-infrastruktúra (típusok, betöltő, validátor, generátor, ismétlés-napló, adapter) · KÉSZ · kanban-jegyek.txt:95 · #18 (done, 2026-11-15) · #421 · `9f87c942` · `source/tests/vocab-bank-validate.test.ts`
- R-KAN-019 · S2 – közös mobilos játékkeret (game-engine/mobile) · KÉSZ · kanban-jegyek.txt:108 · #19 (done, 2026-11-15) · #422 · `050778d5` · `source/tests/game-mobile-quality.spec.ts`
- R-KAN-020 · S3 – angol szóbank-tartalom 2500 bejegyzés + vak megoldó · KÉSZ · kanban-jegyek.txt:120 · #20 (done, 2026-11-15) · #431 · `4075df5c` · `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
- R-KAN-021 · S4 – német szóbank-tartalom 2000 bejegyzés + vak megoldó · KÉSZ · kanban-jegyek.txt:128 · #21 (done, 2026-11-15) · #427 · `e51c9926` · `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
- R-KAN-022 · S5 – francia szóbank-tartalom 2000 bejegyzés + vak megoldó · KÉSZ · kanban-jegyek.txt:136 · #22 (done, 2026-11-15) · #428 · `cf5b591c` · `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
- R-KAN-023 · S6 – Szólétra mobilra + központi szóbank · KÉSZ · kanban-jegyek.txt:145 · #23 (done, 2026-11-15) · #430 · `e729789c` · `source/tests/word-ladder-vocab.test.ts`
- R-KAN-024 · S7 – Gyors matek sprint mobilra · KÉSZ · kanban-jegyek.txt:155 · #24 (done, 2026-11-15) · #425 · `50c6041c` · `source/tests/speed-quiz-mobile.test.ts`
- R-KAN-025 · S8 – Brain Rot Lopás mobilra + szóbank · KÉSZ · kanban-jegyek.txt:164 · #25 (done, 2026-11-15) · #424 · `7ae49b33` · `source/tests/brainrot-tuning.test.ts`
- R-KAN-026 · S9 – Szökőár szökés mobilra + szóbank · KÉSZ · kanban-jegyek.txt:173 · #26 (done, 2026-11-15) · #426 · `d3628b50` · `source/tests/tsunami-mobile.test.ts`
- R-KAN-027 · S10 – Galaktikus Aszteroida mobilra + szóbank · KÉSZ · kanban-jegyek.txt:184 · #27 (done, 2026-11-15) · #434 · `8a92cd7a` · `source/tests/space-asteroid-mobile.test.ts`
- R-KAN-028 · S11 – Kockavadász kvíz mobilra + szóbank · KÉSZ · kanban-jegyek.txt:194 · #28 (done, 2026-11-15) · #435 · `fbb00395` · `source/tests/blockcraft-mobile.test.ts`
- R-KAN-029 · S12 – Tornado Hunter 200 mobilra + szóbank · KÉSZ · kanban-jegyek.txt:203 · #29 (done, 2026-11-15) · #433 · `892097ca` · `source/tests/tornado-mobile-shell.test.ts`
- R-KAN-030 · S13 – játéklista és főkártyák arculata, teljes mobil mátrix, verify, átfogó review, retro · KÉSZ · kanban-jegyek.txt:213 · #30 (done, 2026-11-15) · #438 · `86a39ae2` · `source/tests/s13-review-guards.test.ts`
- R-KAN-031 · Az újratöltési próba várja meg a küldés végét · KÉSZ · kanban-jegyek.txt:225 · #31 (todo, 2026-11-16) · #492 · `54620024` · `source/tests/lesson-result-email.spec.ts`
- R-KAN-036 · J0a – determinizmus és játékérzet (seedelt RNG, fix lépés, rázás/hitstop, mini-Director, őrök) · KÉSZ · kanban-jegyek.txt:251 · #36 (done, 2026-11-16) · #442 · `19aa86e6` · `source/tests/game-director.test.ts`
- R-KAN-037 · JM0 – adatvédelem: ranglista becenévre, e-mail ki a naplóból, score sebességkorlát + runId · KÉSZ · kanban-jegyek.txt:261 · #37 (done, 2026-11-16) · #443 · `c53040a9` · `source/tests/jm0-game-score-privacy.spec.ts`
- R-KAN-038 · J0b – tanulási mag (ismétlési sor, áramlat, kombó, hullám, statisztika, kérdés-ütemező, szimulációs harness, őrök) · KÉSZ · kanban-jegyek.txt:271 · #38 (done, 2026-11-16) · #444 · `bf804bfb` · `source/tests/game-combo-waves.test.ts`
- R-KAN-039 · JM7a – admin-jogosultsági mátrix-teszt + player_accounts + e-mailes kódos belépés (PLAYER_ACCOUNTS flag) · KÉSZ · kanban-jegyek.txt:281 · #39 (done, 2026-11-16) · #445 · `9bda1373` · `source/tests/admin-authz-matrix-db.integration.ts`
- R-KAN-040 · J0c – közös UI: nem blokkoló kérdés-sáv, Miért? gomb, eredmény-lista, felolvasás, play-lab · KÉSZ · kanban-jegyek.txt:293 · #40 (done, 2026-11-16) · #446 · `57bd1b0e` · `source/tests/game-play-question-ui.test.ts`
- R-KAN-042 · JBa – évfolyam-bank bővítése 1. rész (90 → ≥270 / évfolyam, gyártó + vak megoldó + audit) · KÉSZ · kanban-jegyek.txt:316 · #42 (done, 2026-11-16) · #448 · `ca3d7141` · `source/tests/grade-quiz-bank-coverage.test.ts`
- R-KAN-043 · JM7b – játékos Google-út, becenév + avatar, fiókoldal, adatletöltés és fióktörlés, admin Játékosok tiltás · KÉSZ · kanban-jegyek.txt:326 · #43 (done, 2026-11-16) · #449 · `50605100` · `source/tests/player-account.spec.ts`
- R-KAN-044 · J4a – Matek: Neon védőtorony mag + drón-célpont (a kvíz helyett) · KÉSZ · kanban-jegyek.txt:337 · #44 (done, 2026-11-16) · #451 · `b82ea71d` · `source/tests/speed-math-core.test.ts`
- R-KAN-045 · J2a – Szólétra: Szikla-verseny mag, szó-kapaszkodó, rivális, vereség · KÉSZ · kanban-jegyek.txt:347 · #45 (done, 2026-11-16) · #454 · `d5c91060` · `source/tests/word-ladder-core.test.ts`
- R-KAN-046 · J0c-b – a hosszú kérdés teljesen olvasható legyen a kérdés-sávban koppintás nélkül · KÉSZ · kanban-jegyek.txt:359 · #46 (done, 2026-11-16) · #450 · `59a647f2` · `source/tests/game-prompt-fit.test.ts`
- R-KAN-047 · JBb – évfolyam-bank 7–9. (≥270/évfolyam) + évfolyamonkénti lusta betöltés + régi helyesírási tételek szótáras ellenőrzése · KÉSZ · kanban-jegyek.txt:369 · #47 (done, 2026-11-16) · #453 · `bad7bd59` · `source/tests/grade-quiz-bank-coverage.test.ts`
- R-KAN-048 · JM2 – valós idejű réteg: Socket.IO /api/rt, jegy, szoba-állapotgép, korlátok, drain (MP_MODE off) · KÉSZ · kanban-jegyek.txt:379 · #48 (done, 2026-11-16) · #452 · `f06c35df` · `source/tests/rt-protocol.test.ts`
- R-KAN-049 · az érintős joystick lassan reagál és nem vezérelhető finoman (Tornado autó és a többi játék) – gyökérok méréssel, javítás · KÉSZ · kanban-jegyek.txt:389 · #49 (done, 2026-11-16) · #456 · `9038fce2` · `source/tests/joystick-response.spec.ts`
- R-KAN-050 · a szóbank hiányos mondatos (cloze) kérdése játékban túl hosszú és a magyar fordítás elárulja a választ – rövid játék-alak · KÉSZ · kanban-jegyek.txt:400 · #50 (done, 2026-11-16) · #455 · `62f50954` · `source/tests/play-lab-cloze-game.spec.ts`
- R-KAN-051 · Matek főellenfelek, számlánc, becslés és közös játékvezérlés · KÉSZ · kanban-jegyek.txt:410 · #51 (done, 2026-11-16) · #466 · `24add8b6` · `source/tests/speed-math-boss.spec.ts`
- R-KAN-053 · JBc – évfolyam-bank 10–12. (≥270/évfolyam) a JBb módszerével (forrásalapú gyártás, magyarázat-audit, olvashatósági szűrő) · KÉSZ · kanban-jegyek.txt:444 · #53 (done, 2026-11-16) · #458 · `ba9c666c` · `source/tests/grade-quiz-bank-coverage.test.ts`
- R-KAN-054 · a listákban nem látszik, hányadik osztályos a tananyag (az Összes nézetben nem lehet válogatni) – évfolyam-jelölés minden kártyán · KÉSZ · kanban-jegyek.txt:453 · #54 (done, 2026-11-16) · #465 · `fe7c89fb` · `source/tests/classroom-badge.spec.ts`
- R-KAN-055 · JM7c-1 – hibrid jogosultság 1.: admin kizárólag az engedélylistáról + state a meglévő Google-úton (mátrix új szereppel) · KÉSZ · kanban-jegyek.txt:468 · #55 (done, 2026-11-16) · #462 · `015b5a9a` · `source/tests/admin-access-source-guard.test.ts`
- R-KAN-056 · JM7b-utójavítás: becenév-szűrő l/I csere (N1), törlési kód blokkolhatósága (N3), tiltott játékos adatai (N2) · KÉSZ · kanban-jegyek.txt:484 · #56 (done, 2026-11-16) · #475 · `b826932d` · `source/tests/player-account-db.integration.ts`
- R-KAN-057 · Nyilvános dokumentáció címadatainak javítása és címőr · KÉSZ · kanban-jegyek.txt:513 · #57 (done, 2026-11-16) · #474 · `38861d28` · D-14 (2026-11-19), a történet megőrzése · `source/tests/no-real-emails-guard.test.ts` · P-023
- R-KAN-058 · Lejárt kupon, újracsatlakozás és instabil böngészős mérések javítása · KÉSZ · kanban-jegyek.txt:524 · #58 (done, 2026-11-16) · #477 · `bab40853` · `source/tests/coupon-expired-all-games.spec.ts`
- R-KAN-059 · telefonos reszponzivitás – Vihargarázs álló telefonon levágott, egymásba ágyazott keretek, üres járműkép (tulajdonosi képernyőkép 2026-11-16) · KÉSZ · kanban-jegyek.txt:548 · #59 (done, 2026-11-16) · #467 · `6a4f7a48` · `source/tests/game-meta-quality.spec.ts`
- R-KAN-060 · Belépés / Fiókom belépő a Játékok oldalán (PLAYER_ACCOUNTS mellett) · KÉSZ · kanban-jegyek.txt:559 · #60 (done, 2026-11-16) · #472 · `83a648c8` · `source/tests/player-entry.spec.ts`
- R-KAN-061 · A fiók- és párbaj-review megállapításainak utókövetése · KÉSZ · kanban-jegyek.txt:568 · #61 (done, 2026-11-16) · #476 · `31dfcdea` · további #471, #474, #475 · `source/tests/duel-bot.spec.ts`
- R-KAN-063 · Aktív tananyaggyártás automatikus ellenőrzése merge előtt · KÉSZ · kanban-jegyek.txt:583 · #63 (done, 2026-11-16) · #489 · `26bae97f` · `scripts/qa/gates/pre-merge-gate.test.mjs` · P-052
- R-KAN-065 · Játékfejlesztési visszatekintés, csapdák, státuszok és migrációs sorszám · KÉSZ · kanban-jegyek.txt:598 · #65 (done, 2026-11-16) · #473 · `2c21484b` · `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`
- R-KAN-066 · Havi audit átadása a #64 és #67–69 feladatokra · KÉSZ · kanban-jegyek.txt:609 · #66 (done, 2026-11-16) · #478 · `76cf426a` (az egyik követő javítás; az eredeti jelentést csak a jegy tanúsítja) · `source/tests/quiz-bank-scale-db.integration.ts`
- R-KAN-067 · A kvízbank keresése ne töltse memóriába minden lecke teljes adatát · KÉSZ · kanban-jegyek.txt:617 · #67 (done, 2026-11-16) · #478 · `76cf426a` · `source/tests/quiz-bank-scale-db.integration.ts`
- R-KAN-070 · A címőr fogadja el a szintetikus tesztcímeket · KÉSZ · kanban-jegyek.txt:640 · #70 (done, 2026-11-16) · #479 · `f7894087` · `source/tests/no-real-emails-guard.test.ts`
- R-KAN-078 · A Szökőár háromsávos futást és kapukérdést kapjon · KÉSZ · kanban-jegyek.txt:681 · #78 (in_review, 2026-11-17) · #483 · `a11b1b79` · `source/tests/tsunami-core.test.ts`
- R-KAN-080 · J5a – Brain Rot „Lény-aréna”: aréna-mozgás, menekülő lények, Ketrec-zár, valós óra · KÉSZ · kanban-jegyek.txt:697 · #80 (done, 2026-11-17) · #485 · `b4b84db6` · `source/tests/brainrot-core.test.ts`
- R-KAN-082 · J7a – Tornado Hunter 200: javítások (garázs-statok közös függvénye stb.) · KÉSZ · kanban-jegyek.txt:721 · #82 (done, 2026-11-17) · #482 · `443d6b76` · `source/tests/tornado-j7a.spec.ts`
- R-KAN-084 · A játék a tananyag saját tantárgyát használja a címből becslés helyett · KÉSZ · kanban-jegyek.txt:732 · #84 (done, 2026-11-17) · #487 · `25fc2841` · `source/tests/tornado-material-subject.test.ts`
- R-KAN-089 · A Szólétra adjon elegendő olvasási időt és emelje ki a célszót · KÉSZ · kanban-jegyek.txt:762 · #89 (in_review, 2026-11-17) · #500 · `99c6dc29` · `source/tests/word-ladder-readability.spec.ts`
- R-KAN-092 · A main elmozdulása csak az érintett őrkört indítsa újra · KÉSZ · kanban-jegyek.txt:787 · #92 (todo, 2026-11-17) · #490 · `3924beb7` · `scripts/qa/gates/pre-merge-gate.mjs:61` és az érintettség döntési esetei a `scripts/qa/gates/pre-merge-gate.test.mjs:70` helyen. · `scripts/qa/gates/external-review.test.mjs` · P-046
- R-KAN-095 · Brain Rot: átállás a közös kupon-ismétlésre a #483 után (couponRepeat.ts kivétele) · KÉSZ · kanban-jegyek.txt:800 · #95 (done, 2026-11-17) · #483 · `a11b1b79` · source/client/src/pages/BrainRotSteal.tsx:293 · `source/tests/brainrot-sim.test.ts` · P-008
- R-KAN-100 · Kapu-hook: a 3 mp-es git-időkorlát terhelt gépen kevés (check-quality-gates.test.mjs ingadozik: spawnSync git ETIMEDOUT) · KÉSZ · kanban-jegyek.txt:827 · #100 (done, 2026-11-17) · #506 · `14c859ee` · `scripts/qa/hooks/hook-failure.test.mjs` · P-045
- R-KAN-106 · A joystick renderelési mérés csak kérdés nélküli időablakot hasonlítson össze · KÉSZ · kanban-jegyek.txt:859 · #106 (done, 2026-11-17) · #492 · `54620024` · `source/tests/joystick-response.spec.ts` · P-046
- R-KAN-109 · A Brain Rot válaszidőpróbája lassú CI alatt is a játékórát mérje · KÉSZ · kanban-jegyek.txt:875 · #109 (done, 2026-11-17) · #483 · `a11b1b79` · `source/tests/brainrot-play.spec.ts` · P-008
- R-KAN-110 · A párhuzamos eredményküldések előre foglalják le a kézbesítést · KÉSZ · kanban-jegyek.txt:883 · #110 (todo, 2026-11-17) · #495 · `3ff4d173` · `source/tests/lesson-result-email-db.integration.ts`
- R-KAN-116 · Tananyag-címek: az osztály megnevezése látszódjon a címnél és legyen kereshető (tulajdonosi hibajelentés 2026-11-17: „továbbra sem”) · KÉSZ · kanban-jegyek.txt:903 · #116 (done, 2026-11-17) · #494 · `a7b3b787` · `source/tests/material-title.test.ts` · P-026
- R-KAN-118 · A mondatvégi írásjel önmagában ne rontsa el a választ · KÉSZ · kanban-jegyek.txt:914 · #118 (todo, 2026-11-17) · #493 · `56d1a9af` · `source/tests/fill-blank-punctuation.spec.ts`
- R-KAN-126 · Az auditellenőrzés időtúllépése állítsa meg a műveletet · KÉSZ · kanban-jegyek.txt:943 · #126 (todo, 2026-11-17) · #506 · `14c859ee` · `scripts/qa/hooks/hook-failure.test.mjs`
- R-KAN-133 · A Brain Rot végrehajtási terve hivatkozzon a válaszidő javítására · KÉSZ · kanban-jegyek.txt:967 · #133 (done, 2026-11-18) · #497 · `21c81998` · `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` · P-008
- R-KAN-140 · A kapu-hook belső hiba esetén is tiltson · KÉSZ · kanban-jegyek.txt:995 · #140 (done, 2026-11-18) · #506 · `14c859ee` · `scripts/qa/hooks/hook-failure.test.mjs` · P-045
- R-KAN-147 · Táblázatok, sortörések és sémaverzió kezelése a forrásleltárban · KÉSZ · kanban-jegyek.txt:1031 · #147 (done, 2026-11-18) · #515 · `f756588c` · `source/tests/lesson-draft-db.integration.ts`
- R-KAN-157 · A forrásfedettségi kapu szerkezeti, kihagyási és képi próbáinak szigorítása · KÉSZ · kanban-jegyek.txt:1076 · #157 (done, 2026-11-18) · #515 · `f756588c` · `source/tests/source-coverage-gate.test.ts` · P-028
- R-KAN-160 · Audit-hook (check-audit-ok): null / nem objektum hook-bemenetre összeomlik, és rajta nincs hibánál-tiltás · KÉSZ · kanban-jegyek.txt:1092 · #160 (done, 2026-11-18) · #506 · `14c859ee` · `scripts/qa/hooks/hook-failure.test.mjs` · P-045
- R-KAN-165 · A lecke hangjainak előtöltése, válaszidőmérés és hálózati korlátok · KÉSZ · kanban-jegyek.txt:1117 · #165 (done, 2026-11-18) · #516 · `b7165a56` · source/tests/speech-preload.test.ts · P-032
- R-KAN-301 · C-01 Más architektúrára települt `node_modules` · KÉSZ · `docs/agent-csapdak.md:103` · `.github/workflows/ci.yml:128`, `source/tests/native-arch.test.ts:13`
- R-KAN-307 · C-07 Flex-oszlop `min-h-0` nélkül + CSS-specificitás, csak vízszintes túlcsordulást mérő teszt · KÉSZ · `docs/agent-csapdak.md:153` · `source/tests/web-research-completion.spec.ts:222`
- R-KAN-309 · C-09 Több natív addon egy Node-folyamatban: időszakos heap-sérülés kilépéskor (Windows, 2026-11-03) · KÉSZ · `docs/agent-csapdak.md:171` · `source/scripts/check-native-arch.mjs:34`, `source/tests/native-arch.test.ts:13`
- R-KAN-312 · C-12 `content-visibility: auto`: a teljes oldalas képernyőképen üres kártyák · KÉSZ · `docs/agent-csapdak.md:201` · `source/tests/home-views.spec.ts:117`
- R-KAN-313 · C-13 Az `outline` gomb hover-szövegszíne felülírja az egyedi színt · KÉSZ · `docs/agent-csapdak.md:208` · `source/tests/home-views.spec.ts:89`
- R-KAN-316 · C-16 Követés csak `sessionStorage`-ból: kilépés után eltűnik a részletes nézet · KÉSZ · `docs/agent-csapdak.md:228` · `source/server/studio/lesson-pipeline-routes.ts:593`, `source/tests/admin-draft-lessons.spec.ts:265`
- R-KAN-323 · C-23 Böngészős felolvasás tartalék nélkül; régiós nyelvkód a TTS-szolgáltatásnak · KÉSZ · `docs/agent-csapdak.md:316` · `source/tests/speech-fallback.test.ts:33`
- R-KAN-332 · C-32 Közös CSS-osztály rétegen kívül: a Tailwind segédosztály hatástalan · KÉSZ · `docs/agent-csapdak.md:519` · `source/tests/game-answer-btn-layer.test.ts:32`
- R-KAN-333 · C-33 „Beállt állapotra várás” élő elemen: a PR CI-ja zöld, a main CI piros · KÉSZ · `docs/agent-csapdak.md:528` · `source/tests/support/game-mobile-quality.ts:125`, `source/tests/game-mobile-moving-targets.spec.ts:22`
- R-KAN-335 · C-35 Regex a JS-sablonszövegben: a `\s` visszaperjele elveszett, a teszt a szűk bemenetre zöld volt · KÉSZ · `docs/agent-csapdak.md:575` · `source/tests/game-feedback-affirmation.test.ts:53`
- R-KAN-336 · C-36 Hitstop a hurok szorzójával: felülírja a szünetet, és sorrendfüggő · KÉSZ · `docs/agent-csapdak.md:585` · `source/tests/game-loop.test.ts:110`, `source/tests/game-feel.test.ts:110`
- R-KAN-340 · C-40 Sebességkorlát csak IP-kulccsal: közös IP mögötti diákok egymást zárják ki · KÉSZ · `docs/agent-csapdak.md:625` · `source/server/lib/game-score-limits.ts:16`, `source/tests/jm0-game-score-privacy.spec.ts:157`
- R-KAN-341 · C-41 A közös ismétlési sor idegen tétele eltorlaszolta a sort · KÉSZ · `docs/agent-csapdak.md:635` · `source/tests/game-question-director.test.ts:478`
- R-KAN-343 · C-43 „Mutasd” gombos, két sorra vágott kérdés: a képernyőképen látszott, mégis átment · KÉSZ · `docs/agent-csapdak.md:668` · `source/tests/play-lab.spec.ts:318`
- R-KAN-351 · C-51 Egymásra rakott holtsávok: a „lassú joystick” nem késés volt, hanem halott tárcsa-közép · KÉSZ · `docs/agent-csapdak.md:808` · `source/tests/joystick-curve.test.ts:43`, `source/tests/joystick-response.spec.ts:759`
- R-KAN-352 · C-52 Mozgó válaszcél két ujjal; a szimuláció más lépésmérettel fut, mint a lap · KÉSZ · `docs/agent-csapdak.md:825` · `source/tests/game-pointer-tap.test.ts:14`, `source/tests/speed-math-core.test.ts:324`
- R-KAN-355 · C-55 A Studio-lecke évfolyama három helyen él; futó munka keresése nem csak `lesson_id`-val · KÉSZ · `docs/agent-csapdak.md:870` · `source/tests/material-classroom-db.integration.ts:67`
- R-KAN-356 · C-56 Próbabot „mindig a jó választ adja”: minden eltérés hibajel; a speciális kérdés esedékessége; átfedő válaszgombok · KÉSZ · `docs/agent-csapdak.md:882` · `source/tests/speed-math-boss.spec.ts:109`, `source/tests/speed-math-boss.test.ts:173`
- R-KAN-357 · C-57 Meta-képernyők mérése: `scrollIntoView`, rögzített keret, tizedes-tagolás, levágott felirat · KÉSZ · `docs/agent-csapdak.md:897` · `source/tests/support/game-meta-quality.ts:153`
- R-KAN-358 · C-58 Szűrő-olvasat cseréje hozzáadás helyett regressziót okoz · KÉSZ · `docs/agent-csapdak.md:914` · `source/tests/nickname-filter.test.ts:250`
- R-KAN-359 · C-59 Ágankénti védelem helyett közös pont: a tiltás kijátszása törléssel és alias-címmel · KÉSZ · `docs/agent-csapdak.md:927` · `source/tests/player-account-db.integration.ts:734`
- R-KAN-363 · C-63 A kötelező ellenőrzés nem alku tárgya · KÉSZ · `docs/agent-csapdak.md:981` · `scripts/qa/gates/pre-merge-gate.test.mjs:10`, `.github/workflows/ci.yml:11`
- R-KAN-364 · C-64 `count()` után automatikusan várakozó `innerText()` egy poll-ban versenyhelyzet · KÉSZ · `docs/agent-csapdak.md:991` · `source/tests/vocab-cross-game-log.spec.ts:80`
- R-KAN-365 · C-65 „≥ X ms-ig látszik” mérése a lapon belül, képkockánként · KÉSZ · `docs/agent-csapdak.md:999` · `source/tests/brainrot-play.spec.ts:178`
- R-KAN-366 · C-66 Játékszintű megállítás közös úton; a szünet nem állítja le a 3D-rajzolást · KÉSZ · `docs/agent-csapdak.md:1009` · `source/tests/coupon-expired-all-games.spec.ts:145`
- R-KAN-367 · C-67 Egy állapotnak egy igazságforrása: kétoldalú kérés / elfogadás · KÉSZ · `docs/agent-csapdak.md:1017` · `source/tests/rt-room-machine.test.ts:338`
- R-KAN-371 · C-71 Kulcsfüggő zár / kulcsolt ujjlenyomat: titok nélküli kulcs, az adat az igazságforrás · KÉSZ · `docs/agent-csapdak.md:1053` · `source/server/player/account-store.ts:23`, `source/tests/player-account-db.integration.ts:937`
- R-KAN-373 · C-73 Mutációs teszt megosztott fixtúra-objektumon: a mutáció a mércét is elrontja · KÉSZ · `docs/agent-csapdak.md:1067` · `source/tests/fixtures/source-coverage-hm.ts:64`, `source/tests/source-coverage-gate.test.ts:225`
- R-KAN-404 · A mérés után megtartott bankmodell és tartaléka · KÉSZ · Privát projektmemória · `bank-model-opus-decision.md:11` · A kétmodellű döntés és az egyfutásos régi modellút kivezetése a #262-ben követhető. `docs/specs/2026-10-16-egy-futas.md:117`
- R-KAN-409 · A felhős fejlesztőkörnyezetnek legyen repós leírása · KÉSZ · Privát projektmemória · `codex-cloud-env-docs.md:11` · A kért projektleírás követett főági fájl. Az élő fiókjogok külön üzemeltetési állapotok. `docs/codex-felhokornyezet.md:1`
- R-KAN-414 · Önálló játékosregisztráció és külön adminengedély · KÉSZ · Privát projektmemória · `game-accounts-student-self-registration.md:11` · #445, #449 és #462. A játékos út és az engedélylistára kötött adminjog külön főági változás. `source/tests/admin-authz-matrix-db.integration.ts:1` · P-019
- R-KAN-423 · A teljes lint egyetlen figyelmeztetésre is bukjon · KÉSZ · Privát projektmemória · `lint-max-warnings.md:11` · A nullafigyelmeztetéses szabály a CI-ben és a lintkapuban szerepel (#489, scripts/qa/gates/lint-gate.test.mjs). `.github/workflows/ci.yml:66`
- R-KAN-426 · A privát memória indexe minden aktív jegyzethez vezessen · KÉSZ · Privát projektmemória · `MEMORY.md:1` · Az indexben mind a 36 relatív Markdown-cél megtalálható a pillanatképben. Az archív másolat külön tétel. `MEMORY.md:1`
- R-KAN-436 · A végrehajtási utasítás már az első kódcommitnál hivatkozzon a tervre · KÉSZ · Privát projektmemória · `three-phase-plan-reference.md:11` · A háromfázisú ellenőr a git-előzményt vizsgálja. A squasholt követő ág külön széleset (#144). `scripts/qa/three-phase-check.test.mjs:26` · P-042

### R-KAN-520 · Az öt kapu-skill szöveghű tükre és tényleges kényszerítése külön legyen igazolható

- **Azonosító** — R-KAN-520
- **Cím** — Az öt kapu-skill szöveghű tükre és tényleges kényszerítése külön legyen igazolható
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Az öt kapu-skill szöveghű tükre és tényleges kényszerítése külön legyen igazolható.
- **Forrás** — scripts/qa/gates/skills-sync-check.mjs:17; scripts/qa/gates/gates.config.json:63
- **Mi van kész** — A regiszter öt párt nevez meg. Mind az öt .agents/.claude példány szövege egyezett sorvég-normalizálva. A kapuk saját futtatóval és teszttel rendelkeznek.
- **Mi hiányzik** — Az egyező tükör nem igazolja a külső kiadási utak, a vak ítélet, a teljes szálhalmaz vagy az aktuális ágvédelem lefedését.
- **Folytatás helye** — scripts/qa/gates/skills-sync-check.mjs:17
- **Következő lépés** — A lent felsorolt öt skill minden hivatkozását a főági futtatóhoz rendeld. A skills-sync-check.test.mjs ellenőrizze az eltérő tükröt, a pre-pr és pre-merge egységteszt az elavult ítéletet és lapozott szállistát.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-043, P-044, P-045

### R-KAN-521 · A nyilvános gyártásnapló történeti állításai ne minősüljenek a mai leckék ellenőrzésének

- **Azonosító** — R-KAN-521
- **Cím** — A nyilvános gyártásnapló történeti állításai ne minősüljenek a mai leckék ellenőrzésének
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A nyilvános gyártásnapló történeti állításai ne minősüljenek a mai leckék ellenőrzésének.
- **Forrás** — memory/projects/websuli/LEDGER.md:435; memory/projects/websuli/LEDGER.md:533
- **Mi van kész** — A #120 bankellenőrt, a #148 témafókusz-javítást szállított. A 4ec12adf az önellentmondó állítás tanítását akadályozza. Egy konkrét publikált próbaleckére hét korábbi bankhibát jegyeztek fel.
- **Mi hiányzik** — A kijavított vagy megőrzésre/törlésre kijelölt konkrét tartalom mai verziójának, valamint a fókusz nélküli próbalecke tulajdonosi döntésének visszaolvasása.
- **Folytatás helye** — memory/projects/websuli/LEDGER.md:435
- **Következő lépés** — A jogosult admin a LEDGER 533., 586. és 623. sorában jelzett történeti eseteket a mentett változatokkal egyeztesse. Csak személytelen összesítést tartson meg. Szintetikus tételen a source-coverage-gate.test.ts fedje a forráskonfliktust.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-059

### R-KAN-522 · A régi gyártási minták nyitott szakmai és futásidejű kérdéseinek visszamérése

- **Azonosító** — R-KAN-522
- **Cím** — A régi gyártási minták nyitott szakmai és futásidejű kérdéseinek visszamérése
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A régi gyártási minták nyitott szakmai és futásidejű kérdéseinek visszamérése.
- **Forrás** — memory/projects/websuli/LEDGER.md:309; memory/projects/websuli/LEDGER.md:321; memory/projects/websuli/LEDGER.md:480
- **Mi van kész** — A napló jelzi a webes cím / admin figyelmeztetés bizonytalanságát, a 20 perces célidőt és egy több részfeladatos térfogati példa hiányzó levezetését. Azóta #262 motorváltás történt.
- **Mi hiányzik** — A mai motoron ugyanezeknek az elfogadási feltételeknek az összehasonlítható eredménye.
- **Folytatás helye** — memory/projects/websuli/LEDGER.md:309
- **Következő lépés** — A source/scripts/measure/single-run-measure.mts fájlbemenetével állíts elő idő- és levezetési mérőlapot. A web-research-completion.spec.ts próbában ellenőrizd a címet és a figyelmeztetést egy mesterséges tartalmon.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-029, P-033

### R-KAN-523 · A júliusi OAuth-forgatás és az októberi incidens külön igazolást kapjon

- **Azonosító** — R-KAN-523
- **Cím** — A júliusi OAuth-forgatás és az októberi incidens külön igazolást kapjon
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az adatvédelem vagy a kiadási bizonyíték megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A júliusi OAuth-forgatás és az októberi incidens külön igazolást kapjon.
- **Forrás** — memory/projects/websuli/BACKLOG.md:17; memory/projects/websuli/LEDGER.md:61
- **Mi van kész** — A git-előzmény tisztítása és az októberi #9 jegy két külön esemény. A backlog a júliusi hitelesítő forgatását még nyitottnak jelöli.
- **Mi hiányzik** — A szolgáltatóban megtörtént visszavonás dátumozott, értékmentes bizonyítéka.
- **Folytatás helye** — memory/projects/websuli/BACKLOG.md:17
- **Következő lépés** — A jogosult tulajdonos a privát titoktárból ellenőrizze külön a júliusi és az októberi listát. A BACKLOG.md csak a lezárási állapotot tartalmazza, kulcsot vagy szolgáltatási azonosítót ne.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — —

### R-KAN-524 · A történeti QA-adósságot az aktuális futtatóhoz kell mérni

- **Azonosító** — R-KAN-524
- **Cím** — A történeti QA-adósságot az aktuális futtatóhoz kell mérni
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A történeti QA-adósságot az aktuális futtatóhoz kell mérni.
- **Forrás** — memory/projects/websuli/BACKLOG.md:40; .github/workflows/ci.yml:66
- **Mi van kész** — A régi lint-tartozással szemben a main ma nulla figyelmeztetést követel. A mobil játékokhoz valós Playwright-próbák vannak (#438), a lapok között külön admin-, preview- és PDF-út is szerepel a backlogban.
- **Mi hiányzik** — A régi mérésből fennmaradt egyetlen batch-kérés, PDF- és adminút, Szólétra menükép, gépfüggő Python/Playwright környezet, mentéscsomagok és VPS-leírások mai közös egyeztetése.
- **Folytatás helye** — memory/projects/websuli/BACKLOG.md:40
- **Következő lépés** — A BACKLOG.md tételeit a mai tesztnevekhez rendeld. Hideg lapi indításnál kérésdarabszámot és menüképet, admin/PDF esetén renderelt állapotot rögzíts. A követett backupfájlok körét git-fájllistával vizsgáld.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-050, P-051, P-053

### R-KAN-525 · A naplóban hozzáférés miatt elmaradt publikációs próba külön átadás legyen

- **Azonosító** — R-KAN-525
- **Cím** — A naplóban hozzáférés miatt elmaradt publikációs próba külön átadás legyen
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A tulajdonosi munkafolyamat teljesítéséhez szükséges.
- **Eredeti utasítás / cél** — A naplóban hozzáférés miatt elmaradt publikációs próba külön átadás legyen.
- **Forrás** — memory/projects/websuli/LEDGER.md:751; memory/projects/websuli/runtime-document-manifest.yaml:11
- **Mi van kész** — A napló korabeli 401-et közöl, az ARM-mátrix főági workflow-ja megvan. A két ügy egymástól független.
- **Mi hiányzik** — A megjelölt évfolyamos tananyag publikációjának adminos végállapota és visszaolvasása nincs igazolva a helyi gitből.
- **Folytatás helye** — memory/projects/websuli/LEDGER.md:751
- **Következő lépés** — A jogosult kezelő a docs/lesson-improvement.md szerinti visszaolvasást végezze el a kijelölt anyagon. A jelentés a verziót és az elfogadási eredményt tartalmazza, nyilvános tanulói adat nélkül.
- **Függőség / ütközés** — A főági kód és a későbbi döntések sorrendjét együtt kell megőrizni.
- **Kapcsolódó P-tétel** — P-059

### R-KAN-402 · A hitelesítő adatok helyét csak privát forrásból oldja fel az ügynök

- **Azonosító** — R-KAN-402
- **Cím** — A hitelesítő adatok helyét csak privát forrásból oldja fel az ügynök
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A hitelesítő adatok helyét csak privát forrásból oldja fel az ügynök.
- **Forrás** — Privát projektmemória · `api-keys-location.md:11`
- **Mi van kész** — Van privát útmutató és nyilvános titokkezelési szabály. `AGENTS.md:14`
- **Mi hiányzik** — A visszavonás és az aktuális hozzáférés titoktárhoz kötött állapot.
- **Folytatás helye** — Főági kiindulópont `AGENTS.md:14`
- **Következő lépés** — Az üzemeltető a privát jegyben ellenőrizze a hivatkozás érvényességét. Az AGENTS.md szerinti ellenpróbában csak hozzáférhető/nem hozzáférhető eredmény kerüljön vissza.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-403 · Az archivált migrációs tapasztalat maradjon visszakereshető

- **Azonosító** — R-KAN-403
- **Cím** — Az archivált migrációs tapasztalat maradjon visszakereshető
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Az archivált migrációs tapasztalat maradjon visszakereshető.
- **Forrás** — Privát projektmemória · `archive/2026-11-17/legacy-migration-cycles.md:11`
- **Mi van kész** — Az archív fájl és az aktív összefoglaló egyaránt elérhető. A skill ötös ciklusokat ír le. `.claude/skills/websuli-gyartas-analitika/SKILL.md:8`
- **Mi hiányzik** — A rövidített aktív változat és a régi mérési feltételek egyezése nincs folyamatosan ellenőrizve.
- **Folytatás helye** — Főági kiindulópont `.claude/skills/websuli-gyartas-analitika/SKILL.md:8`
- **Következő lépés** — A két azonos nevű jegyzetből a ciklushatárt és jóváhagyást vesd össze a skillben leírt feltételekkel. Öt engedélyezett plusz egy további próbaanyag legyen a kontroll.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-059

### R-KAN-405 · A kizárólagos ítéletet a független vak futtató adja

- **Azonosító** — R-KAN-405
- **Cím** — A kizárólagos ítéletet a független vak futtató adja
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A kizárólagos ítéletet a független vak futtató adja.
- **Forrás** — Privát projektmemória · `blind-bug-hunting-reviewer.md:11`
- **Mi van kész** — A főágon még külön rögzítik az ítéletet. Az ági f84742c7 vezette be a november 19-i modell- és kizárólagossági döntést. `scripts/qa/gates/record-review.mjs:5`
- **Mi hiányzik** — A friss ellenőrzési szerződés főági bekötése és a régi leírások átvezetése.
- **Folytatás helye** — Főági kiindulópont `scripts/qa/gates/record-review.mjs:5`
- **Következő lépés** — A chore/vak-ellenor-deepseek ágon a vak-ellenor.test.mjs tesztelje, hogy csak a vizsgált fejre szóló futtatói ítélet fogadható el.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-043

### R-KAN-406 · A vak futtató költség- és hibaszerződése legyen egyértelmű

- **Azonosító** — R-KAN-406
- **Cím** — A vak futtató költség- és hibaszerződése legyen egyértelmű
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A vak futtató költség- és hibaszerződése legyen egyértelmű.
- **Forrás** — Privát projektmemória · `blind-review-runner.md:11`
- **Mi van kész** — A gépi ellenőr ága 1e564a01, a további életjel és lezárási út 27d51327. A főági regiszterben a vak parancs hiányzik. `scripts/qa/gates/gates.config.json:1`
- **Mi hiányzik** — A költséghatár, hibaok és élő zárvárás egységes kiadása.
- **Folytatás helye** — Főági kiindulópont `scripts/qa/gates/gates.config.json:1`
- **Következő lépés** — A feat/gpt-teljesitesi-or ág vak-ellenor.test.mjs próbájában határ fölötti konfiguráció, megszakítás és életjelet adó zárvárás külön eredményt adjon.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-043

### R-KAN-407 · A hibás ellenőrzés állítsa meg a kiadást és a napló fedje el a titkot

- **Azonosító** — R-KAN-407
- **Cím** — A hibás ellenőrzés állítsa meg a kiadást és a napló fedje el a titkot
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A hibás ellenőrzés állítsa meg a kiadást és a napló fedje el a titkot.
- **Forrás** — Privát projektmemória · `check-chain-and-secret-output.md:11`
- **Mi van kész** — Közös lépésfuttató létezik. A kitakaró nagy bemenetre készült javítása a #521 ágon van. `scripts/qa/gates/lib.mjs:48`
- **Mi hiányzik** — A #521 változat integrációja és a hibakimeneti maszkolás igazolása minden belépőn.
- **Folytatás helye** — Főági kiindulópont `scripts/qa/gates/lib.mjs:48`
- **Következő lépés** — A #521 változatán mesterséges jelzővel próbáld a lib.test.mjs pozitív és hibás kilépési útjait. A hiba őrizze meg a kilépési állapotot a jelző megjelenése nélkül.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-049

### R-KAN-408 · A már nem használt archívumokat tételesen vezessék ki

- **Azonosító** — R-KAN-408
- **Cím** — A már nem használt archívumokat tételesen vezessék ki
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A már nem használt archívumokat tételesen vezessék ki.
- **Forrás** — Privát projektmemória · `cleanup-delete-archives.md:11`
- **Mi van kész** — A régi kiszolgálás fájljainak archiválását a tudástár dokumentálja. A 2026-11-18-i döntés ennél további takarítást kér. `memory/indexes/index.yml:59`
- **Mi hiányzik** — A hivatkozók, megőrzendő tételek és tulajdonosi törlési döntés egyeztetése.
- **Folytatás helye** — Főági kiindulópont `memory/indexes/index.yml:59`
- **Következő lépés** — Készíts név szerinti hivatkozásleltárt a memory/indexes/index.yml archív csoportjához. Kivezetés után ellenőrizd az összes megmaradó indexcél létezését.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-051

### R-KAN-410 · A munkamenet vége ellenőrizze az eredeti kérések teljességét

- **Azonosító** — R-KAN-410
- **Cím** — A munkamenet vége ellenőrizze az eredeti kérések teljességét
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A munkamenet vége ellenőrizze az eredeti kérések teljességét.
- **Forrás** — Privát projektmemória · `completion-mandate.md:11`
- **Mi van kész** — A mandátum szövege főágon van. A session-zárás gyűjtője és Stop hookja a 231276f5 ági commitban szerepel. `AGENTS.md:123`
- **Mi hiányzik** — A főági automatikus lezárás és a környezetbeli Stop bekötés külön hiány.
- **Folytatás helye** — Főági kiindulópont `AGENTS.md:123`
- **Következő lépés** — A feat/session-zaras-kereses-osszevetes ág session-closeout.test.mjs tesztjében egy hiányzó kérést és egy idegen munkafát külön ellenőrizz. A tényleges Stop-regisztrációt is olvasd vissza.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-047

### R-KAN-411 · Témaköri borítók, korosztályos arculat és eszközfüggő stúdiónagyítás

- **Azonosító** — R-KAN-411
- **Cím** — Témaköri borítók, korosztályos arculat és eszközfüggő stúdiónagyítás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Témaköri borítók, korosztályos arculat és eszközfüggő stúdiónagyítás.
- **Forrás** — Privát projektmemória · `design-bank-decisions.md:11`
- **Mi van kész** — A bank S2–S3 változása a 3a432dff commitban, a feliratok a d24f5565 commitban vannak. `source/tests/design-assets.test.ts:1`
- **Mi hiányzik** — A teljes tantárgy × sáv × témakör készlet, a jóváhagyott eszközök és az asztali skálázás együtt nem igazolt.
- **Folytatás helye** — Főági kiindulópont `source/tests/design-assets.test.ts:1`
- **Következő lépés** — A design-assets.test.ts készletvizsgálatát vesd össze a manifesttel. Mobilon, hajlítható és asztali nézetben mérd a stúdió skálázását és az érintési célt.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-412 · A kereszt-originos diktálás, felolvasás és kiejtésgyakorlás működjön

- **Azonosító** — R-KAN-412
- **Cím** — A kereszt-originos diktálás, felolvasás és kiejtésgyakorlás működjön
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A kereszt-originos diktálás, felolvasás és kiejtésgyakorlás működjön.
- **Forrás** — Privát projektmemória · `dictation-tts-language-lessons.md:11`
- **Mi van kész** — A #360 a híd javításához, a #516 a lejátszási lánchoz ad főági bizonyítékot. `source/shared/pronunciation.ts:1`
- **Mi hiányzik** — Nem igazolt minden régi HTML- és Studio-nyelvlecke teljes hangútja valódi eszközön.
- **Folytatás helye** — Főági kiindulópont `source/shared/pronunciation.ts:1`
- **Következő lépés** — A pronunciation.test.ts melletti lapi próbában régi és új nyelvleckével gyakorold az engedély megadását, visszavonását, megszakítást és a tartalékhangot.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-032

### R-KAN-413 · Saját eldobható adatbázissal lehessen integrációs próbát indítani

- **Azonosító** — R-KAN-413
- **Cím** — Saját eldobható adatbázissal lehessen integrációs próbát indítani
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Saját eldobható adatbázissal lehessen integrációs próbát indítani.
- **Forrás** — Privát projektmemória · `docker-available.md:11`
- **Mi van kész** — A főági DB-futtató időkorláttal rendelkezik. A memória dátumozott helyi Docker-állapotot közöl. `source/scripts/run-learning-db-tests.ts:111`
- **Mi hiányzik** — A jelenlegi gép futtatója és az idegen konténerektől izolált indítás most nem volt ellenőrizhető.
- **Folytatás helye** — Főági kiindulópont `source/scripts/run-learning-db-tests.ts:111`
- **Következő lépés** — A DB-futtató dokumentált előfeltételeit jogosult helyi próbában csak saját címkéjű eldobható konténerrel ellenőrizd. Visszaolvasással igazold a saját erőforrás eltűnését.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-415 · Online párbaj, hibrid szerepek és fokozatos csoportos indítás

- **Azonosító** — R-KAN-415
- **Cím** — Online párbaj, hibrid szerepek és fokozatos csoportos indítás
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Online párbaj, hibrid szerepek és fokozatos csoportos indítás.
- **Forrás** — Privát projektmemória · `game-multiplayer-decisions.md:11`
- **Mi van kész** — #460 kivezette az egyeszközös párbajt, #464 és #476 a kétfős módot szállította. #483 megtartotta a Szökőár irányítását. `source/shared/duel/room-machine.ts:10`
- **Mi hiányzik** — A 3–4 fős létszám, meccs vége és a D-07 szerinti élesítési sorrend igazolása.
- **Folytatás helye** — Főági kiindulópont `source/shared/duel/room-machine.ts:10`
- **Következő lépés** — A rt-room-machine.test.ts állapottábláját három és négy fővel futtasd végig újracsatlakozás, kilépés és visszavágó mellett. A pilot előfeltétele a #97.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-018, P-019, P-022

### R-KAN-416 · A nehéz futások egy gépi soron haladjanak, és az ítélet maradjon fejhez kötve

- **Azonosító** — R-KAN-416
- **Cím** — A nehéz futások egy gépi soron haladjanak, és az ítélet maradjon fejhez kötve
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A nehéz futások egy gépi soron haladjanak, és az ítélet maradjon fejhez kötve.
- **Forrás** — Privát projektmemória · `gate-speed-decisions.md:11`
- **Mi van kész** — A gépi zár a feat/gepi-zar ágon, az összefésült próba fix/kapu-gyorsitas ágon készül. A 06116e93 az eredeti átvitelrészt külön PR-ba tette. `scripts/qa/gates/pre-merge-gate.mjs:83`
- **Mi hiányzik** — A külön kezelt bizonyítékátvitel, sorvárás, WIP-határ és a főági kapuk közös ellenpróbája.
- **Folytatás helye** — Főági kiindulópont `scripts/qa/gates/pre-merge-gate.mjs:83`
- **Következő lépés** — A machine-lock.test.mjs ági tesztben két váróval próbáld a sor és időkeret megőrzését. A pre-merge-gate.test.mjs külön utasítsa el az érvénytelen korábbi bizonyítékot.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-046, P-058

### R-KAN-417 · A modell félbehagyott jelentését és néma megállását gép észlelje

- **Azonosító** — R-KAN-417
- **Cím** — A modell félbehagyott jelentését és néma megállását gép észlelje
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A modell félbehagyott jelentését és néma megállását gép észlelje.
- **Forrás** — Privát projektmemória · `gpt-completion-contract.md:11`
- **Mi van kész** — A 7f15320b implementálta a szerződést, a folytatást és az életjelet, a 27d51327 kiegészítette a lezárási nyomot. `AGENTS.md:123`
- **Mi hiányzik** — A feat/gpt-teljesitesi-or mechanizmus főági elfogadása és bekötése.
- **Folytatás helye** — Főági kiindulópont `AGENTS.md:123`
- **Következő lépés** — Az ág scripts/qa/gates/blind-review/completeness.test.mjs próbájában hiányzó tétel, javaslat nélküli tétel és élő, de előre nem haladó futás külön eredményt adjon.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-418 · A párosító linkek forgatása ne történjen véletlenül

- **Azonosító** — R-KAN-418
- **Cím** — A párosító linkek forgatása ne történjen véletlenül
- **Állapot** — RÉSZBEN
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A párosító linkek forgatása ne történjen véletlenül.
- **Forrás** — Privát projektmemória · `learner-profile-tokens.md:11`
- **Mi van kész** — Az aláírási logika a főágon található, az üzemeltetési függést a privát memória rögzíti. `source/server/lib/learner-token.ts:1`
- **Mi hiányzik** — A külön kulcs vagy tartalékkulcs tényleges használata és a forgatás hatóköre csak üzemeltetői körben igazolható.
- **Folytatás helye** — Főági kiindulópont `source/server/lib/learner-token.ts:1`
- **Következő lépés** — A learner-token.ts szerződését két szintetikus kulccsal próbáld. Dokumentáld az érvénytelenítés és az újrapárosítás feltételét értékkiírás nélkül.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-419 · Az ötös gyártási ciklusok vizsgálata különüljön el a korábbi kampány lezárásától

- **Azonosító** — R-KAN-419
- **Cím** — Az ötös gyártási ciklusok vizsgálata különüljön el a korábbi kampány lezárásától
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Az ötös gyártási ciklusok vizsgálata különüljön el a korábbi kampány lezárásától.
- **Forrás** — Privát projektmemória · `legacy-migration-cycles.md:11`
- **Mi van kész** — A memória lezárt történeti kampányt jegyez, a #352 cikluskorlátját és a gyártáselemző skillt a repó őrzi. A gyártókód tényleges véghatára 178 (source/server/studio/legacy-migration.ts:32), és a 137 + 41 végciklust külön próba őrzi (source/tests/regi-anyag-studio.test.ts:113). `.claude/skills/websuli-gyartas-analitika/SKILL.md:8`
- **Mi hiányzik** — A módszer frissítési gyakoriságának és az új futások jóváhagyásának ismételhető bizonyítéka.
- **Folytatás helye** — Főági kiindulópont `.claude/skills/websuli-gyartas-analitika/SKILL.md:8`
- **Következő lépés** — A skillben kapcsold a módszerfrissítést egy ötös ciklus szintetikus előtte/utána telemetriájához. A régi összesítést csak dátummal közöld.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-059

### R-KAN-420 · Minden értékelt feladat és kvíz eredménye érje el az adminokat

- **Azonosító** — R-KAN-420
- **Cím** — Minden értékelt feladat és kvíz eredménye érje el az adminokat
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Minden értékelt feladat és kvíz eredménye érje el az adminokat.
- **Forrás** — Privát projektmemória · `lesson-results-email-rule.md:11`
- **Mi van kész** — #495 foglalás, #496 kvízeredmény. A régi HTML-út a source/server/lib/material-capture.ts fájlban található. `source/server/lesson-result-email.ts:127`
- **Mi hiányzik** — A félbehagyott kör, késői pillanatkép és fogadási idő helyes egyeztetése (#119, #189–191, #207).
- **Folytatás helye** — Főági kiindulópont `source/server/lesson-result-email.ts:127`
- **Következő lépés** — A #510 levéltesztjeibe vendég, fiókos és megszakított kör kerüljön. Ismételt véglegesítéskor címzettenként egyetlen helyes levél keletkezzen.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-024, P-025

### R-KAN-421 · Promptváltozás azonos mérhető alapvonallal legyen összevethető

- **Azonosító** — R-KAN-421
- **Cím** — Promptváltozás azonos mérhető alapvonallal legyen összevethető
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — Promptváltozás azonos mérhető alapvonallal legyen összevethető.
- **Forrás** — Privát projektmemória · `lesson-trial-harness.md:11`
- **Mi van kész** — A régi lépésgépes mérőt #262 kivezette; a mai mérő külön fájlbemenetet támogat. `source/scripts/measure/single-run-measure.mts:42`
- **Mi hiányzik** — Nincs bizonyíték, hogy minden promptmódosításhoz elmentik a változatpárt és a számítás módját.
- **Folytatás helye** — Főági kiindulópont `source/scripts/measure/single-run-measure.mts:42`
- **Következő lépés** — A single-run-measure.mts fájlbemenetén ugyanazon személytelen példákra azonos nevezővel mérj alap- és változateredményt. Az eltérő forrásmintát jelezze a riport.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-033

### R-KAN-422 · A változatosabb leckék és szebb ábrák kapjanak elsőbbséget

- **Azonosító** — R-KAN-422
- **Cím** — A változatosabb leckék és szebb ábrák kapjanak elsőbbséget
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A változatosabb leckék és szebb ábrák kapjanak elsőbbséget.
- **Forrás** — Privát projektmemória · `lesson-variety-priority.md:11`
- **Mi van kész** — 2026-11-20-i prioritás. Az S5a–SK2 láncon e1eb06ad, 4c8b34bc és ce6db8a3, az S2b és S3a1 ágon szintén van új kód. A #515 az alap. `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md:220`
- **Mi hiányzik** — A fejlesztési ágak integrálása és a teljes vizuális cél igazolása főágon; az S3b élesítése külön feltétel.
- **Folytatás helye** — Főági kiindulópont `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md:220`
- **Következő lépés** — A feat/tgm-sk2-valtozatossag-kapu ág variety-metrics.test.ts és lesson-variety-feedback.browser.ts próbáját az ábrás mintaleckén is értékeld. Az S3b kiadása előtt külön mérd a forrásfedettséget.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-028, P-030

### R-KAN-424 · A futó hookok verziója egyezzen a szándékolt főági verzióval

- **Azonosító** — R-KAN-424
- **Cím** — A futó hookok verziója egyezzen a szándékolt főági verzióval
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A futó hookok verziója egyezzen a szándékolt főági verzióval.
- **Forrás** — Privát projektmemória · `main-checkout-must-be-current.md:11`
- **Mi van kész** — A hookot a settings regisztrálja, az incidens a munkamenet fő könyvtárának eltérését dokumentálja. `.claude/settings.json:12`
- **Mi hiányzik** — Munkafánként és frissítés után is visszaolvasható verzióazonosság.
- **Folytatás helye** — Főági kiindulópont `.claude/settings.json:12`
- **Következő lépés** — A settings-hooks.test.mjs két külön revíziójú próbafában ellenőrizze a kiválasztott scriptet. A fő munkakönyvtár frissítését külön üzemeltetési lépésként kezeld.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-045, P-057

### R-KAN-425 · A közös promptelőtag maradjon újrahasznosítható

- **Azonosító** — R-KAN-425
- **Cím** — A közös promptelőtag maradjon újrahasznosítható
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A közös promptelőtag maradjon újrahasznosítható.
- **Forrás** — Privát projektmemória · `maximize-prompt-cache.md:11`
- **Mi van kész** — A blokkjelzők kezelését a kód, a stabil előtagot a bf5dbdac commit rögzíti. `source/server/studio/single-run/conversation.ts:75`
- **Mi hiányzik** — Az orkesztrátor, a vak ellenőr és a gyakorlati gyártások tényleges találati aránya nincs itt mérve.
- **Folytatás helye** — Főági kiindulópont `source/server/studio/single-run/conversation.ts:75`
- **Következő lépés** — A single-run-conversation.test.ts próbájában stabil előtag mellé két eltérő végződést adj. A beszélgetési telemetriában külön jelenjen meg a cache-olvasás.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-427 · A kiadás ne szakítson meg tananyaggyártást

- **Azonosító** — R-KAN-427
- **Cím** — A kiadás ne szakítson meg tananyaggyártást
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A kiadás ne szakítson meg tananyaggyártást.
- **Forrás** — Privát projektmemória · `no-deploy-during-active-runs.md:11`
- **Mi van kész** — A főági merge-kapu futtatja az active-runs-guard.sh őrt (#489). `scripts/qa/gates/pre-merge-gate.mjs:108`
- **Mi hiányzik** — A mérés és a tényleges telepítés között induló futás kizárása, valamint az egyéb kiadási utak egyezése nincs igazolva.
- **Folytatás helye** — Főági kiindulópont `scripts/qa/gates/pre-merge-gate.mjs:108`
- **Következő lépés** — A pre-merge-gate.test.mjs-ben az első ellenőrzés után indíts szintetikus futást. Vizsgáld az összevonási ablak és a szerver leállításának szerződését.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-428 · A játékszeletek közös mobilmérővel, rögzített technikai feltételekkel induljanak

- **Azonosító** — R-KAN-428
- **Cím** — A játékszeletek közös mobilmérővel, rögzített technikai feltételekkel induljanak
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A játékszeletek közös mobilmérővel, rögzített technikai feltételekkel induljanak.
- **Forrás** — Privát projektmemória · `orchestration-lessons-games.md:11`
- **Mi van kész** — #422 közös keret és #438 záró mérés van. A memó a forrásbankot, eszközöket és szerephatárokat is összefogja. `source/tests/game-mobile-quality.spec.ts:1`
- **Mi hiányzik** — Az új J-hullám ági szeleteinek együttes mérési és review-eredménye.
- **Folytatás helye** — Főági kiindulópont `source/tests/game-mobile-quality.spec.ts:1`
- **Következő lépés** — A #484 és #486 valódi játékútjait azonos készülékmátrixon add a game-mobile-quality.spec.ts méréshez. A közös réteg változása után mindkét fogyasztót értékeld.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-014, P-016

### R-KAN-429 · A párhuzamos munkamenetek kiadási munkáját egy felelős rendezze sorba

- **Azonosító** — R-KAN-429
- **Cím** — A párhuzamos munkamenetek kiadási munkáját egy felelős rendezze sorba
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A párhuzamos munkamenetek kiadási munkáját egy felelős rendezze sorba.
- **Forrás** — Privát projektmemória · `orchestrator-owns-all-websuli-flows.md:11`
- **Mi van kész** — Az aktív követést a főági szabálykönyv, a november 18-i kiterjesztést a memória írja le. Gépszintű zár a feat/gepi-zar ágon van. `AGENTS.md:194`
- **Mi hiányzik** — Munkamenet-váltáskor a saját és az átvett futás azonosítása, árva várakozó kimutatása.
- **Folytatás helye** — Főági kiindulópont `AGENTS.md:194`
- **Következő lépés** — A gépi zár ági machine-lock.test.mjs próbájában két munkamenetet és elvesző tulajdonost modellezz. Átvétel után pontosan egy folyamaté legyen a kiadási jog.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-046, P-060

### R-KAN-430 · A 68 pótláshoz legyen végrehajtható sorrend és 16 döntés

- **Azonosító** — R-KAN-430
- **Cím** — A 68 pótláshoz legyen végrehajtható sorrend és 16 döntés
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A 68 pótláshoz legyen végrehajtható sorrend és 16 döntés.
- **Forrás** — Privát projektmemória · `potlasok-terv-dontesek.md:11`
- **Mi van kész** — A docs/websuli-potlasok ág 50 szeletes terve és a D-01–D-16 döntések olvashatók. A főág fájllistájában a két pótlási dokumentum hiányzik. `docs/websuli-potlasok:docs/specs/2026-11-19-websuli-potlasok-terv.md:1`
- **Mi hiányzik** — Az ági terv és a frissebb fejlesztői ágak összevezetése, főági átadás.
- **Folytatás helye** — `docs/websuli-potlasok:docs/specs/2026-11-19-websuli-potlasok-terv.md:1`
- **Következő lépés** — A terv minden D-azonosítóját rendeld P-tételhez, majd ellenőrizd a 68 P-azonosító és az 50 szelet lefedését. A P-030 és P-043 állapotát az új ági fejekhez igazítsd.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-042, P-043

### R-KAN-431 · A helyi, független és kiadási ellenőrzés sorrendje legyen naprakész

- **Azonosító** — R-KAN-431
- **Cím** — A helyi, független és kiadási ellenőrzés sorrendje legyen naprakész
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A helyi, független és kiadási ellenőrzés sorrendje legyen naprakész.
- **Forrás** — Privát projektmemória · `quality-gates-mandate.md:11`
- **Mi van kész** — A #489 és #490 létrehozta az alapkapukat és a második véleményt. `AGENTS.md:152`
- **Mi hiányzik** — A november 18–19-i döntés óta a Gemini-sor és a kötelező kézi ítélet leírása elavult.
- **Folytatás helye** — Főági kiindulópont `AGENTS.md:152`
- **Következő lépés** — A vak futtató integrálásával együtt igazítsd a docs/minosegkapuk.md és a skillék sorrendjét. A record-review.test.mjs elavult fejre tiltsa az elfogadást.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-043

### R-KAN-432 · Csak a ténylegesen megválaszolt review-szál záruljon

- **Azonosító** — R-KAN-432
- **Cím** — Csak a ténylegesen megválaszolt review-szál záruljon
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Csak a ténylegesen megválaszolt review-szál záruljon.
- **Forrás** — Privát projektmemória · `resolve-only-answered-threads.md:11`
- **Mi van kész** — A merge-kapu lekéri a szálállapotot. `scripts/qa/gates/pre-merge-gate.mjs:159`
- **Mi hiányzik** — A lezárás és a tényleges válasz azonosságát pusztán a lezártság olvasása nem igazolja.
- **Folytatás helye** — Főági kiindulópont `scripts/qa/gates/pre-merge-gate.mjs:159`
- **Következő lépés** — A pre-merge-gate.test.mjs fixtúrában egy válaszolt és egy válaszolatlan szál szerepeljen. Az utóbbi maradjon nyitott; lapozott listán is vizsgáld.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-044, P-061

### R-KAN-433 · A dönthető gyártási szabályokat a futó program is ellenőrizze

- **Azonosító** — R-KAN-433
- **Cím** — A dönthető gyártási szabályokat a futó program is ellenőrizze
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A dönthető gyártási szabályokat a futó program is ellenőrizze.
- **Forrás** — Privát projektmemória · `runtime-script-guards.md:11`
- **Mi van kész** — A #515 forrásfedettségi ellenőrzést ad. A J3–J10 feladatok külön leltárban és a #145 jegyen szerepelnek. `source/server/studio/gates/source-coverage-gate.ts:25`
- **Mi hiányzik** — Tartós kézbesítési állapot, további determinisztikus gyártási őrök és teljes útpróba.
- **Folytatás helye** — Főági kiindulópont `source/server/studio/gates/source-coverage-gate.ts:25`
- **Következő lépés** — A #145 alatt a #515 kapujánál rejtett és megjelenő mezővel tesztelj, a levelezési részt szintetikus szolgáltatói eseménnyel fogadd el.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-054, P-066

### R-KAN-434 · Minden köztes szelet önállóan telepíthető legyen

- **Azonosító** — R-KAN-434
- **Cím** — Minden köztes szelet önállóan telepíthető legyen
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — Minden köztes szelet önállóan telepíthető legyen.
- **Forrás** — Privát projektmemória · `stacked-pr-standalone-neutral.md:11`
- **Mi van kész** — #511 és #515 alapból inaktív részeket hozott. A szabály a teljes jövőbeli PR-sorozatra is vonatkozik. `source/tests/source-coverage-gate.test.ts:1`
- **Mi hiányzik** — Ági B/C és TGM-szeletek köztes állapotának egyenkénti, kikapcsolt kapcsolós bizonyítéka.
- **Folytatás helye** — Főági kiindulópont `source/tests/source-coverage-gate.test.ts:1`
- **Következő lépés** — A következő integráció előtt mindegyik szelet saját fején hasonlítsd össze a kapcsoló nélküli HTML-t, végpontot és promptot a szülőcommittal. Használd a forrásfedettségi és advent-contract tesztet.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-028, P-034

### R-KAN-435 · A leállított figyelőhöz ne maradjon önálló háttérmunka

- **Azonosító** — R-KAN-435
- **Cím** — A leállított figyelőhöz ne maradjon önálló háttérmunka
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A leállított figyelőhöz ne maradjon önálló háttérmunka.
- **Forrás** — Privát projektmemória · `taskstop-orphan-monitor.md:11`
- **Mi van kész** — A figyelőhurok dokumentált. A pontos folyamatkezelés és zárvédelem követő ága feat/gepi-zar (be01c571). `docs/agent-csapdak.md:619`
- **Mi hiányzik** — A szülő leállítása utáni gyermekfolyamat-állapot igazolása.
- **Folytatás helye** — Főági kiindulópont `docs/agent-csapdak.md:619`
- **Következő lépés** — A machine-lock.test.mjs ági próbájában indíts saját gyermekfolyamatot, szakítsd meg a szülőt, és ellenőrizd, hogy idegen folyamat érintése nélkül takarít.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-060

### R-KAN-437 · A push friss, az érintett munkafához kötött audittal történjen

- **Azonosító** — R-KAN-437
- **Cím** — A push friss, az érintett munkafához kötött audittal történjen
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. Az ellenőrzés vagy a hozzáférés megbízhatóságát érinti.
- **Eredeti utasítás / cél** — A push friss, az érintett munkafához kötött audittal történjen.
- **Forrás** — Privát projektmemória · `websuli-push-audit-hook.md:11`
- **Mi van kész** — A #506 és #520 kezeli az időkorlátot és a kapuindítás téves tiltását. `scripts/qa/hooks/check-audit-ok.mjs:34`
- **Mi hiányzik** — A célmunkafához kötött audit és az összes adapter egyezésének visszamérése (#208).
- **Folytatás helye** — Főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`
- **Következő lépés** — A check-audit-ok.test.mjs-ben két ideiglenes munkafa saját bizonyítékát különítsd el; új fejre és lejárt rekordra külön elutasítás tartozzon.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — P-045, P-058

### R-KAN-438 · A napi ajánló csak ellenőrzött csatornabankból válasszon

- **Azonosító** — R-KAN-438
- **Cím** — A napi ajánló csak ellenőrzött csatornabankból válasszon
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. Dátumozott tulajdonosi vagy üzemeltetési követelmény.
- **Eredeti utasítás / cél** — A napi ajánló csak ellenőrzött csatornabankból válasszon.
- **Forrás** — Privát projektmemória · `youtube-channel-bank.md:11`
- **Mi van kész** — #369 és source/tests/youtube-channels.test.ts rögzíti a bank és a kiválasztás működését. `source/shared/youtube-channels.ts:1`
- **Mi hiányzik** — Az egyes külső csatornák aktuális elérhetősége és új felvétel előtti kézi szemléje gitből nem igazolható.
- **Folytatás helye** — Főági kiindulópont `source/shared/youtube-channels.ts:1`
- **Következő lépés** — A youtube-channels.test.ts ellenőrizze az azonosítók egyediségét és a sávokat. Új rekordhoz a jóváhagyott böngészős ellenőrzés dátumát jegyezd fel.
- **Függőség / ütközés** — A dátumozott döntést a hozzá tartozó kódverzióval együtt kell értelmezni.
- **Kapcsolódó P-tétel** — —

### R-KAN-077 · Egy postafiókhoz egy új ranglistaprofil jöhessen létre

- **Azonosító** — R-KAN-077
- **Cím** — Egy postafiókhoz egy új ranglistaprofil jöhessen létre
- **Állapot** — RÉSZBEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Egy postafiókhoz egy új ranglistaprofil jöhessen létre.
- **Forrás** — kanban-jegyek.txt:678 · #77 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/server/player/account-store.ts:280`; `source/tests/player-account-db.integration.ts`. A kapcsolódó alapváltozás #445 (9bda1373).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Egy postafiókhoz egy új ranglistaprofil jöhessen létre.
- **Folytatás helye** — origin/main · `source/server/player/account-store.ts`
- **Következő lépés** — `source/server/player/account-store.ts` · A D-06 szerint csak az új regisztráció kapjon kanonikus egyediséget, régi egyezést listázz. Szintetikus aliaspárral és párhuzamos regisztrációval igazold. Ellenőrzési hely: `source/tests/player-account-db.integration.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-020

### R-KAN-079 · Kockavadász rúnazár és tartással bányászás

- **Azonosító** — R-KAN-079
- **Cím** — Kockavadász rúnazár és tartással bányászás
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Kockavadász rúnazár és tartással bányászás.
- **Forrás** — kanban-jegyek.txt:689 · #79 (in_review, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/BlockCraftQuiz.tsx:82`; `source/tests/block-craft-real-touch.spec.ts`. A kapcsolódó alapváltozás #435 (fbb00395).
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `feat/jatek-j3a-kockavadasz-runabanya` @ `d2536dfe`
- **Következő lépés** — A(z) `feat/jatek-j3a-kockavadasz-runabanya` ágon hasonlítsd össze a főággal. `source/client/src/pages/BlockCraftQuiz.tsx` · A #484 ágán próbáld ki a rövid koppintást, tartást, szünetet és kuponos kört. D-04 szerint a régi és új ranglista másik verziókulcsot használjon. Ellenőrzési hely: `source/tests/block-craft-real-touch.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-001

### R-KAN-081 · Az Aszteroidában a kristálycélzás váltsa fel a kapukat

- **Azonosító** — R-KAN-081
- **Cím** — Az Aszteroidában a kristálycélzás váltsa fel a kapukat
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az Aszteroidában a kristálycélzás váltsa fel a kapukat.
- **Forrás** — kanban-jegyek.txt:714 · #81 (in_review, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/SpaceAsteroidQuiz.tsx:134`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #434 (8a92cd7a).
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `feat/jatek-j6a-aszteroida-kristaly` @ `46df9026`
- **Következő lépés** — A(z) `feat/jatek-j6a-aszteroida-kristaly` ágon hasonlítsd össze a főággal. `source/client/src/pages/SpaceAsteroidQuiz.tsx` · A #486 ágán ellenőrizd a találatot, életalapú véget és a leghosszabb választ kétujjas fekvő módban. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-002

### R-KAN-083 · A garázsstatisztika és a játékmag ugyanazt az értéket használja

- **Azonosító** — R-KAN-083
- **Cím** — A garázsstatisztika és a játékmag ugyanazt az értéket használja
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A garázsstatisztika és a játékmag ugyanazt az értéket használja.
- **Forrás** — kanban-jegyek.txt:729 · #83 (todo, 2026-11-17)
- **Mi van kész** — A #482 az alapjármű-statisztikákat módosította. A J7b külön ágon a tornado-upgrade-display és tornado-upgrades-effect teszt is megváltozott. Kapcsolódó hely: `source/client/src/pages/TornadoHunter200.tsx:273`; `source/tests/tornado-j7a.spec.ts`.
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A garázsstatisztika és a játékmag ugyanazt az értéket használja.
- **Folytatás helye** — `feat/jatek-j7b-tornado-utelagazas` @ `b066296d`
- **Következő lépés** — A(z) `feat/jatek-j7b-tornado-utelagazas` ágon hasonlítsd össze a főággal. `source/client/src/pages/TornadoHunter200.tsx` · A J7b ágon vesd össze a szélállóság telítését, a jármű saját stabilitását és a harmadik review-pontot a garázs kijelzésével. Minimum és maximum fejlesztéshez legyen párteszt. Ellenőrzési hely: `source/tests/tornado-j7a.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-003

### R-KAN-085 · Az Aszteroida követő teljesítmény- és irányítási leleteinek lezárása

- **Azonosító** — R-KAN-085
- **Cím** — Az Aszteroida követő teljesítmény- és irányítási leleteinek lezárása
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az Aszteroida követő teljesítmény- és irányítási leleteinek lezárása.
- **Forrás** — kanban-jegyek.txt:741 · #85 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/SpaceAsteroidQuiz.tsx:134`; `source/tests/game-mobile-quality.spec.ts`.
- **Mi hiányzik** — Az objektum-újrahasználat, InstancedMesh és lassított képkockamérés mellett igazolandó a kétujjas, balkezes és egyujjas irányítás, a kilenc hullám után megjelenő wave_10 felirat és az Aszteroida/Matek budapesti napváltása.
- **Folytatás helye** — `feat/jatek-j6a-aszteroida-kristaly` @ `46df9026`
- **Következő lépés** — A(z) `feat/jatek-j6a-aszteroida-kristaly` ágon hasonlítsd össze a főággal. `source/client/src/pages/SpaceAsteroidQuiz.tsx` · J6a után mérd az objektumszámot, rajzolásokat, hosszú képkockákat és botkalibrációt. D-08 szerint egy ujjal is befejezhető kör, budapesti napváltás és kétujjas célzás legyen a próbában. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`. A közös achievements.ts-ben a 9. és a 10. hullám határát, mindkét játékban a téli és nyári helyi éjfél két oldalát vizsgáld.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-021

### R-KAN-086 · A közös kérdéssáv első megjelenése maradjon olcsó

- **Azonosító** — R-KAN-086
- **Cím** — A közös kérdéssáv első megjelenése maradjon olcsó
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A közös kérdéssáv első megjelenése maradjon olcsó.
- **Forrás** — kanban-jegyek.txt:746 · #86 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/play/InlineQuestion.tsx:42`; `source/tests/play-lab.spec.ts`. A kapcsolódó alapváltozás #446 (57bd1b0e).
- **Mi hiányzik** — A kérdéssáv első renderének költsége, az 52 px-es szünetgomb, az elévült kuponos eset és a kiadási konfiguráció CI-bekötése, az Aszteroida menüszövege, a balkezes vezérlés és a koppintás mozgási küszöbe külön követendő.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/play/InlineQuestion.tsx`
- **Következő lépés** — Az InlineQuestion.tsx első rajzolását és az 52 px-es gombot ellenőrizd a source/tests/play-lab.spec.ts-ben. A source/tests/game-mobile-quality.spec.ts-ben próbáld ki a két kezet és a mozgatott koppintást. Vesd össze a #477 utáni kuponos próbát a CI által futtatott listával, a játék menüszövegét az Aszteroida jelenlegi szabályával.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-087 · Útelágazás és turbótöltés vezérelje a Tornadót

- **Azonosító** — R-KAN-087
- **Cím** — Útelágazás és turbótöltés vezérelje a Tornadót
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Útelágazás és turbótöltés vezérelje a Tornadót.
- **Forrás** — kanban-jegyek.txt:751 · #87 (in_progress, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TornadoHunter200.tsx:273`; `source/tests/tornado-j7a.spec.ts`. A kapcsolódó alapváltozás #482 (443d6b76).
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `feat/jatek-j7b-tornado-utelagazas` @ `b066296d`
- **Következő lépés** — A(z) `feat/jatek-j7b-tornado-utelagazas` ágon hasonlítsd össze a főággal. `source/client/src/pages/TornadoHunter200.tsx` · A J7b ágon igazold a tantárgy átadását, az elágazás és a turbó működését, a #83 szélső értékeit és a #87 jegyben nyitva hagyott képkockaköltséget. Ellenőrzési hely: `source/tests/tornado-j7a.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-003

### R-KAN-088 · A Brain Rotban legyen rivális, visszalopás és fordulóvége

- **Azonosító** — R-KAN-088
- **Cím** — A Brain Rotban legyen rivális, visszalopás és fordulóvége
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A Brain Rotban legyen rivális, visszalopás és fordulóvége.
- **Forrás** — kanban-jegyek.txt:759 · #88 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/BrainRotSteal.tsx:22`; `source/tests/brainrot-play.spec.ts`. A kapcsolódó alapváltozás #485 (b4b84db6).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A Brain Rotban legyen rivális, visszalopás és fordulóvége.
- **Folytatás helye** — origin/main · `source/client/src/pages/BrainRotSteal.tsx`
- **Következő lépés** — `source/client/src/pages/BrainRotSteal.tsx` · A D-09 szerinti rövid megerősítést próbáld a vezérlő peremén is, majd játssz le rivális elleni győzelmet és vereséget. Ellenőrzési hely: `source/tests/brainrot-play.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-015

### R-KAN-090 · Kockavadász közben telefonon is folyamatos maradjon a kép

- **Azonosító** — R-KAN-090
- **Cím** — Kockavadász közben telefonon is folyamatos maradjon a kép
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Kockavadász közben telefonon is folyamatos maradjon a kép.
- **Forrás** — kanban-jegyek.txt:770 · #90 (in_progress, 2026-11-17)
- **Mi van kész** — A #491 a referencia-stabilitást javította. A fizikai készülékhez készült renderelési változás a #504 ágon van. Kapcsolódó hely: `source/client/src/pages/BlockCraftQuiz.tsx:82`; `source/tests/block-craft-real-touch.spec.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Kockavadász közben telefonon is folyamatos maradjon a kép.
- **Folytatás helye** — `perf/kockavadasz-telefon-gyors` @ `80cdfd17`
- **Következő lépés** — A(z) `perf/kockavadasz-telefon-gyors` ágon hasonlítsd össze a főággal. `source/client/src/pages/BlockCraftQuiz.tsx` · A #491 referencia-stabilitásán túl hasonlítsd össze #504 árnyék- és hálóváltozását ugyanazzal a bányászmozdulattal, kihajtott és fekvő telefonnézetben. Ellenőrzési hely: `source/tests/block-craft-real-touch.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-004

### R-KAN-124 · A hétköznapi shell-argumentumok ne okozzanak téves tiltást

- **Azonosító** — R-KAN-124
- **Cím** — A hétköznapi shell-argumentumok ne okozzanak téves tiltást
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A hétköznapi shell-argumentumok ne okozzanak téves tiltást.
- **Forrás** — kanban-jegyek.txt:934 · #124 (todo, 2026-11-17)
- **Mi van kész** — A #499 a PowerShell idézőjel-értelmezését javította. A Bash ártalmatlan argumentumaira a megmaradt eltérés szerepel a jegy egyeztetésében. Kapcsolódó hely: `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A hétköznapi shell-argumentumok ne okozzanak téves tiltást.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · A #499 már kezelt esetei mellé készíts ártalmatlan szövegargumentum-fixtúrákat mindkét héjhoz. A művelet típusához kötött eredményt állítsd be. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-159 · Ismeretlen eszköznévnek legyen dokumentált auditdöntése

- **Azonosító** — R-KAN-159
- **Cím** — Ismeretlen eszköznévnek legyen dokumentált auditdöntése
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Ismeretlen eszköznévnek legyen dokumentált auditdöntése.
- **Forrás** — kanban-jegyek.txt:1089 · #159 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`; `scripts/qa/hooks/check-audit-ok.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Ismeretlen eszköznévnek legyen dokumentált auditdöntése.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-audit-ok.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-audit-ok.mjs` · Az eszközadapterek szerződését közös táblában rögzítsd. Ismert és ismeretlen eseményosztályhoz is tartozzon egy elvárt döntés. Ellenőrzési hely: `scripts/qa/hooks/check-audit-ok.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-161 · A gyártó promptazonosítói egyezzenek a kért képekkel

- **Azonosító** — R-KAN-161
- **Cím** — A gyártó promptazonosítói egyezzenek a kért képekkel
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A gyártó promptazonosítói egyezzenek a kért képekkel.
- **Forrás** — kanban-jegyek.txt:1100 · #161 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/scripts/design-assets/generate.ts:129`; `source/tests/advent-art-pipeline.test.ts`. A kapcsolódó alapváltozás #519 (7176046f).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A gyártó promptazonosítói egyezzenek a kért képekkel.
- **Folytatás helye** — `feat/advent-s3c-kepek` @ `28949f20`
- **Következő lépés** — A(z) `feat/advent-s3c-kepek` ágon hasonlítsd össze a főággal. `source/scripts/design-assets/generate.ts` · Az S3c ágban halmazegyezést vizsgálj a promptok és az eszközjegyzék között. Egy hiányzó, egy extra és egy ismételt azonosító külön bukjon. Ellenőrzési hely: `source/tests/advent-art-pipeline.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-036

### R-KAN-162 · Az elveszett kérdésről és a zárt ablakról látható üzenet is legyen

- **Azonosító** — R-KAN-162
- **Cím** — Az elveszett kérdésről és a zárt ablakról látható üzenet is legyen
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az elveszett kérdésről és a zárt ablakról látható üzenet is legyen.
- **Forrás** — kanban-jegyek.txt:1103 · #162 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az elveszett kérdésről és a zárt ablakról látható üzenet is legyen.
- **Folytatás helye** — `wip/advent-c-javitas` @ `1c667e26`
- **Következő lépés** — A(z) `wip/advent-c-javitas` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · A C ág állapotüzeneteit jelenítsd meg vizuálisan is. Ellenőrizd képernyőolvasóval és keskeny nézetben mindkét állapotot. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-035

### R-KAN-163 · Csak a valóban megjelenő tartalom számítson a forrásfedettségbe

- **Azonosító** — R-KAN-163
- **Cím** — Csak a valóban megjelenő tartalom számítson a forrásfedettségbe
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Csak a valóban megjelenő tartalom számítson a forrásfedettségbe.
- **Forrás** — kanban-jegyek.txt:1106 · #163 (todo, 2026-11-18)
- **Mi van kész** — A #515 a kaput jelentő módban hozta be. A D-03 döntés a kapu saját hibájára vázlatot és értesítést kér; az engine.ts:723 naplózva továbbmegy. Kapcsolódó hely: `source/server/studio/gates/source-coverage-gate.ts:25`; `source/tests/source-coverage-gate.test.ts`.
- **Mi hiányzik** — A valódi S10-minta alapján igazolandó az újramérés hibája, az ismétlődő vagy rejtett tartalom, kis leltár, írásjel, sorszám, mértékegység, csonkolás, küszöb alatti tartalomcsere, üres rajz és a forráslépések korlátja. A D-03 szerint hibánál vázlat és értesítés kell.
- **Folytatás helye** — origin/main · `source/server/studio/gates/source-coverage-gate.ts`
- **Következő lépés** — `source/server/studio/gates/source-coverage-gate.ts` · Az E1–E6 és J1–J8 eseteknél a renderelt mezőket vizsgáld. Csak rejtett mezőben szereplő feladat ne növelje a fedettséget. D-03 szerint belső hibánál maradjon vázlat és legyen értesítés. Ellenőrzési hely: `source/tests/source-coverage-gate.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-028

### R-KAN-164 · A kapuk szöveges védelme minden karbantartott leírásra vonatkozzon

- **Azonosító** — R-KAN-164
- **Cím** — A kapuk szöveges védelme minden karbantartott leírásra vonatkozzon
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A kapuk szöveges védelme minden karbantartott leírásra vonatkozzon.
- **Forrás** — kanban-jegyek.txt:1112 · #164 (todo, 2026-11-18)
- **Mi van kész** — A hook-failure.test.mjs:238–250 dokumentumokra is ellenőrzi a szabályt. A teljes szöveg minden utasításmintájának őrzése külön hiány. Kapcsolódó hely: `scripts/qa/hooks/hook-failure.test.mjs:21`; `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kapuk szöveges védelme minden karbantartott leírásra vonatkozzon.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/hook-failure.test.mjs`
- **Következő lépés** — `scripts/qa/hooks/hook-failure.test.mjs` · A szabályszöveg-ellenőrző célpontjai között legyen a teljes runbook és az öt skill mindkét példánya. Szintetikus kifogásolt és megengedett szöveg adjon eltérő ítéletet. Ellenőrzési hely: `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-166 · A fiókkal belépett játékos naptárát valódi böngészőben is ellenőrizzék

- **Azonosító** — R-KAN-166
- **Cím** — A fiókkal belépett játékos naptárát valódi böngészőben is ellenőrizzék
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A fiókkal belépett játékos naptárát valódi böngészőben is ellenőrizzék.
- **Forrás** — kanban-jegyek.txt:1127 · #166 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A fiókkal belépett játékos naptárát valódi böngészőben is ellenőrizzék.
- **Folytatás helye** — `wip/advent-b-egyesites` @ `55a9f8ba`
- **Következő lépés** — A(z) `wip/advent-b-egyesites` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · A B/C ágakat együtt tesztelő konfigurációba kapcsolt szintetikus fiókot tegyél. Belépés, ablaknyitás és újratöltés után is a saját haladás látszódjon. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-034

### R-KAN-167 · A DB-kör nyugodt gépen mért tartaléka legyen ismert

- **Azonosító** — R-KAN-167
- **Cím** — A DB-kör nyugodt gépen mért tartaléka legyen ismert
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A DB-kör nyugodt gépen mért tartaléka legyen ismert.
- **Forrás** — kanban-jegyek.txt:1130 · #167 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/scripts/run-learning-db-tests.ts:111`; `scripts/qa/gates/pre-pr-gate.test.mjs`. A kapcsolódó alapváltozás #514 (b930c0f3).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A DB-kör nyugodt gépen mért tartaléka legyen ismert.
- **Folytatás helye** — `feat/gepi-zar` @ `a707d24d`
- **Következő lépés** — A(z) `feat/gepi-zar` ágon hasonlítsd össze a főággal. `source/scripts/run-learning-db-tests.ts` · Ugyanazzal a tesztlistával külön mérd a terheletlen és terhelt futást. A #152/#173 bontása után a határérték és a lefutott esetek száma is kerüljön a jegyre. Ellenőrzési hely: `scripts/qa/gates/pre-pr-gate.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-168 · A kapu jelezze helyesen a valódi időtúllépést

- **Azonosító** — R-KAN-168
- **Cím** — A kapu jelezze helyesen a valódi időtúllépést
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A kapu jelezze helyesen a valódi időtúllépést.
- **Forrás** — kanban-jegyek.txt:1133 · #168 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/gates/lib.mjs:48`; `scripts/qa/gates/lib.test.mjs`. A kapcsolódó alapváltozás #518 (ce5205dc).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kapu jelezze helyesen a valódi időtúllépést.
- **Folytatás helye** — origin/main · `scripts/qa/gates/lib.mjs`
- **Következő lépés** — `scripts/qa/gates/lib.mjs` · Különböztesd meg a kilépési hibát a határidőtől, és kezeld a gyermekfolyamatokat. Elhúzódó szintetikus folyamatfával vizsgáld a lezárást és a hibaosztályt. Ellenőrzési hely: `scripts/qa/gates/lib.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-169 · A kliensazonosítás csak igazolt közvetítői úton fogadjon továbbított adatot

- **Azonosító** — R-KAN-169
- **Cím** — A kliensazonosítás csak igazolt közvetítői úton fogadjon továbbított adatot
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — biztonság
- **Prioritás-javaslat** — P1. Az érintett jogosultság vagy hozzáférés védelmét befolyásolja.
- **Eredeti utasítás / cél** — A kliensazonosítás csak igazolt közvetítői úton fogadjon továbbított adatot.
- **Forrás** — kanban-jegyek.txt:1138 · #169 (todo, 2026-11-18)
- **Mi van kész** — A közvetítő hitelesített útjához készült változtatás az 1a7352e2 ági commitban van. Kapcsolódó hely: `source/server/lib/client-ip.ts:17`; `source/tests/client-ip.test.ts`.
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `fix/kliens-ip-cloudflare-ut` @ `1416cbf1`
- **Következő lépés** — A(z) `fix/kliens-ip-cloudflare-ut` ágon hasonlítsd össze a főággal. `source/server/lib/client-ip.ts` · A szolgáltatás belépési szerződését és a közvetítő hitelesítését egyeztesd. Szintetikus megbízható és közvetlen kapcsolatra külön tesztelje a forrásválasztást. Ellenőrzési hely: `source/tests/client-ip.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-052

### R-KAN-170 · A vendég adventi haladása kerüljön át párosításkor

- **Azonosító** — R-KAN-170
- **Cím** — A vendég adventi haladása kerüljön át párosításkor
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A vendég adventi haladása kerüljön át párosításkor.
- **Forrás** — kanban-jegyek.txt:1141 · #170 (done, 2026-11-18)
- **Mi van kész** — A vendéghaladás átvételét az ág tárolója és DB-próbája tartalmazza. Az atomi változat 55a9f8ba, a #511 csak az adventi magot integrálta. Kapcsolódó hely: `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`.
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `wip/advent-b-egyesites` @ `55a9f8ba`
- **Következő lépés** — A(z) `wip/advent-b-egyesites` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · A B ág tárolóján próbáld a hiányzó, meglévő és párhuzamos profiladatot. Csak sikeres módosításkor véglegesüljön az átvétel. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-034, P-055

### R-KAN-171 · Az adventi E21 egyezzen a kikapcsolt állapot tényleges válaszával

- **Azonosító** — R-KAN-171
- **Cím** — Az adventi E21 egyezzen a kikapcsolt állapot tényleges válaszával
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az adventi E21 egyezzen a kikapcsolt állapot tényleges válaszával.
- **Forrás** — kanban-jegyek.txt:1149 · #171 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az adventi E21 egyezzen a kikapcsolt állapot tényleges válaszával.
- **Folytatás helye** — `wip/advent-b-egyesites` @ `55a9f8ba`
- **Következő lépés** — A(z) `wip/advent-b-egyesites` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · A B ág tesztjében külön vizsgáld a hiányzó CSRF-igazolást és az érvényes kérésre adott kikapcsolt választ. A tervet e két viselkedéshez igazítsd. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-034

### R-KAN-172 · A 60 napos adventi takarító működjön a bekapcsolás előtt

- **Azonosító** — R-KAN-172
- **Cím** — A 60 napos adventi takarító működjön a bekapcsolás előtt
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A 60 napos adventi takarító működjön a bekapcsolás előtt.
- **Forrás** — kanban-jegyek.txt:1152 · #172 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A 60 napos adventi takarító működjön a bekapcsolás előtt.
- **Folytatás helye** — `wip/advent-b-egyesites` @ `55a9f8ba`
- **Következő lépés** — A(z) `wip/advent-b-egyesites` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · Az S6-ban kösd be a sweep indítását/leállítását. Határnap előtti és utáni rekordra időinjektálással igazold a megőrzést. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-038

### R-KAN-173 · A hosszú DB-kört bontsák két folyamatra

- **Azonosító** — R-KAN-173
- **Cím** — A hosszú DB-kört bontsák két folyamatra
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A hosszú DB-kört bontsák két folyamatra.
- **Forrás** — kanban-jegyek.txt:1155 · #173 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/scripts/run-learning-db-tests.ts:111`; `scripts/qa/gates/pre-pr-gate.test.mjs`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A hosszú DB-kört bontsák két folyamatra.
- **Folytatás helye** — `wip/advent-b-egyesites` @ `55a9f8ba`
- **Következő lépés** — A(z) `wip/advent-b-egyesites` ágon hasonlítsd össze a főággal. `source/scripts/run-learning-db-tests.ts` · A #152/#167 méréséből oszd szét a teszteket. A teljes eredeti lista egyszer fusson, időkeret-emelés nélkül. Ellenőrzési hely: `scripts/qa/gates/pre-pr-gate.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-034

### R-KAN-174 · A kapu minden érintett munkafán ugyanazon célrepót ellenőrizze

- **Azonosító** — R-KAN-174
- **Cím** — A kapu minden érintett munkafán ugyanazon célrepót ellenőrizze
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A kapu minden érintett munkafán ugyanazon célrepót ellenőrizze.
- **Forrás** — kanban-jegyek.txt:1160 · #174 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A kapu minden érintett munkafán ugyanazon célrepót ellenőrizze.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · A célmunkafa feloldását egységesítsd az adapteren. Ártalmatlan ideiglenes repókkal ellenőrizd az egyező és eltérő célkör döntését. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-175 · A kiadást végző integrációk is csatlakozzanak a kapuhoz

- **Azonosító** — R-KAN-175
- **Cím** — A kiadást végző integrációk is csatlakozzanak a kapuhoz
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A kiadást végző integrációk is csatlakozzanak a kapuhoz.
- **Forrás** — kanban-jegyek.txt:1163 · #175 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kiadást végző integrációk is csatlakozzanak a kapuhoz.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · D-13 alapján regisztráld az érintett integrációk művelettípusait. Szintetikus eszközeseménnyel mind ugyanazt az érvényes bizonyítékot kérje. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045, P-057

### R-KAN-176 · Szokatlan szerkezetű eseményre is következetes legyen a kapu döntése

- **Azonosító** — R-KAN-176
- **Cím** — Szokatlan szerkezetű eseményre is következetes legyen a kapu döntése
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Szokatlan szerkezetű eseményre is következetes legyen a kapu döntése.
- **Forrás** — kanban-jegyek.txt:1166 · #176 (todo, 2026-11-18)
- **Mi van kész** — A #506 kezeli a nem objektum adatot. Az összes mezőszintű típushiba szerződése a jegy szerint még nyitott. Kapcsolódó hely: `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Szokatlan szerkezetű eseményre is következetes legyen a kapu döntése.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · Validáld a bemeneti sémát közösen a #158-cal. A parser szerződéspróbája fedje a helyes, hiányos és hibás típusú adatot. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-177 · Az olvasás és dokumentációs művelet ne akadjon fenn a kiadási kapun

- **Azonosító** — R-KAN-177
- **Cím** — Az olvasás és dokumentációs művelet ne akadjon fenn a kiadási kapun
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Az olvasás és dokumentációs művelet ne akadjon fenn a kiadási kapun.
- **Forrás** — kanban-jegyek.txt:1171 · #177 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az olvasás és dokumentációs művelet ne akadjon fenn a kiadási kapun.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · A művelet szemantikája alapján válassz, ártalmatlan olvasási és szöveges esetekből legyen regressziós táblázat mindkét ellenőrnél. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-178 · A kezdő súgó maradjon a joystick mellett olvasható

- **Azonosító** — R-KAN-178
- **Cím** — A kezdő súgó maradjon a joystick mellett olvasható
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A kezdő súgó maradjon a joystick mellett olvasható.
- **Forrás** — kanban-jegyek.txt:1174 · #178 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #467 (6a4f7a48).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A kezdő súgó maradjon a joystick mellett olvasható.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/pages/TsunamiEscapeEnglish.tsx` · Mindkét joystick-oldallal mérd a súgó és a tárcsa metszetét álló nézetben. A szöveg maradjon olvasható 360 px szélességen. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-179 · Nagy esemény feldolgozása is véges idő alatt adjon döntést

- **Azonosító** — R-KAN-179
- **Cím** — Nagy esemény feldolgozása is véges idő alatt adjon döntést
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Nagy esemény feldolgozása is véges idő alatt adjon döntést.
- **Forrás** — kanban-jegyek.txt:1177 · #179 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/hook-failure.test.mjs:21`; `scripts/qa/hooks/settings-hooks.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Nagy esemény feldolgozása is véges idő alatt adjon döntést.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/hook-failure.test.mjs`
- **Következő lépés** — `scripts/qa/hooks/hook-failure.test.mjs` · A három érintett ellenőrön szintetikus, növekvő méretű szöveggel mérd a futási időt. A rövid és hosszú eset ugyanazt a döntést kapja. Ellenőrzési hely: `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045, P-057

### R-KAN-180 · A hibakezelési teszt a futási korlát szerződéséhez kötődjön

- **Azonosító** — R-KAN-180
- **Cím** — A hibakezelési teszt a futási korlát szerződéséhez kötődjön
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A hibakezelési teszt a futási korlát szerződéséhez kötődjön.
- **Forrás** — kanban-jegyek.txt:1180 · #180 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/hook-failure.test.mjs:21`; `scripts/qa/hooks/settings-hooks.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A hibakezelési teszt a futási korlát szerződéséhez kötődjön.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/hook-failure.test.mjs`
- **Következő lépés** — `scripts/qa/hooks/hook-failure.test.mjs` · A konfigurált időkorlátot közös értékből injektáld. A forrás formázásának megváltoztatása mellett ugyanaz legyen a teszt eredménye. Ellenőrzési hely: `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-181 · A projektbeállítások változását is észlelje a szabályőrzés

- **Azonosító** — R-KAN-181
- **Cím** — A projektbeállítások változását is észlelje a szabályőrzés
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A projektbeállítások változását is észlelje a szabályőrzés.
- **Forrás** — kanban-jegyek.txt:1183 · #181 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `.claude/settings.json:12`; `scripts/qa/hooks/settings-hooks.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A projektbeállítások változását is észlelje a szabályőrzés.
- **Folytatás helye** — origin/main · `.claude/settings.json`
- **Következő lépés** — `.claude/settings.json` · A D-13 szerinti konfigurációhoz rendelj beállításváltozási eseményt. Támogatott szerkesztői és integrációs útvonalon is azonos auditnyom keletkezzen. Ellenőrzési hely: `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045, P-057

### R-KAN-182 · A tesztkihagyás-jelző csak tényleges teszthívásra figyelmeztessen

- **Azonosító** — R-KAN-182
- **Cím** — A tesztkihagyás-jelző csak tényleges teszthívásra figyelmeztessen
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A tesztkihagyás-jelző csak tényleges teszthívásra figyelmeztessen.
- **Forrás** — kanban-jegyek.txt:1186 · #182 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/enforce-repo-rules.mjs:148`; `scripts/qa/repo-rules.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A tesztkihagyás-jelző csak tényleges teszthívásra figyelmeztessen.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/enforce-repo-rules.mjs`
- **Következő lépés** — `scripts/qa/hooks/enforce-repo-rules.mjs` · A mintát tokenhatárhoz vagy szintaxishoz kösd. Ártalmatlan folyamatlezárás és valódi kihagyott próba legyen a két kontroll. Ellenőrzési hely: `scripts/qa/repo-rules.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-183 · Az éles hanggyártás előtti nyolc lelet rendezése

- **Azonosító** — R-KAN-183
- **Cím** — Az éles hanggyártás előtti nyolc lelet rendezése
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Az éles hanggyártás előtti nyolc lelet rendezése.
- **Forrás** — kanban-jegyek.txt:1189 · #183 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/shared/voice-rank.ts:6`; `source/tests/voice-rank.test.ts`. A kapcsolódó alapváltozás #516 (b7165a56).
- **Mi hiányzik** — A nyolc ági lelet mindegyikéhez a tényleges belépési ponton igazolt viselkedés; az admin-előnézet párhuzamos életciklusát is beleértve.
- **Folytatás helye** — origin/main · `source/shared/voice-rank.ts`
- **Következő lépés** — A source/server/index.ts és a TTS-korlátozó teljes láncát a source/tests/tts-rate-limits.test.ts-ben hibás kéréssel és azonosított tesztkliensekkel mérd. A source/client/src/lesson-runtime/speech-player.ts háttérbeli hibaítéletét, jegyzék-újrapróbáját és aláírását a source/tests/speech-player.test.ts-ben ellenőrizd. A MaterialImprover.tsx két egyidejű admin-előnézetének lezárását böngészőben próbáld, majd javítsd az S8 mérési táblát.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-032

### R-KAN-184 · A beállítások elsőbbsége és a relatív gyökér azonosan szerepeljen mindenütt

- **Azonosító** — R-KAN-184
- **Cím** — A beállítások elsőbbsége és a relatív gyökér azonosan szerepeljen mindenütt
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A beállítások elsőbbsége és a relatív gyökér azonosan szerepeljen mindenütt.
- **Forrás** — kanban-jegyek.txt:1194 · #184 (todo, 2026-11-19)
- **Mi van kész** — A runbook 210. és 213. sorának gyökérleírása eltér. Az elsőbbségi állítás gépi igazolását a jegy nem tartalmazza. Kapcsolódó hely: `docs/minosegkapuk.md:113`; `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A beállítások elsőbbsége és a relatív gyökér azonosan szerepeljen mindenütt.
- **Folytatás helye** — origin/main · `docs/minosegkapuk.md`
- **Következő lépés** — `docs/minosegkapuk.md` · Egyeztesd a runbook két eltérő gyökérmagyarázatát. Eldobható főkönyvtár és munkafa helyi beállításain próbáld a tényleges elsőbbséget. Ellenőrzési hely: `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-185 · A követett helyi beállítás sorsáról szóló döntés lezárása

- **Azonosító** — R-KAN-185
- **Cím** — A követett helyi beállítás sorsáról szóló döntés lezárása
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A követett helyi beállítás sorsáról szóló döntés lezárása.
- **Forrás** — kanban-jegyek.txt:1199 · #185 (todo, 2026-11-19)
- **Mi van kész** — A 2026-11-19-i D-13 döntött a követés megszüntetéséről és az integrációkról. A helyi beállítás a rögzített main fájljai között továbbra is szerepel. Kapcsolódó hely: `.claude/settings.json:12`; `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Mi hiányzik** — A döntési jegy lezárása; Q-5-ben a követett helyi fájl és az integrációk tényleges rendezése.
- **Folytatás helye** — origin/main · `.claude/settings.json`
- **Következő lépés** — `.claude/settings.json` · A 2026-11-19-i D-13 döntést rendeld a Q-5 megvalósításhoz. Annak elfogadásakor a követett fájlok és az integrációs őrök állapotát külön vizsgáld. Ellenőrzési hely: `scripts/qa/hooks/settings-hooks.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045, P-057

### R-KAN-186 · A lassított eszköz első kérdésének ideje mérhető legyen

- **Azonosító** — R-KAN-186
- **Cím** — A lassított eszköz első kérdésének ideje mérhető legyen
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A lassított eszköz első kérdésének ideje mérhető legyen.
- **Forrás** — kanban-jegyek.txt:1204 · #186 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #483 (a11b1b79).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A lassított eszköz első kérdésének ideje mérhető legyen.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/pages/TsunamiEscapeEnglish.tsx` · A tulajdonos 2026-11-19-én elfogadta az akkori állapotot. Nyugodt gépen azonos jeleneten külön mérd a 100 ms-os kérdés- és 200 ms-os indítási célértéket. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-005

### R-KAN-187 · Az S1 küszöbnél a pontosan tíz százalék értelmezése legyen egységes

- **Azonosító** — R-KAN-187
- **Cím** — Az S1 küszöbnél a pontosan tíz százalék értelmezése legyen egységes
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — Az S1 küszöbnél a pontosan tíz százalék értelmezése legyen egységes.
- **Forrás** — kanban-jegyek.txt:1207 · #187 (todo, 2026-11-19)
- **Mi van kész** — A docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:217 befoglaló határt (≤10%), a 357. sor szigorú határt (<10%) tartalmaz.
- **Mi hiányzik** — Pontosan 10%-nál a két normatív feltétel ellentétes döntést ad.
- **Folytatás helye** — `chore/szkriptkapuk-p2-bizonyitek-lanc` @ `77e69552`
- **Következő lépés** — A(z) `chore/szkriptkapuk-p2-bizonyitek-lanc` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` · A terv két szakaszát és végrehajtási párját igazítsd a befoglaló határhoz. A példatáblában szerepeljen 9, 10 és 11 százalék. Ellenőrzési hely: `scripts/qa/three-phase-check.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-188 · A tűrés szigorítása és lazítása eltérő ítéletet kapjon

- **Azonosító** — R-KAN-188
- **Cím** — A tűrés szigorítása és lazítása eltérő ítéletet kapjon
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A tűrés szigorítása és lazítása eltérő ítéletet kapjon.
- **Forrás** — kanban-jegyek.txt:1210 · #188 (todo, 2026-11-19)
- **Mi van kész** — A főági végrehajtási utasítás docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md:144 szövege az értékváltozást általánosan kezeli.
- **Mi hiányzik** — A szabályból nem állapítható meg egységesen, melyik irány lazít, melyik szigorít és mikor kell kézi felülvizsgálat.
- **Folytatás helye** — `chore/szkriptkapuk-p2-bizonyitek-lanc` @ `77e69552`
- **Következő lépés** — A(z) `chore/szkriptkapuk-p2-bizonyitek-lanc` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` · Az S1.3 és S1.5 szabályt hangold össze. Növelés, csökkentés és bizonytalan irány kapjon három külön tesztet P3a előtt. Ellenőrzési hely: `scripts/qa/three-phase-check.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-189 · A véglegesített kör jelzője fedje a teljes késői fogadási ablakot

- **Azonosító** — R-KAN-189
- **Cím** — A véglegesített kör jelzője fedje a teljes késői fogadási ablakot
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A véglegesített kör jelzője fedje a teljes késői fogadási ablakot.
- **Forrás** — kanban-jegyek.txt:1213 · #189 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A véglegesített kör jelzője fedje a teljes késői fogadási ablakot.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A #510 ágon azonos megőrzési szabályt vezess át a tartós jelzőre. Időinjektálással vizsgáld 24 óra, 2 nap és 7 nap elteltét. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-025

### R-KAN-191 · A belső jelző kulcstere váljon el a fiókkulcsoktól

- **Azonosító** — R-KAN-191
- **Cím** — A belső jelző kulcstere váljon el a fiókkulcsoktól
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A belső jelző kulcstere váljon el a fiókkulcsoktól.
- **Forrás** — kanban-jegyek.txt:1219 · #191 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A belső jelző kulcstere váljon el a fiókkulcsoktól.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A #510 ágban adj diszjunkt névteret. Szintetikus egybeeső bemenetekből két külön tárolókulcsot kérj. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-025

### R-KAN-192 · A kiadási műveletek támogatott alakjai azonos ellenőrzést kapjanak

- **Azonosító** — R-KAN-192
- **Cím** — A kiadási műveletek támogatott alakjai azonos ellenőrzést kapjanak
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A kiadási műveletek támogatott alakjai azonos ellenőrzést kapjanak.
- **Forrás** — kanban-jegyek.txt:1222 · #192 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`; `scripts/qa/hooks/check-audit-ok.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A kiadási műveletek támogatott alakjai azonos ellenőrzést kapjanak.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-audit-ok.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-audit-ok.mjs` · Közös, művelettípusra épülő adaptert vizsgálj a két kapun. Dokumentált legitim műveletek minden támogatott platformon ugyanazt az auditdöntést kapják. Ellenőrzési hely: `scripts/qa/hooks/check-audit-ok.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-193 · Szöveges argumentum ne okozzon téves auditriasztást

- **Azonosító** — R-KAN-193
- **Cím** — Szöveges argumentum ne okozzon téves auditriasztást
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — Szöveges argumentum ne okozzon téves auditriasztást.
- **Forrás** — kanban-jegyek.txt:1227 · #193 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`; `scripts/qa/hooks/check-audit-ok.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Szöveges argumentum ne okozzon téves auditriasztást.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-audit-ok.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-audit-ok.mjs` · Ártalmatlan commitüzenetet és naplólekérdezést használj negatív kontrollként, valódi kiadási esemény legyen a pozitív kontroll. Ellenőrzési hely: `scripts/qa/hooks/check-audit-ok.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-194 · A PowerShell-kezeléshez tartozzon viselkedési próba

- **Azonosító** — R-KAN-194
- **Cím** — A PowerShell-kezeléshez tartozzon viselkedési próba
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A PowerShell-kezeléshez tartozzon viselkedési próba.
- **Forrás** — kanban-jegyek.txt:1230 · #194 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`; `scripts/qa/hooks/check-audit-ok.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A PowerShell-kezeléshez tartozzon viselkedési próba.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-audit-ok.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-audit-ok.mjs` · Szintetikus adaptereseménnyel teszteld az argumentumok és a célművelet értelmezését a támogatott Windows-futtatón. Ellenőrzési hely: `scripts/qa/hooks/check-audit-ok.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-195 · Súgó vagy dokumentáció olvasása ne adjon kiadási riasztást

- **Azonosító** — R-KAN-195
- **Cím** — Súgó vagy dokumentáció olvasása ne adjon kiadási riasztást
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — Súgó vagy dokumentáció olvasása ne adjon kiadási riasztást.
- **Forrás** — kanban-jegyek.txt:1233 · #195 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`; `scripts/qa/hooks/check-audit-ok.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Súgó vagy dokumentáció olvasása ne adjon kiadási riasztást.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-audit-ok.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-audit-ok.mjs` · Az ártalmatlan súgókéréseket különítsd el a végrehajtástól. Mindkét műveletosztályhoz írj döntést ellenőrző tesztet. Ellenőrzési hely: `scripts/qa/hooks/check-audit-ok.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-196 · Lassú modellbetöltés alatt is legyen értelmezhető a pálya

- **Azonosító** — R-KAN-196
- **Cím** — Lassú modellbetöltés alatt is legyen értelmezhető a pálya
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Lassú modellbetöltés alatt is legyen értelmezhető a pálya.
- **Forrás** — kanban-jegyek.txt:1236 · #196 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #467 (6a4f7a48).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Lassú modellbetöltés alatt is legyen értelmezhető a pálya.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/pages/TsunamiEscapeEnglish.tsx` · Készíts ideiglenes díszletet vagy fokozatos cserét. Késleltetett modellbetöltéssel ellenőrizd az első és az átmeneti képkockát. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-197 · A játékos modellje szélső sávban is teljesen látszódjon

- **Azonosító** — R-KAN-197
- **Cím** — A játékos modellje szélső sávban is teljesen látszódjon
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A játékos modellje szélső sávban is teljesen látszódjon.
- **Forrás** — kanban-jegyek.txt:1239 · #197 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #467 (6a4f7a48).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A játékos modellje szélső sávban is teljesen látszódjon.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/pages/TsunamiEscapeEnglish.tsx` · A figura szélességével együtt korlátozd a vízszintes helyzetet. Bal és jobb szélen, álló telefonon mérd a tényleges képkeretet. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-198 · Kérdés nélkül se legyen tartós főszálakadás

- **Azonosító** — R-KAN-198
- **Cím** — Kérdés nélkül se legyen tartós főszálakadás
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Kérdés nélkül se legyen tartós főszálakadás.
- **Forrás** — kanban-jegyek.txt:1242 · #198 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #467 (6a4f7a48).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Kérdés nélkül se legyen tartós főszálakadás.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/pages/TsunamiEscapeEnglish.tsx` · A #186 mérése mellett külön profilozd a 13,8–29,5 másodperces játékszakaszt. A lassú képkockához rendelj konkrét renderelési vagy szimulációs hívót. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-199 · Az adaptív tempó igazodjon a megnyújtott olvasási időhöz

- **Azonosító** — R-KAN-199
- **Cím** — Az adaptív tempó igazodjon a megnyújtott olvasási időhöz
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az adaptív tempó igazodjon a megnyújtott olvasási időhöz.
- **Forrás** — kanban-jegyek.txt:1245 · #199 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/play/flow.ts:32`; `source/tests/game-flow.test.ts`. A kapcsolódó alapváltozás #446 (57bd1b0e).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az adaptív tempó igazodjon a megnyújtott olvasási időhöz.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/game-engine/play/flow.ts` · Azonos reakcióidőn hasonlítsd össze a szimulátor és a lapi meghajtó besorolását. A nehézségi lépést és az olvasási ablak hosszát is mérd. Ellenőrzési hely: `source/tests/game-flow.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-200 · A képgyártás kezelje a becsült és a számlázott ár eltérését

- **Azonosító** — R-KAN-200
- **Cím** — A képgyártás kezelje a becsült és a számlázott ár eltérését
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A képgyártás kezelje a becsült és a számlázott ár eltérését.
- **Forrás** — kanban-jegyek.txt:1248 · #200 (todo, 2026-11-19)
- **Mi van kész** — A #519 költségvédelmet szállított. A tényleges használati ár a hívás után derül ki; a 200-as jegy a tartalék és a hibás hívás elszámolását külön kéri. Kapcsolódó hely: `source/scripts/design-assets/generate.ts:129`; `source/tests/advent-art-pipeline.test.ts`.
- **Mi hiányzik** — A becsült és a tényleges díj különbsége egyetlen hívással is túllépheti a plafont. Nyitott a sikertelenül végződő, mégis számlázott hívás kezelése.
- **Folytatás helye** — origin/main · `source/scripts/design-assets/generate.ts`
- **Következő lépés** — `source/scripts/design-assets/generate.ts` · A következő hívás előtt foglalj tartalékot, hibázó de számlázott válasszal is számolj. Injektált hálózati válaszokkal vizsgáld a plafont. Ellenőrzési hely: `source/tests/advent-art-pipeline.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-037

### R-KAN-201 · A képgyártó valódi útját viselkedési teszt fedje

- **Azonosító** — R-KAN-201
- **Cím** — A képgyártó valódi útját viselkedési teszt fedje
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A képgyártó valódi útját viselkedési teszt fedje.
- **Forrás** — kanban-jegyek.txt:1253 · #201 (todo, 2026-11-19)
- **Mi van kész** — A #519 már ellenőrzi a költségvédelmi elemeket. A jegyben megnevezett integrált futtatóút külön viselkedési próbát igényel. Kapcsolódó hely: `source/scripts/design-assets/generate.ts:129`; `source/tests/advent-art-pipeline.test.ts`.
- **Mi hiányzik** — A tényleges generateOne útvonal költségnaplója és az extra összeg elszámolása nincs injektált hálózati válasszal igazolva.
- **Folytatás helye** — origin/main · `source/scripts/design-assets/generate.ts`
- **Következő lépés** — `source/scripts/design-assets/generate.ts` · Ideiglenes készlet és hamis fetch mellett hívd a valódi futtatót. Ellenőrizd a lezárt költségnaplót és a második folyamat eredményét. Ellenőrzési hely: `source/tests/advent-art-pipeline.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-037

### R-KAN-202 · A referenciafájl és a képválasz formátuma előre legyen ellenőrizve

- **Azonosító** — R-KAN-202
- **Cím** — A referenciafájl és a képválasz formátuma előre legyen ellenőrizve
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A referenciafájl és a képválasz formátuma előre legyen ellenőrizve.
- **Forrás** — kanban-jegyek.txt:1258 · #202 (todo, 2026-11-19)
- **Mi van kész** — A #519 már záron belül újraolvassa a futási tervet. A hiányzó referenciafájl és típus nélküli válasz külön eset. Kapcsolódó hely: `source/scripts/design-assets/generate.ts:129`; `source/tests/advent-art-pipeline.test.ts`.
- **Mi hiányzik** — Hiányzó referencia esetén az első kérés előtti megállás, médiatípus nélküli válasz kezelése és a zárolás/naplóolvasás sorrendjének külön regressziós próbája.
- **Folytatás helye** — origin/main · `source/scripts/design-assets/generate.ts`
- **Következő lépés** — `source/scripts/design-assets/generate.ts` · A #519-ben beépített zárolás mellett a hiányzó referenciafájl állítsa le a hívást. Hiányos típusú válaszra külön hibás fixtúra készüljön. Ellenőrzési hely: `source/tests/advent-art-pipeline.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-037

### R-KAN-203 · Megszakadt képgyártás után helyreállítható legyen a futászár

- **Azonosító** — R-KAN-203
- **Cím** — Megszakadt képgyártás után helyreállítható legyen a futászár
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Megszakadt képgyártás után helyreállítható legyen a futászár.
- **Forrás** — kanban-jegyek.txt:1264 · #203 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/scripts/design-assets/generate.ts:129`; `source/tests/advent-art-pipeline.test.ts`. A kapcsolódó alapváltozás #519 (7176046f).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Megszakadt képgyártás után helyreállítható legyen a futászár.
- **Folytatás helye** — origin/main · `source/scripts/design-assets/generate.ts`
- **Következő lépés** — `source/scripts/design-assets/generate.ts` · A zártulajdonos azonosítása és lezárása legyen atomi. Élő és megszakított szintetikus folyamattal ellenőrizd, hogy egyszerre csak egy gyártó indul. Ellenőrzési hely: `source/tests/advent-art-pipeline.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-037

### R-KAN-204 · A Vihargarázs érintéses próbája ne foglalja le a teljes böngészőkeretet

- **Azonosító** — R-KAN-204
- **Cím** — A Vihargarázs érintéses próbája ne foglalja le a teljes böngészőkeretet
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A Vihargarázs érintéses próbája ne foglalja le a teljes böngészőkeretet.
- **Forrás** — kanban-jegyek.txt:1267 · #204 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/tests/game-meta-quality.spec.ts:90`; `source/tests/game-meta-quality.spec.ts`. A kapcsolódó alapváltozás #514 (b930c0f3).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A Vihargarázs érintéses próbája ne foglalja le a teljes böngészőkeretet.
- **Folytatás helye** — origin/main · `source/tests/game-meta-quality.spec.ts`
- **Következő lépés** — `source/tests/game-meta-quality.spec.ts` · A keskeny fekvő esetben adj véges határidőt a gesztus és megfigyelés ciklusának. Elérhetetlen cél esetén a konkrét állapottal álljon meg. Ellenőrzési hely: `source/tests/game-meta-quality.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-205 · A terhelt gép időmérése különüljön el a szóbank invariánsától

- **Azonosító** — R-KAN-205
- **Cím** — A terhelt gép időmérése különüljön el a szóbank invariánsától
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A terhelt gép időmérése különüljön el a szóbank invariánsától.
- **Forrás** — kanban-jegyek.txt:1270 · #205 (todo, 2026-11-19)
- **Mi van kész** — A főági teszt falióra-korlátot használ a 227. sorban. Az ági 045a25bd dokumentálja a 60 s CPU és 150 s falióra döntést; a teljes merge-próba célideje külön mérés. Kapcsolódó hely: `source/tests/vocab-distractor-overlap.test.ts:227`; `source/tests/vocab-distractor-overlap.test.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A terhelt gép időmérése különüljön el a szóbank invariánsától.
- **Folytatás helye** — `fix/idozitesfuggo-tesztek` @ `29913579`
- **Következő lépés** — A(z) `fix/idozitesfuggo-tesztek` ágon hasonlítsd össze a főággal. `source/tests/vocab-distractor-overlap.test.ts` · A fix/idozitesfuggo-tesztek ág CPU- és falióramérését egyeztesd a teljes összefésült próba futási idejével. A tartalmi invariánst minden méretnél vizsgáld. Ellenőrzési hely: `source/tests/vocab-distractor-overlap.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-206 · A bank- és streamteszt ütemezése legyen determinisztikus

- **Azonosító** — R-KAN-206
- **Cím** — A bank- és streamteszt ütemezése legyen determinisztikus
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A bank- és streamteszt ütemezése legyen determinisztikus.
- **Forrás** — kanban-jegyek.txt:1273 · #206 (todo, 2026-11-19)
- **Mi van kész** — A főági párhuzamossági próba rövid valós időzítőt használ. Az ági 29913579 már vezérelt órás ellenpróbát tartalmaz. Kapcsolódó hely: `source/tests/parallel-bank.test.ts:38`; `source/tests/claude-stream-thinking-liveness.test.ts`.
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `fix/idozitesfuggo-tesztek` @ `29913579`
- **Következő lépés** — A(z) `fix/idozitesfuggo-tesztek` ágon hasonlítsd össze a főággal. `source/tests/parallel-bank.test.ts` · A 29913579 ági fej vezérelt órájával próbáld a felcserélt befejezési sorrendeket és a gondolkodás alatti életjelet. Terhelt futó se változtassa meg a logikai eredményt. Ellenőrzési hely: `source/tests/claude-stream-thinking-liveness.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-207 · A levélen a fogadás budapesti ideje szerepeljen

- **Azonosító** — R-KAN-207
- **Cím** — A levélen a fogadás budapesti ideje szerepeljen
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A levélen a fogadás budapesti ideje szerepeljen.
- **Forrás** — kanban-jegyek.txt:1278 · #207 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A levélen a fogadás budapesti ideje szerepeljen.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A fogadáskor rögzített időt vidd végig a #510 küldési és újrapróbálási útján. Budapesti éjfél két oldalán azonos időbélyeget várj ugyanarra a beküldésre. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-025

### R-KAN-208 · Az utóellenőrzés három eltérésének rendezése

- **Azonosító** — R-KAN-208
- **Cím** — Az utóellenőrzés három eltérésének rendezése
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Az utóellenőrzés három eltérésének rendezése.
- **Forrás** — kanban-jegyek.txt:1281 · #208 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-audit-ok.mjs:34`; `scripts/qa/hooks/check-audit-ok.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Három külön döntési eset maradt: olvasási célú keresés téves tiltása, eltérő munkakönyvtár kiválasztása és a támogatott héjak tördelésének egységes értelmezése.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-audit-ok.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-audit-ok.mjs` · Az audit és a kapu célmunkafáját azonos adatból képezd. Ártalmatlan lekérdezésekhez és címzett műveletekhez külön döntéspróbát adj, mindkét héjon. Ellenőrzési hely: `scripts/qa/hooks/check-audit-ok.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-209 · A módosított aláírás minden próbában valóban eltérjen

- **Azonosító** — R-KAN-209
- **Cím** — A módosított aláírás minden próbában valóban eltérjen
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A módosított aláírás minden próbában valóban eltérjen.
- **Forrás** — kanban-jegyek.txt:1284 · #209 (todo, 2026-11-19)
- **Mi van kész** — A 45. sor állandó végződésre cserél. Egyező eredeti végződésnél a teszt érvényes bemenet elutasítását várná. Kapcsolódó hely: `source/tests/rt-ticket.test.ts:45`; `source/tests/rt-ticket.test.ts`.
- **Mi hiányzik** — Garantáltan megváltozó tesztbemenet minden eredeti aláírásvégződésnél.
- **Folytatás helye** — origin/main · `source/tests/rt-ticket.test.ts`
- **Következő lépés** — `source/tests/rt-ticket.test.ts` · A kiválasztott karaktert garantáltan különbözőre állítsd. Szintetikus eredeti végződések teljes készletén igazold az eltérést még az ellenőrző meghívása előtt. Ellenőrzési hely: `source/tests/rt-ticket.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-190 · A véglegesítés és a jelzőírás hibája után se menjen téves levél

- **Azonosító** — R-KAN-190
- **Cím** — A véglegesítés és a jelzőírás hibája után se menjen téves levél
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A véglegesítés és a jelzőírás hibája után se menjen téves levél.
- **Forrás** — kanban-jegyek.txt:1216 · #190 (todo, 2026-11-19)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A véglegesítés és a jelzőírás hibája után se menjen téves levél.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A #510 tárolóban tranzakció vagy korlátos újrapróba fedje a jelzőt. Íráshiba után újraindítva is csak a helyes végső állapot küldhessen. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-025

### R-KAN-125 · A PR célrepóját minden támogatott címformánál azonosan ismerje fel a kapu

- **Azonosító** — R-KAN-125
- **Cím** — A PR célrepóját minden támogatott címformánál azonosan ismerje fel a kapu
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A PR célrepóját minden támogatott címformánál azonosan ismerje fel a kapu.
- **Forrás** — kanban-jegyek.txt:940 · #125 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A PR célrepóját minden támogatott címformánál azonosan ismerje fel a kapu.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · Kanonizáld a célrepó hivatkozását. Az engedélyezett címformák és az ismeretlen cél külön várt eredményt kapjanak a kapu egységtesztjében. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-127 · A korábbi eredménylevél-hibák strukturáltan naplózódjanak

- **Azonosító** — R-KAN-127
- **Cím** — A korábbi eredménylevél-hibák strukturáltan naplózódjanak
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A korábbi eredménylevél-hibák strukturáltan naplózódjanak.
- **Forrás** — kanban-jegyek.txt:946 · #127 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A korábbi eredménylevél-hibák strukturáltan naplózódjanak.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · Kösd az egységes hibaosztályt a levélküldés és a próbálkozáskezelő három jelzett hibájához. Hibázó tárolóval csak kategória, érzékeny érték nélkül kerüljön a naplóba. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-025

### R-KAN-128 · Bizonytalan kézbesítés után is legyen helyreállítható a foglalás

- **Azonosító** — R-KAN-128
- **Cím** — Bizonytalan kézbesítés után is legyen helyreállítható a foglalás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Bizonytalan kézbesítés után is legyen helyreállítható a foglalás.
- **Forrás** — kanban-jegyek.txt:949 · #128 (todo, 2026-11-17)
- **Mi van kész** — A #495 szolgáltatói kulcsot és három felszabadítási kísérletet vezetett be (source/server/lesson-result-email.ts:49,67). A három kudarc utáni helyreállás külön eset. Kapcsolódó hely: `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`.
- **Mi hiányzik** — Tartós helyreállás, ha az összes felszabadítási kísérlet sikertelen.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · Modellezd az elfogadott küldést elveszett válasszal és három sikertelen felszabadítással. Tartós állapotból ugyanazzal az idempotenciakulccsal térjen magához. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-025

### R-KAN-129 · A hosszú kérdés mellett is maradjon látható a futó

- **Azonosító** — R-KAN-129
- **Cím** — A hosszú kérdés mellett is maradjon látható a futó
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A hosszú kérdés mellett is maradjon látható a futó.
- **Forrás** — kanban-jegyek.txt:955 · #129 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #483 (a11b1b79).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A hosszú kérdés mellett is maradjon látható a futó.
- **Folytatás helye** — `fix/szokoar-tema-es-sebesseg` @ `e1332ec7`
- **Következő lépés** — A(z) `fix/szokoar-tema-es-sebesseg` ágon hasonlítsd össze a főággal. `source/client/src/pages/TsunamiEscapeEnglish.tsx` · 360×640 méretben adj négysoros kérdést és kétsoros harmadik választ. Kérdező állapotban mérd a tényleges képernyőtéglalapok metszetét. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-005

### R-KAN-130 · Az egycsoportos rubrika ne adjon részpontot tartalmatlan válaszra

- **Azonosító** — R-KAN-130
- **Cím** — Az egycsoportos rubrika ne adjon részpontot tartalmatlan válaszra
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Az egycsoportos rubrika ne adjon részpontot tartalmatlan válaszra.
- **Forrás** — kanban-jegyek.txt:958 · #130 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/shared/answer-value.ts:15`; `source/tests/open-answer-short.test.ts`. A kapcsolódó alapváltozás #493 (56d1a9af).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az egycsoportos rubrika ne adjon részpontot tartalmatlan válaszra.
- **Folytatás helye** — origin/main · `source/shared/answer-value.ts`
- **Következő lépés** — `source/shared/answer-value.ts` · Válaszd külön az igen/nem/szám válaszokat a rövid érdemi felelettől. Pozitív, tagadó és kitérő válaszra készíts pontozási táblát. Ellenőrzési hely: `source/tests/open-answer-short.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-027

### R-KAN-131 · A generáló utasítása és a rövidválasz-pontozó ugyanazt a szabályt kövesse

- **Azonosító** — R-KAN-131
- **Cím** — A generáló utasítása és a rövidválasz-pontozó ugyanazt a szabályt kövesse
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A generáló utasítása és a rövidválasz-pontozó ugyanazt a szabályt kövesse.
- **Forrás** — kanban-jegyek.txt:961 · #131 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/shared/answer-value.ts:15`; `source/tests/open-answer-short.test.ts`. A kapcsolódó alapváltozás #509 (a1342ba8).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A generáló utasítása és a rövidválasz-pontozó ugyanazt a szabályt kövesse.
- **Folytatás helye** — origin/main · `source/shared/answer-value.ts`
- **Következő lépés** — `source/shared/answer-value.ts` · Az új promptverzióhoz készíts rövid teljes, rövid részleges és irreleváns referenciaválaszt. A prompt kiadása előtt igazold a gépi és a dokumentált pont egyezését. Ellenőrzési hely: `source/tests/open-answer-short.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-031

### R-KAN-132 · A kérdés visszamásolása ne érjen rubrikapontot

- **Azonosító** — R-KAN-132
- **Cím** — A kérdés visszamásolása ne érjen rubrikapontot
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A kérdés visszamásolása ne érjen rubrikapontot.
- **Forrás** — kanban-jegyek.txt:964 · #132 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/shared/answer-value.ts:15`; `source/tests/open-answer-short.test.ts`. A kapcsolódó alapváltozás #493 (56d1a9af).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kérdés visszamásolása ne érjen rubrikapontot.
- **Folytatás helye** — origin/main · `source/shared/answer-value.ts`
- **Következő lépés** — `source/shared/answer-value.ts` · Ugyanazon kérdéshez hasonlítsd össze a puszta ismétlést és az érdemi rövid választ. Csak a feladatra válaszoló tartalomért járjon pont. Ellenőrzési hely: `source/tests/open-answer-short.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-027

### R-KAN-134 · Az adaptív nehézség a tényleges olvasási ablakkal számoljon

- **Azonosító** — R-KAN-134
- **Cím** — Az adaptív nehézség a tényleges olvasási ablakkal számoljon
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Az adaptív nehézség a tényleges olvasási ablakkal számoljon.
- **Forrás** — kanban-jegyek.txt:975 · #134 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/play/flow.ts:32`; `source/tests/game-flow.test.ts`. A kapcsolódó alapváltozás #446 (57bd1b0e).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az adaptív nehézség a tényleges olvasási ablakkal számoljon.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/play/flow.ts`
- **Következő lépés** — `source/client/src/game-engine/play/flow.ts` · Azonos reakcióidővel hasonlítsd össze a nyers és hosszabbított ablakot a Brain Rot és Szólétra meghajtójában. Az intenzitás mindkettőnél a dokumentált alapot kövesse. Ellenőrzési hely: `source/tests/game-flow.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-135 · A félbehagyott kör túlélje a folyamatváltást

- **Azonosító** — R-KAN-135
- **Cím** — A félbehagyott kör túlélje a folyamatváltást
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A félbehagyott kör túlélje a folyamatváltást.
- **Forrás** — kanban-jegyek.txt:978 · #135 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A félbehagyott kör túlélje a folyamatváltást.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A #510 ágon a várakozó és végleges küldést két külön példányon modellezd. Újraindítás után is azonosítsd a már véglegesített kört. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-024

### R-KAN-136 · Nyolc kérdésnél is tartsa a visszatérés felső korlátját

- **Azonosító** — R-KAN-136
- **Cím** — Nyolc kérdésnél is tartsa a visszatérés felső korlátját
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Nyolc kérdésnél is tartsa a visszatérés felső korlátját.
- **Forrás** — kanban-jegyek.txt:981 · #136 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/useCouponSession.ts:26`; `source/tests/game-question-director.test.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Nyolc kérdésnél is tartsa a visszatérés felső korlátját.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/useCouponSession.ts`
- **Következő lépés** — `source/client/src/game-engine/useCouponSession.ts` · A legkésőbbi visszatérést mérd a hibázás pillanatától. Nyolc tétel, ismételt hiba és legalább a jegyben használt 80 mag kerüljön a határtesztbe. Ellenőrzési hely: `source/tests/game-question-director.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-010

### R-KAN-137 · Hálózatváltás után is összetartozzon a kvíz és a végleges eredmény

- **Azonosító** — R-KAN-137
- **Cím** — Hálózatváltás után is összetartozzon a kvíz és a végleges eredmény
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Hálózatváltás után is összetartozzon a kvíz és a végleges eredmény.
- **Forrás** — kanban-jegyek.txt:984 · #137 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Hálózatváltás után is összetartozzon a kvíz és a végleges eredmény.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A #510 ágon egy kör két külön hálózati lenyomatával gyakorold a részleges és végleges út sorrendjét. A levelek tartalmát és darabszámát is ellenőrizd. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-024

### R-KAN-138 · A megosztott hálózaton érvényes küldési keret döntésének lezárása

- **Azonosító** — R-KAN-138
- **Cím** — A megosztott hálózaton érvényes küldési keret döntésének lezárása
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A megosztott hálózaton érvényes küldési keret döntésének lezárása.
- **Forrás** — kanban-jegyek.txt:987 · #138 (todo, 2026-11-18)
- **Mi van kész** — A 2026-11-18-i döntés tanulónkénti keretet kér. A megvalósítás saját jegye #139. Kapcsolódó hely: `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`.
- **Mi hiányzik** — A döntési jegy átvezetése, a szállítás a #139 jegyhez tartozik.
- **Folytatás helye** — origin/main · `source/server/lesson-result-email.ts`
- **Következő lépés** — `source/server/lesson-result-email.ts` · A 2026-11-18-i tanulónkénti döntést vezesd át, és a megvalósítást a #139 jegyen kövesd. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-024

### R-KAN-139 · A küldési keret tanulónként számoljon

- **Azonosító** — R-KAN-139
- **Cím** — A küldési keret tanulónként számoljon
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A küldési keret tanulónként számoljon.
- **Forrás** — kanban-jegyek.txt:992 · #139 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`. A kapcsolódó alapváltozás #495 (3ff4d173).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A küldési keret tanulónként számoljon.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · Ugyanazon NAT mögött két mesterséges diák külön keretet kapjon. Névtelen esetben teszteld az IP-tartalékot is. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-024

### R-KAN-141 · A kuponos ismétlés tesztsegédjének hatóköre legyen egyértelmű

- **Azonosító** — R-KAN-141
- **Cím** — A kuponos ismétlés tesztsegédjének hatóköre legyen egyértelmű
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A kuponos ismétlés tesztsegédjének hatóköre legyen egyértelmű.
- **Forrás** — kanban-jegyek.txt:1003 · #141 (todo, 2026-11-18)
- **Mi van kész** — A kuponos módot a befoglaló tesztcsoport neve megadja a source/tests/brainrot-sim.test.ts:177 helyen. A segéd saját megjegyzése a 181. sorban ezt nem mondja ki.
- **Mi hiányzik** — A segéd közvetlen megjegyzéséből hiányzik, hogy az ismétlés felső határa csak kuponos körben releváns.
- **Folytatás helye** — origin/main · source/tests/brainrot-sim.test.ts:181
- **Következő lépés** — A source/tests/brainrot-sim.test.ts:181 segédkommentjében nevezd meg a kuponos módot, majd olvasd össze a segéd használatát a 177. sor tesztcsoportjával.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-008

### R-KAN-142 · Az osztálykereső kezelje a képzős számnevet és az üres szűrést

- **Azonosító** — R-KAN-142
- **Cím** — Az osztálykereső kezelje a képzős számnevet és az üres szűrést
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Az osztálykereső kezelje a képzős számnevet és az üres szűrést.
- **Forrás** — kanban-jegyek.txt:1006 · #142 (todo, 2026-11-18)
- **Mi van kész** — A #494 (a7b3b787) megvalósította az osztályjelölés kereshetőségét. A szűrés és az átlépés jelenlegi kiindulópontja source/shared/material-title.ts:149 és :252.
- **Mi hiányzik** — A képzős „10-es” átlépése csak üres szűrt találatnál történjen, az „5-6. osztály” tartományt kezelje felsorolásként, a szóköz önmagában ne kapcsoljon össze két számot.
- **Folytatás helye** — origin/main · source/shared/material-title.ts:149
- **Következő lépés** — A source/shared/material-title.ts osztályértelmezőjét és visszaesési szűrését javítsd. A source/tests/material-title.test.ts külön tesztelje a három alakot, a source/tests/material-title.spec.ts pedig a megjelenő találatokat.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-026

### R-KAN-143 · A valódi érintéses bánya-próba első futásra is stabil legyen

- **Azonosító** — R-KAN-143
- **Cím** — A valódi érintéses bánya-próba első futásra is stabil legyen
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A valódi érintéses bánya-próba első futásra is stabil legyen.
- **Forrás** — kanban-jegyek.txt:1009 · #143 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/BlockCraftQuiz.tsx:82`; `source/tests/block-craft-real-touch.spec.ts`. A kapcsolódó alapváltozás #514 (b930c0f3).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A valódi érintéses bánya-próba első futásra is stabil legyen.
- **Folytatás helye** — origin/main · `source/client/src/pages/BlockCraftQuiz.tsx`
- **Következő lépés** — `source/client/src/pages/BlockCraftQuiz.tsx` · Az érintés utáni megfigyelhető játékállapotot várd a fix késletetés helyett. Hideg indulás és lassított bemenet mellett ismételd. Ellenőrzési hely: `source/tests/block-craft-real-touch.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-144 · A háromfázisú ellenőrzés ismerje fel a squasholt előzményt

- **Azonosító** — R-KAN-144
- **Cím** — A háromfázisú ellenőrzés ismerje fel a squasholt előzményt
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A háromfázisú ellenőrzés ismerje fel a squasholt előzményt.
- **Forrás** — kanban-jegyek.txt:1012 · #144 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/three-phase-check.mjs:61`; `scripts/qa/three-phase-check.test.mjs`. A kapcsolódó alapváltozás #518 (ce5205dc).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A háromfázisú ellenőrzés ismerje fel a squasholt előzményt.
- **Folytatás helye** — `fix/kapu-gyorsitas` @ `037691a2`
- **Következő lépés** — A(z) `fix/kapu-gyorsitas` ágon hasonlítsd össze a főággal. `scripts/qa/three-phase-check.mjs` · Eldobható repóban squasholt alapra építs követő ágat. A régi azonos változást fogadja el, új kód elé változatlanul követelje a tervet. Ellenőrzési hely: `scripts/qa/three-phase-check.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-145 · A futó alkalmazásban determinisztikus őrök felügyeljék az AI-lépéseket

- **Azonosító** — R-KAN-145
- **Cím** — A futó alkalmazásban determinisztikus őrök felügyeljék az AI-lépéseket
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A futó alkalmazásban determinisztikus őrök felügyeljék az AI-lépéseket.
- **Forrás** — kanban-jegyek.txt:1015 · #145 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:1`; `scripts/qa/three-phase-check.test.mjs`. A kapcsolódó alapváltozás #515 (f756588c).
- **Mi hiányzik** — Igazolandó a J3 tartós kézbesítési hiba és panasz, J4 telepítés utáni próba, J5 borító-újrapróba tartóssága, J6 költségplafon, J7 éles írás védelme, J8 böngészőpróba, J9 indoklásszűrés és J10 éjszakai invariánsvizsgálat. A tulajdonos J1-nél csak riasztást kért, J2 vészleállítót elvetette.
- **Folytatás helye** — origin/main · `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md`
- **Következő lépés** — `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` · Az eredeti J3–J10 sorrendjében készíts bemenet–kimenet szerződést. A kézbesítési eseményt szintetikus szolgáltatói eseménnyel, a generálási őrt hibás modellválasszal ellenőrizd. Ellenőrzési hely: `scripts/qa/three-phase-check.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-029, P-054

### R-KAN-146 · A teljes gyártás minőségi terve fusson végig

- **Azonosító** — R-KAN-146
- **Cím** — A teljes gyártás minőségi terve fusson végig
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A teljes gyártás minőségi terve fusson végig.
- **Forrás** — kanban-jegyek.txt:1018 · #146 (in_progress, 2026-11-18)
- **Mi van kész** — A #515 és #516 a vizuális alapot és a hangláncot integrálta. A korábbi P-030 után S5a–SK2 ági kód is készült (e1eb06ad, ce6db8a3), a főágon a teljes változatossági lánc hiányzik. Kapcsolódó hely: `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md:220`; `source/tests/source-coverage-gate.test.ts`.
- **Mi hiányzik** — S2b–S3b, számolás és változatosság integrálása, S8c éles hanggyártás, S9/S10 mérés és SK őrök.
- **Folytatás helye** — `feat/tgm-sk2-valtozatossag-kapu` @ `ba3d431c`
- **Következő lépés** — A(z) `feat/tgm-sk2-valtozatossag-kapu` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` · A #515 és #516 után illeszd be a még ágon élő S2b–S3a és S5–SK2 részeket. A végső mérésben egy teljes lecke forrásfedettségét, ábra-, nyitás- és feladatváltozatosságát hasonlítsd az alaphoz. Ellenőrzési hely: `source/tests/source-coverage-gate.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-028, P-029, P-030, P-031, P-033

### R-KAN-148 · A tiszta időzítést válaszd szét a böngésző tárolójától

- **Azonosító** — R-KAN-148
- **Cím** — A tiszta időzítést válaszd szét a böngésző tárolójától
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — A tiszta időzítést válaszd szét a böngésző tárolójától.
- **Forrás** — kanban-jegyek.txt:1040 · #148 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/client/src/lib/wordLadder/pacing.ts:221`; `source/tests/word-ladder-pacing.test.ts`. A kapcsolódó alapváltozás #498 (e0dba1db).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A tiszta időzítést válaszd szét a böngésző tárolójától.
- **Folytatás helye** — origin/main · `source/client/src/lib/wordLadder/pacing.ts`
- **Következő lépés** — `source/client/src/lib/wordLadder/pacing.ts` · A pacing függvényekből különítsd el a beállítás mentését. A tiszta rész tároló nélkül is fusson, az adapter olvasási hibánál adjon dokumentált alapértéket. Ellenőrzési hely: `source/tests/word-ladder-pacing.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-012

### R-KAN-149 · Új és törölt anyag változtassa az évfolyambank lenyomatát

- **Azonosító** — R-KAN-149
- **Cím** — Új és törölt anyag változtassa az évfolyambank lenyomatát
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Új és törölt anyag változtassa az évfolyambank lenyomatát.
- **Forrás** — kanban-jegyek.txt:1043 · #149 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `source/server/lib/quiz-bank-classroom.ts:7`; `source/tests/quiz-bank-s1.test.ts`. A kapcsolódó alapváltozás #478 (76cf426a).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Új és törölt anyag változtassa az évfolyambank lenyomatát.
- **Folytatás helye** — origin/main · `source/server/lib/quiz-bank-classroom.ts`
- **Következő lépés** — `source/server/lib/quiz-bank-classroom.ts` · Azonos évfolyamhoz hozz létre, módosíts és törölj szintetikus anyagot. Az ETag mindhárom változásnál frissüljön, más évfolyam esetén maradjon stabil. Ellenőrzési hely: `source/tests/quiz-bank-s1.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-009

### R-KAN-150 · A teljes hanglánc és a tananyagminta egyezzen a jóváhagyott sorrenddel

- **Azonosító** — R-KAN-150
- **Cím** — A teljes hanglánc és a tananyagminta egyezzen a jóváhagyott sorrenddel
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A teljes hanglánc és a tananyagminta egyezzen a jóváhagyott sorrenddel.
- **Forrás** — kanban-jegyek.txt:1046 · #150 (todo, 2026-11-18)
- **Mi van kész** — A #516 rangsorolója és előtöltése bent van. A tábla K5/K6 mintakód- és verzióegyezést hagy nyitva. Kapcsolódó hely: `source/shared/voice-rank.ts:6`; `source/tests/voice-rank.test.ts`.
- **Mi hiányzik** — K5 mintakód- és K6 specifikációverzió-egyezés.
- **Folytatás helye** — origin/main · `source/shared/voice-rank.ts`
- **Következő lépés** — `source/shared/voice-rank.ts` · A #516-tal kezelt K1–K4 és K7 mellett ellenőrizd a K5 mintakódot és a K6 kapcsolót. Meghibásodó első hanggal bizonyítsd a második helyi jelölt, majd a szerverhang sorrendjét. Ellenőrzési hely: `source/tests/voice-rank.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-032

### R-KAN-151 · A hét koszorús kérdés külön tudást mérjen

- **Azonosító** — R-KAN-151
- **Cím** — A hét koszorús kérdés külön tudást mérjen
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A hét koszorús kérdés külön tudást mérjen.
- **Forrás** — kanban-jegyek.txt:1052 · #151 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — Hét koszorús kérdés átfedését kell feloldani. Az xmas-065 válasza ne legyen leolvasható az xmas-007-ből.
- **Folytatás helye** — origin/main · `docs/specs/2026-11-18-adventi-naptar.md`
- **Következő lépés** — `docs/specs/2026-11-18-adventi-naptar.md` · Vesd össze az xmas-065 és xmas-007 mellett az öt további koszorús tétel válaszait. Vak megoldó csak az adott feladat állításából tudjon választani. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-039

### R-KAN-152 · A DB-próba a gépterhelés változása mellett is beleférjen az időbe

- **Azonosító** — R-KAN-152
- **Cím** — A DB-próba a gépterhelés változása mellett is beleférjen az időbe
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A DB-próba a gépterhelés változása mellett is beleférjen az időbe.
- **Forrás** — kanban-jegyek.txt:1055 · #152 (todo, 2026-11-18)
- **Mi van kész** — A jegy későbbi mérésében a nyugodt futás 190,8 s volt. A 480 s-os keret a futtatóban szerepel; más gépen a #173 jóval kisebb tartalékot jegyez. Kapcsolódó hely: `source/scripts/run-learning-db-tests.ts:111`; `scripts/qa/gates/pre-pr-gate.test.mjs`.
- **Mi hiányzik** — Az egész próbakör eredeti eseteit megőrző folyamatbontás.
- **Folytatás helye** — origin/main · `source/scripts/run-learning-db-tests.ts`
- **Következő lépés** — `source/scripts/run-learning-db-tests.ts` · Mérd csoportonként a futást, majd izoláld a lassú csoportot. A két folyamat összes tesztjének halmaza legyen azonos az eredetivel. Ellenőrzési hely: `scripts/qa/gates/pre-pr-gate.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-034

### R-KAN-153 · Az elsős felolvasva is megkaphassa az adventi kérdést

- **Azonosító** — R-KAN-153
- **Cím** — Az elsős felolvasva is megkaphassa az adventi kérdést
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az elsős felolvasva is megkaphassa az adventi kérdést.
- **Forrás** — kanban-jegyek.txt:1062 · #153 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az elsős felolvasva is megkaphassa az adventi kérdést.
- **Folytatás helye** — `wip/advent-c-javitas` @ `1c667e26`
- **Következő lépés** — A(z) `wip/advent-c-javitas` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · A naptároldalon adj felolvasási vezérlést, megszakítással. Elsős módban próbáld hang nélküli eszközön és kész hanggal is. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-039

### R-KAN-154 · A kiválasztott adventi képek kerüljenek a végleges készletbe

- **Azonosító** — R-KAN-154
- **Cím** — A kiválasztott adventi képek kerüljenek a végleges készletbe
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A kiválasztott adventi képek kerüljenek a végleges készletbe.
- **Forrás** — kanban-jegyek.txt:1065 · #154 (todo, 2026-11-18)
- **Mi van kész** — A #519 megadja a költségvédett előkészítést, az ági b198047c jóváhagyó szkriptet készít elő. A végső tulajdonosi képválasztás külön bizonyíték. Kapcsolódó hely: `source/scripts/design-assets/generate.ts:129`; `source/tests/advent-art-pipeline.test.ts`.
- **Mi hiányzik** — A tulajdonosi válogatás eredménye, a jóváhagyott art-manifest, a kiszolgált képek egyezése és a bájtkeret igazolása.
- **Folytatás helye** — `feat/advent-s3c-kepek` @ `28949f20`
- **Következő lépés** — A(z) `feat/advent-s3c-kepek` ágon hasonlítsd össze a főággal. `source/scripts/design-assets/generate.ts` · Csak a tulajdonosi képválasztás után készíts végleges manifestet. A kiválasztott és kiszolgált fájlok, képméretek és bájtkeretek egyezését ellenőrizd. Ellenőrzési hely: `source/tests/advent-art-pipeline.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-036, P-056

### R-KAN-155 · Az adventi szülői levél, admin előnézet, takarítás és értesítés teljesüljön

- **Azonosító** — R-KAN-155
- **Cím** — Az adventi szülői levél, admin előnézet, takarítás és értesítés teljesüljön
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Az adventi szülői levél, admin előnézet, takarítás és értesítés teljesüljön.
- **Forrás** — kanban-jegyek.txt:1068 · #155 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — S5: családonként/évadonként egyszeri szülői levél. S6: admin előnézet, takarító és a flag bevezetése. S8: értesítési száraz futás és jóváhagyás.
- **Folytatás helye** — origin/main · `docs/specs/2026-11-18-adventi-naptar.md`
- **Következő lépés** — `docs/specs/2026-11-18-adventi-naptar.md` · Az S5/S6/S8 útvonalakat szezononkénti idempotenciával próbáld. Száraz futásban kapjon előnézetet az admin, és csak jóváhagyással induljon a valódi küldés. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-038, P-056

### R-KAN-156 · Az adventi ágak a megfelelő főágon és migrációs számmal folytatódjanak

- **Azonosító** — R-KAN-156
- **Cím** — Az adventi ágak a megfelelő főágon és migrációs számmal folytatódjanak
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — advent
- **Prioritás-javaslat** — P3. Karbantartási vagy mérési pontosítás.
- **Eredeti utasítás / cél** — Az adventi ágak a megfelelő főágon és migrációs számmal folytatódjanak.
- **Forrás** — kanban-jegyek.txt:1071 · #156 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `docs/specs/2026-11-18-adventi-naptar.md:416`; `source/tests/advent-christmas-bank.test.ts`. A kapcsolódó alapváltozás #511 (dc76ba52).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: Az adventi ágak a megfelelő főágon és migrációs számmal folytatódjanak.
- **Folytatás helye** — `wip/advent-b-egyesites` @ `55a9f8ba`
- **Következő lépés** — A(z) `wip/advent-b-egyesites` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-18-adventi-naptar.md` · A B és C ág beolvasztási alapját és migrációjegyzékét vesd össze. Üres és korábban migrált eldobható adatbázis legyen az elfogadás. Ellenőrzési hely: `source/tests/advent-christmas-bank.test.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-034

### R-KAN-158 · Hibás típussal érkező eseménynél is legyen explicit döntés

- **Azonosító** — R-KAN-158
- **Cím** — Hibás típussal érkező eseménynél is legyen explicit döntés
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Hibás típussal érkező eseménynél is legyen explicit döntés.
- **Forrás** — kanban-jegyek.txt:1086 · #158 (todo, 2026-11-18)
- **Mi van kész** — A főági kiindulópont `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`. A kapcsolódó alapváltozás #499 (49a849ef).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Hibás típussal érkező eseménynél is legyen explicit döntés.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · Típusellenőrzés után adj strukturált hibát. Minden nem szöveg parancsmezőre a dokumentált biztonságos döntést ellenőrizd. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-091 · Minden fejlesztési szakaszhoz gépi ellenőrzés tartozzon

- **Azonosító** — R-KAN-091
- **Cím** — Minden fejlesztési szakaszhoz gépi ellenőrzés tartozzon
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Minden fejlesztési szakaszhoz gépi ellenőrzés tartozzon.
- **Forrás** — kanban-jegyek.txt:778 · #91 (in_progress, 2026-11-17)
- **Mi van kész** — A #489 a helyi kapuk alapját adta. A #517 a teljes vertikum tervét hozta be. A P2 bizonyítéklánc külön ága nem része ennek a főágnak. Kapcsolódó hely: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:1`; `scripts/qa/three-phase-check.test.mjs`.
- **Mi hiányzik** — P2 bizonyítéklánc a főágon és P3–P5 végrehajtása.
- **Folytatás helye** — `chore/szkriptkapuk-p2-bizonyitek-lanc` @ `77e69552`
- **Következő lépés** — A(z) `chore/szkriptkapuk-p2-bizonyitek-lanc` ágon hasonlítsd össze a főággal. `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` · A #517 terv P2 bizonyítékláncát próbáld üres és elavult rekorddal. Az állítás-, tesztintegritás-, követhetőségi és telepítési szakaszt saját ellenpéldával fogadd el. Ellenőrzési hely: `scripts/qa/three-phase-check.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-042

### R-KAN-093 · A közös mérő vegye figyelembe az élesedést, hangot és kéztartást

- **Azonosító** — R-KAN-093
- **Cím** — A közös mérő vegye figyelembe az élesedést, hangot és kéztartást
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A közös mérő vegye figyelembe az élesedést, hangot és kéztartást.
- **Forrás** — kanban-jegyek.txt:792 · #93 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/tests/game-mobile-quality.spec.ts:1`; `source/tests/joystick-response.spec.ts`. A kapcsolódó alapváltozás #454 (d5c91060).
- **Mi hiányzik** — A kérdés élesedése előtti és utáni bemenet, a hang első felmelegítése, balkezes kezelés és fekvő módban takart kőcél ugyanabban a mobilmérésben igazolandó.
- **Folytatás helye** — origin/main · `source/tests/game-mobile-quality.spec.ts`
- **Következő lépés** — `source/tests/game-mobile-quality.spec.ts` · Próbálj meg első kérdésre túl korán és élesedés után válaszolni. Az első érintés hangidejét, a két vezérlőoldalt és a fekvő kőcélokat egy eszközön rögzítsd. Ellenőrzési hely: `source/tests/joystick-response.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-014, P-040

### R-KAN-094 · A Szökőár következő hullámában szűnjenek meg a kijelzési és rajzolási hibák

- **Azonosító** — R-KAN-094
- **Cím** — A Szökőár következő hullámában szűnjenek meg a kijelzési és rajzolási hibák
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A Szökőár következő hullámában szűnjenek meg a kijelzési és rajzolási hibák.
- **Forrás** — kanban-jegyek.txt:795 · #94 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TsunamiEscapeEnglish.tsx:110`; `source/tests/game-mobile-quality.spec.ts`. A kapcsolódó alapváltozás #483 (a11b1b79).
- **Mi hiányzik** — A tétlen kapuátfutásnál kijelzett nulla, a látható akadály korai eltűnése, a hosszú főszálfeladat és a rajzolási hívások száma négy külön elfogadási eset.
- **Folytatás helye** — origin/main · `source/client/src/pages/TsunamiEscapeEnglish.tsx`
- **Következő lépés** — `source/client/src/pages/TsunamiEscapeEnglish.tsx` · Tétlen kapuátfutással ellenőrizd az időzítőt és az eltűnő akadályt. Lassított készülékprofilon mérd a React-frissítéseket, képkockát és rajzolási hívást. Ellenőrzési hely: `source/tests/game-mobile-quality.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-013

### R-KAN-096 · A szerveres jogosultsági felülvizsgálat megerősített pontjainak lezárása

- **Azonosító** — R-KAN-096
- **Cím** — A szerveres jogosultsági felülvizsgálat megerősített pontjainak lezárása
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A szerveres jogosultsági felülvizsgálat megerősített pontjainak lezárása.
- **Forrás** — kanban-jegyek.txt:813 · #96 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/server/player/account-store.ts:280`; `source/tests/player-account-db.integration.ts`. A kapcsolódó alapváltozás #445 (9bda1373).
- **Mi hiányzik** — A b01 F-01, F-03, F-04, F-06–F-11, F-13 és b02 F02, F04, F06 pontok lezáró bizonyítéka hiányzik az exportból.
- **Folytatás helye** — origin/main · `source/server/player/account-store.ts`
- **Következő lépés** — `source/server/player/account-store.ts` · A #96 jegy b01 és b02 pontjait párosítsd a jogosultsági mátrix soraival. Szintetikus vendég, játékos és admin eredménye adja az elfogadást. Ellenőrzési hely: `source/tests/player-account-db.integration.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-019

### R-KAN-097 · A valós idejű párbaj megerősített hibáinak lezárása az adminpróba előtt

- **Azonosító** — R-KAN-097
- **Cím** — A valós idejű párbaj megerősített hibáinak lezárása az adminpróba előtt
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — fiók-közös játék
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A valós idejű párbaj megerősített hibáinak lezárása az adminpróba előtt.
- **Forrás** — kanban-jegyek.txt:816 · #97 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/shared/duel/room-machine.ts:10`; `source/tests/rt-room-machine.test.ts`. A kapcsolódó alapváltozás #464 (5bb648ca).
- **Mi hiányzik** — A b03 F1–F3 és b04 F01–F09 állapotgép- és jogosultsági ellenőrzéseihez hiányzik a pontonként egyeztetett lezárás.
- **Folytatás helye** — origin/main · `source/shared/duel/room-machine.ts`
- **Következő lépés** — `source/shared/duel/room-machine.ts` · A b03/b04 leleteket rendeld a szobaátmenetekhez. Szintetikus többklienses próbában minden állapotváltozást a szerver döntsön el. Ellenőrzési hely: `source/tests/rt-room-machine.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-018

### R-KAN-098 · A közös játékkliens kezelje a megszakított érintést és a többi megerősített esetet

- **Azonosító** — R-KAN-098
- **Cím** — A közös játékkliens kezelje a megszakított érintést és a többi megerősített esetet
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A közös játékkliens kezelje a megszakított érintést és a többi megerősített esetet.
- **Forrás** — kanban-jegyek.txt:819 · #98 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/play/InlineQuestion.tsx:42`; `source/tests/play-lab.spec.ts`. A kapcsolódó alapváltozás #446 (57bd1b0e).
- **Mi hiányzik** — A b06 F-01 és F-03–F-08, valamint b05 F-03 és F-04 pontokhoz hiányzik a tételes lezárás. A beragadt érintőgomb külön regressziós eset.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/play/InlineQuestion.tsx`
- **Következő lépés** — `source/client/src/game-engine/play/InlineQuestion.tsx` · A b05/b06 listát kösd a közös komponensekhez. Elvesző pointer, fókuszváltás és visszatérés után legyen felengedett gombállapot. Ellenőrzési hely: `source/tests/play-lab.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-099 · A külön külső ellenőri sor felülvizsgálata

- **Azonosító** — R-KAN-099
- **Cím** — A külön külső ellenőri sor felülvizsgálata
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A külön külső ellenőri sor felülvizsgálata.
- **Forrás** — kanban-jegyek.txt:822 · #99 (todo, 2026-11-17)
- **Mi van kész** — A #490 megvalósította a külső véleményt. Kötelező külön sorát a tulajdonos 2026-11-18-án visszavonta (pótlási terv K-12). Kapcsolódó hely: `scripts/qa/gates/record-review.mjs:5`; `scripts/qa/gates/record-review.test.mjs`.
- **Mi hiányzik** — A külön ellenőri sor lezárásának átvezetése. A korábban igazolt leletek feladatai #96–98.
- **Folytatás helye** — origin/main · `scripts/qa/gates/record-review.mjs`
- **Következő lépés** — `scripts/qa/gates/record-review.mjs` · Vezesd át a 2026-11-18-i K-12 döntést a jegyen. A #96–98 megerősített leleteit külön őrizd meg, sorrendi egyezést vizsgálj a pótlási tervben. Ellenőrzési hely: `scripts/qa/gates/record-review.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-043

### R-KAN-101 · A kérdésbank csak a szükséges évfolyamot küldje

- **Azonosító** — R-KAN-101
- **Cím** — A kérdésbank csak a szükséges évfolyamot küldje
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A kérdésbank csak a szükséges évfolyamot küldje.
- **Forrás** — kanban-jegyek.txt:837 · #101 (in_progress, 2026-11-17)
- **Mi van kész** — A #502 már ETag/304-et és évfolyamváltozatot ad. A létrehozás/törlés és a teljes hideg út külön elfogadást igényel. Kapcsolódó hely: `source/server/lib/quiz-bank-classroom.ts:7`; `source/tests/quiz-bank-s1.test.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kérdésbank csak a szükséges évfolyamot küldje.
- **Folytatás helye** — origin/main · `source/server/lib/quiz-bank-classroom.ts`
- **Következő lépés** — `source/server/lib/quiz-bank-classroom.ts` · Az S1 után szimulálj létrehozást, törlést, hideg indítást és változatlan újrakérést. A válasz méretét és az ETag-et évfolyamonként hasonlítsd össze. Ellenőrzési hely: `source/tests/quiz-bank-s1.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-009

### R-KAN-102 · A hajlítható telefon és a főszálterhelés is legyen mérve

- **Azonosító** — R-KAN-102
- **Cím** — A hajlítható telefon és a főszálterhelés is legyen mérve
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A hajlítható telefon és a főszálterhelés is legyen mérve.
- **Forrás** — kanban-jegyek.txt:847 · #102 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/tests/game-mobile-quality.spec.ts:1`; `source/tests/joystick-response.spec.ts`. A kapcsolódó alapváltozás #446 (57bd1b0e).
- **Mi hiányzik** — A 827×896 és 896×827 nézetet 2,625-ös képpontsűrűséggel és érintéssel kell mérni. Cél a másodpercenként 50 ms alatti főszálblokk és a teljes játéklap újrarajzolásának elkerülése az óra minden üteménél.
- **Folytatás helye** — origin/main · `source/tests/game-mobile-quality.spec.ts`
- **Következő lépés** — `source/tests/game-mobile-quality.spec.ts` · Bővítsd a mátrixot 827×896 és 896×827 érintéses nézettel. A játékóra és a főszál mérési ablakát szünetben is ellenőrizd. Ellenőrzési hely: `source/tests/joystick-response.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-103 · Memória-, kanban-, környezet- és termékellenőrző kapcsolódjon a munkához

- **Azonosító** — R-KAN-103
- **Cím** — Memória-, kanban-, környezet- és termékellenőrző kapcsolódjon a munkához
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — Memória-, kanban-, környezet- és termékellenőrző kapcsolódjon a munkához.
- **Forrás** — kanban-jegyek.txt:850 · #103 (todo, 2026-11-17)
- **Mi van kész** — A helyi állapotellenőrzők munkakódja ab69f000. A főági kapuparancsok között a teljes kért eszközsor hiányzik. Kapcsolódó hely: `scripts/qa/gates/stage-gate.mjs:16`; `scripts/qa/gates/stage-gate.test.mjs`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Memória-, kanban-, környezet- és termékellenőrző kapcsolódjon a munkához.
- **Folytatás helye** — `chore/allapot-ellenorok` @ `ab69f000`
- **Következő lépés** — A(z) `chore/allapot-ellenorok` ágon hasonlítsd össze a főággal. `scripts/qa/gates/stage-gate.mjs` · A chore/allapot-ellenorok ág kódját vesd össze az öt kért eszközzel és a szerepleírásokkal. Hiányzó bejegyzés és hibás terméktalálat adjon külön hibát. Ellenőrzési hely: `scripts/qa/gates/stage-gate.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-047

### R-KAN-104 · A J7b-ben elhalasztott Tornado-elemek kerüljenek J7c-be

- **Azonosító** — R-KAN-104
- **Cím** — A J7b-ben elhalasztott Tornado-elemek kerüljenek J7c-be
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A J7b-ben elhalasztott Tornado-elemek kerüljenek J7c-be.
- **Forrás** — kanban-jegyek.txt:853 · #104 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/TornadoHunter200.tsx:273`; `source/tests/tornado-j7a.spec.ts`. A kapcsolódó alapváltozás #454 (d5c91060).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A J7b-ben elhalasztott Tornado-elemek kerüljenek J7c-be.
- **Folytatás helye** — `feat/jatek-j7b-tornado-utelagazas` @ `b066296d`
- **Következő lépés** — A(z) `feat/jatek-j7b-tornado-utelagazas` ágon hasonlítsd össze a főággal. `source/client/src/pages/TornadoHunter200.tsx` · A J7b ág PR-leírásának minden J7c pontját rendeld viselkedési próbához. Mérd, hogy a kérdés-időcsík frissítése újrarajzolja-e az egész lapot. Ellenőrzési hely: `source/tests/tornado-j7a.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-014

### R-KAN-105 · A szóbank napló és a hátralévő tanulás e2e-próbája legyen stabil

- **Azonosító** — R-KAN-105
- **Cím** — A szóbank napló és a hátralévő tanulás e2e-próbája legyen stabil
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A szóbank napló és a hátralévő tanulás e2e-próbája legyen stabil.
- **Forrás** — kanban-jegyek.txt:856 · #105 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/tests/game-mobile-quality.spec.ts:1`; `source/tests/joystick-response.spec.ts`. A kapcsolódó alapváltozás #514 (b930c0f3).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A szóbank napló és a hátralévő tanulás e2e-próbája legyen stabil.
- **Folytatás helye** — origin/main · `source/tests/game-mobile-quality.spec.ts`
- **Következő lépés** — `source/tests/game-mobile-quality.spec.ts` · A két jegyzett tesztben eseményhez kösd a várakozást, lassított futáson is igazold a tényleges tanulási eredményt. Ellenőrzési hely: `source/tests/joystick-response.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-050

### R-KAN-107 · A kapu a tényleges összefésült eredményt vizsgálja

- **Azonosító** — R-KAN-107
- **Cím** — A kapu a tényleges összefésült eredményt vizsgálja
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A kapu a tényleges összefésült eredményt vizsgálja.
- **Forrás** — kanban-jegyek.txt:869 · #107 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `scripts/qa/gates/pre-merge-gate.mjs:83`; `scripts/qa/gates/pre-merge-gate.test.mjs`. A kapcsolódó alapváltozás #518 (ce5205dc).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kapu a tényleges összefésült eredményt vizsgálja.
- **Folytatás helye** — `fix/kapu-gyorsitas` @ `037691a2`
- **Következő lépés** — A(z) `fix/kapu-gyorsitas` ágon hasonlítsd össze a főággal. `scripts/qa/gates/pre-merge-gate.mjs` · A fix/kapu-gyorsitas ágból ellenőrizd a két külön zöld fejből előálló hibás eredményt és a tiszta dokumentációs esetet. Ellenőrzési hely: `scripts/qa/gates/pre-merge-gate.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-108 · Nagyobb kuponleckénél is térjen vissza a hibás kérdés

- **Azonosító** — R-KAN-108
- **Cím** — Nagyobb kuponleckénél is térjen vissza a hibás kérdés
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Nagyobb kuponleckénél is térjen vissza a hibás kérdés.
- **Forrás** — kanban-jegyek.txt:872 · #108 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/useCouponSession.ts:26`; `source/tests/game-question-director.test.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Nagyobb kuponleckénél is térjen vissza a hibás kérdés.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/useCouponSession.ts`
- **Következő lépés** — `source/client/src/game-engine/useCouponSession.ts` · 10 és 12 tételes készleten, rögzített magokkal számold az ismétlésig eltelt kérdéseket. A szerződéses határ legyen közös minden játékban. Ellenőrzési hely: `source/tests/game-question-director.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-010

### R-KAN-111 · A drón alatti ellenfél ne nyelje el a választ

- **Azonosító** — R-KAN-111
- **Cím** — A drón alatti ellenfél ne nyelje el a választ
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A drón alatti ellenfél ne nyelje el a választ.
- **Forrás** — kanban-jegyek.txt:886 · #111 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/SpeedQuizMath.tsx:38`; `source/tests/speed-math-play.spec.ts`. A kapcsolódó alapváltozás #467 (6a4f7a48).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A drón alatti ellenfél ne nyelje el a választ.
- **Folytatás helye** — origin/main · `source/client/src/pages/SpeedQuizMath.tsx`
- **Következő lépés** — `source/client/src/pages/SpeedQuizMath.tsx` · A közös találatdöntésben fedésnél is legyen egyértelmű cél. Ugyanarra a pontra eső drónnal és ellenféllel, érintéses lapi próbán igazold. Ellenőrzési hely: `source/tests/speed-math-play.spec.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-017

### R-KAN-112 · A nyugodt tempóhoz tartozó XP-döntés lezárása

- **Azonosító** — R-KAN-112
- **Cím** — A nyugodt tempóhoz tartozó XP-döntés lezárása
- **Állapot** — NEM IDŐSZERŰ
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Tulajdonosi kérés vagy egy részben elkészült funkció folytatása.
- **Eredeti utasítás / cél** — A nyugodt tempóhoz tartozó XP-döntés lezárása.
- **Forrás** — kanban-jegyek.txt:889 · #112 (todo, 2026-11-17)
- **Mi van kész** — A #498/#500 tempójavítás után a 2026-11-18-i tulajdonosi döntés egységes XP-t ír elő (pótlási terv P-012). Kapcsolódó hely: `source/client/src/lib/wordLadder/pacing.ts:221`; `source/tests/word-ladder-pacing.test.ts`.
- **Mi hiányzik** — A lezárt XP-döntés átvezetése, a #148 külön fenntartása.
- **Folytatás helye** — origin/main · `source/client/src/lib/wordLadder/pacing.ts`
- **Következő lépés** — `source/client/src/lib/wordLadder/pacing.ts` · A 2026-11-18-i azonos XP döntést rögzítsd a táblán. A #148 kódszétválasztását kezeld külön. Ellenőrzési hely: `source/tests/word-ladder-pacing.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-012

### R-KAN-113 · Az e2e-indítás tartsa be a gép egyidejű futási korlátját

- **Azonosító** — R-KAN-113
- **Cím** — Az e2e-indítás tartsa be a gép egyidejű futási korlátját
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Az e2e-indítás tartsa be a gép egyidejű futási korlátját.
- **Forrás** — kanban-jegyek.txt:894 · #113 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `scripts/qa/gates/pre-pr-gate.mjs:38`; `scripts/qa/gates/pre-pr-gate.test.mjs`. A kapcsolódó alapváltozás #518 (ce5205dc).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Az e2e-indítás tartsa be a gép egyidejű futási korlátját.
- **Folytatás helye** — `feat/gepi-zar` @ `a707d24d`
- **Következő lépés** — A(z) `feat/gepi-zar` ágon hasonlítsd össze a főággal. `scripts/qa/gates/pre-pr-gate.mjs` · Két egyidejű szintetikus indítással teszteld a kapacitásfoglalást, a véges várakozást és a felszabadítást megszakításkor. Ellenőrzési hely: `scripts/qa/gates/pre-pr-gate.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-114 · Lassú képkockánál is egyezzen a kérdés és a játék ideje

- **Azonosító** — R-KAN-114
- **Cím** — Lassú képkockánál is egyezzen a kérdés és a játék ideje
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Lassú képkockánál is egyezzen a kérdés és a játék ideje.
- **Forrás** — kanban-jegyek.txt:897 · #114 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/game-engine/play/flow.ts:32`; `source/tests/game-flow.test.ts`. A kapcsolódó alapváltozás #446 (57bd1b0e).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Lassú képkockánál is egyezzen a kérdés és a játék ideje.
- **Folytatás helye** — origin/main · `source/client/src/game-engine/play/flow.ts`
- **Következő lépés** — `source/client/src/game-engine/play/flow.ts` · Vezess végig 4 és 60 fps-es determinisztikus órát. Ugyanannyi szimulációs idő alatt ugyanakkor járjon le a döntési ablak. Ellenőrzési hely: `source/tests/game-flow.test.ts`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-016

### R-KAN-115 · Meglévő PR frissítése is kérjen érintett böngészőpróbát

- **Azonosító** — R-KAN-115
- **Cím** — Meglévő PR frissítése is kérjen érintett böngészőpróbát
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — Meglévő PR frissítése is kérjen érintett böngészőpróbát.
- **Forrás** — kanban-jegyek.txt:900 · #115 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `scripts/qa/gates/pre-push-gate.mjs:245`; `scripts/qa/gates/pre-push-gate.test.mjs`. A kapcsolódó alapváltozás #518 (ce5205dc).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: Meglévő PR frissítése is kérjen érintett böngészőpróbát.
- **Folytatás helye** — `fix/gate-pr-celzott-e2e` @ `9765df58`
- **Következő lépés** — A(z) `fix/gate-pr-celzott-e2e` ágon hasonlítsd össze a főággal. `scripts/qa/gates/pre-push-gate.mjs` · Módosíts játék-UI- és tisztán dokumentációs fixtúrát. A változtatás típusához a megfelelő böngészőbizonyítékot követelje a kapu. Ellenőrzési hely: `scripts/qa/gates/pre-push-gate.test.mjs`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-046

### R-KAN-117 · A kihajtott telefonon jelentkező játékakadás oka mérhető legyen

- **Azonosító** — R-KAN-117
- **Cím** — A kihajtott telefonon jelentkező játékakadás oka mérhető legyen
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A kihajtott telefonon jelentkező játékakadás oka mérhető legyen.
- **Forrás** — kanban-jegyek.txt:911 · #117 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/BlockCraftQuiz.tsx:82`; `source/tests/block-craft-real-touch.spec.ts`. A kapcsolódó alapváltozás #491 (2b873e3c).
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A kihajtott telefonon jelentkező játékakadás oka mérhető legyen.
- **Folytatás helye** — `perf/kockavadasz-telefon-gyors` @ `80cdfd17`
- **Következő lépés** — A(z) `perf/kockavadasz-telefon-gyors` ágon hasonlítsd össze a főággal. `source/client/src/pages/BlockCraftQuiz.tsx` · A #504 ágon rögzíts azonos jelenetet a gyors referenciajátékkal és a Kockavadásszal. A panel adatait vesd össze eszközön mért képkockákkal. Ellenőrzési hely: `source/tests/block-craft-real-touch.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-004

### R-KAN-119 · A befejezett és félbehagyott kvíz eredménye is eljusson

- **Azonosító** — R-KAN-119
- **Cím** — A befejezett és félbehagyott kvíz eredménye is eljusson
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A befejezett és félbehagyott kvíz eredménye is eljusson.
- **Forrás** — kanban-jegyek.txt:917 · #119 (todo, 2026-11-17)
- **Mi van kész** — A #496 az utolsó válasznál kezeli a kvízt. A félbehagyott kör #510, a tartós sor külön T-3 feladat (ági d3c0f4bf). Kapcsolódó hely: `source/server/lesson-result-email.ts:23`; `source/tests/lesson-result-email-db.integration.ts`.
- **Mi hiányzik** — A következő elfogadási feltétel nincs teljes egészében igazolva: A befejezett és félbehagyott kvíz eredménye is eljusson.
- **Folytatás helye** — `fix/eredmeny-email-kviz` @ `44487292`
- **Következő lépés** — A(z) `fix/eredmeny-email-kviz` ágon hasonlítsd össze a főággal. `source/server/lesson-result-email.ts` · A #496 főági és #510 ági útjával ellenőrizd az utolsó válasz, részleges mentés és késői újraküldés sorrendjét. Címzettenként csak az indokolt levél menjen ki. Ellenőrzési hely: `source/tests/lesson-result-email-db.integration.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-024

### R-KAN-120 · A hook hibájának kezelése és az argumentumok hordozható átadása

- **Azonosító** — R-KAN-120
- **Cím** — A hook hibájának kezelése és az argumentumok hordozható átadása
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A fejlesztés vagy kiadás visszatérő hibáját érinti.
- **Eredeti utasítás / cél** — A hook hibájának kezelése és az argumentumok hordozható átadása.
- **Forrás** — kanban-jegyek.txt:920 · #120 (todo, 2026-11-17)
- **Mi van kész** — A #506 beállította a hibánál tiltást mindkét belépőre. A beállítás továbbra is parancsszöveget tartalmaz (.claude/settings.json:72,84). Kapcsolódó hely: `scripts/qa/hooks/check-quality-gates.mjs:23`; `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Mi hiányzik** — Argumentumlistás hookbeállítás és a héjspecifikus esetek ellenőrzése.
- **Folytatás helye** — origin/main · `scripts/qa/hooks/check-quality-gates.mjs`
- **Következő lépés** — `scripts/qa/hooks/check-quality-gates.mjs` · A #506 után vizsgáld meg a két támogatott héj deklaratív indítását. Hibás futtató és szóközös munkakönyvtár is szerepeljen a beállítás tesztjében. Ellenőrzési hely: `scripts/qa/hooks/check-quality-gates.test.mjs`.
- **Függőség / ütközés** — A hivatkozott P-szelet elfogadási sorrendjével együtt kezelendő.
- **Kapcsolódó P-tétel** — P-045

### R-KAN-121 · A polinomos helyes választ pontsor se rontsa el

- **Azonosító** — R-KAN-121
- **Cím** — A polinomos helyes választ pontsor se rontsa el
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A polinomos helyes választ pontsor se rontsa el.
- **Forrás** — kanban-jegyek.txt:925 · #121 (todo, 2026-11-17)
- **Mi van kész** — A főági #493 általános normalizálását követően a típusos pontsor eset külön javítása 9f42a561, korpuszpróbája e7321c13. Kapcsolódó hely: `source/shared/polynomial.ts:12`; `source/tests/open-answer-short.test.ts`.
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `fix/pontozo-polinom-ket-szam` @ `63bc94a4`
- **Következő lépés** — A(z) `fix/pontozo-polinom-ket-szam` ágon hasonlítsd össze a főággal. `source/shared/polynomial.ts` · Normalizáld a végjelölést a polinom értelmezése előtt. Két pont, ellipszis, szóközös ellipszis és ténylegesen hibás polinom legyen a tesztben. Ellenőrzési hely az ágon: source/tests/scorer-corpus.test.ts és source/tests/fixtures/scorer-corpus.json.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-027

### R-KAN-122 · Két megoldás váljon el az ezres tagolástól

- **Azonosító** — R-KAN-122
- **Cím** — Két megoldás váljon el az ezres tagolástól
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — Két megoldás váljon el az ezres tagolástól.
- **Forrás** — kanban-jegyek.txt:928 · #122 (todo, 2026-11-17)
- **Mi van kész** — A művelet utáni két szám külön értelmezését a 9f42a561 ág tartalmazza, korpuszpróbája e7321c13. Kapcsolódó hely: `source/shared/arithmetic-expression.ts:8`; `source/tests/open-answer-short.test.ts`.
- **Mi hiányzik** — A változás főági integrációja és az egyeztetett fejen végzett elfogadás hiányzik.
- **Folytatás helye** — `fix/pontozo-polinom-ket-szam` @ `63bc94a4`
- **Következő lépés** — A(z) `fix/pontozo-polinom-ket-szam` ágon hasonlítsd össze a főággal. `source/shared/arithmetic-expression.ts` · A feladat várt válaszszámával oldd fel a szóköz bizonytalanságát. Egy valódi ezres tagolású szám és két külön eredmény adjon eltérő pontozást. Ellenőrzési hely az ágon: source/tests/scorer-corpus.test.ts és source/tests/fixtures/scorer-corpus.json.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-027

### R-KAN-123 · A teljesítménypanel fekvő telefonon hagyja láthatón a HUD-ot

- **Azonosító** — R-KAN-123
- **Cím** — A teljesítménypanel fekvő telefonon hagyja láthatón a HUD-ot
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A hiány a felhasználó feladatvégzését érinti.
- **Eredeti utasítás / cél** — A teljesítménypanel fekvő telefonon hagyja láthatón a HUD-ot.
- **Forrás** — kanban-jegyek.txt:931 · #123 (todo, 2026-11-17)
- **Mi van kész** — A főági kiindulópont `source/client/src/pages/BlockCraftQuiz.tsx:82`; `source/tests/block-craft-real-touch.spec.ts`. A kapcsolódó alapváltozás #491 (2b873e3c).
- **Mi hiányzik** — Nem igazolt, hogy a jelenlegi változat teljesíti ezt a feltételt: A teljesítménypanel fekvő telefonon hagyja láthatón a HUD-ot.
- **Folytatás helye** — `perf/kockavadasz-telefon-gyors` @ `80cdfd17`
- **Következő lépés** — A(z) `perf/kockavadasz-telefon-gyors` ágon hasonlítsd össze a főággal. `source/client/src/pages/BlockCraftQuiz.tsx` · A #504 ágon 844×390-es nézetben mérd a panel és a HUD metszetét nyitás és összecsukás után. Ellenőrzési hely: `source/tests/block-craft-real-touch.spec.ts`.
- **Függőség / ütközés** — Az ági eredményt a jelenlegi főágon újra kell ellenőrizni.
- **Kapcsolódó P-tétel** — P-004
