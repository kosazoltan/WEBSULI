# Végrehajtási utasítás — eredmény-e-mail: kvíz beküldése és kérdésenkénti levél

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/eredmeny-email-kviz`
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

## Kész-feltétel

A terv `<!-- acceptance-checklist -->` listájának minden pontja futtatott parancs kimenetével igazolva.
