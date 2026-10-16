import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DESIGN_THEMES, DESIGN_THEME_IDS, designThemeForClassroom, type DesignThemeId } from "../shared/lesson-design";
import { lessonFontPair } from "../shared/lesson-typography";
import { contrastRatio } from "../shared/svg-contrast";

/* Websuli Design (docs/specs/2026-10-16-websuli-design.md; forrás: docs/design/Websuli_Design_AI_Implementacios_Utasitas.md). */

const masterSpec = fs.readFileSync(path.resolve("../docs/design/Websuli_Design_AI_Implementacios_Utasitas.md"), "utf8");
const css = fs.readFileSync(path.resolve("client/src/lesson-runtime/lesson-design.css"), "utf8");

test("a sávhatárok a mesterutasítás szerint: 1–2 explorer, 3–5 adventure, 6–8 studio, 9–10 laboratory, 11–12 future; 0 → studio", () => {
  const expected: Array<[number, DesignThemeId]> = [[1, "explorer"], [2, "explorer"], [3, "adventure"], [5, "adventure"], [6, "studio"], [8, "studio"],
    [9, "laboratory"], [10, "laboratory"], [11, "future"], [12, "future"], [0, "studio"]];
  for (const [c, id] of expected) assert.equal(designThemeForClassroom(c), id, String(c));
  // A téma fontja egyezik a tananyag fontválasztásával (1–5 Nunito Sans, 0 és 6–12 Inter).
  for (let c = 0; c <= 12; c++) assert.equal(DESIGN_THEMES[designThemeForClassroom(c)].font, lessonFontPair(c).body, String(c));
});

test("a tokenek a mesterutasítás §1 táblázatának értékei (változtathatatlan alapok)", () => {
  const rows = [...masterSpec.matchAll(/^\| `(\w+)` \| ([^|]+) \| ([^|]+) \| [^|]+ \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|$/gm)];
  assert.equal(rows.length, 5, "öt téma a táblázatban");
  for (const [, id, grades, name, surface, accent, ink] of rows) {
    const t = DESIGN_THEMES[id as DesignThemeId];
    assert.ok(t, id);
    assert.deepEqual([t.grades, t.name, t.surface, t.accent, t.ink], [`${grades.trim()}.`, name.trim(), surface, accent, ink], id);
  }
});

test("a CSS ugyanazokat az értékeket adja ki, mint a TS-tokenek (egy forrás, két réteg)", () => {
  const map: Record<string, keyof typeof DESIGN_THEMES["studio"]> = { "--ws-surface": "surface", "--ws-accent": "accent", "--ws-ink": "ink", "--ws-panel": "panel", "--ws-soft": "soft",
    "--ws-deep": "deep", "--ws-muted": "muted", "--ws-line": "line", "--ws-strong": "strong", "--ws-strong-ink": "strongInk" };
  for (const id of DESIGN_THEME_IDS) {
    const at = css.indexOf(`[data-band][data-experience][data-ws-theme="${id}"] {`);
    assert.ok(at >= 0, `${id}: CSS-szabály`);
    const block = css.slice(at, css.indexOf("}", at));
    for (const [prop, key] of Object.entries(map)) {
      const m = new RegExp(`${prop}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
      assert.equal(m?.[1].toUpperCase(), String(DESIGN_THEMES[id][key]).toUpperCase(), `${id} ${prop}`);
    }
    assert.equal(new RegExp(`--grade-size:\\s*(\\d+)px`).exec(block)?.[1], String(DESIGN_THEMES[id].minBodyPx), `${id} --grade-size`);
  }
});

const secondaryOf = (id: DesignThemeId): Array<[string, string]> => {
  const blockOf = (sel: string) => { const at = css.indexOf(sel); return css.slice(at, css.indexOf("}", at)); };
  const pick = (block: string, prop: string) => new RegExp(`${prop}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)?.[1];
  const own = blockOf(`[data-band][data-experience][data-ws-theme="${id}"] {`);
  const base = blockOf("[data-band][data-experience][data-ws-theme] {");
  const bg = pick(own, "--ws-secondary-bg") ?? pick(base, "--ws-secondary-bg");
  const ink = pick(own, "--ws-secondary-ink") ?? pick(base, "--ws-secondary-ink");
  assert.ok(bg && ink, `${id}: másodlagos gomb tokenjei`);
  return [[ink!, bg!]];
};

test("minden téma minden szövegpárja ≥ 4,5:1, a grafikus főszín ≥ 3:1 (§2.6)", () => {
  const problems: string[] = [];
  for (const id of DESIGN_THEME_IDS) {
    const t = DESIGN_THEMES[id];
    const pairs: Array<[string, string, string, number]> = [
      [t.ink, t.surface, "szöveg az alapfelületen", 4.5], [t.ink, t.panel, "szöveg a csempén", 4.5], [t.ink, t.soft, "szöveg a halvány felületen", 4.5],
      [t.muted, t.panel, "halvány szöveg a csempén", 4.5], [t.muted, t.surface, "halvány szöveg az alapfelületen", 4.5],
      [t.strongInk, t.strong, "fő gomb / kiválasztott elem", 4.5], ["#FFFFFF", t.deep, "felső sáv", 4.5],
      [id === "future" ? t.ink : t.deep, t.panel, "cím a csempén", 4.5], [id === "future" ? t.ink : t.deep, t.soft, "chip", 4.5],
      [t.accent, t.panel, "főszín grafika a csempén", 3],
      // A másodlagos gomb a CSS-ből (mérve élesben: a 11–12. o. sötét témáján a régi átlátszó gomb 3,11:1 volt).
      ...secondaryOf(id).map(([fg, bg]) => [fg, bg, "másodlagos gomb", 4.5] as [string, string, string, number]),
    ];
    for (const [fg, bg, what, min] of pairs) {
      const r = contrastRatio(fg, bg);
      if (r < min) problems.push(`${id}: ${what} ${fg} / ${bg} = ${r.toFixed(2)}:1 (< ${min})`);
    }
  }
  assert.deepEqual(problems, []);
});

test("a törzsszöveg legkisebb mérete a mesterutasítás szerint (§2.5): 1–2. o. 20–24px, 3–5. o. 18–20px, egyébként ≥ 16px", () => {
  const { explorer, adventure, studio, laboratory, future } = DESIGN_THEMES;
  assert.ok(explorer.minBodyPx >= 20 && explorer.minBodyPx <= 24);
  assert.ok(adventure.minBodyPx >= 18 && adventure.minBodyPx <= 20);
  for (const t of [studio, laboratory, future]) assert.ok(t.minBodyPx >= 16, t.id);
  // A kiegészítő feliratok sem 12px alattiak a témás leckében.
  for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 13, `font-size ${m[1]}px`);
});

test("a témás lecke nem animál, és a fókusz a referencia 3px-es borostyán kerete", () => {
  assert.doesNotMatch(css, /animation\s*:/);
  assert.match(css, /:focus-visible \{\s*outline: 3px solid #F4AB37; outline-offset: 3px;/);
});
