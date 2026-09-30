-- Spec 2026-09-30 (U5, H48): a banktétel stabil azonosítója a lektori jegyzeten (additív, nullázható).
ALTER TABLE lektor_notes ADD COLUMN IF NOT EXISTS item_id varchar(96);
