import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { designAssets } from "../shared/schema";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import type { DesignAsset } from "../shared/design-assets";
import { subjectIconId } from "../shared/subject-icons";
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
 * Mentés előtti ikonválasztás: a lecke tantárgyából és évfolyamából az `icon-<tantárgy>-<sáv>` azonosító, ha a kép az
 * adatbázisban megvan (review #274: a javítás közvetlen mentése is ezen megy át, a saját tranzakciójában). Ismeretlen tantárgy, nem tanított pár vagy hiányzó kép: a lecke ikon nélkül ment (régi `art` törölve).
 */
export async function withSubjectIcon<T>(json: T, executor: Pick<typeof db, "select"> = db): Promise<T> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const lesson = json as Record<string, unknown>;
  if (typeof lesson.subject !== "string" || typeof lesson.classroom !== "number") return json;
  const { art: _previous, ...rest } = lesson;
  try {
    const id = subjectIconId(lesson.subject, lesson.classroom);
    if (!id) return rest as T;
    const [row] = await executor.select({ id: designAssets.id }).from(designAssets).where(eq(designAssets.id, id));
    return (row ? { ...rest, art: { subjectIcon: row.id } } : rest) as T;
  } catch (error) {
    logger.warn("[design-assets] Az ikon nem kereshető, a lecke ikon nélkül ment:", error);
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
