# Független review — fix/kisfilm-leallitas-hatarido
Fej: 28283045a4bf63ecf606e3ecb9d336d55b90695c
## Ítélet: NEM

A kemény stop megszakítja a hangkapu HTTP-kérését, de a megszakításból a worker szabályosnak látszó eredményt csinál, és **új médiaírást indít**. Ez a leállítási ág hibája, nem a PostgreSQL-oldali leállítás visszaigazolásának ismert korlátja.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: a megszakított hangkapu után új hangírás indul

**Hely:** `source/server/lesson-clips.ts:256`, `:300–311`; hívási lánc: `source/server/index.ts:722–723` → `source/server/lesson-clips.ts:449–455` → `source/server/lesson-clips-providers.ts:215–218,442–456` → `source/server/lesson-clips-db.ts:83–87,131–137`.

**Forgatókönyv:** az üzemeltető leállítja a kisfilmet gyártó Render-példányt. A kivárás lejártakor egy jelenet hangja már elkészült, a beszédfelismerő válaszára vár. A leállító jel megszakítja a HTTP-kérést; a provider `ClipAbortError`-t dob. A `speakChecked` ezt közönséges hangkapuhibaként elkapja, és visszaadja az ellenőrizetlen hangot. A jelenet erre **a stop után** új `putMedia('audio', …)` tranzakciót indít. A következő, mozgóképes lépést már megállítja a szolgáltatói őr, így a sikeresen beírt hanghoz nem készül kisfilmsor. Ha az új tranzakció sorzárra vár, az egyébként lezárható kör a végső, 10 s-os kivárásra és kényszerített eldobásra szorulhat (az utasítás DB-időkorlátja 15 s).

**Evidencia és cáfolati kísérlet:** végigkövettem a leállító jelet a valós OpenAI- és ElevenLabs-hangkapuig. A provider `guarded` burkolója helyesen besorolja a megszakítást, de a `:256` feltétel nélkül elnyeli. Az `alive()` csak testvérjelenet hibáját ellenőrzi (`:275–276`), a worker `shouldStop` őre nem a médiaírásnál van (`:389,408`), és a zár ekkor még szándékosan él. A közvetlen hangkérés `ClipAbortError`-ját az outer hangfallback is elnyeli (`:309–311`), ezért csak a belső `catch` javítása nem elég. A vezérelt órás saját próbát a futtató elutasította; a lelet bizonyítéka a forrásbeli hívási lánc, a blokkolt tranzakciós változat futásban **UNVERIFIED**.

**Javítás:** mindkét hangfallback engedje tovább a `ClipAbortError`-t. A kemény stop jele legyen elérhető a gyártólogikában is, és a sikeresen visszatérő aszinkron lépés után, új média- vagy kisfilmsor-írás előtt is ellenőrizze. Regressziós próba: a valódi worker belép egy válaszra váró, csonkolt hangkapuba; kemény stop után nincs új `putMedia`/`upsert`, a kör eldobás nélkül `ended`.

### L2 — Közepes, jegyre: a takarítást ellenőrző tesztek csak a megszakítás kérését figyelik

**Hely:** `source/tests/lesson-clip-worker.test.ts:753,757–763,775,779–784`; a védendő sor: `source/server/lesson-clips.ts:420`.

**Forgatókönyv és evidencia:** ha a fejlesztő eltávolítja az `await body…` sort, zárvesztéskor a kör ígérete már az átkódoló lezárulása és a munkamappa törlése előtt teljesülhet. A tesztben az „átkódoló leállt” esemény a `kill()` belsejében, még a kilépési callback időzítése **előtt** kerül a listába. A modellteszt ugyanígy az `abort`-eseményben, a kérés elutasítása előtt naplóz. Mindkét marker a `round.abort()` hívásakor szinkron kerül a listába, ezért az események elvárt sorrendje a kivárás nélkül is előáll. A mutációt forrás szerint követtem végig; mutált futás nem történt. Ez nem a követő PR-ra utalt DB-tárváltási teszt hiánya.

**Javítás:** külön ígéretkapu tartsa vissza az átkódoló kilépési callbackjét, illetve a modellkérés elutasítását. A megszakító jel után, de a kapu felengedése előtt legyen assert arra, hogy a kör még függ. A felengedés után a callbacket és az eltűnt munkamappát is ellenőrizze a teszt. Ne alvásra épüljön a sorrend.

### L3 — Közepes, élesítési jegy: a kézi 480 MB-os feltételhez nincs használható beavatkozási szabály

**Hely:** `docs/fejezet-kisfilmek-hasznalat.md:40–45,51–58`.

**Forgatókönyv és evidencia:** egy későbbi éles körben az ügyeletes a Render grafikonon a 480 MB-os küszöb közelében egymás után több mintát lát. A runbook 0. pontja kéri rögzíteni, mi számít tartósnak és ki kapcsol ki, az 5. pont mégis csak azt mondja, hogy „tartósan … súrolja”. Nem ad mérési ablakot, határozott feltételt vagy felelőst. Az első kör 450 MB feletti **csúcsára** adott egyértelmű szabály nem tölti ki ezt a későbbi üzemeltetési hiányt. A 480 MB számérték rögzítése és a 320 MiB-os automatikus RSS-őrtől való elválasztása rendben van.

**Javítás:** élesítés előtt rögzítsék a jóváhagyott mérési ablakot, a lekapcsolást kiváltó összehasonlítást és az ügyeleti szerepkört; az első kör szigorúbb szabálya maradjon külön.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba:** L1, a provider `ClipAbortError`-ját a worker normál sikerértékké alakítja. A `clips` / `pending` mezők és a fejezetindex szerződése egyezik a route, a worker és a kliens között (`source/server/studio/lesson-routes.ts:106–112`, `source/server/lesson-clips.ts:129–135`, `source/client/src/lesson-runtime/clips/useLessonClips.ts:14–22`). A próbaszkript az átkódolt `Buffer | null` felületet használja (`source/scripts/clip-trial.ts:30–50`).
2. **Biztonság/adatvédelem — próbáltam, nem sikerült megtörni a változott letöltési naplót:** a futtatott tesztekben a próbajelölős query nem került a naplóba átirányítási hiba, a nyers törzshiba pedig nem került bele olvasási hiba esetén (`source/tests/lesson-clip-worker.test.ts:693–737`). A nyilvános GET nem indít gyártást és nem ír DB-t; a megosztott Studio-letöltő eredet- és címellenőrző tesztjei zöldek.
3. **Regresszió — próbáltam, nem sikerült megtörni:** kisfilm nélküli lecke, régi/hibás kisfilmformátum, függő állapot lejárata és Stúdió-piszkozat folytatása átment böngészőben. Az álló és fekvő saját képen a lecke címe és a tananyag látszik; a DOM mindkét esetben nulla kisfilmgombot és `pending:false`-t mutatott. Ez nem teljes szerepkörmátrix.
4. **Időzóna — új Budapest-határ nem alkalmazható:** a meglévő napi kisfilmplafon kifejezetten UTC (`source/server/lesson-clips.ts:78`, `source/server/lesson-clips-db.ts:78–81`); a SQL változatlan. Így például télen 23:30 UTC már a következő budapesti nap 00:30-a, de még nem vált UTC keretet. A terv szerint a plafon viselkedése változatlan.
5. **Migráció, indítás, cron, leállítás, e2e — talált hiba a leállításban:** L1. Nincs új migráció; az eldobható DB-n a séma- és árvasöprés-tesztek átmentek. Az indítás csak produkcióban, nem e2e-ben hívja a workert (`source/server/index.ts:555–564`); `idle`/`off` esetén nincs worker-időzítő. A 60+10 s lokális ágat vezérelt órás tesztek fedik, nem a tényleges OS-jeltől mért időt.
6. **Verseny, ismétlés, megszakítás — talált hiba:** L1 a kemény stop és a hangkapu határán. A normál/foglalt zár, illetve a zárkérés, a munka és a feloldás közbeni egyszeri eldobás tesztje átment. Az eldobható PostgreSQL-próba átment a blokkolt scoped írás visszagörgetésére is; ez nem bizonyítja a DB-leállítást hálózati partíciónál.
7. **Tesztminőség — talált hiba:** L2. A naplóteszt a viselkedést vizsgálja, az eredetellenőrző tesztekben az üzenetillesztés kódokra váltott, a tényleges célellenőrzés megmaradt. A kiváltott DB-teszt és az eltávolított órák helyett alkalmazott védelem változása dokumentált a végrehajtási leírás `:155–160` sorain; a worker-tárváltási teszthiány külön vállalt korlát.
8. **Feladat-specifikus ellenőrzés:**
   - **8a — talált hiba:** L1 árva hangot hagyhat; az árvasöprés viselkedése és az ismételt zárkérés átment. A fájlsöprés tesztje kíméli az aktív mappát és törli a régi, halott folyamathoz tartozót. A böngészős jelzés nem ragadt kint az elakadt lekérés után.
   - **8b — talált hiba a kemény stopban (L1) és az üzemeltetési feltételben (L3):** az egy fejezet/egy átkódoló korlát kódban és tesztben látszik; az FFmpeg-paraméterek egy dekódoló-, kódoló- és szűrőszálat kérnek. A nyers törzs bájtkorlátos lemezstream (`source/server/lesson-clips-providers.ts:264–297`). A 320 MiB-os Node RSS-határ fölötti indulásnál a tesztben nulla modellhívás volt; fejezetenként és átkódolás előtt is újramér. A 480 MB-os kézi Render-küszöb külön metrika. Az első éles kör csúcsa és az újraindulás hiánya **UNVERIFIED**.
   - **8c — próbáltam, nem sikerült megtörni a megvizsgált útvonalat:** `execFile`, argumentumtömb, rögzített `in.mp4`/`out.mp4` a `mkdtemp` mappában; a szolgáltatói URL nem lesz fájlnév vagy FFmpeg-argumentum. Az origin-, átirányítás- és hibás médiaazonosító-tesztek átmentek. Ez nem igazolja az FFmpeg teljes fájlrendszer-izolációját vagy a Linux-jogosultságokat.
   - **8d — a vizsgált szerződésen nem találtam új hibát:** a videó határa 2 500 000 bájt, beolvasás előtt ellenőrizve; a médiatár összkerete új fejezet előtt mér, nem DB `CHECK`. A kisfilm numerikus beállításai csak biztonságos egészet fogadnak (`source/server/lesson-clips.ts:59–64`). A borító változatlan napi limitjének túlcsordulása K-KL-L3, nem új lelet.
   - **8e — a megjelenítésben és Stúdióban nem sikerült megtörni; leállításban L1:** a kisfilm- és Stúdió-e2e átment, valódi gyártást nem indított.
   - **8f — talált hiba:** L2. A hálózat és az átkódoló csonkolt; a POSIX ál-FFmpeg helyi gyerek, ezen a futtatón kihagyva. A tesztek között van vezérelt óra, de a lock- és worker-esetek egy része valódi várakozással dolgozik.
9. **Egyéb — talált hiba:** L3. A dokumentált első körös méréshez megvan a csúcshatár, de a normál ügyeleti kikapcsolási döntés nincs teljesen definiálva.

## Mit próbáltam megtörni, és nem sikerült

- A foglalt zárra érkező második indítást, az elvesztett zárkapcsolat kétszeri release-ét és a feltartott, régi tranzakció véglegesítését: a követett lock- és DB-tesztek mind zöldek.
- A letöltési hiba naplószűrését, a DNS-várakozás megszakítását, a 429 utáni újrakérést és a transzkódolás bájtkorlátját: a követett negatív esetek átmentek. A közös forrásgyűjtő tesztjeiben sem jelent meg regresszió.
- A kisfilm nélküli tananyagot üres, késleltetett válasszal, illetve a függő jelzést elakadt válasszal: a saját képernyőképek és a követett böngészőtesztek nem mutattak kisfilm-regressziót.

## Mit NEM vizsgáltam

- Valódi Render-deploy, fizetős szolgáltatók, teljes memóriacsúcs, Linuxos FFmpeg-szálszám és fájljogok, valamint éles `SIGTERM` teljes útja terhelés alatt: **UNVERIFIED**. A POSIX gyerekpróbát a futtató kihagyta, éles memóriamérést a terv élesítéskor ír elő.
- L1 saját ellenpróbája és L2 futtatott mutációja: a futtató a Node 24 hálózati sandbox-korlátja miatt nem engedte a saját Node-fájlt futni; nincs hozzájuk hamis piros tesztkimenet. Az eldobható DB-tesztek nem fedik az abortált hangkapu után indított írást.
- Nem futtattam teljes jogosultsági, legacy-felületi és élő cron-mátrixot. A tulajdonos által követő PR-ra utalt K-KL-L1/2/3/4/5 és K-418-L2/L3/L5 nem került vissza blokkolóként.

## Megcáfolt gyanúk

- A 480 MB nincs véletlenül Node RSS-ként bekötve: kézi Render-metrika; a kód külön 320 MiB Node-határt alkalmaz.
- Az `await clipsStopped` helye önmagában nem teszi későivé a megszakítást: az ígéretet az index a Stúdió-kivárás előtt indítja el. Az abszolút, jeltől mért határ más kérdés, K-KL-L2.
- A scope-olt tár a befejezetlen SQL-írást nem küldi át egy szabad pool-kapcsolatra: `drizzle(client)` a zártartó kliensen indul, soros tranzakciókkal; az eldobható DB-regresszió átment a tesztelt írásra.

## Mit futtattam (parancs + eredmény)

- `git_diff --stat`, teljes fájlok/hívási lánc olvasása, `git_diff`, `git_log`: a megadott diff az ellenőrzés alapja.
- `npx tsx --test source/tests/lesson-clip.test.ts source/tests/lesson-clip-lock.test.ts source/tests/lesson-clip-lock-deadline.test.ts source/tests/lesson-clip-shutdown-deadline.test.ts source/tests/lesson-clip-shutdown-timeout.test.ts source/tests/lesson-clip-shutdown.test.ts source/tests/lesson-clip-worker.test.ts`: 66 sikeres, 1 kihagyott, 0 hiba.
- `npx tsx --test source/tests/lesson-clip-shutdown-poll.test.ts source/tests/lesson-clip-shutdown-dns.test.ts source/tests/lesson-clip-shutdown-retry.test.ts source/tests/web-gather-gpt.test.ts`: 17 sikeres, 0 hiba.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json`: mindkettő 0.
- `run_db_tests`: eldobható PostgreSQL 17, 260 sikeres, 0 hiba; konténer eltávolítva.
- `run_e2e source/tests/lesson-clips.spec.ts`: 16 sikeres; `run_e2e source/tests/admin-draft-lessons.spec.ts`: 9 sikeres.
- `run_browser_scenario .blind-review-tmp/clip-review-browser.json`: álló 390×844 és fekvő 844×390, mindkét esetben `buttons:0`, `pending:false`; mindkét képet szemrevételeztem.
- `node .blind-review-tmp/clip-stop-audio.test.ts`: a futtató elutasította; a próba nem futott le.

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
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A megszakított hangkapu után új hangírás indul — `source/server/lesson-clips.ts:256` — hivatkozás igazolt
- **L2** (közepes) A tesztek a megszakítás kérését, nem a befejezett takarítást mérik — `source/tests/lesson-clip-worker.test.ts:775` — hivatkozás igazolt
- **L3** (közepes) A 480 MB-os kézi küszöb ügyeleti feltétele nincs rögzítve — `docs/fejezet-kisfilmek-hasznalat.md:52` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 21 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 7852
- tokenek: 2167267 bemeneti (ebből gyorsítótárból: 2005191, gyorsítótárba írva: 162013), 16774 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 92.8%; becsült megtakarítás: 7.4577 USD
- költség (a tényleges usage alapján): 0.7734 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
