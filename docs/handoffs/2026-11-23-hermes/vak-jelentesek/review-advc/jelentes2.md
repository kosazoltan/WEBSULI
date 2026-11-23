# Független review — feat/advent-c-felulet-es-elesites
Fej: 058986b73ef368d21cb6b341f9ce5db1ec484fb2
## Ítélet: NEM
Alanyváltás után a korábbi tanuló késve megérkező kérdése újranyílhat. Emellett egy későn befutó állapotolvasás visszafesthet egy megoldott ablakot. Mindkettőt reprodukáltam a böngészőben. A nyilvános kapcsolók maradjanak KI állásban; a tulajdonosi próba (D-11) külön élesítési kapu.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — blokkoló: alanyváltás után újranyílik a régi alany kérdése
`source/client/src/pages/AdventCalendar.tsx:217–220`. Közös telefonon az egyik gyerek lassú hálózaton ablakot nyit. Közben a másik gyerek saját linkje egy másik fülön megváltoztatja a párosítást. Már az új alany rácsa látszik, amikor a régi kérdés felugrik és fókuszt kap. Megoldott ablak újranyitásakor ugyanez az ág a régi `answered` eredményt is átadja a dialógusnak.

**Evidencia és cáfolat:** a 143–147. sor tényleg bezárja a már nyitott dialógust generációváltáskor, a 253. sor védi a válaszbeküldés eredményét. A függő `openDoor` egyik őr alatt sincs. A saját 360×640-es próbában 2400 ms-mal késleltettem a nyitási végpontot, közben a produkcióban is figyelt, tokent nem hordozó alanyváltási eseményt küldtem. Az új generáció rácsa után a prompt „Az előző alany kérdése”, a fókusz `advent-question-text` lett. Valós böngészős kódút, mockolt végpontokkal, valódi tanulói adat nélkül. A §22.13 generációs cache-kulcsa nem védi a dialógus helyi állapotát.

**Javítás:** a művelet és az újrapróba legyen az indító generációhoz kötve. Váltás után sem eredmény, sem hiba, sem a régi `finally` ne módosítsa az új nézetet. Teszt késleltetett nyitással és a 429-es várakozás közbeni váltással.

### L2 — közepes: a késői GET felülírja a már megjelenített sikeres választ
`source/client/src/pages/AdventCalendar.tsx:257–259`, `source/client/src/advent/useAdvent.ts:117–125,133–137`. Éjfélkor a nyitott lapon elindul egy időzített GET. A válasz beküldése előtti pillanatképet olvassa, de lassabban érkezik meg, mint a sikeres POST. A gyerek látja a helyes választ és a világító ablakot; a „Tovább” után ismét nyitható az ablak és visszalép a számláló. DB-adatvesztést nem igazol ez a próba.

**Evidencia:** saját 844×390-es próbában a késleltetett GET 3500 ms múlva hozta a régi állást. A POST teljes ablaklistája után `1 / 24 világít`, `solved`; a GET után `0 / 24 világít`, `open`. A teljes lista és a generációs kulcs nem védi az azonos alany pillanatképeinek sorrendjét (§22.6, §22.14).

**Javítás:** a függő, régebbi olvasás ne írhassa felül a sikeres írást. Szerveroldali monoton verzióval a fordított válaszsorrend is kezelhető; a nyitási időt és fázist is egyeztetni kell, hogy egy frissített eredmény ne zárhassa vissza a frissen nyílt ablakot.

### L3 — közepes: az előtérben hagyott naptár nem vált át január 7-én éjfélkor
`source/shared/advent/calendar.ts:83–86`, `source/client/src/advent/useAdvent.ts:129–138`. Január 6-án éjfél előtt a gyerek nyitva hagy egy javítható naptárat. Éjfél után a szerver már elutasítja az írást, a felület a következő sikeres állapotolvasásig mégis javítást kínál. A `catchup` ág mindig `nextOpensAt: null` értéket ad, erre a hook nem indít időzítőt; az előtérben hagyott lapon a fókuszfrissítés sem fut. Az e2e januári esete újratölt (`source/tests/advent-calendar.spec.ts:393–395`). Kódon igazolt, külön böngészős határátlépés nélkül. **Javítás:** a szerver a fázisváltásig hátralévő időt is adja meg; teszt január 6. → 7. átmenetre újratöltés nélkül.

### L4 — közepes: az érvényes új link másik fülön nem oldja fel a régi fül írási tiltását
`source/client/src/pages/AdventCalendar.tsx:135–147,199–207,305–311`; `source/client/src/lib/learnerProfile.ts:62–65`; `source/client/src/advent/sync.ts:85–92`. A felület új linket kér, a gyerek új fülön nyitja meg. A `localStorage`-token közös, a régi fül `sessionStorage`-jelzője viszont megmarad. A régi fül új generációra vált, de az effektus csak az `invalid` irányt kezeli, `pairing: ok` esetén sem oldja fel a tiltást. Ha a gyerek ezen a fülön a felkínált „Folytatom vendégként” gombot nyomja, az a frissen eltárolt közös tokent is törli. Kódút ellenőrizve; valódi kétfüles újrapárosítást nem futtattam. **Javítás:** az aktuális generáció igazolt `pairing: ok` eredménye törölje a régi tiltást; a vendég gomb csak a figyelmeztetés generációjára hasson.

### L5 — kicsi: 360 px-en a cím és a csillag levágódik
`source/client/src/advent/advent.css:64–65`, `source/client/src/pages/AdventCalendar.tsx:404–407`. A saját 360×640-es álló képen a rács kifér, de „Adventi nap…” látszik, csillag nélkül. A csillag az egysoros, `overflow: hidden` címen belül van; felgyulladáskor a stílusa változik, helye nem. Az A43 teszt az attribútumot és számított stílust méri, nem a levágást (`source/tests/advent-calendar.spec.ts:361–381`). **Javítás:** önálló, nem zsugorodó hely a csillagnak, törhető cím vagy rövidebb fejlécgomb; mobilteszt a felgyulladt csillag tényleges láthatóságára.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba, L2.** A `pick`, `recorded`, `door`, `doors`, `summary`, `closing` mezők egyeznek (`contract.ts:90–107`, szerver `routes.ts:138–140`), de a kliens régi állásra cserélheti a teljes listát. `question: null` / `correctIndex: -1` szerver- és kliensoldalon tesztelt; 409 `corrupt` és `pairing: invalid` külön út; a szerver 429-re `Retry-After`-t ad.
2. **Biztonság és adatvédelem — talált hiba, L1/L4.** Az adventi API azonosítói fejlécbe/törzsbe kerülnek, a közös request-napló nem naplóz teljes választ (`source/server/index.ts:470–486`). A meglévő személyes `?t=` levéllink külön baseline-szerződés. A router a közös CSRF-őr után van; DB-teszttel ellenőrzött token nélküli 403 és mellékhatásmentes GET (`advent-routes-db.integration.ts:984–999`). A nyitási kérdés DTO helyes index/magyarázat nélküli; a nyilvános bank nem titkos (§16.7). A tesztfejléc hatástalanságát éles módú HTTP-teszt mérte.
3. **Regresszió — a vizsgált utakon nem sikerült megtörni.** Home-lista, kártyastílus, játékkatalógus, tanulói profil és párosító levél célzott tesztje zöld. A Games és HomePracticeGames nincs a diffben. A lazy kártya és route feltételes; a KI build artifact külön nem futott (az e2e fejléc nélküli szerverállapot ezt nem helyettesíti).
4. **Europe/Budapest — talált hiba, L2/L3.** A dátumfüggvény és a december 4. → 5. automatikus nyitás tesztje zöld; a januári évadátvitel és a szerver zárása helyes, de a nyitva maradt kliens zárási frissítése hiányzik.
5. **Migráció, indítás, e2e — a futtatott utakat nem sikerült megtörni.** A diff nem változtat sémát/migrációt, az eldobható PG17-es séma- és takarítótesztek zöldek (`advent-db.integration.ts:35,158`); a harness eltávolította az adatbázist. Éles cron és előnézet nincs igazolva.
6. **Párhuzamosság, ismétlés, megszakítás — talált hiba, L1/L2.** A második zárolt DB-olvasás az első két átvétel mindkét megoldását megőrzi a követett tesztben. A tárolt válasz ismétlése idempotens (`routes.ts:454–459`). A kliens párhuzamos kérései ettől még hibásan jelenhetnek meg; elveszett vagy duplán mentett DB-választ nem mértem.
7. **Tesztminőség — vegyes.** A 24/24 és 22→23 e2e a látható eredményt, a DB-próba a valódi tranzakciót méri. A generációs egységteszt segédfüggvényt és forrásmintát néz, a késve érkező `openDoor`-t nem (`advent-pr-c-vak.test.ts:133–150`); L1 a zöld csomag mellett áll elő. A §22.11 szerinti tesztváltozást dokumentálták. Saját védősor-mutációt előkészítettem, de a Node-sandbox elutasította, így nincs mutációs eredmény.
8. **Feladatspecifikus ellenőrzés:**
   - **8a / §22.1–3, 7–8, 10–13, 15–17:** friss profilévfolyam és `retired` a szerverágban; párosított olvasás egy pillanatképből, lezárva mentett állás. Az integrációs esetek fedik a rögzítetlen évfolyamot, két párhuzamos első átvételt, hiányzó napkulcsot, kifejezett idempotens `/adopt`-ot és a visszagörgetést. Alanyváltás/újrapárosítás: L1/L4.
   - **8b / A1–A15, A17–A18:** 24 számozott ablak; négy opció, stabil újranyitás, eltérő alanyterv, visszajelzés, legfeljebb két javítás, körváltás és évfolyamrögzítés követett tesztben. A szó szerinti üzenet 24/24 és 23/24 mellett megjelenik, 22/24-nél nem. A statisztikák, a szezon előtti és az üres lezárt szöveg zöld. Dátumhatárok: szerver zöld, élő kliensnél L2/L3. **A16:** flagtől független admin előnézet nincs bekötve (S6/D-11). **A19–A24:** lásd 1–5. **A25:** külön S5, nincs bekötve.
   - **8b / A33–A36, §22.9, 11, 15:** a valódi készlet validátora és a kiosztás zöld; a legrégebbiekből ismétlés DB-esete megnyitja mind a 24 ablakot és ellenőrzi az ismétlődő halmazt. Az összes többes átvételi kombinációt nem merítettem ki. **A37–A39:** külön S8, nem futtattam küldést.
   - **8c–8d / A19–A24, A49–A53, §22.4–6, 14, 16–17:** CSRF, DTO, napló, 429-fejléc, e2e óra, sérült mentés és szövegek vizsgáltak. Átmeneti 5xx nem hiteles „KI”, a kártya marad a zöld teszt szerint; a GET/POST sorrend L2, zárás L3, újrapárosítás L4. **A50:** külön S5.
   - **8e / A26–A32, A40–A48, §22.18:** a mobiltesztek méretet, koppintást, fókuszt, Escape-et, csökkentett mozgást és CLS-t mértek. Saját álló képen nem fedték egymást a gombok, de a fejléc vág (L5); a fekvő évfolyamválasztó `scrollHeight` = `clientHeight` = 390. A hosszú kérdés belső görgetése a követett tesztben elérhető. A44–A46: Hero alatti kártya, egy koppintás meglévő évfolyammal, játéklistán nincs. A47: első látogatáskori CLS zöld három méreten; végleges banner nincs. A48: a régi Home e2e spec-ek nem futottak külön. A40: helyőrzők, üres manifest; A41: végleges bájtok/fejlécek nem mérhetők; A42: hálózatmentes képtervező tesztek zöldek; A43: L5. A31: forrásőr zöld, gzip-méret UNVERIFIED.
   - **8f:** 55 e2e és 262 DB-körös eset zöld, köztük valódi koppintás és léptetett óra. A két reprodukált versenyt nem fedik. Nem indítottam valódi e-mailt vagy képgenerálást.
9. **Egyéb — talált hiba, L5.** Ellenőriztem az álló és fekvő képeket; a csillag DOM-jelenléte nem igazolja, hogy látszik. Végleges illusztrációk nélkül a tulajdonosi grafikai cél nem ítélhető meg.

## Mit próbáltam megtörni, és nem sikerült
- Két első vendégátvétel egy tanulóhoz; elutasított írás az átvételben. A DB-tesztben mindkét sikeres megoldás megmaradt, elutasításnál egyik sor sem módosult.
- 95%-os határ, harmadik hibás próbálkozás, ismételt válasz és eltűnt kérdés: a követett próbákban nem lett túl korai ajándéküzenet vagy újabb javítás; a tárolt eredmény megmaradt.
- Normál Escape/fókusz, novemberi és januári betöltés, e2e-mód fejléccel és anélkül: a követett próbák a várt eredményt adták. A késői alanyváltás ettől külön út (L1).

## Mit NEM vizsgáltam
- Éles Render/Vercel, iOS/Safari, valódi telefon és tulajdonosi jóváhagyás: **UNVERIFIED**. A flagtől független előnézet S6-függőség: `source/client/src/App.tsx:109` a publikus route-ot a build-flaghez köti, `source/server/routes.ts:894–901` csak a publikus routert csatolja. Nem kapcsoltam be semmit.
- Végleges WebP-k, immutable fejlécek, lusta darab gzip-mérete, S5/S8 levél és éles cron/leállítás: nem kész szállítmányok vagy nincs ellenőrzött artifact. A helyőrzők nem igazolják a tulajdonos grafikai célját.
- KI kliensbuild és saját Node-mutáció eszközkorlát miatt nem futott. A régi Home/Stúdió/játékok teljes böngészős regressziós köre és L3/L4 külön böngészős reprodukciója kimaradt; utóbbiak kódevidencián alapulnak.

## Megcáfolt gyanúk
- A lezárt naptár nem mutat mentetlen vendégegyesítést: a páros olvasás csak írható fázisban fut (`routes.ts:344–357`); a januári DB-teszt a mentett állást látja.
- A késői GET nem ugyanarra a query-kulcsra kerül alanyváltás után: a kulcs generációs és a GET lemondható. Ez nem védi a helyi dialógust (L1) vagy az azonos alany időrendjét (L2).
- A csillag nem a megfeleléstől függ: a 22/24 melletti felgyulladás tesztje zöld; a levágás külön hiba (L5).

## Mit futtattam (parancs + eredmény)
- `npx tsx --test`: 11 célzott adventi tesztfájlon **96/96**; külön a bank-, kép-, végpont-, Home-, profil- és levélőrteszteken **70/70**.
- `npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`: mindkettő 0.
- `run_db_tests`: eldobható PG17, **262/262**, DB eltávolítva.
- `run_e2e source/tests/advent-calendar.spec.ts source/tests/advent-home-card.spec.ts source/tests/advent-robustness.spec.ts`: **55/55**, DB eltávolítva.
- `run_browser_scenario .blind-review-tmp/advent-review2.json`: két mobilnézet, L1 reprodukció és képek. Az első `advent-review.json` formailag hibás volt, nem futott.
- `run_browser_scenario .blind-review-tmp/advent-state-race.json`: 844×390, L2 reprodukció és képek. A runner 0-ja a lépések sikerét jelenti, nem az állapotátmenet helyességét.
- `node .blind-review-tmp/advent-review-checks.mjs`: a Node-verzió hálózati korlátozásának hiánya miatt elutasítva. `npm run build:client`: nem engedélyezett. Egyikből sincs mérési eredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 1 | 0 | 0 |
| közepes | 3 | 3 | 1 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A régi alany késve megérkező kérdése újranyílik alanyváltás után — `source/client/src/pages/AdventCalendar.tsx:220` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L2** (közepes) Késői GET visszaírja a megoldott ablakot nyithatóra — `source/client/src/pages/AdventCalendar.tsx:259` — hivatkozás igazolt; futtatással igazolt (teljes út)
- **L3** (közepes) Január 7. éjfélkor az előtérben maradt lap nem frissül lezártra — `source/shared/advent/calendar.ts:84` — hivatkozás igazolt
- **L4** (közepes) Másik lapon sikeres újrapárosítás nem oldja fel a lejárt link tiltását — `source/client/src/pages/AdventCalendar.tsx:136` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 24 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3482
- tokenek: 3628505 bemeneti (ebből gyorsítótárból: 3397721, gyorsítótárba írva: 230712), 28244 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.9%; becsült megtakarítás: 12.6806 USD
- költség (a tényleges usage alapján): 1.1991 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
