import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdaptiveSession } from "../client/src/game-engine/adaptiveSession";
import { startingDifficulty } from "../client/src/game-engine/difficulty";
import { LEVEL_BAND_SPREAD, clampToLevel, levelBand } from "../client/src/game-engine/gradeLevels";
import {
  digitComplexity,
  levelAdaptBand,
  levelStartBand,
  levelsActiveForGrade,
  nextSuggestedLevel,
  pickByBand,
} from "../client/src/game-engine/levelTuning";
import { tsunamiWaterPace } from "../client/src/game-engine/tsunamiTiming";

/**
 * E szelet (spec 2026-09-29-palyak-szoletra-nyelvek, 3. döntés; végrehajtás: 2026-09-29-jatekok-10-palya-vegrehajtas.md).
 *
 * Két réteg: a tiszta pálya-hangolás (kezdősáv, adaptív sáv a pálya körül, feloldás utáni ajánlás, tempó-szorzók), és
 * játékonként egy bekötés-őr: a menüben ott a választó, a pálya a kezdősávba megy, a győzelem feloldja a következőt.
 * Az őr komment-szűrt forrásból dolgozik (a `game-feedback-wiring-guard` mintája), hogy egy kikommentezett hívás ne
 * számítson bekötésnek.
 */

test("D1 pálya csak 3–12. évfolyamon; évfolyam nélkül és 1–2. évfolyamon a mai viselkedés", () => {
  for (const g of [null, undefined, 0, 1, 2, 13, 2.5, Number.NaN]) assert.equal(levelsActiveForGrade(g as number | null), false, String(g));
  for (let g = 3; g <= 12; g++) assert.equal(levelsActiveForGrade(g), true, String(g));
  assert.equal(levelStartBand(null, 0.42), 0.42, "pálya nélkül a játék saját kezdősávja");
  assert.equal(levelAdaptBand(0.99, null), 0.99, "pálya nélkül az adaptív sáv érintetlen");
});

test("D3 a pálya a kezdősáv, és futás közben a pálya sávja körül marad", () => {
  for (let l = 1; l <= 10; l++) {
    assert.equal(levelStartBand(l, 0.42), levelBand(l));
    for (const b of [0, 0.3, 0.6, 1]) {
      const c = levelAdaptBand(b, l);
      assert.ok(Math.abs(c - levelBand(l)) <= LEVEL_BAND_SPREAD + 1e-9, `${l}. pálya, ${b} → ${c}`);
    }
  }
});

test("D3 adaptív munkamenet pályával: levelBand-ről indul, a clampToLevel sávban mozog; pálya nélkül a régi", () => {
  const s = createAdaptiveSession(7, 10);
  assert.equal(s.band, levelBand(10));
  for (let i = 0; i < 20; i++) s.answer(false);
  assert.ok(Math.abs(s.band - clampToLevel(0, 10)) < 1e-9, `10. pálya sok hiba után: ${s.band}`);
  s.reset(7, 1);
  assert.equal(s.band, levelBand(1));
  for (let i = 0; i < 20; i++) s.answer(true);
  assert.ok(Math.abs(s.band - clampToLevel(1, 1)) < 1e-9, `1. pálya sok jó után: ${s.band}`);
  s.reset(7);
  assert.equal(s.band, startingDifficulty(7), "reset pálya nélkül = a régi kezdősáv");
  for (let i = 0; i < 20; i++) s.answer(true);
  assert.equal(s.band, 1, "pálya nélkül nincs pálya-korlát");
  assert.equal(createAdaptiveSession(4).band, startingDifficulty(4));
});

test("D2 győzelem után a következő pályát ajánlja, ha nyitva van", () => {
  assert.equal(nextSuggestedLevel(1, 2), 2);
  assert.equal(nextSuggestedLevel(4, 9), 5);
  assert.equal(nextSuggestedLevel(10, 10), 10);
  assert.equal(nextSuggestedLevel(3, 3), 3, "ha a tárolás nem nyitott tovább, a lezártat nem ajánlja");
});

test("D7 pickByBand: alacsony sávon a legkisebb, magas sávon a legnagyobb komplexitású jelölt", () => {
  const tasks = ["123 + 456 = ?", "7 + 8 = ?", "4521 × 37 = ?"];
  assert.ok(digitComplexity("7 + 8 = ?") < digitComplexity("123 + 456 = ?"));
  assert.equal(pickByBand(tasks, levelBand(1), digitComplexity), "7 + 8 = ?");
  assert.equal(pickByBand(tasks, levelBand(10), digitComplexity), "4521 × 37 = ?");
  assert.equal(pickByBand(["egyetlen 5"], 0.9, digitComplexity), "egyetlen 5");
});

test("D8 Szökőár víz-tempó: mérsékelt, monoton, a 10. pálya gyorsabb az 1.-nél", () => {
  let prev = -Infinity;
  for (let l = 1; l <= 10; l++) {
    const p = tsunamiWaterPace(levelBand(l));
    assert.ok(p > prev && p >= 0.85 && p <= 1.15, `${l}. pálya: ${p}`);
    prev = p;
  }
  assert.ok(tsunamiWaterPace(levelBand(10)) - tsunamiWaterPace(levelBand(1)) >= 0.2);
});

/* ---------------------------- bekötés-őr játékonként ---------------------------- */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function pageCode(file: string): string {
  return stripComments(readFileSync(join(root, "client/src/pages", file), "utf8"));
}

const GAMES: { file: string; gameId: string; startBand: RegExp; win: RegExp }[] = [
  {
    file: "SpaceAsteroidQuiz.tsx",
    gameId: "asteroid",
    startBand: /adaptiveRef\.current\.reset\([^)]*,\s*[^)]*[Ll]evel[^)]*\)/,
    win: /phase\s*===\s*"over"\s*&&\s*gameWon[\s\S]{0,200}\.complete\(/,
  },
  {
    file: "BlockCraftQuiz.tsx",
    gameId: "blockcraft",
    startBand: /adaptiveRef\.current\.reset\([^)]*,\s*[^)]*[Ll]evel[^)]*\)/,
    win: /phase\s*===\s*"over"\s*&&\s*gameWon[\s\S]{0,200}\.complete\(/,
  },
  {
    file: "BrainRotSteal.tsx",
    gameId: "brainrot",
    startBand: /difficultyRef\.current\s*=\s*levelStartBand\(/,
    win: /phase\s*===\s*"over"\s*&&\s*totalCaught\s*>=\s*BRAIN_ROT_CLEAR_CATCHES[\s\S]{0,200}\.complete\(/,
  },
  {
    file: "TsunamiEscapeEnglish.tsx",
    gameId: "tsunami",
    startBand: /adaptiveRef\.current\.reset\([^)]*,\s*[^)]*[Ll]evel[^)]*\)/,
    win: /phase\s*===\s*"won"[\s\S]{0,200}\.complete\(/,
  },
  {
    file: "TornadoHunter200.tsx",
    gameId: "tornado",
    startBand: /createAdaptiveSession\(\s*primaryGrade\s*,\s*props\.gradeLevel\s*\)/,
    win: /if\s*\(\s*won\s*&&\s*props\.gradeLevel\s*!=\s*null\s*\)\s*props\.onGradeLevelWin\(/,
  },
  {
    file: "SpeedQuizMath.tsx",
    gameId: "speedmath",
    startBand: /difficultyRef\.current\s*=\s*levelStartBand\(/,
    win: /phase\s*===\s*"won"[\s\S]{0,200}\.complete\(/,
  },
];

for (const g of GAMES) {
  const code = pageCode(g.file);

  test(`${g.file}: a menüben ott a pályaválasztó (${g.gameId})`, () => {
    assert.match(code, /from\s+"@\/game-engine\/useGradeLevel"/, "useGradeLevel import hiányzik");
    assert.match(code, /from\s+"@\/game-engine\/GradeLevelPicker"/, "GradeLevelPicker import hiányzik");
    assert.match(code, new RegExp(`useGradeLevel\\(\\s*"${g.gameId}"`), `useGradeLevel("${g.gameId}", …) hiányzik`);
    assert.match(code, /<GradeLevelPicker[\s\S]{0,300}unlocked=\{/, "a választó nincs kirajzolva a feloldással");
  });

  test(`${g.file}: a pálya a kezdő sávba megy`, () => {
    assert.match(code, g.startBand);
  });

  test(`${g.file}: a győzelem feloldja a következő pályát`, () => {
    assert.match(code, g.win);
  });
}

test("Tornádó: a pálya a világszintre és a pályás időkeretre képződik le, a futás pályája a győzelemnél feloldódik", () => {
  const code = pageCode("TornadoHunter200.tsx");
  assert.match(code, /tornadoWorldLevel\(/);
  assert.match(code, /tornadoLevelTimeScale\(/);
  assert.match(code, /onGradeLevelWin=\{[\s\S]{0,200}\.complete\(/);
});

test("Brain Rot és Villám matek: futás közben a pálya körül tartott sáv", () => {
  assert.match(pageCode("BrainRotSteal.tsx"), /levelAdaptBand\(/);
  assert.match(pageCode("SpeedQuizMath.tsx"), /levelAdaptBand\(/);
  assert.match(pageCode("SpeedQuizMath.tsx"), /pickByBand\(/, "a feladat-nehézség a sávon át");
});

test("Szökőár: a víz emelkedése a sávfüggő tempóval", () => {
  assert.match(pageCode("TsunamiEscapeEnglish.tsx"), /tsunamiWaterPace\(/);
});
