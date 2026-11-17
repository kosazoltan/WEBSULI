# Spec: Szkript-ellenőrző kapuk a teljes vertikumra (terv)

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök, tulajdonosi utasításra) · Állapot: JÓVÁHAGYVA (a tulajdonos kifejezett,
> kötelező érvényű utasítása 2026-11-17) · Kanban: #91
> Végrehajtás: `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum-vegrehajtas.md`
> Előzmény: `docs/specs/2026-11-17-minosegkapuk.md` (a meglévő lint / szakasz / push / PR / merge kapu, #489), runbook:
> `docs/minosegkapuk.md`.

## 0. A tulajdonos utasítása (Kósa Zoltán, 2026-11-17, szó szerint)

„A teljes repóban, a teljes működésben mindenütt legyenek szkript-ellenőrző kapuk minden fázisra, hogy minél kevesebb API-hívást kelljen
megvalósítani, és minél stabilabb legyen a munka folyamata. Mivel a szkriptek nem tudnak hazudni, félregondolni, túlgondolni,
túlpolírozni vagy lost-in-the-middle hibát elkövetni — a szkript, ha lefut, akkor az le van futva —, ezt gondold végig. Vidd végig a
teljes rendszeren ezt az eszközhasználó szkript-folyamatot, ellenőrzéseket, kapukat, ami a teljes vertikumot folyamatosan nézi, hogy ne
fordulhassanak elő a mesterséges intelligencia ügynökök által hallucinált vagy hazudott részek. Így sokkal feszesebb vázát lehet építeni
a teljes keretrendszernek. Értsd meg a célt, a szándékot, azt, hogy ezt hogyan kell megvalósítani, majd valósítsd meg ezeket a
biztonsági, ellenőrzési, minőségbiztosítási és folyamatbiztosítási kapukat úgy, hogy a program ne törjön, ne lassuljon be, hanem
kifejezetten fejlődjön, jobban működjön.”

## 1. Cél és elvek

Cél: a munkafolyamat minden fázisának legyen gépi belépő és kilépő kapuja, és az ügynöki (drága, tévedhető) ellenőrzés csak arra
maradjon, amit gép nem lát. Elvek (ezekhez mérjük a szeleteket):

1. **Az ügynök állítása nem bizonyíték.** Bizonyíték csak gép által előállított ÉS gép által ellenőrzött műtermék: futási rekord
   kilépési kóddal, kimenet-hash, számláló, API-válasz — a fej-commithoz kötve.
2. **Amit szkript eldönt, azt nem ügynök dönti el.** A gép által nem látható dolgok listája rögzített (5. fejezet), és szűkül.
3. **Láncolt bizonyíték:** a fázis kilépő bizonyítéka a következő fázis belépő feltétele.
4. **Fejlesztésidejű eszköz:** a kapuk a `source/` futásidejét nem érintik, a programot nem törhetik. Bevezetés fokozatosan:
   előbb FIGYELMEZTET (és méri a hamis riasztást), aztán TILT. A CI-ban, ahol nincs kit megkerülni, a determinisztikus kapu
   azonnal tilthat.
5. **Gyors kapu:** szakaszonként < 60 s cél; a drága lépés csak ott fut, ahol a változás érinti (útvonal-alapú kiválasztás).

## 2. NEM cél

- A termék futásidejű folyamatainak (tananyaggyártás / javítás / okosítás lépésgépe, egyfutásos motor, kérdésbank, játék, fiók,
  párbaj, kupon, ranglista) MÓDOSÍTÁSA. Ezeket ez a terv csak leltározza (3.2) és javaslatot tesz (S9); a módosításhoz külön terv és
  tulajdonosi jóváhagyás kell.
- A főág-védelem / kötelező ellenőrzések listájának változtatása (tulajdonosi hatáskör). Új CI-lépés a meglévő „Háromfázisú rend”
  jobba kerül, így kötelezővé válik anélkül, hogy a védelmet módosítanánk.
- Vészkijárat a kapukhoz. A hamis riasztást a kapu javítása szünteti meg (teszttel), nem kapcsoló.
- A játékok lapjainak, magjainak, tesztjeinek és a `source/tests/support/*`-nak a módosítása ebben a körben (nyitott PR-ok: #483–#486,
  J7b). Az S4 és S7 megvalósítása ezek összevonása után indul.
- A `docs/agent-csapdak.md` módosítása (a csapda-javaslatok a zárójelentésbe mennek, C-48).

## 3. A) Fázis-leltár

Jelölés: **SZ** = szkript teljesen ellenőrzi; **SZ/r** = szkript részben (a maradékot ügynök / ember / semmi); **Ü** = csak ügynök
(LLM); **E** = csak ember; **–** = semmi. A „Hiba” oszlop a 2026-11-17-i mért hibalista betűjele ((a)–(p), lásd 4.); idő = a kapu
becsült / mért futásideje.

### 3.1 Ügynök-munkafolyamat

| # | Fázis | Belépő feltétel | Kilépő bizonyíték | MA ellenőrzi | Szkripttel még ellenőrizhető | Gép NEM tudja (miért) | Kapu költsége | Hiba |
|---|---|---|---|---|---|---|---|---|
| 1 | Megbízás | tulajdonosi kérés | megbízás-szöveg | **–** | a megbízás tényállításainak (fájl, route, „gyorsítótárazott”) visszaellenőrzése a kódból (S2 formátum az orkesztrátorra is) | a kérés értelme, prioritás | < 5 s | (j) #487 premissza |
| 2 | Terv / spec | megbízás | `docs/specs/<név>.md` | **SZ/r** `three-phase-check.mjs` (létezés, hivatkozás) | elfogadási lista gépi ID-kkal (`<!-- acceptance-checklist -->`), EARS-pontonként teszt-hivatkozás (S3) | a terv helyessége, teljessége | < 2 s | (j) |
| 3 | Végrehajtási fájl | terv | `*-vegrehajtas.md`, első commit | **SZ/r** `three-phase-check.mjs` (sorrend, tervhivatkozás) | lépésenkénti „parancs → elvárt kimenet” sor gépi kinyerése és futtatása | az utasítás jósága | < 2 s | – |
| 4 | Szakaszonkénti fejlesztés | végrehajtási fájl | zöld `gate:stage` | **SZ** `stage-gate.mjs` (lint gyors, célzott unit, őrök) | teszt-integritás (S1), szakasz-bizonyíték rekord (S2) | szándék, elrendezés szépsége | 47 s (+ S1: ≤ 1 s) | (h)(i)(n) |
| 5 | Helyi ellenőrzés | zöld szakaszok | `pre-push-<fej>.json` | **SZ** `pre-push-gate.mjs` | csak-merge push, zöld CI-jú fejre push (S6) | – | 251 s | (k)(n) |
| 6 | Független ellenőr | zöld push-kapu | `review-<fej>.json` | **Ü** + `record-review.mjs` (formai) | a jelentés állításainak gépi visszaellenőrzése (S2), „gép megfoghatta?” címke számlálása (E) | játéklogikai szándék, UX | ~20–60 perc ügynök | (a)–(f)(j) |
| 7 | Push | zöld push-kapu + ítélet | távoli fej | **SZ** `check-quality-gates.mjs` hook | – | – | < 1 s | (k) |
| 8 | PR | zöld `gate:pr` | PR-leírás | **SZ/r** `pre-pr-gate.mjs` (sablon: elfogadás, futtatott, NOT RUN) | a leírás `[x]` pipáinak és „PASS” állításainak bizonyíték-egyezése (S2, S3); SPEC-VÁLTOZÁS-lista (S1) | a leírás érthetősége | 214 s + e2e | (j)(h) |
| 9 | CI | push | check-runok | **SZ** `.github/workflows/ci.yml` | teszt-integritás TILTÓ módban (S1), ingadozó-lista (S8) | – | ~60 perc (E2E) | (g)(l) |
| 10 | Bot-review | PR | review-szálak | **SZ/r** `pre-merge-gate.mjs` (nyitott szálak száma) | – | a bot-lelet jogossága | 36 s | – |
| 11 | Merge | zöld CI, szálak, ítélet | `merge-<PR>-<fej>.json` | **SZ** `pre-merge-gate.mjs` + hook + `active-runs-guard.sh` | – | – | 36 s | (n)(o) |
| 12 | Telepítés | merge `source/`-szal | Render deploy | **SZ/r** `verify-render-revision.mjs` (kézi indítás) | kötelező lépés a merge után (S5) | – | 2–10 perc (Render) | (o) |
| 13 | Telepítés utáni ellenőrzés | élő deploy | — | **E** (kézi curl) | `post-deploy-smoke.mjs`: revision = main fej, végpontok + időkeret, flag-állapotok (S5) | vizuális minőség élesben | < 60 s | (o)(p) |
| 14 | Kanban / memória / munkafa-higiénia | lezárt munka | — | **–** (szabály a globális CLAUDE.md-ben) | `hygiene-check.mjs`: munkafa ↔ PR ↔ ág ↔ kanban, kóbor fájlok (S6) | mit érdemes memóriába írni | < 30 s | (m)(k) |
| 15 | Retro | lezárt futás | retro-doksi | **–** | mért tényblokk gépi összeállítása (PR-ok, CI-körök, push-szám) a bizonyíték-láncból (E) | tanulság megfogalmazása | < 30 s | (k) |

### 3.2 A termék futásidejű folyamatai (CSAK leltár — nem módosítjuk)

A tananyag-motor: `source/server/studio/single-run/engine.ts` (`runSingleLesson`; minden modellállomás a `runStation`-on, legfeljebb
`SINGLE_RUN_FIX_ROUNDS = 3` javító fordulóval), menet: `docs/lesson-improvement.md`.

| # | Fázis | MA gépi ellenőrzés (fájl → függvény) | LLM / ember dönt | Szkripttel még (javaslat, S9) | Hiba |
|---|---|---|---|---|---|
| 16 | Forrás beolvasása | **SZ/r** `studio/verbatim.ts` `checkVerbatim`; `source-transcript.ts` `checkSourceQuotes`; `arithmeticSourceCorrections` | átirat, fogalmak (LLM) | igazolt fogalmak aránya a térképen | – |
| 17 | Évfolyam | **Ü** — csak 0–12 tartománycsekk (`engine.ts:316`) | LLM egyedül | determinisztikus évfolyamsáv-becslés | – |
| 18 | Tervezés | **SZ/r** `tools/outline-autofix.ts` `autofixOutline`; `step-io.ts` `outlineCoversMap` | LLM; tanár jóváhagy | – | – |
| 19 | Generálás, séma | **SZ/r** `shared/lesson-schema.ts` `lessonSchema`; `coverage.ts` `checkCoverageGate`; `shared/lesson-arc.ts` `checkLessonArc` | LLM (szerző) | a szókeret-túllépés ma csak megjegyzés | – |
| 20 | Ábrák | **SZ/r** `visual-patch.ts` `applyVisualPatch`; `grounding.ts` `checkGrounding` | LLM (animátor) | – | – |
| 21 | Gyakorlóbank | **SZ/r** `experience-builder.ts` `buildLessonExperience`; `engine.ts` `bankQualityGates` | LLM; a vak megoldó dönt, a döntést a kód hozza | – | – |
| 22 | Lektor | **Ü** (`lektor.ts` `classifyNotes` csak besorol) | LLM | blokkoló-statisztika a `lektorArchive`-ból | – |
| 23 | Végellenőrzés | **SZ** `resolveChoiceGate`, `verifyLessonSkillBank`, `experienceProblems` (`engine.ts:866–874`) | – | – | – |
| 24 | Böngészős próba futás közben | **–** (csak a CI Playwright-konfigok) | ember | a közzétett `/preview/:id` render-próbája telepítés után (S5-höz kapcsolható) | – |
| 25 | Mentés / közzététel | **SZ** `pipeline-store.ts` `publishLesson` (tranzakció, `workflowFence`, `targetBaseline` sha256) | – | – | (o) |
| 26 | Visszaolvasás | **SZ/r** `lesson-pipeline-routes.ts` `readPublishedLesson` — csak létezés | – | tartalom-hash és kvízdarabszám visszaolvasása | – |
| 27 | Javítás / okosítás | **SZ/r** `structured-improvement.ts` `assertRepairCandidate`; `improve/verify-html.ts` `verifyImprovedHtml` | LLM | – | – |
| 28 | Kérdésbank-export | **SZ/r** `quiz-export.ts` `exportQuizItemsForPublish` (`singleChoiceProblems`-szal csendben kihagy) | – | a kihagyott tételek száma riportban | – |
| 29 | Kérdésbank-végpont, előmelegítés | **SZ/r** `gameQuizBankService.ts` `gameQuizBankResponse` (+ tesztek); előmelegítés **–** | – | indulás utáni előmelegítés + időkeret (S5 méri) | (p) 12,7 s hideg |
| 30 | Játék (kliens) | **SZ/r** unit + sim + e2e; `game-sim-determinism-guard.test.ts` | ügynök (játéklogika) | játék-szerződés készlet (S4), teljesítmény-keret (S7) | (a)–(f)(p) |
| 31 | Játékos-fiók | **SZ** `player/auth-routes.ts` limiterek, `checkPlayerNickname` + tesztek | – | – | – |
| 32 | Párbaj | **SZ** `realtime/config.ts` `mpMode`, `routes/rt.ts` jegy-limiter + `rt-*.test.ts` | tulajdonos (MP_MODE) | – | – |
| 33 | Kupon | **SZ** `rewards/coupon-quiz.ts` `answerCouponQuiz`, `coupons.ts` `shouldIssueCoupon` | – | – | (b) kliensoldalon |
| 34 | Ranglista | **SZ/r** `POST /api/games/score` limiter + zod; hihetőségi csekk **–** | – | XP/másodperc kiugrás-riport a DB-ből | – |

### 3.3 Üzemeltetés

| # | Fázis | MA gépi ellenőrzés | Szkripttel még | Hiba |
|---|---|---|---|---|
| 35 | Build | **SZ** `render.yaml` buildCommand; `npm run verify`; CI `native-arch` | csomagméret-keret (S7) | (p) |
| 36 | Migráció | **SZ/r** `server/migrate.ts` `runMigrations` — `DATABASE_URL` nélkül csendben átlép | migráció előtti / utáni sémadiff | – |
| 37 | Indulás | **SZ/r** `server/index.ts` (két tábla, árva futások lezárása) | kötelező env-változók listája induláskor | (p) |
| 38 | Egészség | **SZ/r** `/api/health` (`routes.ts:989–996`: `status`, `revision`, `timestamp`, `uptime`); a Render a `/health`-et nézi (`render.yaml:10`, „OK”) | revision = main fej (S5) | (o) |
| 39 | Napló | **–** gépi összesítés | Render-napló hibaosztály-összesítő (S5, opcionális, kulcs csak env-ből) | – |
| 40 | Cron | **SZ/r** tesztek (`scheduled-publishing-db.integration.ts` stb.) | – | – |
| 41 | Leállás | **SZ** `gracefulShutdown` + tesztek | – | (o) |

### 3.4 Összesítés

41 fázis: **SZ** 12 · **SZ/r** 20 · **Ü / E** 4 (6 független ellenőr, 13 telepítés utáni ellenőrzés, 17 évfolyam, 22 lektor) ·
**–** 5 (1 megbízás, 14 higiénia, 15 retro, 24 böngészős próba futás közben, 39 napló). Az ügynök-munkafolyamat 15 fázisából 5-öt
ellenőriz teljesen szkript; a 15-ből 6 fázis (1, 6, 8, 13, 14, 15) állításai ma gépileg ellenőrizetlenek — ezek a hiánylista élén.

## 4. B) Hiánylista, rangsorolva

### 4.1 A mért hibák (2026-11-17)

Forrás: a hét független-ellenőri jelentés (#482–#487, J7b; összesen **140 lelet, 18 blokkoló**), a két retro
(`docs/handoffs/2026-11-16-*.md`, `2026-11-17-jatekok-utomunka-retro.md`), C-61…C-72. Megoszlás fő kategória szerint:

| Kat. | Leírás | Lelet | Blokkoló | Hogyan derült ki (jellemzően) |
|---|---|---|---|---|
| (a) | véletlen válasz szándék nélküli bemenetre | 18 | 7 | ellenőri próba-szkript (passzív / rezgő / húzó bot) |
| (b) | kupon módban elfogyó kérdések, elvesző forrás-jelölés | 7 | 3 | próba-szkript 1/3/8 tétellel |
| (c) | levágott / takart szöveg | 19 | 2 | sorbecslés a leghosszabb bank-tétellel, képernyőkép |
| (d) | a sim nem azt méri, amit a lap; bot-átkalibrálás | 10 | 1 | kódolvasás + próba |
| (e) | győzelem vereségre fordul | 4 | 1 | kódolvasás |
| (f) | megállítási okok feloldják egymást | 4 | 0 | kódolvasás |
| (h) | dokumentálatlan tesztlazítás | 5 | 2 | diff-olvasás |
| (i) | forrásszöveget regexszel néző „teszt” | 4 | 0 | kódolvasás |
| (j) | valótlan / ellenőrizetlen ügynöki állítás | 15 (+6 másodlagos) | 0 | kódolvasás, PR-leírás ↔ kód |
| (l) | ingadozó teszt | 2 | 0 | kódolvasás |
| (m) | közös fájl / rossz hely / `git checkout` | 2 (+2) | 0 | git |
| (n) | elavult / üres őr | 4 | 0 | kódolvasás |
| (p) | teljesítmény | 9 | 0 | kódolvasás |
| (g)(k)(o) | CI-GPU, fölösleges push, telepítés közbeni futás | 0 a jelentésekben | — | a retrókban: (k) C-62, (n) C-61 2 óra piros main, (o) |

A (h) két blokkoló esete, gépi szemmel: **J7b** `source/tests/tornado-sim.test.ts:312` (a `4da8b3b9` commitban):
`assert.ok(withQ >= without, …)` → `if (name === "SIM_WEAK") assert.ok(withQ >= without - 1, …)`, jelölés nélkül — a main-hez képest
új fájl, ezért CSAK commitonkénti diffből látszik; **#486 V1** `space-asteroid-sim.test.ts` „≤ 1.3” (a szabály ±10%). A (d) egyik
esete is gépileg látható: az Aszteroida `DODGE_IMPACT 1.2 → 0.65 → 0.38` bot-konstans csak a sim-ben, indoklás nélkül.

### 4.2 Rangsor

Pontozás: (várható megfogott hiba × gyakoriság × megtakarított API-hívás / CI-óra) ÷ ráfordítás, 1–5-ös skálán; az első három
tényező a 4.1 számaiból (gyakoriság = lelet / 7 PR), a megtakarítás a review-körök számából (a #485 4, a #486 3 kör).

| Hely | Hiány | Megfogja | Érték | Ráfordítás | Pont | Szelet |
|---|---|---|---|---|---|---|
| 1 | Teszt-integritás: lazított mérce a zöld teszt mögött | (h)(i)(d bot-konstans) + minden más kapu hitele | 5×3×4 | 1 (S) | 60 | **S1** |
| 2 | Ügynöki jelentés / PR-leírás állításainak gépi visszaellenőrzése | (j) 21 lelet, (k) a C-63 „nem kell megvárni” | 4×5×4 | 2 (M) | 40 | **S2** |
| 3 | Játék-szerződés tesztkészlet (passzív / zajos / mindig-jó bot, kupon, véglegesség, monotonitás) | (a)(b)(d)(e) 39 lelet, 12 blokkoló | 5×5×5 | 4 (L) | 31 | **S4** (az összevonások után) |
| 4 | Felirat-beférés a leghosszabb valódi bank-tétellel | (c) 19 lelet | 4×5×3 | 3 | 20 | az S4 része (S4c) |
| 5 | Ingadozó tesztek gépi listája | (l), retro C-64…C-66, órás CI-körök | 2×2×4 | 1 | 16 | **S8** |
| 6 | Spec ↔ teszt követhetőség (EARS-ID → teszt → bizonyíték) | (j) pipa-állítások, NOT DONE-hiány | 3×3×3 | 2 | 13 | **S3** |
| 7 | Folyamat-higiénia (munkafa ↔ PR ↔ kanban; csak-merge push) | (k)(m), C-62, C-70 | 3×3×3 | 2 | 13 | **S6** |
| 8 | Telepítés utáni füstpróba + időkeret | (o)(p), 12,7 s hideg indulás | 3×2×2 | 2 | 6 | **S5** |
| 9 | Teljesítmény-keret (fps, hosszú feladat, csomagméret) | (p) 9 lelet | 3×3×2 | 4 | 5 | **S7** |
| 10 | Termék futásidejű kapui (évfolyam, visszaolvasás-hash, export-riport) | — (még nem mért) | — | — | — | **S9** (csak javaslat) |

A sorrend indoklása: (1) az S1 a többi kapu ELŐFELTÉTELE — ha egy zöld teszt mögött lazított mérce állhat, egyetlen gépi bizonyíték
sem hihető; kicsi, új fájlban él, azonnal mérhető a mai ágakon. (2) Az S2 a legtöbb (j) leletet fogja, és az orkesztrátor minden
alügynök-jelentésnél API-hívást spórol (nem kell kézzel visszaellenőrizni); az S1 bizonyíték-rekordjára épül. (3–4) Az S4 (és
benne az S4c) a legértékesebb, de a nyitott játék-PR-ok tesztfájljaival ütközne: most csak terv (6.4). (5) Az S8 olcsó, és órás
CI-köröket spórol. (6) Az S3 az S2 formátumára épül. (7–9) S6, S5, S7. Az S3, S5, S6, S8 új fájlokban él; párhuzamosan kiadható
(7. fejezet).

## 5. Mit NEM tud gép (és ezért marad az ügynöké / emberé)

Rögzített lista; minden új szelet célja, hogy egy-egy tételét szűkítse.

1. Szándék és élmény: „jó-e” a játékmenet, igazságos-e a nehézség, érthető-e a felirat (gép csak a mérhető proxyt — beférés, takarás,
   reakcióidő-ablak — méri).
2. Esztétika: „szép-e” az elrendezés (gép: átfedés, levágás, 48 px, görgetősáv).
3. Tartalmi helyesség a forráshoz képest (a lektor / vak megoldó LLM; gép: egy-helyes-válasz, szó szerinti idézet).
4. A terv helyessége, teljessége; a döntés jogossága (gép: létezik-e, hivatkozik-e, van-e hozzá teszt).
5. A bot-review lelet jogossága (gép: meg van-e válaszolva, le van-e zárva).
6. Új állapottér-hiba, amelyre még nincs szerződés-eset — az S4 esetkészlete ezt szűkíti; minden ügynök által talált új hibaosztály
   szerződés-esetté válik (önfejlesztési hurok).

## 6. C) Architektúra

### 6.1 Láncolt bizonyíték-napló

A meglévő tár (`<git-common-dir>/websuli-qa-evidence/`, D4 a minőségkapu-tervben) bővül:

- **Rekord** (`<kind>-<azonosító>.json`): `kind`, `head` (40 jegy), `cmd` (a futtatott parancs, titok nélkül), `code` (kilépési kód),
  `ok`, `outSha256` (a teljes, szűrt kimenet hash-e), `at` (ISO), `prev` (a lánc előző rekordjának `sha256`-ja), `sha256` (a rekord
  saját hash-e a `sha256` mező nélkül), a kapuknál `steps`.
- **Lánc** (`chain.jsonl`): rekordonként egy sor (`kind`, `id`, `head`, `sha256`, `prev`). Az ellenőrző (S2) a láncot végigszámolja: egy
  utólag kézzel átírt rekord a hash-nél bukik. A lánc nem biztonsági határ (a tár helyben írható) — a cél a figyelmetlen vagy kitalált
  állítás kiszűrése, nem a szándékos csalás ellen véd (az ellen a CI a határ).
- **Új rekordtípusok:** `run-<id>` (`evidence-run.mjs`: tetszőleges parancs futtatása és rögzítése), `stage-<fej>` (a szakasz-kapu),
  `test-integrity-<fej>` (az S1 leletei), `claims-<hash>` (az S2 ítélete egy jelentésről). A meglévő `pre-push`, `pre-pr`, `merge`,
  `review` rekordok változatlanok; a láncba kötésük a #490 összevonása után (a `lib.mjs` ott változik).

### 6.2 Egységes kapu-futtató, útvonal-alapú kiválasztás

A meglévő `createGate` / `runLintSteps` / `runStageSteps` / `runPrePushSteps` lánc marad az egységes futtató. Új kapu = új modul
(`scripts/qa/gates/<név>.mjs`), egy exportált lépés-függvénnyel, amelyet a lánc egy jól körülhatárolt hunkkal hív. Az S1 lépése a
`runLintSteps`-be kerül — így egyetlen bekötéssel a szakasz-, push- és PR-kapuban is fut. Útvonal-alapú kiválasztás: a kapu csak a
konfigban megadott útvonal-mintákra illő változásnál dolgozik (S1: tesztfájlok + sim-kalibrációs fájlok); különben `SKIP`.

### 6.3 Figyelmeztető → tiltó mód kapunként

`gates.config.json` → `"modes": { "<kapu>": { "local": "warn" | "block", "ci": "warn" | "block" } }`. Helyben a kapu `warn` módban
`WARN`-t ad (a lánc zöld marad), `block` módban `FAIL`-t. A CI a `--mode block` kapcsolóval hívja (S1-től kezdve). Átállás `warn` →
`block` helyben: két hét vagy 20 PR után, ha a hamis riasztás aránya < 10% (6.5).

### 6.4 S4 — a játék-szerződés készlet terve (megvalósítás a #483–#486 és a J7b összevonása után)

**Miért:** az (a)(b)(d)(e) 39 lelete (12 blokkoló) ellenőri próba-szkriptekből derült ki (`passive.mts`, `noq.mts`, `drive*.mts`,
`coupon.ts`, `fidget.ts`, `drag.ts`, `mono.ts`, `balance*.test.ts`) — ugyanazokat a próbákat minden szeletben újra megírták. Ezeket
egyszer, közösen, kötelezően kell futtatni.

**Kiindulás (main + nyitott ágak, mérve 2026-11-17):** a közös `source/tests/support/game-sim.ts` már adja a `SimGame` felületet
(`step`, `question`, `answer`, `done`, `won`, `stats`, `simTimeMs`), a `runSim` / `runSimSeeds` futtatót és a négy botot
(`SIM_AVERAGE`, `SIM_YOUNG`, `SIM_STRONG`, `SIM_WEAK`). A kérdésforrás a közös `game-engine/play/questionDirector.ts`
(`QuestionProvider.couponOnly`), a forrás-jelölés `PlayQuestion.source` / `couponItemId`. A determinizmus-őr:
`source/tests/game-sim-determinism-guard.test.ts`.

**Adapter-interfész** (`source/tests/support/game-contract/types.ts`, additív a `SimGame`-re):

```ts
type ContractOpts = { seed: number; grade: number; questions: boolean;
  material?: readonly FourChoiceQuiz[]; coupon?: boolean;
  bot?: "normal" | "passive" | "noisy-hold" | "noisy-wobble" | "pre-question-input" | "drag" };
type ContractGame = SimGame & {
  askedKeys(): readonly string[];     // forrás-jelölés és ismétlés vizsgálatához
  answerLog(): readonly { id: string; source: string; couponItemId?: string; intent: boolean; atMs: number }[];
  fingerprint(): string;              // determinizmus; a vég utáni esemény nem változtathatja
};
type ContractAdapter = {
  gameId: string;
  create(o: ContractOpts): ContractGame;
  caps: { coupon: boolean; loss: boolean; noisy: readonly ContractOpts["bot"][] };
  page: { file: string; driverModule: string; driverExport: string };   // statikus import-egyezés
  calibration: { file: string; constants: readonly string[] };          // jelölendő bot-konstansok
};
```

**Kötelező esetek** (`source/tests/game-contract.test.ts`, minden adapterre): (1) passzív bot → 0 nyilvántartott válasz; (2) minden
`caps.noisy` bot → 0 `intent: false` válasz; (3) mindig-jó bot (`accuracy: 1`, reakció 1,8 / 2,8 / 4 s) → 0 rossz válasz; (4) kupon
1 / 2 / 3 / 8 tétellel → minden kérdés-kérésre van kérdés, a `source: "coupon"` és a `couponItemId` minden ismétlésen megmarad, nincs
közvetlen ismétlés (2+ tételnél); (5) `done()` után 200 lépés + egy jó válasz → `won()` és `fingerprint()` változatlan; (6)
pontosság 20 / 45 / 75 / 95% × 20 seed → a győzelmi arány monoton nem csökken, és `questions: true` ≥ `questions: false`; (7) azonos
seed → azonos `fingerprint()`; (8) statikus: a `page.file` a `driverModule`-ból importálja a `driverExport`-ot (ugyanaz, mint a sim);
(9) a `calibration.constants` változása csak `SPEC-VÁLTOZÁS` jelöléssel (az S1 „sim-kalibráció” szabálya). A megállítási okok mátrixa
(f) sim-szinten nem mérhető (egyetlen `paused` logikai érték van, a Tornado-meghajtóban az sincs): közös pause-ok modul nélkül ez az
e2e-ben marad (meglévő `*-play.spec.ts`), és a szerződés-kapu csak azt ellenőrzi, hogy minden játékhoz van ilyen spec.

**Illeszthetőség** (a nyitott ágak olvasva): Matek (`lib/speedMath`, `createTowerDriver`, nincs kupon / `askedKeys` /
ujjlenyomat a sim-szinten) — adapter + 2 kis sim-bővítés; Szólétra (`lib/wordLadder`, közös mag-függvények, NINCS közös meghajtó) —
`caps` kivétel a (8)-ban; Tornado J7b (`createChaseDriver`, `passive` / `wobble` / `steerOnly` bot, `fingerprint`) — szinte kész;
Szökőár J1a (`createTsunamiDriver`, natív `coupon`) — kész; Kockavadász J3a (`createRuneMine`, `accidentalPicks`, nincs vereség:
`caps.loss = false`); Brain Rot J5a (`createBrainRotDriver`, `prematureAnswers`, natív `coupon`); Aszteroida J6a (csak a meghajtó
közös, a lap saját three.js-világot futtat — a (8) itt a meghajtóra és a `crystals.ts`-re szűkül, és a sim-világ ≠ lap tényét a
`caps` rögzíti). Kupon opció hiányzik: Matek, Szólétra, Kockavadász, Aszteroida, Tornado sim-gyára (`couponOnly: false` drótozva) —
mindegyik kap egy `coupon?` opciót.

**Kapu:** `scripts/qa/gates/game-contract-gate.mjs` — bukik, ha egy `gates.config.json` `games`-beli játéknak nincs adaptere
(`source/tests/support/game-contract/adapters/<gameId>.ts`), vagy az adapter kihagy egy esetet indoklás nélküli `caps`-szel; a
szakasz-kapu játékváltozásnál futtatja (útvonal-alapú). **S4c — felirat-beférés:** a leghosszabb valódi bank-tétel (a
`quiz-bank` végpont pillanatképéből) × a játék tényleges célszélessége (adapter: `labelBox(view)`), a mobil mérő nézetein + egy
hajlítható nézeten (S7).

### 6.5 Hamis riasztások mérése

Minden kapu-futás a leleteit a rekordba írja (`findings`: szabály, fájl:sor, jelölt-e). Hamis riasztás jelölése:
`node scripts/qa/gates/false-alarm.mjs --gate <név> --finding <fájl:sor> --reason "<ok>"` → `false-alarms.jsonl` (S-metrika szelet,
6.6). A kapu nem tanul a jelölésből (nincs csendes elfogadás): a hamis riasztás oka a kapu javítása, teszttel.

### 6.6a Közös kimeneti konvenció (minden ellenőrző szkript — `scripts/qa/gates/` és `scripts/qa/checks/` is)

Egyeztetve a párhuzamos `chore/allapot-ellenorok` munkával (`scripts/qa/checks/`: `memory-check`, `kanban-check`, `env-doctor`,
`websuli-allapot-ellenor` skill), hogy egy orkesztrátor / kapu egységesen olvassa őket:

- **Kilépési kód:** `0` = nincs hiba (figyelmeztetés lehet); `1` = legalább egy hiba (HAMIS állítás, bukott ellenőrzés); `2` = a szkript
  nem tudott futni (hiányzó bemenet, git / gh / hálózat hiba, értelmezhetetlen fájl) — a hívó a `2`-t is BUKÁSNAK veszi, soha nem
  „nincs lelet”-nek.
- **Gépi kimenet (`--json`):** egyetlen JSON-objektum a stdout-on: `{ "schema": "websuli-check/1", "tool": "<név>", "head": "<40 jegy
  | null>", "ok": <bool>, "exitCode": 0|1|2, "counts": { "<ÁLLAPOT>": <n> }, "items": [ { "id": "<stabil azonosító>", "status":
  "IGAZ" | "HAMIS" | "NEM ELLENŐRIZHETŐ" | "PASS" | "FAIL" | "WARN" | "SKIP", "ref": "<fájl:sor | parancs | #PR | …>", "detail":
  "<rövid, szűrt szöveg>" } ], "ms": <futásidő> }`. Az ember-olvasható kimenet (`--json` nélkül) ugyanezt sorokban + összesítő
  táblában adja (`createGate` stílus). Titok, e-mail-cím, kapcsolati szöveg a kimenetben nincs (`redact`).
- **Bizonyíték:** ha a szkript a fejre szóló döntést hoz, rekordot ír a tárba (`<tool>-<fej>.json`, 6.1), a láncba kötve.

### 6.6 Mi fut helyben, mi a CI-ban

| Kapu | Szakasz | Push | PR | CI |
|---|---|---|---|---|
| S1 teszt-integritás | warn | warn | warn (+ PR-leírás) | **block** (a „Háromfázisú rend” jobban; a PR-leírás a `github.event.pull_request.body`-ból) |
| S2 állítás-ellenőrző | — | — | — (az orkesztrátor futtatja a jelentésre) | — (helyi tár kell) |
| S3 spec ↔ teszt | — | warn | warn | warn → block |
| S4 játék-szerződés | játékváltozásnál | ✓ | ✓ | ✓ (Unit Tests job, a teszt része) |
| S5 füstpróba | — | — | — | merge után, orkesztrátor (élő cél) |
| S6 higiénia | — | csak-merge / zöld-fej push | — | — (helyi állapot) |
| S7 teljesítmény | — | — | játékváltozásnál | később (szoftveres WebGL-en a keret más) |
| S8 ingadozó-lista | — | — | tájékoztat | ütemezett (`schedule`), később |

## 7. D) Szeletterv

Minden szelet külön, kis PR (~400 sor diff irányelv), a szakasz- / push- / PR-kapuval, független ellenőrrel. Sorrend a 4.2 szerint.
Részletes, kiadható megbízás-szöveg: a végrehajtási fájl „Megbízások” fejezete.

| Szelet | Tartalom | Fájlok (új / módosul) | Tesztek | Bevezetés | Párhuzamos? |
|---|---|---|---|---|---|
| **S0** | ez a terv + végrehajtás | `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum{,-vegrehajtas}.md` | `three-phase-check` | — | — |
| **S1** | teszt-integritás kapu | új: `scripts/qa/gates/test-integrity.mjs` + `.test.mjs`; mód.: `lint-gate.mjs` (1 lépés), `gates.config.json` (`testIntegrity`, `modes`), `ci.yml` (1 lépés), `docs/minosegkapuk.md` (szakasz) | `node --test`; ellenpróba a 5 nyitott ágon | helyben warn, CI block | S0 után |
| **S2** | állítás- és hivatkozás-ellenőrző + láncolt bizonyíték (tulajdonosi utasítás 2026-11-17 este: „a keresések / találatok pontossága” — elsőrendű szállítandó) | új: `evidence-chain.mjs`, `evidence-run.mjs`, `verify-report.mjs` (gépi `allitasok` blokk + szabad szöveges hivatkozások: `fájl:sor`, `fájl:sor-sor`, backtickes útvonal, `npm run …` / `node scripts/…`, commit, `#PR`, „N/M teszt”), `report-template.md` (+ tesztek); mód.: `stage-gate.mjs` / `pre-push-gate.mjs` `main()` (rekord), `AGENTS.md` (1 mondat), `websuli-pr-elotti-kapu` skill, `docs/minosegkapuk.md`; a `pre-pr-gate.mjs` (PR-leírás) és a `record-review.mjs` (ellenőri jelentés: hamis hivatkozásnál ítélet nem rögzíthető) bekötése a #490 után egy lépésben ráilleszthető hunkként (végrehajtás S2.5) | `node --test`; próba a saját zárójelentésen | a HAMIS hivatkozás bukás | S1 után |
| **(kiadva)** | állapot-ellenőrzők | `scripts/qa/checks/` (`memory-check`, `kanban-check`, `env-doctor`, termék-kereső aranykészlet), `websuli-allapot-ellenor` skill — a `chore/allapot-ellenorok` ágon, másik alügynök; a 6.6a konvenció szerint | saját | — | igen (diszjunkt) |
| **S3** | spec ↔ teszt követhetőség | új: `scripts/qa/spec-trace.mjs` + teszt; mód.: `pre-push-gate.mjs` (1 lépés), `docs/specs/_TEMPLATE.md` | `node --test` | warn | S2 után (formátum), S5/S8-cal párhuzamos |
| **S4** | játék-szerződés készlet | új: `source/tests/support/game-contract/*`, `source/tests/game-contract.test.ts`, `scripts/qa/gates/game-contract-gate.mjs`; mód.: a hét sim-gyár (`coupon?` opció) | maga a készlet | warn → block | a játék-PR-ok összevonása UTÁN |
| **S5** | telepítés utáni füstpróba | új: `scripts/qa/post-deploy-smoke.mjs` + teszt; mód.: `websuli-merge-elotti-kapu` skill (merge utáni lépés) | `node --test` (injektált fetch) | tájékoztató → kötelező lépés | igen (diszjunkt) |
| **S6** | folyamat-higiénia | új: `scripts/qa/hygiene-check.mjs` + teszt; mód.: `pre-push-gate.mjs` (csak-merge / zöld-fej push lépés) | `node --test` | warn | igen; a `pre-push-gate.mjs` hunk miatt az S2 / S3 után vonandó össze |
| **S7** | teljesítmény-keret | új: `scripts/qa/perf-budget.mjs`, `source/tests/game-perf.spec.ts`, `perf-budget.json`; mód.: (egyeztetve) `tests/support/game-mobile-quality.ts` nézetlista | e2e | tájékoztató → block | a játék-PR-ok után |
| **S8** | ingadozó-követő | új: `scripts/qa/flaky-report.mjs` + teszt, `scripts/qa/known-flaky.json` | `node --test` (rögzített napló-mintákkal) | tájékoztató | igen (diszjunkt) |
| **S9** | termék futásidejű kapui | csak javaslat-doksi (3.2 „Szkripttel még” oszlop) | — | tulajdonosi döntés | — |
| **S10** | metrikák | új: `scripts/qa/gate-metrics.mjs`, `false-alarm.mjs`; az ellenőri jelentés leleteinek `gép: igen / nem / részben` címkéje | `node --test` | — | a #490 után (a skill ott változik) |

## 8. E) Mérőszámok

A `gate-metrics.mjs` (S10) a bizonyíték-tárból és a `gh`-ból számol, nem ügynök:

1. **Megfogott hiba kapunként:** `findings` darab / kapu / hét, ebből jelöletlen (bukás) és jelölt.
2. **Hamis riasztás:** `false-alarms.jsonl` / összes lelet, kapunként. Cél: < 10% (a `block` átállás feltétele).
3. **Megtakarított CI-kör:** PR-onkénti push-szám és E2E-futásszám (`gh run list --branch`), a bevezetés előtti 30 PR mediánjához mérve.
4. **Független ellenőr leleteinek megoszlása:** a jelentés-sablonban minden lelet `gép: igen | nem | részben` címkét kap; arány
   „gép megfoghatta volna” — ennek csökkennie kell (a kapuk átveszik), és minden „igen” egy új kapu-szabály jelöltje.
5. **Az ellenőrzött jelentések aránya:** `claims-*` rekordok / alügynök-jelentések; elutasított (FAIL) jelentések száma és oka.
6. **Kapu-futásidő:** a rekordok `ms` mezőjéből; a szakasz-kapu teljes ideje nem nőhet 5 s-nál többel szeletenként.

## 9. F) Kockázatok és korlátok (őszintén)

- **A hook és a helyi kapu nem biztonsági határ.** Kikapcsolható, a tár kézzel írható; a lánc-hash a figyelmetlenséget fogja, nem a
  szándékos csalást. A megkerülhetetlen pont a CI — ezért az S1 ott tilt, és ahol lehet, minden új kapu a CI-ban is fut.
- **Hamis riasztás ára:** minden téves FAIL egy ügynöki kört (API-hívást) és bizalmat visz. Ezért a fokozatos bevezetés és a mérés.
  A diff-alapú heurisztika (S1) határesetei: refaktor, amely állítást mozgat (pár-keresés tompítja), új teszt átnevezése, generált
  pillanatképek — a hamis riasztást a mérce lazítása nélkül, pontosabb párosítással kell csökkenteni.
- **Karbantartási teher:** minden kapu kód + teszt; a konfig-listák (tesztfájl-minták, játék-kulcsszavak) elavulhatnak — a
  `gates.config.json`-ban, kód nélkül bővíthetők.
- **A jelölés kijátszható:** egy `SPEC-VÁLTOZÁS` megjegyzés önmagában semmit nem igazol; ezért kell a spec-diff ÉS a PR-leírás
  egyezése. A döntés jogosságát gép nem látja (5. fejezet) — azt a független ellenőr nézi, de már célzottan, a kapu által felsorolt
  sorokon.
- **Szkript is hibázhat:** a kapu hibás szabálya hamis biztonságot ad. Ezért minden szabálynak van pozitív ÉS negatív tesztje, és
  mutációs ellenpróba (commit után, C-70).
- **Sebesség:** a git ebben a repóban Windows-on lassú lehet; a kapu egyetlen `git log -p` hívással dolgozik, nem commitonként.

<!-- acceptance-checklist -->
- [ ] A1: a terv tartalmazza a teljes vertikum fázis-leltárát (41 fázis; belépő / kilépő / ma ki ellenőrzi / mit lehetne / mit nem
  tud gép / költség / mért hiba).
- [ ] A2: rangsorolt hiánylista a mért (a)–(p) hibákból, pontozással és sorrend-indoklással.
- [ ] A3: architektúra: láncolt bizonyíték, egységes futtató, útvonal-alapú kiválasztás, `warn` → `block` mód kapunként, hamis riasztás
  mérése, helyi / CI megosztás.
- [ ] A4: szeletterv S0–S10, fájlokkal, tesztekkel, bevezetési móddal, párhuzamossággal; az S4 adapter-interfésze és a hét játékmag
  illeszthetősége.
- [ ] A5: WHEN egy tesztfájl diffje (a main-hez VAGY commitonként) állítást töröl / kikommentez, számküszöböt / relációs jelet
  változtat, lazább matcherre vált, timeoutot / retries-t növel, `force: true`-t / `waitForTimeout`-ot vagy forrásszöveg-vizsgálatot
  vezet be, illetve sim-kalibrációs konstanst módosít, és nincs érvényes `SPEC-VÁLTOZÁS` jelölés THEN the test-integrity kapu SHALL a
  konkrét fájl:sorral jelezni (helyben `WARN`, a CI-ban `FAIL`) — S1.
- [ ] A6: WHEN a jelölés megvan, a hivatkozott spec a diffben van és a tesztre utal, és a PR-leírás felsorolja THEN the kapu SHALL
  átengedni — S1.
- [ ] A7: WHEN egy alügynök-jelentésből hiányzik a gépi `allitasok` blokk, vagy a fej / fájl:sor / PASS-bizonyíték / PR-állapot /
  módosított-fájl-lista / kapu-lánc nem egyezik a valósággal THEN the `verify-report.mjs` SHALL `FAIL`-t adni a konkrét eltéréssel —
  S2.
- [ ] A8: a kapuk a `source/` futásidejét nem módosítják; a szakasz-kapu ideje szeletenként legfeljebb + 5 s.
