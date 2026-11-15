import type { VocabWiringCase } from "../support/vocab-wiring-case";

/**
 * Tornado Hunter 200 (S12). A kézi angol kérdések (`ENG_1…ENG_6`) a `lib/tornado/questions.ts`-ben élnek, a lap a
 * `pickQuestion(` hívással ér el hozzájuk; a tananyag-ág (`args.material`) is ott van, ezért a sorrend-ellenőrzés
 * abban a fájlban fut. Ha az S12 a szóbank-hívást máshová teszi, ezt az esetfájlt igazítja hozzá.
 */
export const CASE: VocabWiringCase = {
  page: "TornadoHunter200.tsx",
  wired: false,
  manualBank: /pickQuestion\(/,
  materialFirstFile: "lib/tornado/questions.ts",
  materialFirst: /args\.material\b/,
};
