import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import {
  GRADE_BANK_RETRY_AFTER_MS,
  isGradeBankLoaded,
  loadGradeBank,
  loadedGradeItems,
  preloadGradeBanks,
  registerGradeBank,
  resetGradeBankLoader,
  setGradeBankImporter,
} from "../client/src/data/gradeQuizBank/loader";
import { createGradeQuizSeen, gradeForGame, pickGradeQuiz } from "../client/src/game-engine/gradeQuiz";

/**
 * JBb — az évfolyam-bank évfolyamonkénti lusta betöltése (`data/gradeQuizBank/loader.ts`).
 *
 * 1. Forrás-őr: a böngészős kód nem húzza be statikusan a bankfájlokat (különben egy darabba kerülne az összes évfolyam,
 *    és a játéklapokkal együtt töltődne le). Csak az `index.ts` (Node-oldali egyben-export, `@__PURE__` jelöléssel) és a
 *    `loader.ts` (dinamikus `import()`) hivatkozhat a `grade-NN` modulokra.
 * 2. Viselkedés: üres betöltőnél a választó `null`-t ad (→ a játék saját bankja) és elindítja a letöltést; betöltés után
 *    a saját évfolyamból kérdez; a hibás ígéret kiesik a gyorsítótárból, és újrapróbálható.
 * 3. Node-homlokzat: tesztben / szerveren a teljes bank szinkron elérhető.
 */

const SRC = fileURLToPath(new URL("../client/src/", import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

test("forrás-őr: a bankfájlokat csak a betöltő (dinamikusan) és az index hivatkozza; kliensmodul nem olvassa a GRADE_QUIZ_ITEMS-et", () => {
  const bad: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    const staticGrade = /^\s*import[^;]*from\s+["'][^"']*gradeQuizBank\/grade-\d{2}["']/m.test(src) ||
      /^\s*import[^;]*from\s+["']\.\/grade-\d{2}["']/m.test(src);
    if (staticGrade && rel !== "data/gradeQuizBank/index.ts") bad.push(`${rel}: statikus import egy grade-NN bankfájlra`);
    if (/import\s*\{[^}]*\bGRADE_QUIZ_ITEMS\b[^}]*\}\s*from/.test(src) && rel !== "data/gradeQuizBank/index.ts") {
      bad.push(`${rel}: a GRADE_QUIZ_ITEMS (az összes évfolyam egyben) kliensoldalon`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));

  const loader = readFileSync(join(SRC, "data/gradeQuizBank/loader.ts"), "utf8");
  for (let g = 3; g <= 12; g++) {
    const nn = String(g).padStart(2, "0");
    assert.ok(loader.includes(`import("./grade-${nn}")`), `a betöltő dinamikusan importálja a grade-${nn}-t`);
  }
  const index = readFileSync(join(SRC, "data/gradeQuizBank/index.ts"), "utf8");
  assert.match(index, /GRADE_QUIZ_ITEMS[^=]*=\s*\/\* @__PURE__ \*\//, "az egyben-export @__PURE__ jelölésű (fával rázható)");
  const picker = readFileSync(join(SRC, "game-engine/gradeQuiz.ts"), "utf8");
  assert.doesNotMatch(picker, /from\s+["']\.\.\/data\/gradeQuizBank["']/, "a választó nem az egyben-exportot importálja");
});

test("Node-homlokzat: tesztben a teljes bank szinkron elérhető (a választó viselkedése változatlan)", () => {
  resetGradeBankLoader();
  assert.equal(loadedGradeItems().length, GRADE_QUIZ_ITEMS.length);
  for (let g = 3; g <= 12; g++) assert.ok(isGradeBankLoaded(g));
  const item = pickGradeQuiz({ grade: 8, band: 0.5, seen: createGradeQuizSeen(), rng: () => 0 });
  assert.equal(item?.grade, 8);
});

test("lusta út: üres betöltőnél null (saját bank) + letöltés indul; utána a saját évfolyamból kérdez", async () => {
  resetGradeBankLoader({ nodeFacade: false });
  const calls: number[] = [];
  setGradeBankImporter(async (g) => {
    calls.push(g);
    return GRADE_QUIZ_ITEMS.filter((q) => q.grade === g);
  });
  try {
    assert.equal(loadedGradeItems().length, 0);
    assert.equal(pickGradeQuiz({ grade: 7, band: 0.2, seen: createGradeQuizSeen(), rng: () => 0 }), null);
    assert.equal(gradeForGame(7), 7);
    await preloadGradeBanks(7);
    assert.deepEqual([...new Set(calls)].sort((a, b) => a - b), [6, 7, 8], "a saját évfolyam és a két szomszédja");
    assert.equal(calls.filter((g) => g === 7).length, 1, "a párhuzamos kérések egy letöltést osztanak meg");
    const item = pickGradeQuiz({ grade: 7, band: 0.2, seen: createGradeQuizSeen(), rng: () => 0 });
    assert.equal(item?.grade, 7);
    assert.ok(!isGradeBankLoaded(9) && !isGradeBankLoaded(5), "a nem szükséges évfolyamok nem töltődnek le");
  } finally {
    setGradeBankImporter();
  }
});

test("hiba: az elutasított ígéret kiesik a gyorsítótárból; az előtöltés a várakozási idő után újrapróbál", async () => {
  resetGradeBankLoader({ nodeFacade: false });
  let fail = true;
  let calls = 0;
  setGradeBankImporter(async (g) => {
    calls++;
    if (fail) throw new Error("hálózati hiba");
    return GRADE_QUIZ_ITEMS.filter((q) => q.grade === g);
  });
  try {
    await assert.rejects(loadGradeBank(12), /hálózati hiba/);
    assert.ok(!isGradeBankLoaded(12));
    const t0 = Date.now();
    await preloadGradeBanks(12, t0 + 10); // a várakozási időn belül: nem kér újra
    assert.equal(calls, 2, "az előtöltés csak a 11. évfolyamot kérte (a 12. friss hiba)");
    fail = false;
    await preloadGradeBanks(12, t0 + GRADE_BANK_RETRY_AFTER_MS + 10);
    assert.ok(isGradeBankLoaded(12), "a várakozás után az újrapróba sikerül");
    assert.equal(pickGradeQuiz({ grade: 12, band: 0.9, seen: createGradeQuizSeen(), rng: () => 0 })?.grade, 12);
    // közvetlen hívás a várakozási időtől függetlenül újrapróbál
    resetGradeBankLoader({ nodeFacade: false });
    fail = true;
    await assert.rejects(loadGradeBank(3));
    fail = false;
    assert.equal((await loadGradeBank(3)).length, GRADE_QUIZ_ITEMS.filter((q) => q.grade === 3).length);
  } finally {
    setGradeBankImporter();
  }
});

test("registerGradeBank: kívülről beírt évfolyam azonnal választható; érvénytelen évfolyamot nem fogad", () => {
  resetGradeBankLoader({ nodeFacade: false });
  registerGradeBank(5, GRADE_QUIZ_ITEMS.filter((q) => q.grade === 5));
  registerGradeBank(42, GRADE_QUIZ_ITEMS);
  assert.ok(isGradeBankLoaded(5));
  assert.equal(loadedGradeItems().every((q) => q.grade === 5), true);
});
