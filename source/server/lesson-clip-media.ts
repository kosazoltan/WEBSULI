import { createHash } from "node:crypto";
import type { Express, Request, Response } from "express";
import { TtsAudioCache, parseAudioRange } from "../shared/speech-fallback";
import { asyncRoute } from "./lib/async-route";

/**
 * A kisfilmek médiájának kiszolgálása (docs/specs/2026-11-10-fejezet-kisfilmek-v2.md, 6.). Tartalomcímzett: az azonosító a tartalom
 * lenyomata, ezért a válasz korlátlanul gyorsítótárazható (böngésző és a Vercel CDN). Azonos eredet — a lecke CSP-je nem változik.
 */
export const CLIP_MEDIA_ID = /^[a-f0-9]{32}$/;
export const CLIP_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";
export type ClipMedia = { mime: string; bytes: Buffer };
export type ClipMediaKind = "image" | "audio" | "video";

/** A tartalom azonosítója: a sha256 első 32 hexa jegye. */
export const mediaId = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 32);

export type MediaReply = { status: 200 | 206 | 404 | 416; headers: Record<string, string>; body?: Buffer };
/** A válasz tiszta függvénye (a teszt ezt méri): hibás azonosító / hiányzó média 404; tartománykérésre 206 (iOS Safari így tölt hangot, videót). */
export function mediaReply(id: string, media: ClipMedia | null, rangeHeader: string | undefined): MediaReply {
  if (!CLIP_MEDIA_ID.test(id) || !media) return { status: 404, headers: {} };
  const range = parseAudioRange(rangeHeader, media.bytes.length);
  if (range === "invalid") return { status: 416, headers: { "Content-Range": `bytes */${media.bytes.length}` } };
  const body = range ? media.bytes.subarray(range.start, range.end + 1) : media.bytes;
  const headers: Record<string, string> = {
    "Content-Type": media.mime, "Accept-Ranges": "bytes", "Content-Length": String(body.length),
    "Cache-Control": CLIP_MEDIA_CACHE_CONTROL, "CDN-Cache-Control": CLIP_MEDIA_CACHE_CONTROL, "X-Content-Type-Options": "nosniff",
  };
  if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${media.bytes.length}`;
  return { status: range ? 206 : 200, headers, body };
}

/** `GET /api/lesson-clips/media/:id` — a tartományt a szerver a memóriában őrzött teljes médiából szeleteli (48 MB-os tár). */
export function registerLessonClipMedia(app: Express, load: (id: string) => Promise<ClipMedia | null>): void {
  const cache = new TtsAudioCache<Buffer>(48 * 1024 * 1024, 400);
  const mimes = new Map<string, string>();
  app.get("/api/lesson-clips/media/:id", asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id;
    let media: ClipMedia | null = null;
    if (CLIP_MEDIA_ID.test(id)) {
      const bytes = await cache.getOrLoad(id, async () => {
        const found = await load(id);
        if (found) mimes.set(id, found.mime);
        return found?.bytes ?? Buffer.alloc(0);
      });
      const mime = mimes.get(id);
      if (bytes.length && mime) media = { mime, bytes };
    }
    const reply = mediaReply(id, media, req.headers.range);
    if (reply.status === 404) return res.status(404).json({ message: "Nincs ilyen média." });
    res.status(reply.status).set(reply.headers);
    res.end(reply.body);
  }));
}
