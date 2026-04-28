/**
 * AI-alapú kvíz-generáló szolgáltatás (Claude / Anthropic).
 *
 * Egy meglévő tananyagból (`htmlFiles`) automatikusan kvíz-tételeket gyárt,
 * és beilleszti a `gameQuizItems` táblába. A generált tételek:
 *  - `gameId = "space-asteroid-quiz"` (alibi — minden játék kliens-oldalon
 *    `topic` alapján szűr; a `gameQuizItems.gameId` notNull, ezért kell egy
 *    érvényes catalog-azonosító, de a `material-quizzes` endpoint amúgy is
 *    gameId-tól függetlenül adja vissza)
 *  - `sourceMaterialId = materialId` — kötés a forrás-tananyaghoz, így a
 *    `listLatestMaterialQuizzes(classroom, 3)` automatikusan visszaadja
 *  - `topic ∈ {english | math | nature | hungarian}` — a játékok osztály-
 *    specifikus szűréshez használják (pl. Speed Quiz Math csak `math`)
 */
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles } from "@shared/schema";

const ANTHROPIC_API_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ALIBI_GAME_ID = "space-asteroid-quiz";

export type GeneratedQuizItem = {
  prompt: string;
  options: string[];
  correctIndex: number;
  topic: "english" | "math" | "nature" | "hungarian";
};

export type QuizGenerationResult = {
  materialId: string;
  materialTitle: string;
  inserted: number;
  skipped: number;
  errors: string[];
};

const SYSTEM_PROMPT = `Magyar általános / középiskolai (1-12. osztály) tananyagból kvíz-tételeket generálsz egy oktatási játék-platformhoz.

KÖVETELMÉNYEK minden generált tétel esetén:
- A kérdés MAGYAR nyelven van (kivéve angol szókincs-tételeknél, ahol angol szót/mondatot tesztelünk magyar fordítás-választással).
- 4 darab válasz-opció. Pontosan EGY helyes (correctIndex 0–3 között).
- Topic mező KÖTELEZŐEN a következők egyike: "english" (angol szókincs/nyelvtan), "math" (matematika), "nature" (természet/környezet/biológia/földrajz/fizika), "hungarian" (magyar nyelvtan/irodalom).
- A kérdés szövege rövid (max 100 karakter), érthető a megadott osztálynak.
- Válasz-opciók rövidek (max 30 karakter mindegyik), érthetőek, ugyanolyan hosszúak/stílusúak.
- A rossz válaszok hihetőek legyenek, ne triviálisan hibásak.
- NE használj idézőjelet ("," " " """ stb.) a prompt vagy options szövegében — JSON-parse miatt csak \\" escape-elt formában lenne kezelhető. Idézőjel helyett írd át (pl. "Star magyarul" — idézőjel nélkül).

KIMENET: SZIGORÚAN egyetlen JSON tömb, semmilyen magyarázat / markdown / előszó, csak nyers JSON.

Pontos formátum (példa):
[
  {"prompt": "Mennyi 7 x 8?", "options": ["49", "54", "56", "64"], "correctIndex": 2, "topic": "math"},
  {"prompt": "Star magyarul:", "options": ["bolygó", "csillag", "hold", "felhő"], "correctIndex": 1, "topic": "english"}
]`;

/**
 * Egy adott tananyagból `count` darab kvíz-tételt generál és beilleszt.
 * Visszaadja a sikeres + skipped + hiba-számot.
 */
export async function generateMaterialQuiz(
  materialId: string,
  count = 10,
): Promise<QuizGenerationResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API kulcs nincs konfigurálva (AI_INTEGRATIONS_ANTHROPIC_API_KEY hiányzik).");
  }
  const safeCount = Math.max(3, Math.min(20, Math.floor(count)));

  // 1. Tananyag betöltése
  const [material] = await db
    .select({ id: htmlFiles.id, title: htmlFiles.title, content: htmlFiles.content, classroom: htmlFiles.classroom })
    .from(htmlFiles)
    .where(eq(htmlFiles.id, materialId))
    .limit(1);
  if (!material) {
    throw new Error(`Tananyag nem található: ${materialId}`);
  }

  // 2. HTML → tiszta szöveg
  const stripped = material.content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = stripped.length > 14000 ? stripped.slice(0, 14000) : stripped;

  // 3. Claude hívás
  const client = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    baseURL: ANTHROPIC_BASE_URL || undefined,
    timeout: 90_000,
  });
  const userPrompt = `Tananyag címe: ${material.title}
Osztály: ${material.classroom ?? "?"}

Tananyag tartalma (kivonat):
${truncated}

Generálj pontosan ${safeCount} db kvíz-tételt a fenti tananyag legfontosabb tudásmagjából. Csak a JSON tömböt add vissza.`;

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Claude nem adott szöveges választ.");
  }
  let raw = block.text.trim();
  // Markdown code-fence eltávolítása ha van
  raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Az első '[' és utolsó ']' közötti rész kiszedése (extra tartalom esetére)
  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    raw = raw.slice(firstBracket, lastBracket + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Claude válasz JSON-parse hiba: ${e instanceof Error ? e.message : "?"} — első 200 char: ${raw.slice(0, 200)}`,
      { cause: e },
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Claude válasz nem tömb.");
  }

  // 4. Validáció + insert
  const result: QuizGenerationResult = {
    materialId,
    materialTitle: material.title,
    inserted: 0,
    skipped: 0,
    errors: [],
  };
  const ALLOWED_TOPICS = new Set(["english", "math", "nature", "hungarian"]);
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") {
      result.skipped++;
      continue;
    }
    const item = raw as Partial<GeneratedQuizItem>;
    if (
      typeof item.prompt !== "string" ||
      item.prompt.length < 3 ||
      item.prompt.length > 200 ||
      !Array.isArray(item.options) ||
      item.options.length !== 4 ||
      !item.options.every((o): o is string => typeof o === "string" && o.length > 0 && o.length < 60) ||
      typeof item.correctIndex !== "number" ||
      !Number.isInteger(item.correctIndex) ||
      item.correctIndex < 0 ||
      item.correctIndex > 3 ||
      typeof item.topic !== "string" ||
      !ALLOWED_TOPICS.has(item.topic)
    ) {
      result.skipped++;
      continue;
    }
    try {
      await db.insert(gameQuizItems).values({
        gameId: ALIBI_GAME_ID,
        tier: "normal",
        topic: item.topic,
        prompt: item.prompt,
        options: item.options,
        correctIndex: item.correctIndex,
        sourceMaterialId: materialId,
        isActive: true,
      });
      result.inserted++;
    } catch (e) {
      result.errors.push(`Insert hiba: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
