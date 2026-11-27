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
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { gameQuizItems, htmlFiles } from "@shared/schema";
import { crossFamilyFallback, resolveLegacyModel } from "./ai/models";
import { logger } from "./lib/logger";
import { createStudioProvider, crossFamilyFallbackOptions, studioModelReady } from "./ai/studio-provider";
import { withSupportSkill } from "./studio/support-skills";
import { cachedSystem } from "./ai/prompt-cache";
import { collectQuizBank, type GeneratedQuizItem } from "./gameQuizValidation";
import { teachableQuizSource } from "./gameQuizSource";
import { classifyQuizItem } from "../shared/practice-policy";
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
  /** TG-P5a: a mentett bank gyakorlati mérése (`shared/practice-policy.ts`) — tájékoztató, nem megállító kapu. */
  practice?: { alkalmazas: number; fogalmi: number; egyeb: number };
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
- GYAKORLATIASSÁG: a tanuló a tanított példán mutassa meg a tudását — a tételek kb. kétharmada konkrét mondaton, adaton, helyzeten vagy példányon dönt, kiegészít, javít vagy számol; a többi a szükséges fogalom (jelentés, szabály) felidézése.
- TILOS a feladatlapra, a pontozásra, a feladattípus nevére, a feladatlap felépítésére vagy a játék kezelésére kérdezni. Ha a tananyag csak ilyen adatot tartalmaz, adj vissza üres tömböt ([]).
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
/** Review #203: unknown/deleted material — the route answers 404 and no `quiz` run is created (spec §4/4: 400/404 before the run). */
export class QuizMaterialNotFound extends Error {}
async function materialExists(materialId: string): Promise<boolean> {
  const [row] = await db.select({ id: htmlFiles.id }).from(htmlFiles).where(eq(htmlFiles.id, materialId)).limit(1);
  return Boolean(row);
}

export async function generateMaterialQuiz(
  materialId: string,
  count: number,
  owner: string,
  deps: { materialExists?: (materialId: string) => Promise<boolean> } = {},
): Promise<QuizGenerationResult> {
  // Input check BEFORE the workflow: an invalid request must not leave a failed run behind.
  if (!await (deps.materialExists ?? materialExists)(materialId)) {
    throw new QuizMaterialNotFound(`Tananyag nem található: ${materialId}`);
  }
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API kulcs nincs konfigurálva (AI_INTEGRATIONS_ANTHROPIC_API_KEY hiányzik).");
  }
  const safeCount = Math.max(3, Math.min(20, Math.floor(count)));

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

  // 2. HTML → tanítható szöveg (TG-P5a: oldalváz és pontozási előszó nélkül, fejezetenként elosztott kerettel).
  const source = teachableQuizSource(material.content, 14000);
  const result: QuizGenerationResult = {
    materialId,
    materialTitle: material.title,
    inserted: 0,
    skipped: 0,
    errors: [],
  };
  if (!source) {
    // Csak fejlécből / pontozásból álló anyag: modellhívás nélkül áll meg, a meglévő kvízek változatlanok.
    result.errors.push("Elégtelen tanítható tartalom (csak fejléc / pontozás) — nincs modellhívás, a meglévő kvízek változatlanok maradtak.");
    return { value: result, result: { kind: "material" as const, id: materialId } };
  }

  // 3. Claude hívás
  await workflowPhase("author");
  const client = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    baseURL: ANTHROPIC_BASE_URL || undefined,
    timeout: 90_000,
  });
  const userPromptFor = (n: number, note: string) => `Tananyag címe: ${material.title}
Osztály: ${material.classroom ?? "?"}

Tananyag tartalma (kivonat):
${source.text}
${note ? `\nPÓTLÁS: ${note}\n` : ""}
Generálj pontosan ${n} db kvíz-tételt a fenti tananyag legfontosabb tudásmagjából. Csak a JSON tömböt add vissza.`;

  // Spec 2026-10-14-tartalek-b-szelet (B3) + review #219: a Claude-hívás szolgáltatói VAGY kimeneti hibájánál (csonka, nem JSON,
  // nem tömb) egyszer az ellentétes családú tartalék (GPT-6.1 Sol, medium), ugyanazzal a rendszer- és felhasználói prompttal.
  const fallbackModel = crossFamilyFallback(ANTHROPIC_MODEL);
  // TG-P5a: első kérés + legfeljebb egy célzott pótlás (collectQuizBank) — mindkettő ugyanazzal a tartalékos úttal.
  const ask = async (n: number, note: string): Promise<unknown[]> => {
  const userPrompt = userPromptFor(n, note);
  // Token-limit a kért darabszámhoz méretezve — 4096 fix limit 15-20 tételnél csonkolta a JSON-t. ~300 token / tétel + buffer.
  const maxTokens = Math.min(8192, 1024 + n * 350);
  return quizItemsWithFallback(
    async () => {
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: cachedSystem(withSupportSkill("quiz-generator", SYSTEM_PROMPT)), // Spec 2026-10-03-gpt61-sol-kv-cache
        messages: [{ role: "user", content: userPrompt }],
      });
      if (response.stop_reason === "max_tokens") throw new Error("A Claude-válasz elérte a hosszkorlátot.");
      const block = response.content[0];
      if (!block || block.type !== "text") throw new Error("Claude nem adott szöveges választ.");
      return block.text;
    },
    fallbackModel && studioModelReady(fallbackModel) ? async () => {
      const response = await createStudioProvider(fallbackModel, 90_000, maxTokens, crossFamilyFallbackOptions(fallbackModel, true)).chat([
        { role: "system", content: withSupportSkill("quiz-generator", SYSTEM_PROMPT) },
        { role: "user", content: userPrompt },
      ]);
      if (response.finishReason === "length") throw new Error("A tartalék modell válasza elérte a hosszkorlátot.");
      return response.content ?? "";
    } : undefined,
    (error) => logger.warn(`[QUIZ-GEN] ${ANTHROPIC_MODEL} hibázott (${error instanceof Error ? error.message.slice(0, 200) : String(error)}) → tartalék: ${fallbackModel}`),
  );
  };
  const bank = await collectQuizBank(safeCount, ask);
  await workflowPhase("gate");

  // Validálás és pótlás a tranzakción kívül (collectQuizBank). TG-P5a: csak teljes darabszámú, meta-mentes bank válthatja le
  // az aktív készletet — hiányos banknál nincs deaktiválás (AUDIT 2026-09-01: a régi készlet nem tűnhet el hiba nélkül).
  result.skipped = bank.rejected.length;
  await workflowPhase("save");
  if (!bank.complete) {
    result.errors.push(`Hiányos készlet (${bank.items.length}/${safeCount} megfelelő tétel egy pótlás után is) — a meglévő kvízek változatlanok maradtak.`);
    result.errors.push(...bank.rejected.slice(0, 5));
  } else {
  const validItems: GeneratedQuizItem[] = bank.items;
  const signature = (rows: Array<{ prompt: string; correctIndex: number; options: unknown }>) =>
    rows.map((r) => JSON.stringify([r.prompt, r.correctIndex, r.options])).sort().join("\n");
  // Tranzakció: anyagonkénti tanácsadó zár + deaktivál + beilleszt + visszaolvas atomikusan.
  await db.transaction(async (tx) => {
    // TG-P5a: azonos anyagra párhuzamos kérés nem írhat közben újabb készletet.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`game-quiz:${materialId}`}))`);
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
    // Visszaolvasás a zár alatt: pontosan a beillesztett kérdések és kulcsok aktívak a tananyaghoz.
    const active = await tx.select({ prompt: gameQuizItems.prompt, correctIndex: gameQuizItems.correctIndex, options: gameQuizItems.options })
      .from(gameQuizItems)
      .where(and(eq(gameQuizItems.sourceMaterialId, materialId), eq(gameQuizItems.isActive, true)));
    if (signature(active) !== signature(validItems)) throw new Error("A mentett kvíztételek visszaolvasása eltér.");
    await workflowFence(tx);
  });
  const kinds = validItems.map((i) => classifyQuizItem({ question: i.prompt, options: i.options }).kind);
  result.practice = {
    alkalmazas: kinds.filter((k) => k === "alkalmazas").length,
    fogalmi: kinds.filter((k) => k === "fogalmi").length,
    egyeb: kinds.filter((k) => k !== "alkalmazas" && k !== "fogalmi").length,
  };
  }
  await workflowPhase("readback");
  return { value: result, result: { kind: "material" as const, id: materialId } };
  });
}

/** Review #219: a modellválasz kvíz-tömbbé (kerítés és körítő szöveg nélkül); hibás / nem tömb / üres → hiba. */
export function parseQuizJsonArray(text: string): unknown[] {
  let raw = text.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) raw = raw.slice(firstBracket, lastBracket + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`A kvíz-válasz JSON-parse hibás: ${e instanceof Error ? e.message : "?"} — első 200 char: ${raw.slice(0, 200)}`, { cause: e });
  }
  if (!Array.isArray(parsed)) throw new Error("A kvíz-válasz nem tömb.");
  if (!parsed.length) throw new Error("A kvíz-válasz üres tömb.");
  return parsed;
}

/**
 * Review #219: a tartalék-határon belül a szolgáltatói ÉS a kimeneti hiba (csonka, nem JSON, nem tömb) is — a tartalék csak egyszer,
 * és csak ha van (kulccsal). Adatbázistól független, futtatott teszttel ellenőrizve.
 */
export async function quizItemsWithFallback(
  primary: () => Promise<string>,
  fallback: (() => Promise<string>) | undefined,
  onFallback?: (error: unknown) => void,
): Promise<unknown[]> {
  try {
    return parseQuizJsonArray(await primary());
  } catch (error) {
    if (!fallback) throw error;
    onFallback?.(error);
    return parseQuizJsonArray(await fallback());
  }
}
