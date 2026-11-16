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


const STEP = 1000 / 60;

/** Valódi időléptetés: képkockánként `frame` (ütemezéssel), amíg a feltétel nem teljesül vagy a határidő le nem jár. */
function runUntil(s: ReturnType<typeof setup>, from: number, to: number, stop: (t: number) => boolean, ctx: { calm?: boolean; tick?: boolean; hold?: boolean } = {}): number {
  for (let t = from; t <= to; t += STEP) {
    s.ui.frame(t, ctx);
    if (stop(t)) return t;
  }
  return Number.NaN;
}

test("nyitott kérdésnél a sim-szorzó a slowMo, a kijelzés alatt és utána 1", () => {
  const s = setup();
  assert.equal(s.ui.timeScale(), 1);
  const correct = openFirst(s);
  assert.equal(s.ui.timeScale(), 0.5);
  s.ui.pick((correct + 1) % 4, 500);
  assert.equal(s.ui.timeScale(), 1, "hibás válasz után teljes sebesség (J5)");
});

test("hibás válasz: a megoldás ≥ 1,8 mp-ig látszik; a „Miért?” a kijelzés vége után még 4 mp-ig", () => {
  const s = setup();
  const correct = openFirst(s);
  const wrong = (correct + 1) % 4;
  s.ui.pick(wrong, 1000);
  assert.deepEqual(s.ui.view().reveal, { correctOptionIndex: correct, pickedOptionIndex: wrong });
  assert.ok(REVEAL_WRONG_MS >= 1800);
  s.ui.frame(1000 + 1799, { tick: false });
  assert.notEqual(s.ui.view().reveal, null, "1,8 mp előtt még látszik");
  assert.equal(s.ui.view().whyFor, "current");
  s.ui.frame(1000 + REVEAL_WRONG_MS, { tick: false });
  assert.equal(s.ui.view().reveal, null);
  assert.equal(s.ui.view().presentation, null);
  assert.equal(s.ui.view().whyVisible, true, "a „Miért?” a kijelzés után még elérhető");
  s.ui.frame(1000 + REVEAL_WRONG_MS + WHY_LINGER_MS - 1, { tick: false });
  assert.equal(s.ui.view().whyVisible, true);
  s.ui.frame(1000 + REVEAL_WRONG_MS + WHY_LINGER_MS, { tick: false });
  assert.equal(s.ui.view().whyVisible, false);
  assert.equal(s.ui.view().whyItem, null);
});

test("a kijelzés legalább 1,8 mp akkor is, ha rövidebbet kérnek (revealWrongMs alsó korlát)", () => {
  let n = 0;
  const provider: QuestionProvider = {
    couponOnly: false, material: () => null, restore: () => null,
    fresh: () => bankPlayQuestion("speed-quiz-math", { id: `x${++n}`, prompt: "?", options: ["a", "b", "c", "d"], correctIndex: 0 }),
  };
  const director = createQuestionDirector({ config: CONFIG, provider, review: createReviewQueue(null), rng: createRng(1), startBand: 0.5, now: () => 0 });
  const ui = createQuestionUi({ director: () => director, onView: () => {}, revealWrongMs: 500 });
  const p = ui.request("trigger", 0)!;
  ui.pick(p.options.findIndex((o) => !o.correct), 100);
  ui.frame(100 + 1799, { tick: false });
  assert.notEqual(ui.view().reveal, null);
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

test("válasz a lejárat pillanatában (clock ≥ határidő) lejáratként záródik, nem helyesként", () => {
  const s = setup();
  const p = s.ui.request("trigger", 0)!;
  const o = s.ui.pick(p.options.findIndex((x) => x.correct), p.windowMs);
  assert.equal(o?.result, "timeout");
  assert.equal(s.outcomes.length, 1);
  const s2 = setup();
  const p2 = s2.ui.request("trigger", 0)!;
  assert.equal(s2.ui.pick(p2.options.findIndex((x) => x.correct), p2.windowMs - 1)?.result, "correct");
});

test("két gyors koppintás (ugyanarra vagy két különbözőre): csak az első számít", () => {
  const s = setup();
  const correct = openFirst(s);
  assert.ok(s.ui.pick(correct, 100));
  assert.equal(s.ui.pick(correct, 101), null);
  assert.equal(s.ui.pick((correct + 1) % 4, 102), null);
  assert.equal(s.outcomes.length, 1);
  assert.equal(s.outcomes[0]!.result, "correct");
});

test("review #446/1: kijelzés alatt beérkező kérés NEM vágja el a megoldást; függőben vár, a kijelzés végén indul", () => {
  for (const reason of ["trigger", "boss", "rescue"] as const) {
    const s = setup();
    const correct = openFirst(s);
    s.ui.pick((correct + 1) % 4, 2000);
    assert.equal(s.ui.request(reason, 2100), null, `${reason}: kijelzés közben nem nyit`);
    assert.equal(s.ui.view().pending, reason);
    // A kijelzés teljes ideje alatt a helyes megoldás látszik, új kérdés nincs.
    const t = runUntil(s, 2100, 2000 + REVEAL_WRONG_MS - 1, () => s.ui.view().reveal === null, { tick: false });
    assert.ok(Number.isNaN(t), `${reason}: a kijelzés ${REVEAL_WRONG_MS} ms előtt nem ért véget`);
    assert.equal(s.ui.view().presentation?.id, 1);
    s.ui.frame(2000 + REVEAL_WRONG_MS, { tick: false });
    assert.equal(s.ui.view().presentation?.id, 2, `${reason}: a függő kérés a kijelzés végén indul`);
    assert.equal(s.ui.view().reveal, null);
    assert.equal(s.ui.view().pending, null);
  }
});

test("review #446/1: több függő kérésből a legsürgősebb marad (rescue > boss > trigger), egy indul", () => {
  const s = setup();
  const correct = openFirst(s);
  s.ui.pick((correct + 1) % 4, 2000);
  s.ui.request("boss", 2100);
  s.ui.request("trigger", 2200);
  assert.equal(s.ui.view().pending, "boss");
  s.ui.request("rescue", 2300);
  assert.equal(s.ui.view().pending, "rescue");
  s.ui.frame(2000 + REVEAL_WRONG_MS, { tick: false });
  assert.equal(s.ui.view().presentation?.reason, "rescue");
});

test("review #446/1: kijelzés alatt az ütemezett kérdés sem jelenik meg (valódi időléptetés)", () => {
  const s = setup();
  // Első ütemezett kérdés a bemelegítés után; hagyjuk lejárni; a kijelzés alatt a következő már esedékes lehet.
  const first = runUntil(s, 0, 20_000, () => s.ui.view().presentation !== null, { calm: true });
  assert.ok(first >= 1000);
  const p1 = s.ui.view().presentation!;
  const revealAt = runUntil(s, first + STEP, 20_000, () => s.ui.view().reveal !== null, { calm: true });
  const revealFrom = revealAt;
  const end = runUntil(s, revealAt + STEP, 30_000, () => s.ui.view().presentation?.id !== p1.id, { calm: true });
  assert.ok(end - revealFrom >= 1800, `a következő kérdés ${Math.round(end - revealFrom)} ms kijelzés után jött`);
});

test("review #446/2: lejárat → kijelzés → az esedékes következő kérdés mellett a „Miért?” még 4 mp-ig él és működik", () => {
  const s = setup();
  const t1 = runUntil(s, 0, 20_000, () => s.ui.view().presentation !== null, { calm: true });
  const p1 = s.ui.view().presentation!;
  const tReveal = runUntil(s, t1 + STEP, 20_000, () => s.ui.view().reveal !== null, { calm: true });
  assert.equal(s.outcomes.at(-1)?.result, "timeout");
  const whyUntil = tReveal + REVEAL_WRONG_MS + WHY_LINGER_MS;
  const t2 = runUntil(s, tReveal + STEP, 30_000, () => {
    const v = s.ui.view();
    return v.presentation !== null && v.presentation.id !== p1.id;
  }, { calm: true });
  assert.ok(t2 < whyUntil, `a következő kérdés (${Math.round(t2)}) a „Miért?” ablakán belül jött — a teszt ezt az esetet méri`);
  let v = s.ui.view();
  assert.equal(v.reveal, null, "az új kérdés nyitott");
  assert.equal(v.whyVisible, true, "az új kérdés megjelenése nem tünteti el az előző „Miért?”-jét");
  assert.equal(v.whyFor, "previous");
  assert.equal(v.whyItem?.presentationId, p1.id);
  assert.equal(v.whyItem?.quiz.prompt, p1.question.quiz.prompt);
  assert.equal(v.whyItem?.pickedOriginalIndex, null);
  // „Miért?” megnyitva: a lap szünetet tart → a kérdés-óra áll → az új kérdés ablaka nem fogy.
  const remainingAtOpen = v.remainingMs;
  for (let k = 0; k < 120; k++) s.ui.frame(t2, { calm: true }); // 2 mp szünet: ugyanaz az óra
  v = s.ui.view();
  assert.equal(v.remainingMs, remainingAtOpen);
  assert.equal(v.whyVisible, true);
  // Bezárás után az óra megy tovább; a „Miért?” a határidejéig él, utána eltűnik.
  s.ui.frame(Math.min(whyUntil - 1, t2 + 100), { calm: true });
  assert.equal(s.ui.view().whyVisible, true);
  s.ui.frame(whyUntil, { calm: true });
  assert.equal(s.ui.view().whyVisible, false);
});

test("szünet a kijelzés alatt: a kérdés-óra áll, a kijelzés nem fogy el", () => {
  const s = setup();
  const correct = openFirst(s);
  s.ui.pick((correct + 1) % 4, 1000);
  for (let k = 0; k < 600; k++) s.ui.frame(1500, { calm: true }); // 10 mp szünet
  assert.notEqual(s.ui.view().reveal, null);
  assert.equal(s.ui.view().presentation?.id, 1);
});

test("kilépés / újraindítás függő kéréssel: a függő kérés és a kijelzés törlődik, nem indul utólag kérdés", () => {
  const s = setup();
  const correct = openFirst(s);
  s.ui.pick((correct + 1) % 4, 1000);
  s.ui.request("boss", 1100);
  s.ui.abort();
  assert.equal(s.ui.view().pending, null);
  assert.equal(s.ui.view().reveal, null);
  s.ui.frame(1000 + REVEAL_WRONG_MS + 10, { tick: false });
  assert.equal(s.ui.view().presentation, null);
  // reset ugyanígy, és a „Miért?” is törlődik.
  const s2 = setup();
  const c2 = openFirst(s2);
  s2.ui.pick((c2 + 1) % 4, 1000);
  s2.ui.request("trigger", 1100);
  s2.ui.reset();
  s2.ui.frame(1000 + REVEAL_WRONG_MS + 10, { tick: false });
  assert.equal(s2.ui.view().presentation, null);
  assert.equal(s2.ui.view().whyVisible, false);
});

test("nyitott kérdés megszakítása (kuponlejárat): aborted, nincs kijelzés, nincs „Miért?”", () => {
  const s = setup();
  openFirst(s);
  const o = s.ui.abort();
  assert.equal(o?.result, "aborted");
  assert.equal(s.ui.view().presentation, null);
  assert.equal(s.ui.view().whyVisible, false);
});

test("unmount (dispose) után nincs állapotírás és visszahívás; attach visszakapcsol", () => {
  const s = setup();
  openFirst(s);
  const n = s.views.length;
  s.ui.dispose();
  s.ui.frame(10_000, { calm: true });
  assert.equal(s.ui.pick(0, 100), null);
  assert.equal(s.ui.request("trigger", 20_000), null);
  assert.equal(s.views.length, n);
  assert.equal(s.outcomes.length, 0);
  s.ui.attach();
  s.ui.frame(10_000, { tick: false });
  assert.ok(s.views.length > n);
});

test("a hátralévő idő React-frissítése ≈ 10 Hz (nem képkockánként)", () => {
  const s = setup();
  s.ui.request("trigger", 0);
  const before = s.views.length;
  for (let t = 0; t <= 1000; t += STEP) s.ui.frame(t, { tick: false });
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

test("a sim-mag saját válasza (a director közvetlen hívása) után a sáv elengedi a kérdést; canAsk jelzi a szabad állapotot", () => {
  const s = setup();
  assert.equal(s.ui.canAsk(), true);
  const p = s.ui.request("trigger", 0)!;
  assert.equal(s.ui.canAsk(), false);
  s.director.answer(p.id, 0, 200);
  s.ui.frame(250, { tick: false });
  assert.equal(s.ui.view().presentation, null);
  assert.equal(s.ui.canAsk(), true);
});

test("review #446: hold — a kijelzés lejár, de sem függő, sem ütemezett kérdés nem indul (menet vége)", () => {
  const s = setup();
  const correct = openFirst(s);
  s.ui.pick((correct + 1) % 4, 2000);
  s.ui.request("trigger", 2100); // függő kérés
  // A kijelzés végére az ütemezett kérdés is esedékes; hold mellett egyik sem indul.
  runUntil(s, 2100, 20_000, () => false, { calm: true, hold: true });
  assert.equal(s.ui.view().presentation, null);
  assert.equal(s.ui.canAsk(), true, "a lap ekkor zárhatja a menetet");
  // hold nélkül a függő kérés indul.
  s.ui.frame(20_100, { calm: true });
  assert.notEqual(s.ui.view().presentation, null);
});

test("review #446 menetvég: az utolsó válasz hibás + a következő kérdés már esedékes → nem indul új kérdés, a kijelzés kifut, a menet lezárul", () => {
  const s = setup();
  // Valódi időléptetés: az első ütemezett kérdés lejár (hibás kimenet), a kijelzés alatt a menet véget ér.
  const t1 = runUntil(s, 0, 20_000, () => s.ui.view().presentation !== null, { calm: true });
  const tRev = runUntil(s, t1 + STEP, 20_000, () => s.ui.view().reveal !== null, { calm: true });
  assert.equal(s.outcomes.at(-1)?.result, "timeout");
  s.ui.finish();
  assert.equal(s.ui.finished(), true);
  assert.equal(s.ui.settled(), false, "a kijelzés még fut");
  const tSettled = runUntil(s, tRev + STEP, 40_000, () => s.ui.settled(), { calm: true });
  assert.ok(tSettled - tRev >= 1800, `a kijelzés ${Math.round(tSettled - tRev)} ms-ig futott ki`);
  // Később sem indul semmi, akkor sem, ha a director szerint régen esedékes (maxGap) lenne.
  runUntil(s, tSettled, 60_000, () => s.ui.view().presentation !== null, { calm: true });
  assert.equal(s.ui.view().presentation, null);
  assert.equal(s.director.active(), null);
  assert.equal(s.ui.request("rescue", 60_000), null);
  // A „Gyakorold még” forrása megmarad.
  assert.equal(s.director.wrongList().length, 1);
});

test("review #446 menetvég várakozó kéréssel: a függő kérés eldobódik", () => {
  const s = setup();
  const c = openFirst(s);
  s.ui.pick((c + 1) % 4, 1000);
  s.ui.request("boss", 1100);
  s.ui.finish();
  assert.equal(s.ui.view().pending, null);
  runUntil(s, 1100, 20_000, () => s.ui.view().presentation?.id === 2, { calm: true });
  assert.notEqual(s.ui.view().presentation?.id, 2);
  assert.equal(s.ui.settled(), true);
});

test("review #446 menetvég aktív kérdés közben: „aborted”, nem hiba, nincs ismétlés, nincs „Gyakorold még”-tétel", () => {
  let n = 0;
  const provider: QuestionProvider = {
    couponOnly: false, material: () => null, restore: () => null,
    fresh: () => bankPlayQuestion("speed-quiz-math", { id: `f${++n}`, prompt: "?", options: ["a", "b", "c", "d"], correctIndex: 0 }),
  };
  const review = createReviewQueue(null);
  const director = createQuestionDirector({ config: CONFIG, provider, review, rng: createRng(3), startBand: 0.5, now: () => 0 });
  const outs: QuestionOutcome[] = [];
  const ui = createQuestionUi({ director: () => director, onView: () => {}, onOutcome: (o) => outs.push(o) });
  ui.request("trigger", 0);
  const o = ui.finish();
  assert.equal(o?.result, "aborted");
  assert.equal(outs.length, 1);
  assert.equal(review.size(), 0, "nem került az ismétlési sorba");
  assert.equal(director.wrongList().length, 0);
  assert.equal(director.stats(100).wrong, 0);
  assert.equal(ui.settled(), true);
  assert.equal(ui.view().whyVisible, false);
});

test("review #446 menetvég: kétszeri lezárás hatástalan; reset új menetet nyit; unmount (dispose) is lezár", () => {
  const s = setup();
  openFirst(s);
  assert.equal(s.ui.finish()?.result, "aborted");
  assert.equal(s.ui.finish(), null);
  assert.equal(s.outcomes.length, 1);
  s.ui.reset();
  assert.equal(s.ui.finished(), false);
  assert.ok(s.ui.request("trigger", 50_000));
  // unmount: a director nem marad nyitott kérdéssel, visszahívás nincs
  const before = s.outcomes.length;
  s.ui.dispose();
  assert.equal(s.director.active(), null);
  assert.equal(s.outcomes.length, before);
});
