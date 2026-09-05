-- #170: OCR átirat-cache — ugyanazt a képet (tartalom-hash) soha nem fizetjük
-- ki kétszer; restart utáni újrafutásnál a kész átiratok ingyen vannak.
CREATE TABLE IF NOT EXISTS "ocr_transcripts" (
  "cache_key" varchar(64) PRIMARY KEY,
  "text" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
