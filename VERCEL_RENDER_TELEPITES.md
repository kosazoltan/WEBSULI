# WEBSULI: Vercel + Render Deployment

## Architektúra

```
Felhasználó
    │
    ▼
[Vercel CDN] ── React frontend (statikus fájlok)
    │
    │  /api/*  és  /auth/*  proxy rewrite
    ▼
[Render Web Service] ── Express backend (API, cron, WebSocket)
    │
    ▼
[Neon PostgreSQL] ── Adatbázis
```

- **Vercel**: Frontend (React/Vite) - gyors CDN, automatikus deploy
- **Render**: Backend (Express API) - cron jobok, session kezelés, AI, email
- A Vercel proxy-zza az `/api/*` és `/auth/*` kéréseket a Render-hez

---

## 1. lépés: Render Backend beállítása

### 1.1 Render projekt létrehozása

1. Menj a [render.com](https://render.com) oldalra, jelentkezz be GitHub fiókkal
2. Kattints **New +** > **Blueprint**
3. Válaszd ki a `WEBSULI` GitHub repót
4. A Render automatikusan beolvassa a `render.yaml` fájlt
5. Kattints **Apply** - létrehozza a `websuli-api` szolgáltatást

### 1.2 Környezeti változók beállítása a Render Dashboard-on

A Render Dashboard-on > **Environment** menüpont alatt add meg az alábbi változókat:

| Változó | Leírás | Hol szerezhető be |
|---------|--------|-------------------|
| `DATABASE_URL` | Neon PostgreSQL connection string | [neon.tech](https://neon.tech) > Project > Connection Details |
| `SESSION_SECRET` | Véletlenszerű 64+ karakteres string | `openssl rand -hex 32` paranccsal generálható |
| `BASE_URL` | A Vercel frontend URL | Majd a 2. lépés után! (pl. `https://websuli.vercel.app`) |
| `FRONTEND_URL` | Ugyanaz mint a BASE_URL | Ugyanaz mint fent |
| `GOOGLE_CLIENT_ID` | Google OAuth kliens ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth kliens secret | Ugyanott |
| `ADMIN_EMAIL` | Admin email cím | Az első Google bejelentkezés ezzel a címmel admin jogot kap |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API kulcs | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Anthropic API kulcs | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `RESEND_API_KEY` | Email küldés API kulcs | [resend.com/api-keys](https://resend.com/api-keys) |
| `RESEND_FROM_EMAIL` | Feladó email cím | pl. `WEBSULI <noreply@websuli.org>` |
| `PUBLIC_VAPID_KEY` | Push notification publikus kulcs | `npx web-push generate-vapid-keys` |
| `PRIVATE_VAPID_KEY` | Push notification privát kulcs | Ugyanott |

> **FONTOS**: A `BASE_URL` és `FRONTEND_URL` értékét csak a Vercel deploy után tudod kitölteni!

### 1.3 Google OAuth beállítás frissítése

A [Google Cloud Console](https://console.cloud.google.com/apis/credentials)-on frissítsd az OAuth kliens beállításait:

- **Authorized JavaScript Origins**: add hozzá a Vercel URL-t (pl. `https://websuli.vercel.app`)
- **Authorized Redirect URIs**: add hozzá: `https://websuli.vercel.app/auth/google/callback`

> A `BASE_URL` a Vercel frontend URL legyen, mert az OAuth callback a Vercel proxy-n keresztül megy a Render-hez.

### 1.4 Deploy és URL másolása

A deploy után a Render ad egy URL-t, pl.: `https://websuli-api.onrender.com`

**Jegyezd fel ezt a URL-t** - a következő lépésben kell!

---

## 2. lépés: Vercel Frontend beállítása

### 2.1 Vercel projekt létrehozása

1. Menj a [vercel.com](https://vercel.com) oldalra, jelentkezz be GitHub fiókkal
2. Kattints **Add New... > Project**
3. Válaszd ki a `WEBSULI` repót
4. Beállítások:
   - **Framework Preset**: Vite
   - **Root Directory**: `source`
   - **Build Command**: `npm run build:client`
   - **Output Directory**: `dist/public`
5. Kattints **Deploy**

### 2.2 Render URL frissítése a vercel.json-ban

Miután megvan a Render URL, szerkeszd a `source/vercel.json` fájlt:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://RENDER-URL-IDE.onrender.com/api/:path*"
    },
    {
      "source": "/auth/:path*",
      "destination": "https://RENDER-URL-IDE.onrender.com/auth/:path*"
    },
    ...
  ]
}
```

Cseréld ki a `websuli-api.onrender.com` részt a valódi Render URL-re!

Commit és push után a Vercel automatikusan újra deployol.

### 2.3 Vercel URL beírása a Render-be

Most, hogy megvan a Vercel URL (pl. `https://websuli.vercel.app`):

1. Menj vissza a Render Dashboard-ra
2. **Environment** > állítsd be:
   - `BASE_URL` = `https://websuli.vercel.app`
   - `FRONTEND_URL` = `https://websuli.vercel.app`
3. Kattints **Save Changes** - a Render automatikusan újraindul

---

## 3. lépés: Ellenőrzés

1. Nyisd meg a Vercel URL-t böngészőben
2. Ellenőrizd, hogy az oldal betölt
3. Próbálj bejelentkezni Google-lel
4. Ellenőrizd az admin felületet

### Hibakeresés

- **CORS hiba**: Ellenőrizd, hogy a `FRONTEND_URL` helyes a Render-en
- **OAuth nem működik**: Ellenőrizd a `BASE_URL`-t és a Google Console redirect URI-t
- **API 502/504**: A Render free plan 15 perc inaktivitás után elalszik - Starter plan ajánlott
- **Build hiba Vercel-en**: Ellenőrizd, hogy a Root Directory `source`-ra van állítva

---

## Egyéni domain beállítás (opcionális)

### Vercel (frontend domain)
1. Vercel Dashboard > Settings > Domains
2. Add hozzá a domaint (pl. `websuli.org`)
3. Kövesd a DNS beállítási utasításokat

### Render (backend domain)
1. Render Dashboard > Settings > Custom Domains
2. Add hozzá az API subdomaint (pl. `api.websuli.org`)
3. Kövesd a DNS beállítási utasításokat
4. Frissítsd a `vercel.json` rewrite-okat az új domain-re

> Egyéni domain esetén add hozzá a `CUSTOM_DOMAIN` env változót is a Render-en.

---

## CI/CD — hogyan jut ki egy változás élesre

A tényleges beállítás a Render API-ból kiolvasva (2026-11-05, szolgáltatás: `websuli-api-eu`, `srv-d6h9oq9drdic73cied30`).

| Réteg | Mikor települ | Mit telepít |
|---|---|---|
| **Vercel** (frontend) | a `main` minden commitjára | a `source/` SPA-t (`source/vercel.json`) |
| **Render** (backend) | a `main` új commitjára (`autoDeploy: yes`, `autoDeployTrigger: commit`), **de csak ha** a commit a `source/` gyökérmappán belül változtat, és nem csak a build-szűrő kizárt útvonalain: `docs/**`, `**/*.md`, `source/tests/**`, `.github/**` | az Express API-t (`node dist/index.js`) |
| **GitHub Actions** | push a `main` / `develop` ágra, és a `main`-re nyitott PR | semmit — csak ellenőriz (lint, típus, unit, DB-integráció, Playwright E2E, Windows x64/ARM64) |

Következmények:

- Csak teszt-, dokumentáció-, CI- vagy a `source/`-on kívüli szkriptváltozás (pl. `scripts/qa/`) **nem** indít Render-telepítést,
  és nem indítja újra a szervert — futó tananyaggyártást nem szakít meg.
- Szerveroldali változás (`source/server`, `source/shared`, `source/client`, `source/package*.json`, `source/migrations`)
  összevonása után a Render kb. 2 perc alatt telepít és újraindul. Közben futó gyártás megszakadhat: ilyen összevonás előtt
  érdemes megvárni a futó gyártás végét.
- A Render build-parancsa a **Render-felületen** él, nem a `render.yaml`-ban (a szolgáltatás nem Blueprint-szinkronizált):
  `npm install --include=dev --legacy-peer-deps && (npm run db:migrate || echo MIGRATE_SKIPPED) && npm run build`.
  A migráció tehát minden telepítéskor lefut, de **a hibája nem állítja meg a telepítést** — a build-naplóban
  „MIGRATE_SKIPPED” jelzi. A `render.yaml` `buildCommand`-ja (`npm ci … && npm run db:migrate && …`) ettől eltér; a kettő
  összehangolása tulajdonosi döntés.

### Élesítés ellenőrzése

```bash
node scripts/qa/verify-render-revision.mjs   # 0 = az éles backend a várt commitot futtatja
```

A várt revízió a `main` utolsó olyan commitja, amely a fenti szabály szerint Render-telepítést indít; az éles
`https://websuli.vip/api/health` `revision` mezőjének ezzel kell egyeznie (`uptime`: mióta fut). Eltérésnél a telepítés még
fut (kb. 2 perc), vagy elmaradt: Render-felület → `websuli-api-eu` → Events / Deploys. Ha a Render build-szűrője vagy
gyökérmappája változik, a szkript `RENDER_ROOT_DIR` / `RENDER_IGNORED_PATHS` állandóját is frissíteni kell.
