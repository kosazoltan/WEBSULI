import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { WAVE_COUNT } from "../client/src/lib/spaceAsteroid/physics";

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

// SPEC-VÁLTOZÁS 2026-11-17 (review #486 KSZ-1: a kristály-geometriát a mag dönti el, a rajz csak olvas): a zóna a kérdés bemutatásakor
// EGYSZER, a magban (`crystalZoneFor`) készül; a lap nem méri a kártyát és nem rendezi át képkockánként. A szigor nem csökken:
// a régi (DOM-mérő) minta TILOS lett, a nem látható gomb láthatósága továbbra is képkockánként egyeztetett.
test("J6a: a kristály-zónát a mag dönti el egyszer (nincs DOM-mérés / képkockánkénti átrendezés), és a nem látható gomb láthatósága képkockánként egyeztetett", () => {
  assert.match(code, /crystalZoneFor\(\{/);
  assert.match(code, /spawnCrystals\(p, decideCrystalZone\(p\.question\.quiz\.prompt\), runRngRef\.current\.crystal\.next\)/);
  assert.doesNotMatch(code, /querySelector<HTMLElement>\('\[data-testid="sa-question"\]/, "a lap nem méri a kérdés-kártyát");
  assert.doesNotMatch(code, /rezoneCrystals\(/, "a rajz nem rendezi át a kristályokat");
  assert.match(code, /if \(chip\.style\.visibility !== vis\) chip\.style\.visibility = vis;/);
  // a koppintás mozgó célra: pointer-események (közös `pointerTapHandlers`), nem `click`
  assert.match(code, /\{\.\.\.pointerTapHandlers\(crystalTaps, idx, \(\) => onAnswer\(idx\)\)\}/);
});

test("J6a: a rövidült pálya miatt a „Hullám 10” jelvény (wave_10) a főellenfél legyőzésével elérhető marad", () => {
  assert.match(code, /highestWave: gameWon \? WAVE_COUNT \+ 2 : waveRef\.current,/);
  assert.ok(WAVE_COUNT + 2 >= 10, "a főellenfél legyőzése nem éri el a 10. hullám küszöbét");
});

/* ---------------------------------- review #486 ---------------------------------- */

test("review #486 M1: az ütközés szabálya a közös magból jön, és a főellenfél legyőzése véglegesít (nincs sérülés, az eredmény nem írható át)", () => {
  assert.match(code, /lifeLossOutcome\(\{ runOver: runOverRef\.current \|\| bossDefeatedRef\.current, invuln: p\.invuln, shield: shieldTimerRef\.current, elapsed: gameElapsedRef\.current \}\) !== "none"/);
  const hit = code.slice(code.indexOf("const handleHit = "), code.indexOf("const applyPickup"));
  assert.match(hit, /lifeLossOutcome\(\{ runOver: runOverRef\.current \|\| bossDefeatedRef\.current[\s\S]{0,120}return;/, "a handleHit a vége / győzelem után nem sebez");
  assert.match(code, /const won = wonIn \|\| bossDefeatedRef\.current;/, "a győzelem nem írható át „Kör vége”-re");
});

test("review #486 M2: a kristályt a lövedék csak élesítés után, új tűz-nyomással választja (a koppintás / billentyű szándékos, azonnali)", () => {
  const tick = code.slice(code.indexOf("const tick = (dt: number)"), code.indexOf("const enemyRadius"));
  assert.match(tick, /bulletCountsAsAnswer\(\{ nowMs: armClockRef\.current, shownAtMs: crystalShownAtRef\.current, pressAtMs: b\.pressAtMs/);
  assert.match(tick, /if \(fireNow && !firePrevRef\.current\) firePressAtRef\.current = armClockRef\.current;/);
  assert.match(tick, /pressAtMs\s*\}/, "a lövedék viszi a tűz-nyomás idejét");
  assert.doesNotMatch(code, /chip\.disabled !== lock/, "a koppintás / billentyű szándékos: nincs élesítési tiltás (az élesítés a lövedékre vonatkozik)");
});

test("review #486: a hosszú válaszok listája — a lista az egyetlen megállítási ok mellett válaszol, a világ áll alatta, és csak a „Válaszok” gombra nyílik", () => {
  assert.match(code, /setLongLabels\(!crystalLabelsFit\(p\.options\.map\(\(o\) => o\.label\)\)\);/);
  assert.doesNotMatch(code, /if \(long\) setExpanded\(true\)/, "a lista nem nyílik magától (a pálya nem áll meg kérés nélkül)");
  assert.match(code, /listHoldRef\.current = expanded && longLabels && !paused && !gfxLost && feedback === null;/);
  assert.match(code, /data-testid="sa-answers"/);
  assert.match(code, /className="sa-answer-text"/);
  assert.doesNotMatch(code, /2 sorra vág/, "a „2 sorra vág” engedmény megszűnt");
});

test("review #486: a rajz a két fix lépés között interpolál (hajó, ellenfelek, lövedékek, felvehető elemek)", () => {
  assert.match(code, /playerGroup\.position\.x = interpolate\(playerPrevRef\.current\.x, p\.x, alpha\)/);
  assert.match(code, /mesh\.position\.set\(interpolate\(e\.px \?\? e\.x, e\.x, alpha\), interpolate\(e\.py \?\? e\.y, e\.y, alpha\), 0\)/);
  assert.match(code, /interpolate\(b\.px \?\? b\.x, b\.x, alpha\)/);
  assert.match(code, /interpolate\(pu\.px \?\? pu\.x, pu\.x, alpha\)/);
  assert.match(code, /const a = driver\.frame\(realDt, pausedRef\.current\);\s*alphaRef\.current = pausedRef\.current \? 1 : a;/);
});

test("review #486: a lövedékek geometriája és anyaga közös (nem lövésenként új), a felvehető elemek szabálya a magból jön", () => {
  const render = code.slice(code.indexOf("const render = (now: number)"));
  assert.doesNotMatch(render, /new THREE\.CylinderGeometry\(0\.05/, "lövésenként új geometria");
  assert.match(code, /new THREE\.Mesh\(refs\.bulletGlow\.body, b\.fromEnemy \? refs\.bulletGlow\.bodyEnemy : refs\.bulletGlow\.bodyPlayer\)/);
  assert.match(code, /dropChance\(e\.kind\)/);
  assert.match(code, /applyPickupEffect\(/);
  assert.match(code, /gradeEase\(gradeRef\.current\)\.spawnScale/);
});

test("review #486 (CI): a shader-előmelegítés csak a KHR_parallel_shader_compile kiterjesztéssel hívja a compileAsync-ot, különben szinkron compile; a törlés mindkét ágon", () => {
  assert.match(code, /renderer\.extensions\.has\("KHR_parallel_shader_compile"\)/);
  assert.match(code, /void renderer\.compileAsync\(scene, camera\)\.then\(cleanup, cleanup\);/);
  assert.match(code, /renderer\.compile\(scene, camera\);[\s\S]{0,80}window\.setTimeout\(cleanup, 1500\)/);
  assert.equal(code.split("compileAsync(").length - 1, 1, "a compileAsync egyetlen, feltételes hívás");
});
