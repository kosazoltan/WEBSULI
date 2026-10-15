import { ATOM, EXPR, SIGN, evaluateExpression, normalizeSignedParens } from "./arithmetic-expression";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md), döntés 1: determinisztikus egy-helyes-válasz őr.
 *
 * Tulajdonosi hibajelzés: egy feladatlap 8. kérdésénél („Melyik szám osztható 9-cel?”) mind a négy opció
 * (234, 567, 891, 648) helyes volt. Egyválasztós tételben PONTOSAN EGY opció lehet igaz, és az a kulcs. Ez az őr a
 * biztosan kiszámolható osztályokat nézi (oszthatóság, tiszta számtani kérdés, egyenértékű opciók); minden más
 * esetben hallgat (üres lista) — a nem kiszámolható tartalmat a bank-ellenőr opciónkénti ítélete fedi.
 */

export type SingleChoiceItem = { prompt: string; options: readonly string[]; correctIndex: number };

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();
const textKey = (s: string) => norm(s).replace(/[.!?;:,]+$/u, "").trim();
const INTEGER = new RegExp(`^(${SIGN})?(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)$`);
/** Egyetlen szám (egész, tizedes, tört, vegyes tört), előjellel. */
const LONE_NUMBER = new RegExp(`^(?:${SIGN})?(?:${ATOM})$`);

/** Egész opció („648”, „1 024”, „−12”); `null`, ha nem egész szám. */
function integerOf(option: string): number | null {
  const t = option.normalize("NFC").trim();
  const m = t.match(INTEGER);
  if (!m) return null;
  const n = Number(m[2].replace(/[ \u00a0\u202f]/g, ""));
  return Number.isSafeInteger(n) ? (m[1] ? -n : n) : null;
}

/** Számopció értéke: egész, tizedes (vesszővel is), tört, vegyes tört; `null`, ha nem biztosan szám. */
function numberOf(option: string): number | null {
  const t = option.normalize("NFC").trim();
  // „1.000” — ponttal tagolt ezres vagy tizedes? Nem olvasható biztosan.
  if (/^[-−–]?\d{1,3}(?:\.\d{3})+$/.test(t)) return null;
  if (!LONE_NUMBER.test(t)) return null;
  return evaluateExpression(t);
}

/**
 * Spec 2026-10-04-bank-tartalek-es-elojel (mért: „-8-6=-14” és „-8-(+6)=-14” egy kvíz két opciója): IGAZ egyenlőség-opció
 * értéke — pontosan egy `=`, mindkét oldal kiértékelhető (előjeles zárójel összevonva; a jobb oldal vezető `+` jele
 * eredmény-jelölés), és a két oldal egyenlő. Hamis vagy nem kiértékelhető egyenlőség → `null` (a hamis disztraktor jogos).
 */
function trueEqualityValue(option: string): number | null {
  const sides = option.normalize("NFC").trim().replace(/[.!]+$/u, "").split("=");
  if (sides.length !== 2 || !sides.every((side) => /\d/.test(side) && /^[\d\s+\-−–·×*:÷/().,]+$/.test(side))) return null;
  const [left, right] = sides.map((side) => evaluateExpression(normalizeSignedParens(side).replace(/^\s*\+\s*/, "")));
  return left !== null && right !== null && Math.abs(left - right) < 1e-6 ? left : null;
}

const listed = (options: readonly string[], indexes: number[]) => indexes.map((i) => `„${options[i].trim()}”`).join(", ");

/** Ahol a kérdés a szám ALAKJÁRÓL szól (egyszerűsítés, bővítés, írásmód), az egyenlő értékű opciók jogosak. */
const ABOUT_FORM = /egyszerűs|bővít|alak|formá|írásmód|felír|tizedes tört|közönséges tört|vegyes tört|vegyes szám/u;
/** Spec 2026-10-05-s3-katalogus-bank (mérve a szülő-ellenőrzött korpuszon): „Melyik NEM egyenlő 1/2-vel?” — itt az egyenértékű
 *  disztraktorok (2/4, 3/6, 4/8) SZÁNDÉKOSAK; az érték-egyezés nem hiba (a szó szerinti ismétlődés továbbra is az). */
const NEGATED_EQUALITY = /(?<!\p{L})nem\s+(?:egyenlő|egyenértékű|ugyanannyi|ugyanakkora|azonos értékű)/u;
/** Spec 2026-10-05-s3-katalogus-bank (mérve: „24/36 = ?” → 4/6 | 2/3 | 12/18 | „Mind helyes”): ha van gyűjtő-opció, az egyenértékű
 *  alakok SZÁNDÉKOSAK (épp az a kérdés, hogy mindegyik helyes-e). */
// Review #193 (7): az „Egyik sem” NEM gyűjtő-opció — nem teszi szándékossá a másik opciók érték-egyezését; számértéke nincs,
// ezért az érték-összehasonlításból magától kimarad, a többi opció összehasonlítása marad.
const AGGREGATE_OPTION = /^(?:mind(?:egyik|en|három|kettő|négy)?\s+(?:helyes|igaz|jó)|mindegyik|mindhárom|mindkettő)/u;

function duplicateProblems(prompt: string, options: readonly string[]): string[] {
  const problems: string[] = [];
  const byText = new Map<string, number>();
  const byValue = new Map<number, number>();
  const byEquality = new Map<number, number>();
  const compareValues = !ABOUT_FORM.test(norm(prompt)) && !NEGATED_EQUALITY.test(norm(prompt)) && !options.some((o) => AGGREGATE_OPTION.test(norm(o)));
  options.forEach((option, i) => {
    const key = textKey(option);
    const value = compareValues ? numberOf(option) : null;
    const equality = compareValues && value === null ? trueEqualityValue(option) : null;
    const twin = byText.get(key) ?? (value === null ? undefined : byValue.get(value)) ?? (equality === null ? undefined : byEquality.get(equality));
    if (twin !== undefined) problems.push(`a(z) ${listed(options, [twin, i])} opció ugyanazt jelenti — az opciók legyenek különbözők.`);
    if (!byText.has(key)) byText.set(key, i);
    if (value !== null && !byValue.has(value)) byValue.set(value, i);
    if (equality !== null && !byEquality.has(equality)) byEquality.set(equality, i);
  });
  return problems;
}

/** A pontosan-egy szabály egy kiszámolt teljesítő-listára. */
function exactlyOne(item: SingleChoiceItem, satisfying: number[], what: string): string[] {
  if (satisfying.length !== 1) {
    return [`${satisfying.length} opció ${what}${satisfying.length ? `: ${listed(item.options, satisfying)}` : ""} — pontosan egy helyes opció kell.`];
  }
  if (satisfying[0] !== item.correctIndex) {
    return [`a kulcs „${item.options[item.correctIndex]?.trim()}”, de csak „${item.options[satisfying[0]].trim()}” ${what}.`];
  }
  return [];
}

/** Oszthatóság: „Melyik szám osztható 9-cel?”, „Melyik szám NEM osztható 3-mal?”, „Válaszd ki a 4-gyel osztható számot!”. */
function divisibilityProblems(item: SingleChoiceItem): string[] {
  const p = norm(item.prompt);
  if ((p.match(/oszthat/g) ?? []).length !== 1) return [];
  if (!/(?<!\p{L})melyik(?!\p{L})|válaszd ki|jelöld|karikázd/u.test(p)) return [];
  // További feltétel vagy más kérdésfajta → nem biztosan kiszámolható (hallgat).
  if (/(?<![\p{L}\d])(?:hány|mennyi|ha|és|de|vagy|valamint|illetve|páros|páratlan|prím\p{L}*|négyzetszám|maradék\p{L}*|között)(?![\p{L}\d])|(?<!\p{L})leg\p{L}+|jegy/u.test(p)) return [];
  const m = p.match(/(\d+)\s*-\s*\p{L}{2,4}\s+(?:nem\s+)?oszthat|oszthat[óo]k?\s+(\d+)\s*-\s*\p{L}{2,4}(?!\p{L})/u);
  if (!m) return [];
  const divisor = Number(m[1] ?? m[2]);
  if (!Number.isSafeInteger(divisor) || divisor < 2) return [];
  const numbersInPrompt = p.match(/\d+/g) ?? [];
  if (numbersInPrompt.some((n) => Number(n) !== divisor)) return [];
  const values = item.options.map(integerOf);
  if (values.some((v) => v === null)) return [];
  // Review R3 (2026-09-29): a tagadás csak az állításhoz kötve érvényes („nem osztható”, „NEM 3-mal osztható”) —
  // egy szabad „Nem kell indokolni.” mondat nem fordítja meg a kérdést.
  const negated = /(?<!\p{L})nem\s+(?:\d+\s*-\s*\p{L}{2,4}\s+)?oszthat/u.test(p);
  const satisfying = values.flatMap((v, i) => ((v! % divisor === 0) !== negated ? [i] : []));
  const suffix = (m[0].match(/-\s*(\p{L}{2,4})/u) ?? [])[1] ?? "";
  return exactlyOne(item, satisfying, `${negated ? "NEM osztható" : "osztható"} ${divisor}-${suffix}`);
}

const LEAD = "(?:mennyi(?:\\s+(?:az?\\s+)?(?:eredménye|értéke))?|számold\\s+ki|számítsd\\s+ki)";
const ARITHMETIC = new RegExp(`^(?:${LEAD}\\s*:?\\s*)?(${EXPR})\\s*(?:=\\s*)?\\??\\s*$`, "iu");

/** Tiszta számtani kérdés: „Mennyi 12 · 3?”, „7 + 8 = ?”, „Számold ki: 3/4 + 1/4 =”. */
function arithmeticProblems(item: SingleChoiceItem): string[] {
  const m = item.prompt.normalize("NFC").trim().match(ARITHMETIC);
  // Egy magányos szám vagy tört nem számítási kérdés.
  if (!m || LONE_NUMBER.test(m[1].trim())) return [];
  const result = evaluateExpression(m[1]);
  if (result === null) return [];
  const values = item.options.map(numberOf);
  if (values.some((v) => v === null)) return [];
  const satisfying = values.flatMap((v, i) => (Math.abs(v! - result) < 1e-6 ? [i] : []));
  return exactlyOne(item, satisfying, `egyenlő a helyes eredménnyel (${m[1].trim()} = ${result})`);
}

/**
 * Tételgyár T5 (docs/specs/2026-10-15-tetelgyar-t5-szamolas-programbol-vegrehajtas.md): a mondatba ágyazott és az előjeles zárójeles kifejezés.
 * Mért (T6.0): „Melyik eredmény tartozik a -8-(-6) kifejezéshez?” kulcs -14 (helyes -2) — a tiszta-forma őr nem ismerte fel.
 */
// Az ATOM legfelső szinten alternáció („a|b”) — csoportba kell zárni, különben a zárójeles ág szétesik.
const SIGNED_TERM = `(?:\\(\\s*[+\\-−–]?\\s*(?:${ATOM})\\s*\\)|(?:${ATOM}))`;
const EMBEDDED_EXPR = new RegExp(`(?<![\\p{L}\\d.,/])(?:[\\-−–](?=\\s*[\\d(]))?\\s*${SIGNED_TERM}(?:\\s*[+\\-−–·×*:÷]\\s*${SIGNED_TERM})+(?![\\p{L}\\d]|\\s*-\\s*\\p{L})`, "gu");
/** Az eredményre kérdez — és nem feltételes / összehasonlító / tagadó kérdés (akkor hallgatunk). */
const ASKS_RESULT = /(?<!\p{L})(?:eredmény\p{L}*|érték\p{L}*|mennyi|egyenlő|tartozik|kapjuk|kapod|lesz)(?!\p{L})/u;
// T5.2 mérés (`docs/measurements/2026-10-15-t5-szamolos-kulcs.json`): a RÉSZeredményre kérdező tétel („az osztás részeredménye”, „közbülső
// eredmény”, „az első eredmény”) nem a teljes kifejezés értékét kéri — hallgatunk.
const NOT_COMPUTABLE = /(?<!\p{L})(?:nem|ha|nagyobb|kisebb|között|legalább|legfeljebb|kerekít\p{L}*|becsül\p{L}*|közelít\p{L}*|hány\s+(?:szám|opció|lépés)|részeredmény\p{L}*|közbülső|közbenső|első|először|utolsó|lépés\p{L}*)(?!\p{L})/u;
/**
 * T5.2 mérés: a CSOPORTOSÍTÓ zárójel („(148 + 6) · 8”, „9 + [(12 – 8) · 3]”) mellett a kereső csak a zárójel belsejét látná — hallgatunk.
 * Csak az előjeles szám zárójele („(-6)”, „(+8)”) megengedett; ha az összevonás után zárójel marad, az csoportosító.
 */
function hasGroupingBrackets(text: string): boolean {
  return /[()[\]]/.test(text.normalize("NFC").replace(/\(\s*[+\-−–]?\s*\d+(?:[.,]\d+)?\s*\)/g, ""));
}

/** Kiszámolt érték az előjeles zárójel összevonásával; `null`, ha nem biztosan kiszámolható. */
function signedExpressionValue(expr: string): number | null {
  const flat = normalizeSignedParens(expr.normalize("NFC").trim()).replace(/^\s*\+\s*/, "");
  if (/[()[\]]/.test(flat)) return null;
  return evaluateExpression(flat);
}
/** Számopció „+6” alakban is. */
function signedNumberOf(option: string): number | null {
  return numberOf(option.normalize("NFC").trim().replace(/^\+\s*(?=\d)/, ""));
}
function expressionsIn(text: string): string[] {
  return [...text.normalize("NFC").matchAll(EMBEDDED_EXPR)].map((m) => m[0].trim()).filter((e) => new RegExp(`\\d\\s*\\)?\\s*[+\\-−–·×*:÷]\\s*\\(?\\s*[+\\-−–]?\\s*\\d`).test(e));
}

/** E1: a kérdésben pontosan egy kiszámolható kifejezés, az eredményére kérdez, a válaszok számok. */
function embeddedArithmeticProblems(item: SingleChoiceItem): string[] {
  const p = norm(item.prompt);
  if (!ASKS_RESULT.test(p) || NOT_COMPUTABLE.test(p) || hasGroupingBrackets(item.prompt)) return [];
  const exprs = expressionsIn(item.prompt);
  if (exprs.length !== 1) return [];
  const result = signedExpressionValue(exprs[0]);
  if (result === null) return [];
  const values = item.options.map(signedNumberOf);
  if (values.some((v) => v === null)) return [];
  const satisfying = values.flatMap((v, i) => (Math.abs(v! - result) < 1e-6 ? [i] : []));
  return exactlyOne(item, satisfying, `egyenlő a kiszámolt eredménnyel (${exprs[0]} = ${result})`);
}

/** E2: a válaszok kifejezések, a kérdés egy eredményre kérdez („Melyik kifejezés … eredménye +6?”). */
function reverseArithmeticProblems(item: SingleChoiceItem): string[] {
  const p = norm(item.prompt);
  if (!/(?<!\p{L})melyik\s+(?:kifejezés|művelet|számítás|kivonás|összeadás|szorzás|osztás)/u.test(p) || !ASKS_RESULT.test(p) || NOT_COMPUTABLE.test(p) || hasGroupingBrackets(item.prompt) || item.options.some(hasGroupingBrackets)) return [];
  const numbers = [...item.prompt.normalize("NFC").matchAll(new RegExp(`(?<![\\p{L}\\d])([+\\-−–]?)\\s*((?:${ATOM}))(?![\\d/])`, "gu"))];
  if (numbers.length !== 1 || expressionsIn(item.prompt).length) return [];
  const target = (/[\-−–]/.test(numbers[0][1]) ? -1 : 1) * (evaluateExpression(numbers[0][2]) ?? NaN);
  if (!Number.isFinite(target)) return [];
  const values = item.options.map((o) => (expressionsIn(o).length === 1 && expressionsIn(o)[0].replace(/\s/g, "") === o.normalize("NFC").trim().replace(/[.!?]+$/u, "").replace(/\s/g, "") ? signedExpressionValue(o.replace(/[.!?]+$/u, "")) : null));
  if (values.some((v) => v === null)) return [];
  const satisfying = values.flatMap((v, i) => (Math.abs(v! - target) < 1e-6 ? [i] : []));
  return exactlyOne(item, satisfying, `értéke ${target}`);
}

/** Every provable violation of "exactly one option is true and it is the key"; [] when not computable. */
export function singleChoiceProblems(item: SingleChoiceItem): string[] {
  if (typeof item.prompt !== "string" || !Array.isArray(item.options) || !item.options.every((o) => typeof o === "string")) return [];
  const duplicates = duplicateProblems(item.prompt, item.options);
  if (duplicates.length) return duplicates.map((d) => `Egyválasztós tétel: ${d}`);
  // T5: a tiszta forma előnyt élvez — ha az ítél, a beágyazott/fordított nem ad második leletet.
  const pure = arithmeticProblems(item);
  const arithmetic = pure.length || item.prompt.normalize("NFC").trim().match(ARITHMETIC) ? pure : [...embeddedArithmeticProblems(item), ...reverseArithmeticProblems(item)];
  return [...divisibilityProblems(item), ...arithmetic].map((d) => `Egyválasztós tétel: ${d}`);
}

type ChoiceLike = { id?: string; question?: string; prompt?: string; options?: unknown; correctIndex?: unknown };
export type SingleChoiceFinding = { path: string; id?: string; problems: string[] };

function asItem(raw: ChoiceLike, promptKey: "question" | "prompt"): SingleChoiceItem | null {
  const prompt = raw[promptKey];
  if (typeof prompt !== "string" || !Array.isArray(raw.options) || !Number.isInteger(raw.correctIndex)) return null;
  if (!raw.options.every((o): o is string => typeof o === "string")) return null;
  return { prompt, options: raw.options, correctIndex: raw.correctIndex as number };
}

/** A lecke minden egyválasztós tétele útvonallal: check blokkok, kvíz, választós módszerek. */
export function lessonSingleChoiceProblems(lesson: {
  sections?: ReadonlyArray<{ blocks: ReadonlyArray<{ kind?: string } & ChoiceLike> }>;
  experience?: { quiz?: ReadonlyArray<ChoiceLike>; methods?: ReadonlyArray<ChoiceLike> } | null;
}): SingleChoiceFinding[] {
  const found: SingleChoiceFinding[] = [];
  const add = (path: string, item: SingleChoiceItem | null, id?: string) => {
    const problems = item ? singleChoiceProblems(item) : [];
    if (problems.length) found.push({ path, ...(id ? { id } : {}), problems });
  };
  lesson.sections?.forEach((section, i) => section.blocks.forEach((block, j) => {
    if (block.kind === "check") add(`sections[${i}].blocks[${j}]`, asItem(block, "question"));
  }));
  lesson.experience?.quiz?.forEach((q, k) => add(`experience.quiz[${k}]`, asItem(q, "question"), q.id));
  lesson.experience?.methods?.forEach((m, k) => add(`experience.methods[${k}]`, asItem(m, "prompt"), m.id));
  return found;
}
