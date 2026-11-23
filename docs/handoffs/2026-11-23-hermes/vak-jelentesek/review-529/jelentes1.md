# Független review — fix/kisfilm-videomodell
Fej: d829cfe6f735fb8d3fea6c2c8f8993109a28e8e0
## Ítélet: NEM

A Seedance 2.0 Mini / 480p alapérték és a konfiguráció bekötése a vizsgált kódban helyes. A memóriaőr és az egyszálas, soros átkódolás nem változott. Az újraélesítést blokkolja, hogy a videós hibaág teljes URL-t, így URL-paramétert is naplózhat. Ez a hiba már a base-ben is megvolt, de sérti az újraélesítés kifejezett adatvédelmi követelményét. A valódi Seedance- és Render-elfogadás még **UNVERIFIED**.

## Leletek (blokkoló / jegyre menő)

### L1 — blokkoló: a videó letöltési hibája URL-paramétert írhat a szervernaplóba
- **Hely:** `source/server/studio/safe-fetch.ts:209–211` → `source/server/lesson-clips-providers.ts:109–117, 300, 335–336, 411–413` → `source/server/lib/logger.ts:39–41`.
- **Forgatókönyv:** az üzemeltető visszakapcsolja a Renderen a gyártást. A szolgáltató egy lekérdezési paraméterrel ellátott HTTPS letöltési címet ad; a CDN erre például `302`-t küld `Location` nélkül. A közös letöltő a teljes `url.href`-et teszi a kivételbe, a kisfilmletöltő pedig ennek elejét a Render-naplóba írja. Rövid címnél az egész paraméter belefér a 160 karakteres vágásba. Az átirányítási keret elfogyása a kezdeti `raw` címet hasonlóan továbbadja. Ha a paraméter hozzáférést ad a médiához, a napló a hozzáférési adatot is tartalmazhatja.
- **Evidencia és cáfolati kísérlet:** végigkövettem a `completed` válasz `unsigned_urls[0]` mezőjét a védett letöltőig és a konzolig. A HTTPS/origin-ellenőrzés a kérést és az Authorization fejlécet védi, nem rövidíti a címet a hibaüzenetben; a logger csak szintet és időbélyeget ad hozzá. A normál, követett origin/átirányítási tesztek zöldek, de nincs bennük naplóassert a paraméteres hibára. Másik, ugyanilyen hiányos védelem: a hibás POST válasz törzse és a terminális `job.error` a `scrub`-on megy át, amely csak a három ismert API-kulcsot cseréli ki (`lesson-clips-providers.ts:352–358,409`); a worker a maradék szöveget naplózza (`lesson-clips.ts:222,325`). Ez ellenőrzött kódút, nem állítom, hogy élesben ilyen válasz már érkezett. Saját mockos futtatást a sandbox nem engedett.
- **Javítás:** ezeken az utakon csak saját, meghatározott hibakódot, lépést és HTTP-státuszt naplózzatok; ne nyers szolgáltatói üzenetet vagy URL-t. A szolgáltatói JSON-hibára és a hibás átirányításra külön negatív naplóteszt legyen: se a próbakulcs, se a próba URL-paramétere ne jelenjen meg.

### L2 — közepes: a kézi sortörlés után az eredeti fejezet nem feltétlenül gyártható újra
- **Hely:** `docs/specs/2026-11-22-kisfilm-videomodell.md:76–77`; `source/server/lesson-clips-db.ts:42–46`; `source/server/lesson-clips.ts:17,97–110,362–370`.
- **Forgatókönyv:** az élesítést jóváhagyó üzemeltető a deploy után, a lecke publikálásától számított 3 nap lejárta után követi az útmutatót. Törli a kiszolgálható állóképes sort, majd `on`-ra kapcsol. A lecke nem kerül a worker jelöltjei közé, a tanuló elveszíti a korábbi kisfilmet, és nem lát „készül” állapotot sem. A szűrés a lecke publikálási dátumát nézi, nem a törlés vagy a kisfilmgyártás idejét. A megnevezett éles lecke aktuális jogosultságát nem ellenőriztem.
- **Evidencia:** a dokumentum a következő körre ígéri az újragyártást, de a DB-szűrés `published_at` alapján fut. A követett worker-teszt az időablakon kívüli leckére nem kap `pending` állapotot, és a kör csak a friss lecke fejezeteit gyártja (`source/tests/lesson-clip-worker.test.ts:223–235`).
- **Javítás:** törlés előtt ellenőrizendő a publikálási idő és a gyártási jogosultság; az ablakon kívül ne töröljék a meglévő sort. Biztonságosabb külön, célzott kézi csere, amely csak a sikeresen elkészült új változattal írja felül a régit.

### L3 — közepes: az élesítési lista csak a széles körű bekapcsolás után ellenőrzi, hogy működik-e az új modell
- **Hely:** `docs/specs/2026-11-22-kisfilm-videomodell.md:74–78`; `docs/fejezet-kisfilmek-hasznalat.md:33–36,48–60`; `source/server/lesson-clips.ts:316–325,360–394`.
- **Forgatókönyv:** a Render-üzemeltető a listát követi, vagy később beállít egy formailag helyes, de nem elérhető / a kért felbontást nem támogató modellt. Az első videóhiba után a worker nem áll meg: helyette állóképes `ready` sort ment és folytatja a jelölteket. A kép-, szöveg- és esetleges hanghívások addigra lefutottak; később a modell helyesre állítása önmagában nem gyártja újra a `ready` sorokat. Az első fejezet naplójának figyelése nem jelent programozott megállást; a napi plafon leckét számol, nem fejezetet vagy dollárt.
- **Evidencia:** a terv sorrendje deploy, törlés, `on`, majd megfigyelés; a `docs/agent-csapdak.md:1181–1186` már rögzíti, miért előfeltétel az elérhetőségi próba. A modellnév-ellenőrzés szintaktikai, nem képesség- vagy árellenőrzés (`lesson-clips-providers.ts:27–49`). A terv saját 5 mp-es áraiból számolva a dokumentált 720p felülírás videóköltsége ugyanarra a klipre `0,381 / 0,177 ≈ 2,15`-szörös; ez becsült viszony a megadott pontra, nem önálló számlamérés és nem indok a 720p tiltására.
- **Javítás:** legyen a checklistben jóváhagyott, egyetlen klipre/fejezetre korlátozott próba a tényleges modell–felbontás párral, várható árral, a teljes letöltés és átkódolás ellenőrzésével, a széles körű `on` előtt. Legyen egyértelmű megállási feltétel mozgóképhibára is; a 450 MB-os első körös feltételt az útmutató régi 480 MB-os javaslatától jól láthatóan különítsétek el.

### L4 — kicsi: a beküldési teszt zöld maradhat hibás első képkocka-adattal
- **Hely:** `source/tests/lesson-clip-worker.test.ts:736–743,752–756`.
- **Forgatókönyv:** egy későbbi módosítás meghagyja a `frame_type: "first_frame"` címkét, de elhagyja a kezdőkép `image_url.url` mezőjét. A mock csak a végpont végződését nézi, minden ilyen törzsre sikertelen jobot ad, és a teszt elnyeli az elutasítást. A listaállítások nem olvassák a képmezőt; a tényleges szolgáltatóhoz így nem jutna el a kezdőkép. A mostani implementáció küldi a képmezőt (`lesson-clips-providers.ts:395`), ez lefedettségi hiba.
- **Evidencia:** ezt a mutációt a mock és az állítások alapján ellenőriztem; futtatott mutációs eredmény nincs, a sandbox elutasította a saját kód futtatását. A meglévő teszt zöldje a modell és a felbontás tényleges törzsmezőire továbbra is érdemi bizonyíték.
- **Javítás:** ellenőrizni a POST metódust, az egyetlen kezdőkép teljes objektumát és a konkrét tesztkép data URL-jét. A drótpróbába érdemes az érvénytelen beállítással kapott alapértékpárt is felvenni, nem csak a külön parser-tesztben.

### L5 — kicsi: az agent-csapdakatalógus külső API-hívásra utasít
- **Hely:** `docs/agent-csapdak.md:1193–1194`.
- **Forgatókönyv:** egy felhős, csak olvasásra felhatalmazott áttekintő agent a repóból olvasott „közvetlen API-próbával mérd” szöveget saját utasításnak veszi, és külső, esetleg fizetős műveletet indít. A szöveget adatként kezeltem, nem követtem.
- **Evidencia / javítás:** felszólító mondat az agenteknek szóló dokumentumban, konkrét `curl`/proxy-javaslattal. Írjátok át megfigyelésre, és a valódi próba feltételeit külön, jóváhagyott üzemeltetési eljárásban adjátok meg.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — az új bekötést próbáltam, nem sikerült megtörni.** `clipKeys` → `clipProviders` → POST és `index.ts:559` → worker → `upsert` ugyanazt a modellértéket viszi. A beküldési teszt az alap- és a felülírt modellt/felbontást a JSON-törzsben ellenőrzi. Az érvénytelen értékek visszaesését a parser teszteli, a POST-ban való együttes ellenőrzés hiányzik (L4). `80/81` karakterre határteszt futott; a `varchar(80)` egyezik a migrációban (`0038:17`) és a Drizzle-sémában (`shared/schema.ts:720`). A `clip-trial.ts:26–30` ugyanazt a feloldást használja.
2. **Biztonság/adatvédelem — talált hiba (L1).** A konfiguráció csak a környezeti változó nevét naplózza, nem az értékét. Az idegen CDN-re nem megy Authorization fejléc a követett tesztben; ettől még a háttérmunkás külön hibaútján URL kerülhet a naplóba. A `GET /api/lessons/:id/clips` csak olvas, a gyártás nem HTTP-kérésből indul (`studio/lesson-routes.ts:106–113`, `index.ts:555–562`), ezért nincs új CSRF-felület.
3. **Regresszió — a meglévő kiszolgáláson nem sikerült törést előidézni.** A `sourceHash` és a kliens nem változott; a worker-tesztek friss, régi, nem publikált, `off`/`idle`, újraindított kör és régi v1 sor eseteit ellenőrzik. A követett Chromium-specben a hibás vagy régi válasz nem rontja el a Stúdió-leckét. Az újraélesítés kézi lépésében viszont van kiszolgálási kockázat (L2).
4. **Időzóna/dátumhatár — talált működtetési hiba (L2), új időzóna-logika nincs.** A frissesség a publikálástól eltelt idő, a változatlan napi keret kifejezetten UTC-naphoz kötött (`lesson-clips-db.ts:64–67`), nem budapesti éjfélhez. Külön DST-futtatást nem végeztem.
5. **Migráció/séma, indítás/leállítás/e2e — nem sikerült megtörni.** A `0038` és `0039` meglévő; nincs új migráció. A teljes eldobható DB-futás zöld, a kisfilm-zár/timeout próbákat a DB-runner ténylegesen behúzza (`source/scripts/run-learning-db-tests.ts:118`). Az új bekötés csak production / nem e2e; a leállítási próbákban DNS, poll, hang-429 várakozás és átkódolás megszakadt.
6. **Versenyhelyzet/ismétlés — a megváltozott úton nem sikerült megtörni.** Az új POST körül nincs újrapróbáló ciklus; a meglévő poll külön lekérdezés. A worker teszteli a fejezetvégi ismétlést, a sikertelen fejezet két próbálkozását, a leállítást és a párhuzamos testvérjelenetek lezárását; a DB-próba foglalt advisory lock esetén azonnali kimaradást mér. A leállításkor már kifizetett, de nem mentett fejezet továbbra is újraindulhat; ez meglévő viselkedés, nem a modellcsere új retry-ja.
7. **Tesztminőség — talált lefedettségi rés (L4), az unref miatti hamis zöld nem jelentkezett.** Mindkét időkorlát-teszt ténylegesen lefutott, 0 lemondással; az egyetlen skip a meglévő Windows/POSIX ág. A két teszt eredeti állításai megmaradtak; az életben tartó timer 5 s-os tesztkorlát és `t.after` takarítás mellett fut. Az unref-fixet a terv dokumentálja. Futó mutáció nincs; ellenőrzés statikusan és a követett tesztekkel.
8. **Modell, időtartam, memória és költség — részben bizonyított; L3 működtetési hiba.** A régi azonosítóhoz nem találtam aktív, kódolt visszaesést. A fejezetgyártás clampje és a teszt 4, 7 és 12 mp-es eredményeket igazol, a hangtartomány alatti/fölötti bemenettel is. A változatlan `limiter(1)`, a három RSS-ellenőrzési pont (kör, fejezet, transzkód kivétele), a lemezre streamelés, a bájtkorlát és az ffmpeg egy szála kóddal és célzott tesztekkel ellenőrizve. Az éles „N mozgókép (0 nélkül)” és Render-csúcs `<450 MB` elfogadás nincs helyi tesztből igazolva.
9. **Egyéb — talált hiba (L5), a lejátszó hibakezelését nem sikerült megtörni.** Külön álló/fekvő képernyőpróbát is néztem: 390×844-en a várakozásjelzés a fejezetválasztó alatt, az első képkivágáson kívül kezdődött (`y=848`), vízszintes túlcsordulás nélkül; 844×390-en hamisított HTML-es 502 után a lecke betöltődött, kisfilmgombok nélkül. Ez meglévő felület, nem az új videó vizuális minőségének mérése.

## Mit próbáltam megtörni, és nem sikerült

- Rossz vagy hiányzó modell, túl hosszú modellnév, rossz felbontás, hiányzó kulcs: a követett tesztekben az alapérték vagy a nem induló gyártás érvényesült. A régi próbafuttató sincs a régi modellhez kötve.
- Memóriakorlát átlépése kör előtt, futás közben és ffmpeg-indítás előtt; túlméretes videó és megakadt válasz; foglalt DB-zár és későn beérkező DNS. A célzott fejtesztek az elvárt megállást, elutasítást vagy soros futást mutatták.
- Stúdió-lecke elakadt pollal, átmeneti 502-vel és régi klipformátummal: a Chromium-próbák a várakozás időkorlátját, az újrapoll után megjelenő gombot, illetve a használható leckét igazolták.

## Mit NEM vizsgáltam

- **UNVERIFIED:** valódi OpenRouter-jogosultság, élő API-válaszformátum/átirányítás és számla, Seedance 2.0 Mini átkódolása valódi médiával, egy teljes éles fejezet videószáma és Render-memóriacsúcsa. Nem indítottam fizetős vagy éles műveletet, ezért ezek nem tekinthetők elfogadottnak.
- Saját mockos Node-próba és futó mutáció: a futtató Node v24.22.3 alatt a hálózattiltás hiánya miatt visszautasította a scratch kódot. Az L1 hibajelenséghez a teljes adatfolyam kódevidenciája van meg, nem futási reprodukció. A böngészős e2e szándékosan nem futtatja az éles workert.
- Valódi POSIX ffmpeg gyerekfolyamat és Render cgroup; a Windows-körben a követett POSIX próba skip. Nincs külön éles kétpéldányos deploy- vagy budapesti óraátállítási próba. A teljes felület névtelen/bejelentkezett mátrixát sem futtattam; a célzott kisfilmes út regresszióját ellenőriztem.

## Megcáfolt gyanúk

- **A worker még 1.5-öt küld:** az aktív hívók közös alapértéke a 2.0 Mini; a régi slug a módosított kódban történeti megjegyzés, nem runtime fallback. Kézzel, kifejezetten beírt régi slug ettől még érvényes alakú override lenne.
- **A modellváltás új fizetős újrapróbát ad, vagy automatikusan újragyárt minden régi sort:** nem található ilyen új ág; a `ready` sor és az azonos forráslenyomat megmarad. Ez nem helyettesíti az élesítés előtti ár- és működéspróbát.
- **A teszt zöld, mert a két I/O-próba lemondódott:** a futási összesítőben `cancelled 0`, a név szerinti eredményben mindkettő sikeres. A POSIX spec szándékos Windows skipje külön látszik.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-clip-worker.test.ts` — 38 teszt: 37 sikeres, 0 bukott, 0 lemondott, 1 jelölt Windows/POSIX skip.
- `npx tsx --test source/tests/lesson-clip-shutdown-dns.test.ts source/tests/lesson-clip-shutdown-poll.test.ts source/tests/lesson-clip-shutdown-retry.test.ts` — 3 sikeres.
- `npx tsx --test source/tests/lesson-clip.test.ts source/tests/lesson-clip-shutdown.test.ts` — 16 sikeres.
- `npx tsc --noEmit` — 0 hibával kilépett.
- `run_db_tests` (`npm run test:learning-db`, eldobható PostgreSQL 17) — 258 sikeres, 0 bukott/lemondott/skip.
- `run_e2e source/tests/lesson-clips.spec.ts` — 16 sikeres Chromium-teszt eldobható DB-vel.
- `run_browser_scenario .blind-review-tmp/kisfilm-nezet.json` — két sikeres eset; az álló és a fekvő képernyőképet szemrevételeztem.
- `node .blind-review-tmp/video-ellenproba.mjs` — a futtató a fenti sandbox-korlát miatt nem indította el.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 0 | 0 |
| közepes | 2 | 2 | 0 | 0 | 0 |
| kicsi | 2 | 2 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A videó letöltési hibája URL-paramétert írhat a szervernaplóba — `source/server/studio/safe-fetch.ts:209` — hivatkozás igazolt
- **L2** (közepes) A kézi sortörlés után a lejárt lecke fejezete nem gyártódik újra — `docs/specs/2026-11-22-kisfilm-videomodell.md:77` — hivatkozás igazolt
- **L3** (közepes) Az élesítési lista nem kér korlátozott modell- és árpróbát a széles bekapcsolás előtt — `docs/specs/2026-11-22-kisfilm-videomodell.md:77` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 18 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2921
- tokenek: 1426199 bemeneti (ebből gyorsítótárból: 1298351, gyorsítótárba írva: 127794), 12140 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 91.5%; becsült megtakarítás: 4.8059 USD
- költség (a tényleges usage alapján): 0.5708 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
