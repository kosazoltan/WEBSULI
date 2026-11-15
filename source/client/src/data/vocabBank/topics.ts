import type { VocabTopic } from "./types";

/** A 24 rögzített téma (terv 4.2; a `nyelvi-tanmenet.json` témáihoz igazítva). A sorrend nem változhat. */
export const VOCAB_TOPICS = [
  "family", "school", "food", "home", "city", "time", "body", "clothes", "weather", "freetime", "animals", "nature",
  "travel", "shopping", "health", "feelings", "work", "technology", "sports", "culture", "numbers", "colors",
  "everyday", "communication",
] as const;

export const VOCAB_TOPIC_LABELS_HU: Record<VocabTopic, string> = {
  family: "Család",
  school: "Iskola",
  food: "Étel, ital",
  home: "Otthon",
  city: "Város",
  time: "Idő",
  body: "Test",
  clothes: "Ruha",
  weather: "Időjárás",
  freetime: "Szabadidő",
  animals: "Állatok",
  nature: "Természet",
  travel: "Utazás",
  shopping: "Vásárlás",
  health: "Egészség",
  feelings: "Érzések",
  work: "Munka",
  technology: "Technika",
  sports: "Sport",
  culture: "Kultúra",
  numbers: "Számok",
  colors: "Színek",
  everyday: "Hétköznapok",
  communication: "Kommunikáció",
};
