import type { VocabEntry } from "../types";

/** Német szóbank — L1 (A1–A2). Főnév névelővel. Egy bejegyzés = egy sor; az azonosító végleges (K.8.4). */
export const VOCAB_DE_L1: VocabEntry[] = [
  { id: "de1-home-001", term: "die Küche", hu: "konyha", kind: "word", level: 1, topic: "home", pos: "noun", example: "Die Küche ist sehr klein.", exampleHu: "A konyha nagyon kicsi." },
  { id: "de1-weather-001", term: "sonnig", hu: "napos", kind: "word", level: 1, topic: "weather", pos: "adj", example: "Heute ist es sonnig und warm.", exampleHu: "Ma napos és meleg idő van." },
  { id: "de1-time-001", term: "morgen", hu: "holnap", kind: "word", level: 1, topic: "time", pos: "adv", example: "Wir schreiben morgen einen Test.", exampleHu: "Holnap dolgozatot írunk." },
  { id: "de1-clothes-001", term: "die Jacke", hu: "dzseki", kind: "word", level: 1, topic: "clothes", pos: "noun", example: "Die Jacke ist mir zu groß.", exampleHu: "A dzseki túl nagy nekem." },
  { id: "de1-city-001", term: "die Bibliothek", hu: "könyvtár", kind: "word", level: 1, topic: "city", pos: "noun", example: "Die Bibliothek öffnet um neun Uhr.", exampleHu: "A könyvtár kilenckor nyit." },
  { id: "de1-body-001", term: "der Arm", hu: "kar", kind: "word", level: 1, topic: "body", pos: "noun", example: "Der Arm tut mir nach dem Spiel weh.", exampleHu: "A meccs után fáj a karom." },
  { id: "de1-freetime-001", term: "Gitarre spielen", hu: "gitározik", kind: "phrase", level: 1, topic: "freetime", pos: "phrase", example: "Mein Bruder kann Gitarre spielen.", exampleHu: "A bátyám tud gitározni." },
  { id: "de1-shopping-001", term: "wie viel kostet das", hu: "mennyibe kerül ez?", kind: "phrase", level: 1, topic: "shopping", pos: "phrase", example: "Entschuldigung, wie viel kostet das?", exampleHu: "Elnézést, mennyibe kerül ez?" },
];
