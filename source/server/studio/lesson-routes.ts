import express, { type Request, type Response } from "express";
import { desc, eq, isNotNull } from "drizzle-orm";

import { db } from "../db";
import { lessons, htmlFiles } from "../../shared/schema";
import { lessonSchema } from "../../shared/lesson-schema";
import { logger } from "../lib/logger";

/**
 * Public read side of the Lesson Studio (LS-2).
 *
 * Separate from studio/routes.ts because the audience is different: those endpoints are
 * admin-only and spend money, these are what a pupil's browser fetches. Only published
 * lessons are served, and the stored JSON is re-validated before it leaves the server —
 * a lesson row that no longer matches the schema is an incident, not something to stream
 * to a child half-rendered.
 */

export const lessonPublicRouter = express.Router();

/** GET /api/lessons/by-file/:htmlFileId — the lesson behind a `contentType:'lesson'` material. */
lessonPublicRouter.get("/by-file/:htmlFileId", async (req: Request, res: Response) => {
  const [row] = await db
    .select({
      id: lessons.id,
      json: lessons.json,
      publishedAt: lessons.publishedAt,
      version: lessons.version,
    })
    .from(lessons)
    .where(eq(lessons.htmlFileId, req.params.htmlFileId))
    .orderBy(desc(lessons.version))
    .limit(1);

  if (!row) return res.status(404).json({ message: "Ehhez a tananyaghoz nincs lecke." });

  if (!row.publishedAt) {
    return res.status(404).json({ message: "Ez a lecke még nincs publikálva." });
  }

  const parsed = lessonSchema.safeParse(row.json);
  if (!parsed.success) {
    // Loud on the server, vague to the client: the pupil cannot act on a schema error.
    logger.error(
      `[LESSON] A tárolt lecke nem érvényes: ${row.id} — ${parsed.error.issues.length} hibás mező.`,
    );
    return res.status(500).json({ message: "A lecke sérült, szólj az adminnak." });
  }

  res.json({ lessonId: row.id, version: row.version, lesson: parsed.data });
});

/** GET /api/lessons — published lessons, for listings. */
lessonPublicRouter.get("/", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: lessons.id,
      htmlFileId: lessons.htmlFileId,
      publishedAt: lessons.publishedAt,
      title: htmlFiles.title,
      classroom: htmlFiles.classroom,
    })
    .from(lessons)
    .leftJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id))
    .where(isNotNull(lessons.publishedAt))
    .orderBy(desc(lessons.publishedAt))
    .limit(200);

  res.json({ lessons: rows });
});
