-- Spec docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md (S4b): feladatszintű, NÉVTELEN tanulói eredmény — a gépi rubrika-szigorítás
-- (S3c) mérhetősége és automatikus lazítása (S4c). Tanulói szöveget és felhasználó-azonosítót NEM tárol. Additív, idempotens;
-- visszaállítás: DROP TABLE task_results (a kód nélküle is fut — a rögzítés hibája csak napló).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_results (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  task_id varchar(64) NOT NULL,
  round_key char(64) NOT NULL,
  -- Review #340 (P1): a küszöb KÖZREMŰKÖDŐNKÉNT számol (a kliens a kör-azonosítót szabadon választja). Álnevesített, kulcsolt lenyomat
  -- (HMAC, SESSION_SECRET): bejelentkezve a felhasználó, párosítva a tanuló, vendégnél az IP — nem a kliens által küldött ujjlenyomat.
  contributor char(64) NOT NULL,
  det_state varchar(8) NOT NULL CHECK (det_state IN ('ok', 'partial', 'fail')),
  final_state varchar(8) NOT NULL CHECK (final_state IN ('ok', 'partial', 'fail')),
  arbiter_raised boolean NOT NULL DEFAULT false,
  tightened_only_miss boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS task_results_round_unique ON task_results(lesson_id, task_id, round_key);
