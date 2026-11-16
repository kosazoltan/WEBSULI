/**
 * JM2 — memóriabeli szoba-nyilvántartás (végrehajtás JM2 6. lépés; terv 10.8).
 *
 * `Map<kód, RoomState>`; minden változás a tiszta `reduceRoom`-on megy át, a hatásokat (`effects`) a gateway küldi ki.
 * Szobánként egyetlen időzítő fut a `nextWakeMs()` időpontjára (TTL, visszaszámlálás, kör-zárás, felfedés, türelmi idő,
 * leállítási határidő) — így a takarítás is a reducer szabályai szerint történik, külön söprő nélkül.
 * A szobakód 6 jel a félreolvasható jelek nélküli ábécéből, kriptográfiai véletlennel (nem kitalálható sorozat).
 */
import { randomBytes, randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/duel/protocol";
import {
  createRoom,
  isMatchPhase,
  nextWakeMs,
  reduceRoom,
  type CreateRoomArgs,
  type RoomConfig,
  type RoomEffect,
  type RoomEvent,
  type RoomReduceResult,
  type RoomState,
} from "../../shared/duel/room-machine";

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** A meccs titkos seedje (128 bit): a kérdéssor ebből determinisztikus, ezért a kliens sosem kapja meg. */
export function generateMatchSeed(): string {
  return randomBytes(16).toString("base64url");
}

export type RegistryDeps = {
  roomConfig: RoomConfig;
  now: () => number;
  /** A reducer hatásai (a szoba ÚJ állapotával); lezárásnál a szoba már nincs a nyilvántartásban. */
  onEffects: (room: RoomState, effects: RoomEffect[]) => void;
  codeGenerator?: () => string;
  /** Hiba a reducerben / a hatások kiküldésében (review #452 KÖZEPES-4): napló személyes adat nélkül. */
  onError?: (where: string, room: RoomState | undefined, error: unknown) => void;
};

export function createRegistry(deps: RegistryDeps) {
  const rooms = new Map<string, RoomState>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const genCode = deps.codeGenerator ?? generateRoomCode;

  function schedule(room: RoomState) {
    const old = timers.get(room.code);
    if (old) clearTimeout(old);
    timers.delete(room.code);
    if (room.closed) return;
    const at = nextWakeMs(room, deps.roomConfig);
    if (at === null) return;
    // +5 ms: a határidő UTÁN fusson (a reducer `>=`-vel hasonlít; az időzítő pontatlansága ne okozzon üres tick-et).
    const delay = Math.max(0, Math.min(2_147_000_000, at - deps.now() + 5));
    const t = setTimeout(() => {
      timers.delete(room.code);
      // Időzítő-visszahívás: semmilyen hiba nem juthat ki a Node eseményhurkába (a folyamat a gyártással együtt élne tovább).
      try {
        dispatch(room.code, { type: "tick" });
      } catch (error) {
        deps.onError?.("timer", rooms.get(room.code), error);
      }
    }, delay);
    t.unref?.();
    timers.set(room.code, t);
  }

  function commit(result: RoomReduceResult): void {
    const room = result.state;
    if (room.closed) {
      rooms.delete(room.code);
      const t = timers.get(room.code);
      if (t) clearTimeout(t);
      timers.delete(room.code);
    } else {
      rooms.set(room.code, room);
      schedule(room);
    }
    if (result.effects.length > 0) deps.onEffects(room, result.effects);
  }

  /** Kényszerzárás hiba után: a szoba eltűnik a nyilvántartásból, a játékosok `ROOM_CLOSED`-ot kapnak. */
  function forceClose(room: RoomState, where: string, error: unknown): RoomReduceResult {
    deps.onError?.(where, room, error);
    rooms.delete(room.code);
    const t = timers.get(room.code);
    if (t) clearTimeout(t);
    timers.delete(room.code);
    const closed: RoomState = { ...room, closed: true };
    const effects: RoomEffect[] = [{ type: "close", reason: "ERROR" }];
    try {
      deps.onEffects(closed, effects);
    } catch (e) {
      deps.onError?.("close-effects", closed, e);
    }
    return { state: closed, effects, error: "ROOM_NOT_FOUND" };
  }

  function dispatch(code: string, ev: RoomEvent): RoomReduceResult {
    const room = rooms.get(code);
    if (!room) return { state: undefined as unknown as RoomState, effects: [], error: "ROOM_NOT_FOUND" };
    let result: RoomReduceResult;
    try {
      result = reduceRoom(room, ev, deps.now(), deps.roomConfig);
    } catch (error) {
      return forceClose(room, `reduce:${ev.type}`, error);
    }
    if (result.error) return result;
    try {
      commit(result);
    } catch (error) {
      return forceClose(result.state, `effects:${ev.type}`, error);
    }
    return result;
  }

  return {
    rooms,
    /** Új szoba (ütközésmentes kóddal); a hívó előbb ellenőrzi a kapacitást. */
    create(args: Omit<CreateRoomArgs, "code" | "nowMs">): RoomState {
      let code = genCode();
      for (let i = 0; rooms.has(code) && i < 20; i++) code = genCode();
      if (rooms.has(code)) throw new Error("room code space exhausted");
      const room = createRoom({ ...args, code, nowMs: deps.now() });
      rooms.set(code, room);
      schedule(room);
      deps.onEffects(room, [{ type: "emitState" }]);
      return room;
    },
    get(code: string): RoomState | undefined {
      return rooms.get(code);
    },
    dispatch,
    counts(): { activeRooms: number; activeMatches: number } {
      let activeMatches = 0;
      for (const r of rooms.values()) if (isMatchPhase(r.phase)) activeMatches++;
      return { activeRooms: rooms.size, activeMatches };
    },
    /** Leállítás: minden szoba megkapja a határidőt (a váróterem azonnal zárul, a futó meccs kifuthat). */
    drainAll(deadlineMs: number): void {
      for (const code of Array.from(rooms.keys())) dispatch(code, { type: "drain", deadlineMs });
    },
    /** Kényszerített lezárás (a leállítás végén / tesztben): időzítők le, nyilvántartás üres. */
    clear(): void {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      rooms.clear();
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
