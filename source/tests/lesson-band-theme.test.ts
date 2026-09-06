import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { AGE_BANDS } from "../shared/lesson-schema";
import { BAND_THEME, bandRegisterForPrompt } from "../shared/lesson-band";
import { buildAuthorPrompt } from "../server/studio/step-io";

/**
 * LS-9 — korosztályos vizuális rendszer (spec: docs/specs/ls-9-age-band-visual-system-2026-09-06.md).
 *
 * Mért kiindulóállapot (2026-09-06): az `ageBandForClassroom` band kizárólag betűméretet
 * váltott (BAND_STYLES), a három korosztály pixelre azonos fehér kártyalistát kapott, a
 * szerző-prompt a band nevét nem tartalmazta. Ezek a guardok a token-réteget, a
 * mozgás-kapuzást és a prompt-regisztert pinnelik — DOM nélkül, hogy olcsón fussanak.
 */

const here = (rel: string) =>
  new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (rel: string) => readFileSync(here(rel), "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const css = stripComments(read("../client/src/lesson-runtime/lesson-theme.css"));
const runtime = stripComments(read("../client/src/lesson-runtime/LessonRuntime.tsx"));

test("BAND_THEME kulcsai pontosan az AGE_BANDS értékei (új band téma nélkül bukik)", () => {
  assert.deepEqual(Object.keys(BAND_THEME).sort(), [...AGE_BANDS].sort());
});

/** Egy `[data-band="X"]` szelektor deklarációs blokkjának szövege (első előfordulás). */
function bandBlock(band: string): string {
  const m = css.match(new RegExp(`\\[data-band="${band}"\\][^{]*\\{([^}]*)\\}`));
  assert.ok(m, `nincs [data-band="${band}"] token-blokk a lesson-theme.css-ben`);
  return m[1];
}
const token = (block: string, name: string) => {
  const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : undefined;
};

test("mind a 3 band saját --lesson-accent értéket ad, páronként különbözőt", () => {
  const accents = AGE_BANDS.map((b) => token(bandBlock(b), "--lesson-accent"));
  for (const [i, a] of accents.entries()) assert.ok(a, `${AGE_BANDS[i]}: hiányzó --lesson-accent`);
  assert.equal(new Set(accents).size, AGE_BANDS.length, `az akcentek nem különböznek: ${accents.join(", ")}`);
});

test("#197 szabály: minden háttér-tokenhez tartozik tinta-pár", () => {
  const pairs: Array<[string, string]> = [
    ["--lesson-bg", "--lesson-ink"],
    ["--lesson-surface", "--lesson-ink"],
    ["--lesson-accent", "--lesson-accent-ink"],
    ["--lesson-check-head", "--lesson-check-head-ink"],
    ["--lesson-ok-bg", "--lesson-ok-ink"],
  ];
  for (const band of AGE_BANDS) {
    const block = bandBlock(band);
    for (const [bg, ink] of pairs) {
      assert.ok(token(block, bg), `${band}: hiányzó ${bg}`);
      assert.ok(token(block, ink), `${band}: ${bg} tinta-pár nélkül (${ink})`);
    }
  }
});

/**
 * Minden `animation` deklaráció kizárólag `prefers-reduced-motion: no-preference`
 * médiablokkon belül állhat. Zárójel-számlálással járjuk a CSS-t, mert egy regex a
 * beágyazott blokkokat nem látja.
 */
function animationDeclarationsOutsideMotionGate(source: string): string[] {
  const leaks: string[] = [];
  let depth = 0;
  let gateDepth: number | null = null;
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const media = rest.match(/^@media[^{]*\{/);
    if (media) {
      const isGate = /prefers-reduced-motion\s*:\s*no-preference/.test(media[0]);
      depth++;
      if (isGate && gateDepth === null) gateDepth = depth;
      i += media[0].length;
      continue;
    }
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (gateDepth === depth) gateDepth = null;
      depth--;
    } else if (rest.startsWith("animation") && /^animation(-name)?\s*:/.test(rest)) {
      const decl = rest.match(/^animation(?:-name)?\s*:\s*([^;]+);/);
      const value = decl?.[1] ?? "";
      if (gateDepth === null && !/^\s*none\s*$/.test(value)) leaks.push(value.trim());
    }
    i++;
  }
  return leaks;
}

test("lesson-theme.css: minden animáció a reduced-motion kapun belül van", () => {
  assert.ok(/@keyframes/.test(css), "a témának VAN animációja (különben a kapu semmit nem őriz)");
  assert.deepEqual(animationDeclarationsOutsideMotionGate(css), []);
});

test("a mozgás-kapu ellenőrző maga is működik (önteszt, #183 tanulság)", () => {
  const leaky = `.a{animation: x 1s;} @media (prefers-reduced-motion: no-preference){.b{animation: y 1s;}}`;
  assert.deepEqual(animationDeclarationsOutsideMotionGate(leaky), ["x 1s"]);
  const commented = stripComments(`/* .z{animation: z 1s;} */ .a{animation: none;}`);
  assert.deepEqual(animationDeclarationsOutsideMotionGate(commented), []);
});

test("LessonRuntime: a gyökér data-band attribútumot kap, a recap kártyákként renderel", () => {
  assert.match(runtime, /data-band=\{band\}/, "a gyökér elem data-band={band} nélkül: a CSS tokenek nem kapcsolnak be");
  assert.match(runtime, /data-recap-item/, "a recap-pontok nem kártyák (data-recap-item)");
  const recap = runtime.slice(runtime.indexOf("function RecapBlock"), runtime.indexOf("export function LessonBlock"));
  assert.ok(recap.length > 0, "RecapBlock megtalálható");
  assert.doesNotMatch(recap, /<li\b/, "a recap nem lehet <li>-lista");
  assert.match(runtime, /data-testid="lesson-progress"/, "hiányzik a szakasz-haladásjelző");
});

test("az author-prompt megnevezi a bandet és a regisztert; UUID-t nem tartalmaz (#179)", () => {
  for (const [classroom, band] of [[2, "kid"], [7, "teen"], [11, "senior"]] as const) {
    const prompt = buildAuthorPrompt(
      [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain"] }] as never,
      { title: "T", subject: "s", classroom, concepts: [{ localId: "c1", examWeight: "core", id: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", term: "x" }] } as never,
      [],
    );
    assert.ok(prompt.includes(`Age band: ${band}`), `${classroom}. osztály → "${band}" band a promptban`);
    assert.ok(prompt.includes(bandRegisterForPrompt(band)), `${band}: a regiszter-leírás szerepel`);
    assert.doesNotMatch(prompt, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "DB UUID szivárgott a promptba");
  }
});
