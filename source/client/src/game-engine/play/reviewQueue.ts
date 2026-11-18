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
 * Az esedékessége után 60 nappal (`REVIEW_STALE_MS`) még ott lévő tétel kikerül. A sor KÖZÖS a hét játékban: a más
 * játék tételét a director a menetre átugorja (`questionDirector.ts` `restore`), a sorban hagyja.
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
/**
 * Elavulás: az esedékesség után ennyi idővel a tétel kikerül (betöltéskor és minden íráskor). A leghosszabb térköz 21 nap;
 * 60 napig egyik játék sem vette elő → más játék elhagyott tétele vagy a bankból törölt (visszaállíthatatlan) tétel.
 */
export const REVIEW_STALE_MS = 60 * 86_400_000;
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
  /**
   * J4a (additív, review #451): a tétel évfolyama (3–12).
   * - szám: ehhez az évfolyamhoz kötött;
   * - null: a rögzítő tudatosan évfolyamtól függetlennek rögzítette (nem adott évfolyamot, és a kulcsból sem fejthető vissza);
   * - hiányzik (undefined): RÉGI, `rev: 2` előtti tétel, amelynek évfolyama a kulcsból sem fejthető vissza — ismeretlen.
   */
  grade?: number | null;
};

/**
 * A tárolt tétel-formátum változata (a `v: 1` boríték megmarad, hogy a régi olvasó se dobja el a sort): `rev: 2` = a
 * tételek `grade` mezőt hordoznak. Hiányzó / régebbi `rev` → betöltéskor `inferReviewGrade` migrál.
 */
export const REVIEW_ITEM_REV = 2;

/** Érvényes évfolyam-e (a játékok 3–12. évfolyamot kínálnak; a tűrés 1–13). */
function validGrade(g: unknown): g is number {
  return typeof g === "number" && Number.isInteger(g) && g >= 1 && g <= 13;
}

/**
 * Migrációs szabály régi tételekre: az évfolyam a kulcsból / azonosítóból, ha az kódolja — évfolyam-bank `g07-math-001`
 * (kulcs `grade:g07-…` vagy payload id), Matek `bank:speed-quiz-math:g7:…`. Különben null (ismeretlen).
 */
export function inferReviewGrade(key: string, payload?: ReviewPayload): number | null {
  const fromId = (s: string): number | null => {
    const m = /(?:^|:)g(\d{1,2})(?:-|:)/.exec(s);
    const g = m ? Number(m[1]) : NaN;
    return validGrade(g) ? g : null;
  };
  return fromId(key) ?? (payload?.kind === "grade" ? fromId(payload.id) : null) ?? (payload?.kind === "quiz" ? fromId(String(payload.quiz.id ?? "")) : null);
}

/**
 * A KÖZÖS évfolyam-szabály (review #451): visszahozható-e az ismétlési tétel egy `grade` évfolyamú menetben.
 * - A játék / menet évfolyam nélküli (`grade` null): igen.
 * - A tétel évfolyama ismert: csak AZONOS évfolyamon (a ±1 nem: a feladat nehézsége az évfolyamhoz kötött, és a hibát az
 *   adott évfolyam tananyagában kell gyakorolni — a másik évfolyamú menetben a tétel a sorban marad a sajátjának).
 * - `grade: null` (rev 2, a rögzítő évfolyamtól függetlennek jelölte): igen.
 * - Ismeretlen évfolyamú RÉGI tétel (`rev: 2` előtt tárolva, `grade` mező nélkül, a kulcsból sem fejthető vissza): csak ha
 *   a játék `legacyFits` ellenőrzése szerint a forrása ma is ugyanezt a tételt adná ezen az évfolyamon; ellenőrzés nélkül
 *   nem tér vissza (a sorban marad, 60 nap után elavul). Szóbank-tétel mindig igen (nyelvhez, nem évfolyamhoz kötött).
 * Új tételnél az évfolyam mindig ismert: a director a menet `config.grade`-jét rögzíti, ha a tétel nem hozott sajátot.
 */
export function reviewFitsGrade(item: ReviewItem, grade: number | null, legacyFits?: (item: ReviewItem) => boolean): boolean {
  if (grade === null || grade === undefined) return true;
  const own = validGrade(item.grade) ? item.grade : inferReviewGrade(item.key, item.payload);
  if (own !== null) return own === grade;
  if (item.grade === null) return true; // rev 2: a rögzítő évfolyamtól függetlennek jelölte
  if (item.payload.kind === "vocab") return true;
  // Régi, ismeretlen évfolyamú tétel: csak a játék ellenőrzésével (a forrása ma is ezt adná-e) — ellenőrizetlenül nem.
  return legacyFits ? legacyFits(item) : false;
}
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

type Stored = { v: 1; rev?: number; items: Record<string, ReviewItem> };

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

function sanitizeItem(key: string, raw: unknown, rev = 1): ReviewItem | null {
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
    // rev 2: tárolt évfolyam; régi tételnél (rev < 2 vagy hiányzó mező) a kulcsból migrálva.
    ...gradeOnLoad(key, payload, it.grade, rev),
  };
}

/** Betöltés: rev ≥ 2 → a tárolt érték (szám vagy null); régi formátum → a kulcsból visszafejtett, különben ismeretlen. */
function gradeOnLoad(key: string, payload: ReviewPayload, stored: unknown, rev: number): { grade?: number | null } {
  if (validGrade(stored)) return { grade: stored };
  const inferred = inferReviewGrade(key, payload);
  if (inferred !== null) return { grade: inferred };
  return rev >= REVIEW_ITEM_REV && stored === null ? { grade: null } : {};
}

function sanitize(raw: unknown): Record<string, ReviewItem> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as { v?: unknown; items?: unknown };
  if (obj.v !== 1 || !obj.items || typeof obj.items !== "object") return {};
  const out: Record<string, ReviewItem> = {};
  for (const [key, value] of Object.entries(obj.items as Record<string, unknown>)) {
    const item = sanitizeItem(key, value, typeof (raw as { rev?: unknown }).rev === "number" ? (raw as { rev: number }).rev : 1);
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
    // Elavult tétel: az esedékessége óta REVIEW_STALE_MS telt el, és egyik játék sem hozta vissza (review #444: más játék
    // tétele, vagy a bankból azóta törölt, végleg visszaállíthatatlan tétel) — ne ragadjon örökre a sorban.
    const staleBefore = now() - REVIEW_STALE_MS;
    for (const k of Object.keys(items)) if (items[k]!.dueAt < staleBefore) delete items[k];
    const keys = Object.keys(items);
    if (keys.length <= cap) return;
    keys.sort((a, b) => items[b]!.box - items[a]!.box || items[a]!.lastSeen - items[b]!.lastSeen || (a < b ? -1 : a > b ? 1 : 0));
    for (const k of keys.slice(0, keys.length - cap)) delete items[k];
  }

  function persist(): void {
    trim();
    if (fallback || !storage) return;
    try {
      const stored: Stored = { v: 1, rev: REVIEW_ITEM_REV, items };
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
          grade: validGrade(q.grade) ? q.grade : validGrade(prev?.grade) ? prev.grade : inferReviewGrade(q.key),
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
