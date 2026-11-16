import { isPlayableQuestion, uniqueQuizContent } from "../shared/game-quiz-contract";
/**
 * Játék kvíz-bank (PostgreSQL).
 *
 * A fúziós leckék egyetlen bankja a publikált `lessons.json.experience.quiz`.
 * A régi HTML-anyagok és check-blokkok `game_quiz_items` exportjai továbbra is olvashatók.
 * Kanonikus bank mellett az azonos lecke/anyag elavult exportjai nem kerülnek a válaszba.
 *
 * A kliens mindig egyesíti a statikus fallback bankot a GET /api/games/quiz-bank válasszal.
 *
 * Speciális: a Space Asteroid Quiz a játékos osztály-szintje alapján kéri le
 * a LEGUTÓBBI N tananyagához kapcsolt kvízeket (`listLatestMaterialQuizzes`).
 */
import { gzipSync } from "node:zlib";
import { and, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles, lessons } from "@shared/schema";
import { canonicalLessonQuiz, type CanonicalQuizRow } from "./studio/canonical-quiz-bank";
import { COUPON_GAME_IDS } from "./studio/quiz-export";
import { logger } from "./lib/logger";

const ALLOWED_GAME_IDS = new Set([
  "tsunami-english",
  "word-ladder-hu-en",
  "block-craft-quiz",
  "space-asteroid-quiz",
  "tornado-hunter-200",
  "brain-rot-steal",
]);

export type GameQuizBankRow = {
  id: string;
  gameId: string;
  tier: string;
  topic: string | null;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a MIÉRT, amit a játék rossz válasznál megmutat; régi soroknál null. */
  explanation: string | null;
  sourceMaterialId: string | null;
  lessonId?: string;
  questionId?: string;
  questionVersion?: string;
  coversConceptIds?: string[];
  feedbackPerOption?: string[];
};

/**
 * #67 (havi audit T1, 2026-11-16): legfeljebb ennyi lecke teljes `json`-ja van egyszerre a memóriában. A régi út MINDEN
 * közzétett sor (minden verzió) teljes JSON-ját egyetlen eredményben olvasta be — 300 leckénél +440 MB heap kérésenként.
 */
export const LESSON_JSON_BATCH = 16;

type CanonicalBank = { items: CanonicalQuizRow[]; materialIds: Set<string>; lessonIds: Set<string> };

/**
 * Anyagonként (anyag nélküli leckénél leckénként) a legfrissebb közzétett sor — `json` NÉLKÜL. A kiválasztás és a sorrend
 * azonos a `canonicalBanks` régi bemenetével (verzió, majd közzététel szerint csökkenő; az első sor nyer).
 */
async function latestPublishedRows(materialIds?: string[]) {
  const { rows } = await db.execute<{ id: string; html_file_id: string | null; version: number }>(sql`
    SELECT id, html_file_id, version FROM (
      SELECT DISTINCT ON (coalesce(${lessons.htmlFileId}, ${lessons.id})) ${lessons.id} AS id, ${lessons.htmlFileId} AS html_file_id,
        ${lessons.version} AS version, ${lessons.publishedAt} AS published_at
      FROM ${lessons}
      WHERE ${lessons.publishedAt} IS NOT NULL ${materialIds ? sql`AND ${inArray(lessons.htmlFileId, materialIds)}` : sql``}
      ORDER BY coalesce(${lessons.htmlFileId}, ${lessons.id}), ${lessons.version} DESC, ${lessons.publishedAt} DESC
    ) latest
    ORDER BY version DESC, published_at DESC`);
  return rows;
}

/**
 * A közzétett kanonikus bank kötegenként: az `onBatch` egy köteg (≤ LESSON_JSON_BATCH lecke) tételeit kapja, a köteg
 * nyers JSON-ja utána eldobható. A `materialIds` / `lessonIds` halmazok a teljes bejárás után teljesek.
 */
async function scanPublishedCanonical(
  materialIds: string[] | undefined,
  gameId: string | undefined,
  onBatch: (items: CanonicalQuizRow[]) => void,
): Promise<Pick<CanonicalBank, "materialIds" | "lessonIds">> {
  const latest = await latestPublishedRows(materialIds);
  const seen = { materialIds: new Set<string>(), lessonIds: new Set<string>() };
  for (let i = 0; i < latest.length; i += LESSON_JSON_BATCH) {
    const chunk = latest.slice(i, i + LESSON_JSON_BATCH);
    const rows = await db.select({ id: lessons.id, json: lessons.json }).from(lessons)
      .where(and(inArray(lessons.id, chunk.map(r => r.id)), isNotNull(lessons.publishedAt)));
    const jsonById = new Map(rows.map(r => [r.id, r.json]));
    const batch: CanonicalQuizRow[] = [];
    for (const row of chunk) {
      // A két lekérdezés között visszavont / törölt sor kimarad; az ujjlenyomat úgyis új építést kér.
      if (!jsonById.has(row.id)) continue;
      const items = canonicalLessonQuiz({ id: row.id, json: jsonById.get(row.id), htmlFileId: row.html_file_id, version: Number(row.version) }, gameId);
      if (items === null) continue;
      for (const item of items) batch.push(item);
      seen.lessonIds.add(row.id);
      if (row.html_file_id) seen.materialIds.add(row.html_file_id);
    }
    onBatch(batch);
  }
  return seen;
}

/** A közzétett kanonikus bank egyben (kis halmazra: egy játék / néhány anyag). */
async function loadPublishedCanonical(materialIds?: string[], gameId?: string): Promise<CanonicalBank> {
  const items: CanonicalQuizRow[] = [];
  const seen = await scanPublishedCanonical(materialIds, gameId, (batch) => { for (const item of batch) items.push(item); });
  return { items, ...seen };
}

const emptyBank = (): CanonicalBank => ({ items: [], materialIds: new Set(), lessonIds: new Set() });

function sanitizeRow(r: typeof gameQuizItems.$inferSelect): GameQuizBankRow | null {
  if (!isPlayableQuestion(r)) return null;
  const opts = r.options;
  const ci = r.correctIndex;
  return {
    id: r.id,
    gameId: r.gameId,
    tier: ({ "1": "easy", "2": "medium", "3": "hard", med: "medium" } as Record<string, string>)[r.tier] ?? r.tier,
    topic: r.topic,
    prompt: r.prompt,
    options: opts,
    correctIndex: ci,
    explanation: r.explanation ?? null,
    sourceMaterialId: r.sourceMaterialId,
  };
}

const isCouponGame = (gameId: string) => (COUPON_GAME_IDS as readonly string[]).includes(gameId);

/** A régi (nem kanonikus) exportok egy játékra — a kanonikus bankkal fedett lecke / anyag elavult másolatai nélkül. */
async function legacyRows(gameId: string, canonical: CanonicalBank): Promise<GameQuizBankRow[]> {
  const rows = await db
    .select()
    .from(gameQuizItems)
    .where(and(eq(gameQuizItems.gameId, gameId), eq(gameQuizItems.isActive, true)));
  const out: GameQuizBankRow[] = [];
  for (const r of rows) {
    if ((r.lessonId && canonical.lessonIds.has(r.lessonId)) || (r.sourceMaterialId && canonical.materialIds.has(r.sourceMaterialId))) continue;
    const s = sanitizeRow(r);
    if (s) out.push(s);
  }
  return out;
}

export async function listGameQuizBank(gameId: string): Promise<GameQuizBankRow[]> {
  if (!ALLOWED_GAME_IDS.has(gameId)) return [];
  const canonical = isCouponGame(gameId) ? await loadPublishedCanonical(undefined, gameId) : emptyBank();
  return uniqueQuizContent([...canonical.items, ...await legacyRows(gameId, canonical)]);
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * #67 — a `GET /api/games/quiz-bank/:gameId` kész válaszának gyorsítótára (terv: docs/specs/2026-11-16-quiz-bank-memoria.md)
 *
 * - Érvényesítés: minden kérésnél egy könnyű lekérdezés — a közzétett `lessons` és az engedélyezett játékok
 *   `game_quiz_items` sorainak `id:xmin` lenyomata. Bármely INSERT / UPDATE / DELETE új `xmin`-t ad, így minden írási út
 *   (Stúdió, javítás, évfolyam-váltás, migráció, szkript, kézi SQL, másik folyamat) érvénytelenít, írási pontonkénti kód
 *   nélkül. A `json` (TOAST) ehhez nem töltődik be.
 * - Egyetlen pillanatkép él: a kanonikus rész egyszer szerializálva (UTF-8 `Buffer`), játékonként a kész, gzip-pel
 *   tömörített válasz. Méret: szerkezetileg korlátos (1 kanonikus rész + legfeljebb 6 játék).
 * - Single-flight: azonos lenyomatra egyetlen építés fut, a párhuzamos kérések azt várják.
 * - Biztonsági háló: 15 perces lejárat.
 * ------------------------------------------------------------------------------------------------------------------ */

export const QUIZ_BANK_CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_WARN_BYTES = 32 * 1024 * 1024;

export type GameQuizBankResponse = { gzip: Buffer; bytes: number; items: number };

/** Pontosan a route eddigi leképezése (mezősorrendre is) — a kliens-szerződés nem változik. */
export function quizBankApiItem(r: GameQuizBankRow) {
  return {
    id: r.id,
    tier: r.tier,
    topic: r.topic,
    prompt: r.prompt,
    options: r.options,
    correctIndex: r.correctIndex,
    // T-1: a magyarázat is menjen ki, különben a játék némán büntet.
    explanation: r.explanation,
    sourceMaterialId: r.sourceMaterialId,
  };
}

type Snapshot = {
  fingerprint: string;
  builtAt: number;
  /** A kanonikus tételek a válasz-alakban, vesszővel elválasztva, szögletes zárójel nélkül. */
  canonicalJson: Buffer;
  canonicalCount: number;
  canonical: Pick<CanonicalBank, "materialIds" | "lessonIds">;
  games: Map<string, Promise<GameQuizBankResponse>>;
};

let current: Snapshot | null = null;
let inflight: { fingerprint: string; promise: Promise<Snapshot> } | null = null;
const stats = { builds: 0, gameBuilds: 0, hits: 0 };

export function quizBankCacheStats() {
  return { ...stats, fingerprint: current?.fingerprint ?? null };
}

export function resetQuizBankCacheForTests(): void {
  current = null; inflight = null;
  stats.builds = 0; stats.gameBuilds = 0; stats.hits = 0;
}

async function quizBankFingerprint(): Promise<string> {
  const games = [...ALLOWED_GAME_IDS];
  const { rows } = await db.execute<{ fp: string }>(sql`
    SELECT md5(
      coalesce((SELECT string_agg(id || ':' || xmin::text, ',' ORDER BY id) FROM ${lessons} WHERE ${lessons.publishedAt} IS NOT NULL), '')
      || '|' ||
      coalesce((SELECT string_agg(id || ':' || xmin::text, ',' ORDER BY id) FROM ${gameQuizItems} WHERE ${inArray(gameQuizItems.gameId, games)}), '')
    ) AS fp`);
  return rows[0].fp;
}

async function buildSnapshot(fingerprint: string): Promise<Snapshot> {
  stats.builds++;
  // Kötegenként szerializálunk: egyszerre csak egy köteg tétel-objektuma él. A deduplikáció a `uniqueQuizContent`
  // kanonikus kulcsa (`canonical:<id>`) szerint, a kötegeken át.
  const ids = new Set<string>();
  const chunks: Buffer[] = [];
  const seen = await scanPublishedCanonical(undefined, undefined, (batch) => {
    const parts: string[] = [];
    for (const item of uniqueQuizContent(batch)) {
      if (ids.has(item.id)) continue;
      ids.add(item.id);
      parts.push(JSON.stringify(quizBankApiItem(item)));
    }
    if (parts.length) chunks.push(Buffer.from((chunks.length ? "," : "") + parts.join(","), "utf8"));
  });
  return { fingerprint, builtAt: Date.now(), canonicalJson: Buffer.concat(chunks), canonicalCount: ids.size, canonical: seen, games: new Map() };
}

async function snapshotFor(fingerprint: string): Promise<Snapshot> {
  if (current && current.fingerprint === fingerprint && Date.now() - current.builtAt < QUIZ_BANK_CACHE_TTL_MS) {
    stats.hits++;
    return current;
  }
  if (inflight && inflight.fingerprint === fingerprint) return inflight.promise;
  const flight = {
    fingerprint,
    promise: buildSnapshot(fingerprint).then(
      (snap) => {
        // Egy közben indult, újabb lenyomatú építést a régi eredmény nem írhat felül.
        if (inflight === flight) { current = snap; inflight = null; }
        return snap;
      },
      (error: unknown) => { if (inflight === flight) inflight = null; throw error; },
    ),
  };
  inflight = flight;
  return flight.promise;
}

async function buildGame(snap: Snapshot, gameId: string): Promise<GameQuizBankResponse> {
  stats.gameBuilds++;
  const coupon = isCouponGame(gameId);
  const legacy = uniqueQuizContent(await legacyRows(gameId, coupon ? { ...snap.canonical, items: [] } : emptyBank()));
  const parts: Buffer[] = [Buffer.from(`{"gameId":${JSON.stringify(gameId)},"items":[`, "utf8")];
  if (coupon && snap.canonicalCount) parts.push(snap.canonicalJson);
  if (legacy.length) {
    if (coupon && snap.canonicalCount) parts.push(Buffer.from(",", "utf8"));
    parts.push(Buffer.from(legacy.map(r => JSON.stringify(quizBankApiItem(r))).join(","), "utf8"));
  }
  parts.push(Buffer.from("]}", "utf8"));
  const body = Buffer.concat(parts);
  const response = { gzip: gzipSync(body, { level: 6 }), bytes: body.length, items: (coupon ? snap.canonicalCount : 0) + legacy.length };
  const cached = snap.canonicalJson.length + snap.games.size * response.gzip.length;
  if (cached > CACHE_WARN_BYTES) logger.warn(`[GAMES] quiz-bank gyorsítótár nagy: ~${Math.round(cached / 1048576)} MB`);
  return response;
}

/**
 * A `GET /api/games/quiz-bank/:gameId` kész, gzip-pel tömörített válasza; `null` = ismeretlen játék.
 * A kibontott tartalom bájtra azonos a `listGameQuizBank` + `quizBankApiItem` leképezéssel.
 */
export async function gameQuizBankResponse(gameId: string): Promise<GameQuizBankResponse | null> {
  if (!ALLOWED_GAME_IDS.has(gameId)) return null;
  const snap = await snapshotFor(await quizBankFingerprint());
  let game = snap.games.get(gameId);
  if (!game) {
    game = buildGame(snap, gameId);
    snap.games.set(gameId, game);
    game.catch(() => { if (snap.games.get(gameId) === game) snap.games.delete(gameId); });
  }
  return game;
}

export type LatestMaterialQuizzes = {
  classroom: number;
  materials: { id: string; title: string; createdAt: string }[];
  items: GameQuizBankRow[];
};

/**
 * A megadott osztály LEGUTÓBBI `materialLimit` (alap: 3) tananyagához kapcsolt
 * közös bankját és a régi anyagok exportjait adja vissza. A Space Asteroid Quiz ezt használja,
 * hogy a játékos saját osztályának közelmúltbeli anyagából tegyen fel kérdéseket.
 *
 * Ha nincs egyetlen kapcsolt kvíz sem, az `items: []` üres tömb — a kliens
 * statikus fallbackre vált.
 */
export async function listLatestMaterialQuizzes(
  classroom: number,
  materialLimit = 3,
  lessonId?: string,
): Promise<LatestMaterialQuizzes> {
  const cls = Math.max(0, Math.min(12, Math.floor(classroom)));
  const limit = Math.max(1, Math.min(10, Math.floor(materialLimit)));

  // A lesson reward always practices that published lesson, even outside the latest three.
  if (lessonId) {
    const [lesson] = await db.select().from(lessons).where(and(eq(lessons.id, lessonId), isNotNull(lessons.publishedAt))).limit(1);
    if (!lesson) return { classroom: cls, materials: [], items: [] };
    const [material] = lesson.htmlFileId ? await db.select().from(htmlFiles).where(eq(htmlFiles.id, lesson.htmlFileId)).limit(1) : [];
    const canonical = canonicalLessonQuiz(lesson);
    const legacy = canonical === null ? await db.select().from(gameQuizItems).where(and(eq(gameQuizItems.lessonId, lessonId), eq(gameQuizItems.isActive, true))) : [];
    return { classroom: material?.classroom ?? cls,
      materials: material ? [{ id: material.id, title: material.title, createdAt: material.createdAt.toISOString() }] : [],
      items: uniqueQuizContent(canonical ?? legacy.map(sanitizeRow).filter((q): q is GameQuizBankRow => q !== null)) };
  }

  const latestMaterials = await db
    .select({
      id: htmlFiles.id,
      title: htmlFiles.title,
      createdAt: htmlFiles.createdAt,
    })
    .from(htmlFiles)
    .where(eq(htmlFiles.classroom, cls))
    .orderBy(desc(htmlFiles.createdAt))
    .limit(limit);

  const materialIds = latestMaterials.map((m) => m.id);
  if (materialIds.length === 0) {
    return { classroom: cls, materials: [], items: [] };
  }

  const canonical = await loadPublishedCanonical(materialIds);
  // Legacy copies differ by game/id only. Deduplicate in PostgreSQL BEFORE the
  // payload limit, so five exports do not consume five places in the question bank.
  const rows = await db
    .selectDistinctOn([gameQuizItems.sourceMaterialId, gameQuizItems.prompt, gameQuizItems.options, gameQuizItems.correctIndex, gameQuizItems.explanation])
    .from(gameQuizItems)
    .where(
      and(
        eq(gameQuizItems.isActive, true),
        inArray(gameQuizItems.sourceMaterialId, materialIds),
        canonical.materialIds.size ? notInArray(gameQuizItems.sourceMaterialId, [...canonical.materialIds]) : undefined,
      ),
    )
    .orderBy(gameQuizItems.sourceMaterialId, gameQuizItems.prompt, gameQuizItems.options, gameQuizItems.correctIndex, gameQuizItems.explanation, desc(gameQuizItems.createdAt))
    .limit(200);

  const items: GameQuizBankRow[] = [...canonical.items];
  for (const r of rows) {
    if ((r.lessonId && canonical.lessonIds.has(r.lessonId)) || (r.sourceMaterialId && canonical.materialIds.has(r.sourceMaterialId))) continue;
    const s = sanitizeRow(r);
    if (s) items.push(s);
  }

  return {
    classroom: cls,
    materials: latestMaterials.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: (m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt as unknown as string)).toISOString(),
    })),
    items: uniqueQuizContent(items),
  };
}
