import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * S13 — az átfogó review (K1, K3, L1, L3) és az S13 C-ellenőrzőlista (C9, C10) leleteinek forrásőrei.
 * A viselkedést a böngészős mérő igazolja (`game-mobile-quality.spec.ts` „K1 K3 szünet a magyarázókártya fölött”
 * mind a 7 játékon); ezek az őrök a javítás kódbeli horgonyát tartják meg egy átrendezésnél.
 */
const root = fileURLToPath(new URL("../client/src/", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Egy függvény törzse a nyitó sorától a következő, azonos behúzású lezárásig (elég a horgonyokhoz). */
function body(src: string, start: RegExp, len = 1200): string {
  const i = src.search(start);
  assert.ok(i >= 0, `nincs: ${start}`);
  return src.slice(i, i + len);
}

test("K1: a PauseMenu és a ResultScreen a közös useModalLayer-t használja (inert háttér, fókuszcsapda)", () => {
  for (const f of ["game-engine/mobile/PauseMenu.tsx", "game-engine/mobile/ResultScreen.tsx"]) {
    assert.match(strip(read(f)), /useModalLayer\(open, layerRef, dialogRef\)/, f);
  }
  const layer = strip(read("game-engine/mobile/modalLayer.ts"));
  assert.match(layer, /setAttribute\("inert", ""\)/);
  assert.match(layer, /addEventListener\("focusin", keepFocus, true\)/);
  assert.match(layer, /e\.key !== "Tab"/);
  // a kupon-lejárati réteget soha nem teszi inertté (az mindenek fölött marad)
  assert.match(layer, /isCouponLayer\(el\)/);
});

test("K1: a Szökőár, a Brain Rot és az Aszteroida válaszkezelője szünetben nem fogad el választ", () => {
  assert.match(body(strip(read("pages/TsunamiEscapeEnglish.tsx")), /const onAnswer = \(index: number\) => \{/, 200), /if \(!quiz \|\| paused\) return;/);
  assert.match(body(strip(read("pages/BrainRotSteal.tsx")), /const onAnswer = useCallback\(/, 300), /if \(pausedRef\.current\) return;/);
  assert.match(body(strip(read("pages/SpaceAsteroidQuiz.tsx")), /const onAnswer = \(idx: number\) => \{/, 300), /pausedRef\.current\) return;/);
});

test("K3: a magyarázókártya szünetben rejtve (nem látszik, nem fogad billentyűt, nem zár magától)", () => {
  const card = strip(read("game-engine/QuizFeedbackCard.tsx"));
  assert.match(card, /const pausedByMenu = usePauseMenuOpen\(\);/);
  assert.match(card, /if \(pausedByMenu\) return null;/);
  assert.match(card, /if \(card\.outcome !== "correct" \|\| pausedByMenu\) return;/);
  assert.match(strip(read("game-engine/mobile/PauseMenu.tsx")), /setPauseMenuOpen\(true\)/);
  const css = read("index.css");
  assert.match(css, /--game-z-overlay: 80;/);
  assert.match(css, /--game-z-feedback: 90;/);
  assert.match(css, /\.game-overlay \{[^}]*z-index: var\(--game-z-overlay, 80\)/);
});

test("C10: a Brain Rot kvízrétegén saját szünetgomb van (a z-60-as réteg takarja a HUD-ot)", () => {
  const src = strip(read("pages/BrainRotSteal.tsx"));
  assert.match(src, /data-testid="br-quiz-pause"[\s\S]{0,80}onClick=\{pause\}/);
});

test("C9: Tornado — horgonyzott állapotban nincs új horgony-kvíz, és az eredmény bezárja a nyitott kvízt", () => {
  const src = strip(read("pages/TornadoHunter200.tsx"));
  assert.match(body(src, /tryAnchorRef\.current = \(\) => \{/, 300), /if \(playerRef\.current\.anchored\) return;/);
  assert.match(body(src, /const finishRun = useCallback\(/, 2000), /setActiveQuiz\(null\);/);
});

test("L1: a Szökőár a tananyag-kérdés válaszát nem írja a közös szóbank-naplóba", () => {
  const src = strip(read("pages/TsunamiEscapeEnglish.tsx"));
  assert.match(src, /!materialPromptsRef\.current\.has\(q\.prompt\)/);
});

test("L3: a kupon-visszaszámláló a biztonsági sávon belül, a HUD-ot maga alá tolja", () => {
  const hud = strip(read("game-engine/CouponHud.tsx"));
  assert.match(hud, /game-coupon-hud/);
  assert.doesNotMatch(hud, /\btop-3\b/);
  const css = read("index.css");
  assert.match(css, /\.game-coupon-hud \{ top: max\(12px, var\(--game-safe-top\)\); \}/);
  assert.match(css, /:root:has\(\.game-coupon-hud\) \.game-hud \{ margin-top:/);
});

test("B6: mind a 7 játék az eredménykártya közös jelvény-sorát használja, a toast az eredmény alatt nem rajzol", () => {
  for (const p of [
    "pages/BlockCraftQuiz.tsx",
    "pages/BrainRotSteal.tsx",
    "pages/SpaceAsteroidQuiz.tsx",
    "pages/SpeedQuizMath.tsx",
    "pages/TornadoHunter200.tsx",
    "pages/TsunamiEscapeEnglish.tsx",
    "pages/WordLadderHuEn.tsx",
  ]) {
    const src = strip(read(p));
    const results = src.match(/<ResultScreen\b/g)?.length ?? 0;
    const withBadges = src.match(/<ResultScreen\s+badges=\{(?:props\.)?newlyUnlocked\}/g)?.length ?? 0;
    assert.ok(results > 0 && withBadges === results, `${p}: ${withBadges}/${results} ResultScreen kapja a badges-t`);
    // a lapszintű saját jelvény-sor megszűnt (a közös sor helyett)
    assert.doesNotMatch(src, /tsunami-new-badges|"Új jelvények" : "Új jelvény"/, p);
  }
  const screen = strip(read("game-engine/mobile/ResultScreen.tsx"));
  assert.match(screen, /<ResultBadges badges=\{badges\} \/>/);
  assert.match(screen, /setResultScreenOpen\(true\)/);
  const toast = strip(read("components/AchievementToast.tsx"));
  assert.match(toast, /const resultOpen = useResultScreenOpen\(\);/);
  assert.match(toast, /pointer-events-none fixed/);
  assert.doesNotMatch(toast, /\btop-20\b/);
});
