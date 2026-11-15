import type { VocabEntry } from "../types";

/** Francia szóbank — L0 (A1). `?!:;` előtt \u00A0. Egy bejegyzés = egy sor; az azonosító végleges (K.8.4). */
export const VOCAB_FR_L0: VocabEntry[] = [
  { id: "fr0-animals-001", term: "le chien", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Le chien joue dans le jardin.", exampleHu: "A kutya a kertben játszik." },
  { id: "fr0-family-001", term: "la mère", hu: "anya", kind: "word", level: 0, topic: "family", pos: "noun", example: "La mère de Léa est professeure.", exampleHu: "Léa anyukája tanár." },
  { id: "fr0-colors-001", term: "bleu", hu: "kék", kind: "word", level: 0, topic: "colors", pos: "adj", example: "Le ciel est bleu aujourd'hui.", exampleHu: "Ma kék az ég." },
  { id: "fr0-numbers-001", term: "cinq", hu: "öt", kind: "word", level: 0, topic: "numbers", pos: "num", example: "J'ai cinq crayons dans ma trousse.", exampleHu: "Öt ceruza van a tolltartómban." },
  { id: "fr0-food-001", term: "la pomme", hu: "alma", kind: "word", level: 0, topic: "food", pos: "noun", example: "La pomme est rouge et sucrée.", exampleHu: "Az alma piros és édes." },
  { id: "fr0-school-001", term: "le livre", hu: "könyv", kind: "word", level: 0, topic: "school", pos: "noun", example: "Le livre est sur la table.", exampleHu: "A könyv az asztalon van." },
  { id: "fr0-everyday-001", term: "bonne nuit", hu: "jó éjszakát", kind: "phrase", level: 0, topic: "everyday", pos: "phrase", example: "Bonne nuit, à demain\u00A0!", exampleHu: "Jó éjszakát, holnap találkozunk!" },
  { id: "fr0-communication-001", term: "merci beaucoup", hu: "köszönöm szépen", kind: "phrase", level: 0, topic: "communication", pos: "phrase", example: "Merci beaucoup pour le cadeau\u00A0!", exampleHu: "Köszönöm szépen az ajándékot!" },
];
