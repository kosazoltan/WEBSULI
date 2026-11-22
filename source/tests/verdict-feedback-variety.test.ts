import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { VerdictFeedback } from "../client/src/lesson-runtime/VerdictFeedback";
import { FeedbackVarietyContext } from "../client/src/lesson-runtime/feedback-variety";
import { LESSON_VARIETY_VERSION, feedbackOpener, feedbackOpenerKey } from "../shared/lesson-feedback-openers";

// A `tsconfig.json` `jsx: "preserve"`: a tsx-betöltő klasszikus `React.createElement` alakra fordít — a komponensnek globális `React` kell.
(globalThis as { React?: typeof React }).React = React;

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a; V5): jelöletlen lecke → a korábbi DOM bájtra; jelölt lecke → ítélet,
// kódnyitás, a régi bátorító előtag nélküli indoklás.

const question = { text: "Mennyi 3 + 4 · 2?", options: ["14", "11", "10"] };
const html = (el: React.ReactElement, variety?: React.ContextType<typeof FeedbackVarietyContext>) =>
  renderToStaticMarkup(variety === undefined ? el : React.createElement(FeedbackVarietyContext.Provider, { value: variety }, el));

test("jelöletlen lecke: a kimenet a korábbi (ítélet + ítélet-előtag nélküli indoklás), kérdéssel és anélkül is", () => {
  const before = '<p class="lesson-feedback" data-state="wrong"><strong class="lesson-verdict">Még nem helyes.</strong> Jó próba, de előbb szorzunk.</p>';
  assert.equal(html(React.createElement(VerdictFeedback, { right: false, text: "Jó próba, de előbb szorzunk." })), before);
  assert.equal(html(React.createElement(VerdictFeedback, { right: false, text: "Jó próba, de előbb szorzunk.", question })), before);
  assert.equal(html(React.createElement(VerdictFeedback, { right: false, text: "Jó próba, de előbb szorzunk.", question }), null), before);
  assert.equal(
    html(React.createElement(VerdictFeedback, { right: true, text: "Igen.", testId: "check-feedback" })),
    '<p class="lesson-feedback" data-state="right" data-testid="check-feedback"><strong class="lesson-verdict">Helyes!</strong></p>',
  );
});

// Dokumentált spec-változás (tulajdonosi döntés 2026-11-22, „NINCS LEVÁGÁS”): jelölt leckén a modell szövege bájtra változatlan.
test("jelölt lecke: ítélet, kérdésenkénti kódnyitás a nyitás nélküli modellszöveg elé, a szöveg bájtra változatlan; kérdés nélkül a régi kimenet", () => {
  const variety = { marker: { version: LESSON_VARIETY_VERSION }, band: "kid" as const, mapId: "map-1" };
  const opener = feedbackOpener("wrong", "kid", feedbackOpenerKey("map-1", question.text, question.options));
  const out = html(React.createElement(VerdictFeedback, { right: false, text: "index - 1 adja az előző elem indexét.", question }), variety);
  assert.equal(out, `<p class="lesson-feedback" data-state="wrong"><strong class="lesson-verdict">Még nem helyes.</strong> <span class="lesson-verdict-opener" data-testid="verdict-opener">${opener}</span> index - 1 adja az előző elem indexét.</p>`);
  // Nyitással kezdődő modellszöveg: nincs kódnyitás, nincs csere.
  const kept = html(React.createElement(VerdictFeedback, { right: false, text: "Jó próba, de előbb szorzunk, ezért 11.", question }), variety);
  assert.equal(kept, '<p class="lesson-feedback" data-state="wrong"><strong class="lesson-verdict">Még nem helyes.</strong> Jó próba, de előbb szorzunk, ezért 11.</p>');
  // Másik kérdés → (általában) másik nyitás; a kulcs a kérdéstől függ.
  const openers = new Set(Array.from({ length: 30 }, (_, i) => feedbackOpener("wrong", "kid", feedbackOpenerKey("map-1", `${i}. kérdés`, ["a", "b"]))));
  assert.ok(openers.size >= 10, `30 kérdésen csak ${openers.size} különböző nyitás`);
  // Kérdés nélkül (pl. mentett gyakorlókör) a régi kimenet.
  assert.doesNotMatch(html(React.createElement(VerdictFeedback, { right: false, text: "Jó próba, de előbb szorzunk." }), variety), /verdict-opener/u);
});
