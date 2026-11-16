import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// A `tsconfig.json` `jsx: "preserve"` (a Vite végzi az átalakítást); a tsx-betöltő így a klasszikus `React.createElement`
// alakra fordít a .tsx komponensekben — a node-os tesztben a `React` globálisként kell nekik.
(globalThis as { React?: typeof React }).React = React;

import { fmt1, hpView, praiseFor, timerRatio, verdictTitle } from "../client/src/components/duel/format";
import { DamagePop, PlayerHud } from "../client/src/components/duel/PlayerHud";
import { QuestionCard, optionStateFor } from "../client/src/components/duel/QuestionCard";
import { ResultCard } from "../client/src/components/duel/ResultCard";
import { VerdictBanner } from "../client/src/components/duel/VerdictBanner";

/**
 * JM1r — a párbaj kiemelt megjelenítő komponensei (az egyeszközös aréna részei, egy játékos nézőpontjára):
 * tiszta segédek + statikus renderelés (react-dom/server). A böngészős mérés (illesztés, érintés) a JM3a e2e-jében.
 */

test("életerő-sáv: kitöltés és szín (> 50% zöld, > 25% sárga, alatta narancs), vágás 0..100", () => {
  assert.deepEqual(hpView(100, 100), { pct: 100, tone: "ok" });
  assert.deepEqual(hpView(50, 100), { pct: 50, tone: "mid" });
  assert.deepEqual(hpView(25, 100), { pct: 25, tone: "low" });
  assert.deepEqual(hpView(-5, 100), { pct: 0, tone: "low" });
  assert.deepEqual(hpView(130, 100), { pct: 100, tone: "ok" });
  assert.equal(hpView(10, 0).pct, 0);
});

test("időjelző aránya: hátralévő / ablak, [0,1]; érvénytelen bemenet → 0", () => {
  assert.equal(timerRatio(10_000, 7_000, 6_000), 0.5);
  assert.equal(timerRatio(10_000, 12_000, 6_000), 0);
  assert.equal(timerRatio(10_000, 0, 6_000), 1);
  assert.equal(timerRatio(10_000, 7_000, 0), 0);
  assert.equal(timerRatio(Number.NaN, 7_000, 6_000), 0);
});

test("ítélet-szöveg: helyes (+bónusz), majdnem, lejárt — bátorító, a helyes választ megnevezi", () => {
  assert.equal(verdictTitle("correct", { correctText: "x" }), "Helyes! ⚡ 10 csapás");
  assert.equal(verdictTitle("correct", { correctText: "x", bonus: 2.5 }), `Helyes! ⚡ ${fmt1(12.5)} csapás (gyorsasági bónusz +${fmt1(2.5)})`);
  assert.equal(verdictTitle("wrong", { correctText: "Budapest" }), "Majdnem! A helyes: Budapest");
  assert.equal(verdictTitle("timeout", { correctText: "Budapest" }), "Lejárt az idő. A helyes: Budapest");
});

test("dicséret: győztes / közös győzelem / a vesztes is elismerést kap", () => {
  assert.equal(praiseFor({ won: true, coWin: false, correct: 5 }), "Gratulálunk, győztél!");
  assert.match(praiseFor({ won: true, coWin: true, correct: 5 }), /közös győzelem/);
  assert.equal(praiseFor({ won: false, coWin: false, correct: 3 }), "Szép munka: 3 helyes válasz! Visszavágó?");
  assert.match(praiseFor({ won: false, coWin: false, correct: 0 }), /Jó próbálkozás/);
});

test("válaszgomb-állapot: felfedéskor csak a helyes és a választott látszik; nyitott körben a választott kiemelve", () => {
  assert.equal(optionStateFor(1, "open", null, null), "idle");
  assert.equal(optionStateFor(1, "locked", 1, null), "chosen");
  assert.equal(optionStateFor(2, "reveal", 1, 2), "correct");
  assert.equal(optionStateFor(1, "reveal", 1, 2), "wrong");
  assert.equal(optionStateFor(0, "reveal", 1, 2), "dim");
  assert.equal(optionStateFor(0, "reveal", null, null), "idle", "helyes index nélkül nincs felfedés");
});

test("kérdéskártya: 2×2 válaszrács a promptval; felfedéskor a dim gomb nem renderelődik, a gombok letiltva", () => {
  const open = renderToStaticMarkup(
    createElement(QuestionCard, { roundKey: 1, prompt: "Mennyi 7 × 8?", options: ["54", "56", "64", "48"], state: "open", chosenIndex: null, correctIndex: null, onPick: () => {} }),
  );
  assert.match(open, /data-testid="duel-prompt"[^>]*>Mennyi 7 × 8\?/);
  assert.equal((open.match(/class="duel-option"/g) ?? []).length, 4);
  assert.doesNotMatch(open, /disabled/);
  const reveal = renderToStaticMarkup(
    createElement(QuestionCard, { roundKey: 1, prompt: "Mennyi 7 × 8?", options: ["54", "56", "64", "48"], state: "reveal", chosenIndex: 0, correctIndex: 1, testIdPrefix: "me" }),
  );
  assert.equal((reveal.match(/class="duel-option"/g) ?? []).length, 2);
  assert.match(reveal, /data-state="correct"[^>]*data-testid="me-option-1"/);
  assert.match(reveal, /data-state="wrong"[^>]*data-testid="me-option-0"/);
  assert.equal((reveal.match(/disabled=""/g) ?? []).length, 2);
  const locked = renderToStaticMarkup(
    createElement(QuestionCard, { roundKey: 1, prompt: "p", options: ["a", "b"], state: "locked", chosenIndex: 1, correctIndex: null, lockedText: "Rögzítve ✓ Várjuk a Gépet…" }),
  );
  assert.match(locked, /Rögzítve ✓ Várjuk a Gépet…/);
});

test("fejléc: saját sáv (név, évfolyam, sorozat, életerő-mérő) és ellenfél-chip (válaszolt-pötty, Gép-jelvény, állapot)", () => {
  const self = renderToStaticMarkup(createElement(PlayerHud, { variant: "self", name: "Bátor Róka", hp: 62.5, grade: 5, streak: 3, testId: "me" }));
  assert.match(self, /role="meter"[^>]*aria-valuenow="62.5"/);
  assert.match(self, /5\. évf\./);
  assert.match(self, /3× sorozat/);
  assert.match(self, /duel-hp-fill--ok/);
  const rival = renderToStaticMarkup(createElement(PlayerHud, { variant: "rival", name: "Gép", hp: 20, answered: true, badge: "Gép", status: "away", testId: "rv" }));
  assert.match(rival, /data-answered="true"/);
  assert.match(rival, /aria-label="Már válaszolt"/);
  assert.match(rival, /duel-hud-badge">Gép/);
  assert.match(rival, /Kapcsolódik…/);
  assert.match(rival, /duel-hp-fill--low/);
  assert.match(renderToStaticMarkup(createElement(DamagePop, { amount: 12.5, keyId: 1 })), new RegExp(`−${fmt1(12.5)}`));
  assert.match(renderToStaticMarkup(createElement(DamagePop, { amount: 4, kind: "combo", keyId: 1 })), /4× kombó!/);
});

test("ítélet-sáv és eredménykártya: magyarázat, megjegyzés, pontosság, leggyorsabb helyes; kicsi változat statisztika nélkül", () => {
  const v = renderToStaticMarkup(createElement(VerdictBanner, { kind: "wrong", correctText: "56", explanation: "7 × 8 = 56", note: "A Gép volt a gyorsabb" }));
  assert.match(v, /duel-verdict--miss/);
  assert.match(v, /7 × 8 = 56/);
  assert.match(v, /A Gép volt a gyorsabb/);
  const stats = { accuracy: 0.714, correct: 5, asked: 7, fastestMs: 1830, bestStreak: 4 };
  const card = renderToStaticMarkup(createElement(ResultCard, { name: "Bátor Róka", place: 1, won: true, coWin: false, stats, tone: "self", subtitle: "5. évfolyam", testId: "res" }));
  assert.match(card, /duel-card--win/);
  assert.match(card, /71%/);
  assert.match(card, /5\/7/);
  assert.match(card, /1,8 mp/);
  assert.match(card, /Gratulálunk, győztél!/);
  const small = renderToStaticMarkup(createElement(ResultCard, { name: "Gép", place: 2, won: false, coWin: false, stats, tone: "rival", compact: true, badge: "Gép" }));
  assert.doesNotMatch(small, /Leggyorsabb/);
  assert.match(small, /🥈/);
});
