# SEC-107 — A 12 token nélküli mutáló fetch rendbetétele

- **Kanban**: #107
- **Ág**: `fix/107-csrf-client-calls` (a `main` @ `f3a0fda`-ból)
- **Dátum**: 2026-09-04

## Cél

A kliensben 12 olyan nyers `fetch` van mutáló metódussal, amely nem visz
`X-CSRF-Token` fejlécet. Ebből **6 valódi hiba** (a szerver CSRF-middelware-e 403-at
ad), 6 pedig **téves besorolás** volt a gátban: a szerver azokat az útvonalakat
tudatosan Origin/Referer-allowlisttel védi (nincs session, vagy iframe-ből jönnek).

A javítás után a gát nem listázza a szerver által mentesített útvonalakat, és minden
más mutáló hívás `apiRequest`-en megy (az teszi rá a tokent).

## Mi a valódi hiba és mi nem

A szerver CSRF-kivétellistája (routes.ts:744-757): `/api/login`, `/api/logout`,
`/api/ai/*`, `/api/admin/improve-material/*`, `/api/admin/improved-files/*`,
`/api/material-result`. Ami ezen kívül esik, az token nélkül **403-at kap élesben**.

### Valódi hibák (javítandó — apiRequest)

| Fájl | Végpont | Hatás, ha javítatlan marad |
|---|---|---|
| `components/EnhancedMaterialCreator.tsx` | POST `/api/html-files` | a Fejlett Készítő publikálása 403 |
| `components/ErrorReporter.tsx` | POST `/api/error-report` | hibajelentés soha nem ér célba |
| `components/FileCard.tsx` | POST `/api/admin/materials/:id/generate-quiz` | kvíz-generálás 403 |
| `components/SystemPromptEditor.tsx` | PUT `/api/admin/system-prompts/:id` | prompt-mentés 403 |
| `lib/pushNotifications.ts` | POST `/api/push/subscribe` | push-feliratkozás 403 (gyerek böngészője) |
| `lib/pushNotifications.ts` | POST `/api/push/unsubscribe` | leiratkozás 403 |

### Téves besorolások (a gátban dokumentálandó szerver-kivételek)

`/api/logout` (AuthStatus), `/api/login` (Login), `/api/ai/*` ×3 (EnhancedMaterialCreator
SSE), `/api/admin/improve-material/*` (MaterialImprover). Ezek nyers fetch-csel is
legitimek, mert a szerver oldalán `enforceOriginAllowlist` őrzi őket — a gátnak ezt
ismernie kell, nem a hibás listába sorolni.

## Elfogadási feltételek (EARS)

- **AC1** — Amikor a gát lefut, a szerver által mentesített útvonalak raw fetch-jei
  **nem** jelentenek hibát.
- **AC2** — Amikor a gát lefut, a 6 javított hívóhely közül egy sem jelent hibát
  (mind `apiRequest`-et használ).
- **AC3** — Amikor egy javított hívóhelyet visszaalakítanak nyers fetch-csé, a gát
  **piros** lesz (reverz-mutáció).
- **AC4** — Amikor a kliens a push-feliratkozást futtatja, a kérés hordozza a
  CSRF-tokent — bejelentkezés nélkül is (a token-végpont nyilvános).
- **AC5** — A hibaüzenetek nem romlanak: a hívók a korábbi `!response.ok` logikával
  azonos módon értesülnek a szerver hibájáról (az `apiRequest` dobja a szerver üzenetét).

## Nevesített tesztek (RED előbb)

`tests/client-csrf-guard.test.ts` (átdolgozva):
- `AC1 a szerver által mentesített útvonalak raw fetch-ei nem hibák`
- `AC2 a 6 javított hívóhely nem jelent hibát`
- `AC3 reverz-mutáció: visszatett nyers fetch → piros` (a meglévő detektor-tesztből)
- a meglévő „nem küld nyers mutáló fetch-et" eset a szerver-kivétellistával bővítve

## Verifikáció

```bash
cd /d/repo/WEBSULI
npm run verify          # check + lint + test + build (a gyökérből, f3a0fda óta)
cd source && npx playwright test
```

Plusz: reverz-mutáció az AC3-ra.
