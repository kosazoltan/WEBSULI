# 🗄️ WEBSULI Adatbázis Helyreállítási Útmutató (Secret-safe)

> Utolsó frissítés: 2026-03-14

## Helyes adatbázis (PRIMARY)

| Tulajdonság | Érték |
|---|---|
| **Neon projekt neve** | ep-fragrant-silence |
| **Régió** | EU Central (Frankfurt) |
| **Host** | `<NEON_HOST>` |
| **Adatbázis** | `<DB_NAME>` |
| **User** | `<DB_USER>` |
| **Jelszó** | `<DB_PASSWORD>` |
| **Anyagok száma** | 139 (2026-03-14-én) |
| **Userek száma** | 13 |
| **Táblák száma** | 21 |

### Teljes connection string (minta)

```
postgresql://<DB_USER>:<DB_PASSWORD>@<NEON_HOST>/<DB_NAME>?sslmode=require&channel_binding=require
```

---

## ⚠️ NE használd ezeket az adatbázisokat

### DB2 — Régi másolat
- **Host**: `<OLD_NEON_HOST>`
- **Jelszó**: `<OLD_DB_PASSWORD>`
- **Anyagok**: 99 (a PRIMARY első 99 anyagának másolata, 2025-12-09-ig)
- **Státusz**: Elavult részleges másolat

### Másik projekt DB — TELJESEN MÁS PROJEKT
- **Host**: `<UNRELATED_NEON_HOST>`
- **Jelszó**: `<UNRELATED_DB_PASSWORD>`
- **Státusz**: ❌ Ez NEM a WEBSULI adatbázis! Másik Neon projekthez tartozik.

---

## Hol kell beállítani a DATABASE_URL-t

### 1. Lokális fejlesztés (`source/.env`)
```env
DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<NEON_HOST>/<DB_NAME>?sslmode=require&channel_binding=require
```

### 2. Render Production
- **URL**: https://dashboard.render.com → **websuli-api-eu** → **Environment**
- A `render.yaml`-ban `sync: false` van → kézzel kell beállítani a dashboardon
- Mentés után automatikusan újradeployol

### 3. GitHub Actions (ha van)
- Repository Settings → Secrets → `DATABASE_URL`

---

## 🔍 Hibaelhárítás: Hogyan ismerd fel a rossz adatbázist

### Tünet: "Még nincsenek anyagok" a weboldalon
1. Ellenőrizd a production API-t:
   ```
   curl https://websuli-api-eu.onrender.com/api/html-files
   ```
   Ha `[]` üres tömböt ad vissza → rossz DATABASE_URL

2. Ellenőrizd melyik DB-re mutat:
   ```
   curl https://websuli-api-eu.onrender.com/api/health
   ```
   Ha a health OK de az anyagok üresek → DB kapcsolat él, de rossz adatbázis

### Tünet: Szerver indul, de hibát dob `google_id` oszlopról
A `google_id` oszlop manuálisan lett hozzáadva. Ha hiányzik:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR UNIQUE;
```

---

## 🛠️ Gyors diagnosztikai script

Ha nem tudod, melyik DB-ben vannak az anyagok, futtasd ezt (`source/` mappából):

```javascript
// _db_check.mjs — futtasd: node _db_check.mjs
import pg from 'pg';
const { Client } = pg;

const databases = [
  {
    name: 'DB1 - PRIMARY',
    url: process.env.DB1_URL,
  },
  {
    name: 'DB2 - OLD COPY',
    url: process.env.DB2_URL,
  }
];

for (const db of databases.filter((x) => x.url)) {
  const client = new Client({ connectionString: db.url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query('SELECT COUNT(*) as cnt FROM html_files');
    console.log(`✅ ${db.name}: ${r.rows[0].cnt} anyag`);
  } catch (e) {
    console.log(`❌ ${db.name}: ${e.message}`);
  } finally {
    await client.end();
  }
}
```

> ⚠️ Soha ne írj valódi jelszót vagy teljes connection stringet commitolt fájlba.

---

## 🔐 Security incidens után kötelező lépések

1. Neon/DB jelszó azonnali rotáció.
2. Render/GitHub Secrets/.env frissítése az új értékre.
3. Régi jelszóval futó sessionök/connection pool újraindítása.
4. Secret scanning alert lezárása csak rotáció után.

---

## 📋 Helyreállítás lépésről lépésre

1. **Futtasd a diagnosztikai scriptet** → állapítsd meg, melyik DB-ben vannak az anyagok
2. **Frissítsd a lokális `.env`-t** a helyes connection stringgel
3. **Indítsd újra a dev szervert**: `cd source && npx tsx server/index.ts`
4. **Ellenőrizd**: `curl http://localhost:5000/api/html-files` → 139+ anyag
5. **Frissítsd a Render dashboardot**: Environment → DATABASE_URL → Save
6. **Várj 2-3 percet** az újradeployra
7. **Ellenőrizd a productiont**: `curl https://websuli-api-eu.onrender.com/api/html-files`

---

## 📝 Történet

| Dátum | Esemény |
|---|---|
| 2026-03-14 | .env rossz DB-re mutatott (EBC Iroda, ep-bitter-sun). Átállítva ep-fragrant-silence-re. 139 anyag visszaállt. |
| 2025-12-09 | DB2 (ep-spring-fog) utolsó anyag dátuma — ez a régi klón |
| 2026-03-12 | DB1 (ep-fragrant-silence) legújabb anyag dátuma |
