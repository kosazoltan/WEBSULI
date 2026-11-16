import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

import { createRng, seedFrom } from "../shared/game-rng";
import { pickFreshTask } from "../client/src/game-engine/no-repeat";
import { digitComplexity, pickByBand } from "../client/src/game-engine/levelTuning";

/**
 * Review #451 — a Matek feladatsora determinisztikus: azonos menet-seed → bitre azonos feladatsor (prompt + opciók
 * sorrendje), a tanári bank ÉS a generátor ágán is (a `pickFreshTask` is a menet RNG-jét kapja). A lap tiszta szakaszát
 * (`function randInt` … a J4a-komponens eleje) futtatjuk, a lap valódi importjaival.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(root, "client/src/pages/SpeedQuizMath.tsx"), "utf8");

type Task = { prompt: string; options: number[]; correctIndex: number; source: string };
type Mod = { setTaskRandom: (f: () => number) => void; pickTask: (g: number, seen: readonly string[], band?: number) => Task };

function load(): Mod {
  const start = page.indexOf("function randInt");
  const end = page.indexOf("/* ====");
  assert.ok(start >= 0 && end > start, "nem találom a tiszta szakaszt — a teszt elavult");
  const js = ts.transpileModule(page.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  // A globális Math.random itt hibát dob: ha bármely ág a menet RNG-je helyett azt hívná, a teszt elbukik.
  const ctx = vm.createContext({ pickFreshTask, pickByBand, digitComplexity, Math: Object.assign(Object.create(Math), { random: () => { throw new Error("Math.random a feladatválasztásban"); } }) });
  vm.runInContext(`${js}\nglobalThis.__out = { setTaskRandom, pickTask };`, ctx);
  return (ctx as unknown as { __out: Mod }).__out;
}

function sequence(m: Mod, seed: string, grade: number, n: number, band?: number): string[] {
  m.setTaskRandom(createRng(seedFrom("speed-quiz-math", seed, "tasks")).next);
  const seen: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = m.pickTask(grade, seen, band);
    seen.push(t.prompt);
    out.push(`${t.source}|${t.prompt}|${t.options.join(",")}|${t.correctIndex}`);
  }
  return out;
}

test("azonos seed → bitre azonos feladatsor minden évfolyamon (tanári + generált ág, pálya-sávval és anélkül); más seed → más", () => {
  const a = load();
  const b = load();
  for (const grade of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    for (const band of [undefined, 0.3, 0.8]) {
      const s1 = sequence(a, "run-1", grade, 40, band);
      const s2 = sequence(b, "run-1", grade, 40, band);
      assert.deepEqual(s1, s2, `${grade}. évfolyam, sáv ${band}`);
      assert.ok(s1.some((x) => x.startsWith("teacher|")) && s1.some((x) => x.startsWith("generated|")), `${grade}: mindkét ág fut`);
      assert.notDeepEqual(sequence(a, "run-2", grade, 40, band), s1, `${grade}: más seed → más sor`);
    }
  }
});
