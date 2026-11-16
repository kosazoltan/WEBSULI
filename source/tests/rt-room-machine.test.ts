import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DUEL_ROUNDS, HUMAN_MIN_MS, MAX_LATENCY_SLACK_MS } from "../shared/duel/rules";
import { serverEventSchemas } from "../shared/duel/protocol";
import {
  DEFAULT_ROOM_TIMING,
  createRoom,
  nextWakeMs,
  reduceRoom,
  revealView,
  roomStateView,
  roundOpenView,
  resultView,
  type RoomConfig,
  type RoomEvent,
  type RoomReduceResult,
  type RoomState,
} from "../shared/duel/room-machine";
import { createQuestionProvider } from "../server/realtime/question-provider";

/**
 * JM2 — a szerver-tekintélyű szoba-állapotgép tiszta egységtesztjei (végrehajtás JM2 3. lépés; terv 10.5, 10.8):
 * minden átmenet, a hibakódok, gazda-váltás, időtúllépés, első válasz, újracsatlakozás pillanatképpel, kieső játékos,
 * leállítás részeredménnyel; a kimenő nézetek a szigorú protokoll-sémáknak felelnek meg, és a nyitott körben nincs
 * helyes index.
 */

const cfg: RoomConfig = { provider: createQuestionProvider() };
const T0 = 1_700_000_000_000;
const A = "PAaaaaaaaaa";
const B = "PBbbbbbbbbb";
const C = "PCccccccccc";
const D = "PDddddddddd";
const E = "PEeeeeeeeee";

function room(grade = 5): RoomState {
  return createRoom({ code: "ABCDEF", gameId: "parbaj", mode: "duel", seed: "secret-seed", host: { playerId: A, nickname: "Bátor Róka", avatar: null, grade }, nowMs: T0 });
}

function step(s: RoomState, ev: RoomEvent, at: number): RoomReduceResult {
  return reduceRoom(s, ev, at, cfg);
}

function ok(s: RoomState, ev: RoomEvent, at: number): RoomState {
  const r = step(s, ev, at);
  assert.equal(r.error, undefined, `váratlan hiba: ${r.error} (${ev.type})`);
  return r.state;
}

/** Két (vagy több) játékos a váróteremben, mindenki kész. */
function lobby(players: Array<[string, number]> = [[B, 5]], hostGrade = 5): RoomState {
  let s = room(hostGrade);
  for (const [id, g] of players) {
    s = ok(s, { type: "join", playerId: id, nickname: `Játékos ${id.slice(1, 2)}`, avatar: null, grade: g }, T0 + 10);
    s = ok(s, { type: "ready", playerId: id, ready: true }, T0 + 20);
  }
  return s;
}

/** Indítás + visszaszámlálás → nyitott 1. kör. */
function started(players?: Array<[string, number]>, hostGrade?: number): { s: RoomState; t: number } {
  let s = lobby(players, hostGrade);
  s = ok(s, { type: "start", playerId: A }, T0 + 100);
  const t = T0 + 100 + DEFAULT_ROOM_TIMING.countdownMs;
  s = ok(s, { type: "tick" }, t);
  assert.equal(s.phase, "round_open");
  return { s, t };
}

const correctOf = (s: RoomState, id: string) => s.match!.questions[id]!.correctIndex;
const wrongOf = (s: RoomState, id: string) => (correctOf(s, id) + 1) % s.match!.questions[id]!.options.length;

function assertSchema(name: keyof typeof serverEventSchemas, payload: unknown) {
  const r = serverEventSchemas[name].safeParse(payload);
  assert.ok(r.success, `${name}: ${r.success ? "" : JSON.stringify(r.error.issues)}`);
}

describe("JM2 room-machine — váróterem", () => {
  it("a gazda kész, a csatlakozó nem; 4 fő felett ROOM_FULL; kétszer ugyanaz: ALREADY_IN_ROOM", () => {
    let s = room();
    assert.equal(s.phase, "lobby");
    assert.equal(s.hostId, A);
    s = ok(s, { type: "join", playerId: B, nickname: "B", avatar: null, grade: 4 }, T0 + 1);
    assert.equal(s.players.find((p) => p.id === B)!.ready, false);
    assert.equal(step(s, { type: "join", playerId: B, nickname: "B", avatar: null, grade: 4 }, T0 + 2).error, "ALREADY_IN_ROOM");
    s = ok(s, { type: "join", playerId: C, nickname: "C", avatar: null, grade: 4 }, T0 + 3);
    s = ok(s, { type: "join", playerId: D, nickname: "D", avatar: null, grade: 4 }, T0 + 4);
    assert.equal(step(s, { type: "join", playerId: E, nickname: "E", avatar: null, grade: 4 }, T0 + 5).error, "ROOM_FULL");
  });

  it("indítás: csak a gazda, csak ha legalább 2 fő és mindenki kész", () => {
    let s = room();
    assert.equal(step(s, { type: "start", playerId: A }, T0 + 1).error, "NOT_ENOUGH_PLAYERS");
    s = ok(s, { type: "join", playerId: B, nickname: "B", avatar: null, grade: 5 }, T0 + 2);
    assert.equal(step(s, { type: "start", playerId: A }, T0 + 3).error, "NOT_ENOUGH_PLAYERS", "B nem kész");
    s = ok(s, { type: "ready", playerId: B, ready: true }, T0 + 4);
    assert.equal(step(s, { type: "start", playerId: B }, T0 + 5).error, "NOT_HOST");
    assert.equal(step(s, { type: "start", playerId: E }, T0 + 5).error, "NOT_IN_ROOM");
    s = ok(s, { type: "start", playerId: A }, T0 + 6);
    assert.equal(s.phase, "countdown");
    assert.equal(step(s, { type: "join", playerId: C, nickname: "C", avatar: null, grade: 5 }, T0 + 7).error, "ROOM_STARTED");
    assert.equal(step(s, { type: "ready", playerId: B, ready: false }, T0 + 7).error, "BAD_PHASE");
  });

  it("gazda-váltás: a gazda kilép → a legrégebben csatlakozott aktív játékos; utolsó kilépő → close", () => {
    let s = lobby([[B, 5], [C, 5]]);
    s = ok(s, { type: "leave", playerId: A }, T0 + 30);
    assert.equal(s.hostId, B);
    s = ok(s, { type: "leave", playerId: B }, T0 + 31);
    assert.equal(s.hostId, C);
    const r = step(s, { type: "leave", playerId: C }, T0 + 32);
    assert.equal(r.state.closed, true);
    assert.ok(r.effects.some((e) => e.type === "close" && e.reason === "EMPTY"));
  });

  it("kirúgás: csak a gazda, váróteremben", () => {
    const s = lobby([[B, 5]]);
    assert.equal(step(s, { type: "kick", playerId: B, target: A }, T0 + 30).error, "NOT_HOST");
    const r = step(s, { type: "kick", playerId: A, target: B }, T0 + 30);
    assert.ok(r.effects.some((e) => e.type === "kicked" && e.playerId === B));
    assert.equal(r.state.players.length, 1);
  });

  it("tétlen váróterem a TTL után zárul; a következő ébredés a TTL", () => {
    const s = lobby();
    assert.equal(nextWakeMs(s, cfg), T0 + 20 + DEFAULT_ROOM_TIMING.lobbyTtlMs);
    const r = step(s, { type: "tick" }, T0 + 20 + DEFAULT_ROOM_TIMING.lobbyTtlMs);
    assert.equal(r.state.closed, true);
    assert.equal(step(r.state, { type: "tick" }, T0 + 99_999_999).error, "ROOM_NOT_FOUND");
  });
});

describe("JM2 room-machine — körök", () => {
  it("teljes meccs: 7 kör, a pontosabb nyer; a nyitott kör nézetében NINCS helyes index, a felfedésben van", () => {
    let { s, t } = started();
    let rounds = 0;
    while (s.phase === "round_open") {
      rounds++;
      const open = roundOpenView(s, A)!;
      assertSchema("round:open", open);
      assert.equal("correctIndex" in open, false);
      assert.ok(!JSON.stringify(open).includes("correctIndex"));
      const st = roomStateView(s, A, t, cfg);
      assertSchema("room:state", st);
      assert.equal(st.you.question?.round, rounds);
      assert.equal(JSON.stringify(st.you).includes("correctIndex"), false);
      s = ok(s, { type: "answer", playerId: A, round: open.round, optionIndex: correctOf(s, A), clientRtMs: 900, medianRttMs: 50 }, t + 1000);
      assert.equal(s.phase, "round_open", "B még nem válaszolt");
      assert.equal(roomStateView(s, B, t + 1000, cfg).players.find((p) => p.id === A)!.answered, true);
      s = ok(s, { type: "answer", playerId: B, round: open.round, optionIndex: wrongOf(s, B), clientRtMs: 1200, medianRttMs: 50 }, t + 1500);
      assert.equal(s.phase, "round_reveal", "mindenki válaszolt → korai zárás");
      const rv = revealView(s, A)!;
      assertSchema("round:reveal", rv);
      assert.equal(rv.correctIndex, s.match!.lastReveal!.questions[A]!.correctIndex);
      t += 1500 + DEFAULT_ROOM_TIMING.revealMs;
      s = ok(s, { type: "tick" }, t);
    }
    assert.equal(s.phase, "finished");
    assert.ok(rounds <= DUEL_ROUNDS);
    const res = resultView(s)!;
    assertSchema("match:result", res);
    assert.deepEqual(res.winners, [A]);
    assert.equal(res.reason, "COMPLETED");
    assert.equal(res.saved, false);
  });

  it("azonos évfolyam → azonos kérdés; vegyes évfolyam → mindenki a sajátját, saját ablakkal", () => {
    const same = started([[B, 5]], 5).s;
    assert.equal(same.match!.questions[A]!.key, same.match!.questions[B]!.key);
    const mixed = started([[B, 9]], 4).s;
    assert.equal(mixed.match!.questions[A]!.grade, 4);
    assert.equal(mixed.match!.questions[B]!.grade, 9);
    assert.notEqual(mixed.match!.questions[A]!.key, mixed.match!.questions[B]!.key);
    assert.equal(mixed.match!.deadlines[A]! - mixed.match!.openedAtMs, mixed.match!.questions[A]!.windowMs);
    assert.equal(roundOpenView(mixed, B)!.prompt, mixed.match!.questions[B]!.prompt);
  });

  it("csak az első válasz számít: a második ALREADY_ANSWERED; rossz kör / rossz opció / meccsen kívüli", () => {
    let { s, t } = started([[B, 5], [C, 5]]);
    const r1 = ok(s, { type: "answer", playerId: A, round: 1, optionIndex: wrongOf(s, A), medianRttMs: 0 }, t + 500);
    assert.equal(step(r1, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), medianRttMs: 0 }, t + 600).error, "ALREADY_ANSWERED");
    assert.equal(step(r1, { type: "answer", playerId: B, round: 2, optionIndex: 0, medianRttMs: 0 }, t + 600).error, "ROUND_CLOSED");
    assert.equal(step(r1, { type: "answer", playerId: B, round: 1, optionIndex: 7, medianRttMs: 0 }, t + 600).error, "BAD_OPTION");
    assert.equal(step(r1, { type: "answer", playerId: E, round: 1, optionIndex: 0, medianRttMs: 0 }, t + 600).error, "NOT_IN_ROOM");
    s = r1;
    assert.equal(s.match!.answers[A]!.correct, false);
  });

  it("időtúllépés: a saját ablak + türelmi idő után ROUND_CLOSED, a kör a leghosszabb ablak után zárul, a válaszolatlan 0", () => {
    const { s, t } = started();
    const win = s.match!.questions[A]!.windowMs;
    assert.equal(nextWakeMs(s, cfg), t + Math.max(win, s.match!.questions[B]!.windowMs) + DEFAULT_ROOM_TIMING.answerGraceMs);
    assert.equal(step(s, { type: "answer", playerId: A, round: 1, optionIndex: 0, medianRttMs: 0 }, t + win + DEFAULT_ROOM_TIMING.answerGraceMs + 1).error, "ROUND_CLOSED");
    // A türelmi időn belül beérkező válasz elfogadott, de a gyorsasága az ablakhoz mér (ablakon túli → nem számít helyesnek).
    const late = ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: null, medianRttMs: 0 }, t + win + 100);
    const closed = ok(late, { type: "tick" }, nextWakeMs(late, cfg)!);
    assert.equal(closed.phase, "round_reveal");
    const rv = revealView(closed, A)!;
    assert.equal(rv.results.find((r) => r.playerId === A)!.correct, false, "az ablakon túli válasz nem sebez");
    assert.equal(rv.results.find((r) => r.playerId === B)!.answered, false);
    assert.equal(rv.results.find((r) => r.playerId === A)!.damage + rv.results.find((r) => r.playerId === B)!.damage, 0);
  });

  it("gyorsaság (10.5): a szerver mérése az elsődleges — clientRtMs 0 / negatív / hiányzó → szerveridő; a kliens csak a késés-kereten belül (≤ 400 ms) mehet lejjebb; 200 ms alatt nincs bónusz", () => {
    const { s, t } = started();
    const ans = (client: number | null | undefined, rtt: number, after = 2000) =>
      ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: client, medianRttMs: rtt }, t + after).match!.answers[A]!;
    assert.equal(ans(0, 100).acceptedMs, 2000);
    assert.equal(ans(-5, 100).acceptedMs, 2000);
    assert.equal(ans(null, 100).acceptedMs, 2000);
    assert.equal(ans(undefined, 100).acceptedMs, 2000);
    assert.equal(ans(1950, 100).acceptedMs, 1950);
    assert.equal(ans(10, 100).acceptedMs, 1900, "alsó vágás a mért késéssel");
    assert.equal(ans(10, 5000).acceptedMs, 2000 - MAX_LATENCY_SLACK_MS, "a késés-keret plafonja 400 ms");
    assert.equal(ans(9999, 100).acceptedMs, 2000, "felső vágás a szerveridőnél");
    const fast = ans(1, 100, 150);
    assert.ok(fast.acceptedMs < HUMAN_MIN_MS && fast.suspicious);
    assert.equal(fast.correct, true, "a gyanúsan gyors válasz helyes marad");
    const fastState = ok(ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: 1, medianRttMs: 100 }, t + 150), { type: "answer", playerId: B, round: 1, optionIndex: wrongOf(s, B), medianRttMs: 0 }, t + 3000);
    assert.equal(revealView(fastState, A)!.results.find((r) => r.playerId === A)!.speedBonus, 0);
    assert.equal(revealView(fastState, A)!.results.find((r) => r.playerId === B)!.damage, 10, "bónusz nélkül 10 sebzés");
  });

  it("holtverseny 7 kör után → döntő kör (tiebreak jelöléssel); 2 döntő után közös győzelem", () => {
    let { s, t } = started();
    let tiebreakSeen = 0;
    while (s.phase === "round_open") {
      if (s.match!.tiebreak) tiebreakSeen++;
      // mindkettő rosszul válaszol → nincs sebzés, holtverseny marad
      s = ok(s, { type: "answer", playerId: A, round: s.match!.roundNo, optionIndex: wrongOf(s, A), medianRttMs: 0 }, t + 500);
      s = ok(s, { type: "answer", playerId: B, round: s.match!.roundNo, optionIndex: wrongOf(s, B), medianRttMs: 0 }, t + 600);
      t += 600 + DEFAULT_ROOM_TIMING.revealMs;
      s = ok(s, { type: "tick" }, t);
    }
    assert.equal(tiebreakSeen, 2);
    const res = resultView(s)!;
    assert.equal(res.coWin, true);
    assert.deepEqual(res.winners.sort(), [A, B].sort());
  });
});

describe("JM2 room-machine — kapcsolat, kilépés, gazda-váltás meccs közben", () => {
  it("újracsatlakozás kör közben: teljes pillanatkép a hátralévő idővel és a már adott válasszal", () => {
    let { s, t } = started();
    s = ok(s, { type: "answer", playerId: B, round: 1, optionIndex: wrongOf(s, B), medianRttMs: 0 }, t + 400);
    s = ok(s, { type: "disconnect", playerId: B }, t + 500);
    assert.equal(roomStateView(s, A, t + 500, cfg).players.find((p) => p.id === B)!.connected, false);
    s = ok(s, { type: "reconnect", playerId: B }, t + 2500);
    const snap = roomStateView(s, B, t + 2500, cfg);
    assertSchema("room:state", snap);
    assert.equal(snap.phase, "round_open");
    assert.equal(snap.you.answeredOptionIndex, wrongOf(s, B));
    assert.equal(snap.you.question!.deadlineTs, s.match!.deadlines[B]);
    assert.ok(snap.you.question!.deadlineTs > t + 2500, "a kör még nyitva, a hátralévő idő számolható");
    assert.equal("correctIndex" in snap.you.question!, false);
  });

  it("a türelmi időn túl kiesett játékos kilépettnek számít; ha egy marad, a meccs „ellenfél kilépett” zárással ér véget", () => {
    let { s, t } = started();
    s = ok(s, { type: "disconnect", playerId: B }, t + 100);
    assert.equal(nextWakeMs(s, cfg), Math.min(t + 100 + DEFAULT_ROOM_TIMING.reconnectGraceMs, nextWakeMs(s, cfg)!));
    // A kör lejár (B nem válaszol), a meccs megy tovább a türelmi időig.
    let at = t;
    while (s.phase !== "finished" && at < t + DEFAULT_ROOM_TIMING.reconnectGraceMs + 20_000) {
      if (s.phase === "round_open" && !s.match!.answers[A]) s = ok(s, { type: "answer", playerId: A, round: s.match!.roundNo, optionIndex: wrongOf(s, A), medianRttMs: 0 }, at + 10);
      at = nextWakeMs(s, cfg)!;
      s = ok(s, { type: "tick" }, at);
    }
    assert.equal(s.phase, "finished");
    const res = resultView(s)!;
    assert.equal(res.reason, "OPPONENT_LEFT");
    assert.deepEqual(res.winners, [A]);
    assert.deepEqual(res.podium[res.podium.length - 1], [B]);
  });

  it("3 főből egy kilép: a meccs folytatódik, a kilépő köre üres; a gazda kilép → új gazda", () => {
    let { s, t } = started([[B, 5], [C, 5]]);
    s = ok(s, { type: "leave", playerId: A }, t + 100);
    assert.equal(s.phase, "round_open");
    assert.equal(s.hostId, B);
    assert.equal(s.players.find((p) => p.id === A)!.left, true);
    s = ok(s, { type: "answer", playerId: B, round: 1, optionIndex: correctOf(s, B), clientRtMs: 1000, medianRttMs: 0 }, t + 1000);
    s = ok(s, { type: "answer", playerId: C, round: 1, optionIndex: wrongOf(s, C), medianRttMs: 0 }, t + 1100);
    assert.equal(s.phase, "round_reveal", "a kilépett játékosra nem várunk");
    const rv = revealView(s, B)!;
    // Review #452: a kilépett köre üres, nem sebezhető, és nem hígítja a bent maradók közti sebzést.
    assert.equal(rv.results.some((r) => r.playerId === A), false);
    assert.equal(rv.results.find((r) => r.playerId === C)!.damage, 10 + rv.results.find((r) => r.playerId === B)!.speedBonus);
    assert.equal(step(s, { type: "answer", playerId: A, round: 1, optionIndex: 0, medianRttMs: 0 }, t + 1200).error, "NOT_IN_ROOM");
  });

  it("2 főből egy kilép → azonnali zárás a maradó győzelmével", () => {
    let { s, t } = started();
    const r = step(s, { type: "leave", playerId: B }, t + 50);
    s = r.state;
    assert.equal(s.phase, "finished");
    assert.equal(resultView(s)!.reason, "OPPONENT_LEFT");
    assert.ok(r.effects.some((e) => e.type === "persist"));
  });

  it("visszavágó: új meccs új kérdésekkel (a used megmarad), a kilépettek kimaradnak", () => {
    let { s, t } = started();
    const firstKey = s.match!.questions[A]!.key;
    s = ok(s, { type: "leave", playerId: B }, t + 50);
    assert.equal(step(s, { type: "start", playerId: A }, t + 60).error, "BAD_PHASE");
    s = ok(s, { type: "rematch", playerId: A }, t + 100);
    assert.equal(s.phase, "lobby");
    assert.equal(s.players.length, 1);
    s = ok(s, { type: "join", playerId: C, nickname: "C", avatar: null, grade: 5 }, t + 200);
    s = ok(s, { type: "ready", playerId: C, ready: true }, t + 210);
    s = ok(s, { type: "start", playerId: A }, t + 300);
    s = ok(s, { type: "tick" }, t + 300 + DEFAULT_ROOM_TIMING.countdownMs);
    assert.notEqual(s.match!.questions[A]!.key, firstKey);
  });

  it("állapot-sorszám: minden kimenő változás növeli; elutasított esemény nem", () => {
    const s = lobby();
    const r = step(s, { type: "ready", playerId: B, ready: false }, T0 + 50);
    assert.equal(r.state.seq, s.seq + 1);
    const bad = step(r.state, { type: "start", playerId: B }, T0 + 60);
    assert.equal(bad.state.seq, r.state.seq);
  });
});

describe("JM2 room-machine — leállítás (drain)", () => {
  it("váróterem: azonnal zárul SERVER_RESTART-tal; új csatlakozás tiltva", () => {
    const r = step(lobby(), { type: "drain", deadlineMs: T0 + 240_000 }, T0 + 50);
    assert.equal(r.state.closed, true);
    assert.ok(r.effects.some((e) => e.type === "notice" && e.code === "SERVER_RESTART"));
  });

  // Orkesztrátori döntés (review #452): hosszú kifutás helyett rövid, rendezett lezárás — a futó meccs AZONNAL zárul.
  it("futó meccs: AZONNAL részeredménnyel (aborted, SERVER_RESTART) zárul, a felfedett körök állása szerint; a szoba lezárul", () => {
    let { s, t } = started();
    s = ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: 1000, medianRttMs: 0 }, t + 1000);
    s = ok(s, { type: "answer", playerId: B, round: 1, optionIndex: wrongOf(s, B), medianRttMs: 0 }, t + 1100);
    assert.equal(s.phase, "round_reveal");
    const r = step(s, { type: "drain", deadlineMs: t + 1200 }, t + 1200);
    const order = r.effects.map((e) => e.type);
    assert.ok(order.indexOf("result") >= 0 && order.indexOf("result") < order.indexOf("close"), `a részeredmény a lezárás előtt megy ki: ${order.join(",")}`);
    assert.ok(r.effects.some((e) => e.type === "notice" && e.code === "SERVER_RESTART"));
    assert.equal(r.state.closed, true);
    assert.equal(r.state.phase, "aborted");
    const res = resultView(r.state)!;
    assertSchema("match:result", res);
    assert.equal(res.aborted, true);
    assert.equal(res.reason, "SERVER_RESTART");
    assert.deepEqual(res.winners, [A], "részeredmény: az állás szerinti vezető");
  });

  it("befejezett meccs (visszavágó-ablak): a drain azonnal lezárja a szobát", () => {
    let { s, t } = started();
    s = ok(s, { type: "leave", playerId: B }, t + 10);
    assert.equal(s.phase, "finished");
    const r = step(s, { type: "drain", deadlineMs: t + 20 }, t + 20);
    assert.equal(r.state.closed, true);
    assert.equal(r.effects.some((e) => e.type === "result"), false, "a már kihirdetett eredmény nem ismétlődik");
  });
});

describe("JM2 room-machine — kapacitás-kímélés, gazdaság, statisztika (review #452)", () => {
  it("egyedül maradt váróterem 5 perc után zárul (a teljes váróterem 15 perc)", () => {
    const alone = room();
    assert.equal(nextWakeMs(alone, cfg), T0 + DEFAULT_ROOM_TIMING.lobbyAloneTtlMs);
    assert.equal(step(alone, { type: "tick" }, T0 + DEFAULT_ROOM_TIMING.lobbyAloneTtlMs).state.closed, true);
    const two = lobby();
    assert.equal(nextWakeMs(two, cfg), T0 + 20 + DEFAULT_ROOM_TIMING.lobbyTtlMs);
  });

  it("a nyitó rövid kiesés után visszakapja a gazdaságot; végleges kilépésekor a gazdaság örökös marad", () => {
    let s = lobby([[B, 5], [C, 5]]);
    s = ok(s, { type: "disconnect", playerId: A }, T0 + 30);
    assert.equal(s.hostId, B);
    s = ok(s, { type: "reconnect", playerId: A }, T0 + 40);
    assert.equal(s.hostId, A, "visszakapta");
    s = ok(s, { type: "leave", playerId: A }, T0 + 50);
    assert.equal(s.hostId, B);
    assert.equal(s.ownerId, B);
    s = ok(s, { type: "disconnect", playerId: B }, T0 + 60);
    s = ok(s, { type: "reconnect", playerId: B }, T0 + 70);
    assert.equal(s.hostId, B);
  });

  it("a „leggyorsabb helyes válasz” statisztika a szerver NYERS mérése (nem a kliens-kiegyenlített idő)", () => {
    let { s, t } = started();
    s = ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: 1000, medianRttMs: 120 }, t + 1100);
    assert.equal(s.match!.answers[A]!.acceptedMs, 1000);
    s = ok(s, { type: "leave", playerId: B }, t + 1200);
    // B kilépett a kör közben → azonnali zárás; a statisztika az eddig felfedett körökből (itt: egy sem) — ezért egy teljes kör:
    let r = started();
    r.s = ok(r.s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(r.s, A), clientRtMs: 1000, medianRttMs: 120 }, r.t + 1100);
    r.s = ok(r.s, { type: "answer", playerId: B, round: 1, optionIndex: wrongOf(r.s, B), medianRttMs: 0 }, r.t + 1300);
    r.s = ok(r.s, { type: "leave", playerId: B }, r.t + 1400);
    const res = resultView(r.s)!;
    assert.equal(res.stats.find((x) => x.playerId === A)!.fastestMs, 1100, "nyers szerveridő (1100), nem az elfogadott 1000");
  });
});

describe("JM2 room-machine — kilépett játékos a végeredményben (review #452)", () => {
  /** Lejátssza a meccset: `pick(id, round)` → helyes-e; `actions(round)` → a kör elején végrehajtandó események. */
  function play(s0: RoomState, t0: number, pick: (id: string, round: number) => boolean | null, actions: (s: RoomState, round: number, at: number) => RoomState = (s) => s): RoomState {
    let s = s0;
    let t = t0;
    for (let guard = 0; guard < 40 && (s.phase === "round_open" || s.phase === "round_reveal"); guard++) {
      if (s.phase === "round_open") {
        s = actions(s, s.match!.roundNo, t);
        if (s.phase !== "round_open") continue;
        for (const id of Object.keys(s.match!.questions)) {
          const p = s.players.find((x) => x.id === id)!;
          if (p.left || !p.connected || s.phase !== "round_open") continue;
          const right = pick(id, s.match!.roundNo);
          if (right === null) continue;
          s = ok(s, { type: "answer", playerId: id, round: s.match!.roundNo, optionIndex: right ? correctOf(s, id) : wrongOf(s, id), clientRtMs: 1000, medianRttMs: 0 }, t + 1000);
        }
        if (s.phase === "round_open") {
          t = nextWakeMs(s, cfg)!;
          s = ok(s, { type: "tick" }, t);
        }
      } else {
        t = nextWakeMs(s, cfg)!;
        s = ok(s, { type: "tick" }, t);
      }
    }
    return s;
  }

  it("repro: A egyedül helyes az 1. körben, kilép; B és C végig hibázik → A NEM győztes, a dobogón a bent maradók mögött", () => {
    const { s, t } = started([[B, 5], [C, 5]]);
    const end = play(s, t, (id) => id === A, (st, round, at) => (round === 2 && !st.players.find((p) => p.id === A)!.left ? ok(st, { type: "leave", playerId: A }, at + 1) : st));
    assert.equal(end.phase, "finished");
    const res = resultView(end)!;
    assert.equal(res.reason, "COMPLETED");
    assert.equal(res.winners.includes(A), false);
    assert.equal(res.coWin, true, "B és C holtversenyben (2 döntő után közös győzelem)");
    assert.deepEqual(res.winners.sort(), [B, C].sort());
    assert.deepEqual(res.podium[res.podium.length - 1], [A]);
    assert.equal(end.players.find((p) => p.id === A)!.left, true);
    assert.equal(res.stats.find((x) => x.playerId === A)!.correct, 1, "a kilépett statisztikája megmarad");
  });

  it("kilépett + holtverseny a bent maradók közt: a döntő kérdés csak köztük, a kilépett nem kap kérdést", () => {
    const { s, t } = started([[B, 5], [C, 5]]);
    let tiebreakAsked = 0;
    const end = play(
      s,
      t,
      (id) => id === A,
      (st, round, at) => {
        if (st.match!.tiebreak) {
          tiebreakAsked++;
          assert.deepEqual(Object.keys(st.match!.questions).sort(), [B, C].sort());
        }
        return round === 2 && !st.players.find((p) => p.id === A)!.left ? ok(st, { type: "leave", playerId: A }, at + 1) : st;
      },
    );
    assert.equal(tiebreakAsked, 2);
    assert.equal(resultView(end)!.coWin, true);
  });

  it("mindenki kilép egy kivételével (4 főből 3): azonnali „ellenfél kilépett” zárás, a maradó győz", () => {
    let { s, t } = started([[B, 5], [C, 5], [D, 5]]);
    s = ok(s, { type: "answer", playerId: B, round: 1, optionIndex: correctOf(s, B), clientRtMs: 500, medianRttMs: 0 }, t + 500);
    s = ok(s, { type: "leave", playerId: B }, t + 600);
    s = ok(s, { type: "leave", playerId: C }, t + 700);
    assert.equal(s.phase, "round_open");
    s = ok(s, { type: "leave", playerId: A }, t + 800);
    assert.equal(s.phase, "finished");
    const res = resultView(s)!;
    assert.equal(res.reason, "OPPONENT_LEFT");
    assert.deepEqual(res.winners, [D]);
    assert.deepEqual(res.podium[0], [D]);
  });

  it("kilépés a felfedés pillanatában: a következő kör már nélküle indul, győztes nem lehet", () => {
    let { s, t } = started([[B, 5], [C, 5]]);
    s = ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: 500, medianRttMs: 0 }, t + 500);
    s = ok(s, { type: "answer", playerId: B, round: 1, optionIndex: wrongOf(s, B), medianRttMs: 0 }, t + 600);
    s = ok(s, { type: "answer", playerId: C, round: 1, optionIndex: wrongOf(s, C), medianRttMs: 0 }, t + 700);
    assert.equal(s.phase, "round_reveal");
    s = ok(s, { type: "leave", playerId: A }, t + 701);
    s = ok(s, { type: "tick" }, nextWakeMs(s, cfg)!);
    assert.equal(s.phase, "round_open");
    assert.deepEqual(Object.keys(s.match!.questions).sort(), [B, C].sort());
    const end = play(s, s.phaseStartMs, () => false);
    assert.equal(resultView(end)!.winners.includes(A), false);
  });

  it("átmeneti kiesés: a 7. kör előtt visszatérő teljes jogú (győzhet); aki a meccs végén sincs kapcsolatban, nem győztes", () => {
    // Visszatér a 3. körben → győz.
    let { s, t } = started([[B, 5]]);
    const back = play(s, t, (id, round) => (id === A ? (round >= 2 && round <= 2 ? null : true) : false), (st, round, at) => {
      if (round === 2 && st.players.find((p) => p.id === A)!.connected) return ok(st, { type: "disconnect", playerId: A }, at + 1);
      if (round === 3 && !st.players.find((p) => p.id === A)!.connected) return ok(st, { type: "reconnect", playerId: A }, at + 1);
      return st;
    });
    assert.deepEqual(resultView(back)!.winners, [A]);
    // A 7. körben esik ki és nem tér vissza a meccs végéig (a türelmi időn belül ér véget a meccs) → nem győztes.
    ({ s, t } = started([[B, 5]]));
    const gone = play(s, t, (id, round) => (id === A ? (round >= 7 ? null : true) : false), (st, round, at) =>
      round === 7 && st.players.find((p) => p.id === A)!.connected ? ok(st, { type: "disconnect", playerId: A }, at + 1) : st,
    );
    const res = resultView(gone)!;
    assert.equal(gone.players.find((p) => p.id === A)!.left, false, "még a türelmi időn belül");
    assert.deepEqual(res.winners, [B]);
    assert.deepEqual(res.podium[res.podium.length - 1], [A]);
  });
});

describe("JM2 room-machine — bank-kimerülés visszavágók közben (review #452)", () => {
  /** Kis bank: évfolyamonként `n` tétel (mindhárom tierben), így néhány visszavágó után kimerül. */
  function tinyBank(n: number) {
    const items = [];
    for (const g of [4, 5, 9]) for (let i = 0; i < n; i++) items.push({ id: `g${g}-t-${i}`, grade: g, subject: "math", tier: ((i % 3) + 1) as 1 | 2 | 3, prompt: `${g}. évf. kérdés ${i}?`, options: ["a", "b", "c", "d"], correctIndex: 0 });
    return items;
  }

  it("invariáns: tetszőleges seed, kis bank (11 / évfolyam — a 2. meccs közepén kimerül), több visszavágó, vegyes évfolyam — egy meccsen belül játékosonként nincs ismételt kérdés", () => {
    for (const seed of ["s1", "s2", "s3", "x-42"]) {
      const c: RoomConfig = { provider: createQuestionProvider(tinyBank(11)) };
      let s = createRoom({ code: "ABCDEF", gameId: "parbaj", mode: "duel", seed, host: { playerId: A, nickname: "A", avatar: null, grade: 4 }, nowMs: T0 });
      s = reduceRoom(s, { type: "join", playerId: B, nickname: "B", avatar: null, grade: 9 }, T0 + 1, c).state;
      s = reduceRoom(s, { type: "join", playerId: C, nickname: "C", avatar: null, grade: 4 }, T0 + 2, c).state;
      let t = T0 + 10;
      for (let match = 0; match < 5; match++) {
        for (const id of [B, C]) s = reduceRoom(s, { type: "ready", playerId: id, ready: true }, t, c).state;
        const st = reduceRoom(s, { type: "start", playerId: A }, t, c);
        assert.equal(st.error, undefined, `start: ${st.error}`);
        s = st.state;
        const seen: Record<string, Set<string>> = { [A]: new Set(), [B]: new Set(), [C]: new Set() };
        for (let guard = 0; guard < 60 && s.phase !== "finished" && s.phase !== "aborted"; guard++) {
          if (s.phase === "round_open") {
            for (const [id, q] of Object.entries(s.match!.questions)) {
              assert.equal(seen[id]!.has(q.key), false, `seed ${seed}, meccs ${match + 1}: ismételt kérdés ${q.key} (${id})`);
              seen[id]!.add(q.key);
            }
            // mindenki rosszul válaszol → holtverseny → döntők is lefutnak (több kérdés / meccs)
            for (const id of Object.keys(s.match!.questions)) s = reduceRoom(s, { type: "answer", playerId: id, round: s.match!.roundNo, optionIndex: (s.match!.questions[id]!.correctIndex + 1) % 4, medianRttMs: 0 }, t + 500, c).state;
          }
          t = Math.max(t + 1, nextWakeMs(s, c)!);
          s = reduceRoom(s, { type: "tick" }, t, c).state;
        }
        assert.equal(s.phase, "finished", `seed ${seed}, meccs ${match + 1}: ${s.phase} ${resultView(s)?.reason}`);
        assert.ok(seen[A]!.size === 9, `9 kérdés / meccs (7 + 2 döntő): ${seen[A]!.size}`);
        s = reduceRoom(s, { type: "rematch", playerId: A }, t + 10, c).state;
        t += 20;
      }
    }
  });

  it("ha a bank még a korábbi meccsek kérdéseinek felszabadítása után is kevés egy meccshez → NO_QUESTIONS lezárás (nem ismétel)", () => {
    const c: RoomConfig = { provider: createQuestionProvider(tinyBank(4)) };
    let s = createRoom({ code: "ABCDEF", gameId: "parbaj", mode: "duel", seed: "q", host: { playerId: A, nickname: "A", avatar: null, grade: 5 }, nowMs: T0 });
    s = reduceRoom(s, { type: "join", playerId: B, nickname: "B", avatar: null, grade: 5 }, T0 + 1, c).state;
    s = reduceRoom(s, { type: "ready", playerId: B, ready: true }, T0 + 2, c).state;
    s = reduceRoom(s, { type: "start", playerId: A }, T0 + 3, c).state;
    let t = T0 + 3;
    const keys = new Set<string>();
    for (let guard = 0; guard < 60 && s.phase !== "finished" && s.phase !== "aborted"; guard++) {
      if (s.phase === "round_open") {
        const k = s.match!.questions[A]!.key;
        assert.equal(keys.has(k), false);
        keys.add(k);
        for (const id of [A, B]) s = reduceRoom(s, { type: "answer", playerId: id, round: s.match!.roundNo, optionIndex: (s.match!.questions[id]!.correctIndex + 1) % 4, medianRttMs: 0 }, t + 500, c).state;
      }
      t = Math.max(t + 1, nextWakeMs(s, c)!);
      s = reduceRoom(s, { type: "tick" }, t, c).state;
    }
    assert.equal(s.phase, "aborted");
    assert.equal(resultView(s)!.reason, "NO_QUESTIONS");
    assert.ok(keys.size <= 4 + 4 + 4, "csak a 4–5–6. évfolyam tartalékából, ismétlés nélkül");
  });
});
