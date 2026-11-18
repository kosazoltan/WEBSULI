import { VOCAB_TOPIC_LABELS_HU } from "@/data/vocabBank/topics";

/** A kvíz-tételek `topic` mezőjének nyers tantárgy-kulcsai (tananyag-export, évfolyam-bank) → magyar tantárgynév. */
export const QUIZ_SUBJECT_LABELS_HU: Readonly<Record<string, string>> = {
  math: "Matek",
  english: "Angol",
  hungarian: "Magyar",
  nature: "Természet",
  science: "Természettudomány",
  history: "Történelem",
};

/** Ismeretlen, azonosító-szerű kulcsra a semleges felirat. */
export const QUIZ_TOPIC_FALLBACK_HU = "Kvíz";

/**
 * A játékos számára kiírható magyar címke egy kvíz `topic` értékéhez (E24, éles próba: „HUNGARIAN KVÍZ”).
 * - tantárgy-kulcs (math / english / hungarian / nature / science / history) → magyar tantárgynév;
 * - a 24 szóbank-téma kulcsa (family, food, …) → a magyar téma-név;
 * - már emberi szöveg (szóköz, ékezet vagy nagybetű: pl. „Egyenletek”, „Állatok”) → változatlanul;
 * - ismeretlen, azonosító-szerű kulcs (kisbetűs ASCII, szóköz nélkül) → „Kvíz”;
 * - üres / hiányzó → `fallback` (alapból „Kvíz”).
 */
export function quizTopicLabelHu(topic: string | null | undefined, fallback: string = QUIZ_TOPIC_FALLBACK_HU): string {
  const raw = (topic ?? "").trim();
  if (!raw) return fallback;
  const key = raw.toLowerCase();
  const subject = QUIZ_SUBJECT_LABELS_HU[key];
  if (subject) return subject;
  const vocab = (VOCAB_TOPIC_LABELS_HU as Record<string, string>)[key];
  if (vocab) return vocab;
  if (/^[a-z][a-z0-9_-]*$/i.test(raw) && raw === key) return QUIZ_TOPIC_FALLBACK_HU;
  return raw;
}
