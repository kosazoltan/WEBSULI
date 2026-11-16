/**
 * JM2 — a valós idejű réteg összeállítása (végrehajtás JM2; terv 10.3, 10.8).
 *
 *   const rt = createRealtimeService({ ... });
 *   app.use("/api/rt", createRtRouter(rt));   // POST /api/rt/ticket, GET /api/rt/status  (S/routes/rt.ts)
 *   rt.attach(httpServer);                     // Socket.IO a RT_PATH-on (index.ts, a registerRoutes után)
 *   await rt.drain(240_000);                   // SIGTERM: új szoba / csatlakozás tiltva, a futó meccs kifuthat
 *
 * Az élesben használt példány a modul-szintű `realtime` (lusta: csak az első használatkor jön létre); a tesztek saját
 * példányt építenek injektált órával, bankkal és konfigurációval.
 */
import { randomBytes } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { PROTOCOL_VERSION, type RtStatus } from "../../shared/duel/protocol";
import type { RoomConfig } from "../../shared/duel/room-machine";
import { logger as appLogger } from "../lib/logger";
import { rtConfig, type RtConfig } from "./config";
import { createGateway, type Gateway } from "./gateway";
import { createMetrics } from "./metrics";
import { createQuestionProvider } from "./question-provider";
import { createRegistry } from "./registry";
import { createTicketService, ticketSecret, type TicketService } from "./ticket";

export type RealtimeOptions = {
  config?: () => RtConfig;
  now?: () => number;
  roomConfig?: RoomConfig;
  activeRunCount?: () => number;
  secret?: string | null;
  logger?: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
};

export function createRealtimeService(opts: RealtimeOptions = {}) {
  const config = opts.config ?? (() => rtConfig());
  const now = opts.now ?? Date.now;
  const log = opts.logger ?? appLogger;
  const roomConfig: RoomConfig = opts.roomConfig ?? { provider: createQuestionProvider() };
  const secret = opts.secret === undefined ? ticketSecret() : opts.secret;
  const tickets: TicketService | null = secret ? createTicketService({ secret, now }) : null;
  const metrics = createMetrics();
  let activeRunCount = opts.activeRunCount ?? (() => 0);
  let gateway: Gateway | null = null;
  let draining = false;
  let drainPromise: Promise<void> | null = null;

  const registry = createRegistry({ roomConfig, now, onEffects: (room, effects) => gateway?.onEffects(room, effects) });

  function runsPriorityActive(cfg: RtConfig): boolean {
    return cfg.runsPriority === "on" || (cfg.runsPriority === "auto" && activeRunCount() > 0);
  }

  const service = {
    config,
    tickets,
    registry,
    metrics,
    now,
    get draining() {
      return draining;
    },
    setActiveRunCount(fn: () => number) {
      activeRunCount = fn;
    },
    /** A Socket.IO felcsatolása a HTTP-szerverre (egyszer). `MP_MODE=off` mellett is felcsatolódik, de minden kézfogást
     *  `FEATURE_DISABLED`-del utasít el (a kapcsoló kérésenként, újraindítás nélkül is olvasható). */
    attach(httpServer: HttpServer, attachOpts: { destroyUpgrade?: boolean } = {}): Gateway {
      if (gateway) return gateway;
      gateway = createGateway(
        httpServer,
        { registry, tickets: tickets ?? createTicketService({ secret: randomBytes(32).toString("hex") }), metrics, config, roomConfig, now, logger: log, activeRunCount: () => activeRunCount(), isDraining: () => draining },
        { destroyUpgrade: attachOpts.destroyUpgrade ?? true },
      );
      return gateway;
    },
    get gateway() {
      return gateway;
    },
    status(): RtStatus {
      const cfg = config();
      const counts = registry.counts();
      return {
        enabled: cfg.mode !== "off" && !!tickets,
        mode: cfg.mode,
        games: cfg.mode === "off" ? [] : cfg.games,
        activeRooms: counts.activeRooms,
        activeMatches: counts.activeMatches,
        connections: gateway ? gateway.connections() : 0,
        draining,
        runsPriority: runsPriorityActive(cfg),
        protocol: PROTOCOL_VERSION,
      };
    },
    /**
     * Leállítás (SIGTERM): új jegy / szoba / csatlakozás tiltva, a váróterem azonnal zárul, a futó meccs legfeljebb
     * `deadlineMs`-ig kifut (a kliens `notice SERVER_RESTART`-ot kap a határidővel), utána részeredménnyel zárul; végül
     * MINDEN kapcsolat bontódik, hogy a nyitott WebSocket / polling ne tartsa fel a `server.close()`-t.
     */
    drain(deadlineMs: number, pollMs = 250): Promise<void> {
      if (drainPromise) return drainPromise;
      draining = true;
      const until = now() + deadlineMs;
      registry.drainAll(until);
      log.info("rt.drain.start", { rooms: registry.counts().activeRooms, matches: registry.counts().activeMatches, deadlineMs });
      drainPromise = new Promise<void>((resolve) => {
        const finish = () => {
          gateway?.disconnectAll();
          registry.clear();
          log.info("rt.drain.done", {});
          resolve();
        };
        const check = () => {
          if (registry.counts().activeRooms === 0) return finish();
          if (now() >= until + 2_000) return finish();
          const t = setTimeout(check, pollMs);
          t.unref?.();
        };
        check();
      });
      return drainPromise;
    },
    /** Teljes leállítás (tesztek): kapcsolatok bontása, a Socket.IO lezárása a HTTP-szerver bezárása NÉLKÜL. */
    close(): void {
      gateway?.disconnectAll();
      registry.clear();
    },
  };
  return service;
}

export type RealtimeService = ReturnType<typeof createRealtimeService>;

/** A leállítási kifutás alapja (terv 10.8: 240 s); `MP_DRAIN_MS`-sel szűkíthető, plafon 240 s (a Render 300 s-os türelmi
 *  idejéből — `index.ts` 295 s-os kényszerkilépése — a pool zárására és a függő levelekre is marad idő). */
export function drainMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.MP_DRAIN_MS);
  return Number.isInteger(n) && n >= 0 && n <= 240_000 ? n : 240_000;
}

/**
 * SIGTERM-sorrend (review #452): a drain indul, és
 *  - ha FUT online meccs, a HTTP-listener a drain végéig nyitva marad (a long-polling játékos minden lekérdezése /
 *    válasza új HTTP-kérés — a korai `server.close()` elvágná a kifutás és az eredmény elől; az új belépést a drain-őrök
 *    utasítják el), és a `server.close()` a drain után jön;
 *  - ha nincs futó meccs (pl. `MP_MODE=off`, ez az alap), a `server.close()` AZONNAL, a régi sorrendben fut.
 */
export function beginRealtimeShutdown(
  rt: Pick<RealtimeService, "status" | "drain">,
  server: { close: (cb?: (err?: Error) => void) => unknown },
  opts: { drainMs: number; onDrainError?: (err: unknown) => void; onHttpClosed?: () => void },
): { drained: Promise<void>; httpClosed: Promise<void>; delayedClose: boolean } {
  const delayedClose = rt.status().activeMatches > 0;
  const drained = rt.drain(opts.drainMs).catch((err: unknown) => opts.onDrainError?.(err));
  let resolveClosed: () => void = () => {};
  const httpClosed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const closeHttp = () =>
    server.close(() => {
      opts.onHttpClosed?.();
      resolveClosed();
    });
  if (delayedClose) void drained.finally(closeHttp);
  else closeHttp();
  return { drained, httpClosed, delayedClose };
}

let singleton: RealtimeService | null = null;

/** Az éles példány (lusta). */
export function getRealtime(): RealtimeService {
  if (!singleton) singleton = createRealtimeService();
  return singleton;
}
