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
