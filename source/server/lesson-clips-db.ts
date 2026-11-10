import { sql } from "drizzle-orm";
import { db, dbPool } from "./db";
import type { ClipLesson, ClipRow, ClipStore } from "./lesson-clips";
import { mediaId, type ClipMedia } from "./lesson-clip-media";

/** A kisfilmek éles adatrétege (docs/specs/2026-11-10-fejezet-kisfilmek-v2.md, 6.). A `lessons` táblát csak olvassa. */
const CLIP_LOCK_KEY = 7_320_311_10;

const toLesson = (r: Record<string, unknown>): ClipLesson => ({
  id: String(r.id), json: r.json,
  publishedAt: r.published_at instanceof Date ? r.published_at : typeof r.published_at === "string" ? new Date(r.published_at) : null,
});

/** A médiavégpont betöltője. */
export async function loadClipMedia(id: string): Promise<ClipMedia | null> {
  const { rows } = await db.execute(sql`SELECT mime, bytes FROM lesson_clip_media WHERE id = ${id}`);
  const row = rows[0] as { mime?: unknown; bytes?: unknown } | undefined;
  return row && typeof row.mime === "string" && Buffer.isBuffer(row.bytes) ? { mime: row.mime, bytes: row.bytes } : null;
}

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
    const { rows } = await db.execute(sql`SELECT lesson_id, section_index, heading, source_hash, status, clip, attempts
      FROM lesson_clips WHERE lesson_id = ${lessonId} ORDER BY section_index`);
    return (rows as Array<Record<string, unknown>>).map((r): ClipRow => ({
      lessonId: String(r.lesson_id), sectionIndex: Number(r.section_index), heading: String(r.heading),
      sourceHash: typeof r.source_hash === "string" ? r.source_hash : null, status: r.status === "ready" ? "ready" : "failed",
      clip: r.clip ?? null, attempts: Number(r.attempts ?? 0),
    }));
  },
  async upsert(row) {
    const clip = row.clip === null ? null : JSON.stringify(row.clip);
    await db.execute(sql`INSERT INTO lesson_clips (lesson_id, section_index, heading, source_hash, status, clip, origin, model, attempts)
      VALUES (${row.lessonId}, ${row.sectionIndex}, ${row.heading}, ${row.sourceHash}, ${row.status}, ${clip}::jsonb, 'auto', ${row.model}, ${row.attempts})
      ON CONFLICT (lesson_id, section_index) DO UPDATE SET heading = EXCLUDED.heading, source_hash = EXCLUDED.source_hash, status = EXCLUDED.status,
        clip = EXCLUDED.clip, origin = 'auto', model = EXCLUDED.model, attempts = EXCLUDED.attempts, updated_at = now()`);
  },
  async lessonsToday() {
    const { rows } = await db.execute(sql`SELECT DISTINCT lesson_id FROM lesson_clips
      WHERE updated_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`);
    return (rows as Array<{ lesson_id: unknown }>).map((r) => String(r.lesson_id));
  },
  async putMedia(kind, mime, bytes) {
    const id = mediaId(bytes);
    await db.execute(sql`INSERT INTO lesson_clip_media (id, kind, mime, bytes, size) VALUES (${id}, ${kind}, ${mime}, ${bytes}, ${bytes.length})
      ON CONFLICT (id) DO NOTHING`);
    return id;
  },
  async mediaBytes() {
    const { rows } = await db.execute(sql`SELECT coalesce(sum(size), 0)::bigint AS total FROM lesson_clip_media`);
    return Number((rows[0] as { total?: unknown } | undefined)?.total ?? 0);
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
