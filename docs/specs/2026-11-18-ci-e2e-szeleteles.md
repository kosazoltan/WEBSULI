# Terv: a CI böngészős körének (Playwright E2E) szeletelése

> Állapot: megvalósítás alatt (2026-11-18) · Ág: `chore/ci-e2e-szeleteles` · Végrehajtás:
> `docs/specs/2026-11-18-ci-e2e-szeleteles-vegrehajtas.md` · Testvér-munka (külön ág, külön PR, más kockázat):
> `docs/specs/2026-11-18-joystick-tsunami-stabil.md` (az ingadozó Szökőár-mérő).

## 1. Probléma (mért tények)

A CI „Playwright E2E” jobja egy szálon futtatja a teljes böngészős kört, ezért minden PR összevonása ~1,5–2 órát vár, és egy
ingadozó teszt miatti újrafuttatás újabb teljes kör.

### 1.1 A mostani job időbontása (négy friss zöld futás, 2026-11-18; `gh run view <id> --json jobs`)

| Lépés | 44321935761 (PR #506) | 44317092042 (main) | 44308711704 (PR #502) | 44306107631 (PR) |
|---|---|---|---|---|
| Konténer indítása + checkout + Node | 27 s | 32 s | 26 s | 33 s |
| `npm ci` | 41 s | 58 s | 45 s | 40 s |
| `playwright install --with-deps chromium` | **442 s** | 30 s | 22 s | **532 s** |
| `npm run build` | 19 s | 25 s | 20 s | 18 s |
| Migráció + seed | 1 s | 1 s | 1 s | 1 s |
| **`npx playwright test` (a fő kör, benne a `build:e2e` és a szerver indítása)** | **4716 s (78,6 perc)** | **5535 s (92,3 perc)** | **4937 s (82,3 perc)** | **4677 s (78,0 perc)** |
| Öt kiegészítő konfig (html-persistence, lesson-arbiter, service-worker, learning-flow, lesson-practice) | 179 s | 212 s | 190 s | 175 s |
| **A job összesen** | **5428 s (90,5 perc)** | **5896 s (98,3 perc)** | **5245 s (87,4 perc)** | **5482 s (91,4 perc)** |
| A teljes CI-futás faliórája (létrehozás → vége) | 92,7 perc | 100,6 perc | 89,4 perc | 93,3 perc |

Mellette: `Lint & Typecheck` 108–135 s (minden más job erre vár), `Natív futás (windows-11-arm)` 876–1342 s (15–22 perc),
`Unit Tests` 318–388 s. A böngészős kör nélkül a CI faliórája ~17–25 perc lenne.

A fő kör tesztszáma a futások idején 814 volt (`Running 814 tests using 1 worker`), az `origin/main` mostani fején
(`99c6dc29`) `playwright test --list` szerint **819 teszt 80 fájlban**.

A böngésző-telepítés szórása (22 s ↔ 442–532 s) az `apt` lépésből jön: a lassú futásban a napló szerint a `--with-deps` a
futtatókép régebbi csomagjait frissítette (`Unpacking libgbm1 … over …`, 6,5 perc a `Reading package lists` után).

### 1.2 Miért fut egy szálon (bizonyíték a kódból)

- `source/playwright.config.ts:18` — `workers: process.env.CI ? 1 : undefined`; a sor a konfig első változata óta megvan
  (`git log -S` → `54957ae0 Add playwright tests and README`), vagyis a Playwright-sablon alapértéke, nem mérés eredménye.
- A worker-szám mégsem emelhető egyszerűen, mert a futás EGY szervert és EGY adatbázist használ:
  - `source/playwright.config.ts:40-74` — egy `webServer` (a buildelt `dist/index.js`) egy porton, a job egyetlen
    `postgres:16` service-konténerével (`.github/workflows/ci.yml:167-184`).
  - Négy spec közvetlenül ír az adatbázisba, és `test.describe.configure({ mode: "serial" })` + `beforeAll` / `afterAll`
    takarítással dolgozik: `tests/admin-allowlist.spec.ts:29`, `tests/duel-online.spec.ts:29`,
    `tests/jm0-game-score-privacy.spec.ts:78`, `tests/player-admin-isolation.spec.ts:57` (`INSERT INTO users / session /
    games_catalog …`, `DELETE FROM …`). A lista-tesztek a seed 12 tananyagára számítanak (`tests/e2e-seed.ts`).
  - Több mérő időre érzékeny (képkocka-számlálás szoftveres WebGL-en: `tests/joystick-response.spec.ts`,
    `tests/support/game-mobile-quality.ts`); a futtató 4 magján párhuzamos böngészők mellett a mérés zajosabb lenne. A helyi
    „CI-azonos út” is kifejezetten `workers=1` (`scripts/qa/gates/pre-pr-gate.mjs:74-92`).
- Következtetés: a job-on belüli párhuzamosítás (több worker) megosztott állapotot és zajosabb mérést hozna. A szeletelés
  ezzel szemben minden szeletnek saját, eldobható adatbázist és saját szervert ad, a szeleten belül marad az egy worker.

### 1.3 A futási sorrend és a beépített szeletelés egyenetlensége (mérés)

A Playwright a teszteket nem a fájllista sorrendjében futtatja: a worker-szintű beállítást felülíró fájlok (pl.
`test.use({ ...devices["Pixel 7"] })`) külön csoportba kerülnek. A valós sorrendet 82 egymást követő
`--shard=k/82 --list` hívással mértem ki; erre vetítve a két zöld futás dot-riporterének idősorát (pont = lezárt teszt, a
sorok időbélyegével: 213 és 217 mérési pont) kapjuk a fájlonkénti időt. A módszer ellenőrzése a Playwright saját „Slow test
file” soraival: `support/game-mobile-quality.ts` becsült 18,5 perc ↔ jelentett 16,6 / 17,6 / 21,2; `word-ladder-readability`
13,6 ↔ 15,7 / 16,4 / 18,1; `joystick-response` 4,2 ↔ 5,0 / 5,7.

A beépített `--shard=i/N` a teszteket DARABSZÁM szerint, a futási sorrend egymást követő szakaszaira osztja. Ugyanebből az
idősorból a leghosszabb szelet becsült tesztideje:

| N | 44321935761 (78,3 perc) | 44317092042 (91,8 perc) |
|---|---|---|
| 4 | 38,1 perc | 43,4 perc |
| 6 | 30,8 perc | 35,0 perc |
| 8 | 23,8 perc | 27,4 perc |
| 12 | 25,2 perc | 28,3 perc |
| 16 | 18,5 perc | 21,2 perc |

Ok: a futási sorrend ~500–565. helyén egy ~25–30 perces tömb áll (`word-ladder-readability` 10 tesztje ~15 perc, mellette
`welcome-card`, `game-meta-quality`), amelyet a darabszám szerinti vágás egyben hagy.

## 2. Cél és nem-cél

**Cél:** a böngészős kör falióra-ideje (a CI-futás indulásától a „Playwright E2E” ellenőrzés zöldjéig) ≤ ~30 perc; a lefedettség
(minden mostani teszt lefut, ugyanazzal a konfiggal, ugyanazzal az újrapróba-számmal és egy workerrel) és a szigor változatlan.

**Nem-cél:** tesztek módosítása, törlése, kihagyása; `retries` / `workers` / időkorlátok módosítása a Playwright-konfigban; a
főág védelmi beállításainak módosítása; a böngésző-telepítés (`--with-deps`) átalakítása (külön javaslat, 8. pont); a helyi
kapuk (`pre-pr-gate`) böngészős útjának átalakítása; az ingadozó Szökőár-mérő (testvér-terv).

## 3. Megoldási lehetőségek és a választás

| # | Lehetőség | Mért / becsült eredmény | Döntés |
|---|---|---|---|
| A | Több worker egy jobban | megosztott adatbázis és szerver, zajos mérők (1.2) | elvetve |
| B | Beépített `--shard=i/N` mátrix | N=8-nál a leghosszabb szelet 24–27 perc teszt + 2–10 perc előkészítés + 2 perc lint → 28–39 perc; N=16 kellene (17 job futásonként) | elvetve: egyenetlen (1.3) |
| C | **Súlyozott felosztás: saját, tiszta felosztó a teljes listából, a szelet a Playwright `--test-list` kapcsolójával fut** | N=6-nál minden szelet becsült tesztideje 14,1–14,2 perc | **választva** |

A C változat részletei:

- **Felosztó:** `scripts/qa/e2e-shards.mjs plan`. Bemenet: `playwright test --list --reporter=json` (a teljes lista), a
  `scripts/qa/e2e-shard-weights.json` súlyfájl (mp / teszt, fájlonként; ismeretlen fájl: `defaultSecPerTest`) és N. Egység = egy
  fájl ÖSSZES tesztje (a fájlon belüli sorrend és a `serial` csoportok egy szeletben maradnak); csak a súlyfájl `splittable`
  listáján szereplő két nehéz, megosztott állapot nélküli fájl (`support/game-mobile-quality.ts` 220 teszt,
  `word-ladder-readability.spec.ts` 10 teszt — egyikben sincs `beforeAll` / `serial`) bontható egymást követő darabokra. Kiosztás:
  a legnehezebb egység a legkönnyebb szeletbe. Tiszta függvény: ugyanarra a commitra minden szelet-job ugyanazt számolja.
- **Futtatás:** `npx playwright test --test-list <szelet.txt> --reporter=dot,html,json` — a konfig (`retries: 2`, `workers: 1`,
  `forbidOnly`, nyomkövetés) változatlan; a `dot` + `html` a mostani kimenet (a `html` mellé a Playwright eddig is `dot`-ot
  tett a CI-ben), a `json` a számláló-ellenőr bemenete.
- **Minden szelet saját világ:** külön job, saját `postgres:16` service-konténer, saját migráció + seed, saját szerver.
- **N = 6** (+ egy hetedik rész az öt kiegészítő konfignak, 3–3,5 perc tesztidővel). Becsült falióra:

  | N | szelet tesztideje (átlagos futás) | tipikus falióra | lassú `apt` (+8 perc) | lassú `apt` + a leglassabb mért futássebesség (×1,08) |
  |---|---|---|---|---|
  | 5 | 17,0 perc | ~23 perc | ~31 perc | ~32 perc |
  | **6** | **14,2 perc** | **~20 perc** | **~28 perc** | **~29 perc** |
  | 7 | 12,1 perc | ~18 perc | ~26 perc | ~27 perc |
  | 8 | 10,6 perc | ~17 perc | ~25 perc | ~25 perc |

  (falióra = lint 2 perc + előkészítés 2 perc + `build:e2e` és szerverindítás 0,5 perc + tesztidő + a záró job 1,5 perc.) Az N=6
  a legkisebb, amely a lassú `apt` esetén is 30 perc alatt marad; a 7–8 csak 2–4 percet hozna további jobok árán. A súlyok
  becslések (1.3): ha az első CI-futásokban a leghosszabb rész jobideje > 20 perc, előbb a súlyfájlt kell a mért értékekre
  frissíteni (a záró job artefaktuma), és csak utána N-t emelni (egy sor az `env`-ben + a mátrix listája).

## 4. A kötelező ellenőrzés neve változatlan marad

A főág védelme négy ellenőrzést kér (`gh api repos/…/branches/main/protection`): „Háromfázisú rend”, „Lint & Typecheck”,
„Unit Tests”, **„Playwright E2E”**. A `pre-merge-gate` ugyanezt a listát a védelemből olvassa, és név szerint keresi a
check-runt (`scripts/qa/gates/pre-merge-gate.mjs:14-31`, `:156`).

- A szelet-jobok neve „E2E rész (1)” … „E2E rész (6)”, „E2E rész (kiegeszito)” — egyik sem „Playwright E2E”.
- EGY záró job viseli a „Playwright E2E” nevet (`e2e-tests`, a job-azonosító is marad): `needs: [lint-typecheck, e2e-parts]`,
  `if: always()`. Első lépése elbukik, ha az `e2e-parts` eredménye nem `success` (bukás, megszakítás, kihagyás); utána a
  számláló-ellenőr fut. Az `always()` azért kell, mert a kihagyott (`skipped`) job a GitHub védelmében sikeresnek számítana.
- Így a védelmi beállításhoz és a `pre-merge-gate` listájához NEM kell nyúlni. **Tulajdonosi teendő: nincs.**
- Mellékhatás: ha a lint elbukik, a „Playwright E2E” eddig „skipped” volt, ezután „failure” (a lint úgyis kötelező).

## 5. Számláló-ellenőr (gép dönt, nem ember)

`scripts/qa/e2e-shards.mjs check` a záró jobban: a szeletek JSON-jelentéseiből (`e2e-report-<k>.json`, artefaktumként átadva)
és a záró jobban újra előállított teljes listából igazolja, hogy

1. mind az N jelentés megvan;
2. a lista minden tesztje pontosan egy szeletben szerepel (azonosító: a Playwright teszt-azonosítója + projekt);
3. egyetlen szeletben sem futott a listán kívüli teszt, és semmi sem futott kétszer;
4. minden tesztnek van eredménye (a meg nem futott teszt a jelentésben eredmény nélkül áll);
5. a szeletekben lefutott tesztek összege = a lista teljes száma.

Eltérésnél kilépési kód 1 → a „Playwright E2E” piros. Az N egy helyen van (`env.E2E_SHARDS`); a mátrix számozott részeinek és
az `E2E_SHARDS`-nak az egyezését a `scripts/qa/e2e-shards.test.mjs` őr-esete méri a valódi `ci.yml`-en, futás közben pedig a
`check` (hiányzó jelentés → bukás).

## 6. Kockázatok

| Kockázat | Kezelés |
|---|---|
| **Szeletek közti terheléskülönbség** (a súlyok két futásból becsültek; a teszteket nem egyenként mértük) | A záró job kiírja a szeletenkénti mért tesztpercet (lépés-összefoglaló), és `e2e-shard-weights-measured` artefaktumként a mért súlyfájlt; a frissítés egy fájl cseréje. A job időkorlátja 60 perc (ma nincs korlát: 6 óra). |
| **Rejtett sorrendfüggés** (egy teszt egy korábbi teszt által hagyott adatra / állapotra épít) | A fájl nem bomlik szét (kivéve a két `splittable` fájlt), a fájlon belüli sorrend marad. Fájlok KÖZÖTTI függés a szeletelésnél determinisztikusan bukik (minden rész friss adatbázison indul, mindig ugyanazzal a tesztlistával) → az első CI-futásban a részenkénti jelentésből / nyomkövetésből azonosítható; a mainen zöld, a részben mindhárom kísérletben bukó teszt = sorrendfüggés. Helyben: a részek CI-azonos úton, eldobható adatbázison futtathatók (`npm run test:e2e -- --test-list …`), a végrehajtási utasítás 6. lépése szerint. |
| **A kiegészítő konfigok friss adatbázison futnak** (eddig a fő kör utáni, „használt” adatbázison futottak) | Helyi próba friss adatbázison (végrehajtás 6. lépés); az első CI-futásban a „kiegeszito” rész mutatja. |
| **Hibajelentés / nyomkövetés szeletenként** | Minden rész saját artefaktumot ad: bukáskor `playwright-report-<rész>` (HTML-jelentés + `test-results` a nyomkövetéssel és a videóval), a számozott részek mindig `e2e-json-<rész>`. `fail-fast: false`: egy rész bukása nem állítja le a többit, így egy körben minden bukás látszik. |
| **A GitHub-futók párhuzamossági korlátja** | Futásonként 7 új job a régi 1 helyett (összesen 13 + a záró). A fiók párhuzamossági korlátja UNVERIFIED (ingyenes csomagban 20 Linux-job); több egyszerre futó PR-nál a jobok sorba állnak, de az összes munka (≈ 85 perc teszt + 7 × 2–10 perc előkészítés) rövidebb sorral fogy el, mint a mai 90 perces jobok. Újrafuttatásnál a „Re-run failed jobs” csak a bukott részt és a záró jobot futtatja (~20 perc a teljes kör helyett). |
| **Artefaktum újrafuttatáskor** (azonos nevű feltöltés a második kísérletben) | `overwrite: true` a feltöltésnél; UNVERIFIED, az első újrafuttatásnál ellenőrizendő (végrehajtás 8. pont). |
| **C-61: a PR `.github/workflows/**`-t és `scripts/qa/**`-t érint** → a `pre-merge-gate` „bármely main-változás” hatókörrel dönt | Összevonás csak úgy, hogy a PR CI-ja a JELENLEGI mainnel futott: közvetlenül az összevonás előtt a main beolvasztása, zöld CI (~30 perc), közben más PR nem megy be (összevonási ablak). Sorrend: előbb a testvér-PR (csak teszt + doksi, nem repó-szintű hatókör), utána ez. A nyitott PR-ok a következő CI-futásuktól az új workflow-t kapják (a `pull_request` futás az összefésült commit workflow-ját és szkriptjeit használja); a korábbi, régi workflow-val szerzett „Playwright E2E” zöldjük érvényes marad. |

## 7. Elfogadás

<!-- acceptance-checklist -->

- [ ] E1 — A workflow a fő kört `E2E_SHARDS` = 6 részre osztva futtatja, mindegyik saját Postgres-konténerrel, migrációval,
      seeddel és szerverrel; a kiegészítő öt konfig külön részben fut. (kód: `ci.yml`; CI: NOT RUN a push előtt)
- [ ] E2 — Egyetlen job neve „Playwright E2E”; csak akkor zöld, ha minden rész zöld ÉS a számláló-ellenőr egyezést ad; kihagyott
      / megszakított rész mellett piros. (őr-teszt a valódi `ci.yml`-en)
- [ ] E3 — Helyben, szkripttel igazolva: a 6 szelet `--test-list` fájljával a Playwright által kiválasztott tesztek uniója =
      a teljes lista (819), átfedés nélkül.
- [ ] E4 — A számláló-ellenőr eltérésnél (hiányzó jelentés, hiányzó / kétszer futó / listán kívüli / meg nem futott teszt)
      1-es kilépési kóddal bukik (egységteszt + valódi jelentéseken futtatott próba).
- [ ] E5 — A Playwright-konfig, a tesztek, a `retries` és a `workers` nem változik (`git diff --stat`: nincs `source/` változás).
- [ ] E6 — Részenkénti artefaktum: JSON-jelentés mindig, HTML-jelentés + nyomkövetés bukáskor.
- [ ] E7 — Mérőszám az első CI-futásra (NOT RUN a push előtt): a CI-futás indulásától a „Playwright E2E” zöldjéig ≤ 30 perc; a
      záró job kimenetében „a szeletekben lefutott tesztek összege: 819; a lista teljes száma: 819 → EGYEZIK”.
- [ ] E8 — `npm run gate:stage` és `npm run gate:push` zöld a munkafa gyökeréből.

## 8. Követő javaslatok (nem ennek a PR-nak a része)

- A böngésző-telepítés 22 s ↔ 442–532 s szórása: mind a 25 Playwright-konfig a futtató telepített Chrome-ját használja
  (`channel: 'chrome'`), ezért a `--with-deps chromium` valószínűleg kiváltható (`playwright install ffmpeg` a videóhoz) —
  UNVERIFIED, külön mérendő; 7 párhuzamos jobnál a lassú `apt` gyakrabban határozza meg a faliórát.
- A súlyfájl első frissítése a mért értékekre; a `docs/minosegkapuk.md` „~1 órás E2E” szövegeinek frissítése a mért idővel.
