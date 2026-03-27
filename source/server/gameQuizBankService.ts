/**
 * Játék kvíz-bank (PostgreSQL).
 *
 * Tananyag (`html_files`): a feltöltött anyagok HTML-lel vannak tárolva, nincs egységes „kvíz sor” séma
 * a tananyag táblában. Ezért:
 * - új kérdések ide kerülnek (`game_quiz_items`), opcionálisan `source_material_id` = melyik anyaghoz kapcsolódik;
 * - később: admin UI, import CSV, vagy célzott HTML-parser (pl. v7 data-* kvíz blokkok), ami ebbe a táblába tölt.
 *
 * A kliens mindig egyesíti a statikus fallback bankot a GET /api/games/quiz-bank válasszal.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems } from "@shared/schema";

const ALLOWED_GAME_IDS = new Set(["tsunami-english", "word-ladder-hu-en"]);

export type GameQuizBankRow = {
  id: string;
  gameId: string;
  tier: string;
  topic: string | null;
  prompt: string;
  options: string[];
  correctIndex: number;
  sourceMaterialId: string | null;
};

function sanitizeRow(r: typeof gameQuizItems.$inferSelect): GameQuizBankRow | null {
  const opts = r.options;
  if (!Array.isArray(opts) || opts.length !== 4 || !opts.every((x) => typeof x === "string")) return null;
  const ci = r.correctIndex;
  if (typeof ci !== "number" || ci < 0 || ci > 3) return null;
  return {
    id: r.id,
    gameId: r.gameId,
    tier: r.tier,
    topic: r.topic,
    prompt: r.prompt,
    options: opts,
    correctIndex: ci,
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
