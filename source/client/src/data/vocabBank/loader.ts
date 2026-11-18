import type { VocabEntry, VocabLang } from "./types";

/**
 * Nyelvenkénti lusta betöltés (terv 4.2, 8. „Csomagméret”): a bank nem kerül a kezdő csomagba. Az ígéret
 * nyelvenként gyorsítótárazott; hibánál elutasít és a gyorsítótárból kiesik (a következő hívás újrapróbál),
 * a hívó a kézi bankra esik vissza.
 */
const cache = new Map<VocabLang, Promise<VocabEntry[]>>();

function importBank(lang: VocabLang): Promise<VocabEntry[]> {
  switch (lang) {
    case "en": return import("./vocab-en").then(m => m.VOCAB_EN);
    case "de": return import("./vocab-de").then(m => m.VOCAB_DE);
    case "fr": return import("./vocab-fr").then(m => m.VOCAB_FR);
    default: return Promise.reject(new Error(`ismeretlen szóbank-nyelv: ${String(lang)}`));
  }
}

export function loadVocabBank(lang: VocabLang): Promise<VocabEntry[]> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const p = importBank(lang).catch((err: unknown) => {
    cache.delete(lang);
    throw err;
  });
  cache.set(lang, p);
  return p;
}

/** Teszthez: a gyorsítótár ürítése. */
export function resetVocabBankCache(): void {
  cache.clear();
}
