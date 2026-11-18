# Spec: Adventi naptár — „Fénylő ablakok” (új, szezonális játék)

> Dátum: 2026-11-18 · Szerző: Claude (tervező alügynök) · Állapot: VÁZLAT — a 4.1 döntési pontok a tulajdonosra várnak
> Szabály: 3+ fájlt érintő feladat csak spec + AI-olvasható végrehajtási utasítás után indul (`docs/agent-haromfazisu-munka.md`).
> Végrehajtás: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`. Ebben a körben csak az 1–2. fázis készül, kód nem.

A tulajdonos kérése (2026-11-18, szó szerint): „készíts nekem egy vadonatúj játékot a karácsonyi ünnepekre, amelyben mindegyik
tanulónak adventi naptárat kell kinyitnia. Mindegyik feldob egy kérdést a maga tudásszintjén, és amikor végigér, és mondjuk 95%-os
módon teljesít, akkor írja ki, hogy: »Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.«”

## 1. Cél

Egy eredeti, szezonális játék: egy havas falu 24 ablaka. Minden ablak mögött egy kérdés van a tanuló saját évfolyamáról; a jól
megoldott ablak kivilágosodik, a falu napról napra fényesebb, a 24. ablak a karácsonyfa csillagát gyújtja meg. Aki végigér, és
legalább 95%-ot teljesít (24 ablakból legalább 23), annak a játék szó szerint ezt írja ki:
**„Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.”** Aki ez alatt marad, bátorítást és javítási lehetőséget kap.

A játék könnyű (2D, CSS / SVG, three.js nélkül), telefonon 360×640 képponttól használható, és a meglévő közös évfolyam-bankból
kérdez — új kérdést nem kell gyártani hozzá.

## 2. NEM cél (out of scope)

- Új kérdésbank vagy kérdésgyártás (kivétel: a 4.1 (h) döntés C opciója, külön szeletben).
- 3D jelenet, three.js, játékhurok (`requestAnimationFrame`-alapú szimuláció).
- A felhő-ranglista (`game_scores`) és a `games_catalog` tábla bővítése; a hét meglévő játék kódjának módosítása.
- A közös játékmotor (`source/client/src/game-engine/play/*`, `GameId` unió) bővítése: a naptár nem „nyolcadik motoros játék”,
  hanem önálló oldal (indok: 4.2 / R8).
- Eszközről tanulóra történő előrehaladás-átvitel (ha a névtelen eszközt később párosítják, a naptár a tanuló sorával folytatódik,
  az eszköz névtelen sora nem olvad bele).
- Fizetés, valódi ajándék kezelése, push-értesítés, napi emlékeztető e-mail a naptárról.
- Többjátékos mód, párbaj.

## 3. Érintett területek

### 3.1 Felmért, meglévő kód (2026-11-18, `origin/main` = `a7b3b787`)

| Terület | Tény (fájl) |
|---|---|
| Közös évfolyam-bank | `source/client/src/data/gradeQuizBank/grade-03.ts` … `grade-12.ts`: 3–12. évfolyam, évfolyamonként 285 tétel, 5 tárgy (`math`, `english`, `hungarian`, `science`, `history`) × 57; a 15 (tárgy, nehézségi szint) cella mérete 18–20 (mérve, legkisebb 18). Alak: `types.ts` (`GradeQuizItem`: `id`, `grade`, `subject`, `tier` 1–3, `prompt`, 4 `options`, `correctIndex`, `explanation`). 1–2. évfolyamra NINCS közös bank (`MIN_GRADE = 3`). |
| A bank a szerveren | `source/server/realtime/question-provider.ts`: `SERVER_GRADE_BANK` — a szerver már ma szinkron importálja mind a tíz évfolyam-fájlt (a párbajhoz). |
| Évfolyam forrása | (1) Párosított tanuló: `learners.grade` (`source/shared/schema.ts:1218`), a `resolveLearner(token)` adja (`source/server/learners.ts:83`); a kliens a tokent a `websuli.learnerToken` kulcson tárolja (`source/client/src/lib/learnerProfile.ts`), a `GET /api/learner/me` válasza `{ firstName, grade }`. (2) Játékos-fiók (`player_accounts`, `PLAYER_ACCOUNTS` flag, alapból KI): évfolyama NINCS, de `linked_learner_id` tanulóhoz kötheti. (3) Névtelen: a játékok maguk kérdezik meg és a böngészőben tárolják (pl. `SpeedQuizMath.tsx:1570` helyi állapot, `SpaceAsteroidQuiz.tsx:283` `websuli.spaceQuiz.grade`). A `useGradeLevel` (`game-engine/useGradeLevel.ts`) NEM évfolyamot ad, hanem az évfolyamon belüli 10 pályát kezeli — a naptár nem használja. |
| Seedelt véletlen | `source/shared/game-rng.ts`: `createRng(seed)`, `seedFrom(...parts)`, `shuffle`, `pick` — kliens és szerver közös. |
| Ismétlés-szabály | `game-engine/gradeQuiz.ts` `normalizePrompt` (NFC + kisbetű + szóköz): azonos azonosító VAGY azonos normalizált prompt = ugyanaz a kérdés. |
| Újrapróba-minta | `game-engine/retry-policy.ts`: a közös minta egy újrapróba. |
| Budapesti nap | `source/server/learners.ts:98`: `Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" })` → `YYYY-MM-DD`. |
| CSRF | `source/server/routes.ts:792–850`: minden író kérés CSRF-tokenes (`X-CSRF-Token`, a kliensen `apiRequest`), kivéve a tételesen felsorolt Origin-őrös utakat. A vendég eredménybeküldés (`POST /api/lessons/:lessonId/results`) is CSRF-tokennel megy, a tanulói token a kérés törzsében (`client/src/lesson-runtime/resultReport.ts`). |
| Végpont-leltár őr | `source/tests/admin-route-guard.test.ts`: minden admin-őr nélküli végpontot a `PUBLIC_ENDPOINTS` listában indokolni kell. |
| Eredménylevél | `source/server/lesson-result-email.ts`: címzettek `resolveAdminRecipients` (`ADMIN_EMAILS`), küldés `sendAdminNotification(…, { quiet, idempotencyKey })`, foglalás-előbb minta (`array_append` feltétellel), tesztben valódi levél nem megy. A `lesson_result_emails` tábla leckéhez kötött (`lesson_id` idegen kulcs) — a naptár nem tudja használni. |
| Játéklista | `source/client/src/pages/Games.tsx` (`GAME_META`, `FALLBACK_CATALOG`), főoldal: `source/client/src/components/HomePracticeGames.tsx`; útvonalak: `source/client/src/App.tsx:105–114`. |
| Játék-őrök | `tests/game-mobile-complete.test.ts` pontosan 7 esetfájlt vár a `tests/game-mobile-cases/` mappában; a `defineGameMobileQuality` (`tests/support/game-mobile-quality.ts:368`) kezdő / játék / szünet / eredmény állapotot és `forceState` kampót feltételez. A mérő segédfüggvényei (`measureOverflow`, `smallTargets`, `smallFonts`, `emulateSafeArea`, `safeAreaViolations`, `overlappingTargets`, `waitForStable`, `MOBILE_VIEWPORTS`) külön exportáltak. |
| Hang | `source/client/src/lib/audioEngine.ts`: `beep`, `sfxSuccess`, `sfxError`, `sfxClick`, `isMuted`, `toggleMuted` (szintetizált, hangfájl nélkül). |
| Csökkentett mozgás | `game-engine/useReducedMotion.ts`. |
| E2E-mód | `source/server/lib/e2e-mode.ts` `isE2eMode()` (`WEBSULI_E2E=1`, eldobható adatbázis). |
| Migrációk | `source/migrations/0041_player_ban_fingerprints.sql` az utolsó; minta: `0040_player_accounts.sql` (additív, `IF NOT EXISTS`, visszaállítás kommentben). |
| Kapu-leképezés | `scripts/qa/gates/stage-gate.mjs:35–50`: a változott fájl nevéből (`advent…`) keresi a `tests/*advent*.test.ts` egységteszteket. |

### 3.2 Új és módosuló fájlok (a 3. fázisban)

Új — közös mag: `source/shared/advent/calendar.ts`, `rules.ts`, `assignment.ts`, `contract.ts`.
Új — szerver: `source/server/advent/store.ts`, `identity.ts`, `routes.ts`, `result-email.ts`, `sweeper.ts`;
`source/migrations/0042_advent_progress.sql`.
Új — kliens: `source/client/src/pages/AdventCalendar.tsx`; `source/client/src/advent/` (`useAdvent.ts`, `AdventVillage.tsx`,
`AdventDoor.tsx`, `AdventQuestionDialog.tsx`, `AdventSummary.tsx`, `AdventGradePicker.tsx`, `Snowfall.tsx`, `adventSound.ts`,
`advent.css`); `source/client/src/components/AdventPromoCard.tsx`.
Módosul: `source/shared/schema.ts` (új tábla), `source/server/routes.ts` (router bekötés), `source/client/src/App.tsx` (útvonal),
`source/client/src/pages/Games.tsx` és `source/client/src/components/HomePracticeGames.tsx` (szezonális kártya),
`source/tests/admin-route-guard.test.ts` (`PUBLIC_ENDPOINTS`), `source/server/player/account-store.ts` (adatletöltés — 5. E19),
`render.yaml` (flag, csak az S6-ban).
Új tesztek: 7. szakasz.

## 4. Rögzített döntések és kényszerek

### 4.1 DÖNTÉSI PONTOK a tulajdonosnak (a javaslat elöl, ★ jelöléssel)

A terv a ★ javaslatokkal van végigírva; minden döntés egy-egy konstansban él (`shared/advent/rules.ts`), így a tulajdonos eltérő
válasza konstans-cserét vagy egy megjelölt szelet elhagyását jelenti, nem áttervezést.

**(a) Mikor nyithatók az ablakok?**
- ★ A1 — Napi nyitás: december 1–24., budapesti idő szerint naponta egy új ablak; a korábbi napok ablakai pótolhatók.
  December 25. – január 6.: minden ablak nyitva (pótlási időszak). Január 7-től a naptár lezárul (a saját összesítés megnézhető).
  November 24–30. között a kártya már látszik „Hamarosan” felirattal és visszaszámlálással (előtte nem).
  Indok: ettől adventi naptár; napi 1–2 perces szokást épít; a „végigér” december 24-re esik, amikor az ajándék is aktuális.
- A2 — Bármikor mind kinyitható (december 1-től): egy ültő helyben végigjátszható; elvész a naptár-élmény, és december 1-jén vége.
- A3 — Napi nyitás, pótlás nélkül: aki egy napot kihagy, elveszti az ablakot — a 95% két kihagyott nappal elérhetetlen; nem javasolt.

**(b) Hibás válasz kezelése**
- ★ B1 — Javítás ÚJ kérdéssel: hibás válasz után a helyes válasz és a magyarázat látszik; az ablak „javítható” lesz, és egy új, még
  nem látott, azonos tárgyú és nehézségű kérdéssel javítható — ablakonként legfeljebb 2 javítás. A 95% a végül megoldott ablakokra
  számít; az összesítés (és a szülői levél) külön mutatja, hány ablak sikerült elsőre. Indok: a gyerek a hibából tanul (nem a
  maradék három válaszból találgat), és két botlás nem veszi el végleg az ajándékot egy 24 napos játékban.
- B2 — Ugyanaz a kérdés egyszer újrapróbálható (a `retry-policy.ts` mintája): egyszerűbb, de a második próba 1 : 3 eséllyel találgatás.
- B3 — Az első válasz számít, nincs javítás: legszigorúbb; két hiba után a 95% elérhetetlen, a hátralévő napok tét nélküliek.

**(c) A záró üzenet címzettje**
- ★ C1 — Szó szerint „apukádhoz” mindenkinek: ez a tulajdonos kifejezett, szó szerinti kérése.
- C2 — A gyerek választ az összesítés előtt („apukádhoz” / „anyukádhoz” / „szüleidhez”), az alapérték „apukádhoz”: akkor érdemes,
  ha az oldalt a családon kívüli gyerekek is használják (ahol nem biztos, hogy apa adja az ajándékot).
- C3 — Tanulónként az admin állítja be: a legtöbb munka (admin-felület, új oszlop), a legkisebb haszon.

**(d) Csalás elleni védelem szintje** (korábbi tulajdonosi döntés a játékoknál: „baráti csalásvédelem”)
- ★ D1 — Szerveren tárolt előrehaladás mindenkinek, egy úton: a kérdést a szerver osztja ki, a helyes választ csak a válasz után adja
  ki, és ő számolja a 95%-ot. Párosított tanulónál a tanulóhoz, játékos-fióknál a fiókhoz, névtelennél az eszköz véletlen
  azonosítójához kötve. Indok: az előrehaladás 24 napig megmarad és követi a tanulót eszközváltáskor; a záró képernyő nem
  állítható elő a böngésző tárolójának átírásával; a szülői levél (e) hiteles. Ára: egy kis új tábla és migráció.
  Tudatosan NEM véd: a gyerek megkérdezhet mást, vagy új névtelen eszközzel újrakezdheti — ez a „baráti” szint.
- D2 — Csak helyi tárolás (`localStorage`), szerver nélkül: nincs migráció, de böngészőváltáskor elvész, a záró üzenet
  kicsalható, és szülői levél nem küldhető hitelesen.
- D3 — Vegyes: párosított tanulónak szerver, névtelennek helyi: két kódút, kétszeres tesztelés.

**(e) Szülői e-mail az eredményről**
- ★ E1 — Igen, EGY levél, amikor a tanuló végigért (mind a 24 ablakra válaszolt), a meglévő admin-címlistára (`ADMIN_EMAILS`),
  csak azonosított tanulónál (párosított tanuló vagy tanulóhoz kötött játékos-fiók). Tartalom: keresztnév, évfolyam, megoldott
  ablakok / 24, elsőre jó / 24, tárgyankénti bontás, elérte-e a 95%-ot. Indok: apa a levélből tudja, hogy a gyerek tényleg
  megcsinálta, mielőtt a telefont elé tartják; névtelen látogató nem tud levelet küldetni az adminoknak.
- E2 — Nincs levél: a képernyő felmutatása a bizonyíték.
- E3 — Napi levél minden kinyitott ablakról: 24 nap × 3 címzett × tanulónként — zaj.

**(f) Látvány**
- ★ F1 — 2D, CSS / SVG: havas falu 24 ablakkal, a megoldott ablak kivilágosodik; hóesés legfeljebb 24, csak `transform` /
  `opacity` animációjú elemmel; rövid, szintetizált csengőhang (`audioEngine.ts`); three.js nincs. Indok: a tulajdonos most jelezte,
  hogy két 3D-s játék telefonon akadozik; ennek a játéknak nincs szüksége képkocka-hurokra.
- F2 — 3D jelenet (three.js): látványosabb, de telefonon a már jelzett akadozás kockázata, és többszörös munka.

**(g) XP / ranglista**
- ★ G1 — Nem számít bele sem a felhő-ranglistába, sem a helyi XP-be. Indok: mindenki a saját évfolyamán játszik, nem verseny; a
  felhő-ranglista Google-belépést és listán szereplő címet kér; a jutalom itt az ajándék.
- G2 — Helyi XP és egy „Adventi naptár” jelvény (`client/src/lib/achievements.ts`): külön, kis szelet (S7a).
- G3 — Felhő-ranglista: katalógus-sor és pontbeküldés kell; sebességre jutalmazna — nem javasolt.

**(h) 1–2. évfolyam** (felmérésből adódó pótkérdés: a közös bank a 3. évfolyamtól indul)
- ★ H1 — Az 1–2. évfolyamos tanuló barátságos üzenetet kap („A naptár a 3. osztálytól játszható”), és a tulajdonos megmondja, van-e
  ilyen tanuló; ha van, a H3 külön szeletben készül. Indok: a 3. évfolyam kérdéseivel a 95% egy elsősnek nem reális, az nem „a maga
  tudásszintje”.
- H2 — Az 1–2. évfolyamos a 3. évfolyam könnyű kérdéseit kapja: azonnal működik, de túl nehéz lehet.
- H3 — Saját, kis 1–2. évfolyamos kérdéskészlet (évfolyamonként legalább 72 tétel): tartalomgyártás, külön szelet (S7b).

### 4.2 Rögzített szabályok (a ★ javaslatokkal)

**R1 — A 95% pontos szabálya.** `adventPassed = (megválaszolt ablakok === 24) && (megoldott ablakok × 100 ≥ 95 × 24)`. Egész
számokkal, kerekítés nélkül. 24 ablaknál a pontosan 95% nem állhat elő: 23 / 24 = 95,83% (megfelel), 22 / 24 = 91,67% (nem). Tehát:
**legalább 23 megoldott ablak a 24-ből, és mind a 24 ablakra érkezett válasz.** „Megoldott” az ablak, ha bármelyik (első vagy
javító) kérdésére jó válasz érkezett. Határesetek: 23 megoldott + 1 végleg hibás → megfelel; 23 megoldott + 1 ki nem nyitott →
még nem (nem ért végig); 22 megoldott + 2 javítható → még nem, a játék a javítást ajánlja; 24 / 24 → megfelel.

**R2 — Záró üzenet.** `adventPassed` esetén szó szerint: `Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.`
(`ADVENT_GIFT_MESSAGE` konstans; őr-teszt karakterre ellenőrzi). Alatta: az eredmény („23 / 24 ablak — 96%”), az elsőre jók
száma, a dátum és a tanuló keresztneve (ha ismert) — hogy apa lássa, kié és mikori.

**R3 — 95% alatt.** Ha van javítható ablak: „Szép munka! {megoldott} ablak már világít a 24-ből. Még {javítható} ablak javításra
vár — javítsd ki, és a végén meglepetés vár!” + „Javítom” gomb (az első javítható ablakra visz). Ha végigért, nincs több javítás, és
nem érte el: „Végigcsináltad — ez nagy dolog! Kérj egy új naptárat, és próbáld meg újra: most már többet tudsz.” + „Új naptárat
kérek” gomb (új kör új kérdésekkel; a 3–12. évfolyamon legfeljebb 3 kör). A 3. kör után: „Idén rengeteget gyakoroltál — büszke
lehetsz magadra! Mutasd meg a szüleidnek, mennyit dolgoztál.” Hibáztató szöveg, visszaszámláló nyomás, kudarchang nincs.

**R4 — Kérdéskiosztás (determinisztikus, tanulónként).** A seed: `seedFrom("advent", évad, kör, alany-kulcs, évfolyam)`.
A kiosztás tiszta függvény (`shared/advent/assignment.ts`), a szerver az első íráskor kiszámolja és a tanuló sorába MENTI (`plan`),
így a bank későbbi változása nem cseréli ki a már kiosztott kérdéseket.
- Tárgyak: az 5 tárgy seedelt sorrendje körbe-körbe a 24 ablakra (tárgyanként 4–5 ablak).
- Nehézség: 1–8. ablak könnyű (`tier` 1), 9–16. közepes (2), 17–24. nehéz (3) — karácsony felé nehezedik.
- Ablakonként 3 kérdés (1 fő + 2 javító) ugyanabból a (tárgy, szint) cellából, visszatevés nélkül; egy körben egy cellából
  legfeljebb 2 ablak × 3 = 6 kérdés fogy, 3 kör = 18 ≤ a legkisebb cella (18).
- Ismétlés nincs: a tanuló egy évadban (minden körét együtt nézve) ugyanazt az azonosítót vagy normalizált promptot nem kapja kétszer.
- A válaszlehetőségek sorrendje kérdésenként seedelten kevert (testvérek ne a „B”-t mondják be egymásnak).
- Újranyitáskor ugyanaz a tanuló ugyanazt a kérdést látja (a mentett `plan`-ból); két tanuló (más alany-kulcs) más kiosztást kap.
- Az ablakok helye a falu képén tanulónként seedelten kevert (mint a valódi naptáron), de az ablak SZÁMA a nap.

**R5 — Idő.** Az „aktuális nap” a SZERVER órájából, `Europe/Budapest` szerint számolt naptári nap; a kliens órája nem számít.
Az n. ablak akkor nyitható, ha a budapesti dátum ≥ december n. (éjfélkor nyílik; decemberben nincs óraátállítás, CET = UTC+1).
Évad = a budapesti dátum éve, ha a hónap november vagy december; januárban az előző év. Fázisok: `before` (november 24.
előtt: a játék nem látszik), `teaser` (november 24–30.), `open` (december 1–24.), `catchup` (december 25. –
január 6.), `closed` (január 7-től). Az évszám nincs beégetve: jövőre a naptár magától újraindul.

**R6 — Kik játszhatnak, és honnan az évfolyam.**
1. Párosított tanuló (érvényes tanulói token) → alany `learner:<id>`, évfolyam `learners.grade`.
2. Játékos-fiók munkamenet (ha a `PLAYER_ACCOUNTS` flag be van kapcsolva): ha tanulóhoz kötött → ugyanaz a `learner:<id>` sor
   (a párosított eszköz és a fiók ugyanazt a naptárat látja); különben `player:<id>`, az évfolyamot a játékos egyszer megadja.
3. Névtelen → alany `device:<véletlen UUID>` (a böngésző `websuli.advent.device` kulcsán), az évfolyamot egyszer megadja (3–12.).
Az évfolyam az első megválaszolt kérdés után az adott évadra RÖGZÜL (a sorban tárolva): a `learners.grade` év közbeni átírása vagy
újabb választás nem cseréli ki a kérdéseket. Az admin (`users`) belépés nem játékos-azonosító; az admin az előnézetet használja (R9).

**R7 — Adatmodell.** Új tábla kell (a meglévő tárolók egyike sem alkalmas: a `learner_activity` naplósor, a
`lesson_result_emails` leckéhez kötött, a `game_scores` Google-`users`-hez és katalógushoz kötött). `advent_progress`, alanyonként
és évadonként EGY sor, a kiosztás és a válaszok JSON-ban — 24 naponta sem nő tovább (Neon-keret: tanulónként néhány kB).

| Oszlop | Típus | Megjegyzés |
|---|---|---|
| `id` | `varchar` PK, `gen_random_uuid()` | |
| `season` | `integer` NOT NULL | évad (pl. 2026) |
| `subject_kind` | `varchar(8)` NOT NULL | `learner` / `player` / `device` / `preview` |
| `subject_id` | `varchar(64)` NOT NULL | tanuló-, fiók-, eszköz- vagy admin-azonosító |
| `learner_id` | `varchar` NULL, FK `learners(id)` ON DELETE CASCADE | csak `learner` fajtánál |
| `player_id` | `varchar` NULL, FK `player_accounts(id)` ON DELETE CASCADE | csak `player` fajtánál |
| `grade` | `integer` NULL | a rögzült évfolyam (3–12) |
| `round` | `integer` NOT NULL DEFAULT 1 | 1–3 |
| `plan` | `jsonb` NOT NULL DEFAULT `'{}'` | körönként: ablak → 3 kérdésazonosító, ablak-elrendezés |
| `doors` | `jsonb` NOT NULL DEFAULT `'{}'` | körönként: ablak → próbák (`questionId`, `pick`, `correct`, `at`) |
| `finished_at` | `timestamptz` NULL | az aktuális kör mind a 24 ablakára érkezett válasz |
| `passed_at` | `timestamptz` NULL | az első `adventPassed` ideje |
| `mailed_to` | `text[]` NOT NULL DEFAULT `'{}'` | a szülői levél címzettenkénti foglalása (E1) |
| `created_at`, `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Egyedi index: `(season, subject_kind, subject_id)`. Index: `(subject_kind, updated_at)` a takarításhoz. Migráció:
`0042_advent_progress.sql` — additív, `CREATE TABLE IF NOT EXISTS`, `SET LOCAL lock_timeout = '5s'`, a kényszernevek a
Drizzle-sémáéval azonosak, visszaállítás (`DROP TABLE IF EXISTS advent_progress;`) kommentben. Ha a szám közben foglalt lesz
(párhuzamos ág), a következő szabad számot kapja.

**R8 — Szerver-végpontok** (`source/server/advent/routes.ts`, bekötés `/api/advent`; mind `Cache-Control: no-store`).

| Végpont | Feladat | Védelem |
|---|---|---|
| `GET /api/advent/status` | `{ enabled, phase, season }` — a kártya láthatóságához | nyilvános, mellékhatás nélkül |
| `GET /api/advent/state` | a naptár állapota (fázis, mai nap, nyitható ablakok, ablakonkénti állapot, összesítés, `nextOpensAt`); sort NEM hoz létre | fejlécek: `X-Learner-Token`, `X-Advent-Device`; IP-korlát 120 / perc |
| `POST /api/advent/grade` | évfolyam megadása (csak `player` / `device`, csak az első válasz előtt) | CSRF + IP-korlát |
| `POST /api/advent/doors/:day/open` | az ablak aktuális kérdése (helyes válasz NÉLKÜL); az első hívás hozza létre a sort és a kiosztást; idempotens | CSRF + IP-korlát |
| `POST /api/advent/doors/:day/answer` | `{ questionId, pick }` → `{ correct, correctIndex, explanation, door, summary }`; ugyanarra a kérdésre a második beküldés a tárolt eredményt adja | CSRF + IP-korlát; soronkénti zár (`SELECT … FOR UPDATE` tranzakcióban) |
| `POST /api/advent/round` | új kör (csak ha végigért, nem felelt meg, nincs javítható ablak, és a kör < 3) | CSRF + IP-korlát |
| `…/api/admin/advent/preview/*` | ugyanez a router az adminnak, választható dátummal (R9) | `isAuthenticatedAdmin` |

Az író kérések a tanulói tokent és az eszközazonosítót a kérés TÖRZSÉBEN viszik (mint a lecke-eredmény), URL-be egyik sem kerül.
IP-korlát íráskor: 60 kérés / 15 perc / IP. Bemenet-ellenőrzés zod-dal (`shared/advent/contract.ts`): `day` 1–24 egész, `pick`
0–3, `grade` 3–12, eszközazonosító UUID-alak. A naplóba token, eszközazonosító, név nem kerül. Az egész funkciót az
`ADVENT_CALENDAR` környezeti flag kapcsolja (alapból KI: a végpontok 404-et adnak, a `status` `{ enabled: false }`) — így minden
szelet láthatatlanul összevonható.

Miért önálló oldal, és nem „nyolcadik motoros játék”: a közös motor és őrei (`GameId`, `game-mobile-complete`,
`coupon-expired-all-games`, `forceState` kampó) valós idejű, szünettel és eredményképernyővel rendelkező játékot feltételeznek; a
naptár napokon átívelő, szerver-állapotú kirakó. A `games_catalog` sorra sincs szükség (az csak a `game_scores` /
`game_quiz_items` idegen kulcsa miatt kell). A közös mérő SEGÉDEIT viszont használja (7. szakasz).

**R9 — Admin előnézet és teszt.** Az admin a `/games/adventi-naptar?elonezet=2026-12-10` címen bármelyik napot kipróbálhatja: a
kliens ilyenkor a `/api/admin/advent/preview` alá hív (`?date=` paraméterrel), az alany `preview:<admin-azonosító>`, levél nem megy,
„ELŐNÉZET” szalag látszik, és „Előnézet törlése” gombbal nullázható. Nem adminnak a paraméter hatástalan (a végpont 401 / 403).
E2E-módban (`isE2eMode()`) a szerver elfogadja az `X-Advent-Test-Now` fejlécet (ISO-idő) — élesben a fejléc hatástalan (őr-teszt).

**R10 — Megjelenés a játéklistában (szezonális).** Nem a hét játék rácsába kerül, hanem fölé, külön szezonális kártyaként
(`AdventPromoCard`) a `/games` oldalon és a főoldali gyakorló résznél: `teaser` fázisban „Hamarosan — még N nap”, `open` és
`catchup` fázisban „Ma nyílik a(z) N. ablak” / „Pótold az ablakokat”, `before` és `closed` fázisban és kikapcsolt flagnél a kártya
NEM látszik. A kártyáról egy koppintás a naptár, onnan egy koppintás a mai ablak kérdése (M8: ≤ 2 koppintás). Útvonal:
`/games/adventi-naptar`. `closed` fázisban az oldal a saját összesítést és a „Jövőre újra találkozunk” szöveget mutatja.

**R11 — Felület és akadálymentesség.**
- Elrendezés: álló nézetben 4 × 6, fekvőben 8 × 3 ablakrács, a teljes naptár egy képernyőn, oldalgörgetés nélkül 360×640-től
  (az ablak mérete a `100dvh`-ból számolt, legalább 48 × 48 képpont). Fejléc: cím, hang-kapcsoló, előrehaladás („7 / 24 világít”).
- Minden ablak valódi `<button>`, beszédes névvel: „5. ablak — nyitható”, „12. ablak — december 12-én nyílik”, „3. ablak —
  megoldva”, „9. ablak — javítható”. Az állapot nem csak szín: ikon és szöveg is jelzi. A zárt ablak `aria-disabled`, koppintásra
  megmondja, mikor nyílik.
- A kérdés akadálymentes párbeszédablakban nyílik (fókusz a kérdésre, Escape / „Bezárás” visszaadja a fókuszt az ablaknak); a négy
  válasz teljes szélességű, legalább 48 képpont magas gomb; a visszajelzés `aria-live="polite"`; a hosszú prompt görgethető a
  párbeszédablakon BELÜL. Betűméret sehol sem kisebb 12 képpontnál; a kérdés szövege legalább 16.
- Időkorlát nincs. A válasz után a helyes válasz és a magyarázat mindig látszik; a továbblépés a gyerek gombnyomására történik.
- Csökkentett mozgásnál: nincs hóesés, az ablak áttűnéssel nyílik (nincs elfordulás, rázás, villogás).
- Hang: jó válasz és ablaknyitás → rövid csengő; alapból a közös némítás állapotát követi; rezgés nincs.
- Hálózati hiba: az ablak nem „vész el”; „Nem sikerült elérni a naptárat — Újra” gomb; a válasz újraküldése idempotens.
- Dupla koppintás / két lap: a szerver soronkénti zára és a kérdésazonosító-egyezés miatt egy válasz egyszer számít.

**R12 — Teljesítmény-keret.** A naptár oldal darabja nem importál `three`-t és semmit a `game-engine/scenes/` alól (őr-teszt).
Nincs `requestAnimationFrame`-hurok. Hóesés: legfeljebb 24 elem, csak `transform` / `opacity` animáció, a párbeszédablak nyitásakor
és rejtett lapon szünetel. Az oldal saját (lusta) JS-darabja legfeljebb 60 kB tömörítve (mérve a `vite build` kimenetéből). Az első
megjelenítéshez egy `GET /api/advent/state` kell; a kérdés csak az ablak megnyitásakor töltődik.

## 5. Edge case-ek

- E1: 22 / 24 megoldott, 2 javítható → nincs ajándék-üzenet; javítás után 23 / 24 → megjelenik.
- E2: 23 megoldott, 1 ablak nincs kinyitva (pl. december 24. előtt) → nincs üzenet; a 24. megválaszolása után dől el.
- E3: mind a 24 megválaszolva, 20 megoldott, minden javítás elfogyott → „Új naptárat kérek”; a 3. kör után nincs több kör.
- E4: budapesti éjfél: 23:59:59-kor a holnapi ablak zárt, 00:00:00-kor nyitott; a nyitott lap a `nextOpensAt` után magától frissít.
- E5: a kliens órája rossz / átállított → nincs hatása (a szerver dönt).
- E6: november 23. → a kártya nem látszik, az oldal „Még nincs itt az advent” szöveget ad; november 24–30. → „Hamarosan”.
- E7: december 25. – január 6. → mind a 24 ablak nyitható; január 7-től írás nincs (409), a saját összesítés olvasható.
- E8: szilveszter: január 3-án az évad az előző év (a pótlás ugyanabba a sorba megy).
- E9: a tanuló decemberben csatlakozik (pl. 15-én) → az 1–15. ablak azonnal nyitható.
- E10: a `learners.grade` év közben változik → a rögzült évfolyam marad az évadra.
- E11: `learners.grade` 1–2 vagy 12 feletti / 3 alatti érték → (h) szerint üzenet; 12 felett 12-ként kezeli.
- E12: a tanulói token érvénytelen / visszavont → a kérés névtelenként megy tovább (eszközazonosítóval); a kliens a meglévő módon
  törli a tokent.
- E13: nincs `localStorage` (privát mód) → az eszközazonosító csak a lapmenetre él; a felület jelzi: „Ezen az eszközön nem tudjuk
  megjegyezni a naptáradat”.
- E14: a mentett `plan` egyik kérdése eltűnt a bankból → a cella következő, még nem használt kérdése lép a helyére (determinisztikusan),
  és a `plan` frissül; már megválaszolt próba nem változik.
- E15: ugyanaz a válasz kétszer érkezik (újraküldés, dupla koppintás, két lap) → egyszer számít, a második a tárolt eredményt kapja.
- E16: a kliens régi `questionId`-t küld (közben a másik lapon javítás történt) → 409 és a friss állapot.
- E17: még nem nyitható nap megválaszolása / megnyitása → 403, állapotváltozás nélkül.
- E18: tanulóhoz kötött játékos-fiók és ugyanannak a tanulónak a párosított eszköze → egy közös sor.
- E19: játékos-fiók törlése → a sor az idegen kulccsal törlődik; a fiók adatletöltése (`exportAccount`) tartalmazza a naptár-sort.
- E20: a levélküldés hibázik → a foglalás felszabadul, egy újrapróba; a játék felülete nem függ a levéltől.
- E21: kikapcsolt `ADVENT_CALENDAR` flag → minden `/api/advent/*` (a `status` kivételével) 404; kártya nincs; az útvonal „nem
  elérhető” üzenetet ad.
- E22: fekvő telefon (844×390) → 8 × 3 rács, a párbeszédablak a magasságba belefér, belül görgethető.
- E23: névtelen tömeges sor-létrehozás → IP-korlát; a `device` sorok 60 nap tétlenség után törlődnek (takarító).
- E24: `plan` / `doors` JSON sérült → a szerver 500 helyett új, üres kört NEM indít magától: hibát naplóz, a felület „Újra” állapotot ad.

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->

Játékmenet és szabályok:
- [ ] A1 WHEN a naptár megnyílik THEN the system SHALL pontosan 24 számozott ablakot mutatni, ablakonként egy állapottal
  (zárt / nyitható / megoldott / javítható / hibás).
- [ ] A2 WHEN a tanuló kinyit egy nyitható ablakot THEN the system SHALL egy négy válaszlehetőséges kérdést mutatni a tanuló
  rögzült évfolyamának közös bankjából, a helyes válasz elárulása nélkül.
- [ ] A3 WHEN ugyanaz a tanuló újra megnyitja ugyanazt az ablakot THEN the system SHALL ugyanazt a kérdést ugyanabban a
  válaszsorrendben mutatni.
- [ ] A4 WHEN egy tanuló egy évad összes körét végigjátssza THEN the system SHALL nem adni kétszer azonos azonosítójú vagy
  azonos normalizált promptú kérdést.
- [ ] A5 WHEN két különböző alany azonos évfolyamon játszik THEN the system SHALL eltérő kiosztást adni (a 24 fő kérdés
  listája nem azonos).
- [ ] A6 WHEN a tanuló válaszol THEN the system SHALL megmutatni, hogy jó-e, a helyes választ és a magyarázatot, és a
  továbblépést a tanuló gombnyomására bízni.
- [ ] A7 WHEN a válasz hibás és az ablaknak van még javítása THEN the system SHALL az ablakot javíthatónak jelölni, és a
  javításhoz új, még nem látott, azonos tárgyú és szintű kérdést adni (ablakonként legfeljebb 2 javítás).
- [ ] A8 WHEN mind a 24 ablakra érkezett válasz és a megoldott ablakok száma legalább 23 THEN the system SHALL szó szerint ezt
  kiírni: „Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.”
- [ ] A9 WHEN a megoldott ablakok száma 22 vagy kevesebb, vagy nem mind a 24 ablak megválaszolt THEN the system SHALL nem
  kiírni az ajándék-üzenetet, hanem bátorító szöveget és a javítás lehetőségét (R3) mutatni.
- [ ] A10 WHEN a tanuló végigért, nem felelt meg és nincs javítható ablaka THEN the system SHALL új kört felajánlani új
  kérdésekkel, legfeljebb a 3. körig.
- [ ] A11 WHEN az összesítés megjelenik THEN the system SHALL mutatni a megoldott ablakok számát, a százalékot és az elsőre
  jó válaszok számát.

Idő és szezon:
- [ ] A12 WHEN a budapesti dátum december n. (1 ≤ n ≤ 24) THEN the system SHALL az 1…n. ablakot nyithatónak, az n+1…24.
  ablakot zártnak mutatni, a zárt ablakon a nyitás napjával.
- [ ] A13 WHEN a budapesti idő eléri a 00:00:00-t THEN the system SHALL az aznapi ablakot nyithatóvá tenni, a kliens órájától
  függetlenül.
- [ ] A14 WHEN a budapesti dátum december 25. és január 6. közé esik THEN the system SHALL mind a 24 ablakot nyithatónak
  mutatni; WHEN január 7. vagy későbbi THEN the system SHALL az írást elutasítani és a saját összesítést mutatni.
- [ ] A15 WHEN a fázis `before` vagy `closed`, vagy a flag ki van kapcsolva THEN the system SHALL nem mutatni a szezonális
  kártyát a játéklistán és a főoldalon; WHEN `teaser` THEN the system SHALL „Hamarosan” kártyát mutatni visszaszámlálással.
- [ ] A16 WHEN az admin a `?elonezet=ÉÉÉÉ-HH-NN` címet nyitja THEN the system SHALL a megadott nap szerinti naptárat mutatni
  „ELŐNÉZET” jelöléssel, levélküldés nélkül; WHEN nem admin teszi THEN the system SHALL a valódi dátumot használni.

Azonosítás, adat, biztonság:
- [ ] A17 WHEN párosított tanuló játszik THEN the system SHALL a `learners.grade` évfolyamot használni és az előrehaladást a
  tanulóhoz kötve tárolni, eszköztől függetlenül.
- [ ] A18 WHEN névtelen látogató vagy tanulóhoz nem kötött játékos játszik THEN the system SHALL egyszer évfolyamot kérni
  (3–12.), és azt az első válasz után az évadra rögzíteni.
- [ ] A19 WHEN bármely író kérés CSRF-token nélkül érkezik THEN the system SHALL 403-mal elutasítani, állapotváltozás nélkül.
- [ ] A20 WHEN ugyanarra a kérdésre második válasz érkezik THEN the system SHALL az első eredményt visszaadni, és az
  összesítést nem változtatni.
- [ ] A21 WHEN a kérdés a kliensnek megy THEN the system SHALL nem küldeni a helyes válasz indexét és a magyarázatot a
  válasz előtt.
- [ ] A22 WHEN a szerver naplóz THEN the system SHALL nem írni a naplóba tanulói tokent, eszközazonosítót vagy nevet; a
  token és az eszközazonosító URL-ben nem szerepel.
- [ ] A23 WHEN az `ADVENT_CALENDAR` flag ki van kapcsolva THEN the system SHALL a `/api/advent/*` végpontokra (a `status`
  kivételével) 404-et adni.
- [ ] A24 WHEN a migráció kétszer fut THEN the system SHALL hiba nélkül, változatlan sémával végezni, és a séma a
  Drizzle-definícióval egyezni.

Szülői levél (E1 — ha a tulajdonos kéri):
- [ ] A25 WHEN egy azonosított tanuló mind a 24 ablakra választ adott THEN the system SHALL címzettenként pontosan egy levelet
  küldeni az `ADMIN_EMAILS` listára az eredménnyel; WHEN névtelen vagy előnézet THEN the system SHALL nem küldeni.

Mobil, akadálymentesség, teljesítmény:
- [ ] A26 WHEN a naptár 360×640, 390×844 vagy 844×390 nézetben fut (naptár, kérdés, visszajelzés, összesítés állapotban)
  THEN the system SHALL nem mutatni oldalgörgetést (M1), 48×48-nál kisebb kattintható elemet (M2), 12 képpontnál kisebb
  betűt (M3), egymást fedő válaszgombot, és a fejlécet a biztonsági sávon belül tartani (M4).
- [ ] A27 WHEN a tanuló érintéssel vagy egérrel játszik THEN the system SHALL mindkettővel végigjátszható lenni (M5); WHEN a
  lap háttérbe kerül és visszatér THEN the system SHALL az állapotot megtartani és a hóesést közben szüneteltetni (M6).
- [ ] A28 WHEN a játékos a játéklistáról indul THEN the system SHALL legfeljebb két érintéssel a mai kérdéshez juttatni (M8);
  WHEN a tanuló végigért THEN the system SHALL az összesítő képernyőt mutatni (M7).
- [ ] A29 WHEN csökkentett mozgás van beállítva THEN the system SHALL hóesés, elfordulás, rázás és villogás nélkül futni (M9).
- [ ] A30 WHEN a naptár csak billentyűzettel használt THEN the system SHALL minden ablakot és választ elérhetővé tenni,
  a párbeszédablak fókuszát kezelni, és a visszajelzést képernyőolvasónak bejelenteni.
- [ ] A31 WHEN a naptár oldal darabja elkészül THEN the system SHALL nem tartalmazni `three` importot, és a saját lusta
  darabja legfeljebb 60 kB tömörítve.
- [ ] A32 WHEN a naptár fut a mobil profilban THEN the system SHALL konzolhiba nélkül futni.

## 7. Tesztterv

Egységtesztek (`source/tests/*.test.ts`, `npm test`):
- `advent-calendar.test.ts` — R5: budapesti nap és fázis mockolt órával: november 23 / 24 / 30., december 1. 00:00:00 és
  november 30. 23:59:59 (UTC-ben megadva), december 24 / 25., január 6 / 7., évad januárban, több évre (2026–2030).
- `advent-rules.test.ts` — R1: `adventPassed` teljes táblája (0–24 megoldott × megválaszolt 23 / 24); a 23 / 24 határ; R2: az
  üzenet karakterre egyezik; R3: a szövegválasztás ágai.
- `advent-assignment.test.ts` — R4: determinizmus (azonos seed → azonos terv), eltérő alany → eltérő terv, tárgy- és
  szinteloszlás, nincs ismétlés 3 körön át mind a 10 évfolyamon (a valódi bankkal), opciókeverés visszafejthető, E14 pótlás.
- `advent-contract.test.ts` — zod-sémák határértékei; a kérdés-válasz alakban nincs `correctIndex`.
- `advent-source-guard.test.ts` — A31: a `client/src/pages/AdventCalendar.tsx` és a `client/src/advent/` fájljai nem importálnak
  `three`-t / `scenes`-t; A22: a szerver-modulban nincs token / eszközazonosító naplózás; R9: a teszt-óra fejléc csak `isE2eMode()` ágban.
- `admin-route-guard.test.ts` — az új nyilvános végpontok indoklással a `PUBLIC_ENDPOINTS`-ban; az előnézet admin-őr mögött.

DB-integrációs (`source/tests/advent-db.integration.ts`, eldobható Postgres, `npm run test:learning-db` futtatója mintájára):
- a migráció kétszeri futása és a séma egyezése (A24); egyedi kulcs; idegen kulcs törlési lánc (tanuló, játékos-fiók);
- teljes út a routeren át: állapot → évfolyam → megnyitás → válasz → javítás → összesítés; kétszeri válasz (A20); két egyidejű
  válasz (soronkénti zár); CSRF nélkül 403 (A19); zárt nap 403 (E17); flag KI → 404 (A23); levél-foglalás (A25, hamis küldővel);
  takarító (E23).

Böngészős (Playwright, `source/tests/advent-calendar.spec.ts`, 390×844 érintős profil, valódi `tap()`, `X-Advent-Test-Now`):
- december 5.: kártya a `/games`-en → koppintás → naptár → az 5. ablak → kérdés → jó válasz (`data-correct` a teszt-kampós
  buildben) → az ablak világít; újratöltés után megmarad;
- hibás válasz → javítható → új kérdés (más prompt) → megoldva;
- dátumhatár: `23:59:59` → a holnapi ablak zárt; `00:00:00` → nyitott;
- végigjátszás 24 / 24 és 23 / 24 → a szó szerinti üzenet; 22 / 24 → bátorító szöveg, nincs ajándék-üzenet;
- január 7. → lezárt nézet; november 29. → „Hamarosan”; november 23. → nincs kártya;
- admin előnézet belépve / kilépve (A16).

Mobil mérés (`source/tests/advent-calendar-mobile.spec.ts`, a közös mérő segédeivel, `MOBILE_VIEWPORTS` mindhárom nézetén, a
naptár / kérdés / visszajelzés / összesítés állapotban): M1, M2, M3, M4, M5 (egér és érintés), M6 (háttér → vissza), M7, M8, M9,
konzolhiba (A32); képernyőkép állapotonként a `testInfo.outputPath()` alá. Megfeleltetés a közös M-pontokhoz: M5-nél a naptárnak
nincs külön érintővezérlője (a gombok mindkét mutatóval működnek), M6-nál nincs futó óra (a mérce: az állapot megmarad, a hóesés áll).

Kézi, valós eszközön (a tulajdonos telefonján, az S4 után): görgetés-mentesség, olvashatóság, hang.

## 8. Kockázatok / visszavonási terv

| Kockázat | Kezelés |
|---|---|
| Határidő: december 1-ig 13 nap, 6 szelet | A pótolhatóság miatt a késés nem végzetes (a korábbi ablakok nyithatók); az S1–S4 a minimum, az S5–S6 utána is mehet. |
| Neon-keret / tömeges névtelen sor | Alanyonként egy kis sor; IP-korlát; a `device` sorok takarítása 60 nap után. |
| A bank változik advent közben | A kiosztás a sorban mentve (`plan`); E14 pótlás. |
| A 95% túl szigorú / túl laza a javítással | (b) tulajdonosi döntés; a szabály egy konstans; az összesítés az elsőre jókat is mutatja. |
| „apukádhoz” nem minden gyereknek illik | (c) tulajdonosi döntés; C2 kis szeletként pótolható. |
| Időzóna-hiba az éjféli határon | Egy tiszta függvény, UTC-ben megadott határtesztekkel; a szerver dönt. |
| Párhuzamos ág elviszi a 0042-es migrációszámot | A szelet indulásakor ellenőrzés, szükség esetén a következő szabad szám. |
| A szerver-bundle a kliens bankját importálja | Már működő minta (`question-provider.ts`), a `SERVER_GRADE_BANK`-ot használjuk újra. |
| Közös fájlok ütközése (`routes.ts`, `App.tsx`, `Games.tsx`) más futó ágakkal | Szeletenként egy-egy rövid, additív módosítás; rebase a push előtt. |

Visszavonás: `ADVENT_CALENDAR=off` (azonnali, telepítés nélkül a Render környezeti változóval) → a kártya eltűnik, a végpontok
404-et adnak, a tábla érintetlen marad. Végleges elvetésnél a szeletek revertje és a `DROP TABLE IF EXISTS advent_progress;`.

## 9. Szeletelés

Minden szelet önállóan összevonható (a flag alapból KI), ~400 soros PR; a `[D:x]` a döntési ponttól függő részt jelöli.

| Szelet | Tartalom | Függ |
|---|---|---|
| S1 | Tiszta mag: `shared/advent/calendar.ts`, `rules.ts`, `assignment.ts`, `contract.ts` + egységtesztek. A döntések konstansai itt élnek `[D:a]` `[D:b]` `[D:c]` `[D:h]`. | — |
| S2a | Adatmodell: migráció `0042`, Drizzle-séma, `server/advent/store.ts` (soronkénti zárral) + DB-integrációs teszt. `[D:d]` — D2 esetén ez a szelet és az S2b elmarad, az S3 helyi tárolóra épül. | S1 |
| S2b | Szerver: `identity.ts`, `routes.ts`, flag, IP-korlát, bekötés a `routes.ts`-be, `PUBLIC_ENDPOINTS`, játékos-adatletöltés (E19) + integrációs tesztek. `[D:d]` | S2a |
| S3a | Kliens 1: útvonal, `useAdvent`, falu-rács, ablak, kérdés-párbeszédablak, visszajelzés, évfolyamválasztó; böngészős alapút. `[D:f]` | S2b |
| S3b | Kliens 2: összesítés a szó szerinti üzenettel, javítás, új kör, hóesés, hang, csökkentett mozgás; böngészős 24 / 24, 23 / 24, 22 / 24. `[D:b]` `[D:c]` | S3a |
| S4 | Szezonális kártya a `/games`-en és a főoldalon, `teaser` / `closed` nézet, mobil mérés (M1–M9) három nézeten, dátumhatár-böngészőtesztek. `[D:a]` | S3b |
| S5 | Szülői levél: `server/advent/result-email.ts`, foglalás a `mailed_to` oszlopon, integrációs teszt. `[D:e]` — E2 esetén elmarad. | S2b |
| S6 | Admin előnézet (`/api/admin/advent/preview`), takarító, `render.yaml` flag, a funkció átfogó reviewja (PR-kommentként), retro, bekapcsolás. | S4 |
| S7a | (csak G2 esetén) helyi XP és jelvény. `[D:g]` | S3b |
| S7b | (csak H3 esetén) 1–2. évfolyamos kérdéskészlet és bekötése. `[D:h]` | S1 |
| S7c | (csak C2 esetén) címzett-választó. `[D:c]` | S3b |

## 10. UNVERIFIED / UNKNOWN

- UNKNOWN: van-e 1–2. évfolyamos tanuló a `learners` táblában (éles adat, nem néztem) — a (h) döntéshez kell.
- UNKNOWN: éles környezetben be van-e kapcsolva a `PLAYER_ACCOUNTS` flag (a kódban alapból KI).
- UNVERIFIED: a 60 kB-os darabméret-keret reális-e — az S3a végén a `vite build` kimenetéből mérendő; a repóban nem találtam
  meglévő, darabméretre vonatkozó kaput.
- UNVERIFIED: a `csrf-sync` munkamenet nélküli (első látogatású) névtelen látogatónál ad-e tokent — a vendég lecke-eredmény
  ugyanezen az úton megy, de a naptárra az S2b integrációs tesztje bizonyítja.
- UNVERIFIED: a Radix `Dialog` (a repó függősége) megfelel-e az M2 / M3 mérőnek mobil nézetben — az S3a böngészőtesztje méri.
- UNVERIFIED: az `exportAccount` (`server/player/account-store.ts:253`) bővítésének pontos alakja — az S2b első lépése olvassa ki.
- Nem ellenőrzött: a tulajdonos telefonján a hóesés folyamatossága — az S4 utáni kézi próba.

## 11. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`
