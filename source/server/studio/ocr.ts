/**
 * #163 — OCR layer for image sources (owner decision, 2026-09-05).
 *
 * Why: images carry no searchable text, so the D1 verbatim check could never
 * verify a quote from a photo source — every concept stayed "Nem igazolt" and
 * the map could not be approved. A CHEAP vision model transcribes each image
 * ONCE at extraction time; the transcript joins the stored sourceText that
 * both the initial check and the admin's "Forrás-ellenőrzés újra" run against.
 *
 * Cost control (owner requirement): the transcription runs on the cheap `ocr`
 * model (resolveStudioModel("ocr"), default glm-5.3-flash), never on the
 * expensive extract model — and the client downscales photos before upload
 * (shared/studio-ui.ts downscaleTargetOf), so fewer pixels reach the model.
 *
 * Fail-open by design: a failed OCR yields empty text for that image and the
 * extraction continues — the teacher can still fix quotes by hand; a model
 * outage must not lose a 40-concept run.
 */

import { logger } from "../lib/logger";
import type { ExtractorFile } from "./extractor";

export type OcrResult = { name: string; text: string };

export type OcrFn = (file: ExtractorFile) => Promise<string>;

/** Transcribe the image files only; other kinds already carry their text. */
export async function ocrTextsOf(files: ExtractorFile[], ocr: OcrFn): Promise<OcrResult[]> {
  const images = files.filter((f) => f.kind === "image");
  const out: OcrResult[] = [];
  for (const file of images) {
    try {
      out.push({ name: file.name, text: await ocr(file) });
    } catch (error) {
      logger.warn(
        `[STUDIO/OCR] A(z) ${file.name} átirata nem készült el (${error instanceof Error ? error.message : String(error)}) — üres szöveggel folytatjuk.`,
      );
      out.push({ name: file.name, text: "" });
    }
  }
  return out;
}

/** The searchable source text: base text sources + non-empty OCR transcripts. */
export function mergeOcrIntoSourceText(baseText: string, ocrResults: OcrResult[]): string {
  const parts = [baseText, ...ocrResults.filter((r) => r.text.trim() !== "").map((r) => r.text)];
  return parts.filter((p) => p !== "").join("\n");
}

const OCR_SYSTEM_PROMPT = [
  "You are a verbatim transcriber for Hungarian school material photographed or screenshotted by a teacher.",
  "Transcribe ALL legible text from the image EXACTLY as written — same wording, same accents, same punctuation.",
  "Do not translate, summarize, correct, or reorder anything. Do not describe the image.",
  "Output plain text only.",
].join(" ");

/** The default OCR callable: one cheap vision call per image. */
export async function callOcrModel(file: ExtractorFile, model: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const client = new OpenAI(
    useOpenRouter
      ? { baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY, timeout: 120000 }
      : {
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
          timeout: 120000,
        },
  );

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: file.content, detail: "high" } }],
      },
    ],
    max_completion_tokens: 4096,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
