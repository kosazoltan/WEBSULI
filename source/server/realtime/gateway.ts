/**
 * JM2 — a Socket.IO kapu (végrehajtás JM2 5. lépés; terv 10.3, 10.8, 10.9).
 *
 * A Socket.IO a meglévő `http.Server`-re ül, a `RT_PATH` (`/api/rt/io`) úton; a Vercel → Render `/api/*` továbbításon át
 * HTTP long-pollinggal működik (egy példány → ragadós munkamenet nem kell), és WebSocketre vált, ahol lehet.
 * A Socket.IO megkerüli az Express köztes rétegeit, ezért itt KÉZZEL:
 *  - `allowRequest` (csak a kézfogás): `MP_MODE`, eredet (a meglévő engedélylista), kapcsolat-plafon (összes és IP-nként);
 *  - Engine.IO köztes réteg (MINDEN kérés és upgrade): idegen `Origin` → elutasítás;
 *  - névtér-köztes réteg: belépőjegy (aláírás, lejárat, egyszer-használat) vagy folytatási token, hibás próbák IP-korlátja;
 *  - csomagonként: token-vödör (20/s), zod-séma (ismeretlen esemény / mező → `BAD_MESSAGE`), a méretet a
 *    `maxHttpBufferSize` (4 KB) fogja (túllépés → bontás); lassú kliens: a visszatartott csomagok plafonja → bontás.
 * A szoba-logika a tiszta `room-machine`; a kimenő üzenetek a címzettenként szűrt nézetek (helyes index csak felfedéskor).
 */
import { randomBytes, randomInt } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, Server as HttpServer } from "node:http";
import { Server as IoServer, type Socket } from "socket.io";
import {
  CLIENT_EVENTS,
  PROTOCOL_VERSION,
  RT_MAX_MESSAGE_BYTES,
  RT_MAX_PLAYERS,
  RT_MESSAGES_PER_SEC,
  RT_MIN_PLAYERS,
  RT_PATH,
  RT_LATENCY_SLACK_CAP_MS,
  RT_RECONNECT_GRACE_MS,
  RT_SUPPORTED_MODES,
  authSchema,
  parseClientEvent,
  type RtAck,
  type RtClientEvent,
  type RtErrorCode,
  type RtServerEvent,
  type RtServerPayload,
} from "../../shared/duel/protocol";
import { isReactionId } from "../../shared/duel/reactions";
import { resultView, revealView, roomStateView, roundOpenView, type RoomConfig, type RoomEffect, type RoomState } from "../../shared/duel/room-machine";
import { isOriginAllowed, isSameOriginRequest } from "../lib/allowed-origins";
import { clientIpKey } from "../lib/client-ip";
import type { RtConfig } from "./config";
import type { Metrics } from "./metrics";
import { generateMatchSeed, type Registry } from "./registry";
import { canCreateRoom, type TicketClaims, type TicketService } from "./ticket";

/** Ennyi kimenő csomag várakozhat egy kapcsolaton (polling: a következő lekérdezésig) — felette a kliens lassú → bontás. */
export const RT_MAX_PENDING_PACKETS = 64;
/** Ennyi korlát-túllépés után a kapcsolatot bontjuk (elárasztás). */
export const RT_FLOOD_DISCONNECT_AFTER = 40;
/** Reakció: kapcsolatonként legfeljebb ennyi ms-onként egy. */
export const RT_REACTION_MIN_GAP_MS = 1000;
/** JM3a-2 (ÚJ-2): a folytatási token szerveroldali élettartama (minden sikeres visszaülés újat ad). */
export const RESUME_TOKEN_MAX_AGE_MS = 6 * 60 * 60_000;
// Időkorlátok (review #452 KÖZEPES-3; `config.ts`): jegy nélküli kapcsolat `connectTimeoutMs` (10 s), szobába nem lépő
// `noRoomTimeoutMs` (15 s), szobahely nélkül maradt (kilépés, kirúgás, lezárt szoba) `seatlessDisconnectMs` (3 s).

type Logger = { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };

/** Egy szobabeli hely: a szerver ezzel köti össze a (változó) kapcsolatot és a szobabeli játékost. */
type Seat = {
  identity: string;
  roomCode: string;
  playerId: string;
  resumeToken: string;
  /** A folytatási token kiadásának ideje (szerveroldali lejárat: `RESUME_TOKEN_MAX_AGE_MS`). */
  resumeIssuedAt: number;
  /**
   * JM3a-2 (review K1): a forgatás a kliens nyugtájáig nem végleges — addig az ELŐZŐ (a kliensnél biztosan meglévő) token is
   * visszaültet erre az egy helyre, legfeljebb `until`-ig. A `welcome` nyugtája után `null` (a régi token érvénytelen).
   */
  prevResume: { token: string; until: number } | null;
  socketId: string | null;
  rtt: number[];
  /** A helyet foglaló kapcsolat IP-kulcsa (kitiltáshoz, IP-nkénti szobaplafonhoz) — kifelé soha nem megy. */
  ip: string;
  kind: TicketClaims["kind"] | null;
};

type SocketData = {
  claims: TicketClaims | null;
  ip: string;
  seat: Seat | null;
  /** A belépőjegy szándéka már fel lett használva (szoba nyitva / csatlakozva). */
  intentUsed: boolean;
  tokens: number;
  tokensAt: number;
  overflow: number;
  lastReactionAt: number;
};

export type GatewayDeps = {
  registry: Registry;
  tickets: TicketService;
  metrics: Metrics;
  config: () => RtConfig;
  roomConfig: RoomConfig;
  now: () => number;
  logger: Logger;
  /** Az aktív gyártási futások száma (a workflow-motor számlálója); a gyártás alatti szoba-plafonhoz. */
  activeRunCount: () => number;
  isDraining: () => boolean;
  /** Kulcsolt (HMAC) szobakód-hash a naplóhoz (review #452: só nélküli hash a kis kódtér miatt visszafejthető). */
  roomHash: (code: string) => string;
};

/** Egyszerű fix ablakos számláló kulcsonként (IP-korlátok); a lejárt kulcsok olvasáskor törlődnek. */
export function createWindowCounter(windowMs: number, now: () => number) {
  const map = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key: string): number {
      const t = now();
      if (map.size > 10_000) for (const [k, v] of map) if (v.resetAt <= t) map.delete(k);
      const cur = map.get(key);
      if (!cur || cur.resetAt <= t) {
        map.set(key, { count: 1, resetAt: t + windowMs });
        return 1;
      }
      cur.count += 1;
      return cur.count;
    },
    peek(key: string): number {
      const cur = map.get(key);
      return cur && cur.resetAt > now() ? cur.count : 0;
    },
  };
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Az eredet ellenőrzése (CSWSH / CSRF ellen). Van `Origin` → az engedélylistán VAGY azonos eredetű kell legyen. Nincs
 * `Origin` (a böngésző az azonos eredetű GET-re nem küldi; a polling kézfogása ilyen) → csak akkor engedjük, ha a
 * `Sec-Fetch-Site` nem jelez idegen oldalt (a böngésző idegen eredetű kérésnél mindig küld `Origin`-t).
 */
export function originAllowed(headers: IncomingHttpHeaders): boolean {
  const origin = first(headers.origin);
  if (origin) {
    if (isOriginAllowed(origin)) return true;
    const proto = (first(headers["x-forwarded-proto"]) ?? "http").split(",")[0]!.trim();
    return isSameOriginRequest(origin, proto, first(headers.host));
  }
  const site = first(headers["sec-fetch-site"]);
  return site === undefined || site === "same-origin" || site === "none";
}

function ipOf(req: { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string } }, fallback?: string): string {
  return clientIpKey({ headers: req.headers, ip: req.socket?.remoteAddress ?? fallback });
}

const PLAYER_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function newPlayerId(): string {
  let id = "P";
  for (let i = 0; i < 10; i++) id += PLAYER_ID_ALPHABET[randomInt(PLAYER_ID_ALPHABET.length)];
  return id;
}

function rtError(code: RtErrorCode): Error & { data: { code: RtErrorCode } } {
  const e = new Error(code) as Error & { data: { code: RtErrorCode } };
  e.data = { code };
  return e;
}

/**
 * A késés-keret (review #452 KÖZEPES-1, SPEC-VÁLTOZÁS a terv 10.5-höz): a szerver által mért `clock:probe` oda-vissza
 * idők MINIMUMA (a kliens a nyugta késleltetésével a mintákat csak NÖVELNI tudja, a minimumot nem csökkentheti), és a
 * plafon `RT_LATENCY_SLACK_CAP_MS` (120 ms) — a kliens állítása így legfeljebb 120 ms-mal mehet a szerver mérése alá.
 * 120 < TIE_MS (200): a „leggyorsabb” címet így csak az nyerheti, aki a szerver mérése szerint sem lassabb; a sávos bónusznál
 * (sávszélesség ≥ 625 ms) legfeljebb egy sávhatár menti, egy lépcsős eltérés lehetséges.
 */
export function latencyAllowanceMs(samples: readonly number[]): number {
  const finite = samples.filter((x) => Number.isFinite(x) && x >= 0);
  if (finite.length === 0) return 0;
  return Math.min(RT_LATENCY_SLACK_CAP_MS, Math.min(...finite));
}

export function createGateway(httpServer: HttpServer, deps: GatewayDeps, opts: { destroyUpgrade: boolean }) {
  const { registry, tickets, metrics, logger } = deps;
  const roomHash = deps.roomHash;
  /** Szobánként a kirúgottak (jegy-alany; vendégnél az IP-kulcs is) a szoba élettartamára. */
  const bans = new Map<string, Set<string>>();
  /** Szobánként a nyitó IP-kulcsa (IP-nkénti egyidejű szobaplafon). */
  const roomOwnerIp = new Map<string, string>();
  /** Védett futtatás: a valós idejű réteg hibája SOHA nem juthat ki a folyamatba (review #452 KÖZEPES-4). */
  const guard = (where: string, fn: () => void) => {
    try {
      fn();
    } catch (error) {
      metrics.reject("INTERNAL");
      logger.warn("rt.error", { where, error: error instanceof Error ? error.message : String(error) });
    }
  };
  const seatsByIdentity = new Map<string, Seat>();
  const seatsByResume = new Map<string, Seat>();
  const seatsByPlayer = new Map<string, Seat>();
  const connectionsPerIp = new Map<string, number>();
  const roomsPerIp = createWindowCounter(60_000, deps.now);
  const joinsPerIp = createWindowCounter(60_000, deps.now);
  const handshakeFailures = createWindowCounter(60_000, deps.now);

  const io = new IoServer(httpServer, {
    path: RT_PATH,
    addTrailingSlash: false,
    serveClient: false,
    maxHttpBufferSize: RT_MAX_MESSAGE_BYTES,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    transports: ["polling", "websocket"],
    perMessageDeflate: false,
    httpCompression: false,
    cookie: false,
    connectTimeout: deps.config().connectTimeoutMs,
    // A kapcsolat-állapot visszaállítást (connectionStateRecovery) szándékosan NEM kapcsoljuk be: az a névtér-köztes
    // réteget (jegy, kapacitás) átugorná, és a játékosonként küldött üzeneteket nem pufferelné. Helyette újracsatlakozáskor
    // a szerver a teljes szobaállapotot küldi (`room:state`), a folytatási token alapján.
    cors: {
      origin: (origin, cb) => cb(null, !origin || isOriginAllowed(origin)),
      credentials: true,
      methods: ["GET", "POST"],
    },
    destroyUpgrade: opts.destroyUpgrade,
    allowRequest: (req: IncomingMessage, cb) => {
      const cfg = deps.config();
      if (cfg.mode === "off") return cb("FEATURE_DISABLED", false);
      if (!originAllowed(req.headers)) {
        metrics.reject("ORIGIN_NOT_ALLOWED");
        return cb("ORIGIN_NOT_ALLOWED", false);
      }
      if (io.engine.clientsCount >= cfg.maxConnections) {
        metrics.reject("CAPACITY");
        return cb("CAPACITY", false);
      }
      if ((connectionsPerIp.get(ipOf(req)) ?? 0) >= cfg.maxConnectionsPerIp) {
        metrics.reject("RATE_LIMITED");
        return cb("RATE_LIMITED", false);
      }
      cb(null, true);
    },
  });

  // Minden Engine.IO kérésre és upgrade-re (nem csak a kézfogásra): idegen eredet → elutasítás.
  io.engine.use((req: IncomingMessage, res: { writeHead?: (code: number, headers?: Record<string, string>) => { end: (body?: string) => void } }, next: (err?: Error) => void) => {
    // Az Engine.IO előtag-egyezéssel szűr (`/api/rt/io…`); csak a pontos útvonal (záró perjellel vagy anélkül) a miénk.
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname !== RT_PATH && pathname !== `${RT_PATH}/`) {
      if (typeof res.writeHead === "function" && !req.headers.upgrade) {
        res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Not found" }));
        return;
      }
      return next(new Error("NOT_FOUND"));
    }
    if (!originAllowed(req.headers)) return next(new Error("ORIGIN_NOT_ALLOWED"));
    next();
  });

  io.engine.on("connection", (raw: { request: IncomingMessage; once: (ev: string, fn: () => void) => void }) => {
    const ip = ipOf(raw.request);
    connectionsPerIp.set(ip, (connectionsPerIp.get(ip) ?? 0) + 1);
    raw.once("close", () => {
      const n = (connectionsPerIp.get(ip) ?? 1) - 1;
      if (n <= 0) connectionsPerIp.delete(ip);
      else connectionsPerIp.set(ip, n);
    });
  });

  const socketsById = () => io.of("/").sockets;

  function socketOfSeat(seat: Seat): Socket | undefined {
    return seat.socketId ? socketsById().get(seat.socketId) : undefined;
  }

  /** Kimenő üzenet lassú-kliens védelemmel. */
  function send<E extends RtServerEvent>(socket: Socket | undefined, event: E, payload: RtServerPayload<E>): void {
    if (!socket || !socket.connected) return;
    const pending = (socket.conn as unknown as { writeBuffer?: unknown[] }).writeBuffer?.length ?? 0;
    if (pending > RT_MAX_PENDING_PACKETS) {
      metrics.reject("SLOW_CLIENT");
      socket.disconnect(true);
      return;
    }
    socket.emit(event, payload);
  }

  function releaseSeat(seat: Seat): void {
    if (seatsByIdentity.get(seat.identity) === seat) seatsByIdentity.delete(seat.identity);
    seatsByResume.delete(seat.resumeToken);
    if (seat.prevResume) seatsByResume.delete(seat.prevResume.token);
    seat.prevResume = null;
    seatsByPlayer.delete(seat.playerId);
    const s = socketOfSeat(seat);
    if (s) {
      (s.data as SocketData).seat = null;
      // Szobahely nélkül a kapcsolat nem foglalhat kapacitást (a jegy szándéka felhasználva — új szobához új jegy kell).
      const t = setTimeout(
        () =>
          guard("seatless", () => {
            if (!(s.data as SocketData).seat && s.connected) s.disconnect(true);
          }),
        deps.config().seatlessDisconnectMs,
      );
      t.unref?.();
    }
  }

  function roomSeats(room: RoomState): Seat[] {
    const out: Seat[] = [];
    for (const p of room.players) {
      const seat = seatsByPlayer.get(p.id);
      if (seat && seat.roomCode === room.code) out.push(seat);
    }
    return out;
  }

  function onEffects(room: RoomState, effects: RoomEffect[]): void {
    const now = deps.now();
    const seats = roomSeats(room);
    for (const e of effects) guard(`effect:${e.type}`, () => applyEffect(room, e, seats, now));
  }

  function applyEffect(room: RoomState, e: RoomEffect, seats: Seat[], now: number): void {
    {
      switch (e.type) {
        case "openRound":
          for (const seat of seats) {
            const v = roundOpenView(room, seat.playerId);
            if (v) send(socketOfSeat(seat), "round:open", v);
          }
          if (room.match && room.match.roundNo === 1) metrics.counters.matchesStarted++;
          break;
        case "reveal":
          for (const seat of seats) {
            const v = revealView(room, seat.playerId);
            if (v) send(socketOfSeat(seat), "round:reveal", v);
            probe(socketOfSeat(seat));
          }
          break;
        case "result": {
          const v = resultView(room);
          if (v) for (const seat of seats) send(socketOfSeat(seat), "match:result", v);
          if (v?.aborted) metrics.counters.matchesAborted++;
          else metrics.counters.matchesFinished++;
          logger.info(v?.aborted ? "rt.match.aborted" : "rt.match.finished", { room: roomHash(room.code), players: room.match?.ids.length ?? 0, reason: v?.reason });
          break;
        }
        case "emitState":
          for (const seat of seats) send(socketOfSeat(seat), "room:state", roomStateView(room, seat.playerId, now, deps.roomConfig));
          break;
        case "notice":
          for (const seat of seats) if (!e.to || e.to === seat.playerId) send(socketOfSeat(seat), "notice", { code: e.code, deadlineTs: e.deadlineMs });
          break;
        case "kicked": {
          const seat = seatsByPlayer.get(e.playerId);
          if (seat) {
            send(socketOfSeat(seat), "notice", { code: "KICKED", deadlineTs: null });
            // Kitiltás a szoba élettartamára: a jegy-alany, vendégnél az IP-kulcs is (új vendégjeggyel se jöhessen vissza).
            const set = bans.get(room.code) ?? new Set<string>();
            set.add(seat.identity);
            if (seat.kind === "guest") set.add(`ip:${seat.ip}`);
            bans.set(room.code, set);
          }
          break;
        }
        case "removed": {
          const seat = seatsByPlayer.get(e.playerId);
          if (seat) releaseSeat(seat);
          break;
        }
        case "close":
          for (const seat of seats) {
            send(socketOfSeat(seat), "notice", { code: "ROOM_CLOSED", deadlineTs: null });
            releaseSeat(seat);
          }
          bans.delete(room.code);
          roomOwnerIp.delete(room.code);
          logger.info("rt.room.closed", { room: roomHash(room.code), reason: e.reason });
          break;
        case "persist":
        case "accepted":
          break;
      }
    }
  }

  /** Késésmérés: a kliens a `clock:probe`-ot azonnal nyugtázza; az oda-vissza idő a játékos utolsó 5 mintájába kerül. */
  function probe(socket: Socket | undefined): void {
    if (!socket || !socket.connected) return;
    const sentAt = deps.now();
    socket.timeout(5_000).emit("clock:probe", { serverTs: sentAt }, (err: Error | null) =>
      guard("probe", () => {
        if (err) return;
        const data = socket.data as SocketData;
        if (!data.seat) return;
        data.seat.rtt.push(deps.now() - sentAt);
        if (data.seat.rtt.length > 5) data.seat.rtt.shift();
      }),
    );
  }

  function capacityFor(cfg: RtConfig): number {
    const runs = cfg.runsPriority === "on" || (cfg.runsPriority === "auto" && deps.activeRunCount() > 0);
    return runs ? cfg.maxRoomsDuringRuns : cfg.maxRooms;
  }

  function newSeat(identity: string, roomCode: string, playerId: string, socket: Socket): Seat {
    const data = socket.data as SocketData;
    const seat: Seat = { identity, roomCode, playerId, resumeToken: randomBytes(24).toString("base64url"), resumeIssuedAt: deps.now(), prevResume: null, socketId: socket.id, rtt: [], ip: data.ip, kind: data.claims?.kind ?? null };
    seatsByIdentity.set(identity, seat);
    seatsByResume.set(seat.resumeToken, seat);
    seatsByPlayer.set(playerId, seat);
    (socket.data as SocketData).seat = seat;
    (socket.data as SocketData).intentUsed = true;
    return seat;
  }

  /**
   * JM3a-2 (review #464 ÚJ-2, review K1): minden sikeres visszaülésnél új token. `pending` (kézfogás): a régi token a kliens
   * nyugtájáig — legfeljebb a türelmi ideig — még visszaültet erre a helyre (egy elveszett `welcome` nem zárja ki a játékost);
   * ismételt elvesztésnél a legrégebbi, nyugtázott token marad a tartalék, a soha meg nem érkezett közbülső token törlődik.
   * `hard` (új jeggyel saját helyre ülés): a régi token azonnal érvénytelen.
   */
  function rotateResume(seat: Seat, mode: "pending" | "hard"): void {
    const old = seat.resumeToken;
    if (mode === "hard") {
      seatsByResume.delete(old);
      if (seat.prevResume) seatsByResume.delete(seat.prevResume.token);
      seat.prevResume = null;
    } else if (seat.prevResume) {
      seatsByResume.delete(old); // a meg nem érkezett közbülső token
      seat.prevResume = { token: seat.prevResume.token, until: deps.now() + RT_RECONNECT_GRACE_MS };
    } else {
      seat.prevResume = { token: old, until: deps.now() + RT_RECONNECT_GRACE_MS };
    }
    seat.resumeToken = randomBytes(24).toString("base64url");
    seat.resumeIssuedAt = deps.now();
    seatsByResume.set(seat.resumeToken, seat);
  }

  function releaseResumeTokens(seat: Seat): void {
    seatsByResume.delete(seat.resumeToken);
    if (seat.prevResume) seatsByResume.delete(seat.prevResume.token);
    seat.prevResume = null;
  }

  /** A kliens nyugtázta az új tokent (`welcome` ack): a forgatás végleges, az előző token érvénytelen. */
  function confirmResume(seat: Seat, socketId: string, token: string): void {
    if (seat.socketId !== socketId || seat.resumeToken !== token || !seat.prevResume) return;
    if (seatsByResume.get(seat.prevResume.token) === seat) seatsByResume.delete(seat.prevResume.token);
    seat.prevResume = null;
  }

  function welcome(socket: Socket, seat: Seat | null, resumed: boolean): void {
    const data = socket.data as SocketData;
    const room = seat ? registry.get(seat.roomCode) : undefined;
    const me = room?.players.find((p) => p.id === seat?.playerId);
    const intent = resumed
      ? { kind: "resume" as const, code: seat?.roomCode ?? null }
      : data.claims!.intent.kind === "join"
        ? { kind: "join" as const, code: data.claims!.intent.code }
        : { kind: "create" as const, code: null };
    const issued = seat?.resumeToken ?? null;
    const payload: RtServerPayload<"welcome"> = {
      protocol: PROTOCOL_VERSION,
      playerId: seat?.playerId ?? null,
      nickname: me?.nickname ?? data.claims?.nickname ?? "Játékos",
      avatar: me?.avatar ?? data.claims?.avatar ?? null,
      resumeToken: seat?.resumeToken ?? null,
      serverTs: deps.now(),
      resumed,
      limits: {
        maxMessageBytes: RT_MAX_MESSAGE_BYTES,
        messagesPerSec: RT_MESSAGES_PER_SEC,
        reconnectGraceMs: RT_RECONNECT_GRACE_MS,
        minPlayers: RT_MIN_PLAYERS,
        maxPlayers: RT_MAX_PLAYERS,
      },
      intent,
    };
    if (!socket.connected) return;
    // A kliens a token átvétele után nyugtáz (K1): csak ekkor véglegesedik a forgatás.
    socket.emit("welcome", payload, () => guard("welcome-ack", () => seat && issued && confirmResume(seat, socket.id, issued)));
  }

  // --- Kézfogás: jegy vagy folytatási token -------------------------------------------------------------------------
  io.use((socket, next) => {
    try {
      handshake(socket, next);
    } catch (error) {
      guard("handshake", () => {
        throw error;
      });
      next(rtError("BAD_MESSAGE"));
    }
  });

  function handshake(socket: Socket, next: (err?: Error) => void): void {
    const cfg = deps.config();
    const ip = ipOf(socket.request);
    /** `count`: csak a hamisításra utaló hiba (rossz aláírás / alak) számít a szigorú IP-korlátba — a lejárt / felhasznált
     *  jegy és a megszűnt szoba folytatási tokenje (pl. telepítés után egy egész osztály) nem zárhat ki egy közös NAT-ot. */
    const fail = (code: RtErrorCode, count = false) => {
      metrics.reject(code);
      if (count) handshakeFailures.hit(ip);
      next(rtError(code));
    };
    if (cfg.mode === "off") return fail("FEATURE_DISABLED");
    if (handshakeFailures.peek(ip) >= cfg.handshakeFailuresPerMinPerIp) return fail("RATE_LIMITED");
    const rawAuth = socket.handshake.auth as unknown;
    const auth = authSchema.safeParse(rawAuth);
    if (!auth.success) {
      const v = rawAuth && typeof rawAuth === "object" ? (rawAuth as { v?: unknown }).v : undefined;
      return v !== undefined && v !== PROTOCOL_VERSION ? fail("UNSUPPORTED_VERSION") : fail("INVALID_TICKET", true);
    }
    const data: SocketData = { claims: null, ip, seat: null, intentUsed: false, tokens: RT_MESSAGES_PER_SEC, tokensAt: deps.now(), overflow: 0, lastReactionAt: 0 };
    if ("resume" in auth.data) {
      // Ismeretlen / visszavont folytatási token: a szoba megszűnt (pl. telepítés, lezárás) — egyértelmű kód, hely nem jön létre.
      const seat = seatsByResume.get(auth.data.resume);
      if (!seat || !registry.get(seat.roomCode)) return fail("ROOM_NOT_FOUND");
      // Szerveroldali lejárat: a túl régi (pl. egy elfelejtett lapfülben ülő) token nem ad vissza helyet.
      if (deps.now() - seat.resumeIssuedAt > RESUME_TOKEN_MAX_AGE_MS) {
        releaseResumeTokens(seat);
        return fail("ROOM_NOT_FOUND");
      }
      // Az előző (nyugtázatlan forgatás előtti) token csak a türelmi időn belül, és csak erre a helyre ültet vissza.
      if (auth.data.resume !== seat.resumeToken) {
        if (!seat.prevResume || seat.prevResume.token !== auth.data.resume || deps.now() > seat.prevResume.until) {
          seatsByResume.delete(auth.data.resume);
          return fail("ROOM_NOT_FOUND");
        }
      }
      rotateResume(seat, "pending");
      data.seat = seat;
      data.intentUsed = true;
      socket.data = data;
      return next();
    }
    if (deps.isDraining()) return fail("SERVER_RESTART");
    const result = tickets.consume(auth.data.ticket);
    if (!result.ok) return fail("INVALID_TICKET", result.reason === "SIGNATURE" || result.reason === "MALFORMED");
    // Szobanyitási jog (JM3a, D21 / JM-A4) a kézfogáskor is: a `create` jegyet csak a mód szerinti jogcím használhatja
    // (admin módban admin; `on` módban játékos-fiók / tanulói profil / admin). Csatlakozni kóddal bárki tud (vendég is).
    if (result.claims.intent.kind === "create" && !canCreateRoom(cfg.mode, result.claims.kind)) return fail(cfg.mode === "admin" ? "FEATURE_DISABLED" : "ACCOUNT_REQUIRED");
    data.claims = result.claims;
    socket.data = data;
    next();
  }

  io.on("connection", (socket) => guard("connection", () => onConnection(socket)));

  function onConnection(socket: Socket): void {
    const data = socket.data as SocketData;
    metrics.counters.connections++;
    metrics.counters.handshakesOk++;

    // Folytatás: a hely átkerül az új kapcsolatra (a régi, ha még él, lekapcsolódik), és teljes állapot megy ki.
    let resumed = false;
    if (data.seat) {
      const seat = data.seat;
      const old = socketOfSeat(seat);
      if (old && old.id !== socket.id) {
        // A régebbi lapfül érthető zárást kap (nem 60 s „Kapcsolódás újra…”): a játék egy másik lapon folytatódik.
        (old.data as SocketData).seat = null;
        send(old, "notice", { code: "SESSION_MOVED", deadlineTs: null });
        old.disconnect(true);
      }
      seat.socketId = socket.id;
      const r = registry.dispatch(seat.roomCode, { type: "reconnect", playerId: seat.playerId });
      if (r.error) {
        releaseSeat(seat);
        data.seat = null;
        send(socket, "notice", { code: "ROOM_CLOSED", deadlineTs: null });
        socket.disconnect(true);
        return;
      }
      resumed = true;
    }
    welcome(socket, data.seat, resumed);
    if (data.seat) {
      const room = registry.get(data.seat.roomCode);
      if (room) send(socket, "room:state", roomStateView(room, data.seat.playerId, deps.now(), deps.roomConfig));
    }
    // Kezdeti késésminták (3 próba), utána körönként egy.
    for (let i = 0; i < 3; i++) setTimeout(() => guard("probe-start", () => probe(socket)), 50 + i * 300).unref?.();

    // Csomagonkénti korlát (token-vödör): a túllépő csomag eldobva; tartós elárasztásnál bontás.
    socket.use((packet, next) => {
      const t = deps.now();
      data.tokens = Math.min(RT_MESSAGES_PER_SEC, data.tokens + ((t - data.tokensAt) / 1000) * RT_MESSAGES_PER_SEC);
      data.tokensAt = t;
      metrics.counters.messagesIn++;
      if (data.tokens < 1) {
        data.overflow++;
        metrics.reject("RATE_LIMITED");
        const ack = packet[packet.length - 1];
        if (typeof ack === "function") (ack as (a: RtAck) => void)({ ok: false, code: "RATE_LIMITED" });
        else send(socket, "error", { code: "RATE_LIMITED" });
        if (data.overflow >= RT_FLOOD_DISCONNECT_AFTER) socket.disconnect(true);
        return;
      }
      data.tokens -= 1;
      next();
    });

    socket.onAny((event: string, ...args: unknown[]) => {
      if ((CLIENT_EVENTS as string[]).includes(event)) return;
      metrics.reject("BAD_MESSAGE");
      const ack = args[args.length - 1];
      if (typeof ack === "function") (ack as (a: RtAck) => void)({ ok: false, code: "BAD_MESSAGE" });
      else send(socket, "error", { code: "BAD_MESSAGE" });
    });

    for (const event of CLIENT_EVENTS) {
      socket.on(event, (...args: unknown[]) => {
        const ackArg = args[args.length - 1];
        const ack = typeof ackArg === "function" ? (ackArg as (a: RtAck) => void) : null;
        const payload = ack ? (args.length > 1 ? args[0] : undefined) : args[0];
        const parsed = parseClientEvent(event, payload);
        const reply = (code: RtErrorCode | null, extra?: ReplyExtra) => {
          if (code) metrics.reject(code);
          const cid = parsed && typeof (parsed as { cid?: unknown }).cid === "string" ? (parsed as { cid: string }).cid : undefined;
          if (ack) ack(code ? { ok: false, code } : { ok: true, ...(extra ?? {}) });
          else if (code) send(socket, "error", cid ? { cid, code } : { code });
        };
        if (!parsed) return reply("BAD_MESSAGE");
        try {
          handle(socket, event, parsed as never, reply);
        } catch (error) {
          logger.warn("rt.handler.error", { event, error: error instanceof Error ? error.message : String(error) });
          reply("BAD_MESSAGE");
        }
      });
    }

    socket.on("disconnect", () =>
      guard("disconnect", () => {
        const seat = data.seat;
        if (!seat || seat.socketId !== socket.id) return;
        seat.socketId = null;
        registry.dispatch(seat.roomCode, { type: "disconnect", playerId: seat.playerId });
      }),
    );

    // Jeggyel csatlakozott, de szobába nem lépő kapcsolat nem foglalhat kapacitást (review #452 KÖZEPES-3).
    if (!data.seat) {
      const t = setTimeout(
        () =>
          guard("no-room", () => {
            if (!data.seat && socket.connected) {
              metrics.reject("NO_ROOM_TIMEOUT");
              socket.disconnect(true);
            }
          }),
        deps.config().noRoomTimeoutMs,
      );
      t.unref?.();
    }
  }

  type ReplyExtra = { roomCode?: string; playerId?: string; resumeToken?: string };
  type Reply = (code: RtErrorCode | null, extra?: ReplyExtra) => void;

  function handle(socket: Socket, event: RtClientEvent, payload: Record<string, unknown>, reply: Reply): void {
    const data = socket.data as SocketData;
    const cfg = deps.config();
    switch (event) {
      case "clock:ping":
        send(socket, "clock:pong", { t0: payload.t0 as number, serverTs: deps.now() });
        return reply(null);
      case "room:create":
      case "room:join": {
        if (data.seat) return reply("ALREADY_IN_ROOM");
        const claims = data.claims;
        if (!claims || data.intentUsed) return reply("INVALID_TICKET");
        if (deps.isDraining()) return reply("SERVER_RESTART");
        // Egy játékos egy szobában. JM3a: ha a korábbi hely kapcsolata MÁR MEGSZAKADT (bezárt lap, újratöltés — a folytatási
        // token elveszett), az új, kifejezett szándék a régi helyet elhagyja — de csak a kérés SIKERES ellenőrzése és
        // végrehajtása UTÁN (review #464 A2: egy rossz kódos csatlakozás nem zárhatja le a saját futó meccsét). Élő
        // kapcsolatnál (pl. két nyitott lap) marad az ALREADY_IN_ROOM.
        const stale = seatsByIdentity.get(claims.sub) ?? null;
        if (stale && socketOfSeat(stale)?.connected) return reply("ALREADY_IN_ROOM");
        const leaveStale = () => {
          if (!stale) return;
          registry.dispatch(stale.roomCode, { type: "leave", playerId: stale.playerId });
          releaseSeat(stale);
        };
        const grade = payload.grade as number;
        if (event === "room:create") {
          if (claims.intent.kind !== "create") return reply("INVALID_TICKET");
          const gameId = payload.gameId as RoomState["gameId"];
          const mode = payload.mode as RoomState["mode"];
          if (!cfg.games.includes(gameId) || !RT_SUPPORTED_MODES.includes(mode)) return reply("GAME_NOT_ENABLED");
          if (roomsPerIp.hit(data.ip) > cfg.roomsPerMinPerIp) return reply("RATE_LIMITED");
          let mine = 0;
          for (const [c, ownerIp] of roomOwnerIp) if (ownerIp === data.ip && registry.get(c)) mine++;
          if (mine >= cfg.concurrentRoomsPerIp) return reply("RATE_LIMITED");
          if (registry.counts().activeRooms >= capacityFor(cfg)) return reply("CAPACITY");
          const settings = payload.settings as { band?: number; subjects?: string[] };
          const playerId = newPlayerId();
          data.intentUsed = true;
          const { code } = registry.create({
            gameId,
            mode,
            seed: generateMatchSeed(),
            settings: { band: settings.band, subjects: settings.subjects, maxPlayers: cfg.roomMaxPlayers },
            host: { playerId, nickname: claims.nickname, avatar: claims.avatar, grade },
          });
          const seat = newSeat(claims.sub, code, playerId, socket);
          leaveStale();
          roomOwnerIp.set(code, data.ip);
          metrics.counters.roomsCreated++;
          logger.info("rt.room.created", { room: roomHash(code), gameId });
          reply(null, { roomCode: code, playerId, resumeToken: seat.resumeToken });
          const room = registry.get(code);
          if (room) send(socket, "room:state", roomStateView(room, playerId, deps.now(), deps.roomConfig));
          return;
        }
        // room:join — a jegy a szobához kötött: egy jegy egy kódot próbálhat (a találgatást a jegy-korlát fogja).
        const code = payload.code as string;
        if (claims.intent.kind !== "join" || claims.intent.code !== code) return reply("INVALID_TICKET");
        if (joinsPerIp.hit(data.ip) > cfg.joinAttemptsPerMinPerIp) return reply("RATE_LIMITED");
        data.intentUsed = true;
        if (!registry.get(code)) return reply("ROOM_NOT_FOUND");
        const banned = bans.get(code);
        if (banned && (banned.has(claims.sub) || (claims.kind === "guest" && banned.has(`ip:${data.ip}`)))) return reply("KICKED");
        // Review #464 (vercel 4589568096): ugyanaz a (fiókos / tanulói) játékos új jeggyel a SAJÁT szobájába tér vissza
        // (lap-újratöltés, elveszett folytatási token) → a megszakadt SAJÁT helyére ül vissza, egyetlen szinkron lépésben
        // (nincs ablak, amelyben a hely szabad és egy idegen beülne; a 2 fős plafonba így a saját helye nem „idegenként”
        // számít). Váróteremben és meccs közben is: a pontok, a válasz és a gazdaság megmarad (ugyanaz, mint a folytatás).
        if (stale && stale.roomCode === code) {
          const back = registry.dispatch(code, { type: "reconnect", playerId: stale.playerId });
          if (!back.error) {
            stale.socketId = socket.id;
            stale.ip = data.ip;
            data.seat = stale;
            rotateResume(stale, "hard"); // a régi (pl. egy elhagyott lapfülben tárolt) token érvénytelen
            reply(null, { roomCode: code, playerId: stale.playerId, resumeToken: stale.resumeToken });
            const room = registry.get(code);
            if (room) send(socket, "room:state", roomStateView(room, stale.playerId, deps.now(), deps.roomConfig));
            return;
          }
        }
        const playerId = newPlayerId();
        const seat = newSeat(claims.sub, code, playerId, socket);
        const r = registry.dispatch(code, { type: "join", playerId, nickname: claims.nickname, avatar: claims.avatar, grade });
        if (r.error) {
          releaseSeat(seat);
          if (stale) seatsByIdentity.set(claims.sub, stale); // a régi (megszakadt) hely érintetlen marad
          return reply(r.error);
        }
        leaveStale();
        return reply(null, { roomCode: code, playerId, resumeToken: seat.resumeToken });
      }
      case "react": {
        const seat = data.seat;
        if (!seat) return reply("NOT_IN_ROOM");
        const reactionId = payload.reactionId;
        if (!isReactionId(reactionId)) return reply("BAD_MESSAGE");
        const t = deps.now();
        if (t - data.lastReactionAt < RT_REACTION_MIN_GAP_MS) return reply("RATE_LIMITED");
        data.lastReactionAt = t;
        const room = registry.get(seat.roomCode);
        if (!room) return reply("ROOM_NOT_FOUND");
        for (const other of roomSeats(room)) send(socketOfSeat(other), "react", { playerId: seat.playerId, reactionId });
        return reply(null);
      }
      default: {
        const seat = data.seat;
        if (!seat) return reply("NOT_IN_ROOM");
        const code = seat.roomCode;
        let r;
        switch (event) {
          case "room:ready":
            r = registry.dispatch(code, { type: "ready", playerId: seat.playerId, ready: payload.ready as boolean });
            break;
          case "room:start":
            r = registry.dispatch(code, { type: "start", playerId: seat.playerId });
            break;
          case "round:answer":
            r = registry.dispatch(code, {
              type: "answer",
              playerId: seat.playerId,
              round: payload.round as number,
              optionIndex: payload.optionIndex as number,
              clientRtMs: (payload.clientRtMs as number | null | undefined) ?? null,
              medianRttMs: latencyAllowanceMs(seat.rtt),
            });
            break;
          case "room:leave":
            r = registry.dispatch(code, { type: "leave", playerId: seat.playerId });
            if (!r.error) releaseSeat(seat);
            break;
          case "room:rematch":
            r = registry.dispatch(code, { type: "rematch", playerId: seat.playerId });
            break;
          case "room:kick": {
            const target = payload.playerId as string;
            r = registry.dispatch(code, { type: "kick", playerId: seat.playerId, target });
            break;
          }
          default:
            return reply("BAD_MESSAGE");
        }
        return reply(r.error ?? null);
      }
    }
  }

  return {
    io,
    onEffects,
    connections(): number {
      return io.engine.clientsCount;
    },
    seatCount(): number {
      return seatsByPlayer.size;
    },
    /** Minden kapcsolat bontása (a leállítás végén): a nyitott WebSocket / polling nem tarthatja fel a `server.close()`-t. */
    disconnectAll(): void {
      io.disconnectSockets(true);
      io.engine.close();
    },
  };
}

export type Gateway = ReturnType<typeof createGateway>;
