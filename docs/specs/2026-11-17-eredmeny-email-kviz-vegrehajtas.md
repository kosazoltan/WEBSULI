# Végrehajtási utasítás — eredmény-e-mail: kvíz beküldése és kérdésenkénti levél

**Állapot:** T1–T9 kész; T10 kész; T11 kész; T12 kész; T13 kész; T14 kész; T15 (Vercel-lelet) kész, E34 a DB-kör zöldjére vár; T16 kész (bizonyíték a zársorban); T17 kész (bizonyíték a zársorban); T18 (3. célzott kör, 2026-11-19) kész; T19 (PR-review a 44487292-es fejre, 2026-11-20) kész; T20 (6. gépi kör, 2026-11-20) folyamatban – ág `fix/eredmeny-email-kviz`
Terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`

Útvonalak a `source/` alatt. Meglévő tesztet nem módosítunk; a `tests/lesson-result-email.spec.ts`-hez nem nyúlunk (#492).
A `server/lesson-result-email.ts` kézbesítési része (`sendLessonResult`) változatlan.

## T1 — a levél tartalma (tiszta modul)

`shared/lesson-result-email.ts`:

- `GradedQuiz` új mezője: `rows: Array<{ question: string; picked: string | null; correct: string; ok: boolean }>` — a kör MINDEN
  ismert kérdése a `picks` sorrendjében; a `wrong` mező változatlan marad (a meglévő tesztek és hívók).
- `gradeQuiz`: a `rows` kitöltése (`ok = pick === correctIndex`; `picked = null`, ha a pick −1 vagy nincs ilyen opció).
- `GradedTaskRow` új mezője: `sample: string` (a feladat mintaválasza); `gradeTasks` kitölti.
- `buildResultEmail`:
  - kvíz: `<ol>` minden sorral — `<p><strong>kérdés</strong></p><p>✅ válasz</p>` / `<p>❌ válasz — helyes: …</p>` /
    `<p>❌ <em>(nem válaszolt)</em> — helyes: …</p>`; üres `rows` esetén a lista kimarad;
  - feladatok: a meglévő sor után `<p><em>Mintaválasz:</em> …</p>` (csak ha van minta);
  - minden beillesztett szöveg `esc`-en megy át.
- Teszt: ÚJ fájl `tests/lesson-result-email-quiz.test.ts` — minden kérdés szerepel (helyes, hibás, kihagyott); a helyes válasz
  szövege; `<script>` opciószöveg escape-elve; a feladatok levelében a mintaválasz; `rows.length === summary.total`.
- Parancs: `node --import tsx --test tests/lesson-result-email-quiz.test.ts tests/lesson-result-email.test.ts tests/learner-attribution.test.ts`.

## T2 — a helyi kvíz beküldése az utolsó válasz után

- ÚJ fájl `shared/quiz-round.ts` (import nélkül, hogy egységtesztből közvetlenül hívható legyen — a `resultReport.ts` böngészős
  importjai miatt ott nem lenne az): `quizRoundComplete(round: { ids: readonly string[]; picks: Readonly<Record<string, number>> }): boolean`
  — van kérdés, és mindegyikre van `picks` bejegyzés;
- `client/src/lesson-runtime/resultReport.ts`, `useResultReport`: a küldés feltétele `kind === "quiz" ? (!!round.finishedAt || quizRoundComplete(round)) : !!round.finishedAt`
  (a 26. sor `!round.finishedAt` feltétele helyett; a `tasks` ág és a 45 s-os tartalék változatlan). A jelző, a `sending` őr és az
  újrapróbálás változatlan.
- `client/src/lesson-runtime/LessonExperienceView.tsx:83-85`: a megjegyzés frissítése (a hívás változatlan).
- Teszt: ÚJ fájl `tests/result-report-complete.test.ts` a `quizRoundComplete`-re (üres kör, hiányos, teljes) és szerkezeti őr a
  küldés feltételére (a `tests/request-retry.test.ts` mintájára, a forrás olvasásával).

## T3 — böngészős próba

ÚJ fájl `tests/lesson-result-email-quiz.spec.ts` (a `lesson-result-email.spec.ts` ál-API-jának mintájára, saját másolattal):

1. 24 kérdés megválaszolva → 1,5 s várakozás után 0 kvíz-beküldés; a 25. válasz után gomb NÉLKÜL pontosan 1 (`picks`: 25 kulcs,
   pontszám-mező nélkül); a „Kvíz kiértékelése” megnyomása és újratöltés után is 1.
2. 3 kérdés megválaszolva + „Kvíz kiértékelése” → „Lezárom a kihagyásokkal” → 1 beküldés, 22 darab −1.

Előtte E2E-sorompó (külön lépés); `npm run test:e2e -- tests/lesson-result-email-quiz.spec.ts tests/lesson-result-email.spec.ts --workers=1`.

## T4 — kapuk

Szakaszonként `npm run gate:stage`; a végén `npm run gate:push`. Push / PR nincs: fej-hash jelentése, utána a független ellenőr.

## T5 — S1b: a levél és a séma (`shared/lesson-result-email.ts`)

- `resultRequestSchema`: mindkét alakban opcionális `startedAt: z.number().int().positive()`; a kvíz alakban opcionális `partial: z.boolean()`.
- `ResultMeta = { startedAt?: number; partial?: { answered: number; total: number }; supersedesPartial?: boolean }`; a `GradedTasks` és a
  `GradedQuiz` opcionális `meta` mezőt kap (a `sendLessonResult` hívási sora így nem változik — az S2 ág ugyanott módosít).
- `gradePartialQuiz(quiz, picks)`: csak a megválaszolt (≥ 0) kérdéseket pontozza (`gradeQuiz`), `meta.partial = { answered, total: a kör kérdésszáma }`.
- `formatBudapest(date)`: `Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", … })` → „2026. 11. 17. 20:41”.
- `buildResultEmail`: opcionális `sentAt` (alapérték: most); a fejben „Beküldve: … (magyar idő)”, és érvényes `meta.startedAt` esetén
  „A kör kezdete: …”; `meta.partial` → tárgy „Kvíz (félbehagyva: A / T)” + állapotsor; `meta.supersedesPartial` → felülíró mondat.

## T6 — S1b: szerver (`server/lesson-result-email.ts`, csak az útvonal-kezelő; a `sendLessonResult` változatlan)

- `PARTIAL_DELAY_MS = 15 perc` (`setPartialDelay` teszthez), `pendingPartials: Map<kulcs, { timer, send }>`; `partialLimiter` 40 / 15 perc;
  a `resultLimiter` a pillanatképet kihagyja (`skip`).
- Kvíz + `partial: true`: ha nincs megválaszolt kérdés → `202 { queued: false }`; különben a körkulcs
  `roundKeyOf(who, "quiz-partial", roundId)`, a várakozó bejegyzés cseréje + időzítő újraindítása (`unref`); `202 { queued: true, partial: true }`.
  A pillanatkép a tanulói tevékenységnaplóba nem ír külön sort a végleges mellé (a `learnerId` a „félbehagyva” küldésnél nem megy át).
- Végleges kvíz: a várakozó pillanatkép törlése; ha a „félbehagyva” levél már kiment (van `lesson_result_emails` sor a részleges
  körkulccsal), `meta.supersedesPartial = true`.
- `startedAt` → `meta.startedAt` (mindkét fajtánál).

## T7 — S1b: kliens

- `client/src/lib/queryClient.ts`: exportált `warmCsrfToken()` és `sendKeepalive(url, data): boolean` (gyorsítótárazott token nélkül
  nem küld; `fetch` `keepalive: true`, `credentials: "include"`, a szokott fejlécekkel; hibát nem dob).
- `shared/quiz-round.ts`: `answeredCount(round)`, `roundTooOld(startedAt, now)` (`STALE_ROUND_DAYS = 7`).
- `client/src/lesson-runtime/resultReport.ts`: a beküldés törzsében `startedAt`; a le nem zárt, 7 napnál régebbi kör nem megy;
  kvíznél az első válasznál `warmCsrfToken()`; `visibilitychange` (rejtett) és `pagehide` figyelő: ha a kör nincs lezárva, nem
  teljes, van válasz, több, mint a legutóbb elküldött pillanatképben, és a végleges jelző nincs beírva → `sendKeepalive(…, { kind: "quiz",
  roundId, picks, partial: true, startedAt, … })`.

## T8 — S1b: tesztek

- `tests/lesson-result-email-quiz.test.ts` új esetei: részleges pontozás (csak a megválaszoltak), tárgy és állapotsor, felülíró mondat,
  dátum Europe/Budapest (téli és nyári időpont), a séma új mezői (`partial` csak kvíznél; hibás `startedAt` elutasítva).
- `tests/result-report-complete.test.ts`: `answeredCount`, `roundTooOld` (határértékek).
- `tests/lesson-result-email-db.integration.ts` új esetei (rövidített késleltetéssel): két pillanatkép → egy „félbehagyva” levél a
  legutolsóból; pillanatkép + végleges a késleltetésen belül → csak a végleges; „félbehagyva” levél után végleges → felülíró mondat;
  0 válaszos pillanatkép → nincs levél.
- `tests/lesson-result-email-quiz.spec.ts` új esete: 3 válasz → rejtetté válás → 1 pillanatkép (`partial: true`, 3 megválaszolt);
  változatlanul újra rejtett → nincs újabb; még 2 válasz + rejtett → 2. pillanatkép (5); válasz nélkül rejtett → nincs kérés.

## T9 — PR #510 Codex-leletek

- `client/src/lib/queryClient.ts`: `sendKeepalive(url, data): Promise<boolean>` — igaz csak 2xx válasznál; token nélkül, hálózati hibánál,
  nem 2xx-nél hamis; nem dob.
- `shared/quiz-round.ts`: `snapshotDue(state, roundId, count)` tiszta döntés — `state = { sent: { roundId, count } | null; pending:
  { roundId, count } | null }`; küldendő, ha `count > 0`, és sem az elküldött, sem az úton lévő állapot nem fedi ugyanarra a körre.
- `client/src/lesson-runtime/resultReport.ts`: a számláló `{ roundId, count }` ref (P2); a küldés után `pending`, siker után `sent` +
  `localStorage`, kudarc után `pending` törlése (P3); a pillanatkép-függvény ref-ben, és egy üres függőségű effekt lebontó ága
  meghívja (P1).
- `server/lesson-result-email.ts` (útvonal-kezelő): `finalizedRounds` (lecke|körazonosító → lejárat, 24 óra, legfeljebb 20 000 bejegyzés);
  a végleges kvíz beküldésekor beíródik; `roundFinalized(lessonId, whos, roundId)` = memória VAGY a nyilvántartás végleges sora
  (`kind = "quiz"`, a kör végleges körkulcsaival); a pillanatkép fogadásakor → `202 { queued: false, finalized: true }`; a várakozó
  levél küldése előtt újra.
- Tesztek: `tests/result-report-complete.test.ts` (`snapshotDue`: új kör, úton lévő, kudarc utáni újrapróba); `tests/lesson-result-
  email-db.integration.ts` (végleges → pillanatkép: nincs levél, memóriából és — a memória ürítése után — a nyilvántartásból is;
  pillanatkép → végleges: csak a végleges); `tests/lesson-result-email-quiz.spec.ts` (útvonalváltás → pillanatkép; új kör első válasza
  → pillanatkép; 503 válasz után a következő háttérbe kerülés újraküld).

## T10 — a vak ellenőrzés leletei (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R1–R8)

Sorrend: leletenként előbb a BUKÓ teszt (a hiba reprodukciója), utána a javítás. A T6 „a `sendLessonResult` változatlan” megkötése
itt feloldva (az S2 foglalás-szelet már a főágon van).

- **R1 (K1, S1)** `server/lesson-result-email.ts`:
  - `sendLessonResult(input, retry = true, gate?: SendGate)`; `SendGate = (attempt: () => Promise<SendOutcome>) => Promise<SendOutcome>`.
    A kapu MINDEN kísérletet körbevesz (az első küldést és a `setTimeout`-os újrapróbát is, amely ugyanazzal a kapuval hívja újra).
    Kapu nélkül a viselkedés változatlan.
  - `withRoundLock(kulcs, run)`: példányon belüli, ígéretláncos kizárás, kulcs: `lecke|körazonosító`; a lánc végén a bejegyzés törlődik.
  - Pillanatkép kapuja: `attempt => withRoundLock(kulcs, async () => (await roundFinalized(...)) ? { sent: 0, duplicate: true } : attempt())`.
  - Végleges kvíz: `markFinalized` + a várakozók törlése SZINKRON, a válasz (`202`) azonnal; a háttérben
    `withRoundLock(kulcs, …)` alatt a részleges sorok `delivered` listájának olvasása (→ `supersedesPartial`), majd a kizárás
    elengedése után a végleges levél küldése.
  - Teszt (ÚJ fájl `tests/lesson-result-email-partial-db.integration.ts`, felvéve a `scripts/run-learning-db-tests.ts` listájára; a
    kérések címét a megosztott titokfejléces `X-Forwarded-For` adja, így a keretek próbánként külön kulcsra esnek): (a) a „félbehagyva”
    első kísérlete mindkét címzettnél bukik, az újrapróba előtt megjön a végleges → a kimenet pontosan két végleges levél, felülíró
    mondat nélkül; (b) 60 próba a végleges beküldéssel az időzítő körül eltolva (lassított küldővel) → minden próbában: vagy nincs
    részleges levél és a véglegesben nincs felülíró mondat, vagy a részleges levelek a véglegesek ELŐTT mentek ki és minden végleges
    tartalmazza a mondatot.
- **R2 (K2)** `client/src/lesson-runtime/useExperienceRound.ts`: a kör sémája opcionális `lastAnsweredAt`; `LessonExperienceView.tsx`: a
  kvízválasz rögzítésekor `lastAnsweredAt: Date.now()`. `shared/quiz-round.ts`: `roundActivityAt(round)` = `lastAnsweredAt ?? startedAt`.
  `resultReport.ts`: mindkét korhatár-vizsgálat `roundTooOld(roundActivityAt(…), Date.now())`; a kvíz törzsében `lastAnsweredAt` megy.
  `shared/lesson-result-email.ts`: a kvíz alak opcionális `lastAnsweredAt` mezője. A `result-report-complete.test.ts` két forrásminta-
  állítása a szabályváltozást követi (nem törlődik). Teszt: egységteszt (`roundActivityAt` + határok), böngésző (8 napja megnyitott kör:
  ma megválaszolva végleges megy; 3 új válasz + rejtés → pillanatkép; 8 napos utolsó válaszú kör új válasz nélkül → nincs kérés).
- **R3 (K3)** `resultReport.ts`: a pillanatkép-függvény `ref`-ben; külön effekt a kör azonosságára (`startedAt` + azonosítók), amelynek
  lebontó ága meghívja (a `committed` ekkor még az elhagyott kört tartja). Böngészőteszt: 4 válasz → „Új kvíz” → „Új kör indítása”
  rejtés NÉLKÜL → 1 pillanatkép 4 válasszal, a régi kör azonosítójával.
- **R4 (K4)** `client/src/lib/queryClient.ts` `sendKeepalive`: token = `peek()`, ennek hiányában `getToken()`; 403 → `invalidate()` → `getToken()` → egy ismétlés.
  Böngészőteszt: a token a kérés előtt „lejár” (a szerver-utánzat a régit 403-mal utasítja el) → a pillanatkép az új tokennel megy át;
  ha a tokenkérés is bukik → nincs rögzítés, újratöltés után a tárolt kör pillanatképe elmegy.
- **R5 (S3)** `gradePartialQuiz(quiz, picks, roundSize?)`: `total = max(roundSize ?? ismert azonosítók száma, megválaszoltak)`; az
  útvonal-kezelő a szerver körméretét adja át; `roundTooOld(body.lastAnsweredAt ?? body.startedAt, most)` → `202 { queued: false, stale: true }`.
  A meglévő integrációs teszt „4 / 5” várakozása a szabály szerint a körméretre változik (nem gyengítés: a szám szigorúbb forrásból jön).
- **R6 (S4)** útvonal-kezelő: a pillanatkép fogadásakor a részleges sorok `delivered` listája; ha nem üres →
  `202 { queued: false, partial: true, alreadySent: true }`.
- **R7 (S5)** `pendingPartials` bejegyzése: `answered` + `send`; kevesebb válaszú új pillanatképnél a várakozó `send` marad.
- **R8 (S5)** `apiRequest` opció: `keepalive`; a `resultReport.ts` a kvíz végleges kérésénél adja át; siker után a `partial` kulcs törlése.
- **S6** viselkedést mérő tesztek a forrásminták mellé: böngészőben a `pagehide` esemény, a kérés módja (POST, CSRF-fejléc, nem
  `sendBeacon`), token nélkül nincs küldés, a feladatoknál a teljes kitöltés gomb nélkül nem küld.
- **S2** nincs kódváltozás (tulajdonosi döntés).

Parancsok: `node --import tsx --test tests/result-report-complete.test.ts tests/lesson-result-email-quiz.test.ts`;
`npm run test:learning-db`; `npm run test:e2e -- tests/lesson-result-email-quiz.spec.ts tests/lesson-result-email.spec.ts --workers=1`;
a gyökérből `npm run gate:stage`, `npm run gate:push`.

## T11 — tulajdonosi döntés (keretek) és telepítési sorrend (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R9–R10)

- **R9** ÚJ fájl `server/lesson-result-limits.ts` (adatbázis-import nélkül, hogy egységtesztből hívható legyen): `RESULT_RATE_LIMIT =
  { windowMs: 15 perc, final: 60, partial: 60 }`, `isPartialRequest`, `resultLimiter`, `partialLimiter`, `resetPartialLimiter`; a
  `server/lesson-result-email.ts` innen importál (és a tesztek kedvéért továbbexportál). Teszt: ÚJ `tests/lesson-result-limits.test.ts`
  (express + a két korlátozó + üres kezelő; a cím a megosztott titokfejléces `X-Forwarded-For`): 60 → 202, 61. → 429, másik cím → 202,
  mindkét fajtára, és a két keret függetlensége. Mutációs ellenpróba: a konstans 59 / 61 értékével a teszt bukik (kézi, naplózva).
  A `tests/lesson-result-email-db.integration.ts` „10 / 15 perc” tesztje az új konstanst követi (60 / 61).
- **R10** ÚJ import nélküli `shared/result-compat.ts`: `legacyResultBody(body)` — végleges törzsből a `startedAt` / `lastAnsweredAt`
  elhagyva; pillanatképre (`partial: true`) és új mező nélküli törzsre `null`. `client/src/lesson-runtime/resultReport.ts`: a végleges
  `apiRequest` 400 hibájára, ha van régi alak, egy ismétlés azzal. Teszt: egység (`legacyResultBody`), böngésző („régi szerver” csonk:
  az új mezős törzset 400-zal utasítja el → a végleges kvíz és a feladatok kérése az új mezők nélkül elfogadva; a pillanatkép nem megy
  át végleges alakban).
- Utána: `git merge origin/main`, `gate:stage`, e2e-sorompó KÜLÖN lépésben, böngészős kör, DB-kör, `gate:push`.

## T12 — a második vak ellenőrzés leletei (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R11–R14)

Leletenként előbb BUKÓ teszt, utána a javítás.
- **R11** `server/lesson-result-email.ts`: `pendingPartials` kulcsa `lecke|kör` (a bejegyzés a `who`-t is tárolja); `mayActOn(owner, who)` =
  `owner === who || owner.startsWith("guest:")`; a pillanatkép körkulcsa `roundKeyOf("partial-round", "quiz-partial", roundId)` (R6, R1
  felülírás-vizsgálat, sendLessonResult); `finalizedRounds` értéke `{ until, who }`, a `roundFinalized` csak összeférő véglegesítést
  vesz figyelembe. Teszt (`lesson-result-email-partial-db.integration.ts`): ujjlenyomat nélküli + ujjlenyomatos, és IP-váltásos
  pillanatkép → 1 levél / címzett; részleges levél IP1-ről, végleges IP2-ről ujjlenyomattal → felülíró mondat; igazolt (párosított)
  tanuló köre vendéggel nem írható felül / nem törölhető.
- **R12** `shared/result-compat.ts`: `RESULT_API_VERSION = 2`; `server/routes.ts` `/api/csrf-token` → `{ csrfToken, resultApi }`;
  `client/src/lib/queryClient.ts`: a token mellett a jelzés tárolása (`resultApiReady()` szinkron, `ensureResultApi()` aszinkron);
  `resultReport.ts`: pillanatkép csak jelzéssel; a végleges törzs új mezői csak jelzéssel; az R10 ismétlés csak jelzéssel. A böngészős
  csonkok (új szerver) `resultApi: 2`-t adnak; a „régi szerver” csonk nem. Teszt: egy gyerek kérései régi szerver mellett (háttérbe
  kerüléssel is) → pontosan 1, régi alakú kérés; a rögzített kérést 30× visszajátszva a főág szigorú sémájának és 20-as, `skip`
  nélküli keretének másolatára → 20 elfogadott, 10 × 429 (= a régi kliens eredménye), kettős küldés nincs. A korábbi R10 böngészőteszt
  a jelzés nélküli útra változik (első kísérlet már régi alakú).
- **R13** `shared/lesson-result-email.ts`: részleges levélben „Minden megválaszolt kérdésre helyes választ adott.”; `meta.lastAnsweredAt`
  → „Utolsó válasz: …” (részleges levélnél a „Beküldve” helyett); séma: opcionális `clientNow` mindkét fajtánál; a szerver a
  `clientNow`-val korrigálja az időbélyegeket és a 7 napos határt. Teszt: egység (szöveg, dátumsor, séma) + DB (késő kliensóra:
  `startedAt`/`lastAnsweredAt`/`clientNow` 30 nappal a múltban, de egymáshoz képest frissek → elfogadva).
- **R14** `server/lesson-result-email.ts`: `flushPendingPartials(timeoutMs)` — minden várakozó időzítő törlése és a küldés azonnal,
  `Promise.race` időkorláttal; `server/index.ts` `gracefulShutdown`: a pool lezárása előtt, 15 s. Teszt (DB): 60 s-os késleltetésű
  várakozó → ürítéskor azonnal kimegy; lefagyott küldőnél az ürítés az időkorláton belül visszatér.
- **Jegy:** K5 (a kanban CLI e gépen nem elérhető: a jegyszöveg a zárójelentésben az orkesztrátornak).
- **Beolvasztott párhuzamos javítás:** a távoli `db9323ea` (vendég két kulcsának összevonása) a kódban ennek az ágnak az R11-ével
  helyettesítve; a DB-tesztje megtartva (`tests/lesson-result-email-db.integration.ts`, „független review K-1”), az ágon érvényes segédre
  (`clearFinalizedRounds`) és az R5 szerinti összes-számra (25) igazítva.
- Utána: `git merge origin/main`, `gate:stage`, sorompó KÜLÖN lépésben, DB-kör, böngészős kör, `gate:push`.

## T13 — a harmadik vak ellenőrzés leletei (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R15–R17)

Leletenként előbb BUKÓ teszt (`tests/lesson-result-email-partial-db.integration.ts`), utána a javítás (`server/lesson-result-email.ts`).
- **R15:** `finalizedRounds` értéke újra csak a lejárat (tanulófüggetlen), `roundFinalized` kilét-feltétel nélkül; a végleges ág a
  `lecke|kör` várakozót feltétel nélkül törli. A meglévő „R11 (első rögzítő)” teszt végleges-beküldéses része az R15 szerint változik
  (a vendég végleges beküldése mostantól elnyomja), a tartalom-felülírás tiltása (`conflict: true`) változatlanul mérve. Új teszt: fiók
  pillanatképe, majd vendég végleges → csak két végleges levél, „félbehagyva” nincs, a várakozó azonnal törlődik.
- **R16:** a pillanatkép-ágban, ha a várakozó első rögzítője vendég és a beküldő más, a küldő vendég-attribúcióval épül
  (`GUEST_LEARNER`, `guest: true`), és a bejegyzés `who`-ja a vendég marad. Teszt: vendég kör → bejelentkezett átvétel → a levélben
  „Vendég tanuló”, a fiók neve nincs benne.
- **R17:** a pillanatkép-ágban `answered >= körméret` → `202 { queued: false, partial: true, complete: true }`. Teszt: 25 válaszos
  pillanatkép → nincs várakozó, nincs levél.
- Utána: `gate:stage`, sorompó KÜLÖN lépésben, DB-kör, böngészős kör, fetch + ősellenőrzés, `gate:push`.

## T14 — a negyedik vak ellenőrzés feltétele (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R18)

- Előbb BUKÓ teszt (`tests/lesson-result-email-partial-db.integration.ts`): vendég (ujjlenyomattal) véglegesít → `clearFinalizedRounds()`
  (újraindítás utánzása) → ujjlenyomat nélküli, más IP-jű pillanatkép ugyanarra a körre → `{ queued: false, finalized: true }`, nincs
  levél; ugyanez fiók → vendég kilétváltással; a jelzősor `created_at`-ját 25 órával visszaállítva a pillanatkép újra ütemeződik.
- Javítás (`server/lesson-result-email.ts`): `finalRoundKeyOf(roundId)`; a végleges kvíz-ágban a jelzősor beszúrása
  (`onConflictDoUpdate` a `created_at` frissítésével; hiba → naplózás, a beküldés megy tovább); `roundFinalized` a jelzősort is nézi
  (`created_at` > most − 24 óra).
- Utána: `gate:stage`, sorompó KÜLÖN lépésben, DB-kör, böngészős kör, fetch + ősellenőrzés, `gate:push`.

## T15 — Vercel-lelet: a kapu hibája után újrapróba (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R19)

- Előbb BUKÓ teszt (`tests/lesson-result-email-partial-db.integration.ts`): teszthez való hibainjektálás a `roundFinalized`-be
  (`setFinalizedCheckFault`, a meglévő `setReleaseFault` mintájára); egyszeri hiba a kapuban → az újrapróba a levelet kiküldi; egyszeri
  hiba, majd a késleltetésen belül végleges beküldés → nincs részleges levél.
- Javítás (`server/lesson-result-email.ts`, `sendLessonResult`): a kapu hibájának `catch` ágában `retry` esetén egy újrapróba
  (`sendLessonResult(input, false, gate)`, `retryDelayMs` múlva), a napló „— újrapróbálja” utótaggal.
- Utána: `gate:stage`, új fej; a vak visszanézés és a `gate:push` (zárral) az orkesztrátortól.

## T16 — gépi vak ellenőrzés (GPT-6.2 Sol) leletei (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R20–R23)

Leletenként előbb BUKÓ teszt, utána a javítás.
- **R20 (L1)** `client/src/lesson-runtime/resultReport.ts`: `sending` ref → az úton lévő kör azonosítója; a lezárulás egy állapot-
  számlálót léptet (az effekt függősége), így a beküldő újra kiértékel. A `result-report-complete.test.ts` két forrásmintája a
  szabályváltozást követi. Böngészőteszt: az első kör végleges válaszát a csonk visszatartja, közben új kör 25 válasszal → a második
  végleges kérés gomb nélkül megérkezik; felengedés után sincs harmadik.
- **R21 (L2)** `server/lesson-result-email.ts`: körönkénti pillanatkép-változat (`partialVersions`); `schedulePartial` a megtartott
  állapot változatát írja; a kapu a saját változatát veti össze az aktuálissal. DB-teszt: egyszeri kapuhiba → újabb (4 válaszos)
  pillanatkép hosszabb késleltetéssel → az eredeti újrapróba idején nincs levél → csak a 4 válaszos megy ki.
- **R22 (L4)** ugyanott: a `waiting` beolvasása, a `conflict` döntés és a vendég-attribúció az `earlier` lekérdezés UTÁN. Teszthez:
  `setPartialIntakeHook` (az utolsó várakozás után hívódik). DB-teszt: a vendég kérése a horogban áll, amíg az igazolt tanuló pillanatképe
  ütemeződik → a vendég `conflict: true`, a levél az igazolt tanulóé.
- **R23 (L3)** `client/src/lib/queryClient.ts` `sendKeepalive`: a 403 utáni új token után `resultApiReady()` nélkül nincs ismétlés.
  Böngészőteszt: 403 után jelzés nélküli új token → egyetlen (elutasított) pillanatkép-kérés, a második nem megy.
- **L5:** kanban-jegy.
- Utána: `gate:stage`; a nehéz körök (reprodukció, DB, böngésző, `gate:push`) a zársorban.

## T17 — gépi vak ellenőrzés 2. célzott köre (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R24–R25)

Leletenként előbb BUKÓ teszt, utána a javítás.
- **R24 (L1, L2)** `client/src/lesson-runtime/resultReport.ts`: kimenő sor (`websuli:result-outbox:v1` a `localStorage`-ban; memória-tartalék),
  `enqueueResult` (szinkron, a befejezéskor), `drainResultOutbox` (egyszerre egy; körönkénti memóriabeli kísérlet-számláló és
  `nextAt`); az ürítő hívja az `apiRequest`-et (a meglévő forrásminták szerinti alakkal), sikernél jelző + a részleges kulcs törlése.
  `shared/quiz-round.ts`: `outboxRetryDelayMs(attempts, retryAfterSec)` tiszta függvény. `client/src/App.tsx`: induláskor
  `drainResultOutbox()`. A `result-report-complete.test.ts` R20-as forrásmintái a sorra változnak (dokumentált spec-változás). Tesztek:
  egység (késleltetés), böngésző (429 Retry-After nélkül: 3 s alatt 1 kérés; `Retry-After: 1` mellett pontosan 3 kérés; lassú token +
  azonnali dokumentumváltás a főoldalra → a végleges kérés az új oldalon megérkezik).
- **R25 (L3)** `server/lesson-result-email.ts`: a pillanatkép-ág R6-vizsgálata, várakozó-beolvasása, `mayActOn` és ütemezése
  `withRoundLock(lockKey, …)` alatt. Teszthez: `setGateCheckHook` (a kapuban a véglegesítés-ellenőrzés után). DB-teszt: a régi kísérlet a
  horogban áll, közben új pillanatkép → felengedés után a régi (2 válaszos) levél megy ki, az új pillanatkép válasza `alreadySent: true`.
- Utána: `gate:stage`; a nehéz körök a zársorban.

## T18 — gépi vak ellenőrzés 3. célzott köre (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R26–R29; L1 → T-3)

Leletenként előbb BUKÓ teszt, utána a javítás.
- **L1:** a terv Nem-cél és Kockázat része + tervvázlat (`docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`); kód nincs.
- **R26 (L2)** `client/src/lesson-runtime/resultReport.ts`: az ürítő `apiRequest`-je `retries: 0`; a `RESULT_REPORT_RETRIES` megszűnik. A
  `tests/request-retry.test.ts` J5 forrásőre a szabályváltozást követi (dokumentált spec-változás). Böngészőteszt: 503 → 6 s alatt 1 POST.
- **R27 (L3)** `server/lesson-result-email.ts`: `claimFinalRound(lessonId, kind, roundId, percent)` (beszúrás `onConflictDoNothing` +
  ütközésnél a `created_at` frissítése); ütközésnél a beküldő saját végleges sora nélkül → `{ queued: false, duplicate: true }`. DB-teszt:
  vendég végleges → ugyanaz a kör fiókkal → második levél nincs, a név „Vendég tanuló”.
- **R28 (L4)** ugyanott (kliens): `unpersistedOutbox` memóriasor; `readOutbox` = tároló ∪ memória. Böngészőteszt: a sor kulcsára dobó
  `setItem` → a végleges kérés a lapon belül megérkezik.
- **R29 (L5)** szerver: a felvétel záró szakaszában `finalizedRounds` ellenőrzés. DB-teszt a `setPartialIntakeHook`-kal.
- Utána: a nehéz körök (`gate:stage` is) CSAK a zárral, egy szkriptben.

## T19 — PR-review leletei a 44487292-es fejre (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R30–R34)

Leletenként előbb BUKÓ teszt, utána a javítás.
- **R30 + R32 (4642268402, 4642333249)** új, tiszta modul `shared/result-outbox.ts`: `createOutboxStore(getStorage)` bejegyzésenkénti
  kulccsal (`outboxKeyOf(id)`), memóriasorral (R28), `outboxEntryExpired(entry, now)`. A `client/src/lesson-runtime/resultReport.ts` ezt
  használja; az ürítő a lejárt bejegyzést küldés nélkül törli. Egységteszt (`tests/result-outbox.test.ts`): két, egymásról nem tudó
  „fül” egyidejű felvétele → mindkét bejegyzés megmarad; lejárt bejegyzés kiesik.
- **R31 (4642333188)** szerver: `resultSubjectOf(userId)` (`server/lesson-result-email.ts`), a `/api/csrf-token` válaszában
  `resultSubject`; a séma `subject` mezője; eltérésnél a munkamenet fiókja figyelmen kívül marad. Kliens: `resultSubject()` a
  `queryClient.ts`-ben, a bejegyzés és a pillanatkép `subject` mezője; `legacyResultBody` a mezőt is elhagyja. DB-teszt: más fiók
  címkéjével érkező végleges → „Vendég tanuló”; egyező címke → a fiók neve. Egységteszt: a régi alak `subject` nélkül.
- **R33 (4642333294)** új modul `server/shutdown-flush.ts`: `runShutdownFlushes(tasks, budgetMs, onError)`; a `server/index.ts` a három
  ürítést ezzel, a 295 s-os határidőből számolt kerettel futtatja. Egységteszt: párhuzamos futás, a keret és a feladatonkénti korlát
  betartása, hibatűrés; forrásőr a `server/index.ts`-re.
- **R34 (4642333345)** szerver: `sendLessonResult(input, retry, gate, onSettled)` — az `onSettled` akkor hívódik, amikor a ciklus
  további újrapróbát már nem ütemez; `sendingPartials` (lecke + kör → kilét, változat) az időzítő lejártától az `onSettled`-ig / a
  véglegesítésig. A felvétel az első rögzítő vizsgálatát erre is elvégzi. DB-teszt: igazolt tanuló pillanatképe, kapuhiba → vendég
  pillanatkép `conflict` → az újrapróba az igazolt tanuló állapotát küldi ki.
- Utána: a nehéz körök (`gate:stage` is) CSAK a kapusoron (`kapu-feladatok.txt`).

## T20 — gépi vak ellenőrzés 6. köre (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R35–R38; L2 → követő szelet)

Leletenként előbb BUKÓ teszt, utána a javítás.
- **R35 (L1)** `shared/result-outbox.ts`: az `add` igazat ad, ha új bejegyzést vett fel; `resultReport.ts`: `enqueuedHere` csak ekkor.
  Egységteszt + böngészőteszt: lassú token → a kör `subject: null`-lal a sorban → ugyanaz a lecke új dokumentumban, más címkéjű tokennel →
  a POST `subject: "?"`.
- **R36 (L3)** `server/lesson-result-email.ts`: az R29 vizsgálat az `earlier` lekérdezés utánra kerül; teszthorog `setPartialScheduleHook`
  (a „már kiment” lekérdezés után). DB-teszt: a pillanatkép a horogban áll, közben végleges beküldés → `finalized: true`, várakozó nincs.
- **R37 (L4)** `client/src/lib/queryClient.ts`: az időzítő törlése `finally`-ba (a törzs olvasása után); a tokenlekérés 15 s-os
  `AbortController`-rel. Böngészőteszt: a `fetch` csonkja 202-es fejlécet és megakadó törzset ad, a 60 s-os időzítő 500 ms-ra
  gyorsítva → a kérés jele megszakad.
- **R38 (L5)** ugyanott (szerver): a `sendLessonResult` bemenete lehet késleltetett (`() => Promise<SendInput>`), a feloldás az
  `attemptLessonResult` `try` ágában; teszthorog `setAttributionFault`. DB-teszt: egyszeri hiba → egy újrapróbával kimegy; kétszeri hiba
  → nincs levél, és utána vendég pillanatkép elfogadva (az első rögzítő felszabadult).
- Utána: a nehéz körök a kapusoron.

## 2026-11-21 — vak kör (0ec08148) L1–L5 (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R39–R42 + L5)

Leletenként előbb BUKÓ teszt, utána a javítás (R26 / R31 / R35 / R10 / R12 / R14 / R19 / R27 / R34 viselkedése változatlan).
- **R39 (L1)** `client/src/lib/queryClient.ts`: `CsrfTokenInfo` + `getTokenInfo()` (token, képesség, címke egy válaszból); az `apiRequest`
  új `prepare` opciója a törzset a token megérkezése után (és a 403 utáni frissítéskor újra) építi, tokenhibánál nem küld.
  `client/src/lesson-runtime/resultReport.ts`: a `sendOutboxEntry` a törzset `prepare`-ben építi (nincs külön `ensureResultApi`); az R10
  ismétlése is `prepare`-rel. Böngészőteszt (`R39 / L1`, hamis óra): az első tokenkérés 800 ms után 502, a többi más fiók V2-tokenje →
  előbb nincs POST, 31 s előretekerés után egy POST `subject: "anon"`-nal. A régi kóddal piros volt (`undefined` címke).
  Dokumentált spec-változás: a `tests/request-retry.test.ts` J5 forrásőre a feladatok kérésének új alakját nézi
  (`apiRequest("POST", url, undefined, { retries: 0, prepare: build })` — a szándék, a belső 0 újrapróba és a keepalive hiánya, változatlan).
- **R40 (L2)** ugyanott: a `prepare` elején `outboxEntryExpired` → `OutboxEntryExpired` → a bejegyzés újrapróba nélkül kikerül.
  Böngészőteszt (`R40 / L2`): `activityAt` = most − 7 nap + 2,5 s, a token 4 s-ot késik → nincs POST, a sor üres, jelző nincs. A régi
  kóddal piros volt (a lejárt bejegyzés kiment).
- **R41 (L3)** `server/lesson-result-email.ts`: a `sendLessonResult` újrapróbája ütemezőn át megy; a „félbehagyva” út ütemezője a
  halasztott újrapróbát és a futó kísérleteket nyilvántartja; a `flushPendingPartials` előrehozza a halasztottat (időzítő törlése,
  ugyanaz a kapu), és mindet megvárja a határidőig; a `clearPendingPartials` a halasztottakat is eldobja. DB-teszt (`R41 / L3`):
  kapuhiba → 10 perces újrapróba → az ürítés kiküldi; lassú küldő alatt az ürítés megvárja; véglegesített körre az előrehozott sem küld.
- **R42 (L4)** ugyanott: a `claimFinalRound` tranzakcióban a jelzősorral együtt a kilét tulajdonos-sorát is rögzíti
  (`finalOwnerKeyOf`); a duplikátum-vizsgálat a saját sort VAGY a tulajdonos-sort keresi. Teszthorog `setFinalClaimFault` (a jelzősor
  után, a 202 előtt). DB-teszt (`R42 / L4`): megszakadt első kérés (500) → más kilét `duplicate` → az eredeti ismétlése `queued: true`,
  két levél „Vendég tanuló” névvel. A régi kóddal piros volt (`duplicate: true`).
- **L5** kódváltozás nélkül: a 44487292 nem része a főágnak, az előnézeti build más eredetű; a feltétel a tervben (L5 pont) rögzítve.
- Utána: célzott egységtesztek, `test:learning-db`, az érintett böngészős spec, `gate:stage`.

## 2026-11-21 — szűkítés és 3. vak kör (e36518e5) (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, szűkítés + R43–R46)

Tulajdonosi döntés (űrlap, 2026-11-21): „Szűkítés: tartós sor külön (Javasolt)”. Leletenként előbb BUKÓ teszt, utána a javítás.
- **Kapcsoló** `client/src/lib/resultOutboxFlag.ts` (`resultOutboxEnabled()`): élesben csak `VITE_RESULT_OUTBOX_ENABLED=1`; az e2e-buildben
  (`VITE_ENABLE_RUNTIME_PROBE=1`) a `window.__websuliResultOutbox = true` futásidejű horog. `resultReport.ts`: a sor tárolója KI állásban
  `null` (csak memória, lapon belüli újrapróba); `App.tsx`: KI állásban nincs induló ürítés. A tartós sor tesztjei (`R24 / L2`, `R28 / L4`,
  `R35 / L1`, `R39 / L1`, `R40 / L2`) `enableOutbox(page)`-dzsel BE állásban futnak; a többi az éles KI állást méri. Új böngészőteszt:
  „Kapcsoló KI (alap)” — nincs tárolóírás a sor kulcsára, nincs induló ürítés, a kör egyszer kimegy (a régi kóddal piros: induláskor
  kiürítette a régi bejegyzést).
- **R43 (L1, KI állás)** `resultReport.ts`: ha a kísérlet tokenválaszig sem jutott, `enqueuedHere.delete` — a címke utólag nem pótolható.
  Böngészőteszt `R43 / L1` (hamis óra): minden token 502 → B fiók tokenje → a POST `subject: "?"` (régi kóddal: `"fiok-b"`).
- **R44 (L2)** `queryClient.ts` `sendKeepalive`: kísérletenkénti 15 s-os határidő (`SNAPSHOT_POST_TIMEOUT_MS`, `AbortController` +
  `setTimeout`). Böngészőteszt `R44 / L2` (hamis óra): az első pillanatkép függ → 16 s előretekerés → ugyanaz az állapot újra elmegy
  (régi kóddal: 0 kérés).
- **R45 (L3)** `server/lesson-result-email.ts`: egyetlen indító út (`startPartial`: `markSending` + követett küldés) az időzítőnek és az
  ürítésnek; `partialShutdown` (`running` → az új felvétel azonnal, követve indul; `done` → a felvétel 503). DB-teszt `R45 / L3`. A meglévő
  `R14` és `R41` a lezárult ürítés után `clearPendingPartials()`-szal „új példányt” utánoz (különben a felvétel jogosan 503); az R14 második
  részében a pillanatkép befogadását most explicit `queued: true` állítás ellenőrzi (szigorítás).
- **R46 (L5)** `server/lesson-result-limits.ts`: `lessonsWriteGate(limiter)` + `isResultPost`; `server/index.ts` ezt szereli fel (a régi
  beágyazott köztes réteg helyett). Egységteszt valódi HTTP-n: a régi logikával a 41. végleges 429 volt, a kivétellel 60 + 60 átmegy, a 61.
  végleges 429, más lecke-írás 101.-re 429; forrásőr a felszerelésre.
- **L1 (tartós soros) és L4** → T-3 nyitott pontok (`docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`, T3-N1 / T3-N2).
- Utána: célzott egységtesztek, `test:learning-db`, az eredménylevél böngészős specjei, `gate:stage`.

## 2026-11-22 — 4. vak kör (87631382): kilét rögzítése létrehozáskor (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R47–R48)

Tervezési szabály (R47) a kilét késői feloldása ellen; előbb BUKÓ tesztek (mind piros volt a régi kóddal), utána a javítás.
- **Kliens** `client/src/lesson-runtime/resultReport.ts`: körönkénti kilét-rekord (`bindRoundOwner`, kulcs `…:owner:<kör>`: `subject` a
  gyorsítótárazott tokenválaszból vagy `null`, `learnerTag` = a párosító token lenyomata `experienceFingerprint`-tel). Rögzítés a kör első
  tevékenységekor (külön effekt a beküldő előtt); a CSRF-token a lecke megnyitásakor előtöltődik. A végleges bejegyzés és a pillanatkép
  `subject`-je a rögzített (ismeretlen: `?`), a `learner` csak egyező lenyomatnál (`ownerLearner`). Az `enqueuedHere` utólagos pótlás
  megszűnt (R31-pótlás / R35 / R43 helyett); a rekord a végleges siker után törlődik.
  Böngészőtesztek: `R47 / L1` (KI állás, az első token 10 s-ot késik és B fiókjáé → `?`; régi kóddal `"fiok-b"`), `R47 / L2` (újrapárosítás
  nyitott fül alatt → nincs `learner`; régi kóddal B tokenje), `R47 / kontroll` (változatlan párosítás → A tokenje, `subject: "?"`).
- **R48 (L4)** ugyanott: a pillanatkép késői 202-je nem menti a részleges jelzőt, ha a végleges jelző megvan. Böngészőteszt `R48 / L4`
  (régi kóddal a jelző visszajött).
- **Szerver (L3)** `server/lesson-result-email.ts`: a párosítás feloldásának átmeneti hibája → 503, vendég-rögzítés nélkül; teszthorog
  `setLearnerResolveFault`. DB-teszt `R47 / L3`: pillanatkép és végleges is 503, várakozó és jelzősor nincs, a hiba után az ismétlés átmegy
  (a régi elnyelő ággal piros volt).
- Dokumentált spec-változás: a `tests/result-outbox.test.ts` R35 forrásőre az `enqueuedHere`-es pótlás helyett az R47-et nézi (nincs
  utólagos pótlás, a bejegyzés a rögzített címkét viszi) — szigorúbb.

## 2026-11-22 — 5. vak kör (025d3d34) (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R49)

Előbb BUKÓ tesztek (mind piros volt a régi kóddal), utána a javítás.
- **R49 (a)** `client/src/lesson-runtime/resultReport.ts`: `legacyAllowed(info)` — régi alak csak `entry.subject == null` vagy V2-tokenválasz
  azonos címkével; különben `OutboxIdentityHold` (a sor szokott újrapróbája, nem küld). A `build` (jelzés nélküli token) és az R10
  visszalépés is ellenőriz. Böngészőtesztek: `R49 / L1 (a)` 403 → B V2-token → 400 (régi kóddal a 3. kérés címke nélkül ment és a kör
  elküldöttnek jelölődött); `R49 / L1 (a)` 403 → jelzés nélküli token (régi kóddal címke nélküli kérés).
- **R49 (b)** ugyanott: a bejegyzés `learnerTag`-et visz (`shared/result-outbox.ts`), a törzs nyers párosító tokent nem; a `build` minden
  kísérlet előtt `ownerLearner`-rel vet össze. `client/src/lib/queryClient.ts`: a `sendKeepalive` törzse függvény is lehet (a 403 utáni
  ismétlés előtt újra összeáll); a pillanatkép így küld. Böngészőtesztek: `R49 / L2 (b)` végleges és pillanatkép 403 alatti újrapárosítással
  (régi kóddal az ismétlés A tokenjével ment).
- **R49 (c)** `server/lesson-result-email.ts`: a jelzősor-írás hibája best effort marad, de létező jelzősor mellett a tulajdonos-lekérdezés
  hibája 503; teszthorog `setOwnerCheckFault`. DB-teszt `R49 / L3 (c)` (régi kóddal `202 !== 503`).
- Tesztcsapda-javítás: a Playwright `toEqual` a tömb `undefined` elemeit figyelmen kívül hagyja — a címke-listákat (`R39`, `R49`)
  `toStrictEqual` méri (az R39 korábbi állítása így rejthetett volna címke nélküli kérést). Az R35 forrásőr pontosítva: a tokenválasz
  címkéje nem kerülhet értékadással a kilétbe / `outbox.update` nincs, az összevetés (`info.subject === entry.subject`) kötelező.

## 2026-11-22 — kilét-osztály leltár (invariáns: a terv „Kilét-invariáns” szakasza)

Tulajdonosi utasítás (2026-11-22): megközelítésváltás — a kilét MINDEN keletkezési / olvasási / továbbítási / feloldási pontja egy
táblázatban, a közös segédekkel (`bindRoundOwner` + `ownerLearner` + `legacyAllowed` a kliensen; az útvonal-kezelő egyetlen
`userId` / `paired` / `who` meghatározása a szerveren). Útvonalak a `source/` alatt; „teszt” = az invariánst igazoló, futtatott teszt.

| # | Pont (fájl:sor) | Forrás | Mikor rögzül | Küldéskor mivel veti össze | Eltérésnél | Hibánál | Teszt |
|---|---|---|---|---|---|---|---|
| K1 | `server/routes.ts:1010` → `client/src/lib/queryClient.ts:83` | fiók (munkamenet) álnevesített címkéje a CSRF-tokenválaszban | tokenlekéréskor (gyorsítótár) | — (forrás) | — | tokenhiba: nincs token, nincs címke | `R39 / L1`, `R43 / L1` |
| K2 | `client/src/lib/queryClient.ts:91,268,306` (`getTokenInfo` + `prepare`) | a kérés tokenje és a vele jött képesség / címke | minden kísérletnél (403 után is) | a törzs ugyanabból a válaszból épül | — | `prepare` mellett tokenhiba → nem küld | `R39 / L1`, `R49 / L1 (a)` |
| K3 | `client/src/lib/learnerProfile.ts:20,38` | párosító token (eszköz, linkkel cserélhető) | a link megnyitásakor | — (forrás) | — | olvashatatlan tároló → nincs párosítás | `R47 / L2` |
| K4 | `client/src/lesson-runtime/resultReport.ts:64` (`bindRoundOwner`) | fiókcímke + párosítás-lenyomat → kör kilét-rekordja | a kör ELSŐ tevékenységekor, csak ha a kört itt tevékenység nélkül láttuk (R50) | — (egyetlen keletkezési pont) | rekord nélküli megkezdett kör → ismeretlen (`?`, párosítás nélkül) | írhatatlan tároló → memóriabeli rekord | `R47 / L1`, `R50 (leltár)` |
| K5 | `resultReport.ts:185` | CSRF-token előtöltése a lecke megnyitásakor | lecke megnyitása | — | — | sikertelen előtöltés → a címke ismeretlen (`?`) | `R47 / L1` (késői token → `?`) |
| K6 | `resultReport.ts:190` (`seenFresh`) | „a kört itt tevékenység nélkül láttuk” bizonyíték | minden megjelenítéskor | K4 használja | — | — | `R50 (leltár)` |
| K7 | `resultReport.ts:219` (végleges bejegyzés) | rögzített `subject` + `learnerTag`; nyers token nincs a törzsben | a bejegyzés létrehozásakor | K8 | — | — | `R47 / L2`, `R49 / L2 (b)` |
| K8 | `resultReport.ts:122,126` (`build`) | a végleges kérés kilétmezői | minden kísérlet előtt | `subject` = rögzített; `learner` = `ownerLearner` (mostani token lenyomata = rögzített) | párosítás nélkül; a szerver eltérő címkénél fiók nélkül | — | `R49 / L2 (b)` végleges, `R47 / kontroll` |
| K9 | `resultReport.ts:128,134,148` (`legacyAllowed`) | régi (címke nélküli) alak: jelzés nélküli token / R10 400 utáni visszalépés | minden kísérletnél | rögzített címke `null`, vagy V2-tokenválasz azonos címkével | NEM küld: `OutboxIdentityHold` (vár, majd lejár) | — | `R49 / L1 (a)` ×2; kontroll (`null` tulajdonos): R12, R10 |
| K10 | `resultReport.ts:84` (`enqueueResult`) | a sorban álló bejegyzés kiléte | létrehozáskor | — | utólagos pótlás / átírás nincs | — | `result-outbox.test.ts` R35-őr (R47), `R35 / L1` |
| K11 | `resultReport.ts:263,267` (pillanatkép) | rögzített `subject`; `learner` függvényben | minden kísérlet előtt (403 után is) | `ownerLearner` | párosítás nélkül | — | `R47 / L2`, `R49 / L2 (b)` pillanatkép |
| K12 | `client/src/lib/queryClient.ts:153,178` (`sendKeepalive`) | pillanatkép-törzs és tokencsere | minden kísérlet előtt | 403 után jelzés nélküli token → nem küld (R23) | — | tokenhiba → `false` (nem rögzül elküldöttként) | `R23 / L3`, `R49 / L2 (b)` |
| K13 | `client/src/lib/fingerprintCache.ts` | vendég-ujjlenyomat (eszköz, nem név) | első lekérés | — | a szerver vendégnek tekinti | lekérési hiba → IP-kulcs | `R11 / K1` (DB) |
| K14 | `resultReport.ts:31`, `client/src/App.tsx:134` | tartós sor és induló ürítés (BE kapcsoló) | — | K7–K10 ugyanúgy | — | — | `Kapcsoló KI (alap)`, `R35 / L1`, `R39 / L1` (BE) |
| K15 | `resultReport.ts:160` | a kilét-rekord törlése | végleges sikerkor | — | — | — | `R47 / kontroll` (K16-állítás) |
| K16 | több fül ugyanazon a körön | a kilét-rekord a közös tárolóban; a második fül ugyanazt olvassa | az első fül első tevékenységekor | K8 / K11 | párosítás nélkül | — | `Leltár K16` (két fül egy kontextusban; a leltárban pótolva — a mostani kódon elsőre zöld, lefedési teszt) |
| S1 | `server/lesson-result-email.ts:506` | fiók: a munkamenet `userId`-je csak egyező címkénél | kérés fogadásakor | `body.subject` = `resultSubjectOf(session)` | `?` / eltérő → fiók nélkül | — | `R31` (DB) |
| S2 | ugyanott, címke NÉLKÜLI kérés | régi alak / régi klienscsomag | kérés fogadásakor | — (nincs mivel) | a munkamenet fiókja (főági viselkedés) | — | kliens oldalon K9 véd; **régi klienscsomag: ismert korlát (UNVERIFIED a valódi régi csomaggal)** |
| S3 | `server/lesson-result-email.ts:511–516` | párosítás feloldása (`resolveLearner`) | kérés fogadásakor | token aláírás + verzió | érvénytelen / visszavont → névtelen | átmeneti hiba → 503, nincs rögzítés | `R47 / L3` (DB) |
| S4 | `:519,526` (`who`, `partialWhos`) | első rögzítő kulcsa | kérés fogadásakor | — | — | — | `R11`, `R22`, `R34` (DB) |
| S5 | `:521–522,578` (név, attribúció) | a rögzített `userId` / `paired` → név a küldési kísérletben | fogadáskor (kilét) / kísérletkor (név) | — | — | névfeloldási hiba → újrapróba, utána az első rögzítő felszabadul | `R38` (DB) |
| S6 | `:570–577` (első rögzítő, vendég-átvétel) | várakozó / küldés alatti kör első rögzítője | időzítő / ürítés (`startPartial`, `:343`) | `mayActOn` | `conflict`, vendég kör vendég marad | — | `R11/R15/R16`, `R22`, `R34`, `R45 / L3` (DB) |
| S7 | `:389` (tulajdonos-sor) + `:625–640` | végleges jelzősor első rögzítője | jelzősorral egy tranzakcióban | saját sor VAGY tulajdonos-sor | duplikátum | jelzősor-írás hibája: best effort; tulajdonos-lekérdezés hibája → 503 | `R27`, `R42`, `R49 / L3 (c)` (DB) |
| S8 | `:671–672` (végleges levél neve) | a rögzített `userId` / `paired` | fogadáskor | — | — | névfeloldási hiba → újrapróba | `R27`, `R31` (DB) |
| S9 | `:683` (`sendPracticeResult`) | bejelentkezett szerveres kvíz: a kör szerveres rekordjának `userId`-je | a kör indításakor | `withAttempt` tulajdonos-ellenőrzés | 404 (más fiók nem éri el) | — | `tests/learning-db.integration.ts:114` (más fiók 404) |
| S10 | `:589` + ürítés (R41 / R45) | leállítás: a kilét a felvételkor rögzült lezárásban utazik | felvételkor | — | — | lezárult ürítés után 503 | `R14`, `R41`, `R45 / L3` (DB) |

Összesítés: **26 sor** (16 kliens, 10 szerver). Saját (nem a vak ellenőrtől származó) eltérés: **1** — K4 / K6 (R50): rekord nélkül
helyreállított, megkezdett kör a mostani kilétet kapta; közös segéddel (`bindRoundOwner` második paramétere) javítva, előbb bukó
teszttel (`R50 (leltár)`: régi kóddal A párosítása ment). Pótolt teszthiány: K15 (a rekord törlése — az `R47 / kontroll` kiegészítése).
Pótolt teszthiány még: K16 (több fül — `Leltár K16`, a mostani kódon zöld). Nem igazolt sor: **S2** (valódi régi klienscsomag — ismert
korlát, főági viselkedés; valódi régi csomaggal nem futott).

## 2026-11-22 — R51: a kilétet a szerver rögzíti (mélyebb vak kör, 13b3755e; tulajdonosi döntés: „Szerver rögzíti a kilétet”)

Lépéssor (előbb BUKÓ teszt, utána a megvalósítás; migráció nincs — a meglévő `lesson_result_emails` táblán, új körkulcs-fajtákkal):
1. **Bukó tesztek.** DB: `R51 / L1` (B pillanatképe az első kérés → A végleges kérése A címkéjével: régi kóddal A nevére ment —
   „az első kérés B-t rögzítette: A nem kapja meg” bukott; rögzítő kéréses változat és kontroll), `R51 / L2` (TTL-hiba → régi kóddal
   `queued: true`, második levél; jelzősor-írási hiba → 503). Böngésző: `R51` (az első válasznál egy rögzítő kérés — régi kóddal 0),
   `R51 / L5` (újratöltés után nincs kilét-rekord — régi kóddal visszajött), `R51 / L3` (számláló — régi kóddal visszaesett 1-re).
2. **Szerver** `server/lesson-result-email.ts`: `claimRoundOwner` (:415, `round-claim` + `round-owner` sor egy tranzakcióban),
   `establishIdentity` (:432, a kilét EGYETLEN meghatározása: munkamenet → R31 csökkentés → párosítás-ellenőrzés → szerveres rögzítéshez
   vetés; eltérés → kilét nélkül, `foreign`), a rögzítő végpont (`lessonResultClaimHandler` :535, útvonal :552, `claimLimiter`), a fő
   útvonal kilétje (:567), `claimFinalRound` TTL-frissítés külön (best effort), a jelzősor-írás hibája 503 (:680), idegen kérés létező
   jelzőnél duplikátum (:702). `shared/lesson-result-email.ts`: `roundClaimSchema`. `server/lesson-result-limits.ts`: `claimLimiter`, a
   közös írási kapu kivétele a `/results/claim`-re is.
3. **Kliens** `client/src/lesson-runtime/resultReport.ts`: `claimRound` (:85; az első válasznál, körönként egyszer, fiókcímke nélkül,
   régi szervernek nem), L5: elküldött körre nincs rekord / rögzítés (:211), L3: maximum-számláló (:295).
4. **Dokumentált tesztigazítások (spec-változás R51):** `R22 / L4` — az igazolt tanuló az első válasznál rögzít (`postClaim`), utána a
   verseny változatlanul `conflict`; `R37 / L4` — a `fetch`-csonk csak a végleges eredmény-POST-ot számolja (a `…/results/claim` nem az).
5. Ellenőrzés: célzott egységtesztek, `test:learning-db`, az eredménylevél böngészős specjei, `gate:stage`.

Kilét-leltár frissítése (a fenti táblázathoz):
- **Tippé válik:** K1 (a CSRF-tokenválasz fiókcímkéje) és K4 / K7 / K8 / K11 fiókcímke-része — a `subject` már csak csökkentheti a kilétet
  (S1), nem ad. A fiók kilétét a szerver dönti el (S11 / S12).
- **Marad (szűrő):** K3 / K4 párosítás-lenyomat, K8 / K11 `ownerLearner` — a párosító token küldését szűri; a párosított tanuló kilétét a
  szerver a tokenből és a rögzítésből dönti el.
- **Új sorok:** S11 `server/lesson-result-email.ts:415,432` (szerveres rögzítés az első beérkező kérésnél; teszt: `R51 / L1`), S12 `:535,552`
  (rögzítő végpont; teszt: `R51 / L1` 2. rész, böngésző `R51`), S13 `:680` (jelzősor-írás hibája 503, TTL best effort; teszt: `R51 / L2`),
  S14 `:702` (idegen kérés duplikátum; teszt: `R27`, `R42`, `R49 / L3 (c)`), K17 `resultReport.ts:211` (elküldött körre nincs rekord;
  teszt: `R51 / L5`). Összesen 31 sor.
- **Jegyre (kanban), nem ebben a körben:** **L4** (a 403 utáni pillanatkép 7 napon túl és befagyott `clientNow`-val mehet — a megoldás: a
  törzsfüggvény a tényleges POST előtt mérje a kort és a `clientNow`-t; hamis órás böngészőteszt kell). **L6** dokumentum-szöveg javítva
  (`docs/agent-csapdak.md` C-79: leíró, nem utasítás).

## 2026-11-22 — R52: a kilét-rögzítő sorok takarítása (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`, R52)

- Felderítés: a `lesson_result_emails`-re nem volt takarítás (sem TTL-törlés, sem söprés; csak az R18 olvasáskori 24 órás szűrése).
- Bukó teszt `R52` (DB): a lejárt kör késői első kérése a régi kóddal a mostani fiók nevére ment („a kör első tevékenysége a rögzítési
  élettartamon túl volt: kilét nélkül” bukott); a törlés-rész új funkció (régi kóddal nem létezett).
- `server/lesson-result-email.ts`: `rc:` / `ro:` előtagú kulcsok (`roundClaimKeyOf`, `roundOwnerKeyOf`, `roundIdentityKeysOf`),
  `ROUND_IDENTITY_TTL_MS` (8 nap), `pruneRoundIdentity` (adagos `DELETE … WHERE id IN (SELECT … LIMIT)`), `setupResultHousekeeping`
  (napi 03:40 Europe/Budapest, csak élesben); `establishIdentity`: a kör utolsó tevékenysége az élettartamon túl → vendég-rögzítés.
  `server/index.ts`: a takarítás a meglévő ütemezett feladatok mellé kötve (E2E-ben nem). Migráció nincs.
- Leltár: új sor S15 (takarítás + lejárt-kör szabály; teszt `R52`).

## 2026-11-22 — 7. vak kör (904a3eeb): záró javítás (R53) és a követő PR jegyei

Tulajdonosi döntés: „BONTÁS: KÉT PR” — a #510-ben CSAK az L1 legkisebb biztonságos javítása.
- **R53 (L1)** `server/lesson-result-email.ts` (a végleges duplikátum-vizsgálat): a tulajdonos-lekérdezés a sorok kulcsát is visszaadja;
  a végleges tulajdonos-sor kulcsa a lefokozottságot is viseli (`finalOwner = foreign ? "foreign:" + who : who`);
  idegen kérés létező jelzőnél csak akkor folytat, ha a saját végleges tulajdonos-sora (`finalOwnerKeyOf(finalOwner)`) megvan ÉS a kézbesítési
  sora (`roundKeyOf(who)`) még nincs (a levél nem indult). DB-teszt `R53 / L1` (R42-minta, `setFinalClaimFault`): régi kóddal az eredeti
  beküldő ismétlése duplikátumot kapott; negatív kontroll: más beküldő (más ujjlenyomat) duplikátum; a levél után ugyanaz is duplikátum.
- Az `index.ts` főág-összefésülés (#418) átnézve: R33 párhuzamos ürítés, utána kisfilm-leállítás; a keretből levont 10 s-os kisfilm-tartalékkal
  a legrosszabb eset 270 + 3 + 2,5 + ürítés + 10 + 2 ≤ 295 s (a 60 s-os `clipsStopped` a leállás elejétől párhuzamosan fut).

Követő PR (kanban-jegyek, NEM a #510 része):
- **követő PR: 7. vak kör L2** — `client/src/lib/queryClient.ts` `sendKeepalive` csak `res.ok`-t ad; a pillanatkép `conflict` / `alreadySent` /
  `finalized` válasza ne rögzüljön elküldöttként (a választest olvasása időkorláttal). Teszt: `conflict` → azonos válaszszám, új elhagyás →
  második POST.
- **követő PR: 7. vak kör L3** — `server/lesson-result-email.ts` a végleges ág a tranzakció ELŐTT jelöli véglegesnek és törli a várakozó
  pillanatképet; a jelzősor-írás 503-a után ez ne vesszen el (a részleges csak sikeres végleges foglaláskor törlődjön). DB-teszt: elfogadott
  pillanatkép → jelzőírási hiba → 503 → a részleges levél kimegy.
- **követő PR: 7. vak kör L4** — E2E-módban kényszerített tesztküldő / tiltás a közös levélküldési ponton; a futtató ne örökölje az éles
  szolgáltatói beállításokat.
- **követő PR: 8. vak kör L4** — a 403 utáni pillanatkép korhatára és `clientNow`-ja a tényleges POST előtt (hamis órás böngészőteszt).

## Kész-feltétel

A terv `<!-- acceptance-checklist -->` listájának minden pontja futtatott parancs kimenetével igazolva.
