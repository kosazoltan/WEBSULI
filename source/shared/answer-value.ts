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
import { ATOM, SIGN, atomValue, evaluateExpression } from "./arithmetic-expression";

/** A lecke pontozási szerződésének verziója (`experience.scoringVersion`); hiányzó mező = 1 (régi kulcsszó-pontozó). */
export const LESSON_SCORING_VERSION = 2;
/** A kliens ezt küldi (`X-Websuli-Scoring`); a kiszolgáló az ennél újabb leckét nem adja ki némán (§C-V/1, 11). */
export const SCORING_HEADER = "x-websuli-scoring";

export type AnswerForm = "any" | "simplified-fraction" | "decimal" | "intermediate-step";
export type TypedAnswer = {
  /** Részfeladat jele („a”, „1”, „kerület”) — a válaszban a részeredmények SORRENDJE kötött (felcserélve hibás). */
  part: string;
  kind: "number" | "fraction" | "expression";
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

/** Az elvárt érték száma; null, ha nem értelmezhető (a bank-ellenőrzés ezt „undecidable”-ként bukja, pontozni nem szabad). */
export function referenceValue(value: string): number | null {
  const v = evaluateExpression(value.trim());
  return v === null || !Number.isFinite(v) ? null : v;
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

function unitPresent(answer: string, atomText: string, unit: string): boolean {
  const escaped = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return new RegExp(`${escaped(atomText)}\\s*${escaped(fold(unit))}`, "u").test(fold(answer));
}

/**
 * A tanulói válasz részeredményeinek ítélete. A válaszban az elvárt értékek SORRENDBEN keresendők (részfeladatonként
 * előre haladva); közbeeső, más szám (indoklás, részszámítás) megengedett, felcserélt részeredmény nem.
 */
export function gradeTypedAnswers(answer: string, answers: readonly TypedAnswer[]): TypedGrade {
  const verdicts: PartVerdict[] = [];
  const atoms = [...answer.matchAll(ATOM_RE)].map((m) => ({ text: m[0], index: m.index ?? 0, value: atomValue(m[0].replace(/^[−–]/, "-")) }));
  let cursor = 0;
  let undecidable = false;
  for (const expected of answers) {
    if (expected.form === "intermediate-step") {
      const want = normalizeExpressionText(expected.value);
      const ok = want.length > 0 && normalizeExpressionText(answer).includes(want);
      verdicts.push({ part: expected.part, ok, reason: ok ? "A kért lépés szerepel." : `A(z) ${expected.part} részhez a kért alak (${expected.value}) hiányzik — értékazonos más alak nem elég.` });
      continue;
    }
    const ref = referenceValue(expected.value);
    if (ref === null) { undecidable = true; verdicts.push({ part: expected.part, ok: false, undecidable: true, reason: `A(z) ${expected.part} rész referenciaértéke nem értelmezhető.` }); continue; }
    let found = -1;
    for (let i = cursor; i < atoms.length; i++) {
      const a = atoms[i];
      if (Number.isNaN(a.value) || Math.abs(a.value - ref) > 1e-6 * Math.max(1, Math.abs(ref))) continue;
      if (expected.form === "simplified-fraction" && !isSimplifiedFraction(a.text)) continue;
      if (expected.form === "decimal" && !isDecimalForm(a.text)) continue;
      if (expected.unit && !unitPresent(answer, a.text, expected.unit)) continue;
      found = i; break;
    }
    if (found >= 0) { cursor = found + 1; verdicts.push({ part: expected.part, ok: true, reason: "Helyes érték." }); }
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
  const chains = [...task.q.matchAll(new RegExp(`(?:${SIGN}(?=\\d))?(?:${ATOM})(?:\\s*[+\\-−–·×*:÷/]\\s*(?:${ATOM}))+`, "g"))].map((m) => m[0]).filter((c) => !/=/.test(c));
  for (const a of answers) {
    if (a.form === "intermediate-step") continue;
    const ref = referenceValue(a.value);
    if (ref === null) { problems.push(`${task.id ?? "feladat"}: a(z) ${a.part} rész referenciaértéke („${a.value}”) nem értelmezhető.`); continue; }
  }
  if (chains.length === answers.filter((a) => a.form !== "intermediate-step").length) {
    let i = 0;
    for (const a of answers) {
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
