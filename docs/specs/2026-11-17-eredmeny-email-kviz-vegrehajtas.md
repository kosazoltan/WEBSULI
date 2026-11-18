# Végrehajtási utasítás — eredmény-e-mail: kvíz beküldése és kérdésenkénti levél

**Állapot:** T1–T9 kész; T10 (a vak ellenőrzés leletei, 2026-11-18) folyamatban – ág `fix/eredmeny-email-kviz`
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
- **R4 (K4)** `client/src/lib/queryClient.ts` `sendKeepalive`: elöl `warmCsrfToken()`; 403 → `invalidate()` → `getToken()` → egy ismétlés.
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

## Kész-feltétel

A terv `<!-- acceptance-checklist -->` listájának minden pontja futtatott parancs kimenetével igazolva.
