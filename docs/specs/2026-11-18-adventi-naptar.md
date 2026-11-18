# Spec: Adventi naptár — „Fénylő ablakok” (új, szezonális játék)

> Dátum: 2026-11-18 · Szerző: Claude (tervező alügynök) · Állapot: JÓVÁHAGYVA — tulajdonosi döntések 2026-11-18 (12. szakasz; ahol a 12. szakasz eltér a korábbi szövegtől, a 12. szakasz érvényes)
> Szabály: 3+ fájlt érintő feladat csak spec + AI-olvasható végrehajtási utasítás után indul (`docs/agent-haromfazisu-munka.md`).
> Végrehajtás: `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`. A 3. fázis a döntések után, 2026-11-18-án indult (S1).

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

> **FELÜLÍRVA / KIEGÉSZÍTVE:** az „új kérdésbank nem cél” pont érvényét vesztette (12.2); a `Games.tsx` / `HomePracticeGames.tsx` érintetlen marad (14.).

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

> **FELÜLÍRVA / KIEGÉSZÍTVE:** a fájllista a 12–16. szakasz szerint változott (útvonal `/adventi-naptar`, főoldali kártya, karácsonyi készlet, képcsomag).

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

> **FELÜLÍRVA / KIEGÉSZÍTVE:** a döntések megszülettek — lásd 12.1, 13., 14., 15., 16.; az alábbi opciólista történeti.

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

> **FELÜLÍRVA / KIEGÉSZÍTVE:** R3 szövegei: 16.2; R4: 12.3; R6 évfolyam 1–12: 12.3; R8 korlátok: 16.1; R9 útvonal és előnézet: 14.1, 16.5; R10: 14.

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

> **FELÜLÍRVA / KIEGÉSZÍTVE:** az érvényes szelet-tábla a 12.7, kiegészítve: S3c-0 / S3c (13.7), S4 (14.).

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

## 12. Tulajdonosi döntések és kiegészítés (2026-11-18)

### 12.1 A döntések (kérdőíven, szó szerint a választott opciók)

| Pont | Döntés |
|---|---|
| (a) | „Naponta egy, pótolható” = A1 |
| (b) | „Új kérdéssel javíthat” = B1 |
| (c) | nem kérdezett — a javaslat érvényes: C1, szó szerint „apukádhoz” |
| (d) | nem kérdezett — a javaslat érvényes: D1, szerveren tárolt előrehaladás |
| (e) | „Igen, egy levél a végén” = E1 |
| (f) | nem kérdezett — a javaslat érvényes: F1, 2D |
| (g) | nem kérdezett — a javaslat érvényes: G1, nincs XP / ranglista |
| (h) | szabad szöveg: „Kis saját kérdéskészlet a karácsony ünnepével kapcsolatosan, a karácsony hagyományával kapcsolatos, nem nehéz kérdésekkel ez minden évfolyamra vonatkozzon. Mindegyik tanuló kapja meg az értesítést, hogy elkészült.” Pontosítás: „Vegyesen” — minden évfolyamon kb. minden harmadik ablak (8 a 24-ből) könnyű karácsonyi kérdés, a többi a tanuló saját szintjén a meglévő bankból; az 1–2. osztályosok mind a 24-et a karácsonyi készletből kapják. Értesítés: „Az oldalon és e-mailben”. |

Következmény: a 4.1 (h) H1 javaslata és a 2. szakasz „új kérdésbank nem cél” pontja ÉRVÉNYÉT VESZTI; az S7b helyett az S1b
(karácsonyi készlet) kötelező szelet; az S7a és S7c nem készül. Új szelet: S8 (értesítés).

### 12.2 R13 — Karácsonyi kérdéskészlet (1–12. évfolyam)

- Hely: `source/shared/advent/christmasBank/` — tiszta adat, a szerver és a tesztek importálják; a kliens-csomagba nem kerül
  (a kérdést a szerver adja).
- Alak: `ChristmasItem = { id: "xmas-NNN"; minGrade; maxGrade; prompt; options (4 különböző); correctIndex; explanation }`.
  Egy tétel egy évfolyam-SÁVRA érvényes (`minGrade`–`maxGrade`), így a könnyű tételek több évfolyamot is kiszolgálnak.
- Tartalom: KÉZZEL írt magyar kérdések a karácsonyról és a magyar karácsonyi hagyományokról (advent, adventi koszorú, Mikulás,
  Luca-nap, betlehemezés, karácsonyfa, szaloncukor, bejgli, halászlé, mézeskalács, karácsonyi dalok, szenteste, vízkereszt, téli
  ünnepkör). Fizetős AI-gyártás NEM indul. Nem nehéz; az 1–2. évfolyamon rövid (legfeljebb 80 karakteres) kérdés és rövid válaszok.
- Minőségi szabályok: tényszerűen helyes; egyetlen egyértelmű jó válasz (családonként vagy vidékenként eltérő szokásra — például
  ki hozza az ajándékot, mi a karácsonyi vacsora — NEM kérdezünk úgy, mintha egy válasz lenne helyes; ilyenkor a kérdés a hagyomány
  nevére, dátumára, tárgyára vonatkozik); vallási szempontból tapintatos (a vallási eredetet „a keresztény hagyomány szerint”
  megfogalmazással, tényként említi, hitbeli állítást nem kér számon, más vallást és a nem vallásos családot nem minősíti);
  márkanév nincs; a magyarázat 30–300 karakter.
- Mennyiség (validátor kényszeríti; évfolyamonként az ÉRVÉNYES tételek száma): 1–2. évfolyam ≥ 144 (24 ablak × 3 kérdés × 2 kör; FELÜLÍRVA 2026-11-18: korábban 96 — lásd 16.4),
  3–12. évfolyam ≥ 72 (8 ablak × 3 kérdés × 3 kör). Azonosító és normalizált prompt a teljes készletben egyedi, és a közös
  évfolyam-bank egyetlen promptjával sem egyezik.
- Ellenőrzés: gépi validátor (egységteszt) + a független ellenőr tételenkénti TÉNYELLENŐRZÉSE a PR előtt.

### 12.3 R4 kiegészítése — vegyes kiosztás

- 3–12. évfolyam: a karácsonyi ablakok a 3-mal osztható napok: **3, 6, 9, 12, 15, 18, 21, 24** (8 ablak; a 24. mindig karácsonyi).
  A többi 16 ablak a tanuló évfolyamának közös bankjából jön: a tárgyak a 16 ablakon járnak körbe (seedelt sorrend), a szint a nap
  szerint (1–8. könnyű, 9–16. közepes, 17–24. nehéz) — cellánként legfeljebb 2 ablak, az R4 kapacitás-számítása változatlanul áll.
- 1–2. évfolyam: mind a 24 ablak karácsonyi; ablakonként 2 javítás (3 kérdés), legfeljebb 2 kör (FELÜLÍRVA 2026-11-18: korábban 1 javítás — lásd 16.4).
- A karácsonyi ablak kérdései az évfolyamra érvényes tételekből, seedelten, visszatevés nélkül (körökön át sem ismétlődik).
- A felületen a karácsonyi ablak tárgya „Karácsony”; a szülői levél tárgyankénti bontásában külön sor.
- A 95% szabálya (R1) változatlan: a karácsonyi és a bank-ablak ugyanannyit ér.
- R6 módosul: az évfolyam érvényes tartománya 1–12 (a névtelen évfolyamválasztó is 1–12.); az E11 „üzenet” ága és a
  `unavailable: "low-grade"` válasz megszűnik (12 feletti érték 12, 1 alatti 1).

### 12.4 R14 — Értesítés: „Az oldalon és e-mailben”

**Az oldalon:** az R10 szezonális kártyája mindenkinek látszik a főoldalon és a játéklistán (S4) — ez az oldali értesítés.

**E-mailben — címzett-források felmérése (kódból, 2026-11-18):**

| Tábla | Cím | Hozzájárulás a kódban | Javaslat |
|---|---|---|---|
| `email_subscriptions` | `email` | a látogató maga iratkozott fel; `is_subscribed` kapcsoló | IGEN (`is_subscribed = true`) |
| `extra_email_addresses` | `email` | az admin vette fel (`added_by`), `is_active`; a nevesített tanulói címek (`student_name`, `learner_id`) ma is kapnak napi emlékeztetőt és új-lecke értesítőt | IGEN (`is_active = true`) |
| `player_accounts` | `email` | a játékos a belépéshez adta meg; hírlevél-hozzájárulás oszlop NINCS | csak ellenőrzött (`email_verified_at`), nem tiltott fiók — és CSAK a tulajdonos külön igenjével (12.6) |
| `users` | `email` | admin / Google-belépés; hozzájárulás nincs | NEM |
| `learners` | nincs cím | a tanuló címe az `extra_email_addresses` sorban él | — |

Szabályok: a címek kisbetűsítve, ismétlődés nélkül; a levél szövege és a címzettek SZÁMA a tulajdonos elé kerül, és valódi levél
CSAK az ő külön jóváhagyása után megy ki — ügynök valódi levelet nem küld. Megvalósítás: admin-végpont
`POST /api/admin/advent/announce` (`isAuthenticatedAdmin`, CSRF) két móddal: `{ dryRun: true }` → `{ recipients, bySource, subject,
html }` küldés nélkül (cím a válaszban nincs); `{ dryRun: false, confirmCount }` → csak akkor küld, ha a `confirmCount` egyezik az
aktuális címzettszámmal; címzettenként egyszer (foglalás az új `advent_announcements` táblában: `season` + cím-lenyomat egyedi
kulcs — a cím maga nem tárolódik), szolgáltatói idempotencia-kulccsal, kötegelve. Az admin-felületen „Adventi értesítő” panel:
előnézet, címzettszám, „Küldés” gomb megerősítő párbeszéddel. A levél: rövid ünnepi szöveg, egy gomb a naptárra, leiratkozási
tájékoztatás; személyes adat és token nincs benne. `NODE_ENV=test` és e2e-mód alatt valódi küldés nincs.

### 12.5 Új elfogadási kritériumok

<!-- acceptance-checklist -->

- [ ] A33 WHEN a validátor a karácsonyi készleten fut THEN the system SHALL nulla hibát jelenteni: egyedi azonosító és
  normalizált prompt, 4 különböző válasz, egy helyes, 30–300 karakteres magyarázat, érvényes évfolyamsáv, és évfolyamonként
  az érvényes tételek száma 1–2. évfolyamon ≥ 144 (javítva: 16.4), 3–12. évfolyamon ≥ 72.
- [ ] A34 WHEN egy 3–12. évfolyamos tanuló naptára elkészül THEN the system SHALL pontosan a 3., 6., 9., 12., 15., 18., 21. és
  24. ablakba karácsonyi kérdést tenni, a többi 16-ba a tanuló évfolyamának közös bankjából.
- [ ] A35 WHEN egy 1–2. évfolyamos tanuló naptára elkészül THEN the system SHALL mind a 24 ablakba az évfolyamára érvényes
  karácsonyi kérdést tenni, ablakonként legfeljebb 2 javítással (javítva: 16.4) és legfeljebb 2 körrel.
- [ ] A36 WHEN egy tanuló az évad minden körét és javítását végigjátssza THEN the system SHALL karácsonyi kérdést sem
  ismételni.
- [ ] A37 WHEN az admin száraz futást kér az értesítőre THEN the system SHALL a címzettek számát, forrásonkénti bontását és a
  levél szövegét visszaadni, egyetlen levél elküldése és egyetlen cím kiadása nélkül.
- [ ] A38 WHEN az admin a küldést nem egyező `confirmCount` értékkel, vagy valaki nem adminként kéri THEN the system SHALL nem
  küldeni; WHEN egyezővel kéri THEN the system SHALL címzettenként legfeljebb egy levelet küldeni, ismételt kérésre sem többet.
- [ ] A39 WHEN az értesítő címzettlistája összeáll THEN the system SHALL csak a 12.4 tábla IGEN forrásait használni
  (a `users` táblát soha), kisbetűsítve és ismétlődés nélkül.

### 12.6 Nyitott tulajdonosi kérdés (az S8 előtt; a határidős S1–S4-et nem akasztja meg)

A regisztrált játékosok (`player_accounts`) címe belépéshez lett megadva, hírlevél-hozzájárulás nincs rögzítve. Opciók:
★ (1) az értesítő csak a feliratkozóknak és az admin által felvett címeknek megy, a játékosok az oldali kártyát látják — adatvédelmi
szempontból tiszta; (2) az ellenőrzött játékos-címeknek is megy egyszeri, szolgáltatási jellegű értesítésként, leiratkozási
tájékoztatással. A száraz futás mindkét számot megmutatja; a küldés előtt a tulajdonos dönt.

### 12.7 Szeletelés (felülírja a 9. szakasz tábláját)

| Szelet | Tartalom | Határidő |
|---|---|---|
| S1 | Tiszta mag: idő, szabályok, vegyes kiosztás (a karácsonyi tételek paraméterként), szerződés, egységtesztek | dec. 1. |
| S1b | Karácsonyi kérdéskészlet 1–12. évfolyam + validátor-teszt (tartalmi szeletek: S1b-1 az 1–4., S1b-2 az 5–12. évfolyam sávjai) | dec. 1. |
| S2a | Migráció, séma, tároló (az `advent_announcements` tábla is ebben a migrációban) | dec. 1. |
| S2b | Azonosítás, végpontok, flag | dec. 1. |
| S3a | Kliens 1: naptár, ablak, kérdés, évfolyamválasztó (1–12.) | dec. 1. |
| S3b | Kliens 2: összesítés, javítás, új kör, hó, hang | dec. 1. |
| S4 | Szezonális kártya mindenkinek (oldali értesítés), mobil mérés, dátumhatárok | dec. 1. |
| S5 | Szülői levél a végén (E1) | dec. 24. előtt |
| S6 | Admin előnézet, takarító, a flag bekapcsolása, átfogó review, retro | a flag-rész az élesítéshez kell |
| S8 | Értesítő e-mail: címzett-összeállítás, száraz futás, admin-panel, jóváhagyás utáni küldés | az élesítés után, tulajdonosi jóváhagyással |

### 12.8 UNVERIFIED (kiegészítés)

- UNKNOWN: a három címforrás éles sorainak száma (éles adatbázist nem néztem) — a száraz futás adja meg.
- UNVERIFIED: van-e a jelenlegi levelekben leiratkozó link vagy `List-Unsubscribe` fejléc (a `server/resend.ts`-ben a keresés nem
  talált ilyet) — az S8 első lépése tisztázza.
- A karácsonyi tételek tényszerűsége a független ellenőr tényellenőrzéséig NEM igazolt.

## 13. Látvány — képcsomag (tulajdonosi követelmény, 2026-11-18)

A tulajdonos szó szerint: „Maga a kinézete legyen teljesen klasszikus, szép, karácsonyi motívumokkal bőven díszített, jól elkészített
grafika, kép. Ne gagyi legyen, hanem az összes motívum: rénszarvas, szánkó, Jézuska, hó, havas fenyő, minden ilyesmi legyen benne.”
A grafika forrásáról: „Generált illusztrációk”. Ez pontosítja az (f) F1 döntést: a játék továbbra is 2D és képkocka-hurok nélküli,
de a falu, az ablakok mögötti képek és a záróképernyő GENERÁLT ILLUSZTRÁCIÓ; a hóesés, az ablakfény és a csillag felgyulladása
kódból (CSS) megy, a csökkentett mozgás tiszteletben tartásával. **A generálás FIZETŐS: előbb költségbecslés, és csak a tulajdonos
külön jóváhagyása után indul — ügynök nem indítja.**

### 13.1 A meglévő képgyártó út (felmérés a kódból)

| Kérdés | Tény |
|---|---|
| Szolgáltató / modell | OpenRouter képvégpont (`https://openrouter.ai/api/v1/images`), modell `bytedance-seed/seedream-5-0-pro` (`source/design-assets/prompts.json` `model`; `source/scripts/design-assets/generate.ts`). |
| Darabár | A kódban rögzített, 2026-10-17-én mért ár (`scripts/design-assets/lib.ts` `estimateUsd`): 2K kép 0,09 USD, 1K kép 0,045 USD, referenciakép 0,003 USD / kép. A MAI ár UNVERIFIED (nem kérdeztem le); a `--dry-run` ugyanebből a táblából számol. |
| Hogyan készül kép | `prompts.json` tételei (`id`, `kind`, `band`, `aspect_ratio`, `prompt`, `references`) + `style.md` (`COMMON`, `BAND_*`, `KIND_*` sorok) → `composePrompt` = tétel-prompt + típus + sáv + közös stílus. Futtatás: `npx tsx scripts/design-assets/generate.ts` (`--dry-run`: hívás nélkül kiírja a becsült árat és a promptokat; `--only`, `--max`, `--resolution 1K|2K`). A kulcs `OPENROUTER_API_KEY` (környezet vagy a helyi Hermes `.env`). |
| Jelöltek | `source/design-assets/candidates/<id>/<időbélyeg>.jpg` + `log.jsonl` (modell, prompt-lenyomat, becsült ár) — a mappa `.gitignore`-ban van. |
| Jóváhagyás | `scripts/design-assets/review-page.ts` válogatóoldalt készít; a kiválasztás JSON-ja → `scripts/design-assets/approve.ts` WebP-re méretez (Playwright-vásznon), a `client/public/design/<sáv>/<id>.webp` alá ír, és bejegyzi a `shared/design-asset-catalog.ts` katalógusba. |
| Tárolás ma | Statikus WebP a kliens `public` mappájában; a főoldali bélyegképeket a build készíti (`scripts/build-design-thumbs.mjs`, tartalom-hash a fájlnévben), a szerver `immutable`, 1 éves gyorsítótárral adja ki (`server/vite.ts:111`). A leckék kiválasztott díszítőelemeinek bájtjai a `design_assets` táblában élnek. |
| Korlát | A meglévő `style.md` közös stílusa a Websuli-arculat (nem karácsonyi), az `AssetBand` / `AssetKind` zárt unió, a `generate.ts` a `prompts.json`-t és a `style.md`-t beégetve olvassa, az `approve.ts` a lecke-katalógusba ír. A naptárhoz ezért SAJÁT készlet-leíró és kis, fizetős hívás nélküli bővítés kell (13.6). |

**Tárolási döntés a naptárra:** a képek NEM kerülnek az adatbázisba és NEM a lecke-katalógusba. Statikus, verziózott WebP:
`source/client/public/advent/2026/<id>.<8 jegyű tartalom-hash>.webp`, mellette egy generált `shared/advent/art-manifest.ts`
(`id` → fájlnév, szélesség, magasság, `alt`), kiszolgálás `immutable`, 1 éves gyorsítótárral (a `design-thumbs` mintája). Indok: a
készlet rögzített és mindenkinek ugyanaz (nincs mit lekérdezni); a statikus fájl CDN- és böngésző-gyorsítótárból jön, futásidőben
nincs adatbázis-hívás; a Neon-keretet nem terheli (~1 MB bájt); a tartalom-hash miatt a csere nem ragad be a gyorsítótárba.

### 13.2 Egységes stílus (a naptár saját `style.md`-je)

- `COMMON` (minden kép): eredeti, klasszikus karácsonyi illusztráció, festett, régi karácsonyi képeslapok hangulatát idéző,
  gouache / akvarell ecsetkezelés, finom papírtextúra, meleg és meghitt; gyerekbarát; NEM fotó, NEM 3D-render, NEM harsány
  rajzfilm, NEM clip-art. Paletta: mélykék téli éj, meleg arany ablak- és gyertyafény, hófehér, fenyőzöld, karácsonyi piros.
  A képen nincs szöveg, betű, szám, logó, vízjel, aláírás, márka; nincs létező mű, film- vagy mesefigura, védjegyes szereplő.
- `KIND_BACKGROUND`: nagy, nyugodt kompozíció, a kép középső sávja sötétebb és részletszegényebb (ide kerül a 24 ablak rácsa).
- `KIND_DOOR`: egyetlen, jól felismerhető motívum középen, sötétkék háttér előtt, lekerekített ablak-kivágásba illő, 96 képponton is
  felismerhető, kevés apró részlet.
- `KIND_ORNAMENT`: szimmetrikus díszítőelem átlátszó hatású, egyszínű sötétkék háttéren.
- Vallási motívumok (jászol, Jézuska, pásztorok, háromkirályok, angyal, betlehemi csillag, templom): klasszikus, szelíd, tiszteletteljes
  betlehemi ábrázolás; az arcok egyszerűek, nem karikírozottak. A Mikulás klasszikus püspöksüveges vagy piros köpenyes, márkás
  megjelenés nélkül; krampusz nincs.

### 13.3 Képlista (29 tétel)

| Azonosító | Tartalom | Képarány → végső méret | Jelölt | Felbontás | Bájtcél |
|---|---|---|---|---|---|
| `advent-bg-portrait` | Havas magyar falu éjszaka: templomtorony, zsúpfedeles és cseréptetős házak, havas fenyők, csillagos ég | 9:16 → 1080 × 1920 | 4 | 2K | ≤ 150 kB |
| `advent-bg-landscape` | Ugyanaz a falu széles nézetben | 16:9 → 1600 × 900 | 4 | 2K | ≤ 150 kB |
| `advent-door-01` … `-24` | A 13.4 motívumai | 1:1 → 256 × 256 | 3–3 | 1K | ≤ 25 kB / kép |
| `advent-closing` | Záróképernyő: kivilágított falu, felgyúlt csillag a karácsonyfán, ajándékok a fa alatt | 4:3 → 1200 × 900 | 4 | 2K | ≤ 120 kB |
| `advent-garland` | Fenyőgirland piros bogyóval és arany szalaggal (fejléc-dísz) | 16:9 → 1200 széles sáv | 3 | 1K | ≤ 25 kB |
| `advent-frame` | Sarokdísz: magyal, fenyőág, csengő | 1:1 → 256 × 256 | 3 | 1K | ≤ 15 kB |

Bájtkeret: az első megjelenítéshez egy háttér (≤ 150 kB) + a girland; az ablakképek lustán töltődnek (csak a már megoldott ablaké,
`loading="lazy"`, `decoding="async"`), a záró kép csak az összesítésnél. A teljes készlet ≤ 1,1 MB; egy átlagos napon ≤ 250 kB.

### 13.4 A 24 ablak motívuma

1 hópehely · 2 havas fenyő · 3 adventi koszorú négy gyertyával · 4 égő gyertya · 5 puttony · 6 Mikulás · 7 szánkó · 8 rénszarvas ·
9 hóember · 10 korcsolya · 11 mézeskalács · 12 dió és piros alma · 13 harang és csengők · 14 fagyöngy · 15 szaloncukor ·
16 bejgli · 17 havas templom · 18 angyal · 19 pásztorok · 20 háromkirályok · 21 betlehemi csillag · 22 ajándékdoboz ·
23 feldíszített karácsonyfa · 24 betlehemi jászol a Jézuskával és a csillaggal.
(A falu háttere a havat, a fenyőket és a templomot nagyban is hozza; a „csengő” a 13. ablakon a haranggal együtt szerepel.)

### 13.5 Prompt-tervezetek (a tétel-prompt; a generátor mögé teszi a `KIND_*` és a `COMMON` stílust)

A meglévő út promptjai angolok, az `alt` szöveg magyar — a naptár ugyanezt követi (magyar tartalom, magyar motívumok).

| Azonosító | Prompt (tervezet) |
|---|---|
| `advent-bg-portrait` | A snow-covered Hungarian village at night seen from a gentle hill: a small whitewashed church with a tall tower, cottages with snowy roofs and dark windows, snow-laden fir trees framing both sides, a winding path with sleigh tracks, a deep blue sky full of stars, soft falling snow. Tall portrait composition. |
| `advent-bg-landscape` | The same snow-covered Hungarian village at night in a wide panoramic view: church tower in the middle distance, rows of cottages with snowy roofs, fir forest on the horizon, starry deep blue sky. |
| `advent-door-01` | A single large, delicate six-pointed snowflake. |
| `advent-door-02` | A fir tree heavy with fresh snow in a quiet forest clearing. |
| `advent-door-03` | An Advent wreath of fir branches with four candles, red ribbons and pine cones. |
| `advent-door-04` | One burning candle in a brass holder with a sprig of fir. |
| `advent-door-05` | A woven wicker back-basket (puttony) filled with wrapped gifts, apples and walnuts. |
| `advent-door-06` | Saint Nicholas (Mikulás) as a kind old bishop with a white beard, red cloak and mitre, holding a staff, in falling snow. |
| `advent-door-07` | A classic wooden sledge on a snowy slope. |
| `advent-door-08` | A gentle reindeer standing in the snow with a small bell on a red collar. |
| `advent-door-09` | A cheerful snowman with a carrot nose, a red scarf and an old pot for a hat. |
| `advent-door-10` | A pair of old-fashioned ice skates hanging by their laces. |
| `advent-door-11` | Hungarian gingerbread hearts and stars decorated with white icing. |
| `advent-door-12` | Walnuts and shiny red apples in a small wooden bowl with a fir twig. |
| `advent-door-13` | A bronze church bell with two small jingle bells and a red ribbon. |
| `advent-door-14` | A bunch of mistletoe with white berries tied with a red bow. |
| `advent-door-15` | Hungarian szaloncukor: fondant sweets wrapped in shiny fringed paper, hanging on a fir branch. |
| `advent-door-16` | Slices of Hungarian bejgli, walnut and poppy seed roll, on a porcelain plate. |
| `advent-door-17` | A small snowy village church with a warmly lit window and open door. |
| `advent-door-18` | A gentle Christmas angel with soft wings holding a small bell. |
| `advent-door-19` | Shepherds in sheepskin coats with a few sheep, looking up at a bright star. |
| `advent-door-20` | The three wise men travelling at night with gifts, following a star. |
| `advent-door-21` | The bright star of Bethlehem with a long tail of light over snowy roofs. |
| `advent-door-22` | A gift box wrapped in red paper with a golden bow. |
| `advent-door-23` | A decorated Christmas tree with candles, szaloncukor, glass baubles and a star on top. |
| `advent-door-24` | A classic nativity scene: the infant Jesus in a manger with straw, Mary and Joseph beside him, an ox and a donkey, and the star shining above the stable. |
| `advent-closing` | The village on Christmas Eve, every window glowing warm gold, a large decorated Christmas tree in the square with a shining star on top and gifts beneath it, gentle snowfall. |
| `advent-garland` | A horizontal garland of fir branches with red berries, golden ribbon and small bells. |
| `advent-frame` | A corner ornament of holly leaves, a fir twig and a small golden bell. |

Egységesség: a `advent-bg-portrait` kiválasztott jelöltje stílus-referenciaként megy minden további tételhez (`references`).

### 13.6 Költségbecslés és a generálás indítása

| Tétel | Kép | Egységár (a kód 2026-10-17-i ára) | Összeg |
|---|---|---|---|
| 2 háttér + záró kép, 4–4 jelölt, 2K | 12 | 0,09 USD | 1,08 USD |
| 24 ablakkép, 3–3 jelölt, 1K | 72 | 0,045 USD | 3,24 USD |
| girland + sarokdísz, 3–3 jelölt, 1K | 6 | 0,045 USD | 0,27 USD |
| stílus-referencia (a háttér után minden képhez 1) | 86 | 0,003 USD | 0,26 USD |
| **Első kör összesen** | **90** | | **≈ 4,85 USD** |
| Pótkör a nem tetsző tételekre (becsülten a képek 30%-a) | ~27 | | ≈ 1,5 USD |
| **Becsült felső keret** | | | **≈ 6,5 USD** |

Feltételek: az ár a kódban rögzített, 2026-10-17-i érték — a mai ár UNVERIFIED; a 9:16 és a 4:3 képarány támogatása ennél a
modellnél UNVERIFIED (a meglévő készlet 1:1-et és 16:9-et használ) — a próbakör első képe dönti el, különben 16:9-ből vágunk.

A generálás indításának rendje (a 13.7 szerinti előkészítő szelet után):
1. Ingyenes száraz futás: `npx.cmd tsx scripts/design-assets/generate.ts --set advent --dry-run --max 90` — kiírja a képek számát,
   a becsült költséget és minden promptot. Ezt a kimenetet kapja meg a tulajdonos.
2. A tulajdonos KÜLÖN, kifejezett jóváhagyása a kiírt összegre.
3. Csak ezután, a koordinátor / tulajdonos indításával: próbakör `… --set advent --only advent-bg-portrait,advent-door-08,advent-door-24`
   (10 kép, ≈ 0,6 USD) → a tulajdonos megnézi a stílust → teljes kör `… --set advent --max 90`.
4. Válogatás: `npx.cmd tsx scripts/design-assets/review-page.ts --set advent` → a tulajdonos választ → `kivalasztas.json` →
   `npx.cmd tsx scripts/design-assets/approve-advent.ts kivalasztas.json` (WebP, méretre, bájtcél-ellenőrzéssel).
Szükséges: `OPENROUTER_API_KEY` a futtató gépen. Ügynök a 3. lépést nem indítja.

### 13.7 Köztes megoldás és új szeletek

- **S3a helyőrzőkkel készül:** minden képhely a végleges azonosítóval és mérettel (`advent-bg-*`, `advent-door-NN`, `advent-closing`,
  `advent-garland`, `advent-frame`) egy `AdventArt` komponensen át jelenik meg; amíg az `art-manifest.ts` nem tartalmazza a tételt,
  ízléses SVG / CSS helyettesítő látszik (színátmenetes éji ég, sziluett-falu, motívumonként egyszerű vonalas ikon) UGYANABBAN a
  dobozban — a csere nem mozdítja el az elrendezést, a mobil mérés mindkét állapotban érvényes.
- **Kódból megy (CSS):** hóesés (R12 kerete), az ablakok meleg fénye (megoldott ablak: arany `box-shadow` + lassú, 4 s-os lélegző
  fény), a csillag felgyulladása a 24. ablak megoldásakor (egyszeri 1,2 s-os felfénylés). Csökkentett mozgásnál: nincs hó, nincs
  lélegzés, a csillag animáció nélkül világít.
- **S3c-0 (előkészítés, fizetős hívás NÉLKÜL):** `design-assets/advent/prompts.json`, `design-assets/advent/style.md`, a `generate.ts`
  és a `review-page.ts` `--set advent` kapcsolója, `approve-advent.ts`, egységteszt a száraz futás költségére és a promptokra.
- **S3c (csere):** a tulajdonos válogatása után a WebP-k és az `art-manifest.ts` bekerülnek; bájtcél-őr (teszt), mobil mérés újra.
- Szerzői jog: csak saját generált kép; létező mű, márka, szereplő másolása nélkül (a `COMMON` stílus tiltja); a jelöltek naplója
  (`log.jsonl`: modell, prompt-lenyomat) a származás bizonyítéka.

### 13.8 Új elfogadási kritériumok

<!-- acceptance-checklist -->

- [ ] A40 WHEN a naptár megjelenik THEN the system SHALL a háttéren, az ablakok mögött és a záróképernyőn a 13.3 képlista
  tételeit mutatni, mindegyiket magyar `alt` szöveggel (a díszítőelemeket üres `alt`-tal), és a hiányzó képnél azonos méretű
  helyettesítőt.
- [ ] A41 WHEN a képcsomag bekerül THEN the system SHALL tartani a bájtcélokat (háttér ≤ 150 kB, ablakkép ≤ 25 kB, záró kép
  ≤ 120 kB), az ablakképeket lustán tölteni, és a képeket tartalom-hashes néven, `immutable` gyorsítótárral kiszolgálni.
- [ ] A42 WHEN a generátor `--set advent --dry-run` módban fut THEN the system SHALL hálózati hívás nélkül kiírni a képek
  számát, a becsült költséget és a promptokat.
- [ ] A43 WHEN egy ablak megoldott THEN the system SHALL meleg ablakfényt mutatni, a 24. megoldásakor a csillagot felgyújtani;
  WHEN csökkentett mozgás van beállítva THEN the system SHALL ezt animáció nélkül tenni.

## 14. Elhelyezés — főoldali kártya a Hero és a tananyagok között (tulajdonosi követelmény, 2026-11-18)

A tulajdonos szó szerint: „ezt nem játékok között helyezd el, hanem a Hero és a tananyagok közé, egy teljes szélességű, de nem túl
magas kártyán, hogy azonnal lássák a tanulók, és azonnal tudjanak vele játszani.”

Ez FELÜLÍRJA az R10-et, a 3.2 lista `Games.tsx` / `HomePracticeGames.tsx` / `AdventPromoCard.tsx` tételeit és az S4 kártya-részét:
a naptár NEM kerül a játékok közé — sem a `/games` listába, sem a főoldali játék-rácsba. A `Games.tsx` és a `HomePracticeGames.tsx`
érintetlen marad.

### 14.1 Döntések

- **Útvonal: `/adventi-naptar`** (a `/games/adventi-naptar` helyett). Indok: a „nem a játékok között” elvhez ez illik; rövid és
  kimondható az e-mailben; a kapuk és őrök `games` mintái (`gates.config.json`, `/games/<id>` esetfájlok) így biztosan nem
  tekintik játéknak. Az API-útvonal (`/api/advent`) és a teszt-azonosítók változatlanok.
- **Egy koppintás a kérdésig (javaslat, a terv ezzel készül):** a kártya „Kinyitom” gombja a `/adventi-naptar?nyit=ma` címre visz;
  a naptár megjelenik, és azonnal megnyitja a soron következő ablak kérdését — sorrend: a mai, még meg nem válaszolt ablak; ha az
  megvan, a legkorábbi pótolható (nyitható, megválaszolatlan) ablak; ha nincs ilyen, az első javítható ablak; ha az sincs, csak a
  naptár látszik. Indok: „azonnal tudjanak vele játszani”; a gyerek közben a háttérben látja a falut, és a válasz után ott marad a
  naptárnál. A paraméter nélküli `/adventi-naptar` csak a naptárat mutatja.

### 14.2 A kártya helye (felmérés: fájl:sor)

- `source/client/src/pages/Home.tsx:56` a `UserFileList`-et rendereli; a főoldal törzse a
  `source/client/src/components/UserFileList.tsx`-ben van: `HeroSection` (314–318. sor) → `SponsorBar` (321.) → `WelcomeCard`
  (324.) → évfolyamszűrő (326. sortól) → kereső → nézetváltó (404.) → tananyaglista; a játék-rács (`HomePracticeGames`) a lista
  alatt (498. és 533. sor).
- **Az új `AdventHomeCard` helye: közvetlenül a `HeroSection` után, a `SponsorBar` elé** (a 318. és a 321. sor közé) — így a Hero
  alatt az első elem, a szűrő, a kereső és a tananyagok fölött. Az üres listás ágban (266. sortól) a tartalom tetejére is bekerül,
  hogy a naptár akkor is elérhető legyen, ha nincs tananyag.
- Szélesség: a `container` teljes szélessége álló telefonon (360–430 px) és széles nézeten is; lekerekített, a fejléc üvegnyelvéhez
  illő keret.
- **Magasság-keret:** telefonon legfeljebb 132 px, 768 px-től legfeljebb 160 px; alsó térköz 12 px. Fix `min-height` = `max-height`
  (a tartalom nem nyújthatja meg; a hosszabb állapotszöveg egy sorban, három ponttal vágva).
- Mérés (az S4 része, böngészőtesztben rögzítve): az első tananyagkártya felső élének helye a kártya nélkül és a kártyával
  390×844-en és 1366×768-on; az elvárás: a különbség ≤ 144 px (telefon), illetve ≤ 172 px (asztal). A mostani abszolút helyet nem
  mértem (UNVERIFIED) — a teszt mindkét értéket kiírja a PR-leíráshoz.

### 14.3 A kártya tartalma

Elrendezés: háttérként a széles ünnepi banner (új képtétel, 14.5), rajta balra a szöveg, jobbra a gomb; telefonon a szöveg két
sorban, alatta / mellette a gomb.
- Cím: „Adventi naptár”.
- Állapot egy pillantásra (`advent-home-status`, a szerver `GET /api/advent/state` válaszából):
  - `teaser`: „Hamarosan: december 1.” (+ „még N nap”); gomb nincs, a kártya nem link;
  - `open`, a mai ablak megválaszolatlan: „Ma a(z) N. ablak nyílik”; ha korábbi is vár: „Ma a(z) N. ablak nyílik — és még K vár rád”;
  - `open` / `catchup`, a mai megvan, de van pótolható vagy javítható: „K ablak vár rád”;
  - minden nyitható megvan, de még nincs vége: „Mára kész! Holnap nyílik a(z) N+1. ablak” (gomb: „Megnézem”);
  - végigért: „Végigértél: M / 24 ablak világít” (gomb: „Megnézem”);
  - az állapot még tölt vagy hibázott: „Nyisd ki a mai ablakot!” (a gomb ilyenkor is működik).
- Gomb (`advent-home-cta`): „Kinyitom”, legalább 48 × 48 képpont, jól látható (arany alapon sötét szöveg), `/adventi-naptar?nyit=ma`.
  A kártya egésze nem link (a gomb az), hogy a képernyőolvasó és a billentyűzet egyértelmű célt kapjon.
- A feliratok kódból jönnek (nem a képen vannak); a banner díszítő, `alt=""`.

### 14.4 Szezonalitás, betöltés, regresszió

- Látszik: november 24–30. „Hamarosan”; december 1. – január 6. aktív; január 7-től és november 24. előtt nem látszik. Az
  `ADVENT_CALENDAR` flag kikapcsolt állapotában nem látszik.
- **Elrendezés-ugrás (CLS) nélkül:** a kártya dobozát a kliens AZONNAL lefoglalja, ha a böngésző órája szerint (`adventNow(new Date())`,
  a közös tiszta függvény) a fázis `teaser`, `open` vagy `catchup` — a tartalom a `GET /api/advent/status` és `/state` megérkezésekor
  töltődik bele ugyanabba a fix magasságú dobozba. A szerver marad a tekintély: ha a `status` szerint a naptár nem él (kikapcsolt
  flag, vagy a kliens órája téved), a doboz összecsukódik — ez az egyetlen eset, amikor a lista elmozdul (visszakapcsolás /
  rossz óra), a rendes szezonban nincs ugrás. Szezonon kívül a komponens semmit sem renderel és semmit sem kér le.
- Kép: a banner a hajtás fölött van, ezért NEM lusta: `fetchpriority="high"`, `decoding="async"`, rögzített `width` / `height`;
  alatta CSS-színátmenet a helyőrző (a kép megérkezése nem mozdít el semmit). Bájtcél ≤ 60 kB.
- Regresszió: a szűrő, a kereső, a nézetváltó és a lista DOM-sorrendje és teszt-azonosítói változatlanok; a meglévő főoldali tesztek
  változtatás nélkül zöldek maradnak: `home-views.spec.ts`, `material-title.spec.ts`, `classroom-badge.spec.ts`,
  `home-list-visibility.test.ts`, `home-cards-modern.test.ts`, `home-practice-games-catalog.test.ts`, `games-lobby-mobile.spec.ts`.
  **FELÜLÍRVA (16.5):** e2e-módban fejléc nélkül a naptár KIKAPCSOLT, a kliensben nincs e2e-ág. Az eredeti szöveg: Az e2e-szerver alapból szezonon KÍVÜL fut (a tesztóra fejléc nélkül a valódi dátum számít) — a meglévő tesztek determinizmusa
  érdekében a kártya e2e-módban csak akkor jelenik meg, ha a teszt kifejezetten tesztidőt ad (a kliens ilyenkor a `status` válasz
  fázisát használja a doboz lefoglalásához); ezt a naptár saját tesztjei használják.
- Az értesítő e-mail (R14) gombja a `/adventi-naptar` címre mutat (közvetlenül a naptárra); a levél szövege megemlíti, hogy a
  főoldal tetején is ott a kártya.
- Az M8 mérce a naptárra: a FŐOLDALRÓL egy koppintás a kérdésig.

### 14.5 Képlista-kiegészítés és a költség frissítése (a 13.3 és a 13.6 kiegészítése)

| Azonosító | Tartalom | Képarány → végső méret | Jelölt | Felbontás | Bájtcél |
|---|---|---|---|---|---|
| `advent-home-banner` | Széles, alacsony ünnepi sáv: havas falu háztetői és fenyők alulról, fölötte csillagos mélykék ég, jobbra szánkó rénszarvassal; a bal kétharmad nyugodt, sötétebb (ide kerül a szöveg) | 16:9 generálva → 1600 × 400-ra vágva (4:1) | 4 | 2K | ≤ 60 kB |

Prompt-tervezet: „A very wide, low festive banner: snowy rooftops and fir trees along the bottom edge, a deep blue starry night sky
above, a small sleigh with a reindeer on the right; the left two thirds stay calm and dark for overlaid text.”
Költség: + 4 kép × 0,09 + 4 × 0,003 = + 0,37 USD → **első kör: 94 kép ≈ 5,22 USD; becsült felső keret pótkörrel ≈ 7 USD**
(a 13.6 feltételeivel: a kódban rögzített 2026-10-17-i ár, a mai ár UNVERIFIED). A készlet 30 tételes.

### 14.6 Új elfogadási kritériumok

<!-- acceptance-checklist -->

- [ ] A44 WHEN a főoldal a szezonban (november 24. – január 6.), bekapcsolt flaggel jelenik meg THEN the system SHALL közvetlenül
  a Hero alatt, a szűrő és a tananyaglista fölött teljes szélességű kártyát mutatni „Adventi naptár” címmel, az aktuális
  állapottal és (december 1-től) egy legalább 48 × 48 képpontos „Kinyitom” gombbal; a kártya magassága telefonon ≤ 132 px,
  768 px-től ≤ 160 px.
- [ ] A45 WHEN a tanuló a főoldali kártya gombjára koppint THEN the system SHALL egyetlen koppintással a naptárra vinni és a
  soron következő ablak kérdését megnyitni (14.1 sorrend).
- [ ] A46 WHEN a szezonon kívül vagy kikapcsolt flaggel jelenik meg a főoldal THEN the system SHALL a kártyát nem mutatni, és a
  `/games` lista, valamint a főoldali játék-rács SOHA nem tartalmazhatja a naptárat.
- [ ] A47 WHEN a főoldal a szezonban betölt THEN the system SHALL a kártya helyét a tartalom megérkezése előtt lefoglalni
  (a tananyaglista nem ugrik el a kártya és a banner betöltésekor), és a bannert elsőbbséggel, nem lustán tölteni.
- [ ] A48 WHEN a kártya megjelenik THEN the system SHALL a főoldal meglévő tesztjeit (nézetek, címek, osztályjelvény, kereső,
  szűrő) változtatás nélkül teljesíteni.

Az A15 és az A28 a kártyára a fentiek szerint értendő (főoldali kártya; M8: a főoldalról egy koppintás).

## 15. További tulajdonosi döntések (2026-11-18, kérdőíven, szó szerint a választott opciók)

- **Képköltség: „Igen, max. 7 USD”.** Előbb 10 képes próbakör (≈ 0,65 USD), a képeket a tulajdonos megnézi; ha a stílus jó, mehet a
  teljes kör. A 7 USD-os keret kérdezés nélkül nem léphető túl: a generátor külön készletet élesben csak `--max-usd` plafonnal
  futtat, és a plafon elérésekor megáll (a sikertelen kísérlet is a keretbe számít). A fizetős futást nem ügynök indítja.
- **Értesítő e-mail címzettjei: „Csak a feliratkozóknak”.** A hírlevélre feliratkozottak (`email_subscriptions`, `is_subscribed`) és az
  admin által felvett címek (`extra_email_addresses`, `is_active`); a regisztrált játékosok (`player_accounts`) a főoldali kártyát
  látják, levelet NEM kapnak. Ezzel a 12.6 nyitott kérdése lezárult (1. opció); az S8 `includePlayers` kapcsolója és az admin-panel
  „regisztrált játékosoknak is” jelölőnégyzete NEM készül el.
- A próbakör parancsa (a `source/` mappából; a koordinátor indítja):
  `npx.cmd tsx scripts/design-assets/generate.ts --set advent --only advent-bg-portrait,advent-door-08,advent-door-24 --max 10 --max-usd 7`
  A jelöltek a nem követett `source/design-assets/candidates/advent/` mappába kerülnek; a válogató lap:
  `npx.cmd tsx scripts/design-assets/review-page.ts --set advent` → `source/design-assets/candidates/advent/index.html`.

## 16. A független ellenőr S1-ítéletének átvezetése (2026-11-18; ítélet: IGEN, FELTÉTELLEL a `bb248dd1` fejre)

### 16.1 K1 — korlátok alanyonként (S2b; felülírja az R8 „60 kérés / 15 perc / IP” szabályát)

- Írási korlát ALANYONKÉNT (a feloldott `subject_kind:subject_id` kulcsra): **290** kérés / 15 perc (két teljes kör) (FELÜLÍRVA 2026-11-18, orkesztrátori döntés a vak ellenőr K1 / K2 lelete után — 21. szakasz.) Eredetileg: 200 kérés / 15 perc. A szabályos legrosszabb eset
  24 ablak × 3 kérdés × 2 kérés (megnyitás + válasz) = 144 írás — ennek korlát nélkül át kell mennie.
- IP-korlát: **14 160** érvényes, sikeres írás / 15 perc / IP (FELÜLÍRVA 2026-11-18, orkesztrátori döntés a vak ellenőr K1 / K2 lelete után — 21. szakasz.) Korábban:
  **1500** írás / 15 perc / IP (több osztály egy iskolai NAT mögött belefér).
  (FELÜLÍRVA 2026-11-18, tulajdonosi döntés — „Emeljük iskolai méretre”, 19. szakasz; az eredeti érték 600 volt.)
- Sor-LÉTREHOZÁSRA külön korlát (ez védi a Neon-keretet): **240** új `device` sor / óra / IP és **3** / óra / munkamenet (FELÜLÍRVA 2026-11-18, orkesztrátori döntés a vak ellenőr K1 / K2 lelete után — 21. szakasz.)
  Korábban: **90** új `device` sor / óra / IP.
  (FELÜLÍRVA 2026-11-18, tulajdonosi döntés, 19. szakasz; az eredeti érték 30 volt.) A keretből a létrehozás ELŐTT hely foglalódik,
  és visszajár, ha a sor nem jött létre — párhuzamos kérésekkel sem léphető túl (S2b 2. visszanézés, U1).
- Integrációs teszt: egy alany a legrosszabb esetet játssza végig — 24 ablak, mindegyiken 3 kérdés, megnyitás + válasz = 144 írás
  15 percen belül, egy IP-ről → nincs 429;
  25 alany egy IP-ről napi 2–2 írással → nincs 429; a **91.** új névtelen sor egy órán belül ugyanarról az IP-ről → 429
  (FELÜLÍRVA 2026-11-18: eredetileg a 31.); 120 EGYIDEJŰ létrehozás egy címről → pontosan 90 sor.

### 16.2 K5, A6 — záró szöveg (megvalósítva az S1 javító commitjában)

Az `adventClosing(summary, { round, maxRounds, phase, waiting })` ismeri a fázist: lezárt naptárnál külön szöveg (`closed`), pótlási
időszakban nincs „holnap”, és a „meglepetés vár” csak akkor szerepel, ha a 95% az adott körben még elérhető
(`adventStillReachable`). Az R3 szövegei ennek megfelelően értendők.

### 16.3 K2 — a szülői levél pillanata (S5) — FELÜLÍRVA: az érvényes szabály a 18.1 (évadonként EGYETLEN levél)

A levél akkor megy, amikor a kör eredménye VÉGLEGES: (a) a tanuló megfelelt (`passed_at` első beállítása), vagy (b) mind a 24 ablak
megválaszolt, és nincs javítható ablak (megfelelés nélkül). Amíg van javítható ablak, levél nem megy. Ha egy későbbi körben éri el a
95%-ot, arról külön, egyszeri „megfelelt” levél megy. Foglalás: a `mailed_to` elemei `<kör>:<fajta>:<cím-lenyomat>` alakúak
(fajta: `final` / `passed`). Teszt: 22 megoldott + 2 javítható → nincs levél; javítás után 24 / 24 → egy „megfelelt” levél; 20 + 4
végleg hibás → egy „végleges” levél; 2. körben megfelel → még egy „megfelelt” levél; ismétlésre egyik sem megy újra.

### 16.4 K3 — az 1–2. évfolyam javításai

Az orkesztrátor ÉRTELMEZÉSE (nem a tulajdonos szó szerinti válasza): a tulajdonos kivétel nélküli „ablakonként legfeljebb 2” (b) döntéséből
következően az 1–2. évfolyamon is ablakonként 2 javítás; a körök száma itt 2 (a 3–12. évfolyam 3 köre helyett — a készlet mérete
miatt, szintén orkesztrátori döntés). Megvalósítva: `ADVENT_RULES.lowGrade`.
A karácsonyi készlet minimuma az 1–2. évfolyamra ezért **144** érvényes tétel (24 ablak × 3 kérdés × 2 kör) — a 12.2 és az A33 / A35
„96” és „1 javítás” értéke helyett ez érvényes. A teljes készlet így legalább 288 tétel (144 + 72 + 72).

### 16.5 K4, A8 — e2e-szezon és előnézet (S2b, S4, S6)

- **E2E-módban (`isE2eMode()`) érvényes `X-Advent-Test-Now` fejléc NÉLKÜL a naptár szezonon kívülinek számít:** a `status` válasza
  `{ enabled: false }`, minden más végpont 404 — a valódi dátumtól függetlenül. A meglévő főoldali e2e-tesztek így decemberben is
  változatlanok. A naptár saját tesztjei a fejléccel kapcsolják be. Őr-teszt: e2e-módban fejléc nélkül, decemberi rendszeridővel is
  `enabled: false`. (A 14.4 „a valódi dátum számít” félmondata helyett ez érvényes.)
- **A CLS az ÉLES kódutat méri:** a főoldali kártya helyfoglalása mindig a kliens órájából megy (`adventNow(new Date())`), e2e-ben is;
  a böngészőteszt a Playwright órájával (`page.clock.setFixedTime`) és a fejléccel ugyanarra a napra áll. Külön e2e-ág a kliensben
  NINCS. Egységteszt a helyfoglalás döntésére (`homeCardReserve(now)`), szezonon belül / kívül.
- **Előnézet a flag ELŐTT:** az `/api/admin/advent/preview` útvonal NEM függ az `ADVENT_CALENDAR` flagtől (csak
  `isAuthenticatedAdmin`) — a bekapcsolás előtti kipróbálásra való. Az előnézet címe `/adventi-naptar?elonezet=ÉÉÉÉ-HH-NN`.
- **Visszavont / érvénytelen tanulói token (E12):** ha a kérés tokent hoz, de az érvénytelen, a szerver a válaszban jelzi
  (`pairing: "invalid"`), a kliens NEM kezd csendben névtelen naptárat: „A személyes linked lejárt — nyisd meg újra a napi levélből”
  üzenetet mutat, „Folytatom vendégként” gombbal.

### 16.6 A2 — értesítő: lenyomat és leiratkozás (S8)

- Az `advent_announcements.recipient_hash` HMAC-SHA-256 a szerver titkával (`LEARNER_LINK_SECRET` / `SESSION_SECRET`, mint a tanulói
  tokennél), nem sózatlan SHA-256; titok nélkül élesben a küldés megtagadva. A takarító a sorokat az évad lezárása (január 7.) után
  törli.
- Leiratkozás — felmérés: e-mailes leiratkozó végpont a kódban NINCS; a `server/resend.ts:142` levélszövege „leiratkozhatsz a
  platformon belül”, a `server/daily-reminder.ts:18` szerint a napi levélnél tulajdonosi döntés, hogy leiratkozás nincs (az admin
  inaktiválja a címet). Az adventi értesítő EGYSZERI levél. Javaslat (a terv ezzel készül): a lábléc kimondja, hogy ez egyszeri
  értesítés, és megadja a WebSuli-levelek leállításának meglévő módját (a platformon belüli leiratkozás). **Nyitott tulajdonosi
  kérdés az S8 előtt:** kell-e valódi, egy kattintásos leiratkozó link (aláírt token + új végpont, amely a címet inaktiválja — ez a
  napi emlékeztetőt is leállítaná a nevesített tanulói címeknél)? ★ Javaslat: most nem; az egyszeri levélhez a lábléc elég.
- Megjegyzés a jogalaphoz: az `extra_email_addresses` címeit az admin vette fel (köztük nevesített tanulói címek) — ezek ma is kapnak
  napi levelet; a jogalap a tulajdonosé.

### 16.7 A3 — a „baráti” védelem őszintén

A szerveroldali pontozás a naptár ÁLLAPOTÁT védi (nem írható át a böngészőben), de a helyes választ NEM rejti el: a kliens megkapja
a kérdés azonosítóját, a közös évfolyam-bank a helyes válasszal együtt a nyilvános kliens-csomag része, a válaszsorrend pedig a
nyilvános kódból kiszámítható. Egy ügyes gyerek kikeresheti. **JAVÍTVA 2026-11-18 (vak ellenőr k5):** a karácsonyi készlet sem titkos — a
repó nyilvános, a készlet a `shared/advent/christmasBank/` alatt a helyes válaszokkal együtt olvasható (a kliens-csomagba nem kerül
be, de ez nem védelem). Az eredeti mondat („A karácsonyi készlet csak a szerveren van.”) nem igaz. A szülői levél tehát azt igazolja, hogy a naptár ezen a
szerveren végig lett játszva — azt nem, hogy segítség nélkül. Ez a (d) D1 „baráti” szint; erre erősebb állítást nem építünk.

### 16.8 Séma-kiegészítés (S2a)

`CHECK` kényszer az `advent_progress` táblán: `subject_kind = 'learner'` ⇔ `learner_id IS NOT NULL`; `subject_kind = 'player'` ⇔
`player_id IS NOT NULL`. A `plan` JSON körönként a `subjects` (nap → tárgy) mezőt is tartalmazza.

### 16.9 PR-bontás

(1) terv + végrehajtási utasítás; (2) S1 kód egyben, a javító committal (tiszta függvények, felület és adatbázis nélkül — a méret a
leírásban indokolva); (3) S3c-0; (4) S1b. Mindegyik külön ág a közös ágról.

### 16.10 Új elfogadási kritériumok

<!-- acceptance-checklist -->

- [ ] A49 WHEN egy alany 15 percen belül mind a 24 ablak mindhárom kérdését megnyitja és megválaszolja (144 írás) THEN the system SHALL
  egyetlen kérést sem elutasítani korlát miatt; WHEN egy IP-ről egy órán belül **240-nél** (egy munkamenetből 3-nál) több új névtelen sor jönne létre THEN the
  system SHALL a továbbiakat 429-cel és `Retry-After` fejléccel elutasítani — párhuzamos kéréseknél is; az érvénytelen kérés a hálózati
  keretet nem fogyaszthatja. (FELÜLÍRVA 2026-11-18, 21. szakasz: korábban „90-nél több”.) (FELÜLÍRVA 2026-11-18, tulajdonosi döntés, 19. szakasz:
  eredetileg „30-nál több”.)
- [ ] A50 WHEN a tanuló eredménye még nem végleges (van javítható ablaka vagy további köre, és nem felelt meg) THEN the system
  SHALL szülői levelet nem küldeni; WHEN az eredmény végleges (18.1) THEN the system SHALL évadonként és címzettenként pontosan
  egy levelet küldeni, és utána többet nem.
- [ ] A51 WHEN a szerver e2e-módban fut és a kérés nem hoz érvényes tesztidő-fejlécet THEN the system SHALL a naptárat
  kikapcsoltnak mutatni a valódi dátumtól függetlenül.
- [ ] A52 WHEN a naptár lezárt vagy pótlási időszakban van THEN the system SHALL nem mutatni „gyere vissza holnap” szöveget, és
  lezárva új kört vagy javítást nem ajánlani; WHEN a 95% a körben már nem érhető el THEN the system SHALL meglepetést nem ígérni.
- [ ] A53 WHEN a kérés érvénytelen tanulói tokent hoz THEN the system SHALL ezt jelezni, és a felület a tanulót újrapárosításra
  kérni ahelyett, hogy csendben névtelen naptárat kezdene.

## 17. Döntés a leiratkozásról (2026-11-18)

A koordinátoron át érkezett döntés: a 16.6 javaslata ELFOGADVA. Az adventi értesítő EGYSZERI levél; a lábléc kimondja, hogy
egyszeri, és megadja a WebSuli-levelek leállításának meglévő módját. Új, egy kattintásos leiratkozó link most NEM épül. A levél
továbbra is csak a tulajdonos külön jóváhagyása után megy ki (szöveg + címzettszám előzetes bemutatásával).

## 18. Az ellenőri ítéletek átvezetése, 2. kör (2026-11-18: docs `396f3bb9`, S1 `fefbf9cf`, S3c-0 `ebb552e1`)

### 18.1 D3 — a szülői levél: évadonként EGYETLEN levél (felülírja a 16.3-at és az R7 `mailed_to` leírását)

A tulajdonos válasza: „Igen, egy levél a végén”. Ezért egy tanulóról évadonként, címzettenként pontosan EGY levél megy, a végleges
eredménykor — a három feltétel közül annál, amelyik előbb teljesül:
1. a tanuló megfelelt (mind a 24 ablak megválaszolva, legalább 23 megoldott) — bármelyik körben;
2. már nincs több lehetősége: az utolsó megengedett körben mind a 24 ablak megválaszolt, és nincs javítható ablak;
3. az évad lezárult (január 7-től): a takarító egyszer végigmegy az évad tanulói sorain, és annak, aki legalább egy ablakra
   válaszolt és még nem kapott levelet, elküldi az akkori állást.
Amíg egyik sem teljesül (van javítható ablak, vagy kérhet új kört), levél NEM megy. A levél az összes kör eredményét összefoglalja
(legjobb kör, megoldott / 24, elsőre jó / 24, megfelelt-e). A foglalás kulcsa a `mailed_to`-ban: `final:<cím-lenyomat>` (HMAC);
körönkénti vagy külön „megfelelt” levél NINCS. Teszt: 22 megoldott + 2 javítható → nincs levél; javítás után megfelel → egy levél;
1. kör sikertelen, de van 2. kör → nincs levél; az utolsó kör sikertelen lezárása → egy levél; a levél után újabb válasz vagy
évadzárás → nincs második; évadzáráskor a levél nélküli, megkezdett tanulói sor → egy levél; névtelen és előnézeti sor soha.

### 18.2 D2 — alanyonkénti korlát

A 16.1 értéke 200 írás / 15 perc / alany (a szabályos legrosszabb eset 144). A teszt a 144-es esetet méri.

### 18.3 D1 — helyben javított / megjelölt helyek

12.2 és A33 (144), 12.3 és A35 (2 javítás), 14.4 (e2e-szezon), 16.3 (felülírva: 18.1); a végrehajtási utasításban az „S1 módosítása”,
az „S1b”, az „S8”, a „Kiegészítés 3” S4-pontja és a „Kiegészítés 5” érintett sorai.

### 18.4 N1, N2 — záró szöveg a szezon előtt és üres naptárnál (megvalósítva az S1 2. javító commitjában)

A `closed` szöveg csak `closed` fázisban jelenik meg; `before` / `teaser` fázisban külön `soon` fajta: „Hamarosan: december 1-jén
nyílik az első ablak!”. Lezárt naptárnál, ha a tanuló egy ablakot sem oldott meg, a szöveg nem számol („Nálad 0 ablak…” helyett):
„Az idei naptár bezárt — jövőre újra találkozunk!”.

### 18.5 Képgyártó — költségkeret (S3c-0 javítás; felülírja a 13.6 / 15. „futásonkénti plafon” értelmezését)

- **Hívásonkénti keret (B1):** minden hálózati hívás előtt ellenőrzés, a hívás indításakor elszámolás; a sikertelen hívás is
  számít; ha a következő hívás nem fér a keretbe, nem indul el (az újrapróba sem).
- **Összesített keret (M1):** a `--max-usd 7` a készlet TELJES kerete: a `candidates/advent/log.jsonl` eddigi becsült összege a
  kezdőérték (próbakör + teljes kör + pótkör együtt ≤ 7 USD), és a már meglévő jelöltek nem készülnek újra.
- **A keret becsült áron számol (M2):** a kódban rögzített 2026-10-17-i árral, nem a számlával. A valódi kemény plafon a
  szolgáltatónál a kulcsra állított költségkeret — **tulajdonosi teendő** (a koordinátor jelzi). A próbakör után a számlázott
  összeget össze kell vetni a kiírt becsléssel, mielőtt a teljes kör indul.
- **Stílus-referencia (L1):** a teljes körhöz a tulajdonos által KIVÁLASZTOTT háttér kell:
  `--ref advent-bg-portrait=advent-bg-portrait/<fájl>`; enélkül (ha a háttér nem ugyanabban a futásban készül) a futás hívás előtt megáll.
- **Egyéb:** 180 s-os időkorlát a hívásokon; a többalakos ablakok (19., 20., 24.) `scene` stílust kapnak; `--max-usd` felső
  korlátja 20 (elütés ellen); külön készletnél nincs félrevezető „Csak az első N tétel fut” üzenet.
- A teljes kör parancsa a próbakör és a válogatás UTÁN (a koordinátor indítja):
  `npx.cmd tsx scripts/design-assets/generate.ts --set advent --max 94 --max-usd 7 --ref advent-bg-portrait=advent-bg-portrait/<a kiválasztott fájl>`

## 19. Az S2b ellenőri ítéletének átvezetése és tulajdonosi döntés a korlátokról (2026-11-18; S2b `03bbb129`: IGEN, FELTÉTELLEL)

- **Tulajdonosi döntés (kérdőíven): „Emeljük iskolai méretre”** — 90 új névtelen sor / óra / IP és 1500 írás / 15 perc / IP; az
  alanyonkénti 200 írás / 15 perc marad. Ez FELÜLÍRJA a 16.1 „600 írás / 15 perc / IP” és „30 új `device` sor / óra / IP” értékét
  és az A49 „30-nál több” számát (helyesen: 90-nél több). A korlátok egy helyen állnak: `server/advent/limits.ts` `ADVENT_LIMITS`.
- **K2:** a létrehozási keret a LÉTREJÖTT sort számolja (a zárolt módosítás után, ha a sor most jött létre és megmaradt); a
  visszagördült kísérlet nem fogyaszt keretet.
- **K1:** a játékos-fiókos azonosítás valódi munkamenettel tesztelt (sima játékos, tanulóhoz kötött fiók, tiltott fiók).
- **C1:** a 201. alanyi írás 429-e és az IP-korlát elutasító ága tesztelt (injektált kisebb korláttal, a kulcs ellenpróbájával).
- **C2 (E19 pontosítva):** a tanulóhoz kötött fiók adatletöltése a tanuló naptár-sorát is tartalmazza.
- **C3 (16.5 pontosítva):** érvénytelen tanulói tokennel az ÍRÓ végpontok 409-et adnak `pairing: "invalid"` jelzéssel, és nem
  írnak az eszköz sorába; a `GET /state` továbbra is jelez, és vendégként (token nélkül) folytatható.
- **C4:** HTTP-szintű eset nem e2e-módban (a tesztidő-fejléc hatástalan), és őr a `server/routes.ts` bekötésére.
- **C5:** ha egy már megválaszolt kérdés kikerül a bankból, az ablak újranyitása a tárolt eredményt adja kérdés nélkül
  (`question: null`, `correctIndex: -1`), nem hibát.
- **C6 (jegy):** a helyi DB-kör a korlát közelében fut — a következő DB-teszt előtt érdemes két folyamatra bontani.
- **Olvasási keret (2026-11-18, tulajdonosi döntés — az „iskolai méret” következménye, a felület ellenőri köre, S3 K4 után):** az
  állapot-olvasás (`GET /api/advent/state`) korlátja **400 / perc / IP** (eredetileg 120) — három-négy osztály egyszerre, egy
  iskolai hálózatról. Helye: `server/advent/limits.ts` `ADVENT_LIMITS.ipReads`; teszt: `tests/advent-limits.test.ts`. A kliens a
  válasz után nem olvas külön állapotot (az eredményből frissít), 429-nél pedig megtartja a látható naptárat.
- **C6 lezárva (2026-11-18):** a DB-kör terheletlen gépen 300 s a 480 s-os korlátból (37% tartalék), párhuzamos kliensekkel.

## 21. A kéréskorlátok második méretezése és a kizárás elleni védelem (2026-11-18, orkesztrátori döntés; a vak ellenőr K1 / K2 lelete)

A tulajdonos szándéka „iskolai méret”: egy iskola egyszerre, egy hálózati címről. A 19. szakasz számai ezt nem fedték le (a
pótlási terhelés nem volt kiszámolva), és a hálózati keretet érvénytelen kérésekkel egy gyerek másodpercek alatt elfogyaszthatta.

**Méretezés** (egy helyen: \`server/advent/limits.ts\` \`ADVENT_LIMITS\`; pontos értéket rögzítő teszt: \`tests/advent-limits.test.ts\`):

| Keret | Érték | Számítás |
|---|---|---|
| Érvényes, sikeres írás / IP | 14 160 / 15 perc | 4 osztály × 30 gyerek × (évfolyam 1 + 24 × (megnyitás + válasz) + 5 javítás × 2 = 59 írás) × 2 tartalék |
| Állapot-olvasás / IP | 1200 / perc | 120 gyerek × ~5 olvasás / perc × 2 |
| Új névtelen sor / IP | 240 / óra | 8 osztály |
| Új névtelen sor / munkamenet | 3 / óra | egy kliens a hálózati keret töredékét fogyaszthatja |
| Írás / alany | 290 / 15 perc | két teljes kör: 2 × 144 + évfolyam + új kör |
| Érvénytelen kérés / IP | 120 / perc | csak az érvénytelen kérést utasítja el, a szabályosat soha |

**Kizárás elleni védelem:** a hálózati keretbe csak az érvényes, alanyhoz köthető, SIKERES (2xx) kérés számít — a bemenet-ellenőrzés
és az alany feloldása a hálózati korlát ELŐTT fut. Minden 429-en \`Retry-After\` van.

**Maradó kockázat (tudatosan vállalt, „baráti” szint):** egy szkriptelő, aki munkamenetet és eszközazonosítót cserélget, sikeres
írásokkal továbbra is elfogyaszthatja egy hálózat keretét (ehhez ~49 eszköz és ~17 munkamenet kell 15 percen belül) — erős
azonosítás nélkül ez nem zárható ki; a következmény legfeljebb 15 perces írás-szünet egy címen, adatvesztés nélkül. A kliens-IP
megállapításának megbízhatósága (a Render közvetlen elérhetősége) külön jegy.

**Névtelen → párosított átmenet (vak ellenőr k1; TULAJDONOSI DÖNTÉS 2026-11-18, kérdőíven: „Igen, vigyük át.”):** ha egy kérés
érvényes tanulói linket ÉS eszközazonosítót is hoz, az eszköz névtelen sora a tanulóhoz kerül: ha a tanulónak még nincs sora, az
eszköz sora átkerül (újrakulcsolva, ugyanaz a sor); ha van, a TÖBB megoldott ablakkal rendelkező marad (egyenlőségnél a tanulóé), a
másik törlődik; válasz nélküli eszköz-sor egyszerűen törlődik. Utána a gyereknek egyetlen élő sora van. Az átvétel csak ÍRÁSNÁL
történik (egy tranzakcióban, mindkét sor zárolva; GET-en nincs mellékhatás) — az olvasás előnézetként már a megtartandó haladást
mutatja. Az átvétellel egyidejű válasz nem vész el és nem ad 500-at (a zár sorba rendezi; a közben megszűnt sorra írás 409
„frissítjük”). Adatvédelem: az eszköz haladása a tanuló személyes adatává válik — a tanuló sora a tanulóval együtt törlődik (idegen
kulcs), a tanulóhoz kötött játékos-fiók adatletöltése tartalmazza. Megvalósítás: \`server/advent/store.ts\` \`adoptionChoice\`,
\`adopt\`; \`server/advent/routes.ts\` (az alany feloldása után). Jegy: #170 (lezárva).

**Évfolyam (vak ellenőr k6):** az évfolyam az első VÁLASZNÁL rögzül, nem a megnyitáskor (R6, E10); az első válaszig a profil
változása új tervet ad. **Sérült sor (k3):** 500 helyett érthető 409 (\`corrupt: true\`) minden végponton.
