# Végrehajtási utasítás — eredmény-e-mail: kvíz beküldése és kérdésenkénti levél

**Állapot:** T1–T9 kész; T10 kész; T11 kész; T12 kész; T13 kész; T14 (negyedik vak ellenőrzés feltétele, 2026-11-19) kész, a következő vak ellenőrzés előtt – ág `fix/eredmeny-email-kviz`
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

## Kész-feltétel

A terv `<!-- acceptance-checklist -->` listájának minden pontja futtatott parancs kimenetével igazolva.
