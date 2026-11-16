import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * S2 utójavítás (#433, Codex-komment 4581035479): a kupon-lejárati párbeszéd rétege a
 * közös mobilos fedőréteg (`.game-overlay`) fölött van, és portálon renderelődik.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = read("../client/src/index.css");
const hud = read("../client/src/game-engine/CouponHud.tsx");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function zOf(selector: string): number {
  const escaped = selector.replace(/[.]/g, String.raw`\.`);
  const m = css.match(new RegExp(String.raw`${escaped}\s*\{[^}]*?z-index:\s*([^;]+);`));
  assert.ok(m, `${selector} z-indexe hiányzik`);
  const raw = m[1].trim();
  const v = raw.match(/^var\(--([\w-]+)(?:,\s*(\d+))?\)$/);
  if (!v) return Number(raw);
  const def = css.match(new RegExp(String.raw`--${v[1]}:\s*(\d+)`));
  assert.ok(def, `--${v[1]} nincs definiálva`);
  return Number(def[1]);
}

test("a lejárati réteg z-indexe nagyobb a .game-overlay-énél és a kvíz-visszajelzésénél", () => {
  const expired = zOf(".game-coupon-expired");
  assert.ok(expired > zOf(".game-overlay"), `lejárat ${expired} <= game-overlay`);
  const quiz = Number(read("../client/src/game-engine/QuizFeedbackCard.tsx").match(/z-\[(\d+)\]/)?.[1]);
  assert.ok(expired > quiz, `lejárat ${expired} <= kvíz-visszajelzés ${quiz}`);
});

test("a lejárati réteg a közös CSS-osztályt használja, nem beégetett Tailwind z-t, és portálon renderelődik", () => {
  const body = strip(hud).slice(strip(hud).indexOf("export function CouponExpiredOverlay"));
  assert.match(body, /game-coupon-expired/);
  assert.doesNotMatch(body, /\bz-\d+\b|z-\[\d+\]/);
  assert.match(body, /createPortal\(/);
  assert.match(body, /document\.body/);
  assert.match(body, /aria-modal="true"/);
  assert.match(body, /min-h-12/);
});

test("a lejárati réteg teljes képernyős, a biztonsági sávot a --game-safe-* változókon át tartja", () => {
  const rule = css.match(/\.game-coupon-expired\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /position:\s*fixed;\s*inset:\s*0/);
  assert.match(rule, /--game-safe-top/);
  assert.match(rule, /--game-safe-bottom/);
  assert.doesNotMatch(rule, /pointer-events:\s*none/);
});

test("a lejárati párbeszéd a billentyűket capture fázisban elnyeli, az alsó rétegeket inertté teszi", () => {
  const body = strip(hud).slice(strip(hud).indexOf("export function CouponExpiredOverlay"));
  assert.match(body, /addEventListener\("keydown", onKey, true\)/);
  assert.match(body, /addEventListener\("keyup", onKey, true\)/);
  assert.match(body, /stopPropagation\(\)/);
  assert.match(body, /setAttribute\("inert"/);
  assert.match(body, /gameCouponExpired/);
});
