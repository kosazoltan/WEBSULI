import { createHash } from "node:crypto";
import { and, eq, ne, inArray } from "drizzle-orm";
import { lessonSchema, type Lesson } from "../../shared/lesson-schema";
import { lessonRepairSchema, type LessonRepair } from "../../shared/lesson-repair";
import { checkLessonArc } from "../../shared/lesson-arc";
import { experienceProblems } from "../../shared/lesson-experience-validation";
import { gameQuizItems, htmlFiles, improvedHtmlFiles, kmConcepts, knowledgeMaps, lessons, materialImprovementBackups, studioJobs } from "../../shared/schema";
import type { MapConcept } from "./coverage";
import { checkCoverageGate } from "./coverage";
import { buildAuthorPrompt, buildLektorPrompt, canonicalJson, lektorReportSchema } from "./step-io";
import { classifyNotes } from "./lektor";
import { buildLessonExperience, type ExperienceCheckpoint } from "./experience-builder";
import { callStepModel } from "./run-step";
import { createStudioProvider } from "../ai/studio-provider";
import { resolveStudioModel } from "../ai/models";
import { conceptIdResolver, exportQuizItemsForPublish } from "./quiz-export";
import { workflowPhase, workflowMode, workflowFence } from "../workflows/engine";

export const repairHash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const quizHash = (rows: Array<typeof gameQuizItems.$inferSelect>) => repairHash(rows.map(row => ({ ...row, createdAt: undefined })).sort((a, b) => a.id.localeCompare(b.id)));
export const materialHash = (row: Pick<typeof htmlFiles.$inferSelect, "title" | "content" | "description" | "classroom" | "contentType">) => repairHash({ title: row.title, content: row.content, description: row.description, classroom: row.classroom, contentType: row.contentType });
type RepairSource = { subject: string; classroom: number; concepts: MapConcept[] };
export function assertRepairTeaching(original: Lesson, candidate: Lesson, source: RepairSource) {
  for (const field of ["mapId", "classroom", "subject", "sourceOnly"] as const) {
    if (candidate[field] !== original[field]) throw new Error(`A javítás nem változtathatja meg: ${field}.`);
  }
  const coverage = checkCoverageGate(candidate, source.concepts);
  const arc = checkLessonArc(candidate);
  const blocks = candidate.sections.flatMap(s => s.blocks);
  const groundingDetails = coverage.ungrounded.map(u => ({ blockIndex: u.blockIndex, concept: u.term, block: blocks[u.blockIndex] }));
  const problems = [...coverage.reasons, ...arc.findings.map(f => f.message), ...(groundingDetails.length ? [`Minden javítandó címkézés, teljes látható blokkal: ${JSON.stringify(groundingDetails)}`] : [])];
  if (problems.length) throw new Error(`A javított lecke nem teljes: ${problems.join("; ")}`);
  return coverage.coverage;
}
export function assertRepairCandidate(original: Lesson, candidate: Lesson, source: RepairSource) {
  const coverage = assertRepairTeaching(original, candidate, source);
  const problems = experienceProblems(candidate, candidate.experience);
  if (problems.length) throw new Error(`A javított lecke nem teljes: ${problems.join("; ")}`);
  return coverage;
}
export function assertRepairFresh(repair: LessonRepair, current: { id: string; version: number; json: unknown }, source: RepairSource, currentMaterialHash: string) {
  if (current.id !== repair.lessonId || current.version !== repair.baseVersion || repairHash(current.json) !== repair.baselineHash || repairHash(source) !== repair.sourceHash || currentMaterialHash !== repair.baselineMaterialHash) {
    throw new Error("A lecke vagy a forrás az előnézet óta megváltozott. Készíts új javítást; a jelenlegi tartalom érintetlen.");
  }
}

async function loadSource(mapId: string) {
  const { db } = await import("../db");
  const [map] = await db.select({ subject: knowledgeMaps.subject, classroom: knowledgeMaps.classroom }).from(knowledgeMaps).where(eq(knowledgeMaps.id, mapId));
  if (!map) throw new Error("A lecke kurált forrása nem található.");
  const concepts = await db.select().from(kmConcepts).where(and(eq(kmConcepts.mapId, mapId), ne(kmConcepts.reviewState, "rejected")));
  return { ...map, concepts: concepts.map(c => ({ id: c.id, localId: c.localId, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.examWeight as MapConcept["examWeight"] })).sort((a, b) => a.localId.localeCompare(b.localId)) };
}

/** Read-only original/source; paid generation writes only the separate candidate. */
export async function generateStructuredImprovement(fileId: string, instruction?: string): Promise<LessonRepair> {
  await workflowPhase("source");
  const { db } = await import("../db");
  const [row] = await db.select().from(lessons).where(eq(lessons.htmlFileId, fileId));
  if (!row) throw new Error("A strukturált lecke nem található; HTML-helyőrzőből nem gyártunk tananyagot.");
  const original = lessonSchema.parse(row.json);
  const [material] = await db.select().from(htmlFiles).where(eq(htmlFiles.id, fileId));
  if (!material) throw new Error("Az eredeti tananyag metaadatai nem találhatók.");
  const source = await loadSource(row.mapId);
  const call = async (step: "author" | "lektor", system: string, user: string) => {
    const model = resolveStudioModel(step);
    const provider = createStudioProvider(model);
    return (await callStepModel(provider, { step, model, system, user })).json;
  };
  const { candidate, review } = await buildStructuredImprovement(original, source, call, instruction);
  return lessonRepairSchema.parse({ kind: "lesson-repair-fusion-1", lessonId: row.id, baseVersion: row.version, baselineHash: repairHash(row.json), baselineMaterialHash: materialHash(material), sourceHash: repairHash(source), previousLesson: original, candidate, reviewNotes: review.notes });
}

/** Shared generation path: also executable against read-only source with local artifacts. */
export async function buildStructuredImprovement(original: Lesson, source: RepairSource, call: (step: "author" | "lektor", system: string, user: string) => Promise<unknown>, instruction?: string, progress?: { checkpoint?: ExperienceCheckpoint; save(checkpoint: ExperienceCheckpoint): Promise<void> }) {
  await workflowPhase("author");
  const outline = original.sections.map(s => ({ heading: s.heading, conceptIds: [...new Set(s.blocks.flatMap(b => "coversConceptIds" in b ? b.coversConceptIds : []))], plannedBlocks: s.blocks.map(b => b.kind), animationSuggestions: [] }));
  const prompt = buildAuthorPrompt(outline, source, []);
  const request = `A korábbi lecke forrással egyező tanítását, kidolgozott példáit és jó ábráit őrizd meg, a hiányokat és forráseltéréseket javítsd. A teljes forráspélda számait és levezetését tanítsd meg, ne csak kérdésben jelenjen meg! Ne rövidítsd vázlattá! mapId=${original.mapId}. Az évfolyamot a program már a forrásból állapította meg, ne változtasd. Minden szakasz explain blokkal induljon. A Próba csak legalább 5 check blokk mellett kapcsolható be; máskülönben probaEnabled=false. A külön experience bankokat ne írd ki.\nKérés: ${instruction ?? "Négyoldalas fúziós módszer, teljes tanítás és változatos gyakorlás."}\nKorábbi lecke (adat):\n${JSON.stringify({ ...original, experience: undefined })}`;
  let candidate: Lesson | undefined;
  let previous: unknown;
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    previous = await call("author", prompt, correction ? `${request}\nEllenőrzési hibák: ${correction}\nElőző jelölt (adat): ${JSON.stringify(previous)}` : request);
    try {
      const parsed = lessonSchema.parse(previous);
      assertRepairTeaching(original, parsed, source);
      candidate = parsed;
      break;
    } catch (error) {
      correction = error instanceof Error ? error.message : "Érvénytelen tanítás.";
      if (attempt === 1) throw new Error(`A javított tanítás ellenőrzése sikertelen; bankgyártás nem indult: ${correction}`, { cause: error });
    }
  }
  if (!candidate) throw new Error("A javított tanítás hiányzik.");
  return finishStructuredImprovement(original, candidate, source, call, progress);
}

/** A separately inspected teaching checkpoint still passes every gate before new banks. */
export async function finishStructuredImprovement(original: Lesson, candidate: Lesson, source: RepairSource, call: (step: "author" | "lektor", system: string, user: string) => Promise<unknown>, progress?: { checkpoint?: ExperienceCheckpoint; save(checkpoint: ExperienceCheckpoint): Promise<void> }) {
  assertRepairTeaching(original, candidate, source);
  await workflowPhase("banks");
  candidate.experience = await buildLessonExperience(candidate, source.concepts, { ...progress, previous: original.experience, call: (system, user) => call("author", system, user) });
  assertRepairCandidate(original, candidate, source);
  await workflowPhase("lektor");
  const review = lektorReportSchema.parse(await call("lektor", buildLektorPrompt(candidate, source), "Ellenőrizd a teljes tanítást és mindkét bank megoldásait. Csak a konkrét eltéréseket jelentsd JSON-ban."));
  const blockers = classifyNotes(review.notes).filter(n => n.blocking);
  if (blockers.length) throw new Error(`A lektor javítást kér, az eredeti érintetlen: ${blockers.map(n => n.message).join("; ")}`);
  await workflowPhase("gate");
  assertRepairCandidate(original, candidate, source);
  return { candidate, review };
}

/** Backup, lesson, public metadata and game banks commit or roll back together. */
export async function applyStructuredImprovement(improvementId: string, userId: string, notes?: string) {
  if (workflowMode() === "apply") await workflowPhase("gate");
  const { db } = await import("../db");
  return db.transaction(async tx => {
    const [improved] = await tx.select().from(improvedHtmlFiles).where(eq(improvedHtmlFiles.id, improvementId)).for("update");
    if (!improved || improved.contentType !== "lesson" || !["pending", "approved"].includes(improved.status)) throw new Error("Ez a lecke-javítás nem alkalmazható.");
    if (Date.now() - improved.createdAt.getTime() > 30 * 86400000) throw new Error("A javítás 30 napnál régebbi; készíts új előnézetet.");
    const repair = lessonRepairSchema.parse(JSON.parse(improved.content));
    const [original] = await tx.select().from(htmlFiles).where(eq(htmlFiles.id, improved.originalFileId)).for("update");
    const [current] = await tx.select().from(lessons).where(eq(lessons.id, repair.lessonId)).for("update");
    if (!original || original.contentType !== "lesson" || !current || current.htmlFileId !== original.id) throw new Error("A javítás és az eredeti lecke kapcsolata hibás.");
    const active = await tx.select({ id: studioJobs.id }).from(studioJobs).where(and(eq(studioJobs.lessonId, current.id), inArray(studioJobs.status, ["queued", "running", "processing"])));
    if (active.length) throw new Error("A lecke gyártása még fut; várd meg a befejezését.");
    // Share locks keep the reviewed source stable for the whole write transaction.
    const [map] = await tx.select({ subject: knowledgeMaps.subject, classroom: knowledgeMaps.classroom }).from(knowledgeMaps).where(eq(knowledgeMaps.id, current.mapId)).for("share");
    const concepts = await tx.select().from(kmConcepts).where(and(eq(kmConcepts.mapId, current.mapId), ne(kmConcepts.reviewState, "rejected"))).for("share");
    if (!map) throw new Error("A forrás nem található.");
    const source = { ...map, concepts: concepts.map(c => ({ id: c.id, localId: c.localId, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.examWeight as MapConcept["examWeight"] })).sort((a, b) => a.localId.localeCompare(b.localId)) };
    assertRepairFresh(repair, current, source, materialHash(original));
    const coverage = assertRepairCandidate(lessonSchema.parse(current.json), repair.candidate, source);
    if (workflowMode() === "apply") await workflowPhase("apply");
    await workflowFence(tx);
    const quiz = await tx.select().from(gameQuizItems).where(eq(gameQuizItems.lessonId, current.id));
    const backupData = { ...original, structuredLesson: current, quizItems: quiz, expectedCurrentHash: repairHash(repair.candidate), expectedCurrentVersion: current.version + 1 };
    const [backup] = await tx.insert(materialImprovementBackups).values({ originalFileId: original.id, improvedFileId: improved.id, createdBy: userId, notes: notes ?? "Fúziós lecke alkalmazása előtti teljes mentés", backupData }).returning();
    const [written] = await tx.update(lessons).set({ json: repair.candidate, coverage, version: current.version + 1, updatedAt: new Date() }).where(eq(lessons.id, current.id)).returning();
    if (repairHash(written.json) !== repairHash(repair.candidate)) throw new Error("A lecke visszaolvasása eltérést mutat.");
    await tx.delete(gameQuizItems).where(eq(gameQuizItems.lessonId, current.id));
    const exports = exportQuizItemsForPublish(repair.candidate, current.id, conceptIdResolver(source.concepts));
    const inserted = exports.length ? await tx.insert(gameQuizItems).values(exports.map(item => ({ ...item, sourceMaterialId: original.id }))).returning() : [];
    if (inserted.length !== exports.length) throw new Error("Hiányos kvízexport; a művelet visszaáll.");
    const [updated] = await tx.update(htmlFiles).set({ title: repair.candidate.title }).where(eq(htmlFiles.id, original.id)).returning();
    await tx.update(materialImprovementBackups).set({ backupData: { ...backupData, expectedQuizHash: quizHash(inserted), expectedMaterialHash: materialHash(updated) } }).where(eq(materialImprovementBackups.id, backup.id));
    await tx.update(improvedHtmlFiles).set({ status: "applied", appliedAt: new Date(), appliedBy: userId, improvementNotes: notes ?? improved.improvementNotes }).where(eq(improvedHtmlFiles.id, improved.id));
    await workflowFence(tx);
    return { success: true, originalFile: updated, backupId: backup.id };
  });
}

export async function restoreStructuredImprovement(backupId: string, userId: string) {
  const { db } = await import("../db");
  return db.transaction(async tx => {
    const [backup] = await tx.select().from(materialImprovementBackups).where(eq(materialImprovementBackups.id, backupId));
    if (!backup) throw new Error("A mentés nem található.");
    const saved = backup.backupData as typeof htmlFiles.$inferSelect & { structuredLesson: typeof lessons.$inferSelect; quizItems: Array<typeof gameQuizItems.$inferSelect>; expectedCurrentHash: string; expectedCurrentVersion: number; expectedQuizHash: string; expectedMaterialHash: string };
    if (!saved.structuredLesson || !Array.isArray(saved.quizItems)) throw new Error("Hiányos strukturált mentés.");
    lessonSchema.parse(saved.structuredLesson.json);
    const [original] = await tx.select().from(htmlFiles).where(eq(htmlFiles.id, backup.originalFileId)).for("update");
    const [current] = await tx.select().from(lessons).where(eq(lessons.id, saved.structuredLesson.id)).for("update");
    if (!original || !current || current.htmlFileId !== original.id) throw new Error("A visszaállítás célja nem található.");
    if (repairHash(current.json) !== saved.expectedCurrentHash || current.version !== saved.expectedCurrentVersion) throw new Error("A lecke a mentés óta újra megváltozott; későbbi szerkesztést nem írunk felül.");
    const active = await tx.select({ id: studioJobs.id }).from(studioJobs).where(and(eq(studioJobs.lessonId, current.id), inArray(studioJobs.status, ["queued", "running", "processing"])));
    if (active.length) throw new Error("A lecke gyártása még fut.");
    const currentQuiz = await tx.select().from(gameQuizItems).where(eq(gameQuizItems.lessonId, current.id));
    if (quizHash(currentQuiz) !== saved.expectedQuizHash || materialHash(original) !== saved.expectedMaterialHash) throw new Error("A kvízbank vagy az anyag metaadatai később megváltoztak; visszaállítás nem írhatja felül őket.");
    await tx.insert(materialImprovementBackups).values({ originalFileId: original.id, improvedFileId: backup.improvedFileId, createdBy: userId, notes: "Visszaállítás előtti mentés", backupData: { ...original, structuredLesson: current, quizItems: currentQuiz, expectedCurrentHash: repairHash(saved.structuredLesson.json), expectedCurrentVersion: current.version + 1, expectedQuizHash: quizHash(saved.quizItems), expectedMaterialHash: materialHash(saved) } });
    const [written] = await tx.update(lessons).set({ json: saved.structuredLesson.json, coverage: saved.structuredLesson.coverage, version: current.version + 1, updatedAt: new Date() }).where(eq(lessons.id, current.id)).returning();
    if (repairHash(written.json) !== repairHash(saved.structuredLesson.json)) throw new Error("Sikertelen visszaolvasás.");
    await tx.delete(gameQuizItems).where(eq(gameQuizItems.lessonId, current.id));
    if (saved.quizItems.length) await tx.insert(gameQuizItems).values(saved.quizItems.map(q => ({ ...q, createdAt: new Date(q.createdAt) })));
    const [restoredFile] = await tx.update(htmlFiles).set({ title: saved.title, content: saved.content, description: saved.description, classroom: saved.classroom, contentType: saved.contentType }).where(eq(htmlFiles.id, original.id)).returning();
    return { success: true, restoredFile };
  });
}
