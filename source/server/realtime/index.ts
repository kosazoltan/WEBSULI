/**
 * JM2 — a valós idejű réteg összeállítása (végrehajtás JM2; terv 10.3, 10.8).
 *
 *   const rt = getRealtime();                       // olcsó: sem a Socket.IO, sem a kérdésbank nem töltődik be
 *   app.use("/api/rt", createRtRouter(rt));         // POST /api/rt/ticket, GET /api/rt/status  (S/routes/rt.ts)
 *   if (MP_MODE !== "off") await rt.attach(server); // CSAK bekapcsolt módban: Socket.IO + a kérdésbank lusta betöltése
 *   beginRealtimeShutdown(rt, server, { windowMs }) // SIGTERM: rövid, rendezett lezárás, utána a meglévő sorrend
 *
 * A tesztek saját példányt építenek injektált órával, bankkal és konfigurációval.
 */
import type { Server as HttpServer } from "node:http";
import { PROTOCOL_VERSION, type RtAdminStatus, type RtStatus } from "../../shared/duel/protocol";
import type { RoomConfig, RoomQuestionRequest } from "../../shared/duel/room-machine";
import type { DuelQuestion } from "../../shared/duel/questions";
import { logger as appLogger } from "../lib/logger";
import { rtConfig, type RtConfig } from "./config";
import type { Gateway } from "./gateway";
import { createMetrics, createRoomHasher } from "./metrics";
import { createRegistry } from "./registry";
import { createTicketService, ticketSecret, type TicketService } from "./ticket";

export type RealtimeOptions = {
  config?: () => RtConfig;
  now?: () => number;
  /** Tesztekhez: kész kérdés-szolgáltató / időzítés. Hiányában az éles bank az `attach()`-kor töltődik be (lustán). */
  roomConfig?: RoomConfig;
  activeRunCount?: () => number;
  secret?: string | null;
  logger?: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void };
};

/** A leállítási üzenet-ablak alapja: ennyi ideig marad nyitva a listener, hogy a lezáró üzenet a polling-klienshez is
 *  eljusson (orkesztrátori döntés, review #452). `MP_DRAIN_WINDOW_MS`, 0–5000. */
export const RT_DRAIN_WINDOW_MS = 2_500;
export function drainWindowMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MP_DRAIN_WINDOW_MS;
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5_000 ? n : RT_DRAIN_WINDOW_MS;
}

export function createRealtimeService(opts: RealtimeOptions = {}) {
  const config = opts.config ?? (() => rtConfig());
  const now = opts.now ?? Date.now;
  const log = opts.logger ?? appLogger;
  const secret = opts.secret === undefined ? ticketSecret() : opts.secret;
  const tickets: TicketService | null = secret ? createTicketService({ secret, now }) : null;
  const roomHash = createRoomHasher(secret);
  const metrics = createMetrics();
  let activeRunCount = opts.activeRunCount ?? (() => 0);
  let gateway: Gateway | null = null;
  let draining = false;
  let drainPromise: Promise<void> | null = null;
  let bankLoaded = !!opts.roomConfig;
  let provider: (req: RoomQuestionRequest) => DuelQuestion | null = opts.roomConfig?.provider ?? (() => {
    throw new Error("a kérdésbank nincs betöltve (a réteg nincs felcsatolva)");
  });
  const roomConfig: RoomConfig = { provider: (req) => provider(req), timing: opts.roomConfig?.timing };

  const registry = createRegistry({
    roomConfig,
    now,
    onEffects: (room, effects) => gateway?.onEffects(room, effects),
    onError: (where, room, error) =>
      log.warn("rt.error", { where, room: room ? roomHash(room.code) : null, error: error instanceof Error ? error.message : String(error) }),
  });

  function runsPriorityActive(cfg: RtConfig): boolean {
    return cfg.runsPriority === "on" || (cfg.runsPriority === "auto" && activeRunCount() > 0);
  }
  function capacity(cfg: RtConfig): number {
    return runsPriorityActive(cfg) ? cfg.maxRoomsDuringRuns : cfg.maxRooms;
  }

  const service = {
    config,
    tickets,
    registry,
    metrics,
    now,
    roomHash,
    get draining() {
      return draining;
    },
    get gateway() {
      return gateway;
    },
    get bankLoaded() {
      return bankLoaded;
    },
    setActiveRunCount(fn: () => number) {
      activeRunCount = fn;
    },
    /**
     * A Socket.IO felcsatolása (egyszer) — CSAK bekapcsolt módban hívandó (review #452 ALACSONY-2: `off` mellett a szerver
     * a mostanival azonos: nincs figyelő az útvonalon, a bank nincs a memóriában). A Socket.IO és a bank itt, lustán töltődik.
     * Titok nélkül (SESSION_SECRET) nem csatol fel (a réteg kikapcsoltként viselkedik).
     */
    async attach(httpServer: HttpServer, attachOpts: { destroyUpgrade?: boolean } = {}): Promise<Gateway> {
      if (gateway) return gateway;
      if (!tickets) throw new Error("SESSION_SECRET nélkül a valós idejű réteg nem indul");
      if (!bankLoaded) {
        const { createQuestionProvider } = await import("./question-provider");
        provider = createQuestionProvider();
        bankLoaded = true;
      }
      const { createGateway } = await import("./gateway");
      gateway = createGateway(
        httpServer,
        { registry, tickets, metrics, config, roomConfig, now, logger: log, activeRunCount: () => activeRunCount(), isDraining: () => draining, roomHash },
        { destroyUpgrade: attachOpts.destroyUpgrade ?? true },
      );
      return gateway;
    },
    /** Nyilvános: elérhető-e, és hány meccs fut (telepítés előtti őr) — gyártási állapot, kapcsolatszám nélkül. */
    status(): RtStatus {
      const cfg = config();
      const enabled = cfg.mode !== "off" && !!tickets && !!gateway;
      const counts = registry.counts();
      return {
        enabled,
        mode: cfg.mode,
        games: enabled ? cfg.games : [],
        available: !enabled ? "off" : draining ? "draining" : counts.activeRooms >= capacity(cfg) ? "full" : "ok",
        activeMatches: counts.activeMatches,
        protocol: PROTOCOL_VERSION,
      };
    },
    /** Admin-őr mögött (`GET /api/admin/rt/status`): a részletes számok. */
    adminStatus(): RtAdminStatus {
      const cfg = config();
      const counts = registry.counts();
      return {
        ...service.status(),
        activeRooms: counts.activeRooms,
        connections: gateway ? gateway.connections() : 0,
        draining,
        runsPriority: runsPriorityActive(cfg),
        capacity: capacity(cfg),
        bankLoaded,
      };
    },
    /**
     * Leállítás (SIGTERM; orkesztrátori döntés, review #452): új jegy / szoba / belépés AZONNAL tiltva, minden futó meccs
     * AZONNAL, rendezetten lezárul a pillanatnyi állással (`match:result` részeredménnyel, `reason: SERVER_RESTART`, majd
     * `notice SERVER_RESTART` + `ROOM_CLOSED`); a `windowMs` ablak a lezáró üzenet kiküldésére való, utána MINDEN
     * kapcsolat bontódik. Szoba nélkül (pl. `MP_MODE=off`) azonnal kész.
     */
    drain(windowMs: number = RT_DRAIN_WINDOW_MS): Promise<void> {
      if (drainPromise) return drainPromise;
      draining = true;
      const hadRooms = registry.counts().activeRooms > 0;
      if (hadRooms) {
        log.info("rt.drain.start", { rooms: registry.counts().activeRooms, matches: registry.counts().activeMatches, windowMs });
        registry.drainAll(now());
      }
      drainPromise = new Promise<void>((resolve) => {
        const finish = () => {
          try {
            gateway?.disconnectAll();
          } catch (error) {
            log.warn("rt.error", { where: "drain", error: error instanceof Error ? error.message : String(error) });
          }
          registry.clear();
          if (hadRooms) log.info("rt.drain.done", {});
          resolve();
        };
        if (!hadRooms) return finish();
        const t = setTimeout(finish, windowMs);
        t.unref?.();
      });
      return drainPromise;
    },
    /** Teljes leállítás (tesztek): kapcsolatok bontása, a HTTP-szerver bezárása NÉLKÜL. */
    close(): void {
      gateway?.disconnectAll();
      registry.clear();
    },
  };
  return service;
}

export type RealtimeService = ReturnType<typeof createRealtimeService>;

/**
 * SIGTERM-sorrend (orkesztrátori döntés, review #452): a réteg rövid, rendezett lezárása, utána a meglévő sorrend.
 *  - Volt szoba (futó meccs / váróterem): a meccsek azonnal lezárulnak; a `server.close()` a `windowMs` üzenet-ablak UTÁN
 *    jön (a polling-kliens következő lekérdezése még a lezáró üzenetet kapja), utána minden a régi rendben.
 *  - Nem volt szoba (pl. `MP_MODE=off` — az alap): a `server.close()` AZONNAL, pontosan a mostani sorrendben.
 * Hosszú kifutás nincs: a Render a SIGTERM előtt az új példányra váltja a forgalmat, a régi példány memóriájában élő meccs
 * úgysem folytatódhatna, egy percekig nyitva hagyott listener viszont új munkát (pl. gyártásindítást) fogadhatna.
 * A valódi védelem a telepítés ELŐTTI őr: `GET /api/rt/status` → `activeMatches`.
 */
export function beginRealtimeShutdown(
  rt: Pick<RealtimeService, "registry" | "drain">,
  server: { close: (cb?: (err?: Error) => void) => unknown },
  opts: { windowMs: number; onHttpClosed?: () => void },
): { drained: Promise<void>; httpClosed: Promise<void>; delayedClose: boolean } {
  const delayedClose = rt.registry.counts().activeRooms > 0;
  const drained = rt.drain(opts.windowMs);
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

/** Az éles példány (lusta, olcsó: a Socket.IO és a bank csak az `attach()`-kor töltődik). */
export function getRealtime(): RealtimeService {
  if (!singleton) singleton = createRealtimeService();
  return singleton;
}
