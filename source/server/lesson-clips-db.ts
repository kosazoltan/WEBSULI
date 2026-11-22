import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { db, dbPool } from "./db";
import type { ClipLesson, ClipRow, ClipStore } from "./lesson-clips";
import { exclusiveWithLock, terminateClipBackend, type LockClient } from "./lesson-clips-lock";
import { logger } from "./lib/logger";
import { mediaId, type ClipMedia } from "./lesson-clip-media";

/** A kisfilmek éles adatrétege (docs/specs/2026-11-10-fejezet-kisfilmek-v2.md, 6.). A `lessons` táblát csak olvassa. */
const CLIP_LOCK_KEY = 7_320_311_10;
/** A kisfilm-adatréteg minden lekérdezésének időkorlátja (I/O-osztály leltár). */
export const CLIP_STATEMENT_TIMEOUT_MS = 15_000;
type ClipTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/**
 * I/O-osztály leltár: a munka egy tranzakcióban fut `SET LOCAL statement_timeout`-tal — egy elakadt lekérdezés sem tarthatja fel a
 * kört (és vele az advisory lockot, a leállítást, a pool lezárását) korlát nélkül.
 */
export function withClipStatementTimeout<T>(work: (tx: ClipTx) => Promise<T>, ms = CLIP_STATEMENT_TIMEOUT_MS): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(ms))}`));
    return work(tx);
  });
}
/** Egy tranzakció futtatója (a pool egy kapcsolatán, vagy a kör zárkapcsolatán). */
type RunTx = <T>(work: (tx: ClipTx) => Promise<T>) => Promise<T>;
const query = (statement: SQL) => withClipStatementTimeout((tx) => tx.execute(statement));
/** Az árva média törlése adagonként ennyi sor, egy söprésben legfeljebb ennyi adag (Copilot-review #418). */
const CLIP_PRUNE_BATCH = 200, CLIP_PRUNE_MAX_BATCHES = 50;

const toLesson = (r: Record<string, unknown>): ClipLesson => ({
  id: String(r.id), json: r.json,
  publishedAt: r.published_at instanceof Date ? r.published_at : typeof r.published_at === "string" ? new Date(r.published_at) : null,
});

/** A médiavégpont betöltője. */
export async function loadClipMedia(id: string): Promise<ClipMedia | null> {
  const { rows } = await query(sql`SELECT mime, bytes FROM lesson_clip_media WHERE id = ${id}`);
  const row = rows[0] as { mime?: unknown; bytes?: unknown } | undefined;
  return row && typeof row.mime === "string" && Buffer.isBuffer(row.bytes) ? { mime: row.mime, bytes: row.bytes } : null;
}

/** A zár-életciklus a `lesson-clips-lock.ts`-ben (egyetlen release-objektum); a leállítás innen is eléri. */
export { forceReleaseClipLock } from "./lesson-clips-lock";
/**
 * A tár egy tranzakció-futtató fölött: kör nélkül a poolon; a körben a zárat tartó kapcsolaton (`sessionStore`). Minden utasítás
 * tranzakcióban fut `SET LOCAL statement_timeout`-tal; a körben a tranzakciók sorban, ugyanazon a kapcsolaton.
 */
function storeOn(runTx: RunTx): Omit<ClipStore, "exclusive"> {
  const query = (statement: SQL) => runTx((tx) => tx.execute(statement));
  return {
  async lesson(id) {
    const { rows } = await query(sql`SELECT id, published_at, json FROM lessons WHERE id = ${id}`);
    return rows[0] ? toLesson(rows[0] as Record<string, unknown>) : null;
  },
  async freshLessons(days) {
    const { rows } = await query(sql`SELECT id, published_at, json FROM lessons
      WHERE published_at IS NOT NULL AND published_at >= (now() AT TIME ZONE 'utc') - make_interval(days => ${days})
      ORDER BY published_at DESC LIMIT 50`);
    return (rows as Array<Record<string, unknown>>).map(toLesson);
  },
  async rows(lessonId) {
    const { rows } = await query(sql`SELECT lesson_id, section_index, heading, source_hash, status, clip, attempts
      FROM lesson_clips WHERE lesson_id = ${lessonId} ORDER BY section_index`);
    return (rows as Array<Record<string, unknown>>).map((r): ClipRow => ({
      lessonId: String(r.lesson_id), sectionIndex: Number(r.section_index), heading: String(r.heading),
      sourceHash: typeof r.source_hash === "string" ? r.source_hash : null, status: r.status === "ready" ? "ready" : "failed",
      clip: r.clip ?? null, attempts: Number(r.attempts ?? 0),
    }));
  },
  async upsert(row) {
    const clip = row.clip === null ? null : JSON.stringify(row.clip);
    await query(sql`INSERT INTO lesson_clips (lesson_id, section_index, heading, source_hash, status, clip, origin, model, attempts)
      VALUES (${row.lessonId}, ${row.sectionIndex}, ${row.heading}, ${row.sourceHash}, ${row.status}, ${clip}::jsonb, 'auto', ${row.model}, ${row.attempts})
      ON CONFLICT (lesson_id, section_index) DO UPDATE SET heading = EXCLUDED.heading, source_hash = EXCLUDED.source_hash, status = EXCLUDED.status,
        clip = EXCLUDED.clip, origin = 'auto', model = EXCLUDED.model, attempts = EXCLUDED.attempts, updated_at = now()`);
  },
  async lessonsToday() {
    const { rows } = await query(sql`SELECT DISTINCT lesson_id FROM lesson_clips
      WHERE updated_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`);
    return (rows as Array<{ lesson_id: unknown }>).map((r) => String(r.lesson_id));
  },
  async putMedia(kind, mime, bytes) {
    const id = mediaId(bytes);
    await query(sql`INSERT INTO lesson_clip_media (id, kind, mime, bytes, size) VALUES (${id}, ${kind}, ${mime}, ${bytes}, ${bytes.length})
      ON CONFLICT (id) DO UPDATE SET orphaned_at = NULL WHERE lesson_clip_media.orphaned_at IS NOT NULL`);
    return id;
  },
  async mediaBytes() {
    const { rows } = await query(sql`SELECT coalesce(sum(size), 0)::bigint AS total FROM lesson_clip_media`);
    return Number((rows[0] as { total?: unknown } | undefined)?.total ?? 0);
  },
  async pruneOrphanMedia(graceMs) {
    // 2. vak kör L6 + Copilot-review #418: a hivatkozott médiaazonosítók (32 hex jegy a kisfilm JSON-jában) EGYSZER, egy átmeneti,
    // elsődleges kulcsos halmazba kerülnek; a jelölés és a törlés ehhez egyenlőséggel (indexen) mér. Az először hivatkozatlanul talált
    // sor csak árvának jelölődik (orphaned_at), törölni az árvaság türelmi ideje után, korlátos adagokban szabad; az újra hivatkozott
    // sor jelölése törlődik. A kör advisory lockja alatt fut, így más példány épp készülő fejezetét nem érinti.
    // A körben a zárkapcsolaton, EGY tranzakcióban: a kapcsolat eldobásakor a Postgres visszagörgeti (nincs „söprés a zár után”).
    return runTx(async (tx) => {
      const run = (statement: SQL) => tx.execute(statement);
      await run(sql`CREATE TEMP TABLE clip_media_refs (id text PRIMARY KEY) ON COMMIT DROP`);
      await run(sql`INSERT INTO clip_media_refs (id)
        SELECT DISTINCT (regexp_matches(c.clip::text, '[0-9a-f]{32}', 'g'))[1] FROM lesson_clips c WHERE c.clip IS NOT NULL ON CONFLICT DO NOTHING`);
      await run(sql`UPDATE lesson_clip_media m SET orphaned_at = NULL
        WHERE m.orphaned_at IS NOT NULL AND EXISTS (SELECT 1 FROM clip_media_refs r WHERE r.id = m.id::text)`);
      await run(sql`UPDATE lesson_clip_media m SET orphaned_at = now()
        WHERE m.orphaned_at IS NULL AND NOT EXISTS (SELECT 1 FROM clip_media_refs r WHERE r.id = m.id::text)`);
      let total = 0, bytes = 0;
      for (let batch = 0; batch < CLIP_PRUNE_MAX_BATCHES; batch++) {
        const { rows } = await run(sql`DELETE FROM lesson_clip_media WHERE id IN (
          SELECT m.id FROM lesson_clip_media m
          WHERE m.orphaned_at < now() - make_interval(secs => ${Math.floor(graceMs / 1000)})
            AND NOT EXISTS (SELECT 1 FROM clip_media_refs r WHERE r.id = m.id::text)
          LIMIT ${CLIP_PRUNE_BATCH}) RETURNING size`);
        for (const r of rows as Array<{ size?: unknown }>) { total++; bytes += Number(r.size ?? 0); }
        if (rows.length < CLIP_PRUNE_BATCH) break;
      }
      return { rows: total, bytes };
    });
  },
  };
}

/**
 * A kör tára a zárat tartó kapcsolaton („a kör minden írása a zárral együtt él és hal”): a tranzakciók sorban futnak ugyanazon a
 * kapcsolaton, így a kapcsolat eldobásakor a még nyitott tranzakció visszagörgetődik, és a zár is felenged.
 */
function sessionStore(client: PoolClient): ClipStore {
  const session = drizzle(client);
  let chain: Promise<unknown> = Promise.resolve();
  const runTx: RunTx = (work) => {
    const next = chain.then(() => session.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${CLIP_STATEMENT_TIMEOUT_MS}`));
      return work(tx as unknown as ClipTx);
    }));
    chain = next.catch(() => undefined);
    return next;
  };
  return { ...storeOn(runTx), exclusive: () => Promise.reject(new Error("a körön belül nincs újabb zár")) };
}

/** Kör nélkül (kiszolgálás) a poolon; az `exclusive` a kört a zárat tartó kapcsolaton futtatja. */
export const dbClipStore: ClipStore = {
  ...storeOn(withClipStatementTimeout),
  exclusive(work) {
    // A zár- és a feloldó lekérdezés kliensoldali `query_timeout`-tal; eldobáskor a szerveroldali folyamat is leáll (DB-oldali védelem).
    return exclusiveWithLock(() => dbPool.connect() as Promise<LockClient>, CLIP_LOCK_KEY, CLIP_STATEMENT_TIMEOUT_MS,
      (client) => work(sessionStore(client as unknown as PoolClient)),
      (pid) => { void terminateClipBackend((target) => dbPool.query("SELECT pg_terminate_backend($1)", [target]), pid, (message) => logger.warn(message)); });
  },
};
