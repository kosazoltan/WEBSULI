# Végrehajtás — kapu-javítás utáni csak-bank kör

1. `server/studio/step-runner.ts` (lektor-lépés, `bankRepairPossible`): `let`; a bank-ellenőr eredménye után, ha
   `!bankRepairPossible && fusion && experience && job.output.targetedGateRepairRound === job.round &&
   !job.output.gateBankRepairUsed && bankChecked.notes.length` → `bankRepairPossible = await
   workflowEnsureRepairBudget("kapu-javítás utáni csak-bank kör") && animator/lektor látogatás > 0`; ha igaz, a
   csak-bank kör mentésekor `gateBankRepairUsed: true`.
2. `server/studio/pipeline.ts`: `MAX_CHAIN_STEPS` + 3 (animator → lektor → gate).
3. Teszt (`tests/lesson-pipeline-runner.test.ts`, új): a célzott kapu-javítás körében, elfogyott csak-bank körökkel, bankhibával
   → következő lépés `animator`; második alkalommal (már használt) → nem jár.
4. Ellenőrzés: tsc, eslint, teljes unit; status-fájl sor.
