import assert from "node:assert/strict";
import test from "node:test";

import {
  QUIZ3D_BOARD_STYLE,
  QUIZ3D_FOV_DEG,
  QUIZ3D_OPTION_FONT_PX,
  QUIZ3D_PROMPT_FONT_PX,
  QUIZ3D_TILE_STYLES,
  cameraDistanceFor,
  contrastRatio,
  quiz3dEnabled,
  rectToWorld,
  wrapLines,
} from "../client/src/game-engine/scenes/quizBoardLayout";

/** Spec 2026-09-29-palyak-szoletra-nyelvek, 7. döntés és E5 — a 3D kérdés olvashatósága (tiszta rész). */

test("contrastRatio: a WCAG-képlet (fekete/fehér = 21, azonos szín = 1)", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  assert.equal(contrastRatio("#fff", "#000"), contrastRatio("#000000", "#FFFFFF"));
  assert.ok(Math.abs(contrastRatio("#767676", "#ffffff") - 4.54) < 0.01);
});

test("E5: minden lapállapot és a kérdéstábla szövege ≥ 4,5:1 kontrasztú", () => {
  const states = Object.entries(QUIZ3D_TILE_STYLES);
  assert.ok(states.length >= 4, "idle, correct, wrong, dim legalább");
  for (const [state, s] of states) {
    assert.ok(contrastRatio(s.text, s.face) >= 4.5, `${state}: ${contrastRatio(s.text, s.face).toFixed(2)}`);
    assert.ok(contrastRatio(s.badgeText, s.badge) >= 4.5, `${state} jelvény: ${contrastRatio(s.badgeText, s.badge).toFixed(2)}`);
  }
  assert.ok(contrastRatio(QUIZ3D_BOARD_STYLE.text, QUIZ3D_BOARD_STYLE.face) >= 4.5);
});

test("7. döntés: legfeljebb 12°-os perspektíva, betű ≥ 20 CSS px (kérdés ≥ 22)", () => {
  assert.ok(QUIZ3D_FOV_DEG > 0 && QUIZ3D_FOV_DEG <= 12);
  assert.ok(QUIZ3D_OPTION_FONT_PX >= 20);
  assert.ok(QUIZ3D_PROMPT_FONT_PX >= 22);
});

test("rectToWorld: 1 világegység = 1 CSS px a z = 0 síkon, origó a vászon közepén, y felfelé", () => {
  assert.deepEqual(rectToWorld({ left: 0, top: 0, width: 100, height: 50 }, 400, 300), { x: -150, y: 125, w: 100, h: 50 });
  assert.deepEqual(rectToWorld({ left: 150, top: 125, width: 100, height: 50 }, 400, 300), { x: 0, y: 0, w: 100, h: 50 });
  // A kamera távolsága a FOV-ból: a z = 0 sík látható magassága pontosan a vászon magassága.
  const d = cameraDistanceFor(600, QUIZ3D_FOV_DEG);
  assert.ok(Math.abs(2 * d * Math.tan(((QUIZ3D_FOV_DEG / 2) * Math.PI) / 180) - 600) < 1e-6);
});

test("wrapLines: szóhatáron tör, nem vág le szót, a sor elfér (ha egy szó elfér)", () => {
  const measure = (s: string) => s.length * 10;
  assert.deepEqual(wrapLines("egy kettő három négy", 100, measure), ["egy kettő", "három négy"]);
  assert.deepEqual(wrapLines("egy kettő három négy", 90, measure), ["egy kettő", "három", "négy"]);
  assert.deepEqual(wrapLines("rövid", 100, measure), ["rövid"]);
  const long = wrapLines("A könyvtárban csendben kell lennünk.", 160, measure);
  assert.equal(long.join(" "), "A könyvtárban csendben kell lennünk.");
  for (const line of long) assert.ok(measure(line) <= 160 || !line.includes(" "), line);
  assert.deepEqual(wrapLines("", 100, measure), [""]);
});

test("quiz3dEnabled: low szinten vagy WebGL nélkül a DOM-kártya marad", () => {
  assert.equal(quiz3dEnabled("low", true), false);
  assert.equal(quiz3dEnabled("medium", false), false);
  assert.equal(quiz3dEnabled("high", false), false);
  assert.equal(quiz3dEnabled("medium", true), true);
  assert.equal(quiz3dEnabled("high", null), true, "a próba alatt a 3D réteg indulhat");
});
