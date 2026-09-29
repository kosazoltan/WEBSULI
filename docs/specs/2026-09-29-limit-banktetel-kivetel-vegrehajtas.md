# Végrehajtási utasítás: körlimiten maradt banktétel-hiba kivétele (2026-09-29)

Terv: `docs/specs/2026-09-29-limit-banktetel-kivetel.md`. Ág: `fix/limit-banktetel-kivetel` (alap: `origin/main` f7eb197).

## Lépések
1. **Tesztek ELŐBB** (`source/tests/`):
   - új `bank-item-ref.test.ts` (E1);
   - a `lesson-pipeline-runner.test.ts`-ben új tesztek E2, E3 és E4-re;
   - a két dokumentált teszt elvárásának igazítása (spec 4. döntés).

   Futtasd, és igazold, hogy a régi kódon buknak.
2. **Kód:**
   - `source/shared/lesson-experience.ts`: `LESSON_BANK_RESERVE`; `source/shared/lesson-bank-plan.ts` `bankUnitQuota`: a cél `SIZES + RESERVE`.
   - `source/server/studio/bank-verifier.ts` vagy új `source/shared/bank-item-ref.ts`: `bankItemRef(path): { bank: "quiz" | "methods" | "tasks"; index: number } | null` és `bankItemPath(ref)` (zárójeles alak).
   - `source/server/studio/step-runner.ts`, lektor-ág (a `fail` előtt): ha `blockers > 0 && round >= MAX_AUTHOR_ROUNDS && fusion && !bankOnlyRepair && bankOnly`, és minden blokkoló `bankItemRef`-fel feloldható, akkor:
     - a `choiceFlags` bővül;
     - `logger.warn` a kivételre jelölt tételekkel;
     - NINCS `fail`, a meglévő `nextStep` a kapura visz.
   - `resolveChoiceGate`: `bankItemRef` alapú csoportosítás, a `tasks` szűrése, és a „removed” útvonalak normalizált formában.
   - 7.4 bizonyíték (`runGate`): a `classifyNotes(report.notes)` blokkolói közül azok megengedettek, amelyek `bankItemRef`-je a `removed` halmazban van.
3. **Kapuk:** tsc ×2, lint, teljes unit-suite, build.
4. **Élő újramérés:** a `web-live-oszt4-25.local.mts` újrafuttatása (új job), a `done` állapot és a publikált lecke, valamint a kivett tételek naplóbeli megléte.
5. Atomi commitok, push, PR, CI, merge, deploy-ellenőrzés.
