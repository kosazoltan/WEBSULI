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
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { and, desc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles, knowledgeMaps, lessons } from "@shared/schema";
import { canonicalLessonQuiz, quizTopic, type CanonicalQuizRow } from "./studio/canonical-quiz-bank";
import { COUPON_GAME_IDS } from "./studio/quiz-export";
import { logger } from "./lib/logger";
import { MAX_CLASSROOM, MIN_CLASSROOM, pickClassroomSet } from "./lib/quiz-bank-classroom";

export { MIN_CLASSROOM_ITEMS, pickClassroomSet } from "./lib/quiz-bank-classroom";

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
  /**
   * Kanban #84 (J7b): a forrás-lecke VALÓDI tantárgya `quizTopic`-alakban („english” / „math” / „nature” / „hungarian” /
   * a lecke tantárgy-felirata). Csak a `material-quizzes` válasz hordozza; ha nem állapítható meg, a mező HIÁNYZIK
   * (a régi kliensek és a többi játék változatlanul működik). A `topic` régi Stúdió-exportnál a lecke címe, ezért abból
   * nem lehet tantárgyat kitalálni.
   */
  subject?: string;
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
      ORDER BY coalesce(${lessons.htmlFileId}, ${lessons.id}), ${lessons.version} DESC, ${lessons.publishedAt} DESC, ${lessons.id} DESC
    ) latest
    ORDER BY version DESC, published_at DESC, id DESC`); // review #637: determinisztikus holtverseny-feloldás (a kvízgenerátorral azonos)
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

/**
 * A régi (nem kanonikus) exportok egy játékra — a kanonikus bankkal fedett lecke / anyag elavult másolatai nélkül.
 * Kanban #101: `materialIds` megadásával csak ezeknek az anyagoknak a sorai (az évfolyam-változathoz; a szűrés az adatbázisban fut).
 */
async function legacyRows(gameId: string, canonical: CanonicalBank, materialIds?: readonly string[]): Promise<GameQuizBankRow[]> {
  if (materialIds && materialIds.length === 0) return [];
  const rows = await db
    .select()
    .from(gameQuizItems)
    .where(and(
      eq(gameQuizItems.gameId, gameId),
      eq(gameQuizItems.isActive, true),
      materialIds ? inArray(gameQuizItems.sourceMaterialId, [...materialIds]) : undefined,
    ));
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
 * - Single-flight: azonos lenyomatra egyetlen építés fut, a párhuzamos kérések azt várják. Review #478 (M1): egyszerre
 *   LEGFELJEBB EGY építés fut; közben érkező új lenyomatok egyetlen követő építésbe vonódnak össze („a legutóbbi nyer”).
 * - Biztonsági háló: 15 perces lejárat.
 * ------------------------------------------------------------------------------------------------------------------ */

export const QUIZ_BANK_CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_WARN_BYTES = 32 * 1024 * 1024;

/**
 * `etag` (kanban #101): gyenge validátor a KIBONTOTT test SHA-1-éből — azonos tartalom → azonos ETag (a 15 perces újraépítés és a
 * `?classroom=` változat után is), a gzip és a kibontott alak ugyanazt a tartalmat jelenti.
 */
export type GameQuizBankResponse = { gzip: Buffer; bytes: number; items: number; etag: string };

/** Egy kanonikus darab: egy lecke (anyag) egymást követő tételei, a válasz-alakban vesszővel összefűzve. */
type CanonicalPart = { materialId: string | null; count: number; json: Buffer };

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
  /** A lenyomat-lekérdezés indításának sorszáma (monoton): a nagyobb a frissebb. */
  fpAt: number;
  builtAt: number;
  /**
   * A kanonikus tételek a válasz-alakban, anyagonkénti darabokban (a sorrend a teljes válaszé). Kanban #101: a darabolás az
   * évfolyam-változat miatt kell; a teljes válasz a darabokból bájtra azonosan áll össze.
   */
  canonicalParts: CanonicalPart[];
  canonicalCount: number;
  canonical: Pick<CanonicalBank, "materialIds" | "lessonIds">;
  games: Map<string, Promise<GameQuizBankResponse>>;
  /** Kanban #101: `gameId#c<N>` → az évfolyam-változat (legfeljebb 13 × 6 kulcs pillanatképenként). */
  variants: Map<string, Promise<GameQuizBankResponse>>;
  /** A kész (nem teljes-bank) változatok gzip-mérete összesen — a memória-figyelmeztetéshez (review #101 A2). */
  variantBytes: number;
};

let current: Snapshot | null = null;
type Flight = { fingerprint: string; fpAt: number; promise: Promise<Snapshot> };
/** A futó (legfeljebb egy) építés, és a mögötte várakozó egyetlen követő építés. */
let building: Flight | null = null;
let next: Flight | null = null;
let fpSeq = 0;
let activeBuilds = 0;
const stats = { builds: 0, gameBuilds: 0, variantBuilds: 0, hits: 0, maxConcurrentBuilds: 0 };

export function quizBankCacheStats() {
  return { ...stats, fingerprint: current?.fingerprint ?? null };
}

export function resetQuizBankCacheForTests(): void {
  current = null; building = null; next = null; legacyOnly.clear();
  stats.builds = 0; stats.gameBuilds = 0; stats.variantBuilds = 0; stats.hits = 0; stats.maxConcurrentBuilds = 0;
}

/** A kupon-játékok lenyomata: közzétett leckék + a kupon-játékok régi exportjai. */
async function quizBankFingerprint(): Promise<{ fingerprint: string; fpAt: number }> {
  const fpAt = ++fpSeq;
  const games = [...COUPON_GAME_IDS];
  const { rows } = await db.execute<{ fp: string }>(sql`
    SELECT md5(
      coalesce((SELECT string_agg(id || ':' || xmin::text, ',' ORDER BY id) FROM ${lessons} WHERE ${lessons.publishedAt} IS NOT NULL), '')
      || '|' ||
      coalesce((SELECT string_agg(id || ':' || xmin::text, ',' ORDER BY id) FROM ${gameQuizItems} WHERE ${inArray(gameQuizItems.gameId, games)}), '')
      || '|' ||
      -- Review #101 K2: az évfolyam-változat az anyag évfolyamából számol; egy régi (lecke nélküli) anyag áthelyezése csak a
      -- html_files sort írja. Csak az id:classroom pár számít (nem az xmin), így más oszlop írása nem érvényteleníti a bankot.
      coalesce((SELECT string_agg(${htmlFiles.id} || ':' || ${htmlFiles.classroom}::text, ',' ORDER BY ${htmlFiles.id}) FROM ${htmlFiles}), '')
    ) AS fp`);
  return { fingerprint: rows[0].fp, fpAt };
}

async function buildSnapshot(fingerprint: string, fpAt: number): Promise<Snapshot> {
  stats.builds++;
  activeBuilds++;
  stats.maxConcurrentBuilds = Math.max(stats.maxConcurrentBuilds, activeBuilds);
  try { return await buildSnapshotInner(fingerprint, fpAt); } finally { activeBuilds--; }
}

async function buildSnapshotInner(fingerprint: string, fpAt: number): Promise<Snapshot> {
  // Kötegenként szerializálunk: egyszerre csak egy köteg tétel-objektuma él. A deduplikáció a `uniqueQuizContent`
  // kanonikus kulcsa (`canonical:<id>`) szerint, a kötegeken át.
  const ids = new Set<string>();
  const canonicalParts: CanonicalPart[] = [];
  const seen = await scanPublishedCanonical(undefined, undefined, (batch) => {
    // Egymást követő, azonos anyagú tételek egy darabba (egy lecke tételei egymás után jönnek).
    let materialId: string | null | undefined;
    let pending: string[] = [];
    const flush = () => {
      if (pending.length) canonicalParts.push({ materialId: materialId ?? null, count: pending.length, json: Buffer.from(pending.join(","), "utf8") });
      pending = [];
    };
    for (const item of uniqueQuizContent(batch)) {
      if (ids.has(item.id)) continue;
      ids.add(item.id);
      if (item.sourceMaterialId !== materialId) { flush(); materialId = item.sourceMaterialId; }
      pending.push(JSON.stringify(quizBankApiItem(item)));
    }
    flush();
  });
  return { fingerprint, fpAt, builtAt: Date.now(), canonicalParts, canonicalCount: ids.size, canonical: seen, games: new Map(), variants: new Map(), variantBytes: 0 };
}

/** Az egyetlen építés indítása; a `current` csak frissebb (nagyobb `fpAt`-ű) pillanatképre cserélődik. */
function startBuild(fingerprint: string, fpAt: number): Flight {
  const flight: Flight = {
    fingerprint, fpAt,
    promise: buildSnapshot(fingerprint, fpAt).then(
      (snap) => {
        if (!current || snap.fpAt >= current.fpAt) current = snap;
        return snap;
      },
    ).finally(() => { if (building === flight) building = null; }),
  };
  building = flight;
  return flight;
}

async function snapshotFor(fingerprint: string, fpAt: number): Promise<Snapshot> {
  const fresh = (snap: Snapshot | null) => snap !== null && Date.now() - snap.builtAt < QUIZ_BANK_CACHE_TTL_MS;
  if (fresh(current) && (current!.fingerprint === fingerprint || current!.fpAt > fpAt)) {
    // Azonos lenyomat, vagy a kérés lenyomata régebbi a kész pillanatképnél (review #478 L1): a kész a legalább olyan friss.
    stats.hits++;
    return current!;
  }
  if (building && (building.fingerprint === fingerprint || building.fpAt > fpAt)) return building.promise;
  if (next) {
    // Már vár egy követő építés: a legutóbbi lenyomat nyer, egyetlen építés marad.
    if (fpAt > next.fpAt) { next.fingerprint = fingerprint; next.fpAt = fpAt; }
    return next.promise;
  }
  if (!building) return startBuild(fingerprint, fpAt).promise;
  // Építés fut más lenyomattal: legfeljebb egy követő, a futó UTÁN (sikertől / hibától függetlenül).
  const follower: Flight = {
    fingerprint, fpAt,
    promise: building.promise.then(() => undefined, () => undefined).then(() => {
      next = null;
      if (fresh(current) && current!.fpAt >= follower.fpAt) return current!;
      return startBuild(follower.fingerprint, follower.fpAt).promise;
    }),
  };
  next = follower;
  return follower.promise;
}

/** A válasz: `{"gameId":…,"items":[<kanonikus rész>,<régi exportok>]}`, gzip-pel tömörítve. */
function serializeResponse(gameId: string, canonical: readonly CanonicalPart[], legacy: GameQuizBankRow[]): GameQuizBankResponse {
  const COMMA = Buffer.from(",", "utf8");
  const parts: Buffer[] = [Buffer.from(`{"gameId":${JSON.stringify(gameId)},"items":[`, "utf8")];
  let count = 0;
  for (const part of canonical) {
    if (count) parts.push(COMMA);
    parts.push(part.json);
    count += part.count;
  }
  if (legacy.length) {
    if (count) parts.push(COMMA);
    parts.push(Buffer.from(legacy.map(r => JSON.stringify(quizBankApiItem(r))).join(","), "utf8"));
  }
  parts.push(Buffer.from("]}", "utf8"));
  const body = Buffer.concat(parts);
  const etag = `W/"qb-${createHash("sha1").update(body).digest("base64url")}"`;
  return { gzip: gzipSync(body, { level: 6 }), bytes: body.length, items: count + legacy.length, etag };
}

const partsBytes = (parts: readonly CanonicalPart[]) => parts.reduce((s, p) => s + p.json.length, 0);

async function buildGame(snap: Snapshot, gameId: string): Promise<GameQuizBankResponse> {
  stats.gameBuilds++;
  const legacy = uniqueQuizContent(await legacyRows(gameId, { ...snap.canonical, items: [] }));
  const response = serializeResponse(gameId, snap.canonicalParts, legacy);
  const cached = partsBytes(snap.canonicalParts) + snap.games.size * response.gzip.length + snap.variantBytes;
  if (cached > CACHE_WARN_BYTES) logger.warn(`[GAMES] quiz-bank gyorsítótár nagy: ~${Math.round(cached / 1048576)} MB`);
  return response;
}

/**
 * Kanban #101: az évfolyam-változat. Az anyag → évfolyam térkép két oszlopos lekérdezés; a régi exportok csak a szomszédos évfolyamok
 * anyagaira (adatbázis-oldali szűrés). A változat a teljes válasz részhalmaza: a kanonikus darabok sorrendje megmarad, a régi exportok
 * egyedisítő kulcsa az anyagot is tartalmazza, ezért az anyag szerinti szűrés és az egyedisítés felcserélhető. Ha a szabály a teljes
 * bankot adja (`null`), a teljes válasz objektuma megy (nincs külön tárolt példány). Anyag nélküli lecke tétele csak a teljes bankban van.
 */
async function buildVariant(snap: Snapshot, gameId: string, classroom: number, full: () => Promise<GameQuizBankResponse>): Promise<GameQuizBankResponse> {
  stats.variantBuilds++;
  const files = await db.select({ id: htmlFiles.id, classroom: htmlFiles.classroom }).from(htmlFiles);
  const classroomOf = new Map(files.map((f) => [f.id, f.classroom]));
  const near = new Set([classroom - 1, classroom, classroom + 1]);
  const nearMaterials = files.filter((f) => near.has(f.classroom)).map((f) => f.id);
  const legacy = uniqueQuizContent(await legacyRows(gameId, { ...snap.canonical, items: [] }, nearMaterials));
  const inSet = (materialId: string | null, set: ReadonlySet<number>) => materialId !== null && set.has(classroomOf.get(materialId) ?? -1);
  const count = (classrooms: readonly number[]) => {
    const set = new Set(classrooms);
    let n = 0;
    for (const p of snap.canonicalParts) if (inSet(p.materialId, set)) n += p.count;
    for (const r of legacy) if (inSet(r.sourceMaterialId, set)) n++;
    return n;
  };
  const chosen = pickClassroomSet(classroom, count);
  if (!chosen) return full();
  const set = new Set(chosen);
  const response = serializeResponse(gameId, snap.canonicalParts.filter((p) => inSet(p.materialId, set)), legacy.filter((r) => inSet(r.sourceMaterialId, set)));
  snap.variantBytes += response.gzip.length;
  const cached = partsBytes(snap.canonicalParts) + snap.variantBytes;
  if (cached > CACHE_WARN_BYTES) logger.warn(`[GAMES] quiz-bank gyorsítótár nagy (változatokkal): ~${Math.round(cached / 1048576)} MB`);
  return response;
}

/**
 * Review #478 (Codex P2): a nem kupon-játék (Szólétra) bankja csak a saját régi exportjaiból áll — a kanonikus
 * pillanatképet nem építheti (a régi út sem olvasott leckét). Saját, játékonkénti lenyomat + gyorsítótár.
 */
const legacyOnly = new Map<string, { fingerprint: string; builtAt: number; promise: Promise<GameQuizBankResponse> }>();

async function legacyOnlyResponse(gameId: string): Promise<GameQuizBankResponse> {
  const { rows } = await db.execute<{ fp: string }>(sql`
    SELECT md5(coalesce((SELECT string_agg(id || ':' || xmin::text, ',' ORDER BY id) FROM ${gameQuizItems} WHERE ${eq(gameQuizItems.gameId, gameId)}), '')) AS fp`);
  const fingerprint = rows[0].fp;
  const hit = legacyOnly.get(gameId);
  if (hit && hit.fingerprint === fingerprint && Date.now() - hit.builtAt < QUIZ_BANK_CACHE_TTL_MS) { stats.hits++; return hit.promise; }
  stats.gameBuilds++;
  const promise = legacyRows(gameId, emptyBank()).then(legacy => serializeResponse(gameId, [], uniqueQuizContent(legacy)));
  const entry = { fingerprint, builtAt: Date.now(), promise };
  legacyOnly.set(gameId, entry);
  promise.catch(() => { if (legacyOnly.get(gameId) === entry) legacyOnly.delete(gameId); });
  return promise;
}

/**
 * A `GET /api/games/quiz-bank/:gameId` kész, gzip-pel tömörített válasza; `null` = ismeretlen játék.
 * A kibontott tartalom bájtra azonos a `listGameQuizBank` + `quizBankApiItem` leképezéssel.
 */
export async function gameQuizBankResponse(gameId: string, classroom?: number): Promise<GameQuizBankResponse | null> {
  if (!ALLOWED_GAME_IDS.has(gameId)) return null;
  // A nem kupon-játék (Szólétra) bankja a saját régi exportjaiból áll (néhány tétel): az évfolyam-paraméter rá nem vonatkozik.
  if (!isCouponGame(gameId)) return legacyOnlyResponse(gameId);
  const { fingerprint, fpAt } = await quizBankFingerprint();
  const snap = await snapshotFor(fingerprint, fpAt);
  const full = (): Promise<GameQuizBankResponse> => {
    let game = snap.games.get(gameId);
    if (!game) {
      game = buildGame(snap, gameId);
      snap.games.set(gameId, game);
      game.catch(() => { if (snap.games.get(gameId) === game) snap.games.delete(gameId); });
    }
    return game;
  };
  if (classroom === undefined) return full();
  if (!Number.isInteger(classroom) || classroom < MIN_CLASSROOM || classroom > MAX_CLASSROOM) {
    throw new RangeError(`quiz-bank: érvénytelen évfolyam: ${classroom}`);
  }
  const key = `${gameId}#c${classroom}`;
  let variant = snap.variants.get(key);
  if (!variant) {
    variant = buildVariant(snap, gameId, classroom, full);
    snap.variants.set(key, variant);
    variant.catch(() => { if (snap.variants.get(key) === variant) snap.variants.delete(key); });
  }
  return variant;
}

/* ------------------------------------------------------------------------------------------------------------------ *
 * Kanban #84 — a `material-quizzes` tétel tantárgya (végrehajtás J7b, „J7b döntések” 9.)
 * ------------------------------------------------------------------------------------------------------------------ */

/** A kérdés-generátor (`gameQuizGeneratorService`) témái: a régi, generált soroknál ezek tantárgyak, nem címek. */
const GENERATOR_SUBJECT_TOPICS = new Set(["english", "math", "nature", "hungarian"]);

function withSubject<T extends GameQuizBankRow>(row: T, subject: string | null | undefined): T {
  const s = typeof subject === "string" ? subject.trim() : "";
  return s ? { ...row, subject: s } : row;
}

/** A kanonikus tétel `topic`-ja maga a lecke tantárgya (`quizTopic(lesson.subject)`, `canonical-quiz-bank.ts`). */
const canonicalWithSubject = (item: CanonicalQuizRow): CanonicalQuizRow & { subject?: string } => withSubject(item, item.topic);

type LegacySource = { lessonId: string | null; sourceMaterialId: string | null; topic: string | null };

/**
 * Review #487 L2 (rögzített döntés): a lecke tudástérképének tantárgya ELSŐBB, mint a generátor tételenkénti témája — a
 * tétel abból a leckéből jön (konzervatív: a térképtől eltérő generált téma nem lesz „biztos” más tantárgy).
 *
 * A régi exportok tantárgya: a lecke (közvetlenül a `lessonId`-n, vagy az anyagán át — a legfrissebb verzió) tudástérképének
 * tantárgya `quizTopic`-pal; a generált sornál a téma; különben nincs (a mező hiányzik). Egyetlen, `json` nélküli lekérdezés.
 */
async function legacySubjects(rows: readonly LegacySource[]): Promise<(row: LegacySource) => string | undefined> {
  const lessonIds = [...new Set(rows.map((r) => r.lessonId).filter((v): v is string => !!v))];
  const materialIds = [...new Set(rows.map((r) => r.sourceMaterialId).filter((v): v is string => !!v))];
  const byLesson = new Map<string, string>();
  const byMaterial = new Map<string, string>();
  if (lessonIds.length || materialIds.length) {
    const found = await db
      .select({ id: lessons.id, htmlFileId: lessons.htmlFileId, subject: knowledgeMaps.subject })
      .from(lessons)
      .innerJoin(knowledgeMaps, eq(knowledgeMaps.id, lessons.mapId))
      // Review #487 L1: csak KÖZZÉTETT lecke, és a `latestPublishedRows` rendezése (a `version` leckénként külön számláló,
      // két lecke között a közzététel ideje dönt) — az anyag tantárgya a legfrissebb közzétett leckéé.
      .where(and(
        isNotNull(lessons.publishedAt),
        or(
          lessonIds.length ? inArray(lessons.id, lessonIds) : undefined,
          materialIds.length ? inArray(lessons.htmlFileId, materialIds) : undefined,
        ),
      ))
      .orderBy(desc(lessons.version), desc(lessons.publishedAt));
    for (const f of found) {
      const subject = quizTopic(f.subject);
      if (!subject) continue;
      byLesson.set(f.id, subject);
      if (f.htmlFileId && !byMaterial.has(f.htmlFileId)) byMaterial.set(f.htmlFileId, subject);
    }
  }
  return (row) => {
    if (row.lessonId && byLesson.has(row.lessonId)) return byLesson.get(row.lessonId);
    if (row.sourceMaterialId && byMaterial.has(row.sourceMaterialId)) return byMaterial.get(row.sourceMaterialId);
    const topic = (row.topic ?? "").trim().toLowerCase();
    return GENERATOR_SUBJECT_TOPICS.has(topic) ? topic : undefined;
  };
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
    const subjectOf = await legacySubjects(legacy);
    const legacyItems: GameQuizBankRow[] = [];
    for (const r of legacy) {
      const s = sanitizeRow(r);
      if (s) legacyItems.push(withSubject(s, subjectOf(r)));
    }
    return { classroom: material?.classroom ?? cls,
      materials: material ? [{ id: material.id, title: material.title, createdAt: material.createdAt.toISOString() }] : [],
      items: uniqueQuizContent(canonical ? canonical.map(canonicalWithSubject) : legacyItems) };
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

  const items: GameQuizBankRow[] = canonical.items.map(canonicalWithSubject);
  const kept = rows.filter((r) => !((r.lessonId && canonical.lessonIds.has(r.lessonId)) || (r.sourceMaterialId && canonical.materialIds.has(r.sourceMaterialId))));
  const subjectOf = await legacySubjects(kept);
  for (const r of kept) {
    const s = sanitizeRow(r);
    if (s) items.push(withSubject(s, subjectOf(r)));
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
