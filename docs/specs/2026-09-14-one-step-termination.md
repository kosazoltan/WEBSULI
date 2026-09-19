# Spec: one-step lesson run finalization fix

> Dátum: 2026-09-14 · Szerző: Copilot · Állapot: JÓVÁHAGYVA

## 1. Cél

A Websuli one-step tananyaggyártási folyamatnak pontosan a végső állapotát kell helyreállítani: a háttérfutás ne térjen vissza generikus „Váratlan hiba történt” üzenetre, amikor a pipeline ténylegesen eljutott egy valós végállapothoz. A javítás célja az, hogy a job és a one-step run adatai konzisztens módon jelezzék a kész vagy parkolt állapotot, és a végállapotból visszaolvasott tananyag ténylegesen elérhető legyen.

## 2. NEM cél

- A teljes lesson pipeline architektúrájának átalakítása.
- A Google OAuth / CSRF autentikációs problémák feloldása.
- A tananyaggenerátor AI-modell logikájának lecserélése.
- A frontend nagymértékű refaktoringja a felhasználói nyomvonal megváltoztatása nélkül.

## 3. Érintett területek

- source/server/studio/lesson-pipeline-routes.ts
- source/server/studio/step-runner.ts
- source/server/workflows/engine.ts
- source/server/studio/one-step-progress.ts
- source/tests/lesson-pipeline-runner.test.ts

## 4. Rögzített döntések és kényszerek

- A generikus hibaüzenetet a háttérfutás hibájának valódi okától el kell különíteni.
- A végállapot előfeltétele az, hogy a pipeline valódi `done` / `parked` állapotából az API a megfelelő `phase` és `detail` adatokat adja vissza.
- A könyvtáron belüli worklow mechanizmus nem szabad, hogy a helyes végállapotot hamis „error” állapotra kényszerítse.
- A javítás minimális, célzott és a meglévő DB/flow szerződést megtartja.

## 5. Edge case-ek

- A run a pipeline végén megy `done`-ba, de a published lesson row/HTML fájl hiányzik.
- A run `parked` státuszban van a forrásellenőrzés miatt, és a frontend ezt a parkolási állapotként kell megjelenítse.
- A run részben zárult és a `runOneStep` külső catch blokkja generikus hibát ír be, miközben a job ténylegesen már a végső állapotban van.
- A `readPublishedLesson` hívás sikertelen ugyanazon a runen, miközben a job már publikált lecke mellett van.

## 6. Elfogadási kritériumok (EARS)

- WHEN a one-step run reaches a valid terminal `done` state THEN the system SHALL return a successful progress payload with `phase: "done"` and a valid `lessonId`/`htmlFileId` instead of a generic error.
- WHEN the one-step run is intentionally `parked` by the map review gate THEN the system SHALL keep the `phase` as `parked` and SHALL NOT convert it into a generic error.
- WHEN the background task catches an error after a terminal state is already persisted THEN the system SHALL avoid overwriting the correct final state with the generic “Váratlan hiba történt” message.
- WHEN the final published lesson cannot be read back THEN the system SHALL surface the real root cause, not a misleading generic error.

## 7. Tesztterv

- A meglévő `source/tests/lesson-pipeline-runner.test.ts` horizontális workflow tesztek ellenőrzik a valid végállapot és a pipeline követő viselkedését.
- A kört kiegészítő célzott tesztet kell adni a one-step végállapot konzisztenciájához, ha a hibagyök okozott regressziót mutat.

## 8. Kockázatok / visszavonási terv

- Kockázat: a végállapot helyes tényének túlzott védelme a tényleges hiba elrejtését okozza.
- Visszavonás: a fix csak a terminal-state overwrite és a readback ellenőrzés köré szorítkozik; a szokásos pipeline flow változatlan marad.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-09-14-one-step-termination-vegrehajtas.md`
