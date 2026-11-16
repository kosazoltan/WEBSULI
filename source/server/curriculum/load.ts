import { and, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { htmlFiles, lessons } from "../../shared/schema";
import type { ContentLoader } from "./index";

/**
 * A tanmenet-illesztés tartalombetöltője (docs/specs/2026-10-18-tanmenet-kiegeszites.md): csak a kért (cím alapján nem
 * illeszthető) anyagokhoz — leckénél a legutóbb publikált JSON, egyébként a HTML.
 */
/** Ennyi anyag lecke-JSON-ja olvasható be egy lekérdezésben (#67). */
export const CURRICULUM_JSON_BATCH = 16;

export const loadCurriculumContent: ContentLoader = async (items) => {
  const out = new Map<string, { html?: string; lesson?: unknown }>();
  const ids = items.map(i => i.id);
  if (!ids.length) return out;
  // #67: anyagonként csak a legutóbb közzétett sor, kötegenként — korábban minden kért anyag MINDEN közzétett verziójának
  // teljes JSON-ja egyszerre töltődött be (lista-érvénytelenítés / újraindulás után memória-csúcs).
  for (let i = 0; i < ids.length; i += CURRICULUM_JSON_BATCH) {
    // A címsor-illesztés (hintsFromLesson) csak a `sections`-t olvassa: a kvíz / feladatbank nem jön át a hálózaton.
    const lessonRows = await db.selectDistinctOn([lessons.htmlFileId], { fileId: lessons.htmlFileId, json: sql<unknown>`jsonb_build_object('sections', ${lessons.json}->'sections')` })
      .from(lessons).where(and(inArray(lessons.htmlFileId, ids.slice(i, i + CURRICULUM_JSON_BATCH)), isNotNull(lessons.publishedAt)))
      .orderBy(lessons.htmlFileId, desc(lessons.publishedAt));
    for (const r of lessonRows) if (r.fileId && !out.has(r.fileId)) out.set(r.fileId, { lesson: r.json });
  }
  // Review #284: PDF-nél nincs címsor, a (akár 100 MB-os) base64 tartalmat nem olvassuk be.
  const htmlIds = items.filter(i => !out.has(i.id) && (i.contentType ?? "html") === "html").map(i => i.id);
  if (htmlIds.length) {
    const rows = await db.select({ id: htmlFiles.id, content: htmlFiles.content }).from(htmlFiles).where(inArray(htmlFiles.id, htmlIds));
    for (const r of rows) out.set(r.id, { html: r.content });
  }
  return out;
};
