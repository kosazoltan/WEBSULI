---
id: procedural_deploy_20260410_109
type: procedural
domain: deploy
created: 2026-04-10
source: VERCEL_RENDER_TELEPITES.md
tags: [vercel, render, deployment, architecture, neon]
project: websuli
---

# Vercel + Render Deployment Architektúra

## Architektúra
```
Felhasználó → [Vercel CDN] (React frontend)
    ↓ /api/* és /auth/* proxy rewrite
[Render Web Service] (Express backend)
    ↓
[Neon PostgreSQL]
```

## 1. Render Backend beállítás
1. render.com → New → Blueprint → WEBSULI repo → Apply
2. Environment változók: DATABASE_URL, SESSION_SECRET, BASE_URL, FRONTEND_URL, GOOGLE_CLIENT_ID/SECRET, ADMIN_EMAIL, AI keys, RESEND_API_KEY, VAPID keys
3. Google Cloud Console: add Vercel URL az Authorized Origins/Redirect URIs-hoz

## 2. Vercel Frontend beállítás
1. vercel.com → Add Project → WEBSULI
2. Framework: Vite, Root: `source`, Build: `npm run build:client`, Output: `dist/public`
3. `source/vercel.json` rewrites: Render URL frissítése
4. Render BASE_URL/FRONTEND_URL = Vercel URL

## CI/CD
- Vercel: auto-deploy `main` push-ra (frontend)
- Render: auto-deploy `main` push-ra (backend)
- GitHub Actions: csak build ellenőrzés
