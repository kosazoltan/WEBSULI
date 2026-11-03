import { eq } from "drizzle-orm";
import { lessons, materialImprovementBackups, type MaterialImprovementBackup } from "../../shared/schema";
import { lessonRepairSchema } from "../../shared/lesson-repair";
import { storage } from "../storage";
import { getHtmlFilesCache } from "../cache/HtmlFilesCache";
import { repairHash } from "../lib/canonical-hash";
import { executeWorkflow, workflowPhase } from "./engine";
import { workflowStore } from "./store";

const withoutArt = (json: unknown) => {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const { art: _art, ...rest } = json as Record<string, unknown>;
  return rest;
};

/**
 * Spec 2026-11-03-apply-visszaolvasas: a mentés a jelöltet `withLessonArt`-tal írja, így az arculat eltérhet a jelöltétől.
 * A lecke az arculaton kívül a jelölttel egyezik, és a hash-ét a javítás egyik tranzakciója rögzítette (`expectedCurrentHash`).
 * Sorrendfüggetlen: egy visszaállítás mentésének hash-e a régi tartalomé, az a tartalmi feltételen bukik.
 */
export function appliedLessonMatches(json: unknown, candidate: unknown, backups: readonly Pick<MaterialImprovementBackup, "improvedFileId" | "backupData">[], improvedFileId: string): boolean {
  const hash = repairHash(json);
  const recorded = backups.some(b => b.improvedFileId === improvedFileId && (b.backupData as { expectedCurrentHash?: unknown } | null)?.expectedCurrentHash === hash);
  return recorded && repairHash(withoutArt(json)) === repairHash(withoutArt(candidate));
}

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
      const repair = lessonRepairSchema.parse(JSON.parse(candidate.content));
      // A lecke és a mentések egy pillanatképből: közben lefutó visszaállítás ne keveredjen a régi sorral.
      const { row, backups } = await db.transaction(async tx => {
        const [row] = await tx.select().from(lessons).where(eq(lessons.id, repair.lessonId));
        const backups = await tx.select().from(materialImprovementBackups).where(eq(materialImprovementBackups.improvedFileId, id));
        return { row, backups };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      if (!row || !appliedLessonMatches(row.json, repair.candidate, backups, id)) throw new Error("Az alkalmazott lecke eltér a jelölttől.");
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
