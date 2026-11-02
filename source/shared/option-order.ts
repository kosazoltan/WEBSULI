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

// Betűvel („A)”, „A és B”, „„C””, „B válasz”) vagy „fenti / előző válasz” szóval más opcióra hivatkozó kérdés nem keverhető.
const REFERS_TO_OTHER_OPTION = /(^|[\s(„])[A-D]\)|(^|\s)[A-D] (és|vagy) [A-D]\b|„[A-D]”|\b[A-D] válasz|fenti|előző válasz/i;

export const refersToOtherOptions = (options: readonly string[], feedback: readonly string[] = []): boolean =>
  [...options, ...feedback].some((text) => REFERS_TO_OTHER_OPTION.test(text));

/** A megjelenítés sorrendje: hivatkozó opcióknál a tárolt sorrend, különben a kevert. */
export function displayOrder(seed: string, options: readonly string[], feedback: readonly string[] = []): number[] {
  return refersToOtherOptions(options, feedback) ? options.map((_, i) => i) : optionOrder(seed, options.length);
}

/** A tananyag- és kvízkérdés seedje: a kérdés és az opciók szövege (újratöltésen és mentett válasznál is ugyanaz). */
export const choiceSeed = (question: string, options: readonly string[]): string => [question, ...options].join("\u0000");

export type ChoiceQuestion = { question: string; options: readonly string[]; correctIndex: number; feedbackPerOption?: readonly string[] };

/**
 * Spec 2026-11-02-valasz-keveres: a kérdésenkénti keverés egy adott leckén determinisztikus mintát adhat (mért: az Antigoné 7
 * ellenőrzőjéből 6-nál „A”, mindig). Ezért egy lecke / kör kérdéseinél a helyes válasz célpozíciója a sorban eddig legkevésbé
 * használt pozíciók egyike (seedelt döntetlen-bontás), a többi opció kevert sorrendben. Kulcs: `choiceSeed(question, options)`.
 */
export function balancedLayouts(choices: readonly ChoiceQuestion[]): Map<string, number[]> {
  const layouts = new Map<string, number[]>();
  const random = mulberry32(hash32(choices.map((c) => choiceSeed(c.question, c.options)).join("\u0001")));
  const used: number[] = [];
  for (const choice of choices) {
    const key = choiceSeed(choice.question, choice.options);
    const count = choice.options.length;
    if (layouts.has(key)) continue;
    const valid = Number.isInteger(choice.correctIndex) && choice.correctIndex >= 0 && choice.correctIndex < count;
    if (!valid || count < 2 || refersToOtherOptions(choice.options, choice.feedbackPerOption)) {
      layouts.set(key, displayOrder(key, choice.options, choice.feedbackPerOption));
      continue;
    }
    const usage = Array.from({ length: count }, (_, p) => used[p] ?? 0);
    const least = Math.min(...usage);
    const candidates = usage.flatMap((n, p) => (n === least ? [p] : []));
    const target = candidates[Math.floor(random() * candidates.length)];
    const others = optionOrder(key, count).filter((i) => i !== choice.correctIndex);
    others.splice(target, 0, choice.correctIndex);
    layouts.set(key, others);
    used[target] = (used[target] ?? 0) + 1;
  }
  return layouts;
}
