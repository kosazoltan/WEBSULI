# Végrehajtás: a kérdésbank karcsúsítása (kanban #101)

Spec: `docs/specs/2026-11-17-kerdesbank-karcsusitas.md` (JÓVÁHAGYVA; döntések és rögzített részletek: 10. / 10.1 pont).
Munkafa: `.claude/worktrees/kerdesbank-karcsu`, ág `perf/kerdesbank-karcsusitas` (`origin/main` = `b4b84db6` + a #491 ága beolvasztva a
mérőszkript miatt; a PR a #491 mainre kerülése UTÁN nyílik). Parancsok a munkafa gyökeréből, PowerShellből `npm.cmd` / `npx.cmd`; minden
nehéz futás (teljes `npm test`, `gate:push`, Playwright, mérés) ELŐTT az E2E-sorompó (`docker ps --filter name=websuli-e2e- …`, < 2 fiatal
konténer), egyszerre egy nehéz futás, `--workers=1`. Éles adatbázist nem írunk; élesen csak olvasó GET.

## S1 — szerver + közös modul (nem érint játéklapot)

### T1 — `isPlayableQuestion` eredmény-gyorsítótár

Fájl: `source/shared/game-quiz-contract.ts`.
1. Modul-szintű `const playableCache = new WeakMap<object, { ok: boolean; prompt: unknown; options: unknown; length: number; correctIndex: unknown }>()`.
2. `isPlayableQuestion(value)`: nem objektum → `false` (változatlan). Objektumnál a bejegyzés akkor érvényes, ha a `prompt`, az `options`
   referencia, az `options.length` és a `correctIndex` egyezik a tárolttal; különben a mostani törzs fut, és az eredmény a mezőkkel együtt
   tárolódik. A törzs (a régi kifejezés) változatlan, külön belső függvényben (`evaluatePlayable`).
3. Doc-komment: a gyorsítótár feltétele és az őr (helyben módosított tétel újra kiértékelődik; egy opció-szöveg helyben átírása ugyanabban a
   tömbben NEM észlelhető — a hívók nem írnak helyben, #491 review 2. pont).

Teszt: `source/tests/game-quiz-contract-cache.test.ts` — (a) determinisztikus vegyes minta (játszható, nem játszható, ismétlődő) szűrése
gyorsítótárral = a gyorsítótár nélküli belső függvénnyel (`evaluatePlayable`, exportálva); (b) a második szűrés ugyanazon objektumokon a
mért idő < 5 %-a az elsőnek (laza küszöb, tesztkampó a termékkódban nincs); (c) helyben
módosított `prompt` / `options` / `correctIndex` → új kiértékelés, helyes eredmény; (d) új objektum azonos tartalommal → saját kiértékelés.
Mutációs ellenpróba commit után: az őr kivétele → (c) bukik.
Parancs: `cd source; node --import tsx --test tests/game-quiz-contract-cache.test.ts`.

### T2 — ETag + feltételes kérés a quiz-bankra

Fájlok: `source/server/gameQuizBankService.ts`, `source/server/routes.ts` (a `GET /api/games/quiz-bank/:gameId` kezelő), `source/vercel.json`.
1. `GameQuizBankResponse` új mezője `etag`: `W/"qb-<SHA-1(base64url) a kitömörített testből>"`, a `serializeResponse` számolja (egyszer,
   építéskor).
2. A route: `ETag`, `Cache-Control: no-cache`, `Vary: Accept-Encoding` minden 200 / 304 válaszon; ha az `If-None-Match` (vesszős lista, `W/`
   nélkül is, vagy `*`) egyezik → `304`, test nélkül.
3. `vercel.json` „headers”: a `/api/((?!tts/audio$|lesson-clips/media/).*)` minta kizárja a `games/quiz-bank/` útvonalat is, és új szabály:
   `/api/games/quiz-bank/(.*)` → `Cache-Control: no-cache`.

### T3 — `?classroom=` szerveroldali változat

Fájlok: `source/server/gameQuizBankService.ts`, `source/server/routes.ts`.
1. A pillanatkép a kanonikus részt anyagonkénti darabokban tárolja (`canonicalParts: { materialId, count, json }[]`, sorrend = a mostani); a
   teljes válasz a darabokból és a régi exportokból áll össze, bájtra azonosan (a meglévő A5 integrációs teszt őrzi).
2. `export const MIN_CLASSROOM_ITEMS = 200`; tiszta függvény `pickClassroomSet(n, count)` → `{N}` / `{N−1,N,N+1}` (0–12-re vágva) / `null`
   (= teljes bank) a 10.1 szabály szerint.
3. `gameQuizBankResponse(gameId, classroom?)`: paraméter nélkül változatlan. Paraméterrel (csak kupon-játéknál): az anyag → évfolyam térkép
   (`SELECT id, classroom FROM html_files`, csak két oszlop), a darabok és az adott anyagok régi exportjai (`legacyRows` anyag-szűrővel)
   alapján a változat; a teljes válasz sorrendjének részhalmaza. Kulcs: `gameId#c<N>`, a pillanatkép `variants` térképében, single-flight
   (ugyanaz a Promise-minta, mint a `games`); ha a szabály `null`-t ad, a teljes válasz objektumát adja vissza (nincs új tárolt példány).
4. A route a `classroom` paramétert `/^(?:[0-9]|1[0-2])$/`-re ellenőrzi; hiányzó → teljes; bármi más (tömb is) → `400`
   `{ message: "Érvénytelen évfolyam (0–12)." }`, a szolgáltatás hívása nélkül.

Tesztek:
- `source/tests/quiz-bank-classroom-pick.test.ts` (egység): `pickClassroomSet` 0, 1, 2, 7, 12. évfolyamra a mért éles darabszámokkal
  (spec 3.2), határeset 199 / 200, sáv-vágás 0 és 12 szélén, determinizmus.
- `source/tests/vercel-quiz-bank-cache.test.ts` (egység): a `vercel.json`-ban a `quiz-bank` útvonal `no-cache`, minden más `/api/` útvonal
  `no-store` marad, a TTS / klip kivétel változatlan.
- `source/tests/quiz-bank-scale-db.integration.ts` (bővítés, eldobható Postgres, `npm run test:learning-db`): (a) a paraméter nélküli válasz
  bájtra azonos (a meglévő A5); (b) `?classroom=` változat: részhalmaz, sorrend, minden tétel anyaga a kiválasztott évfolyamokon, bővítés egy
  kis évfolyamra, teljes bank, ha a szomszédokkal sincs 200; (c) route: ETag + `no-cache` + `Vary`; `If-None-Match` → 304 üres testtel, és az
  építés-számláló (`builds`, `gameBuilds`) a 304 alatt nem nő; (d) két különböző munkamenet-süti és névtelen kérés → azonos test és ETag;
  (e) érvénytelen `classroom` (`abc`, `-1`, `13`, `1.5`, ismételt) → 400, a változat-gyorsítótár nem nő.

### T4 — mérés és kapuk

1. `npm run gate:stage` minden T után.
2. Szerver-memória: a `quiz-bank-scale-db.integration.ts` mellé egy mérő-próba (`process.memoryUsage()` a hideg építés + 13 évfolyam-változat
   + 100 db 304 előtt és után, `global.gc` nélkül, tájékoztató) — a szám a „Mért eredmények” alá.
3. Kliens, ELŐTTE / UTÁNA: `source/scripts/perf/measure-game-frames.mjs` kihajtott nézetben (827×896, dpr 2,625), 1× CPU, Kockavadász és
   Szökőár, `--local <dist/public>` (ELŐTTE = a T1 nélküli build); a mérendő: az adatérkezéskori MÁSODIK hosszú feladat (a tananyag
   megérkezésekor) eltűnik-e. A 304 csak telepítés után mérhető (lásd lent).
4. `npm run gate:push` → megállás a fej-hash-sel és a mérőtáblával (független ellenőr) → `npm run gate:pr -- --body-file <leírás.md>` → egy push
   → `gh pr create` (a #491 mainre kerülése után).

### Telepítés utáni ellenőrzés (az orkesztrátor futtatja a merge után; csak olvasó GET)

```
curl -s -o /dev/null -D - --compressed https://websuli.vip/api/games/quiz-bank/block-craft-quiz | grep -iE "^(etag|cache-control|vary|content-length|x-vercel-cache):"
# → ETag: W/"qb-…", Cache-Control: no-cache, Vary: Accept-Encoding
ETAG=$(curl -s -o /dev/null -D - --compressed https://websuli.vip/api/games/quiz-bank/block-craft-quiz | tr -d '\r' | awk -F': ' 'tolower($1)=="etag"{print $2}')
curl -s -o /dev/null -w "status=%{http_code} bytes=%{size_download}\n" --compressed -H "If-None-Match: $ETAG" https://websuli.vip/api/games/quiz-bank/block-craft-quiz
# → status=304 bytes=0
curl -s -o /dev/null -w "status=%{http_code} bytes=%{size_download}\n" --compressed "https://websuli.vip/api/games/quiz-bank/block-craft-quiz?classroom=3"
# → status=200, a teljes 2,86 MB helyett ~0,3 MB
curl -s -o /dev/null -w "status=%{http_code}\n" "https://websuli.vip/api/games/quiz-bank/block-craft-quiz?classroom=abc"
# → status=400
```
Ha a Vercel a 304-et nem adja át (200 jön az `If-None-Match` mellett), a `vercel.json` kivétel hatástalan, de nem árt; ezt jelezni kell (S2-ben
alternatíva: verziózott URL).

## S2 — lapok (a #483 / #484 mainre kerülése után)

1. `BlockCraftQuiz.tsx`: a bank-lekérdezés URL-je `?classroom=<userGrade>` (ha van évfolyam), `staleTime: 10 * 60 * 1000`; a `remote` ág külön
   memo `[bankData]` függőséggel, `isPlayableQuestion` NÉLKÜL (a szerver szűr); a tananyag-ág memója külön.
2. `TsunamiEscapeEnglish.tsx`: ugyanaz (`splitBankItemsByTier` külön memo `[quizBankResponse]`-re, kliensoldali újraszűrés nélkül).
3. Teszt: a meglévő Kockavadász / Szökőár specek, a közös mobil mérő, a joystick-mérő; mérés: AC5–AC7.

## S3 — opcionális (az S2 mérése után)

Lusta letöltés (spec E opció) — külön terv, ha az S2 után is marad mérhető letöltési költség.

## Mért eredmények (S1, fej `20368b8d`)

### Tesztek

- `node --import tsx --test tests/quiz-bank-s1.test.ts tests/game-quiz-contract-cache.test.ts`: 9/9 ok.
- `npm run test:learning-db` (eldobható Postgres, 108 s): 197/197 ok. Ebből a meglévő A5 (a paraméter nélküli válasz bájtra a régi) és a
  három új #101-teszt (változat, route: ETag / 304 / munkamenet-függetlenség / 400, memória). A fixture változatai:
  `0:teljes=5662 1:teljes=5662 2:1+2+3=525 3:3=525 5:5=540 7:7=601 12:12=450`.
- Mutációs ellenpróba (a `20368b8d` után, a commitolt fájlon, `git checkout` visszaállítással): az őr kivétele → (c) ✖; a gyorsítótár
  kikapcsolása → (b) ✖.
- `npm run gate:stage`: ZÖLD. WARN: a `gameQuizBankService.ts`-nek nincs célzott egységtesztje — a DB-integráció fedi.

### A független ellenőr (IGEN, FELTÉTELLEL) leleteinek javítása

- **K1:** a 0. sáv (programozás) nem évfolyam-szomszéd, és nem is bővül az 1.-vel (`server/lib/quiz-bank-classroom.ts`). Az egységteszt
  elvárása javítva — ez HIBÁS ELVÁRÁS JAVÍTÁSA: az 1. évfolyamra az 1+2 = 95 < 200, ezért a teljes bank megy.
- **K2:** a lenyomat az `html_files` `id:classroom` párjait is fedi. Új DB-teszt: csak az `html_files` sor áthelyezése → új változat-ETag, a
  régi ETagre 200; a teljes bank ETagje változatlan.
- **A1:** a terv 10.1 / AC8 mondata és a teszt neve: a 304 csak MELEG állapotban nem épít.
- **A2:** a változatok gzip-mérete bekerült a memória-figyelmeztetésbe.
- **A3:** route-teszt: bankváltozás → új ETag, a régi ETagre 200.
- **A4:** a 400 / 500 / ismeretlen játék válasza a route-on `no-store`.

Ellenőrzés:
- `gate:stage` ZÖLD.
- `npm run test:learning-db` 198/198 ok, 221 s. Az első próba 315 s alatt a futtató 300 s-os keretén bukott a gép terhelése miatt: minden
  teszt zöld volt, csak az időkeret fogyott el. A második, sorompó utáni futás zöld.

### Tanulási hatás — évfolyamonkénti tételszám az éles bankon (a `?classroom=` szabály szerint; spec 3.2 adataiból)

| kért évf. | választott évfolyamok | tétel | megjegyzés |
|---|---|---|---|
| 0 | 0 | 718 | |
| 1 | — | 25 144 (teljes) | saját: 0, 1+2 = 95 < 200 (a 0. sáv nem szomszéd — review K1) |
| 2 | 1+2+3 | 2 724 | saját: 95 |
| 3 | 3 | 2 629 | |
| 4 | 4 | 5 745 | |
| 5 | 5 | 5 313 | |
| 6 | 6 | 2 029 | |
| 7 | 7 | 489 | |
| 8 | 8 | 5 652 | |
| 9 | 9 | 2 474 | |
| 10 | 9+10+11 | 2 474 | saját: 0 |
| 11 | — | 25 144 (teljes) | a szomszédokkal (10, 12) sincs tétel |
| 12 | — | 25 144 (teljes) | |

A 0. sáv (programozás) önálló, sem nem szomszéd, sem nem bővül. Alsó küszöb: `MIN_CLASSROOM_ITEMS = 200` (ennél kevesebbnél bővítés, végül a teljes bank). Becsült letöltés a változattal (a tételarány ×
2,86 MB): 0,06–0,65 MB a mostani 2,86 MB helyett. (Kliensoldali használat: S2.)

### Szerver-memória (tájékoztató)

- A pillanatkép kanonikus része darabolva ugyanakkora, mint eddig egyben (a darabszám = a leckék száma, ~240). A teljes válasz a darabokból
  közvetlenül áll össze: nincs köztes összefűzött másolat.
- Évfolyam-változatok: játékonként legfeljebb 13. Az éles bankon egy játék összes változata becslés szerint ≈ 3,5 MB gzip (a változatok
  tételszámának összege ≈ 31 000 / 25 144 × 2,86 MB). Mind az 5 kupon-játékra a legrosszabb eset ≈ 18 MB; a teljes-bank kimenet nem tárol új
  példányt.
- Fixture-mérés (`QB_MEM`, GC nélkül, zajos): hideg építés +27,6 MB heap, +13 változat +11,1 MB, +100 meleg kérés +3,4 MB.
- 304: ugyanaz a könnyű lenyomat-lekérdezés, mint a 200-as kérésnél; építés-számláló változatlan (teszt).

### Kliens, ELŐTTE / UTÁNA (csak a T1 — a lapok változatlanok)

Kihajtott nézet 827×896, dpr 2,625. Valódi GPU (AMD Radeon 890M), asztali gép, telefonméretű emuláció; az éles API-val. ELŐTTE = a T1 nélküli
build. Sorompó: minden futás előtt < 2 fiatal e2e-konténer (szabad).

Hosszú feladatok az adatérkezéskor (ms):

| futás | ELŐTTE: a bank után | ELŐTTE: a tananyag után | UTÁNA: a bank után | UTÁNA: a tananyag után |
|---|---|---|---|---|
| Kockavadász, 1× CPU, r1 | 444 | 425 | 993 (a tananyag ELŐBB jött) | — |
| Kockavadász, 1× CPU, r2 | 820 | 734 | 841 (egy blokk; a két érkezés egybeesett) | — |
| Kockavadász, 4× CPU | 10 223 | 9 527 | 8 089 | **0** (a következő feladat 317 ms) |
| Szökőár, 1× CPU, r1 | (a bankhoz nem köthető külön) | 667 | 1 152 | **0** |
| Szökőár, 1× CPU, r2 | 741 | 656 | 1 228 | **0** |

Értékelés:
- **Eltűnt** a második, a tananyag megérkezésekori újraszűrés mindkét játékban. 4× CPU-n ez 9,5 s volt.
- **Megmarad** az első szűrés blokkja: 0,4–1,2 s (1×), 8–10 s (4×). Ez az S2 dolga (kliensoldali szűrés elhagyása, `?classroom=`).
- **Megmarad** a Szökőár Indítás utáni 1,1–1,5 s-os blokkja is. Ez nem a bank: ELŐTTE és UTÁNA is jelen van (a #491 review szerint a
  React-indítás és az első 3D-képkocka).

Az ELŐTTE és UTÁNA első szűrésének eltérése (444–820 ms vs. 841–1 228 ms) futásonkénti zaj. A második blokk eltűnése viszont mind az öt
UTÁNA-futásban következetes.
