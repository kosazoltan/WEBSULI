import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { attachAutoPause, type AutoPauseTarget } from "../client/src/game-engine/mobile/autoPause";
import { GAME_BEST_KEY, readBest, writeBest } from "../client/src/game-engine/mobile/bestScore";
import { controlRadiusFor } from "../client/src/game-engine/mobile/controlSize";
import { HAPTIC_PATTERNS, shouldVibrate } from "../client/src/game-engine/mobile/haptics";
import { orientationFrom } from "../client/src/game-engine/mobile/orientation";
import { computeStars } from "../client/src/game-engine/mobile/stars";
import { detectTouchCapable } from "../client/src/game-engine/mobile/touch";
import type { StorageLike } from "../client/src/game-engine/mobile/types";

/**
 * S2 — a közös mobilos játékkeret tiszta függvényei
 * (docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md K.7.3, S2 „Megírandó tesztek”).
 * Az elvárások a szerződés képleteiből vannak levezetve (kommentben a számítás), nem a kimenetből.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ------------------------------ érintés (M5) ------------------------------ */

test("detectTouchCapable: 16 kombináció igazságtáblája (bármelyik jel elég)", () => {
  for (let mask = 0; mask < 16; mask++) {
    const env = {
      anyPointerCoarse: Boolean(mask & 1),
      pointerCoarse: Boolean(mask & 2),
      hoverNone: Boolean(mask & 4),
      maxTouchPoints: mask & 8 ? 5 : 0,
    };
    // Szabály: anyPointerCoarse || pointerCoarse || hoverNone || maxTouchPoints > 0 → csak a 0-s maszk hamis.
    assert.equal(detectTouchCapable(env), mask !== 0, `mask=${mask} ${JSON.stringify(env)}`);
  }
});

test("detectTouchCapable: érintős laptop (csak maxTouchPoints: 5) → érintős; minden hamis és 0 → nem", () => {
  assert.equal(
    detectTouchCapable({ anyPointerCoarse: false, pointerCoarse: false, hoverNone: false, maxTouchPoints: 5 }),
    true,
  );
  assert.equal(
    detectTouchCapable({ anyPointerCoarse: false, pointerCoarse: false, hoverNone: false, maxTouchPoints: 0 }),
    false,
  );
});

/* ------------------------------ rezgés (M10) ------------------------------ */

test("shouldVibrate: csak supported && !muted && !reducedMotion (8 kombináció)", () => {
  for (let mask = 0; mask < 8; mask++) {
    const env = { supported: Boolean(mask & 1), muted: Boolean(mask & 2), reducedMotion: Boolean(mask & 4) };
    assert.equal(shouldVibrate(env), mask === 1, JSON.stringify(env));
  }
});

test("HAPTIC_PATTERNS: a rossz válasz mintája [30, 40, 30], a többi a szerződés szerint", () => {
  assert.deepEqual(HAPTIC_PATTERNS.error, [30, 40, 30]);
  assert.equal(HAPTIC_PATTERNS.tap, 8);
  assert.equal(HAPTIC_PATTERNS.success, 18);
  assert.equal(HAPTIC_PATTERNS.hit, 12);
});

/* ------------------------------- tájolás --------------------------------- */

test("orientationFrom: szélesebb → fekvő, magasabb vagy négyzet → álló", () => {
  assert.equal(orientationFrom(844, 390), "landscape");
  assert.equal(orientationFrom(390, 844), "portrait");
  assert.equal(orientationFrom(500, 500), "portrait");
});

/* --------------------------- automatikus szünet (M6) --------------------------- */

function makeTarget(): { target: AutoPauseTarget; doc: EventTarget & { visibilityState: string }; win: EventTarget } {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win = new EventTarget();
  return { target: { doc, win }, doc, win };
}

test("attachAutoPause: hidden + visibilitychange, pagehide, orientationchange → szünet; visible → nem; leiratkozás után semmi", () => {
  const { target, doc, win } = makeTarget();
  let calls = 0;
  const detach = attachAutoPause(target, () => {
    calls++;
  });

  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 0, "visszatérés (visible) nem szünetel");

  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 1, "háttérbe kerülés");

  win.dispatchEvent(new Event("pagehide"));
  assert.equal(calls, 2, "pagehide");

  win.dispatchEvent(new Event("orientationchange"));
  assert.equal(calls, 3, "orientationchange");

  detach();
  doc.dispatchEvent(new Event("visibilitychange"));
  win.dispatchEvent(new Event("pagehide"));
  win.dispatchEvent(new Event("orientationchange"));
  assert.equal(calls, 3, "leiratkozás után nincs több hívás");
});

/* ------------------------------- csillagok (M7) ------------------------------- */

test("computeStars: arány = jó/összes; győzelem és ≥ 0,9 → 3; ≥ 0,7 → 2; különben 1", () => {
  assert.equal(computeStars({ correct: 9, total: 10, won: true }), 3); // 0,9 és győzelem
  assert.equal(computeStars({ correct: 9, total: 10, won: false }), 2); // 0,9, de vereség → csak a ≥ 0,7 ág
  assert.equal(computeStars({ correct: 7, total: 10, won: true }), 2); // 0,7
  assert.equal(computeStars({ correct: 6, total: 10, won: true }), 1); // 0,6
  assert.equal(computeStars({ correct: 0, total: 0, won: true }), 1); // total 0 → arány 0
});

/* ---------------------------- vezérlőméret (4.5) ---------------------------- */

test("controlRadiusFor: round(min(w, h) × 0,16), 52–76 közé vágva", () => {
  assert.equal(controlRadiusFor({ width: 360, height: 640 }), 58); // 360 × 0,16 = 57,6 → 58
  assert.equal(controlRadiusFor({ width: 390, height: 844 }), 62); // 390 × 0,16 = 62,4 → 62
  assert.equal(controlRadiusFor({ width: 844, height: 390 }), 62); // a rövidebb oldal számít
  assert.equal(controlRadiusFor({ width: 320, height: 480 }), 52); // 51,2 → 51 → alsó határ 52
  assert.equal(controlRadiusFor({ width: 1366, height: 768 }), 76); // 122,88 → felső határ 76
});

/* ---------------------------- legjobb eredmény ---------------------------- */

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => {
      data.set(k, String(v));
    },
  };
}

test("readBest / writeBest: memória-tárolón játékonként külön, csak a jobb eredmény íródik", () => {
  const s = memoryStorage();
  assert.equal(readBest(s, "a"), null);
  assert.deepEqual(writeBest(s, "a", 120), { best: 120, isNewBest: true });
  assert.deepEqual(writeBest(s, "a", 80), { best: 120, isNewBest: false });
  assert.deepEqual(writeBest(s, "a", 150), { best: 150, isNewBest: true });
  assert.deepEqual(writeBest(s, "b", 10), { best: 10, isNewBest: true });
  assert.equal(readBest(s, "a"), 150);
  assert.equal(readBest(s, "b"), 10);
  assert.deepEqual(JSON.parse(s.data.get(GAME_BEST_KEY) as string), { a: 150, b: 10 });
});

test("readBest / writeBest: sérült JSON és hiányzó tároló → null, nincs kivétel", () => {
  const s = memoryStorage();
  s.data.set(GAME_BEST_KEY, "{nem json");
  assert.equal(readBest(s, "a"), null);
  assert.equal(readBest(null, "a"), null);
  assert.deepEqual(writeBest(null, "a", 7), { best: 7, isNewBest: true });
});

test("readBest / writeBest: kivételt dobó tárolón kivétel nélkül { best: score, isNewBest: true }", () => {
  const throwing: StorageLike = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(readBest(throwing, "a"), null);
  assert.deepEqual(writeBest(throwing, "a", 42), { best: 42, isNewBest: true });
});

test("writeBest: az első, 0 pontos futás tárolódik, de nem „Új rekord!” (S13 / review L5)", () => {
  const s = memoryStorage();
  assert.deepEqual(writeBest(s, "a", 0), { best: 0, isNewBest: false });
  assert.equal(readBest(s, "a"), 0);
  // utána az első pozitív eredmény már rekord
  assert.deepEqual(writeBest(s, "a", 5), { best: 5, isNewBest: true });
  assert.deepEqual(writeBest(s, "a", 0), { best: 5, isNewBest: false });
});

/* -------------------------------- forrásőr -------------------------------- */

test("forrásőr: a useCoarsePointer az új useTouchCapable-t hívja", () => {
  const src = strip(readFileSync(join(root, "client/src/hooks/useCoarsePointer.ts"), "utf8"));
  assert.match(src, /export function useCoarsePointer\(\)/);
  assert.match(src, /return useTouchCapable\(\)/);
});

test("forrásőr: a touch.ts mind a négy jelet olvassa", () => {
  const src = strip(readFileSync(join(root, "client/src/game-engine/mobile/touch.ts"), "utf8"));
  assert.match(src, /any-pointer: coarse/);
  assert.match(src, /\(pointer: coarse\)/);
  assert.match(src, /hover: none/);
  assert.match(src, /maxTouchPoints/);
});

test("forrásőr: a maxTouchPoints csak érintés-esemény támogatással számít (érintőkijelzős gépen egérrel mért hamis jel)", () => {
  const src = strip(readFileSync(join(root, "client/src/game-engine/mobile/touch.ts"), "utf8"));
  // Mért 2026-11-15: érintés nélküli Chrome-környezetben maxTouchPoints = 10, any-pointer: coarse hamis,
  // ontouchstart nincs → a nyers maxTouchPoints egérrel is érintővezérlőt adott (games-pointer-controls bukott).
  assert.match(src, /"ontouchstart" in window/);
});
