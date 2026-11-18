# Terv — a játék-kérdésbank végpont memória- és időigénye (kanban #67, havi audit T1)

**Állapot:** folyamatban – 2026-11-16, ág `fix/quiz-bank-memoria`
**Forrás:** független havi audit 2026-11-16, T1 (`scratchpad\audit-honap\jelentes.md` 0., 2.1, 4.1, 5. rész): a
`GET /api/games/quiz-bank/:gameId` élesben 8–18 s, a Render-példány (0,5 CPU / 512 MB) memóriája 469 MB-ig fut, és
2026-11-16 20:52:53Z-kor `Reached heap limit` miatt összeomlott (30–60 s kiesés).

## 1. Cél

- A végpont válaszideje meleg állapotban ≤ ~200 ms, hidegen ≤ ~2 s (300 lecke), a memória-többlet kérésenként
  elhanyagolható, és 10 párhuzamos kérés NEM sokszorozza a munkát.
- A válasz ALAKJA és TARTALMA a kliens felé nem változik (ugyanazok a kérdések, ugyanabban a sorrendben).
- Védőháló: valódi Postgres-teszt, amely megbukik, ha a végpont újra a leckék számával arányosan dolgozik kérésenként.

## 2. Nem-cél

- Séma / migráció / index (javaslat a 8. pontban).
- A játékok lapjai (#466, `fix/e2e-ingadozok-2`, `fix/jatek-jm3a2-utomunka` érinti őket) — a kliens nem változik.
- A válasz méretének csökkentése (kliens-szerződés; mérve, külön döntés — 7. pont).
- A többi, hasonló mintájú végpont javítása, kivéve a tanmenet-betöltőt (5.4), amely ugyanez a minta és kicsi.

## 3. Alapvonal — HELYBEN mérve, javítás előtt (`5cb3cd3e`)

Eldobható `postgres:17` (loopback), a valódi séma (`drizzle-kit export`); 300 közzétett anyag × 2 közzétett verzió =
600 lecke-sor, soronként ~194 kB JSON (a `standardFusionFixture` 98 kvízkérdéssel, a fejezetek ismétlésével a valós
~160–200 kB-os méretre töltve). Mérő: `scratchpad\quiz-bank\measure.mts` (`node --expose-gc`, a szolgáltatás-út +
a route JSON-leképezése; a heap 2 ms-onként mintavételezve).

| Eset | Teljes idő | Lekérdezés | Csúcs heap (előtte → csúcs) | Heap-többlet | Csúcs RSS |
|---|---|---|---|---|---|
| 1 kérés, hideg | 2 795 ms | 2 | 29 → 470 MB | **+440 MB** | 640 MB |
| 1 kérés, „meleg” (nincs gyorsítótár) | 2 458 ms | 2 | 30 → 504 MB | +474 MB | 701 MB |
| 10 párhuzamos | **25 860 ms** | 20 | 30 → **2 864 MB** | +2 834 MB | 3 322 MB |
| 10 párhuzamos, újra | 41 737 ms | 20 | 31 → 2 500 MB | +2 470 MB | 2 767 MB |

Válasz: 29 400 tétel, **10,3 MB** JSON (tömörítetlen) játékonként. Egyetlen kérés heap-többlete (+440 MB) már
önmagában meghaladja a Render-példány ~256 MB-os V8-halmát — ez egyezik az éles OOM-mal.

## 4. Gyökérok (fájl:sor, `5cb3cd3e`)

1. `source/server/gameQuizBankService.ts:47-52` `publishedBanks()`: `SELECT id, json, html_file_id, version FROM lessons
   WHERE published_at IS NOT NULL ORDER BY version DESC, published_at DESC` — MINDEN közzétett sor (minden verzió) TELJES
   `json`-ja egyetlen eredményben, deszerializálva a memóriában. A `canonicalBanks()` (`studio/canonical-quiz-bank.ts:45-61`)
   anyagonként csak az ELSŐ (legfrissebb) sort használja, a többit eldobja — a régebbi verziók beolvasása tiszta veszteség.
2. A felhasznált rész: `canonicalLessonQuiz()` (`canonical-quiz-bank.ts:24-42`) a teljes leckét `lessonSchema.safeParse`-szal
   ellenőrzi (érvénytelen lecke → üres bank), és csak az `experience.quiz` + `subject` mezőket használja.
3. Gyorsítótár nincs: `listGameQuizBank()` (`gameQuizBankService.ts:71-88`) minden kérésnél újraépít, a párhuzamos kérések
   egymástól függetlenül (10 kérés = 10× teljes beolvasás). A route (`server/routes.ts:1212-1238`) minden kérésnél
   újra JSON-ná alakítja a 10 MB-os választ, a `compression` köztes réteg pedig minden kérésnél újratömöríti.
4. Hívók: `TsunamiEscapeEnglish.tsx:739` (`staleTime` 10 perc), `BlockCraftQuiz.tsx:1342` (a globális 30 s),
   `WordLadderHuEn.tsx:293` (nem kupon-játék, a nehéz ág nem fut). Oldalbetöltésenként 1 hívás. A Space Asteroid és a
   Tornado a `material-quizzes` végpontot hívja (`useMaterialQuizzes`, 5 perc), amely ugyanazt a `publishedBanks()`-t
   futtatja 3 anyagra (minden verziójukkal) — kisebb, de ugyanaz a minta.
5. Mióta: a kód 2026-09-11 óta így működik; a régi anyagok Stúdió-leckévé alakítása óta (242 anyagból 238 lecke) nőtt a
   sorok száma és mérete akkorára, hogy a halom betelik.

## 5. Megoldás

### 5.1 Szűk, kötegelt betöltés (a memória-csúcs gyökéroka)
`loadPublishedCanonical(materialIds?)`: (a) könnyű lekérdezés `DISTINCT ON (coalesce(html_file_id, id))` a legfrissebb
közzétett sorra (verzió, majd közzététel szerint) — `json` nélkül; (b) a kiválasztott sorok `json`-ja 16-os kötegekben,
kötegenként feldolgozva (`canonicalLessonQuiz`) és azonnal eldobva. A kiválasztás és a kimenet sorrendje azonos a
mostanival (verzió csökkenő, közzététel csökkenő). A teljes `lessonSchema`-ellenőrzés marad (a viselkedés nem változik).
A `material-quizzes` ugyanezt használja (3 anyag → legfeljebb 3 `json`).

### 5.2 Kész válasz gyorsítótára, ujjlenyomattal érvényesítve
- Folyamaton belüli pillanatkép: a 6 engedélyezett játék KÉSZ válasza gzip-tömörített `Buffer`-ként (a nyers JSON nem
  marad meg). Egyetlen pillanatkép él → a méret szerkezetileg korlátos (≤ 6 bejegyzés; a gzip ~1/7-e a nyersnek); a
  becsült bájtméretet naplózzuk, 32 MB fölött figyelmeztetés.
- Érvényesítés minden kérésnél egy könnyű lekérdezéssel: a közzétett `lessons` és az engedélyezett játékok
  `game_quiz_items` sorainak `id:xmin` ujjlenyomata (md5). A Postgres minden INSERT / UPDATE / DELETE-nél új `xmin`-t ad
  a sornak, így BÁRMELY írás — a Stúdió közzététele, javítás / okosítás, `setMaterialClassroom`, régi anyag migrációja,
  borítókép-szkript, kézi SQL, más folyamat — érvényteleníti a gyorsítótárat, írási pontonkénti kód nélkül. A `json`
  oszlopot ez a lekérdezés nem olvassa (TOAST), a költsége ~300 + N kis sor fejléce.
- Időalapú lejárat biztonsági hálóként: 15 perc.
- Egyidejű hideg kérések összevonása (single-flight): azonos ujjlenyomatra egyetlen építés fut, a többi azt várja.
  Építés közbeni írás: az új ujjlenyomat új építést indít; a régi eredmény nem írja felül az újat.
- A route a tömörített `Buffer`-t küldi (`Content-Encoding: gzip`, `Vary: Accept-Encoding`); a `compression` réteg a
  már kódolt választ nem tömöríti újra. Gzip-et nem fogadó kliensnek kibontva megy (ritka).
- HTTP-gyorsítótár (ETag / max-age) NEM készül: a `vercel.json` minden `/api/*` válaszra `no-store`-t tesz (C-24).
- A kliens `staleTime`-ja nem változik: a Tsunami 10 perc, a `useMaterialQuizzes` 5 perc; a BlockCraft a globális
  30 s-ot használja, de a lapjához nem nyúlunk (nyitott PR-ok) — a szerveroldali gyorsítótár miatt az újrakérés olcsó.

### 5.3 A `listGameQuizBank` megmarad
A szolgáltatás nyilvános függvényei (`listGameQuizBank`, `listLatestMaterialQuizzes`) változatlan szerződéssel maradnak
(tesztek hívják); a route az új `gameQuizBankResponse(gameId)`-t használja, amely ugyanabból a logikából épít.

### 5.4 Tanmenet-betöltő (ugyanaz a minta, kicsi)
`server/curriculum/load.ts:14-15`: a főoldali lista érvénytelenítése / újraindulás után minden cím alapján nem
illeszthető anyag MINDEN közzétett verziójának teljes `json`-ját egyszerre olvassa be. Javítás: `DISTINCT ON
(html_file_id)` a legutóbb közzétett sorra, 16-os kötegekben, és csak a `sections` rész (a `hintsFromLesson` csak azt
olvassa) — a kimenet azonos.

## 6. Edge case-ek

- Anyag nélküli lecke (`html_file_id` NULL): azonossága a saját `id` (a mostani `htmlFileId ?? id` szabály).
- Régi (nem fúziós) legfrissebb verzió: az anyag „elfogyasztva”, korábbi fúziós verzió nem éled fel (mostani szabály).
- Érvénytelen fúziós bank: üres bank, az elavult exportok nem térnek vissza (mostani szabály).
- Ismeretlen `gameId`: üres lista (mostani szabály), nem kerül a gyorsítótárba.
- Hiányzó játéktábla (`isMissingGamesTableError`): a mostani üres-válasz ág megmarad.
- Építési hiba: nem kerül gyorsítótárba, a várakozók hibát kapnak (500, mint eddig); a következő kérés újrapróbál.
- E2E-mód / tesztek közvetlen SQL-írással: az ujjlenyomat ezt is látja.

## 7. Mért, de külön döntést igénylő tétel

A válasz játékonként 29 400 tétel / 10,3 MB (300 lecke × 98 kérdés, szintetikus); élesben UNVERIFIED (lásd jelentés).
A játék egy menetben ennek töredékét használja. A csökkentés (pl. tantárgy / évfolyam szerinti szűrés, lapozás) a
kliens-szerződést érinti → tulajdonosi döntés, külön jegy.

## 8. Javaslat (nem része a PR-nak)

- Közzétételkor előre kiszámított bank (tábla vagy generált oszlop a `json->'experience'->'quiz'`-re) a hideg építést
  is megszüntetné. Index nem segít: a kiolvasott adatmennyiség volt a baj.

<!-- acceptance-checklist -->
## 9. Elfogadás (EARS)

- [ ] A1 — HA 300 közzétett lecke van (2 verzióval), AKKOR a hideg kérés ≤ 2 s és a heap-többlet < 100 MB (mérő).
      **ELTÉRÉS (2026-11-17):** a heap-többlet teljesül (+86–89 MB 200 MB-os halommal); a hideg idő fejlesztői gépen
      1 977–3 495 ms (terheléstől függően) — a ≤ 2 s NEM igazolt, 0,5 CPU-n NEM mérve (élesben várhatóan több másodperc).
      Enyhítés: adatváltozásonként egyetlen építés, single-flight + legfeljebb egy egyidejű építés (M1), a kötegek között
      az eseményhurok szabad.
- [ ] M1 — Egyszerre legfeljebb egy építés fut; eltérő lenyomatú kérések egyetlen követő építésbe vonódnak össze (teszt).
- [ ] A2 — HA a gyorsítótár meleg, AKKOR a kérés ≤ 200 ms, és egyetlen `lessons.json`-olvasás sem fut (teszt).
- [ ] A3 — HA 10 hideg kérés érkezik egyszerre, AKKOR pontosan 1 építés fut (teszt).
- [ ] A4 — HA egy lecke közzététele / módosítása / visszavonása / törlése megtörténik (bármely úton), AKKOR a következő
      kérés az új tartalmat adja (teszt: közvetlen SQL-írás).
- [ ] A5 — A válasz tartalma és sorrendje azonos a javítás előttivel (teszt: a régi algoritmus eredményével összevetve).
- [ ] A6 — A `json`-t kötegenként, legfeljebb 16 sort tartunk egyszerre (teszt: lekérdezésenkénti sorszám).
- [ ] A7 — A tanmenet-betöltő anyagonként csak a legutóbb közzétett sort olvassa (teszt).
- [ ] A8 — `npm test`, `npm run test:learning-db`, lint, check, check:test, build zöld; a kérdésbankot használó e2e-k zöldek.
