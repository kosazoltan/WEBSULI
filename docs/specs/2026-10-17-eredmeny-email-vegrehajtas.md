# Tanulói eredmény e-mailben — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-eredmeny-email.md`. Ág: `feat/eredmeny-email`. A parancsok a `source/` mappából futnak.

1. **`shared/lesson-result-email.ts` (tiszta, DB és hálózat nélküli modul):**
   - `resultRequestSchema` (zod, `.strict()`):
     `{ kind: "tasks", roundId, answers: Record<taskId, string ≤ 2000> }` vagy
     `{ kind: "quiz", roundId, picks: Record<questionId, int 0–7> }`.
     A `roundId` alakja `[a-z0-9-]{4,64}`; legfeljebb 60 válasz, illetve 100 kérdés.
   - `gradeTasks(experience, answers, arbiter?)`:
     - csak az ismert feladat-azonosítókat pontozza (`evaluateOpenAnswer`);
     - az opcionális `arbiter(taskId, answer)` gyorsítótár-ítélet csak emelhet (`bestVerdict` logika);
     - eredmény: `{ rows: [{ q, answer, state, score }], points, total, percent, grade }`.
   - `gradeQuiz(experience, picks)`: a `correctIndex` szerint; `{ wrong: [{ q, picked, correct }], points, total, percent, grade }`.
   - `buildResultEmail({ lesson, learner, kind, graded, url })` → `{ subject, html }`; minden szöveg HTML-escape-elve.
   - Osztályzat: a meglévő `scoreSummary`.
2. **`migrations/0030_lesson_result_emails.sql` és a Drizzle `lessonResultEmails` tábla:**
   - Mezők: `id`, `lesson_id`, `kind`, `round_key` (sha256: tanuló vagy ujjlenyomat + `roundId`), `percent`, `sent`, `created_at`.
   - Egyedi index: `(lesson_id, kind, round_key)`. Additív, idempotens.
3. **`server/lesson-result-email.ts`:**
   - `sendLessonResult({ lessonId, kind, roundKey, graded, learner })`:
     - előbb `INSERT … ON CONFLICT DO NOTHING RETURNING`; ha nincs új sor, nem küld (ismétlésvédelem);
     - címzettek: `resolveAdminRecipients(process.env)`;
     - küldés: `sendAdminNotification` címzettenként (`Promise.allSettled`);
     - a sor `sent` mezője a küldés után frissül;
     - nincs címzett vagy Resend: figyelmeztetés a naplóban, nem dob.
   - `resultsRouter`: `POST /api/lessons/:lessonId/results`.
     - Csak publikált, `experience`-szel rendelkező lecke; validálás; szerveroldali pontozás (az arbiter-gyorsítótár az
       `arbiterCacheKey` + `arbiterVerdicts` táblából). Minden válasz üres: nincs küldés.
     - Tanuló: bejelentkezettnél a felhasználó neve, különben „Vendég tanuló”. A `roundKey` alapja a felhasználó azonosítója,
       illetve a kérés `fingerprint` mezője (mint a Próbánál).
     - Válasz: mindig 202 (a tanuló felülete nem függ tőle); érvénytelen kérésnél 400, ismeretlen leckénél 404.
   - Védelem: a `routes.ts`-ben eredet-engedélylista (mint a `/api/material-result`-nél); saját sebességkorlát: 20 / 15 perc / IP.
4. **`server/rewards/lesson-attempts.ts` `finishPractice`:**
   - az első lezáráskor (nincs korábbi `result`) a tranzakció után, várakozás nélkül hívja a `sendLessonResult`-ot
     (`kind: "quiz"`, `roundKey` = a kísérlet azonosítója);
   - a hiba csak naplózódik.
5. **Kliens (`LessonExperienceView.tsx`):**
   - **Feladatok:** amikor a `taskState.round.finishedAt` először beáll, egyszer beküldi a válaszokat. A localStorage-jelző
     (`${storageKey}:tasks:sent:<roundId>`) véd az ismétléstől. Hiba esetén csendes, nem jelenik meg a felületen.
   - **Helyi kvíz:** ugyanígy (`kind: "quiz"`, `picks`). A szerveres kvízt (`SavedLessonQuiz`) nem küldi, mert azt a szerver
     maga küldi.
   - `roundId = experienceFingerprint({ ids, startedAt })`.
6. **Tesztek:**
   - unit (`tests/lesson-result-email.test.ts`):
     - a séma (ismeretlen mező és túl hosszú válasz elutasítva);
     - a pontozás: a kliens pontszámát nem fogadja; ismeretlen azonosító kimarad; az arbiter csak emel;
     - az escape;
     - a tárgy és a törzs tartalma;
   - DB (`tests/lesson-result-email-db.integration.ts`, eldobható Postgres, a 0030 kétszer):
     - egy kör egyszer küld (a második 202, de nem küld);
     - a küldő mockolva: a címzettlista az `ADMIN_EMAILS`;
     - publikálatlan lecke 404;
   - e2e (`tests/lesson-result-email.spec.ts`): a feladatok és a helyi kvíz kiértékelése után pontosan egy beküldés megy a
     helyes alakkal; újratöltés után nincs második.
7. **Kapuk:** tsc, check:test, lint, unit, `test:learning-db`, a célzott Playwright és a build. Élő ellenőrzés csak a
   tulajdonos visszajelzésével (az e-mail a tulajdonos postafiókjába megy).
