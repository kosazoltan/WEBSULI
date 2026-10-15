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

/** Írásmód-változatok: többszavas kifejezés egybeírva / kötőjel nélkül; az eredeti alak nem kerül a listába. */
export function spellingVariants(term: string): string[] {
  const parts = words(term);
  if (parts.length < 2) return [];
  const joined = parts.join("");
  const spaced = parts.join(" ");
  const original = normalizeAnswer(term);
  return [...new Set([joined, spaced])].filter((v) => v !== original && v.length >= 5);
}

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
const commonPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

/**
 * A `text` (a fejezet tanítása) azon szóalakjai, amelyek a kifejezés UTOLSÓ szavával közös tövűek: a közös előtag ≥ 5 betű, és mindkét
 * oldalon legfeljebb 4 betű a toldalék; irányrag-ellentét és tagadószó kizárva. Többszavas kifejezésnél az előző szavak változatlanok.
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
  const out = new Set<string>();
  for (const token of new Set(words(text))) {
    if (token === last || NEGATIONS.has(token) || /\d/.test(token)) continue;
    const p = commonPrefix(token, last);
    if (p < 5 || last.length - p > 4 || token.length - p > 4) continue;
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
