# Végrehajtási utasítás — az eredmény-e-mail S1b (#510) bontása

> Terv: `docs/specs/2026-11-22-eredmeny-email-bontas.md` (kötelező előtte elolvasni). Állapot: JÓVÁHAGYVA (2026-11-22) — a B1-gyel indul.

## 0. Közös szabályok (minden szeletre)

1. **Ág:** `feat/eredmeny-b<N>-<rovid-nev>` a friss `origin/main`-ről, saját munkafában (`.claude/worktrees/eredmeny-b<N>`), `npm.cmd ci
   --prefix source` után. Halmozott ág TILOS: a következő szelet az előző beolvadása után, a friss főágról indul.
2. **Forrás:** a #510 ága (`fix/eredmeny-email-kviz`, fej `389ea8c3`). Átvétel csak a szelet követelményeihez tartozó részekből, a
   hozzájuk tartozó tesztekkel; `git checkout <fej> -- <fájl>` egész fájlra TILOS, ha a fájl más szelet kódját is hordozza — ilyenkor
   kézi átvétel az Edit eszközzel.
3. **Sorrend a szeleten belül:** (a) bukó tesztek a szelet EARS-pontjaira (futtatva pirosak); (b) megvalósítás; (c) célzott tesztek;
   (d) kliensoldali szeletnél az eredménylevél-e2e (`npx playwright test tests/lesson-result-email.spec.ts tests/lesson-result-email-quiz.spec.ts`)
   helyben, az alap konfigurációval; (e) `npm run gate:stage`; (f) commit.
4. **Méretőr:** `git diff --stat origin/main...HEAD -- source/server source/client source/shared` éles sorai ≤ ~400. Fölötte: a szelet
   további bontása a terv 4.2 pontja szerint, kód nélkül, előbb a terv frissítésével.
5. **Kapuk:** `gate:push` → konvergencia-őr (`python -X utf8 ~/.claude/scripts/vak-kor-konvergencia.py --reports <a szelet jelentései>`;
   exit 1 → STOP, tulajdonosi döntés) → `gate:blind-review` → `record-review` → `gate:pr -- --body-file` → push + PR → zöld CI →
   `gate:merge` → merge. Szeletenként legfeljebb 3 vak kör.
6. **Célfájl a vak ellenőrnek:** a szelet követelményei (R-számokkal, a #510 specből szó szerint), a kapcsoló KI-semlegessége, a
   „Mit NEM vizsgáltam” elvárás; hibát keressen, ne megerősítést.
7. **Kapcsoló (B4–B8):** a B4 vezeti be (név a B4 tervezésekor rögzítendő, a `render.yaml`-ba NEM kerül; alapból KI); a B4–B8 minden új
   viselkedése e mögött. KI állásban a viselkedés-lenyomat teszt a főághoz mér.

## 1. B1a — szerver: opcionális kezdés / utolsó válasz, dátumsor a levélben (R13 teljes kör, R2 szerverrésze)

- `shared/lesson-result-email.ts`: `startedAt` (mindkét fajta) és `lastAnsweredAt` (kvíz) opcionális, pozitív egész; a séma szigorú marad.
  `formatBudapest`, `plausibleStart`; a levél „Beküldve:” sora mindig, „A kör kezdete:” csak hihető értékkel.
- `server/lesson-result-email.ts`: a beküldött `startedAt` a pontozott eredmény `meta`-jába.
- Teszt: `tests/lesson-result-email-date.test.ts` (séma régi / új klienssel, nyári / téli idő, dátumhatár, hihetőség).
- Kész, ha települt: a B1b csak ezután indul.

## 1b. B1b — kliens: mezők küldése, korhatár (R2)

- Átvétel: `source/shared/quiz-round.ts` (`roundActivityAt`, `roundTooOld`, `STALE_ROUND_DAYS`), a `useExperienceRound.ts` `lastAnsweredAt`
  mezője és rögzítése válaszkor, a `resultReport.ts` végleges beküldésében a mezők és a korhatár.
- Tesztek: `result-report-complete.test.ts` korhatár-részei; e2e: a végleges beküldés törzse a két mezővel.
- Kész: 7 napnál régebbi utolsó válasz után nincs beküldés; a levél mutatja a kör kezdetét.
- **Megvalósítás (2026-11-23, ág `feat/eredmeny-b1b-kliens-mezok`):** előfeltétel teljesült — a B1a (#532) a főágon és élesben van
  (production a `c87d1706` commitról). A `shared/quiz-round.ts` új függvényei: `STALE_ROUND_DAYS`, `roundTooOld`, `roundActivityAt`; a
  `useExperienceRound.ts` sémája opcionális `lastAnsweredAt` mezőt kap (a régi tárolt kör nélküle is betölt, és — mivel a válasz kora
  ismeretlen — NEM minősül elavultnak: a régi küldési viselkedés marad; 1. vak kör L1); a kvízválasz rögzíti
  (`LessonExperienceView.tsx`); a `resultReport.ts` a LE NEM ZÁRT, 7 napnál régebbi utolsó tevékenységű kört nem küldi, a törzsbe a
  `startedAt` (mindkét fajta) és a `lastAnsweredAt` (csak kvíz — a feladat-séma nem fogadja) kerül. A körazonosító és a „már elküldve”
  jelző változatlan. Tesztek: `result-report-complete.test.ts` (korhatár határai, szerkezeti őr), `lesson-result-email-quiz.spec.ts`
  (a törzs megfelel a szerver sémájának; 8 nap után nem megy el, 6 nap után elmegy — a böngésző órájának léptetésével).

## 2. B2 — végleges beküldés hálózati rétege (R4, R8, R9, R23, R26, R37, R46)

- Átvétel: `queryClient.ts` (keepalive, CSRF-érvénytelenítés, törzsolvasásig élő időkorlát, nincs beágyazott újrapróba),
  `lesson-result-limits.ts` (osztálykeret), `routes.ts` / `index.ts` keret-bekötés.
- Tesztek: `request-retry.test.ts`, `lesson-result-limits.test.ts`, `review-rate-limit.test.ts`.
- **Végrehajtási jegyzet (2026-11-23, ág `feat/eredmeny-email-b2`, előfeltétel: a B1a #532 és a B1b #539 a főágon):**
  - Hatókör (a B3–B8 előtt, kapcsoló nélkül): csak a VÉGLEGES beküldés útja. A pillanatkép (`partial`), a `sendKeepalive`, a
    képesség-jelzés (`resultApi`, R12), a kilét-címke (R31), a token-válaszhoz kötött törzs (`prepare`, R39) és a kör-tulajdonos
    keret (`claimLimiter`, R51) NEM kerül át — azok a B3 / B4 / B5b / B7 szeletekben jönnek.
  - R4: az `apiRequest` CSRF-403 utáni egyszeri tokenfrissítése a `keepalive` jelzőt is megtartja; gyorsítótárazott tokennel előzetes
    hálózati kör nélkül küld, token nélkül előbb kér egyet (változatlan).
  - R23 (hálózati rész): ha a friss tokennel ismételt kérés is 403-at kap, a token sem marad a gyorsítótárban — a következő kísérlet
    friss tokent kér. A képesség-jelzéses feltétel (új token régi példánytól → nincs ismétlés) a pillanatképhez tartozik; a B3
    (képesség-jelzés) és a B5b (pillanatkép-kliens) hozza.
  - R8: a kvíz végleges kérése `keepalive: true`; a feladatoké nem (64 KB-os keret). A „…:partial:<kör> kulcs törlése” a B5b-vel jön
    (a főágon még nincs ilyen kulcs).
  - R9: új `server/lesson-result-limits.ts` — `RESULT_RATE_LIMIT = { windowMs: 15 perc, final: 60, partial: 60 }`, két független
    keret (`resultLimiter` a pillanatképet kihagyja, `partialLimiter` csak azt számolja), kulcs a `clientIpKeyGenerator`. A
    `lesson-result-email.ts` 20-as kerete helyett ez kerül a routerre. A főág szigorú sémája a `partial` mezőt ma 400-zal utasítja el,
    így a pillanatkép-keret a B5a-ig csak a hibás kéréseket számolja (semleges).
  - R46: `lessonsWriteGate(limiter)` a `/api/lessons` közös írási kapuja; a biztonságos metódus, a `/review/` és a pontos
    `POST /:lessonId/results` kimarad a közös 100-as keretből (a CSRF-őr változatlan). A `server/index.ts` ezt szereli fel.
  - R26: az eredmény-POST `apiRequest`-je belső újrapróba nélkül (`retries: 0`) megy; az újrapróbát EGYETLEN szint, a
    `resultReport.ts` végzi: laponként legfeljebb `RESULT_REPORT_ATTEMPTS = 3` kérés, csak újrapróbálható hibára (hálózat,
    időtúllépés, 5xx), azonnali ismétlés nélkül (30 s, majd 60 s késleltetés — az R24 ütemezése; a tartós sor, a 429 /
    `Retry-After` kezelése a B7). Folyamatos 503 mellett így laponként legfeljebb 3 POST megy (a főágon 4 volt, gyors egymásutánban).
  - R37: az `apiRequest` időzítője a válasz törzsének beolvasásáig él (`finally`); a `/api/csrf-token` lekérése saját 15 s-os
    határidőt kap (`AbortSignal.timeout`).
  - PR #556 bot-review (Codex, Vercel, Copilot) javításai: (1) a tokenlekérés határideje időzített `AbortController` — `AbortError`, így
    a 403 utáni frissítés időtúllépése is újrapróbálható (az `AbortSignal.timeout` `TimeoutError`-t adott, amit a predikátum nem ismer);
    (2) a 3 kísérletes keret körönként, a lap élete alatt él (`pageAttempts`, a „már elküldve” jelző kulcsán) — a kör lezárása nem nyit
    új keretet; (3) a B1b korhatárát minden újrapróba előtt újra nézi (a várakozás alatt elavult, le nem zárt kör nem megy el).
  - Tesztek: `tests/lesson-result-limits.test.ts` (R9, R46 valódi HTTP-n), `tests/review-rate-limit.test.ts` (a kapu viselkedése),
    `tests/request-retry.test.ts` (R26 forrásőr), `tests/lesson-result-email-quiz.spec.ts` B2-esetei (R4, R8, R26, R37 böngészőben).

## 3. B3 — képesség-jelzés (R10, R12)

- Átvétel: `shared/result-compat.ts`, a `GET /api/csrf-token` képesség-mezője; régi szerver ↔ új kliens visszajátszás teszt
  (`lesson-result-email-quiz.spec.ts` „régi szerver” esetei).

## 4. B4 — körönként egy végleges levél, kilét a létrehozáskor (R27, R42, R47, R49, R50, kilét-invariáns)

- Átvétel: a végleges jelzősor (`claimFinalRound`, `finalRoundKeyOf`, `finalOwnerKeyOf`), a kör-tulajdonos rögzítése (`claimRoundOwner`).
- A kapcsoló bevezetése itt. DB-integrációs teszt: `lesson-result-email-db.integration.ts` megfelelő esetei.

## 5. B5a / B5b — „félbehagyva” pillanatkép (szerver / kliens)

- B5a: szerveroldali ütemezés és elnyomás (R1, R5–R7, R11, R15, R16, R18, R19, R21, R22, R25, R29, R34, R36, R38, R45, R48); teszt:
  `lesson-result-email-partial-db.integration.ts` megfelelő esetei.
- B5b: kliensoldal (R3, R20, R44, R13 részleges szöveg); e2e: `lesson-result-email-quiz.spec.ts` pillanatkép-esetei.
- Ha a B5a 400 sor fölé menne: B5a-1 (ütemezés + egyetlen indító út) és B5a-2 (elnyomás, első rögzítő, attribúció).

## 6. B6 — leállításkori ürítés (R14, R33, R41)

- Átvétel: `shutdown-flush.ts`, az `index.ts` leállítási bekötése; teszt: `shutdown-flush.test.ts`.

## 7. B7 — tartós kimenő sor (R24, R28, R30–R32, R35, R39, R40, R43; tartós-sor spec)

- Átvétel: `shared/result-outbox.ts`, `resultOutboxFlag.ts`, `App.tsx` bekötés; teszt: `result-outbox.test.ts`, az e2e tartós-sor esetei.
  A kapcsoló alapból KI marad.

## 8. B8 — tároló-kompatibilis, nagy entrópiájú körazonosító (új)

- ELŐBB rövid kiegészítő terv ebben a fájlban (a terv 5. pontjának edge case-ei alapján): hol él a kulcs, hogyan viselkedik, ha egy régi
  kliens kulcs nélkül írja felül a tárolót (pl. a kulcs külön tárolókulcson, a kör tartalmához kötve, vagy a szerver-jelzősor kettős
  — régi + új — azonosítóval ellenőriz), és hogyan nem kap második levelet a régi azonosítójú, már elküldött kör.
- Kötelező e2e a vak kör előtt: régi + új kliens közös tárolóval; már elküldött régi kör; két külön kör azonos kérdéssorral és kezdéssel.

## 9. Zárás

- Záró táblázat: R1–R54 → szelet → teszt (fájl:teszt neve). Hiányzó sor = nyitott munka.
- A #510 lezárása merge nélkül, a szelet-PR-ok listájával; a `fix/eredmeny-email-kviz` ág törlése csak tulajdonosi jóváhagyással.

### B3 / B5a — a képesség hirdetésének feltétele

B3 csak olvassa a numerikus `resultApi: 2` jelzést; azt kizárólag tesztfixture adja. Jelzés nélkül a végleges kérés a régi alakban megy, új küldési út nélkül. B5a elfogadási feltétele: a szerver csak a teljes V2-törzs (a `partial` és `clientNow` mezőket is beleértve) tényleges feldolgozását igazoló integrációs teszt után hirdethet V2-t. Addig a teljes R12 nincs kész; a séma lazítása vagy a kérés feldolgozás nélküli nyugtázása nem teljesítés.
