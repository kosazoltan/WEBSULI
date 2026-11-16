import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * J0b — etikai őr (végrehajtás J0b 9. lépés, K.3; terv 4.2, J13).
 *
 * Gyerekeknek szóló játékokban tilos a veszteségkerüléssel zsaroló és a sürgető szöveg („elveszíted”, „ne hagyd ki”,
 * „csak ma”, „siess” …), és a közös játékréteg (`GE/play/`) nem hívhat `Math.random`-ot: a jutalom és a kérdés-ütemezés
 * determinisztikus, seedelt. A hét játéklap `Math.random`-ját ez az őr NEM tiltja (vizuális zaj megengedett); a
 * jutalom-kódot a J8 `meta.ts` őre nézi.
 *
 * Komment-szűrés a `game-feedback-wiring-guard.test.ts` mintájára: a kikommentezett szöveg nem számít (a fejlesztői
 * megjegyzés idézheti a tiltott mintát).
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Terv 4.2 tiltott kifejezései (végrehajtás J0b 9. lépés, szó szerint). */
const FORBIDDEN_TEXT = /elveszíted|elveszik a|megszakad a sorozat|ne hagyd ki|csak ma|utolsó esély|siess/i;
const MATH_RANDOM = /\bMath\s*\.\s*random\b/;

/** A `game-feedback-wiring-guard.test.ts` `WIRED` listája: a hét játéklap. */
const GAME_PAGES = [
  "SpeedQuizMath.tsx",
  "TornadoHunter200.tsx",
  "BrainRotSteal.tsx",
  "WordLadderHuEn.tsx",
  "TsunamiEscapeEnglish.tsx",
  "SpaceAsteroidQuiz.tsx",
  "BlockCraftQuiz.tsx",
  // JM3a (review #464 A4): a Párbaj lapja is ugyanazon szabályok alatt (tiltott szöveg, Math.random).
  "DuelOnline.tsx",
].map((f) => join(root, "client/src/pages", f));

function listDir(dir: string, re: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => re.test(f) && !/\.test\.tsx?$/.test(f)).map((f) => join(dir, f));
}

const PLAY_DIR = join(root, "client/src/game-engine/play");
const MOBILE_DIR = join(root, "client/src/game-engine/mobile");
/** JM3a (review #464 A4): a párbaj megjelenítő komponensei és munkamenet-rétege. */
const DUEL_DIRS = [join(root, "client/src/components/duel"), join(root, "client/src/lib/duel")];

function textFiles(): string[] {
  return [
    ...GAME_PAGES,
    ...listDir(PLAY_DIR, /\.tsx?$/),
    ...listDir(MOBILE_DIR, /\.tsx?$/),
    ...DUEL_DIRS.flatMap((d) => listDir(d, /\.tsx?$/)),
    join(root, "client/src/components/GameNextGoalBar.tsx"),
  ];
}

function rel(file: string): string {
  return relative(root, file).replace(/\\/g, "/");
}

function textHits(code: string): string[] {
  const clean = stripComments(code);
  const out: string[] = [];
  const re = new RegExp(FORBIDDEN_TEXT.source, "gi");
  for (let m = re.exec(clean); m; m = re.exec(clean)) out.push(m[0]);
  return out;
}

test("az őr érzékeny: elkapja a tiltott mintákat (kis- és nagybetű), a kommentet nem", () => {
  assert.deepEqual(textHits('const t = "Siess, mert elveszíted a sorozatot!";'), ["Siess", "elveszíted"]);
  assert.deepEqual(textHits("<p>Ne hagyd ki! Csak ma! Utolsó esély!</p>"), ["Ne hagyd ki", "Csak ma", "Utolsó esély"]);
  assert.deepEqual(textHits("x = 'Megszakad a sorozat'; y = 'elveszik a pontod';"), ["Megszakad a sorozat", "elveszik a"]);
  assert.deepEqual(textHits("// siess, ne hagyd ki\n/* csak ma */ const ok = 'Szép munka!';"), []);
  assert.equal(MATH_RANDOM.test(stripComments("const r = Math.random();")), true);
  assert.equal(MATH_RANDOM.test(stripComments("// Math.random() tilos\nconst r = rng.next();")), false);
});

test("a vizsgált fájlok léteznek (az őr nem üres halmazon fut)", () => {
  for (const f of GAME_PAGES) assert.ok(existsSync(f), `${rel(f)} hiányzik`);
  const files = textFiles().map(rel);
  for (const must of ["client/src/game-engine/play/questionDirector.ts", "client/src/game-engine/mobile/ResultScreen.tsx", "client/src/components/GameNextGoalBar.tsx", "client/src/pages/DuelOnline.tsx", "client/src/components/duel/QuestionCard.tsx", "client/src/lib/duel/session.ts"]) {
    assert.ok(files.includes(must), `${must} nincs az őr alatt`);
  }
});

test("a hét játéklap, a közös játékréteg és a mobilkeret felhasználói szövegében nincs veszteségkerülő / sürgető minta", () => {
  const found = textFiles().flatMap((file) => {
    const hits = textHits(readFileSync(file, "utf8"));
    return hits.length ? [`${rel(file)}: ${hits.join(", ")}`] : [];
  });
  assert.deepEqual(found, [], `Tiltott szöveg (terv 4.2):\n${found.join("\n")}`);
});

test("a GE/play/ alatt nincs Math.random (jutalom és ütemezés csak seedelt RNG-vel)", () => {
  const files = listDir(PLAY_DIR, /\.tsx?$/);
  assert.ok(files.length >= 10, `GE/play fájlok: ${files.length}`);
  const found = files.filter((f) => MATH_RANDOM.test(stripComments(readFileSync(f, "utf8")))).map(rel);
  assert.deepEqual(found, [], `Math.random a közös játékrétegben:\n${found.join("\n")}`);
});

test("a párbaj (lap, components/duel, lib/duel, shared/duel/bot) Math.random nélkül — a gép és a meccs seedelt (JM3a, review #464 A4)", () => {
  const files = [join(root, "client/src/pages/DuelOnline.tsx"), join(root, "shared/duel/bot.ts"), ...DUEL_DIRS.flatMap((d) => listDir(d, /\.tsx?$/))];
  assert.ok(files.length >= 10, `párbaj-fájlok: ${files.length}`);
  const found = files.filter((f) => MATH_RANDOM.test(stripComments(readFileSync(f, "utf8")))).map(rel);
  assert.deepEqual(found, [], `Math.random a párbajban:\n${found.join("\n")}`);
});
