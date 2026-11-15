import { normalizeTerm } from "../../data/vocabBank/validate";
import type { VocabLang } from "../../data/vocabBank/types";

/**
 * Közös, tartós ismétlés-napló mind a hét játékra (terv 4.4; szerződés K.7.2).
 * Tárolt alak: { v: 1, langs: { en?: Record<id, ms>, de?: …, fr?: … } }.
 * Minden olvasás a tárolóból történik (más játék írását is látja). Bármely tárolókivétel vagy sérült JSON →
 * futáson belüli memória; kivételt soha nem enged ki.
 */
export const VOCAB_SEEN_KEY = "websuli.vocabSeen.v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type SeenHistory = {
  has(lang: VocabLang, entryId: string): boolean;
  lastSeen(lang: VocabLang, entryId: string): number | undefined;
  mark(lang: VocabLang, entryId: string): void;
  /** Kézi kérdés helyes válasza; kulcs "ext:" + normalizeTerm(text). */
  markExternal(lang: VocabLang, text: string): void;
  hasExternal(lang: VocabLang, text: string): boolean;
  /** Nyelvenként legfeljebb a bank mérete; túllépéskor a legrégebbiek törlődnek. */
  setCap(lang: VocabLang, bankSize: number): void;
  size(lang: VocabLang): number;
  /**
   * K.7.2-n túli, additív: a nyelv naplója EGY tárolóolvasással (kulcs → ms; a kézi kulcsok "ext:" előtaggal).
   * A választó ezzel nézi végig a szintet, hogy ne bejegyzésenként olvassa és parse-olja a tárolót.
   */
  snapshot(lang: VocabLang): Readonly<Record<string, number>>;
};

type LangLog = Record<string, number>;
type Stored = { v: 1; langs: Partial<Record<VocabLang, LangLog>> };

const EXTERNAL_PREFIX = "ext:";

function emptyStore(): Stored {
  return { v: 1, langs: {} };
}

function sanitize(raw: unknown): Stored {
  if (!raw || typeof raw !== "object") return emptyStore();
  const obj = raw as { v?: unknown; langs?: unknown };
  if (obj.v !== 1 || !obj.langs || typeof obj.langs !== "object") return emptyStore();
  const out = emptyStore();
  for (const lang of ["en", "de", "fr"] as const) {
    const log = (obj.langs as Record<string, unknown>)[lang];
    if (!log || typeof log !== "object") continue;
    const clean: LangLog = {};
    for (const [k, v] of Object.entries(log as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
    }
    out.langs[lang] = clean;
  }
  return out;
}

export function externalKey(text: string): string {
  return EXTERNAL_PREFIX + normalizeTerm(text);
}

export function createSeenHistory(storage: StorageLike | null, now: () => number = Date.now): SeenHistory {
  let mem: Stored = emptyStore();
  let fallback = storage === null;
  const caps: Partial<Record<VocabLang, number>> = {};

  /** Az utoljára olvasott / írt nyers JSON: változatlan tárolónál nem parse-olunk újra (más játék írását így is látjuk). */
  let lastRaw: string | null | undefined;

  function read(): Stored {
    if (fallback || !storage) return mem;
    try {
      const raw = storage.getItem(VOCAB_SEEN_KEY);
      if (raw === lastRaw) return mem;
      lastRaw = raw;
      if (raw === null) mem = emptyStore();
      else {
        try {
          mem = sanitize(JSON.parse(raw));
        } catch (_err) {
          mem = emptyStore();
        }
      }
    } catch (_err) {
      fallback = true;
    }
    return mem;
  }

  function write(next: Stored): void {
    mem = next;
    if (fallback || !storage) return;
    try {
      const raw = JSON.stringify(next);
      storage.setItem(VOCAB_SEEN_KEY, raw);
      lastRaw = raw;
    } catch (_err) {
      fallback = true;
    }
  }

  function trim(log: LangLog, cap: number | undefined): void {
    if (cap === undefined) return;
    const keys = Object.keys(log);
    if (keys.length <= cap) return;
    keys.sort((a, b) => log[a]! - log[b]!);
    for (const k of keys.slice(0, keys.length - cap)) delete log[k];
  }

  function stamp(lang: VocabLang, key: string): void {
    const store = read();
    const log: LangLog = { ...(store.langs[lang] ?? {}) };
    // Szigorúan növekvő időbélyeg: azonos ms-on belüli jelölések sorrendje is egyértelmű („legrégebben látott”).
    let max = -Infinity;
    for (const v of Object.values(log)) if (v > max) max = v;
    log[key] = Math.max(now(), max + 1);
    trim(log, caps[lang]);
    write({ v: 1, langs: { ...store.langs, [lang]: log } });
  }

  function get(lang: VocabLang, key: string): number | undefined {
    return read().langs[lang]?.[key];
  }

  return {
    has: (lang, entryId) => get(lang, entryId) !== undefined,
    lastSeen: (lang, entryId) => get(lang, entryId),
    mark: (lang, entryId) => stamp(lang, entryId),
    markExternal: (lang, text) => {
      if (normalizeTerm(text)) stamp(lang, externalKey(text));
    },
    hasExternal: (lang, text) => get(lang, externalKey(text)) !== undefined,
    setCap: (lang, bankSize) => {
      const cap = Math.max(0, Math.floor(bankSize));
      caps[lang] = cap;
      const store = read();
      const log = store.langs[lang];
      if (log && Object.keys(log).length > cap) {
        const next = { ...log };
        trim(next, cap);
        write({ v: 1, langs: { ...store.langs, [lang]: next } });
      }
    },
    size: lang => Object.keys(read().langs[lang] ?? {}).length,
    // Másolás nélkül: minden írás új napló-objektumot épít (copy-on-write), így a visszaadott példány nem változik.
    snapshot: lang => read().langs[lang] ?? {},
  };
}
