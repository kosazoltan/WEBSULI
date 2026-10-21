/**
 * Spec 2026-10-21-ciklus8 (review #361): egységes, kérdésfüggő válaszlehetőség-kulcs. HELYESÍRÁSI kérdésnél a kis- és nagybetű tartalmi
 * különbség („Egri” / „egri”, „Petőfi Sándor Általános Iskola” / kisbetűs változatai) — ott a kulcs betűméret-megtartó; minden más
 * kérdésnél a régi, kisbetűsítő szabály marad („Alma” / „alma” ismétlődés). Az ellenőrző, a banksémák és az előfeldolgozó UGYANEZT
 * használja, hogy egyik lépés se törölje / vonja össze a másik által megengedett helyesírási opciókat.
 *
 * A felismerés szűk, Unicode-betűhatárokkal: a „leírás”, „helyesen jellemzi” NEM helyesírási kontextus.
 */
const SPELLING_CONTEXT = /helyesír|kezdőbetű|nagybetű|kisbetű|írásmód|toldalékos alak|helyes alak|(?<!\p{L})(?:írás|írjuk|írjuk-e|írod|írd)(?!\p{L})/u;

export const isSpellingPrompt = (prompt: string | undefined): boolean =>
  SPELLING_CONTEXT.test((prompt ?? "").normalize("NFC").toLocaleLowerCase("hu"));

/** A hívó saját normalizálása UTÁN: helyesírási kérdésnél nincs kisbetűsítés, különben a régi kisbetűsítés (a szabály sehol nem szigorodik). */
export const foldCaseUnlessSpelling = (option: string, spelling: boolean): string => (spelling ? option : option.toLocaleLowerCase("hu"));
