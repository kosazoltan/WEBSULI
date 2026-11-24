-- U4b review #586: a párosított összevont levél kézbesítése tartósan újrapróbálható. A párosítás a két sort egy közös
-- `pair_key`-jel köti össze (a tulajdonost is tartalmazó körkulcs); a `delivered_at` csak a sikeres kézbesítés után íródik.
-- Kézbesítetlen pár (folyamatleállás, szolgáltatói hiba, nincs címzett) újraküldhető: a kör ismételt beküldése és a söprő (U4c) pótolja.
-- Additív, idempotens. Visszaállítás (down): ALTER TABLE lesson_result_pending DROP COLUMN IF EXISTS pair_key, DROP COLUMN IF EXISTS delivered_at;
ALTER TABLE lesson_result_pending ADD COLUMN IF NOT EXISTS pair_key char(64);
ALTER TABLE lesson_result_pending ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS lesson_result_pending_undelivered ON lesson_result_pending(sent_at) WHERE sent_reason = 'pair' AND delivered_at IS NULL;
