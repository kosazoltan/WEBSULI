# Okosítás / javítás fázisjelző — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-okositas-fazisjelzo.md`. Munkakönyvtár: `source/`. Ág: `fix/okositas-fazisjelzo`.

1. **`client/src/components/studio/WorkflowPhaseBar.tsx`:** `WorkflowPhaseBar({ id, sticky?, title? })`.
   - **Adat:** a `useQuery` kulcsa `["/api/studio/workflows", id]` (közös a `WorkflowMonitor`-ral, ugyanaz a cache).
   - **Lépések:** `<ol>` a `run.definition.steps`-ből, a `workflowStepDisplay` állapotával; `data-testid="phase-bar"`, a lépéseken
     `data-step` és `data-state`.
   - **Összefoglaló:** a `WORKFLOW_STATE_LABELS[run.state]`, az aktuális lépés címkéje, a kör és az eltelt perc
     (`Date.now() - run.createdAt`).
   - **Hiba:** a `run.error` vagy az utolsó hibás látogatás `error`-ja egy `<details>`-ben.
   - **Ragadósság:** `sticky top-0 z-20` + átlátszatlan háttér, ha `sticky`.
2. **`client/src/components/MaterialImprover.tsx`:**
   - A gyökér előtt (a 70%-os zoomon KÍVÜL, hogy olvasható maradjon) egy ragadós sáv: a `workflowId` vagy a lista első
     `processing` sorának azonosítója; több futó sornál mindegyiké.
   - A hibás sorok cellájában a megállás lépése: egy kis `WorkflowPhaseBar` a sor kinyitásakor.
   - A meglévő `WorkflowMonitor` marad (részletes gráf).
3. **`client/src/components/LessonRepairPanel.tsx`:** futás közben és hibánál a `WorkflowPhaseBar id={jobId}`.
4. **`server/improve-orphans.ts`:**
   - `orphanedImproveIds(rows, now)` — tiszta függvény;
   - `sweepImproveJobs()` — SQL: `improved_html_files` `processing` + `LEFT JOIN lesson_workflow_runs w ON w.id = f.id`.
   - **`server/index.ts`:** a boot-söprés mellett hívja, majd `setInterval(…, 120_000).unref()`; az E2E-mód ág kihagyja.
5. **Tesztek:**
   - `tests/improve-orphans.test.ts` (node:test):
     - élő bérlet → érintetlen;
     - lejárt bérlet → lezár;
     - nincs futás és > 5 perc → lezár, < 5 perc → érintetlen;
     - végállapotú futás → lezár.
   - `tests/phase-bar.spec.ts` + `playwright.phase-bar.config.ts` (vite + próba):
     - az admin `/admin?tab=improve-materials` egy `processing` sorral és egy hozzá tartozó futó munkafolyamattal (ál-adat);
     - a fázissáv látszik, a sorrend és az aktuális lépés helyes, görgetés után is a nézetben (ragadós);
     - 393 × 780 és 835 × 810 nézetben nincs kilógás;
     - hibás futásnál a hibaüzenet kinyitható.
6. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`, az új Playwright-konfig.
