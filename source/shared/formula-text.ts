/**
 * Spec 2026-10-04-kepletbiztos-heurisztikak: KÖZÖS, képlet-tudatos szövegkezelés.
 *
 * Ismétlődő hibacsalád (#184, #185 és az átfogó audit 7 igazolt tétele): a szöveg-heurisztikák (≥3 karakteres szó, ≥8/≥20
 * karakteres idézet, a nem-alfanumerikus jelek törlése) a TISZTA KÉPLET fogalmakon és idézeteken („5+(+8)”, „-5-(-8)=+3”)
 * elvéreznek: a képlet szavai rövidek, a jelek eltűnnek, a „9-(+6)” és a „9-(-6)” azonossá válik. Ez a modul az egyetlen
 * hely, ahol a képlet-szöveget normalizáljuk és keressük; a szöveges ágak szabályai változatlanok.
 */

const OPS = "+\\-·×*:÷/";
const OP_RE = new RegExp(`[${OPS}]`);
const TRAILING_MARKS = /[✓✔✗✘.;,!?\s]+$/u;

/**
 * Mínuszjelek egységesítése; műveleti jel, zárójel és „=” mellől LEGFELJEBB EGY szóköz törlődik („9 − (−6)” → „9-(-6)”).
 * A sortörés kemény határ marad, a 2+ szóközös rés pedig elválasztó (OCR-oszlop, számegyenes: „-5   -2   0”) — különben a
 * szomszédos sorok/oszlopok képletei összeragadnának („-5-(-8)=+3⏎-5 -2” → „=+3-5-2”).
 */
export function formulaNormalize(s: string): string {
  return s
    .replace(/[−–—]/g, "-")
    .split(/\r?\n/)
    .map((line) => line
      .replace(new RegExp(`[ \\t\\u00a0]?([${OPS}=()])[ \\t\\u00a0]?`, "g"), "$1")
      .replace(/[ \t ]+/g, " ")
      .trim())
    .join("\n");
}

/** A képlet tiszta alakja (sorvégi pipa/iksz és írásjel nélkül); null, ha a szöveg nem képlet. */
export function formulaKey(s: string): string | null {
  const f = formulaNormalize(s).replace(TRAILING_MARKS, "");
  if (!/\d/.test(f) || /\s/.test(f) || /\p{L}/u.test(f)) return null;
  // legalább egy NEM vezető műveleti jel vagy „=” (a „-3” egy szám, nem képlet)
  if (!/=/.test(f) && !OP_RE.test(f.replace(/^[+-]/, ""))) return null;
  return f;
}

export const isFormulaText = (s: string): boolean => formulaKey(s) !== null;

/** A képlet előtti rész miatt a találat egy MÁSIK kifejezés része-e (más szám, előjel, megelőző művelet). */
function badBefore(prefix: string, formula: string): boolean {
  const c = prefix.slice(-1);
  if (!c) return false;
  const prev = prefix.slice(-2, -1);
  if (/\d/.test(c)) return true;
  if (/[.,]/.test(c)) return /\d/.test(prev); // tizedesjel csak szám után; a mondatvégi pont nem az
  if (/[+-]/.test(c)) return /^\d/.test(formula) || /[\d)]/.test(prev);
  if (/[·×*:÷/]/.test(c)) return /[\d)]/.test(prev); // „Számold ki:” címke-kettőspont nem osztás
  return false;
}

/** A képlet utáni rész miatt a találat egy hosszabb kifejezés része-e (szám, tizedes-folytatás, művelet + operandus). */
function badAfter(suffix: string, formula: string): boolean {
  if (/^\d/.test(suffix)) return true;
  if (/^[.,]\d/.test(suffix)) return /\d$/.test(formula);
  return new RegExp(`^[${OPS}][\\d(]`).test(suffix);
}

function findBounded(haystack: string, formula: string, from = 0): number {
  let at = haystack.indexOf(formula, from);
  while (at >= 0) {
    if (!badBefore(haystack.slice(0, at), formula) && !badAfter(haystack.slice(at + formula.length), formula)) return at;
    at = haystack.indexOf(formula, at + 1);
  }
  return -1;
}

/**
 * Tartalmazza-e a szöveg a képletet ÖNÁLLÓ kifejezésként, előjel-pontosan. Egyenlet-képletnél („-5-(-8)=+3”) a bal oldal és
 * az UGYANABBAN a láncban később álló „= jobb oldal” is egyezés („-5-(-8)=-5+8=+3”).
 */
export function containsFormula(text: string, formula: string): boolean {
  const f = formulaKey(formula);
  if (!f) return false;
  const h = formulaNormalize(text);
  if (findBounded(h, f) >= 0) return true;
  const eq = f.indexOf("=");
  if (eq <= 0) return false;
  const lhs = f.slice(0, eq);
  const rhsVariants = [...new Set([f.slice(eq + 1), f.slice(eq + 1).replace(/^\+/, "")])].filter(Boolean);
  let at = findBoundedLhs(h, lhs, 0);
  while (at >= 0) {
    const chain = h.slice(at + lhs.length).match(new RegExp(`^[\\d${OPS}=().,]*`))![0];
    for (const rhs of rhsVariants) {
      let k = chain.indexOf(`=${rhs}`);
      while (k >= 0) {
        if (!badAfter(chain.slice(k + 1 + rhs.length) + h.slice(at + lhs.length + chain.length), rhs)) return true;
        k = chain.indexOf(`=${rhs}`, k + 1);
      }
    }
    at = findBoundedLhs(h, lhs, at + 1);
  }
  return false;
}

/** Egyenlet bal oldala: előtte önálló, utána „=” következik (a lánc folytatása). */
function findBoundedLhs(haystack: string, lhs: string, from: number): number {
  let at = haystack.indexOf(lhs, from);
  while (at >= 0) {
    if (!badBefore(haystack.slice(0, at), lhs) && haystack[at + lhs.length] === "=") return at;
    at = haystack.indexOf(lhs, at + 1);
  }
  return -1;
}
