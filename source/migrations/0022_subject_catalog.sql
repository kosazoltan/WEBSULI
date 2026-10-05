-- Spec 2026-10-05-s3-katalogus-bank: tantárgyi katalógus-bankok (additív, idempotens).
-- A lecke besorolása (S2) és a kinyert tételek (S1); a tétel a lecke tantárgyát örökli, minden tantárgy és ág külön bank.
CREATE TABLE IF NOT EXISTS catalog_lessons (
  provenance varchar(96) PRIMARY KEY,
  title text NOT NULL,
  classroom integer,
  subject varchar(32),
  secondary_subjects jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_area text,
  topic text,
  lesson_type varchar(32),
  classification_status varchar(16) NOT NULL CHECK (classification_status IN ('agreed','review','unclassified')),
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  models jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  admin_subject varchar(32),
  admin_decided_by varchar REFERENCES users(id) ON DELETE SET NULL,
  admin_decided_at timestamptz
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catalog_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  subject varchar(32) NOT NULL,
  grade integer,
  topic_area text,
  topic text,
  lesson_type varchar(32),
  kind varchar(16) NOT NULL CHECK (kind IN ('section','quiz','quiz_unkeyed','short_answer','open_task','method','vocab')),
  prompt text NOT NULL,
  body text,
  options jsonb,
  correct_index integer,
  accepted jsonb,
  keyword_groups jsonb,
  steps jsonb,
  pair jsonb,
  concept_ids jsonb,
  provenances jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust varchar(24) NOT NULL CHECK (trust IN ('parent_verified','pipeline_verified')),
  status varchar(12) NOT NULL CHECK (status IN ('active','flagged','review','rejected')),
  status_by_admin boolean NOT NULL DEFAULT false,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_subject_fingerprint_idx ON catalog_items (subject, fingerprint);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS catalog_items_subject_status_idx ON catalog_items (subject, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS catalog_items_subject_topic_idx ON catalog_items (subject, grade, topic_area);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS catalog_lessons_status_idx ON catalog_lessons (classification_status);
