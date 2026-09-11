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
import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles, lessons } from "@shared/schema";
import { canonicalBanks, canonicalLessonQuiz } from "./studio/canonical-quiz-bank";
import { COUPON_GAME_IDS } from "./studio/quiz-export";

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

async function publishedBanks(materialIds?: string[], gameId?: string) {
  const rows = await db.select({ id: lessons.id, json: lessons.json, htmlFileId: lessons.htmlFileId, version: lessons.version })
    .from(lessons).where(and(isNotNull(lessons.publishedAt), materialIds ? inArray(lessons.htmlFileId, materialIds) : undefined))
    .orderBy(desc(lessons.version), desc(lessons.publishedAt));
  return canonicalBanks(rows, gameId);
}

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

export async function listGameQuizBank(gameId: string): Promise<GameQuizBankRow[]> {
  if (!ALLOWED_GAME_IDS.has(gameId)) return [];

  const canonical = (COUPON_GAME_IDS as readonly string[]).includes(gameId)
    ? await publishedBanks(undefined, gameId) : canonicalBanks([]);
  const rows = await db
    .select()
    .from(gameQuizItems)
    .where(and(eq(gameQuizItems.gameId, gameId), eq(gameQuizItems.isActive, true)));

  const out: GameQuizBankRow[] = [...canonical.items];
  for (const r of rows) {
    if ((r.lessonId && canonical.lessonIds.has(r.lessonId)) || (r.sourceMaterialId && canonical.materialIds.has(r.sourceMaterialId))) continue;
    const s = sanitizeRow(r);
    if (s) out.push(s);
  }
  return uniqueQuizContent(out);
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

  const canonical = await publishedBanks(materialIds);
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
