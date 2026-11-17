import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Physics lives in lib/spaceAsteroid/physics.ts. A green unit suite on the
 * helper is worthless if the 2400-line page still uses wall-clock spawn and
 * un-normalized WASD. Comment-stripping is mandatory (#183 class).
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/SpaceAsteroidQuiz.tsx"), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(page);

function countCalls(src: string, name: string): number {
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  return (src.match(re) ?? []).length;
}

test("a page hívja az integratePlayer / spawnReady / splitRock / starScrollY / enemyRenderSpin helper-eket", () => {
  for (const name of ["integratePlayer", "spawnReady", "splitRock", "starScrollY", "enemyRenderSpin"]) {
    assert.ok(countCalls(code, name) >= 1, `missing ${name}(`);
  }
});

test("a lefelé irány a vezérlésben is megvan", () => {
  // A teszt SZÁNDÉKA változatlan (volt egy hiba, amikor a lefelé irány
  // kimaradt), a mechanizmus viszont megváltozott: a négy nyílgombot joystick
  // váltotta, mert az átlós irány két gomb egyidejű nyomását követelte, ami egy
  // hüvelykujjal nem megy. A `startHold(..., "down")` helyett most a joystick
  // vektorát képezzük irányokra.
  // SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „Joystick-reakció”, kanban #49):
  // a tárcsa analóg (`shapeJoystick`), nem négy logikai irány — a lefelé irány a tárcsa negatív `y`-ja, amely a hurok
  // `my` értékébe kerül. A szándék változatlan: a lefelé irányt a vezérlés továbbítja.
  assert.match(code, /stickRef\.current\.y\s*=\s*s\.y/, "a tárcsa függőleges (le/fel) értékét semmi nem állítja — a hajó nem tud hátrálni");
  assert.match(code, /let mx = stickRef\.current\.x, my = stickRef\.current\.y;/, "a hurok nem olvassa a tárcsa függőleges értékét");
  assert.match(code, /shapeJoystick\s*\(/, "a joystick nincs bekötve");
});

test("a komment-szűrő önellenőrzése: kikommentezett hívás nem számít", () => {
  const fake = `integratePlayer(p, i, dt);\n// integratePlayer(\n/* integratePlayer( */`;
  assert.equal(countCalls(stripComments(fake), "integratePlayer"), 1);
});

/* ------------------------------------------------------------------------------------------------------------------ *
 * J6a — a kvíz-kapuk megszűntek; a kérdés a világban, kristály-válaszként érkezik (végrehajtás J6a 3–4.; terv 5.6).
 * A régi „kvíz-kapu” bekötést ez a fájl nem rögzítette (nincs `enqueueQuiz` / hullám-vég kapu eset), ezért nincs mit cserélni;
 * az új bekötés külön esetekben: `director.tick` (a meghajtón át) és `director.answer` (a kristály-ütközésben).
 * ------------------------------------------------------------------------------------------------------------------ */

const sim = stripComments(readFileSync(join(root, "client/src/lib/spaceAsteroid/sim.ts"), "utf8"));

test("J6a: nincs kvíz-kapu — se induló, se hullám-vég, se ütközés-kvíz, se idő-limit", () => {
  assert.doesNotMatch(code, /enqueueQuiz|ROUND_LIMIT_SEC|QuizReason|quizReason|activeQuiz|setTimeLeft|timeLeft/, "kvíz-kapu / kör-óra maradt a lapon");
  assert.doesNotMatch(code, /role="dialog"|aria-modal|Mini-teszt/, "modális kvízréteg maradt a lapon");
  // az ütközés csak élet −1 és 2 mp sérthetetlenség
  const hit = code.slice(code.indexOf("const handleHit"), code.indexOf("const applyPickup"));
  assert.match(hit, /livesRef\.current = nextLives;/);
  assert.match(hit, /playerRef\.current\.invuln = HIT_INVULN_SEC;/);
  assert.doesNotMatch(hit, /quiz|request\(/i, "az ütközés kérdést indít");
  // a hamis „Megúsztál egy kvízt!” felirat helyett „+1 élet!”
  assert.doesNotMatch(code, /Megúsztál/);
  assert.match(code, /setSavedToast\("\+1 élet!"\)/);
});

test("J6a: a kérdés-ütemező a meghajtóban fut (director.tick), a kristály-ütközés a választ adja (director.answer)", () => {
  assert.ok(countCalls(code, "usePlayQuestion") >= 1, "nincs usePlayQuestion");
  assert.ok(countCalls(code, "createAsteroidDriver") >= 1, "nincs közös meghajtó");
  // a hurok a meghajtót hívja a valós képkocka-idővel és a szünet-állapottal (a fix lépésű hurok a meghajtóé)
  assert.match(code, /driver\.frame\(realDt, pausedRef\.current\)/);
  assert.match(code, /step: \(dtMs\) => tickRef\.current\(dtMs \/ 1000\)/, "a világ lépése nem a fix lépésű hurokból jön");
  // a meghajtó a nyugodt pillanatban hívja a kérdés-sáv képkockáját (az a director.tick-et)
  assert.match(sim, /q\.frame\(clock, \{ calm: pace\.calm\(\) \}\)/);
  assert.match(sim, /loop\.setTimeScale\(paused \? 0 : q \? q\.timeScale\(\) : 1\)/);
  // a lövedék-kristály ütközés = válasz (a választ a kérdés-sáv állapotgépe adja a directornak)
  const tick = code.slice(code.indexOf("const tick = (dt: number)"), code.indexOf("const enemyRadius"));
  assert.match(tick, /crystalAt\(crystals, b\.x, b\.y\)[\s\S]{0,160}onAnswer\(c\.optionIndex\)/);
  assert.match(code, /qRef\.current\.pick\(idx, driverRef\.current\?\.clockMs\(\)\)/);
  assert.match(code, /const onAnswer = \(idx: number\) => \{/);
});

test("J6a: a célzássegéd csak az ellenfeleket kapja — a kristály kiválasztása a játékosé (U-J6-1)", () => {
  const call = code.slice(code.indexOf("aimAssistVx("), code.indexOf("aimAssistVx(") + 200);
  assert.match(call, /enemiesRef\.current\.map/);
  assert.doesNotMatch(call, /crystal/i, "a célzássegéd a kristályokat is célpontnak veszi");
});

test("J6a: a lap játékmenet-kódja seedelt — nincs Math.random / Date.now (K.6 őr), a hullám-képlet a physics.ts-ből jön", () => {
  assert.doesNotMatch(code, /\bMath\s*\.\s*random\b|\bDate\s*\.\s*now\b/);
  for (const name of ["waveEnemyCount", "waveSpawnInterval", "pickEnemyKind", "pickRockSize", "enemyHp", "waveBaseVy"]) {
    assert.ok(countCalls(code, name) >= 1, `a lap nem a közös ${name}-t hívja`);
  }
  assert.equal(code.match(/const BOSS_FINAL_WAVE = BOSS_WAVE;/)?.length, 1);
});

test("J6a: a HUD ≤ 10 Hz-es pillanatkép — a játékhurok nem ír React-állapotot (KSZ-9)", () => {
  const tick = code.slice(code.indexOf("const tick = (dt: number)"), code.indexOf("const enemyRadius"));
  assert.doesNotMatch(tick, /\bset[A-Z]\w*\(/, "React setState a tick-ben");
  assert.match(code, /const HUD_STEP_MS = 100;/);
  assert.match(code, /publishHud\(\);/);
});

test("J6a: a renderer a közös gyárral készül (KSZ-8), a WebGL-környezet elvesztése kezelt (K.4/7), a menüben nincs rajzolás (kanban #69)", () => {
  assert.doesNotMatch(code, /new THREE\.WebGLRenderer/, "saját renderer-gyártás maradt");
  assert.match(code, /createGameRenderer\(canvas, tier,/);
  assert.match(code, /addEventListener\("webglcontextlost", onContextLost\)/);
  assert.match(code, /removeEventListener\("webglcontextlost", onContextLost\)/);
  assert.match(code, /data-testid="sa-gfx-restart"/);
  // a menüben (osztályválasztó / kezdőképernyő) a rajzoló függvény azonnal kilép: a hurok nem fogyaszt GPU-t
  const render = code.slice(code.indexOf("const render = (now: number)"), code.indexOf("tickRef.current = tick;"));
  assert.match(render, /if \(phaseRef\.current === "grade" \|\| phaseRef\.current === "intro"\) return;/);
  assert.ok(render.indexOf('phaseRef.current === "intro"') < render.indexOf("starScrollY"), "a menü-kilépés a csillagmező-görgetés ELŐTT áll");
  assert.ok(render.indexOf('phaseRef.current === "intro"') < render.indexOf("refs.postFx.render()"), "a menüben nincs postFx.render()");
});

test("J6a: a kristály-gombok a kérdés-sáv alatti zónába kerülnek (mért kártya-alj), és a nem látható gomb láthatósága képkockánként egyeztetett", () => {
  assert.match(code, /document\.querySelector<HTMLElement>\('\[data-testid="sa-question"\] \.play-question-card'\)/);
  assert.match(code, /rezoneCrystals\(list, computeCrystalBounds\(\), 0\.35\)/);
  assert.match(code, /if \(chip\.style\.visibility !== vis\) chip\.style\.visibility = vis;/);
  // a koppintás mozgó célra: pointer-események (közös `pointerTapHandlers`), nem `click`
  assert.match(code, /\{\.\.\.pointerTapHandlers\(crystalTaps, idx, \(\) => onAnswer\(idx\)\)\}/);
});
