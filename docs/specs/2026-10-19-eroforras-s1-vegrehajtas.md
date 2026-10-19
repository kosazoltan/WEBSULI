# Erőforrás S1 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-eroforras-s1.md`. Munkakönyvtár: `source/`. Ág: `perf/s1-idozitok-cache-deploy`.

1. **Időzítők:**
   - `server/scheduledPublishing.ts`: `cron.schedule("0 * * * *", …)`.
   - `server/workflows/learning-worker.ts`: `LEARNING_AUDIT_INTERVAL_MS = 30 * 60_000`.
   - `server/studio/lesson-pipeline-routes.ts`: `STUDIO_SWEEP_INTERVAL_MS = 300_000`.
   - `server/improve-orphans.ts`: `IMPROVE_SWEEP_INTERVAL_MS = 300_000`.
   - `server/auth.ts`: `pruneSessionInterval: 60 * 60 * 6`.
   - Ellenőrizd, hogy egy meglévő teszt nem rögzíti-e a régi értéket; ha igen, az dokumentált specváltozás.
2. **`server/studio/single-run/conversation.ts`:** a `system` blokk és a kérés-szintű `cache_control` is
   `{ type: "ephemeral", ttl: "1h" }`.
   - Ha a típus nem engedi, a meglévő `as Anthropic.MessageStreamParams` maradjon.
   - Teszt: a kérés alakja hamis klienssel.
3. **`server/workflows/engine.ts`:**
   - modulszintű `let active = 0`;
   - `export const activeWorkflowRuns = () => active`;
   - az `executeWorkflow` törzse `active++` / `finally active--`.
   - `export async function waitForActiveRuns(maxMs, poll = 2000, now = Date.now, sleep)` — tiszta, tesztelhető.
4. **`server/index.ts` graceful shutdown:**
   - `server.close()` után előbb `await waitForActiveRuns(280_000)` (naplózza, hány futásra vár), utána a meglévő flush és
     `dbPool.end()`;
   - a kényszerítő időkorlát 30 s → 295 s.
5. **Tesztek:**
   - `tests/resource-s1.test.ts`: az időzítő-konstansok; a `waitForActiveRuns` 0 futásnál azonnal tér vissza, futásnál a
     határidőig vár; a beszélgetés kérésében `ttl: "1h"`.
6. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
7. **Kitelepítés:**
   - összevonás előtt a csak olvasó őr (aktív futás = 0);
   - utána Render API: `maxShutdownDelaySeconds = 300` és a build-szűrő;
   - mérés után a Neon-endpoint minimuma 0,25 CU.
