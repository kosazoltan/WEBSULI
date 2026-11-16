/**
 * JM2 — tesztsegéd a valós idejű réteghez: folyamaton belüli HTTP-szerver (Express + a valódi `/api/rt` router + a
 * valódi Socket.IO-kapu), és `socket.io-client`-es játékosok a JM2 vékony protokoll-kliensével (`rtClient.ts`).
 * Adatbázis nincs: a tanulói profil és a játékos-fiók feloldása injektált.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { io as ioClient } from "socket.io-client";
import { rtConfig } from "../../server/realtime/config";
import { createRealtimeService, type RealtimeService } from "../../server/realtime";
import { createQuestionProvider } from "../../server/realtime/question-provider";
import { createRtRouter } from "../../server/routes/rt";
import type { RoomConfig, RoomTiming } from "../../shared/duel/room-machine";
import { serverEventSchemas, type RtServerEvent } from "../../shared/duel/protocol";
import { connectRt, type RtConnection } from "../../client/src/lib/rt/rtClient";

export const LEARNER_TOKEN = "learner-token-ok";
/** A tanulói profil valódi neve — a teszt ellenőrzi, hogy SOHA nem jelenik meg egyetlen kimenő üzenetben sem. */
export const LEARNER_REAL_NAME = "Kovácsné Szabó Annamária";

export type Harness = {
  port: number;
  origin: string;
  rt: RealtimeService;
  server: http.Server;
  env: Record<string, string>;
  runs: { count: number };
  clock: { offsetMs: number };
  close(): Promise<void>;
};

export async function startHarness(
  opts: { env?: Record<string, string>; timing?: Partial<RoomTiming>; windowMs?: number; destroyUpgrade?: boolean; failGrade?: number } = {},
): Promise<Harness> {
  const env: Record<string, string> = { MP_MODE: "on", ...(opts.env ?? {}) };
  const runs = { count: 0 };
  const clock = { offsetMs: 0 };
  const base = createQuestionProvider();
  const roomConfig: RoomConfig = {
    provider: (req) => {
      // Hibainjektálás (review #452 KÖZEPES-4): ennél az évfolyamnál a kérdés-szolgáltató kivételt dob.
      if (opts.failGrade !== undefined && req.grade === opts.failGrade) throw new Error("injected provider failure");
      const q = base(req);
      return q && opts.windowMs ? { ...q, windowMs: opts.windowMs } : q;
    },
    timing: { countdownMs: 40, revealMs: 60, answerGraceMs: 150, ...(opts.timing ?? {}) },
  };
  const rt = createRealtimeService({
    config: () => rtConfig({ ...env, NODE_ENV: "test" }),
    now: () => Date.now() + clock.offsetMs,
    roomConfig,
    activeRunCount: () => runs.count,
    secret: "rt-harness-secret-0123456789abcdef0123456789",
    logger: { info: () => {}, warn: () => {} },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.get("x-test-user");
    const r = req as unknown as { user?: unknown; isAuthenticated: () => boolean };
    if (who === "admin" || who === "user") {
      r.user = { id: who === "admin" ? 1 : 2, isAdmin: who === "admin", email: "admin@example.com", firstName: "Valódi", lastName: "Admin" };
      r.isAuthenticated = () => true;
    } else r.isAuthenticated = () => false;
    next();
  });
  app.use(
    "/api/rt",
    createRtRouter(rt, {
      resolveLearner: async (token) => (token === LEARNER_TOKEN ? { id: "learner-0001", grade: 7, name: LEARNER_REAL_NAME } : null),
      getPlayer: async (req) => {
        const nick = req.get("x-test-player");
        return nick ? { id: "player-0001", nickname: decodeURIComponent(nick), banned: nick === "banned" } : null;
      },
    }),
  );
  const server = http.createServer(app);
  await rt.attach(server, { destroyUpgrade: opts.destroyUpgrade ?? true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://localhost:${port}`;
  return {
    port,
    origin,
    rt,
    server,
    env,
    runs,
    clock,
    async close() {
      rt.close();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export async function getTicket(h: Harness, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${h.port}/api/rt/ticket`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: h.origin, ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export type Player = RtConnection & {
  log: Array<[string, unknown]>;
  waitFor<E extends RtServerEvent | string>(event: E, pred?: (payload: any) => boolean, timeoutMs?: number): Promise<any>;
  events(event: string): any[];
};

export async function connectPlayer(
  h: Harness,
  ticket: string,
  opts: { transports?: ("polling" | "websocket")[]; origin?: string | null } = {},
): Promise<Player> {
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.origin = opts.origin ?? h.origin;
  const log: Array<[string, unknown]> = [];
  const waiters: Array<{ event: string; pred: (p: any) => boolean; resolve: (p: any) => void }> = [];
  const onEvent = (event: string, payload: unknown) => {
    log.push([event, payload]);
    for (const w of waiters.slice()) {
      if (w.event === event && w.pred(payload)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(payload);
      }
    }
  };
  const conn = await connectRt({ ticket, url: `http://127.0.0.1:${h.port}`, ioFactory: ioClient, transports: opts.transports, extraHeaders: headers, ackTimeoutMs: 4000, onEvent });
  return wrap(conn, log, waiters);
}

function wrap(conn: RtConnection, log: Array<[string, unknown]>, waiters: Array<{ event: string; pred: (p: any) => boolean; resolve: (p: any) => void }>): Player {
  const p = conn as Player;
  p.log = log;
  p.events = (event) => log.filter(([e]) => e === event).map(([, x]) => x);
  p.waitFor = (event, pred = () => true, timeoutMs = 8000) => {
    const existing = log.find(([e, x]) => e === event && pred(x));
    if (existing) return Promise.resolve(existing[1]);
    return new Promise((resolve, reject) => {
      const w = { event, pred, resolve };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) {
          waiters.splice(i, 1);
          reject(new Error(`timeout: ${event}`));
        }
      }, timeoutMs).unref?.();
    });
  };
  return p;
}

/** Minden kimenő üzenet megfelel a szigorú protokoll-sémának (extra mező — pl. e-mail, név, helyes index — bukás). */
export function assertAllSchemas(p: Player): void {
  for (const [event, payload] of p.log) {
    const schema = (serverEventSchemas as Record<string, { safeParse: (x: unknown) => { success: boolean; error?: unknown } }>)[event];
    if (!schema) throw new Error(`ismeretlen kimenő esemény: ${event}`);
    const r = schema.safeParse(payload);
    if (!r.success) throw new Error(`${event} séma-hiba: ${JSON.stringify((r as { error?: { issues?: unknown } }).error?.issues)} — ${JSON.stringify(payload)}`);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
