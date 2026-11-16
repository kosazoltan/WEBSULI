import assert from "node:assert/strict";
import test from "node:test";

import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import { createRng, seedFrom, type Rng } from "../shared/game-rng";
import { DUEL_MAX_TIEBREAKS, DUEL_ROUNDS } from "../shared/duel/rules";
import type { DuelQuestion } from "../shared/duel/questions";
import {
  DEFAULT_ROOM_TIMING,
  createRoom,
  nextWakeMs,
  reduceRoom,
  type RoomConfig,
  type RoomEffect,
  type RoomEvent,
  type RoomQuestionRequest,
  type RoomState,
} from "../shared/duel/room-machine";
import { createQuestionProvider } from "../server/realtime/question-provider";

/**
 * JM1r (D20) — a párbaj determinizmusa és bot-szimulációja a szerver-tekintélyű `room-machine`-en.
 *
 * SPEC-VÁLTOZÁS 2026-11-16 (terv 13. D20, végrehajtás JM1r): az egyeszközös aréna motorja (`shared/duel/match.ts`) a
 * tulajdonosi döntés szerint megszűnt; a `tests/duel-match.test.ts` három értékes tesztje (arany visszajátszás — J19,
 * 3000 bot-meccs — a D14-szabály empirikus bizonyítéka, 200 valódi bankos meccs vegyes évfolyammal) UGYANAZOKKAL a
 * mércékkel ide költözött: a meccset most a `reduceRoom` hajtja (join / ready / start / answer / tick), ugyanúgy, ahogy a
 * szerver-réteg (és a JM3a gépi ellenfele) teszi.
 */

const T0 = 1_700_000_000_000;
const A = "PAaaaaaaaaa";
const B = "PBbbbbbbbbb";

/** Kis, gyors szolgáltató a bot-szimulációhoz: fix 4 opció, a helyes index seedelt, ablak évfolyam szerint. */
function fakeProvider(): RoomConfig["provider"] {
  return (req: RoomQuestionRequest): DuelQuestion => {
    const rng = createRng(seedFrom("fake", req.seed, req.round, req.grade));
    return {
      key: `q${req.round}-${req.grade}`,
      prompt: `Kérdés ${req.round}`,
      options: ["A", "B", "C", "D"],
      correctIndex: rng.int(4),
      grade: req.grade,
      windowMs: windowMsFor("rövid", req.grade, 6000),
    };
  };
}

type Run = { state: RoomState; effects: RoomEffect[]; errors: string[] };

function run(state: RoomState, events: Array<{ ev: RoomEvent; at: number }>, cfg: RoomConfig): Run {
  const effects: RoomEffect[] = [];
  const errors: string[] = [];
  let s = state;
  for (const { ev, at } of events) {
    const r = reduceRoom(s, ev, at, cfg);
    s = r.state;
    effects.push(...r.effects);
    errors.push(r.error ?? "");
  }
  return { state: s, effects, errors };
}

/** A gazda (A) szobája, B csatlakozik és kész, A indít → a visszaszámlálás után a `tick` nyitja az 1. kört. */
function startedRoom(seed: string, cfg: RoomConfig, grades: [number, number], band = 0.55): { s: RoomState; t: number } {
  let s = createRoom({ code: "ABCDEF", gameId: "parbaj", mode: "duel", seed, settings: { band }, host: { playerId: A, nickname: "A", avatar: null, grade: grades[0] }, nowMs: T0 });
  const r = run(
    s,
    [
      { ev: { type: "join", playerId: B, nickname: "B", avatar: null, grade: grades[1] }, at: T0 + 10 },
      { ev: { type: "ready", playerId: B, ready: true }, at: T0 + 20 },
      { ev: { type: "start", playerId: A }, at: T0 + 30 },
      { ev: { type: "tick" }, at: T0 + 30 + DEFAULT_ROOM_TIMING.countdownMs },
    ],
    cfg,
  );
  assert.deepEqual(r.errors, ["", "", "", ""]);
  s = r.state;
  assert.equal(s.phase, "round_open");
  return { s, t: T0 + 30 + DEFAULT_ROOM_TIMING.countdownMs };
}

test("determinizmus (J19, arany visszajátszás): azonos seed + azonos esemény-sorozat → bitre azonos meccs (állapot, hatások, hibák); más seed → más kérdések", () => {
  const cfg: RoomConfig = { provider: createQuestionProvider() };
  const events: Array<{ ev: RoomEvent; at: number }> = [
    { ev: { type: "join", playerId: B, nickname: "B", avatar: null, grade: 7 }, at: T0 + 10 },
    { ev: { type: "ready", playerId: B, ready: true }, at: T0 + 20 },
    { ev: { type: "start", playerId: A }, at: T0 + 30 },
  ];
  let t = T0 + 30 + DEFAULT_ROOM_TIMING.countdownMs;
  events.push({ ev: { type: "tick" }, at: t });
  for (let r = 1; r <= DUEL_ROUNDS + DUEL_MAX_TIEBREAKS; r++) {
    events.push({ ev: { type: "answer", playerId: A, round: r, optionIndex: r % 4, clientRtMs: 850, medianRttMs: 0 }, at: t + 900 });
    events.push({ ev: { type: "answer", playerId: B, round: r, optionIndex: (r * 3) % 4, medianRttMs: 0 }, at: t + 1700 });
    t += 1700 + DEFAULT_ROOM_TIMING.revealMs;
    events.push({ ev: { type: "tick" }, at: t });
  }
  const make = (seed: string) =>
    run(createRoom({ code: "ABCDEF", gameId: "parbaj", mode: "duel", seed, host: { playerId: A, nickname: "A", avatar: null, grade: 4 }, nowMs: T0 }), events, cfg);
  const a = make("arany-meccs");
  const b = make("arany-meccs");
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.effects, b.effects);
  assert.deepEqual(a.errors, b.errors);
  assert.ok(a.effects.some((e) => e.type === "reveal"), "volt felfedés");
  assert.ok(a.effects.some((e) => e.type === "result"), "a meccs véget ért");
  // arany ujjlenyomat: más seed más kérdéssort ad
  const c = make("masik-meccs");
  assert.notDeepEqual(a.state.used, c.state.used);
});

/** Bot: pontosság + reakcióidő az ablak arányában (seedelt). Az eseményeket úgy küldi, ahogy egy játékos koppintana. */
type Bot = { accuracy: number; reactMin: number; reactMax: number };

function simulate(seed: string, bots: Record<string, Bot>, grades: [number, number], cfg: RoomConfig, band = 0.55) {
  const rng: Rng = createRng(seedFrom("bots", seed));
  let { s, t: now } = startedRoom(seed, cfg, grades, band);
  const startedAt = now;
  let plan: Array<{ id: string; at: number; option: number }> = [];
  let plannedRound = 0;
  let steps = 0;
  while (s.phase !== "finished" && s.phase !== "aborted") {
    if (++steps > 10_000) throw new Error(`a meccs nem ért véget (${seed})`);
    const m = s.match!;
    if (s.phase === "round_open" && plannedRound !== m.roundNo) {
      plannedRound = m.roundNo;
      plan = [];
      for (const id of Object.keys(m.questions)) {
        const q = m.questions[id]!;
        const bot = bots[id]!;
        const ratio = bot.reactMin + rng.next() * (bot.reactMax - bot.reactMin);
        const correct = rng.next() < bot.accuracy;
        const option = correct ? q.correctIndex : (q.correctIndex + 1 + rng.int(3)) % 4;
        plan.push({ id, at: m.openedAtMs + Math.round(ratio * q.windowMs), option });
      }
      plan.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
    }
    const wake = nextWakeMs(s, cfg)!;
    const next = s.phase === "round_open" ? plan.find((p) => !s.match!.answers[p.id]) : undefined;
    if (next && next.at <= wake) {
      now = Math.max(now, next.at);
      const r = reduceRoom(s, { type: "answer", playerId: next.id, round: m.roundNo, optionIndex: next.option, medianRttMs: 0 }, now, cfg);
      assert.equal(r.error, undefined, `váratlan elutasítás: ${r.error}`);
      s = r.state;
      plan = plan.filter((p) => p !== next);
    } else {
      now = Math.max(now, wake);
      s = reduceRoom(s, { type: "tick" }, now, cfg).state;
    }
  }
  return { state: s, durationMs: now - startedAt };
}

test("bot-szimuláció (3000 meccs): mindig véget ér, legfeljebb 7 + 2 kör; a pontosabb nyer túlnyomórészt; a gyorsaság önmagában nem veri a pontosságot", (t) => {
  const cfg: RoomConfig = { provider: fakeProvider() };
  const tally = (bots: Record<string, Bot>, n: number, tag: string) => {
    const wins = { a: 0, b: 0, co: 0 };
    const durations: number[] = [];
    for (let i = 0; i < n; i++) {
      const { state, durationMs } = simulate(`${tag}-${i}`, { [A]: bots.a!, [B]: bots.b! }, [5, 5], cfg);
      assert.equal(state.phase, "finished");
      const m = state.match!;
      assert.ok(m.duel.round >= 1 && m.duel.round <= DUEL_ROUNDS + DUEL_MAX_TIEBREAKS, `körök: ${m.duel.round}`);
      assert.ok(m.duel.tiebreaks <= DUEL_MAX_TIEBREAKS);
      const res = m.result!;
      assert.equal(res.reason, "COMPLETED");
      assert.ok(res.winners.length >= 1);
      if (res.coWin) wins.co++;
      else wins[res.winners[0] === A ? "a" : "b"]++;
      durations.push(durationMs);
    }
    durations.sort((x, y) => x - y);
    return { ...wins, medianSec: durations[Math.floor(durations.length / 2)]! / 1000 };
  };
  // 1) pontosabb (0,85) vs gyengébb (0,55), azonos tempó
  const acc = tally({ a: { accuracy: 0.85, reactMin: 0.3, reactMax: 0.8 }, b: { accuracy: 0.55, reactMin: 0.3, reactMax: 0.8 } }, 1000, "acc");
  assert.ok(acc.a / 1000 >= 0.8, `a pontosabb nyerési aránya ${acc.a / 1000}`);
  // 2) pontos, de lassú (0,85; 60–95% ablak) vs gyors, de pontatlan (0,6; 5–25% ablak)
  const speed = tally({ a: { accuracy: 0.85, reactMin: 0.6, reactMax: 0.95 }, b: { accuracy: 0.6, reactMin: 0.05, reactMax: 0.25 } }, 1000, "spd");
  // A bónusz plafonja (25%) miatt a 0,25-ös pontosság-előny (≈ 1,75 helyes válasz / 7 kör) többet ér a legnagyobb
  // gyorsasági előnynél is; a 7 körös meccs szórása miatt a küszöb 60% + legalább 20 pontos különbség.
  assert.ok(speed.a / 1000 >= 0.6 && speed.a - speed.b >= 200, `a pontos-lassú nyerési aránya ${speed.a / 1000} (gyors: ${speed.b / 1000})`);
  // 3) azonos pontosság: a gyorsabb előnyben van, de nem mindenható
  const same = tally({ a: { accuracy: 0.75, reactMin: 0.1, reactMax: 0.3 }, b: { accuracy: 0.75, reactMin: 0.5, reactMax: 0.9 } }, 1000, "same");
  assert.ok(same.a > same.b, "azonos pontosságnál a gyorsabb többször nyer");
  assert.ok(same.b / 1000 >= 0.1, `a lassabb is nyerhet (${same.b / 1000})`);
  t.diagnostic(`[duel-sim] acc=${JSON.stringify(acc)} speed=${JSON.stringify(speed)} same=${JSON.stringify(same)}`);
});

test("bot-szimuláció a valódi bankkal, vegyes évfolyammal (4. vs 8.): 200 meccs hibátlanul véget ér, ismétlés nélkül", () => {
  const base = createQuestionProvider();
  for (let i = 0; i < 200; i++) {
    const keys: Record<number, string[]> = { 4: [], 8: [] };
    const cfg: RoomConfig = {
      provider: (req) => {
        const q = base(req);
        if (q) keys[req.grade]!.push(q.key);
        return q;
      },
    };
    const { state } = simulate(`bank-${i}`, { [A]: { accuracy: 0.7, reactMin: 0.2, reactMax: 0.9 }, [B]: { accuracy: 0.7, reactMin: 0.2, reactMax: 0.9 } }, [4, 8], cfg, (i % 10) / 10);
    assert.equal(state.phase, "finished");
    assert.equal(state.match!.result!.reason, "COMPLETED", "nem fogyott el a kérdés");
    for (const g of [4, 8]) assert.equal(new Set(keys[g]).size, keys[g]!.length, "nincs ismétlés a meccsen belül");
  }
});
