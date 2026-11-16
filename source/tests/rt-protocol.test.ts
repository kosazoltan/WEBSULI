import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLIENT_EVENTS,
  ERROR_CODES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  authSchema,
  parseClientEvent,
  publicPlayerSchema,
  serverEventSchemas,
  statusSchema,
  ticketRequestSchema,
} from "../shared/duel/protocol";
import { REACTIONS } from "../shared/duel/reactions";
import { generateRoomCode } from "../server/realtime/registry";

/**
 * JM2 — a protokoll zod-sémái (végrehajtás JM2 3. lépés, JM-K): jó / rossz üzenetek, ismeretlen mező / esemény eldobva,
 * a kimenő sémák szigorúak (e-mail / név / helyes index mező nem fér bele), szabad szöveg nincs, a szobakód-tér elég nagy.
 */

describe("JM2 protokoll — kliens → szerver", () => {
  const good: Record<string, unknown> = {
    "room:create": { cid: "c1", gameId: "parbaj", mode: "duel", grade: 5, settings: { band: 0.5, subjects: ["math"] } },
    "room:join": { cid: "c2", code: "ABC234", grade: 12 },
    "room:ready": { cid: "c3", ready: true },
    "room:start": { cid: "c4" },
    "round:answer": { cid: "c5", round: 1, optionIndex: 2, clientRtMs: 1234 },
    react: { cid: "c6", reactionId: "clap" },
    "room:leave": { cid: "c7" },
    "room:rematch": { cid: "c8" },
    "room:kick": { cid: "c9", playerId: "PAbcdefghij" },
    "clock:ping": { t0: 12.5 },
  };

  it("minden ismert esemény jó alakja átmegy", () => {
    assert.deepEqual(Object.keys(good).sort(), CLIENT_EVENTS.slice().sort());
    for (const [ev, payload] of Object.entries(good)) assert.ok(parseClientEvent(ev, payload), ev);
  });

  it("ismeretlen esemény, ismeretlen mező, rossz típus → elutasítás", () => {
    assert.equal(parseClientEvent("room:hack", {}), null);
    assert.equal(parseClientEvent("__proto__", {}), null);
    assert.equal(parseClientEvent("toString", {}), null);
    assert.equal(parseClientEvent("room:start", { cid: "c", extra: 1 }), null, "szigorú: extra mező");
    assert.equal(parseClientEvent("room:start", {}), null);
    assert.equal(parseClientEvent("room:start", "c"), null);
    assert.equal(parseClientEvent("room:join", { cid: "c", code: "ABC0O1", grade: 5 }), null, "félreolvasható jel");
    assert.equal(parseClientEvent("room:join", { cid: "c", code: "abc234", grade: 5 }), null);
    assert.equal(parseClientEvent("room:join", { cid: "c", code: "ABC234", grade: 2 }), null, "évfolyam 3–12");
    assert.equal(parseClientEvent("room:create", { cid: "c", gameId: "x", mode: "duel", grade: 5 }), null);
    assert.equal(parseClientEvent("room:create", { cid: "c", gameId: "parbaj", mode: "duel", grade: 5, settings: { rounds: 3 } }), null, "zárt körszám-készlet");
    assert.equal(parseClientEvent("room:create", { cid: "c", gameId: "parbaj", mode: "duel", grade: 5, settings: { band: 2 } }), null);
    assert.equal(parseClientEvent("round:answer", { cid: "c", round: 1, optionIndex: 1.5 }), null);
    assert.equal(parseClientEvent("round:answer", { cid: "c", round: 0, optionIndex: 1 }), null);
    assert.equal(parseClientEvent("round:answer", { cid: "c", round: 1, optionIndex: -1 }), null);
    assert.equal(parseClientEvent("round:answer", { cid: "c", round: 1, optionIndex: 1, playerId: "PAbcdefghij" }), null, "más nevében nem válaszolhat");
    assert.equal(parseClientEvent("room:ready", { cid: "x".repeat(33), ready: true }), null);
    assert.equal(parseClientEvent("room:ready", { cid: "<script>", ready: true }), null);
    assert.equal(parseClientEvent("clock:ping", { t0: Number.POSITIVE_INFINITY }), null);
  });

  it("reakció: a séma csak rövid azonosítót enged; szabad szöveg nem fér bele", () => {
    assert.equal(parseClientEvent("react", { cid: "c", reactionId: "Szia, ez egy hosszú szabad szöveg!" }), null);
    assert.equal(parseClientEvent("react", { cid: "c", reactionId: "nice", text: "hello" }), null);
    // A listán kívüli rövid azonosítót a szerver isReactionId-vel utasítja el (gateway-teszt), a kimenő séma pedig enum:
    assert.equal(serverEventSchemas.react.safeParse({ playerId: "PAbcdefghij", reactionId: "lol" }).success, false);
    for (const r of REACTIONS) assert.ok(serverEventSchemas.react.safeParse({ playerId: "PAbcdefghij", reactionId: r.id }).success);
  });

  it("auth: jegy VAGY folytatási token, verzióval; URL-mező nincs", () => {
    assert.ok(authSchema.safeParse({ v: 1, ticket: "a".repeat(40) }).success);
    assert.ok(authSchema.safeParse({ v: 1, resume: "b".repeat(32) }).success);
    assert.equal(authSchema.safeParse({ v: 2, ticket: "a".repeat(40) }).success, false);
    assert.equal(authSchema.safeParse({ v: 1, ticket: "a".repeat(40), resume: "b".repeat(32) }).success, false);
    assert.equal(authSchema.safeParse({ ticket: "a".repeat(40) }).success, false);
  });

  it("jegykérés: create, vagy join egy szobakóddal", () => {
    assert.ok(ticketRequestSchema.safeParse({ intent: "create" }).success);
    assert.ok(ticketRequestSchema.safeParse({ intent: "join", code: "ABC234" }).success);
    assert.equal(ticketRequestSchema.safeParse({ intent: "join" }).success, false);
    assert.equal(ticketRequestSchema.safeParse({ intent: "create", nickname: "Valódi Név" }).success, false);
  });
});

describe("JM2 protokoll — szerver → kliens (szigorú sémák)", () => {
  const player = { id: "PAbcdefghij", nickname: "Fürge Vidra", avatar: null, ready: true, connected: true, hp: 100, left: false, answered: false };

  it("a játékos-adat csak becenév / avatar / állapot: e-mail, név, IP mező nem fér bele", () => {
    assert.ok(publicPlayerSchema.safeParse(player).success);
    for (const extra of [{ email: "a@b.hu" }, { name: "Kiss Anna" }, { firstName: "Anna" }, { ip: "1.2.3.4" }, { grade: 5 }, { sub: "player:1" }]) {
      assert.equal(publicPlayerSchema.safeParse({ ...player, ...extra }).success, false, JSON.stringify(extra));
    }
  });

  it("a round:open nem hordozhat helyes indexet (a séma elutasítja)", () => {
    const open = { seq: 3, round: 1, tiebreak: false, prompt: "2+2?", options: ["3", "4", "5", "6"], openedAtServerTs: 1, deadlineTs: 2, windowMs: 6000 };
    assert.ok(serverEventSchemas["round:open"].safeParse(open).success);
    assert.equal(serverEventSchemas["round:open"].safeParse({ ...open, correctIndex: 1 }).success, false);
    assert.equal(serverEventSchemas["round:open"].safeParse({ ...open, key: "g05-math-001" }).success, false, "a tétel-azonosító sem (kikereshető lenne)");
    assert.equal(serverEventSchemas["round:open"].safeParse({ ...open, explanation: "mert" }).success, false);
  });

  it("hibakódok: a JM-K lista minden eleme szerepel", () => {
    for (const c of ["BAD_MESSAGE", "UNSUPPORTED_VERSION", "RATE_LIMITED", "ROOM_NOT_FOUND", "ROOM_FULL", "ROOM_STARTED", "NOT_HOST", "ALREADY_IN_ROOM", "ALREADY_ANSWERED", "ROUND_CLOSED", "INVALID_TICKET", "CAPACITY", "FEATURE_DISABLED", "GAME_NOT_ENABLED"]) {
      assert.ok((ERROR_CODES as readonly string[]).includes(c), c);
    }
  });

  it("státusz: csak számok és kapcsolók", () => {
    const st = { enabled: false, mode: "off", games: [], available: "off", activeMatches: 0, protocol: 1 };
    assert.ok(statusSchema.safeParse(st).success);
    assert.equal(statusSchema.safeParse({ ...st, rooms: ["ABC234"] }).success, false);
    assert.equal(statusSchema.safeParse({ ...st, runsPriority: true }).success, false, "a gyártási állapot nem nyilvános");
  });
});

describe("JM2 szobakód", () => {
  it("6 jel a 31 jeles ábécéből (0/O/1/I/L nélkül), kriptográfiai véletlen, ütközés ritka", () => {
    assert.equal(ROOM_CODE_ALPHABET.length, 31);
    for (const ch of "01OIL") assert.equal(ROOM_CODE_ALPHABET.includes(ch), false, ch);
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const c = generateRoomCode();
      assert.match(c, ROOM_CODE_PATTERN);
      seen.add(c);
    }
    assert.ok(seen.size >= 4995, `5000 kódból ${seen.size} egyedi`);
  });

  it("találgatás esélye: 50 aktív szoba mellett egy próba ~5,6·10⁻⁸; IP-nként a jegy-korláttal (10/perc) egy nap alatt < 0,1%", () => {
    const space = ROOM_CODE_ALPHABET.length ** 6;
    assert.equal(space, 887_503_681);
    const perGuess = 50 / space;
    assert.ok(perGuess < 6e-8);
    // Egy jegy egyetlen kódhoz kötött (join-szándék), és egy kapcsolat egy jegyet vált be → próba / perc ≤ jegy / perc.
    const perDay = 1 - (1 - perGuess) ** (10 * 60 * 24);
    assert.ok(perDay < 1e-3, `napi esély IP-nként: ${perDay}`);
  });
});
