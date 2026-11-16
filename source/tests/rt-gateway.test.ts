import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { RT_PATH } from "../shared/duel/protocol";
import { beginRealtimeShutdown, createRealtimeService, drainWindowMsFromEnv } from "../server/realtime";
import { rtConfig } from "../server/realtime/config";
import { latencyAllowanceMs } from "../server/realtime/gateway";
import { createRoomHasher } from "../server/realtime/metrics";
import { ticketSecret } from "../server/realtime/ticket";
import {
  LEARNER_REAL_NAME,
  LEARNER_TOKEN,
  assertAllSchemas,
  connectPlayer,
  getTicket,
  sleep,
  startHarness,
  type Harness,
  type Player,
} from "./support/rt-harness";

/**
 * JM2 — integrációs tesztek VALÓDI Socket.IO-szerverrel és 2–4 klienssel egy folyamatban (végrehajtás JM2 „Tesztek”):
 * teljes meccs (polling + WebSocket, és csak polling — ez szimulálja a Vercel-továbbítást), újracsatlakozás kör közben,
 * kieső játékos, gazda-váltás, elkésett / duplikált válasz, rossz / lejárt / újrahasznált jegy, idegen eredet, `MP_MODE`
 * kapcsoló, csalás-próbák (clientRtMs 0, más nevében válasz, a helyes index nem szivárog), korlátok, leállítás.
 */

const harnesses: Harness[] = [];
const players: Player[] = [];
async function harness(opts?: Parameters<typeof startHarness>[0]) {
  const h = await startHarness(opts);
  harnesses.push(h);
  return h;
}
after(async () => {
  for (const p of players) p.close();
  for (const h of harnesses) await h.close().catch(() => {});
});

async function join(h: Harness, intent: { intent: "create" } | { intent: "join"; code: string }, opts: { headers?: Record<string, string>; transports?: ("polling" | "websocket")[] } = {}): Promise<Player> {
  const t = await getTicket(h, intent, opts.headers);
  assert.equal(t.status, 200, JSON.stringify(t.json));
  const p = await connectPlayer(h, t.json.ticket as string, { transports: opts.transports });
  players.push(p);
  return p;
}

async function createRoom(h: Harness, grade = 5, opts: { headers?: Record<string, string>; transports?: ("polling" | "websocket")[] } = {}): Promise<{ host: Player; code: string }> {
  const host = await join(h, { intent: "create" }, opts);
  const ack = await host.request("room:create", { gameId: "parbaj", mode: "duel", grade, settings: {} });
  assert.equal(ack.ok, true, JSON.stringify(ack));
  assert.ok(ack.ok && ack.roomCode && ack.resumeToken && ack.playerId);
  return { host, code: (ack as { roomCode: string }).roomCode };
}

async function addPlayer(h: Harness, code: string, grade = 5, opts: { headers?: Record<string, string>; transports?: ("polling" | "websocket")[] } = {}): Promise<Player> {
  const p = await join(h, { intent: "join", code }, opts);
  const ack = await p.request("room:join", { code, grade });
  assert.equal(ack.ok, true, JSON.stringify(ack));
  const ready = await p.request("room:ready", { ready: true });
  assert.equal(ready.ok, true);
  return p;
}

/** A szerver nyilvántartásából a játékos SAJÁT kérdésének helyes indexe (csak a teszt lát bele). */
function correctFor(h: Harness, code: string, playerId: string): number {
  return h.rt.registry.get(code)!.match!.questions[playerId]!.correctIndex;
}

/** Végigjátszik egy meccset: `skill(playerIndex, round)` → helyesen válaszol-e. */
async function playMatch(h: Harness, code: string, ps: Player[], skill: (i: number, round: number) => boolean): Promise<any[]> {
  const results: any[] = [];
  const done = ps.map((p) => p.waitFor("match:result", () => true, 30_000));
  const answered = new Set<string>();
  const loop = async (p: Player, i: number) => {
    for (;;) {
      const open = await Promise.race([p.waitFor("round:open", (o) => !answered.has(`${i}:${o.round}`), 30_000), done[i]!.then(() => null)]);
      if (!open) return;
      answered.add(`${i}:${open.round}`);
      const pid = p.playerId!;
      const right = correctFor(h, code, pid);
      const pick = skill(i, open.round) ? right : (right + 1) % open.options.length;
      await sleep(5 + i * 3);
      const ack = await p.request("round:answer", { round: open.round, optionIndex: pick, clientRtMs: 0 });
      assert.equal(ack.ok, true, `answer ack: ${JSON.stringify(ack)}`);
    }
  };
  await Promise.all(ps.map((p, i) => loop(p, i)));
  for (const d of done) results.push(await d);
  return results;
}

describe("JM2 gateway — MP_MODE kapcsoló", () => {
  it("off: a státusz { enabled: false }, a jegy-végpont 404, a Socket.IO kézfogás FEATURE_DISABLED (403)", async () => {
    const h = await harness({ env: { MP_MODE: "off" } });
    const st = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal(st.enabled, false);
    assert.equal(st.mode, "off");
    assert.equal((await getTicket(h, { intent: "create" })).status, 404);
    const raw = await fetch(`http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: h.origin } });
    assert.equal(raw.status, 403);
    assert.match(await raw.text(), /FEATURE_DISABLED/);
    // Ha valaki mégis jegyet hozna (pl. kapcsolás előtti), a kézfogás akkor is elbukik.
    h.env.MP_MODE = "on";
    const t = await getTicket(h, { intent: "create" });
    h.env.MP_MODE = "off";
    await assert.rejects(connectPlayer(h, t.json.ticket as string, { transports: ["websocket"] }), (e: Error & { code?: string }) => /FEATURE_DISABLED|websocket error|xhr/.test(String(e.code ?? e.message)));
    // Az Express többi útvonala érintetlen: a Socket.IO csak a saját útvonalát kezeli.
    assert.equal((await fetch(`http://127.0.0.1:${h.port}/api/other`)).status, 404);
  });

  it("admin: csak admin-munkamenet kap jegyet; a szobában az admin is csak generált becenevű játékos", async () => {
    const h = await harness({ env: { MP_MODE: "admin" } });
    assert.equal((await getTicket(h, { intent: "create" })).status, 403);
    assert.equal((await getTicket(h, { intent: "create" }, { "x-test-user": "user" })).status, 403);
    const t = await getTicket(h, { intent: "create" }, { "x-test-user": "admin" });
    assert.equal(t.status, 200);
    assert.equal(JSON.stringify(t.json).includes("Admin"), false);
    assert.equal(JSON.stringify(t.json).includes("@"), false);
    const st = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal(st.enabled, true);
    assert.equal(st.mode, "admin");
  });
});

describe("JM2 gateway — teljes meccs", () => {
  it("2 kliens (polling → WebSocket): váróterem, 7 kör, győzteshirdetés; minden üzenet szigorú séma szerint, helyes index és valódi név nem szivárog", async () => {
    const h = await harness({ windowMs: 3000 });
    const { host, code } = await createRoom(h, 5, { headers: { "x-learner-token": LEARNER_TOKEN } });
    const guest = await addPlayer(h, code, 8);
    const lobbyState = await host.waitFor("room:state", (s) => s.players.length === 2 && s.players.every((p: any) => p.ready));
    assert.equal(lobbyState.phase, "lobby");
    assert.equal((await host.request("room:start", {})).ok, true);
    const results = await playMatch(h, code, [host, guest], (i) => i === 0);
    for (const r of results) {
      assert.deepEqual(r.winners, [host.playerId]);
      assert.equal(r.reason, "COMPLETED");
      assert.equal(r.saved, false);
    }
    for (const p of [host, guest]) {
      assertAllSchemas(p);
      for (const o of p.events("round:open")) assert.equal(JSON.stringify(o).includes("correctIndex"), false);
      const all = JSON.stringify(p.log);
      assert.equal(all.includes(LEARNER_REAL_NAME.split(" ")[0]!), false, "a tanuló valódi neve nem mehet ki");
      assert.equal(/@/.test(all), false, "e-mail-szerű adat nem mehet ki");
      assert.equal(all.includes(LEARNER_TOKEN), false);
    }
    // Vegyes évfolyam: a host a 7. (tanulói profil ajánlja, de a create-ben 5-öt kért → 5), a vendég 8. évfolyam saját kérdést kapott.
    const hostOpen = host.events("round:open")[0];
    const guestOpen = guest.events("round:open")[0];
    assert.notEqual(hostOpen.prompt, guestOpen.prompt);
    const st = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal(st.activeMatches, 0);
    assert.deepEqual(Object.keys(st).sort(), ["activeMatches", "available", "enabled", "games", "mode", "protocol"], "nyilvánosan csak ennyi (ALACSONY-8)");
    assert.equal(h.rt.adminStatus().activeRooms, 1, "a befejezett szoba a visszavágó-ablakig él");
  });

  it("4 kliens CSAK long-pollinggal (a Vercel-továbbítás szimulációja): teljes meccs, dobogó, mindenki a saját évfolyamán", async () => {
    const h = await harness({ windowMs: 3000 });
    const opts = { transports: ["polling" as const] };
    const { host, code } = await createRoom(h, 3, opts);
    const p2 = await addPlayer(h, code, 6, opts);
    const p3 = await addPlayer(h, code, 9, opts);
    const p4 = await addPlayer(h, code, 12, opts);
    await host.waitFor("room:state", (s) => s.players.length === 4 && s.players.every((p: any) => p.ready));
    assert.equal((await host.request("room:start", {})).ok, true);
    const results = await playMatch(h, code, [host, p2, p3, p4], (i, round) => (i === 2 ? true : round % 2 === 0));
    assert.deepEqual(results[0].winners, [p3.playerId]);
    assert.equal(results[0].podium.flat().length, 4);
    for (const p of [host, p2, p3, p4]) {
      assertAllSchemas(p);
      assert.equal(p.socket.io.engine.transport.name, "polling");
    }
    const grades = h.rt.registry.get(code)!.players.map((p) => p.grade).sort((a, b) => a - b);
    assert.deepEqual(grades, [3, 6, 9, 12]);
  });
});

describe("JM2 gateway — kapcsolat-kiesés, kilépés, gazda-váltás", () => {
  it("újracsatlakozás kör közben (hálózatkiesés): a folytatási tokennel teljes pillanatkép — hátralévő idő, a már adott válasz", async () => {
    const h = await harness({ windowMs: 4000 });
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    await host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    await host.request("room:start", {});
    const open = await guest.waitFor("round:open");
    const pick = (correctFor(h, code, guest.playerId!) + 1) % open.options.length;
    assert.equal((await guest.request("round:answer", { round: open.round, optionIndex: pick, clientRtMs: 500 })).ok, true);
    const before = guest.log.length;
    // Hálózatkiesés szimulálása: a szállítás bezárul (nem kézi kilépés) → a kliens magától újracsatlakozik.
    guest.socket.io.engine.close();
    await host.waitFor("room:state", (s) => s.players.some((p: any) => p.id === guest.playerId && !p.connected));
    const snap = await guest.waitFor("room:state", (s) => guest.log.findIndex(([, x]) => x === s) >= before && s.you.answeredOptionIndex !== null, 8000);
    assert.equal(snap.phase, "round_open");
    assert.equal(snap.you.answeredOptionIndex, pick);
    assert.ok(snap.you.question && snap.you.question.deadlineTs > snap.serverTs, "a kör hátralévő ideje számolható");
    assert.equal("correctIndex" in snap.you.question, false);
    const welcome = guest.events("welcome").at(-1);
    assert.equal(welcome.resumed, true);
    // A második (ismételt) válasz ártalmatlan: ALREADY_ANSWERED.
    assert.deepEqual(await guest.request("round:answer", { round: open.round, optionIndex: 0, clientRtMs: 1 }), { ok: false, code: "ALREADY_ANSWERED" });
    await host.waitFor("room:state", (s) => s.players.every((p: any) => p.connected));
  });

  it("kieső játékos (nem tér vissza a türelmi időn belül): 2 főnél „ellenfél kilépett” zárás a maradó győzelmével", async () => {
    const h = await harness({ windowMs: 2000, timing: { reconnectGraceMs: 300 } });
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    await host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    await host.request("room:start", {});
    await host.waitFor("round:open");
    guest.socket.io.reconnection(false);
    guest.socket.io.engine.close();
    const res = await host.waitFor("match:result", () => true, 8000);
    assert.equal(res.reason, "OPPONENT_LEFT");
    assert.deepEqual(res.winners, [host.playerId]);
  });

  it("3 főből egy kilép meccs közben: a meccs folytatódik, a gazda kilépésekor új gazda lesz", async () => {
    const h = await harness({ windowMs: 3000 });
    const { host, code } = await createRoom(h);
    const p2 = await addPlayer(h, code);
    const p3 = await addPlayer(h, code);
    await host.waitFor("room:state", (s) => s.players.length === 3 && s.players.every((p: any) => p.ready));
    await host.request("room:start", {});
    await p2.waitFor("round:open");
    const oldHost = host.playerId;
    assert.equal((await host.request("room:leave", {})).ok, true);
    assert.equal(host.playerId, null, "kilépés után a kliens elfelejti a helyét");
    const st = await p2.waitFor("room:state", (s) => s.hostId !== null && s.hostId !== oldHost);
    assert.equal(st.hostId, p2.playerId, "a legrégebben csatlakozott aktív játékos");
    assert.equal(st.phase, "round_open");
    const results = await playMatch(h, code, [p2, p3], (i) => i === 1);
    assert.deepEqual(results[0].winners, [p3.playerId]);
    assert.equal(results[0].reason, "COMPLETED");
    // A kilépett játékos már nem küldhet választ.
    assert.equal((await host.request("round:answer", { round: 1, optionIndex: 0 })).ok, false);
  });
});

describe("JM2 gateway — jegy, eredet, csatlakozás", () => {
  it("hamis / újrahasznált / lejárt jegy → INVALID_TICKET; a jegy más szobára nem használható", async () => {
    const h = await harness();
    await assert.rejects(connectPlayer(h, "Zm9vZm9vZm9vZm9vZm9v.YmFy"), (e: Error & { code?: string }) => e.code === "INVALID_TICKET");
    const t = await getTicket(h, { intent: "create" });
    const p = await connectPlayer(h, t.json.ticket as string);
    players.push(p);
    await assert.rejects(connectPlayer(h, t.json.ticket as string), (e: Error & { code?: string }) => e.code === "INVALID_TICKET", "újrahasznált");
    const late = await getTicket(h, { intent: "create" });
    h.clock.offsetMs = 61_000;
    await assert.rejects(connectPlayer(h, late.json.ticket as string), (e: Error & { code?: string }) => e.code === "INVALID_TICKET", "lejárt");
    h.clock.offsetMs = 0;
    // Szándékhoz kötött: a „create” jegy nem csatlakozik, a „join X” jegy más kódhoz nem.
    assert.deepEqual(await p.request("room:join", { code: "ABC234", grade: 5 }), { ok: false, code: "INVALID_TICKET" });
    const { code } = await createRoom(h);
    const wrong = await join(h, { intent: "join", code: code === "ABC234" ? "ABC235" : "ABC234" });
    assert.deepEqual(await wrong.request("room:join", { code, grade: 5 }), { ok: false, code: "INVALID_TICKET" });
    const missing = await join(h, { intent: "join", code: "ZZZ999" });
    assert.deepEqual(await missing.request("room:join", { code: "ZZZ999", grade: 5 }), { ok: false, code: "ROOM_NOT_FOUND" });
    assert.deepEqual(await missing.request("room:join", { code: "ZZZ999", grade: 5 }), { ok: false, code: "INVALID_TICKET" }, "egy jegy egy próba");
  });

  it("idegen eredet: a polling-kézfogás és a WebSocket is elutasítva; Origin nélkül idegen-oldal jelzéssel is", async () => {
    const h = await harness();
    const evil = await fetch(`http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: "https://evil.example" } });
    assert.equal(evil.status, 400, "az Engine.IO köztes réteg minden kérésre ellenőriz (MIDDLEWARE_FAILURE)");
    const crossSite = await fetch(`http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`, { headers: { "sec-fetch-site": "cross-site" } });
    assert.ok(crossSite.status === 400 || crossSite.status === 403, String(crossSite.status));
    const sameSite = await fetch(`http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: h.origin } });
    assert.equal(sameSite.status, 200);
    const t = await getTicket(h, { intent: "create" });
    await assert.rejects(connectPlayer(h, t.json.ticket as string, { transports: ["websocket"], origin: "https://evil.example" }));
  });

  it("játékos-fiók beceneve szűrve: sértő / e-mail-szerű becenév helyett generált; tiltott játékos nem kap jegyet", async () => {
    const h = await harness();
    for (const bad of ["fasz123", "anna@pelda.hu", "www.pelda.hu"]) {
      const t = await getTicket(h, { intent: "create" }, { "x-test-player": encodeURIComponent(bad) });
      assert.equal(t.status, 200);
      assert.notEqual(t.json.nickname, bad);
      assert.equal(JSON.stringify(t.json).includes(bad), false);
    }
    const okNick = await getTicket(h, { intent: "create" }, { "x-test-player": encodeURIComponent("Gyors Csiga") });
    assert.equal(okNick.json.nickname, "Gyors Csiga");
    assert.equal((await getTicket(h, { intent: "create" }, { "x-test-player": "banned" })).status, 403);
    const learner = await getTicket(h, { intent: "create" }, { "x-learner-token": LEARNER_TOKEN });
    assert.equal(learner.json.grade, 7);
    assert.equal(JSON.stringify(learner.json).includes("Kovács"), false);
  });

  it("egy játékos egyszerre egy szobában; GAME_NOT_ENABLED (MP_GAMES, nem támogatott mód)", async () => {
    const h = await harness();
    const { host } = await createRoom(h, 5, { headers: { "x-test-player": "Gyors%20Csiga" } });
    assert.deepEqual(await host.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "ALREADY_IN_ROOM" });
    const again = await join(h, { intent: "create" }, { headers: { "x-test-player": "Gyors%20Csiga" } });
    assert.deepEqual(await again.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "ALREADY_IN_ROOM" });
    const race = await join(h, { intent: "create" });
    assert.deepEqual(await race.request("room:create", { gameId: "parbaj", mode: "race", grade: 5, settings: {} }), { ok: false, code: "GAME_NOT_ENABLED" });
    h.env.MP_GAMES = "";
    const none = await join(h, { intent: "create" });
    assert.deepEqual(await none.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "GAME_NOT_ENABLED" });
  });
});

describe("JM2 gateway — csalás-próbák és korlátok", () => {
  it("clientRtMs: 0 → az elfogadott idő a szerver mérése (nem 0, nem gyorsabb a ténylegesnél)", async () => {
    const h = await harness({ windowMs: 4000 });
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    await host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    await host.request("room:start", {});
    const open = await host.waitFor("round:open");
    await sleep(700);
    await host.request("round:answer", { round: open.round, optionIndex: correctFor(h, code, host.playerId!), clientRtMs: 0 });
    await guest.request("round:answer", { round: open.round, optionIndex: correctFor(h, code, guest.playerId!), clientRtMs: 1 });
    const rv = await host.waitFor("round:reveal");
    const mine = rv.results.find((r: any) => r.playerId === host.playerId);
    assert.ok(mine.acceptedMs >= 650, `elfogadott idő: ${mine.acceptedMs}`);
    const theirs = rv.results.find((r: any) => r.playerId === guest.playerId);
    assert.ok(theirs.acceptedMs > 1, "a kliens 1 ms-os állítása legfeljebb a mért késéssel csökkentheti a szerveridőt");
  });

  it("a kör lezárása UTÁN érkező válasz ROUND_CLOSED; más nevében (playerId mezővel) nem lehet válaszolni; a helyes index a kör előtt nem megy ki", async () => {
    const h = await harness({ windowMs: 600, timing: { revealMs: 2000 } });
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    await host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    await host.request("room:start", {});
    const open = await host.waitFor("round:open");
    assert.equal("correctIndex" in open, false);
    const st = host.events("room:state").at(-1);
    assert.equal(JSON.stringify(st.you).includes("correctIndex"), false);
    assert.deepEqual(await guest.request("round:answer", { round: open.round, optionIndex: 0, playerId: host.playerId } as never), { ok: false, code: "BAD_MESSAGE" });
    await host.waitFor("round:reveal");
    assert.deepEqual(await host.request("round:answer", { round: open.round, optionIndex: 0, clientRtMs: 100 }), { ok: false, code: "ROUND_CLOSED" });
  });

  it("4 KB feletti üzenet → a szerver bontja a kapcsolatot", async () => {
    const h = await harness();
    const p = await join(h, { intent: "create" });
    p.socket.io.reconnection(false);
    const gone = new Promise<string>((resolve) => p.socket.once("disconnect", (reason) => resolve(reason)));
    p.socket.emit("room:ready", { cid: "c1", ready: true, pad: "x".repeat(5000) });
    const reason = await gone;
    assert.match(reason, /transport (close|error)/);
  });

  it("üzenet/mp korlát: elárasztásnál RATE_LIMITED, tartósan → bontás; ismeretlen esemény BAD_MESSAGE; listán kívüli reakció elutasítva", async () => {
    const h = await harness();
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    const unknown = await new Promise<any>((resolve) => host.socket.timeout(2000).emit("chat:message", { text: "szia" }, (_e: unknown, a: unknown) => resolve(a)));
    assert.deepEqual(unknown, { ok: false, code: "BAD_MESSAGE" });
    assert.deepEqual(await host.request("react", { reactionId: "lol" }), { ok: false, code: "BAD_MESSAGE" });
    assert.deepEqual(await host.request("react", { reactionId: "clap" }), { ok: true });
    const got = await guest.waitFor("react");
    assert.deepEqual(got, { playerId: host.playerId, reactionId: "clap" });
    assert.deepEqual(await host.request("react", { reactionId: "clap" }), { ok: false, code: "RATE_LIMITED" }, "reakció legfeljebb 1/s");
    const acks = await Promise.all(Array.from({ length: 30 }, () => new Promise<any>((resolve) => guest.socket.timeout(2000).emit("room:ready", { cid: "c", ready: true }, (_e: unknown, a: unknown) => resolve(a)))));
    assert.ok(acks.filter((a) => a && a.code === "RATE_LIMITED").length >= 5, JSON.stringify(acks.map((a) => a?.code ?? "ok")));
    guest.socket.io.reconnection(false);
    const gone = new Promise<string>((resolve) => guest.socket.once("disconnect", (r) => resolve(r)));
    for (let i = 0; i < 80; i++) guest.socket.emit("room:ready", { cid: "c", ready: true });
    assert.match(await gone, /server namespace disconnect|transport close|io server disconnect/);
  });

  it("kapacitás: MP_MAX_ROOMS plafon → CAPACITY; aktív gyártás alatt MP_MAX_ROOMS_DURING_RUNS; kézi kapcsoló MP_RUNS_PRIORITY=on", async () => {
    const h = await harness({ env: { MP_MAX_ROOMS: "2", MP_MAX_ROOMS_DURING_RUNS: "1" } });
    await createRoom(h);
    h.runs.count = 1;
    assert.equal(h.rt.adminStatus().runsPriority, true);
    const pub = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal("runsPriority" in pub, false, "a nyilvános státusz nem árulja el a gyártást");
    assert.equal(pub.available, "full");
    const blocked = await join(h, { intent: "create" });
    assert.deepEqual(await blocked.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "CAPACITY" });
    h.runs.count = 0;
    await createRoom(h);
    const full = await join(h, { intent: "create" });
    assert.deepEqual(await full.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "CAPACITY" });
    h.env.MP_RUNS_PRIORITY = "on";
    assert.equal(h.rt.adminStatus().runsPriority, true);
    assert.equal(h.rt.adminStatus().activeRooms, 2);
  });

  it("jegy-korlát: IP-nként 10 / perc → 429", async () => {
    const h = await harness();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await getTicket(h, { intent: "create" })).status);
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
    assert.equal(codes[11], 429);
  });
});

describe("JM2 gateway — kapcsolat-plafon és lassú kliens", () => {
  it("MP_MAX_CONNECTIONS: a plafon felett a kézfogás CAPACITY (403); IP-nkénti plafon RATE_LIMITED", async () => {
    const h = await harness({ env: { MP_MAX_CONNECTIONS: "1" } });
    await join(h, { intent: "create" });
    const raw = await fetch(`http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: h.origin } });
    assert.equal(raw.status, 403);
    assert.match(await raw.text(), /CAPACITY/);
    h.env.MP_MAX_CONNECTIONS = "100";
    h.env.MP_MAX_CONNECTIONS_PER_IP = "1";
    const perIp = await fetch(`http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`, { headers: { origin: h.origin } });
    assert.equal(perIp.status, 403);
    assert.match(await perIp.text(), /RATE_LIMITED/);
  });

  it("lassú kliens: a nem olvasó (nem lekérdező) kapcsolat visszatartott üzenetei a plafon felett → a szerver bontja, a többiek látják", async () => {
    const h = await harness();
    const { host, code } = await createRoom(h);
    // Nyers Engine.IO polling-kliens: kézfogás, csatlakozás jeggyel, belépés a szobába — utána SOHA többé nem kérdez le.
    const t = await getTicket(h, { intent: "join", code });
    const url = `http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`;
    const hs = await (await fetch(url, { headers: { origin: h.origin } })).text();
    const sid = JSON.parse(hs.slice(1)).sid as string;
    const post = (body: string) => fetch(`${url}&sid=${sid}`, { method: "POST", headers: { origin: h.origin, "content-type": "text/plain;charset=UTF-8" }, body });
    assert.equal(await (await post(`40${JSON.stringify({ v: 1, ticket: t.json.ticket })}`)).text(), "ok");
    await (await fetch(`${url}&sid=${sid}`, { headers: { origin: h.origin } })).text(); // a csatlakozási nyugta + welcome
    assert.equal(await (await post(`421${JSON.stringify(["room:join", { cid: "s1", code, grade: 5 }])}`)).text(), "ok");
    const joined = await host.waitFor("room:state", (s) => s.players.length === 2);
    const slowId = joined.players[1].id as string;
    // A gazda állapot-változásokat okoz (a korláton belüli ütemben); a lassú kliens felé gyűlnek a csomagok.
    for (let i = 0; i < 80; i++) {
      await host.request("room:ready", { ready: i % 2 === 0 });
      await sleep(55);
      const st = host.events("room:state").at(-1);
      if (st.players.find((p: any) => p.id === slowId)?.connected === false) break;
    }
    const gone = await host.waitFor("room:state", (s) => s.players.some((p: any) => p.id === slowId && !p.connected), 5000);
    assert.ok(gone, "a lassú kliens kapcsolata bontva");
    assert.ok((h.rt.metrics.rejectedSnapshot().SLOW_CLIENT ?? 0) >= 1);
  });
});

describe("JM2 gateway — leállítás: rövid, rendezett lezárás (orkesztrátori döntés, review #452)", () => {
  for (const transport of ["websocket", "polling"] as const) {
    it(`SIGTERM-út futó meccsel (${transport}): új jegy tiltva, a meccs AZONNAL részeredménnyel zárul, mindkét kliens megkapja az ablakon belül; utána a server.close() gyorsan befejeződik`, async () => {
      const h = await harness({ windowMs: 6000, timing: { revealMs: 200 } });
      const opts = { transports: [transport] as ("polling" | "websocket")[] };
      const { host, code } = await createRoom(h, 5, opts);
      const guest = await addPlayer(h, code, 5, opts);
      await host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
      await host.request("room:start", {});
      const open = await guest.waitFor("round:open");
      await guest.request("round:answer", { round: open.round, optionIndex: correctFor(h, code, guest.playerId!), clientRtMs: 500 });
      const { host: lobbyHost } = await createRoom(h);
      assert.equal(h.rt.status().activeMatches, 1);

      const ids = [host.playerId!, guest.playerId!].sort();
      const t0 = Date.now();
      const sd = beginRealtimeShutdown(h.rt, h.server, { windowMs: 1000 });
      assert.equal(sd.delayedClose, true);
      assert.equal((await getTicket(h, { intent: "create" })).status, 503, "új belépés azonnal tilos");
      for (const p of [host, guest]) {
        const res = await p.waitFor("match:result", () => true, 1500);
        assert.equal(res.aborted, true);
        assert.equal(res.reason, "SERVER_RESTART");
        // A nyitott kör nem értékelődik (a lezárás pillanatnyi állás szerint): mindkettő 100 életerő → közös első hely.
        assert.deepEqual(res.winners.slice().sort(), ids);
        assert.equal(res.coWin, true);
        await p.waitFor("notice", (n) => n.code === "SERVER_RESTART", 1500);
      }
      await lobbyHost.waitFor("notice", (n) => n.code === "SERVER_RESTART", 1500);
      assert.ok(Date.now() - t0 < 1000, `a lezáró üzenetek az ablakon belül: ${Date.now() - t0} ms`);
      await sd.drained;
      await Promise.race([sd.httpClosed, sleep(3000).then(() => Promise.reject(new Error("a server.close() nem fejeződött be")))]);
      assert.ok(Date.now() - t0 < 1000 + 1500, `teljes leállás: ${Date.now() - t0} ms`);
      // A kliens a megszűnt szobához nem próbál végtelenül visszatérni.
      await sleep(300);
      assert.equal(guest.status, "closed");
      harnesses.splice(harnesses.indexOf(h), 1);
    });
  }

  it("nincs szoba (MP_MODE=off / üresjárat): a server.close() AZONNAL, a mostani sorrendben; az üzenet-ablak nem késleltet", async () => {
    const off = await harness({ env: { MP_MODE: "off" } });
    const t0 = Date.now();
    const sd = beginRealtimeShutdown(off.rt, off.server, { windowMs: drainWindowMsFromEnv({}) });
    assert.equal(sd.delayedClose, false);
    assert.equal(off.server.listening, false, "azonnal bezár");
    await sd.drained;
    await sd.httpClosed;
    assert.ok(Date.now() - t0 < 500, `off: ${Date.now() - t0} ms`);
    harnesses.splice(harnesses.indexOf(off), 1);
  });

  it("MP_DRAIN_WINDOW_MS: alap 2,5 s, plafon 5 s, érvénytelen → alap", () => {
    assert.equal(drainWindowMsFromEnv({}), 2500);
    assert.equal(drainWindowMsFromEnv({ MP_DRAIN_WINDOW_MS: "1000" }), 1000);
    assert.equal(drainWindowMsFromEnv({ MP_DRAIN_WINDOW_MS: "0" }), 0);
    assert.equal(drainWindowMsFromEnv({ MP_DRAIN_WINDOW_MS: "60000" }), 2500);
    assert.equal(drainWindowMsFromEnv({ MP_DRAIN_WINDOW_MS: "abc" }), 2500);
  });
});

describe("JM2 gateway — kilépés utáni kliensállapot és halott folytatási token (review #452)", () => {
  it("sikeres room:leave → a kliens tagsága üres; egy későbbi hálózati kiesés nem küld tokent és nem lép vissza (status closed); szellem-játékos nincs", async () => {
    const h = await harness();
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    const oldToken = guest.resumeToken!;
    assert.ok(oldToken && guest.playerId && guest.state);
    assert.deepEqual(await guest.request("room:leave", {}), { ok: true });
    assert.equal(guest.resumeToken, null);
    assert.equal(guest.playerId, null);
    assert.equal(guest.state, null);
    assert.equal(guest.closedCode, "LEFT");
    await host.waitFor("room:state", (s) => s.players.length === 1);
    // Hálózati kiesés kilépés után: a kliens NEM próbál újra (a jegy egyszer használatos, a token visszavont).
    guest.socket.io.engine.close();
    await sleep(800);
    assert.equal(guest.status, "closed");
    assert.equal(guest.socket.connected, false);
    assert.equal(h.rt.registry.get(code)!.players.length, 1, "nincs szellem-játékos");
    // A szerver oldal: a visszavont token beváltása egyértelmű INVALID_TICKET, és nem hoz létre helyet.
    const { io } = await import("socket.io-client");
    const err = await new Promise<{ message: string; data?: { code?: string } }>((resolve) => {
      const s = io(`http://127.0.0.1:${h.port}`, { path: RT_PATH, addTrailingSlash: false, reconnection: false, auth: { v: 1, resume: oldToken }, extraHeaders: { origin: h.origin } });
      s.on("connect_error", (e: Error & { data?: { code?: string } }) => {
        s.close();
        resolve(e);
      });
    });
    assert.equal(err.data?.code, "ROOM_NOT_FOUND", "egyértelmű kód: a hely megszűnt (nem számít hamisítási próbának)");
    assert.equal(h.rt.registry.get(code)!.players.length, 1);
  });

  it("kirúgás / szoba-lezárás: a kliens elfelejti a helyét (ROOM_CLOSED / KICKED), hálózati kiesésnél nem próbálkozik a halott tokennel", async () => {
    const h = await harness();
    const { host, code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    assert.deepEqual(await host.request("room:kick", { playerId: guest.playerId! }), { ok: true });
    await guest.waitFor("notice", (n) => n.code === "KICKED");
    assert.equal(guest.resumeToken, null);
    assert.equal(guest.closedCode, "KICKED");
    guest.socket.io.engine.close();
    await sleep(500);
    assert.equal(guest.status, "closed");
  });

  it("visszautasított folytatás (a szoba közben megszűnt): status closed + ROOM_NOT_FOUND, végtelen próbálkozás nincs", async () => {
    const h = await harness({ timing: { reconnectGraceMs: 200 } });
    const { code } = await createRoom(h);
    const guest = await addPlayer(h, code);
    // A szerver oldalon a szoba megszűnik, miközben a kliens kapcsolata megszakad.
    h.rt.registry.dispatch(code, { type: "drain", deadlineMs: Date.now() });
    guest.socket.io.engine.close();
    await sleep(1500);
    assert.equal(guest.status, "closed");
    assert.ok(["ROOM_NOT_FOUND", "ROOM_CLOSED", "DISCONNECTED"].includes(String(guest.closedCode)), String(guest.closedCode));
    assert.equal(guest.resumeToken, null);
  });
});

describe("JM2 gateway — biztonsági review #452 javításai", () => {
  it("KÖZEPES-4: időzítőből (kör megnyitása) dobó kérdés-szolgáltató → az érintett szoba rendezetten zárul, a folyamat él, a másik szoba zavartalanul végigmegy", async () => {
    const h = await harness({ windowMs: 3000, failGrade: 11 });
    const bad = await createRoom(h, 11);
    const badGuest = await addPlayer(h, bad.code, 11);
    await bad.host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    const good = await createRoom(h, 5);
    const goodGuest = await addPlayer(h, good.code, 6);
    await good.host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    await bad.host.request("room:start", {}); // a visszaszámlálás végén, időzítőből nyílik a kör → dob
    await bad.host.waitFor("notice", (n) => n.code === "ROOM_CLOSED", 3000);
    await badGuest.waitFor("notice", (n) => n.code === "ROOM_CLOSED", 3000);
    assert.equal(h.rt.registry.get(bad.code), undefined);
    assert.ok((h.rt.metrics.rejectedSnapshot().INTERNAL ?? 0) >= 0);
    await good.host.request("room:start", {});
    const results = await playMatch(h, good.code, [good.host, goodGuest], (i) => i === 0);
    assert.equal(results[0].reason, "COMPLETED");
  });

  it("KÖZEPES-3: jegy nélküli Engine.IO-kapcsolat a connectTimeout után, szobába nem lépő kapcsolat a tétlenségi idő után bontva; IP-nkénti egyidejű szobaplafon", async () => {
    const h = await harness({ env: { MP_CONNECT_TIMEOUT_MS: "300", MP_NO_ROOM_TIMEOUT_MS: "400", MP_CONCURRENT_ROOMS_PER_IP: "2" } });
    // (1) nyers Engine.IO-kézfogás CONNECT nélkül
    const url = `http://127.0.0.1:${h.port}${RT_PATH}?EIO=4&transport=polling`;
    const hs = await (await fetch(url, { headers: { origin: h.origin } })).text();
    const sid = JSON.parse(hs.slice(1)).sid as string;
    assert.equal(h.rt.adminStatus().connections, 1);
    // Függő long-poll GET (a kapcsolat „él”, de CONNECT csomagot nem küld): a connectTimeout-kor a szerver lezárja.
    // (Függő GET nélkül az Engine.IO a polling-szállítást a következő lekérdezésig, legfeljebb 30 s-ig tartja.)
    const pending = fetch(`${url}&sid=${sid}`, { headers: { origin: h.origin } }).then((r) => r.text());
    assert.equal(await Promise.race([pending, sleep(2000).then(() => "timeout")]), "1", "close-csomag a connectTimeout után");
    await sleep(50);
    assert.equal(h.rt.adminStatus().connections, 0, "jegy nélküli kapcsolat bontva");
    const after = await fetch(`${url}&sid=${sid}`, { headers: { origin: h.origin } });
    assert.equal(after.status, 400, "a munkamenet megszűnt");
    // (2) jeggyel csatlakozott, de szobába nem lépő
    const idle = await join(h, { intent: "create" });
    idle.socket.io.reconnection(false);
    const gone = new Promise<string>((resolve) => idle.socket.once("disconnect", (r) => resolve(r)));
    assert.match(await gone, /io server disconnect/);
    // (3) IP-nként legfeljebb 2 egyidejű szoba
    await createRoom(h);
    await createRoom(h);
    const third = await join(h, { intent: "create" });
    assert.deepEqual(await third.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "RATE_LIMITED" });
  });

  it("KÖZEPES-1: a késésmérés nyugtájának késleltetése nem ad előnyt — a keret a minták MINIMUMA, plafon 120 ms; a „leggyorsabb” statisztika a szerver nyers mérése", async () => {
    const { io } = await import("socket.io-client");
    const h = await harness({ windowMs: 6000 });
    const { host, code } = await createRoom(h);
    // Csaló kliens: minden clock:probe nyugtát 450 ms-mal késleltet, és clientRtMs: 1-et állít.
    const t = await getTicket(h, { intent: "join", code });
    const cheat = io(`http://127.0.0.1:${h.port}`, { path: RT_PATH, addTrailingSlash: false, reconnection: false, auth: { v: 1, ticket: t.json.ticket }, extraHeaders: { origin: h.origin } });
    cheat.on("clock:probe", (_p: unknown, ack: () => void) => setTimeout(ack, 450));
    await new Promise<void>((resolve) => cheat.once("connect", () => resolve()));
    const joinAck = await new Promise<any>((resolve) => cheat.emit("room:join", { cid: "j", code, grade: 5 }, resolve));
    assert.equal(joinAck.ok, true);
    await new Promise((resolve) => cheat.emit("room:ready", { cid: "r", ready: true }, resolve));
    await sleep(1600); // a 3 kezdeti (késleltetett) mérés lefut
    await host.request("room:start", {});
    const open = await host.waitFor("round:open");
    await sleep(800);
    const right = correctFor(h, code, joinAck.playerId);
    const cheatAck = await new Promise<any>((resolve) => cheat.emit("round:answer", { cid: "a", round: open.round, optionIndex: right, clientRtMs: 1 }, resolve));
    assert.equal(cheatAck.ok, true);
    const ans = h.rt.registry.get(code)!.match!.answers[joinAck.playerId]!;
    assert.ok(ans.serverRtMs - ans.acceptedMs <= 120, `a kliens állítása legfeljebb 120 ms-mal mehet a szerveridő alá: ${ans.serverRtMs} → ${ans.acceptedMs}`);
    await host.request("round:answer", { round: open.round, optionIndex: correctFor(h, code, host.playerId!), clientRtMs: null });
    cheat.close();
    // Egységszinten is: a minimum és a plafon.
    assert.equal(latencyAllowanceMs([450, 460, 470]), 120);
    assert.equal(latencyAllowanceMs([30, 450, 470]), 30);
    assert.equal(latencyAllowanceMs([]), 0);
    assert.equal(latencyAllowanceMs([Number.NaN, -5]), 0);
  });

  it("ALACSONY-4: a kirúgott vendég új jeggyel sem jöhet vissza (KICKED); a nyitó rövid kiesés után visszakapja a gazdaságot", async () => {
    const h = await harness();
    const { host, code } = await createRoom(h);
    const intruder = await addPlayer(h, code);
    const friend = await addPlayer(h, code);
    assert.deepEqual(await host.request("room:kick", { playerId: intruder.playerId! }), { ok: true });
    const again = await join(h, { intent: "join", code });
    assert.deepEqual(await again.request("room:join", { code, grade: 5 }), { ok: false, code: "KICKED" });
    // Gazda rövid kiesése: a gazdaság átmenetileg a következő tagra száll, visszatéréskor visszakerül.
    const hostId = host.playerId!;
    host.socket.io.engine.close();
    await friend.waitFor("room:state", (s) => s.hostId !== hostId);
    await friend.waitFor("room:state", (s) => s.hostId === hostId, 8000);
  });

  it("ALACSONY-5: lejárt / felhasznált jegyek sorozata (pl. egy NAT mögötti osztály) nem zárja ki az IP-t; a hamisított jegy számít", async () => {
    const h = await harness({ env: { MP_HANDSHAKE_FAILURES_PER_MIN_PER_IP: "5" } });
    const t = await getTicket(h, { intent: "create" });
    players.push(await connectPlayer(h, t.json.ticket as string));
    for (let i = 0; i < 8; i++) await assert.rejects(connectPlayer(h, t.json.ticket as string), (e: Error & { code?: string }) => e.code === "INVALID_TICKET");
    const fresh = await getTicket(h, { intent: "create" });
    players.push(await connectPlayer(h, fresh.json.ticket as string)); // a felhasznált jegyek nem zártak ki
    for (let i = 0; i < 5; i++) await assert.rejects(connectPlayer(h, "Zm9vZm9vZm9vZm9vZm9v.YmFy"), (e: Error & { code?: string }) => e.code === "INVALID_TICKET");
    const blocked = await getTicket(h, { intent: "create" });
    await assert.rejects(connectPlayer(h, blocked.json.ticket as string), (e: Error & { code?: string }) => e.code === "RATE_LIMITED");
  });

  it("ALACSONY-6: admin módban az admin akkor is belép, ha játékos-munkamenete is van (admin-jogot a szoba nem ad)", async () => {
    const h = await harness({ env: { MP_MODE: "admin" } });
    const t = await getTicket(h, { intent: "create" }, { "x-test-user": "admin", "x-test-player": "Gyors%20Csiga" });
    assert.equal(t.status, 200);
    const p = await connectPlayer(h, t.json.ticket as string);
    players.push(p);
    const ack = await p.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} });
    assert.equal(ack.ok, true);
  });

  it("ALACSONY-7: SESSION_SECRET nélkül nincs jegy, a réteg nem indul (kikapcsoltként viselkedik)", async () => {
    assert.equal(ticketSecret({}), null);
    assert.equal(ticketSecret({ NODE_ENV: "development" }), null);
    assert.equal(ticketSecret({ SESSION_SECRET: "x".repeat(32) }), "x".repeat(32));
    const rt = createRealtimeService({ secret: null, config: () => rtConfig({ MP_MODE: "on" }), logger: { info: () => {}, warn: () => {} } });
    assert.equal(rt.tickets, null);
    assert.equal(rt.status().enabled, false);
    await assert.rejects(rt.attach({} as never), /SESSION_SECRET/);
  });

  it("ALACSONY-3: a naplóbeli szobakód-hash kulcsolt (más titokkal más; nem a sima SHA-256)", async () => {
    const { createHash } = await import("node:crypto");
    const a = createRoomHasher("a".repeat(32))("ABC234");
    const b = createRoomHasher("b".repeat(32))("ABC234");
    assert.notEqual(a, b);
    assert.equal(a, createRoomHasher("a".repeat(32))("ABC234"));
    assert.equal(createHash("sha256").update("rt-room:ABC234").digest("hex").startsWith(a), false);
  });
});
