import type { VocabEntry } from "../types";

/** Angol szóbank — L1 (A1–A2). Egy bejegyzés = egy sor; az azonosító végleges (K.8.4). */
export const VOCAB_EN_L1: VocabEntry[] = [
  { id: "en1-home-001", term: "kitchen", hu: "konyha", kind: "word", level: 1, topic: "home", pos: "noun", example: "We have breakfast in the kitchen.", exampleHu: "A konyhában reggelizünk." },
  { id: "en1-weather-001", term: "sunny", hu: "napos", kind: "word", level: 1, topic: "weather", pos: "adj", example: "It is sunny and warm today.", exampleHu: "Ma napos és meleg idő van." },
  { id: "en1-time-001", term: "tomorrow", hu: "holnap", kind: "word", level: 1, topic: "time", pos: "adv", example: "We have a test tomorrow.", exampleHu: "Holnap dolgozatot írunk." },
  { id: "en1-clothes-001", term: "jacket", hu: "dzseki", kind: "word", level: 1, topic: "clothes", pos: "noun", example: "Put on your jacket, it is cold.", exampleHu: "Vedd fel a dzsekidet, hideg van." },
  { id: "en1-city-001", term: "library", hu: "könyvtár", kind: "word", level: 1, topic: "city", pos: "noun", example: "The library opens at nine o'clock.", exampleHu: "A könyvtár kilenckor nyit." },
  { id: "en1-body-001", term: "shoulder", hu: "váll", kind: "word", level: 1, topic: "body", pos: "noun", example: "My shoulder hurts after the match.", exampleHu: "Fáj a vállam a meccs után." },
  { id: "en1-freetime-001", term: "play the guitar", hu: "gitározik", kind: "phrase", level: 1, topic: "freetime", pos: "phrase", example: "My brother can play the guitar.", exampleHu: "A bátyám tud gitározni." },
  { id: "en1-shopping-001", term: "how much is it", hu: "mennyibe kerül?", kind: "phrase", level: 1, topic: "shopping", pos: "phrase", example: "Excuse me, how much is it?", exampleHu: "Elnézést, mennyibe kerül?" },
];
