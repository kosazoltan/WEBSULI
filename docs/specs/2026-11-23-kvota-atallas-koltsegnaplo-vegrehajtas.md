# Végrehajtás — kvóta-átállás költségnapló (terv: `docs/specs/2026-11-23-kvota-atallas-koltsegnaplo.md`)

1. RED: `source/tests/quota-failover-cost-log.test.ts` — `QuotaFailoverProvider` stubokkal (kvótahiba → tartalék usage-dzsel),
   `withQuotaFailover` (OpenAI SDK-alakú usage), memória-út, nem-kvóta hiba, munkafolyamat-futáson belüli könyvelés
   (`executeWorkflow` + memóriás store), kulcs-szivárgás tiltása.
   Parancs: `cd source && node --import tsx --test tests/quota-failover-cost-log.test.ts` → elvárt: BUKIK (a modul nincs).
2. `source/shared/lesson-workflow.ts`: `QuotaFailoverRecord` típus; `WorkflowVisit.failover?`; `WorkflowView.quotaFailovers?`.
3. `source/server/workflows/engine.ts`: `workflowQuotaFailover(event)` — futáson kívül no-op; futásban az utolsó látogatás
   `failover` összegzője + `view.quotaFailovers` (max. 50), `persist`; hiba → `logger.warn`, nem dob.
4. `source/server/ai/quota-failover-log.ts`: `recordQuotaFailover`, `quotaFailoverCounters`, `resetQuotaFailoverCountersForTest`,
   `usageTokens(result)` (OpenAI SDK / `AIResponse` alak).
5. `source/server/ai/studio-provider.ts`: a `QuotaFailoverProvider.chat` / `.streamChat` memória-ága és a `withQuotaFailover`
   minden tartalékhívása a `recordQuotaFailover`-en át megy (`trigger`, `path`, tokenek, `ok`/`error`).
6. GREEN: ugyanaz a parancs → minden teszt zöld; plusz `tests/ai-quota-failover.test.ts`, `tests/quota-failover-direct.test.ts`,
   `tests/lesson-workflow.test.ts` zöld.
7. Kapuk: `npm run gate:stage`, `npm run gate:push`, `node scripts/qa/gates/local-review.mjs`, `npm run gate:pr -- --body-file <leírás>`.
