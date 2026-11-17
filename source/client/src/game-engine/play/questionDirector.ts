/**
 * J0b — kérdés-ütemező (végrehajtás J0b „Szerződés”, K.2 „Kérdés-életciklus”; terv 4.1, 6.2, J2–J4, J6, J7, J10).
 *
 * A játék a saját világában rajzolja a válaszcélokat; a director dönti el, MIKOR jön kérdés, MELYIK tétel, hány opcióval,
 * mekkora ablakkal, és a kimenetet az ismétlési sorba, az áramlat-vezérlőbe és a menet-statisztikába vezeti.
 *
 * IDŐ: a `simNowMs` a KÉRDÉS-óra — ms, a játék szünetében áll, de a kérdés alatti lassítás (`slowMo`) NEM lassítja.
 * Ha a játék a lassított világ-idejét adná át, a 4 mp-es ablak 0,35×-ös lassításnál 11,4 valós mp lenne (a terv J10
 * legfeljebb 9 mp-et enged), és a kérdés/perc is torzulna. `createFixedLoop`-pal: a nem szüneteltetett képkockák valós
 * idejének összege (vagy lépésszám × `SIM_STEP_MS` a timeScale-től függetlenül számolva). Determinisztikus marad, mert
 * a játék ugyanazt az órát adja mindig ugyanabban a lépésben.
 *
 * FORRÁSREND (terv 4.1/5, K.2; a szerződés pontosítása): (1) menet közben esedékes ismétlés → (2) nem látott tananyag
 * (`provider.material`) → (3) menetek között esedékes ismétlés → (4) új tétel (`provider.fresh`, a `band` szerint).
 * - Ismétlés (1 vagy 3) csak akkor jöhet, ha vele együtt az ismétlések aránya a menet BÁRMELY pontján ≤ 30% marad
 *   (a szerződés „legfeljebb minden 3. kérdés (ismétlési arány ≤ 30%)” arány-korlátként; ez átlagban szigorúbb az 1/3-nál).
 *   Merev „két ismétlés között legalább 2 új kérdés” térköz NINCS: azzal a terv 6.2 „hibázottak ≥ 95%-a a 3.–6.
 *   kérdésként” küszöbe matematikailag teljesíthetetlen (két egymás utáni hiba esetén ½ eséllyel az egyik kicsúszik —
 *   levezetés a J0b PR-leírás „Eltérések” részében és a `T/game-question-director.test.ts` (7d) tesztjében).
 * - Menet közben esedékes tételek közül az időben még visszahozható (a hiba + 6. kérdésig) tétel megy előre, a
 *   legkorábbi HATÁRIDŐ szerint; a késő tétel utánuk (terv 6.2: a hibázottak ≥ 95%-a a 3.–6. kérdésként).
 * - Egy tétel menetenként legfeljebb 2-szer tér vissza (menet közbeni ismétlésként); utána a következő menet
 *   menetek közötti soraiba kerül (az ismétlési sor `startRun`-ja nullázza a menet közbeni esedékességet).
 * - Egy menetben ugyanaz a kulcs csak ismétlésként jöhet újra: a tananyag / új tétel, amelynek kulcsa már elhangzott,
 *   kimarad (új tételnél legfeljebb 8 próbálkozás). Kupon módban csak `material()` ad kérdést, ismétlés nincs.
 * - A provider a visszaadott tételt maga jelöli látottnak (pl. `pickUnseenMaterial` + `markGradeQuizSeen`, a szóbank
 *   `next()`-je naplóz); a director egy hívásonként egy tételt kér.
 *
 * ÜTEMEZÉS (a szerződés szerint): célrés a kérdés-INDÍTÁSOK között = 60000 / (targetPerMin × 1,1) × (1 − 0,25 ×
 * intensity), [minGapMs, maxGapMs] közé vágva. A `tick` a bemelegítés (`warmupMs`) után indít, ha a célrés letelt és
 * `ctx.calm`; ha az utolsó kérdés VÉGE (vagy a bemelegítés vége) óta ≥ maxGapMs − 1000 telt el, a calm-tól függetlenül.
 * A `request` a minGap-et tartja (boss: `bossMinGapMs`, rescue: semmit), a bemelegítés alatt is kérhet.
 * Ha egyik forrás sem ad tételt, a `tick` 1 mp-ig nem próbálkozik újra (a játék kérdés nélkül fut — terv 8.1).
 *
 * A director egy menet: létrehozáskor `review.startRun()`-t hív.
 *
 * Használat (vázlat — a játék sim-magjában, lépésenként):
 *
 *   const director = createQuestionDirector({ config, provider, review, rng: createRng(seedFrom(gameId, seed, "q")), startBand });
 *   // minden lépésben:
 *   const p = director.tick(questionClockMs, { calm: intensityDirector.calm() });
 *   if (p) { showTargets(p.options); loop.setTimeScale(p.slowMo); }
 *   // a játékos célpontot választott:
 *   const o = director.answer(p.id, optionIndex, questionClockMs); // második hívás ugyanarra: null
 *   // az ablak lejárt (questionClockMs ≥ p.startedAtSimMs + p.windowMs):
 *   director.expire(questionClockMs);
 */
import type { FourChoiceQuiz } from "@/types/gameQuiz";
import type { VocabLang } from "@/data/vocabBank/types";
import type { GradeQuizItem } from "@/data/gradeQuizBank/types";
import type { VocabQuiz, VocabSource } from "@/game-engine/vocab";
import { normalizePrompt } from "../gradeQuiz";
import { wallClockMs } from "./clock";
import { READING_WINDOW_CAP_MS, readingMsFor } from "./reading";
import { createFlowController, type FlowController } from "./flow";
import { RETURN_MAX, reviewFitsGrade, type ReviewItem, type ReviewQueue } from "./reviewQueue";
import { createRunStats, type RunStatsSnapshot } from "./runStats";
import {
  toRandom,
  type PlayGameId,
  type PlayQuestion,
  type PresentedOption,
  type QuestionOutcome,
  type QuestionPresentation,
  type RandomSource,
} from "./types";

/**
 * J0c-b (additív): a director a `config.promptFits`-et `accept`-ként adja a forrásnak. A forrás a jelöltjei közül az
 * elfogadottat válassza ELŐBB (a többit tegye hátra, ne jelölje látottnak); ha nincs elfogadott, adhat mást is — a sáv
 * akkor is csonkítás nélkül mutatja. A régi (paraméter nélküli) providerek változatlanul működnek.
 */
export type QuestionAcceptCtx = { accept?: (quiz: FourChoiceQuiz) => boolean };

export type QuestionProvider = {
  /** Nem látott tananyag-tétel (a játék meglévő pickUnseenMaterial-ágával). */
  material(ctx?: QuestionAcceptCtx): PlayQuestion | null;
  /** Új tétel a játék meglévő választójával (szóbank / évfolyam-bank / kézi bank), a band szerint. */
  fresh(ctx: { band: number; subject?: string } & QuestionAcceptCtx): PlayQuestion | null;
  /** Ismétlés újraépítése: vocab → VocabSource.questionFor, grade → a bank id-je, quiz → a pillanatkép. */
  restore(item: ReviewItem): PlayQuestion | null;
  /** Kupon mód: csak material() adhat kérdést. */
  couponOnly: boolean;
  /**
   * J4a (additív, review #451): évfolyam nélkül tárolt RÉGI ismétlési tételnél a játék dönti el, hogy a forrása ma is
   * ugyanezt a tételt adná-e a `config.grade` évfolyamon (`reviewFitsGrade` harmadik paramétere). Hiányában az ilyen
   * (nem szóbanki) tétel a J0b-viselkedés szerint visszatérhet.
   */
  legacyReviewFits?: (item: ReviewItem) => boolean;
};
export type DirectorConfig = {
  gameId: PlayGameId;
  optionCount: 3 | 4;
  minGapMs: number;        // terv 6.2: ≥ 1500
  maxGapMs: number;        // terv 6.2 játékonkénti maximum
  targetPerMin: number;    // terv 6.2 játékonkénti küszöb
  baseWindowMs: number;    // rövid tétel alap ablaka (2500..6000)
  slowMo: number;          // 0.35..1
  grade: number | null;
  bossMinGapMs?: number;   // alap 800
  warmupMs?: number;       // alap 10000 — ennyi ideig nincs ütemezett kérdés (trigger lehet)
  /** J0c-b (additív): befér-e / elolvasható-e a tétel a sávban (pl. `fitsAllViewports(q, { grade }).ok`); a forrás `accept`-je. */
  promptFits?: (quiz: FourChoiceQuiz) => boolean;
  /** J0c-b (additív): az ablak = min(9000, max(windowMsFor, a gyerek becsült olvasási ideje)) — `reading.ts`. */
  readingAware?: boolean;
};
export type QuestionDirector = {
  /** Játékidőben hívja a játék; ha az ütemezés szerint kérdés jár ÉS ctx.calm (nincs épp kritikus játékhelyzet vagy maxGap közel), új presentationt ad. */
  tick(simNowMs: number, ctx: { calm: boolean }): QuestionPresentation | null;
  /** A játék kér kérdést (érc elérve, boss-fázis, mentőöv). minGap-et tart (boss: bossMinGapMs), kivéve reason="rescue". */
  request(reason: "trigger" | "boss" | "rescue", simNowMs: number): QuestionPresentation | null;
  active(): QuestionPresentation | null;
  /** Idempotens: második hívás ugyanarra az id-re null. optionIndex a PresentedOption tömb indexe. */
  answer(id: number, optionIndex: number, simNowMs: number): QuestionOutcome | null;
  expire(simNowMs: number): QuestionOutcome | null;
  abort(): QuestionOutcome | null; // kuponlejárat / kilépés
  /** A legutóbbi hibás kimenet a WhyButton-hoz (buildFeedback bemenete). */
  lastWrong(): { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null } | null;
  wrongList(): readonly { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null }[]; // ResultReview
  band(): number;
  intensity(): number;
  stats(simNowMs: number): RunStatsSnapshot;
  flow: FlowController;
};

export const WINDOW_MIN_MS = 2500;
export const WINDOW_MAX_MS = 9000;
export const BASE_WINDOW_MAX_MS = 6000;
export const READING_MS_PER_CHAR = 50;
export const READING_FREE_CHARS = 60;
export const YOUNG_WINDOW_FACTOR = 1.25;
export const MIN_GAP_FLOOR_MS = 1500;
export const DEFAULT_BOSS_MIN_GAP_MS = 800;
export const DEFAULT_WARMUP_MS = 10_000;
/** Az ismétlések aránya legfeljebb 30% a menet bármely pontján (terv 6.2: „legfeljebb minden 3. kérdés”). */
export const REVIEW_SHARE_MAX = 0.3;
/** Egy tétel menetenként legfeljebb ennyiszer tér vissza menet közbeni ismétlésként. */
export const MAX_RETURNS_PER_RUN = 2;
/** A késő visszatérés felső határa: a hiba utáni 10. kérdés (terv 6.2 „a többi ≤ 10 kérdésen belül”). */
export const LATE_RETURN_MAX = 10;
const FRESH_ATTEMPTS = 8;
const EMPTY_BACKOFF_MS = 1000;

/**
 * = min(9000, clamp(baseMs + max(0, len(prompt) − 60) × 50, 2500, 9000) × (grade 3–4 ? 1.25 : 1)) — mindig ≤ 9000 ms.
 * Egész ms-ra kerekítve. Terv 4.1/4, J10: rövid tételnél 2,5–6 mp (3–4. évf. 3,1–7,5), hosszúnál olvasási pótlék, ≤ 9 mp.
 */
export function windowMsFor(prompt: string, grade: number | null, baseMs: number): number {
  const len = typeof prompt === "string" ? prompt.length : 0;
  const base = Number.isFinite(baseMs) ? baseMs : WINDOW_MIN_MS;
  const raw = Math.min(WINDOW_MAX_MS, Math.max(WINDOW_MIN_MS, base + Math.max(0, len - READING_FREE_CHARS) * READING_MS_PER_CHAR));
  const young = grade === 3 || grade === 4;
  return Math.round(Math.min(WINDOW_MAX_MS, raw * (young ? YOUNG_WINDOW_FACTOR : 1)));
}

/** A célrés két kérdés-indítás között (a szerződés képlete). */
export function targetGapMs(config: Pick<DirectorConfig, "targetPerMin" | "minGapMs" | "maxGapMs">, intensity: number): number {
  const i = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  const gap = (60_000 / (config.targetPerMin * 1.1)) * (1 - 0.25 * i);
  return Math.min(config.maxGapMs, Math.max(config.minGapMs, gap));
}

function validateConfig(c: DirectorConfig): void {
  const bad = (msg: string) => {
    throw new RangeError(`questionDirector (${c.gameId}): ${msg}`);
  };
  if (c.optionCount !== 3 && c.optionCount !== 4) bad("optionCount 3 vagy 4");
  if (!(c.minGapMs >= MIN_GAP_FLOOR_MS)) bad(`minGapMs ≥ ${MIN_GAP_FLOOR_MS} (terv 6.2)`);
  if (!(c.maxGapMs >= c.minGapMs)) bad("maxGapMs ≥ minGapMs");
  if (!(c.targetPerMin > 0)) bad("targetPerMin > 0");
  if (!(c.baseWindowMs >= WINDOW_MIN_MS && c.baseWindowMs <= BASE_WINDOW_MAX_MS)) bad("baseWindowMs 2500..6000 (terv 4.1/4)");
  if (!(c.slowMo >= 0.35 && c.slowMo <= 1)) bad("slowMo 0,35..1 (terv 4.1/3)");
  if (c.bossMinGapMs !== undefined && !(c.bossMinGapMs >= 0)) bad("bossMinGapMs ≥ 0");
  if (c.warmupMs !== undefined && !(c.warmupMs >= 0)) bad("warmupMs ≥ 0");
}

function validQuiz(q: FourChoiceQuiz | undefined | null): q is FourChoiceQuiz {
  return !!q && Array.isArray(q.options) && q.options.length >= 2
    && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length;
}

export function createQuestionDirector(opts: {
  config: DirectorConfig; provider: QuestionProvider; review: ReviewQueue; rng: RandomSource;
  startBand: number; now?: () => number;
}): QuestionDirector {
  const { config, provider, review } = opts;
  validateConfig(config);
  const random = toRandom(opts.rng);
  const now = opts.now ?? wallClockMs;
  const warmupMs = config.warmupMs ?? DEFAULT_WARMUP_MS;
  const bossMinGapMs = config.bossMinGapMs ?? DEFAULT_BOSS_MIN_GAP_MS;
  const flow = createFlowController({ startBand: opts.startBand });
  const acceptCtx: QuestionAcceptCtx = config.promptFits ? { accept: config.promptFits } : {};
  const windowFor = (prompt: string, options: readonly PresentedOption[]): number => {
    const base = windowMsFor(prompt, config.grade, config.baseWindowMs);
    if (!config.readingAware) return base;
    const read = readingMsFor(prompt, options.map((o) => o.label), config.grade);
    return Math.min(READING_WINDOW_CAP_MS, Math.max(base, read));
  };
  const runStats = createRunStats({ warmupSec: warmupMs / 1000 });
  review.startRun();

  let nextId = 0;
  /** A menetben eddig feltett kérdések száma = a következő kérdés sorszáma (az ismétlési sor `runIndex`-e). */
  let position = 0;
  let active: { p: QuestionPresentation; position: number } | null = null;
  let lastStartMs: number | null = null;
  let lastEndMs = warmupMs;
  let reviewsAsked = 0;
  let retryAfterMs = Number.NEGATIVE_INFINITY;
  const askedKeys = new Set<string>();
  /** A menetben a provider által vissza nem állítható ismétlési kulcsok (más játék / nyelv tétele). */
  const unrestorable = new Set<string>();
  const returns = new Map<string, number>();
  const lastMissPos = new Map<string, number>();
  const wrongs = new Map<string, { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null }>();
  let lastWrong: { quiz: FourChoiceQuiz; pickedOriginalIndex: number | null } | null = null;
  /** Kupon mód (review #483, M2): a menetben feltett lecke-tételek, a legutóbbi feltevés sorszámával. */
  const couponAsked = new Map<string, { q: PlayQuestion; at: number }>();
  let lastAskedKey: string | null = null;

  /** Ismétlés akkor jöhet, ha vele együtt a menet BÁRMELY pontján az ismétlések aránya ≤ 30% marad. */
  function reviewSlotOpen(): boolean {
    return reviewsAsked + 1 <= REVIEW_SHARE_MAX * (position + 1) + 1e-9;
  }

  /**
   * Menet közben esedékes tételek sorrendje (terv 6.2 mérőszámai szerint):
   * 1. sáv: a még a 3.–6. kérdés-ablakában lévők (hiba + 6. kérdésig); 2. sáv: a késők a hiba + 10. kérdésig („a többi
   *    ≤ 10 kérdésen belül”); 3. sáv: a még későbbiek. A késő tétel így nem veszi el a helyet egy még időben
   *    visszahozhatótól — torlódáskor nem dől dominóként az egész sor.
   * Sávon belül előbb a menetben először visszatérő (az első hibája utáni) tétel, utána a második visszatérés; végül a
   * legkorábbi határidő.
   */
  function inRunCandidates(): ReviewItem[] {
    const capped = new Set<string>();
    for (const [key, n] of returns) if (n >= MAX_RETURNS_PER_RUN) capped.add(key);
    const missAt = (it: ReviewItem) => lastMissPos.get(it.key) ?? it.dueInRun! - RETURN_MAX;
    const tier = (it: ReviewItem) => {
      const late = position - missAt(it);
      return late <= RETURN_MAX ? 0 : late <= LATE_RETURN_MAX ? 1 : 2;
    };
    const rank = (it: ReviewItem) => [tier(it), returns.get(it.key) ?? 0, missAt(it), it.dueInRun!];
    return review
      .snapshot()
      .filter((it) => it.dueInRun !== null && it.dueInRun <= position && !capped.has(it.key) && !unrestorable.has(it.key))
      .map((it) => ({ it, r: rank(it) }))
      .sort((a, b) => a.r[0]! - b.r[0]! || a.r[1]! - b.r[1]! || a.r[2]! - b.r[2]! || a.r[3]! - b.r[3]! || (a.it.key < b.it.key ? -1 : a.it.key > b.it.key ? 1 : 0))
      .map((x) => x.it);
  }

  type Pick = { q: PlayQuestion; isReview: boolean; inRun: boolean };

  function usable(q: PlayQuestion | null): q is PlayQuestion {
    return !!q && typeof q.key === "string" && q.key.length > 0 && validQuiz(q.quiz);
  }

  /**
   * Ismétlés újraépítése. A közös sorban más játék / más nyelv tétele is lehet, amit ez a provider nem tud visszaállítani
   * (review #444): az ilyen kulcs a menet hátralevő részére kimarad, így nem torlaszolja el a mögötte esedékes tételeket.
   */
  function restore(item: ReviewItem): PlayQuestion | null {
    // Közös évfolyam-szabály (review #451): más évfolyam tétele ebben a menetben nem jön vissza — a sorban marad a
    // saját évfolyamú menetének (ugyanúgy átugorva, mint az idegen játék tétele).
    if (!reviewFitsGrade(item, config.grade, provider.legacyReviewFits)) {
      unrestorable.add(item.key);
      return null;
    }
    const q = provider.restore(item);
    if (usable(q) && q.key === item.key) return q;
    unrestorable.add(item.key);
    return null;
  }

  function choose(): Pick | null {
    if (provider.couponOnly) {
      // J1a / review #483 (M2): kupon módban is jár a menet közbeni ismétlés (a hibázott lecke-tétel), és a lecke kimerülése
      // után a menetben legrégebben feltett lecke-tétel jön újra — a kérdés nem fogy el. Csak az aktuális lecke tananyaga:
      // menetek közötti ismétlés itt nincs.
      if (reviewSlotOpen()) {
        for (const item of inRunCandidates()) {
          if (!couponAsked.has(item.key)) continue;
          const q = restore(item);
          if (q) return { q, isReview: true, inRun: true };
        }
      }
      const m = provider.material(acceptCtx);
      if (usable(m) && !askedKeys.has(m.key)) return { q: m, isReview: false, inRun: false };
      let oldest: { q: PlayQuestion; at: number } | null = null;
      for (const [key, entry] of couponAsked) {
        if (couponAsked.size >= 2 && key === lastAskedKey) continue;
        if (!oldest || entry.at < oldest.at) oldest = entry;
      }
      return oldest ? { q: oldest.q, isReview: false, inRun: false } : null;
    }
    const slot = reviewSlotOpen();
    if (slot) {
      for (const item of inRunCandidates()) {
        const q = restore(item);
        if (q) return { q, isReview: true, inRun: true };
      }
    }
    const m = provider.material(acceptCtx);
    if (usable(m) && !askedKeys.has(m.key)) return { q: m, isReview: false, inRun: false };
    if (slot) {
      const skip = new Set([...askedKeys, ...unrestorable]);
      for (let i = 0; i < FRESH_ATTEMPTS; i++) {
        const item = review.dueAcrossRuns(now(), skip);
        if (!item) break;
        skip.add(item.key);
        const q = restore(item);
        if (q) return { q, isReview: true, inRun: false };
      }
    }
    for (let i = 0; i < FRESH_ATTEMPTS; i++) {
      const f = provider.fresh({ band: flow.band(), ...acceptCtx });
      if (!f) break;
      if (usable(f) && !askedKeys.has(f.key)) return { q: f, isReview: false, inRun: false };
    }
    return null;
  }

  function buildOptions(quiz: FourChoiceQuiz): PresentedOption[] {
    const others: number[] = [];
    for (let i = 0; i < quiz.options.length; i++) if (i !== quiz.correctIndex) others.push(i);
    const want = Math.min(config.optionCount, quiz.options.length) - 1;
    // Seedelt részleges Fisher–Yates: az elterelők közül `want` darab.
    for (let i = 0; i < want; i++) {
      const j = i + Math.min(others.length - 1 - i, Math.floor(random() * (others.length - i)));
      [others[i], others[j]] = [others[j]!, others[i]!];
    }
    const picked = [quiz.correctIndex, ...others.slice(0, want)];
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [picked[i], picked[j]] = [picked[j]!, picked[i]!];
    }
    return picked.map((idx) => ({ label: quiz.options[idx]!, originalIndex: idx, correct: idx === quiz.correctIndex }));
  }

  function present(reason: QuestionPresentation["reason"], simNowMs: number): QuestionPresentation | null {
    const pick = choose();
    if (!pick) return null;
    const { q, isReview } = pick;
    nextId += 1;
    const options = buildOptions(q.quiz);
    const p: QuestionPresentation = {
      id: nextId,
      question: q,
      isReview,
      options,
      windowMs: windowFor(q.quiz.prompt, options),
      slowMo: config.slowMo,
      startedAtSimMs: simNowMs,
      reason,
    };
    active = { p, position };
    runStats.onAsk(p, simNowMs);
    askedKeys.add(q.key);
    lastAskedKey = q.key;
    if (provider.couponOnly) couponAsked.set(q.key, { q, at: position });
    if (isReview) {
      reviewsAsked += 1;
      if (pick.inRun) returns.set(q.key, (returns.get(q.key) ?? 0) + 1);
    }
    position += 1;
    lastStartMs = simNowMs;
    return p;
  }

  function finish(result: QuestionOutcome["result"], picked: number | null, endMs: number): QuestionOutcome | null {
    if (!active) return null;
    const { p, position: pos } = active;
    active = null;
    const quiz = p.question.quiz;
    const outcome: QuestionOutcome = {
      id: p.id,
      key: p.question.key,
      result,
      pickedOriginalIndex: picked,
      correctOriginalIndex: quiz.correctIndex,
      responseMs: Math.max(0, endMs - p.startedAtSimMs),
    };
    // Review #451: a tétel évfolyama a menet évfolyama, ha a forrás nem adott sajátot (a közös sor csak azonos
    // évfolyamon hozza vissza — `reviewFitsGrade`).
    const recorded = config.grade !== null && p.question.grade === undefined ? { ...p.question, grade: config.grade } : p.question;
    if (!p.question.noReview) review.record(recorded, result, pos);
    if (result !== "aborted") {
      flow.push({ kind: "answer", correct: result === "correct", responseMs: result === "timeout" ? p.windowMs : outcome.responseMs, windowMs: p.windowMs });
    }
    if (result === "wrong" || result === "timeout") {
      lastMissPos.set(p.question.key, pos);
      lastWrong = { quiz, pickedOriginalIndex: picked };
      wrongs.delete(p.question.key);
      wrongs.set(p.question.key, lastWrong);
    }
    runStats.onOutcome(outcome);
    lastEndMs = Math.max(p.startedAtSimMs, endMs);
    return outcome;
  }

  return {
    tick(simNowMs, ctx) {
      if (active || simNowMs < warmupMs || simNowMs < retryAfterMs) return null;
      const sinceStart = lastStartMs === null ? Number.POSITIVE_INFINITY : simNowMs - lastStartMs;
      const forced = simNowMs - lastEndMs >= config.maxGapMs - 1000 && sinceStart >= config.minGapMs;
      const due = sinceStart >= targetGapMs(config, flow.intensity());
      if (!forced && !(due && ctx.calm)) return null;
      const p = present("scheduled", simNowMs);
      if (!p) retryAfterMs = simNowMs + EMPTY_BACKOFF_MS;
      return p;
    },
    request(reason, simNowMs) {
      if (active) return null;
      if (reason !== "rescue" && lastStartMs !== null) {
        const gap = reason === "boss" ? bossMinGapMs : config.minGapMs;
        if (simNowMs - lastStartMs < gap) return null;
      }
      return present(reason, simNowMs);
    },
    active: () => active?.p ?? null,
    answer(id, optionIndex, simNowMs) {
      if (!active || active.p.id !== id) return null;
      const opt = active.p.options[optionIndex];
      if (!opt) return null;
      return finish(opt.correct ? "correct" : "wrong", opt.originalIndex, simNowMs);
    },
    expire: (simNowMs) => finish("timeout", null, simNowMs),
    abort: () => (active ? finish("aborted", null, active.p.startedAtSimMs) : null),
    lastWrong: () => lastWrong,
    wrongList: () => [...wrongs.values()],
    band: () => flow.band(),
    intensity: () => flow.intensity(),
    stats: (simNowMs) => runStats.snapshot(simNowMs),
    flow,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Forrás-illesztők: a meglévő kérdésforrások → `PlayQuestion`, egységes kulccsal (a játékszeletek providerei ezekkel   */
/* épülnek, hogy az ismétlési sor kulcsa mind a hét játékban azonos legyen).                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

function quizOf(q: FourChoiceQuiz): FourChoiceQuiz {
  return {
    id: q.id,
    prompt: q.prompt,
    options: q.options.slice(),
    correctIndex: q.correctIndex,
    ...(q.explanation ? { explanation: q.explanation } : {}),
  };
}

function idOrPrompt(q: FourChoiceQuiz): string {
  return q.id ? String(q.id) : normalizePrompt(q.prompt);
}

/** Szóbank (`VocabSource.next` / `questionFor`) → kulcs `vocab:<lang>:<vocabId>`, felolvasandó szöveg a célnyelvi szó. */
export function vocabPlayQuestion(q: VocabQuiz): PlayQuestion {
  // Közös utójavítás (#454 / #455 review): a megjelenéskor CSAK a forrás kifejezett, választ el nem áruló `speakText`-je
  // hangzik el (a korábbi „mindig a helyes szó” — `answerTerm` — magyar→cél és hiányos mondat típusnál kimondta a választ);
  // a helyes szó `speakAfter`-ként a kimenetel UTÁN. A mezőket a szóbank-generátor adja (`VocabQuiz.speakText` / `speakAfter`, #455).
  return {
    key: `vocab:${q.lang}:${q.vocabId}`,
    quiz: quizOf(q),
    source: "vocab",
    lang: q.lang,
    ...(q.speakText ? { speakText: q.speakText } : {}),
    ...(q.speakAfter ? { speakAfter: q.speakAfter } : {}),
  };
}

/** Évfolyam-bank (`pickGradeQuiz` / `pickGradeSlotWithVocab` `grade` ága) → kulcs `grade:<id>`. */
export function gradePlayQuestion(item: GradeQuizItem): PlayQuestion {
  return {
    key: `grade:${item.id}`,
    quiz: { id: item.id, prompt: item.prompt, options: item.options.slice(), correctIndex: item.correctIndex, explanation: item.explanation },
    source: "grade",
    subject: item.subject,
    ...(Number.isInteger(item.grade) ? { grade: item.grade } : {}),
  };
}

/** Tananyag-kvíz (`pickUnseenMaterial`) → kulcs `mat:<id vagy normalizePrompt>`; kupon módban `source: "coupon"`. */
export function materialPlayQuestion(quiz: FourChoiceQuiz, opts?: { subject?: string; couponItemId?: string; coupon?: boolean; grade?: number }): PlayQuestion {
  return {
    key: `mat:${idOrPrompt(quiz)}`,
    quiz: quizOf(quiz),
    source: opts?.coupon || opts?.couponItemId ? "coupon" : "material",
    ...(opts?.subject ? { subject: opts.subject } : {}),
    ...(opts?.couponItemId ? { couponItemId: opts.couponItemId } : {}),
    ...(opts?.grade !== undefined && Number.isInteger(opts.grade) ? { grade: opts.grade } : {}),
  };
}

/** A játék saját (kézi) bankja → kulcs `bank:<gameId>:<id vagy normalizePrompt>`. */
export function bankPlayQuestion(gameId: PlayGameId, quiz: FourChoiceQuiz, subject?: string, grade?: number): PlayQuestion {
  return {
    key: `bank:${gameId}:${idOrPrompt(quiz)}`,
    quiz: quizOf(quiz),
    source: "bank",
    ...(subject ? { subject } : {}),
    // J4a (additív, review #451): az évfolyam a tételbe kerül (az ismétlési sor csak azonos évfolyamon hozza vissza).
    ...(grade !== undefined && Number.isInteger(grade) ? { grade } : {}),
  };
}

/**
 * `QuestionProvider.restore` alapvalósítása: vocab → `VocabSource.questionFor` (naplózás nélkül), grade → a bank tétele
 * id alapján, quiz → a tárolt pillanatkép. A kulcs mindig a tárolt kulcs. Hiányzó forrás / ismeretlen id → null.
 */
export function restoreReviewQuestion(
  item: ReviewItem,
  deps: { vocab?: (lang: VocabLang) => VocabSource | null; gradeItem?: (id: string) => GradeQuizItem | null },
): PlayQuestion | null {
  const p = item.payload;
  if (p.kind === "vocab") {
    const q = deps.vocab?.(p.lang)?.questionFor(p.vocabId) ?? null;
    return q ? { ...vocabPlayQuestion(q), key: item.key } : null;
  }
  if (p.kind === "grade") {
    const g = deps.gradeItem?.(p.id) ?? null;
    return g ? { ...gradePlayQuestion(g), key: item.key } : null;
  }
  return {
    key: item.key,
    quiz: quizOf(p.quiz),
    source: p.source,
    ...(p.subject ? { subject: p.subject } : {}),
    ...(typeof item.grade === "number" ? { grade: item.grade } : {}),
  };
}
