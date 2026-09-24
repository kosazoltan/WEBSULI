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
