/**
 * Spec 2026-11-09-felolvasas-tartalek: a „Meghallgatás” szerveroldali hangtartaléka — tiszta segédfüggvények (kliens, szerver, teszt közös).
 * Ha a böngésző beszédmotorja hibát ad, el sem indul, vagy nincs a nyelvhez hangja, azonos eredetű `GET /api/tts/audio` MP3 szól
 * (a Vercel CSP `default-src 'self'` miatt `data:` / `blob:` hang nem játszható le).
 */

/**
 * A szolgáltatás (google-tts-api) csak az alapnyelvet fogadja el — mérve 2026-11-09: `en-GB` → „lang might not exist”, `en` / `hu` → MP3.
 * Ezért a régiós kódot (en-GB, de-AT) az alapnyelvre képezzük.
 */
export const TTS_LANGS = ["hu", "en", "de", "fr", "es", "it", "pl", "ro", "sk", "cs", "pt", "nl", "sv", "da", "fi", "no"] as const;
export const TTS_AUDIO_MAX_CHARS = 300;
/** Ennyi idő alatt el kell indulnia a böngésző kimondásának, különben a tartalék szól. */
export const SPEECH_START_TIMEOUT_MS = 3000;

/** A lecke nyelvkódja a TTS-szolgáltatás kódjára: az alapnyelv (en-GB → en), ha támogatott; egyébként null. */
export function ttsLang(language: string): string | null {
  const base = language.trim().replace("_", "-").split("-")[0].toLowerCase();
  return TTS_LANGS.find((l) => l === base) ?? null;
}

export function ttsAudioUrl(text: string, language: string): string | null {
  const lang = ttsLang(language);
  const trimmed = text.trim();
  if (!lang || !trimmed || trimmed.length > TTS_AUDIO_MAX_CHARS) return null;
  return `/api/tts/audio?${new URLSearchParams({ text: trimmed, lang }).toString()}`;
}

export function parseTtsAudioQuery(query: Record<string, unknown>): { text: string; lang: string } | { error: string } {
  const text = typeof query.text === "string" ? query.text.trim() : "";
  if (!text) return { error: "A 'text' paraméter kötelező." };
  if (text.length > TTS_AUDIO_MAX_CHARS) return { error: `A szöveg legfeljebb ${TTS_AUDIO_MAX_CHARS} karakter lehet.` };
  const lang = ttsLang(typeof query.lang === "string" ? query.lang : "hu");
  if (!lang) return { error: "Nem támogatott nyelv." };
  return { text, lang };
}

/** Böngésző-gyorsítótár: 1 nap. A szó hangja nem változik. */
export const TTS_AUDIO_CACHE_CONTROL = "public, max-age=86400";
/** A Vercel CDN gyorsítótára: 7 nap — ugyanazt a szót minden tanuló a CDN-ből kapja, nem a szervertől. */
export const TTS_AUDIO_CDN_CACHE_CONTROL = "max-age=604800";

/**
 * Egyetlen bájttartomány a `Range` fejlécből (iOS Safari a hangot tartománykéréssel tölti: `bytes=0-1`).
 * null: nincs (értelmezhető) tartomány → teljes válasz; "invalid": nem teljesíthető → 416.
 */
export function parseAudioRange(header: string | undefined, size: number): { start: number; end: number } | "invalid" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  if (size <= 0) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : "invalid";
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : "invalid";
}

/** A külön hangkorlát útvonala a `/api/tts` előtag alatt — az Express útválasztásával egyezően (kis-/nagybetű, záró perjel). */
export function isTtsAudioSubPath(path: string): boolean {
  return /^\/audio\/?$/i.test(path);
}

/**
 * Kis, méretkorlátos LRU-tár a kész MP3-aknak: a tartománykérés (206) nem kerül a CDN gyorsítótárába, ezért a szerver
 * a teljes hangot megőrzi, és abból szeletel — ugyanazért a szóért nem megy újra a külső szolgáltatáshoz.
 */
export class TtsAudioCache<V extends { length: number }> {
  private readonly items = new Map<string, V>();
  private bytes = 0;
  constructor(private readonly maxBytes = 16 * 1024 * 1024, private readonly maxEntries = 1000) {}

  get(key: string): V | undefined {
    const value = this.items.get(key);
    if (value === undefined) return undefined;
    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    const previous = this.items.get(key);
    if (previous !== undefined) {
      this.bytes -= previous.length;
      this.items.delete(key);
    }
    if (value.length > this.maxBytes) return;
    this.items.set(key, value);
    this.bytes += value.length;
    for (const [oldKey, oldValue] of this.items) {
      if (this.bytes <= this.maxBytes && this.items.size <= this.maxEntries) break;
      this.items.delete(oldKey);
      this.bytes -= oldValue.length;
    }
  }

  get size(): number {
    return this.items.size;
  }
}

/** Nem hiba: a kimondást a lejátszó maga szakította meg (új gombnyomás, fülváltás). */
export function isSoftSpeechError(code: string | undefined): boolean {
  return code === "interrupted" || code === "canceled";
}

/** Van-e a böngészőben a nyelvhez hang. Üres lista: még tölt (Android) → próbálkozhat a böngésző. */
export function hasVoiceFor(voices: ReadonlyArray<{ lang: string }>, language: string): boolean {
  if (!voices.length) return true;
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const target = norm(language);
  const base = target.split("-")[0];
  return voices.some((v) => norm(v.lang) === target || norm(v.lang) === base || norm(v.lang).startsWith(`${base}-`));
}
