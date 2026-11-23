# Végrehajtás — e2e kapu időkorlát (terv: `docs/specs/2026-11-23-e2e-kapu-idokorlat.md`)

1. `source/scripts/run-e2e-tests.ts`: `playwrightTimeoutMs(env)` — `WEBSULI_E2E_TIMEOUT_MIN` (pozitív szám) vagy 60 perc.
2. `scripts/qa/gates/pre-pr-gate.mjs`: `E2E_HARNESS_TIMEOUT_MIN = 150`, `E2E_EXEC_TIMEOUT_MS = 160 perc`; az e2e `exec` env-je a változót viszi.
3. `scripts/qa/gates/pre-pr-gate.test.mjs`: korlát-sorrend + a harness / kapu kötés forrásőre.
4. Kapuk: `node --test scripts/qa/gates/pre-pr-gate.test.mjs`, `npm run gate:lint`; PR.

## Végrehajtási napló

- 2026-11-23 — a kapu teljes egységtesztje bukott: `lesson-clip-worker.test.ts` „átkódolás: az időkorlát SIGKILL-lel él…”. Ok: a
  teszt a valódi `process.memoryUsage().rss`-t olvasta; a teljes futás alatt a folyamat > 300 MB → a memóriaőr kihagyta az átkódolást,
  a hamis exec nem hívódott (`calls[0]` undefined). Reprodukálva 400 MB előfoglalással (javítás előtt 1 bukás, után 0). Javítás: a
  `downloadAndShrink`-hívások a tesztben `rss: () => 0`-t kapnak (a POSIX-teszt mintája).
