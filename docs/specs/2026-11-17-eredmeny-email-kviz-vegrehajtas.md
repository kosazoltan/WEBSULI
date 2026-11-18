# Végrehajtási utasítás — eredmény-e-mail: kvíz beküldése és kérdésenkénti levél

**Állapot:** T1–T8 kész, PR előtt – 2026-11-17, ág `fix/eredmeny-email-kviz`
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

## Kész-feltétel

A terv `<!-- acceptance-checklist -->` listájának minden pontja futtatott parancs kimenetével igazolva.
