import { test } from "node:test";
import assert from "node:assert/strict";
import { moonLitPath, parseVisualParams, visualParamProblems } from "../shared/lesson-visual-params";
import { ANIM_KINDS, dropUnknownAnimateBlocks } from "../shared/lesson-schema";

/** Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md): magyarázó ábrák paraméterei. */

const moonCycle = {
  center: "Föld",
  phases: [
    { label: "Újhold", moon: 0 }, { label: "Növő sarló", moon: 0.25, waxing: true },
    { label: "Első negyed", moon: 0.5, waxing: true }, { label: "Telihold", moon: 1, note: "a teljes korong világos" },
    { label: "Utolsó negyed", moon: 0.5, waxing: false }, { label: "Fogyó sarló", moon: 0.25, waxing: false },
  ],
};

test("a holdciklus körforgás-ábraként érvényes; egy kör vagy két fázis nem az", () => {
  assert.deepEqual(visualParamProblems("cycle", moonCycle), []);
  assert.ok(visualParamProblems("cycle", { phases: [{ label: "Hold" }] }).length, "egyetlen fázis nem körforgás");
  assert.ok(visualParamProblems("cycle", {}).length, "üres paraméterből nincs ábra");
  assert.ok(visualParamProblems("cycle", { phases: [{ label: "a", moon: 1.5 }, { label: "b" }, { label: "c" }] }).length, "a megvilágítás 0–1");
});

test("holdfázis-rajz: újhold üres, telihold teljes kör, növő a jobb, fogyó a bal oldalon világos", () => {
  assert.equal(moonLitPath(50, 50, 20, 0, true), "");
  assert.match(moonLitPath(50, 50, 20, 1, true), /A20 20 0 1 1/);
  // Limb sweep: 1 = clockwise from the top through the RIGHT side (waxing), 0 = through the left.
  assert.match(moonLitPath(50, 50, 20, 0.25, true), /^M50 30 A20 20 0 0 1 50 70 A10 20 0 0 0 50 30 Z$/);
  assert.match(moonLitPath(50, 50, 20, 0.25, false), /^M50 30 A20 20 0 0 0 50 70 A10 20 0 0 1 50 30 Z$/);
  // Gibbous: the terminator bulges to the dark side.
  assert.match(moonLitPath(50, 50, 20, 0.75, true), / A10 20 0 0 1 50 30 Z$/);
  // First quarter: straight terminator (rx = 0).
  assert.match(moonLitPath(50, 50, 20, 0.5, true), / A0 20 0 0 1 50 30 Z$/);
});

test("címkézett alakzat: a kiskockás téglatest élei és rétegei; hiányzó él → nincs ábra", () => {
  const cuboid = { shape: "cuboid", width: 11, depth: 7, height: 6, unit: "egység", layers: 6 };
  assert.deepEqual(visualParamProblems("labeledShape", cuboid), []);
  assert.ok(visualParamProblems("labeledShape", { shape: "cuboid", width: 11, height: 6 }).length);
  assert.ok(visualParamProblems("labeledShape", { shape: "circle" }).length, "kör sugár nélkül");
  assert.deepEqual(visualParamProblems("labeledShape", { shape: "rectangle", width: "12 cm", height: "8 cm" }), []);
  assert.ok(visualParamProblems("labeledShape", { shape: "hexagon", width: 2 }).length);
});

test("oszlopdiagram, halmazábra, számegyenes", () => {
  assert.deepEqual(visualParamProblems("barChart", { bars: [{ label: "1. bolt", value: 500 }, { label: "2. bolt", value: 480 }], unit: "Ft/kg", average: true }), []);
  assert.ok(visualParamProblems("barChart", { bars: [{ label: "egy", value: 1 }] }).length);
  assert.deepEqual(visualParamProblems("venn", { sets: ["kék kabát", "kék sapka"], regions: { AB: "legalább 15", none: 0 }, universe: "30 fős osztály" }), []);
  assert.ok(visualParamProblems("venn", { sets: ["egy"] }).length);
  assert.ok(visualParamProblems("venn", { sets: ["a", "b"], regions: { XY: 3 } }).length, "ismeretlen tartomány");
  assert.deepEqual(visualParamProblems("numberLine", { from: 1400, to: 1600, step: 50, marks: [{ value: 1452, label: "1452" }], jumps: [{ from: 1452, to: 1500, label: "kerekítés" }] }), []);
  assert.ok(visualParamProblems("numberLine", { from: 5, to: 1 }).length);
  assert.ok(visualParamProblems("numberLine", { from: 0, to: 1000, step: 1 }).length, "legfeljebb 40 osztás");
  assert.deepEqual(visualParamProblems("numberLine", { from: 0, to: 10, highlightTo: 4 }), [], "régi leckék számegyenese érvényes marad");
});

test("folyamat és idővonal: kitalált alaplépés helyett legalább két valódi elem kell", () => {
  assert.ok(visualParamProblems("process", {}).length);
  assert.ok(visualParamProblems("process", { steps: ["egy"] }).length);
  assert.deepEqual(visualParamProblems("process", { steps: ["Összeadom az árakat", "Elosztom kettővel"] }), []);
  assert.ok(visualParamProblems("timeline", { events: ["i. e. 776"] }).length);
  assert.equal(parseVisualParams("cycle", moonCycle)?.phases.length, 6);
  assert.deepEqual(visualParamProblems("geometry", {}), [], "séma nélküli régi fajta átmegy (a rajzolója dönt)");
});

test("régi kliens: az ismeretlen ábrafajtájú blokk kimarad, a lecke többi része megmarad", () => {
  const lesson = { title: "t", sections: [{ heading: "h", blocks: [
    { kind: "explain", text: "x" },
    { kind: "animate", animKind: "hologram3d", params: {} },
    { kind: "animate", animKind: ANIM_KINDS[0], params: {} },
  ] }] };
  const out = dropUnknownAnimateBlocks(lesson) as typeof lesson;
  assert.deepEqual(out.sections[0].blocks.map((b) => (b as { animKind?: string }).animKind ?? b.kind), ["explain", ANIM_KINDS[0]]);
  assert.equal(dropUnknownAnimateBlocks(null), null);
});
