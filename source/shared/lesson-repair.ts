import { z } from "zod";
import { lessonSchema, modelLessonSchema } from "./lesson-schema";
import { carryVarietyMarker } from "./lesson-feedback-openers";

/** A reviewable candidate, never HTML disguised as a structured lesson. */
export const lessonRepairSchema = z.object({
  kind: z.literal("lesson-repair-fusion-1"),
  lessonId: z.string().min(1), baseVersion: z.number().int().positive(),
  baselineHash: z.string().length(64), baselineMaterialHash: z.string().length(64), sourceHash: z.string().length(64),
  previousLesson: lessonSchema, candidate: lessonSchema,
  // Admin audit data; never part of the pupil's lesson or a source rewrite.
  reviewNotes: z.array(z.object({
    kind: z.enum(["source_conflict", "coverage_gap", "language", "age"]),
    subkind: z.string().optional(), message: z.string(), blockPath: z.string().optional(),
  })).optional(),
  // Spec 2026-09-23: the teacher's request and the documented source corrections it justified; written
  // to the map rows only when the reviewed candidate is applied (the quote never changes).
  ownerInstruction: z.string().max(4000).optional(),
  sourceCorrections: z.array(z.object({
    localId: z.string().min(1), term: z.string().min(1).max(200).optional(), definition: z.string().min(1).optional(),
    // Spec 2026-10-03-forras-aritmetika-helyesbites (review #181): a determinisztikus `arithmetic` alap és a tanuló hibája.
    basis: z.enum(["owner", "transcription", "arithmetic"]), reason: z.string(),
    from: z.object({ term: z.string().optional(), definition: z.string().optional() }),
    studentError: z.object({ expression: z.string(), written: z.string(), expected: z.string() }).optional(),
  })).optional(),
  classroom: z.number().int().min(1).max(12).optional(),
  // Spec 2026-09-30 (U6, C16) + review #164: a javító-lektor által eldöntetlen régi-alak jelöltek (figyelmeztetés, admin).
  // Review #331 (spec 2026-10-20-elakadas-gyokerok-elemzes, R1): a lektor által blokkolt, ezért kivett banktételek útvonalai
  // (a reviewNotes útvonalai a kivétel előtti indexekre vonatkoznak).
  lektorRemoved: z.array(z.string()).optional(),
  staleWarnings: z.array(z.object({
    path: z.string(), sentence: z.string().max(400), oldForm: z.string(), newForm: z.string(), reason: z.string().max(300),
  })).optional(),
});
export type LessonRepair = z.infer<typeof lessonRepairSchema>;
/**
 * A frissen ÉPÍTETT javítás sémája. CSAK a `candidate` a modell kimenete: a funkciókapcsoló KI állapotában azt a bővítés előtti séma
 * méri. A `previousLesson` a TÁROLT lecke pillanatképe (nem modellkimenet) — mindig a teljes olvasási séma (`lessonSchema`) olvassa:
 * egy BE állapotban mentett, új fajtájú ábrát tartalmazó lecke javítása a kapcsoló KI-re állítása után sem bukhat el a pillanatképen
 * (a fizetett javítás és lektorálás UTÁN). Régi leckére a teljes séma a bővítés előttivel azonos eredményt ad (őr: séma-próba).
 */
/** Review #638: a javítás-artefaktum lezáró sémája. RED: a régi viselkedés (mindig a modell-séma). */
export function repairArtefactSchema(_bankOnly: boolean, sourceVisuals: boolean): z.ZodType<LessonRepair, z.ZodTypeDef, unknown> {
  return modelLessonRepairSchema(sourceVisuals);
}

export function modelLessonRepairSchema(sourceVisuals: boolean): z.ZodType<LessonRepair, z.ZodTypeDef, unknown> {
  return sourceVisuals ? lessonRepairSchema : lessonRepairSchema.extend({ candidate: modelLessonSchema(false) });
}
/**
 * A frissen épített javítás lezárása (Vercel-review #530): a séma-ellenőrzés UTÁN a jelölt változatossági jelölője a TÁROLT lecke
 * (`previousLesson`) jelölője lesz — a KI forrásábra-ág sémája a jelölőt eldobja, így nélküle a jelölt lecke előnézete eltérne az
 * alkalmazott leckétől (az alkalmazás a jelölőt visszaírja). A modell kéretlen jelölője soha nem megy át.
 */
export function markRepairCandidate(repair: LessonRepair): LessonRepair {
  return { ...repair, candidate: carryVarietyMarker(repair.candidate, repair.previousLesson) };
}
export function sealLessonRepair(sourceVisuals: boolean, input: unknown): LessonRepair {
  return markRepairCandidate(modelLessonRepairSchema(sourceVisuals).parse(input));
}
export function parseLessonRepair(content?: string): LessonRepair | null {
  if (!content?.trim().startsWith("{")) return null;
  try { const parsed = lessonRepairSchema.safeParse(JSON.parse(content)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
