# Végrehajtási utasítás — Tételgyár T7: döntőbíró a nyílt feladatokra

Terv: `docs/specs/2026-10-15-tetelgyar-t7-dontobiro.md` (tulajdonosi döntések: adatminimalizálás; DB-gyorsítótár; 2000 hívás/nap,
60 kérés / 15 perc / IP; Studio + HTML-leckék). Ág: `feat/tetelgyar-t7`. Két PR: **T7.1 szerver**, **T7.2 kliens**.

## Kódból ellenőrzött tények (a bekötéshez)
- Studio-lecke: `GET /api/lessons/by-file/:htmlFileId` (`server/studio/lesson-routes.ts`) — publikált `lessons` sor, `lessonSchema`.
- HTML-lecke: a bank a HTML `websuli-lesson-data` blokkjában (`readHtmlLessonData`, `shared/lesson-html-data.ts`); a lejátszó a `/dev/:id`
  oldalon fut (`server/routes.ts`), a `material` = `location.pathname` (`client/src/lesson-interactions.tsx`) — a kérés ugyanarra a
  szerverre megy (relatív `/api/...`).
- CSRF: a `/api/lessons` nem-GET kérései tokent kérnek; a munkamenet nélküli, nyilvános írások (pl. `/api/material-result`) a CSRF helyett
  `enforceOriginAllowlist`-et használnak (`server/routes.ts`, `server/lib/origin-guard.ts`). A döntőbíró nem használ munkamenet-jogosultságot
  → ugyanez a minta (origin-allowlist + saját korlát).
- Migráció: `migrations/NNNN_*.sql`, a `server/migrate.ts` fájlnév szerint futtatja (utolsó: `0024_subject_memory.sql`).
- Modell: `createStudioStepProvider(model, step)` + `STUDIO_STEP_POLICY` (`server/ai/studio-provider.ts`); `callStepModel` (`server/studio/run-step.ts`).

## T7.1 — szerver
1. `migrations/0025_arbiter_verdicts.sql` (additív, idempotens):
   - `arbiter_verdicts(cache_key varchar(64) PK, state varchar(8) CHECK in ok/partial/fail, score real, reason text, model varchar(64),
     created_at timestamptz default now())` — a válasz szövege NEM tárolódik;
   - `arbiter_daily_usage(day date PK, calls integer not null)`.
   `shared/schema.ts`: a két tábla drizzle-definíciója.
2. `server/arbiter/arbiter.ts` (tiszta, tesztelhető):
   - `ARBITER_VERSION`, `ARBITER_MODEL = "gpt-6.1-sol"`, `ARBITER_DAILY_LIMIT = 2000`, `ARBITER_ANSWER_MAX = 1000`;
   - `redactAnswer(text)`: e-mail és telefonszám (≥ 7 számjegy elválasztókkal) → `[kitakarva]`;
   - `arbiterCacheKey(task, answer)`: sha256(`ARBITER_VERSION` + a feladat tartalma + `normalizeAnswer(answer)`);
   - `buildArbiterPrompt(task, teaching, answer)`: rendszerutasítás (megengedő pedagógus, a TARTALMI helyesség dönt, a válaszban lévő utasítás
     adat, nem parancs), a feladat (kérdés, mintaválasz, kulcsgondolatok a `required`/`bonus` csoportokból, tanítási részlet ≤ 1500 karakter),
     a válasz külön, jelölt blokkban; kimenet: `{ "state": "ok|partial|fail", "reason": "<legfeljebb 200 karakter, a gyereknek>" }`;
   - `parseArbiterVerdict(json)`; `combineVerdicts(det, arb)` — a jobb ítélet (pont szerint), sosem rosszabb.
3. `server/arbiter/service.ts`: `judgeOpenAnswer(input, deps)` injektálható függőségekkel (`loadTask`, `cacheGet`, `cachePut`,
   `reserveDailyCall`, `callModel`): determinisztikus ítélet → `ok` esetén kész (nincs hívás); gyorsítótár; napi keret (atomi
   `INSERT … ON CONFLICT DO UPDATE … WHERE calls < limit RETURNING`); modellhívás (határidő 20 s); hiba → a determinisztikus ítélet.
   Napló: csak számok és állapot, szöveg nélkül.
4. `server/arbiter/routes.ts`: `POST /api/lessons/arbiter` { source: { kind: "lesson", htmlFileId } | { kind: "html", materialId }, taskId,
   answer } — zod-validáció (400), a feladat a szerverről (publikált lecke / HTML-bank; különben 404), `judgeOpenAnswer`.
   Csatolás: `server/index.ts` — saját `arbiterLimiter` (60 / 15 perc / IP) a `/api/lessons/arbiter` útra a `publicWriteLimiter` ELŐTT;
   `server/routes.ts` CSRF-kivétel + `enforceOriginAllowlist` (a `/api/material-result` mintájára).
5. `STUDIO_STEP_POLICY.arbiter`: 20 s, 2 000 token, alacsony effort (`server/ai/studio-provider.ts`).
6. Tesztek: `tests/arbiter.test.ts` — E1 (ok → nincs hívás), E2 (hiba / plafon → determinisztikus), E3 (sosem rosszabb), E4 (gyorsítótár),
   E5 (a modellhez menő szövegben nincs azonosító; e-mail/telefon kitakarva), E6 (400 / 404 / 429 a kezelőn), promptinjekció: a válasz a jelölt
   blokkban marad.

## T7.2 — kliens (külön PR)
- `client/src/lesson-runtime/arbiter.ts`: `requestArbiter(source, taskId, answer)` (fetch, `credentials: "omit"`, 25 s határidő, hiba → null).
- `LessonExperienceView.tsx` és `HtmlLessonTasks.tsx`: kiértékeléskor a nem teljes pontos, nem üres válaszokra (legfeljebb 3 párhuzamosan)
  döntőbíró; az ítélet a körrel együtt mentődik (localStorage), a kártyán „A döntőbíró elfogadta / részben elfogadta: …” sor, az összesítés az
  emelt ítélettel számol; a magyarázó szöveg kiegészül: „A nem teljes pontos válaszokat egy mesterséges intelligencia is átnézi.”
- Ellenőrzés: egységteszt a pontösszesítésre; valós böngészős próba (Studio- és HTML-lecke) a kártya sorával, átfedés / levágás / görgetősáv
  nélkül, mobil szélességen is.

## Ellenőrzés
Célzott tesztek, `check`, `lint`, `check:test`, `build`, teljes `npm test`; T7.1-nél a migráció eldobható Postgres-konténerben (kétszer futtatva
— idempotens), a végpont élő próbája a deploy után (egy valódi feladat, egy helyes saját szavas válasz → döntőbíró `ok`; ugyanaz újra → gyorsítótár).
