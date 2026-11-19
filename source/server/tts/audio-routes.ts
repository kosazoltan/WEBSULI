import type { Express, Request, Response } from "express";
import { TtsAudioCache, parseAudioRange } from "../../shared/speech-fallback";
import { parseTtsAvailabilityQuery, TTS_AUDIO_AVAILABLE_ROUTE, TTS_AUDIO_ID, TTS_AUDIO_ROUTE } from "../../shared/tts-audio-key";
import { asyncRoute } from "../lib/async-route";
import { logger } from "../lib/logger";
import type { TtsAudio, TtsAudioEntry, TtsAudioStore } from "./audio-store";

/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8b: az előre gyártott felolvasó hang kiszolgálása — `GET /api/tts/lesson-audio/:id`,
 * és az elérhetőségi jegyzék — `GET /api/tts/lesson-audio/available?keys=…` (review J1–J2: a kliens nem 404-ből tudja meg a hiányt).
 * Csak olvas (mellékhatás és írás nincs), hitelesítés nem kell (nyilvános tananyagszöveg hangja), a cím csak a lenyomatot tartalmazza.
 * A kulcs a tartalmat azonosítja és a sor soha nem módosul, ezért a találat korlátlanul gyorsítótárazható (böngésző, Vercel CDN).
 */
export const TTS_AUDIO_CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
const NO_STORE = "no-store";
/**
 * Az elérhetőségi jegyzék rövid ideig tárolható (böngésző, CDN): a frissen legyártott hang legfeljebb 1 perc késéssel jelenik meg, a
 * lecke tanulói közben ugyanazt a választ kapják (a kliens a kulcsokat rendezve küldi).
 */
export const TTS_AUDIO_AVAILABILITY_CACHE_CONTROL = "public, max-age=60";

export type TtsAvailabilityReply = { status: 200 | 400; headers: Record<string, string>; body: { available: string[]; sizes: Record<string, number> } | { message: string } };
/** A jegyzék válaszának tiszta függvénye: hibás bemenet 400 `no-store` (a tárolóhoz nem fordul); különben a meglévő kulcsok részhalmaza. */
export async function ttsAvailabilityReply(query: Record<string, unknown>, existing: (keys: string[]) => Promise<TtsAudioEntry[]>): Promise<TtsAvailabilityReply> {
  const parsed = parseTtsAvailabilityQuery(query);
  if ("error" in parsed) return { status: 400, headers: { "Cache-Control": NO_STORE }, body: { message: parsed.error } };
  const asked = new Set(parsed.keys);
  // A válaszba csak a KÉRT kulcsok kerülhetnek (a tároló hibája se szivárogtasson mást), rendezve. A méret (bájt) az előtöltés
  // adatforgalmi plafonjához kell (S8d); érvénytelen méretű sor kimarad.
  const entries = (await existing(parsed.keys)).filter((entry) => asked.has(entry.id) && Number.isSafeInteger(entry.size) && entry.size > 0).sort((a, b) => a.id < b.id ? -1 : 1);
  const body = { available: entries.map((entry) => entry.id), sizes: Object.fromEntries(entries.map((entry) => [entry.id, entry.size])) };
  return { status: 200, headers: { "Cache-Control": TTS_AUDIO_AVAILABILITY_CACHE_CONTROL, "CDN-Cache-Control": TTS_AUDIO_AVAILABILITY_CACHE_CONTROL }, body };
}

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
 * ismételt és a tartománykérés nem megy újra az adatbázishoz; a hiány nem tárolódik (lásd lent). A sebességkorlát: `server/tts/rate-limits.ts` (a hangtár saját kerete).
 */
export function registerLessonTtsAudio(app: Express, store: TtsAudioStore): void {
  const cache = new TtsAudioCache<Buffer>();
  const mimes = new Map<string, string>();
  // A jegyzék útvonala a `/:id` ELŐTT áll (különben az „available” szó kulcsnak számítana, és 400-at kapna).
  // A hangtár útjain a Vercel NEM tesz `no-store`-t a válaszra (a `vercel.json` kivétele a tartós gyorsítótár miatt), ezért itt
  // MINDEN nem sikeres válasz kifejezetten `no-store`: a belső hiba (500) és az ismeretlen alút / metódus (404) is.
  const guarded = (handler: (req: Request, res: Response) => Promise<unknown>) => asyncRoute(async (req: Request, res: Response) => {
    try { await handler(req, res); }
    catch (error) {
      logger.error("[TTS-AUDIO] A hangtár végpontja hibázott:", error);
      if (!res.headersSent) res.status(500).set("Cache-Control", NO_STORE).json({ message: "A hang most nem érhető el." });
    }
  });
  app.get(TTS_AUDIO_AVAILABLE_ROUTE, guarded(async (req, res) => {
    const reply = await ttsAvailabilityReply(req.query as Record<string, unknown>, (keys) => store.existing(keys));
    res.status(reply.status).set(reply.headers).json(reply.body);
  }));
  app.get(`${TTS_AUDIO_ROUTE}/:id`, guarded(async (req, res) => {
    const id = req.params.id;
    let audio: Pick<TtsAudio, "mime" | "bytes"> | null = null;
    if (TTS_AUDIO_ID.test(id)) {
      const cached = cache.get(id);
      const mime = mimes.get(id);
      if (cached && mime) audio = { mime, bytes: cached };
      else {
        // CSAK a találat kerül a memóriába. A hiányt szándékosan nem jegyezzük meg: a ma még le nem gyártott szó hangja a gyártás
        // (S8c) után azonnal, újraindítás nélkül kiszolgálható — a következő kérés újra a tárolóhoz fordul.
        const found = await store.get(id);
        if (found) {
          cache.set(id, found.bytes);
          mimes.set(id, found.mime);
          audio = { mime: found.mime, bytes: found.bytes };
        }
      }
    }
    const ifNoneMatch = req.headers["if-none-match"];
    const reply = ttsAudioReply(id, audio, { range: req.headers.range, ifNoneMatch: Array.isArray(ifNoneMatch) ? ifNoneMatch.join(",") : ifNoneMatch });
    res.status(reply.status).set(reply.headers);
    if (reply.status === 400) return res.json({ message: "Érvénytelen hangkulcs." });
    if (reply.status === 404) return res.json({ message: "Nincs ilyen hang." });
    res.end(reply.body);
  }));
  // Minden más a hangtár előtagja alatt (ismeretlen alút, más metódus): 404, kifejezetten nem tárolható.
  app.use(TTS_AUDIO_ROUTE, (_req: Request, res: Response) => { res.status(404).set("Cache-Control", NO_STORE).json({ message: "Nincs ilyen hang." }); });
}
