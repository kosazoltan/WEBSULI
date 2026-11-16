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
    assert.equal(rv.results.find((r) => r.playerId === A)!.answered, false);
    assert.ok(rv.results.find((r) => r.playerId === A)!.damage > 0, "a kilépő is kap sebzést (élő, de üres körök)");
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

  it("futó meccs: értesítés a határidővel, kifuthat; a határidőn túl részeredménnyel (aborted) zárul", () => {
    let { s, t } = started();
    s = ok(s, { type: "answer", playerId: A, round: 1, optionIndex: correctOf(s, A), clientRtMs: 1000, medianRttMs: 0 }, t + 1000);
    s = ok(s, { type: "answer", playerId: B, round: 1, optionIndex: wrongOf(s, B), medianRttMs: 0 }, t + 1100);
    const r = step(s, { type: "drain", deadlineMs: t + 5000 }, t + 1200);
    assert.ok(r.effects.some((e) => e.type === "notice" && e.code === "SERVER_RESTART" && e.deadlineMs === t + 5000));
    s = r.state;
    assert.equal(roomStateView(s, A, t + 1200, cfg).draining, true);
    assert.equal(step(s, { type: "rematch", playerId: A }, t + 1300).error, "BAD_PHASE");
    let at = t + 1200;
    while (s.phase !== "aborted" && s.phase !== "finished") {
      at = nextWakeMs(s, cfg)!;
      s = ok(s, { type: "tick" }, at);
    }
    assert.equal(s.phase, "aborted");
    assert.ok(at <= t + 5000);
    const res = resultView(s)!;
    assertSchema("match:result", res);
    assert.equal(res.aborted, true);
    assert.equal(res.reason, "SERVER_RESTART");
    assert.deepEqual(res.winners, [A], "részeredmény: az állás szerinti vezető");
    const closed = ok(s, { type: "tick" }, nextWakeMs(s, cfg)!);
    assert.equal(closed.closed, true);
  });
});
