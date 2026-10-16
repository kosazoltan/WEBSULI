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

## Review #256 (P1)
- A `driveTracked` a várakozást (`WorkflowWaiting`) elnyeli, és normálisan tér vissza. Ezért a `driveRemade` minden kör után a job TÉNYLEGES állapotából dönt (`awaitingApproval`), nem a kivételből.
- A tiszta ciklus külön modulba került (`server/studio/remade-drive.ts`, `driveRemadeWith`), egységteszttel (`tests/remade-drive.test.ts`). A teszt hamis `drive`-ja a valódihoz hasonlóan elnyeli a várakozást.
- Ellenpróba: a régi „visszatérés után kilép” logikával 4 teszt bukik.
- Sikertelen gépi jóváhagyásnál a ciklus megáll (nem pörög a lépés-határig).
- Review #256 (P2): a futó jobok listaablaka 2 → 7 nap (a folytatás 7 napig engedélyezett — utána nem tűnhet el a listából).
- Review #256 (P2): a gépi jóváhagyás a lízing alatt friss állapotból ellenőrzi az elvetést (mint az `applyResume`) — a közben törölt piszkozat nem indul tovább.
