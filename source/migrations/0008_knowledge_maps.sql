-- LS-1 — Tudás-térkép (KnowledgeMap): forráshoz kötött, jóváhagyható fogalomjegyzék.
-- Additív migráció: meglévő táblát nem módosít, minden lépés újrafuttatható.

CREATE TABLE IF NOT EXISTS "knowledge_maps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"subject" varchar(120) NOT NULL,
	"classroom" integer NOT NULL,
	"unit" varchar(255),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"source_files" jsonb NOT NULL,
	"source_text" text,
	"input_hash" varchar(64) NOT NULL,
	"model" varchar(120),
	"created_by" varchar,
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_maps_input_hash_unique" UNIQUE("input_hash")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "km_concepts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map_id" varchar NOT NULL,
	"local_id" varchar(64) NOT NULL,
	"term" varchar(200) NOT NULL,
	"definition" text NOT NULL,
	"quote" text NOT NULL,
	"source_ref" jsonb NOT NULL,
	"type" varchar(24) NOT NULL,
	"exam_weight" varchar(16) NOT NULL,
	"related_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verbatim_ok" boolean DEFAULT false NOT NULL,
	"verbatim_reason" varchar(32),
	"review_state" varchar(16) DEFAULT 'pending' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "knowledge_maps_input_hash_idx" ON "knowledge_maps" ("input_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_maps_scope_idx" ON "knowledge_maps" ("subject", "classroom");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_maps_status_idx" ON "knowledge_maps" ("status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "km_concepts_map_id_idx" ON "km_concepts" ("map_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "km_concepts_map_order_idx" ON "km_concepts" ("map_id", "order_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "km_concepts_exam_weight_idx" ON "km_concepts" ("map_id", "exam_weight");
--> statement-breakpoint

-- Egy térképen belül a modell-oldali azonosító egyedi (a related_ids erre hivatkozik).
CREATE UNIQUE INDEX IF NOT EXISTS "km_concepts_map_local_id_uq" ON "km_concepts" ("map_id", "local_id");
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "km_concepts" ADD CONSTRAINT "km_concepts_map_id_knowledge_maps_id_fk"
   FOREIGN KEY ("map_id") REFERENCES "knowledge_maps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "knowledge_maps" ADD CONSTRAINT "knowledge_maps_created_by_users_id_fk"
   FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "knowledge_maps" ADD CONSTRAINT "knowledge_maps_approved_by_users_id_fk"
   FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
