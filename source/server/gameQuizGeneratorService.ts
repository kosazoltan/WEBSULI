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
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles } from "@shared/schema";
import { resolveLegacyModel } from "./ai/models";
import { withSupportSkill } from "./studio/support-skills";
import { cachedSystem } from "./ai/prompt-cache";
import { validateGeneratedQuizItems } from "./gameQuizValidation";
import { runToolWorkflow } from "./workflows/tool-run";
import { workflowFence, workflowPhase } from "./workflows/engine";

const ANTHROPIC_API_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
/** Central routing (LS-0d): the model id lives in ai/models.ts, not here. */
const ANTHROPIC_MODEL = resolveLegacyModel("quizGenerator");
const ALIBI_GAME_ID = "space-asteroid-quiz";

export type { GeneratedQuizItem } from "./gameQuizValidation";

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
- KÖTELEZŐ "explanation" mező: EGY rövid magyar mondat (max 200 karakter) arról, hogy MIÉRT a helyes válasz a helyes. Matematikánál a levezetést írd le (pl. "7 x 8 = 56, mert 7 x 8 = 7 x 4 x 2 = 28 x 2."), szókincsnél a jelentést. NE hivatkozz sorszámra ("2. válasz"), mert a játék kevert sorrendben rajzol.
- NE használj idézőjelet ("," " " """ stb.) a prompt vagy options szövegében — JSON-parse miatt csak \\" escape-elt formában lenne kezelhető. Idézőjel helyett írd át (pl. "Star magyarul" — idézőjel nélkül).

KIMENET: SZIGORÚAN egyetlen JSON tömb, semmilyen magyarázat / markdown / előszó, csak nyers JSON.

Pontos formátum (példa):
[
  {"prompt": "Mennyi 7 x 8?", "options": ["49", "54", "56", "64"], "correctIndex": 2, "topic": "math", "explanation": "7 x 8 = 56; a 7 x 8 ugyanannyi, mint 7 x 4 x 2 = 28 x 2."},
  {"prompt": "Star magyarul:", "options": ["bolygó", "csillag", "hold", "felhő"], "correctIndex": 1, "topic": "english", "explanation": "A star csillag; a bolygó planet, a hold moon."}
]`;

/**
 * Egy adott tananyagból `count` darab kvíz-tételt generál és beilleszt.
 * Visszaadja a sikeres + skipped + hiba-számot.
 * Spec 2026-10-06-s7 (J): a generálás `quiz` workflow-ban fut (forrás → szerző → kapu → mentés → visszaolvasás).
 */
export async function generateMaterialQuiz(
  materialId: string,
  count: number,
  owner: string,
): Promise<QuizGenerationResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API kulcs nincs konfigurálva (AI_INTEGRATIONS_ANTHROPIC_API_KEY hiányzik).");
  }
  const safeCount = Math.max(3, Math.min(20, Math.floor(count)));
  // Token-limit a kért darabszámhoz méretezve — 4096 fix limit 15-20 tételnél
  // csonkolta a JSON-t (parse-hiba, 0 insert). ~300 token / tétel + buffer.
  const maxTokens = Math.min(8192, 1024 + safeCount * 350);

  return runToolWorkflow({ mode: "quiz", owner, request: { materialId, count: safeCount } }, async () => {
  // 1. Tananyag betöltése
  await workflowPhase("source");
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
  await workflowPhase("author");
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
    max_tokens: maxTokens,
    system: cachedSystem(withSupportSkill("quiz-generator", SYSTEM_PROMPT)), // Spec 2026-10-03-gpt61-sol-kv-cache
    messages: [{ role: "user", content: userPrompt }],
  });

  await workflowPhase("gate");
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

  // 4 + 5. DEDUP + INSERT tranzakcióba csomagolva: ha bármelyik insert dob,
  // az egész rollbackel — nem maradhat deaktivált régi kvízkészlet új nélkül.
  const result: QuizGenerationResult = {
    materialId,
    materialTitle: material.title,
    inserted: 0,
    skipped: 0,
    errors: [],
  };
  const capped = (parsed as unknown[]).slice(0, safeCount);

  // Validálás a tranzakción kívül — így a skipped számlálás nem zavarja az atomicitást.
  // Spec 2026-09-29 (egy-helyes-valasz): a tiszta validátor a több helyes opciós tételt is eldobja.
  const { valid: validItems, skipped } = validateGeneratedQuizItems(capped);
  result.skipped += skipped;

  // AUDIT 2026-09-01: ha egyetlen generált tétel sem érvényes, NEM deaktiváljuk a régi
  // kvízeket — különben a tananyag teljes kérdéskészlete hiba nélkül eltűnne.
  await workflowPhase("save");
  if (validItems.length === 0) {
    result.errors.push("Nincs érvényes generált tétel — a meglévő kvízek változatlanok maradtak.");
  } else {
  // Tranzakció: deaktivál + beilleszt atomikusan.
  // Ha bármelyik tx.insert dob, az egész rollbackel.
  await db.transaction(async (tx) => {
    await workflowFence(tx);
    await tx
      .update(gameQuizItems)
      .set({ isActive: false })
      .where(eq(gameQuizItems.sourceMaterialId, materialId));

    for (const item of validItems) {
      await tx.insert(gameQuizItems).values({
        gameId: ALIBI_GAME_ID,
        tier: "normal",
        topic: item.topic,
        prompt: item.prompt,
        options: item.options,
        explanation: item.explanation.trim(),
        correctIndex: item.correctIndex,
        sourceMaterialId: materialId,
        isActive: true,
      });
      result.inserted++;
    }
    await workflowFence(tx);
  });
  }

  // Visszaolvasás: mentés után pontosan a beillesztett tételek aktívak a tananyaghoz.
  await workflowPhase("readback");
  if (result.inserted > 0) {
    const active = await db.select({ id: gameQuizItems.id }).from(gameQuizItems)
      .where(and(eq(gameQuizItems.sourceMaterialId, materialId), eq(gameQuizItems.isActive, true)));
    if (active.length !== result.inserted) throw new Error("A mentett kvíztételek visszaolvasása eltér.");
  }
  return { value: result, result: { kind: "material" as const, id: materialId } };
  });
}
