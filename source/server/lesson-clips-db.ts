import { sql } from "drizzle-orm";
import { db, dbPool } from "./db";
import type { ClipLesson, ClipRow, ClipStore } from "./lesson-clips";

/** A kisfilmek éles adatrétege (docs/specs/2026-11-10-fejezet-kisfilmek.md, 4.2). A `lessons` táblát csak olvassa. */
const CLIP_LOCK_KEY = 7_320_311_10;

const toLesson = (r: Record<string, unknown>): ClipLesson => ({
  id: String(r.id), json: r.json,
  publishedAt: r.published_at instanceof Date ? r.published_at : typeof r.published_at === "string" ? new Date(r.published_at) : null,
});

export const dbClipStore: ClipStore = {
  async lesson(id) {
    const { rows } = await db.execute(sql`SELECT id, published_at, json FROM lessons WHERE id = ${id}`);
    return rows[0] ? toLesson(rows[0] as Record<string, unknown>) : null;
  },
  async freshLessons(days) {
    const { rows } = await db.execute(sql`SELECT id, published_at, json FROM lessons
      WHERE published_at IS NOT NULL AND published_at >= (now() AT TIME ZONE 'utc') - make_interval(days => ${days})
      ORDER BY published_at DESC LIMIT 50`);
    return (rows as Array<Record<string, unknown>>).map(toLesson);
  },
  async rows(lessonId) {
    const { rows } = await db.execute(sql`SELECT lesson_id, section_index, heading, source_hash, status, clip, origin, attempts
      FROM lesson_clips WHERE lesson_id = ${lessonId} ORDER BY section_index`);
    return (rows as Array<Record<string, unknown>>).map((r): ClipRow => ({
      lessonId: String(r.lesson_id), sectionIndex: Number(r.section_index), heading: String(r.heading),
      sourceHash: typeof r.source_hash === "string" ? r.source_hash : null, status: r.status === "ready" ? "ready" : "failed",
      clip: r.clip ?? null, origin: r.origin === "handmade" ? "handmade" : "auto", attempts: Number(r.attempts ?? 0),
    }));
  },
  async upsertHandmade(row) {
    await db.execute(sql`INSERT INTO lesson_clips (lesson_id, section_index, heading, source_hash, status, clip, origin, model, attempts)
      VALUES (${row.lessonId}, ${row.sectionIndex}, ${row.heading}, NULL, 'ready', ${JSON.stringify(row.clip)}::jsonb, 'handmade', NULL, 0)
      ON CONFLICT (lesson_id, section_index) DO UPDATE SET heading = EXCLUDED.heading, source_hash = NULL, status = 'ready', clip = EXCLUDED.clip,
        origin = 'handmade', model = NULL, attempts = 0, updated_at = now()`);
  },
  async upsertAuto(row) {
    const clip = row.clip === null ? null : JSON.stringify(row.clip);
    // A kézi sort az automatikus nem írja felül (WHERE … origin = 'auto').
    await db.execute(sql`INSERT INTO lesson_clips (lesson_id, section_index, heading, source_hash, status, clip, origin, model, attempts)
      VALUES (${row.lessonId}, ${row.sectionIndex}, ${row.heading}, ${row.sourceHash}, ${row.status}, ${clip}::jsonb, 'auto', ${row.model}, ${row.attempts})
      ON CONFLICT (lesson_id, section_index) DO UPDATE SET heading = EXCLUDED.heading, source_hash = EXCLUDED.source_hash, status = EXCLUDED.status,
        clip = EXCLUDED.clip, model = EXCLUDED.model, attempts = EXCLUDED.attempts, updated_at = now()
      WHERE lesson_clips.origin = 'auto'`);
  },
  async autoLessonsToday() {
    const { rows } = await db.execute(sql`SELECT DISTINCT lesson_id FROM lesson_clips
      WHERE origin = 'auto' AND updated_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`);
    return (rows as Array<{ lesson_id: unknown }>).map((r) => String(r.lesson_id));
  },
  async exclusive(work) {
    const client = await dbPool.connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [CLIP_LOCK_KEY]);
      if (!rows[0]?.ok) return null;
      try { return await work(); } finally { await client.query("SELECT pg_advisory_unlock($1)", [CLIP_LOCK_KEY]).catch(() => undefined); }
    } finally {
      client.release();
    }
  },
};
