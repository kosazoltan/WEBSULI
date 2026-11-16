/**
 * J0b — térközös ismétlési sor (Leitner, 5 doboz; végrehajtás J0b „Szerződés”; terv 4.1/2, 6.2, 7).
 *
 * Két időskála:
 * - MENETEN BELÜL a kérdés-sorszám számít (`runIndex` = a menetben hányadik kérdésnél tartunk, 0-tól): a hibázott tétel a
 *   3.–6. következő kérdésként esedékes (`dueInRun`, seedelt). Ez determinisztikus — nincs benne óra.
 * - MENETEK KÖZÖTT a naptári idő (`dueAt`, ms): box 0 → azonnal, helyes válasz után 1 → 1 nap, 2 → 3, 3 → 7, 4 → 21 nap.
 *   Az óra a hívó `now`-ja (alap: `wallClockMs`, lásd `clock.ts`).
 *
 * Szabályok:
 * - `record`: wrong / timeout → box 0, `dueAt = now`, `dueInRun = runIndex + 3..6`; correct → box + 1 (legfeljebb 4),
 *   `dueAt = now + BOX_INTERVAL_MS[új box]`, `dueInRun = null`; aborted → semmi. Helyes válasz olyan tételre, amely nincs a
 *   sorban (első látásra tudta), NEM kerül be: a sor a hibázott tételeké.
 * - `dueInRun(i)`: `dueInRun ≤ i` tételek közül a legkorábbi (`dueInRun`, majd `lastSeen`, majd kulcs szerint).
 * - `dueAcrossRuns(now)`: a meneten belül NEM függő (`dueInRun === null`) tételek közül, amelyekre `dueAt ≤ now` (a box 0
 *   tétel `dueAt`-je a hiba ideje, tehát a következő menetben azonnal esedékes); a legkorábban esedékes.
 * - Additív (a szerződésen túl): mindkét lekérdezés kaphat `exclude` kulcshalmazt — a director így hagyja ki a menetben
 *   már kétszer visszatért tételt (terv 6.2: menetenként ≤ 2 visszatérés), és a már feltett kulcsot.
 * - `startRun`: minden `dueInRun` → null (a box 0 tételek innentől `dueAcrossRuns`-ként jönnek).
 *
 * Tárolás: `websuli.gameReview.v1` = `{ v: 1, items: Record<key, ReviewItem> }`, minden változáskor írva. Ismeretlen `v` →
 * üres; sérült JSON, hibás tétel vagy tárolókivétel → memóriában folytatja, kivételt soha nem enged ki (a
 * `GE/vocab/seenHistory.ts` mintájára). A tétel-tartalom vágva: prompt ≤ 300, opció ≤ 120, magyarázat ≤ 400 karakter.
 * Cap (alap 400) felett a legnagyobb box, azon belül a legrégebben látott tétel dobódik (a jól tudott, régi tétel megy).
 */
import type { FourChoiceQuiz } from "@/types/gameQuiz";
import type { VocabLang } from "@/data/vocabBank/types";
import type { StorageLike } from "@/game-engine/vocab";
import { createRng, seedFrom } from "@shared/game-rng";
import { wallClockMs } from "./clock";
import { toRandom, type PlayQuestion, type QuestionResult, type RandomSource } from "./types";

export const GAME_REVIEW_KEY = "websuli.gameReview.v1";
export const REVIEW_CAP = 400;
export const BOX_INTERVAL_MS: readonly [number, number, number, number, number] =
  [0, 86_400_000, 3 * 86_400_000, 7 * 86_400_000, 21 * 86_400_000];
export const PROMPT_MAX = 300;
export const OPTION_MAX = 120;
export const EXPLANATION_MAX = 400;
/** Hibás tétel menet közbeni visszatérése: a 3.–6. következő kérdés. */
export const RETURN_MIN = 3;
export const RETURN_MAX = 6;

export type ReviewBox = 0 | 1 | 2 | 3 | 4;
export type ReviewPayload =
  | { kind: "vocab"; lang: VocabLang; vocabId: string }
  | { kind: "grade"; id: string }
  | { kind: "quiz"; quiz: FourChoiceQuiz; source: "material" | "bank"; subject?: string };
export type ReviewItem = {
  key: string; box: ReviewBox; dueAt: number; dueInRun: number | null; lastSeen: number;
  wrong: number; correct: number; payload: ReviewPayload;
};
export type ReviewQueue = {
  /** Kimenet rögzítése. wrong/timeout → box 0, dueInRun = runIndex + 3..6 (seedelt); correct → box+1, dueAt = now + BOX_INTERVAL_MS[box], dueInRun = null; aborted → nincs változás. */
  record(q: PlayQuestion, result: QuestionResult, runIndex: number): void;
  /** Menet közben esedékes (dueInRun <= runIndex) tétel, a legkorábbi; különben null. */
  dueInRun(runIndex: number, exclude?: ReadonlySet<string>): ReviewItem | null;
  /** Menetek között esedékes (box 0 korábbi menetből, vagy dueAt <= now); a legkorábban esedékes. */
  dueAcrossRuns(now: number, exclude?: ReadonlySet<string>): ReviewItem | null;
  /** Új menet: a korábbi menetek dueInRun értékei null-ra állnak (box 0 tételek dueAcrossRuns-ként jönnek). */
  startRun(): void;
  size(): number;
  snapshot(): readonly ReviewItem[];
};

type Stored = { v: 1; items: Record<string, ReviewItem> };

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** A tárolandó kvíz-pillanatkép, a terv 7. szerinti vágással. */
export function trimQuiz(quiz: FourChoiceQuiz): FourChoiceQuiz {
  return {
    id: cut(String(quiz.id ?? ""), OPTION_MAX),
    prompt: cut(quiz.prompt, PROMPT_MAX),
    options: quiz.options.map((o) => cut(o, OPTION_MAX)),
    correctIndex: quiz.correctIndex,
    ...(quiz.explanation ? { explanation: cut(quiz.explanation, EXPLANATION_MAX) } : {}),
  };
}

/** A tétel-kulcsból (és a kérdésből) a tárolandó tartalom: szóbanknál csak az id, évfolyam-banknál az id, egyébként a kvíz. */
export function payloadFor(q: PlayQuestion): ReviewPayload {
  const vocab = /^vocab:(en|de|fr):(.+)$/.exec(q.key);
  if (vocab) return { kind: "vocab", lang: vocab[1] as VocabLang, vocabId: vocab[2]! };
  if (q.key.startsWith("grade:") && q.key.length > "grade:".length) return { kind: "grade", id: q.key.slice("grade:".length) };
  return {
    kind: "quiz",
    quiz: trimQuiz(q.quiz),
    source: q.key.startsWith("bank:") || q.source === "bank" ? "bank" : "material",
    ...(q.subject ? { subject: q.subject } : {}),
  };
}

function isQuiz(raw: unknown): raw is FourChoiceQuiz {
  if (!raw || typeof raw !== "object") return false;
  const q = raw as Record<string, unknown>;
  return typeof q.prompt === "string" && Array.isArray(q.options) && q.options.length >= 2
    && q.options.every((o) => typeof o === "string")
    && Number.isInteger(q.correctIndex) && (q.correctIndex as number) >= 0 && (q.correctIndex as number) < q.options.length
    && (q.explanation === undefined || typeof q.explanation === "string");
}

function sanitizePayload(raw: unknown): ReviewPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.kind === "vocab" && (p.lang === "en" || p.lang === "de" || p.lang === "fr") && typeof p.vocabId === "string" && p.vocabId) {
    return { kind: "vocab", lang: p.lang, vocabId: p.vocabId };
  }
  if (p.kind === "grade" && typeof p.id === "string" && p.id) return { kind: "grade", id: p.id };
  if (p.kind === "quiz" && (p.source === "material" || p.source === "bank") && isQuiz(p.quiz)) {
    return {
      kind: "quiz",
      quiz: trimQuiz({ ...p.quiz, id: typeof p.quiz.id === "string" ? p.quiz.id : "" }),
      source: p.source,
      ...(typeof p.subject === "string" ? { subject: p.subject } : {}),
    };
  }
  return null;
}

function finiteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function sanitizeItem(key: string, raw: unknown): ReviewItem | null {
  if (!raw || typeof raw !== "object") return null;
  const it = raw as Record<string, unknown>;
  const payload = sanitizePayload(it.payload);
  if (!payload) return null;
  if (!finiteInt(it.box) || !Number.isInteger(it.box) || it.box < 0 || it.box > 4) return null;
  if (!finiteInt(it.dueAt) || !finiteInt(it.lastSeen) || !finiteInt(it.wrong) || !finiteInt(it.correct)) return null;
  return {
    key,
    box: it.box as ReviewBox,
    dueAt: it.dueAt,
    // Tárolt `dueInRun` egy korábbi menethez tartozik: betöltéskor nem függő (a startRun is ezt tenné).
    dueInRun: null,
    lastSeen: it.lastSeen,
    wrong: Math.max(0, Math.trunc(it.wrong)),
    correct: Math.max(0, Math.trunc(it.correct)),
    payload,
  };
}

function sanitize(raw: unknown): Record<string, ReviewItem> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as { v?: unknown; items?: unknown };
  if (obj.v !== 1 || !obj.items || typeof obj.items !== "object") return {};
  const out: Record<string, ReviewItem> = {};
  for (const [key, value] of Object.entries(obj.items as Record<string, unknown>)) {
    const item = sanitizeItem(key, value);
    if (item) out[key] = item;
  }
  return out;
}

export function createReviewQueue(
  storage: StorageLike | null,
  opts?: { now?: () => number; rng?: RandomSource; cap?: number },
): ReviewQueue {
  const now = opts?.now ?? wallClockMs;
  const random = toRandom(opts?.rng ?? createRng(seedFrom("websuli", "gameReview")));
  const cap = Math.max(1, Math.floor(opts?.cap ?? REVIEW_CAP));
  let fallback = storage === null;
  let items: Record<string, ReviewItem> = {};

  if (storage && !fallback) {
    try {
      const raw = storage.getItem(GAME_REVIEW_KEY);
      if (raw !== null) {
        try {
          items = sanitize(JSON.parse(raw));
        } catch (_err) {
          items = {};
        }
      }
    } catch (_err) {
      fallback = true;
    }
  }
  trim();

  function trim(): void {
    const keys = Object.keys(items);
    if (keys.length <= cap) return;
    keys.sort((a, b) => items[b]!.box - items[a]!.box || items[a]!.lastSeen - items[b]!.lastSeen || (a < b ? -1 : a > b ? 1 : 0));
    for (const k of keys.slice(0, keys.length - cap)) delete items[k];
  }

  function persist(): void {
    trim();
    if (fallback || !storage) return;
    try {
      const stored: Stored = { v: 1, items };
      storage.setItem(GAME_REVIEW_KEY, JSON.stringify(stored));
    } catch (_err) {
      fallback = true;
    }
  }

  function earliest(list: ReviewItem[], by: (it: ReviewItem) => number): ReviewItem | null {
    let best: ReviewItem | null = null;
    for (const it of list) {
      if (!best) {
        best = it;
        continue;
      }
      const d = by(it) - by(best) || it.lastSeen - best.lastSeen || (it.key < best.key ? -1 : it.key > best.key ? 1 : 0);
      if (d < 0) best = it;
    }
    return best;
  }

  return {
    record(q, result, runIndex) {
      if (result === "aborted") return;
      const t = now();
      const prev = items[q.key];
      if (result === "correct") {
        if (!prev) return;
        const box = Math.min(4, prev.box + 1) as ReviewBox;
        items[q.key] = { ...prev, box, dueAt: t + BOX_INTERVAL_MS[box], dueInRun: null, lastSeen: t, correct: prev.correct + 1 };
      } else {
        const offset = RETURN_MIN + Math.min(RETURN_MAX - RETURN_MIN, Math.floor(random() * (RETURN_MAX - RETURN_MIN + 1)));
        items[q.key] = {
          key: q.key,
          box: 0,
          dueAt: t,
          dueInRun: Math.max(0, Math.floor(runIndex)) + offset,
          lastSeen: t,
          wrong: (prev?.wrong ?? 0) + 1,
          correct: prev?.correct ?? 0,
          payload: payloadFor(q),
        };
      }
      persist();
    },
    dueInRun(runIndex, exclude) {
      const list = Object.values(items).filter((it) => it.dueInRun !== null && it.dueInRun <= runIndex && !exclude?.has(it.key));
      return earliest(list, (it) => it.dueInRun!);
    },
    dueAcrossRuns(t, exclude) {
      const list = Object.values(items).filter((it) => it.dueInRun === null && it.dueAt <= t && !exclude?.has(it.key));
      return earliest(list, (it) => it.dueAt);
    },
    startRun() {
      let changed = false;
      for (const it of Object.values(items)) {
        if (it.dueInRun !== null) {
          it.dueInRun = null;
          changed = true;
        }
      }
      if (changed) persist();
    },
    size: () => Object.keys(items).length,
    snapshot: () => Object.values(items).map((it) => ({ ...it })),
  };
}
