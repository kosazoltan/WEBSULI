import test from "node:test";
import assert from "node:assert/strict";
import { renderedVisualTexts, visualParamProblems } from "../shared/lesson-visual-params";

// Spec 2026-09-30 (docs/specs/2026-09-30-abratervezo-3d.md): a forgatható 3D-jelenet adatszerződése.
const ziggurat = {
  objects: [
    { shape: "stairs", at: [0, 0, 0], size: [6, 4, 6], steps: 4, color: "#d98c4a", label: "zikkurat" },
    { shape: "box", at: [0, 4, 0], size: [1.4, 1, 1.4], color: "#f1e3c6", label: "szentély" },
    { shape: "river", at: [0, 0, 0], points: [[-8, -6], [-5, 0], [-7, 6]], width: 1.2, color: "#3b82c4", label: "Tigris" },
  ],
  labels: [{ text: "agyagtégla", at: [3, 1, 3] }],
  ground: "#e6c98f",
  view: "iso",
};

test("érvényes zikkurat-jelenet: nincs probléma", () => {
  assert.deepEqual(visualParamProblems("scene3d", ziggurat), []);
});

test("folyó pontok nélkül és hasáb méret nélkül: hiba", () => {
  const bad = { objects: [{ shape: "river", at: [0, 0, 0], color: "#3b82c4" }, { shape: "box", at: [0, 0, 0], color: "#ffffff" }] };
  const problems = visualParamProblems("scene3d", bad).join(" | ");
  assert.match(problems, /river: hiányzó points/);
  assert.match(problems, /box: hiányzó size/);
});

test("41 objektum, tartományon kívüli koordináta, hibás szín: hiba", () => {
  const many = { objects: Array.from({ length: 41 }, () => ({ shape: "box", at: [0, 0, 0], size: [1, 1, 1], color: "#ffffff" })) };
  assert.ok(visualParamProblems("scene3d", many).length > 0);
  assert.ok(visualParamProblems("scene3d", { objects: [{ shape: "box", at: [11, 0, 0], size: [1, 1, 1], color: "#ffffff" }] }).length > 0);
  assert.ok(visualParamProblems("scene3d", { objects: [{ shape: "box", at: [0, 0, 0], size: [1, 1, 1], color: "red" }] }).length > 0);
});

test("legfeljebb 8 felirat összesen (objektum + labels)", () => {
  const objects = Array.from({ length: 6 }, (_, i) => ({ shape: "box", at: [i - 3, 0, 0], size: [1, 1, 1], color: "#ffffff", label: `ház ${i}` }));
  const labels = Array.from({ length: 3 }, (_, i) => ({ text: `jel ${i}`, at: [0, 2, i] }));
  assert.match(visualParamProblems("scene3d", { objects, labels }).join(" "), /legfeljebb 8 felirat/);
});

test("a címke-őr látja a kirajzolt feliratokat", () => {
  assert.deepEqual(renderedVisualTexts("scene3d", ziggurat), ["zikkurat", "szentély", "Tigris", "agyagtégla"]);
});
