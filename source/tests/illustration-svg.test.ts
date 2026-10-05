import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeIllustration, ungroundedLabels } from "../shared/illustration-svg";
import { applyVisualPatch } from "../server/studio/visual-patch";
import type { Lesson } from "../shared/lesson-schema";

/** Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 2. szelet): szabad SVG-illusztráció. */

const OK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120"><defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4"><path d="M0 0L10 5L0 10z"/></marker></defs><circle cx="60" cy="60" r="30" fill="url(#g)"/><line x1="0" y1="0" x2="10" y2="10" marker-end="url(#a)"/><text x="10" y="110">Stonehenge kőtömbök</text></svg>';

test("tisztító: a támadó elemek és attribútumok kiesnek, a rajz megmarad", () => {
  const attacks = [
    OK.replace("<circle", "<script>alert(1)</script><circle"),
    OK.replace("<svg ", '<svg onload="alert(1)" '),
    OK.replace("<circle", "<foreignObject><div>x</div></foreignObject><circle"),
    OK.replace("<circle", '<a href="javascript:alert(1)"><text>x</text></a><circle'),
    OK.replace("<circle", '<image href="https://evil.example/x.png"/><circle'),
    OK.replace("<circle", "<style>*{background:url(https://evil.example)}</style><circle"),
    OK.replace("<circle ", '<circle style="fill:url(https://evil.example)" '),
    OK.replace("<circle", '<use href="#a"/><circle'),
  ];
  for (const svg of attacks) {
    const r = sanitizeIllustration(svg);
    assert.ok(r.ok, "a rajz megmarad");
    assert.doesNotMatch(r.svg, /script|onload|foreignObject|javascript|evil|<image|<style|<use|style=/i);
    assert.match(r.svg, /<circle/);
  }
  const clean = sanitizeIllustration(OK);
  assert.ok(clean.ok);
  assert.doesNotMatch(clean.svg, / width=| height="120"/, "a méretet a befoglaló elem adja");
  assert.deepEqual(clean.labels, ["Stonehenge kőtömbök"]);
});

test("tisztító: elutasítja a külső url()-t, a hiányzó viewBoxot, a két gyökeret, a felirat nélküli és a túl nagy rajzot", () => {
  const reason = (svg: unknown) => { const r = sanitizeIllustration(svg); return r.ok ? "" : r.problems.join("; "); };
  assert.match(reason(OK.replace("url(#g)", "url(https://evil.example/x)")), /külső hivatkozás/);
  assert.match(reason(OK.replace(' viewBox="0 0 200 120"', "")), /viewBox/);
  assert.match(reason(OK + OK), /egyetlen <svg>/);
  assert.match(reason(OK.replace(/<text[^]*<\/text>/, "")), /nincs felirat/);
  assert.match(reason(OK.replace("</svg>", `${"<circle cx=\"1\" cy=\"1\" r=\"1\"/>".repeat(1500)}</svg>`)), /túl nagy/);
  assert.match(reason(undefined), /hiányzó svg/);
});

test("felirat-forrás: ragozott szó a leckéből jó, kitalált szó és szám nem; rövid jel szabad", () => {
  const corpus = "A Stonehenge kőtömbökből álló építmény. A Hold változása alapján holdnaptár. i.e. 776-ban volt.";
  assert.deepEqual(ungroundedLabels(["Stonehenge", "a Holdat", "i. e. 776", "A", "Piramis", "1492"], corpus), ["Piramis", "1492"]);
});

test("folt: az illusztráció tisztítva kerül a leckébe; kitalált felirattal kimarad", () => {
  const lesson = { title: "Az időszámítás", subject: "történelem", classroom: 5, mapId: "m", sourceOnly: true, misconceptions: [], sections: [
    { heading: "Stonehenge", probaEnabled: true, blocks: [{ kind: "explain", text: "A Stonehenge kőtömbökből álló kultikus építmény.", depth: "core", readAloud: true, coversConceptIds: ["c1"] }] },
  ] } as unknown as Lesson;
  const visual = (svg: string) => ({ sections: [{ index: 0, visuals: [{ after: 0, animKind: "illustration", params: { svg }, caption: "A Stonehenge kőtömbjei", coversConceptIds: ["c1"] }] }] });
  const ok = applyVisualPatch(lesson, visual(OK.replace("<circle", "<script>x</script><circle")));
  assert.equal(ok?.added, 1);
  const svg = (ok!.lesson.sections[0].blocks[1] as unknown as { params: { svg: string } }).params.svg;
  assert.doesNotMatch(svg, /script/);
  const invented = applyVisualPatch(lesson, visual(OK.replace("Stonehenge kőtömbök", "Egyiptomi piramis")));
  assert.equal(invented?.added, 0);
  assert.match(invented!.rejected.join(" "), /nem szereplő felirat: Egyiptomi piramis/);
});

test("elrendezés (élő mérés: 11,1 px-es betű telefonon): kicsi betű, egymásra csúszó és kilógó felirat jelezve, jó rajz tiszta", async () => {
  const { illustrationLayoutProblems } = await import("../shared/illustration-svg");
  const svg = (texts: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect x="10" y="10" width="100" height="80"/>${texts}</svg>`;
  assert.deepEqual(illustrationLayoutProblems(svg('<text x="200" y="40" font-size="16" text-anchor="middle">iniciálé</text><text x="200" y="70" font-size="16" text-anchor="middle">díszes kezdőbetű</text>')), []);
  assert.match(illustrationLayoutProblems(svg('<text x="20" y="40" font-size="14">Európid</text>')).join(), /túl kicsi betű.*legalább 15 kell.*Európid/);
  assert.match(illustrationLayoutProblems(svg('<text x="100" y="40" font-size="18">pergamen</text><text x="110" y="44" font-size="18">állatbőr</text>')).join(), /egymásra csúszó felirat: „pergamen” × „állatbőr”/);
  assert.match(illustrationLayoutProblems(svg('<text x="380" y="40" font-size="18">latin nyelvű kódex</text>')).join(), /kilógó felirat: latin nyelvű kódex/);
  assert.deepEqual(illustrationLayoutProblems(svg('<g transform="rotate(30)"><text x="380" y="40" font-size="10">x</text></g>')), [], "transzformált feliratot nem ítél meg");
  const { weakVisualsInstruction } = await import("../server/studio/visual-quality");
  assert.match(weakVisualsInstruction([], ["4. fejezet 1. ábra (illustration): illustration.svg: túl kicsi betű"]), /ELUTASÍTOTTA[^]*túl kicsi betű/);
});

/** Spec 2026-10-05 (docs/specs/2026-10-05-illusztracio-szam-attributum.md): élesen `<rect y="+">` (Mezopotámia, 1. fejezet). */
const MEZO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><rect x="265" y="+" width="270" height="58" rx="14" fill="#ffffff" stroke="#0f172a" stroke-width="2"/><text x="400" y="62" font-size="36" fill="#0f172a" text-anchor="middle">Mezopotámia</text></svg>';

test("szám-attribútum: a hibás y elmarad, név szerint jelentve, a rajz megmarad", () => {
  const r = sanitizeIllustration(MEZO);
  assert.ok(r.ok);
  assert.deepEqual(r.attrFixes, ['rect.y="+"']);
  assert.doesNotMatch(r.svg, /y="\+"/);
  assert.match(r.svg, /<rect x="265" width="270" height="58"/);
  const again = sanitizeIllustration(r.svg);
  assert.ok(again.ok);
  assert.equal(again.svg, r.svg, "idempotens");
  assert.deepEqual(again.attrFixes, []);
});

test("szám-attribútum: érvényes hossz, százalék, kulcsszó megmarad; hibás érték és nem-text lista elmarad", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><defs><linearGradient id="g"><stop offset="50%" stop-color="#fff"/></linearGradient></defs>'
    + '<rect x="10 20" y="-1.5e2" width="auto" height="" rx="auto" fill="#cccccc"/><circle cx="NaN" cy="40" r="10px"/>'
    + '<text x="20" y="60" font-size="large" fill="#0f172a"><tspan dy="1.2em">Duna</tspan></text></svg>';
  const r = sanitizeIllustration(svg);
  assert.ok(r.ok, r.ok ? "" : r.problems.join("; "));
  assert.deepEqual([...r.attrFixes].sort(), ['circle.cx="NaN"', 'rect.height=""', 'rect.width="auto"', 'rect.x="10 20"'].sort());
  for (const keep of ['offset="50%"', 'y="-1.5e2"', 'rx="auto"', 'r="10px"', 'x="20"', 'font-size="large"', 'dy="1.2em"']) assert.ok(r.svg.includes(keep), keep);
});

test("szám-attribútum: a szerver kapuja új modellkimenetnél problémának veszi", async () => {
  const { visualParamProblems } = await import("../shared/lesson-visual-params");
  const problems = visualParamProblems("illustration", { svg: MEZO });
  assert.ok(problems.some((p) => /érvénytelen szám-attribútum.*rect\.y="\+"/.test(p)), problems.join("; "));
  assert.ok(!visualParamProblems("illustration", { svg: MEZO.replace('y="+"', 'y="12"') }).some((p) => /szám-attribútum/.test(p)));
});

/** Review #198: a gyökér <svg> is mérődik; a nem-negatív attribútumok negatív értéke érvénytelen (SVG 2). */
test("szám-attribútum (review #198): a gyökér <svg> hibás attribútuma elmarad és jelentve", async () => {
  const r = sanitizeIllustration(MEZO.replace('<rect x="265" y="+"', '<rect x="265" y="2"').replace("<svg ", '<svg x="+" '));
  assert.ok(r.ok, r.ok ? "" : r.problems.join("; "));
  assert.deepEqual(r.attrFixes, ['svg.x="+"']);
  assert.doesNotMatch(r.svg, /x="\+"/);
  const again = sanitizeIllustration(r.svg);
  assert.ok(again.ok);
  assert.equal(again.svg, r.svg, "idempotens");
  assert.deepEqual(again.attrFixes, []);
  const clean = sanitizeIllustration(OK);
  assert.ok(clean.ok);
  assert.deepEqual(clean.attrFixes, [], "a gyökér width/height-je nem jelentett (úgyis törlődik)");
});

test("szám-attribútum (review #198): nem-negatív attribútum negatív értéke elmarad; a helyzet lehet negatív", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><defs><marker id="m" markerWidth="-4" markerHeight="4"><path d="M0 0L4 2L0 4z"/></marker></defs>'
    + '<circle cx="-1" cy="40" r="-10"/><circle cx="60" cy="40" r="+5"/><rect x="-5" y="10" width="-1" height="20" rx="-2" ry="0" stroke-width="-1"/>'
    + '<text x="20" y="60" font-size="-12" fill="#0f172a">Duna<tspan dy="-1em">Tisza</tspan></text><text x="20" y="120" font-size="20" fill="#0f172a">Nílus</text></svg>';
  const r = sanitizeIllustration(svg);
  assert.ok(r.ok, r.ok ? "" : r.problems.join("; "));
  assert.deepEqual([...r.attrFixes].sort(), [
    'circle.r="-10"', 'marker.markerWidth="-4"', 'rect.rx="-2"', 'rect.stroke-width="-1"', 'rect.width="-1"', 'text.font-size="-12"',
  ].sort());
  for (const gone of ['r="-10"', 'width="-1"', 'rx="-2"', 'stroke-width="-1"', 'font-size="-12"', 'markerWidth="-4"']) assert.ok(!r.svg.includes(gone), gone);
  for (const keep of ['cx="-1"', 'r="+5"', 'x="-5"', 'ry="0"', 'height="20"', 'markerHeight="4"', 'dy="-1em"']) assert.ok(r.svg.includes(keep), keep);
  const { visualParamProblems } = await import("../shared/lesson-visual-params");
  const problems = visualParamProblems("illustration", { svg: MEZO.replace('y="+"', 'y="2"').replace('rx="14"', 'rx="-14"') });
  assert.ok(problems.some((p) => /érvénytelen szám-attribútum.*rect\.rx="-14"/.test(p)), problems.join("; "));
});
