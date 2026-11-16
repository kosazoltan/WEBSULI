import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import {
  REVEAL_CORRECT_MS,
  REVEAL_WRONG_MS,
  VIEW_STEP_MS,
  WHY_LINGER_MS,
  createQuestionUi,
  type QuestionUiView,
} from "../client/src/game-engine/play/useQuestionDirector";
import { createQuestionDirector, type DirectorConfig, type QuestionProvider } from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import { bankPlayQuestion } from "../client/src/game-engine/play/questionDirector";
import type { QuestionOutcome } from "../client/src/game-engine/play/types";

/**
 * J0c — a kérdés-sáv vezérlője (`createQuestionUi`, a `usePlayQuestion` tiszta magja): megoldás-kijelzés ≥ 1,8 mp
 * (J4), lassítás csak nyitott kérdésnél, utána teljes sebesség (J1, J5), „Miért?” a kijelzés + 4 mp, lejárat, React-frissítés
 * ≈ 10 Hz (KSZ-9).
 */

const CONFIG: DirectorConfig = {
  gameId: "speed-quiz-math", optionCount: 4, minGapMs: 1500, maxGapMs: 6000, targetPerMin: 9, baseWindowMs: 4000, slowMo: 0.5, grade: 6, warmupMs: 1000,
};

function setup() {
  let n = 0;
  const provider: QuestionProvider = {
    couponOnly: false,
    material: () => null,
    fresh: () => {
      n += 1;
      return bankPlayQuestion("speed-quiz-math", { id: `t${n}`, prompt: `Mennyi ${n} + ${n}?`, options: [`${2 * n}`, `${2 * n + 1}`, `${2 * n + 2}`, `${2 * n + 3}`], correctIndex: 0 });
    },
    restore: () => null,
  };
  const director = createQuestionDirector({ config: CONFIG, provider, review: createReviewQueue(null), rng: createRng(7), startBand: 0.5, now: () => 0 });
  const views: QuestionUiView[] = [];
  const outcomes: QuestionOutcome[] = [];
  const ui = createQuestionUi({ director: () => director, onView: (v) => views.push(v), onOutcome: (o) => outcomes.push(o) });
  return { ui, director, views, outcomes };
}

function openFirst(s: ReturnType<typeof setup>, at = 0): number {
  const p = s.ui.request("trigger", at);
  assert.ok(p, "a request kérdést nyit");
  return p.options.findIndex((o) => o.correct);
}

test("nyitott kérdésnél a sim-szorzó a slowMo, a kijelzés alatt és utána 1", () => {
  const s = setup();
  assert.equal(s.ui.timeScale(), 1);
  const correct = openFirst(s);
  assert.equal(s.ui.timeScale(), 0.5);
  s.ui.pick((correct + 1) % 4, 500);
  assert.equal(s.ui.timeScale(), 1, "hibás válasz után teljes sebesség (J5)");
});

test("hibás válasz: a megoldás ≥ 1,8 mp-ig látszik, a helyes és a választott index a megjelenítés szerint", () => {
  const s = setup();
  const correct = openFirst(s);
  const wrong = (correct + 1) % 4;
  s.ui.pick(wrong, 1000);
  assert.deepEqual(s.ui.view().reveal, { correctOptionIndex: correct, pickedOptionIndex: wrong });
  assert.ok(REVEAL_WRONG_MS >= 1800);
  s.ui.frame(1000 + 1799, { tick: false });
  assert.notEqual(s.ui.view().reveal, null, "1,8 mp előtt még látszik");
  assert.equal(s.ui.view().whyVisible, true);
  s.ui.frame(1000 + REVEAL_WRONG_MS, { tick: false });
  assert.equal(s.ui.view().reveal, null);
  assert.equal(s.ui.view().presentation, null);
  assert.equal(s.ui.view().whyVisible, true, "a „Miért?” a kijelzés után még elérhető");
  s.ui.frame(1000 + REVEAL_WRONG_MS + WHY_LINGER_MS - 1, { tick: false });
  assert.equal(s.ui.view().whyVisible, true);
  s.ui.frame(1000 + REVEAL_WRONG_MS + WHY_LINGER_MS, { tick: false });
  assert.equal(s.ui.view().whyVisible, false);
});

test("helyes válasz: rövid visszajelzés, nincs „Miért?”", () => {
  const s = setup();
  const correct = openFirst(s);
  s.ui.pick(correct, 800);
  assert.equal(s.outcomes.at(-1)?.result, "correct");
  assert.equal(s.ui.view().whyVisible, false);
  s.ui.frame(800 + REVEAL_CORRECT_MS, { tick: false });
  assert.equal(s.ui.view().presentation, null);
});

test("lejárat: a vezérlő hívja az expire-t, a kimenet timeout, a választott index null", () => {
  const s = setup();
  const p = s.ui.request("trigger", 0)!;
  s.ui.frame(p.windowMs - 1, { tick: false });
  assert.equal(s.outcomes.length, 0);
  s.ui.frame(p.windowMs, { tick: false });
  assert.equal(s.outcomes.at(-1)?.result, "timeout");
  assert.equal(s.ui.view().reveal?.pickedOptionIndex, null);
});

test("kettős koppintás: csak az első válasz számít; a kijelzés alatt nincs új válasz", () => {
  const s = setup();
  const correct = openFirst(s);
  assert.ok(s.ui.pick(correct, 100));
  assert.equal(s.ui.pick((correct + 1) % 4, 120), null);
  assert.equal(s.outcomes.length, 1);
});

test("a hátralévő idő React-frissítése ≈ 10 Hz (nem képkockánként)", () => {
  const s = setup();
  s.ui.request("trigger", 0);
  const before = s.views.length;
  for (let t = 0; t <= 1000; t += 1000 / 60) s.ui.frame(t, { tick: false });
  const emitted = s.views.length - before;
  assert.ok(emitted <= 1000 / VIEW_STEP_MS + 2, `${emitted} frissítés 1 mp alatt`);
  assert.ok(emitted >= 8, `${emitted} frissítés 1 mp alatt (az időcsík mozog)`);
});

test("ütemezett kérdés: a frame a bemelegítés után a director tick-jével nyit; tick: false-nál nem", () => {
  const s = setup();
  s.ui.frame(5000, { tick: false });
  assert.equal(s.ui.view().presentation, null);
  s.ui.frame(7000, { calm: true });
  assert.notEqual(s.ui.view().presentation, null);
});

test("a sim-mag saját válasza (a director közvetlen hívása) után a sáv elengedi a kérdést", () => {
  const s = setup();
  const p = s.ui.request("trigger", 0)!;
  s.director.answer(p.id, 0, 200);
  s.ui.frame(250, { tick: false });
  assert.equal(s.ui.view().presentation, null);
});
