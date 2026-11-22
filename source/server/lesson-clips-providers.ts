import { execFile } from "node:child_process";
import { createWriteStream, readdirSync, rmSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { logger } from "./lib/logger";
import { openPublicResponse, type AddressLookup, type RawRequest, type RawResponse } from "./studio/safe-fetch";
import { CLIP_RSS_LIMIT_BYTES, CLIP_VIDEO_MAX_BYTES, ClipAbortError, clipLogDetail, type ClipDeps } from "./lesson-clips";

/** A szolgáltatói `job.error` naplózható része: kizárólag egy rövid, gépi hibakód (`code`); szabad szöveg / URL soha (#529 L1). */
export function providerErrorCode(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? ` (${code})` : "";
}

/**
 * A kisfilm-gyártás valódi szolgáltatói (docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md, D2–D6). A kulcsok csak a
 * kérés fejlécében élnek: naplóba, hibaüzenetbe nem kerülnek.
 */
export const CLIP_TEXT_MODEL = "anthropic/claude-haiku-5.5";
/**
 * A mozgókép-modell (docs/specs/2026-11-22-kisfilm-videomodell.md): a korábbi `bytedance/seedance-1-5-pro`-t az OpenRouter
 * megszüntette (élesben 404, 2026-11-22). Mérve 5 mp-re: 480p 0,177 USD, 720p 0,381 USD; a lejátszó 960 px-es képén a kettő
 * szemre azonos, ezért 480p. Felülírható: LESSON_CLIP_VIDEO_MODEL, LESSON_CLIP_VIDEO_RESOLUTION.
 */
export const CLIP_VIDEO_MODEL_DEFAULT = "bytedance/seedance-2.0-mini";
export const CLIP_VIDEO_RESOLUTIONS = ["480p", "720p"] as const;
export type ClipVideoResolution = (typeof CLIP_VIDEO_RESOLUTIONS)[number];
export const CLIP_VIDEO_RESOLUTION_DEFAULT: ClipVideoResolution = "480p";
const VIDEO_MODEL_NAME = /^[a-z0-9._-]+\/[a-z0-9._-]+$/;
/** A `lesson_clips.model` oszlop varchar(80) — hosszabb név az upsertnél hibát adna, és a kör minden 3 percben újra költene. */
const VIDEO_MODEL_MAX = 80;
const warnedVideoSetting = new Set<string>();
function warnVideoSettingOnce(name: string): void {
  if (warnedVideoSetting.has(name)) return;
  warnedVideoSetting.add(name);
  logger.warn(`[lesson-clips] érvénytelen ${name} — az alapértéket használom`);
}
/** A mozgókép-modell a környezetből (`szolgáltató/név`), különben az alapérték. */
export function clipVideoModel(env: Record<string, string | undefined> = process.env): string {
  const raw = env.LESSON_CLIP_VIDEO_MODEL?.trim();
  if (!raw) return CLIP_VIDEO_MODEL_DEFAULT;
  if (raw.length <= VIDEO_MODEL_MAX && VIDEO_MODEL_NAME.test(raw)) return raw;
  warnVideoSettingOnce("LESSON_CLIP_VIDEO_MODEL");
  return CLIP_VIDEO_MODEL_DEFAULT;
}
/** A mozgókép felbontása a környezetből (`480p` | `720p`), különben az alapérték. */
export function clipVideoResolution(env: Record<string, string | undefined> = process.env): ClipVideoResolution {
  const raw = env.LESSON_CLIP_VIDEO_RESOLUTION?.trim();
  if (!raw) return CLIP_VIDEO_RESOLUTION_DEFAULT;
  if ((CLIP_VIDEO_RESOLUTIONS as readonly string[]).includes(raw)) return raw as ClipVideoResolution;
  warnVideoSettingOnce("LESSON_CLIP_VIDEO_RESOLUTION");
  return CLIP_VIDEO_RESOLUTION_DEFAULT;
}
export const CLIP_IMAGE_MODEL_OPENAI = "gpt-image-2.5-flare";
export const CLIP_IMAGE_MODEL_OPENROUTER = "bytedance-seed/seedream-5-0-pro";
const OPENROUTER = "https://openrouter.ai/api/v1";
const OPENROUTER_ORIGIN = new URL(OPENROUTER).origin;
/**
 * A szolgáltatói címek szállítása (Copilot-review #418, SSRF; I/O-osztály leltár): a védett út a már élesben futó
 * `server/studio/safe-fetch.ts` közös magja (`openPublicResponse`) — saját HTTP-adapter nincs. Tesztben a feloldás és a nyers kérés
 * csonkolható (`AddressLookup`, `RawRequest`); élesben a `safe-fetch` alapértelmezései (`dns.lookup`, rögzített címre menő `https`).
 */
export type ProviderTransport = { lookup?: AddressLookup; request?: RawRequest };
/** A szolgáltatói választörzsek bájtkorlátja (I/O-osztály leltár): JSON-szöveg, kép (base64 JSON), hang. */
export const CLIP_RESPONSE_LIMITS = { text: 1024 * 1024, image: 24 * 1024 * 1024, audio: 8 * 1024 * 1024 } as const;
/** A lekérdezés JSON-jának bájtkorlátja (4. vak kör L1). */
const POLL_LIMIT = 256 * 1024;
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);
/**
 * A Node-válasz webes folyamként. 4. vak kör L1: Node 24-en mérve a `Readable.toWeb` alapértelmezése visszanyom (lassú fogyasztónál
 * kb. 32 KiB-ot tölt elő); a teszt ezt a korlátot rögzíti, hogy egy Node-frissítés se tehesse korlátlanná.
 */
export const webBody = (res: Readable): ReadableStream<Uint8Array> => Readable.toWeb(res) as ReadableStream<Uint8Array>;
/** A válasz szövege legfeljebb `max` bájtig; fölötte a törzs lezárul és hiba (I/O-osztály leltár: minden szolgáltatói törzs). */
export async function readLimitedText(res: Response, max: number): Promise<string> {
  return (await readLimitedBytes(res, max)).toString("utf8");
}
/** A válasz bájtjai legfeljebb `max` bájtig; fölötte a törzs lezárul és hiba. */
export async function readLimitedBytes(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => undefined); throw new Error(`a szolgáltatói válasz nagyobb ${max} bájtnál`); }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
/** A nyers (Node) válasz webes `Response`-ként; a határidő / leállítás jelére a kapcsolat lezárul, a törzs olvasása hibával áll le. */
function rawToResponse(raw: RawResponse, signal: AbortSignal): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  if (NULL_BODY_STATUS.has(raw.status)) { raw.destroy(); return new Response(null, { status: raw.status, headers }); }
  const stream = raw.body instanceof Readable ? raw.body : Readable.from(raw.body, { objectMode: false });
  const onAbort = () => { raw.destroy(); stream.destroy(signal.reason instanceof Error ? signal.reason : new Error("megszakítva")); };
  if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
  stream.once("close", () => signal.removeEventListener("abort", onAbort));
  return new Response(webBody(stream), { status: raw.status, headers });
}

/**
 * Szolgáltatói kérés a védett úton (2. vak kör L7; Copilot-review #418; 4. vak kör L2): minden lépés (átirányítás is) `checkFetchUrl`,
 * a feloldott címek mind nyilvánosak, a kapcsolat az ellenőrzött címre rögzítve; a DNS, a kérés és a törzs olvasása a `signal`-lal
 * (időkorlát + leállítás) megszakad. A kulcs (Authorization) csak a szolgáltató saját originjére; `sameOrigin` mellett (hitelesített
 * lekérdezés) a lánc nem hagyhatja el a szolgáltatót.
 */
export async function safeProviderFetch(url: URL, init: { headers: Record<string, string>; signal?: AbortSignal }, opts: { sameOrigin: boolean; maxHops?: number; transport?: ProviderTransport }): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(60_000);
  const withoutKey = Object.fromEntries(Object.entries(init.headers).filter(([name]) => name.toLowerCase() !== "authorization"));
  const { response } = await openPublicResponse(url.href, {
    timeoutMs: 60_000, maxRedirects: opts.maxHops ?? 3, lookup: opts.transport?.lookup, request: opts.transport?.request,
    allowUrl: opts.sameOrigin ? (next) => next.origin === OPENROUTER_ORIGIN : undefined,
    headersFor: (next) => (next.origin === OPENROUTER_ORIGIN ? init.headers : withoutKey),
  }, signal);
  return rawToResponse(response, signal);
}
function providerUrl(raw: string): URL | null {
  try { const url = new URL(raw, OPENROUTER); return url.protocol === "https:" ? url : null; } catch { return null; }
}
/** A tulajdonos által jóváhagyott hangminőség. A 22 kHz / 32 kbit/s-os változatot a szemle elutasította (elmosódott kiejtés). */
export const CLIP_AUDIO_FORMAT = "mp3_44100_128";
export const CLIP_HEAR_MODEL = "scribe_v1";
export const CLIP_HEAR_MODEL_OPENAI = "gpt-4o-transcribe";
const VIDEO_POLL_MS = 6000, VIDEO_TIMEOUT_MS = 6 * 60_000;

export type ClipKeys = { openRouter: string; openAi?: string; elevenLabs?: string; ffmpeg?: string; videoModel?: string; videoResolution?: ClipVideoResolution };
export function clipKeys(env: Record<string, string | undefined> = process.env): ClipKeys | null {
  const openRouter = env.OPENROUTER_API_KEY?.trim();
  if (!openRouter) return null;
  return {
    openRouter,
    openAi: env.OPENAI_API_KEY?.trim() || env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || undefined,
    elevenLabs: env.ELEVENLABS_API_KEY?.trim() || undefined,
    ffmpeg: env.FFMPEG_PATH?.trim() || undefined,
    videoModel: clipVideoModel(env),
    videoResolution: clipVideoResolution(env),
  };
}

const QA_SYSTEM = `You check the first frame of a short animated lesson clip for school children. Answer with JSON only:
{"text": boolean, "unsafe": boolean, "matches": boolean, "note": "<max 15 words>"}
- "text": true if ANY letters, digits, numerals, writing, pseudo-writing, signs, labels or national flags are visible anywhere.
- "unsafe": true if anything is scary, violent, gory, sexual, shows a weapon, or is otherwise unsuitable for school children.
- "matches": true if the image clearly shows the planned scene.`;

const MP3_KBPS = { 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], other: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] } as const;
const MP3_HZ: Record<number, readonly number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
/**
 * Az MP3 (Layer III) hossza ezredmásodpercben a KERETEK megszámolásával. Az első keret bitrátájából becsülni nem megbízható (mérve
 * 2026-11-10: a 32 kbit/s-os hang első kerete 56 kbit/s-ot jelzett, a számolt hossz a valódi 58%-a lett). 0: nem megállapítható.
 */
export function mp3DurationMs(bytes: Buffer): number {
  let i = 0;
  if (bytes.length > 10 && bytes.toString("latin1", 0, 3) === "ID3") i = 10 + ((bytes[6] & 0x7f) << 21 | (bytes[7] & 0x7f) << 14 | (bytes[8] & 0x7f) << 7 | (bytes[9] & 0x7f));
  let samples = 0, rate = 0, misses = 0;
  while (i + 4 <= bytes.length) {
    const version = (bytes[i + 1] >> 3) & 3, layer = (bytes[i + 1] >> 1) & 3, kbpsIndex = bytes[i + 2] >> 4, hzIndex = (bytes[i + 2] >> 2) & 3;
    const valid = bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0 && version !== 1 && layer === 1 && kbpsIndex > 0 && kbpsIndex < 15 && hzIndex < 3;
    if (!valid) { if (++misses > 8192) break; i++; continue; }
    const kbps = (version === 3 ? MP3_KBPS[3] : MP3_KBPS.other)[kbpsIndex], hz = MP3_HZ[version][hzIndex], padding = (bytes[i + 2] >> 1) & 1;
    const frameSamples = version === 3 ? 1152 : 576;
    const length = Math.floor(((frameSamples / 8) * kbps * 1000) / hz) + padding;
    if (length < 24) { i++; continue; }
    samples += frameSamples; rate = hz; i += length;
  }
  return rate ? Math.round((samples / rate) * 1000) : 0;
}

/**
 * Egyszerre legfeljebb ennyi ElevenLabs-kérés fut (mérve 2026-11-10: az előfizetés 3 egyidejű kérést enged, a 4. HTTP 429-et kap —
 * a gyártósor jelenetenként és fejezetenként párhuzamos, ezért a hangkérések közös sorba állnak).
 */
export const ELEVENLABS_PARALLEL = 2;
/** Közös sorba állító: legfeljebb `limit` feladat fut egyszerre, a többi vár. */
export function limiter(limit: number): <T>(work: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async (work) => {
    // A felszabaduló hely közvetlenül a várakozóé (a számláló nem csökken közben): a köztes érkező nem előzhet, és nem futhat
    // egyszerre `limit`-nél több feladat (vak kör L6).
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else running++;
    try { return await work(); } finally { const next = waiting.shift(); if (next) next(); else running--; }
  };
}
const elevenLabsQueue = limiter(ELEVENLABS_PARALLEL);
/** Torlódásnál (HTTP 429) rövid várakozás után újrapróbál, legfeljebb háromszor. */
async function fetchPatiently(send: () => Promise<Response>, waitMs = 2500): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await send();
    if (res.status !== 429 || attempt >= 3) return res;
    await res.body?.cancel().catch(() => undefined);
    // A várakozás a leállítás jelére azonnal megszakad (I/O-osztály leltár).
    await pause(waitMs * attempt);
  }
}

/** A kisfilm-munkamappák saját előtagja: induláskor csak ezek söpörhetők (vak kör L5). */
export const CLIP_TMP_PREFIX = "websuli-clip-";
/** A nyers (szolgáltatói) klip legfeljebb ekkora lehet (mérve 4–17 MB) — fölötte a letöltés megszakad, a jelenet állóképes (vak kör L4). */
export const CLIP_RAW_MAX_BYTES = 40 * 1024 * 1024;
/** A folyamatazonosító nélküli (régi nevű) munkamappa ennél régebben biztosan nem futó munkáé. */
const STALE_DIR_MS = 60 * 60_000;
/** Ennél frissebb mappához nem nyúl a söprés (a létrehozás és a nyilvántartásba vétel közti rés). */
const YOUNG_DIR_MS = 60_000;
/** A futó letöltések / átkódolások saját munkamappái — a söprés ezeket kíméli (2. vak kör L3). */
const activeDirs = new Set<string>();
const processAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } };
/** Az átkódoló indítása (élesben `execFile`; tesztben csonkolható). */
export type ExecLike = (file: string, args: string[], options: { timeout: number; killSignal: NodeJS.Signals }, callback: (error: Error | null) => void) => { kill(signal?: NodeJS.Signals): boolean };
const realExec: ExecLike = (file, args, options, callback) => execFile(file, args, options, (error) => callback(error));
/** A leállítás jele: minden szolgáltatói kérés és várakozás ezt is figyeli (2. vak kör L2). */
const shutdown = new AbortController();
/** Időkorlát + leállítás együtt. */
const signal = (ms: number) => AbortSignal.any([AbortSignal.timeout(ms), shutdown.signal]);
/** Várakozás, amely leállításkor azonnal `ClipAbortError`-ral megszakad. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (shutdown.signal.aborted) { reject(new ClipAbortError("a szerver leáll")); return; }
    const onAbort = () => { clearTimeout(timer); reject(new ClipAbortError("a szerver leáll")); };
    const timer = setTimeout(() => { shutdown.signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    shutdown.signal.addEventListener("abort", onAbort, { once: true });
  });
}
/** A futó átkódolások leállítója (a szerver leállításakor; vak kör L5). */
const activeTranscodes = new Set<() => void>();
/** Leállításkor: minden futó átkódolást SIGKILL-lel leállít; a jelenetük `ClipAbortError`-ral (nem állóképesként) zárul. */
export function abortClipTranscodes(): number {
  shuttingDown = true;
  shutdown.abort();
  const n = activeTranscodes.size;
  for (const abort of [...activeTranscodes]) abort();
  return n;
}
/**
 * Gyártó módban minden kör előtt (2. vak kör L3): a félbemaradt munkamappák törlése. A mappanév a gyártó folyamat azonosítóját viszi
 * (`websuli-clip-<pid>-…`): a saját folyamat nem futó munkájának mappája, és a már nem élő folyamat mappája törlődik; az élő idegen
 * folyamaté és a futó saját munkáé marad. A régi (azonosító nélküli) nevű mappa csak egy óra után törlődik.
 */
export function sweepStaleClipDirs(root = tmpdir(), now = Date.now()): number {
  let removed = 0;
  let names: string[];
  try { names = readdirSync(root); } catch { return 0; } // nincs ideiglenes könyvtár: nincs mit söpörni
  for (const name of names) {
    if (!name.startsWith(CLIP_TMP_PREFIX)) continue;
    const dir = path.join(root, name);
    try {
      const info = statSync(dir);
      const age = now - info.mtimeMs;
      if (!info.isDirectory() || age < YOUNG_DIR_MS || activeDirs.has(dir)) continue;
      const owner = /^(\d+)-/.exec(name.slice(CLIP_TMP_PREFIX.length));
      const pid = owner ? Number(owner[1]) : null;
      const stale = pid === null ? age >= STALE_DIR_MS : pid === process.pid || !processAlive(pid);
      if (!stale) continue;
      rmSync(dir, { recursive: true, force: true });
      removed++;
    } catch (error) {
      logger.warn(`[lesson-clips] a régi munkamappa nem törölhető (${name}): ${clipLogDetail(error).slice(0, 120)}`);
    }
  }
  return removed;
}
/** A letöltés bájtszámlálója: a korlát fölött hibával megszakítja az adatfolyamot. */
function byteLimit(max: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      done(seen > max ? new Error(`a nyers mozgókép nagyobb ${max} bájtnál`) : null, chunk);
    },
  });
}
let warnedNoFfmpeg = false;
/**
 * Egyszerre EGY átkódolás fut, egy szálon. Élesben mérve (2026-11-10): nyolc párhuzamos átkódolás (egyenként 171 MB) a 512 MB-os
 * példányt 3–4 percenként újraindította; egy szálon, előretekintés nélkül egy átkódolás 75 MB (alapbeállítással 171 MB).
 */
const ffmpegQueue = limiter(1);
/**
 * Globális `-filter_threads 1`: megadás nélkül az ffmpeg a szűrőlánchoz (scale) annyi szálat indít, ahány CPU-t lát (vak kör L2).
 * `-protocol_whitelist file`: a demuxer csak a helyi bemeneti fájlt nyithatja (vak kör L8). `-t 15`: a kimenet legfeljebb 15 mp
 * (a kért klip legfeljebb 12 mp; vak kör L4).
 */
export const FFMPEG_ARGS = (input: string, output: string): string[] => ["-y", "-v", "error", "-filter_threads", "1", "-threads", "1", "-protocol_whitelist", "file", "-i", input, "-t", "15", "-an", "-vf", "scale=960:-2", "-c:v", "libx264", "-threads", "1",
  "-preset", "veryfast", "-x264-params", "rc-lookahead=0:ref=1:bframes=0:sync-lookahead=0", "-b:v", "700k", "-maxrate", "900k", "-bufsize", "1400k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output];
let shuttingDown = false;
/**
 * A nyers mozgókép letöltése LEMEZRE (nem a memóriába, kemény bájtkorláttal), majd átkódolás 960 px széles, kb. 700 kbit/s-os, hang
 * nélküli H.264-re. `ffmpeg` hiányában, hibánál, memóriahatár fölött vagy túlméretes kimenetnél null. Leállításkor `ClipAbortError`.
 */
export async function downloadAndShrink(download: () => Promise<Response>, ffmpeg = "ffmpeg", timeoutMs = 90_000, opt: { exec?: ExecLike; rss?: () => number; rawMaxBytes?: number } = {}): Promise<Buffer | null> {
  const exec = opt.exec ?? realExec, rss = opt.rss ?? (() => process.memoryUsage().rss), rawMax = opt.rawMaxBytes ?? CLIP_RAW_MAX_BYTES;
  const dir = await mkdtemp(path.join(tmpdir(), `${CLIP_TMP_PREFIX}${process.pid}-`));
  activeDirs.add(dir);
  let stage: "letöltés" | "átkódolás" = "letöltés";
  try {
    const input = path.join(dir, "in.mp4"), output = path.join(dir, "out.mp4");
    const res = await download();
    const declared = Number(res.headers.get("content-length") ?? "");
    if (!res.ok || !res.body || declared > rawMax) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(res.ok && res.body ? `a nyers mozgókép nagyobb ${rawMax} bájtnál (${declared})` : `HTTP ${res.status}`);
    }
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), byteLimit(rawMax), createWriteStream(input), { signal: shutdown.signal });
    stage = "átkódolás";
    // A sor a beolvasást is fogja: a következő átkódolás csak a kimenet beolvasása után indul (vak kör L4).
    return await ffmpegQueue(async () => {
      if (shuttingDown) throw new ClipAbortError("a szerver leáll");
      // Újramérés a sorból kivételkor: a fejezet indulása óta nőhetett a memória (vak kör L3).
      const used = rss();
      if (used > CLIP_RSS_LIMIT_BYTES) throw new Error(`memóriaőr: a folyamat memóriája ${Math.round(used / 1048576)} MB, az átkódolás kimarad`);
      let aborted = false;
      await new Promise<void>((resolve, reject) => {
        // SIGKILL: a SIGTERM-et figyelmen kívül hagyó ffmpeg se tarthassa fel örökre az egyetlen átkódolási sort (review L1).
        let abort = () => undefined as void;
        const child = exec(ffmpeg, FFMPEG_ARGS(input, output), { timeout: timeoutMs, killSignal: "SIGKILL" }, (error) => {
          activeTranscodes.delete(abort);
          if (aborted) reject(new ClipAbortError("a szerver leáll"));
          else if (error) reject(error);
          else resolve();
        });
        abort = () => { aborted = true; child.kill("SIGKILL"); };
        activeTranscodes.add(abort);
      });
      const { size } = await stat(output);
      if (size <= 0 || size > CLIP_VIDEO_MAX_BYTES) throw new Error(`az átkódolt klip mérete ${size} bájt (határ: ${CLIP_VIDEO_MAX_BYTES})`);
      return await readFile(output);
    });
  } catch (error) {
    if (error instanceof ClipAbortError) throw error;
    if (shutdown.signal.aborted) throw new ClipAbortError("a szerver leáll");
    const missing = stage === "átkódolás" && (error as NodeJS.ErrnoException)?.code === "ENOENT";
    const detail = clipLogDetail(error).slice(0, 160);
    if (!missing || !warnedNoFfmpeg) logger.warn(`[lesson-clips] ${missing ? "nincs ffmpeg a szerveren (FFMPEG_PATH / PATH) — a kisfilmek mozgókép nélkül készülnek" : `a mozgókép ${stage === "letöltés" ? "letöltése" : "átkódolása"} nem sikerült: ${detail}`}`);
    if (missing) warnedNoFfmpeg = true;
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    activeDirs.delete(dir);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { const v = JSON.parse(text.slice(start, end + 1)); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

export function clipProviders(keys: ClipKeys, transport: ProviderTransport = {}): ClipDeps {
  // #529 vak kör 1 L1 (hibaosztály): a hibába — és így a naplóba — csak a saját lépésnév és a HTTP-státusz kerül; a nyers szolgáltatói
  // törzs (benne aláírt cím, hozzáférési adat, visszhangzott kérés) soha.
  const fail = (what: string, status: number) => new Error(`${what}: HTTP ${status}`);
  /** A szolgáltatói törzs szövege bájtkorláttal (I/O-osztály leltár); hibás státusznál hiba (a törzs nélkül). */
  const bodyText = async (what: string, res: Response, max: number = CLIP_RESPONSE_LIMITS.text): Promise<string> => {
    if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw fail(what, res.status); }
    return readLimitedText(res, max);
  };
  const orHeaders = { Authorization: `Bearer ${keys.openRouter}`, "Content-Type": "application/json", "HTTP-Referer": "https://websuli.vip", "X-Title": "WebSuli lesson clips" };
  const dataUrl = (image: { bytes: Buffer; mime: string }) => `data:${image.mime};base64,${image.bytes.toString("base64")}`;
  const orChat = async (system: string, content: unknown, maxTokens: number): Promise<string> => {
    const res = await fetch(`${OPENROUTER}/chat/completions`, { method: "POST", headers: orHeaders, signal: signal(90_000), body: JSON.stringify({ model: CLIP_TEXT_MODEL, max_tokens: maxTokens, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content }] }) });
    const text = await bodyText("forgatókönyv", res);
    const choice = (JSON.parse(text) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> }).choices?.[0];
    if (choice?.finish_reason === "length") logger.warn("[lesson-clips] a modellválasz csonkolódott (finish_reason=length)");
    return choice?.message?.content ?? "";
  };
  const deps: ClipDeps = {
    // Spec 9e: a 2500-as keret a 9. osztályos forgatókönyvet kétszer csonkolta (finish_reason=length) — a kisfilm emiatt nem készült el.
    chat: (system, user) => orChat(system, user, 5000),
    async image(prompt) {
      if (keys.openAi) {
        const res = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", signal: signal(120_000), headers: { Authorization: `Bearer ${keys.openAi}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: CLIP_IMAGE_MODEL_OPENAI, prompt, size: "1280x720", quality: "medium", output_format: "jpeg", n: 1 }) });
        const text = await bodyText("kép", res, CLIP_RESPONSE_LIMITS.image);
        const b64 = (JSON.parse(text) as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
        if (!b64) throw new Error("kép: üres válasz");
        return { bytes: Buffer.from(b64, "base64"), mime: "image/jpeg" };
      }
      const res = await fetch(`${OPENROUTER}/images`, { method: "POST", headers: orHeaders, signal: signal(120_000), body: JSON.stringify({ model: CLIP_IMAGE_MODEL_OPENROUTER, prompt, aspect_ratio: "16:9", resolution: "1K", n: 1 }) });
      const text = await bodyText("kép", res, CLIP_RESPONSE_LIMITS.image);
      const img = (JSON.parse(text) as { data?: Array<{ b64_json?: string; media_type?: string }> }).data?.[0];
      const mime = img?.media_type ?? "image/png";
      if (!img?.b64_json || !/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error("kép: üres vagy nem képtípusú válasz");
      return { bytes: Buffer.from(img.b64_json, "base64"), mime };
    },
    async check(image, scene) {
      const qa = parseJsonObject(await orChat(QA_SYSTEM, [{ type: "text", text: `Planned scene: ${scene}` }, { type: "image_url", image_url: { url: dataUrl(image) } }], 500));
      return { ok: !!qa && qa.text === false && qa.unsafe === false && qa.matches === true, note: JSON.stringify(qa ?? "nincs válasz").slice(0, 120) };
    },
    still: (image) => sharp(image.bytes).resize(1280, 720, { fit: "cover" }).webp({ quality: 74 }).toBuffer(),
    audioMs: mp3DurationMs,
    async video(image, prompt, seconds) {
      const submit = await fetch(`${OPENROUTER}/videos`, { method: "POST", headers: orHeaders, signal: signal(120_000), body: JSON.stringify({ model: keys.videoModel ?? CLIP_VIDEO_MODEL_DEFAULT, prompt, duration: seconds, resolution: keys.videoResolution ?? CLIP_VIDEO_RESOLUTION_DEFAULT, aspect_ratio: "16:9", generate_audio: false, frame_images: [{ type: "image_url", image_url: { url: dataUrl(image) }, frame_type: "first_frame" }] }) });
      const submitted = await bodyText("mozgókép", submit);
      let job = JSON.parse(submitted) as { status?: string; polling_url?: string; unsigned_urls?: string[]; error?: unknown };
      // A hitelesített lekérdezés csak a szolgáltató saját HTTPS-originjére mehet (vak kör L8).
      const pollingUrl = job.polling_url ? providerUrl(job.polling_url) : null;
      if (!pollingUrl || pollingUrl.origin !== OPENROUTER_ORIGIN) throw new Error("mozgókép: a válaszban nincs (vagy idegen) lekérdezési cím");
      const deadline = Date.now() + VIDEO_TIMEOUT_MS;
      while (!["completed", "failed", "cancelled", "expired"].includes(job.status ?? "")) {
        if (Date.now() > deadline) throw new Error("mozgókép: időtúllépés");
        await pause(VIDEO_POLL_MS);
        const poll = await safeProviderFetch(pollingUrl, { headers: orHeaders, signal: signal(60_000) }, { sameOrigin: true, transport });
        if (poll.ok) job = JSON.parse(await readLimitedText(poll, POLL_LIMIT));
        else await poll.body?.cancel().catch(() => undefined);
      }
      if (job.status !== "completed" || !job.unsigned_urls?.[0]) throw new Error(`mozgókép: ${job.status}${providerErrorCode(job.error)}`);
      // Letöltés csak HTTPS-ről; a kulcs csak a szolgáltató saját originjére megy, idegen (CDN) címre kulcs nélkül (vak kör L8).
      const url = providerUrl(job.unsigned_urls[0]);
      if (!url) throw new Error("mozgókép: a letöltési cím nem HTTPS");
      return downloadAndShrink(() => safeProviderFetch(url, { headers: { Authorization: orHeaders.Authorization }, signal: signal(180_000) }, { sameOrigin: false, transport }), keys.ffmpeg);
    },
  };
  if (keys.elevenLabs) {
    const key = keys.elevenLabs;
    deps.speech = async (text, voice) => {
      const res = await elevenLabsQueue(() => fetchPatiently(() => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=${CLIP_AUDIO_FORMAT}`, { method: "POST", signal: signal(60_000), headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text, model_id: voice.model, language_code: "hu" }) })));
      if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw fail("hang", res.status); }
      return readLimitedBytes(res, CLIP_RESPONSE_LIMITS.audio);
    };
    // Hangkapu tartaléka: az ElevenLabs saját felismerője. Mérve 2026-11-10: a saját hangját a független felismerőnél elnézőbben
    // hallja (egy érthetetlen mondatot hibátlannak írt vissza), ezért csak akkor ez a kapu, ha nincs OpenAI-kulcs.
    deps.hear = async (audio) => {
      const body = () => {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "hang.mp3");
        form.append("model_id", CLIP_HEAR_MODEL);
        form.append("language_code", "hu");
        return form;
      };
      const res = await elevenLabsQueue(() => fetchPatiently(() => fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", signal: signal(60_000), headers: { "xi-api-key": key }, body: body() })));
      const text = await bodyText("hangkapu", res);
      return String((JSON.parse(text) as { text?: unknown }).text ?? "");
    };
  }
  if (keys.openAi) {
    const key = keys.openAi;
    // Hangkapu: FÜGGETLEN beszédfelismerő (a jóváhagyott hangokat hibátlanul, a rosszakat rosszul írja vissza — spec 9e).
    deps.hear = async (audio) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "hang.mp3");
      form.append("model", CLIP_HEAR_MODEL_OPENAI);
      form.append("language", "hu");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", signal: signal(60_000), headers: { Authorization: `Bearer ${key}` }, body: form });
      const text = await bodyText("hangkapu", res);
      return String((JSON.parse(text) as { text?: unknown }).text ?? "");
    };
  }
  // Leállításkor (vagy utána) minden szolgáltatói hiba megszakításként jelez — így a fejezet nem kap hibás sort, és nem kerül be
  // hiányos (pl. tartalék hangos) kisfilmként (2. vak kör L2).
  const guarded = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    if (shutdown.signal.aborted) throw new ClipAbortError("a szerver leáll");
    try { return await fn(...args); } catch (error) { if (shutdown.signal.aborted && !(error instanceof ClipAbortError)) throw new ClipAbortError("a szerver leáll"); throw error; }
  };
  deps.chat = guarded(deps.chat); deps.image = guarded(deps.image); deps.check = guarded(deps.check); deps.still = guarded(deps.still);
  if (deps.video) deps.video = guarded(deps.video);
  if (deps.speech) deps.speech = guarded(deps.speech);
  if (deps.hear) deps.hear = guarded(deps.hear);
  return deps;
}
