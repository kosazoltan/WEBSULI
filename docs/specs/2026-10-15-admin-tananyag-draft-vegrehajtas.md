# Admin „Tananyag draft” — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-15-admin-tananyag-draft.md`.

## Szerver (`source/server/studio/lesson-pipeline-routes.ts`)
1. A futásnézet (`oneStepRunView`) hiba- és draft-ágából kiemelt, közös `jobStopInfo(job, visits, executions)`:
   - kimenet: `resumable`, `stoppedAt`, `resumeKind`, `nextRecovery`;
   - a nézet és a lista ugyanazt használja (egy szabály).
2. `export async function ownerDrafts(owner: string)`: SQL a `studio_jobs` ⋈ `lessons` ⋈ `knowledge_maps` táblákon, a gazdát a workflow adja. Szűrés:
   - `j.output ? 'lesson'`;
   - `l.published_at IS NULL`;
   - `j.status <> 'ok'`;
   - `recoveryState` nem `superseded` / `remanufactured` / `remanufacturing`.

   Rendezés `created_at DESC`, `LIMIT 50`. Tételenként:
   - `{ jobId, title, subject, classroom, draft: draftSummaryOf(...), running, error, updatedAt, resumable, stoppedAt, resumeKind, nextRecovery }`;
   - a cím a lecke címe (`output.lesson.title`), ha nincs, a térképé;
   - a látogatások a job saját workflow-jából (`workflowVisitsOfJob`).
3. `lessonPipelineRouter.get("/drafts")`: a `req.user.id` piszkozatai (`{ drafts }`). A router már admin-védett.

## Kliens
- Új `client/src/components/studio/DraftLessons.tsx`:
  - `useQuery(["/api/studio/drafts"])`; üres listánál semmit nem renderel;
  - kártyánként: „Tananyag draft” jelvény (`data-testid="draft-badge"`), cím, tárgy és évfolyam, „N fejezetnyi tananyag, M kész gyakorlócsomag”;
  - megállásnál az ok és a következő lépés; futónál „Folyamatban”;
  - „Folytatás a megszakadt ponttól” (`data-testid="draft-resume-<jobId>"`): `POST /api/studio/jobs/:id/resume`, szinkron zárral, siker után a lista frissül.
- `client/src/pages/admin.tsx` `AdminFilesTab`: a `DraftLessons` a fájllista FÖLÖTT.

## Tesztek
- `tests/lesson-draft-db.integration.ts`:
  - A1: saját, megállt piszkozat a listában, számokkal;
  - A2: publikált, félretett, sikeres, más gazdájú kizárva;
  - futó job `running: true`.
- Böngésző, `tests/admin-draft-lessons.spec.ts` (mockolt API):
  - jelvény, gomb, egy kérés dupla kattintásra;
  - futó draft gomb nélkül;
  - 390 és 1366 px overflow-ellenőrzés.

## Review #251
- Ha a tervező következő foka `remanufacture` (a resume végpont ÚJ jobot indít), a kártyán „Újragyártás ugyanabból a forrásból” gomb van, megerősítő lépéssel; „Folytatás” felirat nem jelenik meg.
