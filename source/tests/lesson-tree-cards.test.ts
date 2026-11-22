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

// ---- Vak kör 1 (2026-11-22) leletei: L1 elrendezés, L2 SVG-azonosítók, L5 mélységi határ ----

test("vak kör 1 L2: a kártyák SVG-azonosítói rajzonként névterezve — azonos helyi azonosító nem ütközik, a belső hivatkozások követik", async () => {
  const { sanitizeIllustration } = await import("../shared/illustration-svg");
  // A valódi tisztítón át (vak kör 2: a névterezés a tisztító DOM-ján fut, csak attribútumokon).
  const drawing = (fill: string, label: string, extra = "") => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint0"><stop offset="0" stop-color="#0a0"/></linearGradient><clipPath id="c"><rect width="50" height="50"/></clipPath></defs><rect fill="${fill}" clip-path="url(#c)" width="100" height="80"/>${extra}<text x="50" y="95">${label}</text></svg>`;
  const out = (raw: string, idPrefix?: string) => { const r = sanitizeIllustration(raw, idPrefix ? { idPrefix } : {}); assert.ok(r.ok, JSON.stringify(r)); return r.svg; };
  const a = out(drawing("url(#paint0)", "zöld"), "k1");
  assert.ok(a.includes('id="k1-paint0"') && a.includes('fill="url(#k1-paint0)"') && a.includes('clip-path="url(#k1-c)"') && a.includes('id="k1-c"'), a);
  assert.ok(out(drawing("url(#paint0)", "zöld"), "k2").includes('id="k2-paint0"'));
  // Vak kör 2 L2: a tisztító által megengedett, szóközös hivatkozás is követi a definíciót.
  const spaced = out(drawing("url( #paint0 )", "zöld"), "k3");
  assert.ok(spaced.includes('id="k3-paint0"') && spaced.includes('fill="url(#k3-paint0)"'), spaced);
  assert.equal(spaced.includes("#paint0"), false, "nem marad névtér nélküli hivatkozás");
  // Vak kör 2 L6: a rajz FELIRATA (szövegtartalom) érintetlen, akkor is, ha hivatkozásnak látszik.
  const labelled = out(drawing("url(#paint0)", "fill=url(#paint0) id=&quot;paint0&quot;"), "k4");
  assert.ok(labelled.includes('>fill=url(#paint0) id="paint0"</text>'), labelled);
  // Nem definiált hivatkozás és névterezés nélküli hívás: változatlan.
  assert.ok(out(drawing("url(#nincs)", "zöld"), "k5").includes('fill="url(#nincs)"'));
  const plain = out(drawing("url(#paint0)", "zöld"));
  assert.ok(plain.includes('id="paint0"') && plain.includes('fill="url(#paint0)"'), "előtag nélkül a kimenet a régi");
  assert.ok(a.includes('id="websuli-paper"'), "a papír-háttér azonosítója (az újratisztítás kulcsa) változatlan");
  assert.ok(sanitizeIllustration(a).ok, "a névterezett rajz újratisztítható");
  const { PictureCardsAnim } = await import("../client/src/lesson-runtime/blocks/tree-cards");
  // A DOM-próba rajza a tisztító szabályai szerint feliratos (a tisztító felirat nélküli rajzot nem enged át).
  const art = (color: string, word: string) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint0"><stop offset="0" stop-color="${color}"/></linearGradient></defs><rect fill="url(#paint0)" width="100" height="80"/><text x="50" y="95">${word}</text></svg>`;
  const html = renderToStaticMarkup(React.createElement(PictureCardsAnim, { params: { cards: [{ label: "piros", svg: art("#f00", "piros") }, { label: "kék", svg: art("#00f", "kék") }] }, caption: "" }));
  assert.equal(html.split("-paint0)").length - 1, 2, "mindkét rajz megjelent, a kitöltés névterezett azonosítóra hivatkozik");
  assert.equal(html.includes("url(#paint0)"), false, "a DOM-ban nincs névtér nélküli hivatkozás");
  const ids = [...html.matchAll(/id="([^"]+paint0)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2, html.slice(0, 300));
  assert.notEqual(ids[0], ids[1], "a két kártya színátmenete külön azonosítót kap a DOM-ban");
});

test("vak kör 1 L1: vízszintes elágazás csak kis fánál (egy szint, legfeljebb 4 ág); különben behúzott lista minden szélességen", async () => {
  const { decisionTreeLayout } = await import("../shared/source-visual-render");
  assert.equal(decisionTreeLayout(tree.root), "wide");
  const four = { text: "r", branches: [1, 2, 3, 4].map((i) => ({ label: `${i}`, node: leaf(`l${i}`) })) };
  assert.equal(decisionTreeLayout(four), "wide");
  const nested = { text: "r", branches: [{ label: "a", node: { text: "n", branches: [{ label: "x", node: leaf("1") }, { label: "y", node: leaf("2") }] } }, { label: "b", node: leaf("3") }] };
  assert.equal(decisionTreeLayout(nested), "list", "beágyazott elágazás → lista");
  const five = { text: "r", branches: [1, 2, 3, 4, 5].map((i) => ({ label: `${i}`, node: leaf(`l${i}`) })) };
  assert.equal(decisionTreeLayout(five), "list", "5 ág → lista");
  const { DecisionTreeAnim } = await import("../client/src/lesson-runtime/blocks/tree-cards");
  assert.match(renderToStaticMarkup(React.createElement(DecisionTreeAnim, { params: tree, caption: "" })), /class="sv-tree sv-tree--wide"/);
  assert.match(renderToStaticMarkup(React.createElement(DecisionTreeAnim, { params: { root: nested }, caption: "" })), /class="sv-tree sv-tree--list"/);
});

test("vak kör 1 L5: a mélységi határ pontosan mérve — 3 szint elfogadva, 4 szint elutasítva (13 csomópont alatt is)", () => {
  type Node = { text: string; branches?: Array<{ label: string; node: Node }> };
  const chain = (depth: number): Node =>
    (depth <= 1 ? leaf("levél") : { text: `szint ${depth}`, branches: [{ label: "a", node: chain(depth - 1) }, { label: "b", node: leaf("más") }] });
  assert.deepEqual(visualParamProblems("decisionTree", { root: chain(3) }), [], "pontosan 3 szint");
  assert.notDeepEqual(visualParamProblems("decisionTree", { root: chain(4) }), [], "pontosan 4 szint (7 csomópont)");
});

test("review #533 (Codex, Vercel): a képes kártya rajzának felirata nem lóghat ki a rajzterületről — a gyártási kapu visszaküldi; a megjelenítés nem változik", () => {
  const art = (x: number, anchor: string) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="40" r="25" fill="#d33"/><text x="${x}" y="95" text-anchor="${anchor}">alma</text></svg>`;
  const ok = { cards: [{ label: "egy", svg: art(50, "middle") }, { label: "kettő", svg: art(50, "middle") }] };
  const overflow = { cards: [{ label: "egy", svg: art(50, "middle") }, { label: "kettő", svg: art(95, "start") }] };
  assert.deepEqual(visualParamProblems("pictureCards", ok), []);
  const problems = visualParamProblems("pictureCards", overflow);
  assert.equal(problems.length > 0, true, "a kilógó felirat a gyártási kapun bukik");
  assert.ok(problems.every((p) => p.startsWith("pictureCards.cards.1.svg: ")), JSON.stringify(problems));
  // A megjelenítő sémája (tárolt lecke olvasása) változatlan: a már tárolt kártya megjelenik.
  assert.equal(SOURCE_VISUAL_SCHEMA_KINDS.includes("pictureCards"), true);
});
