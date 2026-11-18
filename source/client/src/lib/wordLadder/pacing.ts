/**
 * Szólétra — tempó és olvasásalapú válaszablak (tulajdonosi visszajelzés 2026-11-17: „túl gyors, el sem tudom olvasni …
 * adj több időt”; terv docs/specs/2026-11-17-szoletra-olvashatosag.md, A–C döntés).
 *
 * Tiszta modul (nincs DOM, React, óra, `Math.random`): a lap (`P/WordLadderHuEn.tsx`) és a szimuláció (`./sim.ts`)
 * UGYANEZT hívja (K.6, átmeneti kapu 3(d)).
 *
 * - A válaszablak = tájékozódás + a TELJES olvasnivaló (prompt + MINDEN válasz, teljes súllyal — a gyerek minden
 *   kapaszkodót végigolvas) az évfolyam olvasási sebességével + döntési idő. A közös `windowMsFor` / `readingMsFor`
 *   szerződése változatlan (más játékok is használják): a „Gyors” tempó pontosan a mostani (közös) ablak, a többi a
 *   Szólétra saját képlete. A közös director 9 mp-es felső korlátja (`WINDOW_MAX_MS` / `READING_WINDOW_CAP_MS`) ezt
 *   nem engedné — ezért a lap a director presentation-jét a `paceDirector`-ral burkolja (a director maga nem változik).
 * - Az óra csak az előjelzés (`LEAD_IN_MS`, KSZ-11 ≥ 400 ms) után indul: addig a kérdés és a fogások látszanak, de a
 *   fogás még nem élesített (véletlen válasz ellen, átmeneti kapu 3(a)).
 * - A rivális tempója a tempótól és az évfolyamtól függ, a kérdés alatt lassít (`slowMo`).
 */
import { READING_WINDOW_CAP_MS, readingMsFor, readingWpm, wordsOf } from "../../game-engine/play/reading";
import { windowMsFor, type QuestionDirector } from "../../game-engine/play/questionDirector";
import type { QuestionPresentation } from "../../game-engine/play/types";

export type LadderTempo = "calm" | "normal" | "fast";
export const LADDER_TEMPOS: readonly LadderTempo[] = ["calm", "normal", "fast"];
/** Alapérték: NYUGODT (orkesztrátori döntés C, 2026-11-17). */
export const DEFAULT_LADDER_TEMPO: LadderTempo = "calm";
export const LADDER_TEMPO_LABELS: Record<LadderTempo, string> = { calm: "Nyugodt", normal: "Normál", fast: "Gyors" };
export const LADDER_TEMPO_STORAGE_KEY = "websuli.wordladder.tempo";

/** A közös director rövid tétel alap ablaka (a „Gyors” tempó = a mostani viselkedés). */
export const LADDER_BASE_WINDOW_MS = 4500;
/**
 * Hibás / lejárt válasz utáni megoldás-kijelzés (a közös sáv `revealWrongMs`-e; terv B, SZ-8): minden tempón 3 s. A közös
 * `usePlayQuestion` a kérdés-sávot egyszer hozza létre, így a kijelzés hossza menet közben nem váltható tempónként.
 */
export const LADDER_REVEAL_WRONG_MS = 3000;
/** Előjelzés: a kérdés és a fogások ennyi ideig látszanak, mielőtt az óra elindul és a fogás élesedik (KSZ-11). */
export const LEAD_IN_MS = 600;

type TempoParams = {
  /** A közös `readingWpm` szorzója (a Szólétra-olvasás lassabb: minden válasz végigolvasandó). */
  wpmFactor: number;
  /** Tájékozódás: a szem megtalálja a kártyát és a célszót. */
  orientMs: number;
  /** Döntés a végigolvasás után; 3–4. évfolyamon `decideYoungMs`. */
  decideMs: number;
  decideYoungMs: number;
  /** Az ablak legalább a mostani (közös) ablak ennyiszerese. */
  floorFactor: number;
  capMs: number;
  /** A rivális egy fokra jutó ideje (mp) az 1. pályán, évfolyam-sávonként: [3–4, 5–6, 7–8, 9–12]. */
  rivalSecPerRung: readonly [number, number, number, number];
  /** Pályánként ennyivel gyorsabb a rivális (mp / fok). */
  rivalLevelSpeedup: number;
  /** A világ (a rivális) szorzója nyitott kérdés alatt (a közös director `slowMo`-ja, 0,35..1). */
  slowMo: number;
  /** A fal magasságának szorzója (`ladderWallRungs`). */
  wallFactor: number;
  /** A szabad fogás (kérdés nélkül) ütemének szorzója a régihez képest (`ladderFreeGripMs`). */
  freeGripFactor: number;
};

const TEMPO: Record<LadderTempo, TempoParams> = {
  calm: {
    wpmFactor: 0.45,
    orientMs: 1500,
    decideMs: 4500,
    decideYoungMs: 5000,
    floorFactor: 2,
    capMs: 40_000,
    rivalSecPerRung: [7.5, 7, 6.6, 6.8],
    rivalLevelSpeedup: 0.08,
    slowMo: 0.35,
    wallFactor: 0.55,
    freeGripFactor: 1.25,
  },
  normal: {
    wpmFactor: 0.65,
    orientMs: 1000,
    decideMs: 3000,
    decideYoungMs: 3500,
    floorFactor: 1.4,
    capMs: 25_000,
    rivalSecPerRung: [6.9, 6.6, 6.4, 6.5],
    rivalLevelSpeedup: 0.08,
    slowMo: 0.5,
    wallFactor: 0.75,
    freeGripFactor: 1.15,
  },
  // A mostani (2026-11-17 előtti) tempó: a közös ablak, 6,3 s / fok, 0,1 s / pálya gyorsulás, a kérdés alatt teljes sebesség.
  fast: {
    wpmFactor: 1,
    orientMs: 0,
    decideMs: 0,
    decideYoungMs: 0,
    floorFactor: 1,
    capMs: READING_WINDOW_CAP_MS,
    rivalSecPerRung: [6.3, 6.3, 6.3, 6.3],
    rivalLevelSpeedup: 0.1,
    slowMo: 1,
    wallFactor: 1,
    freeGripFactor: 1,
  },
};

export function isLadderTempo(v: unknown): v is LadderTempo {
  return v === "calm" || v === "normal" || v === "fast";
}

export function tempoParams(tempo: LadderTempo): Readonly<TempoParams> {
  return TEMPO[isLadderTempo(tempo) ? tempo : DEFAULT_LADDER_TEMPO];
}

function gradeBand(grade: number | null): 0 | 1 | 2 | 3 {
  if (grade === null || !Number.isFinite(grade)) return 1;
  if (grade <= 4) return 0;
  if (grade <= 6) return 1;
  if (grade <= 8) return 2;
  return 3;
}

/** A mostani (közös) ablak: a director `readingAware` képlete — ez a „Gyors” tempó és a többi padlója. */
export function sharedWindowMs(prompt: string, options: readonly string[], grade: number | null): number {
  const base = windowMsFor(prompt, grade, LADDER_BASE_WINDOW_MS);
  return Math.min(READING_WINDOW_CAP_MS, Math.max(base, readingMsFor(prompt, options, grade)));
}

/** A teljes olvasnivaló (prompt + minden válasz, teljes súllyal) ideje ms-ban az adott olvasási sebességgel. */
export function fullReadMs(prompt: string, options: readonly string[], wpm: number): number {
  const words = wordsOf(prompt) + options.reduce((n, o) => n + wordsOf(o), 0);
  return Math.round((words / Math.max(1, wpm)) * 60_000);
}

/** A Szólétra olvasási sebessége (szó / perc) a tempóban. */
export function ladderWpm(grade: number | null, tempo: LadderTempo): number {
  return readingWpm(grade) * tempoParams(tempo).wpmFactor;
}

/**
 * A Szólétra válaszablaka (ms): „Gyors” = a közös ablak; a többi = tájékozódás + teljes olvasás + döntés, legalább a közös
 * ablak `floorFactor`-szorosa, legfeljebb `capMs`. Monoton a szöveg hosszában és (azonos szövegnél) csökkenő az évfolyammal.
 */
export function ladderWindowMs(q: { prompt: string; options: readonly string[]; grade: number | null; tempo: LadderTempo }): number {
  const shared = sharedWindowMs(q.prompt, q.options, q.grade);
  if (q.tempo === "fast") return shared;
  const t = tempoParams(q.tempo);
  const young = q.grade !== null && q.grade <= 4;
  const read = t.orientMs + fullReadMs(q.prompt, q.options, ladderWpm(q.grade, q.tempo)) + (young ? t.decideYoungMs : t.decideMs);
  return Math.round(Math.min(t.capMs, Math.max(read, shared * t.floorFactor)));
}

function safeLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(10, Math.max(1, Math.round(level))) : 1;
}

/** A rivális egy fokra jutó ideje (mp) a pályán, az évfolyamon és a tempóban. */
export function ladderRivalSecPerRung(level: number, grade: number | null, tempo: LadderTempo): number {
  const t = tempoParams(tempo);
  return t.rivalSecPerRung[gradeBand(grade)] - t.rivalLevelSpeedup * (safeLevel(level) - 1);
}

/** A régi rivális-tempó 1. pályán (mp / fok) — a szabad fogás ütemének viszonyítási alapja. */
const FAST_SEC_PER_RUNG = 6.3;

/**
 * Szabad fogás (kérdés nélkül, terv 8.1) ütemezése a tempóban: a régi `FREE_GRIP_COOLDOWN_MS` a rivális lassulásával
 * arányosan nő — különben kérdés nélkül könnyebb nyerni, mint kérdéssel (a kérdés ne legyen hátrány).
 */
export function ladderFreeGripMs(baseCooldownMs: number, level: number, grade: number | null, tempo: LadderTempo): number {
  return Math.round(baseCooldownMs * tempoParams(tempo).freeGripFactor * (ladderRivalSecPerRung(level, grade, tempo) / (FAST_SEC_PER_RUNG - 0.1 * (safeLevel(level) - 1))));
}

/**
 * A fal magassága a tempóban (fok): a nyugodtabb tempóban percenként kevesebb kérdés fér a menetbe, ezért a fal arányosan
 * alacsonyabb — így a menet hossza percben a régi 2–5 perces sávban marad (terv J9), és nem nyúlik el.
 */
export function ladderWallRungs(rungs: number, tempo: LadderTempo): number {
  const base = Number.isFinite(rungs) ? Math.max(1, Math.round(rungs)) : 1;
  return Math.max(8, Math.round(base * tempoParams(tempo).wallFactor));
}

/**
 * A menet-XP szorzója a tempóban (terv C): a rövidebb nyugodt falon kevesebb kérdés fér a menetbe, ezért a helyes válasz
 * XP-je a fal-szorzó reciprokával nő — így a menet-XP (ranglista) nem bünteti a nyugodt tempót. Gyors: 1.
 */
export function ladderXpScale(tempo: LadderTempo): number {
  return 1 / tempoParams(tempo).wallFactor;
}

/**
 * A director presentation-jének burkolása a Szólétra tempójára: az óra az előjelzés után indul (`startedAtSimMs` +
 * `LEAD_IN_MS`), az ablak a `ladderWindowMs`. A director állapota és kimenete változatlan (a válasz / lejárat valós
 * kérdés-órával megy be — a menet-statisztika valós időt mér). A burkolt objektum kérdésenként egy (azonos identitás).
 * A tempót minden új kérdésnél a `tempo()` adja (a szünet menüben váltva a következő kérdéstől érvényes).
 */
export function paceDirector(base: QuestionDirector, opts: { grade: () => number | null; tempo: () => LadderTempo }): QuestionDirector {
  let last: { src: QuestionPresentation; paced: QuestionPresentation } | null = null;
  const pace = (p: QuestionPresentation | null): QuestionPresentation | null => {
    if (!p) return null;
    if (last && last.src === p) return last.paced;
    const windowMs = ladderWindowMs({ prompt: p.question.quiz.prompt, options: p.options.map((o) => o.label), grade: opts.grade(), tempo: opts.tempo() });
    const paced: QuestionPresentation = { ...p, startedAtSimMs: p.startedAtSimMs + LEAD_IN_MS, windowMs };
    last = { src: p, paced };
    return paced;
  };
  return {
    ...base,
    tick: (now, ctx) => pace(base.tick(now, ctx)),
    request: (reason, now) => pace(base.request(reason, now)),
    active: () => pace(base.active()),
  };
}

/** Az élesítés pillanata: a fogás ettől számít válasznak (előtte a koppintás hatástalan). */
export function armedAt(p: Pick<QuestionPresentation, "startedAtSimMs">): number {
  return p.startedAtSimMs;
}

type TempoStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): TempoStorage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** A tárolt tempó; ismeretlen / hiányzó / hibás tárolás → NYUGODT. */
export function loadLadderTempo(storage: TempoStorage | null = browserStorage()): LadderTempo {
  try {
    const raw = storage?.getItem(LADDER_TEMPO_STORAGE_KEY);
    return isLadderTempo(raw) ? raw : DEFAULT_LADDER_TEMPO;
  } catch {
    return DEFAULT_LADDER_TEMPO;
  }
}

export function saveLadderTempo(tempo: LadderTempo, storage: TempoStorage | null = browserStorage()): void {
  try {
    if (isLadderTempo(tempo)) storage?.setItem(LADDER_TEMPO_STORAGE_KEY, tempo);
  } catch {
    /* a tárolás hiánya nem állíthatja meg a játékot */
  }
}
