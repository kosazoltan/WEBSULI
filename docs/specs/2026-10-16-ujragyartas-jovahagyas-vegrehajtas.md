# Újragyártás jóváhagyása — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-16-ujragyartas-jovahagyas.md`.

## Szerver (`server/studio/lesson-pipeline-routes.ts`)
1. `autoApproveOutline(jobId): Promise<"approved" | "retry" | "failed">`:
   - a `driveOneStep` approve-ágának logikája (`approveOutline` → `autonomousDecision` → `retryOutlineRound` / `forceApproveOutline`);
   - a `driveOneStep` ezt hívja, a haladásjelző-frissítései változatlanok.
2. `driveRemade(jobId, owner)`:
   - első kör: `driveTracked(jobId, owner, true)`;
   - `WorkflowWaiting` után: ha `decideOneStepAction` = `approve`, akkor `driveTracked(jobId, owner, false, async () => autoApproveOutline(...))` (a lízing alatt), legfeljebb `MAX_CHAIN` körben;
   - `retry` esetén a pedagógus újra fut, a következő várakozásnál újra jóváhagy;
   - `failed` → `WorkflowWaiting` (megáll, a lista mutatja).
   - A `remanufactureFromMap` ezt indítja a mostani `driveTracked(..., true)` helyett.
3. `ownerDrafts`: új ág a tervre váró saját jobokra:
   - feltétel: `status = 'ok' AND step = 'author' AND output ? 'outline' AND NOT output ? 'approvedOutline'`, 7 napon belül, a workflow gazdája a belépett admin;
   - mezők: `awaitingApproval: true`, `running: false`, `resumable: false`.
   - A `ownerDraftTotal` ugyanezzel bővül.
4. `POST /drafts/:jobId/continue`:
   - csak saját, tervre váró job;
   - `void driveRemade(...)` → 202; egyébként 409.
5. `discardDraft`: a tervre váró saját job is elvethető (`status = 'ok'` és tervre vár, nincs élő lízing).

## Kliens (`DraftLessons.tsx`)
- `awaitingApproval` → jelvény „A tanulási terv jóváhagyására vár”, gomb „Folytatás (a terv jóváhagyásával)” és Törlés.
- Siker után 60 s követés (mint a folytatásnál).

## Tesztek
- DB:
  - a tervre váró saját job a listában (`awaitingApproval`), a másik adminé nem;
  - elvethető;
  - a `continue` jogosultsági feltétele.
- Egység: az `autoApproveOutline` döntése mockolt approve-eredményekkel. Ha nehezen izolálható, a `driveOneStep` meglévő tesztjei maradnak zöldek.
- Böngésző: a tervre váró tétel jelvénye és gombja, egy kérés.
