/**
 * Egyfutásos tananyaggyártás — éles bekötés (docs/specs/2026-10-16-egy-futas.md, D; végrehajtás: S3).
 * A térkép mentése ugyanazzal a tranzakciós beszúrással, mint a régi kinyerés (`run-extraction.ts`); a gyártás a `runSingleLesson`-nel.
 */
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../db";
import { knowledgeMaps, kmConcepts, studioJobs } from "../../../shared/schema";
import { workflowFence } from "../../workflows/engine";
import { logger } from "../../lib/logger";
import type { ExtractorFile } from "../extractor";
import { createDrizzlePipelineStore } from "../pipeline-store";
import { createLessonConversation, type ConversationState, type SingleRunEffort } from "./conversation";
import { readSourceStation, runSingleLesson, SingleRunError, singleRunResumable, singleRunSystemPrompt, type SingleRunMap, type SingleRunPhase, type SingleRunResult } from "./engine";
import { sourceVisualsEnabled } from "../source-visuals-flag";
import { and, eq, or } from "drizzle-orm";
import { SOURCE_VISUALS_SCHEMA_VERSION } from "../../../shared/source-visuals";


/**
 * A tudásbank mentése (egy tranzakció, workflow-fence-szel). Gyártásnál jóváhagyott térkép, a szó szerint igazolt fogalmak „kept”
 * állapotban; a különálló kinyerésnél (S4a) `draft` térkép, a fogalmak a tanári jóváhagyásra várnak (mint a korábbi kinyerésnél).
 */
/**
 * Spec 2026-10-21-fogalom-tipus-hossz: a modell szabad szöveges címkéi az oszlophatárra vágva (`km_concepts.type` varchar(24),
 * `verbatim_reason` varchar(32)) — mért: „irodalomtörténeti esemény” (25) megállította a gyártást.
 */
export const kmConceptColumns = (c: { type: string; correction?: string | null }) => ({ type: c.type.slice(0, 24), verbatimReason: c.correction ? c.correction.slice(0, 32) : null });

/** A térkép `source_files` eleme: név, fajta, a fájl átirata és — ha van — a fájlhoz tartozó vizuális tételek. */
export function sourceFileRow(f: Pick<ExtractorFile, "name" | "kind" | "extractedText">, map: Pick<SingleRunMap, "fileTranscripts" | "visuals">) {
  const text = map.fileTranscripts[f.name] ?? f.extractedText;
  const visuals = map.visuals.filter((v) => v.sourceFile === f.name);
  return { name: f.name, kind: f.kind, ...(text ? { extractedText: text } : {}), ...(visuals.length ? { visuals } : {}) };
}

export async function saveSingleRunMap(map: SingleRunMap, files: ExtractorFile[], ownerId: string, model: string, opts: { draft?: boolean; inputHash?: string } = {}): Promise<string> {
  // Gyártásnál egyedi bemeneti lenyomat (a tábla `input_hash` egyedi): az egyfutásos térkép gyártásonként új.
  const inputHash = opts.inputHash ?? createHash("sha256").update(`single-run:${randomUUID()}`).digest("hex");
  return db.transaction(async (tx) => {
    await workflowFence(tx);
    const [row] = await tx.insert(knowledgeMaps).values({
      title: map.title, subject: map.subject, classroom: map.classroom, status: opts.draft ? "draft" : "approved",
      // Review #260: fájlonként a modell betűhű átirata (kép / szkennelt PDF is) — a későbbi idézetellenőrzés a saját fájlján mér.
      // Spec 2026-11-18-tananyag-gyartas-minoseg (S1a): a fájl vizuális leltára ugyanebben a jsonb-elemben (migráció nélkül).
      sourceFiles: files.map((f) => sourceFileRow(f, map)),
      sourceText: map.transcript, inputHash, model, createdBy: ownerId, ...(opts.draft ? {} : { approvedBy: ownerId, approvedAt: new Date() }),
    }).returning({ id: knowledgeMaps.id });
    await tx.insert(kmConcepts).values(map.concepts.map((c, index) => ({
      mapId: row.id, localId: c.id, term: c.term, definition: c.definition, quote: c.quote, sourceRef: { file: c.sourceFile },
      ...kmConceptColumns(c), examWeight: c.examWeight, relatedIds: c.relatedIds, verbatimOk: c.verbatimOk,
      // A helyesbített fogalom „edited” (mint a régi helyesbítésnél); a draft térkép fogalmai a tanári jóváhagyásra várnak.
      ...(opts.draft ? {} : { reviewState: c.correction ? "edited" as const : "kept" as const }), orderIndex: index,
    })));
    await workflowFence(tx);
    return row.id;
  });
}

/** A feltöltött forrás előkészítése modell nélkül: docx → szöveg, szöveges PDF → kinyert szöveg; kép / szkennelt PDF natívan megy. */
export async function prepareFiles(files: ExtractorFile[]): Promise<ExtractorFile[]> {
  const { normalizeDocumentSources } = await import("../document-source");
  const out: ExtractorFile[] = [];
  for (const file of files) {
    try { out.push(...await normalizeDocumentSources([file])); }
    catch (error) {
      // Spec 2026-11-02-mht-forras: az MHT nyers base64-e nem mehet szövegként a modellhez — érthető hiba.
      // Review #374: SingleRunError → the route returns the concrete reason (a retry would fail the same way).
      if (file.kind === "mht") throw new SingleRunError("forrás", [`${file.name}: ${error instanceof Error ? error.message : String(error)}`]);
      out.push(file); // olvashatatlan PDF: az Opus natívan olvassa (dokumentumblokk)
    }
  }
  return out;
}

/** A különálló kinyerés tartalmi lenyomata: ugyanazok a fájlok ugyanazt a térképet adják vissza (nincs második modellhívás). */
export function singleRunMapHash(files: ExtractorFile[], title?: string, sourceVisuals: boolean = sourceVisualsEnabled()): string {
  // Review #261: egyértelmű (JSON) kódolás — a fájlhatár nem csúszhat el (egy fájl tartalma nem utánozhat két fájlt).
  // A leltár funkciókapcsolója: KI állapotban a lenyomat a kapcsoló előttivel azonos (a régi térkép változatlanul visszajön).
  // Review J4 (S1a), BE állapotban: a lenyomat része a vizuális leltár sémaverziója — a leltár előtti, a KI állapotban kinyert vagy a
  // régi sémájú térképet ugyanarra a fájlra nem adja vissza jelzés nélkül; a séma változásakor új kinyerés készül.
  return createHash("sha256").update(JSON.stringify(["single-run-map-2", ...(sourceVisuals ? [`source-visuals-${SOURCE_VISUALS_SCHEMA_VERSION}`] : []), title?.trim() ?? "", files.map((f) => [f.name, f.kind, f.content])])).digest("hex");
}

/**
 * A tárolt lenyomat gazda-kötött változata (#264): két tanár ugyanarra a tartalomra két külön térképet kap (az `input_hash` egyedi),
 * és egyik sem kaphatja vissza a másikét. A `singleRunMapHash` értéke változatlan (a prompt-ujjlenyomat rögzíti).
 */
export function ownerMapHash(contentHash: string, ownerId: string): string {
  return createHash("sha256").update(JSON.stringify(["owner-map-1", ownerId, contentHash])).digest("hex");
}

/**
 * Különálló tudástár-kinyerés (S4a): az egyfutásos 1. állomás (forrás és tudásbank) önállóan, egy beszélgetésben; az eredmény
 * draft térkép a tanári jóváhagyáshoz. Idempotens a tartalmi lenyomaton.
 */
export async function extractMapSingleRun(input: { files: ExtractorFile[]; title?: string; ownerId: string }): Promise<{ mapId: string; cached: boolean }> {
  // #264 (Kanban #11): a gyorsítótár csak a hívó SAJÁT térképét adhatja vissza — korábban ugyanaz a tartalom más tanár térképét adta.
  // Új térkép a gazda-kötött lenyomattal mentődik; a javítás előtti (tartalmi lenyomatú) térkép csak a saját gazdájának jön vissza.
  const contentHash = singleRunMapHash(input.files, input.title);
  const inputHash = ownerMapHash(contentHash, input.ownerId);
  const [existing] = await db.select({ id: knowledgeMaps.id }).from(knowledgeMaps)
    .where(or(eq(knowledgeMaps.inputHash, inputHash), and(eq(knowledgeMaps.inputHash, contentHash), eq(knowledgeMaps.createdBy, input.ownerId)))).limit(1);
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

/** A gyártás közös függőségei (beszélgetés, adattár, friss beszélgetés-gyár, haladásjelzés). */
async function singleRunDeps(ownerId: string, progress: (p: SingleRunProgress) => void, state?: ConversationState) {
  const conversation = createLessonConversation(singleRunSystemPrompt(), {
    ...(state ? { state } : {}),
    onFallback: (reason) => { logger.warn(`[EGYFUTÁS] Tartalékmodell: ${reason}`); progress({ phase: "extract", detail: `Tartalékmodell: ${reason}`.slice(0, 300) }); },
    onUsage: (r) => logger.info(`[EGYFUTÁS] ${r.model}: be ${r.usage?.input ?? "?"} (gyorsítótár ${r.usage?.cachedInput ?? 0}), ki ${r.usage?.output ?? "?"} token`),
  });
  return {
    conversation,
    store: await createDrizzlePipelineStore(),
    saveMap: (map: SingleRunMap, f: ExtractorFile[]) => saveSingleRunMap(map, f, ownerId, conversation.model),
    // J2: friss, előzmény nélküli beszélgetés (bank, lektor, kulcsmentes ellenőrzés) — ugyanaz a modellpár és tartalékváltás.
    fresh: (system: string, opts?: { effort?: SingleRunEffort }) => createLessonConversation(system, {
      ...opts,
      onFallback: (reason) => logger.warn(`[EGYFUTÁS] Tartalékmodell (friss beszélgetés): ${reason}`),
      onUsage: (r) => logger.info(`[EGYFUTÁS] friss ${r.model}: be ${r.usage?.input ?? "?"} (gyorsítótár ${r.usage?.cachedInput ?? 0}), ki ${r.usage?.output ?? "?"} token`),
    }),
    onPhase: (phase: SingleRunPhase, detail: string | null) => progress({ phase, detail }),
    onJob: (jobId: string, mapId: string) => progress({ phase: "pedagogue", jobId, mapId, detail: "A tananyagterv készül…" }),
    log: (m: string) => logger.info(m),
  };
}

/** Egy feltöltés teljes gyártása egy beszélgetésben (a hívó workflow-ján belül). */
export async function runSingleUpload(input: { files: ExtractorFile[]; instruction?: string; title?: string; ownerId: string; targetHtmlFileId?: string; targetBaseline?: string }, progress: (p: SingleRunProgress) => void): Promise<SingleRunResult> {
  progress({ phase: "ocr", detail: "A forrás előkészítése…" });
  const files = await prepareFiles(input.files);
  const deps = await singleRunDeps(input.ownerId, progress);
  logger.info(`[EGYFUTÁS] Indul: ${deps.conversation.model}, ${files.length} forrásfájl`);
  return runSingleLesson({ ...input, files }, deps);
}

/**
 * Review #262: gyártás a MEGLÉVŐ, gondozott térképről (újragyártás, térképről indítás, jóváhagyott terv) — a tudásbank nem készül újra,
 * a fogalomazonosítók stabilak; jóváhagyott vázlatnál a terv-állomás azt veszi át.
 */
export async function runSingleFromMap(input: { mapId: string; instruction?: string; approvedOutline?: unknown; ownerId: string }, progress: (p: SingleRunProgress) => void): Promise<SingleRunResult> {
  const deps = await singleRunDeps(input.ownerId, progress);
  logger.info(`[EGYFUTÁS] Indul a meglévő térképről (${input.mapId}): ${deps.conversation.model}${input.approvedOutline ? ", jóváhagyott tervvel" : ""}`);
  return runSingleLesson({ files: [], mapId: input.mapId, ownerId: input.ownerId, ...(input.instruction ? { instruction: input.instruction } : {}),
    ...(input.approvedOutline !== undefined ? { approvedOutline: input.approvedOutline } : {}) }, deps);
}

/**
 * J5: a megszakadt egyfutásos job folytatása a mentett részeiből (terv, tananyag, bank-ellenőrzőpont), a mentett szerzői beszélgetéssel
 * és telemetriával, ugyanazon a jobon. A hívó (route) foglalja a jobot; itt csak a betöltés és a motor indítása történik.
 */
export async function runSingleResume(input: { jobId: string; ownerId: string }, progress: (p: SingleRunProgress) => void): Promise<SingleRunResult> {
  const [job] = await db.select({ mapId: studioJobs.mapId, output: studioJobs.output }).from(studioJobs).where(eq(studioJobs.id, input.jobId)).limit(1);
  const output = (job?.output ?? null) as Record<string, unknown> | null;
  if (!job || !output || !singleRunResumable(output)) throw new Error("A job mentett részeiből nem folytatható.");
  const state = (output.singleRun as { conversation: ConversationState }).conversation;
  const deps = await singleRunDeps(input.ownerId, progress, state);
  const instruction = typeof output.ownerInstruction === "string" && output.ownerInstruction.trim() ? output.ownerInstruction : undefined;
  logger.info(`[EGYFUTÁS] Folytatás (${input.jobId}): ${deps.conversation.model}, a mentett ${state.turns.length} fordulós beszélgetéssel`);
  progress({ phase: "pedagogue", jobId: input.jobId, mapId: job.mapId, detail: "Folytatás a mentett részeredményekből…" });
  return runSingleLesson({ files: [], mapId: job.mapId, ownerId: input.ownerId, ...(instruction ? { instruction } : {}), resume: { jobId: input.jobId, output } }, deps);
}
