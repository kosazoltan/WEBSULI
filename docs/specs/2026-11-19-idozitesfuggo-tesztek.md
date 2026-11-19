# Spec: falióra-független egységtesztek terhelt gépen (kanban #205, #206)

> Dátum: 2026-11-19 · Szerző: Claude (alügynök, orkesztrátori megbízás) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás 2026-11-19)
> Végrehajtás: `docs/specs/2026-11-19-idozitesfuggo-tesztek-vegrehajtas.md` · Ág: `fix/idozitesfuggo-tesztek`

## 1. Cél

Tulajdonosi utasítás (2026-11-19): „Keress a jelentkező időzítési bukásokra megoldást: ha két nehéz kapu fut egyszerre a gépen, akkor
vagy állítsd sorba őket, vagy javítsd meg a nehéz futás sikeres elvégzését.” A sorba állítást az orkesztrátor elvégezte (egy gépi sáv).
Ez a szelet a második felét teljesíti: a nehéz futás (`gate:push` teljes `npm test` köre, merge-kapu próbája) ne bukjon HAMISAN
terhelés alatt. A bizonyítottan falióra-függő egységtesztek determinisztikusak lesznek, a mérce (amit a teszt állít) gyengítése nélkül.

## 2. NEM cél

- Termékkód (`source/server`, `source/client/src`, `source/shared`) módosítása — csak a három tesztfájl változik.
- Teszt gyengítése, kihagyása, törlése; küszöb lazítása (a 60 s-os korlát értéke, a `< 250` ms-os határ marad).
- A kapuk (`scripts/qa/gates/*`) vagy a `node --test` párhuzamosságának átállítása.
- A csak extrém terhelésnél (a próbaszkript határidején túl) lassuló, de nem bukó tesztek javítása — jegy-szövegként a 8. pontban.

## 3. Érintett fájlok

- `source/tests/parallel-bank.test.ts` (#206)
- `source/tests/vocab-distractor-overlap.test.ts` (#205)
- `source/tests/claude-stream-thinking-liveness.test.ts` (a 2. feladat mérése során bizonyítottan ingadozó — lásd 4.3)

## 4. Mért tények és rögzített döntések

Mérőgép: Windows 11, 24 logikai mag, Node v24.22.3, munkafa `origin/main` `b7165a56`-ról. Terhelés-próbaszkript (scratchpad,
nem commitolt): N CPU-pörgető `node -e` folyamat legfeljebb 110 s-ig + a vizsgált tesztfájl 10 példánya párhuzamosan, ugyanabban az
ablakban (régi és új egyszerre, tehát azonos terheléssel). Két terheléstípus: **folyamatos** (normál prioritású pörgetők) és
**szaggatott** (40 ms pörgetés / 10 ms alvás, a tesztnél magasabb — ABOVE_NORMAL — prioritással: a felébredő pörgető azonnal
kiszorítja a tesztfolyamatot; ez a két párhuzamos teljes tesztkör alatti ütemező-kiszorítás erősített modellje).

### 4.1 `parallel-bank.test.ts` (#206)

- Gyökérok (kódból): a „review #265 … eltérő befejezési sorrendnél” teszt a `setTimeout(30)` (0. egység) és `setTimeout(5)`
  (1. egység) befejezési sorrendjére épít. A Node időzítő kezdőideje a valós idő (`uv_update_time`), a két időzítő ugyanabban a
  szinkron lépésben jön létre (`experience-builder.ts:902` `chunk.map` → `buildUnit` → `deps.call`, a hívás előtt nincs `await`;
  mérve: a két hívás között 0,5 ms). Ha a folyamatot ebben az ablakban > 25 ms-ra kiszorítja az ütemező, a sorrend megfordul:
  mért bukás `actual: { done: 1, current: 1, building: [1] }` — a 0. egység végzett előbb.
- A másik két időzítős teszt (`:38` 5 ms, `:82` 20 ms) a mai kóddal nem bukhat időzítés miatt, de ugyanígy falióra helyett vezérelt
  lesz (egy fájl, egy minta; a #206 jegy mindhárom sort nevezi).
- **Döntés:** kézzel feloldott ígéretek („deferred”). A hívás egy kapura vár; a kaput a teszt a vizsgált esemény után oldja fel
  (mindkét hívás elindult; az 1. egység haladásjelzése `done: 1` megjött; a 0. egység hibája eldobva). Tartalék: egy
  eseményhurok-kör (`setImmediate`) után a kapu mindenképp felold — a helyes kódban a várt esemény addigra megtörtént (csak
  mikrotaszkok), hibás kódban a teszt az állításán bukik, és nem akad el. Mért: tartalék nélkül a soros mutánson a fájl 120 s-ig
  függött (a node:test nem jelezte a függő ígéretet), ezért kötelező.
- **Mérce-egyenértékűség (mutációs próba, mért):** három mutáns az `experience-builder.ts`-ben, régi és új teszt ugyanazokon bukik:
  soros építés (`concurrency = 1`) → 3/3 teszt bukik mindkettőben; gyors hiba (`Promise.all` az `allSettled` helyett) → csak a
  „hiba után is megvárja” teszt bukik mindkettőben; befejezéskori haladásjelzés nélkül → csak a „befejezési sorrend” teszt bukik
  mindkettőben. A forrásfájl utána bájtazonosan visszaállítva (`cmp` + `git diff --quiet`).

### 4.2 `vocab-distractor-overlap.test.ts` (#205)

- Mért (CPU-profil, a teszt bank-szintű része): `findFormInText` regex-fordítása bejegyzésenként egyszer ~35% (7,7 s / 6 808
  bejegyzés), `isPlayableQuestion` lánca ~25%, `pickDistractors` ~10%, a teszt saját invariáns-ellenőrzése ~15%. Terheletlenül:
  CPU 18,9 s, falióra 22,3 s; 107 110 kérdés.
- A korlát maga a mérce: a #432 (`0b386870`) a generátort a teljes bankokra gyorsította, és a `< 60 000` ms ezt a teljesítmény-
  garanciát őrzi (a munka mennyisége). A falióra ezt csak közelíti: terhelt gépen a CPU-sorban állás is benne van.
- **Döntés:** a korlát a folyamat CPU-idejére (`process.cpuUsage()`, user + system, minden szál) épül, változatlan 60 000 ms-os
  értékkel; a teszt `t.diagnostic`-kal kiírja a CPU-időt és a falióra-időt (bizonyíték a naplóban). Indoklás: egyszálú munkánál a
  CPU-idő ≤ falióra, tehát ami eddig átment, most is átmegy; a különbség pontosan a várakozás (ütemezés), amelyet ki akarunk
  venni. A garancia (a munka ≤ 60 s) nem gyengül: a mért mennyiség a munka maga. A termékkód gyorsítása (a regex-fordítás) nem
  része ennek a szeletnek (NEM cél: termékkód) — jegy-szövegként a 8. pontban.
- Mért terhelés alatt (folyamatos, 60 pörgető + 10 régi + 10 új példány): a CPU-idő 14,2–19,0 s maradt, a falióra 54,7–94,5 s lett.

### 4.3 `claude-stream-thinking-liveness.test.ts` (a 2. feladat mérése során talált)

- Gyökérok: a mock stream valós `setTimeout`-os szünetei (30 / 50 ms) versenyeznek a tétlenségi őr 80 ms-os időzítőjével
  (`stream-collect.ts:27-47`: `Date.now()` határidő + `setTimeout`). Kiszorításnál a keret feldolgozása a határidő után történik.
- Mért: szaggatott terhelésnél az „A3: csak gondolkodás-állapotjelek … → siker” teszt bukott (W4: 1/3; W8 vegyes terhelés: 3/10).
- **Döntés:** hamis óra (node:test `t.mock.timers`, `setTimeout` + `Date`), egy `onFakeClock` segéddel: a hamis idő 5 ms-os
  lépésekben halad, minden lépés előtt két (nem hamisított) `setImmediate`-kör; így a keret és a határidő sorrendjét a hamis idő
  dönti el. Érintett: „A1+A3”, „A3”, „review #212 üres szövegblokk” (a `< 250` ms-os határ hamis ms-ban marad). Új, erősítő állítás:
  a sikeres stream a hamis órán az `idleMs`-nél tovább tartott (`elapsedMs > 80`) — a teszt valóban a határidőn túli életjelet méri.
  A két „A4” (tétlenség várt) teszt marad: a várt hiba terhelésnél is bekövetkezik.
- **Mérce-egyenértékűség (mutációs próba, mért):** `stream-collect.ts:47` — ha a gondolkodás-jel nem életjel → „A1+A3” és „A3” bukik
  régiben és újban is; ha minden esemény életjel → „review #212” bukik régiben és újban is.

## 5. Edge case-ek

- Hibás (soros) banképítésnél a vezérelt kapu nem akaszthatja meg a futást → `setImmediate`-tartalék (4.1, mért).
- A hamis óra csak a tesztre hat (`t.mock` a teszt végén visszaáll); az SDK esetleges hosszú (perces) időzítői a hamis órán nem
  járnak le a teszt 5 000 hamis ms-os keretén belül; a keret túllépése bukás üzenettel, nem elakadás.
- A `process.cpuUsage()` a tsx betöltőszálát és a GC-szálakat is számolja — szigorúbb, nem lazább a fő szálnál.
- A CPU-idő a hiperszálas osztozkodásnál kissé nőhet; mért terhelésnél nem nőtt (14–19 s vs. terheletlenül 18,9 s), a tartalék 3×.

## 6. Elfogadási kritériumok (EARS)

- WHEN a `parallel-bank.test.ts` fut THEN a befejezési sorrendet SHALL kézzel feloldott ígéret határozza meg (nincs `setTimeout(r, N)`
  a fájlban), és a három mutáns ugyanazokat a teszteket SHALL buktatni, mint a régi változatban.
- WHEN a vizsgált viselkedés hiányzik (soros építés) THEN a teszt SHALL bukni 60 s-on belül (nem akad el).
- WHEN a `vocab-distractor-overlap.test.ts` bank-szintű tesztje fut THEN a korlát SHALL a `process.cpuUsage()` CPU-idejére (60 000
  ms) vonatkozni, és a teszt SHALL kiírni a CPU- és falióra-időt.
- WHEN a claude-stream liveness tesztjei futnak THEN a keretek és a tétlenségi határidő SHALL hamis órán futni („A1+A3”, „A3”,
  „review #212”), és a két mutáns ugyanazokat a teszteket SHALL buktatni, mint a régi változatban.
- WHEN a régi és az új változat azonos terhelésen 10–10 példányban fut THEN a régi SHALL legalább egyszer bukni, az új SHALL 10/10
  zöld lenni — mindhárom fájlra (a mért eredmény a PR-leírásban).
- WHEN `npm run gate:stage` fut a munkafa gyökeréből THEN SHALL zöld lenni.

## 7. Tesztterv

- Célzott: `node --import tsx --test tests/<fájl>.test.ts` a `source/`-ban, mindhárom fájlra (terheletlenül).
- Mutációs próba (4.1, 4.3) a forrás másolatával, utána `cmp` + `git diff --quiet`.
- Terheléses ellenpróba: a régi változat a `git show HEAD:<út>` másolata (ideiglenes, nem commitolt `tests/zz-old-*.test.ts`), az
  új a munkafa fájlja; azonos ablakban 10 + 10 példány; ablakonként ≤ 2 perc terhelés.
- `npm run gate:stage`.

## 8. Kockázatok, maradó tételek (jegy-szöveg)

- Visszavonás: a három tesztfájl commitjának revertje; termékkód nem változik.
- **Jegy-javaslat 1 — teljesítmény (nem ingadozás):** „PERF(szobank): a `findFormInText` bejegyzésenként új `iu` regexet fordít
  (`validate.ts:49-58`), a bank-szintű invariáns teszt CPU-idejének ~35%-a (7,7 s). Javaslat: statikus szóhatár-regexek + egyszerű
  minta-keresés, azonos szemantikával (kódpont-alapú előző karakter); mérés előtte / utána a teszt CPU-diagnosztikájával.”
- **Jegy-javaslat 2 — mért, nem bukott, falióra-függő minták (megfigyelésre):** terheléses próbán (folyamatos 48 pörgető, illetve
  szaggatott 20 pörgető, ablakonként 2–5 futás) zöldek maradtak: `nickname-filter.test.ts:279-312` (`< 200` / `< 50` ms),
  `game-quiz-contract-cache.test.ts:45-53` (relatív arány), `rt-gateway.test.ts:823-842` (`< 1000` / `< 2500` / `< 500` ms),
  `web-gather-gpt.test.ts:136` (`< 1500` ms), `scripts/qa/hooks/hook-failure.test.mjs:137,142` (`< 1000` / `< 5000` ms),
  a `runInNewContext(..., { timeout: 1000 })` hívások (`lesson-html-score`, `scorer-corpus` mérve; `open-answer-short`,
  `score-english-negation`, `v1-kotojeles-szam` ugyanaz a minta). Időzítő-sorrendre épülő, de azonos időtartamú (FIFO, ezért
  determinisztikus) vagy egyetlen várakozású minták, zöldek: `lesson-experience.test.ts:235`, `bank-cross-repair.test.ts:59,128`,
  `single-run-engine.test.ts:562,573`, `admin-korszerusites.test.ts:70`, `studio-one-step-persist.test.ts:27,125`,
  `html-files-cache-swr.test.ts`, `arbiter.test.ts:127`, `design-thumb.test.ts:10`, `jm0-privacy-guards.test.ts:142`,
  `lesson-clip.test.ts:83`, `web-studio-handoff.test.ts:26`, `player-codes.test.ts:136-156`. A legerősebb (vegyes) terhelésnél a
  `single-run-engine`, `arbiter`, `lesson-experience`, `bank-cross-repair`, `hook-failure` a próbaszkript 110 s-os határidején
  túl futott (leállítva, nem bukás) — NEM DÖNTHETŐ EL; teendő: a következő ingadozásnál a bukó teszt nevével új jegy.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-19-idozitesfuggo-tesztek-vegrehajtas.md`
