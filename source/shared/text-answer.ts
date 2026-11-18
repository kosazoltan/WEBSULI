/**
 * Spec 2026-11-17-szoveges-valasz-irasjel: a begépelt, PONTOS egyezést váró válasz (kitöltős feladat) közös összehasonlítója.
 * Nem számít: szélső / többszörös szóköz, kis- és nagybetű, mondatvégi írásjel a VÉGÉN (. ! ? …), a teljes választ közrefogó idézőjel,
 * tipográfiai változat (aposztróf, idézőjel, kötőjel, nem törő szóköz), Unicode-alak (NFC). SZÁMÍT: az ékezet („kor” ≠ „kór”) és a válasz
 * belsejében lévő írásjel. Import nélkül, lookbehind nélkül (a régebbi Safari a lookbehindos regexet be sem tölti): kliens és szerver
 * ugyanezt futtatja. A nyílt feladatok kulcsszó-pontozója (`lesson-experience-score.ts`) ettől független.
 */

const SPACES = /[\s    ]+/g;
const APOSTROPHES = /[’‘ʼ´`]/g;
const QUOTES = /[„”“«»]/g;
const DASHES = /[–—−‐‑]/g;
const TRAILING = /[\s.!?…]+$/;
const NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;

const stripTrailing = (s: string): string => s.replace(TRAILING, "");

/** A válasz összevetési alakja; üres, ha a válaszban nincs érdemi karakter (üres vagy csak mondatvégi írásjel). */
export function normalizeTextAnswer(value: string): string {
  let s = value.normalize("NFC").replace(SPACES, " ").trim()
    .replace(APOSTROPHES, "'").replace(QUOTES, "\"").replace(DASHES, "-")
    .toLocaleLowerCase("hu");
  s = stripTrailing(s);
  // A teljes választ közrefogó idézőjel-pár („Budapest”) nem része a válasznak; a belső idézőjel marad.
  if (s.length >= 2 && (s[0] === "\"" || s[0] === "'") && s[s.length - 1] === s[0]) s = stripTrailing(s.slice(1, -1).trim());
  return s.trim();
}

const numberKey = (s: string): string => s.replace(",", ".").replace(/^\+/, "");
const rawKey = (s: string): string => s.normalize("NFC").replace(SPACES, "");

/**
 * A válasz egyezik-e az elfogadott válasszal (több elfogadott alaknál bármelyikkel). Az üres és a csak írásjelből álló válasz nem
 * helyes — kivéve, ha maga a megoldás írásjel („?”): ekkor a nyers, szóköz nélküli alak pontos egyezése dönt. Szám alakú megoldásnál a
 * tizedesvessző és a tizedespont egyenértékű, a vezető „+” nem számít; a kért alak egyébként számít („3,50” ≠ „3,5”).
 */
export function textAnswerMatches(given: string, accepted: string | readonly string[]): boolean {
  const keys = typeof accepted === "string" ? [accepted] : accepted;
  const g = normalizeTextAnswer(given);
  return keys.some((key) => {
    const k = normalizeTextAnswer(key);
    if (!k) return rawKey(key).length > 0 && rawKey(given) === rawKey(key);
    if (!g) return false;
    if (NUMBER.test(k)) return NUMBER.test(g) && numberKey(g) === numberKey(k);
    return g === k;
  });
}
