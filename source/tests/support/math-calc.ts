/**
 * Biztonságos számológép a Villám matek `calc` mezőjéhez (teszt- és ellenőrző segéd, nem alkalmazáskód).
 *
 * Nincs `eval`: kis rekurzív leszálló elemző. Nyelvtan:
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := '-' unary | power
 *   power  := atom ('^' unary)?          (jobbról köt: 2^3^2 = 2^9)
 *   atom   := number | name '(' args ')' | '(' expr ')'
 * Függvények: sqrt, cbrt, abs, fact, C(n,k), P(n,k), log(b,x), lg, ln, sin/cos/tan (FOKBAN), min, max,
 * mod(a,b) (nemnegatív maradék), gcd(a,b), lcm(a,b).
 */

type Fn = (...args: number[]) => number;

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error(`fact: érvénytelen ${n}`);
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

const DEG = Math.PI / 180;
/** A tankönyvi szögek pontos értéke (a lebegőpontos zaj nélkül). */
function trig(kind: "sin" | "cos" | "tan", deg: number): number {
  const exact: Record<string, number> = {
    "sin:0": 0, "sin:30": 0.5, "sin:90": 1, "sin:150": 0.5, "sin:180": 0, "sin:210": -0.5, "sin:270": -1, "sin:330": -0.5,
    "cos:0": 1, "cos:60": 0.5, "cos:90": 0, "cos:120": -0.5, "cos:180": -1, "cos:240": -0.5, "cos:270": 0, "cos:300": 0.5, "cos:360": 1,
    "tan:0": 0, "tan:45": 1, "tan:135": -1, "tan:180": 0, "tan:225": 1, "tan:315": -1,
  };
  const key = `${kind}:${deg}`;
  if (key in exact) return exact[key]!;
  const v = kind === "sin" ? Math.sin(deg * DEG) : kind === "cos" ? Math.cos(deg * DEG) : Math.tan(deg * DEG);
  return v;
}

const FUNCS: Record<string, Fn> = {
  sqrt: (x) => { if (x < 0) throw new Error("sqrt negatív"); return Math.sqrt(x); },
  cbrt: (x) => Math.cbrt(x),
  abs: (x) => Math.abs(x),
  fact: (n) => factorial(n),
  C: (n, k) => factorial(n) / (factorial(k) * factorial(n - k)),
  P: (n, k) => factorial(n) / factorial(n - k),
  log: (b, x) => Math.log(x) / Math.log(b),
  lg: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  sin: (d) => trig("sin", d),
  cos: (d) => trig("cos", d),
  tan: (d) => trig("tan", d),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  mod: (a, b) => {
    if (!Number.isInteger(a) || !Number.isInteger(b) || b <= 0) throw new Error(`mod: érvénytelen ${a}, ${b}`);
    return ((a % b) + b) % b;
  },
  gcd: (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x;
  },
  lcm: (a, b) => Math.abs(a * b) / FUNCS.gcd!(a, b),
};

export function evaluateCalc(source: string): number {
  const s = source.replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  const expect = (c: string) => {
    if (s[i] !== c) throw new Error(`„${c}” várt a(z) ${i}. helyen: ${source}`);
    i++;
  };
  function number(): number {
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`szám várt a(z) ${i}. helyen: ${source}`);
    i += m[0].length;
    return Number(m[0]);
  }
  function atom(): number {
    const c = peek();
    if (c === "(") { i++; const v = expr(); expect(")"); return v; }
    if (c !== undefined && /\d/.test(c)) return number();
    const m = /^[A-Za-z]+/.exec(s.slice(i));
    if (!m) throw new Error(`váratlan jel a(z) ${i}. helyen: ${source}`);
    const fn = FUNCS[m[0]];
    if (!fn) throw new Error(`ismeretlen függvény: ${m[0]}`);
    i += m[0].length;
    expect("(");
    const args = [expr()];
    while (peek() === ",") { i++; args.push(expr()); }
    expect(")");
    return fn(...args);
  }
  function power(): number {
    const base = atom();
    if (peek() === "^") { i++; return Math.pow(base, unary()); }
    return base;
  }
  function unary(): number {
    if (peek() === "-") { i++; return -unary(); }
    if (peek() === "+") { i++; return unary(); }
    return power();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      const c = peek();
      if (c === "*") { i++; v *= unary(); }
      else if (c === "/") { i++; const d = unary(); if (d === 0) throw new Error("nullával osztás"); v /= d; }
      else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      const c = peek();
      if (c === "+") { i++; v += term(); }
      else if (c === "-") { i++; v -= term(); }
      else return v;
    }
  }
  const value = expr();
  if (i !== s.length) throw new Error(`fölösleges szöveg a(z) ${i}. helytől: ${source}`);
  if (!Number.isFinite(value)) throw new Error(`nem véges eredmény: ${source}`);
  return value;
}

/** Két szám egyenlősége a lebegőpontos zajon túl (relatív 1e-9). */
export function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * A kijelzett `a op b op c = ?` alakú prompt kifejezése a kiértékelő nyelvén (× → *, ÷ → /, − → -,
 * tizedesvessző → pont). `null`, ha a prompt nem tiszta kifejezés.
 */
export function promptExpression(prompt: string): string | null {
  const m = /^(.*)=\s*\?\s*$/.exec(prompt.trim());
  if (!m) return null;
  const raw = m[1]!.trim();
  if (!/^[\d\s+\-−×÷()^,.]+$/.test(raw)) return null;
  return raw.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/(\d),(\d)/g, "$1.$2");
}
