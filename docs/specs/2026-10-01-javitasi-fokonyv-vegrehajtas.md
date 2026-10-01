# Végrehajtás — egységes javítási főkönyv

1. `server/studio/pipeline.ts`: `REPAIR_KINDS` (bankOnly 2 × [animator, lektor, gate], dinamikus nem; gateBank 1 × ugyanaz, dinamikus;
   targetedGate / targetedLektor / instruction 1 × [author, animator, lektor, gate], dinamikus); `MAX_BANK_ONLY_ROUNDS` = táblából;
   `REPAIR_CHAIN_STEPS` = Σ limit × lépésszám; `MAX_CHAIN_STEPS` ebből; `TARGETED_REPAIR_ROUNDS` megszűnik.
2. `server/studio/repair-ledger.ts`: `repairUse` / `repairUsed` / `repairRemaining` / `repairSpentForRound` (főkönyv, különben régi
   mezők), `spendRepair(output, kind, round)` (főkönyv + régi tükör), `canSpendRepair(output, kind, reason, budget?)`,
   `ensureRepairPath(reason, budget?)` (a nem-limitált szerzői javítókörhöz).
3. `server/studio/step-runner.ts`: a csak-bank kör, a kapu-bankkör, a lektor-tényhiba, a kapu-lelet és a tanári-kérés javítás
   döntése és írása a főkönyvön át; a „javítókör a limit előtt” út az `ensureRepairPath`-on át.
4. Tesztek: `tests/repair-ledger.test.ts` (régi mezők, tükör, limit, látogatás, dinamikus keret, lánc-képlet, forrás-ellenőrzés:
   a step-runner nem olvas/ír régi jelzőt közvetlenül). Teljes unit, visszajátszás, lint, tsc.
