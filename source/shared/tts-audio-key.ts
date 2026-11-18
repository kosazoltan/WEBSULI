/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg, S8b (D3, D4): az előre gyártott felolvasó hang kulcsa — tiszta, megosztott (kliens, szerver,
 * gyártószkript, teszt). A kulcs a (hangverzió, nyelv, normalizált szöveg) lenyomata, így a kliens szerverhívás nélkül kiszámolja a
 * hang címét, és a tároló később a lecke módosítása nélkül költöztethető.
 */

/** A gyártott hang verziója: a hang (szolgáltató, hangazonosító, beállítás) cseréje új értéket, így új kulcsokat ad. */
export const TTS_VOICE_VERSION = "gb-1";
/** Csak ezekre a leckenyelvekre készül előre gyártott hang. */
export const TTS_AUDIO_LANGUAGES = ["en-GB"] as const;
/** A kulcs alakja: 32 kisbetűs hexa jegy — a végpont és a tároló minden más bemenetet lekérdezés előtt elutasít. */
export const TTS_AUDIO_ID = /^[a-f0-9]{32}$/;
export const TTS_AUDIO_ROUTE = "/api/tts/lesson-audio";
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z0-9]{2,4})?$/;
const VOICE_VERSION = /^[a-z0-9][a-z0-9.-]{0,15}$/;

/**
 * A kiejtést nem érintő írásmód-különbségek egységesítése, hogy ugyanarra a kimondandó szövegre ne készüljön két fájl:
 * Unicode NFC; láthatatlan jelek (lágy kötőjel, nulla szélességű jelek) törlése; tipográfiai aposztróf / idézőjel → egyenes;
 * minden szóközjellegű jel (nem törő szóköz, tabulátor, sortörés) egyetlen szóközzé; a szélek levágva.
 * SZÁNDÉKOSAN megmarad: a kis- / nagybetű („Polish” ≠ „polish”) és az írásjelek („Really?” ≠ „Really.”) — ezek a kiejtést módosítják.
 */
export function normalizeSpeechText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[­​-‍⁠]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** A nyelvkód egységes alakja (`en_gb` → `en-GB`); értelmezhetetlen kódra null. */
export function normalizeSpeechLanguage(language: string): string | null {
  const [base = "", region, ...rest] = language.trim().replace(/_/g, "-").split("-");
  const code = region === undefined ? base.toLowerCase() : `${base.toLowerCase()}-${region.toUpperCase()}`;
  return rest.length === 0 && LANGUAGE_CODE.test(code) ? code : null;
}

/**
 * `sha256(hangverzió + "\n" + nyelv + "\n" + normalizált szöveg)` első 32 hexa jegye. A három mező egyike sem tartalmazhat sortörést
 * (a verzió és a nyelv alakja kötött, a szövegben a sortörés szóközzé válik), ezért két különböző hármas soha nem ad azonos bemenetet.
 * Üres szövegre és értelmezhetetlen nyelvre / verzióra hibát ad (a hívó ilyenkor a böngésző hangjára esik).
 */
export async function ttsAudioHash(text: string, language: string, voiceVersion: string = TTS_VOICE_VERSION): Promise<string> {
  const normalized = normalizeSpeechText(text);
  const lang = normalizeSpeechLanguage(language);
  if (!normalized) throw new Error("Üres szöveghez nincs hangkulcs.");
  if (!lang) throw new Error("Értelmezhetetlen nyelvkód.");
  if (!VOICE_VERSION.test(voiceVersion)) throw new Error("Értelmezhetetlen hangverzió.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${voiceVersion}\n${lang}\n${normalized}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** A hang azonos eredetű címe. Titok, token, személyes adat nincs benne: csak a lenyomat. */
export function ttsAudioPath(id: string): string {
  if (!TTS_AUDIO_ID.test(id)) throw new Error("Érvénytelen hangkulcs.");
  return `${TTS_AUDIO_ROUTE}/${id}`;
}

/** Van-e a nyelvhez előre gyártott hang (a kliens csak ekkor kéri le). */
export function hasPreparedAudio(language: string): boolean {
  const lang = normalizeSpeechLanguage(language);
  return !!lang && (TTS_AUDIO_LANGUAGES as readonly string[]).includes(lang);
}

/** A hangvégpont útvonala a `/api/tts` előtag alatt (a sebességkorlát kiválasztásához; Express-szerűen kis-/nagybetűtől független). */
export function isTtsLessonAudioSubPath(path: string): boolean {
  return /^\/lesson-audio\/[^/]+\/?$/i.test(path);
}
