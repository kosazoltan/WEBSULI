import assert from "node:assert/strict";
import test from "node:test";

import { TAP_STILL_PX, TAP_UP_SLOP_PX, createPointerTapTracker, pointerTapHandlers, type TapRect } from "../client/src/game-engine/play/pointerTap";

/**
 * Közös utójavítás c (kanban #51; J4a pilot) — érintés mozgó célpontra: felengedéskor véglegesít a cél AKTUÁLIS dobozán
 * belül vagy alig mozdult ujjnál; elhúzás / pointercancel = visszavonás; mutatónként; billentyűzet a `click` `detail === 0`-ján.
 */

const RECT: TapRect = { left: 100, top: 100, right: 180, bottom: 160 };

test("sima koppintás a célon → választ", () => {
  const t = createPointerTapTracker();
  t.down(1, 140, 130, 0);
  assert.equal(t.up(1, 141, 131, 0, RECT), true);
  assert.equal(t.pressed(), 0);
});

test("lenyomás a célon → elhúzás → felengedés máshol = visszavonás (implicit capture mellett is)", () => {
  const t = createPointerTapTracker();
  t.down(1, 140, 130, 0);
  assert.equal(t.up(1, 140, 130 + 60 + TAP_UP_SLOP_PX + 20, 0, RECT), false);
});

test("a cél elrepült az ujj alól, de az ujj nem mozdult → érvényes", () => {
  const t = createPointerTapTracker();
  t.down(1, 140, 130, 0);
  const moved: TapRect = { left: 300, top: 300, right: 380, bottom: 360 };
  assert.equal(t.up(1, 140 + TAP_STILL_PX - 1, 130, 0, moved), true);
  t.down(2, 140, 130, 0);
  assert.equal(t.up(2, 140 + TAP_STILL_PX + 5, 130, 0, moved), false, "elmozdult cél + elhúzott ujj = visszavonás");
});

test("tűrés a doboz szélén; pointercancel = visszavonás; más célon felengedés nem választ", () => {
  const t = createPointerTapTracker();
  t.down(1, 105, 105, 0);
  assert.equal(t.up(1, RECT.right + TAP_UP_SLOP_PX - 1, 105, 0, RECT), true, "a dobozon kívül, de a tűrésen belül");
  t.down(2, 140, 130, 0);
  t.cancel(2);
  assert.equal(t.up(2, 140, 130, 0, RECT), false);
  t.down(3, 140, 130, 0);
  assert.equal(t.up(3, 140, 130, 1, RECT), false, "a lenyomás másik célé volt");
});

test("több ujj: két mutató két célon egymástól függetlenül (a válasz idempotenciája a directoré)", () => {
  const t = createPointerTapTracker();
  t.down(1, 140, 130, 0);
  t.down(2, 400, 130, 1);
  assert.equal(t.pressed(), 2);
  assert.equal(t.up(2, 400, 131, 1, { left: 360, top: 100, right: 440, bottom: 160 }), true);
  assert.equal(t.up(1, 140, 131, 0, RECT), true);
});

test("pointerTapHandlers: felengedésre választ, `click` csak billentyűzetnél (detail 0), onDown elnyelheti a lenyomást", () => {
  const t = createPointerTapTracker();
  let taps = 0;
  const ev = (pointerId: number, x: number, y: number) => ({ pointerId, clientX: x, clientY: y, currentTarget: { getBoundingClientRect: () => RECT }, stopPropagation: () => {} });
  const h = pointerTapHandlers(t, 0, () => (taps += 1));
  h.onPointerDown(ev(1, 140, 130));
  h.onPointerUp(ev(1, 140, 130));
  h.onClick({ detail: 1 }); // az egér-kattintás `click`-je: már választott a pointerup
  assert.equal(taps, 1);
  h.onClick({ detail: 0 }); // Enter / Szóköz
  assert.equal(taps, 2);
  const eaten = pointerTapHandlers(t, 0, () => (taps += 1), { onDown: () => true });
  eaten.onPointerDown(ev(5, 140, 130));
  eaten.onPointerUp(ev(5, 140, 130));
  assert.equal(taps, 2, "az elnyelt lenyomás felengedése nem választ");
});
