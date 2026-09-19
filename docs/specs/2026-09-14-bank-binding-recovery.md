# Bankcsomag-hivatkozás és elvesző szolgáltatóhiba

## Cél / bizonyíték
- A 2026-09-14-i folytatás után mindkét vizsgált feltöltés error. A lektor mindkettőnél valóban befejeződött; publikált eredmény nincs.
- A 2. fejezet hatfogalmas csomagjának mentett válaszában a `t-block-order-written` feladat az engedélyezett explanation-block/example-block mellett a másik csomag question-block/recap-block fogalmaira hivatkozik. A 3/7/12 darabszám helyes. A jelenlegi séma egyetlen gyökérszintű „Bankterven kívüli tétel” hibát ad: nincs tételútvonal, ID vagy megengedett fogalomlista.
- A step-runner animátor alatti bankhívása author modellt használ; catch ága csak error.message-et ment, a StepModelError cause elveszik. A második futásnál emiatt nem bizonyítható a szolgáltatói hiba fajtája; az eltelt idő önmagában nem diagnózis.

## Nem-cél
Nincs automatikus fogalomtörlés/átcímkézés, bankminimum- vagy körlimit-lazítás, forrásátírás, authmódosítás, push/deploy. Más dirty változtatások érintetlenek. A régi hibás futás nem minősíthető késznek állapotátírással.

## Megvalósítás / érintett fájlok
- Review-korrekció: a látogatás hibája a job hibájának ugyanazzal a redaktorral előállított alakjával egyezzen. Explicit bankfolytatáskor monoton `bankRecoveryAttempt` kerül a kizárólag újragyártandó bank modellkérésébe, nem a tanítás kivonatába; így a jó csomagok és korábbi modellbizonyítékok megmaradnak, az elutasított modellválasz nem játszódik újra. A workflow négy végrehajtásos korlátja változatlan.
- Biztonságos folytatás: a meglévő resume a tulajdonoshoz kötött workflow-lease megszerzése után olvassa a friss utolsó hibás látogatást. Csak az egyező animator bankcsomag-validációs vagy bankmodell-hibát állíthatja animator/pending állapotra, mentett, még nem publikált leckével. Output/checkpoint/round és hibaelőzmény megmarad; a négy végrehajtás és tartalmi körlimit nem változik. Napló nélküli, eltérő vagy tartalmi lektorhibás job nem jogosult erre.
- Review során igazolt kölcsönhatás: a határsértő kérdés hibás rubrikáját a mintapontozási javítás csoportmegőrzése nem konzerválhatja. Csak a determinisztikusan határsértő tétel-ID kap külön rubrikacsere-engedélyt; a többinél változatlanul tilos csoportot törölni. Ez nem terjesztheti ki a lektori javítás engedélyezett ID-it. Teljes bankvalidáció és lektor továbbra is szükséges.
- source/shared/lesson-experience.ts: azonos elfogadási feltétellel tételenkénti, mezőszintű Zod-hibák, aktuális sectionIndex, fogalomlista és megengedett csomagok.
- source/server/studio/experience-builder.ts: pontos csomaghatár (egy fejezet több csomagot tartalmazhat), a hibás kérdés tartalma is javítandó; puszta címketörlés nem javítás. Sikeres checkpointok és teljes előző válasz megőrzése.
- source/server/studio/step-runner.ts: bankhiba esetén a meglévő describeStepError őrizze meg a szolgáltatói okot.
- Új regressziók: source/tests/bank-binding-diagnostics.test.ts és a meglévő pipeline teszt új esete; régi tesztek változatlan mércével.

## EARS-elfogadás
1. Ha tétel a másik csomag fogalmát hivatkozza, a validáció elutasítja, és pontos bank/index/ID mellett közli az eltérést; minden hibás tételt felsorol.
2. Ha ugyanazon fejezet több csomagjára bontott bank érvényes, változatlanul elfogadható. Az ismeretlen fejezet és csomagközi összekötés továbbra is hiba.
3. Ha a modell a hibás tételt eredeti ID-val, tartalmilag is javítja, a teljes egyesített bank újraellenőrzés után átmegy; változatlan tételek nem vesznek el. Továbbra is hibás javítás nem menthető.
4. Ha bankmodell szolgáltatóhibát dob, az ok diagnosztizálható, a mentett tanítás és sikeres csomagok megmaradnak; nincs publikálás.
5. Célzott tesztek, teljes verify, külön review és valódi böngészős megjelenítés szükséges. Fizetős teljes gyártás kizárólag korlátos, mentett állapotú próbával; sikert csak tényleges visszaolvasás igazol.

## Források / kockázat
Zod v3 hivatalos dokumentáció: https://v3.zod.dev/ (superRefine, custom issue path); https://github.com/colinhacks/zod/blob/v3.24.2/src/__tests__/refine.test.ts. Context7 lekérés jogosultsági hibával elutasítva, közvetlen hivatalos forrás olvasva.
A jobb diagnosztika nem garantálja a modell tartalmi helyességét. Szolgáltatói hibánál a valódi ok csak új, megőrzött hibából állapítható meg. A meglévő lektor/fedettség/publikációs kapuk maradnak.

## Mért ellenőrzés (2026-09-14, helyi)
- `npm.cmd run verify`: 1250 PASS, 0 FAIL, 0 skipped; check, lint, check:test, kliens- és szerverbuild sikeres.
- Chrome: lesson-fusion konfiguráció 9/9, workflow konfiguráció 9/9 PASS; mobil/álló/fekvő/asztali nézetek, négylapos tananyag és adminfolyamat.
- Független review három hibát azonosított (rubrikacsere-scope, redaktált hibaegyezés, hibás JSON cache-újrajátszás); mindhárom célzottan javítva. Az utolsó read-only review nem talált további konkrét hibát.
- Valódi mentett csomagpróba: 3 módszer / 7 nyílt feladat / 12 kvíz, séma PASS, minden minta 1 és üres válasz 0; a job változatlan. Az első célzott modellválasz 9486 ms; végső kompozíció a már mentett rubrikajavítással és a már kifizetett modellválasszal 41 ms, új hívás nélkül. Ez csomagbizonyíték, nem teljes publikált lecke.
- Folytatás előtt read-only tranzakciós mentés és fájlvisszaolvasás: 732361 byte, 0 aktív lease, 0 futó job. Mindkét jelölt publikálatlan; 2 korábbi végrehajtás, 10 illetve 2 megőrzött bank-checkpoint. A mentés helye: gitignored `tmp/bank-recovery/`.
- A helyi fejlesztői szerver a javított kóddal újraindult. Mindkét valós folytatás egyszer, a hitelesített admin API-n keresztül indult; a végállapot külön visszaolvasandó. Push/deploy nem történt.
- Fennmaradó környezeti jelzések: a tesztimport DB-kapcsolatot kezdeményez konfigurálatlan helyi Postgres felé (tesztek sikeresek); elavult Browserslist-adat; helyi VAPID hiány miatt pushértesítés nincs. Ezek nem a bankvalidáció hibái és nem lettek elrejtve.

## Valódi folytatás eredménye
- „A Föld kering a Nap körül”: a helyi DEV adatbázisban done, publikált és visszaolvasott material, skillAudit=passed. 11 módszer, 45 nyílt feladat, 75 kvíz; minden saját minta 1, üres válasz 0. Újraindítás utáni publikus API 200; tiszta Chrome-ban mind a négy lap 320/390/1440 px-en látható, nincs vízszintes túlcsordulás vagy pageerror. A helyi bizonyíték `tmp/bank-published-browser/` alatt van. Ez nem éles deploy.
- A dokumentációs tananyag bankhibáján túljutott: 10→18 mentett csomag, a 10 korábbi változatlan maradt. A lektor után a kapu további tanításjavítást kért. A harmadik szerzőkör után a következő animátorlépés elutasítva: „Elfogyott a lépés javítási kerete: Ábrák és gyakorlóbankok.” Nincs publikáció. A hibás banklátogatás is szerepel a jelenlegi látogatáskeretben; ezt nem töröltük, és a limitet nem emeltük.
- A régi szinkron resume HTTP-kérése böngészőoldalon megszakadt, de a szerver tovább dolgozott. Külön javítás és regresszió: `2026-09-14-resume-http-acceptance.md`.
- A körlimitnél kiszökő kivétel a régi folyamatban running jobot hagyott. Az utóállapot mentve, 0 aktív lease mellett a szerver újraindítása a meglévő boot-sweep segítségével errorra zárta; a workflow eredeti körlimit-hibája és minden csomag megmaradt. Az új későihiba-kezelés ezt tranzakciós lease-védelemmel kezeli.
- A közvetlen `/lesson/:id` fejlesztői navigáció Vite preamble/CSP hibája külön szeletben javítva kérésenkénti nonce-szal, production profil változtatása nélkül. Terv és 24 valódi Chrome-lappróba: `2026-09-14-lesson-dev-csp.md`.