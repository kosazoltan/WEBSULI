---
id: procedural_development_20260410_503
type: procedural
domain: development
created: 2026-04-10
source: source/README-LOCAL.md
tags: [local-development, setup, postgresql, neon, dev-server]
project: websuli
---

# Helyi Fejlesztési Útmutató

## Előfeltételek
- Node.js v20+
- PostgreSQL adatbázis (vagy Neon Tech fiók)

## Telepítés
```bash
cd source && npm install
```

## .env konfiguráció
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/websuli
SESSION_SECRET=super_secret_local_dev_key_123
PORT=5000
# OPENAI_API_KEY, ANTHROPIC_API_KEY (AI funkciókhoz)
```

**Megjegyzés**: `server/db.ts` alapértelmezetten `@neondatabase/serverless` driverrel dolgozik.

## Fejlesztői szerver
```bash
npm run dev  # hot-reload, http://localhost:5000
```

## Bejelentkezés (dev)
`http://localhost:5000/api/login` → automatikus admin bejelentkezés

## Éles build
```bash
npm run build && npm start
```
