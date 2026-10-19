# Erőforrás-optimalizálás S2a — forgalom: karcsú listák, állapotfüggő lekérdezés, képvégpont

Állapot: tulajdonosi jóváhagyás 2026-10-19 (az erőforrás-elemzés minden javaslata, szeletenként). Előzmény: S1
(`docs/specs/2026-10-19-eroforras-s1.md`). Utána: S2b (mentés, megőrzés, indexek), S3 (AI-gyártás).

## Mérés
- **Neon (WEBSULI éles):** okt. 1. óta **11,6 GB** kimenő adatforgalom egy 158 MB-os adatbázisból.
  - `lesson_workflow_runs`: 42 MB / 184 sor (kb. 230 kB futásonként, főleg `snapshot`).
  - `design_assets`: 23 MB.
- **A forgalom forrásai (kód, fájl:sor):**
  - **Futásnapló-lista** (`WorkflowMonitor.tsx:24`): 5 mp-enként, feltétel nélkül kéri a `/api/studio/workflows`-t. Ez 50 TELJES
    futás-pillanatképet ad vissza (`server/workflows/store.ts:61`, `visits` + `history`), a lista viszont csak az azonosítót, a
    dátumot, a címkét és az állapotot használja.
  - **Okosítási lista** (`storage.getAllImprovedHtmlFiles`, `storage.ts:1317`): minden jelölt teljes `content`-jét küldi; a
    felület a listában nem használja (az előnézet külön végpont).
  - **Okosítás állapotvégpontja** (`improveAsync.ts:677, :691`): lekérdezésenként kétszer olvassa a teljes rekordot (teljes
    HTML).
  - **Képvégpont** (`design-assets.ts:101`): a 304-es válaszhoz is beolvassa a képbájtokat.
  - **Forrásfeltöltés** (`SourceUploadForm.tsx:228`): `refetchIntervalInBackground: true` — rejtett fülön is kérdez.
  - **`client/public`:** `christmas-bg.jpg` (5,1 MB), `christmas-bg.png` (2,9 MB), `hero-video.mp4` (1,2 MB); hivatkozás
    sehol.

## Cél
1. **`GET /api/studio/workflows`:** karcsú elemek (`id`, `definition`, `state`, `createdAt`, `updatedAt`, `error`, `result`,
   `resourceId`, `executions`), `visits: []`, `history` nélkül; az egyes futás (`/workflows/:id`) változatlan.
   - **A `WorkflowHistory` lekérdezése:** csak akkor 5 mp, ha van `running` / `waiting` futás; különben 60 mp.
2. **`getAllImprovedHtmlFiles`:** `content` nélkül (minden más mező marad), a legutóbbi 200.
3. **Az állapotvégpont:** könnyű lekérdezés (`id`, `status`, `title`, `contentType`, `createdAt`, `improvementNotes`); a teljes
   rekordot csak az időtúllépési ágban olvassa.
4. **Képvégpont:** előbb csak `mime` + `sha256`; egyezésnél 304 (bájtolvasás nélkül), különben a bájtok.
5. **`SourceUploadForm`:** `refetchIntervalInBackground: false`.
6. **Fájlok:** a három nem használt fájl törlése.

## Nem-cél
- A piszkozatlista SQL-jének átírása (az index S2b-ben).
- A képbájtok helye (a 2026-10-17-i tulajdonosi döntés szerint marad az adatbázisban).

## Elfogadás (EARS)
- **Futásnapló-lista:** HA a futásnapló-listát kérik, AKKOR egyik elem sem tartalmaz `visits`-t és `history`-t; az egyes futás
  lekérdezése teljes marad.
- **Okosítási lista:** HA az okosítási listát kérik, AKKOR az elemekben nincs `content`.
- **Képvégpont:** HA a kép `If-None-Match`-e egyezik, AKKOR 304, és a bájtoszlop nincs a lekérdezésben.
- **Régi viselkedés:** a meglévő tesztek zöldek; a felület a futások listáját és az okosítási listát ugyanúgy mutatja.
