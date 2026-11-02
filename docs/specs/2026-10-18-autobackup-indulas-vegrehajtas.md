# Automatikus mentés induláskor — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-autobackup-indulas.md`. Munkakönyvtár: `source/`. Ág: `fix/autobackup-indulas`.

1. **`server/lib/backup-startup.ts` (új):**
   - `export const STARTUP_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000`;
   - `export function shouldBackupOnStartup(files: { name: string; mtimeMs: number }[], nowMs: number, maxAgeMs = STARTUP_BACKUP_MAX_AGE_MS): boolean`.
   - Csak a `backup_` kezdetű, `.json` végű nevek számítanak. Ha bármelyikre `nowMs - mtimeMs < maxAgeMs`, akkor
     `false` (a jövőbeli `mtime` is ide tartozik).
2. **`server/autoBackup.ts`:**
   - **Cron:** a `cron.schedule` harmadik paramétere `{ timezone: 'Europe/Budapest' }`.
   - **Az induló `setTimeout` törzse:**
     - `fs.readdir(BACKUP_DIR)`, majd a `backup_*.json` fájlokra `fs.stat` (a meglévő `getSafeBackupPath`-szal);
     - hibánál üres lista;
     - ha a `shouldBackupOnStartup(...)` hamis → `logger.info` (a „friss mentés van, induló mentés kihagyva” értelmű
       üzenet), és nincs mentés; különben a mostani `createAutoBackup('scheduled')`.
3. **`tests/backup-startup.test.ts` (új, `node:test`):**
   - üres lista → igaz;
   - csak régi (25 órás) mentés → igaz;
   - 1 órás `backup_x.json` → hamis;
   - friss, de nem `backup_` nevű / nem `.json` fájl → igaz;
   - jövőbeli `mtime` → hamis;
   - egyedi `maxAgeMs` működik.
   - Forrás-őr (`readFileSync`): az `autoBackup.ts` tartalmazza a `timezone: 'Europe/Budapest'` szöveget és a
     `shouldBackupOnStartup(` hívást.
4. **Ellenőrzés:** `npm.cmd run check`, `npm.cmd run check:test`, `npx.cmd eslint server/autoBackup.ts server/lib/backup-startup.ts tests/backup-startup.test.ts`,
   célzott `node --import tsx --test tests/backup-startup.test.ts` (vagy a repó tesztfuttatója), majd `npm.cmd test`.
5. **Reverz mutáció:** a `shouldBackupOnStartup` mindig `true` → a „1 órás mentés” teszt bukjon.
