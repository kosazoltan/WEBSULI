/**
 * Algebrai (betűs) végeredmény — spec docs/specs/2026-10-19-algebrai-referencia.md.
 *
 * Mért ok (2026-10-19, „Kéttagú kifejezések négyzete”, futás a3ede678): a típusos pontozó kifejezésnyelve csak számot ismert,
 * így az „x² + 10x + 25” referencia „nem értelmezhető” lett; a szerző a végeredményt szócsoportokba bontotta, amit a lektor
 * (helyesen) blokkolt — minden algebrai lecke megállt. Itt a polinom a kifejtett, összevont normálalakján hasonlítható.
 *
 * Szándékosan import-mentes: a kliens és a szerver ugyanezt futtatja.
 */

/** Monom-kulcs („a^2*b”, konstans: „”) → együttható. */
export type Polynomial = Map<string, number>;

type Tok =
  | { t: "num"; v: number }
  | { t: "var"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "pow"; v: number }
  | { t: "(" }
  | { t: ")" };

const MAX_TERMS = 400;
const MAX_POWER = 6;
const EPS = 1e-9;

const SUPERSCRIPT: Record<string, number> = { "²": 2, "³": 3, "⁴": 4, "⁵": 5, "⁶": 6 };

function tokenize(text: string): Tok[] | null {
  const out: Tok[] = [];
  const s = text.replace(/[\u00a0\u202f]/g, " ");
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0].replace(",", ".")) }); i += num[0].length; continue; }
    if (/[a-z]/i.test(c)) { out.push({ t: "var", v: c.toLowerCase() }); i++; continue; }
    if (c === "+") { out.push({ t: "op", v: "+" }); i++; continue; }
    if (/[-−–]/.test(c)) { out.push({ t: "op", v: "-" }); i++; continue; }
    if (/[·×*⋅]/.test(c)) { out.push({ t: "op", v: "*" }); i++; continue; }
    if (/[/:÷]/.test(c)) { out.push({ t: "op", v: "/" }); i++; continue; }
    if (c in SUPERSCRIPT) { out.push({ t: "pow", v: SUPERSCRIPT[c] }); i++; continue; }
    if (c === "^") {
      const m = /^\^\s*\(?\s*(\d+)\s*\)?/.exec(s.slice(i));
      if (!m) return null;
      out.push({ t: "pow", v: Number(m[1]) }); i += m[0].length; continue;
    }
    if (c === "(" || c === "[") { out.push({ t: "(" }); i++; continue; }
    if (c === ")" || c === "]") { out.push({ t: ")" }); i++; continue; }
    return null;
  }
  return out;
}

const monoKey = (powers: Map<string, number>): string =>
  [...powers.entries()].filter(([, p]) => p > 0).sort(([a], [b]) => a.localeCompare(b)).map(([v, p]) => (p === 1 ? v : `${v}^${p}`)).join("*");
const keyPowers = (key: string): Map<string, number> => {
  const m = new Map<string, number>();
  if (!key) return m;
  for (const part of key.split("*")) { const [v, p] = part.split("^"); m.set(v, (m.get(v) ?? 0) + (p ? Number(p) : 1)); }
  return m;
};
const clean = (p: Polynomial): Polynomial => { for (const [k, v] of p) if (Math.abs(v) < EPS) p.delete(k); return p; };
const constant = (v: number): Polynomial => clean(new Map([["", v]]));
const add = (a: Polynomial, b: Polynomial, sign = 1): Polynomial => {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) + sign * v);
  return clean(out);
};
const mul = (a: Polynomial, b: Polynomial): Polynomial | null => {
  const out: Polynomial = new Map();
  for (const [ka, va] of a) for (const [kb, vb] of b) {
    const powers = keyPowers(ka);
    for (const [v, p] of keyPowers(kb)) powers.set(v, (powers.get(v) ?? 0) + p);
    const k = monoKey(powers);
    out.set(k, (out.get(k) ?? 0) + va * vb);
  }
  return out.size > MAX_TERMS ? null : clean(out);
};
const isConstant = (p: Polynomial) => [...p.keys()].every((k) => k === "");

type Parsed = { poly: Polynomial; parens: boolean; topTerms: Polynomial[]; hasVariable: boolean };

function parseTokens(tokens: Tok[]): Parsed | null {
  let pos = 0;
  let parens = false;
  let hasVariable = false;
  const peek = () => tokens[pos];
  const primary = (): Polynomial | null => {
    const t = peek();
    if (!t) return null;
    if (t.t === "num") { pos++; return constant(t.v); }
    if (t.t === "var") { pos++; hasVariable = true; return new Map([[t.v, 1]]); }
    if (t.t === "(") {
      pos++; parens = true;
      const inner = expression();
      if (!inner || peek()?.t !== ")") return null;
      pos++; return inner.poly;
    }
    return null;
  };
  const factor = (): Polynomial | null => {
    let base = primary();
    while (base && peek()?.t === "pow") {
      const n = (peek() as { v: number }).v; pos++;
      if (!Number.isInteger(n) || n < 0 || n > MAX_POWER) return null;
      let acc: Polynomial | null = constant(1);
      for (let i = 0; i < n && acc; i++) acc = mul(acc, base);
      base = acc;
    }
    return base;
  };
  const term = (): Polynomial | null => {
    let sign = 1;
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "-" || (peek() as { v: string }).v === "+")) { if ((peek() as { v: string }).v === "-") sign = -sign; pos++; }
    let left = factor();
    if (!left) return null;
    for (;;) {
      const t = peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/")) {
        pos++;
        const right = factor();
        if (!right) return null;
        if (t.v === "*") { left = mul(left, right); if (!left) return null; continue; }
        // Osztás csak nem-nulla számmal (a racionális törtkifejezés nem-cél).
        if (!isConstant(right) || Math.abs(right.get("") ?? 0) < EPS) return null;
        left = mul(left, constant(1 / (right.get("") ?? 1)));
        if (!left) return null;
        continue;
      }
      // Implicit szorzás: „2ab”, „3(x+1)”, „(x+1)(x-1)”, „x(x+2)” — szám után szám nem (kétértelmű).
      if (t && (t.t === "var" || t.t === "(")) { const right = factor(); if (!right) return null; left = mul(left, right); if (!left) return null; continue; }
      break;
    }
    return sign === 1 ? left : mul(left, constant(-1));
  };
  const expression = (): { poly: Polynomial; terms: Polynomial[] } | null => {
    const first = term();
    if (!first) return null;
    let acc = first;
    const terms = [first];
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "+" || (peek() as { v: string }).v === "-")) {
      const next = term(); // a term maga kezeli az előjelet
      if (!next) return null;
      terms.push(next);
      acc = add(acc, next);
      if (acc.size > MAX_TERMS) return null;
    }
    return { poly: acc, terms };
  };
  const result = expression();
  if (!result || pos !== tokens.length) return null;
  return { poly: result.poly, parens, topTerms: result.terms, hasVariable };
}

/** A szöveg mint EGYETLEN polinom; null, ha nem értelmezhető. */
export function parsePolynomial(text: string): Parsed | null {
  const tokens = tokenize(text.trim());
  if (!tokens || !tokens.length) return null;
  return parseTokens(tokens);
}

export const isPolynomialText = (value: unknown): boolean => typeof value === "string" && parsePolynomial(value) !== null;

export function polyEquals(a: Polynomial, b: Polynomial): boolean {
  const diff = add(a, b, -1);
  for (const v of diff.values()) if (Math.abs(v) > 1e-6) return false;
  return true;
}

/** Kifejtett, összevont alak: nincs zárójel, és minden monom legfeljebb egyszer szerepel (a „5x + 5x” nem összevont). */
export function isExpanded(p: Parsed): boolean {
  if (p.parens) return false;
  const keys = p.topTerms.map((t) => [...t.keys()][0] ?? "");
  if (p.topTerms.some((t) => t.size > 1)) return false;
  return new Set(keys).size === keys.length;
}

/**
 * A szövegben (tanulói válasz vagy kérdés) álló polinom-jelöltek sorrendben. A próza szavai, az `=`, a `;`, a sortörés, a
 * szóközzel követett vessző/kettőspont és a részfeladat-jel („a)”, „2)”) határol; a jelölt a TELJES szakasz (nem részlete —
 * a „x² + 10x + 25 + 1” nem lehet helyes egy részlete miatt).
 */
export function polynomialCandidates(text: string): Array<{ text: string; parsed: Parsed; start: number; end: number }> {
  // Hosszmegtartó jelölés: a jelölt pozíciója az eredeti szövegben marad (a pontozó közös sorrend-kurzora ezt követi — review #319).
  const marked = text
    .replace(/(^|[\s,;])((?:[a-z]|\d{1,2})\))(?=\s)/gi, (_m, pre: string, label: string) => pre + "\n".repeat(label.length))
    // Review #319: a mondatzáró „?” és „!” is határ („Bontsd ki: (x+5)²!”).
    .replace(/[=;≠<>≤≥\n?!]|[,:](?=\s|$)|\.(?=\s|$)/g, "\n");
  const out: Array<{ text: string; parsed: Parsed; start: number; end: number }> = [];
  let chunkStart = 0;
  for (const chunk of marked.split("\n")) {
    // Próza-szó: nem ASCII-betűhöz tapadó betűsor, vagy olyan ≥2 betűs szó, amelynek egyik szomszédja sem műveleti jel.
    const words = chunk.split(/(\s+)/);
    let current = "";
    let currentStart = 0;
    let offset = 0;
    const flush = () => {
      const lead = current.length - current.trimStart().length;
      const t = current.trim(); current = "";
      if (!t) return;
      const parsed = parsePolynomial(t);
      if (parsed) out.push({ text: t, parsed, start: chunkStart + currentStart + lead, end: chunkStart + currentStart + lead + t.length });
    };
    for (let i = 0; i < words.length; offset += words[i].length, i++) {
      const w = words[i];
      if (!current) currentStart = offset;
      if (/^\s+$/.test(w) || !w) { current += w; continue; }
      const prev = words.slice(0, i).reverse().find((x) => x && !/^\s+$/.test(x)) ?? "";
      const next = words.slice(i + 1).find((x) => x && !/^\s+$/.test(x)) ?? "";
      const opNear = /[+\-−–·×*/^(]$/.test(prev) || /^[+\-−–·×*/^)²³]/.test(next);
      const prose = /[^ -~]/.test(w.replace(/[²³⁴⁵⁶·×−–⋅÷]/g, ""))
        || (/^[a-z]{2,}[.,!?]?$/i.test(w) && !opNear)
        || (/^[a-z][.,!?]?$/i.test(w) && !opNear && !/[\d)²³]$/.test(prev));
      // Két, műveleti jel nélkül egymás mellé írt kifejezés két jelölt („x²+1 x²-1”); zárójel előtt nem vágunk („3 (x+1)”).
      const glued = current.trim() && !/^[+\-−–·×*/^)²³(]/.test(w) && !/[+\-−–·×*/^(]$/.test(current.trim());
      if (prose) { flush(); continue; }
      if (glued) { flush(); currentStart = offset; }
      current += w;
    }
    flush();
    chunkStart += chunk.length + 1;
  }
  return out;
}

/**
 * Szorzattá alakított alak (review #319): a TELJES kifejezés egyetlen felső szintű szorzat (vagy zárójeles hatvány), amelyben
 * zárójeles tényező áll — az „x² + 10x + (25)” zárójele ellenére összeg, és a teljes egészében zárójelbe tett összeg
 * („(x² + 10x + 25)”) sem szorzat.
 */
export function isFactored(p: Parsed, text: string): boolean {
  if (!p.parens || p.topTerms.length !== 1 || p.topTerms[0].size < 2) return false;
  let t = text.trim();
  const wrapped = (x: string) => {
    if (!/^[([]/.test(x) || !/[)\]]$/.test(x)) return false;
    let depth = 0;
    for (let i = 0; i < x.length; i++) {
      if (/[([]/.test(x[i])) depth++;
      else if (/[)\]]/.test(x[i]) && --depth === 0 && i < x.length - 1) return false;
    }
    return true;
  };
  while (wrapped(t)) t = t.slice(1, -1).trim();
  const inner = parsePolynomial(t);
  return !!inner && inner.parens && inner.topTerms.length === 1;
}

export function formatPolynomial(p: Polynomial): string {
  if (!p.size) return "0";
  return [...p.entries()].sort(([a], [b]) => b.length - a.length || a.localeCompare(b)).map(([k, v], i) => {
    const abs = Math.abs(v), sign = v < 0 ? (i ? " − " : "−") : (i ? " + " : "");
    const coef = k && Math.abs(abs - 1) < EPS ? "" : String(Math.round(abs * 1e6) / 1e6);
    return `${sign}${coef}${k.replace(/\*/g, "")}`;
  }).join("");
}
