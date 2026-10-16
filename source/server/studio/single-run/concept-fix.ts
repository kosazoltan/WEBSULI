/**
 * Egyfutásos fogalomjavítás (docs/specs/2026-10-16-egy-futas.md, S4a): a gyenge fogalom célzott újraírása, a hozzá igazított
 * gyakorlóbank és a lektorálás EGY beszélgetésben (Opus 5.5 medium, tartalék GPT-6.1 Sol) — ugyanazokkal a determinisztikus
 * kapukkal, mint a korábbi többmodelles út (`checkConceptFixResult`, `assertRepairCandidate`, blokkoló lektori jegyzetnél nincs mentés).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { htmlFiles, kmConcepts, knowledgeMaps, lessons } from "../../../shared/schema";
import { lessonSchema, type Lesson } from "../../../shared/lesson-schema";
import type { ExamWeight } from "../../../shared/knowledge-map-schema";
import { getHtmlFilesCache } from "../../cache/HtmlFilesCache";
import { workflowPhase } from "../../workflows/engine";
import { buildLessonExperience } from "../experience-builder";
import { classifyNotes } from "../lektor";
import { buildConceptFixPrompt, buildLektorPrompt, checkConceptFixResult, parseLektorResponse, type LektorReport } from "../step-io";
import { createLessonConversation, type LessonConversation } from "./conversation";
import { conversationBankCall, runStation, singleRunSystemPrompt } from "./engine";

export type FixConceptResult = { ok: true; message: string } | { ok: false; error: string };
export type ConceptFixSource = { subject: string; classroom: number; concepts: Array<{ id: string; localId: string; term: string; definition: string; quote: string; examWeight: ExamWeight }> };

/** A tanított (megtartott vagy szerkesztett) fogalmak — ugyanaz a szűrő, mint a gyártásnál. */
const TAUGHT_REVIEW_STATES = ["kept", "edited"] as const;

/**
 * A javítás magja (adatbázis nélkül, tesztelhető): szerzői javítás → bank → lektor → kapu, egy beszélgetésben.
 * Hibánál `{ ok: false }` az okkal; siker esetén a jelölt és a lektor jegyzetei (a mentést a hívó végzi).
 */
export async function fixConceptInConversation(input: {
  original: Lesson; source: ConceptFixSource; conceptId: string; conversation: LessonConversation; log?: (m: string) => void;
}): Promise<{ ok: true; candidate: Lesson; report: LektorReport } | { ok: false; error: string }> {
  const { original, source, conceptId, conversation } = input;
  const deps = { conversation, log: input.log };
  // A szűk szerző csak a tanítást szerkeszti; a bank a javított tanításból újraépül, és újra lektorálódik.
  const teaching = { ...original, experience: undefined };
  const { assertRepairCandidate } = await import("../structured-improvement");
  try {
    await workflowPhase("author");
    const prompt = buildConceptFixPrompt(teaching, source, conceptId);
    const candidate = await runStation(deps, "fogalomjavítás", [{ type: "text", text: `FOGALOMJAVÍTÁS (${conceptId}).\n${prompt}\nVálaszolj kizárólag a teljes lecke JSON-jával.` }], (json) => {
      const parsed = lessonSchema.safeParse(json);
      if (!parsed.success) return { ok: false, problems: parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".")}: ${i.message}`) };
      const check = checkConceptFixResult(teaching, { ...parsed.data, experience: undefined }, conceptId);
      return check.ok ? { ok: true, value: parsed.data } : { ok: false, problems: check.reasons.map((r) => `A javítás túllépett a célfogalmon: ${r}`) };
    });
    await workflowPhase("banks");
    candidate.experience = await buildLessonExperience(candidate, source.concepts, { call: conversationBankCall(conversation), concurrency: 1 });
    assertRepairCandidate(original, candidate, source);
    await workflowPhase("lektor");
    const report = await runStation(deps, "a javítás lektorálása", [{ type: "text", text: `LEKTORÁLÁS — a javított tanítás és a friss bankok, a forráshoz mérve.\n${buildLektorPrompt(candidate, source)}\nVálaszolj kizárólag a lektori jelentés JSON-jával.` }],
      (json) => { const r = parseLektorResponse(json); return r.ok ? { ok: true, value: r.report } : { ok: false, problems: [r.reason] }; });
    if (classifyNotes(report.notes).some((n) => n.blocking)) return { ok: false, error: "A lektor még hibát talált, az eredeti lecke érintetlen." };
    await workflowPhase("gate");
    assertRepairCandidate(original, candidate, source);
    return { ok: true, candidate, report };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "A javítás nem alkalmazható; az eredeti érintetlen." };
  }
}

/** A lektorált lecke EGY gyenge fogalmának célzott újraírása; a javítás csak a teljes kapu után, a javítási úton alkalmazódik. */
export async function fixConceptSingleRun(lessonId: string, conceptId: string, actorId?: string): Promise<FixConceptResult> {
  await workflowPhase("source");
  // Lazy: a modul importja nem nyithat adatbázis-kapcsolatot.
  const { db } = await import("../../db");
  const [row] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!row) return { ok: false, error: "A lecke nem található." };
  if (!actorId) return { ok: false, error: "A mentéshez hitelesített készítő szükséges." };
  if (!row.htmlFileId) return { ok: false, error: "Csak már elérhető lecke javítható ezen az útvonalon." };
  const [originalMaterial] = await db.select().from(htmlFiles).where(eq(htmlFiles.id, row.htmlFileId));
  if (!originalMaterial) return { ok: false, error: "Az eredeti tananyag metaadatai nem találhatók." };
  const original = lessonSchema.parse(row.json);
  const [mapRow] = await db.select({ subject: knowledgeMaps.subject, classroom: knowledgeMaps.classroom }).from(knowledgeMaps).where(eq(knowledgeMaps.id, row.mapId)).limit(1);
  if (!mapRow) return { ok: false, error: "A lecke fogalomtérképe nem található." };
  const conceptRows = await db.select({ id: kmConcepts.id, localId: kmConcepts.localId, term: kmConcepts.term, definition: kmConcepts.definition, quote: kmConcepts.quote, examWeight: kmConcepts.examWeight })
    .from(kmConcepts).where(and(eq(kmConcepts.mapId, row.mapId), inArray(kmConcepts.reviewState, TAUGHT_REVIEW_STATES))).orderBy(asc(kmConcepts.orderIndex), asc(kmConcepts.id));
  const source: ConceptFixSource = { ...mapRow, concepts: conceptRows.map((c) => ({ ...c, examWeight: c.examWeight as ExamWeight })).sort((a, b) => a.localId.localeCompare(b.localId)) };

  let conversation: LessonConversation;
  try { conversation = createLessonConversation(singleRunSystemPrompt()); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Nincs beállított modellkulcs." }; }
  const fixed = await fixConceptInConversation({ original, source, conceptId, conversation });
  if (!fixed.ok) return fixed;
  try {
    const { repairHash, materialHash, applyStructuredImprovement } = await import("../structured-improvement");
    const { improvedHtmlFiles } = await import("../../../shared/schema");
    await workflowPhase("save");
    const [improved] = await db.insert(improvedHtmlFiles).values({ originalFileId: row.htmlFileId, title: fixed.candidate.title, classroom: fixed.candidate.classroom, contentType: "lesson",
      content: JSON.stringify({ kind: "lesson-repair-fusion-1", lessonId, baseVersion: row.version, baselineHash: repairHash(row.json), baselineMaterialHash: materialHash(originalMaterial), sourceHash: repairHash(source), previousLesson: original, candidate: fixed.candidate, reviewNotes: fixed.report.notes }),
      improvementPrompt: `Célzott fogalomjavítás: ${conceptId}`, createdBy: actorId, status: "pending" }).returning();
    await workflowPhase("apply");
    await applyStructuredImprovement(improved.id, actorId, `Célzott fogalomjavítás, friss bankokkal: ${conceptId}`);
    getHtmlFilesCache().invalidate();
    return { ok: true, message: `A(z) ${conceptId} fogalom javítása és a hozzá igazított gyakorlóbank mentéssel, együtt frissítve.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "A javítás nem alkalmazható; az eredeti érintetlen." };
  }
}
