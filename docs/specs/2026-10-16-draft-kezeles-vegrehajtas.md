# Piszkozatok kezelése — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-16-draft-kezeles.md`.

## Szerver
1. `server/studio/recovery-sweep.ts` `recoveryCandidate`: `recoveryState === "discarded"` → „elvetve” (nem folytatja).
2. `server/studio/lesson-pipeline-routes.ts`:
   - `resumableDraftFor` és `ownerDrafts` kizárja a `discarded` állapotot.
   - `ownerDrafts(owner)`:
     - a saját ÉS a gazdátlan (nincs workflow-sor) megállt piszkozatok, mezők: `ownerless`, `hasPublished` (ugyanabból a térképből publikált lecke van), `step`;
     - futó saját gyártások (`status` pending/running, 2 napon belül, lecke nélkül is): `running: true`, `step`.
   - `POST /drafts/:jobId/discard`: a saját vagy gazdátlan, nem futó, nem publikált job `discarded` lesz (feltételes UPDATE; 0 sor → 409).
   - `POST /drafts/discard-published`: a kész párral rendelkező saját vagy gazdátlan megállt piszkozatok elvetése; válasz `{ discarded: n }`.
   - `POST /drafts/:jobId/remake`: a saját vagy gazdátlan, megállt piszkozatra `remanufactureFromMap(jobId, userId, error)`; válasz `{ jobId }`.
3. Közös feltétel-töredék: „saját vagy gazdátlan” = nincs workflow-sor, vagy a legutóbbi workflow gazdája a belépett admin.

## Kliens (`client/src/components/studio/DraftLessons.tsx`)
- A futó tételek elöl: `CreationProgress` a `{ phase: step }` nézettel; a lista `refetchInterval` 5 s, amíg van futó tétel.
- Megállt tétel:
  - `CreationProgress` a `{ phase: "error", stoppedAt }` nézettel;
  - jelvények: „Tananyag draft”, „Kész tananyag már van”, „Gazdátlan”;
  - gombok:
    - Folytatás (ha `resumable` és nem `remanufacture`), különben „Újragyártás ugyanabból a forrásból”, megerősítéssel;
    - „Törlés”, megerősítéssel;
  - minden gomb szinkron zárral.
- A fejlécben a „Kész tananyaggal rendelkező piszkozatok törlése (N)” gomb, megerősítéssel, ha N > 0.

## Tesztek
- DB (`tests/lesson-draft-db.integration.ts`):
  - elvetés: saját és gazdátlan igen, másik admin és futó job nem;
  - a kötegelt elvetés csak a kész párral rendelkezőkre hat;
  - `hasPublished` és `ownerless` jelzés;
  - futó gyártás a listában;
  - az elvetett nem látszik, és a `resumableDraftFor` sem adja vissza.
- Egység: `recoveryCandidate` a `discarded`-ra.
- Böngésző (`tests/admin-draft-lessons.spec.ts`):
  - törlés megerősítéssel, egy kérés;
  - újragyártás gomb a nem folytathatón;
  - kötegelt törlés;
  - futó tétel szakaszjelzővel;
  - 390 és 1366 px.
