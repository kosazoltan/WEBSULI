import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  GRADE_QUIZ_ITEMS,
  GRADE_SUBJECTS,
  MAX_GRADE,
  MIN_GRADE,
  type GradeQuizItem,
} from "../client/src/data/gradeQuizBank";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-jatekok-3-12-evfolyam.md, 1. és 5. döntés): a közös évfolyam-bank
 * minimuma és szerkezeti épsége, valamint a számolható matek-tételek tényleges helyessége.
 *
 * A számolós ellenőrzés nem a megjelölt választ nézi, hanem MINDEN opciót: pontosan egynek kell egyeznie a
 * kiszámolt igazsággal (két „helyes" opció ugyanúgy büntetheti a gyereket, mint egy rossz kulcs).
 */

const GRADES = Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => MIN_GRADE + i);
const pad = (n: number) => String(n).padStart(2, "0");
const where = (q: GradeQuizItem) => `${q.id} „${q.prompt}"`;

/* ------------------------------ darabszám ------------------------------ */

test("minden évfolyam × tárgy legalább 18 tétel, szintenként legalább 6", () => {
  const bad: string[] = [];
  for (const grade of GRADES) {
    for (const subject of GRADE_SUBJECTS) {
      const items = GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade && q.subject === subject);
      if (items.length < 18) bad.push(`${grade}. évf. ${subject}: ${items.length} tétel`);
      for (const tier of [1, 2, 3] as const) {
        const n = items.filter((q) => q.tier === tier).length;
        if (n < 6) bad.push(`${grade}. évf. ${subject} tier ${tier}: ${n} tétel`);
      }
    }
  }
  assert.deepEqual(bad, [], `hiányos lefedés:\n${bad.join("\n")}`);
});

test("csak 3–12. évfolyam, ismert tárgy és szint", () => {
  const bad = GRADE_QUIZ_ITEMS.filter(
    (q) =>
      !Number.isInteger(q.grade) || q.grade < MIN_GRADE || q.grade > MAX_GRADE ||
      !GRADE_SUBJECTS.includes(q.subject) || ![1, 2, 3].includes(q.tier),
  ).map(where);
  assert.deepEqual(bad, []);
});

/* ------------------------------ azonosító ------------------------------ */

test("az azonosító jól formált, egyedi, és egyezik az évfolyammal és a tárggyal", () => {
  const seen = new Set<string>();
  const bad: string[] = [];
  for (const q of GRADE_QUIZ_ITEMS) {
    const m = /^g(\d{2})-(math|english|hungarian|science|history)-(\d{3})$/.exec(q.id);
    if (!m) bad.push(`${q.id}: rossz alak`);
    else if (Number(m[1]) !== q.grade || m[2] !== q.subject) bad.push(`${q.id}: grade/subject eltér`);
    if (seen.has(q.id)) bad.push(`${q.id}: ismétlődik`);
    seen.add(q.id);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a prompt évfolyamon belül egyedi", () => {
  const bad: string[] = [];
  for (const grade of GRADES) {
    const seen = new Map<string, string>();
    for (const q of GRADE_QUIZ_ITEMS.filter((x) => x.grade === grade)) {
      const key = q.prompt.trim().toLowerCase().replace(/\s+/g, " ");
      if (key.length === 0) bad.push(`${q.id}: üres prompt`);
      const prev = seen.get(key);
      if (prev) bad.push(`${q.id} = ${prev}: „${q.prompt}"`);
      seen.set(key, q.id);
    }
  }
  assert.deepEqual(bad, [], `ismétlődő prompt:\n${bad.join("\n")}`);
});

/* ------------------------------ opciók ------------------------------ */

test("pontosan 4 különböző, nem üres opció; a kulcs tartományban", () => {
  const bad: string[] = [];
  for (const q of GRADE_QUIZ_ITEMS) {
    const norm = q.options.map((o) => o.trim().toLowerCase().replace(/\s+/g, " "));
    if (q.options.length !== 4) bad.push(`${where(q)}: ${q.options.length} opció`);
    if (new Set(norm).size !== norm.length) bad.push(`${where(q)}: azonos opciók → ${q.options.join(" | ")}`);
    if (norm.some((o) => o.length === 0)) bad.push(`${where(q)}: üres opció`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      bad.push(`${where(q)}: correctIndex ${q.correctIndex}`);
    }
    if (q.options.some((o) => /\((helyes|jó|ez a jó|megoldás|correct)\)/i.test(o))) bad.push(`${where(q)}: árulkodó opció`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a helyes válasz helye változatos (évfolyam × tárgy legalább 3 különböző pozíció)", () => {
  const bad: string[] = [];
  for (const grade of GRADES) {
    for (const subject of GRADE_SUBJECTS) {
      const positions = new Set(
        GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade && q.subject === subject).map((q) => q.correctIndex),
      );
      if (positions.size < 3) bad.push(`${grade}. évf. ${subject}: csak ${[...positions].join(",")}`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/* ------------------------------ magyarázat ------------------------------ */

/** A helyes opció „tartalmas" szavai (ugyanaz a szabály, mint a game-quiz-explanations tesztben). */
function keywords(option: string): string[] {
  return option
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length >= 3)
    .map((w) => w.toLowerCase());
}

const ORDINAL =
  /\b(az? )?(első|második|harmadik|negyedik) (válasz|opció|lehetőség)\b|\b[A-D]\)\s|\b[A-D] (válasz|opció|lehetőség)\b/i;

test("a magyarázat 30–300 karakter, a helyes válaszra mutat, és nem hivatkozik sorrendre", () => {
  const bad: string[] = [];
  for (const q of GRADE_QUIZ_ITEMS) {
    const why = q.explanation.trim();
    if (why.length < 30 || why.length > 300) bad.push(`${q.id}: hossz ${why.length}`);
    if (ORDINAL.test(why)) bad.push(`${q.id}: sorszámra hivatkozik`);
    const words = keywords(q.options[q.correctIndex] ?? "");
    if (words.length > 0 && !words.some((w) => why.toLowerCase().includes(w))) {
      bad.push(`${q.id}: nem említi a helyes választ („${q.options[q.correctIndex]}")`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/* ------------------------------ forrás: egy tétel = egy sor ------------------------------ */

test("a bankfájlokban minden tétel egyetlen sor (a meglévő szkennerek miatt)", () => {
  const bad: string[] = [];
  let total = 0;
  for (const grade of GRADES) {
    const file = `../client/src/data/gradeQuizBank/grade-${pad(grade)}.ts`;
    const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
    const lines = src.split("\n").filter((l) => /\{ id: "g\d{2}-/.test(l));
    for (const line of lines) {
      if (!/correctIndex:\s*\d/.test(line) || !/explanation:\s*"/.test(line) || !/\},\s*$/.test(line.trimEnd())) {
        bad.push(`grade-${pad(grade)}.ts: ${line.trim().slice(0, 60)}`);
      }
      if (!line.includes(`{ id: "g${pad(grade)}-`)) bad.push(`grade-${pad(grade)}.ts: idegen évfolyam: ${line.trim().slice(0, 40)}`);
      // A szkenner `options: [ ... ]` mintája az első `]`-ig olvas.
      const optionsRaw = /options:\s*\[([^\]]*)\]/.exec(line)?.[1] ?? "";
      if ([...optionsRaw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].length !== 4) bad.push(`grade-${pad(grade)}.ts: opciók nem olvashatók: ${line.trim().slice(0, 40)}`);
    }
    total += lines.length;
    const inModule = GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade).length;
    if (lines.length !== inModule) bad.push(`grade-${pad(grade)}.ts: ${lines.length} sor ≠ ${inModule} tétel`);
  }
  assert.equal(total, GRADE_QUIZ_ITEMS.length);
  assert.deepEqual(bad, [], bad.join("\n"));
});

/* ------------------------------ számolható matek ------------------------------ */

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "fn"; v: string; base?: number } | { t: "x" };

const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

function normalize(s: string): string {
  let out = s
    .replace(/[−–]/g, "-")
    .replace(/[·×*]/g, "*")
    .replace(/[:÷]/g, "/")
    .replace(/[[{]/g, "(")
    .replace(/[\]}]/g, ")")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^(${[...m].map((c) => SUP[c]).join("")})`)
    .replace(/log[_ ]?([₀₁₂₃₄₅₆₇₈₉]+)/g, (_, b: string) => `log_${[...b].map((c) => SUB[c]).join("")} `)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/°/g, "");
  // Ezres tagolás („12 500") — csak pontosan 3 jegyű csoport után.
  while (/(\d) (\d{3})(?!\d)/.test(out)) out = out.replace(/(\d) (\d{3})(?!\d)/, "$1$2");
  return out;
}

function tokenize(src: string): Tok[] | null {
  const s = normalize(src);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) { i++; continue; }
    const num = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const log = /^log_(\d+)/.exec(s.slice(i));
    if (log) { out.push({ t: "fn", v: "log", base: Number(log[1]) }); i += log[0].length; continue; }
    const fn = /^(lg|ln|sin|cos|tg|tan)(?![a-z])/.exec(s.slice(i));
    if (fn) { out.push({ t: "fn", v: fn[1]! }); i += fn[0].length; continue; }
    if (c === "π") { out.push({ t: "num", v: Math.PI }); i++; continue; }
    if (c === "x" && !/[a-záéíóöőúüű]/i.test(s[i + 1] ?? "") && !/[a-záéíóöőúüű]/i.test(s[i - 1] ?? "")) { out.push({ t: "x" }); i++; continue; }
    if ("+-*/^()√!%".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    return null;
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 20) return NaN;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

/** Rekurzív leszálló elemző; `null`, ha a szöveg nem teljes kifejezés. */
function evaluate(src: string, x?: number): number | null {
  const toks = tokenize(src);
  if (!toks || toks.length === 0) return null;
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return t?.t === "op" && t.v === v; };
  const startsPrimary = () => { const t = peek(); return !!t && (t.t === "num" || t.t === "x" || t.t === "fn" || (t.t === "op" && (t.v === "(" || t.v === "√"))); };

  function primary(): number {
    const t = toks![p++];
    if (!t) throw new Error("vége");
    if (t.t === "num") return t.v;
    if (t.t === "x") { if (x === undefined) throw new Error("x"); return x; }
    if (t.t === "fn") {
      const a = postfix();
      if (t.v === "log") return Math.log(a) / Math.log(t.base!);
      if (t.v === "lg") return Math.log10(a);
      if (t.v === "ln") return Math.log(a);
      const rad = (a * Math.PI) / 180;
      if (t.v === "sin") return Math.sin(rad);
      if (t.v === "cos") return Math.cos(rad);
      return Math.tan(rad);
    }
    if (t.v === "(") { const v = expr(); if (!isOp(")")) throw new Error(")"); p++; return v; }
    if (t.v === "√") return Math.sqrt(postfix());
    throw new Error(`váratlan ${t.v}`);
  }
  function postfix(): number {
    let v = primary();
    for (;;) {
      if (isOp("!")) { p++; v = factorial(v); } else if (isOp("%")) { p++; v /= 100; } else break;
    }
    return v;
  }
  function power(): number {
    const base = postfix();
    if (isOp("^")) { p++; return base ** unary(); }
    return base;
  }
  function unary(): number {
    if (isOp("-")) { p++; return -unary(); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (isOp("*")) { p++; v *= unary(); } else if (isOp("/")) { p++; v /= unary(); } else if (startsPrimary()) { v *= power(); } else break;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    for (;;) {
      if (isOp("+")) { p++; v += term(); } else if (isOp("-")) { p++; v -= term(); } else break;
    }
    return v;
  }
  try {
    const v = expr();
    return p === toks.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Egy opció számértéke (`x = 4`, `3/4`, `−2,5`, `2√3`, `1 1/2`, mértékegységgel is); `null`, ha nem szám. */
function optionValue(option: string): number | null {
  let s = option.trim().replace(/^x\s*=\s*/, "");
  const mixed = /^(\d+) (\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const direct = evaluate(s);
  if (direct !== null) return direct;
  s = s.replace(/(?:\s*[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ²³°]+\.?)+$/u, "");
  return /\d/.test(s) ? evaluate(s) : null;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/** Az opciónkénti igazság a prompt alapján; `null`, ha a tétel nem számolható. */
function optionTruths(q: GradeQuizItem): boolean[] | null {
  const prompt = q.prompt.trim();

  const div = /Melyik szám (nem )?osztható (.+?)\?/i.exec(prompt);
  if (div) {
    const divisors = [...div[2]!.matchAll(/(\d+)-/g)].map((m) => Number(m[1]));
    const values = q.options.map((o) => (/^-?\d+$/.test(o.trim()) ? Number(o.trim()) : NaN));
    if (divisors.length === 0 || values.some((v) => Number.isNaN(v))) return null;
    return values.map((v) => divisors.every((d) => v % d === 0) !== Boolean(div[1]));
  }

  let truth: number | null = null;
  const pct = /Mennyi (\d+(?:,\d+)?)\s*-\s*\p{L}+ (?:a|az) (\d+(?:,\d+)?)\s*%\s*-\s*a\?/u.exec(prompt);
  const lnko = /(\d+) és (\d+) legnagyobb közös osztója/.exec(prompt);
  const lkkt = /(\d+) és (\d+) legkisebb közös többszöröse/.exec(prompt);
  const eq = /^Oldd meg[^:]*:\s*(.+?)[.?]?\s*$/.exec(prompt);
  const calc = /^Számold ki:\s*(.+?)\s*(?:=\s*\?)?\s*[.?]?\s*$/.exec(prompt) ?? /^Mennyi\s+(.+?)\s*(?:=\s*)?\?$/.exec(prompt);

  if (pct) truth = (Number(pct[1]!.replace(",", ".")) * Number(pct[2]!.replace(",", "."))) / 100;
  else if (lnko) truth = gcd(Number(lnko[1]), Number(lnko[2]));
  else if (lkkt) truth = (Number(lkkt[1]) * Number(lkkt[2])) / gcd(Number(lkkt[1]), Number(lkkt[2]));
  else if (eq && (eq[1]!.match(/=/g) ?? []).length === 1) {
    const [lhs, rhs] = eq[1]!.split("=");
    const values = q.options.map(optionValue);
    if (values.some((v) => v === null)) return null;
    const truths = values.map((v) => {
      const l = evaluate(lhs!, v!);
      const r = evaluate(rhs!, v!);
      return l !== null && r !== null && close(l, r);
    });
    // Ha az egyenlet maga nem értelmezhető (egyik opcióra sem számolható), nem számolható tétel.
    if (values.every((v) => evaluate(lhs!, v!) === null || evaluate(rhs!, v!) === null)) return null;
    return truths;
  } else if (calc) truth = evaluate(calc[1]!);

  if (truth === null) return null;
  const values = q.options.map(optionValue);
  if (values.some((v) => v === null)) return null;
  return values.map((v) => close(v!, truth!));
}

test("a számolható matek-tételeknél pontosan egy opció igaz, és az a kulcs", () => {
  const bad: string[] = [];
  const coverage: string[] = [];
  for (const grade of GRADES) {
    const math = GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade && q.subject === "math");
    let checked = 0;
    for (const q of math) {
      const truths = optionTruths(q);
      if (!truths) continue;
      checked++;
      const trueIdx = truths.flatMap((t, i) => (t ? [i] : []));
      if (trueIdx.length !== 1 || trueIdx[0] !== q.correctIndex) {
        bad.push(`${where(q)} → igaz opciók: [${trueIdx.map((i) => q.options[i]).join(" | ")}], kulcs: ${q.options[q.correctIndex]}`);
      }
    }
    if (math.length === 0 || checked / math.length < 0.4) coverage.push(`${grade}. évf.: ${checked}/${math.length} ellenőrzött`);
  }
  assert.deepEqual(bad, [], `hibás számolós tétel:\n${bad.join("\n")}`);
  assert.deepEqual(coverage, [], `kevés számolható matek-tétel:\n${coverage.join("\n")}`);
});

test("az önellenőrzés: a kiértékelő a vállalt alakokat helyesen számolja", () => {
  assert.equal(evaluate("-3 + 8"), 5);
  assert.equal(evaluate("2³ · 3"), 24);
  assert.equal(evaluate("−2²"), -4);
  assert.equal(evaluate("(−2)²"), 4);
  assert.equal(evaluate("3/4 + 1/8"), 0.875);
  assert.equal(evaluate("12 500 : 5"), 2500);
  assert.equal(evaluate("0,25 · 8"), 2);
  assert.equal(evaluate("√(9 + 16)"), 5);
  assert.ok(close(evaluate("2√3")!, 2 * Math.sqrt(3)));
  assert.ok(close(evaluate("log₂ 32")!, 5));
  assert.ok(close(evaluate("lg 1000")!, 3));
  assert.ok(close(evaluate("sin 30° + cos 60°")!, 1));
  assert.equal(evaluate("5!"), 120);
  assert.equal(evaluate("2x + 3", 4), 11);
  assert.equal(evaluate("3 kutya"), null);
  assert.equal(optionValue("x = −2"), -2);
  assert.equal(optionValue("1 1/2"), 1.5);
  assert.equal(optionValue("16 cm²"), 16);
  assert.equal(optionValue("kutya"), null);
  const item = (prompt: string, options: string[]): GradeQuizItem =>
    ({ id: "g07-math-999", grade: 7, subject: "math", tier: 1, prompt, options, correctIndex: 0, explanation: "" });
  assert.deepEqual(optionTruths(item("Oldd meg: 2x + 3 = 11", ["x = 4", "x = 7", "x = 3", "x = 5,5"])), [true, false, false, false]);
  assert.deepEqual(optionTruths(item("Melyik szám osztható 3-mal és 5-tel is?", ["45", "35", "33", "50"])), [true, false, false, false]);
  assert.deepEqual(optionTruths(item("Mennyi 80-nak a 25%-a?", ["20", "25", "32", "55"])), [true, false, false, false]);
  assert.deepEqual(optionTruths(item("Mennyi 12 és 18 legnagyobb közös osztója?", ["6", "3", "36", "2"])), [true, false, false, false]);
  assert.equal(optionTruths(item("Mennyi a 3 cm oldalú négyzet területe?", ["9 cm²", "6 cm²", "12 cm²", "3 cm²"])), null);
});
