import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * G-2 — a Matek Sprint magyarázatai.
 *
 * A G-1 kártya működik, de a futó appban mérve (2026-09-07) ezt írta ki:
 * „A helyes válasz: 1770 — a(z) „1670” helyett." Igaz mondat, de matekból
 * kevés: a gyerek nem tudja meg, HOGYAN jön ki az 1770. A feladat szövege
 * viszont tartalmazza az összes számot, tehát a levezetés leírható.
 *
 * Ez az őr azt méri, hogy a bank tényleg hoz levezetést, nem csak eredményt:
 * a magyarázatban szerepeljen művelet is, ne csak a végszám.
 *
 * Statikus forráselemzés, mert a `TEACHER_BANK` és a generátor a page-en belül
 * él, és a page importálása React nélkül nem futtatható node:test alatt.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(root, "client/src/pages/SpeedQuizMath.tsx"), "utf8");

/** A tanári bank sorai: `{ prompt: "...", options: [...], correctIndex: n, ... }`. */
function teacherBankEntries(): string[] {
  const start = source.indexOf("const TEACHER_BANK");
  assert.ok(start >= 0, "nem találom a TEACHER_BANK-ot — a teszt elavult");
  const end = source.indexOf("\nfunction generatedTaskForGrade", start);
  assert.ok(end > start, "nem találom a TEACHER_BANK végét");

  const block = source.slice(start, end);
  return block.split("\n").filter((line) => line.includes("prompt:") && line.includes("correctIndex:"));
}

test("a tanári bank nem üres — különben a teszt semmit nem őriz", () => {
  assert.ok(teacherBankEntries().length >= 30, `csak ${teacherBankEntries().length} elem`);
});

test("minden tanári feladathoz tartozik magyarázat", () => {
  const missing = teacherBankEntries().filter((line) => !line.includes("explanation:"));

  assert.deepEqual(
    missing.map((l) => l.trim().slice(0, 70)),
    [],
    "magyarázat nélküli feladat: a gyerek csak az eredményt látná, a levezetést nem",
  );
});

test("a magyarázatok levezetést adnak, nem csak végeredményt", () => {
  const withoutOperator = teacherBankEntries().filter((line) => {
    const match = /explanation:\s*"([^"]*)"/.exec(line);
    if (!match) return true;
    // Legalább egy művelet jele kell bele: +, −, ×, ÷, = .
    return !/[+\-−×÷=]/.test(match[1] ?? "");
  });

  assert.deepEqual(
    withoutOperator.map((l) => l.trim().slice(0, 70)),
    [],
    "a magyarázat művelet nélkül csak megismétli az eredményt",
  );
});

test("a generált feladatok is hoznak levezetést", () => {
  const start = source.indexOf("function generatedTaskForGrade");
  const end = source.indexOf("function isMathTask", start);
  const block = source.slice(start, end);

  // Minden ág beállít egy eredményt; ugyanannyi helyen kell magyarázatot is adni.
  const results = (block.match(/^\s*result\s*=/gm) ?? []).length;
  const explanations = (block.match(/^\s*explanation\s*=/gm) ?? []).length;

  assert.ok(results > 0, "nem találok eredmény-ágakat — a teszt elavult");
  assert.equal(
    explanations,
    results,
    `${results} ágból ${explanations} ad magyarázatot — a többi néma marad`,
  );
});

test("a MathTask típus ismeri a magyarázat mezőt", () => {
  const start = source.indexOf("type MathTask");
  const block = source.slice(start, source.indexOf("};", start));
  assert.match(block, /explanation/, "a típus nem hordozza a magyarázatot");
});
