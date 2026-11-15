import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * S7 forrásőr (docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md, S7 „Megírandó teszt”):
 * a Gyors matek sprint a közös mobilos keretre épül (terv 4.5), és a 4.6/4 elvárásai a lapon maradnak.
 * A kommenteket kivágjuk, hogy egy kikommentezett hívás ne számítson bekötésnek (#183 osztály).
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(readFileSync(join(root, "client/src/pages/SpeedQuizMath.tsx"), "utf8"));

test("SpeedQuizMath: a közös keret elemei a lapon (GameShell, GameHud, PauseMenu, ResultScreen, StartScreen)", () => {
  assert.match(code, /from\s+"@\/game-engine\/mobile"/, "a keret importja hiányzik");
  for (const tag of ["GameShell", "GameHud", "PauseMenu", "ResultScreen", "StartScreen"]) {
    assert.match(code, new RegExp(`<${tag}\\b`), `<${tag}> nincs a JSX-ben`);
  }
  assert.match(code, /<GameShell[\s\S]{0,80}gameId="SpeedQuizMath"/, "a data-game értéke nem a meglévő SpeedQuizMath");
  assert.match(code, /onAutoPause=\{/, "háttérbe kerüléskor nincs automatikus szünet");
});

test("SpeedQuizMath: rezgés és csökkentett mozgás", () => {
  assert.match(code, /useHaptics\s*\(/, "useHaptics hívás hiányzik");
  assert.match(code, /haptics\(\s*"error"\s*\)/, "rossz válaszra nincs hibarezgés");
  assert.match(code, /haptics\(\s*"success"\s*\)/, "jó válaszra nincs sikerrezgés");
  assert.match(code, /useReducedMotion\s*\(/, "useReducedMotion hívás hiányzik");
});

test("SpeedQuizMath: a válaszgombok a közös game-answer-btn osztályt kapják", () => {
  const answers = code.slice(code.indexOf('data-testid="sq-answers"'));
  assert.ok(answers.length > 0, "sq-answers nincs a lapon");
  assert.match(answers.slice(0, 2000), /game-answer-btn/, "a válaszgombokon nincs game-answer-btn");
});

test("SpeedQuizMath: szünetben az időzítő nem fogy", () => {
  const start = code.search(/const id = window\.setInterval\(/);
  assert.ok(start >= 0, "nem találom a játék időzítőjét — a teszt elavult");
  const head = code.slice(Math.max(0, start - 600), start);
  assert.match(head, /if\s*\(\s*paused\s*\)\s*return;/, "az intervallum szünetben is futna");
  assert.match(head, /if\s*\(\s*feedback\s*\)\s*return;/, "a magyarázat alatti óramegállás elveszett");
});

test("SpeedQuizMath: a meglévő testid-k megmaradnak", () => {
  for (const id of ["sq-won", "sq-over", "sq-start", "sq-answers", "sq-score"]) {
    assert.ok(code.includes(`"${id}"`), `hiányzik a(z) ${id} testid`);
  }
  assert.match(code, /retryLabel="Új futam"/, "az e2e „Új futam” gombfelirata elveszett");
});
