import { eq } from "drizzle-orm";
import { lessons } from "../../shared/schema";
import { lessonRepairSchema } from "../../shared/lesson-repair";
import { storage } from "../storage";
import { getHtmlFilesCache } from "../cache/HtmlFilesCache";
import { executeWorkflow, workflowPhase } from "./engine";
import { workflowStore } from "./store";

/** One guarded application path, including clients using the old force-apply URL. */
export async function applyTrackedImprovement(id: string, owner: string, notes?: string) {
  const workflowId = `apply:${id}`;
  await executeWorkflow(workflowStore, { id: workflowId, owner, mode: "apply", retry: true, request: { id } }, async () => {
    await workflowPhase("source");
    const candidate = await storage.getImprovedHtmlFile(id);
    if (!candidate) throw new Error("A javítójelölt nem található.");
    if (candidate.status === "applied") {
      // A restart after the transaction committed must never apply twice.
      await workflowPhase("gate");
      await workflowPhase("apply");
    } else {
      await storage.applyImprovedFileToOriginal(id, owner, true, notes);
    }
    await workflowPhase("readback");
    const saved = await storage.getImprovedHtmlFile(id);
    const original = await storage.getHtmlFile(candidate.originalFileId);
    if (!original || saved?.status !== "applied") throw new Error("Az alkalmazás nem igazolható visszaolvasással.");
    if (candidate.contentType === "lesson") {
      const { db } = await import("../db");
      const { repairHash } = await import("../studio/structured-improvement");
      const repair = lessonRepairSchema.parse(JSON.parse(candidate.content));
      const [row] = await db.select().from(lessons).where(eq(lessons.id, repair.lessonId));
      if (!row || repairHash(row.json) !== repairHash(repair.candidate)) throw new Error("Az alkalmazott lecke eltér a jelölttől.");
    } else if (original.content !== candidate.content) throw new Error("Az alkalmazott HTML eltér a jelölttől.");
    return { kind: "material", id: original.id };
  });
  const candidate = await storage.getImprovedHtmlFile(id);
  const originalFile = candidate && await storage.getHtmlFile(candidate.originalFileId);
  if (!originalFile) throw new Error("Az anyag nem olvasható vissza.");
  const backups = await storage.getAllMaterialImprovementBackups(originalFile.id);
  getHtmlFilesCache().invalidate();
  return { success: true, originalFile, backupId: backups.find(b => b.improvedFileId === id)?.id, workflowId };
}
