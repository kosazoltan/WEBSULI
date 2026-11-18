# Végrehajtási utasítás — Adventi naptár („Fénylő ablakok”)

**Állapot:** 2. fázis kész — 2026-11-18, ág `feat/jatek-adventi-naptar`; a 3. fázis (kód) a tulajdonos döntései (terv 4.1) után indul.
**Terv:** `docs/specs/2026-11-18-adventi-naptar.md` (a hivatkozott R1–R12, E1–E24, A1–A32 jelölések ott vannak).

Ez a fájl AI-ügynöknek szól. Minden szelet külön ág és külön PR az aktuális `origin/main`-ről (ágnév: `feat/advent-<szelet>`, pl.
`feat/advent-s1-mag`); a PR leírása „S1–S6” szeletes funkcióként hivatkozza a tervet. A parancsok PowerShellben, a munkafa
`source/` mappájából futnak, ha a lépés mást nem ír.

## 0. Előfeltételek és közös szabályok

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
