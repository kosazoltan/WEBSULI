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
/** Elérhetőségi jegyzék: a lecke EGY kéréssel megtudja, mely kulcsokhoz van hang a tárban (`?keys=` vesszővel elválasztott kulcsok). */
export const TTS_AUDIO_AVAILABLE_ROUTE = `${TTS_AUDIO_ROUTE}/available`;
/** Egy jegyzék-kérés legfeljebb ennyi kulcsot kérdezhet: a szószedet legfeljebb 100 tétel × 2 szöveg (szó + példamondat). */
export const TTS_AUDIO_AVAILABILITY_MAX_KEYS = 200;
/**
 * A hangtár (hangfájl + jegyzék) SAJÁT sebességkorlátja, egy közös IP-ről netező osztályra méretezve. Az előtöltés (S8d) miatt egy
 * osztály a lecke megnyitásakor EGYSZERRE kér: 30 tanuló × legfeljebb 60 előtöltött hang × 2 kérés (iOS Safari
 * a hangot tartománykérésekkel tölti, és a 206-os válasz nem kerül a CDN gyorsítótárába). A keret az ELŐTÖLTÉS PLAFONJÁBÓL
 * (`LESSON_AUDIO_PRELOAD_MAX` = 60 hang) számol: 30 × 60 × 2 + 30 = 3 630 kérés, 20% tartalékkal 4 500 kérés / 15 perc / IP — ha a
 * plafon nő, a keret vele nő. A szerveres tartalék (`/api/tts/audio`) kerete ettől független.
 */
/** Egy lecke megnyitásakor legfeljebb ennyi hang töltődik elő (S8d) — a sebességkeret EBBŐL számol, a kettő nem válhat szét. */
export const LESSON_AUDIO_PRELOAD_MAX = 60;
/**
 * A hangtár kerete a megadott előtöltési plafonhoz: egy 30 fős osztály teljes előtöltése (hangonként 2 kérés a tartománykérések
 * miatt) + 30 jegyzék-kérés, 20% tartalékkal, 500-ra felfelé kerekítve.
 */
export function lessonAudioRateLimitMax(preloadMax: number, classSize = 30, requestsPerAudio = 2): number {
  return Math.ceil((classSize * preloadMax * requestsPerAudio + classSize) * 1.2 / 500) * 500;
}
export const LESSON_AUDIO_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: lessonAudioRateLimitMax(LESSON_AUDIO_PRELOAD_MAX), classSize: 30, textsPerLesson: LESSON_AUDIO_PRELOAD_MAX, requestsPerAudio: 2 } as const;
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
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
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

/**
 * A jegyzék-kérés címe: a kulcsok rendezve és ismétlés nélkül (azonos lecke → azonos cím → a rövid gyorsítótár minden tanulónak talál).
 * Érvénytelen kulcsra, üres listára vagy a plafon fölött null — a kliens ilyenkor jegyzék nélkül, a böngészőhanggal megy.
 */
export function ttsAudioAvailabilityUrl(ids: readonly string[]): string | null {
  const keys = Array.from(new Set(ids)).sort();
  if (keys.length === 0 || keys.length > TTS_AUDIO_AVAILABILITY_MAX_KEYS || keys.some((id) => !TTS_AUDIO_ID.test(id))) return null;
  return `${TTS_AUDIO_AVAILABLE_ROUTE}?keys=${keys.join(",")}`;
}

/** A jegyzék-végpont bemenete: csak a `keys` paraméter, csak a kulcsformátum, darabszám-plafonnal. */
export function parseTtsAvailabilityQuery(query: Record<string, unknown>): { keys: string[] } | { error: string } {
  if (typeof query.keys !== "string" || !query.keys) return { error: "A 'keys' paraméter kötelező." };
  // Hosszkorlát a darabolás ELŐTT: a legnagyobb érvényes bemenet 200 kulcs × 32 jegy + 199 vessző.
  if (query.keys.length > TTS_AUDIO_AVAILABILITY_MAX_KEYS * 33) return { error: "Túl sok kulcs." };
  const keys = Array.from(new Set(query.keys.split(",")));
  if (keys.length > TTS_AUDIO_AVAILABILITY_MAX_KEYS) return { error: "Túl sok kulcs." };
  if (keys.some((id) => !TTS_AUDIO_ID.test(id))) return { error: "Érvénytelen hangkulcs." };
  return { keys };
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
