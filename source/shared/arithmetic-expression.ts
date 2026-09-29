/**
 * Közös számtani kifejezés-kiértékelő (áthelyezve a `server/studio/tools/arithmetic-claims.ts`-ből, viselkedés-
 * változás nélkül — spec 2026-09-29 egy-helyes-valasz): a `shared/single-choice-check.ts` (és így a kliens
 * `isPlayableQuestion`-je) is ezt használja. Csak egész és tizedes számokkal, törtekkel, + − · : műveletekkel,
 * szorzás/osztás elsőbbségével; zárójeles kifejezést nem értékel.
 */

export const OPS = "+\\-−–·×*:÷/";
/** Élő futás 68a5b500: a szóközös ezres tagolás („12 000”) egy szám — különben „000 : 4 = 3000” téves riasztás. */
export const NUM = "(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
/**
 * Élő futás 351e14cc (2026-09-24): a „–6 + 11 = 5” és az „1 1/2 = 3/2” helyes állítást a minta „6 + 11 = 5”-nek
 * és „1/2 = 3/2”-nek olvasta — a 10. fejezet (egész számok) javító körét két kísérletben CSAK ez buktatta. Ezért:
 * a kifejezés elején előjel állhat (közvetlenül szám előtt), a vegyes tört („1 5/12”) és a tört („3/4”) EGY szám,
 * a törtvonal erősebben köt, mint a · és a : („3/2 : 3/4 = 2”).
 */
export const SIGN = "[\\-−–]";
export const ATOM = `\\d+\\s+\\d+\\s*/\\s*\\d+|${NUM}(?:\\s*/\\s*${NUM})?`;
export const EXPR = `(?:${SIGN}(?=\\d))?(?:${ATOM})(?:\\s*[${OPS}]\\s*(?:${ATOM}))*`;

function toNumber(s: string): number { return Number(s.replace(/[ \u00a0\u202f]/g, "").replace(",", ".")); }

/** Egy szám értéke: egész/tizedes, tört („3/4”) vagy vegyes tört („1 5/12”); NaN, ha nem értelmezhető. */
export function atomValue(atom: string): number {
  const mixed = atom.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[3]) === 0 ? NaN : Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const [a, b] = atom.split("/").map((s) => toNumber(s.trim()));
  if (b === undefined) return a;
  return b === 0 ? NaN : a / b;
}

/** Evaluate `a op b op c …` with · : before + −; a lone number is itself; null when inexact/unparsable. */
export function evaluateExpression(expr: string): number | null {
  if (/[()[\]]/.test(expr)) return null;
  const matched = expr.match(new RegExp(`${ATOM}|[${OPS}]`, "g"));
  if (!matched) return null;
  let tokens: string[] = [...matched];
  const negative = tokens.length > 1 && new RegExp(`^${SIGN}$`).test(tokens[0]) && /\d/.test(tokens[1]);
  if (negative) tokens = tokens.slice(1);
  if (tokens.length % 2 === 0) return null;
  const first = (negative ? -1 : 1) * atomValue(tokens[0]);
  if (Number.isNaN(first)) return null;
  if (tokens.length === 1) return first;
  const values: number[] = [first];
  const ops: string[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const value = atomValue(tokens[i + 1]);
    if (Number.isNaN(value)) return null;
    if (/[·×*:÷/]/.test(op)) {
      const left = values.pop()!;
      if (/[:÷/]/.test(op)) {
        if (value === 0) return null;
        const q = left / value;
        if (!Number.isFinite(q) || Math.abs(q * value - left) > 1e-9) return null;
        values.push(q);
      } else values.push(left * value);
    } else { values.push(value); ops.push(op); }
  }
  let result = values[0];
  for (let i = 0; i < ops.length; i++) result = /[+]/.test(ops[i]) ? result + values[i + 1] : result - values[i + 1];
  return Math.round(result * 1e6) / 1e6;
}
