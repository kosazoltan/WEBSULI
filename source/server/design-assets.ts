import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { designAssets } from "../shared/schema";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { lessonArtIds, pickLessonArt, type DesignAsset } from "../shared/design-assets";
import { designThemeForClassroom } from "../shared/lesson-design";
import { logger } from "./lib/logger";

/**
 * Websuli ikonkészlet (docs/specs/2026-10-17-websuli-ikonkeszlet.md): a jóváhagyott képek az adatbázisban.
 * - Induláskor a verziókezelt katalógus minden képe bekerül a `design_assets` táblába (csak a változott lenyomatú íródik).
 * - Mentéskor a lecke a tantárgya és évfolyama szerinti ikont kapja (`json.art.subjectIcon`), ha az a táblában megvan.
 * - A lejátszó a `GET /api/design-assets/:id` végpontról tölti.
 */
const ID = /^[a-z0-9-]{3,64}$/;

/** A kép fájlja: a build kimenete (`dist/public`), fejlesztéskor a `client/public`. */
export function assetFilePath(asset: Pick<DesignAsset, "src">, roots = [path.resolve(process.cwd(), "dist", "public"), path.resolve(process.cwd(), "client", "public")]): string | null {
  for (const root of roots) {
    const file = path.join(root, ...asset.src.split("/").filter(Boolean));
    if (existsSync(file)) return file;
  }
  return null;
}

export type SyncReport = { written: number; unchanged: number; missing: string[] };

/** Idempotens: a már azonos lenyomatú képet nem írja újra; a hiányzó fájlt naplózza, a többit betölti. */
export async function syncDesignAssets(catalog: readonly DesignAsset[] = DESIGN_ASSET_CATALOG, roots?: string[]): Promise<SyncReport> {
  const existing = new Map((await db.select({ id: designAssets.id, sha256: designAssets.sha256 }).from(designAssets)).map(r => [r.id, r.sha256]));
  const report: SyncReport = { written: 0, unchanged: 0, missing: [] };
  for (const asset of catalog) {
    const file = assetFilePath(asset, roots);
    if (!file) { report.missing.push(asset.id); continue; }
    const bytes = await readFile(file);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (existing.get(asset.id) === sha256) { report.unchanged++; continue; }
    const row = {
      kind: asset.kind, band: asset.band, subjects: asset.subjects, keywords: asset.keywords, alt: asset.alt, mime: "image/webp",
      sha256, bytes, origin: asset.origin, model: asset.model, promptHash: asset.promptHash, approvedAt: new Date(asset.approvedAt),
      updatedAt: new Date(),
    };
    await db.insert(designAssets).values({ id: asset.id, ...row }).onConflictDoUpdate({ target: designAssets.id, set: row });
    report.written++;
  }
  if (report.missing.length) logger.warn(`[design-assets] Hiányzó képfájl: ${report.missing.join(", ")}`);
  return report;
}

/**
 * Mentés előtti arculat (docs/specs/2026-10-17-lecke-betoltes.md; az ikon a 2026-10-17-websuli-ikonkeszlet szerint): a lecke
 * a sáv ikonját, a rotációval választott hős- vagy borítóképet és (1–5. évfolyamon) a kabalát kapja — csak az adatbázisban
 * megvan elemekből. A lejátszó ezt olvassa, megjelenítéskor nem számol. Review #274: a javítás közvetlen mentése is ezen megy
 * át, a saját tranzakciójában. Ismeretlen tantárgy vagy nem tanított pár: ikon nélkül; hiba esetén a lecke `art` nélkül ment.
 */
export async function withLessonArt<T>(json: T, seed: string, executor: Pick<typeof db, "select"> = db): Promise<T> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const lesson = json as Record<string, unknown>;
  if (typeof lesson.subject !== "string" || typeof lesson.classroom !== "number" || typeof lesson.title !== "string") return json;
  const { art: _previous, ...rest } = lesson;
  try {
    const stored = new Set((await executor.select({ id: designAssets.id }).from(designAssets)).map(r => r.id));
    const catalog = DESIGN_ASSET_CATALOG.filter(a => stored.has(a.id));
    const art = lessonArtIds(pickLessonArt({ subject: lesson.subject, title: lesson.title, seed }, designThemeForClassroom(lesson.classroom), catalog));
    return (Object.keys(art).length ? { ...rest, art } : rest) as T;
  } catch (error) {
    logger.warn("[design-assets] Az arculat nem választható, a lecke art nélkül ment:", error);
    return rest as T;
  }
}

export const designAssetsRouter = Router();
designAssetsRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!ID.test(id)) return res.status(400).json({ message: "Érvénytelen képazonosító." });
  try {
    const [row] = await db.select({ mime: designAssets.mime, sha256: designAssets.sha256, bytes: designAssets.bytes }).from(designAssets).where(eq(designAssets.id, id));
    if (!row) return res.status(404).json({ message: "Nincs ilyen kép." });
    const etag = `"${row.sha256}"`;
    res.set({ "Cache-Control": "public, max-age=86400", ETag: etag, "X-Content-Type-Options": "nosniff" });
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    return res.type(row.mime).send(row.bytes);
  } catch (error) {
    logger.error("[design-assets] A kép nem olvasható:", error);
    return res.status(500).json({ message: "A kép most nem érhető el." });
  }
});
