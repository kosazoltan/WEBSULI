import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { designAssets, lessons } from "../shared/schema";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { type DesignAsset } from "../shared/design-assets";
import { computeLessonArt } from "../shared/lesson-art-compute";
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

/**
 * Review #277: az induló szinkron ígérete. A mentéskori arculatválasztás megvárja (legfeljebb `SYNC_WAIT_MS`-ig), különben a deploy
 * utáni első percekben mentett lecke a még be nem töltött borító helyett végleges tartalékképet rögzítene (nincs utólagos pótlás).
 */
let initialSync: Promise<SyncReport> | null = null;
let rerunSync: (() => Promise<SyncReport>) | null = null;
export const SYNC_WAIT_MS = 60_000;
export function startDesignAssetSync(run: () => Promise<SyncReport> = () => syncDesignAssets()): Promise<SyncReport> {
  rerunSync = run;
  initialSync = run();
  return initialSync;
}
async function settledWithin(sync: Promise<SyncReport>, ms: number): Promise<"ok" | "failed" | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([sync.then(() => "ok" as const, () => "failed" as const), new Promise<"timeout">(r => { timer = setTimeout(() => r("timeout"), ms); })]);
  if (timer) clearTimeout(timer);
  return result;
}
/**
 * Review #377: a sikertelen induló szinkron (átmeneti DB- / fájlhiba) nem hagyhatja tartalékképpel menteni a leckéket — a mentés előtt
 * egyszer újrafut; ha az is hibás, a következő mentés újra próbálja.
 */
export async function initialSyncSettled(ms = SYNC_WAIT_MS): Promise<void> {
  const observed = initialSync;
  if (!observed) return;
  if ((await settledWithin(observed, ms)) !== "failed" || !rerunSync) return;
  // Review #377: egyidejű mentéseknél csak az első indít újrafutást, a többi ugyanazt várja meg.
  if (initialSync === observed) {
    logger.warn("[design-assets] Az előző képkészlet-szinkron sikertelen volt — mentés előtt újrafut.");
    initialSync = rerunSync();
  }
  await settledWithin(initialSync!, ms);
}

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
      kind: asset.kind, band: asset.band, subjects: asset.subjects, keywords: asset.keywords, topic: asset.topic ?? null, alt: asset.alt, mime: "image/webp",
      sha256, bytes, origin: asset.origin, model: asset.model, promptHash: asset.promptHash, approvedAt: new Date(asset.approvedAt),
      updatedAt: new Date(),
    };
    await db.insert(designAssets).values({ id: asset.id, ...row }).onConflictDoUpdate({ target: designAssets.id, set: row });
    forgetThumb(asset.id);
    report.written++;
  }
  if (report.missing.length) logger.warn(`[design-assets] Hiányzó képfájl: ${report.missing.join(", ")}`);
  return report;
}

/**
 * Mentés előtti arculat (docs/specs/2026-10-17-lecke-betoltes.md; az ikon a 2026-10-17-websuli-ikonkeszlet szerint): a lecke
 * a sáv ikonját, a rotációval választott hős- vagy borítóképet és (1–5. évfolyamon) a kabalát kapja — csak az adatbázisban
 * megvan elemekből. A lejátszó ezt olvassa, megjelenítéskor nem számol. Review #274: a javítás közvetlen mentése is ezen megy
 * át, a saját tranzakciójában. Ismeretlen tantárgy vagy nem tanított pár: ikon nélkül; hiba esetén a meglévő `art` marad (ha nincs: nélküle).
 */
export async function withLessonArt<T>(json: T, seed: string, executor: Pick<typeof db, "select"> = db): Promise<T> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const lesson = json as Record<string, unknown>;
  if (typeof lesson.subject !== "string" || typeof lesson.classroom !== "number" || typeof lesson.title !== "string") return json;
  const { art: previousArt, ...rest } = lesson;
  await initialSyncSettled();
  try {
    const stored = new Set((await executor.select({ id: designAssets.id }).from(designAssets)).map(r => r.id));
    // Arculati bank (S1): a lecke témaköre (tantárgy, évfolyam, cím) → a témakör borítója, ha az a táblában megvan.
    // A tiszta mag a backfill-szkripttel közös (docs/specs/2026-10-18-arculat-backfill.md).
    // Spec 2026-11-03-leckeborito: a kézzel beállított leckeborító (korábbi `art.picture`) az újraválasztás után is megmarad.
    let previous = previousArt && typeof previousArt === "object" ? (previousArt as { picture?: unknown }).picture : undefined;
    // Review #382: a javítási jelölt (modellkimenet) kihagyhatja az opcionális `art`-ot — ilyenkor a tárolt lecke képe számít
    // (a seed meglévő leckénél az azonosítója; ugyanabban a tranzakcióban olvasva). Új leckénél nincs ilyen sor.
    if (typeof previous !== "string") {
      const [row] = await executor.select({ picture: sql<string | null>`${lessons.json}->'art'->>'picture'` }).from(lessons).where(eq(lessons.id, seed));
      previous = row?.picture ?? undefined;
    }
    const art = computeLessonArt(lesson, seed, stored, undefined, previous) ?? {};
    return (Object.keys(art).length ? { ...rest, art } : rest) as T;
  } catch (error) {
    // Review #382: átmeneti hiba esetén a meglévő arculat (benne a kézi borító) marad; art nélkül csak az eddig arculat nélküli lecke ment.
    const kept = previousArt && typeof previousArt === "object" && !Array.isArray(previousArt);
    logger.warn(`[design-assets] Az arculat nem választható, a lecke ${kept ? "a meglévő arculatával" : "art nélkül"} ment:`, error);
    return (kept ? { ...rest, art: previousArt } : rest) as T;
  }
}

/** Spec 2026-11-03-fooldal-boritokartyak: a főoldali kártya bélyegképe (3:2) — a borító 1200×800-as, ~100 KB-os WebP-je helyett. */
export const THUMB_WIDTH = 480;
export const THUMB_HEIGHT = 320;
/**
 * Review #381 (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w): a sharp ≥ 0.35.5 a javított libvips / libheif / librsvg
 * könyvtárakkal; mélységi védelemként a nem használt, kockázatos dekódolók tiltva — a katalógus csak WebP (és JPEG/PNG forrás) képet tárol.
 */
const BLOCKED_LOADERS = ["VipsForeignLoadNsgif", "VipsForeignLoadTiff", "VipsForeignLoadVips", "VipsForeignLoadHeif", "VipsForeignLoadSvg"];
let sharpLoad: Promise<typeof import("sharp")["default"]> | null = null;
function loadSharp() {
  sharpLoad ??= import("sharp").then(({ default: sharp }) => { sharp.block({ operation: BLOCKED_LOADERS }); return sharp; });
  return sharpLoad;
}
export async function makeThumbnail(bytes: Buffer): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(bytes, { failOn: "error" }).resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" }).webp({ quality: 70 }).toBuffer();
}
/**
 * Spec 2026-11-03-fooldal-sebesseg: a build által készített bélyegképek (scripts/build-design-thumbs.mjs) — a katalógus borítója és
 * hős-képe statikus, tartalom-hash-es, immutable fájl; csak az adatbázisban lévő kép (pl. automatikus borító) megy a futásidejű végpontra.
 */
let thumbManifest: Record<string, string> | null = null;
export function loadThumbManifest(roots = [path.resolve(process.cwd(), "dist", "public", "design-thumbs"), path.resolve(process.cwd(), "client", "public", "design-thumbs")]): Record<string, string> {
  if (thumbManifest) return thumbManifest;
  thumbManifest = {};
  for (const root of roots) {
    const file = path.join(root, "manifest.json");
    if (!existsSync(file)) continue;
    try { thumbManifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>; break; }
    catch (error) { logger.warn(`[design-assets] A bélyegkép-manifest nem olvasható (${file}):`, error); }
  }
  return thumbManifest;
}
export function thumbUrlFor(id: string, manifest = loadThumbManifest()): string {
  const name = manifest[id];
  return name ? `/design-thumbs/${name}` : `/api/design-assets/${id}/thumb`;
}

/** Azonosító → bélyegkép (lenyomattal); a legrégebbi kiesik (≈ 400 × 15 KB). A képszinkron a felülírt azonosítót üríti. */
type Thumb = { sha256: string; buf: Buffer };
const thumbById = new Map<string, Thumb>();
const thumbInflight = new Map<string, Promise<Thumb | null>>();
const THUMB_CACHE_MAX = 400;
/** Egyszerre legfeljebb ennyi sharp-művelet: a CPU-t nem fojtja meg egy hideg főoldal-betöltés (mérve: 20 párhuzamos → 3,5 s). */
const SHARP_SLOTS = 2;
let sharpBusy = 0;
const sharpWaiting: Array<() => void> = [];
async function withSharpSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (sharpBusy >= SHARP_SLOTS) await new Promise<void>((resolve) => sharpWaiting.push(resolve));
  sharpBusy++;
  try { return await fn(); } finally { sharpBusy--; sharpWaiting.shift()?.(); }
}
/** Review #385: a futó generálás regisztrációját is törli — annak elavult eredménye így nem kerülhet vissza a gyorsítótárba. */
export function forgetThumb(id: string) { thumbById.delete(id); thumbInflight.delete(id); }
/** Memóriatalálat DB nélkül; egy azonosítót egyszerre csak egyszer generál (az egyidejű kérések ugyanazt a promise-t kapják). */
export function thumbnailFor(id: string, load: (id: string) => Promise<{ sha256: string; bytes: Buffer } | null> = loadAssetBytes, make: (bytes: Buffer) => Promise<Buffer> = makeThumbnail): Promise<Thumb | null> {
  const hit = thumbById.get(id);
  if (hit) return Promise.resolve(hit);
  const running = thumbInflight.get(id);
  if (running) return running;
  const own: { job?: Promise<Thumb | null> } = {};
  own.job = (async () => {
    const row = await load(id);
    if (!row) return null;
    const thumb = { sha256: row.sha256, buf: await withSharpSlot(() => make(row.bytes)) };
    // Csak a még regisztrált (közben nem érvénytelenített) generálás írhat a gyorsítótárba.
    if (thumbInflight.get(id) === own.job) {
      thumbById.set(id, thumb);
      if (thumbById.size > THUMB_CACHE_MAX) thumbById.delete(thumbById.keys().next().value!);
    }
    return thumb;
  })().finally(() => { if (thumbInflight.get(id) === own.job) thumbInflight.delete(id); });
  thumbInflight.set(id, own.job);
  return own.job;
}

export const designAssetsRouter = Router();
designAssetsRouter.get("/:id/thumb", async (req, res) => {
  const id = req.params.id;
  if (!ID.test(id)) return res.status(400).json({ message: "Érvénytelen képazonosító." });
  try {
    const headers = (sha256: string) => ({ "Cache-Control": "public, max-age=604800", ETag: `"${sha256}-t${THUMB_WIDTH}"`, "X-Content-Type-Options": "nosniff" });
    // Spec 2026-10-19-eroforras-s2a: a böngésző érvényes példányára 304 a bájtok olvasása (és a sharp) nélkül — memóriatévesztésnél
    // (pl. újraindulás után) is: előbb csak a lenyomat.
    const inm = req.headers["if-none-match"];
    if (inm && !thumbById.has(id)) {
      const [meta] = await db.select({ sha256: designAssets.sha256 }).from(designAssets).where(eq(designAssets.id, id));
      if (meta && inm === headers(meta.sha256).ETag) return res.set(headers(meta.sha256)).status(304).end();
    }
    const thumb = await thumbnailFor(id);
    if (!thumb) { res.set("Cache-Control", "no-store"); return res.status(404).json({ message: "Nincs ilyen kép." }); }
    res.set(headers(thumb.sha256));
    if (inm === headers(thumb.sha256).ETag) return res.status(304).end();
    return res.type("image/webp").send(thumb.buf);
  } catch (error) {
    logger.error("[design-assets] A bélyegkép nem készíthető:", error);
    // Review #381: a hibaválasz nem kerülhet egy hétre gyorsítótárba a kép ETag-jével.
    res.removeHeader("ETag");
    res.set("Cache-Control", "no-store");
    return res.status(500).json({ message: "A bélyegkép most nem érhető el." });
  }
});
designAssetsRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!ID.test(id)) return res.status(400).json({ message: "Érvénytelen képazonosító." });
  try {
    // Spec 2026-10-19-eroforras-s2a: előbb csak a meta; egyező ETag-nél 304 a képbájtok beolvasása nélkül.
    const [meta] = await db.select({ mime: designAssets.mime, sha256: designAssets.sha256 }).from(designAssets).where(eq(designAssets.id, id));
    if (!meta) return res.status(404).json({ message: "Nincs ilyen kép." });
    const etag = `"${meta.sha256}"`;
    res.set({ "Cache-Control": "public, max-age=86400", ETag: etag, "X-Content-Type-Options": "nosniff" });
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    // Review #325: a fejlécek a bájtokkal EGYÜTT olvasott lenyomatból jönnek (a közben futó háttérszinkron ne adjon régi ETaget).
    const [row] = await db.select({ mime: designAssets.mime, sha256: designAssets.sha256, bytes: designAssets.bytes }).from(designAssets).where(eq(designAssets.id, id));
    if (!row) return res.status(404).json({ message: "Nincs ilyen kép." });
    res.set("ETag", `"${row.sha256}"`);
    return res.type(row.mime).send(row.bytes);
  } catch (error) {
    logger.error("[design-assets] A kép nem olvasható:", error);
    return res.status(500).json({ message: "A kép most nem érhető el." });
  }
});

/** A futásidejű bélyegkép forrása (a route-ok után: a 304-ág bájtolvasás nélkül fut, spec 2026-10-19-eroforras-s2a). */
async function loadAssetBytes(id: string) {
  const [row] = await db.select({ sha256: designAssets.sha256, bytes: designAssets.bytes }).from(designAssets).where(eq(designAssets.id, id));
  return row ?? null;
}
