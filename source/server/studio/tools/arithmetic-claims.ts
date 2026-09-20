/**
 * Eszköz (2026-09-20): a bank szövegeiben szereplő ARITMETIKAI ÁLLÍTÁSOK gépi ellenőrzése.
 *
 * Mérve négy futásban (quiz.10 „154 · 8 = 1238", quiz.16 „12 · 2 = 48", quiz.60 „194·5 = 970",
 * tasks.24 lépéssor): az olcsó bankmodell hibás részszámításokat ír a magyarázatba vagy a
 * mintába, a lektor ezeket egyenként blokkolja, és minden ilyen egy javító kört ér. Egy
 * „a op b = c" alakú állítás determinisztikusan ellenőrizhető; ami hamis, az a csomag-
 * ellenőrzésben bukik, a lektor előtt. Csak egész és tizedes számokkal, + − · : műveletekkel,
 * balról jobbra több tagú kifejezésre is (szorzás/osztás elsőbbségével). Zárójeles kifejezést
 * nem értékel (nem állít róla semmit).
 */

const OPS = "+\\-−–·×*:÷/";
const NUM = "\\d+(?:[.,]\\d+)?";
/** `a op b (op c …) = d` — a felsorolás végén a jobb oldal egy szám. */
// A mondatvégi pont nem tizedesjel: csak számjegy vagy „,5"/„.5" folytatás zárja ki a találatot.
const CLAIM = new RegExp(`(${NUM}(?:\\s*[${OPS}]\\s*${NUM})+)\\s*=\\s*(${NUM})(?!\\d|[.,]\\d)`, "g");

function toNumber(s: string): number { return Number(s.replace(",", ".")); }

/** Evaluate `a op b op c …` with · : before + −; null when a division is inexact or unparsable. */
export function evaluateExpression(expr: string): number | null {
  if (/[()[\]]/.test(expr)) return null;
  const tokens = expr.match(new RegExp(`${NUM}|[${OPS}]`, "g"));
  if (!tokens || tokens.length < 3 || tokens.length % 2 === 0) return null;
  const values: number[] = [toNumber(tokens[0])];
  const ops: string[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const value = toNumber(tokens[i + 1]);
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

/** Every false `a op b = c` claim in the text, as "a op b = c (helyesen: x)". */
export function falseArithmeticClaims(text: string): string[] {
  const problems: string[] = [];
  for (const m of text.matchAll(CLAIM)) {
    // A zárójeles rész előtti/utáni tag nem tartozik ide: ha a találat előtt közvetlenül „(" vagy
    // utána „)" áll, a kifejezés része lehet egy nagyobbnak — kihagyjuk.
    const before = text.slice(Math.max(0, m.index! - 1), m.index!);
    if (before === "(" || before === ")") continue;
    const expected = evaluateExpression(m[1]);
    if (expected === null) continue;
    const stated = toNumber(m[2]);
    if (Math.abs(expected - stated) > 1e-6) problems.push(`${m[1].replace(/\s+/g, " ")} = ${m[2]} (helyesen: ${expected})`);
  }
  return problems;
}

/** Bank items' texts with false arithmetic, for the packet validator. */
export function arithmeticClaimProblems(packet: { methods?: Array<{ id: string; prompt?: string; answer?: string }>; tasks?: Array<{ id: string; q?: string; sample?: string }>; quiz?: Array<{ id: string; question?: string; feedbackPerOption?: string[] }> }): string[] {
  const problems: string[] = [];
  for (const m of packet.methods ?? []) for (const bad of falseArithmeticClaims(`${m.prompt ?? ""}\n${m.answer ?? ""}`)) problems.push(`${m.id}: hibás számítás a módszerben: ${bad}`);
  for (const t of packet.tasks ?? []) for (const bad of falseArithmeticClaims(`${t.q ?? ""}\n${t.sample ?? ""}`)) problems.push(`${t.id}: hibás számítás a feladatban vagy a mintában: ${bad}`);
  for (const q of packet.quiz ?? []) for (const bad of falseArithmeticClaims(`${q.question ?? ""}\n${(q.feedbackPerOption ?? []).join("\n")}`)) problems.push(`${q.id}: hibás számítás a kérdésben vagy a magyarázatban: ${bad}`);
  return problems;
}
