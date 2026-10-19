# Erőforrás S2b — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-eroforras-s2b.md`. Munkakönyvtár: `source/`. Ág: `perf/s2b-mentes-megorzes-index`.

1. **`server/lib/backup-startup.ts`:** új tiszta függvény `startupBackupDisabled(env = process.env): boolean` → `env.RENDER === "true"`.
   - **`server/autoBackup.ts` `startAutoBackupJob`:** az induló `setTimeout` elején, ha igaz: naplóz (indok: nincs tartós lemez,
     a napi mentés marad), és visszatér.
2. **`migrations/0036_workflow_resource_id.sql`:**
   - `ALTER TABLE … ADD COLUMN IF NOT EXISTS resource_id varchar GENERATED ALWAYS AS (snapshot->>'resourceId') STORED;`
   - `--> statement-breakpoint`
   - `CREATE INDEX IF NOT EXISTS lesson_workflow_resource_id ON lesson_workflow_runs(resource_id);`
3. **Lekérdezések:** minden `snapshot->>'resourceId'` → `resource_id` a `server/studio/lesson-pipeline-routes.ts`-ben (az aliasokkal:
   `w.`, `ow.`, `lw.`) és a `server/workflows/store.ts`-ben.
   - A teszteket nem gyengítjük; a `tests/lesson-draft-db.integration.ts` saját lekérdezése maradhat.
4. **Tesztek:**
   - `tests/resource-s2b.test.ts`: `startupBackupDisabled` (RENDER=true → igaz; hiányzik → hamis);
   - a szerverkódban nincs több `snapshot->>'resourceId'`;
   - a migráció tartalmazza a generált oszlopot és az indexet.
   - DB-integráció: `npm run test:learning-db`, eldobható Postgres.
5. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`, `test:learning-db`.
6. **Kitelepítés:** összevonás előtt az aktív-futás őr = 0 (a migráció rövid táblazárat kér). Utána csak olvasó `EXPLAIN ANALYZE`
   mérés élesen.

## Review #328 — pontosítás
- **Korlátos zárvárakozás:** a migráció első utasítása `SET LOCAL lock_timeout = '5s'` (a futtató fájlonként tranzakcióban
  fut). Ütköző hosszú tranzakciónál a build gyorsan bukik, és a régi példány fut tovább; nem akad el.
- **Az induló mentés döntése:** a `runStartupBackup(deps)` (`server/lib/backup-startup.ts`) viszi, a listázást és a mentést
  befecskendezve kapja. A teszt viselkedésszintű:
  - Render → nincs lista, nincs export;
  - friss mentés → kimarad;
  - olvashatatlan lista → mentés.
