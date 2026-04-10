---
id: procedural_deploy_20260410_112
type: procedural
domain: deploy
created: 2026-04-10
source: source/GOOGLE_AUTH_SETUP.md
tags: [google-oauth, auth, session, cookie, production]
project: websuli
---

# Google OAuth Beállítás

## .env változók
```env
GOOGLE_CLIENT_ID=433623811498-b0fltf9nanpk935hiklm6o7raqak7o9p.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
BASE_URL=https://websuli.vip
ADMIN_EMAIL=kosa.zoltan.ebc@gmail.com
```

## Google Cloud Console
Authorized redirect URIs:
- `https://websuli.vip/auth/google/callback`
- `http://localhost:5000/auth/google/callback`

Authorized JavaScript Origins:
- `https://websuli.vip`, `http://localhost:5000`

## Session cookie beállítások
- `secure: true` production-ban (HTTPS)
- `sameSite: 'lax'` (KRITIKUS OAuth redirect-hez)
- `httpOnly: true`
- `proxy: true` production-ban (Nginx mögött)

## Diagnosztika
```bash
npx tsx server/scripts/checkGoogleAuth.ts
```

## Gyakori hibák
- `redirect_uri_mismatch` → Google Console URL pontos egyezés
- Session elvész → sameSite: lax
- Cookie HTTPS-en → secure: true (dinamikus)
