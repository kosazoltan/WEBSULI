import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * J0a — determinizmus-őr (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J0a 4. lépés, K.4/12, KSZ-1/2; terv J19).
 *
 * A szimulációs mag (seedelt RNG, fix lépésű hurok, Director, tanulási mag, párbaj-szabálymotor, a játékok `sim.ts` /
 * `core.ts` magja) csak akkor visszajátszható és párbajban igazságos, ha nem olvas órát, nem hív `Math.random`-ot, és nem
 * nyúl DOM-hoz, three.js-hez vagy Reacthoz. Egy ilyen hívás csendben szétválasztaná két diák pályáját ugyanazzal a seeddel.
 *
 * Komment-szűrés a `game-feedback-wiring-guard.test.ts` mintájára: a kikommentezett hívás nem számít. A még nem létező
 * útvonalak (J0b tanulási mag, JM1 `shared/duel/`, a játékonkénti magok) üresen maradnak — a teszt nem bukik attól, hogy egy
 * játék magja még nincs kiemelve; amint létrejön, automatikusan az őr alá kerül.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Tiltott minták a sim-ben: nem-determinisztikus forrás, DOM, megjelenítő réteg. */
const FORBIDDEN: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "Math.random", re: /\bMath\s*\.\s*random\b/ },
  { name: "Date.now", re: /\bDate\s*\.\s*now\b/ },
  { name: "performance.now", re: /\bperformance\s*\.\s*now\b/ },
  { name: "document.", re: /\bdocument\s*\./ },
  { name: "window.", re: /\bwindow\s*\./ },
  { name: 'from "three"', re: /\bfrom\s*["']three(?:\/[^"']*)?["']/ },
  { name: 'from "react"', re: /\bfrom\s*["']react(?:-dom)?(?:\/[^"']*)?["']/ },
];

function violations(code: string): string[] {
  const clean = stripComments(code);
  return FORBIDDEN.filter(({ re }) => re.test(clean)).map(({ name }) => name);
}

const PLAY_SIM_FILES = ["loop", "director", "flow", "combo", "waves", "reviewQueue", "runStats", "questionDirector"].map(
  (name) => `client/src/game-engine/play/${name}.ts`,
);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** `client/src/lib/<játék>/sim.ts` és `core.ts` (egy szint mélyen, a terv `lib/*\/sim.ts` mintája). */
function gameCores(): string[] {
  const lib = join(root, "client/src/lib");
  if (!existsSync(lib)) return [];
  return readdirSync(lib)
    .filter((entry) => statSync(join(lib, entry)).isDirectory())
    .flatMap((entry) => ["sim.ts", "core.ts"].map((file) => join(lib, entry, file)))
    .filter((file) => existsSync(file));
}

function simFiles(): string[] {
  return [
    join(root, "shared/game-rng.ts"),
    ...walk(join(root, "shared/duel")),
    ...PLAY_SIM_FILES.map((p) => join(root, p)).filter((p) => existsSync(p)),
    ...gameCores(),
  ];
}

test("az őr érzékeny: minden tiltott mintát elkap, a kommentet és a hasonló nevet nem", () => {
  assert.deepEqual(violations("const x = Math.random();"), ["Math.random"]);
  assert.deepEqual(violations("const t = Date.now();"), ["Date.now"]);
  assert.deepEqual(violations("const t = performance.now();"), ["performance.now"]);
  assert.deepEqual(violations("document.body.append(x);"), ["document."]);
  assert.deepEqual(violations("window.addEventListener('x', f);"), ["window."]);
  assert.deepEqual(violations('import * as THREE from "three";'), ['from "three"']);
  assert.deepEqual(violations("import { Vector3 } from 'three/src/math/Vector3';"), ['from "three"']);
  assert.deepEqual(violations('import { useState } from "react";'), ['from "react"']);
  assert.deepEqual(violations('import { createRoot } from "react-dom/client";'), ['from "react"']);
  // Komment, más azonosító, típus-import nélküli szövegrészlet: nem találat.
  assert.deepEqual(violations("// Math.random() tilos\n/* Date.now() */ const a = 1;"), []);
  assert.deepEqual(violations("const myWindow = 1; const documentCount = 2; const threeD = 3;"), []);
  assert.deepEqual(violations('import { x } from "./threeHelpers";'), []);
});

test("a J0a-fájlok léteznek és az őr alá esnek (az őr nem üres halmazon fut)", () => {
  const files = simFiles().map((f) => relative(root, f).replace(/\\/g, "/"));
  for (const must of ["shared/game-rng.ts", "client/src/game-engine/play/loop.ts", "client/src/game-engine/play/director.ts"]) {
    assert.ok(files.includes(must), `${must} hiányzik az őrzött fájlok közül`);
  }
});

test("a szimulációs mag nem hív órát, Math.random-ot, DOM-ot, three-t vagy Reactot", () => {
  const found = simFiles().flatMap((file) => {
    const bad = violations(readFileSync(file, "utf8"));
    return bad.length ? [`${relative(root, file).replace(/\\/g, "/")}: ${bad.join(", ")}`] : [];
  });
  assert.deepEqual(found, [], `Tiltott hívás a determinisztikus magban:\n${found.join("\n")}`);
});

/**
 * Review #451 (J4a pilot) — a JÁTÉKLAPOK játékmenet-kódja sem húzhat `Math.random`-ot / `Date.now`-t: a lap a menet seedelt
 * RNG-jéből sorsol (feladat, elterelők, drónok), különben azonos seed mellett két diák más feladatsort kapna (párbaj, napi
 * kihívás). A lapokon a nézet-kód (rAF, hang-ritkítás) jogosan olvas órát (`performance.now`), ezért itt csak a két
 * nem-determinisztikus FORRÁS tiltott, tételes engedélylistával. Kiterjesztés: egy átírt játék lapja ide kerül a saját
 * engedélylistájával (ami a listán van, az kozmetikai vagy a seedelt forrás lusta alapértéke — indoklással).
 */
const GAME_PAGE_ALLOW: Record<string, ReadonlyArray<{ re: RegExp; why: string }>> = {
  "SpeedQuizMath.tsx": [
    {
      re: /let taskRandom: \(\) => number = \(\) => Math\.random\(\);/,
      why: "a feladat-sorsolás lusta alapértéke: a menet indításakor `setTaskRandom(createRng(…).next)` felülírja",
    },
  ],
  // J2a: a Szólétra lapján nincs kivétel (a kapaszkodó-tétel sorsolása a menet seedelt RNG-jéből: `pickRngRef`).
  "WordLadderHuEn.tsx": [],
  // J1a: a Szökőár kérdés-választása a menet seedelt RNG-jéből (`pickRngRef`), a pálya a mag seedjéből.
  "TsunamiEscapeEnglish.tsx": [
    {
      re: /if \(!reducedMotion && Math\.random\(\) < 0\.3 \+ prog \* 0\.3\) \{/,
      why: "a villám-felvillanás tisztán kozmetikai díszlet (a játék kimenetelét nem érinti); csökkentett mozgásnál nincs (M9, s13-őr)",
    },
  ],
  // J5a: a Brain Rot lapján nincs kivétel (a tétel-sorsolás a menet seedelt RNG-jéből: `pickRngRef`; a világ a magban).
  "BrainRotSteal.tsx": [],
};

const PAGE_FORBIDDEN = FORBIDDEN.filter(({ name }) => name === "Math.random" || name === "Date.now");

test("az átírt játéklapok játékmenet-kódja seedelt: Math.random / Date.now csak az engedélylistán", () => {
  const found: string[] = [];
  for (const [file, allow] of Object.entries(GAME_PAGE_ALLOW)) {
    let code = stripComments(readFileSync(join(root, "client/src/pages", file), "utf8"));
    for (const { re } of allow) {
      assert.ok(re.test(code), `${file}: az engedélyezett minta már nincs a lapon — vedd ki a listából (${re})`);
      code = code.replace(re, "");
    }
    for (const { name, re } of PAGE_FORBIDDEN) if (re.test(code)) found.push(`${file}: ${name}`);
  }
  assert.deepEqual(found, [], `Nem seedelt véletlen / óra a játéklapon:\n${found.join("\n")}`);
});

test("a lap-őr érzékeny: engedélylistán kívüli Math.random-ot elkap", () => {
  const code = "let taskRandom: () => number = () => Math.random();\nconst x = Math.random();";
  const rest = code.replace(GAME_PAGE_ALLOW["SpeedQuizMath.tsx"]![0]!.re, "");
  assert.ok(PAGE_FORBIDDEN.some(({ re }) => re.test(rest)));
  assert.ok(!PAGE_FORBIDDEN.some(({ re }) => re.test(code.split("\n")[0]!.replace(GAME_PAGE_ALLOW["SpeedQuizMath.tsx"]![0]!.re, ""))));
});
