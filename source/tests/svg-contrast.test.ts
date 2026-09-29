import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, measureIllustrationText, ILLUSTRATION_PAPER } from "../shared/svg-contrast";
import { sanitizeIllustration } from "../shared/illustration-svg";
import { applyVisualPatch } from "../server/studio/visual-patch";
import type { Lesson } from "../shared/lesson-schema";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-lecke-dizajn.md, 1. pont): ábra-kontrasztőr.
 *
 * Élesben mért hiba (Hunyadi János, 6. o., /preview/aa1c5346-…): a modell világos pasztell kártyára
 * `fill="currentColor"` feliratot írt; az „arena” (sötét) témában a currentColor = rgb(240, 249, 255),
 * így a „Keresztény sereg” 1,17:1 kontraszttal jelent meg. Az alábbi SVG a pontos éles szöveg.
 */
const HUNYADI = '<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="18" width="178" height="184" rx="12" fill="#d8e9f2" stroke="currentColor"/><rect x="210" y="18" width="178" height="184" rx="12" fill="#f0dfd8" stroke="currentColor"/><text x="28" y="52" font-size="18" fill="currentColor">Keresztény sereg</text><text x="28" y="94" font-size="18" fill="currentColor">Hunyadi János</text><text x="28" y="126" font-size="18" fill="currentColor">I. Ulászló</text><text x="230" y="52" font-size="18" fill="currentColor">Oszmán-török</text><text x="230" y="94" font-size="18" fill="currentColor">II. Murád</text><line x1="188" y1="108" x2="212" y2="108" stroke="currentColor" stroke-width="3"/><text x="30" y="170" font-size="16" fill="currentColor">vezetők</text><text x="230" y="170" font-size="16" fill="currentColor">vezér</text></svg>';

/** The two extremes the runtime paints a figure card with: the dark „arena” surface and a light surface. */
const DARK = { background: "#2d3f5f", ink: "#f0f9ff" };
const LIGHT = { background: "#ffffff", ink: "#172c45" };

const svgOf = (body: string, viewBox = "0 0 400 220") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
const clean = (svg: string) => {
  const r = sanitizeIllustration(svg);
  assert.ok(r.ok, r.ok ? "" : r.problems.join("; "));
  return r;
};

test("kontrasztarány: WCAG-képlet, a mért 1,17:1 reprodukálva", () => {
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000")), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  const measured = contrastRatio("#f0f9ff", "#d8e9f2");
  assert.ok(measured < 1.3, `a világos-a-világoson aránya ${measured}`);
});

test("a nyers Hunyadi-SVG sötét témán olvashatatlan (a hiba reprodukálva a mérővel)", () => {
  const raw = measureIllustrationText(HUNYADI, DARK);
  assert.equal(raw.length, 7, "hét felirat");
  const bad = raw.filter((t) => t.ratio < 4.5).map((t) => t.text);
  assert.ok(bad.includes("Keresztény sereg") && bad.includes("II. Murád"), `alacsony kontrasztú feliratok: ${bad.join(", ")}`);
});

test("a tisztított Hunyadi-SVG minden felirata ≥ 4,5:1 — sötét ÉS világos témán is (témafüggetlen)", () => {
  const r = clean(HUNYADI);
  for (const surface of [DARK, LIGHT]) {
    const texts = measureIllustrationText(r.svg, surface);
    assert.equal(texts.length, 7);
    for (const t of texts) assert.ok(t.ratio >= 4.5, `${t.text}: ${t.ratio.toFixed(2)}:1 (${t.color} a ${t.background}-on)`);
  }
  assert.ok(r.ok && r.contrastFixes.length >= 1, "a javított feliratok név szerint");
});

test("pozitív eset: sötét kitöltés + világos szöveg változatlan", () => {
  const svg = svgOf('<rect x="10" y="10" width="380" height="120" fill="#1e3a8a"/><text x="30" y="70" font-size="20" fill="#ffffff">Nándorfehérvár</text>');
  const r = clean(svg);
  assert.ok(r.ok);
  assert.match(r.svg, /<text[^>]*fill="#ffffff"[^>]*>Nándorfehérvár/);
  assert.deepEqual(r.contrastFixes, []);
  const [t] = measureIllustrationText(r.svg, DARK);
  assert.ok(t.ratio > 8, `sötétkék alapon fehér: ${t.ratio}`);
});

test("áttetsző alakzat: a papírral keverve számol (fill-opacity)", () => {
  // 15%-os sötét fátyol a világos papíron → a háttér világos, a fehér felirat olvashatatlan volna.
  const r = clean(svgOf('<rect x="10" y="10" width="380" height="120" fill="#0f172a" fill-opacity="0.15"/><text x="30" y="70" font-size="20" fill="#ffffff">Várna</text>'));
  const [t] = measureIllustrationText(r.svg, DARK);
  assert.ok(t.ratio >= 4.5, `${t.color} a ${t.background}-on: ${t.ratio}`);
  assert.ok(r.ok && r.contrastFixes.includes("Várna"));
});

test("a halvány körvonal a papíron legalább 3:1 lesz (nem-szöveges kontraszt)", () => {
  const r = clean(svgOf('<line x1="20" y1="100" x2="380" y2="100" stroke="#e2e8f0" stroke-width="3"/><text x="30" y="60" font-size="20">Duna</text>'));
  const stroke = /<line[^>]*stroke="([^"]+)"/.exec(r.svg)?.[1];
  assert.ok(stroke, "van stroke");
  assert.ok(contrastRatio(stroke!, ILLUSTRATION_PAPER.background) >= 3, `a vonal ${stroke}`);
});

test("transzformált csoport: az alakzat a helyén mérődik", () => {
  // A sötét téglalap translate(200 0) után x = 210…390-en van; a felirat x = 230-on rajta áll.
  const r = clean(svgOf('<g transform="translate(200 0)"><rect x="10" y="10" width="180" height="120" fill="#111827"/></g><text x="230" y="70" font-size="20" fill="#1f2937">Szeged</text>'));
  const [t] = measureIllustrationText(r.svg, LIGHT);
  assert.ok(t.ratio >= 4.5, `${t.color} a ${t.background}-on: ${t.ratio}`);
  assert.equal(t.background.toLowerCase(), "#111827");
});

test("idempotens: a kliens újratisztítása ugyanazt adja, egyetlen papírral", () => {
  const once = clean(HUNYADI);
  const twice = clean(once.svg);
  assert.equal(twice.svg, once.svg);
  assert.equal(once.svg.match(/websuli-paper/g)?.length, 1);
  assert.doesNotMatch(once.svg, /currentColor/i, "témafüggő szín nem marad");
});

test("Studio-folt: a kontraszt-javítás jegyzetként jelzett, az ábra bekerül", () => {
  const lesson = { title: "Hunyadi János", subject: "történelem", classroom: 6, mapId: "m", sourceOnly: true, misconceptions: [], sections: [
    { heading: "Keresztény sereg és oszmán-török", probaEnabled: true, blocks: [{ kind: "explain", text: "Hunyadi János és I. Ulászló vezetők a keresztény sereg élén; II. Murád az oszmán-török vezér.", depth: "core", readAloud: true, coversConceptIds: ["c1"] }] },
  ] } as unknown as Lesson;
  const out = applyVisualPatch(lesson, { sections: [{ index: 0, visuals: [{ after: 0, animKind: "illustration", params: { svg: HUNYADI }, caption: "A két sereg vezetői", coversConceptIds: ["c1"] }] }] });
  assert.equal(out?.added, 1, out?.rejected.join(" | "));
  assert.match(out!.notes.join(" "), /kontraszt[^]*Keresztény sereg/);
});
