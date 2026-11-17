import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHOCKWAVE_DURATION,
  SHOCKWAVE_GROWTH,
  SHOCKWAVE_START_OPACITY,
  shockwaveFrame,
} from "../client/src/game-engine/scenes/spaceBackdrop";

/**
 * S10 — Galaktikus Aszteroida a közös mobilos kereten (terv 4.5, 4.6/6; végrehajtás S10 4–8. lépés) és a más
 * játék-PR-okon mért review-leletek (#426 elavult időzítők, mindig elérhető szünet; #422 beragadó vezérlés).
 * Forrásőr (kommentek nélkül, #183) + a lökéshullám tiszta időfüggvénye.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const page = stripComments(readFileSync(join(root, "client/src/pages/SpaceAsteroidQuiz.tsx"), "utf8"));

function body(name: string): string {
  const start = page.search(new RegExp(`const ${name} = (useCallback\\()?\\(`));
  assert.ok(start >= 0, `nincs ${name}`);
  const end = page.indexOf("\n  };", start) >= 0 ? page.indexOf("\n  }", start) : -1;
  return page.slice(start, end > start ? end : start + 2000);
}

/* ------------------------------- lökéshullám ------------------------------- */

test("lökéshullám: 0 → 2,2× sugár 260 ms alatt, átlátszóság 0,8 → 0", () => {
  assert.equal(SHOCKWAVE_DURATION, 0.26);
  assert.equal(SHOCKWAVE_GROWTH, 2.2);
  assert.equal(SHOCKWAVE_START_OPACITY, 0.8);
  const r = 1.25;
  const start = shockwaveFrame(0, r);
  assert.equal(start.scale, 0);
  assert.equal(start.opacity, 0.8);
  assert.equal(start.done, false);
  const end = shockwaveFrame(SHOCKWAVE_DURATION, r);
  // A sprite mérete átmérő: 2 × 2,2 × r.
  assert.ok(Math.abs(end.scale - 2 * 2.2 * r) < 1e-9, `scale=${end.scale}`);
  assert.equal(end.opacity, 0);
  assert.equal(end.done, true);
  const mid = shockwaveFrame(SHOCKWAVE_DURATION / 2, r);
  assert.ok(mid.scale > 0 && mid.scale < end.scale);
  assert.ok(mid.opacity > 0 && mid.opacity < 0.8);
  // Monoton tágul és halványul.
  let prev = shockwaveFrame(0, r);
  for (let i = 1; i <= 26; i++) {
    const f = shockwaveFrame(i / 100, r);
    assert.ok(f.scale >= prev.scale && f.opacity <= prev.opacity, `t=${i / 100}`);
    prev = f;
  }
});

/* ------------------------------- keret ------------------------------- */

test("a lap a közös keretet használja (GameShell, GameHud, PauseMenu, ResultScreen, StartScreen)", () => {
  assert.match(page, /from "@\/game-engine\/mobile"/);
  for (const name of ["GameShell", "GameHud", "PauseMenu", "ResultScreen", "StartScreen"]) {
    assert.match(page, new RegExp(`<${name}\\b`), `nincs <${name}>`);
  }
  assert.match(page, /<GameShell[\s\S]{0,80}gameId="SpaceAsteroidQuiz"/);
  assert.match(page, /<ResultScreen[\s\S]{0,120}testId="sa-over"/);
  assert.match(page, /startTestId="sa-start"/);
});

test("érintés-észlelés: useTouchCapable (useCoarsePointer helyett), képernyőhöz méretezett vezérlők", () => {
  assert.doesNotMatch(page, /useCoarsePointer/);
  assert.match(page, /useTouchCapable\(\)/);
  assert.match(page, /<VirtualJoystick[\s\S]{0,80}radius="auto"/);
  assert.match(page, /<VirtualJoystick[\s\S]{0,120}resetSignal=\{joyReset\}/);
  assert.match(page, /<HoldButton[\s\S]{0,60}size="auto"/);
  assert.doesNotMatch(page, /h-\[108px\]/, "a fix 108 px-es tűzgomb maradt");
  assert.match(page, /data-testid="sa-touch-controls"\s*data-game-controls/);
  assert.match(page, /className=\{`game-action-btn[^`]*`\}\s*data-testid="button-bomb"/, "a bomba nem akciógomb a vezérlősávban");
});

/* ------------------------------- szünet ------------------------------- */

// SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J6a 3.: „a `"quiz"` fázis és a modál megszűnik”;
// K.2: a `sa-quiz-pause` testid a kérdés-sáv `pauseTestId` propján él): a teljes képernyős kvízréteg megszűnt, ezért a szünetgomb a
// NEM modális kérdés-sávon van (`InlineQuestion` `pauseTestId` + `onPause`) — a követelmény változatlan: a kérdés alatt is meg lehet állni.
test("szünet: HUD-gomb, automatikus szünet, a kérdés-sáv saját szünetgombja, P billentyű", () => {
  assert.match(page, /<GameHud[\s\S]{0,120}onPause=\{pauseGame\}/);
  assert.match(page, /onAutoPause=\{pauseGame\}/);
  assert.match(page, /pauseTestId="sa-quiz-pause"[\s\S]{0,60}onPause=\{pauseGame\}/);
  assert.match(page, /<PauseMenu open=\{paused && inRun\} onResume=\{resumeGame\} onRestart=\{startNewRun\} onExit=\{endRound\}/);
  assert.match(page, /if \(pausedRef\.current\) resumeGame\(\);\s*else pauseGame\(\);/);
  // SPEC-VÁLTOZÁS 2026-11-17 (J6a 3.): nincs „quiz” fázis — a kérdés a `play` alatti al-állapot, a szünet bármikor kérhető a `play`-ben.
  assert.match(body("pauseGame"), /if \(phaseRef\.current !== "play"\) return;/);
  // (a `forceState({ phase: "quiz" })` kompatibilis álnév marad — K.2 —, de nincs `quiz` FÁZIS és nincs `setPhase("quiz")`)
  assert.doesNotMatch(page, /type Phase = [^;]*"quiz"|setPhase("quiz")|phaseRef.current === "quiz"/, "a „quiz” fázis megszűnt (J6a)");
});

test("szünetkor és fókuszvesztéskor a vezérlés elenged (touchRef, keysRef, joystick)", () => {
  const rel = body("releaseControls");
  assert.match(rel, /keysRef\.current\[k\] = false/);
  assert.match(rel, /touchRef\.current\[k\] = false/);
  assert.match(rel, /setJoyReset\(/);
  assert.match(page, /if \(paused\) releaseControls\(\);/);
  assert.match(page, /const onBlur = \(\) => releaseControls\(\);/);
});

// SPEC-VÁLTOZÁS 2026-11-17 (J6a 3.: „`ROUND_LIMIT_SEC` óra megszűnik”, életalapú vég): a kör-óra (`setInterval`) megszűnt, az erő- és a
// pajzs-időzítő a tick-ben, JÁTÉKIDŐBEN fogy (a meghajtó szünetben és a „Miért?” alatt nem lépteti a világot) — a követelmény
// változatlan: szünetben egyik óra sem megy.
test("nincs kör-óra; az erő- és a pajzs-időzítő a tick-ben fogy, szünetben és a „Miért?” alatt áll", () => {
  assert.doesNotMatch(page, /ROUND_LIMIT_SEC|setInterval\(/, "a kör-óra / valós idejű időzítő megszűnt (életalapú vég)");
  assert.match(page, /powerTimerRef\.current = Math\.max\(0, powerTimerRef\.current - dt\);/, "az erő-időzítő nem a tick-ben fogy");
  assert.match(page, /shieldTimerRef\.current = Math\.max\(0, shieldTimerRef\.current - dt\);/, "a pajzs-időzítő nem a tick-ben fogy");
  assert.match(page, /if \(phaseRef\.current !== "play" \|\| pausedRef\.current\) \{/, "a tick nem áll szünetben");
  assert.match(page, /pausedRef\.current = paused \|\| whyOpen;/, "a „Miért?” nem szünetelteti a játékot");
  assert.match(page, /driver\.frame\(realDt, pausedRef\.current\)/, "a meghajtó nem kapja meg a szünetet");
  assert.match(body("detonateBomb"), /phaseRef\.current !== "play" \|\| pausedRef\.current/);
});

/* --------------------------- elavult időzítők (#426) --------------------------- */

test("új futás / kör vége / menü: új futás-azonosító és a függő időzítők törlése", () => {
  for (const fn of ["startNewRun", "endRound", "backToMenu"]) {
    const b = body(fn);
    assert.match(b, /runIdRef\.current \+= 1;/, `${fn}: nem lép új futás-azonosítóra`);
    assert.match(b, /clearPendingTimeouts\(\);/, `${fn}: nem törli a függő időzítőket`);
  }
  assert.match(body("pushRunTimeout"), /if \(runIdRef\.current !== runId\) return;/);
});

// SPEC-VÁLTOZÁS 2026-11-17 (J6a 3.): nincs kvíz-fázis — a robbanás utáni eredmény-váltás a szünetben vár ki (a „Miért?” szünet is).
test("a győzelmi robbanás utáni eredmény-váltás futáshoz kötött, és szünet alatt kivár", () => {
  assert.doesNotMatch(page, /pushTimeout\(\(\) => setPhase\("over"\)/, "kötetlen késleltetett fázisváltás maradt");
  const fin = body("finishRunAfter");
  assert.match(fin, /pushRunTimeout\(/);
  assert.match(fin, /if \(pausedRef\.current\) \{\s*finishRunAfter\(250\);/);
  assert.match(fin, /if \(phaseRef\.current !== "play"\) return;/);
  assert.match(page, /finishRunAfter\(1500\)/);
});

/* --------------------------- visszajelzés (M9, M10) --------------------------- */

test("rezgés: rossz válasz error, jó success, találat / robbanás hit", () => {
  assert.match(page, /sfxError\(\);\s*haptics\("error"\);/);
  assert.match(page, /sfxSuccess\(\);\s*haptics\("success"\);/);
  assert.ok((page.match(/haptics\("hit"\)/g) ?? []).length >= 4, "találat, robbanás, ütközés, bomba");
});

test("csökkentett mozgás: nincs kristály-rázás, kevesebb részecske, a kamera-rázás marad kikapcsolva", () => {
  assert.match(page, /if \(!reducedMotionRef\.current\) \{\s*setWrongShake\(true\);/);
  assert.ok((page.match(/motionScale\(reducedMotionRef\.current\)\.particles/g) ?? []).length >= 4);
  // SPEC-VÁLTOZÁS 2026-11-17 (J6a, K.5 KSZ-10): a kamera-rázás a közös `feel`-en át megy (trauma², plafon), nem saját `shakeRef`-fel;
  // csökkentett mozgásnál továbbra is kikapcsolt (a feltétel a `feel.shakeOffset` hívásán).
  assert.match(page, /feel && !reducedMotionRef\.current && phaseRef\.current === "play"/);
  assert.doesNotMatch(page, /shakeRef/, "saját rázás-állapot maradt (KSZ-10: csak a feel.addTrauma)");
});

test("látványosabb robbanás: lökéshullám ellenségre, bossra és bombára", () => {
  const destroyed = page.slice(page.indexOf("const handleEnemyDestroyed"), page.indexOf("const handleHit"));
  assert.ok((destroyed.match(/spawnShockwave\(/g) ?? []).length >= 3, "ellenség + boss (2 gyűrű)");
  assert.ok((body("detonateBomb").match(/spawnShockwave\(/g) ?? []).length >= 2, "bomba");
});
