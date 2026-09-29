# Végrehajtási utasítás: limitkori check-blokk kivétel (2026-09-29)

Terv: `docs/specs/2026-09-29-limit-check-kivetel.md`. Ág: `fix/limit-check-kivetel` (alap: `origin/main` 1785be0).

1. **Tesztek ELŐBB:**
   - `tests/bank-item-ref.test.ts` (E1);
   - `tests/lesson-pipeline-runner.test.ts` (E2, a meglévő `limitSetup` bővítve egy lecke-módosító paraméterrel).

   Futtatás, és igazolás, hogy a régi kódon buknak.
2. **Kód:**
   - `shared/bank-item-ref.ts`: `checkBlockRef` és `checkBlockPath`.
   - `server/studio/step-runner.ts`: `limitBankFlags` (check is), `resolveChoiceGate` (limit-eredetű check-kivétel, szakaszonként több blokk), 7.4 `unresolvedBlocker` (a kivett check blokk).
3. **Kapuk:** tsc ×2, lint, teljes unit-suite, build.
4. **Élő újramérés** a `web-live-oszt4-25.local.mts`-sel; utána merge, deploy és ellenőrzés.
