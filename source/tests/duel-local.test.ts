import assert from "node:assert/strict";
import test from "node:test";

import { BOT_MIN_REACT_MS, BOT_PROFILES, planBotAnswer, recordBotResult, suggestBotSkill, type BotSkill } from "../shared/duel/bot";
import { serverEventSchemas } from "../shared/duel/protocol";
import { DUEL_MAX_TIEBREAKS, DUEL_ROUNDS } from "../shared/duel/rules";
import { createRng, seedFrom } from "../shared/game-rng";
import { BOT_ID, BOT_ME_ID, createBotSession, type DuelSession } from "../client/src/lib/duel/session";
import { createQuestionProvider } from "../server/realtime/question-provider";

/**
 * JM3a — a gépi ellenfél (terv D22): a kliensen futó `room-machine` + seedelt gépi játékos. Kézi órával és ütemezővel:
 * azonos seed + azonos bemenet → azonos meccs; a gép sosem válaszol emberfeletti gyorsan; a nehézség érezhető, a gép
 * legyőzhető; a felület ugyanazt a (protokoll-séma szerinti) `RtRoomState`-et kapja, mint online.
 */

/** Kézi idő + ütemező: a legkorábbi időzítő fut le, az óra odaugrik. */
function manualClock(start = 1_700_000_000_000) {
  let t = start;
  let seq = 0;
  const timers: Array<{ at: number; id: number; fn: () => void }> = [];
  return {
    now: () => t,
    schedule: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.push({ at: t + Math.max(0, ms), id, fn });
      return () => {
        const i = timers.findIndex((x) => x.id === id);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    /** A következő időzítő (vagy `until`) — visszaadja, futott-e valami. */
    step(until = Infinity): boolean {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > until) {
        if (until !== Infinity) t = Math.max(t, until);
        return false;
      }
      timers.shift();
      t = Math.max(t, next.at);
      next.fn();
      return true;
    },
    advance(ms: number) {
      const until = t + ms;
      while (this.step(until)) {
        /* időzítők lefutnak */
      }
      t = until;
    },
  };
}

const provider = createQuestionProvider();

/** Egy teljes gépi meccs: az „ember” `humanAcc` pontossággal, `humanRatio` ablak-arányban válaszol (seedelt). */
function playBotMatch(seed: string, skill: BotSkill, humanAcc: number, humanRatio: [number, number], grade = 5) {
  const clock = manualClock();
  // Az „ember” szimulációjához a teszt a saját szolgáltató-burkán át látja a kör helyes indexét (a felület nem látja).
  const correctByRound = new Map<number, number>();
  const recording: typeof provider = (req) => {
    const q = provider(req);
    if (q) correctByRound.set(req.round, q.correctIndex);
    return q;
  };
  const session: DuelSession = createBotSession({ grade, band: 0.55, subjects: [], skill, seed, nickname: "Bátor Róka", provider: recording, now: clock.now, schedule: clock.schedule });
  const rng = createRng(seedFrom("human", seed));
  const states: string[] = [];
  let answered = -1;
  for (let guard = 0; guard < 5000; guard++) {
    const s = session.getSnapshot().state!;
    states.push(`${s.seq}:${s.phase}:${s.round}`);
    if (s.phase === "finished" || s.phase === "aborted") break;
    const q = s.you.question;
    if (s.phase === "round_open" && q && answered !== q.round) {
      answered = q.round;
      const right = rng.next() < humanAcc;
      const at = q.openedAtServerTs + Math.round((humanRatio[0] + rng.next() * (humanRatio[1] - humanRatio[0])) * q.windowMs);
      const roundNo = q.round;
      const correctIndex = correctByRound.get(roundNo)!;
      clock.advance(Math.max(0, at - clock.now()));
      const cur = session.getSnapshot().state!;
      if (cur.phase === "round_open" && cur.round === roundNo) {
        const opt = right ? correctIndex : (correctIndex + 1) % q.options.length;
        void session.answer(roundNo, opt, Math.round(at - q.openedAtServerTs));
      }
      continue;
    }
    if (!clock.step()) break;
  }
  return { session, states, result: session.getSnapshot().state!.result };
}

test("bot-profilok: a gép sosem válaszol 900 ms alatt, mindig a saját ablakán belül; azonos seed + kör → azonos válasz", () => {
  for (const skill of ["beginner", "easy", "normal", "hard"] as const) {
    for (let r = 1; r <= 200; r++) {
      const p = planBotAnswer("s", r, { correctIndex: r % 4, optionCount: 4, windowMs: 2500 + (r % 7) * 900 }, BOT_PROFILES[skill]);
      assert.ok(p.atOffsetMs >= BOT_MIN_REACT_MS && p.atOffsetMs < 2500 + (r % 7) * 900, `${skill} ${r}: ${p.atOffsetMs}`);
      assert.ok(p.optionIndex >= 0 && p.optionIndex < 4);
      assert.equal(p.correct, p.optionIndex === r % 4);
      assert.deepEqual(p, planBotAnswer("s", r, { correctIndex: r % 4, optionCount: 4, windowMs: 2500 + (r % 7) * 900 }, BOT_PROFILES[skill]));
    }
  }
  const acc = (skill: BotSkill) => {
    let ok = 0;
    for (let r = 0; r < 4000; r++) if (planBotAnswer(`a${r}`, 1, { correctIndex: 0, optionCount: 4, windowMs: 6000 }, BOT_PROFILES[skill]).correct) ok++;
    return ok / 4000;
  };
  assert.ok(Math.abs(acc("beginner") - 0.36) < 0.03 && Math.abs(acc("easy") - 0.55) < 0.03 && Math.abs(acc("normal") - 0.7) < 0.03 && Math.abs(acc("hard") - 0.85) < 0.03);
});

test("áramlat-elv: két győzelem után nehezebb, két vereség után könnyebb, különben marad; első alkalom Közepes", () => {
  assert.equal(suggestBotSkill(null), "normal");
  let r = recordBotResult(null, "normal", "win");
  assert.equal(suggestBotSkill(r), "normal");
  r = recordBotResult(r, "normal", "win");
  assert.equal(suggestBotSkill(r), "hard");
  r = recordBotResult(r, "hard", "loss");
  r = recordBotResult(r, "hard", "loss");
  assert.equal(suggestBotSkill(r), "normal");
  // SPEC-VÁLTOZÁS 2026-11-16 (review #464 K1): a Könnyű alatt van még egy „Kezdő” szint — két vereség oda visz; alatta nincs lejjebb.
  assert.equal(suggestBotSkill(recordBotResult(recordBotResult(null, "easy", "loss"), "easy", "loss")), "beginner");
  assert.equal(suggestBotSkill(recordBotResult(recordBotResult(null, "beginner", "loss"), "beginner", "loss")), "beginner", "a legkönnyebbnél nincs lejjebb");
  assert.equal(recordBotResult({ skill: "hard", results: Array(10).fill("win") }, "hard", "co").results.length, 10);
});

test("gépi meccs: azonnal indul, 3-2-1 után kör, mindig véget ér ≤ 7 + 2 körrel; minden nézet a protokoll-séma szerinti (mint online)", () => {
  const { states, result, session } = playBotMatch("gep-1", "normal", 0.7, [0.2, 0.7]);
  assert.ok(states[0]!.includes("countdown"), states[0]);
  assert.ok(result, "van győzteshirdetés");
  assert.equal(result!.reason, "COMPLETED");
  const st = session.getSnapshot().state!;
  assert.ok(serverEventSchemas["room:state"].safeParse(st).success, "room:state séma");
  assert.equal(st.players.length, 2);
  assert.ok(st.players.some((p) => p.id === BOT_ID && p.nickname.startsWith("Gép")));
  const asked = result!.stats.find((x) => x.playerId === BOT_ME_ID)!.asked;
  assert.ok(asked >= 1 && asked <= DUEL_ROUNDS + DUEL_MAX_TIEBREAKS);
  assert.equal(session.getSnapshot().kind, "bot");
});

test("determinizmus (J19): azonos seed + azonos bemenet → bitre azonos meccs (állapot-sorozat és végeredmény); más seed → más", () => {
  const a = playBotMatch("gep-det", "hard", 0.6, [0.3, 0.6]);
  const b = playBotMatch("gep-det", "hard", 0.6, [0.3, 0.6]);
  assert.deepEqual(a.states, b.states);
  assert.deepEqual(a.result, b.result);
  assert.deepEqual(a.session.getSnapshot().state, b.session.getSnapshot().state);
  const c = playBotMatch("gep-mas", "hard", 0.6, [0.3, 0.6]);
  assert.notDeepEqual(a.session.getSnapshot().state!.lastReveal, c.session.getSnapshot().state!.lastReveal);
});

test("legyőzhető, de nem ajándék (300 meccs / cella): a 40%-os, lassú gyerek a Kezdőt többnyire legyőzi; a 70%-os a Könnyűt többnyire, a Nehéztől többnyire kikap, a Közepes kiegyenlített", (t) => {
  const rate = (skill: BotSkill, acc: number, ratio: [number, number]) => {
    let wins = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const r = playBotMatch(`flow-${skill}-${acc}-${i}`, skill, acc, ratio).result!;
      if (!r.coWin && r.winners[0] === BOT_ME_ID) wins++;
    }
    return wins / n;
  };
  const weakBeginner = rate("beginner", 0.4, [0.5, 0.95]);
  const beginner = rate("beginner", 0.7, [0.35, 0.75]);
  const easy = rate("easy", 0.7, [0.35, 0.75]);
  const normal = rate("normal", 0.7, [0.35, 0.75]);
  const hard = rate("hard", 0.7, [0.35, 0.75]);
  assert.ok(weakBeginner >= 0.5 && weakBeginner <= 0.8, `a 40%-os, lassú gyerek a Kezdő ellen: ${weakBeginner}`);
  assert.ok(beginner >= 0.85, `a 70%-os gyerek a Kezdő ellen: ${beginner}`);
  assert.ok(easy >= 0.6, `Könnyű ellen a 70%-os gyerek nyerési aránya ${easy}`);
  assert.ok(hard <= 0.4, `Nehéz ellen a gyerek nyerési aránya ${hard}`);
  assert.ok(hard >= 0.05, `a Nehéz gép is legyőzhető (${hard})`);
  assert.ok(normal > hard && normal < easy, `Közepes: ${normal}`);
  t.diagnostic(`[duel-bot] 40%-os lassú gyerek: Kezdő ${weakBeginner.toFixed(2)} · 70%-os gyerek: Kezdő ${beginner.toFixed(2)} · Könnyű ${easy.toFixed(2)} · Közepes ${normal.toFixed(2)} · Nehéz ${hard.toFixed(2)}`);
});

test("visszavágó a gép ellen: új meccs ugyanazokkal, új kérdésekkel; kilépés után a munkamenet zárva", async () => {
  const clock = manualClock();
  const s = createBotSession({ grade: 4, band: 0.25, subjects: ["math"], skill: "easy", seed: "vv", nickname: "Kis Róka", provider, now: clock.now, schedule: clock.schedule });
  for (let i = 0; i < 400 && s.getSnapshot().state!.phase !== "finished"; i++) clock.step();
  assert.equal(s.getSnapshot().state!.phase, "finished", "válasz nélkül is véget ér (a gép nyer)");
  assert.deepEqual(s.getSnapshot().state!.result!.winners, [BOT_ID]);
  assert.equal((await s.rematch()).ok, true);
  assert.equal(s.getSnapshot().state!.phase, "countdown");
  await s.leave();
  assert.equal(s.getSnapshot().conn, "closed");
  assert.deepEqual(await s.answer(1, 0, 100), { ok: false, code: "ROOM_NOT_FOUND" });
});

test("gépi módban a szünet (háttérbe kerülés) megállítja a meccs-órát és a gépet; folytatáskor onnan megy tovább (review #464 A6)", () => {
  const clock = manualClock();
  const s = createBotSession({ grade: 5, band: 0.55, subjects: [], skill: "hard", seed: "szunet", nickname: "Te", provider, now: clock.now, schedule: clock.schedule });
  for (let i = 0; i < 50 && s.getSnapshot().state!.phase !== "round_open"; i++) clock.step();
  const before = s.getSnapshot().state!;
  assert.equal(before.phase, "round_open");
  s.setPaused!(true);
  clock.advance(120_000); // két percig háttérben
  const during = s.getSnapshot().state!;
  assert.equal(during.seq, before.seq, "szünet alatt semmi nem történik");
  assert.equal(during.players.find((p) => p.id === BOT_ID)!.answered, false, "a gép sem válaszol");
  s.setPaused!(false);
  const resumed = s.getSnapshot().state!;
  assert.equal(resumed.phase, "round_open", "a kör folytatódik, nem járt le");
  assert.ok(s.getSnapshot().clockOffsetMs <= -120_000, "az időjelző az eltolt órához igazodik");
  for (let i = 0; i < 400 && s.getSnapshot().state!.phase !== "finished"; i++) clock.step();
  assert.equal(s.getSnapshot().state!.phase, "finished");
});
