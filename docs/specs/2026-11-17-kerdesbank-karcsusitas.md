# Spec: a játékok kérdésbankjának karcsúsítása (kanban #101)

> Dátum: 2026-11-17 · Szerző: Claude (orkesztrátori megbízás) · Állapot: VÁZLAT — tulajdonosi / orkesztrátori jóváhagyásra vár (kód még nincs)
> Végrehajtás: `docs/specs/2026-11-17-kerdesbank-karcsusitas-vegrehajtas.md`
> Előzmények: #478 (kanban #67, a quiz-bank végpont OOM-javítása: pillanatkép-gyorsítótár, `id:xmin` md5-lenyomat, „legfeljebb egy
> építés”), a kérdésbank-hook memoizálása (kanban #90, `perf/kerdesbank-hook-memo`), kanban #71 / #72 („mindent beolvas” végpontok).
> Megjegyzés: a #101 jegy címe a `material-quizzes` végpontot nevezi meg — a mérés szerint a 25 144 tétel a `quiz-bank` végpontról jön
> (lásd 3.1), a `material-quizzes` kicsi.

## 1. Cél

A Kockavadász és a Szökőár induláskor és adatérkezéskor sem álljon meg, és lassú mobilneten is gyorsan legyen játszható. Ehhez a kliens ne
töltse le minden látogatáskor a teljes, 25 144 tételes (2,86 MB gzip / 10,8 MB) kérdésbankot, és ne szűrje újra azt, amit a szerver már
megszűrt. A tanulási hatás (a játékos évfolyamához illő, változatos kérdés) nem csökkenhet.

## 2. NEM cél

- A közös évfolyam-bank (`client/src/data/gradeQuizBank/grade-03…12.ts`) és a tananyag-kvíz (`/api/games/material-quizzes`) tartalma.
- A kérdés-kiválasztás szabályai (tananyag-elsőbbség → évfolyam-bank → szóbank → a játék saját bankja).
- A #478 pillanatkép-gyorsítótárának átírása (építünk rá, nem cseréljük).
- Az 1. szeletben játéklap (`BlockCraftQuiz.tsx`, `TsunamiEscapeEnglish.tsx`, `WordLadderHuEn.tsx`) módosítása — azokat a #483 / #484
  nyitott PR-ok írják; a lapoldali rész csak azok mainre kerülése után, külön szeletben.

## 3. Mért kiinduló helyzet

### 3.1 Leltár — csak olvasó éles GET-ek, 2026-11-17 (`curl --compressed`)

| végpont | hívó játék (kliens) | tétel | gzip | nyers | `Cache-Control` | ETag |
|---|---|---|---|---|---|---|
| `/api/games/quiz-bank/block-craft-quiz` | Kockavadász (`BlockCraftQuiz.tsx:1341-1348`) | 25 144 | 2 861 283 B | 10 834 377 B | `no-store, no-cache, must-revalidate, max-age=0` | nincs |
| `/api/games/quiz-bank/tsunami-english` | Szökőár (`TsunamiEscapeEnglish.tsx:738-745`) | 25 153 | 2 862 022 B | 10 836 632 B | ugyanaz | nincs |
| `/api/games/quiz-bank/word-ladder-hu-en` | Szólétra (`WordLadderHuEn.tsx:292-299`) | 4 | 452 B | 917 B | ugyanaz | nincs |
| `/api/games/quiz-bank/space-asteroid-quiz` | — (a kliens nem hívja) | 25 144 | 2 861 283 B | — | ugyanaz | nincs |
| `/api/games/quiz-bank/tornado-hunter-200` | — (a kliens nem hívja) | 25 139 | 2 860 732 B | — | ugyanaz | nincs |
| `/api/games/quiz-bank/brain-rot-steal` | — (a kliens nem hívja) | 25 144 | 2 861 279 B | — | ugyanaz | nincs |
| `/api/games/material-quizzes?classroom=0…8&limit=3` | Kockavadász, Brain Rot, Szökőár, Szólétra (hook), Tornado, Űr-aszteroida | 0–336 / évf. | 41 B – 68 505 B | — | ugyanaz | nincs |

A kliens-hívók: `grep -rnoE "/api/games/[a-z-]+" client/src` (2026-11-17). A válasz egy tétele: `id, tier, topic, prompt, options,
correctIndex, explanation, sourceMaterialId` — személyes adat nincs benne (a végpont „Nyilvános”, `server/routes.ts:1213-1214`).

**Miért `no-store`:** a Vercel (`source/vercel.json` „headers” `/api/((?!tts/audio$|lesson-clips/media/).*)`) MINDEN `/api/` válaszra
`no-store`-t tesz, kivéve a TTS-hangot és a klipeket. A Render-szerver maga a quiz-bankra nem tesz `Cache-Control`-t, a köztes réteg
`no-cache, must-revalidate`-et ad („Allow ETags”, `server/index.ts:350-353`), de ETag-et a route nem állít (`server/routes.ts:1214-1237`
kézzel küldi a gzip-puffert). Élő fejlécek: `Server: Vercel`, `X-Render-Origin-Server: Render`, `X-Vercel-Cache: MISS`.

### 3.2 Mit használ ebből egy menet (kód: `BlockCraftQuiz.tsx:1478-1578`, `TsunamiEscapeEnglish.tsx:870-925`)

A kérdés sorrendje mindkét játékban: (1) nem látott tananyag-kvíz (`material-quizzes`); (2) 3–12. évfolyamon a közös évfolyam-bank
(`pickGradeQuiz`, a kliens-csomag évfolyam-darabja, évfolyamonként 285 tétel); (3) angol helyen a szóbank; (4) csak ezek után a játék saját
bankja — ez a 25 144 tételes letöltés. A saját bank tehát lényegében csak akkor kérdez, ha (a) a játékosnak nincs évfolyama, vagy 0–2.
évfolyamos (a közös bank 3–12), vagy (b) egy tárgy évfolyam-készlete egy menetben kimerül. A Kockavadász ráadásul a saját bank minden tételét
`subject: "english"`-ként sorolja be (`BlockCraftQuiz.tsx:1375-1385`), az angol helyen pedig a szóbank előzi meg.

A saját bank évfolyamonkénti tartalma (a `sourceMaterialId` → `/api/html-files` `classroom` megfeleltetéssel, 242 anyag, 0 ismeretlen):

| évf. | tétel | fő témák |
|---|---|---|
| 0 | 718 | Informatika 518, Digitális kultúra 200 |
| 1 | 0 | — |
| 2 | 95 | math 95 |
| 3 | 2 629 | math 1663, english 869, hungarian 97 |
| 4 | 5 745 | nature 2429, english 1488, math 995, hungarian 730, … |
| 5 | 5 313 | nature 1599, hungarian 1126, math 963, Történelem 817, english 597, … |
| 6 | 2 029 | math 836, english 390, Történelem 374, nature 331, hungarian 98 |
| 7 | 489 | Történelem és t. i. 112, Történelem 104, nature 98, Informatika 98, math 77 |
| 8 | 5 652 | nature 2452, Történelem 787, hungarian 696, math 592, … |
| 9 | 2 474 | nature 1673, math 605, hungarian 196 |

### 3.3 Költség a kliensen (mérve, asztali gép, telefonméretű nézet; a #90 mérései és a diagnózis `jelentes.md`)

- Letöltés: Slow 4G-n 16,3 s a játszható állapotig (CPU 4× + Fast 4G: 4,5 s); `JSON.parse` 21–31 ms (1×), 95 ms (4×).
- Főszál a #90 hook-javítása UTÁN is: adatérkezéskor bemenetenként blokk (Kockavadász 1,0 s + 0,95 s, Szökőár 2,3 s + 1,8 s, 1× CPU), mert
  a lapok memója a teljes bankot újraszűri az `isPlayableQuestion`-nel (`BlockCraftQuiz.tsx:1356-1388`, `TsunamiEscapeEnglish.tsx:770-791`);
  a Szökőár indítása 2,6–3,1 s; 4× CPU-n a Kockavadász menüjében egy ~10 s-os feladat.
- Node-mérés a mentett éles bankon (`isPlayableQuestion`, ugyanaz a gép): egy teljes szűrés 329–424 ms, és **25 144 / 25 144 tétel marad
  meg** — a kliensoldali szűrés ezen a bankon 100 %-ban redundáns. WeakMap-gyorsítótárral az első szűrés 371 ms, a második 1,5 ms (0,4 %).
- A szerver ugyanezt már megszűrte: legacy sor `sanitizeRow` → `isPlayableQuestion` (`server/gameQuizBankService.ts:121-122`), kanonikus
  tétel `canonicalLessonQuiz` (`server/studio/canonical-quiz-bank.ts:30`).

## 4. Opciók (rangsor: nyereség / kockázat)

| # | opció | érintett | becsült nyereség | kockázat |
|---|---|---|---|---|
| A | **Évfolyam szerinti szerveroldali szűrés:** `GET /api/games/quiz-bank/:gameId?classroom=N` → csak az N. (és opcionálisan N±1.) évfolyam anyagainak tételei | szerver + a lapok lekérése | a letöltés 10–23 %-ra (3. évf.: 2 629 tétel, ~0,30 MB gzip; legnagyobb a 4. évf.: 5 745, ~0,65 MB — becslés a tételarányból); a kliensoldali szűrés ugyanennyivel olcsóbb | a 0–2. évfolyam és az évfolyam nélküli játékos: kevés tétel (1. évf.: 0) → tartalék kell (évfolyam nélkül: a mostani teljes bank vagy N±1); lapmódosítás kell a paraméterhez → 2. szelet |
| B | **Gyorsítótárazható válasz:** ETag = a #478 meglévő `id:xmin` lenyomata + gameId; `Cache-Control: no-cache` (feltételes kérés) a `no-store` helyett, a `vercel.json` kivételével; `If-None-Match` → 304 | szerver + `vercel.json` | ismételt látogatáskor a 2,86 MB helyett ~0,3 KB (304); Slow 4G-n a játszható állapot ideje a második látogatástól a letöltésnyi résszel csökken (becslés: 16,3 s → néhány s) | a Vercel-proxy a 304-et / ETaget továbbadja-e (UNVERIFIED — mérni kell staging nélkül élesben csak telepítés után); a JS ugyanúgy megkapja a teljes testet → a CPU-költség NEM csökken |
| C | **Az `isPlayableQuestion` eredményének gyorsítótára (WeakMap a tétel-objektumra) a közös `shared/game-quiz-contract.ts`-ben** | közös modul (szerver + kliens) | a lapok MÁSODIK és további szűrése ugyanazon a tétel-objektumon O(1): a tananyag-érkezéskori második blokk (Kockavadász 0,95 s, Szökőár 1,8 s) és a kupon-váltás újraszűrése eltűnik; az első szűrés marad | a függvény tiszta, az objektum nem változik (a lekérdezés-gyorsítótár közös példánya, senki nem módosítja — #90 review 2. pont); memória: WeakMap, a tétellel együtt szabadul |
| D | **A kliensoldali újraszűrés elhagyása** a szerver által már szűrt bankon (a lapok `bank` / `mergedPools` memójában), a memók szétválasztása bemenetenként, `staleTime` a Kockavadász bank-lekérdezésére | a lapok | az első szűrés is eltűnik (1,0 / 2,3 s → ~0); a 4× CPU-s 10 s-os menüblokk fő része | lapmódosítás (#483 / #484 után); ha a szerver egyszer szűretlen adatot adna, a kliens nem védene → a szerver-oldali szűrést teszt őrizze |
| E | **Lusta letöltés:** a saját bankot csak akkor kérni, ha tényleg kell (évfolyam nélkül / 0–2. évf. / az évfolyam-bank kimerült) | a lapok | 3–12. évfolyamon a menetek többségében 0 B letöltés és 0 ms szűrés | lapmódosítás; az első saját-banki kérdésig a letöltés késhet → előtöltés üresjáratban |
| F | **Mezők karcsúsítása** (pl. a `tier` / `sourceMaterialId` rövidítése) | szerver + lapok | ~10–15 % (becslés) | adatszerződés-váltás, kis nyereség → nem javasolt |

Ellentmondás / bizonytalanság: a B nyeresége csak telepítés után mérhető (a Vercel viselkedése a rewrite-olt `/api` ETagjével UNVERIFIED);
az A-nál a 0–2. évfolyam tartaléka tulajdonosi döntés.

## 5. Szeletek

- **S1 (nem érint játéklapot; szerver + közös modul):** B (ETag + `no-cache`, `vercel.json` kivétel a `quiz-bank`-ra) és C (WeakMap az
  `isPlayableQuestion`-ben), valamint az A szerveroldali RÉSZE (`?classroom=` paraméter, alapértelmezés változatlan, hogy a mostani kliens
  ugyanazt kapja). Önmagában mérhető: ismételt látogatáskor 304, adatérkezéskor a második blokk eltűnik; a paraméteres végpont a mérőszkripttel
  (`source/scripts/perf/measure-game-frames.mjs`) még a lapváltozás előtt lemérhető.
- **S2 (a #483 / #484 mainre kerülése után; lapok):** D + az A kliensoldali része (a lap a saját évfolyamát kéri, tartalékkal) + a Kockavadász
  bank-lekérdezésének `staleTime`-ja.
- **S3 (opcionális, S2 mérése után):** E (lusta letöltés), ha az S2 után is marad mérhető letöltési / indulási költség.

## 6. Tanulási hatás

- A saját bank 3–12. évfolyamon a negyedik forrás (3.2), ezért az A / E a kérdezett tartalmat a menetek többségében nem változtatja.
- A szűrt bankban évfolyamonként a legkevesebb a 7. évfolyamon (489 tétel) és a 2. évfolyamon (95 tétel); az 1. évfolyamon 0 → az A tartaléka
  kötelező: ha a kért évfolyamra a tételszám a minimum alatt van, a válasz N±1-gyel, végül a teljes bankkal bővül.
- Minimum (levezetett, nem forrásból): tárgyanként ≥ 4 × az ismétlés-ablak (`RECENT_WINDOW` 16, `BlockCraftQuiz.tsx:1404`) = 64 tétel, és
  összesen ≥ 200 tétel évfolyamonként; ez alatt bővítünk. Ellenőrzés: egységteszt a szerveroldali szűrőre minden évfolyamra a mentett éles
  pillanatképből.

## 7. Elfogadási kritériumok (EARS)

- AC1 (S1): WHEN a kliens ugyanazt a quiz-bankot másodszor kéri, és a bank nem változott THEN the server SHALL 304-et adni test nélkül
  (`If-None-Match` = a korábbi ETag), AND a bank bármely változása (Stúdió-közzététel, javítás) után SHALL új ETaget adni (a #478 lenyomata).
- AC2 (S1): WHEN a `quiz-bank` választ a Vercel kiszolgálja THEN a `Cache-Control` SHALL `no-cache` (nem `no-store`) legyen, a többi `/api`
  útvonalé változatlan.
- AC3 (S1): WHEN ugyanazt a tétel-objektumot többször ellenőrizzük az `isPlayableQuestion`-nel THEN az eredmény SHALL azonos legyen a
  gyorsítótár nélkülivel (bájtra azonos szűrés a mentett éles bankon), és a második szűrés ideje SHALL ≤ 5 % az elsőének.
- AC4 (S1): WHEN a `?classroom=N` paraméter hiányzik THEN a válasz SHALL bájtra azonos legyen a mostanival; WHEN érvényes (0–12) THEN SHALL a
  10.1 bővítési szabály szerinti évfolyam(ok) tételeit adni (≥ 200 tétel, különben a teljes bankot), a teljes válasz sorrendjében; WHEN
  érvénytelen THEN SHALL 400-at adni gyorsítótár-bejegyzés nélkül.
- AC8 (S1): WHEN két különböző munkamenet (és egy névtelen) kéri ugyanazt THEN a test és az ETag SHALL bájtra azonos legyen; MELEG
  állapotban a 304-es kérés SHALL NOT indítson építést (építés-számláló változatlan); hideg példányon az első feltételes kérés építhet.
- AC9 (S1, review K2): WHEN egy anyag évfolyama változik (akár csak az `html_files` sorban) THEN a változat ETagje SHALL megváltozni a
  következő kérésre; a teljes bank ETagje, ha a tartalma nem változott, SHALL NOT.
- AC5 (S2, kihajtott nézet 827×896 dpr 2,625, 1× CPU): adatérkezéskor és az Indítás után SHALL NOT legyen 200 ms-nál hosszabb főszál-feladat;
  4× CPU-n a menüben SHALL NOT legyen 1 s-nál hosszabb.
- AC6 (S2, Slow 4G emuláció, telefonnézet): a játszható állapot (Indítás gomb aktív, első kérdés feltehető) SHALL ≤ 5 s legyen az első
  látogatáskor (alapvonal: 16,3 s), és ≤ 3 s az ismételt látogatáskor.
- AC7: a tanulási hatás: minden évfolyamra a menet első 30 kérdésében a kérdések évfolyam-megfelelése SHALL NOT csökkenjen a mostanihoz képest
  (mérés: a szimulációs vagy a mérőszkriptes futás kérdésnaplója).

## 8. Tesztterv

- S1: szerver-egységteszt az ETag / 304 ágra (azonos lenyomat → 304; új lenyomat → 200 új ETaggel; `Accept-Encoding` nélküli ág);
  `vercel.json`-őr (a `quiz-bank` kivétel, a többi `/api` `no-store` marad); `isPlayableQuestion` gyorsítótár-teszt (azonosság a mentett éles
  bankon, mutációs ellenpróba: a gyorsítótár rossz kulccsal bukik); `?classroom=` szűrő-teszt évfolyamonként a mentett pillanatképpel
  (minimum-tartalék, 1. évfolyam → bővítés).
- S2: a lapok e2e-je (a meglévő Kockavadász / Szökőár specek + a közös mobil mérő), mérőszkriptes ELŐTTE / UTÁNA kihajtva és Slow 4G-n.

## 9. Kockázatok / visszavonás

- ETag és Vercel: ha a proxy a 304-et nem engedi át, az S1 B-része hatástalan, de nem árt (visszavonás: a `vercel.json` kivétel törlése).
- A WeakMap-gyorsítótár hibás lenne, ha valaki egy tétel-objektum `prompt` / `options` mezőjét helyben módosítaná; ilyen kód ma nincs (#90
  review), az S1 teszttel és megjegyzéssel rögzíti.
- Évfolyam-szűrés: rossz `classroom`-adat egy anyagon → a tétel rossz évfolyamra kerül; a tartalék-szabály és a mostani teljes-bank
  alapértelmezés véd.

## 10. Döntések (orkesztrátor, 2026-11-17 — a terv JÓVÁHAGYVA)

1. **S1 tartalma:** (a) B + C + az A szerveroldali része egy PR-ban.
2. **Kevés tétel:** (a) bővítés a szomszédos évfolyamokkal, végül a teljes bank.
3. **E (lusta letöltés):** (a) az S2 mérése után döntünk.

### 10.1 Az S1 rögzített részletei (a megvalósítás előtt)

- **Gyorsítótár-fejléc:** `Cache-Control: no-cache` + gyenge `ETag` (a kitömörített válasz SHA-1-éből), `Vary: Accept-Encoding`. Indok:
  a bank a tananyaggyártás / javítás / okosítás minden közzétételekor változik (naponta többször), a #478 lenyomata minden írásra
  érvénytelenít. A `max-age` (akár rövid) ezalatt régi bankot adna; a `no-cache` minden használatkor feltételes kérést kér, a változatlan bankra
  304 megy (test nélkül), a változottra azonnal az új. Az ETag a tényleges test kivonata (nem a lenyomat), így a `?classroom=` változatnál és a
  15 perces újraépítésnél is pontos (azonos tartalom → azonos ETag). Gyenge, mert a gzip és a kibontott alak ugyanazt a tartalmat jelenti.
- **304 költsége:** ugyanaz a szerveroldali út, mint a 200-é (egy könnyű lenyomat-lekérdezés + a kész pillanatkép), csak a 2,86 MB nem megy
  ki. MELEG állapotban új építést nem indít; HIDEG példányon (újraindítás, telepítés, 15 perces lejárat, új lenyomat) az első feltételes
  kérés is épít, mert az ETag a kész test kivonata — ugyanannyiba kerül, mint egy 200-as, és a „legfeljebb egy egyidejű építés” szabály alatt
  fut (review #101 A1).
- **Lenyomat (review #101 K2):** a #478 lenyomata kiegészül az `html_files` `id:classroom` párjaival — egy régi (lecke nélküli) anyag
  áthelyezése csak ezt a sort írja, és a változat ebből számol. Más `html_files`-oszlop írása nem érvénytelenít.
- **Hibaválasz (review #101 A4):** a 400 / 500 / ismeretlen játék válasza a route-on `no-store`; a Vercel a quiz-bank útvonalra minden
  státuszon `no-cache`-t tesz (nem gyorsítótárazható frissesség nélkül — tájékoztató).
- **Felhasználó-függetlenség:** a route nem olvas munkamenetet / sütit / felhasználót; teszt: két különböző munkamenettel és névtelenül bájtra
  azonos test és ETag.
- **`?classroom=`:** hiányzik → a mostani teljes válasz (bájtra azonos). Érvényes: egész `0…12`. Bármi más (`abc`, `-1`, `13`, `1.5`, ismételt
  paraméter) → **400**: a hibás kliens-kérés így látható (nem kap csendben 10 MB-ot), és nem keletkezik gyorsítótár-bejegyzés (nincs
  gyorsítótár-szennyezés / -mérgezés érvénytelen kulccsal). Bővítés (determinisztikus): `{N}`, ha legalább `MIN_CLASSROOM_ITEMS` (200) tétel;
  különben `{N−1, N, N+1}` az 1–12 sávra vágva, ha legalább 200; különben a teljes bank. A 0. sáv (Programozási alapismeretek,
  `shared/classrooms.ts`) nem évfolyam: nem szomszédja az 1.-nek és nem is bővül vele (review #101 K1 — a korábbi szabály és tesztje az
  1. évfolyamba 88 % programozási tételt kevert; HIBÁS ELVÁRÁS JAVÍTÁSA, nem lazítás). (A korábbi „tárgyanként ≥ 64” feltétel elmarad: a
  bank `topic`-ja szabad szöveg, és a Kockavadász a saját bank minden tételét egy tárgyba sorolja — 3.2.) A változat a teljes válasz
  részhalmaza, ugyanabban a sorrendben; anyag nélküli lecke tétele csak a teljes bankban van. A nem kupon-játék (Szólétra, 4 tétel) a
  paramétert figyelmen kívül hagyja. A változatok pillanatképenként gyorsítótárazódnak (legfeljebb 13 × 6 kulcs), single-flight-tal.
- **`isPlayableQuestion` gyorsítótár:** `WeakMap` az objektum-identitásra; a bejegyzés a `prompt`-ot, az `options` tömb referenciáját és hosszát,
  valamint a `correctIndex`-et is tárolja, és találatkor összeveti — helyben módosított tétel így újra kiértékelődik (őr). A szerver is
  ugyanezt a függvényt hívja (`sanitizeRow`, `canonicalLessonQuiz`): ott minden lekérdezés új objektumot ad, a bejegyzések a sorokkal együtt
  szabadulnak (WeakMap), tartós memória nem keletkezik.
- **Mit hoz az S1 önmagában a kliensen:** (1) a C a lapok második, adatérkezéskori szűrését teszi ~0-vá (a tananyag megérkezésekor a lap a
  MÁR ellenőrzött tétel-objektumokat szűri újra: Kockavadász 0,95 s, Szökőár 1,8 s → mérendő); (2) a B ismételt látogatáskor a letöltést
  304-re cseréli — csak telepítés után mérhető. Az első szűrés (1,0 / 2,3 s) és a `?classroom=` kliensoldali haszna az S2-ben jön: a
  quiz-bankot a lapok közvetlenül kérik (`BlockCraftQuiz.tsx:1341`, `TsunamiEscapeEnglish.tsx:738`), nem hook — lap érintése nélkül nem
  kérhető évfolyam szerint.
