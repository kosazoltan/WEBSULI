# Végrehajtás: Dinamikus javítási keret

Spec: `docs/specs/2026-09-30-dinamikus-keret.md`. Munkakönyvtár: `source/`. Ág: `feat/dinamikus-keret`.

1. `shared/lesson-workflow.ts`: `WorkflowView.repairGrants?: Array<{ reason: string; at: number }>`.
2. `server/workflows/engine.ts`:
   - `REPAIR_BUDGET_GRANTS = 2`, `REPAIR_PATH = ["author", "animator", "lektor", "gate"]`;
   - `workflowEnsureRepairBudget(reason)`: kontextus nélkül `true`; ha a javítóúton nincs elfogyott lépés → `true`; ha a futás
     már 2 többletkeretet kapott → `false`; különben az elfogyott lépések `maxVisits` +1 a futás definíciójában,
     `repairGrants` bővül, `persist`, `logger.warn`, és igaz, ha most minden javítóút-lépésnek van kerete;
   - `workflowRepairBudgetAvailable()` (review #154): ugyanez fogyasztás nélkül (van keret, vagy még igényelhető).
3. `server/studio/pipeline.ts`: `TARGETED_REPAIR_ROUNDS = 3`; `MAX_CHAIN_STEPS += 4 × TARGETED_REPAIR_ROUNDS`.
4. `server/studio/step-runner.ts`:
   - lektor-limit tényhiba: `targets && !targetedLektorRepairRound && await workflowEnsureRepairBudget("lektor: …")`;
   - kapu, limit: `gateRepairBudget = targets && !targetedGateRepairRound && (repairBudget || await workflowEnsureRepairBudget("kapu: …"))`;
     a hibaüzenet „(a célzott javításhoz nincs több lépéskeret)” csak akkor, ha a többletkeret sem jött;
   - kapu, limit előtt: `transition.step === "author" && !repairBudget && !(await workflowEnsureRepairBudget(…))` → tiszta hiba;
   - tanári kérés: `!instructionRepairRound && (repairBudget || await workflowEnsureRepairBudget(…))` — a limiten is;
   - a Próba kikapcsolása: `noAuthorRepair = round ≥ MAX || !(repairBudget || workflowRepairBudgetAvailable())`.
5. Tesztek (`tests/lesson-pipeline-runner.test.ts`): `withExhaustedAuthor(…, { grantsUsed, thenAuthor })` és
   `exhaustRepairGrants()` segéd; `review #143 (P2)` (két teszt: kapu-lelet és Próba), `spec kapu-proba (E2)`, `tanári kérés …
   a limiten` — mindegyik a többletkeretes ágat (és a motor szerző-engedélyét) ÉS a keret elfogyása utáni tiszta hibát/
   kikapcsolást is méri.
6. Parancsok és elvárt kimenet: `npx tsx --test tests/lesson-pipeline-runner.test.ts` → 103/103; `node --import tsx --test
   "tests/*.test.ts"` → mind zöld; `npx tsc --noEmit -p .` és `-p tsconfig.test.json` → 0 hiba; eslint → 0 hiba.
