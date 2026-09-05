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

import { createHash } from "node:crypto";

import { logger } from "../lib/logger";
import type { ExtractorFile } from "./extractor";

export type OcrResult = { name: string; text: string };

export type OcrFn = (file: ExtractorFile) => Promise<string>;

/**
 * #170 — hány kép megy egyszerre az olcsó vision-modellre. Mérve: egy kép
 * 40-90 s; 10 kép szekvenciálisan 7-15 perc volt (a Render eközben újraindult
 * és minden veszett). 3-as poollal ugyanez ~2-4 perc, provider-barát ütemben.
 */
const OCR_CONCURRENCY = 3;

/** Egy kép OCR-hívása, bukásnál üres átirat (fail-open) — a futás sosem hal meg. */
async function ocrOne(file: ExtractorFile, ocr: OcrFn): Promise<OcrResult> {
  try {
    return { name: file.name, text: await ocr(file) };
  } catch (error) {
    logger.warn(
      `[STUDIO/OCR] A(z) ${file.name} átirata nem készült el (${error instanceof Error ? error.message : String(error)}) — üres szöveggel folytatjuk.`,
    );
    return { name: file.name, text: "" };
  }
}

/**
 * Transcribe the image files only; other kinds already carry their text.
 * #170: bounded parallel pool — output order matches input order, progress
 * reports COMPLETED count (nem "melyik indul", hanem "hány kész").
 */
export async function ocrTextsOf(
  files: ExtractorFile[],
  ocr: OcrFn,
  onProgress?: (done: number, total: number) => void,
): Promise<OcrResult[]> {
  const images = files.filter((f) => f.kind === "image");
  const out: OcrResult[] = new Array(images.length);
  let next = 0;
  let done = 0;
  onProgress?.(0, images.length);

  async function worker(): Promise<void> {
    while (next < images.length) {
      const index = next++;
      out[index] = await ocrOne(images[index], ocr);
      done++;
      onProgress?.(done, images.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, images.length) }, () => worker()));
  return out;
}

/* ------------------------------------------------------------------ *
 * #170 — tartalom-hash átirat-cache: ugyanazt a képet SOHA nem fizetjük
 * ki kétszer, és restart utáni újrafutásnál a kész átiratok ingyen vannak.
 * ------------------------------------------------------------------ */

export type OcrCacheStore = {
  get(key: string): Promise<string | null>;
  put(key: string, text: string): Promise<void>;
};

/** Determinista kulcs: a kép tartalma + a modell (más modell átirata más). */
export function ocrCacheKeyOf(imageContent: string, model: string): string {
  return createHash("sha256").update(model).update("\0").update(imageContent).digest("hex");
}

/**
 * Cache-elő burkolat egy OcrFn köré. Találat: nulla modellhívás. Miss: hívás,
 * és a NEM ÜRES átirat mentése (a bukott/üres OCR nincs cache-elve, hogy a
 * következő futás újrapróbálhassa). A cache-hiba sosem dönti be a hívást.
 */
export function withOcrCache(ocr: OcrFn, model: string, store: OcrCacheStore): OcrFn {
  return async (file: ExtractorFile) => {
    const key = ocrCacheKeyOf(file.content, model);
    try {
      const hit = await store.get(key);
      if (hit !== null && hit.trim() !== "") {
        logger.info(`[STUDIO/OCR] Átirat cache-ből: ${file.name}`);
        return hit;
      }
    } catch {
      /* cache-olvasási hiba: megyünk a modellre */
    }
    const text = await ocr(file);
    if (text.trim() !== "") {
      try {
        await store.put(key, text);
      } catch {
        /* cache-írási hiba: az átirat attól még megvan */
      }
    }
    return text;
  };
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

/**
 * Az OCR-kérés paraméterei — a #165 gyökér-okkal azonos hibaosztály ellen
 * pin-elve: a glm-flash osztálynál a reasoning kötelező és keretet fogyaszt,
 * ezért effort:low + bő completion-keret (a 4096 az átiratnak kell).
 */
export function ocrRequestParams(model: string, imageDataUrl: string) {
  return {
    model,
    messages: [
      { role: "system" as const, content: OCR_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [{ type: "image_url" as const, image_url: { url: imageDataUrl, detail: "high" as const } }],
      },
    ],
    max_completion_tokens: 6000,
    reasoning: { effort: "low" as const },
  };
}

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

  const params = ocrRequestParams(model, file.content);
  // A `reasoning` OpenRouter-bővítés; az openai SDK típusa nem ismeri.
  const response = await client.chat.completions.create(
    params as unknown as Parameters<typeof client.chat.completions.create>[0],
  );
  if ("choices" in response) return response.choices[0]?.message?.content?.trim() ?? "";
  return "";
}
