import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ANIMATE_REGISTRY } from "../client/src/lesson-runtime/blocks/animate-blocks";
import { ANIM_KINDS, SOURCE_VISUAL_ANIM_KINDS, legacyAnimKindSchema, lessonSchema, modelBlockSchema } from "../shared/lesson-schema";
import { SOURCE_VISUAL_SCHEMA_KINDS, renderedVisualTexts, sourceVisualProblems, visualParamProblems } from "../shared/lesson-visual-params";
import { ANIM_LABELS } from "../shared/lesson-block-label";
import { sourceCoverageGate } from "../server/studio/gates/source-coverage-gate";
import type { SourceVisual } from "../shared/source-visuals";

// Spec docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md (V29–V32): döntési fa és képes kártyák.

(globalThis as { React?: typeof React }).React = React;
const SVG = (word: string) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="45" r="30" fill="#d33"/><text x="50" y="95">${word}</text></svg>`;
const leaf = (text: string) => ({ text });
const tree = { root: { text: "Megszámlálható a főnév?", branches: [{ label: "Igen", node: leaf("How many?") }, { label: "Nem", node: leaf("How much?") }] } };
const cards = { cards: [{ label: "alma", svg: SVG("alma"), caption: "an apple", example: "How many apples?" }, { label: "víz", svg: SVG("víz") }] };

test("V29: a két új fajta a sémában és a szigorú paraméter-sémában; határok", () => {
  for (const k of ["decisionTree", "pictureCards"] as const) {
    assert.ok((ANIM_KINDS as readonly string[]).includes(k));
    assert.ok((SOURCE_VISUAL_ANIM_KINDS as readonly string[]).includes(k));
    assert.ok((SOURCE_VISUAL_SCHEMA_KINDS as readonly string[]).includes(k));
    assert.ok(ANIM_LABELS[k]);
    assert.ok(ANIMATE_REGISTRY[k]);
  }
  assert.deepEqual(visualParamProblems("decisionTree", tree), []);
  assert.deepEqual(visualParamProblems("pictureCards", cards), []);
  const deep = { root: { text: "1", branches: [{ label: "a", node: { text: "2", branches: [{ label: "b", node: { text: "3", branches: [{ label: "c", node: { text: "4", branches: [{ label: "d", node: leaf("5") }, { label: "e", node: leaf("6") }] } }, { label: "f", node: leaf("7") }] } }, { label: "g", node: leaf("8") }] } }, { label: "h", node: leaf("9") }] } };
  assert.notDeepEqual(visualParamProblems("decisionTree", deep), [], "4 szint");
  assert.notDeepEqual(visualParamProblems("decisionTree", { root: { text: "x", branches: [{ label: "egy", node: leaf("y") }] } }), [], "1 ág");
  // 1 + 4 + 8 = 13 csomópont: a határ; egy további levéllel 14 → elutasítva.
  const big = (leavesOfFirst: number) => ({ root: { text: "r", branches: [1, 2, 3, 4].map((i) => ({ label: `${i}`, node: { text: `n${i}`,
    branches: Array.from({ length: i === 1 ? leavesOfFirst : 2 }, (_, k) => ({ label: `${k}`, node: leaf(`${i}-${k}`) })) } })) } });
  assert.deepEqual(visualParamProblems("decisionTree", big(2)), [], "13 csomópont rendben");
  assert.notDeepEqual(visualParamProblems("decisionTree", big(3)), [], "14 csomópont");
  assert.notDeepEqual(visualParamProblems("pictureCards", { cards: Array.from({ length: 9 }, (_, i) => ({ label: `k${i}`, svg: SVG(`k${i}`) })) }), [], "9 kártya");
  assert.notDeepEqual(visualParamProblems("pictureCards", { cards: [cards.cards[0]] }), [], "1 kártya");
  assert.notDeepEqual(visualParamProblems("pictureCards", { cards: [{ label: "x", svg: "nem svg" }, cards.cards[1]] }), [], "hibás svg");
  // A szkriptes / eseménykezelős SVG ártalmatlan: vagy elutasított, vagy a tisztító után nincs benne végrehajtható rész.
  const hostile = { cards: [{ label: "x", svg: SVG("x").replace("<circle", '<script>window.__p=1</script><circle onclick="window.__p=1"') }, cards.cards[1]] };
  const html = renderToStaticMarkup(React.createElement(ANIMATE_REGISTRY.pictureCards, { params: hostile, caption: "" }));
  assert.doesNotMatch(html, /<script|onclick|__p=1/u);
  // Hibás paraméterű blokk nem rajzol (és a szerzői kimenetből kimarad).
  assert.notEqual(sourceVisualProblems({ kind: "animate", animKind: "decisionTree", params: { root: "x" } }), null);
});

test("V29: a kirajzolt szöveg (lektor-nézet, címke-őr) a csomópontok, ágfeliratok és kártyaszövegek", () => {
  assert.deepEqual(renderedVisualTexts("decisionTree", tree), ["Megszámlálható a főnév?", "Igen", "How many?", "Nem", "How much?"]);
  assert.deepEqual(renderedVisualTexts("pictureCards", cards), ["alma", "an apple", "How many apples?", "alma", "víz", "víz"]);
});

test("V30: KI kapcsolónál a modell-séma a két új fajtát elutasítja; BE elfogadja; a tárolt lecke mindig olvasható", () => {
  assert.equal(legacyAnimKindSchema.safeParse("decisionTree").success, false);
  assert.equal(legacyAnimKindSchema.safeParse("pictureCards").success, false);
  const block = { kind: "animate", animKind: "decisionTree", params: tree, caption: "Döntés", coversConceptIds: ["c1"] };
  assert.equal(modelBlockSchema(false).safeParse(block).success, false);
  assert.equal(modelBlockSchema(true).safeParse(block).success, true);
  assert.ok(lessonSchema.shape.sections);
});

test("V31: a fedettségi kapu a forrás döntési fáját és képes kártyáit a blokk mellett „megjelent”-nek méri", () => {
  const visuals = [
    { id: "v1", kind: "decisionTree", sourceFile: "f.pdf", page: 1, role: "döntés", conceptIds: ["c1"], data: tree, verified: "visual-only" },
    { id: "v2", kind: "pictureCard", sourceFile: "f.pdf", page: 2, role: "szókártyák", conceptIds: ["c1"], data: { cards: [{ label: "alma", depicts: "egy piros alma" }, { label: "víz", depicts: "egy pohár víz" }] }, verified: "visual-only" },
  ] as unknown as SourceVisual[];
  const lesson = { sections: [{ blocks: [
    { kind: "explain", text: "x", depth: "core", readAloud: false, coversConceptIds: ["c1"] },
    { kind: "animate", animKind: "decisionTree", params: tree, caption: "Döntés", coversConceptIds: ["c1"], sourceVisualId: "v1" },
    { kind: "animate", animKind: "pictureCards", params: cards, caption: "Szókártyák", coversConceptIds: ["c1"], sourceVisualId: "v2" },
  ] }] };
  const result = sourceCoverageGate(lesson, visuals);
  const state = Object.fromEntries(result.items.map((i) => [i.id, i.state]));
  assert.deepEqual(state, { v1: "shown", v2: "shown" });
});

test("V32: a fa egymásba ágyazott lista — a két levél ugyanannak a szülőnek két gyereke; a kártyán a rajz role=img", () => {
  const html = renderToStaticMarkup(React.createElement(ANIMATE_REGISTRY.decisionTree, { params: tree, caption: "Melyik kérdőszó?" }));
  assert.match(html, /data-anim="decisionTree"/u);
  assert.match(html, /<ul class="sv-tree-children">\s*<li[^>]*>[\s\S]*How many\?[\s\S]*<\/li>\s*<li[^>]*>[\s\S]*How much\?/u);
  assert.match(html, /sv-tree-branch">Igen/u);
  const c = renderToStaticMarkup(React.createElement(ANIMATE_REGISTRY.pictureCards, { params: cards, caption: "" }));
  assert.match(c, /role="img" aria-label="alma"/u);
  assert.match(c, /How many apples\?/u);
});
