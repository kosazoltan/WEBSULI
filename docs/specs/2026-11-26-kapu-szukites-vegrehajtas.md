Terv: `docs/specs/2026-11-26-kapu-szukites.md`

# Végrehajtás — KAPU-SZUKITES

1. Bukó teszt: `scripts/qa/gates/pre-pr-gate.test.mjs` — szűkített mód (alapértelmezés): egy játéknál nincs meta-mérő /
   lejárt-kupon spec; közös motornál csak a változott tövet említő játék-spec; teljes mód (`full: true`): a régi kiválasztás.
2. Kód: `pickE2eSpecs({ …, full })`; a `main()` a `GATE_E2E_FULL=1` környezeti változót vagy a `gates.config.json` `e2eFull`
   kulcsát adja át. A kapu naplója jelzi a módot („szűkített — teljes kör a CI-ben”).

Állapot: KAPU-SZUKITES 3/3 egység kész — következő: kapulánc, PR
