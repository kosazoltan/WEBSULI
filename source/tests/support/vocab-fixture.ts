import { VOCAB_TOPICS } from "../../client/src/data/vocabBank/topics";
import type { VocabEntry, VocabLang, VocabLevel, VocabPos } from "../../client/src/data/vocabBank/types";
import type { StorageLike } from "../../client/src/game-engine/vocab/seenHistory";

/** Seedelt véletlen (mulberry32) — visszajátszható tesztekhez. */
export function seededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const WORD_POS: VocabPos[] = ["noun", "verb", "adj", "adv"];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Számból betűsor (a term csak betűkből álljon, a validátor és a szóhatár-keresés miatt). */
function letters(n: number): string {
  let s = "";
  let x = n;
  do {
    s = LETTERS[x % 26] + s;
    x = Math.floor(x / 26);
  } while (x > 0);
  return s;
}

/**
 * Szintetikus, a validátoron átmenő szóbank: szintenként `perLevel[i]` bejegyzés, a témák körbe, minden harmadik
 * `phrase`. A term-ek egyediek („zor<szint><betűk>”; német főnév névelővel).
 */
export function makeSyntheticBank(lang: VocabLang, perLevel: number[], seed: number): VocabEntry[] {
  const rng = seededRng(seed);
  const out: VocabEntry[] = [];
  const perCell = new Map<string, number>();
  perLevel.forEach((count, lv) => {
    const level = lv as VocabLevel;
    for (let i = 0; i < count; i++) {
      const topic = VOCAB_TOPICS[i % VOCAB_TOPICS.length]!;
      const cellKey = `${level}-${topic}`;
      const n = (perCell.get(cellKey) ?? 0) + 1;
      perCell.set(cellKey, n);
      const phrase = i % 3 === 2;
      const pos: VocabPos = phrase ? "phrase" : WORD_POS[Math.floor(rng() * WORD_POS.length)]!;
      const stem = `zor${letters(level)}${letters(i)}`;
      const base = phrase ? `take ${stem} away` : stem;
      const term = lang === "de" && pos === "noun" ? `der ${stem.charAt(0).toUpperCase()}${stem.slice(1)}` : base;
      out.push({
        id: `${lang}${level}-${topic}-${String(n).padStart(3, "0")}`,
        term,
        hu: `jelentés ${level}-${i}`,
        kind: phrase ? "phrase" : "word",
        level,
        topic,
        pos,
        example: `We often see ${term} near the school.`,
        exampleHu: `Gyakran látjuk a(z) ${level}-${i} dolgot az iskolánál.`,
      });
    }
  });
  return out;
}

/** Memória-tároló (localStorage-utánzat); `failGet`/`failSet` kivételt dob. */
export function memoryStorage(opts: { failGet?: boolean; failSet?: boolean; initial?: string } = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (opts.initial !== undefined) data.set("websuli.vocabSeen.v1", opts.initial);
  return {
    data,
    getItem(key: string) {
      if (opts.failGet) throw new Error("SecurityError: tároló letiltva");
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (opts.failSet) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
  };
}
