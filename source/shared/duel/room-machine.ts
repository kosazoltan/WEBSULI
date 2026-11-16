/**
 * Az online szoba szerver-tekintélyű állapotgépe (JM2; terv 10.5, 10.8; végrehajtás JM-K `room-machine.ts`).
 *
 * Tiszta reducer injektált idővel: `reduceRoom(state, event, nowMs, config) → { state, effects, error? }`. Nincs benne óra,
 * véletlen, hálózat (J19 őr): az időt (szerver epoch-ms) és a meccs titkos seedjét a szerver-réteg adja, az időzítőket a
 * `nextWakeMs()` alapján az futtatja, a hatásokat (`effects`) az küldi ki. A nézetek (`roomStateView`, `roundOpenView`,
 * `revealView`, `resultView`) a protokoll-sémák (`protocol.ts`) szerinti, címzettenként szűrt üzeneteket adják:
 * a helyes index csak a lezárt kör felfedésében szerepel, és játékosról csak becenév / avatar / állapot megy ki.
 *
 * Fázisok: `lobby` → (`start`) `countdown` → [`round_open` → `round_reveal`]×n → `finished` (→ `rematch` → `lobby`);
 * bármely meccs-fázisból a leállítás (`drain` határideje) → `aborted` részeredménnyel. A szoba lezárását a `close` hatás
 * jelzi (üres szoba, lejárt TTL, leállítás).
 */
import {
  DUEL_ROUNDS,
  MAX_LATENCY_SLACK_MS,
  acceptedTimeMs,
  accuracyOf,
  aliveOf,
  applyRound,
  createDuel,
  scoreRound,
  verdict,
  type DuelAnswer,
  type DuelRoundOutcome,
  type DuelState,
} from "./rules";
import { markDuelQuestionUsed, type DuelQuestion } from "./questions";
import {
  RT_MAX_PLAYERS,
  RT_MIN_PLAYERS,
  RT_RECONNECT_GRACE_MS,
  type RtErrorCode,
  type RtGameId,
  type RtMatchResult,
  type RtMode,
  type RtNoticeCode,
  type RtPublicPlayer,
  type RtReveal,
  type RtRoomPhase,
  type RtRoomState,
  type RtServerPayload,
} from "./protocol";

export type RoomPhase = RtRoomPhase;

export type RoomTiming = {
  /** A meccs eleji 3-2-1. */
  countdownMs: number;
  /** A helyes válasz + magyarázat kijelzése a kör után (≥ 2 s). */
  revealMs: number;
  /** A saját ablak után ennyi ideig még elfogadjuk a beérkező választ (hálózati késés); a gyorsaság ettől még az ablakhoz mér. */
  answerGraceMs: number;
  /** A megszakadt játékos helye ennyi ideig marad meg (utána kilépettnek számít). */
  reconnectGraceMs: number;
  /** Tétlen váróterem élettartama. */
  lobbyTtlMs: number;
  /** A befejezett meccs után a visszavágó-ablak. */
  finishedTtlMs: number;
  /** A megszakított meccs eredményének kijelzése a lezárás előtt. */
  abortedTtlMs: number;
  /** Leállítás alatt a befejezett meccs eredményének kijelzése a lezárás előtt. */
  drainCloseMs: number;
};

export const DEFAULT_ROOM_TIMING: RoomTiming = {
  countdownMs: 3000,
  revealMs: 3500,
  answerGraceMs: MAX_LATENCY_SLACK_MS,
  reconnectGraceMs: RT_RECONNECT_GRACE_MS,
  lobbyTtlMs: 15 * 60_000,
  finishedTtlMs: 5 * 60_000,
  abortedTtlMs: 10_000,
  drainCloseMs: 5_000,
};

export type RoomQuestionRequest = {
  seed: string;
  round: number;
  grade: number;
  band: number;
  subjects: readonly string[];
  /** A meccsen (és a visszavágókon) már feltett kulcsok ezen az évfolyamon — a szolgáltató NEM módosítja. */
  used: ReadonlySet<string>;
};

export type RoomConfig = {
  /** A kör kérdése egy játékosnak (determinisztikus: seed + kör + évfolyam + used). `null` = elfogyott. */
  provider: (req: RoomQuestionRequest) => DuelQuestion | null;
  timing?: Partial<RoomTiming>;
};

export type RoomPlayer = {
  /** Szobán belüli, átlátszatlan azonosító (`P` + 10 jel) — nem a fiók / profil azonosítója. */
  id: string;
  nickname: string;
  avatar: string | null;
  grade: number;
  ready: boolean;
  connected: boolean;
  /** Meccs közben kilépett / kiesett a kapcsolat türelmi idején túl: a körei üresen járnak le. */
  left: boolean;
  disconnectedAtMs: number | null;
  /** Csatlakozási sorrend (gazda-váltáshoz: a legrégebben csatlakozott aktív játékos). */
  order: number;
};

export type RoomAnswer = {
  optionIndex: number;
  atMs: number;
  serverRtMs: number;
  acceptedMs: number;
  suspicious: boolean;
  correct: boolean;
};

export type RoomReveal = {
  round: number;
  tiebreak: boolean;
  questions: Record<string, DuelQuestion>;
  answers: Record<string, RoomAnswer>;
  outcome: DuelRoundOutcome;
  hp: Record<string, number>;
  nextAtMs: number | null;
};

export type ResultReason = RtMatchResult["reason"];

export type RoomResult = {
  podium: string[][];
  winners: string[];
  coWin: boolean;
  aborted: boolean;
  reason: ResultReason;
};

export type RoomMatch = {
  ids: string[];
  duel: DuelState;
  roundNo: number;
  tiebreak: boolean;
  openedAtMs: number;
  /** A játékosok SAJÁT ablakának vége (szerveridő). */
  deadlines: Record<string, number>;
  /** A kör kérdései játékosonként (helyes indexszel — SOHA nem megy ki a felfedés előtt). */
  questions: Record<string, DuelQuestion>;
  answers: Record<string, RoomAnswer>;
  lastReveal: RoomReveal | null;
  result: RoomResult | null;
};

export type RoomSettings = { rounds: number; band: number; subjects: string[] };

export type RoomState = {
  code: string;
  gameId: RtGameId;
  mode: RtMode;
  /** A meccs titkos seedje (a szerver véletlenje; a kliens sosem kapja meg, különben a kérdéssor kiszámítható lenne). */
  seed: string;
  settings: RoomSettings;
  phase: RoomPhase;
  phaseStartMs: number;
  lastActivityMs: number;
  /** Az állapotváltozások sorszáma (minden kimenő állapot-üzenet hordozza; a kliens a régebbit eldobja). */
  seq: number;
  hostId: string | null;
  players: RoomPlayer[];
  nextOrder: number;
  /** Évfolyamonként a már feltett kulcsok (a visszavágók között is megmarad). */
  used: Record<string, string[]>;
  /** A visszavágók száma (a seedbe keveredik, így minden meccs új kérdéssort ad). */
  matchNo: number;
  match: RoomMatch | null;
  drainDeadlineMs: number | null;
  closed: boolean;
};

export type RoomEvent =
  | { type: "join"; playerId: string; nickname: string; avatar: string | null; grade: number }
  | { type: "leave"; playerId: string }
  | { type: "disconnect"; playerId: string }
  | { type: "reconnect"; playerId: string }
  | { type: "ready"; playerId: string; ready: boolean }
  | { type: "start"; playerId: string }
  | { type: "answer"; playerId: string; round: number; optionIndex: number; clientRtMs?: number | null; medianRttMs: number }
  | { type: "tick" }
  | { type: "rematch"; playerId: string }
  | { type: "kick"; playerId: string; target: string }
  | { type: "drain"; deadlineMs: number };

export type RoomEffect =
  | { type: "emitState" }
  | { type: "openRound" }
  | { type: "reveal" }
  | { type: "result" }
  /** A meccs vége: a JM8 pontkönyve ide kapcsolódik (a JM2-ben nincs DB-írás). */
  | { type: "persist" }
  | { type: "accepted"; playerId: string }
  | { type: "notice"; code: RtNoticeCode; deadlineMs: number | null; to?: string }
  | { type: "kicked"; playerId: string }
  | { type: "removed"; playerId: string }
  | { type: "close"; reason: "EMPTY" | "EXPIRED" | "SERVER_RESTART" | "FINISHED" };

export type RoomReduceResult = { state: RoomState; effects: RoomEffect[]; error?: RtErrorCode };

export type CreateRoomArgs = {
  code: string;
  gameId: RtGameId;
  mode: RtMode;
  seed: string;
  settings?: Partial<RoomSettings>;
  host: { playerId: string; nickname: string; avatar: string | null; grade: number };
  nowMs: number;
};

const MATCH_PHASES: readonly RoomPhase[] = ["countdown", "round_open", "round_reveal"];

function timingOf(cfg: RoomConfig): RoomTiming {
  return { ...DEFAULT_ROOM_TIMING, ...(cfg.timing ?? {}) };
}

export function createRoom(args: CreateRoomArgs): RoomState {
  const band = args.settings?.band;
  return {
    code: args.code,
    gameId: args.gameId,
    mode: args.mode,
    seed: args.seed,
    settings: {
      rounds: DUEL_ROUNDS,
      band: typeof band === "number" && Number.isFinite(band) ? Math.min(1, Math.max(0, band)) : 0.55,
      subjects: args.settings?.subjects ? args.settings.subjects.slice() : [],
    },
    phase: "lobby",
    phaseStartMs: args.nowMs,
    lastActivityMs: args.nowMs,
    seq: 1,
    hostId: args.host.playerId,
    players: [
      {
        id: args.host.playerId,
        nickname: args.host.nickname,
        avatar: args.host.avatar,
        grade: args.host.grade,
        ready: true,
        connected: true,
        left: false,
        disconnectedAtMs: null,
        order: 0,
      },
    ],
    nextOrder: 1,
    used: {},
    matchNo: 0,
    match: null,
    drainDeadlineMs: null,
    closed: false,
  };
}

/** Egy meccs-fázisban van-e a szoba (visszaszámlálás / nyitott kör / felfedés). */
export function isMatchPhase(phase: RoomPhase): boolean {
  return MATCH_PHASES.includes(phase);
}

function clone(s: RoomState): RoomState {
  return {
    ...s,
    settings: { ...s.settings, subjects: s.settings.subjects.slice() },
    players: s.players.map((p) => ({ ...p })),
    used: Object.fromEntries(Object.entries(s.used).map(([k, v]) => [k, v.slice()])),
    match: s.match
      ? {
          ...s.match,
          ids: s.match.ids.slice(),
          deadlines: { ...s.match.deadlines },
          questions: { ...s.match.questions },
          answers: { ...s.match.answers },
        }
      : null,
  };
}

function player(s: RoomState, id: string): RoomPlayer | undefined {
  return s.players.find((p) => p.id === id);
}

/** A meccs aktív résztvevői: a meccsben vannak és nem léptek ki. */
function activeIds(s: RoomState): string[] {
  if (!s.match) return [];
  return s.match.ids.filter((id) => {
    const p = player(s, id);
    return !!p && !p.left;
  });
}

function pickHost(s: RoomState): string | null {
  const candidates = s.players.filter((p) => !p.left).sort((a, b) => a.order - b.order);
  return (candidates.find((p) => p.connected) ?? candidates[0])?.id ?? null;
}

function ensureHost(s: RoomState): void {
  const host = s.hostId ? player(s, s.hostId) : undefined;
  if (!host || host.left || !host.connected) {
    const next = pickHost(s);
    if (next) s.hostId = next;
    else if (!host || host.left) s.hostId = null;
  }
}

function err(state: RoomState, code: RtErrorCode): RoomReduceResult {
  return { state, effects: [], error: code };
}

function closeRoom(s: RoomState, reason: "EMPTY" | "EXPIRED" | "SERVER_RESTART" | "FINISHED", effects: RoomEffect[]): void {
  s.closed = true;
  effects.push({ type: "close", reason });
}

/** A kör zárási időpontja: a leghosszabb saját ablak + a hálózati türelmi idő. */
function closeAtMs(s: RoomState, t: RoomTiming): number | null {
  if (s.phase !== "round_open" || !s.match) return null;
  const ds = Object.values(s.match.deadlines);
  return ds.length > 0 ? Math.max(...ds) + t.answerGraceMs : s.phaseStartMs;
}

function usedSet(s: RoomState, grade: number): Set<string> {
  return new Set(s.used[String(grade)] ?? []);
}

function markUsed(s: RoomState, grade: number, q: DuelQuestion): void {
  const set = usedSet(s, grade);
  markDuelQuestionUsed(set, q);
  s.used[String(grade)] = Array.from(set);
}

function finishMatch(s: RoomState, reason: ResultReason, nowMs: number, effects: RoomEffect[], aborted: boolean): void {
  const m = s.match!;
  const v = verdict(m.duel);
  let podium = v.podium.map((g) => g.slice());
  let winners: string[];
  let coWin: boolean;
  if (reason === "OPPONENT_LEFT") {
    const left = new Set(m.ids.filter((id) => player(s, id)?.left !== false));
    const stay = podium.map((g) => g.filter((id) => !left.has(id))).filter((g) => g.length > 0);
    const gone = podium.map((g) => g.filter((id) => left.has(id))).filter((g) => g.length > 0);
    podium = [...stay, ...gone];
    winners = (stay[0] ?? []).slice();
    coWin = winners.length > 1;
  } else if (aborted || reason === "NO_QUESTIONS") {
    winners = (podium[0] ?? []).slice();
    coWin = winners.length > 1;
  } else {
    winners = v.winners.slice();
    coWin = v.coWin;
  }
  m.result = { podium, winners, coWin, aborted, reason };
  m.questions = {};
  m.deadlines = {};
  m.answers = {};
  s.phase = aborted ? "aborted" : "finished";
  s.phaseStartMs = nowMs;
  s.lastActivityMs = nowMs;
  effects.push({ type: "result" }, { type: "emitState" }, { type: "persist" });
}

function openRound(s: RoomState, nowMs: number, cfg: RoomConfig, effects: RoomEffect[]): void {
  const m = s.match!;
  const alive = new Set(aliveOf(m.duel));
  const v = verdict(m.duel);
  m.roundNo = m.duel.round + 1;
  m.tiebreak = v.needTiebreak;
  m.openedAtMs = nowMs;
  m.questions = {};
  m.deadlines = {};
  m.answers = {};
  const matchSeed = `${s.seed}:${s.matchNo}`;
  // Azonos évfolyamú játékosok ugyanazt a kérdést kapják (igazságos): évfolyamonként egyszer választunk.
  const byGrade = new Map<number, DuelQuestion>();
  for (const id of m.ids) {
    const p = player(s, id);
    if (!p || p.left || !alive.has(id)) continue;
    const same = byGrade.get(p.grade);
    if (same) {
      m.questions[id] = same;
      m.deadlines[id] = nowMs + same.windowMs;
      continue;
    }
    const req = (): RoomQuestionRequest => ({
      seed: matchSeed,
      round: m.roundNo,
      grade: p.grade,
      band: s.settings.band,
      subjects: s.settings.subjects,
      used: usedSet(s, p.grade),
    });
    let q = cfg.provider(req());
    if (!q) {
      // Hosszú visszavágó-sorozat: az évfolyam bankja elfogyott → elölről (a meccsen belül így sincs ismétlés).
      s.used[String(p.grade)] = [];
      q = cfg.provider(req());
    }
    if (!q) {
      finishMatch(s, "NO_QUESTIONS", nowMs, effects, true);
      return;
    }
    markUsed(s, p.grade, q);
    byGrade.set(p.grade, q);
    m.questions[id] = q;
    m.deadlines[id] = nowMs + q.windowMs;
  }
  s.phase = "round_open";
  s.phaseStartMs = nowMs;
  effects.push({ type: "openRound" }, { type: "emitState" });
}

function revealRound(s: RoomState, nowMs: number, t: RoomTiming, effects: RoomEffect[]): void {
  const m = s.match!;
  const alive = aliveOf(m.duel);
  const answers: DuelAnswer[] = alive.map((id) => {
    const a = m.answers[id];
    const q = m.questions[id];
    const windowMs = q ? q.windowMs : 1;
    return a ? { playerId: id, correct: a.correct, acceptedMs: a.acceptedMs, windowMs } : { playerId: id, correct: false, acceptedMs: null, windowMs };
  });
  const outcome = scoreRound(answers, alive);
  m.duel = applyRound(m.duel, outcome, answers);
  m.lastReveal = {
    round: m.roundNo,
    tiebreak: m.tiebreak,
    questions: { ...m.questions },
    answers: { ...m.answers },
    outcome,
    hp: { ...m.duel.hp },
    nextAtMs: nowMs + t.revealMs,
  };
  s.phase = "round_reveal";
  s.phaseStartMs = nowMs;
  effects.push({ type: "reveal" }, { type: "emitState" });
}

function afterReveal(s: RoomState, nowMs: number, cfg: RoomConfig, effects: RoomEffect[]): void {
  const m = s.match!;
  const active = activeIds(s);
  const aliveActive = aliveOf(m.duel).filter((id) => active.includes(id));
  if (active.length < m.ids.length && aliveActive.length <= 1) {
    finishMatch(s, "OPPONENT_LEFT", nowMs, effects, false);
    return;
  }
  const v = verdict(m.duel);
  if (v.finished) {
    finishMatch(s, "COMPLETED", nowMs, effects, false);
    return;
  }
  openRound(s, nowMs, cfg, effects);
}

/** Kilépés / végleges kiesés feldolgozása (közös a `leave`, a `kick` és a lejárt türelmi idő útjára). */
function removePlayer(s: RoomState, id: string, nowMs: number, effects: RoomEffect[], cfg: RoomConfig): void {
  const p = player(s, id);
  if (!p) return;
  const inMatch = isMatchPhase(s.phase) && !!s.match && s.match.ids.includes(id);
  if (inMatch) {
    p.left = true;
    p.connected = false;
    p.ready = false;
    p.disconnectedAtMs = null;
    delete s.match!.deadlines[id];
    effects.push({ type: "removed", playerId: id }, { type: "notice", code: "PLAYER_LEFT", deadlineMs: null });
    ensureHost(s);
    if (activeIds(s).length < RT_MIN_PLAYERS) {
      finishMatch(s, "OPPONENT_LEFT", nowMs, effects, false);
      return;
    }
    // A még nyitott körben a többiek válasza dönthet a korai zárásról.
    maybeEarlyReveal(s, nowMs, cfg, effects);
    effects.push({ type: "emitState" });
    return;
  }
  if (s.match && s.match.ids.includes(id)) {
    // Befejezett / megszakított meccs után a helyezés és a statisztika még a játékosra hivatkozik: csak jelöljük.
    p.left = true;
    p.connected = false;
    p.ready = false;
    p.disconnectedAtMs = null;
  } else {
    s.players = s.players.filter((x) => x.id !== id);
  }
  effects.push({ type: "removed", playerId: id });
  if (s.hostId === id) s.hostId = null;
  ensureHost(s);
  if (s.players.filter((x) => !x.left).length === 0) {
    closeRoom(s, "EMPTY", effects);
    return;
  }
  effects.push({ type: "notice", code: "PLAYER_LEFT", deadlineMs: null }, { type: "emitState" });
}

/** Ha minden aktív, kapcsolódó, élő játékos válaszolt, a kör azonnal zárul (nem kell kivárni az ablakot). */
function maybeEarlyReveal(s: RoomState, nowMs: number, cfg: RoomConfig, effects: RoomEffect[]): void {
  if (s.phase !== "round_open" || !s.match) return;
  const m = s.match;
  const waiting = Object.keys(m.questions).filter((id) => {
    const p = player(s, id);
    return !!p && !p.left && !m.answers[id];
  });
  if (waiting.length === 0) revealRound(s, nowMs, timingOf(cfg), effects);
}

/** A következő időpont, amikor a szerver-rétegnek `tick`-et kell küldenie (`null`: nincs időzített teendő). */
export function nextWakeMs(s: RoomState, cfg: RoomConfig): number | null {
  if (s.closed) return null;
  const t = timingOf(cfg);
  const times: number[] = [];
  switch (s.phase) {
    case "lobby":
      times.push(s.lastActivityMs + t.lobbyTtlMs);
      break;
    case "countdown":
      times.push(s.phaseStartMs + t.countdownMs);
      break;
    case "round_open":
      times.push(closeAtMs(s, t)!);
      break;
    case "round_reveal":
      times.push(s.phaseStartMs + t.revealMs);
      break;
    case "finished":
      times.push(s.phaseStartMs + (s.drainDeadlineMs !== null ? t.drainCloseMs : t.finishedTtlMs));
      break;
    case "aborted":
      times.push(s.phaseStartMs + t.abortedTtlMs);
      break;
  }
  if (s.drainDeadlineMs !== null && isMatchPhase(s.phase)) times.push(s.drainDeadlineMs);
  for (const p of s.players) if (!p.left && !p.connected && p.disconnectedAtMs !== null) times.push(p.disconnectedAtMs + t.reconnectGraceMs);
  return times.length > 0 ? Math.min(...times) : null;
}

function tick(s: RoomState, nowMs: number, cfg: RoomConfig, effects: RoomEffect[]): void {
  const t = timingOf(cfg);
  // 1) A türelmi időn túl kiesett játékosok kilépettnek számítanak.
  for (const p of s.players.slice()) {
    if (s.closed) return;
    if (!p.left && !p.connected && p.disconnectedAtMs !== null && nowMs >= p.disconnectedAtMs + t.reconnectGraceMs) {
      removePlayer(s, p.id, nowMs, effects, cfg);
    }
  }
  if (s.closed) return;
  // 2) Leállítás: a határidőn túl a futó meccs részeredménnyel zárul.
  if (s.drainDeadlineMs !== null && isMatchPhase(s.phase) && nowMs >= s.drainDeadlineMs) {
    finishMatch(s, "SERVER_RESTART", nowMs, effects, true);
    effects.push({ type: "notice", code: "SERVER_RESTART", deadlineMs: null });
    return;
  }
  // 3) Fázis-időzítők (egy tick több lépést is megtehet, ha a szerver sokat késett).
  for (let guard = 0; guard < 4 && !s.closed; guard++) {
    if (s.phase === "lobby") {
      if (nowMs >= s.lastActivityMs + t.lobbyTtlMs) {
        effects.push({ type: "notice", code: "ROOM_EXPIRING", deadlineMs: null });
        closeRoom(s, "EXPIRED", effects);
      }
      return;
    }
    if (s.phase === "countdown") {
      if (nowMs < s.phaseStartMs + t.countdownMs) return;
      openRound(s, nowMs, cfg, effects);
      continue;
    }
    if (s.phase === "round_open") {
      if (nowMs < closeAtMs(s, t)!) return;
      revealRound(s, nowMs, t, effects);
      continue;
    }
    if (s.phase === "round_reveal") {
      if (nowMs < s.phaseStartMs + t.revealMs) return;
      afterReveal(s, nowMs, cfg, effects);
      continue;
    }
    if (s.phase === "finished") {
      const ttl = s.drainDeadlineMs !== null ? t.drainCloseMs : t.finishedTtlMs;
      if (nowMs >= s.phaseStartMs + ttl) closeRoom(s, s.drainDeadlineMs !== null ? "SERVER_RESTART" : "EXPIRED", effects);
      return;
    }
    if (s.phase === "aborted") {
      if (nowMs >= s.phaseStartMs + t.abortedTtlMs) closeRoom(s, "SERVER_RESTART", effects);
      return;
    }
  }
}

/** A reducer: új állapotot ad (a bemenetet nem módosítja). Elutasított eseménynél az állapot változatlan, `error` kitöltve. */
export function reduceRoom(state: RoomState, ev: RoomEvent, nowMs: number, cfg: RoomConfig): RoomReduceResult {
  if (state.closed) return err(state, "ROOM_NOT_FOUND");
  const s = clone(state);
  const effects: RoomEffect[] = [];
  const t = timingOf(cfg);

  switch (ev.type) {
    case "join": {
      if (s.drainDeadlineMs !== null) return err(state, "SERVER_RESTART");
      if (player(s, ev.playerId)) return err(state, "ALREADY_IN_ROOM");
      if (s.phase !== "lobby") return err(state, "ROOM_STARTED");
      if (s.players.length >= RT_MAX_PLAYERS) return err(state, "ROOM_FULL");
      s.players.push({
        id: ev.playerId,
        nickname: ev.nickname,
        avatar: ev.avatar,
        grade: ev.grade,
        ready: false,
        connected: true,
        left: false,
        disconnectedAtMs: null,
        order: s.nextOrder++,
      });
      s.lastActivityMs = nowMs;
      ensureHost(s);
      effects.push({ type: "emitState" });
      break;
    }
    case "leave": {
      if (!player(s, ev.playerId)) return err(state, "NOT_IN_ROOM");
      removePlayer(s, ev.playerId, nowMs, effects, cfg);
      s.lastActivityMs = nowMs;
      break;
    }
    case "kick": {
      if (!player(s, ev.playerId)) return err(state, "NOT_IN_ROOM");
      if (s.hostId !== ev.playerId) return err(state, "NOT_HOST");
      if (s.phase !== "lobby" && s.phase !== "finished") return err(state, "BAD_PHASE");
      if (ev.target === ev.playerId || !player(s, ev.target)) return err(state, "NOT_IN_ROOM");
      effects.push({ type: "kicked", playerId: ev.target });
      removePlayer(s, ev.target, nowMs, effects, cfg);
      s.lastActivityMs = nowMs;
      break;
    }
    case "disconnect": {
      const p = player(s, ev.playerId);
      if (!p) return err(state, "NOT_IN_ROOM");
      if (!p.connected) return { state, effects: [] };
      p.connected = false;
      p.disconnectedAtMs = p.left ? null : nowMs;
      if (s.hostId === p.id) ensureHost(s);
      effects.push({ type: "emitState" });
      break;
    }
    case "reconnect": {
      const p = player(s, ev.playerId);
      if (!p || p.left) return err(state, "NOT_IN_ROOM");
      p.connected = true;
      p.disconnectedAtMs = null;
      if (!s.hostId) ensureHost(s);
      s.lastActivityMs = nowMs;
      effects.push({ type: "emitState" });
      break;
    }
    case "ready": {
      const p = player(s, ev.playerId);
      if (!p) return err(state, "NOT_IN_ROOM");
      if (s.phase !== "lobby") return err(state, "BAD_PHASE");
      if (p.ready === ev.ready) return { state, effects: [{ type: "accepted", playerId: p.id }] };
      p.ready = ev.ready;
      s.lastActivityMs = nowMs;
      effects.push({ type: "accepted", playerId: p.id }, { type: "emitState" });
      break;
    }
    case "start": {
      if (!player(s, ev.playerId)) return err(state, "NOT_IN_ROOM");
      if (s.hostId !== ev.playerId) return err(state, "NOT_HOST");
      if (s.phase !== "lobby") return err(state, "BAD_PHASE");
      if (s.drainDeadlineMs !== null) return err(state, "SERVER_RESTART");
      const present = s.players.filter((p) => p.connected && !p.left);
      if (present.length < RT_MIN_PLAYERS || present.some((p) => p.id !== s.hostId && !p.ready)) return err(state, "NOT_ENOUGH_PLAYERS");
      const ids = present.sort((a, b) => a.order - b.order).map((p) => p.id);
      s.matchNo += 1;
      s.match = {
        ids,
        duel: createDuel(ids),
        roundNo: 0,
        tiebreak: false,
        openedAtMs: 0,
        deadlines: {},
        questions: {},
        answers: {},
        lastReveal: null,
        result: null,
      };
      s.phase = "countdown";
      s.phaseStartMs = nowMs;
      s.lastActivityMs = nowMs;
      effects.push({ type: "accepted", playerId: ev.playerId }, { type: "emitState" });
      break;
    }
    case "answer": {
      const p = player(s, ev.playerId);
      if (!p || p.left) return err(state, "NOT_IN_ROOM");
      const m = s.match;
      if (s.phase !== "round_open" || !m || ev.round !== m.roundNo) return err(state, "ROUND_CLOSED");
      const q = m.questions[p.id];
      if (!q) return err(state, "ROUND_CLOSED");
      if (m.answers[p.id]) return err(state, "ALREADY_ANSWERED");
      if (!Number.isInteger(ev.optionIndex) || ev.optionIndex < 0 || ev.optionIndex >= q.options.length) return err(state, "BAD_OPTION");
      const serverRtMs = nowMs - m.openedAtMs;
      if (serverRtMs > q.windowMs + t.answerGraceMs) return err(state, "ROUND_CLOSED");
      const at = acceptedTimeMs(ev.clientRtMs, serverRtMs, ev.medianRttMs);
      m.answers[p.id] = {
        optionIndex: ev.optionIndex,
        atMs: nowMs,
        serverRtMs,
        acceptedMs: at.acceptedMs,
        suspicious: at.suspicious,
        correct: ev.optionIndex === q.correctIndex,
      };
      effects.push({ type: "accepted", playerId: p.id }, { type: "emitState" });
      maybeEarlyReveal(s, nowMs, cfg, effects);
      break;
    }
    case "rematch": {
      if (!player(s, ev.playerId)) return err(state, "NOT_IN_ROOM");
      if (s.phase !== "finished") return err(state, "BAD_PHASE");
      if (s.drainDeadlineMs !== null) return err(state, "SERVER_RESTART");
      s.players = s.players.filter((p) => !p.left);
      for (const p of s.players) p.ready = p.id === s.hostId;
      s.match = null;
      s.phase = "lobby";
      s.phaseStartMs = nowMs;
      s.lastActivityMs = nowMs;
      ensureHost(s);
      effects.push({ type: "accepted", playerId: ev.playerId }, { type: "emitState" });
      break;
    }
    case "drain": {
      if (s.drainDeadlineMs !== null) return { state, effects: [] };
      s.drainDeadlineMs = ev.deadlineMs;
      if (isMatchPhase(s.phase)) {
        effects.push({ type: "notice", code: "SERVER_RESTART", deadlineMs: ev.deadlineMs }, { type: "emitState" });
      } else if (s.phase === "finished") {
        // A már kihirdetett eredmény még látható marad egy rövid ideig (drainCloseMs), utána a szoba zárul.
        effects.push({ type: "notice", code: "SERVER_RESTART", deadlineMs: s.phaseStartMs + t.drainCloseMs }, { type: "emitState" });
      } else {
        effects.push({ type: "notice", code: "SERVER_RESTART", deadlineMs: null });
        closeRoom(s, "SERVER_RESTART", effects);
      }
      break;
    }
    case "tick":
      tick(s, nowMs, cfg, effects);
      break;
  }

  if (effects.some((e) => e.type === "emitState" || e.type === "openRound" || e.type === "reveal" || e.type === "result")) s.seq += 1;
  return { state: s, effects };
}

// ---------------------------------------------------------------------------------------------------------------------
// Nézetek (címzettenként szűrt, a protokoll-sémák szerinti üzenetek)
// ---------------------------------------------------------------------------------------------------------------------

export function publicPlayers(s: RoomState): RtPublicPlayer[] {
  const m = s.match;
  return s.players
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      ready: p.ready,
      connected: p.connected,
      hp: m && m.ids.includes(p.id) ? (m.duel.hp[p.id] ?? null) : null,
      left: p.left,
      answered: s.phase === "round_open" && !!m && !!m.answers[p.id],
    }));
}

export function roundOpenView(s: RoomState, playerId: string): RtServerPayload<"round:open"> | null {
  const m = s.match;
  if (s.phase !== "round_open" || !m) return null;
  const q = m.questions[playerId];
  if (!q) return null;
  return {
    seq: s.seq,
    round: m.roundNo,
    tiebreak: m.tiebreak,
    prompt: q.prompt,
    options: q.options.slice(),
    openedAtServerTs: m.openedAtMs,
    deadlineTs: m.deadlines[playerId] ?? m.openedAtMs + q.windowMs,
    windowMs: q.windowMs,
  };
}

export function revealView(s: RoomState, playerId: string): RtReveal | null {
  const r = s.match?.lastReveal;
  if (!s.match || !r) return null;
  const q = r.questions[playerId];
  const results = Object.keys(r.outcome.damageTo).map((id) => {
    const a = r.answers[id];
    const correct = !!a && a.correct && a.acceptedMs <= (r.questions[id]?.windowMs ?? 0);
    return {
      playerId: id,
      answered: !!a,
      correct,
      acceptedMs: a ? a.acceptedMs : null,
      damage: r.outcome.damageTo[id] ?? 0,
      speedBonus: r.outcome.speedBonus[id] ?? 0,
    };
  });
  const out: RtReveal = {
    seq: s.seq,
    round: r.round,
    tiebreak: r.tiebreak,
    correctIndex: q ? q.correctIndex : -1,
    yourOptionIndex: r.answers[playerId]?.optionIndex ?? null,
    results,
    hp: { ...r.hp },
    fastestCorrect: r.outcome.fastestCorrect,
    nextAtServerTs: s.phase === "round_reveal" ? r.nextAtMs : null,
  };
  if (q?.explanation) out.explanation = q.explanation;
  return out;
}

export function resultView(s: RoomState): RtMatchResult | null {
  const m = s.match;
  if (!m || !m.result) return null;
  return {
    seq: s.seq,
    podium: m.result.podium.map((g) => g.slice()),
    winners: m.result.winners.slice(),
    coWin: m.result.coWin,
    stats: m.ids.map((id) => {
      const st = m.duel.stats[id]!;
      return {
        playerId: id,
        accuracy: Math.round(accuracyOf(st) * 1000) / 1000,
        correct: st.correct,
        asked: st.asked,
        fastestMs: st.fastestMs,
        bestStreak: st.bestStreak,
      };
    }),
    saved: false,
    aborted: m.result.aborted,
    reason: m.result.reason,
  };
}

function phaseDeadline(s: RoomState, playerId: string, cfg: RoomConfig): number | null {
  const t = timingOf(cfg);
  switch (s.phase) {
    case "countdown":
      return s.phaseStartMs + t.countdownMs;
    case "round_open":
      return s.match?.deadlines[playerId] ?? closeAtMs(s, t);
    case "round_reveal":
      return s.phaseStartMs + t.revealMs;
    default:
      return null;
  }
}

/** A teljes szobaállapot a címzett szemszögéből (újracsatlakozáskor is ezt kapja: a nyitott kör hátralévő idejével). */
export function roomStateView(s: RoomState, playerId: string, nowMs: number, cfg: RoomConfig): RtRoomState {
  const p = player(s, playerId);
  const m = s.match;
  const open = roundOpenView(s, playerId);
  return {
    seq: s.seq,
    serverTs: nowMs,
    code: s.code,
    gameId: s.gameId,
    mode: s.mode,
    phase: s.phase,
    hostId: s.hostId,
    players: publicPlayers(s),
    round: m ? m.roundNo : 0,
    tiebreak: m ? m.tiebreak : false,
    deadlineTs: phaseDeadline(s, playerId, cfg),
    settings: { rounds: s.settings.rounds, band: s.settings.band },
    draining: s.drainDeadlineMs !== null,
    you: {
      playerId,
      grade: p ? p.grade : 3,
      question: open ? { round: open.round, tiebreak: open.tiebreak, prompt: open.prompt, options: open.options, openedAtServerTs: open.openedAtServerTs, deadlineTs: open.deadlineTs, windowMs: open.windowMs } : null,
      answeredOptionIndex: s.phase === "round_open" && m ? (m.answers[playerId]?.optionIndex ?? null) : null,
    },
    lastReveal: revealView(s, playerId),
    result: resultView(s),
  };
}

/** Összesítés a státusz-végponthoz (számok, személyes adat nélkül). */
export function roomCounts(s: RoomState): { inMatch: boolean; players: number; connected: number } {
  return {
    inMatch: isMatchPhase(s.phase),
    players: s.players.filter((p) => !p.left).length,
    connected: s.players.filter((p) => p.connected).length,
  };
}
