# Végrehajtás: hibavadászat — megerősített hibák javítása

> Spec: `docs/specs/2026-11-10-hibavadaszat.md` · Ág: `fix/hibavadaszat-2026-11-10`
> Közös szabály: meglévő tesztet átírni, gyengíteni tilos; reguláris kifejezést az Edit / Write eszközzel kell írni (C-24).
> A három szelet fájljai nem fedik egymást; szeletenként egy commit.

## A szelet — kliens és közös logika
- **TA1** `client/src/lesson-runtime/ExperienceSpeech.tsx`: `export function stopSpeech`; `LessonExperienceView.tsx:89` a
  takarításban `stopSpeech()`-t hív.
- **TA2** `ExperienceSpeech.tsx` `onerror`: `if (isSoftSpeechError(e?.error) && started) { finish(); return; }` — különben `fallBack()`.
- **TA3** `utterance.onboundary = () => { started = true; }`; az őr ideje `speechStartTimeout(voice)`:
  `shared/speech-fallback.ts` → `SPEECH_START_TIMEOUT_REMOTE_MS = 6000`, `speechStartTimeoutMs(localService: boolean | undefined)`.
- **TA4** `client/src/lib/queryClient.ts`: mindkét helyen `error instanceof TypeError` (a `.includes('fetch')` nélkül).
- **TA5** `shared/match-order.ts` (új, tiszta): `matchRightOrder(pairs)` → indexek megjelenítési sorrendje (`optionOrder` a
  párok szövegéből; ha azonos az eredetivel és `length > 2`, eggyel elforgatva). `blocks/try-blocks.tsx` jobb oszlopa ebben a
  sorrendben, `key` / `pickRight` az eredeti indexszel.
- **TA6** `shared/answer-value.ts` `unitPresent`: a minta végén `(?![\p{L}\d²³^])`.
- **TA7** `client/public/service-worker.js` `notificationclick`: `const target = new URL(urlToOpen, self.location.origin).href;`
  az összehasonlítás és az `openWindow` ezt használja.
- **TA8** `shared/newsletter.ts`: `[...t].slice(0, 69).join("")`, a hossz kódpontban mérve.
- **TA9** (utólagos tétel) `client/src/pages/Preview.tsx`: az URL + gombok csoportjának osztálya `hidden sm:flex items-center
  gap-2 flex-1 max-w-xl` (a `min-w-0` törölve). Új forrásőr a `tests/hibavadaszat-a.test.ts`-ben. Ellenőrzés: `npm.cmd run check`,
  a célzott teszt, majd a telepítés után élesben 847 px széles ablakban `scrollWidth === clientWidth` az előnézeti oldalon.
- **Tesztek (új):** `tests/hibavadaszat-a.test.ts` — `matchRightOrder` (permutáció, determinisztikus, ≥ 3 párnál nem azonos),
  `gradeTypedAnswers` mértékegység-határ (H5), `speechStartTimeoutMs`, `newsletterSubject` emojival (nincs árva helyettesítő),
  forrásőr: a `service-worker.js` `new URL(` feloldást használ; a `queryClient.ts` nem tartalmaz `includes('fetch')`-et.
  `tests/lesson-fusion.spec.ts` új tesztek: fülváltás leállítja a tartalék hangot (H1); el nem indult kimondás `interrupted`
  hibája → tartalék (H2). A meglévő „`interrupted` → nincs lejátszás” teszt változatlan marad: ha az a kimondás indulása nélkül
  küld `interrupted`-et, a TA2 feltételét úgy kell megírni, hogy az a teszt is zöld maradjon (akkor a megkülönböztető jel:
  a hiba a `speak()` hívásától számított 1 mp-en belül, `synth.speaking === false` mellett érkezik-e) — a tesztet nem írjuk át.

## B szelet — szerver
- **TB1** `server/lib/async-route.ts` (új): `asyncRoute(handler)` → `(req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)`.
  Alkalmazás: `studio/lesson-routes.ts` `try` nélküli `async` kezelői, `routes.ts` `GET /api/learner/view/:materialId` és
  `POST /api/admin/daily-reminders/run`. `server/index.ts`: `process.on('unhandledRejection', …)` — naplóz (`logger.error`), nem lép ki.
- **TB2** `server/dailyViewSummary.ts`: `cron.schedule("0 20 * * *", …, { timezone: "Europe/Budapest" })`; tiszta
  `summaryWindow(now)` → `{ start, end }`: `end` = a legutóbbi budapesti 20:00 (`now`-kor vagy előtte), `start` = az azt megelőző
  nap 20:00-ja (óraátállításkor 23 / 25 óra; review #413: a tervezett határhoz rögzítve, nem a futás pillanatához). A levél szövege az ablakhoz igazodik, ha „ma”-t állít.
- **TB3** `routes.ts`, `lesson-result-email.ts`: a `req.ip` kulcsok helyett `clientIpKey(req)`.
- **TB4** `POST /api/materials/:id/comments`: `storage.getHtmlFile` → hiányzó anyagra 404 (a kedvelés útvonalának üzenetével).
- **TB5** `routes.ts` osztály-ellenőrzés (feliratkozás, extra címek): `Number.isInteger(c)`.
- **TB6** `routes.ts` reorder: minden `displayOrder` `Number.isInteger` és `|x| ≤ 2147483647`, különben 400 a módosítás előtt;
  `invalidateHtmlFilesCache()` `finally`-ben.
- **TB7** `server/arbiter/routes.ts`: `CURRENT_DATE` → `(now() AT TIME ZONE 'Europe/Budapest')::date`.
- **Tesztek (új):** `tests/hibavadaszat-b.test.ts` — `asyncRoute` (elutasított ígéret → `next(err)`), `summaryWindow`
  (normál nap 24 óra; 2026-03-29 és 2026-10-25 körül 23 / 25 óra), forrásőrök: `dailyViewSummary.ts` tartalmazza a
  `timezone: "Europe/Budapest"` beállítást; `routes.ts` és `lesson-result-email.ts` nem tartalmaz `req.ip`-t;
  `index.ts` tartalmaz `unhandledRejection` kezelőt.

## C szelet — régi Safari
- **TC1** Átírás visszatekintés nélkül, azonos jelentéssel: `(?<!\p{L})X` → `(?:^|[^\p{L}])X` (ahol csak `.test()` fut);
  ahol a találat szövege / indexe számít (`matchAll`, `match`, globális minta), a bevezető karakter külön csoportba kerül, és a
  hívó a tartalmi csoportot / igazított indexet használja; `split(/(?<=[.!?])\s+/u)` → írásjel-megtartó csere + `split`.
  Fájlok: `shared/option-order.ts`, `shared/option-key.ts`, `shared/lesson-block-label.ts`, `shared/lesson-experience.ts`,
  `shared/single-choice-check.ts`, `client/src/data/wordLadder/validate.ts`.
- **TC2** `tests/no-lookbehind-client.test.ts` (új): a `client/src` minden `.ts` / `.tsx` fájljából indulva bejárja az
  importokat (`@shared/…`, `@/…`, relatív; `import type` nélkül), és elbukik, ha bármely elért fájlban `(?<!` vagy `(?<=` áll.
- **Ellenőrzés:** a meglévő `single-choice-*.test.ts`, `option-order.test.ts`, `quiz-option-order.test.ts`,
  `lesson-block-label.test.ts`, `word-ladder-validate.test.ts` változtatás nélkül zöld.

## Záró ellenőrzés, szállítás
- `npm.cmd run check`, `lint`, `check:test`, `npm.cmd test`, `npx.cmd playwright test -c playwright.lesson-fusion.config.ts`,
  `-c playwright.lesson-interactions.config.ts` (párosító), kliens build + a `dist/public/assets/*.js` fájlokban nincs `(?<`.
- PR a `main`-re, automatikus összevonás, élő füstpróba: `POST /api/materials/<nem létező>/comments` → 404; a lecke megnyílik.
- Tanulság a `docs/agent-csapdak.md`-be.
