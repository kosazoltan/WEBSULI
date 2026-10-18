import { and, desc, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { htmlFiles, lessons } from "../../shared/schema";
import type { ContentLoader } from "./index";

/**
 * A tanmenet-illesztés tartalombetöltője (docs/specs/2026-10-18-tanmenet-kiegeszites.md): csak a kért (cím alapján nem
 * illeszthető) anyagokhoz — leckénél a legutóbb publikált JSON, egyébként a HTML.
 */
export const loadCurriculumContent: ContentLoader = async (items) => {
  const out = new Map<string, { html?: string; lesson?: unknown }>();
  const ids = items.map(i => i.id);
  if (!ids.length) return out;
  const lessonRows = await db.select({ fileId: lessons.htmlFileId, json: lessons.json, publishedAt: lessons.publishedAt })
    .from(lessons).where(and(inArray(lessons.htmlFileId, ids), isNotNull(lessons.publishedAt))).orderBy(desc(lessons.publishedAt));
  for (const r of lessonRows) if (r.fileId && !out.has(r.fileId)) out.set(r.fileId, { lesson: r.json });
  const htmlIds = ids.filter(id => !out.has(id));
  if (htmlIds.length) {
    const rows = await db.select({ id: htmlFiles.id, content: htmlFiles.content }).from(htmlFiles).where(inArray(htmlFiles.id, htmlIds));
    for (const r of rows) out.set(r.id, { html: r.content });
  }
  return out;
};
