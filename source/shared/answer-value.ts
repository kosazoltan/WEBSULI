/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U1, C13): TÍPUSOS válasz zárt (matematikai) feladatokhoz.
 *
 * Mért ok (H31): a kulcsszó-pontozó a „1/2” mintájú feladatra a „2/1” válasznak is teljes pontot adott (a törtvonal és a
 * műveleti jel elveszett a normalizálásban, az alternatíva szavai sorrend nélkül illeszkedtek); a rubrika hibás értéket
 * is elfogadott („52” a 72 mellett — H1). Itt az érték dönt: részfeladatonként (`part`), pontos értékkel (tört egyszerűsítve,
 * előjel, tizedes), kért alakkal (`form`) és mértékegységgel (`unit`). A szöveges részt továbbra is a `required` méri.
 *
 * Szándékosan import-szegény (csak a közös kifejezés-kiértékelő): a kliens és a szerver ugyanezt futtatja.
 */
import { ATOM, OPS, SIGN, atomValue, evaluateExpression } from "./arithmetic-expression";
import { formatPolynomial, isExpanded, isFactored, parsePolynomial, polyEquals, polynomialCandidates } from "./polynomial";

/** A lecke pontozási szerződésének verziója (`experience.scoringVersion`); hiányzó mező = 1 (régi kulcsszó-pontozó). */
export const LESSON_SCORING_VERSION = 5;
/** Számos típusos mező (`number`/`fraction`/`expression`, `requiredDistinct`). */
export const TYPED_SCORING_VERSION = 2;
/** Spec 2026-10-19-algebrai-referencia: betűs (`polynomial`) végeredmény — a régebbi kliens ezt nem ismeri. */
export const POLYNOMIAL_SCORING_VERSION = 3;
/** Spec 2026-10-20-s5-sorrendes-kifejezes: sorrendérzékeny kötelező kifejezés (`requiredPhrases`) — a régebbi kliens ezt nem ismeri. */
export const PHRASE_SCORING_VERSION = 4;
/** Spec 2026-10-20-s6-fogalom-sorrend: a fogalmak kötelező sorrendje (`requiredOrder`) — a régebbi kliens ezt nem ismeri. */
export const ORDER_SCORING_VERSION = 5;
/** A kliens ezt küldi (`X-Websuli-Scoring`); a kiszolgáló az ennél újabb leckét nem adja ki némán (§C-V/1, 11). */
export const SCORING_HEADER = "x-websuli-scoring";

export type AnswerForm = "any" | "simplified-fraction" | "decimal" | "intermediate-step" | "expanded" | "factored";
export type TypedAnswer = {
  /** Részfeladat jele („a”, „1”, „kerület”) — a válaszban a részeredmények SORRENDJE kötött (felcserélve hibás). */
  part: string;
  kind: "number" | "fraction" | "expression" | "polynomial";
  /** Az elvárt érték szövege: „17/12”, „-3”, „12,5”, vagy `intermediate-step`-nél a kért köztes kifejezés („35 + 64 − 12”). */
  value: string;
  /** Kért mértékegység a szám után („cm²”, „°C”, „Ft”); ha van, kötelező. */
  unit?: string;
  form?: AnswerForm;
};
export type PartVerdict = { part: string; ok: boolean; reason: string; undecidable?: boolean };
export type TypedGrade = { total: number; correct: number; verdicts: PartVerdict[]; undecidable: boolean };

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A típusos referencia KIFEJEZÉSNYELVE (U1 végrehajtás 2. pont): egész, tizedes, közönséges és vegyes tört, `+ − · × * : ÷ /`,
 * ZÁRÓJEL, előjel. Külön a közös `evaluateExpression`-től (review #159): az a bankszöveg állításait szűri, és a zárójeles
 * állítást szándékosan nem ítéli meg („5 – (–6) = 11”); a referencia viszont egyetlen, teljes egészében kiértékelendő
 * kifejezés. `valid`: a szöveg maradék nélkül a nyelv része; `value`: az értéke (null, ha pl. nem pontos az osztás).
 */
export function parseReferenceExpression(expr: string): { valid: boolean; value: number | null } {
  const tokens = expr.match(new RegExp(`${ATOM}|[${OPS}()]|\\S`, "g")) ?? [];
  let pos = 0;
  const invalid = { valid: false, value: null };
  const peek = () => tokens[pos];
  const isOp = (t: string | undefined, set: RegExp) => t !== undefined && t.length === 1 && set.test(t);
  const factor = (): number | null | undefined => {
    const t = peek();
    if (t === undefined) return undefined;
    if (/^[-−–]$/.test(t)) { pos++; const v = factor(); return v === undefined || v === null ? v : -v; }
    // Mért (2026-10-04, run 69cacab5, negatív számok): a „+3” előjeles alak a 7. osztályos jelölés — az egyoperandusú plusz
    // nélkül a referencia „nem értelmezhető” lett, és minden ilyen bankcsomag bukott kísérletet ért.
    if (t === "+") { pos++; return factor(); }
    if (t === "(") { pos++; const v = expression(); if (peek() !== ")") return undefined; pos++; return v; }
    if (new RegExp(`^(?:${ATOM})$`).test(t)) { pos++; const v = atomValue(t); return Number.isNaN(v) ? null : v; }
    return undefined;
  };
  const term = (): number | null | undefined => {
    let left = factor();
    while (isOp(peek(), /[·×*:÷/]/)) {
      const op = tokens[pos++]; const right = factor();
      if (left === undefined || right === undefined) return undefined;
      if (left === null || right === null) { left = null; continue; }
      if (/[:÷/]/.test(op)) { left = right === 0 || Math.abs((left / right) * right - left) > 1e-9 ? null : left / right; } else left = left * right;
    }
    return left;
  };
  const expression = (): number | null | undefined => {
    let left = term();
    while (isOp(peek(), /[+\-−–]/)) {
      const op = tokens[pos++]; const right = term();
      if (left === undefined || right === undefined) return undefined;
      left = left === null || right === null ? null : op === "+" ? left + right : left - right;
    }
    return left;
  };
  const value = expression();
  if (value === undefined || pos !== tokens.length || !tokens.length) return invalid;
  return { valid: true, value: value === null || !Number.isFinite(value) ? null : Math.round(value * 1e6) / 1e6 };
}

/** Az elvárt érték száma; null, ha nem értelmezhető (a bank-ellenőrzés ezt „undecidable”-ként bukja, pontozni nem szabad). */
// Élő mérés (job 35370b32, 2026-10-01): a modell szám típust írt a `value` mezőbe; a zod a típushiba MELLETT is lefuttatja a
// séma `superRefine`-jét, ahol a `.trim()` kivételt dobott és az egész lépés összeomlott — a nem-szöveg érték nem értelmezhető.
export function referenceValue(value: unknown): number | null {
  return typeof value === "string" ? parseReferenceExpression(value.trim()).value : null;
}
/** `intermediate-step` referencia: a kért köztes állapot maga is a kifejezésnyelv mondata legyen (review #159: „eredmény” nem az). */
export const isExpressionText = (value: unknown): boolean => typeof value === "string" && parseReferenceExpression(value.trim()).valid;

/** A típusos rész referenciája értelmezhető-e (a séma, a csomag-ellenőrzés és a pontozó EGY szabálya). */
export function isValidReference(a: Pick<TypedAnswer, "kind" | "value" | "form">): boolean {
  if (a.kind === "polynomial") return typeof a.value === "string" && parsePolynomial(a.value) !== null;
  return a.form === "intermediate-step" ? isExpressionText(a.value) : referenceValue(a.value) !== null;
}

/** A `pos` pozíción (szóköz után) kezdődő mértékegység vége, vagy null (kis- és nagybetű, szóköz nem számít). */
function unitAfter(answer: string, pos: number, unit: string): number | null {
  const want = fold(unit).replace(/\s+/g, "");
  const rest = answer.slice(pos);
  const lead = rest.length - rest.trimStart().length;
  let i = lead, got = "";
  while (i < rest.length && got.length < want.length) { if (!/\s/.test(rest[i])) got += fold(rest[i]); i++; }
  return got === want && !/[\p{L}\d]/u.test(rest[i] ?? "") ? pos + i : null;
}

/** Betűs végeredmény ítélete: a válasz polinom-jelöltjei közül a `from`-tól az első, értékazonos és a kért alakú. */
function findPolynomial(answer: string, expected: TypedAnswer, from: number): { index: number; end: number; reason?: string } {
  const ref = parsePolynomial(expected.value);
  if (!ref) return { index: -1, end: from };
  const candidates = polynomialCandidates(answer);
  let sameValueWrongForm = false;
  let wrongUnit = false;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].start < from) continue;
    const c = candidates[i].parsed;
    if (ref.hasVariable && !c.hasVariable) continue;
    if (!polyEquals(c.poly, ref.poly)) continue;
    const form = expected.form ?? "expanded";
    if (form === "expanded" && !isExpanded(c)) { sameValueWrongForm = true; continue; }
    if (form === "factored" && !isFactored(c, candidates[i].text)) { sameValueWrongForm = true; continue; }
    // Review #319: a kért mértékegység a betűs eredmény után is kötelező („2x cm²”).
    if (expected.unit) {
      const unit = unitAfter(answer, candidates[i].end, expected.unit);
      if (unit === null) { wrongUnit = true; continue; }
      return { index: i, end: unit };
    }
    return { index: i, end: candidates[i].end };
  }
  if (wrongUnit && !sameValueWrongForm) return { index: -1, end: from, reason: `A(z) ${expected.part} rész eredménye a(z) ${expected.unit} mértékegységgel hiányzik vagy hibás.` };
  const wanted = (expected.form ?? "expanded") === "factored" ? "szorzattá alakított (zárójeles)" : "kifejtett, összevont";
  return { index: -1, end: from, reason: sameValueWrongForm ? `A(z) ${expected.part} részhez ${wanted} alakot várunk.` : undefined };
}

/**
 * A pontozott ablak: csak az első `words` szó (szó = szám vagy betűsor — a pontozó 1. szabálya). A típusos érték is csak
 * ebben kereshető (review #159: az 500. szó utáni helyes érték nem érhet pontot).
 */
export function answerWindow(answer: string, words = 500): string {
  let n = 0;
  for (const m of answer.matchAll(/\d+(?:[.,]\d+)?|\p{L}+/gu)) if (++n === words) return answer.slice(0, (m.index ?? 0) + m[0].length);
  return answer;
}

/** Egyszerűsített közönséges tört: `p/q`, q > 1, lnko(p, q) = 1 (a „2/4” és a „0,5” nem az). */
export function isSimplifiedFraction(atom: string): boolean {
  const m = atom.replace(/\s+/g, "").match(/^[-−–]?(\d+)\/(\d+)$/);
  if (!m) return false;
  const p = Number(m[1]), q = Number(m[2]);
  return q > 1 && gcd(p, q) === 1;
}
/** Tizedes vagy egész alak (törtvonal nélkül). */
export const isDecimalForm = (atom: string): boolean => /^[-−–]?\d+(?:[.,]\d+)?$/.test(atom.replace(/[ \u00a0\u202f]/g, ""));

/**
 * Kifejezés műveleti állapotának összevetése (`intermediate-step`): a szóköz és az azonos jelentésű jel nem különbség
 * (`·`/`×`/`*`, `:`/`÷`, `−`/`–`/`-`, tizedesvessző/pont), de a műveletek szerkezete igen: „35 + 64 − 12” ≠ „35 + 8 · 8 − 12”.
 */
export function normalizeExpressionText(s: string): string {
  return s.replace(/[×*]/g, "·").replace(/÷/g, ":").replace(/[−–]/g, "-").replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, "");
}

const ATOM_RE = new RegExp(`(?:${SIGN}(?=\\d))?(?:${ATOM})`, "g");

/**
 * A kért köztes állapot a válasz normalizált szövegében TOKENHATÁRON álljon (review #159, P1): a „35+64-12” nem lehet a
 * „135+64-12” vagy a „35+64-120” részlete — a szomszédos karakter nem lehet számjegy, tizedespont vagy törtvonal.
 */
export function containsExpressionState(haystack: string, want: string): boolean {
  if (!want.length) return false;
  const boundary = (c: string | undefined) => c === undefined || !/[\d./]/.test(c);
  for (let i = haystack.indexOf(want); i >= 0; i = haystack.indexOf(want, i + 1)) {
    if (boundary(haystack[i - 1]) && boundary(haystack[i + want.length])) return true;
  }
  return false;
}

function unitPresent(answer: string, atomText: string, unit: string): boolean {
  const escaped = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return new RegExp(`${escaped(atomText)}\\s*${escaped(fold(unit))}`, "u").test(fold(answer));
}

/**
 * A tanulói válasz részeredményeinek ítélete. A válaszban az elvárt értékek SORRENDBEN keresendők (részfeladatonként
 * előre haladva); közbeeső, más szám (indoklás, részszámítás) megengedett, felcserélt részeredmény nem.
 */
export function gradeTypedAnswers(rawAnswer: string, answers: readonly TypedAnswer[]): TypedGrade {
  const verdicts: PartVerdict[] = [];
  const answer = answerWindow(rawAnswer);
  const atoms = [...answer.matchAll(ATOM_RE)].map((m) => ({ text: m[0], index: m.index ?? 0, value: atomValue(m[0].replace(/^[−–]/, "-")) }));
  let cursor = 0;
  let undecidable = false;
  // Review #319: EGY közös szövegpozíció a vegyes (betűs + számos) részeredmények sorrendjéhez.
  let textPos = 0;
  for (const expected of answers) {
    if (expected.kind === "polynomial") {
      if (!isValidReference(expected)) { undecidable = true; verdicts.push({ part: expected.part, ok: false, undecidable: true, reason: `A(z) ${expected.part} rész referenciaértéke nem értelmezhető.` }); continue; }
      const hit = findPolynomial(answer, expected, textPos);
      if (hit.index >= 0) { textPos = hit.end; verdicts.push({ part: expected.part, ok: true, reason: "Helyes kifejezés." }); }
      else verdicts.push({ part: expected.part, ok: false, reason: hit.reason ?? `A(z) ${expected.part} rész eredménye hiányzik vagy hibás.` });
      continue;
    }
    if (expected.form === "intermediate-step") {
      if (!isExpressionText(expected.value)) { undecidable = true; verdicts.push({ part: expected.part, ok: false, undecidable: true, reason: `A(z) ${expected.part} rész kért köztes alakja nem értelmezhető.` }); continue; }
      const ok = containsExpressionState(normalizeExpressionText(answer), normalizeExpressionText(expected.value));
      verdicts.push({ part: expected.part, ok, reason: ok ? "A kért lépés szerepel." : `A(z) ${expected.part} részhez a kért alak (${expected.value}) hiányzik — értékazonos más alak nem elég.` });
      continue;
    }
    const ref = referenceValue(expected.value);
    if (ref === null) { undecidable = true; verdicts.push({ part: expected.part, ok: false, undecidable: true, reason: `A(z) ${expected.part} rész referenciaértéke nem értelmezhető.` }); continue; }
    let found = -1;
    for (let i = cursor; i < atoms.length; i++) {
      const a = atoms[i];
      if (a.index < textPos) continue;
      if (Number.isNaN(a.value) || Math.abs(a.value - ref) > 1e-6 * Math.max(1, Math.abs(ref))) continue;
      if (expected.form === "simplified-fraction" && !isSimplifiedFraction(a.text)) continue;
      if (expected.form === "decimal" && !isDecimalForm(a.text)) continue;
      if (expected.unit && !unitPresent(answer, a.text, expected.unit)) continue;
      found = i; break;
    }
    if (found >= 0) { cursor = found + 1; textPos = atoms[found].index + atoms[found].text.length; verdicts.push({ part: expected.part, ok: true, reason: "Helyes érték." }); }
    else verdicts.push({ part: expected.part, ok: false, reason: expected.form === "simplified-fraction" ? `A(z) ${expected.part} rész eredményét egyszerűsített törtként várjuk.` : expected.unit ? `A(z) ${expected.part} rész eredménye a(z) ${expected.unit} mértékegységgel hiányzik vagy hibás.` : `A(z) ${expected.part} rész eredménye hiányzik vagy hibás.` });
  }
  return { total: answers.length, correct: verdicts.filter((v) => v.ok).length, verdicts, undecidable };
}

/**
 * A REFERENCIA igazsága (Astra 4–6. kör: a típusos mező nem javítja a hibás számítást — determinisztikus újraszámolás kell):
 * ha a kérdésben egyértelmű, `=` nélküli kifejezés áll, annak értéke egyezzen a megadott válaszértékkel. Több részfeladat:
 * a kérdés kifejezései sorrendben a részekhez. Nem értelmezhető/több-értelmű kérdés: nincs ítélet (a bank-ellenőr dolga).
 */
export function referenceValueProblems(task: { id?: string; q: string; typedAnswers?: readonly TypedAnswer[] }): string[] {
  const answers = task.typedAnswers ?? [];
  if (!answers.length) return [];
  const problems: string[] = [];
  // Spec 2026-10-04-kepletbiztos-heurisztikak (7. pont): a zárójelhez TAPADÓ részlánc („Mennyi 5-8-(-2)?” → „5-8”) a teljes kifejezés töredéke — nem
  // ítélhető (a zárójeles kifejezést ez a függvény dokumentáltan nem ítéli meg; a bank-ellenőr dolga).
  const chains = [...task.q.matchAll(new RegExp(`(?:${SIGN}(?=\\d))?(?:${ATOM})(?:\\s*[+\\-−–·×*:÷/]\\s*(?:${ATOM}))+`, "g"))]
    .filter((m) => {
      const before = task.q.slice(0, m.index ?? 0), after = task.q.slice((m.index ?? 0) + m[0].length);
      // review #186: CSAK a kifejezéshez tapadó zárójel számít — közvetlenül nyitó zárójel előtte, vagy záró zárójel + művelet;
      // utána művelet + nyitó zárójel, vagy közvetlenül záró zárójel. Az „a) 5-8” jelölés és az „5-8 (indokold)” megjegyzés nem.
      return !/\(\s*$|\)\s*[+\-−–·×*:÷/]\s*$/.test(before) && !/^\s*[+\-−–·×*:÷/]\s*\(|^\s*\)/.test(after);
    })
    .map((m) => m[0]).filter((c) => !/=/.test(c));
  // Spec 2026-10-19-algebrai-referencia: a betűs rész referenciája polinom; ha a kérdésben pontosan annyi betűs kifejezés áll, ahány
  // betűs rész, azok sorrendben egyezzenek a referenciával (a hibás kifejtés csomaghiba).
  const polyParts = answers.filter((a) => a.kind === "polynomial");
  for (const a of polyParts) if (!isValidReference(a)) problems.push(`${task.id ?? "feladat"}: a(z) ${a.part} rész referenciaértéke („${a.value}”) nem értelmezhető polinom.`);
  const asked = polynomialCandidates(task.q).filter((c) => c.parsed.hasVariable && /[+\-−–·×*/^()²³]/.test(c.text));
  if (polyParts.length && asked.length === polyParts.length) {
    polyParts.forEach((a, i) => {
      const ref = parsePolynomial(a.value);
      // Csak a valódi átalakítás (zárójeles kérdés → kifejtett válasz, kifejtett kérdés → szorzat) ítélhető; a „Melyik kifejezés
      // négyzete az x² + 10x + 25?” jellegű kérdés referenciája szándékosan nem azonos a kérdés kifejezésével.
      const form = a.form ?? "expanded";
      const transform = form === "expanded" ? asked[i].parsed.parens : form === "factored" ? isExpanded(asked[i].parsed) : false;
      if (ref && transform && !polyEquals(ref.poly, asked[i].parsed.poly)) problems.push(`${task.id ?? "feladat"}: a(z) ${a.part} rész referenciája (${a.value}) nem egyenlő a kérdés kifejezésével (${asked[i].text} = ${formatPolynomial(asked[i].parsed.poly)}).`);
    });
  }
  const numeric = answers.filter((a) => a.kind !== "polynomial");
  for (const a of numeric) {
    if (a.form === "intermediate-step") { if (!isExpressionText(a.value)) problems.push(`${task.id ?? "feladat"}: a(z) ${a.part} rész kért köztes alakja („${a.value}”) nem a kifejezésnyelv mondata.`); continue; }
    const ref = referenceValue(a.value);
    if (ref === null) { problems.push(`${task.id ?? "feladat"}: a(z) ${a.part} rész referenciaértéke („${a.value}”) nem értelmezhető.`); continue; }
  }
  if (numeric.length && chains.length === numeric.filter((a) => a.form !== "intermediate-step").length) {
    let i = 0;
    for (const a of numeric) {
      if (a.form === "intermediate-step") continue;
      const computed = evaluateExpression(chains[i++]);
      const ref = referenceValue(a.value);
      if (computed !== null && ref !== null && Math.abs(computed - ref) > 1e-6 * Math.max(1, Math.abs(ref))) {
        problems.push(`${task.id ?? "feladat"}: a(z) ${a.part} rész referenciája (${a.value}) eltér a kérdés kifejezésének értékétől (${chains[i - 1].replace(/\s+/g, " ")} = ${computed}).`);
      }
    }
  }
  return problems;
}

/** Kiszolgáló-oldali kapu (§C-V/1, 11): a fejlécet nem küldő kliens a legrégebbi támogatott verzió. */
export function scoringGate(neededVersion: number | undefined, headerValue: string | undefined): { ok: true } | { ok: false; status: 409; message: string; requiredScoringVersion: number } {
  const supported = Number.parseInt(headerValue ?? "", 10) || 1;
  const needed = neededVersion ?? 1;
  if (needed <= supported) return { ok: true };
  return { ok: false, status: 409, requiredScoringVersion: needed, message: "Ez a lecke újabb pontozót használ, mint a megnyitott oldal. Frissítsd az oldalt (Ctrl+F5), és nyisd meg újra." };
}
