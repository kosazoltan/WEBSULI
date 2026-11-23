# Független review — feat/advent-c-felulet-es-elesites, 5. visszaellenőrző kör
Fej: 448d4c5af940faa83402fa8221f182761c8f2395
## Ítélet: IGEN, FELTÉTELLEL

**Új blokkolót nem találtam.** Az előző kör mind a négy jegyre tett hibája újra előállt; a súlyosságuk nem változott. Ez összevonási ítélet, nem élesítési jóváhagyás: a kapcsoló maradjon kikapcsolva a D-11 szerinti tulajdonosi előnézetig.

## Az előző kör leleteinek sorsa

Az előző jelentésben nem volt blokkoló. Az érintett adventi kód útvonalra szűrt történetében `d53178ef` a legutolsó funkcionális változás. A fejre vezető `1adcfef5` és `448d4c5a` összevonásban nincs javítás a négy érintett helyre. Az előző jelentés nem ad meg külön fej-hasht, ezért a régi sorszámokat és forgatókönyveket közvetlenül is ellenőriztem.

| Lelet | Sors | Futtatott ellenpróba |
|---|---|---|
| L1 | **Nem szűnt meg.** | 360×640: válasz után `2 / 24 világít`, a 2. ablak `solved`; a régebbi átvételi válasz kézbesítése után `1 / 24 világít`, az ablak `open`. |
| L2 | **Nem szűnt meg.** | 360×640: kész állásnál egyszeri 503, majd az „Újra” után eltűnik a hiba, de csak GET megy. A második POST az összesítés külön megnyitásakor indul. |
| L3 | **Nem szűnt meg.** | 844×390: egyszeri 503 az automatikus nyitásnál, majd „Újra”. Kérdés csak az 5. ablak külön megnyitására jelenik meg. |
| L4 | **Nem szűnt meg.** | 360×640: teljes `doors`, de a `layout` első eleme 25 → nincs rács, globális hibahatár. A 409 `corrupt` kontroll a célzott üzenetet adja. |

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — közepes: a késői átvételi válasz visszafesti a megoldott ablakot.** `source/client/src/pages/AdventCalendar.tsx:281–284,365–372`; `source/client/src/advent/sync.ts:137–147`. Párosított tanuló telefonon megnyitja az összesítést, Escape-pel bezárja, majd megoldja a 2. ablakot. A böngészőben a régebbi, sikeres `/adopt` választ addig tartottam vissza, amíg a sikeres `/answer` már kivilágította az ablakot. Utána visszalépett a teljes állás. Az alanygeneráció ugyanaz; a függő GET megszakítása nem rendezi a két POST válaszát. A base-ben nincs ez a kliensoldal és külön `/adopt`. Kijelzési visszalépés, nem mért DB-adatvesztés. **Javítás:** írások sorosítása vagy régebbi szerverállapot eldobása; teszt fordított kézbesítési sorrenddel.
- **L2 — közepes: az „Újra” nem ismétli meg a kész vendégeredmény átvételét.** `source/client/src/pages/AdventCalendar.tsx:365–373,472–476`; `source/server/advent/routes.ts:519–532`. A párosított tanuló 24/24-et és ajándéküzenetet lát. Az első mentés átmenetileg 503; az „Újra” után `state → adopt → state` a nyomvonal. A hiba eltűnik, de nincs új mentés. Kilépéskor függőben maradhat, január 7. után pedig nem vehető át. A kontroll a követett DB-tesztben (`source/tests/advent-routes-db.integration.ts:989–1010`): GET nem ír, sikeres POST után külön eszköz is 24/24-et lát. A base-ben ez a külön mentési út nincs. **Javítás:** az „Újra” az aktuális alanyhoz kötött POST-ot ismételje; sikerig maradjon látható a függő mentés.
- **L3 — kicsi: átmeneti hibánál elvész a kártyáról indított kérdésnyitás.** `source/client/src/pages/AdventCalendar.tsx:350–359,472–476`. Ismert évfolyamú tanuló fekvő telefonon a kártya `?nyit=ma` célcímére érkezik. Egyetlen 503 után két állapotolvasást láttam, de az „Újra” nem nyitott kérdést. Az 5. ablakra külön kattintva a már működő végpont megadta a kérdést. A base-ben nincs ez az automatikus út. **Javítás:** a nyitási szándékot sikerig vagy tudatos megszakításig megőrizni; újrapróbánál friss állapotból folytatni.
- **L4 — közepes: a sorőr átengedheti a kirajzolhatatlan ablakrácsot.** `source/server/advent/routes.ts:54–66,125,357–358`; `source/client/src/pages/AdventCalendar.tsx:47–48,505–508`. A teljes 1–24. kérdésterv mellett hibás `layout`-ot tartalmazó decemberi mentést az őr tömbként elfogadhatja. A megfelelő 200-as állapotban 25-öt küldtem első elemként; a telefon a `Cannot read properties of undefined (reading 'state')` hibahatárra került. A 409-es kontroll helyesen felnőtthöz irányított. A követett őrteszt az egyelemű `layout: [1]`-et is épként fogadja (`source/tests/advent-limits.test.ts:443–448`). Az őr hiányossága a base-ben is megvan, a diff új fogyasztója teszi renderhibává. Sérült sor szükséges, az adott sérült sor DB→HTTP útját nem futtattam végig. **Javítás:** ellenőrizni az 1–24 permutációját; a hiányzó, ismételt és tartományon kívüli elemre HTTP/DB-teszt várjon 409-et.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — hiba (L4).** A teljes ablaklista és az elrendezés külön mező; a kliens az elrendezés valamennyi eleméhez létező napot feltételez.
2. **Biztonság, adatvédelem — próbáltam, új hibát nem találtam.** A végpontleltár, az adventi napló-, URL- és óraőr zöld. Az átvételi DB-eset CSRF nélküli POST-ra 403-at vár, a GET után pedig a tényleges tárolt sort ellenőrzi. A kérdésalak-tesztben nincs helyes index vagy magyarázat a válasz előtt; ez nem jelenti, hogy a nyilvános kérdésbank titkos.
3. **Regresszió — próbáltam, új hibát nem találtam.** A játéklista és gyakorlórács érintetlen a diffben. A főoldali egységőrök és a futtató főoldali nézetpróbái zöldek. A főágból átvett Playwright-konfig a csomagolt Chromiumot használja; az őr mindkét tesztje átment.
4. **Europe/Budapest — próbáltam, új hibát nem találtam.** A UTC 23:00 határ, december 24→25., január 6→7. és a `refreshInMs` határesetei zöldek. A nyitva hagyott lap és eltérő eszközóra a követett böngészőspecben külön eset.
5. **Migráció, indítás, cron, e2e — a sémaváltozás nem alkalmazható; az indítást próbáltam.** A diffben nincs migráció-, Drizzle- vagy új adventi cron-változás. Eldobható PostgreSQL 17-en a séma betöltött, a DB-csomag átment, a DB-t eltávolította a futtató. Az e2e-fejléc nélküli letiltás és az éles óra HTTP-őre zöld.
6. **Párhuzamosság és ismétlés — hiba (L1, L2, L3).** Megfordítottam két POST-válasz kézbesítési sorrendjét, és két egyszeri hibát adtam az „Újra” elé. A DB-sorosítás nem védi a klienst a régebbi POST-választól vagy az elmaradt újraküldéstől.
7. **Tesztminőség — rés maradt (L1, L4), új tesztgyengítést nem találtam.** A `source/tests/advent-pr-c-vak2.test.ts:37–53` valódi QueryClientben késői GET-et mér, nem késői POST-ot. A saját `cancelQueries` nélküli mutánst nem engedte futtatni a homokozó. A kizárólista elvárásváltozása dokumentált a terv 22.11. és a végrehajtás 767–776. soraiban.
8. **Feladatspecifikus ellenőrzések:**
   - **8a — hiba (L1, L2).** A két problémás kliensutat újramértem. A DB-csomag az első párhuzamos átvételre, a profilévfolyamra, az ismételt válaszra és a lezárás után mentett adatra külön esetet tartalmaz; a korábbi alany késve érkező olvasására az egységteszt zöld.
   - **8b — hiba az A45 hálózati hibaútján (L3).** A1–A7: a naptár/kiosztás/szabálytesztek 24 ablakot, determinisztikus négyopciós kérdést és két javítást ellenőriznek. A8–A11: a 24/24 saját próbában is szó szerinti üzenet, a 22/23-as küszöb és az új kör követett eset. A12–A15: zöld határ-, záró- és kártyatesztek; külön szezon előtti és üres lezárt szöveg. A16 és A25 az előnézeti és levelezési szelet. A17–A24: DB-út, idempotencia, kérdésalak, szerverflag és azonosítóőrök; L4 az elrendezés hiányos validálása. A26–A32: mobil-, mozgás-, billentyűzet- és importpróbák; éles darabméret külön nem mérve. A33–A36: a valódi készlettel zöld, 22.11. dokumentált ismétlési kivétellel. A37–A39 az S8. A40–A42: helyőrző és méretek ellenőrizve, végleges képcsomag és generálás nem ebben a körben. A43: a megoldott ablak világít a képen; csillagra és csökkentett mozgásra követett eset van. A44–A48: a kártya helyét, méretét, CLS-ét és nézeteket követett esetek mérik; L3 a hibás hálózati út. A49 és A51–A53: zöld korlát-, fejléc-, zárószöveg- és párosítási tesztek; A50 az S5. A 22. szakasz visszaellenőrzése az előző kör négy kifogására korlátozódott.
   - **8c — próbáltam, új hiba nincs.** CSRF, azonosítók, kérdésalak és éles tesztidő: lásd 2. pont.
   - **8d — hiba (L4).** A `question: null` / `correctIndex: -1`, a 429 `Retry-After`, az érvénytelen párosítás és a teljes ablaklista külön tesztelt; saját 409 `corrupt` próbán a célzott szöveg jött.
   - **8e — új regressziót nem találtam.** A 360×640-es képen mind a 24 ablak és a csillag látszik, a cím csonkolódik. A 844×390-es képen a négy válasz nem fed át; a „Bezárás” alsó széle a belül görgethető panel határára esik. Nyitáskor a kérdés kapott fókuszt; Escape után az 5. ablak. A kikapcsolt útvonalra és lusta importra futott a forrásőr.
   - **8f — próbáltam.** A követett DB-eset tényleges tárolt sort is ellenőriz. A saját hálózati próbákban a második hívásnak már sikerült volna. Nem adtam meg éles szolgáltatói kulcsot, nem indítottam valódi levelet vagy képgenerálást.
9. **Egyéb — új blokkoló nincs.** A két összevonás főági változásokat hozott; a vizsgált adventi hívási út változatlan. A böngészőcsatorna-konfig és a futtatott főoldali regressziós őrök zöldek.

## Mit próbáltam megtörni, és nem sikerült

- A 409 `corrupt` kontroll nem omlott össze: célzott szöveget és visszautat adott, szemben az L4-es hibás 200-zal.
- Kézzel újranyitva az 5. ablakot a kérdés megjelent; Escape visszaadta a fókuszt. L3 nem tartós API-kiesés és nem fókuszhiba.
- A tesztóra határai, az admin-útvonalleltár, a főoldali nézetek és a Chromium-konfig nem törtek el a futtatott próbákban.

## Mit NEM vizsgáltam

- A visszaellenőrzési megbízás szerint a változatlan, korábban nem kifogásolt részeken nem végeztem új teljes fájlszintű auditot. A következő fájloknál a futtatott teszt vagy célzott hivatkozás nem jelent teljes újraolvasást; ott új leletet nem zárok ki:
  - Változatlan megjelenítés és segédek: `source/client/src/advent/AdventArt.tsx`, `source/client/src/advent/Snowfall.tsx`, `source/client/src/advent/busy.ts`, `source/client/src/advent/dialog-escape.ts`, `source/client/src/advent/season-flag.ts`, `source/client/src/advent/tap-guard.ts`, `source/shared/advent/art.ts`.
  - Változatlan főoldali és azonosítási bekötések: `source/client/src/components/AdventHomeCard.tsx`, `source/client/src/components/AdventHomeSlot.tsx`, `source/client/src/components/UserFileList.tsx`, `source/client/src/hooks/usePlayer.ts`, `source/client/src/lib/learnerProfile.ts`, `source/client/src/pages/PlayerAccount.tsx`.
  - Változatlan tároló és közös logika: `source/server/advent/adoption.ts`, `source/server/advent/store.ts`, `source/shared/advent/assignment.ts`, `source/shared/advent/calendar.ts`, `source/shared/advent/home-card.ts`.
  - Változatlan követett tesztek, amelyeknél a futtatást/célzott ellenőrzést választottam a teljes újraolvasás helyett: `source/tests/advent-assignment.test.ts`, `source/tests/advent-calendar.spec.ts`, `source/tests/advent-dialog-escape.test.ts`, `source/tests/advent-elesites-elott.test.ts`, `source/tests/advent-home-card.test.ts`, `source/tests/advent-pr-c-vak.test.ts`, `source/tests/advent-tap-guard.test.ts`.
- A saját L1–L4 próbákban API-tesztadatokat használtam: éles hálózat, DB-adatvesztés és az L4 konkrét sérült sorának DB→HTTP útja nem mért. A követett DB-csomag külön, eldobható DB-n futott.
- Végleges képek és éles gyorsítótár, admin előnézet/tulajdonosi jóváhagyás, éles cron és levélküldés, fizikai telefon, Vercel–Render telepítés és flag-OFF éles buildméret nem kapott új mérést. A manifest üres (`source/shared/advent/art-manifest.ts:6`), a képek helyőrzős állapotot mutatnak. A Stúdió és a tananyagok teljes böngészős mátrixát nem futtattam újra.
- A saját Node-mutációt a futtató elutasította; mutációs eredmény **UNVERIFIED**. A követett Playwright-futtató egyes tesztsorszámai nem egyeznek a fájlolvasóéval (például a CLS-eset a naplóban 252, a fájlban 185). A 47 zöld eset a futtató jelentése; a négy lelet bizonyítéka a külön saját forgatókönyv.

## Megcáfolt gyanúk

- A függő GET megszakítása megvédi-e az L1-es állást? Nem: a mért nyomvonalban nem volt új GET, a régebbi POST válasza írta vissza az állást.
- L2/L3 csak azért marad félbe, mert még nem állt helyre a hálózat? Nem: ugyanabban a futásban az összesítés, illetve az ablak kézi megnyitása elérte a már sikeres végpontot.
- Az L4-et maga a 409-es hibanézet okozza? Nem, a kontroll renderhiba nélkül jelent meg.

## Mit futtattam (parancs + eredmény)

- `git_diff` (stat és célzott diff), `git_log` (érintett utak), `git_show` (két merge, funkcionális ős, base): nincs új javítás a négy érintett adventi helyen.
- `run_browser_scenario .blind-review-tmp/advent-v5-browser.json`: 5 eset végigfutott; L1–L4 reprodukálva, 409 kontroll és fókusz rendben. Az álló és fekvő képernyőképet megnéztem.
- `npx tsx --test` az adventi korlát-, vak2-, kliens-, naptár-, szabály-, kártya-, kiosztás-, szerződés-, Escape- és koppintásfájlokon: 84/84. Az élesítés előtti, PR-C, forrásőr, karácsonyi bank, admin-útvonal és három főoldali tesztfájlon: 50/50. A Chromium-őr külön: 2/2. `npx tsc --noEmit`: 0.
- `run_e2e source/tests/advent-calendar.spec.ts source/tests/advent-home-card.spec.ts source/tests/home-views.spec.ts`: a futtató szerint 47/47; DB eltávolítva.
- `run_db_tests`: 268/268, eldobható PostgreSQL 17 eltávolítva.
- `node .blind-review-tmp/advent-v5-mutation.mjs`: elutasítva a Node-homokozó miatt; nem futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 3 | 3 | 3 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) A késői átvételi válasz visszafesti a megoldott ablakot — `source/client/src/pages/AdventCalendar.tsx:370` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) A kész vendégeredménynél az Újra nem ismétli meg az átvételt — `source/client/src/pages/AdventCalendar.tsx:475` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L4** (közepes) A sorőr átengedheti a kirajzolhatatlan ablakrácsot — `source/server/advent/routes.ts:59` — hivatkozás igazolt; futtatással igazolt (teljes út)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 17 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3293
- tokenek: 1912219 bemeneti (ebből gyorsítótárból: 1743661, gyorsítótárba írva: 168507), 19252 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.6%; becsült megtakarítás: 6.4574 USD
- költség (a tényleges usage alapján): 0.7883 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
