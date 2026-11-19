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
  // SPEC-VÁLTOZÁS 2026-11-17 (Vercel-lelet, átméretezés): az átrendezés csak az átméretezés ágon (`rezoneNowRef`) engedett; a RAJZ továbbra sem rendez át.
  assert.doesNotMatch(code.slice(code.indexOf("const render = (now: number)")), /rezoneCrystals\(/, "a rajz nem rendezi át a kristályokat");
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
  // SPEC-VÁLTOZÁS 2026-11-17 (review #486 L1): a lövedékek a magból jönnek (`volleyFor`), a szigor nő: a nyomás ideje ÉS az oldalsó jelölés is a lövedéken.
  assert.match(tick, /volleyFor\(powerLevelRef\.current, centerVx\)\.forEach/);
  assert.match(tick, /pressAtMs, side: spec\.side/, "a lövedék viszi a tűz-nyomás idejét és az oldalsó jelölést");
  assert.match(tick, /side: b\.side \}\)/, "az oldalsó lövedék nem válaszolhat");
  assert.doesNotMatch(code, /chip\.disabled !== lock/, "a koppintás / billentyű szándékos: nincs élesítési tiltás (az élesítés a lövedékre vonatkozik)");
});

test("review #486: a hosszú válaszok listája — a lista az egyetlen megállítási ok mellett válaszol, a világ áll alatta, a „Válaszok” gombra nyílik, magától NEM (nem blokkoló jelmagyarázat van helyette)", () => {
  // SPEC-VÁLTOZÁS 2026-11-19 (vak ellenőrzés L1, blokkoló; felülírja az Ú5 automatikus nyitását): a hosszú / nem férő válasznál NEM áll meg magától a világ;
  // a teljes szövegek nem blokkoló jelmagyarázatban látszanak a számozott kristályokkal egyszerre; a beférést a valódi szélesség adja (L5).
  assert.match(code, /setLongLabels\(!crystalLabelsFit\(p\.options\.map\(\(o\) => o\.label\), measuredFit\)\);/);
  assert.doesNotMatch(code, /if \(long\) setExpanded\(true\)/, "a lista nem nyílik magától");
  assert.match(code, /data-testid="sa-legend"/);
  assert.match(page, /\.sa-legend \{[^}]*pointer-events: none;/, "a jelmagyarázat nem blokkoló");
  assert.match(code, /const closeAnswerList = \(\) => \{\s*setExpanded\(false\);\s*crystalShownAtRef\.current = armClockRef\.current;/, "a lista zárása újraindítja az élesítést");
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

test("review #486 (Vercel): átméretezés / elforgatás nyitott kérdésnél a mag új aréna-méretből számolja újra a kristályok helyét, és az élesítés újraindul", () => {
  assert.match(code, /camera\.updateProjectionMatrix\(\);\s*rezoneNowRef\.current\(\);/);
  assert.match(code, /rezoneCrystals\(list, decideCrystalZone\(pres\.question\.quiz\.prompt\), 1\)/);
  assert.match(code, /crystalShownAtRef\.current = armClockRef\.current;\s*\n?\s*};/);
});

test("review #486 (kis UX): a tartott tűz átmegy a kristályon — rövid szöveges jelzés, amíg a gyerek lövéssel még nem válaszolt", () => {
  assert.match(code, /holdHintUntilRef\.current = armClockRef\.current \+ 3500/);
  assert.match(code, /if \(!bulletAnsweredRef\.current && crystalAt\(crystals, b\.x, b\.y\)\)/);
  assert.match(code, /bulletAnsweredRef\.current = true;\s*holdHintUntilRef\.current = 0;/);
  assert.match(code, /data-testid="sa-hold-hint"/);
});

test("a kör végén nyomva tartott tűzgomb: a vezérlők az endRun-ban és a startNewRun-ban is nullázódnak (a közös HoldButton nem hív onHoldEnd-et lecsatoláskor)", () => {
  const end = code.slice(code.indexOf("const endRun = useCallback("), code.indexOf("const openWhy"));
  assert.match(end, /runOverRef\.current = true;[\s\S]{0,400}releaseControls\(\);/);
  assert.match(end, /\}, \[releaseControls\]\);/);
  const start = code.slice(code.indexOf("const startNewRun = useCallback("));
  assert.match(start.slice(0, 3500), /releaseControls\(\);/);
});

test("review #486 L5: a rossz válasz nem jutalmaz — az `applyCrystalUpgrade()` és a pont csak a jó ágban van (a rossz ág előtt)", () => {
  const out = code.slice(code.indexOf("const onCrystalOutcome = "), code.indexOf("installGameTestApi("));
  assert.equal(out.split("applyCrystalUpgrade()").length - 1, 1, "az `applyCrystalUpgrade()` pontosan egyszer szerepel");
  assert.ok(out.indexOf("applyCrystalUpgrade()") < out.indexOf("sfxError();"), "a fejlesztés a jó ág része (a rossz ág `sfxError` előtt zárul)");
  assert.match(out, /if \(result === "correct"\) \{[\s\S]{0,200}applyCrystalUpgrade\(\);[\s\S]{0,900}return;\s*\}\s*sfxError\(\);/, "a jó ág `return`-nel zárul, közvetlenül a rossz ág (`sfxError`) előtt");
  const wrong = out.slice(out.indexOf("sfxError();"));
  assert.doesNotMatch(wrong, /scoreRef\.current \+=/, "a rossz ág nem ad pontot");
});

test("review #486 L2: a kristály-felirat méret-foka a `crystalLabelTier`-ből jön (a hibás `/S{9,}/` regex megszűnt), a szó nem törhet közepén", () => {
  assert.match(code, /data-tier=\{crystalLabelTier\(opt\.label\)\}/);
  assert.doesNotMatch(page, /\/S\{9,\}\//, "a hibás regex (backslash nélküli S) visszatért");
  assert.match(page, /\.sa-crystal-label \{[^}]*overflow-wrap: normal;[^}]*hyphens: manual;/, "a szó nem törhet közepén");
});

test("vak L2 / L3 / L4: a segített lövés nem válaszol, a szilánk nem jutalmaz, a kihagyás és a tanulási jelvény külön — a lapon", () => {
  // L2
  assert.match(code, /const centerVx = shotCenterVx\(\{\s*touchAssist,\s*questionOpen,/);
  assert.match(code, /import \{ aimAssistVx, shotCenterVx \} from "@\/lib\/spaceAsteroid\/aimAssist";/);
  // L3: a szilánk jelölt, a jutalom-ágak őrzöttek
  assert.match(code, /fromCrystal: true,/);
  const destroyed = code.slice(code.indexOf("const handleEnemyDestroyed = "), code.indexOf("const handleHit = "));
  assert.match(destroyed, /if \(!e\.fromCrystal\) \{\s*comboRef\.current = comboRef\.current \+ 1;/);
  assert.match(destroyed, /\} else if \(!e\.fromCrystal\) \{\s*if \(runRngRef/);
  // L4
  assert.match(code, /maxStreak: answerStreakRef\.current\.best,/);
  assert.match(code, /perfect: gameWon && runTotalsRef\.current\.correct >= 3 && runTotalsRef\.current\.wrong === 0 && runTotalsRef\.current\.timeouts === 0,/);
  assert.doesNotMatch(code, /maxStreak: bestComboRef/, "a tanulási jelvény nem jöhet a harci kombóból");
});
