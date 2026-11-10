/**
 * Spec 2026-11-02-valasz-keveres: a feleletválasztós válaszok megjelenítési sorrendje kérdésenként determinisztikusan kevert, hogy a
 * generátor pozíció-torzítása (mért: az Antigoné-kvízben A:54 / B:30 / C:12 / D:2) ne legyen kitalálható. Csak a SORREND változik: a
 * hívó az eredeti indexet rögzíti és küldi, így a mentett válasz, a szerveroldali pontozás és a `feedbackPerOption` változatlan.
 */

/** FNV-1a 32 bit — gyors, stabil seed-hash (nincs kriptográfiai igény). */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32 — determinisztikus [0, 1) sorozat a seedből. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Az eredeti indexek megjelenítési sorrendje (Fisher–Yates a seedből); ugyanaz a seed mindig ugyanaz a permutáció. */
export function optionOrder(seed: string, count: number): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  const random = mulberry32(hash32(seed));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Betűvel („A)”, „A és B”, „„C””, „B válasz”; az ellenőrző legfeljebb 5 opciós, ezért A–E), sorszámmal („a második válasz”) vagy
// „fenti / előző válasz” szóval más opcióra hivatkozó kérdés nem keverhető (review #375).
// Review #375: a betűjel NAGYBETŰ (kis-nagybetű-érzékeny minta), és az „A” csak névelővel („az A válasz”) jelöl opciót — a mondatkezdő
// „A válasz téves” és a közönséges „a válasz” nem hivatkozás.
const LETTER_REFERENCE =
  /(^|[\s(„])[A-E]\)|(^|\s)[A-E] (és|vagy) [A-E](?![\p{L}])|„[A-E]”|(?:^|[^\p{L}])[Aa]z? [A-E] (válasz|opció|lehetőség)|(?:^|[^\p{L}])[B-E] (válasz|opció|lehetőség)/u;
const WORD_REFERENCE = /(?:^|[^\p{L}])(első|második|harmadik|negyedik|ötödik|utolsó) (válasz|opció|lehetőség)|fenti|előző válasz/iu;

export const refersToOtherOptions = (options: readonly string[], feedback: readonly string[] = []): boolean =>
  [...options, ...feedback].some((text) => LETTER_REFERENCE.test(text) || WORD_REFERENCE.test(text));

/** A megjelenítés sorrendje: hivatkozó opcióknál a tárolt sorrend, különben a kevert. */
export function displayOrder(seed: string, options: readonly string[], feedback: readonly string[] = []): number[] {
  return refersToOtherOptions(options, feedback) ? options.map((_, i) => i) : optionOrder(seed, options.length);
}

/** A tananyag- és kvízkérdés seedje: a kérdés és az opciók szövege (újratöltésen és mentett válasznál is ugyanaz). */
export const choiceSeed = (question: string, options: readonly string[]): string => [question, ...options].join("\u0000");

export type ChoiceQuestion = { question: string; options: readonly string[]; correctIndex: number; feedbackPerOption?: readonly string[] };

/**
 * Spec 2026-11-02-valasz-keveres: a kérdésenkénti keverés egy adott leckén determinisztikus mintát adhat (mért: az Antigoné 7
 * ellenőrzőjéből 6-nál „A”, mindig). Ezért egy lecke / kör kérdéseinél a helyes válasz célpozíciói opciószámonként kiegyensúlyozottak
 * (a darabszámok legfeljebb 1-gyel térnek el), a többi opció kevert sorrendben. Kulcs: `choiceSeed(question, options)`.
 *
 * Review #375: a kiosztás a kérdések SEEDELT VÉLETLEN sorrendjében történik, nem a megjelenítésében — így a sorban haladva egy négyes
 * csoport utolsó helyes pozíciója nem következtethető ki az előző háromból. A tárolt sorrendben maradó (hivatkozó) kérdés helyes
 * pozíciója előre beszámít; az azonos szövegű ismételt kérdés ugyanazt az elrendezést kapja, és minden előfordulása beszámít.
 */
export function balancedLayouts(choices: readonly ChoiceQuestion[]): Map<string, number[]> {
  const layouts = new Map<string, number[]>();
  const seed = choices.map((c) => choiceSeed(c.question, c.options)).join("\u0001");
  const random = mulberry32(hash32(seed));
  const usedByCount = new Map<number, number[]>();
  const usage = (n: number) => usedByCount.get(n) ?? usedByCount.set(n, Array.from({ length: n }, () => 0)).get(n)!;
  // Egyedi kérdések, előfordulásszámmal; az érvényes, nem hivatkozó kérdések a mozgathatók.
  const unique = new Map<string, { choice: ChoiceQuestion; weight: number }>();
  for (const choice of choices) {
    const key = choiceSeed(choice.question, choice.options);
    const seen = unique.get(key);
    if (seen) seen.weight++;
    else unique.set(key, { choice, weight: 1 });
  }
  const movable: string[] = [];
  for (const [key, { choice, weight }] of unique) {
    const n = choice.options.length;
    const valid = Number.isInteger(choice.correctIndex) && choice.correctIndex >= 0 && choice.correctIndex < n;
    if (valid && n >= 2 && !refersToOtherOptions(choice.options, choice.feedbackPerOption)) { movable.push(key); continue; }
    const order = displayOrder(key, choice.options, choice.feedbackPerOption);
    layouts.set(key, order);
    if (valid && n >= 2) usage(n)[order.indexOf(choice.correctIndex)] += weight;
  }
  for (const index of optionOrder(seed, movable.length)) {
    const key = movable[index];
    const { choice, weight } = unique.get(key)!;
    const n = choice.options.length;
    const used = usage(n);
    const least = Math.min(...used);
    const candidates = used.flatMap((count, p) => (count === least ? [p] : []));
    const target = candidates[Math.floor(random() * candidates.length)];
    const order = optionOrder(key, n).filter((i) => i !== choice.correctIndex);
    order.splice(target, 0, choice.correctIndex);
    layouts.set(key, order);
    used[target] += weight;
  }
  return layouts;
}
