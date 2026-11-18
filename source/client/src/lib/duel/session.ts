/**
 * Párbaj-munkamenet (JM3a, terv D20–D22): EGY megjelenítő, KÉT meghajtó.
 *
 *  - online (`openOnlineSession`): a JM2 vékony kliense (`rtClient`) — jegy közvetlenül a csatlakozás előtt, utána azonnal
 *    `room:create` / `room:join`; a szerver a tekintély, a kliens a `room:state` pillanatképeket rajzolja;
 *  - gépi ellenfél (`createBotSession`): ugyanaz a `room-machine` a kliensen, hálózat és szerver nélkül, egy seedelt gépi
 *    játékossal (`shared/duel/bot.ts`). A nézetet ugyanaz a `roomStateView` adja, mint a szerveren — így a felület
 *    mindkét módban ugyanazt a `RtRoomState`-et kapja.
 *
 * A gépi meccs SEHOL nem számít ember elleni győzelemnek (D22): nem ír a szerverre, pont nem jár érte; a pillanatkép
 * `kind: "bot"` jelölése a felületen „Gép” feliratként látszik.
 */
import { type RT_SUBJECTS, type RtAck, type RtNoticeCode, type RtRoomState } from "@shared/duel/protocol";
import {
  createRoom,
  nextWakeMs,
  reduceRoom,
  roomStateView,
  type RoomConfig,
  type RoomEvent,
  type RoomQuestionRequest,
  type RoomState,
  type RoomTiming,
} from "@shared/duel/room-machine";
import type { DuelQuestion } from "@shared/duel/questions";
import { BOT_PROFILES, planBotAnswer, type BotSkill } from "@shared/duel/bot";

export type DuelConn = "connecting" | "open" | "reconnecting" | "closed";

export type DuelSnapshot = {
  kind: "online" | "bot";
  conn: DuelConn;
  /** A végleges lezárás oka (pl. `ROOM_CLOSED`, `SERVER_RESTART`, `KICKED`, `LEFT`, `RECONNECT_TIMEOUT`), különben null. */
  closedCode: string | null;
  state: RtRoomState | null;
  /** Az utolsó szerver-értesítés (pl. `PLAYER_LEFT`, `SERVER_RESTART`), helyi időbélyeggel. */
  notice: { code: RtNoticeCode; at: number } | null;
  /** Szerveridő − helyi idő (az időjelzőhöz); gépi módban 0. */
  clockOffsetMs: number;
  /** Gépi módban: a gép ügyessége. */
  botSkill: BotSkill | null;
};

export type DuelSession = {
  readonly kind: "online" | "bot";
  getSnapshot(): DuelSnapshot;
  subscribe(listener: () => void): () => void;
  setReady(ready: boolean): Promise<RtAck>;
  start(): Promise<RtAck>;
  answer(round: number, optionIndex: number, clientRtMs: number | null): Promise<RtAck>;
  rematch(): Promise<RtAck>;
  leave(): Promise<void>;
  dispose(): void;
  /** Csak gépi módban (review #464 A6): a lap háttérbe kerülésekor a meccs-óra áll (online nincs szünet). */
  setPaused?(paused: boolean): void;
};

/** Egyszerű tár a pillanatképhez (`useSyncExternalStore`-hoz). */
function createStore(initial: DuelSnapshot) {
  let snap = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snap,
    set(patch: Partial<DuelSnapshot>) {
      snap = { ...snap, ...patch };
      for (const l of Array.from(listeners)) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Gépi ellenfél (helyi meghajtó)
// ---------------------------------------------------------------------------------------------------------------------

export const BOT_ME_ID = "Pme00000000";
export const BOT_ID = "Pgep0000000";

export type BotSessionArgs = {
  grade: number;
  band: number;
  subjects: string[];
  skill: BotSkill;
  /** A meccs seedje (a lapon kriptográfiai véletlen; teszten rögzített). */
  seed: string;
  nickname: string;
  provider: (req: RoomQuestionRequest) => DuelQuestion | null;
  /** Óra (ms) — alap: `Date.now`. */
  now?: () => number;
  /** Időzítő — alap: `setTimeout`; a teszt kézi ütemezőt ad. */
  schedule?: (fn: () => void, delayMs: number) => () => void;
  timing?: Partial<RoomTiming>;
};

export function createBotSession(args: BotSessionArgs): DuelSession {
  const baseNow = args.now ?? (() => Date.now());
  // Szünet (A6): a meccs-óra a szünetek összegével késik; szünet alatt áll.
  let pausedAt: number | null = null;
  let pausedTotal = 0;
  const now = () => (pausedAt ?? baseNow()) - pausedTotal;
  const schedule =
    args.schedule ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, Math.max(0, ms));
      return () => clearTimeout(t);
    });
  const profile = BOT_PROFILES[args.skill];
  const cfg: RoomConfig = { provider: args.provider, timing: args.timing };
  const botNick = `Gép · ${profile.label}`;
  let room: RoomState = createRoom({
    code: "GEPGEP",
    gameId: "parbaj",
    mode: "duel",
    seed: args.seed,
    settings: { band: args.band, subjects: args.subjects },
    host: { playerId: BOT_ME_ID, nickname: args.nickname, avatar: null, grade: args.grade },
    nowMs: now(),
  });
  const store = createStore({ kind: "bot", conn: "open", closedCode: null, state: null, notice: null, clockOffsetMs: 0, botSkill: args.skill });
  let cancelWake: (() => void) | null = null;
  let cancelBot: (() => void) | null = null;
  let plannedRound = -1;
  let disposed = false;

  const publish = () => store.set({ state: roomStateView(room, BOT_ME_ID, now(), cfg) });

  function dispatch(ev: RoomEvent): RtAck {
    if (disposed) return { ok: false, code: "ROOM_NOT_FOUND" };
    const r = reduceRoom(room, ev, now(), cfg);
    if (r.error) return { ok: false, code: r.error };
    room = r.state;
    afterChange();
    return { ok: true };
  }

  function afterChange(): void {
    publish();
    cancelWake?.();
    cancelWake = null;
    // A befejezett / megszakított meccs után nincs több időzített teendő (nincs TTL-lezárás: a felület dönt).
    if (room.phase === "finished" || room.phase === "aborted" || room.closed) {
      cancelBot?.();
      cancelBot = null;
      return;
    }
    const wake = nextWakeMs(room, cfg);
    if (wake !== null) cancelWake = schedule(() => dispatch({ type: "tick" }), wake - now());
    planBot();
  }

  /** A gép válasza a nyitott körre (egyszer körönként), a saját ablaka arányában. */
  function planBot(): void {
    const m = room.match;
    if (room.phase !== "round_open" || !m || plannedRound === m.roundNo) return;
    const q = m.questions[BOT_ID];
    if (!q) return;
    plannedRound = m.roundNo;
    const round = m.roundNo;
    const plan = planBotAnswer(`${args.seed}:${room.matchNo}`, round, { correctIndex: q.correctIndex, optionCount: q.options.length, windowMs: q.windowMs }, profile);
    cancelBot?.();
    cancelBot = schedule(() => {
      if (room.phase === "round_open" && room.match?.roundNo === round && !room.match.answers[BOT_ID]) {
        dispatch({ type: "answer", playerId: BOT_ID, round, optionIndex: plan.optionIndex, clientRtMs: null, medianRttMs: 0 });
      }
    }, m.openedAtMs + plan.atOffsetMs - now());
  }

  function startMatch(): RtAck {
    const joined = room.players.some((p) => p.id === BOT_ID);
    if (!joined) {
      const j = dispatch({ type: "join", playerId: BOT_ID, nickname: botNick, avatar: null, grade: args.grade });
      if (!j.ok) return j;
    }
    const r = dispatch({ type: "ready", playerId: BOT_ID, ready: true });
    if (!r.ok) return r;
    // Visszavágónál a gép „kész”-e elfogadás → a szoba már magától indult (JM3a-2, K4).
    if (room.phase !== "lobby") return { ok: true };
    return dispatch({ type: "start", playerId: BOT_ME_ID });
  }

  // Azonnal indul: gépi módban nincs váróterem (a gép mindig kész).
  startMatch();

  return {
    kind: "bot",
    getSnapshot: store.get,
    subscribe: store.subscribe,
    async setReady() {
      return { ok: true };
    },
    async start() {
      return startMatch();
    },
    async answer(round, optionIndex, clientRtMs) {
      return dispatch({ type: "answer", playerId: BOT_ME_ID, round, optionIndex, clientRtMs, medianRttMs: 0 });
    },
    async rematch() {
      const r = dispatch({ type: "rematch", playerId: BOT_ME_ID });
      if (!r.ok) return r;
      plannedRound = -1;
      return startMatch();
    },
    async leave() {
      this.dispose();
    },
    setPaused(paused: boolean) {
      if (disposed) return;
      if (paused && pausedAt === null) {
        pausedAt = baseNow();
        cancelWake?.();
        cancelBot?.();
        cancelWake = null;
        cancelBot = null;
      } else if (!paused && pausedAt !== null) {
        pausedTotal += baseNow() - pausedAt;
        pausedAt = null;
        plannedRound = -1; // a gép válaszát az eltolt órához újratervezzük (a már adott válasz megmarad)
        store.set({ clockOffsetMs: -pausedTotal });
        afterChange();
      }
    },
    dispose() {
      disposed = true;
      cancelWake?.();
      cancelBot?.();
      store.set({ conn: "closed", closedCode: "LEFT" });
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Online (hálózati meghajtó)
// ---------------------------------------------------------------------------------------------------------------------

export type OnlineIntent =
  /** JM3a: visszatérés a saját helyre a tárolt folytatási tokennel (lap-újratöltés után; vendégnél is). */
  | { intent: "resume"; code: string; token: string }
  | { intent: "create"; grade: number; settings: { band?: number; subjects?: Array<(typeof RT_SUBJECTS)[number]> } }
  | { intent: "join"; code: string; grade: number };

export type OnlineSessionOptions = {
  learnerToken?: string | null;
  transports?: ("polling" | "websocket")[];
  /** A 60 s-os helymegtartás után a kliens feladja az újracsatlakozást (nincs végtelen pörgés). */
  reconnectGiveUpMs?: number;
};

/** Hibakód a csatlakozás bármely lépéséből (jegy HTTP-válasz, kézfogás, nyugta). */
export class DuelJoinError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** A jegy-végpont HTTP-hibáinak leképezése protokoll-kódra (404 = a réteg ki van kapcsolva). */
export function ticketErrorCode(err: unknown): string {
  const e = err as { code?: string; status?: number } | null;
  if (e?.status === 404) return "FEATURE_DISABLED";
  if (e?.status === 429) return "RATE_LIMITED";
  if (typeof e?.code === "string" && /^[A-Z_]+$/.test(e.code) && !e.code.startsWith("HTTP_")) return e.code;
  if (e?.status === undefined) return "NETWORK";
  return "BAD_MESSAGE";
}

/** A saját szobahely (kód + folytatási token) a lapfülhöz kötve (`sessionStorage`): újratöltés után ide lehet visszaülni. */
const SEAT_KEY = "websuli.duelSeat.v1";
export const SEAT_MAX_AGE_MS = 70_000;
export type StoredSeat = { code: string; token: string; at: number };

export function loadStoredSeat(now = Date.now()): StoredSeat | null {
  try {
    const p = JSON.parse(window.sessionStorage.getItem(SEAT_KEY) ?? "null") as StoredSeat | null;
    return p && typeof p.code === "string" && typeof p.token === "string" && typeof p.at === "number" && now - p.at < SEAT_MAX_AGE_MS ? p : null;
  } catch {
    return null;
  }
}

function storeSeat(seat: StoredSeat | null): void {
  try {
    if (seat) window.sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else window.sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* tároló nélkül is megy (akkor nincs újratöltés utáni visszaülés) */
  }
}

export async function openOnlineSession(intent: OnlineIntent, opts: OnlineSessionOptions = {}): Promise<DuelSession> {
  const { requestRtTicket, connectRt } = await import("@/lib/rt/rtClient");
  if (intent.intent === "resume") {
    try {
      const rt = await connectRt({ ticket: "", resumeToken: intent.token, transports: opts.transports });
      return wrapOnline(rt, opts);
    } catch (err) {
      storeSeat(null);
      throw new DuelJoinError((err as { code?: string }).code ?? "ROOM_NOT_FOUND");
    }
  }
  let ticket;
  try {
    ticket = await requestRtTicket(intent.intent === "create" ? { intent: "create" } : { intent: "join", code: intent.code }, { learnerToken: opts.learnerToken ?? null });
  } catch (err) {
    throw new DuelJoinError(ticketErrorCode(err));
  }
  let rt;
  try {
    rt = await connectRt({ ticket: ticket.ticket, path: ticket.path, url: ticket.directUrl ?? undefined, transports: opts.transports });
  } catch (err) {
    throw new DuelJoinError((err as { code?: string }).code ?? "NETWORK");
  }
  const ack =
    intent.intent === "create"
      ? await rt.request("room:create", { gameId: "parbaj", mode: "duel", grade: intent.grade, settings: intent.settings })
      : await rt.request("room:join", { code: intent.code, grade: intent.grade });
  if (!ack.ok) {
    rt.close();
    throw new DuelJoinError(ack.code);
  }
  return wrapOnline(rt, opts);
}

function wrapOnline(rt: import("@/lib/rt/rtClient").RtConnection, opts: OnlineSessionOptions): DuelSession {
  const store = createStore({ kind: "online", conn: "open", closedCode: null, state: rt.state, notice: null, clockOffsetMs: 0, botSkill: null });
  const offsets: number[] = [];
  let giveUp: ReturnType<typeof setTimeout> | null = null;
  const giveUpMs = opts.reconnectGiveUpMs ?? 60_000;

  const syncConn = () => {
    const conn: DuelConn = rt.status === "closed" ? "closed" : rt.status === "reconnecting" ? "reconnecting" : "open";
    if (conn === "reconnecting" && !giveUp) {
      giveUp = setTimeout(() => {
        if (rt.status !== "open") {
          rt.close();
          store.set({ conn: "closed", closedCode: "RECONNECT_TIMEOUT" });
        }
      }, giveUpMs);
    }
    if (conn !== "reconnecting" && giveUp) {
      clearTimeout(giveUp);
      giveUp = null;
    }
    store.set({ conn, closedCode: conn === "closed" ? (rt.closedCode ?? store.get().closedCode ?? "DISCONNECTED") : null });
    if (conn === "closed") storeSeat(null);
  };

  const remember = () => {
    const code = rt.state?.code;
    if (rt.resumeToken && code && rt.status !== "closed") storeSeat({ code, token: rt.resumeToken, at: Date.now() });
  };
  const offState = rt.onState((s) => {
    remember();
    // Óra-eltolás: (szerveridő − helyi idő) a legkisebb késésű mintából közelítve (az utolsó 5 közül a legnagyobb).
    offsets.push(s.serverTs - Date.now());
    if (offsets.length > 5) offsets.shift();
    store.set({ state: s, clockOffsetMs: Math.max(...offsets) });
  });
  if (rt.state) {
    offsets.push(rt.state.serverTs - Date.now());
    store.set({ clockOffsetMs: offsets[0]! });
  }
  remember();
  // A tárolt hely „frissessége” (újratöltéskor a 60 s-os helymegtartáson belül vagyunk-e) csendes váróteremben is.
  const keepFresh = setInterval(remember, 15_000);
  const offNotice = rt.on("notice", (n) => store.set({ notice: { code: n.code, at: Date.now() } }));
  rt.socket.on("disconnect", syncConn);
  rt.socket.on("connect", syncConn);
  rt.socket.on("connect_error", syncConn);
  rt.socket.io.on("reconnect_attempt", syncConn);

  return {
    kind: "online",
    getSnapshot: store.get,
    subscribe: store.subscribe,
    setReady: (ready) => rt.request("room:ready", { ready }),
    start: () => rt.request("room:start", {}),
    answer: (round, optionIndex, clientRtMs) => rt.request("round:answer", { round, optionIndex, clientRtMs }),
    rematch: () => rt.request("room:rematch", {}),
    async leave() {
      storeSeat(null);
      if (rt.status === "open") await rt.request("room:leave", {}).catch(() => undefined);
      rt.close();
      store.set({ conn: "closed", closedCode: "LEFT" });
    },
    dispose() {
      clearInterval(keepFresh);
      offState();
      offNotice();
      if (giveUp) clearTimeout(giveUp);
      rt.close();
    },
  };
}
