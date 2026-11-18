# Végrehajtási utasítás — Adventi naptár („Fénylő ablakok”)

**Állapot:** a tulajdonos 2026-11-18-án döntött (terv 12. szakasz) — a 3. fázis fut, szeletenként; ahol a „Kiegészítés” szakasz eltér a korábbi szövegtől, a Kiegészítés érvényes.
**Terv:** `docs/specs/2026-11-18-adventi-naptar.md` (a hivatkozott R1–R12, E1–E24, A1–A32 jelölések ott vannak).

Ez a fájl AI-ügynöknek szól. Minden szelet külön ág és külön PR az aktuális `origin/main`-ről (ágnév: `feat/advent-<szelet>`, pl.
`feat/advent-s1-mag`); a PR leírása „S1–S6” szeletes funkcióként hivatkozza a tervet. A parancsok PowerShellben, a munkafa
`source/` mappájából futnak, ha a lépés mást nem ír.

## 0. Előfeltételek és közös szabályok

> **FELÜLÍRVA / KIEGÉSZÍTVE:** az 1. pont (döntések) lezárult; a munkarend a „Kiegészítés” szakaszok szerint (szeletenként fej-hash a koordinátornak, az ügynök nem pushol).

1. **Döntések.** A terv 4.1 (a)–(h) pontjaira a tulajdonos válasza kell. A válaszokat az S1 első commitja ELŐTT írd be a terv 4.1
   szakaszába („Döntés: …, 2026-…”) és a `shared/advent/rules.ts` konstansaiba. Ha egy válasz eltér a ★ javaslattól:
   - (a) A2 → `ADVENT_RULES.unlock = "free"`; A3 → `"daily-strict"`.
   - (b) B2 → `ADVENT_RULES.repair = "same-once"`; B3 → `"none"` (ekkor `maxRepairs = 0`, az „új kör” megmarad).
   - (c) C2 → az S7c szelet is elkészül. (d) D2 → az S2a, S2b, S5, S6-előnézet elmarad; állj meg és kérj új tervet az S3-ra
     (helyi tárolós változat) — ezt az utasítás nem fedi. (e) E2 → az S5 elmarad. (g) G2 → S7a. (h) H2 → `lowGrade = "grade3-easy"`;
     H3 → S7b.
2. **Sorrend:** S1 → S2a → S2b → S3a → S3b → S4 → S5 → S6. Az S5 az S2b után bármikor mehet.
3. **Kapuk szeletenként** (a repó gyökeréből): minden szakasz után `npm.cmd run gate:stage`; kibocsátás előtt `npm.cmd run gate:lint`,
   `npm.cmd run gate:push`, független ellenőr (`websuli-fejlesztesi-ellenor` skill) + `record-review`, `npm.cmd run gate:pr -- --body-file <leírás.md>`,
   zöld CI, közvetlenül a merge előtt `npm.cmd run gate:merge -- <PR>`. A háromfázis-ellenőrzés:
   `node scripts/qa/three-phase-check.mjs --base origin/main` → `[három-fázis] OK`.
4. **Migrációszám:** az S2a indulásakor `Get-ChildItem migrations\004*.sql` — ha a `0042` foglalt, a következő szabad számot
   használd mindenhol, ahol ez a fájl `0042`-t ír.
5. **Tilos:** a hét meglévő játék fájljaihoz, a `game-engine/play/*`-hoz, a `tests/game-mobile-cases/`-hez és a `games_catalog`-hoz
   nyúlni; tesztet gyengíteni; valódi e-mail-címet, tokent fájlba írni; `three`-t importálni a naptárba.
6. **Teszt-azonosítók** (a böngészőtesztek ezekre épülnek): `advent-page`, `advent-door-<n>` (attribútum `data-state` =
   `locked|open|solved|repairable|failed`), `advent-question`, `advent-option-<i>`, `advent-feedback`, `advent-next`,
   `advent-summary`, `advent-gift-message`, `advent-encourage`, `advent-repair`, `advent-new-round`, `advent-grade-picker`,
   `advent-grade-<n>`, `advent-promo`, `advent-preview-banner`, `advent-sound-toggle`, `advent-error-retry`.

## S1 — Tiszta mag (`source/shared/advent/`)

> **FELÜLÍRVA / KIEGÉSZÍTVE:** a `rules.ts` / `assignment.ts` / `contract.ts` leírásának ütköző részei helyett a „Kiegészítés” S1-pontja és a „Kiegészítés 5” érvényes (évfolyam 1–12, karácsonyi kiosztás, `adventClosing(summary, ctx)`, `plan.subjects`, `protectedIds`). AZ S1 KÉSZ.

Fájlok: `shared/advent/calendar.ts`, `shared/advent/rules.ts`, `shared/advent/assignment.ts`, `shared/advent/contract.ts`,
`tests/advent-calendar.test.ts`, `tests/advent-rules.test.ts`, `tests/advent-assignment.test.ts`, `tests/advent-contract.test.ts`.
Mind DOM-, React- és adatbázis-mentes; `Math.random` és `Date.now` nincs bennük (az időt paraméterben kapják).

1. `rules.ts`:
   - `export const ADVENT_DOORS = 24; export const ADVENT_PASS_PERCENT = 95; export const ADVENT_MAX_ROUNDS = 3;`
   - `export const ADVENT_RULES = { unlock: "daily", repair: "new-question", maxRepairs: 2, lowGrade: "unavailable", teaserFromDay: 24, catchupUntilJan: 6 } as const;`
   - `export const ADVENT_GIFT_MESSAGE = "Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.";`
   - `export function adventPassed(solved: number, answered: number, total = ADVENT_DOORS): boolean` →
     `answered === total && solved * 100 >= ADVENT_PASS_PERCENT * total`.
   - `export function adventPercent(solved: number, total = ADVENT_DOORS): number` → `Math.floor((solved * 100) / total)` (csak kijelzés:
     23 → 95, 24 → 100; a megfelelést NEM ebből számoljuk).
   - `export type DoorState = "locked" | "open" | "solved" | "repairable" | "failed";`
   - `export function doorState(input: { unlocked: boolean; attempts: readonly { correct: boolean }[]; maxRepairs: number }): DoorState`:
     nincs próba → `unlocked ? "open" : "locked"`; van jó próba → `"solved"`; különben `attempts.length <= maxRepairs ? "repairable" : "failed"`.
   - `export function adventSummary(doors)` → `{ answered, solved, firstTry, repairable, failed, passed, percent }`.
   - `export function adventClosing(summary, round)` → `{ kind: "gift" | "repair" | "new-round" | "done" | "progress", text }` a terv R2–R3
     szövegeivel (a szövegek itt, konstansként).
2. `calendar.ts`:
   - `export function budapestParts(now: Date): { year: number; month: number; day: number }` — `Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" })`.
   - `export type AdventPhase = "before" | "teaser" | "open" | "catchup" | "closed";`
   - `export function adventNow(now: Date): { season: number; phase: AdventPhase; today: string; openDay: number; nextOpensAt: string | null; daysUntilStart: number }`
     a terv R5 szerint: november 1–23. `before`; november 24–30. `teaser` (`openDay` 0); december 1–24. `open` (`openDay` = nap);
     december 25–31. és január 1–6. `catchup` (`openDay` 24, januárban `season` = év − 1); január 7. – október 31. `closed`
     (`season` = a legutóbbi december éve). `nextOpensAt`: `open` fázisban, ha `openDay < 24`, a következő budapesti éjfél ISO-ideje
     (UTC-ben), `teaser`-ben december 1. 00:00 budapesti idő; különben `null`.
   - `export function isDoorUnlocked(day: number, a: { phase: AdventPhase; openDay: number }, unlock = ADVENT_RULES.unlock): boolean`.
3. `assignment.ts`:
   - Bemeneti tételalak: `{ id, grade, subject, tier, prompt, options, correctIndex, explanation? }` (a `DuelBankItem`-mel kompatibilis).
   - `export type AdventPlan = { round: number; layout: number[]; doors: Record<number, string[]> }` (`layout`: az 1–24 nap seedelt
     permutációja = az ablakok helye; `doors[day]`: 3 kérdésazonosító).
   - `export function buildAdventPlan(input: { items; grade; season; round; subjectKey; usedIds: ReadonlySet<string>; usedPrompts: ReadonlySet<string> }): AdventPlan`
     — `createRng(seedFrom("advent", season, round, subjectKey, grade))`; tárgysorrend `rng.shuffle` az 5 tárgyra, a napok körbe;
     szint: nap 1–8 → 1, 9–16 → 2, 17–24 → 3; cellánként `rng.shuffle`, a használt azonosítók és normalizált promptok kiszűrve
     (normalizálás: `normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim()`); ha egy cella elfogy, a szomszéd szint
     (előbb a könnyebb) ugyanabból a tárgyból; ha az is, dobjon `RangeError("advent: elfogyott a kérdés")`.
   - `export function optionOrder(questionId: string, subjectKey: string, season: number): number[]` — a 0–3 seedelt permutációja.
   - `export function toClientQuestion(item, order)` → `{ id, subject, prompt, options }` (kevert sorrend, `correctIndex` NÉLKÜL);
     `export function gradePick(item, order, pick): { correct: boolean; correctIndex: number }` (a kevert sorrendben értve).
   - `export function repairPlanDoor(plan, day, items, used)` — E14: az eltűnt azonosító pótlása a cella következő szabad tételével.
4. `contract.ts`: zod-sémák — `adventDeviceId` (UUID), `adventIdentityBody` (`{ learner?: string; device?: string }`),
   `adventGradeBody` (`grade` 3–12 egész), `adventAnswerBody` (`questionId` ≤ 32 karakter, `pick` 0–3 egész), `adventDayParam` (1–24),
   és a válaszalakok típusai (`AdventState`, `AdventQuestion`, `AdventAnswerResult`).
5. Tesztek (a terv 7. szakasza szerint). Az `advent-assignment.test.ts` a valódi bankot a
   `../client/src/data/gradeQuizBank/index` `GRADE_QUIZ_ITEMS` exportjából veszi, és mind a 10 évfolyamra 3 kört épít: 3 × 72 = 216
   különböző azonosító és normalizált prompt, kivétel nélkül.

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/advent-calendar.test.ts tests/advent-rules.test.ts tests/advent-assignment.test.ts tests/advent-contract.test.ts` | minden teszt `pass`, `fail 0` |
| `npm.cmd run check` és `npm.cmd run check:test` | hiba nélkül |
| `npx.cmd eslint shared/advent --max-warnings 0` | kimenet nélkül |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A3–A5 (tiszta szinten), A8–A10 (szabály), A12–A14 (idő) egységteszttel bizonyítva.

## S2a — Adatmodell és tároló

Fájlok: `migrations/0042_advent_progress.sql`, `shared/schema.ts`, `server/advent/store.ts`, `scripts/run-learning-db-tests.ts`,
`tests/advent-db.integration.ts`.

1. `migrations/0042_advent_progress.sql` a `0040_player_accounts.sql` mintájára: fejléc-komment (terv, visszaállítás:
   `DROP TABLE IF EXISTS advent_progress;`), `SET LOCAL lock_timeout = '5s';`, `--> statement-breakpoint`,
   `CREATE TABLE IF NOT EXISTS advent_progress (…)` a terv R7 oszlopaival; kényszernevek:
   `advent_progress_learner_id_learners_id_fk`, `advent_progress_player_id_player_accounts_id_fk`;
   `CREATE UNIQUE INDEX IF NOT EXISTS advent_progress_subject_unique ON advent_progress (season, subject_kind, subject_id);`
   `CREATE INDEX IF NOT EXISTS advent_progress_kind_updated_idx ON advent_progress (subject_kind, updated_at);`
2. `shared/schema.ts`: `export const adventProgress = pgTable("advent_progress", { … }, (table) => ({ subjectUnique: uniqueIndex("advent_progress_subject_unique").on(table.season, table.subjectKind, table.subjectId), kindUpdatedIdx: index("advent_progress_kind_updated_idx").on(table.subjectKind, table.updatedAt) }))`
   a fájl végére (a `playerBanFingerprints` után), JSDoc-kal (terv, migrációszám); `plan` és `doors` `jsonb().$type<…>()`.
3. `server/advent/store.ts` — `export function createAdventStore(pool: Pick<Pool, "query" | "connect">)`:
   - `read(season, kind, id)` → sor vagy `null` (írás nélkül);
   - `mutate(season, subject, fn)` — tranzakció: `INSERT … ON CONFLICT DO NOTHING`, majd `SELECT … FOR UPDATE`, a `fn(row)` tiszta
     függvény adja az új `grade` / `round` / `plan` / `doors` / `finished_at` / `passed_at` értéket, `UPDATE … SET updated_at = now()`, `COMMIT`;
     hiba → `ROLLBACK`, a kapcsolat mindig `release()`;
   - `claimMail(id, to)` / `releaseMail(id, to)` — `array_append` csak ha még nincs benne (a `lesson-result-email.ts` mintája);
   - `sweep(now)` — `DELETE` a 60 napnál régebben módosított `device` és a 7 napnál régebbi `preview` sorokra; a törölt sorok számát adja.
4. `scripts/run-learning-db-tests.ts`: a 0040-es blokk után a 0042 kétszeri futtatása (`DROP TABLE advent_progress` előtte, mint a
   többi), és a `tests/advent-db.integration.ts` felvétele a futtatott fájlok listájába (a ~101. sor `spawn` argumentumai).
5. `tests/advent-db.integration.ts` (a `tests/player-account-db.integration.ts` szerkezetét követve): egyedi kulcs; `mutate`
   kétszeri párhuzamos hívása (`Promise.all`) nem veszít írást; tanuló törlése → a sor törlődik; `claimMail` kétszer → egyszer ad sort;
   `sweep` határai (59 / 61 nap).

| Parancs | Várt kimenet |
|---|---|
| `npm.cmd run test:learning-db` (Docker kell) | minden integrációs teszt `pass`, `fail 0` |
| `npm.cmd run check` | hiba nélkül |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A24.

## S2b — Szerver-végpontok

> **FELÜLÍRVA / KIEGÉSZÍTVE:** korlátok: „Kiegészítés 5” (alanyonként); e2e-szezon és érvénytelen token: „Kiegészítés 5”.

Fájlok: `server/advent/identity.ts`, `server/advent/routes.ts`, `server/routes.ts`, `server/player/account-store.ts`,
`tests/admin-route-guard.test.ts`, `tests/advent-db.integration.ts` (bővítés), `tests/advent-source-guard.test.ts`.

1. Olvasd el: `server/player/auth-routes.ts` (router-gyár és bekötés mintája), `server/player/account-store.ts` 250–300. sor
   (`exportAccount`), `server/realtime/question-provider.ts` 28–46. sor (`SERVER_GRADE_BANK`), `server/routes.ts` 860–890. sor (bekötések).
2. `identity.ts`:
   - `export function adventEnabled(env = process.env): boolean` — pontosan `on` / `1` / `true` (mint `playerAccountsEnabled`).
   - `export async function resolveAdventSubject(req, input: { learnerToken?: unknown; device?: unknown }, deps)` →
     `{ kind: "learner", id, grade, firstName } | { kind: "player", id, grade: null } | { kind: "device", id, grade: null } | null`
     a terv R6 sorrendjében: `resolveLearner(token)`; különben `getPlayerSessionId(req)` (csak ha `playerAccountsEnabled()`), a fiók
     `linked_learner_id`-ja esetén a tanuló; különben érvényes UUID eszközazonosító; különben `null`.
   - `export function adventClock(req): Date` — `isE2eMode()` esetén az érvényes ISO `X-Advent-Test-Now` fejléc, különben `new Date()`.
3. `routes.ts` — `export function createAdventRouter(deps: { store; items; now: (req) => Date; subject: (req, body) => Promise<Subject | null>; mail?: (row, subject) => void })`
   a terv R8 táblája szerint. Szabályok:
   - minden válasz `Cache-Control: no-store`; `async` hibák `next(error)`-ral;
   - `GET /status` flag nélkül is válaszol; a többi út elé `if (!adventEnabled()) return res.status(404).json({ message: "Not found" })`;
   - `GET /state`: `store.read`; sor nélkül üres naptár (minden ablak `locked` / `open` a nap szerint), `needsGrade: true`, ha nincs évfolyam;
     1–2. évfolyamos tanulónál `{ unavailable: "low-grade" }` (H1);
   - `POST /grade`: csak `player` / `device`, csak ha nincs még próba; különben 409;
   - `POST /doors/:day/open`: zárt nap → 403; `closed` fázis → 409; sor és `plan` létrehozása `store.mutate`-ban (`buildAdventPlan`
     a `SERVER_GRADE_BANK`-ból, `usedIds` = a korábbi körök azonosítói); az aktuális kérdés = az ablak első, még meg nem válaszolt
     tervezett kérdése (megoldott ablaknál az utolsó próba kérdése, csak olvasásra, a tárolt eredménnyel); válasz: `toClientQuestion`;
   - `POST /doors/:day/answer`: a `questionId` nem az aktuális kérdés → ha erre a kérdésre már van tárolt próba, a tárolt eredmény
     (200), különben 409 a friss állapottal; különben a próba rögzítése, `finished_at` / `passed_at` beállítása (`adventSummary`,
     `adventPassed`), válasz: `{ correct, correctIndex, explanation, door, summary, closing }`; ha most lett `finished_at`, `deps.mail?.(…)`
     (nem várjuk meg);
   - `POST /round`: feltételek a terv R8 szerint, különben 409; `round + 1`, új `plan`, a `doors` az új körre üres, `finished_at` null
     (a `passed_at` megmarad);
   - IP-korlát: `rateLimit({ keyGenerator: clientIpKeyGenerator, windowMs: 15 * 60_000, limit: 60 })` az írásra, `windowMs: 60_000, limit: 120`
     az olvasásra; a naplóban csak hibaosztály (`errorClass` a `lesson-result-email.ts`-ből).
4. `server/routes.ts`: a `lessonResultsRouter` bekötése (881. sor) után
   `app.use("/api/advent", createAdventRouter({ … }))`. A CSRF-kivételek listájához NEM adunk semmit (az író utak tokenesek).
5. `tests/admin-route-guard.test.ts`: a hat új nyilvános végpont a `PUBLIC_ENDPOINTS`-ba, indoklással („adventi naptár — saját sor,
   CSRF + IP-korlát”, a két `GET`-nél „mellékhatás nélkül”).
6. `server/player/account-store.ts` `exportAccount`: a visszaadott objektum kap egy `adventCalendar` kulcsot a fiók saját
   `advent_progress` soraiból (`season`, `grade`, `round`, `finished_at`, `passed_at`, megoldott ablakok száma); a meglévő
   adatletöltés-teszt (`tests/player-account-db.integration.ts`) bővül egy állítással.
7. `tests/advent-db.integration.ts` bővítése a terv 7. szakaszának routeres pontjaival (express app a routerrel + `csrf-sync`-kel,
   az `authz-db-harness.ts` mintájára); `tests/advent-source-guard.test.ts`: A22 (a `server/advent/` forrásában nincs
   `logger.*(` hívás `token` / `device` / `name` változóval), R9 (az `X-Advent-Test-Now` olvasása csak `isE2eMode()` ágban).

| Parancs | Várt kimenet |
|---|---|
| `npm.cmd run test:learning-db` | `fail 0` |
| `node --import tsx --test tests/admin-route-guard.test.ts tests/advent-source-guard.test.ts` | `fail 0` |
| `npm.cmd run check`; `npm.cmd run lint` | hiba és figyelmeztetés nélkül |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A2, A3, A7, A17–A23 integrációs teszttel.

## S3a — Kliens 1: naptár, ablak, kérdés

> **FELÜLÍRVA / KIEGÉSZÍTVE:** útvonal `/adventi-naptar`, `?nyit=ma`, képhelyőrzők, évfolyamválasztó 1–12: „Kiegészítés”, „Kiegészítés 2”, „Kiegészítés 3”.

Fájlok: `client/src/pages/AdventCalendar.tsx`, `client/src/advent/useAdvent.ts`, `AdventVillage.tsx`, `AdventDoor.tsx`,
`AdventQuestionDialog.tsx`, `AdventGradePicker.tsx`, `advent.css`, `client/src/App.tsx`, `tests/advent-calendar.spec.ts`.

1. `App.tsx`: `const AdventCalendar = lazy(() => import("@/pages/AdventCalendar"));` és
   `<Route path="/games/adventi-naptar" component={AdventCalendar} />` a `/games/parbaj` sorok elé.
2. `useAdvent.ts`: eszközazonosító (`websuli.advent.device`, `crypto.randomUUID()`, `try/catch`; tároló nélkül memóriában + `volatile: true`);
   `GET /api/advent/state` `fetch`-csel, `X-Learner-Token` (`getLearnerToken()`) és `X-Advent-Device` fejléccel, `credentials: "same-origin"`;
   írás `apiRequest("POST", …, { learner, device, … })`-tal; újralekérés fókuszra, `visibilitychange`-re és a `nextOpensAt` időpontjában
   (egyetlen `setTimeout`); 401-es tanulói tokennél `clearLearnerToken()`.
3. `AdventVillage.tsx`: CSS-rács (`grid-template-columns: repeat(4, 1fr)` álló, `repeat(8, 1fr)` fekvő — `@media (orientation: landscape)`),
   a teljes oldal `height: 100dvh`, `overflow: hidden`, `padding: env(safe-area-inset-*)`; a fejléc `data-game-hud` attribútumot kap
   (az M4 mérő ezt keresi). Az ablakok a `layout` sorrendjében.
4. `AdventDoor.tsx`: `<button data-testid="advent-door-<n>" data-state=…>` a terv R11 nevei szerinti `aria-label`-lel; zárt ablakon
   `aria-disabled="true"` (nem `disabled`, hogy koppintásra megszólaljon a „december N-én nyílik” szöveg `aria-live` régióban).
5. `AdventQuestionDialog.tsx`: a repó `@/components/ui/dialog` komponense; kérdés (`advent-question`, ≥ 16 px), négy
   `advent-option-<i>` gomb (≥ 48 px magas, teljes szélesség, `correctDataAttrs` NEM használható, mert a kliens nem ismeri a helyes
   választ — a böngészőteszt a szerver válaszából dolgozik, lásd 7. lépés); válasz után `advent-feedback` (`aria-live="polite"`: jó /
   nem jó ikon + szöveg, a helyes válasz, magyarázat) és `advent-next` gomb; küldés közben a gombok `aria-busy`, dupla koppintás nem küld kétszer.
6. `AdventGradePicker.tsx`: 3–12. évfolyam gombjai (`advent-grade-<n>`, 5 × 2 rács, ≥ 48 px), „Hányadikos vagy?” címmel; csak
   `needsGrade` esetén.
7. `tests/advent-calendar.spec.ts` (390×844, `hasTouch: true`, `page.setExtraHTTPHeaders({ "X-Advent-Test-Now": … })`): az alapút
   (terv 7., első két pont). A jó válasz kiválasztása: a teszt a `SERVER_GRADE_BANK` megfelelőjét a
   `../client/src/data/gradeQuizBank/index`-ből importálja, és a képernyőn látható kérdésszöveg alapján keresi ki a helyes opció
   szövegét (`page.getByTestId("advent-question").innerText()` → tétel → `options[correctIndex]` → a megegyező szövegű gomb `tap()`).
   A webszerver `ADVENT_CALENDAR=on` környezettel indul: a `playwright.config.ts` `webServer.env` blokkja kap egy sort.

| Parancs | Várt kimenet |
|---|---|
| `npm.cmd run build:e2e` majd `node --import tsx scripts/run-e2e-tests.ts tests/advent-calendar.spec.ts` | minden teszt `passed` |
| `npm.cmd run check`; `npm.cmd run lint` | hiba nélkül |
| `npx.cmd vite build` — a kimenetben az `AdventCalendar-*.js` sor | gzip-méret ≤ 60 kB (jegyezd fel a PR-leírásba) |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A1, A2, A6, A18, A21 böngészőben.

## S3b — Kliens 2: összesítés, javítás, hó, hang

Fájlok: `client/src/advent/AdventSummary.tsx`, `Snowfall.tsx`, `adventSound.ts`, `advent.css`, `AdventCalendar.tsx`,
`tests/advent-calendar.spec.ts`, `tests/advent-source-guard.test.ts`.

1. `AdventSummary.tsx` (`advent-summary`): a szerver `closing` mezője szerint — `gift`: `advent-gift-message` a
   `ADVENT_GIFT_MESSAGE` szövegével (importálva a `shared/advent/rules.ts`-ből, nem újragépelve), alatta „{megoldott} / 24 ablak —
   {százalék}%”, „Elsőre jó: {n} / 24”, a mai budapesti dátum és a keresztnév (ha van); `repair`: `advent-encourage` + `advent-repair`
   gomb; `new-round`: `advent-encourage` + `advent-new-round` gomb; `done`: `advent-encourage`. Az összesítés magától megnyílik, amikor a
   kör véget ért, és a fejlécből bármikor újra megnyitható.
2. Javítás: a `repairable` ablakra koppintva ugyanaz a párbeszédablak nyílik az új kérdéssel; a fejlécben „Javítás — {n}. ablak”.
3. `Snowfall.tsx`: legfeljebb 24 `<span aria-hidden>` CSS-kulcskockás `transform: translate3d` + `opacity` animációval; a
   `useReducedMotion()` igaz értékénél `null`-t ad; `animation-play-state: paused`, ha a párbeszédablak nyitva van vagy a lap rejtett
   (`data-paused` attribútum a gyökéren).
4. `adventSound.ts`: `chime()` és `fanfare()` a `@/lib/audioEngine` `beep`-jéből; a `advent-sound-toggle` a `toggleMuted()`-et hívja;
   rossz válaszra NINCS hang.
5. Ablaknyitás-animáció: `advent.css`-ben 300 ms-os áttűnés + `scale(0.96 → 1)`; `@media (prefers-reduced-motion: reduce)` alatt csak
   áttűnés. Rázás és villogás sehol.
6. `tests/advent-source-guard.test.ts` bővítése: A31 (nincs `from "three"` / `game-engine/scenes` import a `client/src/advent/` és a
   `pages/AdventCalendar.tsx` fájljaiban; nincs `requestAnimationFrame`); A8 (a `client/src` alatt az üzenet szövege csak importként
   szerepel, szó szerinti másolatként nem).
7. `tests/advent-calendar.spec.ts` bővítése: végigjátszás december 24-i tesztidővel — 24 / 24 és 23 / 24 → `advent-gift-message`
   szövege pontosan az üzenet; 22 / 24 (2 ablak 3 hibás próbával) → nincs `advent-gift-message`, van `advent-new-round`; hibás → javítás
   új prompttal → megoldva. (A végigjátszás gyorsítására a teszt közvetlen `request.post`-okkal tölti fel az első 20 ablakot, az
   utolsó négyet a felületen játssza.)

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx scripts/run-e2e-tests.ts tests/advent-calendar.spec.ts` | minden teszt `passed` |
| `node --import tsx --test tests/advent-source-guard.test.ts` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A7–A11, A29, A31.

## S4 — Szezonális kártya és mobil mérés

> **FELÜLÍRVA / KIEGÉSZÍTVE:** a teljes szakasz helyett a „Kiegészítés 3” S4-e érvényes (főoldali kártya; a `Games.tsx` és a `HomePracticeGames.tsx` érintetlen), a „Kiegészítés 5” e2e-pontjaival.

Fájlok: `client/src/components/AdventPromoCard.tsx`, `client/src/pages/Games.tsx`, `client/src/components/HomePracticeGames.tsx`,
`client/src/pages/AdventCalendar.tsx`, `tests/advent-calendar-mobile.spec.ts`, `tests/advent-calendar.spec.ts`.

1. `AdventPromoCard.tsx` (`advent-promo`): `useQuery(["/api/advent/status"])`; `enabled === false`, `before` vagy `closed` → `null`;
   `teaser` → „Adventi naptár — Hamarosan, még {N} nap” (nem link); `open` / `catchup` → `<Link href="/games/adventi-naptar">` a meglévő
   `.game-card` osztályokkal, kiemelőszín `#f87171`, jelvény „ADVENT”.
2. `Games.tsx`: a kártya a napi kihívás blokkja és a játékrács közé; `HomePracticeGames.tsx`: a rács fölé. A hét játék rácsa, a
   `GAME_META` és a `FALLBACK_CATALOG` változatlan.
3. `AdventCalendar.tsx`: `teaser` nézet (visszaszámlálás napokban), `before` nézet („Még nincs itt az advent”), `closed` nézet (saját
   összesítés + „Jövőre újra találkozunk”), kikapcsolt flag → „A naptár most nem érhető el” + vissza a játékokhoz.
4. `tests/advent-calendar-mobile.spec.ts`: a `./support/game-mobile-quality` exportjaival (`MOBILE_VIEWPORTS`, `measureOverflow`,
   `smallTargets`, `smallFonts`, `overlappingTargets`, `emulateSafeArea`, `safeAreaViolations`, `waitForStable`, `hideAndShowPage`),
   mindhárom nézeten, négy állapotban (naptár, kérdés, visszajelzés, összesítés): M1 `{ x: 0, y: 0 }`; M2 `[]`; M3 `[]`; M2-átfedés
   `overlappingTargets(page, '[data-testid^="advent-option-"]')` `[]`; M4 `safeAreaViolations(page, { top: 47, right: 0, bottom: 34, left: 0 })` `[]`;
   M5 ugyanaz az út `hasTouch: false` egérkattintással; M6 `hideAndShowPage` után az ablakok `data-state` listája változatlan és a gyökér
   `data-paused` volt közben; M7 `advent-summary` látható; M8 a `/games`-ről két `tap()` után `advent-question` látható; M9
   `page.emulateMedia({ reducedMotion: "reduce" })` → nincs `Snowfall` elem és `document.getAnimations().length === 0`; A32 nincs
   `console.error`.
5. `tests/advent-calendar.spec.ts` bővítése: dátumhatár (december 4. 22:59:59Z → az 5. ablak `locked`; 23:00:00Z → `open`), november
   23. (nincs `advent-promo`), november 29. („Hamarosan”), december 26. (mind nyitható), január 7. (lezárt nézet, az írás 409).

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx scripts/run-e2e-tests.ts tests/advent-calendar.spec.ts tests/advent-calendar-mobile.spec.ts` | minden teszt `passed` |
| `node --import tsx scripts/run-e2e-tests.ts tests/games-lobby-mobile.spec.ts tests/game-mobile-quality.spec.ts` | változatlanul `passed` (regresszió a hét játékra és a listára) |
| `node --import tsx --test tests/home-practice-games-catalog.test.ts tests/game-mobile-complete.test.ts` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A12–A15, A26–A30, A32. Kézi próba a tulajdonos telefonján (előnézeti címmel az S6 után, vagy helyi futtatással).

## S5 — Szülői levél (csak E1 döntésnél)

> **FELÜLÍRVA / KIEGÉSZÍTVE:** a küldés pillanata: „Kiegészítés 5” (végleges eredmény / megfelelés).

Fájlok: `server/advent/result-email.ts`, `server/routes.ts` (a `mail` függőség átadása), `tests/advent-db.integration.ts`.

1. `result-email.ts`: `export async function sendAdventResult(input: { rowId; season; round; firstName; grade; summary; bySubject }, deps?)`
   — címzettek `resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL })`; címzettenként
   `store.claimMail` → `sendAdminNotification(subject, html, to, { quiet: true, idempotencyKey })` (kulcs:
   `advent-result/<sha256(rowId|round|cím)>`), hiba → `store.releaseMail` és egy 60 s-os újrapróba; `NODE_ENV === "test"` alatt csak
   beállított hamis küldővel megy (`setAdventSender`, a `setResultSender` mintája). Tárgy: „Adventi naptár: {keresztnév} végigért —
   {megoldott} / 24”. A törzs szövegeit HTML-escape-eld; token, eszközazonosító, link-paraméter nincs benne.
2. Küldés csak `learner` alanynál, a kör első `finished_at` beállításakor; `preview` és `device` soha.
3. Integrációs teszt: három címzett → három levél; ismételt válasz → nincs újabb; bukó küldő → felszabadul és pótolható; névtelen → nulla.

| Parancs | Várt kimenet |
|---|---|
| `npm.cmd run test:learning-db` | `fail 0` |
| `node --import tsx --test tests/no-real-emails-guard.test.ts` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage` | zöld |

Elfogadás: A25.

## S6 — Admin előnézet, takarító, bekapcsolás, zárás

> **FELÜLÍRVA / KIEGÉSZÍTVE:** az előnézet nem függ a flagtől, címe `/adventi-naptar?elonezet=…`: „Kiegészítés 5”.

Fájlok: `server/routes.ts`, `server/advent/routes.ts`, `server/advent/sweeper.ts`, `client/src/advent/useAdvent.ts`,
`client/src/pages/AdventCalendar.tsx`, `render.yaml`, `tests/admin-route-guard.test.ts`, `tests/advent-calendar.spec.ts`,
`docs/agent-csapdak.md` (ha a futás tanulságot hozott).

1. `server/routes.ts`: `app.use("/api/admin/advent/preview", isAuthenticatedAdmin, createAdventRouter({ …, now: (req) => previewDate(req.query.date), subject: async (req) => ({ kind: "preview", id: (req.user as { id: string }).id, grade: null }), mail: undefined }))`;
   `previewDate`: csak `ÉÉÉÉ-HH-NN` alak, a budapesti nap 12:00-ja; érvénytelen → 400. Plusz `DELETE /api/admin/advent/preview` (a saját
   előnézeti sor törlése, CSRF).
2. `useAdvent.ts`: ha az URL-ben `elonezet=ÉÉÉÉ-HH-NN` van, az alap-útvonal `/api/admin/advent/preview`, minden kérés `?date=`-tel;
   401 / 403 → a paraméter figyelmen kívül marad, a normál naptár töltődik. `AdventCalendar.tsx`: `advent-preview-banner` + „Előnézet törlése”.
3. `sweeper.ts`: `startAdventSweeper(store)` — induláskor és 24 óránként `store.sweep(new Date())`, `unref()`-elt időzítővel, e2e-módban
   nem indul (a `server/player/sweeper.ts` mintája); bekötés ugyanott, ahol a játékos-takarító indul.
4. `render.yaml`: `ADVENT_CALENDAR` környezeti változó `on` értékkel a webszolgáltatás `envVars` listájába — ez a bekapcsolás; a PR
   leírásában külön kiemelve (tulajdonosi jóváhagyás a merge előtt).
5. Tesztek: `admin-route-guard` (az előnézet admin-őr mögött, a `DELETE` is); böngészőteszt A16 (admin belépve / kilépve).
6. Zárás: a teljes funkció átfogó reviewja (AGENTS.md „Szeletes funkció zárása”) PR-kommentként; a terv `<!-- acceptance-checklist -->`
   pontjainak tételes kipipálása bizonyítékkal (teszt neve / parancs kimenete); retro; a `docs/agent-csapdak.md` bővítése.

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/admin-route-guard.test.ts` | `fail 0` |
| `node --import tsx scripts/run-e2e-tests.ts tests/advent-calendar.spec.ts` | minden teszt `passed` |
| `npm.cmd run verify` | hiba nélkül |
| (gyökérből) `npm.cmd run gate:push` | zöld |

Elfogadás: A16, A23 (éles flag), E23.

## S7 — Döntéstől függő kiegészítők

> **FELÜLÍRVA / KIEGÉSZÍTVE:** az S7a, S7b, S7c NEM készül (terv 12.1).

- **S7a (G2):** `client/src/lib/achievements.ts` — a `recordRun` `game` uniójába `"adventi-naptar"`, új jelvény `advent_2026`
  („Adventi naptár”); a naptár a megoldott ablakonként 10 XP-t jelent a helyi statisztikába. Teszt: a meglévő achievements-teszt bővítése.
- **S7b (H3):** új `client/src/data/adventLowGradeBank/grade-01.ts`, `grade-02.ts` (évfolyamonként ≥ 72 tétel a `GradeQuizItem`
  alakban, 5 tárgy helyett 3: `math`, `hungarian`, `science`), a meglévő bank-validátorokkal ellenőrizve; `ADVENT_RULES.lowGrade = "own-bank"`;
  a kiosztás 1–2. évfolyamon ebből a készletből dolgozik, legfeljebb 1 körrel. A tartalmat a tulajdonos jóváhagyja összevonás előtt.
- **S7c (C2):** `AdventSummary.tsx` előtt egy lépés: „Kinek mutatod meg?” három gombbal; az üzenet a választott szóval jelenik meg
  (`apukádhoz` / `anyukádhoz` / `szüleidhez`), az alapérték a szó szerinti szöveg; az A8 őr-teszt az alapértéket ellenőrzi.

## Teljességellenőrzés (minden szelet végén és a funkció zárásakor)

1. A terv 6. szakaszának minden `- [ ]` pontja: melyik teszt / parancs bizonyítja, és zöld-e (kimenettel).
2. A terv 5. szakaszának E1–E24 esetei: melyik teszt fedi.
3. `git diff --stat origin/main...HEAD` — csak a szelet fájljai; a hét játék és a `game-engine/play/*` érintetlen.
4. A 10. szakasz UNVERIFIED pontjai: ami a szeletben mérhetővé vált, a mért értékkel átírva.

## Kiegészítés a tulajdonosi döntések után (2026-11-18) — felülírja a fentiek ütköző részeit

Döntések: (a) A1, (b) B1, (c) C1, (d) D1, (e) E1, (f) F1, (g) G1, (h) karácsonyi készlet 1–12. évfolyamra, vegyes kiosztás
(terv `docs/specs/2026-11-18-adventi-naptar.md` 12.1–12.3), értesítés az oldalon és e-mailben (terv 12.4). Az S7a, S7b, S7c NEM
készül. A 0. szakasz 1. pontjának eltérés-ágai tárgytalanok.

**Munkarend (koordinátori utasítás):** minden szelet a `feat/jatek-adventi-naptar` ágon (vagy a koordinátor által megadott ágon)
készül; szeletenként `gate:stage` → `gate:push` → a fej-hash átadása a koordinátornak, és MEGÁLLÁS. Az ügynök nem pushol és nem nyit
PR-t. E2E: előbb külön lépésben ellenőrizd, hogy nem fut más e2e / aktív futás, csak utána, külön lépésben indíts, `--workers=1`-gyel;
minden várakozásnak felső korlátja van.

### S1 módosítása

- `rules.ts` (JAVÍTVA 2026-11-18: `lowGrade.maxRepairs` 2, nem 1): `ADVENT_RULES = { unlock: "daily", repair: "new-question", maxRepairs: 2, maxRounds: 3, lowGrade: { maxGrade: 2, maxRepairs: 2, maxRounds: 2 }, teaserFromDay: 24, catchupUntilJan: 6 }`;
  `ADVENT_CHRISTMAS_DAYS = [3, 6, 9, 12, 15, 18, 21, 24]`; `isChristmasDoor(day, grade)` → `grade <= 2 || day % 3 === 0`;
  `limitsForGrade(grade)` → `{ maxRepairs, maxRounds }`; `ADVENT_MIN_GRADE = 1`, `ADVENT_MAX_GRADE = 12`.
- `assignment.ts`: a `buildAdventPlan` új bemenete `christmas: readonly ChristmasItem[]`; a karácsonyi ablak kérdései az évfolyamra
  érvényes (`minGrade ≤ évfolyam ≤ maxGrade`) tételek seedelt keveréséből, visszatevés nélkül, ablakonként `1 + maxRepairs` darab; a
  bank-ablakok tárgyai a NEM karácsonyi ablakokon járnak körbe. A `ChristmasItem` típus az `assignment.ts`-ben él. Közös kereső:
  `findAdventItem(id, bank, christmas)`; a kliensnek adott `subject` karácsonyi tételnél `"christmas"`.
- `contract.ts`: `grade` 1–12.
- Tesztek: az `advent-assignment.test.ts` a karácsonyi tételeket SZINTETIKUS készletből kapja (az S1b valódi készlete előtt): A34,
  A35, A36, és kevés tételnél `RangeError` jön (nem ismétlés).

### S1b — Karácsonyi kérdéskészlet

Fájlok: `shared/advent/christmasBank/items-01-02.ts`, `items-03-04.ts`, `items-05-06.ts`, `items-07-08.ts`, `items-09-12.ts`,
`index.ts` (`CHRISTMAS_ITEMS` összefűzve), `shared/advent/christmas-validate.ts` (`validateChristmasBank(items, gradeBankPrompts)`
→ hibalista), `tests/advent-christmas-bank.test.ts`.

1. Írd meg kézzel a tételeket a terv 12.2 szabályai szerint; soronként egy tétel; azonosító `xmas-001`-től folyamatosan. A sávok
   átfedhetnek (például `minGrade: 1, maxGrade: 4`), hogy minden évfolyam elérje a minimumot.
2. `validateChristmasBank`: egyedi azonosító; egyedi normalizált prompt (a közös bank promptjaival sem egyezik); 4 különböző,
   nem üres válasz; `correctIndex` 0–3; magyarázat 30–300 karakter; `1 ≤ minGrade ≤ maxGrade ≤ 12`; az 1–2. évfolyamra érvényes tétel
   promptja ≤ 80 karakter; évfolyamonkénti darabszám (1–2.: ≥ 144 — JAVÍTVA 2026-11-18, korábban 96; 3–12.: ≥ 72); a helyes válasz indexe a készletben nagyjából
   egyenletes (egyik index aránya sem nagyobb 40%-nál).
3. `tests/advent-christmas-bank.test.ts`: a validátor hibalistája üres; mind a 12 évfolyamra a teljes kör-sorozat felépíthető
   (`buildAdventPlan`, 1–2.: 2 kör, 3–12.: 3 kör) ismétlés nélkül a VALÓDI készlettel és a valódi közös bankkal.
4. Az átadáskor a független ellenőrnek szóló kérés: tételenkénti tényellenőrzés (a vitás tétel törlendő vagy javítandó).

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/advent-christmas-bank.test.ts tests/advent-assignment.test.ts` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage`, majd `npm.cmd run gate:push` | zöld |

Elfogadás: A33–A36 a valódi készlettel.

### S2a, S2b, S3a módosítása

- S2a: ugyanabba a migrációba az `advent_announcements` tábla is (`id`, `season integer`, `recipient_hash char(64)`, `source varchar(16)`,
  `status varchar(8)` `pending|sent|failed`, `created_at`, `updated_at`; egyedi `(season, recipient_hash)`), Drizzle-sémával.
- S2b: a `GET /state` `low-grade` ága nincs; a routernek a `CHRISTMAS_ITEMS` is függősége; `POST /grade` 1–12.
- S3a: az évfolyamválasztó 1–12. (`advent-grade-1` … `advent-grade-12`, 4 × 3 rács); a karácsonyi ablak kérdésénél „Karácsony” címke.

### S8 — Értesítő e-mail (tulajdonosi jóváhagyással)

Fájlok: `server/advent/announce.ts`, `server/routes.ts`, `shared/advent/announce-email.ts` (tárgy + HTML-sablon, tiszta függvény),
`client/src/components/AdventAnnouncePanel.tsx`, `client/src/pages/admin.tsx` (a panel bekötése), `tests/advent-announce.test.ts`,
`tests/advent-db.integration.ts`, `tests/admin-route-guard.test.ts`.

1. Első lépés: `Select-String -Path server\resend.ts,server\daily-reminder.ts -Pattern "unsubscribe|leiratkoz"` — a talált leiratkozási
   módot a sablon szövege követi; ha nincs találat, a sablon ezt írja: „Ha nem kérsz több levelet, válaszolj erre az üzenetre.”
2. **FELÜLÍRVA (Kiegészítés 4 és 5):** `includePlayers` NINCS (a `player_accounts` címei soha), és a `recipient_hash` HMAC-SHA-256 a szerver
   titkával, nem sózatlan SHA-256. Az alábbi szöveg ezekkel az eltérésekkel érvényes.
   `announce.ts`: `collectAnnounceRecipients(storage, { includePlayers })` — `storage.getActiveEmailSubscriptions()` +
   `storage.getActiveExtraEmails()` (+ `includePlayers` esetén az ellenőrzött, nem tiltott `player_accounts` címek); kisbetűsítés,
   `trim`, ismétlődés-szűrés, a `users` tábla soha; visszaad `{ list, bySource }`.
   `announce({ dryRun, confirmCount, includePlayers })`: száraz futás → `{ recipients, bySource, subject, html }` (címek nélkül);
   éles → `confirmCount !== list.length` esetén 409; különben címzettenként foglalás az `advent_announcements`-ben
   (`recipient_hash` = a cím SHA-256 lenyomata), küldés a meglévő Resend-küldővel idempotencia-kulccsal
   (`advent-announce/<évad>/<lenyomat>`), 10-es kötegekben, `status` frissítéssel; `NODE_ENV === "test"` vagy `isE2eMode()` alatt csak
   beállított hamis küldővel.
3. `POST /api/admin/advent/announce` — `isAuthenticatedAdmin`, CSRF; a naplóba csak darabszám.
4. Admin-panel: „Előnézet és címzettszám” gomb (száraz futás), a levél előnézete, a szám forrásonként, jelölőnégyzet „regisztrált
   játékosoknak is” (alapból KI — terv 12.6), „Küldés N címzettnek” gomb megerősítő párbeszéddel.
5. Tesztek: egység (sablon, ismétlődés-szűrés, forrásszabály A39), integrációs (A37, A38: a száraz futás nem ír és nem küld; rossz
   `confirmCount` 409; kétszeri küldés nem dupláz; nem admin 401 / 403).
6. ÉLES KÜLDÉST AZ ÜGYNÖK NEM INDÍT: a szelet átadásakor a koordinátor megkapja a levél szövegét; a címzettek számát a tulajdonos a
   panel száraz futásával látja, és ő nyomja meg a küldést.

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/advent-announce.test.ts tests/admin-route-guard.test.ts tests/no-real-emails-guard.test.ts` | `fail 0` |
| `npm.cmd run test:learning-db` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage`, majd `npm.cmd run gate:push` | zöld |

Elfogadás: A37–A39.

## Kiegészítés 2 — képcsomag (tulajdonosi követelmény, 2026-11-18; terv `docs/specs/2026-11-18-adventi-naptar.md` 13. szakasz)

FIZETŐS képgenerálást ügynök NEM indít: a `generate.ts` csak `--dry-run` kapcsolóval futtatható ügynök által.

### S3a módosítása — képhelyek helyőrzőkkel

- Új `client/src/advent/AdventArt.tsx`: `<AdventArt id="advent-door-08" className=… />` — a `shared/advent/art-manifest.ts`
  (`ADVENT_ART: Record<string, { file: string; width: number; height: number }>`; az S3a-ban üres objektum) alapján `<img>`
  (`loading="lazy"`, `decoding="async"`, `width` / `height` attribútummal, `src="/advent/2026/<file>"`), hiányzó tételnél a
  `client/src/advent/placeholders.tsx` SVG-je ugyanabban a dobozban (`aspect-ratio` CSS-sel rögzítve).
- `shared/advent/art.ts`: a 29 azonosító, a magyar `alt` szövegek (a terv 13.4 motívumnevei; díszítőelemnél üres), a végső méretek —
  a feliratok kódszótárban, nem a képen.
- `advent.css`: megoldott ablak fénye (`box-shadow` arany, `@keyframes advent-glow` 4 s), a csillag felfénylése a 24. ablaknál
  (`@keyframes advent-star` 1,2 s, egyszer); `@media (prefers-reduced-motion: reduce)` alatt mindkettő `animation: none`.
- Teszt: `tests/advent-art.test.ts` — mind a 29 azonosítónak van mérete és (ahol kell) `alt` szövege; a manifest minden kulcsa
  ismert azonosító.

### S3c-0 — gyártó-előkészítés (hívás nélkül)

Fájlok: `design-assets/advent/prompts.json`, `design-assets/advent/style.md`, `scripts/design-assets/generate.ts`,
`scripts/design-assets/lib.ts`, `scripts/design-assets/review-page.ts`, `scripts/design-assets/approve-advent.ts`,
`tests/advent-art-pipeline.test.ts`.

1. `design-assets/advent/style.md`: `COMMON:`, `BAND_ADVENT:`, `KIND_BACKGROUND:`, `KIND_DOOR:`, `KIND_ORNAMENT:` sorok a terv 13.2
   szövegével (angolul, a meglévő `style.md` formájában).
2. `design-assets/advent/prompts.json`: `model` a meglévő `prompts.json` értéke; a 29 tétel a terv 13.3 / 13.5 táblájából (`band: "advent"`,
   `kind`: `background` / `door` / `ornament`, `aspect_ratio`, `alt` magyarul, `references: ["advent-bg-portrait"]` a háttér kivételével,
   `candidates`: 4 vagy 3, `resolution`: `2K` vagy `1K`).
3. `lib.ts`: az `AssetKind` / `AssetBand` unió bővítése (`background`, `door`, `ornament`; `advent`); `estimateSetUsd(items)` a tételenkénti
   `candidates` és `resolution` mezőkből.
4. `generate.ts`: `--set <név>` → a `design-assets/<név>/prompts.json` és `style.md` olvasása, a jelöltek a
   `design-assets/candidates/<név>/<id>/` alá; tételenként `candidates` darab kép; a `--set` nélküli viselkedés VÁLTOZATLAN.
5. `review-page.ts`: `--set <név>` → a készlet jelöltjeiből készít válogatóoldalt.
6. `approve-advent.ts`: a kiválasztás JSON-jából WebP a terv 13.3 méreteire (a meglévő `approve.ts` Playwright-vászon módszerével),
   a `client/public/advent/2026/<id>.<hash8>.webp` alá; a minőséget lépcsőzetesen csökkenti (0,82 → 0,5), amíg a bájtcél teljesül,
   különben hibával megáll; megírja a `shared/advent/art-manifest.ts`-t.
7. `tests/advent-art-pipeline.test.ts`: a készlet 29 tétele érvényes (egyedi azonosító, ismert `kind`, van stílussor, a prompt nem
   üres, nincs benne márkanév-lista szava); `estimateSetUsd` = 4,85 (± 0,01) a terv 13.6 táblája szerint; a `composePrompt` minden
   tételre összeáll.

| Parancs | Várt kimenet |
|---|---|
| `npx.cmd tsx scripts/design-assets/generate.ts --set advent --dry-run --max 90` | „90 kép · becsült költség ≈ 4.85 USD”, alatta a 29 tétel promptja; hálózati hívás nincs |
| `npx.cmd tsx scripts/design-assets/generate.ts --trial --dry-run` | a régi készlet kimenete változatlan |
| `node --import tsx --test tests/advent-art-pipeline.test.ts` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage`, majd `npm.cmd run gate:push` | zöld |

Átadás a koordinátornak: a száraz futás teljes kimenete (a tulajdonos ebből hagyja jóvá a költséget). Elfogadás: A42.

### S3c — a végleges képek cseréje (a tulajdonos válogatása után)

Fájlok: `client/public/advent/2026/*.webp`, `shared/advent/art-manifest.ts`, `server/vite.ts`, `tests/advent-art.test.ts`,
`tests/advent-calendar-mobile.spec.ts`.

1. Bemenet: a tulajdonos `kivalasztas.json` fájlja; futtatás: `npx.cmd tsx scripts/design-assets/approve-advent.ts kivalasztas.json`.
2. `server/vite.ts`: az `/advent` statikus mappa `immutable`, 1 éves gyorsítótárral (a `design-thumbs` sorának mintájára).
3. `tests/advent-art.test.ts` bővítése: bájtcél-őr a fájlokra (A41); a manifest minden fájlja létezik.
4. Mobil mérés újra mindhárom nézeten (a helyőrzős és a képes állapot doboza azonos); képernyőkép a tulajdonosnak.

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx --test tests/advent-art.test.ts` | `fail 0` |
| `node --import tsx scripts/run-e2e-tests.ts tests/advent-calendar-mobile.spec.ts --workers=1` | minden teszt `passed` |

Elfogadás: A40, A41, A43.

### Sorrend a határidőhöz

S1 → S1b és S3c-0 (egymástól függetlenek; az S3c-0 korán kell, hogy a tulajdonos időben jóváhagyhassa a költséget és válogathasson)
→ S2a → S2b → S3a → S3b → S4 → S3c (amint a válogatás megvan; a naptár helyőrzőkkel is élesíthető) → S5 → S6 → S8.

## Kiegészítés 3 — főoldali kártya és új útvonal (tulajdonosi követelmény, 2026-11-18; terv `docs/specs/2026-11-18-adventi-naptar.md` 14. szakasz)

Felülírja az S3a útvonalát és az S4 kártya-részét. A `client/src/pages/Games.tsx`, a `client/src/components/HomePracticeGames.tsx`
és az `AdventPromoCard.tsx` NEM része a munkának (a naptár nem kerül a játékok közé).

- **S3a:** az útvonal `<Route path="/adventi-naptar" component={AdventCalendar} />` (az `App.tsx`-ben a `/games` sor elé). Az
  `AdventCalendar.tsx` a `?nyit=ma` paraméterre az állapot megérkezése után egyszer megnyitja a soron következő ablak kérdését
  (sorrend: mai megválaszolatlan → legkorábbi nyitható megválaszolatlan → első javítható → semmi), majd a paramétert
  `history.replaceState`-tel eltávolítja (újratöltéskor nem nyit újra). A böngészőtesztek a `/adventi-naptar` címet használják.
- **S4 (átírva) — főoldali kártya.** Fájlok: `client/src/components/AdventHomeCard.tsx`, `client/src/components/UserFileList.tsx`,
  `client/src/advent/advent.css`, `shared/advent/art.ts` (új tétel: `advent-home-banner`, 1600 × 400), `tests/advent-home-card.spec.ts`,
  `tests/advent-calendar-mobile.spec.ts`, `tests/advent-source-guard.test.ts`.
  1. **FELÜLÍRVA (Kiegészítés 5):** a kliensben NINCS e2e-ág — a helyfoglalás mindig `homeCardReserve(new Date())`; a tesztek a
     Playwright órájával és az `X-Advent-Test-Now` fejléccel állnak ugyanarra a napra.
     `AdventHomeCard.tsx` (`advent-home-card`): a doboz lefoglalása a terv 14.4 szerint (`adventNow(new Date())` fázisa; e2e-buildben
     — `import.meta.env.VITE_ENABLE_GAME_TEST_HOOKS === "1"` — a `status` válasz fázisa); `min-height` = `max-height`: 132 px, `md:`
     160 px; `mb-3`. Tartalom: `AdventArt id="advent-home-banner"` háttérként (`fetchpriority="high"`, nem lusta, `alt=""`), cím,
     `advent-home-status` (a terv 14.3 szövegei, egy tiszta `homeCardStatus(state)` függvényből a `shared/advent/rules.ts`-ben,
     egységteszttel), `advent-home-cta` (`<Link href="/adventi-naptar?nyit=ma">`, „Kinyitom” / „Megnézem”, ≥ 48 px magas).
  2. `UserFileList.tsx`: `<AdventHomeCard />` a `HeroSection` záró sora (318.) és a `SponsorBar` (321.) közé, valamint az üres listás
     ág (266. sortól) `container` elemének első gyerekeként. Más sor nem változik.
  3. `tests/advent-home-card.spec.ts` (390×844 érintős és 1366×768): a kártya a Hero alatt és a `button-filter-all` fölött van
     (`boundingBox` sorrend); magasság ≤ 132 / ≤ 160; a gomb ≥ 48 × 48; az első tananyagkártya felső éle a kártya nélkül (szezonon
     kívüli tesztidő) és a kártyával — a különbség ≤ 144 / ≤ 172, mindkét érték `console.log`-gal a PR-leíráshoz; CLS: a
     `PerformanceObserver` `layout-shift` összege a betöltés alatt < 0,02 lassított `/api/advent/state` válasszal (`page.route`
     800 ms késleltetés); állapotszövegek december 3-i, november 29-i tesztidővel; egy `tap()` a gombra → `advent-question` látható
     (A45); november 23. és január 7. → nincs `advent-home-card`; a `/games` oldalon nincs `advent` szöveg / link (A46).
  4. `tests/advent-source-guard.test.ts` bővítése: a `Games.tsx` és a `HomePracticeGames.tsx` forrásában nincs `advent` (A46).
  5. A mobil mérés M8 pontja: a főoldalról egy `tap()` után `advent-question` látható.

| Parancs | Várt kimenet |
|---|---|
| `node --import tsx scripts/run-e2e-tests.ts tests/advent-home-card.spec.ts tests/advent-calendar-mobile.spec.ts --workers=1` | minden teszt `passed` |
| `node --import tsx scripts/run-e2e-tests.ts tests/home-views.spec.ts tests/material-title.spec.ts tests/classroom-badge.spec.ts tests/games-lobby-mobile.spec.ts --workers=1` | változatlanul `passed` |
| `node --import tsx --test tests/home-list-visibility.test.ts tests/home-cards-modern.test.ts tests/home-practice-games-catalog.test.ts tests/advent-source-guard.test.ts` | `fail 0` |
| (gyökérből) `npm.cmd run gate:stage`, majd `npm.cmd run gate:push` | zöld |

  Elfogadás: A44–A48, A12–A15, A26–A30, A32.
- **S3c-0:** a készlet 30 tételes (`advent-home-banner`, 4 jelölt, 2K); a száraz futás várt kimenete „94 kép · becsült költség ≈ 5.22 USD”,
  az `estimateSetUsd` teszt várt értéke 5,22 (± 0,01).
- **S8:** a levél gombja a `/adventi-naptar` címre mutat.

## Kiegészítés 4 — döntések a képköltségről és a címzettekről (2026-11-18; terv `docs/specs/2026-11-18-adventi-naptar.md` 15. szakasz)

- **S3c-0 (pontosítva):** a `generate.ts` `--set <név>` módja tételenként `candidates` képet készít a tétel saját `resolution`
  értékével; `--max` a KÉPEK számát korlátozza; `--max-usd <összeg>` kemény plafon (a terv és a futás közbeni ellenőrzés is ezt
  használja; plafon nélkül az éles futás hibával megáll; a sikertelen kísérlet is a keretbe számít). A tiszta tervező a `lib.ts`
  `planJobs` függvénye. A jelöltek és a válogató lap a nem követett `design-assets/candidates/<név>/` alatt. A `--set` nélküli
  viselkedés változatlan. Az `approve-advent.ts` NEM ebben a szeletben, hanem az S3c-ben készül (csak a válogatás után kell).
  Várt száraz futás: `94 kép · becsült költség ≈ 5.22 USD`; próbakör: `10 kép · becsült költség ≈ 0.65 USD`.
- **S8 (szűkítve):** a címzettek csak az `email_subscriptions` (`is_subscribed`) és az `extra_email_addresses` (`is_active`) címei; a
  `player_accounts` és a `users` tábla soha. Az `includePlayers` kapcsoló és a panel jelölőnégyzete nem készül.

## Kiegészítés 5 — az S1-review átvezetése (2026-11-18; terv `docs/specs/2026-11-18-adventi-naptar.md` 16. szakasz)

- **S1 javító commit (KÉSZ):** `adventClosing(summary, { round, maxRounds, phase, waiting })` + `adventStillReachable`; `closed`
  fajta; `ADVENT_CHRISTMAS_DAYS` az egyetlen igazságforrás; `lowGrade` 2 javítás / 2 kör; `isValidDate` és érthető hiba érvénytelen
  időpontra; `AdventPlan.subjects`; `repairPlanDoor` `protectedIds`-szel, a tárgy a tervből; új tesztek (december 24 → 25 határ,
  keverés egyenletessége, 40 alany × 12 évfolyam, fázisfüggő szövegek).
- **S1b:** az 1–2. évfolyamra érvényes tételek minimuma 144 (nem 96); a validátor és a teszt ezt kényszeríti.
- **S2a:** a terv 16.8 `CHECK` kényszerei; a `mailed_to` elemei `final:<lenyomat>` (JAVÍTVA: terv 18.1); az `advent_announcements.recipient_hash` HMAC.
- **S2b:** korlátok a terv 16.1 / 18.2 szerint — `subjectLimiter` (a feloldott alany kulcsára, 200 / 15 perc; a teszt a 144 írásos legrosszabb esetet méri), `ipLimiter` (600 / 15 perc),
  `createLimiter` (új `device` sor: 30 / óra / IP; a `store.mutate` jelzi, ha a sor most jött létre); a régi „60 / 15 perc / IP”
  NEM készül. `adventClock(req)`: e2e-módban érvényes `X-Advent-Test-Now` nélkül a router „kikapcsolt”-ként viselkedik (`status`:
  `{ enabled: false }`, a többi 404); a fejléc értékét `isValidDate` szűri. Érvénytelen tanulói token → a `state` válaszban
  `pairing: "invalid"`. A `closing` a `phase` és a `waiting` (nyitható, megválaszolatlan ablakok száma) átadásával készül.
  Tesztek: A49, A51, A53.
- **S3a / S4:** a kliensben nincs e2e-ág; a főoldali kártya helyfoglalása `homeCardReserve(new Date())` (tiszta függvény a
  `shared/advent/calendar.ts`-ben, egységteszttel); a böngészőtesztek `page.clock.setFixedTime(...)` + `X-Advent-Test-Now` párossal
  futnak. Érvénytelen párosításnál a felület újrapárosítást kér (`advent-pairing-invalid`, „Folytatom vendégként” gomb).
- **S5 (JAVÍTVA 2026-11-18):** évadonként EGYETLEN levél a terv 18.1 szerint — megfeleléskor, vagy az utolsó kör végleges lezárásakor, vagy
  évadzáráskor (a takarító `closed` fázisban egyszer elküldi a megkezdett, levél nélküli tanulói soroknak); kulcs: `final:<lenyomat>`;
  körönkénti és külön „megfelelt” levél NINCS; teszt: A50 a 18.1 eseteivel.
- **S6:** az `/api/admin/advent/preview` bekötése a flag-ellenőrzés NÉLKÜL (a router-gyár `requireFlag: false` beállítással).
- **S8:** HMAC-lenyomat; a lábléc szövege a terv 16.6 szerint; valódi leiratkozó link csak külön tulajdonosi döntéssel.

## Kiegészítés 6 — az ellenőri ítéletek 2. köre (2026-11-18; terv `docs/specs/2026-11-18-adventi-naptar.md` 18. szakasz)

- **S1 2. javító commit (KÉSZ):** `adventClosing` — `closed` csak `closed` fázisban; `before` / `teaser`: `soon` fajta; 0 megoldott
  ablaknál számolás nélküli zárószöveg; tesztek.
- **S3c-0 javító commit (KÉSZ):** `lib.ts` `attemptWithinBudget` (hívásonkénti keret), `spentFromLog` + `planJobs({ existing, alreadySpent })`
  (összesített keret, a meglévő jelöltek kihagyása), `requestImage` (időkorlát), `parseRefs` + `missingReferences` (kiválasztott
  referencia), `scene` típus; hamis `fetch`-es tesztek (a 6,95 USD-os eset: a második hívás nem megy ki).
  Runbook: a keret BECSÜLT áron számol; a valódi kemény plafon a szolgáltatónál a kulcsra állított keret (tulajdonosi teendő); a
  próbakör után a számlázott összeget össze kell vetni a becsléssel.
  Próbakör: `npx.cmd tsx scripts/design-assets/generate.ts --set advent --only advent-bg-portrait,advent-door-08,advent-door-24 --max 10 --max-usd 7`
  Teljes kör (válogatás után): `npx.cmd tsx scripts/design-assets/generate.ts --set advent --max 94 --max-usd 7 --ref advent-bg-portrait=advent-bg-portrait/<a kiválasztott fájl>`
- **S5 / S6:** a levél szabálya a terv 18.1; az évadzáró küldés a takarító része (`closed` fázisban, egyszer).

## Állapotnapló

A szeletek a saját sorukat a saját águkon (PR-jukban) teszik hozzá; a napló mindig a fájl utolsó szakasza.

- 2026-11-18 — S1 KÉSZ: `source/shared/advent/` (`calendar.ts`, `rules.ts`, `assignment.ts`, `contract.ts`) + 4 tesztfájl, 39 teszt; a független ellenőr ítélete a `bb248dd1` fejre: IGEN, FELTÉTELLEL; a K5, A1, A4–A7, K3 javítása külön commitban.
- 2026-11-18 — S1b KÉSZ (ellenőrre vár): `source/shared/advent/christmasBank/` 288 kézzel írt tétel (1–4. évfolyam: 144, 5–8.: 72, 9–12.: 72), `christmas-validate.ts`, `tests/advent-christmas-bank.test.ts`; a tételek tényszerűségét a független ellenőr tételenként ellenőrzi.
- 2026-11-18 — S2a KÉSZ: `migrations/0042_advent_progress.sql` (a szám szabad volt: a `main` utolsó migrációja a 0041), Drizzle-séma
  (`adventProgress`, `adventAnnouncements`, CHECK kényszerekkel), `server/advent/store.ts`, `tests/advent-db.integration.ts`, a
  DB-futtató bővítése. Az S8 lábléce: terv 17. szakasz (egyszeri levél, új leiratkozó link nincs).
- 2026-11-18 — S2b KÉSZ: `server/advent/clock.ts` (flag, óra), `identity.ts` (alany), `routes.ts` (hat végpont a `/api/advent` alatt, alanyonkénti
  200 / 15 perc, IP 600 / 15 perc, új névtelen sor 30 / óra), bekötés a `server/routes.ts`-be, játékos-adatletöltés (`adventCalendar`),
  végpont-leltár, `tests/advent-routes-db.integration.ts`, `tests/advent-source-guard.test.ts`; a DB-kör időkorlátja 300 s → 480 s.
