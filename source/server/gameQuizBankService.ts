import { isPlayableQuestion, uniqueQuizContent } from "../shared/game-quiz-contract";
/**
 * Játék kvíz-bank (PostgreSQL).
 *
 * Tananyag (`html_files`): a feltöltött anyagok HTML-lel vannak tárolva, nincs egységes „kvíz sor” séma
 * a tananyag táblában. Ezért:
 * - új kérdések ide kerülnek (`game_quiz_items`), opcionálisan `source_material_id` = melyik anyaghoz kapcsolódik;
 * - később: admin UI, import CSV, vagy célzott HTML-parser (pl. v7 data-* kvíz blokkok), ami ebbe a táblába tölt.
 *
 * A kliens mindig egyesíti a statikus fallback bankot a GET /api/games/quiz-bank válasszal.
 *
 * Speciális: a Space Asteroid Quiz a játékos osztály-szintje alapján kéri le
 * a LEGUTÓBBI N tananyagához kapcsolt kvízeket (`listLatestMaterialQuizzes`).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles } from "@shared/schema";

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
};

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

  const rows = await db
    .select()
    .from(gameQuizItems)
    .where(and(eq(gameQuizItems.gameId, gameId), eq(gameQuizItems.isActive, true)));

  const out: GameQuizBankRow[] = [];
  for (const r of rows) {
    const s = sanitizeRow(r);
    if (s) out.push(s);
  }
  return out;
}

export type LatestMaterialQuizzes = {
  classroom: number;
  materials: { id: string; title: string; createdAt: string }[];
  items: GameQuizBankRow[];
};

/**
 * A megadott osztály LEGUTÓBBI `materialLimit` (alap: 3) tananyagához kapcsolt
 * `gameQuizItems` rekordokat adja vissza. A Space Asteroid Quiz ezt használja,
 * hogy a játékos saját osztályának közelmúltbeli anyagából tegyen fel kérdéseket.
 *
 * Ha nincs egyetlen kapcsolt kvíz sem, az `items: []` üres tömb — a kliens
 * statikus fallbackre vált.
 */
export async function listLatestMaterialQuizzes(
  classroom: number,
  materialLimit = 3,
): Promise<LatestMaterialQuizzes> {
  const cls = Math.max(0, Math.min(12, Math.floor(classroom)));
  const limit = Math.max(1, Math.min(10, Math.floor(materialLimit)));

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

  const rows = await db
    .select()
    .from(gameQuizItems)
    .where(
      and(
        eq(gameQuizItems.isActive, true),
        inArray(gameQuizItems.sourceMaterialId, materialIds),
      ),
    )
    .limit(200); // payload-védelem: 3 anyag × sok generálás se nőhessen korlátlanul

  const items: GameQuizBankRow[] = [];
  for (const r of rows) {
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
