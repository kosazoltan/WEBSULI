/**
 * #171 — folytatásos generálás az okosítónak.
 *
 * Gyökér-ok (élesben mérve, hőtan 65 kB): a 32k max_tokens plafonnál a stream
 * SZABÁLYOSAN zár le ('done' chunk, nincs hiba), a runner sikeresnek hitte, a
 * verify-kapu (#159) pedig jogosan elutasította a csonka HTML-t — a futás
 * hibán állt meg, pedig a modell csak a plafonig jutott.
 *
 * A megoldás: ha a kimenet csonka, a részleges HTML assistant-üzenetként
 * visszamegy a modellnek, és PONTOSAN a megszakadás pontjától folytatja.
 * Korlátos kör (MAX_CONTINUATION_ROUNDS), átfedés-illesztéssel — a plafon
 * többé nem halál, csak még egy (olcsóbb, rövidebb) kör.
 */

import type { AIMessage } from "../ai/AIProvider";

export const MAX_CONTINUATION_ROUNDS = 3;

const CONTINUE_COMMAND = [
  "A kimeneted félbeszakadt a token-limit miatt.",
  "PONTOSAN ott folytasd, ahol abbahagytad — az utolsó kiírt karakter után.",
  "Ne kezdd elölről, ne ismételj semmit a már kiírt részből, ne írj magyarázatot és ne nyiss kódblokkot.",
  "Csak a hiányzó folytatást írd, a </html> lezárásig.",
].join(" ");

/** A folytatás-kérés üzenetei: eredeti kontextus + részleges kimenet + parancs. */
export function buildContinuationMessages(
  systemPrompt: string,
  userPrompt: string,
  partialHtml: string,
): AIMessage[] {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
    { role: "assistant", content: partialHtml },
    { role: "user", content: CONTINUE_COMMAND },
  ];
}

/** ```html kerítés levágása, ha a modell mégis abba csomagolta a folytatást. */
export function stripHtmlCodeFence(text: string): string {
  const match = text.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1].trim() : text.trim();
}

/**
 * A folytatás hozzáillesztése a részleges kimenethez. A modellek gyakran a
 * megszakadt sor elejétől ismételnek — a leghosszabb átfedést (a partial vége
 * = a folytatás eleje) egyszer szerepeltetjük. Az átfedés-keresés korlátos
 * (max 400 karakter), mert a plafon-vágás sosem vág ennél nagyobbat vissza.
 */
export function joinContinuation(partial: string, continuation: string): string {
  const next = stripHtmlCodeFence(continuation);
  const window = Math.min(400, partial.length, next.length);
  for (let len = window; len > 0; len--) {
    if (partial.endsWith(next.slice(0, len))) {
      return partial + next.slice(len);
    }
  }
  return partial + next;
}
