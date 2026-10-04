# Végrehajtás — kapu-bankkör holtzóna

1. `server/studio/step-runner.ts` lektor-ág: a `gateBankRound` feltételében `repairRemaining(job.output, "bankOnly") === 0`
   helyett `!bankRepairPossible` (a rendes csak-bank kör most nem költhető el: limit VAGY látogatás). A többi feltétel
   (fúzió, experience, `repairSpentForRound(targetedGate, job.round)`, `repairRemaining(gateBank) > 0`, bankhiba) változatlan;
   a komment a 2026-10-04-es specre hivatkozik.
2. `tests/lesson-pipeline-runner.test.ts`: két új `executeWorkflow`-os teszt a mért esetre (run fade891d): animator-látogatás
   kimerítve, `bankOnlyRepairRounds: 1`, `targetedGateRepairRound = round`; (a) 1 grant maradt → animator, `gateBankRepairUsed`,
   `bankOnlyRepairRounds` változatlan 1; (b) mindkét grant elhasználva → gate, `gateBankRepairUsed` nincs.
3. Teljes unit (benne limit-replay), tsc main+test, lint.
