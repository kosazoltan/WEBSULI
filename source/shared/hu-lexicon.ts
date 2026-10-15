import { normalizeAnswer } from "./lesson-experience-score";

/**
 * Tételgyár T4′ (tulajdonosi döntés 2026-10-15, D2): magyar nyelvi adatbank a nyílt feladatok rubrikájához.
 *
 * Mért: a bank-blokkolók 37%-a (339/911, 21 nap) rubrika-eredetű; élő példa (job 416ad01d): a tanítás „ásványianyag-” és „termőre” alakját a
 * rubrika („ásványi anyag”, „termőjére”) nem fogadta el. Ellenpélda ugyanott: a „rovar testere” (= testére) alak a „testéről” helyett is
 * átment — a túl tág elfogadás is hiba. Ezért: csak a tanításban TÉNYLEGESEN szereplő alak, közös tővel, irányrag-őrrel; a rokon értelmű
 * kifejezés csak kézzel ellenőrzött, teljes csoporttagság alapján.
 */

/** Konzervatív, kézzel ellenőrzött egyenértékűségek (iskolai szókincs). Bővítés csak mért esetből (Tételgyár T8: lektor-memória). */
export const HU_SYNONYM_GROUPS: ReadonlyArray<readonly string[]> = [
  ["tilos", "nem szabad"],
  ["vízgőz", "pára"],
  ["lehull", "leesik"],
  ["felszáll", "felemelkedik"],
];

/** Normalizált (kisbetűs, ékezet nélküli) szólista — ugyanaz a normalizálás, mint a pontozóé. */
const words = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);

/**
 * Írásmód-változat: a többszavas kifejezés egybeírt alakja — CSAK ha a tanítás szövegében ténylegesen így szerepel, az eredeti (ékezetes)
 * írásmóddal. Élő hiba (job 416ad01d, 2026-10-15 10:08): a tanítás nélküli egybeírás „nemszabad”, „ligetiszolo” alakokat tett a rubrikába.
 * Tagadószót tartalmazó kifejezés nem írható egybe.
 */
export function spellingVariants(term: string, text?: string): string[] {
  const parts = words(term);
  if (parts.length < 2 || !text || parts.some((p) => NEGATION_WORDS.has(p))) return [];
  const joined = parts.join("");
  if (joined.length < 5) return [];
  for (const raw of text.match(/[\p{L}\d]+/gu) ?? []) if (normalizeAnswer(raw) === joined) return [raw.toLocaleLowerCase("hu")];
  return [];
}
const NEGATION_WORDS = new Set(["nem", "ne", "sem", "se"]);

/** Irányragok (normalizált alak): honnan ↔ hová; a két irány egymás helyett nem fogadható el. */
const DIRECTION_SUFFIXES: ReadonlyArray<[readonly string[], readonly string[]]> = [
  [["rol"], ["ra", "re"]],
  [["bol"], ["ba", "be"]],
  [["tol"], ["hoz", "hez"]],
];
function oppositeDirection(a: string, b: string): boolean {
  return DIRECTION_SUFFIXES.some(([from, to]) =>
    (from.some((s) => a.endsWith(s)) && to.some((s) => b.endsWith(s))) || (to.some((s) => a.endsWith(s)) && from.some((s) => b.endsWith(s))));
}
const NEGATIONS = new Set(["nem", "ne", "sem", "se"]);

/**
 * Review #228 (P1): közös előtag helyett VALÓDI toldalékolás — a „tanítás” és a „tanítvány” közös előtagja `tanit`, de a „vány” nem toldalék.
 * Normalizált (ékezet nélküli) magyar inflexiós toldalékok: többes jel, birtokos személyjel, esetragok. A szótő a kifejezésből legfeljebb két
 * toldalék levágásával áll elő (≥ 4 betűs tő), a jelölt alak = tő + legfeljebb két toldalék.
 */
const SUFFIXES = [
  "ok", "ek", "ak", "k", "ot", "et", "at", "t", "a", "e", "ja", "je", "i", "ai", "ei", "jai", "jei", "uk", "juk", "unk", "om", "em", "am", "od", "ed", "ad",
  "nak", "nek", "ban", "ben", "ba", "be", "bol", "rol", "tol", "ra", "re", "hoz", "hez", "nal", "nel", "val", "vel", "on", "en", "n", "ig", "ert", "kent", "ul",
].sort((a, b) => b.length - a.length);
function stripSuffixes(word: string, max = 2): string[] {
  const roots = [word];
  let current = [word];
  for (let k = 0; k < max; k++) {
    const next: string[] = [];
    for (const w of current) for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) next.push(w.slice(0, -s.length));
    roots.push(...next);
    current = next;
  }
  return [...new Set(roots)];
}
function isSuffixChain(rest: string, max = 2): boolean {
  if (rest === "") return true;
  if (max === 0) return false;
  return SUFFIXES.some((s) => rest.startsWith(s) && isSuffixChain(rest.slice(s.length), max - 1));
}

/**
 * A `text` (a fejezet tanítása) azon szóalakjai, amelyek a kifejezés UTOLSÓ szavának toldalékolt alakjai: közös szótő (≥ 4 betű) + legfeljebb
 * két valódi toldalék; irányrag-ellentét és tagadószó kizárva. Többszavas kifejezésnél az előző szavak változatlanok.
 */
export function inflectedForms(term: string, text: string | undefined): string[] {
  if (!text) return [];
  const parts = words(term);
  const last = parts.at(-1);
  if (!last || last.length < 5) return [];
  const head = parts.slice(0, -1).join(" ");
  // Az eredeti (ékezetes) írásmód a tanításból — a lektor a rubrikát olvassa; a pontozó úgyis normalizál.
  const original = new Map<string, string>();
  for (const raw of text.match(/[\p{L}\d]+/gu) ?? []) {
    const n = normalizeAnswer(raw);
    if (n && !original.has(n)) original.set(n, raw.toLocaleLowerCase("hu"));
  }
  const roots = stripSuffixes(last);
  const out = new Set<string>();
  for (const token of new Set(words(text))) {
    if (token === last || NEGATIONS.has(token) || /\d/.test(token)) continue;
    if (!roots.some((root) => token.startsWith(root) && isSuffixChain(token.slice(root.length)))) continue;
    if (oppositeDirection(last, token)) continue;
    const shown = original.get(token) ?? token;
    out.add(head ? `${head} ${shown}` : shown);
  }
  return [...out];
}

/** Rokon értelmű kifejezések — csak teljes csoporttagság alapján (részszóra nem). */
export function synonymsOf(term: string): string[] {
  const t = normalizeAnswer(term);
  const group = HU_SYNONYM_GROUPS.find((g) => g.some((m) => normalizeAnswer(m) === t));
  return group ? group.filter((m) => normalizeAnswer(m) !== t) : [];
}
