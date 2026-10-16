/**
 * Egyfutásos tananyaggyártás — éles bekötés (docs/specs/2026-10-16-egy-futas.md, D; végrehajtás: S3).
 * A térkép mentése ugyanazzal a tranzakciós beszúrással, mint a régi kinyerés (`run-extraction.ts`); a gyártás a `runSingleLesson`-nel.
 */
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../db";
import { knowledgeMaps, kmConcepts } from "../../../shared/schema";
import { workflowFence } from "../../workflows/engine";
import { logger } from "../../lib/logger";
import type { ExtractorFile } from "../extractor";
import { createDrizzlePipelineStore } from "../pipeline-store";
import { createLessonConversation } from "./conversation";
import { readSourceStation, runSingleLesson, singleRunSystemPrompt, type SingleRunMap, type SingleRunPhase, type SingleRunResult } from "./engine";
import { eq } from "drizzle-orm";


/**
 * A tudásbank mentése (egy tranzakció, workflow-fence-szel). Gyártásnál jóváhagyott térkép, a szó szerint igazolt fogalmak „kept”
 * állapotban; a különálló kinyerésnél (S4a) `draft` térkép, a fogalmak a tanári jóváhagyásra várnak (mint a korábbi kinyerésnél).
 */
export async function saveSingleRunMap(map: SingleRunMap, files: ExtractorFile[], ownerId: string, model: string, opts: { draft?: boolean; inputHash?: string } = {}): Promise<string> {
  // Gyártásnál egyedi bemeneti lenyomat (a tábla `input_hash` egyedi): az egyfutásos térkép gyártásonként új.
  const inputHash = opts.inputHash ?? createHash("sha256").update(`single-run:${randomUUID()}`).digest("hex");
  return db.transaction(async (tx) => {
    await workflowFence(tx);
    const [row] = await tx.insert(knowledgeMaps).values({
      title: map.title, subject: map.subject, classroom: map.classroom, status: opts.draft ? "draft" : "approved",
      // Review #260: fájlonként a modell betűhű átirata (kép / szkennelt PDF is) — a későbbi idézetellenőrzés a saját fájlján mér.
      sourceFiles: files.map((f) => { const text = map.fileTranscripts[f.name] ?? f.extractedText; return { name: f.name, kind: f.kind, ...(text ? { extractedText: text } : {}) }; }),
      sourceText: map.transcript, inputHash, model, createdBy: ownerId, ...(opts.draft ? {} : { approvedBy: ownerId, approvedAt: new Date() }),
    }).returning({ id: knowledgeMaps.id });
    await tx.insert(kmConcepts).values(map.concepts.map((c, index) => ({
      mapId: row.id, localId: c.id, term: c.term, definition: c.definition, quote: c.quote, sourceRef: { file: c.sourceFile },
      type: c.type, examWeight: c.examWeight, relatedIds: c.relatedIds, verbatimOk: c.verbatimOk, verbatimReason: c.correction ?? null,
      // A helyesbített fogalom „edited” (mint a régi helyesbítésnél); a draft térkép fogalmai a tanári jóváhagyásra várnak.
      ...(opts.draft ? {} : { reviewState: c.correction ? "edited" as const : "kept" as const }), orderIndex: index,
    })));
    await workflowFence(tx);
    return row.id;
  });
}

/** A feltöltött forrás előkészítése modell nélkül: docx → szöveg, szöveges PDF → kinyert szöveg; kép / szkennelt PDF natívan megy. */
async function prepareFiles(files: ExtractorFile[]): Promise<ExtractorFile[]> {
  const { normalizeDocumentSources } = await import("../document-source");
  const out: ExtractorFile[] = [];
  for (const file of files) {
    try { out.push(...await normalizeDocumentSources([file])); }
    catch { out.push(file); } // olvashatatlan PDF: az Opus natívan olvassa (dokumentumblokk)
  }
  return out;
}

/** A különálló kinyerés tartalmi lenyomata: ugyanazok a fájlok ugyanazt a térképet adják vissza (nincs második modellhívás). */
export function singleRunMapHash(files: ExtractorFile[], title?: string): string {
  // Review #261: egyértelmű (JSON) kódolás — a fájlhatár nem csúszhat el (egy fájl tartalma nem utánozhat két fájlt).
  return createHash("sha256").update(JSON.stringify(["single-run-map-2", title?.trim() ?? "", files.map((f) => [f.name, f.kind, f.content])])).digest("hex");
}

/**
 * Különálló tudástár-kinyerés (S4a): az egyfutásos 1. állomás (forrás és tudásbank) önállóan, egy beszélgetésben; az eredmény
 * draft térkép a tanári jóváhagyáshoz. Idempotens a tartalmi lenyomaton.
 */
export async function extractMapSingleRun(input: { files: ExtractorFile[]; title?: string; ownerId: string }): Promise<{ mapId: string; cached: boolean }> {
  const inputHash = singleRunMapHash(input.files, input.title);
  const [existing] = await db.select({ id: knowledgeMaps.id }).from(knowledgeMaps).where(eq(knowledgeMaps.inputHash, inputHash)).limit(1);
  if (existing) return { mapId: existing.id, cached: true };
  const files = await prepareFiles(input.files);
  const conversation = createLessonConversation(singleRunSystemPrompt(), {
    onFallback: (reason) => logger.warn(`[EGYFUTÁS] Tartalékmodell (kinyerés): ${reason}`),
  });
  const read = await readSourceStation({ conversation, log: (m) => logger.info(m) }, files);
  const mapId = await saveSingleRunMap({ ...read, title: input.title?.trim() || read.title }, files, input.ownerId, conversation.model, { draft: true, inputHash });
  return { mapId, cached: false };
}

export type SingleRunProgress = { phase: SingleRunPhase | "ocr" | "error"; detail?: string | null; error?: string; mapId?: string; jobId?: string; lessonId?: string };

/** Egy feltöltés teljes gyártása egy beszélgetésben (a hívó workflow-ján belül). */
export async function runSingleUpload(input: { files: ExtractorFile[]; instruction?: string; title?: string; ownerId: string }, progress: (p: SingleRunProgress) => void): Promise<SingleRunResult> {
  progress({ phase: "ocr", detail: "A forrás előkészítése…" });
  const files = await prepareFiles(input.files);
  const conversation = createLessonConversation(singleRunSystemPrompt(), {
    onFallback: (reason) => { logger.warn(`[EGYFUTÁS] Tartalékmodell: ${reason}`); progress({ phase: "extract", detail: `Tartalékmodell: ${reason}`.slice(0, 300) }); },
    onUsage: (r) => logger.info(`[EGYFUTÁS] ${r.model}: be ${r.usage?.input ?? "?"} (gyorsítótár ${r.usage?.cachedInput ?? 0}), ki ${r.usage?.output ?? "?"} token`),
  });
  logger.info(`[EGYFUTÁS] Indul: ${conversation.model}, ${files.length} forrásfájl`);
  return runSingleLesson({ ...input, files }, {
    conversation,
    store: await createDrizzlePipelineStore(),
    saveMap: (map, f) => saveSingleRunMap(map, f, input.ownerId, conversation.model),
    onPhase: (phase, detail) => progress({ phase, detail }),
    onJob: (jobId, mapId) => progress({ phase: "pedagogue", jobId, mapId, detail: "A tananyagterv készül…" }),
    log: (m) => logger.info(m),
  });
}
