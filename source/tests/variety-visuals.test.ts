import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ANIMATE_REGISTRY } from "../client/src/lesson-runtime/blocks/animate-blocks";
import { FeedbackVarietyContext } from "../client/src/lesson-runtime/feedback-variety";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (14. szakasz; V21, V22): szebb, sávtokenes ábrák.

(globalThis as { React?: typeof React }).React = React;
const marked = { marker: { version: "valtozatossag-2" }, band: "teen" as const, mapId: "m" };
const html = (kind: keyof typeof ANIMATE_REGISTRY, params: Record<string, unknown>, variety: React.ContextType<typeof FeedbackVarietyContext> = null) =>
  renderToStaticMarkup(React.createElement(FeedbackVarietyContext.Provider, { value: variety }, React.createElement(ANIMATE_REGISTRY[kind], { params, caption: "Felirat." })));
const HARD_COLOR = /#[0-9a-f]{3,8}\b|emerald|sky-|amber-|bg-muted|text-muted-foreground/iu;

test("V21: a négy fajta a sáv osztályaival rajzol, kódba írt szín nélkül; tűrő a hibás paraméterre", () => {
  const cases: Array<[keyof typeof ANIMATE_REGISTRY, Record<string, unknown>, RegExp]> = [
    ["fraction", { numerator: 3, denominator: 4 }, /vv-pie[\s\S]*vv-fill-a[\s\S]*vv-bar/u],
    ["map", { spots: [{ label: "Budapest", x: 50, y: 40 }, { label: "Szeged", x: 60, y: 80 }] }, /vv-marker[\s\S]*vv-legend[\s\S]*Szeged/u],
    ["wordBuilder", { parts: ["kert", "ész"] }, /vv-chip[\s\S]*kertész/u],
    ["sentenceParts", { parts: ["[alany] A kutya", "[állítmány] ugat"] }, /vv-role">alany[\s\S]*vv-part-text">ugat/u],
  ];
  for (const [kind, params, shape] of cases) {
    for (const variety of [null, marked]) {
      const out = html(kind, params, variety);
      assert.match(out, shape, kind);
      assert.match(out, new RegExp(`data-anim="${kind}"`, "u"));
      assert.doesNotMatch(out, HARD_COLOR, `${kind}: kódba írt szín`);
    }
  }
  // Tűrés: hibás / hiányzó paraméter nem dob.
  for (const kind of ["fraction", "map", "wordBuilder", "sentenceParts"] as const) {
    for (const params of [{}, { parts: "x", spots: 5, numerator: "a" }, { parts: [1, null], spots: [null, "x"] }]) assert.doesNotThrow(() => html(kind, params), kind);
  }
  // A szóépítés csak tiszta szórészeknél olvas össze (nem talál ki eredményt).
  assert.doesNotMatch(html("wordBuilder", { parts: ["be", "megy", "valami más"] }), /vv-chip-result/u);
  assert.match(html("fraction", { numerator: 7, denominator: 4 }), /aria-label="7\/4"/u);
});

test("V22: a folyamat és az idővonal jelölt leckén az új, jelöletlenen a régi megjelenítővel", () => {
  const steps = { steps: ["Felmelegszik", "Elpárolog", "Lecsapódik"] };
  const events = { events: ["i. e. 776: első olimpia", "1000: István koronázása"] };
  const oldProcess = html("process", steps);
  assert.doesNotMatch(oldProcess, /data-style="v2"|vv-/u);
  assert.match(oldProcess, /border rounded-md px-3 py-2 text-sm bg-muted\/40/u, "a régi DOM");
  assert.match(html("process", steps, marked), /data-style="v2"[\s\S]*vv-step-num">1[\s\S]*Lecsapódik/u);
  assert.doesNotMatch(html("timeline", events), /data-style="v2"/u);
  const v2 = html("timeline", events, marked);
  assert.match(v2, /vv-event-when">i\. e\. 776<[\s\S]*vv-event-what">első olimpia/u);
  assert.doesNotMatch(v2, HARD_COLOR);
  // Kevés lépés → nincs ábra (mint eddig).
  assert.equal(html("process", { steps: ["egy"] }, marked), "");
});
