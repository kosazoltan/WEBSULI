-- T-1: a játék-kvíz tételek magyarázata.
--
-- A lecke `check` blokkjai LS-2 óta minden válaszlehetőséghez hoznak
-- visszajelzést, de az export csak a kérdést és a válaszokat vitte tovább —
-- a játékokban a rossz válasz néma büntetés maradt. Nullable, mert a meglévő
-- sorokhoz nincs magyarázat, és találgatni nem szabad.
ALTER TABLE game_quiz_items ADD COLUMN IF NOT EXISTS explanation text;
