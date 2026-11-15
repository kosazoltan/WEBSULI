import { VOCAB_TOPICS } from "./topics";
import { VOCAB_POS, type VocabEntry, type VocabLang, type VocabMinimums, type VocabTopic } from "./types";

/**
 * Szóbank-validátor (végrehajtási utasítás S1/3. lépés, K.8.5). Tiszta modul: a teszt, a riport-szkript és a
 * tartalomszeletek ugyanezt futtatják.
 */

/** NFC, kisbetű, minden (nem törő) szóközsorozat → egy szóköz, trim. */
export function normalizeTerm(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[\s\u00A0\u202F]+/g, " ").trim();
}

/** Korosztálynak nem való szavak; a term és a példamondat minden szavára ellenőrizve. */
export const BLOCKED_TERMS: Record<VocabLang, string[]> = {
  en: ["beer", "wine", "vodka", "whisky", "whiskey", "cigarette", "cigar", "gun", "kill", "casino", "drunk"],
  de: ["Bier", "Wein", "Schnaps", "Zigarette", "Waffe", "töten", "Kasino", "betrunken"],
  fr: ["bière", "vin", "vodka", "cigarette", "arme", "tuer", "casino", "ivre"],
};

const ID_RE = /^(en|de|fr)([0-4])-([a-z]+)-(\d{3})$/;
const WORD_SPLIT_RE = /[\s\u00A0\u202F]+/;
const TOPIC_SET = new Set<string>(VOCAB_TOPICS);
const POS_SET = new Set<string>(VOCAB_POS);

/** A példamondat szószáma: a szóköz szerinti darabok közül azok, amelyekben van betű vagy számjegy. */
export function exampleWordCount(example: string): number {
  return example.trim().split(WORD_SPLIT_RE).filter(w => /[\p{L}\d]/u.test(w)).length;
}

/** Szavak (kisbetűs, NFC) írásjelek nélkül — a tiltólista-ellenőrzéshez. */
function wordsOf(s: string): string[] {
  return normalizeTerm(s).split(/[^\p{L}\d]+/u).filter(Boolean);
}

/** A példamondatban szó szerint (normalizálva) megtalálható alak: a term vagy az első illeszkedő `alt`. */
export function formInExample(entry: Pick<VocabEntry, "term" | "example" | "alt">): string | null {
  const ex = normalizeTerm(entry.example);
  for (const form of [entry.term, ...(entry.alt ?? [])]) {
    const f = normalizeTerm(form);
    if (f && ex.includes(f)) return form;
  }
  return null;
}

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

export function vocabBankProblems(entries: VocabEntry[], lang: VocabLang): string[] {
  const problems: string[] = [];
  const ids = new Map<string, number>();
  const terms = new Map<string, string>();
  const blocked = new Set(BLOCKED_TERMS[lang].map(normalizeTerm));

  for (const e of entries) {
    const id = typeof e.id === "string" && e.id ? e.id : "(nincs azonosító)";
    const add = (msg: string) => problems.push(`${id}: ${msg}`);

    // Azonosító: alak, nyelv, szint, téma.
    const m = ID_RE.exec(id);
    if (!m) add(`rossz azonosító-alak (elvárt: <nyelv><szint>-<téma>-<nnn>)`);
    else {
      if (m[1] !== lang) add(`az azonosító nyelvi előtagja (${m[1]}) nem a bank nyelve (${lang})`);
      if (Number(m[2]) !== e.level) add(`az azonosító szintjegye (${m[2]}) nem egyezik a szinttel (${String(e.level)})`);
      if (m[3] !== e.topic) add(`az azonosító témája (${m[3]}) nem egyezik a témával (${String(e.topic)})`);
    }
    ids.set(id, (ids.get(id) ?? 0) + 1);
    if (ids.get(id) === 2) add("ismétlődő azonosító");

    // Kötelező szövegmezők.
    for (const field of ["term", "hu", "example", "exampleHu"] as const) {
      if (isBlank(e[field])) add(`üres mező: ${field}`);
    }
    if (e.alt !== undefined && (!Array.isArray(e.alt) || e.alt.some(isBlank))) add("az alt csak nem üres szövegeket tartalmazhat");

    // Felsorolt értékek.
    if (!Number.isInteger(e.level) || e.level < 0 || e.level > 4) add(`érvénytelen szint: ${String(e.level)}`);
    if (!TOPIC_SET.has(e.topic)) add(`érvénytelen téma: ${String(e.topic)}`);
    if (e.kind !== "word" && e.kind !== "phrase") add(`érvénytelen kind: ${String(e.kind)}`);
    if (!POS_SET.has(e.pos)) add(`érvénytelen pos: ${String(e.pos)}`);
    if ((e.kind === "phrase") !== (e.pos === "phrase")) add(`kind és pos ellentmond (kind=${String(e.kind)}, pos=${String(e.pos)}; phrase ⇔ phrase)`);

    const texts = [e.term, e.hu, e.example, e.exampleHu, ...(e.alt ?? [])].filter((t): t is string => typeof t === "string");
    if (texts.some(t => t.includes('"'))) add("ASCII idézőjel a szövegben (helyette „ ”)");

    if (!isBlank(e.term)) {
      const key = normalizeTerm(e.term);
      const prev = terms.get(key);
      if (prev !== undefined) add(`duplikált term: „${e.term}” (már szerepel: ${prev})`);
      else terms.set(key, id);
    }

    if (!isBlank(e.example)) {
      const words = exampleWordCount(e.example);
      if (words < 3 || words > 14) add(`a példamondat ${words} szavas (elvárt 3–14)`);
      if (!/^[\p{Lu}\d]/u.test(e.example.trim())) add("a példamondat nem nagybetűvel kezdődik");
      if (!/[.!?…][”»]?$/u.test(e.example.trim())) add("a példamondat nem írásjellel zárul");
      if (!isBlank(e.term) && formInExample(e) === null) add("a példamondat nem tartalmazza a term-et és egyik alt alakot sem");
    }

    if (lang === "de" && e.pos === "noun" && typeof e.term === "string" && !/^(der|die|das) \p{Lu}/u.test(e.term)) {
      add("német főnév névelő nélkül (elvárt: der/die/das + nagybetűs főnév)");
    }

    if (lang === "fr") {
      for (const [field, text] of [["term", e.term], ["example", e.example]] as const) {
        if (typeof text !== "string") continue;
        if (/ [?!:;]/.test(text)) add(`francia írásjel előtt sima szóköz (${field}); \\u00A0 vagy \\u202F kell`);
        if (/[\p{L}\d][?!:;]/u.test(text)) add(`francia írásjel előtt nincs nem törő szóköz (${field})`);
      }
    }

    const hit = [...(typeof e.term === "string" ? wordsOf(e.term) : []), ...(typeof e.example === "string" ? wordsOf(e.example) : [])]
      .find(w => blocked.has(w));
    if (hit || (typeof e.term === "string" && blocked.has(normalizeTerm(e.term)))) add(`tiltott szó: ${hit ?? e.term}`);
  }
  return problems;
}

export type VocabStats = {
  total: number;
  perLevel: number[];
  perTopic: Record<VocabTopic, number>;
  phrase: number;
};

export function vocabBankStats(entries: readonly VocabEntry[]): VocabStats {
  const perLevel = [0, 0, 0, 0, 0];
  const perTopic = Object.fromEntries(VOCAB_TOPICS.map(t => [t, 0])) as Record<VocabTopic, number>;
  let phrase = 0;
  for (const e of entries) {
    if (e.level >= 0 && e.level <= 4) perLevel[e.level]++;
    if (e.topic in perTopic) perTopic[e.topic]++;
    if (e.kind === "phrase") phrase++;
  }
  return { total: entries.length, perLevel, perTopic, phrase };
}

export function minimumProblems(stats: VocabStats, min: VocabMinimums): string[] {
  const problems: string[] = [];
  if (stats.total < min.total) problems.push(`összesen ${stats.total} < ${min.total}`);
  min.perLevel.forEach((need, i) => {
    const have = stats.perLevel[i] ?? 0;
    if (have < need) problems.push(`L${i}: ${have} < ${need}`);
  });
  const ratio = stats.total > 0 ? stats.phrase / stats.total : 0;
  if (ratio < min.phraseRatio) problems.push(`phrase-arány ${(ratio * 100).toFixed(1)}% < ${(min.phraseRatio * 100).toFixed(0)}%`);
  for (const t of VOCAB_TOPICS) {
    const have = stats.perTopic[t] ?? 0;
    if (have < min.perTopic) problems.push(`${t}: ${have} < ${min.perTopic}`);
  }
  return problems;
}
