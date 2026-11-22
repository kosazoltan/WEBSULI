-- Copilot-review #418 (docs/specs/2026-11-10-kisfilm-memoria-vegrehajtas.md, „2026-11-22 — Copilot-review”): a kisfilm-média árvaságának
-- kezdete. A söprés az először hivatkozatlanul talált sort jelöli; törölni csak az árvaság türelmi ideje után szabad (a nyitott kliens a
-- lecserélt kisfilm médiáját addig még eléri), újrahivatkozás vagy újra beírás a jelölést törli. Additív, idempotens; visszaállítás:
-- ALTER TABLE lesson_clip_media DROP COLUMN orphaned_at (a söprés ilyenkor nem fut le, a média megmarad).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE lesson_clip_media ADD COLUMN IF NOT EXISTS orphaned_at timestamp with time zone;
