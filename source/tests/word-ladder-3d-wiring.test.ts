import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Forrás-őr (spec 2026-09-29-palyak-szoletra-nyelvek, 4., 6., 7. döntés): a tiszta modulok tesztje semmit sem ér, ha a
 * lap nem köti be őket. Komment-szűréssel, hogy egy kikommentezett hívás ne számítson bekötésnek.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const page = strip(read("client/src/pages/WordLadderHuEn.tsx"));
const scene = strip(read("client/src/game-engine/scenes/QuizBoard3D.tsx"));

test("4. döntés: nyelvválasztó a menüben (wl-lang-<lang>), a bankok a nyelvi regiszterből", () => {
  assert.match(page, /from\s+"@\/data\/wordLadder\/registry"/);
  assert.match(page, /availableLadderLanguages\s*\(/);
  assert.match(page, /data-testid=\{`wl-lang-\$\{/);
  assert.match(page, /saveLadderLanguage\s*\(/);
});

test("6. döntés: pályaválasztó, pályánkénti létrahossz és sáv, haladás wordladder-<lang> gameId-vel", () => {
  assert.match(page, /<GradeLevelPicker\b/);
  assert.match(page, /ladderRungsForLevel\s*\(/);
  // SPEC-VÁLTOZÁS 2026-11-22 (docs/specs/2026-11-22-szoletra-szintezes.md 4.2–4.3): a futás fokozatát az évfolyam-sávos
  // `createLadderStepSession` adja (a régi, csak pályából induló `createLadderLevelSession` helyett).
  assert.match(page, /createLadderStepSession\s*\(/);
  assert.match(page, /windowLadderSteps\s*\(/);
  // Vak kör 1 L1 (terv 13.): a bankközi korlátot a lap a TELJES szóbankból építi (a `mergeVocabTiers` a duplikált szóbanki
  // tételt kiszűri, így a futás saját készletéből a kézi tétel nem emelkedne).
  assert.match(page, /ladderTermFloors\s*\(/);
  assert.match(page, /vocabFloorSources\s*\(/);
  assert.match(page, /ladderStepBuckets\s*\(\s*allTiers\s*,\s*lang\s*,\s*termFloors\s*\)/);
  // Vak kör 2 L2 (terv 14.2): a korlátforrás is a tétel saját szintjét használja, nem a készlet-indexet.
  assert.match(page, /declaredTierOf\s*\(\s*q\s*,/);
  assert.match(page, /loadUnlockedLevel\s*\(\s*wordLadderGameId\s*\(/);
  assert.match(page, /unlockNextLevel\s*\(\s*wordLadderGameId\s*\(/);
  assert.match(page, /pickUnseen\s*\(/);
  assert.doesNotMatch(page, /const QUIZ_BANK: Quiz\[\]/, "a lapba égetett bank megszűnt (en.ts)");
});

test("7. döntés: 3D kérdésréteg, a DOM-gombok (wl-option-*, data-correct) megmaradnak, 1–4 billentyű", () => {
  assert.match(page, /<QuizBoard3D\b/);
  assert.match(page, /data-testid=\{`wl-option-\$\{idx\}`\}/);
  assert.match(page, /correctDataAttrs\s*\(/);
  assert.match(page, /data-quiz3d=/);
  assert.match(page, /\["1",\s*"2",\s*"3",\s*"4"\]/);
});

test("7. döntés: WebGL nélkül vagy low szinten a DOM-kártya (quiz3dEnabled + detectLookTier)", () => {
  assert.match(page, /detectLookTier\s*\(/);
  assert.match(page, /quiz3dEnabled\s*\(/);
});

test("7. döntés: a 3D lapok raycasttal érinthetők, a csökkentett mozgást tiszteletben tartják", () => {
  assert.match(scene, /new THREE\.Raycaster\(/);
  assert.match(scene, /intersectObjects\s*\(/);
  assert.match(scene, /reducedMotion/);
  assert.match(scene, /useThreeScene\s*\(/);
});
