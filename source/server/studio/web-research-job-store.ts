import { and, eq } from "drizzle-orm";
import { aiGenerationRequests, htmlFiles } from "../../shared/schema";
import type { ResearchJobStore, StoredResearchJob } from "./web-research-jobs";
import { checkedResearchArtifact } from "./web-research-jobs";
import { WebResearchFailure } from "./web-research-runner";
import { getHtmlFilesCache } from "../cache/HtmlFilesCache";
import { workflowFence } from "../workflows/engine";

const status = (state: StoredResearchJob["state"]) => `web_research_${state}`;
const decode = (row: typeof aiGenerationRequests.$inferSelect): StoredResearchJob | null =>
  row.status.startsWith("web_research_") && row.generatedContent ? JSON.parse(row.generatedContent) as StoredResearchJob : null;

/** Uses the existing request table; publishing + done state commit together. */
export const researchJobStore: ResearchJobStore = {
  async verifyMaterial(id, userId, html) {
    const { db } = await import("../db");
    const [row] = await db.select({ content: htmlFiles.content }).from(htmlFiles).where(and(eq(htmlFiles.id, id), eq(htmlFiles.userId, userId)));
    return row?.content === html;
  },
  async create(job) {
    const { db } = await import("../db");
    const inserted = await db.insert(aiGenerationRequests).values({ id: job.id, userId: job.userId, prompt: JSON.stringify(job.input), status: status(job.state), generatedContent: JSON.stringify(job) }).onConflictDoNothing().returning({ id: aiGenerationRequests.id });
    return inserted.length === 1;
  },
  async read(id, userId) {
    const { db } = await import("../db");
    const [row] = await db.select().from(aiGenerationRequests).where(and(eq(aiGenerationRequests.id, id), eq(aiGenerationRequests.userId, userId)));
    return row ? decode(row) : null;
  },
  async update(job, expectedState) {
    const { db } = await import("../db");
    await db.update(aiGenerationRequests).set({ status: status(job.state), generatedContent: JSON.stringify(job), error: job.error ?? null }).where(and(eq(aiGenerationRequests.id, job.id), eq(aiGenerationRequests.userId, job.userId), eq(aiGenerationRequests.status, status(expectedState))));
  },
  async publish(id, userId) {
    const { db } = await import("../db");
    const result = await db.transaction(async tx => {
      await workflowFence(tx);
      const [row] = await tx.select().from(aiGenerationRequests).where(and(eq(aiGenerationRequests.id, id), eq(aiGenerationRequests.userId, userId))).for("update");
      const job = row ? decode(row) : null;
      if (!job) throw new WebResearchFailure("A futás nem található.");
      if (job.state === "done") return job;
      if (job.state !== "ready" || !job.html) throw new WebResearchFailure("Még nincs ellenőrzött, menthető tananyag.");
      const data = checkedResearchArtifact({ html: job.html, sources: job.sources, reviewEvidence: job.reviewEvidence });
      await tx.insert(htmlFiles).values({ id, userId, title: job.title, content: job.html, classroom: data.classroom, contentType: "html", description: `Internetes forrásokból készült tananyag, ${data.classroom}. osztály.` });
      job.state = "done";
      job.materialId = id;
      job.error = undefined;
      job.stage = "A tananyag elkészült és elmentve.";
      await tx.update(aiGenerationRequests).set({ status: status("done"), generatedContent: JSON.stringify(job), error: null }).where(eq(aiGenerationRequests.id, id));
      await workflowFence(tx);
      return job;
    });
    getHtmlFilesCache().invalidate();
    return result;
  },
};
