import assert from "node:assert/strict";
import test from "node:test";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import { createRng, seedFrom, type Rng } from "../shared/game-rng";
import { DUEL_MAX_TIEBREAKS, DUEL_ROUNDS } from "../shared/duel/rules";
import { buildRoundQuestion, markDuelQuestionUsed, type DuelQuestion } from "../shared/duel/questions";
import {
  DEFAULT_MATCH_TIMING,
  createMatch,
  playerDeadlineMs,
  reduceMatch,
  type MatchConfig,
  type MatchEffect,
  type MatchEvent,
  type MatchPlayer,
  type MatchState,
} from "../shared/duel/match";

/**
 * JM1 — a párbaj-meccs állapotgépe (az egyeszközös aréna motorja): fázisok, időzítés, első válasz, ablakon túli válasz,
 * determinizmus (azonos seed + bemenet-sorozat → azonos meccs) és bot-szimuláció (ezer meccs, eltérő ügyesség).
 */

/** A valódi évfolyam-bankból, a valódi ablak-szabállyal, seedelt kérdés-szolgáltató (azonos évfolyam → azonos kérdés). */
function bankProvider(seed: string, band = 0.5): MatchConfig["provider"] {
  const used = new Map<number, Set<string>>();
  const cache = new Map<string, DuelQuestion | null>();
  return (round, player) => {
    const ck = `${round}:${player.grade}`;
    if (cache.has(ck)) return cache.get(ck)!;
    let u = used.get(player.grade);
    if (!u) used.set(player.grade, (u = new Set()));
    const q = buildRoundQuestion({ seed, round, grade: player.grade, band, used: u, items: GRADE_QUIZ_ITEMS, windowMs: (p, g) => windowMsFor(p, g, 6000) });
    if (q) markDuelQuestionUsed(u, q);
    cache.set(ck, q);
    return q;
  };
}

/** Kis, gyors szolgáltató a bot-szimulációhoz: fix 4 opció, a helyes index seedelt, ablak évfolyam szerint. */
function fakeProvider(seed: string): MatchConfig["provider"] {
  return (round, player) => {
    const rng = createRng(seedFrom("fake", seed, round, player.grade));
    return {
      key: `q${round}-${player.grade}`,
      prompt: `Kérdés ${round}`,
      options: ["A", "B", "C", "D"],
      correctIndex: rng.int(4),
      grade: player.grade,
      windowMs: windowMsFor("rövid", player.grade, 6000),
    };
  };
}

const P2: MatchPlayer[] = [
  { id: "p1", grade: 4 },
  { id: "p2", grade: 7 },
];

function run(state: MatchState, events: MatchEvent[], config: MatchConfig): { state: MatchState; effects: MatchEffect[] } {
  const effects: MatchEffect[] = [];
  let s = state;
  for (const ev of events) {
    const r = reduceMatch(s, ev, config);
    s = r.state;
    effects.push(...r.effects);
  }
  return { state: s, effects };
}

test("fázisok: ready → countdown (3-2-1) → intro → question → reveal → … → finished; 7 kör", () => {
  const config: MatchConfig = { players: P2, provider: fakeProvider("f") };
  let s = createMatch(config);
  assert.equal(s.phase, "ready");
  const effects: MatchEffect[] = [];
  const step = (ev: MatchEvent) => {
    const r = reduceMatch(s, ev, config);
    s = r.state;
    effects.push(...r.effects);
  };
  step({ type: "start", nowMs: 0 });
  assert.equal(s.phase, "countdown");
  step({ type: "tick", nowMs: 1000 });
  step({ type: "tick", nowMs: 2000 });
  assert.deepEqual(effects.filter((e) => e.type === "countdown").map((e) => (e as { secondsLeft: number }).secondsLeft), [3, 2, 1]);
  step({ type: "tick", nowMs: 3000 });
  assert.equal(s.phase, "intro");
  assert.equal(s.roundNo, 1);
  step({ type: "tick", nowMs: 3000 + DEFAULT_MATCH_TIMING.introMs });
  assert.equal(s.phase, "question");
  // p1 helyesen, p2 rosszul: a második válasz után azonnal reveal
  const t0 = s.openedAtMs;
  step({ type: "answer", playerId: "p1", optionIndex: s.questions.p1!.correctIndex, nowMs: t0 + 1200 });
  assert.equal(s.phase, "question");
  step({ type: "answer", playerId: "p2", optionIndex: (s.questions.p2!.correctIndex + 1) % 4, nowMs: t0 + 2000 });
  assert.equal(s.phase, "reveal");
  assert.equal(s.duel.hp.p2, 87.5);
  assert.equal(s.duel.hp.p1, 100);
  // a többi kör időtúllépéssel (senki nem válaszol): 7 kör után holtverseny NINCS (p1 vezet) → vége
  let now = s.phaseStartMs;
  for (let i = 0; i < 2000 && s.phase !== "finished"; i++) {
    now += 250;
    step({ type: "tick", nowMs: now });
  }
  assert.equal(s.phase, "finished");
  assert.equal(s.duel.round, DUEL_ROUNDS);
  assert.deepEqual(s.verdict!.winners, ["p1"]);
  assert.equal(effects.filter((e) => e.type === "open").length, DUEL_ROUNDS);
  assert.equal(effects.filter((e) => e.type === "finished").length, 1);
});

test("első válasz számít: a második ALREADY_ANSWERED; ablakon túl ROUND_CLOSED; rossz opció BAD_OPTION; nyitás előtt NOT_OPEN", () => {
  const config: MatchConfig = { players: P2, provider: fakeProvider("g") };
  let s = createMatch(config);
  let r = reduceMatch(s, { type: "answer", playerId: "p1", optionIndex: 0, nowMs: 0 }, config);
  assert.deepEqual(r.effects, [{ type: "rejected", playerId: "p1", code: "NOT_OPEN" }]);
  s = run(s, [{ type: "start", nowMs: 0 }, { type: "tick", nowMs: 3000 + DEFAULT_MATCH_TIMING.introMs }], config).state;
  assert.equal(s.phase, "question");
  const t0 = s.openedAtMs;
  r = reduceMatch(s, { type: "answer", playerId: "p1", optionIndex: 7, nowMs: t0 + 100 }, config);
  assert.equal((r.effects[0] as { code: string }).code, "BAD_OPTION");
  r = reduceMatch(s, { type: "answer", playerId: "nincs", optionIndex: 0, nowMs: t0 + 100 }, config);
  assert.equal((r.effects[0] as { code: string }).code, "UNKNOWN_PLAYER");
  s = reduceMatch(s, { type: "answer", playerId: "p1", optionIndex: 0, nowMs: t0 + 900 }, config).state;
  r = reduceMatch(s, { type: "answer", playerId: "p1", optionIndex: 1, nowMs: t0 + 950 }, config);
  assert.equal((r.effects[0] as { code: string }).code, "ALREADY_ANSWERED");
  assert.equal(r.state.answers.p1!.optionIndex, 0, "az első válasz marad");
  // p2 (7. évf., 6000 ms) a saját ablakán túl: ROUND_CLOSED — a kör ekkor a leghosszabb ablak végén zárul
  const late = playerDeadlineMs(s, "p2") + 1;
  r = reduceMatch(s, { type: "answer", playerId: "p2", optionIndex: 0, nowMs: late }, config);
  assert.equal(r.effects.some((e) => e.type === "rejected" && e.code === "ROUND_CLOSED"), true);
});

test("vegyes évfolyam a motorban: a 4. évfolyamos hosszabb saját ablakot kap, a 7.-es a saját ablaka után ROUND_CLOSED", () => {
  const config: MatchConfig = { players: P2, provider: fakeProvider("h") };
  let s = run(createMatch(config), [{ type: "start", nowMs: 0 }, { type: "tick", nowMs: 3000 + DEFAULT_MATCH_TIMING.introMs }], config).state;
  assert.ok(s.questions.p1!.windowMs > s.questions.p2!.windowMs);
  const t = s.openedAtMs + s.questions.p2!.windowMs + 500; // a 7.-esnek már lejárt, a 4.-esnek még nem
  const r1 = reduceMatch(s, { type: "answer", playerId: "p2", optionIndex: 0, nowMs: t }, config);
  assert.equal(r1.effects[0]!.type, "rejected");
  s = reduceMatch(s, { type: "answer", playerId: "p1", optionIndex: s.questions.p1!.correctIndex, nowMs: t }, config).state;
  assert.equal(s.answers.p1!.correct, true);
});

test("a motor mérése az elsődleges: a bemenet állítása csak a kereten (150 ms) belül számít lefelé", () => {
  const config: MatchConfig = { players: P2, provider: fakeProvider("i") };
  let s = run(createMatch(config), [{ type: "start", nowMs: 0 }, { type: "tick", nowMs: 3000 + DEFAULT_MATCH_TIMING.introMs }], config).state;
  const t0 = s.openedAtMs;
  s = reduceMatch(s, { type: "answer", playerId: "p1", optionIndex: 0, nowMs: t0 + 2000, clientRtMs: 100 }, config).state;
  assert.equal(s.answers.p1!.measuredMs, 2000);
  assert.equal(s.answers.p1!.acceptedMs, 1850);
  s = reduceMatch(s, { type: "answer", playerId: "p2", optionIndex: 0, nowMs: t0 + 2000, clientRtMs: 1950 }, config).state;
  assert.equal(s.lastAnswers.find((a) => a.playerId === "p2")!.acceptedMs, 1950);
  const fast = run(createMatch(config), [{ type: "start", nowMs: 0 }, { type: "tick", nowMs: 3000 + DEFAULT_MATCH_TIMING.introMs }], config).state;
  const r = reduceMatch(fast, { type: "answer", playerId: "p1", optionIndex: 0, nowMs: fast.openedAtMs + 120, clientRtMs: 0 }, config);
  assert.equal(r.state.answers.p1!.suspicious, true, "200 ms alatt gyanús, bónusz nélkül");
});

test("holtverseny a 7. kör után → legfeljebb 2 döntő kör („Döntő kérdés!” felvezetés), utána közös győzelem", () => {
  const config: MatchConfig = { players: [{ id: "a", grade: 6 }, { id: "b", grade: 6 }], provider: fakeProvider("tie") };
  let s = run(createMatch(config), [{ type: "start", nowMs: 0 }], config).state;
  const effects: MatchEffect[] = [];
  let now = 0;
  for (let i = 0; i < 2000 && s.phase !== "finished"; i++) {
    now += 100;
    let r = reduceMatch(s, { type: "tick", nowMs: now }, config);
    s = r.state;
    effects.push(...r.effects);
    if (s.phase === "question" && s.answers.a == null) {
      for (const id of ["a", "b"]) {
        r = reduceMatch(s, { type: "answer", playerId: id, optionIndex: s.questions[id]!.correctIndex, nowMs: now }, config);
        s = r.state;
        effects.push(...r.effects);
      }
    }
  }
  assert.equal(s.phase, "finished");
  assert.equal(s.duel.round, DUEL_ROUNDS + DUEL_MAX_TIEBREAKS);
  assert.equal(s.verdict!.coWin, true);
  const intros = effects.filter((e): e is Extract<MatchEffect, { type: "intro" }> => e.type === "intro");
  assert.deepEqual(intros.map((e) => e.tiebreak), [false, false, false, false, false, false, false, true, true]);
});

test("kimerült kérdésforrás: a meccs a jelenlegi állással zárul (exhausted), nem akad el", () => {
  let calls = 0;
  const config: MatchConfig = {
    players: P2,
    provider: (round, player) => (round > 2 ? null : (calls++, fakeProvider("ex")(round, player))),
  };
  let s = run(createMatch(config), [{ type: "start", nowMs: 0 }], config).state;
  for (let now = 0; now < 120_000 && s.phase !== "finished"; now += 500) s = reduceMatch(s, { type: "tick", nowMs: now }, config).state;
  assert.equal(s.phase, "finished");
  assert.equal(s.exhausted, true);
  assert.equal(s.verdict!.finished, true);
  assert.ok(calls > 0);
});

/** Bot: pontosság + reakcióidő az ablak arányában (seedelt). Visszaadja az eseményeket, ahogy egy játékos koppintana. */
type Bot = { accuracy: number; reactMin: number; reactMax: number };

function simulate(seed: string, bots: Record<string, Bot>, players: MatchPlayer[], provider = fakeProvider(seed)) {
  const config: MatchConfig = { players, provider };
  const rng: Rng = createRng(seedFrom("bots", seed));
  let s = reduceMatch(createMatch(config), { type: "start", nowMs: 0 }, config).state;
  let plan: Array<{ id: string; at: number; option: number }> = [];
  let plannedRound = 0;
  let now = 0;
  let steps = 0;
  while (s.phase !== "finished") {
    if (++steps > 10_000) throw new Error(`a meccs nem ért véget (${seed})`);
    if (s.phase === "question" && plannedRound !== s.roundNo) {
      plannedRound = s.roundNo;
      plan = [];
      for (const id of Object.keys(s.questions)) {
        const q = s.questions[id]!;
        const bot = bots[id]!;
        const ratio = bot.reactMin + rng.next() * (bot.reactMax - bot.reactMin);
        const correct = rng.next() < bot.accuracy;
        const option = correct ? q.correctIndex : (q.correctIndex + 1 + rng.int(3)) % 4;
        plan.push({ id, at: s.openedAtMs + Math.round(ratio * q.windowMs), option });
      }
      plan.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
    }
    const next = s.phase === "question" ? plan.find((p) => s.answers[p.id] == null) : undefined;
    const tickAt = now + 250;
    if (next && next.at <= tickAt) {
      now = Math.max(now, next.at);
      s = reduceMatch(s, { type: "answer", playerId: next.id, optionIndex: next.option, nowMs: now }, config).state;
      plan = plan.filter((p) => p !== next);
    } else {
      now = tickAt;
      s = reduceMatch(s, { type: "tick", nowMs: now }, config).state;
    }
  }
  return { state: s, durationMs: now };
}

test("determinizmus: azonos seed + azonos bemenet-sorozat → bitre azonos meccs (állapot és effektek)", () => {
  const events: MatchEvent[] = [{ type: "start", nowMs: 0 }];
  let t = 0;
  for (let r = 0; r < 9; r++) {
    t += 4100;
    events.push({ type: "tick", nowMs: t });
    events.push({ type: "answer", playerId: "p1", optionIndex: r % 4, nowMs: t + 900, clientRtMs: 850 });
    events.push({ type: "answer", playerId: "p2", optionIndex: (r * 3) % 4, nowMs: t + 1700 });
    t += 1700 + DEFAULT_MATCH_TIMING.revealMs;
    events.push({ type: "tick", nowMs: t });
  }
  const make = () => {
    const config: MatchConfig = { players: P2, provider: bankProvider("arany-meccs") };
    return run(createMatch(config), events, config);
  };
  const a = make();
  const b = make();
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.effects, b.effects);
  assert.ok(a.effects.some((e) => e.type === "reveal"));
  // arany ujjlenyomat: más seed más meccset ad
  const config: MatchConfig = { players: P2, provider: bankProvider("masik-meccs") };
  const c = run(createMatch(config), events, config);
  assert.notDeepEqual(
    Object.values(a.state.questions).map((q) => q.key),
    Object.values(c.state.questions).map((q) => q.key),
  );
});

test("bot-szimuláció (3000 meccs): mindig véget ér, legfeljebb 7 + 2 kör; a pontosabb nyer túlnyomórészt; a gyorsaság önmagában nem veri a pontosságot", (t) => {
  const players: MatchPlayer[] = [{ id: "a", grade: 5 }, { id: "b", grade: 5 }];
  const tally = (bots: Record<string, Bot>, n: number, tag: string) => {
    const wins = { a: 0, b: 0, co: 0 };
    const durations: number[] = [];
    for (let i = 0; i < n; i++) {
      const { state, durationMs } = simulate(`${tag}-${i}`, bots, players);
      assert.equal(state.phase, "finished");
      assert.ok(state.duel.round >= 1 && state.duel.round <= DUEL_ROUNDS + DUEL_MAX_TIEBREAKS, `körök: ${state.duel.round}`);
      assert.ok(state.duel.tiebreaks <= DUEL_MAX_TIEBREAKS);
      const v = state.verdict!;
      assert.ok(v.finished && v.winners.length >= 1);
      if (v.coWin) wins.co++;
      else wins[v.winners[0] as "a" | "b"]++;
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
  // eredmény a jelentéshez
  t.diagnostic(`[duel-sim] acc=${JSON.stringify(acc)} speed=${JSON.stringify(speed)} same=${JSON.stringify(same)}`);
});

test("bot-szimuláció a valódi bankkal, vegyes évfolyammal (4. vs 8.): 200 meccs hibátlanul véget ér, ismétlés nélkül", () => {
  for (let i = 0; i < 200; i++) {
    const players: MatchPlayer[] = [{ id: "a", grade: 4 }, { id: "b", grade: 8 }];
    const keys: Record<string, string[]> = { a: [], b: [] };
    const base = bankProvider(`bank-${i}`, (i % 10) / 10);
    const provider: MatchConfig["provider"] = (round, player) => {
      const q = base(round, player);
      if (q) keys[player.id]!.push(q.key);
      return q;
    };
    const { state } = simulate(`bank-${i}`, { a: { accuracy: 0.7, reactMin: 0.2, reactMax: 0.9 }, b: { accuracy: 0.7, reactMin: 0.2, reactMax: 0.9 } }, players, provider);
    assert.equal(state.phase, "finished");
    assert.equal(state.exhausted, false);
    for (const id of ["a", "b"]) assert.equal(new Set(keys[id]).size, keys[id]!.length, "nincs ismétlés a meccsen belül");
  }
});
