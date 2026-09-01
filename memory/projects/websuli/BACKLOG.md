---
id: project_websuli_20260720_002
type: project
domain: websuli
created: 2026-07-20
source: hermes-orchestrator-session
tags: [backlog, todo, tech-debt]
project: websuli
---

# WEBSULI Backlog — nyitott tételek

> Minden feladat után frissítendő: kész tétel törlendő, új hiba/adósság felveendő.

## Sürgős / biztonság

- [ ] **Google OAuth Client Secret rotálása** — a history filter-repóval tisztítva (2026-07-21), de a GitHub cache/PR-diffek miatt a rotáció továbbra is kötelező. A régi secret a git historyban
  van (trackelt template-fájlokban volt élő értékkel); a working tree már
  tiszta, de a history nem. Rotálás után csak a `.env`-be írni.
- [x] QA-javítások commitolva + rebase + push (8702e2b) + auto-deploy VERIFIED (Vercel bundle marker, Render health 200).
  a `main` ága eleve "ahead 1" állapotban van — rendezni a remote-tal).

## Verifikáció / QA folytatás

- [x] Javítások utáni teljes kapu: `npx tsc --noEmit && npx eslint client/src server`
  — 2026-07-20 este lefutott: **tsc 0 hiba, eslint 0 error / 1160 warning** (a
  javítások 3 warningot is megszüntettek).
- [ ] Böngészős re-check: főoldal friss betöltésnél csak 1 `likes/batch` kérés
  menjen ki (N+1 fix igazolása); Szólétra menü létra-render screenshot.
- [ ] Még nem QA-zott felületek: `/admin`, `/preview/:id`, PDF-nézet,
  BlockCraft / SpaceAsteroid / SpeedQuiz / BrainRot játékok végigjátszása.

## Tech debt

- [ ] 1163 eslint warning (döntően `no-console` a szerveroldalon) — logger
  bevezetése vagy szabály-hangolás.
- [ ] `server/routes.ts.backup` és `deploy_package_v*.zip` fájlok a repóban —
  takarítás/gitignore.
- [ ] Doc drift: a gyökér VPS/MCP/SSH `.md`-k jelentős része 2026. januári
  állapotot ír le — kód-alapú felülvizsgálat, elavultak archiválása.
- [ ] `pip`→python3.14 vs python3.13 eltérés a gépen nem repo-ügy, de a
  Playwright teszt-futtatás (playwright.config.ts) még nem volt kipróbálva.

## 2026-09-01 mély audit — nyitva hagyott tételek
- routes.ts `globalEmailScript`: ADMIN_EMAILS a publikus tananyag-HTML-be kerül (scrape) →
  szerver-oldali `POST /api/material-result` végpont kell, a címeket ne süssük a kliensbe.
- `/dev/:id` minden megtekintésre material_views sort ír, rate-limit nélkül → dedup
  (IP+material+1h) inkább, mint IP-limiter (iskolai NAT).
- migrate.ts: a 0000 séma blokk-kommentben van, üres DB-n "applied"-nek jelöli futtatás
  nélkül → 0001 42P01. Döntés kell: kikommentelés megszüntetése vagy runner-fejtés.
- Preview.tsx iframe allow-same-origin+allow-scripts: szándékos (mikrofon), de a
  tananyag-HTML admin által feltöltött → dokumentált bizalmi feltevés, felülvizsgálandó.
