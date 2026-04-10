---
id: procedural_development_20260410_502
type: procedural
domain: development
created: 2026-04-10
source: source/CODE_REVIEW_2024_12.md
tags: [code-review, foreign-key, database, cascade, storage]
project: websuli
---

# Kód Revízió 2024. December 11

## Javított kritikus hibák: Foreign Key constraint violation

### deleteHtmlFile (storage.ts)
Cascade törlés hozzáadva: email_logs, material_stats, material_tags, material_likes, material_ratings, material_comments, material_views

### deleteUser (storage.ts)
- Törlés: ai_generation_requests, email_subscriptions, push_subscriptions
- Nullify: html_files.user_id, material_views.user_id, stb.

### deleteTag, restoreBackup, bulk-delete, backup import
Mindegyikhez cascade törlés hozzáadva.

## FK törlési sorrend (html_files)
1. email_logs, material_stats, material_tags, material_likes, material_ratings, material_comments, material_views
2. html_files

## Javaslatok
- ON DELETE CASCADE hozzáadása a sémához
- Soft Delete (deleted_at timestamp)
- db.transaction() cascade törlésekhez

## Jól működő területek
- Auth (isAuthenticatedAdmin, Google OAuth, session)
- CRUD (Zod validáció, hibakezelés)
- AI integráció (rate limit, fallback provider)
- Email, Backup rendszer
