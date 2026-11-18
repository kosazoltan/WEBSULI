import assert from "node:assert/strict";
import test from "node:test";

import {
  BR_LEAD_IN_MS,
  BR_MOVE_MS,
  BR_WINDOW_MAX_MS,
  BR_WINDOW_MIN_MS,
  brainRotFullReadMs,
  brainRotWindowMs,
  paceBrainRotDirector,
  sharedBrainRotWindowMs,
} from "../client/src/lib/brainRot/pacing";
import { CAGE_ARM_MS } from "../client/src/lib/brainRot/core";
import { createSimGame } from "../client/src/lib/brainRot/sim";
import type { QuestionDirector } from "../client/src/game-engine/play/questionDirector";
import type { QuestionPresentation } from "../client/src/game-engine/play/types";

/**
 * Brain Rot válaszidő (terv docs/specs/2026-11-17-brainrot-valaszido.md, D1–D3; tulajdonosi hibajelentés 2026-11-17).
 * A régi (közös) ablak 6–9 s volt, a válaszokat fél súllyal számolta, és a 600 ms előjelzés is belőle fogyott.
 */
const SHORT = { prompt: "12 + 8 = ?", options: ["20", "18", "22", "19"] };
const LONG = {
  prompt: "Melyik gerinces csoportra igaz: változó testhőmérsékletűek, bőrüket szarupikkelyek fedik, szárazföldön raknak tojást?",
  options: ["távolságát a kezdő hosszúsági körtől", "távolságát az Egyenlítőtől", "távolságát a fővárostól", "tengerszint feletti magasságát"],
};

test("alsó korlát: a legrövidebb kérdésnél is ≥ 9 s és ≥ a régi ablak 1,25-szöröse", () => {
  for (const grade of [4, 5, 7, 11, null]) {
    const w = brainRotWindowMs({ ...SHORT, grade });
    const old = sharedBrainRotWindowMs(SHORT.prompt, SHORT.options, grade);
    assert.ok(w >= BR_WINDOW_MIN_MS, `${grade}. évf.: ${w}`);
    assert.ok(w >= old * 1.25, `${grade}. évf.: ${w} < 1,25 × ${old}`);
  }
});

test("hosszú kérdés: a teljes szöveg (prompt + mind a 4 válasz) végigolvasása 100 szó/perccel + a ketrechez jutás belefér; a régi 9 s-os plafon fölött", () => {
  const words = (LONG.prompt + " " + LONG.options.join(" ")).trim().split(/\s+/u).length;
  const read100 = (words / 100) * 60_000;
  for (const grade of [5, 7]) {
    const w = brainRotWindowMs({ ...LONG, grade });
    assert.ok(w >= read100 + BR_MOVE_MS, `${grade}. évf.: ${w} ms < ${Math.round(read100)} + ${BR_MOVE_MS}`);
    assert.ok(w > 9000, `${grade}. évf.: a régi plafon (9 s) fölött (${w})`);
    assert.ok(sharedBrainRotWindowMs(LONG.prompt, LONG.options, grade) <= 9000, "a régi ablak legfeljebb 9 s volt");
  }
  // 3–4. évfolyam: lassabb olvasás → hosszabb ablak ugyanarra a szövegre.
  assert.ok(brainRotWindowMs({ ...LONG, grade: 4 }) > brainRotWindowMs({ ...LONG, grade: 7 }));
});

test("a válaszok teljes súllyal számítanak; monoton a szöveg hosszában; felső korlát 30 s", () => {
  const base = brainRotWindowMs({ prompt: LONG.prompt, options: ["a", "b", "c", "d"], grade: 7 });
  const withLongAnswers = brainRotWindowMs({ ...LONG, grade: 7 });
  assert.ok(withLongAnswers > base, "a hosszú válaszok több időt adnak");
  assert.equal(brainRotFullReadMs("egy kettő három", ["négy", "öt"], 7), Math.round((5 / 120) * 60_000));
  const huge = brainRotWindowMs({ prompt: "szó ".repeat(400), options: ["a", "b", "c", "d"], grade: 4 });
  assert.equal(huge, BR_WINDOW_MAX_MS);
});

function fakePresentation(id: number, startedAtSimMs: number): QuestionPresentation {
  return {
    id,
    question: { key: `k${id}`, quiz: { id: "", prompt: LONG.prompt, options: LONG.options, correctIndex: 0 }, source: "bank" },
    isReview: false,
    options: LONG.options.map((label, i) => ({ label, originalIndex: i, correct: i === 0 })),
    windowMs: 7000,
    slowMo: 0.6,
    startedAtSimMs,
    reason: "trigger",
  };
}

test("a burkoló: az óra az előjelzés után indul, az ablak a Brain Rot-ablak, kérdésenként azonos objektum; a director többi része érintetlen", () => {
  let current: QuestionPresentation | null = fakePresentation(1, 5000);
  let answered: unknown[] = [];
  const base = {
    tick: () => current,
    request: () => current,
    active: () => current,
    answer: (...a: unknown[]) => {
      answered = a;
      return null;
    },
  } as unknown as QuestionDirector;
  const paced = paceBrainRotDirector(base, { grade: () => 7 });
  const a = paced.request("trigger", 5000)!;
  assert.equal(BR_LEAD_IN_MS, CAGE_ARM_MS);
  assert.equal(a.startedAtSimMs, 5000 + CAGE_ARM_MS, "az óra a ketrecek élesítése után indul");
  assert.equal(a.windowMs, brainRotWindowMs({ prompt: LONG.prompt, options: LONG.options, grade: 7 }));
  assert.equal(paced.active(), a, "azonos identitás");
  paced.answer(1, 0, 9000);
  assert.deepEqual(answered, [1, 0, 9000], "a válasz a director-é");
  current = null;
  assert.equal(paced.active(), null);
});

test("a sim ugyanazt a burkolt ablakot kapja, mint a lap", () => {
  const g = createSimGame({ seed: 3, grade: 7, questions: true });
  let seen: { windowMs: number } | null = null;
  for (let i = 0; i < 6000 && !seen && !g.done(); i++) {
    seen = g.question();
    g.step(1000 / 60, { skillRoll: 0 });
  }
  assert.ok(seen, "volt kérdés");
  assert.ok(seen!.windowMs >= BR_WINDOW_MIN_MS, `a sim ablaka ${seen!.windowMs}`);
});
