# Végrehajtási utasítás — az eredmény-e-mail S1b (#510) bontása

> Terv: `docs/specs/2026-11-22-eredmeny-email-bontas.md` (kötelező előtte elolvasni). Állapot: VÁZLAT — a terv jóváhagyása után indul.

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

## 1. B1 — dátum, korhatár, teljes kör szövege (R2, R13 teljes kör, R17)

- Átvétel: `source/shared/quiz-round.ts` (korhatár: `roundActivityAt`, `roundTooOld`, `STALE_ROUND_DAYS`), a `useExperienceRound.ts`
  `lastAnsweredAt` mezője, a levél dátumsora a `lesson-result-email.ts`-ben.
- Tesztek: `result-report-complete.test.ts` korhatár-részei, a levélszöveg tesztje.
- Kész: a teljes kör levele a kitöltés dátumát mutatja; 7 napnál régebbi utolsó válasz után nincs beküldés.

## 2. B2 — végleges beküldés hálózati rétege (R4, R8, R9, R23, R26, R37, R46)

- Átvétel: `queryClient.ts` (keepalive, CSRF-érvénytelenítés, törzsolvasásig élő időkorlát, nincs beágyazott újrapróba),
  `lesson-result-limits.ts` (osztálykeret), `routes.ts` / `index.ts` keret-bekötés.
- Tesztek: `request-retry.test.ts`, `lesson-result-limits.test.ts`, `review-rate-limit.test.ts`.

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
