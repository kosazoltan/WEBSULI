---
id: procedural_deploy_20260410_102
type: procedural
domain: deploy
created: 2026-04-10
source: DATABASE-RECOVERY.md
tags: [database, neon, postgresql, recovery, websuli]
project: websuli
---

# Adatbázis Helyreállítás (SECRET-SAFE)

## PRIMARY DB: ep-fragrant-silence (Neon, EU Central Frankfurt)
- 139 anyag (2026-03-14), 13 user, 21 tábla
- Connection string: `postgresql://<DB_USER>:<DB_PASSWORD>@<NEON_HOST>/<DB_NAME>?sslmode=require&channel_binding=require`

## NE HASZNÁLD
- DB2 (ep-spring-fog): elavult klón, 2025-12-09-ig 99 anyag
- Másik Neon projekt: nem WEBSULI

## DATABASE_URL beállítás helye
1. Lokális: `source/.env`
2. Production: Render dashboard → websuli-api-eu → Environment
3. GitHub Actions: Repository Secrets → DATABASE_URL

## Gyors diagnosztika
```bash
curl https://websuli-api-eu.onrender.com/api/html-files  # [] = rossz DB
curl https://websuli-api-eu.onrender.com/api/health
```

## google_id oszlop hiányzik
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE;
```

## Helyreállítás lépései
1. Diagnózis script futtatása (source/_db_check.mjs)
2. Lokális .env frissítése
3. Dev szerver újraindítás: `cd source && npx tsx server/index.ts`
4. Render dashboard DATABASE_URL frissítése
