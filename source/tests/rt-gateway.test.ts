import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { RT_PATH } from "../shared/duel/protocol";
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
    assert.equal(st.activeRooms, 1, "a befejezett szoba a visszavágó-ablakig él");
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
    assert.equal((await host.request("room:leave", {})).ok, true);
    const st = await p2.waitFor("room:state", (s) => s.hostId !== null && s.hostId !== host.playerId);
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
    let st = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal(st.runsPriority, true);
    const blocked = await join(h, { intent: "create" });
    assert.deepEqual(await blocked.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "CAPACITY" });
    h.runs.count = 0;
    await createRoom(h);
    const full = await join(h, { intent: "create" });
    assert.deepEqual(await full.request("room:create", { gameId: "parbaj", mode: "duel", grade: 5, settings: {} }), { ok: false, code: "CAPACITY" });
    h.env.MP_RUNS_PRIORITY = "on";
    st = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal(st.runsPriority, true);
    assert.equal(st.activeRooms, 2);
  });

  it("jegy-korlát: IP-nként 10 / perc → 429", async () => {
    const h = await harness();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await getTicket(h, { intent: "create" })).status);
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
    assert.equal(codes[11], 429);
  });
});

describe("JM2 gateway — leállítás (drain)", () => {
  it("SIGTERM-út: új jegy / szoba tiltva, a váróterem zárul, a futó meccs a határidőig fut, utána részeredmény; a nyitott kapcsolatok NEM akasztják meg a server.close()-t", async () => {
    const h = await harness({ windowMs: 5000, timing: { revealMs: 200 } });
    const { host, code } = await createRoom(h, 5, { transports: ["websocket"] });
    const guest = await addPlayer(h, code, 5, { transports: ["polling"] });
    await host.waitFor("room:state", (s) => s.players.length === 2 && s.players[1].ready);
    await host.request("room:start", {});
    await host.waitFor("round:open");
    const { host: lobbyHost } = await createRoom(h);
    const st = await (await fetch(`http://127.0.0.1:${h.port}/api/rt/status`)).json();
    assert.equal(st.activeMatches, 1);
    assert.equal(st.activeRooms, 2);

    const t0 = Date.now();
    const drained = h.rt.drain(1200, 50);
    assert.equal((await getTicket(h, { intent: "create" })).status, 503);
    const lobbyNotice = await lobbyHost.waitFor("notice", (n) => n.code === "SERVER_RESTART");
    assert.equal(lobbyNotice.deadlineTs, null);
    const matchNotice = await host.waitFor("notice", (n) => n.code === "SERVER_RESTART");
    assert.ok(matchNotice.deadlineTs > t0, "a kliens érthető okot és határidőt kap");
    const res = await host.waitFor("match:result", () => true, 5000);
    assert.equal(res.aborted, true);
    assert.equal(res.reason, "SERVER_RESTART");
    await guest.waitFor("match:result", () => true, 5000);
    await drained;
    assert.ok(Date.now() - t0 < 1200 + 2500, `drain ideje: ${Date.now() - t0} ms`);

    // A meglévő leállítás: server.close() — a drain után a nyitott WebSocket / polling már nem tartja fel.
    const c0 = Date.now();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server.close() nem fejeződött be 3 s alatt")), 3000);
      h.server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    assert.ok(Date.now() - c0 < 3000);
    harnesses.splice(harnesses.indexOf(h), 1);
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
