# Automatikus mentés — nincs új mentés minden szerverinduláskor (kanban #187)

## Probléma
A `server/autoBackup.ts` `startAutoBackupJob()`-ja minden indulás után 5 másodperccel feltétel nélkül teljes mentést ír
(`createAutoBackup('scheduled')`). Deployonként és újraindításonként így egy teljes adatbázis-export készül, akkor is, ha
percekkel korábban már volt egy. A napi cron (`0 2 * * *`) időzóna nélkül fut, vagyis a szerver UTC-idejében, nem
budapesti hajnali 2-kor.

## Cél
- **Induláskor:** csak akkor készüljön mentés, ha a mentéskönyvtárban 24 órán belül nem készült `backup_*.json`.
- **A napi cron:** `Europe/Budapest` időzónában fut.

## Nem-cél
- A mentés formátuma, a megőrzés (`BACKUP_RETENTION_DAYS`), az eseményalapú mentés és a visszaállítás nem változik.
- Külső tárolóra mentés.

## Megoldás
- **Új tiszta függvény:** `server/lib/backup-startup.ts` → `shouldBackupOnStartup(files, nowMs, maxAgeMs)`.
  - Bemenet: `{ name, mtimeMs }` lista.
  - Igaz, ha nincs `backup_` kezdetű, `.json` végű fájl `maxAgeMs`-en belül.
- **Az indulási ág:** a `startAutoBackupJob` beolvassa a könyvtárat. Olvasási hibánál menteni kell, mert biztonságosabb.
- **Cron:** `cron.schedule(..., { timezone: 'Europe/Budapest' })`.

## Edge case-ek
- Üres vagy nem létező könyvtár → mentés.
- Csak régi (> 24 óra) mentés → mentés.
- Más nevű fájlok (pl. `.gitkeep`) nem számítanak.
- Jövőbeli `mtime` (óraelcsúszás) frissnek számít, ezért nincs mentés. Ez elfogadható, mert a napi cron úgyis ment.
- Efemer lemez (Render): deploy után üres a könyvtár → mentés, mint eddig.

## Elfogadás (EARS)
- **Indulás friss mentéssel:** HA a szerver indul ÉS 24 órán belül van `backup_*.json`, AKKOR nem készül induló mentés,
  és ez naplózódik.
- **Indulás friss mentés nélkül:** HA nincs ilyen fájl, AKKOR 5 másodperc múlva mentés készül.
- **Napi cron:** a napi mentés `Europe/Budapest` szerint 02:00-kor fut.
- **Teszt:** `tests/backup-startup.test.ts` lefedi a fenti edge case-eket.
