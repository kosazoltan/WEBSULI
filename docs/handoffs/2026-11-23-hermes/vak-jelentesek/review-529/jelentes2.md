# Független review — fix/kisfilm-videomodell
Fej: 350e5a914a862d6290aea91dc908ac898f9d1555
## Ítélet: NEM

A modell és a felbontás bekötése megfelel a tervnek a csonkolt kérésben. A naplózási követelmény viszont nem teljesül minden szolgáltatói hibaágon. Az automatikus gyártás maradjon kikapcsolva a javítás és a jóváhagyott, egyjelenetes próba végéig.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — blokkoló: a videószolgáltató válaszából még mindig környezeti vagy URL-titok kerülhet a naplóba.** `source/server/lesson-clips-providers.ts:16,402,411,414`; a valódi naplóhívás `source/server/lesson-clips.ts:228–236,335–339`. Forgatókönyv: a Renderen futó worker egy befejezett, sikertelen feladatról olyan 200-as választ kap, amelyben az `error.code` helyére hibásan rövid, átlátszatlan hozzáférési érték kerül. A szintetikus `FixtureKey9f2` értéket a karakterosztály elfogadja; a workernek átadott hiba `mozgókép: failed (FixtureKey9f2)`, amit sem a teljes HTTP(S)-címeket kereső minta, sem a hitelesítő *címkéket* kereső `source/server/lib/error-sanitize.ts:34–38` nem módosít. Az előző kód a `job.error`-ban legalább a saját konfigurált kulcsok pontos értékét cserélte; ez a védelem megszűnt. Egy másik út ugyanazon a határon: hibás 2xx JSON (pl. `/v?sig=FixtureSig49` törzs) esetén a nyers `JSON.parse`-hiba továbbmegy; a parser üzenete idézhet a törzsből, a relatív címet és a `sig` címkét a szűrők nem ismerik fel. Cáfolati ellenőrzés: a követett teszt ténylegesen zöld a nem-2xx törzsre, az `error.message`-re és a teljes CDN-címre. A `job.status` végállapotai is zártak, de ezek egyike sem védi a `code` vagy a parser üzenetét. Az első út a kódláncból következik; valódi szolgáltatói előfordulás és a parserüzenet pontos alakja **UNVERIFIED**, nem állítok már megtörtént incidenset. **Javítás:** naplóba csak helyben definiált hibakategória, HTTP-státusz és tételesen engedélyezett szolgáltatói enum kerüljön; a JSON-feldolgozási hibát még a szolgáltatói határon cseréljék fix üzenetre. Teszteljék a tényleges worker-naplót szintetikus, címke nélküli titokkal és hibás 2xx válasszal.
- **L2 — közepes: a használati útmutató megkerüli a kötelező, egyjelenetes élesítési próbát.** `docs/fejezet-kisfilmek-hasznalat.md:40–51,70–74` szemben `docs/specs/2026-11-22-kisfilm-videomodell.md:76–86`. A Render-operátor a használati útmutató 2. pontját követve közvetlenül bekapcsolja az automatikát. Ha előbb az ugyanott ajánlott próbaszkriptet futtatja, az sem a terv szerinti kapu: `source/scripts/clip-trial.ts:47–56` teljes fejezetet futtat, és az `ok` csak a kisfilmobjektum létét jelzi. A jelenetszám sémája 3–4, és a worker tesztje (`source/tests/lesson-clip-worker.test.ts:152–164`) igazolja, hogy nulla videóval is születhet kisfilmobjektum. Így az üzemeltető több beküldést indíthat az egyre jóváhagyott próba helyett, vagy zöldnek tekinthet egy tisztán állóképes próbát. **Javítás:** egy közös élesítési útmutató, tényleges egyjelenetes eljárással (`AUTO=off`, előre jóváhagyott modell/felbontás/ár, egy videó-POST, védett letöltés és ellenőrzött átkódolt MP4); üres kimenetnél sikertelen próba. A teljes fejezetes próbát külön kell megnevezni.
- **L3 — közepes: tartós fejezetmentési hibánál az újabb fizetős kör nem fogyaszt próbálkozást.** `source/server/lesson-clips.ts:394–406,458–468`; a DB-írás és az időkorlát `source/server/lesson-clips-db.ts:15–21,57–62`. A worker legenerál egy friss fejezetet, de például az `INSERT … ON CONFLICT` végig írási zárra vár és időtúllépéssel visszagördül. Nincs új kisfilm-sor; a kör felső hibakezelője naplóz, majd tovább ütemez, az új kör pedig ugyanazt az `attempts` értéket olvassa (`lesson-clips.ts:114–121`). A napi limit leckét, nem POST-ot számol, az egyidejűségi zár csak átfedés ellen véd. Fejezetenként 3–4 új videóbeküldés lehetséges minden így megismételt körben, amíg az egyéb kapuk engedik. Ez örökölt rés, nem új POST-újrapróba; a modellváltásnál azért számít, mert a terv egy konkrét mentési hibát már költségkockázatként kezel, de az általános hibaút megmaradt. Kód alapján igazolt vezérlés; célzott DB-hibainjektálás és számlázás **UNVERIFIED**. **Javítás:** fizetős művelet előtt tartós próbálkozásfoglalás, vagy legalább mentési hibánál költést leállító áramkör és riasztás; hibainjektálásos teszt ugyanazzal a fejezettel több ütemben.
- **L4 — kicsi: a frissített kezelői tábla már nem létező hibaszöveget ad diagnosztikai jelként.** `docs/fejezet-kisfilmek-hasznalat.md:33`; `source/server/lesson-clips-providers.ts:360–364`. Ha a modell megszűnik és a POST 404-et ad, a Render-naplóban a dokumentált „No endpoints found for …” helyett a státusz marad; a kezelő a dokumentált szövegre szűrve nem találja meg az esetet. **Javítás:** dokumentálják a tényleges, biztonságos státusznaplót és az elérhetőség külön ellenőrzését; ne tegyék vissza a nyers választörzset.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni a konfiguráció → kérés → modellmező útvonalat.** `clipKeys` trimel és validál; ugyanaz a modell megy a POST-ba és az upsertbe (`index.ts:555–559`, `lesson-clips-providers.ts:135–145,400`, `lesson-clips-db.ts:59–62`). A 80/81 karakterhatár, alapérték, felülírás, felbontás és teljes első képkocka-objektum tesztelve. A `duration` alsó/felső határát 1 200 és 30 000 ms bemenettel is ellenőrzi a worker-teszt.
2. **Biztonság/adatvédelem — talált hiba (L1).** A kulcs forrása env; a védett poll/letöltésben az origin szerinti fejlécszűrést futó teszt ellenőrzi. A kisfilm-GET változatlan, csak publikált leckét olvas, nem indít fizetős műveletet (`studio/lesson-routes.ts:102–113`, `lesson-clips.ts:128–135`); új állapotmódosító HTTP-útvonal nincs, így új CSRF-felület erre nem alkalmazható.
3. **Regresszió — nem sikerült megtörni a lejátszás tartalékútját vagy a tárolt v2 kisfilm szűrését; üzemeltetési regresszió L4.** A worker és a Playwright próbái régi/hibás választ, elakadt lekérdezést, átmeneti 502-t és nem lejátszható videót is fednek. A CLI ugyanazt a `clipKeys`/`clipProviders` párt használja. A közös `safe-fetch` modul nincs módosítva.
4. **Europe/Budapest és dátumhatár — nem alkalmazható mint új időzóna-követelmény.** A napi plafon szándékosan UTC-napon fordul, a frissesség UTC szerinti gördülő ablak (`lesson-clips-db.ts:42–45,64–67`), a modellváltás nem nyúl hozzá. A kézi törlésnél az aktuális `published_at` ellenőrzése marad éles feladat.
5. **Migráció, indítás, cron, leállítás, e2e — próbáltam, nem sikerült megtörni.** Új migráció nincs; `0038_lesson_clips.sql:17` és `shared/schema.ts:720` egyezik. Eldobható Postgresen zöld a csomag. A worker csak productionben, e2e-n kívül, `auto` módban indul; leállítási tesztek vizsgálták a várakozó DNS-t, pollt, 429 utáni időzítőt és a futó átkódolást.
6. **Verseny, ismétlés, időkorlát — talált hiba (L3).** A körön belüli és példányközi kizárás nem ad tartós költési korlátot. A soros átkódolás és a memóriaőr útján nem találtam diffből eredő romlást; az újramért RSS fölötti és méretkorlátos esetek zöldek.
7. **Tesztminőség — a felhős lemondódásra nem kaptam hamis zöldet; az L1/L2 hiba nincs lefedve.** A két időkorlát-teszt ténylegesen lefutott; a tesztszintű timeout és a `t.after`-takarítás a fejben van, a változás a tervben dokumentált. Az egyetlen skip a Windows alatti POSIX-gyerekpróba. A POST-teszt mért törzset ellenőriz, de nem vizsgál szolgáltatói sikert; a hamis `failed` válasza még `polling_url`-t sem ad. Mutációs futás nem volt engedélyezett a saját próbafájlon.
8. **Modell, paraméter, költség és #418 — modell/paraméter kódoldalon nem tört meg; éles feltétel UNVERIFIED, talált kockázat L2/L3.** A régi modellre nincs automatikus visszaesés. A videó-POST körül nincs új próbaciklus, a meglévő polling lekérdezés. A letöltés továbbra is lemezre streamel, az ffmpeg-sor és RSS-kapu változatlan (`lesson-clips-providers.ts:286–335`). A terv mintájából 4 × 0,177 = **0,708 USD** pusztán a mozgókép négy 5 mp-es klipjére; ez becslési alap, nem futásidejű költségplafon.
9. **Egyéb — talált hiba (L2, L4).** A terv és az operátori útmutató mást mond arról, mikor szabad bekapcsolni és milyen hibajelre kell szűrni.

## Mit próbáltam megtörni, és nem sikerült

- Modell felülírása üres, téves formájú és túl hosszú értékkel; az alapérték új modell és 480p maradt. A dokumentáltan érvényes felülírás megjelent a csonkolt POST-ban.
- Méret- és RSS-határ fölötti átkódolás, beragadt DNS és letöltési törzs, megszakítás után induló új munka. A követett worker- és shutdown-próbák a várt megállást látták.
- A böngészős tartalékút: a követett Playwright-spec zöld; a saját szintetikus próbán a dialógus, a felirat és a vezérlők látszottak a 390×844 és a 844×390 képen. A szintetikus képazonosítóhoz nem szolgáltam ki médiát; az üres képterület ezért nem Seedance-megjelenítési bizonyíték.

## Mit NEM vizsgáltam

- **UNVERIFIED**: OpenRouter tényleges Seedance 2.0 Mini-válasza, számlázása, letölthető kimenete és annak valódi képi minősége, továbbá a Render teljes, ffmpeg-et is tartalmazó memóriacsúcsa. Nem indítottam fizetős hívást és nem kapcsoltam be gyártást. Az elfogadás utolsó pontját (első fejezet `0 nélkül`, 450 MB alatti Render-mérés) nem igazolja sem az egységteszt, sem a böngészős csonkolás.
- **UNVERIFIED**: saját provider-napló/mentési ellenpróba és produktív kódmutáció. A futtató elutasította a scratch TS-szkriptet, mert Node v24.22.3 mellett nem tudja lezárni a hálózatot. A leleteknél ezért nem adtam meg saját futtatási bizonyítékot. Éles rekordtörlést, éles auth/régi anyag mátrixot és Budapest DST-váltást nem futtattam; ezeken a kiszolgálóút és a dátumszabály nem változott.

## Megcáfolt gyanúk

- A túl hosszú modellnév nem tudja áttörni a `varchar(80)` határát a produkciós env-útvonalon; a megmaradt ismétlési kockázat más jellegű (L3).
- Az új modell nincs klienslekéréshez kötve, a modellcsere önmagában nem indítja újra a változatlan, már kész fejezetet. A videóhiba szándékosan állóképet menthet; éppen ezért nem megfelelő próbakritérium a puszta `ok`.
- A nyers HTTP-hibatörzs és az általános `job.error.message` a követett negatív próbában nem került a naplóba; ez nem terjeszthető ki az L1 szerinti mezőkre és a JSON-feldolgozásra.

## Mit futtattam (parancs + eredmény)

- `npx tsc --noEmit` — 0, nincs típushiba.
- `npx tsx --test source/tests/lesson-clip-worker.test.ts` — 40 teszt: 39 sikeres, 0 hibás, 0 lemondott, 1 Windows/POSIX skip.
- `npx tsx --test source/tests/lesson-clip.test.ts source/tests/lesson-clip-shutdown-dns.test.ts source/tests/lesson-clip-shutdown-poll.test.ts source/tests/lesson-clip-shutdown-retry.test.ts` — 17 sikeres, nincs skip.
- `npx tsx --test source/tests/lesson-clip-shutdown.test.ts source/tests/clip-style.test.ts` — 8 sikeres, nincs skip.
- `run_db_tests` — eldobható Postgres 17, 258 sikeres, 0 hibás, 0 lemondott, 0 skip.
- `run_e2e source/tests/lesson-clips.spec.ts` — 16 sikeres.
- `run_browser_scenario .blind-review-tmp/kisfilm-nezokep.json` — két sikeres szintetikus eset; a két képernyőképet megnéztem.
- `node .blind-review-tmp/kisfilm-review.ts` — a homokozó elutasította; nem futott le.

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
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Szűretlen szolgáltatói hibakód és JSON-parserüzenet juthat a kisfilmnaplóba — `source/server/lesson-clips-providers.ts:16` — hivatkozás igazolt
- **L2** (közepes) A használati útmutató megkerüli a kötelező egyjelenetes próbát — `docs/fejezet-kisfilmek-hasznalat.md:49` — hivatkozás igazolt
- **L3** (közepes) Sikertelen fejezetmentés után újraindulhat ugyanaz a fizetős gyártás próbálkozás elszámolása nélkül — `source/server/lesson-clips.ts:406` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 19 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3351
- tokenek: 1605688 bemeneti (ebből gyorsítótárból: 1476760, gyorsítótárba írva: 128871), 12029 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.4%; becsült megtakarítás: 5.4828 USD
- költség (a tényleges usage alapján): 0.5903 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
