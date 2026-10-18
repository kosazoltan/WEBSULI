# Admin-maradványok kivezetése — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-legacy-maradvanyok.md`. Munkakönyvtár: `source/`. Ág: `chore/legacy-maradvanyok`.

1. **`server/ai/models.ts`:**
   - a 7 kulcs törlése a `LEGACY_MODELS`-ből és a `TASK_EFFORT`-ból;
   - ha van kulcsonkénti env-név vagy kulcs-térkép, ott is.
2. **`server/scripts/checkAIConfig.ts`:** a 7 felirat törlése.
3. **Tesztek:**
   - `tests/ai-model-routing-complete.test.ts` és `tests/models-routing.test.ts`: a törölt kulcsok helyett `improve` /
     `quizGenerator` / `webResearch`;
   - az env-felülírás tesztje a `quizGenerator` saját env-nevével.
4. **`server/index.ts`:** az `aiLimiter` definíciója és a két `app.use("/api/ai/", …)` törlése, valamint az import.
5. **`server/lib/ai-payload-guard.ts` és `tests/ai-payload-guard.test.ts`:** törlés (más nem használja — `grep`).
6. **`server/lib/body-limits.ts`:** a `/api/ai/` bejegyzés törlése, a `tests/body-limits.test.ts` igazítása.
7. **`server/routes.ts`:**
   - a CSRF-kivétel feltételéből a `path.startsWith('/api/ai/')` kikerül;
   - a `tests/csrf-origin.test.ts` és a `tests/client-csrf-guard.test.ts` kivétellistája igazodik.
8. **`server/routes.ts`:** a három `file-backups` végpont törlése, és a `listBackups` / `readBackup` import, ha másutt nem kell.
   - A `server/autoBackup.ts`-ből a csak általuk használt két export törlése.
   - Az s7-őr engedélylistájából a `/file-backups/restore/:filename` bejegyzés törlése.
9. **Ellenőrzés:**
   - `grep -rn "htmlFixStream\|claudeHtml\|chatgptChat\|aiPayloadGuard\|file-backups" server shared client/src tests` → 0;
   - `tsc`, `check:test`, `eslint`, `npm.cmd test`, `build`.
