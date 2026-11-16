import type { LadderCategory, LadderItem, LadderTier } from "../../data/wordLadder/types";
import type { VocabEntry, VocabLang, VocabLevel, VocabTopic } from "../../data/vocabBank/types";
import { tierSearchOrder } from "../no-repeat";
import { generateVocabQuestion, meaningKeys, pickQuestionType, type VocabQuestionType, type VocabQuiz } from "./questionGenerator";
import { externalKey, type SeenHistory } from "./seenHistory";
import { normalizeTerm } from "../../data/vocabBank/validate";

/**
 * Játék-adapter a szóbankhoz (terv 4.4; szerződés K.7.2). A választás a közös, tartós naplóból dolgozik, így
 * futások és játékok között sem ismétel, amíg a szint (majd a szomszéd szintek, majd a nyelv) el nem fogy.
 */
export type VocabSource = {
  lang: VocabLang;
  bankSize: number;
  /** A kért szint (+ téma) nem látott bejegyzéséből kérdés, és NAPLÓZ. Kimerülésnél terv 4.4 szerint. */
  next(level: VocabLevel, opts?: { topic?: VocabTopic; types?: VocabQuestionType[] }): VocabQuiz | null;
  /** Kérdéskészlet NAPLÓZÁS nélkül (a Szólétra pickUnseen-jéhez); a ténylegesen feltett tételt markAsked naplózza. */
  buildPool(level: VocabLevel, count: number): VocabQuiz[];
  markAsked(q: Pick<VocabQuiz, "vocabId">): void;
  /** Kézi (nem szóbankos) kérdés helyes válasza; az azonos normalizált term- vagy hu-jú bejegyzés ezután kimarad. */
  markExternal(correctAnswer: string): void;
  /** A Szólétra LadderItem-je (category: word→"word", phrase→"phrase"; tier = level). */
  toLadderItem(q: VocabQuiz): LadderItem;
};

const LEVEL_COUNT = 5;
const MAX_ATTEMPTS = 20;

export function createVocabSource(opts: {
  lang: VocabLang;
  entries: readonly VocabEntry[];
  history: SeenHistory;
  rng?: () => number;
}): VocabSource {
  const { lang, history } = opts;
  const rng = opts.rng ?? Math.random;
  const entries = opts.entries.slice();
  const byLevel: VocabEntry[][] = Array.from({ length: LEVEL_COUNT }, () => []);
  for (const e of entries) if (e.level >= 0 && e.level < LEVEL_COUNT) byLevel[e.level]!.push(e);
  const byId = new Map(entries.map(e => [e.id, e]));
  history.setCap(lang, entries.length);

  /** Egyetlen tárolóolvasásból: látott-e (azonosító szerint, vagy a term / hu kézi kérdésből már ismert). */
  const extKeys = new Map(entries.map(e => [e.id, [externalKey(e.term), externalKey(e.hu)] as const]));
  function seenCheck(): { seen: (e: VocabEntry) => boolean; last: (e: VocabEntry) => number } {
    const snap = history.snapshot(lang);
    return {
      seen: e => {
        if (snap[e.id] !== undefined) return true;
        const [t, h] = extKeys.get(e.id)!;
        return snap[t] !== undefined || snap[h] !== undefined;
      },
      // Kimerülésnél a kézi kérdésből ismert bejegyzés is „látott”: a legkésőbbi időbélyeg számít.
      last: e => {
        const [t, h] = extKeys.get(e.id)!;
        return Math.max(snap[e.id] ?? -1, snap[t] ?? -1, snap[h] ?? -1);
      },
    };
  }

  function shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /**
   * Jelöltek a választás sorrendjében: a `tierSearchOrder` szerinti első szint, ahol van nem látott (és ha van
   * téma, témába illő) bejegyzés — véletlen sorrendben; ha a témában elfogyott, ugyanez téma nélkül; ha a nyelv
   * teljesen elfogyott, a legrégebben látottak (`lastSeen` szerint növekvően).
   */
  function candidates(level: VocabLevel, topic: VocabTopic | undefined, exclude: ReadonlySet<string>): VocabEntry[] {
    const order = tierSearchOrder(LEVEL_COUNT, level);
    const passes: Array<VocabTopic | undefined> = topic ? [topic, undefined] : [undefined];
    const { seen, last } = seenCheck();
    for (const t of passes) {
      for (const lv of order) {
        const fresh = byLevel[lv]!.filter(e => !exclude.has(e.id) && (!t || e.topic === t) && !seen(e));
        if (fresh.length) return shuffled(fresh);
      }
    }
    const rest = entries.filter(e => !exclude.has(e.id));
    return rest.map((e, i) => ({ e, i, s: last(e) })).sort((a, b) => a.s - b.s || a.i - b.i).map(x => x.e);
  }

  /** Az utoljára kérdezett bejegyzések jelentés-kulcsai (L2; ennyi bejegyzésnyi ablak — egy futás nagyságrendje). */
  const RECENT_MEANINGS = 50;
  const recentEntries: string[][] = [];
  const recentKeys = new Map<string, number>();
  function rememberMeaning(entry: VocabEntry): void {
    const keys = meaningKeys(entry.hu);
    recentEntries.push(keys);
    for (const k of keys) recentKeys.set(k, (recentKeys.get(k) ?? 0) + 1);
    if (recentEntries.length > RECENT_MEANINGS) {
      for (const k of recentEntries.shift()!) {
        const n = (recentKeys.get(k) ?? 1) - 1;
        if (n <= 0) recentKeys.delete(k);
        else recentKeys.set(k, n);
      }
    }
  }

  function question(entry: VocabEntry, types?: VocabQuestionType[]): VocabQuiz | null {
    const allowed = types?.length ? types : null;
    let type = pickQuestionType(entry, rng);
    if (allowed && !allowed.includes(type)) type = allowed[Math.min(allowed.length - 1, Math.floor(rng() * allowed.length))]!;
    return generateVocabQuestion(entry, entries, type, rng)
      // Ha a választott típus nem készíthető (pl. kevés rossz válasz a kind-ban), az alaptípussal még egyszer.
      ?? (type !== "hu-to-target" && (!allowed || allowed.includes("hu-to-target")) ? generateVocabQuestion(entry, entries, "hu-to-target", rng) : null);
  }

  return {
    lang,
    bankSize: entries.length,
    next(level, o) {
      const tried = new Set<string>();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const list = candidates(level, o?.topic, tried);
        // S13 / átfogó review L2: a nemrég kérdezett bejegyzések jelentés-kulcsával ütköző jelölt (szinonima, pl.
        // grandmother / granny = „nagymama”) kimarad, amíg van más — ne jöjjön ugyanaz a prompt más helyes válasszal.
        const entry = list.find(e => !meaningKeys(e.hu).some(k => recentKeys.has(k))) ?? list[0];
        if (!entry) return null;
        tried.add(entry.id);
        const q = question(entry, o?.types);
        if (q) {
          history.mark(lang, entry.id);
          rememberMeaning(entry);
          return q;
        }
      }
      return null;
    },
    buildPool(level, count) {
      const pool: VocabQuiz[] = [];
      const used = new Set<string>();
      let attempts = 0;
      while (pool.length < count && attempts < count + MAX_ATTEMPTS) {
        // A napló szerint még nem látottak jönnek elöl (szint, majd szomszéd szint); csak ha elfogytak, a legrégebben látottak.
        const list = candidates(level, undefined, used);
        if (!list.length) break;
        for (const entry of list) {
          if (pool.length >= count) break;
          used.add(entry.id);
          attempts++;
          const q = question(entry);
          if (q) pool.push(q);
        }
      }
      return pool;
    },
    markAsked(q) {
      if (byId.has(q.vocabId)) history.mark(lang, q.vocabId);
    },
    markExternal(correctAnswer) {
      if (normalizeTerm(correctAnswer)) history.markExternal(lang, correctAnswer);
    },
    toLadderItem(q) {
      const category: LadderCategory = q.kind === "phrase" ? "phrase" : "word";
      return {
        id: q.id,
        prompt: q.prompt,
        options: q.options.slice(),
        correctIndex: q.correctIndex,
        ...(q.explanation ? { explanation: q.explanation } : {}),
        tier: q.level as LadderTier,
        category,
      };
    },
  };
}
