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
