import { createHash } from "node:crypto";
import sharp from "sharp";
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { lessonSourceImages } from "../shared/schema";
import { SOURCE_IMAGE_ID } from "../shared/source-image";
import { sniffImageMime } from "./studio/document-source";

/**
 * D1H-1 (docs/specs/2026-11-25-d1h-kivagott-kep.md): a forrás kivágott képeinek tára. Tartalomcímzett (sha256): ugyanaz a kép egyszer
 * tárolódik, a meta az első tárolásé. Csak valódi (bájtokból felismert) kép, legfeljebb 3 MB.
 */
export const SOURCE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export type SourceImageMeta = { sourceUrl?: string; sourceFile?: string; page?: number; credit: string };

export async function storeSourceImage(bytes: Buffer, meta: SourceImageMeta): Promise<string> {
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error("A kivágott forrás nem kép.");
  if (bytes.length > SOURCE_IMAGE_MAX_BYTES) throw new Error("A kivágott kép túl nagy.");
  // Review #594: a szignatúra kevés — a teljes kép dekódolható legyen (a sérült / csonka kép nem kerül a tárba).
  try {
    const { width, height } = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 }).stats().then(() => sharp(bytes).metadata());
    if (!width || !height) throw new Error("méret nélkül");
  } catch { throw new Error("A kivágott kép sérült vagy nem dekódolható."); }
  const id = createHash("sha256").update(bytes).digest("hex");
  await db.insert(lessonSourceImages).values({ id, mime, bytes, sourceUrl: meta.sourceUrl ?? null, sourceFile: meta.sourceFile ?? null, page: meta.page ?? null, credit: meta.credit.slice(0, 200) })
    .onConflictDoNothing({ target: lessonSourceImages.id });
  return id;
}

/** GET /api/source-images/:id — nyilvános (a lecke része), változatlan tartalom → hosszú gyorsítótár; `nosniff`. */
export const sourceImagesRouter = Router();
sourceImagesRouter.get("/:id", async (req, res, next) => {
  try {
    if (!SOURCE_IMAGE_ID.test(req.params.id)) return res.status(400).json({ message: "Érvénytelen képazonosító." });
    const [row] = await db.select({ mime: lessonSourceImages.mime, bytes: lessonSourceImages.bytes }).from(lessonSourceImages).where(eq(lessonSourceImages.id, sql`${req.params.id}`));
    if (!row) return res.status(404).json({ message: "Nincs ilyen kép." });
    res.setHeader("Content-Type", row.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.end(row.bytes);
  } catch (error) { next(error); }
});
