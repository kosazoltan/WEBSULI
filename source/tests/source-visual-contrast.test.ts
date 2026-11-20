import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DESIGN_THEME_IDS } from "../shared/lesson-design";
import { contrastRatio } from "../shared/svg-contrast";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (17. szakasz; V34 — vak J5): a forrás-ábrák címkéinek és tónusjeleinek kontrasztja a
// CSS tokenjeiből számolva, mind az öt sávban és a csendes nézetben.

const css = readFileSync(new URL("../client/src/lesson-runtime/lesson-design.css", import.meta.url), "utf8");
const block = (selector: string) => { const at = css.indexOf(selector); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf("}", at)); };
const tokens = (text: string) => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const base = tokens(block("[data-band][data-experience][data-ws-theme] {"));
const quiet = tokens(block('[data-band][data-experience][data-ws-theme]:has(.fusion-view[data-quiet="true"]) {'));

/** CSS `color-mix(in srgb, a p%, b)`: csatornánkénti lineáris keverés a gamma-kódolt értékeken. */
function mix(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

const scenarios = DESIGN_THEME_IDS.flatMap((id) => {
  const own = { ...base, ...tokens(block(`[data-band][data-experience][data-ws-theme="${id}"] {`)) };
  return [{ name: id, t: own }, { name: `${id} (csendes)`, t: { ...own, ...quiet } }];
});

test("V34: a „Példa” címke a sáv gomb-párja: ≥ 4,5:1 minden sávban és a csendes nézetben", () => {
  assert.match(css, /\.sv-example-label \{[^}]*background: var\(--ws-strong\);[^}]*color: var\(--ws-strong-ink\);/u);
  for (const { name, t } of scenarios) {
    const r = contrastRatio(t["--ws-strong-ink"], t["--ws-strong"]);
    assert.ok(r >= 4.5, `${name}: ${r.toFixed(2)}`);
  }
});

test("V34: a tónusjel (és a fejléc alsó vonala) ≥ 3:1 a fejléc hátterén minden sávban és a csendes nézetben", () => {
  assert.match(css, /\.sv-tone-mark \{[^}]*color: var\(--sv-mark\)/u);
  for (const [tone, accent] of [["a", "--ws-accent"], ["b", "--ws-accent-2"], ["c", "--ws-accent-3"]] as const) {
    assert.match(css, new RegExp(`\\.sv-tone-${tone} \\{[^}]*--sv-mark: var\\(--ws-mark-${tone}, var\\(${accent}\\)\\)`, "u"));
    for (const { name, t } of scenarios) {
      const mark = t[`--ws-mark-${tone}`] ?? t[accent];
      const head = mix(t[accent], t["--ws-panel"], 0.14);
      const r = contrastRatio(mark, head);
      assert.ok(r >= 3, `${name} „${tone}” jel: ${r.toFixed(2)} (${mark} a ${head} fejlécen)`);
    }
  }
});
