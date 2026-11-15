import type { VocabEntry } from "../types";

/** Francia szóbank — L1 (A1–A2). `?!:;` előtt \u00A0. Egy bejegyzés = egy sor; az azonosító végleges (K.8.4). */
export const VOCAB_FR_L1: VocabEntry[] = [
  { id: "fr1-home-001", term: "la cuisine", hu: "konyha", kind: "word", level: 1, topic: "home", pos: "noun", example: "La cuisine est très petite.", exampleHu: "A konyha nagyon kicsi." },
  { id: "fr1-weather-001", term: "ensoleillé", hu: "napos", kind: "word", level: 1, topic: "weather", pos: "adj", example: "Aujourd'hui, le temps est ensoleillé.", exampleHu: "Ma napos az idő." },
  { id: "fr1-time-001", term: "demain", hu: "holnap", kind: "word", level: 1, topic: "time", pos: "adv", example: "Nous avons un contrôle demain.", exampleHu: "Holnap dolgozatot írunk." },
  { id: "fr1-clothes-001", term: "la veste", hu: "dzseki", kind: "word", level: 1, topic: "clothes", pos: "noun", example: "La veste bleue est à moi.", exampleHu: "A kék dzseki az enyém." },
  { id: "fr1-city-001", term: "la bibliothèque", hu: "könyvtár", kind: "word", level: 1, topic: "city", pos: "noun", example: "La bibliothèque ouvre à neuf heures.", exampleHu: "A könyvtár kilenckor nyit." },
  { id: "fr1-body-001", term: "le bras", hu: "kar", kind: "word", level: 1, topic: "body", pos: "noun", example: "Le bras de mon frère est cassé.", exampleHu: "A bátyám karja eltört." },
  { id: "fr1-freetime-001", term: "jouer de la guitare", hu: "gitározik", kind: "phrase", level: 1, topic: "freetime", pos: "phrase", example: "Mon frère sait jouer de la guitare.", exampleHu: "A bátyám tud gitározni." },
  { id: "fr1-shopping-001", term: "combien ça coûte", hu: "mennyibe kerül?", kind: "phrase", level: 1, topic: "shopping", pos: "phrase", example: "Excusez-moi, combien ça coûte\u00A0?", exampleHu: "Elnézést, mennyibe kerül?" },
];
