import { db } from "../db";
import { knowledgeMaps, kmConcepts, systemPrompts } from "../../shared/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { resolveStudioModel } from "../ai/models";
import { createPromptStore } from "../lib/prompt-store";
import {
  applyVerbatimChecks,
  sourceTextOf,
  type ExtractorFile,
  type ExtractorScope,
  type RawExtraction,
} from "./extractor";
import { callOcrModel, mergeOcrIntoSourceText, ocrTextsOf } from "./ocr";
import { conceptSchema, type Concept } from "../../shared/knowledge-map-schema";

/**
 * The paid half of extraction: call the vision model, then persist a reviewable map.
 *
 * Split out of studio/routes.ts and imported lazily so the route module stays cheap to
 * load and unit-testable, and so a missing AI key surfaces at call time rather than at
 * server boot.
 */

const EXTRACTOR_PROMPT_NAME = "studio.extractor.system";

/**
 * Prompt lookup against the `system_prompts` table, created once per process.
 *
 * Fail-open by construction (see lib/prompt-store.ts): a missing row, an inactive row
 * or a database hiccup falls back to the inline prompt below, so extraction keeps
 * working on an unseeded database.
 */
const promptStore = createPromptStore({
  load: async (name) => {
    const [row] = await db
      .select({ prompt: systemPrompts.prompt })
      .from(systemPrompts)
      .where(and(eq(systemPrompts.name, name), eq(systemPrompts.isActive, true)))
      .limit(1);
    return row?.prompt ?? null;
  },
});

const FALLBACK_PROMPT = `Te egy tananyag-kivonatoló vagy. A feladatod NEM a tanítás, hanem a
forrásdokumentum pontos feltérképezése.

SZABÁLYOK:
1. Csak azt rögzítsd, ami a forrásban SZEREPEL. Ne egészítsd ki saját tudásodból.
2. Minden fogalomhoz kötelező a "quote": a forrás SZÓ SZERINTI részlete, amiből a
   fogalom származik. Ha nem tudsz szó szerint idézni, ne vedd fel a fogalmat.
3. Ha a forrás téved vagy elavult, AKKOR IS a forrást rögzítsd — a diákot ebből
   fogják feleltetni. Ne javítsd ki.
4. examWeight: "core" = a felelet/dolgozat gerince; "supporting" = kiegészítő;
   "extra" = érdekesség.
5. type: definition | fact | date | formula | procedure | person | place.

Válaszolj JSON-ban: { "title": string, "concepts": [ { "id", "term", "definition",
"quote", "sourceRef": {"file", "page"}, "type", "examWeight", "relatedIds": [] } ] }`;

type RunInput = {
  files: ExtractorFile[];
  scope: ExtractorScope;
  title?: string;
  inputHash: string;
  userId?: string;
};

/** Ask the extractor model for a structured reading of the uploaded sources. */
async function callExtractorModel(
  files: ExtractorFile[],
  scope: ExtractorScope,
  systemPrompt: string,
  model: string,
): Promise<RawExtraction> {
  const OpenAI = (await import("openai")).default;
  const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);

  const client = new OpenAI(
    useOpenRouter
      ? {
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
          timeout: 180000,
        }
      : {
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
          timeout: 180000,
        },
  );

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text:
        `Tantárgy: ${scope.subject}\nOsztály: ${scope.classroom}\n` +
        (scope.unit ? `Témakör: ${scope.unit}\n` : "") +
        `\nKészíts fogalomjegyzéket az alábbi ${files.length} forrásból.`,
    },
  ];

  for (const file of files) {
    if (file.kind === "image" || file.kind === "pdf") {
      content.push({ type: "image_url", image_url: { url: file.content, detail: "high" } });
    } else {
      content.push({ type: "text", text: `${file.name}:\n\n${file.content}` });
    }
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  return {
    title: typeof parsed.title === "string" ? parsed.title : "",
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
  };
}

/**
 * Run one extraction end to end and store the result.
 *
 * Concepts failing schema validation are dropped (one malformed item must not lose a
 * 40-concept run); concepts failing the verbatim check are stored but flagged, because
 * the teacher needs to see what the model tried to claim before it is struck out.
 */
export async function runExtraction(input: RunInput): Promise<string> {
  const model = resolveStudioModel("extract");
  const systemPrompt = await promptStore.get(EXTRACTOR_PROMPT_NAME, FALLBACK_PROMPT);

  const raw = await callExtractorModel(input.files, input.scope, systemPrompt, model);

  // A modell javaslat, nem igazság: az alakilag hibás fogalmat eldobjuk (egy rossz tétel
  // ne vigyen el egy 40 fogalmas futást), a nem idézhetőt megtartjuk, de megjelöljük —
  // a tanárnak látnia kell, mit próbált állítani.
  const valid = raw.concepts
    .map((c) => conceptSchema.safeParse(c))
    .filter((r): r is { success: true; data: Concept } => r.success)
    .map((r) => r.data);
  const dropped = raw.concepts.length - valid.length;

  const sourceText = sourceTextOf(input.files);

  // #163 — kép-források átirata olcsó vision-modellel, hogy a D1 idézet-
  // ellenőrzésnek legyen mi ellen futnia. Fail-open: az OCR-hiba üres átirat,
  // a kivonatolás megy tovább.
  const ocrModel = resolveStudioModel("ocr");
  const ocrResults = await ocrTextsOf(input.files, (file) => callOcrModel(file, ocrModel));
  const searchableText = mergeOcrIntoSourceText(sourceText, ocrResults);
  if (ocrResults.length > 0) {
    logger.info(
      `[STUDIO/OCR] ${ocrResults.length} kép átírva (${ocrModel}); kereshető szöveg: ${searchableText.length} kar.`,
    );
  }

  const checked = applyVerbatimChecks(valid, searchableText);

  const [map] = await db
    .insert(knowledgeMaps)
    .values({
      title: input.title?.trim() || raw.title || "Névtelen térkép",
      subject: input.scope.subject,
      classroom: input.scope.classroom,
      unit: input.scope.unit ?? null,
      status: "draft",
      sourceFiles: input.files.map((f) => ({ name: f.name, kind: f.kind })),
      // #163: a TÁROLT kereshető szöveg az OCR-átiratokkal együtt — a
      // "Forrás-ellenőrzés újra" ez ellen fut, képes forrásnál is működnie kell.
      sourceText: searchableText,
      inputHash: input.inputHash,
      model,
      createdBy: input.userId ?? null,
    })
    .returning({ id: knowledgeMaps.id });

  if (checked.length > 0) {
    await db.insert(kmConcepts).values(
      checked.map((c, index) => ({
        mapId: map.id,
        localId: c.id,
        term: c.term as string,
        definition: c.definition as string,
        quote: c.quote,
        sourceRef: c.sourceRef as { file: string; page?: number },
        type: c.type as string,
        examWeight: c.examWeight,
        relatedIds: (c.relatedIds as string[]) ?? [],
        verbatimOk: c.verbatimOk,
        verbatimReason: c.verbatimOk ? null : (c.verbatimReason ?? null),
        reviewState: "pending" as const,
        orderIndex: index,
      })),
    );
  }

  const failing = checked.filter((c) => !c.verbatimOk).length;
  logger.info(
    `[STUDIO] Térkép kész: ${map.id} — ${checked.length} fogalom, ` +
      `${failing} nem szó szerinti, ${dropped} hibás alakú eldobva (modell: ${model}).`,
  );

  return map.id;
}
