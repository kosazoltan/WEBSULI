-- Additive, prior app can leave these columns untouched during rollback.
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS quiz_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS quiz_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
