/**
 * JM2 — a valós idejű réteg kapcsolói és korlátai (terv 10.3 „Bekapcsolás”, 10.8 „Korlátok”, D16).
 * Minden érték env-ből, hívásonként olvasva (env-váltás újraindítással él; a tesztek így állíthatják).
 *
 *  - `MP_MODE` = `off` (alap, minden más érték is) | `admin` (csak admin-munkamenet kérhet jegyet — éles próbához) | `on`;
 *  - `MP_GAMES` = vesszős engedélylista (alap: `parbaj`);
 *  - `MP_MAX_ROOMS` (alap 50) és `MP_MAX_ROOMS_DURING_RUNS` (alap 10) — aktív tananyag-gyártás / -javítás / okosítás
 *    alatt az alacsonyabb plafon él (új szobára; a futók nem szakadnak meg);
 *  - `MP_RUNS_PRIORITY` = `auto` (alap: a workflow-motor élő futás-számlálója dönt) | `on` (kézi kapcsoló: mindig a
 *    gyártás alatti plafon) | `off` (soha);
 *  - `MP_MAX_CONNECTIONS` (alap 4 × MP_MAX_ROOMS + 20), `MP_MAX_CONNECTIONS_PER_IP` (alap 40 — iskolai NAT mögött egy
 *    osztály is elférjen), `MP_TICKETS_PER_MIN_PER_IP` (alap 10), `MP_ROOMS_PER_MIN_PER_IP` (alap 5);
 *  - `MP_DIRECT_URL` — opcionális közvetlen (WebSocket-képes) cím, pl. egy Render custom domain; csak https.
 */
import { RT_DUEL_ROOM_PLAYERS, RT_GAME_IDS, RT_MAX_PLAYERS, RT_MIN_PLAYERS, type RtGameId } from "../../shared/duel/protocol";

export type MpMode = "off" | "admin" | "on";
export type RunsPriority = "auto" | "on" | "off";

export type RtConfig = {
  mode: MpMode;
  games: RtGameId[];
  maxRooms: number;
  maxRoomsDuringRuns: number;
  runsPriority: RunsPriority;
  maxConnections: number;
  maxConnectionsPerIp: number;
  ticketsPerMinPerIp: number;
  roomsPerMinPerIp: number;
  /** IP-nként egyszerre nyitott szobák (közös iskolai NAT mögött egy osztály ~8 négyfős szobát nyit: alap 8). */
  concurrentRoomsPerIp: number;
  joinAttemptsPerMinPerIp: number;
  handshakeFailuresPerMinPerIp: number;
  directUrl: string | null;
  /** Jegy nélküli (CONNECT nélküli) kapcsolat időkorlátja — `MP_CONNECT_TIMEOUT_MS`, alap 10 s. */
  connectTimeoutMs: number;
  /** Jeggyel csatlakozott, szobába nem lépő kapcsolat időkorlátja — `MP_NO_ROOM_TIMEOUT_MS`, alap 15 s. */
  noRoomTimeoutMs: number;
  /** Szobahely nélkül maradt kapcsolat bontása — `MP_SEATLESS_DISCONNECT_MS`, alap 3 s. */
  seatlessDisconnectMs: number;
  /** A párbaj-szoba mérete — `MP_ROOM_MAX_PLAYERS`, alap 2 (JM3a, review #464 H1); 3–4 a JM3b-vel (kirúgás, 3–4 fős felület). */
  roomMaxPlayers: number;
};

export function mpMode(env: NodeJS.ProcessEnv = process.env): MpMode {
  const v = (env.MP_MODE ?? "").trim().toLowerCase();
  return v === "on" || v === "admin" ? v : "off";
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function directUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

export function rtConfig(env: NodeJS.ProcessEnv = process.env): RtConfig {
  const maxRooms = int(env, "MP_MAX_ROOMS", 50, 1, 2000);
  const gamesRaw = (env.MP_GAMES ?? "parbaj").split(",").map((g) => g.trim()).filter(Boolean);
  const rp = (env.MP_RUNS_PRIORITY ?? "auto").trim().toLowerCase();
  return {
    mode: mpMode(env),
    games: RT_GAME_IDS.filter((g) => gamesRaw.includes(g)),
    maxRooms,
    maxRoomsDuringRuns: Math.min(maxRooms, int(env, "MP_MAX_ROOMS_DURING_RUNS", 10, 0, 2000)),
    runsPriority: rp === "on" || rp === "off" ? rp : "auto",
    maxConnections: int(env, "MP_MAX_CONNECTIONS", maxRooms * 4 + 20, 1, 20000),
    maxConnectionsPerIp: int(env, "MP_MAX_CONNECTIONS_PER_IP", 40, 1, 5000),
    ticketsPerMinPerIp: int(env, "MP_TICKETS_PER_MIN_PER_IP", 10, 1, 10000),
    roomsPerMinPerIp: int(env, "MP_ROOMS_PER_MIN_PER_IP", 5, 1, 10000),
    concurrentRoomsPerIp: int(env, "MP_CONCURRENT_ROOMS_PER_IP", 8, 1, 10000),
    joinAttemptsPerMinPerIp: int(env, "MP_JOINS_PER_MIN_PER_IP", 20, 1, 10000),
    roomMaxPlayers: int(env, "MP_ROOM_MAX_PLAYERS", RT_DUEL_ROOM_PLAYERS, RT_MIN_PLAYERS, RT_MAX_PLAYERS),
    handshakeFailuresPerMinPerIp: int(env, "MP_HANDSHAKE_FAILURES_PER_MIN_PER_IP", 60, 1, 10000),
    directUrl: directUrl(env.MP_DIRECT_URL),
    connectTimeoutMs: int(env, "MP_CONNECT_TIMEOUT_MS", 10_000, 100, 60_000),
    noRoomTimeoutMs: int(env, "MP_NO_ROOM_TIMEOUT_MS", 15_000, 100, 300_000),
    seatlessDisconnectMs: int(env, "MP_SEATLESS_DISCONNECT_MS", 3_000, 50, 60_000),
  };
}
