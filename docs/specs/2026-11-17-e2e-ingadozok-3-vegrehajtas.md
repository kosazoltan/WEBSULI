# Végrehajtási utasítás — E2E-ingadozók, 3. kör (kanban #76, #31)

**Állapot:** folyamatban – 2026-11-17, ág `fix/e2e-ingadozok-3`
**Terv:** `docs/specs/2026-11-17-e2e-ingadozok-3.md`

## Fájlok

- `source/tests/lesson-result-email.spec.ts` (1)
- `source/tests/duel-online.spec.ts` (2)
- `source/tests/game-win-paths.spec.ts` (3)
- `source/tests/joystick-response.spec.ts` (4)
- `source/tests/speed-math-play.spec.ts` (5)
- `docs/specs/2026-11-17-e2e-ingadozok-3*.md`

Termékkódhoz csak akkor nyúlunk, ha a gyökérok termékhiba ÉS a fájl nincs a párhuzamos PR-ok listáján (terv „Nem cél”).

## Reprodukció (közös)

A CI útja: buildelt szerver (`npm run build:e2e`, egyszer; utána a szerver `node dist/index.js`), eldobható Postgres
(`scripts/run-e2e-tests.ts`), 1 worker, `retries: 0`, Chrome `--disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`
(szoftveres WebGL), saját port 5231. Ehhez egy IDEIGLENES, gitignore-olt konfiguráció (`source/playwright.repro.tmp.config.ts`) és
egy IDEIGLENES CPU-lassító segéd (`source/tests/support/cpu-throttle.tmp.ts`: `REPRO_CPU` → CDP `Emulation.setCPUThrottlingRate`
minden lapra, a `browser.newContext()`-tel nyitott kontextusokra is) szolgál; a spec tetejére ideiglenesen
`import "./support/cpu-throttle.tmp";` kerül. Egyik sem kerül commitba (a `*.tmp.ts` minta a `.gitignore`-ban; a spec-sor
commit előtt eltávolítva, `git diff` ellenőrzi).

```powershell
cd source
$env:REPRO_CPU='6'; node --import tsx scripts/run-e2e-tests.ts --config playwright.repro.tmp.config.ts tests/<spec> --grep=<minta> --repeat-each=20
```

(PowerShellben a `-g <minta>` két tokenje egy szkript-paraméterként elveszett — „No tests found”; a `--grep=<minta>` egy token.)

## Lépések

1. **lesson-result-email** — a reload előtt `expect.poll` egyetlen `page.evaluate`-tel: a tárolóban mindkét `…:<kind>:sent:round-…`
   jelző megvan. Célzott kísérlet: a `/results` válasz 400 ms-os késleltetése (ideiglenes `REPRO_DELAY`) — előtte a hiba
   determinisztikus, utána nem.
2. **duel-online „EGYSZERRE”** — a CI-trace szerint (lásd Mérés) a két `tap()` közül az egyik a `duel-rematch` gombra várt, amely a
   másik fél kérésének megérkezésekor lecserélődött. Javítás: `holdableRt(ctx)` — `context.routeWebSocket` a valós idejű csatornán
   (`RT_PATH`), a szerver → kliens irány visszatartható; mindkét kontextusban `hold()`, két `tap()`, várakozás, amíg mindkét
   `room:rematch` kérés elment, majd `release()`. (Az első próbált változat — azonnali `page.evaluate`-kattintás — a versenyt csak
   szűkítette: 2/20 bukás az előfeltételen; elvetve.)
3. **game-win-paths** — a mérés előtt `waitForStable(page, '[data-testid="<eredmény>"] button')`
   (`tests/support/game-mobile-quality.ts`): a gombok beállt dobozára vár (C-33: végállapotú elem).
4. **joystick-response renderszámláló** — az álló szakasz (változatlan sorrendben, elöl) a 30 várakozás után még 30 × a lépcsőkben
   MÉRT átlagos `touchMove`-idő ideig tart (`touchMoveCost`, `hold(false, 30 * perTouchMs)`), így a hossza a rezgőével összemérhető;
   a JOY_RESULT-ban az álló nyers száma és hossza is (`renderStill`, `stillMs`); a tesztkeret 180 → 240 s (mérés lent). (Az első
   változat — rezgő előbb, az álló `moving.ms`-ig — a Szökőárnál bukott: lásd Mérés 4.)
5. **speed-math-play menetvégi hurok** — a hurok állapotát egy atomi `page.evaluate` olvassa (vége? / koppintható rossz drón
   középpontja), a `count()` → `boundingBox()` pár helyett.
6. Kapuk: `git diff --check`, `npx.cmd eslint <változott fájlok> --max-warnings 0`, `npm run check`, `npm run check:test`, az
   érintett specek ismételt futtatása; push előtt teljes kapu (lint, check, check:test, `npm test`,
   `node scripts/qa/three-phase-check.mjs --base origin/main`).
7. A joystick-spec a #484 ágán (`origin/feat/jatek-j3a-kockavadasz-runabanya`, leválasztott munkafa, csak futtatás) is.

## Mérés

Windows x64, CI-azonos út (fent), egyszerre több saját és idegen e2e-futással terhelt gépen. Az „előtte” futások a változatlan
spec befagyasztott másolatán (`tests/<név>.before.spec.tmp.ts`, gitignore-olt) mentek — ez egyben az ellenpróba (a javítás nélküli
változat ugyanazon az úton).

### 1. lesson-result-email (kanban #31)
- Tünet: `újratöltés után nincs újabb beküldés` — 2 helyett 3 POST (main run 44028107372, #484 run 44042768012, mindkettő flaky).
- Gyökérok — TESZT: a poll a kérés ELFOGÁSAKOR teljesül, a kliens a `…:quiz:sent:<roundId>` jelzőt a 202 FELDOLGOZÁSA után írja
  (`client/src/lesson-runtime/resultReport.ts`); ha az újratöltés közé esik, a lezárt kör jogosan újra beküldődik. A termék helyes:
  a szerver a kört egyedi kulccsal (`roundKeyOf`, `server/lesson-result-email.ts`) egyszer rögzíti; a „küldés előtti jelző” (#31 B
  opció) elvetve — a megszakított kérés után nem küldene újra, az eredmény elveszne.
- Előtte: természetes úton 6× lassítással 0/13 a hibamódra (7 eset a 30 s-os tesztkereten bukott — a 6× ennél a tesztnél
  túl lassú); célzott kísérlet (a `/results` válasz 400 ms-os késleltetése): **5/5 bukik** pontosan a CI-hibával (3 POST).
- Javítás: `tests/lesson-result-email.spec.ts` — a reload előtt `expect.poll` egy `page.evaluate`-tel: mindkét `:sent:round-` jelző.
- Utána: késleltetéssel **5/5 zöld**; 4× lassítással **20/20 zöld**.

### 2. duel-online „mindkét játékos EGYSZERRE nyomja a Visszavágót”
- Tünet: 150 s-os időtúllépés (#484 run 44042768012, 1. kísérlet). A CI-riport lépései: a két `Tap duel-rematch` közül az egyik
  46 ms alatt kész, a másik soha nem fejeződött be; az `error-context`: „Szuper Holló visszavágót kért — … nyomd meg a
  Visszavágót!” (a másik fél kérése megjött, lejárt), a saját `duel-rematch` gomb helyén a kérés-kártya.
- Gyökérok — TESZT: a `tap()` képkockákig vár a stabilitásra; közben a gyorsabb fél kérése megérkezett, a lassabbnál a
  `duel-rematch` gomb lecserélődött, a tap a soha vissza nem térő gombra várt. Termékhiba nincs.
- Előtte (6×, 20×): **4/20 bukik** — 3 × a tap a `duel-rematch`-re vár a 150 s-ig (a CI-mechanizmus), 1 × a link-oldal betöltése
  6× lassítással túllépte a `duel-code-input` 5 s-os várakozását (terhelési zaj, a CI-n nem fordult elő).
- 1. próba (azonnali `page.evaluate`-kattintás, a gomb meglétének ellenőrzésével): 6×, 20×: **2/20 bukik** az előfeltételen (az
  egyik kliens kattintásakor a gomb már lecserélődött) — a verseny csak szűkült, elvetve.
- Javítás (2. próba): `holdableRt` — a szerver → kliens üzenetek visszatartása, amíg mindkét `room:rematch` el nem ment.
- Utána: 1× **3/3 zöld**; 6×, 20×: **19/20 zöld** — az egy bukás a 150 s-os tesztkeret a lezárásban (a visszaszámlálás-ellenőrzés
  ELŐTTE lefutott). A futás 4 párhuzamos e2e-vel terhelt gépen ment (medián 69 s a javítás előtti 46 s helyett), de hogy a bukás
  oka a terhelés, az NEM bizonyított (UNVERIFIED; alternatíva: a `routeWebSocket`-tel átvezetett csatorna lassítja a meccset vagy a
  `ctx.close()`-t). A „20-ból mindegyik zöld” elfogadás így betű szerint NEM teljesült (19/20). Az első CI-körökben a teszt idejét
  figyelni kell; ha a 150 s-os keret újra előjön, külön jegy nyomkövetéssel.

### 3. game-win-paths (Tornado; a közös eredményképernyő)
- Tünet (helyben, egy másik ügynök 8 futásából 1): a gomb 43,96 px < 44.
- Gyökérok — TESZT: a közös `ResultScreen` párbeszéde rugós belépővel nő (`scale 0.9 → 1`, `game-engine/mobile/ResultScreen.tsx`); a
  teszt a megjelenés utáni első képkockákban mérhetett. Kísérlet (képkockánkénti magasság a megjelenéstől, 3 futás): az első
  képkocká(k)ban **43,20–43,69 px** (terhelés alatt 141 ms-ig < 44), 200–375 ms alatt 48 px-re áll be — 3/3 futásban.
- Előtte: CI-azonos úton 0/20 (6×) és 0/20 (1×) — a mérés csak ritkán esik az ablakba; a kísérlet az ablak létét igazolja.
- Javítás: `tests/game-win-paths.spec.ts` — `waitForStable(page, '[data-testid="<eredmény>"] button')` a mérés előtt.
- Utána: a teljes spec (8 eset × 20, 1×): **160/160 zöld**; a beállt méret a kísérletben 48,0–48,15 px.

### 4. joystick-response › block-craft-quiz renderszámláló (kanban #76)
- Tünet: main run 44049286407 (csak-doksi commit): „a mozgás-események többlet-renderje a tárcsán” 23 > 6, majd 18 > 6; a CI
  JOY_RESULT-sorai ugyanazon a lapon: többlet −12, −6, +23, +18 — kétértékű, nem folytonos szórás.
- Gyökérok — TESZT: a rezgő szakasz minden CDP-érintése megvárja a lap feldolgozását (egy képkocka), az álló csak 30 × 16 ms-ot
  vár; az álló szakasz ezért jóval rövidebb, a kis álló szám (0–2) nagy szorzóval arányosítódik. CI-azonos úton mérve: main 1×:
  álló 1,4–9,0 s a rezgő 10,8–22,4 s mellett, többlet −7…+4 (0/10 bukás); **#484 ága 1×: álló 1,2–4,1 s a rezgő 10,7–20,2 s
  mellett, többlet −8…+9, 1/10 bukás („a lapon” 9 > 6)**. A main CI-n a szorzó ~20–30 (a −12 / +23 ugrás egy render-különbség).
- 1. javítás-változat (ELVETVE): a rezgő szakasz előbb, az álló `moving.ms`-ig. A Kockavadászra jó volt (main 12/12, #484 12/12,
  többlet −4…+4), de a teljes spec Szökőár-esete 2/2 bukott: az utána következő álló szakaszban a Szökőár lap-renderje a felére
  esett (16–30 a rezgő 48–59-ével szemben, azonos hosszon) → többlet +32 / +29. A sorrend megfordítása a „mindkét szakaszban
  azonos mozgás” feltételt sértette. (A régi sorrend a CI-n sem volt stabil a Szökőárnál: a 44049286407 / 44028107372 /
  44042768012 futásokban −3…+1, de a main 44067781689-es futásában (26bae97f) a Szökőár többlete (lap / tárcsa) +9 / +9 (bukás), a
  nyomkövetett újrapróbán +76 / +95, harmadikra +2 / +1; ugyanabban a futásban a Kockavadász tárcsája +21 és +23 (lap −8, −12) — a rövid álló ablak zaja tehát a
  Szökőárt is érinti, ami a gyökérok-állítást erősíti.)
- Javítás (2. változat): `tests/joystick-response.spec.ts` — a sorrend marad (álló, majd rezgő); az álló a 30 várakozás után még
  30 × a lépcsőkben mért átlagos `touchMove`-idő ideig tart; a JOY_RESULT-ban `renderStill` / `stillMs` is. A küszöb (≤ 6) és a
  tárcsa ≤ lap + 2 szabály változatlan.
- Tesztkeret: main CI nyomkövetés nélküli kísérletei a javítás ELŐTT 134 s és 145 s; az álló szakasz helyben a rezgő 1,0–1,7-szerese
  lett → a CI-n legfeljebb ~1,7 × 22,6 ≈ 38 s többlet → ~183 s, a 180 s-on túl → 240 s.
- Utána (2. változat, CI-azonos 1×): a teljes spec (4 játék × 3) **12/12 zöld** (Tornado +1…+3, Aszteroida −3…+1, Szökőár −15…+1,
  Kockavadász −4…+1); Kockavadász külön: **main 7/7 zöld** (összesen 10/10; lap −2…+1, tárcsa −1…+0; álló 14,2–16,7 s, rezgő
  9,6–11,0 s), **#484 ága 7/7 zöld** (lap −1…+1, tárcsa 0…+1; álló 13,3–14,9 s, rezgő 8,8–10,4 s; ugyanaz a spec-fájl,
  leválasztott munkafában, a #484 9083a7c0 fején, saját buildjével).
- Termék-mutációs ellenpróba (pl. ideiglenes `setState` a tárcsa `onChange`-ében): NOT RUN — ok: az idő a reprodukciókra ment,
  és a termékfájl (`BlockCraftQuiz.tsx`) egy nyitott PR hatókörében van. Levezetés (a független ellenőré): eseményenkénti
  renderelésnél a 30 mozgás-esemény ~+30 többletet adna, a küszöb ≤ 6, a javított mérés szórása −15…+3 → a mérő nem lett
  érzéketlen a teljes eseményenkénti renderelésre; részleges regresszióra (néhány többlet-render) az érzékenység korlátozott.
  Kockázat: alacsony; a következő körre javasolt a mért mutációs próba.

### 5. speed-math-play menetvégi hurok (kanban #76)
- Tünet (#76): 6× lassítással 2/10 túllépte a 180 s-ot a menetvégi hurokban.
- Gyökérok — TESZT (mechanizmus igazolva): a hurok `count()`-tal látta a rossz drónt, majd a `boundingBox()` (időkorlát nélkül)
  rá várt; ha közben a menet véget ért, a drón eltűnt, és a `boundingBox()` a tesztkeretig várt. Kísérlet: `count()` = 1 → a menet
  vége (teszt-kampóval) → `boundingBox({ timeout: 20 000 })` **2/2 a teljes 20 s-ot kivárta** és időtúllépéssel tért vissza.
- Előtte: a hurok-időtúllépés természetes úton 35 futásból nem jött elő (6×: 13/20, 4×: 6/15 bukás KORÁBBI lépésen — a
  koppintott drón „idle” maradt / a pont 0; ez másik, nem gyökérokozott mechanizmus, lásd „Nem megfogott”).
- Javítás: `tests/speed-math-play.spec.ts` — atomi `page.evaluate` (vége? / koppintható rossz drón középpontja).
- Utána: 4×: 11/15 zöld, a 4 bukás ugyanaz a korai, nem gyökérokozott koppintás-mechanizmus, mint előtte (6/15); a menetvégi
  hurok egyszer sem lógott (a leghosszabb futás 92 s, előtte 165 s).

### Nem megfogott / nem hatókör
- speed-math-play, korai lépések ≥ 4× lassítással: a jó / rossz drónra koppintás néha nem regisztrál. Kísérlet: a drón a
  megjelenés után 190–260 ms alatt beáll (4× és 1× egyaránt), tehát nem a repülés közbeni koppintás az ok; a fix 650 ms-os
  várakozás cseréje ezért visszavonva. Gyökérok: UNVERIFIED (gyanú: a koppintás alatti fosztogató `raiderUnderFinger`). A CI-n nem
  fordult elő (main CI: 61–63 s, zöld).
- word-ladder-play:48 — a koordinátor hatókör-változása szerint másik ágé; a CI-megfigyelések átadva.

### Reprodukciós csapdák (ebben a körben)
- PowerShell-szkript pozicionális paraméterkötése elnyelte a Playwright-argumentumokat → a TELJES suite indult (megszakítva).
- Ugyanabban a munkafában párhuzamos futások közös `test-results`-a: az új futás induláskor törli a másikét → futásonkénti `outputDir`.
- Egy másik ügynök ugyanazt a portot (5232) használta: a szerverem „eltűnt” (ERR_CONNECTION_REFUSED) → ritka port (5297).
- A reprodukciós konfigurációban a `trace: 'retain-on-failure'` minden futást nyomkövetett (lassított); a CI `on-first-retry`.
- A harness 60 perces korlátja: hosszú esetből 20 ismétlés nem fér bele.
