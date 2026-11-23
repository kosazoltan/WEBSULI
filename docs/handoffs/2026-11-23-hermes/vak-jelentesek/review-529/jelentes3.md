# Független review — fix/kisfilm-videomodell
Fej: 9c46b4a79da0548ef9713e1099dcca26915cec04
## Ítélet: NEM

A modell és a 480p alapérték helyesen jut el a beküldésig a csonkolt próbában. A kötelező élesítés előtti kapu viszont a dokumentált eszközzel nem teljesíthető: az egész fejezetet indítja el, és mozgókép nélkül is sikeresnek jelenti. Az automatikus gyártást ne kapcsolják be a kapu javítása és az egyklipes próba előtt.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — blokkoló: az egyjelenetes próba teljes fejezetért költ, és nulla mozgóképpel is zöld

- **Hely:** `docs/fejezet-kisfilmek-hasznalat.md:49–54`, `source/scripts/clip-trial.ts:19,38–56`. A terv egyetlen jelenetet, előre jóváhagyott árat és sikeres letöltést **és** átkódolást követel (`docs/specs/2026-11-22-kisfilm-videomodell.md:77–80`).
- **Forgatókönyv:** a fejlesztő a gépén az útmutatóban hivatkozott szkriptet futtatja egy jóváhagyott jelenet helyett. A szkript csak fejezetindexet fogad, és az összes jelenetre meghívja az éles szolgáltatókat. Ha a fejezet eljut minden videób­eküldésig, az egy helyett 3–4 videó-POST: a sémában 3–4 jelenet kötelező (`source/shared/lesson-clip.ts:127–135`), az összes jeleneten végigmegy, és jelenetenként egy beküldés történik (`source/server/lesson-clips.ts:290,328–331`; `source/server/lesson-clips-providers.ts:413–414`). A kép- és esetleges hanghívások ezen felül jönnek. Ha az összes videó meghiúsul, például nincs `ffmpeg`, a szkript még mindig kiírhatja az `ok: true` eredményt és normálisan kiléphet. A kezelő így az előírtnál többet költhet, majd úgy engedheti tovább az élesítést, hogy egyetlen mozgóképet sem ellenőrzött.
- **Evidencia / cáfolati kísérlet:** kerestem jelenetválasztó argumentumot, külön egyklipes módot és videóra vonatkozó kilépésikód-ellenőrzést; a hivatkozott szkriptben nincs. A követett teszt közvetlenül ugyanazt a `makeChapterClip` függvényt hívja: HTTP 500, hiányzó ffmpeg és túlméretes kimenet esetén kész `clip`-et, de 0 videót vár (`source/tests/lesson-clip-worker.test.ts:152–164`), és átment. A CLI pontosan a `clip` mező jelenlétéből képezi az `ok` jelzőt. A teszt a közös gyártófüggvényt, nem a teljes CLI-t futtatta.
- **Javítás:** az útmutató valódi egyklipes parancsot adjon, amely előre elkészített kezdőképpel, a tényleges env-párral pontosan egy videót küld be, lefuttatja a valódi letöltőt és átkódolót, és hiányzó/érvénytelen MP4-nél nem nulla kóddal lép ki. A fejezetpróba maradjon külön. Tesztelje a POST-ok számát és a sikertelen letöltés/átkódolás piros eredményét. A végrehajtási lista 6. pontjában is legyen explicit a próba, a mentés és a frissességellenőrzés sorrendje.

### L2 — közepes: a képkapu szabad szövege még bekerül a háttérworker naplójába

- **Hely:** `source/server/lesson-clips.ts:302`; forrás `source/server/lesson-clips-providers.ts:407–409`, napló `source/server/lesson-clips.ts:353–355,413–415`.
- **Forgatókönyv:** egy Stúdió-lecke automatikus gyártásakor a képkapu kétszer elutasítja ugyanazt a jelenetet. A szolgáltató érvényes QA-JSON-t ad vissza, amelynek rövid `note` mezőjében például egy diagnosztikai relatív cím van: `/v?sig=FixtureSigOnly` (mesterséges minta). A QA az objektumot szöveggé alakítja; a látható jelentésben a `note` belefér az első 80 karakterbe. Ez hibaszövegként eljut a Render-naplóig. Ugyanez a szabad szöveg személyes adatot is tartalmazhat.
- **Evidencia:** a `providerErrorCode` a videó `job.error` mezőjét védi, nem ezt az útvonalat. A `clipLogDetail` csak `http://` / `https://` kezdetű URL-eket ismer fel (`source/server/lesson-clips.ts:228–233`), a `redactCredentials` engedélyezett címkéi között nincs `sig` (`source/server/lib/error-sanitize.ts:34–38`); így egyik sem távolítja el a mintabeli paramétert. Az út a kódból követhető; éles kiszivárgást nem állapítottam meg.
- **Javítás:** a képkapunál csak helyben képzett okkódot vagy ellenőrzött logikai jelzőket naplózzon a worker, ne `note`-ot vagy szerializált modellválaszt. A végső naplóhatár regressziós próbája fedje a relatív URL-t és a címke nélküli szolgáltatói szöveget is.

### L3 — közepes: a forgatókönyv szolgáltatói kivétele megkerüli a próbálkozásplafont

- **Hely:** `source/server/lesson-clips.ts:280,397–406,411–415,458–468`. A kivételkezelési rés már a bázison megvolt; nem új videó-újrapróba, de az újraindítandó éles gyártás költségkorlátját érinti.
- **Forgatókönyv:** az első forgatókönyvhívás HTTP 200-zal jön vissza, de a válasz javításra szorul; a javító POST például 503-as választ kap. A következő ütemezett kör az első, sikeres és számlázható hívást is megismétli. Ha ez ismétlődik, az adott friss fejezet a rögzített próbálkozásszám nélkül fut újra, a kör pedig nem jut el a mögötte álló fejezetekhez.
- **Evidencia:** a `writeDraft` a fejezet `try` blokkján kívül fut. A `runClipRound` minden nem leállítási kivételt továbbdob, az `upsert` előtt. A scheduler naplózza a hibát és a következő intervallumon újra meghívhatja ugyanazt a kört. A `clipTodo` csak meglevő hibás sorból tud próbálkozást számolni (`source/server/lesson-clips.ts:114–122`); a `lessonsToday` is a tárolt sorokból olvas (`source/server/lesson-clips-db.ts:64–67`). Az útvonalat statikusan igazoltam, számlázott próbát nem végeztem.
- **Javítás:** a forgatókönyv szolgáltatói hibáját kezelje fejezetszintű, tartósan számolt hibaként, a `ClipAbortError` kivételének megőrzésével. Teszteset: az első válasz javítandó, a második 503; egymás után több kör nem lépi át a fejezeti plafont.

### L4 — kicsi: kétféle állapot szerepel ugyanarra a memóriajóváhagyásra

- **Hely:** `docs/fejezet-kisfilmek-hasznalat.md:42–47,58–65` és `docs/specs/2026-11-22-kisfilm-videomodell.md:85–86`.
- **Forgatókönyv és evidencia:** a kezelő az útmutató 0. pontját követi, ahol a tartós 480 MB „jóváhagyásra vár”, a modellváltási terv szerint viszont már jóváhagyott. A két szöveg alapján mást dönthet arról, hogy kell-e új jóváhagyás. A 450 MB-os elsőköri határ külön szerepel, az nem a hiba.
- **Javítás:** egy jóváhagyási rekordra hivatkozzon mindkét dokumentum, külön megjelölve az első kör csúcsára és a tartós állapotra vonatkozó szabályt.

### L5 — kicsi: a csapdakatalógus eszközhasználati utasítást ad az olvasó agentnek

- **Hely:** `docs/agent-csapdak.md:1199–1200`. A bejegyzés felszólító módon előírja, mely eszközzel írjon dokumentumot. Egy csak olvasási jogú agent ezt a saját megbízására is érthetné. A szöveget repóadatként kezeltem, nem hajtottam végre; ez nem alkalmazásbeli biztonsági hiba.
- **Javítás:** a szabály rögzítse, hogy csak az írásra jogosult karbantartóra vonatkozó tapasztalat, és írja le tárgyilagosan a hook korlátját.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba az útmutató ↔ CLI határon (L1).** Az env → `clipKeys` → POST és env → worker → upsert modellút egyébként egyezik (`lesson-clips-providers.ts:149–159,414`, `index.ts:555–559`, `lesson-clips-db.ts:57–62`, mind a `source/server/` alatt). A cél első három EARS-pontjából: alapmodell és 480p, érvényes felülírás, érvénytelen/üres értéknél alapérték, illetve a 4–12 mp-es szorítás a követett tesztekben szerepel. Az érvénytelen értéket a függvényteszt, a tényleges JSON-t külön a beküldési teszt vizsgálja. A `16:9`, a néma videó és a teljes kezdőkép-objektum ellenőrzött. A negyedik, éles EARS-pont **UNVERIFIED**.
2. **Biztonság/adatvédelem — talált hiba (L2).** Az éles kulcsok környezeti változókból jönnek; a videótesztekben nem jutott át a nyers HTTP-hibatörzs, az ismeretlen `job.error.code` vagy a letöltési cím lekérdezése. A hitelesített poll és az idegen CDN felé elhagyott hitelesítő fejléc tesztje zöld. Új böngészőből indítható fizetős művelet nincs. A publikus `GET /api/lessons/:id/clips` csak olvas (`source/server/studio/lesson-routes.ts:102–113`), a gyártás ettől független.
3. **Meglévő folyamatok — próbáltam, nem sikerült megtörni.** A `lesson-clips.spec.ts` eldobható szerveren átment, beleértve a kisfilm nélküli leckét, a régi/hibás válaszformátumot, valamint a kliens 502-es és elakadt lekérdezését. A kész kliensválasz nincs az adatbázisbeli `model` mezőhöz kötve (`source/server/lesson-clips.ts:98–122`); az állóképes, kész sor nem kerül automatikusan újragyártásra, ahogy a terv kéri. A közös hibamaszkoló és a védett szállítás célzott tesztjei is zöldek.
4. **Europe/Budapest — a változásra nem alkalmazható; a meglévő határt ellenőriztem.** A frissesség gördülő ablak (`source/server/lesson-clips-db.ts:42–45`, `source/server/lesson-clips.ts:18,111`), a napi plafon kifejezetten UTC-napot mér (`source/server/lesson-clips-db.ts:64–67`), nem budapesti éjfélt. Egyik sem változott. Az éles törléshez a worker `published_at` feltételét kell ellenőrizni, nem a helyi naptári napot; a konkrét éles sor frissessége **UNVERIFIED**.
5. **Migráció / indítás / cron / leállítás / e2e — próbáltam, nem sikerült megtörni.** A `0038` migráció `varchar(80)` mezője és a Drizzle 80-as mezője azonos (`source/migrations/0038_lesson_clips.sql:17`, `source/shared/schema.ts:720`); a határteszt az ASCII modellnévre 80-at elfogad, 81-et elvet. Nem kell új migráció. Az indítás éles és nem-e2e feltétele megmaradt, ahogy az időzítők leállítása és a szolgáltatói megszakítás (`source/server/index.ts:555,715,739–747`). Az eldobható PostgreSQL-futás és a leállítási/e2e-őr tesztjei átmentek.
6. **Párhuzamosság / ismétlés / időtúllépés — talált hiba az ismétlésben (L3).** A videóút nem kapott új POST-újrapróbát; a státuszlekérdezés GET (`source/server/studio/safe-fetch.ts:110–113`). A fejezetek és az ffmpeg sora továbbra is egyelemű, a munkakezdési RSS-ellenőrzés megmaradt (`source/server/lesson-clips.ts:24,387–393`, `source/server/lesson-clips-providers.ts:300,329–338`). A memóriaőr, a sor, a testvérjelenet-hiba és a függő poll/DNS leállítása a követett próbákban átment.
7. **Tesztminőség — próbáltam, a két érintett tesztnél nem észleltem hamis zöldet; az élesítési kapu fedetlen (L1).** A futásban 0 lemondás és egy külön jelölt Windows-skip volt (valódi POSIX-os ffmpeg-helyettesítő). A két határidőteszt tényleges elutasítást, illetve késői kérés hiányát / kapcsolatlezárást ellenőriz; a módosítás életben tartást, teszthatáridőt és időtúllépéskor is takarító `t.after`-t ad (`source/tests/lesson-clip-worker.test.ts:626–648,688–707`). Nem láttam gyengített állítást e kettőben; a stabilizálás a tervben dokumentált. Mutáció futtatása **UNVERIFIED** a helyi homokozó korlátja miatt.
8. **Modell, költség és memória — talált hiba az élesítési költségkapun (L1) és a hiba utáni ismétlésnél (L3).** Nem találtam futó, a régi modellre visszaeső ágat: a régi azonosító dokumentumban/megjegyzésben szerepel; kézi, alakilag érvényes env-felülírás nem fallback. A memóriakorlátok és a lemezre streamelés nem változtak, de ez nem mérés az új modell valódi bemenetével. A tervben mért 5 mp-es árakból számolva 720p/480p = 0,381/0,177 ≈ 2,15; az egyklipes ár nem azonos a teljes fejezet árával.
9. **Egyéb — talált dokumentációs eltérés és agentnek szóló eszközutasítás (L4, L5).** Az első körre és a tartós üzemre vonatkozó küszöböt nem szabad összemosni. A fájlbeli felszólítást nem követtem.

## Mit próbáltam megtörni, és nem sikerült

- Hiányzó, hibás és túl hosszú modellbeállítással, érvényes 720p felülírással, valamint rövid és túl hosszú hanggal kerestem rossz alapértéket, eltérő DB-hosszt vagy rossz videóparamétert. A függvény- és beküldésitesztek ezeken átmentek.
- A követett tesztekben késő DNS, elakadt törzs, tartósan foglalt átkódolási sor, túl nagy videó és megemelkedett RSS mellett kerestem újabb kérést vagy átkódolás-indítást. A célzott állítások átmentek; ez nem teljes Render-memóriamérés.
- A böngészőben a már meglévő lejátszási folyamatot hibás/régi válasszal, átmeneti 502-vel és függő kéréssel támadta a teszt; a leckefelület megmaradt, a várakozás megfelelően megszűnt, illetve átmeneti hiba után folytatódott.

## Mit NEM vizsgáltam

- **UNVERIFIED:** valódi OpenRouter modell-elérhetőség, teljes szolgáltatói válaszszerződés, letöltés/ffmpeg 480p és 720p mellett, számlázás, Render teljes csúcsmemóriája és első kör naplója. Nem ment fizetős kérés és nem változott éles konfiguráció vagy adat. Ezekhez javított próbakapu, tulajdonosi jóváhagyás és éles felügyelet kell.
- **UNVERIFIED:** saját CLI/worker ellenpróba és forrásmutáció. A futtató a Node v24.22.3 hálózati homokozókorlátja miatt az ideiglenes próbát nem indította el; a leleteknél külön jelöltem, mi származik kódból, illetve követett futásból. A valódi POSIX-gyerek tesztje Windows alatt kimaradt.
- Nem volt felületi diff, ezért nem készítettem külön álló/fekvő képernyőképeket. Az e2e a meglévő lecke/lejátszó viselkedését, nem a Seedance-képminőséget ellenőrizte. Külön bejelentkezett/névtelen gyártási mátrixot nem futtattam; a gyártó nincs felhasználói kéréshez kötve.

## Megcáfolt gyanúk

- A túl hosszú konfigurált modellnév meghiúsítja az upsertet: az éles belépő már 80 karakternél korlátoz, ami a migráció és a Drizzle határa. Ez nem védi ki az L3 külön hibaútját.
- A Windows-os skip miatt the két hálózati határidőteszt is kimaradt: a DNS- és törzsteszt ténylegesen lefutott; a skip csak a POSIX-gyereket érintette.
- Egy fejezet több jelenete több egyidejű ffmpeg-gyereket jelent: a jelenetek lehetnek párhuzamosak, de ugyanaz az egyelemű átkódolási sor fogja a kimenet beolvasását is.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-clip-worker.test.ts` — 39 átment, 1 Windows-skip, 0 lemondás.
- `npx tsx --test source/tests/lesson-clip.test.ts source/tests/lesson-clip-shutdown.test.ts` — 16/16 átment.
- `npx tsx --test source/tests/lesson-clip-shutdown-dns.test.ts source/tests/lesson-clip-shutdown-poll.test.ts source/tests/lesson-clip-shutdown-retry.test.ts source/tests/e2e-mode.test.ts` — 9/9 átment.
- `npx tsx --test source/tests/error-sanitize.test.ts source/tests/clip-style.test.ts` — 31/31 átment.
- `npx tsc --noEmit` és `npx tsc --noEmit -p tsconfig.test.json` — mindkettő 0-val tért vissza.
- `run_e2e source/tests/lesson-clips.spec.ts` — 16/16 átment, eldobható adatbázis eltávolítva.
- `run_db_tests` — 258/258 átment, eldobható PostgreSQL eltávolítva.
- `node .blind-review-tmp/kisfilm-proba.ts` — futtató elutasította; nem futott próbakód.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 1 | 0 |
| közepes | 2 | 2 | 0 | 0 | 0 |
| kicsi | 2 | 2 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A kötelező egyjelenetes próba teljes fejezetet indít és nulla videóval is zöld — `docs/fejezet-kisfilmek-hasznalat.md:51` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: unit)
- **L2** (közepes) A képkapu szabad szövege relatív URL-paraméterrel a worker naplójába kerülhet — `source/server/lesson-clips.ts:302` — hivatkozás igazolt
- **L3** (közepes) A forgatókönyv szolgáltatói kivétele megkerüli a próbálkozásplafont — `source/server/lesson-clips.ts:280` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 25 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3401
- tokenek: 1861516 bemeneti (ebből gyorsítótárból: 1738603, gyorsítótárba írva: 122838), 12278 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.7%; becsült megtakarítás: 6.4839 USD
- költség (a tényleges usage alapján): 0.6039 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
