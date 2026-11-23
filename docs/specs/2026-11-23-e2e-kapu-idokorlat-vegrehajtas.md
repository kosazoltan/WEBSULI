# Végrehajtás — e2e kapu időkorlát (terv: `docs/specs/2026-11-23-e2e-kapu-idokorlat.md`)

1. `source/scripts/run-e2e-tests.ts`: `playwrightTimeoutMs(env)` — `WEBSULI_E2E_TIMEOUT_MIN` (pozitív szám) vagy 60 perc.
2. `scripts/qa/gates/pre-pr-gate.mjs`: `E2E_HARNESS_TIMEOUT_MIN = 150`, `E2E_EXEC_TIMEOUT_MS = 160 perc`; az e2e `exec` env-je a változót viszi.
3. `scripts/qa/gates/pre-pr-gate.test.mjs`: korlát-sorrend + a harness / kapu kötés forrásőre.
4. Kapuk: `node --test scripts/qa/gates/pre-pr-gate.test.mjs`, `npm run gate:lint`; PR.
