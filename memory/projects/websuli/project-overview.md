---
id: project_websuli_20260410_601
type: project
domain: websuli
created: 2026-04-10
source: multiple
tags: [websuli, overview, stack, architecture]
project: websuli
---

# WEBSULI Projekt Összefoglaló

## Leírás
Oktatási platform 6-18 éves diákok számára. HTML tananyagok kezelése, megtekintése, AI-val való fejlesztése.

## Technológiai Stack
- **Frontend**: React 18 + TypeScript, TailwindCSS 3.4+, shadcn/ui, Framer Motion, Lucide
- **Backend**: Express.js + TypeScript
- **DB**: PostgreSQL (Neon hosted), Drizzle ORM
- **AI**: Claude Sonnet 4.5 (Anthropic), OpenAI
- **Auth**: Google OAuth
- **Deploy**: Hostinger VPS (websuli.vip), GitHub Actions CI/CD
- **Alternative**: Vercel (frontend) + Render (backend)

## Domain
- **Production**: https://websuli.vip (Cloudflare CDN, Let's Encrypt SSL)
- **VPS**: Hostinger, valószínű IP: 31.97.44.1
- **GitHub**: https://github.com/kosazoltan/WEBSULI

## Fő funkciók
1. HTML tananyag megtekintés + like rendszer
2. Admin panel: anyagok kezelése
3. AI tananyag-okosítás (MaterialImprover)
4. Korcsoport-specifikus design (1-12. osztály)
5. Push notifications (VAPID)
6. Google Auth + session kezelés

## DB állapot (2026-03-14)
- 139 tananyag (Neon, ep-fragrant-silence, EU Frankfurt)
- 13 user, 21 tábla
