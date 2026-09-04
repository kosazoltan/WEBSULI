-- LS-3a — jutalom-politika, játékidő-kuponok és fogalmankénti eredmények.
-- Additív migráció: meglévő táblát nem módosít, minden lépés újrafuttatható.

CREATE TABLE IF NOT EXISTS "reward_policy" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(32) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reward_policy_key_unique" UNIQUE("key")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "coupons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"fingerprint" varchar(128),
	"lesson_id" varchar NOT NULL,
	"section_idx" integer NOT NULL,
	"minutes" integer NOT NULL,
	"bonus_seconds" integer DEFAULT 0 NOT NULL,
	"reason" varchar(24) NOT NULL,
	"served_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claimed_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"server_started_at" timestamp,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "concept_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" varchar NOT NULL,
	"concept_id" varchar(64) NOT NULL,
	"user_id" varchar,
	"fingerprint" varchar(128),
	"section_idx" integer NOT NULL,
	"correct" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "coupons_user_id_idx" ON "coupons" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupons_fingerprint_idx" ON "coupons" ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupons_lesson_id_idx" ON "coupons" ("lesson_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupons_expires_at_idx" ON "coupons" ("expires_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "concept_results_lesson_id_idx" ON "concept_results" ("lesson_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concept_results_concept_idx" ON "concept_results" ("lesson_id", "concept_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concept_results_user_id_idx" ON "concept_results" ("user_id");
--> statement-breakpoint

-- A kupon és az eredmény a leckével együtt tűnik el: egy törölt leckéhez tartozó
-- játékidő nem váltható be, egy törölt lecke fogalmi statisztikája értelmezhetetlen.
DO $$ BEGIN
 ALTER TABLE "coupons" ADD CONSTRAINT "coupons_lesson_id_lessons_id_fk"
   FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "coupons" ADD CONSTRAINT "coupons_user_id_users_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "concept_results" ADD CONSTRAINT "concept_results_lesson_id_lessons_id_fk"
   FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "concept_results" ADD CONSTRAINT "concept_results_user_id_users_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "reward_policy" ADD CONSTRAINT "reward_policy_updated_by_users_id_fk"
   FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- A D2 alapértékek. ON CONFLICT DO NOTHING: egy már hangolt politikát nem írunk vissza
-- alapértelmezettre egy újbóli migrációs futáskor.
INSERT INTO "reward_policy" ("key", "value") VALUES (
  'default',
  '{"ladder":[1,2,3,4],"lessonPerfectMax":10,"thresholds":{"retry":80,"perfect":100},"bonusSeconds":30,"couponTtlHours":24,"freePlay":true}'::jsonb
) ON CONFLICT ("key") DO NOTHING;
