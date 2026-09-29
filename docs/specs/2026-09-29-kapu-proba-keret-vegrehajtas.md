# Végrehajtási utasítás: kapu, Próba és keret (2026-09-29)

Terv: `docs/specs/2026-09-29-kapu-proba-keret.md`. Ág: `fix/kapu-proba-keret` (alap: `origin/main` 48d83f3).

1. **Tesztek ELŐBB:**
   - `tests/lesson-arc.test.ts`: új teszt a `disableUnreachableProba`-ra (csak a 0 < kérdés < küszöb szakasz kapcsol ki; a többi érintetlen).
   - `tests/lesson-pipeline-runner.test.ts`: E1 (limit, csak `proba_unreachable` → publikál, nincs szerzői kör) és E2 (`executeWorkflow` elfogyott szerzői kerettel → tiszta hiba).

   Futtatás, és igazolás, hogy a régi kódon buknak.
2. **Kód:**
   - `shared/lesson-arc.ts`: a `disableUnreachableProba`, az ív-mérés küszöbével azonos (`minChecksForProba` / `DEFAULT_REWARD_POLICY`).
   - `server/studio/step-runner.ts` `runGate`:
     - a kikapcsolás a `checkCoverageGate` előtt;
     - a célzott javítás keret-feltétele;
     - tiszta `fail`, ha nincs keret.
3. **Kapuk:** tsc ×2, lint, teljes unit-suite, build.
4. **Élő újramérés** a `web-live-oszt4-25.local.mts`-sel. Utána merge, deploy, ellenőrzés.

## Utómérés és review (#143) — végrehajtás
1. **Tesztek ELŐBB** (`tests/lesson-pipeline-runner.test.ts`), mindegyik a változás előtt bukjon:
   - „utómérés … a limit ELŐTT … nem kapcsol ki”: 0. kör, jutalomküszöb alatti Próba → `next: author`, nincs `probaDisabled`;
   - „review #143 (P2) … elfogyott szerzői kerettel … kikapcsol és publikál”: 0. kör, `executeWorkflow` kimerített szerzői kerettel;
   - „review #143 (P2) … más kapu-lelet → tiszta hiba”: ugyanígy, megalapozatlan címkével → `fail` „nincs több lépéskeret”.
2. **Kód** (`server/studio/step-runner.ts` `runGate`):
   - `repairBudget` = author, animator, lektor és gate látogatási keret > 0, a kapu elején;
   - `noAuthorRepair` = `round >= MAX_AUTHOR_ROUNDS || !repairBudget`;
   - a Próba-kikapcsolás csak `noAuthorRepair` esetén;
   - a limit előtti kapu→szerző átmenet kerettel, különben tiszta `fail`;
   - a limitkori célzott javítás ugyanezt a `repairBudget`-et használja.
3. **Kapuk:** tsc ×2, lint, teljes unit-suite, build.
