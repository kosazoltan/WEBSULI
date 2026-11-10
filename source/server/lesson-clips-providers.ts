import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { logger } from "./lib/logger";
import type { ClipDeps } from "./lesson-clips";

/**
 * A kisfilm-gyártás valódi szolgáltatói (docs/specs/2026-11-10-fejezet-kisfilmek-v2-p1p2-vegrehajtas.md, D2–D6). A kulcsok csak a
 * kérés fejlécében élnek: naplóba, hibaüzenetbe nem kerülnek.
 */
export const CLIP_TEXT_MODEL = "anthropic/claude-haiku-5.5";
export const CLIP_VIDEO_MODEL = "bytedance/seedance-1-5-pro";
export const CLIP_IMAGE_MODEL_OPENAI = "gpt-image-2.5-flare";
export const CLIP_IMAGE_MODEL_OPENROUTER = "bytedance-seed/seedream-5-0-pro";
const OPENROUTER = "https://openrouter.ai/api/v1";
/** A tulajdonos által jóváhagyott hangminőség. A 22 kHz / 32 kbit/s-os változatot a szemle elutasította (elmosódott kiejtés). */
export const CLIP_AUDIO_FORMAT = "mp3_44100_128";
export const CLIP_HEAR_MODEL = "scribe_v1";
export const CLIP_HEAR_MODEL_OPENAI = "gpt-4o-transcribe";
const VIDEO_POLL_MS = 6000, VIDEO_TIMEOUT_MS = 6 * 60_000;

export type ClipKeys = { openRouter: string; openAi?: string; elevenLabs?: string; ffmpeg?: string };
export function clipKeys(env: Record<string, string | undefined> = process.env): ClipKeys | null {
  const openRouter = env.OPENROUTER_API_KEY?.trim();
  if (!openRouter) return null;
  return {
    openRouter,
    openAi: env.OPENAI_API_KEY?.trim() || env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || undefined,
    elevenLabs: env.ELEVENLABS_API_KEY?.trim() || undefined,
    ffmpeg: env.FFMPEG_PATH?.trim() || undefined,
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
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try { return await work(); } finally { running--; waiting.shift()?.(); }
  };
}
const elevenLabsQueue = limiter(ELEVENLABS_PARALLEL);
/** Torlódásnál (HTTP 429) rövid várakozás után újrapróbál, legfeljebb háromszor. */
async function fetchPatiently(send: () => Promise<Response>, waitMs = 2500): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await send();
    if (res.status !== 429 || attempt >= 3) return res;
    await res.arrayBuffer().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, waitMs * attempt));
  }
}

let warnedNoFfmpeg = false;
/**
 * Egyszerre EGY átkódolás fut, egy szálon. Élesben mérve (2026-11-10): nyolc párhuzamos átkódolás (egyenként 171 MB) a 512 MB-os
 * példányt 3–4 percenként újraindította; egy szálon, előretekintés nélkül egy átkódolás 75 MB (alapbeállítással 171 MB).
 */
const ffmpegQueue = limiter(1);
export const FFMPEG_ARGS = (input: string, output: string): string[] => ["-y", "-v", "error", "-threads", "1", "-i", input, "-an", "-vf", "scale=960:-2", "-c:v", "libx264", "-threads", "1",
  "-preset", "veryfast", "-x264-params", "rc-lookahead=0:ref=1:bframes=0:sync-lookahead=0", "-b:v", "700k", "-maxrate", "900k", "-bufsize", "1400k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output];
/**
 * A nyers mozgókép letöltése LEMEZRE (nem a memóriába), majd átkódolás 960 px széles, kb. 700 kbit/s-os, hang nélküli H.264-re.
 * `ffmpeg` hiányában vagy hibánál null.
 */
export async function downloadAndShrink(download: () => Promise<Response>, ffmpeg = "ffmpeg"): Promise<Buffer | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
  try {
    const input = path.join(dir, "in.mp4"), output = path.join(dir, "out.mp4");
    const res = await download();
    if (!res.ok || !res.body) throw new Error(`mozgókép letöltése: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(input));
    await ffmpegQueue(() => new Promise<void>((resolve, reject) => {
      execFile(ffmpeg, FFMPEG_ARGS(input, output), { timeout: 90_000 }, (error) => (error ? reject(error) : resolve()));
    }));
    return await readFile(output);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException)?.code === "ENOENT";
    if (!missing || !warnedNoFfmpeg) logger.warn(`[lesson-clips] ${missing ? "nincs ffmpeg a szerveren (FFMPEG_PATH / PATH) — a kisfilmek mozgókép nélkül készülnek" : `az átkódolás nem sikerült: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`}`);
    if (missing) warnedNoFfmpeg = true;
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { const v = JSON.parse(text.slice(start, end + 1)); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

export function clipProviders(keys: ClipKeys): ClipDeps {
  const secrets = [keys.openRouter, keys.openAi, keys.elevenLabs].filter((k): k is string => !!k);
  const scrub = (text: string) => secrets.reduce((out, key) => out.split(key).join("[kulcs]"), text).slice(0, 200);
  const fail = (what: string, status: number, body: string) => new Error(`${what}: HTTP ${status} ${scrub(body)}`);
  const orHeaders = { Authorization: `Bearer ${keys.openRouter}`, "Content-Type": "application/json", "HTTP-Referer": "https://websuli.vip", "X-Title": "WebSuli lesson clips" };
  const dataUrl = (image: { bytes: Buffer; mime: string }) => `data:${image.mime};base64,${image.bytes.toString("base64")}`;
  const orChat = async (system: string, content: unknown, maxTokens: number): Promise<string> => {
    const res = await fetch(`${OPENROUTER}/chat/completions`, { method: "POST", headers: orHeaders, signal: AbortSignal.timeout(90_000), body: JSON.stringify({ model: CLIP_TEXT_MODEL, max_tokens: maxTokens, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content }] }) });
    const text = await res.text();
    if (!res.ok) throw fail("forgatókönyv", res.status, text);
    const choice = (JSON.parse(text) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> }).choices?.[0];
    if (choice?.finish_reason === "length") logger.warn("[lesson-clips] a modellválasz csonkolódott (finish_reason=length)");
    return choice?.message?.content ?? "";
  };
  const deps: ClipDeps = {
    // Spec 9e: a 2500-as keret a 9. osztályos forgatókönyvet kétszer csonkolta (finish_reason=length) — a kisfilm emiatt nem készült el.
    chat: (system, user) => orChat(system, user, 5000),
    async image(prompt) {
      if (keys.openAi) {
        const res = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", signal: AbortSignal.timeout(120_000), headers: { Authorization: `Bearer ${keys.openAi}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: CLIP_IMAGE_MODEL_OPENAI, prompt, size: "1280x720", quality: "medium", output_format: "jpeg", n: 1 }) });
        const text = await res.text();
        if (!res.ok) throw fail("kép", res.status, text);
        const b64 = (JSON.parse(text) as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
        if (!b64) throw new Error("kép: üres válasz");
        return { bytes: Buffer.from(b64, "base64"), mime: "image/jpeg" };
      }
      const res = await fetch(`${OPENROUTER}/images`, { method: "POST", headers: orHeaders, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: CLIP_IMAGE_MODEL_OPENROUTER, prompt, aspect_ratio: "16:9", resolution: "1K", n: 1 }) });
      const text = await res.text();
      if (!res.ok) throw fail("kép", res.status, text);
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
      const submit = await fetch(`${OPENROUTER}/videos`, { method: "POST", headers: orHeaders, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: CLIP_VIDEO_MODEL, prompt, duration: seconds, resolution: "720p", aspect_ratio: "16:9", generate_audio: false, frame_images: [{ type: "image_url", image_url: { url: dataUrl(image) }, frame_type: "first_frame" }] }) });
      const submitted = await submit.text();
      if (!submit.ok) throw fail("mozgókép", submit.status, submitted);
      let job = JSON.parse(submitted) as { status?: string; polling_url?: string; unsigned_urls?: string[]; error?: unknown };
      const pollingUrl = job.polling_url;
      if (!pollingUrl) throw new Error("mozgókép: a válaszban nincs lekérdezési cím");
      const deadline = Date.now() + VIDEO_TIMEOUT_MS;
      while (!["completed", "failed", "cancelled", "expired"].includes(job.status ?? "")) {
        if (Date.now() > deadline) throw new Error("mozgókép: időtúllépés");
        await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_MS));
        const poll = await fetch(new URL(pollingUrl, OPENROUTER), { headers: orHeaders, signal: AbortSignal.timeout(60_000) });
        if (poll.ok) job = JSON.parse(await poll.text());
      }
      if (job.status !== "completed" || !job.unsigned_urls?.[0]) throw new Error(`mozgókép: ${job.status} ${scrub(JSON.stringify(job.error ?? ""))}`);
      const url = new URL(job.unsigned_urls[0], OPENROUTER);
      return downloadAndShrink(() => fetch(url, { headers: { Authorization: orHeaders.Authorization }, signal: AbortSignal.timeout(180_000) }), keys.ffmpeg);
    },
  };
  if (keys.elevenLabs) {
    const key = keys.elevenLabs;
    deps.speech = async (text, voice) => {
      const res = await elevenLabsQueue(() => fetchPatiently(() => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=${CLIP_AUDIO_FORMAT}`, { method: "POST", signal: AbortSignal.timeout(60_000), headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text, model_id: voice.model, language_code: "hu" }) })));
      if (!res.ok) throw fail("hang", res.status, await res.text());
      return Buffer.from(await res.arrayBuffer());
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
      const res = await elevenLabsQueue(() => fetchPatiently(() => fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", signal: AbortSignal.timeout(60_000), headers: { "xi-api-key": key }, body: body() })));
      const text = await res.text();
      if (!res.ok) throw fail("hangkapu", res.status, text);
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
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${key}` }, body: form });
      const text = await res.text();
      if (!res.ok) throw fail("hangkapu", res.status, text);
      return String((JSON.parse(text) as { text?: unknown }).text ?? "");
    };
  }
  return deps;
}
