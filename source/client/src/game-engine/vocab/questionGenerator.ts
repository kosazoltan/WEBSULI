import type { FourChoiceQuiz } from "../../types/gameQuiz";
import type { VocabEntry, VocabKind, VocabLang, VocabLevel, VocabTopic } from "../../data/vocabBank/types";
import { normalizeTerm } from "../../data/vocabBank/validate";
import { isPlayableQuestion } from "../../../../shared/game-quiz-contract";

/**
 * Szóbankos kérdésgenerátor (terv 4.3; végrehajtás S1/7. lépés). Tiszta modul: a véletlen kívülről jön, azonos
 * seed → azonos kérdés.
 */
export type VocabQuestionType = "hu-to-target" | "target-to-hu" | "cloze" | "phrase-meaning";

export type VocabQuiz = FourChoiceQuiz & {
  vocabId: string;
  lang: VocabLang;
  level: VocabLevel;
  topic: VocabTopic;
  kind: VocabKind;
  questionType: VocabQuestionType;
  /** A bejegyzés term-je (naplózáshoz, dedupe-hoz). */
  answerTerm: string;
};

const LANG_SUFFIX: Record<VocabLang, string> = { en: "angolul", de: "németül", fr: "franciául" };
const BLANK = "_____";
const EXPLANATION_MAX = 300;
const EXPLANATION_MIN = 30;

export function langOfEntry(entry: Pick<VocabEntry, "id">): VocabLang | null {
  const p = entry.id.slice(0, 2);
  return p === "en" || p === "de" || p === "fr" ? p : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A `term` szó szerinti előfordulása a példában (kis-/nagybetűtől függetlenül, szóhatáron, a szóközök bármely
 * — nem törő — szóközzel egyeznek). Csak a term számít, az `alt` nem (szerződés-pontosítás 2026-11-15, #419
 * review: ragozott alakból hiányos mondat nem készül, mert a helyes opció a term).
 */
export function findTermInExample(entry: Pick<VocabEntry, "term" | "example">): { start: number; end: number } | null {
  const term = normalizeTerm(entry.term);
  if (!term) return null;
  const pattern = term.split(" ").map(escapeRegExp).join("[\\s\\u00A0\\u202F]+");
  // Bal szóhatár visszatekintés nélkül (a régi Safari nem ismeri, no-lookbehind-client.test.ts): elfogyasztott előtag.
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "iu");
  const text = entry.example.normalize("NFC");
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[1]!.length;
  return { start, end: start + m[2]!.length };
}

function canCloze(entry: VocabEntry): boolean {
  return findTermInExample(entry) !== null;
}

function canPhraseMeaning(entry: VocabEntry): boolean {
  return entry.kind === "phrase" && entry.level >= 2;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** `phrase` és level ≥ 2 → a négy típusból egyenletesen; különben hu→cél, cél→hu, (ha lehet) hiányos mondat. */
export function pickQuestionType(entry: VocabEntry, rng: () => number): VocabQuestionType {
  const types: VocabQuestionType[] = ["hu-to-target", "target-to-hu"];
  if (canCloze(entry)) types.push("cloze");
  if (canPhraseMeaning(entry)) types.push("phrase-meaning");
  return pick(types, rng);
}

function optionOf(entry: VocabEntry, type: VocabQuestionType): string {
  if (type === "target-to-hu") return entry.hu;
  if (type === "phrase-meaning") return entry.exampleHu;
  return entry.term;
}

type EntryKeys = { term: string; hu: string; exampleHu: string };
/** Bejegyzésenként egyszer normalizálunk (a bank objektumai nem változnak futás közben). */
const keyCache = new WeakMap<VocabEntry, EntryKeys>();
function keysOf(e: VocabEntry): EntryKeys {
  let k = keyCache.get(e);
  if (!k) {
    k = { term: normalizeTerm(e.term), hu: normalizeTerm(e.hu), exampleHu: normalizeTerm(e.exampleHu) };
    keyCache.set(e, k);
  }
  return k;
}

function optionKey(e: VocabEntry, type: VocabQuestionType): string {
  const k = keysOf(e);
  return type === "target-to-hu" ? k.hu : type === "phrase-meaning" ? k.exampleHu : k.term;
}

function pickDistractors(entry: VocabEntry, bank: readonly VocabEntry[], type: VocabQuestionType, rng: () => number): VocabEntry[] | null {
  const lang = langOfEntry(entry);
  const { term: termKey, hu: huKey } = keysOf(entry);
  const pool = bank.filter(c => c.id !== entry.id && c.kind === entry.kind && c.id.startsWith(lang ?? "")
    && keysOf(c).term !== termKey && keysOf(c).hu !== huKey);
  const near = (c: VocabEntry) => Math.abs(c.level - entry.level) <= 1;
  // Sorrend: (1) szomszéd szint + azonos szófaj, (2) szomszéd szint, (3) bármely szint — mindegyik a kind-on belül.
  const tiers = [
    pool.filter(c => near(c) && c.pos === entry.pos),
    pool.filter(c => near(c) && c.pos !== entry.pos),
    pool.filter(c => !near(c)),
  ];
  const chosen: VocabEntry[] = [];
  const terms = new Set([termKey]);
  const hus = new Set([huKey]);
  const opts = new Set([optionKey(entry, type)]);
  for (const tier of tiers) {
    for (const c of shuffle(tier, rng)) {
      if (chosen.length === 3) break;
      const { term: t, hu: h } = keysOf(c);
      const o = optionKey(c, type);
      if (terms.has(t) || hus.has(h) || opts.has(o)) continue;
      chosen.push(c);
      terms.add(t); hus.add(h); opts.add(o);
    }
  }
  return chosen.length === 3 ? chosen : null;
}

function promptFor(entry: VocabEntry, type: VocabQuestionType, lang: VocabLang): string | null {
  switch (type) {
    case "hu-to-target": return `„${entry.hu}” ${LANG_SUFFIX[lang]}:`;
    case "target-to-hu": return `Mit jelent: „${entry.term}”?`;
    case "phrase-meaning": return `Mit jelent ez a mondat? „${entry.example}”`;
    case "cloze": {
      const hit = findTermInExample(entry);
      if (!hit) return null;
      const text = entry.example.normalize("NFC");
      return `Melyik illik a mondatba? ${text.slice(0, hit.start)}${BLANK}${text.slice(hit.end)}`;
    }
  }
}

function explanationFor(entry: VocabEntry, correct: string): string {
  const head = `A helyes válasz: „${correct}”. ${entry.term} = ${entry.hu}.`;
  let text = `${head} Példa: „${entry.example}” (${entry.exampleHu})`;
  if (text.length > EXPLANATION_MAX) text = head;
  if (text.length < EXPLANATION_MIN) text = `${text} Szó: ${entry.term}.`;
  return text;
}

/** Egy kérdés a bejegyzésből; `null`, ha a típus nem alkalmazható, vagy nincs 3 megfelelő rossz válasz. */
export function generateVocabQuestion(entry: VocabEntry, bank: readonly VocabEntry[], type: VocabQuestionType, rng: () => number): VocabQuiz | null {
  const lang = langOfEntry(entry);
  if (!lang) return null;
  if (type === "cloze" && !canCloze(entry)) return null;
  if (type === "phrase-meaning" && !canPhraseMeaning(entry)) return null;
  const prompt = promptFor(entry, type, lang);
  if (!prompt) return null;
  const distractors = pickDistractors(entry, bank, type, rng);
  if (!distractors) return null;

  const correct = optionOf(entry, type);
  const correctIndex = Math.min(3, Math.floor(rng() * 4));
  const wrong = distractors.map(d => optionOf(d, type));
  const options = [...wrong.slice(0, correctIndex), correct, ...wrong.slice(correctIndex)];

  const quiz: VocabQuiz = {
    id: `vocab:${entry.id}:${type}`,
    prompt,
    options,
    correctIndex,
    explanation: explanationFor(entry, correct),
    vocabId: entry.id,
    lang,
    level: entry.level,
    topic: entry.topic,
    kind: entry.kind,
    questionType: type,
    answerTerm: entry.term,
  };
  return isPlayableQuestion(quiz) ? quiz : null;
}
