import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ANIMATE_REGISTRY } from "../client/src/lesson-runtime/blocks/animate-blocks";
import { animateBlockIndexes } from "../shared/lesson-clip";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (17. szakasz; V33, V35–V37): a megjelenítők vak-leletei.

(globalThis as { React?: typeof React }).React = React;
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const table = (params: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ANIMATE_REGISTRY.table, { params, caption: "" }));

test("V33: a táblacím a görgő kereten KÍVÜL, látható címként; a caption képernyőolvasónak megmarad; a jelző a tábla fölött", () => {
  const html = table({ caption: "Megszámlálható vagy nem?", headers: ["a", "b", "c"], rows: [["1", "2", "3"]] });
  const title = html.indexOf('class="sv-table-title"');
  const scroller = html.indexOf('class="sv-table-scroll"');
  assert.ok(title >= 0 && scroller > title, "a cím a görgő előtt, azon kívül");
  assert.match(html, /<caption class="sr-only">Megszámlálható vagy nem\?<\/caption>/u);
  // A jelző (méréstől függő) a görgő ELŐTT áll a forrásban.
  const source = src("../client/src/lesson-runtime/blocks/source-visuals.tsx");
  const tableFn = source.slice(source.indexOf("export function TableAnim"), source.indexOf("export function RuleBoxAnim"));
  assert.ok(tableFn.indexOf("sv-scroll-hint") < tableFn.indexOf("sv-table-scroll\""), "a jelző a görgő keret előtt");
});

test("V36: rövid cellás tábla data-compact (nincs oszlopszám-alapú legkisebb szélesség); hosszúnál nincs", () => {
  assert.match(table({ headers: ["1", "2", "3"], rows: [["a", "b", "c"]] }), /data-compact="true"/u);
  assert.doesNotMatch(table({ headers: ["kérdőszó", "mikor használjuk", "példa"], rows: [["How many", "megszámlálható főnév többes számban", "How many apples?"]] }), /data-compact/u);
  const css = src("../client/src/lesson-runtime/lesson-design.css");
  assert.match(css, /\.sv-table\[data-compact\] \{[^}]*min-width: 0/u);
  assert.match(css, /@media print \{[\s\S]*\.sv-table-scroll \{[^}]*overflow: visible/u);
});

test("V35: a kisfilm nem kínál és nem rajzol forrás-ábrafajtát vagy hibás paraméterű blokkot", () => {
  const blocks = [
    { kind: "explain", text: "x", depth: "core", readAloud: false, coversConceptIds: ["c"] },
    { kind: "animate", animKind: "process", params: { steps: ["a", "b"] }, caption: "F", coversConceptIds: ["c"] },
    { kind: "animate", animKind: "table", params: { headers: ["a"], rows: [["1"]] }, caption: "T", coversConceptIds: ["c"] },
    { kind: "animate", animKind: "decisionTree", params: { root: { text: "r" } }, caption: "D", coversConceptIds: ["c"] },
    { kind: "animate", animKind: "cycle", params: { phases: [{ label: "a" }, { label: "b" }, { label: "c" }] }, caption: "K", coversConceptIds: ["c"] },
  ];
  assert.deepEqual(animateBlockIndexes({ sections: [{ heading: "H", blocks }] } as never, 0), [1, 4]);
  const overlay = src("../client/src/lesson-runtime/clips/clip2-overlays.tsx");
  assert.match(overlay, /isClipVisualBlock\(block\)/u, "a lejátszó a régi kisfilm hivatkozását is szűri");
});

test("V37: a fejléc-illesztés a fejlécek szövegének változására újramér", () => {
  const source = src("../client/src/lesson-runtime/blocks/source-visuals.tsx");
  assert.match(source, /function useHeaderFit\(scrollRef: \{ current: HTMLElement \| null \}, enabled: boolean, headerKey: string\)/u);
  assert.match(source, /\}, \[scrollRef, enabled, headerKey\]\);/u);
});

test("1. vak kör L2: ki nem rajzolható (forrás-ábrára mutató) kisfilm-hivatkozásnál a panel sem jön létre; régi ábránál és más ráúszónál megmarad", async () => {
  const { clipOverlayRenderable } = await import("../shared/lesson-clip");
  const tableBlock = { kind: "animate", animKind: "table", caption: "", params: { headers: ["A", "B"], rows: [["1", "2"]] } };
  // Review #535 (Copilot): ÉRVÉNYES régi ábra (a megjelenítő tényleg kirajzolja) — a paraméterséma is igazolja.
  const legacy = { kind: "animate", animKind: "numberLine", caption: "", params: { from: 0, to: 10, marks: [{ value: 3 }] } };
  const { parseVisualParams } = await import("../shared/lesson-visual-params");
  assert.ok(parseVisualParams("numberLine", legacy.params), "a pozitív minta érvényes számegyenes");
  const ref = { kind: "lessonVisual", blockIndex: 0 };
  assert.equal(clipOverlayRenderable(ref, [tableBlock]), false, "forrás-ábra: nincs panel");
  assert.equal(clipOverlayRenderable(ref, [{ kind: "explain", text: "x" }]), false, "nem ábra blokk: nincs panel");
  assert.equal(clipOverlayRenderable(ref, undefined), false, "hiányzó fejezet: nincs panel");
  assert.equal(clipOverlayRenderable(ref, [legacy]), true, "régi ábra: a panel megmarad");
  assert.equal(clipOverlayRenderable({ kind: "graph" }, undefined), true, "más ráúszó változatlan");
  assert.equal(clipOverlayRenderable(undefined, [legacy]), false);
  assert.match(src("../client/src/lesson-runtime/clips/Clip2Player.tsx"), /scene\.overlay && clipOverlayRenderable\(scene\.overlay, item\.section\?\.blocks\) && <div className="clip2-panel"/u, "a lejátszó panelje ezt a feltételt használja");
});
