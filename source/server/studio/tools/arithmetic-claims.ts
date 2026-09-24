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
const EXPR = `${NUM}(?:\\s*[${OPS}]\\s*${NUM})*`;
/** Egyenlőség-LÁNC: `a op b = c op d = e` — a tanulói lépéssor („40 – 18 + 4 = 22 + 4 = 26") is ilyen. */
const CHAIN = new RegExp(`(${EXPR})((?:\\s*=\\s*${EXPR})+)(?!\\d|[.,]\\d)`, "g");

function toNumber(s: string): number { return Number(s.replace(",", ".")); }

/** Evaluate `a op b op c …` with · : before + −; a lone number is itself; null when inexact/unparsable. */
export function evaluateExpression(expr: string): number | null {
  if (/[()[\]]/.test(expr)) return null;
  const tokens = expr.match(new RegExp(`${NUM}|[${OPS}]`, "g"));
  if (!tokens || tokens.length % 2 === 0) return null;
  if (tokens.length === 1) { const n = toNumber(tokens[0]); return Number.isNaN(n) ? null : n; }
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

/**
 * Every false equality in the text, as "bal = jobb (helyesen: x)". Mérve (regressziós futás
 * 94a5ccf9): a „40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 26" tanulói lépéssort a páronkénti
 * olvasat („40 – 18 + 4 = 22") hamisnak vette és négy kísérlet után megölte a csomagot. A lánc
 * minden tagját kiértékeljük; csak akkor hiba, ha két SZOMSZÉDOS, kiértékelhető tag értéke eltér.
 */
export function falseArithmeticClaims(text: string): string[] {
  const problems: string[] = [];
  for (const m of text.matchAll(CHAIN)) {
    // Mérve élesben (2026-09-24, felvételi-feladatlap lecke): „(500 + 480) : 2 = 490” — a minta a zárójel
    // UTÁNI „2 = 490”-nél is elindult (szóköz választotta el), és hamis állításnak vette. Ha a lánc előtt
    // (szóközt átugorva) művelet vagy zárójel áll, a kifejezés közepéről indult: nem ítéljük meg.
    const prefix = text.slice(0, m.index!).trimEnd();
    const lead = prefix.slice(-1);
    // Egy műveleti jel csak akkor jelent kifejezés-közepet, ha előtte szám vagy zárójel áll — a „Nem:”
    // címke kettőspontja nem osztás (a section-patch teszt „Nem: 12 · 2 = 48 téves” esete).
    const beforeLead = prefix.slice(0, -1).trimEnd().slice(-1);
    if (lead === "(" || lead === ")" || (new RegExp(`[${OPS}=]`).test(lead) && /[\d)]/.test(beforeLead))) continue;
    const segments = `${m[1]}${m[2]}`.split("=").map((seg) => seg.trim());
    // 3. élő futás (run e79ab9da): „980 Ft : 2 = 490 Ft” — a mértékegység töri meg a kifejezést, a
    // minta a „2 = 490”-től indult. Szám + mértékegység + műveleti jel előtt: ha az a szám maga nem
    // egy hosszabb kifejezés része, mértékegység nélkül értékeljük („980 : 2 = 490”); különben kihagyjuk.
    const unitLead = prefix.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*[\\p{L}%°²³/]{1,8}\\.?\\s*([${OPS}])$`, "u"));
    if (unitLead) {
      const head = prefix.slice(0, prefix.length - unitLead[0].length).trimEnd();
      const headLast = head.slice(-1);
      const headMid = /[()]/.test(headLast) || (new RegExp(`[${OPS}=]`).test(headLast)
        && new RegExp(`(?:[\\d)]|\\d\\s*[\\p{L}%°²³/]{1,8}\\.?)$`, "u").test(head.slice(0, -1).trimEnd()));
      if (headMid) continue;
      segments[0] = `${unitLead[1]} ${unitLead[2]} ${segments[0]}`;
    }
    // „1/15 = 4 km” (a teljes út 1/15-e 4 km): hányad = mennyiség jelölés, nem számolási állítás.
    const after = text.slice(m.index! + m[0].length);
    if (segments.length === 2 && /^\d+\s*\/\s*\d+$/.test(segments[0]) && /^\d+(?:[.,]\d+)?$/.test(segments[1]) && /^\s*[a-záéíóöőúüű%]/i.test(after)) continue;
    const values = segments.map((seg) => evaluateExpression(seg));
    for (let i = 1; i < segments.length; i++) {
      const a = values[i - 1], b = values[i];
      if (a === null || b === null) continue;
      if (Math.abs(a - b) > 1e-6) { problems.push(`${segments[i - 1].replace(/\s+/g, " ")} = ${segments[i].replace(/\s+/g, " ")} (helyesen: ${a})`); break; }
    }
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
