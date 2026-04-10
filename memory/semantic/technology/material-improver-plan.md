---
id: semantic_technology_20260410_304
type: semantic
domain: technology
created: 2026-04-10
source: MATERIAL_IMPROVER_PLAN.md
tags: [ai, material-improver, plan, database, migration, transaction]
project: websuli
---

# Tananyag Okosítás - Részletes Terv

## Biztonsági elvek
- Minden művelet transaction-ben
- Automatikus backup apply előtt
- Preview tábla → manuális jóváhagyás → alkalmazás
- Rollback lehetőség

## Folyamat
1. Fájl kiválasztás → Claude API hívás → improved_html_files tábla
2. Preview és ellenőrzés
3. Backup készítés (material_improvement_backups)
4. Atomi TRANSACTION: eredeti fájl frissítése + improved státusz = 'applied'

## DB séma
```sql
improved_html_files: id, original_file_id, title, content, status (pending→approved→applied), improvement_prompt, created_by, applied_at
material_improvement_backups: id, original_file_id, improved_file_id, backup_data JSONB
```

## Implementációs fázisok (mind KÉSZ)
1. DB migráció
2. Schema + Storage metódusok
3. API endpoints
4. Frontend komponens
5. Admin oldal integráció
6. Tesztelés

## AI konfiguráció
- Model: claude-sonnet-4-5
- Timeout: 90s (streaming)
- System prompt: `tananyag-okosito` (DB-ben tárolva)
- CSS-only output, inline stílusok, @font-face tiltva
