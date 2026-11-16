/**
 * Az online szoba (JM2) Socket.IO-protokollja — terv `docs/specs/2026-11-16-jatekok-jatekelmeny.md` 10.3 (D13), 10.5,
 * 10.8, 10.9; végrehajtás JM-K `protocol.ts`. Tiszta TS (kliens és szerver közös): zod-sémák minden kliens → szerver
 * eseményre (szigorú: ismeretlen mező → elutasítás), és a szerver → kliens üzenetek pontos alakja.
 *
 * Biztonsági szerződés (teszt: `tests/rt-protocol.test.ts`, `tests/rt-gateway.test.ts`):
 *  - a `round:open` és a `room:state` SOHA nem visz helyes indexet (`correctIndex` csak a `round:reveal`-ben);
 *  - a játékos-adat csak `{ id, nickname, avatar, ready, connected, hp }` — e-mail, valódi név, IP, belső azonosító nincs;
 *  - szabad szöveg nincs: a reakció csak `REACTIONS`-azonosító, a becenév szerveroldalon generált / szűrt;
 *  - a belépőjegy a csatlakozási `auth` mezőben megy (soha nem URL-ben / query-ben).
 */
import { z } from "zod";
import { REACTIONS } from "./reactions";

export const PROTOCOL_VERSION = 1 as const;

/**
 * A Socket.IO útvonala (a meglévő `/api/:path*` Vercel-rewrite alá esik). Záró perjel NÉLKÜL, a szerveren és a kliensen
 * is `addTrailingSlash: false`-szal: így a kérés akkor is a Socket.IO-hoz ér, ha egy proxy a záró perjelet levágja; a
 * `/api/rt/ticket` és `/api/rt/status` HTTP-végpont nem esik az előtag alá (az Engine.IO előtag-egyezéssel szűr).
 */
export const RT_PATH = "/api/rt/io";
export const RT_TICKET_PATH = "/api/rt/ticket";
export const RT_STATUS_PATH = "/api/rt/status";

/** Egy bejövő csomag (Engine.IO-üzenet) felső mérete bájtban — túllépéskor a szerver bontja a kapcsolatot. */
export const RT_MAX_MESSAGE_BYTES = 4096;
/** Kapcsolatonként ennyi esemény / másodperc (token-vödör, ugyanennyi löket). */
export const RT_MESSAGES_PER_SEC = 20;
/**
 * A kliens állította válaszidő legfeljebb ennyivel lehet kevesebb a szerver mérésénél (review #452, SPEC-VÁLTOZÁS a terv
 * 10.5-höz: a 400 ms-os plafon helyett 120 ms, a szerver által mért oda-vissza idők MINIMUMÁBÓL). 120 < TIE_MS (200).
 */
export const RT_LATENCY_SLACK_CAP_MS = 120;
/** A belépőjegy élettartama (≤ 60 s). */
export const RT_TICKET_TTL_MS = 60_000;
/** Ennyi ideig tartjuk a megszakadt játékos helyét (újracsatlakozás teljes pillanatképpel). */
export const RT_RECONNECT_GRACE_MS = 60_000;

/** Szobakód: 6 jel, félreolvasható jelek (0/O, 1/I/L) nélkül; 31^6 ≈ 8,9·10⁸ kód. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const RT_MIN_PLAYERS = 2;
export const RT_MAX_PLAYERS = 4;
export const RT_MIN_GRADE = 3;
export const RT_MAX_GRADE = 12;

/** Az online módban játszható játékok azonosítói (a `MP_GAMES` engedélylista ebből választ). */
export const RT_GAME_IDS = ["parbaj"] as const;
export type RtGameId = (typeof RT_GAME_IDS)[number];
export const RT_MODES = ["duel", "race", "parallel"] as const;
export type RtMode = (typeof RT_MODES)[number];
/** A JM2-ben megvalósított módok (a `race` / `parallel` a JM4 / JM5 dolga; addig `GAME_NOT_ENABLED`). */
export const RT_SUPPORTED_MODES: readonly RtMode[] = ["duel"];
export const RT_SUBJECTS = ["math", "english", "hungarian", "science", "history"] as const;
/**
 * Körszám: a JM-K zárt értékkészletet ír elő (3–10). A `shared/duel/rules.ts` `verdict()`-je ma rögzített
 * `DUEL_ROUNDS` (7) körrel számol, ezért a JM2-ben a zárt készlet egyetlen eleme a 7 (ORKESZTRÁTOR-KÉRÉS: a szabálymotor
 * paraméterezése után bővíthető).
 */
export const RT_ROUND_OPTIONS = [7] as const;

export const ERROR_CODES = [
  "BAD_MESSAGE",
  "UNSUPPORTED_VERSION",
  "RATE_LIMITED",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_STARTED",
  "NOT_HOST",
  "ALREADY_IN_ROOM",
  "ALREADY_ANSWERED",
  "ROUND_CLOSED",
  "INVALID_TICKET",
  "CAPACITY",
  "FEATURE_DISABLED",
  "GAME_NOT_ENABLED",
  // Additív bővítések a JM-K listájához (JM2):
  "NOT_IN_ROOM",
  "BAD_PHASE",
  "NOT_ENOUGH_PLAYERS",
  "BAD_OPTION",
  "SERVER_RESTART",
  "ORIGIN_NOT_ALLOWED",
  "KICKED",
  // JM3a (D21): szobát csak játékos-fiók, párosított tanulói profil vagy admin nyithat; vendég csak csatlakozhat.
  "ACCOUNT_REQUIRED",
] as const;
export type RtErrorCode = (typeof ERROR_CODES)[number];

/** Gyereknek érthető magyar szöveg a hibakódokhoz (a JM3 felülete ezt mutatja; a kód a protokollban marad). */
export const RT_ERROR_TEXT: Record<RtErrorCode, string> = {
  BAD_MESSAGE: "Valami nem sikerült. Próbáld újra!",
  UNSUPPORTED_VERSION: "Frissítsd az oldalt, új változat érkezett.",
  RATE_LIMITED: "Túl gyorsan próbálkozol. Várj egy kicsit!",
  ROOM_NOT_FOUND: "Ez a szoba már nem létezik. Nyiss újat, vagy kérj új kódot!",
  ROOM_FULL: "A szoba megtelt (legfeljebb 4 játékos).",
  ROOM_STARTED: "Ebben a szobában már elkezdődött a játék.",
  NOT_HOST: "Ezt csak a szoba gazdája teheti meg.",
  ALREADY_IN_ROOM: "Már egy másik szobában vagy.",
  ALREADY_ANSWERED: "Erre a kérdésre már válaszoltál.",
  ROUND_CLOSED: "Ez a kör már lezárult.",
  INVALID_TICKET: "A belépés lejárt. Próbáld újra!",
  CAPACITY: "Most nagyon sokan játszanak. Próbáld újra néhány perc múlva!",
  FEATURE_DISABLED: "Az online játék most nem elérhető.",
  GAME_NOT_ENABLED: "Ez a játék online még nem elérhető.",
  NOT_IN_ROOM: "Nem vagy ebben a szobában.",
  BAD_PHASE: "Ezt most nem lehet megtenni.",
  NOT_ENOUGH_PLAYERS: "Legalább 2 kész játékos kell az induláshoz.",
  BAD_OPTION: "Ilyen válasz nincs.",
  SERVER_RESTART: "A szerver frissül — a meccs itt véget ért. Próbáld újra egy perc múlva!",
  ORIGIN_NOT_ALLOWED: "Az online játék csak a WebSuli oldalán érhető el.",
  KICKED: "A szoba gazdája kivett a játékból.",
  ACCOUNT_REQUIRED: "Szobát nyitni csak belépve lehet. Csatlakozni viszont bárki tud a barátja kódjával!",
};

export const NOTICE_CODES = ["SERVER_RESTART", "ROOM_EXPIRING", "RUNS_PRIORITY", "PLAYER_LEFT", "KICKED", "ROOM_CLOSED"] as const;
export type RtNoticeCode = (typeof NOTICE_CODES)[number];

export const ROOM_PHASES = ["lobby", "countdown", "round_open", "round_reveal", "finished", "aborted"] as const;
export type RtRoomPhase = (typeof ROOM_PHASES)[number];

// ---------------------------------------------------------------------------------------------------------------------
// Kliens → szerver
// ---------------------------------------------------------------------------------------------------------------------

/** Kliens-üzenetazonosító (idempotencia / nyugta-párosítás); rövid, csak biztonságos jelek. */
const cid = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
const grade = z.number().int().min(RT_MIN_GRADE).max(RT_MAX_GRADE);

/** A csatlakozási `auth` mező: egyszer használatos belépőjegy VAGY a szerver által adott folytatási token. */
export const authSchema = z.union([
  z.object({ v: z.literal(PROTOCOL_VERSION), ticket: z.string().min(16).max(1024) }).strict(),
  z.object({ v: z.literal(PROTOCOL_VERSION), resume: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/) }).strict(),
]);
export type RtAuth = z.infer<typeof authSchema>;

export const roomSettingsSchema = z
  .object({
    rounds: z.literal(RT_ROUND_OPTIONS[0]).optional(),
    band: z.number().min(0).max(1).optional(),
    subjects: z.array(z.enum(RT_SUBJECTS)).max(RT_SUBJECTS.length).optional(),
  })
  .strict();

export const clientEventSchemas = {
  "room:create": z
    .object({ cid, gameId: z.enum(RT_GAME_IDS), mode: z.enum(RT_MODES), grade, settings: roomSettingsSchema.default({}) })
    .strict(),
  "room:join": z.object({ cid, code: z.string().regex(ROOM_CODE_PATTERN), grade }).strict(),
  "room:ready": z.object({ cid, ready: z.boolean() }).strict(),
  "room:start": z.object({ cid }).strict(),
  "round:answer": z
    .object({
      cid,
      round: z.number().int().min(1).max(64),
      optionIndex: z.number().int().min(0).max(7),
      // Hitelesítés nélküli állítás: a szerver csak a mért késés-kereten belül fogadja el lefelé (acceptedTimeMs).
      clientRtMs: z.number().nullable().optional(),
    })
    .strict(),
  react: z.object({ cid, reactionId: z.string().max(16) }).strict(),
  "room:leave": z.object({ cid }).strict(),
  "room:rematch": z.object({ cid }).strict(),
  "room:kick": z.object({ cid, playerId: z.string().regex(/^P[A-Za-z0-9]{10}$/) }).strict(),
  "clock:ping": z.object({ t0: z.number().finite() }).strict(),
} as const;

export type RtClientEvent = keyof typeof clientEventSchemas;
export const CLIENT_EVENTS = Object.keys(clientEventSchemas) as RtClientEvent[];
export type RtClientPayload<E extends RtClientEvent> = z.infer<(typeof clientEventSchemas)[E]>;

/** Egy bejövő esemény ellenőrzése: ismeretlen esemény / rossz alak → `null`. */
export function parseClientEvent<E extends RtClientEvent>(event: string, payload: unknown): RtClientPayload<E> | null {
  if (!Object.prototype.hasOwnProperty.call(clientEventSchemas, event)) return null;
  const parsed = clientEventSchemas[event as E].safeParse(payload);
  return parsed.success ? (parsed.data as RtClientPayload<E>) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Szerver → kliens (szigorú sémák: a tesztek minden kimenő üzenetet ezekkel ellenőriznek — extra mező = bukás)
// ---------------------------------------------------------------------------------------------------------------------

const playerId = z.string().regex(/^P[A-Za-z0-9]{10}$/);
const reactionIds = REACTIONS.map((r) => r.id) as [string, ...string[]];

export const publicPlayerSchema = z
  .object({
    id: playerId,
    nickname: z.string().min(1).max(32),
    avatar: z.string().max(32).nullable(),
    ready: z.boolean(),
    connected: z.boolean(),
    /** A meccsben az életerő; váróteremben `null`. */
    hp: z.number().nullable(),
    left: z.boolean(),
    /** A nyitott körben már válaszolt-e (MIT válaszolt, az a felfedésig nem látszik). */
    answered: z.boolean(),
  })
  .strict();
export type RtPublicPlayer = z.infer<typeof publicPlayerSchema>;

/** A játékos SAJÁT kérdése (helyes index NÉLKÜL). */
export const openQuestionSchema = z
  .object({
    round: z.number().int(),
    tiebreak: z.boolean(),
    prompt: z.string(),
    options: z.array(z.string()).min(2).max(8),
    openedAtServerTs: z.number(),
    deadlineTs: z.number(),
    windowMs: z.number(),
  })
  .strict();

export const revealResultSchema = z
  .object({
    playerId,
    answered: z.boolean(),
    correct: z.boolean(),
    acceptedMs: z.number().nullable(),
    damage: z.number(),
    speedBonus: z.number(),
  })
  .strict();

export const revealSchema = z
  .object({
    seq: z.number().int(),
    round: z.number().int(),
    tiebreak: z.boolean(),
    /** A játékos SAJÁT kérdésének helyes indexe (vegyes évfolyamnál mindenkinek más kérdés). */
    correctIndex: z.number().int(),
    explanation: z.string().optional(),
    yourOptionIndex: z.number().int().nullable(),
    results: z.array(revealResultSchema),
    hp: z.record(z.string(), z.number()),
    fastestCorrect: playerId.nullable(),
    nextAtServerTs: z.number().nullable(),
  })
  .strict();
export type RtReveal = z.infer<typeof revealSchema>;

export const playerStatSchema = z
  .object({
    playerId,
    accuracy: z.number(),
    correct: z.number().int(),
    asked: z.number().int(),
    fastestMs: z.number().nullable(),
    bestStreak: z.number().int(),
  })
  .strict();

export const matchResultSchema = z
  .object({
    seq: z.number().int(),
    podium: z.array(z.array(playerId)),
    winners: z.array(playerId),
    coWin: z.boolean(),
    stats: z.array(playerStatSchema),
    /** A pontkönyvbe írás a JM8 dolga: a JM2-ben mindig `false`. */
    saved: z.literal(false),
    aborted: z.boolean(),
    reason: z.enum(["COMPLETED", "OPPONENT_LEFT", "SERVER_RESTART", "NO_QUESTIONS"]),
  })
  .strict();
export type RtMatchResult = z.infer<typeof matchResultSchema>;

export const roomStateSchema = z
  .object({
    seq: z.number().int(),
    serverTs: z.number(),
    code: z.string().regex(ROOM_CODE_PATTERN),
    gameId: z.enum(RT_GAME_IDS),
    mode: z.enum(RT_MODES),
    phase: z.enum(ROOM_PHASES),
    hostId: playerId.nullable(),
    players: z.array(publicPlayerSchema),
    round: z.number().int(),
    tiebreak: z.boolean(),
    /** Az aktuális fázis vége (visszaszámlálás / kör / felfedés) szerveridőben; nincs határidő → `null`. */
    deadlineTs: z.number().nullable(),
    settings: z.object({ rounds: z.number().int(), band: z.number() }).strict(),
    draining: z.boolean(),
    /** A címzett saját nézete: azonosító, évfolyam, a nyitott kör kérdése (helyes index nélkül) és a már adott válasz. */
    you: z
      .object({
        playerId,
        grade,
        question: openQuestionSchema.nullable(),
        answeredOptionIndex: z.number().int().nullable(),
      })
      .strict(),
    lastReveal: revealSchema.nullable(),
    result: matchResultSchema.nullable(),
  })
  .strict();
export type RtRoomState = z.infer<typeof roomStateSchema>;

export const serverEventSchemas = {
  welcome: z
    .object({
      protocol: z.literal(PROTOCOL_VERSION),
      playerId: playerId.nullable(),
      nickname: z.string().min(1).max(32),
      avatar: z.string().max(32).nullable(),
      resumeToken: z.string().nullable(),
      serverTs: z.number(),
      resumed: z.boolean(),
      limits: z
        .object({
          maxMessageBytes: z.number().int(),
          messagesPerSec: z.number().int(),
          reconnectGraceMs: z.number().int(),
          minPlayers: z.number().int(),
          maxPlayers: z.number().int(),
        })
        .strict(),
      /** Mire jogosít a belépőjegy: szoba nyitása, vagy csatlakozás a megadott kódú szobához. */
      intent: z.object({ kind: z.enum(["create", "join", "resume"]), code: z.string().regex(ROOM_CODE_PATTERN).nullable() }).strict(),
    })
    .strict(),
  "room:state": roomStateSchema,
  "round:open": openQuestionSchema.extend({ seq: z.number().int() }).strict(),
  "round:reveal": revealSchema,
  "match:result": matchResultSchema,
  react: z.object({ playerId, reactionId: z.enum(reactionIds) }).strict(),
  notice: z.object({ code: z.enum(NOTICE_CODES), deadlineTs: z.number().nullable() }).strict(),
  error: z.object({ cid: z.string().optional(), code: z.enum(ERROR_CODES) }).strict(),
  "clock:pong": z.object({ t0: z.number(), serverTs: z.number() }).strict(),
  /** Késésmérés: a kliens azonnal nyugtázza (`ack()`); a szerver ebből számolja a késés-keretet. */
  "clock:probe": z.object({ serverTs: z.number() }).strict(),
} as const;

export type RtServerEvent = keyof typeof serverEventSchemas;
export type RtServerPayload<E extends RtServerEvent> = z.infer<(typeof serverEventSchemas)[E]>;

/** Nyugta (Socket.IO acknowledgement) alakja minden kliens-eseményre. */
export type RtAck =
  /** Szoba nyitása / csatlakozás után a nyugta hozza a szobakódot, a saját szobabeli azonosítót és a folytatási tokent. */
  | { ok: true; code?: undefined; roomCode?: string; playerId?: string; resumeToken?: string }
  | { ok: false; code: RtErrorCode };

/** A `POST /api/rt/ticket` kérés törzse: a jegy egy szándékhoz (és csatlakozásnál egy szobához) kötött. */
export const ticketRequestSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("create") }).strict(),
  z.object({ intent: z.literal("join"), code: z.string().regex(ROOM_CODE_PATTERN) }).strict(),
]);
export type RtTicketRequest = z.infer<typeof ticketRequestSchema>;

/**
 * A nyilvános `GET /api/rt/status` válasza (review #452 ALACSONY-8): be van-e kapcsolva, szabad-e (`available`), és a futó
 * meccsek száma — ez a telepítés előtti őr bemenete. Hogy fut-e tananyaggyártás, a kapcsolatszám stb. csak az admin
 * státuszban (`GET /api/admin/rt/status`) látszik.
 */
export const statusSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(["off", "admin", "on"]),
    games: z.array(z.enum(RT_GAME_IDS)),
    available: z.enum(["ok", "full", "draining", "off"]),
    activeMatches: z.number().int(),
    protocol: z.literal(PROTOCOL_VERSION),
  })
  .strict();
export type RtStatus = z.infer<typeof statusSchema>;

export const adminStatusSchema = statusSchema
  .extend({
    activeRooms: z.number().int(),
    connections: z.number().int(),
    draining: z.boolean(),
    runsPriority: z.boolean(),
    capacity: z.number().int(),
    bankLoaded: z.boolean(),
  })
  .strict();
export type RtAdminStatus = z.infer<typeof adminStatusSchema>;
