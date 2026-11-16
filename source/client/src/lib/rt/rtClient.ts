/**
 * JM2 — vékony protokoll-kliens az online szobához (terv 10.3; a felület a JM3-ban jön). A `socket.io-client` LUSTÁN
 * töltődik (`import()`), így a fő JS-darabba nem kerül; ezt a modult csak a többjátékos képernyők importálják.
 *
 *   const t = await requestRtTicket({ intent: "create" });
 *   const rt = await connectRt({ ticket: t.ticket, path: t.path });
 *   rt.onState((s) => …);                     // csak a növekvő `seq`-ű állapot jut át
 *   await rt.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} });
 *
 * Újracsatlakozás: a Socket.IO automatikusan újrapróbál; a második kézfogástól a kliens a szervertől kapott folytatási
 * tokent küldi (a belépőjegy egyszer használatos), a szerver a teljes szobaállapottal válaszol. A jegy és a token csak a
 * kézfogás `auth` mezőjében megy, URL-ben soha. A `clock:probe`-ot a kliens automatikusan nyugtázza (késésmérés).
 */
import type { Socket } from "socket.io-client";
import {
  PROTOCOL_VERSION,
  RT_PATH,
  RT_TICKET_PATH,
  type RtAck,
  type RtClientEvent,
  type RtClientPayload,
  type RtRoomState,
  type RtServerEvent,
  type RtServerPayload,
} from "@shared/duel/protocol";

export type RtTicketResponse = { ticket: string; expiresIn: number; path: string; directUrl: string | null; nickname: string; grade: number | null };

/** Belépőjegy kérése a megszokott HTTP-úton (munkamenet-süti; tanulói profilnál a token fejlécben). */
export async function requestRtTicket(
  body: { intent: "create" } | { intent: "join"; code: string },
  opts: { learnerToken?: string | null; fetchImpl?: typeof fetch; baseUrl?: string } = {},
): Promise<RtTicketResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.learnerToken) headers["x-learner-token"] = opts.learnerToken;
  const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl ?? ""}${RT_TICKET_PATH}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string };
    throw Object.assign(new Error(data.code ?? `HTTP_${res.status}`), { code: data.code ?? `HTTP_${res.status}`, status: res.status });
  }
  return (await res.json()) as RtTicketResponse;
}

export type ConnectRtOptions = {
  ticket: string;
  /** A szerver címe; üres = azonos eredet (a Vercel-proxyn át). A `directUrl` (ha van) ide kerülhet. */
  url?: string;
  path?: string;
  /** Pl. `["polling"]` a Vercel-továbbítás szimulálásához; alap: polling, majd WebSocket-frissítés. */
  transports?: ("polling" | "websocket")[];
  /** Tesztekhez: a `socket.io-client` `io` függvénye (különben lusta import). */
  ioFactory?: typeof import("socket.io-client").io;
  /** Nyugta-várakozás felső határa. */
  ackTimeoutMs?: number;
  /** Node-os teszthez: azonos eredetű `Origin` fejléc (böngészőben nincs rá szükség). */
  extraHeaders?: Record<string, string>;
  /** Minden bejövő esemény (a csatlakozás előttől) — naplózáshoz / tesztekhez. */
  onEvent?: (event: string, payload: unknown) => void;
};

export type RtConnection = {
  socket: Socket;
  /** A szervertől kapott folytatási token (a `welcome`-ból); `null`, amíg nincs szobahely. */
  readonly resumeToken: string | null;
  readonly playerId: string | null;
  readonly state: RtRoomState | null;
  /** `open`: kapcsolódva; `reconnecting`: hálózati kiesés, a folytatási tokennel próbál; `closed`: végleges (kilépés után
   *  megszakadt kapcsolat, kirúgás, lezárt szoba, visszautasított folytatás) — új szobához új jegy és új `connectRt` kell. */
  readonly status: "open" | "reconnecting" | "closed";
  /** A végleges lezárás oka (pl. `INVALID_TICKET`, `ROOM_CLOSED`, `KICKED`, `LEFT`), különben `null`. */
  readonly closedCode: string | null;
  on<E extends RtServerEvent>(event: E, handler: (payload: RtServerPayload<E>) => void): () => void;
  onState(handler: (state: RtRoomState) => void): () => void;
  request<E extends Exclude<RtClientEvent, "clock:ping">>(event: E, payload: Omit<RtClientPayload<E>, "cid">): Promise<RtAck>;
  close(): void;
};

let cidCounter = 0;
function nextCid(): string {
  cidCounter = (cidCounter + 1) % 1_000_000;
  return `c${Date.now().toString(36)}${cidCounter.toString(36)}`.slice(0, 32);
}

export async function connectRt(opts: ConnectRtOptions): Promise<RtConnection> {
  const io = opts.ioFactory ?? (await import("socket.io-client")).io;
  let resumeToken: string | null = null;
  let playerId: string | null = null;
  let state: RtRoomState | null = null;
  let status: "open" | "reconnecting" | "closed" = "open";
  let closedCode: string | null = null;
  const stateHandlers = new Set<(s: RtRoomState) => void>();

  const socket = io(opts.url ?? "", {
    path: opts.path ?? RT_PATH,
    addTrailingSlash: false,
    transports: opts.transports ?? ["polling", "websocket"],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    extraHeaders: opts.extraHeaders,
    // Az első kézfogás a jegyet, a többi a folytatási tokent küldi.
    auth: (cb: (data: object) => void) => cb(resumeToken ? { v: PROTOCOL_VERSION, resume: resumeToken } : { v: PROTOCOL_VERSION, ticket: opts.ticket }),
  });

  if (opts.onEvent) socket.onAny(opts.onEvent);
  socket.on("welcome", (w: RtServerPayload<"welcome">) => {
    if (w.resumeToken) resumeToken = w.resumeToken;
    if (w.playerId) playerId = w.playerId;
  });
  socket.on("room:state", (s: RtRoomState) => {
    // Sorrenden kívüli / ismételt állapot (pl. újracsatlakozás közben) nem írja felül az újabbat.
    if (state && state.code === s.code && s.seq < state.seq) return;
    state = s;
    playerId = s.you.playerId;
    for (const h of stateHandlers) h(s);
  });
  socket.on("clock:probe", (_p: unknown, ack?: () => void) => {
    if (typeof ack === "function") ack();
  });
  /** A szobatagság törlése (a szerver a helyet felszabadította); a jegy egyszer használatos, ezért ezután nincs mivel
   *  újracsatlakozni: egy későbbi kiesés végleges lezárás. */
  const forgetSeat = () => {
    resumeToken = null;
    playerId = null;
    state = null;
  };
  const closeFor = (code: string) => {
    forgetSeat();
    status = "closed";
    closedCode = code;
    socket.io.reconnection(false);
  };
  socket.on("notice", (n: RtServerPayload<"notice">) => {
    if (n.code === "ROOM_CLOSED" || n.code === "KICKED") {
      forgetSeat();
      closedCode = n.code;
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (err: Error & { data?: { code?: string } }) => {
      socket.off("connect", onConnect);
      socket.close();
      reject(Object.assign(new Error(err.data?.code ?? err.message), { code: err.data?.code ?? err.message }));
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });

  // Az első kapcsolat után: kiesésnél csak érvényes folytatási tokennel próbálkozunk; a felhasznált jeggyel soha.
  socket.on("disconnect", (reason: string) => {
    if (status === "closed") return;
    if (reason === "io client disconnect" || !resumeToken) closeFor(closedCode ?? "DISCONNECTED");
    else status = "reconnecting";
  });
  socket.on("connect", () => {
    if (status === "reconnecting") status = "open";
  });
  // A szerver kézfogási elutasítása (pl. visszavont / lejárt folytatási token → INVALID_TICKET) végleges: nem próbálkozunk tovább.
  socket.on("connect_error", (err: Error & { data?: { code?: string } }) => {
    if (err.data?.code) closeFor(err.data.code);
  });

  return {
    socket,
    get resumeToken() {
      return resumeToken;
    },
    get playerId() {
      return playerId;
    },
    get state() {
      return state;
    },
    get status() {
      return status;
    },
    get closedCode() {
      return closedCode;
    },
    on(event, handler) {
      socket.on(event as string, handler as (...args: unknown[]) => void);
      return () => socket.off(event as string, handler as (...args: unknown[]) => void);
    },
    onState(handler) {
      stateHandlers.add(handler);
      return () => stateHandlers.delete(handler);
    },
    request(event, payload) {
      return new Promise<RtAck>((resolve) => {
        socket.timeout(opts.ackTimeoutMs ?? 8000).emit(event, { ...payload, cid: nextCid() }, (err: Error | null, ack: RtAck) => {
          if (!err && ack.ok && ack.resumeToken) resumeToken = ack.resumeToken;
          if (!err && ack.ok && ack.playerId) playerId = ack.playerId;
          // Review #452: sikeres kilépés után a szerver a helyet felszabadította — a helyi tagság is törlődik (egy
          // későbbi újracsatlakozás ne a visszavont tokent küldje).
          if (!err && ack.ok && event === "room:leave") {
            forgetSeat();
            closedCode = "LEFT";
          }
          resolve(err ? { ok: false, code: "RATE_LIMITED" } : ack);
        });
      });
    },
    close() {
      closeFor(closedCode ?? "CLOSED");
      socket.close();
    },
  };
}
