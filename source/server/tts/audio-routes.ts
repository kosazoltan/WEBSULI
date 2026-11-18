import type { Express, Request, Response } from "express";
import { TtsAudioCache, parseAudioRange } from "../../shared/speech-fallback";
import { TTS_AUDIO_ID, TTS_AUDIO_ROUTE } from "../../shared/tts-audio-key";
import { asyncRoute } from "../lib/async-route";
import type { TtsAudio, TtsAudioStore } from "./audio-store";

/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8b: az előre gyártott felolvasó hang kiszolgálása — `GET /api/tts/lesson-audio/:id`.
 * Csak olvas (mellékhatás és írás nincs), hitelesítés nem kell (nyilvános tananyagszöveg hangja), a cím csak a lenyomatot tartalmazza.
 * A kulcs a tartalmat azonosítja és a sor soha nem módosul, ezért a találat korlátlanul gyorsítótárazható (böngésző, Vercel CDN).
 */
export const TTS_AUDIO_CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
const NO_STORE = "no-store";

export type TtsAudioReply = { status: 200 | 206 | 304 | 400 | 404 | 416; headers: Record<string, string>; body?: Buffer };

/** Az `If-None-Match` egyezése (lista, gyenge jelző és `*` is). */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(",").map((part) => part.trim().replace(/^W\//, "")).some((candidate) => candidate === "*" || candidate === etag);
}

/** A válasz tiszta függvénye (a teszt ezt méri). Sorrend: kulcsalak (400) → hiány (404) → változatlan (304) → tartomány (206 / 416) → 200. */
export function ttsAudioReply(id: string, audio: Pick<TtsAudio, "mime" | "bytes"> | null, request: { range?: string; ifNoneMatch?: string } = {}): TtsAudioReply {
  if (!TTS_AUDIO_ID.test(id)) return { status: 400, headers: { "Cache-Control": NO_STORE } };
  if (!audio) return { status: 404, headers: { "Cache-Control": NO_STORE } };
  const etag = `"${id}"`;
  const shared: Record<string, string> = {
    ETag: etag, "Cache-Control": TTS_AUDIO_CACHE_CONTROL_IMMUTABLE, "CDN-Cache-Control": TTS_AUDIO_CACHE_CONTROL_IMMUTABLE,
  };
  if (etagMatches(request.ifNoneMatch, etag)) return { status: 304, headers: shared };
  const range = parseAudioRange(request.range, audio.bytes.length);
  if (range === "invalid") return { status: 416, headers: { "Content-Range": `bytes */${audio.bytes.length}`, "Cache-Control": NO_STORE } };
  const body = range ? audio.bytes.subarray(range.start, range.end + 1) : audio.bytes;
  const headers: Record<string, string> = {
    ...shared, "Content-Type": audio.mime, "Accept-Ranges": "bytes", "Content-Length": String(body.length), "X-Content-Type-Options": "nosniff",
  };
  if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${audio.bytes.length}`;
  return { status: range ? 206 : 200, headers, body };
}

/**
 * A végpont bekötése. Hibás alakú kulcsra a tárolóhoz nem fordul (400); a találatot a szerver a memóriában őrzi (16 MB-os tár), így az
 * ismételt és a tartománykérés nem megy újra az adatbázishoz. A sebességkorlát az index.ts-ben van (`ttsAudioLimiter`).
 */
export function registerLessonTtsAudio(app: Express, store: TtsAudioStore): void {
  const cache = new TtsAudioCache<Buffer>();
  const mimes = new Map<string, string>();
  app.get(`${TTS_AUDIO_ROUTE}/:id`, asyncRoute(async (req: Request, res: Response) => {
    const id = req.params.id;
    let audio: Pick<TtsAudio, "mime" | "bytes"> | null = null;
    if (TTS_AUDIO_ID.test(id)) {
      const bytes = await cache.getOrLoad(id, async () => {
        const found = await store.get(id);
        if (found) mimes.set(id, found.mime);
        return found?.bytes ?? Buffer.alloc(0);
      });
      const mime = mimes.get(id);
      if (bytes.length && mime) audio = { mime, bytes };
    }
    const ifNoneMatch = req.headers["if-none-match"];
    const reply = ttsAudioReply(id, audio, { range: req.headers.range, ifNoneMatch: Array.isArray(ifNoneMatch) ? ifNoneMatch.join(",") : ifNoneMatch });
    res.status(reply.status).set(reply.headers);
    if (reply.status === 400) return res.json({ message: "Érvénytelen hangkulcs." });
    if (reply.status === 404) return res.json({ message: "Nincs ilyen hang." });
    res.end(reply.body);
  }));
}
