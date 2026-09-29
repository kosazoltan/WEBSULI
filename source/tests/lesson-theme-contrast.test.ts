import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { VISUAL_WORLDS } from "../shared/lesson-visuals";
import { contrastRatio } from "../shared/svg-contrast";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-lecke-dizajn.md, Review-javítás 2. pont): minden világ és korcsoport
 * szöveg/háttér token-párja WCAG AA (≥ 4,5:1). Review-lelet: az oszlopdiagram „átlag” felirata a lecke
 * `--lesson-error` színét kapja a felületen — a sötét arena (#2d3f5f) és dojo (#334155) felületén a #fb7185
 * csak ~3,9:1 volt. A böngészős mérés (15 téma × 3 évfolyam) mellett ez a CSS-forrásból számol, olcsón.
 */

const dir = path.resolve("client/src/lesson-runtime");
const experienceCss = fs.readFileSync(path.join(dir, "lesson-experience.css"), "utf8");
const gradeCss = fs.readFileSync(path.join(dir, "lesson-grade.css"), "utf8");

type Tokens = Record<string, string>;
const tokensOf = (block: string): Tokens => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1], m[2]]));
const blockAfter = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `hiányzó szabály: ${selector}`);
  return css.slice(at, css.indexOf("}", at));
};

/** A szöveg/háttér párok, amelyeket a runtime együtt fest (a #197-es „aki hátteret ad, tintát is ad” szabály). */
const PAIRS: Array<[string, string, string]> = [
  ["--lesson-ink", "--lesson-surface", "szöveg a kártyán"],
  ["--lesson-muted", "--lesson-surface", "halvány szöveg (aláírás, inaktív fül)"],
  ["--lesson-error", "--lesson-surface", "hibaszín a kártyán (oszlopdiagram „átlag” felirata)"],
  ["--lesson-accent-ink", "--lesson-accent", "akcent-gomb / aktív fül"],
  ["--lesson-ok-bg-ink", "--lesson-ok-bg", "„Eredmény” doboz, helyes válasz"],
  ["--lesson-warn-ink", "--lesson-warn-bg", "hibás válasz visszajelzése"],
  ["--lesson-check-head-ink", "--lesson-check-head", "kérdés-címke"],
  ["--lesson-key-ink", "--lesson-key", "kiemelő-címke"],
];

function problems(name: string, tokens: Tokens): string[] {
  const out: string[] = [];
  for (const [fg, bg, what] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue;
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    if (ratio < 4.5) out.push(`${name}: ${what} ${tokens[fg]} a ${tokens[bg]}-on ${ratio.toFixed(2)}:1`);
  }
  return out;
}

const base = tokensOf(blockAfter(experienceCss, "[data-band][data-experience] {"));
const grade = tokensOf(blockAfter(gradeCss, "[data-experience][data-learning-age] {"));

test("minden vizuális világ token-párja ≥ 4,5:1 (a hiányzó token a közös alapból és a korcsoport-rétegből jön)", () => {
  const found: string[] = [];
  for (const w of VISUAL_WORLDS) {
    const line = experienceCss.split("\n").find((l) => l.includes(`[data-experience="${w.id}"][data-learning-age]`) && l.includes("--lesson-bg"));
    assert.ok(line, `${w.id}: CSS-szabály`);
    found.push(...problems(w.id, { ...base, ...grade, ...tokensOf(line!) }));
  }
  assert.deepEqual(found, []);
});

test("a klasszikus témák korcsoport-rétegei (1–2 … 9+) token-párja ≥ 4,5:1", () => {
  const found: string[] = [];
  for (const age of ["1-2", "3-4", "5-6", "7-8", "9+"]) {
    const layer = tokensOf(blockAfter(gradeCss, `[data-experience][data-learning-age="${age}"] {`));
    found.push(...problems(`korcsoport ${age}`, { ...base, ...grade, ...layer }));
  }
  assert.deepEqual(found, []);
});
