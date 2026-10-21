# 2. ciklus — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus2-halott-futas-ragos-alak.md`.

1. **`server/studio/legacy-migration.ts`:**
   - `LegacyJobState.jobFailed`;
   - `reconcileLegacy`: ha `jobFailed && !leaseAlive`, a futás befejezettnek számít (nincs `STALE_MS`-várakozás);
   - a tick a jobállapotból tölti ki.
2. **`server/studio/step-io.ts` `buildLektorPrompt`:** a „Javítás iránya” szabály kiegészítése a ragos alakra (`requiredPhrases`).
3. **Teszt:**
   - `reconcileLegacy` (a hibás job + lejárt bérlet → újrapróba azonnal);
   - a lektor-prompt tartalmazza a ragos szabályt.
4. **Korlát:** a tényleges sorelemszám + 5.
