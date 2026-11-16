/**
 * Egy párbaj-meccs időzített állapotgépe (JM1: az egyeszközös Párbaj aréna motorja; terv 10.5).
 *
 * Tiszta reducer injektált idővel: `reduceMatch(state, event, config) → { state, effects }`. Az időt (ms, monoton, a
 * szünet alatt álló „meccs-óra”) a hívó adja; a motor maga MÉRI a válaszidőt (`nowMs − openedAtMs`) — ez a terv
 * „szerver mérése az elsődleges” szabályának helyi megfelelője: a kliens / bemenet által állított idő (`clientRtMs`, pl. az
 * érintés lenyomásának pillanata) csak az `inputSlackMs` kereten belül (≤ 400 ms) térhet el lefelé (`acceptedTimeMs`).
 * Azonos konfiguráció + azonos esemény-sorozat → azonos állapot és effekt-sorozat (determinizmus, J19).
 *
 * Fázisok: `ready` → `countdown` (3-2-1) → [`intro` (a kör felvezetése; döntő körnél hosszabb) → `question` → `reveal`]×n
 * → `finished`. Események: `start`, `tick`, `answer`. Az online szoba (JM2) saját `room-machine`-t kap; ez a modul a
 * szabálymotort (`rules.ts`) és a kérdés-szolgáltatót köti össze egy eszközön.
 */
import {
  DUEL_ROUNDS,
  MAX_LATENCY_SLACK_MS,
  acceptedTimeMs,
  aliveOf,
  applyRound,
  createDuel,
  scoreRound,
  verdict,
  type DuelAnswer,
  type DuelRoundOutcome,
  type DuelState,
  type DuelVerdict,
} from "./rules";
import type { DuelQuestion } from "./questions";

export type MatchPhase = "ready" | "countdown" | "intro" | "question" | "reveal" | "finished";

export type MatchTiming = {
  /** A meccs eleji visszaszámlálás (3-2-1). */
  countdownMs: number;
  /** Rendes kör felvezetése („3. kör”). */
  introMs: number;
  /** Döntő kör felvezetése („Döntő kérdés!”). */
  tiebreakIntroMs: number;
  /** A helyes válasz + magyarázat kijelzése a kör után (≥ 2 s, terv JM1 4. lépés). */
  revealMs: number;
};

export const DEFAULT_MATCH_TIMING: MatchTiming = { countdownMs: 3000, introMs: 1400, tiebreakIntroMs: 2400, revealMs: 3500 };

export type MatchPlayer = { id: string; grade: number };

/** A kör kérdése egy játékosnak; determinisztikusnak kell lennie (seed + kör + játékos). `null` = elfogyott. */
export type MatchQuestionProvider = (round: number, player: MatchPlayer) => DuelQuestion | null;

export type MatchConfig = {
  players: readonly MatchPlayer[];
  provider: MatchQuestionProvider;
  timing?: Partial<MatchTiming>;
  /**
   * A bemenet által állított idő (`clientRtMs`) legfeljebb ennyivel lehet kevesebb a motor mérésénél; plafon
   * `MAX_LATENCY_SLACK_MS`. Egy eszközön ez a lenyomás → felengedés kerete (alap 150 ms).
   */
  inputSlackMs?: number;
};

export const DEFAULT_INPUT_SLACK_MS = 150;

export type MatchAnswer = {
  optionIndex: number;
  /** A beérkezés a meccs-órán. */
  atMs: number;
  /** A motor mérése: beérkezés − kör megnyitása. */
  measuredMs: number;
  acceptedMs: number;
  suspicious: boolean;
  correct: boolean;
};

export type MatchState = {
  phase: MatchPhase;
  /** A jelenlegi fázis kezdete a meccs-órán. */
  phaseStartMs: number;
  duel: DuelState;
  /** Az aktuális / utolsó kör sorszáma (1-től); `ready` / `countdown` alatt 0. */
  roundNo: number;
  isTiebreak: boolean;
  /** Az aktuális kör kérdése játékosonként (az élőknek). */
  questions: Record<string, DuelQuestion>;
  openedAtMs: number;
  answers: Record<string, MatchAnswer | null>;
  /** Az utolsó kiértékelt kör (a `reveal` és utána). */
  lastOutcome: DuelRoundOutcome | null;
  /** Az utolsó kör válaszai (a `reveal` kijelzéshez). */
  lastAnswers: DuelAnswer[];
  /** A kör utáni ítélet (a `reveal` és a `finished` alatt). */
  verdict: DuelVerdict | null;
  /** Igaz, ha a meccs azért ért véget, mert a kérdésforrás elfogyott. */
  exhausted: boolean;
  /** Az utoljára kijelzett visszaszámláló-érték (3, 2, 1). */
  countdownShown: number;
};

export type MatchRejectCode = "NOT_OPEN" | "UNKNOWN_PLAYER" | "ALREADY_ANSWERED" | "ROUND_CLOSED" | "BAD_OPTION";

export type MatchEvent =
  | { type: "start"; nowMs: number }
  | { type: "tick"; nowMs: number }
  /** `clientRtMs`: a bemenet állítása (pl. a lenyomás pillanata − a kör megnyitása); a motor a saját mérésével korlátozza. */
  | { type: "answer"; playerId: string; optionIndex: number; nowMs: number; clientRtMs?: number | null };

export type MatchEffect =
  | { type: "countdown"; secondsLeft: number }
  | { type: "intro"; round: number; tiebreak: boolean }
  | { type: "open"; round: number }
  | { type: "locked"; playerId: string }
  | { type: "rejected"; playerId: string; code: MatchRejectCode }
  | { type: "reveal"; round: number; outcome: DuelRoundOutcome }
  | { type: "finished"; verdict: DuelVerdict };

export function matchTiming(config: MatchConfig): MatchTiming {
  const t = { ...DEFAULT_MATCH_TIMING, ...config.timing };
  for (const k of Object.keys(t) as (keyof MatchTiming)[]) {
    if (!Number.isFinite(t[k]) || t[k] < 0) throw new RangeError(`match timing: ${k} ≥ 0 kell`);
  }
  return t;
}

export function createMatch(config: MatchConfig): MatchState {
  matchTiming(config);
  const duel = createDuel(config.players.map((p) => p.id));
  return {
    phase: "ready",
    phaseStartMs: 0,
    duel,
    roundNo: 0,
    isTiebreak: false,
    questions: {},
    openedAtMs: 0,
    answers: {},
    lastOutcome: null,
    lastAnswers: [],
    verdict: null,
    exhausted: false,
    countdownShown: 0,
  };
}

function slackOf(config: MatchConfig): number {
  const s = config.inputSlackMs ?? DEFAULT_INPUT_SLACK_MS;
  return Number.isFinite(s) ? Math.min(MAX_LATENCY_SLACK_MS, Math.max(0, s)) : 0;
}

/** A leghosszabb élő válaszablak vége a meccs-órán (a kör ekkor mindenképp zárul). */
export function roundDeadlineMs(s: MatchState): number {
  let maxWin = 0;
  for (const id of aliveOf(s.duel)) maxWin = Math.max(maxWin, s.questions[id]?.windowMs ?? 0);
  return s.openedAtMs + maxWin;
}

/** A játékos saját ablakának vége a meccs-órán. */
export function playerDeadlineMs(s: MatchState, playerId: string): number {
  return s.openedAtMs + (s.questions[playerId]?.windowMs ?? 0);
}

function enterIntro(s: MatchState, atMs: number, effects: MatchEffect[]): MatchState {
  const roundNo = s.duel.round + 1;
  const isTiebreak = s.duel.round >= DUEL_ROUNDS;
  effects.push({ type: "intro", round: roundNo, tiebreak: isTiebreak });
  return { ...s, phase: "intro", phaseStartMs: atMs, roundNo, isTiebreak, questions: {}, answers: {} };
}

/** Kérdésforrás kimerülése: a meccs a jelenlegi állással zárul (vezető győz, holtversenyben közös győzelem). */
function finishExhausted(s: MatchState, atMs: number, effects: MatchEffect[]): MatchState {
  const v = verdict(s.duel);
  const leaders = v.podium[0] ?? [];
  const final: DuelVerdict = v.finished ? v : { finished: true, needTiebreak: false, winners: leaders.slice(), coWin: leaders.length > 1, podium: v.podium };
  effects.push({ type: "finished", verdict: final });
  return { ...s, phase: "finished", phaseStartMs: atMs, verdict: final, exhausted: true };
}

function openQuestion(s: MatchState, atMs: number, config: MatchConfig, effects: MatchEffect[]): MatchState {
  const questions: Record<string, DuelQuestion> = {};
  const answers: Record<string, MatchAnswer | null> = {};
  for (const id of aliveOf(s.duel)) {
    const player = config.players.find((p) => p.id === id)!;
    const q = config.provider(s.roundNo, player);
    if (!q || !(q.windowMs > 0) || q.options.length < 2) return finishExhausted(s, atMs, effects);
    questions[id] = q;
    answers[id] = null;
  }
  effects.push({ type: "open", round: s.roundNo });
  return { ...s, phase: "question", phaseStartMs: atMs, openedAtMs: atMs, questions, answers };
}

function closeRound(s: MatchState, atMs: number, effects: MatchEffect[]): MatchState {
  const alive = aliveOf(s.duel);
  const answers: DuelAnswer[] = alive.map((id) => {
    const a = s.answers[id];
    const windowMs = s.questions[id]!.windowMs;
    return a ? { playerId: id, correct: a.correct, acceptedMs: a.acceptedMs, windowMs } : { playerId: id, correct: false, acceptedMs: null, windowMs };
  });
  const outcome = scoreRound(answers, alive);
  const duel = applyRound(s.duel, outcome, answers);
  const v = verdict(duel);
  effects.push({ type: "reveal", round: s.roundNo, outcome });
  return { ...s, phase: "reveal", phaseStartMs: atMs, duel, lastOutcome: outcome, lastAnswers: answers, verdict: v };
}

function allAnswered(s: MatchState): boolean {
  return aliveOf(s.duel).every((id) => s.answers[id] != null);
}

/** Az időzített átmenetek a `nowMs`-ig (egy nagy ugrás több fázison is átléphet; a köztes időpontok pontosak). */
function advance(s: MatchState, nowMs: number, config: MatchConfig, effects: MatchEffect[]): MatchState {
  const t = matchTiming(config);
  let cur = s;
  for (let guard = 0; guard < 64; guard++) {
    if (cur.phase === "countdown") {
      const left = Math.max(0, Math.ceil((cur.phaseStartMs + t.countdownMs - nowMs) / 1000));
      if (left > 0 && left < cur.countdownShown) {
        effects.push({ type: "countdown", secondsLeft: left });
        cur = { ...cur, countdownShown: left };
      }
      if (nowMs < cur.phaseStartMs + t.countdownMs) return cur;
      cur = enterIntro(cur, cur.phaseStartMs + t.countdownMs, effects);
    } else if (cur.phase === "intro") {
      const end = cur.phaseStartMs + (cur.isTiebreak ? t.tiebreakIntroMs : t.introMs);
      if (nowMs < end) return cur;
      cur = openQuestion(cur, end, config, effects);
    } else if (cur.phase === "question") {
      const end = roundDeadlineMs(cur);
      if (nowMs < end) return cur;
      cur = closeRound(cur, end, effects);
    } else if (cur.phase === "reveal") {
      const end = cur.phaseStartMs + t.revealMs;
      if (nowMs < end) return cur;
      if (cur.verdict?.finished) {
        effects.push({ type: "finished", verdict: cur.verdict });
        return { ...cur, phase: "finished", phaseStartMs: end };
      }
      cur = enterIntro(cur, end, effects);
    } else {
      return cur;
    }
  }
  return cur;
}

export function reduceMatch(state: MatchState, event: MatchEvent, config: MatchConfig): { state: MatchState; effects: MatchEffect[] } {
  const effects: MatchEffect[] = [];
  const nowMs = Number.isFinite(event.nowMs) ? event.nowMs : state.phaseStartMs;
  if (event.type === "start") {
    if (state.phase !== "ready") return { state, effects };
    const t = matchTiming(config);
    const secs = Math.ceil(t.countdownMs / 1000);
    let s: MatchState = { ...state, phase: "countdown", phaseStartMs: nowMs, countdownShown: secs };
    if (secs > 0) effects.push({ type: "countdown", secondsLeft: secs });
    s = advance(s, nowMs, config, effects);
    return { state: s, effects };
  }
  // A kör zárása előbb (időtúllépés), utána a válasz — így az ablakon túli válasz `ROUND_CLOSED`.
  let s = advance(state, nowMs, config, effects);
  if (event.type === "tick") return { state: s, effects };

  const { playerId } = event;
  const reject = (code: MatchRejectCode) => {
    effects.push({ type: "rejected", playerId, code });
    return { state: s, effects };
  };
  if (!s.duel.players.includes(playerId)) return reject("UNKNOWN_PLAYER");
  if (s.phase !== "question" || !(playerId in s.answers)) return reject(s.phase === "reveal" ? "ROUND_CLOSED" : "NOT_OPEN");
  if (s.answers[playerId] != null) return reject("ALREADY_ANSWERED");
  const q = s.questions[playerId]!;
  if (!Number.isInteger(event.optionIndex) || event.optionIndex < 0 || event.optionIndex >= q.options.length) return reject("BAD_OPTION");
  const at = Math.max(nowMs, s.openedAtMs);
  if (at > playerDeadlineMs(s, playerId)) return reject("ROUND_CLOSED");
  const measuredMs = at - s.openedAtMs;
  const acc = acceptedTimeMs(event.clientRtMs, measuredMs, slackOf(config));
  const answer: MatchAnswer = {
    optionIndex: event.optionIndex,
    atMs: at,
    measuredMs,
    acceptedMs: acc.acceptedMs,
    suspicious: acc.suspicious,
    correct: event.optionIndex === q.correctIndex,
  };
  s = { ...s, answers: { ...s.answers, [playerId]: answer } };
  effects.push({ type: "locked", playerId });
  if (allAnswered(s)) s = closeRound(s, at, effects);
  return { state: s, effects };
}
