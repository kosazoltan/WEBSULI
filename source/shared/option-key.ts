/**
 * Spec 2026-10-21-ciklus8 (review #361): egységes, kérdésfüggő válaszlehetőség-kulcs. HELYESÍRÁSI kérdésnél a kis- és nagybetű tartalmi
 * különbség („Egri” / „egri”, „Petőfi Sándor Általános Iskola” / kisbetűs változatai) — ott a kulcs betűméret-megtartó; minden más
 * kérdésnél a régi, kisbetűsítő szabály marad („Alma” / „alma” ismétlődés). Az ellenőrző, a banksémák és az előfeldolgozó UGYANEZT
 * használja, hogy egyik lépés se törölje / vonja össze a másik által megengedett helyesírási opciókat.
 *
 * A felismerés szűk, Unicode-betűhatárokkal: a „leírás”, „helyesen jellemzi” NEM helyesírási kontextus.
 */
// Review #361: a gyakori kérdésformák is („helyesen leírva”, „írja helyesen”, „helyesen van írva”); a „leírás” továbbra sem.
const SPELLING_CONTEXT = /helyesír|kezdőbetű|nagybetű|kisbetű|írásmód|toldalékos alak|helyes alak|(?<!\p{L})(?:írás|írjuk|írjuk-e|írod|írd|írja|írva|leírva|írt|írandó)(?!\p{L})/u;

export const isSpellingPrompt = (prompt: string | undefined): boolean =>
  SPELLING_CONTEXT.test((prompt ?? "").normalize("NFC").toLocaleLowerCase("hu"));

/**
 * Spec 2026-10-21-ciklus8 (mért: VS Code-anyag, „apiKey” / „ApiKey”): a programkód-azonosító (szó belsejében kis után nagybetű, camelCase)
 * betűmérete is tartalmi — az ilyen opció kulcsa kérdéstől függetlenül betűméret-megtartó. Az „Alma” / „alma” továbbra is ismétlődés.
 */
const CODE_IDENTIFIER = /\p{Ll}\p{Lu}/u;
export const caseMatters = (option: string, spelling: boolean): boolean => spelling || CODE_IDENTIFIER.test(option);

/** Review #361: a katalógus és a játék-kvíz kulcsa — ahol a betűméret számít, betűméret-megtartó, különben a hívó régi `fold`-ja. */
export const optionKeyFor = (spelling: boolean, fold: (s: string) => string) => (option: string): string =>
  caseMatters(option, spelling) ? option.normalize("NFC").replace(/\s+/g, " ").trim() : fold(option);

/** A hívó saját normalizálása UTÁN: ahol a betűméret számít, nincs kisbetűsítés, különben a régi kisbetűsítés (a szabály sehol nem szigorodik). */
export const foldCaseUnlessSpelling = (option: string, spelling: boolean): string => (caseMatters(option, spelling) ? option : option.toLocaleLowerCase("hu"));
