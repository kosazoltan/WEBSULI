import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

import * as extras from "../client/src/data/englishGameQuizExtras";
import type { FourChoiceQuiz } from "../client/src/types/gameQuiz";
import { normalizePrompt } from "../client/src/game-engine/no-repeat";
import { evaluateCalc, promptExpression, sameNumber } from "./support/math-calc";

/**
 * Spec: docs/specs/2026-09-29-jatek-bankok-ismetles.md (E2, E3, E6, E7).
 *
 * A Szólétra és a Villám matek bankjai React-lapokban élnek, ezért a lapok forrásából mérünk: a Szólétra
 * lapba égetett sorait soronként értelmezzük, a Villám matek tiszta részét (bank + generátor) TypeScript-
 * átfordítás után egy elszigetelt `vm`-környezetben futtatjuk — `eval` nélkül, a React-importok kihagyásával.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

/* ------------------------------------ Szólétra ------------------------------------ */

const ladderPage = read("client/src/pages/WordLadderHuEn.tsx");

function pageBlock(startMarker: string, endMarker: string): FourChoiceQuiz[] {
  const start = ladderPage.indexOf(startMarker);
  const end = ladderPage.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `nem találom: ${startMarker} … ${endMarker}`);
  return ladderPage
    .slice(start, end)
    .split(/\r?\n/)
    .filter((line) => /^\s*\{ id: "/.test(line))
    .map((line) => vm.runInNewContext(`(${line.trim().replace(/,$/, "")})`) as FourChoiceQuiz);
}

const LADDER_TIERS: Record<string, FourChoiceQuiz[]> = {
  easy: [...pageBlock("const QUIZ_BANK", "const QUIZ_MED"), ...extras.wordLadderEasyMore],
  med: [...pageBlock("const QUIZ_MED", "const QUIZ_HARD"), ...extras.wordLadderMedMore],
  hard: [...pageBlock("const QUIZ_HARD", "const QUIZ_B1"), ...extras.wordLadderHardMore],
  b1: [...extras.wordLadderB1],
  b2: [...extras.wordLadderB2],
};
const ALL_LADDER = Object.values(LADDER_TIERS).flat();

test("Szólétra: a lap a kiegészítő tömböket a megfelelő szintbe teszi", () => {
  const between = (a: string, b: string) => ladderPage.slice(ladderPage.indexOf(a), ladderPage.indexOf(b, ladderPage.indexOf(a)));
  assert.match(between("const QUIZ_BANK", "const QUIZ_MED"), /\.\.\.wordLadderEasyMore/);
  assert.match(between("const QUIZ_MED", "const QUIZ_HARD"), /\.\.\.wordLadderMedMore/);
  assert.match(between("const QUIZ_HARD", "const QUIZ_B1"), /\.\.\.wordLadderHardMore/);
  assert.match(ladderPage, /const QUIZ_B1: Quiz\[\] = \[\.\.\.wordLadderB1\]/);
  assert.match(ladderPage, /const QUIZ_B2: Quiz\[\] = \[\.\.\.wordLadderB2\]/);
});

test("E2/E7 Szólétra: a szintek mérete eléri a minimumot", () => {
  const min: Record<string, number> = { easy: 120, med: 120, hard: 90, b1: 60, b2: 60 };
  for (const [tier, items] of Object.entries(LADDER_TIERS)) {
    assert.ok(items.length >= min[tier]!, `${tier}: ${items.length} < ${min[tier]}`);
  }
});

test("Szólétra: nincs két azonos (normalizált) prompt a teljes statikus készletben", () => {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const q of ALL_LADDER) {
    const key = normalizePrompt(q.prompt);
    if (seen.has(key)) dupes.push(`${seen.get(key)} = ${q.id}: ${q.prompt}`);
    else seen.set(key, q.id);
  }
  assert.deepEqual(dupes, []);
});

test("Szólétra: az azonosítók egyediek, az új azonosítók [a-z]\\d+ alakúak", () => {
  const ids = ALL_LADDER.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, "ismétlődő azonosító");
  const fresh = ids.filter((id) => /^[abcdf]\d{3}$/.test(id));
  assert.ok(fresh.length >= 300, `csak ${fresh.length} új azonosító`);
  for (const id of fresh) assert.match(id, /^[a-z]?\d+$/);
});

test("Szólétra: minden tétel négy különböző opcióval és érvényes helyes indexszel", () => {
  const bad = ALL_LADDER.filter((q) => {
    const opts = q.options.map((o) => o.trim().toLowerCase());
    return opts.length !== 4 || new Set(opts).size !== 4 || q.correctIndex < 0 || q.correctIndex > 3;
  }).map((q) => q.id);
  assert.deepEqual(bad, []);
});

/* ---------------------------------- Villám matek ---------------------------------- */

type MathTask = { prompt: string; options: number[]; correctIndex: number; explanation?: string; calc?: string; source: string };
type MathModule = {
  TEACHER_BANK: Record<number, MathTask[]>;
  GENERATOR_TEMPLATES: Record<number, number>;
  generatedTaskForGrade: (level: number) => MathTask;
};

const mathPage = read("client/src/pages/SpeedQuizMath.tsx");
const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Determinisztikus álvéletlen (mulberry32), hogy egy bukás visszajátszható legyen. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadMathModule(seed: number): MathModule {
  const start = mathPage.indexOf("function randInt");
  const end = mathPage.indexOf("function isMathTask");
  assert.ok(start >= 0 && end > start, "nem találom a Villám matek tiszta szakaszát — a teszt elavult");
  const js = ts.transpileModule(mathPage.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const context = vm.createContext({ __rng: seeded(seed) });
  vm.runInContext(
    `Math.random = __rng;\n${js}\nglobalThis.__out = { TEACHER_BANK, GENERATOR_TEMPLATES, generatedTaskForGrade };`,
    context,
  );
  return (context as unknown as { __out: MathModule }).__out;
}

const math = loadMathModule(20260929);

/** A `calc` értéke pontosan egy opcióval egyezik, és az a `correctIndex`. Hibaüzenet, vagy `null`. */
function oneCorrect(task: MathTask): string | null {
  if (!task.calc) return "nincs calc";
  let value: number;
  try {
    value = evaluateCalc(task.calc);
  } catch (error) {
    return `calc hiba: ${(error as Error).message}`;
  }
  const hits = task.options.flatMap((n, i) => (sameNumber(n, value) ? [i] : []));
  if (hits.length !== 1) return `calc=${value}: ${hits.length} egyező opció (${task.options.join(", ")})`;
  if (hits[0] !== task.correctIndex) return `calc=${value} a(z) ${hits[0]}. opció, correctIndex=${task.correctIndex}`;
  const expr = promptExpression(task.prompt);
  if (expr !== null && !sameNumber(evaluateCalc(expr), value)) return `a prompt kifejezése (${expr}) ≠ calc (${value})`;
  return null;
}

test("E6 Villám matek: minden évfolyamon ≥ 40 tanári feladat", () => {
  for (const g of GRADES) {
    assert.ok((math.TEACHER_BANK[g] ?? []).length >= 40, `${g}. évfolyam: ${(math.TEACHER_BANK[g] ?? []).length}`);
  }
});

test("E3 Villám matek: minden tanári feladatnak pontosan egy helyes opciója van (kiszámolva)", () => {
  const bad: string[] = [];
  let checked = 0;
  for (const g of GRADES) {
    for (const task of math.TEACHER_BANK[g] ?? []) {
      checked += 1;
      const problem = oneCorrect(task);
      if (problem) bad.push(`${g}. „${task.prompt}” → ${problem}`);
    }
  }
  assert.ok(checked >= 400, `csak ${checked} tétel`);
  assert.deepEqual(bad, []);
});

test("Villám matek tanári bank: négy különböző véges opció, műveleti jeles magyarázat, nincs ismétlődő prompt", () => {
  const bad: string[] = [];
  const prompts = new Map<string, number>();
  for (const g of GRADES) {
    for (const task of math.TEACHER_BANK[g] ?? []) {
      const where = `${g}. „${task.prompt.slice(0, 60)}”`;
      if (task.options.length !== 4 || !task.options.every(Number.isFinite)) bad.push(`${where}: nem 4 véges opció`);
      if (new Set(task.options.map((n) => n.toFixed(9))).size !== task.options.length) bad.push(`${where}: azonos opciók`);
      if (!/[+\-−×÷=]/.test(task.explanation ?? "")) bad.push(`${where}: nincs műveleti jel a magyarázatban`);
      const key = normalizePrompt(task.prompt);
      if (prompts.has(key)) bad.push(`${where}: a prompt már szerepel (${prompts.get(key)}. évfolyam)`);
      prompts.set(key, g);
    }
  }
  assert.deepEqual(bad, []);
});

test("Villám matek: minden évfolyam tanári bankjában van szorzás ÉS osztás", () => {
  for (const g of GRADES) {
    const bank = math.TEACHER_BANK[g] ?? [];
    assert.ok(bank.some((t) => (t.calc ?? "").includes("*")), `${g}. évfolyam: nincs szorzás`);
    assert.ok(bank.some((t) => (t.calc ?? "").includes("/")), `${g}. évfolyam: nincs osztás`);
  }
});

test("E6 Villám matek generátor: évfolyamonként ≥ 8 sablon, mind elérhető", () => {
  const start = mathPage.indexOf("function generatedTaskForGrade");
  const end = mathPage.indexOf("// Defensive fallback", start);
  const body = mathPage.slice(start, end);
  for (const g of GRADES) {
    const from = body.indexOf(`level === ${g}) {`);
    const next = g < 12 ? body.indexOf(`level === ${g + 1}) {`) : body.length;
    assert.ok(from >= 0 && next > from, `${g}. évfolyam ága hiányzik`);
    const templates = (body.slice(from, next).match(/^\s*result\s*=/gm) ?? []).length;
    assert.ok(templates >= 8, `${g}. évfolyam: ${templates} sablon`);
    assert.equal(math.GENERATOR_TEMPLATES[g], templates, `${g}. évfolyam: a sorsolás nem éri el mind a ${templates} sablont`);
  }
});

test("E3/E6 Villám matek generátor: 3000 futás évfolyamonként — pontosan egy helyes opció, van × és ÷", () => {
  const bad: string[] = [];
  for (const g of GRADES) {
    let mul = 0;
    let div = 0;
    for (let i = 0; i < 3000; i++) {
      const task = math.generatedTaskForGrade(g);
      const where = `${g}. „${task.prompt}”`;
      if (task.options.length !== 4 || !task.options.every(Number.isFinite)) bad.push(`${where}: nem 4 véges opció`);
      if (new Set(task.options).size !== 4) bad.push(`${where}: azonos opciók`);
      if (/undefined|NaN|Infinity/.test(`${task.prompt} ${task.explanation}`)) bad.push(`${where}: hibás szöveg`);
      if (!/[+\-−×÷=]/.test(task.explanation ?? "")) bad.push(`${where}: nincs műveleti jel`);
      const problem = oneCorrect(task);
      if (problem) bad.push(`${where} → ${problem}`);
      if ((task.calc ?? "").includes("*")) mul += 1;
      if ((task.calc ?? "").includes("/")) div += 1;
      if (bad.length > 20) break;
    }
    if (mul === 0 || div === 0) bad.push(`${g}. évfolyam generátora: szorzás ${mul}, osztás ${div}`);
  }
  assert.deepEqual(bad, []);
});

test("önellenőrzés: a kiértékelő a tankönyvi alakokat helyesen számolja", () => {
  assert.equal(evaluateCalc("2+3*4"), 14);
  assert.equal(evaluateCalc("-3^2"), -9);
  assert.equal(evaluateCalc("(-3)^3"), -27);
  assert.equal(evaluateCalc("2^3^2"), 512);
  assert.ok(sameNumber(evaluateCalc("8^(2/3)"), 4));
  assert.equal(evaluateCalc("C(6,2)+P(5,2)+fact(4)"), 15 + 20 + 24);
  assert.equal(evaluateCalc("sin(30)+cos(60)+tan(45)"), 2);
  assert.equal(evaluateCalc("log(2,32)+lg(1000)"), 8);
  assert.equal(evaluateCalc("mod(47,5)+gcd(12,18)+lcm(4,6)"), 2 + 6 + 12);
  assert.equal(promptExpression("(−24) ÷ (−6) = ?"), "(-24) / (-6)");
  assert.equal(promptExpression("2,5 + 1,25 = ?"), "2.5 + 1.25");
  assert.equal(promptExpression("Mennyi 7 × 8?"), null);
  assert.throws(() => evaluateCalc("process.exit(1)"));
});
