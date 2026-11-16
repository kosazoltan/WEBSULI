import type { VocabWiringCase } from "../support/vocab-wiring-case";

/**
 * Tornado Hunter 200 (S12, bekötve). A kézi angol kérdések (`ENG_1…ENG_6`) a `lib/tornado/questions.ts`-ben élnek, a
 * lap a `pickQuestion(` hívással ér el hozzájuk. A sorrend is ott dől el: a tananyag-ág (`args.material`) után az
 * angol hely a szóbankból kérdez (`args.vocab?.next(`), és csak utána jön a közös évfolyam-bank / a saját bank.
 * A lap tartja a `useVocabQuizSource("en", true)` forrást és a kézi angol kérdés `markExternal(` naplózását.
 */
export const CASE: VocabWiringCase = {
  page: "TornadoHunter200.tsx",
  wired: true,
  manualBank: /pickQuestion\(/,
  materialFirstFile: "lib/tornado/questions.ts",
  materialFirst: /args\.material\b/,
};
