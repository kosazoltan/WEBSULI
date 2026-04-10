---
id: semantic_technology_20260410_303
type: semantic
domain: technology
created: 2026-04-10
source: MATERIAL_IMPROVEMENT_FEATURE.md
tags: [ai, claude, material-improver, streaming, sse, admin]
project: websuli
---

# Tananyag Okosítás Funkció

## Áttekintés
Claude Sonnet 4.5 AI segítségével régi HTML tananyagok modernizálása. SSE streaming módban, progress feedback-kel.

## API Endpoints
- `POST /api/admin/improve-material/:id` - streaming AI javítás (90s timeout)
- `GET /api/admin/improved-files` - javított fájlok listája
- `GET /api/admin/improved-files/:id` - egy fájl részletei
- `PATCH /api/admin/improved-files/:id` - státusz/notes frissítés
- `POST /api/admin/improved-files/:id/apply` - alkalmazás az eredetire
- `DELETE /api/admin/improved-files/:id` - törlés
- Backup: GET/POST/DELETE `/api/admin/improvement-backups/*`

## DB táblák
- `improved_html_files`: id, original_file_id, title, content, status (pending/approved/rejected/applied)
- `material_improvement_backups`: backup_data JSONB

## Biztonsági funkciók
- XSS védelem: `eval()`, `Function()` blokkolás
- CSS auto-fix: CSS változók, font deklarációk eltávolítása
- Max fájlméret: 5MB

## Forrás fájlok
- `source/client/src/components/MaterialImprover.tsx`
- `source/server/routes.ts` (4102-5130 sor)
- `source/server/storage.ts`, `source/shared/schema.ts`
